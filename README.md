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
