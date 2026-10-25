import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

for (const k of ['QA_KIT_DIR', 'QA_KIT_ROOT', 'CLAUDE_PROJECT_DIR', 'CURSOR_PROJECT_DIR', 'GEMINI_PROJECT_DIR']) delete process.env[k];
process.env.QA_KIT_HOME = mkdtempSync(join(tmpdir(), 'qa-kit-home-'));

const { build, HARNESSES } = await import('../lib/build.mjs');
const { ensureStore } = await import('../lib/store.mjs');
const { scan } = await import('../lib/scan.mjs');
const { addOpencodeMcp, parseJsonc } = await import('../lib/setup.mjs');

const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
const OUT = mkdtempSync(join(tmpdir(), 'qa-kit-dist-'));
build({ out: OUT });

const json = (...p) => JSON.parse(readFileSync(join(OUT, ...p), 'utf8'));
const text = (...p) => readFileSync(join(OUT, ...p), 'utf8');

function project() {
	const dir = mkdtempSync(join(tmpdir(), 'qa-kit-'));
	cpSync(join(FIXTURES, 'demo-app'), dir, { recursive: true });
	const report = join(dir, 'report.json');
	writeFileSync(report, readFileSync(report, 'utf8').replace('__ROOT__', dir));
	ensureStore(dir);
	scan(dir);
	return dir;
}

function filesUnder(dir) {
	const out = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...filesUnder(p));
		else out.push(p);
	}
	return out;
}

