function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function distanceProgress(fromX, fromY, toX, toY, mapAspect = 1) {
  const safeAspect = Math.max(Math.abs(mapAspect), 0.0001);
  const distance = Math.hypot(toX - fromX, (toY - fromY) / safeAspect);
  const progress = clamp((distance - 1.5) / 10.5, 0, 1);
  return progress * progress * (3 - 2 * progress);
}

export function distanceAwareConnectorOpacity(fromX, fromY, toX, toY, mapAspect = 1) {
  const eased = distanceProgress(fromX, fromY, toX, toY, mapAspect);
  return Math.round((0.34 + eased * 0.58) * 1000) / 1000;
}

export function distanceAwareConnectorWidth(fromX, fromY, toX, toY, mapAspect = 1, maximumWidth = 2.5) {
  const eased = distanceProgress(fromX, fromY, toX, toY, mapAspect);
  const safeMaximum = Math.max(1.1, Number.isFinite(maximumWidth) ? maximumWidth : 2.5);
  return Math.round((1.1 + eased * (safeMaximum - 1.1)) * 1000) / 1000;
}
