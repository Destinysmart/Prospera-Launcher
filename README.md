# Próspera Bitcoin Launcher v1.0

A PWA for e-Residency and LLC formation in Próspera ZEDE, using Bitcoin Lightning (Blink API).

## Getting Started

1. **Dashboard:** View your current status for residency and LLC.
2. **e-Residency:** Fill out the form and pay the 100K SAT fee via Lightning.
3. **LLC Formation:** Register a new entity and pay the 150K SAT fee.
4. **Webhooks:** Register your agent to receive callbacks when entities are approved.

## Testing in Staging

Since Blink and Próspera production access is restricted, use these staging triggers:

### Simulate Payment
Once an invoice is generated and the app is "Awaiting Settlement":
1. Open your browser console or use a tool to call:
   `POST /api/admin/pay/:invoiceId`
   (The `invoiceId` is visible in the network tab or logs).

### Simulate Próspera Approval
Once an application is in "ZEDE REVIEW":
1. Call:
   `POST /api/admin/approve/llc/:id`
   (The `id` is the Resident ID or Entity ID).

## Legal Statute Support

See `LEGAL_STATUTES.md` for a detailed breakdown of features awaiting final legal sign-off (Statutes 6b, 7, 8, and 9).
