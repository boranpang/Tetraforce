"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ATTRIBUTE_KEYS, type Attributes, type GuestState } from "@tetraforce/contracts";
import type { IncompleteBindingStatus } from "../binding-contract";
import { copy, type Locale } from "../i18n";
import type { PersistentCharacter } from "../server/binding-service";
import { CharacterBinding } from "./character-binding";
import { AttributeDisplay, CharacterHeading, TempleScene } from "./character-presentation";

const EMPTY_ALLOCATION: Attributes = {
  courage: 0,
  strength: 0,
  wisdom: 0,
  faith: 0
};

async function readGuestResponse(response: Response, fallbackMessage: string) {
  const body = (await response.json()) as GuestState | { error: string };
  if (!response.ok || "error" in body) {
    throw new Error(fallbackMessage);
  }
  return body;
}

export function GuestOnboarding({
  bindingStatus,
  locale,
  onActivated
}: {
  bindingStatus: IncompleteBindingStatus;
  locale: Locale;
  onActivated(character: PersistentCharacter): void;
}) {
  const text = copy[locale];
  const [guest, setGuest] = useState<GuestState | null>(null);
  const [allocation, setAllocation] = useState<Attributes>(EMPTY_ALLOCATION);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadGuest = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/guest", { cache: "no-store" });
      setGuest(await readGuestResponse(response, text.loadError));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.loadError);
    } finally {
      setIsLoading(false);
    }
  }, [text.loadError]);

  useEffect(() => {
    void loadGuest();
  }, [loadGuest]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isConfirming && !dialog.open) {
      dialog.showModal();
    } else if (!isConfirming && dialog.open) {
      dialog.close();
    }
  }, [isConfirming]);

  const allocated = ATTRIBUTE_KEYS.reduce(
    (total, attribute) => total + allocation[attribute],
    0
  );
  const remaining = 4 - allocated;

  function changeAllocation(attribute: keyof Attributes, change: 1 | -1) {
    setAllocation((current) => ({
      ...current,
      [attribute]: current[attribute] + change
    }));
  }

  async function confirmAllocation() {
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/guest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ allocation })
      });
      setGuest(await readGuestResponse(response, text.settleError));
      setAllocation(EMPTY_ALLOCATION);
      setIsConfirming(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : text.settleError);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="system-message" role="status">{text.loading}</p>;
  }

  if (!guest) {
    return (
      <div className="system-message" role="alert">
        <p>{error}</p>
        <button className="pixel-button secondary" type="button" onClick={() => void loadGuest()}>
          {text.retry}
        </button>
      </div>
    );
  }

  return (
    <TempleScene locale={locale}>
        <CharacterHeading
          description={guest.status === "allocating" ? text.guidance : text.readyBody}
          name={guest.name}
        />

        <div className="attributes">
          {ATTRIBUTE_KEYS.map((attribute) => {
            const preview =
              guest.attributes[attribute] +
              (guest.status === "allocating" ? allocation[attribute] : 0);
            return (
              <AttributeDisplay
                attribute={attribute}
                controls={guest.status === "allocating" ? (
                  <div className="allocation-controls">
                    <button
                      type="button"
                      aria-label={`${text.attributes[attribute]} -1`}
                      onClick={() => changeAllocation(attribute, -1)}
                      disabled={allocation[attribute] === 0}
                    >−</button>
                    <button
                      type="button"
                      aria-label={`${text.attributes[attribute]} +1`}
                      onClick={() => changeAllocation(attribute, 1)}
                      disabled={remaining === 0}
                    >+</button>
                  </div>
                ) : undefined}
                existingValue={guest.attributes[attribute]}
                key={attribute}
                label={text.attributes[attribute]}
                value={preview}
              />
            );
          })}
        </div>

        {guest.status === "allocating" ? (
          <div className="allocation-footer">
            <p className="remaining" aria-live="polite">{text.remaining(remaining)}</p>
            <button
              className="pixel-button primary"
              type="button"
              disabled={remaining !== 0}
              onClick={() => setIsConfirming(true)}
            >
              {text.accept}
            </button>
          </div>
        ) : (
          <div className="ready-state">
            <div role="status">
              <strong>{text.ready}</strong>
              <p>{text.offeringHint}</p>
            </div>
            <button className="pixel-button primary" type="button" disabled>{text.offer}</button>
            <CharacterBinding
              locale={locale}
              status={bindingStatus}
              onActivated={onActivated}
            />
          </div>
        )}

        {error ? <p className="error-message" role="alert">{error}</p> : null}
      <dialog
        className="confirm-dialog"
        ref={dialogRef}
        aria-labelledby="confirm-title"
        onCancel={() => setIsConfirming(false)}
        onClose={() => setIsConfirming(false)}
      >
        <h2 id="confirm-title">{text.confirmTitle}</h2>
        <p>{text.confirmBody}</p>
        <div className="dialog-actions">
          <button className="pixel-button secondary" type="button" onClick={() => setIsConfirming(false)} disabled={isSubmitting}>
            {text.cancel}
          </button>
          <button className="pixel-button primary" type="button" onClick={() => void confirmAllocation()} disabled={isSubmitting}>
            {text.confirm}
          </button>
        </div>
      </dialog>
    </TempleScene>
  );
}
