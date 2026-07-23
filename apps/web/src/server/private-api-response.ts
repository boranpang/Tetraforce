import { NextResponse } from "next/server";

export const PRIVATE_RESPONSE_HEADERS = {
  "cache-control": "no-store, max-age=0",
  "referrer-policy": "no-referrer"
} as const;

export function privateJson<T>(body: T, status: number) {
  return NextResponse.json(body, {
    status,
    headers: PRIVATE_RESPONSE_HEADERS
  });
}
