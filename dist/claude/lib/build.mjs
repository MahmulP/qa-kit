import { cpSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { KIT_ROOT, TEMPLATES } from './store.mjs';
import { readJSON, readText, writeJSON, writeText } from './util.mjs';

/**
 * Builds one native plugin per harness from the single source in this repo (skills/,
 * agents/, commands/, bin/, lib/, templates/). Each dist folder is self-contained: hosts
 * that copy a plugin into a cache (Codex, Copilot, Claude) keep working because every
 * path stays inside the plugin root.
 *
 *   dist/claude        Claude Code plugin            (.claude-plugin/plugin.json)
 *   dist/codex         Codex plugin                  (plugin.json Agent Plugins 1.0 + .codex-plugin overlay)
 *   dist/copilot       Agent Plugins 1.0 plugin      (Copilot CLI, VS Code; com.github.copilot/ extras)
 *   dist/cursor        Cursor plugin                 (.cursor-plugin/plugin.json)
 *   dist/antigravity   Antigravity plugin            (plugin.json, mcp_config.json, hooks.json, rules/)
 *   dist/gemini        Gemini CLI extension          (gemini-extension.json)
 *   dist/opencode      OpenCode bundle               (skills, commands, agents, plugin JS; installed by `qa-kit setup opencode`)
 */

export const HARNESSES = ['claude', 'codex', 'copilot', 'cursor', 'antigravity', 'gemini', 'opencode'];

const AGENT_PLUGINS_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';
const AGENT_PLUGINS_MCP_SCHEMA = 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json';
const RUNTIME = ['bin', 'lib', 'templates', 'package.json'];

function meta() {
	const pkg = readJSON(join(KIT_ROOT, 'package.json'));
	return {
		name: 'qa-kit',
		version: pkg.version,
		description:
			'QA automation for web apps: per-app and global memory that keeps learning, test-case catalogs joined with Playwright specs, authoring and triage skills, and an MCP server.',
		author: { name: 'Machmul Pratama', url: 'https://github.com/MahmulP' },
		homepage: 'https://github.com/MahmulP/qa-kit',
		repository: 'https://github.com/MahmulP/qa-kit',
		license: pkg.license ?? 'MIT',
		keywords: ['qa', 'playwright', 'e2e', 'testing', 'memory', 'mcp', 'test-cases']
	};
}

/* ------------------------------------------------------------- sources */

function frontmatter(md) {
	const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
	const data = {};
	if (m) {
		for (const line of m[1].split('\n')) {
			const kv = line.match(/^([\w-]+):\s*(.*)$/);
			if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '');
		}
	}
	return { data, body: m ? md.slice(m[0].length) : md };
}

function sources() {
	const read = (dir) =>
		readdirSync(join(KIT_ROOT, dir))
			.filter((f) => f.endsWith('.md'))
			.sort()
			.map((f) => ({ file: f, name: f.replace(/\.md$/, ''), ...frontmatter(readText(join(KIT_ROOT, dir, f))) }));
	return { commands: read('commands'), agents: read('agents') };
}

const yaml = (obj) =>
	'---\n' +
	Object.entries(obj)
		.filter(([, v]) => v !== undefined && v !== null && v !== '')
		.map(([k, v]) => `${k}: ${typeof v === 'string' && /[:#"']/.test(v) ? JSON.stringify(v) : v}`)
		.join('\n') +
	'\n---\n';

/** CLI as written in prompts. Only Claude Code expands a plugin path inside command text. */
const CLI_IN_TEXT = {
	claude: 'node "${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs"',
	default: 'qa-kit'
};
const CLI_NOTE = '\n\nIf `qa-kit` is not on PATH, use the CLI command that the `qa_status` tool prints.\n';

function renderCommand(cmd, harness, argsToken) {
	const cli = CLI_IN_TEXT[harness] ?? CLI_IN_TEXT.default;
	let body = cmd.body.replaceAll('{{CLI}}', cli).replaceAll('{{ARGS}}', argsToken);
	if (harness !== 'claude') body = body.trimEnd() + CLI_NOTE;
	return body;
}

function contextText(cli = 'qa-kit') {
	return readText(join(TEMPLATES, 'adapters', 'plugin-context.md')).replaceAll('{{CLI}}', cli);
}

/* --------------------------------------------------------------- copying */

function copyRuntime(dest) {
	for (const item of RUNTIME) cpSync(join(KIT_ROOT, item), join(dest, item), { recursive: true });
}

function copySkills(dest, sub = 'skills') {
	cpSync(join(KIT_ROOT, 'skills'), join(dest, sub), { recursive: true });
}

