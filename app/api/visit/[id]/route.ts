import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { visitRepository } from '@/repositories/visit-repository';
import { visitService } from '@/services/visit-service';
import { visitSchema, visitDraftSchema } from '@/schemas/visit';
import { auditService } from '@/services/audit-service';
import { Visit, VisitPhoto, NPDResponse } from '@/types';

const checkUser = async () => {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as any;
  if (user.status !== 'Active') return null;
  return user;
};

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await checkUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await visitRepository.getVisitById(id);

    if (!existing) {
      return NextResponse.json({ error: 'Visit record not found' }, { status: 404 });
    }

    // Ownership check
    if (user.role === 'Supervisor' && existing.supervisorId !== user.employeeCode) {
      return NextResponse.json({ error: 'Access denied. You do not own this visit.' }, { status: 403 });
    }

    if (existing.status === 'Submitted') {
      return NextResponse.json({ error: 'Cannot modify a submitted visit record.' }, { status: 400 });
    }

    const isSubmitted = body.status === 'Submitted';
    const schema = isSubmitted ? visitSchema : visitDraftSchema;
    const parsed = schema.safeParse({ ...body, visitId: id });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
    }

    const input = parsed.data;

    let tempInRange = true;
    if (input.assetType && input.temperature !== undefined) {
      if (input.assetType === 'Chiller') {
        tempInRange = input.temperature >= 0 && input.temperature <= 8;
      } else if (input.assetType === 'Freezer') {
        tempInRange = input.temperature <= -15;
      }
    }

    const visitRecord: Visit = {
      visitId: id,
      supervisorId: existing.supervisorId,
      routeCode: input.routeCode || existing.routeCode,
      customerCode: input.customerCode || existing.customerCode,
      assetType: input.assetType || existing.assetType,
      temperature: input.temperature !== undefined ? input.temperature : existing.temperature,
      tempInRange,
      actionRequired: input.actionRequired || existing.actionRequired,
      observation: input.observation || existing.observation,
      latitude: input.latitude !== undefined ? input.latitude : existing.latitude,
      longitude: input.longitude !== undefined ? input.longitude : existing.longitude,
      accuracy: input.accuracy !== undefined ? input.accuracy : existing.accuracy,
      status: body.status,
      createdBy: existing.createdBy,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const photoRecords: VisitPhoto[] = (input.photos || []).map((p) => ({
      photoId: p.photoId,
      visitId: id,
      category: p.category,
      cloudinaryUrl: p.cloudinaryUrl,
      publicId: p.publicId,
      uploadedAt: p.uploadedAt,
    }));

    const npdResponses: NPDResponse[] = Object.entries(input.npdResponses || {}).map(([skuCode, status]) => ({
      responseId: `${id}_${skuCode}`,
      visitId: id,
      skuCode,
      status: status as any,
    }));

    const updated = await visitService.saveVisit(visitRecord, photoRecords, npdResponses);

    await auditService.logAction(
      user.email,
      isSubmitted ? 'API Update Submit Visit' : 'API Update Draft Visit',
      `Updated visit: ${id} for customer ${updated.customerCode}`
    );

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await checkUser();
  if (!user || user.role !== 'Admin') {
    return NextResponse.json({ error: 'Unauthorized. Admin privileges required.' }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await visitRepository.getVisitById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Visit record not found' }, { status: 404 });
    }

    await visitService.deleteVisit(id);

    await auditService.logAction(
      user.email,
      'API Delete Visit',
      `Deleted visit: ${id} for customer ${existing.customerCode}`
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
