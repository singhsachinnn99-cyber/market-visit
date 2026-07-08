import { Route } from '@/types';
import pool from '@/lib/db';

function mapRowToRoute(row: any): Route {
  return {
    routeCode: row.routeCode,
    routeName: row.routeName,
  };
}

export const routeRepository = {
  async getAllRoutes(): Promise<Route[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `Route`');
    return rows.map(mapRowToRoute);
  },

  async upsertRoutes(routes: Route[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT `routeCode` FROM `Route`');
    const existingCodes = new Set<string>(rows.map((r: any) => r.routeCode));

    let inserted = 0;
    let updated = 0;

    for (const route of routes) {
      if (existingCodes.has(route.routeCode)) {
        await pool.execute(
          'UPDATE `Route` SET `routeName` = ? WHERE `routeCode` = ?',
          [route.routeName, route.routeCode]
        );
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `Route` (`routeCode`, `routeName`) VALUES (?, ?)',
          [route.routeCode, route.routeName]
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
