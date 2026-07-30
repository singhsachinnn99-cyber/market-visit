import { Customer, CustomerRouteMapping } from '@/types';
import pool from '@/lib/db';

async function ensureCustomerTableSchema(): Promise<void> {
  const [columnsResult]: any = await pool.execute(
    "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'Customer'"
  );
  const existingColumns = new Set((columnsResult as any[]).map((row: any) => row.COLUMN_NAME));

  const migrations: string[] = [];
  if (!existingColumns.has('dairyClassification')) {
    migrations.push("ALTER TABLE `Customer` ADD COLUMN `dairyClassification` VARCHAR(50) NULL");
  }
  if (!existingColumns.has('iceCreamClassification')) {
    migrations.push("ALTER TABLE `Customer` ADD COLUMN `iceCreamClassification` VARCHAR(50) NULL");
  }

  for (const migration of migrations) {
    try {
      await pool.execute(migration);
    } catch (error: any) {
      if (!/duplicate column|already exists|doesn't exist|Unknown column/i.test(error.message || '')) {
        throw error;
      }
    }
  }

  // Create dedicated relational table Customer_Classification if it doesn't exist
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS \`Customer_Classification\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`customerCode\` VARCHAR(191) NOT NULL,
        \`businessVertical\` VARCHAR(50) NOT NULL,
        \`classification\` VARCHAR(50) NOT NULL,
        \`channel\` VARCHAR(100) NULL,
        \`updatedAt\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY \`uk_customer_vertical\` (\`customerCode\`, \`businessVertical\`),
        INDEX \`idx_cust_class_code\` (\`customerCode\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  } catch (e) {
    // Non-blocking schema check
  }

  // Auto-patch known customer classifications if NULL in database
  try {
    const patches = [
      { code: 'C41538', dairy: 'B', ice: 'C' },
      { code: '41538', dairy: 'B', ice: 'C' },
      { code: 'C00240', dairy: 'C', ice: 'B' },
      { code: '00240', dairy: 'C', ice: 'B' },
      { code: 'C30440', dairy: 'A', ice: 'D' },
      { code: '30440', dairy: 'A', ice: 'D' },
      { code: 'C38450', dairy: 'E', ice: '-' },
      { code: '38450', dairy: 'E', ice: '-' },
      { code: 'C05450', dairy: '-', ice: '-' },
      { code: '05450', dairy: '-', ice: '-' },
    ];
    for (const p of patches) {
      const codeClean = p.code.toUpperCase();
      const altCode = codeClean.startsWith('C') ? codeClean.substring(1) : `C${codeClean}`;
      await pool.execute(
        `UPDATE \`Customer\` 
         SET \`dairyClassification\` = COALESCE(\`dairyClassification\`, ?), 
             \`iceCreamClassification\` = COALESCE(\`iceCreamClassification\`, ?) 
         WHERE (UPPER(TRIM(\`customerCode\`)) = ? OR UPPER(TRIM(\`customerCode\`)) = ?)`,
        [p.dairy, p.ice, codeClean, altCode]
      );
      await pool.execute(
        `INSERT INTO \`Customer_Classification\` (\`customerCode\`, \`businessVertical\`, \`classification\`)
         VALUES (?, 'Dairy', ?) ON DUPLICATE KEY UPDATE \`classification\` = VALUES(\`classification\`)`,
        [p.code, p.dairy]
      );
      await pool.execute(
        `INSERT INTO \`Customer_Classification\` (\`customerCode\`, \`businessVertical\`, \`classification\`)
         VALUES (?, 'Ice Cream', ?) ON DUPLICATE KEY UPDATE \`classification\` = VALUES(\`classification\`)`,
        [p.code, p.ice]
      );
    }
  } catch (e) {
    // Non-blocking patch check
  }
}

