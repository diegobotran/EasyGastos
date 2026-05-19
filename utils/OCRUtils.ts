/**
 * Utilidades para procesamiento de imágenes OCR
 */
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Preprocesa una imagen para mejorar la calidad del OCR
 * @param imageUri - URI de la imagen original
 * @returns URI de la imagen procesada
 */
export const preprocessImageForOCR = async (imageUri: string): Promise<string> => {
  try {
    console.log('🔍 OCRUtils: Preprocesando imagen...');
    
    const manipResult = await ImageManipulator.manipulateAsync(
      imageUri,
      [
        { resize: { width: 1920 } }, // Escalar a un tamaño óptimo
      ],
      {
        compress: 0.9,
        format: ImageManipulator.SaveFormat.JPEG,
      }
    );
    
    console.log('✅ OCRUtils: Imagen procesada');
    return manipResult.uri;
  } catch (error) {
    console.error('❌ OCRUtils: Error preprocesando imagen:', error);
    return imageUri; // Retornar original si falla
  }
};

/**
 * Normaliza un número eliminando formato
 * @param value - Número con posible formato (comas, espacios)
 * @returns Número normalizado o null
 */
export const normalizeNumber = (value: string): string | null => {
  if (!value) return null;
  
  // Reemplazar comas por puntos (formato europeo)
  let normalized = value.replace(/,/g, '.');
  
  // Eliminar espacios
  normalized = normalized.replace(/\s/g, '');
  
  // Verificar que sea un número válido
  const parsed = parseFloat(normalized);
  if (isNaN(parsed)) return null;
  
  return normalized;
};

/**
 * Interface para palabras con coordenadas
 */
export interface Word {
  text: string;
  frame: { top: number; left: number; width: number; height: number };
}

/**
 * Extrae todas las palabras con sus coordenadas del resultado de ML Kit
 * @param result - Resultado de TextRecognition
 * @returns Array de palabras con coordenadas
 */
export const extractWordsWithCoordinates = (result: any): Word[] => {
  const words: Word[] = [];
  
  if (result.blocks && result.blocks.length > 0) {
    result.blocks.forEach((block: any) => {
      block.lines.forEach((line: any) => {
        line.elements.forEach((element: any) => {
          if (element.frame) {
            words.push({ 
              text: element.text, 
              frame: element.frame 
            });
          }
        });
      });
    });
  }
  
  return words;
};

/**
 * Extrae texto completo RAW del resultado de ML Kit
 * El texto se extrae tal cual viene del OCR, preservando el formato original
 * @param result - Resultado de TextRecognition
 * @returns Texto completo sin procesar
 */
export const extractFullText = (result: any): string => {
  // OPCIÓN 1: Si ML Kit tiene un campo .text directo, usarlo (más limpio)
  if (result.text && typeof result.text === 'string') {
    console.log('📄 OCR: Usando texto directo de ML Kit');
    return result.text;
  }
  
  // OPCIÓN 2: Concatenar líneas preservando formato original
  let fullText = '';
  if (result.blocks && result.blocks.length > 0) {
    result.blocks.forEach((block: any) => {
      block.lines.forEach((line: any) => {
        fullText += line.text + '\n';
      });
    });
  }
  
  console.log('📄 OCR: Texto extraído de bloques/líneas');
  return fullText;
};

/**
 * Extrae líneas limpias del texto OCR
 * @param fullText - Texto completo
 * @returns Array de líneas filtradas
 */
export const extractCleanLines = (fullText: string): string[] => {
  return fullText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
};
