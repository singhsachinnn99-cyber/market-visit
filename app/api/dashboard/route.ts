import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { customerRepository } from '@/repositories/customer-repository';
import pool from '@/lib/db';
import { getDashboardScope, isFleetRole, isFullAccessRole, isSupervisorRole, isReportAllowed } from '@/lib/roles';

let dashboardSchemaChecked = false;
async function ensureDashboardSchema() {
  if (dashboardSchemaChecked) return;
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS \`Manager\` (\`id\` VARCHAR(191) PRIMARY KEY, \`name\` VARCHAR(191) UNIQUE NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS \`PowerSKU\` (\`skuCode\` VARCHAR(191) NOT NULL, \`skuName\` VARCHAR(191) NOT NULL, \`channel\` VARCHAR(191) NOT NULL, PRIMARY KEY (\`skuCode\`, \`channel\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS \`VisitAsset\` (\`visitId\` VARCHAR(191) NOT NULL, \`assetType\` VARCHAR(50) NOT NULL, \`temperature\` DOUBLE NOT NULL, \`tempInRange\` TINYINT(1) NOT NULL, \`actionRequired\` VARCHAR(50) NOT NULL, \`observation\` TEXT NULL, PRIMARY KEY (\`visitId\`, \`assetType\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    await pool.execute(`CREATE TABLE IF NOT EXISTS \`VisitPowerSkuResult\` (\`visitId\` VARCHAR(191) NOT NULL, \`skuCode\` VARCHAR(191) NOT NULL, \`status\` VARCHAR(50) NOT NULL, PRIMARY KEY (\`visitId\`, \`skuCode\`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`);
    dashboardSchemaChecked = true;
  } catch (e) {}
}

