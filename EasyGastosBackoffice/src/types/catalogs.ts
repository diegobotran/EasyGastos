export type CatalogKey = 'sociedades' | 'centros' | 'cuentas' | 'ordenes-co';

export interface AdminUser {
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  isManager?: boolean;
}

export interface CatalogBase {
  _id: string;
  acronimo: string | null;
  codigo: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface Society extends CatalogBase {
  nit: string;
  razonSocial?: string | null;
  nombre?: string | null;
  activa: boolean;
}

export interface Center extends CatalogBase {
  ownerEmail: string;
  activo: boolean;
}

export interface Account extends CatalogBase {
  activo: boolean;
}

export interface COOrder extends CatalogBase {
  activo: boolean;
}

export type CatalogItem = Society | Center | Account | COOrder;

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface CatalogListResponse<T extends CatalogItem> {
  success: true;
  items: T[];
  pagination: Pagination;
}

export interface InvoiceValidity {
  _id: string;
  key: 'INVOICE_VALIDITY_DAYS';
  name: string;
  value: number;
  active: boolean;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface ApiDataResponse<T> {
  success: true;
  data: T;
}

export interface FieldDefinition {
  key: string;
  label: string;
  required?: boolean;
  maxLength?: number;
  type?: 'text' | 'email';
  placeholder?: string;
}

export interface CatalogDefinition {
  key: CatalogKey;
  title: string;
  description: string;
  singular: string;
  fields: FieldDefinition[];
  activeField: 'activa' | 'activo';
}
