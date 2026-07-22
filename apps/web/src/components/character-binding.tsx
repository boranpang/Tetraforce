"use client";

import Link from "next/link";
import { useState } from "react";

import type { IncompleteBindingStatus } from "../binding-contract";
import type { PersistentCharacter } from "../server/binding-service";
import { copy, type Locale } from "../i18n";

export function CharacterBinding({
  locale,
  status,
  onActivated
}: {
  locale: Locale;
  status: IncompleteBindingStatus;
  onActivated(character: PersistentCharacter): void;
}) {
  const text = copy[locale].binding;
  const [gameName, setGameName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "anonymous") {
    return (
      <section className="binding-panel" aria-label={text.connectTitle}>
        <h3>{text.connectTitle}</h3>
        <p>{text.connectBody}</p>
        <a className="pixel-button secondary" href={`/api/v1/auth/github?locale=${locale}`}>
          {text.connectAction}
        </a>
      </section>
    );
  }

  if (status === "unavailable") {
    return (
      <section className="binding-panel" aria-label={text.connectTitle}>
        <h3>{text.connectTitle}</h3>
        <p>{text.unavailable}</p>
      </section>
    );
  }

  async function submitBinding(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/character/binding", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameName, acceptedTerms, acceptedPrivacy })
      });
      const body = (await response.json()) as
        | { status: "active"; character: PersistentCharacter }
        | { error: string };

      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : text.failure);
      }

      onActivated(body.character);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message === "Game Name is already taken." ? text.taken : text.failure);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="binding-panel" role="region" aria-labelledby="binding-title">
      <h3 id="binding-title">{text.completeTitle}</h3>
      <p>{text.completeBody}</p>
      <div className="binding-disclosure">
        <strong>{text.publicDisclosure}</strong>
        <ul>
          {text.publicFields.map((field) => <li key={field}>{field}</li>)}
        </ul>
      </div>
      <form onSubmit={(event) => void submitBinding(event)}>
        <label className="binding-name">
          <span>{text.gameName}</span>
          <input
            autoComplete="nickname"
            maxLength={32}
            name="gameName"
            onChange={(event) => setGameName(event.target.value)}
            required
            value={gameName}
          />
          <small>{text.gameNameHelp}</small>
        </label>
        <label className="binding-consent">
          <input
            checked={acceptedTerms}
            onChange={(event) => setAcceptedTerms(event.target.checked)}
            type="checkbox"
          />
          <span>{text.acceptTerms} <Link href={`/${locale}/terms`}>{text.terms}</Link></span>
        </label>
        <label className="binding-consent">
          <input
            checked={acceptedPrivacy}
            onChange={(event) => setAcceptedPrivacy(event.target.checked)}
            type="checkbox"
          />
          <span>{text.acceptPrivacy} <Link href={`/${locale}/privacy`}>{text.privacy}</Link></span>
        </label>
        <button
          className="pixel-button secondary"
          disabled={!gameName || !acceptedTerms || !acceptedPrivacy || isSubmitting}
          type="submit"
        >
          {isSubmitting ? text.creating : text.create}
        </button>
      </form>
      {error ? <p className="error-message" role="alert">{error}</p> : null}
    </section>
  );
}
