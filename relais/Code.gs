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
      const f = it.next(), n = f.getName(); if (!/\.json$/.test(n)) continue;
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
  return rep_({ ok: true, version: 1 });
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
  if (b.action === 'retirer') { const f = fichier_(propre_(b.id)); if (f) f.setTrashed(true); return rep_({ ok: true }); }
  return rep_({ ok: false, erreur: 'action' });
}

// Pour tester depuis l'éditeur : sélectionne « autoriser » puis ▶ Exécuter (crée le dossier, demande les autorisations).
function autoriser() { dossier_(); Logger.log('Dossier prêt : ' + DOSSIER); }
