import { test } from "node:test";
import assert from "node:assert/strict";
import { isTranslatable, localPath } from "../lib/i18n";

test("i18n: every public page has an Amharic version (so the language never flips back)", () => {
  for (const p of ["/", "/how-to-play", "/terms", "/predictions", "/news", "/news/some-article", "/apps", "/about", "/business", "/tournaments", "/login", "/register"]) {
    assert.equal(isTranslatable(p), true, p);
  }
  for (const p of ["/dashboard", "/wallet", "/admin", "/challenges/GC-ABCDEF"]) assert.equal(isTranslatable(p), false, p);
  assert.equal(localPath("/about", "am"), "/am/about");
});
