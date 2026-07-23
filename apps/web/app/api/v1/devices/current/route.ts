import { NextResponse } from "next/server";

import {
  DeviceLimitReachedError,
  DeviceRequestRateLimitError,
  activateDeviceCredential,
  revokeDeviceCredential
} from "../../../../../src/server/device-binding-service";
import { getDeviceSecretService } from "../../../../../src/server/device-secrets";
import {
  PRIVATE_RESPONSE_HEADERS,
  privateJson
} from "../../../../../src/server/private-api-response";
import { getPrivateRequestKey } from "../../../../../src/server/request-key";
import { SupabaseDeviceBindingStore } from "../../../../../src/server/supabase-device-binding-store";
import {
  createServiceSupabaseClient,
  getServerSupabaseConfig
} from "../../../../../src/server/supabase";

export async function DELETE(request: Request) {
  const config = getServerSupabaseConfig();
  const secrets = getDeviceSecretService();
  if (!config || !secrets) {
    return privateJson(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is not configured."
      },
      503
    );
  }

  const credential = bearerCredential(request);

  try {
    const revoked = await revokeDeviceCredential(
      credential,
      new SupabaseDeviceBindingStore(
        null,
        createServiceSupabaseClient(config)
      ),
      secrets,
      getPrivateRequestKey(request)
    );
    if (!revoked) {
      return invalidCredential();
    }
    return new NextResponse(null, {
      status: 204,
      headers: PRIVATE_RESPONSE_HEADERS
    });
  } catch (error) {
    if (error instanceof DeviceRequestRateLimitError) {
      return privateJson(
        {
          code: "DEVICE_REQUEST_RATE_LIMITED",
          error: "Too many device requests. Wait before trying again."
        },
        429
      );
    }
    return privateJson(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is temporarily unavailable."
      },
      500
    );
  }
}

export async function POST(request: Request) {
  const config = getServerSupabaseConfig();
  const secrets = getDeviceSecretService();
  if (!config || !secrets) {
    return privateJson(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is not configured."
      },
      503
    );
  }

  try {
    const activated = await activateDeviceCredential(
      bearerCredential(request),
      new SupabaseDeviceBindingStore(
        null,
        createServiceSupabaseClient(config)
      ),
      secrets,
      getPrivateRequestKey(request)
    );
    if (!activated) {
      return invalidCredential();
    }
    return new NextResponse(null, {
      status: 204,
      headers: PRIVATE_RESPONSE_HEADERS
    });
  } catch (error) {
    if (error instanceof DeviceRequestRateLimitError) {
      return privateJson(
        {
          code: "DEVICE_REQUEST_RATE_LIMITED",
          error: "Too many device requests. Wait before trying again."
        },
        429
      );
    }
    if (error instanceof DeviceLimitReachedError) {
      return privateJson(
        {
          code: "DEVICE_LIMIT_REACHED",
          error:
            "This Character already has five active devices. Run npx tetraforce unlink on one connected device, then try again."
        },
        409
      );
    }
    return privateJson(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is temporarily unavailable."
      },
      500
    );
  }
}

function invalidCredential() {
  return privateJson(
    {
      code: "DEVICE_CREDENTIAL_INVALID",
      error: "Device credential is invalid, revoked, or expired."
    },
    401
  );
}

function bearerCredential(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : "";
}
