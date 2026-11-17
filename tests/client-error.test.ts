import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanReport } from "../lib/client-error";

test("client error reports never include the Telegram login data in the address", () => {
  const r = cleanReport({ message: "boom" }, "https://www.gebetasoccer.com/tma#tgWebAppData=user%3D123%26hash%3Dabc", "UA");
  assert.equal(r.url, "https://www.gebetasoccer.com/tma");
  assert.equal(r.message, "boom");
});

test("client error reports are size-limited", () => {
  const r = cleanReport({ message: "x".repeat(5000), stack: "y".repeat(9000) }, "https://a.b/" + "z".repeat(900), "u".repeat(900));
  assert.equal(r.message.length, 500);
  assert.equal(r.stack.length, 2000);
  assert.equal(r.url.length, 300);
  assert.equal(r.ua.length, 300);
});
