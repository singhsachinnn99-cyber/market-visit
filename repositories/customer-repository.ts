import { mockDb } from '@/services/mock-db';
import { Customer, CustomerRouteMapping } from '@/types';

const isSharePoint = () => {
  return !!(
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_SITE_ID
  );
};

export const customerRepository = {
  async getAllCustomers(): Promise<Customer[]> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.getAll();
      } catch (error) {
        console.error('SharePoint customers error, falling back to mock:', error);
      }
    }
    return mockDb.getCustomers();
  },

  async getCustomersByRoute(routeCode: string): Promise<Customer[]> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.getByRoute(routeCode);
      } catch (error) {
        console.error('SharePoint customers error, falling back to mock:', error);
      }
    }
    const mappings = mockDb.getMappings().filter((m) => m.routeCode === routeCode);
    const customerCodes = new Set(mappings.map((m) => m.customerCode));
    return mockDb.getCustomers().filter((c) => customerCodes.has(c.customerCode));
  },

  async getMappings(): Promise<CustomerRouteMapping[]> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.getMappings();
      } catch (error) {
        console.error('SharePoint mappings error, falling back to mock:', error);
      }
    }
    return mockDb.getMappings();
  },

  async upsertCustomers(customers: Customer[]): Promise<{ inserted: number; updated: number }> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.upsertMany(customers);
      } catch (error) {
        console.error('SharePoint customers error, falling back to mock:', error);
      }
    }

    const existing = mockDb.getCustomers();
    let inserted = 0;
    let updated = 0;
    const custMap = new Map(existing.map((c) => [c.customerCode, c]));

    customers.forEach((cust) => {
      if (custMap.has(cust.customerCode)) {
        custMap.set(cust.customerCode, { ...custMap.get(cust.customerCode)!, ...cust });
        updated++;
      } else {
        custMap.set(cust.customerCode, cust);
        inserted++;
      }
    });

    mockDb.saveCustomers(Array.from(custMap.values()));
    return { inserted, updated };
  },

  async upsertMappings(mappings: CustomerRouteMapping[]): Promise<{ inserted: number; updated: number }> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.upsertMappings(mappings);
      } catch (error) {
        console.error('SharePoint mappings error, falling back to mock:', error);
      }
    }

    const existing = mockDb.getMappings();
    let inserted = 0;
    let updated = 0;
    const mapMap = new Map(existing.map((m) => [m.id, m]));

    mappings.forEach((m) => {
      if (mapMap.has(m.id)) {
        mapMap.set(m.id, { ...mapMap.get(m.id)!, ...m });
        updated++;
      } else {
        mapMap.set(m.id, m);
        inserted++;
      }
    });

    mockDb.saveMappings(Array.from(mapMap.values()));
    return { inserted, updated };
  },

  async clearObsoleteCustomers(activeCodes: string[]): Promise<number> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.deleteCustomersNotIn(activeCodes);
      } catch (error) {
        console.error('SharePoint customers error, falling back to mock:', error);
      }
    }

    const existing = mockDb.getCustomers();
    const beforeCount = existing.length;
    const activeSet = new Set(activeCodes);
    const kept = existing.filter((c) => activeSet.has(c.customerCode));
    mockDb.saveCustomers(kept);
    return beforeCount - kept.length;
  },

  async clearObsoleteMappings(activeIds: string[]): Promise<number> {
    if (isSharePoint()) {
      try {
        const { sharepointCustomers } = require('@/services/sharepoint/customers');
        return await sharepointCustomers.deleteMappingsNotIn(activeIds);
      } catch (error) {
        console.error('SharePoint mappings error, falling back to mock:', error);
      }
    }

    const existing = mockDb.getMappings();
    const beforeCount = existing.length;
    const activeSet = new Set(activeIds);
    const kept = existing.filter((m) => activeSet.has(m.id));
    mockDb.saveMappings(kept);
    return beforeCount - kept.length;
  },
};
