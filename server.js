// server.js - REAL INCOIS Data ONLY + Enhanced ARGO Debugging
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const { Parser } = require("json2csv");
const cheerio = require("cheerio");
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();

// 🔧 Enhanced CORS configuration to allow iframe embedding
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5000'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json());

// 🔧 Global middleware to remove X-Frame-Options for ALL routes
app.use((req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.removeHeader('Content-Security-Policy');
  res.setHeader('X-Frame-Options', 'ALLOWALL');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self' http://localhost:3000 http://localhost:3001 http://localhost:5000");
  next();
});

// INCOIS endpoints
const INCOIS_ENDPOINTS = {
  ARGO: "https://incois.gov.in/OON/fetchArgoData.jsp",
  MOORED: "https://incois.gov.in/OON/fetchMooredBuoyData.jsp",
  RAMA: "https://incois.gov.in/geoserver/JointPortal/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=JointPortal:Ramabuoys&outputFormat=application/json",
  MOORED_DATA: "https://incois.gov.in/site/datainfo/moored_omnidata_stock.jsp"
};

const MOORED_BUOY_IDS = ['AD06', 'AD07', 'AD08', 'AD09', 'AD10', 'BD08', 'BD09', 'BD10', 'BD11', 'BD12'];

// INCOIS Parameters - exactly as they appear
const INCOIS_PARAMETERS = [
  'Air Pressure', 'Air Temperature', 'Relative Humidity', 'Rainfall',
  'Wind Direction', 'Wind Speed', 'Wind Gust', 'Irradiance', 'Radiation In',
  'Current Direction @ 1.20m', 'Current Direction @ 1.25m', 'Current Direction @ 003m',
  'Current Speed @ 1.20m', 'Current Speed @ 1.25m', 'Current Speed @ 003m',
  'Current Direction @ 015m', 'Current Direction @ 025m', 'Current Direction @ 035m',
  'Current Direction @ 050m', 'Current Direction @ 075m', 'Current Direction @ 100m',
  'Current Speed @ 015m', 'Current Speed @ 025m', 'Current Speed @ 035m',
  'Current Speed @ 050m', 'Current Speed @ 075m', 'Current Speed @ 100m',
  'Water Temperature @ 0.5m', 'Water Temperature @ 001m', 'Water Temperature @ 005m',
  'Water Temperature @ 010m', 'Water Temperature @ 015m', 'Water Temperature @ 020m',
  'Water Temperature @ 030m', 'Water Temperature @ 050m', 'Water Temperature @ 075m',
  'Water Temperature @ 100m', 'Water Temperature @ 200m', 'Water Temperature @ 500m',
  'Salinity @ 0.5m', 'Salinity @ 001m', 'Salinity @ 005m', 'Salinity @ 010m',
  'Salinity @ 015m', 'Salinity @ 020m', 'Salinity @ 030m', 'Salinity @ 050m',
  'Salinity @ 075m', 'Salinity @ 100m', 'Salinity @ 200m', 'Salinity @ 500m',
  'Significant Wave Height'
];

/**
 * 🔧 Enhanced INCOIS PROXY with better header handling
 */
