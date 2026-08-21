import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const eventDialogSource = await readFile(new URL("../app/admin-place-event-dialog.tsx", import.meta.url), "utf8");
const explorerActivitySource = await readFile(new URL("../app/public-explorer-activity-content.tsx", import.meta.url), "utf8");
const apiSource = await readFile(new URL("../app/api/place-events/route.ts", import.meta.url), "utf8");
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

test("event management can create and edit an event without a mapped place", () => {
  assert.match(pageSource, /const \[placeEventNoPlace, setPlaceEventNoPlace\] = useState\(false\)/);
  assert.match(pageSource, /const openUnassignedPlaceEventForm = \(\) =>/);
  assert.match(pageSource, /setPlaceEventNoPlace\(true\)[\s\S]{0,120}setPlaceEventPlaces\(\[\]\)/);
  assert.match(pageSource, /global-event-management-toolbar[\s\S]{0,260}openUnassignedPlaceEventForm[\s\S]{0,80}＋ 행사 등록/);
  assert.match(eventDialogSource, /장소 지정 안 함/);
  assert.match(pageSource, /form\.set\("places", JSON\.stringify\(placeEventNoPlace \? \[\] : placeEventPlaces\)\)/);
  assert.match(pageSource, /\(!placeEventNoPlace && !placeEventPlaces\.length\)/);
  assert.match(explorerActivitySource, /const places = eventPlaces\(event\)/);
  assert.match(explorerActivitySource, /원도심 공통 행사 · 장소 지정 없음/);
  assert.match(cssSource, /\.global-event-management-toolbar \{/);
  assert.match(cssSource, /\.event-place-picker\.unassigned \{/);
});

test("event API accepts an explicit empty place list without adding a place relation", () => {
  assert.match(apiSource, /if \(!raw\) return \[\]/);
  assert.match(apiSource, /return candidates\.length === 0 \? \[\]/);
  assert.match(apiSource, /places === null \|\| eventName\.length < 2/);
  assert.match(apiSource, /places\.length && !await publishedPlacesExist\(runtime\.DB, places\)/);
  assert.match(apiSource, /const primaryPlace = places\[0\] \?\? \{ placeKey: "", placeName: "" \}/);
  assert.match(apiSource, /\.\.\.places\.map\(\(place, index\) => runtime\.DB!\.prepare/);
  assert.match(apiSource, /validPlaceKey\(row\.placeKey\) && row\.placeName \? \[\{ placeKey: row\.placeKey, placeName: row\.placeName \}\] : \[\]/);
  assert.doesNotMatch(apiSource, /INSERT OR IGNORE INTO place_event_places/);
});
