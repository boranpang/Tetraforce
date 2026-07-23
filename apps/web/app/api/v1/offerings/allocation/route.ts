import {
  privateJson
} from "../../../../../src/server/private-api-response";
import {
  offeringError
} from "../route";
import {
  submitBlessingAllocation
} from "../../../../../src/server/offering-service";
import { SupabaseOfferingStore } from "../../../../../src/server/supabase-offering-store";
import {
  createServiceSupabaseClient,
  createSessionSupabaseClient,
  getServerSupabaseConfig,
  toVerifiedAuthUser
} from "../../../../../src/server/supabase";

export async function POST(request: Request) {
  const config = getServerSupabaseConfig();
  if (!config) {
    return offeringError(new Error("Offering is not configured."));
  }
  const sessionClient = await createSessionSupabaseClient(config);
  const { data } = await sessionClient.auth.getUser();
  if (!data.user) {
    return privateJson({ error: "Authentication is required." }, 401);
  }

  let body: { offeringId?: unknown; allocation?: unknown };
  try {
    body = (await request.json()) as {
      offeringId?: unknown;
      allocation?: unknown;
    };
  } catch {
    body = {};
  }

  try {
    const result = await submitBlessingAllocation({
      authUser: toVerifiedAuthUser(data.user),
      offeringId: typeof body.offeringId === "string" ? body.offeringId : "",
      allocation: body.allocation,
      store: new SupabaseOfferingStore(createServiceSupabaseClient(config))
    });
    return privateJson(result, 200);
  } catch (error) {
    return offeringError(error);
  }
}
