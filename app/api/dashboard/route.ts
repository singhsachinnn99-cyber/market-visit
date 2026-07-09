import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { customerRepository } from '@/repositories/customer-repository';
import pool from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userSession = session.user as any;
    if (userSession.role !== 'Admin' && userSession.role !== 'Supervisor') {
      return NextResponse.json({ error: 'Unauthorized role' }, { status: 403 });
    }

    // 1. Fetch raw datasets from database
    let [visits, customers] = await Promise.all([
      visitRepository.getAllVisits(),
      customerRepository.getAllCustomers(),
    ]);

    // 2. Filter visits by Supervisor if logged in user is Supervisor
    if (userSession.role === 'Supervisor') {
      visits = visits.filter((v) => v.supervisorId === userSession.id);
    }

    // 3. Load dynamic User & Manager mappings
    const [dbUsers]: any = await pool.execute(`
      SELECT u.id, u.name, m.name as managerName 
      FROM User u 
      LEFT JOIN Manager m ON u.managerId = m.id
    `);
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

    // 5. Map into flat structured rows for frontend analytics charts
    const rows = visits
      .filter((v) => v.status === 'Submitted')
      .map((v) => {
        const userInfo = userMap.get(v.supervisorId) || { name: 'UNKNOWN', managerName: 'ADNAN' };
        const supName = userInfo.name;
        const mgrName = userInfo.managerName;

        const customer = customerMap.get(v.cust_rt_id || '');
        const custName = customer ? customer.customerName : 'Unknown';
        const ch = customer ? customer.channel : 'General Trade';
        const gr = customer ? customer.classification : 'C';

        const [customerCode, routeCode] = (v.cust_rt_id || '').split('|');

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
        };
      });

    return NextResponse.json({ success: true, rows });
  } catch (error: any) {
    console.error('Dashboard aggregation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
