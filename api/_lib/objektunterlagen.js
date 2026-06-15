// Auflösung der zentralen Verkaufsunterlagen eines Objekts über die WE.
// Kette: WE → Objekt (WE_FIELDS.PROJEKT) → Feld "Verkaufsunterlagen" → Drive-Ordner-ID.
// Genutzt bei der Übergabe (Kopie in den Kunden-Unterordner).

const { airtable } = require('./airtable');
const { TABLES, WE_FIELDS, PROJEKT_FIELDS } = require('./tables');
const { folderIdFromUrl } = require('./drive');

async function resolveVerkaufsunterlagenFolder(weId) {
  if (!weId) return '';
  try {
    const weRec = await airtable('get', TABLES.WOHNEINHEIT, { recordId: weId });
    const objLink = (weRec.fields && weRec.fields[WE_FIELDS.PROJEKT]) || [];
    const objId = Array.isArray(objLink) && objLink.length
      ? (typeof objLink[0] === 'object' ? objLink[0].id : objLink[0]) : null;
    if (!objId) return '';
    const objRec = await airtable('get', TABLES.PROJEKT, { recordId: objId });
    const url = (objRec.fields && objRec.fields[PROJEKT_FIELDS.VERKAUFSUNTERLAGEN]) || '';
    return folderIdFromUrl(url);
  } catch {
    return '';
  }
}

module.exports = { resolveVerkaufsunterlagenFolder };
