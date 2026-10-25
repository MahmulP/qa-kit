import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { kitCommand } from './install.mjs';
import { buildIndex, findCases, nextId } from './catalog.mjs';
import { addMemory, forgetMemory, KINDS, knowledgeTopics, memoryDigest, readKnowledge, searchMemory } from './memory.mjs';
import { formatIngest, ingest, testHistory } from './results.mjs';
import { formatScan, scan } from './scan.mjs';
import { ensureStore, hasStore, listApps, loadConfig, registerApp, storePaths } from './store.mjs';
import { findRoot, readJSON } from './util.mjs';

/**
 * Minimal MCP server (JSON-RPC 2.0 over stdio, newline-delimited) so any harness with MCP
 * support (Claude Code, Codex, Cursor, Gemini CLI, Copilot, Antigravity, OpenCode…) gets
 * the same memory and catalog tools. No SDK dependency on purpose.
 */

const ROOT_PROP = {
	root: { type: 'string', description: 'Absolute path of the project under test. Defaults to QA_KIT_ROOT, CLAUDE_PROJECT_DIR, or the server cwd.' }
};

const obj = (properties, required = []) => ({ type: 'object', properties: { ...ROOT_PROP, ...properties }, required });

const TOOLS = [
	{
		name: 'qa_status',
		description:
			'Start here. Digest of what qa-kit knows about the project: stack, e2e layout, catalog coverage, test health, and the most important lessons. Creates nothing.',
		inputSchema: obj({}),
		run: ({ root }) =>
			(hasStore(root) ? memoryDigest(root, { maxChars: 6000 }) : `No .qa-kit store in ${root}. Call qa_scan to create it.`) +
			`\nqa-kit CLI for shell use: ${kitCommand().cli} <command> --root "${root}"`
	},
	{
		name: 'qa_scan',
		description:
			'Scan the project structure (framework, Playwright config, spec files, fixtures, page objects, routes, QA rule docs) and rebuild the test-case index. Creates .qa-kit/ on first use.',
		inputSchema: obj({}),
		run: ({ root }) => {
			ensureStore(root);
			const s = scan(root);
			const idx = buildIndex(root);
			registerApp(root, { name: s.name, frameworks: s.frameworks, cases: idx.counts.cases, tests: s.e2e.tests });
			return `${formatScan(s)}\nCatalog index: ${JSON.stringify(idx.counts)}`;
		}
	},
	{
		name: 'qa_config',
		description:
			'The project conventions qa-kit detected or the team set (.qa-kit/config.json): test dir, fixtures import, catalog file names, case ID pattern, catalog languages, scopes (folder → Playwright project/script), mutation tags, env vars agents must never set. Also lists other apps using qa-kit.',
		inputSchema: obj({}),
		run: ({ root }) => JSON.stringify({ config: loadConfig(root), apps: listApps().map((a) => ({ name: a.name, root: a.root })) }, null, 1)
	},
	{
		name: 'qa_find_cases',
		description: 'Search the test-case index (catalog rows joined with spec tests). Filter by ID, page path/route fragment, status (automated|todo|manual), or free text.',
		inputSchema: obj({
			query: { type: 'string' },
			id: { type: 'string' },
			page: { type: 'string' },
			status: { type: 'string', enum: ['automated', 'todo', 'manual', 'unknown'] },
			knownIssue: { type: 'boolean' },
			limit: { type: 'number' }
		}),
		run: ({ root, ...q }) => JSON.stringify(findCases(root, q), null, 1)
	},
	{
		name: 'qa_coverage_gaps',
		description:
			'Where coverage is missing or out of sync: catalog rows still todo, pages without catalog, spec tests not in a catalog, catalog rows claiming a spec that does not exist, routes no test references.',
		inputSchema: obj({ page: { type: 'string', description: 'Limit to a page/module path fragment' }, limit: { type: 'number' } }),
		run: ({ root, page, limit = 40 }) => {
			const idx = buildIndex(root);
			const s = readJSON(storePaths(root).structure) ?? scan(root);
			const inScope = (p) => !page || (p ?? '').includes(page);
			return JSON.stringify(
				{
					todo: idx.cases.filter((c) => c.status === 'todo' && inScope(c.page)).slice(0, limit).map(({ id, page: pg, scenario }) => ({ id, page: pg, scenario })),
					drift: idx.drift.filter((d) => inScope(d.page)).slice(0, limit),
					uncoveredRoutes: s.routes.items.filter((r) => !r.covered && inScope(r.path)).slice(0, limit).map((r) => r.path),
					pagesWithoutCatalog: idx.pages.filter((p) => !p.catalog && inScope(p.dir)).map((p) => p.dir)
				},
				null,
				1
			);
		}
	},
	{
		name: 'qa_next_id',
		description: 'Next free test-case ID for a prefix (IDs are never renumbered), e.g. prefix "CHK" -> "CHK-08".',
		inputSchema: obj({ prefix: { type: 'string' } }, ['prefix']),
		run: ({ root, prefix }) => nextId(root, prefix)
	},
	{
		name: 'qa_memory_search',
		description:
			'Search lessons learned in earlier sessions (facts, conventions, selectors, gotchas, bugs, flaky tests, decisions, test data). Call before planning or writing tests for an area.',
		inputSchema: obj({
			query: { type: 'string' },
			kind: { type: 'string', enum: Object.keys(KINDS) },
			scope: { type: 'string', description: 'Path or module the work is about, e.g. e2e/billing/invoices' },
			limit: { type: 'number' }
		}),
		run: ({ root, ...q }) => {
			const hits = searchMemory(root, q);
			return hits.length ? hits.map((e) => `${e.id} [${e.kind}${e.scope ? ' ' + e.scope : ''}] (score ${e.score}, seen ${e.seen}) ${e.text}`).join('\n') : 'No matching memory.';
		}
	},
	{
		name: 'qa_memory_add',
		description: `Record one durable lesson so later sessions (any agent) reuse it. Only things that are true beyond this task and not obvious from the code. Kinds: ${Object.entries(KINDS)
			.map(([k, v]) => `${k} = ${v}`)
			.join(' ')} Use supersedes to replace an outdated entry.`,
		inputSchema: obj(
			{
				kind: { type: 'string', enum: Object.keys(KINDS) },
				text: { type: 'string', description: 'One self-contained sentence or two, with file:line or test ID evidence.' },
				scope: { type: 'string', description: 'Path or module it applies to; omit for project-wide.' },
				tags: { type: 'array', items: { type: 'string' } },
				source: { type: 'string', description: 'Where it came from: ticket, run date, reviewer, file.' },
				supersedes: { type: 'array', items: { type: 'string' } },
				global: { type: 'boolean', description: 'True for a lesson that holds for every app (tooling, Playwright habits), not just this project.' }
			},
			['kind', 'text']
		),
		run: ({ root, ...e }) => {
			ensureStore(root);
			const r = addMemory(root, e);
			return r.duplicate ? `Already known as ${r.entry.id}; seen count is now ${r.entry.seen}.` : `Saved ${r.entry.id}${r.superseded?.length ? `, superseded ${r.superseded.join(', ')}` : ''}.`;
		}
	},
	{
		name: 'qa_memory_forget',
		description: 'Retire a memory entry that turned out wrong or obsolete (kept for history, hidden from search).',
		inputSchema: obj({ id: { type: 'string' }, reason: { type: 'string' } }, ['id']),
		run: ({ root, id, reason }) => `Retired ${forgetMemory(root, id, reason).id}.`
	},
	{
		name: 'qa_knowledge',
		description: 'Read a curated knowledge file from .qa-kit/memory (app, conventions, glossary, or any added topic). Without topic, lists topics. Edit the files directly to update them.',
		inputSchema: obj({ topic: { type: 'string' } }),
		run: ({ root, topic }) =>
			topic
				? readKnowledge(root, topic) ?? `No topic "${topic}". Topics: ${knowledgeTopics(root).join(', ')}`
				: `Topics in ${storePaths(root).memoryDir}: ${knowledgeTopics(root).join(', ') || '(none)'}`
	},
	{
		name: 'qa_test_history',
		description: 'Per-test stability from recorded runs: failing now, flaky (status flips), or all. Each entry has the recent pattern (p=pass F=fail ~=flaky s=skip) and last error.',
		inputSchema: obj({ filter: { type: 'string', enum: ['failing', 'flaky', 'all'] }, query: { type: 'string' }, limit: { type: 'number' } }),
		run: ({ root, ...q }) => JSON.stringify(testHistory(root, q), null, 1)
	},
	{
		name: 'qa_ingest_results',
		description:
			'Record the latest Playwright results into history: a JSON report path, the report written by `qa-kit run`, or failed tests from error-context.md files in the output dir. Returns new failures, fixed tests, and flaky candidates.',
		inputSchema: obj({ report: { type: 'string' }, outputDir: { type: 'string' } }),
		run: ({ root, report, outputDir }) => {
			ensureStore(root);
			return formatIngest(ingest(root, { report, outputDir }));
		}
	}
];

