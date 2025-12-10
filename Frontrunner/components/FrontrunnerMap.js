import React, { useState, useEffect, useRef } from 'react';

const FrontrunnerMap = ({ onMapReady }) => {
  const mapContainer = useRef(null);
  const cesiumViewerRef = useRef(null);
  const entitiesRef = useRef([]);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [consolidatedData, setConsolidatedData] = useState(null);
  const [intersectionsData, setIntersectionsData] = useState(null);
  const [surveyPathsData, setSurveyPathsData] = useState(null);
  const [coursesData, setCoursesData] = useState(null);
  const [travelsData, setTravelsData] = useState(null);
  const [roadMarkingsData, setRoadMarkingsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [visibleCategories, setVisibleCategories] = useState(new Set());
  const [showSurveyPaths, setShowSurveyPaths] = useState(true);
  const [showCourses, setShowCourses] = useState(true);
  const [showTravels, setShowTravels] = useState(true);

  // Fetch Frontrunner data
  const fetchData = async () => {
    try {
      setLoading(true);
      console.log('🏗️ Fetching Frontrunner data...');
      
      // Fetch all Frontrunner API endpoints
      const [
        locationsResponse,
        intersectionsResponse,
        surveyPathsResponse,
        coursesResponse,
        travelsResponse,
        roadMarkingsResponse
      ] = await Promise.all([
        fetch('/api/consolidated-locations'),
        fetch('/api/consolidated-intersections'),
        fetch('/api/survey-paths'),
        fetch('/api/courses'),
        fetch('/api/travels'),
        fetch('/api/road-markings')
      ]);

      if (locationsResponse.ok) {
        const result = await locationsResponse.json();
        console.log(`📍 Loaded ${result.total_locations} locations`);
        setConsolidatedData(result);
      }

      if (intersectionsResponse.ok) {
        const result = await intersectionsResponse.json();
        console.log(`🚧 Loaded ${result.total_intersections} intersections`);
        setIntersectionsData(result);
      }

      if (surveyPathsResponse.ok) {
        const result = await surveyPathsResponse.json();
        console.log(`📊 Loaded ${result.total_survey_paths} survey paths`);
        setSurveyPathsData(result);
      }

      if (coursesResponse.ok) {
        const result = await coursesResponse.json();
        console.log(`🛣️ Loaded ${result.total_courses} courses`);
        setCoursesData(result);
      }

      if (travelsResponse.ok) {
        const result = await travelsResponse.json();
        console.log(`🚚 Loaded ${result.total_travels} travels`);
        setTravelsData(result);
      }

      if (roadMarkingsResponse.ok) {
        const result = await roadMarkingsResponse.json();
        console.log(`🎨 Loaded ${result.total_road_markings} road markings`);
        setRoadMarkingsData(result);
      }

    } catch (error) {
      console.error('❌ Error fetching Frontrunner data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Initialize Cesium viewer
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || mapLoaded) return;

    const initializeCesium = async () => {
      try {
        console.log('🗺️ Initializing Frontrunner Map with Cesium...');
        
        window.Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlOTQxZDQ5Zi00NmI1LTQwOGItYmVjYi0zMTI3NTQ2ZDNiYTQiLCJpZCI6MjUzNzM3LCJpYXQiOjE3MzE4NDE5NDd9.oEJnH2EuD-bX-EzYXCrL_QHAQ6Xj6fB6JYGE4yoqTW4';

        const creditsDiv = document.getElementById('cesium-credits');

        const viewer = new window.Cesium.Viewer(mapContainer.current, {
          terrain: window.Cesium.Terrain.fromWorldTerrain(),
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          timeline: false,
          animation: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          creditContainer: creditsDiv || undefined,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity
        });

        cesiumViewerRef.current = viewer;
        setMapLoaded(true);
        
        if (onMapReady) {
          onMapReady(viewer, entitiesRef.current);
        }

        console.log('✅ Frontrunner Map initialized');
        
        // Fetch data after map is ready
        await fetchData();

      } catch (error) {
        console.error('❌ Error initializing Cesium:', error);
      }
    };

    if (window.Cesium) {
      initializeCesium();
    }

    return () => {
      if (cesiumViewerRef.current) {
        cesiumViewerRef.current.destroy();
      }
    };
  }, [isClient]);

  // Add data to Cesium when loaded
  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && consolidatedData) {
      addConsolidatedDataToCesium(cesiumViewerRef.current);
    }
  }, [mapLoaded, consolidatedData]);

  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && intersectionsData) {
      addIntersectionsToCesium(cesiumViewerRef.current);
    }
  }, [mapLoaded, intersectionsData]);

  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && surveyPathsData && showSurveyPaths) {
      addSurveyPathsToCesium(cesiumViewerRef.current);
    }
  }, [mapLoaded, surveyPathsData, showSurveyPaths]);

  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && coursesData && showCourses) {
      addCoursesToCesium(cesiumViewerRef.current);
    }
  }, [mapLoaded, coursesData, showCourses]);

  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && travelsData && showTravels) {
      addTravelsToCesium(cesiumViewerRef.current);
    }
  }, [mapLoaded, travelsData, showTravels]);

  useEffect(() => {
    if (mapLoaded && cesiumViewerRef.current && roadMarkingsData) {
      addRoadMarkingsToCesium(cesiumViewerRef.current);
    }
  }, [mapLoaded, roadMarkingsData]);

  // Rendering functions (simplified versions)
  const addConsolidatedDataToCesium = (cesiumViewer) => {
    console.log('📍 Adding consolidated locations to Cesium...');
    // Implementation here (simplified)
  };

  const addIntersectionsToCesium = (cesiumViewer) => {
    console.log('🚧 Adding intersections to Cesium...');
    // Implementation here (simplified)
  };

  const addSurveyPathsToCesium = (cesiumViewer) => {
    console.log('📊 Adding survey paths to Cesium...');
    // Implementation here (simplified)
  };

  const addCoursesToCesium = (cesiumViewer) => {
    console.log('🛣️ Adding courses to Cesium...');
    // Implementation here (simplified)
  };

  const addTravelsToCesium = (cesiumViewer) => {
    console.log('🚚 Adding travels to Cesium...');
    // Implementation here (simplified)
  };

  const addRoadMarkingsToCesium = (cesiumViewer) => {
    console.log('🎨 Adding road markings to Cesium...');
    // Implementation here (simplified)
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      <div
        id="cesium-credits"
        style={{
          position: 'absolute',
          bottom: '8px',
          left: '8px',
          fontSize: '11px',
          color: '#aaa',
          opacity: 0.7,
          pointerEvents: 'none',
          zIndex: 10
        }}
      />
      {loading && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          padding: '20px',
          borderRadius: '8px',
          zIndex: 1000
        }}>
          🏗️ Loading Frontrunner Data...
        </div>
      )}
    </div>
  );
};

export default FrontrunnerMap;


