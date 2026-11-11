import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { ETB_PER_UNIT, MAX_DEPOSIT_UNITS } from "@/lib/money";
import { getSiteSettings, telegramHandle } from "@/lib/site-settings";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { SectionTitle } from "@/components/ui";
import { breadcrumbJsonLd, faqJsonLd, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";
import { getLang } from "@/lib/i18n-server";
import { localPath, type Lang } from "@/lib/i18n";

const maxEtb = (MAX_DEPOSIT_UNITS * ETB_PER_UNIT).toLocaleString("en-US");

const T = {
  en: {
    metaTitle: "How to Play: Rules, Scoring & FAQ",
    metaDescription:
      "How GebetaSoccer works: predict 10 football scores, exact score 3 points, close 1.5, result 1, Slam Points, tie-breaks, deposits in birr and withdrawals to Telebirr.",
    home: "Home",
    title: "How to play",
    subtitle: "Six steps from sign-up to cash-out. It takes two minutes to learn and a whole season to master.",
    steps: [
      ["Create your account", "Sign up with a username, your phone number, your date of birth and a password. You must be 18 or older."],
      ["Top up your wallet", `Send money to our Telegram admin (from 1,000 ETB up to ${maxEtb} ETB) and quote your username. 1 Unit = ${ETB_PER_UNIT} ETB.`],
      ["Fill your slip", "Each round has 10 big matches. Type a score for all 10. A slip can only be placed when every match has a score."],
      ["Place your bet", `Placing a slip costs the round's entry fee (usually 1 Unit = ${ETB_PER_UNIT} ETB). Want another go? Place more slips with different scores; each one is paid and competes on its own.`],
      ["Watch the table move", "Points update live as matches finish. Check the leaderboard to see where you stand."],
      ["Win and cash out", "Top the table with MORE than 15 of the 30 match points and you win 70% of the pool (ties share it). If nobody gets past 15, there is no winner that round. Withdraw winnings to your phone."],
    ],
    scoringTop: "Scoring",
    scoringBottom: "Points per match",
    scoring: [
      ["3", "Exact", "You predicted the exact score."],
      ["1.5", "Close", "Right result and only one goal away, or two goals away with the same goal difference (1-1 vs 2-2)."],
      ["1", "Result", "Right winner or draw, but not close."],
      ["0", "Wrong", "Wrong result."],
    ],
    slam: "Slam Points",
    slamParts: ["A bonus for correct results across the round: 5–7 correct", ", 8–9 correct", ", all 10 correct", "."],
    faqTop: "Questions",
    faqBottom: "Quick answers",
    faq: [
      ["When does betting close?", "The whole round locks at its first kickoff. Until then you can edit your slips for free and place new ones. After that, no new slips and no changes."],
      ["Can I place more than one slip?", "Yes. Every slip is paid separately and ranked separately (you appear as yourname #1, #2…). If two of your slips finish top, both win. Your Slip #1 is the one that counts in private leagues. Slips can't be refunded once placed."],
      ["Can I see other players' picks?", "Yes. Once a match kicks off, open it from Fixtures or Live & Results to see everyone's picks and how the players split between home win, draw and away win."],
      ["What if a match is postponed?", "A postponed or cancelled match scores 0 for everyone and doesn't count towards Slam Points. It also lowers the winning bar: with 9 matches you need more than 13.5 points."],
      ["What if nobody scores more than 15?", "Then nobody wins that round and the pool is kept by GebetaSoccer. The bar counts match points only (exact, close and result points), not Slam Points. Paid private leagues use the same bar."],
      ["What is a challenge?", "A private bet with friends. Pick 1 to 10 upcoming matches, enter your scores, set a stake (from 200 ETB, any amount up to 1,000,000 ETB) and share the link. Everyone who joins pays the same stake from their wallet and predicts the same matches. The highest score takes 90% of all stakes (ties share it); GebetaSoccer keeps 10%. If nobody joins before the first kickoff, your stake comes back."],
      ["How are ties decided?", "Most correct results, then most exact scores, then most close picks, then the smallest total goal difference. Players still level share the prize equally."],
      ["How fast are withdrawals?", "Units are held from your wallet straight away, and the admin sends the money to your phone, usually within 24 hours."],
      ["Is my phone number public?", "No. Other players only ever see your username, your picture (if you add one) and your points."],
    ],
    stuck: "Still stuck?",
    message: "Message us on Telegram",
    orRead: "or read the",
    fullRules: "full rules",
  },
  am: {
    metaTitle: "እንዴት እንደሚጫወቱ፦ ደንቦች፣ ነጥብ አሰጣጥ እና ጥያቄዎች",
    metaDescription:
      "ገበጣሶከር እንዴት ይሰራል፦ የ10 ጨዋታዎችን ውጤት ይገምቱ፤ ትክክለኛ ውጤት 3 ነጥብ፣ ቅርብ 1.5፣ ትክክለኛ አሸናፊ 1፣ የስላም ነጥቦች፣ እኩል ሲሆን አወሳሰን፣ በብር ገቢ እና ወደ ቴሌብር ወጪ።",
    home: "መነሻ",
    title: "አጨዋወት",
    subtitle: "ከምዝገባ እስከ ገንዘብ ማውጣት ስድስት ደረጃዎች። ለመማር ሁለት ደቂቃ፣ ለመካን ግን ሙሉ የውድድር ዘመን ይወስዳል።",
    steps: [
      ["መለያ ይክፈቱ", "በተጠቃሚ ስም፣ በስልክ ቁጥርዎ፣ በልደት ቀንዎ እና በይለፍ ቃል ይመዝገቡ። ዕድሜዎ 18 ወይም ከዚያ በላይ መሆን አለበት።"],
      ["ዋሌትዎን ይሙሉ", `ገንዘብ ለቴሌግራም አስተዳዳሪያችን ይላኩ (ከ1,000 ብር እስከ ${maxEtb} ብር) እና የተጠቃሚ ስምዎን ይጥቀሱ። 1 ዩኒት = ${ETB_PER_UNIT} ብር።`],
      ["ስሊፕዎን ይሙሉ", "እያንዳንዱ ዙር 10 ታላላቅ ጨዋታዎች አሉት። ለ10ሩም ውጤት ያስገቡ። ስሊፕ የሚገባው ሁሉም ጨዋታዎች ውጤት ሲኖራቸው ብቻ ነው።"],
      ["ውርርድዎን ያስገቡ", `ስሊፕ ማስገባት የዙሩን የመግቢያ ክፍያ ይጠይቃል (ብዙውን ጊዜ 1 ዩኒት = ${ETB_PER_UNIT} ብር)። ሌላ ዕድል ይፈልጋሉ? በተለያዩ ውጤቶች ተጨማሪ ስሊፖች ያስገቡ፤ እያንዳንዱ ለብቻው ይከፈላል፣ ለብቻውም ይወዳደራል።`],
      ["ሰንጠረዡን ይከታተሉ", "ጨዋታዎች ሲጠናቀቁ ነጥቦች በቀጥታ ይዘመናሉ። የት እንዳሉ ለማየት የደረጃ ሰንጠረዡን ይመልከቱ።"],
      ["ያሸንፉ፣ ገንዘብዎን ያውጡ", "ከ30 የጨዋታ ነጥብ ከ15 በላይ ይዘው ሰንጠረዡን ከመሩ የገንዳውን 70% ያሸንፋሉ (እኩል ከሆኑ ይካፈላሉ)። ማንም ከ15 ካላለፈ የዚያ ዙር አሸናፊ የለም። ያሸነፉትን ወደ ስልክዎ ያውጡ።"],
    ],
    scoringTop: "ነጥብ አሰጣጥ",
    scoringBottom: "ለእያንዳንዱ ጨዋታ",
    scoring: [
      ["3", "ትክክለኛ", "ትክክለኛውን ውጤት ገምተዋል።"],
      ["1.5", "ቅርብ", "ትክክለኛ አሸናፊ እና በአንድ ጎል ብቻ ልዩነት፣ ወይም በሁለት ጎል ልዩነት ግን ተመሳሳይ የጎል ልዩነት (1-1 እና 2-2)።"],
      ["1", "አሸናፊ", "ትክክለኛ አሸናፊ ወይም አቻ፣ ግን ቅርብ አይደለም።"],
      ["0", "የተሳሳተ", "የተሳሳተ ውጤት።"],
    ],
    slam: "የስላም ነጥቦች",
    slamParts: ["በዙሩ ለትክክለኛ አሸናፊዎች ጉርሻ፦ 5–7 ትክክል", "፣ 8–9 ትክክል", "፣ 10ሩም ትክክል", "።"],
    faqTop: "ጥያቄዎች",
    faqBottom: "አጭር መልሶች",
    faq: [
      ["ውርርድ መቼ ይዘጋል?", "ሙሉው ዙር በመጀመሪያው ጨዋታ መጀመሪያ ሰዓት ይቆለፋል። እስከዚያ ድረስ ስሊፖችዎን በነጻ ማስተካከልና አዳዲስ ማስገባት ይችላሉ። ከዚያ በኋላ አዲስ ስሊፕም ማስተካከልም አይቻልም።"],
      ["ከአንድ በላይ ስሊፕ ማስገባት እችላለሁ?", "አዎ። እያንዳንዱ ስሊፕ ለብቻው ይከፈላል፣ ለብቻውም ደረጃ ይሰጠዋል (ስምዎ #1፣ #2… ሆኖ ይታያል)። ሁለት ስሊፖችዎ ቀዳሚ ከሆኑ ሁለቱም ያሸንፋሉ። በግል ሊጎች የሚቆጠረው ስሊፕ #1 ነው። የገባ ስሊፕ ተመላሽ አይደረግም።"],
      ["የሌሎችን ግምት ማየት እችላለሁ?", "አዎ። ጨዋታው ሲጀምር ከፊክስቸርስ ወይም ከውጤቶች ገጽ ከፍተው የሁሉንም ግምትና ተጫዋቾች በቤት አሸናፊ፣ በአቻ እና በእንግዳ አሸናፊ እንዴት እንደተከፋፈሉ ማየት ይችላሉ።"],
      ["ጨዋታ ከተራዘመስ?", "የተራዘመ ወይም የተሰረዘ ጨዋታ ለሁሉም 0 ነጥብ ነው፤ ለስላም ነጥብም አይቆጠርም። የማሸነፊያ ገደቡንም ይቀንሳል፦ በ9 ጨዋታዎች ከ13.5 በላይ ያስፈልጋል።"],
      ["ማንም ከ15 በላይ ካላመጣስ?", "ያኔ የዚያ ዙር አሸናፊ አይኖርም፤ ገንዳው ለገበጣሶከር ይቀራል። ገደቡ የሚቆጥረው የጨዋታ ነጥቦችን ብቻ ነው (ትክክለኛ፣ ቅርብ እና አሸናፊ)፤ የስላም ነጥቦችን አይደለም። የሚከፈልባቸው የግል ሊጎችም ይህንኑ ገደብ ይጠቀማሉ።"],
      ["ቻሌንጅ ምንድን ነው?", "ከጓደኞች ጋር የግል ውርርድ ነው። ከ1 እስከ 10 የሚመጡ ጨዋታዎችን ይምረጡ፣ ውጤትዎን ያስገቡ፣ የውርርድ መጠን ይወስኑ (ከ200 ብር እስከ 1,000,000 ብር) እና ሊንኩን ያጋሩ። የሚቀላቀል ሁሉ ተመሳሳይ መጠን ከዋሌቱ ይከፍላል፣ ተመሳሳይ ጨዋታዎችንም ይገምታል። ከፍተኛ ነጥብ ያመጣ የጠቅላላውን 90% ይወስዳል (እኩል ከሆኑ ይካፈላሉ)፤ ገበጣሶከር 10% ይወስዳል። ከመጀመሪያው ጨዋታ በፊት ማንም ካልተቀላቀለ ገንዘብዎ ይመለሳል።"],
      ["እኩል ሲሆኑ እንዴት ይወሰናል?", "በብዛት ትክክለኛ አሸናፊ፣ ከዚያ በብዛት ትክክለኛ ውጤት፣ ከዚያ በብዛት ቅርብ ግምት፣ ከዚያ በትንሹ የጎል ልዩነት። አሁንም እኩል የሆኑ ሽልማቱን በእኩል ይካፈላሉ።"],
      ["ገንዘብ ማውጣት ምን ያህል ይፈጃል?", "ዩኒቶቹ ወዲያውኑ ከዋሌትዎ ይያዛሉ፤ አስተዳዳሪው ገንዘቡን ወደ ስልክዎ ይልካል፣ ብዙውን ጊዜ በ24 ሰዓት ውስጥ።"],
      ["ስልክ ቁጥሬ ለሌሎች ይታያል?", "አይታይም። ሌሎች ተጫዋቾች የሚያዩት የተጠቃሚ ስምዎን፣ ፎቶዎን (ካስገቡ) እና ነጥብዎን ብቻ ነው።"],
    ],
    stuck: "አሁንም ጥያቄ አለዎት?",
    message: "በቴሌግራም ይጻፉልን",
    orRead: "ወይም",
    fullRules: "ሙሉ ደንቦቹን ያንብቡ",
  },
} satisfies Record<Lang, unknown>;

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: T[lang].metaTitle, description: T[lang].metaDescription, path: "/how-to-play", lang, translated: true });
}

