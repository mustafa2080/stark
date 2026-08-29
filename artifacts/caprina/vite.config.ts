import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// PORT مطلوبة فقط وقت الـ dev server — مش وقت الـ build
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;

// BASE_PATH اختيارية — لو مش موجودة نستخدم "/"
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  publicDir: path.resolve(import.meta.dirname, "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react":  ["react", "react-dom"],
          "vendor-query":  ["@tanstack/react-query"],
          "vendor-charts": ["recharts"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-select",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-toast",
            "@radix-ui/react-popover",
            "@radix-ui/react-tabs",
          ],
          "vendor-icons":  ["lucide-react"],
          "vendor-motion": ["framer-motion"],
          "vendor-router": ["wouter"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    strictPort: false,
    hmr: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
