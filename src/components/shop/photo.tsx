import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Every storefront photograph goes through here.
 *
 * The catalogue is full-bleed shots of 150–250 KB apiece, and the shop shows
 * them at everything from a 40px basket thumbnail to a full-width hero. Served
 * raw that is megabytes a page, which on a phone is the difference between a
 * page that answers a tap and one that is still downloading pictures. Handing
 * them to the image optimiser instead means each one arrives at the size it is
 * actually drawn at, in a modern format, and off-screen ones wait their turn.
 *
 * `sizes` is required rather than optional on purpose: without it the browser
 * assumes the image is the width of the viewport and fetches the largest file
 * on offer, which is the whole problem again.
 */

/** True for anything the optimiser can fetch: our own paths, and https URLs. */
function canOptimize(src: string): boolean {
  return src.startsWith("/") || src.startsWith("https://");
}

/**
 * A photograph that fills its container. The container must be positioned —
 * every call site already is, being a `relative` box with an aspect ratio.
 */
export function Photo({
  src,
  alt = "",
  sizes,
  priority = false,
  className,
}: {
  src: string;
  alt?: string;
  /** What the picture measures at each breakpoint, e.g. "(min-width:1024px) 25vw, 50vw". */
  sizes: string;
  /** Only for what is above the fold on arrival — one image per page at most. */
  priority?: boolean;
  className?: string;
}) {
  if (!canOptimize(src)) {
    return (
      // A pasted http:// address or a data URI still shows, just unprocessed.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        className={cn("absolute inset-0 h-full w-full", className)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      priority={priority}
      className={cn("object-cover", className)}
    />
  );
}

/**
 * A photograph at a fixed size — basket lines, search hits, order summaries.
 * These sit in spans of a known width, so they need no positioned parent.
 */
export function Thumb({
  src,
  alt = "",
  width,
  height,
  className,
}: {
  src: string;
  alt?: string;
  width: number;
  height: number;
  className?: string;
}) {
  if (!canOptimize(src)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} loading="lazy" className={cn("h-full w-full", className)} />;
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      className={cn("h-full w-full object-cover", className)}
    />
  );
}
