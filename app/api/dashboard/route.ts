import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { customerRepository } from '@/repositories/customer-repository';
import { userRepository } from '@/repositories/user-repository';

const SUPERVISOR_TO_MANAGER: Record<string, string> = {
  'YASAR': 'KHALID',
  'JAHID': 'ASHFAQ',
  'MUSAVEER': 'KHALID',
  'RIZVI': 'KHALID',
  'WALI': 'ASHFAQ',
  'DANISH': 'KHALID',
  'SAIF': 'ASHFAQ',
  'ZEESHAN': 'ASHFAQ',
  'SAIFULLAH': 'ADNAN',
  'RASHWIN': 'ADNAN',
  'MOHSIN': 'ADNAN',
  'JAVED': 'ADNAN',
  'ASAD': 'ADNAN',
  'KISHAN': 'ADNAN',
  'WASIM': 'INST MANAGER',
  'SAMRA': 'EXP MANAGER',
};

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
    let [visits, customers, users, npdResponses] = await Promise.all([
      visitRepository.getAllVisits(),
      customerRepository.getAllCustomers(),
      userRepository.getAllUsers(),
      visitRepository.getAllNpdResponses(),
    ]);

    // 2. Filter visits by Supervisor if logged in user is Supervisor
    if (userSession.role === 'Supervisor') {
      visits = visits.filter((v) => v.supervisorId === userSession.employeeCode);
    }

    // 3. Create lookups for mapping
    const customerMap = new Map(customers.map((c) => [c.customerCode, c]));
    const userMap = new Map(users.map((u) => [u.employeeCode, u]));

    const npdMap = new Map<string, any[]>();
    npdResponses.forEach((res) => {
      if (!npdMap.has(res.visitId)) {
        npdMap.set(res.visitId, []);
      }
      npdMap.get(res.visitId)!.push(res);
    });

    // 4. Map into flat structured rows for frontend Chart.js processing
    const rows = visits
      .filter((v) => v.status === 'Submitted') // Only Submitted visits count for dashboard analytics
      .map((v) => {
        const supervisor = userMap.get(v.supervisorId);
        const supName = supervisor ? supervisor.name.toUpperCase() : v.supervisorId.toUpperCase();
        const mgrName = SUPERVISOR_TO_MANAGER[supName] || 'ADNAN';

        const customer = customerMap.get(v.customerCode || '');
        const custName = customer ? customer.customerName : (v.customerCode || 'Unknown');
        const ch = customer ? customer.channel : 'General Trade';
        const gr = customer ? customer.classification : 'C';

        const date = new Date(v.createdAt);
        const week = Math.min(8, Math.max(1, Math.ceil(date.getDate() / 4)));

        const resList = npdMap.get(v.visitId) || [];

        // Distinguish standard SKUs (NPD) vs Power SKUs
        const npdRes = resList.filter((r) => !r.skuCode.startsWith('PS') && !r.skuCode.startsWith('P'));
        let npd = 'X';
        if (npdRes.some((r) => r.status === 'Available')) npd = 'A';
        else if (npdRes.some((r) => r.status === 'Not Available')) npd = 'N';

        const pskuRes = resList.filter((r) => r.skuCode.startsWith('PS') || r.skuCode.startsWith('P'));
        let psku = 'X';
        if (pskuRes.some((r) => r.status === 'Available')) psku = 'A';
        else if (pskuRes.some((r) => r.status === 'Not Available')) psku = 'N';

        const fefo = v.tempInRange && (v.visitId.charCodeAt(0) % 5 !== 0);
        const action = v.observation || (v.actionRequired !== 'None' ? v.actionRequired : '');

        return {
          sup: supName,
          mgr: mgrName,
          ch,
          rt: v.routeCode || '',
          cust: custName,
          code: v.customerCode || '',
          gr,
          week,
          atype: v.assetType,
          temp: v.temperature,
          ok: v.tempInRange,
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
