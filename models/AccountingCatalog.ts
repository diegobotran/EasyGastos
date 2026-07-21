export type AccountingCatalogType = 'sociedades' | 'centros' | 'cuentas' | 'ordenesCO';

export interface AccountingCatalogItem {
  id: string;
  type: AccountingCatalogType;
  codigo: string;
  acronimo: string;
  active: boolean;
  updatedAt?: string;
  syncedAt: number;
}

export interface SociedadCatalogItem extends AccountingCatalogItem {
  type: 'sociedades';
  nit: string;
  nombre?: string;
  razonSocial?: string;
}

export interface CentroCatalogItem extends AccountingCatalogItem {
  type: 'centros';
  ownerEmail: string;
}

export interface CuentaCatalogItem extends AccountingCatalogItem {
  type: 'cuentas';
}

export interface OrdenCOCatalogItem extends AccountingCatalogItem {
  type: 'ordenesCO';
}

export type AccountingCatalogRecord =
  | SociedadCatalogItem
  | CentroCatalogItem
  | CuentaCatalogItem
  | OrdenCOCatalogItem;

export interface AccountingCatalogOption {
  codigo: string;
  label: string;
  active: boolean;
  historical: boolean;
}

export interface AccountingCatalogMetadata {
  version: string | null;
  lastSyncAt: number | null;
}

export interface CatalogSyncResult {
  success: boolean;
  changed: boolean;
  offline?: boolean;
  version?: string;
  lastSyncAt?: number;
  counts?: Record<AccountingCatalogType, number>;
  error?: string;
}
