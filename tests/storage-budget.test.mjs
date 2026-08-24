import test from "node:test";
import assert from "node:assert/strict";

import {
  D1_SAFE_ROW_BYTES,
  d1RowByteLength,
  utf8ByteLength,
  validateD1RowBudget,
} from "../app/api/storage-budget.mjs";

test("D1 row budget counts UTF-8 bytes instead of JavaScript characters", () => {
  assert.equal(utf8ByteLength("제주"), 6);
  assert.equal(d1RowByteLength(["제주", "map", 1]), 17);
});

test("D1 row budget accepts rows at the safe boundary", () => {
  const result = validateD1RowBudget(["x".repeat(D1_SAFE_ROW_BYTES)]);
  assert.equal(result.ok, true);
  assert.equal(result.headroomBytes, 0);
});

test("D1 row budget rejects combined current and previous snapshots before D1", () => {
  const snapshot = "x".repeat(810_000);
  const result = validateD1RowBudget([snapshot, "{}", snapshot, "{}"]);
  assert.equal(result.ok, false);
  assert.equal(result.bytes, 1_620_004);
});
