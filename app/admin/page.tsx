'use client';

import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import nextDynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarDays,
  Users,
  MapPin,
  Thermometer,
  FileText,
  RefreshCw,
  AlertTriangle,
  UserCheck,
  TrendingUp,
  Clock,
  Filter,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  CheckCircle2,
  XCircle,
  Activity,
  Target,
  Zap,
  Map,
  BarChart3,
} from 'lucide-react';
import { DashboardStats, Route } from '@/types';

// Recharts — SSR disabled
const AreaChart      = nextDynamic(() => import('recharts').then(m => m.AreaChart), { ssr: false });
const Area           = nextDynamic(() => import('recharts').then(m => m.Area), { ssr: false });
const BarChart       = nextDynamic(() => import('recharts').then(m => m.BarChart), { ssr: false });
const Bar            = nextDynamic(() => import('recharts').then(m => m.Bar), { ssr: false });
const XAxis          = nextDynamic(() => import('recharts').then(m => m.XAxis), { ssr: false });
const YAxis          = nextDynamic(() => import('recharts').then(m => m.YAxis), { ssr: false });
const CartesianGrid  = nextDynamic(() => import('recharts').then(m => m.CartesianGrid), { ssr: false });
const Tooltip        = nextDynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false });
const ResponsiveContainer = nextDynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const Cell           = nextDynamic(() => import('recharts').then(m => m.Cell), { ssr: false });

// ─── Helpers ──────────────────────────────────────────────────
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function Trend({ value }: { value: number }) {
  if (value === 0) return <span className="flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--text-muted)' }}><Minus className="h-3 w-3" />0%</span>;
  if (value > 0)  return <span className="flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--success)' }}><ArrowUpRight className="h-3 w-3" />{value}%</span>;
  return <span className="flex items-center gap-0.5 text-[11px]" style={{ color: 'var(--danger)' }}><ArrowDownRight className="h-3 w-3" />{Math.abs(value)}%</span>;
}

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '12px',
  boxShadow: 'var(--shadow-dropdown)',
};

// ─── Sub-components ───────────────────────────────────────────

