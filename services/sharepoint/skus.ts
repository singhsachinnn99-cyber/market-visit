import { getListItems, createListItem, updateListItem, deleteListItem } from './client';
import { SKU } from '@/types';

const LIST_NAME = 'SKUs';

const mapFieldsToSKU = (item: any): SKU => {
  const f = item.fields;
  return {
    skuCode: f.Title || '',
    skuName: f.SKUName || '',
  };
};

export const sharepointSkus = {
  async getAll(): Promise<SKU[]> {
    const items = await getListItems(LIST_NAME);
    return items.map(mapFieldsToSKU);
  },

  async upsertMany(skus: SKU[]): Promise<{ inserted: number; updated: number }> {
    const existing = await getListItems(LIST_NAME);
    const existingMap = new Map<string, { id: string; name: string }>(
      existing.map((item) => [
        item.fields.Title,
        { id: item.id, name: item.fields.SKUName || '' },
      ])
    );

    let inserted = 0;
    let updated = 0;

    for (const s of skus) {
      const match = existingMap.get(s.skuCode);
      if (match) {
        if (match.name !== s.skuName) {
          await updateListItem(LIST_NAME, match.id, { SKUName: s.skuName });
          updated++;
        }
      } else {
        await createListItem(LIST_NAME, {
          Title: s.skuCode,
          SKUName: s.skuName,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async deleteNotIn(activeCodes: string[]): Promise<number> {
    const existing = await getListItems(LIST_NAME);
    const activeSet = new Set(activeCodes);
    let deletedCount = 0;

    for (const item of existing) {
      const code = item.fields.Title;
      if (code && !activeSet.has(code)) {
        await deleteListItem(LIST_NAME, item.id);
        deletedCount++;
      }
    }

    return deletedCount;
  },
};
