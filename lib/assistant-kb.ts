/**
 * What the help assistant knows: GebetaSoccer's rules and the step-by-step
 * flows that passed testing (13 Nov 2026). Keep it short and true: the
 * assistant must not invent features. Update this when a flow changes.
 */
export const ASSISTANT_KB = `
ABOUT
GebetaSoccer (www.gebetasoccer.com, Telegram bot @GebetaSoccerbot) is Ethiopia's daily football score-prediction game. 18+ only. Money is in Units: 1 Unit = 200 ETB. All times are Ethiopian time (EAT).

ROUNDS
- Rounds open by themselves when a time slot has 10 matches: Morning (kickoffs 06:00-11:59), Evening (12:00-18:59), Night (19:00-23:59). Between weekends or during international breaks there may be no round; they come back with the fixtures.
- Each round has 10 matches. On the Dashboard pick the round, set a score for every match with the up/down arrows (0-15), press Place bet. The entry fee (usually 1 Unit = 200 ETB) comes out of the wallet.
- Picks can be edited for free until the first kickoff; then the round locks and nobody can change or add slips. A player can place more than one slip; each slip costs the entry fee. Slips are not refunded once placed.
- Scoring: exact score 3 points; close (right result and one goal away, or same goal difference two goals away like 1-1 vs 2-2) 1.5; right result only 1; wrong 0. Slam Points for many correct results: 5-7 correct +1, 8-9 +2, all 10 +3. Postponed or cancelled matches score 0 for everyone.
- Prize: the slip with the most points wins 70% of the pool, every round, whatever the score (ties share; tie-breaks: most correct results, most exact scores, most close picks, smallest goal difference). 30% is the GebetaSoccer fee. Results come in automatically and winners are paid to the wallet automatically after the last match.
- Leaderboard shows live points. A player's own picks are always visible; other players' picks become visible after the round locks.

WALLET
- Deposit: send money by Telebirr to GebetaSoccer support on Telegram (the Wallet page has the "Message support" button), quoting your username. Minimum 1,000 ETB (5 Units), maximum 100,000 ETB (500 Units) per deposit. The admin adds it and the player gets a "Deposit received" message on the site and Telegram.
- Withdraw: Wallet -> Withdraw -> number of Units + Telebirr phone -> Request withdrawal. The Units are held straight away (shown as Pending); the admin sends the cash to Telebirr and marks it paid. If rejected, the Units come back to the wallet. 1 Unit always stays in the account.
- History of every deposit, bet, win, withdrawal and Premium payment is on the Wallet page.

ACCOUNT
- Sign up on the website with username, phone (09... or +2519...), date of birth (18+) and password, then confirm the phone with the Telegram bot (tap Verify with Telegram, Start, Share my phone number).
- Log in with phone, username or email + password. Too many wrong passwords lock the login for a while; support can unlock it.
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
- Gives: anonymous crowd picks while a round is open (once 5+ slips), a form guide % on pick cards, and every player's full slip after the lock. It does not change points or the chance to win. Nobody sees picks before the lock.

CHALLENGES AND LEAGUES
- Challenges: pick 1-10 upcoming matches, set a stake, share the link. Friends join with the same stake. Winner gets 90% (10% fee). If nobody joins before the first kickoff, everyone is refunded.
- Private leagues: free (bragging rights) or paid (the winner takes 70% of the league pot).

RESPONSIBLE PLAY
- Profile -> Responsible play: Take a break (24 hours, 7 days or 30 days, can't be ended early; withdrawals still work) and a weekly deposit limit (lowering is immediate, raising waits 7 days).
- Play only with money you can afford to lose.
`;
