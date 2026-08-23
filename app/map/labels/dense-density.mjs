export const PERSISTENT_DENSE_MIN_ITEMS = 4;
export const PERSISTENT_DENSE_SCALE = 0.55;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function denseLabelConnections(candidates, {
  mapAspect = 1,
  densityScale = 1,
  persistentScale = PERSISTENT_DENSE_SCALE,
  persistentMinimumItems = PERSISTENT_DENSE_MIN_ITEMS,
} = {}) {
  if (candidates.length < 2) return { adaptiveEdges: [], persistentGroups: [] };
  const density = clamp(densityScale, 0.24, 1.6);
  const persistentDensity = clamp(persistentScale, 0.24, 1.6);
  const cellSize = Math.max(1.25, 6.2 * Math.max(density, persistentDensity));
  const spatialBuckets = new Map();
  const adaptiveEdges = [];
  const persistentNeighbors = candidates.map(() => new Set());

  candidates.forEach((candidate, index) => {
    const cellX = Math.floor(candidate.x / cellSize);
    const cellY = Math.floor((candidate.y / mapAspect) / cellSize);
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      const nearby = spatialBuckets.get(`${cellX + offsetX}:${cellY + offsetY}`) ?? [];
      nearby.forEach((other) => {
        const dx = candidate.x - candidates[other].x;
        const dy = (candidate.y - candidates[other].y) / mapAspect;
        const distance = Math.hypot(dx, dy);
        const baseReach = Math.min(6.2, 2.4 + (candidate.name.length + candidates[other].name.length) * 0.11);
        if (distance <= baseReach * density) adaptiveEdges.push([index, other]);
        if (distance <= baseReach * persistentDensity) {
          persistentNeighbors[index].add(other);
          persistentNeighbors[other].add(index);
        }
      });
    }
    const key = `${cellX}:${cellY}`;
    const bucket = spatialBuckets.get(key);
    if (bucket) bucket.push(index);
    else spatialBuckets.set(key, [index]);
  });

  const minimumNeighbors = Math.max(1, persistentMinimumItems - 1);
  const denseCores = persistentNeighbors.flatMap((neighbors, index) => neighbors.size >= minimumNeighbors ? [index] : []);
  if (!denseCores.length) return { adaptiveEdges, persistentGroups: [] };
  const parent = candidates.map((_, index) => index);
  const find = (index) => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const unite = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[rootB] = rootA;
  };
  denseCores.forEach((core) => persistentNeighbors[core].forEach((neighbor) => unite(core, neighbor)));
  const members = new Set(denseCores.flatMap((core) => [core, ...persistentNeighbors[core]]));
  const groups = new Map();
  members.forEach((index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), index]);
  });
  const persistentGroups = [...groups.values()].filter((group) => group.length >= persistentMinimumItems);
  return { adaptiveEdges, persistentGroups };
}
