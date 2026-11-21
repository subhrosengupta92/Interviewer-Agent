import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist/assets", { recursive: true });

await build({
  entryPoints: ["web/src/setup.ts", "web/src/interview.ts", "web/src/report.ts"],
  outdir: "dist/assets",
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  target: "es2022",
  logLevel: "info",
});

for (const f of ["index.html", "interview.html", "report.html", "style.css"]) cpSync(`web/${f}`, `dist/${f}`);
cpSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "dist/assets/pdf.worker.min.mjs");
