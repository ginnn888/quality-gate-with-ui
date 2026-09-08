import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        // Vibrant, minimal SaaS palette — purple-led, with blue + emerald
        // accents on a near-white ground and near-black text.
        gate: {
          bg: "#F7F5FF",
          panel: "#FFFFFF",
          border: "#E6E1F8",
          muted: "#6B6785",
          text: "#171528",
          accent: "#7C3AED",
          accentSoft: "#EDE7FE",
          blue: "#2563EB",
          blueSoft: "#E4EDFF",
          green: "#10B981",
          greenSoft: "#D6F7EA",
          pass: "#10B981",
          fail: "#F43F5E",
          warn: "#F59E0B",
          skip: "#94A1B2",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(76, 40, 145, 0.05), 0 10px 30px -12px rgba(76, 40, 145, 0.18)",
        glow: "0 8px 30px -8px rgba(124, 58, 237, 0.45)",
      },
    },
  },
  plugins: [],
};

export default config;
