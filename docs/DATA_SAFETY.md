# Data safety preparation worksheet

This is an implementation inventory, **not submitted Play Console answers or
legal certification**. Console categories and requirements can change; the owner
must map these facts to the current form and the exact binary being released.
See the [privacy policy](../web/privacy.html).

## Data flows to disclose/review

| Data | Handling | Purpose and choices |
|---|---|---|
| Tasbeeh counts/settings and qaza balances | Local app storage; no Sijda server synchronization; platform backups may apply | App functionality; clearing local data removes local records |
| Camera images and raw pose landmarks | Transient on-device processing; not saved or uploaded | Optional posture estimation; permission and explicit start |
| Low-resolution lighting samples | On-device only; not saved/uploaded | Optional-camera preview warning |
| Feedback count summaries, target, verdict and coarse posture timeline | Local copy; optionally sent to Firestore | App improvement; explicit upload consent; may reveal religious practices |
| Placement, distance, lighting category, device/browser description, notes | Local copy; optionally sent to Firestore | Error investigation; avoid personal details in free text |
| Report/session IDs, timestamps, algorithm version, interruptions/completion | Included in consented upload | Associate and interpret reports |
| Anonymous Firebase UID | Created for upload authorization and stored with report | Authentication/security; not an email/password profile |
| IP/network request information and provider logs | Firebase/hosting providers receive normal request metadata | Service delivery/security; review provider disclosures and retention |

## Form-review prompts

- Do **not** answer "no data collected" merely because camera processing is
  on-device: optional feedback is sent off-device.
- Evaluate feedback revealing religious activity under the applicable sensitive
  personal-information category (including religious beliefs), alongside current
  app activity, other user-generated content, device/other identifiers and
  diagnostics categories. Do not assume one category covers every field.
- Review whether Firebase processing qualifies for a service-provider exception
  to "sharing" under current Play definitions; a provider is still disclosed
  in the policy even where that exception applies.
- Upload is optional; the core counters do not require consent. Reports are
  retained, not merely processed ephemerally.
- Transport uses HTTPS. Local storage is not a custom encrypted ledger.
- Deletion is requested by email with a report ID; there is no client-side
  server delete operation. Verify any Console deletion-URL requirements.
- Anonymous Auth records are not a user-facing login account. Verify how the
  current account-creation/deletion rules apply rather than asserting exemption.
- There is no ad SDK, advertising ID usage, location or contacts permission,
  microphone recording, or app analytics SDK in the current implementation.
- Review platform backups, provider logging and web-host behavior before final
  answers. Do not promise zero metadata collection or immediate backup erasure.

## Retention and deletion operations

The owner selected manual deletion with no automatic expiry. To fulfill a request:

1. Use the report ID to locate the document using trusted admin access.
2. Verify scope without asking for unnecessary personal or prayer information.
3. Delete the matching report, associated anonymous Auth record where applicable,
   and matching copies in owner-controlled private analysis exports.
4. Confirm the result to the requester without exposing another tester's data;
   explain provider-managed log/backup limitations where applicable.

Do not commit feedback exports, tokens, administrative credentials or deletion
request correspondence into the public repository.
