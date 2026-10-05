import * as Updates from "expo-updates";

/**
 * Over-the-air updates (EAS Update). JavaScript fixes reach installed apps
 * without a new APK; only native changes (new modules, permissions, icons)
 * still need a store/APK release.
 *
 * Returns true when a new update has been downloaded and is ready to apply.
 */
export async function fetchOtaUpdate(): Promise<boolean> {
  if (__DEV__ || !Updates.isEnabled) return false;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return false;
    const result = await Updates.fetchUpdateAsync();
    return result.isNew;
  } catch {
    return false;
  }
}

export async function applyOtaUpdate(): Promise<void> {
  try {
    await Updates.reloadAsync();
  } catch {
    // Applied on next cold start instead.
  }
}
