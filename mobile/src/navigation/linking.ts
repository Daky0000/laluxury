import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/**
 * Deep links. Website product and tracking links open the matching app screen
 * (Android App Links via /.well-known/assetlinks.json), and the
 * nobleenclave:// scheme works from SMS, push and Paystack redirects.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [
    Linking.createURL("/"),
    "nobleenclave://",
    "https://nobleenclave.com",
    "https://www.nobleenclave.com",
  ],
  config: {
    screens: {
      Storefront: {
        screens: {
          HOME: "",
          SHOP: "shop",
          BAG: "bag",
          ACCOUNT: "account",
        },
      },
      ProductDetail: "product/:id",
      Wishlist: "wishlist",
      OrderTracking: "orders/track",
    },
  },
};
