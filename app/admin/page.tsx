'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Chart } from 'chart.js/auto';
import { useTheme } from '@/providers/theme-provider';
import InteractiveChartTableModal from '@/components/dashboard/InteractiveChartTableModal';

const SUPERVISOR_TO_MANAGER: Record<string, string> = {
  'YASAR': 'KHALID',
  'JAHID': 'ASHFAQ',
  'MUSAVEER': 'KHALID',
  'RIZVI': 'KHALID',
  'WALI': 'ASHFAQ',
  'DANISH': 'KHALID',
  'SAIF': 'ASHFAQ',
  'ZEESHAN': 'ASHFAQ',
  'SAIFULLAH': 'ADNAN',
  'RASHWIN': 'ADNAN',
  'MOHSIN': 'ADNAN',
  'JAVED': 'ADNAN',
  'ASAD': 'ADNAN',
  'KISHAN': 'ADNAN',
  'WASIM': 'INST MANAGER',
  'SAMRA': 'EXP MANAGER',
};

const GCOL: Record<string, string> = {
  A: '#0b7a4c',
  B: '#2b9c62',
  C: '#c8801a',
  D: '#d9663a',
  E: '#c0392b',
};

export default function AdminDashboardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isSyncing, setIsSyncing] = useState(false);
  const { theme } = useTheme();

  // Filter States
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fTime, setFTime] = useState('');
  const [fMgr, setFMgr] = useState('');
  const [fSuper, setFSuper] = useState('');
  const [fChannel, setFChannel] = useState('');
  const [fClass, setFClass] = useState('');
  const [fCust, setFCust] = useState('');

  // Canvas Refs
  const canvasTrendRef = useRef<HTMLCanvasElement>(null);
  const canvasChannelRef = useRef<HTMLCanvasElement>(null);
  const canvasSuperRef = useRef<HTMLCanvasElement>(null);
  const canvasTempRef = useRef<HTMLCanvasElement>(null);
  const canvasNpdRef = useRef<HTMLCanvasElement>(null);
  const canvasPskuRef = useRef<HTMLCanvasElement>(null);
  const canvasClassRef = useRef<HTMLCanvasElement>(null);

  // Chart instances
  const chartsRef = useRef<Record<string, any>>({});

  // Fetch real data on mount & poll every 10 seconds
  useEffect(() => {
    let active = true;
    async function loadData(silent = false) {
      if (!silent) setIsLoading(true);
      else setIsSyncing(true);
      try {
        const res = await fetch('/api/dashboard');
        const data = await res.json();
        if (data.success && active) {
          setRows(data.rows);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        if (active) {
          setIsLoading(false);
          setIsSyncing(false);
        }
      }
    }
    loadData(false);

    const timer = setInterval(() => {
      loadData(true);
    }, 10000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const normalizeDate = (value: string) => value ? new Date(`${value}T00:00:00`) : null;

  // Compute dropdown values from unfiltered rows
  // 1. Manager Options: filtered by Time Period only
  const mgrOptions = useMemo(() => {
    const filteredByTime = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && fromOk && toOk;
    });
    return Array.from(new Set(filteredByTime.map((r) => r.mgr))).sort();
  }, [rows, fTime, fFrom, fTo]);

  // 2. Supervisor Options: filtered by Time Period and Manager
  const supOptions = useMemo(() => {
    const filteredByTimeAndMgr = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fMgr || r.mgr === fMgr) && fromOk && toOk;
    });
    return Array.from(new Set(filteredByTimeAndMgr.map((r) => r.sup))).sort();
  }, [rows, fTime, fMgr, fFrom, fTo]);

  // 3. Channel Options: filtered by Time Period, Manager, and Supervisor
  const channelOptions = useMemo(() => {
    const filteredByTimeMgrSuper = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fMgr || r.mgr === fMgr) && (!fSuper || r.sup === fSuper) && fromOk && toOk;
    });
    return Array.from(new Set(filteredByTimeMgrSuper.map((r) => r.ch))).sort();
  }, [rows, fTime, fMgr, fSuper, fFrom, fTo]);

  // 4. Customer / Outlet Options: filtered by Time Period, Manager, Supervisor, Channel, and Classification
  const custOptions = useMemo(() => {
    const filteredByAllUpstream = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fMgr || r.mgr === fMgr) && (!fSuper || r.sup === fSuper) && (!fChannel || r.ch === fChannel) && (!fClass || r.gr === fClass) && fromOk && toOk;
    });
    return Array.from(new Set(filteredByAllUpstream.map((r) => r.cust))).sort();
  }, [rows, fTime, fMgr, fSuper, fChannel, fClass, fFrom, fTo]);

  // 5. Classification Options: filtered by Time Period, Manager, Supervisor, Channel, and Outlet
  const classOptions = useMemo(() => {
    const filteredByAllUpstream = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fMgr || r.mgr === fMgr) && (!fSuper || r.sup === fSuper) && (!fChannel || r.ch === fChannel) && (!fCust || r.cust === fCust) && fromOk && toOk;
    });
    return Array.from(new Set(filteredByAllUpstream.map((r) => r.gr))).sort();
  }, [rows, fTime, fMgr, fSuper, fChannel, fCust, fFrom, fTo]);

  // Reset helper
  const resetFilters = () => {
    setFFrom('');
    setFTo('');
    setFTime('');
    setFMgr('');
    setFSuper('');
    setFChannel('');
    setFClass('');
    setFCust('');
  };

  // Filtered rows matching selection
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fMgr || r.mgr === fMgr) && (!fSuper || r.sup === fSuper) && (!fChannel || r.ch === fChannel) && (!fClass || r.gr === fClass) && (!fCust || r.cust === fCust) && fromOk && toOk;
    });
  }, [rows, fTime, fMgr, fSuper, fChannel, fClass, fCust, fFrom, fTo]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalData, setModalData] = useState<any[]>([]);

  const handleChartClick = (chartTitle: string, filterFn: (row: any) => boolean) => {
    const matched = filtered.filter(filterFn);
    setModalTitle(chartTitle);
    setModalData(matched);
    setModalOpen(true);
  };

  // Compute KPI values
  const outletsCount = useMemo(() => new Set(filtered.map((r) => r.cust)).size, [filtered]);
  const breachesCount = useMemo(() => filtered.filter((r) => !r.ok).length, [filtered]);
  const fefoCount = useMemo(() => filtered.filter((r) => r.fefo).length, [filtered]);
  const breachPct = useMemo(
    () => (filtered.length ? ((breachesCount / filtered.length) * 100).toFixed(1) + '% of assets' : '–'),
    [filtered, breachesCount]
  );
  const fefoPct = useMemo(
    () => (filtered.length ? Math.round((fefoCount / filtered.length) * 100) + '%' : '–'),
    [filtered, fefoCount]
  );

  // Compute Manager scorecard metrics
  const mgrTableData = useMemo(() => {
    const mgrs: Record<string, { v: number; o: Set<string>; b: number; f: number }> = {};
    filtered.forEach((r) => {
      if (!mgrs[r.mgr]) {
        mgrs[r.mgr] = { v: 0, o: new Set(), b: 0, f: 0 };
      }
      const m = mgrs[r.mgr];
      m.v++;
      m.o.add(r.cust);
      if (!r.ok) m.b++;
      if (r.fefo) m.f++;
    });
    return Object.entries(mgrs).sort((a, b) => b[1].v - a[1].v);
  }, [filtered]);

  // Render active note description
  const activeNote = useMemo(() => {
    const parts = [];
    if (fFrom || fTo) parts.push(`Date: <b>${fFrom || 'Start'} → ${fTo || 'Now'}</b>`);
    if (fTime) parts.push(`Period: <b>${fTime === 'recent' ? 'Recent' : 'Earlier'}</b>`);
    if (fMgr) parts.push(`Manager: <b>${fMgr}</b>`);
    if (fSuper) parts.push(`Supervisor: <b>${fSuper}</b>`);
    if (fChannel) parts.push(`Channel: <b>${fChannel}</b>`);
    if (fClass) parts.push(`Classification: <b>${fClass}</b>`);
    if (fCust) parts.push(`Outlet: <b>${fCust}</b>`);
    return parts.length ? 'Filtered by ' + parts.join(' · ') : 'Showing all visits';
  }, [fFrom, fTo, fTime, fMgr, fSuper, fChannel, fClass, fCust]);

  // Chart Rendering Hook
  useEffect(() => {
    if (isLoading || !filtered) return;

    const BLUE = '#4F46E5', BLUE_DEEP = '#4338CA', GREEN = '#0f9d63', AMBER = '#d08a12', RED = '#d63d2e', GREY = '#c3d2de';
    const isDark = theme === 'dark';
    const gridColor = isDark ? '#2A3A55' : '#E4E9F0';
    const textColor = isDark ? '#94A3B8' : '#5A6478';

    const countFreq = (arr: any[], fn: (r: any) => string | number) => {
      const m: Record<string, number> = {};
      arr.forEach((r) => {
        const k = fn(r);
        m[k] = (m[k] || 0) + 1;
      });
      return m;
    };

    // 1. Trend Line Chart
    if (canvasTrendRef.current) {
      if (chartsRef.current.cTrend) chartsRef.current.cTrend.destroy();
      const wk = countFreq(filtered, (r) => r.week);
      const weeks = [1, 2, 3, 4, 5, 6, 7, 8];
      chartsRef.current.cTrend = new Chart(canvasTrendRef.current, {
        type: 'line',
        data: {
          labels: weeks.map((w) => 'W' + w),
          datasets: [
            {
              label: 'Visits',
              data: weeks.map((w) => wk[w] || 0),
              borderColor: BLUE,
              backgroundColor: 'rgba(79,70,229,.12)',
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              borderWidth: 2.5,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              const weekNum = parseInt(label.replace('W', ''), 10);
              handleChartClick(`Visits for Week ${weekNum}`, (r) => r.week === weekNum);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
          },
        },
      });
    }

    // 2. Channel Doughnut Chart
    if (canvasChannelRef.current) {
      if (chartsRef.current.cChannel) chartsRef.current.cChannel.destroy();
      const ch = countFreq(filtered, (r) => r.ch);
      const chL = ['TT', 'MT', 'INST', 'EXPORT'];
      chartsRef.current.cChannel = new Chart(canvasChannelRef.current, {
        type: 'doughnut',
        data: {
          labels: chL,
          datasets: [
            {
              data: chL.map((c) => ch[c] || 0),
              backgroundColor: [BLUE, GREEN, AMBER, BLUE_DEEP],
              borderWidth: 0,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { color: textColor } } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              handleChartClick(`Visits for ${label} Channel`, (r) => r.ch === label);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
        },
      });
    }

    // 3. Supervisor Scorecard Bar Chart
    if (canvasSuperRef.current) {
      if (chartsRef.current.cSuper) chartsRef.current.cSuper.destroy();
      const sc = countFreq(filtered, (r) => r.sup);
      const topSup = Object.entries(sc)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);
      chartsRef.current.cSuper = new Chart(canvasSuperRef.current, {
        type: 'bar',
        data: {
          labels: topSup.map((x) => x[0]),
          datasets: [
            {
              label: 'Visits',
              data: topSup.map((x) => x[1]),
              backgroundColor: BLUE,
              borderRadius: 6,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              handleChartClick(`Visits for Supervisor ${label}`, (r) => r.sup === label);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
          },
        },
      });
    }

    // 4. Cold Chain Doughnut Chart
    if (canvasTempRef.current) {
      if (chartsRef.current.cTemp) chartsRef.current.cTemp.destroy();
      const ok = filtered.filter((r) => r.ok).length;
      const breaches = filtered.filter((r) => !r.ok).length;
      chartsRef.current.cTemp = new Chart(canvasTempRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Within range', 'Breach'],
          datasets: [
            {
              data: [ok, breaches],
              backgroundColor: [GREEN, RED],
              borderWidth: 0,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          cutout: '62%',
          plugins: { legend: { position: 'bottom', labels: { color: textColor } } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              const isOk = label === 'Within range';
              handleChartClick(`Visits with Temperature Status: ${label}`, (r) => r.ok === isOk);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
        },
      });
    }

    // 5. NPD Availability Bar Chart
    if (canvasNpdRef.current) {
      if (chartsRef.current.cNpd) chartsRef.current.cNpd.destroy();
      const npd = countFreq(filtered, (r) => r.npd);
      chartsRef.current.cNpd = new Chart(canvasNpdRef.current, {
        type: 'bar',
        data: {
          labels: ['Available', 'Not avail.', 'Not req.'],
          datasets: [
            {
              data: [npd.A || 0, npd.N || 0, npd.X || 0],
              backgroundColor: [GREEN, RED, GREY],
              borderRadius: 6,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              const npdCode = label === 'Available' ? 'A' : label === 'Not avail.' ? 'N' : 'X';
              handleChartClick(`Visits with NPD Status: ${label}`, (r) => r.npd === npdCode);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
          },
        },
      });
    }

    // 6. Focus SKU Availability Bar Chart
    if (canvasPskuRef.current) {
      if (chartsRef.current.cPsku) chartsRef.current.cPsku.destroy();
      const psku = countFreq(filtered, (r) => r.psku);
      chartsRef.current.cPsku = new Chart(canvasPskuRef.current, {
        type: 'bar',
        data: {
          labels: ['Available', 'Not avail.', 'Not req.'],
          datasets: [
            {
              data: [psku.A || 0, psku.N || 0, psku.X || 0],
              backgroundColor: [GREEN, RED, GREY],
              borderRadius: 6,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              const pskuCode = label === 'Available' ? 'A' : label === 'Not avail.' ? 'N' : 'X';
              handleChartClick(`Visits with Power SKU Status: ${label}`, (r) => r.psku === pskuCode);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
          },
        },
      });
    }

    // 7. Classification Bar Chart
    if (canvasClassRef.current) {
      if (chartsRef.current.cClass) chartsRef.current.cClass.destroy();
      const cl = countFreq(filtered, (r) => r.gr);
      const grades = ['A', 'B', 'C', 'D', 'E'];
      chartsRef.current.cClass = new Chart(canvasClassRef.current, {
        type: 'bar',
        data: {
          labels: grades,
          datasets: [
            {
              label: 'Visits',
              data: grades.map((g) => cl[g] || 0),
              backgroundColor: grades.map((g) => GCOL[g]),
              borderRadius: 6,
            },
          ],
        },
        options: {
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              handleChartClick(`Visits for Classification Grade ${label}`, (r) => r.gr === label);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor } },
          },
        },
      });
    }
  }, [filtered, isLoading, theme]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
        <p className="text-sm font-bold text-[var(--text-secondary)]">Loading Executive Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dandy-dashboard-body">
      <style dangerouslySetInnerHTML={{ __html: `
        .dandy-dashboard-body {
          --ink: var(--text-primary);
          --soft: var(--text-secondary);
          --line: var(--border);
          --card: var(--surface);
          --bg: var(--bg);
          --blue:#4F46E5; --blue-deep:#4338CA; --green:#0f9d63; --amber:#d08a12; --red:#d63d2e;
          --shadow:0 2px 8px rgba(13,33,54,.06),0 8px 24px rgba(13,33,54,.05);
          font-family: var(--font-sans), 'Inter', system-ui, sans-serif;
          background:var(--bg);
          color:var(--ink);
          -webkit-font-smoothing:antialiased;
          padding-bottom:20px;
          margin:-20px; /* offset standard padding */
        }
        .top {
          background:linear-gradient(135deg,#6366F1,#4F46E5);
          color:#fff;
          padding:12px 18px;
          display:flex;
          align-items:center;
          gap:12px;
          box-shadow:var(--shadow);
        }
        .top .logo {
          width:36px;
          height:36px;
          border-radius:9px;
          background:#fff;
          display:grid;
          place-items:center;
          font-weight:800;
          color:#4F46E5;
          font-size:16px;
        }
        .top h1 {
          font-size:17px;
          font-weight:800;
          letter-spacing:-.3px;
        }
        .top .sub {
          font-size:11px;
          opacity:.85;
          font-weight:500;
          margin-top:2px;
        }
        .demo-tag {
          margin-left:auto;
          background:rgba(255,255,255,.18);
          padding:4px 10px;
          border-radius:99px;
          font-size:10px;
          font-weight:700;
          letter-spacing:.03em;
        }
        .wrap {
          max-width:100%;
          padding:14px 14px;
        }
        .filters {
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-bottom:8px;
          align-items:flex-end;
        }
        .fld {
          display:flex;
          flex-direction:column;
          gap:4px;
        }
        .fld label {
          font-size:10.5px;
          font-weight:800;
          text-transform:uppercase;
          letter-spacing:.05em;
          color:var(--soft);
          padding-left:4px;
        }
        .filters select,
        .filters input {
          padding:8px 11px;
          border:1.5px solid var(--line);
          border-radius:11px;
          background:var(--card);
          font-family:inherit;
          font-size:12px;
          font-weight:600;
          color:var(--ink);
          cursor:pointer;
          min-width:120px;
        }
        .filters input {
          cursor:text;
        }
        .filters select:focus,
        .filters input:focus {
          outline:none;
          border-color:var(--blue);
        }
        .reset {
          padding:8px 12px;
          border:1.5px solid var(--line);
          border-radius:11px;
          background:var(--card);
          font-family:inherit;
          font-size:12px;
          font-weight:700;
          color:var(--blue-deep);
          cursor:pointer;
        }
        .live-badge {
          display:flex;
          align-items:center;
          gap:8px;
          padding:8px 12px;
          border:1.5px solid var(--line);
          border-radius:11px;
          background:var(--card);
          font-family:monospace;
          font-size:10.5px;
          font-weight:700;
          color:var(--soft);
          user-select:none;
        }
        .live-dot {
          height:8px;
          width:8px;
          border-radius:50%;
          display:inline-block;
        }
        .live-dot.active {
          background:var(--green);
          box-shadow: 0 0 8px var(--green);
          animation: pulse-dot 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        .live-dot.syncing {
          background:var(--blue);
          box-shadow: 0 0 8px var(--blue);
          animation: pulse-dot 0.6s ease-in-out infinite alternate;
        }
        @keyframes pulse-dot {
          0%, 100% { opacity: 0.35; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        .active-note {
          font-size:11px;
          color:var(--soft);
          font-weight:600;
          margin-bottom:12px;
          padding-left:2px;
          min-height:16px;
        }
        .active-note b {
          color:var(--blue-deep);
        }
        .kpis {
          display:grid;
          grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
          gap:10px;
          margin-bottom:14px;
        }
        .kpi {
          background:var(--card);
          border-radius:12px;
          padding:12px 14px;
          box-shadow:var(--shadow);
          border:1px solid var(--line);
        }
        .kpi .lbl {
          font-size:10px;
          color:var(--soft);
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.04em;
        }
        .kpi .val {
          font-size:24px;
          font-weight:800;
          letter-spacing:-1px;
          margin-top:4px;
        }
        .kpi .delta {
          font-size:11px;
          font-weight:700;
          margin-top:2px;
          color:var(--soft);
        }
        .kpi.b .val { color:var(--blue-deep); }
        .kpi.g .val { color:var(--green); }
        .kpi.a .val { color:var(--amber); }
        .kpi.r .val { color:var(--red); }
        .grid {
          display:grid;
          grid-template-columns:2fr 1fr;
          gap:12px;
          margin-bottom:12px;
        }
        .grid3 {
          display:grid;
          grid-template-columns:1fr 1fr 1fr;
          gap:12px;
          margin-bottom:12px;
        }
        @media(max-width:820px){
          .grid, .grid3 { grid-template-columns:1fr; }
        }
        .panel {
          background:var(--card);
          border-radius:12px;
          padding:12px 14px 6px;
          box-shadow:var(--shadow);
          border:1px solid var(--line);
        }
        .panel.tbl { padding-bottom:12px; }
        .panel h3 {
          font-size:13px;
          font-weight:800;
          margin-bottom:3px;
        }
        .panel .psub {
          font-size:10px;
          color:var(--soft);
          font-weight:600;
          margin-bottom:8px;
        }
        .chart-box { position:relative; height:180px; }
        .chart-sm { position:relative; height:150px; }
        table {
          width:100%;
          border-collapse:collapse;
          font-size:11.5px;
        }
        th {
          text-align:left;
          font-size:10px;
          text-transform:uppercase;
          letter-spacing:.03em;
          color:var(--soft);
          padding:6px 8px;
          border-bottom:2px solid var(--line);
          font-weight:800;
          position:sticky;
          top:0;
          background:var(--card);
        }
        td {
          padding:6px 8px;
          border-bottom:1px solid var(--line);
        }
        tr:hover td { background:var(--surface-2); }
        .tbl-wrap {
          max-height:240px;
          overflow-y:auto;
          overflow-x:auto;
          border-radius:12px;
          border:1px solid var(--line);
          -webkit-overflow-scrolling:touch;
        }
        .pill {
          display:inline-block;
          padding:2px 9px;
          border-radius:99px;
          font-size:11px;
          font-weight:800;
        }
        .pill.g { background:#e3f6ec; color:#0b7a4c; }
        .pill.r { background:#fdebe9; color:var(--red); }
        .grade {
          width:24px;
          height:24px;
          border-radius:6px;
          display:inline-grid;
          place-items:center;
          color:#fff;
          font-weight:800;
          font-size:11px;
        }
        .foot {
          text-align:center;
          color:var(--soft);
          font-size:11px;
          margin-top:14px;
          line-height:1.6;
        }
        @media(max-width: 640px) {
          .top {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
            padding: 12px;
          }
          .top .demo-tag {
            margin-left: 0;
            margin-top: 4px;
          }
        }
        @media(max-width: 480px) {
          .filters {
            flex-direction: column;
            align-items: stretch;
            gap: 8px;
          }
          .fld {
            width: 100%;
          }
          .filters select,
          .filters input {
            width: 100%;
            min-height: 40px;
          }
          .reset {
            width: 100%;
            min-height: 40px;
            text-align: center;
          }
        }
      ` }} />

      {/* Header Banner */}
      <div className="top">
        <div className="logo">D</div>
        <div>
          <h1>Dandy Market Visit — Management Dashboard</h1>
          <div className="sub">Field-force visit compliance & execution · Dandy Company Ltd</div>
        </div>
        <div className="demo-tag">LIVE DATABASE DATA</div>
      </div>

      <div className="wrap">
        {/* Filters Panel */}
        <div className="filters">
          <div className="fld">
            <label>From</label>
            <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} />
          </div>

          <div className="fld">
            <label>To</label>
            <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} />
          </div>

          <div className="fld">
            <label>Time Period</label>
            <select value={fTime} onChange={(e) => {
              setFTime(e.target.value);
              setFMgr('');
              setFSuper('');
              setFChannel('');
              setFCust('');
            }}>
              <option value="">All Periods</option>
              <option value="recent">Recent (W5-W8)</option>
              <option value="earlier">Earlier (W1-W4)</option>
            </select>
          </div>

          <div className="fld">
            <label>Manager</label>
            <select value={fMgr} onChange={(e) => {
              setFMgr(e.target.value);
              setFSuper('');
              setFChannel('');
              setFClass('');
              setFCust('');
            }}>
              <option value="">All Managers</option>
              {mgrOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>Supervisor</label>
            <select value={fSuper} onChange={(e) => {
              setFSuper(e.target.value);
              setFChannel('');
              setFClass('');
              setFCust('');
            }}>
              <option value="">All Supervisors</option>
              {supOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>Channel</label>
            <select value={fChannel} onChange={(e) => {
              setFChannel(e.target.value);
              setFClass('');
              setFCust('');
            }}>
              <option value="">All Channels</option>
              {channelOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>Classification</label>
            <select value={fClass} onChange={(e) => {
              setFClass(e.target.value);
              setFCust('');
            }}>
              <option value="">All Classifications</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>Outlet / Customer</label>
            <select value={fCust} onChange={(e) => setFCust(e.target.value)}>
              <option value="">All Outlets</option>
              {custOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <button className="reset" onClick={resetFilters}>Reset</button>

          <div className="live-badge">
            <span className={`live-dot ${isSyncing ? 'syncing' : 'active'}`} />
            <span>{isSyncing ? 'SYNCING...' : 'LIVE SYNC ACTIVE'}</span>
            <span style={{ opacity: 0.3 }}>|</span>
            <span>UPDATED {lastUpdated.toLocaleTimeString()}</span>
          </div>
        </div>

        {/* Active Filter description */}
        <div className="active-note" dangerouslySetInnerHTML={{ __html: activeNote }} />

        {/* KPI Row */}
        <div className="kpis">
          <div className="kpi b">
            <div className="lbl">Total Visits</div>
            <div className="val">{filtered.length}</div>
            <div className="delta">visits logged</div>
          </div>
          <div className="kpi g">
            <div className="lbl">Outlets Covered</div>
            <div className="val">{outletsCount}</div>
            <div className="delta">unique outlets</div>
          </div>
          <div className="kpi a">
            <div className="lbl">Assets Checked</div>
            <div className="val">{filtered.length}</div>
            <div className="delta">chillers/freezers</div>
          </div>
          <div className="kpi r">
            <div className="lbl">Temp Breaches</div>
            <div className="val">{breachesCount}</div>
            <div className="delta">{breachPct}</div>
          </div>
          <div className="kpi g">
            <div className="lbl">FEFO Compliance</div>
            <div className="val">{fefoPct}</div>
            <div className="delta">assets following FEFO</div>
          </div>
        </div>

        {/* Chart Row 1 */}
        <div className="grid">
          <div className="panel">
            <h3>Visits Over Time</h3>
            <div className="psub">Weekly visits (filtered)</div>
            <div className="chart-box">
              <canvas ref={canvasTrendRef}></canvas>
            </div>
          </div>
          <div className="panel">
            <h3>Visits by Channel</h3>
            <div className="psub">Share across MT / TT / INST / Export</div>
            <div className="chart-sm">
              <canvas ref={canvasChannelRef}></canvas>
            </div>
          </div>
        </div>

        {/* Chart Row 2 */}
        <div className="grid">
          <div className="panel">
            <h3>Supervisor Scorecard</h3>
            <div className="psub">Visits per supervisor (filtered)</div>
            <div className="chart-box">
              <canvas ref={canvasSuperRef}></canvas>
            </div>
          </div>
          <div className="panel">
            <h3>Cold Chain Status</h3>
            <div className="psub">Asset temperature readings</div>
            <div className="chart-sm">
              <canvas ref={canvasTempRef}></canvas>
            </div>
          </div>
        </div>

        {/* Chart Row 3 */}
        <div className="grid3">
          <div className="panel">
            <h3>NPD Availability</h3>
            <div className="psub">New-product presence</div>
            <div className="chart-sm">
              <canvas ref={canvasNpdRef}></canvas>
            </div>
          </div>
          <div className="panel">
            <h3>Power SKU Availability</h3>
            <div className="psub">Focus SKU presence</div>
            <div className="chart-sm">
              <canvas ref={canvasPskuRef}></canvas>
            </div>
          </div>
          <div className="panel">
            <h3>Outlets by Classification</h3>
            <div className="psub">Visit distribution A–E</div>
            <div className="chart-sm">
              <canvas ref={canvasClassRef}></canvas>
            </div>
          </div>
        </div>

        {/* Manager Table */}
        <div className="panel tbl" style={{ marginBottom: '16px' }}>
          <h3>Manager Performance Summary</h3>
          <div className="psub">Visits, coverage & compliance per manager (filtered)</div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Visits</th>
                  <th>Outlets</th>
                  <th>Temp Breach</th>
                  <th>FEFO %</th>
                </tr>
              </thead>
              <tbody>
                {mgrTableData.length > 0 ? (
                  mgrTableData.map(([m, x]: any) => (
                    <tr key={m}>
                      <td style={{ fontWeight: 700 }}>{m}</td>
                      <td>{x.v}</td>
                      <td>{x.o.size}</td>
                      <td>
                        {x.b ? (
                          <span className="pill r">{x.b}</span>
                        ) : (
                          <span className="pill g">0</span>
                        )}
                      </td>
                      <td>{x.v ? Math.round((x.f / x.v) * 100) : 0}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: '#5a7085', padding: '20px' }}>
                      No data for this filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Visit Details Table */}
        <div className="panel tbl">
          <h3>Visit Details</h3>
          <div className="psub">Outlet-level records (filtered) — GM drill-down view</div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Manager</th>
                  <th>Supervisor</th>
                  <th>Outlet</th>
                  <th>Ch</th>
                  <th>Class</th>
                  <th>Asset</th>
                  <th>Temp</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.slice(0, 40).map((r, idx) => (
                    <tr key={idx}>
                      <td>{r.mgr}</td>
                      <td>{r.sup}</td>
                      <td>{r.cust}</td>
                      <td>{r.ch}</td>
                      <td>
                        <span
                          className="grade"
                          style={{ background: GCOL[r.gr] || '#9aa9b4' }}
                        >
                          {r.gr}
                        </span>
                      </td>
                      <td>{r.atype}</td>
                      <td>{r.temp}°C</td>
                      <td>
                        {r.ok ? (
                          <span className="pill g">OK</span>
                        ) : (
                          <span className="pill r">Breach</span>
                        )}
                      </td>
                      <td>{r.action || '—'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: '#5a7085', padding: '20px' }}>
                      No data for this filter
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="foot">
          <b>Real database visits live sync.</b> All five filters above are active — selections recalculate compliance & scorecard data dynamically.
        </div>
      </div>
      <InteractiveChartTableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        data={modalData}
      />
    </div>
  );
}
