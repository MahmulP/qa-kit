import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { globalPaths, loadConfig, storePaths, TEMPLATES } from './store.mjs';
import { appendJSONL, nowIso, readJSON, readJSONL, readText, tokenize, truncate, writeJSONL } from './util.mjs';

/**
 * Kinds of memory entries. Curated prose lives in `memory/*.md`; these are the atomic,
 * searchable facts that accumulate between sessions.
 */
export const KINDS = {
	fact: 'How the app behaves or is built (route, component, API, permission).',
	convention: 'How tests are written here; usually a reviewer correction.',
	selector: 'A locator that works (or does not) for a given UI element.',
	gotcha: 'Something that wasted time: timing, data, environment, tooling.',
	bug: 'A confirmed or suspected app bug with test ID and evidence.',
	flaky: 'A test that is unstable, with the cause if known.',
	decision: 'A choice made with the user/QA that later work must respect.',
	data: 'Test data that exists (or must be created) in a given environment.'
};

const normalize = (s) => tokenize(s).join(' ');

function newId(entries, prefix) {
	const day = nowIso().slice(0, 10).replace(/-/g, '');
	const n = entries.filter((e) => e.id?.startsWith(`${prefix}-${day}`)).length + 1;
	return `${prefix}-${day}-${String(n).padStart(3, '0')}`;
}

/** Project lessons live in the app's store; `global` ones in ~/.qa-kit and apply to every app. */
const fileFor = (root, global) => (global ? globalPaths().lessons : storePaths(root).lessons);

export function listMemory(root, { includeRetired = false, includeGlobal = true } = {}) {
	const local = readJSONL(storePaths(root).lessons).map((e) => ({ ...e, origin: 'project' }));
	const shared = includeGlobal ? readJSONL(globalPaths().lessons).map((e) => ({ ...e, origin: 'global' })) : [];
	const all = [...local, ...shared];
	return includeRetired ? all : all.filter((e) => e.status === 'active');
}

/**
 * Adds an entry. The same text in the same scope is not duplicated: its `seen` count and
 * timestamp go up instead, which raises it in search and in the session digest.
 * `global: true` stores it for every app (Playwright habits, tooling, team-wide rules).
 */
export function addMemory(root, { kind = 'fact', text, scope = null, tags = [], source = null, supersedes = null, global = false }) {
	if (!text?.trim()) throw new Error('memory text is required');
	if (!KINDS[kind]) throw new Error(`unknown kind "${kind}"; use one of ${Object.keys(KINDS).join(', ')}`);
	const p = fileFor(root, global);
	const all = readJSONL(p);
	const norm = normalize(text);
	const dup = all.find((e) => e.status === 'active' && e.scope === scope && normalize(e.text) === norm);
	if (dup) {
		dup.seen = (dup.seen ?? 1) + 1;
		dup.updatedAt = nowIso();
		dup.tags = [...new Set([...(dup.tags ?? []), ...tags])];
		writeJSONL(p, all);
		return { entry: dup, duplicate: true };
	}
	const entry = {
		id: newId(all, global ? 'G' : 'M'),
		kind,
		scope,
		text: text.trim(),
		tags,
		source,
		status: 'active',
		seen: 1,
		createdAt: nowIso(),
		updatedAt: nowIso()
	};
	const retired = [];
	if (supersedes) {
		for (const id of [].concat(supersedes)) {
			const old = all.find((e) => e.id === id);
			if (old && old.status === 'active') {
				old.status = 'superseded';
				old.supersededBy = entry.id;
				old.updatedAt = nowIso();
				retired.push(id);
			}
		}
	}
	if (retired.length) writeJSONL(p, [...all, entry]);
	else appendJSONL(p, entry);
	return { entry, duplicate: false, superseded: retired };
}

export function forgetMemory(root, id, reason = null) {
	const p = fileFor(root, id.startsWith('G-'));
	const all = readJSONL(p);
	const e = all.find((x) => x.id === id);
	if (!e) throw new Error(`no memory entry ${id}`);
	e.status = 'retired';
	e.retiredReason = reason;
	e.updatedAt = nowIso();
	writeJSONL(p, all);
	return e;
}

/** Token-overlap ranking with boosts for scope match, repetition, and recency. */
export function searchMemory(root, { query = '', kind, scope, limit = 15 } = {}) {
	const q = tokenize(query);
	const now = Date.now();
	return listMemory(root)
		.filter((e) => !kind || e.kind === kind)
		.map((e) => {
			const hay = tokenize([e.text, e.scope, ...(e.tags ?? []), e.kind].join(' '));
			const set = new Set(hay);
			let score = q.length ? q.filter((t) => set.has(t) || hay.some((h) => h.includes(t))).length / q.length : 0.1;
			if (scope && e.scope) {
				if (scope.startsWith(e.scope) || e.scope.startsWith(scope)) score += 0.5;
				else if (scope && !q.length) score -= 0.5;
			}
			score += Math.min((e.seen ?? 1) - 1, 5) * 0.05;
			const ageDays = (now - Date.parse(e.updatedAt ?? e.createdAt)) / 86_400_000;
			score += Math.max(0, 0.2 - ageDays / 365);
			return { ...e, score: Math.round(score * 100) / 100 };
		})
		.filter((e) => e.score > (q.length ? 0.25 : 0))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
}

export function knowledgeTopics(root) {
	const dir = storePaths(root).memoryDir;
	try {
		return readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
	} catch {
		return [];
	}
}

