import type { SupabaseClient } from "@supabase/supabase-js";

import type { UsageSyncResponse } from "@tetraforce/contracts";
import {
  InvalidSyncCredentialError,
  InvalidUsageSummariesError,
  UsageCounterRollbackError,
  UsageWindowInvalidError,
  type UsageSyncStore
} from "./usage-sync-service";

type UsageSyncRow = {
  accepted_summaries: number;
  eligible_tokens: string;
  last_successful_sync_at: string;
};

export class SupabaseUsageSyncStore implements UsageSyncStore {
  constructor(private readonly serviceClient: SupabaseClient | null) {}

  async sync(input: Parameters<UsageSyncStore["sync"]>[0]): Promise<UsageSyncResponse> {
    if (!this.serviceClient) {
      throw new Error("Usage Summary sync is not configured.");
    }
    const { data, error } = await this.serviceClient.rpc(
      "sync_collector_usage_summaries",
      {
        p_credential_selector: input.credentialSelector,
        p_credential_digest: input.credentialDigest,
        p_collector_version: input.collectorVersion,
        p_summaries: input.summaries
      }
    );
    if (error) {
      throw mapUsageSyncError(error);
    }
    const row = (data as UsageSyncRow[] | null)?.[0];
    if (!row) {
      throw new Error("Usage Summary sync returned no result.");
    }
    return {
      acceptedSummaries: row.accepted_summaries,
      eligibleTokens: row.eligible_tokens,
      lastSuccessfulSyncAt: new Date(row.last_successful_sync_at).toISOString()
    };
  }
}

function mapUsageSyncError(error: { message: string }) {
  if (error.message.includes("DEVICE_CREDENTIAL_INVALID")) {
    return new InvalidSyncCredentialError();
  }
  if (error.message.includes("USAGE_COUNTER_ROLLBACK")) {
    return new UsageCounterRollbackError();
  }
  if (error.message.includes("USAGE_WINDOW_INVALID")) {
    return new UsageWindowInvalidError();
  }
  if (error.message.includes("USAGE_SUMMARIES_INVALID")) {
    return new InvalidUsageSummariesError();
  }
  return new Error("Usage Summary sync failed.", { cause: error });
}
