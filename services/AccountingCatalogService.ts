import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';
import { getAPI_BASE_URL } from '../config/backend';
import {
  AccountingCatalogMetadata,
  AccountingCatalogOption,
  AccountingCatalogRecord,
  AccountingCatalogType,
  CatalogSyncResult,
} from '../models/AccountingCatalog';

const CATALOG_TYPES: AccountingCatalogType[] = ['sociedades', 'centros', 'cuentas', 'ordenesCO'];
const API_PATHS: Record<AccountingCatalogType, string> = {
  sociedades: 'sociedades',
  centros: 'centros',
  cuentas: 'cuentas',
  ordenesCO: 'ordenes-co',
};
const STORAGE_KEY = '@EasyGastos_AccountingCatalogs_v1';
const METADATA_KEY = '@EasyGastos_AccountingCatalogMetadata_v1';
const DATABASE_NAME = 'easygastos.db';

let db: SQLite.SQLiteDatabase | null = null;
let initialization: Promise<void> | null = null;

type ServerCatalogItem = {
  _id?: string;
  id?: string;
  codigo?: string;
  acronimo?: string;
  nit?: string;
  nombre?: string;
  razonSocial?: string;
  ownerEmail?: string;
  activa?: boolean;
  activo?: boolean;
  updatedAt?: string;
};

const emptyCatalogs = (): Record<AccountingCatalogType, AccountingCatalogRecord[]> => ({
  sociedades: [],
  centros: [],
  cuentas: [],
  ordenesCO: [],
});

const normalizeItem = (
  type: AccountingCatalogType,
  item: ServerCatalogItem,
  syncedAt: number,
): AccountingCatalogRecord => {
  const codigo = String(item.codigo || '').trim();
  const base = {
    id: String(item._id || item.id || `${type}:${codigo}`),
    type,
    codigo,
    acronimo: String(item.acronimo || codigo).trim(),
    active: item.activa !== false && item.activo !== false,
    updatedAt: item.updatedAt,
    syncedAt,
  };

  if (type === 'sociedades') {
    return {
      ...base,
      type,
      nit: String(item.nit || '').trim(),
      nombre: item.nombre,
      razonSocial: item.razonSocial,
    };
  }
  if (type === 'centros') {
    return { ...base, type, ownerEmail: String(item.ownerEmail || '').trim().toLowerCase() };
  }
  return { ...base, type } as AccountingCatalogRecord;
};

