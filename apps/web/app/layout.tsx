import type { Metadata } from "next";

import "./styles.css";

export const metadata: Metadata = {
  title: "Tetraforce",
  description: "Offer Tokens. Shape Your Fate."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
