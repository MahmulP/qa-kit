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
/** Extra packages that are not installed by `setup`, e.g. directory submissions. */
export const PACKAGES = [...HARNESSES, 'codex-directory'];

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
		privacy: 'https://github.com/MahmulP/qa-kit/blob/main/PRIVACY.md',
		support: 'https://github.com/MahmulP/qa-kit/issues',
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

/** Listing fields for Codex / ChatGPT. Display name and short description: 30 chars max. */
function codexInterface(m) {
	return {
		displayName: 'qa-kit',
		shortDescription: 'QA memory + Playwright skills',
		longDescription:
			'qa-kit gives Codex a long-term QA memory for each web app and a disciplined Playwright workflow: map the app, design test cases from requirements, write specs in the project conventions, triage failures, and save what was learned for the next session.',
		developerName: m.author.name,
		category: 'Coding',
		capabilities: ['Read', 'Write'],
		websiteURL: m.homepage,
		privacyPolicyURL: m.privacy,
		defaultPrompt: ['Show what qa-kit knows about this app.', 'Design test cases for the checkout page.', 'Why did the last Playwright run fail?'],
		brandColor: '#10B981',
		composerIcon: './assets/icon.png',
		logo: './assets/icon.png'
	};
}

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
		const iface = codexInterface(m);
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

	/**
	 * Upload for the public Codex / ChatGPT Plugins Directory, which accepts neither hooks nor
	 * local MCP servers: skills only. The skills fall back to `npx -y github:MahmulP/qa-kit`
	 * for the CLI; the full plugin (dist/codex) keeps hooks and the MCP server.
	 */
	'codex-directory'(dest, m) {
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
			keywords: m.keywords,
			extensions: { 'com.openai': { interface: codexInterface(m) } }
		});
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
			interface: codexInterface(m)
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
			mcpServers: './mcp.json',
			logo: './assets/icon.png'
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
			logo: 'assets/icon.png',
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

const INSTALL = {
	claude: ['/plugin install qa-kit --marketplace MahmulP/qa-kit', 'or: claude plugin marketplace add MahmulP/qa-kit && claude plugin install qa-kit@qa-kit'],
	codex: ['codex plugin marketplace add MahmulP/qa-kit', 'then install qa-kit from /plugins (CLI) or the Plugins Directory (app), and trust its hooks in /hooks'],
	'codex-directory': ['Install qa-kit from the Codex Plugins Directory.', 'For hooks and the MCP server, use the full plugin: codex plugin marketplace add MahmulP/qa-kit'],
	copilot: ['copilot plugin marketplace add MahmulP/qa-kit && copilot plugin install qa-kit@qa-kit', 'VS Code: add the marketplace MahmulP/qa-kit (Agent Plugins) and install qa-kit'],
	cursor: ['npx -y github:MahmulP/qa-kit setup cursor --yes', 'teams: import https://github.com/MahmulP/qa-kit as a team marketplace'],
	antigravity: ['npx -y github:MahmulP/qa-kit setup antigravity --yes'],
	gemini: ['npx -y github:MahmulP/qa-kit setup gemini --yes'],
	opencode: ['npx -y github:MahmulP/qa-kit setup opencode --yes']
};

const LABEL = {
	claude: 'Claude Code',
	codex: 'Codex',
	'codex-directory': 'the Codex Plugins Directory (skills only)',
	copilot: 'GitHub Copilot CLI and VS Code (Agent Plugins 1.0)',
	cursor: 'Cursor',
	antigravity: 'Antigravity',
	gemini: 'Gemini CLI',
	opencode: 'OpenCode'
};

function packageReadme(h, m) {
	const parts = {
		skills: 'six skills (qa-automation, qa-explore-app, qa-test-cases, qa-playwright-author, qa-run-triage, qa-memory)',
		mcp: 'the qa-kit MCP server with 11 tools for memory, the test-case index, coverage gaps, and run history',
		hooks: 'hooks that load the memory digest at session start and record Playwright runs automatically'
	};
	const has = h === 'codex-directory' ? [parts.skills] : [parts.skills, parts.mcp, parts.hooks];
	return `# qa-kit for ${LABEL[h]}

qa-kit is a QA automation plugin for coding agents. It keeps a long-term memory for each web
app (modules, routes, test conventions, selectors, known bugs, flaky tests, decisions) and
global lessons shared across apps, and guides the agent through a disciplined Playwright
workflow: map the app, design test cases from requirements, write specs in the project's own
conventions, run only when asked, triage failures, and save what was learned.

This package contains ${has.join('; ')}.

## Install

\`\`\`
${INSTALL[h].join('\n')}
\`\`\`

Then open a web app repository and ask the agent to "set up qa-kit for this app".
Everything runs locally; qa-kit sends no data anywhere (see ${m.privacy}).

Generated by \`qa-kit build\` from ${m.homepage}. Do not edit this folder; change the
sources there and rebuild. Documentation: ${m.homepage}#readme. License: ${m.license}.
`;
}

/** Writes dist/<package>/ for each requested package (every harness by default). */
export function build({ out = join(KIT_ROOT, 'dist'), only = PACKAGES } = {}) {
	const m = meta();
	const src = sources();
	const written = [];
	for (const h of only) {
		if (!builders[h]) throw new Error(`Unknown package "${h}". Packages: ${PACKAGES.join(', ')}`);
		const dest = join(out, h);
		if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
		builders[h](dest, m, src);
		cpSync(join(KIT_ROOT, 'assets', 'icon.png'), join(dest, 'assets', 'icon.png'));
		writeText(join(dest, 'README.md'), packageReadme(h, m));
		written.push(dest);
	}
	return written;
}
