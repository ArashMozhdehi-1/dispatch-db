import Head from 'next/head';
import dynamic from 'next/dynamic';

const DispatchCesiumMap = dynamic(() => import('../components/DispatchCesiumMap'), {
  ssr: false,
});

export default function Home() {
  return (
    <div>
      <Head>
        <title>Dispatch Map</title>
        <meta name="description" content="Dispatch Cesium map" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <main style={{ width: '100%', height: '100vh', margin: 0, padding: 0, overflow: 'hidden' }}>
        <DispatchCesiumMap />
      </main>

      <style jsx global>{`
          html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            overflow: hidden;
            font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
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
    </div>
  );
}
