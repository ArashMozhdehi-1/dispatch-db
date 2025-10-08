@echo off
echo Starting Dispatch Database - Complete Stack...
echo ============================================

echo.
echo Stopping any existing containers...
docker-compose down --remove-orphans

echo.
echo Starting all services with Docker Compose...
echo   PostgreSQL Database
echo   Python ETL Process  
echo   Node.js/Next.js App (Port 3000)
echo   Database Admin
echo.

docker-compose up --build -d

echo.
echo  Waiting for services to start...
timeout /t 10 /nobreak > nul

echo.
echo All services are now running:
echo   Website & API: http://localhost:3000
echo   GraphQL API: http://localhost:3000/api/graphql
echo   Database Admin: http://localhost:8080
echo.
echo Opening website in browser...
start http://localhost:3000

echo.
echo Container Status:
docker-compose ps

echo.
echo Press any key to continue...
pause > nul