import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, TEMPLATES, ensureStore, loadConfig, saveConfig, storePaths } from './store.mjs';
import { readJSON, readText, writeJSON, writeText } from './util.mjs';

export const TARGETS = {
	'agents-md': 'AGENTS.md block (Codex, OpenCode, Amp, Jules, Cursor, Copilot coding agent, Windsurf read it)',
	skills: 'Agent Skills into .agents/skills/ (Codex, Cursor, Antigravity, Gemini CLI, OpenCode)',
	claude: 'Without the plugin: .claude/skills/ + .mcp.json (prefer `qa-kit setup claude`)',
	codex: '.codex/config.toml MCP server + skills',
	cursor: '.cursor/rules/qa-kit.mdc + .cursor/mcp.json + skills',
	gemini: 'GEMINI.md block + .gemini/settings.json MCP server + skills',
	copilot: '.github/instructions/qa-kit.instructions.md + .github/skills/ + .vscode/mcp.json',
	antigravity: '.agents/rules/qa-kit.md + .agents/mcp_config.json + .agents/skills/'
};

const START = '<!-- qa-kit:start -->';
const END = '<!-- qa-kit:end -->';

function upsertBlock(file, body, { start = START, end = END } = {}) {
	const block = `${start}\n${body.trim()}\n${end}`;
	const text = readText(file, '');
	const re = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
	const next = re.test(text) ? text.replace(re, block) : (text.trim() ? text.replace(/\s*$/, '\n\n') : '') + block + '\n';
	writeText(file, next);
}

function mergeJSON(file, mutate) {
	const data = readJSON(file, {});
	mutate(data);
	writeJSON(file, data);
}

/** Command used in generated configs and docs to call the CLI / MCP server. */
export function kitCommand({ portable } = {}) {
	if (portable) return { cli: 'npx -y qa-kit', mcp: { command: 'npx', args: ['-y', 'qa-kit', 'mcp'] } };
	const bin = join(KIT_ROOT, 'bin', 'qa-kit.mjs');
	return { cli: `node "${bin}"`, mcp: { command: 'node', args: [bin, 'mcp'] } };
}

function copySkills(root, dest, { link }) {
	const src = join(KIT_ROOT, 'skills');
	const written = [];
	for (const name of readdirSync(src)) {
		const target = join(root, dest, name);
		if (existsSync(target) || isLink(target)) rmSync(target, { recursive: true, force: true });
		mkdirSync(join(root, dest), { recursive: true });
		if (link) symlinkSync(join(src, name), target, 'dir');
		else cpSync(join(src, name), target, { recursive: true });
		written.push(`${dest}/${name}`);
	}
	return written;
}

function isLink(p) {
	try {
		return lstatSync(p).isSymbolicLink();
	} catch {
		return false;
	}
}

