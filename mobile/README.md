# 📱 Noble Enclave Mobile Management App

A custom React Native & Expo Android/iOS mobile application for managing the **Noble Enclave** store catalog, real-time inventory, pricing, and camera photo uploads.

---

## ✨ Features Built

- **🔐 Staff Authentication**:
  - Secure Bearer JWT token sign-in (email or phone + password).
  - RBAC permission guards (only Managers, Admins, Owners can write).
  - Configurable Store API Server Address (supports local dev, LAN Wi-Fi, or live domain).
- **📋 Live Catalog & Inventory Monitor**:
  - Real-time stock counters with Out-of-Stock and Low-Stock warnings.
  - Search by title, brand, material, or SKU.
  - Filter chips: `ALL`, `ACTIVE`, `DRAFT`, `ARCHIVED`, `OUT OF STOCK`.
  - Pull-to-refresh sync.
- **✏️ Real-Time Product Editor**:
  - Instant price updates in GHS (automatically synced in minor pesewas).
  - Was-price ("compare at") configuration.
  - On-hand stock count editor.
  - Pre-order toggle and lead time settings.
  - Status updates (`ACTIVE`, `DRAFT`, `ARCHIVED`).
- **📸 Camera & Gallery Photo Uploader**:
  - Snap photos of new showroom pieces directly using your phone's camera.
  - Pick images from phone gallery.
  - Automatically compressed and linked to the piece on the website.
- **➕ Fast Piece Creator**:
  - Add new piece with title, price, initial stock, category, and cover photo in seconds.

---

## 🚀 How to Test on Your Android Phone

### Method 1: Instant Test via Expo Go (Fastest, zero wait)

1. On your Android phone, install the free **Expo Go** app from Google Play Store.
2. In your terminal on this computer, navigate to the `mobile` folder:
   ```bash
   cd mobile
   npm run start
   ```
3. A QR code will appear in your terminal.
4. Open the **Expo Go** app on your phone, tap **"Scan QR code"**, and point your phone at the computer screen.
5. The **LaLuxury** app will immediately launch on your phone with full camera access, live syncing, and instant reload!

---

### Method 2: Generate Standalone `.apk` (Installable Android Package)

To build a standalone `.apk` file that can be sent or installed directly without Expo Go:

1. In the `mobile` directory, run:
   ```bash
   npx eas-cli build -p android --profile preview
   ```
2. If it's your first time, log in or create a free Expo account.
3. EAS will build the `.apk` on dedicated Android cloud servers and print a **download link** for the `.apk`.
4. Open the link on your phone (or download and transfer via USB/WhatsApp) to install the `.apk` directly!

---

### 🌐 Connecting Phone to Your Local Next.js Server

When testing locally over your Wi-Fi network:
1. Make sure your phone and PC are connected to the same Wi-Fi.
2. Find your computer's local IP address (`ipconfig` on Windows, e.g. `192.168.1.50`).
3. On the app login screen, tap **"Configure Server Address"** and set it to:
   ```
   http://192.168.1.50:3000
   ```
   *(Or your live deployment URL when deployed to Railway/Vercel).*
