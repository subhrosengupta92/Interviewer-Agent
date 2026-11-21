// Builds the browser bundles, then one server file (dist/_worker.js) with the pages embedded.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

for (const dir of ["dist", ".build"]) rmSync(dir, { recursive: true, force: true });
mkdirSync(".build/site/assets", { recursive: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: ["web/src/setup.ts", "web/src/interview.ts", "web/src/report.ts"],
  outdir: ".build/site/assets",
  bundle: true,
  format: "esm",
  splitting: true,
  minify: true,
  target: "es2022",
  logLevel: "warning",
});
for (const f of ["index.html", "interview.html", "report.html", "style.css"]) cpSync(`web/${f}`, `.build/site/${f}`);
cpSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", ".build/site/assets/pdf.worker.min.mjs");

const assets = {};
const walk = (dir, prefix) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) walk(`${dir}/${e.name}`, `${prefix}/${e.name}`);
    else assets[`${prefix}/${e.name}`] = readFileSync(`${dir}/${e.name}`, "utf8");
  }
};
walk(".build/site", "");
writeFileSync(".build/assets.generated.js", `export const ASSETS = ${JSON.stringify(assets)};\n`);

await build({
  entryPoints: ["src/server/worker.ts"],
  outfile: "dist/_worker.js",
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2022",
  conditions: ["worker", "browser"],
  logLevel: "warning",
});
console.log("Built", Object.keys(assets).length, "site files into dist/_worker.js");
