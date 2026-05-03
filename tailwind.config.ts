import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        geek: {
          lime: "#b6ff3b",
          green: "#68e534",
          black: "#050608",
          panel: "#101318",
          line: "#262b33"
        }
      },
      boxShadow: {
        glow: "0 0 42px rgba(182, 255, 59, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
