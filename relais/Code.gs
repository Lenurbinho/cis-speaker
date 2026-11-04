/* Relais CIS speaker — à coller dans un projet Google Apps Script (script.google.com).
   Il garde les fichiers de réunion dans un dossier de TON Google Drive (privé) et les donne
   aux appareils qui connaissent le code d'équipe. Aucune donnée n'est publiée ailleurs.
   Mode d'emploi : relais/LISEZMOI.md */

const CODE_EQUIPE = 'A-CHANGER';            // ← choisis un code (lettres et chiffres), à donner aux speakers
const DOSSIER = 'CIS speaker - réunions';   // dossier créé tout seul dans ton Drive

function dossier_() { const it = DriveApp.getFoldersByName(DOSSIER); return it.hasNext() ? it.next() : DriveApp.createFolder(DOSSIER); }
function rep_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function propre_(id) { return String(id || '').replace(/[^\w\-]/g, '').slice(0, 100); }
function fichier_(id) { const it = dossier_().getFilesByName(id + '.json'); return it.hasNext() ? it.next() : null; }

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.cle !== CODE_EQUIPE) return rep_({ ok: false, erreur: 'code' });
  if (p.action === 'liste') {
    const L = [], it = dossier_().getFiles();
    while (it.hasNext()) {
      const f = it.next(), n = f.getName(); if (!/\.json$/.test(n) || /\.saisies\.json$/.test(n)) continue;
      let info = {}; try { info = JSON.parse(f.getDescription() || '{}'); } catch (x) { }
      L.push({ id: n.replace(/\.json$/, ''), nom: info.nom || n, date: info.date || '', maj: f.getLastUpdated().getTime(), taille: f.getSize() });
    }
    L.sort(function (a, b) { return b.maj - a.maj; });
    return rep_({ ok: true, reunions: L });
  }
  if (p.action === 'lire') {
    const f = fichier_(propre_(p.id)); if (!f) return rep_({ ok: false, erreur: 'absent' });
    return ContentService.createTextOutput('{"ok":true,"maj":' + f.getLastUpdated().getTime() + ',"reunion":' + f.getBlob().getDataAsString() + '}')
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (p.action === 'saisies') return rep_(changes_(propre_(p.id), +p.depuis || 0));
  if (p.action === 'brut') return rep_(brut_(p.url, +p.ttl || 5));
  return rep_({ ok: true, version: 3 });
}

// ---------- saisies partagées : une case = un temps, un concours, un vent, une règle… ----------
// Fichier <id>.saisies.json : { n: compteur, c: { "res|e0|727": { v: valeur, t: heure appareil, n: numéro, by: appareil } } }
function lireSaisies_(id) {
  const it = dossier_().getFilesByName(id + '.saisies.json');
  if (!it.hasNext()) return { f: null, d: { n: 0, c: {} } };
  const f = it.next(); let d; try { d = JSON.parse(f.getBlob().getDataAsString()); } catch (x) { d = { n: 0, c: {} }; }
  return { f: f, d: d };
}
function changes_(id, depuis) {
  const cache = CacheService.getScriptCache(), n = +(cache.get('n:' + id) || -1);
  if (n >= 0 && n <= depuis) return { ok: true, n: n, items: [] }; // rien de neuf : réponse immédiate
  const d = lireSaisies_(id).d, items = [];
  Object.keys(d.c).forEach(function (k) { const x = d.c[k]; if (x.n > depuis) items.push({ p: k, v: x.v, t: x.t, by: x.by }); });
  cache.put('n:' + id, String(d.n), 21600);
  return { ok: true, n: d.n, items: items };
}
function saisir_(b) {
  const id = propre_(b.id); if (!id) return { ok: false, erreur: 'vide' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const r = lireSaisies_(id), d = r.d;
    (b.items || []).forEach(function (it) {
      const old = d.c[it.p];
      if (old && old.t > it.t) return; // une saisie plus récente existe déjà
      d.n++; d.c[it.p] = { v: it.v, t: it.t, n: d.n, by: b.by || '' };
    });
    const txt = JSON.stringify(d);
    if (r.f) r.f.setContent(txt); else dossier_().createFile(id + '.saisies.json', txt, 'application/json');
    CacheService.getScriptCache().put('n:' + id, String(d.n), 21600);
  } finally { lock.releaseLock(); }
  return changes_(id, +b.depuis || 0);
}

function doPost(e) {
  let b; try { b = JSON.parse(e.postData.contents); } catch (x) { return rep_({ ok: false, erreur: 'json' }); }
  if (b.cle !== CODE_EQUIPE) return rep_({ ok: false, erreur: 'code' });
  if (b.action === 'deposer') {
    const id = propre_(b.id); if (!id || !b.reunion) return rep_({ ok: false, erreur: 'vide' });
    const txt = JSON.stringify(b.reunion);
    let f = fichier_(id);
    if (f) f.setContent(txt); else f = dossier_().createFile(id + '.json', txt, 'application/json');
    f.setDescription(JSON.stringify({ nom: b.nom || id, date: b.date || '' }));
    return rep_({ ok: true, maj: f.getLastUpdated().getTime() });
  }
  if (b.action === 'saisir') return rep_(saisir_(b));
  if (b.action === 'retirer') { const f = fichier_(propre_(b.id)); if (f) f.setTrashed(true); return rep_({ ok: true }); }
  return rep_({ ok: false, erreur: 'action' });
}

// ---------- lecture des sites de données (Direct athle.fr, Matsport) pour le CIS ----------
// Seuls ces sites sont autorisés. La réponse est gardée quelques secondes en mémoire : si plusieurs
// speakers demandent la même page, le site n'est interrogé qu'une fois.
const SITES_OK = ['athle.fr', 'matsport.com'];
function brut_(url, ttl) {
  url = String(url || '');
  const host = (url.match(/^https:\/\/([^\/?#]+)/) || [])[1] || '';
  if (!SITES_OK.some(function (d) { return host === d || host.slice(-d.length - 1) === '.' + d; })) return { ok: false, erreur: 'site non autorisé' };
  ttl = Math.max(2, Math.min(600, ttl || 5));
  const key = 'u:' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, url));
  const cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) { try { const o = JSON.parse(hit); o.cache = true; return o; } catch (x) { } }
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true, headers: { 'User-Agent': 'CIS speaker (relais Google Apps Script)' } });
  const h = r.getHeaders(), o = { ok: true, code: r.getResponseCode(), type: h['Content-Type'] || h['content-type'] || '', texte: r.getContentText() };
  const txt = JSON.stringify(o);
  if (txt.length < 95000) cache.put(key, txt, ttl);
  return o;
}

// Pour tester depuis l'éditeur : sélectionne « autoriser » puis ▶ Exécuter (crée le dossier, demande les autorisations).
function autoriser() { dossier_(); UrlFetchApp.fetch('https://www.athle.fr/', { muteHttpExceptions: true }); Logger.log('Dossier prêt : ' + DOSSIER + ' — accès aux sites autorisé'); }
