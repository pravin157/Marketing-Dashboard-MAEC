'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import '@/styles/dashboard.css';

type Props = {
  bodyHtml: string;
};

/**
 * Client shell that mounts the ported vanilla dashboard DOM + scripts.
 * Keeps Chart.js / BenchmarkService / dashboard-app.js load order intact.
 */
export default function DashboardClient({ bodyHtml }: Props) {
  const [chartReady, setChartReady] = useState(false);
  const [benchReady, setBenchReady] = useState(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => setChartReady(true)}
      />
      {chartReady && (
        <Script
          src="/benchmarks_config.js"
          strategy="afterInteractive"
          onLoad={() => setBenchReady(true)}
        />
      )}
      {benchReady && (
        <Script src="/js/dashboard-app.js" strategy="afterInteractive" />
      )}
      <div
        id="maec-dashboard-root"
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
    </>
  );
}
