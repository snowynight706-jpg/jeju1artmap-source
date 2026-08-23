import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { distanceAwareConnectorOpacity, distanceAwareConnectorWidth } from "../app/map/labels/connector.mjs";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
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

test("public dense label connectors stay clearly visible while admin opacity remains distance-aware", () => {
  assert.match(pageSource, /import \{ distanceAwareConnectorOpacity, distanceAwareConnectorWidth \} from "\.\.\/labels\/connector\.mjs"/);
  assert.match(pageSource, /const PUBLIC_DENSE_LABEL_CONNECTOR_OPACITY = 0\.84/);
  assert.match(pageSource, /const connectorOpacity = publicConnector[\s\S]{0,100}PUBLIC_DENSE_LABEL_CONNECTOR_OPACITY[\s\S]{0,180}distanceAwareConnectorOpacity\(element\.x, element\.y, target\.x, target\.y, MAP_ASPECT\)/);
  assert.match(pageSource, /distanceAwareConnectorWidth\(element\.x, element\.y, target\.x, target\.y, MAP_ASPECT, publicConnector \? 1\.5 : 2\.5\)/);
  assert.match(pageSource, /strokeWidth: selectedConnector \? publicConnector \? 1\.55 : 2\.5 : connectorWidth/);
  assert.match(cssSource, /\.dense-label-connector line \{[^}]*transition: opacity var\(--motion-fast\) ease, stroke-width var\(--motion-fast\) ease/);
});

test("label connector width grows smoothly from 1.1 to 2.5", () => {
  const near = distanceAwareConnectorWidth(20, 20, 21, 20, 1.2);
  const medium = distanceAwareConnectorWidth(20, 20, 26, 20, 1.2);
  const far = distanceAwareConnectorWidth(20, 20, 34, 20, 1.2);

  assert.equal(near, 1.1);
  assert.ok(near < medium);
  assert.ok(medium < far);
  assert.equal(far, 2.5);
  assert.equal(distanceAwareConnectorWidth(20, 20, 34, 20, 1.2, 1.5), 1.5);
});

test("public labels keep the compact grouped-label type size", () => {
  assert.match(cssSource, /\.public-readonly-shell \.label \{ font-size: 8px; \}/);
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
