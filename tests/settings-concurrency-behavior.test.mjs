import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sourceUrl = new URL("../app/api/settings-concurrency.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourceUrl.pathname,
  reportDiagnostics: true,
});
const transpileErrors = (transpiled.diagnostics ?? []).filter(
  (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
);
assert.deepEqual(transpileErrors, []);

const concurrencyModule = await import(
  `data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`
);
const {
  SettingsConflictError,
  expectedSettingsRevision,
  settingsConflictResponse,
  withSettingsWriteLock,
} = concurrencyModule;

class FakeD1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new FakeD1Statement(this.db, this.sql, values);
  }

  first() {
    return this.db.first(this);
  }

  run() {
    return this.db.run(this);
  }
}

class FakeD1Database {
  constructor() {
    this.revisions = new Map();
    this.locks = new Map();
    this.revisionCommitGate = null;
  }

  prepare(sql) {
    return new FakeD1Statement(this, sql);
  }

  holdNextRevisionCommit() {
    let markStarted;
    let release;
    const started = new Promise((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise((resolve) => {
      release = resolve;
    });
    this.revisionCommitGate = { markStarted, released };
    return { started, release };
  }

  async batch(statements) {
    const commitsRevision = statements.some((statement) =>
      statement.sql.includes("INSERT INTO settings_resource_revisions"),
    );
    if (commitsRevision && this.revisionCommitGate) {
      const gate = this.revisionCommitGate;
      this.revisionCommitGate = null;
      gate.markStarted();
      await gate.released;
    }
    for (const statement of statements) await this.execute(statement);
    return statements.map(() => ({ meta: { changes: 0 } }));
  }

  async first(statement) {
    if (statement.sql.includes("SELECT revision FROM settings_resource_revisions")) {
      const [resource] = statement.values;
      const revision = this.revisions.get(resource);
      return revision == null ? null : { revision };
    }
    throw new Error(`Unexpected first statement: ${statement.sql}`);
  }

  async run(statement) {
    if (statement.sql.includes("INSERT INTO settings_resource_locks")) {
      const [resource, token, expiresAt, now] = statement.values;
      const current = this.locks.get(resource);
      if (current && current.expiresAt > now) return { meta: { changes: 0 } };
      this.locks.set(resource, { token, expiresAt });
      return { meta: { changes: 1 } };
    }
    if (statement.sql.includes("DELETE FROM settings_resource_locks")) {
      const [resource, token] = statement.values;
      if (this.locks.get(resource)?.token !== token) return { meta: { changes: 0 } };
      this.locks.delete(resource);
      return { meta: { changes: 1 } };
    }
    return this.execute(statement);
  }

  async execute(statement) {
    if (statement.sql.startsWith("CREATE TABLE")) return { meta: { changes: 0 } };
    if (statement.sql.includes("INSERT INTO settings_resource_revisions")) {
      const [resource, revision] = statement.values;
      this.revisions.set(resource, revision);
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unexpected batch statement: ${statement.sql}`);
  }
}

function saveSettings(db, expectedRevision) {
  return withSettingsWriteLock({
    db,
    resource: "dense-label-settings",
    expectedRevision,
    actor: "test-admin",
    buildStatements: () => [],
    result: (revision, updatedAt) => ({ revision, updatedAt }),
  });
}

test("settings revision input accepts only non-negative integers", () => {
  assert.equal(expectedSettingsRevision({ revision: 0 }), 0);
  assert.equal(expectedSettingsRevision({ revision: 7 }), 7);
  for (const revision of [-1, 1.5, "1", null, undefined]) {
    assert.equal(expectedSettingsRevision({ revision }), null);
  }
});

test("two simultaneous settings saves allow one writer and return a 409 conflict for the other", async () => {
  const db = new FakeD1Database();
  const gate = db.holdNextRevisionCommit();
  const firstSave = saveSettings(db, 0);
  await gate.started;

  const secondError = await saveSettings(db, 0).then(
    () => null,
    (error) => error,
  );
  gate.release();
  const firstResult = await firstSave;

  assert.ok(secondError instanceof SettingsConflictError);
  assert.equal(secondError.currentRevision, 0);
  const conflictResponse = settingsConflictResponse(secondError);
  assert.equal(conflictResponse.status, 409);
  assert.deepEqual(await conflictResponse.json(), {
    error: "settings are being changed by another administrator",
    conflict: true,
    revision: 0,
  });
  assert.equal(firstResult.revision, 1);
  assert.equal(db.revisions.get("dense-label-settings"), 1);
  assert.equal(db.locks.size, 0);
});

test("a stale revision is rejected with the latest revision and the lock remains reusable", async () => {
  const db = new FakeD1Database();
  assert.equal((await saveSettings(db, 0)).revision, 1);

  const staleError = await saveSettings(db, 0).then(
    () => null,
    (error) => error,
  );
  assert.ok(staleError instanceof SettingsConflictError);
  assert.equal(staleError.currentRevision, 1);
  assert.equal(db.locks.size, 0);

  assert.equal((await saveSettings(db, 1)).revision, 2);
  assert.equal(db.revisions.get("dense-label-settings"), 2);
  assert.equal(db.locks.size, 0);
});

test("a failed settings write always releases its named lock", async () => {
  const db = new FakeD1Database();
  await assert.rejects(
    withSettingsWriteLock({
      db,
      resource: "placement-settings",
      expectedRevision: 0,
      actor: "test-admin",
      buildStatements: () => {
        throw new Error("simulated write failure");
      },
      result: () => null,
    }),
    /simulated write failure/,
  );
  assert.equal(db.locks.size, 0);
});
