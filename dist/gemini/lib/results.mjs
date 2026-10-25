import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { loadConfig, storePaths } from './store.mjs';
import { appendJSONL, mtime, nowIso, readJSON, readText, rel, stripAnsi, truncate, walk, writeJSON } from './util.mjs';

const RECENT = 10;

/** Flattens a Playwright JSON report into one record per test × project. */
export function parsePlaywrightJson(report, root) {
	const out = [];
	// Spec paths in the report are relative to the config rootDir (usually testDir).
	const base = report.config?.rootDir;
	const fileOf = (f) => (f && base && root ? rel(root, join(base, f)) : f);
	const visit = (suite, path) => {
		const titlePath = suite.title && !suite.title.match(/\.(spec|test)\.[mc]?[jt]sx?$/) ? [...path, suite.title] : path;
		for (const spec of suite.specs ?? []) {
			for (const t of spec.tests ?? []) {
				const results = t.results ?? [];
				const last = results.at(-1);
				// Playwright's per-test verdict: expected | unexpected | flaky | skipped.
				const verdict = t.status;
				const status =
					verdict === 'flaky' ? 'flaky' : verdict === 'skipped' ? 'skipped' : verdict === 'expected' ? (last?.status === 'failed' ? 'failed' : 'passed') : 'failed';
				const err = results.flatMap((r) => r.errors ?? (r.error ? [r.error] : [])).at(-1);
				out.push({
					file: fileOf(spec.file ?? suite.file),
					line: spec.line ?? null,
					title: spec.title,
					titlePath: [...titlePath, spec.title].join(' › '),
					project: t.projectName ?? null,
					status,
					expectedStatus: t.expectedStatus ?? null,
					retries: Math.max(0, results.length - 1),
					duration: results.reduce((n, r) => n + (r.duration ?? 0), 0),
					error: err ? truncate(stripAnsi(err.message ?? err.value ?? ''), 600) : null,
					annotations: (t.annotations ?? []).map((a) => `${a.type}: ${a.description ?? ''}`)
				});
			}
		}
		for (const child of suite.suites ?? []) visit(child, titlePath);
	};
	for (const s of report.suites ?? []) visit(s, []);
	return out;
}

/**
 * Fallback when no JSON report exists: Playwright writes `error-context.md` next to each
 * failed test's artifacts. Only failures can be recovered this way.
 */
