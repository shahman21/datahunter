"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Keep the prototype navigation to its two main screens. */
export function Nav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {links.map((l) => {
        const active = pathname === l.href || (l.href === "/console" && pathname === "/");
        return (
          <Link key={l.href} href={l.href} aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
