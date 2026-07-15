# Autopilot Policies

## Trust levels

Stored per `(landlordId, domain)` as an org-level default (`AgentPolicyDefault`)
and optionally per `(landlordId, propertyId, domain)` as a property override
(`AgentPolicyOverride`) that wins when present. Resolution order, implemented in
`backend/src/services/policyEngine.js#getEffectivePolicy`:

1. Property override, if one exists for that domain.
2. Org-level default, if one exists.
3. Hardcoded fallback (`backend/src/config/policyDefaults.js`).

| Trust level | Meaning | Can auto-act without approval? |
|---|---|---|
| `OBSERVE` | Monitors, never sends messages or acts | No |
| `DRAFT` | Prepares drafts; every action needs approval | No |
| `EXECUTE_WITH_APPROVAL` | One approval authorizes the full workflow | No |
| `OPERATE_WITHIN_POLICY` | Auto-acts within configured limits | Yes |
| `EMERGENCY_ESCALATION` | Immediate escalation on danger | Yes (for emergency handling) |

`policyEngine.canActWithoutApproval(trustLevel)` is the single gate every
workflow checks before auto-acting — `OPERATE_WITHIN_POLICY` and
`EMERGENCY_ESCALATION` return `true`, the other three return `false`.

## Domains

- `MAINTENANCE` — settings include `maxAutoSpend`, `maxVendorRetries`,
  `followUpIntervalHours`, `requireTenantEntryPermission`, `allowAutoScheduling`.
- `RENT` — reminder offsets, grace period, partial-payment handling (designed
  for Phase 3, not yet wired to a workflow).
- `LEASE` — renewal window, rent-change approval requirement (designed for
  Phase 3).
- `COMMUNICATION` — SMS/email/portal toggles, quiet hours, tone (settings exist
  in the fallback config; only the maintenance-triage auto-reply gate currently
  reads `COMMUNICATION` trust level).

## Backward compatibility

The legacy `AgentConfig` booleans (`autoRentReminders`, `autoMaintenance`,
`autoMessages`, `autoLeaseRenewal`) still exist and still gate as a global
kill switch alongside the new trust-level checks. `backend/scripts/
backfillPolicyDefaults.js` converted every existing landlord's booleans into
equivalent `AgentPolicyDefault` rows the first time this pass ran (`true` →
`OPERATE_WITHIN_POLICY`, `false` → `OBSERVE`), so no existing landlord saw a
behavior change. The script is idempotent (upsert, never overwrites a value a
landlord already configured explicitly) — safe to re-run.

## Hard safety rules (never policy-configurable)

Enforced in code, not settings, so a landlord's policy choices can never weaken
them:

- Legal/eviction notices are never auto-sent (planned for the Phase 3 rent/lease
  workflows — the gate lives in the workflow module itself, not a policy flag).
- Rent increases are never auto-applied.
- Vendors are never auto-paid — invoice approval always requires an explicit
  landlord action (`backend/src/controllers/invoiceController.js#approve`),
  regardless of trust level.

## Configuring policies

Landlord-facing UI: `AgentPage.jsx` → **Policies** tab. `TrustLevelSelector`
sets the org-wide default per domain; `PolicyOverrideTable` sets/clears a
per-property override. Backend: `GET/PUT /api/policies` (org-level),
`GET/PUT/DELETE /api/policies/properties/:propertyId/:domain` (property-level),
all `authenticate + requireLandlord`, validated with zod
(`backend/src/controllers/policyController.js`).
