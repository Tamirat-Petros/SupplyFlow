# SupplyChain Pro Requirements

## Purpose and scope

SupplyChain Pro is a web application for an Ethiopian product distributor. It manages supplier purchasing, warehouse inventory, retailer sales, collections, fulfillment, reporting, users, and audit history. Currency defaults to Ethiopian Birr (ETB). The initial release is a modular monolith, with a separately deployable AI service deferred until the transactional core is reliable.

### Goals

- Give authorized staff a consistent view of procurement, stock, orders, delivery, and cash collection across warehouses.
- Preserve a traceable record for every consequential stock and financial operation.
- Prevent overselling and inconsistent cross-warehouse operations.
- Provide practical operational and management reports, with data access scoped to user permissions.
- Leave clean interfaces for future forecasting and assistant capabilities.

### Out of scope for the initial release

- Microservices, event streaming infrastructure, and Kubernetes.
- Automated purchasing or pricing decisions made by AI.
- Full accounting/general ledger, payroll, tax filing, or regulatory e-invoicing unless later confirmed.
- Offline-first warehouse operation, multi-country localization, and customer self-service portal.
- Payment gateway integrations; record cash/bank/mobile-money receipts manually initially.

## Functional requirements

### Identity and administration

- Sign in/out, change password, and manage employee accounts; administrative password reset must require a secure flow.
- Assign named roles and warehouse scope; enforce permissions in backend services, not only in the UI.
- Support active/inactive accounts and revoke outstanding sessions after password reset or deactivation.
- Record actor, time, operation, target, and relevant before/after values for privileged or business-critical changes.

### Master data

- Create and maintain products, SKU, unit of measure, category, description, active state, reorder settings, and optional barcode.
- Maintain suppliers, retailer/customer accounts, contacts, delivery addresses, and payment terms.
- Maintain warehouses and warehouse-specific operational settings.
- Product identity and descriptive edits must not change on-hand or reserved quantity.
- Use soft deactivation where historical transactions refer to a record; do not cascade-delete business history.

### Procurement

- Create purchase orders (POs) for a supplier with line quantities, agreed unit cost, expected date, and receiving warehouse.
- Track draft, submitted/approved, partially received, received, and cancelled states, including who performed transitions.
- Receive a PO in one or more receipts. Record accepted, rejected/damaged, and optionally pending-inspection quantities per line, plus lot/expiry where required.
- Increase warehouse stock only for accepted quantity, atomically with receipt and stock movement creation.
- Prevent accepted quantity from exceeding outstanding quantity unless an authorized over-receipt exception is recorded.
- Record supplier invoice/reference and payable information without claiming to be a full accounting ledger.

### Inventory

- Track each product independently at each warehouse, including on-hand, reserved, and available quantity.
- Define `available = on_hand - reserved`; never allow either quantity to become negative or reserved to exceed on-hand.
- Record every stock change as an immutable stock movement with source, destination (for transfers), quantity, reason/reference, actor, and timestamp.
- Support receiving, reservation/release, dispatch, transfer, customer return, supplier return, and adjustment movement types.
- Reserve stock for eligible sales orders without reducing physical on-hand. Dispatch reduces on-hand and consumes the corresponding reservation in one transaction.
- Cancelled orders release remaining reservation; partial deliveries consume only the dispatched quantity and leave the undelivered amount reserved or release it according to explicit order policy.
- Transfer stock through a controlled in-transit state or atomic two-sided transfer; never create/destroy quantity. Initial recommendation: use transfer request, dispatch, and receipt states to expose in-transit stock.
- Adjust stock only with a required reason, authorized role, counted quantity, and audit event. Material adjustments may require second-person approval.
- Track lot, serial, and expiration date only if the business requires them; see decisions in Architecture.

### Sales and fulfillment

- Create sales orders for a retailer, price list/currency, delivery address, requested date, warehouse, and product lines.
- Support draft, confirmed, partially fulfilled, fulfilled, cancelled, and closed states with allowed transitions.
- Check availability and reserve stock when an order is confirmed, or when a user explicitly selects allocation; never silently promise unavailable stock.
- Permit partial fulfillment and shipment creation. Dispatch must atomically consume physical stock and reservation.
- Track delivery status and proof-of-delivery reference, delivery date, and exceptions/failed attempts.
- Record customer returns by product, quantity, reason, condition, disposition, and original order where known. Returned goods do not become saleable stock until inspected and accepted.
- Support credit terms and payment status summaries; do not treat an order as paid merely because shipment is delivered.

### Payments

