// models/Department.ts
export interface Department {
  id: string;
  name: string;
}

// Función helper para generar UUID único

import * as Crypto from 'expo-crypto';
export const generateDepartmentId = (): string => {
  return Crypto.randomUUID();
};