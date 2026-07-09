import { SKU, PowerSKU } from '@/types';
import pool from '@/lib/db';

function mapRowToSKU(row: any): SKU {
  return {
    skuCode: row.skuCode,
    skuName: row.skuName,
    type: row.type || 'SKU',
  };
}

function mapRowToPowerSKU(row: any): PowerSKU {
  return {
    skuCode: row.skuCode,
    skuName: row.skuName,
    channel: row.channel,
  };
}

export const skuRepository = {
  async getAllSkus(): Promise<SKU[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `SKU`');
    return rows.map(mapRowToSKU);
  },

  async getSkusByType(type: string): Promise<SKU[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `SKU` WHERE `type` = ?', [type]);
    return rows.map(mapRowToSKU);
  },

  async getAllPowerSkus(): Promise<PowerSKU[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `PowerSKU`');
    return rows.map(mapRowToPowerSKU);
  },

  async getPowerSkusByChannel(channel: string): Promise<PowerSKU[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `PowerSKU` WHERE `channel` = ?', [channel]);
    return rows.map(mapRowToPowerSKU);
  },

  async upsertSkus(skus: SKU[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    for (const sku of skus) {
      const typeVal = sku.type || 'SKU';
      const [res]: any = await pool.execute(
        `INSERT INTO \`SKU\` (\`skuCode\`, \`skuName\`, \`type\`) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           \`skuName\` = VALUES(\`skuName\`),
           \`type\` = VALUES(\`type\`)`,
        [sku.skuCode, sku.skuName, typeVal]
      );
      if (res.affectedRows === 1) {
        inserted++;
      } else {
        updated++;
      }
    }

    return { inserted, updated };
  },

  async upsertPowerSkus(powerSkus: PowerSKU[]): Promise<{ inserted: number; updated: number }> {
    let inserted = 0;
    let updated = 0;

    for (const ps of powerSkus) {
      const [res]: any = await pool.execute(
        `INSERT INTO \`PowerSKU\` (\`skuCode\`, \`skuName\`, \`channel\`) 
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           \`skuName\` = VALUES(\`skuName\`)`,
        [ps.skuCode, ps.skuName, ps.channel]
      );
      if (res.affectedRows === 1) {
        inserted++;
      } else {
        updated++;
      }
    }

    return { inserted, updated };
  },

  async clearObsoleteSkus(activeCodes: string[]): Promise<number> {
    if (activeCodes.length === 0) {
      const [result]: any = await pool.execute('DELETE FROM `SKU`');
      return result.affectedRows || 0;
    } else {
      const placeholders = activeCodes.map(() => '?').join(',');
      const sql = `DELETE FROM \`SKU\` WHERE \`skuCode\` NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeCodes);
      return result.affectedRows || 0;
    }
  },

  async clearObsoletePowerSkus(activeKeys: string[]): Promise<number> {
    if (activeKeys.length === 0) {
      const [result]: any = await pool.execute('DELETE FROM `PowerSKU`');
      return result.affectedRows || 0;
    } else {
      const placeholders = activeKeys.map(() => '?').join(',');
      const sql = `DELETE FROM \`PowerSKU\` WHERE CONCAT(\`skuCode\`, '_', \`channel\`) NOT IN (${placeholders})`;
      const [result]: any = await pool.execute(sql, activeKeys);
      return result.affectedRows || 0;
    }
  },
};
