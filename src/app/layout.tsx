import type { Metadata } from "next";

import { AuthProvider } from "@/features/auth/auth-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Selmo | Sales Meeting Analytics",
  description: "営業打ち合わせAI分析・営業可視化ツールのMVP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="font-sans antialiased">
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
