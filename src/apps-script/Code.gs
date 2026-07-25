/***************************************************************
 * SCRAPEO DE DATOS - Manualito en Daruma
 * Script de Google Apps Script para inventariar manuales de funciones
 * Desplegado: Abril 2026
 ***************************************************************/

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // Reemplazar con tu Spreadsheet ID
const SHEET_NAME = 'Informe';

const BATCH_SIZE = 40;
const CONCURRENCY = 5;

const HEADERS_FICHA = [
  "Index", "codigo_ficha", "Decreto vigente", "Página", "Funciones susceptibles de Teletrabajo",
  "Nivel", "Denominación del Empleo", "Código", "Grado",
  "Naturaleza del cargo", "No. de cargos en planta de esta denominación",
  "Dependencia", "Cargo del Jefe Inmediato", "AREA FUNCIONAL", "PROCESO",
  "PROPOSITO PRINCIPAL", "FUNCIONES", "CONOCIMIENTOS BASICOS",
  "Comunes", "Por Nivel Jerárquico", "Formación Académica", "Experiencia",
  "Alt. Formación Académica", "Alt. Experiencia", "URL",
  "Area (Hoja Datos)", "Proceso (Hoja Datos)", "Fecha Modificación (Sistema)"
];

/***************************************************************
 * 1. ORQUESTADORES
 ***************************************************************/

function ejecutarProcesoAutomatico() {
  Logger.log("🚀 INICIANDO ACTUALIZACIÓN INCREMENTAL...");
  ejecutarCore(false);
}