function rulesBody(root, cli) {
	const config = loadConfig(root);
	const docs = config.rules?.length ? config.rules : readJSON(storePaths(root).structure)?.ruleDocs ?? [];
	const ruleDocs = docs.length ? ` (${docs.slice(0, 6).map((d) => `\`${d}\``).join(', ')})` : '';
	return readText(join(TEMPLATES, 'adapters', 'agents-block.md'))
		.replaceAll('{{QA_KIT}}', cli)
		.replace('{{RULE_DOCS}}', ruleDocs);
}

/**
 * Writes harness adapters into the project. Idempotent: managed blocks are replaced, JSON
 * configs are merged under the `qa-kit` key only, skills are re-copied.
 */
export function install(root, targets, { link = false, portable = false, dryRun = false } = {}) {
	if (!dryRun) ensureStore(root);
	const { cli, mcp } = kitCommand({ portable });
	const config = loadConfig(root);
	config.kit = { cli, installedTargets: [...new Set([...(config.kit?.installedTargets ?? []), ...targets])] };
	const plan = [];
	const notes = [];
	const body = rulesBody(root, cli);
	const testGlob = `${config.e2e.testDir ?? 'e2e'}/**`;
	const skillDirs = new Set();

	for (const t of targets) {
		switch (t) {
			case 'agents-md':
				plan.push(['AGENTS.md', () => upsertBlock(join(root, 'AGENTS.md'), body)]);
				break;
			case 'skills':
				skillDirs.add('.agents/skills');
				break;
			case 'claude':
				skillDirs.add('.claude/skills');
				plan.push(['.mcp.json', () => mergeJSON(join(root, '.mcp.json'), (d) => ((d.mcpServers ??= {})['qa-kit'] = { type: 'stdio', ...mcp }))]);
				notes.push('Claude Code: installing the plugin (`/plugin marketplace add <path>` then `/plugin install qa-kit`) also gives you hooks, commands, and subagents.');
				break;
			case 'codex': {
				skillDirs.add('.agents/skills');
				const toml = `[mcp_servers.qa-kit]\ncommand = ${JSON.stringify(mcp.command)}\nargs = ${JSON.stringify(mcp.args)}`;
				plan.push(['.codex/config.toml', () => upsertBlock(join(root, '.codex/config.toml'), toml, { start: '# qa-kit:start', end: '# qa-kit:end' })]);
				notes.push('Codex reads project .codex/config.toml only for trusted projects; otherwise copy the [mcp_servers.qa-kit] block into ~/.codex/config.toml.');
				break;
			}
			case 'cursor':
				skillDirs.add('.agents/skills');
				plan.push([
					'.cursor/rules/qa-kit.mdc',
					() => writeText(join(root, '.cursor/rules/qa-kit.mdc'), `---\ndescription: QA automation with qa-kit memory, test-case catalogs, and Playwright conventions\nglobs: ${testGlob}\nalwaysApply: false\n---\n\n${body}\n`)
				]);
				plan.push(['.cursor/mcp.json', () => mergeJSON(join(root, '.cursor/mcp.json'), (d) => ((d.mcpServers ??= {})['qa-kit'] = mcp))]);
				break;
			case 'gemini':
				skillDirs.add('.agents/skills');
				plan.push(['GEMINI.md', () => upsertBlock(join(root, 'GEMINI.md'), body)]);
				plan.push(['.gemini/settings.json', () => mergeJSON(join(root, '.gemini/settings.json'), (d) => ((d.mcpServers ??= {})['qa-kit'] = mcp))]);
				break;
			case 'copilot':
				skillDirs.add('.github/skills');
				plan.push([
					'.github/instructions/qa-kit.instructions.md',
					() => writeText(join(root, '.github/instructions/qa-kit.instructions.md'), `---\napplyTo: "${testGlob}"\n---\n\n${body}\n`)
				]);
				plan.push(['.vscode/mcp.json', () => mergeJSON(join(root, '.vscode/mcp.json'), (d) => ((d.servers ??= {})['qa-kit'] = { type: 'stdio', ...mcp }))]);
				break;
			case 'antigravity':
				// Antigravity reads `.agents/` as a workspace customization root.
				skillDirs.add('.agents/skills');
				plan.push(['.agents/rules/qa-kit.md', () => writeText(join(root, '.agents/rules/qa-kit.md'), body + '\n')]);
				plan.push(['.agents/mcp_config.json', () => mergeJSON(join(root, '.agents/mcp_config.json'), (d) => ((d.mcpServers ??= {})['qa-kit'] = mcp))]);
				break;
			default:
				throw new Error(`Unknown target "${t}". Targets: ${Object.keys(TARGETS).join(', ')}, all`);
		}
	}
	for (const dir of skillDirs) plan.push([`${dir}/qa-*`, () => copySkills(root, dir, { link })]);
	plan.push(['.qa-kit/config.json', () => saveConfig(root, config)]);

	if (!dryRun) for (const [, fn] of plan) fn();
	return { files: plan.map(([f]) => f), notes, cli };
}
