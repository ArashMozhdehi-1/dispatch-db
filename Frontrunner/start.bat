@echo off
echo ========================================
echo   Frontrunner Dispatch Database
echo   Complete Startup Script
echo ========================================
echo.

echo [1/5] Checking Docker installation...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed or not in PATH
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo ✅ Docker is installed

echo.
echo [2/5] Checking Docker Compose...
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not available
    pause
    exit /b 1
)
echo ✅ Docker Compose is available

echo.
echo [3/5] Stopping any existing containers...
docker compose down >nul 2>&1

echo.
echo [4/5] Starting all services...
docker compose up -d

if %errorlevel% neq 0 (
    echo ❌ Failed to start Docker Compose
    pause
    exit /b 1
)

echo.
echo [5/5] Waiting for services to be ready...
echo This may take 2-3 minutes on first run...
echo.

set maxRetries=60
set retryCount=0
set isReady=0

:checkLoop
if %retryCount% geq %maxRetries% goto :notReady

curl -s -f http://localhost:3001 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ All services are ready!
    set isReady=1
    goto :ready
)

set /a retryCount+=1
set /a progress=(retryCount * 100) / maxRetries
echo ⏳ Waiting for services... [%progress%%] (%retryCount%/%maxRetries%)
timeout /t 3 /nobreak >nul
goto :checkLoop

:ready
if %isReady% equ 1 (
    echo.
    echo ========================================
    echo   ✅ Startup Complete!
    echo ========================================
    echo.
    echo 📊 Service Status:
    docker compose ps
    echo.
    echo 🌐 Opening http://localhost:3001 in browser...
    timeout /t 2 /nobreak >nul
    start http://localhost:3001
    echo.
    echo 💡 To view logs: docker compose logs -f
    echo 💡 To stop: docker compose down
) else (
    goto :notReady
)

goto :end

:notReady
echo.
echo ❌ Services did not become ready in time.
echo.
echo 📋 Troubleshooting:
echo 1. Check Docker Desktop is running
echo 2. Check logs: docker compose logs
echo 3. Check ETL: docker compose logs geometry_etl
echo 4. Check Backend: docker compose logs backend
echo.
echo You can still try opening http://localhost:3001 manually

:end
echo.
pause
echo   Frontrunner Dispatch Database
echo   Complete Startup Script
echo ========================================
echo.

echo [1/5] Checking Docker installation...
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed or not in PATH
    echo Please install Docker Desktop: https://www.docker.com/products/docker-desktop
    pause
    exit /b 1
)
echo ✅ Docker is installed

echo.
echo [2/5] Checking Docker Compose...
docker compose version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker Compose is not available
    pause
    exit /b 1
)
echo ✅ Docker Compose is available

echo.
echo [3/5] Stopping any existing containers...
docker compose down >nul 2>&1

echo.
echo [4/5] Starting all services...
docker compose up -d

if %errorlevel% neq 0 (
    echo ❌ Failed to start Docker Compose
    pause
    exit /b 1
)

echo.
echo [5/5] Waiting for services to be ready...
echo This may take 2-3 minutes on first run...
echo.

set maxRetries=60
set retryCount=0
set isReady=0

:checkLoop
if %retryCount% geq %maxRetries% goto :notReady

curl -s -f http://localhost:3001 >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ All services are ready!
    set isReady=1
    goto :ready
)

set /a retryCount+=1
set /a progress=(retryCount * 100) / maxRetries
echo ⏳ Waiting for services... [%progress%%] (%retryCount%/%maxRetries%)
timeout /t 3 /nobreak >nul
goto :checkLoop

:ready
if %isReady% equ 1 (
    echo.
    echo ========================================
    echo   ✅ Startup Complete!
    echo ========================================
    echo.
    echo 📊 Service Status:
    docker compose ps
    echo.
    echo 🌐 Opening http://localhost:3001 in browser...
    timeout /t 2 /nobreak >nul
    start http://localhost:3001
    echo.
    echo 💡 To view logs: docker compose logs -f
    echo 💡 To stop: docker compose down
) else (
    goto :notReady
)

goto :end

:notReady
echo.
echo ❌ Services did not become ready in time.
echo.
echo 📋 Troubleshooting:
echo 1. Check Docker Desktop is running
echo 2. Check logs: docker compose logs
echo 3. Check ETL: docker compose logs geometry_etl
echo 4. Check Backend: docker compose logs backend
echo.
echo You can still try opening http://localhost:3001 manually

:end
echo.
pause