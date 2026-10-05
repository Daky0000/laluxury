#!/usr/bin/env bash
# Local iOS build for Noble Enclave. Nothing is uploaded or published.
#
# Runs on a Mac with Xcode installed (Xcode only exists on macOS).
#
#   ./scripts/build-ios-local.sh simulator   # no Apple account needed
#   ./scripts/build-ios-local.sh device      # your own iPhone, free Apple ID
#
# simulator: builds a Release .app and installs it in the iOS Simulator.
# device:    builds and installs on a USB-connected iPhone, signed with a free
#            Apple ID ("Personal Team"). Apple limits free signing to your own
#            devices and the app must be re-installed every 7 days. A paid
#            Apple Developer account removes the 7-day limit; run with
#            PAID_APPLE_ACCOUNT=1 to keep push notifications and universal links.
set -euo pipefail

MODE="${1:-simulator}"
cd "$(dirname "$0")/.."

if [[ "$(uname)" != "Darwin" ]]; then
  echo "iOS apps can only be built on macOS (Xcode). Run this on a Mac." >&2
  exit 1
fi
command -v xcodebuild >/dev/null || { echo "Install Xcode from the Mac App Store first." >&2; exit 1; }
command -v pod >/dev/null || { echo "Installing CocoaPods..."; sudo gem install cocoapods; }

echo "==> Installing JavaScript dependencies"
npm ci

echo "==> Generating the native iOS project"
# Sentry source-map upload needs a Sentry account; skip it for local builds.
export SENTRY_DISABLE_AUTO_UPLOAD=true
if [[ "$MODE" == "device" && "${PAID_APPLE_ACCOUNT:-0}" != "1" ]]; then
  # Free Apple IDs cannot sign push notifications or universal links.
  export IOS_FREE_SIGNING=1
fi
npx expo prebuild -p ios --clean

case "$MODE" in
  simulator)
    echo "==> Building and launching in the iOS Simulator (Release)"
    npx expo run:ios --configuration Release
    ;;
  device)
    echo "==> Building for a connected iPhone (Release)"
    echo "    First time only: open ios/NobleEnclave.xcworkspace in Xcode,"
    echo "    select the NobleEnclave target > Signing & Capabilities,"
    echo "    tick 'Automatically manage signing' and choose your Apple ID team."
    echo "    On the iPhone: Settings > General > VPN & Device Management > Trust."
    npx expo run:ios --configuration Release --device
    ;;
  *)
    echo "Usage: $0 [simulator|device]" >&2
    exit 1
    ;;
esac
