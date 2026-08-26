import { spawn } from "node:child_process";

/**
 * Seeds the catalog from the *serving* process, on request.
 *
 * This exists because `postgres.railway.internal` does not resolve to the same
 * server throughout a container's life: a connection opened during the release
 * phase (migrations, start-up scripts) reaches a different Postgres than one
 * opened once the server is answering requests. A seed run at boot therefore
 * writes to a database the storefront never reads.
 *
 * Running it from here — after the server is up, over the same DNS the app
 * itself resolved — puts the rows where the storefront will look for them.
 *
 * Inert unless SEED_TOKEN is set on the service, and the caller must present
 * it. Delete the variable once the catalog is in place.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const expected = process.env.SEED_TOKEN;

  // No token configured means the endpoint does not exist at all.
  if (!expected) return new Response("Not found", { status: 404 });

  if (request.headers.get("x-seed-token") !== expected) {
    return new Response("Forbidden", { status: 403 });
  }

  const output: string[] = [];

  const code = await new Promise<number>((resolve) => {
    const child = spawn("npm", ["run", "db:seed"], {
      shell: process.platform === "win32",
    });
    child.stdout.on("data", (chunk) => output.push(String(chunk)));
    child.stderr.on("data", (chunk) => output.push(String(chunk)));
    child.on("error", (error) => {
      output.push(`spawn failed: ${error.message}`);
      resolve(-1);
    });
    child.on("close", (value) => resolve(value ?? -1));
  });

  return Response.json({ ok: code === 0, code, output: output.join("") });
}
