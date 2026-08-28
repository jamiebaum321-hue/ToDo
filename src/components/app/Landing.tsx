import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Doodle } from "@/components/Doodle";
import { BUCKETS } from "@/lib/buckets";

/** What a logged-out visitor sees. Explains the loop, then gets out of the way. */
export function Landing({ signupsOpen }: { signupsOpen: boolean }) {
  return (
    <div className="min-h-dvh" style={{ background: "var(--bg)" }}>
      <header className="mx-auto flex max-w-[1080px] items-center gap-3 px-5 py-6">
        <Logo size={44} priority />
        <span className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
          ToDo
        </span>
        <nav className="ml-auto flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-2xl px-4 py-2.5 text-[14px] font-bold"
            style={{ color: "var(--text-2)" }}
          >
            Sign in
          </Link>
          {signupsOpen ? (
            <Link
              href="/signup"
              className="rounded-2xl px-4 py-2.5 text-[14px] font-extrabold transition active:scale-[0.98]"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              Get started
            </Link>
          ) : null}
        </nav>
      </header>

      {/* --- hero --------------------------------------------------------- */}
      <section className="mx-auto max-w-[1080px] px-5 pb-4 pt-8 sm:pt-16">
        <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
          <div className="relative">
            {/*
              The mascot goes behind the headline rather than beside it. It is painted in --wash, a tone taken from the
              background family rather than the ink family, so it cannot clash with the heading on colour by
              construction: the near-black headline still clears 13:1 against the darkest line of the drawing, and the
              body copy 8:1. It is sized and offset to read as a whole figure — cropping it mid-body just leaves
              anonymous squiggles — and fades out at the feet so it settles into the page rather than stopping dead.
            */}
            <div
              aria-hidden
              className="pointer-events-none absolute -top-6 -right-6 h-[300px] w-[282px] sm:-top-10 sm:h-[420px] sm:w-[395px] lg:-top-8 lg:-right-20 lg:h-[490px] lg:w-[461px]"
              style={{
                maskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 72%, transparent 100%)",
              }}
            >
              <Doodle name="mascot" style={{ width: "100%", height: "100%", color: "var(--wash)" }} />
            </div>

            {/* Positioned too, so the copy paints over the mascot without needing a negative z-index. */}
            <div className="relative">
              <p className="text-[13px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--text-2)" }}>
                Agent-filled task inbox
              </p>
              <h1
                className="mt-4 max-w-[14ch] text-[44px] font-extrabold leading-[0.98] tracking-tight sm:text-[60px]"
                style={{ color: "var(--text)" }}
              >
                Everything you owe someone.
              </h1>
              <p
                className="mt-6 max-w-[48ch] text-[17px] leading-relaxed sm:text-[19px]"
                style={{ color: "var(--text-2)" }}
              >
                Your Claude or ChatGPT subscription already reads your mail, calendar and chat. Point it at ToDo and
                every morning it sorts what actually needs you into four buckets — each one a single tap from done.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                {signupsOpen ? (
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[16px] font-extrabold transition active:scale-[0.98]"
                    style={{ background: "var(--text)", color: "var(--bg)" }}
                  >
                    Start free
                    <ArrowRight className="size-[18px]" strokeWidth={3} />
                  </Link>
                ) : null}
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[16px] font-bold"
                  style={{ border: "1px solid var(--line-strong)", color: "var(--text)" }}
                >
                  Sign in
                </Link>
              </div>

              <p className="mt-4 text-[13px]" style={{ color: "var(--text-2)" }}>
                Works with Claude and ChatGPT over MCP. No email credentials ever touch ToDo.
              </p>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[340px]">
            <Image
              src="/screenshots/mobile-detail.png"
              alt="A task open in ToDo, showing Open in Outlook and See your draft"
              width={430}
              height={932}
              priority
              className="w-full rounded-[28px]"
              style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-lift)" }}
            />
          </div>
        </div>
      </section>

      {/* --- the loop ----------------------------------------------------- */}
      <section className="mx-auto max-w-[1080px] px-5 py-20">
        <h2 className="max-w-[20ch] text-[30px] font-extrabold leading-tight tracking-tight sm:text-[38px]" style={{ color: "var(--text)" }}>
          It stops asking once you have done it.
        </h2>
        <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          An assistant looking at a rolling two-week window sees the same email every morning. Bob wrote on Tuesday and
          you never replied — because you called him instead. Most tools would file &ldquo;get back to Bob&rdquo; again
          tomorrow, and the day after.
        </p>
        <p className="mt-4 max-w-[62ch] text-[16.5px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          Clearing a task in ToDo is recorded against that message&apos;s own identifier. Your assistant reads that
          list before it writes anything, and the app refuses anything you have already handled — and tells it why.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BUCKETS.map((b) => (
            <div
              key={b.key}
              className="rounded-[var(--radius-card)] p-5"
              style={{ background: "var(--card)", border: "1px solid var(--line)" }}
            >
              <span className="block size-3 rounded-full" style={{ background: b.accent }} />
              <h3 className="mt-4 text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
                {b.label}
              </h3>
              <p className="mt-1.5 text-[14px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                {b.blurb}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* --- what you get ------------------------------------------------- */}
      <section className="mx-auto max-w-[1080px] px-5 pb-20">
        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <Image
            src="/screenshots/desktop-board.png"
            alt="The four-bucket board in ToDo on a desktop"
            width={1280}
            height={800}
            className="w-full rounded-[20px]"
            style={{ border: "1px solid var(--line)", boxShadow: "var(--shadow-card)" }}
          />
          <ul className="space-y-4">
            {[
              ["One tap to the exact message", "Every task carries browser, desktop and phone links, and opens whichever fits the device in your hand."],
              ["Replies already written", "Where your assistant drafted a response, the task has a button that opens that exact draft. Read it, send it, done."],
              ["On your phone and your desktop", "Installable on iOS, Android, macOS and Windows, with a morning digest that arrives at your local time."],
              ["Your data stays yours", "No trackers, no analytics, no training. Export or delete everything from inside the app, immediately."],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3.5">
                <span
                  className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full"
                  style={{ background: "var(--tint-done)", color: "var(--accent-done)" }}
                >
                  <Check className="size-3.5" strokeWidth={3.2} />
                </span>
                <span>
                  <span className="block text-[16px] font-extrabold" style={{ color: "var(--text)" }}>
                    {title}
                  </span>
                  <span className="mt-1 block text-[14.5px] leading-relaxed" style={{ color: "var(--text-3)" }}>
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* --- close -------------------------------------------------------- */}
      <section className="mx-auto max-w-[1080px] px-5 pb-24">
        <div
          className="flex flex-col items-center rounded-[26px] px-6 py-14 text-center"
          style={{ background: "var(--bg-alt)", border: "1px solid var(--line-2)" }}
        >
          <Logo size={80} />
          <h2 className="mt-6 max-w-[18ch] text-[30px] font-extrabold leading-tight tracking-tight" style={{ color: "var(--text)" }}>
            Stop rediscovering what you forgot.
          </h2>
          {signupsOpen ? (
            <Link
              href="/signup"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[16px] font-extrabold transition active:scale-[0.98]"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              Create your ToDo
              <ArrowRight className="size-[18px]" strokeWidth={3} />
            </Link>
          ) : (
            <Link
              href="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-2xl px-6 py-3.5 text-[16px] font-extrabold"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              Sign in
            </Link>
          )}
        </div>
      </section>

      <footer className="mx-auto max-w-[1080px] border-t px-5 py-8" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-[13.5px] font-bold" style={{ color: "var(--text-3)" }}>
          <span className="inline-flex items-center gap-2">
            <Logo size={24} />
            ToDo
          </span>
          <Link href="/terms" className="underline underline-offset-4">Terms</Link>
          <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
          <Link href="/login" className="ml-auto underline underline-offset-4">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
