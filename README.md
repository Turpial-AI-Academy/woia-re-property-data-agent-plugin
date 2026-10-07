# woia-re-property-data

Version 0.5.0 thin shared provider for Property inventory, acyclic unit relations, Mandate versions/authority and approved Listing versions. These facts remain separate from rights claims and remote publications.

Portable entry: [Skill](skills/woia-re-property-data/SKILL.md). [Operation contract](skills/woia-re-property-data/references/contract.md). Pure helper implements scoped source-authority, immutable versions, current acceptance, revision and duplicate-operation checks. No storage/backend/MCP adapter is qualified; no external contact or financial effects.

## Local authoring

Use mise run bootstrap and mise run doctor. Run mise run ci:fast for manifest/payload/schema and maintenance/domain tests. Commit a clean candidate; from Ecosystem v0.5.4 run mise run plugin:certify-thin --repo <absolute-provider-path>. Central thin certification is the candidate gate. Full-profile release:check and container jobs are dormant template tools, not substitutes for thin certification; this implementation does not change maintenance portability. Publication/admission remain separate human gates.
