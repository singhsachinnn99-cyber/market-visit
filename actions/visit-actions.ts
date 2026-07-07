'use server';

import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { customerRepository } from '@/repositories/customer-repository';
import { visitSchema, visitDraftSchema, VisitInput, VisitDraftInput } from '@/schemas/visit';
import { auditService } from '@/services/audit-service';
import { Visit, VisitPhoto, NPDResponse, VisitStatus } from '@/types';

const getAuthenticatedUser = async () => {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Authentication required');
  }
  const user = session.user as any;
  if (user.status !== 'Active') {
    throw new Error('Your account is inactive.');
  }
  return user;
};

export async function getVisitsAction() {
  const user = await getAuthenticatedUser();
  try {
    if (user.role === 'Admin') {
      return await visitRepository.getAllVisits();
    } else {
      return await visitRepository.getVisitsBySupervisor(user.employeeCode);
    }
  } catch (error: any) {
    throw new Error(`Failed to fetch visits: ${error.message}`);
  }
}

export async function getVisitDetailsAction(visitId: string) {
  const user = await getAuthenticatedUser();
  const visit = await visitRepository.getVisitById(visitId);
  if (!visit) {
    throw new Error('Visit record not found');
  }

  // Enforce ownership: Supervisor can only view own visits
  if (user.role === 'Supervisor' && visit.supervisorId !== user.employeeCode) {
    throw new Error('Access denied. You do not own this visit record.');
  }

  const photos = await visitRepository.getVisitPhotos(visitId);
  const npdResponses = await visitRepository.getNpdResponses(visitId);

  return { visit, photos, npdResponses };
}

export async function saveVisitDraftAction(data: VisitDraftInput) {
  const user = await getAuthenticatedUser();
  const parsed = visitDraftSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((e) => e.message).join(', ')}`);
  }

  const input = parsed.data;

  // Verify ownership if editing existing
  const existing = await visitRepository.getVisitById(input.visitId);
  if (existing) {
    if (user.role === 'Supervisor' && existing.supervisorId !== user.employeeCode) {
      throw new Error('Access denied. You cannot modify another supervisor\'s visit.');
    }
    if (existing.status === 'Submitted') {
      throw new Error('Cannot edit a visit that has already been submitted.');
    }
  }

  // Calculate temp range if temperature is supplied
  let tempInRange = true;
  if (input.assetType && input.temperature !== undefined) {
    if (input.assetType === 'Chiller') {
      tempInRange = input.temperature >= 0 && input.temperature <= 8;
    } else if (input.assetType === 'Freezer') {
      tempInRange = input.temperature <= -15;
    }
  }

  const visitRecord: Visit = {
    visitId: input.visitId,
    supervisorId: existing?.supervisorId || user.employeeCode,
    routeCode: input.routeCode || '',
    customerCode: input.customerCode || '',
    assetType: input.assetType || 'Chiller',
    temperature: input.temperature || 0,
    tempInRange,
    actionRequired: input.actionRequired || 'None',
    observation: input.observation || '',
    latitude: input.latitude || 0,
    longitude: input.longitude || 0,
    accuracy: input.accuracy || 0,
    status: 'Draft',
    createdBy: existing?.createdBy || user.email || '',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Convert photos input
  const photoRecords: VisitPhoto[] = (input.photos || []).map((p) => ({
    photoId: p.photoId,
    visitId: input.visitId,
    category: p.category,
    cloudinaryUrl: p.cloudinaryUrl,
    publicId: p.publicId,
    uploadedAt: p.uploadedAt,
  }));

  // Convert NPD responses
  const npdResponses: NPDResponse[] = Object.entries(input.npdResponses || {}).map(([skuCode, status]) => ({
    responseId: `${input.visitId}_${skuCode}`,
    visitId: input.visitId,
    skuCode,
    status: status as any,
  }));

  const savedVisit = await visitRepository.saveVisit(visitRecord, photoRecords, npdResponses);
  
  await auditService.logAction(
    user.email,
    'Save Visit Draft',
    `Saved draft visit ${visitRecord.visitId} for customer ${visitRecord.customerCode}`
  );

  return { success: true, visit: savedVisit };
}

export async function submitVisitAction(data: VisitInput) {
  const user = await getAuthenticatedUser();
  const parsed = visitSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error(`Validation failed: ${parsed.error.issues.map((e) => e.message).join(', ')}`);
  }

  const input = parsed.data;

  // Validate coordinates specifically
  if (Math.abs(input.latitude) < 0.0001 || Math.abs(input.longitude) < 0.0001) {
    throw new Error('GPS location coordinates are required for final submission.');
  }

  const existing = await visitRepository.getVisitById(input.visitId);
  if (existing) {
    if (user.role === 'Supervisor' && existing.supervisorId !== user.employeeCode) {
      throw new Error('Access denied. You cannot modify another supervisor\'s visit.');
    }
    if (existing.status === 'Submitted') {
      throw new Error('Cannot edit a visit that has already been submitted.');
    }
  }

  const visitRecord: Visit = {
    visitId: input.visitId,
    supervisorId: existing?.supervisorId || user.employeeCode,
    routeCode: input.routeCode,
    customerCode: input.customerCode,
    assetType: input.assetType,
    temperature: input.temperature,
    tempInRange: input.tempInRange,
    actionRequired: input.actionRequired,
    observation: input.observation,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    status: 'Submitted',
    createdBy: existing?.createdBy || user.email || '',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const photoRecords: VisitPhoto[] = input.photos.map((p) => ({
    photoId: p.photoId,
    visitId: input.visitId,
    category: p.category,
    cloudinaryUrl: p.cloudinaryUrl,
    publicId: p.publicId,
    uploadedAt: p.uploadedAt,
  }));

  const npdResponses: NPDResponse[] = Object.entries(input.npdResponses).map(([skuCode, status]) => ({
    responseId: `${input.visitId}_${skuCode}`,
    visitId: input.visitId,
    skuCode,
    status: status as any,
  }));

  const submittedVisit = await visitRepository.saveVisit(visitRecord, photoRecords, npdResponses);

  await auditService.logAction(
    user.email,
    'Submit Visit',
    `Submitted field visit ${visitRecord.visitId} for customer ${visitRecord.customerCode}`
  );

  return { success: true, visit: submittedVisit };
}

export async function deleteVisitAction(visitId: string) {
  const user = await getAuthenticatedUser();
  if (user.role !== 'Admin') {
    throw new Error('Access denied. Administrator privileges required to delete visit logs.');
  }

  const existing = await visitRepository.getVisitById(visitId);
  if (!existing) {
    throw new Error('Visit record not found.');
  }

  await visitRepository.deleteVisit(visitId);

  await auditService.logAction(
    user.email,
    'Delete Visit',
    `Deleted field visit ${visitId} associated with customer ${existing.customerCode}`
  );

  return { success: true };
}
