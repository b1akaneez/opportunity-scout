import { setTimeout as delay } from "node:timers/promises";
import { userAgent, validateSubreddit } from "./config.js";
import { getAccessToken } from "./oauth.js";
import { getCredentials } from "./secret-store.js";

const API_ORIGIN = "https://oauth.reddit.com";

async function headers(accessToken, hasForm = false) {
  const { username } = await getCredentials();
  const result = {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": userAgent(username),
  };
  if (hasForm) result["Content-Type"] = "application/x-www-form-urlencoded";
  return result;
}

async function respectRateLimit(response) {
  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  if (Number.isFinite(remaining) && remaining < 2 && resetSeconds > 0) {
    await delay(Math.min(resetSeconds, 60) * 1000);
  }
}

async function parseRedditResponse(response) {
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Reddit returned an invalid response (${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(`Reddit API request failed (${response.status}).`);
  }
  return payload;
}

export async function redditRequest(
  pathname,
  { method = "GET", query = {}, form = null, retry = true } = {},
) {
  const accessToken = await getAccessToken();
  const url = new URL(pathname, API_ORIGIN);
  for (const [key, value] of Object.entries({ ...query, raw_json: 1 })) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method,
    headers: await headers(accessToken, Boolean(form)),
    body: form ? new URLSearchParams(form) : undefined,
  });

  if (response.status === 401 && retry) {
    await getAccessToken({ forceRefresh: true });
    return redditRequest(pathname, { method, query, form, retry: false });
  }

  if (response.status === 429 && retry) {
    const retryAfter = Math.min(
      Number(response.headers.get("retry-after") || 5),
      60,
    );
    await delay(retryAfter * 1000);
    return redditRequest(pathname, { method, query, form, retry: false });
  }

  await respectRateLimit(response);
  return parseRedditResponse(response);
}

export async function getIdentity() {
  const payload = await redditRequest("/api/v1/me");
  return {
    name: payload.name,
    createdAt: payload.created_utc
      ? new Date(payload.created_utc * 1000).toISOString()
      : null,
  };
}

export async function searchPosts({
  query,
  subreddit,
  sort = "comments",
  time = "year",
  limit = 25,
}) {
  const path = subreddit
    ? `/r/${validateSubreddit(subreddit)}/search`
    : "/search";
  const listing = await redditRequest(path, {
    query: {
      q: query,
      restrict_sr: subreddit ? 1 : undefined,
      sort,
      t: time,
      limit: Math.min(Math.max(Number(limit) || 10, 1), 100),
      type: "link",
    },
  });

  return (listing?.data?.children || [])
    .filter((child) => child.kind === "t3" && child.data)
    .map(({ data }) => ({
      id: data.id,
      fullname: data.name,
      subreddit: data.subreddit,
      title: data.title || "",
      body: data.selftext || "",
      score: Number(data.score || 0),
      commentsCount: Number(data.num_comments || 0),
      createdAt: data.created_utc
        ? new Date(data.created_utc * 1000).toISOString()
        : null,
      permalink: data.permalink
        ? `https://www.reddit.com${data.permalink}`
        : null,
      over18: Boolean(data.over_18),
      quarantined: Boolean(data.quarantine),
    }));
}

function flattenComments(children, output, limit) {
  for (const child of children || []) {
    if (output.length >= limit) break;
    if (child.kind !== "t1" || !child.data?.body) continue;
    output.push({
      body: child.data.body,
      score: Number(child.data.score || 0),
      createdAt: child.data.created_utc
        ? new Date(child.data.created_utc * 1000).toISOString()
        : null,
    });
    const replies = child.data.replies?.data?.children;
    if (Array.isArray(replies)) flattenComments(replies, output, limit);
  }
}

export async function getPostComments(postId, limit = 25) {
  if (!/^[a-z0-9]+$/i.test(String(postId))) {
    throw new Error("Invalid Reddit post ID.");
  }
  const payload = await redditRequest(`/comments/${postId}`, {
    query: { limit: Math.min(Math.max(Number(limit) || 10, 1), 100), depth: 3 },
  });
  const comments = [];
  flattenComments(payload?.[1]?.data?.children, comments, limit);
  return comments;
}

function assertNoRedditErrors(payload) {
  const errors = payload?.json?.errors || [];
  if (errors.length) {
    const safeCodes = errors.map((entry) => entry?.[0]).filter(Boolean).join(", ");
    throw new Error(`Reddit rejected the write: ${safeCodes || "unknown error"}.`);
  }
  return payload?.json?.data || {};
}

export async function submitPost({ subreddit, title, text = "", url = "" }) {
  const sr = validateSubreddit(subreddit);
  const kind = url ? "link" : "self";
  const payload = await redditRequest("/api/submit", {
    method: "POST",
    form: {
      api_type: "json",
      kind,
      sr,
      title,
      text: kind === "self" ? text : "",
      url: kind === "link" ? url : "",
      resubmit: "false",
      sendreplies: "true",
    },
  });
  return assertNoRedditErrors(payload);
}

export async function submitComment({ parent, text }) {
  const payload = await redditRequest("/api/comment", {
    method: "POST",
    form: { api_type: "json", thing_id: parent, text },
  });
  return assertNoRedditErrors(payload);
}
