import { Customer, CustomerRouteMapping } from '@/types';
import pool from '@/lib/db';

function mapRowToCustomer(row: any): Customer {
  return {
    cust_rt_id: row.cust_rt_id,
    customerCode: row.customerCode,
    customerName: row.customerName,
    classification: row.classification,
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
    const [rows]: any = await pool.execute('SELECT * FROM `Customer`');
    return rows.map(mapRowToCustomer);
  },

  async getCustomersByRoute(routeCode: string): Promise<Customer[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `Customer` WHERE `routeCode` = ?',
      [routeCode]
    );
    return rows.map(mapRowToCustomer);
  },

  async getCustomersBySupervisor(supervisorId: string): Promise<Customer[]> {
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
    const [rows]: any = await pool.execute('SELECT `cust_rt_id` FROM `Customer`');
    const existingIds = new Set<string>(rows.map((r: any) => r.cust_rt_id));

    let inserted = 0;
    let updated = 0;

    for (const cust of customers) {
      if (existingIds.has(cust.cust_rt_id)) {
        await pool.execute(
          `UPDATE \`Customer\` 
           SET \`customerName\` = ?, \`classification\` = ?, \`channel\` = ?, \`customerCode\` = ?, \`routeCode\` = ? 
           WHERE \`cust_rt_id\` = ?`,
          [cust.customerName, cust.classification, cust.channel, cust.customerCode, cust.routeCode, cust.cust_rt_id]
        );
        updated++;
      } else {
        await pool.execute(
          `INSERT INTO \`Customer\` (\`cust_rt_id\`, \`customerCode\`, \`customerName\`, \`classification\`, \`channel\`, \`routeCode\`) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [cust.cust_rt_id, cust.customerCode, cust.customerName, cust.classification, cust.channel, cust.routeCode]
        );
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async upsertMappings(mappings: CustomerRouteMapping[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT `cust_rt_id` FROM `CustomerRouteMapping`');
    const existingIds = new Set<string>(rows.map((r: any) => r.cust_rt_id));

    let inserted = 0;
    let updated = 0;

    for (const m of mappings) {
      if (!m.customerCode || !m.routeCode) continue;
      const cust_rt_id = m.cust_rt_id || `${m.customerCode}|${m.routeCode}`;

      if (existingIds.has(cust_rt_id)) {
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `CustomerRouteMapping` (`cust_rt_id`, `customerCode`, `routeCode`) VALUES (?, ?, ?)',
          [cust_rt_id, m.customerCode, m.routeCode]
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
      const sql = `DELETE FROM \`CustomerRouteMapping\` WHERE \`cust_rt_id\` NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeIds);
      return result.affectedRows || 0;
    }
  },
};