/** Hook command for a harness; `rootExpr` is how that host spells the plugin directory. */
const hookCmd = (rootExpr, event, client) => `node "${rootExpr}/bin/qa-kit.mjs" hook ${event} --client ${client}`;

/* ------------------------------------------------------------- harnesses */

const builders = {
	claude(dest, m, src) {
		copyRuntime(dest);
		copySkills(dest);
		writeJSON(join(dest, '.claude-plugin', 'plugin.json'), {
			name: m.name,
			version: m.version,
			description: m.description,
			author: m.author,
			homepage: m.homepage,
			repository: m.repository,
			license: m.license,
			keywords: m.keywords
		});
		writeJSON(join(dest, '.mcp.json'), {
			mcpServers: { 'qa-kit': { command: 'node', args: ['${CLAUDE_PLUGIN_ROOT}/bin/qa-kit.mjs', 'mcp'] } }
		});
		const root = '${CLAUDE_PLUGIN_ROOT}';
		writeJSON(join(dest, 'hooks', 'hooks.json'), {
			hooks: {
				SessionStart: [{ hooks: [{ type: 'command', command: hookCmd(root, 'session-start', 'claude'), timeout: 20 }] }],
				PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hookCmd(root, 'post-bash', 'claude'), timeout: 30 }] }]
			}
		});
		for (const c of src.commands) {
			writeText(join(dest, 'commands', c.file), yaml({ description: c.data.description, 'argument-hint': c.data['argument-hint'] }) + '\n' + renderCommand(c, 'claude', '$ARGUMENTS'));
		}
		for (const a of src.agents) {
			writeText(join(dest, 'agents', a.file), yaml({ name: a.name, description: a.data.description, tools: a.data.tools }) + '\n' + a.body);
		}
	},

	codex(dest, m) {
		copyRuntime(dest);
		copySkills(dest);
		const iface = {
			displayName: 'qa-kit',
			shortDescription: 'QA automation memory, test-case catalogs, and Playwright skills',
			longDescription: m.description,
			developerName: m.author.name,
			category: 'Coding',
			websiteURL: m.homepage,
			capabilities: ['Read', 'Write'],
			defaultPrompt: ['Show what qa-kit knows about this app.', 'Design test cases for the checkout page.', 'Why did the last Playwright run fail?']
		};
		writeJSON(join(dest, 'plugin.json'), {
			$schema: AGENT_PLUGINS_SCHEMA,
			name: m.name,
			version: m.version,
			description: m.description,
			author: m.author,
			homepage: m.homepage,
			repository: m.repository,
			license: m.license,
			keywords: m.keywords,
			extensions: { 'com.openai': { hooks: './hooks/hooks.json', interface: iface } }
		});
		// Older Codex builds read only this overlay; newer ones prefer extensions.com.openai.
		writeJSON(join(dest, '.codex-plugin', 'plugin.json'), {
			name: m.name,
			version: m.version,
			description: m.description,
			author: m.author,
			homepage: m.homepage,
			repository: m.repository,
			license: m.license,
			keywords: m.keywords,
			skills: './skills/',
			mcpServers: './mcp.json',
			hooks: './hooks/hooks.json',
			interface: iface
		});
		writeJSON(join(dest, 'mcp.json'), {
			$schema: AGENT_PLUGINS_MCP_SCHEMA,
			mcpServers: { 'qa-kit': { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/bin/qa-kit.mjs', 'mcp'] } }
		});
		// Codex runs hook commands through the shell with PLUGIN_ROOT set.
		const root = '$PLUGIN_ROOT';
		writeJSON(join(dest, 'hooks', 'hooks.json'), {
			hooks: {
				SessionStart: [{ hooks: [{ type: 'command', command: hookCmd(root, 'session-start', 'codex'), timeout: 20 }] }],
				PostToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: hookCmd(root, 'post-bash', 'codex'), timeout: 30 }] }]
			}
		});
	},

	copilot(dest, m, src) {
		copyRuntime(dest);
		copySkills(dest);
		writeJSON(join(dest, 'plugin.json'), {
			$schema: AGENT_PLUGINS_SCHEMA,
			name: m.name,
			version: m.version,
			description: m.description,
			author: m.author,
			homepage: m.homepage,
			repository: m.repository,
			license: m.license,
			keywords: m.keywords
		});
		writeJSON(join(dest, 'mcp.json'), {
			$schema: AGENT_PLUGINS_MCP_SCHEMA,
			mcpServers: { 'qa-kit': { type: 'stdio', command: 'node', args: ['${PLUGIN_ROOT}/bin/qa-kit.mjs', 'mcp'] } }
		});
		const ns = join(dest, 'com.github.copilot');
		for (const a of src.agents) {
			writeText(join(ns, 'agents', `${a.name}.agent.md`), yaml({ name: a.name, description: a.data.description }) + '\n' + a.body);
		}
		// Copilot documents PLUGIN_ROOT for MCP only; fall back to other spellings, never fail the session.
		const bash = (event) =>
			`d="\${PLUGIN_ROOT:-\${COPILOT_PLUGIN_ROOT:-\${CLAUDE_PLUGIN_ROOT:-.}}}"; [ -f "$d/bin/qa-kit.mjs" ] && node "$d/bin/qa-kit.mjs" hook ${event} --client copilot || true`;
		writeJSON(join(ns, 'hooks', 'hooks.json'), {
			version: 1,
			hooks: {
				sessionStart: [{ type: 'command', bash: bash('session-start'), timeoutSec: 20 }],
				postToolUse: [{ type: 'command', bash: bash('post-bash'), timeoutSec: 30 }]
			}
		});
	},

	cursor(dest, m, src) {
		copyRuntime(dest);
		copySkills(dest);
		writeJSON(join(dest, '.cursor-plugin', 'plugin.json'), {
			name: m.name,
			displayName: 'qa-kit',
			version: m.version,
			description: m.description,
			author: m.author,
			homepage: m.homepage,
			repository: m.repository,
			license: m.license,
			keywords: m.keywords,
			skills: './skills/',
			rules: './rules/',
			agents: './agents/',
			commands: './commands/',
			hooks: './hooks/hooks.json',
			mcpServers: './mcp.json'
		});
		writeJSON(join(dest, 'mcp.json'), {
			mcpServers: { 'qa-kit': { command: 'node', args: ['${CURSOR_PLUGIN_ROOT}/bin/qa-kit.mjs', 'mcp'] } }
		});
		// Plugin hooks run from the plugin directory; CURSOR_PLUGIN_ROOT points there too.
		const root = '${CURSOR_PLUGIN_ROOT:-.}';
		writeJSON(join(dest, 'hooks', 'hooks.json'), {
			version: 1,
			hooks: {
				sessionStart: [{ command: hookCmd(root, 'session-start', 'cursor'), timeout: 20 }],
				afterShellExecution: [{ command: hookCmd(root, 'post-bash', 'cursor'), timeout: 30 }]
			}
		});
		writeText(
			join(dest, 'rules', 'qa-kit.mdc'),
			yaml({ description: 'QA automation with qa-kit: memory, test-case catalogs, Playwright conventions', alwaysApply: false }) + '\n' + contextText()
		);
		for (const c of src.commands) {
			writeText(join(dest, 'commands', `qa-${c.file}`), yaml({ name: `qa-${c.name}`, description: c.data.description }) + '\n' + renderCommand(c, 'cursor', 'the text the user typed after the command'));
		}
		for (const a of src.agents) {
			writeText(join(dest, 'agents', a.file), yaml({ name: a.name, description: a.data.description }) + '\n' + a.body);
		}
	},

	antigravity(dest, m, src) {
		copyRuntime(dest);
		copySkills(dest);
		// Antigravity reads only these keys; others are discarded.
		writeJSON(join(dest, 'plugin.json'), {
			name: m.name,
			displayName: 'qa-kit',
			version: m.version,
			description: m.description,
			suggestedPrompts: ['Show what qa-kit knows about this app', 'Design test cases for the checkout page', 'Why did the last Playwright run fail?']
		});
		// Hooks run with the plugin directory (where hooks.json lives) as working directory.
		writeJSON(join(dest, 'hooks.json'), {
			'qa-kit-memory': {
				PreInvocation: [{ type: 'command', command: hookCmd('.', 'session-start', 'antigravity'), timeout: 20 }]
			},
			'qa-kit-record-runs': {
				PostToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: hookCmd('.', 'post-bash', 'antigravity'), timeout: 30 }] }]
			}
		});
		// Rewritten with an absolute path by `qa-kit setup antigravity`; relative works when the
		// server starts in the plugin directory.
		writeJSON(join(dest, 'mcp_config.json'), {
			mcpServers: { 'qa-kit': { command: 'node', args: ['./bin/qa-kit.mjs', 'mcp'] } }
		});
		writeText(join(dest, 'rules', 'AGENTS.md'), contextText());
		// Antigravity turns plugin commands into skills invoked by name.
		for (const c of src.commands) {
			writeText(join(dest, 'commands', `qa-${c.file}`), yaml({ description: c.data.description, 'argument-hint': c.data['argument-hint'] }) + '\n' + renderCommand(c, 'antigravity', '$ARGUMENTS'));
		}
		for (const a of src.agents) {
			writeText(join(dest, 'agents', a.file), yaml({ name: a.name, description: a.data.description }) + '\n' + a.body);
		}
	},

	gemini(dest, m, src) {
		copyRuntime(dest);
		copySkills(dest);
		writeJSON(join(dest, 'gemini-extension.json'), {
			name: m.name,
			version: m.version,
			description: m.description,
			contextFileName: 'GEMINI.md',
			mcpServers: { 'qa-kit': { command: 'node', args: ['${extensionPath}${/}bin${/}qa-kit.mjs', 'mcp'] } }
		});
		writeText(join(dest, 'GEMINI.md'), contextText());
		const root = '${extensionPath}';
		writeJSON(join(dest, 'hooks', 'hooks.json'), {
			hooks: {
				SessionStart: [{ hooks: [{ type: 'command', command: hookCmd(root, 'session-start', 'gemini'), timeout: 20000 }] }],
				AfterTool: [{ matcher: 'run_shell_command', hooks: [{ type: 'command', command: hookCmd(root, 'post-bash', 'gemini'), timeout: 30000 }] }]
			}
		});
		for (const c of src.commands) {
			const prompt = renderCommand(c, 'gemini', '{{args}}');
			if (prompt.includes("'''")) throw new Error(`commands/${c.file} contains ''' which breaks TOML`);
			writeText(join(dest, 'commands', 'qa', `${c.name}.toml`), `description = ${JSON.stringify(c.data.description ?? c.name)}\nprompt = '''\n${prompt.trim()}\n'''\n`);
		}
	},

	opencode(dest, m, src) {
		// Layout mirrors an OpenCode config dir so `qa-kit setup opencode` can copy it as is.
		copyRuntime(join(dest, 'qa-kit'));
		copySkills(dest);
		for (const c of src.commands) {
			writeText(join(dest, 'commands', `qa-${c.file}`), yaml({ description: c.data.description }) + '\n' + renderCommand(c, 'opencode', '$ARGUMENTS'));
		}
		for (const a of src.agents) {
			const readOnly = !/Edit|Write/.test(a.data.tools ?? '');
			writeText(
				join(dest, 'agents', a.file),
				yaml({ description: a.data.description, mode: 'subagent' }).replace('\n---\n', readOnly ? '\ntools:\n  write: false\n  edit: false\n---\n' : '\n---\n') + '\n' + a.body
			);
		}
		writeText(join(dest, 'plugins', 'qa-kit.js'), OPENCODE_PLUGIN);
		writeJSON(join(dest, 'qa-kit.mcp.json'), {
			mcp: { 'qa-kit': { type: 'local', command: ['node', '{{KIT}}/bin/qa-kit.mjs', 'mcp'], enabled: true } }
		});
	}
};

