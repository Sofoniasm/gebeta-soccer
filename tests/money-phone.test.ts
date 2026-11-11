import { test } from "node:test";
import assert from "node:assert/strict";
import { ETB_PER_UNIT, MAX_DEPOSIT_UNITS, MIN_DEPOSIT_UNITS, etbLabel, formatUnits, unitsLabel } from "../lib/money";
import { normalizeEthiopianPhone as phone } from "../lib/phone";

test("money rules: 1 Unit = 200 ETB, deposits 1,000-10,000 ETB", () => {
  assert.equal(ETB_PER_UNIT, 200);
  assert.equal(MIN_DEPOSIT_UNITS * ETB_PER_UNIT, 1000);
  assert.equal(MAX_DEPOSIT_UNITS * ETB_PER_UNIT, 10000);
});

test("labels", () => {
  assert.equal(unitsLabel(1), "1 Unit");
  assert.equal(unitsLabel(50), "50 Units");
  assert.equal(etbLabel(41), "8,200 ETB");
  assert.equal(formatUnits(5), "5 Units (1,000 ETB)");
});

test("Ethiopian phone numbers", () => {
  for (const ok of ["0911223344", "911223344", "251911223344", "+251 911 22 33 44", "0712345678"]) {
    assert.match(phone(ok) ?? "", /^\+251[79]\d{8}$/, ok);
  }
  assert.equal(phone("0911223344"), "+251911223344");
  for (const bad of ["", "12345", "0811223344", "+1 555 123 4567", "09112233445"]) {
    assert.equal(phone(bad), null, bad);
  }
});
