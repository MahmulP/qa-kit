# Privacy

qa-kit runs entirely on your machine. It collects no telemetry and sends no data to the
author or to any third party.

What it stores, all locally:

- `<app>/.qa-kit/`: the app's detected conventions, curated memory files, lessons, a
  generated index of test cases, and local test-run history. You decide whether to commit
  the `config.json` and `memory/` parts to your repository.
- `~/.qa-kit/` (or `QA_KIT_HOME`): lessons you mark as global and the list of app folders
  that use qa-kit.

The skills instruct agents never to store credentials, tokens, session files, or personal
data in memory, and never to set environment variables that enable data-mutating tests.

The MCP server and hooks read files in the project you open and in the stores above. They
make no network requests. Running Playwright tests (only when you ask) contacts whatever
servers your own test configuration points to.

Questions: https://github.com/MahmulP/qa-kit/issues
