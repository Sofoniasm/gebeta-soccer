import Link from "next/link";
import { getMe } from "@/lib/me";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Games · GebetaSoccer", description: "Daily quiz, Quiz Royale, Survivor pools, Gebeta and Dama: play with friends." };
export const dynamic = "force-dynamic";

const GAMES = [
  {
    href: "/quiz",
    emoji: "🧠",
    title: "Daily Quiz",
    tag: "Free · solo",
    text: "5 football questions a day, 20 seconds each. Climb the monthly leaderboard.",
  },
  {
    href: "/royale",
    emoji: "⚡",
    title: "Quiz Royale",
    tag: "3-6 players · stake",
    text: "10 fast questions, 15 seconds each. Highest score takes the pot.",
  },
  {
    href: "/survivor",
    emoji: "🛡️",
    title: "Survivor pools",
    tag: "3-20 players · stake",
    text: "Pick one winning team every match day. Lose or draw and you're out. Last one standing wins.",
  },
  {
    href: "/gebeta",
    emoji: "🎲",
    title: "Gebeta 1 vs 1",
    tag: "2 players · stake",
    text: "The Ethiopian seed game. Sow, capture, go again. Most seeds wins your opponent's stake.",
  },
  {
    href: "/dama",
    emoji: "♟️",
    title: "Dama 1 vs 1",
    tag: "2 players · stake",
    text: "Ethiopian draughts. Jump to capture, crown a king, block your opponent.",
  },
];

export default async function GamesPage() {
  await getMe("/games");
  return (
    <AppShell title="Games" next="/games">
      <p className="mb-5 max-w-xl text-sm text-mist">
        Pick a game. Paid games use your wallet: everyone pays the same stake, the winner takes their stake back plus 90% of the others&apos;. Invite friends with a link.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {GAMES.map((g) => (
          <Link
            key={g.href}
            href={g.href}
            className="group relative overflow-hidden rounded-[2rem] border border-white/5 bg-card/60 p-5 transition hover:border-lilac/40 hover:bg-card sm:p-6"
          >
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-lilac/10 blur-2xl transition group-hover:bg-lilac/25" />
            <p className="text-4xl">{g.emoji}</p>
            <h2 className="mt-3 text-lg font-extrabold">{g.title}</h2>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-lilac-soft">{g.tag}</p>
            <p className="mt-2 text-sm text-mist">{g.text}</p>
            <p className="mt-4 text-xs font-bold uppercase tracking-widest text-lilac group-hover:text-lilac-soft">Play →</p>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