function SectionCard({ title, icon: Icon, iconColor, action, children, noPad = false }: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
}) {
  return (
    <div className="card h-full flex flex-col">
      <div className="section-header flex-shrink-0">
        <span className="section-title">
          <Icon className="h-4 w-4" style={{ color: iconColor || 'var(--accent)' }} />
          {title}
        </span>
        {action}
      </div>
      <div className={noPad ? 'flex-grow overflow-hidden' : 'p-5 flex-grow'}>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 h-full min-h-[120px]">
      <Icon className="h-8 w-8" style={{ color: 'var(--border)' }} />
      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{message}</p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const { data: session } = useSession();
  const { showToast } = useToast();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSupervisor, setSelectedSupervisor] = useState('');
  const [selectedRoute, setSelectedRoute] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const user = session?.user as any;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Queries
  const { data: routes = [] } = useQuery<Route[]>({
    queryKey: ['routes'],
    queryFn: () => fetch('/api/routes').then(r => r.json()),
  });

  const { data: supervisors = [] } = useQuery<any[]>({
    queryKey: ['supervisors'],
    queryFn: () => fetch('/api/supervisors').then(r => r.json()).then(d => d.filter((u: any) => u.role === 'Supervisor')),
  });

  const {
    data: stats,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', startDate, endDate, selectedSupervisor, selectedRoute],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (startDate)          p.append('startDate', startDate);
      if (endDate)            p.append('endDate', endDate);
      if (selectedSupervisor) p.append('supervisorId', selectedSupervisor);
      if (selectedRoute)      p.append('routeCode', selectedRoute);
      const res = await fetch(`/api/dashboard?${p}`);
      if (!res.ok) throw new Error('Failed to load dashboard');
      return res.json();
    },
  });

  const activeFilters = [startDate, endDate, selectedSupervisor, selectedRoute].filter(Boolean).length;

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setSelectedSupervisor('');
    setSelectedRoute('');
    showToast('Filters cleared', 'info');
  };

  // Derived data
  const lowCoverageRoutes = useMemo(
    () => (stats?.coveragePerRoute ?? []).filter(r => r.coverage < 60).sort((a, b) => a.coverage - b.coverage),
    [stats]
  );
  const repairVisits = useMemo(
    () => (stats?.temperatureBreaches ?? []).filter((_, i) => i < 5),
    [stats]
  );

  // KPI definitions
  const kpis = [
    {
      label: 'Total Visits',
      value: stats?.totalVisits ?? 0,
      sub: 'All time visits',
      icon: FileText,
      color: 'var(--accent)',
      bg: 'var(--accent-light)',
      trend: 0,
    },
    {
      label: "Today's Visits",
      value: stats?.todayVisits ?? 0,
      sub: 'Logged today',
      icon: CalendarDays,
      color: '#8B5CF6',
      bg: '#F5F3FF',
      trend: 0,
    },
    {
      label: 'Coverage',
      value: `${stats?.coveragePercent ?? 0}%`,
      sub: 'Route coverage',
      icon: Target,
      color: '#059669',
      bg: '#ECFDF5',
      trend: 0,
      progress: stats?.coveragePercent ?? 0,
      progressColor: '#059669',
    },
    {
      label: 'Breach Rate',
      value: `${stats?.tempBreachPercent ?? 0}%`,
      sub: 'Temp breaches',
      icon: Thermometer,
      color: (stats?.tempBreachPercent ?? 0) > 15 ? 'var(--danger)' : 'var(--text-muted)',
      bg: (stats?.tempBreachPercent ?? 0) > 15 ? 'var(--danger-light)' : 'var(--surface-2)',
      trend: 0,
      progress: stats?.tempBreachPercent ?? 0,
      progressColor: (stats?.tempBreachPercent ?? 0) > 15 ? 'var(--danger)' : '#94a3b8',
    },
    {
      label: 'Active Supervisors',
      value: stats?.totalSupervisors ?? 0,
      sub: 'Field personnel',
      icon: Users,
      color: '#0EA5E9',
      bg: '#F0F9FF',
      trend: 0,
    },
    {
      label: 'Pending Visits',
      value: Math.max(0, (stats?.totalVisits ?? 0) - (stats?.todayVisits ?? 0)),
      sub: 'Outside today',
      icon: Clock,
      color: '#D97706',
      bg: '#FFFBEB',
      trend: 0,
    },
  ];

  return (
    <div className="space-y-5">

      {/* ── ROW 0: Page Header ──────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
            {greeting}, {user?.name?.split(' ')[0] || 'Admin'} 👋
          </p>
          <h1 className="text-[22px] font-bold tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>
            Executive Dashboard
          </h1>
          <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>
            Real-time field coverage, temperature breaches, and supervisor performance.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Toggle */}
          <button
            className="btn-ghost relative"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeFilters > 0 && (
              <span
                className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                style={{ background: 'var(--accent)' }}
              >
                {activeFilters}
              </span>
            )}
          </button>

          {/* Refresh */}
          <button className="btn-primary" onClick={() => refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Filter Panel ────────────────────────────────────── */}
      {filtersOpen && (
        <div
          className="card p-4 animate-slide-up"
          style={{ borderColor: 'var(--accent-light)' }}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div>
              <label className="form-label">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="form-label">Supervisor</label>
              <select value={selectedSupervisor} onChange={e => setSelectedSupervisor(e.target.value)} className="form-input">
                <option value="">All Supervisors</option>
                {supervisors.map(s => (
                  <option key={s.id} value={s.employeeCode}>{s.name} ({s.employeeCode})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Route</label>
              <select value={selectedRoute} onChange={e => setSelectedRoute(e.target.value)} className="form-input">
                <option value="">All Routes</option>
                {routes.map(r => (
                  <option key={r.routeCode} value={r.routeCode}>{r.routeCode} – {r.routeName}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn-ghost w-full justify-center" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ROW 1: KPI Cards ────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={i}
              className="card card-hover p-4 flex flex-col gap-3"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              {/* Icon + trend */}
              <div className="flex items-center justify-between">
                <div
                  className="icon-wrap h-8 w-8"
                  style={{ background: kpi.bg }}
                >
                  <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                </div>
                <Trend value={kpi.trend} />
              </div>

              {/* Value */}
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                <div>
                  <div className="kpi-value">{kpi.value}</div>
                  <div className="kpi-sub">{kpi.sub}</div>
                </div>
              )}

              {/* Label + progress */}
              <div>
                <div className="kpi-label">{kpi.label}</div>
                {kpi.progress !== undefined && (
                  <div className="progress-bar mt-1.5">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(kpi.progress, 100)}%`,
                        background: kpi.progressColor,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── ROW 2: Charts ───────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">

        {/* Visits Trend — wider */}
        <div className="xl:col-span-3">
          <SectionCard
            title="Visits Trend"
            icon={TrendingUp}
            action={
              <span className="badge badge-accent">Daily</span>
            }
          >
            {isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : !stats?.visitsPerDay?.length ? (
              <EmptyState icon={CalendarDays} message="No visits in selected range" />
            ) : (
              <div className="h-52 w-full -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.visitsPerDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="vGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#4F46E5" stopOpacity={0.18} />
                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={v => {
                        const d = new Date(v);
                        return `${d.getDate()}/${d.getMonth() + 1}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: '#4F46E5', strokeWidth: 1, strokeDasharray: '4 4' }} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#4F46E5"
                      strokeWidth={2.5}
                      fill="url(#vGrad)"
                      dot={false}
                      activeDot={{ r: 4, fill: '#4F46E5', strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </div>

        {/* Route Coverage Bar */}
        <div className="xl:col-span-2">
          <SectionCard
            title="Route Coverage"
            icon={BarChart3}
            iconColor="#059669"
            action={
              <span className="badge badge-success">% Covered</span>
            }
          >
            {isLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : !stats?.coveragePerRoute?.length ? (
              <EmptyState icon={Map} message="No routes tracked" />
            ) : (
              <div className="h-52 w-full -mx-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.coveragePerRoute}
                    margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
                    <XAxis
                      dataKey="routeCode"
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: any) => [`${v}%`, 'Coverage']}
                    />
                    <Bar dataKey="coverage" radius={[4, 4, 0, 0]} maxBarSize={28}>
                      {(stats?.coveragePerRoute ?? []).map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.coverage >= 80 ? '#059669' : entry.coverage >= 50 ? '#F59E0B' : '#EF4444'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── ROW 3: Supervisor Table + Recent Visits ─────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Supervisor Performance Table */}
        <div className="xl:col-span-2">
          <SectionCard title="Supervisor Performance" icon={UserCheck} iconColor="var(--success)" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
                    {['Supervisor', 'Visits', 'Outlets', 'Coverage', 'Breaches'].map(h => (
                      <th
                        key={h}
                        className="px-5 py-3 text-left"
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                        <td className="px-5 py-3.5"><Skeleton className="h-4 w-32" /></td>
                        {[1,2,3,4].map(j => (
                          <td key={j} className="px-5 py-3.5"><Skeleton className="h-4 w-12" /></td>
                        ))}
                      </tr>
                    ))
                  ) : !stats?.supervisorPerformance?.length ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-10 text-center text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        No supervisor data available.
                      </td>
                    </tr>
                  ) : (
                    stats.supervisorPerformance.map((sup, i) => (
                      <tr
                        key={i}
                        style={{ borderBottom: '1px solid var(--border-soft)' }}
                        className="transition-colors"
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                              style={{ background: 'var(--accent)' }}
                            >
                              {sup.supervisorName?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-[13px]" style={{ color: 'var(--text-primary)' }}>
                                {sup.supervisorName}
                              </div>
                              <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                                {sup.supervisorId}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {sup.visitsCount}
                        </td>
                        <td className="px-5 py-3.5 font-medium" style={{ color: 'var(--text-secondary)' }}>
                          {sup.uniqueOutlets}
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <div className="progress-bar w-16">
                              <div
                                className="progress-fill"
                                style={{
                                  width: `${sup.coveragePercent}%`,
                                  background: sup.coveragePercent >= 80
                                    ? 'var(--success)'
                                    : sup.coveragePercent >= 50
                                    ? 'var(--warning)'
                                    : 'var(--danger)',
                                }}
                              />
                            </div>
                            <span
                              className="text-[12px] font-semibold"
                              style={{
                                color: sup.coveragePercent >= 80
                                  ? 'var(--success)'
                                  : sup.coveragePercent >= 50
                                  ? 'var(--warning)'
                                  : 'var(--danger)',
                              }}
                            >
                              {sup.coveragePercent}%
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {sup.breaches > 0 ? (
                            <span className="badge badge-danger">{sup.breaches}</span>
                          ) : (
                            <span className="badge badge-success">None</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        {/* Recent Visits / Breach List */}
        <div>
          <SectionCard title="Recent Activity" icon={Activity} iconColor="#8B5CF6" noPad>
            <div className="overflow-y-auto max-h-72">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !stats?.temperatureBreaches?.length ? (
                <EmptyState icon={CheckCircle2} message="No recent alerts" />
              ) : (
                stats.temperatureBreaches.map((b, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 px-5 py-3.5 transition-colors"
                    style={{ borderBottom: '1px solid var(--border-soft)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div
                      className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: 'var(--danger-light)' }}
                    >
                      <Thermometer className="h-3 w-3" style={{ color: 'var(--danger)' }} />
                    </div>
                    <div className="min-w-0 flex-grow">
                      <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {b.customerName}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {b.supervisorName} · {fmtDate(b.visitDate)}
                      </p>
                    </div>
                    <span className="badge badge-danger flex-shrink-0">{b.temperature}°C</span>
                  </div>
                ))
              )}
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── ROW 4: Alerts Triptych ──────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Temperature Alerts */}
        <SectionCard title="Temperature Alerts" icon={Thermometer} iconColor="var(--danger)">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !stats?.temperatureBreaches?.length ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--success)' }} />
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>All temperatures normal</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stats.temperatureBreaches.slice(0, 5).map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--danger-light)', border: '1px solid rgba(220,38,38,0.12)' }}
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--danger)' }}>{b.customerName}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{b.assetType} · {fmtDate(b.visitDate)}</p>
                  </div>
                  <span
                    className="text-[12px] font-bold flex-shrink-0"
                    style={{ color: 'var(--danger)' }}
                  >
                    {b.temperature}°C
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Repair Required */}
        <SectionCard title="Repair Required" icon={Zap} iconColor="var(--warning)">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !repairVisits?.length ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--success)' }} />
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No repairs needed</p>
            </div>
          ) : (
            <div className="space-y-2">
              {repairVisits.map((b, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--warning-light)', border: '1px solid rgba(217,119,6,0.12)' }}
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--warning)' }}>{b.customerName}</p>
                    <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{b.supervisorName} · {fmtDate(b.visitDate)}</p>
                  </div>
                  <span className="badge badge-warning">Action</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Low Coverage Routes */}
        <SectionCard title="Low Coverage Routes" icon={MapPin} iconColor="var(--info)">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !lowCoverageRoutes?.length ? (
            <div className="flex flex-col items-center gap-2 py-6">
              <CheckCircle2 className="h-8 w-8" style={{ color: 'var(--success)' }} />
              <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>All routes on track</p>
            </div>
          ) : (
            <div className="space-y-2">
              {lowCoverageRoutes.slice(0, 5).map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg"
                  style={{ background: 'var(--info-light)', border: '1px solid rgba(14,165,233,0.12)' }}
                >
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold truncate" style={{ color: 'var(--info)' }}>
                      {r.routeCode}
                    </p>
                    <div className="progress-bar mt-1" style={{ width: '80px' }}>
                      <div
                        className="progress-fill"
                        style={{
                          width: `${r.coverage}%`,
                          background: r.coverage < 30 ? 'var(--danger)' : 'var(--warning)',
                        }}
                      />
                    </div>
                  </div>
                  <span
                    className="text-[12px] font-bold flex-shrink-0"
                    style={{ color: r.coverage < 30 ? 'var(--danger)' : 'var(--warning)' }}
                  >
                    {r.coverage}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
