import { getListItems, createListItem, updateListItem, deleteListItem } from './client';
import { Customer, CustomerRouteMapping } from '@/types';

const CUST_LIST = 'Customers';
const MAP_LIST = 'CustomerRouteMapping';

const mapFieldsToCustomer = (item: any): Customer => {
  const f = item.fields;
  return {
    customerCode: f.Title || '',
    customerName: f.CustomerName || '',
    classification: f.Classification || '',
    channel: f.Channel || '',
  };
};

const mapFieldsToMapping = (item: any): CustomerRouteMapping => {
  const f = item.fields;
  return {
    id: f.Title || '',
    customerCode: f.CustomerCode || '',
    routeCode: f.RouteCode || '',
  };
};

export const sharepointCustomers = {
  async getAll(): Promise<Customer[]> {
    const items = await getListItems(CUST_LIST);
    return items.map(mapFieldsToCustomer);
  },

  async getMappings(): Promise<CustomerRouteMapping[]> {
    const items = await getListItems(MAP_LIST);
    return items.map(mapFieldsToMapping);
  },

  async getByRoute(routeCode: string): Promise<Customer[]> {
    const mappings = await getListItems(
      MAP_LIST,
      `&$filter=fields/RouteCode eq '${encodeURIComponent(routeCode)}'`
    );
    const codes = mappings.map((m) => m.fields.CustomerCode).filter(Boolean);
    if (codes.length === 0) return [];

    const customers = await this.getAll();
    const codeSet = new Set(codes);
    return customers.filter((c) => codeSet.has(c.customerCode));
  },

  async upsertMany(customers: Customer[]): Promise<{ inserted: number; updated: number }> {
    const existing = await getListItems(CUST_LIST);
    const existingMap = new Map<string, { id: string; name: string; class: string; chan: string }>(
      existing.map((item) => [
        item.fields.Title,
        {
          id: item.id,
          name: item.fields.CustomerName || '',
          class: item.fields.Classification || '',
          chan: item.fields.Channel || '',
        },
      ])
    );

    let inserted = 0;
    let updated = 0;

    for (const c of customers) {
      const match = existingMap.get(c.customerCode);
      if (match) {
        if (
          match.name !== c.customerName ||
          match.class !== c.classification ||
          match.chan !== c.channel
        ) {
          await updateListItem(CUST_LIST, match.id, {
            CustomerName: c.customerName,
            Classification: c.classification,
            Channel: c.channel,
          });
          updated++;
        }
      } else {
        await createListItem(CUST_LIST, {
          Title: c.customerCode,
          CustomerName: c.customerName,
          Classification: c.classification,
          Channel: c.channel,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async upsertMappings(mappings: CustomerRouteMapping[]): Promise<{ inserted: number; updated: number }> {
    const existing = await getListItems(MAP_LIST);
    const existingMap = new Map<string, { id: string; cust: string; route: string }>(
      existing.map((item) => [
        item.fields.Title,
        {
          id: item.id,
          cust: item.fields.CustomerCode || '',
          route: item.fields.RouteCode || '',
        },
      ])
    );

    let inserted = 0;
    let updated = 0;

    for (const m of mappings) {
      const match = existingMap.get(m.id);
      if (match) {
        if (match.cust !== m.customerCode || match.route !== m.routeCode) {
          await updateListItem(MAP_LIST, match.id, {
            CustomerCode: m.customerCode,
            RouteCode: m.routeCode,
          });
          updated++;
        }
      } else {
        await createListItem(MAP_LIST, {
          Title: m.id,
          CustomerCode: m.customerCode,
          RouteCode: m.routeCode,
        });
        inserted++;
      }
    }

    return { inserted, updated };
  },

  async deleteCustomersNotIn(activeCodes: string[]): Promise<number> {
    const existing = await getListItems(CUST_LIST);
    const activeSet = new Set(activeCodes);
    let deletedCount = 0;

    for (const item of existing) {
      const code = item.fields.Title;
      if (code && !activeSet.has(code)) {
        await deleteListItem(CUST_LIST, item.id);
        deletedCount++;
      }
    }

    return deletedCount;
  },

  async deleteMappingsNotIn(activeIds: string[]): Promise<number> {
    const existing = await getListItems(MAP_LIST);
    const activeSet = new Set(activeIds);
    let deletedCount = 0;

    for (const item of existing) {
      const id = item.fields.Title;
      if (id && !activeSet.has(id)) {
        await deleteListItem(MAP_LIST, item.id);
        deletedCount++;
      }
    }

    return deletedCount;
  },
};
