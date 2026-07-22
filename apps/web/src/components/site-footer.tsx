import Link from "next/link";

import type { Locale } from "../i18n";

const footerCopy = {
  en: { label: "Legal and support", privacy: "Privacy", terms: "Terms", contact: "Contact" },
  zh: { label: "法律与支持", privacy: "隐私说明", terms: "条款", contact: "联系" }
} as const;

export function SiteFooter({ locale }: { locale: Locale }) {
  const text = footerCopy[locale];
  return (
    <footer className="site-footer">
      <nav aria-label={text.label}>
        <Link href={`/${locale}/privacy`}>{text.privacy}</Link>
        <Link href={`/${locale}/terms`}>{text.terms}</Link>
        <Link href={`/${locale}/contact`}>{text.contact}</Link>
      </nav>
      <p>© 2026 Tetraforce</p>
    </footer>
  );
}
