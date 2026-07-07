// Shared TypeScript Type Definitions for Supervisor Field Visit Management System

export type UserRole = 'Admin' | 'Supervisor';
export type UserStatus = 'Active' | 'Inactive';
export type VisitStatus = 'Draft' | 'Submitted';
export type AssetType = 'Chiller' | 'Freezer';
export type ActionRequiredType = 'Cleaning' | 'Repair' | 'Replacement' | 'Gas Filling' | 'Other' | 'None';
export type NPDStatus = 'Available' | 'Not Available' | 'Not Required';

export interface User {
  id: string;
  name: string;
  employeeCode: string;
  email: string;
  passwordHash: string;
  mobile: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string; // ISO string
}

export interface Route {
  routeCode: string;
  routeName: string;
}

export interface Customer {
  customerCode: string;
  customerName: string;
  classification: string; // A-E
  channel: string;
}

export interface CustomerRouteMapping {
  id: string; // CustomerCode_RouteCode
  customerCode: string;
  routeCode: string;
}

export interface SKU {
  skuCode: string;
  skuName: string;
}

export interface Visit {
  visitId: string;
  supervisorId: string; // EmployeeCode or Email
  routeCode: string;
  customerCode: string;
  assetType: AssetType;
  temperature: number;
  tempInRange: boolean;
  actionRequired: ActionRequiredType;
  observation: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  status: VisitStatus;
  createdBy: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface VisitPhoto {
  photoId: string;
  visitId: string;
  category: 'Dairy' | 'Beverages' | 'Ice Cream' | 'Assets';
  cloudinaryUrl: string;
  publicId: string;
  uploadedAt: string; // ISO string
}

export interface NPDResponse {
  responseId: string;
  visitId: string;
  skuCode: string;
  status: NPDStatus;
}

export interface AuditLog {
  logId: string;
  user: string; // Email or Name
  action: string;
  entity: string;
  createdAt: string; // ISO string
}

// UI & API Transfer Objects

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  employeeCode: string;
  role: UserRole;
  status: UserStatus;
}

export interface DashboardFilters {
  startDate?: string;
  endDate?: string;
  supervisorId?: string;
  routeCode?: string;
}

export interface DashboardStats {
  totalVisits: number;
  todayVisits: number;
  totalSupervisors: number;
  coveragePercent: number;
  tempBreachPercent: number;
  visitsPerDay: { date: string; count: number }[];
  coveragePerRoute: { routeCode: string; routeName: string; visited: number; total: number; coverage: number }[];
  supervisorPerformance: {
    supervisorId: string;
    supervisorName: string;
    visitsCount: number;
    uniqueOutlets: number;
    breaches: number;
    coveragePercent: number;
  }[];
  temperatureBreaches: {
    visitId: string;
    customerName: string;
    assetType: AssetType;
    temperature: number;
    supervisorName: string;
    visitDate: string;
  }[];
}

// Wizard Local State for persistence
export interface VisitWizardState {
  visitId: string;
  routeCode: string;
  customerCode: string;
  customerName?: string;
  classification?: string;
  channel?: string;
  assetType?: AssetType;
  temperature?: number;
  tempInRange?: boolean;
  actionRequired?: ActionRequiredType;
  observation?: string;
  photos: {
    photoId: string;
    category: 'Dairy' | 'Beverages' | 'Ice Cream' | 'Assets';
    cloudinaryUrl: string;
    publicId: string;
    uploadedAt: string;
  }[];
  npdResponses: Record<string, NPDStatus>; // SKUCode -> NPDStatus
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  currentStep: number;
  status: VisitStatus;
}

// Excel Import wizard status
export interface ImportPreviewRow {
  rowNum: number;
  data: Record<string, any>;
  errors: string[];
}

export interface ImportSummary {
  inserted: number;
  updated: number;
  removed: number;
  failed: number;
  errors: { row: number; error: string }[];
}
