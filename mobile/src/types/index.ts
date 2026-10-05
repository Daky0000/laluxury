export type User = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  role: "CUSTOMER" | "STAFF" | "MANAGER" | "ADMIN" | "OWNER";
  permissions: string[];
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  position?: number;
  isActive?: boolean;
};

export type Collection = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  isFeatured?: boolean;
};

export type ProductImage = {
  id: string;
  url: string;
  alt: string | null;
  position: number;
};

export type InventoryItem = {
  id: string;
  onHand: number;
  reserved: number;
  allowBackorder: boolean;
};

export type ProductOptionValue = {
  id: string;
  optionId: string;
  value: string;
  hexColor?: string | null;
  position: number;
};

export type ProductOption = {
  id: string;
  productId: string;
  name: string;
  position: number;
  values: ProductOptionValue[];
};

export type VariantOptionValue = {
  variantId?: string;
  optionValueId: string;
  optionValue?: {
    id: string;
    value: string;
    hexColor?: string | null;
    optionId: string;
    option?: { id: string; name: string };
  };
};

export type Variant = {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  isActive: boolean;
  stock?: number;
  available?: number | null;
  inventory?: InventoryItem | null;
  optionValues?: VariantOptionValue[];
};

export type Product = {
  id: string;
  title: string;
  slug: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  minPrice: number;
  maxPrice: number;
  compareAtPrice: number | null;
  brand: string | null;
  material: string | null;
  isFeatured: boolean;
  isPreorder: boolean;
  tags: string[];
  totalStock: number;
  totalAvailable?: number;
  variantCount: number;
  imageCount: number;
  images: ProductImage[];
  categories: Category[];
  collections: Collection[];
  options?: ProductOption[];
  variants?: Variant[];
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = Product & {
  shortDescription: string | null;
  description: string | null;
  options: ProductOption[];
  variants: Variant[];
  stats?: {
    ordersCount: number;
    unitsSold: number;
    reviewsCount: number;
  };
};

export type CartItem = {
  product: Product;
  variant: Variant;
  quantity: number;
};

export type ShippingAddress = {
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  region: string;
  postalCode?: string | null;
  country: string;
};

export type OrderItemDetail = {
  id: string;
  variantId?: string | null;
  productId?: string | null;
  productTitle: string;
  variantTitle: string;
  sku: string;
  imageUrl?: string | null;
  quantity: number;
  unitPrice: number;
  discountAllocated?: number;
  total: number;
  quantityFulfilled?: number;
};

export type OrderPaymentDetail = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  channel?: string | null;
  mobileMoneyNumber?: string | null;
  cardBrand?: string | null;
  cardLast4?: string | null;
  paidAt?: string | null;
};

export type OrderEventDetail = {
  id: string;
  type: string;
  message: string;
  createdAt: string;
};

export type Order = {
  id: string;
  orderNumber: string;
  /** Signed invoice path; opens without a web sign-in. */
  invoicePath?: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus?: string;
  paymentMethod: string;
  currency: string;
  email?: string;
  phone?: string | null;
  subtotal: number;
  discountTotal?: number;
  shippingTotal: number;
  total: number;
  depositAmount?: number | null;
  balancePaidAt?: string | null;
  hasPreorderItems?: boolean;
  preorderStage?: string;
  customerNote?: string | null;
  staffNote?: string | null;
  trackingNumber?: string | null;
  trackingCompany?: string | null;
  placedAt: string;
  paidAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  shippingAddress?: ShippingAddress | null;
  shippingRate?: { id: string; name: string } | null;
  items: OrderItemDetail[];
  payments?: OrderPaymentDetail[];
  events?: OrderEventDetail[];
};

export type ShippingZoneDetail = {
  id: string;
  name: string;
  regions: string[];
  isActive: boolean;
  rates: {
    id: string;
    name: string;
    price: number;
    freeAboveSubtotal?: number | null;
    estimatedDaysMin?: number | null;
    estimatedDaysMax?: number | null;
    isActive: boolean;
    position: number;
  }[];
};

