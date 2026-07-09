import { Route } from '@/types';
import pool from '@/lib/db';

function mapRowToRoute(row: any): Route {
  return {
    routeCode: row.routeCode,
    routeName: row.routeName,
    channel: row.channel,
    supervisorId: row.supervisorId,
    managerId: row.managerId,
  };
}

export const routeRepository = {
  async getAllRoutes(): Promise<Route[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `Route`');
    return rows.map(mapRowToRoute);
  },

  async getRoutesBySupervisor(supervisorId: string): Promise<Route[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `Route` WHERE `supervisorId` = ?',
      [supervisorId]
    );
    return rows.map(mapRowToRoute);
  },

  async isRouteAssignedToSupervisor(routeCode: string, supervisorId: string): Promise<boolean> {
    const [rows]: any = await pool.execute(
      'SELECT 1 FROM `Route` WHERE `routeCode` = ? AND `supervisorId` = ? LIMIT 1',
      [routeCode, supervisorId]
    );
    return rows.length > 0;
  },

  async upsertRoutes(routes: Route[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT `routeCode` FROM `Route`');
    const existingCodes = new Set<string>(rows.map((r: any) => r.routeCode));

    let inserted = 0;
    let updated = 0;

    for (const route of routes) {
      const supervisorId = route.supervisorId || null;
      const managerId = route.managerId || null;
      const channel = route.channel || 'GT';

      if (existingCodes.has(route.routeCode)) {
        await pool.execute(
          'UPDATE `Route` SET `routeName` = ?, `channel` = ?, `supervisorId` = ?, `managerId` = ? WHERE `routeCode` = ?',
          [route.routeName, channel, supervisorId, managerId, route.routeCode]
        );
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `Route` (`routeCode`, `routeName`, `channel`, `supervisorId`, `managerId`) VALUES (?, ?, ?, ?, ?)',
          [route.routeCode, route.routeName, channel, supervisorId, managerId]
        );
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async clearObsoleteRoutes(activeCodes: string[]): Promise<number> {
    if (activeCodes.length === 0) {
      const [result]: any = await pool.execute('DELETE FROM `Route`');
      return result.affectedRows || 0;
    } else {
      const placeholders = activeCodes.map(() => '?').join(',');
      const sql = `DELETE FROM \`Route\` WHERE \`routeCode\` NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeCodes);
      return result.affectedRows || 0;
    }
  },
};
