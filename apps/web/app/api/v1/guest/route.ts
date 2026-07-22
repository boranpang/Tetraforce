import { randomInt, randomUUID } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Attributes, GuestState } from "@tetraforce/contracts";

import { getGuestConfig } from "../../../../src/server/guest-config";
import {
  createGuestState,
  openGuestState,
  sealGuestState,
  settleGuestState
} from "../../../../src/server/guest-state";

const COOKIE_NAME = "tetraforce_guest";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;
const adjectives = ["Brave", "Quiet", "Swift", "Bright", "Kind", "Bold"];
const animals = ["Moth", "Fox", "Hare", "Owl", "Lynx", "Crane"];

export async function GET() {
  const config = getGuestConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      return NextResponse.json(openGuestState(token, config.secret));
    } catch {
      return NextResponse.json(
        { error: "Guest state is invalid. Clear site data to start a new session." },
        { status: 400 }
      );
    }
  }

  const guest = createNewGuestState();
  return withGuestCookie(NextResponse.json(guest), guest, config.secret);
}

export async function POST(request: Request) {
  const config = getGuestConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ error: "Guest state is missing." }, { status: 400 });
  }

  try {
    const guest = openGuestState(token, config.secret);
    const body = (await request.json()) as { allocation?: Attributes };
    const settled = settleGuestState(guest, body.allocation as Attributes, config.rules);
    return withGuestCookie(NextResponse.json(settled), settled, config.secret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Guest state is invalid.";
    const status = message === "Initial allocation is already complete." ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function createNewGuestState(): GuestState {
  const adjective = adjectives[randomInt(adjectives.length)];
  const animal = animals[randomInt(animals.length)];
  const suffix = randomInt(100, 1000);

  return createGuestState({
    id: randomUUID(),
    name: `${adjective}${animal}-${suffix}`,
    issuedAt: new Date().toISOString()
  });
}

function withGuestCookie(response: NextResponse, guest: GuestState, secret: string) {
  response.cookies.set(COOKIE_NAME, sealGuestState(guest, secret), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/"
  });
  return response;
}
