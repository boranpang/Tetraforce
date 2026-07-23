"use client";

import {
  type DeviceBindingErrorResponse,
  type DeviceCodeResponse
} from "@tetraforce/contracts";
import { useState } from "react";

import { copy, type Locale } from "../i18n";

export function DeviceCodeBinding({ locale }: { locale: Locale }) {
  const text = copy[locale].collector;
  const [deviceCode, setDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  async function createCode() {
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/device-codes", {
        method: "POST",
        cache: "no-store"
      });
      const body = (await response.json()) as
        | DeviceCodeResponse
        | DeviceBindingErrorResponse;
      if (!response.ok || "error" in body) {
        if ("code" in body && body.code === "DEVICE_LIMIT_REACHED") {
          throw new Error(text.limit);
        }
        throw new Error(text.failure);
      }
      setDeviceCode(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.failure);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="device-binding" aria-labelledby="device-binding-title">
      <h3 id="device-binding-title">{text.title}</h3>
      <p>{text.body}</p>
      <button
        className="pixel-button secondary"
        disabled={isCreating}
        onClick={() => void createCode()}
        type="button"
      >
        {isCreating ? text.creating : text.create}
      </button>
      {deviceCode ? (
        <div className="device-code-result" role="status">
          <span>{text.codeLabel}</span>
          <code>{deviceCode.deviceCode}</code>
          <p>{text.expires(new Date(deviceCode.expiresAt))}</p>
          <p>{text.command(window.location.origin)}</p>
        </div>
      ) : null}
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </section>
  );
}
