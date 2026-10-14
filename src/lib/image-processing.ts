import type SharpModule from "sharp";

type Sharp = typeof SharpModule;

/**
 * The one way server code reaches sharp.
 *
 * Decoding a phone photo takes 35–50 MB of native memory, outside the
 * JavaScript heap, so `--max-old-space-size` does nothing to bound it. On
 * defaults, glibc keeps most of that memory after each image, and the
 * container's RAM (billed by the minute on Railway) climbs with every bulk add
 * session until the next deploy. A local replay of 180 bulk-add photos plus
 * their AI previews left ~730 MB resident on defaults, against ~300 MB with
 * the settings below and `MALLOC_ARENA_MAX=2` (nixpacks.toml).
 *
 * - concurrency(1): one libvips thread per image. sharp only chooses this by
 *   itself when MALLOC_ARENA_MAX is unset; once it is set, sharp would start a
 *   thread for every core the host reports.
 * - cache(false): no libvips operation cache. Nothing here processes the same
 *   image twice, so the cache only keeps decoded pixels around afterwards.
 * - At most two images in flight across the process, whatever the mix of web
 *   uploads, app uploads and AI image preparation running at the time.
 */
export const MAX_IMAGES_IN_FLIGHT = 2;

// On globalThis because Next bundles server code into several chunks, and a
// module-level counter would give each chunk its own two slots.
const g = globalThis as unknown as {
  imageWork?: { sharp: Promise<Sharp> | null; inFlight: number; waiting: (() => void)[] };
};
const state = (g.imageWork ??= { sharp: null, inFlight: 0, waiting: [] });

function loadSharp(): Promise<Sharp> {
  state.sharp ??= import("sharp").then(({ default: sharp }) => {
    sharp.concurrency(1);
    sharp.cache(false);
    return sharp;
  });
  return state.sharp;
}

async function acquire(): Promise<void> {
  if (state.inFlight < MAX_IMAGES_IN_FLIGHT) {
    state.inFlight++;
    return;
  }
  // A finishing job hands its slot straight to the next waiter, so the count
  // never dips below the limit while anyone is queued.
  await new Promise<void>((resolve) => state.waiting.push(resolve));
}

function release(): void {
  const next = state.waiting.shift();
  if (next) next();
  else state.inFlight--;
}

/**
 * Runs image work in one of the process's image slots. Keep network waits
 * (fetching the source, uploading the result) outside the callback so a slow
 * request never holds a slot.
 */
export async function withSharp<T>(work: (sharp: Sharp) => Promise<T>): Promise<T> {
  const sharp = await loadSharp();
  await acquire();
  try {
    return await work(sharp);
  } finally {
    release();
  }
}
