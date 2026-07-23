import { NextResponse } from "next/server";

import { COLLECTOR_VERSION_HEADER } from "@tetraforce/contracts";
import { getDeviceSecretService } from "../../../../src/server/device-secrets";
import {
  PRIVATE_RESPONSE_HEADERS,
  privateJson
} from "../../../../src/server/private-api-response";
import { createServiceSupabaseClient, getServerSupabaseConfig } from "../../../../src/server/supabase";
import { SupabaseUsageSyncStore } from "../../../../src/server/supabase-usage-sync-store";
import {
  CollectorUpgradeRequiredError,
  InvalidSyncCredentialError,
  InvalidUsageSummariesError,
  UsageCounterRollbackError,
  UsageWindowInvalidError,
  syncUsageSummaries
} from "../../../../src/server/usage-sync-service";

export async function POST(request: Request) {
  const config = getServerSupabaseConfig();
  const secrets = getDeviceSecretService();
  if (!config || !secrets) {
    return privateJson(
      {
        code: "USAGE_SYNC_UNAVAILABLE",
        error: "Usage Summary sync is not configured."
      },
      503
    );
  }

  let summaries: unknown;
  try {
    summaries = await request.json();
  } catch {
    return invalidSummaries();
  }

  try {
    const result = await syncUsageSummaries({
      credential: bearerCredential(request),
      collectorVersion: request.headers.get(COLLECTOR_VERSION_HEADER) ?? "",
      summaries,
      secrets,
      store: new SupabaseUsageSyncStore(createServiceSupabaseClient(config))
    });
    return NextResponse.json(result, {
      headers: PRIVATE_RESPONSE_HEADERS
    });
  } catch (error) {
    if (error instanceof CollectorUpgradeRequiredError) {
      return privateJson(
        {
          code: "COLLECTOR_UPGRADE_REQUIRED",
          error:
            "This Collector version is no longer supported. Run npx tetraforce@latest init --upgrade."
        },
        426
      );
    }
    if (error instanceof InvalidSyncCredentialError) {
      return privateJson(
        {
          code: "DEVICE_CREDENTIAL_INVALID",
          error: "Device credential is invalid, revoked, or expired."
        },
        401
      );
    }
    if (error instanceof InvalidUsageSummariesError) {
      return invalidSummaries();
    }
    if (error instanceof UsageCounterRollbackError) {
      return privateJson(
        {
          code: "USAGE_COUNTER_ROLLBACK",
          error: "Usage Summary counters cannot move backward."
        },
        409
      );
    }
    if (error instanceof UsageWindowInvalidError) {
      return privateJson(
        {
          code: "USAGE_WINDOW_INVALID",
          error: "Usage Summary hour is outside this device's accepted window."
        },
        400
      );
    }
    return privateJson(
      {
        code: "USAGE_SYNC_UNAVAILABLE",
        error: "Usage Summary sync is temporarily unavailable."
      },
      500
    );
  }
}

function invalidSummaries() {
  return privateJson(
    {
      code: "USAGE_SUMMARIES_INVALID",
      error: "Usage Summary payload is invalid."
    },
    400
  );
}

function bearerCredential(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}
