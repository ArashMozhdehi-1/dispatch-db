import { useEffect } from 'react';
import Head from 'next/head';

function MyApp({ Component, pageProps }) {
    useEffect(() => {
        // Aggressively remove Next.js dev tools
        const removeNextDevTools = () => {
            // Different selectors for different Next.js versions
            const selectors = [
                '#next-dev-toolbar-container',
                'nextjs-portal',
                '[data-nextjs-toast]',
                '[class*="nextjs-toast"]',
                'div[data-nextjs-dialog-overlay]',
                'next-route-announcer'
            ];

            selectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => {
                    el.style.display = 'none';
                    el.style.visibility = 'hidden';
                    el.style.opacity = '0';
                    el.remove();
                });
            });

            // Also try to remove the shadow host if it exists (Next.js 13+)
            const shadowHosts = document.querySelectorAll('div, span');
            shadowHosts.forEach(host => {
                if (host.shadowRoot) {
                    // This is risky as it might be other shadow roots, but for this specific app it's likely fine
                    // checking if it looks like nextjs
                    if (host.id?.includes('next') || host.className?.includes('next')) {
                        host.remove();
                    }
                }
            });
        };

        // Run immediately and on interval to catch it if it re-renders
        removeNextDevTools();
        const interval = setInterval(removeNextDevTools, 500);

        return () => clearInterval(interval);
    }, []);

    return (
        <>
            <Head>
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <style jsx global>{`
                  /* Aggressive CSS Reset for Next.js Tools */
                  #next-dev-toolbar-container,
                  nextjs-portal,
                  [data-nextjs-toast],
                  .nextjs-toast-errors-parent,
                  div[data-nextjs-dialog-overlay] {
                    display: none !important;
                    visibility: hidden !important;
                    opacity: 0 !important;
                    pointer-events: none !important;
                    z-index: -9999 !important;
                    width: 0 !important;
                    height: 0 !important;
                    position: absolute !important;
                    top: -9999px !important;
                    left: -9999px !important;
                  }
                `}</style>
            </Head>
            <Component {...pageProps} />
        </>
    );
}

export default MyApp;
