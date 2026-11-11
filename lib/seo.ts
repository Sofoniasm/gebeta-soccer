/**
 * SEO helpers: one function for every public page's title, description,
 * canonical URL and share card, plus the site-wide structured data.
 */
import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";
import { TELEGRAM_URL } from "@/lib/config";

export const BRAND = "GebetaSoccer";
export const DEFAULT_DESCRIPTION =
  "GebetaSoccer is Ethiopia's weekly football score predictor. Predict 10 big matches from the Premier League and top European leagues, climb the leaderboard and win the prize pool in birr. Free private leagues with friends. 18+.";

export function pageMeta({
  title,
  description,
  path,
  image = "/og.png",
  type = "website",
  publishedTime,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: "website" | "article";
  publishedTime?: string;
}): Metadata {
  const url = `${SITE_URL}${path}`;
  const fullTitle = title.includes(BRAND) ? title : `${title} | ${BRAND}`;
  return {
    title: fullTitle,
    description,
    alternates: { canonical: url },
    openGraph: {
      type,
      url,
      title: fullTitle,
      description,
      siteName: BRAND,
      locale: "en_ET",
      images: [{ url: image, width: 1080, height: 1080, alt: BRAND }],
      ...(publishedTime ? { publishedTime } : {}),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image] },
  };
}

/** Organization + WebSite + WebApplication — who we are, for Google and AI assistants. */
export function siteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: BRAND,
        url: SITE_URL,
        logo: `${SITE_URL}/icon-512.png`,
        sameAs: [TELEGRAM_URL],
        areaServed: { "@type": "Country", name: "Ethiopia" },
        contactPoint: { "@type": "ContactPoint", contactType: "customer support", url: TELEGRAM_URL, availableLanguage: ["English", "Amharic"] },
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: BRAND,
        description: DEFAULT_DESCRIPTION,
        inLanguage: "en",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "WebApplication",
        "@id": `${SITE_URL}/#app`,
        name: BRAND,
        url: SITE_URL,
        applicationCategory: "GameApplication",
        operatingSystem: "Web, Android, iOS, Telegram",
        description:
          "Weekly football prediction game: predict the score of 10 matches. Exact score 3 points, close 1.5, correct result 1, plus Slam Points. The top slip with more than 15 of 30 points takes 70% of the pool. Private challenges against friends on 1 to 10 matches.",
        audience: { "@type": "PeopleAudience", suggestedMinAge: 18 },
        areaServed: { "@type": "Country", name: "Ethiopia" },
        offers: { "@type": "Offer", price: "200", priceCurrency: "ETB", description: "Typical entry: 1 Unit = 200 ETB per round" },
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
    ],
  };
}

export function faqJsonLd(faq: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${SITE_URL}${it.path}` })),
  };
}
