// Script de Prueba - Formato de Datos Enviados al Chat
// Este archivo muestra EXACTAMENTE qué datos se envían al asistente de IA

// EJEMPLO DE GASTO COMPLETO EN LA APP (con todos los campos)
const expenseComplete = {
  id: "1737491234567",
  description: "Gasolina para viaje a Xela",
  amount: 350.50,
  date: "2026-01-15",
  category: "Transporte",
  status: "APROBADO_JEFE",
  expenseStatus: "draft",
  supplier: "Gasolinera Shell Central",
  vat_number: "12345678",
  department: "Ventas",
  notes: "Viaje de trabajo para visita a cliente",
  noinvoice: "FA-12345",
  serie: "A",
  uuid: "9a7f8b6c-5d4e-3f2a-1b0c-9d8e7f6a5b4c",
  centro: "1000",
  cuenta: "510001",
  ordenco: "ORD-2026-001",
  imageuri: "file:///storage/emulated/0/DCIM/Camera/IMG_20260115_123456.jpg", // ⚠️ ESTO NO SE ENVÍA
  totiva: 52.57,
  currency: "GTQ",
  email: "usuario@empresa.com",
  managerEmail: "jefe@empresa.com",
  liquidationId: null,
  createdAt: 1737491234567,
  updatedAt: 1737491234567,
  needsSync: false,
  synced: 1
};

// DATOS QUE REALMENTE SE ENVÍAN AL CHAT (optimizado, sin imágenes)
const expenseSentToChat = {
  // Información básica del gasto
  descripcion: "Gasolina para viaje a Xela",
  monto: 350.50,
  fecha: "2026-01-15",
  categoria: "Transporte",
  proveedor: "Gasolinera Shell Central",
  
  // Estados del gasto
  estado: "APROBADO_JEFE",
  estado_liquidacion: "draft",
  
  // Información de factura (sin UUID largo)
  numero_factura: "FA-12345",
  serie: "A",
  nit: "12345678",
  
  // Información contable
  departamento: "Ventas",
  centro: "1000",
  cuenta: "510001",
  
  // IVA y moneda
  iva: 52.57,
  moneda: "GTQ",
  
  // Notas y observaciones
  notas: "Viaje de trabajo para visita a cliente",
  
  // ID de liquidación
  en_liquidacion: "No"
  
  // ✅ NOTA: NO se incluye:
  // - imageuri (URL de imagen local)
  // - imageUrl (URL de imagen en servidor)
  // - photo (datos binarios)
  // - uuid (muy largo, no necesario para análisis)
  // - ids internos (id, createdAt, updatedAt, etc.)
  // - flags técnicos (needsSync, synced, serverUpdatedAt)
};

// EJEMPLO DE REQUEST COMPLETO AL ENDPOINT /chat-stateless/
const chatRequest = {
  question: "¿Cuánto he gastado en transporte este mes?",
  context_data: [
    expenseSentToChat,
    // ... más gastos con el mismo formato
  ]
};

// EJEMPLO DE RESPUESTA DEL SERVIDOR
const chatResponse = {
  response: "Basándome en tus gastos, has gastado Q350.50 en transporte este mes. Este gasto corresponde a gasolina para un viaje a Xela realizado el 15 de enero, facturado por Gasolinera Shell Central (factura FA-12345, serie A)."
};

// COMPARACIÓN DE TAMAÑO (aproximado)
console.log("=== ANÁLISIS DE CONSUMO DE TOKENS ===\n");

const fullExpenseJSON = JSON.stringify(expenseComplete);
const optimizedExpenseJSON = JSON.stringify(expenseSentToChat);

console.log("Tamaño gasto completo:", fullExpenseJSON.length, "caracteres");
console.log("Tamaño gasto optimizado:", optimizedExpenseJSON.length, "caracteres");
console.log("Reducción:", Math.round((1 - optimizedExpenseJSON.length / fullExpenseJSON.length) * 100), "%");

console.log("\n=== CAMPOS EXCLUIDOS (ahorro de tokens) ===");
console.log("❌ imageuri:", expenseComplete.imageuri.length, "caracteres");
console.log("❌ uuid:", expenseComplete.uuid?.length || 0, "caracteres");
console.log("❌ ordenco:", expenseComplete.ordenco.length, "caracteres");
console.log("❌ ids técnicos (id, createdAt, updatedAt, etc.)");
console.log("❌ flags de sincronización (needsSync, synced, serverUpdatedAt)");

console.log("\n=== BENEFICIOS ===");
console.log("✅ Reducción significativa de tokens (40-50%)");
console.log("✅ Respuestas más rápidas del modelo");
console.log("✅ Menor costo por consulta");
console.log("✅ Datos suficientes para análisis financiero completo");
console.log("✅ Sin comprometer la privacidad (no se envían imágenes)");

// EJEMPLO DE MÚLTIPLES GASTOS (10 gastos típicos)
console.log("\n=== SIMULACIÓN CON 10 GASTOS ===");
const tenExpensesFull = fullExpenseJSON.repeat(10).length;
const tenExpensesOptimized = optimizedExpenseJSON.repeat(10).length;

console.log("10 gastos completos:", tenExpensesFull, "caracteres (~", Math.round(tenExpensesFull / 4), "tokens)");
console.log("10 gastos optimizados:", tenExpensesOptimized, "caracteres (~", Math.round(tenExpensesOptimized / 4), "tokens)");
console.log("Ahorro de tokens:", Math.round((tenExpensesFull - tenExpensesOptimized) / 4), "tokens");
