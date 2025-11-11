#!/usr/bin/env pwsh
# Initialize GeoServer with workspace, datastore, and layers

$GEOSERVER_URL = "http://localhost:8082/geoserver"
$GEOSERVER_USER = "admin"
$GEOSERVER_PASSWORD = "geoserver"
$WORKSPACE = "frontrunner"
$POSTGRES_HOST = "postgres"
$POSTGRES_PORT = "5432"
$POSTGRES_DATABASE = "infrastructure_db"
$POSTGRES_USER = "infra_user"
$POSTGRES_PASSWORD = "infra_password"

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${GEOSERVER_USER}:${GEOSERVER_PASSWORD}"))
$headers = @{
    Authorization = "Basic $auth"
    "Content-Type" = "application/json"
}

Write-Host "🚀 Initializing GeoServer..." -ForegroundColor Cyan
Write-Host "📍 GeoServer URL: $GEOSERVER_URL" -ForegroundColor Gray
Write-Host "📦 Workspace: $WORKSPACE" -ForegroundColor Gray

# Create Workspace
Write-Host "`n📦 Creating workspace..." -ForegroundColor Yellow
try {
    $workspaceBody = @{
        workspace = @{
            name = $WORKSPACE
        }
    } | ConvertTo-Json
    
    $response = Invoke-RestMethod -Uri "$GEOSERVER_URL/rest/workspaces" -Method Post -Headers $headers -Body $workspaceBody -ErrorAction Stop
    Write-Host "✅ Workspace created" -ForegroundColor Green
}
catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "ℹ️  Workspace already exists" -ForegroundColor Blue
    }
    else {
        Write-Host "❌ Error creating workspace: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Create Datastore
Write-Host "`n💾 Creating PostGIS datastore..." -ForegroundColor Yellow
try {
    $datastoreBody = @{
        dataStore = @{
            name = "infrastructure_db"
            type = "PostGIS"
            enabled = $true
            connectionParameters = @{
                host = $POSTGRES_HOST
                port = $POSTGRES_PORT
                database = $POSTGRES_DATABASE
                user = $POSTGRES_USER
                passwd = $POSTGRES_PASSWORD
                dbtype = "postgis"
                schema = "public"
                "Expose primary keys" = "true"
            }
        }
    } | ConvertTo-Json -Depth 5
    
    $response = Invoke-RestMethod -Uri "$GEOSERVER_URL/rest/workspaces/$WORKSPACE/datastores" -Method Post -Headers $headers -Body $datastoreBody -ErrorAction Stop
    Write-Host "✅ Datastore created" -ForegroundColor Green
}
catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "ℹ️  Datastore already exists" -ForegroundColor Blue
    }
    else {
        Write-Host "❌ Error creating datastore: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Function to publish a layer
function Publish-Layer {
    param(
        [string]$LayerName,
        [string]$Title,
        [string]$Abstract
    )
    
    Write-Host "`n🗺️  Publishing layer: $LayerName..." -ForegroundColor Yellow
    try {
        $featureTypeBody = @{
            featureType = @{
                name = $LayerName
                nativeName = $LayerName
                title = $Title
                abstract = $Abstract
                srs = "EPSG:4326"
                enabled = $true
                store = @{
                    "@class" = "dataStore"
                    name = "${WORKSPACE}:infrastructure_db"
                }
            }
        } | ConvertTo-Json -Depth 5
        
        $response = Invoke-RestMethod -Uri "$GEOSERVER_URL/rest/workspaces/$WORKSPACE/datastores/infrastructure_db/featuretypes" -Method Post -Headers $headers -Body $featureTypeBody -ErrorAction Stop
        Write-Host "✅ Layer $LayerName published" -ForegroundColor Green
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 409) {
            Write-Host "ℹ️  Layer $LayerName already exists" -ForegroundColor Blue
        }
        else {
            Write-Host "❌ Failed to publish ${LayerName}: $($_.Exception.Message)" -ForegroundColor Red
            # Don't throw - continue with other layers
        }
    }
}

# Publish layers
Publish-Layer -LayerName "consolidated_locations" -Title "Consolidated Locations" -Abstract "Mine locations consolidated into polygons (pits, parking, crushers, etc.)"
Publish-Layer -LayerName "consolidated_intersections" -Title "Consolidated Intersections" -Abstract "Road intersections consolidated into polygons"
Publish-Layer -LayerName "coordinate" -Title "Survey Points" -Abstract "General survey coordinate points from coordinate table"

Write-Host "`n✅ GeoServer initialization complete!" -ForegroundColor Green
Write-Host "🌐 WMS: $GEOSERVER_URL/$WORKSPACE/wms" -ForegroundColor Cyan
Write-Host "🌐 WFS: $GEOSERVER_URL/$WORKSPACE/wfs" -ForegroundColor Cyan
