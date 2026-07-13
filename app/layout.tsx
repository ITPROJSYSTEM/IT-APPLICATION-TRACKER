import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IT Application Tracker",
  description: "Project and test case tracking dashboard for IT application delivery."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
