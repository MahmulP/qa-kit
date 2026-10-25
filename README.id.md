# qa-kit

[English](README.md) · **Bahasa Indonesia**

Toolkit QA automation untuk coding agent yang **generik dan multi-app**. qa-kit tidak
mengasumsikan framework, struktur folder, pembagian tim, bahasa katalog, atau pola ID
apa pun. Setiap konvensi proyek dideteksi lalu disimpan di config milik proyek itu sendiri.

Isi paket:

- **Memori yang terus belajar**, dua lapis:
  - per app di `<app>/.qa-kit/`: pengetahuan aplikasi, konvensi test, pelajaran (selector,
    gotcha, bug, flaky, keputusan, data), riwayat hasil run per test;
  - global di `~/.qa-kit/`: pelajaran yang berlaku untuk semua app (perilaku Playwright,
    tooling, kebiasaan review), plus daftar app yang memakai qa-kit.
- **Deteksi konvensi otomatis**: test dir, fixture yang di-import spec, script suite,
  project Playwright, *scope* folder → project/script, tag mutasi, env var berbahaya, nama
  file katalog, pola ID, bahasa katalog. Semuanya bisa dikoreksi dengan `qa-kit config set`.
- **Indeks test case**: katalog markdown (`test-cases.md`, `*.cases.md`, …) digabung dengan
  judul test di spec lewat ID, lengkap dengan status otomasi, temuan, dan drift katalog↔spec.
- **Language pack** untuk membaca katalog (Inggris + Indonesia bawaan, kata tambahan per
  proyek lewat config).
- **Skill & subagent** untuk alur QA: eksplorasi app → desain test case → tulis spec
  Playwright → run (hanya bila diminta) → triage → simpan pelajaran.
- **Plugin native untuk 7 harness** dari satu sumber: Claude Code, Codex, GitHub Copilot
  (CLI & VS Code, format Agent Plugins 1.0), Cursor, Antigravity, Gemini CLI, dan OpenCode.
  Masing-masing lengkap dengan skill, MCP server, hook, dan (bila didukung) command serta
  subagent. Ada juga adapter per proyek (`AGENTS.md`, `.agents/skills`, config MCP).

Tanpa dependensi: cukup Node.js ≥ 18 (Bun juga bisa menjalankannya).

## Arsitektur

```
qa-automation-skills/
├── bin/qa-kit.mjs            # CLI (semua harness bisa memanggilnya lewat shell)
├── lib/
│   ├── scan.mjs              # deteksi stack, Playwright, scope, tag mutasi, env berbahaya, route
│   ├── catalog.mjs           # parser katalog + spec, indeks, drift, next-id
│   ├── vocab.mjs             # language pack (en, id) untuk membaca katalog
│   ├── memory.mjs            # pelajaran proyek + global, pencarian, ringkasan sesi
│   ├── results.mjs           # ingest JSON report / error-context.md, riwayat & flaky
│   ├── run.mjs               # perintah Playwright yang sadar package manager & scope
│   ├── build.mjs             # sumber → dist/<harness>/ (manifest, hooks, MCP per host)
│   ├── setup.mjs             # pasang plugin native ke tiap harness
│   ├── hooks.mjs             # satu hook, format input/output per host (--client)
│   ├── mcp.mjs, install.mjs, store.mjs, util.mjs
├── skills/                   # qa-automation (pintu masuk), qa-explore-app, qa-test-cases,
│                             #   qa-playwright-author, qa-run-triage, qa-memory
├── agents/                   # subagent Claude Code: qa-explorer, qa-author, qa-triager
├── commands/                 # /qa-kit:init, explore, cases, write, run, triage, learn, status
├── templates/                # template memori, blok AGENTS.md, konteks plugin
├── dist/<harness>/           # HASIL BUILD: plugin native per harness (jangan diedit)
├── .claude-plugin/marketplace.json   # marketplace Claude Code → dist/claude
├── .agents/plugins/marketplace.json  # marketplace Codex → dist/codex
├── .github/plugin/marketplace.json   # marketplace Copilot → dist/copilot
├── .cursor-plugin/marketplace.json   # marketplace Cursor → dist/cursor
└── test/                     # node --test + dua fixture app dengan konvensi berbeda
```

