import { z } from 'zod';

export const visitPhotoSchema = z.object({
  photoId: z.string(),
  category: z.enum(['Dairy', 'Beverages', 'Fruits', 'Vegetables'] as const),
  cloudinaryUrl: z.string().url({ message: 'Invalid photo URL' }),
  publicId: z.string(),
  uploadedAt: z.string(),
});

export const visitSchema = z.object({
  visitId: z.string(),
  routeCode: z.string().min(1, { message: 'Route selection is required' }),
  customerCode: z.string().min(1, { message: 'Customer selection is required' }),
  assetType: z.enum(['Chiller', 'Freezer'] as const, { message: 'Asset type is required' }),
  temperature: z.number({ message: 'Temperature must be a number' }),
  tempInRange: z.boolean(),
  actionRequired: z.enum(['Cleaning', 'Repair', 'Replacement', 'Gas Filling', 'Other', 'None'] as const, {
    message: 'Action is required',
  }),
  observation: z.string().optional().default(''),
  latitude: z.number().refine((val) => Math.abs(val) > 0.0001, { message: 'GPS Latitude is required' }),
  longitude: z.number().refine((val) => Math.abs(val) > 0.0001, { message: 'GPS Longitude is required' }),
  accuracy: z.number().optional().default(0),
  status: z.enum(['Draft', 'Submitted'] as const),
  photos: z.array(visitPhotoSchema).default([]),
  npdResponses: z.record(z.string(), z.enum(['Available', 'Not Available', 'Not Required'] as const)).default({}),
});

export const visitDraftSchema = z.object({
  visitId: z.string(),
  routeCode: z.string().optional().or(z.literal('')),
  customerCode: z.string().optional().or(z.literal('')),
  assetType: z.enum(['Chiller', 'Freezer'] as const).optional(),
  temperature: z.number().optional(),
  tempInRange: z.boolean().optional(),
  actionRequired: z.enum(['Cleaning', 'Repair', 'Replacement', 'Gas Filling', 'Other', 'None'] as const).optional(),
  observation: z.string().optional().default(''),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  accuracy: z.number().optional(),
  status: z.enum(['Draft', 'Submitted'] as const),
  photos: z.array(visitPhotoSchema).default([]),
  npdResponses: z.record(z.string(), z.enum(['Available', 'Not Available', 'Not Required'] as const)).optional().default({}),
});

export type VisitInput = z.infer<typeof visitSchema>;
export type VisitDraftInput = z.infer<typeof visitDraftSchema>;
export type VisitPhotoInput = z.infer<typeof visitPhotoSchema>;
