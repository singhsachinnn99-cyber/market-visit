'use server';

import { auth } from '@/lib/auth';
import { userRepository } from '@/repositories/user-repository';
import { supervisorSchema, SupervisorInput } from '@/schemas/supervisor';
import { auditService } from '@/services/audit-service';
import { canAccessAdminRoute } from '@/lib/roles';
import bcrypt from 'bcryptjs';

const verifyAdminSession = async () => {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  const user = session.user as any;
  if (!canAccessAdminRoute(user.role)) {
    throw new Error('Access denied. Administrative privileges required.');
  }
  if (user.status !== 'Active') {
    throw new Error('Your account is inactive.');
  }
  return session;
};

export async function getSupervisorsAction() {
  await verifyAdminSession();
  try {
    const users = await userRepository.getAllUsers();
    // Return only supervisors (or all users for admin review, excluding credentials hash)
    return users.map((u) => ({
      id: u.id,
      name: u.name,
      employeeCode: u.employeeCode,
      email: u.email,
      mobile: u.mobile,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
    }));
  } catch (error: any) {
    throw new Error(`Failed to fetch supervisors: ${error.message}`);
  }
}

export async function createSupervisorAction(data: SupervisorInput) {
  const session = await verifyAdminSession();
  const parsed = supervisorSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid inputs: ${parsed.error.issues.map((e) => e.message).join(', ')}`);
  }

  const { name, employeeCode, email, password, mobile, role, status } = parsed.data;

  // Verify unique email/code
  const existingEmail = await userRepository.getUserByEmail(email);
  if (existingEmail) {
    throw new Error('A user with this Email/Login ID already exists.');
  }

  const existingCode = await userRepository.getUserByEmployeeCode(employeeCode);
  if (existingCode) {
    throw new Error('A user with this Employee Code already exists.');
  }

  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters for a new account.');
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await userRepository.createUser({
    name,
    employeeCode,
    email,
    passwordHash,
    mobile,
    role,
    status,
  });

  const adminUser = session.user?.email || 'Admin';
  await auditService.logAction(
    adminUser,
    'Create User',
    `Created supervisor user: ${name} (${employeeCode})`
  );

  return { success: true, userId: newUser.id };
}

export async function updateSupervisorAction(id: string, data: SupervisorInput) {
  const session = await verifyAdminSession();
  const parsed = supervisorSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Invalid inputs: ${parsed.error.issues.map((e) => e.message).join(', ')}`);
  }

  const existingUser = await userRepository.getUserById(id);
  if (!existingUser) {
    throw new Error('Supervisor account not found.');
  }

  const { name, employeeCode, email, password, mobile, role, status } = parsed.data;

  // Validate email/code changes against other accounts
  if (email !== existingUser.email) {
    const duplicate = await userRepository.getUserByEmail(email);
    if (duplicate) throw new Error('A user with this Email/Login ID already exists.');
  }
  if (employeeCode !== existingUser.employeeCode) {
    const duplicate = await userRepository.getUserByEmployeeCode(employeeCode);
    if (duplicate) throw new Error('A user with this Employee Code already exists.');
  }

  const updates: any = {
    name,
    employeeCode,
    email,
    mobile,
    role,
    status,
  };

  if (password && password.trim() !== '') {
    updates.passwordHash = await bcrypt.hash(password, 10);
  }

  await userRepository.updateUser(id, updates);

  const adminUser = session.user?.email || 'Admin';
  await auditService.logAction(
    adminUser,
    'Update User',
    `Updated supervisor user: ${name} (${employeeCode}). Status changed to: ${status}`
  );

  return { success: true };
}

export async function disableSupervisorAction(id: string) {
  const session = await verifyAdminSession();
  const existingUser = await userRepository.getUserById(id);
  if (!existingUser) {
    throw new Error('Supervisor account not found.');
  }

  await userRepository.updateUser(id, { status: 'Inactive' });

  const adminUser = session.user?.email || 'Admin';
  await auditService.logAction(
    adminUser,
    'Disable User',
    `Disabled supervisor user: ${existingUser.name} (${existingUser.employeeCode})`
  );

  return { success: true };
}