Penyimpanan:

```
<app>/.qa-kit/
├── config.json               # DI-COMMIT: konvensi hasil deteksi/koreksi tim
├── memory/                   # DI-COMMIT: dibagi ke seluruh tim dan semua agent
│   ├── app.md                # modul, route, auth/role, environment, pola UI, area rawan
│   ├── conventions.md        # cara menulis test di app ini, layout folder, log koreksi reviewer
│   ├── glossary.md           # istilah UI
│   └── lessons.jsonl         # pelajaran atomik (ID M-…)
├── index/                    # di-generate (git-ignored): structure.json, test-cases.json
└── history/                  # lokal (git-ignored): runs.jsonl, tests.json (pola p/F/~/s per test)

~/.qa-kit/                    # override dengan QA_KIT_HOME
├── lessons.jsonl             # pelajaran global (ID G-…), ikut dicari di semua app
└── apps.json                 # daftar app yang memakai qa-kit (`qa-kit apps`)
```

Contoh `config.json` hasil deteksi (semua nilai diisi `scan`, tidak ada yang tertanam di kode):

```json
{
	"e2e": {
		"testDir": "tests",
		"fixturesImport": "@playwright/test",
		"runScript": "e2e",
		"projects": ["admin", "storefront"],
		"scopes": [
			{ "path": "tests/admin-portal", "project": "admin", "script": "e2e:admin" },
			{ "path": "tests/storefront", "project": "storefront", "script": "e2e:store" }
		],
		"mutationTags": ["@destructive"],
		"protectedEnv": ["ALLOW_DESTRUCTIVE_TESTS"]
	},
	"catalog": {
		"fileNames": ["checkout.cases.md"],
		"idPattern": "[A-Z][A-Z0-9]{1,9}[-_]\\d{2,4}",
		"languages": ["en"],
		"vocabulary": {}
	}
}
```

Cara deteksinya:

| Konvensi | Sumber deteksi |
| --- | --- |
| `testDir`, `outputDir`, laporan HTML | `playwright.config.*` |
| `projects` | nama literal di config, atau `--project=x` di script `package.json` (untuk config yang menghitung project di kode) |
| `scopes` | folder teratas di test dir yang namanya sama atau berawalan nama project (`admin-portal` ↔ `admin`), plus script yang memakai `--project` itu |
| `runScript` | script terpendek yang menjalankan `playwright test` tanpa flag penyempit |
| `fixturesImport` | modul non-relatif yang paling sering di-import spec |
| `mutationTags` | tag di test/describe yang mengandung mutat/destruct/write/danger/crud |
| `protectedEnv` | nama env di `.env.example` (root dan test dir) seperti `ALLOW_*`, `*MUTAT*`, `*DESTRUCT*`, `*PROD*` |
| `catalog.fileNames` | file `test-cases.md`, `cases.md`, `*.cases.md`, `test-plan.md`, … yang ditemukan |
| `language`, `catalog.languages` | kata umum di judul test (Inggris selalu aktif) |

Nilai yang sudah diisi tidak akan ditimpa scan berikutnya, jadi koreksi tim tetap bertahan.

"Terus belajar" bekerja seperti ini:

1. Awal sesi, hook menyuntikkan ringkasan memori ke konteks agent: stack, konvensi terdeteksi,
   env yang tidak boleh diset, cakupan, test gagal/flaky, dan pelajaran terpenting (proyek +
   global).
2. Skill mewajibkan agent mencari memori area yang akan disentuh sebelum menulis test.
3. Setiap run Playwright tercatat (via `qa-kit run`, hook PostToolUse, atau `qa-kit ingest`).
   Test yang baru gagal, sudah diperbaiki, dan flaky (status berganti-ganti) terdeteksi otomatis.
