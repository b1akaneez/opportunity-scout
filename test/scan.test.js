import test from "node:test";
import assert from "node:assert/strict";
import { complaintScore, detectPainSignals } from "../src/scan.js";

test("detects explicit pain without needing author identity", () => {
  const signals = detectPainSignals(
    "I manually copy-paste this every week. It takes hours and there has to be a better way.",
  );
  assert.ok(signals.includes("repetitive manual work"));
  assert.ok(signals.includes("lost time"));
  assert.ok(signals.includes("explicit unmet need"));
  assert.ok(signals.includes("repeated frequency"));
});

test("complaint score rewards multiple pain signals and engagement", () => {
  const weak = complaintScore({ text: "A neutral status update", upvotes: 1 });
  const strong = complaintScore({
    text: "This manual task wastes hours every week and I wish there was an app.",
    upvotes: 150,
    commentsCount: 80,
  });
  assert.ok(strong.score > weak.score);
});
