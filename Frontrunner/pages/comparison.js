import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function ComparisonPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/');
  }, [router]);
  return null;
}

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto">
        <header className="bg-white shadow-sm border-b">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              PostgreSQL Polygons vs MySQL Points Comparison
            </h1>
            <p className="text-gray-600 mt-1">
              Compare consolidated location polygons from PostgreSQL with individual coordinate points from MySQL
            </p>
          </div>
        </header>
        
        <main>
          <ComparisonMapComponent />
        </main>
      </div>
    </div>
  );
}
        <main>
          <ComparisonMapComponent />
        </main>
      </div>
    </div>
  );
}