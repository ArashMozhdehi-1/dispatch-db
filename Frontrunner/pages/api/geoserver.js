export default async function handler(req, res) {
  const { method, query } = req;
  const { action } = query;

  try {
    switch (action) {
      case 'layers':
        return await getLayers(req, res);
      case 'capabilities':
        return await getCapabilities(req, res);
      case 'feature-info':
        return await getFeatureInfo(req, res);
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error) {
    console.error('GeoServer API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Get available layers from GeoServer REST API (no direct DB access)
async function getLayers(req, res) {
  const geoserverUrl = process.env.GEOSERVER_URL || 'http://geoserver:8080/geoserver';
  const workspace = process.env.GEOSERVER_WORKSPACE || 'frontrunner';
  const geoserverUser = process.env.GEOSERVER_USER || 'admin';
  const geoserverPassword = process.env.GEOSERVER_PASSWORD || 'geoserver';
  
  try {
    // Get layers from GeoServer REST API
    const auth = Buffer.from(`${geoserverUser}:${geoserverPassword}`).toString('base64');
    const layersUrl = `${geoserverUrl}/rest/workspaces/${workspace}/layers.json`;
    
    const response = await fetch(layersUrl, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`GeoServer REST API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const layers = (data.layers?.layer || []).map(layer => ({
      name: layer.name,
      workspace: workspace,
      href: layer.href,
      wmsUrl: `${geoserverUrl}/${workspace}/wms`,
      wfsUrl: `${geoserverUrl}/${workspace}/wfs`
    }));

    return res.status(200).json({ layers });
  } catch (error) {
    console.error('Error fetching layers from GeoServer:', error);
    return res.status(500).json({ error: error.message });
  }
}

// Get GeoServer capabilities
async function getCapabilities(req, res) {
  const { service = 'WMS' } = req.query;
  const geoserverUrl = process.env.GEOSERVER_URL || 'http://geoserver:8080/geoserver';
  const workspace = process.env.GEOSERVER_WORKSPACE || 'frontrunner';
  
  const capabilities = {
    wms: `${geoserverUrl}/${workspace}/wms?service=WMS&version=1.1.0&request=GetCapabilities`,
    wfs: `${geoserverUrl}/${workspace}/wfs?service=WFS&version=1.0.0&request=GetCapabilities`,
    workspace: workspace,
    baseUrl: geoserverUrl
  };

  return res.status(200).json(capabilities);
}

// Get feature information for a specific point (via GeoServer WMS)
async function getFeatureInfo(req, res) {
  const { layer, bbox, x, y, width = 768, height = 768 } = req.query;
  
  if (!layer || !bbox || !x || !y) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const geoserverUrl = process.env.GEOSERVER_URL || 'http://geoserver:8080/geoserver';
  const workspace = process.env.GEOSERVER_WORKSPACE || 'frontrunner';
  
  const featureInfoUrl = `${geoserverUrl}/${workspace}/wms?` +
    `service=WMS&` +
    `version=1.1.0&` +
    `request=GetFeatureInfo&` +
    `layers=${workspace}:${layer}&` +
    `query_layers=${workspace}:${layer}&` +
    `bbox=${bbox}&` +
    `width=${width}&` +
    `height=${height}&` +
    `x=${x}&` +
    `y=${y}&` +
    `srs=EPSG:4326&` +
    `info_format=application/json`;

  try {
    const response = await fetch(featureInfoUrl);
    if (!response.ok) {
      throw new Error(`GeoServer WMS error: ${response.status}`);
    }
    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('GetFeatureInfo error:', error);
    return res.status(500).json({ error: 'Failed to fetch feature info' });
  }
}

