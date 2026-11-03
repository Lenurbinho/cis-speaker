/* CIS speaker — moteur de calcul (aucun affichage ici).
   Lit un fichier de meeting Media Sheet, prépare l'horaire, les séries, les records
   et calcule classements, Q/q, concours et alertes. */
(function (root) {
'use strict';

// ---------- outils texte ----------
function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function nk(s) { return norm(s).replace(/[\s_]/g, '').replace(/,/g, '.'); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function pad3(n) { return (n < 10 ? '00' : n < 100 ? '0' : '') + n; }

// ---------- performances (stockées en entiers : centièmes, centimètres, points) ----------
function parsePerf(str, unit) {
  if (str == null) return null;
  var s = String(str).trim().split(' — ')[0].split(' (')[0].trim();
  if (!s) return null;
  s = s.replace(/''/g, '"').replace(/[″“”]/g, '"').replace(/[′’´]/g, "'");
  var m;
  if (unit === 'pts' || /pts?$/i.test(s)) {
    var d = s.replace(/[^\d]/g, ''); return d ? parseInt(d, 10) : null;
  }
  if ((m = s.match(/^(\d+)m(\d{0,2})$/i))) return (+m[1]) * 100 + (m[2] ? +(m[2] + '0').slice(0, 2) : 0);
  if ((m = s.match(/^(?:(\d+)h)?(?:(\d+)')?(\d+)(?:"(\d{0,3}))?$/))) {
    var h = +(m[1] || 0), mi = +(m[2] || 0), se = +m[3], cc = m[4] ? Math.round(parseFloat('0.' + m[4]) * 100) : 0;
    if (!m[1] && !m[2] && !/"/.test(s) && unit !== 't') return null;
    return ((h * 60 + mi) * 60 + se) * 100 + cc;
  }
  if ((m = s.match(/^(\d+)[.,](\d{1,2})$/))) { // 10.52 ou 7,52
    return unit === 'm' ? (+m[1]) * 100 + +(m[2] + '0').slice(0, 2) : (+m[1]) * 100 + +(m[2] + '0').slice(0, 2);
  }
  return null;
}
function fmtPerf(v, unit) {
  if (v == null || isNaN(v)) return '';
  if (unit === 'm') return Math.floor(v / 100) + 'm' + pad2(v % 100);
  if (unit === 'pts') return v >= 1000 ? Math.floor(v / 1000) + ' ' + pad3(v % 1000) + ' pts' : v + ' pts';
  var cc = v % 100, s = Math.floor(v / 100), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  if (h) return h + 'h' + pad2(mi) + "'" + pad2(se) + '"' + pad2(cc);
  if (mi) return mi + "'" + pad2(se) + '"' + pad2(cc);
  return se + '"' + pad2(cc);
}
// saisie au pavé : uniquement des chiffres -> valeur
function rawToValue(raw, unit) {
  var d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  if (unit === 'pts') return parseInt(d, 10);
  if (d.length < 3) return null;
  var cc = +d.slice(-2), rest = d.slice(0, -2);
  if (unit === 'm') return (+rest) * 100 + cc;
  var s;
  if (rest.length <= 2) s = +rest;
  else if (rest.length <= 4) { s = (+rest.slice(0, -2)) * 60 + (+rest.slice(-2)); if (+rest.slice(-2) > 59) return null; }
  else { s = (+rest.slice(0, -4)) * 3600 + (+rest.slice(-4, -2)) * 60 + (+rest.slice(-2)); }
  return s * 100 + cc;
}
function rawPreview(raw, unit) {
  var d = String(raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (unit === 'pts') return d;
  if (d.length < 3) return unit === 'm' ? '0m' + ('00' + d).slice(-2) : '0"' + ('00' + d).slice(-2);
  var v = rawToValue(d, unit); return v == null ? d : fmtPerf(v, unit);
}
function valueToRaw(v, unit) {
  if (v == null) return '';
  if (unit !== 't') return String(v);
  var cc = v % 100, s = Math.floor(v / 100), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60;
  if (h) return '' + h + pad2(mi) + pad2(se) + pad2(cc);
  if (mi) return '' + mi + pad2(se) + pad2(cc);
  return '' + se + pad2(cc);
}
function lowerBetter(unit) { return unit === 't'; }
function better(a, b, unit) { return lowerBetter(unit) ? a < b : a > b; }
function cmp(a, b, unit) { return lowerBetter(unit) ? a - b : b - a; }

// ---------- vent ----------
function parseWind(s) {
  if (s == null || s === '') return null;
  var t = String(s).replace(',', '.').replace(/\s/g, '');
  var v = parseFloat(t); return isNaN(v) ? null : Math.round(v * 10) / 10;
}
function fmtWind(w) { return w == null ? '' : (w >= 0 ? '+' : '−') + Math.abs(w).toFixed(1); }

// ---------- épreuves ----------
var SPECS = {
  '110mhaies|H': ['106'], '100mhaies|F': ['84'], '400mhaies|H': ['91'], '400mhaies|F': ['76'],
  '60mhaies|H': ['106'], '60mhaies|F': ['84'],
  'poids|H': ['7.26kg'], 'poids|F': ['4kg'], 'disque|H': ['2kg', '2.0kg'], 'disque|F': ['1kg', '1.0kg'],
  'marteau|H': ['7.26kg'], 'marteau|F': ['4kg'], 'javelot|H': ['800g'], 'javelot|F': ['600g'],
  'heptathlon|F': ['jsf', 'sf'], 'heptathlon|H': ['jsh', 'sh'], 'decathlon|H': ['sh', 'jsh'], 'pentathlon|F': ['jsf', 'sf']
};
function eventInfo(nom, sexe, salle) {
  var n = nk(nom).replace(/\(.*\)/, '');
  var type = /perche|hauteur/.test(n) ? 'vert' : /longueur|triple|poids|disque|marteau|javelot/.test(n) ? 'horiz' : /thlon/.test(n) ? 'comb' : 'course';
  var unit = type === 'course' ? 't' : type === 'comb' ? 'pts' : 'm';
  var dm = n.match(/^(\d+)m/), dist = dm ? +dm[1] : 0;
  var wind = !salle && ((type === 'course' && dist > 0 && dist <= 200) || (type === 'horiz' && /longueur|triple/.test(n)));
  var base = n.replace(/^(\d+)m(haies|steeple)?.*$/, function (a, d, h) { return d + 'm' + (h || ''); });
  if (type !== 'course') base = n.replace(/[^a-z]/g, '');
  if (/triple/.test(base)) base = 'triplesaut';
  return { type: type, unit: unit, dist: dist, wind: wind, base: base, specs: SPECS[base + '|' + sexe] || [], salle: !!salle };
}
// "Poids (4 kg) - Salle" / "Marteau 4 kg" / "Heptathlon JSF" correspond-il à l'épreuve ?
function matchesEvent(label, ev) {
  var k = nk(label);
  var indoor = /salle|pistecourte|\(i\)/.test(k);
  if (indoor !== ev.salle && !(ev.salle && ev.type !== 'course' && !indoor)) return false;
  k = k.replace(/-?salle|pistecourte/g, '').replace(/-$/, '');
  if (k.indexOf(ev.base) !== 0) return false;
  var rem = k.slice(ev.base.length).replace(/[()\-]/g, '');
  if (!rem) return true;
  return ev.specs.indexOf(rem) >= 0;
}
// "200m : 25''04 (F) (+3.0) | Poids (4 kg) : 13m16" -> meilleure perf valable pour l'épreuve
function bestFromList(str, ev) {
  if (!str) return null;
  var best = null;
  String(str).split(' | ').forEach(function (part) {
    var i = part.indexOf(' : '); if (i < 0) return;
    var key = part.slice(0, i), rest = part.slice(i + 3);
    if (/\((F|NC)\)/.test(rest)) return; // venté ou non classé
    if (!matchesEvent(key, ev)) return;
    var v = parsePerf(rest, ev.unit); if (v == null) return;
    var y = (rest.match(/\((\d{2})\)\s*$/) || [])[1];
    if (!best || better(v, best.v, ev.unit)) best = { v: v, y: y || '' };
  });
  return best;
}

// ---------- catégories ----------
var CAT_LABEL = { ES: 'espoirs', JU: 'juniors', CA: 'cadets', MI: 'minimes', SE: 'seniors', MA: 'masters', BE: 'benjamins' };
var REC_CODE_CAT = { NR: 'ALL', NU23R: 'ES', NU20R: 'JU', NU18R: 'CA' };
function catOf(c) { return String(c || '').toUpperCase().slice(0, 2); }
function displayName(nom) { // "GUILBERT Rosalie" -> "Rosalie GUILBERT"
  var p = String(nom || '').trim().split(/\s+/), up = [], low = [];
  p.forEach(function (w) { (w === w.toUpperCase() && /[A-Z]/.test(w) && low.length === 0 ? up : low).push(w); });
  return low.length && up.length ? low.join(' ') + ' ' + up.join(' ') : String(nom || '');
}

// ---------- records et barèmes d'une épreuve ----------
function headPerf(list, ev) {
  if (!list || !list[0]) return null;
  var v = parsePerf(list[0].perf, ev.unit); if (v == null) return null;
  return { v: v, who: list[0].nom || '', nat: list[0].nat || '', date: list[0].date || '' };
}
function buildRecords(src, ev, athletes, kind) {
  var R = [], y = '';
  Object.keys(src).forEach(function (k) { var m = k.match(/^top_france_(\d{4})$/); if (m) y = m[1]; });
  function add(code, label, cat, v, detail, rank) { if (v != null) R.push({ code: code, label: label, cat: cat, v: v, detail: detail || '', rank: rank }); }
  var h;
  if ((h = headPerf(src.alltime_monde, ev))) add('RM', 'record du monde', 'ALL', h.v, h.who + ' (' + h.nat + ', ' + h.date.slice(-4) + ')', 1);
  if ((h = headPerf(src.alltime_europe, ev))) add('RE', "record d'Europe", 'ALL', h.v, h.who + ' (' + h.nat + ', ' + h.date.slice(-4) + ')', 2);
  if ((h = headPerf(src.alltime_france, ev))) add('RF', 'record de France', 'ALL', h.v, h.who + ' (' + h.date.slice(-4) + ')', 3);
  // records détenus par les engagés (ex. "NU20R Perche : 5m82 (Oullins, 13 juin 2026)")
  (athletes || []).forEach(function (a) {
    String(a.records || '').split(' · ').forEach(function (r) {
      var m = r.match(/^(NR|NU23R|NU20R|NU18R)\s+(.+?)\s*:\s*(\S+)\s*(.*)$/); if (!m) return;
      if (ev.type === 'course' && /\(i\)/.test(m[4])) return;
      if (!matchesEvent(m[2], ev)) return;
      var v = parsePerf(m[3], ev.unit); if (v == null) return;
      var cat = REC_CODE_CAT[m[1]];
      var code = cat === 'ALL' ? 'RF' : 'RF-' + cat;
      if (R.some(function (x) { return x.code === code && !better(v, x.v, ev.unit); })) return;
      R = R.filter(function (x) { return x.code !== code; });
      add(code, cat === 'ALL' ? 'record de France' : 'record de France ' + CAT_LABEL[cat], cat, v, displayName(a.nom) + ' ' + m[4].replace(/[()]/g, '').trim(), cat === 'ALL' ? 3 : 4);
    });
  });
  // records ajoutés plus tard par l'export CIS (Direct FFA : RF par catégorie, MPF par catégorie…)
  (src.records_cis || []).forEach(function (r) {
    var v = parsePerf(r.perf, ev.unit); if (v == null) return;
    var cat = r.cat ? catOf(r.cat) : 'ALL';
    add(r.code || 'REC', r.label || r.code, cat, v, r.detail || '', r.rank || 5);
  });
  var rc = parsePerf(src.record_meeting, ev.unit);
  if (rc != null) add('RCH', kind === 'championnat' ? 'record des championnats' : 'record du meeting', 'ALL', rc, String(src.record_meeting).split(' — ').slice(1).join(' — '), 5);
  if ((h = headPerf(src['top_monde_' + y], ev))) add('MPM', 'meilleure perf mondiale ' + y, 'ALL', h.v, h.who + ' (' + h.nat + ')', 6);
  if ((h = headPerf(src['top_europe_' + y], ev))) add('MPE', 'meilleure perf européenne ' + y, 'ALL', h.v, h.who + ' (' + h.nat + ')', 7);
  // MPF de l'année : la liste Media Sheet peut être en retard, on la complète avec les SB des engagés français
  h = headPerf(src['top_france_' + y], ev);
  (athletes || []).forEach(function (a) {
    if (a.nat && a.nat !== 'FRA') return;
    var sb = bestFromList(a.sb, ev);
    if (sb && (!h || better(sb.v, h.v, ev.unit))) h = { v: sb.v, who: displayName(a.nom) };
  });
  if (h) add('MPF', 'meilleure perf française ' + (y || 'de l\'année'), 'ALL', h.v, h.who, 8);
  (src.minima_baremes || []).forEach(function (b) {
    ['A', 'B'].forEach(function (L) {
      var v = parsePerf(b[L], ev.unit);
      if (v != null) add('MIN', 'minima ' + b.nom + (b.B ? ' ' + L : ''), 'ALL', v, '', 9);
    });
  });
  return R;
}

// ---------- lecture d'un fichier Media Sheet ----------
var MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12 };
function parseDate(s) {
  var m = norm(s).match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (m && MOIS[m[2]]) return m[3] + '-' + pad2(MOIS[m[2]]) + '-' + pad2(+m[1]);
  m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
  return '';
}
function parseHour(s) { var m = String(s || '').match(/(\d{1,2})\s*[h:]\s*(\d{2})?/); return m ? (+m[1]) * 60 + (+(m[2] || 0)) : null; }
function fmtHour(min) { if (min == null) return '--h--'; min = Math.round(min); return pad2(Math.floor(min / 60) % 24) + 'h' + pad2(min % 60); }
function heatInterval(ev) { return ev.type !== 'course' ? 0 : ev.dist <= 800 ? 8 : ev.dist <= 1500 ? 10 : 15; }
function roundDuration(r) {
  if (r.type === 'course') return Math.max(6, r.heats.length * heatInterval(r));
  if (r.type === 'vert') return /perche/.test(nk(r.nom)) ? 150 : 110;
  if (r.type === 'horiz') return 80;
  return 240;
}
function eventTitle(nom, sexe) {
  var n = String(nom).replace(/^(\d+)\s*m\b/i, '$1 m').replace(/Haies/i, 'haies').replace(/Saut/, 'saut');
  return n + ' ' + (sexe === 'F' ? 'F' : 'H');
}

function loadMeeting(file) {
  var mt = file.meeting || file;
  var opt = mt.options || {};
  var salle = !!opt.salle;
  var eps = mt.epreuves || [];
  var groups = [], byKey = {};
  eps.forEach(function (e, i) {
    var info = eventInfo(e.nom, e.sexe, salle);
    var key = info.type === 'course' ? [nk(e.nom), e.sexe, e.categorie, e.horaire].join('|') : 'i' + i;
    if (!byKey[key]) { byKey[key] = { idx: i, items: [] }; groups.push(byKey[key]); }
    byKey[key].items.push({ e: e, i: i });
  });
  var rounds = groups.map(function (g) {
    var e0 = g.items[0].e, info = eventInfo(e0.nom, e0.sexe, salle);
    var phases = g.items.map(function (x) { return norm(x.e.phase); }).join(' ');
    var n = g.items.length;
    var phase = /1\/2|demi/.test(phases) ? 'Demi-finales' : /1\/4|quart/.test(phases) ? 'Quarts de finale' : /final/.test(phases) && n === 1 ? 'Finale' :
      info.type === 'course' ? (n > 1 || /serie/.test(phases) ? 'Séries' : 'Finale') : (info.type === 'comb' ? 'Combiné' : 'Finale');
    if (n === 1 && /serie/.test(phases) && info.type === 'course') phase = 'Série unique';
    var heatWord = /Demi/.test(phase) ? 'Demi' : /Quart/.test(phase) ? 'Quart' : 'Série';
    var t0 = parseHour(e0.horaire);
    var sameTime = g.items.every(function (x) { return x.e.horaire === e0.horaire; });
    var allAth = [];
    var heats = g.items.map(function (x, k) {
      var e = x.e;
      var ath = (e.startlist || []).map(function (a, j) {
        var key = String(a.dossard || '') || 'n' + j;
        var o = {
          key: key, nom: a.nom || '', name: displayName(a.nom), nat: a.nat || '', cat: a.cat || '', catk: catOf(a.cat), annee: a.annee || '',
          couloir: a.couloir || '', dossard: a.dossard || '', club: a.club || '', src: a,
          sb: bestFromList(a.sb, info), pb: bestFromList(a.pb, info), order: j
        };
        if (o.sb && (!o.pb || better(o.sb.v, o.pb.v, info.unit))) o.pb = { v: o.sb.v, y: '' };
        allAth.push(a);
        return o;
      });
      return {
        id: 'e' + x.i, label: n > 1 ? heatWord + ' ' + (k + 1) : (info.type === 'course' ? phase : ''),
        time: t0 == null ? null : (sameTime ? t0 + k * heatInterval(info) : parseHour(e.horaire)), est: sameTime && k > 0,
        ath: ath
      };
    });
    var r = {
      id: 'r' + g.idx, nom: e0.nom, sexe: e0.sexe, cat: e0.categorie || '', title: eventTitle(e0.nom, e0.sexe), phase: phase,
      type: info.type, unit: info.unit, wind: info.wind, info: info, time: t0, heats: heats, src: e0,
      qualif: (g.items.map(function (x) { return x.e.qualification; }).filter(Boolean)[0]) || '',
      records: buildRecords(e0, info, allAth, opt.type_competition || 'championnat')
    };
    r.dur = roundDuration(r);
    return r;
  });
  rounds.sort(function (a, b) { return (a.time == null ? 9999 : a.time) - (b.time == null ? 9999 : b.time) || a.title.localeCompare(b.title); });
  return {
    id: file.id || nk(mt.nom) || 'meeting', nom: mt.nom || 'Réunion', sousTitre: mt.sous_titre || '', date: mt.date || '', dateISO: parseDate(mt.date),
    salle: salle, kind: opt.type_competition || 'championnat', rounds: rounds
  };
}

// finale créée à partir des qualifiés d'un tour
function makeFinal(M, round, qualifiers, time) {
  var heat = { id: 'f' + round.id, label: 'Finale', time: time, est: false, ath: qualifiers.map(function (a, i) {
    var c = {}; for (var k in a) c[k] = a[k]; c.couloir = ''; c.order = i; return c; }) };
  var r = {};
  for (var k in round) r[k] = round[k];
  r.id = 'f' + round.id; r.phase = 'Finale'; r.time = time; r.heats = [heat]; r.qualif = ''; r.fromRound = round.id; r.dur = heatInterval(round.info) || 8;
  return r;
}

// ---------- courses : classement d'une série, Q/q ----------
var STATUTS = ['DNS', 'DNF', 'DQ'];
function heatRanking(heat, res, unit) {
  var rows = heat.ath.map(function (a) { var x = (res && res[a.key]) || {}; return { a: a, v: x.v == null ? null : x.v, st: x.st || '' }; });
  var ok = rows.filter(function (r) { return r.v != null && !r.st; }).sort(function (x, y) { return cmp(x.v, y.v, unit); });
  var place = 0;
  ok.forEach(function (r, i) { place = i > 0 && ok[i - 1].v === r.v ? place : i + 1; r.place = place; });
  return ok;
}
function parseRule(s) {
  var t = String(s || '').replace(/\s/g, '');
  var m = t.match(/^(\d+)Q(?:\+(\d+)q)?$/i) || t.match(/^(\d+)q?\+(\d+)q$/);
  if (!m) { var m2 = t.match(/^\+?(\d+)q$/); if (m2) return { Q: 0, q: +m2[1] }; return null; }
  return { Q: +m[1], q: +(m[2] || 0) };
}
// renvoie { [heatId]: { [key]: {auto:'Q'|'q'|'', tie:bool, prov:bool} } , tieQ:[], tieq:[] }
function qualify(round, R, rule) {
  var out = {}, allRest = [], complete = true;
  var rl = parseRule(rule);
  round.heats.forEach(function (h) {
    out[h.id] = {};
    var res = R[h.id] || {};
    var hasAll = h.ath.every(function (a) { var x = res[a.key]; return x && (x.v != null || x.st); });
    if (!hasAll) complete = false;
    var ok = heatRanking(h, res, round.unit);
    if (!rl) return;
    var cut = ok[rl.Q - 1];
    ok.forEach(function (r) {
      if (rl.Q && cut && cmp(r.v, cut.v, round.unit) <= 0) {
        out[h.id][r.a.key] = { auto: 'Q', tie: ok.filter(function (z) { return z.v === cut.v; }).length > 1 && r.v === cut.v && ok.indexOf(r) >= rl.Q - 1 };
      } else allRest.push({ h: h.id, r: r });
    });
  });
  if (rl && rl.q) {
    allRest.sort(function (x, y) { return cmp(x.r.v, y.r.v, round.unit); });
    var lim = allRest[rl.q - 1];
    allRest.forEach(function (x, i) {
      var inq = i < rl.q || (lim && x.r.v === lim.r.v);
      if (inq) out[x.h][x.r.a.key] = { auto: 'q', prov: !complete, tie: lim && x.r.v === lim.r.v && allRest.filter(function (z) { return z.r.v === lim.r.v; }).length > 1 && (i >= rl.q - 1) };
    });
  }
  out._complete = complete;
  return out;
}
function finalQ(qmap, heatId, key, overrides) {
  var o = overrides && overrides[heatId] && overrides[heatId][key];
  if (o) return { v: o === '-' ? '' : o, manual: true };
  var a = qmap[heatId] && qmap[heatId][key];
  return a ? { v: a.auto, prov: a.prov, tie: a.tie } : { v: '' };
}

// ---------- concours horizontaux ----------
// essais : [{r:'752'|'X'|'-', v:cm|null, w:vent}]
function bestMarks(ess, upto) {
  return (ess || []).slice(0, upto || 6).filter(function (e) { return e && e.v != null; }).map(function (e) { return e.v; }).sort(function (a, b) { return b - a; });
}
function cmpMarks(a, b) {
  for (var i = 0; i < Math.max(a.length, b.length); i++) {
    var x = a[i] == null ? -1 : a[i], y = b[i] == null ? -1 : b[i];
    if (x !== y) return y - x;
  }
  return 0;
}
function horizRanking(heat, E, upto) {
  var rows = heat.ath.map(function (a) { var ess = (E && E[a.key]) || []; return { a: a, ess: ess, marks: bestMarks(ess, upto), n: ess.filter(Boolean).length }; });
  var ranked = rows.filter(function (r) { return r.marks.length; }).sort(function (x, y) { return cmpMarks(x.marks, y.marks) || x.a.order - y.a.order; });
  ranked.forEach(function (r, i) { r.place = i > 0 && cmpMarks(ranked[i - 1].marks, r.marks) === 0 ? ranked[i - 1].place : i + 1; });
  var others = rows.filter(function (r) { return !r.marks.length; }).sort(function (x, y) { return x.a.order - y.a.order; });
  return ranked.concat(others);
}
function horizState(heat, E, nFinal) {
  nFinal = nFinal || 8;
  var all = heat.ath;
  var started = all.filter(function (a) { return ((E[a.key] || []).filter(Boolean).length) > 0; });
  var r3done = all.every(function (a) { return (E[a.key] || []).slice(0, 3).filter(Boolean).length === 3; });
  var after3 = horizRanking(heat, E, 3);
  var fin;
  if (all.length <= nFinal) fin = all.map(function (a) { return a.key; });
  else if (r3done) {
    var cutRow = after3[nFinal - 1];
    fin = after3.filter(function (r, i) { return i < nFinal || (cutRow && cutRow.marks.length && cmpMarks(r.marks, cutRow.marks) === 0); }).map(function (r) { return r.a.key; });
  } else fin = null;
  function cnt(a) { return (E[a.key] || []).filter(Boolean).length; }
  var round = 1;
  for (var r = 1; r <= 6; r++) {
    var elig = r <= 3 ? all : (fin ? all.filter(function (a) { return fin.indexOf(a.key) >= 0; }) : []);
    if (r > 3 && !fin) { round = 4; break; }
    if (elig.some(function (a) { return cnt(a) < r; })) { round = r; break; }
    round = 7;
  }
  var order;
  if (round <= 3) order = all.slice().sort(function (x, y) { return x.order - y.order; });
  else {
    var base = round === 6 ? horizRanking(heat, E, 5) : after3;
    order = base.filter(function (r) { return fin && fin.indexOf(r.a.key) >= 0; }).map(function (r) { return r.a; }).reverse();
  }
  var todo = round <= 6 ? order.filter(function (a) { return cnt(a) < round; }) : [];
  return { round: round, finalists: fin, order: order, next: todo[0] || null, after: todo[1] || null, done: round === 7 && started.length > 0 };
}

// ---------- concours verticaux ----------
// V = { bars:[cm...], cur: index, m: { key: { cm: 'XXO' } } }
function vertAthlete(V, key) {
  var bars = (V && V.bars) || [], m = (V && V.m && V.m[key]) || {};
  var c = 0, out = false, best = null, failsAtBest = 0, tot = 0, totAtBest = 0, outAt = null, tried = false;
  bars.forEach(function (b) {
    var s = m[b] || '';
    if (s) tried = true;
    for (var i = 0; i < s.length; i++) {
      if (out) break;
      var ch = s[i];
      if (ch === 'O') { c = 0; best = b; failsAtBest = (s.match(/X/g) || []).length; totAtBest = tot + failsAtBest; }
      else if (ch === 'X') { c++; tot++; if (c >= 3) { out = true; outAt = b; } }
    }
  });
  return { best: best, failsAtBest: failsAtBest, totFails: best == null ? tot : totAtBest, allFails: tot, out: out, outAt: outAt, tried: tried };
}
function vertRanking(heat, V) {
  var rows = heat.ath.map(function (a) { var s = vertAthlete(V, a.key); s.a = a; return s; });
  var ranked = rows.filter(function (r) { return r.best != null; }).sort(function (x, y) {
    return (y.best - x.best) || (x.failsAtBest - y.failsAtBest) || (x.totFails - y.totFails) || (x.a.order - y.a.order);
  });
  ranked.forEach(function (r, i) {
    var p = ranked[i - 1];
    r.place = p && p.best === r.best && p.failsAtBest === r.failsAtBest && p.totFails === r.totFails ? p.place : i + 1;
  });
  var tieFirst = ranked.length > 1 && ranked[1].place === 1;
  var others = rows.filter(function (r) { return r.best == null; }).sort(function (x, y) { return x.a.order - y.a.order; });
  var all = ranked.concat(others); all.tieFirst = tieFirst; return all;
}
function vertBarDone(V, key, bar) {
  var s = (V.m && V.m[key] && V.m[key][bar]) || '';
  var st = vertAthlete(V, key);
  return st.out || /O|-/.test(s) || (s.match(/X/g) || []).length >= 3;
}
function vertState(heat, V) {
  var bar = V && V.bars && V.bars[V.cur];
  if (bar == null) return { bar: null, next: null, after: null, inLice: heat.ath.length };
  var todo = heat.ath.filter(function (a) { return !vertBarDone(V, a.key, bar); });
  var nTries = function (a) { return ((V.m[a.key] || {})[bar] || '').length; };
  var minT = Math.min.apply(null, todo.map(nTries).concat([9]));
  var q = todo.filter(function (a) { return nTries(a) === minT; }).sort(function (x, y) { return x.order - y.order; });
  var inLice = heat.ath.filter(function (a) { return !vertAthlete(V, a.key).out; }).length;
  return { bar: bar, next: q[0] || null, after: q[1] || todo.filter(function (a) { return a !== q[0]; })[0] || null, inLice: inLice, todo: todo.length };
}

// ---------- alertes ----------
function alertsFor(round, a, v, wind) {
  if (v == null) return [];
  var u = round.unit, out = [];
  var windy = wind != null && wind > 2.0;
  round.records.forEach(function (r) {
    if (r.cat !== 'ALL' && r.cat !== a.catk) return;
    if (better(v, r.v, u)) out.push({ code: r.code, txt: r.code === 'MIN' ? r.label : (r.code === 'RCH' ? 'nouveau ' : '') + r.label, rank: r.rank, ref: r.v });
    else if (v === r.v) out.push({ code: r.code, txt: (r.code === 'MIN' ? '' : 'égale le ') + r.label, rank: r.rank + 0.5, ref: r.v, eq: true });
  });
  // garder un seul minima (le meilleur atteint) par championnat
  var seen = {};
  out = out.filter(function (x) { if (x.code !== 'MIN') return true; var k = x.txt.replace(/ [AB]$/, ''); if (seen[k]) return false; seen[k] = 1; return true; });
  if (a.pb) {
    if (better(v, a.pb.v, u)) out.push({ code: 'PB', txt: 'PB (ancien ' + fmtPerf(a.pb.v, u) + ')', rank: 10 });
    else if (v === a.pb.v) out.push({ code: 'PB', txt: 'égale son PB', rank: 10.5, eq: true });
    else if (a.sb && better(v, a.sb.v, u)) out.push({ code: 'SB', txt: 'SB (meilleure perf de sa saison)', rank: 11 });
    else if (a.sb && v === a.sb.v) out.push({ code: 'SB', txt: 'égale son SB', rank: 11.5, eq: true });
    else if (!a.sb) out.push({ code: 'SB', txt: 'SB (1re perf de la saison)', rank: 11 });
  } else if (round.type !== 'course' || true) {
    out.push({ code: 'PB', txt: '1re perf connue sur l\'épreuve', rank: 12, weak: true });
  }
  out.sort(function (x, y) { return x.rank - y.rank; });
  if (windy) out.forEach(function (x) { x.windy = true; });
  return out;
}
function alertText(round, a, v, alerts, wind) {
  var main = alerts.filter(function (x) { return !x.weak; });
  if (!main.length) return '';
  var t = fmtPerf(v, round.unit) + ' : ' + main[0].txt + ' pour ' + a.name;
  if (main.length > 1) t += ', ' + main.slice(1).map(function (x) { return x.txt; }).join(', ');
  if (wind != null && wind > 2.0) t += ' — vent ' + fmtWind(wind) + ' : non homologable';
  return t;
}

// ---------- dictée vocale ----------
var NUMS = { zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100, cents: 100, mille: 1000 };
function motsEnNombre(t) {
  var tot = 0, cur = 0, ok = false;
  t.split(/[\s-]+/).forEach(function (w) {
    if (!w || w === 'et') return; var n = NUMS[w];
    if (n === undefined) { if (/^\d+$/.test(w)) { cur += +w; ok = true; } return; }
    ok = true;
    if (n === 100) cur = (cur || 1) * 100; else if (n === 1000) { tot += (cur || 1) * 1000; cur = 0; }
    else if (n === 20 && cur % 100 === 4) cur = cur - 4 + 80;
    else if (n < 20 && cur % 100 >= 60 && cur % 100 < 80 && cur % 10 === 0) cur += n;
    else cur += n;
  });
  return ok ? tot + cur : null;
}
// renvoie {raw:'1052'} ou {mark:'X'|'-'|'O'} ou {st:'DNS'} ou null
function speechToEntry(text, unit, type) {
  var t = norm(text).replace(/[.,]/g, ' ').trim();
  if (/\b(mordu|croix|echec|faute|nul|rate)\b/.test(t)) return { mark: 'X' };
  if (/\b(passe|tiret)\b/.test(t)) return { mark: '-' };
  if (type === 'vert' && /\b(o|oh|reussi|valide|franchi|bon)\b/.test(t)) return { mark: 'O' };
  if (/abandon|dnf/.test(t)) return { st: 'DNF' };
  if (/forfait|absent|dns|non partant/.test(t)) return { st: 'DNS' };
  if (/disqualif|dq/.test(t)) return { st: 'DQ' };
  var u = t.replace(/\b(heures?|minutes?|secondes?|metres?|points?|pts|virgule|et|m|h|s)\b/g, '|');
  var parts = u.split('|').map(function (p) { return p.trim(); }).filter(Boolean);
  if (parts.length === 1 && /^[\d\s]+$/.test(parts[0])) return { raw: parts[0].replace(/\s/g, '') };
  var nums = parts.map(function (p) { return /^[\d\s]+$/.test(p) ? +p.replace(/\s/g, '') : motsEnNombre(p); }).filter(function (n) { return n != null; });
  if (!nums.length) return null;
  if (unit === 'pts') return { raw: String(nums.reduce(function (a, b) { return a + b; }, 0)) };
  if (nums.length === 1) return { raw: nums[0] < 100 ? nums[0] + '00' : String(nums[0]) };
  var cc = pad2(Math.min(99, nums[nums.length - 1]));
  if (unit === 'm' || nums.length === 2) return { raw: String(nums[0]) + cc };
  return { raw: String(nums[0]) + pad2(nums[1]) + cc };
}

root.CISE = {
  norm: norm, nk: nk, parsePerf: parsePerf, fmtPerf: fmtPerf, rawToValue: rawToValue, rawPreview: rawPreview, valueToRaw: valueToRaw,
  better: better, cmp: cmp, parseWind: parseWind, fmtWind: fmtWind, eventInfo: eventInfo, bestFromList: bestFromList,
  loadMeeting: loadMeeting, makeFinal: makeFinal, parseHour: parseHour, fmtHour: fmtHour, parseRule: parseRule,
  heatRanking: heatRanking, qualify: qualify, finalQ: finalQ, horizRanking: horizRanking, horizState: horizState,
  vertAthlete: vertAthlete, vertRanking: vertRanking, vertState: vertState, alertsFor: alertsFor, alertText: alertText,
  speechToEntry: speechToEntry, displayName: displayName, STATUTS: STATUTS, CAT_LABEL: CAT_LABEL
};
if (typeof module !== 'undefined') module.exports = root.CISE;
})(typeof window !== 'undefined' ? window : globalThis);
