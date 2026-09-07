# Quality Gate Console

A web UI for the **Automated Quality Gate** GitHub Action. The console never runs
any analysis itself — it is purely the front door:

1. **Sign in with GitHub.**
2. **Install** the gate onto a repository — the console commits a workflow file
   and a `config_cov.json`, and sets the repo secrets the action needs.
3. **Tune** the coverage thresholds from the web; saving re-commits
   `config_cov.json` to the repo.
4. From then on **GitHub Actions runs the gate** on every push / pull request.
   The verdict is posted to the pull request.
5. The console **reads those results back** from GitHub and shows them per PR.

Built with **Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS · Auth.js v5**.

## Sign in with GitHub

GitHub OAuth is the **only** way in — no anonymous mode, no password login.
`src/middleware.ts` gates every page and API route. Once signed in, the OAuth
token rides on the session JWT and **every GitHub call is made as that user**, so
the console can only ever see and change what that account already can.

Scope: `read:user user:email repo workflow`. `repo` reads private repositories;
`workflow` is required to commit `.github/workflows/quality-gate.yml`. Upgrading
from a `repo`-only build? **Sign out and back in once** to grant `workflow`.

### Create the OAuth app

<https://github.com/settings/developers> → **New OAuth App**

| Field | Value |
| --- | --- |
| Homepage URL | `http://localhost:3000` (or your deployed URL) |
| Authorization callback URL | `<url>/api/auth/callback/github` |

```
GITHUB_ID=...
GITHUB_SECRET=...
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=...          # openssl rand -base64 32
```

That is the **entire** server configuration. The Gemini key and SonarCloud token
are entered per-repo in the install wizard and stored as encrypted GitHub Actions
secrets on the target repo — they never touch the console's environment.

## Install the gate onto a repository

`/repos` lists every repo the account can reach. **Install** opens a wizard:

- **Coverage thresholds** — a global target plus optional per-file overrides.
  Written to `config_cov.json`, which the action reads (`qgConfig.global`,
  `qgConfig.files[path]`).
- **Triggers** — which branches and events (`push` / `pull_request`) the
  workflow reacts to. Baked into the `on:` block of the workflow YAML.
- **Repository secrets** — the **Gemini API key** (required) and an optional
  **SonarCloud token**. The console encrypts them with the repo's Actions public
  key (libsodium sealed box, via `tweetnacl-sealedbox-js`) and uploads them as
  `GEMINI_API_KEY` / `SONAR_TOKEN`. The console keeps no copy.

Installing makes **one commit** to the default branch with:

| Path | Purpose |
| --- | --- |
| `.github/workflows/quality-gate.yml` | Runs on the configured `push` / `pull_request` events. |
| `config_cov.json` | `{ "global": 80, "files": { "src/x.js": 50 } }` — the coverage targets. |
| `.quality-gate/` | The gate itself — `action.yml` + the ncc-bundled `dist/index.js`, vendored from `vendor/quality-gate-action/` in this repo. The workflow runs it with `uses: ./.quality-gate`, so there is no published action to depend on. |

### There is no local database

"Installed" is not a stored row — it is a fact about the repo: it has
`.github/workflows/quality-gate.yml`. The dashboard derives its list by scanning
the user's most-recently-pushed repositories for that file, and every
installation view is read live from the repo's own contents. Nothing to
provision, nothing to persist.

### The vendored action

`vendor/quality-gate-action/` holds `action.yml` and `dist/index.js` — the
Automated Quality Gate compiled to a single dependency-free bundle (ncc). The
console commits these into every installed repo under `.quality-gate/` and the
generated workflow calls them locally:

```yaml
      - name: Automated Quality Gate
        uses: ./.quality-gate
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          sonar_token: ${{ secrets.SONAR_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

To ship a new version of the gate, drop the rebuilt files into
`vendor/quality-gate-action/` and redeploy; the detail page's **Save changes** /
drift-repair re-commits them into a repo. `next.config.mjs` traces `vendor/**`
into the install API routes so `fs` can read them at runtime.

The **Gemini API key**: entered per-repo in the wizard, or left blank to fall
back to the console's own `GEMINI_API_KEY` env var. Either way it is written as
the target repo's `GEMINI_API_KEY` Actions secret.

## Reading results

`/installed/<owner>/<repo>` shows, per open pull request, the latest gate run's
status and — expandable inline — the full **report comment** the action posted to
that PR (matched by its `AI-Powered Quality Gate Report` heading). It also lists
recent workflow runs and lets you re-tune coverage / triggers / secrets or
uninstall.

To actually **block merges** on a red gate, add a branch-protection rule on
GitHub requiring the **Quality Gate** status check — that is a repo setting, not
something the console configures.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in GITHUB_ID / GITHUB_SECRET / NEXTAUTH_SECRET
npm run dev                  # http://localhost:3000
```

## Layout

```
src/
  middleware.ts              auth gate over every page + API route
  app/
    signin/page.tsx          "Sign in with GitHub" — the only entry point, no sidebar
    (app)/
      layout.tsx             sidebar + auth redirect for everything below
      page.tsx               dashboard: repos with the gate installed
      repos/page.tsx         browse repos, install the gate
      repos/[owner]/[repo]/install/page.tsx   install wizard (coverage + triggers + secrets)
      installed/[owner]/[repo]/page.tsx       reconfigure, secrets, per-PR results, uninstall
    api/
      auth/[...nextauth]/    Auth.js route handlers
      github/repos/          search + list the user's repositories
      github/files/          repo metadata + branch list (for the wizard)
      installations/         GET (scan) · POST (commit files + set secrets)
      installations/[owner]/[repo]/   GET (record + runs + PR results) · PATCH · DELETE
  lib/
    auth.ts                  Auth.js config — GitHub provider, token on the JWT
    github.ts                GitHub REST client (repos, contents R/W, runs, PRs, comments, secrets)
    githubSecrets.ts         sealed-box encryption for repo Actions secrets
    installations.ts         derives the installed view from a repo's own contents
    workflowTemplate.ts      builds quality-gate.yml + config_cov.json
    apiErrors.ts             maps GitHub write failures (esp. missing `workflow` scope)
    types.ts                 CoverageConfig / WorkflowTriggers / InstalledRepo / GatePrResult

action/                      a from-scratch re-implementation of the gate — NOT used by
                             the console anymore; kept for reference only
```