export type DashboardData = {
  metrics: {
    totalRevenue: number;
    ordersCount: number;
    pendingFulfilment: number;
    totalProducts: number;
    activeProducts: number;
    lowStockCount: number;
  };
  recentOrders: {
    id: string;
    orderNumber: string;
    total: number;
    currency: string;
    status: string;
    paymentStatus: string;
    fulfillmentStatus?: string;
    placedAt: string;
    customerName: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    city: string | null;
    line1?: string | null;
    items?: {
      id: string;
      productTitle: string;
      variantTitle: string;
      quantity: number;
      unitPrice: number;
    }[];
  }[];
  lowStockItems: {
    id: string;
    productId: string;
    productTitle: string;
    variantTitle: string;
    sku: string;
    price: number;
    stock: number;
    imageUrl?: string | null;
  }[];
};

export type ShippingRate = {

  id: string;
  name: string;
  price: number;
  zoneName: string;
  estimatedDaysMin: number | null;
  estimatedDaysMax: number | null;
  isFree: boolean;
};

export type AppConfig = {
  ok: boolean;
  apiVersion?: string;
  revision?: number;
  storeName: string;
  tagline: string;
  currency: string;
  paymentMode: "live" | "test";
  isTestMode: boolean;
  paystack: {
    ready: boolean;
    mode: "live" | "test";
    publicKey: string | null;
  };
  supportEmail: string;
  supportPhone: string;
  whatsappNumber: string;
  addressLine?: string;
  instagramUrl?: string;
  freeShippingThreshold: number | null;
  regions?: readonly string[];
  lowStockThreshold?: number;
  announcementBar?: string;
  announcements?: string[];
  hero?: {
    eyebrow: string;
    title: string;
    titleAccent: string;
    body: string;
    imageUrl: string;
  };
  bundle?: {
    title: string;
    eyebrow: string;
    body: string;
    price: number;
    compareAtPrice: number | null;
    imageUrl: string;
    href: string;
  } | null;
  policies?: {
    returnsPolicy: string;
    shippingPolicy: string;
  };
  navigation?: {
    hideStorefrontNav: boolean;
    hiddenStorefrontNavItems: string[];
  };
  management?: {
    role: string;
    canManageProducts: boolean;
    canReadOrders: boolean;
    canManageOrders: boolean;
    canManageInventory: boolean;
    canManageSettings: boolean;
  } | null;
};

export type ServerCartItem = {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  availableStock?: number | null;
  isPreorder?: boolean;
  variant: {
    id: string;
    productId: string;
    title: string;
    sku: string;
    price: number;
    compareAtPrice: number | null;
    product: {
      id: string;
      title: string;
      slug: string;
      isPreorder: boolean;
      imageUrl: string | null;
    };
  };
};

export type ServerCart = {
  cartId?: string;
  items: ServerCartItem[];
  subtotal: number;
  itemCount: number;
  discountCode?: string | null;
};

export const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Western",
  "Western North",
  "Central",
  "Eastern",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
] as const;

export type GhanaRegion = (typeof GHANA_REGIONS)[number];


// --- Wishlist, reviews, search, analytics ------------------------------------

export type WishlistItem = {
  productId: string;
  slug: string;
  title: string;
  brand: string | null;
  isPreorder: boolean;
  imageUrl: string | null;
  price: number | null;
  compareAtPrice: number | null;
  variantId: string | null;
  savedAt: string;
};

export type Review = {
  id: string;
  authorName: string;
  rating: number;
  title: string | null;
  body: string;
  isVerifiedPurchase: boolean;
  createdAt: string;
};

export type ProductReviews = {
  ok: boolean;
  average: number | null;
  count: number;
  reviews: Review[];
  mine: { rating: number; title: string | null; body: string; isApproved: boolean } | null;
};

export type SearchSuggestion = {
  id: string;
  slug: string;
  title: string;
  minPrice: number;
  images: { url: string }[];
};

export type ProductSort = "featured" | "newest" | "price_asc" | "price_desc";

export type AnalyticsEventName =
  | "app_open"
  | "product_view"
  | "add_to_bag"
  | "wishlist_add"
  | "search"
  | "checkout_start"
  | "purchase";

export type AnalyticsEventInput = {
  name: AnalyticsEventName;
  sessionId?: string;
  props?: Record<string, string | number | boolean | null>;
};
