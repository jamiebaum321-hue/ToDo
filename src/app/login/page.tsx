import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/app/LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");

  const count = await prisma.user.count();
  return (
    <Suspense>
      <LoginForm firstRun={count === 0} signupsOpen={process.env.ALLOW_SIGNUPS !== "false"} />
    </Suspense>
  );
}
