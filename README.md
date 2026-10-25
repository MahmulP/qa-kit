# qa-kit

**English** · [Bahasa Indonesia](README.id.md)

QA automation plugin for coding agents. One source, native plugins for **Claude Code,
Codex, GitHub Copilot (CLI and VS Code), Cursor, Antigravity, Gemini CLI, and OpenCode**.

qa-kit gives every agent the same long-term QA memory for your web apps and a disciplined
workflow for Playwright testing:

- **Memory that keeps learning**: per-app knowledge (`.qa-kit/` in each repo: app map,
  test conventions, lessons such as selectors, gotchas, bugs, flaky tests, decisions) plus
  global lessons shared by every app (`~/.qa-kit/`). Loaded at session start, updated after
  every run and task.
- **Convention detection, no assumptions**: test dir, fixtures import, suite script,
  Playwright projects, folder → project scopes, mutation tags, dangerous env vars, catalog
  file names, ID pattern, catalog language. All stored in the app's own config and editable.
- **Test-case index**: markdown catalogs (`test-cases.md`, `*.cases.md`, …) joined with spec
  titles by case ID, with automation status, findings, and catalog↔spec drift.
- **Run history**: Playwright results recorded per test (new failures, fixed, flaky).
- **Skills and subagents** for the loop *recall → explore → design cases → write spec → run
  (only when asked) → triage → learn*.
- **MCP server** with 11 tools, so any MCP-capable agent can use it.

Zero dependencies: Node.js ≥ 18.

## Install

The fastest way for every harness found on your machine:

```bash
npx -y github:MahmulP/qa-kit setup all
```

That prints the plan. Add `--yes` to apply it. Or install per harness:

| Harness | Install | Package |
| --- | --- | --- |
| Claude Code | `claude plugin marketplace add MahmulP/qa-kit` then `claude plugin install qa-kit@qa-kit` | [`dist/claude`](dist/claude) |
| Codex (CLI and app) | `codex plugin marketplace add MahmulP/qa-kit`, then install **qa-kit** from `/plugins` or the Plugins Directory, and trust its hooks in `/hooks` | [`dist/codex`](dist/codex) |
| GitHub Copilot CLI | `copilot plugin marketplace add MahmulP/qa-kit` then `copilot plugin install qa-kit@qa-kit` | [`dist/copilot`](dist/copilot) |
| VS Code (Agent Plugins) | Add the marketplace `MahmulP/qa-kit` and install **qa-kit**, or install the plugin from a local `dist/copilot` folder | [`dist/copilot`](dist/copilot) |
| Cursor | `npx -y github:MahmulP/qa-kit setup cursor --yes` (copies to `~/.cursor/plugins/local/qa-kit`). Teams: Dashboard → Plugins & MCPs → Team Marketplaces → Import from Repo → this repository | [`dist/cursor`](dist/cursor) |
| Antigravity (app, IDE, `agy`) | `npx -y github:MahmulP/qa-kit setup antigravity --yes` | [`dist/antigravity`](dist/antigravity) |
| Gemini CLI | `npx -y github:MahmulP/qa-kit setup gemini --yes` | [`dist/gemini`](dist/gemini) |
| OpenCode | `npx -y github:MahmulP/qa-kit setup opencode --yes` (add `--scope project` for one repo) | [`dist/opencode`](dist/opencode) |

Restart the harness afterwards. Then open an app repo and ask, for example, *"set up qa-kit
for this app"* or run `/qa-kit:init` (Claude Code), `/qa-init` (Cursor, OpenCode), or
`/qa:init` (Gemini CLI).

Optional, to have the `qa-kit` CLI on your PATH:

```bash
npm install -g github:MahmulP/qa-kit
```

### What each harness gets

| Feature | Claude | Codex | Copilot / VS Code | Cursor | Antigravity | Gemini | OpenCode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 6 QA skills | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| MCP server `qa-kit` (11 tools) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Commands | `/qa-kit:*` | via skills | via skills | `/qa-*` | converted to skills | `/qa:*` | `/qa-*` |
| Subagents | ✔ | – | ✔ | ✔ | ✔ | – | ✔ |
| Memory digest at session start | SessionStart | SessionStart | sessionStart | sessionStart | PreInvocation, once per conversation | SessionStart | via `qa_status` |
| Playwright runs recorded automatically | PostToolUse | PostToolUse | postToolUse | afterShellExecution | PostToolUse | AfterTool | `tool.execute.after` |
| Always-on rule | – | – | – | `.mdc` rule | `rules/AGENTS.md` | `GEMINI.md` | – |

