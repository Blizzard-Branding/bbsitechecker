import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: "#2b333e",
        salmon: "#eca392",
        green: "#788e8b",
        blue: "#455763",
        cream: "#f7f3ee",
        "warm-white": "#fdf9f5",
      },
      fontFamily: {
        display: ["var(--font-playfair)", "serif"],
        eyebrow: ["var(--font-bebas)", "sans-serif"],
        body: ["var(--font-dm-sans)", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
