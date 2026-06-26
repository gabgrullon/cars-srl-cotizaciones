const TEMPLATE_ID = '1q6IzxeHWq_YpgPFooky6w-9NzWQjSpbYfMWyV4OwxNw';
const FOLDER_ID = '1L6N96Xu_ytmcoDgrUQQbG50mVB09qFSc';
const ITBIS_RATE = 0.18;
const MAX_ITEMS = 12;

// Firebase / Firestore
const FIREBASE_PROJECT_ID = 'cars-srl';
const FIRESTORE_DATABASE_ID = '(default)';
const CLIENTES_COLLECTION = 'Clientes';

function crearCotizacion(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    if (data && data.data) {
      data = data.data;
    }

    data = data || {};

    const props = PropertiesService.getScriptProperties();
    const esPrueba = data.prueba === true;

    let numero = esPrueba
      ? 'PRUEBA'
      : Number(props.getProperty('NEXT_QUOTE_NUMBER') || 7092);

    const cliente = String(data.cliente || 'Cliente').trim();
    const rnc = String(data.rnc || '').trim();
    const primerNombre = cliente.split(' ')[0] || 'Cliente';

    const nombreArchivo = esPrueba
      ? `PRUEBA-${primerNombre}`
      : `${numero}-${primerNombre}`;

    const folder = DriveApp.getFolderById(FOLDER_ID);
    const template = DriveApp.getFileById(TEMPLATE_ID);
    const copia = template.makeCopy(nombreArchivo, folder);

    const ss = SpreadsheetApp.openById(copia.getId());
    const sheet = ss.getSheetByName('Cotizacion') || ss.getSheets()[0];

    const items = Array.isArray(data.items)
      ? data.items.slice(0, MAX_ITEMS)
      : [];

    let subtotal = 0;
    const itemRows = [];

    for (let i = 0; i < MAX_ITEMS; i++) {
      const item = items[i];

      if (item) {
        const cantidad = Number(item.cantidad || 0);
        const descripcion = String(item.descripcion || '');
        const precio = Number(item.precio || 0);
        const totalLinea = cantidad * precio;

        subtotal += totalLinea;

        itemRows.push([
          cantidad,
          descripcion,
          precio,
          totalLinea
        ]);
      } else {
        itemRows.push(['', '', '', '']);
      }
    }

    const itbis = data.itbis ? subtotal * ITBIS_RATE : 0;
    const totalGeneral = subtotal + itbis;

    sheet.getRange('C9').setValue(numero);
    sheet.getRange('E9').setValue(data.fecha || '');
    sheet.getRange('C10').setValue(cliente);
    sheet.getRange('C11').setValue(rnc);
    sheet.getRange('C12').setValue(data.vehiculo || '');

    sheet.getRange('B14:E25').clearContent();
    sheet.getRange('B14:E25').setValues(itemRows);

    sheet.getRange('E26:E28').setValues([
      [subtotal],
      [itbis],
      [totalGeneral]
    ]);

    sheet.getRange('B29:C31').clearContent();

    if (data.observacion) {
      sheet.getRange('B29').setValue(data.observacion);
    }

    SpreadsheetApp.flush();

    if (!esPrueba) {
      props.setProperty(
        'NEXT_QUOTE_NUMBER',
        String(numero + 1)
      );
    }

    return {
      ok: true,
      prueba: esPrueba,
      numero,
      archivo: nombreArchivo,
      fileId: copia.getId(),
      url: copia.getUrl(),
      subtotal,
      itbis,
      totalGeneral
    };

  } finally {
    lock.releaseLock();
  }
}

function listarCotizaciones() {
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const files = folder.getFiles();

  const cotizaciones = [];

  while (files.hasNext()) {
    const file = files.next();

    if (file.getMimeType() !== MimeType.GOOGLE_SHEETS) {
      continue;
    }

    cotizaciones.push({
      archivo: file.getName(),
      name: file.getName(),
      fileId: file.getId(),
      url: file.getUrl(),
      fechaCreacion: Utilities.formatDate(
        file.getDateCreated(),
        Session.getScriptTimeZone(),
        'dd/MM/yyyy HH:mm'
      ),
      timestamp: file.getDateCreated().getTime()
    });
  }

  cotizaciones.sort(function(a, b) {
    return b.timestamp - a.timestamp;
  });

  return cotizaciones.slice(0, 20);
}

function exportarPdfTemporal(fileId) {
  const ss = SpreadsheetApp.openById(fileId);
  const sheet = ss.getSheetByName('Cotizacion') || ss.getSheets()[0];
  const gid = sheet.getSheetId();

  const url =
    `https://docs.google.com/spreadsheets/d/${fileId}/export` +
    `?format=pdf` +
    `&gid=${gid}` +
    `&size=letter` +
    `&portrait=true` +
    `&fitw=true` +
    `&scale=4` +
    `&horizontal_alignment=CENTER` +
    `&vertical_alignment=TOP` +
    `&top_margin=0.25` +
    `&bottom_margin=0.25` +
    `&left_margin=0.25` +
    `&right_margin=0.25` +
    `&sheetnames=false` +
    `&printtitle=false` +
    `&pagenumbers=false` +
    `&gridlines=false` +
    `&printnotes=false` +
    `&fzr=false`;

  const response = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(
      'No se pudo generar el PDF: ' +
      response.getContentText()
    );
  }

  return Utilities.base64Encode(
    response.getBlob().getBytes()
  );
}

function firestoreDocumentsUrl(collection) {
  return 'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(FIREBASE_PROJECT_ID) +
    '/databases/' +
    encodeURIComponent(FIRESTORE_DATABASE_ID) +
    '/documents/' +
    encodeURIComponent(collection);
}

