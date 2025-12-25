import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Liquidation } from '../models/Liquidation';
import { Expense } from '../models/Expense';

/**
 * Servicio para exportar liquidaciones a CSV
 */

export const generateLiquidationCSV = async (
  liquidation: Liquidation,
  expenses: Expense[]
): Promise<void> => {
  try {
    console.log('📄 Generando CSV de liquidación:', liquidation.id);

    // Validación: SOLO liquidaciones aprobadas pueden generar CSV
    if (liquidation.status !== 'approved') {
      throw new Error(`No se puede generar CSV. La liquidación debe estar APROBADA (estado actual: ${liquidation.status})`);
    }

    // Obtener datos del usuario
    const employeeName = liquidation.employeeName || 'N/A';
    const employeeCode = liquidation.userId?.slice(-6) || 'N/A';
    const sapDocNumber = liquidation.sapDocNumber || 'PENDIENTE';
    const liquidationDate = liquidation.submittedDate || liquidation.createdDate;

    // Construir contenido CSV
    let csvContent = '';

    // === HEADER ===
    csvContent += `LIQUIDACION DE GASTOS\n`;
    csvContent += `NO. DE DOCUMENTO GENERADO SAP,${sapDocNumber}\n`;
    csvContent += `\n`;
    csvContent += `REINTEGRO A FAVOR DE:,${employeeName}\n`;
    csvContent += `CODIGO,${employeeCode}\n`;
    csvContent += `\n`;

    // === ENCABEZADOS DE TABLA ===
    csvContent += [
      'No',
      'CUENTA CONTABLE',
      'AFECTO IVA',
      'MONTO',
      'In.CME de destino',
      'CENTRO DE COSTO',
      'ORDEN INTERNA',
      'SERIE DE FACTURA',
      'NO. DE FACTURA',
      'TP DOC',
      'FECHA DE FACTURA',
      'NIT',
      'NOMBRE DEL PROVEEDOR',
      'DESCRIPCION'
    ].join(',') + '\n';

    // === DATOS DE GASTOS ===
    expenses.forEach((expense, index) => {
      const row = [
        (index + 1).toString(), // No
        expense.cuenta || '', // CUENTA CONTABLE
        expense.totiva > 0 ? '12' : '0', // AFECTO IVA (si tiene IVA, marcar 12)
        expense.amount.toFixed(2), // MONTO
        '', // In.CME de destino (vacío)
        expense.centro || '4001010001', // CENTRO DE COSTO
        expense.ordenco || '2000002387', // ORDEN INTERNA
        expense.serie || '0', // SERIE DE FACTURA
        expense.noinvoice || '', // NO. DE FACTURA
        'LG', // TP DOC (tipo documento - siempre LG para liquidaciones)
        expense.date || '', // FECHA DE FACTURA
        expense.vat_number || 'C/F', // NIT
        expense.supplier || '', // NOMBRE DEL PROVEEDOR
        expense.description || '' // DESCRIPCION
      ];

      // Escapar commas en los campos de texto
      const escapedRow = row.map(field => {
        if (field.includes(',') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      });

      csvContent += escapedRow.join(',') + '\n';
    });

    // === FOOTER ===
    csvContent += `\n`;
    csvContent += `FECHA DE LIQUIDACION:,${liquidation.totalAmount.toFixed(2)},${liquidationDate}\n`;
    csvContent += `SOLICITANTE:,${employeeName}\n`;
    csvContent += `TOTAL,${liquidation.totalAmount.toFixed(2)}\n`;
    csvContent += `AUTORIZADO POR:,${liquidation.approverName || 'Pendiente'}\n`;
    csvContent += `\n`;
    csvContent += `FIRMA:,_________________________,FIRMA:,_________________________\n`;

    // === GUARDAR ARCHIVO ===
    const fileName = `Liquidacion_${liquidation.id.slice(-6)}_${Date.now()}.csv`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    console.log('✅ CSV generado:', fileUri);

    // === COMPARTIR ARCHIVO ===
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar Liquidación de Gastos',
        UTI: 'public.comma-separated-values-text',
      });
      console.log('✅ CSV compartido exitosamente');
    } else {
      console.warn('⚠️ Sharing no disponible en este dispositivo');
      throw new Error('No se puede compartir el archivo en este dispositivo');
    }
  } catch (error) {
    console.error('❌ Error generando CSV:', error);
    throw error;
  }
};