function ejecutarProcesoForzado() {
  Logger.log("🔥 INICIANDO PROCESAMIENTO COMPLETO (FORZADO)...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(SHEET_NAME);
  if (hoja) {
    hoja.clear();
  }
  ejecutarCore(true);
}

function ejecutarCore(esForzado) {
  try {
    UpdateJson();
    eliminarTriggersPrevios();
    iniciarProcesamientoFichas(esForzado);
  } catch (error) {
    Logger.log(`❌ ERROR CRÍTICO: ${error.message}`);
  }
}

/***************************************************************
 * 2. MÓDULO API (Sincronización Hoja Datos)
 * Sincroniza con la API de SIG Cali para obtener el inventario
 * completo de manuales de funciones.
 ***************************************************************/

function UpdateJson() {
  const url = 'https://sig.cali.gov.co/api.php/staff/v2/QueryManualFunciones?oauth_token=YOUR_TOKEN';
  const libro = SpreadsheetApp.getActiveSpreadsheet();
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  
  if (response.getResponseCode() === 200) {
    const jsonData = JSON.parse(response.getContentText());
    const data = jsonData.data;
    
    if (!data || data.length === 0) throw new Error("La API no devolvió datos.");

    const headers = Object.keys(data[0]);
    const sheetData = [headers];
    data.forEach(item => { sheetData.push(headers.map(h => item[h])); });
    
    const hoja = libro.getSheetByName('Datos') || libro.insertSheet('Datos');
    hoja.clear();
    hoja.getRange(1, 1, sheetData.length, sheetData[0].length).setValues(sheetData);
    Logger.log("✅ Hoja 'Datos' sincronizada.");
  }
}

/***************************************************************
 * 3. PROCESAMIENTO
 * Procesa las fichas en lotes concurrentes para extraer datos
 * que no están en la API (decreto vigente, nivel, etc.) haciendo
 * web scraping del HTML de cada ficha en Daruma.
 ***************************************************************/

function iniciarProcesamientoFichas(esForzado) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaDatos = ss.getSheetByName("Datos");
  let hojaInf = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  
  if (hojaInf.getLastRow() === 0) {
    hojaInf.appendRow(HEADERS_FICHA);
    hojaInf.getRange(1, 1, 1, HEADERS_FICHA.length).setFontWeight("bold");
  }

  const valuesAPI = hojaDatos.getDataRange().getValues();
  const headersAPI = valuesAPI[0].map(h => normalizeText(h));
  
  const idxCol = headersAPI.indexOf(normalizeText("index"));
  const idxCodigoFicha = headersAPI.indexOf(normalizeText("codigo_ficha"));
  const idxFecha = headersAPI.indexOf(normalizeText("fecha_de_modificacion"));
  const idxArea = headersAPI.indexOf(normalizeText("Area"));
  const idxProc = headersAPI.indexOf(normalizeText("Proceso"));

  const dataInforme = hojaInf.getDataRange().getValues();
  const mapaInforme = {};
  const colFechaInfIdx = HEADERS_FICHA.indexOf("Fecha Modificación (Sistema)");

  for (let i = 1; i < dataInforme.length; i++) {
    const indexStr = String(dataInforme[i][0]);
    const fechaStr = String(dataInforme[i][colFechaInfIdx]);
    mapaInforme[indexStr] = { fecha: fechaStr, fila: i + 1 };
  }

  const mapaExtras = {};
  const indicesATrabajar = [];

  for (let i = 1; i < valuesAPI.length; i++) {
    const id = String(valuesAPI[i][idxCol]);
    const fechaAPI = String(valuesAPI[i][idxFecha] || "");
    const regExistente = mapaInforme[id];

    if (esForzado || !regExistente || regExistente.fecha !== fechaAPI) {
      indicesATrabajar.push(id);
      mapaExtras[id] = {
        codigo_ficha: idxCodigoFicha > -1 ? valuesAPI[i][idxCodigoFicha] : "N/A",
        area: idxArea > -1 ? valuesAPI[i][idxArea] : "",
        proceso: idxProc > -1 ? valuesAPI[i][idxProc] : "",
        fecha: fechaAPI,
        numFila: regExistente ? regExistente.fila : null
      };
    }
  }

  if (indicesATrabajar.length === 0) {
    Logger.log("☕ Todo actualizado.");
    return;
  }

  const cache = CacheService.getScriptCache();
  cache.put("INDICES_DATA", JSON.stringify(indicesATrabajar), 21600);
  cache.put("MAPA_EXTRAS", JSON.stringify(mapaExtras), 21600);

  const props = PropertiesService.getScriptProperties();
  props.setProperty("PROG_POS", "0");
  props.setProperty("PROG_TOTAL", indicesATrabajar.length.toString());

  procesarLoteFichasRapido();
}

function procesarLoteFichasRapido() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hojaOrg = ss.getSheetByName(SHEET_NAME);
  const props = PropertiesService.getScriptProperties();
  const cache = CacheService.getScriptCache();

  const total = parseInt(props.getProperty("PROG_TOTAL") || "0");
  const start = parseInt(props.getProperty("PROG_POS") || "0");
  const rawIndices = cache.get("INDICES_DATA");
  const rawExtras = cache.get("MAPA_EXTRAS");

  if (!rawIndices || !rawExtras) {
    Logger.log("⚠️ Cache expirado o vacío.");
    return;
  }

  const indices = JSON.parse(rawIndices);
  const mapaExtras = JSON.parse(rawExtras);
  const end = Math.min(start + BATCH_SIZE, total);

  for (let i = start; i < end; i += CONCURRENCY) {
    const chunkEnd = Math.min(i + CONCURRENCY, end);
    const solicitudes = [];
    const indicesChunk = [];

    for (let j = i; j < chunkEnd; j++) {
      const id = indices[j];
      indicesChunk.push(id);
      solicitudes.push({
        url: `https://sig.cali.gov.co/app.php/staff/document/viewPublic?index=${id}`,
        muteHttpExceptions: true
      });
    }

    const respuestas = fetchAllWithRetry(solicitudes);

    respuestas.forEach((res, k) => {
      const idx = indicesChunk[k];
      const infoExtra = mapaExtras[idx];
      let filaResult;

      if (res && res.getResponseCode() === 200) {
        filaResult = extraerFilaDesdeContenido(idx, res.getContentText(), solicitudes[k].url, infoExtra);
      } else {
        filaResult = construirFilaError(idx, `HTTP ${res ? res.getResponseCode() : 'Timeout'}`, infoExtra);
      }

      if (infoExtra.numFila) {
        hojaOrg.getRange(infoExtra.numFila, 1, 1, HEADERS_FICHA.length).setValues([filaResult]);
      } else {
        hojaOrg.appendRow(filaResult);
        infoExtra.numFila = hojaOrg.getLastRow();
      }
    });
    
    Utilities.sleep(1500);
  }

  props.setProperty("PROG_POS", end.toString());
  if (end < total) {
    ScriptApp.newTrigger("procesarLoteFichasRapido").timeBased().after(3000).create();
  } else {
    eliminarTriggersPrevios();
    Logger.log("🏁 Actualización finalizada.");
  }
}

