import { Suspense } from "react";
import type { Metadata } from "next";
import { TokenAction } from "@/components/app/TokenAction";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirming your new email" };

export default function VerifyEmailChangePage() {
  return (
    <Suspense>
      <TokenAction
        endpoint="/api/account/email"
        method="PATCH"
        working="Confirming the change…"
        successTitle="Address updated"
        successBody="Sign in with your new address from now on."
        successHref="/settings"
        successCta="Back to settings"
      />
    </Suspense>
  );
}
