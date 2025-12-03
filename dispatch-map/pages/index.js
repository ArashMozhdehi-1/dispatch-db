import Head from 'next/head';
import DispatchCesiumMap from '../components/DispatchCesiumMap';

export default function Home() {
  return (
    <div>
      <Head>
        <title>Dispatch - Mine Map</title>
        <meta name="description" content="Dispatch data visualization with Cesium" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ width: '100%', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
        <DispatchCesiumMap />
      </main>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          padding: 0;
          margin: 0;
        }

        html,
        body {
          max-width: 100vw;
          overflow-x: hidden;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
            Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
        }

        body {
          background: #000;
        }
      `}</style>
    </div>
  );
}
