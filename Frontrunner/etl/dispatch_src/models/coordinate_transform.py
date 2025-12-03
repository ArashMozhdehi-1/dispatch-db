def transform_coordinates(x: float, y: float) -> tuple:
    # Skip 0,0 coordinates as they would transform to South Pole
    if x == 0 and y == 0:
        return None, None
        
    try:
        import pyproj
        utm_crs = "+proj=utm +zone=55 +south +ellps=WGS84 +datum=WGS84 +units=m +no_defs"
        geographic_crs = "+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs"
        transformer = pyproj.Transformer.from_crs(utm_crs, geographic_crs, always_xy=True)
        lon, lat = transformer.transform(x, y)
        
        # Validate coordinates are within Australia bounds
        if not (-44 <= lat <= -10 and 113 <= lon <= 154):
            return None, None
            
        return lat, lon
    except ImportError:
        lat = (y - 7000000) / 111000 + -25.0
        lon = (x - 500000) / 111000 + 140.0
        
        # Validate coordinates are within Australia bounds
        if not (-44 <= lat <= -10 and 113 <= lon <= 154):
            return None, None
            
        return lat, lon

def transform_coordinates_batch(coordinates: list) -> list:
    return [transform_coordinates(x, y) for x, y in coordinates]
