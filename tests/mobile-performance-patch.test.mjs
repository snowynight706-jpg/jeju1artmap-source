import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readAppClientSource } from "./source-fixtures.mjs";

const pageSource = await readAppClientSource();
const cssSource = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const serviceWorkerSource = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");

test("public touch pan and pinch stay composited while admin pan uses the restored direct path", () => {
  assert.match(pageSource, /queueTouchMapTransform\(nextZoom, nextPan\)/);
  assert.match(pageSource, /touchTransformFrameRef\.current = window\.requestAnimationFrame/);
  assert.match(pageSource, /stage\.style\.transform = mapStageGestureTransform\(scale, viewport\.clientWidth\)/);
  assert.match(pageSource, /commitTouchMapTransform\(\)/);
  assert.match(pageSource, /applyTouchMapTransform\(zoomRef\.current, panRef\.current\)/);
  assert.doesNotMatch(pageSource, /queueTouchMapTransform\(nextZoom, nextPan\);\s*setZoom\(nextZoom\)/);
  assert.match(pageSource, /panInteractionRef = useRef/);
  assert.match(pageSource, /panInteractionRef\.current = \{[\s\S]{0,240}viewportRef\.current\?\.classList\.add\("is-panning"\)/);
  assert.match(pageSource, /if \(publicLayoutAccess === "editor"\) \{[\s\S]{0,260}setInteraction\(\{[\s\S]{0,60}type: "pan"/);
  assert.match(pageSource, /if \(interaction\.type === "pan"\) \{[\s\S]{0,180}setEditorMapPan/);
  assert.doesNotMatch(pageSource, /const \[pan, setPan\] = useState/);
});

test("mobile map manipulation avoids layout-heavy effects per frame", () => {
  assert.match(pageSource, /translate3d\(calc\(-50% \+ \$\{nextPan\.x\}px\), calc\(-50% \+ \$\{nextPan\.y\}px\), 0\)/);
  assert.match(cssSource, /\.map-viewport\.is-direct-manipulation \.map-stage[\s\S]{0,80}will-change: transform/);
  assert.match(cssSource, /is-direct-manipulation\) \.placed-asset \{ filter: none; \}/);
});

test("map labels leave the paint path only after drag or zoom actually starts", () => {
  assert.match(pageSource, /pendingTouchTransformRef\.current = \{ zoom: nextZoom, pan: nextPan \};\s*viewportRef\.current\?\.classList\.add\("is-map-labels-suspended"\)/);
  assert.match(pageSource, /classList\.remove\("is-direct-manipulation", "is-map-labels-suspended"\)/);
  assert.match(pageSource, /viewport\.classList\.add\("is-map-labels-suspended"\)/);
  assert.match(cssSource, /\.label, \.dense-label-layer, \.dense-label-connector \{ transition: opacity var\(--motion-label\)/);
  assert.match(cssSource, /\.map-viewport:is\(\.is-map-labels-suspended, \.is-zooming\) :is\(\.label, \.dense-label-layer, \.dense-label-connector\) \{ visibility: hidden; opacity: 0; pointer-events: none; transition-duration: 0s; \}/);
  assert.doesNotMatch(pageSource, /beginTouchMapTransform[\s\S]{0,500}classList\.add\("is-map-labels-suspended"\)/);
});

test("touch transform handoff keeps the compositor frame until the committed layout effect", () => {
  assert.match(pageSource, /touchLayerReleaseFrameRef\.current = window\.requestAnimationFrame/);
  assert.match(pageSource, /touchLayerReleaseTimerRef\.current = window\.setTimeout/);
  assert.match(pageSource, /activeTouchPointersRef\.current\.size > 0 \|\| pinchGestureRef\.current/);
  assert.match(pageSource, /panInteractionRef\.current = null;[\s\S]{0,180}scheduleTouchLayerRelease\(\)/);
  assert.match(pageSource, /pendingTouchCommitRef\.current = \{ zoom: committedZoom, pan: committedPan, zoomChanged \};\s*setZoom\(committedZoom\)/);
  assert.match(pageSource, /const pendingCommit = pendingTouchCommitRef\.current;[\s\S]{0,260}setMapLayoutZoom\(pendingCommit\.zoom\);\s*stageRef\.current\?\.style\.removeProperty\("transform"\)/);
  assert.match(pageSource, /stageRef\.current\?\.style\.removeProperty\("transform"\)[\s\S]{0,260}scheduleTouchLayerRelease\(/);
  assert.doesNotMatch(pageSource, /startTransition\(\(\) => \{\s*setZoom\(committedZoom\);\s*\}\)/);
  assert.match(pageSource, /const mapScaleRatio = Math\.max\(1, zoom \/ Math\.max\(fitZoom, 0\.22\)\)/);
  assert.doesNotMatch(pageSource, /restartMapLabelHandoff|labelHandoffScaleRef/);
});

test("programmatic focus animates compositor transforms and commits layout once", () => {
  assert.match(cssSource, /\.map-stage \{[^}]*width: var\(--map-stage-width, 72%\)/);
  assert.match(pageSource, /stageWrap\.style\.transition = "transform \.3s/);
  assert.match(pageSource, /stage\.style\.transition = "transform \.3s/);
  assert.match(pageSource, /stage\.style\.transform = mapStageGestureTransform\(target\.zoom \/ currentLayoutZoom, viewportWidth\)/);
  assert.match(pageSource, /setMapLayoutZoom\(target\.zoom\)/);
  assert.doesNotMatch(cssSource, /\.map-viewport\.is-programmatic-focus \.map-stage \{ transition: width/);
  assert.doesNotMatch(pageSource, /style=\{\{ aspectRatio: `\$\{MAP_ASPECT\}`, width:/);
});

test("public label density follows settled zoom while admin labels follow direct zoom", () => {
  assert.match(pageSource, /labelRenderZoom = publicLayoutAccess === "viewer" \? settledLabelZoom : zoom/);
  assert.match(pageSource, /labelDetailRatio = labelRenderZoom \/ Math\.max\(fitZoom, 0\.22\)/);
  assert.match(pageSource, /optionalLabelBudgetForScale\([\s\S]{0,80}labelRenderZoom,[\s\S]{0,40}fitZoom,/);
  assert.match(pageSource, /const labelFrame = window\.requestAnimationFrame\(\(\) => \{[\s\S]{0,80}setSettledLabelZoom\(zoom\);[\s\S]{0,180}setSettledLabelPan/);
  assert.doesNotMatch(pageSource, /setLabelRenderPhase|requestIdleCallback\(mountLabelDetails/);
  assert.match(pageSource, /stageLabelIds=\{labelContentReady \? stageLabelIds : EMPTY_MAP_ELEMENT_IDS\}/);
  assert.match(pageSource, /labelDetailsReady && <MapConnectorLayer/);
  assert.match(pageSource, /labelDetailsReady && <DenseLabelLayer/);
  assert.match(pageSource, /<MapElementLayer[\s\S]*?visibleElements=\{renderedMapElements\}\s+zoom=\{labelRenderZoom\}/);
  assert.match(cssSource, /--motion-label: \.12s/);
  assert.match(cssSource, /\.map-viewport\.editor-label-motion \{ --motion-label: \.28s; \}/);
});

test("low-tier mobile keeps the compact map visible while the decoded map is promoted", () => {
  assert.match(pageSource, /const uploadedBaseMapLayers = baseMapDisplayLayers\(\{/);
  assert.match(pageSource, /baseMapResolutionUpgradeSrc/);
  assert.match(pageSource, /lowTierBaseMapNeedsHighResolution\(\{/);
  assert.match(pageSource, /await image\.decode\(\)/);
  assert.match(pageSource, /setDecodedHighResolutionBaseMapSource\(highResolutionBaseMapSource\)/);
  assert.match(pageSource, /className="base-map base-map-resolution-upgrade"/);
  assert.match(pageSource, /setCommittedBaseMapUpgradeSource\(baseMapPrimarySrc\)/);
  assert.match(pageSource, /baseMapPrimarySrc === uploadedBaseMap\?\.screen4096Url[\s\S]{0,140}setDecodedHighResolutionBaseMapSource\(baseMapPrimarySrc\)/);
  assert.match(pageSource, /setCommittedBaseMapUpgradeSource\(pendingBaseMapUpgradeSrc\)/);
  assert.match(cssSource, /\.base-map-resolution-upgrade \{ opacity: 0; transition: opacity \.14s linear; \}/);
  assert.match(cssSource, /\.base-map-resolution-upgrade\.is-ready \{ opacity: 1; \}/);
  assert.doesNotMatch(pageSource, /setTimeout\(\(\) => setStartupRevealReady\(true\), 320\)/);
  assert.match(pageSource, /requestAnimationFrame\(\(\) => setStartupRevealReady\(true\)\)/);
});

test("public mobile map culls only far-offscreen render nodes after a settled gesture", () => {
  assert.match(pageSource, /const \[mapRenderPan, setMapRenderPan\] = useState\(\{ x: 0, y: 0 \}\)/);
  assert.match(pageSource, /setMapRenderPan\(\(current\) => \([\s\S]{0,160}current\.x === committedPan\.x && current\.y === committedPan\.y \? current : committedPan/);
  assert.match(pageSource, /publicLayoutAccess !== "viewer"[\s\S]{0,180}viewportDimensions\.width > 760/);
  assert.match(pageSource, /const overscanX = Math\.max\(renderBudget\.minimumOverscan, viewportDimensions\.width \* renderBudget\.overscanRatio\)/);
  assert.match(pageSource, /const mobileMapElementPartition = useMemo/);
  assert.match(pageSource, /const renderedMapElements = mobileMapElementPartition\.rendered/);
  assert.match(pageSource, /<MapElementLayer[\s\S]*?visibleElements=\{renderedMapElements\}/);
  assert.match(pageSource, /const publicPlaceItems = useMemo<[\s\S]{0,900}visibleElements\.forEach/);
});

test("versioned immutable images use cache-first without caching mutable APIs", () => {
  assert.match(serviceWorkerSource, /CACHE_VERSION = "2026-08-28-v17"/);
  assert.match(serviceWorkerSource, /url\.searchParams\.has\("v"\)[\s\S]{0,160}cacheFirstVersionedImage/);
  assert.match(serviceWorkerSource, /url\.pathname\.startsWith\("\/api\/"\)\) return/);
  assert.match(serviceWorkerSource, /IMAGE_TRIM_INTERVAL = 12/);
  assert.match(serviceWorkerSource, /trimImageCachePeriodically/);
});
