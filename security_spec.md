# Security Specification: Próspera Bitcoin Launcher

## Data Invariants
1. **Residents**:
   - `id`: Must match the document ID. String, size <= 128.
   - `name`: String, size 2-100.
   - `email`: String, valid email format, size <= 100.
   - `status`: One of ['pending', 'processing', 'active', 'rejected'].
   - `ownerId`: Must match `request.auth.uid`.
   - `createdAt`: Server timestamp.

2. **Corporate Entities (LLCs)**:
   - `id`: Must match document ID.
   - `companyName`: String, size 2-100.
   - `email`: String, valid email format.
   - `framework`: One of ['Common-Law', 'Fintech-Reg-A', 'Financial-Reg-A'].
   - `status`: Enum.
   - `ownerId`: Must match `request.auth.uid`.
   - `createdAt`: Server timestamp.

## The Dirty Dozen (Logic Leaks to Block)
1. **Self-Activation**: User creates a doc with `status: 'active'`. (Blocked by `isValidEntity` check on status during create).
2. **Identity Theft**: User creates doc with `ownerId` of another user. (Blocked by `incoming().ownerId == request.auth.uid`).
3. **Data Scraping**: User tries to list all residents. (Blocked by `resource.data.ownerId == request.auth.uid` in list rule).
4. **Shadow Update**: User tries to add `isVerified: true` field. (Blocked by `affectedKeys().hasOnly()`).
5. **ID Poisoning**: User uses a 1MB string as a document ID. (Blocked by `isValidId(id)`).
6. **Email Hijack**: User updates their email to someone else's after creation. (Blocked by immutability on `email` or strict update rules).
7. **State Skipping**: User updates status from `pending` to `active`. (Blocked by update rules allowing only Admin or specific state transitions).
8. **Resource Exhaustion**: User sends a 1MB string for `purpose`. (Blocked by `.size()` checks).
9. **Orphaned Writes**: User creates LLC without valid residency (for future logic).
10. **Admin Elevation**: User tries to write to an `/admins/` collection. (Blocked by default deny).
11. **Timestamp Spoofing**: User provides a past `createdAt` timestamp. (Blocked by `== request.time`).
12. **PII Leak**: Unauthenticated user reads a resident's email. (Blocked by `isSignedIn()` and `ownerId` check).

## Tests
See `firestore.rules.test.ts` (conceptual) for coverage of these cases.
