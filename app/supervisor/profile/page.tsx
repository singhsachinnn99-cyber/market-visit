import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { userRepository } from '@/repositories/user-repository';
import { LogOut, Shield } from 'lucide-react';
import InfoRowsClient from './InfoRowsClient';
import BackHeader from '@/app/supervisor/components/BackHeader';

export default async function SupervisorProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const sessionUser = session.user as any;
  const user = await userRepository.getUserByEmail(sessionUser.email);

  if (!user) {
    return (
      <div className="card p-8 text-center" style={{ color: 'var(--text-muted)' }}>
        Profile data unavailable.
      </div>
    );
  }

  const initial = user.name.charAt(0).toUpperCase();

  return (
    <div className="mx-auto px-4 sm:px-6 max-w-lg space-y-4 pb-6">
      <BackHeader title="Profile" hideBack />

      {/* Avatar Card */}
      <div className="card overflow-hidden">
        {/* Gradient header banner */}
        <div
          className="h-24 sm:h-20"
          style={{ background: 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)' }}
        />
        {/* Avatar positioned over banner */}
        <div className="px-6 pb-5 -mt-8">
          <div
            className="h-20 w-20 sm:h-16 sm:w-16 rounded-2xl flex items-center justify-center text-[24px] font-bold text-white mb-3"
            style={{
              background: 'var(--surface)',
              border: '3px solid var(--surface)',
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              backgroundImage: 'linear-gradient(135deg, var(--accent) 0%, #7C3AED 100%)',
            }}
          >
            {initial}
          </div>
          <h2 className="text-[20px] sm:text-[18px] font-bold" style={{ color: 'var(--text-primary)' }}>{user.name}</h2>
          <p className="font-mono text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{user.employeeCode}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className={`badge ${user.role === 'Admin' ? 'badge-accent' : 'badge-success'}`}>{user.role}</span>
            <span className={`badge ${user.status === 'Active' ? 'badge-success' : 'badge-warning'}`}>{user.status}</span>
          </div>
        </div>
      </div>

      {/* Info Rows */}
      <div className="card overflow-hidden">
        <InfoRowsClient
          rows={[
            { icon: 'Mail', color: 'var(--accent)', bg: 'var(--accent-light)', label: 'Email Address', value: user.email },
            { icon: 'Phone', color: '#059669', bg: '#ECFDF5', label: 'Mobile Number', value: user.mobile || 'Not configured' },
            { icon: 'Calendar', color: '#D97706', bg: '#FFFBEB', label: 'Member Since', value: new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) },
            { icon: 'UserCheck', color: '#7C3AED', bg: '#F5F3FF', label: 'Privileges', value: 'Route selection · Image capture · Temperature checks · SKU checklists' },
          ]}
        />
      </div>

      {/* Security */}
      <div className="card overflow-hidden">
        <div className="flex items-start gap-4 px-5 py-4">
          <div className="icon-wrap h-9 w-9 rounded-lg flex-shrink-0" style={{ background: 'var(--surface-2)' }}>
            <Shield className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          </div>
          <div>
            <p className="form-label mb-0.5">Account Security</p>
            <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Your session is secured. Contact your admin to change your password or update account details.
            </p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="card p-4">
        <form action="/api/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full py-3 rounded-xl text-[13px] font-bold flex items-center justify-center gap-2 transition-all active:scale-98"
            style={{
              background: 'var(--danger-light)',
              color: 'var(--danger)',
              border: '1px solid rgba(220,38,38,0.15)',
            }}
          >
            <LogOut className="h-4 w-4" />
            Log Out of Account
          </button>
        </form>
      </div>
    </div>
  );
}

export const dynamic = 'force-dynamic';
