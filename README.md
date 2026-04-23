# pearlai-tenants

Per-clinic bundles for Pearl AI. Source of truth for every clinic's prompt, tool manifest, adapter config, and integration declarations.

Bundles live here as human-editable files. On merge to `main`, CI compiles each changed clinic into a single row in DynamoDB `pearlai-tenants`, the runtime artifact read by `pearl-app-server` and `vox-ava`.

## Bundle structure

```
clinics/<clinicId>/
├── bundle.yaml              # meta: version, activeIntegrations, feature flags
├── prompt.md                # agent prompt (markdown; LLM-consumed)
├── tool-manifest.json       # tool defs (name, schemas, adapterRef, version)
├── config.json              # per-adapter clinic config (provider IDs, type maps)
└── integrations.json        # declared mode per (integration, event)
```

## Runtime model

No S3 storage, no tarball. CI writes a single DynamoDB row per clinic; consumers scan at boot and hot-reload via DynamoDB Stream → SNS → SQS fanout. See `pearlai-product/platform/w3-tenants-repo-ci.md`.

## Editing workflow

1. Clone this repo + create a branch.
2. Edit files under `clinics/<your-clinic>/`.
3. Push + open PR.
4. CI runs: schema validation (`validate-bundle`), prompt lint (`lint-prompt`), compile dry-run.
5. Merge → CI publishes the compiled row to DynamoDB → SNS fanout → consumers hot-reload.

## Canary

To canary a bundle change:

- Add `canary-pct-<N>` label to the PR (default 5%).
- After merge, both active and canary versions live on the same DDB row.
- Ramp by bumping `canaryPct` (portal or `aws dynamodb update-item`).
- Promote by running `scripts/publish-bundle.ts --promote-canary <clinicId>`.

## Rollback

- **Fast:** set `canaryPct: 0` (runtime state, not content).
- **Hard:** `git revert` the offending commit; CI republishes prior content.
- **Emergency pin:** `scripts/publish-bundle.ts --pin <clinicId> <sha>` (out-of-band, audited).

## Dev posture

Pre-launch: commit-push-merge. CODEOWNERS drafted but branch protection off. Lint warnings non-blocking for most rules. Flips at launch gate (product issue #44).

## Design reference

- `pearlai-product/platform/w3-tenants-repo-ci.md` — this repo's authority
- `pearlai-product/platform/integration-platform-strategy.md` — North Star
