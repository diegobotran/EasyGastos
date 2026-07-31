import { getAPI_BASE_URL } from '../config/backend';
import * as AuthService from './AuthService';

export type SATValidationErrorCode =
  | 'SAT_BACKEND_CONFIG_MISSING'
  | 'SAT_SESSION_MISSING'
  | 'SAT_REAUTH_FAILED'
  | 'SAT_NETWORK_ERROR'
  | 'SAT_UNAUTHORIZED'
  | 'SAT_FORBIDDEN'
  | 'EXPENSE_DUPLICATE'
  | 'SAT_BACKEND_ERROR'
  | 'SAT_INVALID_RESPONSE';

export class SATValidationError extends Error {
  code: SATValidationErrorCode;
  technicalDetails?: string;
  status?: number;

  constructor(code: SATValidationErrorCode, message: string, options?: { technicalDetails?: string; status?: number }) {
    super(message);
    this.name = 'SATValidationError';
    this.code = code;
    this.technicalDetails = options?.technicalDetails;
    this.status = options?.status;
  }
}

export interface SATFactura {
  fechaEmision: string;
  numeroAutorizacion: string;
  tipoDTE: string;
  serie: string;
  numeroDTE: string;
  nitEmisor: string;
  nombreEmisor: string;
  clasificacionEmisor?: string;
  codigoEstablecimiento?: string;
  nombreEstablecimiento?: string;
  idReceptor: string;
  nombreReceptor: string;
  nitCertificador?: string;
  nombreCertificador?: string;
  estado?: string;
  marcaAnulado?: string;
  fechaAnulacion?: string;
  exportacion?: string;
  ubicacionTemporal?: string;
  moneda?: string;
  granTotal: number;
  iva: number;
  impuestoPetroleo?: number;
  impuestoTurismoHospedaje?: number;
  impuestoTurismoPasajes?: number;
  impuestoTimbrePrensa?: number;
  impuestoBomberos?: number;
  impuestoTasaMunicipal?: number;
  impuestoBebidasAlcoholicas?: number;
  impuestoTabaco?: number;
  impuestoCemento?: number;
  impuestoBebidasNoAlcoholicas?: number;
  impuestoTarifaPortuaria?: number;
}

interface SATFacturaResponse {
  encontrada: boolean;
  factura?: SATFactura;
  mensaje?: string;
  disclaimer?: string;
}

export interface SATInternalValidationResult {
  code?: 'SAT_INVOICE_FOUND' | 'SAT_NOT_FOUND_D_PLUS_1';
  encontrada: boolean;
  validada?: boolean;
  factura?: SATFactura;
  campos?: {
    serie?: string;
    noinvoice?: string;
    vat_number?: string;
    receiver_vat_number?: string;
    supplier?: string;
    date?: string;
    amount?: number;
    uuid?: string;
    currency?: string;
    totiva?: number;
  };
  complementados?: Array<{ field: string; label: string; newValue: string | number }>;
  corregidos?: Array<{ field: string; label: string; previousValue: string | number; newValue: string | number }>;
  mensaje?: string;
  disclaimer?: string;
  facturaId?: string;
  snapshot?: {
    numeroAutorizacion?: string;
    serie: string;
    numeroDTE: string;
    nitEmisor: string;
    nombreEmisor?: string;
    idReceptor: string;
    nombreReceptor?: string;
    fechaEmision: string;
    granTotal: number;
    moneda?: string;
    iva?: number;
  };
  validatedAt?: string;
}

const toTechnicalMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return 'Sin detalle técnico adicional';
  }
};

const normalizeSATError = (error: unknown, fallbackMessage: string): SATValidationError => {
  if (error instanceof SATValidationError) {
    return error;
  }

  return new SATValidationError('SAT_NETWORK_ERROR', fallbackMessage, {
    technicalDetails: toTechnicalMessage(error),
  });
};

const parseErrorResponse = async (response: Response): Promise<{ message: string; code?: string }> => {
  const rawText = await response.text();
  if (!rawText) return { message: '' };

  try {
    const parsed = JSON.parse(rawText);
    return {
      message: String(parsed?.mensaje || parsed?.error || rawText),
      code: parsed?.code ? String(parsed.code) : undefined,
    };
  } catch {
    return { message: rawText };
  }
};