function fetchAllWithRetry(solicitudes, maxRetries = 3) {
  let intentos = 0;
  while (intentos < maxRetries) {
    try {
      const resps = UrlFetchApp.fetchAll(solicitudes);
      const hayErroresServidor = resps.some(r => r.getResponseCode() === 504 || r.getResponseCode() === 502);
      if (!hayErroresServidor) return resps;
      intentos++;
      Utilities.sleep(4000 * intentos);
    } catch (e) {
      intentos++;
      Utilities.sleep(3000);
      if (intentos === maxRetries) return solicitudes.map(() => null);
    }
  }
  return UrlFetchApp.fetchAll(solicitudes);
}

/***************************************************************
 * 4. PARSING Y HELPERS
 * Parser HTML para extraer campos que no vienen en la API
 * de SIG Cali (decreto vigente, nivel, área funcional, etc.)
 ***************************************************************/

function normalizeText(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function extraerFilaDesdeContenido(index, contenido, url, extras) {
  const textoPlano = contenido.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g," ").replace(/\s+/g," ").trim();
  const lineas = contenido.replace(/<[^>]+>/g, "\n").split(/\n+/).map(l => l.trim()).filter(l => l);

  const camposRegex = {
    "Decreto vigente": /Decreto vigente:\s*(.*?)\s*Página:/is,
    "Página": /Página:\s*(.*?)\s*Funciones/i,
    "Funciones susceptibles de Teletrabajo": /Funciones susceptibles de Teletrabajo:\s*([A-ZÁÉÍÓÚÑ]+)/i,
    "Nivel": /Nivel:\s*([A-ZÁÉÍÓÚÑ]+)/i,
    "Denominación del Empleo": /Denominación del Empleo:\s*(.*?)\s*Código:/is,
    "Código": /Código:\s*(\d+)/i,
    "Grado": /Grado:\s*(\d+)/i,
    "Naturaleza del cargo": /Naturaleza del cargo:\s*(.*?)\s*No\./is,
    "No. de cargos en planta de esta denominación": /No\. de cargos.*?:\s*(.*?)\s*Dependencia:/is,
    "Dependencia": /Dependencia:\s*(.*?)\s*Cargo del Jefe Inmediato:/is,
    "Cargo del Jefe Inmediato": /Cargo del Jefe Inmediato:\s*(.*?)\s*ii\./is,
    "PROPOSITO PRINCIPAL": /Propósito principal:\s*(.*?)\s*iv\./is,
    "FUNCIONES": /Descripción de funciones esenciales:\s*(.*?)\s*v\./is,
    "CONOCIMIENTOS BASICOS": /Conocimientos básicos.*?:\s*(.*?)\s*vi\./is
  };

  let areaHTML = "", procHTML = "";
  for (let i = 0; i < lineas.length; i++) {
    if (/^\s*ii\.\s*[áa]rea\s*funcional\s*:?\s*$/i.test(lineas[i])) {
      areaHTML = lineas[i+1] || "";
      for(let j=i+2; j < i+10 && j < lineas.length; j++){
        if(!/^\s*iii\./i.test(lineas[j])) { procHTML = lineas[j]; break; }
      }
      break;
    }
  }

  const helperTabla = (k1, k2) => {
    let r1="", r2="";
    const idx = contenido.toLowerCase().indexOf(k1.toLowerCase());
    if (idx>=0) {
      const trs = contenido.substring(idx, idx+15000).match(/<tr[\s\S]*?<\/tr>/gi);
      if(trs) {
        for(let t=0; t<trs.length-1; t++){
          if(trs[t].toLowerCase().includes(k1.toLowerCase()) && trs[t].toLowerCase().includes(k2.toLowerCase())){
            const d = trs[t+1].match(/<t[dh][\s\S]*?<\/t[dh]>/gi);
            if(d&&d.length>=2){
              r1=d[0].replace(/<[^>]+>/g," ").trim();
              r2=d[1].replace(/<[^>]+>/g," ").trim();
            }
            break;
          }
        }
      }
    }
    return [r1, r2];
  };

  const [comunes, porNivel] = helperTabla("Comunes", "Por Nivel");
  const [formacion, experiencia] = helperTabla("Formación Académica", "Experiencia");
  const [altF, altE] = helperTabla("Alternativas de formación", "Alternativas de experiencia");

  return HEADERS_FICHA.map(c => {
    if (c === "Index") return index;
    if (c === "codigo_ficha") return extras.codigo_ficha;
    if (c === "URL") return url;
    if (c === "AREA FUNCIONAL") return areaHTML;
    if (c === "PROCESO") return procHTML;
    if (c === "Area (Hoja Datos)") return extras.area;
    if (c === "Proceso (Hoja Datos)") return extras.proceso;
    if (c === "Fecha Modificación (Sistema)") return extras.fecha;
    if (c === "Comunes") return comunes;
    if (c === "Por Nivel Jerárquico") return porNivel;
    if (c === "Formación Académica") return formacion;
    if (c === "Experiencia") return experiencia;
    if (c === "Alt. Formación Académica") return altF;
    if (c === "Alt. Experiencia") return altE;
    
    const m = textoPlano.match(camposRegex[c]);
    return (m && m[1]) ? m[1].trim() : "";
  });
}

