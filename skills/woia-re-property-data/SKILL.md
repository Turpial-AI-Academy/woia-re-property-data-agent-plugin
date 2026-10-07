---
name: woia-re-property-data
description: Record and version scoped Real Estate Property, Mandate and Listing facts. Use for inventory intake, unit containment, represented authority and approved offering versions.
---

# Property data

Read [the contract](references/contract.md) before a mutation. Use [the deterministic reducer](scripts/property-data.mjs) with a trusted host-resolved actor, current scoped grant, Source Authority Map, exact source/evidence and expected revision. Never supply an agent-authored acceptance boolean as authority.

Property, ownership/right claims, Mandate and Listing remain separate. This provider has no right-acceptance or contact/payment action. Data governs identity/source integrity; competent owners accept rights and represented powers. Resolve shared Subject references with Identity; never create identities here.

Use property.search/read with explicit authorized fields. Create/update preserve sourced history. Unit link requires both scoped properties and acyclic containment. Mandate create/version preserve effective dated participants/powers; activate requires competent version-bound acceptance, revoke does not erase history. Listing create/version require exact current effective Mandate, property scope and competent approved version. Withdrawal/reactivation append lifecycle transitions. Any changed source/version invalidates dependent approvals.

The reducer evaluates immutable inputs and returns a new state/result; it does not authenticate clients or persist business state. A qualified storage adapter must atomically enforce organization isolation, subject/property foreign keys, revision CAS, operation-key uniqueness and durable result before runtime use. No adapter is qualified by this plugin.

Unknown/conflicted/stale source blocks consequential work; no freshest-source or model-confidence fallback. Listing state does not prove availability, remote distribution or ownership. Route external-person communication through Communications/Customer Service. Local tests do not establish Operator E2E or Production Ready.
