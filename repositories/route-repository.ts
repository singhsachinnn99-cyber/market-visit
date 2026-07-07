import { mockDb } from '@/services/mock-db';
import { Route } from '@/types';

const isSharePoint = () => {
  return !!(
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_SITE_ID
  );
};

export const routeRepository = {
  async getAllRoutes(): Promise<Route[]> {
    if (isSharePoint()) {
      try {
        const { sharepointRoutes } = require('@/services/sharepoint/routes');
        return await sharepointRoutes.getAll();
      } catch (error) {
        console.error('SharePoint routes error, falling back to mock:', error);
        return mockDb.getRoutes();
      }
    }
    return mockDb.getRoutes();
  },

  async upsertRoutes(routes: Route[]): Promise<{ inserted: number; updated: number }> {
    if (isSharePoint()) {
      try {
        const { sharepointRoutes } = require('@/services/sharepoint/routes');
        return await sharepointRoutes.upsertMany(routes);
      } catch (error) {
        console.error('SharePoint routes error, falling back to mock:', error);
      }
    }

    // Mock implementation
    const existing = mockDb.getRoutes();
    let inserted = 0;
    let updated = 0;

    const routeMap = new Map(existing.map((r) => [r.routeCode, r]));

    routes.forEach((route) => {
      if (routeMap.has(route.routeCode)) {
        routeMap.set(route.routeCode, { ...routeMap.get(route.routeCode)!, ...route });
        updated++;
      } else {
        routeMap.set(route.routeCode, route);
        inserted++;
      }
    });

    mockDb.saveRoutes(Array.from(routeMap.values()));
    return { inserted, updated };
  },

  async clearObsoleteRoutes(activeCodes: string[]): Promise<number> {
    if (isSharePoint()) {
      try {
        const { sharepointRoutes } = require('@/services/sharepoint/routes');
        return await sharepointRoutes.deleteNotIn(activeCodes);
      } catch (error) {
        console.error('SharePoint routes error, falling back to mock:', error);
      }
    }

    // Mock implementation
    const existing = mockDb.getRoutes();
    const beforeCount = existing.length;
    const activeSet = new Set(activeCodes);
    const kept = existing.filter((r) => activeSet.has(r.routeCode));
    mockDb.saveRoutes(kept);
    return beforeCount - kept.length;
  },
};
