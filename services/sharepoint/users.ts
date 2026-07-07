import { getListItems, createListItem, updateListItem, graphFetch } from './client';
import { User, UserRole, UserStatus } from '@/types';

const LIST_NAME = 'Users';

const mapFieldsToUser = (item: any): User => {
  const f = item.fields;
  return {
    id: item.id,
    name: f.Title || '',
    employeeCode: f.EmployeeCode || '',
    email: f.Email || '',
    passwordHash: f.PasswordHash || '',
    mobile: f.Mobile || '',
    role: (f.Role as UserRole) || 'Supervisor',
    status: (f.Status as UserStatus) || 'Inactive',
    createdAt: f.CreatedAt || item.createdDateTime || new Date().toISOString(),
  };
};

export const sharepointUsers = {
  async getAll(): Promise<User[]> {
    const items = await getListItems(LIST_NAME);
    return items.map(mapFieldsToUser);
  },

  async getByEmail(email: string): Promise<User | null> {
    const items = await getListItems(
      LIST_NAME,
      `&$filter=fields/Email eq '${encodeURIComponent(email)}'`
    );
    if (items.length === 0) return null;
    return mapFieldsToUser(items[0]);
  },

  async getByEmployeeCode(code: string): Promise<User | null> {
    const items = await getListItems(
      LIST_NAME,
      `&$filter=fields/EmployeeCode eq '${encodeURIComponent(code)}'`
    );
    if (items.length === 0) return null;
    return mapFieldsToUser(items[0]);
  },

  async getById(id: string): Promise<User | null> {
    try {
      const response = await graphFetch(`lists/${LIST_NAME}/items/${id}?expand=fields`);
      return mapFieldsToUser(response);
    } catch {
      return null;
    }
  },

  async create(user: User): Promise<User> {
    const fields = {
      Title: user.name,
      EmployeeCode: user.employeeCode,
      Email: user.email,
      PasswordHash: user.passwordHash,
      Mobile: user.mobile,
      Role: user.role,
      Status: user.status,
      CreatedAt: user.createdAt,
    };
    const response = await createListItem(LIST_NAME, fields);
    return mapFieldsToUser(response);
  },

  async update(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    const fields: Record<string, any> = {};
    if (updates.name !== undefined) fields.Title = updates.name;
    if (updates.employeeCode !== undefined) fields.EmployeeCode = updates.employeeCode;
    if (updates.email !== undefined) fields.Email = updates.email;
    if (updates.passwordHash !== undefined) fields.PasswordHash = updates.passwordHash;
    if (updates.mobile !== undefined) fields.Mobile = updates.mobile;
    if (updates.role !== undefined) fields.Role = updates.role;
    if (updates.status !== undefined) fields.Status = updates.status;

    await updateListItem(LIST_NAME, id, fields);
    const updatedFields = await graphFetch(`lists/${LIST_NAME}/items/${id}?expand=fields`);
    return mapFieldsToUser(updatedFields);
  },
};
