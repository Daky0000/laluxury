import type { NavigatorScreenParams } from "@react-navigation/native";

export type StorefrontTabParamList = {
  HOME: undefined;
  SHOP: { filter?: string } | undefined;
  BAG: undefined;
  ACCOUNT: undefined;
};

export type BackendTabParamList = {
  DASHBOARD: undefined;
  ORDERS: undefined;
  PRODUCTS: undefined;
  ADD: undefined;
  SETTINGS: undefined;
};

export type RootStackParamList = {
  Storefront: NavigatorScreenParams<StorefrontTabParamList> | undefined;
  Backend: NavigatorScreenParams<BackendTabParamList> | undefined;
  /** `id` is a product id or slug (deep links use the slug). */
  ProductDetail: { id: string };
  BackendProduct: { id: string };
  StoreDesign: undefined;
  DeliverySettings: undefined;
  BulkAdd: undefined;
  Wishlist: undefined;
  OrderTracking: { order: string; t?: string; email?: string };
};

declare global {
  namespace ReactNavigation {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
