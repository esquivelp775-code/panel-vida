import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Panel de Vida",
  description: "Tu panel financiero personal",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon-192.png" },
  appleWebApp: { capable: true, title: "Panel de Vida", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#059669", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
        <RegisterSW />
      </body>
    </html>
  );
}