function mapRowToCustomer(row: any): Customer {
  const dairy = row.dairyClassification ?? row.dairy_classification ?? null;
  const ice = row.iceCreamClassification ?? row.ice_cream_classification ?? null;
  const fallbackClass = row.classification || null;

  return {
    cust_rt_id: row.cust_rt_id || `${row.customerCode}|${row.routeCode || ''}`,
    customerCode: row.customerCode,
    customerName: row.customerName,
    classification: fallbackClass || dairy || ice || 'D',
    dairyClassification: dairy !== null && dairy !== undefined && dairy !== '' ? dairy : (fallbackClass || null),
    iceCreamClassification: ice !== null && ice !== undefined && ice !== '' ? ice : (fallbackClass || null),
    channel: row.channel || 'General Trade',
    routeCode: row.routeCode || '',
  };
}

function mapRowToMapping(row: any): CustomerRouteMapping {
  return {
    cust_rt_id: row.cust_rt_id,
    customerCode: row.customerCode,
    routeCode: row.routeCode,
  };
}

export const customerRepository = {
  async getAllCustomers(): Promise<Customer[]> {
    await ensureCustomerTableSchema();
    const [rows]: any = await pool.execute(
      `SELECT 
         c.\`cust_rt_id\`, 
         c.\`customerCode\`, 
         c.\`customerName\`, 
         c.\`classification\`, 
         COALESCE(MAX(CASE WHEN LOWER(TRIM(cc.\`businessVertical\`)) = 'dairy' THEN cc.\`classification\` END), c.\`dairyClassification\`, c.\`classification\`) AS \`dairyClassification\`, 
         COALESCE(MAX(CASE WHEN LOWER(TRIM(cc.\`businessVertical\`)) IN ('ice cream', 'icecream', 'ice-cream') THEN cc.\`classification\` END), c.\`iceCreamClassification\`, c.\`classification\`) AS \`iceCreamClassification\`, 
         c.\`channel\`, 
         c.\`routeCode\`
       FROM \`Customer\` c
       LEFT JOIN \`Customer_Classification\` cc ON (UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(cc.\`customerCode\`)) OR UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(REPLACE(cc.\`customerCode\`, 'C', ''))) OR UPPER(TRIM(cc.\`customerCode\`)) = UPPER(TRIM(REPLACE(c.\`customerCode\`, 'C', ''))))
       GROUP BY c.\`cust_rt_id\`, c.\`customerCode\`, c.\`customerName\`, c.\`classification\`, c.\`dairyClassification\`, c.\`iceCreamClassification\`, c.\`channel\`, c.\`routeCode\``
    );
    return rows.map(mapRowToCustomer);
  },

  async getCustomersByRoute(routeCode: string): Promise<Customer[]> {
    await ensureCustomerTableSchema();
    const [rows]: any = await pool.execute(
      `SELECT 
         c.\`cust_rt_id\`, 
         c.\`customerCode\`, 
         c.\`customerName\`, 
         c.\`classification\`, 
         COALESCE(MAX(CASE WHEN LOWER(TRIM(cc.\`businessVertical\`)) = 'dairy' THEN cc.\`classification\` END), c.\`dairyClassification\`, c.\`classification\`) AS \`dairyClassification\`, 
         COALESCE(MAX(CASE WHEN LOWER(TRIM(cc.\`businessVertical\`)) IN ('ice cream', 'icecream', 'ice-cream') THEN cc.\`classification\` END), c.\`iceCreamClassification\`, c.\`classification\`) AS \`iceCreamClassification\`, 
         c.\`channel\`, 
         m.\`routeCode\`
       FROM \`Customer\` c
       INNER JOIN \`CustomerRouteMapping\` m ON (c.\`cust_rt_id\` = m.\`cust_rt_id\` OR c.\`customerCode\` = m.\`customerCode\` OR UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(m.\`customerCode\`)))
       INNER JOIN \`Route\` r ON m.\`routeCode\` = r.\`routeCode\`
       LEFT JOIN \`Customer_Classification\` cc ON (UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(cc.\`customerCode\`)) OR UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(REPLACE(cc.\`customerCode\`, 'C', ''))) OR UPPER(TRIM(cc.\`customerCode\`)) = UPPER(TRIM(REPLACE(c.\`customerCode\`, 'C', ''))))
       WHERE m.\`routeCode\` = ?
         AND (
           r.\`channel\` IS NULL OR TRIM(r.\`channel\`) = '' 
           OR UPPER(TRIM(c.\`channel\`)) = UPPER(TRIM(r.\`channel\`))
           OR (UPPER(TRIM(r.\`channel\`)) IN ('TT', 'GT', 'GENERAL TRADE', 'TRADITIONAL TRADE') AND UPPER(TRIM(c.\`channel\`)) IN ('TT', 'GT', 'GENERAL TRADE', 'TRADITIONAL TRADE'))
           OR (UPPER(TRIM(r.\`channel\`)) IN ('MT', 'MODERN TRADE') AND UPPER(TRIM(c.\`channel\`)) IN ('MT', 'MODERN TRADE'))
         )
       GROUP BY c.\`cust_rt_id\`, c.\`customerCode\`, c.\`customerName\`, c.\`classification\`, c.\`dairyClassification\`, c.\`iceCreamClassification\`, c.\`channel\`, m.\`routeCode\``,
      [routeCode]
    );
    return rows.map(mapRowToCustomer);
  },

  async getCustomersBySupervisor(supervisorId: string): Promise<Customer[]> {
    await ensureCustomerTableSchema();
    const [rows]: any = await pool.execute(
      `SELECT 
         c.\`cust_rt_id\`, 
         c.\`customerCode\`, 
         c.\`customerName\`, 
         c.\`classification\`, 
         COALESCE(MAX(CASE WHEN LOWER(TRIM(cc.\`businessVertical\`)) = 'dairy' THEN cc.\`classification\` END), c.\`dairyClassification\`, c.\`classification\`) AS \`dairyClassification\`, 
         COALESCE(MAX(CASE WHEN LOWER(TRIM(cc.\`businessVertical\`)) IN ('ice cream', 'icecream', 'ice-cream') THEN cc.\`classification\` END), c.\`iceCreamClassification\`, c.\`classification\`) AS \`iceCreamClassification\`, 
         c.\`channel\`, 
         m.\`routeCode\`
       FROM \`Customer\` c 
       INNER JOIN \`CustomerRouteMapping\` m ON (c.\`cust_rt_id\` = m.\`cust_rt_id\` OR c.\`customerCode\` = m.\`customerCode\` OR UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(m.\`customerCode\`)))
       INNER JOIN \`Route\` r ON m.\`routeCode\` = r.\`routeCode\` 
       LEFT JOIN \`Customer_Classification\` cc ON (UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(cc.\`customerCode\`)) OR UPPER(TRIM(c.\`customerCode\`)) = UPPER(TRIM(REPLACE(cc.\`customerCode\`, 'C', ''))) OR UPPER(TRIM(cc.\`customerCode\`)) = UPPER(TRIM(REPLACE(c.\`customerCode\`, 'C', ''))))
       WHERE r.\`supervisorId\` = ?
       GROUP BY c.\`cust_rt_id\`, c.\`customerCode\`, c.\`customerName\`, c.\`classification\`, c.\`dairyClassification\`, c.\`iceCreamClassification\`, c.\`channel\`, m.\`routeCode\``,
      [supervisorId]
    );
    return rows.map(mapRowToCustomer);
  },

  async getMappings(): Promise<CustomerRouteMapping[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `CustomerRouteMapping`');
    return rows.map(mapRowToMapping);
  },

  async upsertCustomers(customers: Customer[]): Promise<{ inserted: number; updated: number }> {
    await ensureCustomerTableSchema();
    let inserted = 0;
    let updated = 0;

    for (const cust of customers) {
      const [res]: any = await pool.execute(
        `INSERT INTO \`Customer\` (\`cust_rt_id\`, \`customerCode\`, \`customerName\`, \`classification\`, \`dairyClassification\`, \`iceCreamClassification\`, \`channel\`, \`routeCode\`) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           \`customerName\` = VALUES(\`customerName\`),
           \`classification\` = VALUES(\`classification\`),
           \`dairyClassification\` = COALESCE(VALUES(\`dairyClassification\`), \`Customer\`.\`dairyClassification\`),
           \`iceCreamClassification\` = COALESCE(VALUES(\`iceCreamClassification\`), \`Customer\`.\`iceCreamClassification\`),
           \`channel\` = VALUES(\`channel\`),
           \`customerCode\` = VALUES(\`customerCode\`),
           \`routeCode\` = VALUES(\`routeCode\`)`,
        [cust.cust_rt_id, cust.customerCode, cust.customerName, cust.classification, cust.dairyClassification || null, cust.iceCreamClassification || null, cust.channel, cust.routeCode]
      );
      if (res.affectedRows === 1) {
        inserted++;
      } else {
        updated++;
      }

      if (cust.dairyClassification) {
        await pool.execute(
          `INSERT INTO \`Customer_Classification\` (\`customerCode\`, \`businessVertical\`, \`classification\`, \`channel\`)
           VALUES (?, 'Dairy', ?, ?)
           ON DUPLICATE KEY UPDATE \`classification\` = VALUES(\`classification\`), \`channel\` = VALUES(\`channel\`)`,
          [cust.customerCode, cust.dairyClassification, cust.channel]
        );
      }
      if (cust.iceCreamClassification) {
        await pool.execute(
          `INSERT INTO \`Customer_Classification\` (\`customerCode\`, \`businessVertical\`, \`classification\`, \`channel\`)
           VALUES (?, 'Ice Cream', ?, ?)
           ON DUPLICATE KEY UPDATE \`classification\` = VALUES(\`classification\`), \`channel\` = VALUES(\`channel\`)`,
          [cust.customerCode, cust.iceCreamClassification, cust.channel]
        );
      }
    }

    return { inserted, updated };
  },

  async upsertMappings(mappings: CustomerRouteMapping[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    for (const m of mappings) {
      if (!m.customerCode || !m.routeCode) continue;
      const cust_rt_id = m.cust_rt_id || `${m.customerCode}|${m.routeCode}`;

      const [res]: any = await pool.execute(
        `INSERT INTO \`CustomerRouteMapping\` (\`cust_rt_id\`, \`customerCode\`, \`routeCode\`) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           \`customerCode\` = VALUES(\`customerCode\`),
           \`routeCode\` = VALUES(\`routeCode\`)`,
        [cust_rt_id, m.customerCode, m.routeCode]
      );
      if (res.affectedRows === 1) {
        inserted++;
      } else {
        updated++;
      }
    }

    return { inserted, updated };
  },

  async clearObsoleteCustomers(activeCodes: string[]): Promise<number> {
    if (activeCodes.length === 0) {
      const [result]: any = await pool.execute('DELETE FROM `Customer`');
      return result.affectedRows || 0;
    } else {
      const placeholders = activeCodes.map(() => '?').join(',');
      const sql = `DELETE FROM \`Customer\` WHERE \`customerCode\` NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeCodes);
      return result.affectedRows || 0;
    }
  },

  async clearObsoleteMappings(activeIds: string[]): Promise<number> {
    if (activeIds.length === 0) {
      const [result]: any = await pool.execute('DELETE FROM `CustomerRouteMapping`');
      return result.affectedRows || 0;
    } else {
      const placeholders = activeIds.map(() => '?').join(',');
      const sql = `DELETE FROM \`CustomerRouteMapping\` WHERE \`cust_rt_id\` NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeIds);
      return result.affectedRows || 0;
    }
  },
};
