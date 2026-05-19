const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3000;
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat';
const API_SECRET_TOKEN = "mi_token_super_seguro_2025_app_facturas";

// Límite aumentado para textos largos de OCR
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token === API_SECRET_TOKEN) next();
    else res.status(401).json({ error: 'Acceso no autorizado' });
};

function cleanJSON(text) {
    try {
        return JSON.parse(text);
    } catch (e) {
        const match = text.match(/\{[\s\S]*\}/);
        return match ? JSON.parse(match[0]) : null;
    }
}

app.post('/api/extract-invoice', authenticate, async (req, res) => {
    const { ocrText } = req.body;

    if (!ocrText) return res.status(400).json({ error: 'Falta texto OCR' });

    try {
        // === LOG 1: VER LO QUE LLEGA (TEXTO PLANO COMPLETO) ===
        console.log("\n>>> [INICIO] Recibiendo texto plano...");
        console.log(ocrText);
        console.log("------------------------------------------------");

        // PROMPT OPTIMIZADO para facturas guatemaltecas FEL
        const systemPrompt = `Extrae datos de facturas guatemaltecas FEL del texto OCR.

PATRONES A BUSCAR:

1. NIT PROVEEDOR (emisor):
   - Aparece cerca del nombre de empresa con S.A., Ltda, etc.
   - Formatos: "Nit: 12345-6", "NIT: 12345-6", "Nit.\\12345-6", "NIT 12345-6"
   - IGNORA "NIT: CF" (es el cliente, no el proveedor)

2. PROVEEDOR:
   - Razón social con S.A., Ltda, Sociedad Anónima
   - Usualmente en las primeras líneas del documento

3. TOTAL:
   - Número más alto cerca de "Total", "TOTAL", "Pagar", "Monto Total"
   - Puede tener formato: 1,234.56 o 1234.56

4. FECHA:
   - Formato: DD/MM/YYYY (ej: 31/12/2025)
   - Buscar "Fecha Emision:", "Fecha:", etc.

5. SERIE:
   - Código alfanumérico antes del número de factura
   - Ej: "Serie: 8BF3D09E" o parte de "8BF3D09E-3294513426"

6. NUMERO_FACTURA:
   - Número correlativo largo (8-10 dígitos)
   - Ej: "3294513426" o "Numero: 3294513426"

7. UUID (No. Autorización):
   - Código hexadecimal formato 8-4-4-4-12
   - Ej: 88F3D09E-C45E-4912-A86B-1E126373E4A2

8. DESCRIPCION:
   - Primer ítem/producto comprado
   - O categoría general: "Combustible", "Alimentos", "Servicios"

RESPONDE SOLO CON ESTE JSON:
{
    "nit": "string o null",
    "proveedor": "string o null",
    "fecha": "string o null",
    "total": number o null,
    "serie": "string o null",
    "numero_factura": "string o null",
    "uuid": "string o null",
    "descripcion": "string o null"
}`;

        // Calcular num_ctx dinámicamente (más eficiente)
        const textLength = ocrText.length;
        const numCtx = textLength > 2000 ? 4096 : 2048;

        const response = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "llama3.2:3b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: ocrText }
                ],
                format: "json",
                stream: false,
                options: { 
                    temperature: 0.1,      // Más determinista
                    num_ctx: numCtx,       // Contexto dinámico
                    num_thread: 8,         // Usa tus 8 cores
                    num_predict: 512,      // Límite de tokens de respuesta
                    top_k: 10,             // Más preciso
                    top_p: 0.9             // Sampling más enfocado
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama error: ${response.status}`);
        }

        const data = await response.json();
        const rawContent = data.message.content;

        // === LOG 2: VER LA RESPUESTA CRUDA DE LA IA ===
        console.log(">>> [IA RAW] Respuesta cruda:");
        console.log(rawContent);
        console.log("------------------------------------------------");

        const parsedJson = cleanJSON(rawContent);

        if (!parsedJson) {
            throw new Error("JSON inválido en respuesta");
        }

        // === RESPUESTA FINAL INCLUYENDO EL INPUT ===
        res.json({ 
            success: true, 
            data: parsedJson,           // Los datos limpios
            inputText: ocrText,         // El texto plano que se envió
            rawResponse: rawContent,    // El JSON crudo de la IA
            inputLength: ocrText.length,
            processingTime: data.eval_duration ? Math.round(data.eval_duration / 1000000) + 'ms' : 'N/A'
        });

    } catch (error) {
        console.error("!!! ERROR:", error.message);
        res.status(500).json({ 
            error: 'Error al procesar factura', 
            details: error.message,
            inputText: ocrText  // Devolver texto incluso en error para depurar
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor IA Ollama listo en puerto ${PORT}`);
    console.log(`📋 Modelo: llama3.2:3b`);
    console.log(`🔧 Threads: 8 cores`);
    console.log(`💾 Recursos: 32GB RAM disponible`);
});
