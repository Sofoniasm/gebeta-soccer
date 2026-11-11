import { headers } from "next/headers";
import { LANG_HEADER, type Lang } from "@/lib/i18n";

/** Language of the current request (set by the proxy for /am/... URLs). */
export async function getLang(): Promise<Lang> {
  try {
    return (await headers()).get(LANG_HEADER) === "am" ? "am" : "en";
  } catch {
    return "en";
  }
}
