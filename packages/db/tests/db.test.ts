import assert from "node:assert/strict";
import test from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { createDatabase, validateDatabaseUrl, withDatabase } from "../src/connection.ts";
import { createAuth } from "../src/auth.ts";
import * as schema from "../src/schema/index.ts";

const url = "postgresql://user:password@ep-example-pooler.eu-central-1.aws.neon.tech/app?sslmode=require";
const config = { secret: "test-only-secret-not-for-production-123456", baseURL: "http://localhost:8787" };

test("requires Neon pooling and TLS, without echoing credentials", () => {
  assert.equal(validateDatabaseUrl(url), url);
  for (const value of ["", "secret", url.replace("postgresql:", "https:"), url.replace("-pooler", ""), url.replace("require", "disable"), url.replace(".neon.tech", ".neon.tech.attacker.com"), url.replace("user:password@", "")]) {
    assert.throws(() => validateDatabaseUrl(value), (error: Error) => {
      assert.ok(!error.message.includes("password"));
      return true;
    });
  }
});

test("connection is lazy and closes without a query", async () => {
  const { db, close } = createDatabase(url);
  assert.ok(db.transaction);
  await close();
  assert.equal(await withDatabase(url, async () => "result"), "result");
  await assert.rejects(withDatabase(url, async () => { throw new Error("work failed"); }), /work failed/);
});

test("auth rejects unsafe configuration and keeps acquisition server-owned", async () => {
  await withDatabase(url, async (db) => {
    assert.throws(() => createAuth(db, { ...config, secret: "short" }), /32/);
    assert.throws(() => createAuth(db, { ...config, baseURL: "not a URL" }), /HTTP/);
    assert.throws(() => createAuth(db, { ...config, baseURL: "http://example.com" }), /HTTPS/);
    const auth = createAuth(db, config);
    assert.equal(auth.options.emailAndPassword?.enabled, false);
    assert.equal(auth.options.account?.accountLinking?.enabled, false);
    for (const field of Object.values(auth.options.user!.additionalFields!)) {
      assert.equal(field.input, false);
      assert.equal(field.returned, false);
    }
  });
});

test("schema provides core auth keys, cascades, and acquisition consistency", () => {
  assert.deepEqual(Object.keys(schema).sort(), ["account", "session", "user", "verification"]);
  for (const table of [schema.account, schema.session]) {
    assert.equal(getTableConfig(table).foreignKeys[0]?.onDelete, "cascade");
  }
  assert.ok(getTableConfig(schema.user).checks.some((check) => check.name === "users_acquisition_state"));
  assert.equal(schema.user.email.notNull, true);
  assert.equal(schema.user.acquisitionRef.notNull, false);
});
