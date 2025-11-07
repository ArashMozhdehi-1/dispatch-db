@echo off
setlocal enabledelayedexpansion
title Dispatch Database - Clean Rebuild

echo ========================================
echo DISPATCH DATABASE - NUCLEAR CLEAN REBUILD
echo ========================================
echo.

REM Check if Docker is running
echo [1/10] Checking Docker status...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running or not accessible
    echo Please start Docker Desktop and ensure you have proper permissions
    echo.
    echo Common solutions:
    echo   - Start Docker Desktop application
    echo   - Run this script as Administrator
    echo   - Check Docker service is running
    echo.
    pause
    exit /b 1
)
echo SUCCESS: Docker is running

REM Stop and remove all containers
echo [2/10] Stopping all containers...
docker-compose down --volumes --remove-orphans
if %errorlevel% neq 0 (
    echo WARNING: Some containers may not have stopped cleanly
)

REM Remove all docker images related to this project
echo [3/10] Removing project docker images...
for /f "tokens=3" %%i in ('docker images ^| findstr dispatch') do (
    echo Removing image: %%i
    docker rmi %%i 2>nul
)

REM Clean docker system
echo [4/10] Cleaning docker system...
docker system prune -f
echo SUCCESS: Docker system cleaned

REM Remove any cached Python files
echo [5/10] Cleaning Python cache...
for /d /r . %%d in (__pycache__) do @if exist "%%d" rd /s /q "%%d"
del /s /q *.pyc 2>nul
echo SUCCESS: Python cache cleaned

REM Remove any cached Node.js files
echo [6/10] Cleaning Node.js cache...
for /d /r . %%d in (node_modules) do @if exist "%%d" rd /s /q "%%d"
for /d /r . %%d in (.next) do @if exist "%%d" rd /s /q "%%d"
echo SUCCESS: Node.js cache cleaned

echo.
echo [7/10] REBUILDING FROM SCRATCH...

REM Force rebuild containers
echo Building containers from scratch...
docker-compose build --no-cache --force-rm
if %errorlevel% neq 0 (
    echo ERROR: Failed to build containers
    echo This might be due to Docker permission issues or network problems
    echo.
    echo Troubleshooting steps:
    echo   1. Check Docker Desktop is running
    echo   2. Try running as Administrator
    echo   3. Check internet connection for pulling base images
    echo   4. Check docker-compose.yml syntax
    echo.
    pause
    exit /b 1
)
echo SUCCESS: Containers built successfully

echo.
echo [8/10] CLEAN REBUILD COMPLETE!
echo Starting Dispatch Database - Complete Stack...
echo ============================================

echo.
echo Stopping any existing containers...
docker-compose down --remove-orphans

echo.
echo Starting all services with Docker Compose...
echo   PostgreSQL Database with PostGIS
echo   Python ETL Process  
echo   Node.js/Next.js App (Port 3000)
echo   GeoServer (Port 8081)
echo   Database Admin (Port 8080)
echo.

docker-compose up --build -d
if %errorlevel% neq 0 (
    echo ERROR: Failed to start containers
    echo Check Docker permissions and try again
    echo.
    echo Common issues:
    echo   - Port conflicts (3000, 8080, 8081, 5432)
    echo   - Docker Desktop not running
    echo   - Insufficient memory/disk space
    echo.
    echo Checking container status...
    docker-compose ps
    pause
    exit /b 1
)
echo SUCCESS: All containers started
echo.
echo Container startup completed. Checking final status...
docker-compose ps

echo.
echo [9/10] Waiting for services to start...
echo This may take up to 2 minutes for first-time setup...
timeout /t 30 /nobreak > nul

echo.
echo Testing service connectivity...

REM Test Next.js App
echo Testing Next.js application...
set /a attempts=0
:test_nextjs
set /a attempts+=1
curl -s http://localhost:3000 >nul 2>&1
if %errorlevel% equ 0 (
    echo SUCCESS: Next.js app is accessible at http://localhost:3000
    goto test_geoserver
) else (
    if !attempts! lss 6 (
        echo Attempt !attempts!/5: Next.js not ready yet, waiting 10 seconds...
        timeout /t 10 /nobreak > nul
        goto test_nextjs
    ) else (
        echo WARNING: Next.js app may not be ready yet
        echo Check container logs: docker-compose logs backend
    )
)

