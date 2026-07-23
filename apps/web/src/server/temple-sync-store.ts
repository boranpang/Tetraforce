import type { SupabaseClient } from "@supabase/supabase-js";

export type TempleSyncState = {
  eligibleTokens: string;
  collectorConnected: boolean;
  lastSuccessfulSyncAt: string | null;
  collectorStale: boolean;
};

type TempleSyncRow = {
  eligible_tokens: string;
  collector_connected: boolean;
  last_successful_sync_at: string | null;
  collector_stale: boolean;
};

export class TempleSyncStore {
  constructor(private readonly sessionClient: SupabaseClient) {}

  async get(): Promise<TempleSyncState | null> {
    const { data, error } = await this.sessionClient.rpc(
      "get_my_temple_sync_state"
    );
    if (error) {
      throw new Error("Temple sync state could not be loaded.", { cause: error });
    }
    const row = (data as TempleSyncRow[] | null)?.[0];
    return row
      ? {
          eligibleTokens: row.eligible_tokens,
          collectorConnected: row.collector_connected,
          lastSuccessfulSyncAt: row.last_successful_sync_at
            ? new Date(row.last_successful_sync_at).toISOString()
            : null,
          collectorStale: row.collector_stale
        }
      : null;
  }
}
