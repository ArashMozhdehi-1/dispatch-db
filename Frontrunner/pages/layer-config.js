import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LayerConfig() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}

  const [layers, setLayers] = useState([]);
  const [selectedLayer, setSelectedLayer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);

  useEffect(() => {
    loadLayers();
  }, []);

  const loadLayers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/layers?action=list');
      const data = await response.json();
      setLayers(data.layers || []);
    } catch (error) {
      console.error('Error loading layers:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateLayerConfig = async (layerName, config) => {
    try {
      const response = await fetch('/api/layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          name: layerName,
          config
        })
      });

      if (response.ok) {
        setEditingConfig(null);
        loadLayers();
      }
    } catch (error) {
      console.error('Error updating layer config:', error);
    }
  };

  const addNewLayer = async (config) => {
    try {
      const response = await fetch('/api/layers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          name: config.name,
          config
        })
      });

      if (response.ok) {
        loadLayers();
      }
    } catch (error) {
      console.error('Error adding layer:', error);
    }
  };

  const getLayerIcon = (type) => {
    switch (type) {
      case 'point': return '📍';
      case 'line': return '🛣️';
      case 'polygon': return '🏢';
      default: return '🗺️';
    }
  };

  return (
    <>
      <Head>
        <title>Layer Configuration - Dispatch Database</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      <div style={{
        minHeight: '100vh',
        backgroundColor: '#1a1a1a',
        color: 'white',
        padding: '20px'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <h1 style={{
            fontSize: '32px',
            fontWeight: 'bold',
            marginBottom: '30px',
            textAlign: 'center',
            background: 'linear-gradient(45deg, #10B981, #3B82F6)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Dynamic Layer Configuration
          </h1>

          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '20px',
            marginBottom: '30px'
          }}>
            {/* Layer List */}
            <div style={{
              backgroundColor: 'rgba(30, 30, 30, 0.8)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid rgba(120, 120, 120, 0.3)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px'
              }}>
                <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: 0 }}>
                  Available Layers
                </h2>
                <button
                  onClick={() => setEditingConfig({ isNew: true })}
                  style={{
                    backgroundColor: '#10B981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '8px 16px',
                    fontSize: '14px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  + Add Layer
                </button>
              </div>

              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px' }}>
                  Loading layers...
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {layers.map(layer => (
                    <div
                      key={layer.name}
                      onClick={() => setSelectedLayer(layer)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px',
                        backgroundColor: selectedLayer?.name === layer.name 
                          ? 'rgba(59, 130, 246, 0.2)' 
                          : 'rgba(60, 60, 60, 0.6)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        border: selectedLayer?.name === layer.name 
                          ? '1px solid #3B82F6' 
                          : '1px solid transparent',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      <span style={{ fontSize: '20px', marginRight: '12px' }}>
                        {getLayerIcon(layer.config.type)}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '600', fontSize: '16px' }}>
                          {layer.config.title}
                        </div>
                        <div style={{ color: '#999', fontSize: '14px' }}>
                          {layer.name} • {layer.geometryType}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingConfig(layer.config);
                        }}
                        style={{
                          backgroundColor: 'transparent',
                          color: '#3B82F6',
                          border: '1px solid #3B82F6',
                          borderRadius: '4px',
                          padding: '4px 8px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Layer Details */}
            <div style={{
              backgroundColor: 'rgba(30, 30, 30, 0.8)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid rgba(120, 120, 120, 0.3)'
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
                Layer Details
              </h2>

              {selectedLayer ? (
                <div>
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>
                      {selectedLayer.config.title}
                    </h3>
                    <p style={{ color: '#999', marginBottom: '16px' }}>
                      Table: {selectedLayer.name} • Type: {selectedLayer.geometryType}
                    </p>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>Style Configuration</h4>
                    <pre style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}>
                      {JSON.stringify(selectedLayer.config.style, null, 2)}
                    </pre>
                  </div>

                  <div style={{ marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>Filter Configuration</h4>
                    <pre style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}>
                      {JSON.stringify(selectedLayer.config.filter, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '16px', marginBottom: '8px' }}>Popup Configuration</h4>
                    <pre style={{
                      backgroundColor: 'rgba(0, 0, 0, 0.3)',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}>
                      {JSON.stringify(selectedLayer.config.popup, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px',
                  color: '#666'
                }}>
                  Select a layer to view its configuration
                </div>
              )}
            </div>
          </div>

          {/* Configuration Editor */}
          {editingConfig && (
            <div style={{
              backgroundColor: 'rgba(30, 30, 30, 0.9)',
              borderRadius: '12px',
              padding: '20px',
              border: '1px solid rgba(120, 120, 120, 0.3)',
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '80%',
              maxWidth: '600px',
              maxHeight: '80vh',
              overflowY: 'auto',
              zIndex: 1000
            }}>
              <h3 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
                {editingConfig.isNew ? 'Add New Layer' : 'Edit Layer Configuration'}
              </h3>

              <LayerConfigForm
                config={editingConfig}
                onSave={(config) => {
                  if (editingConfig.isNew) {
                    addNewLayer(config);
                  } else {
                    updateLayerConfig(selectedLayer.name, config);
                  }
                }}
                onCancel={() => setEditingConfig(null)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function LayerConfigForm({ config, onSave, onCancel }) {
  const [formData, setFormData] = useState({
    name: config.name || '',
    title: config.title || '',
    type: config.type || 'point',
    style: JSON.stringify(config.style || {}, null, 2),
    filter: JSON.stringify(config.filter || {}, null, 2),
    popup: JSON.stringify(config.popup || {}, null, 2)
  });

  const handleSave = () => {
    try {
      const parsedConfig = {
        name: formData.name,
        title: formData.title,
        type: formData.type,
        style: JSON.parse(formData.style),
        filter: JSON.parse(formData.filter),
        popup: JSON.parse(formData.popup)
      };
      onSave(parsedConfig);
    } catch (error) {
      alert('Invalid JSON in configuration fields');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
            Layer Name (Table Name)
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #555',
              backgroundColor: '#333',
              color: 'white'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
            Display Title
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #555',
              backgroundColor: '#333',
              color: 'white'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
            Geometry Type
          </label>
          <select
            value={formData.type}
            onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value }))}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #555',
              backgroundColor: '#333',
              color: 'white'
            }}
          >
            <option value="point">Point</option>
            <option value="line">Line</option>
            <option value="polygon">Polygon</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
            Style Configuration (JSON)
          </label>
          <textarea
            value={formData.style}
            onChange={(e) => setFormData(prev => ({ ...prev, style: e.target.value }))}
            rows={6}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #555',
              backgroundColor: '#333',
              color: 'white',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
            Filter Configuration (JSON)
          </label>
          <textarea
            value={formData.filter}
            onChange={(e) => setFormData(prev => ({ ...prev, filter: e.target.value }))}
            rows={6}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #555',
              backgroundColor: '#333',
              color: 'white',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '4px', fontSize: '14px' }}>
            Popup Configuration (JSON)
          </label>
          <textarea
            value={formData.popup}
            onChange={(e) => setFormData(prev => ({ ...prev, popup: e.target.value }))}
            rows={4}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: '1px solid #555',
              backgroundColor: '#333',
              color: 'white',
              fontFamily: 'monospace',
              fontSize: '12px'
            }}
          />
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '12px',
        marginTop: '20px',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={onCancel}
          style={{
            backgroundColor: 'transparent',
            color: '#999',
            border: '1px solid #555',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          style={{
            backgroundColor: '#10B981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '14px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
}

          Save Configuration
        </button>
      </div>
    </div>
  );
}
