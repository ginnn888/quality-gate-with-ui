# Quality Gate Console

A web UI for the **Automated Quality Gate** GitHub Action. The console never runs
any analysis itself — it is purely the front door:

1. **Sign in with GitHub.**
2. **Install** the gate onto a repository — the console commits a workflow file,
   a `config_cov.json`, and an empty `audit-resolve.json`, and sets the repo
   secrets the action needs. The workflow calls the gate straight from
   [`NonnaritRammaneekultawat-6609650459/test-github-marketplace`](https://github.com/NonnaritRammaneekultawat-6609650459/test-github-marketplace)
   (`uses: …/test-github-marketplace@1.1`) — nothing else is written into the
   repo. Optionally, the console also adds a branch-protection rule requiring the
   gate check before merge.
3. **Tune** the coverage thresholds from the web; saving re-commits
   `config_cov.json` to the repo.
4. From then on **GitHub Actions runs the gate on every pull request** (the
   default trigger). It posts one report comment and sets a pass/fail check. On
   `push` the gate only sets a status — it does not post a report.
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
AUTH_GITHUB_ID=...
AUTH_GITHUB_SECRET=...
AUTH_URL=http://localhost:3000   # optional — Auth.js infers it when it can
AUTH_SECRET=...                  # openssl rand -base64 32
```

(The v4-era names `GITHUB_ID` / `GITHUB_SECRET` / `NEXTAUTH_SECRET` are still
read as a fallback.)

That is the **entire** server configuration. The Gemini key and SonarCloud token
are entered per-repo in the install wizard and stored as encrypted GitHub Actions
secrets on the target repo — they never touch the console's environment.

## Install the gate onto a repository

`/repos` lists every repo the account can reach. **Install** opens a wizard:

- **Coverage thresholds** — a global target plus optional per-file overrides.
  Written to `config_cov.json`, which the action reads (`qgConfig.global`,
  `qgConfig.files[path]`).
- **Triggers** — which branches and events the workflow reacts to. Defaults to
  `pull_request` only (that is the event the gate posts its report on); `push`
  can be added but only produces a pass/fail status. Baked into the `on:` block.
- **Merge protection** (default on) — adds a branch-protection rule on the
  default branch requiring the `Quality Gate` check before merge, via the GitHub
  branch-protection API. Needs admin on the repo; if the token lacks it the
  install still succeeds and returns a note. Toggleable later on the detail page.
- **Repository secrets** — the **Gemini API key** (required) and an optional
  **SonarCloud token**. The console encrypts them with the repo's Actions public
  key (libsodium sealed box, via `tweetnacl-sealedbox-js`) and uploads them as
  `GEMINI_API_KEY` / `SONAR_TOKEN`. The console keeps no copy.
- **SonarCloud organization** (optional) — when given alongside a token, the
  console also commits `sonar-project.properties`
  (`sonar.projectKey=<org>_<repo>`, the SonarCloud GitHub-import convention) so
  the gate can query SonarCloud without the user hand-authoring that file. The
  SonarCloud project must exist first and have **Automatic Analysis off** (it
  clashes with the CI scan) — the wizard links out for both.

Installing makes **one commit** to the default branch with:

| Path | Purpose |
| --- | --- |
| `.github/workflows/quality-gate.yml` | Runs on the configured events (default `pull_request`). |
| `config_cov.json` | `{ "global": 80, "files": { "src/x.js": 50 } }` — the coverage targets. |
| `audit-resolve.json` | `{ "decisions": [] }` — where the repo whitelists `npm audit` advisories the gate would otherwise fail on. Seeded only if absent. |
| `sonar-project.properties` | Only when a SonarCloud org is supplied — points the gate at `<org>_<repo>`. |

That's it — no action code is copied into the repo. The gate runs `npx jest
--coverage` **in the target repo**, so that repo needs `jest` available; the
wizard's preflight flags it when missing.

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
repo secret is set), then the gate itself. The job is named `Quality Gate` — that
is the status-check context a branch-protection rule requires.

```yaml
      - name: Automated Quality Gate
        if: always()
        uses: NonnaritRammaneekultawat-6609650459/test-github-marketplace@1.1
        with:
          gemini_api_key: ${{ secrets.GEMINI_API_KEY }}
          sonar_token: ${{ secrets.SONAR_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

The gate does the AI review + test generation + coverage/audit/Sonar gate, posts
the report comment to the PR (`# 🚀 AI-Powered Quality Gate Report`), and exits
non-zero on a failing gate. A repo with no `package.json` / no changed `src/`
files still runs green (the gate reports "skipped").

The gate writes the AI-generated tests to `Test/` and the coverage report to
`coverage/` on the runner and never commits or uploads them itself — the PR
comment only shows a summary table, never the actual generated test code. The
workflow's last step (`actions/upload-artifact@v4`) uploads both as a
downloadable build artifact on the run page, kept for 14 days, so nothing is
lost when the runner is torn down.

The workflow pins `@1.1` (the action repo's tags are unprefixed — `1.1`, `1.0`,
not `v1.x`) so one bad commit on the action's `main` can't break every install at
once. Set `AQG_ACTION_REF` on the console to `main`, another tag, or a commit SHA
to change it; **Save changes** on the detail page re-commits the workflow so an
updated ref reaches existing installs.

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
cp .env.example .env.local   # fill in AUTH_GITHUB_ID / AUTH_GITHUB_SECRET / AUTH_SECRET
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
      loading.tsx / error.tsx  shared route-level fallbacks for the group
      page.tsx               dashboard: repos with the gate installed (server component)
      repos/page.tsx         server component — fetches the repo list, renders ReposBrowser
      repos/ReposBrowser.tsx   client island: search + visibility filter
      repos/[owner]/[repo]/install/page.tsx   server component — repo context, renders InstallWizard
      repos/[owner]/[repo]/install/InstallWizard.tsx   client island: the install form
      installed/[owner]/[repo]/page.tsx       server component — fetches detail, renders InstallationDetail
      installed/[owner]/[repo]/InstallationDetail.tsx  client island: reconfigure, secrets, uninstall
    api/
      auth/[...nextauth]/    Auth.js route handlers
      github/repos/          search + list the user's repositories (search-as-you-type)
      installations/         POST — commit files, set secrets, optional branch protection
      installations/[owner]/[repo]/              PATCH · DELETE
      installations/[owner]/[repo]/protection/   PUT · DELETE — require / unrequire the gate check
  lib/
    auth.ts                  Auth.js config — GitHub provider, token on the JWT
    github.ts                GitHub REST client (repos, contents R/W, runs, PRs, comments, secrets)
    githubSecrets.ts         sealed-box encryption for repo Actions secrets
    installations.ts         derives every installed view from a repo's own contents
                             (scan, install detail, wizard context)
    installWrite.ts          shared build-files + set-secrets path for POST and PATCH
    workflowTemplate.ts      builds quality-gate.yml (uses: NonnaritRammaneekultawat-6609650459/test-github-marketplace@<ref>)
                             + config_cov.json
    apiErrors.ts             maps GitHub write failures (esp. missing `workflow` scope)
    types.ts                 CoverageConfig / WorkflowTriggers / InstalledRepo / GatePrResult
```

The pages under `(app)/` are React Server Components: they read from GitHub on
the server (via `lib/`) and pass the result to a small `"use client"` island for
the interactive parts. There is no client-side fetch-on-mount for initial data —
mutations still go through the `api/` routes above.

The gate's own source lives in its repo:
<https://github.com/NonnaritRammaneekultawat-6609650459/test-github-marketplace>. The console never bundles or
runs it — it only writes the workflow that calls it.
