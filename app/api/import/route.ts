import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { routeRepository } from '@/repositories/route-repository';
import { customerRepository } from '@/repositories/customer-repository';
import { skuRepository } from '@/repositories/sku-repository';
import { auditService } from '@/services/audit-service';
import { ImportSummary } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user as any;
    if (user.role !== 'Admin' || user.status !== 'Active') {
      return NextResponse.json({ error: 'Access denied. Admin role required.' }, { status: 403 });
    }

    const payload = await req.json();
    const { routes, customers, mappings, skus, clearObsolete } = payload;
    const shouldClear = clearObsolete !== false;

    let inserted = 0;
    let updated = 0;
    let removed = 0;
    const failed = 0;
    const errors: { row: number; error: string }[] = [];

    // 1. Import Routes
    if (routes && routes.length > 0) {
      const res = await routeRepository.upsertRoutes(routes);
      inserted += res.inserted;
      updated += res.updated;
      if (shouldClear) {
        const activeCodes = routes.map((r: any) => r.routeCode);
        const deletedCount = await routeRepository.clearObsoleteRoutes(activeCodes);
        removed += deletedCount;
      }
    }

    // 2. Import Customers
    if (customers && customers.length > 0) {
      const res = await customerRepository.upsertCustomers(customers);
      inserted += res.inserted;
      updated += res.updated;
      if (shouldClear) {
        const activeCodes = customers.map((c: any) => c.customerCode);
        const deletedCount = await customerRepository.clearObsoleteCustomers(activeCodes);
        removed += deletedCount;
      }
    }

    // 3. Import mappings
    if (mappings && mappings.length > 0) {
      const res = await customerRepository.upsertMappings(mappings);
      inserted += res.inserted;
      updated += res.updated;
      if (shouldClear) {
        const activeIds = mappings.map((m: any) => m.id);
        const deletedCount = await customerRepository.clearObsoleteMappings(activeIds);
        removed += deletedCount;
      }
    }

    // 4. Import SKUs
    if (skus && skus.length > 0) {
      const res = await skuRepository.upsertSkus(skus);
      inserted += res.inserted;
      updated += res.updated;
      if (shouldClear) {
        const activeCodes = skus.map((s: any) => s.skuCode);
        const deletedCount = await skuRepository.clearObsoleteSkus(activeCodes);
        removed += deletedCount;
      }
    }

    await auditService.logAction(
      user.email,
      'API Master Import',
      `Imported: Inserted: ${inserted}, Updated: ${updated}, Removed: ${removed}`
    );

    const summary: ImportSummary = {
      inserted,
      updated,
      removed,
      failed,
      errors,
    };

    return NextResponse.json(summary);
  } catch (error: any) {
    console.error('API Import error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