const initDB = async (): Promise<void> => {
  if (Platform.OS === 'web') return;
  if (initialization) return initialization;

  initialization = (async () => {
    db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS accounting_catalogs (
        type TEXT NOT NULL,
        id TEXT NOT NULL,
        codigo TEXT NOT NULL,
        acronimo TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        nit TEXT,
        nombre TEXT,
        razonSocial TEXT,
        ownerEmail TEXT,
        updatedAt TEXT,
        syncedAt INTEGER NOT NULL,
        PRIMARY KEY (type, id)
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_catalog_type_code
        ON accounting_catalogs(type, codigo);
      CREATE INDEX IF NOT EXISTS idx_accounting_catalog_active
        ON accounting_catalogs(type, active, codigo);
      CREATE TABLE IF NOT EXISTS accounting_catalog_metadata (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT
      );
    `);
  })().catch(error => {
    initialization = null;
    db = null;
    throw error;
  });

  return initialization;
};

const readWebCatalogs = async (): Promise<Record<AccountingCatalogType, AccountingCatalogRecord[]>> => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? { ...emptyCatalogs(), ...JSON.parse(raw) } : emptyCatalogs();
};

const readCatalog = async (type: AccountingCatalogType): Promise<AccountingCatalogRecord[]> => {
  if (Platform.OS === 'web') return (await readWebCatalogs())[type];
  await initDB();
  const rows = await db!.getAllAsync<any>(
    'SELECT * FROM accounting_catalogs WHERE type = ? ORDER BY codigo ASC',
    [type],
  );
  return rows.map(row => ({
    id: row.id,
    type: row.type,
    codigo: row.codigo,
    acronimo: row.acronimo,
    active: Boolean(row.active),
    nit: row.nit || undefined,
    nombre: row.nombre || undefined,
    razonSocial: row.razonSocial || undefined,
    ownerEmail: row.ownerEmail || undefined,
    updatedAt: row.updatedAt || undefined,
    syncedAt: row.syncedAt,
  })) as AccountingCatalogRecord[];
};

const replaceActiveSnapshot = async (
  snapshots: Record<AccountingCatalogType, AccountingCatalogRecord[]>,
  version: string,
  syncedAt: number,
): Promise<void> => {
  if (Platform.OS === 'web') {
    const previous = await readWebCatalogs();
    for (const type of CATALOG_TYPES) {
      const byCode = new Map(previous[type].map(item => [item.codigo, { ...item, active: false }]));
      snapshots[type].forEach(item => byCode.set(item.codigo, item));
      previous[type] = Array.from(byCode.values()).sort((a, b) => a.codigo.localeCompare(b.codigo));
    }
    await AsyncStorage.multiSet([
      [STORAGE_KEY, JSON.stringify(previous)],
      [METADATA_KEY, JSON.stringify({ version, lastSyncAt: syncedAt })],
    ]);
    return;
  }

  await initDB();
  await db!.withTransactionAsync(async () => {
    for (const type of CATALOG_TYPES) {
      await db!.runAsync('UPDATE accounting_catalogs SET active = 0 WHERE type = ?', [type]);
      for (const item of snapshots[type]) {
        await db!.runAsync(
          `INSERT INTO accounting_catalogs
            (type, id, codigo, acronimo, active, nit, nombre, razonSocial, ownerEmail, updatedAt, syncedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(type, codigo) DO UPDATE SET
             id = excluded.id,
             acronimo = excluded.acronimo,
             active = excluded.active,
             nit = excluded.nit,
             nombre = excluded.nombre,
             razonSocial = excluded.razonSocial,
             ownerEmail = excluded.ownerEmail,
             updatedAt = excluded.updatedAt,
             syncedAt = excluded.syncedAt`,
          [
            item.type,
            item.id,
            item.codigo,
            item.acronimo,
            item.active ? 1 : 0,
            'nit' in item ? item.nit : null,
            'nombre' in item ? item.nombre || null : null,
            'razonSocial' in item ? item.razonSocial || null : null,
            'ownerEmail' in item ? item.ownerEmail : null,
            item.updatedAt || null,
            item.syncedAt,
          ],
        );
      }
    }
    await db!.runAsync(
      `INSERT INTO accounting_catalog_metadata(key, value) VALUES ('version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [version],
    );
    await db!.runAsync(
      `INSERT INTO accounting_catalog_metadata(key, value) VALUES ('lastSyncAt', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(syncedAt)],
    );
  });
};

const fetchJson = async (url: string, token: string): Promise<any> => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`No se pudo sincronizar catálogos (${response.status}): ${body}`);
  }
  return response.json();
};

const fetchAll = async (
  baseUrl: string,
  token: string,
  type: AccountingCatalogType,
  syncedAt: number,
): Promise<AccountingCatalogRecord[]> => {
  const result: AccountingCatalogRecord[] = [];
  let page = 1;
  let pages = 1;
  do {
    const payload = await fetchJson(
      `${baseUrl}/api/catalogs/${API_PATHS[type]}?page=${page}&limit=100`,
      token,
    );
    const items = Array.isArray(payload.items) ? payload.items : [];
    result.push(...items.map((item: ServerCatalogItem) => normalizeItem(type, item, syncedAt)));
    pages = Math.max(1, Number(payload.pagination?.pages) || 1);
    page += 1;
  } while (page <= pages);
  return result;
};

export const getCatalogMetadata = async (): Promise<AccountingCatalogMetadata> => {
  if (Platform.OS === 'web') {
    const raw = await AsyncStorage.getItem(METADATA_KEY);
    return raw ? JSON.parse(raw) : { version: null, lastSyncAt: null };
  }
  await initDB();
  const rows = await db!.getAllAsync<{ key: string; value: string }>(
    "SELECT key, value FROM accounting_catalog_metadata WHERE key IN ('version', 'lastSyncAt')",
  );
  const values = Object.fromEntries(rows.map(row => [row.key, row.value]));
  return {
    version: values.version || null,
    lastSyncAt: values.lastSyncAt ? Number(values.lastSyncAt) : null,
  };
};

export const syncCatalogs = async (token: string, force = false): Promise<CatalogSyncResult> => {
  if (!token) return { success: false, changed: false, error: 'No existe una sesión válida para sincronizar.' };
  try {
    const baseUrl = await getAPI_BASE_URL();
    const versionPayload = await fetchJson(`${baseUrl}/api/catalogs/version`, token);
    const metadata = await getCatalogMetadata();
    if (!force && metadata.version && metadata.version === versionPayload.version) {
      return {
        success: true,
        changed: false,
        version: metadata.version,
        lastSyncAt: metadata.lastSyncAt || undefined,
      };
    }

    const syncedAt = Date.now();
    const entries = await Promise.all(
      CATALOG_TYPES.map(async type => [type, await fetchAll(baseUrl, token, type, syncedAt)] as const),
    );
    const snapshots = Object.fromEntries(entries) as Record<AccountingCatalogType, AccountingCatalogRecord[]>;
    await replaceActiveSnapshot(snapshots, versionPayload.version, syncedAt);
    return {
      success: true,
      changed: true,
      version: versionPayload.version,
      lastSyncAt: syncedAt,
      counts: Object.fromEntries(CATALOG_TYPES.map(type => [type, snapshots[type].length])) as Record<AccountingCatalogType, number>,
    };
  } catch (error) {
    return {
      success: false,
      changed: false,
      offline: true,
      error: error instanceof Error ? error.message : 'No se pudieron sincronizar los catálogos.',
    };
  }
};

export const getCatalogOptions = async (
  type: AccountingCatalogType,
  referencedCodes: string[] = [],
): Promise<AccountingCatalogOption[]> => {
  const items = await readCatalog(type);
  const byCode = new Map(items.map(item => [item.codigo, item]));
  const options = items
    .filter(item => item.active || referencedCodes.includes(item.codigo))
    .map(item => ({
      codigo: item.codigo,
      label: item.acronimo && item.acronimo !== item.codigo ? `${item.codigo} — ${item.acronimo}` : item.codigo,
      active: item.active,
      historical: !item.active,
    }));

  for (const code of referencedCodes.filter(Boolean)) {
    if (!byCode.has(code)) {
      options.push({ codigo: code, label: code, active: false, historical: true });
    }
  }
  return options.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));
};

export const getActiveSociedades = () => getCatalogOptions('sociedades');
export const getActiveCentros = () => getCatalogOptions('centros');
export const getActiveCuentas = () => getCatalogOptions('cuentas');
export const getActiveOrdenesCO = () => getCatalogOptions('ordenesCO');

export const areActiveReferences = async (references: {
  sociedad?: string;
  centro?: string;
  cuenta?: string;
  ordenco?: string;
}): Promise<{ valid: boolean; inactive: string[] }> => {
  const checks: [AccountingCatalogType, string | undefined, string][] = [
    ['sociedades', references.sociedad, 'Sociedad'],
    ['centros', references.centro, 'Centro'],
    ['cuentas', references.cuenta, 'Cuenta'],
    ['ordenesCO', references.ordenco, 'Orden CO'],
  ];
  const inactive: string[] = [];
  await Promise.all(checks.map(async ([type, code, label]) => {
    if (!code || !(await readCatalog(type)).some(item => item.codigo === code && item.active)) {
      inactive.push(`${label}: ${code || 'sin valor'}`);
    }
  }));
  return { valid: inactive.length === 0, inactive };
};
