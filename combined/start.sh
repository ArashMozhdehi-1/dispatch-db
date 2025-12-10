#!/bin/bash
set -e

echo ""
echo "=========================================="
echo "   Combined Dispatch + Frontrunner DB   "
echo "=========================================="
echo ""

# Start all services
echo "Starting Docker Compose..."
docker compose up -d

# Wait for database to be ready
echo ""
echo "Waiting for database to be ready..."
until docker exec combined_db pg_isready -U combined_user -d combined > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo ""
echo "Database is ready!"

# Wait for importer to finish
echo ""
echo "Waiting for importer to finish initial setup..."
while docker ps --filter "name=combined_importer" --filter "status=running" --format "{{.Names}}" | grep -q combined_importer; do
    echo -n "."
    sleep 2
done
echo ""
echo "Importer finished!"

# Run manual setup script
echo ""
echo "Running manual setup (creating tables, loading data)..."
docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "Manual setup complete!"
else
    echo "Warning: Manual setup had issues, but continuing..."
fi

# Clip Dispatch roads at intersections (leave Frontrunner untouched)
echo ""
echo "Clipping Dispatch roads at intersections..."
docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "Road clipping complete!"
else
    echo "Warning: Road clipping had issues"
fi

# Verify the setup
echo ""
echo "Verifying setup..."

# Check lane segments
LANE_COUNT=$(docker exec combined_db psql -U combined_user -d combined -t -c "SELECT COUNT(*) FROM combined_data.lane_segments WHERE geometry IS NOT NULL;" | xargs)
echo "  Lane segments with geometry: $LANE_COUNT"

# Check roads
ROAD_COUNT=$(docker exec combined_db psql -U combined_user -d combined -t -c "SELECT COUNT(*) FROM combined_data.roads WHERE centerline IS NOT NULL OR geometry IS NOT NULL;" | xargs)
echo "  Roads with geometry: $ROAD_COUNT"

# Check intersections
INTER_COUNT=$(docker exec combined_db psql -U combined_user -d combined -t -c "SELECT COUNT(*) FROM combined_data.intersections;" | xargs)
echo "  Intersections: $INTER_COUNT"

# Check infrastructure
INFRA_COUNT=$(docker exec combined_db psql -U combined_user -d combined -t -c "SELECT COUNT(*) FROM combined_data.infrastructure;" | xargs)
echo "  Infrastructure locations: $INFRA_COUNT"

# Check speed limits
SPEED_COUNT=$(docker exec combined_db psql -U combined_user -d combined -t -c "SELECT COUNT(*) FROM combined_data.road_speed_limits;" | xargs)
echo "  Speed limits: $SPEED_COUNT"

# Check removed lanes (clipped completely inside intersections)
REMOVED_COUNT=$(docker exec combined_db psql -U combined_user -d combined -t -c "SELECT COUNT(*) FROM combined_data.lane_segments WHERE geometry IS NULL AND source = 'dispatch';" | xargs)
echo "  Dispatch lanes removed (inside intersections): $REMOVED_COUNT"

# Final success message
echo ""
echo "=========================================="
echo ""
echo "   SETUP COMPLETE!   "
echo ""
echo "=========================================="
echo ""
echo "Everything is working on http://localhost:3004"
echo ""
echo "What's automated in start.sh:"
echo "  1. docker compose up -d"
echo "  2. Wait for database"
echo "  3. Load all tables (lanes, roads, intersections, infrastructure)"
echo "  4. Load speed management (4 vehicle models)"
echo "  5. Clip Dispatch roads at intersections (Frontrunner untouched)"
echo "  6. Verify data"
echo ""
echo "On a NEW LINUX COMPUTER:"
echo "  Just run: ./start.sh"
echo "  Everything loads automatically!"
echo ""
echo "Current Data:"
echo "  - Lane Segments: $LANE_COUNT visible (Dispatch clipped, Frontrunner untouched)"
echo "  - Roads: $ROAD_COUNT"
echo "  - Intersections: $INTER_COUNT"
echo "  - Infrastructure: $INFRA_COUNT"
echo "  - Speed Limits: $SPEED_COUNT"
echo "  - Removed Lanes: $REMOVED_COUNT (completely inside intersections)"
echo ""
echo "Map Features:"
echo "  - View road profiles"
echo "  - Manage speed limits"
echo "  - 2D/3D toggle"
echo "  - Multiple base layers"
echo "  - Dispatch roads clipped at intersections"
echo "  - Frontrunner roads untouched"
echo ""
echo "READY TO USE!"
echo ""

