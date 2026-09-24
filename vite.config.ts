import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

/**
 * sourceFixer — PostCSS plugin that runs after Tailwind in the pipeline.
 *
 * Root cause of the warning
 * ─────────────────────────
 * Tailwind CSS v3 calls postcss.parse() internally (when expanding @tailwind
 * base / components / utilities) without passing the `from` option.  The CSS
 * nodes it inserts therefore have no `source.input.file` set.  Vite's own
 * `vite-url-rewrite` PostCSS plugin (vite/dist/node/chunks/config.js:30294)
 * walks every CSS declaration and reads `declaration.source?.input.file`; for
 * nodes that are missing it, it fires:
 *   "A PostCSS plugin did not pass the `from` option to `postcss.parse`."
 *
 * Fix
 * ───
 * After Tailwind has finished expanding its directives, propagate the root's
 * own source reference down to every child node that is still missing one.
 * Vite can then resolve asset paths correctly and the warning is eliminated
 * at its actual origin rather than being merely suppressed.
 *
 * Placement: configured in vite.config.ts (css.postcss) so that Vite uses
 * this inline config and skips postcss.config.js entirely.  Inline plugin
 * objects are fully supported here; they are NOT supported in postcss.config.js
 * array format because Vite's external config loader requires callable
 * functions and throws "plugin is not a function" for plain objects.
 */
const sourceFixer = {
  postcssPlugin: "postcss-source-fixer",
  Once(root: { source?: unknown; walk: (cb: (node: { source?: unknown }) => void) => void }) {
    if (!root.source) return;
    const fallback = root.source;
    root.walk((node) => {
      if (!node.source) node.source = fallback;
    });
  },
};

export default defineConfig(async () => {
  const plugins = [react()];

  // Only loads Replit plugins when running inside Replit dev environment
  if (process.env.NODE_ENV !== "production" && process.env.REPL_ID) {
    const runtimeErrorOverlay = (
      await import("@replit/vite-plugin-runtime-error-modal")
    ).default;
    const { cartographer } = await import("@replit/vite-plugin-cartographer");
    const { devBanner } = await import("@replit/vite-plugin-dev-banner");

    plugins.push(runtimeErrorOverlay());
    plugins.push(cartographer());
    plugins.push(devBanner());
  }

  return {
    plugins,

    css: {
      postcss: {
        plugins: [
          tailwindcss as Parameters<typeof import("postcss").default>[0],
          autoprefixer as Parameters<typeof import("postcss").default>[0],
          sourceFixer as unknown as Parameters<typeof import("postcss").default>[0],
        ],
      },
    },

    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "shared"),
        "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      },
    },

    root: path.resolve(import.meta.dirname, "client"),

    optimizeDeps: {
      include: ["react", "react-dom", "recharts"],
    },

    build: {
      target: "es2020",
      minify: "esbuild",
      outDir: path.resolve(import.meta.dirname, "dist/public"),
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 1500,

      rollupOptions: {
        output: {
          manualChunks: {
            "react-vendor": ["react", "react-dom"],
            ui: [
              "@radix-ui/react-dialog",
              "@radix-ui/react-select",
              "@radix-ui/react-popover",
              "@radix-ui/react-tabs",
              "@radix-ui/react-dropdown-menu",
              "@radix-ui/react-tooltip",
              "@radix-ui/react-toast",
              "@radix-ui/react-checkbox",
              "@radix-ui/react-label",
              "@radix-ui/react-slot",
              "@radix-ui/react-switch",
              "@radix-ui/react-scroll-area",
              "@radix-ui/react-separator",
              "@radix-ui/react-avatar",
              "@radix-ui/react-accordion",
              "@radix-ui/react-progress",
            ],
            charts: ["recharts"],
            "query-vendor": ["@tanstack/react-query", "@tanstack/query-core"],
            "form-vendor": ["react-hook-form", "@hookform/resolvers"],
            "date-vendor": ["date-fns", "date-fns-tz"],
            "icons-vendor": ["lucide-react"],
            "router-vendor": ["wouter"],
            "face-api-vendor": ["face-api.js"],
          },
        },
      },
    },

    server: {
      fs: {
        strict: true,
        deny: ["**/.*"],
      },
    },
  };
});
