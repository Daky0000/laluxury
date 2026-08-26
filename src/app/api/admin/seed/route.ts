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

/**
 * Read through a variable key. `process.env.SEED_TOKEN` written literally is
 * replaced at build time, so a variable added after the image was built would
 * compile to undefined — the whole reason this is indirected. `src/lib/env.ts`
 * does the same thing for the same reason.
 */
function readEnv(name: string): string | undefined {
  return process.env[name];
}

export async function POST(request: Request) {
  const expected = readEnv("SEED_TOKEN");

  // No token configured means the endpoint does not exist at all. The key
  // names are reported so a variable that is set on the service but missing
  // from the container can be told apart from one that was never set; values
  // are never included.
  if (!expected) {
    return Response.json(
      {
        error: "SEED_TOKEN is not set in this container",
        visibleKeys: Object.keys(process.env)
          .filter((key) => /^(SEED|PROBE|HEALTH|NEXT_PUBLIC|AUTH|DATABASE)/.test(key))
          .sort(),
      },
      { status: 404 },
    );
  }

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
