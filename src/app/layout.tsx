import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Selmo | Sales Call Analytics",
  description: "営業通話AI分析・営業可視化ツールのMVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
