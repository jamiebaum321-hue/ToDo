import { Suspense } from "react";
import type { Metadata } from "next";
import { ResetForm } from "@/components/app/ResetForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
