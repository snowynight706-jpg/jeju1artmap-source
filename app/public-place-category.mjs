export function placesForPublicCategory(items, categoryId, eventLinkedIds = new Set()) {
  const nativeItems = items.filter((item) => item.categoryId === categoryId);
  if (categoryId !== "culture" || eventLinkedIds.size === 0) return nativeItems;

  const eventItems = items.filter((item) => (
    item.categoryId !== "culture"
    && eventLinkedIds.has(item.id)
  ));
  return [...nativeItems, ...eventItems];
}
