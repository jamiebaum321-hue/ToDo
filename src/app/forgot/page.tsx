import type { Metadata } from "next";
import { ForgotForm } from "@/components/app/ForgotForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return <ForgotForm />;
}
