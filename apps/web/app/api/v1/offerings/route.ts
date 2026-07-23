import {
  PRIVATE_RESPONSE_HEADERS,
  privateJson
} from "../../../../src/server/private-api-response";
import { getOfferingConfig } from "../../../../src/server/offering-config";
import {
  BlessingAllocationNotFoundError,
  InvalidBlessingAllocationError,
  InvalidOfferingRequestError,
  OfferingCollectorRequiredError,
  OfferingCooldownError,
  OfferingPendingAllocationError,
  OfferingTokensRequiredError,
  createBlessingOffering,
  createSecureRandomSource
} from "../../../../src/server/offering-service";
import { SupabaseOfferingStore } from "../../../../src/server/supabase-offering-store";
import {
  createServiceSupabaseClient,
  createSessionSupabaseClient,
  getServerSupabaseConfig,
  toVerifiedAuthUser
} from "../../../../src/server/supabase";

export async function POST(request: Request) {
  const config = getServerSupabaseConfig();
  if (!config) {
    return unavailable();
  }
  const sessionClient = await createSessionSupabaseClient(config);
  const { data } = await sessionClient.auth.getUser();
  if (!data.user) {
    return privateJson({ error: "Authentication is required." }, 401);
  }

  let body: { idempotencyKey?: unknown };
  try {
    body = (await request.json()) as { idempotencyKey?: unknown };
  } catch {
    return invalidRequest();
  }

  try {
    const result = await createBlessingOffering({
      authUser: toVerifiedAuthUser(data.user),
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
      config: getOfferingConfig(),
      random: createSecureRandomSource(),
      store: new SupabaseOfferingStore(createServiceSupabaseClient(config))
    });
    return Response.json(result, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    return offeringError(error);
  }
}

export function offeringError(error: unknown) {
  if (error instanceof InvalidOfferingRequestError) {
    return invalidRequest();
  }
  if (error instanceof OfferingPendingAllocationError) {
    return privateJson(
      {
        code: "OFFERING_PENDING_ALLOCATION",
        error: error.message
      },
      409
    );
  }
  if (error instanceof OfferingCooldownError) {
    return privateJson(
      { code: "OFFERING_COOLDOWN", error: error.message },
      409
    );
  }
  if (error instanceof OfferingCollectorRequiredError) {
    return privateJson(
      { code: "OFFERING_COLLECTOR_REQUIRED", error: error.message },
      409
    );
  }
  if (error instanceof OfferingTokensRequiredError) {
    return privateJson(
      { code: "OFFERING_TOKENS_REQUIRED", error: error.message },
      409
    );
  }
  if (error instanceof InvalidBlessingAllocationError) {
    return privateJson(
      { code: "BLESSING_ALLOCATION_INVALID", error: error.message },
      400
    );
  }
  if (error instanceof BlessingAllocationNotFoundError) {
    return privateJson(
      { code: "BLESSING_ALLOCATION_NOT_FOUND", error: error.message },
      409
    );
  }
  return unavailable();
}

function invalidRequest() {
  return privateJson(
    {
      code: "OFFERING_REQUEST_INVALID",
      error: "Offering request is invalid."
    },
    400
  );
}

function unavailable() {
  return privateJson(
    {
      code: "OFFERING_UNAVAILABLE",
      error: "Offering settlement is temporarily unavailable."
    },
    503
  );
}
