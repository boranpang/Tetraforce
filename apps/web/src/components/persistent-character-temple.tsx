"use client";

import { ATTRIBUTE_KEYS } from "@tetraforce/contracts";
import { useEffect, useState } from "react";

import type { PersistentCharacter } from "../server/binding-service";
import type { TempleSyncState } from "../server/temple-sync-store";
import { copy, type Locale } from "../i18n";
import { AttributeDisplay, CharacterHeading, TempleScene } from "./character-presentation";
import { DeviceCodeBinding } from "./device-code-binding";

export function PersistentCharacterTemple({
  character,
  locale
}: {
  character: PersistentCharacter;
  locale: Locale;
}) {
  const text = copy[locale];
  const [syncState, setSyncState] = useState<TempleSyncState | null>(null);
  const [syncUnavailable, setSyncUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/temple/sync-state", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Temple sync state unavailable");
        }
        return (await response.json()) as TempleSyncState;
      })
      .then((state) => {
        if (!cancelled) {
          setSyncState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSyncUnavailable(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <TempleScene locale={locale}>
        <CharacterHeading name={character.gameName} description={text.binding.verified} />
        <div className="attributes">
          {ATTRIBUTE_KEYS.map((attribute) => {
            const value = character.attributes[attribute];
            return (
              <AttributeDisplay
                attribute={attribute}
                key={attribute}
                label={text.attributes[attribute]}
                value={value}
              />
            );
          })}
        </div>
        <section className="sync-status" aria-labelledby="sync-status-title">
          <h3 id="sync-status-title">{text.sync.title}</h3>
          <dl>
            <div>
              <dt>{text.sync.eligible}</dt>
              <dd>{syncState?.eligibleTokens ?? "—"}</dd>
            </div>
            <div>
              <dt>{text.sync.connection}</dt>
              <dd>
                {syncState
                  ? syncState.collectorConnected
                    ? text.sync.connected
                    : text.sync.disconnected
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{text.sync.lastSync}</dt>
              <dd>
                {syncState?.lastSuccessfulSyncAt
                  ? new Date(syncState.lastSuccessfulSyncAt).toLocaleString(
                      locale === "zh" ? "zh-CN" : "en"
                    )
                  : syncState
                    ? text.sync.never
                    : "—"}
              </dd>
            </div>
          </dl>
          {syncState?.collectorStale ? (
            <p className="sync-warning" role="status">{text.sync.stale}</p>
          ) : null}
          {syncUnavailable ? (
            <p className="sync-warning" role="status">{text.sync.unavailable}</p>
          ) : null}
        </section>
        <div className="ready-state">
          <strong>{text.binding.persistentReady}</strong>
          <p>
            {syncState?.collectorConnected
              ? text.sync.ready
              : text.binding.collectorLater}
          </p>
          <button className="pixel-button primary" type="button" disabled>{text.offer}</button>
        </div>
        <DeviceCodeBinding locale={locale} />
    </TempleScene>
  );
}
