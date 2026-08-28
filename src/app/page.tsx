import { Suspense } from "react";
import { getSessionUser } from "@/lib/auth";
import { loadBoard } from "@/lib/board";
import { TodoApp } from "@/components/app/TodoApp";
import { Landing } from "@/components/app/Landing";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getSessionUser();

  // A logged-out visitor gets the pitch, not a redirect to a form. The app
  // itself lives at this same URL once there is a session.
  if (!user) return <Landing signupsOpen={process.env.ALLOW_SIGNUPS !== "false"} />;

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
