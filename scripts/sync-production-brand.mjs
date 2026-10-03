import pg from "pg";
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  await client.connect();

  const res = await client.query('SELECT value FROM "Setting" WHERE key = \'store\';');
  if (res.rows.length > 0) {
    const store = res.rows[0].value;
    console.log("Current 'store' setting keys:", Object.keys(store));
    console.log("Current storeName:", store.storeName);
    console.log("Current supportEmail:", store.supportEmail);
    console.log("Current heroImageUrl:", store.heroImageUrl);

    store.storeName = "Noble Enclave";
    store.supportEmail = "hello@nobleenclave.com";
    store.heroImageUrl = "/catalog/hero-bedroom.webp";
    if (store.tagline) {
      store.tagline = store.tagline.replace(/LaLuxury/g, "Noble Enclave");
    }

    await client.query('UPDATE "Setting" SET value = $1::jsonb, "updatedAt" = NOW() WHERE key = \'store\';', [JSON.stringify(store)]);
    console.log("Successfully updated 'store' setting object in database!");
  } else {
    console.log("No 'store' row found in Setting table!");
  }
}

main().catch(console.error).finally(() => client.end());
