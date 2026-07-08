import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { visitService } from '@/services/visit-service';
import { visitSchema, visitDraftSchema } from '@/schemas/visit';
import { auditService } from '@/services/audit-service';
import { Visit, VisitPhoto, NPDResponse } from '@/types';


export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const user = session.user as any;
    if (user.status !== 'Active') {
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 });
    }

    const body = await req.json();
    const isSubmitted = body.status === 'Submitted';

    // 1. Zod Validation
    const schema = isSubmitted ? visitSchema : visitDraftSchema;
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const input = parsed.data;

    // 2. Ownership & Status Validation
    const existing = await visitRepository.getVisitById(input.visitId);
    if (existing) {
      if (user.role === 'Supervisor' && existing.supervisorId !== user.employeeCode) {
        return NextResponse.json({ error: 'Access denied. Ownership validation failed.' }, { status: 403 });
      }
      if (existing.status === 'Submitted') {
        return NextResponse.json({ error: 'Cannot modify a submitted visit record.' }, { status: 400 });
      }
    }

    // 3. Temperature Range checks
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
      status: body.status,
      createdBy: existing?.createdBy || user.email || '',
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const photoRecords: VisitPhoto[] = (input.photos || []).map((p) => ({
      photoId: p.photoId,
      visitId: input.visitId,
      category: p.category,
      cloudinaryUrl: p.cloudinaryUrl,
      publicId: p.publicId,
      uploadedAt: p.uploadedAt,
    }));

    const npdResponses: NPDResponse[] = Object.entries(input.npdResponses || {}).map(([skuCode, status]) => ({
      responseId: `${input.visitId}_${skuCode}`,
      visitId: input.visitId,
      skuCode,
      status: status as any,
    }));

    const saved = await visitService.saveVisit(visitRecord, photoRecords, npdResponses);

    await auditService.logAction(
      user.email,
      isSubmitted ? 'API Submit Visit' : 'API Save Visit Draft',
      `Processed visit: ${saved.visitId} for customer ${saved.customerCode}`
    );

    return NextResponse.json(saved);
  } catch (error: any) {
    console.error('API Visit save error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
