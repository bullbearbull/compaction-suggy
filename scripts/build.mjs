import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const pluginDistDir = path.join(rootDir, "plugins", "compaction-suggy", "dist");
const modDistDir = path.join(rootDir, "plugins", "compaction-suggy-mod", "dist");
const cliDistDir = path.join(rootDir, "packages", "cli-hook", "dist");
const extDir = path.join(rootDir, "packages", "browser-extension");
const extPublicDir = path.join(extDir, "public");
const extDistDir = path.join(extDir, "dist");

fs.mkdirSync(pluginDistDir, { recursive: true });
fs.mkdirSync(modDistDir, { recursive: true });
fs.mkdirSync(cliDistDir, { recursive: true });
fs.mkdirSync(extDistDir, { recursive: true });

const sharedNodeOptions = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: false,
  minify: false,
  legalComments: "none",
};

// 1. Universal Claude Code & OpenAI Codex Hook + CLI bundles
await build({
  ...sharedNodeOptions,
  entryPoints: [path.join(rootDir, "packages", "cli-hook", "src", "hook.ts")],
  outfile: path.join(pluginDistDir, "hook.mjs"),
});

await build({
  ...sharedNodeOptions,
  entryPoints: [path.join(rootDir, "packages", "cli-hook", "src", "cli.ts")],
  outfile: path.join(pluginDistDir, "cli.mjs"),
});

fs.copyFileSync(
  path.join(pluginDistDir, "hook.mjs"),
  path.join(cliDistDir, "hook.mjs"),
);
fs.copyFileSync(
  path.join(pluginDistDir, "cli.mjs"),
  path.join(cliDistDir, "cli.mjs"),
);

for (const file of [
  path.join(pluginDistDir, "hook.mjs"),
  path.join(pluginDistDir, "cli.mjs"),
  path.join(cliDistDir, "hook.mjs"),
  path.join(cliDistDir, "cli.mjs"),
]) {
  fs.chmodSync(file, 0o755);
}

// 2. In-process Claude Code Mod bundle (Mods API 2.1.287+ — forbids node:* imports)
await build({
  bundle: true,
  platform: "neutral",
  format: "esm",
  target: "es2022",
  sourcemap: false,
  minify: false,
  legalComments: "none",
  entryPoints: [path.join(rootDir, "packages", "claude-mod", "src", "register.ts")],
  outfile: path.join(modDistDir, "register.mjs"),
});

// 3. Unified Browser Extension bundles (ChatGPT Web + Claude.ai Web)
const sharedBrowserOptions = {
  bundle: true,
  platform: "browser",
  target: "chrome116",
  sourcemap: false,
  minify: false,
  legalComments: "none",
};

await build({
  ...sharedBrowserOptions,
  format: "esm",
  entryPoints: [path.join(extDir, "src", "background.ts")],
  outfile: path.join(extDistDir, "background.js"),
});

await build({
  ...sharedBrowserOptions,
  format: "iife",
  entryPoints: [path.join(extDir, "src", "content.ts")],
  outfile: path.join(extDistDir, "content.js"),
});

await build({
  ...sharedBrowserOptions,
  format: "iife",
  entryPoints: [path.join(extDir, "src", "popup.ts")],
  outfile: path.join(extDistDir, "popup.js"),
});

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(extPublicDir, extDistDir);

console.log(`Built universal hook plugin bundles in ${path.relative(rootDir, pluginDistDir)}`);
console.log(`Built Claude Code Mod bundle in ${path.relative(rootDir, modDistDir)}`);
console.log(`Built unified Browser Extension (ChatGPT & Claude.ai) in ${path.relative(rootDir, extDistDir)}`);
