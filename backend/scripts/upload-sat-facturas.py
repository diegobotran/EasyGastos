#!/usr/bin/env python3
"""
Script para subir facturas SAT desde archivos Excel locales al backend de EasyGastos

IMPORTANTE:
- Este script se ejecuta LOCALMENTE en tu computadora Windows
- Lee archivos Excel de una carpeta local
- Se conecta al backend API en AWS usando autenticación JWT
- NO necesita acceso directo a MongoDB (todo vía API)
- Implementa tracking de archivos para evitar duplicados

CAMPOS SOPORTADOS (33 campos del SAT Guatemala):
- Fecha de emisión, Número de Autorización, Tipo de DTE (nombre)
- Serie, Número del DTE, Clasificación emisor, Exportación
- Ubicación temporal, NIT del emisor, Nombre completo del emisor
- Código de establecimiento, Nombre del establecimiento
- ID del receptor, Nombre completo del receptor
- NIT del Certificador, Nombre completo del Certificador
- Estado, Moneda, Gran Total (Moneda Original)
- IVA, Marca de anulado, Fecha de anulación
- Impuestos: Petróleo, Turismo Hospedaje, Turismo Pasajes
- Timbre de Prensa, Bomberos, Tasa Municipal
- Bebidas alcohólicas, Tabaco, Cemento
- Bebidas no Alcohólicas, Tarifa Portuaria

Uso:
    python upload-sat-facturas.py --folder ./SAT --email tu@email.com --pin 1234
    python upload-sat-facturas.py --folder ./SAT --email tu@email.com --pin 1234 --dry-run
    python upload-sat-facturas.py --folder ./SAT --email tu@email.com --pin 1234 --force
    python upload-sat-facturas.py --folder ./SAT --email tu@email.com --pin 1234 --file factura.xlsx

Requisitos:
    pip install pandas openpyxl requests python-dotenv
"""

import os
import sys
import json
import hashlib
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    import pandas as pd
    import requests
    from dotenv import load_dotenv
except ImportError as e:
    print(f"❌ Error: Faltan dependencias. Instala con:")
    print(f"   pip install pandas openpyxl requests python-dotenv")
    sys.exit(1)


