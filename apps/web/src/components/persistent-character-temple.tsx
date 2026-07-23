"use client";

import { ATTRIBUTE_KEYS } from "@tetraforce/contracts";
import { useEffect, useRef } from "react";

import type { PersistentCharacter } from "../server/binding-service";
import type { TempleSyncState } from "../server/temple-sync-store";
import { copy, type Locale } from "../i18n";
import {
  AttributeDisplay,
  CharacterHeading,
  TempleScene
} from "./character-presentation";
import { DeviceCodeBinding } from "./device-code-binding";
import { useOfferingFlow } from "./use-offering-flow";

export function PersistentCharacterTemple({
  character,
  locale
}: {
  character: PersistentCharacter;
  locale: Locale;
}) {
  const text = copy[locale];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const flow = useOfferingFlow({ character, locale });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (flow.isConfirming && !dialog.open) {
      dialog.showModal();
    } else if (!flow.isConfirming && dialog.open) {
      dialog.close();
    }
  }, [flow.isConfirming]);

  const offerDisabled =
    !flow.templeState?.canOffer ||
    flow.isRefreshing ||
    flow.isOffering ||
    flow.stateUnavailable ||
    Boolean(flow.error);

  return (
    <TempleScene locale={locale}>
      {flow.isRevealing ? (
        <div
          className="offering-reveal"
          role="status"
          aria-label={text.offering.revealing}
        >
          <span aria-hidden="true">✦</span>
          <p>{text.offering.revealing}</p>
        </div>
      ) : null}

      <div
        className={`temple-content${flow.isRevealing ? " is-dimmed" : ""}`}
      >
        <CharacterHeading
          name={flow.currentCharacter.gameName}
          description={text.binding.verified}
        />

        {flow.pendingOffering && !flow.isRevealing ? (
          <section
            className="blessing-result"
            aria-labelledby="blessing-title"
          >
            <div role="status">
              <h3 id="blessing-title">{text.offering.blessing}</h3>
              <p>
                {text.offering.result(
                  flow.pendingOffering.awardedPoints,
                  flow.pendingOffering.offeredTokens
                )}
              </p>
            </div>
            <div className="attributes">
              {ATTRIBUTE_KEYS.map((attribute) => {
                const existingValue =
                  flow.currentCharacter.attributes[attribute];
                const preview = existingValue + flow.allocation[attribute];
                return (
                  <AttributeDisplay
                    attribute={attribute}
                    controls={
                      <div className="allocation-controls">
                        <button
                          type="button"
                          aria-label={`${text.attributes[attribute]} -1`}
                          disabled={
                            flow.allocation[attribute] === 0 ||
                            flow.isAllocating
                          }
                          onClick={() =>
                            flow.changeAllocation(attribute, -1)
                          }
                        >
                          −
                        </button>
                        <button
                          type="button"
                          aria-label={`${text.attributes[attribute]} +1`}
                          disabled={
                            flow.remainingPoints === 0 || flow.isAllocating
                          }
                          onClick={() =>
                            flow.changeAllocation(attribute, 1)
                          }
                        >
                          +
                        </button>
                      </div>
                    }
                    existingValue={existingValue}
                    key={attribute}
                    label={text.attributes[attribute]}
                    value={preview}
                  />
                );
              })}
            </div>
            <div className="allocation-footer">
              <p className="remaining" aria-live="polite">
                {text.remaining(flow.remainingPoints)}
              </p>
              <button
                className="pixel-button primary"
                type="button"
                disabled={flow.remainingPoints !== 0 || flow.isAllocating}
                onClick={() => void flow.confirmAllocation()}
              >
                {text.offering.confirmAllocation}
              </button>
            </div>
          </section>
        ) : (
          <div className="attributes">
            {ATTRIBUTE_KEYS.map((attribute) => (
              <AttributeDisplay
                attribute={attribute}
                key={attribute}
                label={text.attributes[attribute]}
                value={flow.currentCharacter.attributes[attribute]}
              />
            ))}
          </div>
        )}

        <section className="sync-status" aria-labelledby="sync-status-title">
          <h3 id="sync-status-title">{text.sync.title}</h3>
          <dl>
            <div>
              <dt>{text.sync.eligible}</dt>
              <dd>{flow.templeState?.eligibleTokens ?? "—"}</dd>
            </div>
            <div>
              <dt>{text.sync.connection}</dt>
              <dd>
                {flow.templeState
                  ? flow.templeState.collector.connected
                    ? text.sync.connected
                    : text.sync.disconnected
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>{text.sync.lastSync}</dt>
              <dd>
                {flow.templeState?.collector.lastSuccessfulSyncAt
                  ? new Date(
                      flow.templeState.collector.lastSuccessfulSyncAt
                    ).toLocaleString(locale === "zh" ? "zh-CN" : "en")
                  : flow.templeState
                    ? text.sync.never
                    : "—"}
              </dd>
            </div>
            <div>
              <dt>{text.offering.cooldown}</dt>
              <dd>
                {flow.cooldownRemaining ?? text.offering.cooldownReady}
              </dd>
            </div>
          </dl>
          {flow.templeState?.collector.stale ? (
            <p className="sync-warning">{text.sync.stale}</p>
          ) : null}
          {flow.stateUnavailable ? (
            <div className="sync-warning">
              <p>{text.sync.unavailable}</p>
              <button
                className="inline-retry"
                type="button"
                onClick={() =>
                  void flow
                    .loadState()
                    .catch(() => undefined)
                }
              >
                {text.retry}
              </button>
            </div>
          ) : null}
        </section>

        <div className="ready-state">
          {flow.allocationComplete ? (
            <p className="allocation-success" role="status">
              {text.offering.allocationComplete}
            </p>
          ) : (
            <p>{offerStatus(flow.templeState, text)}</p>
          )}
          <button
            className="pixel-button primary"
            type="button"
            disabled={offerDisabled}
            onClick={() => void flow.reviewOffering()}
          >
            {text.offer}
          </button>
        </div>

        {!flow.isConfirming && flow.error ? (
          <div className="error-message" role="alert">
            <p>{flow.error}</p>
            <button
              className="inline-retry"
              type="button"
              onClick={() =>
                void flow
                  .loadState()
                  .catch(() => undefined)
              }
            >
              {text.retry}
            </button>
          </div>
        ) : null}
        <DeviceCodeBinding locale={locale} />
      </div>

      <dialog
        className="confirm-dialog"
        ref={dialogRef}
        aria-labelledby="offering-confirm-title"
        onCancel={(event) => {
          if (flow.isOffering) {
            event.preventDefault();
          } else {
            flow.setConfirming(false);
          }
        }}
      >
        <h2 id="offering-confirm-title">{text.offering.confirmTitle}</h2>
        <p>
          {text.offering.confirmTokens(
            flow.templeState?.eligibleTokens ?? "0"
          )}
        </p>
        <p>{text.offering.irreversible}</p>
        {flow.isConfirming && flow.error ? (
          <p className="error-message" role="alert">
            {flow.error}
          </p>
        ) : null}
        <div className="dialog-actions">
          <button
            className="pixel-button secondary"
            type="button"
            disabled={flow.isOffering}
            onClick={() => flow.setConfirming(false)}
          >
            {text.offering.cancel}
          </button>
          <button
            className="pixel-button primary"
            type="button"
            disabled={flow.isOffering}
            onClick={() => void flow.confirmOffering()}
          >
            {flow.isOffering
              ? text.offering.processing
              : text.offering.confirm}
          </button>
        </div>
      </dialog>
    </TempleScene>
  );
}

function offerStatus(
  state: TempleSyncState | null,
  text: (typeof copy)[Locale]
) {
  if (!state) {
    return text.offering.loading;
  }
  switch (state.offerBlockReason) {
    case "pending-allocation":
      return text.offering.pending;
    case "cooldown":
      return text.offering.cooldownActive;
    case "collector":
      return text.binding.collectorLater;
    case "tokens":
      return text.offering.noTokens;
    default:
      return text.offering.ready;
  }
}
