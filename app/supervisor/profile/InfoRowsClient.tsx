"use client";

import React from 'react';
import { Mail, Phone, Calendar, UserCheck } from 'lucide-react';

type Row = {
  icon: 'Mail' | 'Phone' | 'Calendar' | 'UserCheck' | string;
  color: string;
  bg: string;
  label: string;
  value: string;
};

export default function InfoRowsClient({ rows }: { rows: Row[] }) {
  const iconMap: Record<string, any> = { Mail, Phone, Calendar, UserCheck };

  return (
    <>
      {rows.map((r, i, arr) => {
        const Icon = iconMap[r.icon] ?? (() => null);
        return (
          <div
            key={r.label}
            className="flex items-start gap-4 px-5 py-4 transition-colors"
            style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-soft)' : 'none' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <div className="icon-wrap h-9 w-9 rounded-lg flex-shrink-0" style={{ background: r.bg }}>
              <Icon className="h-4 w-4" style={{ color: r.color }} />
            </div>
            <div className="min-w-0">
              <p className="form-label mb-0.5">{r.label}</p>
              <p className="text-[13px] font-medium leading-normal" style={{ color: 'var(--text-primary)' }}>{r.value}</p>
            </div>
          </div>
        );
      })}
    </>
  );
}
