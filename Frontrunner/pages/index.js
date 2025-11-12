import React from 'react';
import Head from 'next/head';
import ConsolidatedPolygonMap from '../components/ConsolidatedPolygonMap';

export default function Home() {
  return (
    <>
      <Head>
        <title>Mine Map</title>
        <meta name="description" content="Interactive 3D" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style jsx global>{`
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
          #__next {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
          }
        `}</style>
      </Head>
      
      <main style={{ 
        margin: 0, 
        padding: 0, 
        width: '100%', 
        height: '100vh', 
        overflow: 'hidden',
        position: 'relative'
      }}>
        <ConsolidatedPolygonMap />
      </main>
    </>
  );
}
