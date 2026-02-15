# 📊 GUÍA DE FORMATO EXCEL PARA CARGA MASIVA

## Formato del Archivo Excel

El sistema acepta archivos `.xlsx` o `.xls` con el siguiente formato:

### Estructura de Columnas:

| badge_number | 2025-02-15 | 2025-02-16 | 2025-02-17 | 2025-02-18 | ... |
|--------------|------------|------------|------------|------------|-----|
| 12345        | A          | B          | F          | A          | ... |
| 67890        | B          | A          | A          | D          | ... |
| 11111        | F          | D          | B          | A          | ... |

### Explicación:

1. **Primera columna**: `badge_number` (número de placa del funcionario)
2. **Columnas siguientes**: Fechas en formato `YYYY-MM-DD` o `DD/MM/YYYY`
3. **Valores**: Código de sigla (A, B, C, D, F, PREV, TRAN, etc.)

### Ejemplo Práctico:

```
badge_number | 15-Feb-2025 | 16-Feb-2025 | 17-Feb-2025 | 18-Feb-2025 | 19-Feb-2025
-------------|-------------|-------------|-------------|-------------|-------------
12345        | A           | A           | B           | F           | D
67890        | B           | B           | A           | A           | F
11111        | F           | D           | A           | B           | A
22222        | A           | B           | F           | D           | A
33333        | B           | A           | A           | F           | B
```

## 📝 Notas Importantes:

1. **Header Row**: La primera fila DEBE contener los nombres de las columnas
2. **Badge Numbers**: Deben existir en la base de datos (tabla `profiles`)
3. **Siglas**: Deben existir en la base de datos (tabla `service_codes`)
4. **Fechas**: Pueden estar en formato Excel date o texto
5. **Celdas vacías**: Se ignoran automáticamente

## ⚠️ Errores Comunes:

1. ❌ Sigla no encontrada → Se reporta pero continúa con las demás
2. ❌ Usuario no encontrado → Se reporta pero continúa con las demás
3. ❌ Fecha inválida → Se omite esa celda
4. ❌ Archivo no es Excel → Error inmediato

## ✅ Validación Previa:

El sistema muestra una vista previa antes de confirmar:
- Total de servicios a cargar
- Usuarios afectados
- Días con servicios
- Primeros 10 registros como muestra

## 🔄 Proceso de Carga:

1. El usuario selecciona el archivo Excel
2. Sistema lee y parsea el contenido
3. Muestra vista previa con estadísticas
4. Usuario confirma la carga
5. Sistema:
   - Valida todos los datos
   - Elimina servicios existentes en esas fechas
   - Inserta los nuevos servicios
   - Reporta éxitos y errores

## 📥 Descargar Plantilla de Ejemplo:

Puedes crear un archivo Excel con esta estructura básica:

```
A1: badge_number
B1: 2025-02-15
C1: 2025-02-16
D1: 2025-02-17

A2: 12345
B2: A
C2: B
D2: F

A3: 67890
B3: B
C3: A
D3: A
```

## 💡 Tips:

1. Usa las siglas ya configuradas en el sistema
2. Verifica que los badge_numbers existan
3. Usa fechas consistentes en todo el archivo
4. Mantén el formato simple (sin fórmulas ni formato complejo)
5. Guarda como .xlsx (Excel 2007 o superior)

## 🎯 Ejemplo Completo:

Aquí un ejemplo completo de 5 funcionarios por 7 días:

| badge_number | Lun 17 Feb | Mar 18 Feb | Mié 19 Feb | Jue 20 Feb | Vie 21 Feb | Sáb 22 Feb | Dom 23 Feb |
|--------------|------------|------------|------------|------------|------------|------------|------------|
| 12345        | A          | A          | B          | B          | F          | D          | D          |
| 67890        | B          | B          | A          | A          | D          | F          | F          |
| 11111        | F          | D          | D          | F          | A          | A          | B          |
| 22222        | D          | F          | F          | D          | B          | B          | A          |
| 33333        | A          | B          | A          | B          | D          | F          | F          |

Este archivo cargaría 35 servicios (5 usuarios × 7 días).
