'use client';

import React, { useEffect } from 'react';
import { AlertOctagon, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected client-side error to console for debugging
    console.error('Unhandled Application Error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="card max-w-md w-full p-8 flex flex-col items-center shadow-xl border border-red-500/20 bg-slate-900/90 backdrop-blur-md rounded-2xl">
        <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center mb-5 text-red-500 border border-red-500/20">
          <AlertOctagon className="h-8 w-8" />
        </div>

        <h1 className="text-xl font-bold text-slate-100 mb-2">
          Something Went Wrong
        </h1>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {error.message || 'An unexpected application error occurred while loading this page. Don\'t worry, your data is safe.'}
        </p>

        {error.digest && (
          <div className="mb-6 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-500">
            Error Ref ID: {error.digest}
          </div>
        )}

        <div className="flex items-center gap-3 w-full">
          <button
            onClick={() => reset()}
            className="btn-primary flex-1 justify-center py-2.5"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </button>

          <Link href="/" className="btn-ghost flex-1 justify-center py-2.5 text-slate-300 border border-slate-700">
            <Home className="h-4 w-4 mr-2" />
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
