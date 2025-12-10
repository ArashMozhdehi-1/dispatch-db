import React from 'react';
import Head from 'next/head';
import ConsolidatedPolygonMap from '../components/ConsolidatedPolygonMap';

export default function Home() {
  return (
    <>
      <Head>
        <title>Frontrunner - Mine Map</title>
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

          /* Hide Next.js Dev Toolbar / Indicators */
          [data-nextjs-toast],
          [data-nextjs-dialog-overlay],
          nextjs-portal,
          #next-dev-toolbar-container,
          .nextjs-devtools-floating {
            display: none !important;
            opacity: 0 !important;
            visibility: hidden !important;
            pointer-events: none !important;
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
