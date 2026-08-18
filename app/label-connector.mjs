function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function distanceAwareConnectorOpacity(fromX, fromY, toX, toY, mapAspect = 1) {
  const safeAspect = Math.max(Math.abs(mapAspect), 0.0001);
  const distance = Math.hypot(toX - fromX, (toY - fromY) / safeAspect);
  const progress = clamp((distance - 1.5) / 10.5, 0, 1);
  const eased = progress * progress * (3 - 2 * progress);
  return Math.round((0.34 + eased * 0.58) * 1000) / 1000;
}
