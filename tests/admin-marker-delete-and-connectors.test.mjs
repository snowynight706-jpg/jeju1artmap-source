import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { distanceAwareConnectorOpacity, distanceAwareConnectorWidth } from "../app/label-connector.mjs";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("label connector opacity becomes stronger as the label moves farther away", () => {
  const near = distanceAwareConnectorOpacity(20, 20, 21, 20, 1.2);
  const medium = distanceAwareConnectorOpacity(20, 20, 26, 20, 1.2);
  const far = distanceAwareConnectorOpacity(20, 20, 34, 20, 1.2);

  assert.equal(near, 0.34);
  assert.ok(near < medium);
  assert.ok(medium < far);
  assert.equal(far, 0.92);
  assert.equal(distanceAwareConnectorOpacity(20, 20, 20, 40, 1.2), 0.92);
});

test("dense label connector lines use the distance-aware opacity", () => {
  assert.match(pageSource, /import \{ distanceAwareConnectorOpacity, distanceAwareConnectorWidth \} from "\.\/label-connector\.mjs"/);
  assert.match(pageSource, /distanceAwareConnectorOpacity\(element\.x, element\.y, target\.x, target\.y, MAP_ASPECT\)/);
  assert.match(pageSource, /distanceAwareConnectorWidth\(element\.x, element\.y, target\.x, target\.y, MAP_ASPECT\)/);
  assert.match(pageSource, /strokeWidth: selectedConnector \? 2\.5 : connectorWidth/);
  assert.match(cssSource, /\.dense-label-connector line \{[^}]*transition: opacity \.16s ease, stroke-width \.16s ease/);
});

test("label connector width grows smoothly from 1.1 to 2.5", () => {
  const near = distanceAwareConnectorWidth(20, 20, 21, 20, 1.2);
  const medium = distanceAwareConnectorWidth(20, 20, 26, 20, 1.2);
  const far = distanceAwareConnectorWidth(20, 20, 34, 20, 1.2);

  assert.equal(near, 1.1);
  assert.ok(near < medium);
  assert.ok(medium < far);
  assert.equal(far, 2.5);
});

test("Delete and Backspace unlock first, then remove only the map placement", () => {
  const markerKeyHandler = pageSource.match(/const handleKey = \(event: KeyboardEvent\) => \{[\s\S]+?window\.addEventListener\("keydown", handleKey\);/)?.[0] ?? "";
  assert.ok(markerKeyHandler);
  assert.match(markerKeyHandler, /event\.key === "Delete" \|\| event\.key === "Backspace"/);
  assert.match(markerKeyHandler, /event\.preventDefault\(\);\s*if \(event\.repeat\) return;/);
  assert.match(markerKeyHandler, /if \(element\.locked\) \{[\s\S]+updateElement\(element\.id, \{ locked: false \}\)/);
  assert.match(markerKeyHandler, /지도에서 삭제하려면 한 번 더 누르세요/);
  assert.match(markerKeyHandler, /setPlacementOverride\(element, "deleted"\)/);
  assert.match(markerKeyHandler, /replaceElements\(\(current\) => current\.filter\(\(item\) => item\.id !== element\.id\)\)/);
  assert.match(markerKeyHandler, /통합 장소 DB는 보존됩니다/);
  assert.doesNotMatch(markerKeyHandler, /replaceDirectoryPlaces|PLACE_DIRECTORY_API|fetch\(/);
  assert.ok(markerKeyHandler.indexOf("if (element.locked)") < markerKeyHandler.indexOf('setPlacementOverride(element, "deleted")'));
  assert.match(pageSource, /<kbd>Delete \/ Backspace<\/kbd><span>고정 해제 → 지도 배치 삭제<\/span>/);
});
