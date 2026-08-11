function countFromResult(result) {
  const value = Number(result?.results?.[0]?.count ?? 0);
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

export function contentSummaryFromBatchResults(reviewResult, eventResult, placeRequestResult, refreshedAt) {
  return {
    reviews: countFromResult(reviewResult),
    events: countFromResult(eventResult),
    placeRequests: countFromResult(placeRequestResult),
    refreshedAt,
  };
}
