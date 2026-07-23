# Data handling and safety design

Opportunity Scout is designed around bounded, user-initiated access rather than
continuous collection.

- It binds only to the local computer (`127.0.0.1`).
- OAuth credentials and refresh tokens are stored in macOS Keychain.
- It never asks for or stores the account's Reddit password.
- It requests only `identity`, `read`, and `submit`. It does not request voting,
  private messages, moderation, account management, or user-history scopes.
- Scans are limited to the initial communities approved in the access request,
  a maximum of 20 search requests, 25 evidence posts, 25 comments per post, and
  ten minutes.
- NSFW and quarantined results are skipped.
- Author names are discarded. The app does not build user profiles, infer
  sensitive characteristics, contact users, or identify leads.
- API responses and scan results are not persisted by the server. The browser
  receives only the current result and loses it when the page/session is closed.
- Reddit content is not used for model training or fine-tuning.
- Any request-time use of an outside AI provider must be disclosed to and
  separately approved by Reddit before it is enabled.
- This release is personal and non-commercial. Findings may not support a
  business, monetized product, advertising, paid service, or commercial product
  decision unless Reddit separately grants written commercial approval.
- Posting and commenting are completely separate from scanning. Every write
  requires review of the exact content, a fresh unique phrase, and a second
  browser confirmation. Duplicate writes are blocked for 24 hours.
- The app does not schedule posts, cross-post automatically, vote, send direct
  messages, or perform automated outreach.

This design does not itself grant permission to access Reddit. The owner must
receive explicit Reddit approval and comply with the approved use case, current
terms, community rules, and any additional conditions Reddit applies to this
non-commercial use. Any future commercial use requires separate written approval
from Reddit before it begins.