/**
 * Genera un CSV más detallado con todos los campos disponibles
 */
export const generateDetailedLiquidationCSV = async (
  liquidation: Liquidation,
  expenses: Expense[]
): Promise<void> => {
  try {
    console.log('📄 Generando CSV detallado de liquidación:', liquidation.id);

    // Validación: SOLO liquidaciones aprobadas pueden generar CSV
    if (liquidation.status !== 'approved') {
      throw new Error(`No se puede generar CSV. La liquidación debe estar APROBADA (estado actual: ${liquidation.status})`);
    }

    let csvContent = '';

    // === INFORMACIÓN DE LIQUIDACIÓN ===
    csvContent += `=== INFORMACION DE LIQUIDACION ===\n`;
    csvContent += `ID Liquidacion,${liquidation.id}\n`;
    csvContent += `Numero SAP,${liquidation.sapDocNumber || 'PENDIENTE'}\n`;
    csvContent += `Estado,${liquidation.status}\n`;
    csvContent += `Fecha Creacion,${liquidation.createdDate}\n`;
    csvContent += `Fecha Envio,${liquidation.submittedDate || 'N/A'}\n`;
    csvContent += `Fecha Aprobacion,${liquidation.approvedDate || 'N/A'}\n`;
    csvContent += `Empleado,${liquidation.employeeName}\n`;
    csvContent += `Email Empleado,${liquidation.userId}\n`;
    csvContent += `Aprobador,${liquidation.approverName || 'N/A'}\n`;
    csvContent += `Email Aprobador,${liquidation.approverEmail || 'N/A'}\n`;
    csvContent += `Total Gastos,${expenses.length}\n`;
    csvContent += `Monto Total,Q${liquidation.totalAmount.toFixed(2)}\n`;
    csvContent += `Comentarios,${liquidation.comments || 'N/A'}\n`;
    csvContent += `\n`;

    // === DETALLE DE GASTOS ===
    csvContent += `=== DETALLE DE GASTOS ===\n`;
    csvContent += [
      'No',
      'ID Gasto',
      'Descripcion',
      'Monto',
      'Fecha',
      'Categoria',
      'Proveedor',
      'NIT',
      'No. Factura',
      'Serie',
      'Departamento',
      'Centro Costo',
      'Cuenta Contable',
      'Orden Interna',
      'IVA',
      'Moneda',
      'Estado',
      'Notas'
    ].join(',') + '\n';

    expenses.forEach((expense, index) => {
      const row = [
        (index + 1).toString(),
        expense.id.slice(-8),
        expense.description,
        `Q${expense.amount.toFixed(2)}`,
        expense.date,
        expense.category,
        expense.supplier,
        expense.vat_number,
        expense.noinvoice,
        expense.serie,
        expense.department,
        expense.centro,
        expense.cuenta,
        expense.ordenco,
        `Q${expense.totiva.toFixed(2)}`,
        expense.currency,
        expense.status,
        expense.notes || ''
      ];

      const escapedRow = row.map(field => {
        const str = String(field);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });

      csvContent += escapedRow.join(',') + '\n';
    });

    // === RESUMEN ===
    csvContent += `\n`;
    csvContent += `=== RESUMEN ===\n`;
    csvContent += `Total de Gastos,${expenses.length}\n`;
    csvContent += `Suma de Montos,Q${expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}\n`;
    csvContent += `Suma de IVA,Q${expenses.reduce((sum, e) => sum + e.totiva, 0).toFixed(2)}\n`;
    csvContent += `Total Liquidacion,Q${liquidation.totalAmount.toFixed(2)}\n`;

    // === GUARDAR Y COMPARTIR ===
    const fileName = `Liquidacion_Detallada_${liquidation.id.slice(-6)}_${Date.now()}.csv`;
    const fileUri = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, csvContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    console.log('✅ CSV detallado generado:', fileUri);

    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar Liquidación Detallada',
        UTI: 'public.comma-separated-values-text',
      });
      console.log('✅ CSV detallado compartido exitosamente');
    } else {
      throw new Error('No se puede compartir el archivo en este dispositivo');
    }
  } catch (error) {
    console.error('❌ Error generando CSV detallado:', error);
    throw error;
  }
};
