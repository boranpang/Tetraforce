import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import type { VerifiedAuthUser } from "./binding-service";

type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

type ServerSupabaseConfig = PublicSupabaseConfig & {
  secretKey: string;
};

export function getPublicSupabaseConfig(): PublicSupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && publishableKey ? { url, publishableKey } : null;
}

export function getServerSupabaseConfig(): ServerSupabaseConfig | null {
  const publicConfig = getPublicSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  return publicConfig && secretKey ? { ...publicConfig, secretKey } : null;
}

export async function createSessionSupabaseClient(
  config: PublicSupabaseConfig
): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      }
    }
  });
}

export function createServiceSupabaseClient(config: ServerSupabaseConfig): SupabaseClient {
  return createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export function toVerifiedAuthUser(user: User): VerifiedAuthUser {
  return {
    id: user.id,
    identities: (user.identities ?? []).map((identity) => ({
      provider: identity.provider,
      providerId: identity.id
    }))
  };
}
