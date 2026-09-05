# Quality Gate Console

A web UI for the **Automated Quality Gate** (`../Automated-Quality-Gate (1)`). Instead of
pushing to GitHub and reading the results in a pull-request comment, you **sign in with
GitHub**, pick one of your repositories, choose the files to check, and read the report in
the browser. Every run gets a shareable `/runs/<id>` permalink.

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

The requested scope is `read:user user:email repo`. The `repo` part is what lets the console
list and read **private** repositories; drop it to `public_repo` if you only need public ones.

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
src/
  middleware.ts              auth gate over every page + API route
  app/
    signin/page.tsx          "Sign in with GitHub" — the only entry point
    page.tsx                 repo picker → file picker → config → result
    runs/[id]/page.tsx       permalink for a past run (owner-only)
    api/auth/[...nextauth]/  Auth.js route handlers
    api/github/repos/        search + list the user's repositories
    api/github/files/        branches + analysable source files in a ref
    api/analyze/             POST repo selection *or* uploaded files -> run -> persist
    api/runs/[id]/           fetch a stored run (owner-only)
  components/                RepoPicker, RepoFilePicker, ReportView and its panels
  lib/
    auth.ts                  Auth.js config — GitHub provider, token on the JWT
    github.ts                GitHub REST client (repos, tree, file contents)
    engine/index.ts          orchestrator (branches simulation vs live)
    engine/liveRunner.ts     spawns the real generate-tests.js in a git workspace
    engine/heuristics.ts     static analysis for the simulation engine
    engine/npmAudit.ts       real `npm audit`
    report.ts                port of generateMarkdownReport() from the Action
    store.ts                 filesystem run persistence (.data/runs), scoped by login
    types.ts                 Report shape shared with the Action's `summary`
```

Runs are stored as JSON under `.data/runs/` (git-ignored). Live workspaces are created under
`Automated-Quality-Gate/.qg-runs/<id>/` and deleted after each successful run.
