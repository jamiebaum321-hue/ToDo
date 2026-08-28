import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The mark, at whatever size. Always the real logo — never a text substitute,
 * because the doodle is the brand.
 */
export function Logo({
  size = 40,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/mark-512.png"
      alt="ToDo"
      width={size}
      height={size}
      priority={priority}
      className={cn("select-none", className)}
      style={{ width: size, height: size }}
      // The disc is already round; a radius here would clip the ink.
      draggable={false}
    />
  );
}

export function Wordmark({ className, size = 34 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Logo size={size} priority />
      <span className="text-[19px] font-extrabold tracking-tight" style={{ color: "var(--text)" }}>
        ToDo
      </span>
    </span>
  );
}
