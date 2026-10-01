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

function probeTcp(host: string, port: number, timeoutMs = 250): Promise<boolean> {
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
  const now = Date.now();
  if (isDbReachable !== null && now - lastCheck < CHECK_INTERVAL_MS) {
    return isDbReachable;
  }

  if (inFlightProbe) {
    return inFlightProbe;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    isDbReachable = false;
    return false;
  }

  const { host, port } = parseHostAndPort(dbUrl);

  inFlightProbe = probeTcp(host, port, 250)
    .then((ok) => {
      isDbReachable = ok;
      lastCheck = Date.now();
      inFlightProbe = null;
      return ok;
    })
    .catch(() => {
      isDbReachable = false;
      lastCheck = Date.now();
      inFlightProbe = null;
      return false;
    });

  return inFlightProbe;
}

export function isDbTemporarilyDown(): boolean {
  if (isDbReachable === false && Date.now() - lastCheck < CHECK_INTERVAL_MS) {
    return true;
  }
  return false;
}

export function recordDbFailure(): void {
  isDbReachable = false;
  lastCheck = Date.now();
}

export function recordDbSuccess(): void {
  isDbReachable = true;
  lastCheck = Date.now();
}

// Initial probe
checkDbConnection().catch(() => {});
