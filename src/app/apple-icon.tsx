import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { WordmarkIcon } from "./lib/iconMark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const fontData = await readFile(
    join(process.cwd(), "src/app/fonts/Outfit-ExtraBold.ttf")
  );

  return new ImageResponse(<WordmarkIcon size={size.width} />, {
    ...size,
    fonts: [
      {
        name: "Outfit",
        data: fontData,
        weight: 800,
        style: "normal",
      },
    ],
  });
}
