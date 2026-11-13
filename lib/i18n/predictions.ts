import type { Lang } from "@/lib/i18n";
import { LOCALE } from "@/lib/i18n";

type Teams = { home_team: string; away_team: string };
const TZ = "Africa/Addis_Ababa";

export function dateFmt(lang: Lang) {
  const loc = LOCALE[lang];
  return {
    long: (iso: string) => new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)),
    short: (iso: string) => new Intl.DateTimeFormat(loc, { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso)),
    day: (iso: string) => new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)),
    clock: (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)),
  };
}

export const PRED = {
  en: {
    notFound: "Match not found",
    vs: "vs",
    home: "Home",
    predictions: "Predictions",
    titleFinished: (m: Teams, h: number, a: number) => `${m.home_team} vs ${m.away_team} ${h}-${a}: Result & Prediction Review`,
    titleUpcoming: (m: Teams, date: string) => `${m.home_team} vs ${m.away_team} Prediction & Score Tip (${date})`,
    descPreview: (m: Teams, ph: number, pa: number, verdict: string) => `Our prediction: ${m.home_team} ${ph}-${pa} ${m.away_team}. ${verdict}`,
    descNone: (m: Teams, date: string, time: string, comp: string | null) =>
      `${m.home_team} vs ${m.away_team} kicks off ${date} at ${time} Ethiopia time${comp ? ` (${comp})` : ""}. Predict the score on GebetaSoccer and win in birr.`,
    h1: (m: Teams, finished: boolean) => `${m.home_team} vs ${m.away_team} ${finished ? "result & prediction review" : "prediction"}`,
    kickoffLine: (date: string, time: string) => `${date}, ${time} Ethiopia time (EAT)`,
    kickoff: "Kickoff",
    answerFinished: (m: Teams, h: number, a: number) => `${m.home_team} ${h}-${a} ${m.away_team} (full time).`,
    answerReview: (ph: number, pa: number, grade: "exact" | "result" | "none") =>
      ` Our pre-match prediction was ${ph}-${pa}${grade === "exact" ? ", the exact score" : grade === "result" ? ", the right result" : ""}.`,
    answerPreview: (m: Teams, ph: number, pa: number, outcome: string) => `GebetaSoccer prediction: ${m.home_team} ${ph}-${pa} ${m.away_team} (${outcome}).`,
    answerNone: (m: Teams, line: string) => `${m.home_team} vs ${m.away_team} kicks off on ${line}.`,
    outcome: (ph: number, pa: number, m: Teams) => (ph > pa ? `${m.home_team} win` : ph < pa ? `${m.away_team} win` : "a draw"),
    confidence: { low: "Low confidence", medium: "Medium confidence", high: "High confidence" },
    ourTip: "Our tip",
    tipScored: (ph: number, pa: number, pts: number) => `Our tip ${ph}-${pa} scored ${pts} points under GebetaSoccer rules.`,
    splitTitle: "How GebetaSoccer players predicted it",
    draw: "draw",
    splitLine: (n: number, s: string, pct: number) => `${n} predictions. Most popular score: ${s} (${pct}%).`,
    splitHidden: (n: number) => `${n} predictions so far. The split is revealed at kickoff.`,
    analysis: "Analysis",
    ctaTitle: "Think you know the score?",
    ctaRound: "Predict this match in today's round and win the pool in birr.",
    ctaChallenge: "Challenge your friends on this match and win their stakes.",
    predictThis: "Predict this match",
    joinFree: "Join GebetaSoccer free",
    challenge: "Challenge a friend",
    faqTitle: (m: Teams) => `${m.home_team} vs ${m.away_team}: questions`,
    qScore: (m: Teams) => `What was the score in ${m.home_team} vs ${m.away_team}?`,
    aScore: (m: Teams, h: number, a: number) => `${m.home_team} ${h}-${a} ${m.away_team}.`,
    qPrediction: (m: Teams) => `What is the prediction for ${m.home_team} vs ${m.away_team}?`,
    aPrediction: (m: Teams, ph: number, pa: number, conf: string, verdict: string) =>
      `GebetaSoccer predicts ${m.home_team} ${ph}-${pa} ${m.away_team} (${conf.toLowerCase()}). ${verdict}`,
    aPopular: (s: string, pct: number) => `The most popular score among GebetaSoccer players was ${s} (${pct}% of picks).`,
    aNoTip: "No tip has been published yet. Players can predict the exact score on GebetaSoccer until kickoff.",
    qWhen: (m: Teams) => `When does ${m.home_team} vs ${m.away_team} kick off in Ethiopia?`,
    aWhen: (line: string, comp: string | null) => `${line}${comp ? `, ${comp}` : ""}.`,
    qHow: (m: Teams) => `How do I predict ${m.home_team} vs ${m.away_team} and win?`,
    aHow: (inRound: boolean) =>
      `Create a free GebetaSoccer account and predict the score. An exact score earns 3 points, a close score 1.5 and the right result 1. ${
        inRound
          ? "This match is part of one of our daily 10-match rounds, where the top slip wins 70% of the pool."
          : "You can also put it in a private challenge against friends; the winner takes 90% of the stakes."
      }`,
    more: "More predictions",
    disclaimer: "Predictions are opinions for entertainment, not guarantees. 18+ only. Play responsibly.",
    howItWorks: "How GebetaSoccer works",
    live: "LIVE",
    status: { postponed: "postponed", cancelled: "cancelled" } as Record<string, string>,
    // hub
    hubMetaTitle: "Football Predictions & Score Tips This Week",
    hubMetaDescription:
      "Free football score predictions for this week's Premier League and top European matches, with kickoff times in Ethiopia (EAT) and how GebetaSoccer players are predicting each game.",
    hubTitle: "Football predictions",
    hubSubtitle: "This week's big matches, our score tips and kickoff times in Ethiopia.",
    hubTipped: (list: string, more: number) => `This week we tip ${list}${more > 0 ? ` and ${more} more` : ""}. `,
    hubIntro: "All times are Ethiopia time (EAT). Predict the exact score on GebetaSoccer: 3 points for the exact score, 1.5 for close, 1 for the right result.",
    hubEmpty: "New predictions are published before each round. Check back soon.",
    hubListName: "Football predictions this week",
    hubItem: (m: Teams) => `${m.home_team} vs ${m.away_team} prediction`,
  },
  am: {
    notFound: "ጨዋታው አልተገኘም",
    vs: "ከ",
    home: "መነሻ",
    predictions: "ትንበያዎች",
    titleFinished: (m: Teams, h: number, a: number) => `${m.home_team} ከ ${m.away_team} ${h}-${a}፦ ውጤት እና የትንበያ ግምገማ`,
    titleUpcoming: (m: Teams, date: string) => `${m.home_team} ከ ${m.away_team} ትንበያ እና የውጤት ጥቆማ (${date})`,
    descPreview: (m: Teams, ph: number, pa: number, verdict: string) => `የእኛ ትንበያ፦ ${m.home_team} ${ph}-${pa} ${m.away_team}። ${verdict}`,
    descNone: (m: Teams, date: string, time: string, comp: string | null) =>
      `${m.home_team} ከ ${m.away_team} ${date} ${time} በኢትዮጵያ ሰዓት ይጀምራል${comp ? ` (${comp})` : ""}። ውጤቱን በገበጣሶከር ይገምቱና በብር ያሸንፉ።`,
    h1: (m: Teams, finished: boolean) => `${m.home_team} ከ ${m.away_team} ${finished ? "ውጤት እና የትንበያ ግምገማ" : "ትንበያ"}`,
    kickoffLine: (date: string, time: string) => `${date}፣ ${time} በኢትዮጵያ ሰዓት`,
    kickoff: "መጀመሪያ",
    answerFinished: (m: Teams, h: number, a: number) => `${m.home_team} ${h}-${a} ${m.away_team} (ሙሉ ሰዓት)።`,
    answerReview: (ph: number, pa: number, grade: "exact" | "result" | "none") =>
      ` ከጨዋታው በፊት የሰጠነው ትንበያ ${ph}-${pa} ነበር${grade === "exact" ? "፤ ትክክለኛው ውጤት" : grade === "result" ? "፤ ትክክለኛው አሸናፊ" : ""}።`,
    answerPreview: (m: Teams, ph: number, pa: number, outcome: string) => `የገበጣሶከር ትንበያ፦ ${m.home_team} ${ph}-${pa} ${m.away_team} (${outcome})።`,
    answerNone: (m: Teams, line: string) => `${m.home_team} ከ ${m.away_team} ${line} ይጀምራል።`,
    outcome: (ph: number, pa: number, m: Teams) => (ph > pa ? `${m.home_team} ያሸንፋል` : ph < pa ? `${m.away_team} ያሸንፋል` : "አቻ"),
    confidence: { low: "ዝቅተኛ እርግጠኝነት", medium: "መካከለኛ እርግጠኝነት", high: "ከፍተኛ እርግጠኝነት" },
    ourTip: "የእኛ ጥቆማ",
    tipScored: (ph: number, pa: number, pts: number) => `የእኛ ጥቆማ ${ph}-${pa} በገበጣሶከር ደንብ ${pts} ነጥብ አግኝቷል።`,
    splitTitle: "የገበጣሶከር ተጫዋቾች እንዴት ገመቱ",
    draw: "አቻ",
    splitLine: (n: number, s: string, pct: number) => `${n} ግምቶች። በብዛት የተገመተው ውጤት፦ ${s} (${pct}%)።`,
    splitHidden: (n: number) => `እስካሁን ${n} ግምቶች። ክፍፍሉ ጨዋታው ሲጀምር ይገለጣል።`,
    analysis: "ትንታኔ",
    ctaTitle: "ውጤቱን የሚያውቁ ይመስልዎታል?",
    ctaRound: "ይህን ጨዋታ በዕለቱ ዙራችን ይገምቱና ገንዳውን በብር ያሸንፉ።",
    ctaChallenge: "በዚህ ጨዋታ ጓደኞችዎን ይግጠሙና ውርርዳቸውን ያሸንፉ።",
    predictThis: "ይህን ጨዋታ ይገምቱ",
    joinFree: "ገበጣሶከርን በነጻ ይቀላቀሉ",
    challenge: "ጓደኛዎን ይግጠሙ",
    faqTitle: (m: Teams) => `${m.home_team} ከ ${m.away_team}፦ ጥያቄዎች`,
    qScore: (m: Teams) => `የ${m.home_team} ከ ${m.away_team} ጨዋታ ውጤት ስንት ነበር?`,
    aScore: (m: Teams, h: number, a: number) => `${m.home_team} ${h}-${a} ${m.away_team}።`,
    qPrediction: (m: Teams) => `የ${m.home_team} ከ ${m.away_team} ትንበያ ምንድን ነው?`,
    aPrediction: (m: Teams, ph: number, pa: number, conf: string, verdict: string) =>
      `ገበጣሶከር ${m.home_team} ${ph}-${pa} ${m.away_team} እንደሚሆን ይገምታል (${conf})። ${verdict}`,
    aPopular: (s: string, pct: number) => `በገበጣሶከር ተጫዋቾች በብዛት የተገመተው ውጤት ${s} ነበር (ከግምቶቹ ${pct}%)።`,
    aNoTip: "እስካሁን ጥቆማ አልታተመም። ተጫዋቾች ጨዋታው እስኪጀመር ድረስ ትክክለኛውን ውጤት በገበጣሶከር መገመት ይችላሉ።",
    qWhen: (m: Teams) => `${m.home_team} ከ ${m.away_team} በኢትዮጵያ ሰዓት መቼ ይጀምራል?`,
    aWhen: (line: string, comp: string | null) => `${line}${comp ? `፣ ${comp}` : ""}።`,
    qHow: (m: Teams) => `${m.home_team} ከ ${m.away_team}ን ገምቼ እንዴት ማሸነፍ እችላለሁ?`,
    aHow: (inRound: boolean) =>
      `በነጻ የገበጣሶከር መለያ ይክፈቱና ውጤቱን ይገምቱ። ትክክለኛ ውጤት 3 ነጥብ፣ ቅርብ ውጤት 1.5 እና ትክክለኛ አሸናፊ 1 ነጥብ ያስገኛል። ${
        inRound
          ? "ይህ ጨዋታ ከዕለታዊ የ10 ጨዋታ ዙሮቻችን የአንዱ አካል ነው፤ ቀዳሚው ስሊፕ የገንዳውን 70% ያሸንፋል።"
          : "በግል ቻሌንጅም ከጓደኞችዎ ጋር መወዳደር ይችላሉ፤ አሸናፊው ከውርርዱ 90% ይወስዳል።"
      }`,
    more: "ተጨማሪ ትንበያዎች",
    disclaimer: "ትንበያዎች ለመዝናኛ የሚሰጡ አስተያየቶች ናቸው፤ ዋስትና አይደሉም። ለ18+ ብቻ። በኃላፊነት ይጫወቱ።",
    howItWorks: "ገበጣሶከር እንዴት ይሰራል",
    live: "ቀጥታ",
    status: { postponed: "ተራዝሟል", cancelled: "ተሰርዟል" } as Record<string, string>,
    hubMetaTitle: "የዚህ ሳምንት የእግር ኳስ ትንበያዎች እና የውጤት ጥቆማዎች",
    hubMetaDescription:
      "ለዚህ ሳምንት የፕሪሚየር ሊግና የአውሮፓ ታላላቅ ጨዋታዎች ነጻ የውጤት ትንበያዎች፣ በኢትዮጵያ ሰዓት የሚጀምሩበት ጊዜ፣ እና የገበጣሶከር ተጫዋቾች እያንዳንዱን ጨዋታ እንዴት እየገመቱ እንደሆነ።",
    hubTitle: "የእግር ኳስ ትንበያዎች",
    hubSubtitle: "የዚህ ሳምንት ታላላቅ ጨዋታዎች፣ የእኛ የውጤት ጥቆማዎችና በኢትዮጵያ ሰዓት የሚጀምሩበት ጊዜ።",
    hubTipped: (list: string, more: number) => `በዚህ ሳምንት የእኛ ጥቆማዎች፦ ${list}${more > 0 ? ` እና ሌሎች ${more}` : ""}። `,
    hubIntro: "ሁሉም ሰዓቶች በኢትዮጵያ ሰዓት ናቸው። ትክክለኛውን ውጤት በገበጣሶከር ይገምቱ፦ ትክክለኛ ውጤት 3 ነጥብ፣ ቅርብ 1.5፣ ትክክለኛ አሸናፊ 1።",
    hubEmpty: "አዳዲስ ትንበያዎች ከእያንዳንዱ ዙር በፊት ይታተማሉ። በቅርቡ ይመለሱ።",
    hubListName: "የዚህ ሳምንት የእግር ኳስ ትንበያዎች",
    hubItem: (m: Teams) => `${m.home_team} ከ ${m.away_team} ትንበያ`,
  },
} satisfies Record<Lang, unknown>;
