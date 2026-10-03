import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("=== Syncing Production Brand to Noble Enclave ===");

  // 1. Settings
  const settingsToUpsert = [
    { key: "storeName", value: "Noble Enclave" },
    { key: "supportEmail", value: "hello@nobleenclave.com" },
    { key: "heroImageUrl", value: "https://pub-1a69b11766fc4280aadbd18a8e923f34.r2.dev/catalog/hero-bedroom.webp" },
  ];

  for (const s of settingsToUpsert) {
    await prisma.setting.upsert({
      where: { key: s.key },
      create: { key: s.key, value: s.value },
      update: { value: s.value },
    });
    console.log(`Setting '${s.key}' set to '${s.value}'`);
  }

  // Check all settings for remaining laluxury occurrences
  const allSettings = await prisma.setting.findMany();
  for (const s of allSettings) {
    if (s.value.toLowerCase().includes("laluxury")) {
      const updatedValue = s.value
        .replace(/LaLuxury/g, "Noble Enclave")
        .replace(/laluxury/g, "nobleenclave")
        .replace(/laluxurys\.com/g, "nobleenclave.com");
      await prisma.setting.update({
        where: { key: s.key },
        data: { value: updatedValue },
      });
      console.log(`Updated setting '${s.key}' value from '${s.value}' to '${updatedValue}'`);
    }
  }

  // 2. Products brand update
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { brand: { contains: "LaLuxury", mode: "insensitive" } },
        { brand: { contains: "laluxury", mode: "insensitive" } },
      ],
    },
  });
  console.log(`Found ${products.length} products with old brand.`);
  for (const p of products) {
    let newBrand = "Noble Enclave";
    if (p.brand?.toLowerCase().includes("atelier")) {
      newBrand = "Noble Enclave Atelier";
    }
    await prisma.product.update({
      where: { id: p.id },
      data: { brand: newBrand },
    });
    console.log(`Updated product '${p.title}' brand to '${newBrand}'`);
  }

  // 3. User emails update if any
  const users = await prisma.user.findMany({
    where: {
      email: { contains: "laluxury", mode: "insensitive" },
    },
  });
  console.log(`Found ${users.length} users with old email domain.`);
  for (const u of users) {
    if (u.email) {
      const newEmail = u.email.replace(/laluxurys?\.com/g, "nobleenclave.com").replace(/laluxury\.test/g, "nobleenclave.test");
      await prisma.user.update({
        where: { id: u.id },
        data: { email: newEmail },
      });
      console.log(`Updated user email from '${u.email}' to '${newEmail}'`);
    }
  }

  console.log("=== Brand sync completed successfully ===");
}

main()
  .catch((e) => {
    console.error("Error during brand sync:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
