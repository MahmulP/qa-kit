import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

delete process.env.QA_KIT_DIR;
delete process.env.QA_KIT_ROOT;
delete process.env.CLAUDE_PROJECT_DIR;
// Global lessons and the app registry go to a throwaway home, never the user's ~/.qa-kit.
process.env.QA_KIT_HOME = mkdtempSync(join(tmpdir(), 'qa-kit-home-'));

const { buildIndex, nextId, classifyAutomation } = await import('../lib/catalog.mjs');
const { scan } = await import('../lib/scan.mjs');
const { ensureStore, listApps, loadConfig, registerApp } = await import('../lib/store.mjs');
const { addMemory, searchMemory, forgetMemory, memoryDigest } = await import('../lib/memory.mjs');
const { ingest, testHistory } = await import('../lib/results.mjs');
const { install } = await import('../lib/install.mjs');
const { buildCommand } = await import('../lib/run.mjs');
const { vocabulary } = await import('../lib/vocab.mjs');

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const FIXTURE = join(FIXTURES, 'demo-app');
const BIN = fileURLToPath(new URL('../bin/qa-kit.mjs', import.meta.url));

function project(name = 'demo-app') {
	const dir = mkdtempSync(join(tmpdir(), 'qa-kit-'));
	cpSync(join(FIXTURES, name), dir, { recursive: true });
	const report = join(dir, 'report.json');
	if (existsSync(report)) writeFileSync(report, readFileSync(report, 'utf8').replace('__ROOT__', dir));
	ensureStore(dir);
	return dir;
}

test('scan detects stack, playwright config, specs, routes, and fills config', () => {
	const root = project();
	const s = scan(root);
	assert.deepEqual(s.frameworks.slice(0, 1), ['sveltekit']);
	assert.equal(s.packageManager, 'npm');
	assert.equal(s.playwright.testDir, 'e2e');
	assert.equal(s.playwright.outputDir, 'e2e/.results');
	assert.equal(s.playwright.htmlReportDir, 'e2e/.report');
	assert.equal(s.e2e.tests, 4);
	assert.deepEqual(s.e2e.fixtures, ['e2e/support/fixtures.ts']);
	assert.deepEqual(s.routes.items.map((r) => r.path).sort(), ['/login', '/shop/cart']);
	assert.equal(s.routes.items.find((r) => r.path === '/shop/cart').covered, true);
	const cfg = loadConfig(root);
	assert.deepEqual(cfg.e2e.projects, ['chromium']);
	assert.equal(cfg.e2e.runScript, 'test:e2e');
	assert.equal(cfg.language, 'en');
});

test('index joins catalog rows with spec tests and reports drift', () => {
	const root = project();
	scan(root);
	const idx = buildIndex(root);
	assert.equal(idx.counts.cases, 5);
	const byId = Object.fromEntries(idx.cases.map((c) => [c.id, c]));
	assert.equal(byId['CRT-01'].status, 'automated');
	assert.deepEqual(byId['CRT-01'].tags, ['@smoke']);
	assert.equal(byId['CRT-02'].knownIssue, 'suspected');
	assert.deepEqual(byId['CRT-02'].specs[0].annotations, ['BUG-7']);
	assert.equal(byId['CRT-04'].status, 'manual');
	const types = idx.drift.map((d) => `${d.type}:${d.id}`).sort();
	assert.deepEqual(types, ['catalog-outdated:CRT-03', 'missing-spec:CRT-05', 'spec-not-in-catalog:CRT-09']);
	assert.equal(idx.findings[0].ids[0], 'CRT-02');
	assert.equal(nextId(root, 'CRT'), 'CRT-10');
});

test('automation text classification through language packs', () => {
	const en = vocabulary({ catalog: { languages: ['en'] } });
	assert.equal(classifyAutomation('spec, **suspected fail** (Finding 1)', en).knownIssue, 'suspected');
	assert.equal(classifyAutomation('⏳ planned', en).status, 'todo');
	assert.equal(classifyAutomation('✅ automated', en).status, 'automated');
	assert.equal(classifyAutomation('`orders.spec.ts`, **failing: bug** (Finding 2)', en).knownIssue, 'confirmed');
	// Indonesian pack: off when the project only lists English, on when listed.
	assert.equal(classifyAutomation('belum diotomasi', en).status, 'unknown');
	const id = vocabulary({ catalog: { languages: ['id'] } });
	assert.equal(classifyAutomation('belum diotomasi, lihat Temuan 4', id).status, 'todo');
	assert.equal(classifyAutomation('spec, **dugaan gagal** bila data belum lengkap', id).status, 'automated');
	assert.equal(classifyAutomation('spec, **dugaan gagal**', id).knownIssue, 'suspected');
	// Project-specific words.
	const custom = vocabulary({ catalog: { languages: ['en'], vocabulary: { todo: ['nog niet'] } } });
	assert.equal(classifyAutomation('nog niet', custom).status, 'todo');
});

