import { SKU } from '@/types';
import pool from '@/lib/db';

function mapRowToSKU(row: any): SKU {
  return {
    skuCode: row.skuCode,
    skuName: row.skuName,
  };
}

export const skuRepository = {
  async getAllSkus(): Promise<SKU[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `SKU`');
    return rows.map(mapRowToSKU);
  },

  async upsertSkus(skus: SKU[]): Promise<{ inserted: number; updated: number }> {
    const [rows]: any = await pool.execute('SELECT `skuCode` FROM `SKU`');
    const existingCodes = new Set<string>(rows.map((r: any) => r.skuCode));

    let inserted = 0;
    let updated = 0;

    for (const sku of skus) {
      if (existingCodes.has(sku.skuCode)) {
        await pool.execute(
          'UPDATE `SKU` SET `skuName` = ? WHERE `skuCode` = ?',
          [sku.skuName, sku.skuCode]
        );
        updated++;
      } else {
        await pool.execute(
          'INSERT INTO `SKU` (`skuCode`, `skuName`) VALUES (?, ?)',
          [sku.skuCode, sku.skuName]
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
};
