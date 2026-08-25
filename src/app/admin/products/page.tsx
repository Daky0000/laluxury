import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { can } from "@/lib/auth/rbac";
import { formatMoney } from "@/lib/money";
import { availableOf } from "@/lib/inventory";
import { buildQuery } from "@/lib/utils";
import { Card, Badge, LinkButton, EmptyState, SectionHeading } from "@/components/ui";
import { ProductBulkBar } from "@/components/admin/product-bulk-bar";
import type { Prisma, ProductStatus } from "@/generated/prisma";

export const metadata: Metadata = { title: "Products" };

const PER_PAGE = 20;

export default async function AdminProductsPage({ searchParams }: PageProps<"/admin/products">) {
  const user = await requirePermission("products:read");
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "";
  const categoryId = typeof params.category === "string" ? params.category : "";
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.ProductWhereInput = {
    ...(status ? { status: status as ProductStatus } : {}),
    ...(categoryId ? { categories: { some: { categoryId } } } : {}),
    ...(q
      ? {
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { searchText: { contains: q.toLowerCase() } },
            { variants: { some: { sku: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };

  const [products, total, categories, statusCounts] = await Promise.all([
    db.product.findMany({
      where,
      include: {
        images: { orderBy: { position: "asc" }, take: 1 },
        variants: { include: { inventory: true } },
        categories: { include: { category: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: PER_PAGE,
      skip: (page - 1) * PER_PAGE,
    }),
    db.product.count({ where }),
    db.category.findMany({ orderBy: { position: "asc" }, select: { id: true, name: true } }),
    db.product.groupBy({ by: ["status"], _count: true }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PER_PAGE));
  const countFor = (s: string) => statusCounts.find((c) => c.status === s)?._count ?? 0;
  const canWrite = can(user.role, "products:write");

  return (
    <div className="flex flex-col gap-6">
      <SectionHeading
        title="Products"
        description={`${total} matching ${total === 1 ? "product" : "products"}.`}
        action={
          canWrite ? (
            <LinkButton href="/admin/products/new" size="sm">
              <Plus className="h-4 w-4" aria-hidden />
              New product
            </LinkButton>
          ) : undefined
        }
      />

      {/* Filters */}
      <Card className="p-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="q" className="lx-eyebrow mb-1.5 block">
              Search
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                id="q"
                name="q"
                defaultValue={q}
                placeholder="Name or SKU"
                className="lx-field pl-9"
              />
            </div>
          </div>

          <div>
            <label htmlFor="status" className="lx-eyebrow mb-1.5 block">
              Status
            </label>
            <select id="status" name="status" defaultValue={status} className="lx-field w-40">
              <option value="">All statuses</option>
              <option value="ACTIVE">Active ({countFor("ACTIVE")})</option>
              <option value="DRAFT">Draft ({countFor("DRAFT")})</option>
              <option value="ARCHIVED">Archived ({countFor("ARCHIVED")})</option>
            </select>
          </div>

          <div>
            <label htmlFor="category" className="lx-eyebrow mb-1.5 block">
              Category
            </label>
            <select id="category" name="category" defaultValue={categoryId} className="lx-field w-44">
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="rounded-[--radius-card] bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)]"
          >
            Filter
          </button>

          {q || status || categoryId ? (
            <Link
              href="/admin/products"
              className="px-2 py-2.5 text-sm text-[var(--text-secondary)] underline-offset-4 hover:underline"
            >
              Reset
            </Link>
          ) : null}
        </form>
      </Card>

      {products.length === 0 ? (
        <EmptyState
          title="No products match"
          description={q || status ? "Try widening the filters." : "Add your first product to get started."}
          action={
            canWrite ? <LinkButton href="/admin/products/new" size="sm">Add a product</LinkButton> : undefined
          }
        />
      ) : (
        <ProductBulkBar canWrite={canWrite}>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                  <tr>
                    {canWrite ? <th className="w-10 px-4 py-2.5" /> : null}
                    <th className="px-4 py-2.5 font-medium">Product</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Price</th>
                    <th className="px-4 py-2.5 font-medium">Stock</th>
                    <th className="px-4 py-2.5 font-medium">Variants</th>
                    <th className="px-4 py-2.5 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {products.map((product) => {
                    const stock = product.variants.reduce(
                      (sum, v) => sum + (v.inventory ? availableOf(v.inventory) : 0),
                      0,
                    );
                    const tracked = product.variants.some(
                      (v) => v.inventory?.trackInventory && !v.inventory.allowBackorder,
                    );

                    return (
                      <tr key={product.id} className="hover:bg-[var(--surface-sunken)]">
                        {canWrite ? (
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              name="productIds"
                              value={product.id}
                              className="accent-[var(--accent)]"
                              aria-label={`Select ${product.title}`}
                            />
                          </td>
                        ) : null}

                        <td className="px-4 py-3">
                          <Link href={`/admin/products/${product.id}`} className="flex items-center gap-3">
                            <span className="h-11 w-9 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-sunken)]">
                              {product.images[0] ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.images[0].url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                />
                              ) : null}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium hover:underline">
                                {product.title}
                              </span>
                              <span className="block truncate text-xs text-[var(--text-muted)]">
                                {product.variants[0]?.sku}
                                {product.isFeatured ? " · Featured" : ""}
                              </span>
                            </span>
                          </Link>
                        </td>

                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              product.status === "ACTIVE"
                                ? "success"
                                : product.status === "DRAFT"
                                  ? "warning"
                                  : "neutral"
                            }
                          >
                            {product.status.toLowerCase()}
                          </Badge>
                        </td>

                        <td className="px-4 py-3 tabular-nums">
                          {product.minPrice === product.maxPrice
                            ? formatMoney(product.minPrice)
                            : `${formatMoney(product.minPrice)}+`}
                        </td>

                        <td className="px-4 py-3 tabular-nums">
                          {!tracked ? (
                            <span className="text-[var(--text-muted)]">Untracked</span>
                          ) : stock <= 0 ? (
                            <span className="text-danger">Out</span>
                          ) : stock <= 5 ? (
                            <span className="text-warning">{stock}</span>
                          ) : (
                            stock
                          )}
                        </td>

                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {product.variants.length}
                        </td>

                        <td className="px-4 py-3 text-[var(--text-secondary)]">
                          {product.categories.map((c) => c.category.name).join(", ") || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </ProductBulkBar>
      )}

      {pageCount > 1 ? (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/admin/products${buildQuery({ q, status, category: categoryId, page: page - 1 })}`}
              className="rounded-[--radius-card] border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Previous
            </Link>
          ) : null}
          <span className="text-[var(--text-secondary)] tabular-nums">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={`/admin/products${buildQuery({ q, status, category: categoryId, page: page + 1 })}`}
              className="rounded-[--radius-card] border border-[var(--border-subtle)] px-3 py-1.5"
            >
              Next
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
