'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '@/components/ui/toast';
import { useGeolocation } from '@/hooks/use-geolocation';
import { saveVisitDraftAction, submitVisitAction } from '@/actions/visit-actions';
import {
  ArrowLeft,
  Save,
  CheckCircle,
  AlertTriangle,
  Camera,
  MapPin,
  RefreshCw,
  ChevronRight,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Route, Customer, SKU, VisitWizardState, VisitPhoto } from '@/types';

const STEP_NAMES = [
  'Route Selection',
  'Outlet Selection',
  'Capture Photos',
  'Asset Parameters',
  'Action Required',
  'SKU Availability',
  'GPS Coordinates',
  'Audit Summary'
];

function VisitWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { latitude, longitude, accuracy, error: gpsError, loading: gpsLoading, getCoordinates } = useGeolocation();

  // Wizard state parameters
  const [currentStep, setCurrentStep] = useState(0);
  const [visitId, setVisitId] = useState('');

  // Selections
  const [selectedRoute, setSelectedRoute] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [assetType, setAssetType] = useState<'Chiller' | 'Freezer'>('Chiller');
  const [temperature, setTemperature] = useState<number | ''>('');
  const [actionRequired, setActionRequired] = useState<any>('None');
  const [observation, setObservation] = useState('');

  // Photos category split
  const [photos, setPhotos] = useState<any[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // NPD states
  const [npdResponses, setNpdResponses] = useState<Record<string, any>>({});

  // Submitting loaders
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingVisit, setSubmittingVisit] = useState(false);

  // 1. Load masters
  const { data: routes = [] } = useQuery<Route[]>({
    queryKey: ['routes'],
    queryFn: () => fetch('/api/routes').then((res) => res.json()),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers', selectedRoute],
    queryFn: () => {
      if (!selectedRoute) return [];
      return fetch(`/api/customers?routeCode=${selectedRoute}`).then((res) => res.json());
    },
    enabled: !!selectedRoute,
  });

  const { data: skus = [] } = useQuery<SKU[]>({
    queryKey: ['skus'],
    queryFn: () => fetch('/api/skus').then((res) => res.json()),
  });

  const custMap = new Map<string, Customer>(customers.map((c) => [c.customerCode, c]));
  const activeCustomer = selectedCustomer ? custMap.get(selectedCustomer) : null;

  // Initialize a new Visit ID or resume existing
  useEffect(() => {
    const resumeId = searchParams.get('resumeId');
    if (resumeId) {
      const stored = localStorage.getItem('supervisor_visit_drafts');
      let localMatch: VisitWizardState | undefined;
      if (stored) {
        const drafts: VisitWizardState[] = JSON.parse(stored);
        localMatch = drafts.find((d) => d.visitId === resumeId);
      }

      if (localMatch) {
        setVisitId(localMatch.visitId);
        setSelectedRoute(localMatch.routeCode);
        setSelectedCustomer(localMatch.customerCode);
        setAssetType(localMatch.assetType || 'Chiller');
        setTemperature(localMatch.temperature !== undefined ? localMatch.temperature : '');
        setActionRequired(localMatch.actionRequired || 'None');
        setObservation(localMatch.observation || '');
        setPhotos(localMatch.photos || []);
        setNpdResponses(localMatch.npdResponses || {});
        setCurrentStep(localMatch.currentStep || 0);
      } else {
        setVisitId(`VISIT-${Date.now()}`);
      }
    } else {
      setVisitId(`VISIT-${Date.now()}`);
    }
  }, [searchParams]);

  useEffect(() => {
    getCoordinates();
  }, []);

  const isTempInRange = () => {
    if (temperature === '') return true;
    const temp = Number(temperature);
    if (assetType === 'Chiller') {
      return temp >= 0 && temp <= 8;
    } else {
      return temp <= -15;
    }
  };

  const saveStateToLocalStorage = (stepIndex: number) => {
    try {
      const stored = localStorage.getItem('supervisor_visit_drafts');
      let draftsList: VisitWizardState[] = stored ? JSON.parse(stored) : [];

      const index = draftsList.findIndex((d) => d.visitId === visitId);

      const updatedDraft: VisitWizardState = {
        visitId,
        routeCode: selectedRoute,
        customerCode: selectedCustomer,
        customerName: activeCustomer?.customerName || '',
        assetType,
        temperature: temperature !== '' ? Number(temperature) : undefined,
        actionRequired,
        observation,
        photos,
        npdResponses,
        currentStep: stepIndex,
        status: 'Draft',
      };

      if (index > -1) {
        draftsList[index] = updatedDraft;
      } else {
        draftsList.push(updatedDraft);
      }

      localStorage.setItem('supervisor_visit_drafts', JSON.stringify(draftsList));
    } catch (e) {
      console.error('LocalStorage write error', e);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: 'Dairy' | 'Beverages' | 'Fruits' | 'Vegetables') => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      setUploadingPhoto(true);

      let successCount = 0;
      let failCount = 0;

      for (const file of files) {
        try {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (err) => reject(err);
            reader.readAsDataURL(file);
          });

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: JSON.stringify({ file: base64, category }),
            headers: { 'Content-Type': 'application/json' },
          });

          if (!res.ok) throw new Error('Upload failed');
          const uploaded = await res.json();

          const newPhoto: VisitPhoto = {
            photoId: uploaded.public_id,
            visitId,
            category,
            cloudinaryUrl: uploaded.secure_url,
            publicId: uploaded.public_id,
            uploadedAt: new Date().toISOString(),
          };

          setPhotos((prev) => [...prev, newPhoto]);
          successCount++;
        } catch (err) {
          console.error(err);
          failCount++;
        }
      }

      if (successCount > 0) {
        showToast(`${successCount} photo(s) uploaded successfully to ${category}.`, 'success');
      }
      if (failCount > 0) {
        showToast(`Failed to upload ${failCount} photo(s).`, 'error');
      }
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleRemovePhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.photoId !== id));
    showToast('Photo removed.', 'info');
  };

  const nextStep = () => {
    if (currentStep === 0 && !selectedRoute) {
      showToast('Please select a route.', 'warning');
      return;
    }
    if (currentStep === 1 && !selectedCustomer) {
      showToast('Please select a customer.', 'warning');
      return;
    }
    if (currentStep === 6 && (gpsLoading || !latitude)) {
      showToast('Please wait for GPS coordinates to resolve.', 'warning');
      return;
    }

    const nextIndex = currentStep + 1;
    setCurrentStep(nextIndex);
    saveStateToLocalStorage(nextIndex);
  };

  const prevStep = () => {
    const prevIndex = currentStep - 1;
    setCurrentStep(prevIndex);
    saveStateToLocalStorage(prevIndex);
  };

  const handleSaveDraft = async () => {
    setSavingDraft(true);
    try {
      const draftPayload = {
        visitId,
        routeCode: selectedRoute,
        customerCode: selectedCustomer,
        assetType,
        temperature: temperature !== '' ? Number(temperature) : undefined,
        actionRequired,
        observation,
        photos,
        npdResponses,
        status: 'Draft' as const,
      };

      await saveVisitDraftAction(draftPayload);
      showToast('Draft successfully synced to server.', 'success');
      saveStateToLocalStorage(currentStep);
      router.push('/supervisor');
    } catch (err: any) {
      showToast(err.message || 'Failed to sync draft to server.', 'error');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleFinalSubmit = async () => {
    setSubmittingVisit(true);
    try {
      if (!latitude || !longitude) {
        showToast('GPS coordinates are mandatory to submit the audit.', 'error');
        setSubmittingVisit(false);
        return;
      }

      // Photos are now optional, no validation check required.

      if (temperature === '') {
        showToast('Temperature is mandatory to submit.', 'error');
        setSubmittingVisit(false);
        return;
      }

      const checkListResponses = skus.map((sku) => ({
        skuCode: sku.skuCode,
        status: npdResponses[sku.skuCode] || 'Not Required',
      }));

      const finalPayload = {
        visitId,
        routeCode: selectedRoute,
        customerCode: selectedCustomer,
        assetType,
        temperature: Number(temperature),
        tempInRange: isTempInRange(),
        actionRequired,
        observation,
        latitude,
        longitude,
        accuracy: accuracy || 0,
        status: 'Submitted' as const,
        photos,
        checklist: checkListResponses,
        npdResponses,
      };

      await submitVisitAction(finalPayload);
      showToast('Visit audit submitted successfully.', 'success');

      const stored = localStorage.getItem('supervisor_visit_drafts');
      if (stored) {
        const drafts: VisitWizardState[] = JSON.parse(stored);
        const filtered = drafts.filter((d) => d.visitId !== visitId);
        localStorage.setItem('supervisor_visit_drafts', JSON.stringify(filtered));
      }

      router.push('/supervisor');
    } catch (err: any) {
      showToast(err.message || 'Submission failed.', 'error');
    } finally {
      setSubmittingVisit(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-28">

      {/* Wizard Header */}
      <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-[18px] font-bold" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Visit Audit Wizard</h1>
          <p className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>ID: {visitId}</p>
        </div>
        <button
          onClick={handleSaveDraft}
          disabled={savingDraft || submittingVisit}
          className="btn-ghost"
          style={{ opacity: savingDraft || submittingVisit ? 0.5 : 1 }}
        >
          {savingDraft ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span>Save Draft</span>
        </button>
      </div>

      {/* Interactive Stepper Track */}
      <div className="space-y-3">
        <div 
          className="flex items-center gap-2 overflow-x-auto py-2.5 px-1 scrollbar-none snap-x"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {Array.from({ length: 8 }).map((_, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;
            return (
              <React.Fragment key={i}>
                {/* Bubble Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (isCompleted) {
                      setCurrentStep(i);
                    }
                  }}
                  className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[12px] font-bold transition-all duration-200 snap-center cursor-pointer ${
                    isCompleted ? 'hover:bg-indigo-100 dark:hover:bg-indigo-950/30' : ''
                  }`}
                  style={{
                    background: isActive 
                      ? 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)' 
                      : isCompleted 
                        ? 'var(--accent-light)' 
                        : 'var(--surface-2)',
                    color: isActive 
                      ? 'white' 
                      : isCompleted 
                        ? 'var(--accent)' 
                        : 'var(--text-muted)',
                    border: `1px solid ${
                      isActive 
                        ? 'transparent' 
                        : isCompleted 
                          ? 'var(--accent-soft)' 
                          : 'var(--border)'
                    }`,
                    boxShadow: isActive ? '0 4px 12px rgba(79,70,229,0.35)' : 'none',
                    transform: isActive ? 'scale(1.1)' : 'scale(1)',
                  }}
                  title={STEP_NAMES[i]}
                >
                  {isCompleted ? '✓' : i + 1}
                </button>

                {/* Connector line */}
                {i < 7 && (
                  <div 
                    className="h-[2px] w-6 flex-shrink-0 transition-colors duration-300"
                    style={{
                      background: isCompleted ? 'var(--accent)' : 'var(--border-soft)',
                    }}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Step Info Card Header */}
        <div 
          className="p-3.5 rounded-xl flex items-center justify-between border border-solid border-[var(--border-soft)]"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="space-y-0.5">
            <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Current Phase</p>
            <h3 className="text-[14px] font-extrabold text-[var(--text-primary)] leading-none">{STEP_NAMES[currentStep]}</h3>
          </div>
          <span 
            className="text-[11px] font-bold px-2.5 py-1 rounded-full text-white"
            style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)' }}
          >
            Step {currentStep + 1} / 8
          </span>
        </div>
      </div>

      {/* STEP 0: ROUTE SELECT */}
      {currentStep === 0 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Route Picker</span>
          <div>
            <label className="form-label mb-1">Select Available Route</label>
            <select
              value={selectedRoute}
              onChange={(e) => { setSelectedRoute(e.target.value); setSelectedCustomer(''); }}
              className="form-input"
            >
              <option value="">— Choose Route —</option>
              {routes.map((r) => (
                <option key={r.routeCode} value={r.routeCode}>{r.routeCode} – {r.routeName}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* STEP 1: CUSTOMER SELECT */}
      {currentStep === 1 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Outlet Selection</span>
          <div>
            <label className="form-label mb-1">Customer Outlets on Route</label>
            <select value={selectedCustomer} onChange={(e) => setSelectedCustomer(e.target.value)} className="form-input">
              <option value="">— Choose Customer —</option>
              {customers.map((c) => (
                <option key={c.customerCode} value={c.customerCode}>{c.customerCode} – {c.customerName}</option>
              ))}
            </select>
          </div>
          {activeCustomer && (
            <div className="grid grid-cols-2 gap-3 p-4 rounded-xl animate-slide-up" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
              <div>
                <p className="form-label mb-1">Classification</p>
                <span className="badge badge-accent">Grade {activeCustomer.classification}</span>
              </div>
              <div>
                <p className="form-label mb-1">Channel</p>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{activeCustomer.channel}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 2: CAPTURE PHOTOS */}
      {currentStep === 2 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Camera Capture</span>
          <div className="space-y-3">
            {(['Dairy', 'Beverages', 'Fruits', 'Vegetables'] as const).map((cat) => {
              const catPhotos = photos.filter((p) => p.category === cat);
              return (
                <div key={cat} className="p-4 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold uppercase" style={{ color: 'var(--text-primary)' }}>{cat}</span>
                    <label className="btn-ghost cursor-pointer" style={{ height: '32px', padding: '0 12px' }}>
                      <Camera className="h-3.5 w-3.5" style={{ color: 'var(--accent)' }} />
                      <span>Add Photos</span>
                      <input type="file" accept="image/*" multiple disabled={uploadingPhoto} onChange={(e) => handlePhotoUpload(e, cat)} className="hidden" />
                    </label>
                  </div>
                  {catPhotos.length === 0 ? (
                    <div className="border-2 border-dashed rounded-xl p-4 text-center" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-[11px] italic" style={{ color: 'var(--text-muted)' }}>No photos for {cat} yet.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {catPhotos.map((p) => (
                        <div key={p.photoId} className="relative aspect-square rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                          <img src={p.cloudinaryUrl} alt="captured" className="h-full w-full object-cover" />
                          <button onClick={() => handleRemovePhoto(p.photoId)}
                            className="absolute top-1 right-1 p-1.5 rounded-lg cursor-pointer"
                            style={{ background: 'var(--danger)', color: 'white' }}>
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {uploadingPhoto && (
              <div className="flex items-center justify-center gap-2.5 p-3.5 rounded-xl text-[12px] font-bold animate-pulse" style={{ background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-soft)' }}>
                <RefreshCw className="h-4 w-4 animate-spin" />
                Uploading to Cloudinary…
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 3: ASSET TEMPERATURE */}
      {currentStep === 3 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Asset Parameters</span>
          <div className="grid grid-cols-2 gap-3">
            {(['Chiller', 'Freezer'] as const).map(type => (
              <button key={type} type="button" onClick={() => setAssetType(type)}
                className="h-12 text-[13px] font-bold rounded-xl transition-all cursor-pointer"
                style={{
                  background: assetType === type ? 'var(--accent-light)' : 'var(--surface-2)',
                  color: assetType === type ? 'var(--accent)' : 'var(--text-muted)',
                  border: `1px solid ${assetType === type ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                {type}
              </button>
            ))}
          </div>
          <div>
            <label className="form-label mb-1">Recorded Temperature (°C)</label>
            <input type="number" step="0.1" placeholder="e.g. 4.2" value={temperature}
              onChange={(e) => setTemperature(e.target.value !== '' ? Number(e.target.value) : '')}
              className="form-input font-mono" />
          </div>
          <div className="p-3.5 rounded-xl text-[11px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Range Rules:</strong> Chiller: <span style={{ color: 'var(--accent)' }}>0°C to 8°C</span> · Freezer: <span style={{ color: '#7C3AED' }}>Below -15°C</span>
          </div>
          {temperature !== '' && !isTempInRange() && (
            <div className="flex gap-3 p-4 rounded-xl animate-slide-up" style={{ background: 'var(--danger-light)', border: '1px solid rgba(220,38,38,0.2)' }}>
              <AlertTriangle className="h-4.5 w-4.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
              <div>
                <p className="text-[12px] font-bold" style={{ color: 'var(--danger)' }}>Temperature Out of Range</p>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>This audit will be flagged as a temperature breach.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4: ACTION REQUIRED */}
      {currentStep === 4 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Observations</span>
          <div>
            <label className="form-label mb-1">Mandatory Action</label>
            <select value={actionRequired} onChange={(e) => setActionRequired(e.target.value)} className="form-input">
              <option value="None">None (In order)</option>
              <option value="Cleaning">Cleaning</option>
              <option value="Repair">Repair</option>
              <option value="Replacement">Replacement</option>
              <option value="Gas Filling">Gas Filling</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label className="form-label mb-1">Observations / Notes <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span></label>
            <textarea placeholder="Write observation details…" rows={3} value={observation}
              onChange={(e) => setObservation(e.target.value)}
              className="form-input resize-none" style={{ height: 'auto', paddingTop: '10px', paddingBottom: '10px', lineHeight: '1.5' }} />
          </div>
        </div>
      )}

      {/* STEP 5: NPD CHECK */}
      {currentStep === 5 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">SKU Checklist</span>
          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {skus.length === 0 ? (
              <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>No SKU masters configured.</p>
            ) : (
              skus.map((sku) => {
                const currentStatus = npdResponses[sku.skuCode] || 'Not Required';
                return (
                  <div key={sku.skuCode} className="p-3.5 rounded-xl space-y-2.5" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                    <div>
                      <p className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>{sku.skuName}</p>
                      <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{sku.skuCode}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {['Available', 'Not Available', 'Not Required'].map((opt) => {
                        const isChecked = currentStatus === opt;
                        const col = opt === 'Available' ? 'var(--success)' : opt === 'Not Available' ? 'var(--danger)' : 'var(--text-muted)';
                        const bg = opt === 'Available' ? 'var(--success-light)' : opt === 'Not Available' ? 'var(--danger-light)' : 'var(--surface)';
                        return (
                          <button key={opt} type="button"
                            onClick={() => setNpdResponses((prev) => ({ ...prev, [sku.skuCode]: opt }))}
                            className="flex-grow h-9 text-[10px] font-bold rounded-lg transition-all cursor-pointer"
                            style={{
                              background: isChecked ? bg : 'transparent',
                              color: isChecked ? col : 'var(--text-muted)',
                              border: `1px solid ${isChecked ? col : 'var(--border)'}`,
                            }}
                          >
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* STEP 6: GPS COORDS */}
      {currentStep === 6 && (
        <div className="card p-5 space-y-4 animate-slide-up text-center">
          <span className="badge badge-accent">GPS Sync</span>
          <div className="py-6 flex flex-col items-center gap-4">
            {gpsLoading ? (
              <>
                <div className="icon-wrap h-14 w-14 rounded-2xl" style={{ background: 'var(--accent-light)' }}>
                  <RefreshCw className="h-7 w-7 animate-spin" style={{ color: 'var(--accent)' }} />
                </div>
                <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Locking satellite coordinates…</p>
              </>
            ) : latitude ? (
              <>
                <div className="icon-wrap h-14 w-14 rounded-2xl" style={{ background: 'var(--success-light)' }}>
                  <MapPin className="h-7 w-7" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>GPS Confirmed ✓</p>
                  <p className="font-mono text-[12px] mt-1" style={{ color: 'var(--text-muted)' }}>{latitude.toFixed(5)}, {longitude?.toFixed(5)}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Accuracy: ±{accuracy?.toFixed(1)}m</p>
                </div>
              </>
            ) : (
              <>
                <div className="icon-wrap h-14 w-14 rounded-2xl" style={{ background: 'var(--danger-light)' }}>
                  <AlertTriangle className="h-7 w-7" style={{ color: 'var(--danger)' }} />
                </div>
                <div>
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>Location Required</p>
                  <p className="text-[12px] mt-1 max-w-xs" style={{ color: 'var(--danger)' }}>{gpsError || 'Allow location access to continue.'}</p>
                </div>
                <button onClick={getCoordinates} className="btn-ghost">Retry GPS</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* STEP 7: REVIEW AUDIT SUMMARY */}
      {currentStep === 7 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-success">Summary Readback</span>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {[
              ['Route Code', selectedRoute, 'mono'],
              ['Customer Code', selectedCustomer, 'mono'],
              ['Classification', activeCustomer?.classification || '—', 'accent'],
              ['Asset Type', assetType, 'bold'],
              ['Temperature', `${temperature}°C (${isTempInRange() ? 'Valid ✓' : 'Breach ⚠'})`, isTempInRange() ? 'success' : 'danger'],
              ['Action Required', actionRequired, 'accent'],
              ['GPS Status', 'Acquired ✓', 'success'],
              ['Photos', `${photos.length} images`, 'bold'],
            ].map(([label, value, style], i, arr) => (
              <div key={label as string} className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border-soft)' : 'none', background: i % 2 === 0 ? 'transparent' : 'var(--surface-2)' }}>
                <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</span>
                <span className="text-[12px] font-bold font-mono"
                  style={{
                    color: style === 'accent' ? 'var(--accent)' : style === 'success' ? 'var(--success)' : style === 'danger' ? 'var(--danger)' : 'var(--text-primary)',
                  }}>
                  {value as string}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={handleFinalSubmit}
            disabled={submittingVisit || savingDraft}
            className="btn-primary w-full justify-center"
            style={{
              height: '48px', fontSize: '13px', opacity: submittingVisit || savingDraft ? 0.6 : 1,
              background: 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)',
              boxShadow: '0 4px 20px rgba(79,70,229,0.35)',
            }}
          >
            {submittingVisit ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4.5 w-4.5" />}
            {submittingVisit ? 'Submitting…' : 'Submit Final Audit'}
          </button>
        </div>
      )}

      {/* Sticky Nav Footer */}
      <div
        className="max-md:fixed max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-40 flex items-center justify-between gap-4 p-4"
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: '0 -4px 12px rgba(0,0,0,0.03)',
        }}
      >
        <button
          onClick={prevStep}
          disabled={currentStep === 0 || savingDraft || submittingVisit}
          className="btn-ghost"
          style={{ height: '44px', padding: '0 20px', opacity: currentStep === 0 ? 0.35 : 1 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        {currentStep < 7 && (
          <button
            onClick={nextStep}
            disabled={savingDraft || submittingVisit || (currentStep === 0 && !selectedRoute) || (currentStep === 1 && !selectedCustomer) || (currentStep === 6 && (gpsLoading || !latitude))}
            className="btn-primary"
            style={{
              height: '44px', padding: '0 24px',
              background: 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)',
              boxShadow: '0 4px 16px rgba(79,70,229,0.3)',
              opacity: (savingDraft || submittingVisit) ? 0.5 : 1,
            }}
          >
            {currentStep === 6 ? 'Review Summary' : 'Next'}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function VisitWizardPage() {
  return (
    <Suspense fallback={
      <div className="card p-10 text-center max-w-md mx-auto my-12 animate-pulse" style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
        Initializing Audit Wizard…
      </div>
    }>
      <VisitWizardContent />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
