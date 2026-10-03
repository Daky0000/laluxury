import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const root = process.cwd();

const targets = [
  "src",
  "mobile/src",
  "mobile/App.tsx",
  "mobile/app.json",
  "mobile/README.md",
  "prisma/seed.ts",
  "prisma/schema.prisma",
  "scripts/verify-sync.ts",
  "docs/SYNC_REGISTRY.md",
  "docs/RAILWAY_EGRESS_IMPLEMENTATION.md",
  "checklist.html",
  "LALUXURY_APP_API.md",
  ".env.example",
];

const replacements = [
  [/NOBEL ENCLAVE/g, "NOBLE ENCLAVE"],
  [/Nobel Enclave/g, "Noble Enclave"],
  [/nobel-enclave/g, "noble-enclave"],
  [/NobelEnclave/g, "NobleEnclave"],
  [/nobel_enclave/g, "noble_enclave"],
  [/laluxury:bag-open/g, "nobleenclave:bag-open"],
  [/laluxury:cart-changed/g, "nobleenclave:cart-changed"],
  [/laluxury:cart-count/g, "nobleenclave:cart-count"],
  [/laluxury_frontend_hide_nav/g, "nobleenclave_frontend_hide_nav"],
  [/laluxury:frontend-nav-change/g, "nobleenclave:frontend-nav-change"],
  [/laluxury_admin_collapsed_groups/g, "nobleenclave_admin_collapsed_groups"],
  [/laluxury:collapsed-groups-change/g, "nobleenclave:collapsed-groups-change"],
  [/laluxury_admin_hide_nav/g, "nobleenclave_admin_hide_nav"],
  [/laluxury_admin_beginner_mode/g, "nobleenclave_admin_beginner_mode"],
  [/laluxury:admin-nav-change/g, "nobleenclave:admin-nav-change"],
  [/@laluxury_dismissed_update_v/g, "@nobleenclave_dismissed_update_v"],
  [/folder: `laluxury\/\${options\.folder}`/g, "folder: `nobleenclave/${options.folder}`"],
  [/application_name: "laluxury"/g, 'application_name: "nobleenclave"'],
  [/application_name: "laluxury-pg"/g, 'application_name: "nobleenclave-pg"'],
];

let updatedCount = 0;

function processFile(filePath) {
  let content = readFileSync(filePath, "utf8");
  let changed = false;
  for (const [regex, rep] of replacements) {
    if (regex.test(content)) {
      content = content.replace(regex, rep);
      changed = true;
    }
  }
  if (changed) {
    writeFileSync(filePath, content, "utf8");
    console.log("Updated:", filePath);
    updatedCount++;
  }
}

function walkDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        walkDir(fullPath);
      }
    } else if (/\.(ts|tsx|js|jsx|json|prisma|md|css)$/.test(entry.name)) {
      processFile(fullPath);
    }
  }
}

for (const target of targets) {
  const p = resolve(root, target);
  if (existsSync(p)) {
    if (statSync(p).isDirectory()) {
      walkDir(p);
    } else {
      processFile(p);
    }
  }
}

console.log(`Rebranding complete! ${updatedCount} files updated.`);
