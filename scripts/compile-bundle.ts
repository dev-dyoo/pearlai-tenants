// compile-bundle.ts — Stub. Full implementation under product issue #33 (W3-5).
// Per w3-tenants-repo-ci.md: read clinics/<id>/{bundle.yaml,prompt.md,tool-manifest.json,config.json,integrations.json}
// and produce the DDB row shape:
//
//   {
//     pk: clinicId,
//     bundleSha: <sha256 of concatenated sorted file bytes>,
//     prompt: string,
//     toolManifest: ToolManifest,
//     config: ClinicConfig,
//     integrations: IntegrationsDeclaration,
//     canaryBundleSha?, canaryPct?, canaryToolManifest?, canaryConfig?,
//     updatedAt, lastPublishedBy
//   }
//
// Enforce item size: warn at 300 KB, fail at 400 KB.

console.error("compile-bundle.ts — not yet implemented. See pearlai-product/platform/w3-tenants-repo-ci.md (W3-5).");
process.exit(2);
