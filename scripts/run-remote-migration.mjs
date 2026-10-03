import { readFileSync } from "fs";
import { spawn } from "child_process";

const code = readFileSync("scripts/migrate-owners-and-categories.mjs", "utf8");

console.log("Connecting via Railway SSH and piping migration script via stdin...");
const child = spawn("railway", ["ssh", "--service", "laluxury", "node"], {
  shell: true,
  stdio: ["pipe", "inherit", "inherit"],
});

child.stdin.write(code);
child.stdin.end();

child.on("close", (exitCode) => {
  console.log(`Railway SSH process completed with exit code ${exitCode}`);
  process.exit(exitCode ?? 0);
});
