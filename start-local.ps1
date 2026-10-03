# LaLuxury — One-Click Localhost Environment Starter
Write-Host "Starting LaLuxury Local Environment..." -ForegroundColor Cyan

# 1. Ensure Docker Desktop and local PostgreSQL container are running
$dockerRunning = $false
try {
    $null = docker info 2>&1
    if ($LASTEXITCODE -eq 0) { $dockerRunning = $true }
} catch {}

if (-not $dockerRunning) {
    Write-Host "Docker daemon is not responding. Starting Docker Desktop..." -ForegroundColor Yellow
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    }
    Write-Host "Waiting for Docker to initialize..." -NoNewline
    $timeout = 60
    while ($timeout -gt 0) {
        Start-Sleep -Seconds 2
        $null = docker info 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host " Ready!" -ForegroundColor Green
            $dockerRunning = $true
            break
        }
        Write-Host "." -NoNewline
        $timeout -= 2
    }
    if (-not $dockerRunning) {
        Write-Host "`nDocker Desktop is taking longer than expected. Please open Docker Desktop manually." -ForegroundColor Red
    }
}

$containerExists = docker ps -a --filter "name=^laluxury-pg$" --format "{{.Names}}" 2>$null
if ($containerExists -eq "laluxury-pg") {
    docker start laluxury-pg 2>$null | Out-Null
    docker update --restart unless-stopped laluxury-pg 2>$null | Out-Null
    Write-Host "Database container 'laluxury-pg' is running." -ForegroundColor Green
} else {
    Write-Host "Creating laluxury-pg container..." -ForegroundColor Cyan
    docker run -d --name laluxury-pg -e POSTGRES_USER=laluxury -e POSTGRES_PASSWORD=laluxury -e POSTGRES_DB=laluxurys -p 55432:5432 --restart unless-stopped postgres:16-alpine
}

# 2. Apply migrations & check seed
npm run db:migrate
node scripts/seed-once.mjs

# 3. Start Next.js local server on http://localhost:3005
Write-Host "Nobel Enclave Storefront: http://localhost:3005" -ForegroundColor Green
Write-Host "Nobel Enclave Pre-Orders: http://localhost:3005/pre-order" -ForegroundColor Green
Write-Host "Admin Console: http://localhost:3005/admin (owner@nobleenclave.com / ChangeMe!2026)" -ForegroundColor Yellow
npm run dev
