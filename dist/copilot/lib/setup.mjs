import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { build, HARNESSES } from './build.mjs';
import { KIT_ROOT } from './store.mjs';
import { findRoot, readJSON, readText, writeJSON, writeText } from './util.mjs';

/**
 * Installs the native plugin into each harness the way that harness expects. Without
 * `yes` it only returns the plan. Hosts without a CLI for local installs get a copy into
 * their documented local plugin folder, or instructions when only their UI can install.
 */

export const REPO = 'MahmulP/qa-kit';
/** A git checkout can be referenced by path; an npx/npm copy is temporary, so hosts that keep
 * pointing at the source (Claude, Codex marketplaces) must use the GitHub repo instead. */
const isCheckout = () => existsSync(join(KIT_ROOT, '.git'));
const source = () => (isCheckout() ? KIT_ROOT : REPO);

const has = (bin) => spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' }).status === 0;
const dist = (h) => join(KIT_ROOT, 'dist', h);
const home = () => process.env.HOME || homedir();

/** Runs a host CLI in the user's terminal, so its own prompts (folder trust, consent) show. */
function run(cmd, args) {
	const r = spawnSync(cmd, args, { stdio: 'inherit' });
	return { ok: r.status === 0 };
}

function copyFresh(src, dest) {
	if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
	cpSync(src, dest, { recursive: true });
}

/** JSONC → object, for reading OpenCode configs that may carry comments and trailing commas. */
export function parseJsonc(text) {
	let out = '';
	let inStr = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (inStr) {
			out += c;
			if (c === '\\') out += text[++i] ?? '';
			else if (c === '"') inStr = false;
		} else if (c === '"') {
			inStr = true;
			out += c;
		} else if (c === '/' && text[i + 1] === '/') {
			while (i < text.length && text[i] !== '\n') i++;
			out += '\n';
		} else if (c === '/' && text[i + 1] === '*') {
			i += 2;
			while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
			i++;
		} else out += c;
	}
	return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/**
 * Adds `mcp.qa-kit` to an OpenCode config without rewriting the rest of the file, so the
 * user's comments and formatting survive. Returns false when it could not do it safely.
 */
export function addOpencodeMcp(file, entry) {
	const text = existsSync(file) ? readText(file) : '';
	if (!text.trim()) {
		writeJSON(file, { $schema: 'https://opencode.ai/config.json', mcp: { 'qa-kit': entry } });
		return true;
	}
	const cfg = parseJsonc(text);
	if (cfg.mcp?.['qa-kit']) {
		// Replace an older entry (e.g. the kit moved): only safe on plain JSON.
		if (JSON.stringify(cfg.mcp['qa-kit']) === JSON.stringify(entry)) return true;
		if (/\/\/|\/\*/.test(text)) return false;
		cfg.mcp['qa-kit'] = entry;
		writeJSON(file, cfg);
		return true;
	}
	const snippet = `"qa-kit": ${JSON.stringify(entry)}`;
	let next;
	const mcpKey = text.match(/"mcp"\s*:\s*\{/);
	if (mcpKey) {
		const at = mcpKey.index + mcpKey[0].length;
		const empty = /^\s*\}/.test(text.slice(at));
		next = text.slice(0, at) + `\n\t\t${snippet}${empty ? '' : ','}` + text.slice(at);
	} else {
		const at = text.indexOf('{') + 1;
		const empty = /^\s*\}/.test(text.slice(at));
		next = text.slice(0, at) + `\n\t"mcp": { ${snippet} }${empty ? '' : ','}` + text.slice(at);
	}
	try {
		parseJsonc(next);
	} catch {
		return false;
	}
	writeText(file, next);
	return true;
}

function opencodeDirs(scope, root) {
	if (scope === 'project') {
		if (!root) throw new Error('opencode --scope project needs --root <project> or a project cwd');
		return { dir: join(root, '.opencode'), config: [join(root, 'opencode.jsonc'), join(root, 'opencode.json')] };
	}
	const base = process.env.XDG_CONFIG_HOME || join(home(), '.config');
	const dir = join(base, 'opencode');
	return { dir, config: [join(dir, 'opencode.jsonc'), join(dir, 'opencode.json')] };
}

/** Finds where Antigravity put an installed plugin (folder names can be hashes). */
function antigravityInstalls() {
	const roots = [join(home(), '.gemini', 'config', 'plugins'), join(home(), '.gemini', 'antigravity-cli', 'plugins')];
	const found = [];
	for (const r of roots) {
		if (!existsSync(r)) continue;
		for (const d of readdirSync(r)) {
			if (readJSON(join(r, d, 'plugin.json'))?.name === 'qa-kit') found.push(join(r, d));
		}
	}
	return found;
}

