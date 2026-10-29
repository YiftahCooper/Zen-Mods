# Better Zen Folders development

Start here to continue development from this repository. The installable mod is
[`../../better-zen-folders`](../../better-zen-folders/). Its JavaScript, CSS,
preferences and manifest are the single current source; this directory does not
carry a second editable runtime. Sine users should install the mod folder, not
this development directory or the whole repository.

## Where to look

- [Current status and open issues](CURRENT-STATUS.md): what shipped, what was
  tested, and what still needs investigation or user acceptance.
- [Architecture and decisions](ARCHITECTURE.md): managers, persisted state,
  behavior contracts and boundaries with Zen Icons and Better Pins.
- [Technical reference](reference-guide.md): complete setting descriptions,
  restoration rules and historical design detail. Read the current-status file
  first; older paragraphs are historical, not current release or installation facts.
- [Verification history](verification-history.md): dated investigations and proof
  limits. Local evidence paths in historical entries are descriptive provenance;
  raw browser profiles, personal recordings and raw diagnostics are not distributed.
- [Testing](TESTING.md): portable source/rendering checks and disposable native
  probes. No test requires the original developer's home directory or browser data.
- [Third-party inputs](THIRD-PARTY.md): native, Sine and icon fixtures with notices.

The recovery baseline is version **0.3.26**, published in commit
`56789780f376021d276634967961252954f5eee6`. [Runtime identity](runtime-identity.json)
records its package hashes. This documentation/test publication changes no runtime
or saved preference, and is not a new alpha acceptance claim.

## Working on it

Use Node.js 24 or later. From this directory, `npm install --ignore-scripts`
installs the pinned development dependencies. `npx playwright install chromium`
installs the isolated rendering engine; it does not install or control Zen.
Then run `npm test`. Python package checks run with `npm run test:python`.

The runner assembles a fresh `.backup-scratch/test-project-*` solely from the
checked-in tests, fixture inputs and current runtime. Rendering output and
synthetic staging profiles remain inside that scratch project. It never borrows
an existing user profile. Without Playwright, rendering checks explicitly skip;
that reduced run is not equivalent to full verification. See [Testing](TESTING.md)
for dependencies, platform limits and native tests.

Keep future reproducible output under `.backup-scratch/`. After useful results
have been summarised and unique inputs preserved, remove inactive disposable
profiles and caches. Keep source, tests, fixtures, technical decisions and selected
release identities. Never commit an entire browser profile, credentials, browsing
history, raw recordings, screenshots of a personal sidebar or private diagnostics.

Before publishing a fix, reproduce it, add a causal regression, verify the affected
native boundary when needed, update relevant tests/docs, and publish only the mod
being changed. A passing DOM surrogate is not proof of Gecko/XUL behavior; a native
disposable-profile check is not proof of everyday-profile acceptance. Preserve that
distinction in future reports.
