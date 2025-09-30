// server.js
const express = require("express");
const axios = require("axios");
const NodeCache = require("node-cache");
const cors = require("cors");

const app = express();
app.use(express.json());
app.use(cors());

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes cache

// helper fetch with cache
async function cachedFetch(key, url) {
  const cached = cache.get(key);
  if (cached) return cached;
  const resp = await axios.get(url, { timeout: 15000 });
  const data = resp.data;
  cache.set(key, data);
  return data;
}

// Known endpoints
const buoyEndpoints = {
  argo: "https://incois.gov.in/OON/fetchArgoData.jsp",
  moored: "https://incois.gov.in/OON/fetchMooredBuoyData.jsp",
  aws: "https://incois.gov.in/OON/fetchAWSBuoyData.jsp",
  drifting: "https://incois.gov.in/OON/fetchDRIFTINGBuoyData.jsp"
};

// API to get list of buoy data by type
app.get("/api/buoys/:type", async (req, res) => {
  const type = req.params.type.toLowerCase();
  const url = buoyEndpoints[type];
  if (!url) {
    return res.status(400).json({ success:false, message:`Unknown buoy type: ${type}` });
  }
  try {
    const data = await cachedFetch(`buoys_${type}`, url);
    // You may need to normalize the data structure
    res.json({ success:true, type, data });
  } catch (err) {
    console.error(`Error fetching ${type} data:`, err.message);
    res.status(500).json({ success:false, message:`Failed to fetch ${type} data`, error: err.message });
  }
});

// Optionally an endpoint to merge all buoy types live
app.get("/api/buoys", async (req, res) => {
  const types = Object.keys(buoyEndpoints);
  const result = {};
  for (const type of types) {
    try {
      const data = await cachedFetch(`buoys_${type}`, buoyEndpoints[type]);
      result[type] = data;
    } catch (err) {
      console.warn(`Couldn’t fetch ${type}:`, err.message);
      result[type] = null;
    }
  }
  res.json({ success:true, all: result });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🌊 INCOIS buoy-wrapper API running at http://localhost:${PORT}`);
});

