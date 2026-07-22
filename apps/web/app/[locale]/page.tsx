import Link from "next/link";
import { notFound } from "next/navigation";

import { GuestOnboarding } from "../../src/components/guest-onboarding";
import { copy, isLocale } from "../../src/i18n";

export default async function TemplePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  const text = copy[locale];
  const otherLocale = locale === "en" ? "zh" : "en";

  return (
    <main lang={locale}>
      <header className="site-header">
        <Link className="wordmark" href={`/${locale}`}>Tetraforce</Link>
        <nav aria-label="Primary navigation">
          <Link aria-current="page" href={`/${locale}`}>{text.temple}</Link>
          <span aria-disabled="true" title={text.rankingsSoon}>{text.rankings}</span>
          <button type="button" aria-label={text.characterLocked} title={text.characterLocked}>
            <span>{locale === "en" ? "Character" : "角色"} <span aria-hidden="true">▣</span></span>
            <small>{text.characterLocked}</small>
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

      <GuestOnboarding locale={locale} />
    </main>
  );
}
