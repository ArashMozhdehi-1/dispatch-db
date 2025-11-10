#!/bin/bash

echo "========================================"
echo "  Frontrunner Dispatch Database"
echo "  Complete Startup Script"
echo "========================================"
echo ""

echo "[1/5] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    echo "Please install Docker: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo "✅ Docker is installed"

echo ""
echo "[2/5] Checking Docker Compose..."
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available"
    exit 1
fi
echo "✅ Docker Compose is available"

echo ""
echo "[3/5] Stopping any existing containers..."
docker compose down > /dev/null 2>&1

echo ""
echo "[4/5] Starting all services..."
docker compose up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start Docker Compose"
    exit 1
fi

echo ""
echo "[5/5] Waiting for services to be ready..."
echo "This may take 2-3 minutes on first run..."
echo ""

max_retries=60
retry_count=0
is_ready=false

while [ $retry_count -lt $max_retries ] && [ "$is_ready" = false ]; do
    if curl -s -f http://localhost:3001 > /dev/null 2>&1; then
        is_ready=true
        echo "✅ All services are ready!"
    else
        retry_count=$((retry_count + 1))
        progress=$((retry_count * 100 / max_retries))
        echo "⏳ Waiting for services... [$progress%] ($retry_count/$max_retries)"
        sleep 3
    fi
done

if [ "$is_ready" = true ]; then
    echo ""
    echo "========================================"
    echo "  ✅ Startup Complete!"
    echo "========================================"
    echo ""
    echo "📊 Service Status:"
    docker compose ps
    echo ""
    echo "🌐 Opening http://localhost:3001 in browser..."
    sleep 2
    if command -v xdg-open > /dev/null; then
        xdg-open http://localhost:3001
    elif command -v open > /dev/null; then
        open http://localhost:3001
    else
        echo "Please open http://localhost:3001 in your browser"
    fi
    echo ""
    echo "💡 To view logs: docker compose logs -f"
    echo "💡 To stop: docker compose down"
else
    echo ""
    echo "❌ Services did not become ready in time."
    echo ""
    echo "📋 Troubleshooting:"
    echo "1. Check Docker Desktop is running"
    echo "2. Check logs: docker compose logs"
    echo "3. Check ETL: docker compose logs geometry_etl"
    echo "4. Check Backend: docker compose logs backend"
    echo ""
    echo "You can still try opening http://localhost:3001 manually"
fi
echo "========================================"
echo "  Frontrunner Dispatch Database"
echo "  Complete Startup Script"
echo "========================================"
echo ""

echo "[1/5] Checking Docker installation..."
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    echo "Please install Docker: https://www.docker.com/products/docker-desktop"
    exit 1
fi
echo "✅ Docker is installed"

echo ""
echo "[2/5] Checking Docker Compose..."
if ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available"
    exit 1
fi
echo "✅ Docker Compose is available"

echo ""
echo "[3/5] Stopping any existing containers..."
docker compose down > /dev/null 2>&1

echo ""
echo "[4/5] Starting all services..."
docker compose up -d

if [ $? -ne 0 ]; then
    echo "❌ Failed to start Docker Compose"
    exit 1
fi

echo ""
echo "[5/5] Waiting for services to be ready..."
echo "This may take 2-3 minutes on first run..."
echo ""

max_retries=60
retry_count=0
is_ready=false

while [ $retry_count -lt $max_retries ] && [ "$is_ready" = false ]; do
    if curl -s -f http://localhost:3001 > /dev/null 2>&1; then
        is_ready=true
        echo "✅ All services are ready!"
    else
        retry_count=$((retry_count + 1))
        progress=$((retry_count * 100 / max_retries))
        echo "⏳ Waiting for services... [$progress%] ($retry_count/$max_retries)"
        sleep 3
    fi
done

if [ "$is_ready" = true ]; then
    echo ""
    echo "========================================"
    echo "  ✅ Startup Complete!"
    echo "========================================"
    echo ""
    echo "📊 Service Status:"
    docker compose ps
    echo ""
    echo "🌐 Opening http://localhost:3001 in browser..."
    sleep 2
    if command -v xdg-open > /dev/null; then
        xdg-open http://localhost:3001
    elif command -v open > /dev/null; then
        open http://localhost:3001
    else
        echo "Please open http://localhost:3001 in your browser"
    fi
    echo ""
    echo "💡 To view logs: docker compose logs -f"
    echo "💡 To stop: docker compose down"
else
    echo ""
    echo "❌ Services did not become ready in time."
    echo ""
    echo "📋 Troubleshooting:"
    echo "1. Check Docker Desktop is running"
    echo "2. Check logs: docker compose logs"
    echo "3. Check ETL: docker compose logs geometry_etl"
    echo "4. Check Backend: docker compose logs backend"
    echo ""
    echo "You can still try opening http://localhost:3001 manually"
fi