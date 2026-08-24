import test from "node:test";
import assert from "node:assert/strict";

import {
  DENSE_LABEL_MAX_ITEMS,
  validateDenseLabelSettingsPayload,
} from "../app/map/labels/settings-contract.mjs";

function position(count) {
  return {
    key: `group-${count}`,
    elementIds: Array.from({ length: count }, (_, index) => `place-${index}`),
    x: 50,
    y: 50,
  };
}

for (const count of [2, 4, 5, 10, 18]) {
  test(`dense label settings accept a ${count}-place group`, () => {
    assert.equal(validateDenseLabelSettingsPayload({
      positions: [position(count)],
      excludedElementIds: [],
    }).ok, true);
  });
}

test("dense label settings reject groups above the shared cap", () => {
  const result = validateDenseLabelSettingsPayload({
    positions: [position(DENSE_LABEL_MAX_ITEMS + 1)],
    excludedElementIds: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.maximumItems, 18);
  assert.equal(result.itemCount, 19);
});

test("dense label settings reject duplicate group keys", () => {
  const result = validateDenseLabelSettingsPayload({
    positions: [position(5), { ...position(6), key: "group-5" }],
    excludedElementIds: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "duplicate dense label key");
});
