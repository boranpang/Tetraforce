import { USAGE_SUMMARY_FIELDS } from "@tetraforce/contracts";
import Link from "next/link";

import { legalContent, type LegalDocument } from "../legal-content";
import type { Locale } from "../i18n";
import { SiteFooter } from "./site-footer";

const chromeCopy = {
  en: { back: "Back to Temple", skip: "Skip to legal content", support: "Support email" },
  zh: { back: "返回神殿", skip: "跳至法律正文", support: "支持邮箱" }
} as const;

export function LegalDocumentPage({
  locale,
  document,
  supportEmail
}: {
  locale: Locale;
  document: LegalDocument;
  supportEmail: string;
}) {
  const content = legalContent[locale][document];
  const text = chromeCopy[locale];
  const otherLocale = locale === "en" ? "zh" : "en";

  return (
    <div lang={locale}>
      <a className="skip-link" href="#legal-content">{text.skip}</a>
      <header className="legal-header">
        <Link className="wordmark" href={`/${locale}`}>Tetraforce</Link>
        <Link className="back-link" href={`/${locale}`}>← {text.back}</Link>
        <Link
          className="locale-switch"
          href={`/${otherLocale}/${document}`}
          hrefLang={otherLocale}
        >
          {otherLocale === "zh" ? "中文" : "EN"}
        </Link>
      </header>

      <main className="legal-main" id="legal-content">
        <article className="legal-document" aria-labelledby="legal-title">
          <header className="legal-title-block">
            <p className="legal-kicker">Tetraforce</p>
            <h1 id="legal-title">{content.title}</h1>
            <p className="legal-summary">{content.summary}</p>
            <p className="legal-updated">{content.updated}</p>
          </header>

          {document === "contact" ? (
            <aside className="contact-card" aria-label={text.support}>
              <span>{text.support}</span>
              <a href={`mailto:${supportEmail}`}>{supportEmail}</a>
            </aside>
          ) : null}

          {content.sections.map((section) => (
            <section className="legal-section" id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {section.id === "usage-summary" ? (
                <dl className="field-list">
                  {USAGE_SUMMARY_FIELDS.map((field) => (
                    <div data-testid="usage-summary-field" key={field.key}>
                      <dt><code>{field.key}</code> — {field.label[locale]}</dt>
                      <dd>{field.description[locale]}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {section.bullets ? (
                <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul>
              ) : null}
            </section>
          ))}
        </article>
      </main>

      <SiteFooter locale={locale} />
    </div>
  );
}
