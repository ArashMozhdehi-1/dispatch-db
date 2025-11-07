#!/bin/bash

echo "NUCLEAR CLEAN REBUILD - DESTROYING EVERYTHING"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running or not accessible"
    echo "Please start Docker and ensure you have proper permissions"
    exit 1
fi

# Stop and remove all containers
echo "Stopping all containers..."
docker-compose down --volumes --remove-orphans

# Remove all docker images related to this project
echo "Removing docker images..."
docker rmi $(docker images | grep dispatch | awk '{print $3}') 2>/dev/null || true

# Clean docker system
echo "Cleaning docker system..."
docker system prune -f

# Remove any cached Python files
echo "Cleaning Python cache..."
find . -name "*.pyc" -delete 2>/dev/null || true
find . -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# Remove any cached Node.js files
echo "Cleaning Node.js cache..."
find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find . -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true

echo "REBUILDING FROM SCRATCH..."

# Force rebuild containers
echo "Building containers from scratch..."
if ! docker-compose build --no-cache --force-rm; then
    echo "ERROR: Failed to build containers"
    echo "This might be due to Docker permission issues"
    echo "Try running: sudo chmod 666 /var/run/docker.sock"
    echo "Or add your user to the docker group: sudo usermod -aG docker $USER"
    exit 1
fi

echo "CLEAN REBUILD COMPLETE!"
echo "Starting Dispatch Database - Complete Stack..."
echo "==========================================="

echo ""
echo "Stopping any existing containers..."
docker-compose down --remove-orphans

echo ""
echo "Starting all services with Docker Compose..."
echo "  - PostgreSQL Database with PostGIS"
echo "  - Python ETL Process"
echo "  - Node.js/Next.js App (Port 3000)"
echo "  - GeoServer (Port 8081)"
echo "  - Database Admin (Port 8080)"
echo ""

if ! docker-compose up --build -d; then
    echo "ERROR: Failed to start containers"
    echo "Check Docker permissions and try again"
    exit 1
fi

echo ""
echo "Waiting for services to start..."
sleep 15

echo ""
echo "All services are now running:"
echo "  - Website & API: http://localhost:3000"
echo "  - GraphQL API: http://localhost:3000/api/graphql"
echo "  - API Documentation: http://localhost:3000/api-docs"
echo "  - GeoServer: http://localhost:8081/geoserver"
echo "  - Database Admin: http://localhost:8080"
echo ""

# Test if services are actually running
echo "Testing service connectivity..."
if curl -s http://localhost:3000 > /dev/null; then
    echo "SUCCESS: Website is accessible at http://localhost:3000"
else
    echo "WARNING: Website may not be ready yet, check container logs"
fi

# Test GeoServer
echo "Testing GeoServer connectivity..."
if curl -s http://localhost:8081/geoserver > /dev/null; then
    echo "SUCCESS: GeoServer is accessible at http://localhost:8081/geoserver"
else
    echo "WARNING: GeoServer may not be ready yet, check container logs"
fi

# Initialize GeoServer if it's ready
echo "Initializing GeoServer configuration..."
if curl -s http://localhost:8081/geoserver/rest/about/version.json > /dev/null; then
    echo "GeoServer is ready, initializing workspace and layers..."
    if [ -f "./geoserver-init.sh" ]; then
        chmod +x ./geoserver-init.sh
        ./geoserver-init.sh
    else
        echo "GeoServer initialization script not found, manual setup required"
        echo "Visit http://localhost:8081/geoserver (admin/geoserver) to configure"
    fi
else
    echo "GeoServer not ready yet, will need manual initialization"
    echo "Visit http://localhost:8081/geoserver (admin/geoserver) when ready"
fi

echo ""
echo "Opening website in browser..."
if command -v xdg-open > /dev/null; then
    xdg-open http://localhost:3000
elif command -v open > /dev/null; then
    open http://localhost:3000
fi

echo ""
echo "Container Status:"
docker-compose ps

echo ""
echo "==========================================="
echo "DISPATCH DATABASE - READY TO USE!"
echo "==========================================="
echo ""
echo "🌐 Web Interface:"
echo "  - Main Map: http://localhost:3000"
echo "  - API Docs: http://localhost:3000/api-docs"
echo "  - Layer Config: http://localhost:3000/layer-config"
echo ""
echo "🗺️ GeoServer:"
echo "  - Admin Panel: http://localhost:8081/geoserver"
echo "  - Username: admin"
echo "  - Password: geoserver"
echo ""
echo "🗄️ Database:"
echo "  - Admin Panel: http://localhost:8080"
echo "  - Email: arashm@luxmodus.com"
echo "  - Password: admin123"
echo ""
echo "📚 Features Available:"
echo "  ✅ Dynamic Layer Management"
echo "  ✅ Mapbox + GeoServer Toggle"
echo "  ✅ Interactive API Documentation"
echo "  ✅ Real-time Layer Configuration"
echo "  ✅ PostGIS Spatial Database"
echo ""
echo "Press any key to continue..."
read -n 1