/**
 * Backup for the help chat when the AI is down: find the best-matching lines in
 * our own guide (lib/assistant-kb.ts) by keywords, English or Amharic. Pure, so
 * it is easy to test. The guide holds no account data, so this is always safe.
 */
import { ASSISTANT_KB } from "@/lib/assistant-kb";

interface Entry {
  section: string;
  text: string;
  words: Set<string>;
}

const STOP = new Set(
  "the a an and or to of in on for is are be do does how what when where why who can i my me you your it its at by with from this that there their about will much many get not no yes".split(" "),
);

/** Words people use → the words our guide uses. Amharic keywords map to English topics. */
const SYNONYMS: [RegExp, string[]][] = [
  [/top ?up|add money|put money|send money|ገንዘብ (አስገ|ማስገ|ጨም)|ማስገባት|ዲፖዚት/i, ["deposit"]],
  [/cash ?out|take out|withdraw|ማውጣት|ማውጣቴ|አወጣ/i, ["withdraw", "withdrawal"]],
  [/point|score|ነጥብ|ውጤት/i, ["points", "scoring", "exact"]],
  [/round|slip|bet|ዙር|ስሊፕ|ውርርድ|ትንበያ/i, ["round", "slip", "rounds"]],
  [/lock|close|deadline|kick ?off|ይዘጋ|መቼ/i, ["locks", "first", "kickoff"]],
  [/win|prize|pot|paid|ማሸነፍ|ሽልማት|ያሸንፍ/i, ["prize", "winner", "stake"]],
  [/premium|ፕሪሚየም|crowd/i, ["premium", "crowd"]],
  [/password|code|ፓስወርድ|የይለፍ/i, ["password", "code"]],
  [/sign ?up|register|account|ይመዝገቡ|መለያ|ምዝገባ/i, ["sign", "account", "phone"]],
  [/telegram|bot|ቴሌግራም|ቦት/i, ["telegram", "bot"]],
  [/challenge|ቻሌንጅ|friend|ጓደኛ/i, ["challenges", "challenge"]],
  [/league|ሊግ/i, ["leagues", "league"]],
  [/quiz|ጥያቄ/i, ["quiz"]],
  [/break|limit|addict|ገደብ|እረፍት/i, ["break", "limit", "responsible"]],
  [/late ?night|night|morning|evening|ሌሊት|ምሽት|ጠዋት|ከሰዓት/i, ["slot", "night", "morning", "evening"]],
  [/amharic|english|language|ቋንቋ|አማርኛ/i, ["language", "amharic"]],
];

const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9ሀ-፿\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map((w) => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w));

function entries(kb: string): Entry[] {
  const out: Entry[] = [];
  let section = "";
  for (const raw of kb.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^[A-Z][A-Z &]+$/.test(line)) {
      section = line;
      continue;
    }
    const text = line.replace(/^-\s*/, "");
    out.push({ section, text, words: new Set([...tokens(text), ...tokens(section)]) });
  }
  return out;
}

const KB = entries(ASSISTANT_KB);

/** Best guide lines for a question (empty when nothing matches well enough). */
export function kbMatches(question: string, kb: Entry[] = KB, max = 2): string[] {
  // Topic words (from SYNONYMS) weigh 2, other words in the question 1.
  const q = new Map<string, number>(tokens(question).map((w) => [w, 1]));
  for (const [re, add] of SYNONYMS) if (re.test(question)) add.forEach((w) => q.set(w, 2));
  if (q.size === 0) return [];
  const scored = kb
    .map((e) => {
      let score = 0;
      for (const [w, weight] of q) if (e.words.has(w)) score += weight;
      return { e, score };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score);
  if (scored.length === 0) return [];
  const best = scored[0].score;
  return scored.filter((x) => x.score >= best - 1).slice(0, max).map((x) => x.e.text);
}

/** A ready reply from the guide, or null when it has nothing that fits. */
export function kbAnswer(question: string, lang: "en" | "am", support: string): string | null {
  const lines = kbMatches(question);
  if (lines.length === 0) return null;
  const head = lang === "am" ? "ረዳቱ አሁን ስራ ላይ አይደለም፤ ከመመሪያችን፦" : "From our guide:";
  const foot = lang === "am" ? `ሌላ ጥያቄ ካለዎት ድጋፍን ያግኙ፦ ${support}` : `Anything else? Message support: ${support}`;
  return `${head}\n\n${lines.map((l) => `• ${l}`).join("\n")}\n\n${foot}`;
}

export const __test = { entries, tokens };