const OPENCODE_PLUGIN = `// qa-kit for OpenCode: records Playwright runs started from the bash tool and shows the
// result to the agent. Installed by \`qa-kit setup opencode\` next to ../qa-kit/.
const kit = new URL('../qa-kit/lib/hooks.mjs', import.meta.url);

export const QaKit = async ({ directory, worktree }) => {
	const { postRunContext } = await import(kit.href);
	return {
		'tool.execute.after': async (input, output) => {
			if (input?.tool !== 'bash') return;
			const command = input?.args?.command ?? output?.metadata?.command ?? '';
			const text = postRunContext(worktree || directory, command, { requireCommand: Boolean(command) });
			if (text && typeof output?.output === 'string') output.output += '\\n\\n' + text;
		}
	};
};
`;

/** Writes dist/<harness>/ for each requested harness (all by default). */
export function build({ out = join(KIT_ROOT, 'dist'), only = HARNESSES } = {}) {
	const m = meta();
	const src = sources();
	const written = [];
	for (const h of only) {
		if (!builders[h]) throw new Error(`Unknown harness "${h}". Harnesses: ${HARNESSES.join(', ')}`);
		const dest = join(out, h);
		if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
		builders[h](dest, m, src);
		writeText(
			join(dest, 'README.md'),
			`# qa-kit for ${h}\n\nGenerated by \`qa-kit build\` from ${m.homepage}. Do not edit; change the sources and rebuild.\nInstall instructions: ${m.homepage}#install\n`
		);
		written.push(dest);
	}
	return written;
}