The MCP server finds the project through **MCP roots** (the workspace open in the host),
then host env vars (`CLAUDE_PROJECT_DIR`, `CURSOR_PROJECT_DIR`, …). It never mistakes the
plugin folder for the project; without any hint, tools ask for a `root` argument.

### Per-repo adapters (without a plugin)

Teams that want agent config committed with the app can write adapters into the repo:

```bash
npx -y github:MahmulP/qa-kit init --targets agents-md,skills,codex,cursor,gemini,copilot,antigravity
```

| Target | Writes |
| --- | --- |
| `agents-md` | Managed block in `AGENTS.md` (Codex, OpenCode, Amp, Cursor, Copilot agent, Windsurf, Kiro) |
| `skills` | `.agents/skills/qa-*` (Codex, Cursor, Antigravity, Gemini CLI, OpenCode) |
| `codex` | `.codex/config.toml` MCP block + skills |
| `cursor` | `.cursor/rules/qa-kit.mdc`, `.cursor/mcp.json` + skills |
| `gemini` | `GEMINI.md` block, `.gemini/settings.json` MCP + skills |
| `copilot` | `.github/instructions/qa-kit.instructions.md`, `.github/skills/`, `.vscode/mcp.json` |
| `antigravity` | `.agents/rules/qa-kit.md`, `.agents/mcp_config.json` + skills |
| `claude` | `.claude/skills/` + `.mcp.json` |

All writes are idempotent: managed blocks are replaced, JSON is merged under the `qa-kit`
key only. `--dry-run` lists files without writing.

## Using it

```bash
qa-kit init                                     # create .qa-kit/, scan, index, detect conventions
qa-kit status                                   # memory digest + detected conventions
qa-kit config                                   # show or fix conventions (config set <path> <value>)
qa-kit gaps --page billing                      # todo cases, catalog/spec drift, routes without tests
qa-kit cases --id INV-05                        # catalog row + linked spec
qa-kit next-id INV                              # next free case ID (keeps separator and width)
qa-kit memory add --kind selector --scope e2e/billing "…"
qa-kit memory add --global --kind gotcha "…"   # lesson for every app
qa-kit memory search "invoice export"
qa-kit run --dry-run -- e2e/billing/invoices -g INV-01   # script/project picked from scopes
qa-kit history --filter flaky
qa-kit apps                                     # every app using qa-kit on this machine
```

Commands in Claude Code (`/qa-init`, `/qa-status`, … in Cursor and OpenCode; `/qa:init`, …
in Gemini CLI; in Codex, Copilot, and Antigravity just ask in plain language, the same skills
trigger):

| Command | Does |
| --- | --- |
| `/qa-kit:init` | Create `.qa-kit/`, scan, index, confirm detected conventions, summarize QA rules into `conventions.md` |
| `/qa-kit:explore [module]` | Map the app into memory (one `qa-explorer` subagent per module) |
| `/qa-kit:cases <page> [ticket]` | Design or update the test-case catalog |
| `/qa-kit:write <page> [run]` | Catalog → Playwright specs in the app's conventions |
| `/qa-kit:run <scope>` | Run the narrowest scope, record results, triage |
| `/qa-kit:triage [scope]` | Classify failures: app bug / test bug / environment / flaky / known |
| `/qa-kit:learn [fact]` | Save a lesson or correction |
| `/qa-kit:status [area]` | Coverage, test health, gaps |

MCP tools: `qa_status`, `qa_config`, `qa_scan`, `qa_find_cases`, `qa_coverage_gaps`,
`qa_next_id`, `qa_memory_search`, `qa_memory_add` (with `global`), `qa_memory_forget`,
`qa_knowledge`, `qa_test_history`, `qa_ingest_results`.

### Rules the skills enforce

- Expected results come from requirements (ticket, API contract, schema, UI copy), never
  from what the app does today.
- A known bug stays a failing test with an issue annotation and a catalog finding.
- E2E suites run only when the user asks, at the narrowest scope. Agents never set the
  env vars in `e2e.protectedEnv`, never point tests at production, never write credentials.
