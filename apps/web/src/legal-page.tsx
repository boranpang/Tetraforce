import { notFound } from "next/navigation";

import { LegalDocumentPage } from "./components/legal-document-page";
import { isLocale } from "./i18n";
import type { LegalDocument } from "./legal-content";
import { getSupportEmail } from "./server/public-config";

export function createLegalPage(document: LegalDocument) {
  return async function LegalPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale } = await params;
    if (!isLocale(locale)) {
      notFound();
    }
    return <LegalDocumentPage locale={locale} document={document} supportEmail={getSupportEmail()} />;
  };
}
