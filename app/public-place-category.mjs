export function placesForPublicCategory(items, categoryId, eventLinkedIds = new Set()) {
  const nativeItems = items.filter((item) => (
    item.categoryId === categoryId
    || (categoryId === "shop" && item.place?.additionalCategories?.includes("goods-shop"))
  ));
  if (categoryId !== "culture") return nativeItems;

  const additionalCultureItems = items.filter((item) => (
    item.categoryId !== "culture"
    && item.place?.additionalCategories?.includes("multi-cultural")
  ));
  const includedIds = new Set([...nativeItems, ...additionalCultureItems].map((item) => item.id));

  const eventItems = items.filter((item) => (
    item.categoryId !== "culture"
    && eventLinkedIds.has(item.id)
    && !includedIds.has(item.id)
  ));
  return [...nativeItems, ...additionalCultureItems, ...eventItems];
}
