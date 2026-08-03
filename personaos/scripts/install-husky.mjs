import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoDir = dirname(dirname(fileURLToPath(import.meta.url)));
let current = repoDir;

while (!existsSync(join(current, ".git"))) {
  const parent = dirname(current);
  if (parent === current) {
    process.exit(0);
  }
  current = parent;
}

const hooksPath = relative(current, join(repoDir, ".husky"));

try {
  execFileSync("git", ["config", "core.hooksPath", hooksPath], {
    cwd: current,
    stdio: "ignore"
  });
} catch {
  process.exit(0);
}
