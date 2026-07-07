import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { customerRepository } from '@/repositories/customer-repository';
import { routeRepository } from '@/repositories/route-repository';
import { userRepository } from '@/repositories/user-repository';
import { DashboardStats, Visit, Customer, Route, User, CustomerRouteMapping } from '@/types';

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

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const supervisorId = searchParams.get('supervisorId');
    const routeCode = searchParams.get('routeCode');

    // 1. Fetch data in parallel
    const [visits, customers, routes, users, mappings] = await Promise.all([
      visitRepository.getAllVisits(),
      customerRepository.getAllCustomers(),
      routeRepository.getAllRoutes(),
      userRepository.getAllUsers(),
      customerRepository.getMappings(),
    ]);

    // Create lookup maps for performance
    const custMap = new Map<string, Customer>(customers.map((c) => [c.customerCode, c]));
    const routeMap = new Map<string, Route>(routes.map((r) => [r.routeCode, r]));
    const userMap = new Map<string, User>(users.map((u) => [u.employeeCode, u]));

    // 2. Filter visits (Only Submitted visits count for official analytics/coverage)
    let filteredVisits = visits.filter((v) => v.status === 'Submitted');

    if (startDate) {
      const start = new Date(startDate).getTime();
      filteredVisits = filteredVisits.filter((v) => new Date(v.createdAt).getTime() >= start);
    }
    if (endDate) {
      // Include the end date fully
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filteredVisits = filteredVisits.filter((v) => new Date(v.createdAt).getTime() <= end.getTime());
    }
    if (supervisorId) {
      filteredVisits = filteredVisits.filter((v) => v.supervisorId === supervisorId);
    }
    if (routeCode) {
      filteredVisits = filteredVisits.filter((v) => v.routeCode === routeCode);
    }

    // Today's Date range
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayVisits = filteredVisits.filter((v) => {
      const time = new Date(v.createdAt).getTime();
      return time >= startOfToday.getTime() && time <= endOfToday.getTime();
    }).length;

    // Active supervisors
    const activeSupervisorsCount = users.filter(
      (u) => u.role === 'Supervisor' && u.status === 'Active'
    ).length;

    // 3. Compute Coverage %
    // Formula: (Distinct customers visited / total assigned customers mapping) * 100
    let filteredMappings = mappings;
    if (routeCode) {
      filteredMappings = mappings.filter((m) => m.routeCode === routeCode);
    }

    const uniqueVisitedPairs = new Set<string>();
    filteredVisits.forEach((v) => {
      // Create a unique compound key CustomerCode_RouteCode
      uniqueVisitedPairs.add(`${v.customerCode}_${v.routeCode}`);
    });

    // Intersect unique visited pairs with mappings to find valid visits
    let visitedAssignedCount = 0;
    const mappingKeys = new Set(filteredMappings.map((m) => m.id));
    uniqueVisitedPairs.forEach((pair) => {
      if (mappingKeys.has(pair)) {
        visitedAssignedCount++;
      }
    });

    const totalAssignedCount = filteredMappings.length;
    const coveragePercent =
      totalAssignedCount > 0 ? Math.round((visitedAssignedCount / totalAssignedCount) * 1000) / 10 : 0;

    // 4. Temperature Breach %
    // Formula: (Visits where TempInRange = false / Total Visits) * 100
    const breachedVisits = filteredVisits.filter((v) => !v.tempInRange);
    const totalVisitsCount = filteredVisits.length;
    const tempBreachPercent =
      totalVisitsCount > 0
        ? Math.round((breachedVisits.length / totalVisitsCount) * 1000) / 10
        : 0;

    // 5. Visits Per Day (Area Chart Data)
    const dayMap = new Map<string, number>();
    filteredVisits.forEach((v) => {
      const dateStr = new Date(v.createdAt).toISOString().split('T')[0];
      dayMap.set(dateStr, (dayMap.get(dateStr) || 0) + 1);
    });
    const visitsPerDay = Array.from(dayMap.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 6. Coverage Per Route (Bar Chart Data)
    const coveragePerRoute = routes.map((r) => {
      const routeMappings = mappings.filter((m) => m.routeCode === r.routeCode);
      const assignedCount = routeMappings.length;

      const routeVisits = filteredVisits.filter((v) => v.routeCode === r.routeCode);
      const visitedSet = new Set(routeVisits.map((v) => v.customerCode));

      // Match visited against assigned to count
      let visitedAssigned = 0;
      routeMappings.forEach((m) => {
        if (visitedSet.has(m.customerCode)) visitedAssigned++;
      });

      return {
        routeCode: r.routeCode,
        routeName: r.routeName,
        visited: visitedAssigned,
        total: assignedCount,
        coverage: assignedCount > 0 ? Math.round((visitedAssigned / assignedCount) * 100) : 0,
      };
    });

    // 7. Supervisor Scorecard / Performance
    const supervisorsList = users.filter((u) => u.role === 'Supervisor');
    const supervisorPerformance = supervisorsList.map((sup) => {
      const supVisits = filteredVisits.filter((v) => v.supervisorId === sup.employeeCode);
      const uniqueOutlets = new Set(supVisits.map((v) => v.customerCode)).size;
      const breaches = supVisits.filter((v) => !v.tempInRange).length;

      // Calculate coverage specific to supervisor routes visited
      const supRoutesVisited = Array.from(new Set(supVisits.map((v) => v.routeCode)));
      const supMappings = mappings.filter((m) => supRoutesVisited.includes(m.routeCode));
      const supAssignedOutlets = new Set(supMappings.map((m) => m.customerCode)).size;

      const supCoveragePercent =
        supAssignedOutlets > 0 ? Math.round((uniqueOutlets / supAssignedOutlets) * 100) : 0;

      return {
        supervisorId: sup.employeeCode,
        supervisorName: sup.name,
        visitsCount: supVisits.length,
        uniqueOutlets,
        breaches,
        coveragePercent: supCoveragePercent,
      };
    });

    // 8. Recent Temperature Breaches
    const temperatureBreaches = breachedVisits.map((v) => {
      const cust = custMap.get(v.customerCode);
      const sup = userMap.get(v.supervisorId);
      return {
        visitId: v.visitId,
        customerName: cust?.customerName || v.customerCode,
        assetType: v.assetType,
        temperature: v.temperature,
        supervisorName: sup?.name || v.supervisorId,
        visitDate: v.createdAt,
      };
    });

    const stats: DashboardStats = {
      totalVisits: totalVisitsCount,
      todayVisits,
      totalSupervisors: activeSupervisorsCount,
      coveragePercent,
      tempBreachPercent,
      visitsPerDay,
      coveragePerRoute,
      supervisorPerformance,
      temperatureBreaches: temperatureBreaches.slice(0, 10), // Return recent 10 breaches
    };

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('Dashboard aggregation failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
