export interface AdminNavMenuItem {
  href: string;
  label: string;
  group?: string;
}

export interface StorefrontNavMenuItem {
  key: string;
  label: string;
  href: string;
}

export const ADMIN_NAV_MENU_ITEMS: AdminNavMenuItem[] = [
  // Overview
  { href: "/admin", label: "Dashboard", group: "Overview" },
  { href: "/admin/analytics", label: "Sales & Profits", group: "Overview" },

  // Orders
  { href: "/admin/orders", label: "Orders", group: "Orders" },
  { href: "/admin/carts", label: "Unfinished Orders", group: "Orders" },
  { href: "/admin/orders/new", label: "In-Store Sale (POS)", group: "Orders" },
  { href: "/admin/preorders", label: "Pre-Orders & Sourcing", group: "Orders" },
  { href: "/admin/shipments", label: "Shipments & Freight", group: "Orders" },

  // Catalog & Inventory
  { href: "/admin/products", label: "Products", group: "Catalog & Inventory" },
  { href: "/admin/inventory", label: "Stock & Inventory", group: "Catalog & Inventory" },
  { href: "/admin/categories", label: "Categories", group: "Catalog & Inventory" },
  { href: "/admin/products/bulk", label: "Quick Price Editor", group: "Catalog & Inventory" },
  { href: "/admin/media", label: "Photo Library", group: "Catalog & Inventory" },

  // Customers
  { href: "/admin/customers", label: "Customers", group: "Customers" },
  { href: "/admin/reviews", label: "Customer Reviews", group: "Customers" },
  { href: "/admin/discounts", label: "Promo Codes & Deals", group: "Customers" },

  // Settings & Tools
  { href: "/admin/settings", label: "Store Settings", group: "Settings & Tools" },
  { href: "/admin/settings/messages", label: "Message & SMS Templates", group: "Settings & Tools" },
  { href: "/admin/agent", label: "AI Store Assistant", group: "Settings & Tools" },
  { href: "/admin/users", label: "Team & Staff", group: "Settings & Tools" },
  { href: "/admin/activity", label: "Store Audit Log", group: "Settings & Tools" },
];

export const STOREFRONT_NAV_MENU_ITEMS: StorefrontNavMenuItem[] = [
  { key: "shop", label: "Shop All", href: "/shop" },
  { key: "sale", label: "Sale & Offers", href: "/shop?onSale=1" },
  { key: "pre-order", label: "Pre-Orders & Sourcing", href: "/pre-order" },
  { key: "lookbook", label: "Lookbook", href: "/lookbook" },
  { key: "trade", label: "Trade Program", href: "/trade" },
  { key: "track", label: "Track Order", href: "/orders/track" },
  { key: "contact", label: "Contact", href: "/contact" },
];
