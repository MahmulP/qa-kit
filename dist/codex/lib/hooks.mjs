import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { kitCommand } from './install.mjs';
import { memoryDigest } from './memory.mjs';
import { formatIngest, ingest } from './results.mjs';
import { findPlaywrightConfig } from './scan.mjs';
import { hasStore, storePaths } from './store.mjs';
import { findRoot, readJSON, writeText } from './util.mjs';

/** True for `playwright test …` or any package script that the scan saw running Playwright. */
function runsPlaywright(root, command) {
	if (/playwright\s+test/.test(command)) return true;
	const scripts = Object.entries(readJSON(storePaths(root).structure)?.scripts ?? {})
		.filter(([, v]) => /playwright\s+test/.test(v))
		.map(([k]) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
	return scripts.length > 0 && new RegExp(`(^|\\s)(${scripts.join('|')})(\\s|$)`).test(command);
}

/** Text for the agent at session start, or null when the project does not use Playwright. */
export function sessionContext(root) {
	if (!root) return null;
	if (hasStore(root)) return `${memoryDigest(root)}\nqa-kit CLI: ${kitCommand().cli} <command> (help lists commands)`;
	if (findPlaywrightConfig(root)) {
		return `qa-kit: this project has Playwright but no .qa-kit/ memory yet. When the user asks for QA work, run \`${kitCommand().cli} init\` (or the qa_scan tool) first.`;
	}
	return null;
}

/**
 * Records the run a shell command just finished and returns what the agent should see, or
 * null. With `requireCommand: false` (hosts that do not pass the command) it only reports
 * when there are new results.
 */
export function postRunContext(root, command = '', { requireCommand = true } = {}) {
	if (!root || !hasStore(root) || /qa-kit(\.mjs)?"?\s+run/.test(command)) return null;
	if (requireCommand && !runsPlaywright(root, command)) return null;
	if (!requireCommand && command && !runsPlaywright(root, command)) return null;
	// Only artifacts from this run: error-context files older than a few hours are history.
	const res = ingest(root, { command, sinceMs: Date.now() - 3 * 3600_000 });
	if (!res.summary) return null;
	return (
		`qa-kit recorded this Playwright run.\n${formatIngest(res)}\n` +
		'Triage failures (app bug / test bug / environment / flaky) before changing assertions, and save durable lessons with qa_memory_add or `qa-kit memory add`.'
	);
}

/* ---------------------------------------------------------------- clients */

const firstString = (...vals) => vals.find((v) => typeof v === 'string' && v.length > 0);

/** Finds a shell command in a tool-arguments object whatever the host calls the field. */
function commandIn(args) {
	if (!args) return '';
	if (typeof args === 'string') {
		try {
			return commandIn(JSON.parse(args));
		} catch {
			return args;
		}
	}
	return firstString(args.command, args.CommandLine, args.commandLine, args.cmd, args.script) ?? '';
}

/**
 * How each host passes the project and the shell command, and how it wants context back.
 * Payload shapes follow each host's hook documentation.
 */
const CLIENTS = {
	claude: {
		root: (i) => i.cwd,
		command: (i) => i.tool_input?.command,
		session: (text) => text,
		post: (text) => ({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } })
	},
	codex: {
		root: (i) => i.cwd,
		command: (i) => i.tool_input?.command,
		session: (text) => ({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }),
		post: (text) => ({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } })
	},
	gemini: {
		root: (i) => i.cwd,
		command: (i) => i.tool_input?.command,
		session: (text) => ({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }),
		post: (text) => ({ hookSpecificOutput: { hookEventName: 'AfterTool', additionalContext: text } })
	},
	cursor: {
		root: (i) => i.workspace_roots?.[0] ?? process.env.CURSOR_PROJECT_DIR,
		command: (i) => i.command ?? i.tool_input?.command,
		session: (text) => ({ additional_context: text }),
		// afterShellExecution has no output channel; recording the run is the effect.
		post: () => null
	},
	copilot: {
		root: (i) => i.cwd,
		command: (i) => commandIn(i.toolArgs),
		session: (text) => ({ additionalContext: text }),
		post: (text) => ({ additionalContext: text })
	},
	antigravity: {
		root: (i) => i.workspacePaths?.[0],
		command: (i) => commandIn(i.toolCall?.args),
		// Runs before every model call: inject the digest once per conversation.
		session: (text, i) => {
			const marker = join(tmpdir(), `qa-kit-agy-${String(i.conversationId ?? 'none').replace(/[^\w-]/g, '')}`);
			if (existsSync(marker)) return {};
			writeText(marker, '');
			return { injectSteps: [{ ephemeralMessage: text }] };
		},
		// PostToolUse output must be {} in Antigravity; recording the run is the effect.
		post: () => ({})
	}
};

async function readStdin() {
	if (process.stdin.isTTY) return {};
	let data = '';
	for await (const chunk of process.stdin) data += chunk;
	try {
		return data.trim() ? JSON.parse(data) : {};
	} catch {
		return {};
	}
}

function emit(out) {
	if (out == null) return;
	process.stdout.write(typeof out === 'string' ? out + '\n' : JSON.stringify(out));
}

/**
 * Hook entry point for every host: `qa-kit hook <session-start|post-bash> --client <host>`.
 * Reads the host's JSON payload from stdin and answers in the host's format. Hooks never
 * fail the session: errors end silently with exit code 0.
 */
export async function runHook(event, clientName = 'claude') {
	const client = CLIENTS[clientName] ?? CLIENTS.claude;
	try {
		const input = await readStdin();
		const hinted = firstString(client.root(input), process.env.CLAUDE_PROJECT_DIR, process.env.CURSOR_PROJECT_DIR, process.env.GEMINI_PROJECT_DIR);
		const root = findRoot(hinted ?? null);

		if (event === 'session-start') {
			const text = sessionContext(root);
			// Antigravity expects JSON even when there is nothing to add.
			if (text) emit(client.session(text, input));
			else if (clientName === 'antigravity') emit({});
			return;
		}
		if (event === 'post-bash') {
			const command = client.command(input) ?? '';
			const text = postRunContext(root, command, { requireCommand: Boolean(command) || clientName !== 'antigravity' });
			if (text) emit(client.post(text));
			else if (clientName === 'antigravity') emit({});
		}
	} catch {
		if (clientName === 'antigravity') emit({});
	}
}

export const HOOK_CLIENTS = Object.keys(CLIENTS);
