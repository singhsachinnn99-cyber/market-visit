'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { X, Search, Download, ArrowUpDown, ArrowUp, ArrowDown, FilterX } from 'lucide-react';
import * as XLSX from 'xlsx';

interface DrilldownReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  rows: Record<string, any>[];
  reportType: 'npd' | 'psku' | 'cold-chain' | 'classification';
  filterChip?: { key: string; value: string; label: string } | null;
  onClearFilter?: () => void;
}

const GCOL: Record<string, string> = {
  A: '#0b7a4c',
  B: '#2b9c62',
  C: '#c8801a',
  D: '#d9663a',
  E: '#c0392b',
};

const REPORT_COLUMNS: Record<string, { key: string; label: string }[]> = {
  npd: [
    { key: 'date', label: 'Date' },
    { key: 'visitId', label: 'Visit ID' },
    { key: 'channel', label: 'Channel' },
    { key: 'manager', label: 'Manager' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'routeCode', label: 'Route Code' },
    { key: 'outletCode', label: 'Outlet (Shop) Code' },
    { key: 'outletName', label: 'Outlet Name' },
    { key: 'classification', label: 'Classification' },
    { key: 'businessVertical', label: 'Business Vertical' },
    { key: 'skuName', label: 'SKU Name' },
    { key: 'availability', label: 'NPD Availability' },
  ],
  psku: [
    { key: 'date', label: 'Date' },
    { key: 'visitId', label: 'Visit ID' },
    { key: 'channel', label: 'Channel' },
    { key: 'manager', label: 'Manager' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'routeCode', label: 'Route Code' },
    { key: 'outletCode', label: 'Outlet (Shop) Code' },
    { key: 'outletName', label: 'Outlet Name' },
    { key: 'classification', label: 'Classification' },
    { key: 'businessVertical', label: 'Business Vertical' },
    { key: 'skuName', label: 'SKU Name' },
    { key: 'availability', label: 'Power SKU Availability' },
  ],
  'cold-chain': [
    { key: 'date', label: 'Date' },
    { key: 'visitId', label: 'Visit ID' },
    { key: 'channel', label: 'Channel' },
    { key: 'manager', label: 'Manager' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'routeCode', label: 'Route Code' },
    { key: 'outletCode', label: 'Outlet (Shop) Code' },
    { key: 'outletName', label: 'Outlet Name' },
    { key: 'classification', label: 'Classification' },
    { key: 'assetType', label: 'Asset Type Name' },
    { key: 'assetTemp', label: 'Asset Temp' },
    { key: 'tempStatus', label: 'Temp Status' },
    { key: 'actionRemarks', label: 'Action / Remarks' },
  ],
  classification: [
    { key: 'date', label: 'Date' },
    { key: 'visitId', label: 'Visit ID' },
    { key: 'channel', label: 'Channel' },
    { key: 'manager', label: 'Manager' },
    { key: 'supervisor', label: 'Supervisor' },
    { key: 'routeCode', label: 'Route Code' },
    { key: 'outletCode', label: 'Outlet (Shop) Code' },
    { key: 'outletName', label: 'Outlet Name' },
    { key: 'class', label: 'Class' },
  ],
};

function formatDisplayDate(value?: string) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getCellValue(row: Record<string, any>, key: string) {
  if (key === 'date') return formatDisplayDate(row.date);
  if (key === 'classification') return row.classification || '—';
  if (key === 'class') return row.class || '—';
  if (key === 'availability') return row.availability || '—';
  if (key === 'tempStatus') return row.tempStatus || '—';
  if (key === 'assetTemp') return row.assetTemp || '—';
  if (key === 'actionRemarks') return row.actionRemarks || '—';
  const value = row[key];
  return value ?? '—';
}

function buildSummaryText(reportType: string, rows: Record<string, any>[]) {
  if (reportType === 'cold-chain') {
    const inRange = rows.filter((r) => r.tempStatus === 'In Range').length;
    const breach = rows.filter((r) => r.tempStatus === 'Breach').length;
    return `Showing ${rows.length} assets · ${inRange} In Range · ${breach} Breach`;
  }

  if (reportType === 'classification') {
    const counts = rows.reduce<Record<string, number>>((acc, row) => {
      const cls = row.class || '—';
      acc[cls] = (acc[cls] || 0) + 1;
      return acc;
    }, {});
    const parts = Object.entries(counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cls, count]) => `${cls}:${count}`);
    return `Showing ${rows.length} visits · ${parts.join(' · ')}`;
  }

  const yes = rows.filter((r) => r.availability === 'YES').length;
  const no = rows.filter((r) => r.availability === 'NO').length;
  const na = rows.filter((r) => r.availability === 'NOT APPLICABLE').length;
  return `Showing ${rows.length} records · ${yes} YES · ${no} NO · ${na} N/A`;
}

