import {
  PRIVATE_RESPONSE_HEADERS,
  privateJson
} from "../../../../../src/server/private-api-response";
import {
  createSessionSupabaseClient,
  getPublicSupabaseConfig
} from "../../../../../src/server/supabase";
import { TempleSyncStore } from "../../../../../src/server/temple-sync-store";

export async function GET() {
  const config = getPublicSupabaseConfig();
  if (!config) {
    return privateJson(
      { error: "Temple sync state is not configured." },
      503
    );
  }
  const sessionClient = await createSessionSupabaseClient(config);
  const { data } = await sessionClient.auth.getUser();
  if (!data.user) {
    return privateJson({ error: "Authentication is required." }, 401);
  }
  try {
    const state = await new TempleSyncStore(sessionClient).get();
    if (!state) {
      return privateJson({ error: "Persistent Character is required." }, 404);
    }
    return Response.json(state, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch {
    return privateJson(
      { error: "Temple sync state is temporarily unavailable." },
      500
    );
  }
}
