import { mockDb } from '@/services/mock-db';
import { Visit, VisitPhoto, NPDResponse } from '@/types';

const isSharePoint = () => {
  return !!(
    process.env.GRAPH_CLIENT_ID &&
    process.env.GRAPH_CLIENT_SECRET &&
    process.env.GRAPH_SITE_ID
  );
};

export const visitRepository = {
  async getVisitById(visitId: string): Promise<Visit | null> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.getById(visitId);
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }
    return mockDb.getVisits().find((v) => v.visitId === visitId) || null;
  },

  async getVisitsBySupervisor(supervisorId: string): Promise<Visit[]> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.getBySupervisor(supervisorId);
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }
    return mockDb.getVisits().filter((v) => v.supervisorId === supervisorId);
  },

  async getAllVisits(): Promise<Visit[]> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.getAll();
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }
    return mockDb.getVisits();
  },

  async getVisitPhotos(visitId: string): Promise<VisitPhoto[]> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.getPhotos(visitId);
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }
    return mockDb.getPhotos().filter((p) => p.visitId === visitId);
  },

  async getNpdResponses(visitId: string): Promise<NPDResponse[]> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.getNpdResponses(visitId);
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }
    return mockDb.getNpdResponses().filter((n) => n.visitId === visitId);
  },

  async saveVisit(visit: Visit, photos: VisitPhoto[], npdResponses: NPDResponse[]): Promise<Visit> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.save(visit, photos, npdResponses);
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }

    // Mock DB implementation
    const visits = mockDb.getVisits();
    const index = visits.findIndex((v) => v.visitId === visit.visitId);

    const now = new Date().toISOString();
    const finalVisit = {
      ...visit,
      updatedAt: now,
      createdAt: index !== -1 ? visits[index].createdAt : now,
    };

    if (index !== -1) {
      visits[index] = finalVisit;
    } else {
      visits.push(finalVisit);
    }
    mockDb.saveVisits(visits);

    // Save Photos (delete existing for this visit and replace)
    let allPhotos = mockDb.getPhotos();
    allPhotos = allPhotos.filter((p) => p.visitId !== visit.visitId);
    allPhotos.push(...photos);
    mockDb.savePhotos(allPhotos);

    // Save NPD responses (delete existing for this visit and replace)
    let allNpd = mockDb.getNpdResponses();
    allNpd = allNpd.filter((n) => n.visitId !== visit.visitId);
    allNpd.push(...npdResponses);
    mockDb.saveNpdResponses(allNpd);

    return finalVisit;
  },

  async deleteVisit(visitId: string): Promise<void> {
    if (isSharePoint()) {
      try {
        const { sharepointVisits } = require('@/services/sharepoint/visits');
        return await sharepointVisits.delete(visitId);
      } catch (error) {
        console.error('SharePoint visits error, falling back to mock:', error);
      }
    }

    // Mock DB
    const visits = mockDb.getVisits().filter((v) => v.visitId !== visitId);
    mockDb.saveVisits(visits);

    const photos = mockDb.getPhotos().filter((p) => p.visitId !== visitId);
    mockDb.savePhotos(photos);

    const npd = mockDb.getNpdResponses().filter((n) => n.visitId !== visitId);
    mockDb.saveNpdResponses(npd);
  },
};
