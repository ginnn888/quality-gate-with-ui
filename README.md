# Quality Gate Console

A web UI for the **Automated Quality Gate** (`../Automated-Quality-Gate (1)`). Two ways to use
it, both after **signing in with GitHub**:

- **Run gate** (`/`) — a one-off run: pick a repo + files (or upload files), read the report in
  the browser, share it via its `/runs/<id>` permalink.
- **Install** (`/repos` → `/installed`) — commit a small GitHub Actions workflow into a repo so
  the gate runs automatically on every `push` / `pull_request`. Set the pass/fail thresholds at
  install time, change them or uninstall whenever. See
  [Install the gate onto a repository](#install-the-gate-onto-a-repository).

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Auth.js v5**.

## Sign in with GitHub

GitHub OAuth is the **only** way into the console — there is no anonymous mode and no
password login. `src/middleware.ts` gates every page and API route: an unauthenticated
browser request is redirected to `/signin`, an unauthenticated API request gets a 401.

Once signed in, the account is connected to the console:

- the OAuth token is kept on the session JWT and **every GitHub call is made as that user**,
  so the console can only ever see repositories that account can see;
- runs are stamped with the GitHub login that produced them, and the history list and
  `/runs/<id>` permalink only return your own runs.

The requested scope is `read:user user:email repo workflow`. `repo` lets the console list and
read **private** repositories; `workflow` is required on top of it so the console can create or
update `.github/workflows/quality-gate.yml` when you install the gate. If you upgraded from a
build that only asked for `repo`, **sign out and back in once** to grant `workflow` — installs
fail with a "missing the `workflow` scope" message until you do.

### Create the OAuth app

<https://github.com/settings/developers> → **New OAuth App**

| Field | Value |
| --- | --- |
| Homepage URL | `http://localhost:3000` |
| Authorization callback URL | `http://localhost:3000/api/auth/callback/github` |

Then put the credentials in `.env.local`:

```
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...          # openssl rand -base64 32
```

## Picking what to check

1. **Choose a repository** — the picker lists the repositories the signed-in account pushed
   to most recently; typing searches GitHub (scoped to the account, so private repos are
   included).
2. **Choose the files** — the console reads the repository tree for the selected branch and
   lists the analysable sources, already filtered: `.js .jsx .ts .tsx .mjs .cjs`, minus
   `node_modules`, build output, and existing test files (the gate writes its own tests).
   Up to 25 files, 512 KB each.
3. **Run the gate** — the selected files are fetched with your token and handed to the
   pipeline below, which is **unchanged**: it receives `{name, content}` exactly as it did
   for uploads. Nothing about the analysis differs based on where the code came from.

The **Upload files** tab keeps the original drag-and-drop path for code that isn't in a repo.

## Install the gate onto a repository

`/repos` lists every repo the account can reach. **Install** on one opens a wizard: set the
coverage target, toggles, watched branches and trigger events, then confirm. The console then
commits two files to the repo's default branch via the GitHub Contents API:

| File | Purpose |
| --- | --- |
| `.github/workflows/quality-gate.yml` | Runs on the configured `push` / `pull_request` events. Calls the reusable action `ginnn888/quality-gate-with-ui/action@main` (see [`action/`](action/README.md)). |
| `quality-gate.config.json` | The thresholds the action reads. |

- **`/installed`** — a card per installed repo (watched branches, coverage target, latest
  workflow-run result pulled live from the GitHub Actions API).
- **`/installed/<owner>/<repo>`** — recent runs, an edit form that re-commits
  `quality-gate.config.json` (and the workflow when triggers change), a drift banner if either
  file goes missing, and **Uninstall** (deletes both files, then forgets the installation).

Installation records live under `.data/installations/<owner>__<repo>.json`, scoped to the
GitHub login that installed them — same store pattern as runs.

### What runs in CI

The action runs the **simulation** engine (dependency-free static analysis + `npm audit`,
no secrets) by default. Add a **`GEMINI_API_KEY`** *repo secret* to the target repo to switch
it to the **live** engine (real Gemini review + coverage estimate per changed file); any live
failure falls back to simulation. The job writes the Markdown report to the run's **job
summary** and exits non-zero on a failing gate.

### Blocking merges

The action only reports a check. To actually block a merge on a red gate, add a
**branch-protection rule** on GitHub requiring the **Quality Gate** status check — that part is
a repo setting, not something the console configures.

## Two engines

Set `QG_ENGINE` in `.env.local`.

### `live` — runs the REAL Automated Quality Gate

`src/lib/engine/liveRunner.ts` creates a throwaway git workspace inside the action directory,
drops the selected files into `src/`, and runs the **actual `generate-tests.js`** from
`../Automated-Quality-Gate (1)/Automated-Quality-Gate` (resolving that project's own
`node_modules` for Jest + `@google/generative-ai`). The only change made to the script is two
extra `writeFileSync` calls so the web app can read back its `summary` object and Markdown.

| Stage | What actually happens |
| --- | --- |
| detect modified files | real `git diff main…HEAD -- src/` in the workspace |
| dependency audit | real `npm audit --json` |
| AI review + classification | **real Google Gemini call** per file (`QG_GEMINI_MODEL`) |
| test-gen + coverage gate | **real Gemini** writes Jest suites → **real `npx jest --coverage`** → real per-file % vs `config_cov.json` (generated from the UI's coverage settings) |
| AI failure analysis | real Gemini call when a generated suite fails |
| SonarCloud | fetches the project's current gate via the REST API. The console does **not** run a `sonar-scanner` upload, so when the API returns no analysis the check shows **UNAVAILABLE** and does not affect the result. |

A live run takes ~25–40 s (several Gemini calls + a Jest run). Requires `GEMINI_API_KEY`.

### `simulation` — default, zero-config

`npm audit` is still real; everything else is dependency-free static analysis over the
selected source (flags `eval`, shell `exec`, hardcoded secrets, weak randomness, missing
input validation, `-0` leaks, loose equality), with coverage estimated from that analysis.

## Run it

```bash
cd "quality-gate-ui"
npm install
cp .env.example .env.local   # fill in GITHUB_ID / GITHUB_SECRET / NEXTAUTH_SECRET
npm run dev                  # http://localhost:3000
```

## Layout

```
action/                      reusable composite GitHub Action (see action/README.md)
  action.yml                 setup-node → node runner.mjs
  runner.mjs                 diff range → read changed files → engine → job summary → exit code
  lib/                       simulate.mjs · live.mjs · heuristics.mjs · npmAudit.mjs · report.mjs

src/
  middleware.ts              auth gate over every page + API route
  app/
    signin/page.tsx          "Sign in with GitHub" — the only entry point
    page.tsx                 manual run: repo/file picker → config → result
    history/page.tsx         all your manual runs
    repos/page.tsx           browse repos, install the gate
    repos/[owner]/[repo]/install/page.tsx   install wizard
    installed/page.tsx       cards for installed repos
    installed/[owner]/[repo]/page.tsx       runs + reconfigure + uninstall
    runs/[id]/page.tsx       permalink for a past run (owner-only)
    api/auth/[...nextauth]/  Auth.js route handlers
    api/github/repos/        search + list the user's repositories
    api/github/files/        branches + analysable source files in a ref
    api/analyze/             POST repo selection *or* uploaded files -> run -> persist
    api/runs/[id]/           fetch a stored run (owner-only)
    api/installations/       GET list · POST install
    api/installations/[owner]/[repo]/   GET (record+runs+drift) · PATCH reconfigure · DELETE uninstall
  components/                Sidebar, RepoPicker, GateConfigPanel, InstalledRepoCard, ReportView …
  lib/
    auth.ts                  Auth.js config — GitHub provider, token on the JWT
    github.ts                GitHub REST client (repos, tree, contents R/W, workflow runs)
    installations.ts         filesystem store for installed repos (.data/installations)
    workflowTemplate.ts      builds quality-gate.yml + quality-gate.config.json
    apiErrors.ts             maps GitHub write failures (esp. missing `workflow` scope)
    engine/index.ts          orchestrator for the manual flow (simulation vs live)
    engine/liveRunner.ts     spawns the real generate-tests.js in a git workspace
    engine/heuristics.ts     static analysis for the simulation engine
    engine/npmAudit.ts       real `npm audit`
    report.ts                port of generateMarkdownReport() from the Action
    store.ts                 filesystem run persistence (.data/runs), scoped by login
    types.ts                 Report + GateConfig + InstallationRecord shapes
```

Runs are stored as JSON under `.data/runs/`; installations under `.data/installations/` (both
git-ignored). Live workspaces are created under `Automated-Quality-Gate/.qg-runs/<id>/` and
deleted after each successful run.

> **Note:** `action/lib/{heuristics,npmAudit,report}.mjs` are hand-kept plain-ESM copies of
> `src/lib/engine/{heuristics,npmAudit}.ts` + `src/lib/report.ts` — they run in a consumer
> repo's checkout where the TS sources aren't present. Change the rules in one, mirror them in
> the other.
