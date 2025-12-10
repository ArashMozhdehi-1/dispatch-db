import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* Favicon */}
                <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗺️</text></svg>" />
                {/* Cesium styles */}
                <link
                    rel="stylesheet"
                    href="https://cdnjs.cloudflare.com/ajax/libs/cesium/1.126.0/Widgets/widgets.css"
                />
                <style>{`
                    /* Hide Next.js branding */
                    a[href*="nextjs.org"],
                    a[href*="vercel.com"],
                    .nextjs-link,
                    #__next > div > a[href*="next"],
                    footer a[href*="next"],
                    [data-nextjs-toast] {
                        display: none !important;
                        visibility: hidden !important;
                        opacity: 0 !important;
                    }
                `}</style>
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
