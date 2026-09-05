# Automated Quality Gate — reusable action

This folder is a **composite GitHub Action**. The Quality Gate console (`../src`) commits a
small workflow into each repo it is installed on, and that workflow calls this action:

```yaml
# .github/workflows/quality-gate.yml  (written by the console on "Install")
name: Quality Gate
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
permissions:
  contents: read
  pull-requests: write
jobs:
  quality-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: ginnn888/quality-gate-with-ui/action@main
        with:
          config-path: quality-gate.config.json
          gemini-api-key: ${{ secrets.GEMINI_API_KEY }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input | Default | Purpose |
| --- | --- | --- |
| `config-path` | `quality-gate.config.json` | Thresholds file in the consumer repo (also written by the console). |
| `gemini-api-key` | `""` | When set (repo secret `GEMINI_API_KEY`), the **live** engine runs a real Gemini review + coverage estimate per file. Absent → the **simulation** engine (static analysis + `npm audit`, no secrets). |
| `github-token` | `""` | Passed through for future PR-comment support; not required today. |

## `quality-gate.config.json`

```json
{
  "globalCoverage": 80,
  "perFileCoverage": { "src/payments.js": 95 },
  "enableSonar": true,
  "enableAiReview": true,
  "branches": ["main"],
  "events": ["push", "pull_request"]
}
```

`branches` / `events` only drive how the console regenerates the workflow file; the runner
itself reads `globalCoverage`, `perFileCoverage`, `enableSonar`, `enableAiReview`.

## What the runner does

1. Loads `quality-gate.config.json` (falls back to defaults with a warning).
2. Resolves the changed source files:
   - `pull_request` → `git diff origin/<base>...HEAD`
   - `push` → `before..after` from the event payload
   - filtered to `.js .jsx .ts .tsx .mjs .cjs`, minus `node_modules`, build output and tests.
3. Runs the **live** engine if `gemini-api-key` is set (any failure falls back to
   **simulation**).
4. Writes the Markdown report to the **job summary** (`$GITHUB_STEP_SUMMARY`).
5. Exits `1` when the gate fails — combine with a **required status check /
   branch-protection rule** on the repo to actually block merges.

## Files

| File | Role |
| --- | --- |
| `action.yml` | Composite action definition. |
| `runner.mjs` | Entry point (diff range → read files → engine → summary → exit code). |
| `lib/simulate.mjs` | Simulation pipeline (static analysis + `npm audit`). |
| `lib/live.mjs` | Gemini per-file review + coverage estimate. |
| `lib/heuristics.mjs` | Static analysis rules. |
| `lib/npmAudit.mjs` | `npm audit --json` wrapper. |
| `lib/report.mjs` | Markdown report builder. |

### Sync note

`lib/heuristics.mjs`, `lib/npmAudit.mjs`, `lib/report.mjs` and the pipeline in
`lib/simulate.mjs` are **hand-kept copies** of `../src/lib/engine/*.ts` + `../src/lib/report.ts`.
They run in a consumer repo's checkout where the Next/TS sources do not exist, so there is no
shared bundle. Change the rules in one place → mirror them in the other.

## Local smoke test

```bash
cd /path/to/some/git/repo-with-changes
printf '{"globalCoverage":70,"enableSonar":false,"enableAiReview":true}' > quality-gate.config.json
# make a change to a .js file so `git diff HEAD~1..HEAD` (or working tree) has something
node /path/to/quality-gate-ui/action/runner.mjs
echo "exit: $?"
```
