# Próspera Bitcoin Launcher: Features Awaiting Legal Sign-off

This document outlines the features currently stubbed out in the v1.0 release, pending legal review and API endpoint availability.

## Statute 6b: Automatic Approval
- **Status:** EXCLUDED / STUBBED
- **Description:** Enables programmatic approval of corporate entities based on zero-knowledge verification or pre-cleared templates.
- **Current Requirement:** Manual approval by Próspera Registrar via `/api/admin/approve/llc/:id` (staging) or webhook.

## Statute 7: Tax API
- **Status:** EXCLUDED / STUBBED
- **Description:** Query, file, and pay taxes directly via the Bitcoin/Lightning interface.
- **Functionality:** `GET /api/tax/periods`, `POST /api/tax/file`.
- **Note:** Tax periods and calculations are not yet exposed for third-party Bitcoin-native applications.

## Statute 8: Corporate Event Notifications (Full)
- **Status:** PARTIAL
- **Description:** Comprehensive real-time notifications for corporate events (governance changes, audits).
- **v1.0 Support:** Only `residency.approved` and `llc.approved` are implemented as a proof-of-concept.

## Statute 9: Company Dissolution
- **Status:** EXCLUDED / STUBBED
- **Description:** Graceful winding down of corporate entities via API.
- **REST Endpoint:** `DELETE /api/entities/:id`.

## Future Entities (Corporations, Foundations)
- **Status:** PLANNED
- **Description:** v1.0 exclusively supports LLC formation under the Common Law framework. Other entity types will require distinct articles of association.
