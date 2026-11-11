export interface NewsPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_image: string;
  tag: string;
  published_at: string;
}

export function formatNewsDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(iso));
}
