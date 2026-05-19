/**
 * Servicio para validar facturas electrónicas (DTE/FEL) con la SAT de Guatemala
 * 
 * IMPORTANTE: El portal de la SAT usa CAPTCHA, por lo que la validación
 * completamente automatizada no es posible. Este servicio ofrece dos métodos:
 * 
 * 1. validateInvoiceWithSAT() - Intenta validar automáticamente (puede fallar por CAPTCHA)
 * 2. openSATValidationInBrowser() - Abre el portal de la SAT con datos prellenados
 */

import { Linking, Platform } from 'react-native';

// URL del portal de verificación de la SAT Guatemala (con CAPTCHA)
const SAT_PORTAL_URL = 'https://portal.sat.gob.gt/portal/verificador-integrado/';

// URL del servicio web (puede no funcionar por CAPTCHA)
const SAT_VERIFICATION_URL = 'https://felpub.c.sat.gob.gt/verificador-web/webservice/validar';

export interface SATValidationRequest {
  uuid: string;           // UUID de la factura FEL
  nitEmisor: string;      // NIT del emisor
  nitReceptor: string;    // NIT del receptor (puede ser "CF" para Consumidor Final)
  fechaEmision: string;   // Fecha de emisión (formato: YYYY-MM-DD)
  monto: string;          // Monto total de la factura
}

export interface SATValidationResponse {
  success: boolean;
  valid: boolean;
  tipoRespuesta?: string;  // Tipo de respuesta del servicio SAT
  codigo?: string;         // Código de respuesta
  mensaje?: string;        // Mensaje descriptivo
  error?: string;          // Mensaje de error si la validación falla
}

/**
 * Valida una factura con el servicio web de la SAT
 * @param request Datos de la factura a validar
 * @returns Resultado de la validación
 */
