#!/usr/bin/env pwsh
# Publish consolidated_intersections layer to GeoServer

$GEOSERVER_URL = "http://localhost:8080/geoserver"
$WORKSPACE = "infrastructure"
$DATASTORE = "postgres_infrastructure"

$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:geoserver"))
$headers = @{
    Authorization = "Basic $auth"
    "Content-Type" = "application/json"
}

Write-Host "🛣️ Publishing consolidated_intersections layer..." -ForegroundColor Cyan

# Publish consolidated_intersections layer
$layerBody = @{
    featureType = @{
        name = "consolidated_intersections"
        nativeName = "consolidated_intersections"
        title = "Consolidated Intersections"
        abstract = "Consolidated intersection polygons with area calculations"
        srs = "EPSG:4326"
        enabled = $true
        store = @{
            "@class" = "dataStore"
            name = "${WORKSPACE}:${DATASTORE}"
        }
    }
} | ConvertTo-Json -Depth 10

try {
    $response = Invoke-RestMethod -Uri "$GEOSERVER_URL/rest/workspaces/$WORKSPACE/datastores/$DATASTORE/featuretypes" `
        -Method Post -Headers $headers -Body $layerBody -ErrorAction Stop
    Write-Host "✅ consolidated_intersections layer published" -ForegroundColor Green
}
catch {
    if ($_.Exception.Response.StatusCode -eq 409) {
        Write-Host "ℹ️  Layer already exists" -ForegroundColor Blue
    }
    else {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
