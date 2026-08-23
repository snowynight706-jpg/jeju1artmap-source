function trimmedText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function sameMapPlaceIdentity(left, right, normalizeName = trimmedText) {
  if (!left || !right) return false;
  const leftDirectoryId = trimmedText(left.directoryId);
  const rightDirectoryId = trimmedText(right.directoryId);
  if (leftDirectoryId && rightDirectoryId && leftDirectoryId === rightDirectoryId) return true;

  const leftName = normalizeName(trimmedText(left.name));
  const rightName = normalizeName(trimmedText(right.name));
  return Boolean(leftName && rightName && leftName === rightName);
}

export function ensureIndependentMapElementIdentity(elements, { recoverId }) {
  if (!Array.isArray(elements)) return [];
  const usedIds = new Set();
  const usedDirectoryIds = new Set();

  return elements.flatMap((element, index) => {
    const directoryId = trimmedText(element?.directoryId);
    if (directoryId && usedDirectoryIds.has(directoryId)) return [];

    const requestedId = trimmedText(element?.id);
    const id = requestedId && !usedIds.has(requestedId)
      ? requestedId
      : recoverId(element, index, usedIds);
    usedIds.add(id);
    if (directoryId) usedDirectoryIds.add(directoryId);

    return [{
      ...element,
      id,
      directoryId: directoryId || undefined,
    }];
  });
}
