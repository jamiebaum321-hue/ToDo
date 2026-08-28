import { cn } from "@/lib/utils";

/**
 * The hand-drawn icon set, generated into `public/brand/doodles/` from the
 * source art in `assets/doodles/` by `npm run gen:doodles`.
 *
 * Each file is pure alpha — the drawing lives in the alpha channel and there
 * is no colour in it at all — so it is painted with `mask-image` and takes its
 * ink from `currentColor`. One asset therefore works on cream, on the dark
 * theme, in a bucket accent, and as the pale wash behind the landing headline,
 * and there is no second copy of the art to keep in step.
 */
export type DoodleName =
  | "today"
  | "my-tasks"
  | "my-tasks-2"
  | "calendar"
  | "projects"
  | "search"
  | "profile"
  | "settings"
  | "mascot";

/**
 * Below ~26px the busier drawings (the clipboard, the mascot's face) collapse
 * into a smudge, so anything using this at icon scale should stay at or above
 * that. The 128px file covers everything up to 42px at 3x; past that the 256px
 * one is worth the extra weight.
 */
function assetFor(name: DoodleName, size: number) {
  if (name === "mascot") return "/brand/doodles/mascot.png";
  return `/brand/doodles/${name}${size <= 42 ? "-128" : ""}.png`;
}

export function Doodle({
  name,
  size = 30,
  className,
  style,
  title,
}: {
  name: DoodleName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Only pass this when the drawing is the sole label; otherwise it is decoration. */
  title?: string;
}) {
  const url = `url(${assetFor(name, size)})`;

  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={cn("inline-block shrink-0 select-none bg-current", className)}
      style={{
        width: size,
        height: size,
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        ...style,
      }}
    />
  );
}
