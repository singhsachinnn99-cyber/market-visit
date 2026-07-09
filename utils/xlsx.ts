import * as xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { Route, Customer, CustomerRouteMapping, SKU, PowerSKU } from '@/types';

export interface ParseExcelResult {
  routes: Route[];
  customers: Customer[];
  mappings: CustomerRouteMapping[];
  skus: SKU[];
  powerSkus: PowerSKU[];
}

export interface ParsedFileResult {
  fileName: string;
  sheetName: string;
  type: 'routes' | 'custMappings' | 'skuMaster' | 'classification' | 'powerSkus' | null;
  data: any[];
  headers: string[];
  mapping: Record<string, string>;
  errors: { row: number; error: string }[];
}

const CONFIG_PATH = path.join(process.cwd(), 'data', 'import-mappings.json');

const DEFAULT_MAPPINGS: Record<string, string[]> = {
  RouteCode: ['routecode', 'routeid', 'rtcode', 'code', 'routeno', 'route_code'],
  RouteName: ['routename', 'routeid', 'rtname', 'name', 'description', 'routedesc', 'route_name'],
  CustomerCode: ['customercode', 'customerid', 'custcode', 'custid', 'customer_code'],
  CustomerName: ['customername', 'customerdesc', 'custname', 'outletname', 'outletdesc', 'customer_name'],
  SKUCode: ['skucode', 'skuid', 'itemcode', 'itemid', 'materialcode', 'materialid', 'sku_code'],
  SKUName: ['skuname', 'skudesc', 'itemname', 'itemdesc', 'materialname', 'materialdesc', 'sku_name'],
  Classification: ['classification', 'class', 'grade', 'category', 'class_code'],
  Channel: ['channel', 'subchannel', 'tradechannel', 'marketsegment', 'sub_channel', 'segment/channel', 'segment_channel', 'segment'],
  Super: ['super', 'supervisor', 'supername', 'supervisorname', 'super_name'],
  Manager: ['manager', 'mgr', 'mngr', 'managername', 'manager_name'],
  Type: ['type', 'skutype', 'itemtype', 'sku_type', 'category_type'],
};

/**
 * Loads header mappings config from data/import-mappings.json or seeds defaults.
 */
export function loadMappingConfig(): Record<string, string[]> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error reading mappings config, falling back to defaults:', error);
  }

  try {
    const dataDir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_MAPPINGS, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving default mappings config:', error);
  }
  return DEFAULT_MAPPINGS;
}

/**
 * Normalizes string for matching (lowercase, strips all spaces and non-alphanumeric chars)
 */
function cleanString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Standard Levenshtein edit distance logic.
 */
function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Calculates a match score (0.0 to 1.0) between two strings using clean exact, substring, or fuzzy matching.
 */
function getSimilarity(a: string, b: string): number {
  const cleanA = cleanString(a);
  const cleanB = cleanString(b);
  if (cleanA === cleanB) return 1.0;
  if (cleanA.includes(cleanB) || cleanB.includes(cleanA)) return 0.8;

  const distance = getLevenshteinDistance(cleanA, cleanB);
  const maxLength = Math.max(cleanA.length, cleanB.length);
  if (maxLength === 0) return 1.0;
  return 1.0 - distance / maxLength;
}

/**
 * Finds the sheet header that matches the field and its configured aliases with the highest confidence.
 */
export function findBestHeaderMatch(
  headers: string[],
  field: string,
  aliases: string[]
): { header: string | null; score: number } {
  let bestHeader: string | null = null;
  let bestScore = 0;

  for (const header of headers) {
    const fieldScore = getSimilarity(header, field);
    if (fieldScore > bestScore) {
      bestScore = fieldScore;
      bestHeader = header;
    }
    for (const alias of aliases) {
      const aliasScore = getSimilarity(header, alias);
      if (aliasScore > bestScore) {
        bestScore = aliasScore;
        bestHeader = header;
      }
    }
  }

  return { header: bestHeader, score: bestScore };
}

/**
 * Evaluates available columns in a sheet to detect what required fields are missing for a target model type.
 */
export function checkMissingFields(
  headers: string[],
  type: 'routes' | 'custMappings' | 'skuMaster' | 'classification' | 'powerSkus'
): { missing: string[]; foundMapping: Record<string, string> } {
  const config = loadMappingConfig();
  const fields = {
    custMappings: ['CustomerCode', 'CustomerName', 'RouteCode'],
    classification: ['CustomerCode', 'Classification', 'Channel'],
    routes: ['RouteCode', 'RouteName', 'Super', 'Manager', 'Channel'],
    skuMaster: ['SKUCode', 'SKUName'],
    powerSkus: ['SKUCode', 'SKUName', 'Channel'],
  }[type];

  const missing: string[] = [];
  const foundMapping: Record<string, string> = {};

  for (const field of fields) {
    const aliases = config[field] || [];
    const { header, score } = findBestHeaderMatch(headers, field, aliases);
    if (score >= 0.6 && header) {
      foundMapping[field] = header;
    } else {
      missing.push(field);
    }
  }

  // Check optional fields too (like Type on skuMaster)
  if (type === 'skuMaster') {
    const aliases = config['Type'] || [];
    const { header, score } = findBestHeaderMatch(headers, 'Type', aliases);
    if (score >= 0.6 && header) {
      foundMapping['Type'] = header;
    }
  }

  return { missing, foundMapping };
}