const PLANS = {
	claude: () => ({
		available: has('claude'),
		steps: [
			['run', 'claude', ['plugin', 'marketplace', 'add', source()]],
			['run', 'claude', ['plugin', 'install', 'qa-kit@qa-kit']]
		],
		after: 'Restart Claude Code. Check with /plugin (qa-kit enabled), /mcp (qa-kit connected), and /hooks.'
	}),
	codex: () => ({
		available: has('codex'),
		steps: has('codex')
			? [
					['run', 'codex', ['plugin', 'marketplace', 'add', source()]],
					['run', 'codex', ['plugin', 'add', 'qa-kit@qa-kit']]
				]
			: [],
		after:
			'Restart Codex; check with `codex plugin list` and `codex mcp list`, and review and trust the plugin hooks in /hooks. ' +
			(has('codex') ? '' : `Codex CLI not found: add the marketplace ${REPO} from the app.`)
	}),
	copilot: () => ({
		available: has('copilot'),
		steps: has('copilot')
			? isCheckout()
				? [['run', 'copilot', ['plugin', 'install', dist('copilot')]]]
				: [
						['run', 'copilot', ['plugin', 'marketplace', 'add', REPO]],
						['run', 'copilot', ['plugin', 'install', 'qa-kit@qa-kit']]
					]
			: [],
		after:
			'Copilot CLI: check with /plugin list and /skills list. VS Code: add the marketplace ' +
			`${REPO} (Agent Plugins) and install qa-kit, or install the plugin from the folder ${dist('copilot')}.`
	}),
	cursor: () => {
		const dest = join(home(), '.cursor', 'plugins', 'local', 'qa-kit');
		return {
			available: existsSync(join(home(), '.cursor')),
			steps: [['copy', dist('cursor'), dest]],
			after: 'Run "Developer: Reload Window" in Cursor, then open Customize and check the qa-kit skills, rules, commands, hooks, and MCP server. Teams: import this repository as a team marketplace (.cursor-plugin/marketplace.json).'
		};
	},
	antigravity: () => ({
		available: has('agy'),
		steps: [['run', 'agy', ['plugin', 'install', dist('antigravity')]], ['antigravity-mcp-path']],
		after: 'Restart Antigravity (app, IDE, or agy). Check with `agy plugin list` and the MCP Servers panel.'
	}),
	gemini: () => ({
		available: has('gemini'),
		// link keeps a checkout live; an npx copy is temporary, so install (copy) instead.
		steps: has('gemini') ? [['run', 'gemini', ['extensions', isCheckout() ? 'link' : 'install', dist('gemini')]]] : [],
		after: has('gemini')
			? 'Gemini asks you to trust the extension folder: answer y. Restart Gemini CLI; check with `gemini extensions list`, /mcp, and /qa:status.'
			: 'Gemini CLI not found (it was replaced by Antigravity CLI); use `setup antigravity` instead.'
	}),
	opencode: ({ scope, root }) => {
		const { dir, config } = opencodeDirs(scope, root);
		return {
			available: has('opencode'),
			steps: [['opencode', dir, config]],
			after: 'Restart OpenCode; check with `opencode debug skill`, `opencode mcp list`, and /qa-status.'
		};
	}
};

function describe(step) {
	const [kind, a, b] = step;
	if (kind === 'run') return `${a} ${b.map((x) => (/\s/.test(x) ? JSON.stringify(x) : x)).join(' ')}`;
	if (kind === 'copy') return `copy ${a} → ${b}`;
	if (kind === 'antigravity-mcp-path') return 'point the installed plugin\'s mcp_config.json at its absolute bin/qa-kit.mjs';
	if (kind === 'opencode') return `copy skills, commands, agents, plugin, runtime → ${a}; add mcp.qa-kit to ${b.find(existsSync) ?? b.at(-1)}`;
	return kind;
}

function execute(step) {
	const [kind, a, b] = step;
	if (kind === 'run') {
		const r = run(a, b);
		return `${r.ok ? 'ok' : 'FAILED'}: ${describe(step)}`;
	}
	if (kind === 'copy') {
		copyFresh(a, b);
		return `ok: ${describe(step)}`;
	}
	if (kind === 'antigravity-mcp-path') {
		const installs = antigravityInstalls();
		for (const dir of installs) {
			writeJSON(join(dir, 'mcp_config.json'), { mcpServers: { 'qa-kit': { command: 'node', args: [join(dir, 'bin', 'qa-kit.mjs'), 'mcp'] } } });
		}
		return installs.length ? `ok: MCP path set in ${installs.join(', ')}` : 'FAILED: installed qa-kit plugin not found under ~/.gemini';
	}
	if (kind === 'opencode') {
		const src = dist('opencode');
		for (const sub of ['skills', 'commands', 'agents', 'plugins']) {
			for (const name of readdirSync(join(src, sub))) copyFresh(join(src, sub, name), join(a, sub, name));
		}
		copyFresh(join(src, 'qa-kit'), join(a, 'qa-kit'));
		const entry = { type: 'local', command: ['node', join(a, 'qa-kit', 'bin', 'qa-kit.mjs'), 'mcp'], enabled: true };
		const file = b.find(existsSync) ?? b.at(-1);
		const ok = addOpencodeMcp(file, entry);
		return ok
			? `ok: ${describe(step)}`
			: `PARTIAL: files copied, but ${file} could not be edited safely. Add under "mcp": "qa-kit": ${JSON.stringify(entry)}`;
	}
	return `skipped ${kind}`;
}

export async function setup(target, { yes = false, scope = 'user', root } = {}) {
	if (!target) return `Usage: qa-kit setup <${HARNESSES.join('|')}|all> [--yes] [--scope user|project]`;
	if (!existsSync(join(KIT_ROOT, 'commands'))) throw new Error('Run setup from the qa-kit source checkout (it builds dist/ first).');
	const projectRoot = scope === 'project' ? findRoot(root ?? null) : null;
	const targets = target === 'all' ? HARNESSES : [target];
	for (const t of targets) if (!PLANS[t]) throw new Error(`Unknown harness "${t}". Use: ${HARNESSES.join(', ')}, all`);

	if (yes) build({ only: targets });
	const out = [];
	for (const t of targets) {
		const plan = PLANS[t]({ scope, root: projectRoot });
		if (target === 'all' && !plan.available) {
			out.push(`- ${t}: not found on this machine, skipped`);
			continue;
		}
		out.push(`## ${t}${plan.available ? '' : ' (CLI not found)'}`);
		for (const step of plan.steps) out.push(yes ? `  ${execute(step)}` : `  would ${describe(step)}`);
		out.push(`  next: ${plan.after}`);
	}
	if (!yes) out.push('\nNothing changed. Re-run with --yes to apply.');
	return out.join('\n');
}
