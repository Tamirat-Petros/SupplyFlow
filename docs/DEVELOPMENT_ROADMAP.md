# SupplyChain Pro Development Roadmap

## Delivery approach

Build in small, reviewable milestones on a dedicated development branch, committing each coherent milestone. This repository currently contains no application files or commits. The planning branch is `codex/planning-architecture`; do not push without explicit approval. After approval to implement, create or continue on an implementation branch following the repository's eventual branch policy. Keep secrets, real customer data, generated build outputs, and local environment files out of Git.

## Phases, deliverables, dependencies

### Phase 0 — Decisions and project foundation

**Deliverables:** confirm business assumptions; choose supported Node/TypeScript/PostgreSQL versions; repository conventions; frontend/backend workspace; lint/format/type-check; environment examples; local PostgreSQL development setup; CI for static checks; migration/seed workflow.

**Depends on:** agreement on currency precision, quantity/unit model, auth session approach, and initial inventory tracking needs.

### Phase 1 — API and database foundation

**Deliverables:** Express app structure, configuration validation, request IDs, health endpoint, centralized errors, OpenAPI scaffold, Prisma/PostgreSQL connection, first migration, seed roles/permissions, structured logs.

**Exit criteria:** clean local setup from documented steps; migration and seed are repeatable; no secrets committed.

### Phase 2 — Authentication, RBAC, and audit foundation

**Deliverables:** employee login/session lifecycle, password hashing/reset approach, role/permission management, warehouse scope, backend authorization middleware/service checks, audit events for account and permission changes.

**Depends on:** Phase 1. **Exit criteria:** denied users cannot perform restricted API calls; deactivation/revocation works.

### Phase 3 — Master data

**Deliverables:** categories, products, warehouses, suppliers, customers; list/search/filter/pagination; activation/deactivation; validation and audit.

**Depends on:** Phases 1–2. **Exit criteria:** product edits never alter stock; referential history is retained.

### Phase 4 — Inventory core

**Deliverables:** per-warehouse balances, movement ledger, reservation records, adjustment workflow, stock views, idempotency, concurrency controls, reconciliation report.

**Depends on:** Phase 3 and confirmed unit/lot policy. **Exit criteria:** transaction-level integrity and concurrency scenarios are covered by automated tests.

### Phase 5 — Procurement and receiving

**Deliverables:** PO lifecycle and approvals, partial receipts, accepted/rejected quantities, inventory posting, supplier references, open PO reporting.

**Depends on:** Phases 3–4. **Exit criteria:** failed receipt is atomic; repeated request does not double-receive; over-receipt policy is enforced.

### Phase 6 — Sales, reservation, and fulfillment

**Deliverables:** sales orders and price snapshots, confirmation/reservation, partial shipments, dispatch, delivery status/proof, cancellation and reservation release.

**Depends on:** Phases 3–4 and reservation/backorder decisions. **Exit criteria:** concurrent orders cannot oversell; partial fulfillment reconciles line quantities and stock.

### Phase 7 — Returns and payments

**Deliverables:** customer return/inspection/disposition, receipt and allocation of payments, partial payments, unapplied credit, reversals, customer balance summaries.

**Depends on:** Phase 6 and tax/accounting boundary decisions. **Exit criteria:** return disposition controls saleable stock; payment reversal preserves history.

### Phase 8 — Frontend workflows and dashboards

**Deliverables:** accessible responsive shell, auth/role-aware navigation, reusable forms/tables, procurement/inventory/sales/fulfillment/payment screens, Recharts dashboards and CSV export.

Frontend can start after API contracts stabilize and can progress in parallel with API phases using agreed OpenAPI mocks. **Exit criteria:** workflows show actionable validation/permission/error states and reports reconcile to API data.

### Phase 9 — Hardening and pilot

**Deliverables:** security review, migration/restore rehearsal, backup policy, load and concurrency checks, monitoring, operational runbooks, pilot data import, user training, staging sign-off.