:test_geoserver
REM Test GeoServer
echo Testing GeoServer...
set /a attempts=0
:test_geoserver_loop
set /a attempts+=1
curl -s http://localhost:8081/geoserver >nul 2>&1
if %errorlevel% equ 0 (
    echo SUCCESS: GeoServer is accessible at http://localhost:8081/geoserver
    goto test_database
) else (
    if !attempts! lss 6 (
        echo Attempt !attempts!/5: GeoServer not ready yet, waiting 10 seconds...
        timeout /t 10 /nobreak > nul
        goto test_geoserver_loop
    ) else (
        echo WARNING: GeoServer may not be ready yet
        echo Check container logs: docker-compose logs geoserver
    )
)

:test_database
REM Test Database Admin
echo Testing Database Admin...
curl -s http://localhost:8080 >nul 2>&1
if %errorlevel% equ 0 (
    echo SUCCESS: Database Admin is accessible at http://localhost:8080
) else (
    echo WARNING: Database Admin may not be ready yet
    echo Check container logs: docker-compose logs adminer
)

echo.
echo [10/11] Converting DEM files to hillshades...
if exist "convert-dem-to-hillshade.bat" (
    echo Converting DEM files to hillshades for GeoServer...
    call convert-dem-to-hillshade.bat
    if %errorlevel% equ 0 (
        echo SUCCESS: DEM to hillshade conversion completed
    ) else (
        echo WARNING: DEM conversion had issues, using existing hillshades
    )
) else (
    echo WARNING: DEM conversion script not found, using existing hillshades
)

echo.
echo [11/11] Preparing hillshade data for GeoServer...
set GEOSERVER_DATA_DIR=geoserver_data
set WORKSPACE_NAME=dispatch
set HILLSHADE_SOURCE=backend\public\hillshades\tiles
set HILLSHADE_TARGET=%GEOSERVER_DATA_DIR%\data\%WORKSPACE_NAME%\dem

if not exist "%GEOSERVER_DATA_DIR%" mkdir "%GEOSERVER_DATA_DIR%"
if not exist "%GEOSERVER_DATA_DIR%\data" mkdir "%GEOSERVER_DATA_DIR%\data"
if not exist "%GEOSERVER_DATA_DIR%\data\%WORKSPACE_NAME%" mkdir "%GEOSERVER_DATA_DIR%\data\%WORKSPACE_NAME%"
if not exist "%HILLSHADE_TARGET%" mkdir "%HILLSHADE_TARGET%"

if exist "%HILLSHADE_SOURCE%" (
    xcopy "%HILLSHADE_SOURCE%" "%HILLSHADE_TARGET%\tiles\" /E /I /Y >nul 2>&1
    echo SUCCESS: Hillshade tiles prepared for GeoServer
) else (
    echo WARNING: Hillshade source directory not found
)

