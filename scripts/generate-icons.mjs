import { Buffer } from "node:buffer";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { ImageResponse } from "next/og.js";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontPath = join(root, "src/app/fonts/Outfit-ExtraBold.ttf");
const faviconSvgPath = join(root, "public/favicon.svg");

const NAVY = "#1e1f3b";
const ACCENT = "#555af5";

function wordmarkSizes(size) {
  return {
    ynab: Math.round(size * 0.27),
    converter: Math.round(size * 0.108),
    gap: Math.round(size * 0.045),
    letterSpacing: Math.round(size * -0.008 * 10) / 10,
  };
}

function WordmarkIcon({ size }) {
  const { ynab, converter, gap, letterSpacing } = wordmarkSizes(size);

  return createElement(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: NAVY,
        fontFamily: "Outfit",
        fontWeight: 800,
      },
    },
    createElement(
      "div",
      {
        style: {
          color: ACCENT,
          fontSize: ynab,
          lineHeight: 1,
          letterSpacing,
        },
      },
      "YNAB"
    ),
    createElement(
      "div",
      {
        style: {
          color: "#ffffff",
          fontSize: converter,
          lineHeight: 1,
          letterSpacing,
          marginTop: gap,
        },
      },
      "CONVERTER"
    )
  );
}

async function renderWordmarkPng(size, fontData) {
  const response = new ImageResponse(createElement(WordmarkIcon, { size }), {
    width: size,
    height: size,
    fonts: [
      {
        name: "Outfit",
        data: fontData,
        weight: 800,
        style: "normal",
      },
    ],
  });

  return Buffer.from(await response.arrayBuffer());
}

function encodeIco(images) {
  const headerSize = 6 + 16 * images.length;
  let offset = headerSize;
  const entries = images.map((image) => {
    const entry = { ...image, offset };
    offset += image.buffer.length;
    return entry;
  });

  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0);
  out.writeUInt16LE(1, 2);
  out.writeUInt16LE(images.length, 4);

  entries.forEach((entry, index) => {
    const start = 6 + index * 16;
    out.writeUInt8(entry.size >= 256 ? 0 : entry.size, start);
    out.writeUInt8(entry.size >= 256 ? 0 : entry.size, start + 1);
    out.writeUInt8(0, start + 2);
    out.writeUInt8(0, start + 3);
    out.writeUInt16LE(1, start + 4);
    out.writeUInt16LE(32, start + 6);
    out.writeUInt32LE(entry.buffer.length, start + 8);
    out.writeUInt32LE(entry.offset, start + 12);
    entry.buffer.copy(out, entry.offset);
  });

  return out;
}

async function main() {
  const [fontData, faviconSvg] = await Promise.all([
    readFile(fontPath),
    readFile(faviconSvgPath),
  ]);

  const wordmarkSizesToWrite = [
    { size: 180, path: join(root, "public/apple-touch-icon.png") },
    { size: 192, path: join(root, "public/android-chrome-192x192.png") },
    { size: 512, path: join(root, "public/android-chrome-512x512.png") },
  ];

  for (const { size, path } of wordmarkSizesToWrite) {
    const png = await renderWordmarkPng(size, fontData);
    await writeFile(path, png);
    console.log(`wrote ${path.replace(`${root}/`, "")} (${size}x${size})`);
  }

  const icoImages = [];
  for (const size of [16, 32, 48]) {
    const buffer = await sharp(faviconSvg, { density: 72 * (size / 32) })
      .resize(size, size)
      .png()
      .toBuffer();
    icoImages.push({ size, buffer });
  }

  const icoPath = join(root, "src/app/favicon.ico");
  await writeFile(icoPath, encodeIco(icoImages));
  console.log(`wrote src/app/favicon.ico (16/32/48)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
