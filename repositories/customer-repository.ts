import { Customer, CustomerRouteMapping } from '@/types';
import pool from '@/lib/db';

function mapRowToCustomer(row: any): Customer {
  return {
    customerCode: row.customerCode,
    customerName: row.customerName,
    classification: row.classification,
    channel: row.channel,
  };
}

function mapRowToMapping(row: any): CustomerRouteMapping {
  return {
    id: `${row.customerCode}_${row.routeCode}`,
    customerCode: row.customerCode,
    routeCode: row.routeCode,
  };
}

export const customerRepository = {
  async getAllCustomers(): Promise<Customer[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `Customer`');
    return rows.map(mapRowToCustomer);
  },

  async getCustomersByRoute(routeCode: string): Promise<Customer[]> {
    const [rows]: any = await pool.execute(
      `SELECT c.* FROM \`Customer\` c 
       INNER JOIN \`CustomerRouteMapping\` m ON c.\`customerCode\` = m.\`customerCode\` 
       WHERE m.\`routeCode\` = ?`,
      [routeCode]
    );
    return rows.map(mapRowToCustomer);
  },

  async getMappings(): Promise<CustomerRouteMapping[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `CustomerRouteMapping`');
    return rows.map(mapRowToMapping);
  },

  async upsertCustomers(customers: Customer[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT `customerCode` FROM `Customer`');
    const existingCodes = new Set<string>(rows.map((r: any) => r.customerCode));

    let inserted = 0;
    let updated = 0;

    for (const cust of customers) {
      if (existingCodes.has(cust.customerCode)) {
        await pool.execute(
          `UPDATE \`Customer\` 
           SET \`customerName\` = ?, \`classification\` = ?, \`channel\` = ? 
           WHERE \`customerCode\` = ?`,
          [cust.customerName, cust.classification, cust.channel, cust.customerCode]
        );
        updated++;
      } else {
        await pool.execute(
          `INSERT INTO \`Customer\` (\`customerCode\`, \`customerName\`, \`classification\`, \`channel\`) 
           VALUES (?, ?, ?, ?)`,
          [cust.customerCode, cust.customerName, cust.classification, cust.channel]
        );
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async upsertMappings(mappings: CustomerRouteMapping[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT `customerCode`, `routeCode` FROM `CustomerRouteMapping`');
    const existingMappings = new Set<string>(
      rows.map((r: any) => `${r.customerCode}_${r.routeCode}`)
    );

    let inserted = 0;
    let updated = 0;

    for (const m of mappings) {
      if (!m.customerCode || !m.routeCode) continue;
      const key = `${m.customerCode}_${m.routeCode}`;

      if (existingMappings.has(key)) {
        // Composite key matches, no other columns to update
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `CustomerRouteMapping` (`customerCode`, `routeCode`) VALUES (?, ?)',
          [m.customerCode, m.routeCode]
        );
        inserted++;
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
      const sql = `DELETE FROM \`CustomerRouteMapping\` WHERE CONCAT(\`customerCode\`, '_', \`routeCode\`) NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeIds);
      return result.affectedRows || 0;
    }
  },
};
