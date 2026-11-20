import { defineConfig } from "vite";

// GitHub Pages: /on-son-les-bicis/
// Domini propi / public_html arrel: VITE_BASE=/ npm run build
const base = process.env.VITE_BASE || "/on-son-les-bicis/";

export default defineConfig({
  base,
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