export default async function HowToPlayPage() {
  const site = await getSiteSettings();
  const lang = await getLang();
  const t = T[lang];
  const { loggedIn } = await getPublicContext();
  return (
    <div className="relative">
      <JsonLd data={faqJsonLd(t.faq as [string, string][])} />
      <JsonLd data={breadcrumbJsonLd([{ name: t.home, path: localPath("/", lang) === "/" ? "" : "/am" }, { name: t.title, path: localPath("/how-to-play", lang) }])} />
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title={t.title} subtitle={t.subtitle} image="/ball.webp" />

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
            {t.steps.map(([title, d], i) => (
              <div key={title} className="rounded-[1.5rem] border border-white/5 bg-card/60 p-4 sm:rounded-[2rem] sm:p-6">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lilac text-sm font-extrabold text-ink sm:h-10 sm:w-10">{i + 1}</span>
                <p className="mt-3 text-sm font-extrabold sm:mt-4 sm:text-lg">{title}</p>
                <p className="mt-1.5 text-xs leading-relaxed text-mist sm:mt-2 sm:text-sm">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-16">
          <SectionTitle top={t.scoringTop} bottom={t.scoringBottom} />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {t.scoring.map(([p, title, d]) => (
              <div key={title} className="rounded-[1.5rem] border border-white/5 bg-card/60 p-4 sm:rounded-[2rem] sm:p-6">
                <p className="text-3xl font-extrabold text-lilac sm:text-4xl">{p}</p>
                <p className="mt-2 text-sm font-bold sm:mt-3 sm:text-base">{title}</p>
                <p className="mt-1 text-xs leading-snug text-mist sm:text-sm">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-6">
            <p className="text-lg font-extrabold">{t.slam}</p>
            <p className="mt-1 text-sm text-mist">
              {t.slamParts[0]} <b className="text-white">+1</b>{t.slamParts[1]} <b className="text-white">+2</b>{t.slamParts[2]} <b className="text-white">+3</b>{t.slamParts[3]}
            </p>
          </div>
        </section>

        <section className="pb-16">
          <SectionTitle top={t.faqTop} bottom={t.faqBottom} />
          <div className="mt-8 space-y-3">
            {t.faq.map(([q, a]) => (
              <details key={q} className="group rounded-[1.5rem] border border-white/5 bg-card/60 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-bold">
                  {q} <span className="text-lilac transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-mist">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-sm text-mist">
            {t.stuck} <a href={site.telegram_support} target="_blank" rel="noopener noreferrer" className="font-semibold text-lilac">{t.message}</a> {t.orRead}{" "}
            <Link href={localPath("/terms", lang)} className="font-semibold text-lilac">{t.fullRules}</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
