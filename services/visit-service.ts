import pool from '@/lib/db';
import { visitRepository } from '@/repositories/visit-repository';
import { Visit, VisitPhoto, NPDResponse } from '@/types';

const isMySQL = () => {
  return process.env.DB_MODE === 'MYSQL';
};

export const visitService = {
  async saveVisit(
    visit: Visit,
    photos: VisitPhoto[],
    npdResponses: NPDResponse[]
  ): Promise<Visit> {
    if (isMySQL()) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        // Service coordinates database repository writes through the leased transaction connection
        await visitRepository.saveVisitRecord(visit, connection);
        
        await visitRepository.deletePhotosForVisit(visit.visitId, connection);
        if (photos.length > 0) {
          await visitRepository.insertPhotos(photos, connection);
        }

        await visitRepository.deleteNpdForVisit(visit.visitId, connection);
        if (npdResponses.length > 0) {
          await visitRepository.insertNpd(npdResponses, connection);
        }

        await connection.commit();
        
        const savedVisit = await visitRepository.getVisitById(visit.visitId);
        if (!savedVisit) {
          throw new Error('Visit record could not be retrieved after write transaction committed.');
        }
        return savedVisit;
      } catch (error) {
        await connection.rollback();
        console.error('MySQL Service transaction failed, rolling back:', error);
        throw error;
      } finally {
        connection.release();
      }
    }

    // Falls back to standard repository delegation for mock/SharePoint compat
    return await visitRepository.saveVisit(visit, photos, npdResponses);
  },

  async deleteVisit(visitId: string): Promise<void> {
    // Basic service wrapper for delete operations
    await visitRepository.deleteVisit(visitId);
  }
};
