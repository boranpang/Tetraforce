import { NextResponse, type NextRequest } from "next/server";

import { isLocale } from "../../../../../src/i18n";
import {
  createSessionSupabaseClient,
  getPublicSupabaseConfig
} from "../../../../../src/server/supabase";

export async function GET(request: NextRequest) {
  const requestedLocale = request.nextUrl.searchParams.get("locale") ?? "en";
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const destination = new URL(`/${locale}`, request.nextUrl.origin);
  const code = request.nextUrl.searchParams.get("code");
  const config = getPublicSupabaseConfig();

  if (!code || !config) {
    destination.searchParams.set("binding", "error");
    return NextResponse.redirect(destination);
  }

  const supabase = await createSessionSupabaseClient(config);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  destination.searchParams.set("binding", error ? "error" : "complete");
  return NextResponse.redirect(destination);
}
