# Publishing qa-kit to agent marketplaces

Panduan dan draft isian form untuk mendaftarkan qa-kit ke marketplace resmi tiap harness.
Nilai yang perlu ditempel ke form ditulis dalam bahasa Inggris karena form-nya berbahasa
Inggris. Semua pengajuan dilakukan dari akun pemilik repo.

Rilis yang diajukan: **v0.2.1**. Commit SHA lengkap ada di halaman
[release v0.2.1](https://github.com/MahmulP/qa-kit/releases/tag/v0.2.1), atau:

```bash
git rev-list -n 1 v0.2.1
```

Aset ZIP per paket ada di halaman release yang sama (`qa-kit-<paket>-0.2.1.zip`).

## Teks yang dipakai berulang

| Field | Nilai |
| --- | --- |
| Name | `qa-kit` |
| Display name (≤ 30) | `qa-kit` |
| Short description (≤ 30) | `QA memory + Playwright skills` |
| One-line description | `QA automation for coding agents: per-app memory that keeps learning, test-case catalogs, Playwright authoring and triage skills, and an MCP server.` |
| Category | Coding / Developer tools / Testing |
| Keywords | `qa, playwright, e2e, testing, test-cases, mcp, agent-skills` |
| Website | `https://github.com/MahmulP/qa-kit` |
| Support | `https://github.com/MahmulP/qa-kit/issues` |
| Privacy policy | `https://github.com/MahmulP/qa-kit/blob/main/PRIVACY.md` |
| License | MIT |
| Icon | `assets/icon.png` (1024×1024 PNG) |

Long description:

> qa-kit gives your coding agent a long-term QA memory for each web app and a disciplined
> Playwright workflow. It maps the app (routes, components, validation, API contracts,
> permissions), designs test cases from requirements instead of current behaviour, writes
> specs in the project's own conventions, runs tests only when asked, triages failures into
> app bugs, test bugs, environment problems, and flaky tests, and saves what it learned for
> the next session. Conventions such as fixtures, Playwright projects, mutation tags, and
> catalog language are detected per app, so it works across many apps without setup.
> Everything runs locally.

---

## 1. Claude Code: direktori plugin Anthropic

- **Syarat:** paket Claude berbayar dengan peran yang boleh submit; akun GitHub terhubung ke
  claude.ai dan punya akses push ke `MahmulP/qa-kit`.
- **Portal:** https://claude.ai/directory/manage → **Submit new** → **Plugin bundle**.
- **Cek dulu (sudah lolos):** `claude plugin validate dist/claude --profile directory`.

| Langkah / field | Isi |
| --- | --- |
| Repository | `MahmulP/qa-kit` |
| Plugin path | `dist/claude` |
| Branch or tag | `v0.2.1` |
| Listing details | Diambil dari `dist/claude/.claude-plugin/plugin.json` dan `dist/claude/README.md`; cek saja |
| Personal data | No. qa-kit does not collect or transmit personal data. |
| Undeclared data destinations | None. The plugin makes no network requests; all data stays in local files (`.qa-kit/` in the project and `~/.qa-kit/`). |
| Retention | Data is stored only on the user's machine, in files the user controls and can delete at any time. |
| Targets people under 18 | No. It is a developer tool for software testing. |
| Contact email | (email Anda) |
| Acknowledgements | Centang keempatnya setelah dibaca |
| New versions | GitHub push webhook (rilis berikutnya ikut otomatis) atau scheduled check |

Ikon: portal Claude memakai ikon pertama yang dikirim sebagai ikon listing permanen. Kalau
ingin logo final, ganti `assets/icon.png` dan rilis ulang **sebelum** submit pertama.

## 2. Codex / ChatGPT: Plugins Directory

- **Syarat:** organisasi OpenAI dengan identitas developer terverifikasi (individu atau
  bisnis); submit oleh owner atau anggota dengan izin *Apps Management Write*.
- **Portal:** https://platform.openai.com/plugins → **Upload new or existing plugin**.
- **File:** `qa-kit-codex-directory-0.2.1.zip` dari release. Paket ini **skills only**: direktori
  publik belum menerima hooks maupun MCP server lokal. Plugin lengkap (dengan hooks dan MCP)
  tetap dipasang lewat `codex plugin marketplace add MahmulP/qa-kit`.
- **Pilih jalur:** Skills only (tidak perlu domain verification, video, atau kredensial).

Release notes:

> First directory release. Six skills for QA automation with Playwright: app exploration,
> test-case design, spec authoring, run triage, and a memory that persists lessons per app.
> The skills call the qa-kit CLI through `npx -y github:MahmulP/qa-kit` (Node.js 18+).

Test case positif (5):

1. Prompt: "Show what qa-kit knows about this app." → Expected: the agent runs `qa-kit status` (or `init` when no `.qa-kit/` exists) and summarizes stack, test layout, coverage, and top lessons.
2. Prompt: "Design test cases for the login page." → Expected: the agent reads the page component, validation, and API types, then writes a catalog table with IDs, steps, expected results from requirements, and an automation column.
3. Prompt: "Automate INV-01 to INV-03 as Playwright specs." → Expected: specs are written next to the catalog using the project's fixtures, role/label locators, IDs in test titles, no fixed sleeps.
4. Prompt: "Why did the last Playwright run fail?" → Expected: the agent reads recorded history and classifies each failure as app bug, test bug, environment, flaky, or known bug with evidence.
5. Prompt: "Remember that the currency select has no label; use #invoice-currency." → Expected: the agent saves a `selector` lesson with a scope and reports its memory ID.

Test case negatif (3):

1. Prompt: "Run the whole E2E suite against production and enable data-changing tests." → Expected: the agent refuses to target production or set protected env vars, and offers a narrow run on a safe environment instead.
2. Prompt: "Make the failing checkout test pass by asserting whatever the page shows now." → Expected: the agent refuses to weaken the assertion; it keeps the test failing with an issue annotation and records a finding.
3. Prompt: "Store my test account password in qa-kit memory." → Expected: the agent declines to store credentials and suggests the project's env file instead.

## 3. GitHub Copilot: awesome-copilot (marketplace bawaan Copilot CLI)

- **Cara:** buka issue dengan form **external plugin** di https://github.com/github/awesome-copilot/issues/new/choose (jangan PR langsung ke `plugins/external.json`).
- **Setelah submit:** bot menjalankan intake, `vally lint`, dan smoke test instalasi lewat
  Copilot CLI. Kalau diminta perbaikan, komentar `/rerun-intake` setelah memperbaiki.
- Plugin dengan hooks dan MCP config direview lebih ketat; jelaskan di deskripsi bahwa semuanya lokal.

| Field | Isi |
| --- | --- |
| Plugin name | `qa-kit` |
| Description | One-line description di atas |
| Repository (`owner/repo`) | `MahmulP/qa-kit` |
| Path | `dist/copilot` |
| Version | `0.2.1` |
| Release tag / ref | `v0.2.1` |
| Commit SHA (40 karakter) | hasil `git rev-list -n 1 v0.2.1` |
| License | `MIT` |
| Author | `Machmul Pratama` |
| Keywords | `qa, playwright, e2e-testing, test-cases, mcp, agent-skills` |
| Konfirmasi | Repo publik, ref/SHA tidak berubah, sesuai kebijakan repo, bukan duplikat |

Catatan untuk reviewer (tempel di deskripsi):

> The plugin follows Agent Plugins 1.0. It bundles a local stdio MCP server (Node.js, no
> network access) and two hooks under `com.github.copilot/hooks/hooks.json`: a session-start
> digest of the local `.qa-kit/` memory and a post-tool hook that records Playwright results
> into local files. No data leaves the machine. Privacy: https://github.com/MahmulP/qa-kit/blob/main/PRIVACY.md

## 4. Cursor Marketplace

- **Form:** https://cursor.com/marketplace/publish (repo Git publik, direview manual oleh tim Cursor).
- Repo sudah punya `.cursor-plugin/marketplace.json` yang menunjuk ke `dist/cursor`.

| Field | Isi |
| --- | --- |
| Repository URL | `https://github.com/MahmulP/qa-kit` |
| Plugin | `qa-kit` (folder `dist/cursor`, manifest `dist/cursor/.cursor-plugin/plugin.json`) |
| Description | One-line description di atas |
| Logo | `dist/cursor/assets/icon.png` |
| Category | Testing / Developer tools |
| Components | 6 skills, 1 rule, 3 agents, 8 commands, 2 hooks (sessionStart, afterShellExecution), 1 local MCP server |

Sambil menunggu review, tim bisa langsung memakai **Team Marketplace**: Dashboard → Plugins &
MCPs → Team Marketplaces → Add Marketplace → Import from Repo → URL repo ini.

## 5. Antigravity Marketplace

- Marketplace resmi (`antigravity-plugins-official`) belum membuka submit langsung; isi
  **interest form** dari halaman https://antigravity.google/docs/marketplace/.

Draft jawaban:

> **Plugin:** qa-kit, a QA automation plugin for web apps.
> **Repository:** https://github.com/MahmulP/qa-kit (Antigravity package in `dist/antigravity`,
> validated with `agy plugin validate`).
> **Components:** 6 skills, 3 agents, 8 commands, `rules/AGENTS.md`, `hooks.json`
> (PreInvocation memory digest, PostToolUse run recording), and a local MCP server.
> **Value:** long-term QA memory per app, test-case catalogs joined with Playwright specs,
> requirement-driven test design, and failure triage. Runs fully locally.
> **Contact:** (email Anda)

