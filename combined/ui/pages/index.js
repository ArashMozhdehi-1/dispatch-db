import dynamic from 'next/dynamic';
import Head from 'next/head';

const CombinedMap = dynamic(() => import('../components/CombinedMap'), { ssr: false });

export default function Home() {
  return (
    <>
      <Head>
        <title>Combined Map</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <CombinedMap />
    </>
  );
}

