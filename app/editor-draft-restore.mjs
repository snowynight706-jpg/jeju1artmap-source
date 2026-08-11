export function chooseEditorRestoreSource({
  localAutosave,
  canRestoreLocalAutosave,
  serverDraftDocument,
  serverDraftUpdatedAt,
  publishedAt,
}) {
  const publishedTime = Date.parse(publishedAt ?? "") || 0;
  const draftTime = Date.parse(serverDraftUpdatedAt ?? "") || 0;
  const serverDraft = serverDraftDocument && draftTime >= publishedTime ? serverDraftDocument : null;
  const localTime = Date.parse(localAutosave?.savedAt ?? "") || 0;
  if (canRestoreLocalAutosave && (!serverDraft || localTime > draftTime)) {
    return { document: localAutosave?.document ?? null, source: "local" };
  }
  if (serverDraft) return { document: serverDraft, source: "server" };
  return { document: null, source: "none" };
}
