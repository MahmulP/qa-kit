import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where qa-kit itself is installed; never mistaken for the project under test. */
export const KIT_DIR = resolve(fileURLToPath(new URL('..', import.meta.url)));
const insideKit = (p) => p === KIT_DIR || p.startsWith(KIT_DIR + sep);

/** Folders never worth walking: dependencies, build output, test artifacts. */
export const IGNORED_DIRS = new Set([
	'node_modules',
	'.git',
	'.svelte-kit',
	'.next',
	'.nuxt',
	'.output',
	'.turbo',
	'.cache',
	'.vercel',
	'build',
	'dist',
	'coverage',
	'playwright-report',
	'test-results',
	'.auth',
	'graphify-out',
	'.codegraph',
	'.qa-kit'
]);

/**
 * Project root: explicit value, then env set by the harness, then the nearest folder above
 * `start` that has a `.qa-kit/`, `package.json`, or `.git`. Null when `start` is inside
 * qa-kit's own install folder and nothing else says where the project is.
 */
export function findRoot(explicit, start = process.cwd()) {
	const candidate = explicit || process.env.QA_KIT_ROOT || process.env.CLAUDE_PROJECT_DIR;
	if (candidate) return resolve(candidate);

	let dir = resolve(start);
	// Plugin hosts often start hooks and MCP servers inside the plugin folder.
	if (insideKit(dir)) return null;
	let fallback = null;
	while (true) {
		if (existsSync(join(dir, '.qa-kit'))) return dir;
		if (!fallback && (existsSync(join(dir, 'package.json')) || existsSync(join(dir, '.git')))) {
			fallback = dir;
		}
		const parent = dirname(dir);
		if (parent === dir) return fallback ?? resolve(start);
		dir = parent;
	}
}

export function readText(path, fallback = null) {
	try {
		return readFileSync(path, 'utf8');
	} catch {
		return fallback;
	}
}

export function readJSON(path, fallback = null) {
	const text = readText(path);
	if (text == null) return fallback;
	try {
		return JSON.parse(text);
	} catch {
		return fallback;
	}
}

export function writeText(path, text) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text);
}

export function writeJSON(path, data) {
	writeText(path, JSON.stringify(data, null, '\t') + '\n');
}

export function appendJSONL(path, record) {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, JSON.stringify(record) + '\n');
}

export function readJSONL(path) {
	const text = readText(path, '');
	const out = [];
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		try {
			out.push(JSON.parse(line));
		} catch {
			// A half-written line from an interrupted append; skip it.
		}
	}
	return out;
}

export function writeJSONL(path, records) {
	writeText(path, records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
}

/** Depth-first file walk that skips IGNORED_DIRS and symlinked folders. */
export function walk(root, { match = () => true, maxFiles = 20000, maxDepth = 25, exclude = [] } = {}) {
	const skip = new Set(exclude.map((d) => resolve(d)));
	const out = [];
	const stack = [[root, 0]];
	while (stack.length && out.length < maxFiles) {
		const [dir, depth] = stack.pop();
		let entries;
		try {
			entries = readdirSync(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (!IGNORED_DIRS.has(entry.name) && !skip.has(full) && depth < maxDepth) stack.push([full, depth + 1]);
			} else if (entry.isFile() && match(full, entry.name)) {
				out.push(full);
				if (out.length >= maxFiles) break;
			}
		}
	}
	return out.sort();
}

/** POSIX-style relative path, stable across platforms for storage. */
export function rel(root, path) {
	return relative(root, path).split(sep).join('/');
}

export function mtime(path) {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return 0;
	}
}

export function nowIso() {
	return new Date().toISOString();
}

export function stripAnsi(text = '') {
	return String(text).replace(/\u001b\[[0-9;]*m/g, '');
}

export function truncate(text, max) {
	const s = String(text ?? '');
	return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

export function tokenize(text) {
	return String(text ?? '')
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\p{L}\p{N}@/._-]+/gu, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 1);
}
