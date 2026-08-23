const DEFAULT_GAPS = [0.55, 1.2, 2.1];
const SIDE_SHIFTS = [0, -0.28, 0.28];

function rectsOverlap(a, b, margin = 0) {
  return a.left < b.right + margin
    && a.right > b.left - margin
    && a.top < b.bottom + margin
    && a.bottom > b.top - margin;
}

function segmentLength(segment, mapAspect = 1) {
  return Math.hypot(segment.toX - segment.fromX, (segment.toY - segment.fromY) / mapAspect);
}

export function segmentIntersectsRect(segment, rect, margin = 0) {
  const expanded = {
    left: rect.left - margin,
    right: rect.right + margin,
    top: rect.top - margin,
    bottom: rect.bottom + margin,
  };
  const dx = segment.toX - segment.fromX;
  const dy = segment.toY - segment.fromY;
  let minimum = 0;
  let maximum = 1;
  for (const [direction, distance] of [
    [-dx, segment.fromX - expanded.left],
    [dx, expanded.right - segment.fromX],
    [-dy, segment.fromY - expanded.top],
    [dy, expanded.bottom - segment.fromY],
  ]) {
    if (Math.abs(direction) < 1e-9) {
      if (distance < 0) return false;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) minimum = Math.max(minimum, ratio);
    else maximum = Math.min(maximum, ratio);
    if (minimum > maximum) return false;
  }
  return true;
}

export function segmentsCross(a, b) {
  const orientation = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const a1 = orientation(a.fromX, a.fromY, a.toX, a.toY, b.fromX, b.fromY);
  const a2 = orientation(a.fromX, a.fromY, a.toX, a.toY, b.toX, b.toY);
  const b1 = orientation(b.fromX, b.fromY, b.toX, b.toY, a.fromX, a.fromY);
  const b2 = orientation(b.fromX, b.fromY, b.toX, b.toY, a.toX, a.toY);
  return a1 * a2 < -0.0001 && b1 * b2 < -0.0001;
}

export function denseLabelPlacementOptions({ minX, maxX, minY, maxY, width, height }) {
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const horizontalSpan = Math.min(12, Math.max(4, maxX - minX, width * 0.55));
  const verticalSpan = Math.min(10, Math.max(3, maxY - minY, height * 0.7));
  const options = [];
  DEFAULT_GAPS.forEach((gap) => {
    SIDE_SHIFTS.forEach((shift) => {
      options.push(
        { x: centerX + horizontalSpan * shift, y: minY - height / 2 - gap, gap },
        { x: centerX + horizontalSpan * shift, y: maxY + height / 2 + gap, gap },
        { x: minX - width / 2 - gap, y: centerY + verticalSpan * shift, gap },
        { x: maxX + width / 2 + gap, y: centerY + verticalSpan * shift, gap },
      );
    });
    options.push(
      { x: minX - width / 2 - gap, y: minY - height / 2 - gap, gap },
      { x: maxX + width / 2 + gap, y: minY - height / 2 - gap, gap },
      { x: minX - width / 2 - gap, y: maxY + height / 2 + gap, gap },
      { x: maxX + width / 2 + gap, y: maxY + height / 2 + gap, gap },
    );
  });
  return options;
}

/**
 * The placement scorer is shared with TypeScript UI code while remaining a
 * plain module for Node regression tests. Keep its structural inputs open.
 * @param {any} configuration
 * @returns {any}
 */