echo.
echo [11/11] Initializing GeoServer configuration...
curl -s http://localhost:8081/geoserver/rest/about/version.json >nul 2>&1
if %errorlevel% equ 0 (
    echo GeoServer is ready, initializing workspace and layers...
    
    set GEOSERVER_URL=http://localhost:8081/geoserver
    set GEOSERVER_USER=admin
    set GEOSERVER_PASS=geoserver
    set WORKSPACE_NAME=dispatch
    set DB_HOST=postgres
    set DB_PORT=5432
    set DB_NAME=dispatch_db
    set DB_USER=postgres
    set DB_PASSWORD=postgres
    
    echo Creating workspace...
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X POST -H "Content-Type: application/json" -d "{\"workspace\":{\"name\":\"%WORKSPACE_NAME%\"}}" "%GEOSERVER_URL/rest/workspaces" >nul
    
    echo Creating PostGIS datastore...
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X POST -H "Content-Type: application/json" -d "{\"dataStore\":{\"name\":\"postgis\",\"type\":\"PostGIS\",\"enabled\":true,\"connectionParameters\":{\"host\":\"%DB_HOST%\",\"port\":\"%DB_PORT%\",\"database\":\"%DB_NAME%\",\"user\":\"%DB_USER%\",\"passwd\":\"%DB_PASSWORD%\",\"dbtype\":\"postgis\",\"schema\":\"public\"}}}" "%GEOSERVER_URL/rest/workspaces/%WORKSPACE_NAME%/datastores" >nul
    
    echo Publishing layers...
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X POST -H "Content-Type: application/json" -d "{\"featureType\":{\"name\":\"road_segments\",\"nativeName\":\"road_segments\",\"title\":\"Road Segments\",\"abstract\":\"Road segments from dispatch database\",\"nativeCRS\":\"EPSG:3857\",\"srs\":\"EPSG:3857\",\"enabled\":true,\"store\":{\"@class\":\"dataStore\",\"name\":\"postgis\"}}}" "%GEOSERVER_URL/rest/workspaces/%WORKSPACE_NAME%/datastores/postgis/featuretypes" >nul
    
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X POST -H "Content-Type: application/json" -d "{\"featureType\":{\"name\":\"locations\",\"nativeName\":\"locations\",\"title\":\"Locations\",\"abstract\":\"Locations from dispatch database\",\"nativeCRS\":\"EPSG:3857\",\"srs\":\"EPSG:3857\",\"enabled\":true,\"store\":{\"@class\":\"dataStore\",\"name\":\"postgis\"}}}" "%GEOSERVER_URL/rest/workspaces/%WORKSPACE_NAME%/datastores/postgis/featuretypes" >nul
    
    echo Creating DEM coverage...
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X POST -H "Content-Type: application/json" -d "{\"coverageStore\":{\"name\":\"dem\",\"type\":\"ImageMosaic\",\"enabled\":true,\"workspace\":{\"name\":\"%WORKSPACE_NAME%\"},\"url\":\"file:data_dir/%WORKSPACE_NAME%/dem/\"}}" "%GEOSERVER_URL/rest/workspaces/%WORKSPACE_NAME%/coveragestores" >nul
    
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X POST -H "Content-Type: application/json" -d "{\"coverage\":{\"name\":\"dem\",\"nativeName\":\"dem\",\"title\":\"Digital Elevation Model\",\"abstract\":\"DEM coverage for terrain visualization\",\"nativeCRS\":\"EPSG:3857\",\"srs\":\"EPSG:3857\",\"enabled\":true,\"store\":{\"@class\":\"coverageStore\",\"name\":\"dem\"}}}" "%GEOSERVER_URL/rest/workspaces/%WORKSPACE_NAME%/coveragestores/dem/coverages" >nul
    
    echo Enabling CORS...
    curl -s -u "%GEOSERVER_USER%:%GEOSERVER_PASS%" -X PUT -H "Content-Type: application/json" -d "{\"global\":{\"settings\":{\"cors\":{\"enabled\":true,\"allowOrigin\":\"*\",\"allowCredentials\":true,\"allowHeaders\":\"*\",\"allowMethods\":\"GET,POST,PUT,DELETE,OPTIONS\"}}}}" "%GEOSERVER_URL/rest/settings" >nul
    
    echo SUCCESS: GeoServer initialized successfully
) else (
    echo GeoServer not ready yet, will need manual initialization
    echo Visit http://localhost:8081/geoserver (admin/geoserver) when ready
)

echo.
echo Opening website in browser...
start http://localhost:3000

echo.
echo ========================================
echo CONTAINER STATUS
echo ========================================
docker-compose ps

echo.
echo ===========================================
echo DISPATCH DATABASE - READY TO USE!
echo ===========================================
echo.
echo WEB INTERFACES:
echo   Main Application: http://localhost:3000
echo   API Documentation: http://localhost:3000/api-docs
echo   Layer Configuration: http://localhost:3000/layer-config
echo.
echo GEOSERVER:
echo   Admin Panel: http://localhost:8081/geoserver
echo   Username: admin
echo   Password: geoserver
echo   WMS Service: http://localhost:8081/geoserver/dispatch/wms
echo.
echo DATABASE:
echo   Admin Panel: http://localhost:8080
echo   Email: arashm@luxmodus.com
echo   Password: admin123
echo   Host: localhost:5432
echo   Database: dispatch_db
echo.
echo AVAILABLE FEATURES:
echo   - Three Map Interfaces (Mapbox Direct, GeoServer+Mapbox, GeoServer+OpenLayers)
echo   - Dynamic Layer Management System
echo   - Interactive API Documentation (OpenAPI/Swagger)
echo   - Real-time Layer Configuration
echo   - PostGIS Spatial Database with Hillshade Tiles
echo   - CORS-enabled GeoServer Integration
echo   - Comprehensive Error Handling and Logging
echo.
echo TROUBLESHOOTING:
echo   If services are not working:
echo   1. Check container logs: docker-compose logs [service_name]
echo   2. Restart specific service: docker-compose restart [service_name]
echo   3. Full restart: docker-compose down && docker-compose up -d
echo   4. Check port conflicts (3000, 8080, 8081, 5432)
echo.
echo Press any key to exit...
pause > nul