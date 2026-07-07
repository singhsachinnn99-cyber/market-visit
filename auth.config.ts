import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const user = auth?.user as any;
      const isAuthRoute = nextUrl.pathname.startsWith('/login');
      const isAdminRoute = nextUrl.pathname.startsWith('/admin');
      const isSupervisorRoute = nextUrl.pathname.startsWith('/supervisor');

      // Exclude API routes from middleware redirect logic to let routes check tokens internally
      if (nextUrl.pathname.startsWith('/api') && !nextUrl.pathname.startsWith('/api/auth')) {
        return true;
      }

      if (isAuthRoute) {
        if (isLoggedIn) {
          if (user?.status !== 'Active') {
            return true; // Let them hit login to see inactive error
          }
          const destination = user?.role === 'Admin' ? '/admin' : '/supervisor';
          return Response.redirect(new URL(destination, nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        return false; // Redirects to signIn page
      }

      // Check Status
      if (user?.status !== 'Active') {
        const url = new URL('/login', nextUrl);
        url.searchParams.set('error', 'Inactive');
        return Response.redirect(url);
      }

      if (isAdminRoute && user?.role !== 'Admin') {
        return Response.redirect(new URL('/supervisor', nextUrl));
      }

      if (isSupervisorRoute && user?.role !== 'Supervisor') {
        return Response.redirect(new URL('/admin', nextUrl));
      }

      // Root path routing
      if (nextUrl.pathname === '/') {
        const destination = user?.role === 'Admin' ? '/admin' : '/supervisor';
        return Response.redirect(new URL(destination, nextUrl));
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as any;
        token.id = u.id;
        token.role = u.role;
        token.employeeCode = u.employeeCode;
        token.status = u.status;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as any;
        (session.user as any).employeeCode = token.employeeCode as string;
        (session.user as any).status = token.status as any;
      }
      return session;
    },
  },
  providers: [], // Added in lib/auth.ts
} satisfies NextAuthConfig;
