import { Suspense } from "react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { loadBoard } from "@/lib/board";
import { TodoApp } from "@/components/app/TodoApp";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) {
    // No account at all means this is a fresh install; send them to set one up.
    const count = await prisma.user.count();
    redirect(count === 0 ? "/login?setup=1" : "/login");
  }

  const board = await loadBoard(user);

  return (
    <Suspense fallback={<Splash />}>
      <TodoApp initial={board} />
    </Suspense>
  );
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center" style={{ background: "var(--bg)" }}>
      <Logo size={88} priority className="animate-pop" />
    </div>
  );
}
