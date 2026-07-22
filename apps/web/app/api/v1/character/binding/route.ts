import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  completeCharacterBinding,
  getCharacterBindingState
} from "../../../../../src/server/binding-service";
import { getGuestConfig } from "../../../../../src/server/guest-config";
import { GUEST_COOKIE_NAME } from "../../../../../src/server/guest-cookie";
import { openGuestState } from "../../../../../src/server/guest-state";
import {
  BindingRateLimitError,
  GameNameConflictError,
  SupabaseBindingStore
} from "../../../../../src/server/supabase-binding-store";
import {
  createServiceSupabaseClient,
  createSessionSupabaseClient,
  getPublicSupabaseConfig,
  getServerSupabaseConfig,
  toVerifiedAuthUser
} from "../../../../../src/server/supabase";

export async function GET() {
  const publicConfig = getPublicSupabaseConfig();
  if (!publicConfig) {
    return NextResponse.json({ status: "unavailable" });
  }

  const sessionClient = await createSessionSupabaseClient(publicConfig);
  const { data } = await sessionClient.auth.getUser();
  const state = await getCharacterBindingState(
    data.user ? toVerifiedAuthUser(data.user) : null,
    new SupabaseBindingStore(sessionClient, null)
  );

  const response = NextResponse.json(state);
  if (state.status === "active") {
    clearGuestCookie(response);
  }
  return response;
}

export async function POST(request: Request) {
  const config = getServerSupabaseConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Character binding is not configured." },
      { status: 503 }
    );
  }

  const sessionClient = await createSessionSupabaseClient(config);
  const { data } = await sessionClient.auth.getUser();
  if (!data.user) {
    return NextResponse.json({ error: "GitHub authentication is required." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const guestToken = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  if (!guestToken) {
    return NextResponse.json({ error: "Guest Character state is missing." }, { status: 400 });
  }

  try {
    const body = (await request.json()) as {
      gameName?: unknown;
      acceptedTerms?: unknown;
      acceptedPrivacy?: unknown;
    };
    const result = await completeCharacterBinding({
      authUser: toVerifiedAuthUser(data.user),
      guest: openGuestState(guestToken, getGuestConfig().secret),
      gameName: typeof body.gameName === "string" ? body.gameName : "",
      acceptedTerms: body.acceptedTerms === true,
      acceptedPrivacy: body.acceptedPrivacy === true,
      store: new SupabaseBindingStore(
        sessionClient,
        createServiceSupabaseClient(config)
      )
    });

    const response = NextResponse.json({ status: "active", ...result });
    clearGuestCookie(response);
    return response;
  } catch (error) {
    if (error instanceof BindingRateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof GameNameConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : "Character binding failed.";
    const isExpectedValidationError = [
      "Current Terms and Privacy consent is required.",
      "Game Name must contain 3-16 characters.",
      "Game Name may contain only letters, numbers, and underscore.",
      "Game Name is reserved.",
      "Guest Character must complete Initial Allocation before binding.",
      "Guest Character state is invalid.",
      "Guest state signature is invalid."
    ].includes(message);

    return NextResponse.json(
      { error: isExpectedValidationError ? message : "Character binding failed." },
      { status: isExpectedValidationError ? 400 : 500 }
    );
  }
}

function clearGuestCookie(response: NextResponse) {
  response.cookies.set(GUEST_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}
