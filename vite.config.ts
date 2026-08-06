import { defineConfig } from 'vite';

// Relative Basis -> das Build-Ergebnis läuft aus jedem Unterverzeichnis
// (GitHub Pages, Netlify, Vercel, file://-nahe Auslieferung).
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: true,
    // Three.js ist als ein Bundle gewollt; die Warnschwelle passt dazu.
    chunkSizeWarningLimit: 900,
  },
});
