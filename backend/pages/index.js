import { useState, useEffect } from 'react';
import Head from 'next/head';
import Script from 'next/script';
import dynamic from 'next/dynamic';
import { ApolloProvider } from '@apollo/client';
import apolloClient from '../lib/apollo-client';

// Dynamically import the map component to avoid SSR issues
const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => (
    <div className="loading">
      <h3>Loading Dispatch Database Map...</h3>
      <p>Fetching roads and locations...</p>
    </div>
  )
});

export default function Home() {
  return (
    <ApolloProvider client={apolloClient}>
      <Head>
        <title>Dispatch Database - Bézier Roads Map</title>
        <meta httpEquiv="content-type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>

      <Script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.3/dist/leaflet.js" strategy="beforeInteractive" />
      <Script src="https://code.jquery.com/jquery-3.7.1.min.js" strategy="beforeInteractive" />
      <Script src="https://cdn.jsdelivr.net/npm/bootstrap@5.2.2/dist/js/bootstrap.bundle.min.js" strategy="beforeInteractive" />
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/Leaflet.awesome-markers/2.0.2/leaflet.awesome-markers.js" strategy="beforeInteractive" />

      <MapComponent />

      <style jsx global>{`
        #map_a0d4ee9e9b1abb448ab72dbdcb6bb7df {
          position: relative;
          width: 100.0%;
          height: 100.0%;
          left: 0.0%;
          top: 0.0%;
        }
        .leaflet-container { font-size: 1rem; }

        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }

        #map {
          position:absolute;
          top:0;
          bottom:0;
          right:0;
          left:0;
        }

        .leaflet-control-zoom {
          background-color: rgba(60, 60, 60, 0.9) !important;
          border: 1px solid rgba(120, 120, 120, 0.5) !important;
          border-radius: 6px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3) !important;
        }

        .leaflet-control-zoom a {
          background-color: rgba(60, 60, 60, 0.9) !important;
          color: white !important;
          border: none !important;
          font-weight: bold !important;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5) !important;
        }

        .leaflet-control-zoom a:hover {
          background-color: rgba(80, 80, 80, 0.9) !important;
          color: #bdc3c7 !important;
        }

        .leaflet-control-layers {
          position: fixed !important;
          top: 20px !important;
          left: 50% !important;
          transform: translateX(-50%) !important;
          background-color: rgba(60, 60, 60, 0.9) !important;
          border: 1px solid rgba(120, 120, 120, 0.5) !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
          backdrop-filter: blur(10px) !important;
          z-index: 1000 !important;
        }

        .leaflet-control-layers-toggle {
          background-color: rgba(60, 60, 60, 0.9) !important;
          border: 1px solid rgba(120, 120, 120, 0.5) !important;
          border-radius: 6px !important;
          color: white !important;
          font-weight: 600 !important;
          text-transform: uppercase !important;
          font-size: 12px !important;
          padding: 8px 12px !important;
          min-width: 160px !important;
          text-align: center !important;
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
        }

        .leaflet-control-layers-toggle::before {
          content: "🗺️" !important;
          margin-right: 8px !important;
          font-size: 14px !important;
        }

        .leaflet-control-layers-toggle::after {
          content: "▼" !important;
          margin-left: 8px !important;
          font-size: 10px !important;
          transition: transform 0.3s ease !important;
        }

        .leaflet-control-layers-expanded {
          background-color: rgba(255, 255, 255, 0.95) !important;
          color: #333 !important;
          border: 1px solid rgba(200, 200, 200, 0.8) !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
          backdrop-filter: blur(10px) !important;
          margin-top: 4px !important;
          padding: 8px 0 !important;
          min-width: 160px !important;
        }

        .leaflet-control-layers label {
          color: #333 !important;
          padding: 6px 12px !important;
          margin: 0 !important;
          font-size: 13px !important;
          cursor: pointer !important;
          transition: background-color 0.2s ease !important;
        }

        .leaflet-control-layers label:hover {
          background-color: rgba(60, 60, 60, 0.1) !important;
        }

        .leaflet-control-layers input[type="radio"] {
          accent-color: #3498db !important;
          margin-right: 8px !important;
        }

        .leaflet-control-attribution {
          background-color: rgba(60, 60, 60, 0.8) !important;
          color: #bdc3c7 !important;
          border: 1px solid rgba(120, 120, 120, 0.3) !important;
          border-radius: 4px !important;
        }

        /* Ensure markers appear on top of lines */
        .leaflet-marker-icon {
          z-index: 1000 !important;
        }

        .leaflet-popup {
          z-index: 1001 !important;
        }

        .leaflet-popup-content-wrapper {
          border: none !important;
          box-shadow: none !important;
        }

        .leaflet-popup-tip {
          border: none !important;
          box-shadow: none !important;
        }

        .loading {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          z-index: 2000;
          background: rgba(255, 255, 255, 0.95);
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          backdrop-filter: blur(10px);
        }
      `}</style>
    </ApolloProvider>
  );
}

