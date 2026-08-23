import assert from "node:assert/strict";
import test from "node:test";

import { completeReviewStatuses } from "../app/review-status.mjs";
import { parseVersionedLocalAutosave, shouldRestoreLocalAutosave } from "../app/editor/persistence/local-autosave.mjs";

test("publishing completes element and asset review statuses without mutating the draft", () => {
  const draft = {
    elements: [
      { id: "marker-1", status: "review" },
      { id: "marker-2", status: "unchecked" },
      { id: "marker-3", status: "approved" },
    ],
    assets: [
      { id: "asset-1", status: "unchecked" },
      { id: "asset-2", status: "approved" },
    ],
    reviewNotes: [{ id: "note-1", status: "keep" }],
  };

  const completed = completeReviewStatuses(draft);

  assert.equal(completed.completedCount, 3);
  assert.deepEqual(completed.document.elements.map((item) => item.status), ["approved", "approved", "approved"]);
  assert.deepEqual(completed.document.assets.map((item) => item.status), ["approved", "approved"]);
  assert.deepEqual(completed.document.reviewNotes, draft.reviewNotes);
  assert.deepEqual(draft.elements.map((item) => item.status), ["review", "unchecked", "approved"]);
  assert.deepEqual(draft.assets.map((item) => item.status), ["unchecked", "approved"]);
});

test("a stale or legacy device cache cannot replace a newer server-published layout", () => {
  const legacy = parseVersionedLocalAutosave(JSON.stringify({ elements: [{ id: "old", status: "unchecked" }] }));
  const stale = parseVersionedLocalAutosave(JSON.stringify({
    schemaVersion: 4,
    baseRevision: 7,
    document: { elements: [{ id: "old", status: "unchecked" }] },
  }));
  const current = parseVersionedLocalAutosave(JSON.stringify({
    schemaVersion: 4,
    baseRevision: 8,
    document: { elements: [{ id: "draft", status: "review" }] },
  }));

  assert.equal(shouldRestoreLocalAutosave(legacy, true, 8), false);
  assert.equal(shouldRestoreLocalAutosave(stale, true, 8), false);
  assert.equal(shouldRestoreLocalAutosave(current, true, 8), true);
  assert.equal(shouldRestoreLocalAutosave(legacy, false, 0), true);
});
