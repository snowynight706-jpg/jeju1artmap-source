import type { Metadata } from "next";
import "./globals.css";
import PwaLifecycle from "./pwa-lifecycle";
import { DEFAULT_SITE_DISPLAY_NAME } from "./site-identity";

const pwaHeadScript = `(() => {
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=device-width, initial-scale=1, viewport-fit=cover');
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!standalone) return;
  const colors = { stormy: '#2B2D33', 'nordic-sand': '#3A3835', lilac: '#26222F', 'urban-blush': '#6E5B63', 'harbor-morning': '#26313B' };
  let theme = 'stormy';
  try { theme = localStorage.getItem('jeju-wondosim-map-review:ui-theme:v1') || theme; } catch {}
  const color = colors[theme] || colors.stormy;
  document.documentElement.style.setProperty('--app-status-bar-color', color);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', color);
})();`;

export const metadata: Metadata = {
  title: DEFAULT_SITE_DISPLAY_NAME,
  description: "제주 원도심의 문화예술 공간과 행사, 이야기를 한눈에 살펴보는 지도",
  applicationName: DEFAULT_SITE_DISPLAY_NAME,
  manifest: "/manifest.webmanifest",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.png",
    apple: [
      { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="theme-color" content="#F6F6F6" />
        <script dangerouslySetInnerHTML={{ __html: pwaHeadScript }} />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="원도심 맵" />
      </head>
      <body>
        {children}
        <PwaLifecycle />
      </body>
    </html>
  );
}
