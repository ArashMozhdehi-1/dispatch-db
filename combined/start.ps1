#!/usr/bin/env pwsh
# Combined Dispatch DB Startup Script
# This script starts all services and ensures the database is fully loaded

Write-Host "Starting Combined Dispatch DB..." -ForegroundColor Cyan

# Start Docker Compose
Write-Host ""
Write-Host "Starting Docker containers..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to start Docker containers" -ForegroundColor Red
    exit 1
}

# Wait for the database to be ready
Write-Host ""
Write-Host "Waiting for database to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0

while ($attempt -lt $maxAttempts) {
    $result = docker exec combined_db pg_isready -U combined_user -d combined 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Database is ready!" -ForegroundColor Green
        break
    }
    $attempt++
    Write-Host "  Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if ($attempt -eq $maxAttempts) {
    Write-Host "Database failed to start" -ForegroundColor Red
    exit 1
}

# Wait for importer to finish
Write-Host ""
Write-Host "Waiting for data import to complete..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$importerRunning = $true
while ($importerRunning) {
    $containerState = docker inspect combined_importer --format='{{.State.Status}}' 2>$null
    if ($containerState -eq "exited") {
        $importerRunning = $false
        Write-Host "Initial import completed!" -ForegroundColor Green
    } else {
        Write-Host "  Importer still running..." -ForegroundColor Gray
        Start-Sleep -Seconds 3
    }
}

# Run the manual setup script
Write-Host ""
Write-Host "Loading speed management tables..." -ForegroundColor Yellow
docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "Speed management tables loaded!" -ForegroundColor Green
} else {
    Write-Host "Warning: Speed management setup had issues (this might be OK)" -ForegroundColor Yellow
}

# Verify the setup
Write-Host ""
Write-Host "Verifying database..." -ForegroundColor Yellow
$roadCount = docker exec combined_db psql -U combined_user -d combined -t -c 'SELECT COUNT(*) FROM combined_data.roads;' 2>$null
$speedCount = docker exec combined_db psql -U combined_user -d combined -t -c 'SELECT COUNT(*) FROM combined_data.road_speed_limits;' 2>$null

if ($roadCount -and $speedCount) {
    Write-Host "  - Roads: $($roadCount.Trim())" -ForegroundColor Green
    Write-Host "  - Speed Limits: $($speedCount.Trim())" -ForegroundColor Green
} else {
    Write-Host "  Warning: Could not verify table counts" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== All done! ===" -ForegroundColor Cyan
Write-Host "UI: http://localhost:3004" -ForegroundColor Cyan
Write-Host "GeoServer: http://localhost:8080/geoserver" -ForegroundColor Cyan
Write-Host ""
Write-Host "To stop: docker compose down" -ForegroundColor Gray
