/**
 * Servicio para buscar facturas en la base de datos SAT (Verificador Interno)
 * 
 * Este servicio consulta la colección sat_facturas en MongoDB para buscar
 * facturas por NIT del emisor y Número del DTE, permitiendo autocompletar
 * datos de gastos con información verificada del SAT.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Interface para los datos de una factura SAT
 */
export interface SATFactura {
  // Identificación
  fechaEmision: string;
  numeroAutorizacion: string;
  tipoDTE: string;
  serie: string;
  numeroDTE: string;
  
  // Emisor (proveedor)
  nitEmisor: string;
  nombreEmisor: string;
  clasificacionEmisor?: string;
  codigoEstablecimiento?: string;
  nombreEstablecimiento?: string;
  
  // Receptor (empresa)
  idReceptor: string;
  nombreReceptor: string;
  
  // Certificador
  nitCertificador?: string;
  nombreCertificador?: string;
  
  // Estado
  estado?: string;
  marcaAnulado?: string;
  fechaAnulacion?: string;
  exportacion?: string;
  ubicacionTemporal?: string;
  
  // Montos
  moneda?: string;
  granTotal: number;
  iva: number;
  
  // Impuestos
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

/**
 * Interface para la respuesta del servidor
 */
interface SATFacturaResponse {
  encontrada: boolean;
  factura?: SATFactura;
  mensaje?: string;
}

/**
 * Busca una factura en la base de datos SAT por NIT del emisor y Número del DTE
 * 
 * @param nitEmisor - NIT del emisor/proveedor (sin guiones)
 * @param numeroDTE - Número del DTE de la factura
 * @returns Promise con la factura encontrada o null si no existe
 */
export const buscarFacturaSAT = async (
  nitEmisor: string,
  numeroDTE: string
): Promise<SATFactura | null> => {
  try {
    console.log(`🔍 Verificador SAT: Buscando factura NIT=${nitEmisor}, DTE=${numeroDTE}`);

    // Obtener URL del backend
    const backendUrl = await AsyncStorage.getItem('backendUrl');
    if (!backendUrl) {
      console.error('❌ Verificador SAT: No hay URL del backend configurada');
      return null;
    }

    // Obtener token de autenticación
    const token = await AsyncStorage.getItem('authToken');
    if (!token) {
      console.error('❌ Verificador SAT: No hay token de autenticación');
      return null;
    }

    // Limpiar NIT (remover guiones y espacios)
    const nitLimpio = nitEmisor.replace(/[-\s]/g, '');
    
    // Hacer request al backend
    const response = await fetch(`${backendUrl}/api/sat/buscar-factura`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        nitEmisor: nitLimpio,
        numeroDTE: numeroDTE
      })
    });

    if (!response.ok) {
      console.error(`❌ Verificador SAT: Error HTTP ${response.status}`);
      return null;
    }

    const data: SATFacturaResponse = await response.json();

    if (data.encontrada && data.factura) {
      console.log('✅ Verificador SAT: Factura encontrada en base de datos');
      console.log(`   📋 Autorización: ${data.factura.numeroAutorizacion}`);
      console.log(`   💰 Total: ${data.factura.moneda} ${data.factura.granTotal}`);
      console.log(`   🏢 Proveedor: ${data.factura.nombreEmisor}`);
      return data.factura;
    } else {
      console.log('⚠️  Verificador SAT: Factura no encontrada en base de datos');
      return null;
    }

  } catch (error) {
    console.error('❌ Verificador SAT: Error de conexión:', error);
    return null;
  }
};

/**
 * Formatea una fecha ISO a formato legible
 * @param isoDate - Fecha en formato ISO
 * @returns Fecha formateada DD/MM/YYYY
 */
export const formatearFechaSAT = (isoDate: string): string => {
  try {
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (error) {
    return isoDate;
  }
};

/**
 * Busca una factura en la base de datos SAT por Serie y Número del DTE
 * Opcionalmente puede filtrar por NIT del Receptor (la empresa que recibe la factura)
 * 
 * @param serie - Serie de la factura (ej: "A", "B", etc.)
 * @param numeroDTE - Número del DTE de la factura
 * @param nitReceptor - (Opcional) NIT del receptor/empresa para filtrar búsqueda
 * @returns Promise con la factura encontrada o null si no existe
 */
export const buscarFacturaPorNumero = async (
  serie: string,
  numeroDTE: string,
  nitReceptor?: string
): Promise<SATFactura | null> => {
  try {
    console.log(`🔍 Verificador SAT: Buscando factura Serie=${serie}, DTE=${numeroDTE}`);
    if (nitReceptor) {
      console.log(`   Con filtro NIT Receptor: ${nitReceptor}`);
    }

    // Obtener URL del backend
    const backendUrl = await AsyncStorage.getItem('backendUrl');
    if (!backendUrl) {
      console.error('❌ Verificador SAT: No hay URL del backend configurada');
      return null;
    }

    // Obtener token de autenticación
    const token = await AsyncStorage.getItem('authToken');
    if (!token) {
      console.error('❌ Verificador SAT: No hay token de autenticación');
      return null;
    }

    // Construir body del request
    const body: { serie: string; numeroDTE: string; nitReceptor?: string } = {
      serie: serie,
      numeroDTE: numeroDTE
    };
    
    // Agregar NIT del receptor si está disponible
    if (nitReceptor) {
      body.nitReceptor = nitReceptor;
    }

    // Hacer request al backend
    const response = await fetch(`${backendUrl}/api/sat/buscar-por-numero`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error(`❌ Verificador SAT: Error HTTP ${response.status}`);
      return null;
    }

    const data: SATFacturaResponse = await response.json();

    if (data.encontrada && data.factura) {
      console.log('✅ Verificador SAT: Factura encontrada en base de datos');
      console.log(`   📋 Autorización: ${data.factura.numeroAutorizacion}`);
      console.log(`   💰 Total: ${data.factura.moneda} ${data.factura.granTotal}`);
      console.log(`   🏢 Proveedor: ${data.factura.nombreEmisor}`);
      return data.factura;
    } else {
      console.log('⚠️  Verificador SAT: Factura no encontrada en base de datos');
      return null;
    }

  } catch (error) {
    console.error('❌ Verificador SAT: Error de conexión:', error);
    return null;
  }
};
