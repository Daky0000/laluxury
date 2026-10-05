/**
 * Entry point for the Bulk Product Add logic tests. Some modules under test
 * import the database client, which needs DATABASE_URL to be *set* — it never
 * connects, because nothing here queries — so a placeholder is supplied first.
 *
 * Run via: npm run test:bulk-import
 */
process.env.DATABASE_URL ||= "postgresql://test:test@127.0.0.1:5432/test";
void import("./bulk-import-tests");