- Record receipts against a customer and optionally one or more orders, with amount, currency, date, method (cash, bank, mobile money, other), external reference, and receiving employee.
- Support partial payments and unapplied customer credit, with an allocation record.
- Record reversals/refunds as linked compensating entries; do not edit or delete posted receipts.
- Use decimal-safe amount representation and explicit rounding rules. A financial ledger and tax calculation are not implied by this feature.

### Reports and analytics

- Provide permission-scoped dashboards for stock, low stock, open POs, order backlog, fulfillment, sales, collections, and returns.
- Filter by date range, warehouse, product/category, supplier, and retailer as appropriate.
- Define reporting timezone and date boundaries consistently; store timestamps in UTC and render using the configured business timezone.
- Reports must display currency, units, filters, and data freshness. Totals must be derived from persisted facts, not generated by an LLM.
- Export to CSV for authorized roles; log exports containing sensitive/customer information where appropriate.

### Usability and accessibility

- Responsive desktop/tablet/mobile layouts for common workflows; desktop-first warehouse/admin tables are acceptable.
- Clear loading, empty, validation, permission, and failure states; preserve entered form data on recoverable errors.
- Keyboard-operable forms, labeled controls, sufficient contrast, and semantic structure.
- Search, pagination, and filters on large lists; never require loading the full catalog into the browser.

## Non-functional requirements

- **Integrity:** PostgreSQL constraints plus transactional service operations protect stock, order, receipt, and payment invariants.
- **Security:** TLS in production; strong password hashing; short-lived access tokens and revocable refresh/session strategy; server-side authorization; input validation; least privilege; secret management.
- **Reliability:** Idempotency for retry-prone receipt, dispatch, transfer, and payment requests. Failed operations leave no partial business state.
- **Performance:** Target p95 under 500 ms for ordinary list/detail reads and under 1.5 s for common transactional writes at expected initial scale; establish load profile before launch. Paginate and index measured query paths.
- **Scale:** Support several warehouses and dozens to low hundreds of concurrent staff without requiring service decomposition. Confirm expected data volumes before production sizing.
- **Maintainability:** TypeScript across frontend/backend; modular domains; documented API; migrations; stable error envelope; structured logs.
- **Auditability:** Business events retain actor and timestamp; logs avoid credentials, tokens, and unnecessary personal data.
- **Backup/recovery:** Automated database backups and a documented restore procedure; agree recovery point/time objectives before go-live.
- **Localization:** ETB display and configurable business timezone; use locale-aware formatting. Confirm Amharic support, calendar conventions, and language requirements before UI copy is frozen.
- **Deployment:** Prefer free/low-cost managed hosting with PostgreSQL, but production data protection and backup requirements take precedence over a free tier.

## Recommended extra business rules

1. Treat posted stock movements and payments as immutable; corrections use linked reversal/compensation entries.
2. Use integer quantities for each product's base unit initially; define unit conversion explicitly before allowing fractional or mixed-unit purchasing.
3. Use optimistic concurrency/version checks or row locks on stock and state transitions to prevent double allocation under concurrent requests.
4. Make retries safe with idempotency keys on externally retried commands.
5. Capture a price/cost snapshot on order/PO lines so later catalog changes do not rewrite historical amounts.
6. Define order reservation expiry/release policy and backorder policy.
7. Keep saleable, damaged, quarantined, and in-transit stock distinct if the company's process needs those states.
8. Restrict direct edits to posted documents; reopen only through a logged, permissioned workflow.
9. Require a reason for cancellation, return, reversal, and adjustment; use approval thresholds for high-value or high-quantity actions.
10. Define tax, discounts, credit limits, and invoice numbering before treating sales documents as statutory invoices.

## Acceptance criteria for core release

- A user without permission cannot access the corresponding API operation even if calling it directly.
- Two concurrent confirmations cannot reserve the same available units.
- Receiving accepted quantities updates stock and movement records together; a failed transaction updates neither.
- Dispatch, transfer, return disposition, adjustment, and cancellation preserve stock invariants and audit trail.
- Partial receipt, partial shipment, partial payment, and reversal have clear remaining balances.
- Reports reconcile with transaction records for a selected date range and warehouse.
- Database can be rebuilt from migrations and seeded with non-production sample data.

## Assumptions to confirm

- Initial users are employees; suppliers/retailers do not log in.
- A single legal business and one operating currency (ETB) are used in the first release.
- Sales prices are maintained manually; tax/accounting is outside initial scope.
- Warehouse and operational reporting uses Africa/Addis_Ababa timezone.
- Product lots/expiry tracking, barcode scanning, offline workflows, and Amharic UI are conditional requirements.
