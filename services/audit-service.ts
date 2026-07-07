import { mockDb } from './mock-db';
import { AuditLog } from '@/types';

export const auditService = {
  async logAction(user: string, action: string, entity: string): Promise<void> {
    const isSharePoint = !!(
      process.env.GRAPH_CLIENT_ID &&
      process.env.GRAPH_CLIENT_SECRET &&
      process.env.GRAPH_TENANT_ID &&
      process.env.GRAPH_SITE_ID
    );

    const newLog: AuditLog = {
      logId: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      user,
      action,
      entity,
      createdAt: new Date().toISOString(),
    };

    if (isSharePoint) {
      try {
        // Dynamic load to allow split bundle compiling
        const { sharepointAudit } = require('./sharepoint/audit');
        await sharepointAudit.logAction(newLog);
      } catch (error) {
        console.error('Failed to log audit to SharePoint, falling back to mock:', error);
        const logs = mockDb.getAuditLogs();
        logs.unshift(newLog);
        mockDb.saveAuditLogs(logs);
      }
    } else {
      const logs = mockDb.getAuditLogs();
      logs.unshift(newLog);
      mockDb.saveAuditLogs(logs);
    }
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const isSharePoint = !!(
      process.env.GRAPH_CLIENT_ID &&
      process.env.GRAPH_CLIENT_SECRET &&
      process.env.GRAPH_TENANT_ID &&
      process.env.GRAPH_SITE_ID
    );

    if (isSharePoint) {
      try {
        const { sharepointAudit } = require('./sharepoint/audit');
        return await sharepointAudit.getAuditLogs();
      } catch (error) {
        console.error('Failed to fetch audit from SharePoint, falling back to mock:', error);
        return mockDb.getAuditLogs();
      }
    } else {
      return mockDb.getAuditLogs();
    }
  }
};
export type AuditService = typeof auditService;