class SATUploader:
    """Cliente para subir facturas SAT al backend de EasyGastos"""
    
    def __init__(self, base_url: str, email: str, pin: str):
        self.base_url = base_url.rstrip('/')
        self.email = email
        self.pin = pin
        self.token = None
        self.session = requests.Session()
        
    def authenticate(self) -> bool:
        """Autenticarse con el backend y obtener token JWT"""
        try:
            print(f"🔐 Autenticando como {self.email}...")
            
            response = self.session.post(
                f"{self.base_url}/api/users/login",
                json={"email": self.email, "pin": self.pin},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                data = response.json()
                self.token = data.get('token')
                
                if self.token:
                    self.session.headers.update({
                        'Authorization': f'Bearer {self.token}',
                        'Content-Type': 'application/json'
                    })
                    print(f"✅ Autenticación exitosa")
                    return True
                else:
                    print(f"❌ Error: No se recibió token en la respuesta")
                    return False
            else:
                print(f"❌ Error de autenticación: {response.status_code}")
                print(f"   {response.text}")
                return False
                
        except Exception as e:
            print(f"❌ Error conectando al servidor: {e}")
            return False
    
    def get_processed_files(self) -> Dict[str, str]:
        """Obtener lista de archivos ya procesados del servidor"""
        try:
            response = self.session.get(f"{self.base_url}/api/sat/archivos")
            
            if response.status_code == 200:
                data = response.json()
                archivos = data.get('archivos', [])
                # Crear dict con nombre -> hash
                return {a['nombreArchivo']: a['hash'] for a in archivos}
            else:
                print(f"⚠️  No se pudo obtener lista de archivos procesados")
                return {}
                
        except Exception as e:
            print(f"⚠️  Error obteniendo archivos procesados: {e}")
            return {}
    
    def upload_facturas(self, nombre_archivo: str, facturas: List[Dict]) -> Dict:
        """Subir facturas al backend"""
        try:
            print(f"📤 Enviando {len(facturas)} facturas del archivo {nombre_archivo}...")
            
            response = self.session.post(
                f"{self.base_url}/api/sat/import",
                json={
                    "nombreArchivo": nombre_archivo,
                    "facturas": facturas
                }
            )
            
            if response.status_code == 200:
                return response.json()
            else:
                return {
                    "error": True,
                    "mensaje": f"Error {response.status_code}: {response.text}"
                }
                
        except Exception as e:
            return {
                "error": True,
                "mensaje": f"Error de conexión: {e}"
            }


def calcular_hash(facturas: List[Dict]) -> str:
    """Calcular hash MD5 del contenido de las facturas"""
    contenido = json.dumps(facturas, sort_keys=True)
    return hashlib.md5(contenido.encode()).hexdigest()


def extraer_codigo_sociedad(nombre_archivo: str) -> Optional[str]:
    """
    Extrae el código de sociedad de los primeros 4 dígitos del nombre del archivo.
    
    Ejemplos:
        4100_06.02.2026_1.xls -> "4100"
        1234_facturas.xlsx -> "1234"
        archivo_sin_codigo.xls -> None
    """
    import re
    # Buscar los primeros 4 dígitos al inicio del nombre
    match = re.match(r'^(\d{4})', nombre_archivo)
    if match:
        return match.group(1)
    return None


def leer_excel(ruta_archivo: Path, codigo_sociedad: Optional[str] = None) -> List[Dict]:
    """
    Leer archivo Excel y convertir a lista de facturas
    
    Args:
        ruta_archivo: Path al archivo Excel
        codigo_sociedad: Código de 4 dígitos extraído del nombre del archivo
    
    Mapeo de columnas del Excel (campos reales del SAT Guatemala):
    - Fecha de emisión -> fechaEmision
    - Número de Autorización -> numeroAutorizacion
    - Tipo de DTE (nombre) -> tipoDTE
    - Serie -> serie
    - Número del DTE -> numeroDTE
    - Clasificación emisor -> clasificacionEmisor
    - Exportación -> exportacion
    - Ubicación temporal -> ubicacionTemporal
    - NIT del emisor -> nitEmisor
    - Nombre completo del emisor -> nombreEmisor
    - Código de establecimiento -> codigoEstablecimiento
    - Nombre del establecimiento -> nombreEstablecimiento
    - ID del receptor -> idReceptor
    - Nombre completo del receptor -> nombreReceptor
    - NIT del Certificador -> nitCertificador
    - Nombre completo del Certificador -> nombreCertificador
    - Estado -> estado
    - Moneda -> moneda
    - Gran Total (Moneda Original) -> granTotal
    - IVA (monto de este impuesto) -> iva
    - Marca de anulado -> marcaAnulado
    - Fecha de anulación -> fechaAnulacion
    - Petróleo (monto de este impuesto) -> impuestoPetroleo
    - Turismo Hospedaje (monto de este impuesto) -> impuestoTurismoHospedaje
    - Turismo Pasajes (monto de este impuesto) -> impuestoTurismoPasajes
    - Timbre de Prensa (monto de este impuesto) -> impuestoTimbrePrensa
    - Bomberos (monto de este impuesto) -> impuestoBomberos
    - Tasa Municipal (monto de este impuesto) -> impuestoTasaMunicipal
    - Bebidas alcohólicas (monto de este impuesto) -> impuestoBebidasAlcoholicas
    - Tabaco (monto de este impuesto) -> impuestoTabaco
    - Cemento (monto de este impuesto) -> impuestoCemento
    - Bebidas no Alcohólicas (monto de este impuesto) -> impuestoBebidasNoAlcoholicas
    - Tarifa Portuaria (monto de este impuesto) -> impuestoTarifaPortuaria
    """
    
    print(f"📖 Leyendo archivo: {ruta_archivo.name}")
    
    try:
        # Leer Excel
        df = pd.read_excel(ruta_archivo)
        
        print(f"   📄 Filas encontradas: {len(df)}")
        
        # Mapeo de columnas Excel -> modelo (campos reales del SAT)
        columnas_map = {
            'Fecha de emisión': 'fechaEmision',
            'Número de Autorización': 'numeroAutorizacion',
            'Tipo de DTE (nombre)': 'tipoDTE',
            'Serie': 'serie',
            'Número del DTE': 'numeroDTE',
            'Clasificación emisor': 'clasificacionEmisor',
            'Exportación': 'exportacion',
            'Ubicación temporal': 'ubicacionTemporal',
            'NIT del emisor': 'nitEmisor',
            'Nombre completo del emisor': 'nombreEmisor',
            'Código de establecimiento': 'codigoEstablecimiento',
            'Nombre del establecimiento': 'nombreEstablecimiento',
            'ID del receptor': 'idReceptor',
            'Nombre completo del receptor': 'nombreReceptor',
            'NIT del Certificador': 'nitCertificador',
            'Nombre completo del Certificador': 'nombreCertificador',
            'Estado': 'estado',
            'Moneda': 'moneda',
            'Gran Total (Moneda Original)': 'granTotal',
            'IVA (monto de este impuesto)': 'iva',
            'Marca de anulado': 'marcaAnulado',
            'Fecha de anulación': 'fechaAnulacion',
            'Petróleo (monto de este impuesto)': 'impuestoPetroleo',
            'Turismo Hospedaje (monto de este impuesto)': 'impuestoTurismoHospedaje',
            'Turismo Pasajes (monto de este impuesto)': 'impuestoTurismoPasajes',
            'Timbre de Prensa (monto de este impuesto)': 'impuestoTimbrePrensa',
            'Bomberos (monto de este impuesto)': 'impuestoBomberos',
            'Tasa Municipal (monto de este impuesto)': 'impuestoTasaMunicipal',
            'Bebidas alcohólicas (monto de este impuesto)': 'impuestoBebidasAlcoholicas',
            'Tabaco (monto de este impuesto)': 'impuestoTabaco',
            'Cemento (monto de este impuesto)': 'impuestoCemento',
            'Bebidas no Alcohólicas (monto de este impuesto)': 'impuestoBebidasNoAlcoholicas',
            'Tarifa Portuaria (monto de este impuesto)': 'impuestoTarifaPortuaria'
        }
        
        # Campos que son números/importes
        campos_numericos = [
            'granTotal', 'iva', 'impuestoPetroleo', 'impuestoTurismoHospedaje',
            'impuestoTurismoPasajes', 'impuestoTimbrePrensa', 'impuestoBomberos',
            'impuestoTasaMunicipal', 'impuestoBebidasAlcoholicas', 'impuestoTabaco',
            'impuestoCemento', 'impuestoBebidasNoAlcoholicas', 'impuestoTarifaPortuaria'
        ]
        
        # Campos que son fechas
        campos_fecha = ['fechaEmision', 'fechaAnulacion']
        
        # Convertir DataFrame a lista de dicts
        facturas = []
        for idx, row in df.iterrows():
            factura = {}
            
            for col_excel, col_modelo in columnas_map.items():
                if col_excel in df.columns:
                    valor = row[col_excel]
                    
                    # Convertir NaN a None
                    if pd.isna(valor):
                        valor = None
                    # Convertir fechas a string ISO
                    elif col_modelo in campos_fecha and isinstance(valor, (pd.Timestamp, datetime)):
                        valor = valor.isoformat()
                    # Convertir números
                    elif col_modelo in campos_numericos:
                        valor = float(valor) if valor is not None else 0
                    # Strings
                    else:
                        valor = str(valor).strip() if valor is not None else ''
                    
                    factura[col_modelo] = valor
            
            # Agregar código de sociedad extraído del nombre del archivo
            if codigo_sociedad:
                factura['codigoSociedad'] = codigo_sociedad
            
            # Validar que tenga campos mínimos requeridos
            if factura.get('numeroAutorizacion') and factura.get('fechaEmision'):
                facturas.append(factura)
            else:
                print(f"   ⚠️  Fila {idx+2} sin número de autorización o fecha, omitiendo")
        
        print(f"   ✅ Facturas válidas: {len(facturas)}")
        return facturas
        
    except Exception as e:
        print(f"   ❌ Error leyendo archivo: {e}")
        return []


def main():
    parser = argparse.ArgumentParser(
        description='Subir facturas SAT desde Excel local al backend de EasyGastos',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:
  python upload-sat-facturas.py --folder ./SAT --email admin@empresa.com --pin 1234
  python upload-sat-facturas.py --folder C:\\Facturas\\SAT --email admin@empresa.com --pin 1234 --dry-run
  python upload-sat-facturas.py --folder ./SAT --email admin@empresa.com --pin 1234 --force
  python upload-sat-facturas.py --folder ./SAT --email admin@empresa.com --pin 1234 --file sociedad_123.xlsx

Variables de entorno (opcional, en archivo .env):
  BACKEND_URL=http://23.20.116.61:3000
  SAT_EMAIL=admin@empresa.com
  SAT_PIN=1234
  SAT_FOLDER=./SAT
        """
    )
    
    # Cargar variables de entorno
    load_dotenv()
    
    parser.add_argument('--folder', type=str, 
                       default=os.getenv('SAT_FOLDER', './SAT'),
                       help='Carpeta con archivos Excel (default: ./SAT)')
    parser.add_argument('--url', type=str,
                       default=os.getenv('BACKEND_URL', 'http://23.20.116.61:3000'),
                       help='URL del backend (default: http://23.20.116.61:3000)')
    parser.add_argument('--email', type=str,
                       default=os.getenv('SAT_EMAIL'),
                       help='Email para autenticación (requerido)')
    parser.add_argument('--pin', type=str,
                       default=os.getenv('SAT_PIN'),
                       help='PIN para autenticación (requerido)')
    parser.add_argument('--file', type=str,
                       help='Procesar solo un archivo específico')
    parser.add_argument('--dry-run', action='store_true',
                       help='Solo mostrar qué se haría sin subir datos')
    parser.add_argument('--force', action='store_true',
                       help='Forzar reprocesamiento de archivos ya subidos')
    
    args = parser.parse_args()
    
    # Validar parámetros requeridos
    if not args.email or not args.pin:
        print("❌ Error: Se requiere --email y --pin")
        print("   Usa --help para más información")
        sys.exit(1)
    
    # Validar carpeta
    folder_path = Path(args.folder)
    if not folder_path.exists():
        print(f"❌ Error: La carpeta no existe: {folder_path}")
        sys.exit(1)
    
    print("=" * 70)
    print("📊 SUBIDA DE FACTURAS SAT A EASYGASTOS")
    print("=" * 70)
    print(f"📁 Carpeta: {folder_path.absolute()}")
    print(f"🌐 Backend: {args.url}")
    print(f"👤 Usuario: {args.email}")
    print(f"🧪 Modo: {'DRY RUN (sin cambios)' if args.dry_run else 'PRODUCCIÓN'}")
    print(f"🔄 Forzar: {'Sí' if args.force else 'No'}")
    print("=" * 70)
    
    # Crear cliente
    uploader = SATUploader(args.url, args.email, args.pin)
    
    # Autenticarse
    if not uploader.authenticate():
        print("\n❌ No se pudo autenticar. Verifica email, pin y conexión al servidor.")
        sys.exit(1)
    
    # Obtener archivos ya procesados
    archivos_procesados = {} if args.force else uploader.get_processed_files()
    
    if archivos_procesados:
        print(f"\n📋 Archivos ya procesados en el servidor: {len(archivos_procesados)}")
    
    # Buscar archivos Excel
    if args.file:
        archivos = [folder_path / args.file]
        if not archivos[0].exists():
            print(f"❌ Error: Archivo no encontrado: {archivos[0]}")
            sys.exit(1)
    else:
        archivos = list(folder_path.glob('*.xlsx')) + list(folder_path.glob('*.xls'))
        archivos = [f for f in archivos if not f.name.startswith('~')]  # Excluir archivos temporales
    
    if not archivos:
        print(f"\n⚠️  No se encontraron archivos Excel en: {folder_path}")
        sys.exit(0)
    
    print(f"\n📦 Archivos encontrados: {len(archivos)}")
    
    # Procesar archivos
    total_facturas = 0
    archivos_subidos = 0
    archivos_omitidos = 0
    archivos_error = 0
    
    for archivo in archivos:
        print(f"\n{'─' * 70}")
        
        # Extraer código de sociedad del nombre del archivo
        codigo_sociedad = extraer_codigo_sociedad(archivo.name)
        if codigo_sociedad:
            print(f"🏢 Código de sociedad detectado: {codigo_sociedad}")
        else:
            print(f"⚠️  No se detectó código de sociedad en el nombre (debe empezar con 4 dígitos)")
        
        # Leer facturas del Excel
        facturas = leer_excel(archivo, codigo_sociedad)
        
        if not facturas:
            print(f"⏭️  Omitiendo archivo sin facturas válidas")
            archivos_omitidos += 1
            continue
        
        # Calcular hash
        hash_contenido = calcular_hash(facturas)
        
        # Verificar si ya fue procesado
        if not args.force and archivo.name in archivos_procesados:
            hash_previo = archivos_procesados[archivo.name]
            if hash_previo == hash_contenido:
                print(f"⏭️  Archivo ya procesado previamente (contenido idéntico)")
                archivos_omitidos += 1
                continue
            else:
                print(f"🔄 Contenido modificado, reprocesando...")
        
        # Modo dry-run
        if args.dry_run:
            print(f"🧪 [DRY RUN] Se subirían {len(facturas)} facturas")
            total_facturas += len(facturas)
            archivos_subidos += 1
            continue
        
        # Subir facturas
        resultado = uploader.upload_facturas(archivo.name, facturas)
        
        if resultado.get('error'):
            print(f"❌ Error: {resultado.get('mensaje')}")
            archivos_error += 1
        else:
            if resultado.get('omitido'):
                print(f"⏭️  {resultado.get('mensaje')}")
                archivos_omitidos += 1
            else:
                stats = resultado.get('estadisticas', {})
                print(f"✅ {resultado.get('mensaje')}")
                print(f"   📊 Total: {stats.get('total')}")
                print(f"   ➕ Insertadas: {stats.get('insertadas')}")
                print(f"   🔄 Actualizadas: {stats.get('actualizadas')}")
                print(f"   ❌ Errores: {stats.get('errores')}")
                print(f"   🏢 Sociedades: {', '.join(stats.get('sociedades', []))}")
                
                total_facturas += stats.get('insertadas', 0) + stats.get('actualizadas', 0)
                archivos_subidos += 1
    
    # Resumen final
    print(f"\n{'═' * 70}")
    print(f"📊 RESUMEN FINAL")
    print(f"{'═' * 70}")
    print(f"📦 Archivos procesados: {len(archivos)}")
    print(f"✅ Archivos subidos: {archivos_subidos}")
    print(f"⏭️  Archivos omitidos: {archivos_omitidos}")
    print(f"❌ Archivos con error: {archivos_error}")
    print(f"📄 Total facturas procesadas: {total_facturas}")
    print(f"{'═' * 70}")
    
    if args.dry_run:
        print("🧪 Este fue un DRY RUN - No se modificó la base de datos")
        print("   Ejecuta sin --dry-run para subir los datos realmente")


if __name__ == '__main__':
    main()
