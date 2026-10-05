import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "../services/api";
import appJson from "../../app.json";

/**
 * Push notification registration.
 *
 * The Expo push token is sent to the backend, which ties it to whoever is
 * signed in. The backend then pushes order updates (customers) and new-order
 * alerts (staff). At sign-out the device is detached so the next person on
 * the phone does not get the previous person's alerts.
 */

const TOKEN_KEY = "lx_push_token";

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("noble_updates", {
    name: "Noble Enclave Updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#7A2E3C",
    sound: "default",
  });
}

/** Asks for permission (once), gets the token and registers it. Safe to call often. */
export async function registerForPush(askPermission: boolean): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    await setupNotificationChannel();

    let { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted" && askPermission) {
      ({ status } = await Notifications.requestPermissionsAsync());
    }
    if (status !== "granted") return null;

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

    await api.registerPushDevice({
      token,
      platform: Platform.OS === "ios" ? "ios" : "android",
      appVersion: appJson.expo.version,
    });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch {
    return null;
  }
}

/** Called before the session is cleared at sign-out. */
export async function detachPushDevice(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) await api.detachPushDevice(token);
  } catch {
    // The server also re-assigns the token at the next sign-in.
  }
}

export type PushPayload =
  | { type: "order"; orderNumber: string }
  | { type: "staff_order"; orderId: string; orderNumber: string }
  | { type: string; [key: string]: unknown };
