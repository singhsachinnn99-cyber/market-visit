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
  Plus,
  Info,
} from 'lucide-react';
import { Route, Customer, SKU, PowerSKU, VisitWizardState, VisitPhoto, VisitAsset } from '@/types';

function generateVisitId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const dateStr = `${year}${month}${day}${hours}${minutes}${seconds}`;
  const randomStr = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `MV-${dateStr}-${randomStr}`;
}

const STEP_NAMES = [
  'Route Selection',
  'Customer Selection',
  'Power SKU Checklist',
  'NPD Checklist',
  'Capture Assets',
  'Capture Photos',
  'GPS Sync',
  'Review & Submit'
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
  const [selectedCustomer, setSelectedCustomer] = useState(''); // Stores cust_rt_id
  const [customerSearch, setCustomerSearch] = useState('');

  // Multiple assets list
  const [assets, setAssets] = useState<VisitAsset[]>([]);
  const [sosAsPerBda, setSosAsPerBda] = useState<boolean | null>(null);

  // Photos category split
  const [photos, setPhotos] = useState<VisitPhoto[]>([]);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // SKU Checklists states
  const [powerSkuResults, setPowerSkuResults] = useState<Record<string, any>>({});
  const [npdResponses, setNpdResponses] = useState<Record<string, any>>({});

  // Submitting loaders
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingVisit, setSubmittingVisit] = useState(false);

  // 1. Load masters
  const { data: routes = [] } = useQuery<Route[]>({
    queryKey: ['routes'],
    queryFn: () => fetch('/api/routes').then((res) => {
      if (!res.ok) throw new Error('Failed to load routes');
      return res.json();
    }),
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers', selectedRoute],
    queryFn: () => {
      if (!selectedRoute) return [];
      return fetch(`/api/customers?routeCode=${selectedRoute}`).then((res) => {
        if (!res.ok) throw new Error('Failed to load customers');
        return res.json();
      });
    },
    enabled: !!selectedRoute,
  });

  const { data: powerSkus = [] } = useQuery<PowerSKU[]>({
    queryKey: ['powerSkus', selectedRoute],
    queryFn: () => {
      if (!selectedRoute) return [];
      return fetch(`/api/powerskus?routeCode=${selectedRoute}`).then((res) => {
        if (!res.ok) throw new Error('Failed to load Power SKUs');
        return res.json();
      });
    },
    enabled: !!selectedRoute,
  });

  const { data: npdSkus = [] } = useQuery<SKU[]>({
    queryKey: ['npdSkus'],
    queryFn: () => fetch('/api/skus').then((res) => {
      if (!res.ok) throw new Error('Failed to load NPD SKUs');
      return res.json();
    }),
  });

  const activeCustomer = selectedCustomer ? customers.find((c) => c.cust_rt_id === selectedCustomer) : null;

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
        setSelectedCustomer(localMatch.customerCode); // stores cust_rt_id
        setAssets((localMatch.assets || []).map((a: any) => ({ ...a, visitId: resumeId })));
        setPhotos((localMatch.photos || []).map((p: any) => ({ ...p, visitId: resumeId })));
        setPowerSkuResults(localMatch.powerSkuResults || {});
        setNpdResponses(localMatch.npdResponses || {});
        setSosAsPerBda(localMatch.sosAsPerBda !== undefined ? localMatch.sosAsPerBda : null);
        setCurrentStep(localMatch.currentStep || 0);
      } else {
        setVisitId(generateVisitId());
      }
    } else {
      setVisitId(generateVisitId());
    }
  }, [searchParams]);

  // Pre-populate with 1 empty asset if assets array is empty
  useEffect(() => {
    if (visitId && assets.length === 0) {
      setAssets([
        {
          assetId: 'ast_' + Math.random().toString(36).substring(2, 9),
          visitId,
          assetType: 'Chiller',
          temperature: 0,
          tempInRange: true,
          actionRequired: 'None',
          observation: '',
        },
      ]);
    }
  }, [visitId, assets]);

  useEffect(() => {
    getCoordinates();
  }, []);

  const getTempInRange = (type: 'Chiller' | 'Freezer', temp: number) => {
    return type === 'Chiller' ? (temp >= 0 && temp <= 8) : (temp <= -15);
  };

  const saveStateToLocalStorage = (stepIndex: number) => {
    try {
      const stored = localStorage.getItem('supervisor_visit_drafts');
      let draftsList: VisitWizardState[] = stored ? JSON.parse(stored) : [];

      const index = draftsList.findIndex((d) => d.visitId === visitId);

      const updatedDraft: VisitWizardState = {
        visitId,
        routeCode: selectedRoute,
        customerCode: selectedCustomer, // stores cust_rt_id
        customerName: activeCustomer?.customerName || '',
        assets,
        photos,
        powerSkuResults,
        npdResponses,
        sosAsPerBda,
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
        cust_rt_id: selectedCustomer,
        assets: assets.map(a => ({
          ...a,
          tempInRange: getTempInRange(a.assetType, a.temperature)
        })),
        photos,
        powerSkuResults,
        npdResponses,
        sosAsPerBda,
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

      if (assets.some(a => a.temperature === undefined || a.temperature === null)) {
        showToast('Please record a temperature for all assets.', 'error');
        setSubmittingVisit(false);
        return;
      }

      const finalPayload = {
        visitId,
        cust_rt_id: selectedCustomer,
        assets: assets.map(a => ({
          ...a,
          tempInRange: getTempInRange(a.assetType, a.temperature)
        })),
        photos,
        powerSkuResults,
        npdResponses,
        sosAsPerBda,
        latitude,
        longitude,
        accuracy: accuracy || 0,
        status: 'Submitted' as const,
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

  const addAsset = () => {
    setAssets((prev) => [
      ...prev,
      {
        assetId: 'ast_' + Math.random().toString(36).substring(2, 9),
        visitId,
        assetType: 'Chiller',
        temperature: 0,
        tempInRange: true,
        actionRequired: 'None',
        observation: '',
      },
    ]);
  };

  const removeAsset = (assetId: string) => {
    if (assets.length <= 1) return;
    setAssets((prev) => prev.filter((a) => a.assetId !== assetId));
  };

  const updateAssetField = (assetId: string, field: keyof VisitAsset, value: any) => {
    setAssets((prev) =>
      prev.map((a) => (a.assetId === assetId ? { ...a, [field]: value } : a))
    );
  };

  // Filter customers by input search query
  const filteredCustomers = customers.filter((c) =>
    c.customerCode.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.customerName.toLowerCase().includes(customerSearch.toLowerCase())
  );

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
      <div className="space-y-4 card p-4">
        <div className="relative flex items-center justify-between w-full px-1 py-2">
          {/* Background track line */}
          <div 
            className="absolute left-4 right-4 h-[2px] z-0" 
            style={{ background: 'var(--border-soft)', top: '50%', transform: 'translateY(-50%)' }}
          />
          {/* Active progress track line */}
          <div 
            className="absolute left-4 h-[2px] z-0 transition-all duration-300"
            style={{ 
              background: 'var(--accent)', 
              top: '50%', 
              transform: 'translateY(-50%)',
              width: currentStep === 0 ? '0px' : `calc(${(currentStep / 7) * 100}% - 8px)`
            }}
          />
          
          {Array.from({ length: 8 }).map((_, i) => {
            const isActive = i === currentStep;
            const isCompleted = i < currentStep;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  if (isCompleted) {
                    setCurrentStep(i);
                  }
                }}
                className={`h-7 w-7 sm:h-8 sm:w-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold transition-all duration-200 z-10 relative cursor-pointer ${
                  isCompleted ? 'hover:scale-105' : ''
                }`}
                style={{
                  background: isActive 
                    ? 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)' 
                    : isCompleted 
                      ? 'var(--accent)' 
                      : 'var(--surface)',
                  color: isActive 
                    ? 'white' 
                    : isCompleted 
                      ? 'white' 
                      : 'var(--text-muted)',
                  border: `2px solid ${
                    isActive 
                      ? 'transparent' 
                      : isCompleted 
                        ? 'var(--accent)' 
                        : 'var(--border)'
                  }`,
                  boxShadow: isActive ? '0 0 10px rgba(79,70,229,0.4)' : 'none',
                  transform: isActive ? 'scale(1.15)' : 'scale(1)',
                }}
                title={STEP_NAMES[i]}
              >
                {isCompleted ? '✓' : i + 1}
              </button>
            );
          })}
        </div>

        {/* Step Info Card Header */}
        <div 
          className="p-3 rounded-lg flex items-center justify-between border border-solid border-[var(--border-soft)]"
          style={{ background: 'var(--surface-2)' }}
        >
          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Current Phase</p>
            <h3 className="text-[13px] font-extrabold text-[var(--text-primary)] leading-none">{STEP_NAMES[currentStep]}</h3>
          </div>
          <span 
            className="text-[10px] font-bold px-2.5 py-1 rounded-full text-white"
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
                <option key={r.routeCode} value={r.routeCode}>{r.routeCode} – {r.routeName} ({r.channel})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* STEP 1: CUSTOMER SELECT */}
      {currentStep === 1 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Outlet Selection</span>
          
          <div className="space-y-2">
            <label className="form-label">Search & Select Customer Outlet</label>
            <input
              type="text"
              placeholder="Type customer code or name to search..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="form-input"
            />
            
            <select 
              value={selectedCustomer} 
              onChange={(e) => setSelectedCustomer(e.target.value)} 
              className="form-input"
              size={5}
              style={{ height: 'auto', maxHeight: '180px' }}
            >
              <option value="">— Choose Customer —</option>
              {filteredCustomers.map((c) => (
                <option key={c.cust_rt_id} value={c.cust_rt_id}>{c.customerCode} – {c.customerName}</option>
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

      {/* STEP 2: POWER SKU CHECKLIST */}
      {currentStep === 2 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">Power SKU Checklist</span>
          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {powerSkus.length === 0 ? (
              <p className="text-[12px] italic text-center py-4" style={{ color: 'var(--text-muted)' }}>
                No Power SKUs configured for channel &quot;{activeCustomer?.channel}&quot;.
              </p>
            ) : (
              powerSkus.map((sku) => {
                const currentStatus = powerSkuResults[sku.skuCode] || 'Not Required';
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
                            onClick={() => setPowerSkuResults((prev) => ({ ...prev, [sku.skuCode]: opt }))}
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

      {/* STEP 3: NPD CHECKLIST */}
      {currentStep === 3 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <span className="badge badge-accent">NPD SKU Checklist</span>
          <div className="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
            {npdSkus.length === 0 ? (
              <p className="text-[12px] italic text-center py-4" style={{ color: 'var(--text-muted)' }}>No NPD SKUs configured.</p>
            ) : (
              npdSkus.map((sku) => {
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

      {/* STEP 4: CAPTURE ASSETS */}
      {currentStep === 4 && (
        <div className="card p-5 space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <span className="badge badge-accent">Asset Monitoring</span>
            <button
              type="button"
              onClick={addAsset}
              className="btn-ghost"
              style={{ color: 'var(--accent)', height: '32px', padding: '0 12px' }}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Asset</span>
            </button>
          </div>

          <div className="space-y-4">
            {assets.map((ast, idx) => {
              const inRange = getTempInRange(ast.assetType, ast.temperature);
              return (
                <div key={ast.assetId} className="p-4 rounded-xl space-y-4" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>Asset #{idx + 1}</span>
                    {assets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeAsset(ast.assetId)}
                        className="p-1 text-[var(--danger)] hover:bg-[var(--danger-light)] rounded-lg transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(['Chiller', 'Freezer'] as const).map(type => (
                      <button key={type} type="button" onClick={() => updateAssetField(ast.assetId, 'assetType', type)}
                        className="h-10 text-[11px] font-bold rounded-lg transition-all cursor-pointer"
                        style={{
                          background: ast.assetType === type ? 'var(--accent-light)' : 'var(--surface)',
                          color: ast.assetType === type ? 'var(--accent)' : 'var(--text-muted)',
                          border: `1px solid ${ast.assetType === type ? 'var(--accent)' : 'var(--border)'}`,
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label mb-1">Temp (°C)</label>
                      <input type="number" step="0.1" placeholder="e.g. 4.2" value={ast.temperature}
                        onChange={(e) => updateAssetField(ast.assetId, 'temperature', e.target.value !== '' ? Number(e.target.value) : 0)}
                        className="form-input font-mono h-9 text-[12px]" />
                    </div>
                    <div>
                      <label className="form-label mb-1">Mandatory Action Required</label>
                      <select value={ast.actionRequired} onChange={(e) => updateAssetField(ast.assetId, 'actionRequired', e.target.value)} className="form-input h-9 text-[12px]">
                        <option value="None">None</option>
                        <option value="Cleaning">Cleaning</option>
                        <option value="Repair">Repair</option>
                        <option value="Replacement">Replacement</option>
                        <option value="Gas Filling">Gas Filling</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="form-label mb-1">Observations / Notes</label>
                    <input type="text" placeholder="Write observation details…" value={ast.observation}
                      onChange={(e) => updateAssetField(ast.assetId, 'observation', e.target.value)}
                      className="form-input h-9 text-[12px]" />
                  </div>

                  {/* Temperature Warning banner */}
                  {!inRange && (
                    <div className="flex gap-2 p-3 rounded-lg animate-slide-up" style={{ background: 'var(--danger-light)', border: '1px solid rgba(220,38,38,0.15)' }}>
                      <AlertTriangle className="h-4 w-4 text-[var(--danger)] mt-0.5" />
                      <div>
                        <p className="text-[11px] font-bold" style={{ color: 'var(--danger)' }}>Temperature Breach Warning</p>
                        <p className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>Rule: Chiller [0 to 8°C] | Freezer [Below -15°C]</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-xl text-[11px]" style={{ background: 'var(--surface-2)', color: 'var(--text-muted)', border: '1px solid var(--border-soft)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>Range Rules:</strong> Chiller: <span style={{ color: 'var(--accent)' }}>0°C to 8°C</span> · Freezer: <span style={{ color: '#7C3AED' }}>Below -15°C</span>
          </div>

          {/* SOS option if MT */}
          {activeCustomer && activeCustomer.channel.toUpperCase() === 'MT' && (
            <div className="p-4 rounded-xl space-y-3" style={{ background: 'var(--surface-2)', border: '1px solid var(--border-soft)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[12px] font-bold" style={{ color: 'var(--text-primary)' }}>Modern Trade SOS Check</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Is Share of Shelf (SOS) compliant with BDA guidelines?</p>
                </div>
                <div className="flex items-center gap-2">
                  {[true, false].map((v) => {
                    const isChecked = sosAsPerBda === v;
                    const label = v ? 'Compliant' : 'Non-Compliant';
                    const col = v ? 'var(--success)' : 'var(--danger)';
                    const bg = v ? 'var(--success-light)' : 'var(--danger-light)';
                    return (
                      <button key={label} type="button" onClick={() => setSosAsPerBda(v)}
                        className="h-8 px-3 text-[10px] font-bold rounded-lg cursor-pointer transition-all"
                        style={{
                          background: isChecked ? bg : 'var(--surface)',
                          color: isChecked ? col : 'var(--text-muted)',
                          border: `1px solid ${isChecked ? col : 'var(--border)'}`
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 5: CAPTURE PHOTOS */}
      {currentStep === 5 && (
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

      {/* STEP 6: GPS SYNC */}
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
              ['Customer Outlet', activeCustomer ? `${activeCustomer.customerCode} - ${activeCustomer.customerName}` : '—', 'bold'],
              ['Classification', activeCustomer?.classification || '—', 'accent'],
              ['Channel', activeCustomer?.channel || '—', 'accent'],
              ['Assets Monitored', `${assets.length} items`, 'bold'],
              ['GPS Status', 'Acquired ✓', 'success'],
              ['Photos Captured', `${photos.length} images`, 'bold'],
              ['Power SKUs checked', `${Object.keys(powerSkuResults).length} items`, 'mono'],
              ['NPD SKUs checked', `${Object.keys(npdResponses).length} items`, 'mono'],
              ...(activeCustomer?.channel.toUpperCase() === 'MT' ? [['SOS Compliant', sosAsPerBda === null ? '—' : (sosAsPerBda ? 'Yes ✓' : 'No ⚠'), sosAsPerBda ? 'success' : 'danger']] : [])
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

      {/* Wizard Navigation Footer */}
      <div
        className="flex items-center justify-between gap-4 p-4 rounded-xl border border-solid border-[var(--border-soft)] mt-4"
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <button
          onClick={prevStep}
          disabled={currentStep === 0 || savingDraft || submittingVisit}
          className="btn-ghost cursor-pointer"
          style={{ height: '40px', padding: '0 16px', opacity: currentStep === 0 ? 0.35 : 1 }}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </button>
        {currentStep < 7 && (
          <button
            onClick={nextStep}
            disabled={savingDraft || submittingVisit || (currentStep === 0 && !selectedRoute) || (currentStep === 1 && !selectedCustomer) || (currentStep === 6 && (gpsLoading || !latitude))}
            className="btn-primary cursor-pointer"
            style={{
              height: '40px', padding: '0 20px',
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
