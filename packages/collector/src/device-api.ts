import {
  COLLECTOR_VERSION_HEADER,
  type DeviceBindingErrorResponse,
  type DeviceCodeExchangeResponse,
  type UsageSummary,
  type UsageSyncErrorResponse,
  type UsageSyncResponse,
  isUtcHour
} from "@tetraforce/contracts";

import { COLLECTOR_VERSION } from "./version";

const DEVICE_CREDENTIAL_PATTERN =
  /^tf_d1\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;

export type DeviceApi = {
  exchangeDeviceCode(deviceCode: string): Promise<DeviceCodeExchangeResponse>;
  activateDeviceCredential(
    deviceCredential: string
  ): Promise<"activated" | "already-invalid">;
  revokeDeviceCredential(
    deviceCredential: string
  ): Promise<"revoked" | "already-invalid">;
  syncUsageSummaries(
    deviceCredential: string,
    summaries: readonly UsageSummary[]
  ): Promise<UsageSyncResponse>;
};

export function createDeviceApi(apiBaseUrl: string): DeviceApi {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  return {
    async exchangeDeviceCode(deviceCode) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/v1/device-codes/exchange`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceCode }),
          redirect: "error"
        });
      } catch {
        throw new DeviceApiError("unavailable");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new DeviceApiError("unavailable");
      }

      if (!response.ok) {
        const code = (body as Partial<DeviceBindingErrorResponse>)?.code;
        throw new DeviceApiError(
          code === "DEVICE_LIMIT_REACHED"
            ? "limit"
            : code === "DEVICE_REQUEST_RATE_LIMITED"
              ? "rate-limit"
              : code === "DEVICE_CODE_INVALID"
                ? "invalid-code"
                : "unavailable"
        );
      }

      const result = body as Partial<DeviceCodeExchangeResponse>;
      if (
        typeof result.deviceCredential !== "string" ||
        !DEVICE_CREDENTIAL_PATTERN.test(result.deviceCredential) ||
        typeof result.earliestAcceptedUtcHour !== "string" ||
        !isUtcHour(result.earliestAcceptedUtcHour)
      ) {
        throw new DeviceApiError("unavailable");
      }
      return result as DeviceCodeExchangeResponse;
    },
    async activateDeviceCredential(deviceCredential) {
      return credentialAction(
        baseUrl,
        "POST",
        deviceCredential,
        "activated"
      );
    },
    async revokeDeviceCredential(deviceCredential) {
      return credentialAction(
        baseUrl,
        "DELETE",
        deviceCredential,
        "revoked"
      );
    },
    async syncUsageSummaries(deviceCredential, summaries) {
      let response: Response;
      try {
        response = await fetch(`${baseUrl}/api/v1/usage-summaries`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${deviceCredential}`,
            "content-type": "application/json",
            [COLLECTOR_VERSION_HEADER]: COLLECTOR_VERSION
          },
          body: JSON.stringify(summaries),
          redirect: "error"
        });
      } catch {
        throw new DeviceApiError("unavailable");
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        throw new DeviceApiError("unavailable");
      }
      if (!response.ok) {
        throw new DeviceApiError(syncErrorReason(body));
      }

      const result = body as Partial<UsageSyncResponse>;
      if (
        !Number.isSafeInteger(result.acceptedSummaries) ||
        Number(result.acceptedSummaries) < 0 ||
        typeof result.eligibleTokens !== "string" ||
        !/^(0|[1-9]\d*)$/.test(result.eligibleTokens) ||
        typeof result.lastSuccessfulSyncAt !== "string" ||
        Number.isNaN(Date.parse(result.lastSuccessfulSyncAt))
      ) {
        throw new DeviceApiError("unavailable");
      }
      return result as UsageSyncResponse;
    }
  };
}

function syncErrorReason(body: unknown): DeviceApiError["reason"] {
  const code = (body as Partial<UsageSyncErrorResponse>)?.code;
  switch (code) {
    case "DEVICE_CREDENTIAL_INVALID":
      return "credential";
    case "COLLECTOR_UPGRADE_REQUIRED":
      return "upgrade";
    case "USAGE_COUNTER_ROLLBACK":
      return "rollback";
    case "USAGE_WINDOW_INVALID":
      return "window";
    case "USAGE_SUMMARIES_INVALID":
      return "invalid-data";
    default:
      return "unavailable";
  }
}

async function credentialAction<T extends "activated" | "revoked">(
  baseUrl: string,
  method: "POST" | "DELETE",
  deviceCredential: string,
  success: T
): Promise<T | "already-invalid"> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/v1/devices/current`, {
      method,
      headers: { authorization: `Bearer ${deviceCredential}` },
      redirect: "error"
    });
  } catch {
    throw new DeviceApiError("unavailable");
  }

  if (response.status === 204) {
    return success;
  }
  if (response.status === 401) {
    return "already-invalid";
  }

  let code: DeviceBindingErrorResponse["code"] | undefined;
  try {
    code = ((await response.json()) as Partial<DeviceBindingErrorResponse>).code;
  } catch {
    // Fixed client errors intentionally ignore server response details.
  }
  throw new DeviceApiError(
    code === "DEVICE_LIMIT_REACHED"
      ? "limit"
      : code === "DEVICE_REQUEST_RATE_LIMITED"
        ? "rate-limit"
        : "unavailable"
  );
}

export class DeviceApiError extends Error {
  constructor(
    readonly reason:
      | "invalid-code"
      | "limit"
      | "rate-limit"
      | "credential"
      | "upgrade"
      | "rollback"
      | "window"
      | "invalid-data"
      | "unavailable"
  ) {
    super("Collector device binding request failed.");
    this.name = "DeviceApiError";
  }
}

function normalizeApiBaseUrl(value: string): string {
  const url = new URL(value);
  const isLocalHttp =
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]");
  if (
    (url.protocol !== "https:" && !isLocalHttp) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Tetraforce service address must be an HTTPS origin.");
  }
  return url.origin;
}
