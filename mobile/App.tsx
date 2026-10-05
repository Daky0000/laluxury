import React, { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from "@tanstack/react-query";
import NetInfo from "@react-native-community/netinfo";

import { api } from "./src/services/api";
import { AppProvider, useApp } from "./src/state/AppContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { linking } from "./src/navigation/linking";
import type { RootStackParamList } from "./src/navigation/types";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { SplashScreen } from "./src/components/SplashScreen";
import { OrderConfirmationModal } from "./src/components/OrderConfirmationModal";
import { PopNotification } from "./src/components/PopNotification";
import { AppUpdateModal, AppUpdateInfo } from "./src/components/AppUpdateModal";
import { isNewerVersion } from "./src/utils/version";
import { initTelemetry, Sentry } from "./src/lib/telemetry";
import { setupNotificationChannel, type PushPayload } from "./src/lib/push";
import { applyOtaUpdate, fetchOtaUpdate } from "./src/lib/updates";
import { flushEvents, track } from "./src/lib/analytics";
import appJson from "./app.json";

initTelemetry();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// React Query follows the phone's connectivity and app focus.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(state.isConnected !== false)),
);
AppState.addEventListener("change", (status) => focusManager.setFocused(status === "active"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 } },
});

const navigationRef = createNavigationContainerRef<RootStackParamList>();
const CURRENT_APP_VERSION = appJson.expo.version;
const DISMISSED_UPDATE_KEY = "@nobleenclave_dismissed_update_v";

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <AppProvider>
            <Shell />
          </AppProvider>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(App);

/** Opens the screen a push notification is about. */
function openFromPush(data: PushPayload | undefined) {
  if (!data || !navigationRef.isReady()) return;
  if (data.type === "order" && typeof data.orderNumber === "string") {
    navigationRef.navigate("OrderTracking", { order: data.orderNumber });
  } else if (data.type === "staff_order") {
    navigationRef.navigate("Backend", { screen: "ORDERS" });
  }
}

function Shell() {
  const { ready, notification, dismissNotification, confirmedOrder, setConfirmedOrder } = useApp();
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [otaReady, setOtaReady] = useState(false);
  const pendingPush = useRef<PushPayload | undefined>(undefined);

  // Notification channel, taps on pushes, analytics flush on background.
  useEffect(() => {
    setupNotificationChannel().catch(() => {});
    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushPayload | undefined;
      if (navigationRef.isReady()) openFromPush(data);
      else pendingPush.current = data;
    });
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) pendingPush.current = response.notification.request.content.data as PushPayload;
      })
      .catch(() => {});
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "background") flushEvents().catch(() => {});
      if (state === "active") fetchOtaUpdate().then(setOtaReady).catch(() => {});
    });
    return () => {
      tapSub.remove();
      appSub.remove();
    };
  }, []);

  // OTA update first (silent JS fixes); fall back to the APK prompt for native releases.
  useEffect(() => {
    fetchOtaUpdate().then(setOtaReady).catch(() => {});
    (async () => {
      try {
        const info = await api.checkAppVersion();
        if (!info?.latestVersion) return;
        setUpdateInfo(info);
        if (!isNewerVersion(CURRENT_APP_VERSION, info.latestVersion)) return;
        const dismissed = await AsyncStorage.getItem(DISMISSED_UPDATE_KEY);
        if (dismissed !== info.latestVersion) setShowUpdateModal(true);
      } catch {
        // Offline: try again next launch.
      }
    })();
  }, []);

  const dismissUpdate = async () => {
    setShowUpdateModal(false);
    if (updateInfo) await AsyncStorage.setItem(DISMISSED_UPDATE_KEY, updateInfo.latestVersion).catch(() => {});
  };

  if (!ready) return <SplashScreen />;

  return (
    <>
      <NavigationContainer
        ref={navigationRef}
        linking={linking}
        onReady={() => {
          if (pendingPush.current) {
            openFromPush(pendingPush.current);
            pendingPush.current = undefined;
          }
        }}
        onStateChange={() => {
          const route = navigationRef.getCurrentRoute();
          if (route?.name === "ProductDetail") {
            track("product_view", { productId: (route.params as { id?: string } | undefined)?.id ?? null });
          }
        }}
      >
        <RootNavigator />
        <OrderConfirmationModal
          visible={Boolean(confirmedOrder)}
          orderNumber={confirmedOrder?.orderNumber ?? null}
          customerPhone={confirmedOrder?.phone ?? null}
          customerEmail={confirmedOrder?.email ?? null}
          onClose={() => {
            const order = confirmedOrder?.orderNumber;
            setConfirmedOrder(null);
            if (order && navigationRef.isReady()) navigationRef.navigate("OrderTracking", { order });
          }}
        />
      </NavigationContainer>

      <AppUpdateModal
        visible={showUpdateModal}
        updateInfo={updateInfo}
        currentVersion={CURRENT_APP_VERSION}
        onDismiss={dismissUpdate}
      />

      <PopNotification notification={notification} onDismiss={dismissNotification} />

      {otaReady ? (
        <PopNotification
          notification={{
            title: "Update ready",
            message: "A fresh version of the app is ready. Tap to restart.",
            type: "info",
            icon: "refresh-cw",
            duration: 15000,
          }}
          onDismiss={() => setOtaReady(false)}
          onPress={applyOtaUpdate}
        />
      ) : null}
    </>
  );
}
