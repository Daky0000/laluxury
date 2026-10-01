import AsyncStorage from "@react-native-async-storage/async-storage";
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
} from "../types";

// Default to live store URL, with support for local LAN and emulator endpoints
const DEFAULT_URL = "https://laluxurys.com";

const STORAGE_KEY_TOKEN = "lx_token";
const STORAGE_KEY_USER = "lx_user";
const STORAGE_KEY_URL = "lx_api_url";
const STORAGE_KEY_CART = "lx_cart";

class ApiService {
  private token: string | null = null;
  private baseUrl: string = DEFAULT_URL;

  async init(): Promise<{ token: string | null; user: User | null; baseUrl: string }> {
    try {
      const [savedToken, savedUser, savedUrl] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_TOKEN),
        AsyncStorage.getItem(STORAGE_KEY_USER),
        AsyncStorage.getItem(STORAGE_KEY_URL),
      ]);

      if (savedToken) this.token = savedToken;
      if (savedUrl) {
        let clean = savedUrl.trim().replace(/\/+$/, "");
        if (clean.startsWith("hhtps://")) clean = "https://" + clean.slice(8);
        if (clean.startsWith("hhtp://")) clean = "http://" + clean.slice(7);
        this.baseUrl = clean;
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
    this.baseUrl = clean;
    await AsyncStorage.setItem(STORAGE_KEY_URL, clean);
  }

  getToken(): string | null {
    return this.token;
  }

  async setSession(token: string, user: User): Promise<void> {
    this.token = token;
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY_TOKEN, token),
      AsyncStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user)),
    ]);
  }

  async clearSession(): Promise<void> {
    this.token = null;
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEY_TOKEN),
      AsyncStorage.removeItem(STORAGE_KEY_USER),
    ]);
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (this.token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }

    if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    let response: Response;
    try {
      response = await fetch(url, { ...options, headers });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network request failed";
      throw new Error(`Unable to connect to Laluxury server (${this.baseUrl}). ${msg}`);
    }

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const errorMsg = data?.error || `Request failed with status ${response.status}`;
      throw new Error(errorMsg);
    }

    return data as T;
  }

  // --- Auth -----------------------------------------------------------------

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
    variants: Array<{
      id: string;
      price?: number;
      compareAtPrice?: number | null;
      stock?: number;
      sku?: string;
      isActive?: boolean;
    }>,
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

  // --- Orders & Checkout ----------------------------------------------------

  async getOrders(): Promise<{ orders: Order[] }> {
    return this.request<{ orders: Order[] }>("/api/app/orders");
  }

  async checkout(orderData: {
    items: Array<{ variantId: string; quantity: number }>;
    customer: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
    };
    shippingAddress: ShippingAddress;
    paymentMethod: string;
    customerNote?: string | null;
  }): Promise<{
    ok: boolean;
    order: {
      id: string;
      orderNumber: string;
      total: number;
      currency: string;
      status: string;
      placedAt: string;
      reference: string;
    };
    paymentUrl?: string | null;
  }> {
    return this.request<{
      ok: boolean;
      order: {
        id: string;
        orderNumber: string;
        total: number;
        currency: string;
        status: string;
        placedAt: string;
        reference: string;
      };
      paymentUrl?: string | null;
    }>("/api/app/orders", {
      method: "POST",
      body: JSON.stringify(orderData),
    });
  }

  // --- Local Cart Storage ---------------------------------------------------

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

  // --- App Version & Update -------------------------------------------------

  async checkAppVersion(): Promise<{
    latestVersion: string;
    versionCode: number;
    appName: string;
    downloadUrl: string;
    directUrl: string;
    releaseNotes: string;
  }> {
    return this.request<{
      latestVersion: string;
      versionCode: number;
      appName: string;
      downloadUrl: string;
      directUrl: string;
      releaseNotes: string;
    }>("/api/app/version");
  }
}


export const api = new ApiService();
