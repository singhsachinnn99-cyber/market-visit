import { getListItems, createListItem, updateListItem, deleteListItem, graphFetch } from './client';
import { Visit, VisitPhoto, NPDResponse, AssetType, ActionRequiredType, VisitStatus } from '@/types';

const VISIT_LIST = 'Visits';
const PHOTO_LIST = 'VisitPhotos';
const NPD_LIST = 'NPDResponses';

const mapFieldsToVisit = (item: any): Visit => {
  const f = item.fields;
  return {
    visitId: f.Title || '',
    supervisorId: f.SupervisorId || '',
    routeCode: f.RouteCode || '',
    customerCode: f.CustomerCode || '',
    assetType: (f.AssetType as AssetType) || 'Chiller',
    temperature: typeof f.Temperature === 'number' ? f.Temperature : Number(f.Temperature || 0),
    tempInRange: f.TempInRange === true || f.TempInRange === 'Yes' || f.TempInRange === 'true',
    actionRequired: (f.ActionRequired as ActionRequiredType) || 'None',
    observation: f.Observation || '',
    latitude: typeof f.Latitude === 'number' ? f.Latitude : Number(f.Latitude || 0),
    longitude: typeof f.Longitude === 'number' ? f.Longitude : Number(f.Longitude || 0),
    accuracy: typeof f.Accuracy === 'number' ? f.Accuracy : Number(f.Accuracy || 0),
    status: (f.Status as VisitStatus) || 'Draft',
    createdBy: f.CreatedBy || '',
    createdAt: f.CreatedAt || item.createdDateTime || new Date().toISOString(),
    updatedAt: f.UpdatedAt || item.lastModifiedDateTime || new Date().toISOString(),
  };
};

const mapFieldsToPhoto = (item: any): VisitPhoto => {
  const f = item.fields;
  return {
    photoId: item.id,
    visitId: f.VisitId || '',
    category: f.Category || 'Assets',
    cloudinaryUrl: f.CloudinaryUrl || '',
    publicId: f.PublicId || '',
    uploadedAt: f.UploadedAt || item.createdDateTime || new Date().toISOString(),
  };
};

const mapFieldsToNpd = (item: any): NPDResponse => {
  const f = item.fields;
  return {
    responseId: item.id,
    visitId: f.VisitId || '',
    skuCode: f.SKUCode || '',
    status: f.Status || 'Not Required',
  };
};

export const sharepointVisits = {
  async getAll(): Promise<Visit[]> {
    const items = await getListItems(VISIT_LIST);
    return items.map(mapFieldsToVisit);
  },

  async getBySupervisor(supervisorId: string): Promise<Visit[]> {
    const items = await getListItems(
      VISIT_LIST,
      `&$filter=fields/SupervisorId eq '${encodeURIComponent(supervisorId)}'`
    );
    return items.map(mapFieldsToVisit);
  },

  async getById(visitId: string): Promise<Visit | null> {
    const items = await getListItems(
      VISIT_LIST,
      `&$filter=fields/Title eq '${encodeURIComponent(visitId)}'`
    );
    if (items.length === 0) return null;
    return mapFieldsToVisit(items[0]);
  },

  async getPhotos(visitId: string): Promise<VisitPhoto[]> {
    const items = await getListItems(
      PHOTO_LIST,
      `&$filter=fields/VisitId eq '${encodeURIComponent(visitId)}'`
    );
    return items.map(mapFieldsToPhoto);
  },

  async getNpdResponses(visitId: string): Promise<NPDResponse[]> {
    const items = await getListItems(
      NPD_LIST,
      `&$filter=fields/VisitId eq '${encodeURIComponent(visitId)}'`
    );
    return items.map(mapFieldsToNpd);
  },

  async save(visit: Visit, photos: VisitPhoto[], npdResponses: NPDResponse[]): Promise<Visit> {
    // 1. Check if Visit already exists
    const existing = await getListItems(
      VISIT_LIST,
      `&$filter=fields/Title eq '${encodeURIComponent(visit.visitId)}'`
    );

    const fields = {
      Title: visit.visitId,
      SupervisorId: visit.supervisorId,
      RouteCode: visit.routeCode,
      CustomerCode: visit.customerCode,
      AssetType: visit.assetType,
      Temperature: visit.temperature,
      TempInRange: visit.tempInRange,
      ActionRequired: visit.actionRequired,
      Observation: visit.observation,
      Latitude: visit.latitude,
      Longitude: visit.longitude,
      Accuracy: visit.accuracy,
      Status: visit.status,
      CreatedBy: visit.createdBy,
      CreatedAt: visit.createdAt,
      UpdatedAt: new Date().toISOString(),
    };

    let visitResponse: any;
    if (existing.length > 0) {
      const itemId = existing[0].id;
      await updateListItem(VISIT_LIST, itemId, fields);
      visitResponse = await graphFetch(`lists/${VISIT_LIST}/items/${itemId}?expand=fields`);
    } else {
      visitResponse = await createListItem(VISIT_LIST, fields);
    }

    // 2. Refresh Photos (delete previous and save new)
    const existingPhotos = await getListItems(
      PHOTO_LIST,
      `&$filter=fields/VisitId eq '${encodeURIComponent(visit.visitId)}'`
    );
    for (const p of existingPhotos) {
      await deleteListItem(PHOTO_LIST, p.id);
    }
    for (const photo of photos) {
      await createListItem(PHOTO_LIST, {
        Title: photo.photoId,
        VisitId: visit.visitId,
        Category: photo.category,
        CloudinaryUrl: photo.cloudinaryUrl,
        PublicId: photo.publicId,
        UploadedAt: photo.uploadedAt,
      });
    }

    // 3. Refresh NPD Responses
    const existingNpd = await getListItems(
      NPD_LIST,
      `&$filter=fields/VisitId eq '${encodeURIComponent(visit.visitId)}'`
    );
    for (const n of existingNpd) {
      await deleteListItem(NPD_LIST, n.id);
    }
    for (const resp of npdResponses) {
      await createListItem(NPD_LIST, {
        Title: resp.responseId,
        VisitId: visit.visitId,
        SKUCode: resp.skuCode,
        Status: resp.status,
      });
    }

    return mapFieldsToVisit(visitResponse);
  },

  async delete(visitId: string): Promise<void> {
    // 1. Delete main Visit
    const existing = await getListItems(
      VISIT_LIST,
      `&$filter=fields/Title eq '${encodeURIComponent(visitId)}'`
    );
    if (existing.length > 0) {
      await deleteListItem(VISIT_LIST, existing[0].id);
    }

    // 2. Delete Photos
    const photos = await getListItems(
      PHOTO_LIST,
      `&$filter=fields/VisitId eq '${encodeURIComponent(visitId)}'`
    );
    for (const p of photos) {
      await deleteListItem(PHOTO_LIST, p.id);
    }

    // 3. Delete NPD responses
    const npd = await getListItems(
      NPD_LIST,
      `&$filter=fields/VisitId eq '${encodeURIComponent(visitId)}'`
    );
    for (const n of npd) {
      await deleteListItem(NPD_LIST, n.id);
    }
  },
};
