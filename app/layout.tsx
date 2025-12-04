import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "CheckOn",
  description:
    "이 쇼핑몰, 믿고 사도 될까? 1초 만에 확인하기",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-R9DFYNXWGN"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-R9DFYNXWGN');
          `}
        </Script>
      </head>
      <body className="antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
