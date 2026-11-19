import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * A useEffect arrow WITHOUT braces returns whatever its expression returns, and
 * React calls that as the effect's cleanup. Browser methods like scrollIntoView
 * or scrollTo now return Promises, which crashed the help chat ("i is not a
 * function", 19 Nov 2026). Only these brace-less forms are safe:
 *   useEffect(() => setSomething(...))  - a state setter returns nothing
 *   useEffect(() => subscribe(...))     - returns a real cleanup function
 */
const ROOTS = ["app", "components", "lib"];
const SAFE = /^useEffect\(\(\) => (set[A-Z]\w*\(|subscribe\()/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return name === "node_modules" ? [] : files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

test("no useEffect arrow returns a browser call's value (cleanup must be a function or nothing)", () => {
  const bad: string[] = [];
  for (const root of ROOTS) {
    for (const f of files(path.resolve(root))) {
      readFileSync(f, "utf8")
        .split("\n")
        .forEach((line, i) => {
          const m = line.match(/useEffect\(\(\) => [^{].*/);
          if (m && !SAFE.test(m[0])) bad.push(`${path.relative(process.cwd(), f)}:${i + 1}: ${m[0].slice(0, 80)}`);
        });
    }
  }
  assert.deepEqual(bad, [], `Wrap these effect bodies in { } so they return nothing:\n${bad.join("\n")}`);
});
