'use client';

import React from 'react';
import { BarChart3, TrendingUp, ShieldCheck, Clock, CheckCircle } from 'lucide-react';
import BackHeader from '../components/BackHeader';

export default function ReportsPage() {
  const stats = [
    { label: 'Visits Target', value: '24 / 30', sub: '80% completed', icon: CheckCircle, color: 'var(--accent)' },
    { label: 'Compliance Rate', value: '96.2%', sub: '+1.5% this week', icon: ShieldCheck, color: '#10B981' },
    { label: 'Avg Audit Time', value: '4m 32s', sub: 'Optimal performance', icon: Clock, color: '#F59E0B' },
  ];

  return (
    <div className="space-y-5 pb-24 md:pb-6 max-w-4xl mx-auto">
      <BackHeader title="Reports" hideBack />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map((s, idx) => {
          const Icon = s.icon;
          return (
            <div key={idx} className="card p-4 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[var(--text-muted)] uppercase tracking-wider">{s.label}</span>
                <Icon className="h-4.5 w-4.5" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-[20px] font-extrabold" style={{ color: 'var(--text-primary)' }}>{s.value}</p>
                <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{s.sub}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compliance Chart Card */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <BarChart3 className="h-5 w-5" style={{ color: 'var(--accent)' }} />
          <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Weekly Audit Submissions</h3>
        </div>

        {/* Mock Chart Visualizer */}
        <div className="h-48 flex items-end gap-3.5 pt-4 px-2">
          {[
            { day: 'Mon', count: 4, compliance: 100 },
            { day: 'Tue', count: 6, compliance: 83 },
            { day: 'Wed', count: 5, compliance: 100 },
            { day: 'Thu', count: 8, compliance: 88 },
            { day: 'Fri', count: 7, compliance: 100 },
            { day: 'Sat', count: 3, compliance: 100 },
            { day: 'Sun', count: 0, compliance: 0 },
          ].map((bar, idx) => {
            const maxCount = 8;
            const barHeight = bar.count > 0 ? `${(bar.count / maxCount) * 100}%` : '6px';
            return (
              <div key={idx} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                {bar.count > 0 && (
                  <span className="text-[9px] font-bold" style={{ color: 'var(--text-secondary)' }}>{bar.count}</span>
                )}
                <div
                  className="w-full rounded-t-md transition-all duration-500 hover:opacity-90 relative group"
                  style={{
                    height: barHeight,
                    background: bar.count === 0 ? 'var(--border-soft)' : 'linear-gradient(to top, var(--accent) 30%, #7C3AED 100%)',
                    borderRadius: '4px 4px 0 0',
                  }}
                >
                  {/* Tooltip */}
                  {bar.count > 0 && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 hidden group-hover:block bg-black/80 text-white text-[9px] py-1 px-2 rounded font-semibold whitespace-nowrap z-10 shadow-md">
                      {bar.compliance}% Compliance
                    </div>
                  )}
                </div>
                <span className="text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>{bar.day}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Temperature Alert Trends */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1px solid var(--border-soft)' }}>
          <TrendingUp className="h-5 w-5" style={{ color: '#10B981' }} />
          <h3 className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>Compliance Analysis</h3>
        </div>
        <div className="space-y-3 pt-1">
          <div className="p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--border-soft)] flex items-center justify-between">
            <div>
              <p className="font-bold text-[12px]" style={{ color: 'var(--text-primary)' }}>Temperature compliance is high</p>
              <p className="text-[10px] text-[var(--text-muted)]">96.2% of checks fall in safe thresholds (-18°C to -22°C).</p>
            </div>
            <span className="badge badge-success text-[10px]">Healthy</span>
          </div>
          <div className="p-3 bg-[var(--surface-2)] rounded-xl border border-[var(--border-soft)] flex items-center justify-between">
            <div>
              <p className="font-bold text-[12px]" style={{ color: 'var(--text-primary)' }}>NPD Checklist Availability</p>
              <p className="text-[10px] text-[var(--text-muted)]">Average SKU presence stands at 87% across routes.</p>
            </div>
            <span className="badge badge-warning text-[10px]">Good</span>
          </div>
        </div>
      </div>
    </div>
  );
}