export function readKnowledge(root, topic) {
	return readText(join(storePaths(root).memoryDir, `${topic.replace(/\.md$/, '')}.md`));
}

function sectionBodies(md) {
	const map = new Map();
	for (const s of md.split(/^## /m).slice(1)) {
		const [heading, ...body] = s.split('\n');
		map.set(heading.trim(), body.join('\n').trim());
	}
	return map;
}

/** Number of `##` sections that differ from the seeded template, i.e. hold real knowledge. */
function filledSections(topic, md) {
	const template = sectionBodies(readText(join(TEMPLATES, 'memory', `${topic}.md`), ''));
	let n = 0;
	for (const [heading, body] of sectionBodies(md)) if (body && template.get(heading) !== body) n++;
	return n;
}

/**
 * Compact digest for the start of a session (hook) or `qa_status`: what the store knows,
 * test health, and the most relevant lessons. Bounded so it never floods the context.
 */
export function memoryDigest(root, { maxChars = 3500 } = {}) {
	const p = storePaths(root);
	const out = [];
	const structure = readJSON(p.structure);
	const index = readJSON(p.cases);
	const tests = readJSON(p.tests, {});
	const runs = readJSONL(p.runs);

	out.push(`# qa-kit memory (${p.dir})`);
	if (structure) {
		out.push(
			`Project ${structure.name}: ${structure.frameworks.join('/') || '?'}, runners ${structure.testRunners.join('/') || '?'}, ` +
				`e2e in ${structure.e2e.testDir ?? '?'} (${structure.e2e.specFiles} specs, ${structure.e2e.tests} tests), ` +
				`routes ${structure.routes.covered}/${structure.routes.count} referenced. Scanned ${structure.generatedAt.slice(0, 10)}.`
		);
		const docs = [...structure.ruleDocs].sort((a, b) => Number(/e2e|qa|test|playwright/i.test(b)) - Number(/e2e|qa|test|playwright/i.test(a)));
		if (docs.length) out.push(`Project rules to obey (QA first): ${docs.slice(0, 8).join(', ')}${docs.length > 8 ? ` +${docs.length - 8} more` : ''}`);
		const c = loadConfig(root);
		out.push(
			`Detected conventions: specs import from ${c.e2e.fixturesImport ?? '?'}; catalogs named ${(c.catalog.fileNames ?? [c.catalog.newFileName]).join('/')}; case IDs /${c.catalog.idPattern}/; ` +
				`suite script ${c.e2e.runScript ?? '-'}; mutation tags ${c.e2e.mutationTags.join(', ') || '-'}; test language ${c.language ?? '?'}.`
		);
		if (c.e2e.scopes.length) out.push(`Scopes: ${c.e2e.scopes.map((x) => `${x.path}→${x.project}`).join(', ')}`);
		if (c.e2e.protectedEnv.length) out.push(`Never set these yourself: ${c.e2e.protectedEnv.join(', ')}.`);
	} else out.push('No scan yet: run `qa-kit scan` (or the qa_scan tool).');

	if (index) {
		const c = index.counts;
		out.push(
			`Catalog: ${c.cases} cases on ${c.pages} pages; ${c.automated} automated, ${c.todo} todo, ${c.manual} manual, ${c.knownIssues} with known issues; ${c.findings} findings; ${c.drift} catalog/spec drift items.`
		);
	}

	const stats = Object.values(tests);
	if (stats.length) {
		const failing = stats.filter((t) => t.lastStatus === 'failed');
		const flaky = stats.filter((t) => t.flakyScore >= 2).sort((a, b) => b.flakyScore - a.flakyScore);
		const last = runs.at(-1);
		out.push(
			`History: ${stats.length} tests tracked, ${failing.length} failing at last run, ${flaky.length} flaky.` +
				(last ? ` Last run ${last.ts.slice(0, 16)}: ${last.passed} passed, ${last.failed} failed, ${last.flaky} flaky, ${last.skipped} skipped (${last.source}).` : '')
		);
		for (const t of flaky.slice(0, 3)) out.push(`  flaky: ${t.title} (${t.file}) pattern ${t.recent}`);
	}

	const topics = knowledgeTopics(root).map((t) => {
		const md = readKnowledge(root, t) ?? '';
		return `${t}.md (${filledSections(t, md)} filled sections)`;
	});
	if (topics.length) out.push(`Knowledge files in memory/: ${topics.join(', ')}. Read them before writing tests.`);

	const entries = listMemory(root);
	if (entries.length) {
		const byKind = {};
		for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
		const globalCount = entries.filter((e) => e.origin === 'global').length;
		out.push(
			`Lessons: ${entries.length} active (${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ')})` +
				(globalCount ? `, ${globalCount} of them global (shared by all apps).` : '.')
		);
		const important = [...entries]
			.filter((e) => ['convention', 'decision', 'gotcha'].includes(e.kind))
			.sort((a, b) => (b.seen ?? 1) - (a.seen ?? 1) || (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
			.slice(0, 12);
		for (const e of important) out.push(`- [${e.origin === 'global' ? 'global ' : ''}${e.kind}${e.scope ? ` ${e.scope}` : ''}] ${truncate(e.text, 220)} (${e.id})`);
	}
	out.push('Search more with `qa-kit memory search <words>` or the qa_memory_search tool before planning or writing tests.');

	let text = out.join('\n');
	if (text.length > maxChars) text = text.slice(0, maxChars - 20) + '\n…(truncated)';
	return text;
}
