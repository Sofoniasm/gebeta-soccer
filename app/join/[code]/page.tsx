import { redirect } from "next/navigation";

/** Invite links: <site>/join/GEBETA-X7F9 → the league page (login first if needed). */
export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/leagues/${encodeURIComponent(decodeURIComponent(code).toUpperCase())}`);
}
