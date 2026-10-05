# App releases

Built Android APKs are placed here as `NobleEnclave-v<version>.apk`. They are not
committed (too large); the same file is published to Cloudflare R2 and served at
`/app` and `/api/app/download`.

Install on an Android phone: copy the APK to the phone (or open
https://nobleenclave.com/app on it), tap the file, allow "install unknown apps"
when asked. Phones with an older version update in place: every release is
signed with the same key.

## iPhone (local, not published)

iOS apps can only be compiled with Apple's Xcode, which runs only on macOS.
On any Mac with Xcode:

```bash
cd mobile
./scripts/build-ios-local.sh simulator   # runs in the iOS Simulator, no Apple account
./scripts/build-ios-local.sh device      # installs on your USB-connected iPhone
```

`device` signs with a free Apple ID (Xcode > Settings > Accounts > add Apple ID).
Free signing works only on your own registered iPhones, must be re-installed
every 7 days, and cannot include push notifications or universal links, so the
script switches those off for that build (`IOS_FREE_SIGNING=1`). With a paid
Apple Developer account, run `PAID_APPLE_ACCOUNT=1 ./scripts/build-ios-local.sh device`
to keep them. Nothing is uploaded to Apple or Expo in either mode.
