import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { customerRepository } from '@/repositories/customer-repository';
import pool from '@/lib/db';
import { getDashboardScope, isFleetRole, isFullAccessRole, isSupervisorRole, isReportAllowed } from '@/lib/roles';

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

    // 1. Fetch raw datasets from database
    let [visits, customers] = await Promise.all([
      visitRepository.getAllVisits(),
      customerRepository.getAllCustomers(),
    ]);

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

    // 3. Load dynamic User & Manager mappings (include role for supervisor count)
    const [dbUsers]: any = await pool.execute(`
      SELECT u.id, u.name, u.role, m.name as managerName 
      FROM User u 
      LEFT JOIN Manager m ON u.managerId = m.id
    `);
    const [skuRows]: any = await pool.execute('SELECT * FROM `SKU`');
    const skuMap = new Map<string, any>(skuRows.map((sku: any) => [sku.skuCode, sku]));
    const [powerSkuRows]: any = await pool.execute('SELECT * FROM `PowerSKU`');
    const powerSkuMap = new Map<string, any>(powerSkuRows.map((sku: any) => [sku.skuCode, sku]));
    const userMap = new Map<string, { name: string; managerName: string }>(
      dbUsers.map((u: any) => [u.id, { name: u.name.toUpperCase(), managerName: (u.managerName || 'ADNAN').toUpperCase() }])
    );

    // 4. Load child tables
    const [assets]: any = await pool.execute('SELECT * FROM `VisitAsset`');
    const assetMap = new Map<string, any[]>();
    assets.forEach((ast: any) => {
      if (!assetMap.has(ast.visitId)) {
        assetMap.set(ast.visitId, []);
      }
      assetMap.get(ast.visitId)!.push(ast);
    });

    const [pskuResults]: any = await pool.execute('SELECT * FROM `VisitPowerSkuResult`');
    const pskuMap = new Map<string, any[]>();
    pskuResults.forEach((r: any) => {
      if (!pskuMap.has(r.visitId)) {
        pskuMap.set(r.visitId, []);
      }
      pskuMap.get(r.visitId)!.push(r);
    });

    const [npdResults]: any = await pool.execute('SELECT * FROM `NPDResponse`');
    const npdMap = new Map<string, any[]>();
    npdResults.forEach((r: any) => {
      if (!npdMap.has(r.visitId)) {
        npdMap.set(r.visitId, []);
      }
      npdMap.get(r.visitId)!.push(r);
    });

    const customerMap = new Map(customers.map((c) => [c.cust_rt_id, c]));

    const inferBusinessVertical = (skuName: string) => {
      const label = (skuName || '').toLowerCase();
      if (label.includes('yog') || label.includes('laban') || label.includes('milk') || label.includes('cream')) return 'Dairy';
      if (label.includes('juice') || label.includes('nectar') || label.includes('drink') || label.includes('water')) return 'Beverage';
      if (label.includes('ice') || label.includes('cone') || label.includes('choc')) return 'Ice Cream';
      return 'Other';
    };

    const formatTempContext = (assetType: string, temperature: number | null | undefined) => {
      if (temperature === null || temperature === undefined || Number.isNaN(Number(temperature))) {
        return '—';
      }
      const value = Number(temperature).toFixed(1);
      if (assetType === 'Freezer') return `${value}°C (should be below -15°C)`;
      return `${value}°C (should be 0 to 8°C)`;
    };

    // 5. Map into flat structured rows for frontend analytics charts
    const reportRows = {
      npd: [] as any[],
      psku: [] as any[],
      'cold-chain': [] as any[],
      classification: [] as any[],
    };
    const classificationRows: any[] = [];

    const rows = filteredVisits.map((v) => {
      const userInfo = userMap.get(v.supervisorId) || { name: 'UNKNOWN', managerName: 'ADNAN' };
      const supName = userInfo.name;
      const mgrName = userInfo.managerName;

      const customer = customerMap.get(v.cust_rt_id || '');
      const custName = customer ? customer.customerName : 'Unknown';
      const ch = customer ? customer.channel : 'General Trade';
      const gr = customer ? customer.classification : 'C';

      const [customerCode, routeCode] = (v.cust_rt_id || '').split('|');
      const visitDate = (v.createdAt as any) instanceof Date ? (v.createdAt as any).toISOString() : v.createdAt;

      const date = new Date(v.createdAt);
      const week = Math.min(8, Math.max(1, Math.ceil(date.getDate() / 4)));

      // Assets temperature processing
      const visitAssets = assetMap.get(v.visitId) || [];
      const firstAsset = visitAssets[0] || { assetType: 'Chiller', temperature: 0, tempInRange: 1, actionRequired: 'None', observation: '' };
      
      const ok = visitAssets.length > 0 ? visitAssets.every((a: any) => a.tempInRange === 1 || a.tempInRange === true) : true;
      const temperature = visitAssets.length > 0 ? (visitAssets[0].temperature) : 0; // use first asset temperature as primary representation

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

      visitNpd.forEach((response: any) => {
        const sku = skuMap.get(response.skuCode);
        const skuName = sku?.skuName || response.skuCode;
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
          businessVertical: sku?.businessVertical || inferBusinessVertical(skuName),
          skuName,
          availability: response.status === 'Available' ? 'YES' : response.status === 'Not Available' ? 'NO' : 'NOT APPLICABLE',
        });
      });

      visitPsku.forEach((result: any) => {
        const sku = powerSkuMap.get(result.skuCode);
        const skuName = sku?.skuName || result.skuCode;
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
          businessVertical: sku?.businessVertical || inferBusinessVertical(skuName),
          skuName,
          availability: result.status === 'Available' ? 'YES' : result.status === 'Not Available' ? 'NO' : 'NOT APPLICABLE',
        });
      });

      visitAssets.forEach((asset: any) => {
        const assetType = asset.assetType || 'Chiller';
        const tempValue = Number(asset.temperature);
        const tempStatus = assetType === 'Freezer' ? (tempValue < -15 ? 'In Range' : 'Breach') : (tempValue >= 0 && tempValue <= 8 ? 'In Range' : 'Breach');
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
          assetType,
          assetTemp: formatTempContext(assetType, asset.temperature),
          tempStatus,
          ok: tempStatus === 'In Range',
          actionRemarks: [asset.actionRequired && asset.actionRequired !== 'None' ? asset.actionRequired : null, asset.observation?.trim() || null].filter(Boolean).join(' · ') || 'None',
        });
      });

      return {
        sup: supName,
        mgr: mgrName,
        ch,
        rt: routeCode || '',
        cust: custName,
        code: customerCode || '',
        gr,
        week,
        atype: firstAsset.assetType,
        temp: temperature,
        ok,
        npd,
        psku,
        fefo,
        action,
        visitId: v.visitId,
        visitType: v.visit_type === 'No Visit' ? 'No Visit' : 'Visit',
        reasonCategory: v.reason_category || '',
        reason: v.reason || '',
        createdAt: (v.createdAt as any) instanceof Date ? (v.createdAt as any).toISOString() : v.createdAt
      };
    });

    reportRows.classification = classificationRows;

    // 6. Compute aggregated statistics for the Reports & Routes pages
    const totalVisits = rows.length;
    const noVisitCount = rows.filter((r: any) => r.visitType === 'No Visit').length;

    const todayStr = new Date().toISOString().split('T')[0];
    const todayVisits = filteredVisits.filter(v => {
      const vDate = new Date(v.createdAt);
      return vDate.toISOString().split('T')[0] === todayStr;
    }).length;

    const totalSupervisors = dbUsers.filter((u: any) => u.role === 'Supervisor').length;

    const breachesCount = rows.filter(r => !r.ok).length;
    const tempBreachPercent = rows.length > 0 ? Math.round((breachesCount / rows.length) * 100) : 0;

    const dayCounts: Record<string, number> = {};
    filteredVisits.forEach(v => {
      const dStr = new Date(v.createdAt).toISOString().split('T')[0];
      dayCounts[dStr] = (dayCounts[dStr] || 0) + 1;
    });
    const visitsPerDay = Object.entries(dayCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Fetch routes and compute coverage stats
    const [dbRoutes]: any = await pool.execute('SELECT * FROM `Route`');
    let activeRoutes = dbRoutes;
    if (scope === 'supervisor') {
      activeRoutes = activeRoutes.filter((r: any) => r.supervisorId === userSession.id);
    }
    if (supervisorIdParam && (scope === 'full' || isFullAccessRole(role))) {
      activeRoutes = activeRoutes.filter((r: any) => r.supervisorId === supervisorIdParam);
    }
    if (routeCodeParam) {
      activeRoutes = activeRoutes.filter((r: any) => r.routeCode === routeCodeParam);
    }

    const coveragePerRoute = activeRoutes.map((r: any) => {
      const routeCode = r.routeCode;
      const routeName = r.routeName;
      const assignedCustomers = customers.filter(c => c.routeCode === routeCode);
      const total = assignedCustomers.length;
      const visitedCustIds = new Set(
        filteredVisits
          .filter(v => {
            const [_, rCode] = (v.cust_rt_id || '').split('|');
            return rCode === routeCode;
          })
          .map(v => v.cust_rt_id)
      );
      const visited = visitedCustIds.size;
      const coverage = total > 0 ? Math.min(100, Math.round((visited / total) * 100)) : 0;
      return { routeCode, routeName, visited, total, coverage };
    });

    const totalAssignedOutlets = coveragePerRoute.reduce((sum: number, r: any) => sum + r.total, 0);
    const totalVisitedOutlets = coveragePerRoute.reduce((sum: number, r: any) => sum + r.visited, 0);
    const coveragePercent = totalAssignedOutlets > 0 ? Math.round((totalVisitedOutlets / totalAssignedOutlets) * 100) : 0;

    const supervisorPerformance = dbUsers
      .filter((u: any) => u.role === 'Supervisor' && (!supervisorIdParam || u.id === supervisorIdParam) && (scope === 'full' || u.id === userSession.id))
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

    return NextResponse.json({
      success: true,
      rows,
      reportRows,
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
    });
  } catch (error: any) {
    console.error('Dashboard aggregation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