**Depends on:** core workflows complete. **Exit criteria:** agreed RPO/RTO and performance targets met; unresolved critical defects closed.

### Phase 10 — AI advisory features (after stable operational data)

**Deliverables in sequence:** reporting data mart/clean historical series; baseline statistical demand forecast; replenishment recommendations; anomaly flags; authorized question-answer assistant grounded in deterministic reports.

**Depends on:** sufficient clean sales/stock history, permission-aware reporting, user feedback, and data quality monitoring. AI recommendations remain advisory and require human approval for business actions.

## Testing strategy

- **Unit:** state transitions, permission predicates, quantity calculations, payment allocation, reorder calculations, input schema rules.
- **Integration:** PostgreSQL transaction behavior, Prisma constraints, idempotency, audit writes, rollback and concurrency scenarios.
- **API contract:** OpenAPI examples and endpoint authorization/error/validation checks.
- **End-to-end:** critical employee workflows from PO through receipt to stock; order through reserve, partial dispatch, delivery, payment, and return.
- **Security:** authentication abuse/rate limits, privilege escalation, warehouse scope leaks, injection/XSS/CSRF posture, secret scanning, dependency review.
- **Reconciliation:** stock balance against movement ledger; reservations against active allocations; payment allocations against posted payment and order balance.
- Use seeded synthetic data in tests; never production customer data. Prioritize coverage of business invariants over a vanity coverage percentage.

## Security and release checklist

- Validate configuration at startup and fail safely when required secrets are missing.
- Use least-privilege database credentials and TLS in deployed environments.
- Review role permissions and warehouse data scoping for each endpoint.
- Apply migrations in staging before production; backup and verify restore path.
- Check dependency advisories and scan committed files for secrets before release.
- Confirm CORS, cookie/token, CSRF, rate limit, logging redaction, and error response settings.
- Confirm migration rollback/forward-fix plan, monitoring, alert contact, and operational runbook.

## Low-cost deployment recommendation

For a prototype/pilot, deploy the React build to a free static hosting tier, Express API to a free or low-cost app host, and PostgreSQL to a managed free/low-cost tier if its sleep, storage, retention, region, and backup limits are acceptable. Alternative: a single low-cost VPS with Docker Compose can reduce platform costs but requires the team to own security patches, TLS, monitoring, and backups. Keep the AI service off until needed; local or scheduled batch forecasting avoids always-on compute. Re-check current provider pricing, data residency, free-tier limits, and backup guarantees when selecting vendors because these change. Do not put production business data on a tier without adequate access controls and recoverability.

## Git workflow

- Keep work on a named feature/planning branch, never directly on `main`.
- Commit only completed, coherent milestones with descriptive messages (for example, `docs: define inventory ledger and reservation model`).
- Review `git status` and diffs before each commit; exclude secrets and generated files.
- Do not push until the user explicitly approves. Before any approved push, verify branch, diff, commit list, remote, and secret scan.
- Do not create empty or artificial commits; actual planning documents are a legitimate single documentation milestone.

## Approval and decision list

Before application implementation, confirm:

1. Whether this initial system is single-company, single-currency ETB, and employee-only.
2. Product unit rules, fractional quantity support, barcode needs, and lot/expiry/serial tracking.
3. Reservation timing, expiration, backorder, partial shipment, and cancellation policy.
4. Transfer process and treatment of in-transit, damaged, quarantined, and returned stock.
5. Tax/VAT, discounts, invoice legality/numbering, credit limits, and accounting boundary.
6. Authentication/session model, MFA requirement, role/warehouse scoping, and account onboarding.
7. UI language(s), timezone, calendar/date display expectations, and accessibility target.
8. Expected users, transactions, data retention, hosting region, backup RPO/RTO, and any data residency constraints.

After reviewing these planning documents, the user should approve the plan and clarify decisions before implementation begins. No application features or PDF are part of this planning milestone.
