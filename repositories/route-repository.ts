import { Route } from '@/types';
import pool from '@/lib/db';

function mapRowToRoute(row: any): Route {
  return {
    routeCode: row.routeCode,
    routeName: row.routeName,
    channel: row.channel,
    supervisorId: row.supervisorId,
    managerId: row.managerId,
    superName: row.superName,
  };
}

let routeSchemaChecked = false;

async function ensureRouteTableSchema(): Promise<void> {
  if (routeSchemaChecked) return;
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`Manager\` (
        \`id\` VARCHAR(191) PRIMARY KEY,
        \`name\` VARCHAR(191) UNIQUE NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`Route\` (
        \`routeCode\` VARCHAR(191) PRIMARY KEY,
        \`routeName\` VARCHAR(191) NOT NULL,
        \`channel\` VARCHAR(191) NOT NULL DEFAULT 'GT',
        \`supervisorId\` VARCHAR(191) NULL,
        \`managerId\` VARCHAR(191) NULL,
        \`superName\` VARCHAR(191) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const [columnsResult]: any = await pool.execute(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Route'"
    );
    const existingColumns = new Set((columnsResult as any[]).map((row: any) => row.COLUMN_NAME));

    const migrations: string[] = [];
    if (!existingColumns.has('channel')) {
      migrations.push("ALTER TABLE `Route` ADD COLUMN `channel` VARCHAR(191) NOT NULL DEFAULT 'GT'");
    }
    if (!existingColumns.has('supervisorId')) {
      migrations.push("ALTER TABLE `Route` ADD COLUMN `supervisorId` VARCHAR(191) NULL");
    }
    if (!existingColumns.has('managerId')) {
      migrations.push("ALTER TABLE `Route` ADD COLUMN `managerId` VARCHAR(191) NULL");
    }
    if (!existingColumns.has('superName')) {
      migrations.push("ALTER TABLE `Route` ADD COLUMN `superName` VARCHAR(191) NULL");
    }

    for (const migration of migrations) {
      try {
        await pool.execute(migration);
      } catch (error: any) {
        if (!/duplicate column|already exists|doesn't exist|Unknown column/i.test(error.message || '')) {
          // ignore duplicate column errors
        }
      }
    }

    routeSchemaChecked = true;
  } catch (err) {
    console.error('Failed to ensure Route table schema:', err);
  }
}

export const routeRepository = {
  async getAllRoutes(): Promise<Route[]> {
    await ensureRouteTableSchema();
    const [rows]: any = await pool.execute('SELECT * FROM `Route`');
    return rows.map(mapRowToRoute);
  },

  async getRoutesBySupervisor(supervisorId: string): Promise<Route[]> {
    await ensureRouteTableSchema();
    const [rows]: any = await pool.execute(
      'SELECT * FROM `Route` WHERE `supervisorId` = ?',
      [supervisorId]
    );
    return rows.map(mapRowToRoute);
  },

  async isRouteAssignedToSupervisor(routeCode: string, supervisorId: string, supervisorName?: string): Promise<boolean> {
    await ensureRouteTableSchema();
    let sql = 'SELECT 1 FROM `Route` WHERE `routeCode` = ? AND (`supervisorId` = ?';
    const params: any[] = [routeCode, supervisorId];
    if (supervisorName) {
      const normalizedName = supervisorName.trim().toLowerCase().replace(/\s+/g, '');
      sql += ' OR (LOWER(REPLACE(IFNULL(`superName`, \'\'), \' \', \'\')) = ?)';
      params.push(normalizedName);
    }
    sql += ') LIMIT 1';

    const [rows]: any = await pool.execute(sql, params);
    if (rows.length > 0) return true;

    // Fallback: If route has no supervisor assigned, permit access
    const [unassigned]: any = await pool.execute(
      'SELECT 1 FROM `Route` WHERE `routeCode` = ? AND (`supervisorId` IS NULL OR TRIM(`supervisorId`) = \'\') AND (`superName` IS NULL OR TRIM(`superName`) = \'\') LIMIT 1',
      [routeCode]
    );
    return unassigned.length > 0;
  },

  async upsertRoutes(routes: Route[]): Promise<{ inserted: number; updated: number }> {
    await ensureRouteTableSchema();
    let inserted = 0;
    let updated = 0;

    for (const route of routes) {
      const supervisorId = route.supervisorId || null;
      const managerId = route.managerId || null;
      const channel = route.channel || 'GT';
      const superName = route.superName || null;

      const [res]: any = await pool.execute(
        `INSERT INTO \`Route\` (\`routeCode\`, \`routeName\`, \`channel\`, \`supervisorId\`, \`managerId\`, \`superName\`)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           \`routeName\` = VALUES(\`routeName\`),
           \`channel\` = VALUES(\`channel\`),
           \`supervisorId\` = VALUES(\`supervisorId\`),
           \`managerId\` = VALUES(\`managerId\`),
           \`superName\` = VALUES(\`superName\`)`,
        [route.routeCode, route.routeName, channel, supervisorId, managerId, superName]
      );
      if (res.affectedRows === 1) {
        inserted++;
      } else {
        updated++;
      }
    }

    return { inserted, updated };
  },

  async backfillSupervisorByName(supervisorId: string, supervisorName: string): Promise<number> {
    await ensureRouteTableSchema();
    const normalizedName = supervisorName.trim().toLowerCase().replace(/\s+/g, '');
    const [rows]: any = await pool.execute(
      'SELECT `routeCode` FROM `Route` WHERE `supervisorId` IS NULL AND `superName` IS NOT NULL AND LOWER(REPLACE(`superName`, \' \', \'\')) = ?',
      [normalizedName]
    );
    if (rows.length === 0) return 0;

    const routeCodes = rows.map((r: any) => r.routeCode);
    const placeholders = routeCodes.map(() => '?').join(',');
    const [result]: any = await pool.execute(
      `UPDATE \`Route\` SET \`supervisorId\` = ? WHERE \`routeCode\` IN (${placeholders})`,
      [supervisorId, ...routeCodes]
    );
    return result.affectedRows || 0;
  },

  async clearObsoleteRoutes(activeCodes: string[]): Promise<number> {
    await ensureRouteTableSchema();
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
