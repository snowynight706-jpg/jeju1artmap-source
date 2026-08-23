import assert from "node:assert/strict";
import test from "node:test";

import { chooseEditorRestoreSource } from "../app/editor/persistence/editor-draft-restore.mjs";

test("a current server draft is the cross-device source of truth", () => {
  const server = { elements: [{ id: "server" }] };
  const local = { document: { elements: [{ id: "local" }] }, savedAt: "2026-08-11T09:00:00.000Z" };
  const result = chooseEditorRestoreSource({
    localAutosave: local,
    canRestoreLocalAutosave: true,
    serverDraftDocument: server,
    serverDraftUpdatedAt: "2026-08-11T10:00:00.000Z",
    publishedAt: "2026-08-11T08:00:00.000Z",
  });

  assert.equal(result.source, "server");
  assert.equal(result.document, server);
});

test("a newer device recovery copy wins only until it is saved to the server", () => {
  const localDocument = { elements: [{ id: "local-newer" }] };
  const result = chooseEditorRestoreSource({
    localAutosave: { document: localDocument, savedAt: "2026-08-11T11:00:00.000Z" },
    canRestoreLocalAutosave: true,
    serverDraftDocument: { elements: [{ id: "server-older" }] },
    serverDraftUpdatedAt: "2026-08-11T10:00:00.000Z",
    publishedAt: "2026-08-11T08:00:00.000Z",
  });

  assert.equal(result.source, "local");
  assert.equal(result.document, localDocument);
});

test("a draft older than the published layout is ignored", () => {
  const result = chooseEditorRestoreSource({
    localAutosave: null,
    canRestoreLocalAutosave: false,
    serverDraftDocument: { elements: [{ id: "stale-draft" }] },
    serverDraftUpdatedAt: "2026-08-11T07:00:00.000Z",
    publishedAt: "2026-08-11T08:00:00.000Z",
  });

  assert.deepEqual(result, { document: null, source: "none" });
});
