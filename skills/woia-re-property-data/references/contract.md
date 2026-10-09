# Source contract and enforcement

Permanent semantic source: Turpial-AI-Academy/woia-re-domain-contracts-agent-plugin@v0.5.7, commit fb1c8a3f7fb116f2a00daf05ae335fdfbc7c3f3f / tree f3ff5a68a0d5df2e615a650eddc313c9585b7f08. Its domain-source-contract and authority-contract resources define Property/Mandate/Listing, source authority and effect guards. This is a semantic reference, not a hard package dependency. Canonical logical relations stay in that permanent owner; this provider implements operation guards without copying its 85-relation catalog or inventing a DBMS.

## Operations

- property.search
- property.read
- property.create
- property.update
- property.unit.link
- mandate.create
- mandate.version
- mandate.activate
- mandate.revoke
- listing.create
- listing.version
- listing.withdraw
- listing.reactivate

The host supplies actor/org/purpose, exact action/target/field grant, current policy revision, revocation and time interval. Source map must be organization-scoped/current with exact family+target writer woia-re-property-data, accepted source reference, observation freshness and no conflict. Evidence references preserve original source. Acceptance binds competent principal/authority, org, target/version, payload digest, source-map version and effective interval. These trusted resources are not client-owned authentication proofs.

## Facts

Property key org+property. PropertyContainment retains parent/child/effective time; no physical containment implies legal right. Mandate and Listing keys org+id; immutable versions key org+id+version. Property scope rows preserve property+scope_role. MandateAuthorityScope retains represented Subject+Property+power+scope together, never pairwise inferred. Participants reference resolved Identity Subjects. Right claims remain attributed evidence accepted by competent owner, not automatically created by inventory.

## Persistence seam

Pure reducer state includes monotonic aggregate revision and operation results. Trusted storage must lock/CAS revision and enforce operation key uniqueness atomically, including returned result, source/evidence links and version history. Repeated exact operation returns original result; changed payload on same key fails. Subject FK and cross-org links need qualified Identity resolution/storage enforcement. Access/revocation/source freshness are rechecked even on replay. No physical backend is selected or claimed qualified.

## Support

Deterministic local contract: implemented. Storage/Identity integration: NOT_QUALIFIED. External effects: unsupported. No MCP adapter, financial effect, external dispatch, imported rights acceptance or authority service is added.
