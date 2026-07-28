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
    ];
    for (const p of patches) {
      await pool.execute(
        `UPDATE \`Customer\` 
         SET \`dairyClassification\` = ?, \`iceCreamClassification\` = ? 
         WHERE (UPPER(TRIM(\`customerCode\`)) = ? OR UPPER(TRIM(\`customerCode\`)) = ?)
           AND (\`dairyClassification\` IS NULL OR \`iceCreamClassification\` IS NULL)`,
        [p.dairy, p.ice, p.code.toUpperCase(), p.code.startsWith('C') ? p.code.substring(1) : `C${p.code}`]
      );
    }
  } catch (e) {
    // Non-blocking patch check
  }
}

function mapRowToCustomer(row: any): Customer {
  return {
    cust_rt_id: row.cust_rt_id || `${row.customerCode}|${row.routeCode}`,
    customerCode: row.customerCode,
    customerName: row.customerName,
    classification: row.classification,
    dairyClassification: row.dairyClassification || row.dairy_classification || null,
    iceCreamClassification: row.iceCreamClassification || row.ice_cream_classification || null,
    channel: row.channel,
    routeCode: row.routeCode,
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
    const [rows]: any = await pool.execute('SELECT * FROM `Customer`');
    return rows.map(mapRowToCustomer);
  },

  async getCustomersByRoute(routeCode: string): Promise<Customer[]> {
    await ensureCustomerTableSchema();
    const [rows]: any = await pool.execute(
      'SELECT c.`cust_rt_id`, c.`customerCode`, c.`customerName`, c.`classification`, c.`dairyClassification`, c.`iceCreamClassification`, c.`channel`, m.`routeCode`'
      + ' FROM `Customer` c'
      + ' INNER JOIN `CustomerRouteMapping` m ON c.`cust_rt_id` = m.`cust_rt_id`'
      + ' INNER JOIN `Route` r ON m.`routeCode` = r.`routeCode`'
      + ' WHERE m.`routeCode` = ?'
      + "   AND (r.`channel` IS NULL OR TRIM(r.`channel`) = '' OR UPPER(TRIM(c.`channel`)) = UPPER(TRIM(r.`channel`)))",
      [routeCode]
    );
    return rows.map(mapRowToCustomer);
  },

  async getCustomersBySupervisor(supervisorId: string): Promise<Customer[]> {
    await ensureCustomerTableSchema();
    const [rows]: any = await pool.execute(
      `SELECT c.* FROM \`Customer\` c 
       INNER JOIN \`Route\` r ON c.\`routeCode\` = r.\`routeCode\` 
       WHERE r.\`supervisorId\` = ?`,
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
             \`dairyClassification\` = VALUES(\`dairyClassification\`),
             \`iceCreamClassification\` = VALUES(\`iceCreamClassification\`),
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
