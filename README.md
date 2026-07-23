# Opportunity Scout

A local, security-conscious Reddit Data API client for bounded, non-commercial
workflow research. It includes a deliberately isolated posting/commenting path
with a fresh typed confirmation for every write.

## Current state

The software is implemented, but **Reddit API access is not active**. Reddit's
current Responsible Builder Policy requires explicit approval before API access.
The owner has designated this version as a personal, non-commercial, open-source
tool. Results from this approval must not be used to support a business,
monetized product, paid service, advertising, or commercial product decisions.
Obtain separate written approval from Reddit before any such use.

The source code may be publicly distributed, but generated reports and
Reddit-derived content remain local and are not included in the repository. Each
operator must obtain their own Reddit approval and credentials; the maintainer's
approval and credentials are not transferable. Under the requested personal-use
scope, this tool may not be used to select, validate, market, sell, or monetize
products or services.

## Run locally

Requirements: macOS and Node.js 22 or newer.

```bash
npm test
npm start
```

Open <http://localhost:8080>. The server binds to `127.0.0.1` only.

After Reddit approves this non-commercial developer use and creates an OAuth web
app:

1. Register the exact redirect URI shown in the UI (default:
   `http://localhost:8080/oauth/callback`).
2. Enter the Reddit username, client ID, and client secret in the secure setup
   screen. They are stored in macOS Keychain.
3. Select **Connect Reddit** and approve `identity`, `read`, and `submit`.
4. Run scans only within Reddit's approved subreddit/action scope.

The app never needs the Reddit account password. Do not paste a client secret or
refresh token into a chat message.

## Safety boundaries

- Maximum 20 searches, 25 posts, 25 comments per post, and ten minutes per scan.
- Initial subreddit allowlist matches the access-request draft.
- No usernames are kept; no user profiling or sensitive-trait inference.
- No server-side persistence of Reddit content.
- No voting, private messages, moderation, scheduled publishing, or outreach.
- Each post/comment requires two review steps and a unique expiring phrase.
- Duplicate writes are blocked for 24 hours.
- Results may not be used for monetized products or business decisions under
  this non-commercial approval.

See [the data-handling design](docs/DATA-HANDLING.md) and the
[non-commercial access-request draft](docs/ACCESS-REQUEST-DRAFT.md).

## Official requirements to verify before use

- [Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)
- [Developer Platform and accessing Reddit data](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data)
- [Data API Terms](https://redditinc.com/policies/data-api-terms)
- [Developer Terms](https://redditinc.com/policies/developer-terms)

This project is not affiliated with, endorsed by, or sponsored by Reddit.