export function chooseDenseLabelPlacement(configuration) {
  const {
    options,
    width,
    height,
    centerX,
    centerY,
    mapAspect = 1,
    groupIds = [],
    connectorSegmentsFor,
    iconObstacles = [],
    labelObstacles = [],
    placedRects = [],
    placedSegments = [],
  } = configuration;
  if (!options.length) return null;
  const groupIdSet = new Set(groupIds);
  let best = null;
  options.forEach((option, optionIndex) => {
    const rect = {
      left: option.x - width / 2,
      right: option.x + width / 2,
      top: option.y - height / 2,
      bottom: option.y + height / 2,
    };
    const segments = connectorSegmentsFor(option);
    let iconBoxHits = 0;
    let iconBoxPenalty = 0;
    for (const obstacle of iconObstacles) {
      if (!rectsOverlap(rect, obstacle.rect, 0.65)) continue;
      iconBoxHits += 1;
      iconBoxPenalty += obstacle.category === "landmark" ? 50000 : 18000;
    }
    let labelBoxHits = 0;
    for (const obstacle of labelObstacles) {
      if (!groupIdSet.has(obstacle.id) && rectsOverlap(rect, obstacle.rect, 0.45)) labelBoxHits += 1;
    }
    let placedBoxHits = 0;
    for (const obstacle of placedRects) {
      if (rectsOverlap(rect, obstacle, 0.45)) placedBoxHits += 1;
    }
    let connectorIconHits = 0;
    let connectorLandmarkHits = 0;
    let connectorLabelHits = 0;
    let connectorPlacedBoxHits = 0;
    let priorConnectorCrossings = 0;
    let connectorDistance = 0;
    for (const segment of segments) {
      connectorDistance += segmentLength(segment, mapAspect);
      for (const obstacle of iconObstacles) {
        if (obstacle.id === segment.elementId) continue;
        const landmark = obstacle.category === "landmark";
        if (!segmentIntersectsRect(segment, obstacle.rect, landmark ? 0.28 : 0.14)) continue;
        connectorIconHits += 1;
        if (landmark) connectorLandmarkHits += 1;
      }
      for (const obstacle of labelObstacles) {
        if (!groupIdSet.has(obstacle.id) && segmentIntersectsRect(segment, obstacle.rect, 0.12)) connectorLabelHits += 1;
      }
      for (const obstacle of placedRects) {
        if (segmentIntersectsRect(segment, obstacle, 0.16)) connectorPlacedBoxHits += 1;
      }
      for (const placed of placedSegments) {
        if (segmentsCross(segment, placed)) priorConnectorCrossings += 1;
      }
    }
    let placedConnectorBoxHits = 0;
    for (const segment of placedSegments) {
      if (segmentIntersectsRect(segment, rect, 0.16)) placedConnectorBoxHits += 1;
    }
    let internalConnectorCrossings = 0;
    for (let index = 0; index < segments.length; index += 1) {
      for (let other = index + 1; other < segments.length; other += 1) {
        if (segmentsCross(segments[index], segments[other])) internalConnectorCrossings += 1;
      }
    }
    const overflow = Math.max(0, -rect.left) + Math.max(0, rect.right - 100) + Math.max(0, -rect.top) + Math.max(0, rect.bottom - 100);
    const centerDistance = Math.hypot(option.x - centerX, (option.y - centerY) / mapAspect);
    const collisionCount = iconBoxHits + labelBoxHits + placedBoxHits
      + connectorIconHits + connectorLabelHits + connectorPlacedBoxHits + placedConnectorBoxHits
      + priorConnectorCrossings + internalConnectorCrossings + Number(overflow > 0);
    const candidate = {
      ...option,
      rect,
      segments,
      hasCollision: collisionCount > 0,
      score: iconBoxPenalty
        + labelBoxHits * 16000
        + placedBoxHits * 22000
        + connectorIconHits * 5200
        + connectorLandmarkHits * 7200
        + connectorLabelHits * 6800
        + connectorPlacedBoxHits * 7600
        + placedConnectorBoxHits * 7600
        + priorConnectorCrossings * 4800
        + internalConnectorCrossings * 3000
        + overflow * 12000
        + (option.gap ?? 0) * 720
        + centerDistance * 42
        + connectorDistance * 12
        + optionIndex * 0.01,
    };
    if (!best || candidate.score < best.score) best = candidate;
  });
  return best;
}
