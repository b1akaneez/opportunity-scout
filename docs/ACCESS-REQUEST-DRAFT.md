# Reddit non-commercial developer Data Access Request — draft

The owner has designated Opportunity Scout as a personal, open-source,
non-commercial tool. Findings obtained under this approval will not support a
business, monetized product, paid service, advertising, or commercial product
decisions. Separate written approval will be obtained from Reddit before any
future commercial use.

## Reddit account name

Unlucky-Associate-47

## Benefit/purpose for Redditors

Opportunity Scout is a free, open-source personal research tool that helps one
Reddit account owner review recurring, explicitly stated manual-workflow
frustrations across a bounded list of public communities. It returns short
evidence summaries and direct permalinks so every finding can be checked against
the original discussion. Its intended benefit is to reduce repetitive validation
questions and support non-commercial, educational, or open-source learning
based on needs Redditors have already chosen to discuss. It does not identify or
contact individuals, build profiles, infer sensitive traits, sell Reddit data,
train models, support advertising, or inform monetized products.

## Detailed bot/app activity

Each scan begins only when the authenticated owner enters search phrases and
chooses from the approved subreddit list. A scan is capped at 20 search requests,
25 evidence posts, 25 comments per post, and ten minutes. The app reads titles,
bodies, comment text, subreddit, timestamp, public engagement counts, and
permalink. Author identifiers are discarded. It skips NSFW, quarantined, and
private communities and does not run continuously.

The app uses local deterministic rules to deduplicate results and rank explicitly
stated frustration, repeated manual work, lost time, missed deadlines, and unmet
needs. Raw API responses and scan results are not persisted by the server. Reddit
content is not used to train or fine-tune any model.

If Reddit approves it, a bounded result set may be presented to OpenAI Codex for
request-time summarization only, with no model training or fine-tuning. If Reddit
does not approve that processor use, it will remain disabled and findings will be
reviewed manually using the local deterministic output.

The app requests `identity`, `read`, and `submit`. A post or comment can be
submitted only after the owner selects the destination, reviews the exact text,
types a fresh one-time confirmation phrase, and confirms that individual action
again. The app never posts autonomously, on a schedule, or across multiple
communities. It does not vote, send private messages, moderate communities,
perform outreach, monitor people, build user histories, or bulk export Reddit
content.

## What is missing from Devvit

Devvit is centered on apps installed into and operating within individual
subreddits. Opportunity Scout is a private external dashboard used by one
authenticated owner to request a bounded comparison across several public
communities that have not installed the app, then view one consolidated report
outside Reddit. Requiring moderator installation in every analyzed community
does not fit this workflow. The needed capability is approved external OAuth
Data API access for bounded cross-community reading and an individually
owner-confirmed post or comment.

## Source code or platform link

[PENDING PUBLIC GITHUB URL]

## Proposed initial subreddit scope

r/productivity, r/ProductivityApps, r/organization, r/CleaningTips,
r/homeowners, r/Frugal, and r/MealPrepSunday.

The app will not expand this list without updated Reddit approval. Any post or
comment will also comply with the destination community's rules.

## Operating username

u/Unlucky-Associate-47 is the developer and sole authenticated operator. Every
write is a genuine per-item user action: the owner chooses the destination,
reviews the exact text, and explicitly confirms that individual submission. There
is no autonomous, unattended, scheduled, or bulk posting. Any approved post or
comment is solely for the operator's own participation. It will not promote or
validate a product, recruit customers or testers, solicit commercial feedback,
contain referral links, or perform marketing or outreach.
