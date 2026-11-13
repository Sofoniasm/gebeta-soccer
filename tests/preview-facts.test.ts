import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPreviewFacts } from "../lib/preview-facts.ts";
import { localizeNews, type NewsPost } from "../lib/news.ts";

const m = (h: string, a: string, hs: number, as: number, d: string) => ({ home_team: h, away_team: a, actual_home_score: hs, actual_away_score: as, kickoff_at: `${d}T15:00:00Z`, competition: "PL" });
const match = { home_team: "Arsenal", away_team: "Chelsea", competition: "PL", kickoff_at: "2026-11-22T15:00:00Z" };

test("preview facts use only past results and mark missing data", () => {
  const list = [
    m("Arsenal", "Spurs", 2, 1, "2026-11-01"),
    m("Leeds", "Arsenal", 0, 0, "2026-11-08"),
    m("Arsenal", "Chelsea", 1, 3, "2026-12-01"), // after kickoff: must be ignored
  ];
  const f = buildPreviewFacts(match, list);
  assert.equal(f.games, 2);
  assert.match(f.text, /Arsenal last 5 results[^]*2 games: 1W 1D 0L, scored 2, conceded 1/);
  assert.match(f.text, /Chelsea last 5 results[^:]*:\nNO DATA/);
  assert.match(f.text, /NO DATA - do not mention head-to-head/);
  assert.doesNotMatch(f.text, /1-3/);
});

test("head-to-head is listed newest first", () => {
  const f = buildPreviewFacts(match, [m("Chelsea", "Arsenal", 2, 2, "2026-03-01"), m("Arsenal", "Chelsea", 1, 0, "2025-10-01")]);
  assert.match(f.text, /Chelsea 2-2 Arsenal[^]*Arsenal 1-0 Chelsea/);
});

test("news falls back to English per field", () => {
  const p = { id: 1, slug: "s", title: "T", excerpt: "E", body: "B", cover_image: "", tag: "News", published_at: "", title_am: "ርዕስ", excerpt_am: "", body_am: null } as NewsPost;
  assert.deepEqual([localizeNews(p, "am").title, localizeNews(p, "am").excerpt, localizeNews(p, "am").body], ["ርዕስ", "E", "B"]);
  assert.equal(localizeNews(p, "en").title, "T");
});
