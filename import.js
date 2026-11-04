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
    return step().then(function () {
      // épreuves combinées sur plusieurs jours : on va chercher les épreuves des autres journées du combiné
      var hasComb = Object.keys(pages).some(function (g) { return pages[g].comb; });
      if (!hasComb || !dd) return;
      var other = {}; r[1].replace(/btn_date\('(\d{2}\/\d{2}\/\d{4})'\)/g, function (a, x) { if (x !== date) other[x] = 1; });
      return Promise.all(Object.keys(other).map(function (od) {
        var pu = prog.replace('&date=' + encodeURIComponent(date), '&date=' + encodeURIComponent(od));
        return get(pu).then(function (html) {
          var re = /<tr[^>]*>((?:(?!<\/tr>)[\s\S])*?-\s*(?:Hepta|D[ée]ca|Penta|Hexa|Octa|T[ée]tra)thlon(?:(?!<\/tr>)[\s\S])*)<\/tr>/gi, m;
          while ((m = re.exec(html))) { var g = guidOf(m[1]); if (g && !seen[g]) { seen[g] = 1; todo.push(g); } }
        }).catch(function () { });
      })).then(step);
    });
  }).then(function () {
    var L = Object.keys(pages).map(function (g) { return pages[g]; });
    var isDay = function (o) { return !o.day || (o.day === +dd[1] && (!o.month || o.month === +dd[2])); };
    if (dd) { // un combiné des autres jours n'est gardé que s'il a au moins une épreuve le jour importé
      var today = {}; L.forEach(function (o) { if (o.comb && isDay(o)) today[o.comb + '|' + o.sexe] = 1; });
      L.forEach(function (o) { if (o.comb && !isDay(o)) o.autre = true; });
      L = L.filter(function (o) { return isDay(o) || (o.comb && today[o.comb + '|' + o.sexe]); });
    }
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
      var c = combs[k]; c.list.sort(function (a, b) { return ((a.month * 40 + a.day) - (b.month * 40 + b.day)) || (a.time < b.time ? -1 : 1); });
      var first = c.list.filter(function (x) { return !x.autre; })[0] || c.list[0], e = toEpreuve(first);
      e.nom = c.o.comb.replace(/\s+[A-Z]{2,3}$/, ''); e.phase = ''; e.qualification = ''; e.cis_round = 'comb|' + k; e.cis_id = shortId(first.guid);
      e.records_cis = [];
      e.startlist = Object.keys(c.ath).map(function (d) { var a = c.ath[d]; var s = athlete(a.r); s.sb = a.sb.join(' | '); s.pb = a.pb.join(' | '); return s; })
        .sort(function (a, b) { return (+a.couloir || 99) - (+b.couloir || 99); });
      e.cis_disc = c.list.map(function (x) { return { disc: x.disc, horaire: x.time, guid: x.guid, autre: !!x.autre }; });
      eps.push(e);
    });
    eps.sort(function (a, b) { return (a.horaire < b.horaire ? -1 : a.horaire > b.horaire ? 1 : 0) || (a.nom < b.nom ? -1 : 1); });
    // réunion en salle : 60 m / 60 m haies ou « piste courte » au programme → SB/PB et références de salle
    var salle = eps.some(function (e) { return /^60\s?m|piste courte|salle/i.test(e.nom); });
    if (salle) eps.forEach(function (e) { (e.startlist || []).forEach(function (a) {
      a.sb = String(a.sb || '').split(' | ').filter(Boolean).map(function (x) { return x.replace(/^(.*?) : /, '$1 - Salle : '); }).join(' | ');
      a.pb = String(a.pb || '').split(' | ').filter(Boolean).map(function (x) { return x.replace(/^(.*?) : /, '$1 - Salle : '); }).join(' | ');
    }); });
    var d0 = dd ? +dd[1] + ' ' + MOIS_FR[+dd[2]] + ' ' + dd[3] : (L[0] && L[0].day ? L[0].day + ' ' + MOIS_FR[L[0].month] : '');
    return {
      id: 'direct-' + id + (dd ? '-' + dd[3] + dd[2].padStart(2, '0') + dd[1].padStart(2, '0') : ''), source: 'direct', direct: { id: id, date: date || '' }, date_maj: new Date().toISOString(),
      meeting: { nom: nom + (dd ? ' — ' + d0 : ''), sous_titre: '', date: d0, epreuves: eps, options: { salle: salle, type_competition: 'championnat' } }
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
function mergeMediaSheet(file, ms, carry) { // carry = reprise des stats d'une version précédente de la réunion
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
      if (!a.cat && m.cat) { a.cat = m.cat; a.annee = a.annee || m.annee || ''; }
      ['nat', 'pays', 'licence', 'entraineur', 'palmares_national', 'palmares_international', 'records', 'minima_status', 'bio', 'photo', 'tags'].forEach(function (f) { if (m[f]) a[f] = m[f]; });
      if (carry) { if (m.sb) a.sb = m.sb; if (m.pb) a.pb = m.pb; }
      else { if (m.sb) a.sb = m.sb + (a.sb ? ' | ' + a.sb : ''); if (m.pb) a.pb = m.pb + (a.pb ? ' | ' + a.pb : ''); }
      if (m.url && !a.url) a.url = m.url;
    });
  });
  if (!carry) file.mediasheet = { id: ms.id || '', fusion: new Date().toISOString(), athletes: n };
  else if (ms.mediasheet) file.mediasheet = ms.mediasheet;
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

