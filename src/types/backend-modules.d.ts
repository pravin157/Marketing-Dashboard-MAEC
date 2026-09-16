declare module '@/lib/analysis.js' {
  export function runAnalytics(): Promise<unknown>;
  export function runGA4Countries(): Promise<unknown>;
  export function getGA4DimensionValues(
    dimensionKey: string,
    startDate?: string,
    endDate?: string
  ): Promise<unknown>;
  export function getFilteredGA4Data(
    filters?: Record<string, unknown>,
    startDate?: string,
    endDate?: string
  ): Promise<unknown>;
}

declare module '@/lib/gsc.js' {
  export function runGSC(
    customSiteUrl?: string | null,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<{
    siteUrl: string;
    dateRange: unknown;
    summary: {
      totalClicks: number;
      totalImpressions: number;
      avgCTR: number;
      avgPosition: number;
    };
    daily: unknown;
    queries: unknown;
    pages: unknown[];
    countries: unknown;
    devices: unknown;
  }>;
  export function listSites(): Promise<unknown>;
  export function getIndexingData(
    customSiteUrl?: string | null,
    options?: Record<string, unknown>
  ): Promise<unknown>;
  export function inspectSingleUrl(siteUrl: string, url: string): Promise<unknown>;
  export function inspectSingleUrlWithCache(
    siteUrl: string,
    url: string,
    forceRefresh?: boolean
  ): Promise<unknown>;
  export function isUrlInProperty(urlStr: string, siteUrl: string): boolean;
  export function mapUrlInspectionError(err: unknown): { message: string };
  export function fetchCoreWebVitals(
    targetUrl?: string | null,
    device?: string,
    forceRefresh?: boolean
  ): Promise<unknown>;
}

declare module '@/lib/pagespeed.js' {
  export function analyzePageSpeed(
    targetUrl?: string | null,
    strategy?: string,
    forceRefresh?: boolean
  ): Promise<unknown>;
}
