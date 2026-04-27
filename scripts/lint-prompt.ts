// lint-prompt.ts — Stub. Full implementation under product issue #33 (W3-4).
// Per w3-tenants-repo-ci.md §Prompt lint rules PL001–PL009:
// PL001 — every tool named in prompt must exist in tool-manifest with matching required args
// PL002 — required args in prompt match manifest inputSchema.required
// PL003 — no orphan tool references (prompt mentions tool not in manifest)
// PL004 — no undocumented tools (manifest has tool not mentioned in prompt)
// PL005 — placeholder vars ({{endPhrase}}, {{clinicName}}) resolvable at runtime
// PL006 — prompt size within max tokens budget (~8k)
// PL007 — safety/refusal phrasing present
// PL008 — compliance guardrails (no PHI in examples)
// PL009 — canary prompt diff bounded (≤ 30% delta from active)

console.warn("lint-prompt.ts — not yet implemented (skipped). See pearlai-product/platform/w3-tenants-repo-ci.md (W3-4).");
process.exit(0);
