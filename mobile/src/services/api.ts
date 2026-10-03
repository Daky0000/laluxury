import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import {
  Product,
  ProductDetail,
  Category,
  Collection,
  User,
  Order,
  DashboardData,
  CartItem,
  ShippingAddress,
  ShippingRate,
  AppConfig,
  ServerCart,
} from "../types";


// Default to live store URL, with support for local LAN and emulator endpoints
const DEFAULT_URL = (process.env.EXPO_PUBLIC_API_URL || "https://nobleenclave.com").replace(/\/+$/, "");

const STORAGE_KEY_TOKEN = "lx_token";
const STORAGE_KEY_USER = "lx_user";
const STORAGE_KEY_URL = "lx_api_url";
const STORAGE_KEY_CART = "lx_cart";

class ApiService {
  private publicCache = new Map<string, { expiresAt: number; data: unknown }>();
  private token: string | null = null;
  private baseUrl: string = DEFAULT_URL;

  async init(): Promise<{ token: string | null; user: User | null; baseUrl: string }> {
    try {
      const [secureToken, legacyToken, savedUser, savedUrl] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEY_TOKEN),
        AsyncStorage.getItem(STORAGE_KEY_TOKEN),
        AsyncStorage.getItem(STORAGE_KEY_USER),
        AsyncStorage.getItem(STORAGE_KEY_URL),
      ]);

      const savedToken = secureToken || legacyToken;
      if (!secureToken && legacyToken) {
        await SecureStore.setItemAsync(STORAGE_KEY_TOKEN, legacyToken);
      }
      if (legacyToken) await AsyncStorage.removeItem(STORAGE_KEY_TOKEN);

      if (savedToken) this.token = savedToken;
      if (savedUrl) {
        let clean = savedUrl.trim().replace(/\/+$/, "");
        if (clean.startsWith("hhtps://")) clean = "https://" + clean.slice(8);
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
          clean = `https://${clean}`;
        }
        // In live mode, ignore and clear any old local testing URLs or legacy domains
        if (
          clean.includes("localhost") ||
          clean.includes("127.0.0.1") ||
          clean.includes("10.0.2.2") ||
          clean.includes("192.168.") ||
          clean.includes("laluxury") ||
          clean.includes("nobel")
        ) {
          this.baseUrl = DEFAULT_URL;
          AsyncStorage.removeItem(STORAGE_KEY_URL).catch(() => {});
        } else {
          this.baseUrl = clean;
        }
      } else {
        this.baseUrl = DEFAULT_URL;
      }

      const user = savedUser ? (JSON.parse(savedUser) as User) : null;
      return { token: this.token, user, baseUrl: this.baseUrl };
    } catch {
      return { token: null, user: null, baseUrl: this.baseUrl };
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async setBaseUrl(url: string): Promise<void> {
    let clean = url.trim().replace(/\/+$/, "");
    if (clean.startsWith("hhtps://")) clean = "https://" + clean.slice(8);
    if (clean.startsWith("hhtp://")) clean = "http://" + clean.slice(7);
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
      clean = `https://${clean}`;
    }
    if (!__DEV__ && !clean.startsWith("https://")) {
      throw new Error("Production API URL must use HTTPS.");
    }
    this.baseUrl = clean;
    await AsyncStorage.setItem(STORAGE_KEY_URL, clean);
  }

  getToken(): string | null {
    return this.token;
  }

  async setSession(token: string, user: User): Promise<void> {
    this.token = token;
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_KEY_TOKEN, token),
      AsyncStorage.removeItem(STORAGE_KEY_TOKEN),
      AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user)),
    ]);
  }

  async clearSession(): Promise<void> {
    this.token = null;
    await Promise.all([
      SecureStore.deleteItemAsync(STORAGE_KEY_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEY_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEY_USER),
    ]);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    publicRead = false,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(publicRead ? {} : { "Cache-Control": "no-store" }),
      ...(options.headers as Record<string, string>),
    };

    if (!publicRead && this.token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers, ...(publicRead ? { credentials: "omit" as const } : { cache: "no-store" as const }) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network request failed";
      throw new Error(`Unable to connect to Noble Enclave server (${this.baseUrl}). ${msg}`);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error || `Request failed with status ${response.status}`;
      const err = new Error(errorMsg) as Error & Record<string, unknown>;
      if (data && typeof data === "object") {
        Object.assign(err, data);
      }
      if (response.status === 401 && this.token) {
        await this.clearSession();
      }
      throw err;
    }

    return data as T;
  }

  private async publicRequest<T>(endpoint: string, ttlMs = 0): Promise<T> {
    const key = `${this.baseUrl}${endpoint}`;
    const cached = this.publicCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;
    const data = await this.request<T>(endpoint, {}, true);
    if (ttlMs > 0) {
      if (this.publicCache.size >= 64) this.publicCache.clear();
      this.publicCache.set(key, { expiresAt: Date.now() + ttlMs, data });
    }
    return data;
  }

  async getStoreProducts(params: { page?: number; limit?: number; q?: string; categoryId?: string; isFeatured?: boolean; isPreorder?: boolean } = {}): Promise<{ products: Product[]; pagination: { page: number; limit: number; total: number; totalPages: number } }> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") query.set(key, String(value));
    return this.publicRequest(`/api/store/products?${query}`);
  }

  async getStoreProduct(id: string): Promise<{ product: ProductDetail }> {
    return this.publicRequest(`/api/store/products/${encodeURIComponent(id)}`);
  }

  async getStoreCategories(bypassCache = false): Promise<{ categories: Category[] }> {
    if (bypassCache) {
      this.publicCache.delete(`${this.baseUrl}/api/store/categories`);
    }
    return this.publicRequest("/api/store/categories", bypassCache ? 0 : 15 * 60 * 1000);
  }

  async updateCategory(
    id: string,
    data: { name?: string; imageUrl?: string | null; description?: string; position?: number }
  ): Promise<{ ok: boolean; category: Category }> {
    const res = await this.request<{ ok: boolean; category: Category }>("/api/app/categories", {
      method: "PATCH",
      body: JSON.stringify({ id, ...data }),
    });
    this.publicCache.clear();
    return res;
  }

  async getStoreCollections(): Promise<{ collections: Collection[] }> {
    return this.publicRequest("/api/store/collections", 15 * 60 * 1000);
  }

  async getStoreConfig(): Promise<AppConfig> {
    return this.publicRequest("/api/store/config", 5 * 60 * 1000);
  }

  // --- Auth -----------------------------------------------------------------

  async sendAuthOtp(
    phone: string,
    purpose: "LOGIN" | "REGISTER" = "LOGIN",
    name?: string,
  ): Promise<{ ok: boolean; message: string; normalizedPhone?: string; ussdCode?: string }> {
    return this.request<{ ok: boolean; message: string; normalizedPhone?: string; ussdCode?: string }>(
      "/api/app/auth/otp/send",
      {
        method: "POST",
        body: JSON.stringify({ phone, purpose, name }),
      },
    );
  }

  async verifyAuthOtp(data: {
    phone: string;
    code: string;
    purpose?: "LOGIN" | "REGISTER";
    name?: string;
  }): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>(
      "/api/app/auth/otp/verify",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    await this.setSession(res.token, res.user);
    return res;
  }

  async login(
    identifier: string,
    password: string,
  ): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>("/api/app/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    await this.setSession(res.token, res.user);
    return res;
  }

  async register(data: {
    name: string;
    email?: string;
    phone?: string;
    password: string;
  }): Promise<{ token: string; user: User }> {
    const res = await this.request<{ token: string; user: User }>("/api/app/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
    await this.setSession(res.token, res.user);
    return res;
  }

  async getMe(): Promise<{ user: User }> {
    return this.request<{ user: User }>("/api/app/auth/me");
  }

  // --- Products -------------------------------------------------------------

  async getProducts(params: {
    page?: number;
    limit?: number;
    q?: string;
    status?: string;
    stock?: string;
    categoryId?: string;
    isFeatured?: boolean;
  } = {}): Promise<{
    products: Product[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set("page", String(params.page));
    if (params.limit) searchParams.set("limit", String(params.limit));
    if (params.q) searchParams.set("q", params.q);
    if (params.status && params.status !== "ALL") searchParams.set("status", params.status);
    if (params.stock) searchParams.set("stock", params.stock);
    if (params.categoryId) searchParams.set("categoryId", params.categoryId);
    if (params.isFeatured !== undefined) searchParams.set("isFeatured", String(params.isFeatured));

    const query = searchParams.toString();
    return this.request<{
      products: Product[];
      pagination: { page: number; limit: number; total: number; totalPages: number };
    }>(`/api/app/products${query ? `?${query}` : ""}`);
  }

  async getProduct(id: string): Promise<{ product: ProductDetail }> {
    return this.request<{ product: ProductDetail }>(`/api/app/products/${id}`);
  }

  async createProduct(data: {
    title: string;
    price: number;
    compareAtPrice?: number | null;
    stock?: number;
    sku?: string;
    status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
    shortDescription?: string | null;
    description?: string | null;
    brand?: string | null;
    material?: string | null;
    tags?: string[];
    isFeatured?: boolean;
    isPreorder?: boolean;
    categoryIds?: string[];
  }): Promise<{ ok: boolean; product: Product }> {
    return this.request<{ ok: boolean; product: Product }>("/api/app/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateProduct(
    id: string,
    data: Partial<{
      title: string;
      price: number;
      compareAtPrice: number | null;
      status: "DRAFT" | "ACTIVE" | "ARCHIVED";
      shortDescription: string | null;
      description: string | null;
      brand: string | null;
      material: string | null;
      tags: string[];
      isFeatured: boolean;
      isPreorder: boolean;
    }>,
  ): Promise<{ ok: boolean; product: ProductDetail }> {
    return this.request<{ ok: boolean; product: ProductDetail }>(`/api/app/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteProduct(id: string): Promise<{ ok: boolean; message: string; archived?: boolean }> {
    return this.request<{ ok: boolean; message: string; archived?: boolean }>(
      `/api/app/products/${id}`,
      { method: "DELETE" },
    );
  }

  // --- Variants -------------------------------------------------------------

  async updateVariants(
    productId: string,
    variants: {
      id: string;
      price?: number;
      compareAtPrice?: number | null;
      stock?: number;
      sku?: string;
      isActive?: boolean;
    }[],
  ): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/api/app/products/${productId}/variants`, {
      method: "PATCH",
      body: JSON.stringify({ variants }),
    });
  }

  // --- Images ---------------------------------------------------------------

  async uploadImage(
    productId: string,
    source:
      | {
          uri: string;
          base64?: string | null;
          fileName?: string | null;
          mimeType?: string | null;
        }
      | string,
    alt?: string,
  ): Promise<{ ok: boolean }> {
    const isObject = typeof source === "object" && source !== null;
    const uri = isObject ? source.uri : source;
    const filename =
      (isObject && source.fileName) || uri.split("/").pop() || "photo.jpg";
    const match = /\.(\w+)$/.exec(filename);
    const rawType =
      (isObject && source.mimeType) ||
      (match ? `image/${match[1].toLowerCase()}` : "image/jpeg");
    const mimeType = rawType === "image/jpg" ? "image/jpeg" : rawType;

    let base64String = isObject && source.base64 ? source.base64 : null;

    if (!base64String) {
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        base64String = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("Unable to read image as base64 string"));
            }
          };
          reader.onerror = () => reject(new Error("Failed to read image data"));
          reader.readAsDataURL(blob);
        });
      } catch (readErr: unknown) {
        const msg = readErr instanceof Error ? readErr.message : "Failed to read image";
        throw new Error(`Unable to prepare image: ${msg}`);
      }
    }

    return this.request<{ ok: boolean }>(`/api/app/products/${productId}/images`, {
      method: "POST",
      body: JSON.stringify({
        base64: base64String,
        filename,
        mimeType,
        alt: alt || null,
      }),
    });
  }

  async deleteImage(productId: string, imageId: string): Promise<{ ok: boolean }> {
    return this.request<{ ok: boolean }>(`/api/app/products/${productId}/images/${imageId}`, {
      method: "DELETE",
    });
  }

  // --- Metadata -------------------------------------------------------------

  async getCategories(): Promise<{ categories: Category[] }> {
    return this.request<{ categories: Category[] }>("/api/app/categories");
  }

  async getCollections(): Promise<{ collections: Collection[] }> {
    return this.request<{ collections: Collection[] }>("/api/app/collections");
  }

  // --- Dashboard (Backend) --------------------------------------------------

  async getDashboard(): Promise<DashboardData> {
    return this.request<DashboardData>("/api/app/dashboard");
  }

  // --- Shipping & Delivery -------------------------------------------------

  async getShippingRates(params: {
    region?: string;
    subtotal: number;
    weight?: number;
  }): Promise<{
    ok: boolean;
    region?: string;
    subtotal: number;
    rates: ShippingRate[];
    freeShippingThreshold: number | null;
    freeShippingQualified: boolean;
  }> {
    const searchParams = new URLSearchParams();
    if (params.region) searchParams.set("region", params.region);
    searchParams.set("subtotal", String(params.subtotal));
    if (params.weight) searchParams.set("weight", String(params.weight));

    try {
      const res = await this.request<{
        ok: boolean;
        region?: string;
        subtotal: number;
        rates: ShippingRate[];
        freeShippingThreshold: number | null;
        freeShippingQualified: boolean;
      }>(`/api/app/shipping/rates?${searchParams.toString()}`);
      if (res && Array.isArray(res.rates)) {
        return res;
      }
    } catch {
      // Endpoint may not be deployed yet on live server; fall back to web quote endpoint
    }

    try {
      const quoteUrl = `/api/shipping/quote?region=${encodeURIComponent(params.region || "Greater Accra")}`;
      const webQuote = await this.request<{
        rates: {
          id: string;
          name: string;
          price: number;
          zoneName: string;
          estimatedDaysMin: number | null;
          estimatedDaysMax: number | null;
          isFree: boolean;
        }[];
        subtotal: number;
      }>(quoteUrl);

      const rates: ShippingRate[] = (webQuote.rates || []).map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        zoneName: r.zoneName,
        estimatedDaysMin: r.estimatedDaysMin,
        estimatedDaysMax: r.estimatedDaysMax,
        isFree: Boolean(r.isFree || r.price === 0),
      }));

      return {
        ok: true,
        region: params.region || "Greater Accra",
        subtotal: params.subtotal,
        rates,
        freeShippingThreshold: null,
        freeShippingQualified: rates.some((r) => r.isFree || r.price === 0),
      };
    } catch (fallbackErr) {
      console.warn("Failed to fetch shipping rates:", fallbackErr);
      return {
        ok: false,
        region: params.region,
        subtotal: params.subtotal,
        rates: [],
        freeShippingThreshold: null,
        freeShippingQualified: false,
      };
    }
  }

  // --- Orders & Checkout ----------------------------------------------------

  async getOrders(): Promise<{ orders: Order[] }> {
    return this.request<{ orders: Order[] }>("/api/app/orders");
  }

  async checkout(orderData: {
    items: { variantId: string; quantity: number }[];
    customer: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    shippingAddress: ShippingAddress;
    deliveryType?: "delivery" | "pickup";
    isPickup?: boolean;
    shippingRateId?: string | null;
    discountCode?: string | null;
    preorderDepositOption?: "full" | "deposit_50" | null;
    paymentMethod: string;
    momoPhone?: string | null;
    momoProvider?: "mtn" | "vod" | "atl" | null;
    customerNote?: string | null;
    idempotencyKey?: string | null;
  }): Promise<{
    ok: boolean;
    order: {
      id: string;
      orderNumber: string;
      subtotal?: number;
      discountTotal?: number;
      shippingTotal?: number;
      total: number;
      depositAmount?: number | null;
      currency: string;
      status: string;
      placedAt: string;
      reference: string;
    };
    paymentUrl?: string | null;
    isTestOrder?: boolean;
    momoPush?: {
      status: string;
      reference: string;
      phone: string;
      provider: string;
      providerLabel: string;
      amountFormatted: string;
      displayText: string;
    } | null;
    token?: string | null;
    user?: User | null;
  }> {
    return this.request("/api/app/orders", {
      method: "POST",
      body: JSON.stringify(orderData),
    });
  }

  async verifyOrderPayment(reference: string, simulate = false): Promise<{
    ok: boolean;
    paid: boolean;
    status?: string;
    message?: string;
    error?: string;
    channel?: string;
    simulated?: boolean;
    order?: Order;
  }> {
    return this.request(`/api/app/orders/verify?reference=${encodeURIComponent(reference)}${simulate ? "&simulate=true" : ""}`);
  }

  async submitOrderOtp(reference: string, otp: string): Promise<{
    ok: boolean;
    paid?: boolean;
    status?: string;
    displayText?: string;
    error?: string;
  }> {
    return this.request("/api/app/orders/verify", {
      method: "POST",
      body: JSON.stringify({ reference, otp }),
    });
  }

  async resendOrderReceipt(orderNumber: string): Promise<{ ok: boolean; message: string }> {
    return this.request(`/api/app/orders/${encodeURIComponent(orderNumber)}/receipt`, {
      method: "POST",
    });
  }

  // --- Cart Continuity (Server & Local) -------------------------------------

  async getSavedCart(): Promise<CartItem[]> {
    try {
      const json = await AsyncStorage.getItem(STORAGE_KEY_CART);
      return json ? JSON.parse(json) : [];
    } catch {
      return [];
    }
  }

  async saveCart(items: CartItem[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY_CART, JSON.stringify(items));
    } catch {
      // Ignore storage error
    }
  }

  async getServerCart(): Promise<{ ok: boolean; authenticated: boolean; cart: ServerCart }> {
    return this.request("/api/app/cart");
  }

  async addToServerCart(variantId: string, quantity = 1): Promise<{ ok: boolean; cart: ServerCart }> {
    return this.request("/api/app/cart", {
      method: "POST",
      body: JSON.stringify({ variantId, quantity }),
    });
  }

  async updateServerCartItem(variantId: string, quantity: number): Promise<{ ok: boolean; cart: ServerCart }> {
    return this.request("/api/app/cart", {
      method: "PATCH",
      body: JSON.stringify({ variantId, quantity }),
    });
  }

  async removeServerCartItem(variantId?: string): Promise<{ ok: boolean; cart: ServerCart }> {
    const url = variantId ? `/api/app/cart?variantId=${encodeURIComponent(variantId)}` : "/api/app/cart";
    return this.request(url, { method: "DELETE" });
  }

  async mergeGuestCartWithServer(
    items: { variantId: string; quantity: number }[],
  ): Promise<{ ok: boolean; cart: ServerCart }> {
    return this.request("/api/app/cart/merge", {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  }

  // --- App Config & Payment Mode --------------------------------------------

  async getConfig(): Promise<AppConfig> {
    return this.request<AppConfig>("/api/app/config");
  }

  // --- App Version & Update -------------------------------------------------

  async checkAppVersion(): Promise<{
    latestVersion: string;
    versionCode: number;
    appName: string;
    downloadUrl: string;
    directUrl: string;
    releaseNotes: string;
  }> {
    try {
      return await this.request<{
        latestVersion: string;
        versionCode: number;
        appName: string;
        downloadUrl: string;
        directUrl: string;
        releaseNotes: string;
      }>("/api/app/version", {}, true);
    } catch {
      // Direct production fetch if primary request failed (e.g. stale DNS or saved URL in AsyncStorage)
      try {
        const directRes = await fetch(`${DEFAULT_URL}/api/app/version`, {
          headers: { Accept: "application/json" },
        });
        if (directRes.ok) {
          const data = await directRes.json();
          // Heal baseUrl back to live production domain
          this.baseUrl = DEFAULT_URL;
          AsyncStorage.removeItem(STORAGE_KEY_URL).catch(() => {});
          return data;
        }
      } catch {
        // offline fallback
      }

      // Safe resilient metadata so the user is NEVER blocked from updating
      return {
        latestVersion: "1.3.1",
        versionCode: 13,
        appName: "Noble Enclave",
        downloadUrl: `${DEFAULT_URL}/app`,
        directUrl: `${DEFAULT_URL}/api/app/download`,
        releaseNotes:
          "Noble Enclave v1.3.1 release: checkout reliability, pickup flow, and payment recovery improvements.",
      };
    }
  }

  // --- Owner Custom Notifications ------------------------------------------

  async sendCustomNotification(data: {
    target: "phone" | "announcement" | "order";
    message: string;
    phone?: string;
    orderId?: string;
    title?: string;
  }): Promise<{ ok: boolean; message: string; deliveryStatus?: string }> {
    return this.request<{ ok: boolean; message: string; deliveryStatus?: string }>(
      "/api/app/notifications/custom",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
  }
}

export const api = new ApiService();

