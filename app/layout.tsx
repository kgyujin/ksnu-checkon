import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CheckOn - 사업자 신뢰도 원스톱 조회",
  description: "국세청, 공정위, 특허청 데이터를 기반으로 한 사업자 신뢰도 분석 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
