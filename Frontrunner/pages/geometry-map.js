import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function GeometryMapPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}

  return (
    <>
      <Head>
        <title>Location Geometries - Frontrunner V3</title>
        <meta name="description" content="Interactive map showing mine location geometries as polylines and polygons" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      
      <main style={{ margin: 0, padding: 0, height: '100vh', overflow: 'hidden' }}>
        <GeometryMapComponent />
      </main>
    </>
  );
}
      
      <main style={{ margin: 0, padding: 0, height: '100vh', overflow: 'hidden' }}>
        <GeometryMapComponent />
      </main>
    </>
  );
}