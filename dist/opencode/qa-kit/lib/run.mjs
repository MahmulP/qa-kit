import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ingest } from './results.mjs';
import { scan } from './scan.mjs';
import { loadConfig, storePaths } from './store.mjs';
import { readJSON } from './util.mjs';

const EXEC = { bun: ['bunx'], pnpm: ['pnpm', 'exec'], yarn: ['yarn'], npm: ['npx'] };

/**
 * Which configured scope a run targets: the first path-like argument that falls inside a
 * scope folder (`e2e/admin/users`, `admin/users`, or just `users` under `e2e/admin`).
 */
export function resolveScope(config, args) {
	const paths = args.filter((a) => !a.startsWith('-') && /[/\w]/.test(a));
	const testDir = config.e2e.testDir ? config.e2e.testDir.replace(/\/$/, '') + '/' : '';
	for (const scope of config.e2e.scopes ?? []) {
		const inner = scope.path.startsWith(testDir) ? scope.path.slice(testDir.length) : scope.path;
		if (paths.some((p) => p.startsWith(scope.path) || p.startsWith(inner) || p.startsWith(scope.path.split('/').pop()))) return scope;
	}
	return null;
}

/**
 * Builds the Playwright command. Order of preference: an explicit `--script`, the script of
 * the scope the paths fall in, `--project=<scope project>` on the suite script, then a direct
 * `<exec> playwright test`.
 */
export function buildCommand(root, { script, args = [] } = {}) {
	const structure = readJSON(storePaths(root).structure) ?? scan(root, { write: false });
	const config = loadConfig(root);
	const pm = structure.packageManager ?? 'npm';
	const reporterGiven = args.some((a) => a.startsWith('--reporter'));
	const projectGiven = args.some((a) => a === '--project' || a.startsWith('--project='));
	const extra = reporterGiven ? [] : ['--reporter=list,json,html'];

	let chosen = script ?? null;
	let pwArgs = [...args];
	const scope = !script && !projectGiven ? resolveScope(config, args) : null;
	if (scope?.script) chosen = scope.script;
	else {
		if (scope?.project) pwArgs = [`--project=${scope.project}`, ...pwArgs];
		if (!chosen) chosen = config.e2e.runScript;
	}

	if (chosen) {
		const sep = pm === 'npm' || pm === 'pnpm' ? ['--'] : [];
		return { cmd: pm, argv: ['run', chosen, ...sep, ...pwArgs, ...extra], reporterGiven, scope };
	}
	const [cmd, ...pre] = EXEC[pm] ?? EXEC.npm;
	return { cmd, argv: [...pre, 'playwright', 'test', ...pwArgs, ...extra], reporterGiven, scope };
}

/**
 * Runs Playwright with a JSON reporter writing into `.qa-kit/history/last-report.json`, keeps
 * the HTML report where the project config puts it, then records the results.
 * Never sets project flags (mutation switches, credentials): the caller's env passes through.
 */
export function runTests(root, { script, args = [], dryRun = false } = {}) {
	const config = loadConfig(root);
	const p = storePaths(root);
	const { cmd, argv, reporterGiven } = buildCommand(root, { script, args });
	const env = {
		...process.env,
		PLAYWRIGHT_JSON_OUTPUT_FILE: p.lastReport,
		PLAYWRIGHT_JSON_OUTPUT_NAME: p.lastReport,
		PLAYWRIGHT_HTML_OPEN: 'never'
	};
	if (config.e2e.htmlReportDir) {
		env.PLAYWRIGHT_HTML_OUTPUT_DIR = join(root, config.e2e.htmlReportDir);
		env.PLAYWRIGHT_HTML_REPORT = join(root, config.e2e.htmlReportDir);
	}
	const printable = [cmd, ...argv].map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
	if (dryRun) return { command: printable, exitCode: null, ingest: null };

	const res = spawnSync(cmd, argv, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' });
	let ingested = null;
	try {
		ingested = ingest(root, { report: reporterGiven ? undefined : p.lastReport, command: printable });
	} catch (e) {
		ingested = { summary: null, note: `Could not record results: ${e.message}` };
	}
	return { command: printable, exitCode: res.status ?? 1, ingest: ingested };
}