4. Di akhir tugas agent menyimpan pelajaran, ke proyek atau global (`--global`). Teks yang
   sama tidak diduplikasi; hitungan `seen` naik sehingga pelajaran yang sering muncul
   diprioritaskan. Entri usang di-`supersede` atau di-`forget`, bukan dihapus.

## Instalasi per harness

Satu sumber (`skills/`, `agents/`, `commands/`, `bin/`, `lib/`, `templates/`) dibangun
menjadi plugin native untuk tiap harness di `dist/<harness>/` lewat `npm run build`.
Setiap paket berdiri sendiri (CLI + MCP server ikut di dalamnya), jadi tetap jalan
walaupun host menyalinnya ke cache.

| Harness | Paket | Isi | Cara pasang |
| --- | --- | --- | --- |
| Claude Code | `dist/claude` | `.claude-plugin/plugin.json`, skills, 3 subagent, 8 command, hooks, `.mcp.json` | `qa-kit setup claude --yes` (marketplace `MahmulP/qa-kit`) |
| Codex (CLI & app) | `dist/codex` | `plugin.json` Agent Plugins 1.0 + `extensions.com.openai`, overlay `.codex-plugin/`, skills, `mcp.json`, hooks | `qa-kit setup codex --yes` (marketplace `.agents/plugins/marketplace.json`), lalu pasang dari Plugins Directory / `/plugins` dan *trust* hooks di `/hooks` |
| GitHub Copilot CLI & VS Code | `dist/copilot` | Agent Plugins 1.0 (`plugin.json`, `mcp.json`, skills) + `com.github.copilot/` (agents, hooks) | `qa-kit setup copilot --yes` (`copilot plugin install`), atau marketplace `.github/plugin/marketplace.json` |
| Cursor | `dist/cursor` | `.cursor-plugin/plugin.json`, skills, rule `.mdc`, agents, commands, hooks, `mcp.json` | `qa-kit setup cursor --yes` (salin ke `~/.cursor/plugins/local/qa-kit`), atau team marketplace dari repo (`.cursor-plugin/marketplace.json`) |
| Antigravity (app, IDE, `agy`) | `dist/antigravity` | `plugin.json`, skills, agents, commands (jadi skill), `rules/AGENTS.md`, `hooks.json`, `mcp_config.json` | `qa-kit setup antigravity --yes` (`agy plugin install` + path MCP absolut) |
| Gemini CLI (lama) | `dist/gemini` | `gemini-extension.json`, `GEMINI.md`, skills, command `/qa:*` (TOML), hooks | `qa-kit setup gemini --yes` (`gemini extensions link`) |
| OpenCode | `dist/opencode` | skills, agents (subagent), command `/qa-*`, plugin JS, MCP | `qa-kit setup opencode --yes` (user) atau `--scope project` |

Tanpa `--yes`, `setup` hanya menampilkan rencana. `qa-kit setup all` memproses semua
harness yang terdeteksi di mesin ini. Tanpa clone repo:

```bash
npx -y github:MahmulP/qa-kit setup all
```

Pemasangan langsung dari GitHub per harness:

```bash
claude plugin marketplace add MahmulP/qa-kit && claude plugin install qa-kit@qa-kit
codex plugin marketplace add MahmulP/qa-kit
copilot plugin marketplace add MahmulP/qa-kit && copilot plugin install qa-kit@qa-kit
npx -y github:MahmulP/qa-kit setup antigravity --yes
npx -y github:MahmulP/qa-kit setup cursor --yes
npx -y github:MahmulP/qa-kit setup opencode --yes
npx -y github:MahmulP/qa-kit setup gemini --yes
```

Cursor untuk tim: Dashboard → Plugins & MCPs → Team Marketplaces → Import from Repo →
`https://github.com/MahmulP/qa-kit`.

### Yang dilakukan tiap komponen di setiap harness