function exportWorkbook(title: string, summary: string, rows: Record<string, any>[], reportType: string, filterChip?: { key: string; value: string; label: string } | null) {
  const headers = REPORT_COLUMNS[reportType].map((col) => col.label);
  const sheetRows = [
    ['Summary', summary],
    ['Report', title],
    ['Filter', filterChip ? `${filterChip.label}` : 'All rows'],
    [],
    headers,
    ...rows.map((row) => REPORT_COLUMNS[reportType].map((col) => getCellValue(row, col.key))),
  ];

  const sheet = XLSX.utils.aoa_to_sheet(sheetRows);
  sheet['!cols'] = headers.map((header) => ({ width: Math.max(header.length + 2, 14) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Report');
  XLSX.writeFile(workbook, `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.xlsx`);
}

export default function DrilldownReportModal({
  isOpen,
  onClose,
  title,
  rows,
  reportType,
  filterChip,
  onClearFilter,
}: DrilldownReportModalProps) {
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setPage(1);
      setSortField(reportType === 'cold-chain' ? 'tempStatus' : 'date');
      setSortOrder('desc');
    }
  }, [isOpen, reportType]);

  const columns = REPORT_COLUMNS[reportType];

  const filteredData = useMemo(() => {
    if (!search.trim()) return rows;
    const query = search.toLowerCase();
    return rows.filter((row) =>
      columns.some((col) => String(getCellValue(row, col.key)).toLowerCase().includes(query))
    );
  }, [rows, search, columns]);

  const sortedData = useMemo(() => {
    const data = [...filteredData];
    data.sort((a, b) => {
      const aValue = getCellValue(a, sortField);
      const bValue = getCellValue(b, sortField);
      const isDate = sortField === 'date';
      const isStatus = sortField === 'tempStatus';

      if (isDate) {
        const aTime = new Date(a.date || 0).getTime();
        const bTime = new Date(b.date || 0).getTime();
        return sortOrder === 'asc' ? aTime - bTime : bTime - aTime;
      }

      if (isStatus) {
        const rank = (value: string) => (value === 'Breach' ? 0 : 1);
        const rankDiff = rank(String(aValue)) - rank(String(bValue));
        if (rankDiff !== 0) return rankDiff;
      }

      const left = String(aValue).toLowerCase();
      const right = String(bValue).toLowerCase();
      if (left < right) return sortOrder === 'asc' ? -1 : 1;
      if (left > right) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  }, [filteredData, sortField, sortOrder]);

  const summaryText = useMemo(() => buildSummaryText(reportType, sortedData), [reportType, sortedData]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, currentPage, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  if (!isOpen) return null;

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const renderSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 inline-block opacity-40" />;
    return sortOrder === 'asc' ? <ArrowUp className="h-3 w-3 ml-1 inline-block text-[var(--accent)]" /> : <ArrowDown className="h-3 w-3 ml-1 inline-block text-[var(--accent)]" />;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-6xl flex flex-col bg-[var(--surface)] md:rounded-2xl shadow-2xl overflow-hidden animate-slide-up" style={{ height: '88vh', maxHeight: '88vh', border: '1px solid var(--border)', color: 'var(--text-primary)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-5 py-4 border-b border-[var(--border-soft)] bg-[var(--surface)] flex-shrink-0">
          <div>
            <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{title}</h3>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">{summaryText}</p>
          </div>
          <div className="flex items-center gap-2">
            {filterChip ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
                <span>{filterChip.label}</span>
                <button onClick={() => onClearFilter?.()} className="cursor-pointer" type="button">
                  <FilterX className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : null}
            <button onClick={onClose} className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-[var(--surface-2)] transition-colors text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
              <X className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-[var(--border-soft)] bg-[var(--surface-2)] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="relative w-full sm:max-w-xs">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-[var(--text-muted)]" />
            </span>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search report values..." className="form-input pl-9 w-full text-xs font-semibold bg-[var(--surface)] border border-[var(--border)] rounded-xl py-2 px-3 focus:outline-none focus:border-[var(--accent)]" />
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto text-xs font-semibold text-[var(--text-muted)]">
            <button onClick={() => exportWorkbook(title, summaryText, sortedData, reportType, filterChip)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text-primary)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer">
              <Download className="h-4 w-4" />
              Export to Excel
            </button>
            <span>Show</span>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-2 py-1 text-xs text-[var(--text-primary)] cursor-pointer">
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size} items</option>)}
            </select>
          </div>
        </div>

        <div className="flex-grow overflow-y-auto min-h-0 bg-[var(--bg)]">
          <div className="hidden md:block overflow-x-auto h-full">
            <table className="w-full text-[12px] border-collapse">
              <thead className="sticky top-0 bg-[var(--surface)] z-10">
                <tr className="border-b border-[var(--border-soft)] text-[var(--text-muted)]">
                  {columns.map((column) => (
                    <th key={column.key} onClick={() => handleSort(column.key)} className="px-3 py-3 text-left font-bold text-[10.5px] uppercase tracking-wider cursor-pointer hover:bg-[var(--surface-2)]">
                      {column.label} {renderSortIcon(column.key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-soft)]">
                {paginatedData.length > 0 ? paginatedData.map((row, index) => (
                  <tr key={`${row.visitId}-${index}`} className="hover:bg-[var(--surface-2)] transition-colors">
                    {columns.map((column) => (
                      <td key={column.key} className="px-3 py-3 text-[12px] whitespace-nowrap text-[var(--text-primary)]">
                        {column.key === 'classification' && row.classification ? (
                          <span className="inline-grid place-items-center w-6 h-6 rounded-md text-white font-bold text-[10px]" style={{ background: GCOL[row.classification] || '#9aa9b4' }}>
                            {row.classification}
                          </span>
                        ) : column.key === 'class' && row.class ? (
                          <span className="inline-grid place-items-center w-6 h-6 rounded-md text-white font-bold text-[10px]" style={{ background: GCOL[row.class] || '#9aa9b4' }}>
                            {row.class}
                          </span>
                        ) : column.key === 'availability' && row.availability === 'NO' ? (
                          <span className="inline-flex items-center rounded-full bg-red-500/12 px-2.5 py-1 text-[10px] font-semibold text-red-600">{getCellValue(row, column.key)}</span>
                        ) : column.key === 'availability' && row.availability === 'YES' ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2.5 py-1 text-[10px] font-semibold text-emerald-600">{getCellValue(row, column.key)}</span>
                        ) : column.key === 'tempStatus' && row.tempStatus === 'Breach' ? (
                          <span className="inline-flex items-center rounded-full bg-red-500/12 px-2.5 py-1 text-[10px] font-semibold text-red-600">{getCellValue(row, column.key)}</span>
                        ) : (
                          getCellValue(row, column.key)
                        )}
                      </td>
                    ))}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={columns.length} className="px-5 py-12 text-center text-[13px] text-[var(--text-muted)]">No matching records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-[var(--border-soft)] h-full overflow-y-auto">
            {paginatedData.length > 0 ? paginatedData.map((row, index) => (
              <div key={`${row.visitId}-${index}`} className="p-4 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-colors space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-mono text-[11px] font-bold text-[var(--accent)]">{row.visitId}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{formatDisplayDate(row.date)}</div>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11.5px] text-[var(--text-muted)]">
                  <div><span className="font-semibold text-[10px] uppercase block">Outlet</span>{row.outletName}</div>
                  <div><span className="font-semibold text-[10px] uppercase block">Channel</span>{row.channel}</div>
                  <div><span className="font-semibold text-[10px] uppercase block">Supervisor</span>{row.supervisor}</div>
                  <div><span className="font-semibold text-[10px] uppercase block">Manager</span>{row.manager}</div>
                </div>
              </div>
            )) : (
              <div className="p-12 text-center text-[13px] text-[var(--text-muted)]">No matching records found.</div>
            )}
          </div>
        </div>

        <div className="px-5 py-4 border-t border-[var(--border-soft)] bg-[var(--surface)] flex flex-col sm:flex-row items-center justify-between gap-3 flex-shrink-0">
          <div className="text-[11.5px] text-[var(--text-muted)] font-semibold">
            Showing {sortedData.length > 0 ? (currentPage - 1) * pageSize + 1 : 0} to {Math.min(currentPage * pageSize, sortedData.length)} of {sortedData.length} records
          </div>
          <div className="flex items-center gap-1.5 font-semibold">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1} className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1">
              <span className="text-xs">Previous</span>
            </button>
            <div className="text-xs px-3 py-1 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--text-primary)]">Page {currentPage} of {totalPages}</div>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="h-8 px-2.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer flex items-center gap-1">
              <span className="text-xs">Next</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
