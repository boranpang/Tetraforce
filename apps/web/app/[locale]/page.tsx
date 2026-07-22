import { notFound } from "next/navigation";

import { TemplePage as TemplePageContent } from "../../src/components/temple-page";
import { isLocale } from "../../src/i18n";

export default async function TemplePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }

  return <TemplePageContent locale={locale} />;
}