app.use('/incois-proxy', createProxyMiddleware({
  target: 'https://incois.gov.in',
  changeOrigin: true,
  secure: true,
  pathRewrite: {
    '^/incois-proxy': '',
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8');
    proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
    proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
    proxyReq.setHeader('Cache-Control', 'no-cache');
    proxyReq.setHeader('Pragma', 'no-cache');
    proxyReq.setHeader('Upgrade-Insecure-Requests', '1');
    proxyReq.setHeader('Sec-Fetch-Dest', 'iframe');
    proxyReq.setHeader('Sec-Fetch-Mode', 'navigate');
    proxyReq.setHeader('Sec-Fetch-Site', 'cross-site');
    proxyReq.setHeader('Referer', 'https://incois.gov.in/');
    
    console.log(`🔗 Proxying request to: https://incois.gov.in${req.url.replace('/incois-proxy', '')}`);
  },
  onProxyRes: (proxyRes, req, res) => {
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['X-Frame-Options'];
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['Content-Security-Policy'];
    delete proxyRes.headers['x-content-type-options'];
    delete proxyRes.headers['X-Content-Type-Options'];
    delete proxyRes.headers['referrer-policy'];
    delete proxyRes.headers['Referrer-Policy'];
    
    proxyRes.headers['X-Frame-Options'] = 'ALLOWALL';
    proxyRes.headers['Content-Security-Policy'] = "frame-ancestors 'self' http://localhost:3000 http://localhost:3001 http://localhost:5000 *";
    proxyRes.headers['Access-Control-Allow-Origin'] = '*';
    proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    proxyRes.headers['Access-Control-Allow-Headers'] = '*';
    
    console.log(`✅ Proxied response: ${proxyRes.statusCode} - ${req.url}`);
  },
  onError: (err, req, res) => {
    console.error(`❌ Proxy error: ${err.message}`);
    res.status(500).send(`
      <html>
        <head><title>Proxy Error</title></head>
        <body>
          <h1>INCOIS Proxy Error</h1>
          <p>Error: ${err.message}</p>
          <p>Try accessing directly: <a href="https://incois.gov.in${req.url.replace('/incois-proxy', '')}" target="_blank">Open INCOIS</a></p>
        </body>
      </html>
    `);
  },
  timeout: 30000,
  proxyTimeout: 30000,
  logLevel: 'debug'
}));

/**
 * 🔍 ENHANCED Buoy Data Fetcher with DETAILED ARGO DEBUGGING (NO FALLBACK)
 */