/**
 * Where the project is. Hosts that start the server inside the plugin folder (Codex,
 * Copilot, Cursor, Antigravity) tell us the workspace through MCP roots; a `root` argument
 * or QA_KIT_ROOT always wins.
 */
const session = { rootsCapable: false, roots: [], rootsPending: null, request: null };

function projectRoot(explicit) {
	if (explicit || process.env.QA_KIT_ROOT) return findRoot(explicit);
	const fromHost = session.roots[0] ?? process.env.CLAUDE_PROJECT_DIR ?? process.env.CURSOR_PROJECT_DIR ?? process.env.GEMINI_PROJECT_DIR;
	const root = findRoot(fromHost ?? null);
	if (!root) throw new Error('Unknown project: pass `root` = absolute path of the app under test.');
	return root;
}

function refreshRoots() {
	if (!session.rootsCapable || !session.request) return null;
	session.rootsPending = session
		.request('roots/list', {})
		.then((res) => {
			session.roots = (res?.roots ?? []).map((r) => (r.uri?.startsWith('file:') ? fileURLToPath(r.uri) : null)).filter(Boolean);
		})
		.catch(() => {});
	return session.rootsPending;
}

async function handle(msg) {
	const { id, method, params } = msg;
	switch (method) {
		case 'initialize':
			session.rootsCapable = Boolean(params?.capabilities?.roots);
			return {
				protocolVersion: params?.protocolVersion ?? '2025-06-18',
				capabilities: { tools: {} },
				serverInfo: { name: 'qa-kit', version: '0.1.0' },
				instructions:
					'qa-kit holds project QA memory and the test-case index. Call qa_status at the start of QA work, qa_memory_search before writing tests for an area, and qa_memory_add when you learn something durable. Pass root when the server cwd is not the project.'
			};
		case 'notifications/initialized':
		case 'notifications/roots/list_changed':
			refreshRoots();
			return undefined;
		case 'ping':
			return {};
		case 'tools/list':
			return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) };
		case 'tools/call': {
			const tool = TOOLS.find((t) => t.name === params?.name);
			if (!tool) throw Object.assign(new Error(`Unknown tool ${params?.name}`), { code: -32602 });
			const args = params.arguments ?? {};
			try {
				if (!args.root && session.rootsPending) await Promise.race([session.rootsPending, new Promise((r) => setTimeout(r, 2000))]);
				const root = projectRoot(args.root);
				if (!['qa_status', 'qa_knowledge', 'qa_config'].includes(tool.name)) ensureStore(root);
				const text = await tool.run({ ...args, root });
				return { content: [{ type: 'text', text: String(text) }] };
			} catch (e) {
				return { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true };
			}
		}
		default:
			if (id === undefined) return undefined; // notification
			throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
	}
}

