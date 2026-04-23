// publish-bundle.ts — Stub. Full implementation under product issue #33 (W3-6).
// Per w3-tenants-repo-ci.md:
//   - Compiles bundle via compile-bundle.ts
//   - DynamoDB PutItem into pearlai-tenants with conditional history append (keep last 20)
//   - --promote-canary <clinicId>: swap canary* → active fields, clear canary fields
//   - --pin <clinicId> <sha>: reconstruct row for a historical sha, overwrite active
//
// Runs from GitHub Actions publish.yml via OIDC role pearlai-tenants-publisher.

console.error("publish-bundle.ts — not yet implemented. See pearlai-product/platform/w3-tenants-repo-ci.md (W3-6).");
process.exit(2);