/**
 * Loops through workbook sheets to find the worksheet that best matches the expected columns format.
 */
export function parseSingleFile(
  buffer: Buffer,
  fileName: string,
  expectedType: 'routes' | 'custMappings' | 'skuMaster' | 'classification' | 'powerSkus'
): ParsedFileResult {
  try {
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    let bestSheetName = workbook.SheetNames[0] || 'Unknown';
    let bestMapping: Record<string, string> = {};
    let minMissingCount = 999;
    let bestMissingList: string[] = [];
    let bestRows: any[] = [];
    let bestHeaders: string[] = [];

    // Evaluate columns of all sheets in workbook dynamically to find the correct sheet
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rawRows = xlsx.utils.sheet_to_json(sheet, { raw: false });
      if (rawRows.length === 0) continue;

      // Clean the rows so that keys (headers) and values are trimmed!
      const rows = rawRows.map((row: any) => {
        const cleanedRow: any = {};
        for (const [key, value] of Object.entries(row)) {
          const trimmedKey = String(key).trim();
          const trimmedValue = value !== undefined && value !== null ? String(value).trim() : '';
          cleanedRow[trimmedKey] = trimmedValue;
        }
        return cleanedRow;
      });

      const headers = Object.keys(rows[0] as object);
      const { missing, foundMapping } = checkMissingFields(headers, expectedType);

      if (missing.length < minMissingCount) {
        minMissingCount = missing.length;
        bestSheetName = sheetName;
        bestMapping = foundMapping;
        bestMissingList = missing;
        bestRows = rows;
        bestHeaders = headers;
      }
    }

    if (minMissingCount === 0) {
      return {
        fileName,
        sheetName: bestSheetName,
        type: expectedType,
        data: bestRows,
        headers: bestHeaders,
        mapping: bestMapping,
        errors: [],
      };
    }

    // Detailed missing column schema description error
    return {
      fileName,
      sheetName: bestSheetName,
      type: null,
      data: [],
      headers: bestHeaders,
      mapping: {},
      errors: [
        {
          row: 1,
          error: `${fileName} [Sheet: "${bestSheetName}"]: Missing required column(s): ${bestMissingList.join(', ')}. Available columns in sheet: ${bestHeaders.join(', ')}`,
        },
      ],
    };
  } catch (err: any) {
    return {
      fileName,
      sheetName: 'Unknown',
      type: null,
      data: [],
      headers: [],
      mapping: {},
      errors: [{ row: 0, error: `${fileName}: Error reading workbook - ${err.message}` }],
    };
  }
}

/**
 * Synchronizes and merges all independent parsed master lists.
 */
