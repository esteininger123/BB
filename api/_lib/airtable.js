// Airtable-Wrapper für REST-API.
// Methoden: list, get, create, update, delete
//
// Nutzt env: AIRTABLE_TOKEN, AIRTABLE_BASE_ID
//
// Beispiele:
//   await airtable('list', tableId, { filterByFormula: "{Email}='x'" })
//   await airtable('get',  tableId, { recordId: 'rec...' })
//   await airtable('create', tableId, { fields: {...} })
//   await airtable('update', tableId, { recordId: 'rec...', fields: {...} })
//   await airtable('delete', tableId, { recordId: 'rec...' })

const AIRTABLE_API = 'https://api.airtable.com/v0';

function getCfg() {
  const token = process.env.AIRTABLE_TOKEN;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!token) throw new Error('AIRTABLE_TOKEN nicht gesetzt');
  if (!baseId) throw new Error('AIRTABLE_BASE_ID nicht gesetzt');
  return { token, baseId };
}

function buildQuery(params) {
  if (!params || typeof params !== 'object') return '';
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      v.forEach(item => usp.append(k + '[]', String(item)));
    } else {
      usp.append(k, String(v));
    }
  }
  const s = usp.toString();
  return s ? '?' + s : '';
}

async function fetchWithRetry(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if (res.status === 429 && attempt < 3) {
    // Rate-Limit, kurz warten und retry
    await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

async function airtable(method, tableId, params = {}) {
  const { token, baseId } = getCfg();
  if (!tableId) throw new Error('tableId fehlt');

  const baseUrl = `${AIRTABLE_API}/${baseId}/${encodeURIComponent(tableId)}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  let url, options;

  switch (method) {
    case 'list': {
      // Listing — alle params landen in der Query (filterByFormula, sort, fields, maxRecords, pageSize, offset, view ...)
      const query = buildQuery(params);
      url = baseUrl + query;
      options = { method: 'GET', headers };
      break;
    }
    case 'get': {
      if (!params.recordId) throw new Error('recordId fehlt');
      url = `${baseUrl}/${params.recordId}`;
      options = { method: 'GET', headers };
      break;
    }
    case 'create': {
      url = baseUrl;
      options = {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fields: params.fields || {},
          typecast: params.typecast !== false
        })
      };
      break;
    }
    case 'update': {
      if (!params.recordId) throw new Error('recordId fehlt');
      url = `${baseUrl}/${params.recordId}`;
      options = {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          fields: params.fields || {},
          typecast: params.typecast !== false
        })
      };
      break;
    }
    case 'delete': {
      if (!params.recordId) throw new Error('recordId fehlt');
      url = `${baseUrl}/${params.recordId}`;
      options = { method: 'DELETE', headers };
      break;
    }
    default:
      throw new Error(`Unbekannte Methode: ${method}`);
  }

  const res = await fetchWithRetry(url, options);

  if (!res.ok) {
    let errBody;
    try { errBody = await res.json(); } catch { errBody = await res.text(); }
    const msg = (errBody && errBody.error && (errBody.error.message || errBody.error.type)) || JSON.stringify(errBody);
    const err = new Error(`Airtable ${method} ${res.status}: ${msg}`);
    err.status = res.status;
    err.airtableError = errBody;
    throw err;
  }

  if (res.status === 204) return { ok: true };
  return res.json();
}

// Listet alle Records (paginated) bis maxTotal oder Ende.
async function listAll(tableId, params = {}, maxTotal = 1000) {
  const records = [];
  let offset;
  do {
    const p = { ...params, pageSize: params.pageSize || 100 };
    if (offset) p.offset = offset;
    const resp = await airtable('list', tableId, p);
    records.push(...(resp.records || []));
    offset = resp.offset;
    if (records.length >= maxTotal) break;
  } while (offset);
  return records;
}

// Helper: Escape Wert für filterByFormula String-Literale
function escapeFormulaString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

module.exports = { airtable, listAll, escapeFormulaString };
