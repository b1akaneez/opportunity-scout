import test from "node:test";
import assert from "node:assert/strict";
import {
  executePreparedWrite,
  normalizeWriteDraft,
  prepareWrite,
} from "../src/write-safety.js";

test("normalizes a post but rejects missing content", () => {
  assert.deepEqual(
    normalizeWriteDraft({
      kind: "post",
      subreddit: "r/productivity",
      title: "A useful question",
      text: "Exact reviewed text",
    }),
    {
      kind: "post",
      subreddit: "productivity",
      title: "A useful question",
      text: "Exact reviewed text",
      url: "",
    },
  );
  assert.throws(
    () =>
      normalizeWriteDraft({
        kind: "post",
        subreddit: "productivity",
        title: "No body",
      }),
    /needs text or a URL/,
  );
});

test("requires the exact fresh confirmation phrase before publishing", async () => {
  const prepared = prepareWrite({
    kind: "comment",
    parent: "t3_abc123",
    text: "One owner-reviewed reply",
  });
  let calls = 0;
  const handlers = {
    submitPost: async () => {
      calls += 1;
    },
    submitComment: async () => {
      calls += 1;
      return { id: "t1_result" };
    },
  };
  await assert.rejects(
    executePreparedWrite(
      { id: prepared.id, confirmationPhrase: "wrong" },
      handlers,
    ),
    /does not match/,
  );
  assert.equal(calls, 0);
  const result = await executePreparedWrite(
    { id: prepared.id, confirmationPhrase: prepared.confirmationPhrase },
    handlers,
  );
  assert.equal(calls, 1);
  assert.equal(result.id, "t1_result");
});
