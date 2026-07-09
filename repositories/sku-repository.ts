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
    const [rows]: any = await pool.execute('SELECT `skuCode` FROM `SKU`');
    const existingCodes = new Set<string>(rows.map((r: any) => r.skuCode));

    let inserted = 0;
    let updated = 0;

    for (const sku of skus) {
      const typeVal = sku.type || 'SKU';
      if (existingCodes.has(sku.skuCode)) {
        await pool.execute(
          'UPDATE `SKU` SET `skuName` = ?, `type` = ? WHERE `skuCode` = ?',
          [sku.skuName, typeVal, sku.skuCode]
        );
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `SKU` (`skuCode`, `skuName`, `type`) VALUES (?, ?, ?)',
          [sku.skuCode, sku.skuName, typeVal]
        );
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async upsertPowerSkus(powerSkus: PowerSKU[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT CONCAT(`skuCode`, \'_\', `channel`) as pk FROM `PowerSKU`');
    const existingKeys = new Set<string>(rows.map((r: any) => r.pk));

    let inserted = 0;
    let updated = 0;

    for (const ps of powerSkus) {
      const key = `${ps.skuCode}_${ps.channel}`;
      if (existingKeys.has(key)) {
        await pool.execute(
          'UPDATE `PowerSKU` SET `skuName` = ? WHERE `skuCode` = ? AND `channel` = ?',
          [ps.skuName, ps.skuCode, ps.channel]
        );
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `PowerSKU` (`skuCode`, `skuName`, `channel`) VALUES (?, ?, ?)',
          [ps.skuCode, ps.skuName, ps.channel]
        );
        inserted++;
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