// ---------- Matsport (live ou archives) ----------
// Adresse collée par le speaker : https://athle-liveresults.fr/competitions/<id>/<id>_SCH_<aaaammjj>
// (archives : https://history.athle-liveresults.fr/…). Les données viennent de l'interface JSON de Matsport.
var MATS_API_LIVE = ['https://api.athle.matsport.com', 'https://api-live.athle.matsport.com', 'https://api.athle-liveresults.fr', 'https://api-history.athle.matsport.com'];
function parseMatsUrl(u) {
  var m = String(u || '').match(/competitions\/([0-9a-f-]{36})(?:\/[0-9a-f-]{36}_SCH_(\d{8}))?/i);
  if (!m) return null;
  return { cid: m[1].toLowerCase(), day: m[2] || '', history: /\/\/history\./i.test(u) };
}
function matsTime(t) { // « 1:58.70 » → 1'58"70 ; « 23.39 » → 23"39
  t = String(t || '').trim(); var m;
  if ((m = t.match(/^(\d+):(\d{2})[.,](\d{1,3})$/))) return m[1] + "'" + m[2] + '"' + (m[3] + '0').slice(0, 2);
  if ((m = t.match(/^(\d+):(\d{2})$/))) return m[1] + "'" + m[2] + '"';
  if ((m = t.match(/^(\d+)[.,](\d{1,3})$/))) return m[1] + '"' + (m[2] + '0').slice(0, 2);
  return t;
}
function matsMark(t) { var m = String(t || '').match(/^(\d+)[.,](\d{1,2})$/); return m ? m[1] + 'm' + (m[2] + '0').slice(0, 2) : String(t || ''); }
function matsEventName(e) { return String(e.event || '').replace(/\s+(Hommes|Femmes|Mixte)$/i, '').trim(); }
function matsSexe(e) { return /^W|F/i.test(e.gender || '') ? 'F' : 'H'; }
function matsPhase(p) {
  p = String(p || '');
  var m;
  if ((m = p.match(/Demi\s*Finale\s*(\d+)/i))) return '1/2 finale ' + m[1];
  if ((m = p.match(/Quart\s*de\s*Finale\s*(\d+)/i))) return '1/4 finale ' + m[1];
  if ((m = p.match(/S[ée]rie\s*(\d+)/i))) return 'Série ' + m[1];
  if (/finale/i.test(p)) return 'Finale';
  return p;
}
function matsKind(p) { return /demi/i.test(p) ? 'demi' : /quart/i.test(p) ? 'quart' : /s[ée]rie/i.test(p) ? 'series' : 'finale'; }
var ST_MATS = { NP: 'DNS', AB: 'DNF', DQ: 'DQ', NM: 'NM', DNS: 'DNS', DNF: 'DNF' };
function matsResults(ev) { // JSON d'une épreuve Matsport → même forme que parseResultats (Direct)
  var o = { wind: null, officiel: ev.status === 'OFFICIAL', rows: [] };
  var tr = ev.trackResult, hr = ev.horizontalResult, vr = ev.verticalResult;
  var base = tr || hr || vr; if (!base) return o;
  if (tr && tr.wind) o.wind = parseFloat(String(tr.wind).replace(',', '.'));
  (base.results || []).forEach(function (x) {
    var a = x.athlete || {}, st = ST_MATS[x.status] || '';
    var r = { place: x.rank || '', bib: String(x.bib || ''), nom: ((a.name || '') + ' ' + (a.forename || '')).trim(), url: '', qualif: x.qualif || '', vent: '', st: st, marks: [], points: x.points || '' };
    if (tr) r.perf = st ? x.status : matsTime(x.time);
    if (hr) {
      r.perf = st ? x.status : matsMark(x.result);
      (x.attemptHorizontal || []).forEach(function (t) { if (t.round_Attempt) r.marks.push({ k: String(t.numRound), m: /^\d/.test(t.round_Attempt) ? matsMark(t.round_Attempt) : t.round_Attempt, w: t.round_Wind || '' }); });
      var best = (x.attemptHorizontal || []).filter(function (t) { return t.round_Attempt === x.result; })[0];
      if (best) r.vent = best.round_Wind || '';
    }
    if (vr) {
      r.perf = st ? x.status : matsMark(x.result);
      (x.attemptVertical || []).forEach(function (t) { var m = (t.ht_Att1 || '') + (t.ht_Att2 || '') + (t.ht_Att3 || ''); if (m) r.marks.push({ k: matsMark(t.ht), m: m }); });
    }
    o.rows.push(r);
  });
  return o;
}
function matsStart(ev) { // liste des athlètes (résultats, ou engagés avant la course)
  var base = ev.trackResult || ev.horizontalResult || ev.verticalResult, out = [];
  var list = (base && base.results && base.results.length ? base.results : null) || ev.engaged || [];
  list.forEach(function (x, i) {
    var a = x.athlete || x || {};
    out.push({ nom: ((a.name || '') + ' ' + (a.forename || '')).trim() || a.longName || '', nat: a.country || '', pays: '', cat: '', annee: '', couloir: String(x.lane || x.order || i + 1), dossard: String(x.bib || ''),
      club: a.club || x.club || '', url: a.palmares || '', sb: '', pb: '', palmares_national: '', palmares_international: '', records: '', minima_status: '', tags: '', photo: a.photo || '',
      _sb: x.seasonBest || '', _pb: x.personalBest || '' });
  });
  return out;
}
function matsRecords(recs) {
  var out = [];
  (recs || []).forEach(function (r) {
    var l = String(r.libelle || '').replace(/^=/, ''), code = { RF: 'RF', RC: 'RCH', MPF: 'MPF', WR: 'RM', ER: 'RE', RE: 'RE', WL: 'MPM', EL: 'MPE' }[l]; if (!code) return;
    var lab = { RF: 'record de France', RCH: 'record des championnats', MPF: 'meilleure perf française ' + (r.year || ''), RM: 'record du monde', RE: "record d'Europe", MPM: 'meilleure perf mondiale ' + (r.year || ''), MPE: 'meilleure perf européenne ' + (r.year || '') }[code];
    out.push({ code: code, label: lab, perf: r.result, detail: (r.athlete || '') + (r.year ? ' (' + r.year + ')' : ''), rank: { RM: 1, RE: 2, RF: 3, RCH: 5, MPM: 6, MPE: 7, MPF: 8 }[code] });
  });
  return out;
}
function importMatsport(url, get, progress) {
  progress = progress || function () { };
  var u = parseMatsUrl(url); if (!u) return Promise.reject(new Error('adresse Matsport non reconnue (il faut …/competitions/<numéro>/…)'));
  var apis = u.history ? ['https://api-history.athle.matsport.com'] : MATS_API_LIVE, api = '', comp = null;
  progress('Recherche de la compétition chez Matsport…');
  function probe(i) {
    if (i >= apis.length) return Promise.reject(new Error('compétition introuvable chez Matsport (le relais a-t-il accès au site ?)'));
    return get(apis[i] + '/competitions/' + u.cid + '?_withEvents=true').then(function (t) { comp = JSON.parse(t); api = apis[i]; }).catch(function () { return probe(i + 1); });
  }
  return probe(0).then(function () {
    var day = u.day ? u.day.slice(0, 4) + '-' + u.day.slice(4, 6) + '-' + u.day.slice(6, 8) : '';
    var evs = [];
    (comp.schedules || []).forEach(function (s) { if (!day || String(s.date).slice(0, 10) === day) (s.events || []).forEach(function (e) { evs.push(e); }); });
    if (!evs.length) throw new Error('aucune épreuve pour cette journée chez Matsport');
    var full = {}, todo = evs.slice(), n = 0;
    function step() {
      var b = todo.splice(0, 4); if (!b.length) return Promise.resolve();
      return Promise.all(b.map(function (e) { return get(api + '/events/' + e.id).then(function (t) { full[e.id] = JSON.parse(t); }).catch(function () { }); }))
        .then(function () { n += b.length; progress(n + ' / ' + evs.length + ' épreuves Matsport lues…'); return step(); });
    }
    return step().then(function () { return { u: u, api: api, comp: comp, evs: evs, full: full, day: day }; });
  });
}
function matsToFile(mt) { // réunion complète à partir de Matsport seul
  var eps = [], combs = {};
  mt.evs.forEach(function (e) {
    var ev = mt.full[e.id] || {}, nom = matsEventName(e), sexe = matsSexe(e), t = String(e.date || '').slice(11, 16).replace(':', 'h');
    var sl = matsStart(ev);
    if (ev.idCombined || /thlon/i.test(nom)) {
      var k = nom + '|' + sexe, c = combs[k] = combs[k] || { nom: nom.replace(/\s+(U\d{2}|JSF|SF|CF|MF)$/i, ''), sexe: sexe, disc: [], ath: {}, t: t, id: e.id };
      c.disc.push({ disc: e.phase, horaire: t, mats: e.id });
      sl.forEach(function (a) { var x = c.ath[a.dossard] = c.ath[a.dossard] || { a: a, sb: [], pb: [] }; if (a._sb) x.sb.push(e.phase + ' : ' + a._sb); if (a._pb) x.pb.push(e.phase + ' : ' + a._pb); });
      return;
    }
    var fmt = function (v) { return /^\d+[.,]\d+$/.test(v) && ev.type !== 'A' && ev.type !== 'B' ? matsMark(v) : matsTime(v); };
    eps.push({ nom: nom, sexe: sexe, categorie: 'SE', horaire: t, jour: '', phase: matsPhase(e.phase), qualification: '', record_meeting: '', minima_baremes: [], series: [],
      records_cis: matsRecords(e.records || ev.records), cis_id: 'm' + String(e.id).split('_').pop(), cis_round: sexe + '|' + nom + '|' + matsKind(e.phase), cis_mats: e.id,
      startlist: sl.map(function (a) { var k = nom + (mt.comp.isIndoor ? ' - Salle' : ''); a.sb = a._sb ? k + ' : ' + fmt(a._sb) : ''; a.pb = a._pb ? k + ' : ' + fmt(a._pb) : ''; delete a._sb; delete a._pb; return a; }) });
  });
  Object.keys(combs).forEach(function (k) {
    var c = combs[k];
    eps.push({ nom: c.nom, sexe: c.sexe, categorie: 'SE', horaire: c.disc[0].horaire, phase: '', qualification: '', records_cis: [], cis_id: 'm' + String(c.id).split('_').pop(), cis_round: 'comb|' + k, cis_disc: c.disc,
      startlist: Object.keys(c.ath).map(function (d) { var x = c.ath[d], a = x.a; a.sb = x.sb.join(' | '); a.pb = x.pb.join(' | '); delete a._sb; delete a._pb; return a; }) });
  });
  eps.sort(function (a, b) { return a.horaire < b.horaire ? -1 : a.horaire > b.horaire ? 1 : 0; });
  var d = mt.day ? +mt.day.slice(8, 10) + ' ' + MOIS_FR[+mt.day.slice(5, 7)] + ' ' + mt.day.slice(0, 4) : '';
  return { id: 'mats-' + mt.u.cid.slice(0, 8) + (mt.u.day ? '-' + mt.u.day : ''), source: 'matsport', mats: { api: mt.api, cid: mt.u.cid, day: mt.u.day },
    date_maj: new Date().toISOString(), meeting: { nom: (mt.comp.name || 'Matsport') + (d ? ' — ' + d : ''), sous_titre: '', date: d, epreuves: eps, options: { salle: !!mt.comp.isIndoor, type_competition: 'championnat' } } };
}
// associe les épreuves Matsport aux séries d'une réunion déjà importée (Direct / Media Sheet)
function attachMatsport(file, mt) {
  var E = root.CISE, eps = (file.meeting || file).epreuves, n = 0;
  var mins = function (t) { var m = String(t || '').match(/(\d{1,2})[h:](\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  mt.evs.forEach(function (e) {
    var ev = mt.full[e.id] || {}, sexe = matsSexe(e), nom = matsEventName(e), t = mins(String(e.date).slice(11, 16));
    if (ev.idCombined || /thlon/i.test(nom)) {
      var c = eps.filter(function (x) { return x.sexe === sexe && x.cis_disc && E.nk(x.nom).indexOf(E.nk(nom).replace(/[^a-z]/g, '').slice(0, 6)) === 0; })[0];
      if (!c) return;
      var b = E.eventInfo(e.phase, sexe, false).base;
      c.cis_disc.forEach(function (d) { if (E.eventInfo(d.disc, sexe, false).base === b) { d.mats = e.id; n++; } });
      return;
    }
    var base = E.eventInfo(nom, sexe, false).base, kind = matsKind(e.phase), best = null, bd = 99;
    eps.forEach(function (x) {
      if (x.sexe !== sexe || x.cis_disc || E.eventInfo(x.nom, x.sexe, false).base !== base) return;
      var xk = /1\/2|demi/i.test(x.phase) ? 'demi' : /1\/4|quart/i.test(x.phase) ? 'quart' : /s[ée]rie/i.test(x.phase) ? 'series' : 'finale';
      if (xk !== kind) return;
      var dd = Math.abs((mins(x.horaire) || 0) - t), num = (e.phase.match(/(\d+)\s*$/) || [])[1], xn = (String(x.phase).match(/(\d+)\s*$/) || [])[1];
      if (num && xn && num === xn) dd -= 0.5;
      if (dd < bd && dd <= 10) { bd = dd; best = x; }
    });
    if (best) { best.cis_mats = e.id; n++; }
  });
  file.mats = { api: mt.api, cid: mt.u.cid, day: mt.u.day };
  return n;
}

root.CISI = { parseResultats: parseResultats, parseMatsUrl: parseMatsUrl, importMatsport: importMatsport, matsToFile: matsToFile, attachMatsport: attachMatsport, matsResults: matsResults, parseListe: parseListe, importDirect: importDirect, mergeMediaSheet: mergeMediaSheet };
})(window);