const cacheStore = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 3000; // 3 seconds cache for deduplicating simultaneous requests

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userSession = session.user as any;
    const role = userSession.role as string | undefined;
    const scope = getDashboardScope(role);
    if (scope === 'full' || scope === 'supervisor' || scope === 'fleet') {
      // allowed
    } else {
      return NextResponse.json({ error: 'Unauthorized role' }, { status: 403 });
    }

    const cacheKey = `${userSession.id}_${role}_${req.nextUrl.searchParams.toString()}`;
    const cached = cacheStore.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return NextResponse.json(cached.data);
    }

    await ensureDashboardSchema();

    // 1. Fetch raw datasets concurrently in parallel
    const [visitsRaw, customers, dbUsers, skuRows, powerSkuRows, assets, pskuResults, npdResults, photosRaw, routeRows] = await Promise.all([
      visitRepository.getAllVisits(),
      customerRepository.getAllCustomers(),
      pool.execute(`
        SELECT u.id, u.name, u.role, m.name as managerName 
        FROM User u 
        LEFT JOIN Manager m ON u.managerId = m.id
      `).then(([rows]: any) => rows).catch(() => []),
      pool.execute('SELECT * FROM `SKU`').then(([rows]: any) => rows).catch(() => []),
      pool.execute('SELECT * FROM `PowerSKU`').then(([rows]: any) => rows).catch(() => []),
      pool.execute('SELECT * FROM `VisitAsset`').then(([rows]: any) => rows).catch(() => []),
      pool.execute('SELECT * FROM `VisitPowerSkuResult`').then(([rows]: any) => rows).catch(() => []),
      pool.execute('SELECT * FROM `NPDResponse`').then(([rows]: any) => rows).catch(() => []),
      pool.execute('SELECT * FROM `VisitPhoto`').then(([rows]: any) => rows).catch(() => []),
      pool.execute(`
        SELECT r.*, m.name as managerName 
        FROM Route r 
        LEFT JOIN Manager m ON r.managerId = m.id
      `).then(([rows]: any) => rows).catch(() => []),
    ]);

    let visits = visitsRaw;
    if (scope === 'supervisor') {
      visits = visits.filter((v) => v.supervisorId === userSession.id);
    }

    const startDateParam = req.nextUrl.searchParams.get('startDate');
    const endDateParam = req.nextUrl.searchParams.get('endDate');
    const supervisorIdParam = req.nextUrl.searchParams.get('supervisorId');
    const routeCodeParam = req.nextUrl.searchParams.get('routeCode');
    const reportParam = req.nextUrl.searchParams.get('report');

    if (scope === 'fleet' && reportParam && !isReportAllowed(role, reportParam)) {
      return NextResponse.json({ error: 'Forbidden report for this role' }, { status: 403 });
    }

    let filteredVisits = visits.filter((v) => v.status === 'Submitted');

    if (startDateParam) {
      const start = new Date(startDateParam + 'T00:00:00');
      filteredVisits = filteredVisits.filter(v => new Date(v.createdAt) >= start);
    }
    if (endDateParam) {
      const end = new Date(endDateParam + 'T23:59:59');
      filteredVisits = filteredVisits.filter(v => new Date(v.createdAt) <= end);
    }
    if (scope === 'supervisor') {
      filteredVisits = filteredVisits.filter(v => v.supervisorId === userSession.id);
    }

    if (supervisorIdParam && (scope === 'full' || isFullAccessRole(role))) {
      filteredVisits = filteredVisits.filter(v => v.supervisorId === supervisorIdParam);
    }
    if (routeCodeParam) {
      filteredVisits = filteredVisits.filter(v => {
        const [_, rt] = (v.cust_rt_id || '').split('|');
        return rt === routeCodeParam;
      });
    }

    // Build dynamic Manager -> Supervisor map
    const managerSupervisorMap: Record<string, string[]> = {};
    const supToMgrMap = new Map<string, string>();

    // 1. From User table
    dbUsers.forEach((u: any) => {
      if (u.role === 'Supervisor' && u.name) {
        const supName = u.name.toUpperCase().trim();
        const mgrName = (u.managerName || '').toUpperCase().trim();
        if (mgrName) {
          supToMgrMap.set(supName, mgrName);
        }
      }
    });

    // 2. From Route table (Route Master mapping)
    routeRows.forEach((r: any) => {
      const superName = (r.superName || '').toUpperCase().trim();
      const mgrName = (r.managerName || '').toUpperCase().trim();
      if (superName && superName !== 'CLOSED' && mgrName && mgrName !== 'CLOSED') {
        if (!supToMgrMap.has(superName)) {
          supToMgrMap.set(superName, mgrName);
        }
      }
    });

    // Fallback static overrides if DB mapping is partially empty for standard managers
    const KNOWN_MAP: Record<string, string> = {
      'ASAD': 'ADNAN', 'JAVED': 'ADNAN', 'KISHAN': 'ADNAN', 'MOHSIN': 'ADNAN', 'RASHWIN': 'ADNAN', 'SAIFULLAH': 'ADNAN',
      'JAHID': 'ASHFAQ', 'SAIF': 'ASHFAQ', 'WALI': 'ASHFAQ', 'ZEESHAN': 'ASHFAQ',
      'DANISH': 'KHALID', 'MUSAVEER': 'KHALID', 'RIZVI': 'KHALID', 'YASAR': 'KHALID',
      'SAMRA': 'EXP MANAGER', 'WASIM': 'INST MANAGER'
    };

    Object.entries(KNOWN_MAP).forEach(([sup, mgr]) => {
      if (!supToMgrMap.has(sup)) {
        supToMgrMap.set(sup, mgr);
      }
    });

    // Group into managerSupervisorMap
    supToMgrMap.forEach((mgrName, supName) => {
      if (!managerSupervisorMap[mgrName]) {
        managerSupervisorMap[mgrName] = [];
      }
      if (!managerSupervisorMap[mgrName].includes(supName)) {
        managerSupervisorMap[mgrName].push(supName);
      }
    });

    Object.keys(managerSupervisorMap).forEach((m) => {
      managerSupervisorMap[m].sort();
    });

    const skuMap = new Map<string, any>(skuRows.map((sku: any) => [sku.skuCode, sku]));
    const powerSkuMap = new Map<string, any>(powerSkuRows.map((sku: any) => [sku.skuCode, sku]));
    const customerMap = new Map(customers.map((c) => [c.cust_rt_id, c]));

    const userMap = new Map<string, { name: string; managerName: string }>(
      dbUsers.map((u: any) => {
        const supName = u.name.toUpperCase().trim();
        const mgrName = supToMgrMap.get(supName) || (u.managerName || '').toUpperCase().trim() || 'UNASSIGNED';
        return [u.id, { name: supName, managerName: mgrName }];
      })
    );

    const assetMap = new Map<string, any[]>();
    assets.forEach((ast: any) => {
      if (!assetMap.has(ast.visitId)) {
        assetMap.set(ast.visitId, []);
      }
      assetMap.get(ast.visitId)!.push(ast);
    });

    const pskuMap = new Map<string, any[]>();
    pskuResults.forEach((r: any) => {
      if (!pskuMap.has(r.visitId)) {
        pskuMap.set(r.visitId, []);
      }
      pskuMap.get(r.visitId)!.push(r);
    });

    const npdMap = new Map<string, any[]>();
    npdResults.forEach((r: any) => {
      if (!npdMap.has(r.visitId)) {
        npdMap.set(r.visitId, []);
      }
      npdMap.get(r.visitId)!.push(r);
    });

    const formatTempContext = (assetType: string, temperature: number | null | undefined) => {
      if (temperature === null || temperature === undefined || Number.isNaN(Number(temperature))) {
        return '—';
      }
      const value = Number(temperature).toFixed(1);
      if (assetType === 'Freezer') return `${value}°C (should be below -15°C)`;
      return `${value}°C (should be 0 to 8°C)`;
    };

    // 2. Map into flat structured rows for frontend analytics charts
    const reportRows = {
      npd: [] as any[],
      psku: [] as any[],
      'cold-chain': [] as any[],
      classification: [] as any[],
      classificationDairy: [] as any[],
      classificationIceCream: [] as any[],
    };
    const classificationRows: any[] = [];
    const classificationRowsDairy: any[] = [];
    const classificationRowsIceCream: any[] = [];

    const rows = filteredVisits.map((v) => {
      const userInfo = userMap.get(v.supervisorId) || { name: 'UNKNOWN', managerName: 'ADNAN' };
      const supName = userInfo.name;
      const mgrName = userInfo.managerName;

      const customer = customerMap.get(v.cust_rt_id || '');
      const custName = customer ? customer.customerName : 'Unknown';
      const ch = customer ? customer.channel : 'General Trade';
      const gr = customer ? customer.classification : 'C';
      const dairyGr = customer ? (customer.dairyClassification || null) : null;
      const iceGr = customer ? (customer.iceCreamClassification || null) : null;

      const [customerCode, routeCode] = (v.cust_rt_id || '').split('|');
      const visitDate = (v.createdAt as any) instanceof Date ? (v.createdAt as any).toISOString() : v.createdAt;

      const date = new Date(v.createdAt);
      const week = Math.min(8, Math.max(1, Math.ceil(date.getDate() / 4)));

      // Assets temperature processing
      const visitAssets = assetMap.get(v.visitId) || [];
      const firstAsset = visitAssets[0] || { assetType: 'Chiller', temperature: 0, tempInRange: 1, actionRequired: 'None', observation: '' };
      
      const ok = visitAssets.length > 0 ? visitAssets.every((a: any) => a.tempInRange === 1 || a.tempInRange === true) : true;
      const temperature = visitAssets.length > 0 ? (visitAssets[0].temperature) : 0;

      // Checklists status resolution
      const visitNpd = npdMap.get(v.visitId) || [];
      let npd = 'X';
      if (visitNpd.some((r: any) => r.status === 'Available')) npd = 'A';
      else if (visitNpd.some((r: any) => r.status === 'Not Available')) npd = 'N';

      const visitPsku = pskuMap.get(v.visitId) || [];
      let psku = 'X';
      if (visitPsku.some((r: any) => r.status === 'Available')) psku = 'A';
      else if (visitPsku.some((r: any) => r.status === 'Not Available')) psku = 'N';

      const fefo = ok;
      const action = visitAssets.map(a => a.actionRequired !== 'None' ? `${a.assetType}: ${a.actionRequired}` : '').filter(Boolean).join(', ') || 'None';

      classificationRows.push({
        date: visitDate,
        visitId: v.visitId,
        channel: ch,
        manager: mgrName,
        supervisor: supName,
        routeCode: routeCode || '',
        outletCode: customerCode || '',
        outletName: custName,
        classification: gr,
        class: gr,
      });
      if (dairyGr) {
        classificationRowsDairy.push({
          date: visitDate,
          visitId: v.visitId,
          channel: ch,
          manager: mgrName,
          supervisor: supName,
          routeCode: routeCode || '',
          outletCode: customerCode || '',
          outletName: custName,
          classification: dairyGr,
          class: dairyGr,
          businessVertical: 'Dairy',
        });
      }
      if (iceGr) {
        classificationRowsIceCream.push({
          date: visitDate,
          visitId: v.visitId,
          channel: ch,
          manager: mgrName,
          supervisor: supName,
          routeCode: routeCode || '',
          outletCode: customerCode || '',
          outletName: custName,
          classification: iceGr,
          class: iceGr,
          businessVertical: 'Ice Cream',
        });
      }

      visitNpd.forEach((response: any) => {
        const sku = skuMap.get(response.skuCode);
        const skuName = sku?.skuName || response.skuCode;
        const st = (response.status || '').toUpperCase();
        const availStr = (st === 'AVAILABLE' || st === 'YES' || st === 'A') ? 'YES' : ((st === 'NOT AVAILABLE' || st === 'NO' || st === 'N') ? 'NO' : 'N/A');
        reportRows.npd.push({
          date: visitDate,
          visitId: v.visitId,
          channel: ch,
          manager: mgrName,
          supervisor: supName,
          routeCode: routeCode || '',
          outletCode: customerCode || '',
          outletName: custName,
          classification: gr,
          skuCode: response.skuCode,
          skuName,
          businessVertical: sku?.businessVertical || 'Dairy',
          status: response.status,
          availability: availStr,
        });
      });

      visitPsku.forEach((response: any) => {
        const pskuItem = powerSkuMap.get(response.skuCode);
        const skuName = pskuItem?.skuName || response.skuCode;
        const st = (response.status || '').toUpperCase();
        const availStr = (st === 'AVAILABLE' || st === 'YES' || st === 'A') ? 'YES' : ((st === 'NOT AVAILABLE' || st === 'NO' || st === 'N') ? 'NO' : 'N/A');
        reportRows.psku.push({
          date: visitDate,
          visitId: v.visitId,
          channel: ch,
          manager: mgrName,
          supervisor: supName,
          routeCode: routeCode || '',
          outletCode: customerCode || '',
          outletName: custName,
          classification: gr,
          skuCode: response.skuCode,
          skuName,
          businessVertical: pskuItem?.channel === 'GT' ? 'Power SKU' : pskuItem?.channel || 'Power SKU',
          status: response.status,
          availability: availStr,
        });
      });

      visitAssets.forEach((ast: any) => {
        const isOk = ast.tempInRange === 1 || ast.tempInRange === true;
        const formattedTemp = formatTempContext(ast.assetType, ast.temperature);
        const tempStatusStr = isOk ? 'In Range' : 'Breach';
        const remarksStr = ast.actionRequired && ast.actionRequired !== 'None' 
          ? (ast.observation && ast.observation !== '—' ? `${ast.actionRequired} - ${ast.observation}` : ast.actionRequired)
          : (ast.observation || '—');

        reportRows['cold-chain'].push({
          date: visitDate,
          visitId: v.visitId,
          channel: ch,
          manager: mgrName,
          supervisor: supName,
          routeCode: routeCode || '',
          outletCode: customerCode || '',
          outletName: custName,
          classification: gr,
          assetType: ast.assetType,
          temperature: ast.temperature,
          formattedTemperature: formattedTemp,
          assetTemp: formattedTemp !== '—' ? formattedTemp : (ast.temperature !== undefined && ast.temperature !== null ? `${ast.temperature}°C` : '—'),
          tempInRange: isOk,
          tempStatus: tempStatusStr,
          actionRequired: ast.actionRequired,
          observation: ast.observation || '—',
          actionRemarks: remarksStr,
        });
      });

      return {
        visitId: v.visitId,
        createdAt: visitDate,
        sup: supName,
        mgr: mgrName,
        ch,
        rt: routeCode || '',
        code: customerCode || '',
        cust: custName,
        gr,
        dairyGr,
        iceGr,
        week,
        atype: firstAsset.assetType,
        temp: temperature,
        ok,
        npd,
        psku,
        fefo,
        action,
      };
    });

    reportRows.classification = classificationRows;
    reportRows.classificationDairy = classificationRowsDairy;
    reportRows.classificationIceCream = classificationRowsIceCream;

    // 3. Process Visit Photos with full metadata
    const photos = photosRaw.map((p: any) => {
      const visit = visits.find((v: any) => v.visitId === p.visitId);
      const userInfo = visit ? userMap.get(visit.supervisorId) : null;
      const supName = userInfo ? userInfo.name : 'UNKNOWN';
      const mgrName = userInfo ? userInfo.managerName : 'UNASSIGNED';
      const customer = visit ? customerMap.get(visit.cust_rt_id || '') : null;
      const custName = customer ? customer.customerName : 'Unknown';
      const ch = customer ? customer.channel : 'General Trade';
      const [_, routeCode] = visit ? (visit.cust_rt_id || '').split('|') : ['', ''];
      const photoDate = p.uploadedAt || (visit ? visit.createdAt : null);

      return {
        photoId: p.photoId,
        visitId: p.visitId,
        category: p.category,
        cloudinaryUrl: p.cloudinaryUrl,
        uploadedAt: photoDate ? ((photoDate instanceof Date) ? photoDate.toISOString() : photoDate) : new Date().toISOString(),
        supervisor: supName,
        manager: mgrName,
        outlet: custName,
        route: routeCode || '',
        channel: ch,
      };
    });

    // 4. Summaries & KPIs
    const totalVisits = filteredVisits.length;
    const noVisitCount = visits.filter(v => v.status === 'Submitted' && (v as any).isNoVisit === true).length;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const todayVisits = filteredVisits.filter(v => {
      const dateStr = (v.createdAt as any) instanceof Date ? (v.createdAt as any).toISOString() : String(v.createdAt);
      return dateStr.startsWith(todayStr);
    }).length;

    const dbRoutes: any[] = routeRows;
    const totalSupervisors = dbUsers.filter((u: any) => u.role === 'Supervisor').length;

    const totalAssignedCustomers = customers.length;
    const visitedCustRtIds = new Set(filteredVisits.map(v => v.cust_rt_id));
    const coveragePercent = totalAssignedCustomers > 0 ? Math.round((visitedCustRtIds.size / totalAssignedCustomers) * 100) : 0;

    let totalAssetsCount = 0;
    let inRangeAssetsCount = 0;
    filteredVisits.forEach(v => {
      const visitAssets = assetMap.get(v.visitId) || [];
      visitAssets.forEach((a: any) => {
        totalAssetsCount++;
        if (a.tempInRange === 1 || a.tempInRange === true) inRangeAssetsCount++;
      });
    });
    const tempBreachPercent = totalAssetsCount > 0 ? Math.round(((totalAssetsCount - inRangeAssetsCount) / totalAssetsCount) * 100) : 0;

    // Per day visit counts
    const visitsPerDayMap = new Map<string, number>();
    filteredVisits.forEach(v => {
      const d = new Date(v.createdAt).toISOString().split('T')[0];
      visitsPerDayMap.set(d, (visitsPerDayMap.get(d) || 0) + 1);
    });
    const visitsPerDay = Array.from(visitsPerDayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Coverage per Route
    const routeMap = new Map<string, { total: number; visited: Set<string>; routeName: string }>();
    customers.forEach(c => {
      if (!routeMap.has(c.routeCode)) {
        routeMap.set(c.routeCode, { total: 0, visited: new Set(), routeName: c.routeCode });
      }
      routeMap.get(c.routeCode)!.total++;
    });

    filteredVisits.forEach(v => {
      const [cCode, rCode] = (v.cust_rt_id || '').split('|');
      if (rCode && routeMap.has(rCode)) {
        routeMap.get(rCode)!.visited.add(v.cust_rt_id);
      }
    });

    const coveragePerRoute = Array.from(routeMap.entries()).map(([routeCode, item]) => {
      const coverage = item.total > 0 ? Math.round((item.visited.size / item.total) * 100) : 0;
      return {
        routeCode,
        routeName: item.routeName,
        assigned: item.total,
        visited: item.visited.size,
        coverage,
      };
    });

    // Supervisor Performance Summary
    const supervisorPerformance = dbUsers
      .filter((u: any) => u.role === 'Supervisor')
      .map((u: any) => {
        const supVisits = filteredVisits.filter(v => v.supervisorId === u.id);
        const visitsCount = supVisits.length;
        const uniqueOutlets = new Set(supVisits.map(v => v.cust_rt_id)).size;
        
        const breaches = supVisits.filter(v => {
          const visitAssets = assetMap.get(v.visitId) || [];
          return visitAssets.length > 0 ? visitAssets.some((a: any) => a.tempInRange !== 1 && a.tempInRange !== true) : false;
        }).length;

        const supRoutes = dbRoutes.filter((r: any) => r.supervisorId === u.id);
        const totalAssigned = supRoutes.reduce((sum: number, r: any) => {
          return sum + customers.filter(c => c.routeCode === r.routeCode).length;
        }, 0);
        const totalVisited = supRoutes.reduce((sum: number, r: any) => {
          const visitedCustIds = new Set(
            filteredVisits
              .filter(v => {
                const [_, rCode] = (v.cust_rt_id || '').split('|');
                return rCode === r.routeCode;
              })
              .map(v => v.cust_rt_id)
          );
          return sum + visitedCustIds.size;
        }, 0);
        const coveragePercent = totalAssigned > 0 ? Math.round((totalVisited / totalAssigned) * 100) : 0;

        return {
          supervisorId: u.id,
          supervisorName: u.name,
          visitsCount,
          uniqueOutlets,
          breaches,
          coveragePercent
        };
      })
      .sort((a: any, b: any) => b.visitsCount - a.visitsCount);

    const temperatureBreaches = filteredVisits
      .filter(v => {
        const visitAssets = assetMap.get(v.visitId) || [];
        return visitAssets.length > 0 ? visitAssets.some((a: any) => a.tempInRange !== 1 && a.tempInRange !== true) : false;
      })
      .map(v => {
        const customer = customerMap.get(v.cust_rt_id || '');
        const custName = customer ? customer.customerName : 'Unknown';
        const userInfo = userMap.get(v.supervisorId) || { name: 'UNKNOWN' };
        const visitAssets = assetMap.get(v.visitId) || [];
        const firstAsset = visitAssets[0] || { assetType: 'Chiller', temperature: 0 };
        
        return {
          visitId: v.visitId,
          customerName: custName,
          assetType: firstAsset.assetType,
          temperature: firstAsset.temperature,
          supervisorName: userInfo.name,
          visitDate: (v.createdAt as any) instanceof Date ? (v.createdAt as any).toISOString() : v.createdAt,
        };
      });

    const payload = {
      success: true,
      rows,
      reportRows,
      managerSupervisorMap,
      photos,
      totalVisits,
      noVisitCount,
      todayVisits,
      totalSupervisors,
      coveragePercent,
      tempBreachPercent,
      visitsPerDay,
      coveragePerRoute,
      supervisorPerformance,
      temperatureBreaches
    };

    cacheStore.set(cacheKey, { timestamp: Date.now(), data: payload });

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Dashboard aggregation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