export function serve() {
	const send = (obj) => process.stdout.write(JSON.stringify(obj) + '\n');
	const rl = createInterface({ input: process.stdin });
	// Requests this server sends to the host (roots/list); answers bypass the queue below.
	const pending = new Map();
	let nextId = 1;
	session.request = (method, params) =>
		new Promise((resolve, reject) => {
			const id = `qa-kit-${nextId++}`;
			pending.set(id, { resolve, reject });
			send({ jsonrpc: '2.0', id, method, params });
		});

	// One request at a time: tools write to the same store files, and replies stay in order.
	let queue = Promise.resolve();
	rl.on('line', (line) => {
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			if (line.trim()) send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
			return;
		}
		if (msg && msg.method === undefined && pending.has(msg.id)) {
			const p = pending.get(msg.id);
			pending.delete(msg.id);
			return msg.error ? p.reject(msg.error) : p.resolve(msg.result);
		}
		queue = queue.then(() => onMessage(msg));
	});
	const onMessage = async (msg) => {
		try {
			const result = await handle(msg);
			if (msg.id !== undefined && result !== undefined) send({ jsonrpc: '2.0', id: msg.id, result });
		} catch (e) {
			if (msg.id !== undefined) send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code ?? -32603, message: e.message } });
		}
	};
}

export { TOOLS };
