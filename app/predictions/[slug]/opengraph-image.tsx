import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { idFromSlug } from "@/lib/predictions";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "GebetaSoccer match prediction";

/** Share card for a match prediction page: teams, our tip (or result), kickoff. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const id = idFromSlug(slug);
  let home = "Home";
  let away = "Away";
  let line = "Match prediction";
  let big = "VS";
  let comp = "";
  try {
    if (id && SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
      const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
      const [{ data: m }, { data: p }] = await Promise.all([
        sb.from("matches").select("home_team, away_team, kickoff_at, status, actual_home_score, actual_away_score, competition").eq("id", id).maybeSingle(),
        sb.from("match_previews").select("pick_home, pick_away").eq("match_id", id).maybeSingle(),
      ]);
      if (m) {
        home = m.home_team;
        away = m.away_team;
        comp = m.competition ?? "";
        const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(m.kickoff_at));
        if (m.status === "finished" && m.actual_home_score !== null) {
          big = `${m.actual_home_score} - ${m.actual_away_score}`;
          line = "Full time";
        } else if (p) {
          big = `${p.pick_home} - ${p.pick_away}`;
          line = `Our prediction · ${when} EAT`;
        } else {
          line = `Kickoff ${when} EAT`;
        }
      }
    }
  } catch {
    /* fall back to the generic card */
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          background: "linear-gradient(135deg, #0b0912 0%, #2a2342 55%, #4a3f86 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#b4a7f5", fontWeight: 700 }}>
          <span>GebetaSoccer</span>
          <span style={{ color: "#c9c3e0" }}>{comp}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 64, fontWeight: 800, width: 400, display: "flex", justifyContent: "flex-end", textAlign: "right" }}>{home}</span>
          <span style={{ fontSize: 96, fontWeight: 800, color: "#d9d2ff", padding: "0 40px" }}>{big}</span>
          <span style={{ fontSize: 64, fontWeight: 800, width: 400, display: "flex" }}>{away}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: "#c9c3e0" }}>
          <span>{line}</span>
          <span style={{ color: "#b4a7f5", fontWeight: 700 }}>gebetasoccer.com</span>
        </div>
      </div>
    ),
    size,
  );
}
