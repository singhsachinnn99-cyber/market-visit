'use client';

import React, { useState, useRef } from 'react';
import { validateExcelAction, importExcelAction } from '@/actions/import-actions';
import { useToast } from '@/components/ui/toast';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2,
  AlertTriangle, ArrowRight, RefreshCw, Database,
  ArrowLeft, Map, Users, Package, Link2,
  CheckCheck,
} from 'lucide-react';
import { Route, Customer, CustomerRouteMapping, SKU, ImportSummary } from '@/types';

type ImportStep = 'UPLOAD' | 'VALIDATE' | 'IMPORTING' | 'SUMMARY';

const STEPS = [
  { key: 'UPLOAD',    num: 1, label: 'Select File' },
  { key: 'VALIDATE',  num: 2, label: 'Review & Check' },
  { key: 'IMPORTING', num: 3, label: 'Sync Database' },
  { key: 'SUMMARY',   num: 4, label: 'Summary' },
];

const STEP_ORDER: ImportStep[] = ['UPLOAD', 'VALIDATE', 'IMPORTING', 'SUMMARY'];

export default function MasterImportPage() {
  const { showToast } = useToast();
  const [step, setStep] = useState<ImportStep>('UPLOAD');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{ row: number; error: string }[]>([]);
  const [routesPreview, setRoutesPreview]       = useState<Route[]>([]);
  const [customersPreview, setCustomersPreview] = useState<Customer[]>([]);
  const [mappingsPreview, setMappingsPreview]   = useState<CustomerRouteMapping[]>([]);
  const [skusPreview, setSkusPreview]           = useState<SKU[]>([]);
  const [counts, setCounts] = useState({ routes: 0, customers: 0, mappings: 0, skus: 0 });
  const [importPayload, setImportPayload] = useState<{ routes: Route[]; customers: Customer[]; mappings: CustomerRouteMapping[]; skus: SKU[] } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setFile(e.target.files[0]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) setFile(f);
    else showToast('Please drop an Excel file (.xlsx or .xls)', 'error');
  };

  const handleValidate = async () => {
    if (!file) { showToast('Please select a file first.', 'warning'); return; }
    setLoading(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await validateExcelAction(fd);
      if (res.success) {
        setCounts({ routes: res.routesCount, customers: res.customersCount, mappings: res.mappingsCount, skus: res.skusCount });
        setRoutesPreview(res.routesPreview as Route[]);
        setCustomersPreview(res.customersPreview as Customer[]);
        setMappingsPreview(res.mappingsPreview as CustomerRouteMapping[]);
        setSkusPreview(res.skusPreview as SKU[]);
        setValidationErrors(res.errors as any[]);
        setImportPayload(res.payload);
        setStep('VALIDATE');
        showToast('Spreadsheet validated.', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Validation failed.', 'error');
    } finally { setLoading(false); }
  };

  const handleImport = async () => {
    if (!importPayload) return;
    setLoading(true);
    setStep('IMPORTING');
    try {
      setSummary(await importExcelAction(importPayload));
      setStep('SUMMARY');
      showToast('Sync complete.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Sync failed.', 'error');
      setStep('VALIDATE');
    } finally { setLoading(false); }
  };

  const handleReset = () => {
    setFile(null); setValidationErrors([]); setImportPayload(null); setSummary(null); setStep('UPLOAD');
  };

  const currentIdx = STEP_ORDER.indexOf(step);

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Master Data Excel Sync
        </h1>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          Upload and synchronize Routes, Customers, Mappings, and SKU lists from Excel.
        </p>
      </div>

      {/* Step Indicator */}
      <div className="card p-4">
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => {
            const idx = STEP_ORDER.indexOf(s.key as ImportStep);
            const isDone = idx < currentIdx;
            const isCurrent = idx === currentIdx;
            return (
              <React.Fragment key={s.key}>
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <div
                    className="h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0 transition-all"
                    style={{
                      background: isDone ? 'var(--success)' : isCurrent ? 'var(--accent)' : 'var(--border)',
                      color: isDone || isCurrent ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    {isDone ? <CheckCheck className="h-3.5 w-3.5" /> : s.num}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold leading-none" style={{ color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      Step {s.num}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                  </div>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-grow h-px mx-3" style={{ background: idx < currentIdx ? 'var(--success)' : 'var(--border)' }} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── STEP 1: Upload ──────────────────────────────────── */}
      {step === 'UPLOAD' && (
        <div className="card p-6 space-y-5">
          <div
            ref={dropRef}
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center justify-center gap-4 p-10 rounded-xl border-2 border-dashed cursor-pointer transition-all"
            style={{
              borderColor: file ? 'var(--success)' : 'var(--border)',
              background: file ? 'var(--success-light)' : 'var(--surface-2)',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = file ? 'var(--success)' : 'var(--border)')}
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
            {file ? (
              <>
                <FileSpreadsheet className="h-10 w-10" style={{ color: 'var(--success)' }} />
                <div className="text-center">
                  <p className="text-[14px] font-bold" style={{ color: 'var(--text-primary)' }}>{file.name}</p>
                  <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>{(file.size / 1024).toFixed(1)} KB · Ready to validate</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setFile(null); }}
                  className="btn-ghost text-[12px]"
                  style={{ height: '30px' }}
                >
                  Remove file
                </button>
              </>
            ) : (
              <>
                <div className="icon-wrap h-14 w-14 rounded-2xl" style={{ background: 'var(--accent-light)' }}>
                  <UploadCloud className="h-7 w-7" style={{ color: 'var(--accent)' }} />
                </div>
                <div className="text-center">
                  <p className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Drop Excel file here or click to browse</p>
                  <p className="text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>Accepts .xlsx and .xls</p>
                  <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Required sheets: Routes · Customers · CustomerRouteMapping · SKUs</p>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end">
            <button onClick={handleValidate} disabled={!file || loading} className="btn-primary" style={{ opacity: !file || loading ? 0.6 : 1 }}>
              {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : null}
              {loading ? 'Parsing…' : 'Parse & Validate'}
              {!loading && <ArrowRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Validate ──────────────────────────────────── */}
      {step === 'VALIDATE' && importPayload && (
        <div className="space-y-5">
          {/* Alert banner */}
          <div
            className="flex items-start gap-3.5 p-4 rounded-xl"
            style={{
              background: validationErrors.length ? 'var(--danger-light)' : 'var(--success-light)',
              border: `1px solid ${validationErrors.length ? 'rgba(220,38,38,0.2)' : 'rgba(16,185,129,0.2)'}`,
            }}
          >
            {validationErrors.length ? (
              <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
            ) : (
              <CheckCircle2 className="h-5 w-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--success)' }} />
            )}
            <div>
              <p className="text-[13px] font-bold" style={{ color: validationErrors.length ? 'var(--danger)' : 'var(--success)' }}>
                {validationErrors.length ? `${validationErrors.length} Validation Error(s) Found` : 'All Checks Passed'}
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {validationErrors.length
                  ? 'Fix the following errors in your Excel file before importing.'
                  : 'All records passed schema validation. Ready to sync to database.'}
              </p>
              {validationErrors.length > 0 && (
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {validationErrors.map((e, i) => (
                    <li key={i} className="font-mono text-[11px]" style={{ color: 'var(--danger)' }}>Row {e.row}: {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Count cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Routes', value: counts.routes, icon: Map, color: 'var(--accent)', bg: 'var(--accent-light)' },
              { label: 'Customers', value: counts.customers, icon: Users, color: '#8B5CF6', bg: '#F5F3FF' },
              { label: 'Mappings', value: counts.mappings, icon: Link2, color: 'var(--warning)', bg: 'var(--warning-light)' },
              { label: 'SKUs', value: counts.skus, icon: Package, color: 'var(--success)', bg: 'var(--success-light)' },
            ].map(k => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="card p-4 flex items-center gap-3">
                  <div className="icon-wrap h-9 w-9 rounded-lg flex-shrink-0" style={{ background: k.bg }}>
                    <Icon className="h-4.5 w-4.5" style={{ color: k.color }} />
                  </div>
                  <div>
                    <p className="text-[20px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{k.value}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{k.label}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Preview tables */}
          <div className="card">
            <div className="section-header">
              <span className="section-title">
                <FileSpreadsheet className="h-4 w-4" style={{ color: 'var(--accent)' }} />
                Data Preview (First 5 Rows)
              </span>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              {[
                {
                  label: 'Routes', rows: routesPreview,
                  cols: ['routeCode', 'routeName'],
                  heads: ['Code', 'Name'],
                },
                {
                  label: 'Customers', rows: customersPreview,
                  cols: ['customerCode', 'customerName', 'classification', 'channel'],
                  heads: ['Code', 'Name', 'Class', 'Channel'],
                },
                {
                  label: 'Customer-Route Mappings', rows: mappingsPreview,
                  cols: ['customerCode', 'routeCode'],
                  heads: ['Customer', 'Route'],
                },
                {
                  label: 'SKUs', rows: skusPreview,
                  cols: ['skuCode', 'skuName'],
                  heads: ['SKU Code', 'SKU Name'],
                },
              ].map(({ label, rows, cols, heads }) => (
                <div key={label} className="space-y-2">
                  <p className="form-label">{label}</p>
                  <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    {rows.length === 0 ? (
                      <div className="py-4 text-center text-[12px] italic" style={{ color: 'var(--text-muted)' }}>No records found</div>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
                            {heads.map(h => (
                              <th key={h} className="px-3 py-2 text-left font-semibold" style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row: any, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border-soft)' }}>
                              {cols.map((col, j) => (
                                <td key={col} className="px-3 py-2" style={{ color: 'var(--text-secondary)', fontFamily: j === 0 ? 'monospace' : undefined }}>
                                  <span className="truncate block max-w-[120px]">{row[col]}</span>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button onClick={handleReset} className="btn-ghost">
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Upload
            </button>
            <button
              onClick={handleImport}
              disabled={validationErrors.length > 0 || loading}
              className="btn-primary"
              style={{ opacity: validationErrors.length > 0 ? 0.5 : 1 }}
            >
              <Database className="h-3.5 w-3.5" />
              Sync to Database
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Importing ─────────────────────────────────── */}
      {step === 'IMPORTING' && (
        <div className="card p-16 flex flex-col items-center gap-5 text-center">
          <div className="icon-wrap h-16 w-16 rounded-2xl" style={{ background: 'var(--accent-light)' }}>
            <RefreshCw className="h-8 w-8 animate-spin" style={{ color: 'var(--accent)' }} />
          </div>
          <div>
            <p className="text-[16px] font-bold" style={{ color: 'var(--text-primary)' }}>Synchronizing Database…</p>
            <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
              Writing master records and removing obsolete entries. Please wait.
            </p>
          </div>
        </div>
      )}

      {/* ── STEP 4: Summary ───────────────────────────────────── */}
      {step === 'SUMMARY' && summary && (
        <div className="card p-10 flex flex-col items-center gap-6 text-center">
          <div className="icon-wrap h-14 w-14 rounded-2xl" style={{ background: 'var(--success-light)' }}>
            <CheckCircle2 className="h-7 w-7" style={{ color: 'var(--success)' }} />
          </div>
          <div>
            <p className="text-[20px] font-bold" style={{ color: 'var(--text-primary)' }}>Sync Complete!</p>
            <p className="text-[13px] mt-1.5 max-w-sm" style={{ color: 'var(--text-muted)' }}>
              Master data updated successfully. Changes are live across all supervisor devices.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 w-full max-w-md">
            {[
              { label: 'Inserted', value: summary.inserted, color: 'var(--success)', bg: 'var(--success-light)' },
              { label: 'Updated', value: summary.updated, color: 'var(--accent)', bg: 'var(--accent-light)' },
              { label: 'Removed', value: summary.removed, color: 'var(--danger)', bg: 'var(--danger-light)' },
            ].map(s => (
              <div key={s.label} className="card p-4 text-center">
                <p className="text-[24px] font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-[11px] mt-1 uppercase tracking-wide font-semibold" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
              </div>
            ))}
          </div>

          <button onClick={handleReset} className="btn-ghost">
            Sync Another File
          </button>
        </div>
      )}
    </div>
  );
}

export const dynamic = 'force-dynamic';
