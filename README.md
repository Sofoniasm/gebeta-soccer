# GebetaSoccer

Football score-prediction app. Next.js (App Router) + TypeScript + Tailwind CSS v4 + Supabase.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000

## Environment

Copy your Supabase Project URL and anon/publishable key into `.env.local`.
`NEXT_PUBLIC_*` values are visible in the browser by design — data is protected by
Row Level Security in Supabase. Never put the service_role/secret key in a
`NEXT_PUBLIC_` variable.

## Backend (Part 1)

| File | What it does |
|---|---|
| `supabase/migrations/0001_init.sql` | Tables, Row Level Security, wallet ledger, `enter_round`, `admin_add_units`, `settle_round` |
| `lib/scoring.ts` | Points per prediction (3 / 1.5 / 1 / 0) |
| `lib/settlement.ts` | Standings, tie-breaks, payouts after the 30% house cut |
| `lib/money.ts` | 1 unit = 200 ETB helpers |
| `lib/supabase/admin.ts` | Service-role client — server only |
| `app/api/sync-matches/route.ts` | Imports fixtures/results from football-data.org (daily via Vercel Cron) |

Money is never edited directly: every deposit, entry fee and payout is a row in
`wallet_ledger`, and `profiles.balance_units` is kept in sync by a trigger and can't go below 0.
