import { NextResponse, type NextRequest } from "next/server";

import { isLocale } from "../../../../../src/i18n";
import {
  createSessionSupabaseClient,
  getPublicSupabaseConfig
} from "../../../../../src/server/supabase";

export async function GET(request: NextRequest) {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return NextResponse.json({ error: "GitHub authentication is not configured." }, { status: 503 });
  }

  const requestedLocale = request.nextUrl.searchParams.get("locale") ?? "en";
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const callbackUrl = new URL("/api/v1/auth/callback", request.nextUrl.origin);
  callbackUrl.searchParams.set("locale", locale);

  const supabase = await createSessionSupabaseClient(config);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: callbackUrl.toString() }
  });

  if (error || !data.url) {
    return NextResponse.json({ error: "GitHub authentication could not start." }, { status: 502 });
  }

  return NextResponse.redirect(data.url);
}
