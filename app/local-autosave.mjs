export function parseVersionedLocalAutosave(raw) {
  const parsed = JSON.parse(raw);
  if (parsed && typeof parsed === "object" && parsed.document && Array.isArray(parsed.document.elements)) {
    return {
      document: parsed.document,
      baseRevision: typeof parsed.baseRevision === "number" ? parsed.baseRevision : null,
    };
  }
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.elements)) {
    return { document: parsed, baseRevision: null };
  }
  return null;
}

export function shouldRestoreLocalAutosave(autosave, hasPublishedServerDocument, serverRevision) {
  if (!autosave) return false;
  if (!hasPublishedServerDocument) return true;
  return autosave.baseRevision === serverRevision;
}