- The app's own QA rules (AGENTS.md, rule folders, docs) win over qa-kit defaults.
- Every task ends by saving what was learned.

## Storage

```
<app>/.qa-kit/
├── config.json               # committed: detected or corrected conventions
├── memory/                   # committed: shared by the team and every agent
│   ├── app.md                # modules, routes, auth/roles, environments, UI patterns, risks
│   ├── conventions.md        # how tests are written here, layout, review feedback log
│   ├── glossary.md           # UI terms
│   └── lessons.jsonl         # atomic lessons (IDs M-…)
├── index/                    # generated, git-ignored: structure.json, test-cases.json
└── history/                  # local, git-ignored: runs.jsonl, tests.json (p/F/~/s per test)

~/.qa-kit/                    # override with QA_KIT_HOME
├── lessons.jsonl             # global lessons (IDs G-…), searched from every app
└── apps.json                 # apps using qa-kit (`qa-kit apps`)
```

Catalog languages ship as packs (English and Indonesian); add words for other languages with
`qa-kit config set catalog.vocabulary '{"todo":["…"]}'`.

## Repository layout

```
bin/qa-kit.mjs                CLI (setup, init, scan, memory, run, mcp, hook, build, …)
lib/                          scan, catalog, vocab, memory, results, run, mcp, hooks, build, setup, install
skills/ agents/ commands/     single source for every harness ({{CLI}} / {{ARGS}} placeholders)
templates/                    memory templates, AGENTS.md block, plugin context
dist/<harness>/               generated native plugins (do not edit)
.claude-plugin/marketplace.json   Claude Code marketplace → dist/claude
.agents/plugins/marketplace.json  Codex marketplace → dist/codex
.github/plugin/marketplace.json   Copilot / VS Code marketplace → dist/copilot
.cursor-plugin/marketplace.json   Cursor marketplace → dist/cursor
test/                         node --test, two fixture apps with different conventions
```

## Development

```bash
npm run build                          # regenerate dist/<harness>/ from sources
npm test                               # core + per-harness manifests, hooks, MCP
claude plugin validate dist/claude     # official Claude Code validator
agy plugin validate dist/antigravity   # official Antigravity validator
```

`dist/` is committed because the marketplaces point at it; CI fails when it is stale.
`dist/codex-directory` is a skills-only variant for the public Codex Plugins Directory, which
does not accept hooks or local MCP servers. Marketplace submission steps and form drafts:
[docs/PUBLISHING.md](docs/PUBLISHING.md). Privacy: [PRIVACY.md](PRIVACY.md).

## Verification status

| Harness | Verified |
| --- | --- |
| Claude Code | Official validator; installed from the marketplace; `claude mcp list` shows `plugin:qa-kit:qa-kit ✔ Connected` |
| Antigravity | `agy plugin validate` and `agy plugin install` (6 skills, 3 agents, 8 commands, 1 MCP server, 2 hooks) |
| OpenCode | `opencode debug skill`/`debug config` load all skills, agents, commands, and the plugin; `opencode mcp list` shows `qa-kit ✓ connected` |
| Codex, Copilot / VS Code, Cursor, Gemini CLI | Manifests tested against the published specs (Agent Plugins 1.0, Cursor, Gemini); MCP servers started exactly as each manifest declares; hooks tested with each host's documented payloads. Reports from real installs are welcome. |

## Known limitations

- Spec and config parsing uses regexes, not a TypeScript parser: titles built from variables
  are not read, and projects computed in code are detected only through `--project=` in
  scripts (otherwise set `e2e.projects` / `e2e.scopes`).
- Route coverage is a heuristic and supports file-based routers (SvelteKit, Next.js, Nuxt).
- Without a JSON report, `ingest` reads only failures (`error-context.md`); `qa-kit run`
  always adds the JSON reporter.
- Copilot does not document a plugin-root variable for hooks; the hook tries `PLUGIN_ROOT`,
  `COPILOT_PLUGIN_ROOT`, then `CLAUDE_PLUGIN_ROOT`, and stays silent if none is set.
- Antigravity does not document the working directory of plugin MCP servers; `setup
  antigravity` writes an absolute path after installing.
- Gemini CLI was superseded by Antigravity CLI (June 2026); its package stays for existing installs.

## License

[MIT](LICENSE)
