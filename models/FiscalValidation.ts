import contract from '../contracts/fiscal-validation.contract.json';

export type SatStatus =
  | 'PENDIENTE_VALIDACION_SAT'
  | 'VALIDADO_SAT';

export type SatValidationCause =
  | 'NO_ENCONTRADO_D_PLUS_1'
  | 'DATOS_FISCALES_MODIFICADOS'
  | 'NINGUNA';

export type FiscalStatus =
  | 'PENDIENTE'
  | 'APTO_PARA_LIQUIDAR'
  | 'BLOQUEADO_NIT_SOCIEDAD'
  | 'BLOQUEADO_ANTIGUEDAD';

export type FiscalValidationSource = 'SAT_INTERNO';

export interface SatInvoiceSnapshot {
  numeroAutorizacion?: string;
  serie: string;
  numeroDTE: string;
  nitEmisor: string;
  idReceptor: string;
  fechaEmision: string;
  granTotal: number;
  moneda?: string;
}

export interface FiscalValidationMetadata {
  satValidatedAt?: string;
  satValidationSource?: FiscalValidationSource;
  satValidationFingerprint?: string;
  satFacturaId?: string;
  satInvoiceSnapshot?: SatInvoiceSnapshot;
  fiscalValidatedAt?: string;
  fiscalValidityDaysApplied?: number;
}

export const FISCAL_CONTRACT_VERSION = contract.version;
export const SAT_STATUSES = Object.freeze(contract.satStatuses) as readonly SatStatus[];
export const SAT_VALIDATION_CAUSES = Object.freeze(
  contract.satValidationCauses
) as readonly SatValidationCause[];
export const FISCAL_STATUSES = Object.freeze(
  contract.fiscalStatuses
) as readonly FiscalStatus[];
export const FISCAL_ERROR_CODES = Object.freeze(
  Object.values(contract.errorCodes).flat()
);
