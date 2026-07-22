"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { BrowserBindingState } from "../binding-contract";
import { copy, type Locale } from "../i18n";
import type { PersistentCharacter } from "../server/binding-service";
import { GuestOnboarding } from "./guest-onboarding";
import { PersistentCharacterTemple } from "./persistent-character-temple";
import { SiteFooter } from "./site-footer";

export function TemplePage({ locale }: { locale: Locale }) {
  const [bindingState, setBindingState] = useState<BrowserBindingState | null>(null);
  const [hasAuthenticationError, setHasAuthenticationError] = useState(false);
  const text = copy[locale];
  const otherLocale = locale === "en" ? "zh" : "en";
  const isActive = bindingState?.status === "active";
  const characterNavigationLabel = isActive
    ? text.characterComingSoon
    : text.characterLocked;

  useEffect(() => {
    let cancelled = false;
    const searchParams = new URLSearchParams(window.location.search);
    const callbackStatus = searchParams.get("binding");
    setHasAuthenticationError(callbackStatus === "error");
    if (callbackStatus) {
      searchParams.delete("binding");
      const query = searchParams.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    void fetch("/api/v1/character/binding", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Binding state unavailable");
        }
        return (await response.json()) as BrowserBindingState;
      })
      .then((state) => {
        if (!cancelled) {
          setBindingState(state);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBindingState({ status: "unavailable" });
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main lang={locale}>
      <header className="site-header">
        <Link className="wordmark" href={`/${locale}`}>Tetraforce</Link>
        <nav aria-label="Primary navigation">
          <Link aria-current="page" href={`/${locale}`}>{text.temple}</Link>
          <span aria-disabled="true" title={text.rankingsSoon}>{text.rankings}</span>
          <button type="button" aria-label={characterNavigationLabel} title={characterNavigationLabel}>
            <span>{locale === "en" ? "Character" : "角色"} <span aria-hidden="true">▣</span></span>
            <small>{characterNavigationLabel}</small>
          </button>
        </nav>
        <Link className="locale-switch" href={`/${otherLocale}`} hrefLang={otherLocale}>
          {otherLocale === "zh" ? "中文" : "EN"}
        </Link>
      </header>

      <section className="temple-intro">
        <h1>Tetraforce</h1>
        <p>{text.tagline}</p>
      </section>

      {hasAuthenticationError ? (
        <p className="binding-callback-error" role="alert">{text.binding.authenticationError}</p>
      ) : null}

      {!bindingState ? (
        <p className="system-message" role="status">
          {locale === "en" ? "Restoring your fate..." : "正在恢复你的命运……"}
        </p>
      ) : bindingState.status === "active" ? (
        <PersistentCharacterTemple character={bindingState.character} locale={locale} />
      ) : (
        <GuestOnboarding
          bindingStatus={bindingState.status}
          locale={locale}
          onActivated={(character: PersistentCharacter) =>
            setBindingState({ status: "active", character })
          }
        />
      )}

      <SiteFooter locale={locale} />
    </main>
  );
}