async function fetchBuoyData(type) {
  if (type === "RAMA") {
    try {
      console.log(`🌊 Fetching RAMA data from: ${INCOIS_ENDPOINTS.RAMA}`);
      const resp = await axios.get(INCOIS_ENDPOINTS.RAMA, { 
        timeout: 20000,
        headers: { 
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json" 
        }
      });
      console.log(`✅ RAMA response: ${resp.status} - Features: ${resp.data.features?.length || 0}`);
      return resp.data;
    } catch (error) {
      console.error(`❌ Error fetching RAMA data:`, error.message);
      return { features: [] };
    }
  } else {
    try {
      const url = INCOIS_ENDPOINTS[type];
      console.log(`\n🔍 ======= FETCHING ${type} DATA =======`);
      console.log(`🔗 URL: ${url}`);
      
      const resp = await axios.get(url, {
        timeout: 30000, // Increased timeout for ARGO
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate",
          "Connection": "keep-alive",
          "Cache-Control": "no-cache"
        },
      });

      console.log(`📡 ${type} Response Status: ${resp.status}`);
      console.log(`📏 ${type} Response Size: ${JSON.stringify(resp.data).length} characters`);
      console.log(`🏷️ ${type} Response Type: ${typeof resp.data}`);
      console.log(`📦 ${type} Is Array: ${Array.isArray(resp.data)}`);

      const raw = resp.data;

      // 🔍 DETAILED RESPONSE ANALYSIS
      if (Array.isArray(raw)) {
        console.log(`📊 ${type} Array Length: ${raw.length}`);
        if (raw.length > 0) {
          console.log(`🔍 ${type} First Item Keys:`, Object.keys(raw[0]));
          console.log(`🔍 ${type} First Item Sample:`, JSON.stringify(raw[0], null, 2));
        } else {
          console.log(`⚠️ ${type} Array is EMPTY!`);
        }
      } else if (typeof raw === 'object' && raw !== null) {
        console.log(`🔍 ${type} Object Keys:`, Object.keys(raw));
        
        // Check for nested arrays
        if (raw.data && Array.isArray(raw.data)) {
          console.log(`📊 ${type} Nested Array Length: ${raw.data.length}`);
        } else if (raw.buoys && Array.isArray(raw.buoys)) {
          console.log(`📊 ${type} Nested Buoys Length: ${raw.buoys.length}`);
        } else if (raw.results && Array.isArray(raw.results)) {
          console.log(`📊 ${type} Nested Results Length: ${raw.results.length}`);
        } else {
          console.log(`🔍 ${type} Object Structure:`, JSON.stringify(raw, null, 2).substring(0, 500) + '...');
        }
      } else {
        console.log(`⚠️ ${type} Unexpected Response Type: ${typeof raw}`);
        console.log(`🔍 ${type} Raw Response (first 500 chars):`, String(raw).substring(0, 500));
      }

      // 🔧 TRY MULTIPLE DATA EXTRACTION METHODS
      let dataArray = [];
      
      if (Array.isArray(raw)) {
        dataArray = raw;
        console.log(`✅ ${type} Using direct array`);
      } else if (raw && typeof raw === 'object') {
        // Try common nested array properties
        const possibleArrays = [raw.data, raw.buoys, raw.results, raw.features, raw.items, raw.list];
        for (const arr of possibleArrays) {
          if (Array.isArray(arr) && arr.length > 0) {
            dataArray = arr;
            console.log(`✅ ${type} Using nested array: ${arr.length} items`);
            break;
          }
        }
        
        if (dataArray.length === 0) {
          console.log(`❌ ${type} No valid array found in object`);
        }
      }

      console.log(`📊 ${type} Final Data Array Length: ${dataArray.length}`);

      if (dataArray.length === 0) {
        console.log(`⚠️ ${type} NO DATA TO PROCESS - RETURNING EMPTY ARRAY`);
        return [];
      }

      // 🔧 ENHANCED DATA PROCESSING with multiple field mapping attempts
      const processed = dataArray
        .map((b, index) => {
          console.log(`\n🔍 Processing ${type} item ${index + 1}/${dataArray.length}`);
          console.log(`🗂️ Available fields:`, Object.keys(b));
          
          // 🔧 TRY MULTIPLE LATITUDE FIELD NAMES
          const latFields = [
            'ARGO_POSITION_LATITUDE', 'lat', 'latitude', 'LATITUDE', 'Latitude',
            'ARGO_LAT', 'LAT', 'position_latitude', 'pos_lat', 'y', 'Y'
          ];
          
          // 🔧 TRY MULTIPLE LONGITUDE FIELD NAMES
          const lonFields = [
            'ARGO_POSITION_LONGITUDE', 'lon', 'longitude', 'LONGITUDE', 'Longitude',
            'ARGO_LON', 'LON', 'position_longitude', 'pos_lon', 'x', 'X'
          ];
          
          let lat = null, lon = null;
          
          // Find latitude
          for (const field of latFields) {
            if (b[field] !== undefined && b[field] !== null) {
              lat = parseFloat(b[field]);
              if (!isNaN(lat)) {
                console.log(`📍 ${type} ${index}: Found latitude in field '${field}': ${lat}`);
                break;
              }
            }
          }
          
          // Find longitude
          for (const field of lonFields) {
            if (b[field] !== undefined && b[field] !== null) {
              lon = parseFloat(b[field]);
              if (!isNaN(lon)) {
                console.log(`📍 ${type} ${index}: Found longitude in field '${field}': ${lon}`);
                break;
              }
            }
          }
          
          if (isNaN(lat) || isNaN(lon)) {
            console.log(`❌ ${type} ${index}: Invalid coordinates - lat: ${lat}, lon: ${lon}`);
            console.log(`🔍 ${type} ${index}: Available data:`, JSON.stringify(b, null, 2));
            return null;
          }

          // 🔧 ENHANCED PARAMETER EXTRACTION
          const buoyData = {
            id: `${type}_${String(index + 1).padStart(3, "0")}`,
            buoyId: b.buoyId || b.BUOY_ID || b.name || b.id || `${type}_${index + 1}`,
            lat,
            lon,
            status: "active",
            type,
            parameters: {
              seaSurfaceTemperature: b.SST || b.seaSurfaceTemperature || b.sst || b.SEA_SURFACE_TEMPERATURE || null,
              salinity: b.Salinity || b.salinity || b.SALINITY || b.sal || null,
              waveHeight: b.WaveHeight || b.waveHeight || b.WAVE_HEIGHT || b.wave_height || null,
              windSpeed: b.WindSpeed || b.windSpeed || b.WIND_SPEED || b.wind_speed || null,
              airTemperature: b.airTemperature || b.AIR_TEMPERATURE || b.air_temperature || b.temp || null,
            },
            temperatureProfile: b.temperatureProfile || null,
            salinityProfile: b.salinityProfile || null,
            dataSource: "INCOIS",
            rawData: b // Store raw data for debugging
          };
          
          console.log(`✅ ${type} ${index}: Processed successfully - ID: ${buoyData.id}, Coords: [${lat}, ${lon}]`);
          return buoyData;
        })
        .filter(Boolean);
        
      console.log(`\n🎯 ${type} FINAL RESULT: ${processed.length}/${dataArray.length} buoys processed successfully`);
      console.log(`======= END ${type} DATA FETCH =======\n`);
      
      return processed;
      
    } catch (error) {
      console.error(`\n❌ CRITICAL ERROR fetching ${type} data:`);
      console.error(`🔗 Failed URL: ${INCOIS_ENDPOINTS[type]}`);
      console.error(`📝 Error Message: ${error.message}`);
      console.error(`🏷️ Error Code: ${error.code}`);
      if (error.response) {
        console.error(`📡 Response Status: ${error.response.status}`);
        console.error(`📊 Response Data: ${JSON.stringify(error.response.data).substring(0, 200)}`);
      }
      console.error(`======= END ${type} ERROR =======\n`);
      
      return [];
    }
  }
}

