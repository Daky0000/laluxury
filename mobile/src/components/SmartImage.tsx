import React from "react";
import { Image, type ImageProps } from "expo-image";
import { api } from "../services/api";
import { resolveImageUrl } from "../utils/image";

/**
 * Every product photo goes through here: expo-image caches to memory and disk,
 * so a photo seen once loads instantly afterwards, and fades in gently.
 */
type Props = Omit<ImageProps, "source"> & {
  uri?: string | null;
  /** Accessibility description; product title is a good default. */
  alt?: string;
};

const BLURHASH_PAPER = "L5PZfSi_.AyE_3t7t7R**0o#DgR4";

export function SmartImage({ uri, alt, contentFit = "cover", transition = 200, ...rest }: Props) {
  const resolved = resolveImageUrl(uri, api.getBaseUrl());
  return (
    <Image
      source={resolved ? { uri: resolved } : undefined}
      placeholder={{ blurhash: BLURHASH_PAPER }}
      contentFit={contentFit}
      transition={transition}
      cachePolicy="memory-disk"
      accessibilityLabel={alt}
      accessible={Boolean(alt)}
      {...rest}
    />
  );
}
