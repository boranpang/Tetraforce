import { afterEach, describe, expect, it, vi } from "vitest";

import { createDeviceApi, DeviceApiError } from "./device-api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Collector device API", () => {
  it("accepts only an HTTPS service origin or local HTTP development origin", () => {
    expect(() => createDeviceApi("https://service.example/path")).toThrow(
      "must be an HTTPS origin"
    );
    expect(() => createDeviceApi("http://service.example")).toThrow(
      "must be an HTTPS origin"
    );
    expect(() => createDeviceApi("http://localhost:3000")).not.toThrow();
  });

  it("exchanges only the Device Code and accepts the private credential response", async () => {
    const credential =
      `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"v".repeat(43)}`;
    const fetchMock = vi.fn(async () =>
      Response.json({
        deviceCredential: credential,
        earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createDeviceApi(
      "https://service.example/"
    ).exchangeDeviceCode("2345-6789-ABCD");

    expect(result).toEqual({
      deviceCredential: credential,
      earliestAcceptedUtcHour: "2026-07-21T11:00:00.000Z"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://service.example/api/v1/device-codes/exchange",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: "2345-6789-ABCD" }),
        redirect: "error"
      }
    );
  });

  it("returns a fixed safe error without echoing server bodies or Device Codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "DEVICE_CODE_INVALID",
            error: "sensitive-server-detail"
          },
          { status: 400 }
        )
      )
    );

    let error: unknown;
    try {
      await createDeviceApi("https://service.example").exchangeDeviceCode(
        "2345-6789-ABCD"
      );
    } catch (cause) {
      error = cause;
    }

    expect(error).toBeInstanceOf(DeviceApiError);
    expect((error as Error).message).not.toContain("sensitive-server-detail");
    expect((error as Error).message).not.toContain("2345-6789-ABCD");
  });

  it("maps exchange request throttling to actionable rate-limit guidance", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            code: "DEVICE_REQUEST_RATE_LIMITED",
            error: "sensitive-server-detail"
          },
          { status: 429 }
        )
      )
    );

    await expect(
      createDeviceApi("https://service.example").exchangeDeviceCode(
        "2345-6789-ABCD"
      )
    ).rejects.toMatchObject({ reason: "rate-limit" });
  });

  it("activates a persisted credential before considering the device connected", async () => {
    const credential =
      `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"y".repeat(43)}`;
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createDeviceApi("https://service.example").activateDeviceCredential(
        credential
      )
    ).resolves.toBe("activated");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://service.example/api/v1/devices/current",
      {
        method: "POST",
        headers: { authorization: `Bearer ${credential}` },
        redirect: "error"
      }
    );
  });

  it("revokes only the presented device credential and treats an invalid credential as already unlinked", async () => {
    const credential =
      `tf_d1.ABCDEFGHIJKLMNOPQRSTUV.${"z".repeat(43)}`;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const api = createDeviceApi("https://service.example");

    await expect(api.revokeDeviceCredential(credential)).resolves.toBe("revoked");
    await expect(api.revokeDeviceCredential(credential)).resolves.toBe(
      "already-invalid"
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://service.example/api/v1/devices/current",
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${credential}` },
        redirect: "error"
      }
    );
  });
});
