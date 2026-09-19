import { ImageResponse } from "next/og";
import { YMonogram } from "./lib/iconMark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(<YMonogram size={size.width} />, {
    ...size,
  });
}