const formatSATDateForField = (value?: string): string | undefined => {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) return value;

  const year = parsedDate.getFullYear();
  const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
  const day = String(parsedDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const normalizeComparableSATValue = (value: string | number | undefined): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'number') return value.toFixed(2);
  return value.trim().toUpperCase();
};

const resolveBackendAuthContext = async (): Promise<{ backendUrl: string; token: string }> => {
  const backendUrl = await getAPI_BASE_URL();
  if (!backendUrl) {
    throw new SATValidationError('SAT_BACKEND_CONFIG_MISSING', 'No hay configuración de backend', {
      technicalDetails: 'getAPI_BASE_URL() devolvió un valor vacío',
    });
  }

  const { BackendSyncService } = await import('./BackendSyncService');
  const isConnected = await BackendSyncService.checkConnection();
  if (!isConnected) {
    throw new SATValidationError('SAT_NETWORK_ERROR', 'La validación SAT requiere conexión en línea con el backend', {
      technicalDetails: `Health check fallido para ${backendUrl}/health`,
    });
  }

  let token = await AuthService.getToken();
  if (token) {
    return { backendUrl, token };
  }

  const user = await AuthService.getLastLoggedInUser();
  const pin = await AuthService.getPIN();

  if (!user?.email || !pin) {
    throw new SATValidationError('SAT_SESSION_MISSING', 'No hay sesión activa', {
      technicalDetails: `Usuario=${user?.email || 'N/A'}, PIN=${pin ? 'presente' : 'ausente'}`,
    });
  }

  const loginResult = await BackendSyncService.loginAndGetToken(user.email, pin);
  if (!loginResult.success || !loginResult.token) {
    throw new SATValidationError('SAT_REAUTH_FAILED', loginResult.error || 'No se pudo reautenticar la sesión', {
      technicalDetails: `Reautenticación fallida para ${user.email}`,
    });
  }

  await AuthService.saveJWTToken(loginResult.token);
  return { backendUrl, token: loginResult.token };
};

const executeSATPost = async <T>(path: string, body: unknown): Promise<T> => {
  const { backendUrl, token } = await resolveBackendAuthContext();

  let response: Response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new SATValidationError('SAT_NETWORK_ERROR', 'No se pudo conectar al backend para consultar SAT', {
      technicalDetails: `URL=${backendUrl}${path} | ${toTechnicalMessage(error)}`,
    });
  }

  if (!response.ok) {
    const errorPayload = await parseErrorResponse(response);
    const errorMessage = errorPayload.message;

    if (response.status === 401) {
      throw new SATValidationError('SAT_UNAUTHORIZED', 'La sesión no es válida para consultar SAT', {
        status: response.status,
        technicalDetails: errorMessage || 'El backend respondió 401 Unauthorized',
      });
    }

    if (response.status === 403) {
      throw new SATValidationError('SAT_FORBIDDEN', 'La sesión no tiene permisos para consultar SAT', {
        status: response.status,
        technicalDetails: errorMessage || 'El backend respondió 403 Forbidden',
      });
    }

    if (response.status === 409 && errorPayload.code === 'EXPENSE_DUPLICATE') {
      throw new SATValidationError('EXPENSE_DUPLICATE', errorMessage, {
        status: response.status,
        technicalDetails: `HTTP ${response.status} | Verificación global de duplicidad`,
      });
    }

    throw new SATValidationError('SAT_BACKEND_ERROR', errorMessage || 'No se pudo consultar SAT', {
      status: response.status,
      technicalDetails: `HTTP ${response.status}${errorMessage ? ` | ${errorMessage}` : ''}`,
    });
  }

  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new SATValidationError('SAT_INVALID_RESPONSE', 'El backend SAT devolvió una respuesta inválida', {
      status: response.status,
      technicalDetails: toTechnicalMessage(error),
    });
  }
};

