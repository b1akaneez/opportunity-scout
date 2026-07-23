import { createHash, randomInt, randomUUID } from "node:crypto";
import { validateSubreddit } from "./config.js";

const preparedWrites = new Map();
const recentContent = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;

function requiredText(value, label, maximum) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) {
    throw new Error(`${label} must be ${maximum} characters or fewer.`);
  }
  return normalized;
}

function contentHash(draft) {
  return createHash("sha256")
    .update(JSON.stringify(draft))
    .digest("hex");
}

function cleanup() {
  const now = Date.now();
  for (const [id, item] of preparedWrites) {
    if (item.expiresAt <= now) preparedWrites.delete(id);
  }
  for (const [hash, timestamp] of recentContent) {
    if (timestamp + DUPLICATE_WINDOW_MS <= now) recentContent.delete(hash);
  }
}

export function normalizeWriteDraft(input = {}) {
  if (input.kind === "post") {
    const subreddit = validateSubreddit(input.subreddit);
    const title = requiredText(input.title, "Title", 300);
    const text = String(input.text || "").trim();
    const url = String(input.url || "").trim();
    if (!text && !url) throw new Error("A post needs text or a URL.");
    if (text.length > 40_000) throw new Error("Post text is too long.");
    if (url && !/^https?:\/\//i.test(url)) {
      throw new Error("Post URL must start with http:// or https://.");
    }
    return { kind: "post", subreddit, title, text, url };
  }

  if (input.kind === "comment") {
    const parent = requiredText(input.parent, "Parent fullname", 20);
    if (!/^t[13]_[a-z0-9]+$/i.test(parent)) {
      throw new Error("Parent fullname must look like t1_xxx or t3_xxx.");
    }
    return {
      kind: "comment",
      parent,
      text: requiredText(input.text, "Comment text", 10_000),
    };
  }

  throw new Error("Write kind must be post or comment.");
}

export function prepareWrite(input) {
  cleanup();
  const draft = normalizeWriteDraft(input);
  const hash = contentHash(draft);
  if (recentContent.has(hash)) {
    throw new Error(
      "An identical post/comment was submitted in the last 24 hours. Duplicate automation is blocked.",
    );
  }
  const destination =
    draft.kind === "post" ? `r/${draft.subreddit}` : draft.parent;
  const confirmationPhrase = `${draft.kind.toUpperCase()} ${destination} ${randomInt(1000, 9999)}`;
  const id = randomUUID();
  preparedWrites.set(id, {
    draft,
    hash,
    confirmationPhrase,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return {
    id,
    draft,
    confirmationPhrase,
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS).toISOString(),
    warning:
      "Review the exact content and community rules. This action publishes to Reddit and cannot be undone by this confirmation screen.",
  };
}

export async function executePreparedWrite({ id, confirmationPhrase }, handlers) {
  cleanup();
  const prepared = preparedWrites.get(String(id || ""));
  if (!prepared) throw new Error("Write confirmation is missing or expired.");
  if (confirmationPhrase !== prepared.confirmationPhrase) {
    throw new Error("The confirmation phrase does not match.");
  }
  preparedWrites.delete(id);
  const result =
    prepared.draft.kind === "post"
      ? await handlers.submitPost(prepared.draft)
      : await handlers.submitComment(prepared.draft);
  recentContent.set(prepared.hash, Date.now());
  return result;
}
