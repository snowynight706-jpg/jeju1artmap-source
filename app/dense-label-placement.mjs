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

export function chooseDenseLabelPlacement({
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
}) {
  if (!options.length) return null;
  const groupIdSet = new Set(groupIds);
  return options.map((option, optionIndex) => {
    const rect = {
      left: option.x - width / 2,
      right: option.x + width / 2,
      top: option.y - height / 2,
      bottom: option.y + height / 2,
    };
    const segments = connectorSegmentsFor(option);
    const iconBoxHits = iconObstacles.filter((obstacle) => rectsOverlap(rect, obstacle.rect, 0.65));
    const labelBoxHits = labelObstacles.filter((obstacle) => !groupIdSet.has(obstacle.id) && rectsOverlap(rect, obstacle.rect, 0.45));
    const placedBoxHits = placedRects.filter((obstacle) => rectsOverlap(rect, obstacle, 0.45));
    const connectorIconHits = segments.reduce((count, segment) => count + iconObstacles.filter((obstacle) => (
      obstacle.id !== segment.elementId && segmentIntersectsRect(segment, obstacle.rect, obstacle.category === "landmark" ? 0.28 : 0.14)
    )).length, 0);
    const connectorLandmarkHits = segments.reduce((count, segment) => count + iconObstacles.filter((obstacle) => (
      obstacle.category === "landmark" && obstacle.id !== segment.elementId && segmentIntersectsRect(segment, obstacle.rect, 0.28)
    )).length, 0);
    const connectorLabelHits = segments.reduce((count, segment) => count + labelObstacles.filter((obstacle) => (
      !groupIdSet.has(obstacle.id) && segmentIntersectsRect(segment, obstacle.rect, 0.12)
    )).length, 0);
    const connectorPlacedBoxHits = segments.reduce((count, segment) => count + placedRects.filter((obstacle) => (
      segmentIntersectsRect(segment, obstacle, 0.16)
    )).length, 0);
    const placedConnectorBoxHits = placedSegments.filter((segment) => segmentIntersectsRect(segment, rect, 0.16)).length;
    const priorConnectorCrossings = segments.reduce((count, segment) => count + placedSegments.filter((placed) => segmentsCross(segment, placed)).length, 0);
    let internalConnectorCrossings = 0;
    for (let index = 0; index < segments.length; index += 1) {
      for (let other = index + 1; other < segments.length; other += 1) {
        if (segmentsCross(segments[index], segments[other])) internalConnectorCrossings += 1;
      }
    }
    const overflow = Math.max(0, -rect.left) + Math.max(0, rect.right - 100) + Math.max(0, -rect.top) + Math.max(0, rect.bottom - 100);
    const connectorDistance = segments.reduce((sum, segment) => sum + segmentLength(segment, mapAspect), 0);
    const centerDistance = Math.hypot(option.x - centerX, (option.y - centerY) / mapAspect);
    const iconBoxPenalty = iconBoxHits.reduce((score, obstacle) => score + (obstacle.category === "landmark" ? 50000 : 18000), 0);
    const collisionCount = iconBoxHits.length + labelBoxHits.length + placedBoxHits.length
      + connectorIconHits + connectorLabelHits + connectorPlacedBoxHits + placedConnectorBoxHits
      + priorConnectorCrossings + internalConnectorCrossings + Number(overflow > 0);
    return {
      ...option,
      rect,
      segments,
      hasCollision: collisionCount > 0,
      score: iconBoxPenalty
        + labelBoxHits.length * 16000
        + placedBoxHits.length * 22000
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
  }).sort((a, b) => a.score - b.score)[0];
}