const buildValidationResultFromFactura = (
  payload: {
    serie: string;
    noinvoice: string;
    nitEmisor?: string;
    nitReceptor?: string;
    supplier?: string;
    date?: string;
    amount?: number;
    uuid?: string;
    currency?: string;
    totiva?: number;
  },
  factura: SATFactura
): SATInternalValidationResult => {
  const campos = {
    serie: factura.serie || payload.serie,
    noinvoice: factura.numeroDTE || payload.noinvoice,
    vat_number: factura.nitEmisor || payload.nitEmisor,
    receiver_vat_number: factura.idReceptor || payload.nitReceptor,
    supplier: factura.nombreEmisor || payload.supplier,
    date: formatSATDateForField(factura.fechaEmision) || payload.date,
    amount: typeof factura.granTotal === 'number' ? factura.granTotal : payload.amount,
    uuid: factura.numeroAutorizacion || payload.uuid,
    currency: factura.moneda ? factura.moneda.toUpperCase() : payload.currency,
    totiva: typeof factura.iva === 'number' ? factura.iva : payload.totiva,
  };

  const currentValues = {
    serie: payload.serie,
    noinvoice: payload.noinvoice,
    vat_number: payload.nitEmisor,
    receiver_vat_number: payload.nitReceptor,
    supplier: payload.supplier,
    date: payload.date,
    amount: payload.amount,
    uuid: payload.uuid,
    currency: payload.currency,
    totiva: payload.totiva,
  };

  const labels: Record<keyof typeof campos, string> = {
    serie: 'Serie',
    noinvoice: 'No. Factura',
    vat_number: 'NIT del Emisor',
    receiver_vat_number: 'NIT del Receptor',
    supplier: 'Proveedor',
    date: 'Fecha',
    amount: 'Monto',
    uuid: 'UUID',
    currency: 'Moneda',
    totiva: 'IVA',
  };

  const complementados: NonNullable<SATInternalValidationResult['complementados']> = [];
  const corregidos: NonNullable<SATInternalValidationResult['corregidos']> = [];

  (Object.keys(campos) as Array<keyof typeof campos>).forEach((field) => {
    const newValue = campos[field];
    if (newValue === undefined || newValue === null || newValue === '') return;

    const currentValue = currentValues[field];
    const normalizedCurrent = normalizeComparableSATValue(currentValue);
    const normalizedNew = normalizeComparableSATValue(newValue);

    if (!normalizedCurrent) {
      complementados.push({ field, label: labels[field], newValue });
      return;
    }

    if (normalizedCurrent !== normalizedNew) {
      corregidos.push({
        field,
        label: labels[field],
        previousValue: currentValue as string | number,
        newValue,
      });
    }
  });

  const messageParts: string[] = ['Factura validada por SAT.'];
  if (complementados.length > 0) messageParts.push(`Se complementaron ${complementados.length} campo(s).`);
  if (corregidos.length > 0) messageParts.push(`Se corrigieron ${corregidos.length} campo(s).`);
  if (complementados.length === 0 && corregidos.length === 0) messageParts.push('Los datos ya coincidían con SAT.');

  return {
    encontrada: true,
    validada: true,
    factura,
    campos,
    complementados,
    corregidos,
    mensaje: messageParts.join(' '),
  };
};

export const formatearFechaSAT = (isoDate: string): string => {
  try {
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return isoDate;
  }
};

export const validarFacturaInternaSAT = async (payload: {
  serie: string;
  noinvoice: string;
  nitEmisor?: string;
  nitReceptor?: string;
  supplier?: string;
  date?: string;
  amount?: number;
  uuid?: string;
  currency?: string;
  totiva?: number;
  excludeExpenseId?: string;
}): Promise<SATInternalValidationResult> => {
  try {
    return await executeSATPost<SATInternalValidationResult>('/api/sat/validar-interno', payload);
  } catch (error) {
    const normalizedError = normalizeSATError(error, 'Error inesperado al validar SAT');
    console.error('Verificador SAT interno: Error validando factura:', {
      code: normalizedError.code,
      message: normalizedError.message,
      technicalDetails: normalizedError.technicalDetails,
      status: normalizedError.status,
      payload,
    });
    throw normalizedError;
  }
};
