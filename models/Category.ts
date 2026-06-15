// models/Category.ts
import * as Crypto from 'expo-crypto';

export interface Category {
  id: string;
  name: string;
  sociedad?: string;
  centro?: string;
  cuenta?: string;
  ordenco?: string;
  email: string; // Mandatory field to associate with a user
  icon?: string;
  createdAt?: number; // Timestamp de creación
  updatedAt?: number; // Timestamp de última actualización
  needsSync?: boolean;
  lastSync?: number;
  serverUpdatedAt?: number;
}

// Función helper para generar UUID único
export const generateCategoryId = (): string => {
  return Crypto.randomUUID();
};
