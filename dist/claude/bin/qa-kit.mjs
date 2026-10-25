#!/usr/bin/env node
import { buildIndex, findCases, nextId } from '../lib/catalog.mjs';
import { runHook } from '../lib/hooks.mjs';
import { install, kitCommand, TARGETS } from '../lib/install.mjs';
import { serve } from '../lib/mcp.mjs';
import { addMemory, forgetMemory, KINDS, knowledgeTopics, listMemory, memoryDigest, readKnowledge, searchMemory } from '../lib/memory.mjs';
import { formatIngest, ingest, testHistory } from '../lib/results.mjs';
import { runTests } from '../lib/run.mjs';
import { formatScan, scan } from '../lib/scan.mjs';
import { ensureStore, hasStore, listApps, loadConfig, registerApp, saveConfig, storePaths } from '../lib/store.mjs';
import { findRoot, readJSON } from '../lib/util.mjs';

const HELP = `qa-kit — QA automation memory, catalogs, and Playwright runs for coding agents

Usage: qa-kit <command> [options] [--root <project>]

Setup
  init [--targets a,b|all]     create .qa-kit/, scan, index; optionally install adapters
  install --targets a,b|all    write harness adapters (${Object.keys(TARGETS).join(', ')})
          [--link] [--portable] [--dry-run]

Understand
  status                       memory digest: stack, coverage, health, top lessons
  scan [--json]                project structure, Playwright config, specs, routes
  index [--json]               rebuild test-case index (catalog rows ⨝ spec tests)
  cases [text] [--id X] [--page P] [--status automated|todo|manual] [--json]
  gaps [--page P]              todo cases, catalog/spec drift, uncovered routes
  next-id <PREFIX>             next free case ID, e.g. next-id CHK → CHK-08
  config [get <path> | set <path> <value>]   detected conventions (.qa-kit/config.json)
  apps                         every app that uses qa-kit on this machine

Memory
  memory search <text> [--kind K] [--scope S]
  memory add [--kind K] [--scope S] [--tags a,b] [--source S] [--supersedes ID] [--global] <text>
                               --global: lesson for every app (stored in ~/.qa-kit)
  memory list [--kind K] | memory forget <ID> [--reason R] | memory digest
  knowledge [topic]            read .qa-kit/memory/<topic>.md (app, conventions, glossary)
  kinds: ${Object.keys(KINDS).join(', ')}

Runs
  run [--script <pkg-script>] [--dry-run] -- <playwright args>
  ingest [--report <json>] [--output-dir <dir>]
  history [--filter failing|flaky|all] [--query Q]

Integration
  setup <harness|all> [--yes] [--scope user|project]
                               install the native plugin into claude, codex, copilot, cursor,
                               antigravity, gemini, opencode (prints the plan without --yes)
  build [--only a,b] [--out dir]   regenerate dist/<harness>/ plugins from source
  mcp                          MCP server on stdio
  hook <session-start|post-bash> --client <host>
`;

function parse(argv) {
	const out = { _: [], passthrough: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--') {
			out.passthrough = argv.slice(i + 1);
			break;
		}
		if (a.startsWith('--')) {
			const [k, v] = a.slice(2).split('=');
			const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
			if (v !== undefined) out[key] = v;
			else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[key] = argv[++i];
			else out[key] = true;
		} else out._.push(a);
	}
	return out;
}

// `qa-kit … | head` closes the pipe early; that is not an error.
process.stdout.on('error', (e) => {
	if (e.code === 'EPIPE') process.exit(0);
	throw e;
});

