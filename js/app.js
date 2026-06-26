
const API_URL = 'api.php';
const PIN = '';

let selectedClienteId = '';
let clientSearchTimer = null;

let preparedPdfFile = null;
let preparedPdfMessage = '';
let preparedPdfQuoteKey = '';

function money(n){ return 'RD$' + Number(n || 0).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2}); }
function todayDMY(){ const d = new Date(); return String(d.getDate()).padStart(2,'0') + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + d.getFullYear(); }
function escapeHtml(str){ return String(str).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function titleCase(str){
  const excepciones = ['de','del','la','las','los','y','para','con'];

  return str
    .toLowerCase()
    .split(' ')
    .map(word => {
      if (!word) return word;
      if (excepciones.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .replace(/\bchevy\b/gi, 'Chevrolet')
    .replace(/\b6l80\b/gi, '6L80')
    .replace(/\bdexron\b/gi, 'Dexron');
}

function addItem(qty='', desc='', price=''){
  const wrap = document.getElementById('items');
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<input class="qty" type="number" step="0.01" placeholder="Cant." value="${qty}">
    <input class="desc" placeholder="Descripción" value="${escapeHtml(desc)}">
    <div class="moneyWrap"><span class="moneyPrefix">RD$</span><input class="price" type="number" step="0.01" placeholder="Unitario" value="${price}"></div>
    <input class="line-total" type="text" placeholder="Total" value="${money(Number(qty || 0) * Number(price || 0))}" readonly tabindex="-1">
    <button class="danger" onclick="this.parentElement.remove(); calc()" title="Eliminar" aria-label="Eliminar artículo">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M6 7h12M10 11v6M14 11v6M9 7l1-2h4l1 2M8 7l1 13h6l1-13" />
      </svg>
    </button>`;
  wrap.appendChild(row);
  row.querySelectorAll('input').forEach(i => i.addEventListener('input', calc));
  calc();
}

function getItems(){
  return [...document.querySelectorAll('#items .row')].map(r => ({
    cantidad: Number(r.querySelector('.qty').value || 0),
    descripcion: r.querySelector('.desc').value.trim(),
    precio: Number(r.querySelector('.price').value || 0)
  })).filter(i => i.descripcion && i.cantidad > 0);
}

function calc(){
  document.querySelectorAll('#items .row').forEach(r => {
    const qty = Number(r.querySelector('.qty').value || 0);
    const price = Number(r.querySelector('.price').value || 0);
    const totalInput = r.querySelector('.line-total');
    if (totalInput) totalInput.value = money(qty * price);
  });

  const subtotal = getItems().reduce((s,i) => s + i.cantidad * i.precio, 0);
  const itbis = document.getElementById('itbis').value === 'true' ? subtotal * 0.18 : 0;
  document.getElementById('subtotal').textContent = money(subtotal);
  document.getElementById('itbisMonto').textContent = money(itbis);
  document.getElementById('total').textContent = money(subtotal + itbis);
}

document.getElementById('itbis').addEventListener('change', calc);

function getClientField(cliente, keys, fallback=''){
  for (const key of keys) {
    if (cliente && cliente[key] !== undefined && cliente[key] !== null && String(cliente[key]).trim() !== '') {
      return String(cliente[key]).trim();
    }
  }
  return fallback;
}

function setClientStatus(message, type=''){
  const el = document.getElementById('clienteStatus');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = type === 'error' ? '#991b1b' : type === 'ok' ? '#166534' : '#6b7280';
}

function closeClientResults(){
  const box = document.getElementById('clienteResultados');
  if (!box) return;
  box.classList.remove('is-open');
  box.innerHTML = '';
}

function renderClientResults(clientes){
  const box = document.getElementById('clienteResultados');
  if (!box) return;

  box.innerHTML = '';

  if (!clientes.length) {
    closeClientResults();
    setClientStatus('No encontré ese cliente. Puedes llenarlo y guardarlo.');
    return;
  }

  clientes.forEach(cliente => {
    const nombre = getClientField(cliente, ['nombre', 'Cliente', 'cliente'], 'Cliente sin nombre');
    const rnc = getClientField(cliente, ['rnc', 'rnc_cedula', 'RNC', 'Cedula', 'Cédula']);
    const telefono = getClientField(cliente, ['telefono', 'Telefono', 'teléfono', 'Teléfono']);
    const ciudad = getClientField(cliente, ['ciudad', 'Ciudad']);
    const provincia = getClientField(cliente, ['provincia', 'Provincia']);

    const item = document.createElement('div');
    item.className = 'client-result-item';

    const title = document.createElement('div');
    title.className = 'client-result-title';
    title.textContent = nombre;

    const sub = document.createElement('div');
    sub.className = 'client-result-sub';
    sub.textContent = [telefono, rnc, ciudad || provincia].filter(Boolean).join(' · ');

    item.appendChild(title);
    item.appendChild(sub);
    item.addEventListener('click', () => selectClient(cliente));

    box.appendChild(item);
  });

  box.classList.add('is-open');
  setClientStatus(`${clientes.length} resultado(s). Toca uno para autocompletar.`);
}

async function searchClients(){
  const input = document.getElementById('clienteBuscar');
  const q = input ? input.value.trim() : '';

  selectedClienteId = '';

  if (q.length < 2) {
    closeClientResults();
    setClientStatus('');
    return;
  }

  setClientStatus('Buscando cliente...');

  try {
    const response = await fetch(`${API_URL}?action=buscar_clientes&q=${encodeURIComponent(q)}`, {
      method: 'GET',
      cache: 'no-store'
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error || 'No se pudo buscar clientes.');
    }

    renderClientResults(Array.isArray(result.clientes) ? result.clientes : []);

  } catch (error) {
    console.error(error);
    closeClientResults();
    setClientStatus(error.message, 'error');
  }
}

function selectClient(cliente){
  selectedClienteId = cliente.id || '';

  const nombre = getClientField(cliente, ['nombre', 'Cliente', 'cliente']);
  const rnc = getClientField(cliente, ['rnc', 'rnc_cedula', 'RNC', 'Cedula', 'Cédula']);

  document.getElementById('cliente').value = nombre;
  document.getElementById('rnc').value = rnc;

  const buscar = document.getElementById('clienteBuscar');
  if (buscar) buscar.value = nombre;

  closeClientResults();
  setClientStatus('Cliente seleccionado.', 'ok');
}

function buildClientPayloadFromForm(){
  const nombre = document.getElementById('cliente').value.trim();
  const rnc = document.getElementById('rnc').value.trim();
  const buscar = document.getElementById('clienteBuscar').value.trim();

  return {
    action: 'guardar_cliente',
    nombre: nombre || buscar,
    rnc: rnc,
    tipo: rnc ? 'empresa' : 'persona',
    telefono: '',
    telefono2: '',
    email: '',
    direccion: '',
    ciudad: '',
    provincia: '',
    contacto: nombre || buscar,
    notas: 'Creado desde cotizaciones web'
  };
}

async function saveClientFromForm(){
  const data = buildClientPayloadFromForm();

  if (!data.nombre) {
    alert('Escribe el nombre del cliente antes de guardarlo.');
    return null;
  }

  setClientStatus('Guardando cliente...');

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error || 'No se pudo guardar el cliente.');
    }

    const cliente = result.cliente || {};
    selectedClienteId = cliente.id || '';
    document.getElementById('cliente').value = getClientField(cliente, ['nombre', 'Cliente', 'cliente'], data.nombre);
    document.getElementById('rnc').value = getClientField(cliente, ['rnc', 'rnc_cedula', 'RNC'], data.rnc);
    document.getElementById('clienteBuscar').value = document.getElementById('cliente').value;

    closeClientResults();
    setClientStatus('Cliente guardado en Firebase.', 'ok');
    return cliente;

  } catch (error) {
    console.error(error);
    setClientStatus(error.message, 'error');
    alert('No se pudo guardar el cliente: ' + error.message);
    return null;
  }
}

function setupClientSearch(){
  const input = document.getElementById('clienteBuscar');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(clientSearchTimer);
    clientSearchTimer = setTimeout(searchClients, 300);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) searchClients();
  });

  document.addEventListener('click', event => {
    const wrap = document.querySelector('.client-search-wrap');
    if (wrap && !wrap.contains(event.target)) closeClientResults();
  });
}

function clearAll(){
  selectedClienteId = '';
  document.getElementById('dictado').value = '';
  document.getElementById('clienteBuscar').value = '';
  closeClientResults();
  setClientStatus('');
  document.getElementById('cliente').value = '';
  document.getElementById('rnc').value = '';
  document.getElementById('vehiculo').value = '';
  document.getElementById('fecha').value = todayDMY();
  document.getElementById('itbis').value = 'false';
  document.getElementById('prueba').value = 'false';
  document.getElementById('observacion').value = '';
  document.getElementById('items').innerHTML = '';
  document.getElementById('result').innerHTML = '';
  addItem();
  calc();
}

function showReviewSections(){
  ['infoCard','itemsCard','totalsCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('is-hidden');
  });
}

function hideReviewSections(){
  ['infoCard','itemsCard','totalsCard'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('is-hidden');
  });
}

function showVoiceStatus(message){
  const el = document.getElementById('voiceStatus');
  if (el) el.textContent = message;
}

document.addEventListener('DOMContentLoaded', () => {
  setupClientSearch();

  const floatingMicBtn = document.getElementById('floating-mic-btn');
  const targetInput = document.getElementById('dictado');

  if (!floatingMicBtn || !targetInput) return;

  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.lang = 'es-DO';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = function() {
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }

      floatingMicBtn.classList.add('listening');
      targetInput.style.boxShadow = '0 0 0 3px rgba(239,68,68,.25)';
      showVoiceStatus('Escuchando...');
    };

    recognition.onend = function() {
      floatingMicBtn.classList.remove('listening');
      targetInput.style.boxShadow = '';
      showVoiceStatus('Micrófono listo.');
    };

    recognition.onresult = function(event) {
      let transcript = event.results[0][0].transcript.trim();

      if (transcript.length > 0) {
        transcript = transcript.charAt(0).toUpperCase() + transcript.slice(1);

        const currentText = targetInput.value.trim();
        let separator = currentText ? ' ' : '';

        targetInput.value = currentText + separator + transcript;
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        showVoiceStatus('Texto agregado. Puedes dictar otra parte o procesar.');
      }
    };

    recognition.onerror = function(event) {
      floatingMicBtn.classList.remove('listening');
      targetInput.style.boxShadow = '';

      if (event.error === 'not-allowed') {
        showVoiceStatus('Permiso de micrófono denegado.');
        alert('Permiso de micrófono denegado.');
      } else if (event.error === 'no-speech') {
        showVoiceStatus('No se detectó voz. Intenta de nuevo.');
      } else {
        showVoiceStatus('No se pudo escuchar. Intenta de nuevo.');
      }
    };

    floatingMicBtn.addEventListener('pointerdown', function(event) {
      // Evita que el navegador enfoque elementos y abra el teclado.
      event.preventDefault();
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }
    });

    floatingMicBtn.addEventListener('click', function(event) {
      event.preventDefault();

      // Si había un campo activo, cerramos el teclado antes de activar el micrófono.
      if (document.activeElement && document.activeElement !== document.body) {
        document.activeElement.blur();
      }

      try {
        recognition.start();
      } catch (e) {
        try { recognition.stop(); } catch(err) {}
      }
    });
  } else {
    floatingMicBtn.style.display = 'none';
    showVoiceStatus('Este navegador no soporta reconocimiento de voz.');
  }
});

function normalizeText(s){
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll(',', ' , ').replaceAll('.', ' . ').replace(/\s+/g,' ').trim();
}

function insertCommand(cmd){
  const box = document.getElementById('dictado');
  const current = box.value;
  const prefix = current.trim() ? '\n' : '';
  box.value = current + prefix + cmd;

  // No enfocamos el campo automáticamente para evitar que se abra el teclado en móvil.
  // El teclado solo se abrirá cuando el usuario toque manualmente dentro del campo.
  if (document.activeElement && document.activeElement !== document.body) {
    document.activeElement.blur();
  }
}

function parseDateSmart(value){
  value = String(value || '').trim();
  if (!value) return '';

  // Ya viene como DD/MM/YYYY
  const direct = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (direct) {
    return `${direct[1].padStart(2,'0')}/${direct[2].padStart(2,'0')}/${direct[3]}`;
  }

  const t = normalizeText(value);
  const fechaMatch = t.match(/(\d{1,2})\s+de\s+([a-z]+)\s+(?:de\s+)?(\d{4})/);
  if (fechaMatch) {
    const meses = {enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
    return `${fechaMatch[1].padStart(2,'0')}/${String(meses[fechaMatch[2]] || 1).padStart(2,'0')}/${fechaMatch[3]}`;
  }

  return value;
}

function numberWordToNumber(word){
  const nums = {
    un:1, una:1, uno:1,
    dos:2, tres:3, cuatro:4, cinco:5,
    seis:6, siete:7, ocho:8, nueve:9, diez:10,
    once:11, doce:12, trece:13, catorce:14, quince:15,
    dieciseis:16, dieciséis:16, diecisiete:17, dieciocho:18, diecinueve:19,
    veinte:20
  };

  const key = normalizeText(String(word || ''));
  return nums[key] || null;
}

function parseItemLine(text){
  let p = String(text || '').trim();
  p = p.replace(/[.;]+$/g, '').trim();

  p = p.replace(/^(articulo|artículo|item|pieza|servicio)\s*[:：]?\s*/i, '').trim();

  const qtyPattern = '(?:\\d+(?:[.,]\\d+)?|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|trece|catorce|quince|dieciseis|dieciséis|diecisiete|dieciocho|diecinueve|veinte)';

  let match = p.match(new RegExp('^(' + qtyPattern + ')\\s+(.+?)\\s+(?:a|en|por|precio de|costo de|con costo de)\\s*(?:RD\\$|RD|\\$)?\\s*([\\d,.]+)\\s*(?:pesos)?$', 'i'));

  if (!match) {
    const m = p.match(/^(.*?)\s+(?:a|en|por|precio de|costo de|con costo de)\s*(?:RD\$|RD|\$)?\s*([\d,.]+)\s*(?:pesos)?$/i);
    if (m) match = [m[0], null, m[1], m[2]];
  }

  if (!match) {
    match = p.match(new RegExp('^(' + qtyPattern + ')\\s+(.+?)\\s+(?:RD\\$|RD|\\$)?\\s*([\\d,.]+)\\s*(?:pesos)?$', 'i'));
  }

  if (!match) {
    const m = p.match(/^(.*?)\s+(?:RD\$|RD|\$)?\s*([\d,.]+)\s*(?:pesos)?$/i);
    if (m) match = [m[0], null, m[1], m[2]];
  }

  if (match) {
    let qty = 1;

    if (match[1]) {
      const wordQty = numberWordToNumber(match[1]);
      qty = wordQty || Number(String(match[1]).replace(',', '.'));
    }

    const desc = titleCase(String(match[2] || '').trim());
    const price = Number(String(match[3] || '').replace(/,/g, ''));

    if (desc && qty && qty > 0) {
      return { cantidad: qty, descripcion: desc, precio: price > 0 ? price : 0 };
    }
  }

  // Respaldo: si el artículo existe pero el precio no se entendió, no lo dejamos fuera.
  const qtyOnly = p.match(new RegExp('^(' + qtyPattern + ')\\s+(.+)$', 'i'));
  if (qtyOnly) {
    const wordQty = numberWordToNumber(qtyOnly[1]);
    const qty = wordQty || Number(String(qtyOnly[1]).replace(',', '.'));
    const desc = titleCase(String(qtyOnly[2] || '').trim());

    if (desc && qty && qty > 0) {
      return { cantidad: qty, descripcion: desc, precio: 0 };
    }
  }

  if (p) {
    return { cantidad: 1, descripcion: titleCase(p), precio: 0 };
  }

  return null;
}


function splitItemSegments(text){
  const rawText = String(text || '').trim();
  if (!rawText) return [];

  const markerRegex = /\b(?:art[ií]culos?|items?|piezas?|servicios?)\b\s*[:：]?\s*/gi;
  const matches = [...rawText.matchAll(markerRegex)];

  if (matches.length > 0) {
    const segments = [];

    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index + matches[i][0].length;
      const end = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
      const segment = rawText.slice(start, end).trim();
      if (segment) segments.push(segment);
    }

    return segments;
  }

  return rawText
    .replace(/\bpesos\b/gi, 'pesos,')
    .split(/\n+|,(?!\d)/)
    .map(x => x.trim())
    .filter(Boolean);
}

function extractStructuredBlocks(raw){
  const text = String(raw || '').trim();
  const headingRegex = /\b(Cliente|Nombre|A nombre de|RNC|Cedula|Cédula|Vehículo|Vehiculo|Vehicle|Carro|Camioneta|Fecha|ITBIS|Itebis|Itervis|Impuesto|Observación|Observacion|Nota|Notas|Artículo|Articulo|Item|Pieza|Servicio)\s*[:：]\s*/gi;
  const matches = [...text.matchAll(headingRegex)];

  if (matches.length === 0) return [];

  const blocks = [];

  for (let i = 0; i < matches.length; i++) {
    const key = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const value = text.slice(start, end).trim();
    blocks.push({ key, value });
  }

  return blocks;
}

function parseDictation(){
  const raw = document.getElementById('dictado').value.trim();
  if (!raw) return;

  const blocks = extractStructuredBlocks(raw);
  let structuredFound = blocks.length > 0;
  let parsedItems = [];

  if (structuredFound) {
    blocks.forEach(block => {
      const key = normalizeText(block.key);
      const value = String(block.value || '').trim();

      if (/^(cliente|nombre|a nombre de)$/.test(key)) {
        document.getElementById('cliente').value = value;
      } else if (/^(rnc|cedula)$/.test(key)) {
        document.getElementById('rnc').value = value;
      } else if (/^(vehiculo|vehicle|carro|camioneta)$/.test(key)) {
        document.getElementById('vehiculo').value = titleCase(value.replace(/\bchevy\b/i, 'Chevrolet'));
      } else if (/^(fecha)$/.test(key)) {
        document.getElementById('fecha').value = parseDateSmart(value);
      } else if (/^(itbis|itebis|itervis|impuesto)$/.test(key)) {
        const v = normalizeText(value);
        document.getElementById('itbis').value = /(si|sí|con|incluye|lleva|true)/i.test(v) && !/(no|sin)/i.test(v) ? 'true' : 'false';
      } else if (/^(observacion|nota|notas)$/.test(key)) {
        const obs = document.getElementById('observacion');
        obs.value = obs.value ? obs.value + '\n' + value : value;
      } else if (/^(articulo|item|pieza|servicio)$/.test(key)) {
        const item = parseItemLine(value);
        if (item) parsedItems.push(item);
      }
    });
  }

  if (parsedItems.length > 0) {
    document.getElementById('items').innerHTML = '';
    parsedItems.forEach(i => addItem(i.cantidad, i.descripcion, i.precio));
  }

  if (!structuredFound) {
    const t = normalizeText(raw);

    const noItbis = /(sin itbis|no incluye itbis|no lleva itbis|sin itervis|no incluye itervis|no lleva itervis)/.test(t);
    const yesItbis = /(con itbis|lleva itbis|incluye itbis|con itervis|lleva itervis|incluye itervis)/.test(t);
    document.getElementById('itbis').value = yesItbis && !noItbis ? 'true' : 'false';

    let m = raw.match(/(?:a nombre de|cliente|para)\s+([^,\.]+)/i);
    if (m) document.getElementById('cliente').value = m[1].trim();

    const rncMatch = raw.match(/(?:rnc|c[eé]dula)\s*:?\s*([0-9\-\s]{5,20})/i);
    if (rncMatch) document.getElementById('rnc').value = rncMatch[1].trim();

    const veh = raw.match(/((?:ford|chevrolet|chevy|toyota|honda|hyundai|kia|nissan|mazda|bmw|mercedes|jeep|ram|gmc)[^,\.]*(?:20\d{2}|19\d{2})[^,\.]*)/i);
    if (veh) document.getElementById('vehiculo').value = titleCase(veh[1].trim().replace(/^camioneta\s+/i,''));

    const obs = raw.match(/observaci[oó]n\s*:?\s*(.+?)(?:art[ií]culos|items|$)/i);
    if (obs) document.getElementById('observacion').value = obs[1].trim();

    if (/\b(?:art[ií]culos?|items?|piezas?|servicios?)\b/i.test(raw)) {
      document.getElementById('items').innerHTML = '';

      const parts = splitItemSegments(raw);

      parts.forEach(p => {
        const item = parseItemLine(p);
        if (item) addItem(item.cantidad, item.descripcion, item.precio);
      });

      if (getItems().length === 0) addItem();
    }
  }

  showReviewSections();
  calc();
}



function base64ToBlob(base64, mimeType){
  const byteCharacters = atob(base64);
  const byteArrays = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mimeType });
}

function cleanFileName(name){
  return String(name || 'cotizacion-cars')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim() || 'cotizacion-cars';
}

async function pedirPdfTemporal(json){
  if (!json.fileId) {
    throw new Error('No se recibió el ID del Google Sheet.');
  }

  const archivo = cleanFileName(json.archivo || 'cotizacion-cars');

  const url = `${API_URL}?action=pdf&fileId=${encodeURIComponent(json.fileId)}&archivo=${encodeURIComponent(archivo)}`;

  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store'
  });

  const result = await response.json();

  if (!result.ok) {
    throw new Error(result.error || 'No se pudo generar el PDF temporal.');
  }

  if (!result.pdfBase64) {
    throw new Error('El backend no devolvió el PDF.');
  }

  const blob = base64ToBlob(result.pdfBase64, 'application/pdf');
  return new File([blob], `${archivo}.pdf`, { type: 'application/pdf' });
}

function openQuote(url){
  if (!url) {
    alert('No se encontró enlace para abrir la cotización.');
    return;
  }

  window.open(url, '_blank');
}

async function loadQuoteHistory(){
  const box = document.getElementById('historyResult');
  if (!box) return;

  if (box.dataset.open === 'true') {
    box.innerHTML = '';
    box.dataset.open = 'false';
    return;
  }

  box.dataset.open = 'true';
  box.innerHTML = '<div class="hint">⏳ Cargando cotizaciones...</div>';

  try {
    const response = await fetch(`${API_URL}?action=listar`, {
      method: 'GET',
      cache: 'no-store'
    });

    const result = await response.json();

    if (!result.ok) {
      throw new Error(result.error || 'No se pudo cargar el historial.');
    }

    renderQuoteHistory(Array.isArray(result.cotizaciones) ? result.cotizaciones : []);

  } catch (error) {
    console.error(error);
    box.innerHTML = `<div class="err">❌ ${escapeHtml(error.message)}</div>`;
  }
}

function renderQuoteHistory(cotizaciones){
  const box = document.getElementById('historyResult');
  if (!box) return;

  box.innerHTML = '';

  if (!cotizaciones.length) {
    box.innerHTML = '<div class="hint">No hay cotizaciones recientes para mostrar.</div>';
    return;
  }

  cotizaciones.forEach(q => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const info = document.createElement('div');

    const title = document.createElement('div');
    title.className = 'history-title';
    title.textContent = q.archivo || q.name || 'Cotización';

    const sub = document.createElement('div');
    sub.className = 'history-sub';

    const fecha = q.fechaCreacion || q.created || '';
    sub.textContent = fecha ? `Creada: ${fecha}` : 'Cotización guardada';

    info.appendChild(title);
    info.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'history-actions';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'btn-secondary';
    openBtn.textContent = 'Ver';
    openBtn.addEventListener('click', () => openQuote(q.url));

    const shareBtn = document.createElement('button');
    shareBtn.type = 'button';
    shareBtn.className = 'btn';
    shareBtn.textContent = 'Reenviar PDF';
    shareBtn.addEventListener('click', () => shareHistoryQuote(q, shareBtn));

    actions.appendChild(openBtn);
    actions.appendChild(shareBtn);

    item.appendChild(info);
    item.appendChild(actions);

    box.appendChild(item);
  });
}

async function shareHistoryQuote(q, button){
  if (!q.fileId) {
    alert('Esta cotización no tiene fileId.');
    return;
  }

  const originalText = button ? button.textContent : '';

  try {
    if (button) {
      button.disabled = true;
      button.textContent = 'Preparando...';
    }

    const archivo = cleanFileName(q.archivo || q.name || 'cotizacion-cars');
    const file = await pedirPdfTemporal({
      fileId: q.fileId,
      archivo
    });

    if (button) {
      button.textContent = 'Compartiendo...';
    }

    if (navigator.canShare && !navigator.canShare({ files: [file] })) {
      alert('Este navegador no permite compartir este PDF como archivo.');
      return;
    }

    if (!navigator.share) {
      alert('Este navegador no permite compartir archivos directamente.');
      return;
    }

    await navigator.share({
      title: 'Cotización CARS',
      text: `Cotización CARS - ${archivo}`,
      files: [file]
    });

  } catch (error) {
    console.error(error);

    if (error.name !== 'AbortError') {
      alert('No se pudo reenviar el PDF: ' + error.message);
    }

  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || 'Reenviar PDF';
    }
  }
}

function getQuoteKey(json){
  return `${json.fileId || ''}|${json.archivo || ''}|${json.totalGeneral || 0}`;
}

async function prepararPdfEnSegundoPlano(json, statusEl, sendBtn){
  const archivo = cleanFileName(json.archivo || 'cotizacion-cars');
  const total = Number(json.totalGeneral || 0);
  const quoteKey = getQuoteKey(json);

  try {
    if (statusEl) {
      statusEl.textContent = 'Preparando PDF...';
    }

    if (sendBtn) {
      sendBtn.style.display = 'none';
      sendBtn.disabled = true;
    }

    preparedPdfFile = await pedirPdfTemporal(json);
    preparedPdfMessage = `Cotización CARS - ${archivo}${total ? '\nTotal: ' + money(total) : ''}`;
    preparedPdfQuoteKey = quoteKey;

    if (statusEl) {
      statusEl.textContent = 'PDF listo para compartir.';
    }

    if (sendBtn) {
      sendBtn.style.display = 'flex';
      sendBtn.disabled = false;
    }

  } catch (error) {
    console.error(error);
    preparedPdfFile = null;
    preparedPdfMessage = '';
    preparedPdfQuoteKey = '';

    if (statusEl) {
      statusEl.textContent = 'No se pudo preparar el PDF.';
    }

    alert('No se pudo preparar el PDF: ' + error.message);
  }
}

async function sharePreparedPdf(json){
  const quoteKey = getQuoteKey(json);

  if (!preparedPdfFile || preparedPdfQuoteKey !== quoteKey) {
    alert('El PDF todavía se está preparando. Intenta de nuevo en unos segundos.');
    return;
  }

  try {
    if (navigator.canShare && !navigator.canShare({ files: [preparedPdfFile] })) {
      alert('Este navegador no permite compartir este PDF como archivo.');
      return;
    }

    if (!navigator.share) {
      alert('Este navegador no permite compartir archivos directamente.');
      return;
    }

    await navigator.share({
      title: 'Cotización CARS',
      text: preparedPdfMessage,
      files: [preparedPdfFile]
    });

  } catch (error) {
    console.error(error);

    if (error.name === 'AbortError') {
      return;
    }

    alert('No se pudo compartir el PDF: ' + error.message);
  }
}

function renderQuoteResult(json){
  preparedPdfFile = null;
  preparedPdfMessage = '';
  preparedPdfQuoteKey = '';

  const result = document.getElementById('result');
  const total = Number(json.totalGeneral || 0);

  result.innerHTML = '';

  const ok = document.createElement('div');
  ok.className = 'ok';
  ok.innerHTML = `✅ Cotización creada: <strong>${json.archivo || 'Archivo creado'}</strong>`;
  result.appendChild(ok);

  const meta = document.createElement('p');
  meta.className = 'quote-meta';
  meta.innerHTML = `Total: <strong>${money(total)}</strong>`;
  result.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'quote-actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'quote-action-btn quote-action-primary';
  openBtn.textContent = 'Ver cotización';
  openBtn.addEventListener('click', () => openQuote(json.url));

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'quote-action-btn quote-action-whatsapp';
  sendBtn.textContent = 'Compartir PDF';
  sendBtn.style.display = 'none';
  sendBtn.disabled = true;
  sendBtn.addEventListener('click', () => sharePreparedPdf(json));

  actions.appendChild(openBtn);
  actions.appendChild(sendBtn);
  result.appendChild(actions);

  const pdfStatus = document.createElement('p');
  pdfStatus.className = 'quote-meta';
  pdfStatus.textContent = 'Preparando PDF...';
  result.appendChild(pdfStatus);

  prepararPdfEnSegundoPlano(json, pdfStatus, sendBtn);
}

async function submitQuote(){
  calc();
  const data = {
    prueba: document.getElementById('prueba').value === 'true',
    fecha: document.getElementById('fecha').value.trim() || todayDMY(),
    clienteId: selectedClienteId,
    cliente: document.getElementById('cliente').value.trim(),
    rnc: document.getElementById('rnc').value.trim(),
    vehiculo: document.getElementById('vehiculo').value.trim(),
    itbis: document.getElementById('itbis').value === 'true',
    observacion: document.getElementById('observacion').value.trim(),
    items: getItems()
  };
  if (!data.cliente || !data.vehiculo || data.items.length === 0) { alert('Faltan cliente, vehículo o artículos.'); return; }

  const result = document.getElementById('result');
  result.innerHTML = '⏳ Creando cotización...';

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || 'Error desconocido');
    renderQuoteResult(json);
  } catch (err) {
    result.innerHTML = `<div class="err">❌ ${err.message}</div>`;
  }
}
clearAll();