/**
 * 📊 REAL INCOIS Data Scraper - NO FALLBACK
 */
async function scrapeRealINCOISData(buoyId, parameter) {
  try {
    console.log(`🌊 Scraping REAL INCOIS data: ${buoyId} → ${parameter}`);
    
    const url = `${INCOIS_ENDPOINTS.MOORED_DATA}?buoy=${buoyId}&parameter=${encodeURIComponent(parameter)}`;
    console.log(`🔗 INCOIS URL: ${url}`);
    
    const response = await axios.get(url, {
      timeout: 45000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Referer': 'https://incois.gov.in/'
      }
    });
    
    console.log(`📥 INCOIS response received: ${response.data.length} characters`);
    
    const $ = cheerio.load(response.data);
    
    // Enhanced data extraction methods
    let chartData = null;
    
    // Method 1: Look for Highcharts/Highstock configuration
    chartData = await extractHighchartsData($);
    if (chartData) {
      console.log(`✅ Extracted Highcharts data: ${chartData.split('\n').length} points`);
      return createSuccessResponse(chartData, buoyId, parameter, 'Highcharts');
    }
    
    // Method 2: Look for Dygraph data
    chartData = await extractDygraphData($);
    if (chartData) {
      console.log(`✅ Extracted Dygraph data: ${chartData.split('\n').length} points`);
      return createSuccessResponse(chartData, buoyId, parameter, 'Dygraph');
    }
    
    // Method 3: Look for data in HTML tables
    chartData = await extractTableData($);
    if (chartData) {
      console.log(`✅ Extracted table data: ${chartData.split('\n').length} points`);
      return createSuccessResponse(chartData, buoyId, parameter, 'HTML Table');
    }
    
    // Method 4: Look for JSON data in script tags
    chartData = await extractJSONData($);
    if (chartData) {
      console.log(`✅ Extracted JSON data: ${chartData.split('\n').length} points`);
      return createSuccessResponse(chartData, buoyId, parameter, 'JSON Script');
    }
    
    // Method 5: Look for CSV data in hidden elements
    chartData = await extractHiddenData($);
    if (chartData) {
      console.log(`✅ Extracted hidden data: ${chartData.split('\n').length} points`);
      return createSuccessResponse(chartData, buoyId, parameter, 'Hidden Elements');
    }
    
    console.log(`❌ NO REAL DATA FOUND for ${buoyId}:${parameter} - All extraction methods failed`);
    return null;
    
  } catch (error) {
    console.error(`❌ Error scraping INCOIS data:`, error.message);
    return null;
  }
}

// [Include all the helper functions for data extraction here - extractHighchartsData, extractDygraphData, etc.]
// [These are the same as in your original code]

