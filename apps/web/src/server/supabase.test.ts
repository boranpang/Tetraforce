import { describe, expect, it } from "vitest";
import type { User } from "@supabase/supabase-js";

import { toVerifiedAuthUser } from "./supabase";

describe("Supabase Auth identity mapping", () => {
  it("uses the verified identity ID instead of mutable identity metadata", () => {
    const user = {
      id: "4d4ce723-003d-43b2-8123-b8dc351abe0a",
      identities: [
        {
          id: "8675309",
          identity_id: "16c5a7d7-c9ef-4690-8318-83d1265a6cf8",
          user_id: "4d4ce723-003d-43b2-8123-b8dc351abe0a",
          provider: "github",
          identity_data: { provider_id: "attacker-controlled-copy" }
        }
      ]
    } as unknown as User;

    expect(toVerifiedAuthUser(user)).toEqual({
      id: user.id,
      identities: [{ provider: "github", providerId: "8675309" }]
    });
  });
});
