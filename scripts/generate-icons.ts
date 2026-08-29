/**
 * Build every brand asset from `assets/logo-source.png`.
 *
 * The source is a 1263px master, so every size below is a downscale and the
 * detail is really there rather than invented. What the remap below still
 * earns its keep for is colour: the logo is line art in exactly two tones, and
 * pushing every pixel's ink coverage through a mild curve pins it to the brand
 * cream and ink instead of whatever the export left behind, and firms up edges
 * that a downscale always softens a little.
 *
 *   npm run gen:icons
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "assets/logo-source.png");
const PUBLIC = join(ROOT, "public");

/** Sampled straight out of the logo. */
export const CREAM = { r: 250, g: 244, b: 234 };
export const INK = { r: 14, g: 14, b: 12 };
const CREAM_HEX = "#FAF4EA";
/** The dark theme's page background, for the dark splash screen. */
const DARK_HEX = "#131209";

const CREAM_LUM = 245;
const INK_LUM = 12;
/**
 * Higher = harder edges. This was 3.2 when the source was a 176px thumbnail
 * and every size was an upscale; against the real master that much would eat
 * the hand-drawn wobble, so it is now just enough to undo downscale softening.
 */
const CRISPNESS = 1.4;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const crisp = (t: number) => clamp01((t - 0.5) * CRISPNESS + 0.5);

