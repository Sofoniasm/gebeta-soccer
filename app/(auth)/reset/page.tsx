import { redirect } from "next/navigation";

/** Old reset links (before codes) now go to the code page. */
export default function ResetPage() {
  redirect("/forgot");
}
