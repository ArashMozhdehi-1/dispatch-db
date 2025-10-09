import { useState, useEffect } from 'react';
import Head from 'next/head';
import dynamic from 'next/dynamic';

const MapboxComponent = dynamic(() => import('../components/MapboxComponent'), {
  ssr: false,
  loading: () => (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontSize: '18px',
      color: '#666'
    }}>
      Loading Mapbox Map...
    </div>
  )
});

export default function Home() {
  return (
    <>
      <Head>
        <title>Dispatch Database - Mapbox Map</title>
        <meta httpEquiv="content-type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      </Head>



      <MapboxComponent />

      <style jsx global>{`
        html, body {
          width: 100%;
          height: 100%;
          margin: 0;
          padding: 0;
        }
      `}</style>
    </>
  );
}