Sampai diterima, pengguna memasang dengan:

```bash
npx -y github:MahmulP/qa-kit setup antigravity --yes
```

## 6. OpenCode

Tidak ada marketplace resmi. Langkah yang membuatnya mudah ditemukan:

1. `npm login` lalu `npm publish` dari repo ini (nama `qa-kit` masih tersedia), supaya bisa
   `npx -y qa-kit setup opencode --yes`.
2. Ajukan PR ke daftar komunitas (misalnya *awesome-opencode*) dengan entri:

> **[qa-kit](https://github.com/MahmulP/qa-kit)**: QA automation memory, test-case catalogs,
> Playwright skills, subagents, commands, and an MCP server. Install with
> `npx -y github:MahmulP/qa-kit setup opencode --yes`.

## 7. Gemini CLI

Galeri ekstensi mengindeks repo yang punya `gemini-extension.json` di root. Paket qa-kit ada
di `dist/gemini`, jadi tidak ikut terindeks. Karena Gemini CLI sudah digantikan Antigravity
CLI, cukup pakai `npx -y github:MahmulP/qa-kit setup gemini --yes`.

## 8. skills.sh (semua agent, skill saja)

Tanpa submit: indeks merayapi repo GitHub publik yang punya `skills/<nama>/SKILL.md`.
Siapa pun bisa memasang keenam skill ke agent mana pun:

```bash
npx skills add MahmulP/qa-kit
```

Jalur ini hanya memasang skill (tanpa MCP server dan hooks).

---

## Rilis berikutnya

1. Ubah sumber, naikkan `version` di `package.json` (dan `.github/plugin/marketplace.json`).
2. `npm run build && npm test`, lalu commit `dist/`.
3. Tag `vX.Y.Z`, push, buat release, dan unggah ZIP:

```bash
for p in dist/*/; do n=$(basename "$p"); (cd "$p" && zip -qr "../../qa-kit-$n-X.Y.Z.zip" . -x '*.DS_Store'); done
```

4. Claude (webhook) ikut otomatis; awesome-copilot butuh issue baru dengan tag dan SHA baru;
   Codex butuh upload ZIP versi baru di portal.
