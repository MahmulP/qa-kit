/**
 * Language packs for reading test-case catalogs written by humans. A pack only knows words,
 * never a project's layout. Projects pick packs with `catalog.languages` in
 * `.qa-kit/config.json` and can add their own words with `catalog.vocabulary` (same shape,
 * strings are regex sources). English is always active.
 */
export const PACKS = {
	en: {
		columns: {
			id: ['^(id|no\\.?|#|case ?id|tc ?id|test ?id|key)$'],
			scenario: ['scenario', 'title', 'case', 'summary', 'description'],
			steps: ['steps?', 'procedure', 'actions?'],
			expected: ['expected', 'result'],
			automation: ['automation', 'automated', 'status', 'spec', 'coverage'],
			priority: ['priority', 'severity']
		},
		automated: ['^\\W*(spec|automated|yes|done|covered)\\b', '^\\W*[✅✓✔]'],
		todo: ['not automated', '\\btodo\\b', 'to do', 'pending', 'planned', 'backlog', '^\\W*[❌✗✘⏳]'],
		manual: ['\\bmanual\\b', 'exploratory'],
		suspected: ['suspect', 'likely fail', 'expected to fail', 'unconfirmed'],
		confirmed: ['\\bfail', '\\bbug\\b', 'known issue', 'broken', 'finding'],
		findingsHeadings: ['findings?', 'known (bugs|issues)', 'bugs?', 'issues', 'defects'],
		titleWords: ['the', 'should', 'shows?', 'and', 'with', 'page', 'create', 'delete', 'update', 'search', 'save', 'cancel', 'list', 'opens?', 'when', 'can']
	},
	id: {
		columns: {
			id: ['^(kode|no\\.?)$'],
			scenario: ['skenario', 'judul', 'kasus', 'deskripsi'],
			steps: ['langkah', 'prosedur'],
			expected: ['hasil', 'ekspektasi', 'harapan'],
			automation: ['otomasi', 'status'],
			priority: ['prioritas', 'tingkat']
		},
		automated: ['^\\W*(otomatis|sudah|ya)\\b'],
		todo: ['belum diotomasi', 'belum otomatis', 'belum dibuat'],
		manual: ['\\bmanual\\b'],
		suspected: ['dugaan', 'diduga'],
		confirmed: ['gagal', 'temuan', 'bug'],
		findingsHeadings: ['temuan', 'catatan bug', 'masalah'],
		titleWords: ['yang', 'dan', 'tidak', 'tampil', 'wajib', 'dengan', 'halaman', 'belum', 'ubah', 'hapus', 'tambah', 'cari', 'simpan', 'batal', 'daftar']
	}
};

const KEYS = ['automated', 'todo', 'manual', 'suspected', 'confirmed', 'findingsHeadings', 'titleWords'];

/** Merges English, the selected packs, and project words into compiled regexes. */
export function vocabulary(config = {}) {
	const langs = ['en', ...(config.catalog?.languages ?? Object.keys(PACKS))].filter((l, i, a) => PACKS[l] && a.indexOf(l) === i);
	const custom = config.catalog?.vocabulary ?? {};
	const sources = langs.map((l) => PACKS[l]).concat(custom);
	const any = (list) => (list.length ? new RegExp(list.map((s) => `(?:${s})`).join('|'), 'i') : /$^/);

	const v = { languages: langs, columns: {} };
	for (const key of KEYS) v[key] = any(sources.flatMap((s) => s[key] ?? []));
	for (const col of Object.keys(PACKS.en.columns)) v.columns[col] = any(sources.flatMap((s) => s.columns?.[col] ?? []));
	v.findingsHeading = new RegExp(`^(?:${sources.flatMap((s) => s.findingsHeadings ?? []).join('|')})\\b`, 'i');
	return v;
}

/** Guesses the language of test titles from the packs' common words. */
export function detectLanguage(titles) {
	const scores = Object.entries(PACKS).map(([lang, pack]) => {
		const re = new RegExp(`\\b(?:${pack.titleWords.join('|')})\\b`, 'i');
		return [lang, titles.filter((t) => re.test(t)).length];
	});
	scores.sort((a, b) => b[1] - a[1]);
	return scores[0][1] > 0 ? scores[0][0] : null;
}
