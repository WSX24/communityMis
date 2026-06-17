import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "frontend",
  publicDir: "public",
  plugins: [react()],
  test: {
    globals: true,
    include: [
      "../tests/unit/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "../tests/component/**/*.{test,spec}.?(c|m)[jt]s?(x)"
    ]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/[name].[hash].js",
        chunkFileNames: "assets/[name].[hash].js",
        assetFileNames: "assets/[name].[hash][extname]"
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  define: {
    "import.meta.env.VITE_BUILD_VERSION": JSON.stringify(process.env.BUILD_VERSION ?? "dev")
  }
});
