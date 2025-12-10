# Recovery script for when setup fails
# Run this if start.bat fails or you need to re-run setup steps

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "   Recovery / Fix Script" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if database is running
$dbRunning = docker ps --filter "name=combined_db" --format "{{.Names}}" 2>$null
if (-not $dbRunning) {
    Write-Host "Database not running. Starting containers..." -ForegroundColor Yellow
    docker compose up -d
    Start-Sleep -Seconds 5
}

# Wait for database
Write-Host "Waiting for database..." -ForegroundColor Yellow
while ($true) {
    $ready = docker exec combined_db pg_isready -U combined_user -d combined 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host " Ready!" -ForegroundColor Green

# Menu
Write-Host ""
Write-Host "What do you want to fix?" -ForegroundColor Cyan
Write-Host ""
Write-Host "1) Re-run full setup (99_manual_setup.sql)"
Write-Host "2) Re-run road clipping only (98_clip_roads_at_intersections.sql)"
Write-Host "3) Drop and recreate all tables (fresh start)"
Write-Host "4) Verify current data"
Write-Host "5) View database logs"
Write-Host "6) Restart all containers"
Write-Host "7) Complete fresh install (delete everything)"
Write-Host ""
$choice = Read-Host "Enter choice [1-7]"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Re-running full setup..." -ForegroundColor Yellow
        docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql
        Write-Host ""
        Write-Host "Re-running road clipping..." -ForegroundColor Yellow
        docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
        Write-Host ""
        Write-Host "Done! Refresh your browser." -ForegroundColor Green
    }
    "2" {
        Write-Host ""
        Write-Host "Re-running road clipping only..." -ForegroundColor Yellow
        docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
        Write-Host ""
        Write-Host "Done! Refresh your browser." -ForegroundColor Green
    }
    "3" {
        Write-Host ""
        Write-Host "Dropping all combined_data tables..." -ForegroundColor Yellow
        docker exec combined_db psql -U combined_user -d combined -c "DROP SCHEMA IF EXISTS combined_data CASCADE; CREATE SCHEMA combined_data;"
        Write-Host ""
        Write-Host "Re-creating tables..." -ForegroundColor Yellow
        docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql
        Write-Host ""
        Write-Host "Clipping roads..." -ForegroundColor Yellow
        docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
        Write-Host ""
        Write-Host "Done! Refresh your browser." -ForegroundColor Green
    }
    "4" {
        Write-Host ""
        Write-Host "Current database state:" -ForegroundColor Cyan
        Write-Host ""
        docker exec combined_db psql -U combined_user -d combined -c @"
            SELECT 'Lane Segments' as item, COUNT(*) as count 
            FROM combined_data.lane_segments WHERE geometry IS NOT NULL
            UNION ALL
            SELECT 'Roads', COUNT(*) 
            FROM combined_data.roads WHERE centerline IS NOT NULL OR geometry IS NOT NULL
            UNION ALL
            SELECT 'Intersections', COUNT(*) 
            FROM combined_data.intersections
            UNION ALL
            SELECT 'Infrastructure', COUNT(*) 
            FROM combined_data.infrastructure
            UNION ALL
            SELECT 'Speed Limits', COUNT(*) 
            FROM combined_data.road_speed_limits
            UNION ALL
            SELECT 'Removed Lanes', COUNT(*) 
            FROM combined_data.lane_segments WHERE geometry IS NULL AND source = 'dispatch';
"@
        Write-Host ""
    }
    "5" {
        Write-Host ""
        Write-Host "Recent database logs (last 50 lines):" -ForegroundColor Cyan
        Write-Host ""
        docker logs combined_db --tail 50
        Write-Host ""
    }
    "6" {
        Write-Host ""
        Write-Host "Restarting all containers..." -ForegroundColor Yellow
        docker compose restart
        Write-Host ""
        Write-Host "Done! Wait 10 seconds then check http://localhost:3004" -ForegroundColor Green
    }
    "7" {
        Write-Host ""
        $confirm = Read-Host "This will DELETE ALL DATA. Are you sure? (yes/no)"
        if ($confirm -eq "yes") {
            Write-Host ""
            Write-Host "Stopping and removing all containers..." -ForegroundColor Yellow
            docker compose down -v
            Write-Host ""
            Write-Host "Starting fresh..." -ForegroundColor Yellow
            docker compose up -d
            Write-Host ""
            Write-Host "Waiting for database..." -ForegroundColor Yellow
            while ($true) {
                $ready = docker exec combined_db pg_isready -U combined_user -d combined 2>$null
                if ($LASTEXITCODE -eq 0) { break }
                Write-Host -NoNewline "."
                Start-Sleep -Seconds 1
            }
            Write-Host " Ready!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Waiting for importer..." -ForegroundColor Yellow
            while ($true) {
                $running = docker ps --filter "name=combined_importer" --filter "status=running" --format "{{.Names}}" 2>$null
                if (-not $running) { break }
                Write-Host -NoNewline "."
                Start-Sleep -Seconds 2
            }
            Write-Host " Done!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Running setup..." -ForegroundColor Yellow
            docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql
            Write-Host ""
            Write-Host "Clipping roads..." -ForegroundColor Yellow
            docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
            Write-Host ""
            Write-Host "Complete fresh install done!" -ForegroundColor Green
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
        }
    }
    default {
        Write-Host "Invalid choice" -ForegroundColor Red
    }
}

Write-Host ""

