// src/index.js - Updated for Multi-Language OceanFront
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// 🌊 Initialize the OceanFront Application
const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// 🔧 Optional: Enhanced Performance Monitoring for OceanFront
// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals

// Enhanced performance monitoring for oceanographic data app
const logOceanFrontVitals = (metric) => {
  // Log performance metrics with OceanFront context
  console.log(`🌊 OceanFront Performance: ${metric.name}`, {
    value: metric.value,
    rating: metric.rating,
    timestamp: new Date().toISOString()
  });

  // Optional: Send to analytics endpoint
  // fetch('/api/analytics', {
  //   method: 'POST',
  //   body: JSON.stringify({
  //     app: 'OceanFront',
  //     metric: metric.name,
  //     value: metric.value,
  //     rating: metric.rating,
  //     timestamp: new Date().toISOString()
  //   })
  // });
};

// Enable performance monitoring (uncomment to activate)
// reportWebVitals(logOceanFrontVitals);

// Standard performance monitoring (comment out the above and use this for basic logging)
reportWebVitals();
