'use server';

import { auth } from '@/lib/auth';
import { routeRepository } from '@/repositories/route-repository';
import { customerRepository } from '@/repositories/customer-repository';
import { skuRepository } from '@/repositories/sku-repository';
import { parseSingleFile, mergeParsedData } from '@/utils/xlsx';
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

  const fileKeys = [
    { key: 'routeMaster', name: 'ROUTE MASTER.xlsx', type: 'routes' as const, required: true },
    { key: 'custMaster', name: 'CUSTMASTER.xlsx', type: 'custMappings' as const, required: true },
    { key: 'skuMaster', name: 'SKUMASTER.xlsx', type: 'skuMaster' as const, required: true },
    { key: 'classification', name: 'Customer_Classification_DUMMY.xlsx', type: 'classification' as const, required: true },
    { key: 'powerSkuMaster', name: 'PowerSku_Master_DUMMY.xlsx', type: 'skuMaster' as const, required: false },
  ];

  const parsedResults: any[] = [];
  const errors: { row: number; error: string }[] = [];

  for (const fk of fileKeys) {
    const file = formData.get(fk.key) as File | null;
    if (!file || file.size === 0) {
      if (fk.required) {
        errors.push({ row: 0, error: `Required file "${fk.name}" was not selected.` });
      }
      continue;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const res = parseSingleFile(buffer, file.name, fk.type);
      parsedResults.push(res);
    } catch (error: any) {
      errors.push({ row: 0, error: `${file.name}: Parsing failed - ${error.message}` });
    }
  }

  if (errors.length > 0) {
    return {
      success: true,
      routesCount: 0,
      customersCount: 0,
      mappingsCount: 0,
      skusCount: 0,
      routesPreview: [],
      customersPreview: [],
      mappingsPreview: [],
      skusPreview: [],
      errors,
      payload: { routes: [], customers: [], mappings: [], skus: [] },
    };
  }

  const merged = mergeParsedData(parsedResults);

  return {
    success: true,
    routesCount: merged.payload.routes.length,
    customersCount: merged.payload.customers.length,
    mappingsCount: merged.payload.mappings.length,
    skusCount: merged.payload.skus.length,
    routesPreview: merged.payload.routes.slice(0, 5),
    customersPreview: merged.payload.customers.slice(0, 5),
    mappingsPreview: merged.payload.mappings.slice(0, 5),
    skusPreview: merged.payload.skus.slice(0, 5),
    errors: merged.errors,
    payload: merged.payload,
  };
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
