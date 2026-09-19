export const ICON_NAVY = "#1e1f3b";
export const ICON_ACCENT = "#555af5";
export const Y_PATH =
  "M7 7h5.4L16 14.8 19.6 7H25l-6.8 11.6V25h-4.4v-6.4z";

export function wordmarkSizes(size: number) {
  return {
    ynab: Math.round(size * 0.27),
    converter: Math.round(size * 0.108),
    gap: Math.round(size * 0.045),
    letterSpacing: Math.round(size * -0.008 * 10) / 10,
  };
}

export function YMonogram({ size }: { size: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        background: ICON_NAVY,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 32 32">
        <rect width="32" height="32" rx="7" fill={ICON_NAVY} />
        <path fill={ICON_ACCENT} d={Y_PATH} />
      </svg>
    </div>
  );
}

export function WordmarkIcon({ size }: { size: number }) {
  const { ynab, converter, gap, letterSpacing } = wordmarkSizes(size);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: ICON_NAVY,
        fontFamily: "Outfit",
        fontWeight: 800,
      }}
    >
      <div
        style={{
          color: ICON_ACCENT,
          fontSize: ynab,
          lineHeight: 1,
          letterSpacing,
        }}
      >
        YNAB
      </div>
      <div
        style={{
          color: "#ffffff",
          fontSize: converter,
          lineHeight: 1,
          letterSpacing,
          marginTop: gap,
        }}
      >
        CONVERTER
      </div>
    </div>
  );
}
