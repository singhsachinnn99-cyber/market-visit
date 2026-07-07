import { getListItems, createListItem, updateListItem, deleteListItem } from './client';
import { Route } from '@/types';

const LIST_NAME = 'Routes';

const mapFieldsToRoute = (item: any): Route => {
  const f = item.fields;
  return {
    routeCode: f.Title || '',
    routeName: f.RouteName || '',
  };
};

export const sharepointRoutes = {
  async getAll(): Promise<Route[]> {
    const items = await getListItems(LIST_NAME);
    return items.map(mapFieldsToRoute);
  },

  async upsertMany(routes: Route[]): Promise<{ inserted: number; updated: number }> {
    const existingItems = await getListItems(LIST_NAME);
    const existingMap = new Map<string, { id: string; name: string }>(
      existingItems.map((item) => [
        item.fields.Title,
        { id: item.id, name: item.fields.RouteName || '' },
      ])
    );

    let inserted = 0;
    let updated = 0;

    for (const r of routes) {
      const match = existingMap.get(r.routeCode);
      if (match) {
        if (match.name !== r.routeName) {
          await updateListItem(LIST_NAME, match.id, { RouteName: r.routeName });
          updated++;
        }
      } else {
        await createListItem(LIST_NAME, {
          Title: r.routeCode,
          RouteName: r.routeName,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async deleteNotIn(activeCodes: string[]): Promise<number> {
    const existingItems = await getListItems(LIST_NAME);
    const activeSet = new Set(activeCodes);
    let deletedCount = 0;

    for (const item of existingItems) {
      const code = item.fields.Title;
      if (code && !activeSet.has(code)) {
        await deleteListItem(LIST_NAME, item.id);
        deletedCount++;
      }
    }

    return deletedCount;
  },
};
