import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  if (mode === "library")
    return {
      build: {
        outDir: "dist-lib",
        copyPublicDir: false,
        lib: {
          entry: "src/index.js",
          formats: ["es"],
          fileName: "hiking",
          cssFileName: "hiking",
        },
        rollupOptions: {
          external: ["react", "react-dom", "react/jsx-runtime"],
        },
      },
    };
  const base = process.env.GAME_BASE ?? "/";
  return {
    base,
    plugins: [
      {
        name: "game-asset-paths",
        apply: "build",
        enforce: "post",
        renderChunk(code) {
          return {
            code: code.replace(
              /(["'`])\/assets\/hiking(?=[/"'`])/g,
              "$1" + base + "assets/hiking",
            ),
            map: null,
          };
        },
        generateBundle() {
          this.emitFile({ type: "asset", fileName: ".nojekyll", source: "" });
        },
      },
    ],
  };
});
