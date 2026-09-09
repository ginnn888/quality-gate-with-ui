# Quality Gate Console

A web UI for the **Automated Quality Gate** GitHub Action. The console never runs
any analysis itself — it is purely the front door:

1. **Sign in with GitHub.**
2. **Install** the gate onto a repository — the console commits a workflow file
   and a `config_cov.json`, and sets the repo secrets the action needs. The
   workflow calls the gate straight from
   [`NonnaritRammaneekultawat-6609650459/test-github-marketplace`](https://github.com/NonnaritRammaneekultawat-6609650459/test-github-marketplace)
   (`uses: NonnaritRammaneekultawat-6609650459/test-github-marketplace@main`) — nothing else is written into
   the repo.
3. **Tune** the coverage thresholds from the web; saving re-commits
   `config_cov.json` to the repo.
4. From then on **GitHub Actions runs the gate** on every push / pull request.
   The verdict is posted to the pull request.
5. The console **reads those results back** from GitHub and shows them per PR,
   with a PASS / FAIL / SKIPPED badge and the full report inline.

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
- **SonarCloud organization** (optional) — when given alongside a token, the
  console also commits `sonar-project.properties`
  (`sonar.projectKey=<org>_<repo>`, the SonarCloud GitHub-import convention) so
  the gate can query SonarCloud without the user hand-authoring that file.
- **Open a PR with the AI-generated tests** (optional) — when on, the generated
  workflow gets `contents: write` and passes `open_tests_pr: "true"`. On every
  pull-request run the gate publishes the generated suite + merged
  `config_cov.json` + report to `aqg-tests/pr-<n>` and opens/refreshes a
  companion PR into that PR's branch (skipped for PRs from forks).
  `AQG_OPEN_TESTS_PR` sets the console-wide default.

Installing makes **one commit** to the default branch with:

| Path | Purpose |
| --- | --- |
| `.github/workflows/quality-gate.yml` | Runs on the configured `push` / `pull_request` events. |
| `config_cov.json` | `{ "global": 80, "files": { "src/x.js": 50 } }` — the coverage targets. |
| `sonar-project.properties` | Only when a SonarCloud org is supplied — points the gate at `<org>_<repo>`. |

That's it — no action code is copied into the repo.

### There is no local database

"Installed" is not a stored row — it is a fact about the repo: it has
`.github/workflows/quality-gate.yml`. The dashboard derives its list by scanning
the user's most-recently-pushed repositories for that file, and every
installation view is read live from the repo's own contents. Nothing to
provision, nothing to persist.

### The generated workflow

`.github/workflows/quality-gate.yml` mirrors
[`NonnaritRammaneekultawat-6609650459/test-github-marketplace`](https://github.com/NonnaritRammaneekultawat-6609650459/test-github-marketplace)'s
own `ci.yaml` — checkout (`fetch-depth: 0`), Node 20, a tolerant
`npm ci`/`install`/skip, an optional SonarCloud scan (only when a `SONAR_TOKEN`
repo secret is set), then the gate itself:

```yaml
      - name: Automated Quality Gate
        if: always()
        uses: NonnaritRammaneekultawat-6609650459/test-github-marketplace@main
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          sonar_token: ${{ secrets.SONAR_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

The gate does the AI review + test generation + coverage/audit/Sonar gate, posts
the report comment to the PR (`## 🚀 AI-Powered Quality Gate Report`), and exits
non-zero on a failing gate. A repo with no `package.json` / no changed `src/`
files still runs green (the gate reports "skipped").

Because the workflow pins `@main`, every run uses the current version of the gate
— there is nothing to keep in sync. Set `AQG_ACTION_REF` on the console to pin
installs to a tag or commit SHA instead; **Save changes** on the detail page
re-commits the workflow so an updated ref reaches existing installs.

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
    workflowTemplate.ts      builds quality-gate.yml (uses: NonnaritRammaneekultawat-6609650459/test-github-marketplace@<ref>)
                             + config_cov.json
    apiErrors.ts             maps GitHub write failures (esp. missing `workflow` scope)
    types.ts                 CoverageConfig / WorkflowTriggers / InstalledRepo / GatePrResult
```

The gate's own source lives in its repo:
<https://github.com/NonnaritRammaneekultawat-6609650459/test-github-marketplace>. The console never bundles or
runs it — it only writes the workflow that calls it.
