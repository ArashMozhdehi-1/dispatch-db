#!/bin/bash
# Recovery script for when setup fails
# Run this if start.sh fails or you need to re-run setup steps

set -e

echo ""
echo "=========================================="
echo "   Recovery / Fix Script"
echo "=========================================="
echo ""

# Check if database is running
if ! docker ps | grep -q combined_db; then
    echo "Database not running. Starting containers..."
    docker compose up -d
    sleep 5
fi

# Wait for database
echo "Waiting for database..."
until docker exec combined_db pg_isready -U combined_user -d combined > /dev/null 2>&1; do
    echo -n "."
    sleep 1
done
echo " Ready!"

# Menu
echo ""
echo "What do you want to fix?"
echo ""
echo "1) Re-run full setup (99_manual_setup.sql)"
echo "2) Re-run road clipping only (98_clip_roads_at_intersections.sql)"
echo "3) Drop and recreate all tables (fresh start)"
echo "4) Verify current data"
echo "5) View database logs"
echo "6) Restart all containers"
echo "7) Complete fresh install (delete everything)"
echo ""
read -p "Enter choice [1-7]: " choice

case $choice in
    1)
        echo ""
        echo "Re-running full setup..."
        docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql
        echo ""
        echo "Re-running road clipping..."
        docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
        echo ""
        echo " Done! Refresh your browser."
        ;;
    2)
        echo ""
        echo "Re-running road clipping only..."
        docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
        echo ""
        echo " Done! Refresh your browser."
        ;;
    3)
        echo ""
        echo "Dropping all combined_data tables..."
        docker exec combined_db psql -U combined_user -d combined -c "DROP SCHEMA IF EXISTS combined_data CASCADE; CREATE SCHEMA combined_data;"
        echo ""
        echo "Re-creating tables..."
        docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql
        echo ""
        echo "Clipping roads..."
        docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
        echo ""
        echo " Done! Refresh your browser."
        ;;
    4)
        echo ""
        echo "Current database state:"
        echo ""
        docker exec combined_db psql -U combined_user -d combined -c "
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
        "
        echo ""
        ;;
    5)
        echo ""
        echo "Recent database logs (last 50 lines):"
        echo ""
        docker logs combined_db --tail 50
        echo ""
        ;;
    6)
        echo ""
        echo "Restarting all containers..."
        docker compose restart
        echo ""
        echo " Done! Wait 10 seconds then check http://localhost:3004"
        ;;
    7)
        echo ""
        read -p "  This will DELETE ALL DATA. Are you sure? (yes/no): " confirm
        if [ "$confirm" = "yes" ]; then
            echo ""
            echo "Stopping and removing all containers..."
            docker compose down -v
            echo ""
            echo "Starting fresh..."
            docker compose up -d
            echo ""
            echo "Waiting for database..."
            until docker exec combined_db pg_isready -U combined_user -d combined > /dev/null 2>&1; do
                echo -n "."
                sleep 1
            done
            echo " Ready!"
            echo ""
            echo "Waiting for importer..."
            while docker ps --filter "name=combined_importer" --filter "status=running" --format "{{.Names}}" | grep -q combined_importer; do
                echo -n "."
                sleep 2
            done
            echo " Done!"
            echo ""
            echo "Running setup..."
            docker exec combined_db psql -U combined_user -d combined -f /sql/99_manual_setup.sql
            echo ""
            echo "Clipping roads..."
            docker exec combined_db psql -U combined_user -d combined -f /sql/98_clip_roads_at_intersections.sql
            echo ""
            echo " Complete fresh install done!"
        else
            echo "Cancelled."
        fi
        ;;
    *)
        echo "Invalid choice"
        ;;
esac

echo ""

