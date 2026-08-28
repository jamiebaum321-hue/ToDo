import type { Metadata, Viewport } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
  // The logo is hand-drawn and rounded; the fallback should not be a stiff grotesk.
  fallback: ["ui-rounded", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
});

const APP_NAME = "ToDo";
const DESCRIPTION =
  "Your assistant reads every inbox, calendar and chat you have, sorts what is left into four buckets, and puts each one a single tap from done.";

export const metadata: Metadata = {
  // Lets Next resolve /og.png to an absolute URL for social cards.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: { default: "ToDo", template: "%s · ToDo" },
  description: DESCRIPTION,
  applicationName: APP_NAME,
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "ToDo — agent-filled task inbox",
    description: DESCRIPTION,
    images: ["/og.png"],
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "ToDo", description: DESCRIPTION, images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5EFE3" },
    { media: "(prefers-color-scheme: dark)", color: "#131209" },
  ],
};

/**
 * Runs before paint so a dark-mode user never gets a cream flash. It reads the
 * saved preference, falls back to the system, and writes data-theme on <html>.
 */
const THEME_SCRIPT = `(function(){try{
var t=localStorage.getItem('todo-theme')||'system';
var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.setAttribute('data-theme',d?'dark':'light');
}catch(e){document.documentElement.setAttribute('data-theme','light')}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={nunito.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
