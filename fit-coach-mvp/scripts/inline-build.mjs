import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = resolve(root, "index.html");
let html = readFileSync(indexPath, "utf8");

html = html.replace(/<link rel="stylesheet" crossorigin href="(.+?)">/, (_, href) => {
  const css = readFileSync(resolve(root, href), "utf8");
  return `<style>${css}</style>`;
});

html = html.replace(/<script type="module" crossorigin src="(.+?)"><\/script>/, (_, src) => {
  const js = readFileSync(resolve(root, src), "utf8");
  return `<script type="module">${js}</script>`;
});

writeFileSync(indexPath, html);