async function extractHighchartsData($) {
  const scripts = $('script');
  
  for (let i = 0; i < scripts.length; i++) {
    const scriptContent = $(scripts[i]).html();
    if (scriptContent && (scriptContent.includes('Highcharts') || scriptContent.includes('Highstock'))) {
      const seriesMatch = scriptContent.match(/series\s*:\s*\[\s*\{[\s\S]*?data\s*:\s*\[([\s\S]*?)\]/);
      if (seriesMatch) {
        return parseHighchartsData(seriesMatch[1]);
      }
      const dataMatch = scriptContent.match(/data\s*:\s*\[([\s\S]*?)\]/);
      if (dataMatch) {
        return parseHighchartsData(dataMatch[1]);
      }
    }
  }
  return null;
}

async function extractDygraphData($) {
  const scripts = $('script');
  
  for (let i = 0; i < scripts.length; i++) {
    const scriptContent = $(scripts[i]).html();
    if (scriptContent && scriptContent.includes('Dygraph')) {
      const csvMatch = scriptContent.match(/new\s+Dygraph[^,]*,\s*"([^"]*(?:\\.[^"]*)*)"/);
      if (csvMatch) {
        return csvMatch[1].replace(/\\n/g, '\n');
      }
      const arrayMatch = scriptContent.match(/new\s+Dygraph[^,]*,\s*\[([\s\S]*?)\]/);
      if (arrayMatch) {
        return parseDygraphArray(arrayMatch[1]);
      }
    }
  }
  return null;
}

async function extractTableData($) {
  const tables = $('table');
  const csvRows = [];
  
  tables.each((i, table) => {
    const rows = $(table).find('tr');
    let hasDateColumn = false;
    
    const firstRow = $(rows[0]);
    const firstCells = firstRow.find('td, th');
    firstCells.each((j, cell) => {
      const text = $(cell).text().trim().toLowerCase();
      if (text.includes('date') || text.includes('time') || text.includes('timestamp')) {
        hasDateColumn = true;
      }
    });
    
    if (hasDateColumn) {
      rows.each((j, row) => {
        if (j === 0) return;
        
        const cells = $(row).find('td');
        if (cells.length >= 2) {
          const dateText = $(cells[0]).text().trim();
          const valueText = $(cells[1]).text().trim();
          const value = parseFloat(valueText);
          
          if (dateText && !isNaN(value) && isValidDate(dateText)) {
            csvRows.push(`${standardizeDate(dateText)},${value}`);
          }
        }
      });
    }
  });
  
  return csvRows.length > 0 ? csvRows.join('\n') : null;
}

async function extractJSONData($) {
  const scripts = $('script');
  
  for (let i = 0; i < scripts.length; i++) {
    const scriptContent = $(scripts[i]).html();
    if (scriptContent) {
      const jsonMatches = scriptContent.match(/\[\s*\{[\s\S]*?"date"[\s\S]*?\}\s*\]/g);
      if (jsonMatches) {
        for (const match of jsonMatches) {
          try {
            const data = JSON.parse(match);
            if (Array.isArray(data) && data.length > 0 && data[0].date) {
              return data.map(item => `${item.date},${item.value || item.y || Object.values(item)[1]}`).join('\n');
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      const timestampMatches = scriptContent.match(/\[\s*\[\s*\d{10,13}\s*,[\s\S]*?\]\s*\]/g);
      if (timestampMatches) {
        for (const match of timestampMatches) {
          try {
            const data = JSON.parse(match);
            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
              return data.map(item => `${new Date(item[0]).toISOString()},${item[1]}`).join('\n');
            }
          } catch (e) {
            continue;
          }
        }
      }
    }
  }
  return null;
}

async function extractHiddenData($) {
  const hiddenInputs = $('input[type="hidden"]');
  for (let i = 0; i < hiddenInputs.length; i++) {
    const value = $(hiddenInputs[i]).val();
    if (value && value.includes(',') && value.length > 50) {
      const lines = value.split('\n').filter(line => line.includes(','));
      if (lines.length > 5) {
        return value;
      }
    }
  }
  
  const dataElements = $('[data-chart], [data-series], [data-values]');
  for (let i = 0; i < dataElements.length; i++) {
    const elem = dataElements[i];
    const chartData = $(elem).attr('data-chart') || $(elem).attr('data-series') || $(elem).attr('data-values');
    if (chartData && chartData.includes(',') && chartData.length > 50) {
      return chartData;
    }
  }
  
  return null;
}

function parseHighchartsData(dataString) {
  try {
    const cleanData = dataString.replace(/\s+/g, ' ').trim();
    const dataPoints = [];
    
    const matches = cleanData.match(/\[\s*(\d+)\s*,\s*([\d.-]+)\s*\]/g);
    if (matches) {
      matches.forEach(match => {
        const parts = match.match(/\[\s*(\d+)\s*,\s*([\d.-]+)\s*\]/);
        if (parts) {
          const timestamp = parseInt(parts[1]);
          const value = parseFloat(parts[2]);
          if (!isNaN(timestamp) && !isNaN(value)) {
            dataPoints.push(`${new Date(timestamp).toISOString()},${value}`);
          }
        }
      });
    }
    
    return dataPoints.length > 0 ? dataPoints.join('\n') : null;
  } catch (error) {
    return null;
  }
}

function parseDygraphArray(arrayString) {
  try {
    const lines = arrayString.split('],[');
    const dataPoints = [];
    
    lines.forEach(line => {
      const cleanLine = line.replace(/[\[\]]/g, '');
      const parts = cleanLine.split(',');
      if (parts.length >= 2) {
        const dateStr = parts[0].trim().replace(/['"]/g, '');
        const value = parseFloat(parts[1].trim());
        if (!isNaN(value)) {
          dataPoints.push(`${standardizeDate(dateStr)},${value}`);
        }
      }
    });
    
    return dataPoints.length > 0 ? dataPoints.join('\n') : null;
  } catch (error) {
    return null;
  }
}

function isValidDate(dateString) {
  const patterns = [
    /^\d{4}-\d{2}-\d{2}/, 
    /^\d{2}\/\d{2}\/\d{4}/, 
    /^\d{2}-\d{2}-\d{4}/, 
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/, 
  ];
  
  return patterns.some(pattern => pattern.test(dateString)) || !isNaN(Date.parse(dateString));
}

function standardizeDate(dateString) {
  const date = new Date(dateString);
  return isNaN(date.getTime()) ? dateString : date.toISOString();
}

function createSuccessResponse(data, buoyId, parameter, method) {
  return {
    success: true,
    data: data,
    isReal: true,
    source: 'INCOIS Live Data',
    extractionMethod: method,
    buoyId,
    parameter,
    extractedPoints: data.split('\n').length
  };
}

// 🌊 MAIN API ENDPOINTS - NO FALLBACK, REAL DATA ONLY WITH ENHANCED DEBUGGING
app.get("/api/ocean-buoys", async (req, res) => {
  try {
    console.log("\n🌊 ======= STARTING OCEAN BUOYS FETCH =======");
    console.log("📅 Timestamp:", new Date().toISOString());
    
    // Fetch all data types with detailed logging
    console.log("🎯 Fetching ARGO data...");
    const argo = await fetchBuoyData("ARGO");
    console.log(`📊 ARGO Result: ${argo.length} buoys`);
    
    console.log("🎯 Fetching MOORED data...");
    const moored = await fetchBuoyData("MOORED");
    console.log(`📊 MOORED Result: ${moored.length} buoys`);
    
    console.log("🎯 Fetching RAMA data...");
    const ramaGeoJSON = await fetchBuoyData("RAMA");
    console.log(`📊 RAMA Result: ${ramaGeoJSON.features?.length || 0} features`);

    const buoys = [...argo, ...moored];

    const stats = {
      totalBuoys: buoys.length,
      activeBuoys: buoys.length,
      buoysWithData: buoys.filter((b) => b.parameters).length,
      buoysWithoutData: buoys.filter((b) => !b.parameters).length,
      avgTemperature: (
        buoys.reduce(
          (sum, b) => sum + (parseFloat(b.parameters?.seaSurfaceTemperature) || 0),
          0
        ) / (buoys.filter((b) => b.parameters?.seaSurfaceTemperature).length || 1)
      ).toFixed(2),
      avgSalinity: (
        buoys.reduce((sum, b) => sum + (parseFloat(b.parameters?.salinity) || 0), 0) /
        (buoys.filter((b) => b.parameters?.salinity).length || 1)
      ).toFixed(2),
    };

    const networks = {
      ARGO: argo.length,
      MOORED: moored.length,
      RAMA: ramaGeoJSON.features?.length || 0,
      OMNI: 0,
    };

    console.log("\n📊 ======= FINAL RESULTS =======");
    console.log(`🎯 ARGO: ${networks.ARGO} buoys`);
    console.log(`⚓ MOORED: ${networks.MOORED} buoys`);
    console.log(`🌊 RAMA: ${networks.RAMA} features`);
    console.log(`📊 Total: ${stats.totalBuoys} buoys`);
    console.log("======= END OCEAN BUOYS FETCH =======\n");

    res.json({
      success: true,
      argo,
      moored,
      rama: ramaGeoJSON,
      stats,
      networks,
    });
  } catch (err) {
    console.error("❌ CRITICAL ERROR in ocean-buoys endpoint:", err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

app.get("/api/ocean-buoy/:id", async (req, res) => {
  try {
    const argo = await fetchBuoyData("ARGO");
    const moored = await fetchBuoyData("MOORED");
    const buoy = [...argo, ...moored].find((b) => b.id === req.params.id);

    if (!buoy)
      return res.status(404).json({ success: false, message: "Buoy not found" });

    res.json({ success: true, data: buoy });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🌊 REAL INCOIS DATA ONLY - NO FALLBACK
 */
app.get("/api/moored/:buoyId/:parameter", async (req, res) => {
  const { buoyId, parameter } = req.params;
  
  try {
    console.log(`🌊 MOORED data request: ${buoyId} → ${parameter}`);
    
    if (!MOORED_BUOY_IDS.includes(buoyId)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_BUOY_ID',
        message: `Invalid buoy ID: ${buoyId}. Available: ${MOORED_BUOY_IDS.join(', ')}`
      });
    }
    
    if (!INCOIS_PARAMETERS.includes(parameter)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PARAMETER',
        message: `Invalid parameter: ${parameter}. Available: ${INCOIS_PARAMETERS.slice(0, 5).join(', ')}...`
      });
    }
    
    console.log(`🔍 Attempting to scrape REAL INCOIS data (NO FALLBACK)...`);
    const realData = await scrapeRealINCOISData(buoyId, parameter);
    
    if (realData && realData.success) {
      console.log(`✅ SUCCESS: Returning REAL INCOIS data for ${buoyId}:${parameter}`);
      console.log(`📊 Extraction method: ${realData.extractionMethod}`);
      console.log(`📈 Data points: ${realData.extractedPoints}`);
      res.json(realData);
    } else {
      console.log(`❌ FAILURE: Could not extract REAL INCOIS data for ${buoyId}:${parameter}`);
      res.status(404).json({
        success: false,
        error: 'NO_REAL_DATA_AVAILABLE',
        message: `Unable to extract real INCOIS data for ${buoyId}:${parameter}. All extraction methods failed.`,
        buoyId,
        parameter,
        attemptedMethods: ['Highcharts', 'Dygraph', 'HTML Table', 'JSON Script', 'Hidden Elements'],
        suggestion: `Use the proxy endpoint instead: /incois-proxy/site/datainfo/moored_omnidata_stock.jsp?buoy=${buoyId}&parameter=${encodeURIComponent(parameter)}`
      });
    }
    
  } catch (err) {
    console.error("❌ MOORED endpoint error:", err.message);
    res.status(500).json({
      success: false,
      error: 'EXTRACTION_ERROR',
      message: `Error extracting INCOIS data: ${err.message}`,
      buoyId,
      parameter
    });
  }
});

/**
 * 🌊 INCOIS Proxy URL generator for iframe embedding
 */
app.get("/api/incois-url/:buoyId/:parameter", (req, res) => {
  const { buoyId, parameter } = req.params;
  
  if (!MOORED_BUOY_IDS.includes(buoyId)) {
    return res.status(400).json({
      success: false,
      message: `Invalid buoy ID: ${buoyId}`
    });
  }
  
  if (!INCOIS_PARAMETERS.includes(parameter)) {
    return res.status(400).json({
      success: false,
      message: `Invalid parameter: ${parameter}`
    });
  }
  
  const proxyUrl = `/incois-proxy/site/datainfo/moored_omnidata_stock.jsp?buoy=${buoyId}&parameter=${encodeURIComponent(parameter)}`;
  const directUrl = `https://incois.gov.in/site/datainfo/moored_omnidata_stock.jsp?buoy=${buoyId}&parameter=${encodeURIComponent(parameter)}`;
  
  res.json({
    success: true,
    buoyId,
    parameter,
    proxyUrl,
    directUrl,
    message: 'Use proxyUrl for iframe embedding - should work with enhanced headers!'
  });
});

/**
 * 📊 CSV download
 */
app.get("/api/ocean-data-csv/:year", async (req, res) => {
  try {
    const argo = await fetchBuoyData("ARGO");
    const moored = await fetchBuoyData("MOORED");
    const buoys = [...argo, ...moored];

    const parser = new Parser();
    const csv = parser.parse(buoys);

    res.header("Content-Type", "text/csv");
    res.attachment(`incois_ocean_data_${req.params.year}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * 🏠 Root endpoint
 */
app.get("/", (req, res) => {
  res.json({
    status: "✅ INCOIS Ocean API - REAL DATA ONLY + ENHANCED ARGO DEBUGGING",
    version: "8.0.0 - Enhanced ARGO Debugging",
    features: [
      "🔍 DETAILED ARGO debugging with field mapping",
      "🌊 REAL INCOIS data scraping ONLY (no dummy fallback)",
      "📊 ENHANCED INCOIS proxy with iframe embedding fixes", 
      "🔍 5 extraction methods for real data",
      "❌ Returns error if real data unavailable",
      "🖼️ FIXED CORS and X-Frame-Options issues"
    ],
    endpoints: {
      guaranteed: [
        "GET /incois-proxy/* - Enhanced INCOIS proxy (IFRAME READY)",
        "GET /api/incois-url/:buoyId/:parameter - Get iframe URLs"
      ],
      realDataOnly: [
        "GET /api/ocean-buoys - List all buoys (WITH DETAILED ARGO LOGGING)",
        "GET /api/ocean-buoy/:id - Single buoy details",
        "GET /api/moored/:buoyId/:parameter - REAL data or error"
      ],
      download: [
        "GET /api/ocean-data-csv/:year - Download CSV data"
      ]
    },
    mooredBuoys: MOORED_BUOY_IDS,
    availableParameters: INCOIS_PARAMETERS.length,
    guaranteedExample: "/incois-proxy/site/datainfo/moored_omnidata_stock.jsp?buoy=AD06&parameter=Air%20Temperature",
    realDataExample: "/api/moored/AD06/Air%20Temperature",
    debug: "🔍 Check server console for detailed ARGO fetch logging"
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌊 INCOIS ENHANCED API running at http://localhost:${PORT}`);
  console.log(`🔍 ENHANCED ARGO DEBUGGING ENABLED`);
  console.log(`📊 Features:`);
  console.log(`   • ${MOORED_BUOY_IDS.length} MOORED buoys with REAL data extraction`);
  console.log(`   • ${INCOIS_PARAMETERS.length} oceanographic parameters`);
  console.log(`   • INCOIS proxy with FIXED iframe embedding at /incois-proxy/*`);
  console.log(`   • ❌ NO FALLBACK - Returns error if real data unavailable`);
  console.log(`   • 🔍 DETAILED ARGO debugging to identify data issues`);
  console.log(`🔗 Test: http://localhost:${PORT}/api/ocean-buoys`);
  console.log(`✨ Check console for detailed ARGO fetch logging!`);
});
