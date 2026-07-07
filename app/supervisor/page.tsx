'use client';

import React, { useState, useEffect } from 'react';
import { getVisitsAction, getVisitDetailsAction } from '@/actions/visit-actions';
import { useSession } from 'next-auth/react';
import { useToast } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from 'next/navigation';
import {
  FileText, Clock, CheckCircle2, Eye, PlusCircle,
  AlertTriangle, MapPin, X, Calendar, Trash2, Thermometer,
  RefreshCw, ChevronRight,
} from 'lucide-react';
import { Visit, VisitWizardState, VisitPhoto, NPDResponse } from '@/types';

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

export default function SupervisorDashboard() {
  const { data: session } = useSession();
  const { showToast } = useToast();
  const router = useRouter();
  const user = session?.user as any;

  const [submittedVisits, setSubmittedVisits] = useState<Visit[]>([]);
  const [drafts, setDrafts] = useState<VisitWizardState[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewData, setReviewData] = useState<{ visit: Visit; photos: VisitPhoto[]; npdResponses: NPDResponse[] } | null>(null);

  const fetchVisits = async () => {
    try {
      const data = await getVisitsAction();
      setSubmittedVisits((data as Visit[]).filter(v => v.status === 'Submitted'));
    } catch (e: any) { showToast(e.message || 'Failed to fetch visits.', 'error'); }
  };

  const loadDrafts = () => {
    try {
      const s = localStorage.getItem('supervisor_visit_drafts');
      if (s) setDrafts(JSON.parse(s));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (session?.user) {
      setLoading(true);
      Promise.all([fetchVisits()]).finally(() => { loadDrafts(); setLoading(false); });
    }
  }, [session]);

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
    } catch { showToast('Failed to delete draft.', 'error'); }
  };

  const handleOpenReview = async (id: string) => {
    setReviewId(id);
    setDetailLoading(true);
    try {
      setReviewData(await getVisitDetailsAction(id) as any);
    } catch (e: any) {
      showToast(e.message || 'Failed to load details.', 'error');
      setReviewId(null);
    } finally { setDetailLoading(false); }
  };

  const totalBreaches = submittedVisits.filter(v => !v.tempInRange).length;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const kpis = [
    {
      label: 'Submitted',
      value: submittedVisits.length,
      sub: 'Successfully uploaded',
      icon: CheckCircle2,
      color: 'var(--success)',
      bg: 'var(--success-light)',
    },
    {
      label: 'Drafts',
      value: drafts.length,
      sub: 'Saved on device',
      icon: Clock,
      color: 'var(--warning)',
      bg: 'var(--warning-light)',
    },
    {
      label: 'Breaches',
      value: totalBreaches,
      sub: 'Action required',
      icon: Thermometer,
      color: totalBreaches > 0 ? 'var(--danger)' : 'var(--text-muted)',
      bg: totalBreaches > 0 ? 'var(--danger-light)' : 'var(--surface-2)',
    },
  ];

  return (
    <div className="space-y-5 pb-24 md:pb-6">

      {/* ── Page Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 py-2 animate-fade-in">
        <div className="min-w-0 max-w-lg space-y-1">
          <p className="text-[12px] font-medium mb-0.5" style={{ color: 'var(--text-muted)' }}>
            {greeting}, {user?.name?.split(' ')[0] || 'Supervisor'} 👋
          </p>
          <h1 className="text-[22px] font-bold tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>
            Supervisor Dashboard
          </h1>
          <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Track your draft audits, submitted audits, and temperature breaches.
          </p>
          <div className="flex items-center gap-2 pt-2.5 flex-wrap">
            <button
              onClick={() => router.push('/supervisor/visit')}
              className="btn-primary"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              New Audit
            </button>
            <button className="btn-ghost" onClick={() => fetchVisits()}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Right side illustration decoration */}
        <div className="flex-shrink-0 relative ml-2">
          <svg className="w-20 h-20 sm:w-24 sm:h-24 text-indigo-500" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="60" cy="60" r="45" fill="var(--accent-soft)" opacity="0.12" />
            <circle cx="95" cy="30" r="7" fill="var(--accent)" opacity="0.15" />
            <circle cx="25" cy="85" r="5" fill="#7C3AED" opacity="0.2" />
            {/* Clipboard card */}
            <rect x="38" y="22" width="44" height="64" rx="8" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
            {/* Clip */}
            <rect x="50" y="18" width="20" height="6" rx="1.5" fill="var(--text-muted)" />
            {/* Lines */}
            <line x1="48" y1="36" x2="60" y2="36" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="48" y1="48" x2="72" y2="48" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            <line x1="48" y1="60" x2="66" y2="60" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            <line x1="48" y1="72" x2="56" y2="72" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
            {/* Checkmark circle */}
            <circle cx="78" cy="40" r="8" fill="var(--accent)" />
            <path d="M75 40L77 42L81 37" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={i}
              className="card card-hover p-3.5 md:p-4 flex flex-col gap-2.5 md:gap-3.5 animate-fade-up"
              style={{ animationDelay: `${i * 40}ms`, borderRadius: '16px' }}
            >
              <div className="flex items-center justify-between">
                <div
                  className="icon-wrap h-8 w-8 rounded-xl"
                  style={{ background: kpi.bg }}
                >
                  <Icon className="h-4 w-4" style={{ color: kpi.color }} />
                </div>
              </div>

              {loading ? (
                <Skeleton className="h-6 w-10 md:h-7 md:w-16" />
              ) : (
                <div className="space-y-0.5">
                  <div className="text-[24px] md:text-[26px] font-bold leading-none tracking-tight" style={{ color: 'var(--text-primary)' }}>
                    {kpi.value}
                  </div>
                  <div>
                    <div className="text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{kpi.label}</div>
                    <div className="text-[9px] text-[var(--text-muted)] mt-0.5">{kpi.sub}</div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Continue Banner ─────────────────────────────── */}
      {drafts.length > 0 && (() => {
        const latestDraft = drafts[0];
        const stepPercent = ((latestDraft.currentStep + 1) / 8) * 100;
        return (
          <div
            className="rounded-2xl p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer overflow-hidden animate-slide-up relative"
            style={{
              background: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              boxShadow: '0 8px 24px rgba(79, 70, 229, 0.22)',
            }}
            onClick={() => router.push(`/supervisor/visit?resumeId=${latestDraft.visitId}`)}
          >
            {/* Map Pin background decoration */}
            <div className="absolute right-4 bottom-[-15px] opacity-10 pointer-events-none">
              <MapPin className="w-24 h-24 stroke-[1.5]" />
            </div>

            <div className="space-y-1.5 min-w-0 flex-grow relative z-10">
              <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide uppercase opacity-90">
                <Clock className="h-3.5 w-3.5" />
                <span>Continue where you left off</span>
              </div>
              <h3 className="text-[17px] font-extrabold leading-none mt-1">Pending Draft Audit</h3>
              <p className="font-mono text-[10px] opacity-80 mt-1">
                Visit ID: {latestDraft.visitId} • Route: {latestDraft.routeCode || '—'}
              </p>
              {/* Progress Bar */}
              <div className="h-1.5 rounded-full bg-white/20 w-full overflow-hidden mt-3 max-w-xs">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500"
                  style={{ width: `${stepPercent}%` }}
                />
              </div>
            </div>

            <button
              className="flex items-center justify-center gap-1.5 px-4 h-9 bg-white text-[#4F46E5] rounded-xl text-[12px] font-bold shadow-sm transition-all active:scale-95 flex-shrink-0 relative z-10"
            >
              <span>Continue</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })()}

      {/* ── Pending Drafts ──────────────────────────────── */}
      <SectionCard
        title={`Pending Drafts (${drafts.length})`}
        icon={Clock}
        iconColor="var(--warning)"
        action={
          <button onClick={() => router.push('/supervisor')} className="text-[11px] font-bold transition-colors hover:underline" style={{ color: 'var(--accent)' }}>
            View all
          </button>
        }
        noPad
      >
        {drafts.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <Clock className="h-8 w-8" style={{ color: 'var(--border)' }} />
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No pending drafts. Start a new audit.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-soft)]">
            {drafts.map(draft => (
              <div
                key={draft.visitId}
                onClick={() => router.push(`/supervisor/visit?resumeId=${draft.visitId}`)}
                className="p-4 cursor-pointer group flex items-center justify-between gap-3 hover:bg-[var(--surface-2)] transition-colors"
              >
                <div className="flex items-center gap-3.5 min-w-0 flex-grow">
                  {/* File icon container */}
                  <div className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0 animate-fade-in" style={{ background: 'var(--accent-light)' }}>
                    <FileText className="h-5 w-5" style={{ color: 'var(--accent)' }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-bold" style={{ color: 'var(--accent)' }}>
                      {draft.visitId}
                    </p>
                    <h4 className="text-[14px] font-bold mt-0.5 leading-snug truncate text-[var(--text-primary)]">
                      {draft.customerName || draft.customerCode || 'No customer selected'}
                    </h4>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                      Route: {draft.routeCode || '—'} • Step {draft.currentStep + 1} of 8
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3.5 flex-shrink-0">
                  <span className="badge text-[10px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706' }}>
                    Step {draft.currentStep + 1}
                  </span>
                  <div className="h-8 w-8 rounded-full border border-[var(--border)] flex items-center justify-center bg-[var(--surface)] transition-colors group-hover:border-[var(--accent)] group-hover:bg-[var(--accent-light)]">
                    <ChevronRight className="h-4 w-4 text-[var(--text-secondary)] transition-colors group-hover:text-[var(--accent)]" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Completed Audits ────────────────────────────── */}
      <SectionCard
        title={`Submitted Audits (${submittedVisits.length})`}
        icon={CheckCircle2}
        iconColor="var(--success)"
        action={
          <button onClick={() => router.push('/supervisor/my-visits')} className="text-[11px] font-bold transition-colors hover:underline" style={{ color: 'var(--accent)' }}>
            View all
          </button>
        }
        noPad
      >
        {/* Desktop Table */}
        <div className="hidden md:block overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-soft)', background: 'var(--surface-2)' }}>
                  {['Visit ID', 'Date', 'Route', 'Customer', 'Temperature', 'Action'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3 ${i === 5 ? 'text-right' : 'text-left'}`}
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
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-5 py-3.5"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))
                ) : submittedVisits.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-14 text-center" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                      You haven&apos;t submitted any audits yet.
                    </td>
                  </tr>
                ) : (
                  submittedVisits.map(v => (
                    <tr
                      key={v.visitId}
                      style={{ borderBottom: '1px solid var(--border-soft)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      className="transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-[12px] font-semibold" style={{ color: 'var(--accent)' }}>{v.visitId}</span>
                      </td>
                      <td className="px-5 py-3.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                        {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-[12px]" style={{ color: 'var(--text-secondary)' }}>{v.routeCode}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{v.customerCode}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={`badge ${v.tempInRange ? 'badge-success' : 'badge-danger'}`}>
                          {v.temperature}°C {v.tempInRange ? '✓' : '⚠'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleOpenReview(v.visitId)}
                          className="btn-ghost"
                          style={{ height: '30px', padding: '0 12px', fontSize: '12px' }}
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile List */}
        <div className="md:hidden divide-y divide-[var(--border-soft)]">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="py-4 px-4 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))
          ) : submittedVisits.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              {/* Clipboard Checkmark Illustration */}
              <svg className="w-16 h-16 mb-3 text-emerald-500 opacity-90" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="22" y="16" width="36" height="48" rx="6" fill="var(--surface)" stroke="var(--border)" strokeWidth="2" />
                <rect x="32" y="12" width="16" height="6" rx="1.5" fill="#9BA3B2" />
                <line x1="30" y1="28" x2="50" y2="28" stroke="var(--border-soft)" strokeWidth="2" strokeLinecap="round" />
                <line x1="30" y1="38" x2="44" y2="38" stroke="var(--border-soft)" strokeWidth="2" strokeLinecap="round" />
                <line x1="30" y1="48" x2="38" y2="48" stroke="var(--border-soft)" strokeWidth="2" strokeLinecap="round" />
                <circle cx="50" cy="50" r="10" fill="#10B981" />
                <path d="M46 50L49 53L55 47" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <h4 className="text-[14px] font-bold text-[var(--text-primary)]">No submitted audits yet</h4>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">Once you submit audits, they&apos;ll appear here.</p>
            </div>
          ) : (
            submittedVisits.map(v => (
              <div
                key={v.visitId}
                onClick={() => handleOpenReview(v.visitId)}
                className="py-3.5 px-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-[var(--surface-2)] active:bg-[var(--surface-2)] transition-colors"
              >
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-[var(--accent)]">{v.visitId}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">
                      {new Date(v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  <p className="text-[13px] font-bold mt-1.5 truncate text-[var(--text-primary)]">
                    {v.customerCode}
                  </p>
                  <p className="font-mono text-[10px] text-[var(--text-muted)] mt-0.5">
                    Route: {v.routeCode}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <span className={`badge ${v.tempInRange ? 'badge-success' : 'badge-danger'}`}>
                    {v.temperature}°C
                  </span>
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                </div>
              </div>
            ))
          )}
        </div>
      </SectionCard>

      {/* ── Detail Modal ─────────────────────────────────── */}
      {reviewId && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setReviewId(null); setReviewData(null); }} />
          <div
            className="relative w-full md:max-w-3xl flex flex-col animate-slide-up"
            style={{
              background: 'var(--surface)',
              borderTopLeftRadius: '20px',
              borderTopRightRadius: '20px',
              borderBottomLeftRadius: '0',
              borderBottomRightRadius: '0',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-dropdown)',
              maxHeight: '92vh',
            }}
          >
            {/* Mobile drag handle */}
            <div className="md:hidden pt-3 pb-1 flex justify-center flex-shrink-0">
              <div className="h-1 w-10 rounded-full" style={{ background: 'var(--border)' }} />
            </div>

            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                <div>
                  <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Visit Details</p>
                  <p className="text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{reviewId}</p>
                </div>
              </div>
              <button
                onClick={() => { setReviewId(null); setReviewData(null); }}
                className="btn-ghost"
                style={{ height: '32px', width: '32px', padding: 0, justifyContent: 'center' }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-grow overflow-y-auto p-5 space-y-4">
              {detailLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : reviewData ? (
                <>
                  {/* Info Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      {
                        label: 'Supervisor', content: (
                          <>
                            <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{reviewData.visit.supervisorId}</p>
                            <p className="text-[11px] mt-1 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                              <Calendar className="h-3 w-3" />{new Date(reviewData.visit.createdAt).toLocaleString()}
                            </p>
                          </>
                        )
                      },
                      {
                        label: 'Outlet', content: (
                          <>
                            <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{reviewData.visit.customerCode}</p>
                            <p className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>Route: {reviewData.visit.routeCode}</p>
                          </>
                        )
                      },
                      {
                        label: 'GPS Location', content: (
                          <>
                            <p className="text-[11px] font-mono flex items-center gap-1" style={{ color: 'var(--text-primary)' }}>
                              <MapPin className="h-3 w-3" style={{ color: 'var(--accent)' }} />
                              {reviewData.visit.latitude.toFixed(4)}, {reviewData.visit.longitude.toFixed(4)}
                            </p>
                            <a
                              href={`https://www.google.com/maps?q=${reviewData.visit.latitude},${reviewData.visit.longitude}`}
                              target="_blank" rel="noreferrer"
                              className="text-[11px] font-semibold mt-1 block hover:underline"
                              style={{ color: 'var(--accent)' }}
                            >
                              Open Maps ↗
                            </a>
                          </>
                        )
                      }
                    ].map(({ label, content }) => (
                      <div key={label} className="p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                        <p className="form-label mb-1.5">{label}</p>
                        {content}
                      </div>
                    ))}
                  </div>

                  {/* Temp + Action */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                      <p className="form-label mb-2">Asset & Temperature</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[13px] font-bold uppercase" style={{ color: 'var(--text-primary)' }}>{reviewData.visit.assetType}</span>
                        <span className={`badge ${reviewData.visit.tempInRange ? 'badge-success' : 'badge-danger'}`}>
                          {reviewData.visit.temperature}°C {reviewData.visit.tempInRange ? '✓' : '⚠ Breach'}
                        </span>
                      </div>
                      {!reviewData.visit.tempInRange && (
                        <p className="flex items-center gap-1 text-[11px] mt-2" style={{ color: 'var(--danger)' }}>
                          <AlertTriangle className="h-3.5 w-3.5" />Temperature breach!
                        </p>
                      )}
                    </div>
                    <div className="p-3.5 rounded-xl" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                      <p className="form-label mb-2">Action & Observation</p>
                      <p className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>
                        Action: <span style={{ color: 'var(--accent)' }}>{reviewData.visit.actionRequired}</span>
                      </p>
                      <p className="text-[11px] italic mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        "{reviewData.visit.observation || 'No observations recorded.'}"
                      </p>
                    </div>
                  </div>

                  {/* Photos */}
                  <div>
                    <p className="form-label mb-2">Photos ({reviewData.photos.length})</p>
                    {reviewData.photos.length === 0 ? (
                      <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>No photos attached.</p>
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

                  {/* NPD */}
                  <div>
                    <p className="form-label mb-2">NPD Checklist ({reviewData.npdResponses.length})</p>
                    {reviewData.npdResponses.length === 0 ? (
                      <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>No SKU responses.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {reviewData.npdResponses.map(npd => (
                          <div key={npd.responseId} className="flex items-center justify-between px-3.5 py-2.5 rounded-lg"
                            style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                            <span className="font-mono text-[12px]" style={{ color: 'var(--text-secondary)' }}>{npd.skuCode}</span>
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
                <div className="py-12 text-center" style={{ color: 'var(--text-muted)' }}>Failed to load data.</div>
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
    </div>
  );
}

export const dynamic = 'force-dynamic';
