/**
 * Stockfish (the chess engine) on the server, for the labelled House Bot.
 * Stockfish.js 19, lite single-threaded WASM, vendored in /engine (GPL-3.0, see engine/Copying.txt).
 * It is loaded by path at run time (not bundled): next.config.ts makes sure /engine ships with the chess routes.
 * The engine is far stronger than any human player; the move time below only decides how long it thinks.
 */
import path from "node:path";
import { createRequire } from "node:module";

interface Engine {
  listener: ((line: string) => void) | null;
  processCommand: (cmd: string) => void;
  terminate: () => void;
}

/** Milliseconds the engine thinks per move (override with CHESS_BOT_MOVETIME_MS, 300 to 6000). */
export function botThinkMs(): number {
  const n = Number(process.env.CHESS_BOT_MOVETIME_MS);
  return Number.isFinite(n) && n >= 300 && n <= 6000 ? Math.round(n) : 1800;
}

/** Parses an engine answer like "e2e4" or "e7e8q". */
export function parseUci(m: string): { from: string; to: string; promotion?: string } | null {
  const x = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(m.trim());
  return x ? { from: x[1], to: x[2], promotion: x[3] } : null;
}

const ENGINE_FILE = () => path.join(process.cwd(), "engine", "stockfish-19-lite-single.js");

let engine: Engine | null = null;
let current: ((m: string | null) => void) | null = null;
let queue: Promise<unknown> = Promise.resolve();

/** One engine per server process, started on first use (starting a second copy of this build in the same process fails). */
function getEngine(): Engine | null {
  if (engine) return engine;
  try {
    const req = createRequire(path.join(process.cwd(), "package.json"));
    delete req.cache[req.resolve(ENGINE_FILE())]; // a fresh copy after a reset
    const make = req(ENGINE_FILE()) as () => Engine;
    const e = make();
    e.listener = (line: string) => {
      const m = /^bestmove (\S+)/.exec(String(line));
      if (m && current) {
        const done = current;
        current = null;
        done(m[1] === "(none)" ? null : m[1]);
      }
    };
    e.processCommand("uci");
    e.processCommand("setoption name Threads value 1");
    e.processCommand("setoption name Hash value 32");
    e.processCommand("setoption name Skill Level value 20");
    engine = e;
    return e;
  } catch {
    engine = null;
    return null;
  }
}

function resetEngine() {
  try {
    engine?.terminate();
  } catch {
    /* already stopped */
  }
  engine = null;
  current = null;
}

/** The best move for the side to move in `fen`, as UCI text, or null when the engine fails. One search at a time. */
export function bestMove(fen: string): Promise<string | null> {
  const run = () =>
    new Promise<string | null>((resolve) => {
      const ms = botThinkMs();
      const eng = getEngine();
      if (!eng) return resolve(null);
      const timer = setTimeout(() => {
        current = null;
        resetEngine(); // stuck: start from scratch next time
        resolve(null);
      }, ms + 10000);
      current = (m) => {
        clearTimeout(timer);
        resolve(m);
      };
      try {
        eng.processCommand("ucinewgame");
        eng.processCommand(`position fen ${fen}`);
        eng.processCommand(`go movetime ${ms}`);
      } catch {
        clearTimeout(timer);
        resetEngine();
        resolve(null);
      }
    });
  const next = queue.then(run, run);
  queue = next.catch(() => null);
  return next;
}
