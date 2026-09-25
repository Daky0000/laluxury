# LaLuxury — One-Click Localhost Environment Starter
Write-Host "Starting LaLuxury Local Environment..." -ForegroundColor Cyan

# 1. Ensure local PostgreSQL Docker container is running
docker start laluxury-pg 2>$null | Out-Null
docker update --restart unless-stopped laluxury-pg 2>$null | Out-Null

# 2. Apply migrations & check seed
npm run db:migrate
node scripts/seed-once.mjs

# 3. Start Next.js local server on http://localhost:3005
Write-Host "LaLuxury Storefront: http://localhost:3005" -ForegroundColor Green
Write-Host "LaLuxury Pre-Orders: http://localhost:3005/pre-order" -ForegroundColor Green
Write-Host "LaLuxury Admin Console: http://localhost:3005/admin (owner@laluxury.com / ChangeMe!2026)" -ForegroundColor Yellow
npm run dev
