import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frost Draw",
  description: "Draw window frost patterns",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
