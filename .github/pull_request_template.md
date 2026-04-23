## Clinic(s) changed

<!-- e.g. demo-clinic, acme-dental -->

## Change type

- [ ] Prompt tweak (wording / behavior nudge)
- [ ] Tool manifest (name, schema, enablement)
- [ ] Adapter config (provider IDs, field maps, feature flags)
- [ ] Integration declaration (new adapter, mode change)
- [ ] New clinic onboarding
- [ ] Canary bundle (paired with active)

## Canary

- [ ] Not a canary
- [ ] Canary — set percentage:  `<5 | 25 | 50 | 100>`

## Verification

- [ ] CI schema validation green
- [ ] Prompt lint green
- [ ] Compile size under 300 KB
- [ ] Reviewed prompt diff in PR comment

## Rollback plan

<!-- brief — usually "git revert" unless canary, in which case set canaryPct: 0 -->
