Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Frontrunner Dispatch Database" -ForegroundColor Cyan
Write-Host "  Complete Startup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Checking Docker installation..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/5] Checking Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not available" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/5] Stopping any existing containers..." -ForegroundColor Yellow
docker compose down 2>&1 | Out-Null

Write-Host ""
Write-Host "[4/5] Starting all services..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start Docker Compose" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[5/5] Waiting for services to be ready..." -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes on first run..." -ForegroundColor Gray
Write-Host ""

$maxRetries = 60
$retryCount = 0
$isReady = $false

while ($retryCount -lt $maxRetries -and -not $isReady) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001" -Method Get -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $isReady = $true
            Write-Host "✅ All services are ready!" -ForegroundColor Green
        }
    } catch {
        $retryCount++
        $progress = [math]::Round(($retryCount * 100) / $maxRetries)
        Write-Host "⏳ Waiting for services... [$progress%] ($retryCount/$maxRetries)" -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
}

if ($isReady) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✅ Startup Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Service Status:" -ForegroundColor Cyan
    docker compose ps
    Write-Host ""
    Write-Host "🌐 Opening http://localhost:3001 in browser..." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3001"
    Write-Host ""
    Write-Host "💡 To view logs: docker compose logs -f" -ForegroundColor Gray
    Write-Host "💡 To stop: docker compose down" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "❌ Services did not become ready in time." -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check Docker Desktop is running" -ForegroundColor White
    Write-Host "2. Check logs: docker compose logs" -ForegroundColor White
    Write-Host "3. Check ETL: docker compose logs geometry_etl" -ForegroundColor White
    Write-Host "4. Check Backend: docker compose logs backend" -ForegroundColor White
    Write-Host ""
    Write-Host "You can still try opening http://localhost:3001 manually" -ForegroundColor Yellow
}
Write-Host "  Complete Startup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Checking Docker installation..." -ForegroundColor Yellow
try {
    $dockerVersion = docker --version 2>&1
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop: https://www.docker.com/products/docker-desktop" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[2/5] Checking Docker Compose..." -ForegroundColor Yellow
try {
    $composeVersion = docker compose version 2>&1
    if ($LASTEXITCODE -ne 0) { throw }
    Write-Host "✅ Docker Compose is available" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Compose is not available" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[3/5] Stopping any existing containers..." -ForegroundColor Yellow
docker compose down 2>&1 | Out-Null

Write-Host ""
Write-Host "[4/5] Starting all services..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start Docker Compose" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "[5/5] Waiting for services to be ready..." -ForegroundColor Yellow
Write-Host "This may take 2-3 minutes on first run..." -ForegroundColor Gray
Write-Host ""

$maxRetries = 60
$retryCount = 0
$isReady = $false

while ($retryCount -lt $maxRetries -and -not $isReady) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:3001" -Method Get -TimeoutSec 3 -UseBasicParsing -ErrorAction SilentlyContinue
        if ($response.StatusCode -eq 200) {
            $isReady = $true
            Write-Host "✅ All services are ready!" -ForegroundColor Green
        }
    } catch {
        $retryCount++
        $progress = [math]::Round(($retryCount * 100) / $maxRetries)
        Write-Host "⏳ Waiting for services... [$progress%] ($retryCount/$maxRetries)" -ForegroundColor Yellow
        Start-Sleep -Seconds 3
    }
}

if ($isReady) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✅ Startup Complete!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "📊 Service Status:" -ForegroundColor Cyan
    docker compose ps
    Write-Host ""
    Write-Host "🌐 Opening http://localhost:3001 in browser..." -ForegroundColor Cyan
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3001"
    Write-Host ""
    Write-Host "💡 To view logs: docker compose logs -f" -ForegroundColor Gray
    Write-Host "💡 To stop: docker compose down" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "❌ Services did not become ready in time." -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Check Docker Desktop is running" -ForegroundColor White
    Write-Host "2. Check logs: docker compose logs" -ForegroundColor White
    Write-Host "3. Check ETL: docker compose logs geometry_etl" -ForegroundColor White
    Write-Host "4. Check Backend: docker compose logs backend" -ForegroundColor White
    Write-Host ""
    Write-Host "You can still try opening http://localhost:3001 manually" -ForegroundColor Yellow
}