export async function validateInvoiceWithSAT(request: SATValidationRequest): Promise<SATValidationResponse> {
  try {
    console.log('📡 SAT Validation: Iniciando validación...');
    console.log('📄 Datos:', {
      uuid: request.uuid,
      nitEmisor: request.nitEmisor,
      nitReceptor: request.nitReceptor,
      fecha: request.fechaEmision,
      monto: request.monto
    });

    // Construir el payload SOAP XML
    const xmlPayload = `
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sat="http://www.sat.gob.gt/dte/fel/0.1.0">
   <soapenv:Header/>
   <soapenv:Body>
      <sat:VerificarDTE>
         <sat:UUID>${request.uuid}</sat:UUID>
         <sat:NITEmisor>${request.nitEmisor}</sat:NITEmisor>
         <sat:NITReceptor>${request.nitReceptor}</sat:NITReceptor>
         <sat:FechaEmision>${request.fechaEmision}</sat:FechaEmision>
         <sat:Monto>${request.monto}</sat:Monto>
      </sat:VerificarDTE>
   </soapenv:Body>
</soapenv:Envelope>
    `.trim();

    console.log('📤 SAT Validation: Enviando petición SOAP...');

    // Realizar la petición HTTP al servicio SAT usando fetch
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 segundos de timeout

    try {
      const response = await fetch(SAT_VERIFICATION_URL, {
        method: 'POST',
        headers: { 
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': 'http://www.sat.gob.gt/dte/fel/0.1.0/VerificarDTE'
        },
        body: xmlPayload,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      console.log('📥 SAT Validation: Respuesta recibida, status:', response.status);

      if (!response.ok) {
        throw new Error(`Error del servidor SAT: ${response.status}`);
      }

      // Leer la respuesta XML
      const responseXml = await response.text();
      
      // Extraer datos relevantes de la respuesta XML usando regex
      // (alternativa más ligera que xml2js para React Native)
      const tipoRespuestaMatch = responseXml.match(/<TipoRespuesta[^>]*>([^<]+)<\/TipoRespuesta>/i);
      const codigoMatch = responseXml.match(/<Codigo[^>]*>([^<]+)<\/Codigo>/i);
      const mensajeMatch = responseXml.match(/<Mensaje[^>]*>([^<]+)<\/Mensaje>/i);

      const tipoRespuesta = tipoRespuestaMatch ? tipoRespuestaMatch[1] : '';
      const codigo = codigoMatch ? codigoMatch[1] : '';
      const mensaje = mensajeMatch ? mensajeMatch[1] : '';

      console.log('📊 SAT Validation: Resultado parseado');
      console.log('  🔹 Tipo Respuesta:', tipoRespuesta);
      console.log('  🔹 Código:', codigo);
      console.log('  🔹 Mensaje:', mensaje);

      // Determinar si la factura es válida
      // La SAT considera una factura válida cuando el mensaje contiene "VIGENTE"
      const isValid = mensaje.toUpperCase().includes('VIGENTE');

      return {
        success: true,
        valid: isValid,
        tipoRespuesta,
        codigo,
        mensaje
      };
    } finally {
      clearTimeout(timeoutId);
    }

  } catch (error: any) {
    console.error('❌ SAT Validation: Error en validación:', error.message);
    
    // Manejar errores específicos
    if (error.name === 'AbortError') {
      return {
        success: false,
        valid: false,
        error: 'Tiempo de espera agotado. El servicio de la SAT no respondió.'
      };
    }

    if (error.message.includes('Network request failed') || error.message.includes('Failed to fetch')) {
      return {
        success: false,
        valid: false,
        error: 'No se pudo conectar con el servicio de la SAT. Verifique su conexión a internet.'
      };
    }

    return {
      success: false,
      valid: false,
      error: `Error al validar factura: ${error.message}`
    };
  }
}

/**
 * Formatea el NIT eliminando guiones y espacios
 * @param nit NIT a formatear
 * @returns NIT formateado
 */
export function formatNIT(nit: string): string {
  return nit.replace(/[-\s]/g, '');
}

/**
 * Formatea una fecha al formato requerido por la SAT (YYYY-MM-DD)
 * @param date Fecha a formatear (puede ser Date, string YYYY-MM-DD o DD/MM/YYYY)
 * @returns Fecha en formato YYYY-MM-DD
 */
export function formatDateForSAT(date: Date | string): string {
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Si ya está en formato YYYY-MM-DD, devolverlo tal cual
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  
  // Si está en formato DD/MM/YYYY, convertir
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    const parts = date.split('/');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  
  return date;
}

/**
 * Valida que todos los campos requeridos estén presentes para validar con SAT
 * @param request Datos de la factura
 * @returns true si todos los campos están presentes, false en caso contrario
 */
export function canValidateWithSAT(request: Partial<SATValidationRequest>): boolean {
  return !!(
    request.uuid &&
    request.nitEmisor &&
    request.nitReceptor &&
    request.fechaEmision &&
    request.monto
  );
}

/**
 * Abre el portal de verificación de la SAT en el navegador con los datos de la factura
 * Esta es la forma RECOMENDADA de validar facturas ya que el portal usa CAPTCHA
 * 
 * @param request Datos de la factura a validar
 * @returns true si se abrió el navegador correctamente
 */
export async function openSATValidationInBrowser(request: SATValidationRequest): Promise<boolean> {
  try {
    console.log('🌐 SAT: Abriendo portal de validación en navegador...');
    
    // El portal de la SAT permite pasar el UUID como parámetro
    // El usuario debe ingresar manualmente los otros datos y resolver el CAPTCHA
    const url = `${SAT_PORTAL_URL}?uuid=${encodeURIComponent(request.uuid)}`;
    
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      console.log('✅ SAT: Portal abierto exitosamente');
      return true;
    } else {
      console.error('❌ SAT: No se puede abrir el navegador');
      return false;
    }
  } catch (error) {
    console.error('❌ SAT: Error abriendo portal:', error);
    return false;
  }
}

/**
 * Copia los datos de validación al portapapeles para que el usuario los pegue en el portal
 * @param request Datos de la factura
 * @returns Texto formateado para copiar
 */
export function formatSATDataForCopy(request: SATValidationRequest): string {
  return `UUID: ${request.uuid}
NIT Emisor: ${request.nitEmisor}
NIT Receptor: ${request.nitReceptor}
Fecha: ${request.fechaEmision}
Monto: ${request.monto}`;
}
