export type NormalizedRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function rectsOverlap(a: NormalizedRect, b: NormalizedRect, margin = 0.18) {
  return a.left < b.right + margin
    && a.right > b.left - margin
    && a.top < b.bottom + margin
    && a.bottom > b.top - margin;
}
