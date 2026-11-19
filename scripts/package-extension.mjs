import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const extDistDir = path.join(rootDir, "packages", "browser-extension", "dist");
const releaseDir = path.join(rootDir, "release");

const manifest = JSON.parse(
  fs.readFileSync(path.join(extDistDir, "manifest.json"), "utf8"),
);
const version = manifest.version || "0.1.0";

fs.mkdirSync(releaseDir, { recursive: true });
const zipName = `compaction-suggy-extension-v${version}.zip`;
const zipPath = path.join(releaseDir, zipName);
if (fs.existsSync(zipPath)) {
  fs.rmSync(zipPath);
}

execFileSync("zip", ["-rq", zipPath, "."], { cwd: extDistDir });

const stat = fs.statSync(zipPath);
console.log(
  `Packaged Browser Extension zip: ${path.relative(rootDir, zipPath)} (${(stat.size / 1024).toFixed(1)} KB)`,
);
