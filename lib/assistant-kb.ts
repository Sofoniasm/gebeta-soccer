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
- Telegram needs no password. A new player opens the bot (or taps Play in the channel): the bot asks for the date of birth (18+ only; under 18 is declined, a mistyped date can be sent again) and then to share the phone number once (Telegram confirms it is yours). The account is made for you and the Mini App opens straight into it. Players who already have a website account just share their number once and it is confirmed and linked. On a computer, tap "Log in with Telegram", confirm in Telegram and share the number once; after that only confirming in Telegram is needed.
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

QUIZ ROYALE
- Quiz Royale (menu: Quiz Royale, /royale): 3 to 6 friends play 10 football / Ethiopia / general-knowledge questions, 15 seconds each. Everyone pays the same entry (200 to 5,000 ETB). Right answers score 100 points plus up to 100 for speed. The highest score wins their entry back + 90% of the other entries; exact ties share; if nobody scores, or the room doesn't start within 30 minutes, every entry is refunded. Make a room, share the link or code, and press Start when enough players have joined.

SURVIVOR POOLS
- Survivor pools (menu: Survivor, /survivor): 3 to 20 friends, everyone pays the same entry (200 to 5,000 ETB). Each match day (a day with at least 4 matches) every player still alive picks ONE team to win. Win = survive; draw, loss or no pick = out. A team can only be used once per pool; a postponed match keeps you alive. Picks are hidden until the day's first kickoff, and you can change yours until then. The last one standing wins their entry back + 90% of the other entries; if everyone left is out on the same day, or after the longest game (3 to 10 match days), they share. A pool that doesn't start within 3 days is refunded in full.

GEBETA 1 VS 1
- Gebeta 1 vs 1 (menu: Gebeta 1v1, /gebeta): the Ethiopian seed game for two players. Each pays the same stake (200 to 5,000 ETB). Six pits each with four seeds. Pick a pit and its seeds are dropped one by one round the board; the last seed in your own store = play again; the last seed in an empty pit of yours = you capture the seeds opposite. When one side is empty the other player keeps their remaining seeds; most seeds wins. The winner gets their stake back + 90% of the opponent's stake; a draw returns both stakes. 60 seconds per move: running out of time loses. If nobody joins within 30 minutes the stake is refunded.

DAMA 1 VS 1
- Dama 1 vs 1 (menu: Dama 1v1, /dama): Ethiopian draughts for two players on an 8x8 board, 16 men each. Each pays the same stake (200 to 5,000 ETB). Men step one square forward or sideways (never diagonally or back). Jump over an adjacent enemy to capture: you MUST capture when you can and keep jumping with the same piece. A man reaching the far row becomes a king that moves and captures along any line. You win by capturing everything or leaving your opponent with no legal move. The winner gets their stake back + 90% of the opponent's stake; 60 moves in a row without a capture = draw, stakes returned. 60 seconds per move: running out of time loses. If nobody joins within 30 minutes the stake is refunded.

CHESS 1 VS 1
- Chess 1 vs 1 (menu: Games, then Chess, /chess): normal chess for two players. Each pays the same stake (200 to 5,000 ETB); colours are drawn at random. Every move is checked by the server (castling, en passant, promotion, check, checkmate). Checkmate wins; the winner gets their stake back + 90% of the opponent's stake. Stalemate, insufficient material or the 50-move rule = draw, both stakes returned. 2 minutes per move: running out of time loses; you can also resign. If nobody joins within 30 minutes the stake is refunded.
- Chess House Bot: when you create a Chess game that is "Open to anyone" with a 200 ETB stake and nobody joins within 2 minutes, a clearly labelled computer player (the House Bot, Stockfish) may join. It plays very strongly, is limited to a few games per player per day, and pays winners from the house wallet. Other players see your open game in the Chess lobby and can join it first. If you don't want the bot, untick "Open to anyone" and send the link to a friend.

CHALLENGES AND LEAGUES
- Challenges: pick 1-10 upcoming matches, set a stake, share the link. Friends join with the same stake. Winner gets their own stake back plus 90% of the other stakes (10% fee only on the money won from others; 2 x 300 ETB: the winner gets 570 ETB). If nobody joins before the first kickoff, everyone is refunded.
- Private leagues: free (bragging rights) or paid (the winner gets their fee back plus 70% of the other fees).

RESPONSIBLE PLAY
- Profile -> Responsible play: Take a break (24 hours, 7 days or 30 days, can't be ended early; withdrawals still work) and a weekly deposit limit (lowering is immediate, raising waits 7 days).
- Play only with money you can afford to lose.
`;