export function mergeParsedData(parsedFiles: ParsedFileResult[]): { payload: ParseExcelResult; errors: { row: number; error: string }[] } {
  const errors: { row: number; error: string }[] = [];
  const payload: ParseExcelResult = {
    routes: [],
    customers: [],
    mappings: [],
    skus: [],
    powerSkus: [],
  };

  const filesByType = {
    routes: [] as ParsedFileResult[],
    custMappings: [] as ParsedFileResult[],
    skuMaster: [] as ParsedFileResult[],
    classification: [] as ParsedFileResult[],
    powerSkus: [] as ParsedFileResult[],
  };

  parsedFiles.forEach(f => {
    errors.push(...f.errors);
    if (f.type) {
      filesByType[f.type].push(f);
    }
  });

  if (errors.length > 0) {
    return { payload, errors };
  }

  // 1. Process Routes
  filesByType.routes.forEach(f => {
    const routeCodeCol = f.mapping['RouteCode'];
    const routeNameCol = f.mapping['RouteName'];
    const superCol = f.mapping['Super'];
    const managerCol = f.mapping['Manager'];
    const channelCol = f.mapping['Channel'];

    f.data.forEach((row, index) => {
      const rowNum = index + 2;
      const routeCode = String(row[routeCodeCol] || '').trim();
      const routeName = String(row[routeNameCol] || '').trim();
      const superName = String(row[superCol] || '').trim();
      const managerName = String(row[managerCol] || '').trim();
      const channel = String(row[channelCol] || '').trim();

      // Skip rows where Supervisor = CLOSED or Manager = CLOSED
      if (superName.toUpperCase() === 'CLOSED' || managerName.toUpperCase() === 'CLOSED') {
        return;
      }

      if (!routeCode) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing RouteCode value.` });
      }
      if (!routeName) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing RouteName value.` });
      }

      if (routeCode && routeName) {
        payload.routes.push({
          routeCode,
          routeName,
          channel: channel.toUpperCase(), // Normalize channel casing
          superName, // transient mapping value
          managerName, // transient mapping value
        });
      }
    });
  });

  // 2. Process SKUs
  const skuMap = new Map<string, SKU>();
  filesByType.skuMaster.forEach(f => {
    const skuCodeCol = f.mapping['SKUCode'];
    const skuNameCol = f.mapping['SKUName'];
    const typeCol = f.mapping['Type'];

    f.data.forEach((row, index) => {
      const rowNum = index + 2;
      const skuCode = String(row[skuCodeCol] || '').trim();
      const skuName = String(row[skuNameCol] || '').trim();
      const typeVal = typeCol ? String(row[typeCol] || '').trim() : 'Standard';

      if (!skuCode) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing SKUCode value.` });
      }
      if (!skuName) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing SKUName value.` });
      }

      if (skuCode && skuName) {
        skuMap.set(skuCode, { skuCode, skuName, type: typeVal });
      }
    });
  });
  skuMap.forEach((sku) => {
    payload.skus.push(sku);
  });

  // 3. Process Customer Classification Details
  const classificationMap = new Map<string, { classification: string; channel: string }>();
  filesByType.classification.forEach(f => {
    const customerCodeCol = f.mapping['CustomerCode'];
    const classificationCol = f.mapping['Classification'];
    const channelCol = f.mapping['Channel'];

    f.data.forEach((row, index) => {
      const rowNum = index + 2;
      const customerCode = String(row[customerCodeCol] || '').trim();
      const classification = String(row[classificationCol] || '').trim();
      const channel = String(row[channelCol] || '').trim();

      if (!customerCode) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing CustomerCode value.` });
      }
      if (!classification) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing Classification value.` });
      }
      if (!channel) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing Channel value.` });
      }

      if (customerCode && classification && channel) {
        classificationMap.set(customerCode, { classification, channel: channel.toUpperCase() });
      }
    });
  });

  // 4. Process CUSTMASTER Customer mappings
  const customerNamesMap = new Map<string, { customerName: string; routeCodes: Set<string> }>();
  filesByType.custMappings.forEach(f => {
    const customerCodeCol = f.mapping['CustomerCode'];
    const customerNameCol = f.mapping['CustomerName'];
    const routeCodeCol = f.mapping['RouteCode'];

    f.data.forEach((row, index) => {
      const rowNum = index + 2;
      const customerCode = String(row[customerCodeCol] || '').trim();
      const customerName = String(row[customerNameCol] || '').trim();
      const routeCode = String(row[routeCodeCol] || '').trim();

      if (!customerCode) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing CustomerCode value.` });
      }
      if (!customerName) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing CustomerName value.` });
      }
      if (!routeCode) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing RouteCode value.` });
      }

      if (customerCode && customerName && routeCode) {
        const cust_rt_id = `${customerCode}|${routeCode}`;
        payload.mappings.push({
          cust_rt_id,
          customerCode,
          routeCode,
        });

        if (!customerNamesMap.has(customerCode)) {
          customerNamesMap.set(customerCode, { customerName, routeCodes: new Set() });
        }
        customerNamesMap.get(customerCode)!.routeCodes.add(routeCode);
      }
    });
  });

  // Create final Customer domain entities linked to routes
  payload.mappings.forEach((m) => {
    const nameInfo = customerNamesMap.get(m.customerCode);
    const customerName = nameInfo ? nameInfo.customerName : m.customerCode;
    const classInfo = classificationMap.get(m.customerCode);
    const classification = classInfo?.classification || 'D';
    const channel = classInfo?.channel || 'General Trade';

    payload.customers.push({
      cust_rt_id: m.cust_rt_id,
      customerCode: m.customerCode,
      customerName,
      classification,
      channel: channel.toUpperCase(),
      routeCode: m.routeCode,
    });
  });

  // 5. Process Power SKUs
  const powerSkuMap = new Map<string, PowerSKU>();
  filesByType.powerSkus.forEach(f => {
    const skuCodeCol = f.mapping['SKUCode'];
    const skuNameCol = f.mapping['SKUName'];
    const channelCol = f.mapping['Channel'];

    f.data.forEach((row, index) => {
      const rowNum = index + 2;
      const skuCode = String(row[skuCodeCol] || '').trim();
      const skuName = String(row[skuNameCol] || '').trim();
      const channel = String(row[channelCol] || '').trim().toUpperCase();

      if (!skuCode) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing SKUCode value.` });
      }
      if (!skuName) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing SKUName value.` });
      }
      if (!channel) {
        errors.push({ row: rowNum, error: `${f.fileName}: Row is missing Channel value.` });
      }

      if (skuCode && skuName && channel) {
        const key = `${skuCode}_${channel}`;
        powerSkuMap.set(key, { skuCode, skuName, channel });
      }
    });
  });
  payload.powerSkus = Array.from(powerSkuMap.values());

  return { payload, errors };
}