/** A high-resolution, re-sharpened master with the circular alpha intact. */
async function buildMaster(size: number): Promise<Buffer> {
  // One RGBA resize with a fully transparent background. sharp premultiplies
  // alpha for the resample, so transparent-black neighbours cannot bleed a
  // halo into edge pixels — and the alpha plane stays the source's own.
  //
  // An earlier version resized colour and alpha in separate pipelines, on the
  // theory that split channels avoided the halo. It did not survive contact
  // with sharp's fixed operation order: extractChannel applies AFTER resize
  // no matter where it appears in the chain, so the "alpha" that pipeline
  // read back was a near-solid plane — which is exactly where the opaque
  // cream square around the disc came from.
  const { data, info } = await sharp(SOURCE)
    .ensureAlpha()
    .resize(size, size, { kernel: "lanczos3", fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(info.width * info.height * 4);

  for (let i = 0; i < out.length; i += 4) {
    const a = crisp(clamp01(data[i + 3] / 255));
    if (a === 0) {
      // Fully outside the disc. Cream under zero alpha, so a resampler that
      // later peeks at the colour of transparent pixels finds no black.
      out[i] = CREAM.r;
      out[i + 1] = CREAM.g;
      out[i + 2] = CREAM.b;
      continue;
    }

    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const coverage = crisp(clamp01((CREAM_LUM - lum) / (CREAM_LUM - INK_LUM)));

    out[i] = Math.round(CREAM.r + (INK.r - CREAM.r) * coverage);
    out[i + 1] = Math.round(CREAM.g + (INK.g - CREAM.g) * coverage);
    out[i + 2] = Math.round(CREAM.b + (INK.b - CREAM.b) * coverage);
    out[i + 3] = Math.round(a * 255);
  }

  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

/** The logo centred on a cream tile — what a launcher or a browser tab wants. */
async function tile(master: Buffer, size: number, logoScale: number, background = CREAM_HEX): Promise<Buffer> {
  const inner = Math.round(size * logoScale);
  const logo = await sharp(master)
    .resize(inner, inner, { kernel: "lanczos3" })
    .flatten({ background })
    .toBuffer();
  const offset = Math.round((size - inner) / 2);

  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * ICO files may hold PNGs directly, which keeps this to a 6-byte header, a
 * 16-byte directory entry per size, and the PNG bytes.
 */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries: Buffer[] = [];
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 0 means 256
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2); // palette
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

/** The social card: big logo, the name, and what the thing actually does. */
async function buildOgImage(master: Buffer): Promise<Buffer> {
  const W = 1200;
  const H = 630;
  const logoSize = 300;
  const logo = await sharp(master)
    .resize(logoSize, logoSize, { kernel: "lanczos3" })
    .flatten({ background: CREAM_HEX })
    .toBuffer();

  const text = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>
      .name { font: 800 104px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #0E0E0C; letter-spacing: -3px; }
      .tag  { font: 500 34px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #57534A; }
      .kick { font: 700 22px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; fill: #8A8578; letter-spacing: 3px; }
    </style>
    <text x="470" y="250" class="kick">AGENT-FILLED TASK INBOX</text>
    <text x="470" y="352" class="name">ToDo</text>
    <text x="470" y="416" class="tag">Everything you owe someone,</text>
    <text x="470" y="464" class="tag">sorted and one tap from done.</text>
  </svg>`;

  return sharp({ create: { width: W, height: H, channels: 4, background: CREAM_HEX } })
    .composite([
      { input: logo, top: Math.round((H - logoSize) / 2), left: 120 },
      { input: Buffer.from(text), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * A logo centred on a square canvas, with room around it. Capacitor's asset
 * generator crops and rescales these into every launcher size iOS and Android
 * ask for, so they only need to be big and correctly padded.
 */
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

async function canvas(
  master: Buffer,
  size: number,
  logoScale: number,
  background: string | typeof TRANSPARENT,
): Promise<Buffer> {
  const inner = Math.round(size * logoScale);
  const resized = sharp(master).resize(inner, inner, { kernel: "lanczos3" });
  // On a solid ground, flatten the disc's own alpha onto it so the two creams
  // meet cleanly; on a transparent one, keep the cutout.
  const logo = await (typeof background === "string" ? resized.flatten({ background }) : resized).toBuffer();
  const offset = Math.round((size - inner) / 2);

  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, top: offset, left: offset }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  await mkdir(join(PUBLIC, "icons"), { recursive: true });
  await mkdir(join(PUBLIC, "brand"), { recursive: true });
  await mkdir(join(ROOT, "native/assets"), { recursive: true });

  const master = await buildMaster(1024);
  const written: string[] = [];

  const write = async (relative: string, data: Buffer) => {
    await writeFile(join(ROOT, relative), data);
    written.push(`${relative}  ${(data.length / 1024).toFixed(1)} KB`);
  };

  // The mark itself, transparent outside the disc, for use in the UI.
  await write("public/brand/mark.png", master);
  await write(
    "public/brand/mark-512.png",
    await sharp(master).resize(512, 512, { kernel: "lanczos3" }).png().toBuffer(),
  );
  await write(
    "public/brand/mark-256.png",
    await sharp(master).resize(256, 256, { kernel: "lanczos3" }).png().toBuffer(),
  );
  await write(
    "public/brand/mark-128.png",
    await sharp(master).resize(128, 128, { kernel: "lanczos3" }).png().toBuffer(),
  );

  // PWA icons. "any" fills the tile; "maskable" leaves the safe zone Android crops to.
  await write("public/icons/icon-192.png", await tile(master, 192, 0.94));
  await write("public/icons/icon-512.png", await tile(master, 512, 0.94));
  await write("public/icons/maskable-192.png", await tile(master, 192, 0.64));
  await write("public/icons/maskable-512.png", await tile(master, 512, 0.64));
  await write("public/icons/apple-touch-icon.png", await tile(master, 180, 0.86));

  // Next.js picks these up automatically from src/app.
  await write("src/app/icon.png", await tile(master, 96, 1.0));
  await write("src/app/apple-icon.png", await tile(master, 180, 0.86));

  const icoSizes = [16, 32, 48];
  const icoPngs = await Promise.all(
    icoSizes.map(async (size) => ({ size, png: await tile(master, size, 1.0) })),
  );
  await write("public/favicon.ico", buildIco(icoPngs));
  for (const { size, png } of icoPngs) await write(`public/icons/favicon-${size}.png`, png);

  await write("public/og.png", await buildOgImage(master));

  // What `npx @capacitor/assets generate` reads. Keeping these generated from
  // the same master means the launcher and App Store icons are reproducible
  // from the repo rather than being binaries nobody can rebuild.
  await write("native/assets/icon.png", await canvas(master, 1024, 0.92, CREAM_HEX));
  // Android crops an adaptive icon hard, so the foreground sits well inside.
  await write("native/assets/icon-foreground.png", await canvas(master, 1024, 0.62, TRANSPARENT));
  await write(
    "native/assets/icon-background.png",
    await sharp({ create: { width: 1024, height: 1024, channels: 4, background: CREAM_HEX } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
  await write("native/assets/splash.png", await canvas(master, 2732, 0.22, CREAM_HEX));
  await write("native/assets/splash-dark.png", await canvas(master, 2732, 0.22, DARK_HEX));

  console.log("Brand assets written:\n  " + written.join("\n  "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
