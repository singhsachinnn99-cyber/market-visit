'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginInput } from '@/schemas/auth';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/toast';
import { Eye, EyeOff, ShieldAlert, Lock, Mail, ChevronRight } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check searchParams for status errors (e.g. inactive)
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'Inactive') {
      setErrorMsg('Your account is currently disabled. Please contact your administrator.');
      showToast('Your account is inactive.', 'error');
    }
  }, [searchParams, showToast]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (res?.error) {
        let msg = 'Invalid email or password.';
        if (res.error.includes('inactive')) {
          msg = 'Your account is inactive. Please contact the administrator.';
        } else if (res.error.includes('No user found')) {
          msg = 'No supervisor account matches this email.';
        }
        setErrorMsg(msg);
        showToast(msg, 'error');
      } else {
        showToast('Login successful! Redirecting...', 'success');
        router.push('/');
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg('An unexpected error occurred. Please try again.');
      showToast('Login failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col justify-center items-center px-6 bg-[#F8FAFC] dark:bg-slate-950 relative overflow-hidden select-none">
      
      {/* Decorative ambient radial glows in background */}
      <div className="absolute top-[-10%] right-[-10%] h-[400px] w-[400px] rounded-full bg-[#5B5CEB]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] h-[400px] w-[400px] rounded-full bg-[#5B5CEB]/5 blur-[120px] pointer-events-none" />

      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 border border-[#E2E8F0] dark:border-slate-800 p-8 z-10 transition-all duration-300 relative"
        style={{
          borderRadius: '24px',
          boxShadow: '0 8px 30px rgba(15,23,42,0.08)',
        }}
      >
        <div className="flex flex-col items-center mb-8">
          {/* Authentication pill badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-[#5B5CEB]/25 bg-[#EEF2FF] dark:bg-blue-950/10 px-3.5 py-1.5 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-[#5B5CEB] animate-pulse" />
            <span className="font-mono text-[9px] uppercase tracking-[0.12em] font-bold text-[#5B5CEB] dark:text-blue-400">
              Authentication Required
            </span>
          </div>

          <h1 className="text-[28px] font-extrabold tracking-tight text-gray-900 dark:text-white text-center leading-none">
            Field Visit <span className="text-[#5B5CEB]">Management</span>
          </h1>
          <p className="text-gray-500 dark:text-slate-400 text-[13px] mt-2 text-center max-w-[280px] leading-normal font-medium">
            Enter supervisor or administrator credentials to access your console.
          </p>
        </div>

        {errorMsg && (
          <div className="mb-6 flex items-start gap-2.5 p-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 text-[#EF4444] rounded-2xl text-[13px] leading-relaxed font-semibold">
            <ShieldAlert className="h-4.5 w-4.5 flex-shrink-0 mt-0.5 text-[#EF4444]" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">
              Email / Login ID
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400">
                <Mail className="h-5 w-5" />
              </span>
              <input
                id="email"
                type="email"
                placeholder="name@company.com"
                disabled={loading}
                {...register('email')}
                className="w-full pl-11 pr-4 bg-white dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl text-gray-900 dark:text-white text-[14px] outline-none transition-all placeholder:text-gray-400/70 focus:border-[#5B5CEB] focus:ring-1 focus:ring-[#5B5CEB] disabled:opacity-50"
                style={{ height: '52px' }}
              />
            </div>
            {errors.email && (
              <p className="text-[#EF4444] text-[12px] font-semibold mt-1 ml-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider pl-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-gray-400">
                <Lock className="h-5 w-5" />
              </span>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                disabled={loading}
                {...register('password')}
                className="w-full pl-11 pr-11 bg-white dark:bg-slate-950 border border-[#E2E8F0] dark:border-slate-800 rounded-2xl text-gray-900 dark:text-white text-[14px] outline-none transition-all placeholder:text-gray-400/70 focus:border-[#5B5CEB] focus:ring-1 focus:ring-[#5B5CEB] disabled:opacity-50"
                style={{ height: '52px' }}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-[#EF4444] text-[12px] font-semibold mt-1 ml-1">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#5B5CEB] hover:bg-[#4C4BCE] text-white font-bold text-[13px] tracking-wider uppercase rounded-2xl shadow-[0_4px_16px_rgba(91,92,235,0.25)] hover:shadow-[0_6px_20px_rgba(91,92,235,0.35)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
            style={{ height: '52px' }}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ChevronRight className="h-4.5 w-4.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] dark:bg-slate-900 text-gray-700 dark:text-white font-bold text-sm">
        Loading Sign In...
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}

export const dynamic = 'force-dynamic';
