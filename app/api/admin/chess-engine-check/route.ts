/**
 * GET /api/admin/chess-engine-check — admin only. Tells why the House Bot's chess engine does or does not run
 * on the server: where the engine files are, whether Stockfish starts, and the move it plays from the start position.
 */
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { bestMove } from "@/lib/stockfish";
import { botMoveWhy } from "@/lib/chess-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "admin only" }, { status: 403 });

  // ?code=CH-XXXXXX: try to play the House Bot's move in that game and say why it did or did not move
  const code = new URL(req.url).searchParams.get("code");
  if (code) return NextResponse.json({ code, result: await botMoveWhy(code.toUpperCase().slice(0, 12)) });

  const cwd = process.cwd();
  const dir = path.join(cwd, "engine");
  let files: string[] | string;
  try {
    files = fs.readdirSync(dir);
  } catch (e) {
    files = `cannot read ${dir}: ${(e as Error).message}`;
  }
  const t0 = Date.now();
  let move: string | null = null;
  let error: string | null = null;
  try {
    move = await bestMove("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  } catch (e) {
    error = (e as Error).message;
  }
  return NextResponse.json({ cwd, files, move, error, ms: Date.now() - t0, node: process.version });
}
