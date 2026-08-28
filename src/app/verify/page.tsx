import { Suspense } from "react";
import type { Metadata } from "next";
import { TokenAction } from "@/components/app/TokenAction";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirming your email" };

export default function VerifyPage() {
  return (
    <Suspense>
      <TokenAction
        endpoint="/api/auth/verify"
        working="Confirming your email…"
        successTitle="You're in"
        successBody="Your address is confirmed. Next, connect Claude or ChatGPT and your list starts filling itself."
        successHref="/connect"
        successCta="Connect your assistant"
      />
    </Suspense>
  );
}
