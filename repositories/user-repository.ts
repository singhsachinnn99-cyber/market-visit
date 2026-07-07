import { mockDb } from '@/services/mock-db';
import { User } from '@/types';

const isSharePoint = () => {
  return !!(
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_TENANT_ID &&
    process.env.GRAPH_SITE_ID
  );
};

export const userRepository = {
  async getUserByEmail(email: string): Promise<User | null> {
    if (isSharePoint()) {
      try {
        const { sharepointUsers } = require('@/services/sharepoint/users');
        return await sharepointUsers.getByEmail(email);
      } catch (error) {
        console.error('SharePoint users error, falling back to mock:', error);
        return mockDb.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
      }
    }
    return mockDb.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
  },

  async getUserByEmployeeCode(code: string): Promise<User | null> {
    if (isSharePoint()) {
      try {
        const { sharepointUsers } = require('@/services/sharepoint/users');
        return await sharepointUsers.getByEmployeeCode(code);
      } catch (error) {
        console.error('SharePoint users error, falling back to mock:', error);
        return mockDb.getUsers().find(u => u.employeeCode === code) || null;
      }
    }
    return mockDb.getUsers().find(u => u.employeeCode === code) || null;
  },

  async getUserById(id: string): Promise<User | null> {
    if (isSharePoint()) {
      try {
        const { sharepointUsers } = require('@/services/sharepoint/users');
        return await sharepointUsers.getById(id);
      } catch (error) {
        console.error('SharePoint users error, falling back to mock:', error);
        return mockDb.getUsers().find(u => u.id === id) || null;
      }
    }
    return mockDb.getUsers().find(u => u.id === id) || null;
  },

  async getAllUsers(): Promise<User[]> {
    if (isSharePoint()) {
      try {
        const { sharepointUsers } = require('@/services/sharepoint/users');
        return await sharepointUsers.getAll();
      } catch (error) {
        console.error('SharePoint users error, falling back to mock:', error);
        return mockDb.getUsers();
      }
    }
    return mockDb.getUsers();
  },

  async createUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const newUser: User = {
      ...user,
      id: 'usr_' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
    };

    if (isSharePoint()) {
      try {
        const { sharepointUsers } = require('@/services/sharepoint/users');
        return await sharepointUsers.create(newUser);
      } catch (error) {
        console.error('SharePoint users error, falling back to mock:', error);
        const users = mockDb.getUsers();
        users.push(newUser);
        mockDb.saveUsers(users);
        return newUser;
      }
    } else {
      const users = mockDb.getUsers();
      users.push(newUser);
      mockDb.saveUsers(users);
      return newUser;
    }
  },

  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User> {
    if (isSharePoint()) {
      try {
        const { sharepointUsers } = require('@/services/sharepoint/users');
        return await sharepointUsers.update(id, updates);
      } catch (error) {
        console.error('SharePoint users error, falling back to mock:', error);
        const users = mockDb.getUsers();
        const index = users.findIndex(u => u.id === id);
        if (index === -1) throw new Error('User not found');
        users[index] = { ...users[index], ...updates };
        mockDb.saveUsers(users);
        return users[index];
      }
    } else {
      const users = mockDb.getUsers();
      const index = users.findIndex(u => u.id === id);
      if (index === -1) throw new Error('User not found');
      users[index] = { ...users[index], ...updates };
      mockDb.saveUsers(users);
      return users[index];
    }
  }
};
