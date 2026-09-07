# Vendored: Automated Quality Gate

This is the **Automated Quality Gate** GitHub Action, vendored into this repo so
the console can commit it directly into every repository it installs onto — no
published action reference required.

## What gets committed into a user's repo

On install the console writes exactly two files, into `.quality-gate/` on the
default branch:

| File | sha256 |
| --- | --- |
| `action.yml` | `878c8a3af00288af0ee6a7a89c2324cf9bc4708940d83636d1c14160d61ecc92` |
| `dist/index.js` | `59fe96fcaa8ffb6e4a0e414edebf009e8fe599da6d585ab5455ee214e0127525` |

`dist/index.js` is the `ncc` bundle of `generate-tests.js` — the full gate logic
plus every dependency inlined, with no external `require`s (Node built-ins only).
`action.yml` declares `runs: { using: node20, main: dist/index.js }`. The
generated workflow calls it with `uses: ./.quality-gate`.

The console does **not** commit anything else from the original project — the
sample `src/`, the project's own `.github/workflows/`, `package.json`, etc. would
collide with the user's repo.

## Provenance

Copied verbatim from `AutomatedQualityGate.zip` (`Automated-Quality-Gate/`),
the canonical build supplied for this project. The readable sources the bundle
was built from are kept under `source/` for auditing:

- `source/generate-tests.js` — the entry point
- `source/prompt-template.js` — the Gemini prompt
- `source/package.json` — its `build` script is `ncc build generate-tests.js -o dist`

## Updating

Drop a rebuilt `action.yml` + `dist/index.js` in here, update the hashes above,
and redeploy. Installed repos pick up the new bundle via the detail page's
**Save changes** (or the drift-repair banner).
