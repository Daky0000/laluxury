ALTER TABLE "Product" ADD COLUMN "minimumOrderQuantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD CONSTRAINT "Product_minimumOrderQuantity_positive" CHECK ("minimumOrderQuantity" >= 1);
