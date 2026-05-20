# Security Specification: Próspera Bitcoin Launcher

## Data Invariants
1. **Residents**:
   - `id`: Must match the document ID. String, size <= 64.
   - `status`: One of ['pending', 'processing', 'active', 'rejected', 'loading'].
   - `prosperaData`: Freeform properties object from Próspera API.
   - `updatedAt`: Required field.
   - `ownerId`: Must match `request.auth.uid`.

2. **Corporate Entities (LLCs)**:
   - `id`: Must match document ID. String, size <= 64.
   - `companyName`: String, size 2-100.
   - `email`: Required field.
   - `purpose`: Required field.
   - `framework`: String.
   - `status`: One of ['pending', 'pending_signature', 'pending_payment', 'processing', 'active', 'rejected'].
   - `amount`: Number.
   - `updatedAt`: Required field.
   - `ownerId`: Must match `request.auth.uid`.

## Logic Defenses
1. **Self-Activation**: User creates a doc with `status: 'active'`. (Blocked by `isValidEntity()` combined with the create rule `incoming().status == 'pending'`).
2. **Identity Theft**: User creates doc with `ownerId` of another user. (Blocked by `incoming().ownerId == request.auth.uid`).
3. **Data Scraping**: User tries to list all residents. (Blocked by `resource.data.ownerId == request.auth.uid` in list rule).
4. **State Skipping**: User updates status from `pending` to `active`. (Blocked by update rule `incoming().status == existing().status` ensuring that client updates do not mutate the application state -- only Admin and Webhook backends can transition state).
5. **ID Poisoning**: User uses a 1MB string as a document ID. (Blocked by `isValidId(id)`).
6. **Resource Exhaustion**: User sends an oversized string for fields like `companyName`. (Blocked by `.size() <= 100` checks).
7. **Admin Elevation**: User tries to write to an `/admins/` collection. (Blocked by default deny).
8. **PII Leak**: Unauthenticated user reads a resident's email. (Blocked by `isSignedIn()` and `ownerId` check).

## Tests
See `firestore.rules.test.ts` (conceptual) for coverage of these cases.
