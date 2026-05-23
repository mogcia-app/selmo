import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/features/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#f5bd07",
          foreground: "#171717",
          soft: "#fff6d1",
          deep: "#9f7900",
        },
        ink: "#171717",
        surface: "#fffdf6",
        muted: "#6b7280",
        border: "#ece7d6",
      },
      boxShadow: {
        panel: "0 12px 32px rgba(23, 23, 23, 0.08)",
      },
      backgroundImage: {
        hero: "radial-gradient(circle at top left, rgba(245, 189, 7, 0.24), transparent 30%), linear-gradient(135deg, #fffef7 0%, #fff8db 100%)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
