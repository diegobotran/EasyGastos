import { request } from './http';
import type {
  ApiDataResponse,
  CatalogItem,
  CatalogKey,
  CatalogListResponse,
  InvoiceValidity
} from '../types/catalogs';

export interface CatalogQuery {
  page: number;
  limit: number;
  search: string;
  active: '' | 'true' | 'false';
}

const queryString = (query: CatalogQuery) => {
  const params = new URLSearchParams({ page: String(query.page), limit: String(query.limit) });
  if (query.search) params.set('search', query.search);
  if (query.active) params.set('active', query.active);
  return params.toString();
};

export const listCatalog = <T extends CatalogItem>(key: CatalogKey, query: CatalogQuery, token: string) =>
  request<CatalogListResponse<T>>(`/api/admin/${key}?${queryString(query)}`, { token });

export const createCatalogItem = <T extends CatalogItem>(key: CatalogKey, body: Record<string, unknown>, token: string) =>
  request<ApiDataResponse<T>>(`/api/admin/${key}`, { method: 'POST', body, token });

export const updateCatalogItem = <T extends CatalogItem>(key: CatalogKey, id: string, body: Record<string, unknown>, token: string) =>
  request<ApiDataResponse<T>>(`/api/admin/${key}/${id}`, { method: 'PUT', body, token });

export const setCatalogItemStatus = <T extends CatalogItem>(key: CatalogKey, id: string, active: boolean, updatedAt: string, token: string) =>
  request<ApiDataResponse<T>>(`/api/admin/${key}/${id}/status`, {
    method: 'PATCH',
    body: { active, updatedAt },
    token
  });

export const getInvoiceValidity = (token: string) =>
  request<ApiDataResponse<InvoiceValidity>>('/api/admin/parameters/invoice-validity', { token });

export const updateInvoiceValidity = (body: Pick<InvoiceValidity, 'value' | 'active' | 'updatedAt'>, token: string) =>
  request<ApiDataResponse<InvoiceValidity>>('/api/admin/parameters/invoice-validity', {
    method: 'PUT',
    body,
    token
  });
