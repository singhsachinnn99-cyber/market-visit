import { Visit, VisitPhoto, NPDResponse, VisitAsset, VisitPowerSkuResult } from '@/types';
import pool from '@/lib/db';
import mysql from 'mysql2/promise';

function mapRowToVisit(row: any): Visit {
  const [customerCode, routeCode] = (row.cust_rt_id || '').split('|');
  return {
    visitId: row.visitId,
    supervisorId: row.supervisorId,
    cust_rt_id: row.cust_rt_id,
    visit_type: row.visit_type as any,
    reason_category: row.reason_category,
    reason: row.reason,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    status: row.status as any,
    createdBy: row.createdBy,
    visit_datetime: row.visit_datetime instanceof Date ? row.visit_datetime.toISOString() : row.visit_datetime,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
    sosAsPerBda: row.sosAsPerBda === null ? null : (row.sosAsPerBda === 1 || row.sosAsPerBda === true),
    routeCode: routeCode || '',
    customerCode: customerCode || '',
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

  async getAllNpdResponses(): Promise<NPDResponse[]> {
    const [rows]: any = await pool.execute('SELECT * FROM `NPDResponse`');
    return rows.map(mapRowToNpd);
  },

  async getVisitAssets(visitId: string): Promise<VisitAsset[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `VisitAsset` WHERE `visitId` = ?',
      [visitId]
    );
    return rows.map((r: any) => ({
      assetId: r.assetId,
      visitId: r.visitId,
      assetType: r.assetType as any,
      temperature: r.temperature,
      tempInRange: r.tempInRange === 1 || r.tempInRange === true,
      actionRequired: r.actionRequired as any,
      observation: r.observation,
      isFirstInFlow: r.isFirstInFlow === 1 || r.isFirstInFlow === true,
      fefoFollowed: r.fefoFollowed === 1 || r.fefoFollowed === true,
    }));
  },

  async getVisitPowerSkuResults(visitId: string): Promise<VisitPowerSkuResult[]> {
    const [rows]: any = await pool.execute(
      'SELECT * FROM `VisitPowerSkuResult` WHERE `visitId` = ?',
      [visitId]
    );
    return rows.map((r: any) => ({
      visitId: r.visitId,
      skuCode: r.skuCode,
      status: r.status as any,
    }));
  },

  async saveVisitRecord(visit: Visit, connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    const createdAt = visit.createdAt ? new Date(visit.createdAt) : new Date();
    const updatedAt = visit.updatedAt ? new Date(visit.updatedAt) : new Date();
    const visitDatetime = visit.visit_datetime ? new Date(visit.visit_datetime) : new Date();

    const sql = `
      INSERT INTO \`Visit\` (
        \`visitId\`, \`supervisorId\`, \`cust_rt_id\`, \`visit_type\`, \`reason_category\`, \`reason\`,
        \`latitude\`, \`longitude\`, \`accuracy\`, \`status\`, 
        \`createdBy\`, \`visit_datetime\`, \`createdAt\`, \`updatedAt\`, \`sosAsPerBda\`
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        \`supervisorId\` = VALUES(\`supervisorId\`),
        \`cust_rt_id\` = VALUES(\`cust_rt_id\`),
        \`visit_type\` = VALUES(\`visit_type\`),
        \`reason_category\` = VALUES(\`reason_category\`),
        \`reason\` = VALUES(\`reason\`),
        \`latitude\` = VALUES(\`latitude\`),
        \`longitude\` = VALUES(\`longitude\`),
        \`accuracy\` = VALUES(\`accuracy\`),
        \`status\` = VALUES(\`status\`),
        \`createdBy\` = VALUES(\`createdBy\`),
        \`visit_datetime\` = VALUES(\`visit_datetime\`),
        \`updatedAt\` = VALUES(\`updatedAt\`),
        \`sosAsPerBda\` = VALUES(\`sosAsPerBda\`)
    `;

    await executor.execute(sql, [
      visit.visitId,
      visit.supervisorId,
      visit.cust_rt_id,
      visit.visit_type || 'Visit',
      visit.reason_category || '',
      visit.reason || '',
      visit.latitude,
      visit.longitude,
      visit.accuracy,
      visit.status,
      visit.createdBy,
      visitDatetime,
      createdAt,
      updatedAt,
      visit.sosAsPerBda === undefined || visit.sosAsPerBda === null ? null : (visit.sosAsPerBda ? 1 : 0)
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

  async deleteAssetsForVisit(visitId: string, connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    await executor.execute('DELETE FROM `VisitAsset` WHERE `visitId` = ?', [visitId]);
  },

  async insertAssets(assets: VisitAsset[], connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    for (const ast of assets) {
      await executor.execute(
        `INSERT INTO \`VisitAsset\` (\`assetId\`, \`visitId\`, \`assetType\`, \`temperature\`, \`tempInRange\`, \`actionRequired\`, \`observation\`, \`isFirstInFlow\`, \`fefoFollowed\`) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ast.assetId, ast.visitId, ast.assetType, ast.temperature, ast.tempInRange ? 1 : 0, ast.actionRequired, ast.observation, ast.isFirstInFlow ? 1 : 0, ast.fefoFollowed ? 1 : 0]
      );
    }
  },

  async deletePowerSkuResultsForVisit(visitId: string, connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    await executor.execute('DELETE FROM `VisitPowerSkuResult` WHERE `visitId` = ?', [visitId]);
  },

  async insertPowerSkuResults(results: VisitPowerSkuResult[], connection?: mysql.Connection | mysql.PoolConnection): Promise<void> {
    const executor = connection || pool;
    for (const r of results) {
      await executor.execute(
        'INSERT INTO `VisitPowerSkuResult` (`visitId`, `skuCode`, `status`) VALUES (?, ?, ?)',
        [r.visitId, r.skuCode, r.status]
      );
    }
  },

  async saveVisit(
    visit: Visit,
    assets: VisitAsset[],
    photos: VisitPhoto[],
    powerSkuResults: VisitPowerSkuResult[],
    npdResponses: NPDResponse[]
  ): Promise<Visit> {
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await this.saveVisitRecord(visit, connection);
      
      await this.deleteAssetsForVisit(visit.visitId, connection);
      await this.insertAssets(assets, connection);
      
      await this.deletePhotosForVisit(visit.visitId, connection);
      await this.insertPhotos(photos, connection);
      
      await this.deletePowerSkuResultsForVisit(visit.visitId, connection);
      await this.insertPowerSkuResults(powerSkuResults, connection);

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
    // Native ON DELETE CASCADE automatically handles VisitPhoto, VisitAsset, NPDResponse, VisitPowerSkuResult removal
    await pool.execute('DELETE FROM `Visit` WHERE `visitId` = ?', [visitId]);
  },
};
