# LaLuxury Custom App REST API Reference

This API allows a custom mobile application (iOS, Android, React Native, Flutter, etc.) to manage products, variants, images, categories, and inventory for **LaLuxury**, communicating directly and in real-time with the website.

---

## 🔐 Authentication & Security

All requests to `/api/app/*` (except `/api/app/auth/login`) require a standard **Bearer Token** header:

```http
Authorization: Bearer <your-jwt-token>
```

- Tokens are signed with the store's HS256 secret key (`AUTH_SECRET`).
- Staff RBAC permissions are enforced on every route:
  - Reading catalog / products: `products:read`
  - Writing / creating / deleting: `products:write` (Managers, Admins, Owners)

---

## 📌 Endpoints Summary

| Method | Endpoint | Description | Permission |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/app/auth/login` | Staff sign in with email/phone + password | Public |
| `GET` | `/api/app/auth/me` | Fetch authenticated user profile & permissions | Bearer Token |
| `GET` | `/api/app/products` | Search, filter, and paginate products | `products:read` |
| `POST` | `/api/app/products` | Create a product with default variant & stock | `products:write` |
| `GET` | `/api/app/products/:id` | Get full product details (variants, options, images) | `products:read` |
| `PATCH` | `/api/app/products/:id` | Update product info, prices, SEO, pre-order settings | `products:write` |
| `DELETE` | `/api/app/products/:id` | Delete product (or auto-archive if sales exist) | `products:write` |
| `GET` | `/api/app/products/:id/variants` | List all variants and stock levels for a product | `products:read` |
| `POST` | `/api/app/products/:id/variants` | Create a new variant on a product | `products:write` |
| `PATCH` | `/api/app/products/:id/variants` | Bulk update variant prices, SKUs, and stock | `products:write` |
| `GET` | `/api/app/products/:id/images` | List images for a product | `products:read` |
| `POST` | `/api/app/products/:id/images` | Upload image (multipart/form-data, base64, or URL) | `products:write` |
| `PATCH` | `/api/app/products/:id/images/:imageId` | Update image alt text, position, or swatch link | `products:write` |
| `DELETE` | `/api/app/products/:id/images/:imageId` | Remove image from product | `products:write` |
| `GET` | `/api/app/categories` | List all categories for selection | `products:read` |
| `GET` | `/api/app/collections` | List all collections for selection | `products:read` |

---

## 1. Authentication

### 🔑 `POST /api/app/auth/login`
Sign in with an email address or Ghana phone number (`024...`, `+233...`).

**Request Body:**
```json
{
  "identifier": "admin@nobleenclave.com",
  "password": "YourPassword123"
}
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "cm...user_id",
    "email": "admin@nobleenclave.com",
    "phone": "233240000000",
    "firstName": "Akua",
    "lastName": "Mensah",
    "role": "ADMIN",
    "permissions": ["products:read", "products:write", "..."]
  }
}
```

---

### 👤 `GET /api/app/auth/me`
Verify token validity and retrieve current user credentials.

**Headers:** `Authorization: Bearer <token>`

---

## 2. Products Management

> 💡 **Money Format**: Monetary values are integers in **minor units (pesewas)**.  
> `GHS 150.00` = `15000`. If you send a decimal number, the API automatically converts it.

### 📋 `GET /api/app/products`
Query parameters:
- `page`: Page number (default `1`)
- `limit`: Number of items (default `20`, max `100`)
- `q`: Search keyword across title, tags, brand, material, and SKU
- `status`: `DRAFT`, `ACTIVE`, or `ARCHIVED`
- `stock`: `out` (out of stock), `low` (1-5 left), `in` (in stock)
- `categoryId`: Filter by category ID
- `collectionId`: Filter by collection ID
- `isFeatured`: `true` / `false`
- `isPreorder`: `true` / `false`

**Success Response (200):**
```json
{
  "products": [
    {
      "id": "cm8abc...",
      "title": "Aura Bouclé Armchair",
      "slug": "aura-boucle-armchair",
      "status": "ACTIVE",
      "minPrice": 85000,
      "maxPrice": 85000,
      "compareAtPrice": 95000,
      "brand": "LaLuxury",
      "material": "Textured Bouclé, Ash Wood",
      "isFeatured": true,
      "isPreorder": false,
      "tags": ["living room", "seating"],
      "totalStock": 8,
      "variantCount": 1,
      "imageCount": 3,
      "images": [{ "url": "/api/media/...", "alt": "Front view" }],
      "categories": [{ "id": "cat_1", "name": "Living Room", "slug": "living-room" }]
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

---

### ➕ `POST /api/app/products`
Create a new product with an initial default variant and inventory.

**Request Body:**
```json
{
  "title": "Verona Marble Coffee Table",
  "price": 120000,
  "compareAtPrice": 140000,
  "costPrice": 75000,
  "stock": 5,
  "sku": "VRN-CT-01",
  "status": "ACTIVE",
  "shortDescription": "Honed Carrara marble on brushed bronze.",
  "description": "Full product description...",
  "brand": "LaLuxury Atelier",
  "material": "Carrara Marble",
  "tags": ["marble", "coffee table", "living"],
  "isFeatured": true,
  "isPreorder": false,
  "categoryIds": ["cat_id_here"],
  "collectionIds": ["coll_id_here"],
  "imageUrls": ["https://res.cloudinary.com/..."]
}
```

---

### 🔍 `GET /api/app/products/:id`
Returns full product information, including all variants, inventory records, option trees (e.g., Colour, Size), attached gallery images, and lifetime order sales stats.

---

### ✏️ `PATCH /api/app/products/:id`
Updates any subset of fields.

```json
{
  "title": "Verona Marble Coffee Table (Updated)",
  "status": "ACTIVE",
  "compareAtPrice": 135000,
  "isFeatured": false
}
```

---

### 🗑️ `DELETE /api/app/products/:id`
- Deletes the product if it has never been ordered.
- If it has sales history, it is **safely archived** (`status: ARCHIVED`) so customer receipts and historical accounting are never corrupted.

---

## 3. Variants & Stock Management

### 🔄 `PATCH /api/app/products/:id/variants`
Bulk updates prices, SKUs, or inventory for any variant on the product.

**Request Body:**
```json
{
  "variants": [
    {
      "id": "variant_id_1",
      "price": 88000,
      "stock": 14,
      "sku": "VRN-CT-IVR"
    },
    {
      "id": "variant_id_2",
      "price": 92000,
      "stock": 6,
      "isActive": true
    }
  ]
}
```

---

## 4. Product Photos

### 📸 `POST /api/app/products/:id/images`

You can upload pictures in three formats:

1. **Direct Camera / Library File Upload (`multipart/form-data`)**:
   - `files`: File object
   - `alt`: Optional description
   - Automatically compressed to WebP and saved in PostgreSQL / Cloudinary.

2. **Base64 String (`application/json`)**:
   ```json
   {
     "base64": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
     "filename": "camera-photo.jpg",
     "alt": "Side profile"
   }
   ```

3. **External URL (`application/json`)**:
   ```json
   {
     "url": "https://images.unsplash.com/...",
     "alt": "Showroom setup"
   }
   ```

---

## 5. Instant Website Synchronization

Every mutation performed by the mobile app automatically triggers Next.js cache revalidation:
- `/` (Home page)
- `/shop` (Catalog)
- `/product/[slug]` (Live product page)
- `/admin/products` (Web back-office)

Changes made in the app are visible to customers on the website **immediately**.