| Fitur | Claude | Codex | Copilot / VS Code | Cursor | Antigravity | Gemini | OpenCode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6 skill QA | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| MCP server `qa-kit` (11 tool) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Command / slash | `/qa-kit:*` | – (pakai skill) | – (pakai skill) | `/qa-*` | jadi skill | `/qa:*` | `/qa-*` |
| Subagent | ✔ | – | ✔ | ✔ | ✔ | – | ✔ |
| Ringkasan memori di awal sesi | SessionStart | SessionStart | sessionStart | sessionStart | PreInvocation (sekali per percakapan) | SessionStart | – (skill memanggil `qa_status`) |
| Catat otomatis hasil Playwright | PostToolUse | PostToolUse | postToolUse | afterShellExecution | PostToolUse | AfterTool | `tool.execute.after` |
| Aturan selalu aktif | – | – | – | rule `.mdc` | `rules/AGENTS.md` | `GEMINI.md` | – |

MCP server mencari folder proyek lewat **MCP roots** (workspace yang dibuka di host), lalu
env host (`CLAUDE_PROJECT_DIR`, `CURSOR_PROJECT_DIR`, …). Server tidak pernah menganggap
folder plugin sebagai proyek. Bila semuanya kosong, tool meminta argumen `root`.

### Status verifikasi

| Harness | Diverifikasi di mesin ini |
| --- | --- |
| Claude Code | `claude plugin validate` lolos; dipasang lewat marketplace (config terisolasi) dan `claude mcp list` → `plugin:qa-kit:qa-kit ✔ Connected` |
| Antigravity | `agy plugin validate` dan `agy plugin install` lolos (6 skill, 3 agent, 8 command, 1 MCP, 2 hook); path MCP diperbaiki oleh setup |
| OpenCode | `opencode debug skill` memuat 6 skill, `opencode debug config` memuat 3 agent, 8 command, dan plugin; `opencode mcp list` → `qa-kit ✓ connected`; plugin JS diuji di Bun |
| Codex, Copilot/VS Code, Cursor, Gemini | CLI-nya tidak terpasang di mesin ini. Manifest dicek terhadap spesifikasi resmi (Agent Plugins 1.0, format Cursor/Gemini) di test, MCP server dijalankan persis seperti deklarasi manifest, dan hook diuji dengan payload format masing-masing host |

### Pemasangan per proyek (tanpa plugin)

Untuk tim yang ingin konfigurasi agent ikut di-commit ke repo app, `qa-kit install` tetap
tersedia:

```bash
qa-kit init --targets agents-md,skills,codex,cursor,gemini,copilot,antigravity
```

| Target | Yang ditulis |
| --- | --- |
| `agents-md` | Blok terkelola di `AGENTS.md` (dibaca Codex, OpenCode, Amp, Cursor, Copilot agent, Windsurf, Kiro) |
| `skills` | `.agents/skills/qa-*` (Codex, Cursor, Antigravity, Gemini CLI, OpenCode) |
| `codex` | `.codex/config.toml` MCP + skills |
| `cursor` | `.cursor/rules/qa-kit.mdc`, `.cursor/mcp.json` + skills |
| `gemini` | Blok `GEMINI.md`, `.gemini/settings.json` MCP + skills |
| `copilot` | `.github/instructions/qa-kit.instructions.md`, `.github/skills/`, `.vscode/mcp.json` |
| `antigravity` | `.agents/rules/qa-kit.md`, `.agents/mcp_config.json` + skills |
| `claude` | `.claude/skills/` + `.mcp.json` |

Semua penulisan idempoten: blok terkelola diganti, JSON digabung hanya di kunci `qa-kit`.
`--dry-run` menampilkan daftar file tanpa menulis, `--link` membuat symlink skill, dan
`--portable` memakai `npx -y qa-kit` di config MCP (butuh paket dipublikasikan ke
npm/registry internal).

### CLI di PATH (opsional)

```bash
npm install -g github:MahmulP/qa-kit
```

Tanpa ini, agent memakai path CLI yang dicetak hook awal sesi dan tool `qa_status`.

## Memakai di banyak app

1. Jalankan `qa-kit init` di setiap app. Masing-masing mendapat `.qa-kit/` sendiri dan
   terdaftar di `~/.qa-kit/apps.json`.
