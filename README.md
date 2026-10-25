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

Requirements: Node.js 18+ and the agent you want to use. Pick your harness:

### Claude Code

```bash
claude plugin marketplace add MahmulP/qa-kit
claude plugin install qa-kit@qa-kit
```

Check: `/plugin` lists qa-kit as enabled and `/mcp` shows `plugin:qa-kit:qa-kit` connected.

### Codex (CLI and app)

```bash
codex plugin marketplace add MahmulP/qa-kit
codex plugin add qa-kit@qa-kit
```

In the app, add the marketplace `MahmulP/qa-kit` in the Plugins Directory and install qa-kit.
Check: `codex plugin list` shows `qa-kit@qa-kit installed, enabled` and `codex mcp list`
shows `qa-kit`. Codex asks you to review and trust the plugin hooks once in `/hooks`.

### GitHub Copilot CLI

```bash
copilot plugin marketplace add MahmulP/qa-kit
copilot plugin install qa-kit@qa-kit
```

Check: `copilot plugin list` shows `qa-kit@qa-kit` and `copilot mcp list` shows `qa-kit` under
plugin servers.

### VS Code (Agent Plugins)

Add the marketplace `MahmulP/qa-kit` in the Chat plugins view and install qa-kit, or install
the plugin from a local copy of `dist/copilot`.

### Cursor

```bash
npx -y github:MahmulP/qa-kit setup cursor --yes
```

This copies the plugin to `~/.cursor/plugins/local/qa-kit`. Run **Developer: Reload Window**
and check **Customize** for the qa-kit skills, rule, commands, hooks, and MCP server. Teams:
Dashboard → Plugins & MCPs → Team Marketplaces → Import from Repo → this repository.

### Antigravity (app, IDE, `agy`)

```bash
npx -y github:MahmulP/qa-kit setup antigravity --yes
```

This runs `agy plugin install` and points the MCP server at the installed copy. Restart
Antigravity. Check: `agy plugin list` and the MCP Servers panel.

### Gemini CLI

```bash
npx -y github:MahmulP/qa-kit setup gemini --yes
```

Gemini asks you to trust the extension folder; answer `y`. Check: `gemini extensions list`
shows qa-kit with its MCP server and six skills.

### OpenCode

```bash
npx -y github:MahmulP/qa-kit setup opencode --yes
```

Add `--scope project` to install into the current repo instead of your user config. Your
existing `opencode.jsonc` comments are kept. Check: `opencode mcp list` shows `qa-kit
connected` and `opencode debug skill` lists the qa-* skills.

### Any agent, skills only

```bash
npx skills add MahmulP/qa-kit
```

Installs the six skills through [skills.sh](https://skills.sh) into the agents you choose
(no MCP server or hooks).

### Everything at once

```bash
npx -y github:MahmulP/qa-kit setup all
```

Prints the plan for every harness found on your machine; add `--yes` to apply it. Restart
each agent afterwards.

### First run in an app

Open the repository of a web app and ask your agent *"set up qa-kit for this app"*, or run
`/qa-kit:init` (Claude Code), `/qa-init` (Cursor, OpenCode), or `/qa:init` (Gemini CLI). From a
terminal:

```bash
npx -y github:MahmulP/qa-kit init
```

This creates `.qa-kit/`, detects the app's conventions, and indexes its test cases. Commit
`.qa-kit/config.json` and `.qa-kit/memory/` so the team shares them.

Optional, to have the `qa-kit` CLI on your PATH:

```bash
npm install -g github:MahmulP/qa-kit
```

### Updating

| Harness | Update |
| --- | --- |
| Claude Code | `claude plugin marketplace update qa-kit` then `claude plugin update qa-kit@qa-kit` |
| Codex | `codex plugin marketplace upgrade` then `codex plugin add qa-kit@qa-kit` |
| Copilot CLI | `copilot plugin marketplace update` then `copilot plugin update qa-kit` |
| Cursor, Antigravity, Gemini, OpenCode | run the same `setup … --yes` command again |

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

Every install path below was run from GitHub on a clean, isolated config (October 2026):

| Harness | Version tested | Result |
| --- | --- | --- |
| Claude Code | current | marketplace add + install; `claude mcp list` → `plugin:qa-kit:qa-kit ✔ Connected`; official validator passes, including `--profile directory` |
| Codex CLI | 0.164.0 | `plugin marketplace add` + `plugin add` → installed, enabled; `codex mcp list` shows `qa-kit` with `PLUGIN_ROOT` expanded |
| GitHub Copilot CLI | current | `plugin marketplace add` + `plugin install` → 6 skills installed; `copilot mcp list` shows `qa-kit` as a plugin server |
| Gemini CLI | 0.65.0 | `extensions install` → context file, MCP server `qa-kit`, 6 skills |
| Antigravity CLI | 1.2.12 | `setup antigravity` → `agy plugin install` + `agy plugin validate` (6 skills, 3 agents, 8 commands, MCP, 2 hooks) |
| OpenCode | 1.18.31 | `setup opencode` → `opencode mcp list` → `qa-kit ✓ connected`; skills, agents, commands, and plugin loaded |
| Cursor | – | `setup cursor` copies a valid plugin; loading inside the Cursor app not yet tested |
| VS Code | – | same package as Copilot CLI; not yet tested inside VS Code |
| skills.sh | latest | `npx skills add MahmulP/qa-kit` installs the six skills |

Hooks need a live agent session to fire; their input and output formats are covered by the
test suite for every host. Reports from real use are welcome in
[issues](https://github.com/MahmulP/qa-kit/issues).

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
