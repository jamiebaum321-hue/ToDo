import type { Metadata } from "next";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center" style={{ background: "var(--bg)" }}>
      <div>
        <Logo size={96} priority />
        <h1 className="mt-6 text-[22px] font-extrabold" style={{ color: "var(--text)" }}>
          No connection
        </h1>
        <p className="mx-auto mt-2 max-w-[34ch] text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          Your list lives on the server, so it needs a moment of signal. It will be here when you are back.
        </p>
      </div>
    </div>
  );
}