function construirFilaError(index, msg, extras) {
  const f = Array(HEADERS_FICHA.length).fill("");
  f[0] = index;
  f[HEADERS_FICHA.indexOf("codigo_ficha")] = extras.codigo_ficha || "ERROR";
  f[HEADERS_FICHA.indexOf("Fecha Modificación (Sistema)")] = extras.fecha || "";
  f[HEADERS_FICHA.indexOf("URL")] = "ERROR: " + msg;
  return f;
}

function eliminarTriggersPrevios() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "procesarLoteFichasRapido") ScriptApp.deleteTrigger(t);
  });
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('⚙️ SIG CALI')
    .addItem('🔄 Actualización Diaria (Incremental)', 'ejecutarProcesoAutomatico')
    .addItem('🔥 Refrescar TODO (Forzado)', 'ejecutarProcesoForzado')
    .addToUi();
}

/***************************************************************
 * 5. WEB APP (Frontend)
 * Sirve la interfaz HTML que se despliega como Web App
 ***************************************************************/

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Manualito en Daruma')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getCachedData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet || sheet.getLastRow() < 2) return [];
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return {
      ficha: obj['Index'],
      nivel: obj['Nivel'],
      denominacion: obj['Denominación del Empleo'],
      codigo: obj['Código'],
      grado: obj['Grado'],
      naturaleza: obj['Naturaleza del cargo'],
      proposito: obj['PROPOSITO PRINCIPAL'],
      area: obj['AREA FUNCIONAL'],
      decreto: obj['Decreto vigente'],
      url: obj['URL']
    };
  });
}

function getServiceUrl() {
  return ScriptApp.getServiceUrl();
}
