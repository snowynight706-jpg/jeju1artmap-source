import assert from "node:assert/strict";
import test from "node:test";

import { contentSummaryFromBatchResults } from "../app/content-summary.mjs";

test("server count results become a stable initial content summary", () => {
  const refreshedAt = "2026-08-11T00:00:00.000Z";
  const summary = contentSummaryFromBatchResults(
    { results: [{ count: 4 }] },
    { results: [{ count: 2 }] },
    { results: [{ count: 0 }] },
    refreshedAt,
  );

  assert.deepEqual(summary, {
    reviews: 4,
    events: 2,
    placeRequests: 0,
    refreshedAt,
  });
});

test("invalid or missing count rows never create a false negative badge", () => {
  const summary = contentSummaryFromBatchResults(
    { results: [{ count: "not-a-number" }] },
    { results: [{ count: -3 }] },
    { results: [] },
    "2026-08-11T00:00:00.000Z",
  );

  assert.equal(summary.reviews, 0);
  assert.equal(summary.events, 0);
  assert.equal(summary.placeRequests, 0);
});