/* Agent Plugins 1.0 rules (agent-plugins.org/specification). */
const AP_FIELDS = new Set(['$schema', 'name', 'version', 'description', 'author', 'homepage', 'repository', 'license', 'keywords', 'extensions']);
function assertAgentPlugin(dir) {
	const p = json(dir, 'plugin.json');
	assert.equal(p.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
	assert.match(p.name, /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/);
	assert.doesNotMatch(p.name, /--|\.\./);
	for (const k of Object.keys(p)) assert.ok(AP_FIELDS.has(k), `unknown plugin.json field ${k}`);
	const m = json(dir, 'mcp.json');
	assert.equal(m.$schema, 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
	for (const s of Object.values(m.mcpServers)) {
		assert.equal(s.type, 'stdio');
		assert.match(s.command, /^(\.\/)?[\w.-]+$/, 'command is one token');
		assert.deepEqual(Object.keys(s).filter((k) => !['type', 'command', 'args', 'env', 'cwd'].includes(k)), []);
	}
	for (const d of readdirSync(join(OUT, dir, 'skills'))) assert.ok(existsSync(join(OUT, dir, 'skills', d, 'SKILL.md')));
}

test('every harness gets a self-contained plugin with its own manifest', () => {
	assert.deepEqual(readdirSync(OUT).sort(), [...HARNESSES].sort());
	const manifests = {
		claude: '.claude-plugin/plugin.json',
		codex: 'plugin.json',
		copilot: 'plugin.json',
		cursor: '.cursor-plugin/plugin.json',
		antigravity: 'plugin.json',
		gemini: 'gemini-extension.json'
	};
	for (const [h, m] of Object.entries(manifests)) assert.equal(json(h, m).name, 'qa-kit', h);
	for (const h of HARNESSES) {
		const runtime = h === 'opencode' ? join(OUT, h, 'qa-kit') : join(OUT, h);
		assert.ok(existsSync(join(runtime, 'bin', 'qa-kit.mjs')), `${h} bundles the CLI`);
		for (const f of filesUnder(join(OUT, h))) {
			if (/\.(md|json|toml|mdc|js)$/.test(f) && !f.includes('/templates/')) assert.doesNotMatch(readFileSync(f, 'utf8'), /\{\{(CLI|ARGS)\}\}/, f);
		}
	}
});

test('Agent Plugins 1.0 packages (Copilot, VS Code, Codex) follow the spec', () => {
	assertAgentPlugin('copilot');
	assertAgentPlugin('codex');
	assert.equal(json('codex', 'plugin.json').extensions['com.openai'].hooks, './hooks/hooks.json');
	assert.equal(json('codex', '.codex-plugin', 'plugin.json').skills, './skills/');
	const copilotHooks = json('copilot', 'com.github.copilot', 'hooks', 'hooks.json');
	assert.equal(copilotHooks.version, 1);
	assert.ok(copilotHooks.hooks.sessionStart[0].bash.includes('--client copilot'));
	assert.ok(existsSync(join(OUT, 'copilot', 'com.github.copilot', 'agents', 'qa-explorer.agent.md')));
});

test('host-specific formats: Claude, Cursor, Antigravity, Gemini, OpenCode', () => {
	assert.match(json('claude', '.mcp.json').mcpServers['qa-kit'].args[0], /^\$\{CLAUDE_PLUGIN_ROOT\}/);
	assert.equal(json('claude', 'hooks', 'hooks.json').hooks.PostToolUse[0].matcher, 'Bash');
	assert.match(text('claude', 'commands', 'status.md'), /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/qa-kit\.mjs/);

	const cursor = json('cursor', '.cursor-plugin', 'plugin.json');
	for (const k of ['skills', 'rules', 'agents', 'commands', 'hooks', 'mcpServers']) assert.ok(existsSync(join(OUT, 'cursor', cursor[k])), k);
	assert.equal(json('cursor', 'hooks', 'hooks.json').version, 1);
	assert.match(json('cursor', 'mcp.json').mcpServers['qa-kit'].args[0], /^\$\{CURSOR_PLUGIN_ROOT\}/);
	assert.match(text('cursor', 'rules', 'qa-kit.mdc'), /^---\ndescription: .+\nalwaysApply: false\n---/);
	assert.doesNotMatch(text('cursor', 'commands', 'qa-status.md'), /CLAUDE_PLUGIN_ROOT/);

	const agy = json('antigravity', 'plugin.json');
	assert.deepEqual(Object.keys(agy).sort(), ['description', 'displayName', 'name', 'suggestedPrompts', 'version']);
	const agyHooks = json('antigravity', 'hooks.json');
	assert.ok(agyHooks['qa-kit-memory'].PreInvocation[0].command.includes('./bin/qa-kit.mjs'));
	assert.equal(agyHooks['qa-kit-record-runs'].PostToolUse[0].matcher, 'run_command');
	assert.doesNotMatch(text('antigravity', 'rules', 'AGENTS.md'), /^---/);

	const gem = json('gemini', 'gemini-extension.json');
	assert.equal(gem.mcpServers['qa-kit'].args[0], '${extensionPath}${/}bin${/}qa-kit.mjs');
	assert.match(text('gemini', 'commands', 'qa', 'status.toml'), /^description = ".+"\nprompt = '''\n[\s\S]+\{\{args\}\}[\s\S]+'''\n$/);
	assert.equal(json('gemini', 'hooks', 'hooks.json').hooks.AfterTool[0].matcher, 'run_shell_command');

	assert.match(text('opencode', 'agents', 'qa-explorer.md'), /mode: subagent\ntools:\n  write: false\n  edit: false/);
	assert.match(text('opencode', 'commands', 'qa-status.md'), /\$ARGUMENTS/);
	assert.match(text('opencode', 'plugins', 'qa-kit.js'), /tool\.execute\.after/);
});

function hook(dist, event, client, payload, env = {}) {
	const bin = join(OUT, dist, 'bin', 'qa-kit.mjs');
	const r = spawnSync('node', [bin, 'hook', event, '--client', client], {
		input: JSON.stringify(payload),
		encoding: 'utf8',
		cwd: join(OUT, dist),
		env: { ...process.env, ...env }
	});
	return r.stdout;
}

test('hooks answer in each host format, started from the plugin folder', () => {
	const root = project();
	const digest = /# qa-kit memory/;
	assert.match(hook('claude', 'session-start', 'claude', { cwd: root }), digest);
	assert.match(JSON.parse(hook('codex', 'session-start', 'codex', { cwd: root })).hookSpecificOutput.additionalContext, digest);
	assert.match(JSON.parse(hook('gemini', 'session-start', 'gemini', { cwd: root })).hookSpecificOutput.additionalContext, digest);
	assert.match(JSON.parse(hook('cursor', 'session-start', 'cursor', { workspace_roots: [root] })).additional_context, digest);
	assert.match(JSON.parse(hook('copilot', 'session-start', 'copilot', { cwd: root, source: 'startup' })).additionalContext, digest);

	const conv = `t${Date.now()}`;
	const first = JSON.parse(hook('antigravity', 'session-start', 'antigravity', { workspacePaths: [root], conversationId: conv }));
	assert.match(first.injectSteps[0].ephemeralMessage, digest);
	assert.deepEqual(JSON.parse(hook('antigravity', 'session-start', 'antigravity', { workspacePaths: [root], conversationId: conv })), {}, 'once per conversation');

	// A Playwright run seen by the post-command hooks gets recorded and reported.
	const ran = (r) => /recorded this Playwright run/.test(r);
	const reportArgs = 'npx playwright test --reporter=json';
	cpSync(join(root, 'report.json'), join(root, '.qa-kit', 'history', 'last-report.json'));
	assert.ok(ran(JSON.parse(hook('claude', 'post-bash', 'claude', { cwd: root, tool_input: { command: reportArgs } })).hookSpecificOutput.additionalContext));
	writeFileSync(join(root, '.qa-kit', 'history', 'last-report.json'), readFileSync(join(root, 'report.json')));
	assert.ok(ran(JSON.parse(hook('copilot', 'post-bash', 'copilot', { cwd: root, toolName: 'bash', toolArgs: JSON.stringify({ command: reportArgs }) })).additionalContext));
	writeFileSync(join(root, '.qa-kit', 'history', 'last-report.json'), readFileSync(join(root, 'report.json')));
	assert.deepEqual(JSON.parse(hook('antigravity', 'post-bash', 'antigravity', { workspacePaths: [root], toolCall: { name: 'run_command', args: { CommandLine: reportArgs } } })), {});
	// Unrelated commands stay silent.
	assert.equal(hook('claude', 'post-bash', 'claude', { cwd: root, tool_input: { command: 'ls -la' } }), '');
	// Hooks started in the plugin folder without a project say nothing instead of scanning the plugin.
	assert.equal(hook('claude', 'session-start', 'claude', {}), '');
});

function mcpSession(cwd, args, { roots } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn('node', args, { cwd, env: { ...process.env } });
		const lines = [];
		let buf = '';
		const send = (m) => child.stdin.write(JSON.stringify(m) + '\n');
		child.stdout.on('data', (d) => {
			buf += d;
			let i;
			while ((i = buf.indexOf('\n')) >= 0) {
				const msg = JSON.parse(buf.slice(0, i));
				buf = buf.slice(i + 1);
				if (msg.method === 'roots/list') send({ jsonrpc: '2.0', id: msg.id, result: { roots: roots.map((r) => ({ uri: pathToFileURL(r).href })) } });
				else lines.push(msg);
				if (lines.some((l) => l.id === 3)) {
					child.kill();
					resolve(lines);
				}
			}
		});
		child.on('error', reject);
		send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: roots ? { roots: { listChanged: true } } : {} } });
		send({ jsonrpc: '2.0', method: 'notifications/initialized' });
		send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
		send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'qa_next_id', arguments: { prefix: 'CRT' } } });
		setTimeout(() => reject(new Error('MCP session timed out')), 10000);
	});
}