2. Periksa `qa-kit config` di tiap app dan koreksi yang salah deteksi, misalnya:

```bash
qa-kit config set e2e.projects '["web","api"]'
qa-kit config set catalog.idPattern '[A-Z]{2,5}-\d{3}'
qa-kit config set catalog.vocabulary '{"todo":["nog niet"],"columns":{"steps":["stappen"]}}'
```

3. Tulis aturan layout dan gaya test app itu di `.qa-kit/memory/conventions.md` (skill
   `qa-explore-app` / `/qa-kit:init` membantu merangkumnya dari dokumen aturan proyek).
4. Pelajaran lintas app disimpan dengan `--global`; pelajaran khusus app tanpa flag itu.
5. `qa-kit apps` menampilkan semua app; `--root <path>` (CLI) atau `root` (MCP) memilih app
   saat agent bekerja di luar folder app.

## Pemakaian

Command di Claude Code (di Cursor dan OpenCode namanya `/qa-init`, `/qa-status`, …; di Gemini
`/qa:init`, …; di Codex, Copilot, dan Antigravity cukup minta dengan bahasa biasa karena skill
yang sama terpicu otomatis):

| Command | Fungsi |
| --- | --- |
| `/qa-kit:init` | Buat `.qa-kit/`, scan, indeks, konfirmasi konvensi terdeteksi, rangkum aturan QA ke `conventions.md` |
| `/qa-kit:explore [modul]` | Petakan app ke memori (paralel per modul dengan `qa-explorer`) |
| `/qa-kit:cases <halaman> [tiket]` | Desain/ubah katalog test case |
| `/qa-kit:write <halaman> [run]` | Katalog → spec Playwright mengikuti konvensi app |
| `/qa-kit:run <scope>` | Jalankan scope tersempit, catat hasil, triage |
| `/qa-kit:triage [scope]` | Klasifikasi kegagalan: bug app / bug test / environment / flaky / known |
| `/qa-kit:learn [fakta]` | Simpan pelajaran atau koreksi |
| `/qa-kit:status [area]` | Ringkasan cakupan, kesehatan test, gap |

Atau cukup minta dalam bahasa biasa ("buatkan test untuk halaman invoice"); skill
`qa-automation` akan terpicu.

CLI langsung:

```bash
qa-kit status                                   # ringkasan memori + konvensi terdeteksi
qa-kit config                                   # lihat/ubah konvensi
qa-kit gaps --page billing                      # todo, drift katalog/spec, route tanpa test
qa-kit cases --id INV-05                        # baris katalog + spec yang terkait
qa-kit next-id INV                              # ID berikutnya, mengikuti pemisah & lebar yang dipakai
qa-kit memory add --kind selector --scope e2e/billing "…"
qa-kit memory add --global --kind gotcha "…"
qa-kit memory search "invoice export"
qa-kit run --dry-run -- e2e/billing/invoices -g INV-01   # script/project dipilih dari scope
qa-kit history --filter flaky
qa-kit apps
```

MCP tools: `qa_status`, `qa_config`, `qa_scan`, `qa_find_cases`, `qa_coverage_gaps`,
`qa_next_id`, `qa_memory_search`, `qa_memory_add` (dengan `global`), `qa_memory_forget`,
`qa_knowledge`, `qa_test_history`, `qa_ingest_results`. Semua menerima `root` (path absolut
app) bila cwd server bukan app tersebut.

## Contoh: app SvelteKit multi-tim

Contoh nyata (nama disamarkan): sebuah app SvelteKit dengan test E2E dibagi per tim. Tidak ada
konfigurasi manual; `qa-kit init` mendeteksi semuanya sendiri:

| Konvensi | Terdeteksi |
| --- | --- |
| Stack | SvelteKit, bun, Playwright, `testDir=e2e`, output dan laporan HTML dari config |
| Fixture | alias `$e2e/fixtures` (modul yang paling sering di-import spec) |
| Projects | `team-1` … `team-5`, `auth`, dari `--project=` di script karena config menghitung project di kode |
| Scopes | `e2e/team-N-…` → project `team-N` → script `test:e2e:team-N`, jadi `qa-kit run -- e2e/team-5-…/halaman` otomatis memakai script tim itu |
| Tag mutasi | `@mutation`, dari `test.describe(…, { tag: MUTATION_TAG })` |
| Env terlarang | variabel `*_ALLOW_*` di `.env.example` |
| Katalog | `test-cases.md`, bahasa `en` + `id` (judul test berbahasa Indonesia) |
| Aturan proyek | dokumen aturan E2E/QA di repo, ditampilkan lebih dulu |

Indeksnya berisi ratusan baris katalog yang tergabung dengan spec, temuan per halaman, dan
drift katalog↔spec. Kegagalan run terakhir terbaca dari `error-context.md` tanpa mengubah
reporter proyek.

## Batasan yang diketahui

- Parsing spec dan config memakai regex, bukan parser TypeScript: judul test yang dibangun
  dari variabel tidak terbaca, dan project yang dihitung di kode hanya terdeteksi bila
  muncul di script (`--project=`); selebihnya isi `e2e.projects` / `e2e.scopes` manual.
- Tag describe diwariskan ke test berdasarkan describe terakhir sebelum test (tanpa
  menghitung kurung), cukup untuk pola umum tapi bisa keliru pada describe bersarang.
- Cakupan route bersifat heuristik (dua segmen terakhir path muncul di teks e2e) dan baru
  mendukung router berbasis file (SvelteKit, Next.js, Nuxt).
- Tanpa JSON report, `ingest` hanya bisa membaca kegagalan (`error-context.md`), bukan test
  yang lulus. `qa-kit run` selalu menambahkan reporter JSON.
- Pencarian memori berbasis token (tanpa embedding); cukup untuk ratusan sampai ribuan entri.
- Language pack bawaan: Inggris dan Indonesia. Bahasa lain lewat `catalog.vocabulary` atau
  pack baru di `lib/vocab.mjs`.
- Format plugin tiap harness mengikuti dokumentasi per Oktober 2026. Codex, Copilot, VS Code,
  Cursor, dan Gemini belum diuji dengan CLI aslinya di mesin ini (lihat Status verifikasi).
  Hook Copilot untuk plugin belum punya variabel path plugin yang terdokumentasi, sehingga
  hook mencoba `PLUGIN_ROOT`, `COPILOT_PLUGIN_ROOT`, lalu `CLAUDE_PLUGIN_ROOT` dan diam bila
  semuanya tidak ada.
- Antigravity tidak mendokumentasikan folder kerja MCP server plugin; `qa-kit setup
  antigravity` menulis path absolut setelah instalasi. Bila dipasang dari Marketplace
  Antigravity tanpa setup, jalankan `qa-kit setup antigravity --yes` sekali.
- Gemini CLI sudah digantikan Antigravity CLI (18 Juni 2026); paketnya tetap disediakan untuk
  instalasi lama.
- Bila format sebuah harness berubah, ubah builder-nya di `lib/build.mjs` dan target per
  proyek di `lib/install.mjs`.

## Pengembangan

Ubah sumber (`skills/`, `agents/`, `commands/`, `lib/`, `templates/`), lalu bangun ulang
semua paket. `dist/` ikut di-commit karena marketplace menunjuk ke sana. Langkah dan draft
isian form marketplace: [docs/PUBLISHING.md](docs/PUBLISHING.md).

```bash
npm run build                          # regenerasi dist/<harness>/
npm test                               # 17 skenario: inti + manifest, hook, MCP per harness
claude plugin validate dist/claude     # validator resmi Claude Code
agy plugin validate dist/antigravity   # validator resmi Antigravity
```

Command sumber memakai placeholder `{{CLI}}` dan `{{ARGS}}` yang diganti per harness saat
build (misalnya `$ARGUMENTS` di Claude/OpenCode, `{{args}}` di Gemini).
