import { existsSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { findCatalogFiles, parseSpec } from './catalog.mjs';
import { loadConfig, saveConfig, storePaths } from './store.mjs';
import { nowIso, readJSON, readText, rel, walk, writeJSON } from './util.mjs';
import { detectLanguage } from './vocab.mjs';

const FRAMEWORKS = [
	['@sveltejs/kit', 'sveltekit'],
	['next', 'nextjs'],
	['nuxt', 'nuxt'],
	['@remix-run/react', 'remix'],
	['react-router', 'react-router'],
	['@angular/core', 'angular'],
	['astro', 'astro'],
	['@solidjs/start', 'solid-start'],
	['svelte', 'svelte'],
	['vue', 'vue'],
	['react', 'react'],
	['vite', 'vite']
];

const RUNNERS = [
	['@playwright/test', 'playwright'],
	['playwright', 'playwright'],
	['vitest', 'vitest'],
	['jest', 'jest'],
	['cypress', 'cypress'],
	['webdriverio', 'webdriverio'],
	['@wdio/cli', 'webdriverio'],
	['@testing-library/dom', 'testing-library'],
	['msw', 'msw']
];

const SPEC_FILE = /\.(spec|test|e2e)\.(m?[jt]sx?)$/;
const COMMON_E2E_DIRS = ['e2e', 'tests', 'test', 'playwright', 'tests-e2e', 'cypress/e2e'];

function detectPackageManager(root) {
	if (existsSync(join(root, 'bun.lock')) || existsSync(join(root, 'bun.lockb'))) return 'bun';
	if (existsSync(join(root, 'pnpm-lock.yaml'))) return 'pnpm';
	if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
	if (existsSync(join(root, 'package-lock.json'))) return 'npm';
	return existsSync(join(root, 'package.json')) ? 'npm' : null;
}

function literal(text, key) {
	return text.match(new RegExp(`\\b${key}\\s*:\\s*['"\`]([^'"\`$]+)['"\`]`))?.[1] ?? null;
}

export function findPlaywrightConfig(root) {
	const names = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs', 'playwright.config.cjs', 'playwright.config.mts'];
	for (const n of names) if (existsSync(join(root, n))) return join(root, n);
	// One level down covers `apps/web/playwright.config.ts`-style layouts.
	for (const dir of ['e2e', 'tests', 'apps', 'packages']) {
		const found = walk(join(root, dir), { match: (_f, name) => names.includes(name), maxDepth: 3, maxFiles: 5 });
		if (found.length) return found[0];
	}
	return null;
}

function parsePlaywrightConfig(root, file) {
	const text = readText(file, '');
	const base = dirname(file);
	const resolveRel = (p) => (p ? rel(root, join(base, p)) : null);
	const projectNames = [...text.matchAll(/\bname\s*:\s*['"`]([\w.-]+)['"`]/g)].map((m) => m[1]);
	return {
		configFile: rel(root, file),
		testDir: resolveRel(literal(text, 'testDir')),
		outputDir: resolveRel(literal(text, 'outputDir')),
		htmlReportDir: resolveRel(
			text.match(/\[\s*['"]html['"]\s*,\s*\{[^}]*outputFolder\s*:\s*['"`]([^'"`]+)/)?.[1] ?? null
		),
		baseURL: literal(text, 'baseURL') ?? (/\bbaseURL\s*:/.test(text) ? '(computed)' : null),
		projects: projectNames.length ? [...new Set(projectNames)] : /\bprojects\s*:/.test(text) ? ['(computed)'] : [],
		hasProjectsGeneratedInCode: /projects\s*:\s*\[\s*\.\.\./.test(text),
		webServer: literal(text, 'command') ?? (/\bwebServer\s*:/.test(text) ? '(computed)' : null),
		tsconfig: resolveRel(literal(text, 'tsconfig')),
		retries: text.match(/\bretries\s*:\s*([^,\n]+)/)?.[1]?.trim() ?? null,
		workers: text.match(/\bworkers\s*:\s*([^,\n]+)/)?.[1]?.trim() ?? null
	};
}

/** Playwright artifact folders configured by the project; never walked as test sources. */
export function artifactDirs(root, config) {
	return [config.e2e.outputDir, config.e2e.htmlReportDir].filter(Boolean).map((d) => join(root, d));
}

export function findSpecFiles(root, config) {
	const testDir = config.e2e.testDir;
	const opts = { match: (_f, name) => SPEC_FILE.test(name), exclude: artifactDirs(root, config) };
	if (testDir) return walk(join(root, testDir), opts);
	const dirs = COMMON_E2E_DIRS.map((d) => join(root, d)).filter(existsSync);
	return dirs.flatMap((d) => walk(d, opts));
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The script that runs the whole suite: runs `playwright test` without narrowing flags. */
function detectRunScript(pkgScripts) {
	return (
		Object.entries(pkgScripts)
			.filter(([, v]) => /playwright\s+test/.test(v) && !/--(project|grep|ui|debug|headed)\b|-g\s|show-report|codegen/.test(v))
			.map(([k]) => k)
			.sort((a, b) => a.length - b.length)[0] ?? null
	);
}

/**
 * Maps top-level test folders to Playwright projects when the names line up
 * (`e2e/admin` ↔ `admin`, `e2e/web-store` ↔ `web`), plus the script that runs it.
 */
function detectScopes(testDir, areas, projects, pkgScripts) {
	const scopes = [];
	for (const project of projects) {
		const area = areas.find((a) => a === project || a.startsWith(`${project}-`) || a.startsWith(`${project}_`));
		if (!area) continue;
		const re = new RegExp(`--project[= ]["']?${escapeRe(project)}["']?(\\s|$)`);
		const script = Object.entries(pkgScripts).find(([, v]) => re.test(v))?.[0] ?? null;
		scopes.push({ path: `${testDir}/${area}`, project, script });
	}
	return scopes;
}

/** Route list for file-based routers. Params become `:name`, route groups are dropped. */
function detectRoutes(root, frameworks) {
	const routes = [];
	const toPath = (segments) =>
		'/' +
		segments
			.filter((s) => !/^\(.*\)$/.test(s) && s !== '' && s !== 'index')
			.map((s) => s.replace(/^\[\.\.\.(\w+)\]$/, '*$1').replace(/^\[\[?(\w+)(?:=\w+)?\]?\]$/, ':$1'))
			.join('/');

	if (frameworks.includes('sveltekit')) {
		const base = join(root, 'src', 'routes');
		for (const f of walk(base, { match: (_f, n) => n === '+page.svelte' })) {
			const segs = rel(base, dirname(f)).split('/').filter((s) => s !== '.');
			routes.push({ path: toPath(segs), file: rel(root, f) });
		}
	}
	if (frameworks.includes('nextjs')) {
		for (const appDir of ['app', 'src/app']) {
			const base = join(root, appDir);
			for (const f of walk(base, { match: (_f, n) => /^page\.(t|j)sx?$/.test(n) })) {
				routes.push({ path: toPath(rel(base, dirname(f)).split('/').filter((s) => s !== '.')), file: rel(root, f) });
			}
		}
		for (const pagesDir of ['pages', 'src/pages']) {
			const base = join(root, pagesDir);
			for (const f of walk(base, { match: (_f, n) => /\.(t|j)sx?$/.test(n) && !n.startsWith('_') })) {
				const r = rel(base, f).replace(/\.(t|j)sx?$/, '');
				if (r.startsWith('api/')) continue;
				routes.push({ path: toPath(r.split('/')), file: rel(root, f) });
			}
		}
	}
	if (frameworks.includes('nuxt')) {
		for (const pagesDir of ['pages', 'app/pages']) {
			const base = join(root, pagesDir);
			for (const f of walk(base, { match: (_f, n) => n.endsWith('.vue') })) {
				routes.push({ path: toPath(rel(base, f).replace(/\.vue$/, '').split('/')), file: rel(root, f) });
			}
		}
	}
	return routes;
}

/**
 * Marks a route as covered when its last two static segments appear in any spec or page
 * object. Heuristic: catches `page.goto(\`${BASE}/orders/history\`)`, misses routes
 * built from variables only.
 */
function markRouteCoverage(routes, e2eText) {
	for (const r of routes) {
		const statics = r.path.split('/').filter((s) => s && !s.startsWith(':') && !s.startsWith('*'));
		const needle = statics.slice(-2).join('/');
		r.covered = needle ? e2eText.includes(needle) : false;
	}
	return routes;
}

function findRuleDocs(root) {
	const out = [];
	for (const f of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.github/copilot-instructions.md', 'CONTRIBUTING.md']) {
		if (existsSync(join(root, f))) out.push(f);
	}
	for (const dir of ['.agent/rules', '.agent/workflows', '.cursor/rules', '.github/instructions', '.windsurf/rules', '.clinerules']) {
		const full = join(root, dir);
		if (existsSync(full)) out.push(...walk(full, { match: (_f, n) => /\.(md|mdc)$/.test(n), maxDepth: 2 }).map((f) => rel(root, f)));
	}
	if (existsSync(join(root, 'docs'))) {
		out.push(
			...walk(join(root, 'docs'), { match: (_f, n) => /(e2e|qa|test|playwright)/i.test(n) && n.endsWith('.md'), maxDepth: 4 }).map((f) =>
				rel(root, f)
			)
		);
	}
	return out;
}

function envKeys(root, testDir) {
	const files = ['.env.example', '.env.sample', testDir && join(testDir, '.env.example')].filter(Boolean);
	const keys = {};
	for (const f of files) {
		const text = readText(join(root, f));
		if (!text) continue;
		// Names only: values in example files can still be real credentials.
		keys[f] = [...text.matchAll(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/gm)].map((m) => m[1]);
	}
	return keys;
}

/** Reads the project and writes `.qa-kit/index/structure.json`; fills empty config fields. */
export function scan(root, { write = true } = {}) {
	const pkg = readJSON(join(root, 'package.json'), {});
	const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
	const frameworks = [...new Set(FRAMEWORKS.filter(([d]) => deps[d]).map(([, n]) => n))];
	const testRunners = [...new Set(RUNNERS.filter(([d]) => deps[d]).map(([, n]) => n))];

	const pwFile = findPlaywrightConfig(root);
	const playwright = pwFile ? { ...parsePlaywrightConfig(root, pwFile), version: deps['@playwright/test'] ?? deps.playwright ?? null } : null;

	const config = loadConfig(root);
	const e2e = config.e2e;
	if (!e2e.testDir) {
		e2e.testDir = playwright?.testDir ?? COMMON_E2E_DIRS.find((d) => existsSync(join(root, d))) ?? null;
	}
	if (!e2e.configFile && playwright) e2e.configFile = playwright.configFile;
	if (!e2e.outputDir && playwright?.outputDir) e2e.outputDir = playwright.outputDir;
	if (!e2e.htmlReportDir && playwright?.htmlReportDir) e2e.htmlReportDir = playwright.htmlReportDir;

	const scripts = Object.fromEntries(
		Object.entries(pkg.scripts ?? {}).filter(([k, v]) => /e2e|playwright|test/i.test(k) || /playwright/.test(v))
	);
	if (!e2e.runScript) e2e.runScript = detectRunScript(pkg.scripts ?? {});
	if (!e2e.projects?.length) {
		// Computed `projects` arrays are invisible to a regex; `--project=x` in scripts is not.
		const fromScripts = Object.values(pkg.scripts ?? {}).flatMap((v) => [...v.matchAll(/--project[= ]([\w.-]+)/g)].map((m) => m[1]));
		const literalNames = (playwright?.projects ?? []).filter((n) => !n.startsWith('('));
		e2e.projects = [...new Set([...literalNames, ...fromScripts])];
	}

	const specFiles = findSpecFiles(root, config);
	const specs = specFiles.map((f) => parseSpec(readText(f, ''), rel(root, f), config.catalog.idPattern));
	const tests = specs.flatMap((s) => s.tests);

	const testRoot = e2e.testDir ? join(root, e2e.testDir) : null;
	const e2eFiles = testRoot ? walk(testRoot, { match: (_f, n) => /\.(m?[jt]sx?)$/.test(n), exclude: artifactDirs(root, config) }) : specFiles;
	const pageObjects = e2eFiles.filter((f) => /\.page\.(m?[jt]s)$|\/pages?\/[^/]+\.(m?[jt]s)$|\/page-objects?\//.test(f));
	const e2eTexts = e2eFiles.map((f) => [f, readText(f, '')]);
	const fixtures = e2eTexts.filter(([, t]) => /\b(test|base)\.extend\s*[<(]/.test(t)).map(([f]) => rel(root, f));

	const importCounts = {};
	for (const s of specFiles) {
		for (const m of readText(s, '').matchAll(/from\s+['"]([^'"]+)['"]/g)) {
			if (m[1].startsWith('.')) continue;
			importCounts[m[1]] = (importCounts[m[1]] ?? 0) + 1;
		}
	}
	const topImports = Object.entries(importCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
	if (!e2e.fixturesImport) {
		const custom = topImports.find(([src]) => src !== '@playwright/test' && /fixture|test|e2e/i.test(src));
		e2e.fixturesImport = custom?.[0] ?? (topImports.length ? '@playwright/test' : null);
	}

	const aliases = {};
	const tsconfigPath = playwright?.tsconfig ?? (e2e.testDir ? join(e2e.testDir, 'tsconfig.json') : null);
	const tsconfig = tsconfigPath ? readJSON(join(root, tsconfigPath)) : null;
	if (tsconfig?.compilerOptions?.paths) Object.assign(aliases, tsconfig.compilerOptions.paths);

	const routes = markRouteCoverage(detectRoutes(root, frameworks), e2eTexts.map(([, t]) => t).join('\n'));
	if (!config.language) config.language = detectLanguage(tests.map((t) => t.title));
	// Read catalogs with English plus the language the tests are written in.
	if (!config.catalog.languages && config.language) config.catalog.languages = [...new Set(['en', config.language])];

	const tagCounts = {};
	for (const t of tests) for (const tag of t.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;

	const areas = testRoot && existsSync(testRoot)
		? readdirSync(testRoot, { withFileTypes: true })
				.filter((d) => d.isDirectory() && !d.name.startsWith('.') && !artifactDirs(root, config).includes(join(testRoot, d.name)))
				.map((d) => d.name)
		: [];
	if (!e2e.scopes?.length && e2e.testDir) e2e.scopes = detectScopes(e2e.testDir, areas, e2e.projects, pkg.scripts ?? {});
	if (!e2e.mutationTags?.length) e2e.mutationTags = Object.keys(tagCounts).filter((t) => /mutat|destruct|write|danger|dirty|crud/i.test(t));
	const env = envKeys(root, e2e.testDir);
	if (!e2e.protectedEnv?.length) {
		e2e.protectedEnv = [...new Set(Object.values(env).flat())].filter((k) => /ALLOW_|MUTAT|DESTRUCT|DANGER|UNSAFE|PROD(UCTION)?\b/i.test(k));
	}
	const catalogs = findCatalogFiles(root, config);
	if (!config.catalog.fileNames && catalogs.length) config.catalog.fileNames = [...new Set(catalogs.map((f) => basename(f)))];
	if (!config.app.name) config.app.name = pkg.name ?? basename(root);

	const structure = {
		generatedAt: nowIso(),
		name: pkg.name ?? basename(root),
		packageManager: detectPackageManager(root),
		frameworks,
		testRunners,
		playwright,
		scripts,
		e2e: {
			testDir: e2e.testDir,
			specFiles: specFiles.length,
			tests: tests.length,
			testsWithId: tests.filter((t) => t.id).length,
			skippedOrFixme: tests.filter((t) => t.modifier && t.modifier !== 'slow').length,
			tags: tagCounts,
			pageObjects: pageObjects.map((f) => rel(root, f)),
			fixtures,
			topImports,
			aliases,
			areas,
			scopes: e2e.scopes,
			catalogs: catalogs.length
		},
		routes: {
			count: routes.length,
			covered: routes.filter((r) => r.covered).length,
			items: routes
		},
		ruleDocs: findRuleDocs(root),
		envKeys: env,
		language: config.language
	};

	if (write) {
		writeJSON(storePaths(root).structure, structure);
		saveConfig(root, config);
	}
	return structure;
}

export function formatScan(s) {
	const lines = [
		`Project: ${s.name} (${s.packageManager ?? 'no package manager'})`,
		`Frameworks: ${s.frameworks.join(', ') || '-'} | Test runners: ${s.testRunners.join(', ') || '-'}`
	];
	if (s.playwright) {
		lines.push(
			`Playwright ${s.playwright.version ?? ''}: ${s.playwright.configFile}, testDir=${s.playwright.testDir ?? '-'}, outputDir=${s.playwright.outputDir ?? '-'}, projects=${s.playwright.projects.join(', ') || '-'}`
		);
	} else lines.push('Playwright config: not found');
	lines.push(
		`E2E: ${s.e2e.specFiles} spec files, ${s.e2e.tests} tests (${s.e2e.testsWithId} with case ID, ${s.e2e.skippedOrFixme} skip/fixme/only), ${s.e2e.pageObjects.length} page objects, fixtures: ${s.e2e.fixtures.join(', ') || '-'}`
	);
	if (Object.keys(s.e2e.tags).length) lines.push(`Tags: ${Object.entries(s.e2e.tags).map(([k, v]) => `${k}×${v}`).join(', ')}`);
	if (s.e2e.areas.length) lines.push(`Test areas: ${s.e2e.areas.join(', ')}`);
	if (s.e2e.scopes?.length) lines.push(`Scopes: ${s.e2e.scopes.map((x) => `${x.path} → ${x.project}${x.script ? ` (${x.script})` : ''}`).join('; ')}`);
	lines.push(`Routes: ${s.routes.count} detected, ${s.routes.covered} referenced by tests (heuristic)`);
	if (s.ruleDocs.length) lines.push(`Rule/QA docs: ${s.ruleDocs.join(', ')}`);
	if (Object.keys(s.scripts).length) lines.push(`Scripts: ${Object.keys(s.scripts).join(', ')}`);
	lines.push(`Test language: ${s.language ?? 'unknown'}`);
	return lines.join('\n');
}
