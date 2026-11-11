/**
 * Renders an article body written in simple formatting:
 *   blank line        new paragraph
 *   ## Heading        section heading (### for a smaller one)
 *   - item            bullet list (one item per line)
 *   > text            highlighted quote
 *   ![caption](url)   picture on its own line
 *   **bold**  [link text](https://...)
 * Everything is rendered as React elements, never as raw HTML.
 */
import type { ReactNode } from "react";

const safeHref = (url: string) => (/^(https?:\/\/|\/)/i.test(url) ? url : null);

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      out.push(<strong key={`${key}b${i++}`} className="font-bold text-white">{m[1]}</strong>);
    } else {
      const href = safeHref(m[3]);
      out.push(
        href ? (
          <a
            key={`${key}a${i++}`}
            href={href}
            className="font-semibold text-lilac underline decoration-lilac/40 underline-offset-2 hover:text-lilac-soft"
            {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {m[2]}
          </a>
        ) : (
          m[2]
        ),
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withBreaks(text: string, key: string): ReactNode[] {
  return text.split("\n").flatMap((line, i) => (i === 0 ? inline(line, `${key}l${i}`) : [<br key={`${key}br${i}`} />, ...inline(line, `${key}l${i}`)]));
}

export function NewsBody({ body }: { body: string }) {
  const blocks = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((b, i) => {
        const k = `b${i}`;
        const img = b.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (img && safeHref(img[2])) {
          return (
            <figure key={k} className="my-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img[2]} alt={img[1]} loading="lazy" className="w-full rounded-3xl border border-white/10" />
              {img[1] && <figcaption className="mt-2 text-center text-xs text-mist">{img[1]}</figcaption>}
            </figure>
          );
        }
        if (b.startsWith("### ")) return <h3 key={k} className="pt-2 text-lg font-extrabold text-white sm:text-xl">{inline(b.slice(4), k)}</h3>;
        if (b.startsWith("## ")) return <h2 key={k} className="pt-4 text-xl font-extrabold text-white sm:text-2xl">{inline(b.slice(3), k)}</h2>;
        const lines = b.split("\n");
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return (
            <ul key={k} className="space-y-2 pl-1">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-3">
                  <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-lilac" />
                  <span>{inline(l.replace(/^[-*]\s+/, ""), `${k}i${j}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        if (lines.every((l) => l.startsWith(">"))) {
          return (
            <blockquote key={k} className="rounded-2xl border-l-4 border-lilac bg-lilac/10 px-5 py-4 font-semibold text-white">
              {withBreaks(lines.map((l) => l.replace(/^>\s?/, "")).join("\n"), k)}
            </blockquote>
          );
        }
        return <p key={k}>{withBreaks(b, k)}</p>;
      })}
    </>
  );
}
