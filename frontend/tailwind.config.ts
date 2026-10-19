import type { Config } from "tailwindcss";

const scale = (name: string) =>
  Object.fromEntries(
    [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]),
  );

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: scale("primary"),
        secondary: scale("secondary"),
        neutral: scale("neutral"),
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        "surface-2": "rgb(var(--surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--surface-3) / <alpha-value>)",
        line: "rgb(var(--line) / var(--line-a))",
        fg: "rgb(var(--fg) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        dim: "rgb(var(--dim) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        danger: "rgb(var(--danger) / <alpha-value>)",
        warning: "rgb(var(--warning) / <alpha-value>)",
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', "system-ui", "Segoe UI", "sans-serif"],
        display: ['"Space Grotesk"', '"Plus Jakarta Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "Consolas", "monospace"],
      },
      borderRadius: { sm: "8px", md: "12px", lg: "16px", xl: "24px" },
      boxShadow: {
        1: "0 1px 2px rgb(0 0 0 / .12), 0 1px 3px rgb(0 0 0 / .10)",
        2: "0 8px 24px -6px rgb(0 0 0 / .28)",
        3: "0 24px 56px -12px rgb(0 0 0 / .45)",
        glow: "0 8px 28px -6px rgb(var(--primary-500) / .55)",
      },
      backgroundImage: {
        // Solid color (kept as a utility name so existing classes keep working)
        brand: "linear-gradient(rgb(var(--primary-500)), rgb(var(--primary-500)))",
      },
      keyframes: {
        marquee: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } },
        eq: { "0%,100%": { height: "20%" }, "50%": { height: "100%" } },
        shine: { from: { transform: "translateX(-120%) skewX(-20deg)" }, to: { transform: "translateX(460%) skewX(-20deg)" } },
        stripes: { from: { backgroundPosition: "0 0" }, to: { backgroundPosition: "32px 0" } },
        pop: { "0%": { transform: "scale(1)" }, "40%": { transform: "scale(1.35)" }, "100%": { transform: "scale(1)" } },
        kenburns: { from: { transform: "scale(1)" }, to: { transform: "scale(1.12)" } },
        "page-in": { from: { opacity: "0", transform: "translateX(24px)" }, to: { opacity: "1", transform: "none" } },
        drift: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(6%,-5%,0) scale(1.15)" },
        },
        scan: { from: { transform: "translateY(-10%)" }, to: { transform: "translateY(110%)" } },
        "ring-out": { "0%": { transform: "scale(1)", opacity: ".55" }, "100%": { transform: "scale(1.75)", opacity: "0" } },
        float: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-4px)" } },
        shimmer: { from: { transform: "translateX(-120%)" }, to: { transform: "translateX(320%)" } },
      },
      animation: {
        marquee: "marquee 50s linear infinite",
        eq: "eq 1s ease-in-out infinite",
        shine: "shine 3.2s ease-in-out infinite",
        stripes: "stripes 1s linear infinite",
        pop: "pop .35s ease",
        kenburns: "kenburns 9s ease-out forwards",
        "page-in": "page-in .35s cubic-bezier(.22,1,.36,1) both",
        drift: "drift 18s ease-in-out infinite",
        scan: "scan 6s linear infinite",
        "ring-out": "ring-out 2.6s ease-out infinite",
        float: "float 3.5s ease-in-out infinite",
        shimmer: "shimmer 2.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