export function parseErrorContexts(root, outputDir, sinceMs = 0, projects = []) {
	if (!outputDir || !existsSync(join(root, outputDir))) return [];
	return walk(join(root, outputDir), { match: (f, n) => n === 'error-context.md' && mtime(f) > sinceMs, maxDepth: 3 }).map((f) => {
		const text = readText(f, '');
		const name = text.match(/^- Name:\s*(.+)$/m)?.[1] ?? '';
		const location = text.match(/^- Location:\s*(.+)$/m)?.[1] ?? '';
		const [file, ...titleParts] = name.split(' >> ');
		const err = text.match(/# Error details\s*```\s*([\s\S]*?)```/)?.[1] ?? '';
		// Artifact folders end with `-<project>` (plus `-retryN`); only known names are trusted.
		const folder = rel(join(root, outputDir), f).split('/')[0].replace(/-retry\d+$/, '');
		const project = projects.filter((p) => folder.endsWith(`-${p}`)).sort((a, b) => b.length - a.length)[0] ?? null;
		return {
			file: location.replace(/:\d+:\d+$/, '') || file,
			line: Number(location.match(/:(\d+):\d+$/)?.[1]) || null,
			title: titleParts.at(-1) ?? name,
			titlePath: titleParts.join(' › '),
			project,
			status: 'failed',
			retries: 0,
			duration: null,
			error: truncate(stripAnsi(err.trim()), 600),
			annotations: [],
			artifacts: rel(root, join(f, '..'))
		};
	});
}

const keyOf = (r) => `${r.file ?? ''}::${r.titlePath || r.title}::${r.project ?? ''}`;

function flips(recent) {
	let n = 0;
	for (let i = 1; i < recent.length; i++) if (recent[i] !== recent[i - 1] && recent[i] !== 's' && recent[i - 1] !== 's') n++;
	return n;
}

/**
 * Merges results into `history/tests.json` and appends a run summary to `runs.jsonl`.
 * Returns what changed: new failures, fixed tests, flaky candidates.
 */
export function recordResults(root, results, { source, command = null, partial = false } = {}) {
	const p = storePaths(root);
	const tests = readJSON(p.tests, {});
	const changes = { newFailures: [], fixed: [], stillFailing: [], flaky: [] };
	const ts = nowIso();
	const code = { passed: 'p', failed: 'F', flaky: '~', skipped: 's' };

	for (const r of results) {
		const key = keyOf(r);
		const prev = tests[key];
		const t = prev ?? { file: r.file, title: r.title, titlePath: r.titlePath, project: r.project, runs: 0, passed: 0, failed: 0, flaky: 0, skipped: 0, recent: '' };
		t.file = r.file ?? t.file;
		t.line = r.line ?? t.line;
		t.runs++;
		t[r.status] = (t[r.status] ?? 0) + 1;
		t.recent = (t.recent + code[r.status]).slice(-RECENT);
		t.flakyScore = flips(t.recent) + (t.recent.match(/~/g)?.length ?? 0);
		if (r.status === 'failed') {
			t.lastError = r.error;
			t.lastFailedAt = ts;
			if (r.artifacts) t.lastArtifacts = r.artifacts;
		}
		if (r.annotations?.length) t.annotations = r.annotations;
		const before = prev?.lastStatus;
		t.lastStatus = r.status;
		t.lastRunAt = ts;
		tests[key] = t;

		const label = { title: r.titlePath || r.title, file: r.file, project: r.project, error: r.error ? truncate(r.error, 240) : undefined };
		if (r.status === 'failed') (before === 'failed' ? changes.stillFailing : changes.newFailures).push(label);
		else if (r.status === 'passed' && before === 'failed') changes.fixed.push(label);
		if (r.status === 'flaky' || t.flakyScore >= 2) changes.flaky.push({ ...label, recent: t.recent });
	}
	writeJSON(p.tests, tests);

	const count = (s) => results.filter((r) => r.status === s).length;
	const summary = {
		ts,
		source,
		command,
		partial,
		total: results.length,
		passed: count('passed'),
		failed: count('failed'),
		flaky: count('flaky'),
		skipped: count('skipped'),
		durationMs: results.reduce((n, r) => n + (r.duration ?? 0), 0)
	};
	appendJSONL(p.runs, summary);
	writeJSON(p.ingestState, { lastIngestAt: Date.now(), source });
	return { summary, changes };
}

/**
 * Ingests the newest available results: an explicit JSON report, the report written by
 * `qa-kit run`, or (fallback) `error-context.md` files newer than the last ingest.
 */
export function ingest(root, { report, outputDir, command, sinceMs } = {}) {
	const p = storePaths(root);
	const state = readJSON(p.ingestState, { lastIngestAt: 0 });
	const reportPath = report ? (isAbsolute(report) ? report : join(root, report)) : p.lastReport;

	if (existsSync(reportPath) && (report || mtime(reportPath) > state.lastIngestAt)) {
		const json = readJSON(reportPath);
		if (!json?.suites) throw new Error(`${reportPath} is not a Playwright JSON report`);
		return recordResults(root, parsePlaywrightJson(json, root), { source: rel(root, reportPath), command });
	}

	const dir = outputDir ?? loadConfig(root).e2e.outputDir;
	const config = loadConfig(root);
	const projects = [...(config.e2e.projects ?? []), ...(readJSON(p.structure)?.playwright?.projects ?? []).filter((n) => !n.startsWith('('))];
	const failures = parseErrorContexts(root, dir, Math.max(state.lastIngestAt, sinceMs ?? 0), projects);
	if (!failures.length) return { summary: null, changes: null, note: 'No new JSON report or error-context.md files since the last ingest.' };
	return recordResults(root, failures, { source: `${dir}/**/error-context.md`, command, partial: true });
}

export function testHistory(root, { filter = 'all', query, limit = 30 } = {}) {
	const tests = Object.values(readJSON(storePaths(root).tests, {}));
	const q = query?.toLowerCase();
	return tests
		.filter((t) => filter === 'all' || (filter === 'failing' ? t.lastStatus === 'failed' : filter === 'flaky' ? t.flakyScore >= 2 || t.flaky > 0 : true))
		.filter((t) => !q || `${t.titlePath} ${t.file}`.toLowerCase().includes(q))
		.sort((a, b) => (b.lastRunAt ?? '').localeCompare(a.lastRunAt ?? '') || b.failed - a.failed)
		.slice(0, limit);
}

export function formatIngest(res) {
	if (!res.summary) return res.note;
	const s = res.summary;
	const lines = [
		`Recorded ${s.total} results from ${s.source}${s.partial ? ' (failures only)' : ''}: ${s.passed} passed, ${s.failed} failed, ${s.flaky} flaky, ${s.skipped} skipped.`
	];
	const c = res.changes;
	const list = (label, arr) => {
		if (!arr.length) return;
		lines.push(`${label} (${arr.length}):`);
		for (const t of arr.slice(0, 15)) lines.push(`  - ${t.title} [${t.project ?? '-'}] ${t.file ?? ''}${t.error ? `\n      ${t.error.split('\n')[0]}` : ''}${t.recent ? ` history ${t.recent}` : ''}`);
	};
	list('New failures', c.newFailures);
	list('Still failing', c.stillFailing);
	list('Fixed since last run', c.fixed);
	list('Flaky', c.flaky);
	return lines.join('\n');
}