test('memory dedupes, ranks by scope, supersedes and retires', () => {
	const root = project();
	const a = addMemory(root, { kind: 'selector', scope: 'e2e/shop/cart', text: 'Remove button has no label; use getByRole("button", { name: /hapus|remove/i }).' });
	const again = addMemory(root, { kind: 'selector', scope: 'e2e/shop/cart', text: 'Remove button has no label; use getByRole("button", { name: /hapus|remove/i }).' });
	assert.equal(again.duplicate, true);
	assert.equal(again.entry.seen, 2);
	addMemory(root, { kind: 'gotcha', text: 'Dev server needs 60s on first compile.' });
	const hits = searchMemory(root, { query: 'remove button', scope: 'e2e/shop/cart/cart.spec.ts' });
	assert.equal(hits[0].id, a.entry.id);
	const b = addMemory(root, { kind: 'selector', scope: 'e2e/shop/cart', text: 'Remove button now has aria-label "Remove item".', supersedes: [a.entry.id] });
	assert.deepEqual(b.superseded, [a.entry.id]);
	assert.equal(searchMemory(root, { query: 'remove button' }).some((e) => e.id === a.entry.id), false);
	forgetMemory(root, b.entry.id, 'test');
	assert.equal(searchMemory(root, { query: 'remove' }).length, 0);
	assert.match(memoryDigest(root), /gotcha/);
});

test('ingest records JSON report and tracks flips', () => {
	const root = project();
	scan(root);
	const first = ingest(root, { report: 'report.json' });
	assert.equal(first.summary.passed, 1);
	assert.equal(first.summary.failed, 1);
	assert.equal(first.summary.flaky, 1);
	assert.equal(first.changes.newFailures[0].file, 'e2e/shop/cart/cart.spec.ts');
	const second = ingest(root, { report: 'report.json' });
	assert.equal(second.changes.stillFailing.length, 1);
	const failing = testHistory(root, { filter: 'failing' });
	assert.equal(failing[0].recent, 'FF');
	assert.match(failing[0].lastError, /^Expected row to be hidden$/);
	assert.equal(testHistory(root, { filter: 'flaky' }).length, 1);
});

test('run builds package-manager aware commands', () => {
	const root = project();
	scan(root);
	assert.deepEqual(buildCommand(root, { args: ['e2e/shop', '-g', 'CRT-01'] }).argv, ['run', 'test:e2e', '--', 'e2e/shop', '-g', 'CRT-01', '--reporter=list,json,html']);
	assert.deepEqual(buildCommand(root, { script: 'test:e2e:chrome', args: ['shop'] }).argv, ['run', 'test:e2e:chrome', '--', 'shop', '--reporter=list,json,html']);
});

test('a second app with other conventions is detected without configuration', () => {
	const root = project('next-app');
	const s = scan(root);
	const cfg = loadConfig(root);
	assert.ok(s.frameworks.includes('nextjs'));
	assert.equal(s.packageManager, 'pnpm');
	assert.equal(cfg.e2e.testDir, 'tests');
	assert.equal(cfg.e2e.runScript, 'e2e');
	assert.deepEqual(cfg.e2e.projects, ['admin', 'storefront']);
	assert.deepEqual(cfg.e2e.scopes, [
		{ path: 'tests/admin-portal', project: 'admin', script: 'e2e:admin' },
		{ path: 'tests/storefront', project: 'storefront', script: 'e2e:store' }
	]);
	assert.deepEqual(cfg.e2e.mutationTags, ['@destructive']);
	assert.deepEqual(cfg.e2e.protectedEnv, ['ALLOW_DESTRUCTIVE_TESTS']);
	assert.deepEqual(cfg.catalog.fileNames, ['checkout.cases.md']);
	assert.equal(cfg.e2e.fixturesImport, '@playwright/test');
	assert.deepEqual(s.routes.items.map((r) => r.path).sort(), ['/admin/users', '/checkout']);

	const idx = buildIndex(root);
	const byId = Object.fromEntries(idx.cases.map((c) => [c.id, c]));
	assert.equal(idx.counts.cases, 3);
	assert.equal(byId.TC_001.status, 'automated');
	assert.deepEqual(byId.TC_001.tags, ['@destructive']);
	assert.equal(byId.TC_002.status, 'todo');
	assert.equal(byId.TC_003.status, 'manual');
	assert.equal(byId.TC_001.route, '/checkout');
	assert.equal(idx.findings[0].title, 'Coupon field accepts expired codes');
	assert.equal(nextId(root, 'TC'), 'TC_004');

	// Runs pick the scope's script from the path.
	assert.deepEqual(buildCommand(root, { args: ['tests/admin-portal/users'] }).argv, ['run', 'e2e:admin', '--', 'tests/admin-portal/users', '--reporter=list,json,html']);
	assert.deepEqual(buildCommand(root, { args: ['storefront/checkout', '-g', 'TC_001'] }).argv.slice(0, 2), ['run', 'e2e:store']);
	assert.match(memoryDigest(root), /Never set these yourself: ALLOW_DESTRUCTIVE_TESTS/);
});

