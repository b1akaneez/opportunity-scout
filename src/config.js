export const APP_NAME = "Opportunity Scout";
export const APP_VERSION = "0.1.0";
export const KEYCHAIN_SERVICE = "local.opportunity-scout";
export const HOST = "127.0.0.1";
export const PORT = Number.parseInt(process.env.PORT || "8080", 10);
export const REDIRECT_URI =
  process.env.REDDIT_REDIRECT_URI ||
  `http://localhost:${PORT}/oauth/callback`;

// `submit` is intentionally present for later owner-approved posts/comments.
// There are no vote, private-message, moderation, or account-management scopes.
export const OAUTH_SCOPES = Object.freeze(["identity", "read", "submit"]);

export const SCAN_LIMITS = Object.freeze({
  maxQueries: 8,
  maxSubreddits: 12,
  maxSearchRequests: 20,
  maxPosts: 25,
  maxCommentsPerPost: 25,
  maxRuntimeMs: 10 * 60 * 1000,
});

export const PROPOSED_INITIAL_SUBREDDITS = Object.freeze([
  "productivity",
  "ProductivityApps",
  "organization",
  "CleaningTips",
  "homeowners",
  "Frugal",
  "MealPrepSunday",
]);

export function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/^\/?u\//i, "");
}

export function validateRedditName(value, label = "Reddit name") {
  const normalized = normalizeUsername(value);
  if (!/^[A-Za-z0-9_-]{3,32}$/.test(normalized)) {
    throw new Error(`${label} must contain only letters, numbers, _ or -.`);
  }
  return normalized;
}

export function validateSubreddit(value) {
  const normalized = String(value || "")
    .trim()
    .replace(/^\/?r\//i, "");
  if (!/^[A-Za-z0-9_]{2,50}$/.test(normalized)) {
    throw new Error(`Invalid subreddit: ${value}`);
  }
  return normalized;
}

export function userAgent(username) {
  return `macos:opportunity-scout:v${APP_VERSION} (by /u/${validateRedditName(username)})`;
}
