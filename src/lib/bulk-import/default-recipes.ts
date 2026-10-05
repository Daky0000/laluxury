import type { RecipeConfig } from "./schema";

/**
 * Starter Product Recipes. Prices are minor units. These are only defaults:
 * the owner can change any of them, per recipe or per import.
 */
type StarterRecipe = { name: string; description: string; config: Partial<RecipeConfig> };

export const DEFAULT_RECIPES: StarterRecipe[] = [
  {
    name: "Curtain Blind",
    description: "Size × Colour. Price follows size; colour photos swap the gallery.",
    config: {
      options: [
        { name: "Size", values: ["3ft", "4ft", "5ft", "6ft", "7ft"] },
        { name: "Colour", values: ["Sea Blue", "Black", "Black and White", "Wine", "Brown", "Ash"] },
      ],
      pricing: { mode: "BY_OPTION", option: "Size", prices: { "3ft": 10000, "4ft": 12000, "5ft": 16000, "6ft": 18000, "7ft": 20000 } },
      inventory: { mode: "SAME", quantity: 6 },
      imageRole: { mode: "OPTION", option: "Colour" },
      tags: ["curtain blind", "window"],
    },
  },
  {
    name: "Bedsheet",
    description: "Each photo is a design; customers choose a bed size.",
    config: {
      options: [{ name: "Size", values: ["Double", "King", "Superking"] }],
      pricing: { mode: "SAME", price: null },
      inventory: { mode: "SAME", quantity: 0 },
      imageRole: { mode: "SEPARATE_PRODUCTS" },
      tags: ["bedsheet", "bedding"],
    },
  },
  {
    name: "Curtain",
    description: "Customers choose a drop length.",
    config: {
      options: [{ name: "Curtain Drop", values: [] }],
      pricing: { mode: "SAME", price: null },
      inventory: { mode: "SAME", quantity: 0 },
      imageRole: { mode: "SEPARATE_PRODUCTS" },
      tags: ["curtain"],
    },
  },
  {
    name: "Carpet",
    description: "One carpet, one price.",
    config: { options: [], pricing: { mode: "SAME", price: null }, imageRole: { mode: "SAME_PRODUCT" }, tags: ["carpet", "rug"] },
  },
  {
    name: "Throw Pillow",
    description: "Each photo is a design; sold singly.",
    config: { options: [], pricing: { mode: "SAME", price: null }, imageRole: { mode: "SEPARATE_PRODUCTS" }, tags: ["throw pillow", "cushion"] },
  },
  {
    name: "Doormat",
    description: "Each photo is a design; one size.",
    config: { options: [], pricing: { mode: "SAME", price: null }, imageRole: { mode: "SEPARATE_PRODUCTS" }, tags: ["doormat"] },
  },
  {
    name: "Simple Product",
    description: "No options. One version, one price.",
    config: { options: [], pricing: { mode: "SAME", price: null }, imageRole: { mode: "SEPARATE_PRODUCTS" } },
  },
];
