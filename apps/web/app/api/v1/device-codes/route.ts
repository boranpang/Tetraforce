import {
  type DeviceBindingErrorResponse,
  type DeviceCodeResponse
} from "@tetraforce/contracts";

import {
  DeviceCodeRateLimitError,
  DeviceLimitReachedError,
  issueDeviceCode
} from "../../../../src/server/device-binding-service";
import { getDeviceSecretService } from "../../../../src/server/device-secrets";
import { privateJson } from "../../../../src/server/private-api-response";
import { SupabaseDeviceBindingStore } from "../../../../src/server/supabase-device-binding-store";
import {
  createSessionSupabaseClient,
  getServerSupabaseConfig
} from "../../../../src/server/supabase";

export async function POST() {
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

  const sessionClient = await createSessionSupabaseClient(config);
  const { data } = await sessionClient.auth.getUser();
  if (!data.user) {
    return privateJson<DeviceBindingErrorResponse>(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "GitHub authentication is required."
      },
      401
    );
  }

  try {
    const response = await issueDeviceCode(
      new SupabaseDeviceBindingStore(sessionClient, null),
      secrets
    );
    return privateJson<DeviceCodeResponse>(response, 200);
  } catch (error) {
    if (error instanceof DeviceCodeRateLimitError) {
      return privateJson<DeviceBindingErrorResponse>(
        {
          code: "DEVICE_CODE_RATE_LIMITED",
          error: "Too many Device Codes were created. Wait before trying again."
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
    return privateJson<DeviceBindingErrorResponse>(
      {
        code: "DEVICE_BINDING_UNAVAILABLE",
        error: "Collector device binding is temporarily unavailable."
      },
      500
    );
  }
}
