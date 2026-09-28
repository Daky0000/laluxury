export interface AdminNavMenuItem {
  href: string;
  label: string;
}

export interface StorefrontNavMenuItem {
  key: string;
  label: string;
  href: string;
}

export const ADMIN_NAV_MENU_ITEMS: AdminNavMenuItem[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/analytics", label: "Financials & Margins" },
  { href: "/admin/orders/new", label: "Showroom POS" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/preorders", label: "Pre-orders & Trade" },
  { href: "/admin/shipments", label: "Containers & Freight" },
  { href: "/admin/carts", label: "Abandoned bags" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/products/bulk", label: "Bulk FX & Matrix" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/media", label: "Media" },
  { href: "/admin/inventory", label: "Inventory" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/discounts", label: "Discounts" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/agent", label: "AI agent" },
  { href: "/admin/users", label: "Staff" },
  { href: "/admin/activity", label: "Activity" },
  { href: "/admin/settings", label: "Settings" },
];

export const STOREFRONT_NAV_MENU_ITEMS: StorefrontNavMenuItem[] = [
  { key: "shop", label: "Shop All", href: "/shop" },
  { key: "lookbook", label: "Lookbook", href: "/lookbook" },
  { key: "trade", label: "Trade Program", href: "/trade" },
  { key: "track", label: "Track Order", href: "/orders/track" },
  { key: "contact", label: "Contact", href: "/contact" },
];