const print = (x) => process.stdout.write((typeof x === 'string' ? x : JSON.stringify(x, null, 2)) + '\n');
const list = (v) => (v && v !== true ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

async function main() {
	const [cmd, ...rest] = process.argv.slice(2);
	const opts = parse(rest);
	if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return print(HELP);
	if (cmd === 'mcp') return serve();
	if (cmd === 'hook') return runHook(opts._[0], opts.client ?? 'claude');
	if (cmd === 'build') {
		const { build, HARNESSES } = await import('../lib/build.mjs');
		const only = opts.only ? list(opts.only) : HARNESSES;
		for (const dir of build({ only, ...(opts.out ? { out: opts.out } : {}) })) print(`built ${dir}`);
		return;
	}
	if (cmd === 'setup') {
		const { setup } = await import('../lib/setup.mjs');
		return print(await setup(opts._[0], { yes: !!opts.yes, scope: opts.scope ?? 'user', root: opts.root }));
	}

	const root = findRoot(opts.root);
	if (!root) throw new Error('Run qa-kit from the project folder or pass --root <project>.');

	switch (cmd) {
		case 'init': {
			ensureStore(root);
			const s = scan(root);
			const idx = buildIndex(root);
			registerApp(root, { name: s.name, frameworks: s.frameworks, cases: idx.counts.cases, tests: s.e2e.tests });
			print(`Initialized ${storePaths(root).dir}\n\n${formatScan(s)}\nCatalog: ${JSON.stringify(idx.counts)}`);
			const targets = opts.targets === 'all' ? Object.keys(TARGETS).filter((t) => t !== 'claude') : list(opts.targets);
			if (targets.length) {
				const r = install(root, targets, { link: !!opts.link, portable: !!opts.portable });
				print(`\nAdapters written: ${r.files.join(', ')}${r.notes.length ? '\n' + r.notes.join('\n') : ''}`);
			}
			print(`\nNext: fill .qa-kit/memory/app.md and conventions.md (the qa-explore-app skill does this), then commit .qa-kit/ (index/ and history/ are ignored).`);
			return;
		}
		case 'install': {
			const targets = opts.targets === 'all' ? Object.keys(TARGETS).filter((t) => t !== 'claude') : list(opts.targets);
			if (!targets.length) return print(`Choose --targets from:\n${Object.entries(TARGETS).map(([k, v]) => `  ${k.padEnd(12)} ${v}`).join('\n')}\n  all          every target except claude (use the plugin there)`);
			const r = install(root, targets, { link: !!opts.link, portable: !!opts.portable, dryRun: !!opts.dryRun });
			return print(`${opts.dryRun ? 'Would write' : 'Wrote'}: \n  ${r.files.join('\n  ')}\nCLI in generated docs: ${r.cli}${r.notes.length ? '\n\n' + r.notes.join('\n') : ''}`);
		}
		case 'status':
			return print(hasStore(root) ? memoryDigest(root, { maxChars: 8000 }) : `No .qa-kit/ in ${root}. Run: ${kitCommand().cli} init`);
		case 'scan': {
			ensureStore(root);
			const s = scan(root);
			registerApp(root, { name: s.name, frameworks: s.frameworks, tests: s.e2e.tests });
			return print(opts.json ? s : formatScan(s));
		}
		case 'index': {
			ensureStore(root);
			const idx = buildIndex(root);
			if (opts.json) return print(idx);
			print(`Index: ${JSON.stringify(idx.counts)}`);
			for (const p of idx.pages) print(`  ${p.dir}  cases ${p.cases} (auto ${p.automated}, todo ${p.todo}, manual ${p.manual}, issues ${p.knownIssues})  tests ${p.tests}${p.catalog ? '' : '  [no catalog]'}`);
			return;
		}
		case 'cases': {
			ensureStore(root);
			const rows = findCases(root, { query: opts._.join(' '), id: opts.id, page: opts.page, status: opts.status, limit: Number(opts.limit ?? 50) });
			if (opts.json) return print(rows);
			for (const c of rows) print(`${c.id.padEnd(9)} ${c.status.padEnd(9)} ${c.knownIssue ? `[${c.knownIssue}] ` : ''}${c.scenario ?? ''}  — ${c.page}${c.specs.length ? `  → ${c.specs.map((s) => `${s.file}:${s.line}`).join(', ')}` : ''}`);
			return print(`${rows.length} case(s)`);
		}
		case 'gaps': {
			ensureStore(root);
			const idx = buildIndex(root);
			const s = readJSON(storePaths(root).structure) ?? scan(root);
			const inScope = (p) => !opts.page || (p ?? '').includes(opts.page);
			const todo = idx.cases.filter((c) => c.status === 'todo' && inScope(c.page));
			print(`Todo cases (${todo.length}):`);
			for (const c of todo.slice(0, 60)) print(`  ${c.id} ${c.scenario} — ${c.page}`);
			const drift = idx.drift.filter((d) => inScope(d.page));
			print(`\nCatalog/spec drift (${drift.length}):`);
			for (const d of drift.slice(0, 60)) print(`  ${d.type}${d.id ? ' ' + d.id : ''}: ${d.detail} (${d.page})`);
			const routes = s.routes.items.filter((r) => !r.covered && inScope(r.path));
			print(`\nRoutes not referenced by any test (${routes.length}, heuristic):`);
			for (const r of routes.slice(0, 80)) print(`  ${r.path}`);
			return;
		}
		case 'next-id':
			if (!opts._[0]) throw new Error('usage: qa-kit next-id <PREFIX>');
			return print(nextId(root, opts._[0]));
		case 'memory': {
			const [sub, ...words] = opts._;
			if (sub === 'add') {
				ensureStore(root);
				const r = addMemory(root, { kind: opts.kind ?? 'fact', text: words.join(' '), scope: opts.scope ?? null, tags: list(opts.tags), source: opts.source ?? null, supersedes: list(opts.supersedes), global: !!opts.global });
				return print(r.duplicate ? `Already known: ${r.entry.id} (seen ${r.entry.seen}×)` : `Saved ${r.entry.id}`);
			}
			if (sub === 'search') {
				const hits = searchMemory(root, { query: words.join(' '), kind: opts.kind, scope: opts.scope, limit: Number(opts.limit ?? 15) });
				if (opts.json) return print(hits);
				return print(hits.length ? hits.map((e) => `${e.id} [${e.origin === 'global' ? 'global ' : ''}${e.kind}${e.scope ? ' ' + e.scope : ''}] ${e.text}`).join('\n') : 'No matching memory.');
			}
			if (sub === 'list') {
				const all = listMemory(root).filter((e) => !opts.kind || e.kind === opts.kind);
				return print(opts.json ? all : all.map((e) => `${e.id} [${e.kind}${e.scope ? ' ' + e.scope : ''}] ${e.text}`).join('\n') || '(empty)');
			}
			if (sub === 'forget') return print(`Retired ${forgetMemory(root, words[0], opts.reason ?? null).id}`);
			if (sub === 'digest') return print(memoryDigest(root));
			throw new Error('usage: qa-kit memory <search|add|list|forget|digest>');
		}
		case 'config': {
			const [sub, path, ...value] = opts._;
			const config = loadConfig(root);
			if (!sub) return print(config);
			const keys = (path ?? '').split('.').filter(Boolean);
			if (sub === 'get') return print(keys.reduce((o, k) => o?.[k], config) ?? null);
			if (sub === 'set') {
				if (!keys.length || !value.length) throw new Error('usage: qa-kit config set <path> <json or text>');
				let v = value.join(' ');
				try {
					v = JSON.parse(v);
				} catch {
					// plain string
				}
				let o = config;
				for (const k of keys.slice(0, -1)) o = o[k] ??= {};
				o[keys.at(-1)] = v;
				ensureStore(root);
				saveConfig(root, config);
				return print(`${path} = ${JSON.stringify(v)}`);
			}
			throw new Error('usage: qa-kit config [get <path> | set <path> <value>]');
		}
		case 'apps': {
			const apps = listApps();
			if (opts.json) return print(apps);
			for (const a of apps) print(`${(a.name ?? '?').padEnd(28)} ${a.root}  (${a.frameworks?.join('/') ?? '?'}, ${a.tests ?? '?'} tests, last ${a.lastSeenAt?.slice(0, 10)})`);
			return print(`${apps.length} app(s)`);
		}
		case 'knowledge':
			return print(opts._[0] ? readKnowledge(root, opts._[0]) ?? `No topic ${opts._[0]}` : knowledgeTopics(root).join('\n'));
		case 'history': {
			const rows = testHistory(root, { filter: opts.filter ?? 'all', query: opts.query, limit: Number(opts.limit ?? 30) });
			if (opts.json) return print(rows);
			for (const t of rows) print(`${t.recent.padStart(10)}  ${t.lastStatus.padEnd(7)} ${t.titlePath || t.title} [${t.project ?? '-'}] ${t.file}`);
			return print(`${rows.length} test(s). Pattern: p pass, F fail, ~ flaky, s skip (oldest → newest)`);
		}
		case 'ingest':
			ensureStore(root);
			return print(formatIngest(ingest(root, { report: opts.report, outputDir: opts.outputDir })));
		case 'run': {
			ensureStore(root);
			const r = runTests(root, { script: opts.script, args: [...opts._, ...opts.passthrough], dryRun: !!opts.dryRun });
			if (opts.dryRun) return print(r.command);
			print(`\n[qa-kit] ${r.command} → exit ${r.exitCode}`);
			if (r.ingest) print(r.ingest.summary ? formatIngest(r.ingest) : r.ingest.note);
			process.exitCode = r.exitCode;
			return;
		}
		default:
			print(HELP);
			process.exitCode = 1;
	}
}

main().catch((e) => {
	process.stderr.write(`qa-kit: ${e.message}\n`);
	process.exitCode = 1;
});
