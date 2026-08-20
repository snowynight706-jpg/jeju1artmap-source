import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const workerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
const storyRouteSource = await readFile(new URL("../app/api/place-stories/route.ts", import.meta.url), "utf8");

test("mobile place-story submission survives unavailable browser storage", () => {
  assert.match(pageSource, /let volatileVisitorId = ""/);
  assert.match(pageSource, /function persistentVisitorId\(\) \{\s+try \{/);
  assert.match(pageSource, /volatileVisitorId \|\|= newVisitorId\(\)/);
  assert.match(pageSource, /try \{ localStorage\.setItem\(PLACE_STORY_AUTHOR_KEY, authorName\); \} catch \{\}/);
});

test("mobile photos have a native picker and resilient encoding fallbacks", () => {
  assert.match(pageSource, /className="place-story-photo-picker"/);
  assert.match(pageSource, /accept="image\/\*,\.heic,\.heif"/);
  assert.match(pageSource, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(pageSource, /facingMode: \{ ideal: "environment" \}/);
  assert.match(pageSource, /capture="environment"/);
  assert.match(pageSource, /선택한 사진 1장을 즉시 앱의 임시 메모리로 복사합니다/);
  assert.match(pageSource, /카메라 권한 요청/);
  assert.match(pageSource, /stream\.getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  assert.match(pageSource, /const bytes = await sourceFile\.arrayBuffer\(\)/);
  assert.match(pageSource, /const retainedFile = new File\(\[bytes\]/);
  assert.match(pageSource, /void retainPlaceStoryPhoto\(file\)/);
  assert.match(pageSource, /임시 사본은 후기 등록 완료 후 자동 삭제됩니다/);
  assert.match(pageSource, /placeStoryPhotoRetaining \|\| !placeStoryAuthor\.trim\(\)/);
  assert.match(pageSource, /errorCode = error instanceof Error[\s\S]{0,180}"photo-read-failed"/);
  assert.match(pageSource, /updatePlaceStoryPhoto\(null\);[\s\S]{0,220}setPlaceStoryFormOpen\(false\)/);
  assert.match(pageSource, /const STORY_PHOTO_TARGET_BYTES = 1\.5 \* 1024 \* 1024/);
  assert.match(pageSource, /const STORY_PHOTO_ENCODING_ATTEMPTS = \[/);
  assert.match(pageSource, /\{ maximumEdge: 1080, type: "image\/webp", quality: 0\.7 \}/);
  assert.match(pageSource, /\{ maximumEdge: 900, type: "image\/jpeg", quality: 0\.64 \}/);
  assert.match(pageSource, /\{ maximumEdge: 640, type: "image\/jpeg", quality: 0\.5 \}/);
  assert.match(pageSource, /for \(const attempt of STORY_PHOTO_ENCODING_ATTEMPTS\)/);
  assert.match(pageSource, /blob\.size <= STORY_PHOTO_TARGET_BYTES/);
  assert.match(pageSource, /createImageBitmap\(file, \{ imageOrientation: "from-image" \}\)/);
  assert.match(pageSource, /\["image\/jpeg", "image\/png", "image\/webp"\]\.includes\(file\.type\)/);
  assert.match(pageSource, /file\.size <= STORY_PHOTO_TARGET_BYTES\) return file/);
  assert.doesNotMatch(pageSource, /file\.size <= STORY_PHOTO_MAX_UPLOAD_BYTES\) \{\s+return file/);
  assert.match(pageSource, /throw new Error\("photo-encode-failed"\)/);
  assert.match(pageSource, /throw new Error\("photo-compression-target-failed"\)/);
  assert.match(pageSource, /preparedPhoto\.size > STORY_PHOTO_TARGET_BYTES/);
  assert.match(styleSource, /\.place-story-photo-picker input \{ position: absolute; inset: 0;/);
});

test("review uploads bypass PWA caching and report mobile failure causes", () => {
  assert.match(workerSource, /if \(url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(pageSource, /fetch\(PLACE_STORIES_API, \{ method: "POST", body: form, cache: "no-store", credentials: "same-origin" \}\)/);
  assert.match(pageSource, /message === "photo-unsupported"/);
  assert.match(pageSource, /!navigator\.onLine/);
  assert.match(pageSource, /sendPlaceStoryUploadDiagnostic/);
  assert.match(pageSource, /오류 ID/);
  assert.match(storyRouteSource, /place_story_upload_diagnostics/);
  assert.match(storyRouteSource, /scope === "upload-diagnostics"/);
  assert.match(storyRouteSource, /user_agent AS userAgent/);
  assert.match(pageSource, /PLACE_STORIES_API}\?scope=upload-diagnostics/);
  assert.match(pageSource, /모바일 후기 업로드 오류/);
  assert.match(pageSource, /사진·후기 내용과 닉네임은 기록하지 않습니다/);
  assert.match(pageSource, /uploadDiagnosticErrorLabel/);
  assert.match(pageSource, /deleteUploadDiagnostic/);
  assert.match(pageSource, /clearUploadDiagnostics/);
  assert.match(pageSource, /전체 정리/);
  assert.match(storyRouteSource, /payload\?\.action === "clear-all"/);
  assert.match(storyRouteSource, /DELETE FROM place_story_upload_diagnostics WHERE id = \?/);
  assert.match(storyRouteSource, /owner authentication required/);
});

test("review place identity and multipart allowance avoid false mobile upload errors", () => {
  assert.match(pageSource, /selectedStoryPlaceName = selectedDirectoryPlace\?\.name \?\? selected\.name/);
  assert.match(pageSource, /form\.set\("placeName", selectedStoryPlaceName\)/);
  assert.match(storyRouteSource, /document\.directoryPlaces\.some/);
  assert.match(storyRouteSource, /MAX_MULTIPART_OVERHEAD_BYTES = 512 \* 1024/);
  assert.match(pageSource, /message === "request-too-large"/);
});
