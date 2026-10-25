import { dirname, join } from 'node:path';
import { loadConfig, storePaths } from './store.mjs';
import { findSpecFiles } from './scan.mjs';
import { nowIso, readText, rel, walk, writeJSON } from './util.mjs';
import { vocabulary } from './vocab.mjs';

/* ------------------------------------------------------------------ specs */

const TEST_CALL =
	/\b(test|it)(?:\.(only|skip|fixme|fail|slow))?\(\s*(['"`])((?:\\.|(?!\3)[\s\S])*?)\3/g;
const DESCRIBE_CALL = /\b(?:test\.)?describe(?:\.(?:serial|parallel|only|skip))?\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

function lineAt(text, index) {
	let line = 1;
	for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
	return line;
}

/** Test titles, IDs, tags, and issue annotations from one spec file (regex, no TS parser). */
export function parseSpec(text, file, idPattern) {
	const idRe = new RegExp(`^\\s*(${idPattern})\\b`);
	const tagsIn = (head) => {
		const tags = new Set();
		for (const t of head.matchAll(/['"`](@[\w-]+)['"`]/g)) tags.add(t[1]);
		for (const t of head.matchAll(/\b([A-Z][A-Z0-9_]*)_TAG\b/g)) tags.add('@' + t[1].toLowerCase());
		return tags;
	};
	const optionsHead = (from) => {
		const after = text.slice(from, from + 600);
		if (!/^\s*,/.test(after)) return null;
		return after.slice(0, after.search(/async\s*\(|\(\s*\)\s*=>|=>|\bfunction\b/) + 1 || 400);
	};
	// Tags on test.describe(…, { tag }) apply to every test inside it.
	const describes = [...text.matchAll(DESCRIBE_CALL)].map((m) => {
		const head = optionsHead(m.index + m[0].length);
		return { at: m.index, title: m[2], tags: head ? [...tagsIn(head)] : [] };
	});
	const tests = [];
	for (const m of text.matchAll(TEST_CALL)) {
		const title = m[4];
		// `test.describe(` is matched by DESCRIBE_CALL; `test.step(` / `test.use(` are not tests.
		const head = optionsHead(m.index + m[0].length);
		if (head == null) continue;
		const enclosing = describes.filter((d) => d.at < m.index).at(-1);
		const tags = tagsIn(head);
		for (const t of enclosing?.tags ?? []) tags.add(t);
		for (const t of title.matchAll(/(?:^|\s)(@[\w-]+)/g)) tags.add(t[1]);
		const annotations = [];
		const ann = head.match(/annotation\s*:\s*([\[{][\s\S]*?[\]}])\s*[,}]/);
		if (ann) for (const d of ann[1].matchAll(/description\s*:\s*['"`]([^'"`]+)/g)) annotations.push(d[1]);

		tests.push({
			file,
			line: lineAt(text, m.index),
			title,
			id: title.match(idRe)?.[1] ?? null,
			modifier: m[2] ?? null,
			describe: enclosing?.title ?? null,
			tags: [...tags],
			annotations
		});
	}
	return { file, describes: describes.map((d) => d.title), tests };
}

/* ---------------------------------------------------------------- catalog */

function splitRow(line) {
	const cells = [];
	let cur = '';
	let inCode = false;
	const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
	for (let i = 0; i < body.length; i++) {
		const ch = body[i];
		if (ch === '`') inCode = !inCode;
		if (ch === '\\' && body[i + 1] === '|') {
			cur += '|';
			i++;
			continue;
		}
		if (ch === '|' && !inCode) {
			cells.push(cur.trim());
			cur = '';
		} else cur += ch;
	}
	cells.push(cur.trim());
	return cells;
}

export function classifyAutomation(text = '', vocab = vocabulary()) {
	const t = text.trim();
	let status = 'unknown';
	if (vocab.automated.test(t) || /\.(spec|test|e2e)\.[mc]?[jt]sx?/.test(t)) status = 'automated';
	else if (vocab.todo.test(t)) status = 'todo';
	else if (vocab.manual.test(t)) status = 'manual';
	else if (/\bspec\b/i.test(t)) status = 'automated';
	let knownIssue = null;
	if (vocab.suspected.test(t)) knownIssue = 'suspected';
	else if (vocab.confirmed.test(t)) knownIssue = 'confirmed';
	const tags = [...t.matchAll(/@[\w-]+/g)].map((m) => m[0]);
	return { status, knownIssue, tags };
}

/** Parses one `test-cases.md`-style catalog: title, route, sections with case tables, findings. */
export function parseCatalog(text, file, idPattern, vocab = vocabulary()) {
	const idRe = new RegExp(`^(?:\\*\\*)?(${idPattern})(?:\\*\\*)?$`);
	const anyId = new RegExp(`\\b(${idPattern})\\b`, 'g');
	const lines = text.split('\n');
	const title = (lines.find((l) => /^#\s/.test(l)) ?? '').replace(/^#\s+/, '').trim() || null;
	// First inline-code path in the intro, e.g. `/orders/:id` or `/{TENANT}/settings`.
	const intro = text.split(/^##\s/m)[0];
	const route = intro.match(/`(\/[^`\s]*)`/)?.[1] ?? null;

	const cases = [];
	const findings = [];
	let section = null;
	let inFindings = false;
	let findingsSub = null;
	let header = null;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const h = line.match(/^(#{2,4})\s+(.*)$/);
		if (h) {
			header = null;
			if (h[1] === '##') {
				section = h[2].trim();
				inFindings = vocab.findingsHeading.test(section);
				findingsSub = null;
			} else if (inFindings) findingsSub = h[2].trim();
			continue;
		}

		if (/^\s*\|/.test(line)) {
			const next = lines[i + 1] ?? '';
			if (!header && /^\s*\|?\s*:?-{3,}/.test(next)) {
				const names = splitRow(line);
				header = {};
				names.forEach((n, idx) => {
					for (const [key, re] of Object.entries(vocab.columns)) {
						if (header[key] === undefined && re.test(n.replace(/\*/g, '').trim())) {
							header[key] = idx;
							break;
						}
					}
				});
				if (header.id === undefined) header.id = 0;
				i++;
				continue;
			}
			if (header && !inFindings) {
				const cells = splitRow(line);
				const id = cells[header.id]?.replace(/`/g, '');
				if (!id || !idRe.test(id)) continue;
				const automation = header.automation !== undefined ? cells[header.automation] ?? '' : '';
				cases.push({
					id: id.replace(/\*/g, ''),
					section,
					line: i + 1,
					scenario: cells[header.scenario] ?? null,
					steps: header.steps !== undefined ? cells[header.steps] ?? null : null,
					expected: header.expected !== undefined ? cells[header.expected] ?? null : null,
					priority: header.priority !== undefined ? cells[header.priority] ?? null : null,
					automation,
					...classifyAutomation(automation, vocab)
				});
			}
			continue;
		}
		header = null;

		if (inFindings) {
			const item = line.match(/^(\d+)\.\s+(.*)$/) || line.match(/^[-*]\s+(.*)$/);
			if (item) {
				const body = item[2] ?? item[1];
				findings.push({
					n: item[2] !== undefined ? Number(item[1]) : null,
					group: findingsSub,
					line: i + 1,
					title: body.match(/\*\*(.+?)\*\*/)?.[1] ?? body.slice(0, 120),
					ids: [...new Set([...body.matchAll(anyId)].map((m) => m[1]))],
					text: body
				});
			} else if (findings.length && /^\s{2,}\S/.test(line)) {
				const f = findings.at(-1);
				f.text += ' ' + line.trim();
				for (const m of line.matchAll(anyId)) if (!f.ids.includes(m[1])) f.ids.push(m[1]);
			}
		}
	}
	return { file, title, route, cases, findings };
}

/* ------------------------------------------------------------------ index */

const CATALOG_NAME = /^(test[-_ ]?cases|testcases|cases|test[-_ ]?plan)\.md$|\.(cases|test-cases|testcases)\.md$/i;

export function findCatalogFiles(root, config) {
	const names = config.catalog.fileNames?.map((n) => n.toLowerCase());
	const base = config.e2e.testDir ? join(root, config.e2e.testDir) : root;
	return walk(base, {
		match: (_full, name) => (names ? names.includes(name.toLowerCase()) || CATALOG_NAME.test(name) : CATALOG_NAME.test(name))
	});
}

/**
 * Joins catalogs and specs by case ID. Writes `.qa-kit/index/test-cases.json` and returns it.
 * A spec test matches the catalog in its own folder (or a parent folder) first, then any
 * catalog that has the ID, so reused prefixes across pages stay separate.
 */
export function buildIndex(root, { write = true } = {}) {
	const config = loadConfig(root);
	const idPattern = config.catalog.idPattern;
	const vocab = vocabulary(config);

	const catalogs = findCatalogFiles(root, config).map((f) =>
		parseCatalog(readText(f, ''), rel(root, f), idPattern, vocab)
	);
	const specs = findSpecFiles(root, config).map((f) => parseSpec(readText(f, ''), rel(root, f), idPattern));
	const allTests = specs.flatMap((s) => s.tests);

	const testsById = new Map();
	for (const t of allTests) {
		if (!t.id) continue;
		if (!testsById.has(t.id)) testsById.set(t.id, []);
		testsById.get(t.id).push(t);
	}

	const cases = [];
	const drift = [];
	const claimed = new Set();
	const seen = new Map();

	for (const cat of catalogs) {
		const pageDir = dirname(cat.file);
		for (const c of cat.cases) {
			const key = `${pageDir}::${c.id}`;
			if (seen.has(key)) drift.push({ type: 'duplicate-id', id: c.id, page: pageDir, detail: `also at line ${seen.get(key)}` });
			seen.set(key, c.line);

			const candidates = testsById.get(c.id) ?? [];
			const local = candidates.filter((t) => t.file.startsWith(pageDir + '/'));
			const matches = local.length ? local : candidates.length === 1 ? candidates : [];
			matches.forEach((t) => claimed.add(t));

			if (c.status === 'automated' && matches.length === 0)
				drift.push({ type: 'missing-spec', id: c.id, page: pageDir, detail: `catalog says "${c.automation}" but no test title starts with ${c.id}` });
			if ((c.status === 'todo' || c.status === 'manual') && matches.length > 0)
				drift.push({ type: 'catalog-outdated', id: c.id, page: pageDir, detail: `marked "${c.automation}" but ${matches[0].file}:${matches[0].line} exists` });

			cases.push({
				id: c.id,
				page: pageDir,
				catalog: cat.file,
				catalogLine: c.line,
				pageTitle: cat.title,
				route: cat.route,
				section: c.section,
				scenario: c.scenario,
				steps: c.steps,
				expected: c.expected,
				priority: c.priority,
				automation: c.automation,
				status: c.status,
				knownIssue: c.knownIssue,
				tags: [...new Set([...c.tags, ...matches.flatMap((t) => t.tags)])],
				specs: matches.map(({ file, line, title, modifier, annotations }) => ({ file, line, title, modifier, annotations }))
			});
		}
	}

	const orphanTests = allTests
		.filter((t) => t.id && !claimed.has(t))
		.map(({ file, line, id, title }) => ({ file, line, id, title }));
	for (const t of orphanTests) drift.push({ type: 'spec-not-in-catalog', id: t.id, page: dirname(t.file), detail: `${t.file}:${t.line}` });

	const pageDirs = new Set([...catalogs.map((c) => dirname(c.file)), ...specs.map((s) => dirname(s.file))]);
	const pages = [...pageDirs].sort().map((dir) => {
		const cat = catalogs.find((c) => dirname(c.file) === dir);
		const pageCases = cases.filter((c) => c.page === dir);
		const pageSpecs = specs.filter((s) => dirname(s.file) === dir);
		return {
			dir,
			title: cat?.title ?? null,
			route: cat?.route ?? null,
			catalog: cat?.file ?? null,
			specs: pageSpecs.map((s) => s.file),
			tests: pageSpecs.reduce((n, s) => n + s.tests.length, 0),
			cases: pageCases.length,
			automated: pageCases.filter((c) => c.status === 'automated').length,
			todo: pageCases.filter((c) => c.status === 'todo').length,
			manual: pageCases.filter((c) => c.status === 'manual').length,
			knownIssues: pageCases.filter((c) => c.knownIssue).length,
			findings: cat?.findings.length ?? 0
		};
	});
	for (const p of pages)
		if (!p.catalog && p.tests > 0) drift.push({ type: 'page-without-catalog', id: null, page: p.dir, detail: `${p.tests} tests, no catalog` });

	const findings = catalogs.flatMap((c) => c.findings.map((f) => ({ page: dirname(c.file), catalog: c.file, ...f })));

	const index = {
		generatedAt: nowIso(),
		counts: {
			pages: pages.length,
			catalogs: catalogs.length,
			cases: cases.length,
			automated: cases.filter((c) => c.status === 'automated').length,
			todo: cases.filter((c) => c.status === 'todo').length,
			manual: cases.filter((c) => c.status === 'manual').length,
			knownIssues: cases.filter((c) => c.knownIssue).length,
			specFiles: specs.length,
			tests: allTests.length,
			testsWithoutId: allTests.filter((t) => !t.id).length,
			findings: findings.length,
			drift: drift.length
		},
		pages,
		cases,
		orphanTests,
		drift,
		findings
	};
	if (write) writeJSON(storePaths(root).cases, index);
	return index;
}

export function loadIndex(root) {
	const p = storePaths(root).cases;
	const text = readText(p);
	return text ? JSON.parse(text) : buildIndex(root);
}

/** Next free ID for a prefix across all catalogs and specs, e.g. `CHK` → `CHK-08`. */
export function nextId(root, prefix) {
	const index = buildIndex(root, { write: false });
	const re = new RegExp(`^${prefix.replace(/[^A-Z0-9]/gi, '')}([-_])(\\d+)$`, 'i');
	let max = 0;
	let width = 2;
	let sep = '-';
	for (const id of [...index.cases.map((c) => c.id), ...index.orphanTests.map((t) => t.id)]) {
		const m = id.match(re);
		if (m) {
			sep = m[1];
			max = Math.max(max, Number(m[2]));
			width = Math.max(width, m[2].length);
		}
	}
	return `${prefix.toUpperCase()}${sep}${String(max + 1).padStart(width, '0')}`;
}

export function findCases(root, { query, id, page, status, knownIssue, limit = 50 } = {}) {
	const index = loadIndex(root);
	const terms = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
	return index.cases
		.filter((c) => !id || c.id.toLowerCase() === id.toLowerCase())
		.filter((c) => !page || c.page.includes(page) || (c.route ?? '').includes(page))
		.filter((c) => !status || c.status === status)
		.filter((c) => !knownIssue || Boolean(c.knownIssue))
		.filter((c) => {
			if (!terms.length) return true;
			const hay = [c.id, c.page, c.pageTitle, c.section, c.scenario, c.expected, c.automation].join(' ').toLowerCase();
			return terms.every((t) => hay.includes(t));
		})
		.slice(0, limit);
}
