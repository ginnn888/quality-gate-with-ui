import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      colors: {
        // Pastel purple / blue / white palette — light, modern SaaS dashboard.
        gate: {
          bg: "#F8F7FD",
          panel: "#FFFFFF",
          border: "#E7E3F6",
          muted: "#6E6B85",
          text: "#211F35",
          accent: "#7C6FEF",
          accentSoft: "#EFECFD",
          blue: "#4F8CF7",
          blueSoft: "#EAF2FE",
          pass: "#16A374",
          fail: "#EF4368",
          warn: "#F2A93C",
          skip: "#9C99AF",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(76, 63, 145, 0.04), 0 8px 24px -8px rgba(76, 63, 145, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
