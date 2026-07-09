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
    let inserted = 0;
    let updated = 0;

    for (const route of routes) {
      const supervisorId = route.supervisorId || null;
      const managerId = route.managerId || null;
      const channel = route.channel || 'GT';

      const [res]: any = await pool.execute(
        `INSERT INTO \`Route\` (\`routeCode\`, \`routeName\`, \`channel\`, \`supervisorId\`, \`managerId\`) 
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           \`routeName\` = VALUES(\`routeName\`),
           \`channel\` = VALUES(\`channel\`),
           \`supervisorId\` = VALUES(\`supervisorId\`),
           \`managerId\` = VALUES(\`managerId\`)`,
        [route.routeCode, route.routeName, channel, supervisorId, managerId]
      );
      if (res.affectedRows === 1) {
        inserted++;
      } else {
        updated++;
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
