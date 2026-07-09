import { z } from 'zod';

export const visitPhotoSchema = z.object({
  photoId: z.string(),
  category: z.enum(['Dairy', 'Beverages', 'Fruits', 'Vegetables'] as const),
  cloudinaryUrl: z.string().url({ message: 'Invalid photo URL' }),
  publicId: z.string(),
  uploadedAt: z.string(),
});

export const visitAssetSchema = z.object({
  assetId: z.string(),
  assetType: z.enum(['Chiller', 'Freezer'] as const),
  temperature: z.number({ message: 'Temperature must be a number' }),
  tempInRange: z.boolean(),
  actionRequired: z.enum(['Cleaning', 'Repair', 'Replacement', 'Gas Filling', 'Other', 'None'] as const),
  observation: z.string().optional().default(''),
});

export const visitSchema = z.object({
  visitId: z.string(),
  cust_rt_id: z.string().min(1, { message: 'Customer-Route selection is required' }),
  latitude: z.number().refine((val) => Math.abs(val) > 0.0001, { message: 'GPS Latitude is required' }),
  longitude: z.number().refine((val) => Math.abs(val) > 0.0001, { message: 'GPS Longitude is required' }),
  accuracy: z.number().optional().default(0),
  status: z.enum(['Draft', 'Submitted'] as const),
  assets: z.array(visitAssetSchema).default([]),
  photos: z.array(visitPhotoSchema).default([]),
  powerSkuResults: z.record(z.string(), z.enum(['Available', 'Not Available', 'Not Required'] as const)).default({}),
  npdResponses: z.record(z.string(), z.enum(['Available', 'Not Available', 'Not Required'] as const)).default({}),
  sosAsPerBda: z.boolean().nullable().optional(),
  visit_datetime: z.string().optional(),
});

export const visitDraftSchema = z.object({
  visitId: z.string(),
  cust_rt_id: z.string().optional().or(z.literal('')),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  status: z.enum(['Draft', 'Submitted'] as const),
  assets: z.array(visitAssetSchema.partial({
    assetType: true,
    temperature: true,
    tempInRange: true,
    actionRequired: true,
  })).default([]),
  photos: z.array(visitPhotoSchema).default([]),
  powerSkuResults: z.record(z.string(), z.enum(['Available', 'Not Available', 'Not Required'] as const)).optional().default({}),
  npdResponses: z.record(z.string(), z.enum(['Available', 'Not Available', 'Not Required'] as const)).optional().default({}),
  sosAsPerBda: z.boolean().nullable().optional(),
  visit_datetime: z.string().optional(),
});

export type VisitInput = z.infer<typeof visitSchema>;
export type VisitDraftInput = z.infer<typeof visitDraftSchema>;
export type VisitPhotoInput = z.infer<typeof visitPhotoSchema>;
export type VisitAssetInput = z.infer<typeof visitAssetSchema>;

