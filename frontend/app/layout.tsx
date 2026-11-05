import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/instrument-serif/400.css";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Panel de Vida",
  description: "Tu panel financiero personal",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Panel de Vida", statusBarStyle: "black-translucent" },
};
export const viewport: Viewport = { themeColor: "#07070B", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <div className="aurora" aria-hidden="true"><i /><i /><i /><i /><b className="spot" /></div>
        <ToastProvider>{children}</ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
