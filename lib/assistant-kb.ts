/**
 * What the help assistant knows: GebetaSoccer's rules and the step-by-step
 * flows that passed testing (updated 19 Nov 2026). Keep it short and true: the
 * assistant must not invent features. Update this when a flow changes.
 */
export const ASSISTANT_KB = `
ABOUT
GebetaSoccer (www.gebetasoccer.com, Telegram bot @GebetaSoccerbot) is Ethiopia's daily football score-prediction game. 18+ only. Money is in Units: 1 Unit = 200 ETB. All times are Ethiopian time (EAT).

ROUNDS
- Rounds open by themselves when a time slot has 5 to 10 matches (the 10 earliest if there are more): Late night / የሌሊት (kickoffs 00:00-05:59), Morning / የጠዋት (06:00-11:59), Evening / የከሰዓት (12:00-18:59), Night / የምሽት (19:00-23:59). Round names show the Amharic name first, e.g. "የከሰዓት 10 · Evening · Sat 21 Nov" (10 = number of matches). Rounds appear up to 4 days ahead; fixtures are checked every 2 hours. Between weekends or during international breaks there may be no round; they come back with the fixtures.
- Each round has 5 to 10 matches. On the Dashboard pick the round, set a score for every match with the up/down arrows (0-15), press Place bet. The entry fee (usually 1 Unit = 200 ETB) comes out of the wallet.
- Picks can be edited for free until the first kickoff; then the round locks and nobody can change or add slips. A player can place more than one slip; each slip costs the entry fee. Slips are not refunded once placed.
- Scoring: exact score 3 points; close (right result and one goal away, or same goal difference two goals away like 1-1 vs 2-2) 1.5; right result only 1; wrong 0. Slam Points for many correct results: 5-7 correct +1, 8-9 +2, all 10 +3. Postponed or cancelled matches score 0 for everyone.
- Prize: the slip with the most points gets its own stake back plus 70% of all the other stakes, every round, whatever the score (ties share; tie-breaks: most correct results, most exact scores, most close picks, smallest goal difference). The 30% GebetaSoccer fee is taken only from the money won from other players, never from the winner's own stake (2 players x 200 ETB: the winner gets 340 ETB). Results come in automatically and winners are paid to the wallet automatically after the last match. If you are the only player, your stake is refunded (you never win only your own money); the card shows "Waiting for players" until someone else joins.
- "You can win" on a round card counts only the money you would win from other players after the 30% fee (it does not include your own stake). Tap it for the breakdown: stake back, from others, from your own other slips, You get, You paid, Profit. If you place several slips, each is a separate bet: the winning slip takes 70% of your other slips' stakes too, so the fee also applies to them.
- Daily Football Quiz (menu: Quiz, /quiz): free, no entry fee and no prizes. 5 multiple-choice questions a day, 20 seconds each, 1 point per right answer, one try per question. New quiz at midnight Addis time. Monthly quiz Top 10 on the same page.
- Leaderboard shows live points. A player's own picks are always visible; other players' picks are visible only to Premium members (after the lock). Round cards refresh by themselves every 30 seconds.

WALLET
- Deposit: send money by Telebirr to GebetaSoccer support on Telegram (the Wallet page has the "Message support" button), quoting your username. Minimum 1,000 ETB (5 Units), maximum 100,000 ETB (500 Units) per deposit. The admin adds it and the player gets a "Deposit received" message on the site and Telegram.
- Withdraw: Wallet -> Withdraw -> number of Units + Telebirr phone -> Request withdrawal. The Units are held straight away (shown as Pending); the admin sends the cash to Telebirr and marks it paid. If rejected, the Units come back to the wallet. 1 Unit always stays in the account.
- History of every deposit, bet, win, withdrawal and Premium payment is on the Wallet page.

ACCOUNT
- Sign up on the website with username, phone (09... or +2519...), date of birth (18+) and password, then confirm the phone with the Telegram bot (tap Verify with Telegram, Start, Share my phone number).
- Telegram needs no password: in the Telegram app tap Play, then "Continue with my Telegram number" and share your number once (Telegram confirms it is yours). A new account is made for you, or your website account is confirmed and linked. The first time the app asks for your date of birth (18+ only) and to accept the Terms. On a computer, tap "Log in with Telegram", confirm in Telegram and share the number once; after that only confirming in Telegram is needed.
- Or log in with phone, username or email + password. Too many wrong passwords lock the login for a while; support can unlock it.
- Forgot password: Log in -> Forgot password? -> phone number -> Send me a code -> type the 6-digit code from @GebetaSoccerbot and the new password twice. The code works 10 minutes; 5 wrong codes lock it (ask for a new code). Needs Telegram linked to the account.
- Change password: Profile -> Change password.
- Date of birth must be added once (18+) before playing; it can't be changed later.
- Language: EN / Amharic switch at the top; the bot: /amharic or /english.

TELEGRAM
- Bot @GebetaSoccerbot: /start, /rounds (open rounds and pots), /balance, /settings, /help. Tap Play (or Open) to use GebetaSoccer inside Telegram with the same account.
- First time in the Telegram app after signing up on the website: tap "Continue with my Telegram number" and Share once; the account links and opens straight away from then on.
- Deposits, withdrawals, wins and password codes are sent by the bot to players whose Telegram is linked.

PREMIUM (optional)
- Monthly 2 Units (400 ETB, 30 days) or yearly 20 Units (4,000 ETB, 365 days), paid from the wallet on the Premium page. Starts the moment you pay; buying again adds the time after the current end date. Renews automatically unless turned off on the Premium page. Not refunded.
- Gives: anonymous crowd picks while a round is open (once 5+ slips), a form guide % on pick cards, and every player's full slip after the lock (free players never see other players' picks, also not after the lock). It does not change points or the chance to win. Nobody sees picks before the lock.

CHALLENGES AND LEAGUES
- Challenges: pick 1-10 upcoming matches, set a stake, share the link. Friends join with the same stake. Winner gets their own stake back plus 90% of the other stakes (10% fee only on the money won from others; 2 x 300 ETB: the winner gets 570 ETB). If nobody joins before the first kickoff, everyone is refunded.
- Private leagues: free (bragging rights) or paid (the winner gets their fee back plus 70% of the other fees).

RESPONSIBLE PLAY
- Profile -> Responsible play: Take a break (24 hours, 7 days or 30 days, can't be ended early; withdrawals still work) and a weekly deposit limit (lowering is immediate, raising waits 7 days).
- Play only with money you can afford to lose.
`;
