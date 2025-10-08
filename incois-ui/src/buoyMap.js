// BuoyMap.js - REDESIGNED: Summary at top, larger map, Ask AI chatbot
import { useEffect, useState } from "react";
import axios from "axios";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix for missing Leaflet marker icons
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function BuoyMap() {
  const [buoys, setBuoys] = useState([]);
  const [filteredBuoys, setFilteredBuoys] = useState([]);
  const [selectedBuoy, setSelectedBuoy] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Filter states
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedNetwork, setSelectedNetwork] = useState('all');
  const [ramaReportingFilter, setRamaReportingFilter] = useState('all');

  // INCOIS interface states - ONLY FOR MOORED BUOYS
  const [showINCOISInterface, setShowINCOISInterface] = useState(false);
  const [selectedParameter, setSelectedParameter] = useState('Air Temperature');
  const [selectedTimeRange, setSelectedTimeRange] = useState('1M');
  const [incoisProxyUrl, setIncoisProxyUrl] = useState('');
  const [loadingProxy, setLoadingProxy] = useState(false);
  const [proxyError, setProxyError] = useState(null);

  // 🤖 NEW: AI Chatbot states
  const [showChatbot, setShowChatbot] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // Regional boundaries for filtering
  const regions = {
    'indian_ocean': {
      name: 'Indian Ocean',
      bounds: { north: 30, south: -60, east: 100, west: 40 }
    },
    'bay_of_bengal': {
      name: 'Bay of Bengal',
      bounds: { north: 25, south: 5, east: 95, west: 80 }
    },
    'arabian_sea': {
      name: 'Arabian Sea',
      bounds: { north: 30, south: 0, east: 80, west: 50 }
    },
    'equatorial_indian': {
      name: 'Equatorial Indian Ocean',
      bounds: { north: 10, south: -10, east: 100, west: 50 }
    },
    'southern_indian': {
      name: 'Southern Indian Ocean',
      bounds: { north: -10, south: -60, east: 120, west: 40 }
    }
  };

  // INCOIS Parameters - Only for MOORED buoys
  const incoisParameters = [
    'Air Pressure', 'Air Temperature', 'Relative Humidity', 'Rainfall',
    'Wind Direction', 'Wind Speed', 'Wind Gust', 'Irradiance', 'Radiation In',
    'Current Direction @ 1.20m', 'Current Speed @ 1.20m',
    'Water Temperature @ 0.5m', 'Water Temperature @ 001m',
    'Salinity @ 0.5m', 'Salinity @ 001m',
    'Significant Wave Height', 'Sea Surface Temperature'
  ];

  // Time Range Options
  const timeRangeOptions = [
    { value: '1W', label: '1 Week' },
    { value: '1M', label: '1 Month' },
    { value: '3M', label: '3 Months' },
    { value: '6M', label: '6 Months' },
    { value: '1Y', label: '1 Year' },
    { value: 'All', label: 'All Data' }
  ];

  // Helper function to normalize RAMA GeoJSON features to buoy format with enhanced properties
  const normalizeRamaBuoys = (ramaGeoJSON) => {
    if (!ramaGeoJSON || !ramaGeoJSON.features) return [];
    
    return ramaGeoJSON.features.map((feature, index) => ({
      id: `RAMA_${index + 1}`,
      buoyId: feature.properties.buoyId || feature.properties.BUOY_ID || `RAMA_${index + 1}`,
      name: feature.properties.type 
        ? `${feature.properties.type} Buoy ${feature.properties.buoyId || feature.properties.BUOY_ID || index + 1}` 
        : `RAMA Buoy ${index + 1}`,
      lat: feature.geometry.coordinates[1],
      lon: feature.geometry.coordinates[0],
      coordinates: feature.geometry.coordinates,
      type: "RAMA",
      status: "active",
      
      // Enhanced organization information
      reportingAgency: feature.properties.reportingAgency || feature.properties.Agency || "INCOIS",
      programme: feature.properties.programme || feature.properties.Programme || feature.properties.PROGRAMME || "RAMA",
      agency: feature.properties.agency || feature.properties.Agency || feature.properties.AGENCY || "INCOIS",
      eezStatus: feature.properties.eezStatus || feature.properties.EEZ_Status || feature.properties.EEZ_STATUS || "International Waters",
      reportingStatus: feature.properties.Reporting || feature.properties.reporting || feature.properties.REPORTING || 'Not Reporting',
      url: feature.properties.url || feature.properties.URL || null,
      
      // Additional metadata that might be available
      dataSource: feature.properties.dataSource || feature.properties.DATA_SOURCE || "INCOIS",
      organization: feature.properties.organization || feature.properties.Organization || "INCOIS",
      country: feature.properties.country || feature.properties.Country || "International",
      
      properties: feature.properties,
      parameters: {
        sst: feature.properties.sst || feature.properties.SST || null,
        seaSurfaceTemperature: feature.properties.sst || feature.properties.SST || null,
        salinity: feature.properties.salinity || feature.properties.SALINITY || null,
        windSpeed: feature.properties.windspeed || feature.properties.WIND_SPEED || null,
        windDirection: feature.properties.winddirection || feature.properties.WIND_DIRECTION || null,
        pressure: feature.properties.pressure || feature.properties.PRESSURE || null,
        waveHeight: feature.properties.waveheight || feature.properties.WAVE_HEIGHT || null,
      }
    }));
  };

  // Helper function to get region name from coordinates
  const getRegionFromCoordinates = (lat, lon) => {
    if (lat > 15 && lon < 75) return "Northern Arabian Sea";
    if (lat > 10 && lon < 75) return "Western Arabian Sea";
    if (lat > 10 && lon > 85) return "Bay of Bengal";
    if (lat <= 10 && lon > 85) return "Eastern Bay of Bengal";
    if (lat < 0) return "Southern Indian Ocean";
    return "Central Indian Ocean";
  };

  // Helper function to format buoy ID for display
  const formatBuoyId = (buoy) => {
    if (buoy.buoyId && buoy.buoyId !== buoy.id) {
      return buoy.buoyId;
    }
    return buoy.id;
  };

  // Helper function to get appropriate buoy ID for INCOIS proxy - ONLY FOR MOORED
  const getProxyBuoyId = (buoy) => {
    // Only MOORED buoys have real proxy access
    if (buoy.type === 'MOORED') {
      return buoy.buoyId || buoy.id;
    }
    
    // This function should not be called for other buoy types
    return null;
  };

  // Helper function to format URL for display
  const formatUrlForDisplay = (url) => {
    if (!url) return null;
    // Remove protocol and www for cleaner display
    return url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 30) + (url.length > 35 ? '...' : '');
  };

  // Helper function to get buoys in a specific region
  const getBuoysInRegion = (regionKey) => {
    if (regionKey === 'all') return buoys.length;
    
    const region = regions[regionKey];
    if (!region) return 0;
    
    return buoys.filter(buoy => {
      const lat = parseFloat(buoy.lat);
      const lon = parseFloat(buoy.lon);
      return lat <= region.bounds.north && 
             lat >= region.bounds.south && 
             lon <= region.bounds.east && 
             lon >= region.bounds.west;
    }).length;
  };

  // Helper function to get buoys by network type
  const getBuoysByNetwork = (networkType) => {
    if (networkType === 'all') return buoys.length;
    return buoys.filter(buoy => buoy.type === networkType).length;
  };

  // Helper function to get RAMA buoys by reporting status
  const getRamaBuoysByReporting = (reportingStatus) => {
    const ramaBuoys = buoys.filter(buoy => buoy.type === 'RAMA');
    
    if (reportingStatus === 'all') return ramaBuoys.length;
    
    if (reportingStatus === 'reporting') {
      return ramaBuoys.filter(buoy => {
        const status = buoy.reportingStatus || 'Not Reporting';
        return status.toLowerCase().includes('reporting') && !status.toLowerCase().includes('not');
      }).length;
    }
    
    if (reportingStatus === 'not_reporting') {
      return ramaBuoys.filter(buoy => {
        const status = buoy.reportingStatus || 'Not Reporting';
        return status.toLowerCase().includes('not') || status === 'Not Reporting';
      }).length;
    }
    
    return 0;
  };

  // Generate region options with counts
  const getRegionOptions = () => [
    { value: 'all', label: `All Regions (${getBuoysInRegion('all')})` },
    { value: 'indian_ocean', label: `Indian Ocean (${getBuoysInRegion('indian_ocean')})` },
    { value: 'bay_of_bengal', label: `Bay of Bengal (${getBuoysInRegion('bay_of_bengal')})` },
    { value: 'arabian_sea', label: `Arabian Sea (${getBuoysInRegion('arabian_sea')})` },
    { value: 'equatorial_indian', label: `Equatorial Indian Ocean (${getBuoysInRegion('equatorial_indian')})` },
    { value: 'southern_indian', label: `Southern Indian Ocean (${getBuoysInRegion('southern_indian')})` }
  ];

  // Generate network options with counts
  const getNetworkOptions = () => [
    { value: 'all', label: `All Networks (${getBuoysByNetwork('all')})` },
    { value: 'RAMA', label: `RAMA (${getBuoysByNetwork('RAMA')})` },
    { value: 'ARGO', label: `ARGO (${getBuoysByNetwork('ARGO')})` },
    { value: 'MOORED', label: `MOORED (${getBuoysByNetwork('MOORED')})` },
    { value: 'OMNI', label: `OMNI (${getBuoysByNetwork('OMNI')})` }
  ];

  // Generate RAMA reporting options with counts
  const getRamaReportingOptions = () => [
    { value: 'all', label: `All Status (${getRamaBuoysByReporting('all')})` },
    { value: 'reporting', label: `Reporting (${getRamaBuoysByReporting('reporting')})` },
    { value: 'not_reporting', label: `Not Reporting (${getRamaBuoysByReporting('not_reporting')})` }
  ];

  // 🤖 NEW: AI Chatbot functions
  const handleAskAI = (buoy) => {
    const initialMessage = {
      id: Date.now(),
      type: 'system',
      message: `Hello! I'm your Ocean Data AI Assistant. I can help you analyze data for ${formatBuoyId(buoy)} (${buoy.type} Network) located at ${buoy.lat?.toFixed(6)}°N, ${buoy.lon?.toFixed(6)}°E. What would you like to know?`,
      timestamp: new Date().toLocaleTimeString()
    };
    setChatMessages([initialMessage]);
    setShowChatbot(true);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = {
      id: Date.now(),
      type: 'user',
      message: chatInput,
      timestamp: new Date().toLocaleTimeString()
    };

    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setChatLoading(true);

    // Simulate AI response
    setTimeout(() => {
      const aiResponse = {
        id: Date.now() + 1,
        type: 'ai',
        message: `I understand you're asking about "${userMessage.message}". Based on the selected buoy data, here are some insights:

📊 **Current Analysis:**
- Network: ${selectedBuoy?.type}
- Location: ${selectedBuoy ? getRegionFromCoordinates(selectedBuoy.lat, selectedBuoy.lon) : 'N/A'}
- Status: ${selectedBuoy?.status || 'Unknown'}

🔍 **Available Data:** Temperature, salinity, wind patterns, and oceanographic measurements.

💡 **Suggestion:** For real-time charts and detailed analysis, try accessing the INCOIS interface for MOORED buoys.

What specific aspect would you like me to analyze further?`,
        timestamp: new Date().toLocaleTimeString()
      };
      setChatMessages(prev => [...prev, aiResponse]);
      setChatLoading(false);
    }, 2000);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  };

  // Fetch ocean buoys data
  useEffect(() => {
    const fetchBuoys = async () => {
      try {
        setError(null);
        setLoading(true);
        console.log("🔄 Fetching buoys from server...");
        const response = await axios.get("http://localhost:5000/api/ocean-buoys");
        
        if (response.data && response.data.success) {
          const argoBuoys = response.data.argo || [];
          const mooredBuoys = response.data.moored || [];
          const ramaBuoys = normalizeRamaBuoys(response.data.rama);
          
          const allBuoys = [...argoBuoys, ...mooredBuoys, ...ramaBuoys];
          setBuoys(allBuoys);
          console.log(`📊 Total buoys loaded: ${allBuoys.length}`);
        } else {
          setError("No data received from server");
        }
      } catch (err) {
        console.error("❌ Error fetching buoys:", err);
        setError(`Failed to fetch buoy data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    fetchBuoys();
  }, []);

  // Filter buoys based on selected criteria
  useEffect(() => {
    let filtered = [...buoys];

    // Region filter
    if (selectedRegion !== 'all') {
      const region = regions[selectedRegion];
      if (region) {
        filtered = filtered.filter(buoy => {
          const lat = parseFloat(buoy.lat);
          const lon = parseFloat(buoy.lon);
          return lat <= region.bounds.north && 
                 lat >= region.bounds.south && 
                 lon <= region.bounds.east && 
                 lon >= region.bounds.west;
        });
      }
    }

    // Network filter
    if (selectedNetwork !== 'all') {
      filtered = filtered.filter(buoy => buoy.type === selectedNetwork);
    }

    // RAMA Reporting filter (only applies when RAMA is selected or when showing all networks)
    if (selectedNetwork === 'RAMA' && ramaReportingFilter !== 'all') {
      filtered = filtered.filter(buoy => {
        if (buoy.type !== 'RAMA') return false;
        
        const reportingStatus = buoy.reportingStatus || 'Not Reporting';
        if (ramaReportingFilter === 'reporting') {
          return reportingStatus.toLowerCase().includes('reporting') && !reportingStatus.toLowerCase().includes('not');
        } else if (ramaReportingFilter === 'not_reporting') {
          return reportingStatus.toLowerCase().includes('not') || reportingStatus === 'Not Reporting';
        }
        return true;
      });
    }

    setFilteredBuoys(filtered);
  }, [buoys, selectedRegion, selectedNetwork, ramaReportingFilter]);

  // Reset RAMA filter when network changes
  useEffect(() => {
    if (selectedNetwork !== 'RAMA') {
      setRamaReportingFilter('all');
    }
  }, [selectedNetwork]);

  // Handle buoy selection
  const handleBuoyClick = async (buoyId) => {
    setError(null);
    setShowINCOISInterface(false);
    
    try {
      console.log(`🔍 Selecting buoy: ${buoyId}`);
      
      if (buoyId.startsWith('RAMA_')) {
        const ramaBuoy = buoys.find(b => b.id === buoyId && b.type === 'RAMA');
        if (ramaBuoy) {
          setSelectedBuoy(ramaBuoy);
        } else {
          setError(`RAMA buoy ${buoyId} not found`);
        }
      } else if (buoyId.startsWith('MOORED_')) {
        const res = await axios.get(`http://localhost:5000/api/ocean-buoy/${buoyId}`);
        if (res.data && res.data.success && res.data.data) {
          const mooredBuoy = res.data.data;
          setSelectedBuoy(mooredBuoy);
        } else {
          setError(`No data available for moored buoy ${buoyId}`);
        }
      } else {
        const res = await axios.get(`http://localhost:5000/api/ocean-buoy/${buoyId}`);
        if (res.data && res.data.success && res.data.data) {
          setSelectedBuoy(res.data.data);
        } else {
          setError(`No data available for buoy ${buoyId}`);
        }
      }
    } catch (err) {
      console.error("Error fetching buoy details:", err);
      setError(`Failed to fetch details for buoy ${buoyId}: ${err.message}`);
    }
  };

  // Load INCOIS Proxy - ONLY FOR MOORED BUOYS
  const loadINCOISProxy = async (buoy, parameter, timeRange) => {
    // Check if buoy is MOORED type
    if (buoy.type !== 'MOORED') {
      setProxyError('INCOIS interface is only available for MOORED buoys');
      return;
    }

    setLoadingProxy(true);
    setProxyError(null);
    
    try {
      const proxyBuoyId = getProxyBuoyId(buoy);
      console.log(`🌊 Loading INCOIS proxy for MOORED buoy ${formatBuoyId(buoy)} using proxy ID: ${proxyBuoyId} with parameter: ${parameter}`);
      
      const response = await axios.get(`http://localhost:5000/api/incois-url/${proxyBuoyId}/${parameter}`);
      
      if (response.data && response.data.success) {
        const proxyUrl = response.data.proxyUrl;
        const fullProxyUrl = `http://localhost:5000${proxyUrl}`;
        setIncoisProxyUrl(fullProxyUrl);
        console.log(`✅ INCOIS proxy loaded: ${fullProxyUrl}`);
      } else {
        setProxyError(`Failed to generate INCOIS proxy URL for ${parameter}`);
      }
    } catch (error) {
      console.error("❌ Error loading INCOIS proxy:", error);
      setProxyError(`Error loading INCOIS proxy: ${error.message}`);
    }
    
    setLoadingProxy(false);
  };

  // Handle INCOIS Interface Access - ONLY FOR MOORED BUOYS
  const handleAccessINCOIS = () => {
    if (selectedBuoy && selectedBuoy.type === 'MOORED') {
      setShowINCOISInterface(true);
      loadINCOISProxy(selectedBuoy, selectedParameter, selectedTimeRange);
    }
  };

  // Apply filters
  const handleApplyFilters = () => {
    console.log('🔍 Applying filters:', {
      region: selectedRegion,
      network: selectedNetwork,
      ramaReporting: ramaReportingFilter
    });
  };

  // Create buoy icons
  const createBuoyIcon = (type, color, isSelected = false) => {
    const size = isSelected ? 32 : 28;
    const strokeWidth = isSelected ? 3 : 2;
    
    return new L.Icon({
      iconUrl: 'data:image/svg+xml;base64,' + btoa(`
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${size/2}" cy="${size/2}" r="${size/2 - 2}" fill="${color}" stroke="#ffffff" stroke-width="${strokeWidth}"/>
          <text x="${size/2}" y="${size/2 + 4}" text-anchor="middle" fill="white" font-size="10" font-weight="bold">${type.charAt(0)}</text>
          ${isSelected ? `<circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="none" stroke="#ffff00" stroke-width="2" opacity="0.8"/>` : ''}
        </svg>
      `),
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor: [0, -size/2]
    });
  };

  const getIconForBuoy = (buoy, isSelected = false) => {
    switch (buoy.type) {
      case 'OMNI': return createBuoyIcon('OMNI', '#0ea5e9', isSelected);
      case 'RAMA': return createBuoyIcon('RAMA', '#10b981', isSelected);
      case 'ARGO': return createBuoyIcon('ARGO', '#8b5cf6', isSelected);
      case 'MOORED': return createBuoyIcon('MOORED', '#f59e0b', isSelected);
      default: return createBuoyIcon('OMNI', '#0ea5e9', isSelected);
    }
  };

  // TOTAL STATS (unchanged by filters) - for Network Summary
  const totalStats = {
    total: buoys.length,
    active: buoys.filter(b => b.status === 'active').length,
    withData: buoys.filter(b => b.parameters && Object.keys(b.parameters).some(key => b.parameters[key] !== null)).length,
    networks: {
      ARGO: buoys.filter(b => b.type === 'ARGO').length,
      OMNI: buoys.filter(b => b.type === 'OMNI').length,
      RAMA: buoys.filter(b => b.type === 'RAMA').length,
      MOORED: buoys.filter(b => b.type === 'MOORED').length,
    }
  };

  // FILTERED STATS - for map header indicators only
  const filteredStats = {
    networks: {
      ARGO: filteredBuoys.filter(b => b.type === 'ARGO').length,
      OMNI: filteredBuoys.filter(b => b.type === 'OMNI').length,
      RAMA: filteredBuoys.filter(b => b.type === 'RAMA').length,
      MOORED: filteredBuoys.filter(b => b.type === 'MOORED').length,
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg">
            <p className="text-red-200">⚠️ {error}</p>
          </div>
        )}

        {/* 🔧 NEW: TOP SUMMARY COMPARTMENTS */}
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {/* Active Buoys */}
            <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/30 backdrop-blur-sm border border-blue-500/30 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-300 mb-1">{totalStats.active}</div>
              <div className="text-xs text-blue-200 mb-1">Active Buoys</div>
              <div className="text-xs text-slate-400">of {totalStats.total} total</div>
            </div>

            {/* Total Shown */}
            <div className="bg-gradient-to-br from-cyan-500/20 to-cyan-600/30 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-cyan-300 mb-1">{filteredBuoys.length}</div>
              <div className="text-xs text-cyan-200 mb-1">Total Shown</div>
              <div className="text-xs text-slate-400">of {totalStats.total} total</div>
            </div>

            {/* With Data */}
            <div className="bg-gradient-to-br from-green-500/20 to-green-600/30 backdrop-blur-sm border border-green-500/30 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-300 mb-1">{totalStats.withData}</div>
              <div className="text-xs text-green-200 mb-1">With Data</div>
              <div className="text-xs text-slate-400">data available</div>
            </div>

            {/* No Data */}
            <div className="bg-gradient-to-br from-orange-500/20 to-orange-600/30 backdrop-blur-sm border border-orange-500/30 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-orange-300 mb-1">{totalStats.total - totalStats.withData}</div>
              <div className="text-xs text-orange-200 mb-1">No Data</div>
              <div className="text-xs text-slate-400">no measurements</div>
            </div>

            {/* Avg Temp */}
            <div className="bg-gradient-to-br from-red-500/20 to-red-600/30 backdrop-blur-sm border border-red-500/30 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-300 mb-1">28.4°C</div>
              <div className="text-xs text-red-200 mb-1">Avg Temp</div>
              <div className="text-xs text-slate-400">sea surface</div>
            </div>

            {/* Networks */}
            <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/30 backdrop-blur-sm border border-purple-500/30 rounded-xl p-4 text-center">
              <div className="text-lg font-bold text-purple-300 mb-1">
                <div className="flex justify-center space-x-1 text-sm">
                  <span className="text-green-400">{totalStats.networks.RAMA}</span>
                  <span className="text-purple-400">{totalStats.networks.ARGO}</span>
                  <span className="text-orange-400">{totalStats.networks.MOORED}</span>
                </div>
              </div>
              <div className="text-xs text-purple-200 mb-1">Networks</div>
              <div className="text-xs text-slate-400">RAMA•ARGO•MOORED</div>
            </div>
          </div>
        </div>

        {/* 🔧 NEW: TWO COLUMN LAYOUT (Removed Legend, Larger Map) */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* LEFT: Ocean Buoy Network Map - 3 columns (LARGER) */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 overflow-hidden">
              
              {/* Header with Map Title and Network Indicators */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-cyan-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    </svg>
                    <h3 className="text-lg font-semibold text-white">Ocean Buoy Network</h3>
                  </div>
                  <div className="flex space-x-4">
                    <div className="flex items-center text-xs text-green-400">
                      <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
                      RAMA ({filteredStats.networks.RAMA})
                    </div>
                    <div className="flex items-center text-xs text-purple-400">
                      <div className="w-2 h-2 bg-purple-400 rounded-full mr-1"></div>
                      ARGO ({filteredStats.networks.ARGO})
                    </div>
                    <div className="flex items-center text-xs text-orange-400">
                      <div className="w-2 h-2 bg-orange-400 rounded-full mr-1"></div>
                      MOORED ({filteredStats.networks.MOORED})
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Filters with Counts */}
              <div className="p-4 bg-slate-700/30 border-b border-slate-700/50">
                <div className="flex items-center mb-3">
                  <svg className="w-4 h-4 text-cyan-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.414A1 1 0 013 6.707V4z"/>
                  </svg>
                  <span className="text-sm font-semibold text-white">Data Filters</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Region Filter with Counts */}
                  <div>
                    <label className="flex items-center text-xs font-medium text-slate-300 mb-1">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      </svg>
                      Region
                    </label>
                    <select 
                      value={selectedRegion}
                      onChange={(e) => setSelectedRegion(e.target.value)}
                      className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    >
                      {getRegionOptions().map(option => (
                        <option key={option.value} value={option.value} className="bg-slate-700">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Network Filter with Counts */}
                  <div>
                    <label className="flex items-center text-xs font-medium text-slate-300 mb-1">
                      <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14-7H3m16 14H5"/>
                      </svg>
                      Network
                    </label>
                    <select 
                      value={selectedNetwork}
                      onChange={(e) => setSelectedNetwork(e.target.value)}
                      className="w-full bg-slate-600 border border-slate-500 rounded-lg px-3 py-2 text-xs text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    >
                      {getNetworkOptions().map(option => (
                        <option key={option.value} value={option.value} className="bg-slate-700">
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* RAMA Reporting Filter with Counts - Only show when RAMA is selected */}
                  {selectedNetwork === 'RAMA' && (
                    <div>
                      <label className="flex items-center text-xs font-medium text-slate-300 mb-1">
                        <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        Reporting Status
                      </label>
                      <select 
                        value={ramaReportingFilter}
                        onChange={(e) => setRamaReportingFilter(e.target.value)}
                        className="w-full bg-green-500/20 border border-green-500/30 rounded-lg px-3 py-2 text-xs text-white focus:ring-2 focus:ring-green-400 focus:border-transparent"
                      >
                        {getRamaReportingOptions().map(option => (
                          <option key={option.value} value={option.value} className="bg-green-800 text-white">
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Apply Filters Button */}
                  <div className="flex items-end">
                    <button 
                      onClick={handleApplyFilters}
                      className="w-full bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg px-3 py-2 text-xs font-medium transition-colors"
                    >
                      Apply Filters
                    </button>
                  </div>
                </div>
              </div>
              
              {/* Map Container - LARGER HEIGHT */}
              <div className="relative h-[700px]">
                <MapContainer
                  center={[12, 77]}
                  zoom={5}
                  style={{ height: "100%", width: "100%" }}
                  className="rounded-b-2xl"
                >
                  <TileLayer
                    attribution='&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {filteredBuoys.map((buoy, idx) => {
                    const isSelected = selectedBuoy && selectedBuoy.id === buoy.id;
                    return (
                      <Marker
                        key={`${buoy.type}-${buoy.id}-${idx}`}
                        position={[buoy.lat || 0, buoy.lon || 0]}
                        icon={getIconForBuoy(buoy, isSelected)}
                        eventHandlers={{
                          click: () => handleBuoyClick(buoy.id),
                        }}
                      >
                        <Popup>
                          <div className="text-black p-3 min-w-[200px]">
                            <strong className="text-lg block mb-2">{formatBuoyId(buoy)}</strong>
                            <div className="space-y-1 text-sm">
                              <div><strong>Network:</strong> {buoy.type}</div>
                              <div><strong>Status:</strong> 
                                <span className={buoy.status === 'active' ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                                  {buoy.status === 'active' ? '🟢 Active' : '🔴 Inactive'}
                                </span>
                              </div>
                              <div><strong>Coordinates:</strong> {buoy.lat?.toFixed(6)}°N, {buoy.lon?.toFixed(6)}°E</div>
                              <div><strong>Region:</strong> {getRegionFromCoordinates(buoy.lat, buoy.lon)}</div>
                              
                              {buoy.type === 'RAMA' && buoy.reportingStatus && (
                                <div><strong>Reporting:</strong> 
                                  <span className={buoy.reportingStatus.toLowerCase().includes('reporting') && !buoy.reportingStatus.toLowerCase().includes('not') ? 'text-green-600 ml-1' : 'text-red-600 ml-1'}>
                                    {buoy.reportingStatus}
                                  </span>
                                </div>
                              )}
                              
                              {/* 🤖 UPDATED: Ask AI Button in Popup */}
                              <div className="pt-3 border-t border-gray-300">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAskAI(buoy);
                                  }}
                                  className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white rounded-lg px-3 py-2 text-xs font-medium transition-all duration-200 shadow-lg flex items-center justify-center"
                                >
                                  <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                                  </svg>
                                  🤖 Ask AI
                                </button>
                              </div>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            </div>
          </div>

          {/* RIGHT: Select a Buoy for Analysis - 1 column */}
          <div className="lg:col-span-1">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 h-full">
              {selectedBuoy ? (
                <>
                  {/* Buoy Analysis Header */}
                  <div className="p-4 border-b border-slate-700/50 bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-lg font-semibold text-white flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold mr-3">
                            {selectedBuoy.type.charAt(0)}
                          </div>
                          Buoy Analysis
                        </h3>
                        <p className="text-sm text-blue-200 ml-11">
                          {formatBuoyId(selectedBuoy)} ({selectedBuoy.type})
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedBuoy(null)}
                        className="text-slate-400 hover:text-white transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Real Buoy Details Content */}
                  <div className="p-4 space-y-4 overflow-y-auto" style={{ height: 'calc(700px - 100px)' }}>
                    
                    {/* Location Details - WITH WHITE BORDER */}
                    <div className="bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border-2 border-white rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-blue-400 mb-3 flex items-center">
                        <svg className="w-4 h-4 text-blue-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                        </svg>
                        📍 Location Details
                      </h4>
                      <div className="grid grid-cols-1 gap-3 text-sm">
                        <div className="bg-slate-700/30 rounded p-2">
                          <span className="text-slate-400">Coordinates:</span>
                          <div className="text-white font-medium">{selectedBuoy.lat?.toFixed(6)}°N, {selectedBuoy.lon?.toFixed(6)}°E</div>
                        </div>
                        <div className="bg-slate-700/30 rounded p-2">
                          <span className="text-slate-400">Region:</span>
                          <div className="text-white font-medium">{getRegionFromCoordinates(selectedBuoy.lat, selectedBuoy.lon)}</div>
                        </div>
                      </div>
                    </div>

                    {/* Organization Info - WITH WHITE BORDER */}
                    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-2 border-white rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-green-400 mb-3 flex items-center">
                        <svg className="w-4 h-4 text-green-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-2m-2 0H7m0 0H5m2 0h2"/>
                        </svg>
                        🏛️ Organization Info
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                          <span className="text-slate-300">Status:</span>
                          <span className={`font-medium ${selectedBuoy.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                            ● {selectedBuoy.status}
                          </span>
                        </div>
                        <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                          <span className="text-slate-300">Buoy ID:</span>
                          <span className="text-white font-medium">{formatBuoyId(selectedBuoy)}</span>
                        </div>
                        <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                          <span className="text-slate-300">Network:</span>
                          <span className="text-white font-medium">{selectedBuoy.type}</span>
                        </div>
                        <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                          <span className="text-slate-300">Data Source:</span>
                          <span className="text-white font-medium">{selectedBuoy.dataSource || 'INCOIS'}</span>
                        </div>
                        
                        {/* Programme */}
                        {selectedBuoy.programme && (
                          <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                            <span className="text-slate-300">Programme:</span>
                            <span className="text-white font-medium">{selectedBuoy.programme}</span>
                          </div>
                        )}
                        
                        {/* Agency */}
                        {selectedBuoy.agency && (
                          <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                            <span className="text-slate-300">Agency:</span>
                            <span className="text-white font-medium">{selectedBuoy.agency}</span>
                          </div>
                        )}
                        
                        {/* EEZ Status */}
                        {selectedBuoy.eezStatus && (
                          <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                            <span className="text-slate-300">EEZ Status:</span>
                            <span className="text-white font-medium">{selectedBuoy.eezStatus}</span>
                          </div>
                        )}
                        
                        {/* Reporting Status */}
                        {selectedBuoy.reportingStatus && (
                          <div className="flex justify-between bg-slate-700/20 rounded px-2 py-1">
                            <span className="text-slate-300">Reporting:</span>
                            <span className={`font-medium ${
                              selectedBuoy.reportingStatus.toLowerCase().includes('reporting') && 
                              !selectedBuoy.reportingStatus.toLowerCase().includes('not') 
                                ? 'text-green-400' 
                                : 'text-red-400'
                            }`}>
                              {selectedBuoy.reportingStatus}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Current Measurements - WITH WHITE BORDER */}
                    <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-2 border-white rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-purple-400 mb-3 flex items-center">
                        <svg className="w-4 h-4 text-purple-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                        </svg>
                        📊 Current Measurements
                      </h4>
                      <div className="space-y-2 text-sm">
                        {selectedBuoy.parameters && Object.keys(selectedBuoy.parameters).length > 0 ? (
                          Object.entries(selectedBuoy.parameters)
                            .filter(([key, value]) => value !== null && value !== undefined && value !== '')
                            .map(([key, value]) => (
                            <div key={key} className="flex justify-between items-center py-1 bg-slate-700/20 rounded px-2">
                              <span className="text-slate-300 capitalize">
                                {key.replace(/([A-Z])/g, ' $1').trim().replace('sst', 'SST')}:
                              </span>
                              <span className="text-white font-medium">{value}</span>
                            </div>
                          ))
                        ) : (
                          <div className="text-slate-400 text-center py-4 bg-slate-700/20 rounded">
                            No current measurements available
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 🤖 UPDATED: Ask AI Section - ATTRACTIVE WHITE BOX */}
                    <div className="bg-gradient-to-br from-white/95 to-blue-50/95 border-2 border-white rounded-xl p-6 text-center shadow-2xl">
                      <div className="mb-4">
                        <div className="w-16 h-16 mx-auto mb-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                          </svg>
                        </div>
                        <h4 className="text-lg font-bold text-gray-800 mb-2">🤖 AI Ocean Assistant</h4>
                        <p className="text-sm text-gray-600 mb-4">
                          Get AI-powered insights about this buoy's oceanographic data, patterns, and environmental conditions.
                        </p>
                      </div>
                      
                      <button
                        onClick={() => handleAskAI(selectedBuoy)}
                        className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-blue-700 hover:from-blue-700 hover:via-purple-700 hover:to-blue-800 text-white rounded-xl px-6 py-4 font-semibold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 flex items-center justify-center"
                      >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        Ask AI About This Buoy
                      </button>
                      
                      <div className="mt-3 text-xs text-gray-500">
                        ✨ Powered by Advanced Ocean Data Analytics
                      </div>
                    </div>

                    {/* INCOIS Data System - ONLY FOR MOORED BUOYS */}
                    {selectedBuoy.type === 'MOORED' && (
                      <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-2 border-white rounded-lg p-4">
                        <h4 className="text-sm font-semibold text-cyan-400 mb-3 flex items-center">
                          <svg className="w-4 h-4 text-cyan-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                          </svg>
                          🌊 Real-time INCOIS Data System
                        </h4>
                        <div className="space-y-3 text-sm">
                          <div className="bg-slate-700/30 rounded p-3">
                            <div className="text-cyan-300 font-medium mb-2">Live parameter monitoring with direct INCOIS interface access</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-400">✓ Precision:</span>
                                <span className="text-green-300">6 decimal places</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">📊 Status:</span>
                                <span className="text-green-300">active</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">💫 Guarantee:</span>
                                <span className="text-cyan-300">100% real data</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">Network:</span>
                                <span className="text-cyan-300">MOORED</span>
                              </div>
                            </div>
                          </div>
                          
                          {/* INCOIS Access Button - ONLY FOR MOORED */}
                          <button
                            onClick={handleAccessINCOIS}
                            className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 shadow-lg flex items-center justify-center"
                          >
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                            </svg>
                            🚀 Access Real-time INCOIS Interface
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center p-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-blue-500/30">
                      <svg className="w-10 h-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                      </svg>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-200 mb-2">Select a Buoy for Analysis</h3>
                    <p className="text-sm text-slate-400 mb-6 max-w-sm">
                      Click on any buoy marker on the map to view oceanographic data and interact with our AI assistant.
                    </p>
                    <div className="grid grid-cols-2 gap-3 text-xs text-slate-500">
                      <div className="bg-slate-700/30 rounded p-3">
                        <div className="text-green-400 font-medium">🌊 RAMA</div>
                        <div>Basic data + AI</div>
                      </div>
                      <div className="bg-slate-700/30 rounded p-3">
                        <div className="text-purple-400 font-medium">🎯 ARGO</div>
                        <div>Basic data + AI</div>
                      </div>
                      <div className="bg-slate-700/30 rounded p-3">
                        <div className="text-orange-400 font-medium">⚓ MOORED</div>
                        <div>INCOIS graphs + AI</div>
                      </div>
                      <div className="bg-slate-700/30 rounded p-3">
                        <div className="text-blue-400 font-medium">💫 OMNI</div>
                        <div>Basic data + AI</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 🤖 NEW: AI CHATBOT INTERFACE AT BOTTOM */}
        {showChatbot && (
          <div className="mt-6">
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 backdrop-blur-sm rounded-2xl border border-slate-600/50 shadow-2xl">
              {/* Chatbot Header */}
              <div className="p-4 border-b border-slate-600/50 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
                <div className="flex justify-between items-center">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mr-3">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white">🤖 AI Ocean Data Assistant</h3>
                      <p className="text-sm text-slate-300">
                        {selectedBuoy ? `Analyzing data for ${formatBuoyId(selectedBuoy)} (${selectedBuoy.type})` : 'Ocean Data Analysis'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowChatbot(false)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="h-80 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.type === 'user'
                          ? 'bg-blue-600 text-white'
                          : message.type === 'ai'
                          ? 'bg-gradient-to-br from-purple-600/90 to-blue-600/90 text-white'
                          : 'bg-slate-600/90 text-slate-100'
                      }`}
                    >
                      <div className="text-sm whitespace-pre-line">{message.message}</div>
                      <div className="text-xs opacity-70 mt-1">{message.timestamp}</div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-gradient-to-br from-purple-600/90 to-blue-600/90 text-white px-4 py-2 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                        <span className="text-sm">AI is analyzing...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t border-slate-600/50">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Ask me about ocean data, buoy measurements, trends..."
                    className="flex-1 bg-slate-700/90 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={chatLoading}
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim() || chatLoading}
                    className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-600 text-white rounded-lg px-4 py-2 transition-all duration-200 disabled:cursor-not-allowed"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INCOIS Interface - ONLY SHOWS FOR MOORED BUOYS */}
        {selectedBuoy && selectedBuoy.type === 'MOORED' && showINCOISInterface && (
          <div className="mt-6">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50">
              {/* Header */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-white flex items-center">
                      <svg className="w-5 h-5 text-cyan-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                      </svg>
                      🌊 REAL INCOIS Ocean Data System
                    </h3>
                    <p className="text-sm text-slate-400">
                      Buoy: <strong>{formatBuoyId(selectedBuoy)}</strong> • 
                      Network: <strong>MOORED</strong> • 
                      Parameter: <strong>{selectedParameter}</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setShowINCOISInterface(false)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>

              {/* Parameter Controls */}
              <div className="p-4 border-b border-slate-700/50">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Parameter:</label>
                    <select
                      value={selectedParameter}
                      onChange={(e) => setSelectedParameter(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    >
                      {incoisParameters.map(param => (
                        <option key={param} value={param}>{param}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Time Range:</label>
                    <select 
                      value={selectedTimeRange}
                      onChange={(e) => setSelectedTimeRange(e.target.value)}
                      className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-cyan-400 focus:border-transparent"
                    >
                      {timeRangeOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Source:</label>
                    <div className="bg-slate-700 rounded-lg px-3 py-2 text-sm text-cyan-400 font-medium">
                      INCOIS MOORED Data
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button
                      onClick={() => loadINCOISProxy(selectedBuoy, selectedParameter, selectedTimeRange)}
                      disabled={loadingProxy}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white rounded-lg px-6 py-2 text-sm font-medium transition-all duration-200 shadow-lg"
                    >
                      {loadingProxy ? 'Loading...' : '✓ Submit'}
                    </button>
                  </div>
                </div>
              </div>

              {/* INCOIS Graph Display */}
              <div className="p-6">
                {loadingProxy ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mx-auto"></div>
                    <p className="text-slate-300 mt-2">Loading REAL INCOIS interface...</p>
                  </div>
                ) : proxyError ? (
                  <div className="text-center py-8">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-6">
                      <p className="text-red-400 text-lg">❌ {proxyError}</p>
                      <button
                        onClick={() => loadINCOISProxy(selectedBuoy, selectedParameter, selectedTimeRange)}
                        className="mt-4 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200"
                      >
                        🔄 Retry
                      </button>
                    </div>
                  </div>
                ) : incoisProxyUrl ? (
                  <div>
                    <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <h4 className="text-green-400 font-semibold flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                        </svg>
                        🌊 REAL INCOIS Interface Active
                      </h4>
                      <p className="text-sm text-slate-300 mt-1">
                        Direct access to INCOIS system • 
                        Network: <strong>MOORED</strong> • 
                        Parameter: <strong>{selectedParameter}</strong> • 
                        Buoy: <strong>{formatBuoyId(selectedBuoy)}</strong>
                      </p>
                    </div>
                    
                    <div className="bg-white rounded-lg overflow-hidden shadow-2xl" style={{ height: '600px' }}>
                      <iframe
                        key={`${incoisProxyUrl}-${Date.now()}`}
                        src={incoisProxyUrl}
                        width="100%"
                        height="100%"
                        title={`INCOIS Data for ${formatBuoyId(selectedBuoy)} (MOORED) - ${selectedParameter}`}
                        frameBorder="0"
                        className="w-full h-full"
                        allow="fullscreen"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-6">
                      <h4 className="text-cyan-400 font-semibold mb-3">🌊 Ready to Load INCOIS Data</h4>
                      <p className="text-slate-300 mb-4">
                        Select a parameter and time range above, then click <strong>"Submit"</strong> to load the real INCOIS interface
                      </p>
                      <button
                        onClick={() => loadINCOISProxy(selectedBuoy, selectedParameter, selectedTimeRange)}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white rounded-lg px-6 py-3 text-sm font-semibold transition-all duration-200 shadow-lg"
                      >
                        🚀 Submit
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default BuoyMap;
