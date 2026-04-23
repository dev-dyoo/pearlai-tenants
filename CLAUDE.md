# CLAUDE.md — pearlai-tenants

Per-clinic bundles. Source of truth in git; runtime artifact in DynamoDB `pearlai-tenants`.

## Documentation

Feature/product docs, design specs, plans → `~/repos/pearlai-product/platform/`
- `integration-platform-strategy.md` — North Star
- `w3-tenants-repo-ci.md` — this repo's blueprint (schema, lint, publish pipeline)

Feature tasks → GitHub issues on `dev-dyoo/pearlai-product`. This repo tracked under product issue #33.

Only repo-intrinsic docs stay here: `README.md`, `CLAUDE.md`, per-script READMEs.

## Editing a bundle

1. Branch from `main`.
2. Edit under `clinics/<clinicId>/`.
3. Respect invariants:
   - `tool-manifest.json` tool names must appear in `prompt.md`
   - Every `config.json` key validates against the referenced adapter's schema
   - `bundle.yaml.activeIntegrations` must be a superset of all `adapterRef` vendors used in the manifest
4. PR → CI validates → merge → auto-publish.

## Invariants (CI-enforced at launch gate)

1. **Bundle is atomic.** Prompt + manifest + config + integrations change together. One PR, one version.
2. **Prompt and manifest stay in sync.** Lint rule PL001–PL009 catches drift. Never bypass.
3. **No secrets.** Secret values live in SSM; configs reference by ARN or logical name only.
4. **Bundle size ≤ 400 KB** (DynamoDB item limit). `compile-bundle.ts` warns at 300 KB, errs at 400.
5. **Canary mutations stay on the same row.** No separate "canary clinic"; always paired.

## Git conventions

- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:` (bundles are docs-shaped).
- Default branch: `main`.
- Pre-launch: direct push allowed. Launch gate flips branch protection on.

## Running locally

```
npm install
npm run validate              # validate all clinics
npm run validate -- <id>      # validate one clinic
npm run compile -- <id>       # compile to DDB row shape; prints JSON
npm run lint:prompt -- <id>   # prompt ↔ manifest lint
```
