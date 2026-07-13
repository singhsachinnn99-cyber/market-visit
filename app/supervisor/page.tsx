'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getVisitsAction, getVisitDetailsAction } from '@/actions/visit-actions';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import { Chart } from 'chart.js/auto';
import { useTheme } from '@/providers/theme-provider';
import {
  FileText, Clock, CheckCircle2, Eye, PlusCircle,
  AlertTriangle, MapPin, X, Calendar, Trash2, Thermometer,
  RefreshCw, ChevronRight,
} from 'lucide-react';
import { Visit, VisitPhoto, VisitWizardState, NPDResponse, VisitAsset, VisitPowerSkuResult } from '@/types';
import InteractiveChartTableModal from '@/components/dashboard/InteractiveChartTableModal';
import DrilldownReportModal from '@/components/dashboard/DrilldownReportModal';
import { getAllowedReports, isFleetRole } from '@/lib/roles';

const GCOL: Record<string, string> = {
  A: '#0b7a4c',
  B: '#2b9c62',
  C: '#c8801a',
  D: '#d9663a',
  E: '#c0392b',
};

export default function SupervisorDashboard() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const { theme } = useTheme();
  const user = session?.user as any;

  // Data States
  const [submittedVisits, setSubmittedVisits] = useState<Visit[]>([]);
  const [drafts, setDrafts] = useState<VisitWizardState[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewData, setReviewData] = useState<{
    visit: Visit;
    assets: VisitAsset[];
    photos: VisitPhoto[];
    powerSkuResults?: VisitPowerSkuResult[];
    npdResponses: NPDResponse[];
  } | null>(null);

  // Analytics Dashboard Data States (Admin match dependency)
  const [rows, setRows] = useState<any[]>([]);
  const [reportRows, setReportRows] = useState<any>({ npd: [], psku: [], 'cold-chain': [], classification: [] });
  const [isAnalyticsLoading, setIsAnalyticsLoading] = useState(true);

  // Analytics Filter States
  const [fFrom, setFFrom] = useState('');
  const [fTo, setFTo] = useState('');
  const [fTime, setFTime] = useState('');
  const [fMgr, setFMgr] = useState('');
  const [fSuper, setFSuper] = useState('');
  const [fChannel, setFChannel] = useState('');
  const [fClass, setFClass] = useState('');
  const [fCust, setFCust] = useState('');
  const [fRoute, setFRoute] = useState('');
  const [fSku, setFSku] = useState('');
  const [fVertical, setFVertical] = useState('');

  // Canvas Refs for Charts
  const canvasTrendRef = useRef<HTMLCanvasElement>(null);
  const canvasChannelRef = useRef<HTMLCanvasElement>(null);
  const canvasSuperRef = useRef<HTMLCanvasElement>(null);
  const canvasTempRef = useRef<HTMLCanvasElement>(null);
  const canvasNpdRef = useRef<HTMLCanvasElement>(null);
  const canvasPskuRef = useRef<HTMLCanvasElement>(null);
  const canvasClassRef = useRef<HTMLCanvasElement>(null);

  // Chart instances
  const chartsRef = useRef<Record<string, any>>({});

  // 1. Fetch Visits & Drafts (Operational List sync)
  const fetchVisits = async () => {
    try {
      const data = await getVisitsAction();
      setSubmittedVisits((data as Visit[]).filter(v => v.status === 'Submitted'));
    } catch (e: any) {
      showToast(e.message || 'Failed to fetch visits.', 'error');
    }
  };

  const loadDrafts = () => {
    try {
      const s = localStorage.getItem('supervisor_visit_drafts');
      if (s) setDrafts(JSON.parse(s));
    } catch { /* ignore */ }
  };

  // 2. Fetch Analytics Aggregated Rows
  const fetchAnalytics = async () => {
    try {
      const params = new URLSearchParams();
      if (fFrom) params.set('startDate', fFrom);
      if (fTo) params.set('endDate', fTo);
      const res = await fetch(`/api/dashboard${params.toString() ? `?${params.toString()}` : ''}`);
      const data = await res.json();
      if (data.success) {
        setRows(data.rows);
        setReportRows(data.reportRows || { npd: [], psku: [], 'cold-chain': [], classification: [] });
      }
    } catch (err) {
      console.error('Failed to load dashboard rows:', err);
    } finally {
      setIsAnalyticsLoading(false);
    }
  };

  const refreshAll = () => {
    setLoading(true);
    setIsAnalyticsLoading(true);
    Promise.all([fetchVisits(), fetchAnalytics()])
      .finally(() => {
        loadDrafts();
        setLoading(false);
      });
  };

  useEffect(() => {
    if (session?.user) {
      refreshAll();
    }
  }, [session, fFrom, fTo]);

  // Delete draft handler
  const handleDeleteDraft = (visitId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const s = localStorage.getItem('supervisor_visit_drafts');
      if (s) {
        const list: VisitWizardState[] = JSON.parse(s);
        const next = list.filter(d => d.visitId !== visitId);
        localStorage.setItem('supervisor_visit_drafts', JSON.stringify(next));
        setDrafts(next);
        showToast('Draft deleted.', 'success');
      }
    } catch {
      showToast('Failed to delete draft.', 'error');
    }
  };

  // Detailed Modal Viewer handler
  const handleOpenReview = async (id: string) => {
    setReviewId(id);
    setDetailLoading(true);
    try {
      setReviewData(await getVisitDetailsAction(id) as any);
    } catch (e: any) {
      showToast(e.message || 'Failed to load details.', 'error');
      setReviewId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const normalizeDate = (value: string) => value ? new Date(`${value}T00:00:00`) : null;

  // 1. Channel Options: filtered by Time Period only
  const channelOptions = useMemo(() => {
    const filteredByTime = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && fromOk && toOk;
    });
    return Array.from(new Set(filteredByTime.map((r) => r.ch))).sort();
  }, [rows, fTime, fFrom, fTo]);

  // 2. Customer / Outlet Options: filtered by Time Period, Channel, and Classification
  const custOptions = useMemo(() => {
    const filteredByTimeChannelClass = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fChannel || r.ch === fChannel) && (!fClass || r.gr === fClass) && fromOk && toOk;
    });
    return Array.from(new Set(filteredByTimeChannelClass.map((r) => r.cust))).sort();
  }, [rows, fTime, fChannel, fClass, fFrom, fTo]);

  const classOptions = useMemo(() => {
    const filteredByTimeAndChannel = rows.filter(r => {
      const rowDate = new Date(r.createdAt);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const periodOk = !fTime || (fTime === 'recent' ? r.week >= 5 : r.week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && (!fChannel || r.ch === fChannel) && fromOk && toOk;
    });
    return Array.from(new Set(filteredByTimeAndChannel.map((r) => r.gr))).sort();
  }, [rows, fTime, fChannel, fFrom, fTo]);

  const resetFilters = () => {
    setFFrom('');
    setFTo('');
    setFTime('');
    setFChannel('');
    setFClass('');
    setFCust('');
    setFRoute('');
    setFSku('');
    setFVertical('');
  };

  // NPD Product report-level filter options (SKU-response granularity, not available on visit-level `rows`)
  const npdRouteOptions = useMemo(
    () => Array.from(new Set((reportRows.npd || []).map((r: any) => r.routeCode).filter((v: any) => !!v))).sort() as string[],
    [reportRows]
  );
  const npdSkuOptions = useMemo(
    () => Array.from(new Set((reportRows.npd || []).map((r: any) => r.skuName).filter((v: any) => !!v))).sort() as string[],
    [reportRows]
  );
  const npdVerticalOptions = useMemo(
    () => Array.from(new Set((reportRows.npd || []).map((r: any) => r.businessVertical).filter((v: any) => !!v))).sort() as string[],
    [reportRows]
  );

  // NPD Product rows matching all active filters (date, manager, supervisor, channel, classification, outlet, route, SKU, business vertical)
  const filteredNpdRows = useMemo(() => {
    return (reportRows.npd || []).filter((r: any) => {
      const rowDate = new Date(r.date);
      const from = normalizeDate(fFrom);
      const to = normalizeDate(fTo);
      const week = Math.min(8, Math.max(1, Math.ceil(rowDate.getDate() / 4)));
      const periodOk = !fTime || (fTime === 'recent' ? week >= 5 : week <= 4);
      const fromOk = !from || rowDate >= from;
      const toOk = !to || rowDate <= new Date(`${fTo}T23:59:59`);
      return periodOk && fromOk && toOk
        && (!fMgr || r.manager === fMgr)
        && (!fSuper || r.supervisor === fSuper)
        && (!fChannel || r.channel === fChannel)
        && (!fClass || r.classification === fClass)
        && (!fCust || r.outletName === fCust)
        && (!fRoute || r.routeCode === fRoute)
        && (!fSku || r.skuName === fSku)
        && (!fVertical || r.businessVertical === fVertical);
    });
  }, [reportRows, fTime, fMgr, fSuper, fChannel, fClass, fCust, fRoute, fSku, fVertical, fFrom, fTo]);

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
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportModalTitle, setReportModalTitle] = useState('');
  const [reportModalType, setReportModalType] = useState<'npd' | 'psku' | 'cold-chain' | 'classification'>('npd');
  const userRole = (session?.user as any)?.role;
  const allowedReports = useMemo(() => getAllowedReports(userRole), [userRole]);
  const [reportModalRows, setReportModalRows] = useState<any[]>([]);
  const [reportFilterChip, setReportFilterChip] = useState<{ key: string; value: string; label: string } | null>(null);

  const handleChartClick = (chartTitle: string, filterFn: (row: any) => boolean) => {
    const matched = filtered.filter(filterFn);
    setModalTitle(chartTitle);
    setModalData(matched);
    setModalOpen(true);
  };

  const handleDrilldownChartClick = (
    reportType: 'npd' | 'psku' | 'cold-chain' | 'classification',
    chartTitle: string,
    filterFn: (row: any) => boolean,
    chipLabel?: string
  ) => {
    const visitLookup = new Map(filtered.map((row) => [row.visitId, row]));
    if (!allowedReports.includes(reportType)) return;
    const matched = (reportRows[reportType] || []).filter((row: any) => {
      if (reportType === 'cold-chain') {
        return filterFn(row);
      }
      const visit = visitLookup.get(row.visitId);
      return visit ? filterFn(visit) : false;
    });
    setReportModalType(reportType);
    setReportModalTitle(chartTitle);
    setReportModalRows(matched);
    setReportFilterChip(chipLabel ? { key: 'segment', value: chipLabel, label: chipLabel } : null);
    setReportModalOpen(true);
  };

  const handleClearReportFilter = () => {
    if (reportModalType === 'npd') {
      setReportModalRows(filteredNpdRows);
      setReportFilterChip(null);
      return;
    }
    const visitLookup = new Map(filtered.map((row) => [row.visitId, row]));
    const matched = (reportRows[reportModalType] || []).filter((row: any) => {
      if (reportModalType === 'cold-chain') {
        return true;
      }
      const visit = visitLookup.get(row.visitId);
      return visit ? true : false;
    });
    setReportModalRows(matched);
    setReportFilterChip(null);
  };

  // Compute KPI values
  const outletsCount = useMemo(() => new Set(filtered.map((r) => r.cust)).size, [filtered]);
  const breachesCount = useMemo(() => filtered.filter((r) => !r.ok).length, [filtered]);
  const fefoCount = useMemo(() => filtered.filter((r) => r.fefo).length, [filtered]);
  const noVisitCount = useMemo(() => filtered.filter((r) => r.visitType === 'No Visit').length, [filtered]);
  const noVisitRows = useMemo(() => filtered.filter((r: any) => r.visitType === 'No Visit'), [filtered]);
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
    if (fRoute) parts.push(`Route: <b>${fRoute}</b>`);
    if (fSku) parts.push(`SKU: <b>${fSku}</b>`);
    if (fVertical) parts.push(`Business Vertical: <b>${fVertical}</b>`);
    return parts.length ? 'Filtered by ' + parts.join(' · ') : 'Showing all visits';
  }, [fFrom, fTo, fTime, fMgr, fSuper, fChannel, fClass, fCust, fRoute, fSku, fVertical]);

  // Chart Rendering Hook
  useEffect(() => {
    if (isAnalyticsLoading || !filtered) return;

    const BLUE = '#4F46E5';
    const BLUE_DEEP = '#4338CA';
    const GREEN = '#0f9d63';
    const AMBER = '#d08a12';
    const RED = '#d63d2e';
    const GREY = '#c3d2de';
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
              handleDrilldownChartClick('cold-chain', `Cold Chain Status · ${label}`, (r) => r.ok === isOk, label === 'Breach' ? 'Status: Breach' : 'Status: In Range');
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
        },
      });
    }

    // 5. NPD Availability Bar Chart (SKU-response granularity, percentage-based)
    if (canvasNpdRef.current) {
      if (chartsRef.current.cNpd) chartsRef.current.cNpd.destroy();
      const npdTotal = filteredNpdRows.length;
      const npdCounts = { YES: 0, NO: 0, 'NOT APPLICABLE': 0 } as Record<string, number>;
      filteredNpdRows.forEach((r: any) => {
        npdCounts[r.availability] = (npdCounts[r.availability] || 0) + 1;
      });
      const npdPct = (key: string) => (npdTotal ? Math.round((npdCounts[key] / npdTotal) * 100) : 0);

      const pctLabelPlugin = {
        id: 'npdPctLabels',
        afterDatasetsDraw(chart: any) {
          const { ctx } = chart;
          chart.getDatasetMeta(0).data.forEach((bar: any, index: number) => {
            const value = chart.data.datasets[0].data[index];
            ctx.save();
            ctx.fillStyle = textColor;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`${value}%`, bar.x, bar.y - 6);
            ctx.restore();
          });
        },
      };

      chartsRef.current.cNpd = new Chart(canvasNpdRef.current, {
        type: 'bar',
        data: {
          labels: ['Available', 'Not avail.', 'Not req.'],
          datasets: [
            {
              data: [npdPct('YES'), npdPct('NO'), npdPct('NOT APPLICABLE')],
              backgroundColor: [GREEN, RED, GREY],
              borderRadius: 6,
            },
          ],
        },
        plugins: [pctLabelPlugin],
        options: {
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.raw}% of ${npdTotal} responses`,
              },
            },
          },
          onClick: (e, el, chart) => {
            if (el.length > 0) {
              const label = (chart.data.labels?.[el[0].index] ?? '') as string;
              const availabilityCode = label === 'Available' ? 'YES' : label === 'Not avail.' ? 'NO' : 'NOT APPLICABLE';
              const matched = filteredNpdRows.filter((r: any) => r.availability === availabilityCode);
              setReportModalType('npd');
              setReportModalTitle(`NPD Availability · ${label}`);
              setReportModalRows(matched);
              setReportFilterChip({ key: 'segment', value: label, label: `Status: ${label}` });
              setReportModalOpen(true);
            }
          },
          onHover: (e, el, chart) => {
            chart.canvas.style.cursor = el.length ? 'pointer' : 'default';
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor } },
            y: { beginAtZero: true, max: 100, grid: { color: gridColor }, ticks: { color: textColor, callback: (v: any) => `${v}%` } },
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
              handleDrilldownChartClick('psku', `Power SKU Availability · ${label}`, (r) => r.psku === pskuCode, label === 'Available' || label === 'Not avail.' || label === 'Not req.' ? `Status: ${label}` : undefined);
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
              handleDrilldownChartClick('classification', `Outlets by Classification · ${label}`, (r) => r.gr === label, `Class: ${label}`);
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
  }, [filtered, filteredNpdRows, isAnalyticsLoading, theme]);

  if (isAnalyticsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[var(--bg)]">
        <p className="text-sm font-bold text-[var(--text-secondary)]">Loading Supervisor Dashboard...</p>
      </div>
    );
  }

  if (isFleetRole(userRole)) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-semibold text-amber-700">
          Fleet / Maintenance view: only the Cold Chain Status module is available on this account.
        </div>
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Cold Chain Status</h3>
          </div>
          <div style={{ height: '280px' }}>
            <canvas ref={canvasTempRef}></canvas>
          </div>
        </div>
        <DrilldownReportModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          title={reportModalTitle}
          rows={reportModalRows}
          reportType={reportModalType}
          filterChip={reportFilterChip}
          onClearFilter={handleClearReportFilter}
        />
      </div>
    );
  }

  return (
    <div className="dandy-dashboard-body animate-fade-in">
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
        @media(max-width:640px){
          .top {
            flex-direction:column;
            align-items:flex-start;
            gap:8px;
          }
          .top .flex {
            width:100%;
            justify-content:space-between;
          }
        }
        @media(max-width:480px){
          .filters {
            flex-direction:column;
            align-items:stretch;
          }
          .filters select, .reset {
            width:100%;
            min-height:40px;
          }
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
            align-items: stretch;
            gap: 8px;
            padding: 12px;
          }
          .top > div:last-child {
            margin-left: 0 !important;
            width: 100%;
            justify-content: space-between;
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
          <h1>Dandy Market Visit — Supervisor Dashboard</h1>
          <div className="sub">Field-force visit compliance & execution · Dandy Company Ltd</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => router.push('/supervisor/visit')}
            className="flex items-center justify-center gap-1.5 px-4 h-9 bg-white text-[#4F46E5] hover:bg-opacity-90 rounded-xl text-xs font-bold shadow-sm transition-all active:scale-95"
          >
            <PlusCircle className="h-4 w-4" />
            New Audit
          </button>
          <button
            onClick={refreshAll}
            className="flex items-center justify-center gap-1.5 px-3 h-9 bg-[#ffffff20] text-white hover:bg-[#ffffff30] rounded-xl text-xs font-bold transition-all border border-[#ffffff30]"
          >
            <RefreshCw className={`h-4 w-4 ${loading || isAnalyticsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="wrap">
        
        {/* Continue draft notification banner (if drafts exist) */}
        {drafts.length > 0 && (() => {
          const latestDraft = drafts[0];
          const stepPercent = ((latestDraft.currentStep + 1) / 8) * 100;
          return (
            <div
              className="rounded-xl p-4 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer overflow-hidden relative mb-4 animate-scale-up"
              style={{
                background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
                boxShadow: '0 8px 24px rgba(79, 70, 229, 0.16)',
              }}
              onClick={() => router.push(`/supervisor/visit?resumeId=${latestDraft.visitId}`)}
            >
              <div className="absolute right-4 bottom-[-15px] opacity-10 pointer-events-none">
                <MapPin className="w-20 h-20 stroke-[1.5]" />
              </div>
              <div className="space-y-1 min-w-0 flex-grow relative z-10">
                <div className="flex items-center gap-1.5 text-[10px] font-bold tracking-wide uppercase opacity-90">
                  <Clock className="h-3.5 w-3.5" />
                  <span>Resume Pending Audit Draft</span>
                </div>
                <h3 className="text-[15px] font-extrabold leading-none mt-1 text-white">
                  Continue {latestDraft.customerName || latestDraft.customerCode || 'Unsaved Outlet'} audit
                </h3>
                <p className="font-mono text-[9px] opacity-80 mt-1">
                  ID: {latestDraft.visitId} • Route: {latestDraft.routeCode || '—'} • Step {latestDraft.currentStep + 1} of 8
                </p>
                <div className="h-1 rounded-full bg-white/20 w-full overflow-hidden mt-2 max-w-xs">
                  <div className="h-full bg-white rounded-full transition-all" style={{ width: `${stepPercent}%` }} />
                </div>
              </div>
              <button
                className="flex items-center justify-center gap-1.5 px-3 h-8 bg-white text-[#4F46E5] rounded-lg text-xs font-bold shadow-sm transition-all active:scale-95 flex-shrink-0 relative z-10"
              >
                <span>Resume</span>
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          );
        })()}

          {/* Dropdown Filters */}
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
                setFChannel('');
                setFCust('');
              }}>
                <option value="">All Periods</option>
                <option value="recent">Recent (W5-W8)</option>
                <option value="earlier">Earlier (W1-W4)</option>
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

          <div className="fld">
            <label>Route (NPD Product)</label>
            <select value={fRoute} onChange={(e) => setFRoute(e.target.value)}>
              <option value="">All Routes</option>
              {npdRouteOptions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>SKU (NPD Product)</label>
            <select value={fSku} onChange={(e) => setFSku(e.target.value)}>
              <option value="">All SKUs</option>
              {npdSkuOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="fld">
            <label>Business Vertical (NPD Product)</label>
            <select value={fVertical} onChange={(e) => setFVertical(e.target.value)}>
              <option value="">All Verticals</option>
              {npdVerticalOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>

          <button className="reset" onClick={resetFilters}>Reset</button>
        </div>

        {/* Active description */}
        <div className="active-note" dangerouslySetInnerHTML={{ __html: activeNote }} />

        {/* KPI Cards */}
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
            <div className="lbl">No Visits</div>
            <div className="val">{noVisitCount}</div>
            <div className="delta">skipped outlet visits</div>
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

        {/* No Visit Details */}
        {noVisitRows.length > 0 && (
          <div className="panel" style={{ marginBottom: '12px' }}>
            <h3>No Visit Details</h3>
            <div className="psub">Skipped outlet visits with recorded reasons</div>
            <div className="overflow-x-auto" style={{ marginTop: '10px' }}>
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-soft)' }}>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Date</th>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Supervisor</th>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Route</th>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Outlet</th>
                    <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {noVisitRows.map((row: any) => (
                    <tr key={row.visitId} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{new Date(row.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{row.sup}</td>
                      <td className="px-3 py-2 font-mono" style={{ color: 'var(--text-secondary)' }}>{row.rt || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{row.cust || '—'}</td>
                      <td className="px-3 py-2" style={{ color: 'var(--text-secondary)' }}>{row.reasonCategory || row.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Row 1 Grid */}
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

        {/* Row 2 Grid */}
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

        {/* Row 3 Grid */}
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

        {/* Operational Cards Row (Pending Drafts & Submitted Audits List to fully retain components) */}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          
          {/* Pending Drafts Panel */}
          {drafts.length > 0 && (
            <div className="panel tbl">
              <h3>Pending Drafts ({drafts.length})</h3>
              <div className="psub">Saved local drafts that require completion</div>
              <div className="tbl-wrap" style={{ maxHeight: '240px' }}>
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>Draft ID</th>
                      <th>Customer / Outlet</th>
                      <th>Step</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((d) => (
                      <tr key={d.visitId} onClick={() => router.push(`/supervisor/visit?resumeId=${d.visitId}`)} style={{ cursor: 'pointer' }}>
                        <td className="font-mono text-xs text-[#4F46E5] font-semibold">{d.visitId}</td>
                        <td className="font-bold">{d.customerName || d.customerCode || '—'}</td>
                        <td><span className="badge text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-600">Step {d.currentStep + 1}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            onClick={(e) => handleDeleteDraft(d.visitId, e)}
                            className="p-1 text-red-500 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="h-4.5 w-4.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Submitted Audits Panel */}
          <div className="panel tbl">
            <h3>Submitted Audits Log ({submittedVisits.length})</h3>
            <div className="psub">List of submitted supervisor visit audits</div>
            <div className="tbl-wrap" style={{ maxHeight: '240px' }}>
              <table className="w-full">
                <thead>
                  <tr>
                    <th>Visit ID</th>
                    <th>Date</th>
                    <th>Customer</th>
                    <th>Route</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedVisits.slice(0, 20).map((v) => (
                    <tr key={v.visitId} onClick={() => handleOpenReview(v.visitId)} style={{ cursor: 'pointer' }}>
                      <td className="font-mono text-xs text-[#4F46E5] font-semibold">{v.visitId}</td>
                      <td>{new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                      <td className="font-bold">{v.customerCode}</td>
                      <td className="font-mono">{v.routeCode}</td>
                      <td>
                        <span className={`pill ${v.tempInRange ? 'g' : 'r'}`}>
                          {v.temperature}°C {v.tempInRange ? '✓' : '⚠'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Manager Table */}
        <div className="panel tbl" style={{ marginBottom: '12px' }}>
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
        <div className="panel tbl" style={{ marginBottom: '12px' }}>
          <h3>Visit Details</h3>
          <div className="psub">Outlet-level records (filtered) — Click row to view details</div>
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
                    <tr
                      key={idx}
                      onClick={() => handleOpenReview(r.visitId)}
                      style={{ cursor: 'pointer' }}
                    >
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
          <b>Real database visits live sync.</b> Recalculates compliance & scorecard data dynamically.
        </div>
      </div>

      {/* Detailed Review Modal overlay */}
      {reviewId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl animate-scale-up">
            
            <div className="px-5 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 className="text-[16px] font-extrabold text-[var(--text-primary)]">Visit Review Details</h3>
                <p className="font-mono text-[11px] text-[var(--text-muted)] mt-0.5">ID: {reviewId}</p>
              </div>
              <button onClick={() => { setReviewId(null); setReviewData(null); }} className="p-1 text-[var(--text-secondary)] hover:bg-[var(--surface-2)] rounded-lg">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5 flex-grow">
              {detailLoading ? (
                <div className="space-y-4 py-8">
                  <Skeleton className="h-8 w-2/3" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : reviewData ? (
                <>
                  <div className="grid grid-cols-2 gap-4 bg-[var(--surface-2)] p-4 rounded-xl border border-[var(--border-soft)]">
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Customer Code</p>
                      <p className="text-[13px] font-semibold mt-0.5 text-[var(--text-primary)]">{reviewData.visit.customerCode}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Route Code</p>
                      <p className="text-[13px] font-semibold mt-0.5 text-[var(--text-primary)]">{reviewData.visit.routeCode}</p>
                    </div>
                    {reviewData.visit.sosAsPerBda !== null && reviewData.visit.sosAsPerBda !== undefined && (
                      <div className="col-span-2">
                        <p className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--text-muted)' }}>Share of Shelf (SOS)</p>
                        <p className="text-[13px] font-semibold mt-0.5 text-[var(--text-primary)]">
                          {reviewData.visit.sosAsPerBda ? 'Compliant ✓' : 'Non-Compliant ⚠'}
                        </p>
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="form-label mb-2">Assets Audited</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(reviewData.assets || []).map((ast, index) => (
                        <div key={ast.assetId} className="p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--border-soft)] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase text-[var(--text-primary)]">{ast.assetType} #{index + 1}</span>
                            <span className={`badge text-[10px] ${ast.tempInRange ? 'badge-success' : 'badge-danger'}`}>
                              {ast.temperature}°C {ast.tempInRange ? '✓' : '⚠'}
                            </span>
                          </div>
                          {ast.observation && (
                            <p className="text-[11px] text-[var(--text-secondary)] italic">
                              &ldquo;{ast.observation}&rdquo;
                            </p>
                          )}
                          {ast.actionRequired !== 'None' && (
                            <div className="text-[10px] font-bold text-red-500">
                              Action: {ast.actionRequired}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="form-label mb-2">Photos ({reviewData.photos.length})</p>
                    {reviewData.photos.length === 0 ? (
                      <p className="text-[12px] italic text-[var(--text-muted)]">No photos attached.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {reviewData.photos.map(photo => (
                          <a key={photo.photoId} href={photo.cloudinaryUrl} target="_blank" rel="noreferrer"
                            className="block rounded-xl overflow-hidden" style={{ aspectRatio: '1', border: '1px solid var(--border)' }}>
                            <img src={photo.cloudinaryUrl} alt={photo.category} className="w-full h-full object-cover hover:scale-105 transition-transform duration-200" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <p className="form-label mb-2">NPD Checklist ({reviewData.npdResponses.length})</p>
                    {reviewData.npdResponses.length === 0 ? (
                      <p className="text-[12px] italic text-[var(--text-muted)]">No SKU responses.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {reviewData.npdResponses.map(npd => (
                          <div key={npd.responseId} className="flex items-center justify-between px-3.5 py-2.5 rounded-lg"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                            <span className="font-mono text-[12px] text-[var(--text-secondary)]">{npd.skuCode}</span>
                            <span className={`badge ${npd.status === 'Available' ? 'badge-success' : npd.status === 'Not Available' ? 'badge-danger' : 'badge-info'}`}>
                              {npd.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-12 text-center text-[var(--text-muted)]">Failed to load data.</div>
              )}
            </div>

            <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => { setReviewId(null); setReviewData(null); }} className="btn-ghost w-full justify-center">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      <InteractiveChartTableModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalTitle}
        data={modalData}
      />
      <DrilldownReportModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        title={reportModalTitle}
        rows={reportModalRows}
        reportType={reportModalType}
        filterChip={reportFilterChip}
        onClearFilter={handleClearReportFilter}
      />
    </div>
  );
}

export const dynamic = 'force-dynamic';
