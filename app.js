/* CIS speaker — écran (horaire, vue Maintenant, fiches, pavé, historique). Le calcul est dans engine.js. */
(function () {
'use strict';
var E = window.CISE;
var VERSION = 'V1.11 · 4 nov. 2026';
var $ = function (s) { return document.querySelector(s); };
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
function vib() { if (navigator.vibrate) try { navigator.vibrate(12); } catch (e) { } }
var fh = E.fmtHour, fp = E.fmtPerf;

// ---------- stockage du fichier de réunion (IndexedDB, reste sur l'appareil) ----------
function idb() {
  return new Promise(function (res, rej) {
    if (!window.indexedDB) return rej('no idb');
    var r = indexedDB.open('cis-speaker', 1);
    r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
    r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
  });
}
function kvGet(k) { return idb().then(function (db) { return new Promise(function (res) { var t = db.transaction('kv').objectStore('kv').get(k); t.onsuccess = function () { res(t.result); }; t.onerror = function () { res(null); }; }); }).catch(function () { return lsGet('cis:kv:' + k, null); }); }
function kvSet(k, v) { return idb().then(function (db) { return new Promise(function (res) { var tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = function () { res(true); }; tx.onerror = function () { res(false); }; }); }).catch(function () { lsSet('cis:kv:' + k, v); }); }

// ---------- état ----------
var RAW = null, M = null, S = null, ROUNDS = {}, KP = null;
function blank() { return { res: {}, cmb: {}, dtime: {}, man: {}, live: {}, notes: {}, wind: {}, ess: {}, vert: {}, rules: {}, qov: {}, off: {}, done: {}, finals: [], lanes: {}, pins: null, ptab: null, heatSel: {}, sortRank: {}, hide: {}, hist: [], clock: null, last: null }; }
function skey() { return 'cis:s:' + M.id; }
function save() { lsSet(skey(), S); if (SY && syncOn()) syDiff(); }
function build() {
  M = E.loadMeeting(RAW);
  (S.finals || []).forEach(function (f) {
    var src = M.rounds.filter(function (r) { return r.id === f.from; })[0]; if (!src) return;
    var ath = f.keys.map(function (k) { var h = src.heats.filter(function (x) { return x.id === k.h; })[0]; return h && h.ath.filter(function (a) { return a.key === k.k; })[0]; }).filter(Boolean);
    M.rounds.push(E.makeFinal(M, src, ath, f.time));
  });
  M.rounds.sort(function (a, b) { return (a.time == null ? 9999 : a.time) - (b.time == null ? 9999 : b.time); });
  ROUNDS = {}; M.rounds.forEach(function (r) { ROUNDS[r.id] = r; });
}
function getH(r, hid) { return r.heats.filter(function (h) { return h.id === hid; })[0]; }
function getA(h, k) { return h.ath.filter(function (a) { return a.key === k; })[0]; }

// ---------- heure ----------
function realMin() { var d = new Date(); return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60; }
function nowMin() { var c = S && S.clock; return c && c.sim ? c.base + (Date.now() - c.at) / 60000 : realMin(); }
function rStart(r) { return r.time == null ? null : r.time + (S.off[r.id] || 0); }
function hStart(r, h) { return h.time == null ? null : h.time + (S.off[r.id] || 0); }
function todayISO() { var d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

// ---------- statut des épreuves ----------
function cmbOf(h, a) { return ((S.cmb || {})[h.id] || {})[a.key] || {}; }
function cmbDone(r, h, a, i) { var x = cmbOf(h, a)[i]; return !!(x && (x.v != null || x.st)); }
function cmbTotal(r, h, a) { var c = cmbOf(h, a), t = 0, n = 0; r.cmb.forEach(function (d, i) { var x = c[i]; if (x && (x.v != null || x.st)) { n++; if (x.v != null) t += E.combPoints(d, x.v); } }); return { t: t, n: n }; }
function heatCount(r, h) {
  if (r.type === 'comb' && r.cmb) return h.ath.filter(function (a) { return cmbTotal(r, h, a).n > 0; }).length;
  if (r.type === 'course' || r.type === 'comb') { var R = S.res[h.id] || {}; return h.ath.filter(function (a) { var x = R[a.key]; return x && (x.v != null || x.st); }).length; }
  if (r.type === 'horiz') { var X = S.ess[h.id] || {}; return h.ath.filter(function (a) { return (X[a.key] || []).some(Boolean); }).length; }
  var V = S.vert[h.id]; return V ? h.ath.filter(function (a) { return V.m[a.key] && Object.keys(V.m[a.key]).length; }).length : 0;
}
function heatComplete(r, h) {
  if (!h.ath.length) return false;
  if (r.type === 'comb' && r.cmb) return h.ath.every(function (a) { return cmbTotal(r, h, a).n === r.cmb.length; });
  if (r.type === 'course' || r.type === 'comb') return heatCount(r, h) === h.ath.length;
  if (r.type === 'horiz') return E.horizState(h, S.ess[h.id] || {}).done;
  return false;
}
function status(r) {
  if (S.done[r.id]) return 'fini';
  if (r.heats.every(function (h) { return heatComplete(r, h); })) return 'fini';
  var any = r.heats.some(function (h) { return heatCount(r, h) > 0; });
  var t = rStart(r), n = nowMin();
  if (any) return 'encours';
  if (t == null || n < t) return 'avenir';
  return n < t + r.dur ? 'encours' : 'passe';
}
var STL = { encours: 'En cours', avenir: 'À venir', fini: 'Terminée', passe: 'Passée' };

// ---------- écriture avec historique (annulable) ----------
function getPath(p) { var o = S; for (var i = 0; i < p.length; i++) { if (o == null) return undefined; o = o[p[i]]; } return o; }
function setPath(p, v) {
  var o = S;
  for (var i = 0; i < p.length - 1; i++) { if (o[p[i]] == null || typeof o[p[i]] !== 'object') o[p[i]] = {}; o = o[p[i]]; }
  if (v == null) delete o[p[p.length - 1]]; else o[p[p.length - 1]] = v;
}
function clone(x) { return x == null ? null : JSON.parse(JSON.stringify(x)); }
var LIVE_PATHS = { res: 1, ess: 1, vert: 1, cmb: 1, wind: 1 };
function commit(path, val, txt, al, rid) {
  var prev = clone(getPath(path));
  if (LIVE_PATHS[path[0]]) { S.man = S.man || {}; S.man[path.join('~')] = 1; } // saisie à la main : le live ne l'écrasera pas
  setPath(path, clone(val));
  if (txt) {
    S.hist.unshift({ t: Date.now(), clk: nowMin(), path: path, prev: prev, val: clone(val), txt: txt, al: al || '', rid: rid || '' });
    if (S.hist.length > 400) S.hist.length = 400;
  }
  save();
}
function undo(i) {
  var h = S.hist[i]; if (!h || h.undone) return;
  setPath(h.path, clone(h.prev)); h.undone = true;
  if (S.last && S.last.t === h.t) S.last = null;
  save(); renderAll();
}

// ---------- perfs déjà réalisées dans le tour (pour ne pas annoncer deux fois le même record) ----------
function roundPerfs(r) {
  var out = [];
  r.heats.forEach(function (h) {
    if (r.type === 'course' || r.type === 'comb') {
      var R = S.res[h.id] || {}, w = S.wind[h.id];
      h.ath.forEach(function (a) { var x = R[a.key]; if (x && x.v != null && !x.st) out.push({ h: h.id, k: a.key, a: a, v: x.v, w: w, i: 0 }); });
    } else if (r.type === 'horiz') {
      var X = S.ess[h.id] || {};
      h.ath.forEach(function (a) { (X[a.key] || []).forEach(function (e, i) { if (e && e.v != null) out.push({ h: h.id, k: a.key, a: a, v: e.v, w: e.w, i: i }); }); });
    } else {
      var V = S.vert[h.id];
      if (V) h.ath.forEach(function (a) { var m = V.m[a.key] || {}; Object.keys(m).forEach(function (b) { if (/O/.test(m[b])) out.push({ h: h.id, k: a.key, a: a, v: +b, i: +b }); }); });
    }
  });
  return out;
}
function alertsAt(r, h, a, v, w, slotI) {
  var perfs = roundPerfs(r).filter(function (p) { return !(p.h === h.id && p.k === a.key && p.i === slotI) && !(p.w != null && p.w > 2); });
  var aa = {}, k; for (k in a) aa[k] = a[k];
  var rr = {}; for (k in r) rr[k] = r[k];
  var own = perfs.filter(function (p) { return p.h === h.id && p.k === a.key; });
  own.forEach(function (p) {
    if (!aa.pb || E.better(p.v, aa.pb.v, r.unit)) aa.pb = { v: p.v, y: 'ici' };
    if (!aa.sb || E.better(p.v, aa.sb.v, r.unit)) aa.sb = { v: p.v, y: 'ici' };
  });
  rr.records = r.records.map(function (rec) {
    if (rec.code === 'MIN') return rec;
    var c = {}; for (var j in rec) c[j] = rec[j];
    perfs.forEach(function (p) { if ((rec.cat === 'ALL' || p.a.catk === rec.cat) && E.better(p.v, c.v, r.unit)) c.v = p.v; });
    return c;
  });
  var al = E.alertsFor(rr, aa, v, w);
  return { list: al, txt: E.alertText(rr, aa, v, al, w) };
}
function announce(txt, al, t) {
  if (!txt) return;
  var hot = al.some(function (x) { return /^R/.test(x.code) && !x.eq; });
  S.last = { txt: txt, t: t, hot: hot }; save(); renderBanner();
  vib();
}

// ---------- pastilles ----------
var PILL = { PB: 'PB', SB: 'SB', RCH: 'RCH', MPF: 'MPF', MPE: 'MPE', MPM: 'MPM', RF: 'RF', RE: 'RE', RM: 'RM' };
function pillsHtml(r, a, v, w) {
  if (v == null) return '';
  var al = E.alertsFor(r, a, v, w).filter(function (x) { return !x.weak; });
  if (!al.length) return '';
  var windy = w != null && w > 2;
  return '<span class="pills">' + (windy ? '<span class="pill wind">vent ' + E.fmtWind(w) + '</span>' : '') + al.map(function (x) {
    var t = PILL[x.code] || (x.code === 'MIN' ? 'Minima' + (/ [AB]$/.test(x.txt) ? ' ' + x.txt.slice(-1) : '') : /^RF-/.test(x.code) ? 'RF ' + (E.CAT_LABEL[x.code.slice(3)] || '').slice(0, 3) : x.code);
    return '<span class="pill ' + (/^RF-/.test(x.code) ? 'RFc' : x.code) + (x.eq || windy ? ' eq' : '') + '">' + (x.eq ? '= ' : '') + esc(t) + '</span>';
  }).join('') + '</span>';
}
function refHtml(r, a) {
  return '<span class="c-r">' + (a.sb ? 'SB <b>' + fp(a.sb.v, r.unit) + '</b>' : 'SB –') + '<br>' + (a.pb ? 'PB <b>' + fp(a.pb.v, r.unit) + '</b>' : 'PB –') + '</span>';
}

// ---------- photos (fichier Media Sheet : portraits intégrés, utilisables hors connexion) ----------
function photosOn() { return lsGet('cis:photos', true); }
function avatar(a, cls) {
  var p = a.src && a.src.photo;
  if (p && /^(data:image\/|https:\/\/)/.test(p)) return '<img class="av ' + cls + '" src="' + esc(p) + '" alt="" loading="lazy">';
  var w = String(a.name || '').split(' '), up = w.filter(function (x) { return x === x.toUpperCase() && /[A-Z]/.test(x); });
  var ini = ((w[0] || '').charAt(0) + ((up[0] || w[1] || '').charAt(0))).toUpperCase();
  return '<span class="av ini ' + cls + '">' + esc(ini) + '</span>';
}
function ficheUrl(a) { var u = a.src && a.src.url; return u && /^https?:\/\//.test(u) ? u : ''; }
function statsHtml(r, h, a) {
  if (!a._st) a._st = E.topStats(a.src || {}, r.info);
  var st = a._st; if (!st.length) return '';
  var more = st.length - 3;
  return '<small class="stl"><span class="stt">' + st.slice(0, 3).map(function (x) { return '<span class="s-' + x.k + '">' + esc(x.t) + '</span>'; }).join(' · ') + '</span>' +
    (more > 0 ? '<button class="more" data-act="fiche" data-r="' + r.id + '" data-h="' + h.id + '" data-k="' + esc(a.key) + '" aria-label="Voir toutes les stats">+' + more + '</button>' : '') + '</small>';
}
function nameHtml(r, h, a, extra) {
  var parts = String(a.name).split(' '), up = parts.filter(function (w) { return w === w.toUpperCase() && /[A-Z]/.test(w); });
  var pre = parts.slice(0, parts.length - up.length).join(' '), nmH = up.length && pre ? '<span class="pn">' + esc(pre) + '</span><span class="pi">' + esc(pre.charAt(0)) + '.</span> ' + esc(up.join(' ')) : esc(a.name);
  var u = ficheUrl(a), nm = u ? '<a class="nl" href="' + esc(u) + '" target="_blank" rel="noopener">' + nmH + '</a>' : nmH;
  var ph = photosOn() && M && M.rounds.some(function (x) { return x.heats.some(function (y) { return y.ath.some(function (z) { return z.src && z.src.photo; }); }); });
  return '<span class="c-n' + (ph ? ' hasav' : '') + '">' + (ph ? avatar(a, 'avr') : '') + '<b>' + nm + '<button class="fi" data-act="fiche" data-r="' + r.id + '" data-h="' + h.id + '" data-k="' + esc(a.key) + '" aria-label="Fiche de l\'athlète">i</button></b><small><span class="ct">' + esc(a.cat) + '</span> · ' + esc(a.club || a.nat) + '</small>' + statsHtml(r, h, a) + (noteOf(a) ? '<small class="note1">📝 ' + esc(noteOf(a)) + '</small>' : '') + (extra || '') + '</span>';
}
function isEdit(h, a) { return KP && KP.h === h.id && KP.k === a.key; }
function ruleOf(r) { return S.rules[r.id] != null ? S.rules[r.id] : r.qualif; }
function hasQ(r) { return r.type === 'course' && r.phase !== 'Finale'; }

// ---------- rendu général ----------
function renderAll() { renderTop(); renderHor(); renderSuggest(); renderPanels(); renderBanner(); if (KP) renderKp(); }
var lastMinute = -1;
function renderTop() {
  if (!M) { $('#mName').textContent = 'CIS speaker'; $('#mDate').textContent = ''; $('#clockT').textContent = fh(realMin()); $('#clockSim').textContent = ''; return; }
  $('#mName').textContent = M.nom;
  $('#mDate').textContent = (M.date || '') + (M.salle ? ' · salle' : '') + syStatus() + (liveOn() && LIVE_STATE ? ' · ' + LIVE_STATE : '');
  $('#clockT').textContent = fh(Math.floor(nowMin()));
  $('#clockSim').textContent = S.clock && S.clock.sim ? 'heure simulée' : '';
}
// horaire : une ligne par tour, et une ligne par épreuve pour les combinés (quand l'heure est connue)
function dTime(r, i) { var x = (S.dtime || {})[r.id + '_' + i]; var t = x != null ? x : r.cmb[i].time; return t == null ? null : t + (S.off[r.id] || 0); }
function dStatus(r, i) {
  var h = r.heats[0], done = h.ath.length && h.ath.every(function (a) { return cmbDone(r, h, a, i); }), any = h.ath.some(function (a) { return cmbDone(r, h, a, i); });
  if (done || S.done[r.id]) return 'fini'; if (any) return 'encours';
  var t = dTime(r, i), n = nowMin(), du = r.cmb[i].unit === 't' ? 15 : r.cmb[i].jump && r.cmb[i].nom !== 'Longueur' ? 90 : 50;
  if (t == null || n < t) return 'avenir'; return n < t + du ? 'encours' : 'passe';
}
function horEntries() {
  var out = [];
  M.rounds.forEach(function (r) {
    var dd = r.cmb ? r.cmb.map(function (d, i) { return i; }).filter(function (i) { return dTime(r, i) != null; }) : [];
    if (dd.length) dd.forEach(function (i) { out.push({ r: r, d: i, t: dTime(r, i), st: dStatus(r, i) }); });
    else out.push({ r: r, d: null, t: rStart(r), st: status(r) });
  });
  out.sort(function (a, b) { return (a.t == null ? 9999 : a.t) - (b.t == null ? 9999 : b.t); });
  return out;
}
function entryLabel(x) { return x.d == null ? { t: x.r.title, s: x.r.phase } : { t: x.r.cmb[x.d].lab + ' · ' + x.r.title.replace(/ [FH]$/, ''), s: x.r.title + ' · jour ' + x.r.cmb[x.d].day }; }
function renderHor() {
  var el = $('#hor');
  if (!M) { el.innerHTML = ''; return; }
  var n = nowMin(), placed = false, h = '';
  h += '<div class="hctl"><b>Retard</b><button class="btn s" data-act="delay" data-d="-5">−5 min</button><button class="btn s p" data-act="delay" data-d="5">+5 min</button></div>';
  horEntries().forEach(function (x) {
    var r = x.r, t = x.t, st = x.st, pin = (S.pins || []).indexOf(r.id) >= 0 && (x.d == null || String(S.heatSel[r.id]) === String(x.d)), lb = entryLabel(x);
    if (!placed && t != null && t > n) { h += '<div class="nowline">Maintenant ' + fh(n) + '</div>'; placed = true; }
    var off = S.off[r.id] || 0;
    h += '<button class="hi ' + st + (pin ? ' pin' : '') + (x.d != null ? ' sub' : '') + '" data-act="pick" data-r="' + r.id + '"' + (x.d != null ? ' data-d="' + x.d + '"' : '') + '><span class="ht">' + fh(t) + '</span><span class="hn">' + esc(lb.t) +
      '<small>' + esc(lb.s) + (x.d == null && r.heats.length > 1 ? ' · ' + r.heats.length + ' ' + (r.heats[0].label.split(' ')[0].toLowerCase()) + 's' : '') + (off ? ' <span class="off5">' + (off > 0 ? '+' : '') + off + ' min</span>' : '') + '</small></span>' +
      '<span class="st ' + st + '">' + (pin ? '📌 ' : '') + STL[st] + '</span></button>';
  });
  if (!placed) h += '<div class="nowline">Maintenant ' + fh(n) + '</div>';
  el.innerHTML = h;
}
function suggestions() { // tours (ou épreuves de combinés) en cours ou qui commencent dans les 30 min
  var n = nowMin(), seen = {};
  return horEntries().filter(function (x) {
    return x.st === 'encours' || (x.st === 'avenir' && x.t != null && x.t - n <= 30);
  }).filter(function (x) { var k = x.r.id + '|' + x.d; if (seen[k]) return false; seen[k] = 1; return true; });
}
function renderSuggest() {
  var el = $('#suggest');
  if (!M) { el.innerHTML = ''; return; }
  var pins = S.pins || [];
  var sg = suggestions().filter(function (x) { return pins.indexOf(x.r.id) < 0 || (x.d != null && String(S.heatSel[x.r.id]) !== String(x.d)); });
  el.innerHTML = sg.length ? '<b>Maintenant :</b>' + sg.map(function (x) {
    var lb = entryLabel(x);
    return '<button class="chip' + (x.st === 'encours' ? ' hot' : '') + '" data-act="pin" data-r="' + x.r.id + '"' + (x.d != null ? ' data-d="' + x.d + '"' : '') + '>+ ' + esc(lb.t) + (x.d == null ? ' · ' + esc(lb.s) : '') + ' · ' + fh(x.t) + '</button>';
  }).join('') : '';
}
function renderBanner() {
  var b = $('#banner');
  if (S && S.last && !S.last.closed) {
    b.classList.remove('off'); b.classList.toggle('hot', !!S.last.hot);
    $('#bannerTxt').textContent = S.last.txt;
  } else b.classList.add('off');
  document.documentElement.style.setProperty('--bh', b.classList.contains('off') ? '0px' : b.offsetHeight + 'px');
}

function renderPanels() {
  var el = $('#panels');
  if (!M) return welcome();
  var pins = (S.pins || []).filter(function (id) { return ROUNDS[id]; });
  var sc = {};
  el.querySelectorAll('.panel').forEach(function (p) { var b = p.querySelector('.pbody'); if (b) sc[p.dataset.r] = b.scrollTop; });
  el.style.setProperty('--n', Math.min(Math.max(pins.length, 1), 4));
  if (!S.ptab || pins.indexOf(S.ptab) < 0) S.ptab = pins[0] || null;
  if (!pins.length) {
    el.innerHTML = '<div class="empty" style="grid-column:1/-1"><p class="big">Aucune épreuve affichée</p><p>Touche une épreuve dans l\'<b>horaire</b> ou une suggestion « Maintenant » pour l\'afficher ici (jusqu\'à 4 côte à côte sur tablette).</p><button class="btn p" data-act="toggleHor">Ouvrir l\'horaire</button></div>';
  } else {
    el.innerHTML = pins.map(function (id) { return panelHtml(ROUNDS[id]); }).join('');
    el.querySelectorAll('.panel').forEach(function (p) {
      p.classList.toggle('on', p.dataset.r === S.ptab);
      var b = p.querySelector('.pbody'); if (b && sc[p.dataset.r]) b.scrollTop = sc[p.dataset.r];
    });
  }
  $('#ptabs').innerHTML = pins.map(function (id) {
    var r = ROUNDS[id];
    return '<button class="' + (id === S.ptab ? 'on' : '') + '" data-act="ptab" data-r="' + id + '">' + esc(r.title) + '<small>' + esc(r.phase) + ' · ' + fh(rStart(r)) + '</small></button>';
  }).join('');
}

function recChips(r) {
  var pick = [], seen = {};
  r.records.forEach(function (x) {
    if (x.code === 'RM' || x.code === 'RE' || x.code === 'MPM' || x.code === 'MPE') return;
    if (x.code === 'MIN') { if (seen.MIN) return; seen.MIN = 1; }
    pick.push(x);
  });
  if (!pick.length) return '';
  pick.sort(function (a, b) { return a.rank - b.rank; });
  return '<div class="recs" data-act="recs" data-r="' + r.id + '">' + pick.map(function (x) {
    var lab = x.code === 'MIN' ? 'Min' + (/ [AB]$/.test(x.label) ? ' ' + x.label.slice(-1) : '') : /^RF-/.test(x.code) ? 'RF ' + (E.CAT_LABEL[x.code.slice(3)] || '').slice(0, 3) + '.' : x.code;
    return '<span class="rc"><i>' + esc(lab) + '</i>' + fp(x.v, r.unit) + '</span>';
  }).join('') + '</div>';
}
function panelHtml(r) {
  var st = status(r), off = S.off[r.id] || 0;
  var h = '<section class="panel" data-r="' + r.id + '"><div class="phead"><div class="pt"><b>' + esc(r.title) + ' · ' + esc(r.phase) + '</b><small>' +
    fh(rStart(r)) + (off ? ' (' + (off > 0 ? '+' : '') + off + ' min)' : '') + ' · ' + STL[st] + ' · ' + r.heats.reduce(function (s, x) { return s + x.ath.length; }, 0) + ' engagés</small></div>';
  if (hasQ(r)) { var rl = ruleOf(r); h += '<button class="pbtn q' + (rl ? '' : ' miss') + '" data-act="rule" data-r="' + r.id + '">' + (rl ? esc(rl) : 'Qualif ?') + '</button>'; }
  h += '<button class="pbtn" data-act="menu" data-r="' + r.id + '" aria-label="Options">⋯</button><button class="pbtn" data-act="unpin" data-r="' + r.id + '" aria-label="Retirer">✕</button></div>';
  h += recChips(r);
  if (r.type === 'course') h += courseHtml(r);
  else if (r.type === 'horiz') h += horizHtml(r);
  else if (r.type === 'vert') h += vertHtml(r);
  else h += combHtml(r);
  return h + '</section>';
}

// ---------- courses ----------
function laneOf(h, a) { var l = S.lanes[h.id] && S.lanes[h.id][a.key]; return l != null && l !== '' ? l : a.couloir; }
function heatTabs(r, sel, withBilan) {
  if (r.heats.length < 2 && !withBilan) return '';
  return '<div class="htabs">' + r.heats.map(function (h) {
    var ok = heatComplete(r, h);
    return '<button class="htab' + (sel === h.id ? ' on' : '') + (ok ? ' ok' : '') + '" data-act="heat" data-r="' + r.id + '" data-h="' + h.id + '">' + esc(h.label) + (ok ? ' ✓' : '') + '<small>' + (h.est ? '~' : '') + fh(hStart(r, h)) + '</small></button>';
  }).join('') + (withBilan ? '<button class="htab' + (sel === 'bilan' ? ' on' : '') + '" data-act="heat" data-r="' + r.id + '" data-h="bilan">Bilan<small>Q / q</small></button>' : '') + '</div>';
}
function courseHtml(r) {
  var withBilan = hasQ(r) && r.heats.length > 1;
  var sel = S.heatSel[r.id];
  if (!sel || (sel !== 'bilan' && !getH(r, sel)) || (sel === 'bilan' && !withBilan)) {
    sel = (r.heats.filter(function (h) { return !heatComplete(r, h); })[0] || r.heats[r.heats.length - 1]).id;
  }
  var h = heatTabs(r, sel, withBilan);
  if (sel === 'bilan') return h + bilanHtml(r);
  var ht = getH(r, sel), R = S.res[ht.id] || {}, w = S.wind[ht.id];
  var rk = S.sortRank[ht.id] != null ? S.sortRank[ht.id] : heatComplete(r, ht);
  var qm = hasQ(r) ? E.qualify(r, S.res, ruleOf(r)) : null;
  var done = heatCount(r, ht);
  h += '<div class="pinfo"><span class="up">' + esc(ht.label || r.phase) + '</span><span class="nx">' + (ht.est ? '~' : '') + fh(hStart(r, ht)) + ' · ' + done + '/' + ht.ath.length + ' saisis</span><span class="sp"></span>' +
    (r.wind ? '<button class="btn s" data-act="wind" data-r="' + r.id + '" data-h="' + ht.id + '">Vent ' + (w != null ? E.fmtWind(w) : '?') + '</button>' : '') +
    '<button class="btn s" data-act="sort" data-r="' + r.id + '" data-h="' + ht.id + '">' + (rk ? 'Ordre : classement' : 'Ordre : couloirs') + '</button>' +
    '<button class="btn s" data-act="present" data-r="' + r.id + '" data-h="' + ht.id + '">Présenter</button>' + (heatComplete(r, ht) && (r.phase === 'Finale' || r.heats.length === 1) ? '<button class="btn s p" data-act="podium" data-r="' + r.id + '">🏅 Podium</button>' : '') + '</div>';
  var rows = ht.ath.slice();
  var ranking = E.heatRanking(ht, R, r.unit), place = {};
  ranking.forEach(function (x) { place[x.a.key] = x.place; });
  if (rk) {
    var ord = ranking.map(function (x) { return x.a; });
    rows = ord.concat(rows.filter(function (a) { return ord.indexOf(a) < 0; }).sort(function (a, b) { return ((R[a.key] || {}).st ? 1 : 0) - ((R[b.key] || {}).st ? 1 : 0) || (+laneOf(ht, a) || 99) - (+laneOf(ht, b) || 99); }));
  } else rows.sort(function (a, b) { return (+laneOf(ht, a) || 99) - (+laneOf(ht, b) || 99) || a.order - b.order; });
  var body = '<div class="rw hd"><span>' + (r.info.dist > 800 ? 'Ord' : 'Cl') + '</span><span class="c-b">Dos.</span><span>Athlète</span><span class="c-r">SB / PB</span><span style="text-align:right">Temps</span><span class="c-pl" style="font-size:inherit">Pl</span>' + (qm ? '<span style="text-align:center">Q</span>' : '') + '</div>';
  rows.forEach(function (a) {
    var x = R[a.key] || {};
    var cell = x.st ? '<span class="c-p st0">' + x.st + '</span>' : x.v != null ? '<span class="c-p">' + fp(x.v, r.unit) + '</span>' : '<span class="c-p vide">—</span>';
    var q = qm ? E.finalQ(qm, ht.id, a.key, S.qov) : null;
    body += '<div class="rw' + (isEdit(ht, a) ? ' edit' : '') + '" data-act="perf" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '">' +
      '<span class="c-l" data-act="lane" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '">' + esc(laneOf(ht, a) || '–') + '</span>' +
      '<span class="c-b">' + esc(a.dossard) + '</span>' + nameHtml(r, ht, a, x.v != null && !x.st ? pillsHtml(r, a, x.v, w) : '') + refHtml(r, a) + cell +
      '<span class="c-pl">' + (place[a.key] || '') + '</span>' +
      (q ? '<span class="c-q ' + q.v + (q.prov ? ' prov' : '') + (q.manual ? ' man' : '') + (q.tie ? ' tie' : '') + '" data-act="q" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '">' + (q.v || '') + (q.tie ? '=' : '') + '</span>' : '') + '</div>';
  });
  return h + '<div class="pbody course' + (qm ? '' : ' fin') + '">' + body + '</div>';
}
function qualifiedList(r) {
  var qm = E.qualify(r, S.res, ruleOf(r)), out = [];
  r.heats.forEach(function (h) {
    var R = S.res[h.id] || {};
    h.ath.forEach(function (a) { var q = E.finalQ(qm, h.id, a.key, S.qov), x = R[a.key] || {}; if (q.v === 'Q' || q.v === 'q') out.push({ h: h, a: a, q: q.v, v: x.v }); });
  });
  out.sort(function (x, y) { return (x.q === y.q ? 0 : x.q === 'Q' ? -1 : 1) || E.cmp(x.v == null ? 1e9 : x.v, y.v == null ? 1e9 : y.v, r.unit); });
  return { list: out, complete: qm._complete };
}
function finOf(r) { return M.rounds.filter(function (x) { return x !== r && x.title === r.title && x.phase === 'Finale' && !x.fromRound; })[0]; } // finale déjà dans le programme importé
function bilanHtml(r) {
  var qm = E.qualify(r, S.res, ruleOf(r)), all = [];
  r.heats.forEach(function (h) { var R = S.res[h.id] || {}; h.ath.forEach(function (a) { var x = R[a.key] || {}; all.push({ h: h, a: a, v: x.v, st: x.st, w: S.wind[h.id] }); }); });
  var ok = all.filter(function (x) { return x.v != null && !x.st; }).sort(function (x, y) { return E.cmp(x.v, y.v, r.unit); });
  var rest = all.filter(function (x) { return !(x.v != null && !x.st); });
  var ql = qualifiedList(r), nQ = ql.list.filter(function (x) { return x.q === 'Q'; }).length, nq = ql.list.length - nQ;
  var fin = (S.finals || []).filter(function (f) { return f.from === r.id; })[0];
  var h = '<div class="pinfo"><span class="up">Bilan des ' + esc(r.phase.toLowerCase()) + '</span><span class="nx">' + nQ + ' Q + ' + nq + ' q' + (ql.complete ? '' : ' (provisoire)') + '</span><span class="sp"></span>' +
    (fin ? '<button class="btn s p" data-act="pin" data-r="f' + r.id + '">Voir la finale</button>' : finOf(r) ? '<button class="btn s p" data-act="pin" data-r="' + finOf(r).id + '">Voir la finale</button>' : ruleOf(r) && ql.list.length ? '<button class="btn s p" data-act="mkfinal" data-r="' + r.id + '">Créer la finale</button>' : '') + '</div>';
  var body = '<div class="rw hd"><span>Pl</span><span>Athlète</span><span class="c-r">SB / PB</span><span style="text-align:right">Temps</span><span style="text-align:center">Q</span></div>';
  var place = 0;
  ok.forEach(function (x, i) {
    place = i > 0 && ok[i - 1].v === x.v ? place : i + 1;
    var q = E.finalQ(qm, x.h.id, x.a.key, S.qov);
    body += '<div class="rw" data-act="heat" data-r="' + r.id + '" data-h="' + x.h.id + '"><span class="c-pl">' + place + '</span>' + nameHtml(r, x.h, x.a, '<small>' + esc(x.h.label) + (x.w != null ? ' · vent ' + E.fmtWind(x.w) : '') + '</small>' + pillsHtml(r, x.a, x.v, x.w)) + refHtml(r, x.a) +
      '<span class="c-p">' + fp(x.v, r.unit) + '</span><span class="c-q ' + q.v + (q.prov ? ' prov' : '') + (q.manual ? ' man' : '') + (q.tie ? ' tie' : '') + '" data-act="q" data-r="' + r.id + '" data-h="' + x.h.id + '" data-k="' + esc(x.a.key) + '">' + (q.v || '') + (q.tie ? '=' : '') + '</span></div>';
  });
  if (rest.length) body += '<div class="sec">Sans temps (' + rest.length + ')</div>' + rest.map(function (x) {
    return '<div class="rw" data-act="heat" data-r="' + r.id + '" data-h="' + x.h.id + '"><span class="c-pl"></span>' + nameHtml(r, x.h, x.a, '<small>' + esc(x.h.label) + '</small>') + refHtml(r, x.a) + '<span class="c-p ' + (x.st ? 'st0' : 'vide') + '">' + (x.st || '—') + '</span><span></span></div>';
  }).join('');
  if (!ruleOf(r)) body = '<div class="empty">Indique la règle de qualification (bouton « Qualif ? » en haut) pour calculer les Q et q.</div>' + body;
  return h + '<div class="pbody bilan">' + body + '</div>';
}

// ---------- concours horizontaux ----------
function nextIdx(ess) { ess = ess || []; for (var i = 0; i < 6; i++) if (!ess[i]) return i; return 6; }
function essTxt(e, r) { if (!e) return ''; if (e.r === 'X') return 'X'; if (e.r === '-') return '–'; return e.v != null ? fp(e.v, r.unit).replace(/^(\d+)m/, '$1,') : ''; }
function horizHtml(r) {
  var ht = r.heats[0], X = S.ess[ht.id] || {}, st = E.horizState(ht, X), rk = E.horizRanking(ht, X);
  var byPass = S.sortRank[ht.id] === false;
  var fin = st.finalists, hide = !!S.hide[r.id];
  var h = '<div class="pinfo">' + (st.round <= 6 ? '<span class="up">Essai ' + st.round + '/6</span>' : '<span class="up">Concours terminé</span>') +
    (st.next ? '<span class="up"><i>À l\'essai :</i> ' + esc(st.next.name) + '</span>' : '') + (st.after ? '<span class="nx">Suivant : ' + esc(st.after.name) + '</span>' : '') +
    (fin && ht.ath.length > 8 ? '<span class="nx">' + fin.length + ' en finale</span>' : '') + '<span class="sp"></span>' +
    '<button class="btn s" data-act="sort" data-r="' + r.id + '" data-h="' + ht.id + '">' + (byPass ? 'Ordre : passage' : 'Ordre : classement') + '</button>' +
    (fin && ht.ath.length > 8 ? '<button class="btn s" data-act="hide" data-r="' + r.id + '">' + (hide ? 'Afficher éliminés' : 'Masquer éliminés') + '</button>' : '') +
    '<button class="btn s" data-act="present" data-r="' + r.id + '" data-h="' + ht.id + '">Présenter</button>' + (X && Object.keys(X).length ? '<button class="btn s' + (st.round > 6 ? ' p' : '') + '" data-act="podium" data-r="' + r.id + '">🏅 Podium</button>' : '') +
    (st.next ? '<span class="need">' + needHoriz(r, ht, X, st.next) + '</span>' : '') + '</div>';
  var rows;
  if (byPass) { rows = st.order.map(function (a) { return rk.filter(function (x) { return x.a === a; })[0]; }); rk.forEach(function (x) { if (rows.indexOf(x) < 0) rows.push(x); }); }
  else rows = rk;
  var body = '<div class="rw hd"><span>Pl</span><span>Athlète</span>' + [1, 2, 3, 4, 5, 6].map(function (i) { return '<span class="ess' + (i > 3 ? ' r46' : ' r13') + ' e' + (i - 1) + '">' + i + '</span>'; }).join('') + '<span style="text-align:right">Meilleur</span></div>';
  rows.forEach(function (x) {
    var a = x.a, ess = X[a.key] || [], out = fin && st.round > 3 && fin.indexOf(a.key) < 0;
    if (out && hide) return;
    var best = x.marks[0], bi = -1;
    ess.forEach(function (e, i) { if (e && e.v != null && e.v === best && bi < 0) bi = i; });
    var bw = bi >= 0 ? ess[bi].w : null;
    var cells = '';
    for (var i = 0; i < 6; i++) {
      var e = ess[i], cur = st.next === a && i === nextIdx(ess);
      cells += '<span class="ess e' + i + (i > 2 ? ' r46' : ' r13') + (e && e.r === 'X' ? ' x' : '') + (i === bi ? ' b' : '') + (cur ? ' cur' : '') + (out && i > 2 ? ' na' : '') + '" data-act="ess" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '" data-i="' + i + '">' + essTxt(e, r) + (e && e.w != null ? '<small>' + E.fmtWind(e.w) + '</small>' : '') + '</span>';
    }
    body += '<div class="rw' + (st.next === a ? ' cur' : st.after === a ? ' nxt' : '') + (out ? ' out' : '') + (isEdit(ht, a) ? ' edit' : '') + '" data-act="ess" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '">' +
      '<span class="c-pl">' + (x.place || '') + '</span>' + nameHtml(r, ht, a, '<small>SB ' + (a.sb ? fp(a.sb.v, r.unit) : '–') + ' · PB ' + (a.pb ? fp(a.pb.v, r.unit) : '–') + '</small>' +
        '<small class="esl">' + (ess.filter(Boolean).length ? ess.map(function (e) { return e ? essTxt(e, r) : '·'; }).join('  ') : 'pas encore d\'essai') + '</small>' + pillsHtml(r, a, best, bw)) +
      cells + '<span class="best">' + (best != null ? fp(best, r.unit) : '') + '</span></div>';
  });
  return h + '<div class="pbody horiz win' + Math.max(0, Math.min(3, st.round - 3)) + '">' + body + '</div>';
}

// ---------- concours verticaux ----------
function vObj(hid) { return S.vert[hid] || { bars: [], cur: 0, m: {} }; }
function marksTxt(s) { return String(s || '').replace(/-/g, '–'); }
function vertHtml(r) {
  var ht = r.heats[0], V = vObj(ht.id), st = E.vertState(ht, V), rk = E.vertRanking(ht, V), hide = !!S.hide[r.id];
  var bars = V.bars, cur = V.cur;
  var from = Math.max(0, cur - 2), cols = bars.slice(from, cur + 1);
  if (cols.length < 3 && bars.length > cur + 1) cols = bars.slice(from, Math.min(bars.length, from + 3));
  var h = '<div class="pinfo">';
  if (!bars.length) h += '<span class="up">Aucune barre</span><span class="sp"></span><button class="btn s p" data-act="bar" data-r="' + r.id + '" data-h="' + ht.id + '">Saisir la 1re barre</button>';
  else h += '<button class="btn s" data-act="barNav" data-d="-1" data-r="' + r.id + '" data-h="' + ht.id + '"' + (cur > 0 ? '' : ' disabled') + '>◀</button><span class="up">Barre ' + fp(st.bar, 'm') + '</span><button class="btn s" data-act="barNav" data-d="1" data-r="' + r.id + '" data-h="' + ht.id + '"' + (cur < bars.length - 1 ? '' : ' disabled') + '>▶</button>' +
    '<button class="btn s" data-act="bar" data-r="' + r.id + '" data-h="' + ht.id + '">+ barre</button>' +
    (st.next ? '<span class="up"><i>Au saut :</i> ' + esc(st.next.name) + '</span>' : '<span class="nx">Barre terminée</span>') + (st.after ? '<span class="nx">Suivant : ' + esc(st.after.name) + '</span>' : '') +
    '<span class="nx">' + st.inLice + ' en lice</span><span class="sp"></span><button class="btn s" data-act="hide" data-r="' + r.id + '">' + (hide ? 'Afficher éliminés' : 'Masquer éliminés') + '</button>' +
    '<button class="btn s" data-act="present" data-r="' + r.id + '" data-h="' + ht.id + '">Présenter</button><button class="btn s' + (st.inLice === 0 ? ' p' : '') + '" data-act="podium" data-r="' + r.id + '">🏅 Podium</button>' +
    (st.next ? '<span class="need">' + needVert(r, ht, V, st.next, st.bar) + '</span>' : '');
  h += '</div>';
  if (rk.tieFirst && (st.inLice === 0 || S.done[r.id])) h += '<div class="sec" style="color:var(--red)">Égalité pour la 1re place : barrage à prévoir</div>';
  var body = '<div class="rw hd"><span>Pl</span><span>Athlète</span>' + cols.map(function (b) { return '<span class="ess bar' + (b === st.bar ? ' on' : '') + '">' + fp(b, 'm') + '</span>'; }).join('') + '<span style="text-align:right">Meilleure</span><span class="c-f" style="text-align:center">Éch.</span></div>';
  rk.forEach(function (x) {
    var a = x.a, m = V.m[a.key] || {};
    if (x.out && hide && st.inLice > 0) return;
    if (st.inLice === 0) x = Object.assign({}, x, { out: false }); // concours fini : plus de « éliminé »
    body += '<div class="rw' + (st.next === a ? ' cur' : st.after === a ? ' nxt' : '') + (x.out ? ' out' : '') + (isEdit(ht, a) ? ' edit' : '') + '" data-act="vt" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '">' +
      '<span class="c-pl">' + (x.place || '') + '</span>' + nameHtml(r, ht, a, '<small>SB ' + (a.sb ? fp(a.sb.v, 'm') : '–') + ' · PB ' + (a.pb ? fp(a.pb.v, 'm') : '–') + (x.out ? ' · <b style="color:var(--red)">éliminé</b>' : '') + '</small>' + pillsHtml(r, a, x.best, null)) +
      cols.map(function (b) { var s = m[b] || ''; return '<span class="ess' + (b === st.bar ? ' on' : '') + (/XXX/.test(s) ? ' x' : /O/.test(s) ? ' b' : '') + '">' + marksTxt(s) + '</span>'; }).join('') +
      '<span class="best">' + (x.best != null ? fp(x.best, 'm') : '') + '</span><span class="c-f" style="text-align:center">' + (x.allFails || '') + '</span></div>';
  });
  return h + '<div class="pbody vert" style="--nb:' + Math.max(cols.length, 1) + '">' + body + '</div>';
}

// ---------- épreuves combinées (total de points) ----------
function combRanking(r, h) {
  var rows = h.ath.map(function (a) { var t = cmbTotal(r, h, a); return { a: a, t: t.t, n: t.n }; });
  var ranked = rows.filter(function (x) { return x.n; }).sort(function (x, y) { return y.t - x.t || x.a.order - y.a.order; });
  ranked.forEach(function (x, i) { x.place = i && ranked[i - 1].t === x.t ? ranked[i - 1].place : i + 1; });
  return ranked.concat(rows.filter(function (x) { return !x.n; }));
}
function cmbPerfTxt(d, x) { return !x ? '' : x.st ? x.st : fp(x.v, d.unit); }
function combHtml(r) {
  if (!r.cmb) return combTotalHtml(r);
  var ht = r.heats[0], sel = S.heatSel[r.id];
  if (sel == null || sel === '' || (sel !== 'cl' && !r.cmb[+sel])) {
    var curD = r.cmb.map(function (d, i) { return i; }).filter(function (i) { return dStatus(r, i) === 'encours'; })[0];
    sel = curD != null ? String(curD) : 'cl';
  }
  var tabs = '<div class="htabs">' + r.cmb.map(function (d, i) {
    var ok = ht.ath.every(function (a) { return cmbDone(r, ht, a, i); });
    return '<button class="htab' + (String(sel) === String(i) ? ' on' : '') + (ok ? ' ok' : '') + '" data-act="heat" data-r="' + r.id + '" data-h="' + i + '">' + esc(d.short) + (ok ? ' ✓' : '') + '<small>J' + d.day + '</small></button>';
  }).join('') + '<button class="htab' + (sel === 'cl' ? ' on' : '') + '" data-act="heat" data-r="' + r.id + '" data-h="cl">Classement<small>total</small></button></div>';
  if (sel === 'cl') {
    var rk = combRanking(r, ht), nMax = Math.max.apply(null, rk.map(function (x) { return x.n; }).concat([0]));
    var warn = r.cmbJeunes ? '<div class="sec" style="color:var(--red);text-transform:none">Catégorie jeunes : les tables de cotation jeunes ne sont pas encore intégrées, points calculés avec les tables adultes (indicatifs).</div>' : '';
    var h = warn + '<div class="pinfo"><span class="up">Classement ' + (nMax ? 'après ' + nMax + ' épreuve' + (nMax > 1 ? 's' : '') : '') + '</span><span class="nx">' + r.cmb.length + ' épreuves · touche une épreuve pour saisir</span><span class="sp"></span>' +
      '<button class="btn s" data-act="present" data-r="' + r.id + '" data-h="' + ht.id + '">Présenter</button>' + (nMax ? '<button class="btn s' + (nMax === r.cmb.length ? ' p' : '') + '" data-act="podium" data-r="' + r.id + '">🏅 Podium</button>' : '') + '</div>';
    var body = '<div class="rw hd"><span>Pl</span><span>Athlète · perfs</span><span style="text-align:right">Points</span></div>';
    rk.forEach(function (x) {
      var a = x.a, c = cmbOf(ht, a);
      var chips = '<span class="cchips">' + r.cmb.map(function (d, i) { var e = c[i]; return '<span class="cc' + (e ? '' : ' vide') + '"><i>' + esc(d.short) + '</i>' + (e ? esc(cmbPerfTxt(d, e)) : '—') + '</span>'; }).join('') + '</span>';
      var fin = x.n === r.cmb.length;
      body += '<div class="rw"><span class="c-pl">' + (x.place || '') + '</span>' + nameHtml(r, ht, a, chips + (fin ? pillsHtml(r, a, x.t, null) : '')) +
        '<span class="c-p' + (x.n ? '' : ' vide') + '">' + (x.n ? E.fmtPerf(x.t, 'pts').replace(' pts', '') : '—') + '<small class="cn">' + (x.n ? x.n + '/' + r.cmb.length : '') + '</small></span></div>';
    });
    return tabs + h + '<div class="pbody cmbcl">' + body + '</div>';
  }
  var d = r.cmb[+sel], di = +sel;
  var rows = ht.ath.slice(), pts = {};
  rows.forEach(function (a) { var x = cmbOf(ht, a)[di]; pts[a.key] = x && x.v != null ? E.combPoints(d, x.v) : null; });
  var ord = rows.filter(function (a) { return pts[a.key] != null; }).sort(function (a, b) { return pts[b.key] - pts[a.key]; }), place = {};
  ord.forEach(function (a, i) { place[a.key] = i && pts[ord[i - 1].key] === pts[a.key] ? place[ord[i - 1].key] : i + 1; });
  // ordre d'affichage : général (total), épreuve (points de l'épreuve) ou passage (liste de départ)
  var mode = S.sortRank['c' + r.id + di]; if (mode !== 'gen' && mode !== 'ord') mode = 'epr';
  var gen = combRanking(r, ht), gpl = {}, gpos = {}; gen.forEach(function (x, i) { gpl[x.a.key] = x.place; gpos[x.a.key] = i; });
  var startOrd = ht.ath.slice().sort(function (a, b) { return (+a.couloir || 99) - (+b.couloir || 99) || a.order - b.order; });
  var todo = startOrd.filter(function (a) { return !cmbDone(r, ht, a, di); }), nxt = todo[0], aft = todo[1];
  if (mode === 'epr') rows = ord.concat(rows.filter(function (a) { return ord.indexOf(a) < 0; }));
  else if (mode === 'ord') rows = startOrd;
  else rows = gen.map(function (x) { return x.a; });
  var LAB = { gen: 'Ordre : classement général', epr: 'Ordre : classement de l\'épreuve', ord: 'Ordre : passage' };
  var h2 = '<div class="pinfo"><span class="up">' + esc(d.lab) + '</span>' + (nxt ? '<span class="up"><i>À suivre :</i> ' + esc(nxt.name) + '</span>' + (aft ? '<span class="nx">Ensuite : ' + esc(aft.name) + '</span>' : '') : '<span class="nx">épreuve terminée</span>') +
    '<span class="nx">jour ' + d.day + ' · ' + ord.length + '/' + ht.ath.length + ' saisis</span><span class="sp"></span>' +
    '<button class="btn s" data-act="dtime" data-r="' + r.id + '" data-d="' + di + '">' + (dTime(r, di) != null ? fh(dTime(r, di)) : 'Heure ?') + ' ✎</button>' +
    '<button class="btn s" data-act="sortc" data-r="' + r.id + '" data-d="' + di + '">' + LAB[mode] + '</button></div>';
  var body2 = '<div class="rw hd"><span title="classement de l\'épreuve">Pl.</span><span title="ordre de passage">Ord.</span><span>Athlète</span><span class="c-r">SB / PB</span><span style="text-align:right">Perf</span><span style="text-align:right">Pts</span></div>';
  rows.forEach(function (a) {
    var x = cmbOf(ht, a)[di], ref = a.cref ? a.cref[di] : {}, aa = { pb: ref.pb, sb: ref.sb };
    var pl = '';
    if (x && x.v != null) { var al = E.alertsFor({ unit: d.unit, records: [], type: 'x' }, aa, x.v, x.w).filter(function (z) { return !z.weak && (z.code === 'PB' || z.code === 'SB'); }); pl = al.length ? '<span class="pills">' + al.map(function (z) { return '<span class="pill ' + z.code + (z.eq ? ' eq' : '') + '">' + (z.eq ? '= ' : '') + z.code + '</span>'; }).join('') + '</span>' : ''; }
    var ep = gpl[a.key] ? '<small class="cn">' + gpl[a.key] + (gpl[a.key] === 1 ? 'er' : 'e') + ' au général</small>' : '';
    body2 += '<div class="rw' + (KP && KP.mode === 'cmb' && KP.k === a.key && KP.d === di ? ' edit' : nxt === a ? ' cur' : aft === a ? ' nxt' : '') + '" data-act="cperf" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '" data-d="' + di + '"><span class="c-pl">' + (place[a.key] || '') + '</span>' +
      '<span class="c-l">' + esc(a.couloir || (a.order + 1)) + '</span>' +
      nameHtml(r, ht, a, pl) + '<span class="c-r">SB <b>' + (ref.sb ? fp(ref.sb.v, d.unit) : '–') + '</b><br>PB <b>' + (ref.pb ? fp(ref.pb.v, d.unit) : '–') + '</b></span>' +
      '<span class="c-p' + (x ? (x.st ? ' st0' : '') : ' vide') + '">' + (x ? esc(cmbPerfTxt(d, x)) + (x.w != null ? '<small class="cn">' + E.fmtWind(x.w) + '</small>' : '') : '—') + '</span>' +
      '<span class="c-pts">' + (pts[a.key] != null ? pts[a.key] : '') + ep + '</span></div>';
  });
  return tabs + h2 + '<div class="pbody cmbd">' + body2 + '</div>';
}
function combTotalHtml(r) {
  var ht = r.heats[0], R = S.res[ht.id] || {}, rk = E.heatRanking(ht, R, 'pts'), place = {};
  rk.forEach(function (x) { place[x.a.key] = x.place; });
  var rows = rk.map(function (x) { return x.a; }); ht.ath.forEach(function (a) { if (rows.indexOf(a) < 0) rows.push(a); });
  var h = '<div class="pinfo"><span class="nx">Saisis le total de points de chaque athlète après chaque épreuve.</span></div>';
  var body = '<div class="rw hd"><span>Pl</span><span class="c-b">Dos.</span><span>Athlète</span><span class="c-r">SB / PB</span><span style="text-align:right">Points</span></div>';
  rows.forEach(function (a) {
    var x = R[a.key] || {};
    body += '<div class="rw' + (isEdit(ht, a) ? ' edit' : '') + '" data-act="perf" data-r="' + r.id + '" data-h="' + ht.id + '" data-k="' + esc(a.key) + '"><span class="c-pl">' + (place[a.key] || '') + '</span><span class="c-b">' + esc(a.dossard) + '</span>' +
      nameHtml(r, ht, a, x.v != null ? pillsHtml(r, a, x.v, null) : '') + refHtml(r, a) + '<span class="c-p' + (x.v == null ? ' vide' : '') + '">' + (x.v != null ? fp(x.v, 'pts').replace(' pts', '') : '—') + '</span></div>';
  });
  return h + '<div class="pbody comb">' + body + '</div>';
}

// ---------- pavé de saisie ----------
var KEYS = {
  perf: [['7'], ['8'], ['9'], ['⌫', 'del'], ['4'], ['5'], ['6'], ['DNS', 'DNS', 'r t'], ['1'], ['2'], ['3'], ['DNF', 'DNF', 'r t'], ['🎤', 'mic'], ['0'], ['Effacer', 'clr', 't'], ['DQ', 'DQ', 'r t'], ['Fermer', 'close', 'w t'], ['OK', 'ok', 'w ok']],
  pts: [['7'], ['8'], ['9'], ['⌫', 'del'], ['4'], ['5'], ['6'], ['Effacer', 'clr', 't'], ['1'], ['2'], ['3'], ['🎤', 'mic'], ['0', '0', 'w'], ['Fermer', 'close', 't'], ['OK', 'ok', 'ok']],
  ess: [['7'], ['8'], ['9'], ['⌫', 'del'], ['4'], ['5'], ['6'], ['X', 'X', 'r'], ['1'], ['2'], ['3'], ['–', '-', 'r'], ['🎤', 'mic'], ['0'], ['Effacer', 'clr', 't'], ['±', 'sign', 't'], ['Fermer', 'close', 'w t'], ['OK', 'ok', 'w ok']],
  vt: [['O', 'O', 'w g'], ['X', 'X', 'w r'], ['–', '-', 'w'], ['⌫ dernier', 'del', 'w t'], ['Effacer la barre', 'clr', 'w t'], ['🎤 Dicter', 'mic', 'w t'], ['Fermer', 'close', 'w t'], ['+ barre', 'newbar', 'w t']],
  cmbt: [['7'], ['8'], ['9'], ['⌫', 'del'], ['4'], ['5'], ['6'], ['DNS', 'DNS', 'r t'], ['1'], ['2'], ['3'], ['DNF', 'DNF', 'r t'], ['🎤', 'mic'], ['0'], ['Effacer', 'clr', 't'], ['DQ', 'DQ', 'r t'], ['±', 'sign', 't'], ['Fermer', 'close', 't'], ['OK', 'ok', 'w ok']],
  cmbm: [['7'], ['8'], ['9'], ['⌫', 'del'], ['4'], ['5'], ['6'], ['NM', 'NM', 'r t'], ['1'], ['2'], ['3'], ['DNS', 'DNS', 'r t'], ['🎤', 'mic'], ['0'], ['Effacer', 'clr', 't'], ['±', 'sign', 't'], ['Fermer', 'close', 'w t'], ['OK', 'ok', 'w ok']],
  num: [['7'], ['8'], ['9'], ['⌫', 'del'], ['4'], ['5'], ['6'], ['Effacer', 'clr', 't'], ['1'], ['2'], ['3'], ['±', 'sign', 't'], ['0', '0', 'w'], ['Fermer', 'close', 't'], ['OK', 'ok', 'ok']]
};
function openKp(o) {
  KP = o; KP.f = 1; KP.raw = o.raw || ''; KP.w = o.w || ''; KP.sign = o.sign || 1; KP.st = o.st || '';
  pushLayer('kp'); renderKp();
  $('#kp').classList.remove('off'); document.body.classList.add('kpon');
  setTimeout(function () {
    var kb = $('#kp').getBoundingClientRect();
    document.documentElement.style.setProperty('--kph', kb.width < window.innerWidth - 20 ? '0px' : kb.height + 'px');
    renderPanels();
    scrollRow();
  }, 0);
}
function closeKp(fromPop) {
  if (!KP) return;
  KP = null; $('#kp').classList.add('off'); document.body.classList.remove('kpon');
  document.documentElement.style.setProperty('--kph', '0px');
  if (REC) try { REC.stop(); } catch (e) { }
  if (!fromPop) popLayer('kp');
  renderPanels();
}
function kpRound() { return ROUNDS[KP.r]; }
function renderKp() {
  var r = kpRound(), h = getH(r, KP.h), a = KP.k ? getA(h, KP.k) : null, m = KP.mode;
  var cd = m === 'cmb' ? r.cmb[KP.d] : null;
  var keys = m === 'perf' ? (r.type === 'comb' ? KEYS.pts : KEYS.perf) : m === 'cmb' ? (cd.unit === 't' ? KEYS.cmbt : KEYS.cmbm) : m === 'ess' ? KEYS.ess : m === 'vt' ? KEYS.vt : KEYS.num;
  if (m === 'cmb' && !cd.wind) keys = keys.map(function (k) { return k[1] === 'sign' ? ['', 'none', 't'] : k; });
  if (m === 'ess' && !r.wind) keys = keys.map(function (k) { return k[1] === 'sign' ? ['', 'none', 't'] : k; });
  if ((m === 'bar' || m === 'lane' || m === 'time') ) keys = keys.map(function (k) { return k[1] === 'sign' ? ['', 'none', 't'] : k; });
  $('#kpKeys').innerHTML = keys.map(function (k) { return '<button data-act="key" data-k="' + esc(k[1] || k[0]) + '" class="' + (k[2] || '') + (k[1] === 'mic' && REC ? ' rec' : '') + '"' + (k[1] === 'none' ? ' disabled style="visibility:hidden"' : '') + '>' + esc(k[0]) + '</button>'; }).join('');
  var ctx = '', info = '', l1 = 'Perf', v1 = '', showF2 = false;
  var title = esc(r.title) + ' · ' + esc(h.label || r.phase);
  if (a) ctx = '<button class="btn s kfi" data-act="fiche" data-r="' + r.id + '" data-h="' + h.id + '" data-k="' + esc(a.key) + '">Fiche</button><b>' + (r.type === 'course' && laneOf(h, a) ? 'C' + esc(laneOf(h, a)) + ' · ' : '') + esc(a.name) + '</b><small>' + title + ' · ' + esc(a.cat) + ' · dossard ' + esc(a.dossard) + '</small>';
  else ctx = '<b>' + title + '</b>';
  var aim = function () {
    var t = [];
    if (a && a.sb) t.push('SB <b>' + fp(a.sb.v, r.unit) + '</b>');
    if (a && a.pb) t.push('PB <b>' + fp(a.pb.v, r.unit) + '</b>' + (a.pb.y ? ' (' + esc(a.pb.y) + ')' : ''));
    var rc = r.records.filter(function (x) { return (x.code === 'RCH' || x.code === 'MIN' || /^RF/.test(x.code)) && (x.cat === 'ALL' || (a && x.cat === a.catk)); });
    rc.slice(0, 4).forEach(function (x) { t.push(esc(x.code === 'MIN' ? x.label.replace(/^minima /, 'min. ') : x.code) + ' ' + fp(x.v, r.unit)); });
    return t.join(' · ');
  };
  if (m === 'perf') {
    l1 = r.type === 'comb' ? 'Points' : 'Temps'; v1 = KP.st || E.rawPreview(KP.raw, r.unit) || '<span style="color:#b6c2c8">' + (r.type === 'comb' ? '0' : '0"00') + '</span>';
    info = aim() + (r.type === 'course' ? '<br><small>Tape les chiffres à la suite : 2312 → 23"12 · 15230 → 1\'52"30</small>' : '');
  } else if (m === 'cmb') {
    var ref = (a.cref || [])[KP.d] || {}, tot = cmbTotal(r, h, a), pv = KP.st ? null : E.rawToValue(KP.raw, cd.unit);
    l1 = cd.lab; v1 = KP.st || E.rawPreview(KP.raw, cd.unit) || '<span style="color:#b6c2c8">' + (cd.unit === 't' ? '0"00' : '0m00') + '</span>';
    showF2 = cd.wind;
    info = (ref.sb ? 'SB <b>' + fp(ref.sb.v, cd.unit) + '</b> · ' : '') + (ref.pb ? 'PB <b>' + fp(ref.pb.v, cd.unit) + '</b> · ' : '') + 'Total actuel <b>' + tot.t + ' pts</b> (' + tot.n + '/' + r.cmb.length + ')' +
      (pv != null ? '<br>Cette perf vaut <b>' + E.combPoints(cd, pv) + ' pts</b>' : '') + '<br><small>' + (cd.unit === 't' ? '2428 → 24"28 · 21274 → 2\'12"74' : '752 → 7m52 · 181 → 1m81 · NM = aucune marque') + '</small>';
  } else if (m === 'ess') {
    l1 = 'Essai ' + (KP.i + 1); v1 = KP.st ? (KP.st === 'X' ? 'X (mordu)' : '– (passe)') : (E.rawPreview(KP.raw, 'm') || '<span style="color:#b6c2c8">0m00</span>');
    showF2 = r.wind;
    var mk = E.horizRanking(h, S.ess[h.id] || {}).filter(function (x) { return x.a === a; })[0];
    info = (mk && mk.marks.length ? 'Meilleur ici <b>' + fp(mk.marks[0], 'm') + '</b> · ' : '') + aim() + '<br><small>Chiffres : 752 → 7m52 · X = mordu · – = passe</small>';
  } else if (m === 'vt') {
    var V = vObj(h.id), bar = V.bars[V.cur], mm = (V.m[a.key] || {});
    l1 = 'Barre ' + fp(bar, 'm'); v1 = marksTxt(mm[bar]) || '<span style="color:#b6c2c8">…</span>';
    info = V.bars.filter(function (b) { return mm[b]; }).map(function (b) { return fp(b, 'm') + ' <b>' + marksTxt(mm[b]) + '</b>'; }).join(' · ') + (aim() ? '<br>' + aim() : '');
  } else if (m === 'wind') { l1 = 'Vent (m/s)'; v1 = KP.raw ? (KP.sign < 0 ? '−' : '+') + (+KP.raw / 10).toFixed(1) : '<span style="color:#b6c2c8">+0.0</span>'; info = 'Tape 12 pour +1.2 ; ± pour un vent négatif. Au-delà de +2.0 : perfs non homologables pour les records.'; }
  else if (m === 'bar') { l1 = 'Nouvelle barre'; v1 = E.rawPreview(KP.raw, 'm') || '<span style="color:#b6c2c8">0m00</span>'; info = 'En centimètres : 570 → 5m70.' + (KP.hint ? '<br>' + KP.hint : ''); }
  else if (m === 'lane') { l1 = 'Couloir'; v1 = KP.raw || '<span style="color:#b6c2c8">–</span>'; info = 'Numéro de couloir pour la finale.'; }
  else if (m === 'time') { l1 = 'Nouvelle heure'; v1 = KP.raw.length >= 3 ? fh(+KP.raw.slice(0, -2) * 60 + +KP.raw.slice(-2)) : (KP.raw || '<span style="color:#b6c2c8">14h05</span>'); info = 'Heure en 4 chiffres : 1405 → 14h05.'; }
  $('#kpCtx').innerHTML = ctx; $('#kpL1').textContent = l1; $('#kpV1').innerHTML = v1; $('#kpInfo').innerHTML = info;
  $('#kpF2').classList.toggle('hide', !showF2);
  $('#kpF1').classList.toggle('on', KP.f === 1); $('#kpF2').classList.toggle('on', KP.f === 2);
  $('#kpV2').innerHTML = KP.w ? (KP.sign < 0 ? '−' : '+') + (+KP.w / 10).toFixed(1) : '<span style="color:#b6c2c8">—</span>';
}
function kpKey(k) {
  vib();
  var r = kpRound(), m = KP.mode;
  if (k === 'close') return closeKp();
  if (k === 'mic') return dicter();
  if (m === 'vt') return vtKey(k);
  if (k === 'ok') return kpOk();
  if (k === 'X' || k === '-' ) { if (m === 'ess') { KP.st = k; KP.raw = ''; return kpOk(); } }
  if (k === 'DNS' || k === 'DNF' || k === 'DQ' || k === 'NM') { KP.st = KP.st === k ? '' : k; KP.raw = ''; return kpOk(); }
  if (k === 'sign') { KP.sign = -KP.sign; return renderKp(); }
  if (k === 'newbar') return;
  var fld = KP.f === 2 ? 'w' : 'raw';
  if (k === 'clr') { KP[fld] = ''; KP.st = ''; return renderKp(); }
  if (k === 'del') { KP[fld] = String(KP[fld]).slice(0, -1); return renderKp(); }
  if (/^\d$/.test(k)) {
    KP.st = '';
    var max = fld === 'w' ? 2 : m === 'lane' ? 2 : m === 'time' ? 4 : m === 'cmb' ? (r.cmb[KP.d].unit === 't' ? 7 : 4) : r.unit === 'pts' ? 5 : 7;
    if (String(KP[fld]).length < max) KP[fld] = String(KP[fld]) + k;
    if (m === 'wind') KP.raw = KP.raw;
    renderKp();
  }
}
function heatText(r, h) { return r.title + (h.label && h.label !== r.phase ? ' ' + h.label : r.phase === 'Finale' ? ' finale' : '') ; }
function kpOk() {
  var r = kpRound(), h = getH(r, KP.h), a = KP.k ? getA(h, KP.k) : null, m = KP.mode, t = Date.now();
  if (m === 'perf') {
    var v = KP.st ? null : (r.type === 'comb' ? (KP.raw ? +KP.raw : null) : E.rawToValue(KP.raw, r.unit));
    if (!KP.st && KP.raw && v == null) { $('#kpVox').textContent = 'Temps incompris : vérifie les chiffres.'; return; }
    var val = KP.st ? { st: KP.st } : v != null ? { v: v } : null;
    var al = v != null ? alertsAt(r, h, a, v, S.wind[h.id], 0) : { list: [], txt: '' };
    commit(['res', h.id, a.key], val, heatText(r, h) + ' · ' + a.name + ' · ' + (KP.st || (v != null ? fp(v, r.unit) : 'effacé')), al.txt, r.id);
    if (v != null) announce(al.txt, al.list, t);
    // athlète suivant sans perf (ordre des couloirs)
    var lst = h.ath.slice().sort(function (x, y) { return (+laneOf(h, x) || 99) - (+laneOf(h, y) || 99) || x.order - y.order; });
    var R = S.res[h.id] || {}, i0 = lst.indexOf(a), nx = null;
    for (var j = 1; j <= lst.length && val; j++) { var c = lst[(i0 + j) % lst.length]; if (!R[c.key]) { nx = c; break; } }
    if (nx) openKpSilently({ mode: 'perf', r: r.id, h: h.id, k: nx.key }); else closeKp();
  } else if (m === 'cmb') {
    var d = r.cmb[KP.d], vc = KP.st ? null : E.rawToValue(KP.raw, d.unit);
    if (!KP.st && KP.raw && vc == null) { $('#kpVox').textContent = 'Perf incomprise : vérifie les chiffres.'; return; }
    var wc = KP.w ? KP.sign * (+KP.w) / 10 : null;
    var valc = KP.st ? { st: KP.st } : vc != null ? { v: vc } : null;
    if (valc && wc != null && d.wind) valc.w = wc;
    var curc = clone(cmbOf(h, a)); if (valc) curc[KP.d] = valc; else delete curc[KP.d];
    var refc = (a.cref || [])[KP.d] || {}, txtc = '', alc = [];
    if (vc != null) {
      alc = E.alertsFor({ unit: d.unit, records: [], type: 'x' }, { pb: refc.pb, sb: refc.sb }, vc, wc).filter(function (z) { return !z.weak; });
      if (alc.length) txtc = fp(vc, d.unit) + ' : ' + alc[0].txt + ' sur ' + d.lab + ' pour ' + a.name + ' (' + E.combPoints(d, vc) + ' pts)' + (wc != null && wc > 2 ? ' — vent ' + E.fmtWind(wc) : '');
    }
    commit(['cmb', h.id, a.key], Object.keys(curc).length ? curc : null, heatText(r, h) + ' · ' + d.lab + ' · ' + a.name + ' · ' + (KP.st || (vc != null ? fp(vc, d.unit) + ' (' + E.combPoints(d, vc) + ' pts)' : 'effacé')), txtc, r.id);
    var tot = cmbTotal(r, h, a);
    if (tot.n === r.cmb.length && valc) { // dernière épreuve : total comparé aux records et aux PB de l'athlète
      var alt = E.alertsFor(r, a, tot.t, null).filter(function (z) { return !z.weak; });
      var tt = 'Total ' + E.fmtPerf(tot.t, 'pts') + ' pour ' + a.name + (alt.length ? ' : ' + alt.map(function (z) { return z.txt; }).join(', ') : '');
      announce(tt, alt, t);
    } else if (txtc) announce(txtc, alc, t);
    var lstc = h.ath.slice().sort(function (x, y) { return x.order - y.order; }), ic = lstc.indexOf(a), nxc = null;
    for (var jc = 1; jc <= lstc.length && valc; jc++) { var cc = lstc[(ic + jc) % lstc.length]; if (!cmbDone(r, h, cc, KP.d)) { nxc = cc; break; } }
    if (nxc) openKpSilently({ mode: 'cmb', r: r.id, h: h.id, k: nxc.key, d: KP.d }); else closeKp();
  } else if (m === 'ess') {
    var X = S.ess[h.id] || {}, arr = (X[a.key] || []).slice();
    while (arr.length < KP.i) arr.push(null);
    var e = null, ve = null, w = KP.w ? KP.sign * (+KP.w) / 10 : null;
    if (KP.st) e = { r: KP.st };
    else if (KP.raw) { ve = E.rawToValue(KP.raw, 'm'); if (ve == null) { $('#kpVox').textContent = 'Marque incomprise.'; return; } e = { r: KP.raw, v: ve }; if (w != null) e.w = w; }
    arr[KP.i] = e;
    while (arr.length && !arr[arr.length - 1]) arr.pop();
    var al2 = ve != null ? alertsAt(r, h, a, ve, w, KP.i) : { list: [], txt: '' };
    commit(['ess', h.id, a.key], arr, heatText(r, h) + ' · ' + a.name + ' · essai ' + (KP.i + 1) + ' : ' + (e ? essTxt(e, r) + (w != null ? ' (' + E.fmtWind(w) + ')' : '') : 'effacé'), al2.txt, r.id);
    if (ve != null) announce(al2.txt, al2.list, t);
    var st = E.horizState(h, S.ess[h.id] || {});
    if (st.next) openKpSilently({ mode: 'ess', r: r.id, h: h.id, k: st.next.key, i: nextIdx((S.ess[h.id] || {})[st.next.key]) }); else closeKp();
  } else if (m === 'wind') {
    var wv = KP.raw ? KP.sign * (+KP.raw) / 10 : null;
    commit(['wind', h.id], wv, heatText(r, h) + ' · vent ' + (wv != null ? E.fmtWind(wv) : 'effacé'), '', r.id); closeKp(); renderAll();
  } else if (m === 'bar') {
    var cm = E.rawToValue(KP.raw, 'm'); if (cm == null || cm < 50) { $('#kpVox').textContent = 'Barre incomprise (ex. 570 pour 5m70).'; return; }
    var V = clone(vObj(h.id));
    if (V.bars.indexOf(cm) < 0) V.bars.push(cm);
    V.bars.sort(function (x, y) { return x - y; }); V.cur = V.bars.indexOf(cm);
    commit(['vert', h.id], V, heatText(r, h) + ' · barre à ' + fp(cm, 'm'), '', r.id);
    var vs = E.vertState(h, V);
    if (vs.next) openKpSilently({ mode: 'vt', r: r.id, h: h.id, k: vs.next.key }); else closeKp();
  } else if (m === 'lane') {
    commit(['lanes', h.id, a.key], KP.raw || null, heatText(r, h) + ' · ' + a.name + ' · couloir ' + (KP.raw || '–'), '', r.id); closeKp();
  } else if (m === 'time') {
    if (KP.raw.length < 3) return;
    var nt = +KP.raw.slice(0, -2) * 60 + +KP.raw.slice(-2);
    if (KP.d != null && r.cmb) { commit(['dtime', r.id + '_' + KP.d], nt - (S.off[r.id] || 0), r.title + ' · ' + r.cmb[KP.d].lab + ' · heure ' + fh(nt), '', r.id); closeKp(); renderAll(); return; }
    commit(['off', r.id], nt - r.time || null, r.title + ' ' + r.phase + ' · heure ' + fh(nt), '', r.id); closeKp();
  }
  renderAll();
}
function openKpSilently(o) { KP = null; KP = o; KP.f = 1; KP.raw = ''; KP.w = ''; KP.sign = 1; KP.st = ''; $('#kpVox').textContent = ''; renderKp(); renderAll(); setTimeout(scrollRow, 0); }
// amène la ligne en cours de saisie dans la zone visible, sans faire défiler toute la page sur tablette
function scrollRow() {
  var row = document.querySelector('.panel.on .rw.edit') || document.querySelector('.panel .rw.edit'); if (!row) return;
  var body = row.closest('.pbody');
  if (body && body.scrollHeight > body.clientHeight + 2 && getComputedStyle(body).overflowY !== 'visible') {
    var rb = row.getBoundingClientRect(), bb = body.getBoundingClientRect(), head = 34;
    if (rb.top < bb.top + head) body.scrollTop -= (bb.top + head - rb.top);
    else if (rb.bottom > bb.bottom) body.scrollTop += rb.bottom - bb.bottom + 8;
  } else {
    var r = row.getBoundingClientRect(), kp = $('#kp'), kb = kp.getBoundingClientRect();
    var lim = kb.width >= window.innerWidth - 20 && !kp.classList.contains('off') ? kb.top : window.innerHeight;
    var topLim = 110;
    if (r.bottom > lim) window.scrollBy(0, r.bottom - lim + 10); else if (r.top < topLim) window.scrollBy(0, r.top - topLim);
  }
}
function vtKey(k) {
  var r = kpRound(), h = getH(r, KP.h), a = getA(h, KP.k), V = clone(vObj(h.id)), bar = V.bars[V.cur], t = Date.now();
  if (k === 'newbar') { var last = V.bars[V.bars.length - 1], step = V.bars.length > 1 ? last - V.bars[V.bars.length - 2] : (/perche/.test(E.nk(r.nom)) ? 10 : 3); KP = { mode: 'bar', r: r.id, h: h.id }; KP.f = 1; KP.raw = String(last + step); KP.w = ''; KP.sign = 1; KP.hint = 'Proposé : ' + fp(last + step, 'm') + ' (barre précédente + ' + step + ' cm).'; renderKp(); renderPanels(); return; }
  V.m[a.key] = V.m[a.key] || {};
  var s = V.m[a.key][bar] || '';
  if (k === 'del') s = s.slice(0, -1);
  else if (k === 'clr') s = '';
  else if (k === 'O' || k === 'X' || k === '-') {
    var stA = E.vertAthlete(V, a.key);
    if (stA.out || /O|-/.test(s) || s.length >= 3) { $('#kpVox').textContent = a.name + ' a terminé à cette barre.'; return; }
    s += k;
  } else return;
  if (s) V.m[a.key][bar] = s; else delete V.m[a.key][bar];
  var al = k === 'O' ? alertsAt(r, h, a, bar, null, bar) : { list: [], txt: '' };
  commit(['vert', h.id], V, heatText(r, h) + ' · ' + a.name + ' · ' + fp(bar, 'm') + ' : ' + (marksTxt(s) || 'effacé'), al.txt, r.id);
  if (k === 'O') announce(al.txt, al.list, t);
  if (k === 'del' || k === 'clr') { renderKp(); renderAll(); return; }
  var vs = E.vertState(h, S.vert[h.id]);
  if (vs.next) openKpSilently({ mode: 'vt', r: r.id, h: h.id, k: vs.next.key });
  else { KP = { mode: 'bar', r: r.id, h: h.id, f: 1, w: '', sign: 1, st: '' }; var lb = V.bars[V.bars.length - 1], sp = V.bars.length > 1 ? lb - V.bars[V.bars.length - 2] : 5; KP.raw = String(lb + sp); KP.hint = '<b>Barre ' + fp(bar, 'm') + ' terminée.</b> Proposé : ' + fp(lb + sp, 'm') + '.'; renderKp(); renderAll(); }
}

// ---------- dictée vocale (Chrome / Safari, nécessite le réseau) ----------
var REC = null;
function dicter() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('#kpVox').textContent = 'Dictée non disponible sur ce navigateur.'; return; }
  if (!navigator.onLine) { $('#kpVox').textContent = 'La dictée a besoin du réseau : utilise le pavé.'; return; }
  if (REC) { REC.stop(); return; }
  REC = new SR(); REC.lang = 'fr-FR'; REC.interimResults = false; REC.maxAlternatives = 3;
  var r = kpRound(), unit = KP.mode === 'cmb' ? r.cmb[KP.d].unit : r.unit;
  $('#kpVox').textContent = unit === 't' ? 'Parle : « vingt-trois secondes douze » ou « une minute cinquante-deux secondes trente »' : unit === 'm' ? (KP.mode === 'vt' ? 'Parle : « réussi », « échec » ou « passe »' : 'Parle : « sept mètres cinquante-deux » ou « mordu »') : 'Parle : « six mille cent vingt-sept »';
  renderKp();
  REC.onresult = function (e) {
    var alts = [].slice.call(e.results[0]).map(function (x) { return x.transcript; }), d = null;
    for (var i = 0; i < alts.length && !d; i++) d = E.speechToEntry(alts[i], unit, KP.mode === 'cmb' ? 'horiz' : r.type);
    if (!d) { $('#kpVox').textContent = 'Pas compris : « ' + alts[0] + ' »'; return; }
    $('#kpVox').textContent = 'Entendu : « ' + alts[0] + ' »';
    if (KP.mode === 'vt') { if (d.mark) vtKey(d.mark); return; }
    if (d.mark && KP.mode === 'ess') { KP.st = d.mark; KP.raw = ''; renderKp(); return; }
    if (d.st && (KP.mode === 'perf' || KP.mode === 'cmb')) { KP.st = d.st; KP.raw = ''; renderKp(); return; }
    if (d.mark === 'X' && KP.mode === 'cmb') { KP.st = 'NM'; KP.raw = ''; renderKp(); return; }
    if (d.raw) { KP.st = ''; if (KP.f === 2) KP.w = d.raw.slice(0, 2); else KP.raw = d.raw; renderKp(); }
  };
  REC.onerror = function (e) { $('#kpVox').textContent = e.error === 'not-allowed' ? 'Autorise le micro pour ce site.' : 'Dictée interrompue (' + e.error + ').'; };
  REC.onend = function () { REC = null; if (KP) renderKp(); };
  try { REC.start(); } catch (x) { REC = null; }
}


// ---------- notes perso du speaker (partagées entre appareils) ----------
function noteKey(a) { return a.dossard ? 'd' + a.dossard : 'n' + String(a.nom || '').toUpperCase().replace(/[^A-Z]/g, ''); }
function noteOf(a) { return (S.notes || {})[noteKey(a)] || ''; }

// ---------- ce qu'il faut pour… (concours) ----------
var SHORTREC = { RCH: 'record des champ.', RF: 'RF', MPF: 'MPF', MIN: 'minima' };
function recShort(x) { return x.code === 'MIN' ? x.label.replace(/^minima /, 'minima ') : /^RF-/.test(x.code) ? 'RF ' + (E.CAT_LABEL[x.code.slice(3)] || '') : /^MPF-/.test(x.code) ? 'MPF ' + (E.CAT_LABEL[x.code.slice(4)] || '') : SHORTREC[x.code] || x.code; }
function needHoriz(r, h, X, a) {
  var rk = E.horizRanking(h, X), me = rk.filter(function (x) { return x.a === a; })[0] || { marks: [] }, my = me.marks[0], pos = rk.indexOf(me), out = [];
  var lead = rk[0];
  if (lead && lead.marks.length && lead.a !== a) out.push('<b>' + fp(lead.marks[0] + 1, 'm') + '</b> pour passer en tête');
  else if (lead && lead.a === a && my != null) out.push('en tête');
  var third = rk[2];
  if (third && third.marks.length && pos > 2) out.push('<b>' + fp(third.marks[0] + 1, 'm') + '</b> pour le podium');
  var st = E.horizState(h, X), eight = rk[7];
  if (st.round <= 3 && h.ath.length > 8 && eight && eight.marks.length && pos > 7) out.push('<b>' + fp(eight.marks[0] + 1, 'm') + '</b> pour le top 8');
  if (a.pb && (my == null || my <= a.pb.v)) out.push('<b>' + fp(a.pb.v + 1, 'm') + '</b> PB');
  var ref = a.pb ? a.pb.v : my || 0;
  r.records.forEach(function (x) {
    if (!/^(RCH|RF|MPF|MIN)/.test(x.code) || (x.cat !== 'ALL' && x.cat !== a.catk)) return;
    if (my != null && my >= x.v) return;
    if (ref && x.v > ref * 1.06) return; // hors de portée
    out.push('<b>' + fp(x.v, 'm') + '</b> ' + esc(recShort(x)));
  });
  return out.join(' · ');
}
function needVert(r, h, V, a, bar) {
  if (bar == null || !a) return '';
  var al = E.alertsFor(r, a, bar, null).filter(function (z) { return !z.weak; }).map(function (z) { return z.code === 'PB' ? 'PB' : z.code === 'SB' ? 'SB' : z.txt; });
  var rk = E.vertRanking(h, V), lead = rk[0];
  if (!lead || lead.best == null || bar > lead.best || lead.a === a) al.unshift('en tête');
  return al.length ? 'Si ' + esc(a.name.split(' ')[0]) + ' passe <b>' + fp(bar, 'm') + '</b> : ' + al.map(esc).join(', ') : '';
}

// ---------- présentation d'une série / d'un concours ----------
function presentSheet(r, h) {
  var u = r.unit, list = h.ath.slice().sort(function (a, b) { return (+laneOf(h, a) || 99) - (+laneOf(h, b) || 99) || a.order - b.order; });
  var fav = h.ath.filter(function (a) { return a.sb; }).sort(function (a, b) { return E.cmp(a.sb.v, b.sb.v, u); }).slice(0, 3);
  var html = '<p class="big" style="font-size:30px">' + esc(r.title) + ' · ' + esc(h.label || r.phase) + ' <small style="font-size:18px;color:var(--muted)">' + fh(hStart(r, h)) + '</small></p>';
  var rules = hasQ(r) && ruleOf(r) ? '<p><b>Qualification :</b> ' + esc(ruleOf(r)) + '</p>' : '';
  var rec = r.records.filter(function (x) { return !/^(RM|RE|MPM|MPE)$/.test(x.code); });
  html += rules + '<h4>En jeu</h4><div class="kv">' + rec.map(function (x) { return '<i>' + esc(x.label.charAt(0).toUpperCase() + x.label.slice(1)) + '</i><span><b>' + fp(x.v, u) + '</b> ' + (x.detail ? '<small>' + esc(x.detail) + '</small>' : '') + '</span>'; }).join('') + '</div>';
  if (fav.length) html += '<h4>Favoris (meilleurs SB)</h4><p>' + fav.map(function (a, i) { return (i + 1) + '. <b>' + esc(a.name) + '</b> ' + fp(a.sb.v, u); }).join(' · ') + '</p>';
  if (!h.ath.some(function (a) { return E.topStats(a.src || {}, r.info).length; })) html += '<p class="note">Pas de palmarès ni de records détenus pour ces athlètes : ouvre le fichier <b>Media Sheet</b> de la réunion (Réglages → Ouvrir un fichier) pour les ajouter.</p>';
  html += '<h4>' + (r.type === 'course' ? 'Couloir par couloir' : 'Ordre de passage') + '</h4>';
  list.forEach(function (a) {
    var st = E.topStats(a.src || {}, r.info).slice(0, 5), n = noteOf(a);
    html += '<div class="pres"><div class="pl">' + esc(laneOf(h, a) || '–') + '</div>' + (photosOn() ? avatar(a, 'avp') : '') + '<div class="pm"><b>' + esc(a.name) + '</b> <small>' + esc(a.cat) + (a.annee ? ' · ' + esc(a.annee) : '') + ' · ' + esc(a.club) + '</small>' +
      '<div class="pr">SB <b>' + (a.sb ? fp(a.sb.v, u) : '–') + '</b> · PB <b>' + (a.pb ? fp(a.pb.v, u) : '–') + '</b>' + (a.pb && a.pb.y ? ' (' + esc(a.pb.y) + ')' : '') + (a.src && a.src.minima_status ? ' · ' + esc(a.src.minima_status) : '') + '</div>' +
      (st.length ? '<div class="ps">' + st.map(function (x) { return '<span class="s-' + x.k + '">' + esc(x.t) + '</span>'; }).join(' · ') + '</div>' : '') +
      (n ? '<div class="note1">📝 ' + esc(n) + '</div>' : '') + '</div></div>';
  });
  openSheet('Présentation', html);
}

// ---------- podium ----------
function champYears(a, r) { // titres de champion(ne) de France élite sur l'épreuve, d'après le palmarès
  var out = [];
  String((a.src || {}).palmares_national || '').split(' / ').forEach(function (it) {
    var m = it.trim().match(/^1\s+(CF|CFS)\s+(\d{2})\s+(.+)$/); if (!m) return;
    var evt = E.nk(m[3]).replace(/[^a-z0-9]/g, ''); if (evt.indexOf(r.info.base.replace(/[^a-z0-9]/g, '')) !== 0) return;
    out.push((m[1] === 'CFS' ? 'salle ' : '') + '20' + m[2]);
  });
  return out;
}
function podiumRows(r) {
  var h = r.heats[r.heats.length - 1], rows = [];
  if (r.type === 'course') rows = E.heatRanking(h, S.res[h.id] || {}, r.unit).map(function (x) { return { a: x.a, place: x.place, v: x.v, w: S.wind[h.id] }; });
  else if (r.type === 'horiz') rows = E.horizRanking(h, S.ess[h.id] || {}).filter(function (x) { return x.marks.length; }).map(function (x) { var e = ((S.ess[h.id] || {})[x.a.key] || []).filter(function (z) { return z && z.v === x.marks[0]; })[0]; return { a: x.a, place: x.place, v: x.marks[0], w: e && e.w }; });
  else if (r.type === 'vert') rows = E.vertRanking(h, vObj(h.id)).filter(function (x) { return x.best != null; }).map(function (x) { return { a: x.a, place: x.place, v: x.best }; });
  else if (r.cmb) rows = combRanking(r, h).filter(function (x) { return x.n; }).map(function (x) { return { a: x.a, place: x.place, v: x.t, unit: 'pts' }; });
  return { h: h, rows: rows.filter(function (x) { return x.place && x.place <= 3; }) };
}
function podiumSheet(r) {
  var P = podiumRows(r), u = r.cmb ? 'pts' : r.unit, med = ['', '🥇', '🥈', '🥉'], champ = M.kind === 'championnat';
  if (!P.rows.length) { openSheet('Podium', '<p class="empty">Pas encore de résultats pour ' + esc(r.title) + '.</p>'); return; }
  var html = '<p class="big" style="font-size:30px">' + esc(r.title) + ' · ' + esc(P.h.label || r.phase) + '</p>';
  P.rows.forEach(function (x) {
    var a = x.a, al = E.alertsFor(r, a, x.v, x.w).filter(function (z) { return !z.weak; }), yrs = champYears(a, r), n = noteOf(a);
    var titre = champ && x.place === 1 ? (yrs.length ? (yrs.length + 1) + 'e titre de champion' + (r.sexe === 'F' ? 'ne' : '') + ' de France (déjà en ' + yrs.join(', ') + ')' : '1er titre de champion' + (r.sexe === 'F' ? 'ne' : '') + ' de France sur l\'épreuve (d\'après son palmarès)') : '';
    html += '<div class="pres pod"><div class="pl">' + med[x.place] + '</div>' + (photosOn() ? avatar(a, 'avp') : '') + '<div class="pm"><b>' + esc(a.name) + '</b> <span class="c-p" style="font-size:28px">' + fp(x.v, u) + '</span>' + (x.w != null ? ' <small>vent ' + E.fmtWind(x.w) + '</small>' : '') +
      '<div class="pr">' + esc(a.cat) + ' · ' + esc(a.club) + '</div>' + (titre ? '<div class="ps"><b>' + esc(titre) + '</b></div>' : '') +
      (al.length ? '<div class="ps">' + al.map(function (z) { return esc(z.txt); }).join(' · ') + '</div>' : '') +
      (n ? '<div class="note1">📝 ' + esc(n) + '</div>' : '') + '</div></div>';
  });
  openSheet('Podium', html);
}

// ---------- fenêtres (fiche, records, historique, réglages…) ----------
function openSheet(title, html) { $('#sTitle').textContent = title; $('#sBody').innerHTML = html; $('#sheet').classList.remove('off'); $('#sBody').scrollTop = 0; pushLayer('sheet'); }
function closeSheet(fromPop) { if ($('#sheet').classList.contains('off')) return; $('#sheet').classList.add('off'); if (!fromPop) popLayer('sheet'); }
// bouton Retour du téléphone : ferme la fenêtre ou le pavé ouvert
var LAYERS = [];
function pushLayer(n) { if (LAYERS.indexOf(n) >= 0) return; LAYERS.push(n); try { history.pushState({ l: n }, ''); } catch (e) { } }
function popLayer(n) { var i = LAYERS.indexOf(n); if (i < 0) return; LAYERS.splice(i, 1); try { history.back(); } catch (e) { } }
window.addEventListener('popstate', function () {
  var n = LAYERS.pop();
  if (n === 'sheet') closeSheet(true); else if (n === 'kp') closeKp(true);
});

function fiche(r, h, a) {
  var s = a.src || {}, u = r.unit;
  var lien = ficheUrl(a) ? '<a class="btn p" href="' + esc(ficheUrl(a)) + '" target="_blank" rel="noopener">Fiche ' + (/worldathletics/.test(s.url) ? 'World Athletics' : 'FFA') + ' ↗</a>' : '';
  var html = '<div class="fhead">' + (photosOn() ? avatar(a, 'avf') : '') + '<p class="big">' + esc(a.name) + '</p>' + lien + '</div><div class="kv">' +
    '<i>Catégorie</i><span>' + esc(a.cat) + (a.annee ? ' · né(e) en ' + esc(a.annee) : '') + ' · ' + esc(s.pays || a.nat) + '</span>' +
    '<i>Club</i><span>' + esc(a.club) + '</span>' + (s.entraineur ? '<i>Entraîneur</i><span>' + esc(s.entraineur) + '</span>' : '') +
    '<i>Dossard</i><span>' + esc(a.dossard) + (laneOf(h, a) ? ' · ' + (r.type === 'course' ? 'couloir ' : 'ordre ') + esc(laneOf(h, a)) : '') + '</span>' +
    '<i>' + esc(r.title) + '</i><span>SB <b>' + (a.sb ? fp(a.sb.v, u) : '–') + '</b> · PB <b>' + (a.pb ? fp(a.pb.v, u) : '–') + '</b>' + (a.pb && a.pb.y ? ' (' + esc(a.pb.y) + ')' : '') + '</span>' +
    (s.minima_status ? '<i>Minima</i><span>' + esc(s.minima_status) + '</span>' : '') + '</div><!--kv-->';
  if (s.records) html += '<h4>Records détenus</h4><p>' + esc(s.records).replace(/ · /g, '<br>') + '</p>';
  if (s.palmares_international && s.palmares_international !== 'Aucun') html += '<h4>Palmarès international</h4><p>' + esc(s.palmares_international).replace(/ \/ /g, '<br>') + '</p>';
  if (s.palmares_national && s.palmares_national !== 'Aucun') html += '<h4>Palmarès national</h4><p>' + esc(s.palmares_national).replace(/ \/ /g, '<br>') + '</p>';
  if (s.tags) html += '<h4>Notes</h4><p>' + esc(s.tags) + '</p>';
  if (s.bio) html += '<h4>Bio</h4><p>' + esc(s.bio) + '</p>';
  if (s.sb) html += '<details><summary><b>Toutes ses perfs de la saison</b></summary><p>' + esc(s.sb).replace(/''/g, '"').replace(/ \| /g, '<br>') + '</p></details>';
  if (s.pb) html += '<details><summary><b>Tous ses records personnels</b></summary><p>' + esc(s.pb).replace(/''/g, '"').replace(/ \| /g, '<br>') + '</p></details>';
  html += '<h4>Ma note de speaker</h4><textarea class="txt" id="noteTxt" rows="3" style="width:100%" placeholder="Anecdote, prononciation du nom, à souligner…">' + esc(noteOf(a)) + '</textarea>' +
    '<div class="row2"><button class="btn p" data-act="noteSave" data-r="' + r.id + '" data-h="' + h.id + '" data-k="' + esc(a.key) + '">Enregistrer la note</button><small>Visible sur sa ligne, partagée avec les autres appareils.</small></div>';
  var st = E.topStats(s, r.info);
  if (st.length) html = html.replace('<!--kv-->', '<h4>Meilleures stats</h4><p>' + st.map(function (x) { return esc(x.t); }).join('<br>') + '</p>');
  openSheet(a.name, html);
}
function recordsSheet(r) {
  var u = r.unit, s = r.src || {};
  var html = '<h4>Records et références</h4>' + r.records.map(function (x) {
    return '<div class="hl"><div class="hm"><b>' + esc(x.label.charAt(0).toUpperCase() + x.label.slice(1)) + '</b>' + (x.cat !== 'ALL' ? ' <small style="display:inline">(' + esc(E.CAT_LABEL[x.cat] || x.cat) + ')</small>' : '') + '<small>' + esc(x.detail) + '</small></div><span class="c-p">' + fp(x.v, u) + '</span></div>';
  }).join('');
  function tbl(t, list) { if (!list || !list.length) return ''; return '<h4>' + t + '</h4>' + list.map(function (x) { return '<div class="hl"><div class="hm">' + esc(x.rang || x.place || '') + '. ' + esc(x.nom || x.athlete) + ' <small style="display:inline">' + esc(x.nat || '') + (x.date ? ' · ' + esc(x.date) : '') + '</small></div><b>' + esc(String(x.perf).replace(/''/g, '"')) + '</b></div>'; }).join(''); }
  var y = Object.keys(s).filter(function (k) { return /^top_france_\d{4}$/.test(k); })[0];
  y = y ? y.slice(-4) : '';
  html += tbl('Podium de l\'an dernier', s.podium_n1) + tbl('Bilan France ' + y, s['top_france_' + y]) + tbl('Bilan monde ' + y, s['top_monde_' + y]) + tbl('Meilleurs Français de tous les temps', s.alltime_france);
  openSheet(r.title + ' · références', html);
}
function histSheet() {
  var html = S.hist.length ? '' : '<p class="empty">Aucune saisie pour l\'instant.</p>';
  html += S.hist.map(function (x, i) {
    return '<div class="hl' + (x.undone ? ' und' : '') + '"><div class="hm"><b>' + fh(x.clk) + '</b> · ' + esc(x.txt) + (x.al ? '<br><span class="al">' + esc(x.al) + '</span>' : '') + '</div>' + (x.undone ? '' : '<button class="btn s" data-act="undo" data-i="' + i + '">Annuler</button>') + '</div>';
  }).join('');
  openSheet('Historique', html);
}
function ruleSheet(r) {
  var p = E.parseRule(ruleOf(r)) || { Q: 2, q: 2 };
  window._rule = { Q: p.Q, q: p.q, r: r.id };
  var pre = ['1Q+2q', '2Q+2q', '2Q+4q', '2Q+6q', '3Q+2q', '3Q+4q', '3Q+6q', '4Q', '4Q+4q'];
  var html = '<p>Règle de qualification pour <b>' + esc(r.title + ' · ' + r.phase) + '</b> (' + r.heats.length + ' ' + esc(r.heats[0].label.split(' ')[0].toLowerCase()) + 's). Elle figure sur la liste de départ du Direct FFA (« Qualif : 2Q + 2q »).</p>' +
    '<div class="row2">' + pre.map(function (x) { return '<button class="btn" data-act="ruleSet" data-v="' + x + '">' + x + '</button>'; }).join('') + '</div>' +
    '<div class="stepper"><span>Q = les premiers de chaque série</span><button class="btn" data-act="ruleStep" data-f="Q" data-d="-1">−</button><b id="rQ">' + p.Q + '</b><button class="btn" data-act="ruleStep" data-f="Q" data-d="1">+</button></div>' +
    '<div class="stepper"><span>q = meilleurs temps suivants</span><button class="btn" data-act="ruleStep" data-f="q" data-d="-1">−</button><b id="rq">' + p.q + '</b><button class="btn" data-act="ruleStep" data-f="q" data-d="1">+</button></div>' +
    '<div class="row2"><button class="btn p" data-act="ruleOk">Valider</button><button class="btn" data-act="ruleSet" data-v="">Aucune qualification</button></div>' +
    '<p class="note">Les Q et q se recalculent à chaque temps saisi. Touche une case Q/q pour la corriger (Q → q → – → automatique). Un « = » rouge signale une égalité à trancher.</p>';
  openSheet('Qualification', html);
}
function menuSheet(r) {
  var st = status(r), fin = (S.finals || []).filter(function (f) { return f.from === r.id; })[0];
  var html = '<p><b>' + esc(r.title + ' · ' + r.phase) + '</b> · ' + fh(rStart(r)) + ' · ' + STL[st] + '</p><div class="row2">' +
    '<button class="btn" data-act="shift" data-r="' + r.id + '" data-d="5">+5 min</button><button class="btn" data-act="shift" data-r="' + r.id + '" data-d="-5">−5 min</button>' +
    '<button class="btn" data-act="setTime" data-r="' + r.id + '">Changer l\'heure</button></div><div class="row2">' +
    (hasQ(r) ? '<button class="btn" data-act="rule" data-r="' + r.id + '">Règle de qualification</button>' : '') +
    (hasQ(r) && !fin && !finOf(r) ? '<button class="btn" data-act="mkfinal" data-r="' + r.id + '">Créer la finale avec les qualifiés</button>' : '') +
    (r.fromRound ? '<button class="btn r" data-act="rmfinal" data-r="' + r.id + '">Supprimer cette finale</button>' : '') +
    '<button class="btn' + (S.done[r.id] ? '' : ' p') + '" data-act="done" data-r="' + r.id + '">' + (S.done[r.id] ? 'Rouvrir l\'épreuve' : 'Marquer terminée') + '</button>' +
    '<button class="btn" data-act="recs" data-r="' + r.id + '">Records et bilans</button><button class="btn" data-act="present" data-r="' + r.id + '" data-h="' + r.heats[0].id + '">Présentation</button><button class="btn" data-act="podium" data-r="' + r.id + '">🏅 Podium</button></div>' +
    '<h4>Effacer</h4><div class="row2"><button class="btn r" data-act="wipe" data-r="' + r.id + '">Effacer toutes les saisies de cette épreuve</button></div>';
  openSheet('Options', html);
}
function settingsSheet() {
  var c = S && S.clock, sim = c && c.sim;
  var html = '';
  if (M) html += '<h4>Réunion</h4><p><b>' + esc(M.nom) + '</b> · ' + esc(M.date) + ' · ' + M.rounds.length + ' épreuves</p>';
  html += '<div class="row2"><button class="btn p" data-act="open">Ouvrir un fichier de réunion</button><button class="btn" data-act="demo">Données de démonstration</button></div>' +
    '<p class="note">Le fichier à ouvrir est celui de <b>Media Sheet</b> : dossier <b>store/meetings</b>, un fichier <b>.json</b> par réunion. ' + (relaisOk() ? 'Ouvert ici, il est aussi envoyé dans ton Drive pour tous les appareils du partage.' : 'Il reste sur cet appareil.') + '</p>' + importSectionHtml() + shareSectionHtml();
  if (M) {
    html += '<h4>Horloge</h4><p>' + (sim ? 'Heure <b>simulée</b> (pour tester ou rejouer une réunion) : ' : 'Heure <b>réelle</b> de l\'appareil : ') + '<b>' + fh(nowMin()) + '</b></p>' +
      '<div class="row2"><input class="txt" type="time" id="simT" value="' + fh(nowMin()).replace('h', ':') + '"><button class="btn p" data-act="simSet">Simuler à partir de cette heure</button>' + (sim ? '<button class="btn" data-act="simOff">Revenir à l\'heure réelle</button>' : '') + '</div>';
    html += '<h4>Mes saisies</h4><div class="row2"><button class="btn" data-act="exp">Exporter mes saisies</button><button class="btn" data-act="imp">Importer des saisies</button><button class="btn r" data-act="wipeAll">Tout effacer</button></div>' +
      '<p class="small">L\'export est un petit fichier à garder en sauvegarde ou à transmettre à un collègue qui a ouvert le même fichier de réunion.</p>';
  }
  html += '<h4>Affichage</h4><div class="row2"><button class="btn' + (photosOn() ? ' p' : '') + '" data-act="photosTog">' + (photosOn() ? '✓ Photos des athlètes' : 'Photos : masquées') + '</button></div><div class="row2"><button class="btn" data-act="fs" data-d="-0.08">A−</button><button class="btn" data-act="fs" data-d="0">Taille normale</button><button class="btn" data-act="fs" data-d="0.08">A+</button></div>';
  html += '<h4>À propos</h4><p>CIS speaker ' + VERSION + ' · fonctionne hors connexion une fois ouvert.</p>';
  openSheet('Réglages', html);
}
function welcome() {
  $('#panels').style.setProperty('--n', 1);
  $('#panels').innerHTML = '<div class="welcome" style="grid-column:1/-1"><h1>CIS speaker</h1><p>Écran d\'information de compétition pour le speaker : horaire, épreuves en cours côte à côte, saisie des perfs, Q/q et alertes (PB, SB, records, minima).</p>' +
    '<div class="row2"><button class="btn p" data-act="open">Ouvrir le fichier de la réunion</button><button class="btn" data-act="demo">Essayer avec la démo</button></div>' +
    '<p class="note">Le fichier vient de Media Sheet (dossier <b>store/meetings</b>, un fichier .json par réunion). Il n\'est jamais publié sur Internet.</p>' + (relaisOk() ? '<div class="note" style="margin-top:10px">' + importSectionHtml() + '</div>' : '') + '<div id="welcomeShared">' + (relaisOk() ? '<h4>Réunions partagées</h4>' + sharedListHtml() : '') + '</div></div>';
  document.body.classList.add('nomeet');
}

// ---------- chargement ----------
function start(raw, isNew) {
  RAW = raw;
  var m0 = E.loadMeeting(raw);
  M = m0;
  S = lsGet('cis:s:' + m0.id, null) || blank();
  var b = blank(); for (var k in b) if (S[k] == null && k !== 'pins' && k !== 'ptab' && k !== 'clock' && k !== 'last') S[k] = b[k];
  build();
  document.body.classList.remove('nomeet');
  if (!S.clock && M.dateISO && M.dateISO !== todayISO() && M.rounds[0] && M.rounds[0].time != null) {
    S.clock = { sim: true, base: M.rounds[0].time - 5, at: Date.now() };
    S.last = { txt: 'La réunion n\'a pas lieu aujourd\'hui : l\'horloge est simulée à partir de ' + fh(M.rounds[0].time - 5) + ' (modifiable dans Réglages).', t: Date.now(), hot: false };
  }
  if (S.pins == null) {
    var sg = suggestions();
    var ids = []; (sg.length ? sg.map(function (x) { return x.r; }) : M.rounds).forEach(function (r) { if (ids.indexOf(r.id) < 0) ids.push(r.id); });
    S.pins = ids.slice(0, window.innerWidth > 700 ? 2 : 3);
  }
  if (syncOn()) syLoad(); else SY = null;
  save(); renderAll(); syTick();
}
function loadText(txt) {
  var j;
  try { j = JSON.parse(txt); } catch (e) { alert('Ce fichier n\'est pas lisible (JSON attendu).'); return; }
  var mt = j.meeting || j;
  if (!mt.epreuves || !mt.epreuves.length) { alert('Ce fichier ne contient pas d\'épreuves : choisis le fichier de réunion Media Sheet (store/meetings/….json).'); return; }
  if (RAW && RAW.source === 'direct' && j.source !== 'direct' &&
      confirm('Ajouter les stats de ce fichier Media Sheet à la réunion importée du Direct (« ' + M.nom + ' ») ?\n\nOK = compléter · Annuler = ouvrir ce fichier à la place')) {
    var n = CISI.mergeMediaSheet(RAW, j); window._msLast = j;
    kvSet('meeting', RAW); closeSheet(); start(RAW, true);
    S.last = { txt: 'Stats Media Sheet ajoutées pour ' + n + ' athlètes.', t: Date.now() }; save(); renderBanner();
    shareMeeting(RAW, true); return;
  }
  kvSet('meeting', j); closeSheet(); start(j, true);
  shareMeeting(j);
}
$('#file').addEventListener('change', function () {
  var f = this.files[0]; if (!f) return;
  var rd = new FileReader(); rd.onload = function () { loadText(rd.result); }; rd.readAsText(f); this.value = '';
});
$('#fileSaisies').addEventListener('change', function () {
  var f = this.files[0]; if (!f) return;
  var rd = new FileReader(); rd.onload = function () {
    try { var j = JSON.parse(rd.result); if (j.meeting !== M.id || !j.saisies) throw 0; S = j.saisies; save(); build(); closeSheet(); renderAll(); }
    catch (e) { alert('Ce fichier de saisies ne correspond pas à cette réunion.'); }
  }; rd.readAsText(f); this.value = '';
});


// ---------- partage entre appareils (relais Google Apps Script, voir relais/LISEZMOI.md) ----------
var RL = lsGet('cis:relais', { url: '', cle: '' }), SHARED = null, SHARE_MSG = '';
(function () { // lien d'invitation : …/#relais=URL&code=CODE
  var m = location.hash.match(/relais=([^&]+)&code=([^&]+)/);
  if (m) { RL = { url: decodeURIComponent(m[1]), cle: decodeURIComponent(m[2]) }; lsSet('cis:relais', RL); history.replaceState(null, '', location.pathname); }
})();
function relaisOk() { return !!(RL.url && RL.cle); }
function relaisGet(params) {
  var q = 'cle=' + encodeURIComponent(RL.cle); for (var k in params) q += '&' + k + '=' + encodeURIComponent(params[k]);
  return fetch(RL.url + (RL.url.indexOf('?') < 0 ? '?' : '&') + q, { redirect: 'follow' }).then(function (r) { return r.json(); });
}
function relaisPost(body) {
  body.cle = RL.cle;
  return fetch(RL.url, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' }).then(function (r) { return r.json(); });
}
function shareMeeting(j, silent) {
  if (!relaisOk() || !navigator.onLine) return Promise.resolve(false);
  var m = E.loadMeeting(j);
  if (/^demo/.test(m.id)) return Promise.resolve(false);
  SHARE_MSG = 'Envoi de la réunion…'; if (!silent) refreshShareUi();
  return relaisPost({ action: 'deposer', id: m.id, nom: m.nom, date: m.date, reunion: j }).then(function (x) {
    if (!x.ok) throw new Error(x.erreur === 'code' ? 'code d\'équipe refusé' : x.erreur);
    lsSet('cis:maj:' + m.id, x.maj); SHARE_MSG = 'Réunion partagée : elle apparaît sur tous les appareils du partage.';
    if (S) { S.last = { txt: '« ' + m.nom + ' » est partagée avec tous les appareils.', t: Date.now() }; save(); renderBanner(); }
    refreshShareUi(); pollShared(); return true;
  }).catch(function (e) { SHARE_MSG = 'Partage impossible : ' + (e.message || 'réseau'); refreshShareUi(); return false; });
}
function openShared(id) {
  SHARE_MSG = 'Téléchargement…'; refreshShareUi();
  return relaisGet({ action: 'lire', id: id }).then(function (x) {
    if (!x.ok) throw new Error(x.erreur);
    lsSet('cis:maj:' + id, x.maj); kvSet('meeting', x.reunion); SHARE_MSG = '';
    closeSheet(); start(x.reunion, true); return true;
  }).catch(function (e) { SHARE_MSG = 'Téléchargement impossible : ' + (e.message || 'réseau'); refreshShareUi(); });
}
var POLLING = false;
function pollShared() {
  if (!relaisOk() || !navigator.onLine || POLLING) return;
  POLLING = true; setTimeout(function () { POLLING = false; }, 20000);
  relaisGet({ action: 'liste' }).then(function (x) {
    POLLING = false;
    if (!x.ok) { SHARE_MSG = x.erreur === 'code' ? 'Code d\'équipe refusé par le relais.' : 'Relais : ' + x.erreur; SHARED = null; refreshShareUi(); return; }
    SHARED = x.reunions || [];
    if (!M && SHARED.length) { POLLING = true; openShared(SHARED[0].id).then(function () { POLLING = false; }); return; } // rien d'ouvert : on prend la plus récente
    if (M) {
      var me = SHARED.filter(function (r) { return r.id === M.id; })[0];
      if (me && me.maj > (lsGet('cis:maj:' + M.id, 0) || 0) && !KP) {
        POLLING = true;
        relaisGet({ action: 'lire', id: M.id }).then(function (y) {
          POLLING = false; if (!y.ok) return; lsSet('cis:maj:' + M.id, y.maj); kvSet('meeting', y.reunion); start(y.reunion);
          S.last = { txt: 'Réunion mise à jour depuis le partage (les saisies sont conservées).', t: Date.now() }; save(); renderBanner();
        });
      }
    }
    refreshShareUi();
  }).catch(function () { POLLING = false; });
}
function sharedListHtml() {
  if (!relaisOk()) return '';
  if (!SHARED) return '<p class="small">Liste des réunions partagées : en attente du relais…</p>';
  if (!SHARED.length) return '<p class="small">Aucune réunion partagée pour l\'instant.</p>';
  return SHARED.map(function (r) {
    var cur = M && r.id === M.id;
    return '<div class="hl"><div class="hm"><b>' + esc(r.nom) + '</b><small>' + esc(r.date) + ' · mise à jour ' + new Date(r.maj).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '</small></div>' +
      (cur ? '<span class="st fini">Ouverte</span>' : '<button class="btn s p" data-act="openShared" data-id="' + esc(r.id) + '">Ouvrir</button>') + '</div>';
  }).join('');
}
function shareSectionHtml() {
  var h = '<h4>Partage entre appareils</h4>';
  if (!relaisOk()) h += '<p class="note">Pour qu\'une réunion ouverte sur un appareil apparaisse chez tous les speakers, installe le relais une fois (voir <a href="https://github.com/Lenurbinho/cis-speaker/blob/main/relais/LISEZMOI.md" target="_blank" rel="noopener">mode d\'emploi</a>), puis colle son adresse et le code d\'équipe ci-dessous. Les autres speakers n\'auront qu\'à ouvrir le lien d\'invitation.</p>';
  h += '<div class="row2"><input class="txt" id="rlUrl" placeholder="Adresse du relais (…/exec)" value="' + esc(RL.url) + '" style="flex:2;min-width:220px"><input class="txt" id="rlCle" placeholder="Code d\'équipe" value="' + esc(RL.cle) + '" style="flex:1;min-width:120px"><button class="btn p" data-act="rlSave">Enregistrer</button></div>';
  if (relaisOk()) {
    h += '<div class="row2">' + (M && !/^demo/.test(M.id) ? '<button class="btn" data-act="share">Partager cette réunion</button>' : '') + '<button class="btn" data-act="invite">Copier le lien d\'invitation</button><button class="btn" data-act="rlOff">Arrêter le partage sur cet appareil</button></div>';
  }
  h += '<div id="shareMsg" class="kpvox">' + esc(SHARE_MSG) + '</div><div id="sharedList">' + sharedListHtml() + '</div>';
  return h;
}
function refreshShareUi() {
  var m = $('#shareMsg'); if (m) m.textContent = SHARE_MSG;
  var l = $('#sharedList'); if (l) l.innerHTML = sharedListHtml();
  var w = $('#welcomeShared'); if (w) w.innerHTML = relaisOk() ? '<h4>Réunions partagées</h4>' + sharedListHtml() : '';
}


// ---------- saisies partagées en direct (même relais) ----------
// Chaque « case » (un temps, les essais d'un athlète, un concours vertical, un vent, une règle, un retard…)
// est envoyée au relais dès qu'elle change ; les cases des autres appareils arrivent toutes les 3 s.
// En cas de saisie simultanée de la même case, la plus récente gagne.
var DEV = lsGet('cis:dev', null) || (function () { var d = 'd' + Math.random().toString(36).slice(2, 8); lsSet('cis:dev', d); return d; })();
var SY = null, SY_BUSY = false, SY_STATE = '';
var SY_K2 = ['res', 'ess', 'qov', 'lanes', 'cmb'], SY_K1 = ['wind', 'vert', 'rules', 'off', 'done'];
function syncOn() { return relaisOk() && M && !/^demo/.test(M.id); }
function slotsOf() {
  var o = {};
  SY_K2.forEach(function (k) { var A = S[k] || {}; for (var h in A) for (var a in A[h]) if (A[h][a] != null) o[k + '|' + h + '|' + a] = JSON.stringify(A[h][a]); });
  SY_K1.forEach(function (k) { var A = S[k] || {}; for (var h in A) if (A[h] != null) o[k + '|' + h] = JSON.stringify(A[h]); });
  if (S.finals && S.finals.length) o.finals = JSON.stringify(S.finals);
  return o;
}
function syLoad() { SY = lsGet('cis:sync:' + M.id, null) || { n: 0, base: {}, out: {}, first: true }; SY.id = M.id; SY_STATE = ''; }
function sySave() { if (SY) lsSet('cis:sync:' + SY.id, SY); }
function syDiff() {
  if (!SY || SY.first || SY.id !== M.id) return;
  var cur = slotsOf(), b = SY.base, t = Date.now(), ch = false, keys = {}, k;
  for (k in cur) keys[k] = 1; for (k in b) keys[k] = 1;
  for (k in keys) if (cur[k] !== b[k]) {
    SY.out[k] = { v: cur[k] === undefined ? null : JSON.parse(cur[k]), t: t };
    if (cur[k] === undefined) delete b[k]; else b[k] = cur[k];
    ch = true;
  }
  if (ch) { sySave(); setTimeout(syTick, 50); }
}
function heatOf(hid) { for (var i = 0; i < M.rounds.length; i++) { var h = getH(M.rounds[i], hid); if (h) return { r: M.rounds[i], h: h }; } return null; }
function syApply(items) {
  var changed = false, fin = false;
  (items || []).forEach(function (it) {
    var mine = SY.out[it.p];
    if (mine && mine.t > it.t) return; // ma saisie est plus récente : elle partira au prochain envoi
    delete SY.out[it.p];
    var js = it.v == null ? undefined : JSON.stringify(it.v);
    if (SY.base[it.p] === js && JSON.stringify(getPath(it.p.split('|'))) === (js || undefined)) return;
    var path = it.p.split('|'), prev = clone(getPath(path));
    if (it.p === 'finals') { S.finals = it.v || []; fin = true; } else setPath(path, clone(it.v));
    if (js === undefined) delete SY.base[it.p]; else SY.base[it.p] = js;
    changed = true;
    if (it.by === DEV) return;
    // annonce et historique des saisies faites sur un autre appareil
    var x = (path[0] === 'res' || path[0] === 'ess') ? heatOf(path[1]) : null, a = x && getA(x.h, path[2]);
    if (!a) return;
    var txt = heatText(x.r, x.h) + ' · ' + a.name + ' · ', al = { list: [], txt: '' };
    if (path[0] === 'res') {
      var v = it.v && it.v.v;
      txt += it.v ? (it.v.st || fp(v, x.r.unit)) : 'effacé';
      if (v != null) al = alertsAt(x.r, x.h, a, v, S.wind[x.h.id], 0);
    } else {
      var arr = it.v || [], li = arr.length - 1, e = arr[li];
      txt += e ? 'essai ' + (li + 1) + ' : ' + essTxt(e, x.r) : 'essais effacés';
      if (e && e.v != null && JSON.stringify(e) !== JSON.stringify((prev || [])[li])) al = alertsAt(x.r, x.h, a, e.v, e.w, li);
    }
    S.hist.unshift({ t: Date.now(), clk: nowMin(), path: path, prev: prev, val: clone(it.v), txt: txt + ' (autre appareil)', al: al.txt, rid: x.r.id });
    if (al.txt) announce(al.txt, al.list, Date.now());
  });
  if (changed) {
    lsSet(skey(), S); sySave();
    if (fin) build();
    renderAll();
  }
}
function syTick() {
  if (!SY || !syncOn() || SY_BUSY || !navigator.onLine || SY.id !== M.id) return;
  SY_BUSY = true;
  var done = function () { SY_BUSY = false; renderTop(); };
  var fail = function (e) { SY_STATE = e && e.message === 'action' ? 'relais à mettre à jour' : 'synchro en attente'; done(); };
  var check = function (x) {
    if (!x || !x.ok) throw new Error(x && x.erreur === 'action' ? 'action' : (x && x.erreur) || 'réseau');
    SY_STATE = ''; return x;
  };
  if (SY.first) { // première fois sur cette réunion : on récupère tout, puis on envoie ce que le relais n'a pas
    relaisGet({ action: 'saisies', id: SY.id, depuis: 0 }).then(check).then(function (x) {
      var have = {}; (x.items || []).forEach(function (it) { have[it.p] = 1; });
      SY.first = false; SY.base = {};
      (x.items || []).forEach(function (it) { if (it.v != null) SY.base[it.p] = JSON.stringify(it.v); });
      var local = slotsOf(), t = Date.now();
      for (var k in local) if (!have[k]) SY.out[k] = { v: JSON.parse(local[k]), t: t };
      SY.n = x.n || 0;
      (x.items || []).forEach(function (it) { if (!SY.out[it.p]) setPath(it.p.split('|'), it.p === 'finals' ? null : clone(it.v)); if (it.p === 'finals') S.finals = it.v || []; });
      SY.base = Object.assign(slotsOf(), {}); for (var k2 in SY.out) delete SY.base[k2];
      lsSet(skey(), S); sySave(); build(); renderAll(); done(); syDiff();
    }).catch(fail);
    return;
  }
  var keys = Object.keys(SY.out);
  if (keys.length) {
    var sent = keys.map(function (k) { return { p: k, v: SY.out[k].v, t: SY.out[k].t }; });
    relaisPost({ action: 'saisir', id: SY.id, by: DEV, depuis: SY.n, items: sent }).then(check).then(function (x) {
      sent.forEach(function (it) { if (SY.out[it.p] && SY.out[it.p].t === it.t) delete SY.out[it.p]; });
      SY.n = x.n; sySave(); syApply(x.items); done();
    }).catch(fail);
  } else {
    relaisGet({ action: 'saisies', id: SY.id, depuis: SY.n }).then(check).then(function (x) { SY.n = x.n; sySave(); syApply(x.items); done(); }).catch(fail);
  }
}
function syStatus() {
  if (!SY || !syncOn()) return '';
  var w = Object.keys(SY.out).length;
  if (!navigator.onLine) return ' · hors ligne' + (w ? ' (' + w + ' en attente)' : '');
  if (SY_STATE) return ' · ' + SY_STATE;
  return w ? ' · envoi…' : ' · partagé ✓';
}


// ---------- import automatique depuis le Direct athle.fr (par le relais) ----------
var IMP_MSG = '';
function importSectionHtml() {
  var d = lsGet('cis:lastDirect', { id: '', date: '' });
  var h = '<h4>Importer depuis le Direct athle.fr</h4>';
  if (RAW && ((RAW.source === 'direct' && RAW.direct) || RAW.mats)) h += '<div class="row2"><button class="btn' + (lsGet('cis:live', true) ? ' p' : '') + '" data-act="liveTog">' + (lsGet('cis:live', true) ? '✓ Résultats du Direct en direct (toutes les 10 s)' : 'Résultats du Direct : arrêtés') + '</button><button class="btn" data-act="liveNow">Mettre à jour maintenant</button></div>' +
    '<p class="small">Les cases saisies à la main ne sont jamais écrasées par le Direct. Avec l\'heure simulée, une réunion passée se rejoue : chaque épreuve se remplit une fois son heure passée.</p>';
  if (!relaisOk()) return h + '<p class="small">Nécessite le relais (partage entre appareils, ci-dessous).</p>';
  return h + '<div class="row2"><input class="txt" id="impId" inputmode="numeric" placeholder="N° du Direct (ex. 314411)" value="' + esc(d.id) + '" style="flex:1;min-width:150px">' +
    '<input class="txt" id="impDate" placeholder="Date JJ/MM/AAAA" value="' + esc(d.date) + '" style="flex:1;min-width:140px"><button class="btn p" data-act="impDirect">Importer</button></div>' +
    '<p class="small">Programme, séries et couloirs, heures exactes, règles de qualification, records et meilleures perfs françaises par catégorie. ' +
    'Ouvre ensuite le fichier <b>Media Sheet</b> de la réunion pour ajouter palmarès et bilans. La réunion importée est partagée avec tous les appareils.</p>' +
    '<div id="impMsg" class="kpvox">' + esc(IMP_MSG) + '</div>' +
    '<h4>Live Matsport</h4><div class="row2"><input class="txt" id="matsUrl" placeholder="Adresse de la page live Matsport de la journée" value="' + esc(lsGet('cis:lastMats', '')) + '" style="flex:3;min-width:220px">' +
    '<button class="btn p" data-act="impMats">' + (RAW && RAW.source !== 'matsport' ? 'Associer à cette réunion' : 'Importer') + '</button></div>' +
    '<p class="small">Colle l\'adresse d\'une page de la compétition sur le site live de Matsport (…/competitions/…/…_SCH_aaaammjj). ' +
    (RAW && RAW.source !== 'matsport' ? 'Les épreuves Matsport sont reliées aux séries de la réunion ouverte : les résultats viennent alors de Matsport, le reste (listes, records par catégorie, stats) est gardé.' : 'Sans réunion ouverte, le CIS crée la réunion à partir de Matsport.') + '</p>';
}
function doImportMats() {
  var url = ($('#matsUrl').value || '').trim(), u = CISI.parseMatsUrl(url);
  if (!u) { impMsg('Adresse Matsport non reconnue : elle doit contenir /competitions/<numéro>/…'); return; }
  lsSet('cis:lastMats', url);
  impMsg('Lecture de Matsport…');
  CISI.importMatsport(url, pageGet, impMsg).then(function (mt) {
    if (RAW && RAW.source !== 'matsport') {
      var n = CISI.attachMatsport(RAW, mt);
      kvSet('meeting', RAW); closeSheet(); start(RAW);
      S.live = {}; S.last = { txt: n + ' épreuves reliées à Matsport : les résultats arriveront de Matsport.', t: Date.now() }; save(); renderBanner();
      shareMeeting(RAW, true);
    } else {
      var f = CISI.matsToFile(mt);
      kvSet('meeting', f); closeSheet(); start(f, true);
      S.last = { txt: 'Réunion créée depuis Matsport : ' + f.meeting.epreuves.length + ' épreuves. Ouvre le fichier Media Sheet pour ajouter les stats.', t: Date.now() }; save(); renderBanner();
      shareMeeting(f, true);
    }
    IMP_MSG = '';
  }).catch(function (e) { impMsg('Matsport : ' + (e.message || e)); });
}

// garde le lien avec Matsport quand la réunion est réimportée du Direct (et relie les nouvelles listes, ex. finales)
function relinkMats(file, old) {
  if (!old || !old.mats) return Promise.resolve();
  file.mats = old.mats;
  var m = old.mats, day = m.day ? m.day.slice(0, 4) + '-' + m.day.slice(4, 6) + '-' + m.day.slice(6, 8) : '';
  return pageGet(m.api + '/competitions/' + m.cid + '?_withEvents=true').then(function (t) {
    var comp = JSON.parse(t), evs = [];
    (comp.schedules || []).forEach(function (sc) { if (!day || String(sc.date).slice(0, 10) === day) (sc.events || []).forEach(function (e) { evs.push(e); }); });
    CISI.attachMatsport(file, { u: { cid: m.cid, day: m.day }, api: m.api, comp: comp, evs: evs, full: {} });
  }).catch(function () { });
}
function pageGet(url) { return relaisGet({ action: 'brut', url: url, ttl: 30 }).then(function (x) { if (!x.ok) throw new Error(x.erreur || 'relais'); if (x.code !== 200) throw new Error('page ' + x.code); return x.texte; }); }
// listes de départ publiées pendant la réunion (finales…) : réimport discret toutes les 3 min, en gardant
// les stats Media Sheet déjà fusionnées et toutes les saisies (identifiants stables)
var REIMP_BUSY = false, REIMP_T = Date.now();
function sigOf(f) { return (f.meeting || f).epreuves.map(function (e) { return (e.cis_id || e.nom) + ':' + (e.startlist || []).length; }).sort().join(','); }
function autoReimport(force) {
  if (!M || !liveOn() || !RAW.direct || REIMP_BUSY || KP || (!force && Date.now() - REIMP_T < 180000)) return;
  if (!force && M.dateISO !== todayISO()) return; // réunion du jour seulement (une réunion passée a déjà ses finales)
  REIMP_T = Date.now(); REIMP_BUSY = true;
  var old = RAW, oldIds = {}; (old.meeting || old).epreuves.forEach(function (e) { oldIds[e.cis_id] = (e.startlist || []).length; });
  CISI.importDirect(old.direct.id, old.direct.date, pageGet, function () { }).then(function (file) {
    if (RAW !== old || file.id !== old.id || sigOf(file) === sigOf(old)) return;
    CISI.mergeMediaSheet(file, old, true);
    return relinkMats(file, old).then(function () {
    var news = file.meeting.epreuves.filter(function (e) { return !oldIds[e.cis_id]; }).map(function (e) { return e.nom + ' ' + (e.sexe === 'F' ? 'F' : 'H') + ' ' + e.phase; });
    kvSet('meeting', file); start(file);
    S.last = { txt: news.length ? 'Nouvelle liste publiée : ' + news.slice(0, 3).join(', ') + ' (stats reprises)' : 'Listes de départ mises à jour depuis le Direct (stats reprises)', t: Date.now() }; save(); renderBanner();
    shareMeeting(file, true);
    });
  }).catch(function () { }).then(function () { REIMP_BUSY = false; });
}
function impMsg(t) { IMP_MSG = t; var m = $('#impMsg'); if (m) m.textContent = t; }
function doImportDirect() {
  var id = ($('#impId').value || '').replace(/\D/g, ''), date = ($('#impDate').value || '').trim();
  if (!id) { impMsg('Indique le numéro du Direct (dans l\'adresse athle.fr/direct/…).'); return; }
  if (date && !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) { impMsg('Date au format JJ/MM/AAAA (ou vide pour toute la réunion).'); return; }
  lsSet('cis:lastDirect', { id: id, date: date });
  var get = pageGet;
  impMsg('Import en cours…');
  CISI.importDirect(id, date, get, impMsg).then(function (file) {
    if (!file.meeting.epreuves.length) throw new Error('aucune épreuve pour cette date');
    var old = RAW && RAW.source === 'direct' && RAW.id === file.id ? RAW : null;
    if (old) CISI.mergeMediaSheet(file, old, true); // réimport : on garde les stats Media Sheet déjà ajoutées
    return relinkMats(file, old).then(function () { return file; });
  }).then(function (file) {
    kvSet('meeting', file); closeSheet(); start(file, true);
    S.last = { txt: 'Réunion importée du Direct : ' + file.meeting.epreuves.length + ' listes. ' + (file.mediasheet ? 'Stats Media Sheet conservées.' : 'Ouvre le fichier Media Sheet pour ajouter les stats.'), t: Date.now() }; save(); renderBanner();
    IMP_MSG = ''; shareMeeting(file, true);
  }).catch(function (e) { impMsg('Import impossible : ' + (e.message || e)); });
}


// ---------- résultats en direct depuis le Direct athle.fr (par le relais) ----------
// Pour une réunion importée du Direct : toutes les 10 s, le CIS lit les résultats des séries et concours
// commencés (ou qui commencent dans les 5 min) et remplit les cases qui n'ont pas été saisies à la main.
// Avec l'heure simulée, une réunion passée se « rejoue » : chaque épreuve se remplit une fois son heure passée.
var LIVE_BUSY = false, LIVE_STATE = '';
function liveOn() { return lsGet('cis:live', true) && relaisOk() && RAW && ((RAW.source === 'direct' && RAW.direct) || RAW.mats) && navigator.onLine; }
function liveUrl(guid) { return 'https://www.athle.fr/bases/liste.aspx?frmbase=directs&frmmode=2&frmcompetition=' + RAW.direct.id + '&frmepreuve=' + guid; }
function liveTargets() {
  var n = nowMin(), out = [];
  M.rounds.forEach(function (r) {
    var src = function (o) { return o.mats && RAW.mats ? { mats: o.mats } : o.guid && RAW.direct ? { guid: o.guid } : null; }; // Matsport d'abord, sinon le Direct
    if (r.cmb) { r.cmb.forEach(function (d, i) { var t = d.autre ? -1 : dTime(r, i), sr = src(d); if (sr && t != null && t <= n + 5 && !(S.live[r.id + '_' + i] || {}).off) out.push({ r: r, h: r.heats[0], d: i, guid: sr.guid, mats: sr.mats, t: t }); }); return; }
    r.heats.forEach(function (h) { var t = hStart(r, h), sr = src(h); if (sr && t != null && t <= n + 5 && !(S.live[h.id] || {}).off) out.push({ r: r, h: h, guid: sr.guid, mats: sr.mats, t: t }); });
  });
  out.sort(function (a, b) { return b.t - a.t; }); // les plus récentes d'abord
  return out.slice(0, 24);
}
function athId(u) { var m = String(u || '').match(/athletes\/(\d+)/); return m ? m[1] : ''; }
function nn(s) { return String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z]/g, ''); }
function findAth(h, row) {
  if (row.bib) { var byBib = h.ath.filter(function (a) { return a.dossard && String(a.dossard) === row.bib; })[0]; if (byBib && nn(byBib.nom).slice(0, 4) === nn(row.nom).slice(0, 4)) return byBib; }
  var id = athId(row.url), nm = nn(row.nom);
  return h.ath.filter(function (a) { return (id && athId(a.src && a.src.url) === id); })[0] || h.ath.filter(function (a) { return nn(a.nom) === nm; })[0];
}
function isMan(path) { return S.man && S.man[path.join('~')]; }
function liveSet(path, val, txt, out) {
  if (isMan(path)) return false;
  var cur = getPath(path);
  if (JSON.stringify(cur == null ? null : cur) === JSON.stringify(val == null ? null : val)) return false;
  var prev = clone(cur); setPath(path, clone(val));
  out.push({ path: path, prev: prev, val: clone(val), txt: txt });
  return true;
}
function parseMark(m, unit) { var v = E.parsePerf(m, unit); return v; }
function liveApply(tg, res) {
  var r = tg.r, h = tg.h, ch = [], al = [], w0 = res.wind;
  if (tg.d != null) { // épreuve d'un combiné
    var d = r.cmb[tg.d];
    res.rows.forEach(function (row) {
      var a = findAth(h, row); if (!a) return;
      var c = clone(cmbOf(h, a)), x = null;
      if (row.st) x = { st: row.st }; else { var v = E.parsePerf(row.perf, d.unit); if (v == null) return; x = { v: v }; var wv = E.parseWind(row.vent || (d.unit === 't' ? w0 : '')); if (wv != null && d.wind) x.w = wv; }
      if (JSON.stringify(c[tg.d]) === JSON.stringify(x)) return;
      c[tg.d] = x;
      if (liveSet(['cmb', h.id, a.key], c, heatText(r, h) + ' · ' + d.lab + ' · ' + a.name + ' · ' + (x.st || fp(x.v, d.unit) + ' (' + E.combPoints(d, x.v) + ' pts)'), ch) && x.v != null) {
        var ref = (a.cref || [])[tg.d] || {}, z = E.alertsFor({ unit: d.unit, records: [], type: 'x' }, { pb: ref.pb, sb: ref.sb }, x.v, x.w).filter(function (q) { return !q.weak; });
        if (z.length) al.push({ txt: fp(x.v, d.unit) + ' : ' + z[0].txt + ' sur ' + d.lab + ' pour ' + a.name + ' (' + E.combPoints(d, x.v) + ' pts)', list: z, rank: z[0].rank });
      }
    });
  } else if (r.type === 'course') {
    if (w0 != null) liveSet(['wind', h.id], w0, heatText(r, h) + ' · vent ' + E.fmtWind(w0), ch);
    res.rows.forEach(function (row) {
      var a = findAth(h, row); if (!a) return;
      var x = row.st ? { st: row.st } : (function () { var v = E.parsePerf(row.perf, 't'); return v == null ? null : { v: v }; })();
      if (!x) return;
      if (liveSet(['res', h.id, a.key], x, heatText(r, h) + ' · ' + a.name + ' · ' + (x.st || fp(x.v, 't')), ch) && x.v != null) {
        var z = alertsAt(r, h, a, x.v, S.wind[h.id], 0); if (z.txt) al.push({ txt: z.txt, list: z.list, rank: (z.list[0] || {}).rank || 99 });
      }
    });
  } else if (r.type === 'horiz') {
    res.rows.forEach(function (row) {
      var a = findAth(h, row); if (!a) return;
      var arr = [];
      row.marks.forEach(function (mk) {
        var i = (+mk.k || arr.length + 1) - 1, m = mk.m.replace(/r$/i, '');
        if (!m) return;
        var e = m === 'X' ? { r: 'X' } : m === '-' ? { r: '-' } : (function () { var v = E.parsePerf(m, 'm'); if (v == null) return null; var o = { r: String(v), v: v }; var wv = E.parseWind(mk.w); if (wv != null && r.wind) o.w = wv; return o; })();
        if (e) { while (arr.length < i) arr.push(null); arr[i] = e; }
      });
      if (!arr.length) return;
      var prev = ((S.ess[h.id] || {})[a.key] || []);
      if (liveSet(['ess', h.id, a.key], arr, heatText(r, h) + ' · ' + a.name + ' · ' + arr.map(function (e) { return e ? essTxt(e, r) : '·'; }).join(' '), ch)) {
        arr.forEach(function (e, i) {
          if (!e || e.v == null || (prev[i] && prev[i].v === e.v)) return;
          var z = alertsAt(r, h, a, e.v, e.w, i); if (z.txt) al.push({ txt: z.txt, list: z.list, rank: (z.list[0] || {}).rank || 99 });
        });
      }
    });
  } else if (r.type === 'vert') {
    var V = clone(vObj(h.id)), before = JSON.stringify(V), best = {};
    res.rows.forEach(function (row) {
      var a = findAth(h, row); if (!a) return;
      row.marks.forEach(function (mk) {
        var b = E.parsePerf(mk.k, 'm'), m = mk.m.toUpperCase();
        if (/R/.test(m)) m = (m.replace(/R/g, '') + 'XXX').slice(0, 3); // « r » = abandon : on termine la barre
        m = m.replace(/[^OX-]/g, '');
        if (b == null || !m) return;
        if (V.bars.indexOf(b) < 0) V.bars.push(b);
        V.m[a.key] = V.m[a.key] || {}; V.m[a.key][b] = m;
        if (/O/.test(m)) best[a.key] = Math.max(best[a.key] || 0, b);
      });
    });
    V.bars.sort(function (x, y) { return x - y; });
    var used = V.bars.filter(function (b) { return Object.keys(V.m).some(function (k) { return V.m[k][b]; }); });
    V.cur = Math.max(0, V.bars.indexOf(used[used.length - 1]));
    if (JSON.stringify(V) !== before && liveSet(['vert', h.id], V, heatText(r, h) + ' · barres mises à jour', ch)) {
      var old = JSON.parse(before);
      Object.keys(best).forEach(function (k) {
        var a = getA(h, k), ob = E.vertAthlete(old, k).best;
        if (a && best[k] && best[k] !== ob) { var z = alertsAt(r, h, a, best[k], null, best[k]); if (z.txt) al.push({ txt: z.txt, list: z.list, rank: (z.list[0] || {}).rank || 99 }); }
      });
    }
  }
  if (res.officiel && tg.d == null && (r.type === 'horiz' || r.type === 'vert')) liveSet(['done', r.id], true, heatText(r, h) + ' · résultats officiels', ch);
  if (r.type === 'course' && hasQ(r) && (!S.rules[r.id] || S.live['rule_' + r.id])) { // règle absente : on la déduit des Q/q officiels
    var nQ = 0, nq = 0; res.rows.forEach(function (row) { if (row.qualif === 'Q') nQ++; else if (row.qualif === 'q') nq++; });
    if (nQ || nq) {
      S.live[h.id + '_q'] = { Q: nQ, q: nq };
      var mQ = 0, sq = 0; r.heats.forEach(function (x) { var c = S.live[x.id + '_q']; if (c) { mQ = Math.max(mQ, c.Q); sq += c.q; } });
      var rule = mQ + 'Q' + (sq ? '+' + sq + 'q' : '');
      if (!r.qualif && ruleOf(r) !== rule) { S.live['rule_' + r.id] = 1; liveSet(['rules', r.id], rule, r.title + ' · qualification ' + rule + ' (déduite des résultats)', ch); }
    }
  }
  if (res.officiel && r.type === 'course' && hasQ(r) && ruleOf(r)) { // Q/q officiels : on ne corrige que là où le calcul diffère
    var qm = E.qualify(r, S.res, ruleOf(r));
    res.rows.forEach(function (row) {
      var a = findAth(h, row); if (!a) return;
      var off = row.qualif === 'Q' || row.qualif === 'q' ? row.qualif : '', auto = ((qm[h.id] || {})[a.key] || {}).auto || '';
      var path = ['qov', h.id, a.key], want = off === auto ? null : (off || '-');
      if (!isMan(path)) liveSet(path, want, heatText(r, h) + ' · ' + a.name + ' · qualification officielle ' + (off || 'non qualifié'), ch);
    });
  }
  if (res.officiel) S.live[tg.d != null ? r.id + '_' + tg.d : h.id] = { off: true, t: Date.now() };
  if (ch.length) {
    ch.forEach(function (c) { S.hist.unshift({ t: Date.now(), clk: nowMin(), path: c.path, prev: c.prev, val: c.val, txt: c.txt + (tg.mats ? ' (Matsport)' : ' (Direct)'), al: '', rid: r.id }); });
    if (al.length) { al.sort(function (x, y) { return x.rank - y.rank; }); S.hist[0].al = al[0].txt; announce(al[0].txt, al[0].list, Date.now()); }
  }
  return ch.length;
}
function liveTick() {
  if (!M || !liveOn() || LIVE_BUSY) return;
  var tg = liveTargets(); if (!tg.length) { LIVE_STATE = 'live ✓'; return; }
  LIVE_BUSY = true;
  var n = 0, chg = 0;
  var next = function () {
    if (n >= tg.length) {
      LIVE_BUSY = false; LIVE_STATE = 'live ✓';
      if (chg) { save(); if (tg.some(function (x) { return x.r.fromRound; })) build(); renderAll(); } else renderTop();
      return;
    }
    var t = tg[n++];
    var url = t.mats ? RAW.mats.api + '/events/' + t.mats : liveUrl(t.guid);
    relaisGet({ action: 'brut', url: url, ttl: t.mats ? 5 : 8 }).then(function (x) {
      if (x.ok && x.code === 200 && x.texte) {
        var res = t.mats ? CISI.matsResults(JSON.parse(x.texte)) : CISI.parseResultats(x.texte);
        if (res.rows.length) chg += liveApply(t, res);
      }
    }).catch(function () { LIVE_STATE = 'live en attente'; }).then(next);
  };
  next();
}

// ---------- actions (un seul écouteur pour tout l'écran) ----------
var CONFIRM = null;
function confirm2(key, btn, msg) { if (CONFIRM === key) { CONFIRM = null; return true; } CONFIRM = key; btn.textContent = msg; setTimeout(function () { if (CONFIRM === key) CONFIRM = null; }, 4000); return false; }
function pin(id) { if (S.pins.indexOf(id) < 0) S.pins.push(id); S.ptab = id; save(); }
function isPhone() { return window.innerWidth <= 700; }
document.addEventListener('click', function (ev) {
  if (ev.target.closest('a[href]')) return; // lien vers la fiche FFA / WA : on laisse s'ouvrir
  var el = ev.target.closest('[data-act]'); if (!el) return;
  var act = el.dataset.act, r = el.dataset.r ? ROUNDS[el.dataset.r] : null, h = r && el.dataset.h && el.dataset.h !== 'bilan' ? getH(r, el.dataset.h) : null, a = h && el.dataset.k ? getA(h, el.dataset.k) : null;
  if (act !== 'bannerClose' && act !== 'hist' && el.id === 'banner') { }
  switch (act) {
    case 'toggleHor':
      if (window.innerWidth <= 900) document.body.classList.toggle('showhor');
      else { document.body.classList.toggle('nohor'); lsSet('cis:nohor', document.body.classList.contains('nohor')); }
      break;
    case 'pick':
      if (el.dataset.d != null) S.heatSel[r.id] = el.dataset.d;
      if (S.pins.indexOf(r.id) < 0) pin(r.id); else { S.ptab = r.id; save(); var p = document.querySelector('.panel[data-r="' + r.id + '"]'); if (p && !isPhone()) p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }); }
      if (window.innerWidth <= 900) document.body.classList.remove('showhor');
      renderAll(); break;
    case 'pin': if (el.dataset.d != null) S.heatSel[r.id] = el.dataset.d; pin(r.id); closeSheet(); renderAll(); break;
    case 'unpin': S.pins = S.pins.filter(function (x) { return x !== r.id; }); save(); renderAll(); break;
    case 'ptab': S.ptab = r.id; save(); renderPanels(); window.scrollTo(0, 0); break;
    case 'heat': S.heatSel[r.id] = el.dataset.h; save(); renderPanels(); break;
    case 'sort': var cur = S.sortRank[h.id] != null ? S.sortRank[h.id] : (r.type === 'course' ? heatComplete(r, h) : true); S.sortRank[h.id] = !cur; save(); renderPanels(); break;
    case 'hide': S.hide[r.id] = !S.hide[r.id]; save(); renderPanels(); break;
    case 'fiche': ev.stopPropagation(); fiche(r, h, a); break;
    case 'perf': var x = (S.res[h.id] || {})[a.key] || {}; openKp({ mode: 'perf', r: r.id, h: h.id, k: a.key, raw: x.v != null ? E.valueToRaw(x.v, r.unit) : '', st: x.st }); break;
    case 'cperf':
      var dd = +el.dataset.d, xc = cmbOf(h, a)[dd], du = r.cmb[dd].unit;
      openKp({ mode: 'cmb', r: r.id, h: h.id, k: a.key, d: dd, raw: xc && xc.v != null ? E.valueToRaw(xc.v, du) : '', st: xc && xc.st, w: xc && xc.w != null ? String(Math.round(Math.abs(xc.w) * 10)) : '', sign: xc && xc.w < 0 ? -1 : 1 });
      break;
    case 'dtime': openKp({ mode: 'time', r: r.id, h: r.heats[0].id, d: +el.dataset.d }); break;
    case 'sortc': var sk = 'c' + r.id + el.dataset.d, cyc = { epr: 'gen', gen: 'ord', ord: 'epr' }; S.sortRank[sk] = cyc[S.sortRank[sk] === 'gen' || S.sortRank[sk] === 'ord' ? S.sortRank[sk] : 'epr']; save(); renderPanels(); break;
    case 'lane': if (r.fromRound) openKp({ mode: 'lane', r: r.id, h: h.id, k: a.key, raw: (S.lanes[h.id] || {})[a.key] || '' }); else { var x2 = (S.res[h.id] || {})[a.key] || {}; openKp({ mode: 'perf', r: r.id, h: h.id, k: a.key, raw: x2.v != null ? E.valueToRaw(x2.v, r.unit) : '', st: x2.st }); } break;
    case 'ess':
      var ess = (S.ess[h.id] || {})[a.key] || [], i = el.dataset.i != null ? +el.dataset.i : nextIdx(ess);
      if (i > 5) i = 5;
      if (i > nextIdx(ess)) i = nextIdx(ess);
      var e0 = ess[i];
      openKp({ mode: 'ess', r: r.id, h: h.id, k: a.key, i: i, raw: e0 && e0.v != null ? String(e0.v) : '', st: e0 && (e0.r === 'X' || e0.r === '-') ? e0.r : '', w: e0 && e0.w != null ? String(Math.round(Math.abs(e0.w) * 10)) : '', sign: e0 && e0.w < 0 ? -1 : 1 });
      break;
    case 'vt': if (!vObj(h.id).bars.length) openKp({ mode: 'bar', r: r.id, h: h.id }); else openKp({ mode: 'vt', r: r.id, h: h.id, k: a.key }); break;
    case 'bar': openKp({ mode: 'bar', r: r.id, h: h.id }); break;
    case 'barNav': var V = clone(vObj(h.id)); V.cur = Math.max(0, Math.min(V.bars.length - 1, V.cur + +el.dataset.d)); S.vert[h.id] = V; save(); renderPanels(); break;
    case 'wind': var w = S.wind[h.id]; openKp({ mode: 'wind', r: r.id, h: h.id, raw: w != null ? String(Math.round(Math.abs(w) * 10)) : '', sign: w < 0 ? -1 : 1 }); break;
    case 'q':
      ev.stopPropagation();
      var o = (S.qov[h.id] || {})[a.key], seq = [undefined, 'Q', 'q', '-'], nxt = seq[(seq.indexOf(o) + 1) % 4];
      commit(['qov', h.id, a.key], nxt || null, heatText(r, h) + ' · ' + a.name + ' · qualification ' + (nxt === '-' ? 'retirée' : nxt || 'automatique'), '', r.id);
      renderPanels(); break;
    case 'key': if (KP) kpKey(el.dataset.k); break;
    case 'kpField': if (KP) { KP.f = +el.dataset.f; renderKp(); } break;
    case 'rule': closeSheet(); ruleSheet(r); break;
    case 'ruleSet': commit(['rules', window._rule.r], el.dataset.v, ROUNDS[window._rule.r].title + ' · qualification ' + (el.dataset.v || 'aucune'), '', window._rule.r); closeSheet(); renderAll(); break;
    case 'ruleStep': var R0 = window._rule; R0[el.dataset.f] = Math.max(0, Math.min(16, R0[el.dataset.f] + +el.dataset.d)); $('#rQ').textContent = R0.Q; $('#rq').textContent = R0.q; break;
    case 'ruleOk': var R1 = window._rule, rv = R1.Q + 'Q' + (R1.q ? '+' + R1.q + 'q' : ''); commit(['rules', R1.r], rv, ROUNDS[R1.r].title + ' · qualification ' + rv, '', R1.r); closeSheet(); renderAll(); break;
    case 'menu': menuSheet(r); break;
    case 'recs': closeSheet(); recordsSheet(r); break;
    case 'shift': commit(['off', r.id], (S.off[r.id] || 0) + +el.dataset.d || null, r.title + ' ' + r.phase + ' · ' + (+el.dataset.d > 0 ? '+' : '') + el.dataset.d + ' min', '', r.id); closeSheet(); renderAll(); break;
    case 'setTime': closeSheet(); openKp({ mode: 'time', r: r.id, h: r.heats[0].id }); break;
    case 'delay':
      var d = +el.dataset.d, n = nowMin(), moved = 0;
      M.rounds.forEach(function (rr) { var st = status(rr); if (st === 'avenir' || (st === 'passe' && d > 0)) { S.off[rr.id] = (S.off[rr.id] || 0) + d; if (!S.off[rr.id]) delete S.off[rr.id]; moved++; } });
      S.hist.unshift({ t: Date.now(), clk: n, path: ['off'], prev: null, txt: 'Horaire : ' + (d > 0 ? '+' : '') + d + ' min sur ' + moved + ' épreuves à venir', al: '', undone: true });
      save(); renderAll(); break;
    case 'done': if (S.done[r.id]) delete S.done[r.id]; else S.done[r.id] = true; save(); closeSheet(); renderAll(); break;
    case 'mkfinal':
      var ql = qualifiedList(r);
      if (!ql.list.length) { alert('Aucun qualifié pour l\'instant : saisis les temps et la règle de qualification.'); break; }
      var lastT = Math.max.apply(null, r.heats.map(function (x) { return x.time || 0; }));
      S.finals = (S.finals || []).filter(function (f) { return f.from !== r.id; });
      S.finals.push({ from: r.id, time: lastT + 60, keys: ql.list.map(function (x) { return { h: x.h.id, k: x.a.key }; }) });
      save(); build(); pin('f' + r.id); closeSheet(); renderAll();
      if (!ql.complete) alert('Finale créée avec les qualifiés provisoires (toutes les séries ne sont pas saisies). Recrée-la depuis le bilan si besoin.');
      break;
    case 'rmfinal': if (!confirm2('rm' + r.id, el, 'Toucher encore pour supprimer')) break; S.finals = S.finals.filter(function (f) { return 'f' + f.from !== r.id; }); S.pins = S.pins.filter(function (x) { return x !== r.id; }); save(); build(); closeSheet(); renderAll(); break;
    case 'wipe':
      if (!confirm2('w' + r.id, el, syncOn() ? 'Toucher encore : efface aussi chez les autres' : 'Toucher encore pour tout effacer')) break;
      Object.keys(S.man || {}).forEach(function (k) { if (r.heats.some(function (x) { return k.indexOf('~' + x.id) >= 0; })) delete S.man[k]; });
      Object.keys(S.live || {}).forEach(function (k) { if (k.indexOf(r.id) === 0 || r.heats.some(function (x) { return k === x.id; })) delete S.live[k]; });
      r.heats.forEach(function (x) { delete S.res[x.id]; if (S.cmb) delete S.cmb[x.id]; delete S.ess[x.id]; delete S.vert[x.id]; delete S.wind[x.id]; delete S.qov[x.id]; });
      delete S.done[r.id]; save(); closeSheet(); renderAll(); break;
    case 'hist': if (el.id === 'banner' || el.closest('#banner')) { histSheet(); } else histSheet(); break;
    case 'bannerClose': ev.stopPropagation(); if (S.last) S.last.closed = true; save(); renderBanner(); break;
    case 'undo': undo(+el.dataset.i); histSheet(); break;
    case 'settings': settingsSheet(); break;
    case 'sheetClose': closeSheet(); break;
    case 'photosTog': lsSet('cis:photos', !photosOn()); settingsSheet(); renderAll(); break;
    case 'present': closeSheet(); presentSheet(r, h || r.heats[0]); break;
    case 'podium': closeSheet(); podiumSheet(r); break;
    case 'noteSave': var nv = ($('#noteTxt').value || '').trim(); commit(['notes', noteKey(a)], nv || null, 'Note · ' + a.name + (nv ? ' : ' + nv.slice(0, 40) : ' effacée'), '', r.id); closeSheet(); renderAll(); break;
    case 'rlSave':
      RL = { url: ($('#rlUrl').value || '').trim(), cle: ($('#rlCle').value || '').trim() }; lsSet('cis:relais', RL);
      if (RL.url && !/^https:\/\/script\.google(usercontent)?\.com\//.test(RL.url)) SHARE_MSG = 'Attention : l\'adresse doit commencer par https://script.google.com/…';
      else SHARE_MSG = relaisOk() ? 'Réglage enregistré. Recherche des réunions partagées…' : 'Partage désactivé.';
      SHARED = null; if (M && syncOn()) { syLoad(); syTick(); } settingsSheet(); pollShared(); break;
    case 'rlOff': RL = { url: '', cle: '' }; lsSet('cis:relais', RL); SHARED = null; SY = null; SHARE_MSG = ''; settingsSheet(); break;
    case 'share': kvGet('meeting').then(function (j) { if (j) shareMeeting(j); }); break;
    case 'openShared': openShared(el.dataset.id); break;
    case 'impDirect': doImportDirect(); break;
    case 'impMats': doImportMats(); break;
    case 'liveTog': lsSet('cis:live', !lsGet('cis:live', true)); settingsSheet(); renderTop(); break;
    case 'liveNow': S.live = {}; save(); closeSheet(); liveTick(); autoReimport(true); break;
    case 'invite':
      var link = location.origin + location.pathname + '#relais=' + encodeURIComponent(RL.url) + '&code=' + encodeURIComponent(RL.cle);
      (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { SHARE_MSG = 'Lien copié : envoie-le aux autres speakers (SMS, mail…).'; refreshShareUi(); })
        .catch(function () { SHARE_MSG = 'Lien à envoyer : ' + link; refreshShareUi(); });
      break;
    case 'open': $('#file').click(); break;
    case 'demo':
      fetch('data/demo.json').then(function (x) { return x.json(); }).then(function (j) { kvSet('meeting', j); closeSheet(); start(j, true); }).catch(function () { alert('Démo indisponible hors connexion (ouvre le site une fois en ligne).'); });
      break;
    case 'simSet': var v = ($('#simT').value || '').split(':'); if (v.length === 2) { S.clock = { sim: true, base: +v[0] * 60 + +v[1], at: Date.now() }; save(); closeSheet(); renderAll(); } break;
    case 'simOff': S.clock = { sim: false }; save(); closeSheet(); renderAll(); break;
    case 'exp':
      var blob = new Blob([JSON.stringify({ meeting: M.id, date: new Date().toISOString(), saisies: S })], { type: 'application/json' });
      var aL = document.createElement('a'); aL.href = URL.createObjectURL(blob); aL.download = 'saisies-' + M.id + '.json'; document.body.appendChild(aL); aL.click(); setTimeout(function () { URL.revokeObjectURL(aL.href); aL.remove(); }, 1000);
      break;
    case 'imp': $('#fileSaisies').click(); break;
    case 'wipeAll': if (!confirm2('all', el, syncOn() ? 'Toucher encore : efface aussi sur les autres appareils' : 'Toucher encore : tout effacer')) break; var keep = { pins: S.pins, clock: S.clock }; S = blank(); S.pins = keep.pins; S.clock = keep.clock; save(); build(); closeSheet(); renderAll(); break;
    case 'fs': var fs = act && +el.dataset.d ? Math.max(0.8, Math.min(1.5, (lsGet('cis:fs', 1) + +el.dataset.d))) : 1; lsSet('cis:fs', fs); document.documentElement.style.setProperty('--fs', fs); renderAll(); break;
  }
});
// clavier physique (tablette avec clavier, ordinateur)
document.addEventListener('keydown', function (e) {
  if (!KP || e.target.tagName === 'INPUT') return;
  var k = e.key;
  if (/^\d$/.test(k)) kpKey(k);
  else if (k === 'Backspace') kpKey('del');
  else if (k === 'Enter') kpKey('ok');
  else if (k === 'Escape') closeKp();
  else if (k === 'x' || k === 'X') kpKey('X');
  else if (k === '-') kpKey('-');
  else if (k === 'o' || k === 'O') kpKey('O');
  else return;
  e.preventDefault();
});

// ---------- démarrage ----------
document.documentElement.style.setProperty('--fs', lsGet('cis:fs', 1));
if (lsGet('cis:nohor', false)) document.body.classList.add('nohor');
function net() { document.body.classList.toggle('off', !navigator.onLine); }
window.addEventListener('online', net); window.addEventListener('offline', net); net();
window.addEventListener('resize', function () { if (M) renderBanner(); });
setInterval(function () {
  if (!M) return;
  var m = Math.floor(nowMin());
  renderTop();
  if (m !== lastMinute) { lastMinute = m; renderHor(); renderSuggest(); if (!KP) { /* statuts dans les en-têtes */ document.querySelectorAll('.panel').length && renderPanels(); } }
}, 5000);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () { });
renderTop();
kvGet('meeting').then(function (j) { if (j && (j.meeting || j.epreuves)) start(j); else welcome(); pollShared(); }).catch(function () { welcome(); pollShared(); });
setInterval(pollShared, 5000);
setInterval(syTick, 3000);
setInterval(liveTick, 10000);
setInterval(autoReimport, 60000);
window.addEventListener('online', syTick);
window.addEventListener('online', pollShared);
window.CIS = { get S() { return S; }, get M() { return M; }, nowMin: nowMin, reimp: function (f) { autoReimport(f); }, render: function () { save(); renderAll(); } };
})();
