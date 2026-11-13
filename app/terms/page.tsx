import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { getSiteSettings, telegramHandle } from "@/lib/site-settings";
import { pageMeta } from "@/lib/seo";
import { getLang } from "@/lib/i18n-server";
import { localPath, type Lang } from "@/lib/i18n";

// NOTE: plain-language starter terms. Have a lawyer review before launch.
const T: Record<Lang, { metaTitle: string; metaDescription: string; h1: string; intro: string; updated: string; note?: string; questions: string; message: string; create: string; sections: { title: string; body: string[] }[] }> = {
  en: {
    metaTitle: "Terms & responsible play",
    metaDescription: "GebetaSoccer rules, 18+ policy, deposits, withdrawals, scoring, prize split and responsible play.",
    h1: "Terms & Responsible Play",
    intro: "Please read these before you play.",
    updated: "Last updated",
    questions: "Questions?",
    message: "Message us on Telegram",
    create: "Create account",
    sections: [
      {
        title: "1. Who can play",
        body: [
          "You must be 18 years or older to create an account or play. We ask for your date of birth when you sign up, may ask for proof of age at any time, and close accounts that do not meet this rule.",
          "One account per person. Accounts are personal and may not be shared, sold or transferred.",
        ],
      },
      {
        title: "2. Units and payments",
        body: [
          "Your wallet holds Units. 1 Unit = 200 ETB.",
          "Deposits are made manually through our Telegram admin (minimum 1,000 ETB, maximum 100,000 ETB per transaction) and are credited after we confirm the payment.",
          "Withdrawals are requested in the app. The Units are held immediately and the money is sent to your phone number after review.",
        ],
      },
      {
        title: "3. How rounds work",
        body: [
          "Each round has exactly 10 matches. You play by placing a slip with a score for all 10 matches; each slip costs the round's entry fee, paid when it is placed. You may place several slips; each competes on its own.",
          "You can edit a placed slip free of charge until the round locks at its first kickoff. After that no slips can be placed or changed. Placed slips are not refundable. Everyone's slips become visible once the round locks.",
          "Scoring: exact score 3 points; close (correct result and one goal away, or two goals away with the same goal difference, e.g. 1-1 vs 2-2) 1.5 points; correct result 1 point; wrong result 0 points.",
          "Slam Points per round for correct results: 5–7 correct +1, 8–9 correct +2, 10 correct +3.",
          "The prize pool is the total of entry fees. 70% is paid to the winner(s); 30% is the house fee. There is always a winner: the slip with the most points wins, whatever its score. Ties are decided by most correct results, then most exact scores, then most close picks, then the smallest total goal difference; remaining ties share the prize equally.",
          "Postponed or cancelled matches score 0 for everyone.",
          "Daily rounds open automatically by Ethiopian time slot: Morning (kickoffs 06:00–11:59), Evening (12:00–18:59) and Night (19:00–23:59). A round only takes matches from its own slot, and only opens when the slot has 10 matches. Rounds can also be created by GebetaSoccer by hand.",
        ],
      },
      {
        title: "3b. Private leagues and challenges",
        body: [
          "Paid private leagues use Slip #1 of each member. The league winner(s) receive 70% of the league pot (30% house fee) The member with the most points always wins, whatever the score. Free leagues move no money.",
          "A player can create a challenge on 1 to 10 upcoming matches with a stake per player of 200 to 1,000,000 ETB. The stake is taken from the creator's wallet when the challenge is created and from each player's wallet when they join. A player can only join with enough Units in their wallet.",
          "Scores can be changed free of charge until the first of the selected matches kicks off; after that nobody can join or change scores. Other players' scores are hidden until then.",
          "Scoring is the same as in rounds (3 / 1.5 / 1 / 0, no Slam Points). Postponed or cancelled matches score 0 for everyone. The highest total wins; ties are decided by most correct results, most exact scores, most close picks and smallest total goal difference, and players still level share the prize equally.",
          "The winner(s) receive 90% of all stakes; 10% is the GebetaSoccer fee. If nobody else joins before the first kickoff, or every selected match is called off, all stakes are refunded. The creator may cancel for a full refund while nobody else has joined. Stakes cannot otherwise be refunded.",
        ],
      },
      {
        title: "3c. Gebeta Premium",
        body: [
          "Gebeta Premium is an optional paid information service. It costs 2 Units (400 ETB) for 30 days or 20 Units (4,000 ETB) for 365 days, paid from your GebetaSoccer wallet when you subscribe. You must be 18 or older and not on a break to buy it.",
          "Premium renews automatically from your wallet at the end of each period for the same plan and price, unless you turn auto-renew off on the Premium page before the period ends. If your wallet does not have enough Units, Premium simply ends: you are never charged more than your balance and no debt is created. Buying again while Premium is active adds the time on top.",
          "Premium shows: anonymous crowd picks for daily rounds while they are open (only once at least 5 slips are in; after the round locks they are shown to everyone), every player's full slip after the round locks, and a form guide (a rough home / draw / away percentage from recent results). These are estimates and information only; they do not change your points, the scoring or your chance of winning, and they are not betting advice.",
          "Nobody, with or without Premium, can see another player's picks before a round locks. Premium gives no access to private challenges.",
          "Units spent on Premium are not refunded, including when auto-renew is turned off part way through a period. If GebetaSoccer stops offering Premium and you have an active yearly subscription, the unused part is refunded to your wallet: the yearly price minus the months already used at the standard monthly rate (400 ETB a month), where a month that has started counts as used. For example, after 2 months and 10 days you get 4,000 − 3 × 400 = 2,800 ETB. The refund is never below zero, and there is no refund for a partly used month, including on the monthly plan.",
        ],
      },
      {
        title: "4. Fair play",
        body: [
          "Using multiple accounts, automated tools or any form of cheating will lead to the account being closed and any balance being withheld.",
          "Our decision on results and scoring is final once a round is settled.",
        ],
      },
      {
        title: "5. Responsible play",
        body: [
          "Only play with money you can afford to lose. Never chase losses.",
          "On your Profile you can take a break (24 hours, 7 days or 30 days) during which you cannot place any bet; a break cannot be ended early. Withdrawals still work during a break.",
          "You can set a weekly deposit limit (any 7 days). Lowering it takes effect immediately; raising or removing it takes effect after 7 days. We will not accept deposits above your limit.",
          "Bets can only be placed once your date of birth (18+) is saved on your account.",
          "If you feel you are playing too much, contact us on Telegram and we will pause or close your account.",
        ],
      },
      {
        title: "6. Privacy",
        body: [
          "We store your username, phone number, date of birth, optional email and profile picture, and your game and wallet history to run the service. Other players only see your username, picture and points; we never show your phone, email or date of birth.",
        ],
      },
    ],
  },
  am: {
    metaTitle: "ደንቦች እና በኃላፊነት መጫወት",
    metaDescription: "የገበጣሶከር ደንቦች፦ የ18+ ፖሊሲ፣ ገቢ፣ ወጪ፣ ነጥብ አሰጣጥ፣ የሽልማት ክፍፍል እና በኃላፊነት መጫወት።",
    h1: "ደንቦች እና በኃላፊነት መጫወት",
    intro: "እባክዎ ከመጫወትዎ በፊት ያንብቡ።",
    updated: "የተሻሻለው፦",
    note: "ይህ ትርጉም ለአገልግሎትዎ የቀረበ ነው። በትርጉሙ እና በእንግሊዝኛው ቅጂ መካከል ልዩነት ቢፈጠር የእንግሊዝኛው ቅጂ ይገዛል።",
    questions: "ጥያቄ አለዎት?",
    message: "በቴሌግራም ይጻፉልን",
    create: "መለያ ይክፈቱ",
    sections: [
      {
        title: "1. ማን መጫወት ይችላል",
        body: [
          "መለያ ለመክፈትም ሆነ ለመጫወት ዕድሜዎ 18 ወይም ከዚያ በላይ መሆን አለበት። ሲመዘገቡ የልደት ቀንዎን እንጠይቃለን፤ በማንኛውም ጊዜ የዕድሜ ማስረጃ ልንጠይቅ እንችላለን፤ ይህን ደንብ የማያሟሉ መለያዎችን እንዘጋለን።",
          "አንድ ሰው አንድ መለያ ብቻ። መለያ የግል ነው፤ ሊጋራ፣ ሊሸጥ ወይም ለሌላ ሊተላለፍ አይችልም።",
        ],
      },
      {
        title: "2. ዩኒቶች እና ክፍያዎች",
        body: [
          "ዋሌትዎ ዩኒቶችን ይይዛል። 1 ዩኒት = 200 ብር።",
          "ገቢ የሚደረገው በቴሌግራም አስተዳዳሪያችን በኩል ነው (በአንድ ጊዜ ቢያንስ 1,000 ብር፣ ቢበዛ 100,000 ብር)፤ ክፍያውን ካረጋገጥን በኋላ ይገባል።",
          "ገንዘብ ማውጣት በመተግበሪያው ውስጥ ይጠየቃል። ዩኒቶቹ ወዲያውኑ ይያዛሉ፤ ከተመረመረ በኋላ ገንዘቡ ወደ ስልክ ቁጥርዎ ይላካል።",
        ],
      },
      {
        title: "3. ዙሮች እንዴት ይሰራሉ",
        body: [
          "እያንዳንዱ ዙር በትክክል 10 ጨዋታዎች አሉት። የምትጫወቱት ለ10ሩም ጨዋታዎች ውጤት የያዘ ስሊፕ በማስገባት ነው፤ እያንዳንዱ ስሊፕ ሲገባ የዙሩን የመግቢያ ክፍያ ይጠይቃል። ብዙ ስሊፖች ማስገባት ይችላሉ፤ እያንዳንዱ ለብቻው ይወዳደራል።",
          "ዙሩ በመጀመሪያው ጨዋታ መጀመሪያ ሰዓት እስኪቆለፍ ድረስ የገባ ስሊፕን በነጻ ማስተካከል ይችላሉ። ከዚያ በኋላ ስሊፕ ማስገባትም መቀየርም አይቻልም። የገቡ ስሊፖች ተመላሽ አይደረጉም። ዙሩ ሲቆለፍ የሁሉም ስሊፖች ይታያሉ።",
          "ነጥብ አሰጣጥ፦ ትክክለኛ ውጤት 3 ነጥብ፤ ቅርብ (ትክክለኛ አሸናፊ እና በአንድ ጎል ልዩነት፣ ወይም በሁለት ጎል ልዩነት ግን ተመሳሳይ የጎል ልዩነት፣ ለምሳሌ 1-1 እና 2-2) 1.5 ነጥብ፤ ትክክለኛ አሸናፊ 1 ነጥብ፤ የተሳሳተ 0 ነጥብ።",
          "በአንድ ዙር ለትክክለኛ አሸናፊዎች የስላም ነጥቦች፦ 5–7 ትክክል +1፣ 8–9 ትክክል +2፣ 10 ትክክል +3።",
          "የሽልማት ገንዳው የመግቢያ ክፍያዎች ድምር ነው። 70% ለአሸናፊ(ዎች) ይከፈላል፤ 30% የአገልግሎት ክፍያ ነው። ሁልጊዜ አሸናፊ አለ፦ ብዙ ነጥብ ያስመዘገበው ስሊፕ ያሸንፋል፣ ነጥቡ ምንም ያህል ቢሆን። እኩል ሲሆን በብዛት ትክክለኛ አሸናፊ፣ ከዚያ በብዛት ትክክለኛ ውጤት፣ ከዚያ በብዛት ቅርብ ግምት፣ ከዚያ በትንሹ የጎል ልዩነት ይወሰናል፤ አሁንም እኩል የሆኑ ሽልማቱን በእኩል ይካፈላሉ።",
          "የተራዘሙ ወይም የተሰረዙ ጨዋታዎች ለሁሉም 0 ነጥብ ናቸው።",
          "የዕለት ዙሮች በኢትዮጵያ ሰዓት ክፍለ ጊዜ በራሳቸው ይከፈታሉ፦ ጠዋት (ጨዋታ የሚጀምረው 06:00–11:59)፣ ከሰዓት (12:00–18:59) እና ማታ (19:00–23:59)። አንድ ዙር ከራሱ ክፍለ ጊዜ ጨዋታዎችን ብቻ ይወስዳል፤ የሚከፈተውም ክፍለ ጊዜው 10 ጨዋታዎች ሲኖሩት ብቻ ነው። ገበጣሶከር ዙሮችን በእጅም ሊፈጥር ይችላል።",
        ],
      },
      {
        title: "3ለ. የግል ሊጎች እና ቻሌንጆች",
        body: [
          "የሚከፈልባቸው የግል ሊጎች የእያንዳንዱን አባል ስሊፕ #1 ይጠቀማሉ። የሊጉ አሸናፊ(ዎች) ከሊጉ ገንዳ 70% ይቀበላሉ (30% የአገልግሎት ክፍያ)። ብዙ ነጥብ ያለው አባል ሁልጊዜ ያሸንፋል፣ ነጥቡ ምንም ያህል ቢሆን። ነጻ ሊጎች ገንዘብ አያንቀሳቅሱም።",
          "ተጫዋች ከ1 እስከ 10 በሚመጡ ጨዋታዎች ላይ፣ ለእያንዳንዱ ተጫዋች ከ200 እስከ 1,000,000 ብር የውርርድ መጠን ያለው ቻሌንጅ መፍጠር ይችላል። መጠኑ ቻሌንጁ ሲፈጠር ከፈጣሪው ዋሌት፣ ሌሎች ሲቀላቀሉ ደግሞ ከእያንዳንዳቸው ዋሌት ይቀነሳል። መቀላቀል የሚቻለው በዋሌት በቂ ዩኒት ሲኖር ብቻ ነው።",
          "ከተመረጡት ጨዋታዎች የመጀመሪያው እስኪጀመር ድረስ ውጤቶችን በነጻ መቀየር ይቻላል፤ ከዚያ በኋላ ማንም መቀላቀልም ውጤት መቀየርም አይችልም። እስከዚያ ድረስ የሌሎች ተጫዋቾች ግምት ተደብቆ ይቆያል።",
          "ነጥብ አሰጣጡ ከዙሮች ጋር አንድ ነው (3 / 1.5 / 1 / 0፣ የስላም ነጥብ የለም)። የተራዘሙ ወይም የተሰረዙ ጨዋታዎች ለሁሉም 0 ናቸው። ከፍተኛ ድምር ያለው ያሸንፋል፤ እኩል ሲሆን በብዛት ትክክለኛ አሸናፊ፣ በብዛት ትክክለኛ ውጤት፣ በብዛት ቅርብ ግምት እና በትንሹ የጎል ልዩነት ይወሰናል፤ አሁንም እኩል የሆኑ ሽልማቱን በእኩል ይካፈላሉ።",
          "አሸናፊ(ዎች) ከጠቅላላው የውርርድ ገንዘብ 90% ይቀበላሉ፤ 10% የገበጣሶከር ክፍያ ነው። ከመጀመሪያው ጨዋታ በፊት ሌላ ማንም ካልተቀላቀለ፣ ወይም ሁሉም የተመረጡ ጨዋታዎች ከተሰረዙ፣ ሁሉም ገንዘብ ይመለሳል። ሌላ ማንም እስካልተቀላቀለ ድረስ ፈጣሪው ሰርዞ ሙሉ ገንዘቡን መመለስ ይችላል። ከዚህ ውጭ የውርርድ ገንዘብ ተመላሽ አይደረግም።",
        ],
      },
      {
        title: "3ሐ. ገበጣ ፕሪሚየም",
        body: [
          "ገበጣ ፕሪሚየም በፍላጎት የሚገዛ የሚከፈልበት የመረጃ አገልግሎት ነው። ዋጋው ለ30 ቀን 2 ዩኒት (400 ብር) ወይም ለ365 ቀን 20 ዩኒት (4,000 ብር) ሲሆን፣ ሲመዘገቡ ከገበጣሶከር ዋሌትዎ ይከፈላል። ለመግዛት 18 ዓመት ወይም ከዚያ በላይ መሆን እና እረፍት ላይ አለመሆን ያስፈልጋል።",
          "የፕሪሚየም ገጹ ላይ ራስ-ሰር እድሳትን ከጊዜው መጨረሻ በፊት ካላጠፉት በስተቀር፣ ፕሪሚየም በእያንዳንዱ ጊዜ መጨረሻ በተመሳሳይ እቅድና ዋጋ ከዋሌትዎ በራሱ ይታደሳል። ዋሌትዎ በቂ ዩኒት ከሌለው ፕሪሚየሙ በቀላሉ ያበቃል፦ ካለዎት ቀሪ ሂሳብ በላይ አይከፍሉም፣ ዕዳም አይፈጠርም። ፕሪሚየም ንቁ ሆኖ ሳለ እንደገና ከገዙ ጊዜው ላይ ይጨመራል።",
          "ፕሪሚየም የሚያሳየው፦ የዕለት ዙሮች ክፍት ሳሉ ስም የሌለው የብዙሃኑ ግምት (ቢያንስ 5 ስሊፖች ከገቡ በኋላ ብቻ፤ ዙሩ ከተዘጋ በኋላ ለሁሉም ይታያል)፣ ዙሩ ከተዘጋ በኋላ የእያንዳንዱን ተጫዋች ሙሉ ስሊፕ፣ እና ከቅርብ ውጤቶች የተሰላ የቡድኖች አቋም መመሪያ (ግምታዊ የቤት / አቻ / እንግዳ መቶኛ)። እነዚህ ግምትና መረጃ ብቻ ናቸው፤ ነጥብዎን፣ ነጥብ አሰጣጡን ወይም የማሸነፍ ዕድልዎን አይቀይሩም፣ የውርርድ ምክርም አይደሉም።",
          "ፕሪሚየም ያለውም የሌለውም ማንም ሰው ዙሩ ከመዘጋቱ በፊት የሌላ ተጫዋችን ግምት ማየት አይችልም። ፕሪሚየም ለግል ቻሌንጆች ምንም መዳረሻ አይሰጥም።",
          "ለፕሪሚየም የወጣ ዩኒት ተመላሽ አይደረግም፤ በጊዜው መሃል ራስ-ሰር እድሳትን ቢያጠፉም እንኳ። ገበጣሶከር ፕሪሚየምን ማቅረብ ካቆመ እና ንቁ የዓመት ምዝገባ ካለዎት፣ ያልተጠቀሙበት ክፍል ወደ ዋሌትዎ ይመለሳል፦ ከዓመቱ ዋጋ ላይ የተጠቀሙባቸው ወራት በመደበኛው የወር ዋጋ (በወር 400 ብር) ተቀንሰው፤ የተጀመረ ወር እንደተጠቀሙበት ይቆጠራል። ለምሳሌ ከ2 ወር ከ10 ቀን በኋላ 4,000 − 3 × 400 = 2,800 ብር ይመለስልዎታል። ተመላሹ ከዜሮ አያንስም፤ በከፊል ለተጠቀሙበት ወር፣ የወር እቅድንም ጨምሮ፣ ተመላሽ የለም።",
        ],
      },
      {
        title: "4. ፍትሃዊ ጨዋታ",
        body: [
          "ብዙ መለያዎችን፣ አውቶማቲክ መሳሪያዎችን ወይም ማንኛውንም የማጭበርበሪያ ዘዴ መጠቀም መለያው እንዲዘጋና ያለው ገንዘብ እንዲታገድ ያደርጋል።",
          "ዙሩ ከተዘጋ በኋላ በውጤቶችና በነጥብ አሰጣጥ ላይ የምንሰጠው ውሳኔ የመጨረሻ ነው።",
        ],
      },
      {
        title: "5. በኃላፊነት መጫወት",
        body: [
          "ሊያጡት በሚችሉት ገንዘብ ብቻ ይጫወቱ። የጠፋን ገንዘብ ለማስመለስ አይሯሯጡ።",
          "በመገለጫ ገጽዎ ላይ እረፍት መውሰድ ይችላሉ (24 ሰዓት፣ 7 ቀን ወይም 30 ቀን)፤ በዚህ ጊዜ ምንም ውርርድ ማስገባት አይችሉም፤ እረፍቱ ቀድሞ ሊቋረጥ አይችልም። በእረፍት ጊዜም ገንዘብ ማውጣት ይቻላል።",
          "ሳምንታዊ የገቢ ገደብ ማስቀመጥ ይችላሉ (በማንኛውም 7 ቀናት)። መቀነስ ወዲያውኑ ይሰራል፤ መጨመር ወይም ማንሳት ከ7 ቀን በኋላ ይሰራል። ከገደብዎ በላይ ገቢ አንቀበልም።",
          "ውርርድ ማስገባት የሚቻለው የልደት ቀንዎ (18+) በመለያዎ ላይ ከተቀመጠ በኋላ ብቻ ነው።",
          "ከመጠን በላይ እየተጫወቱ እንደሆነ ከተሰማዎት በቴሌግራም ያግኙን፤ መለያዎን እናቆማለን ወይም እንዘጋለን።",
        ],
      },
      {
        title: "6. ግላዊነት",
        body: [
          "አገልግሎቱን ለማስኬድ የተጠቃሚ ስምዎን፣ ስልክ ቁጥርዎን፣ የልደት ቀንዎን፣ አማራጭ ኢሜይልና የመገለጫ ፎቶዎን፣ እንዲሁም የጨዋታና የዋሌት ታሪክዎን እንይዛለን። ሌሎች ተጫዋቾች የሚያዩት የተጠቃሚ ስምዎን፣ ፎቶዎንና ነጥብዎን ብቻ ነው፤ ስልክ ቁጥርዎን፣ ኢሜይልዎን ወይም የልደት ቀንዎን በፍጹም አናሳይም።",
        ],
      },
    ],
  },
};

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: T[lang].metaTitle, description: T[lang].metaDescription, path: "/terms", lang, translated: true });
}

export default async function TermsPage() {
  const site = await getSiteSettings();
  const lang = await getLang();
  const t = T[lang];
  return (
    <div className="relative">
      <SiteHeader loggedIn={false} />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.h1}</h1>
        <p className="mt-3 text-sm text-mist">{t.intro} {t.updated} {new Date().getFullYear()}.</p>
        {t.note && <p className="mt-3 rounded-2xl bg-white/5 p-3 text-xs text-mist">{t.note} <Link href="/terms" hrefLang="en" className="font-semibold text-lilac">English</Link></p>}
        <div className="mt-10 space-y-8">
          {t.sections.map((s) => (
            <section key={s.title} className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
              <h2 className="text-lg font-extrabold text-lilac-soft">{s.title}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-mist">
                {s.body.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-mist">
          {t.questions} <a href={site.telegram_support} target="_blank" rel="noopener noreferrer" className="font-semibold text-lilac">{t.message}</a> ·{" "}
          <Link href="/register" className="font-semibold text-lilac">{t.create}</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
