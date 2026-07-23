import {
  PROPOSED_INITIAL_SUBREDDITS,
  SCAN_LIMITS,
  validateSubreddit,
} from "./config.js";
import { getAccessToken } from "./oauth.js";
import { getPostComments, searchPosts } from "./reddit.js";

const PAIN_SIGNALS = Object.freeze([
  ["repetitive manual work", /\b(manual|manually|copy.?paste|spreadsheet)\b/i],
  ["lost time", /\b(waste|wasted|takes? (?:me )?hours?|time.?consuming)\b/i],
  ["frustration", /\b(frustrat|annoy|hate (?:having|doing)|drives? me crazy)\w*/i],
  ["missed or forgotten task", /\b(forgot|forget|missed|overdue|too late)\b/i],
  ["explicit unmet need", /\b(i wish|wish there was|easier way|better way|why isn'?t there)\b/i],
  ["money loss", /(?:\$\s?\d+|\b(lost|waste[sd]?) (?:me )?(?:money|hundreds|thousands)\b)/i],
  ["workaround", /\b(workaround|hack|system i use|what i do now)\b/i],
  ["repeated frequency", /\b(every day|daily|every week|weekly|constantly|all the time)\b/i],
]);

const STOP_WORDS = new Set(
  "about after again also and are because been before being between both but can could did does doing down each few for from further had has have having here how into its itself just more most not now off once only other our out over own same should some such than that the their them then there these they this those through too under until very was were what when where which while who why will with would you your".split(
    " ",
  ),
);

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(value, maxLength = 420) {
  const cleaned = cleanText(value);
  return cleaned.length <= maxLength
    ? cleaned
    : `${cleaned.slice(0, maxLength - 1)}…`;
}

export function detectPainSignals(text) {
  return PAIN_SIGNALS.filter(([, expression]) => expression.test(text)).map(
    ([label]) => label,
  );
}

function topTerms(text, limit = 8) {
  const counts = new Map();
  const words = cleanText(text)
    .toLowerCase()
    .match(/[a-z][a-z'-]{2,}/g);
  for (const word of words || []) {
    if (STOP_WORDS.has(word) || word.length > 28) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

export function complaintScore({ text, upvotes = 0, commentsCount = 0 }) {
  const signals = detectPainSignals(text);
  const engagement =
    Math.log10(Math.max(0, upvotes) + 1) +
    Math.log10(Math.max(0, commentsCount) + 1);
  return {
    signals,
    score: Number((signals.length * 2 + engagement).toFixed(2)),
  };
}

function normalizeList(values, maximum) {
  return [...new Set((values || []).map(cleanText).filter(Boolean))].slice(
    0,
    maximum,
  );
}

export async function runOpportunityScan(input = {}) {
  const started = Date.now();
  const queries = normalizeList(input.queries, SCAN_LIMITS.maxQueries);
  if (!queries.length) throw new Error("Provide at least one search phrase.");

  // Fail clearly before the per-community loop. Otherwise an unavailable OAuth
  // connection could be mistaken for a successful scan with zero evidence.
  await getAccessToken();

  const requestedSubreddits = normalizeList(
    input.subreddits,
    SCAN_LIMITS.maxSubreddits,
  );
  const subreddits = (
    requestedSubreddits.length
      ? requestedSubreddits
      : PROPOSED_INITIAL_SUBREDDITS
  ).map(validateSubreddit);
  const allowed = new Set(PROPOSED_INITIAL_SUBREDDITS.map((name) => name.toLowerCase()));
  const outsideInitialScope = subreddits.filter(
    (name) => !allowed.has(name.toLowerCase()),
  );
  if (outsideInitialScope.length) {
    throw new Error(
      `Outside the initial approval scope: ${outsideInitialScope.join(", ")}. Update Reddit approval before expanding it.`,
    );
  }

  const maxPosts = Math.min(
    Math.max(Number(input.maxPosts) || 15, 1),
    SCAN_LIMITS.maxPosts,
  );
  const combinations = [];
  for (const query of queries) {
    for (const subreddit of subreddits) {
      if (combinations.length >= SCAN_LIMITS.maxSearchRequests) break;
      combinations.push({ query, subreddit });
    }
    if (combinations.length >= SCAN_LIMITS.maxSearchRequests) break;
  }

  const postsById = new Map();
  const warnings = [];
  for (const combination of combinations) {
    if (Date.now() - started > SCAN_LIMITS.maxRuntimeMs) {
      warnings.push("The scan stopped at its ten-minute safety limit.");
      break;
    }
    try {
      const posts = await searchPosts({
        ...combination,
        sort: input.sort || "comments",
        time: input.time || "year",
        limit: Math.min(maxPosts, 25),
      });
      for (const post of posts) {
        // Do not process NSFW or quarantined results.
        if (!post.over18 && !post.quarantined && !postsById.has(post.id)) {
          postsById.set(post.id, post);
        }
      }
    } catch (error) {
      warnings.push(
        `Search in r/${combination.subreddit} failed: ${error.message}`,
      );
    }
  }

  const candidates = [...postsById.values()]
    .map((post) => ({
      post,
      preview: complaintScore({
        text: `${post.title} ${post.body}`,
        upvotes: post.score,
        commentsCount: post.commentsCount,
      }),
    }))
    .sort((a, b) => b.preview.score - a.preview.score)
    .slice(0, maxPosts);

  const evidence = [];
  for (const { post } of candidates) {
    if (Date.now() - started > SCAN_LIMITS.maxRuntimeMs) {
      warnings.push("The scan stopped at its ten-minute safety limit.");
      break;
    }
    let comments = [];
    try {
      comments = await getPostComments(
        post.id,
        SCAN_LIMITS.maxCommentsPerPost,
      );
    } catch (error) {
      warnings.push(`Comments for ${post.permalink} failed: ${error.message}`);
    }
    const combinedText = [
      post.title,
      post.body,
      ...comments.map((comment) => comment.body),
    ].join(" ");
    const analysis = complaintScore({
      text: combinedText,
      upvotes: post.score,
      commentsCount: post.commentsCount,
    });
    evidence.push({
      subreddit: post.subreddit,
      title: post.title,
      postExcerpt: snippet(post.body),
      permalink: post.permalink,
      createdAt: post.createdAt,
      upvotes: post.score,
      commentsCount: post.commentsCount,
      complaintScore: analysis.score,
      signals: analysis.signals,
      recurringTerms: topTerms(combinedText),
      topCommentExcerpts: comments
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map((comment) => ({ score: comment.score, excerpt: snippet(comment.body, 280) })),
    });
  }

  evidence.sort((a, b) => b.complaintScore - a.complaintScore);
  return {
    startedAt: new Date(started).toISOString(),
    finishedAt: new Date().toISOString(),
    durationSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
    limits: SCAN_LIMITS,
    queries,
    subreddits,
    searchedCombinations: combinations.length,
    uniquePostsFound: postsById.size,
    evidence,
    warnings,
    dataHandling:
      "No API response or username was persisted by the server. Results exist only in this live response/UI session.",
  };
}