test('MCP servers start as each manifest declares and find the project through MCP roots', async () => {
	const root = project();
	const expand = (s, dir) => s.replace('${PLUGIN_ROOT}', join(OUT, dir)).replace('${CURSOR_PLUGIN_ROOT}', join(OUT, dir)).replace('${CLAUDE_PLUGIN_ROOT}', join(OUT, dir)).replace('${extensionPath}${/}bin${/}qa-kit.mjs', join(OUT, dir, 'bin', 'qa-kit.mjs'));
	const servers = {
		copilot: json('copilot', 'mcp.json').mcpServers['qa-kit'],
		codex: json('codex', 'mcp.json').mcpServers['qa-kit'],
		cursor: json('cursor', 'mcp.json').mcpServers['qa-kit'],
		claude: json('claude', '.mcp.json').mcpServers['qa-kit'],
		gemini: json('gemini', 'gemini-extension.json').mcpServers['qa-kit'],
		antigravity: json('antigravity', 'mcp_config.json').mcpServers['qa-kit']
	};
	for (const [dist, s] of Object.entries(servers)) {
		// Hosts start the server in the plugin folder; the project comes from MCP roots.
		const out = await mcpSession(join(OUT, dist), s.args.map((a) => expand(a, dist)), { roots: [root] });
		assert.ok(out.find((l) => l.id === 2).result.tools.length >= 11, dist);
		assert.equal(out.find((l) => l.id === 3).result.content[0].text, 'CRT-10', dist);
	}
	// Without roots or a root argument the server asks for one instead of scanning itself.
	const lost = await mcpSession(join(OUT, 'copilot'), [join(OUT, 'copilot', 'bin', 'qa-kit.mjs'), 'mcp']);
	assert.match(lost.find((l) => l.id === 3).result.content[0].text, /pass `root`/);
});

test('OpenCode config edits keep comments and are idempotent', () => {
	const dir = mkdtempSync(join(tmpdir(), 'qa-kit-oc-'));
	const file = join(dir, 'opencode.jsonc');
	const entry = { type: 'local', command: ['node', '/x/qa-kit.mjs', 'mcp'], enabled: true };
	writeFileSync(file, '{\n\t// my model\n\t"model": "anthropic/claude-sonnet-5-5",\n\t"mcp": {\n\t\t"other": { "type": "remote", "url": "https://x.example/mcp" }, // keep\n\t},\n}\n');
	assert.equal(addOpencodeMcp(file, entry), true);
	assert.equal(addOpencodeMcp(file, entry), true);
	const after = readFileSync(file, 'utf8');
	assert.match(after, /\/\/ my model/);
	assert.match(after, /\/\/ keep/);
	const cfg = parseJsonc(after);
	assert.deepEqual(Object.keys(cfg.mcp).sort(), ['other', 'qa-kit']);
	const fresh = join(dir, 'new', 'opencode.json');
	assert.equal(addOpencodeMcp(fresh, entry), true);
	assert.deepEqual(parseJsonc(readFileSync(fresh, 'utf8')).mcp['qa-kit'], entry);
});
