'use server';

import { auth } from '@/lib/auth';
import { routeRepository } from '@/repositories/route-repository';
import { customerRepository } from '@/repositories/customer-repository';
import { skuRepository } from '@/repositories/sku-repository';
import { parseExcelFile, ParseExcelResult } from '@/utils/xlsx';
import { auditService } from '@/services/audit-service';
import { Route, Customer, CustomerRouteMapping, SKU, ImportSummary } from '@/types';

const verifyAdminSession = async () => {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  const user = session.user as any;
  if (user.role !== 'Admin') {
    throw new Error('Access denied. Administrator privileges required.');
  }
  if (user.status !== 'Active') {
    throw new Error('Your account is inactive.');
  }
  return session;
};

export async function validateExcelAction(formData: FormData) {
  await verifyAdminSession();
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error('No file uploaded');
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = parseExcelFile(buffer);
    return {
      success: true,
      routesCount: parsed.routes.data.length,
      customersCount: parsed.customers.data.length,
      mappingsCount: parsed.mappings.data.length,
      skusCount: parsed.skus.data.length,
      routesPreview: parsed.routes.data.slice(0, 5),
      customersPreview: parsed.customers.data.slice(0, 5),
      mappingsPreview: parsed.mappings.data.slice(0, 5),
      skusPreview: parsed.skus.data.slice(0, 5),
      errors: [
        ...parsed.routes.errors,
        ...parsed.customers.errors,
        ...parsed.mappings.errors,
        ...parsed.skus.errors,
      ],
      payload: {
        routes: parsed.routes.data,
        customers: parsed.customers.data,
        mappings: parsed.mappings.data,
        skus: parsed.skus.data,
      },
    };
  } catch (error: any) {
    throw new Error(`Failed to parse spreadsheet: ${error.message}`);
  }
}

export async function importExcelAction(payload: {
  routes: Route[];
  customers: Customer[];
  mappings: CustomerRouteMapping[];
  skus: SKU[];
}): Promise<ImportSummary> {
  const session = await verifyAdminSession();
  const { routes, customers, mappings, skus } = payload;

  let inserted = 0;
  let updated = 0;
  let removed = 0;
  const failed = 0;
  const errors: { row: number; error: string }[] = [];

  try {
    // 1. Import Routes
    if (routes.length > 0) {
      const res = await routeRepository.upsertRoutes(routes);
      inserted += res.inserted;
      updated += res.updated;
      // Remove routes not present in this import file
      const activeCodes = routes.map((r) => r.routeCode);
      const deletedCount = await routeRepository.clearObsoleteRoutes(activeCodes);
      removed += deletedCount;
    }

    // 2. Import Customers
    if (customers.length > 0) {
      const res = await customerRepository.upsertCustomers(customers);
      inserted += res.inserted;
      updated += res.updated;
      // Remove customers not present
      const activeCodes = customers.map((c) => c.customerCode);
      const deletedCount = await customerRepository.clearObsoleteCustomers(activeCodes);
      removed += deletedCount;
    }

    // 3. Import Customer-Route Mappings
    if (mappings.length > 0) {
      const res = await customerRepository.upsertMappings(mappings);
      inserted += res.inserted;
      updated += res.updated;
      // Remove mappings not present
      const activeIds = mappings.map((m) => m.id);
      const deletedCount = await customerRepository.clearObsoleteMappings(activeIds);
      removed += deletedCount;
    }

    // 4. Import SKUs
    if (skus.length > 0) {
      const res = await skuRepository.upsertSkus(skus);
      inserted += res.inserted;
      updated += res.updated;
      // Remove SKUs not present
      const activeCodes = skus.map((s) => s.skuCode);
      const deletedCount = await skuRepository.clearObsoleteSkus(activeCodes);
      removed += deletedCount;
    }

    const adminUser = session.user?.email || 'Admin';
    await auditService.logAction(
      adminUser,
      'Excel Master Import',
      `Imported masters. Totals: Inserted: ${inserted}, Updated: ${updated}, Removed: ${removed}`
    );

    return {
      inserted,
      updated,
      removed,
      failed,
      errors,
    };
  } catch (error: any) {
    console.error('Import action failed:', error);
    throw new Error(`Master Data Import failed: ${error.message}`);
  }
}
