import { describe, expect, it } from "vitest";

import {
  createDeviceSecretService,
  parseDeviceCredential
} from "./device-secrets";
import {
  activateDeviceCredential,
  exchangeDeviceCode,
  issueDeviceCode,
  revokeDeviceCredential,
  type DeviceBindingStore
} from "./device-binding-service";

const secrets = createDeviceSecretService(
  "test-only-device-pepper-with-at-least-32-characters"
);

describe("Collector device binding service", () => {
  it("stores only digests while returning one-time secrets through private responses", async () => {
    let storedCodeDigest = "";
    const requestAttempts: Array<{
      operation: "exchange" | "activate" | "revoke";
      requestKeyDigest: string;
    }> = [];
    let storedCredential:
      | { codeDigest: string; credentialSelector: string; credentialDigest: string }
      | undefined;
    const store: DeviceBindingStore = {
      consumeRequestAttempt: async (input) => {
        requestAttempts.push(input);
      },
      createCode: async ({ codeDigest }) => {
        storedCodeDigest = codeDigest;
        return { expiresAt: "2026-07-23T11:10:00.000Z" };
      },
      exchangeCode: async (input) => {
        storedCredential = input;
        return { earliestAcceptedUtcHour: "2026-07-22T12:00:00.000Z" };
      },
      activateCurrentDevice: async () => true,
      revokeCurrentDevice: async () => true
    };

    const issued = await issueDeviceCode(store, secrets);
    expect(issued.deviceCode).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/
    );
    expect(storedCodeDigest).toHaveLength(43);
    expect(storedCodeDigest).not.toContain(issued.deviceCode.replaceAll("-", ""));

    const exchanged = await exchangeDeviceCode(
      issued.deviceCode,
      store,
      secrets,
      "test-request"
    );
    const parsedCredential = parseDeviceCredential(exchanged.deviceCredential);
    expect(parsedCredential).not.toBeNull();
    expect(storedCredential).toEqual({
      codeDigest: storedCodeDigest,
      credentialSelector: parsedCredential!.selector,
      credentialDigest: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    });
    expect(JSON.stringify(exchanged)).not.toContain(storedCredential!.credentialDigest);
    expect(exchanged.earliestAcceptedUtcHour).toBe("2026-07-22T12:00:00.000Z");
    expect(requestAttempts).toEqual([
      {
        operation: "exchange",
        requestKeyDigest: secrets.digestRequestKey("exchange", "test-request")
      }
    ]);
    expect(JSON.stringify(requestAttempts)).not.toContain("test-request");
  });

  it("compares a presented credential by selector and HMAC digest without forwarding the secret", async () => {
    const credential = secrets.generateCredential();
    let received:
      | { credentialSelector: string; credentialDigest: string }
      | undefined;
    const store: DeviceBindingStore = {
      consumeRequestAttempt: async () => undefined,
      createCode: async () => ({ expiresAt: "2026-07-23T11:10:00.000Z" }),
      exchangeCode: async () => ({
        earliestAcceptedUtcHour: "2026-07-22T12:00:00.000Z"
      }),
      activateCurrentDevice: async () => true,
      revokeCurrentDevice: async (input) => {
        received = input;
        return true;
      }
    };

    expect(
      await revokeDeviceCredential(
        credential.value,
        store,
        secrets,
        "test-request"
      )
    ).toBe(true);
    expect(received).toEqual({
      credentialSelector: credential.selector,
      credentialDigest: credential.digest
    });
    expect(JSON.stringify(received)).not.toContain(
      parseDeviceCredential(credential.value)!.secret
    );
    expect(
      await revokeDeviceCredential(
        "not-a-credential",
        store,
        secrets,
        "test-request"
      )
    ).toBe(false);
  });

  it("activates by HMAC proof without forwarding the credential secret", async () => {
    const credential = secrets.generateCredential();
    const attempts: unknown[] = [];
    let proof: unknown;
    const store: DeviceBindingStore = {
      consumeRequestAttempt: async (input) => {
        attempts.push(input);
      },
      createCode: async () => ({ expiresAt: "2026-07-23T11:10:00.000Z" }),
      exchangeCode: async () => ({
        earliestAcceptedUtcHour: "2026-07-22T12:00:00.000Z"
      }),
      activateCurrentDevice: async (input) => {
        proof = input;
        return true;
      },
      revokeCurrentDevice: async () => true
    };

    expect(
      await activateDeviceCredential(
        credential.value,
        store,
        secrets,
        "activation-request"
      )
    ).toBe(true);
    expect(proof).toEqual({
      credentialSelector: credential.selector,
      credentialDigest: credential.digest
    });
    expect(attempts).toEqual([
      {
        operation: "activate",
        requestKeyDigest: secrets.digestRequestKey(
          "activate",
          "activation-request"
        )
      }
    ]);
    expect(JSON.stringify({ proof, attempts })).not.toContain(credential.value);
  });
});
