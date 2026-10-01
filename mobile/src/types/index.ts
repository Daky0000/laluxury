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

export type Variant = {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  isActive: boolean;
  inventory?: InventoryItem | null;
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
  variantCount: number;
  imageCount: number;
  images: ProductImage[];
  categories: Category[];
  collections: Collection[];
  createdAt: string;
  updatedAt: string;
};

export type ProductDetail = Product & {
  shortDescription: string | null;
  description: string | null;
  variants: Variant[];
  stats?: {
    ordersCount: number;
    unitsSold: number;
    reviewsCount: number;
  };
};