function firestoreRequest(method, url, payload) {
  const options = {
    method: method,
    muteHttpExceptions: true,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json'
    }
  };

  if (payload !== undefined && payload !== null) {
    options.payload = JSON.stringify(payload);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText();
  const json = text ? JSON.parse(text) : {};

  if (code < 200 || code >= 300) {
    throw new Error('Firestore error ' + code + ': ' + text);
  }

  return json;
}

function toFirestoreValue(value) {
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (value === null || value === undefined) return { nullValue: null };
  return { stringValue: String(value) };
}

function toFirestoreDocument(data) {
  const fields = {};
  Object.keys(data).forEach(function(key) {
    fields[key] = toFirestoreValue(data[key]);
  });
  return { fields: fields };
}

function fromFirestoreValue(value) {
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return Number(value.doubleValue);
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.timestampValue !== undefined) return value.timestampValue;
  if (value.arrayValue !== undefined) {
    const values = value.arrayValue.values || [];
    return values.map(fromFirestoreValue);
  }
  return null;
}

function fromFirestoreDocument(doc) {
  const out = {
    id: String(doc.name || '').split('/').pop()
  };

  const fields = doc.fields || {};
  Object.keys(fields).forEach(function(key) {
    out[key] = fromFirestoreValue(fields[key]);
  });

  return out;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDigits(value) {
  return String(value || '').replace(/\D+/g, '');
}

function buildClientSearch(cliente) {
  const parts = [];
  const nombre = normalizeSearchText(cliente.nombre);
  const rnc = normalizeSearchText(cliente.rnc);
  const telefono = cleanDigits(cliente.telefono);
  const telefono2 = cleanDigits(cliente.telefono2);
  const email = normalizeSearchText(cliente.email);
  const contacto = normalizeSearchText(cliente.contacto);

  [nombre, rnc, telefono, telefono2, email, contacto].forEach(function(v) {
    if (v && parts.indexOf(v) === -1) parts.push(v);
  });

  nombre.split(' ').forEach(function(v) {
    if (v && parts.indexOf(v) === -1) parts.push(v);
  });

  return parts;
}

function guardarCliente(data) {
  data = data || {};

  const nombre = String(data.nombre || data.cliente || '').trim();
  if (!nombre) {
    throw new Error('Falta el nombre del cliente.');
  }

  const now = new Date();

  const cliente = {
    nombre: nombre,
    tipo: String(data.tipo || 'persona').trim(),
    rnc: String(data.rnc || '').trim(),
    telefono: cleanDigits(data.telefono || ''),
    telefono2: cleanDigits(data.telefono2 || ''),
    email: String(data.email || '').trim(),
    direccion: String(data.direccion || '').trim(),
    ciudad: String(data.ciudad || '').trim(),
    provincia: String(data.provincia || '').trim(),
    contacto: String(data.contacto || nombre).trim(),
    notas: String(data.notas || '').trim(),
    total_cotizaciones: Number(data.total_cotizaciones || 0),
    total_inspecciones: Number(data.total_inspecciones || 0),
    activo: true,
    created_at: now,
    updated_at: now
  };

  cliente.search = buildClientSearch(cliente);

  const url = firestoreDocumentsUrl(CLIENTES_COLLECTION);
  const result = firestoreRequest('post', url, toFirestoreDocument(cliente));

  return {
    ok: true,
    cliente: fromFirestoreDocument(result)
  };
}

function buscarClientes(q) {
  const query = normalizeSearchText(q || '');
  const url = firestoreDocumentsUrl(CLIENTES_COLLECTION) + '?pageSize=100';
  const result = firestoreRequest('get', url);
  const docs = result.documents || [];

  const clientes = docs
    .map(fromFirestoreDocument)
    .filter(function(cliente) {
      if (!query) return true;

      const searchable = normalizeSearchText([
        cliente.nombre,
        cliente.rnc,
        cliente.telefono,
        cliente.telefono2,
        cliente.email,
        cliente.contacto,
        cliente.ciudad,
        cliente.provincia,
        Array.isArray(cliente.search) ? cliente.search.join(' ') : ''
      ].join(' '));

      return searchable.indexOf(query) !== -1;
    })
    .slice(0, 20);

  return {
    ok: true,
    clientes: clientes
  };
}

function doPost(e) {
  try {
    let data = JSON.parse(e.postData.contents);

    if (data.action === 'guardar_cliente') {
      const resultadoCliente = guardarCliente(data);

      return ContentService
        .createTextOutput(JSON.stringify(resultadoCliente))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.data) {
      data = data.data;
    }

    const resultado = crearCotizacion(data);

    return ContentService
      .createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {

    if (e.parameter.action === 'listar') {
      const cotizaciones = listarCotizaciones();

      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          cotizaciones
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e.parameter.action === 'buscar_clientes') {
      const resultadoClientes = buscarClientes(e.parameter.q || '');

      return ContentService
        .createTextOutput(JSON.stringify(resultadoClientes))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (e.parameter.action === 'pdf') {

      const fileId = e.parameter.fileId;
      const archivo = e.parameter.archivo || 'cotizacion-cars';

      if (!fileId) {
        throw new Error('Falta fileId');
      }

      const pdfBase64 = exportarPdfTemporal(fileId);

      return ContentService
        .createTextOutput(JSON.stringify({
          ok: true,
          archivo,
          pdfBase64
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService
      .createTextOutput(
        'CARS Cotizaciones Web App activo'
      )
      .setMimeType(ContentService.MimeType.TEXT);

  } catch (error) {

    return ContentService
      .createTextOutput(JSON.stringify({
        ok: false,
        error: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function autorizarPermisos() {
  UrlFetchApp.fetch('https://www.google.com');
  buscarClientes('');
}
