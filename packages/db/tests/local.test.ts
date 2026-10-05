import assert from "node:assert/strict";
import test from "node:test";
import { createLocalDatabase, validateLocalDatabaseUrl, withLocalDatabase } from "../src/local.ts";
import { createAuth } from "../src/auth.ts";

const url = "postgresql://milo:milo_dev@127.0.0.1:5432/milo";

test("local transport accepts loopback only without leaking credentials", () => {
  for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
    assert.equal(validateLocalDatabaseUrl(url.replace("127.0.0.1", host)), url.replace("127.0.0.1", host));
  }
  for (const invalid of ["", "secret", url.replace("127.0.0.1", "db.example.com"), url.replace("postgresql:", "https:"), url.replace("milo:milo_dev@", "")]) {
    assert.throws(() => validateLocalDatabaseUrl(invalid), (error: Error) => {
      assert.ok(!error.message.includes("milo_dev"));
      return true;
    });
  }
});

test("local connection is lazy and works with the auth factory", async () => {
  const { db, close } = createLocalDatabase(url);
  const auth = createAuth(db, {
    secret: "local-test-only-secret-at-least-32-characters",
    baseURL: "http://localhost:8787",
  });
  assert.equal(auth.options.emailAndPassword?.enabled, false);
  await close();
  assert.equal(await withLocalDatabase(url, async () => "ok"), "ok");
  await assert.rejects(withLocalDatabase(url, async () => { throw new Error("work failed"); }), /work failed/);
});
