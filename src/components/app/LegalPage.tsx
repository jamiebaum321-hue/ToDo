import Link from "next/link";
import { Logo } from "@/components/Logo";

/** Shared chrome for the public documents, so they read as part of the product. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh" style={{ background: "var(--bg)" }}>
      <header className="mx-auto flex max-w-[720px] items-center gap-3 px-5 pb-2 pt-8">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={44} priority />
          <span className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
            ToDo
          </span>
        </Link>
      </header>

      <main className="mx-auto max-w-[720px] px-5 pb-24 pt-6">
        <h1 className="text-[32px] font-extrabold leading-tight tracking-tight" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        <p className="mt-2 text-[13.5px] font-semibold" style={{ color: "var(--text-3)" }}>
          Last updated {updated}
        </p>

        <div className="legal mt-8 space-y-5">{children}</div>

        <footer className="mt-14 border-t pt-6 text-[13px]" style={{ borderColor: "var(--line)", color: "var(--text-3)" }}>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-bold">
            <Link href="/" className="underline underline-offset-4">Home</Link>
            <Link href="/terms" className="underline underline-offset-4">Terms</Link>
            <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
            <Link href="/login" className="underline underline-offset-4">Sign in</Link>
          </div>
        </footer>
      </main>
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 text-[19px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
      {children}
    </h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>
      {children}
    </p>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="ml-5 list-disc space-y-1.5 text-[15px] leading-relaxed" style={{ color: "var(--text-2)" }}>
      {children}
    </ul>
  );
}

export function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5 text-[14px] leading-relaxed"
      style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)", color: "var(--text-2)" }}
    >
      {children}
    </div>
  );
}
