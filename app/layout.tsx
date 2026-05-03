import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portal Staff SUPER GEEK",
  description: "Launcher interno de aplicaciones para el staff SUPER GEEK"
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
