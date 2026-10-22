
function __maecOnReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

        // ── Data state (all empty on load) ──────────────────────────────────────────
        let GA4_DAILY = [];
        let GA4_CHANNELS = [];
        let GA4_PAGES = [];
        let gaRangeTotals = null;
        let gaRangeTotalsSeq = 0;
        let FB_POSTS = [];
        let IG_POSTS = [];
        let YT_VIDEOS = [];
        let SUMMARY = {};
        let GSC_DATA = null;
        let gscLoaded = false;
        let dataLoaded = false;

        function computeRefDate() {
            const all = [...GA4_DAILY, ...FB_POSTS, ...IG_POSTS, ...YT_VIDEOS]
                .map(d => d.date).filter(Boolean).sort();
            return all.length ? new Date(all[all.length - 1]) : new Date();
        }
        let REF_DATE = new Date();
        let activeFilter = { days: 31, start: null, end: null };

        function localIso(date) {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        function getDateRange() {
            if (activeFilter.days === 'all') return { start: '2000-01-01', end: REF_DATE.toISOString().slice(0, 10) };
            if (activeFilter.days === 'custom') return { start: activeFilter.start, end: activeFilter.end };
            // GA4 "Last N days" is N complete days ending yesterday. Today is still open,
            // so including it (Oct 16–22) under-counts versus the GA4 card (Oct 15–21).
            const end = new Date();
            end.setDate(end.getDate() - 1);
            const start = new Date(end);
            start.setDate(start.getDate() - (activeFilter.days - 1));
            return { start: localIso(start), end: localIso(end) };
        }
        function inRange(d) { const { start, end } = getDateRange(); return d >= start && d <= end; }
        function formatPrettyDate(iso) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return iso || '';
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const [year, month, day] = iso.split('-');
            return `${Number(day)} ${months[Number(month) - 1]} ${year}`;
        }
        function rangeLabel() {
            if (activeFilter.days === 'all') return 'All Time';
            if (activeFilter.days === 'custom') return `${formatPrettyDate(activeFilter.start)} → ${formatPrettyDate(activeFilter.end)}`;
            return `Last ${activeFilter.days} Days`;
        }

        // ── Charts ────────────────────────────────────────────────────────────────────
        if (window.Chart) {
            Chart.defaults.color = '#8b9bb4';
            Chart.defaults.borderColor = '#2a3346';
        }
        const charts = {};
        const C = {
            blue: '#0066cc', teal: '#00cccc', up: '#12b47a', warn: '#f59e0b',
            down: '#e5403c', purple: '#7c3aed', muted: '#7080a0',
            mixed: ['#0066cc', '#00cccc', '#12b47a', '#f59e0b', '#e5403c', '#7c3aed', '#0088ee', '#ff6b35']
        };
        function makeChart(id, type, data, options) {
            if (charts[id]) charts[id].destroy();
            const ctx = document.getElementById(id);
            if (!ctx) return;
            charts[id] = new Chart(ctx, { type, data, options });
        }
        const baseOpts = (showLegend = false) => ({
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: showLegend, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
            scales: { x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#7080a0', maxRotation: 45 } }, y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 }, color: '#7080a0' } } }
        });
        function fmt(n) { return (n || 0).toLocaleString(); }

        // ── Show/hide empty states ────────────────────────────────────────────────────
        function toggleSection(prefix, hasData) {
            const empty = document.getElementById(prefix + 'Empty');
            const content = document.getElementById(prefix + 'Content');
            if (empty) empty.style.display = hasData ? 'none' : '';
            if (content) content.style.display = hasData ? '' : 'none';
        }

        function previousSpan(start, end) {
            const s = new Date(start + 'T00:00:00Z');
            const e = new Date(end + 'T00:00:00Z');
            const dur = e.getTime() - s.getTime();
            const prevEnd = new Date(s.getTime() - 86400000);
            const prevStart = new Date(prevEnd.getTime() - dur);
            const iso = d => d.toISOString().slice(0, 10);
            return { start: iso(prevStart), end: iso(prevEnd) };
        }

        function visibleGaSpan() {
            if (activeFilter.days === 'all' && GA4_DAILY.length) {
                return { start: GA4_DAILY[0].date, end: GA4_DAILY[GA4_DAILY.length - 1].date };
            }
            const { start, end } = getDateRange();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) return null;
            return { start, end };
        }

        function currentGaTotalsKey() {
            const current = visibleGaSpan();
            if (!current || typeof weekBuckets !== 'function') return '';
            const previous = previousSpan(current.start, current.end);
            const weeks = weekBuckets();
            return JSON.stringify({
                current,
                previous,
                thisWeek: { start: weeks.thisStart, end: weeks.thisEnd },
                lastWeek: { start: weeks.lastStart, end: weeks.lastEnd },
                filters: (typeof activeGAFilters === 'undefined') ? {} : activeGAFilters
            });
        }

        function readyGaPeriod(name) {
            if (!gaRangeTotals || gaRangeTotals.status !== 'ready') return null;
            if (gaRangeTotals.key !== currentGaTotalsKey()) return null;
            return gaRangeTotals.ranges[name] || null;
        }

        function scheduleGaRangeTotals() {
            if (!GA4_DAILY.length) return;
            const key = currentGaTotalsKey();
            if (!key) return;
            if (gaRangeTotals && gaRangeTotals.key === key && (gaRangeTotals.status === 'ready' || gaRangeTotals.status === 'loading' || gaRangeTotals.status === 'error')) return;

            const parsed = JSON.parse(key);
            const seq = ++gaRangeTotalsSeq;
            gaRangeTotals = { key, status: 'loading', ranges: null };
            const filters = (typeof activeGAFilters === 'undefined') ? {} : activeGAFilters;

            fetch('/api/analytics/totals', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    filters,
                    ranges: [
                        { name: 'current', startDate: parsed.current.start, endDate: parsed.current.end },
                        { name: 'previous', startDate: parsed.previous.start, endDate: parsed.previous.end },
                        { name: 'thisWeek', startDate: parsed.thisWeek.start, endDate: parsed.thisWeek.end },
                        { name: 'lastWeek', startDate: parsed.lastWeek.start, endDate: parsed.lastWeek.end }
                    ]
                })
            })
                .then(res => res.json().then(json => ({ ok: res.ok, json })))
                .then(({ ok, json }) => {
                    if (seq !== gaRangeTotalsSeq) return;
                    if (!ok || !json.success) throw new Error(json.error || 'GA4 totals failed');
                    gaRangeTotals = { key, status: 'ready', ranges: json.data };
                    renderAll();
                })
                .catch(err => {
                    if (seq !== gaRangeTotalsSeq) return;
                    console.error('GA4 range totals failed:', err.message);
                    gaRangeTotals = { key, status: 'error', ranges: null };
                    renderAll();
                });
        }

        // ── Render ────────────────────────────────────────────────────────────────────
        function renderAll() {
            const label = rangeLabel();
            const { start, end } = getDateRange();

            ['ovRangeTag', 'gaRangeTag', 'fbRangeTag', 'igRangeTag', 'ytRangeTag'].forEach(id => {
                const el = document.getElementById(id); if (el) el.textContent = label;
            });
            document.getElementById('headerRangeLabel').textContent = `📅 ${label}`;
            document.getElementById('filterInfo').textContent = `Showing: ${label}`;
            document.getElementById('footerRange').textContent = `${label} · ${REF_DATE.toISOString().slice(0, 10)}`;

            const hasGA = GA4_DAILY.length > 0;
            const hasFB = FB_POSTS.length > 0;
            const hasIG = IG_POSTS.length > 0;
            const hasYT = YT_VIDEOS.length > 0;
            const hasAny = hasGA || hasFB || hasIG || hasYT;

            toggleSection('overview', hasAny);
            toggleSection('ga', hasGA);
            toggleSection('fb', hasFB);
            toggleSection('ig', hasIG);
            toggleSection('yt', hasYT);
            toggleSection('weekly', hasAny);

            if (!hasAny) return;

            // Summary numbers
            document.getElementById('kpi-ig-followers').textContent = fmt(SUMMARY.igFollowers);
            document.getElementById('kpi-ig-sub').textContent = `${fmt(SUMMARY.igMediaCount)} total posts`;
            document.getElementById('kpi-fb-fans').textContent = fmt(SUMMARY.fbFans);
            document.getElementById('kpi-fb-sub').textContent = `${FB_POSTS.length} posts tracked`;
            if (document.getElementById('fb-fans')) document.getElementById('fb-fans').textContent = fmt(SUMMARY.fbFans);
            if (document.getElementById('fb-followers')) document.getElementById('fb-followers').textContent = `${fmt(SUMMARY.fbFollowers)} followers`;
            if (document.getElementById('ig-followers')) document.getElementById('ig-followers').textContent = fmt(SUMMARY.igFollowers);
            if (document.getElementById('ig-following')) document.getElementById('ig-following').textContent = `${fmt(SUMMARY.igFollowing)} following`;
            if (document.getElementById('igSubtitle')) document.getElementById('igSubtitle').textContent = `${fmt(SUMMARY.igFollowers)} followers · ${fmt(SUMMARY.igMediaCount)} total posts`;
            if (document.getElementById('fbSubtitle')) document.getElementById('fbSubtitle').textContent = `${FB_POSTS.length} posts tracked`;
            if (document.getElementById('yt-subs')) document.getElementById('yt-subs').textContent = fmt(SUMMARY.ytSubscribers);
            if (document.getElementById('yt-since')) document.getElementById('yt-since').textContent = SUMMARY.ytPublishedAt ? `Since ${SUMMARY.ytPublishedAt.slice(0, 7)}` : '—';
            if (document.getElementById('ytSubtitle')) document.getElementById('ytSubtitle').textContent = `Published ${SUMMARY.ytPublishedAt || '—'} · ${fmt(SUMMARY.ytTotalVideos)} videos total`;
            // ── GA4 ──
            if (hasGA) {
                scheduleGaRangeTotals();
                const gaF = GA4_DAILY.filter(d => inRange(d.date));
                const summedUsers = gaF.reduce((s, d) => s + d.users, 0);
                const summedNewUsers = gaF.reduce((s, d) => s + d.newUsers, 0);
                const summedViews = gaF.reduce((s, d) => s + d.views, 0);
                const summedSess = gaF.reduce((s, d) => s + d.sessions, 0);
                const summedConv = gaF.reduce((s, d) => s + d.conversions, 0);
                const period = readyGaPeriod('current');
                const gaUsers = period ? period.users : summedUsers;
                const gaNewUsers = period ? period.newUsers : summedNewUsers;
                const gaViews = period ? period.views : summedViews;
                const gaSess = period ? period.sessions : summedSess;
                const gaConv = period ? period.conversions : summedConv;
                const gaDays = gaF.length;
                const totalsPending = !period && gaRangeTotals?.status !== 'error';

                const shownSpan = visibleGaSpan() || { start, end };
                const shownDates = `${formatPrettyDate(shownSpan.start)} → ${formatPrettyDate(shownSpan.end)}`;
                document.getElementById('kpi-users').textContent = totalsPending ? '…' : fmt(gaUsers);
                document.getElementById('kpi-users-sub').textContent = shownDates;
                const kpiViewsEl = document.getElementById('kpi-views');
                if (kpiViewsEl) kpiViewsEl.textContent = totalsPending ? '…' : fmt(gaViews);
                const kpiViewsSubEl = document.getElementById('kpi-views-sub');
                if (kpiViewsSubEl) kpiViewsSubEl.textContent = shownDates;
                document.getElementById('ga-users').textContent = totalsPending ? '…' : fmt(gaUsers);
                document.getElementById('ga-users-d').textContent = shownDates;
                document.getElementById('ga-new').textContent = totalsPending ? '…' : fmt(gaNewUsers);
                document.getElementById('ga-new-pct').textContent = !totalsPending && gaUsers > 0 ? `${((gaNewUsers / gaUsers) * 100).toFixed(1)}% new` : '—';
                document.getElementById('ga-pv').textContent = totalsPending ? '…' : fmt(gaViews);
                document.getElementById('ga-pv-d').textContent = shownDates;
                document.getElementById('ga-sess').textContent = totalsPending ? '…' : fmt(gaSess);
                document.getElementById('ga-sess-d').textContent = !totalsPending && gaUsers > 0 ? `${(gaSess / gaUsers).toFixed(2)}/user` : '—';
                document.getElementById('ga-conv').textContent = totalsPending ? '…' : fmt(gaConv);
                document.getElementById('ga-conv-d').textContent = !totalsPending && gaUsers > 0 ? `${((gaConv / gaUsers) * 100).toFixed(1)}% rate` : '—';

                const gaSubText = `${start} → ${end} · ${gaDays} days`;
                document.getElementById('ovChartSub').textContent = gaSubText;
                document.getElementById('gaDailySub').textContent = gaSubText;

                const gaDS = {
                    labels: gaF.map(d => d.date.slice(5)),
                    datasets: [
                        { label: 'Active Users', data: gaF.map(d => d.users), borderColor: C.blue, backgroundColor: 'rgba(0,102,204,.08)', fill: true, tension: .4, pointRadius: 2, borderWidth: 2 },
                        { label: 'Page Views', data: gaF.map(d => d.views), borderColor: C.teal, backgroundColor: 'rgba(0,204,204,.04)', fill: true, tension: .4, pointRadius: 2, borderWidth: 2 }
                    ]
                };
                makeChart('overviewUsersChart', 'line', gaDS, baseOpts(true));
                makeChart('gaDailyChart', 'line', gaDS, baseOpts(true));

                const durF = gaF.filter(d => d.dur > 0).sort((a, b) => b.dur - a.dur).slice(0, 10);
                makeChart('gaSessionDurChart', 'bar', {
                    labels: durF.map(d => d.date.slice(5)),
                    datasets: [{ label: 'Avg Duration (s)', data: durF.map(d => Math.round(d.dur)), backgroundColor: `${C.up}bb`, borderRadius: 4 }]
                }, {
                    ...baseOpts(), indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
                    scales: { x: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 } } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } }
                });

                if (GA4_CHANNELS.length) {
                    const chOpts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed.toLocaleString()}` } } } };
                    const chDS = { labels: GA4_CHANNELS.map(c => c.channel), datasets: [{ data: GA4_CHANNELS.map(c => c.sessions), backgroundColor: C.mixed, borderWidth: 2, borderColor: '#161c27' }] };
                    makeChart('overviewChannelChart', 'doughnut', chDS, chOpts);
                    makeChart('gaChannelDoughnut', 'doughnut', chDS, { ...chOpts, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed.toLocaleString()}` } } } });
                    makeChart('gaChannelBar', 'bar', {
                        labels: GA4_CHANNELS.map(c => c.channel),
                        datasets: [{ label: 'Sessions', data: GA4_CHANNELS.map(c => c.sessions), backgroundColor: C.mixed, borderRadius: 4 }]
                    }, { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } } });
                }

                // Top pages tables (GA4 tab + Overview tab)
                // FIX: previously read from window._GA4_PAGES, which was only ever set if
                // payload.GA4_PAGES existed — but the backend never sent that key, so
                // these tables always rendered empty regardless of date filter.
                // Now reads from the GA4_PAGES state populated directly by applyDataset().
                const gaTP = document.getElementById('gaTopPagesTable');
                const gaPagesND = document.getElementById('gaPagesNoData');
                const col3Head = document.getElementById('gaTopPagesCol3');
                if (gaTP) {
                    gaTP.innerHTML = '';
                    if (!GA4_PAGES.length) {
                        if (gaPagesND) gaPagesND.style.display = 'block';
                    } else {
                        if (gaPagesND) gaPagesND.style.display = 'none';

                        const firstPage = GA4_PAGES[0];
                        const hasSecondary = firstPage && firstPage.secondaryDimKey && firstPage.secondaryDimVal;

                        if (col3Head) {
                            if (hasSecondary) {
                                function getDimName(key) {
                                    for (const cat of Object.values(GA4_FILTER_SCHEMA)) {
                                        const found = cat.dimensions.find(d => d.key === key);
                                        if (found) return found.name;
                                    }
                                    return key.charAt(0).toUpperCase() + key.slice(1);
                                }
                                col3Head.textContent = getDimName(firstPage.secondaryDimKey);
                            } else {
                                col3Head.textContent = 'Title';
                            }
                        }

                        GA4_PAGES.forEach((p, i) => {
                            const tr = document.createElement('tr');
                            const rawTitle = p.title || '';
                            const cleanTitle = rawTitle.replace(/IntoAEC/g, 'MAEC').replace(/intoaec/gi, 'MAEC');
                            const col3Val = (p.secondaryDimKey && p.secondaryDimVal) ? p.secondaryDimVal : cleanTitle;
                            tr.innerHTML = `<td><span class="rank-badge">${i + 1}</span></td><td><span class="page-name">${p.path}</span></td><td style="font-size:11px;color:var(--text2);">${col3Val}</td><td style="text-align:right;">${fmt(p.views)}</td><td style="text-align:right;">${p.duration}s</td>`;
                            gaTP.appendChild(tr);
                        });
                    }
                }
                const ovTP = document.getElementById('ovTopPagesTable');
                if (ovTP) {
                    ovTP.innerHTML = '';
                    if (!GA4_PAGES.length) {
                        ovTP.innerHTML = '<tr><td colspan="4" class="no-data">No page-view data available</td></tr>';
                    } else {
                        GA4_PAGES.slice(0, 5).forEach((p, i) => {
                            const tr = document.createElement('tr');
                            tr.innerHTML = `<td><span class="rank-badge">${i + 1}</span></td><td><span class="page-name">${p.path}</span></td><td>${fmt(p.views)}</td><td>${p.duration}s</td>`;
                            ovTP.appendChild(tr);
                        });
                    }
                }

                // ── SaaS Benchmarks Table ──
                const gaBenchTbl = document.getElementById('gaBenchmarksTable');
                const gaBenchND = document.getElementById('gaBenchmarksNoData');
                if (gaBenchTbl) {
                    gaBenchTbl.innerHTML = '';
                    if (!gaF.length) {
                        if (gaBenchND) gaBenchND.style.display = 'block';
                    } else {
                        if (gaBenchND) gaBenchND.style.display = 'none';

                        // Set active profile tag
                        const profileTag = document.getElementById('gaBenchmarkProfileTag');
                        if (profileTag && typeof ACTIVE_BENCHMARK_PROFILE !== 'undefined') {
                            profileTag.textContent = `${ACTIVE_BENCHMARK_PROFILE} Profile`;
                        }

                        // Calculate date ranges
                        const currentStart = start;
                        const currentEnd = end;

                        // Helper to get previous period
                        const getPrevPeriod = (startStr, endStr) => {
                            const s = new Date(startStr + 'T00:00:00Z');
                            const e = new Date(endStr + 'T00:00:00Z');
                            const dur = e.getTime() - s.getTime() + 86400000;
                            const prevEnd = new Date(s.getTime() - 86400000);
                            const prevStart = new Date(prevEnd.getTime() - dur + 86400000);
                            const iso = d => d.toISOString().slice(0, 10);
                            return { start: iso(prevStart), end: iso(prevEnd) };
                        };

                        const prevPeriod = getPrevPeriod(currentStart, currentEnd);

                        // Update table header date ranges
                        const shortCurrent = formatShortDateRange(currentStart, currentEnd);
                        const shortPrevious = formatShortDateRange(prevPeriod.start, prevPeriod.end);
                        document.getElementById('gaBenchCurrentHeader').textContent = shortCurrent;
                        document.getElementById('gaBenchPreviousHeader').textContent = shortPrevious;

                        // Filter data rows for each period
                        const currentRows = GA4_DAILY.filter(d => d.date >= currentStart && d.date <= currentEnd);
                        const previousRows = GA4_DAILY.filter(d => d.date >= prevPeriod.start && d.date <= prevPeriod.end);

                        // Helper to format short date range (e.g. Aug 17–23)
                        function formatShortDateRange(startStr, endStr) {
                            const s = new Date(startStr + 'T00:00:00Z');
                            const e = new Date(endStr + 'T00:00:00Z');
                            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                            const sm = months[s.getUTCMonth()];
                            const em = months[e.getUTCMonth()];
                            const sd = s.getUTCDate();
                            const ed = e.getUTCDate();
                            return sm === em ? `${sm} ${sd}–${ed}` : `${sm} ${sd} – ${em} ${ed}`;
                        }

                        // Calculate metrics values
                        const calcMetrics = (rows) => {
                            const u = rows.reduce((s, r) => s + (r.users || 0), 0);
                            const v = rows.reduce((s, r) => s + (r.views || 0), 0);
                            const s = rows.reduce((s, r) => s + (r.sessions || 0), 0);
                            const d = rows.reduce((s, r) => s + ((r.dur || 0) * (r.sessions || 0)), 0);
                            const demo = rows.reduce((s, r) => s + (r.demoViews || 0), 0);

                            return {
                                users: u,
                                avg_engagement_time: s > 0 ? (d / s) : 0,
                                views_per_user: u > 0 ? (v / u) : 0,
                                demo_page_views: demo
                            };
                        };

                        const currVals = calcMetrics(currentRows);
                        const prevVals = calcMetrics(previousRows);
                        const periodCurrent = readyGaPeriod('current');
                        const periodPrevious = readyGaPeriod('previous');
                        if (periodCurrent) {
                            currVals.users = periodCurrent.users;
                            currVals.views_per_user = periodCurrent.users > 0 ? (periodCurrent.views / periodCurrent.users) : 0;
                            currVals.avg_engagement_time = periodCurrent.avgSessionDuration;
                        }
                        if (periodPrevious) {
                            prevVals.users = periodPrevious.users;
                            prevVals.views_per_user = periodPrevious.users > 0 ? (periodPrevious.views / periodPrevious.users) : 0;
                            prevVals.avg_engagement_time = periodPrevious.avgSessionDuration;
                        }

                        // Format metric values for display
                        const formatVal = (key, val, isEmpty = false) => {
                            if (isEmpty || val === null || val === undefined || isNaN(val) || val === 0) {
                                return '—';
                            }
                            if (key === 'avg_engagement_time') {
                                return `${Math.round(val)}s`;
                            }
                            if (key === 'views_per_user') {
                                return val.toFixed(2);
                            }
                            return fmt(Math.round(val));
                        };

                        // Render each metric row defined in the profile
                        const profile = window.BenchmarkService ? window.BenchmarkService.getProfile() : null;
                        if (profile && profile.metrics) {
                            Object.keys(profile.metrics).forEach(metricKey => {
                                const metricConfig = profile.metrics[metricKey];
                                const currRawVal = currVals[metricKey];
                                const prevRawVal = prevVals[metricKey];

                                // Check if we have previous data for WoW calculation
                                const hasPrevData = previousRows.length > 0 && prevRawVal > 0;
                                const isCurrEmpty = currentRows.length === 0;

                                const currDisp = formatVal(metricKey, currRawVal, isCurrEmpty);
                                const prevDisp = formatVal(metricKey, prevRawVal, !hasPrevData);

                                // WoW Delta
                                let wowDeltaHtml = '<span style="color:var(--text2);">—</span>';
                                if (!isCurrEmpty && hasPrevData) {
                                    const pct = ((currRawVal - prevRawVal) / prevRawVal) * 100;
                                    const arrow = pct > 0.1 ? '▲' : pct < -0.1 ? '▼' : '–';
                                    const color = pct > 0.1 ? 'var(--up)' : pct < -0.1 ? 'var(--down)' : 'var(--text2)';
                                    const prefix = pct > 0.1 ? '+' : '';
                                    wowDeltaHtml = `<span style="color:${color}; font-weight:600;">${arrow} ${prefix}${pct.toFixed(1)}%</span>`;
                                }

                                // Benchmark Comparison & Status
                                let benchmarkDisp = metricConfig.label || '—';
                                let statusBadgeHtml = '';

                                if (window.BenchmarkService) {
                                    const result = window.BenchmarkService.compare(metricKey, currRawVal);
                                    let badgeClass = 'status-none';
                                    if (result.status === 'Below benchmark') badgeClass = 'status-below';
                                    else if (result.status === 'Within benchmark') badgeClass = 'status-within';
                                    else if (result.status === 'Above benchmark') badgeClass = 'status-above';

                                    // Display status badge if it's not a "none" benchmark
                                    if (metricConfig.type !== 'none' && metricConfig.type !== 'signal') {
                                        statusBadgeHtml = `<span class="status-badge ${badgeClass}">${result.status}</span>`;
                                    } else {
                                        statusBadgeHtml = `<span class="status-badge status-none">${result.status}</span>`;
                                    }
                                }

                                const tr = document.createElement('tr');
                                tr.innerHTML = `
                                    <td style="font-weight: 500;">${metricConfig.name}</td>
                                    <td style="text-align:right; font-weight: 600;">${currDisp}</td>
                                    <td style="text-align:right; color:var(--text2);">${prevDisp}</td>
                                    <td style="text-align:right;">${wowDeltaHtml}</td>
                                    <td>${benchmarkDisp}</td>
                                    <td>${statusBadgeHtml}</td>
                                `;
                                gaBenchTbl.appendChild(tr);
                            });
                        }
                    }
                }

                // Dynamic observations
                const obsEl = document.getElementById('observationsContent');
                if (obsEl && gaF.length) {
                    const peakDay = gaF.reduce((a, b) => b.users > a.users ? b : a);
                    obsEl.innerHTML = `
        <div class="obs-card obs-up" style="margin-top:0;">
          <div class="obs-icon">🌐</div>
          <div class="obs-text"><h4>GA4 peaked ${peakDay.date} with ${fmt(peakDay.users)} users</h4><p>Highest single-day traffic: ${fmt(peakDay.users)} active users, ${fmt(peakDay.views)} page views.</p></div>
        </div>
        <div class="obs-card obs-neutral">
          <div class="obs-icon">📸</div>
          <div class="obs-text"><h4>Instagram driving highest engagement</h4><p>${fmt(SUMMARY.igFollowers)} followers. Reels consistently outperform Feed posts.</p></div>
        </div>
        <div class="obs-card obs-warn">
          <div class="obs-icon">📘</div>
          <div class="obs-text"><h4>Facebook reach data unavailable</h4><p>Reach is reported as 0 for the 28-day window — API limitation. Media views confirm content is being served.</p></div>
        </div>`;
                }
            }

            // ── Facebook ──
            if (hasFB) {
                const fbF = FB_POSTS.filter(d => inRange(d.date)).sort((a, b) => b.date.localeCompare(a.date));
                const fbLikes = fbF.reduce((s, p) => s + p.likes, 0);
                const fbComments = fbF.reduce((s, p) => s + p.comments, 0);
                const fbShares = fbF.reduce((s, p) => s + p.shares, 0);
                const fbMV = fbF.reduce((s, p) => s + (p.mediaViews || 0), 0);
                const fbCount = fbF.length;

                document.getElementById('fb-likes').textContent = fmt(fbLikes);
                document.getElementById('fb-likes-d').textContent = `${fbCount} posts`;
                document.getElementById('fb-comments').textContent = fmt(fbComments);
                document.getElementById('fb-comments-d').textContent = `${fbCount} posts`;
                document.getElementById('fb-posts-count').textContent = fmt(fbCount);
                document.getElementById('fb-posts-d').textContent = `in ${label}`;
                document.getElementById('fb-mediaviews').textContent = fmt(fbMV);
                const fbSub = `${label} · ${fbCount} posts`;
                document.getElementById('fbTypeChartSub').textContent = fbSub;
                document.getElementById('fbTopChartSub').textContent = fbSub;
                document.getElementById('fbTableSub').textContent = fbSub;
                document.getElementById('fbSubOv').textContent = fbSub;

                const fbTC = {};
                fbF.forEach(p => { fbTC[p.type] = (fbTC[p.type] || 0) + 1; });
                const doughOpts = (pos = 'right') => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: pos, labels: { font: { size: 10 }, boxWidth: 10 } } } });
                makeChart('fbTypeChart', 'doughnut', { labels: Object.keys(fbTC), datasets: [{ data: Object.values(fbTC), backgroundColor: C.mixed.slice(0, Object.keys(fbTC).length), borderWidth: 2, borderColor: '#161c27' }] }, doughOpts());
                makeChart('fbPostTypeChart', 'doughnut', { labels: Object.keys(fbTC), datasets: [{ data: Object.values(fbTC), backgroundColor: C.mixed.slice(0, Object.keys(fbTC).length), borderWidth: 2, borderColor: '#161c27' }] }, doughOpts('right'));

                const fbTop = [...fbF].sort((a, b) => b.likes - a.likes).slice(0, 10);
                makeChart('fbTopPostsChart', 'bar', {
                    labels: fbTop.map(p => p.date.slice(5)),
                    datasets: [
                        { label: 'Likes', data: fbTop.map(p => p.likes), backgroundColor: `${C.blue}bb`, borderRadius: 4 },
                        { label: 'Comments', data: fbTop.map(p => p.comments), backgroundColor: `${C.teal}bb`, borderRadius: 4 }
                    ]
                }, { ...baseOpts(true), plugins: { legend: { display: true, position: 'top', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { mode: 'index', intersect: false } } });

                makeChart('fbEngMixChart', 'bar', {
                    labels: ['Likes', 'Comments', 'Shares'],
                    datasets: [{ data: [fbLikes, fbComments, fbShares], backgroundColor: [C.blue, C.teal, C.up], borderRadius: 6 }]
                }, { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } } });

                const fbTbl = document.getElementById('fbPostsTable');
                const fbND = document.getElementById('fbNoData');
                fbTbl.innerHTML = '';
                if (!fbF.length) { fbND.style.display = 'block'; }
                else {
                    fbND.style.display = 'none';
                    fbF.forEach(p => {
                        const tc = { photo: 'type-photo', video: 'type-video', album: 'type-photo', share: 'type-share', event: 'type-feed' }[p.type] || 'type-feed';
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td>${p.date.slice(5)}</td><td><span class="type-badge ${tc}">${p.type}</span></td><td>${p.likes}</td><td>${p.comments}</td><td>${p.shares}</td><td>${p.mediaViews || '—'}</td>`;
                        fbTbl.appendChild(tr);
                    });
                }
            }

            // ── Instagram ──
            if (hasIG) {
                const igF = IG_POSTS.filter(d => inRange(d.date)).sort((a, b) => b.date.localeCompare(a.date));
                const igLikes = igF.reduce((s, p) => s + p.likes, 0);
                const igComments = igF.reduce((s, p) => s + p.comments, 0);
                const igCount = igF.length;
                const igAvg = igCount > 0 ? (igLikes / igCount).toFixed(1) : 0;
                const igEngRate = ((igLikes + igComments) / (SUMMARY.igFollowers || 1) * 100).toFixed(2);

                document.getElementById('ig-posts').textContent = fmt(igCount);
                document.getElementById('ig-posts-d').textContent = `in ${label}`;
                document.getElementById('ig-likes').textContent = fmt(igLikes);
                document.getElementById('ig-likes-avg').textContent = `${igAvg}/post avg`;
                document.getElementById('ig-comments').textContent = fmt(igComments);
                document.getElementById('ig-comments-d').textContent = `${igCount} posts`;
                document.getElementById('ig-eng').textContent = fmt(igLikes + igComments);
                document.getElementById('ig-eng-rate').textContent = `${igEngRate}%`;
                const igSub = `${label} · ${igCount} posts`;
                ['igLikesSub', 'igTypeSub', 'igTopSub', 'igSubOv'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = igSub; });

                const igTopOv = [...igF].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, 10);
                makeChart('igEngChart', 'bar', {
                    labels: igTopOv.map((_, i) => `#${i + 1}`),
                    datasets: [{ label: 'Likes', data: igTopOv.map(p => p.likes), backgroundColor: C.mixed.map(c => c + 'bb'), borderRadius: 4 }]
                }, { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 9 } } }, y: { grid: { color: '#2a3346' }, ticks: { font: { size: 9 } } } } });

                makeChart('igLikesTrendChart', 'line', {
                    labels: igF.map(p => p.date.slice(5)),
                    datasets: [{ label: 'Likes', data: igF.map(p => p.likes), borderColor: C.purple, backgroundColor: 'rgba(124,58,237,.08)', fill: true, tension: .4, pointRadius: 3, borderWidth: 2 }]
                }, { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } } });

                const igTC = { REELS: 0, FEED: 0 };
                igF.forEach(p => { igTC[p.type] = (igTC[p.type] || 0) + 1; });
                makeChart('igTypeChart', 'doughnut', { labels: ['Reels', 'Feed Posts'], datasets: [{ data: [igTC.REELS, igTC.FEED], backgroundColor: [C.purple, C.teal], borderWidth: 2, borderColor: '#161c27' }] },
                    { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 12 }, boxWidth: 12 } } } });

                const reels = igF.filter(p => p.type === 'REELS'), feed = igF.filter(p => p.type === 'FEED');
                const rAvg = reels.length ? +(reels.reduce((s, p) => s + p.likes, 0) / reels.length).toFixed(1) : 0;
                const fAvg = feed.length ? +(feed.reduce((s, p) => s + p.likes, 0) / feed.length).toFixed(1) : 0;
                makeChart('igTypeEngChart', 'bar', { labels: ['Avg Likes — Reels', 'Avg Likes — Feed'], datasets: [{ data: [rAvg, fAvg], backgroundColor: [`${C.purple}bb`, `${C.teal}bb`], borderRadius: 6 }] },
                    { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 } } } } });

                const igTbl = document.getElementById('igTopPostsTable');
                const igND = document.getElementById('igNoData');
                igTbl.innerHTML = '';
                if (!igF.length) { igND.style.display = 'block'; }
                else {
                    igND.style.display = 'none';
                    [...igF].sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments)).slice(0, 12).forEach((p, i) => {
                        const tc = p.type === 'REELS' ? 'type-reel' : 'type-feed';
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td><span class="rank-badge">${i + 1}</span></td><td><span class="type-badge ${tc}">${p.type}</span></td><td>${p.date.slice(5)}</td><td>${p.likes}</td><td>${p.comments}</td><td><strong>${p.likes + p.comments}</strong></td>`;
                        igTbl.appendChild(tr);
                    });
                }
            }

            // ── YouTube ──
            if (hasYT) {
                const ytF = YT_VIDEOS.filter(d => inRange(d.date)).sort((a, b) => b.date.localeCompare(a.date));
                const ytViews = ytF.reduce((s, v) => s + v.views, 0);
                const ytLikes = ytF.reduce((s, v) => s + v.likes, 0);
                const ytComments = ytF.reduce((s, v) => s + v.comments, 0);
                const ytCount = ytF.length;

                document.getElementById('kpi-yt-videos').textContent = fmt(ytCount);
                document.getElementById('kpi-yt-sub').textContent = `${ytCount} videos · ${fmt(ytViews)} views`;
                document.getElementById('yt-videos').textContent = fmt(ytCount);
                document.getElementById('yt-videos-d').textContent = `in ${label}`;
                document.getElementById('yt-views').textContent = fmt(ytViews);
                document.getElementById('yt-views-d').textContent = ytCount ? `${(ytViews / ytCount).toFixed(1)}/video avg` : '—';
                document.getElementById('yt-likes').textContent = fmt(ytLikes);
                document.getElementById('yt-comments').textContent = fmt(ytComments);

                const ytSub = `${label} · ${ytCount} videos`;
                ['ytViewsSub', 'ytTypeSub', 'ytTableSub'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ytSub; });

                const ytChron = [...ytF].sort((a, b) => a.date.localeCompare(b.date));
                makeChart('ytViewsTrendChart', 'bar', {
                    labels: ytChron.map(v => v.date.slice(5)),
                    datasets: [{ label: 'Views', data: ytChron.map(v => v.views), backgroundColor: ytChron.map(v => v.type === 'SHORT' ? `${C.warn}cc` : `${C.down}cc`), borderRadius: 4 }]
                }, {
                    ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { title: items => { const v = ytChron[items[0].dataIndex]; return (v.title || '').length > 30 ? v.title.slice(0, 30) + '…' : v.title; }, label: ctx => `Views: ${ctx.parsed.y}` } } },
                    scales: { x: { grid: { display: false }, ticks: { font: { size: 9 }, maxRotation: 60 } }, y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 } } } }
                });

                const ytTC = { SHORT: 0, LONG: 0 };
                ytF.forEach(v => { ytTC[v.type] = (ytTC[v.type] || 0) + 1; });
                makeChart('ytTypeChart', 'doughnut', { labels: ['Shorts', 'Long-form'], datasets: [{ data: [ytTC.SHORT, ytTC.LONG], backgroundColor: [C.warn, C.down], borderWidth: 2, borderColor: '#161c27' }] },
                    { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 12 }, boxWidth: 12 } } } });

                const ytTbl = document.getElementById('ytVideosTable');
                const ytND = document.getElementById('ytNoData');
                ytTbl.innerHTML = '';
                if (!ytF.length) { ytND.style.display = 'block'; }
                else {
                    ytND.style.display = 'none';
                    ytF.slice(0, 20).forEach((v, i) => {
                        const tc = v.type === 'SHORT' ? 'type-short' : 'type-long';
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td><span class="rank-badge">${i + 1}</span></td><td>${v.date.slice(5)}</td><td style="font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${v.title}">${v.title}</td><td><span class="type-badge ${tc}">${v.type}</span></td><td>${v.views}</td><td>${v.likes}</td><td>${v.comments}</td>`;
                        ytTbl.appendChild(tr);
                    });
                }

                const ytBench = document.getElementById('ytBenchList');
                if (ytBench) {
                    const allViews = YT_VIDEOS.reduce((s, v) => s + v.views, 0);
                    const allCount = YT_VIDEOS.length;
                    const avgV = allCount ? (allViews / allCount).toFixed(1) : 0;
                    const maxSubs = 500, maxViews = 10000, maxVids = 200;
                    ytBench.innerHTML = `
        <div class="bench-row"><div class="bench-label">Total Subscribers (${fmt(SUMMARY.ytSubscribers || 0)})</div><div class="bench-track"><div class="bench-fill fill-warn" style="width:${Math.min(100, (SUMMARY.ytSubscribers || 0) / maxSubs * 100).toFixed(0)}%;"></div></div><div class="bench-val">${fmt(SUMMARY.ytSubscribers || 0)}</div></div>
        <div class="bench-row"><div class="bench-label">Total Views (${fmt(SUMMARY.ytTotalViews || allViews)})</div><div class="bench-track"><div class="bench-fill fill-primary" style="width:${Math.min(100, (SUMMARY.ytTotalViews || allViews) / maxViews * 100).toFixed(0)}%;"></div></div><div class="bench-val">${fmt(SUMMARY.ytTotalViews || allViews)}</div></div>
        <div class="bench-row"><div class="bench-label">Videos Published (${allCount})</div><div class="bench-track"><div class="bench-fill fill-up" style="width:${Math.min(100, allCount / maxVids * 100).toFixed(0)}%;"></div></div><div class="bench-val">${allCount}</div></div>
        <div class="bench-row"><div class="bench-label">Avg Views / Video</div><div class="bench-track"><div class="bench-fill fill-warn" style="width:${Math.min(100, +avgV / 200 * 100).toFixed(0)}%;"></div></div><div class="bench-val">${avgV}</div></div>`;
                }
            }

            // ── Audience chart ──
            if (hasAny) {
                makeChart('audienceChart', 'bar', {
                    labels: ['IG Followers', 'FB Fans', 'YT Subs'],
                    datasets: [{ data: [SUMMARY.igFollowers || 0, SUMMARY.fbFans || 0, SUMMARY.ytSubscribers || 0], backgroundColor: [C.blue, C.teal, C.down], borderRadius: 6 }]
                }, { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { grid: { display: false }, ticks: { font: { size: 11 } } }, y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 } } } } });
            }

            renderWeeklyComparison();
        }

        // ── Weekly comparison ─────────────────────────────────────────────────────────
        function weekBuckets() {
            const end = new Date(REF_DATE);
            const tws = new Date(end); tws.setDate(end.getDate() - 6);
            const lwe = new Date(tws); lwe.setDate(tws.getDate() - 1);
            const lws = new Date(lwe); lws.setDate(lwe.getDate() - 6);
            const iso = d => d.toISOString().slice(0, 10);
            return { thisStart: iso(tws), thisEnd: iso(end), lastStart: iso(lws), lastEnd: iso(lwe) };
        }
        function sumW(dataset, dateKey, keys, s, e) {
            const rows = dataset.filter(d => d[dateKey] >= s && d[dateKey] <= e);
            const out = { count: rows.length };
            keys.forEach(k => { out[k] = rows.reduce((a, r) => a + (r[k] || 0), 0); });
            return out;
        }
        function pctD(curr, prev) { if (prev === 0) return curr === 0 ? 0 : 100; return ((curr - prev) / prev) * 100; }
        function deltaBadge(pct) {
            const cls = pct > 0.5 ? 'delta-up' : pct < -0.5 ? 'delta-down' : 'delta-neutral';
            const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '–';
            const bg = pct > 0.5 ? 'var(--up-bg)' : pct < -0.5 ? 'var(--down-bg)' : 'var(--neutral-bg)';
            const col = pct > 0.5 ? 'var(--up)' : pct < -0.5 ? 'var(--down)' : 'var(--neutral)';
            return `<span class="wk-delta" style="background:${bg};color:${col};">${arrow} ${Math.abs(pct).toFixed(0)}%</span>`;
        }
        function wkRow(name, curr, prev) { return `<div class="wk-row"><div class="wk-metric-name">${name}</div><div class="wk-values"><span class="wk-val-this">${fmt(curr)}</span><span class="wk-val-prev">vs ${fmt(prev)}</span>${deltaBadge(pctD(curr, prev))}</div></div>`; }

        function renderWeeklyComparison() {
            const { thisStart, thisEnd, lastStart, lastEnd } = weekBuckets();
            document.getElementById('weeklyRangeTag').textContent = `${thisStart} → ${thisEnd}`;
            document.getElementById('weeklyRangeLabel').textContent = `This week (${thisStart}→${thisEnd}) vs last week (${lastStart}→${lastEnd})`;

            const fbThis = sumW(FB_POSTS, 'date', ['likes', 'comments', 'shares', 'mediaViews'], thisStart, thisEnd);
            const fbLast = sumW(FB_POSTS, 'date', ['likes', 'comments', 'shares', 'mediaViews'], lastStart, lastEnd);
            const igThis = sumW(IG_POSTS, 'date', ['likes', 'comments'], thisStart, thisEnd);
            const igLast = sumW(IG_POSTS, 'date', ['likes', 'comments'], lastStart, lastEnd);
            const ytThis = sumW(YT_VIDEOS, 'date', ['views', 'likes', 'comments'], thisStart, thisEnd);
            const ytLast = sumW(YT_VIDEOS, 'date', ['views', 'likes', 'comments'], lastStart, lastEnd);
            const gaThisSum = sumW(GA4_DAILY, 'date', ['users', 'views', 'sessions', 'conversions'], thisStart, thisEnd);
            const gaLastSum = sumW(GA4_DAILY, 'date', ['users', 'views', 'sessions', 'conversions'], lastStart, lastEnd);
            const thisWeekTotals = readyGaPeriod('thisWeek');
            const lastWeekTotals = readyGaPeriod('lastWeek');
            const gaThis = thisWeekTotals ? { users: thisWeekTotals.users, views: thisWeekTotals.views, sessions: thisWeekTotals.sessions, conversions: thisWeekTotals.conversions } : gaThisSum;
            const gaLast = lastWeekTotals ? { users: lastWeekTotals.users, views: lastWeekTotals.views, sessions: lastWeekTotals.sessions, conversions: lastWeekTotals.conversions } : gaLastSum;

            document.getElementById('weeklyCards').innerHTML = `
    <div class="wk-card"><div class="wk-card-head"><span class="wk-icon">📘</span><h3>Facebook</h3></div>
      ${wkRow('Posts', fbThis.count, fbLast.count)}${wkRow('Likes', fbThis.likes, fbLast.likes)}${wkRow('Comments', fbThis.comments, fbLast.comments)}${wkRow('Media Views', fbThis.mediaViews, fbLast.mediaViews)}</div>
    <div class="wk-card"><div class="wk-card-head"><span class="wk-icon">📸</span><h3>Instagram</h3></div>
      ${wkRow('Posts', igThis.count, igLast.count)}${wkRow('Likes', igThis.likes, igLast.likes)}${wkRow('Comments', igThis.comments, igLast.comments)}${wkRow('Engagement', igThis.likes + igThis.comments, igLast.likes + igLast.comments)}</div>
    <div class="wk-card"><div class="wk-card-head"><span class="wk-icon">▶️</span><h3>YouTube</h3></div>
      ${wkRow('Videos', ytThis.count, ytLast.count)}${wkRow('Views', ytThis.views, ytLast.views)}${wkRow('Likes', ytThis.likes, ytLast.likes)}${wkRow('Comments', ytThis.comments, ytLast.comments)}</div>
    <div class="wk-card"><div class="wk-card-head"><span class="wk-icon">🌐</span><h3>Google Analytics</h3></div>
      ${wkRow('Active Users', gaThis.users, gaLast.users)}${wkRow('Page Views', gaThis.views, gaLast.views)}${wkRow('Sessions', gaThis.sessions, gaLast.sessions)}${wkRow('Conversions', gaThis.conversions, gaLast.conversions)}</div>`;

            makeChart('weeklyEngagementChart', 'bar', {
                labels: ['Facebook', 'Instagram', 'YouTube'],
                datasets: [
                    { label: 'Last Week', data: [fbLast.likes + fbLast.comments, igLast.likes + igLast.comments, ytLast.likes + ytLast.comments], backgroundColor: `${C.muted}99`, borderRadius: 4 },
                    { label: 'This Week', data: [fbThis.likes + fbThis.comments, igThis.likes + igThis.comments, ytThis.likes + ytThis.comments], backgroundColor: `${C.blue}cc`, borderRadius: 4 }
                ]
            }, { ...baseOpts(true), plugins: { legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } } });

            const dayLabels = [...Array(7)].map((_, i) => `Day ${i + 1}`);
            const buildSeries = startStr => dayLabels.map((_, i) => { const d = new Date(startStr); d.setDate(d.getDate() + i); const iso = d.toISOString().slice(0, 10); const row = GA4_DAILY.find(r => r.date === iso); return row ? row.users : 0; });
            makeChart('weeklyGaChart', 'line', {
                labels: dayLabels,
                datasets: [
                    { label: 'Last Week', data: buildSeries(lastStart), borderColor: C.muted, backgroundColor: 'rgba(112,128,160,.06)', fill: true, tension: .4, pointRadius: 2, borderWidth: 2, borderDash: [5, 4] },
                    { label: 'This Week', data: buildSeries(thisStart), borderColor: C.blue, backgroundColor: 'rgba(0,102,204,.08)', fill: true, tension: .4, pointRadius: 2, borderWidth: 2 }
                ]
            }, baseOpts(true));
        }

        // ── LinkedIn rendering ─────────────────────────────────────────────────────────────────
        function renderLinkedIn() {
            return;
            if (!LI_DAILY.length) return;
            const { start, end } = getDateRange();
            const label = rangeLabel();

            // Filter daily data by date range for KPI metrics
            const liF = LI_DAILY.filter(d => inRange(d.date));
            const liSessions = liF.reduce((s, d) => s + d.sessions, 0);
            const liUsers = liF.reduce((s, d) => s + d.users, 0);
            const liViews = liF.reduce((s, d) => s + d.views, 0);
            const liConv = liF.reduce((s, d) => s + d.conversions, 0);
            const liAvgDur = liF.length ? (liF.reduce((s, d) => s + d.dur, 0) / liF.length).toFixed(1) : 0;
            const liDays = liF.length;

            // Update KPI cards
            const setEl = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
            setEl('li-sessions', fmt(liSessions));
            setEl('li-sessions-d', `${liDays} days`);
            setEl('li-users', fmt(liUsers));
            setEl('li-users-d', liSessions > 0 ? `${((liUsers / liSessions) * 100).toFixed(1)}% return` : '—');
            setEl('li-views', fmt(liViews));
            setEl('li-views-d', liUsers > 0 ? `${(liViews / liUsers).toFixed(2)}/user` : '—');
            setEl('li-dur', `${liAvgDur}s`);
            setEl('li-conv', fmt(liConv));
            setEl('li-conv-d', liSessions > 0 ? `${((liConv / liSessions) * 100).toFixed(2)}% rate` : '—');
            setEl('liDailySub', `${start} → ${end} · ${liDays} days`);

            // Daily sessions chart
            makeChart('liDailyChart', 'line', {
                labels: liF.map(d => d.date.slice(5)),
                datasets: [
                    { label: 'Sessions', data: liF.map(d => d.sessions), borderColor: '#0a66c2', backgroundColor: 'rgba(10,102,194,.1)', fill: true, tension: .4, pointRadius: 2, borderWidth: 2 },
                    { label: 'Users', data: liF.map(d => d.users), borderColor: '#1b8fe0', backgroundColor: 'rgba(27,143,224,.05)', fill: false, tension: .4, pointRadius: 2, borderWidth: 2, borderDash: [4, 3] }
                ]
            }, baseOpts(true));

            // LinkedIn vs other social channels (bar chart)
            if (LI_SOCIAL_CHANNELS.length) {
                const topChannels = LI_SOCIAL_CHANNELS.slice(0, 8);
                const bgColors = topChannels.map(c => {
                    const src = (c.source || '').toLowerCase();
                    if (src.includes('linkedin')) return '#0a66c2';
                    if (src.includes('facebook') || src.includes('fb')) return '#1877f2';
                    if (src.includes('instagram') || src.includes('ig')) return '#e1306c';
                    if (src.includes('youtube') || src.includes('yt')) return '#ff0000';
                    if (src.includes('twitter') || src.includes('x.com')) return '#1da1f2';
                    return '#7080a0';
                });
                makeChart('liSocialChart', 'bar', {
                    labels: topChannels.map(c => c.source),
                    datasets: [{ label: 'Sessions', data: topChannels.map(c => c.sessions), backgroundColor: bgColors, borderRadius: 4 }]
                }, { ...baseOpts(), plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, callbacks: { afterLabel: ctx => `Users: ${fmt(topChannels[ctx.dataIndex].users)} | Views: ${fmt(topChannels[ctx.dataIndex].views)}` } } } });
            }

            // Device breakdown doughnut
            if (LI_DEVICES.length) {
                const deviceColors = { desktop: '#0a66c2', mobile: '#1b8fe0', tablet: '#3aa3e3' };
                makeChart('liDeviceChart', 'doughnut', {
                    labels: LI_DEVICES.map(d => d.device.charAt(0).toUpperCase() + d.device.slice(1)),
                    datasets: [{ data: LI_DEVICES.map(d => d.sessions), backgroundColor: LI_DEVICES.map(d => deviceColors[d.device.toLowerCase()] || '#7080a0'), borderWidth: 2, borderColor: '#161c27' }]
                }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { size: 11 }, boxWidth: 10 } }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed.toLocaleString()} sessions` } } } });

                // Bench list
                const benchEl = document.getElementById('liBenchList');
                if (benchEl) {
                    const total = LI_DEVICES.reduce((s, d) => s + d.sessions, 0);
                    benchEl.innerHTML = LI_DEVICES.map(d => `
                        <div class="bench-row">
                            <span class="bench-label">${d.device.charAt(0).toUpperCase() + d.device.slice(1)}</span>
                            <span class="bench-val">${fmt(d.sessions)} (${total > 0 ? ((d.sessions / total) * 100).toFixed(1) : 0}%)</span>
                        </div>`).join('');
                }
            }

            // Top landing pages table
            const pagesEl = document.getElementById('liPagesTable');
            const pagesND = document.getElementById('liPagesNoData');
            if (pagesEl) {
                pagesEl.innerHTML = '';
                if (!LI_PAGES.length) {
                    if (pagesND) pagesND.style.display = 'block';
                } else {
                    if (pagesND) pagesND.style.display = 'none';
                    LI_PAGES.forEach((p, i) => {
                        const tr = document.createElement('tr');
                        tr.innerHTML = `<td><span class="rank-badge">${i + 1}</span></td><td><span class="page-name">${p.path}</span></td><td style="font-size:11px;color:var(--text2);">${p.title || '—'}</td><td>${fmt(p.sessions)}</td><td>${fmt(p.views)}</td><td>${p.duration}s</td>`;
                        pagesEl.appendChild(tr);
                    });
                }
            }
        }

        // ── GSC rendering ─────────────────────────────────────────────────────────────
        let gscQueryState = {
            search: '',
            pageSize: 10,
            currentPage: 1,
            sortField: 'clicks',
            sortOrder: 'desc'
        };

        function posClass(p) {
            if (p <= 3) return 'gsc-pos-top';
            if (p <= 10) return 'gsc-pos-mid';
            return 'gsc-pos-low';
        }

        function renderGscQueries() {
            if (!GSC_DATA || !GSC_DATA.topQueries) return;
            let data = [...GSC_DATA.topQueries];

            // 1. Search/Filter
            const searchVal = gscQueryState.search.toLowerCase().trim();
            if (searchVal) {
                data = data.filter(q => q.query.toLowerCase().includes(searchVal));
            }

            // 2. Sorting
            const field = gscQueryState.sortField;
            const order = gscQueryState.sortOrder === 'asc' ? 1 : -1;
            data.sort((a, b) => {
                let valA = a[field];
                let valB = b[field];

                if (typeof valA === 'string') {
                    return valA.localeCompare(valB) * order;
                }
                return (valA - valB) * order;
            });

            // 3. Pagination
            const totalResults = data.length;
            const totalPages = Math.ceil(totalResults / gscQueryState.pageSize) || 1;

            if (gscQueryState.currentPage > totalPages) {
                gscQueryState.currentPage = totalPages;
            }
            if (gscQueryState.currentPage < 1) {
                gscQueryState.currentPage = 1;
            }

            const startIdx = (gscQueryState.currentPage - 1) * gscQueryState.pageSize;
            const paginatedData = data.slice(startIdx, startIdx + gscQueryState.pageSize);

            // 4. Render Table
            const qTable = document.getElementById('gscQueriesTable');
            const qND = document.getElementById('gscQueriesNoData');
            if (qTable) {
                qTable.innerHTML = '';
                if (!paginatedData.length) {
                    if (qND) qND.style.display = 'block';
                } else {
                    if (qND) qND.style.display = 'none';
                    paginatedData.forEach((q, i) => {
                        const tr = document.createElement('tr');
                        const globalRank = startIdx + i + 1;
                        tr.innerHTML = `
                            <td><span class="rank-badge">${globalRank}</span></td>
                            <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${q.query}</td>
                            <td><strong>${fmt(q.clicks)}</strong></td>
                            <td>${fmt(q.impressions)}</td>
                            <td>${q.ctr}%</td>
                            <td><span class="gsc-position-badge ${posClass(q.position)}">#${q.position}</span></td>
                        `;
                        qTable.appendChild(tr);
                    });
                }
            }

            // 5. Update pagination UI
            const indicator = document.getElementById('gscQueryPageIndicator');
            if (indicator) {
                indicator.textContent = `Page ${gscQueryState.currentPage} of ${totalPages} (${totalResults} results)`;
            }

            const prevBtn = document.getElementById('gscQueryPrev');
            const nextBtn = document.getElementById('gscQueryNext');
            if (prevBtn) prevBtn.disabled = gscQueryState.currentPage === 1;
            if (nextBtn) nextBtn.disabled = gscQueryState.currentPage === totalPages;
        }

        function renderGSC() {
            if (!GSC_DATA) return;
            const d = GSC_DATA;

            // Check for empty data (Step 15: No data)
            if (!d.dailyPerformance || d.dailyPerformance.length === 0) {
                const empty = document.getElementById('gscEmpty');
                const content = document.getElementById('gscContent');
                if (empty) {
                    empty.style.display = '';
                    const title = empty.querySelector('h3');
                    const desc = empty.querySelector('p');
                    if (title) title.textContent = 'No data available';
                    if (desc) desc.textContent = 'No Search Console data is available for this date range.';
                }
                if (content) content.style.display = 'none';
                return;
            }

            // KPI cards
            if (document.getElementById('gsc-clicks')) document.getElementById('gsc-clicks').textContent = fmt(d.clicks);
            if (document.getElementById('gsc-impressions')) document.getElementById('gsc-impressions').textContent = fmt(d.impressions);
            if (document.getElementById('gsc-ctr')) document.getElementById('gsc-ctr').textContent = d.ctr + '%';
            if (document.getElementById('gsc-position')) document.getElementById('gsc-position').textContent = '#' + d.position;
            if (document.getElementById('gsc-clicks-d')) document.getElementById('gsc-clicks-d').textContent = `${d.dailyPerformance.length} days`;
            if (document.getElementById('gsc-imp-d')) document.getElementById('gsc-imp-d').textContent = `${d.dailyPerformance.length} days`;

            // KPI cards in Overview tab
            if (document.getElementById('kpi-gsc-clicks')) document.getElementById('kpi-gsc-clicks').textContent = fmt(d.clicks);
            if (document.getElementById('kpi-gsc-clicks-sub')) document.getElementById('kpi-gsc-clicks-sub').textContent = `${d.ctr}% avg CTR`;
            if (document.getElementById('kpi-gsc-impressions')) document.getElementById('kpi-gsc-impressions').textContent = fmt(d.impressions);
            if (document.getElementById('kpi-gsc-impressions-sub')) document.getElementById('kpi-gsc-impressions-sub').textContent = `#${d.position} avg position`;

            const el = document.getElementById('gscSubtitle');
            if (el) el.textContent = `${d.siteUrl} · ${d.dateRange.startDate} → ${d.dateRange.endDate}`;
            const rt = document.getElementById('gscRangeTag');
            if (rt) rt.textContent = `${d.dateRange.startDate} → ${d.dateRange.endDate}`;

            // Overview page GSC Chart Subtitle
            const ovGscSub = document.getElementById('ovGscChartSub');
            if (ovGscSub) ovGscSub.textContent = `${d.siteUrl} · ${d.dateRange.startDate} → ${d.dateRange.endDate}`;

            // Chart 1: Daily clicks & impressions (dual-axis)
            makeChart('gscClicksChart', 'line', {
                labels: d.dailyPerformance.map(r => r.date.slice(5)),
                datasets: [
                    {
                        label: 'Clicks',
                        data: d.dailyPerformance.map(r => r.clicks),
                        borderColor: '#34a853',
                        backgroundColor: 'rgba(52,168,83,.08)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Impressions',
                        data: d.dailyPerformance.map(r => r.impressions),
                        borderColor: '#4285f4',
                        backgroundColor: 'rgba(66,133,244,.06)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            }, {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#7080a0', maxRotation: 45 } },
                    y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 }, color: '#34a853' }, position: 'left', title: { display: true, text: 'Clicks', font: { size: 10 }, color: '#34a853' } },
                    y1: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#4285f4' }, position: 'right', title: { display: true, text: 'Impressions', font: { size: 10 }, color: '#4285f4' } }
                }
            });

            // Chart Overview GSC: Daily clicks & impressions (dual-axis)
            makeChart('overviewGscChart', 'line', {
                labels: d.dailyPerformance.map(r => r.date.slice(5)),
                datasets: [
                    {
                        label: 'Clicks',
                        data: d.dailyPerformance.map(r => r.clicks),
                        borderColor: '#34a853',
                        backgroundColor: 'rgba(52,168,83,.08)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Impressions',
                        data: d.dailyPerformance.map(r => r.impressions),
                        borderColor: '#4285f4',
                        backgroundColor: 'rgba(66,133,244,.06)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            }, {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#7080a0', maxRotation: 45 } },
                    y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 }, color: '#34a853' }, position: 'left', title: { display: true, text: 'Clicks', font: { size: 10 }, color: '#34a853' } },
                    y1: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#4285f4' }, position: 'right', title: { display: true, text: 'Impressions', font: { size: 10 }, color: '#4285f4' } }
                }
            });

            // Chart 2: CTR & Avg Position (dual-axis)
            makeChart('gscCtrChart', 'line', {
                labels: d.dailyPerformance.map(r => r.date.slice(5)),
                datasets: [
                    {
                        label: 'CTR (%)',
                        data: d.dailyPerformance.map(r => r.ctr),
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245,158,11,.08)',
                        fill: true,
                        tension: 0.4,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Avg Position',
                        data: d.dailyPerformance.map(r => r.position),
                        borderColor: '#e5403c',
                        backgroundColor: 'rgba(229,64,60,.06)',
                        fill: false,
                        tension: 0.4,
                        yAxisID: 'y1'
                    }
                ]
            }, {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: true, position: 'top', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { mode: 'index', intersect: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#7080a0', maxRotation: 45 } },
                    y: { grid: { color: '#2a3346' }, ticks: { font: { size: 10 }, color: '#f59e0b' }, position: 'left', title: { display: true, text: 'CTR (%)', font: { size: 10 }, color: '#f59e0b' } },
                    y1: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#e5403c' }, position: 'right', reverse: true, title: { display: true, text: 'Position (lower=better)', font: { size: 10 }, color: '#e5403c' } }
                }
            });

            // Chart 3: Device doughnut
            if (d.devices.length) {
                const devColors = ['#34a853', '#4285f4', '#f59e0b', '#e5403c'];
                makeChart('gscDeviceChart', 'doughnut', {
                    labels: d.devices.map(v => v.device.charAt(0).toUpperCase() + v.device.slice(1).toLowerCase()),
                    datasets: [{ data: d.devices.map(v => v.clicks), backgroundColor: devColors, borderWidth: 2, borderColor: '#161c27' }]
                }, {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} clicks` } } },
                    cutout: '62%'
                });
                const totalDevClicks = d.devices.reduce((s, v) => s + v.clicks, 0);
                const devListEl = document.getElementById('gscDeviceList');
                if (devListEl) {
                    devListEl.innerHTML = d.devices.map((v, i) => `
                        <div class="bench-row">
                            <span class="bench-label" style="color:${devColors[i]};font-weight:600;">${v.device.charAt(0).toUpperCase() + v.device.slice(1).toLowerCase()}</span>
                            <span class="bench-val">${fmt(v.clicks)} clicks (${totalDevClicks > 0 ? ((v.clicks / totalDevClicks) * 100).toFixed(1) : 0}%)</span>
                        </div>`).join('');
                }
            }

            // Chart 4: Country doughnut
            if (d.countries.length) {
                const cColors = ['#0066cc', '#00cccc', '#34a853', '#f59e0b', '#e5403c', '#7c3aed', '#0088ee', '#ff6b35', '#12b47a', '#a855f7'];
                makeChart('gscCountryChart', 'doughnut', {
                    labels: d.countries.map(v => v.country),
                    datasets: [{ data: d.countries.map(v => v.clicks), backgroundColor: cColors, borderWidth: 2, borderColor: '#161c27' }]
                }, {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: true, position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)} clicks` } } },
                    cutout: '62%'
                });
                const totalCClicks = d.countries.reduce((s, v) => s + v.clicks, 0);
                const cListEl = document.getElementById('gscCountryList');
                if (cListEl) {
                    cListEl.innerHTML = d.countries.map((v, i) => `
                        <div class="bench-row">
                            <span class="bench-label" style="color:${cColors[i]};font-weight:600;">${v.country}</span>
                            <span class="bench-val">${fmt(v.clicks)} clicks (${totalCClicks > 0 ? ((v.clicks / totalCClicks) * 100).toFixed(1) : 0}%)</span>
                        </div>`).join('');
                }
            }

            // Queries table reset & render
            gscQueryState = {
                search: '',
                pageSize: parseInt(document.getElementById('gscQueryPageSize')?.value || '10'),
                currentPage: 1,
                sortField: 'clicks',
                sortOrder: 'desc'
            };
            if (document.getElementById('gscQuerySearch')) {
                document.getElementById('gscQuerySearch').value = '';
            }
            renderGscQueries();

            // Initialize pages rendering state
            gscPagesData = d.topPages.map(p => ({
                ...p,
                indexing: { status: 'PENDING' }
            }));
            gscPagesFilter = {
                search: '',
                indexing: 'ALL'
            };
            if (document.getElementById('gscPageSearch')) {
                document.getElementById('gscPageSearch').value = '';
            }
            if (document.getElementById('gscPageIndexingFilter')) {
                document.getElementById('gscPageIndexingFilter').value = 'ALL';
            }
            renderGscPages();

            // Background fetch for indexing status
            fetchGscPageIndexing(false);
        }

        // ── GSC Page Indexing state & helpers ──────────────────────────────────────────
        let gscPagesData = [];
        let gscPagesFilter = { search: '', indexing: 'ALL' };

        function renderGscPages() {
            const pTable = document.getElementById('gscPagesTable');
            const pND = document.getElementById('gscPagesNoData');
            if (!pTable) return;

            pTable.innerHTML = '';

            const filtered = gscPagesData.filter(p => {
                const shortPage = p.page.replace(/^https?:\/\/[^/]+/, '') || '/';
                const matchesSearch = shortPage.toLowerCase().includes(gscPagesFilter.search.toLowerCase());

                return matchesSearch;
            });

            if (!filtered.length) {
                if (pND) {
                    pND.style.display = 'block';
                    pND.textContent = gscPagesData.length ? 'No pages match the active filters.' : 'No page data available';
                }
            } else {
                if (pND) pND.style.display = 'none';
                filtered.forEach(p => {
                    const shortPage = p.page.replace(/^https?:\/\/[^/]+/, '') || '/';
                    const tr = document.createElement('tr');

                    tr.innerHTML = `
                        <td><span class="rank-badge">${p.rank}</span></td>
                        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.page}">${shortPage}</td>
                        <td><strong>${fmt(p.clicks)}</strong></td>
                        <td>${fmt(p.impressions)}</td>
                        <td>${p.ctr}%</td>
                        <td><span class="gsc-position-badge ${posClass(p.position)}">#${p.position}</span></td>
                    `;

                    pTable.appendChild(tr);
                });
            }
        }

        async function fetchGscPageIndexing(forceRefresh = false) {
            const siteUrl = GSC_DATA ? GSC_DATA.siteUrl : '';
            if (!siteUrl) return;

            const refreshBtn = document.getElementById('gscRefreshIndexingBtn');
            if (refreshBtn) {
                refreshBtn.disabled = true;
                refreshBtn.innerHTML = `⏳ Loading...`;
            }

            try {
                const { start, end } = getDateRange();
                let url = `/api/gsc/page-indexing?startDate=${start}&endDate=${end}`;
                if (siteUrl) {
                    url += `&siteUrl=${encodeURIComponent(siteUrl)}`;
                }
                if (forceRefresh) {
                    url += `&refresh=true`;
                }

                const res = await fetch(url);
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'Failed to fetch indexing status');

                const returnedPages = payload.data.pages || [];

                gscPagesData = gscPagesData.map(p => {
                    const match = returnedPages.find(rp => rp.page === p.page);
                    return {
                        ...p,
                        indexing: match ? match.indexing : { status: 'UNKNOWN' }
                    };
                });

                renderGscPages();
                showToast(forceRefresh ? '✅ Page indexing status refreshed!' : '✅ Page indexing status loaded.');
            } catch (err) {
                console.error('Failed to load indexing status:', err.message);
                showToast('Indexing status check failed: ' + err.message, true);

                gscPagesData = gscPagesData.map(p => {
                    if (p.indexing?.status === 'PENDING') {
                        return {
                            ...p,
                            indexing: { status: 'INSPECTION_ERROR', message: err.message }
                        };
                    }
                    return p;
                });
                renderGscPages();
            } finally {
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = `🔄 Refresh Indexing`;
                }
            }
        }

        function showUrlInspectionDetails(p) {
            let overlay = document.getElementById('inspectionModal');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'inspectionModal';
                overlay.className = 'modal-overlay';
                document.body.appendChild(overlay);
            }

            const indexing = p.indexing || {};

            let statusText = '';
            if (indexing.status === 'PENDING') {
                statusText = '⏳ Checking indexing status...';
            } else if (indexing.status === 'INDEXED') {
                statusText = '✓ Indexed';
            } else if (indexing.status === 'NOT_INDEXED') {
                statusText = '⚠ Not Indexed';
            } else if (indexing.status === 'INSPECTION_ERROR') {
                statusText = `✗ Inspection Error: \${indexing.message || 'Inspection failed'}`;
            } else {
                statusText = 'Unavailable';
            }

            const lastCrawlFormatted = indexing.lastCrawlTime
                ? new Date(indexing.lastCrawlTime).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : 'N/A';

            overlay.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <span class="modal-title">URL Inspection Details</span>
                        <button class="modal-close" onclick="closeInspectionModal()">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="inspect-url-text">\${p.page}</div>
                        <div class="inspect-grid">
                            <div class="inspect-label">Indexing Status</div>
                            <div class="inspect-val" style="font-weight:600;">\${statusText}</div>
                            
                            \${indexing.status === 'NOT_INDEXED' && indexing.coverageState ? \`
                                <div class="inspect-label">Reason</div>
                                <div class="inspect-val" style="color:var(--warn-text); font-weight:500;">\${indexing.coverageState}</div>
                            \` : ''}

                            \${indexing.verdict ? \`
                                <div class="inspect-label">Verdict</div>
                                <div class="inspect-val">\${indexing.verdict}</div>
                            \` : ''}
                            
                            \${indexing.indexingState ? \`
                                <div class="inspect-label">Indexing Allowed</div>
                                <div class="inspect-val">\${indexing.indexingState}</div>
                            \` : ''}

                            \${indexing.coverageState && indexing.status !== 'NOT_INDEXED' ? \`
                                <div class="inspect-label">Coverage</div>
                                <div class="inspect-val">\${indexing.coverageState}</div>
                            \` : ''}

                            \${indexing.robotsTxtState ? \`
                                <div class="inspect-label">Robots.txt Status</div>
                                <div class="inspect-val">\${indexing.robotsTxtState}</div>
                            \` : ''}

                            \${indexing.pageFetchState ? \`
                                <div class="inspect-label">Page Fetch</div>
                                <div class="inspect-val">\${indexing.pageFetchState}</div>
                            \` : ''}

                            <div class="inspect-label">Last Crawl</div>
                            <div class="inspect-val">\${lastCrawlFormatted}</div>

                            \${indexing.googleCanonical ? \`
                                <div class="inspect-label">Google Canonical</div>
                                <div class="inspect-val-mono">\${indexing.googleCanonical}</div>
                            \` : ''}

                            \${indexing.userCanonical ? \`
                                <div class="inspect-label">User Canonical</div>
                                <div class="inspect-val-mono">\${indexing.userCanonical}</div>
                            \` : ''}
                        </div>
                    </div>
                </div>
            `;

            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('show'), 10);

            const outsideClickClose = (e) => {
                if (e.target === overlay) {
                    closeInspectionModal();
                    overlay.removeEventListener('click', outsideClickClose);
                }
            };
            overlay.addEventListener('click', outsideClickClose);
        }

        window.closeInspectionModal = function () {
            const overlay = document.getElementById('inspectionModal');
            if (overlay) {
                overlay.classList.remove('show');
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 200);
            }
        };

        // ── GSC fetch ──────────────────────────────────────────────────────────────────
        let cachedGscSites = [];

        async function loadGscSites() {
            try {
                const res = await fetch('/api/gsc/sites');
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Failed to list sites');
                cachedGscSites = data.sites || [];
                const selector = document.getElementById('gscSiteSelector');
                if (selector) {
                    selector.innerHTML = cachedGscSites.map(s => {
                        const label = s.siteUrl + (s.permissionLevel === 'siteUnverifiedUser' ? ' (Unverified)' : '');
                        return `<option value="${s.siteUrl}">${label}</option>`;
                    }).join('');

                    // Trigger custom input change when selected
                    selector.addEventListener('change', () => {
                        document.getElementById('gscSiteCustomInput').value = selector.value;
                    });

                    // Set default custom value to the currently loaded site
                    if (GSC_DATA && GSC_DATA.siteUrl) {
                        selector.value = GSC_DATA.siteUrl;
                        document.getElementById('gscSiteCustomInput').value = GSC_DATA.siteUrl;
                    }
                }
            } catch (err) {
                console.warn('⚠️ GSC sites list failed:', err.message);
                const selector = document.getElementById('gscSiteSelector');
                if (selector) {
                    selector.innerHTML = `<option value="">Error: ${err.message}</option>`;
                }
            }
        }

        async function fetchGSC(customSiteUrl = null, forceRefresh = false, showNotification = true) {
            const loadBtn = document.getElementById('gscLoadBtn');
            const refBtn = document.getElementById('gscRefreshBtn');
            const loadSiteBtn = document.getElementById('gscLoadSiteBtn');
            if (loadBtn) { loadBtn.textContent = '⏳ Loading…'; loadBtn.disabled = true; }
            if (refBtn) { refBtn.textContent = '⏳ Loading…'; refBtn.disabled = true; }
            if (loadSiteBtn) { loadSiteBtn.textContent = '⏳ Loading…'; loadSiteBtn.disabled = true; }

            // Reset loading state
            const emptyState = document.getElementById('gscEmpty');
            if (emptyState) {
                const icon = emptyState.querySelector('.es-icon');
                const title = emptyState.querySelector('#gscEmptyTitle') || emptyState.querySelector('h3');
                const desc = emptyState.querySelector('#gscEmptyDesc') || emptyState.querySelector('p');
                const retryBtn = document.getElementById('gscLoadBtn');
                if (icon) { icon.textContent = '⏳'; icon.style.animation = 'spin 1.5s linear infinite'; }
                if (title) title.textContent = 'Loading Search Console data…';
                if (desc) desc.textContent = 'Fetching your organic search performance from Google Search Console.';
                if (retryBtn) retryBtn.style.display = 'none';
            }

            // Determine siteUrl: custom input -> selected dropdown -> default
            let siteUrl = customSiteUrl || document.getElementById('gscSiteCustomInput')?.value || '';
            if (!siteUrl) {
                siteUrl = document.getElementById('gscSiteSelector')?.value || '';
            }

            try {
                const { start, end } = getDateRange();
                let url = `/api/gsc?startDate=${start}&endDate=${end}`;
                if (siteUrl) {
                    url += `&siteUrl=${encodeURIComponent(siteUrl)}`;
                }
                if (forceRefresh) {
                    url += `&refresh=true`;
                }
                const res = await fetch(url);
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'GSC fetch failed');

                GSC_DATA = payload.data;
                gscLoaded = true;

                // Show content, hide empty state
                const empty = document.getElementById('gscEmpty');
                const content = document.getElementById('gscContent');
                if (empty) empty.style.display = 'none';
                if (content) content.style.display = '';

                renderGSC();
                if (showNotification) showToast(`✅ Search Console loaded: ${GSC_DATA.siteUrl}`);

                // Fetch list of sites once loaded if not already populated
                if (cachedGscSites.length === 0) {
                    await loadGscSites();
                }
            } catch (err) {
                if (showNotification) showToast('GSC failed: ' + err.message, true);
                const empty = document.getElementById('gscEmpty');
                const content = document.getElementById('gscContent');
                if (empty) {
                    empty.style.display = '';
                    const icon = empty.querySelector('.es-icon');
                    const title = empty.querySelector('#gscEmptyTitle') || empty.querySelector('h3');
                    const desc = empty.querySelector('#gscEmptyDesc') || empty.querySelector('p');
                    const retryBtn = document.getElementById('gscLoadBtn');
                    if (icon) { icon.textContent = '❌'; icon.style.animation = 'none'; }
                    if (title) title.textContent = 'Failed to load Search Console data';
                    if (desc) desc.innerHTML = `<span style="color: var(--down); font-weight: 500;">${err.message}</span>`;
                    if (retryBtn) { retryBtn.style.display = ''; retryBtn.textContent = '🔄 Retry'; }
                }
                if (content) content.style.display = 'none';
            } finally {
                if (loadBtn) { loadBtn.textContent = '🔍 Load Search Console Data'; loadBtn.disabled = false; }
                if (refBtn) { refBtn.textContent = '🔄 Refresh GSC'; refBtn.disabled = false; }
                if (loadSiteBtn) { loadSiteBtn.textContent = '🔍 Load Property'; loadSiteBtn.disabled = false; }
            }
        }

        // ── GSC URL Inspection Logic ─────────────────────────────────────────────
        let isInspectingUrl = false;

        // Sub-navigation tab click listeners
        document.querySelectorAll('.gsc-sub-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.gsc-sub-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.gsc-sub-panel').forEach(p => p.style.display = 'none');

                tab.classList.add('active');
                const targetPanelId = 'gsc-panel-' + tab.dataset.subTab;
                const panel = document.getElementById(targetPanelId);
                if (panel) {
                    panel.style.display = 'block';
                }
                if (tab.dataset.subTab === 'vitals' && !vitalsLoaded) {
                    fetchCoreWebVitals(false);
                }
            });
        });

        async function triggerUrlInspection(forceRefresh = false) {
            const input = document.getElementById('gscUrlInspectionInput');
            const btn = document.getElementById('gscUrlInspectionBtn');
            const againBtn = document.getElementById('gscUrlInspectionAgainBtn');
            const errorDiv = document.getElementById('gscUrlInspectionError');
            const errorText = document.getElementById('gscUrlInspectionErrorText');
            const resultCard = document.getElementById('gscUrlInspectionResultCard');

            const urlVal = input.value.trim();

            // Reset error
            errorDiv.style.display = 'none';

            // Validation
            if (!urlVal) {
                errorText.textContent = 'Please enter a URL.';
                errorDiv.style.display = 'flex';
                return;
            }

            try {
                new URL(urlVal);
            } catch (e) {
                errorText.textContent = 'Please enter a valid URL.';
                errorDiv.style.display = 'flex';
                return;
            }

            // GSC site URL validation on frontend
            const siteUrl = GSC_DATA ? GSC_DATA.siteUrl : '';
            if (siteUrl) {
                let isValidDomain = false;
                try {
                    const parsedUrl = new URL(urlVal);
                    if (siteUrl.startsWith('sc-domain:')) {
                        const domain = siteUrl.substring(10).toLowerCase();
                        const hostname = parsedUrl.hostname.toLowerCase();
                        isValidDomain = (hostname === domain || hostname.endsWith('.' + domain));
                    } else {
                        isValidDomain = urlVal.toLowerCase().startsWith(siteUrl.toLowerCase());
                    }
                } catch (e) {
                    isValidDomain = false;
                }

                if (!isValidDomain) {
                    errorText.textContent = 'Please enter a URL belonging to the configured Search Console property.';
                    errorDiv.style.display = 'flex';
                    return;
                }
            }

            // Loading state
            isInspectingUrl = true;
            btn.disabled = true;
            btn.textContent = forceRefresh ? 'Refreshing...' : 'Inspecting...';
            if (againBtn) againBtn.disabled = true;

            try {
                const res = await fetch(`/api/gsc/url-inspection${forceRefresh ? '?refresh=true' : ''}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: urlVal, siteUrl: siteUrl })
                });

                const payload = await res.json();
                if (!res.ok) {
                    throw new Error(payload.error || 'Inspection failed');
                }

                // Render result
                renderUrlInspectionResult(payload.data);
            } catch (err) {
                console.error('URL Inspection error:', err.message);
                errorText.textContent = err.message || 'Unable to inspect this URL right now. Please try again later.';
                errorDiv.style.display = 'flex';
                resultCard.style.display = 'none';
            } finally {
                isInspectingUrl = false;
                btn.disabled = false;
                btn.textContent = 'Inspect URL';
                if (againBtn) againBtn.disabled = false;
            }
        }

        function renderUrlInspectionResult(data) {
            const resultCard = document.getElementById('gscUrlInspectionResultCard');
            const header = document.getElementById('gscUrlInspectionHeader');
            const icon = document.getElementById('gscUrlInspectionStatusIcon');
            const text = document.getElementById('gscUrlInspectionStatusText');
            const targetUrl = document.getElementById('gscUrlInspectionTargetUrl');

            const verdictVal = document.getElementById('gscUrlInspectionVerdict');
            const reasonVal = document.getElementById('gscUrlInspectionReason');
            const reasonGroup = document.getElementById('gscUrlInspectionReasonGroup');
            const coverageVal = document.getElementById('gscUrlInspectionCoverage');

            const fetchVal = document.getElementById('gscUrlInspectionFetch');
            const crawlVal = document.getElementById('gscUrlInspectionLastCrawl');
            const gCanonicalVal = document.getElementById('gscUrlInspectionGoogleCanonical');
            const uCanonicalVal = document.getElementById('gscUrlInspectionUserCanonical');

            targetUrl.textContent = data.url;

            // Banner styling based on status
            if (data.status === 'INDEXED') {
                header.style.background = '#e6f4ea';
                header.style.color = '#137333';
                icon.textContent = '✓';
                text.textContent = 'URL is indexed';
                reasonGroup.style.display = 'none';
            } else if (data.status === 'NOT_INDEXED') {
                header.style.background = '#fdf0ef';
                header.style.color = '#c5221f';
                icon.textContent = '✗';
                text.textContent = 'URL is not indexed';
                reasonGroup.style.display = 'block';
                reasonVal.textContent = data.coverageState || 'Not indexed';
            } else {
                header.style.background = '#f1f3f5';
                header.style.color = '#6c757d';
                icon.textContent = '⚠';
                text.textContent = `URL inspection status: ${data.status}`;
                reasonGroup.style.display = 'none';
            }

            // Fill grid details
            verdictVal.textContent = data.verdict || 'N/A';
            coverageVal.textContent = data.coverageState || 'N/A';

            fetchVal.textContent = data.pageFetchState ? (data.pageFetchState === 'SUCCESSFUL' ? 'Successful' : data.pageFetchState) : 'N/A';

            crawlVal.textContent = data.lastCrawlTime
                ? new Date(data.lastCrawlTime).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })
                : 'N/A';

            gCanonicalVal.textContent = data.googleCanonical || 'N/A';
            uCanonicalVal.textContent = data.userCanonical || 'N/A';

            resultCard.style.display = 'block';
        }

        // Register controls listeners on load
        __maecOnReady(() => {
            const inspectBtn = document.getElementById('gscUrlInspectionBtn');
            if (inspectBtn) {
                inspectBtn.addEventListener('click', () => triggerUrlInspection(false));
            }

            const inspectAgainBtn = document.getElementById('gscUrlInspectionAgainBtn');
            if (inspectAgainBtn) {
                inspectAgainBtn.addEventListener('click', () => triggerUrlInspection(true));
            }

            // Allow triggering inspection on Enter key press in the input
            const inspectionInput = document.getElementById('gscUrlInspectionInput');
            if (inspectionInput) {
                inspectionInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        triggerUrlInspection(false);
                    }
                });
            }
        });

        // ── Core Web Vitals Logic ─────────────────────────────────────────────────
        let vitalsCurrentDevice = 'mobile';
        let vitalsLoaded = false;

        async function fetchCoreWebVitals(forceRefresh = false) {
            const loadingEl = document.getElementById('vitalsLoading');
            const bannerEl = document.getElementById('vitalsOverallBanner');
            const gridEl = document.getElementById('vitalsMetricsGrid');
            const noDataEl = document.getElementById('vitalsNoData');
            const refreshBtn = document.getElementById('vitalsRefreshBtn');

            if (loadingEl) loadingEl.style.display = 'block';
            if (bannerEl) bannerEl.style.display = 'none';
            if (gridEl) gridEl.style.display = 'none';
            if (noDataEl) noDataEl.style.display = 'none';
            if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '🔄 Loading...'; }

            try {
                const siteUrl = GSC_DATA ? GSC_DATA.siteUrl : '';
                const params = new URLSearchParams();
                if (siteUrl) params.append('url', siteUrl);
                params.append('device', vitalsCurrentDevice);
                if (forceRefresh) params.append('refresh', 'true');

                const res = await fetch('/api/core-web-vitals?' + params.toString());
                const contentType = res.headers.get('content-type') || '';
                if (!contentType.includes('application/json')) {
                    if (res.status === 404) {
                        throw new Error('The server route /api/core-web-vitals was not found (404). Please restart your server process in terminal (npm start) so it loads the updated backend code.');
                    }
                    throw new Error(`Server returned status ${res.status} ${res.statusText} with non-JSON response.`);
                }
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'Failed to fetch Core Web Vitals');

                renderCoreWebVitals(payload.data);
                vitalsLoaded = true;
            } catch (err) {
                console.error('Core Web Vitals load failed:', err.message);
                if (noDataEl) {
                    noDataEl.style.display = 'block';
                    const p = noDataEl.querySelector('p');
                    if (p) p.textContent = err.message;
                }
            } finally {
                if (loadingEl) loadingEl.style.display = 'none';
                if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 Refresh Vitals'; }
            }
        }

        function renderCoreWebVitals(data) {
            const bannerEl = document.getElementById('vitalsOverallBanner');
            const gridEl = document.getElementById('vitalsMetricsGrid');
            const noDataEl = document.getElementById('vitalsNoData');
            const targetUrlEl = document.getElementById('vitalsTargetUrl');
            const periodEl = document.getElementById('vitalsCollectionPeriod');

            if (targetUrlEl && data.url) targetUrlEl.textContent = data.url;

            if (periodEl && data.collectionPeriod) {
                periodEl.textContent = `CrUX dataset (${data.collectionPeriod.firstDate} to ${data.collectionPeriod.lastDate})`;
            }

            if (!data.hasData || !data.metrics) {
                if (bannerEl) bannerEl.style.display = 'none';
                if (gridEl) gridEl.style.display = 'none';
                if (noDataEl) noDataEl.style.display = 'block';
                return;
            }

            if (noDataEl) noDataEl.style.display = 'none';
            if (bannerEl) bannerEl.style.display = 'flex';
            if (gridEl) gridEl.style.display = 'grid';

            // Overall banner styling
            const iconEl = document.getElementById('vitalsOverallIcon');
            const textEl = document.getElementById('vitalsOverallText');

            if (data.overall === 'GOOD') {
                bannerEl.style.background = '#e6f4ea';
                bannerEl.style.borderColor = '#ceead6';
                bannerEl.style.color = '#137333';
                if (iconEl) iconEl.textContent = '✓';
                if (textEl) textEl.textContent = '✓ Good';
            } else if (data.overall === 'NEEDS_IMPROVEMENT') {
                bannerEl.style.background = '#fef3c7';
                bannerEl.style.borderColor = '#fde68a';
                bannerEl.style.color = '#92400e';
                if (iconEl) iconEl.textContent = '⚠';
                if (textEl) textEl.textContent = '⚠ Needs Improvement';
            } else {
                bannerEl.style.background = '#fdf0ef';
                bannerEl.style.borderColor = '#fad2cf';
                bannerEl.style.color = '#c5221f';
                if (iconEl) iconEl.textContent = '✗';
                if (textEl) textEl.textContent = '✗ Poor';
            }

            function renderMetricCard(prefix, metric) {
                const badgeEl = document.getElementById(`vitals${prefix}Badge`);
                const valEl = document.getElementById(`vitals${prefix}Val`);
                const barGood = document.getElementById(`vitals${prefix}BarGood`);
                const barNi = document.getElementById(`vitals${prefix}BarNi`);
                const barPoor = document.getElementById(`vitals${prefix}BarPoor`);
                const pctGood = document.getElementById(`vitals${prefix}PctGood`);
                const pctNi = document.getElementById(`vitals${prefix}PctNi`);
                const pctPoor = document.getElementById(`vitals${prefix}PctPoor`);

                if (!metric) {
                    if (valEl) valEl.textContent = 'N/A';
                    if (badgeEl) { badgeEl.textContent = 'No Data'; badgeEl.className = 'metric-delta delta-neutral'; }
                    return;
                }

                if (valEl) valEl.textContent = metric.value;

                if (badgeEl) {
                    badgeEl.textContent = metric.statusText;
                    if (metric.status === 'GOOD') badgeEl.className = 'metric-delta delta-up';
                    else if (metric.status === 'NEEDS_IMPROVEMENT') badgeEl.className = 'metric-delta delta-neutral';
                    else badgeEl.className = 'metric-delta delta-down';
                }

                if (barGood) barGood.style.width = metric.goodPct + '%';
                if (barNi) barNi.style.width = metric.needsImprovementPct + '%';
                if (barPoor) barPoor.style.width = metric.poorPct + '%';

                if (pctGood) pctGood.textContent = metric.goodPct + '%';
                if (pctNi) pctNi.textContent = metric.needsImprovementPct + '%';
                if (pctPoor) pctPoor.textContent = metric.poorPct + '%';
            }

            renderMetricCard('Lcp', data.metrics.lcp);
            renderMetricCard('Inp', data.metrics.inp);
            renderMetricCard('Cls', data.metrics.cls);
        }

        __maecOnReady(() => {
            const mobBtn = document.getElementById('vitalsDeviceMobile');
            const deskBtn = document.getElementById('vitalsDeviceDesktop');
            const refBtn = document.getElementById('vitalsRefreshBtn');

            if (mobBtn) {
                mobBtn.addEventListener('click', () => {
                    if (vitalsCurrentDevice === 'mobile') return;
                    vitalsCurrentDevice = 'mobile';
                    mobBtn.classList.add('active');
                    mobBtn.style.background = 'var(--white)';
                    mobBtn.style.color = 'var(--primary)';
                    if (deskBtn) {
                        deskBtn.classList.remove('active');
                        deskBtn.style.background = 'transparent';
                        deskBtn.style.color = 'var(--muted)';
                    }
                    fetchCoreWebVitals(false);
                });
            }

            if (deskBtn) {
                deskBtn.addEventListener('click', () => {
                    if (vitalsCurrentDevice === 'desktop') return;
                    vitalsCurrentDevice = 'desktop';
                    deskBtn.classList.add('active');
                    deskBtn.style.background = 'var(--white)';
                    deskBtn.style.color = 'var(--primary)';
                    if (mobBtn) {
                        mobBtn.classList.remove('active');
                        mobBtn.style.background = 'transparent';
                        mobBtn.style.color = 'var(--muted)';
                    }
                    fetchCoreWebVitals(false);
                });
            }

            if (refBtn) {
                refBtn.addEventListener('click', () => fetchCoreWebVitals(true));
            }
        });

        function applyDataset(payload) {
            if (payload.GA4_DAILY?.length) GA4_DAILY = payload.GA4_DAILY;
            if (payload.GA4_CHANNELS?.length) GA4_CHANNELS = payload.GA4_CHANNELS;
            // FIX: this previously stashed pages on window._GA4_PAGES but the backend
            // payload never contained a GA4_PAGES key, so the assignment never ran.
            // Now wired into proper top-level state so both Top Pages tables populate.
            if (payload.GA4_PAGES?.length) GA4_PAGES = payload.GA4_PAGES;
            if (payload.FB_POSTS?.length) FB_POSTS = payload.FB_POSTS;
            if (payload.IG_POSTS?.length) IG_POSTS = payload.IG_POSTS;
            if (payload.YT_VIDEOS?.length) YT_VIDEOS = payload.YT_VIDEOS;
            if (payload.summary) SUMMARY = { ...SUMMARY, ...payload.summary };
            gaRangeTotals = null;
            gaRangeTotalsSeq++;
            REF_DATE = computeRefDate();
            dataLoaded = true;

            const pill = document.getElementById('dataSourcePill');
            pill.textContent = '🟢 Live Data';
            pill.className = 'data-source-pill source-live';

            if (payload.fetchedAt) {
                document.getElementById('lastUpdated').textContent = `Updated ${new Date(payload.fetchedAt).toLocaleTimeString()}`;
            }
            if (payload.warnings?.length) showToast('Loaded with notes: ' + payload.warnings.join(' · '));
        }

        function showToast(msg, isError = false) {
            const el = document.getElementById('refreshToast');
            el.textContent = msg;
            el.className = 'refresh-toast show' + (isError ? ' error' : '');
            setTimeout(() => el.classList.remove('show'), 7000);
        }

        // ── Load cached data on startup ────────────────────────────────────────────────
        async function loadCachedData() {
            try {
                const res = await fetch('/api/data');
                if (!res.ok) return; // no cache — keep empty state
                const payload = await res.json();
                applyDataset(payload);
                renderAll();

                // Fetch Search Console and PageSpeed on startup (cached/background) without noisy toasts
                fetchGSC(null, false, false);
                fetchPageSpeedAnalysis(false);
            } catch {
                // Running as static file or server not up — empty state is correct
            }
        }

        // ── Refresh button ─────────────────────────────────────────────────────────────
        document.getElementById('refreshBtn').addEventListener('click', async () => {
            const btn = document.getElementById('refreshBtn');
            const label = document.getElementById('refreshLabel');
            btn.disabled = true;
            btn.innerHTML = `<span class="spin">⏳</span> <span>Fetching live data…</span>`;
            const pill = document.getElementById('dataSourcePill');
            pill.textContent = '⏳ Fetching…';
            pill.className = 'data-source-pill source-waiting';

            try {
                const res = await fetch('/api/refresh', { method: 'POST' });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'Refresh failed');
                applyDataset(payload);
                renderAll();

                // Force refresh GSC and PageSpeed in the background (no noisy toasts for GSC)
                fetchGSC(null, true, false);
                fetchPageSpeedAnalysis(true);

                showToast(payload.warnings?.length ? 'Refreshed. Notes: ' + payload.warnings.join(' · ') : '✅ Live data refreshed successfully!');
            } catch (err) {
                const pill = document.getElementById('dataSourcePill');
                pill.textContent = '❌ Error';
                pill.className = 'data-source-pill source-error';
                showToast('Refresh failed: ' + err.message + ' — is the server running? (npm start)', true);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `🔄 <span id="refreshLabel">Refresh Live Data</span>`;
            }
        });

        // -- Filter controls --
        document.querySelectorAll('.fpill').forEach(function (fpillBtn) {
            fpillBtn.addEventListener('click', function () {
                document.querySelectorAll('.fpill').forEach(function (b) { b.classList.remove('active'); });
                fpillBtn.classList.add('active');
                var days = fpillBtn.dataset.days;
                var wrap = document.getElementById('customRangeWrap');
                if (days === 'custom') {
                    wrap.classList.add('visible');
                    activeFilter = { days: 'custom', start: document.getElementById('customStart').value, end: document.getElementById('customEnd').value };
                } else {
                    wrap.classList.remove('visible');
                    activeFilter = { days: days === 'all' ? 'all' : +days, start: null, end: null };
                    if (dataLoaded) renderAll();
                    if (document.querySelector('.nav-tab[data-tab="gsc"]').classList.contains('active') && gscLoaded) {
                        fetchGSC();
                    }
                }
            });
        });
        document.getElementById('applyCustom').addEventListener('click', function () {
            var s = document.getElementById('customStart').value, e = document.getElementById('customEnd').value;
            if (s && e && s <= e) {
                activeFilter = { days: 'custom', start: s, end: e };
                if (dataLoaded) renderAll();
                if (document.querySelector('.nav-tab[data-tab="gsc"]').classList.contains('active') && gscLoaded) {
                    fetchGSC();
                }
            }
        });

        // -- GA4 Countries button --
        async function fetchGA4Countries() {
            var cBtn = document.getElementById('gaCountriesRefreshBtn');
            var cLoading = document.getElementById('gaCountriesLoading');
            var cErrEl = document.getElementById('gaCountriesError');
            var cEmptyEl = document.getElementById('gaCountriesEmpty');
            var cTableWrap = document.getElementById('gaCountriesTableWrap');
            var cTbody = document.getElementById('gaCountriesTable');
            var cPrompt = document.getElementById('gaCountriesPrompt');
            [cLoading, cErrEl, cEmptyEl, cTableWrap, cPrompt].forEach(function (el) { if (el) el.style.display = 'none'; });
            if (cLoading) cLoading.style.display = 'block';
            if (cBtn) { cBtn.disabled = true; cBtn.textContent = 'Loading...'; }
            try {
                var res = await fetch('/api/analytics/countries');
                var json = await res.json();
                if (!res.ok) throw new Error(json.error || 'HTTP ' + res.status);
                var rows = json.data || [];
                if (!rows.length) { if (cEmptyEl) cEmptyEl.style.display = 'block'; return; }
                var total = rows.reduce(function (s, r) { return s + r.views; }, 0);
                cTbody.innerHTML = '';
                rows.forEach(function (r, i) {
                    var pct = total > 0 ? ((r.views / total) * 100).toFixed(1) : '0.0';
                    var tr = document.createElement('tr');
                    tr.innerHTML = '<td><span class="rank-badge">' + (i + 1) + '</span></td>' +
                        '<td>' + r.country + '</td>' +
                        '<td style="text-align:right;">' + fmt(r.views) + '</td>' +
                        '<td style="text-align:right;color:var(--text2);">' + pct + '%</td>';
                    cTbody.appendChild(tr);
                });
                if (cTableWrap) cTableWrap.style.display = '';
            } catch (err) {
                console.error('GA4 countries fetch failed:', err.message);
                if (cErrEl) { cErrEl.textContent = 'Error: ' + err.message; cErrEl.style.display = 'block'; }
            } finally {
                if (cLoading) cLoading.style.display = 'none';
                if (cBtn) { cBtn.disabled = false; cBtn.textContent = 'Refresh Countries'; }
            }
        }
        var cRefreshBtn = document.getElementById('gaCountriesRefreshBtn');
        if (cRefreshBtn) cRefreshBtn.addEventListener('click', fetchGA4Countries);
        // -- GSC button listeners --
        var gscLoadBtn = document.getElementById('gscLoadBtn');
        if (gscLoadBtn) gscLoadBtn.addEventListener('click', function () { fetchGSC(); });
        var gscRefreshBtn = document.getElementById('gscRefreshBtn');
        if (gscRefreshBtn) gscRefreshBtn.addEventListener('click', function () { fetchGSC(null, true); });
        var gscLoadSiteBtn = document.getElementById('gscLoadSiteBtn');
        if (gscLoadSiteBtn) gscLoadSiteBtn.addEventListener('click', () => {
            const input = document.getElementById('gscSiteCustomInput');
            const url = input ? input.value.trim() : '';
            if (url) fetchGSC(url);
        });

        // Register GSC pagination & filter listeners
        const gscQSearch = document.getElementById('gscQuerySearch');
        if (gscQSearch) gscQSearch.addEventListener('input', (e) => {
            gscQueryState.search = e.target.value;
            gscQueryState.currentPage = 1;
            renderGscQueries();
        });
        const gscQSize = document.getElementById('gscQueryPageSize');
        if (gscQSize) gscQSize.addEventListener('change', (e) => {
            gscQueryState.pageSize = parseInt(e.target.value);
            gscQueryState.currentPage = 1;
            renderGscQueries();
        });
        const gscQPrev = document.getElementById('gscQueryPrev');
        if (gscQPrev) gscQPrev.addEventListener('click', () => {
            if (gscQueryState.currentPage > 1) {
                gscQueryState.currentPage--;
                renderGscQueries();
            }
        });
        const gscQNext = document.getElementById('gscQueryNext');
        if (gscQNext) gscQNext.addEventListener('click', () => {
            gscQueryState.currentPage++;
            renderGscQueries();
        });

        // Register GSC Pages filter & search listeners
        const gscPSearch = document.getElementById('gscPageSearch');
        if (gscPSearch) gscPSearch.addEventListener('input', (e) => {
            gscPagesFilter.search = e.target.value;
            renderGscPages();
        });


        // Sorting column click listeners
        document.querySelectorAll('#tab-gsc th[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                const field = th.dataset.sort;
                if (field === '#') return;

                if (gscQueryState.sortField === field) {
                    gscQueryState.sortOrder = gscQueryState.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    gscQueryState.sortField = field;
                    gscQueryState.sortOrder = field === 'query' || field === 'position' ? 'asc' : 'desc';
                }

                document.querySelectorAll('#tab-gsc th[data-sort]').forEach(h => {
                    h.style.fontWeight = '500';
                    h.style.color = 'var(--muted)';
                });
                th.style.fontWeight = '700';
                th.style.color = 'var(--text)';

                renderGscQueries();
            });
        });



        // ── Tab switching ──────────────────────────────────────────────────────────────
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
                tab.classList.add('active');
                const panel = document.getElementById('tab-' + tab.dataset.tab);
                if (panel) panel.classList.add('active');
                if (tab.dataset.tab === 'gsc') {
                    if (!GSC_DATA) {
                        fetchGSC();
                    }
                } else if (tab.dataset.tab === 'page-performance') {
                    if (!psLoaded) {
                        fetchPageSpeedAnalysis(false);
                    }
                }
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
        });

        // ── Page Performance JS Client ──────────────────────────────────────────────────
        let psActiveStrategy = 'mobile';
        let psLoaded = false;
        let PS_MOBILE_DATA = null;
        let PS_DESKTOP_DATA = null;
        let PS_LAST_URL = '';

        async function fetchPageSpeedAnalysis(forceRefresh = false) {
            const urlInput = document.getElementById('psUrlInput');
            const analyzeBtn = document.getElementById('psAnalyzeBtn');
            const refBtn = document.getElementById('psRefreshBtn');
            const loadingDiv = document.getElementById('psLoading');
            const errorDiv = document.getElementById('psError');
            const errorText = document.getElementById('psErrorText');
            const resultsDiv = document.getElementById('psResults');
            const urlBanner = document.getElementById('psUrlBanner');

            const targetUrl = (urlInput ? urlInput.value.trim() : '') || 'https://maec.ai/';

            // If we have cached data in memory and URL hasn't changed, and not force refreshing:
            if (!forceRefresh && PS_MOBILE_DATA && PS_DESKTOP_DATA && PS_LAST_URL === targetUrl) {
                if (psActiveStrategy === 'mobile' && PS_MOBILE_DATA) {
                    renderPageSpeedResults(PS_MOBILE_DATA);
                } else if (psActiveStrategy === 'desktop' && PS_DESKTOP_DATA) {
                    renderPageSpeedResults(PS_DESKTOP_DATA);
                }
                renderOverviewPageSpeedCharts(PS_MOBILE_DATA, PS_DESKTOP_DATA);
                return;
            }

            if (loadingDiv) loadingDiv.style.display = 'block';
            if (errorDiv) errorDiv.style.display = 'none';
            if (resultsDiv) resultsDiv.style.display = 'none';
            if (urlBanner) urlBanner.style.display = 'none';
            if (analyzeBtn) { analyzeBtn.disabled = true; analyzeBtn.textContent = forceRefresh ? 'Refreshing...' : 'Analyzing...'; }
            if (refBtn) { refBtn.disabled = true; refBtn.textContent = '⏳ Loading...'; }

            try {
                // Fetch both strategies in parallel
                const [mobileRes, desktopRes] = await Promise.all([
                    fetch('/api/pagespeed/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl, strategy: 'mobile', refresh: forceRefresh })
                    }).catch(err => {
                        console.error('Mobile fetch error:', err);
                        return { ok: false, json: () => Promise.resolve({ success: false, error: err.message }) };
                    }),
                    fetch('/api/pagespeed/analyze', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ url: targetUrl, strategy: 'desktop', refresh: forceRefresh })
                    }).catch(err => {
                        console.error('Desktop fetch error:', err);
                        return { ok: false, json: () => Promise.resolve({ success: false, error: err.message }) };
                    })
                ]);

                const mobilePayload = await mobileRes.json();
                const desktopPayload = await desktopRes.json();

                if ((!mobileRes.ok || !mobilePayload.success) && (!desktopRes.ok || !desktopPayload.success)) {
                    throw new Error(mobilePayload.error || desktopPayload.error || 'Failed to analyze page performance for both mobile and desktop');
                }

                if (mobilePayload.success) {
                    PS_MOBILE_DATA = mobilePayload;
                }
                if (desktopPayload.success) {
                    PS_DESKTOP_DATA = desktopPayload;
                }
                PS_LAST_URL = targetUrl;
                psLoaded = true;

                // Render active strategy in Page Performance tab
                if (psActiveStrategy === 'mobile' && PS_MOBILE_DATA) {
                    renderPageSpeedResults(PS_MOBILE_DATA);
                } else if (psActiveStrategy === 'desktop' && PS_DESKTOP_DATA) {
                    renderPageSpeedResults(PS_DESKTOP_DATA);
                } else if (PS_MOBILE_DATA || PS_DESKTOP_DATA) {
                    renderPageSpeedResults(PS_MOBILE_DATA || PS_DESKTOP_DATA);
                }

                // Render overview Page Performance charts (both mobile and desktop)
                renderOverviewPageSpeedCharts(PS_MOBILE_DATA, PS_DESKTOP_DATA);

            } catch (err) {
                console.error('PageSpeed analysis failed:', err.message);
                if (errorText) errorText.textContent = err.message || 'Failed to pull PageSpeed Insights data.';
                if (errorDiv) errorDiv.style.display = 'block';
            } finally {
                if (loadingDiv) loadingDiv.style.display = 'none';
                if (analyzeBtn) { analyzeBtn.disabled = false; analyzeBtn.innerHTML = `<span>⚡ Analyze</span>`; }
                if (refBtn) { refBtn.disabled = false; refBtn.textContent = '🔄 Refresh Analysis'; }
            }
        }

        function renderPageSpeedResults(data) {
            const resultsDiv = document.getElementById('psResults');
            const urlBanner = document.getElementById('psUrlBanner');
            const urlLink = document.getElementById('psAnalyzedUrlLink');
            const fetchedAtTag = document.getElementById('psFetchedAtTag');
            const cacheBadge = document.getElementById('psCacheBadge');
            const stratTag = document.getElementById('psStrategyTag');

            if (resultsDiv) resultsDiv.style.display = 'block';
            if (urlBanner) urlBanner.style.display = 'flex';
            if (urlLink) { urlLink.href = data.url; urlLink.textContent = data.url; }
            if (fetchedAtTag) fetchedAtTag.textContent = `Analyzed: ${new Date(data.fetchedAt || Date.now()).toLocaleTimeString()}`;
            if (cacheBadge) {
                cacheBadge.textContent = data.cached ? 'Cached (1h)' : 'Live Data';
                cacheBadge.style.background = data.cached ? 'var(--neutral-bg)' : 'var(--primary-light)';
                cacheBadge.style.color = data.cached ? 'var(--neutral)' : 'var(--primary)';
            }
            if (stratTag) stratTag.textContent = data.strategy.charAt(0).toUpperCase() + data.strategy.slice(1);

            // Performance Gauge & Category Scores
            const scores = data.scores || {};
            const perfVal = scores.performance != null ? scores.performance : '—';
            const perfValEl = document.getElementById('psPerfScoreVal');
            if (perfValEl) perfValEl.textContent = perfVal;
            
            const perfGauge = document.getElementById('psPerfGauge');
            const perfStatus = document.getElementById('psPerfScoreStatus');
            if (perfGauge && perfStatus) {
                let borderCol = '#12b47a';
                let statusLabel = `Good (${perfVal}/100)`;
                let badgeClass = 'gsc-pos-top';
                if (scores.performance < 50) { borderCol = '#e5403c'; statusLabel = `Poor (${perfVal}/100)`; badgeClass = 'gsc-pos-low'; }
                else if (scores.performance < 90) { borderCol = '#f59e0b'; statusLabel = `Needs Improvement (${perfVal}/100)`; badgeClass = 'gsc-pos-mid'; }
                perfGauge.style.borderColor = borderCol;
                perfStatus.textContent = statusLabel;
                perfStatus.className = `gsc-position-badge ${badgeClass}`;
            }

            document.getElementById('psAccessScoreVal').textContent = scores.accessibility != null ? scores.accessibility : '—';
            document.getElementById('psBpScoreVal').textContent = scores.bestPractices != null ? scores.bestPractices : '—';
            document.getElementById('psSeoScoreVal').textContent = scores.seo != null ? scores.seo : '—';

            // Update Overview tab elements
            const ovKpiPerfVal = document.getElementById('kpi-perf-score');
            if (ovKpiPerfVal) ovKpiPerfVal.textContent = perfVal;
            const ovKpiPerfSub = document.getElementById('kpi-perf-sub');
            if (ovKpiPerfSub) {
                let statusText = '—';
                if (scores.performance != null) {
                    if (scores.performance < 50) statusText = 'Poor';
                    else if (scores.performance < 90) statusText = 'Needs Improvement';
                    else statusText = 'Good';
                }
                ovKpiPerfSub.textContent = statusText;
            }

            const ovPsAnalyzedUrl = document.getElementById('ovPsAnalyzedUrl');
            if (ovPsAnalyzedUrl) {
                ovPsAnalyzedUrl.textContent = `URL: ${data.url || '—'}`;
            }

            // Field vs Lab Data handling
            const field = data.fieldData || {};
            const cwv = data.coreWebVitals || {};
            const fieldNotice = document.getElementById('psFieldNotice');
            const fieldTag = document.getElementById('psFieldSourceTag');

            if (field.available) {
                if (fieldNotice) fieldNotice.style.display = 'none';
                if (fieldTag) fieldTag.textContent = field.isOriginFallback ? 'Real-User Data (Domain Origin)' : 'Real-User Data (CrUX)';
            } else {
                if (fieldNotice) fieldNotice.style.display = 'block';
                if (fieldTag) fieldTag.textContent = 'Lighthouse Lab Simulation';
            }

            // Core Web Vitals Renderer
            const renderCwvMetric = (key, metric, metricType) => {
                if (!metric) return;
                const valEl = document.getElementById(`ps${key}Val`);
                const badgeEl = document.getElementById(`ps${key}Badge`);
                const barGood = document.getElementById(`ps${key}BarGood`);
                const barNi = document.getElementById(`ps${key}BarNi`);
                const barPoor = document.getElementById(`ps${key}BarPoor`);
                const pctGood = document.getElementById(`ps${key}PctGood`);
                const pctNi = document.getElementById(`ps${key}PctNi`);
                const pctPoor = document.getElementById(`ps${key}PctPoor`);

                const pinWrap = document.getElementById(`ps${key}PinWrap`);
                const pinVal = document.getElementById(`ps${key}PinVal`);

                if (valEl) valEl.textContent = metric.displayValue || '—';
                
                let textColor = '#12b47a';
                let badgeText = '✓ Good';
                let badgeCls = 'metric-delta delta-up';
                if (metric.status === 'needs-improvement') {
                    textColor = '#d97706';
                    badgeText = '⚠ Needs Imp';
                    badgeCls = 'metric-delta delta-neutral';
                } else if (metric.status === 'poor') {
                    textColor = '#e5403c';
                    badgeText = '✗ Poor';
                    badgeCls = 'metric-delta delta-down';
                }

                if (badgeEl) {
                    badgeEl.textContent = badgeText;
                    badgeEl.className = badgeCls;
                }

                const dists = metric.distributions || { goodPct: 70, needsImpPct: 20, poorPct: 10 };
                const goodW = dists.goodPct || 0;
                const niW = dists.needsImpPct || 0;
                const poorW = dists.poorPct || 0;

                if (barGood) barGood.style.width = `${goodW}%`;
                if (barNi) barNi.style.width = `${niW}%`;
                if (barPoor) barPoor.style.width = `${poorW}%`;

                if (pctGood) pctGood.textContent = `${goodW}%`;
                if (pctNi) pctNi.textContent = `${niW}%`;
                if (pctPoor) pctPoor.textContent = `${poorW}%`;

                // Calculate Pin Marker position (0% - 100%)
                if (pinWrap && pinVal) {
                    pinVal.textContent = metric.displayValue || '—';
                    pinVal.style.color = textColor;

                    const numVal = metric.value;
                    let pinPos = 50;

                    if (numVal != null) {
                        const totalW = (goodW + niW + poorW) || 100;
                        const gW = (goodW / totalW) * 100;
                        const nW = (niW / totalW) * 100;
                        const pW = (poorW / totalW) * 100;

                        if (metricType === 'lcp') {
                            if (metric.status === 'good') {
                                pinPos = Math.min(1, numVal / 2.5) * Math.max(15, gW);
                            } else if (metric.status === 'needs-improvement') {
                                pinPos = gW + Math.min(1, Math.max(0, (numVal - 2.5) / 1.5)) * nW;
                            } else {
                                pinPos = gW + nW + Math.min(1, Math.max(0, (numVal - 4.0) / 4.0)) * pW;
                            }
                        } else if (metricType === 'inp') {
                            if (metric.status === 'good') {
                                pinPos = Math.min(1, numVal / 200) * Math.max(15, gW);
                            } else if (metric.status === 'needs-improvement') {
                                pinPos = gW + Math.min(1, Math.max(0, (numVal - 200) / 300)) * nW;
                            } else {
                                pinPos = gW + nW + Math.min(1, Math.max(0, (numVal - 500) / 500)) * pW;
                            }
                        } else if (metricType === 'cls') {
                            if (metric.status === 'good') {
                                pinPos = Math.min(1, numVal / 0.10) * Math.max(15, gW);
                            } else if (metric.status === 'needs-improvement') {
                                pinPos = gW + Math.min(1, Math.max(0, (numVal - 0.10) / 0.15)) * nW;
                            } else {
                                pinPos = gW + nW + Math.min(1, Math.max(0, (numVal - 0.25) / 0.25)) * pW;
                            }
                        }
                    }

                    // Clamp position between 4% and 96%
                    const clampedPos = Math.max(4, Math.min(96, pinPos));
                    pinWrap.style.left = `${clampedPos}%`;
                }
            };

            renderCwvMetric('Lcp', cwv.lcp, 'lcp');
            renderCwvMetric('Inp', cwv.inp, 'inp');
            renderCwvMetric('Cls', cwv.cls, 'cls');

            // Additional Performance Metrics
            const metrics = data.metrics || {};
            document.getElementById('psFcpVal').textContent = metrics.fcp || '—';
            document.getElementById('psTtfbVal').textContent = metrics.ttfb || '—';
            document.getElementById('psSpeedIndexVal').textContent = metrics.speedIndex || '—';
            document.getElementById('psTbtVal').textContent = metrics.tbt || '—';
        }

        function renderOverviewPageSpeedCharts(mobileData, desktopData) {
            const ovPsAnalyzedUrl = document.getElementById('ovPsAnalyzedUrl');
            if (ovPsAnalyzedUrl) {
                ovPsAnalyzedUrl.textContent = `URL: ${mobileData?.url || desktopData?.url || '—'}`;
            }

            const mScores = mobileData?.scores || {};
            const mScore = mScores.performance != null ? mScores.performance : null;
            updateOverviewDoughnut('overviewPsMobileChart', 'ovPsMobileScoreCenter', 'ovPsMobileStatusBadge', mScore);

            const dScores = desktopData?.scores || {};
            const dScore = dScores.performance != null ? dScores.performance : null;
            updateOverviewDoughnut('overviewPsDesktopChart', 'ovPsDesktopScoreCenter', 'ovPsDesktopStatusBadge', dScore);
        }

        function updateOverviewDoughnut(chartId, centerId, badgeId, score) {
            const scoreCenter = document.getElementById(centerId);
            const badge = document.getElementById(badgeId);

            if (scoreCenter) {
                scoreCenter.textContent = score != null ? score : '—';
            }

            if (badge) {
                if (score == null) {
                    badge.textContent = '—';
                    badge.className = 'gsc-position-badge gsc-pos-mid';
                } else if (score >= 90) {
                    badge.textContent = 'Good';
                    badge.className = 'gsc-position-badge gsc-pos-top';
                } else if (score >= 50) {
                    badge.textContent = 'Needs Imp.';
                    badge.className = 'gsc-position-badge gsc-pos-mid';
                } else {
                    badge.textContent = 'Poor';
                    badge.className = 'gsc-position-badge gsc-pos-low';
                }
            }

            const ctx = document.getElementById(chartId);
            if (!ctx) return;

            let borderCol = '#2a3346'; // Neutral background circle color
            if (score != null) {
                if (score >= 90) borderCol = '#12b47a';
                else if (score >= 50) borderCol = '#f59e0b';
                else borderCol = '#e5403c';
            }

            const data = {
                labels: ['Score', 'Remaining'],
                datasets: [{
                    data: score != null ? [score, 100 - score] : [0, 100],
                    backgroundColor: [borderCol, 'rgba(238,241,247,0.8)'],
                    borderWidth: 0,
                    hoverOffset: 0
                }]
            };

            const options = {
                cutout: '75%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                if (context.dataIndex === 0) {
                                    return score != null ? ` Performance: ${score}/100` : ' Not analyzed';
                                }
                                return null;
                            }
                        }
                    }
                }
            };

            makeChart(chartId, 'doughnut', data, options);
        }

        // Attach listeners for Page Performance controls
        const psAnalyzeBtn = document.getElementById('psAnalyzeBtn');
        if (psAnalyzeBtn) psAnalyzeBtn.addEventListener('click', () => fetchPageSpeedAnalysis(false));

        const psRefreshBtn = document.getElementById('psRefreshBtn');
        if (psRefreshBtn) psRefreshBtn.addEventListener('click', () => fetchPageSpeedAnalysis(true));

        const psUrlInput = document.getElementById('psUrlInput');
        if (psUrlInput) psUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') fetchPageSpeedAnalysis(false);
        });

        document.querySelectorAll('.ps-strat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.ps-strat-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'transparent';
                    b.style.color = 'var(--muted)';
                    b.style.boxShadow = 'none';
                });
                btn.classList.add('active');
                btn.style.background = 'var(--white)';
                btn.style.color = 'var(--primary)';
                btn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';

                psActiveStrategy = btn.dataset.strategy;
                fetchPageSpeedAnalysis(false);
            });
        });

        // Set default custom date range inputs to today and 31 days ago
        const today = new Date().toISOString().slice(0, 10);
        const d31 = new Date(); d31.setDate(d31.getDate() - 30);
        document.getElementById('customEnd').value = today;
        document.getElementById('customStart').value = d31.toISOString().slice(0, 10);

        // ── GA4 NESTED FILTER DROPDOWN SYSTEM ──────────────────────────────────────
        const GA4_FILTER_SCHEMA = {
            geography: {
                title: 'Geography',
                icon: '🌍',
                dimensions: [
                    { key: 'country', name: 'Country' },
                    { key: 'region', name: 'Region' },
                    { key: 'city', name: 'City' },
                    { key: 'continent', name: 'Continent' }
                ]
            },
            traffic: {
                title: 'Traffic source',
                icon: '🔀',
                dimensions: [
                    { key: 'sessionSource', name: 'Session source' },
                    { key: 'sessionMedium', name: 'Session medium' },
                    { key: 'sessionSourceMedium', name: 'Session source / medium' },
                    { key: 'sessionCampaignName', name: 'Session campaign' },
                    { key: 'sessionDefaultChannelGroup', name: 'Default channel group' }
                ]
            },
            platform: {
                title: 'Platform / device',
                icon: '💻',
                dimensions: [
                    { key: 'deviceCategory', name: 'Device category' },
                    { key: 'operatingSystem', name: 'Operating system' },
                    { key: 'browser', name: 'Browser' },
                    { key: 'platform', name: 'Platform' }
                ]
            }
        };

        let activeGAFilters = {}; // { dimensionKey: [val1, val2] }
        let gaFdCurrentCategoryKey = null;
        let gaFdCurrentDimension = null;
        let gaFdFetchedValues = [];
        let gaFdTempSelected = new Set();

        function initGA4FilterDropdown() {
            const filterBtn = document.getElementById('gaFilterBtn');
            const pageFilterBtn = document.getElementById('gaTopPagesFilterBtn');
            const dropdown = document.getElementById('gaFilterDropdown');
            const searchInput = document.getElementById('gaFdSearchInput');
            const searchClear = document.getElementById('gaFdSearchClear');
            const backToCategoriesBtn = document.getElementById('gaFdBackToCategories');
            const backToDimensionsBtn = document.getElementById('gaFdBackToDimensions');
            const applyBtn = document.getElementById('gaFdApplyBtn');
            const clearAllBtn = document.getElementById('gaClearAllFiltersBtn');

            if (!dropdown) return;

            const toggleDropdown = (e) => {
                e.stopPropagation();
                const isOpen = dropdown.style.display !== 'none';
                if (isOpen) {
                    closeGAFilterDropdown();
                } else {
                    openGAFilterDropdown();
                }
            };

            // Toggle dropdown from main or top pages filter button
            if (filterBtn) filterBtn.addEventListener('click', toggleDropdown);
            if (pageFilterBtn) pageFilterBtn.addEventListener('click', toggleDropdown);

            // Close on outside click
            document.addEventListener('click', (e) => {
                const isBtn = (filterBtn && filterBtn.contains(e.target)) || (pageFilterBtn && pageFilterBtn.contains(e.target));
                if (dropdown.style.display !== 'none' && !dropdown.contains(e.target) && !isBtn) {
                    closeGAFilterDropdown();
                }
            });

            // Category click handlers
            document.querySelectorAll('#gaFdViewCategories .ga-fd-menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    const catKey = item.dataset.category;
                    showDimensionsView(catKey);
                });
            });

            // Back to categories
            backToCategoriesBtn.addEventListener('click', () => {
                showCategoriesView();
            });

            // Back to dimensions
            backToDimensionsBtn.addEventListener('click', () => {
                showDimensionsView(gaFdCurrentCategoryKey);
            });

            // Search input handler
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                searchClear.style.display = query ? 'block' : 'none';
                handleGAFilterSearch(query);
            });

            searchClear.addEventListener('click', () => {
                searchInput.value = '';
                searchClear.style.display = 'none';
                handleGAFilterSearch('');
            });

            // Apply button
            applyBtn.addEventListener('click', () => {
                if (!gaFdCurrentDimension) return;
                const selectedArr = Array.from(gaFdTempSelected);
                if (selectedArr.length > 0) {
                    activeGAFilters[gaFdCurrentDimension.key] = selectedArr;
                } else {
                    delete activeGAFilters[gaFdCurrentDimension.key];
                }
                closeGAFilterDropdown();
                applyGAFiltersToServer();
            });

            // Clear all button
            clearAllBtn.addEventListener('click', () => {
                activeGAFilters = {};
                renderActiveGAFilterChips();
                applyGAFiltersToServer();
            });
        }

        function openGAFilterDropdown() {
            const dropdown = document.getElementById('gaFilterDropdown');
            dropdown.style.display = 'block';
            showCategoriesView();
        }

        function closeGAFilterDropdown() {
            const dropdown = document.getElementById('gaFilterDropdown');
            dropdown.style.display = 'none';
            const searchInput = document.getElementById('gaFdSearchInput');
            if (searchInput) searchInput.value = '';
            const searchClear = document.getElementById('gaFdSearchClear');
            if (searchClear) searchClear.style.display = 'none';
        }

        function showCategoriesView() {
            gaFdCurrentCategoryKey = null;
            gaFdCurrentDimension = null;
            document.getElementById('gaFdViewCategories').style.display = 'block';
            document.getElementById('gaFdViewDimensions').style.display = 'none';
            document.getElementById('gaFdViewValues').style.display = 'none';
            document.getElementById('gaFdSearchInput').placeholder = 'Search filter categories or dimensions...';
        }

        function showDimensionsView(catKey) {
            gaFdCurrentCategoryKey = catKey;
            gaFdCurrentDimension = null;
            const catObj = GA4_FILTER_SCHEMA[catKey];
            if (!catObj) return;

            document.getElementById('gaFdCategoryTitle').textContent = catObj.title;
            const listContainer = document.getElementById('gaFdDimensionsList');
            listContainer.innerHTML = '';

            catObj.dimensions.forEach(dim => {
                const item = document.createElement('div');
                item.className = 'ga-fd-menu-item';
                item.innerHTML = `
                    <span class="ga-fd-item-text">${dim.name}</span>
                    <span class="ga-fd-item-arrow">&rsaquo;</span>
                `;
                item.addEventListener('click', () => {
                    showValuesView(dim);
                });
                listContainer.appendChild(item);
            });

            document.getElementById('gaFdViewCategories').style.display = 'none';
            document.getElementById('gaFdViewDimensions').style.display = 'block';
            document.getElementById('gaFdViewValues').style.display = 'none';
            document.getElementById('gaFdSearchInput').placeholder = `Search in ${catObj.title}...`;
        }

        async function showValuesView(dimObj) {
            gaFdCurrentDimension = dimObj;
            document.getElementById('gaFdDimensionTitle').textContent = dimObj.name;

            document.getElementById('gaFdViewCategories').style.display = 'none';
            document.getElementById('gaFdViewDimensions').style.display = 'none';
            document.getElementById('gaFdViewValues').style.display = 'block';
            document.getElementById('gaFdSearchInput').placeholder = `Search ${dimObj.name} values...`;

            const loadingEl = document.getElementById('gaFdValuesLoading');
            const errorEl = document.getElementById('gaFdValuesError');
            const listEl = document.getElementById('gaFdValuesList');

            loadingEl.style.display = 'block';
            errorEl.style.display = 'none';
            listEl.innerHTML = '';

            // Initialize temp selections from activeGAFilters if present
            gaFdTempSelected = new Set(activeGAFilters[dimObj.key] || []);
            updateGAFdSelectedCount();

            try {
                const res = await fetch(`/api/analytics/dimension-values?dimension=${dimObj.key}`);
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || 'Failed to fetch values');

                gaFdFetchedValues = json.data || [];
                renderGAFdValuesList(gaFdFetchedValues);
            } catch (err) {
                console.error('Fetch dimension values error:', err.message);
                errorEl.textContent = 'Error loading values: ' + err.message;
                errorEl.style.display = 'block';
            } finally {
                loadingEl.style.display = 'none';
            }
        }

        function renderGAFdValuesList(valuesArr) {
            const listEl = document.getElementById('gaFdValuesList');
            listEl.innerHTML = '';

            if (!valuesArr.length) {
                listEl.innerHTML = '<div class="no-data" style="padding:16px;">No matching values found</div>';
                return;
            }

            // Prepend "Select All" option
            const selectAllItem = document.createElement('label');
            selectAllItem.className = 'ga-fd-value-checkbox-item select-all-item';
            selectAllItem.style.borderBottom = '1px solid var(--border)';
            selectAllItem.style.paddingBottom = '9px';
            selectAllItem.style.marginBottom = '4px';
            selectAllItem.style.fontWeight = '600';
            
            // Check if all visible items are currently checked
            const allChecked = valuesArr.every(itemObj => gaFdTempSelected.has(itemObj.value));
            
            selectAllItem.innerHTML = `
                <input type="checkbox" ${allChecked ? 'checked' : ''}>
                <span style="color: #1a73e8;">Select All</span>
            `;
            
            const selectAllCb = selectAllItem.querySelector('input');
            selectAllCb.addEventListener('change', (e) => {
                const checked = e.target.checked;
                valuesArr.forEach(itemObj => {
                    if (checked) {
                        gaFdTempSelected.add(itemObj.value);
                    } else {
                        gaFdTempSelected.delete(itemObj.value);
                    }
                });
                
                // Update check state for all individual checkboxes in the DOM
                listEl.querySelectorAll('.ga-fd-value-checkbox-item:not(.select-all-item) input').forEach(cb => {
                    cb.checked = checked;
                });
                
                updateGAFdSelectedCount();
            });
            listEl.appendChild(selectAllItem);

            // Render individual items
            valuesArr.forEach(itemObj => {
                const item = document.createElement('label');
                item.className = 'ga-fd-value-checkbox-item';
                const isChecked = gaFdTempSelected.has(itemObj.value);
                item.innerHTML = `
                    <input type="checkbox" value="${itemObj.value.replace(/"/g, '&quot;')}" ${isChecked ? 'checked' : ''}>
                    <span>${itemObj.value}</span>
                    <span class="ga-fd-value-count">${fmt(itemObj.count)}</span>
                `;
                const cb = item.querySelector('input');
                cb.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        gaFdTempSelected.add(itemObj.value);
                    } else {
                        gaFdTempSelected.delete(itemObj.value);
                    }
                    updateGAFdSelectedCount();
                    
                    // Update "Select All" checkbox state
                    const currentAllChecked = valuesArr.every(vObj => gaFdTempSelected.has(vObj.value));
                    selectAllCb.checked = currentAllChecked;
                });
                listEl.appendChild(item);
            });
        }

        function updateGAFdSelectedCount() {
            const countEl = document.getElementById('gaFdValuesSelectedCount');
            if (countEl) {
                countEl.textContent = `${gaFdTempSelected.size} selected`;
            }
        }

        function handleGAFilterSearch(query) {
            const viewCat = document.getElementById('gaFdViewCategories');
            const viewDim = document.getElementById('gaFdViewDimensions');
            const viewVal = document.getElementById('gaFdViewValues');

            if (viewVal.style.display !== 'none') {
                // Filter level 3 values
                if (!query) {
                    renderGAFdValuesList(gaFdFetchedValues);
                } else {
                    const filtered = gaFdFetchedValues.filter(v => v.value.toLowerCase().includes(query));
                    renderGAFdValuesList(filtered);
                }
            } else if (viewDim.style.display !== 'none' && gaFdCurrentCategoryKey) {
                // Filter level 2 dimensions
                const catObj = GA4_FILTER_SCHEMA[gaFdCurrentCategoryKey];
                const listContainer = document.getElementById('gaFdDimensionsList');
                listContainer.innerHTML = '';

                catObj.dimensions.forEach(dim => {
                    if (!query || dim.name.toLowerCase().includes(query)) {
                        const item = document.createElement('div');
                        item.className = 'ga-fd-menu-item';
                        item.innerHTML = `
                            <span class="ga-fd-item-text">${dim.name}</span>
                            <span class="ga-fd-item-arrow">&rsaquo;</span>
                        `;
                        item.addEventListener('click', () => showValuesView(dim));
                        listContainer.appendChild(item);
                    }
                });
            } else if (viewCat.style.display !== 'none') {
                // Filter categories
                document.querySelectorAll('#gaFdViewCategories .ga-fd-menu-item').forEach(item => {
                    const catKey = item.dataset.category;
                    const catObj = GA4_FILTER_SCHEMA[catKey];
                    const match = !query || catObj.title.toLowerCase().includes(query) || catObj.dimensions.some(d => d.name.toLowerCase().includes(query));
                    item.style.display = match ? 'flex' : 'none';
                });
            }
        }

        function renderActiveGAFilterChips() {
            const chipsContainers = document.querySelectorAll('.ga-filter-chips-list');
            const clearAllBtn = document.getElementById('gaClearAllFiltersBtn');
            if (!chipsContainers.length) return;

            chipsContainers.forEach(container => { container.innerHTML = ''; });
            const activeKeys = Object.keys(activeGAFilters);

            if (!activeKeys.length) {
                if (clearAllBtn) clearAllBtn.style.display = 'none';
                return;
            }

            if (clearAllBtn) clearAllBtn.style.display = 'inline-block';

            // Find label for dimension key
            function getDimName(key) {
                for (const cat of Object.values(GA4_FILTER_SCHEMA)) {
                    const found = cat.dimensions.find(d => d.key === key);
                    if (found) return found.name;
                }
                return key;
            }

            activeKeys.forEach(dimKey => {
                const vals = activeGAFilters[dimKey];
                if (!vals || !vals.length) return;

                const displayVal = vals.length === 1 ? vals[0] : `${vals[0]} (+${vals.length - 1})`;

                chipsContainers.forEach(container => {
                    const chip = document.createElement('div');
                    chip.className = 'ga-chip';
                    chip.innerHTML = `
                        <span class="ga-chip-category">${getDimName(dimKey)}:</span>
                        <span>${displayVal}</span>
                        <span class="ga-chip-close" title="Remove filter">&times;</span>
                    `;

                    chip.querySelector('.ga-chip-close').addEventListener('click', () => {
                        delete activeGAFilters[dimKey];
                        renderActiveGAFilterChips();
                        applyGAFiltersToServer();
                    });

                    container.appendChild(chip);
                });
            });
        }

        async function applyGAFiltersToServer() {
            renderActiveGAFilterChips();

            const rangeTag = document.getElementById('gaRangeTag');
            if (rangeTag) {
                const count = Object.keys(activeGAFilters).length;
                rangeTag.textContent = count > 0 ? `Filtered (${count} active)` : 'Last 31 Days';
            }

            // Call server to fetch filtered GA4 data
            try {
                const res = await fetch('/api/analytics/filter', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filters: activeGAFilters })
                });
                const json = await res.json();
                if (!res.ok || !json.success) throw new Error(json.error || 'Filtering failed');

                const filterData = json.data;
                if (filterData.GA4_DAILY) GA4_DAILY = filterData.GA4_DAILY;
                if (filterData.GA4_CHANNELS) GA4_CHANNELS = filterData.GA4_CHANNELS;
                if (filterData.GA4_PAGES) GA4_PAGES = filterData.GA4_PAGES;

                // Re-render dashboard visualizations for GA4
                if (typeof renderAll === 'function') {
                    renderAll();
                }

                // Also update countries table if filtered countries data was returned
                if (filterData.GA4_COUNTRIES) {
                    renderFilteredGA4Countries(filterData.GA4_COUNTRIES);
                }
            } catch (err) {
                console.error('Apply GA filters failed:', err.message);
            }
        }

        function renderFilteredGA4Countries(rows) {
            var cLoading = document.getElementById('gaCountriesLoading');
            var cErrEl = document.getElementById('gaCountriesError');
            var cEmptyEl = document.getElementById('gaCountriesEmpty');
            var cTableWrap = document.getElementById('gaCountriesTableWrap');
            var cTbody = document.getElementById('gaCountriesTable');
            var cPrompt = document.getElementById('gaCountriesPrompt');

            [cLoading, cErrEl, cEmptyEl, cTableWrap, cPrompt].forEach(function (el) { if (el) el.style.display = 'none'; });

            if (!rows || !rows.length) {
                if (cEmptyEl) cEmptyEl.style.display = 'block';
                return;
            }

            var total = rows.reduce(function (s, r) { return s + r.views; }, 0);
            cTbody.innerHTML = '';
            rows.forEach(function (r, i) {
                var pct = total > 0 ? ((r.views / total) * 100).toFixed(1) : '0.0';
                var tr = document.createElement('tr');
                tr.innerHTML = '<td><span class="rank-badge">' + (i + 1) + '</span></td>' +
                    '<td>' + r.country + '</td>' +
                    '<td style="text-align:right;">' + fmt(r.views) + '</td>' +
                    '<td style="text-align:right;color:var(--text2);">' + pct + '%</td>';
                cTbody.appendChild(tr);
            });
            if (cTableWrap) cTableWrap.style.display = '';
        }

        // Boot
        initGA4FilterDropdown();
        loadCachedData();
    