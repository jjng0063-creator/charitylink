# CharityLink Security Specification

## Data Invariants
1. A **User** profile must correspond to the `auth.uid` and can only be created with a valid role.
2. A **DonationPost** must belong to a valid user and its `state` must match the donor's state for local filtering consistency.
3. A **CharityNeed** can only be created by users with the 'charity' role.
4. Access to **Messages** within a chat is strictly restricted to the participants of that chat.
5. `createdAt` and `ownerId`/`donorId` fields are immutable after creation.

## The Dirty Dozen Payloads (Rejection Targets)
1. **Identity Spoofing**: Attempting to create a user profile with a different UID than `request.auth.uid`.
2. **Role Escalation**: A 'donor' trying to post a 'CharityNeed'.
3. **Privilege Escalation**: Attempting to update a DonationPost's `donorId` to a different user.
4. **State Poisoning**: Injecting an extremely long string (>1MB) into the `description` or `title`.
5. **ID Injection**: Using a malformed ID like `../../secrets` as a document ID.
6. **Shadow Field Injection**: Adding an `isAdmin: true` field to a user profile update.
7. **Cross-User Snooping**: Participant B trying to read a chat between Participant A and Charity C.
8. **Bypassing Query Security**: Querying for all DonationPosts without filtering by status or using a blanket read.
9. **Terminal State Break**: Attempting to update a DonationPost that is already marked as 'donated'.
10. **Timestamp Manipulation**: Sending a client-side timestamp for `createdAt` instead of `request.time`.
11. **Orphaned Writes**: Creating a message in a chat room that doesn't exist.
12. **PII Leak**: An unrelated user successfully getting a user's private email from a profile fetch.

## Verification
- Tests will be implemented in `firestore.rules.test.ts` (conceptual for this environment).
- ESLint will be used to verify rule security and syntax.
