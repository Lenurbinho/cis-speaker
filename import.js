/* CIS speaker — import automatique d'une réunion depuis le Direct athle.fr (par le relais),
   et fusion avec les stats d'un fichier Media Sheet. Produit un fichier au même format que
   Media Sheet, lu ensuite par engine.js. */
(function (root) {
'use strict';
var MOIS = { JANVIER: 1, FEVRIER: 2, 'FÉVRIER': 2, MARS: 3, AVRIL: 4, MAI: 5, JUIN: 6, JUILLET: 7, AOUT: 8, 'AOÛT': 8, SEPTEMBRE: 9, OCTOBRE: 10, NOVEMBRE: 11, DECEMBRE: 12, 'DÉCEMBRE': 12 };
var MOIS_FR = ['', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
function guidOf(s) { var m = String(s || '').match(/frmepreuve=([0-9a-f-]{36})/i); return m ? m[1].toLowerCase() : ''; }
function shortId(g) { return g.replace(/-/g, '').slice(0, 12); }
function catLetter(code) { return /F$/.test(code) ? 'F' : 'H'; }
var CAT2 = { SE: 'SE', ES: 'ES', JU: 'JU', CA: 'CA', MI: 'MI', BE: 'BE', MA: 'MA', TC: 'SE' };
var CAT_FR = { ES: 'espoirs', JU: 'juniors', CA: 'cadets', MI: 'minimes', MA: 'masters' };

// ---------- lecture d'une liste de départ du Direct ----------
function parseListe(html, guid) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var head = txt(doc.querySelector('.mainheaders'));
  if (!head) return null;
  var m = head.match(/^(.*\S)\s+([A-Z]{2,4})$/), name = m ? m[1] : head, code = m ? m[2] : 'TCM';
  var o = { guid: guid, head: head, name: name, code: code, sexe: catLetter(code), records: [], mpf: [], heats: [], rows: [] };
  // combinés : « Heptathlon JSF | Longueur »
  var cm = name.match(/^(.*?)\s*\|\s*(.*)$/);
  if (cm) { o.comb = cm[1].replace(/\s+[A-Z]{2,4}$/, ''); o.disc = cm[2]; }
  // records et meilleures perfs françaises de l'année
  var sec = '';
  doc.querySelectorAll('tr').forEach(function (tr) {
    var h = tr.querySelector('td.recordsHeaders'); if (h) { sec = txt(h); return; }
    var tds = tr.querySelectorAll(':scope > td.recordsDatas'); if (tds.length < 3) return;
    var lab = txt(tds[0]); if (!lab) return; // co-détenteur
    var rec = { lab: lab, perf: txt(tds[1].querySelector('.perf')), vent: txt(tds[1].querySelector('.vent1')), nom: txt(tds[2]), club: txt(tds[3]), date: txt(tds[4]), lieu: txt(tds[5]) };
    if (/^MPF/.test(sec)) { rec.year = (sec.match(/\d{4}/) || [''])[0]; o.mpf.push(rec); } else o.records.push(rec);
  });
  // heure, règle de qualification
  var h4 = doc.querySelectorAll('.headers4 > div');
  h4.forEach(function (d) {
    var t = txt(d), mq = t.match(/Qualif\s*:\s*(.*)$/i), mt = t.match(/(\d{1,2})\s+([A-ZÉÛ]+)\s+(\d{1,2}):(\d{2})/);
    if (mq) o.qualif = mq[1].replace(/\s+/g, '');
    if (mt) { o.day = +mt[1]; o.month = MOIS[mt[2]] || 0; o.time = mt[3] + 'h' + mt[4]; }
  });
  // séries / tours de la même épreuve
  doc.querySelectorAll('.navDatas, .navActive').forEach(function (d) {
    var g = d.classList.contains('navActive') ? guid : guidOf(d.getAttribute('onclick'));
    if (g) o.heats.push({ label: txt(d), guid: g, active: d.classList.contains('navActive') });
  });
  var act = o.heats.filter(function (x) { return x.active; })[0];
  o.phase = act ? act.label : 'Finale';
  // athlètes
  doc.querySelectorAll('tr.trlive').forEach(function (tr) {
    var td = tr.querySelectorAll(':scope > td.datas'); if (td.length < 9) return;
    var a = td[2].querySelector('a'), info = txt(td[3]), im = info.match(/^([A-Z]{3})\/(\d{2})/);
    var yy = im ? +im[2] : null;
    o.rows.push({ ordre: txt(td[0]), dossard: txt(td[1]), nom: txt(td[2]), url: a ? a.href.replace(/^https?:\/\/[^/]*(?=\/athletes)/, 'https://www.athle.fr') : '',
      cat: im ? im[1] : info, annee: yy == null ? '' : String(yy > 40 ? 1900 + yy : 2000 + yy), club: txt(td[4]), dept: txt(td[5]), ligue: txt(td[6]),
      sb: txt(td[7]), pb: txt(td[8]) });
  });
  return o;
}

function recordsCis(o) {
  var out = [], best = null;
  o.records.forEach(function (r) {
    var m = r.lab.match(/^(RF|RE|RM|RCH|RC|MPM)\s*([A-Z]{2})?/); if (!m) return;
    var code = m[1] === 'RC' ? 'RCH' : m[1], c2 = m[2] ? CAT2[m[2]] || m[2] : '';
    var detail = r.nom + (r.date ? ' (' + r.date.slice(-2).replace(/^/, "'") + ')' : '');
    if (code === 'RF') {
      if (!c2 || c2 === 'SE') out.push({ code: 'RF', label: 'record de France', perf: r.perf, detail: detail, rank: 3 });
      else out.push({ code: 'RF-' + c2, label: 'record de France ' + (CAT_FR[c2] || c2), cat: c2, perf: r.perf, detail: detail, rank: 4 });
    } else if (code === 'RCH') out.push({ code: 'RCH', label: 'record des championnats', perf: r.perf, detail: detail, rank: 5 });
    else out.push({ code: code, label: code === 'RE' ? "record d'Europe" : code === 'RM' ? 'record du monde' : code, perf: r.perf, detail: detail, rank: code === 'RM' ? 1 : 2 });
  });
  // MPF de l'année : la meilleure toutes catégories, puis celles des catégories jeunes (espoirs, juniors…)
  var lower = /''|'/.test((o.mpf[0] || {}).perf || '');
  var val = function (p) { var v = root.CISE.parsePerf(p, lower ? 't' : 'm'); return v == null ? null : v; };
  o.mpf.forEach(function (r) { var v = val(r.perf); if (v != null && (!best || (lower ? v < best.v : v > best.v))) best = { v: v, r: r }; });
  if (best) out.push({ code: 'MPF', label: 'meilleure perf française ' + (best.r.year || ''), perf: best.r.perf, detail: best.r.nom, rank: 8 });
  o.mpf.forEach(function (r) {
    var c2 = CAT2[r.lab.slice(0, 2)] || r.lab.slice(0, 2);
    if (c2 === 'SE' || c2 === 'MA') return;
    out.push({ code: 'MPF-' + c2, label: 'meilleure perf française ' + (CAT_FR[c2] || c2) + ' ' + (r.year || ''), cat: c2, perf: r.perf, detail: r.nom, rank: 8.5 });
  });
  return out;
}

// ---------- import complet d'une journée ----------
// get(url) doit renvoyer une promesse du texte de la page (via le relais).
function importDirect(id, date, get, progress) {
  progress = progress || function () { };
  var dd = String(date || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  var prog = 'https://www.athle.fr/ajax/direct.aspx?mode=0&competition=' + id + '&competition2=&date=' + encodeURIComponent(date || '') + '&frmepreuve=&frmcategorie=&frmsexe=&tri=0&display=1&reactions=0';
  var liste = function (g) { return 'https://www.athle.fr/bases/liste.aspx?frmbase=directs&frmmode=1&frmcompetition=' + id + '&frmepreuve=' + g; };
  var nom = 'Direct ' + id, pages = {}, todo = [], seen = {};
  progress('Lecture du programme…');
  return Promise.all([get('https://www.athle.fr/direct/' + id).catch(function () { return ''; }), get(prog)]).then(function (r) {
    var t = (r[0].match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    var parts = t.split('|').map(function (x) { return x.trim(); });
    if (parts.length >= 2 && parts[1]) nom = parts[1];
    r[1].replace(/frmepreuve=([0-9a-f-]{36})/gi, function (a, g) { g = g.toLowerCase(); if (!seen[g]) { seen[g] = 1; todo.push(g); } });
    if (!todo.length) throw new Error('aucune épreuve trouvée dans le programme du Direct (numéro ou date ?)');
    function step() {
      var batch = todo.splice(0, 4); if (!batch.length) return Promise.resolve();
      return Promise.all(batch.map(function (g) {
        return get(liste(g)).catch(function () { return get(liste(g)); }).then(function (html) { // un nouvel essai si la page n'arrive pas
          var o = parseListe(html, g); if (!o) return;
          pages[g] = o;
          o.heats.forEach(function (h) { if (!seen[h.guid]) { seen[h.guid] = 1; todo.push(h.guid); } }); // finales, autres tours
        }).catch(function () { });
      })).then(function () { progress(Object.keys(pages).length + ' listes lues…'); return step(); });
    }
    return step();
  }).then(function () {
    var L = Object.keys(pages).map(function (g) { return pages[g]; });
    if (dd) L = L.filter(function (o) { return !o.day || (o.day === +dd[1] && (!o.month || o.month === +dd[2])); });
    L = L.filter(function (o) { return o.rows.length; });
    var eps = [], combs = {};
    L.forEach(function (o) {
      if (o.comb) { // une seule épreuve « Heptathlon » ; les perfs de référence par discipline viennent des listes
        var k = o.comb + '|' + o.sexe;
        var c = combs[k] = combs[k] || { o: o, list: [], ath: {} };
        c.list.push(o);
        o.rows.forEach(function (r) {
          var a = c.ath[r.dossard] = c.ath[r.dossard] || { r: r, sb: [], pb: [] };
          if (r.sb) a.sb.push(o.disc + ' : ' + r.sb);
          if (r.pb) a.pb.push(o.disc + ' : ' + r.pb);
        });
        return;
      }
      eps.push(toEpreuve(o));
    });
    Object.keys(combs).forEach(function (k) {
      var c = combs[k]; c.list.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
      var first = c.list[0], e = toEpreuve(first);
      e.nom = c.o.comb.replace(/\s+[A-Z]{2,3}$/, ''); e.phase = ''; e.qualification = ''; e.cis_round = 'comb|' + k; e.cis_id = shortId(first.guid);
      e.records_cis = [];
      e.startlist = Object.keys(c.ath).map(function (d) { var a = c.ath[d]; var s = athlete(a.r); s.sb = a.sb.join(' | '); s.pb = a.pb.join(' | '); return s; })
        .sort(function (a, b) { return (+a.couloir || 99) - (+b.couloir || 99); });
      e.cis_disc = c.list.map(function (x) { return { disc: x.disc, horaire: x.time, guid: x.guid }; });
      eps.push(e);
    });
    eps.sort(function (a, b) { return (a.horaire < b.horaire ? -1 : a.horaire > b.horaire ? 1 : 0) || (a.nom < b.nom ? -1 : 1); });
    var d0 = dd ? +dd[1] + ' ' + MOIS_FR[+dd[2]] + ' ' + dd[3] : (L[0] && L[0].day ? L[0].day + ' ' + MOIS_FR[L[0].month] : '');
    return {
      id: 'direct-' + id + (dd ? '-' + dd[3] + dd[2].padStart(2, '0') + dd[1].padStart(2, '0') : ''), source: 'direct', direct: { id: id, date: date || '' }, date_maj: new Date().toISOString(),
      meeting: { nom: nom + (dd ? ' — ' + d0 : ''), sous_titre: '', date: d0, epreuves: eps, options: { salle: false, type_competition: 'championnat' } }
    };
  });
  function athlete(r) {
    var key = r.nom.split(' ')[0];
    return { nom: r.nom, nat: 'FRA', pays: 'France', cat: r.cat, annee: r.annee, couloir: r.ordre, dossard: r.dossard, club: r.club, url: r.url,
      sb: '', pb: '', palmares_national: '', palmares_international: '', records: '', minima_status: '', tags: '', dept: r.dept, ligue: r.ligue, _k: key };
  }
  function toEpreuve(o) {
    var label = o.name; // ex. « Poids (4 kg) », « 110m Haies (106) »
    var base = label.replace(/\s*\(.*\)\s*$/, '');
    var phaseRound = /finale\s*\d|1\/2/i.test(o.phase) ? 'demi' : /s[ée]rie/i.test(o.phase) ? 'series' : /1\/4|quart/i.test(o.phase) ? 'quart' : 'finale';
    return {
      nom: label, sexe: o.sexe, categorie: CAT2[o.code.slice(0, 2)] || 'SE', horaire: o.time || '', jour: o.day ? o.day + '/' + o.month : '', phase: o.phase,
      qualification: o.qualif || '', record_meeting: '', minima_2026: '', minima_baremes: [], series: [],
      records_cis: recordsCis(o), cis_id: shortId(o.guid), cis_round: o.code + '|' + base + '|' + phaseRound, cis_guid: o.guid,
      startlist: o.rows.map(function (r) { var a = athlete(r); if (r.sb) a.sb = label + ' : ' + r.sb; if (r.pb) a.pb = label + ' : ' + r.pb; return a; })
    };
  }
}

// ---------- fusion avec Media Sheet (palmarès, records détenus, bilans, minima…) ----------
function normName(s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, ''); }
function mergeMediaSheet(file, ms) {
  var E = root.CISE, msm = ms.meeting || ms, eps = (file.meeting || file).epreuves, n = 0;
  var byKey = {};
  (msm.epreuves || []).forEach(function (e) { var k = E.eventInfo(e.nom, e.sexe, false).base + '|' + e.sexe; (byKey[k] = byKey[k] || []).push(e); });
  var athByDos = {}, athByName = {};
  (msm.epreuves || []).forEach(function (e) { (e.startlist || []).forEach(function (a) { if (a.dossard) athByDos[a.dossard] = a; athByName[normName(a.nom)] = a; }); });
  eps.forEach(function (e) {
    var k = E.eventInfo(e.nom, e.sexe, false).base + '|' + e.sexe, src = (byKey[k] || [])[0];
    if (src) ['minima_2026', 'minima_baremes', 'top_monde_2026', 'top_europe_2026', 'top_france_2026', 'alltime_monde', 'alltime_europe', 'alltime_france', 'podium_n1', 'record_meeting'].forEach(function (f) { if (src[f] != null && src[f] !== '') e[f] = src[f]; });
    Object.keys(src || {}).forEach(function (f) { if (/^(top|alltime)_/.test(f) && e[f] == null) e[f] = src[f]; });
    (e.startlist || []).forEach(function (a) {
      var m = athByDos[a.dossard]; if (m && normName(m.nom) !== normName(a.nom)) m = null;
      m = m || athByName[normName(a.nom)]; if (!m) return;
      n++;
      ['nat', 'pays', 'licence', 'entraineur', 'palmares_national', 'palmares_international', 'records', 'minima_status', 'bio', 'photo', 'tags'].forEach(function (f) { if (m[f]) a[f] = m[f]; });
      if (m.sb) a.sb = m.sb + (a.sb ? ' | ' + a.sb : '');
      if (m.pb) a.pb = m.pb + (a.pb ? ' | ' + a.pb : '');
      if (m.url && !a.url) a.url = m.url;
    });
  });
  file.mediasheet = { id: ms.id || '', fusion: new Date().toISOString(), athletes: n };
  return n;
}

// ---------- résultats du Direct (frmmode=2) ----------
var ST_MAP = { NP: 'DNS', AB: 'DNF', DQ: 'DQ', NM: 'NM', DNS: 'DNS', DNF: 'DNF' };
function parseResultats(html) {
  var doc = new DOMParser().parseFromString(html, 'text/html');
  var o = { wind: null, officiel: false, rows: [] };
  doc.querySelectorAll('.headers4 > div').forEach(function (d) { var m = txt(d).match(/Vent\s*:\s*([+\-−]?\d+[.,]\d)/); if (m) o.wind = parseFloat(m[1].replace('−', '-').replace(',', '.')); });
  doc.querySelectorAll('.headers3 > div').forEach(function (d) { if (/officiel/i.test(txt(d))) o.officiel = true; });
  doc.querySelectorAll('tr.trlive').forEach(function (tr) {
    var tds = tr.querySelectorAll(':scope > td'); if (tds.length < 10) return;
    var a = tr.querySelector('a.ath'), perf = txt(tr.querySelector('td.perf1')) || txt(tds[1]);
    var r = { place: txt(tds[0]).replace(/ /g, ''), perf: perf, nom: txt(a), url: a ? a.getAttribute('href') : '', qualif: txt(tr.querySelector('td.qualif')),
      vent: txt(tr.querySelector('td.vent')), info: txt(tr.querySelector('td.infos')), marks: [] };
    r.st = ST_MAP[perf] || '';
    var sub = tr.nextElementSibling; // essais ou barres juste en dessous
    if (sub && sub.classList.contains('mobile-d-none')) {
      sub.querySelectorAll('td.subdatas > div').forEach(function (d) {
        var c = d.querySelectorAll(':scope > div'); if (c.length < 2) return;
        r.marks.push({ k: txt(c[0]), m: txt(c[1]), w: c[2] ? txt(c[2]) : '' });
      });
    }
    o.rows.push(r);
  });
  return o;
}

root.CISI = { parseResultats: parseResultats, parseListe: parseListe, importDirect: importDirect, mergeMediaSheet: mergeMediaSheet };
})(window);
