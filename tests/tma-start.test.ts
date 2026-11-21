import { test } from "node:test";
import assert from "node:assert/strict";
import { startParamNext } from "../lib/tma";

test("Mini App direct link: a round or a challenge in start_param decides where to go", () => {
  assert.equal(startParamNext("query_id=x&start_param=r_42&hash=abc"), "/dashboard?round=42&new=1#slip");
  assert.equal(startParamNext("start_param=c_GC-ABC234&auth_date=1"), "/challenges/GC-ABC234");
});

test("Mini App direct link: anything else is ignored (it is text the sender chose)", () => {
  for (const bad of ["start_param=//evil.com", "start_param=r_abc", "start_param=r_1234567890", "start_param=c_gc-abc234", "start_param=javascript:alert(1)", "auth_date=1", ""]) {
    assert.equal(startParamNext(bad), null, bad);
  }
  assert.equal(startParamNext(null), null);
});
