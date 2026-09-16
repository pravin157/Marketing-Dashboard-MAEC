# MAEC — Social Media & Marketing Analytics Dashboard (Next.js)

Next.js replica of the IntoAEC marketing dashboard, configured for the **MAEC** website (`maec.ai`).

## Stack

- **Next.js 14** (App Router)
- **API Route Handlers** — same endpoints as the Express original
- **Chart.js** dashboard UI (ported from the vanilla SPA)
- Backend modules: Meta Graph, GA4, YouTube, GSC, CrUX, PageSpeed

## Quickstart

```bash
npm install
cp .env.example .env
# fill in MAEC credentials in .env
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/data` | Live FB / IG / GA4 / YouTube payload |
| POST | `/api/refresh` | Force refresh of the same payload |
| GET | `/api/analytics/countries` | GA4 top countries |
| GET | `/api/analytics/dimension-values` | GA4 dimension distinct values |
| POST | `/api/analytics/filter` | Filtered GA4 metrics |
| GET | `/api/gsc` | Search Console overview |
| GET | `/api/gsc/sites` | List SC properties |
| GET | `/api/gsc/page-indexing` | Pages + indexing helpers |
| GET | `/api/gsc/indexing` | Indexing module |
| POST | `/api/gsc/indexing/inspect` | Manual URL inspect |
| POST | `/api/gsc/url-inspection` | Cached single-URL inspection |
| GET | `/api/core-web-vitals` | CrUX field CWV |
| GET/POST | `/api/pagespeed/analyze` | PageSpeed Insights |

## Project layout

```
src/app/          # Next.js pages + API routes
src/components/   # Dashboard client shell
src/lib/          # analysis, gsc, pagespeed, body HTML
src/styles/       # dashboard.css
public/js/        # dashboard-app.js + benchmarks_config.js
data/             # GSC URL inspection cache
```

## Notes

- Branding defaults use **MAEC** / `https://maec.ai/`. Override via `.env` (`GSC_SITE_URL`, `YOUTUBE_CHANNEL_HANDLE`, PageSpeed URL in the UI).
- This is a functional replica of `marketing_dashboard`; wire MAEC API credentials before expecting live data.