test('global lessons are shared across apps, project lessons are not', () => {
	const a = project('demo-app');
	const b = project('next-app');
	addMemory(a, { kind: 'gotcha', text: 'Only in app A: cart needs a seeded product.' });
	const g = addMemory(a, { kind: 'gotcha', text: 'Playwright traces are only kept for failed tests with retain-on-failure.', global: true });
	assert.match(g.entry.id, /^G-/);
	const inB = searchMemory(b, { query: 'traces retain failure' });
	assert.equal(inB[0].id, g.entry.id);
	assert.equal(inB[0].origin, 'global');
	assert.equal(searchMemory(b, { query: 'seeded product cart' }).length, 0);
	forgetMemory(b, g.entry.id, 'test');
	assert.equal(searchMemory(a, { query: 'traces retain failure' }).length, 0);
	registerApp(a, { name: 'demo-app' });
	registerApp(b, { name: 'next-app' });
	assert.deepEqual(listApps().map((x) => x.name).sort(), ['demo-app', 'next-app']);
});

test('install writes adapters idempotently', () => {
	const root = project();
	scan(root);
	writeFileSync(join(root, 'AGENTS.md'), '# Existing rules\n\nKeep me.\n');
	for (let i = 0; i < 2; i++) install(root, ['agents-md', 'codex', 'cursor', 'gemini', 'copilot', 'antigravity']);
	const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
	assert.match(agents, /Keep me\./);
	assert.equal(agents.match(/qa-kit:start/g).length, 1);
	assert.ok(existsSync(join(root, '.agents/skills/qa-automation/SKILL.md')));
	assert.ok(existsSync(join(root, '.github/skills/qa-memory/SKILL.md')));
	assert.match(readFileSync(join(root, '.agents/rules/qa-kit.md'), 'utf8'), /qa-kit/);
	assert.equal(JSON.parse(readFileSync(join(root, '.agents/mcp_config.json'), 'utf8')).mcpServers['qa-kit'].command, 'node');
	assert.equal(JSON.parse(readFileSync(join(root, '.cursor/mcp.json'), 'utf8')).mcpServers['qa-kit'].command, 'node');
	assert.equal(JSON.parse(readFileSync(join(root, '.vscode/mcp.json'), 'utf8')).servers['qa-kit'].type, 'stdio');
	assert.equal(readFileSync(join(root, '.codex/config.toml'), 'utf8').match(/\[mcp_servers\.qa-kit\]/g).length, 1);
	assert.match(readFileSync(join(root, '.cursor/rules/qa-kit.mdc'), 'utf8'), /globs: e2e\/\*\*/);
});

test('MCP server answers initialize, tools/list, and tools/call', () => {
	const root = project();
	const lines = [
		{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } },
		{ jsonrpc: '2.0', method: 'notifications/initialized' },
		{ jsonrpc: '2.0', id: 2, method: 'tools/list' },
		{ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'qa_next_id', arguments: { root, prefix: 'CRT' } } },
		{ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'qa_memory_add', arguments: { root, kind: 'nope', text: 'x' } } }
	];
	const res = spawnSync('node', [BIN, 'mcp'], { input: lines.map((l) => JSON.stringify(l)).join('\n') + '\n', encoding: 'utf8' });
	const out = res.stdout.trim().split('\n').map((l) => JSON.parse(l));
	assert.equal(out.length, 4);
	assert.equal(out[0].result.serverInfo.name, 'qa-kit');
	assert.ok(out[1].result.tools.length >= 10);
	assert.equal(out[2].result.content[0].text, 'CRT-10');
	assert.equal(out[3].result.isError, true);
});

test('session-start hook prints the digest only when a store exists', () => {
	const root = project();
	const run = (cwd) => spawnSync('node', [BIN, 'hook', 'session-start'], { input: JSON.stringify({ cwd }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } }).stdout;
	assert.match(run(root), /# qa-kit memory/);
	const bare = mkdtempSync(join(tmpdir(), 'qa-kit-bare-'));
	cpSync(FIXTURE, bare, { recursive: true });
	assert.match(run(bare), /no \.qa-kit\/ memory yet/);
});
