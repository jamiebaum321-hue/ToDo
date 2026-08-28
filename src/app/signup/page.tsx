import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { SignupForm } from "@/components/app/SignupForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create your account" };

export default async function SignupPage() {
  if (await getSessionUser()) redirect("/");

  const count = await prisma.user.count();
  // ALLOW_SIGNUPS=false closes a private instance once its owner has an account.
  const closed = process.env.ALLOW_SIGNUPS === "false" && count > 0;
  if (closed) redirect("/login");

  return <SignupForm firstRun={count === 0} />;
}
