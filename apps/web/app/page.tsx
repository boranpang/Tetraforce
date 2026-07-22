import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const language = (await headers()).get("accept-language") ?? "";
  redirect(language.toLowerCase().startsWith("zh") ? "/zh" : "/en");
}
