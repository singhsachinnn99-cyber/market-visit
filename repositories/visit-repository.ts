import { Visit, VisitPhoto, NPDResponse } from '@/types';
import pool from '@/lib/db';
import mysql from 'mysql2/promise';

function mapRowToVisit(row: any): Visit {
  return {
    visitId: row.visitId,
    supervisorId: row.supervisorId,
    routeCode: row.routeCode,
    customerCode: row.customerCode,
    assetType: row.assetType as any,
    temperature: row.temperature,
    tempInRange: row.tempInRange === 1 || row.tempInRange === true,
    actionRequired: row.actionRequired as any,
    observation: row.observation,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    status: row.status as any,
    createdBy: row.createdBy,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

function mapRowToPhoto(row: any): VisitPhoto {
  return {
    photoId: row.photoId,
    visitId: row.visitId,
    category: row.category as any,
    cloudinaryUrl: row.cloudinaryUrl,
    publicId: row.publicId,
    uploadedAt: row.uploadedAt instanceof Date ? row.uploadedAt.toISOString() : row.uploadedAt,
  };
}

function mapRowToNpd(row: any): NPDResponse {
  return {
    responseId: `${row.visitId}_${row.skuCode}`,
    visitId: row.visitId,
    skuCode: row.skuCode,
    status: row.status as any,
  };
}

export const visitRepository = {
  async getVisitById(visitId: string): Promise<Visit | null> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `Visit` WHERE `visitId` = ? LIMIT 1',
      [visitId]
    );
    if (rows.length === 0) return null;
    return mapRowToVisit(rows[0]);
  },

  async getVisitsBySupervisor(supervisorId: string): Promise<Visit[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `Visit` WHERE `supervisorId` = ?',
      [supervisorId]
    );
    return rows.map(mapRowToVisit);
  },

  async getAllVisits(): Promise<Visit[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `Visit`');
    return rows.map(mapRowToVisit);
  },

  async getVisitPhotos(visitId: string): Promise<VisitPhoto[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `VisitPhoto` WHERE `visitId` = ?',
      [visitId]
    );
    return rows.map(mapRowToPhoto);
  },

  async getNpdResponses(visitId: string): Promise<NPDResponse[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `NPDResponse` WHERE `visitId` = ?',
      [visitId]
    );
    return rows.map(mapRowToNpd);
  },

  async saveVisitRecord(visit: Visit, connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    const tempInRange = visit.tempInRange ? 1 : 0;
    const createdAt = visit.createdAt ? new Date(visit.createdAt) : new Date();
    const updatedAt = visit.updatedAt ? new Date(visit.updatedAt) : new Date();

    const sql = `
      INSERT INTO \`Visit\` (
        \`visitId\`, \`supervisorId\`, \`routeCode\`, \`customerCode\`, \`assetType\`, 
        \`temperature\`, \`tempInRange\`, \`actionRequired\`, \`observation\`, 
        \`latitude\`, \`longitude\`, \`accuracy\`, \`status\`, \`createdBy\`, \`createdAt\`, \`updatedAt\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`supervisorId\` = VALUES(\`supervisorId\`),
        \`routeCode\` = VALUES(\`routeCode\`),
        \`customerCode\` = VALUES(\`customerCode\`),
        \`assetType\` = VALUES(\`assetType\`),
        \`temperature\` = VALUES(\`temperature\`),
        \`tempInRange\` = VALUES(\`tempInRange\`),
        \`actionRequired\` = VALUES(\`actionRequired\`),
        \`observation\` = VALUES(\`observation\`),
        \`latitude\` = VALUES(\`latitude\`),
        \`longitude\` = VALUES(\`longitude\`),
        \`accuracy\` = VALUES(\`accuracy\`),
        \`status\` = VALUES(\`status\`),
        \`createdBy\` = VALUES(\`createdBy\`),
        \`updatedAt\` = VALUES(\`updatedAt\`)
    `;

    await executor.execute(sql, [
      visit.visitId,
      visit.supervisorId,
      visit.routeCode || null,
      visit.customerCode || null,
      visit.assetType,
      visit.temperature,
      tempInRange,
      visit.actionRequired,
      visit.observation,
      visit.latitude,
      visit.longitude,
      visit.accuracy,
      visit.status,
      visit.createdBy,
      createdAt,
      updatedAt,
    ]);
  },

  async deletePhotosForVisit(visitId: string, connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    await executor.execute('DELETE FROM `VisitPhoto` WHERE `visitId` = ?', [visitId]);
  },

  async insertPhotos(photos: VisitPhoto[], connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    for (const p of photos) {
      const uploadedAt = p.uploadedAt ? new Date(p.uploadedAt) : new Date();
      await executor.execute(
        `INSERT INTO \`VisitPhoto\` (\`photoId\`, \`visitId\`, \`category\`, \`cloudinaryUrl\`, \`publicId\`, \`uploadedAt\`) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [p.photoId, p.visitId, p.category, p.cloudinaryUrl, p.publicId, uploadedAt]
      );
    }
  },

  async deleteNpdForVisit(visitId: string, connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    await executor.execute('DELETE FROM `NPDResponse` WHERE `visitId` = ?', [visitId]);
  },

  async insertNpd(npdResponses: NPDResponse[], connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    for (const n of npdResponses) {
      await executor.execute(
        'INSERT INTO `NPDResponse` (`visitId`, `skuCode`, `status`) VALUES (?, ?, ?)',
        [n.visitId, n.skuCode, n.status]
      );
    }
  },

  async saveVisit(visit: Visit, photos: VisitPhoto[], npdResponses: NPDResponse[]): Promise<Visit> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await this.saveVisitRecord(visit, connection);
      await this.deletePhotosForVisit(visit.visitId, connection);
      await this.insertPhotos(photos, connection);
      await this.deleteNpdForVisit(visit.visitId, connection);
      await this.insertNpd(npdResponses, connection);

      await connection.commit();
      const savedVisit = await this.getVisitById(visit.visitId);
      if (!savedVisit) throw new Error('Visit not found after saving');
      return savedVisit;
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  },

  async deleteVisit(visitId: string): Promise<void> {
    // Native ON DELETE CASCADE automatically handles VisitPhoto and NPDResponse removal
    await pool.execute('DELETE FROM `Visit` WHERE `visitId` = ?', [visitId]);
  },
};
