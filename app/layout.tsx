import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "DataHunter",
  description: "Find the data you need with a brief and a budget.",
};

const links = [{ href: "/console", label: "Console" }, { href: "/market", label: "Catalogue" }];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="header">
          <div className="header-inner">
            <Link href="/" className="wordmark">
              <span className="brand-mark" aria-hidden="true">d</span>
              <b>DataHunter</b>
            </Link>
            <Nav links={links} />
          </div>
        </header>
        <main className="page">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>DataHunter · Work in progress</span>
            <span>Solana devnet · Test funds only</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
