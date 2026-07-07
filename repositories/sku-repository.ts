import { mockDb } from '@/services/mock-db';
import { SKU } from '@/types';

const isSharePoint = () => {
  return !!(
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_SITE_ID
  );
};

export const skuRepository = {
  async getAllSkus(): Promise<SKU[]> {
    if (isSharePoint()) {
      try {
        const { sharepointSkus } = require('@/services/sharepoint/skus');
        return await sharepointSkus.getAll();
      } catch (error) {
        console.error('SharePoint SKUs error, falling back to mock:', error);
      }
    }
    return mockDb.getSKUs();
  },

  async upsertSkus(skus: SKU[]): Promise<{ inserted: number; updated: number }> {
    if (isSharePoint()) {
      try {
        const { sharepointSkus } = require('@/services/sharepoint/skus');
        return await sharepointSkus.upsertMany(skus);
      } catch (error) {
        console.error('SharePoint SKUs error, falling back to mock:', error);
      }
    }

    const existing = mockDb.getSKUs();
    let inserted = 0;
    let updated = 0;
    const skuMap = new Map(existing.map((s) => [s.skuCode, s]));

    skus.forEach((sku) => {
      if (skuMap.has(sku.skuCode)) {
        skuMap.set(sku.skuCode, { ...skuMap.get(sku.skuCode)!, ...sku });
        updated++;
      } else {
        skuMap.set(sku.skuCode, sku);
        inserted++;
      }
    });

    mockDb.saveSKUs(Array.from(skuMap.values()));
    return { inserted, updated };
  },

  async clearObsoleteSkus(activeCodes: string[]): Promise<number> {
    if (isSharePoint()) {
      try {
        const { sharepointSkus } = require('@/services/sharepoint/skus');
        return await sharepointSkus.deleteNotIn(activeCodes);
      } catch (error) {
        console.error('SharePoint SKUs error, falling back to mock:', error);
      }
    }

    const existing = mockDb.getSKUs();
    const beforeCount = existing.length;
    const activeSet = new Set(activeCodes);
    const kept = existing.filter((s) => activeSet.has(s.skuCode));
    mockDb.saveSKUs(kept);
    return beforeCount - kept.length;
  },
};
