import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Confirmation d'inscription",
  description: "Plateforme de confirmation de filière pour les agents",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
