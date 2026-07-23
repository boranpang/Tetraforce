import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DeviceCodeRateLimitError,
  DeviceLimitReachedError,
  DeviceRequestRateLimitError,
  InvalidDeviceCodeError,
  type DeviceBindingStore,
  type DeviceCredentialProof,
  type DeviceRequestOperation
} from "./device-binding-service";

type DeviceCodeRow = {
  expires_at: string;
};

type ExchangedDeviceRow = {
  earliest_accepted_utc_hour: string;
};

export class SupabaseDeviceBindingStore implements DeviceBindingStore {
  constructor(
    private readonly sessionClient: SupabaseClient | null,
    private readonly serviceClient: SupabaseClient | null
  ) {}

  async consumeRequestAttempt(input: {
    operation: DeviceRequestOperation;
    requestKeyDigest: string;
  }) {
    if (!this.serviceClient) {
      throw new Error("Collector device binding is not configured.");
    }
    const { error } = await this.serviceClient.rpc(
      "consume_collector_device_request_attempt",
      {
        p_operation: input.operation,
        p_request_key_digest: input.requestKeyDigest
      }
    );
    if (error) {
      throw mapDeviceBindingError(error);
    }
  }

  async createCode(input: { codeDigest: string }) {
    if (!this.sessionClient) {
      throw new Error("Collector device binding is not configured.");
    }
    const { data, error } = await this.sessionClient.rpc(
      "create_my_collector_device_code",
      { p_code_digest: input.codeDigest }
    );
    if (error) {
      throw mapDeviceBindingError(error);
    }
    const row = (data as DeviceCodeRow[] | null)?.[0];
    if (!row) {
      throw new Error("Collector Device Code was not created.");
    }
    return { expiresAt: row.expires_at };
  }

  async exchangeCode(input: DeviceCredentialProof & { codeDigest: string }) {
    if (!this.serviceClient) {
      throw new Error("Collector device binding is not configured.");
    }
    const { data, error } = await this.serviceClient.rpc(
      "exchange_collector_device_code",
      {
        p_code_digest: input.codeDigest,
        p_credential_selector: input.credentialSelector,
        p_credential_digest: input.credentialDigest
      }
    );
    if (error) {
      throw mapDeviceBindingError(error);
    }
    const row = (data as ExchangedDeviceRow[] | null)?.[0];
    if (!row) {
      throw new InvalidDeviceCodeError();
    }
    return {
      earliestAcceptedUtcHour: new Date(
        row.earliest_accepted_utc_hour
      ).toISOString()
    };
  }

  async revokeCurrentDevice(input: DeviceCredentialProof) {
    if (!this.serviceClient) {
      throw new Error("Collector device binding is not configured.");
    }
    const { data, error } = await this.serviceClient.rpc(
      "revoke_current_collector_device",
      {
        p_credential_selector: input.credentialSelector,
        p_credential_digest: input.credentialDigest
      }
    );
    if (error) {
      throw new Error("Collector device could not be revoked.", { cause: error });
    }
    return (data as { revoked: boolean }[] | null)?.[0]?.revoked === true;
  }

  async activateCurrentDevice(input: DeviceCredentialProof) {
    if (!this.serviceClient) {
      throw new Error("Collector device binding is not configured.");
    }
    const { data, error } = await this.serviceClient.rpc(
      "activate_current_collector_device",
      {
        p_credential_selector: input.credentialSelector,
        p_credential_digest: input.credentialDigest
      }
    );
    if (error) {
      throw mapDeviceBindingError(error);
    }
    return (data as { activated: boolean }[] | null)?.[0]?.activated === true;
  }
}

function mapDeviceBindingError(error: { message: string }): Error {
  if (error.message.includes("Too many Collector device requests")) {
    return new DeviceRequestRateLimitError();
  }
  if (error.message.includes("Too many Device Code creation attempts")) {
    return new DeviceCodeRateLimitError();
  }
  if (error.message.includes("at most five active devices")) {
    return new DeviceLimitReachedError();
  }
  if (error.message.includes("Device code is invalid or expired")) {
    return new InvalidDeviceCodeError();
  }
  return new Error("Collector device binding failed.", { cause: error });
}
