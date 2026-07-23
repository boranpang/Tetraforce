export type DeviceCodeResponse = {
  deviceCode: string;
  expiresAt: string;
};

export type DeviceCodeExchangeRequest = {
  deviceCode: string;
};

export type DeviceCodeExchangeResponse = {
  deviceCredential: string;
  earliestAcceptedUtcHour: string;
};

export type DeviceBindingErrorCode =
  | "DEVICE_CODE_INVALID"
  | "DEVICE_CODE_RATE_LIMITED"
  | "DEVICE_LIMIT_REACHED"
  | "DEVICE_CREDENTIAL_INVALID"
  | "DEVICE_REQUEST_RATE_LIMITED"
  | "DEVICE_BINDING_UNAVAILABLE";

export type DeviceBindingErrorResponse = {
  code: DeviceBindingErrorCode;
  error: string;
};

const NORMALIZED_DEVICE_CODE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

export function normalizeDeviceCode(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[\s-]/g, "");
  return NORMALIZED_DEVICE_CODE.test(normalized) ? normalized : null;
}

export function formatDeviceCode(value: string): string {
  const normalized = normalizeDeviceCode(value);
  if (!normalized) {
    throw new Error("Device Code is invalid.");
  }
  return `${normalized.slice(0, 4)}-${normalized.slice(4, 8)}-${normalized.slice(8)}`;
}

export function isUtcHour(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}
