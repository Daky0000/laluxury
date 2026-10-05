import net from "net";

let isDbReachable: boolean | null = null;
let lastCheck = 0;
let inFlightProbe: Promise<boolean> | null = null;
const CHECK_INTERVAL_MS = 15_000;

function parseHostAndPort(urlStr: string): { host: string; port: number } {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname === "localhost" ? "127.0.0.1" : parsed.hostname;
    const port = parseInt(parsed.port, 10) || 5432;
    return { host, port };
  } catch {
    return { host: "127.0.0.1", port: 5432 };
  }
}

function probeTcp(host: string, port: number, timeoutMs = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = net.createConnection({ host, port });
    socket.setTimeout(timeoutMs);

    const finish = (ok: boolean) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(ok);
      }
    };

    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
  });
}

export async function checkDbConnection(): Promise<boolean> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    isDbReachable = false;
    return false;
  }

  const now = Date.now();
  if (isDbReachable !== null && now - lastCheck < CHECK_INTERVAL_MS) {
    return isDbReachable;
  }

  if (inFlightProbe) {
    return inFlightProbe;
  }

  const { host, port } = parseHostAndPort(dbUrl);

  inFlightProbe = probeTcp(host, port, 3000)
    .then((ok) => {
      isDbReachable = ok;
      lastCheck = Date.now();
      inFlightProbe = null;
      return ok;
    })
    .catch(() => {
      // Do not hard-block queries if probe had an isolated error
      isDbReachable = true;
      lastCheck = Date.now();
      inFlightProbe = null;
      return true;
    });

  return inFlightProbe;
}

/** True while the most recent TCP probe found the database unreachable. */
export function isDbTemporarilyDown(): boolean {
  return isDbReachable === false && Date.now() - lastCheck < CHECK_INTERVAL_MS;
}

/**
 * A query failed. One failed query is not proof the database is down (it may
 * be a timeout or a bad query), so this only forces the next caller to probe
 * again instead of trusting the last result.
 */
export function recordDbFailure(): void {
  lastCheck = 0;
  checkDbConnection().catch(() => {});
}

export function recordDbSuccess(): void {
  isDbReachable = true;
  lastCheck = Date.now();
}

// Initial probe
checkDbConnection().catch(() => {});

