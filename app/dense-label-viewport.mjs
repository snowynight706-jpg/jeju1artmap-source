function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
}

export function publicDenseLabelViewport({
  panX = 0,
  panY = 0,
  zoom = 1,
  stageWidth = 1,
  stageHeight = 1,
  viewportWidth = 1,
  viewportHeight = 1,
  paddingX = 0,
  paddingY = 0,
} = {}) {
  const renderedWidth = Math.max(1, stageWidth * Math.max(zoom, 0.01));
  const renderedHeight = Math.max(1, stageHeight * Math.max(zoom, 0.01));
  const rawLeft = 50 + (paddingX - viewportWidth / 2 - panX) / renderedWidth * 100;
  const rawRight = 50 + (viewportWidth / 2 - paddingX - panX) / renderedWidth * 100;
  const rawTop = 50 + (paddingY - viewportHeight / 2 - panY) / renderedHeight * 100;
  const rawBottom = 50 + (viewportHeight / 2 - paddingY - panY) / renderedHeight * 100;
  const left = clamp(Math.min(rawLeft, rawRight), 0, 100);
  const right = clamp(Math.max(rawLeft, rawRight), 0, 100);
  const top = clamp(Math.min(rawTop, rawBottom), 0, 100);
  const bottom = clamp(Math.max(rawTop, rawBottom), 0, 100);
  return {
    left,
    right: Math.max(left, right),
    top,
    bottom: Math.max(top, bottom),
  };
}

export function fitDenseLabelCenter({ x, y, width, height, bounds }) {
  const halfWidth = Math.max(0, width) / 2;
  const halfHeight = Math.max(0, height) / 2;
  const minimumX = bounds.left + halfWidth;
  const maximumX = bounds.right - halfWidth;
  const minimumY = bounds.top + halfHeight;
  const maximumY = bounds.bottom - halfHeight;
  return {
    x: minimumX <= maximumX ? clamp(x, minimumX, maximumX) : (bounds.left + bounds.right) / 2,
    y: minimumY <= maximumY ? clamp(y, minimumY, maximumY) : (bounds.top + bounds.bottom) / 2,
  };
}
