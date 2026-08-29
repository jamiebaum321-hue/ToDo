"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Plug, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Doodle, type DoodleName } from "@/components/Doodle";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  /** The hand-drawn set where a drawing exists for the destination. */
  doodle?: DoodleName;
  /** Otherwise a matched line glyph — there is no hand-drawn plug yet. */
  icon?: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Today", doodle: "today" },
  { href: "/activity", label: "Activity", doodle: "calendar" },
  { href: "/connect", label: "Connect", icon: Plug },
  { href: "/settings", label: "Settings", doodle: "settings" },
];

/**
 * The drawings are ink-weight line art: below about 26px the finer ones close
 * up into a smudge, so both navs give them more room than a typical 18px tab
 * glyph would get.
 */
function NavIcon({ item, size, active }: { item: NavItem; size: number; active: boolean }) {
  if (item.doodle) return <Doodle name={item.doodle} size={size} />;
  const Icon = item.icon!;
  return <Icon style={{ width: size - 4, height: size - 4 }} strokeWidth={active ? 2.6 : 2.2} />;
}

/** Signing out was three clicks deep in Settings. It belongs where you can see it. */
function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
          // replace(), not push(): the back button should not land on a list
          // that is no longer readable.
          router.replace("/login");
          router.refresh();
        } finally {
          setBusy(false);
        }
      }}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-bold transition disabled:opacity-60"
      style={{ color: "var(--text-3)" }}
    >
      <LogOut className="size-[17px]" strokeWidth={2.4} />
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop rail. The logo sits at the top at a size you cannot miss. */
export function SideNav({ counts }: { counts?: Record<string, number> }) {
  const pathname = usePathname();
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 hidden w-[236px] flex-col border-r px-4 py-6 lg:flex"
      style={{ background: "var(--bg-alt)", borderColor: "var(--line)" }}
    >
      <Link href="/" className="flex flex-col items-start gap-3 px-2">
        <Logo size={92} priority />
        <div>
          <p className="text-[22px] font-extrabold leading-none tracking-tight" style={{ color: "var(--text)" }}>
            ToDo
          </p>
          <p className="mt-1.5 text-[12px] font-semibold leading-snug" style={{ color: "var(--text-3)" }}>
            {total > 0 ? `${total} waiting on you` : "All clear"}
          </p>
        </div>
      </Link>

      <nav className="mt-8 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-bold transition"
              style={{
                background: active ? "var(--card)" : "transparent",
                color: active ? "var(--text)" : "var(--text-3)",
                boxShadow: active ? "var(--shadow-card)" : undefined,
              }}
            >
              <NavIcon item={item} size={26} active={active} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-6">
        <p className="px-2 text-[11.5px] font-semibold leading-relaxed" style={{ color: "var(--text-3)" }}>
          Filled by your assistant over MCP. Clear something here and it stops coming back.
        </p>
        <SignOutButton />
      </div>
    </aside>
  );
}

/** Mobile bottom bar. Thumb-height, safe-area aware. */
export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex border-t lg:hidden"
      style={{ background: "var(--card)", borderColor: "var(--line)" }}
    >
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 transition active:scale-95"
            style={{ color: active ? "var(--text)" : "var(--text-3)" }}
            aria-current={active ? "page" : undefined}
          >
            <NavIcon item={item} size={26} active={active} />
            <span className={cn("text-[10.5px]", active ? "font-extrabold" : "font-semibold")}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Shared page frame: rail on the left, content in the middle, tabs at the bottom. */
export function PageShell({
  children,
  counts,
  wide,
}: {
  children: React.ReactNode;
  counts?: Record<string, number>;
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh" style={{ background: "var(--bg)" }}>
      <SideNav counts={counts} />
      <main className={cn("lg:pl-[236px]")}>
        {/* The frame breathes with the view: the board needs the full width, a
            filtered list reads better narrow. The width itself changes in one
            step on purpose — transitioning max-width rewraps every card
            mid-flight. The softness comes from the view-transition crossfade
            (swapView in TodoApp) that this change rides under. */}
        <div
          className={cn(
            "mx-auto w-full px-4 pb-28 pt-4 sm:px-6 lg:pb-14 lg:pt-8",
            wide ? "max-w-[1180px]" : "max-w-[720px]",
          )}
        >
          {children}
        </div>
      </main>
      <TabBar />
    </div>
  );
}

/** Mobile-only header. On desktop the rail already carries the branding. */
export function MobileHeader({ subtitle, right }: { subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-center gap-3 lg:hidden">
      <Logo size={62} priority />
      <div className="min-w-0 flex-1">
        <p className="text-[21px] font-extrabold leading-none tracking-tight" style={{ color: "var(--text)" }}>
          ToDo
        </p>
        {subtitle ? (
          <p className="mt-1 truncate text-[12.5px] font-semibold" style={{ color: "var(--text-3)" }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {right}
    </header>
  );
}
