import { getListItems, createListItem } from './client';
import { AuditLog } from '@/types';

const LIST_NAME = 'AuditLogs';

const mapFieldsToAuditLog = (item: any): AuditLog => {
  const f = item.fields;
  return {
    logId: f.Title || item.id,
    user: f.User || '',
    action: f.Action || '',
    entity: f.Entity || '',
    createdAt: f.CreatedAt || item.createdDateTime || new Date().toISOString(),
  };
};

export const sharepointAudit = {
  async logAction(log: AuditLog): Promise<void> {
    await createListItem(LIST_NAME, {
      Title: log.logId,
      User: log.user,
      Action: log.action,
      Entity: log.entity,
      CreatedAt: log.createdAt,
    });
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    const items = await getListItems(LIST_NAME);
    // Sort descending by date
    return items
      .map(mapFieldsToAuditLog)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
};
