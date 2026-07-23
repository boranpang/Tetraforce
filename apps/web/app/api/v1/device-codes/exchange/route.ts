import {
  type DeviceBindingErrorResponse,
  type DeviceCodeExchangeRequest,
  type DeviceCodeExchangeResponse
} from "@tetraforce/contracts";

import {
  DeviceLimitReachedError,
  DeviceRequestRateLimitError,
  InvalidDeviceCodeError,
  exchangeDeviceCode
} from "../../../../../src/server/device-binding-service";
import { getDeviceSecretService } from "../../../../../src/server/device-secrets";
import { privateJson } from "../../../../../src/server/private-api-response";
import { getPrivateRequestKey } from "../../../../../src/server/request-key";
import { SupabaseDeviceBindingStore } from "../../../../../src/server/supabase-device-binding-store";
import {
  createServiceSupabaseClient,
  getServerSupabaseConfig
} from "../../../../../src/server/supabase";

export async function POST(request: Request) {
  const config = getServerSupabaseConfig();
  const secrets = getDeviceSecretService();
  if (!config || !secrets) {
    return privateJson<DeviceBindingErrorResponse>(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is not configured."
      },
      503
    );
  }

  let body: Partial<DeviceCodeExchangeRequest>;
  try {
    body = (await request.json()) as Partial<DeviceCodeExchangeRequest>;
  } catch {
    body = {};
  }

  try {
    const response = await exchangeDeviceCode(
      typeof body.deviceCode === "string" ? body.deviceCode : "",
      new SupabaseDeviceBindingStore(
        null,
        createServiceSupabaseClient(config)
      ),
      secrets,
      getPrivateRequestKey(request)
    );
    return privateJson<DeviceCodeExchangeResponse>(response, 200);
  } catch (error) {
    if (error instanceof DeviceRequestRateLimitError) {
      return privateJson<DeviceBindingErrorResponse>(
        {
          code: "DEVICE_REQUEST_RATE_LIMITED",
          error: "Too many device requests. Wait before trying again."
        },
        429
      );
    }
    if (error instanceof DeviceLimitReachedError) {
      return privateJson<DeviceBindingErrorResponse>(
        {
          code: "DEVICE_LIMIT_REACHED",
          error:
            "This Character already has five active devices. Run npx tetraforce unlink on one connected device, then try again."
        },
        409
      );
    }
    if (error instanceof InvalidDeviceCodeError) {
      return privateJson<DeviceBindingErrorResponse>(
        {
          code: "DEVICE_CODE_INVALID",
          error: "Device code is invalid, expired, or already used."
        },
        400
      );
    }
    return privateJson<DeviceBindingErrorResponse>(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is temporarily unavailable."
      },
      500
    );
  }
}
