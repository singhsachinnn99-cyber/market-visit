import * as xlsx from 'xlsx';
import { Route, Customer, CustomerRouteMapping, SKU } from '@/types';
import {
  routeImportSchema,
  customerImportSchema,
  customerRouteMappingImportSchema,
  skuImportSchema,
} from '@/schemas/import';

export interface ParseExcelResult {
  routes: { data: Route[]; errors: { row: number; error: string }[] };
  customers: { data: Customer[]; errors: { row: number; error: string }[] };
  mappings: { data: CustomerRouteMapping[]; errors: { row: number; error: string }[] };
  skus: { data: SKU[]; errors: { row: number; error: string }[] };
}

export const parseExcelFile = (buffer: Buffer): ParseExcelResult => {
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  
  const result: ParseExcelResult = {
    routes: { data: [], errors: [] },
    customers: { data: [], errors: [] },
    mappings: { data: [], errors: [] },
    skus: { data: [], errors: [] },
  };

  // Helper to extract sheet data
  const getSheetRows = (sheetName: string): any[] => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return xlsx.utils.sheet_to_json(sheet);
  };

  // 1. Parse Routes
  const routeRows = getSheetRows('Routes');
  routeRows.forEach((row, index) => {
    const rowNum = index + 2; // header is row 1
    const parsed = routeImportSchema.safeParse(row);
    if (parsed.success) {
      result.routes.data.push({
        routeCode: parsed.data.RouteCode,
        routeName: parsed.data.RouteName,
      });
    } else {
      result.routes.errors.push({
        row: rowNum,
        error: `Routes: ${parsed.error.issues.map((e) => e.message).join(', ')}`,
      });
    }
  });

  // 2. Parse Customers
  const customerRows = getSheetRows('Customers');
  customerRows.forEach((row, index) => {
    const rowNum = index + 2;
    const parsed = customerImportSchema.safeParse(row);
    if (parsed.success) {
      result.customers.data.push({
        customerCode: parsed.data.CustomerCode,
        customerName: parsed.data.CustomerName,
        classification: parsed.data.Classification,
        channel: parsed.data.Channel,
      });
    } else {
      result.customers.errors.push({
        row: rowNum,
        error: `Customers: ${parsed.error.issues.map((e) => e.message).join(', ')}`,
      });
    }
  });

  // 3. Parse Customer Route Mappings
  const mappingRows = getSheetRows('CustomerRouteMapping');
  mappingRows.forEach((row, index) => {
    const rowNum = index + 2;
    const parsed = customerRouteMappingImportSchema.safeParse(row);
    if (parsed.success) {
      const code = parsed.data.CustomerCode;
      const route = parsed.data.RouteCode;
      result.mappings.data.push({
        id: `${code}_${route}`,
        customerCode: code,
        routeCode: route,
      });
    } else {
      result.mappings.errors.push({
        row: rowNum,
        error: `CustomerRouteMapping: ${parsed.error.issues.map((e) => e.message).join(', ')}`,
      });
    }
  });

  // 4. Parse SKUs
  const skuRows = getSheetRows('SKUs');
  skuRows.forEach((row, index) => {
    const rowNum = index + 2;
    const parsed = skuImportSchema.safeParse(row);
    if (parsed.success) {
      result.skus.data.push({
        skuCode: parsed.data.SKUCode,
        skuName: parsed.data.SKUName,
      });
    } else {
      result.skus.errors.push({
        row: rowNum,
        error: `SKUs: ${parsed.error.issues.map((e) => e.message).join(', ')}`,
      });
    }
  });

  return result;
};
export type ParseExcelFile = typeof parseExcelFile;
export type ParseExcelResultType = ParseExcelResult;
