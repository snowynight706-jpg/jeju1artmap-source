function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function completeReviewStatuses(value) {
  if (!isRecord(value)) return { document: value, completedCount: 0 };
  let completedCount = 0;
  const elements = Array.isArray(value.elements) ? value.elements.map((item) => {
    if (!isRecord(item)) return item;
    if (item.status !== "approved") completedCount += 1;
    return { ...item, status: "approved" };
  }) : [];
  const assets = Array.isArray(value.assets) ? value.assets.map((item) => {
    if (!isRecord(item)) return item;
    if (item.status !== "approved") completedCount += 1;
    return { ...item, status: "approved" };
  }) : [];
  return { document: { ...value, elements, assets }, completedCount };
}
