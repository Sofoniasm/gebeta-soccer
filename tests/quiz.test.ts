import { test } from "node:test";
import assert from "node:assert/strict";
import { eatMonthRange, grade, toPublic, validateQuestion, QUESTION_SECONDS, GRACE_SECONDS } from "../lib/quiz";

const row = {
  id: 1, quiz_id: 1, position: 1, topic: "EPL", question: "Who won the 2004 Premier League?", question_am: "የ2004 ፕሪሚየር ሊግ ማን አሸነፈ?",
  options: ["Arsenal", "Chelsea", "Man Utd", "Liverpool"], options_am: ["Arsenal", "Chelsea", "Man Utd", "Liverpool"], correct: 0, explanation: "Invincibles.", explanation_am: "",
};

test("public question never carries the right answer", () => {
  const p = toPublic(row, false);
  assert.ok(!("correct" in p));
  assert.ok(!JSON.stringify(p).includes("Invincibles"));
  assert.equal(p.seconds, QUESTION_SECONDS);
  assert.equal(toPublic(row, true).question, row.question_am);
  assert.equal(toPublic({ ...row, question_am: "" }, true).question, row.question);
});

test("grading: right, wrong, late, no answer", () => {
  const shownAt = new Date("2026-11-13T10:00:00Z");
  const at = (s: number) => new Date(shownAt.getTime() + s * 1000);
  assert.deepEqual(grade({ shownAt, now: at(5), choice: 0, correct: 0 }), { inTime: true, isCorrect: true });
  assert.equal(grade({ shownAt, now: at(5), choice: 2, correct: 0 }).isCorrect, false);
  assert.equal(grade({ shownAt, now: at(QUESTION_SECONDS + GRACE_SECONDS + 1), choice: 0, correct: 0 }).isCorrect, false);
  assert.equal(grade({ shownAt, now: at(3), choice: null, correct: 0 }).isCorrect, false);
});

test("EAT month range", () => {
  const r = eatMonthRange(new Date("2026-11-30T22:00:00Z")); // already 1 Dec in Addis
  assert.equal(r.from.toISOString(), "2026-11-30T21:00:00.000Z");
  assert.equal(r.label, "December 2026");
});

test("question validation", () => {
  assert.equal(validateQuestion(row), null);
  assert.match(validateQuestion({ ...row, options: ["a", "a", "b", "c"] })!, /different/);
  assert.match(validateQuestion({ ...row, options: ["a", "b", "c"] })!, /4 answers/);
  assert.match(validateQuestion({ ...row, correct: 4 })!, /right/);
});
