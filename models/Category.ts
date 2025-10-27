// models/Category.ts
import * as Crypto from 'expo-crypto';

export interface Category {
  id: string;
  name: string;
  centro?: string;
  cuenta?: string;
  ordenco?: string;
  email: string; // Mandatory field to associate with a user
  icon?: string;
  needsSync?: boolean;
  lastSync?: number;
  serverUpdatedAt?: number;
}

// Función helper para generar UUID único
export const generateCategoryId = (): string => {
  return Crypto.randomUUID();
};