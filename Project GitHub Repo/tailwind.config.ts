import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /** Deep green sidebar / dark surfaces. */
        bark: {
          DEFAULT: "#0d2620",
          50: "#f2f7f5",
          700: "#123329",
          800: "#0f2b23",
          900: "#0b1f1a",
        },
        /** Brand accent — buttons, active nav, positive figures. */
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
        },
        /** Page background — very slightly green-tinted grey. */
        canvas: "#f6f8f7",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(16 24 40 / 0.04), 0 1px 3px 0 rgb(16 24 40 / 0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
