import { spawn } from "child_process";

const checkScript = `
import pg from "pg";
const { Client } = pg;
const c = new Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const users = await c.query('SELECT id, phone, email, "firstName", "lastName", role FROM "User";');
console.log("Current Users in DB:", JSON.stringify(users.rows, null, 2));
const cats = await c.query('SELECT id, slug, name, position, "imageUrl", "isActive" FROM "Category" WHERE "isActive" = true ORDER BY position;');
console.log("Active Categories in DB:", JSON.stringify(cats.rows, null, 2));
await c.end();
`;

const child = spawn("railway", ["ssh", "--service", "laluxury", "node"], {
  shell: true,
  stdio: ["pipe", "inherit", "inherit"],
});

child.stdin.write(checkScript);
child.stdin.end();
