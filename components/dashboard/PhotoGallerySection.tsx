'use client';

import React, { useState, useMemo } from 'react';
import { Camera, Calendar, User, MapPin, Store, Tag, X, ExternalLink, Image as ImageIcon } from 'lucide-react';

export interface DashboardPhoto {
  photoId: string;
  visitId: string;
  category: string;
  cloudinaryUrl: string;
  uploadedAt: string;
  supervisor: string;
  manager: string;
  outlet: string;
  route: string;
  channel: string;
}

interface PhotoGallerySectionProps {
  photos: DashboardPhoto[];
  fFrom?: string;
  fTo?: string;
  fMgr?: string;
  fSuper?: string;
  fChannel?: string;
  fCust?: string;
  fRoute?: string;
}

export function PhotoGallerySection({
  photos,
  fFrom,
  fTo,
  fMgr,
  fSuper,
  fChannel,
  fCust,
  fRoute,
}: PhotoGallerySectionProps) {
  const [selectedPhoto, setSelectedPhoto] = useState<DashboardPhoto | null>(null);

  // Filter photos based on active dashboard filters
  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      const pDate = new Date(p.uploadedAt);
      const from = fFrom ? new Date(`${fFrom}T00:00:00`) : null;
      const to = fTo ? new Date(`${fTo}T23:59:59`) : null;

      const fromOk = !from || pDate >= from;
      const toOk = !to || pDate <= to;
      const mgrOk = !fMgr || p.manager.toUpperCase() === fMgr.toUpperCase();
      const superOk = !fSuper || p.supervisor.toUpperCase() === fSuper.toUpperCase();
      const channelOk = !fChannel || p.channel === fChannel;
      const outletOk = !fCust || p.outlet.toLowerCase().includes(fCust.toLowerCase());
      const routeOk = !fRoute || (p.route && p.route.toUpperCase() === fRoute.toUpperCase());

      return fromOk && toOk && mgrOk && superOk && channelOk && outletOk && routeOk;
    });
  }, [photos, fFrom, fTo, fMgr, fSuper, fChannel, fCust, fRoute]);

  const getCategoryColor = (category: string) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('dairy')) return { bg: 'rgba(59, 130, 246, 0.15)', text: '#3b82f6', border: 'rgba(59, 130, 246, 0.3)' };
    if (cat.includes('beverage')) return { bg: 'rgba(16, 185, 129, 0.15)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' };
    if (cat.includes('ice')) return { bg: 'rgba(168, 85, 247, 0.15)', text: '#a855f7', border: 'rgba(168, 85, 247, 0.3)' };
    return { bg: 'rgba(245, 158, 11, 0.15)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' };
  };

  return (
    <div className="card p-5 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border-soft)]">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-accent/10 text-accent">
            <Camera className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Audit Photo Gallery
            </h3>
            <p className="text-xs text-[var(--text-muted)]">
              Real-time audit attachments captured during market visits ({filteredPhotos.length} photo{filteredPhotos.length === 1 ? '' : 's'})
            </p>
          </div>
        </div>

        <div className="text-xs font-medium px-3 py-1.5 rounded-full bg-[var(--surface-2)] text-[var(--text-secondary)] border border-[var(--border)] self-start sm:self-auto">
          {fFrom || fTo ? `Filtered: ${fFrom || 'Start'} to ${fTo || 'Today'}` : 'All Dates'}
        </div>
      </div>

      {/* Grid */}
      {filteredPhotos.length === 0 ? (
        <div className="py-12 text-center text-[var(--text-muted)] space-y-2">
          <ImageIcon className="h-10 w-10 mx-auto opacity-40" />
          <p className="text-sm font-medium">No audit photos found matching the selected filters.</p>
          <p className="text-xs opacity-75">Try expanding your date range or clearing specific manager/supervisor filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => {
            const catStyle = getCategoryColor(photo.category);
            const dateObj = new Date(photo.uploadedAt);
            const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const formattedTime = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={photo.photoId}
                onClick={() => setSelectedPhoto(photo)}
                className="group relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col"
              >
                {/* Image Aspect Box */}
                <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                  <img
                    src={photo.cloudinaryUrl}
                    alt={photo.category}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {/* Category Pill Overlay */}
                  <div
                    className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md shadow-sm"
                    style={{
                      backgroundColor: catStyle.bg,
                      color: catStyle.text,
                      border: `1px solid ${catStyle.border}`,
                    }}
                  >
                    {photo.category || 'Attachment'}
                  </div>

                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm flex items-center gap-1.5">
                      <ExternalLink className="h-3.5 w-3.5" /> View Larger
                    </span>
                  </div>
                </div>

                {/* Details Footer */}
                <div className="p-3 space-y-1.5 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate flex items-center gap-1.5">
                      <Store className="h-3.5 w-3.5 text-[var(--accent)] flex-shrink-0" />
                      <span className="truncate">{photo.outlet}</span>
                    </p>
                    <p className="text-[11px] text-[var(--text-secondary)] truncate flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-[var(--text-muted)] flex-shrink-0" />
                      <span>Sup: {photo.supervisor} ({photo.manager})</span>
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[var(--border-soft)] flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Route: {photo.route || 'N/A'}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Calendar className="h-3 w-3" /> {formattedDate} {formattedTime}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox Dialog Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-md transition-opacity"
            onClick={() => setSelectedPhoto(null)}
          />

          <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-10 animate-slide-up flex flex-col md:flex-row max-h-[90vh]">
            {/* Image View */}
            <div className="flex-1 bg-black flex items-center justify-center p-4 min-h-[300px] max-h-[60vh] md:max-h-[90vh]">
              <img
                src={selectedPhoto.cloudinaryUrl}
                alt={selectedPhoto.category}
                className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
              />
            </div>

            {/* Details Panel */}
            <div className="w-full md:w-80 p-6 bg-slate-900 border-t md:border-t-0 md:border-l border-slate-800 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/20">
                    {selectedPhoto.category || 'Audit Photo'}
                  </span>
                  <button
                    onClick={() => setSelectedPhoto(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Outlet Name</label>
                    <p className="text-sm font-semibold text-slate-100">{selectedPhoto.outlet}</p>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Supervisor & Manager</label>
                    <p className="text-sm font-semibold text-slate-200">{selectedPhoto.supervisor} <span className="text-slate-400">({selectedPhoto.manager})</span></p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Route</label>
                      <p className="text-xs font-mono font-medium text-slate-300">{selectedPhoto.route || 'N/A'}</p>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Channel</label>
                      <p className="text-xs font-medium text-slate-300">{selectedPhoto.channel || 'GT'}</p>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Date & Time</label>
                    <p className="text-xs font-mono text-slate-300">
                      {new Date(selectedPhoto.uploadedAt).toLocaleString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase tracking-wider font-bold text-slate-500">Visit Ref ID</label>
                    <p className="text-[11px] font-mono text-slate-400 break-all">{selectedPhoto.visitId}</p>
                  </div>
                </div>
              </div>

              <a
                href={selectedPhoto.cloudinaryUrl}
                target="_blank"
                rel="noreferrer"
                className="btn-primary w-full justify-center py-2.5 text-xs"
              >
                <ExternalLink className="h-4 w-4 mr-2" /> Open Full HD Image
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
