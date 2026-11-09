'use strict';
/* Grimório de Traços — interface e lógica do app. */
var $ = function (id) { return document.getElementById(id); };

var DEF = {
  mode: 'contorno', detail: 35, smooth: 45, clean: 45, thick: 2, tones: 3, toneStyle: 'hachura', k: 10,
  texture: 65, contrast: 40, density: 50, link: 60, round: 40,
  ink: '#111111', inkOpacity: 100, invert: false, mirror: false, transparent: false,
  fill: 'nenhum', numbers: true,
  grid: false, gridCell: 5, gridColor: '#cc2222', gridOpacity: 60, gridLabels: true
};
var HEAVY = ['mode', 'detail', 'smooth', 'clean', 'thick', 'tones', 'toneStyle', 'k', 'texture', 'contrast', 'density', 'link', 'round'];
var SIZES = [[20, 30], [24, 30], [30, 40], [40, 50], [50, 70], [60, 80], [70, 100], [80, 100], [30, 30], [40, 40], [50, 50], [60, 60], [21, 29.7, 'A4'], [29.7, 42, 'A3']];
var BUILTIN_PRESETS = {
  'Silhueta limpa': { mode: 'contorno', detail: 35, smooth: 45, clean: 45, thick: 2, texture: 65, contrast: 40, density: 50, link: 60, round: 40 },
  'Silhueta detalhada': { mode: 'contorno', detail: 45, smooth: 40, clean: 40, thick: 1.75, texture: 55, contrast: 30, density: 40, link: 60, round: 40 },
  'Silhueta só do principal': { mode: 'contorno', detail: 25, smooth: 55, clean: 60, thick: 2.5, texture: 80, contrast: 50, density: 60, link: 65, round: 55 },
  'Carvão': { mode: 'esboco', detail: 55, smooth: 35, clean: 30 },
  'Sombras em hachura': { mode: 'sombras', detail: 45, smooth: 40, clean: 40, thick: 2, tones: 3, toneStyle: 'hachura', texture: 55, contrast: 30, density: 60, link: 50, round: 40 },
  'Sombras em manchas': { mode: 'sombras', detail: 45, smooth: 45, clean: 45, thick: 2, tones: 4, toneStyle: 'manchas', texture: 55, contrast: 30, density: 60, link: 50, round: 40 },
  'Vitral (12 cores)': { mode: 'manchas', k: 12, smooth: 40, clean: 40, thick: 1.5, numbers: true, fill: 'nenhum' },
  'Vitral simples (5 cores)': { mode: 'manchas', k: 5, smooth: 55, clean: 60, thick: 2.5, numbers: false, fill: 'cores' }
};

var S = {
  orig: null, origBlob: null, src: null, rot: 0, crop: { cx: 0.5, cy: 0.5, zoom: 1 },
  wcm: 40, hcm: 50, sizeKey: '40x50', land: false, longcm: 50,
  params: Object.assign({}, DEF), result: null, composed: null, cropPrev: null,
  view: 'decalque', userView: 'decalque', tab: 'recorte', name: '', id: null, dirty: false, palette: []
};

/* ---------- utilidades ---------- */
function toast(msg, ms) {
  var t = $('toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove('on'); }, ms || 3200);
}
function busy(msg) { $('busyMsg').textContent = msg || 'Processando…'; $('busy').classList.remove('hidden'); }
function unbusy() { $('busy').classList.add('hidden'); }
function nextFrame() { return new Promise(function (r) { setTimeout(r, 30); }); }
function fileBase() { return (S.name || 'grimorio').replace(/[^\w\-áéíóúâêôãõç ]+/gi, '').trim().replace(/\s+/g, '-') || 'decalque'; }

/* ---------- worker ---------- */
var WORKER_FUNCS = ['toneBandLayers', 'bilateral', 'edgeDensityCull', 'smoothMask', 'gaussKernel', 'blurDirect', 'boxesForGauss', 'boxPass', 'blurGray', 'toGray', 'canny', 'removeSmall', 'dilate',
  'maskToInk', 'sketchInk', 'modeFilter', 'labelComponents', 'distToBoundary', 'toneLevels', 'toneInk', 'srgb2lab', 'kmeansLab',
  'regionsEngine', 'runPipeline'];
var worker = null, wBusy = false, wQueue = [], wCur = null, wId = 0;
function makeWorker() {
  var src = WORKER_FUNCS.map(function (n) { return self[n].toString(); }).join('\n') + '\n' +
    'self.onmessage=function(e){var d=e.data;try{var r=runPipeline(new Uint8ClampedArray(d.buf),d.w,d.h,d.p);' +
    'var tr=[r.ink.buffer];if(r.labels)tr.push(r.labels.buffer);if(r.regions)tr.push(r.regions.buffer);' +
    'self.postMessage({id:d.id,r:r},tr);}catch(err){self.postMessage({id:d.id,error:String(err&&err.message||err)});}};';
  var w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  w.onmessage = function (e) {
    var job = wCur; wCur = null; wBusy = false;
    if (job) { if (e.data.error) job.reject(new Error(e.data.error)); else job.resolve(e.data.r); }
    pump();
  };
  w.onerror = function (e) {
    var job = wCur; wCur = null; wBusy = false;
    if (job) job.reject(new Error(e.message || 'falha no processamento'));
    worker = null; pump();
  };
  return w;
}
function pump() {
  if (wBusy || !wQueue.length) return;
  var job = wQueue.shift(); wBusy = true; wCur = job;
  if (!worker) worker = makeWorker();
  job.msg.id = ++wId;
  worker.postMessage(job.msg, [job.msg.buf]);
}
function runJob(msg, kind) {
  return new Promise(function (resolve, reject) {
    if (kind === 'preview') {
      wQueue = wQueue.filter(function (j) { if (j.kind === 'preview') { j.resolve(null); return false; } return true; });
    }
    wQueue.push({ msg: msg, kind: kind, resolve: resolve, reject: reject });
    pump();
  });
}

/* ---------- banco local (galeria) ---------- */
function dbOpen() {
  return new Promise(function (res, rej) {
    var rq = indexedDB.open('grimorio', 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('projetos', { keyPath: 'id' }); };
    rq.onsuccess = function () { res(rq.result); };
    rq.onerror = function () { rej(rq.error); };
  });
}
function dbDo(mode, fn) {
  return dbOpen().then(function (db) {
    return new Promise(function (res, rej) {
      var tx = db.transaction('projetos', mode), st = tx.objectStore('projetos'), rq = fn(st);
      tx.oncomplete = function () { res(rq && rq.result); };
      tx.onerror = function () { rej(tx.error); };
    });
  });
}
function dbAll() { return dbDo('readonly', function (s) { return s.getAll(); }); }
function dbGet(id) { return dbDo('readonly', function (s) { return s.get(id); }); }
function dbPut(o) { return dbDo('readwrite', function (s) { return s.put(o); }); }
function dbDel(id) { return dbDo('readwrite', function (s) { return s.delete(id); }); }

/* ---------- imagem e recorte ---------- */
async function loadBlob(blob) {
  var bmp;
  try { bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch (e) {
    bmp = await new Promise(function (res, rej) {
      var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(blob);
    });
  }
  var bw = bmp.width || bmp.naturalWidth, bh = bmp.height || bmp.naturalHeight;
  var sc = Math.min(1, 4200 / Math.max(bw, bh));
  var c = document.createElement('canvas'); c.width = Math.round(bw * sc); c.height = Math.round(bh * sc);
  var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  S.orig = c;
  S.origBlob = await canvasBlob(c, 'image/jpeg', 0.92);
}
function buildSrc() {
  var o = S.orig, r = S.rot, c = document.createElement('canvas');
  if (r % 2) { c.width = o.height; c.height = o.width; } else { c.width = o.width; c.height = o.height; }
  var ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2); ctx.rotate(r * Math.PI / 2);
  ctx.drawImage(o, -o.width / 2, -o.height / 2);
  S.src = c;
}
function cropRect() {
  var sw = S.src.width, sh = S.src.height, a = S.wcm / S.hcm, w0, h0;
  if (sw / sh > a) { h0 = sh; w0 = sh * a; } else { w0 = sw; h0 = sw / a; }
  var z = S.crop.zoom, w = w0 / z, h = h0 / z;
  var cx = Math.min(Math.max(S.crop.cx * sw, w / 2), sw - w / 2);
  var cy = Math.min(Math.max(S.crop.cy * sh, h / 2), sh - h / 2);
  S.crop.cx = cx / sw; S.crop.cy = cy / sh;
  return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
}
function workSize(L) {
  var a = S.wcm / S.hcm;
  return a >= 1 ? { w: L, h: Math.max(8, Math.round(L / a)) } : { w: Math.max(8, Math.round(L * a)), h: L };
}
function getWorkImage(L) {
  var s = workSize(L), c = document.createElement('canvas'); c.width = s.w; c.height = s.h;
  var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingQuality = 'high';
  var r = cropRect();
  ctx.drawImage(S.src, r.x, r.y, r.w, r.h, 0, 0, s.w, s.h);
  return { w: s.w, h: s.h, canvas: c, data: ctx.getImageData(0, 0, s.w, s.h) };
}

/* ---------- tamanho da tela ---------- */
function fillSizeSelect() {
  var sel = $('sizePreset'), html = '';
  SIZES.forEach(function (s) {
    var label = s[2] ? s[2] + ' (' + fmtCm(s[0]) + '×' + fmtCm(s[1]) + ' cm)' : s[0] + '×' + s[1] + ' cm';
    html += '<option value="' + s[0] + 'x' + s[1] + '">' + label + '</option>';
  });
  html += '<option value="foto">Proporção da foto</option><option value="custom">Personalizado</option>';
  sel.innerHTML = html;
}
function applySize() {
  var key = S.sizeKey, w, h;
  if (key === 'foto') {
    var a = S.src ? S.src.width / S.src.height : 1;
    if (a >= 1) { w = S.longcm; h = S.longcm / a; } else { h = S.longcm; w = S.longcm * a; }
  } else if (key === 'custom') {
    w = S.wcm; h = S.hcm;
  } else {
    var p = key.split('x').map(Number); w = Math.min(p[0], p[1]); h = Math.max(p[0], p[1]);
    if (S.land) { var t = w; w = h; h = t; }
  }
  S.wcm = Math.round(w * 10) / 10; S.hcm = Math.round(h * 10) / 10;
  $('wcm').value = S.wcm; $('hcm').value = S.hcm;
  $('sizePreset').value = key;
  $('photoSize').classList.toggle('hidden', key !== 'foto');
  $('sizeInfo').textContent = fmtCm(S.wcm) + ' × ' + fmtCm(S.hcm) + ' cm';
  updateTilesInfo();
}
function sizeChanged() {
  S.result = null; S.composed = null; S.dirty = true;
  applySize(); render(); schedule(120); saveLast(); hSoon();
}
function updateTilesInfo() {
  var o = Math.max(0.5, +$('overlap').value || 1), p = planTiles(S.wcm, S.hcm, o);
  $('tilesInfo').textContent = 'Tela de ' + fmtCm(S.wcm) + ' × ' + fmtCm(S.hcm) + ' cm = ' + p.count + (p.count === 1 ? ' folha A4' : ' folhas A4') +
    ' (' + p.cols + ' × ' + p.rows + ', ' + (p.land ? 'deitadas' : 'em pé') + ').';
}

/* ---------- composição final (cor, números, grade) ---------- */
function hexRgb(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
function colName(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function compose(res, P, wcm, hcm, transparent) {
  var w = res.w, h = res.h, n = w * h, i;
  var cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  var inkc = hexRgb(P.invert ? '#ffffff' : P.ink), op = P.inkOpacity / 100, bgv = P.invert ? 0 : 255;
  var useFill = !!res.labels && P.fill !== 'nenhum', pal = null;
  if (useFill) {
    pal = res.palette.map(function (c) {
      if (P.fill === 'cores') return [c.r, c.g, c.b];
      var y = Math.round(0.299 * c.r + 0.587 * c.g + 0.114 * c.b); return [y, y, y];
    });
  }
  for (i = 0; i < n; i++) {
    var r = bgv, g = bgv, b = bgv, a = transparent ? 0 : 255;
    if (useFill) { var c = pal[res.labels[i]]; r = c[0]; g = c[1]; b = c[2]; a = 255; }
    var t = res.ink[i] * op / 255;
    if (t > 0) {
      if (a === 0) { r = inkc[0]; g = inkc[1]; b = inkc[2]; a = Math.round(255 * t); }
      else { r += (inkc[0] - r) * t; g += (inkc[1] - g) * t; b += (inkc[2] - b) * t; }
    }
    var o = i * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = a;
  }
  ctx.putImageData(img, 0, 0);
  var out = cv;
  if (P.mirror) {
    out = document.createElement('canvas'); out.width = w; out.height = h;
    var c2 = out.getContext('2d'); c2.translate(w, 0); c2.scale(-1, 1); c2.drawImage(cv, 0, 0); c2.setTransform(1, 0, 0, 1, 0, 0);
    ctx = c2;
  }
  var L = Math.max(w, h);
  // números das manchas
  if (res.regions && P.numbers && P.mode === 'manchas') {
    var reg = res.regions, maxF = 0.026 * L, minF = 0.0085 * L;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (i = 0; i < reg.length; i += 4) {
      var x = reg[i], y = reg[i + 1], li = reg[i + 2], dd = reg[i + 3], txt = String(li + 1);
      var fs = Math.min(maxF, dd * (txt.length > 1 ? 1.0 : 1.25));
      if (fs < minF) continue;
      if (P.mirror) x = w - x;
      var col = '#' + ('000000' + ((inkc[0] << 16) | (inkc[1] << 8) | inkc[2]).toString(16)).slice(-6);
      if (useFill) { var pc = pal[li], lum = 0.299 * pc[0] + 0.587 * pc[1] + 0.114 * pc[2]; col = lum < 120 ? '#ffffff' : '#000000'; }
      ctx.fillStyle = col; ctx.font = fs + 'px sans-serif'; ctx.fillText(txt, x, y + fs * 0.05);
    }
    ctx.textBaseline = 'alphabetic';
  }
  // quadriculado
  if (P.grid) {
    var cell = +P.gridCell * w / wcm;
    if (cell >= 6) {
      ctx.save(); ctx.globalAlpha = P.gridOpacity / 100; ctx.strokeStyle = P.gridColor; ctx.lineWidth = Math.max(1, w / 1300);
      ctx.beginPath();
      for (var gx = cell; gx < w - 1; gx += cell) { ctx.moveTo(gx, 0); ctx.lineTo(gx, h); }
      for (var gy = cell; gy < h - 1; gy += cell) { ctx.moveTo(0, gy); ctx.lineTo(w, gy); }
      ctx.stroke(); ctx.restore();
      if (P.gridLabels) {
        var fs2 = Math.max(w / 70, Math.min(cell * 0.4, w / 28));
        ctx.save(); ctx.font = 'bold ' + fs2 + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        var ci = 0, ri = 0, pad = fs2 * 0.35;
        for (var cx = 0; cx < w - 1; cx += cell, ci++) {
          var tw = Math.min(cell, w - cx), tx = cx + tw / 2, tt = colName(ci), mw = ctx.measureText(tt).width + pad * 2;
          ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff'; ctx.fillRect(tx - mw / 2, 0, mw, fs2 * 1.3);
          ctx.globalAlpha = 1; ctx.fillStyle = P.gridColor; ctx.fillText(tt, tx, fs2 * 0.68);
        }
        for (var cy = 0; cy < h - 1; cy += cell, ri++) {
          var th = Math.min(cell, h - cy), ty = cy + th / 2, rt = String(ri + 1), rw = ctx.measureText(rt).width + pad * 2;
          ctx.globalAlpha = 0.8; ctx.fillStyle = '#fff'; ctx.fillRect(0, ty - fs2 * 0.65, rw, fs2 * 1.3);
          ctx.globalAlpha = 1; ctx.fillStyle = P.gridColor; ctx.fillText(rt, rw / 2, ty + fs2 * 0.03);
        }
        ctx.restore();
      }
    }
  }
  return out;
}
function refreshComposed() {
  S.composed = S.result ? compose(S.result, S.params, S.wcm, S.hcm, false) : null;
}

/* ---------- exibição ---------- */
function render() {
  var cv = $('view');
  if (!S.src) return;
  var s = workSize(1000);
  if (cv.width !== s.w || cv.height !== s.h) { cv.width = s.w; cv.height = s.h; }
  var ctx = cv.getContext('2d');
  var cropMode = S.tab === 'recorte' && S.view === 'original';
  cv.classList.toggle('crop', cropMode);
  var showOrig = S.view === 'original' || S.view === 'comparar' || !S.composed;
  if (showOrig || S.view === 'sobrepor') {
    var r = cropRect(); ctx.imageSmoothingQuality = 'medium';
    ctx.drawImage(S.src, r.x, r.y, r.w, r.h, 0, 0, s.w, s.h);
  }
  if (S.view === 'decalque' && S.composed) ctx.drawImage(S.composed, 0, 0, s.w, s.h);
  else if (S.view === 'sobrepor' && S.composed) {
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(compose(S.result, S.params, S.wcm, S.hcm, true), 0, 0, s.w, s.h);
    ctx.restore();
  } else if (S.view === 'comparar' && S.composed) {
    if (S.cmp == null) S.cmp = 0.5;
    var cx = Math.round(S.cmp * s.w);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, cx, s.h); ctx.clip();
    ctx.drawImage(S.composed, 0, 0, s.w, s.h); ctx.restore();
    var lw = Math.max(2, s.w / 400), hr = Math.max(14, s.w / 28);
    ctx.fillStyle = '#b89a5a'; ctx.fillRect(cx - lw / 2, 0, lw, s.h);
    ctx.beginPath(); ctx.arc(cx, s.h / 2, hr, 0, 6.2832); ctx.fillStyle = '#120d16'; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = '#b89a5a'; ctx.stroke();
    ctx.fillStyle = '#b89a5a'; ctx.font = Math.round(hr * 0.9) + 'px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('↔', cx, s.h / 2 + 1);
  }
  document.querySelectorAll('.chip').forEach(function (b) { b.classList.toggle('on', b.dataset.view === S.view); });
}
var timer = 0, seq = 0, palTimer = 0;
function schedule(delay) {
  if (!S.src) return;
  clearTimeout(timer); $('spin').classList.remove('hidden');
  timer = setTimeout(runPreview, delay == null ? 180 : delay);
}
function heavyParams() { var p = {}; HEAVY.forEach(function (k) { p[k] = S.params[k]; }); return p; }
async function runPreview() {
  var my = ++seq, im = getWorkImage(1000), r;
  try { r = await runJob({ w: im.w, h: im.h, buf: im.data.data.buffer, p: heavyParams() }, 'preview'); }
  catch (e) { $('spin').classList.add('hidden'); toast('Erro ao processar: ' + e.message); return; }
  if (r === null || my !== seq) return;
  S.result = r; $('spin').classList.add('hidden');
  refreshComposed(); render();
  clearTimeout(palTimer); palTimer = setTimeout(function () { S.palette = dominantColors(im.canvas, 8); drawPalette(); }, 50);
}
function dominantColors(canvas, k) {
  var sc = Math.min(1, 96 / Math.max(canvas.width, canvas.height));
  var w = Math.max(1, Math.round(canvas.width * sc)), h = Math.max(1, Math.round(canvas.height * sc));
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(canvas, 0, 0, w, h);
  var data = ctx.getImageData(0, 0, w, h).data, m = w * h, X = new Float32Array(m * 3), i, j;
  for (i = 0; i < m; i++) srgb2lab(data[i * 4], data[i * 4 + 1], data[i * 4 + 2], X, i * 3);
  var kk = Math.min(k, m), C = kmeansLab(X, m, kk, 12);
  var sr = new Float64Array(kk), sg = new Float64Array(kk), sb = new Float64Array(kk), ct = new Int32Array(kk);
  for (i = 0; i < m; i++) {
    var best = 0, bd = 1e30;
    for (j = 0; j < kk; j++) {
      var dx = X[i * 3] - C[j * 3], dy = X[i * 3 + 1] - C[j * 3 + 1], dz = X[i * 3 + 2] - C[j * 3 + 2], dd = dx * dx + dy * dy + dz * dz;
      if (dd < bd) { bd = dd; best = j; }
    }
    sr[best] += data[i * 4]; sg[best] += data[i * 4 + 1]; sb[best] += data[i * 4 + 2]; ct[best]++;
  }
  var out = [];
  for (j = 0; j < kk; j++) if (ct[j] > 0) out.push({ r: Math.round(sr[j] / ct[j]), g: Math.round(sg[j] / ct[j]), b: Math.round(sb[j] / ct[j]), share: ct[j] / m });
  out.sort(function (a, b) { return b.share - a.share; });
  return out;
}
function drawPalette() {
  $('palette').innerHTML = S.palette.map(function (c, i) {
    return '<span><i style="background:rgb(' + c.r + ',' + c.g + ',' + c.b + ')"></i>' + (i + 1) + ' · ' + toHex(c.r, c.g, c.b).toUpperCase() + '</span>';
  }).join('');
}

/* ---------- gestos de recorte ---------- */
(function () {
  var ptrs = new Map(), startDist = 0, startZoom = 1, view = null;
  function dist() { var a = Array.from(ptrs.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  document.addEventListener('DOMContentLoaded', function () {
    view = $('view');
    view.addEventListener('pointerdown', function (e) {
      if (!view.classList.contains('crop')) return;
      view.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { startDist = dist(); startZoom = S.crop.zoom; }
    });
    view.addEventListener('pointermove', function (e) {
      if (!ptrs.has(e.pointerId)) return;
      var prev = ptrs.get(e.pointerId), nx = e.clientX, ny = e.clientY;
      if (ptrs.size === 1) {
        var r = cropRect(), k = r.w / view.getBoundingClientRect().width;
        S.crop.cx -= (nx - prev.x) * k / S.src.width; S.crop.cy -= (ny - prev.y) * k / S.src.height;
      }
      ptrs.set(e.pointerId, { x: nx, y: ny });
      if (ptrs.size === 2 && startDist > 0) {
        S.crop.zoom = Math.min(6, Math.max(1, startZoom * dist() / startDist));
        $('zoom').value = S.crop.zoom; $('zoomOut').textContent = (Math.round(S.crop.zoom * 10) / 10) + '×';
      }
      render();
    });
    function up(e) {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.delete(e.pointerId);
      if (ptrs.size === 0) { S.dirty = true; S.result = null; S.composed = null; schedule(80); hSoon(); }
    }
    view.addEventListener('pointerup', up); view.addEventListener('pointercancel', up);
  });
})();

/* ---------- interface: ligação dos controles ---------- */
function syncUI() {
  var P = S.params;
  document.querySelectorAll('[data-p]').forEach(function (el) {
    var v = P[el.dataset.p];
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    var out = el.parentElement.querySelector('output'); if (out) out.textContent = v;
  });
  document.querySelectorAll('[data-modes]').forEach(function (el) {
    el.classList.toggle('hidden', el.dataset.modes.split(',').indexOf(P.mode) < 0);
  });
  document.querySelectorAll('.mode').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === P.mode); });
  $('zoom').value = S.crop.zoom; $('zoomOut').textContent = (Math.round(S.crop.zoom * 10) / 10) + '×';
  $('longcm').value = S.longcm;
  applySize();
}
function saveLast() {
  try { localStorage.setItem('grimorio.last', JSON.stringify({ params: S.params, sizeKey: S.sizeKey, land: S.land, longcm: S.longcm, wcm: S.wcm, hcm: S.hcm, deliver: $('deliver').value, quality: $('quality').value })); } catch (e) { }
}
function loadLast() {
  try {
    var o = JSON.parse(localStorage.getItem('grimorio.last') || 'null');
    if (!o) return;
    S.params = Object.assign({}, DEF, o.params); S.sizeKey = o.sizeKey || S.sizeKey; S.land = !!o.land; S.longcm = o.longcm || 50;
    S.wcm = o.wcm || S.wcm; S.hcm = o.hcm || S.hcm;
    if (o.deliver) $('deliver').value = o.deliver; if (o.quality) $('quality').value = o.quality;
  } catch (e) { }
}
function setTab(t) {
  S.tab = t;
  document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); });
  document.querySelectorAll('.panel').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + t); });
  S.view = t === 'recorte' ? 'original' : S.userView;
  if (t === 'exportar') updateTilesInfo();
  render();
}
function addNudges() {
  document.querySelectorAll('input[type=range][data-p]').forEach(function (el) {
    if (el.dataset.nudged) return; el.dataset.nudged = '1';
    var step = +el.step || 1;
    function mk(txt, dir) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'nudge'; b.textContent = txt;
      b.setAttribute('aria-label', dir < 0 ? 'Diminuir' : 'Aumentar');
      b.addEventListener('click', function () {
        var v = Math.min(+el.max, Math.max(+el.min, (+el.value) + dir * step));
        el.value = v; el.dispatchEvent(new Event('input'));
      });
      return b;
    }
    el.parentElement.insertBefore(mk('−', -1), el);
    el.parentElement.insertBefore(mk('+', 1), el.nextSibling);
  });
}
function bindUI() {
  fillSizeSelect();
  addNudges();
  document.querySelectorAll('[data-p]').forEach(function (el) {
    var k = el.dataset.p, ev = el.type === 'range' ? 'input' : 'change';
    el.addEventListener(ev, function () {
      var v = el.type === 'checkbox' ? el.checked : (el.type === 'range' ? +el.value : el.value);
      if (k === 'gridCell') v = +v;
      S.params[k] = v; S.dirty = true; hSoon();
      var out = el.parentElement.querySelector('output'); if (out) out.textContent = v;
      if (HEAVY.indexOf(k) >= 0) schedule(); else { refreshComposed(); render(); }
      saveLast();
    });
  });
  document.querySelectorAll('.mode').forEach(function (b) {
    b.addEventListener('click', function () { S.params.mode = b.dataset.mode; S.dirty = true; hSoon(); syncUI(); schedule(60); saveLast(); });
  });
  document.querySelectorAll('.tab').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  document.querySelectorAll('.chip').forEach(function (b) {
    b.addEventListener('click', function () { S.userView = S.view = b.dataset.view; render(); });
  });
  $('sizePreset').addEventListener('change', function () { S.sizeKey = $('sizePreset').value; sizeChanged(); });
  function manual() { S.sizeKey = 'custom'; S.wcm = Math.max(5, +$('wcm').value || 30); S.hcm = Math.max(5, +$('hcm').value || 40); sizeChanged(); }
  $('wcm').addEventListener('change', manual); $('hcm').addEventListener('change', manual);
  $('longcm').addEventListener('change', function () { S.longcm = Math.max(10, +$('longcm').value || 50); sizeChanged(); });
  $('btnSwap').addEventListener('click', function () {
    if (S.sizeKey === 'custom' || S.sizeKey === 'foto') {
      var t = S.wcm; S.wcm = S.hcm; S.hcm = t; S.sizeKey = 'custom';
    } else S.land = !S.land;
    sizeChanged();
  });
  $('btnRot').addEventListener('click', function () {
    S.rot = (S.rot + 1) % 4; buildSrc(); S.crop = { cx: 0.5, cy: 0.5, zoom: 1 };
    $('zoom').value = 1; $('zoomOut').textContent = '1×'; sizeChanged();
  });
  $('btnCenter').addEventListener('click', function () {
    S.crop = { cx: 0.5, cy: 0.5, zoom: 1 }; $('zoom').value = 1; $('zoomOut').textContent = '1×'; sizeChanged();
  });
  $('zoom').addEventListener('input', function () {
    S.crop.zoom = +$('zoom').value; $('zoomOut').textContent = (Math.round(S.crop.zoom * 10) / 10) + '×'; S.dirty = true; render();
  });
  $('zoom').addEventListener('change', function () { S.result = null; S.composed = null; schedule(60); hSoon(); });
  $('overlap').addEventListener('change', updateTilesInfo);
  $('deliver').addEventListener('change', saveLast); $('quality').addEventListener('change', saveLast);
  $('projName').addEventListener('input', function () { S.name = $('projName').value; S.dirty = true; });

  // modelos
  function userPresets() { try { return JSON.parse(localStorage.getItem('grimorio.presets') || '{}'); } catch (e) { return {}; } }
  function fillPresets() {
    var u = userPresets(), html = '<option value="">— escolher —</option>';
    Object.keys(BUILTIN_PRESETS).forEach(function (n) { html += '<option value="b:' + n + '">' + n + '</option>'; });
    Object.keys(u).forEach(function (n) { html += '<option value="u:' + n + '">★ ' + n + '</option>'; });
    $('presetSel').innerHTML = html;
  }
  fillPresets();
  $('presetSel').addEventListener('change', function () {
    var v = $('presetSel').value; if (!v) return;
    var src = v[0] === 'b' ? BUILTIN_PRESETS[v.slice(2)] : userPresets()[v.slice(2)];
    if (!src) return;
    S.params = Object.assign({}, S.params, src); S.dirty = true; hSoon(); syncUI(); schedule(60); saveLast(); toast('Modelo aplicado.');
  });
  $('presetSave').addEventListener('click', function () {
    var n = (prompt('Nome do modelo:') || '').trim(); if (!n) return;
    var u = userPresets(); u[n] = Object.assign({}, S.params); localStorage.setItem('grimorio.presets', JSON.stringify(u));
    fillPresets(); $('presetSel').value = 'u:' + n; toast('Modelo salvo.');
  });
  $('presetDel').addEventListener('click', function () {
    var v = $('presetSel').value;
    if (!v || v[0] !== 'u') { toast('Escolha um modelo seu (marcado com ★) para excluir.'); return; }
    var u = userPresets(); delete u[v.slice(2)]; localStorage.setItem('grimorio.presets', JSON.stringify(u)); fillPresets(); toast('Modelo excluído.');
  });
}

/* ---------- exportação ---------- */
async function produce(transparent, Lopt) {
  var L = Lopt || +$('quality').value, mode = S.params.mode;
  if (mode === 'manchas') L = Math.min(L, 3600);
  var im = getWorkImage(L);
  var r = await runJob({ w: im.w, h: im.h, buf: im.data.data.buffer, p: heavyParams() }, 'export');
  return { res: r, comp: compose(r, S.params, S.wcm, S.hcm, transparent) };
}
async function guarded(msg, fn) {
  if (!S.src) return;
  busy(msg); await nextFrame();
  try { await fn(); } catch (e) { console.error(e); toast('Não foi possível gerar: ' + (e && e.message || e), 5000); }
  unbusy();
}
function wantLegend(res) { return $('exLegend').checked && res.palette && S.params.mode === 'manchas' && S.params.numbers; }
function bindExport() {
  var mode = function () { return $('deliver').value; };
  $('exPng').addEventListener('click', function () {
    guarded('Gerando a imagem…', async function () {
      var p = await produce(S.params.transparent);
      var blob = await canvasBlob(p.comp, 'image/png');
      await deliverBlob(blob, fileBase() + '-decalque.png', mode());
    });
  });
  $('exPdfA4').addEventListener('click', function () {
    guarded('Gerando o PDF…', async function () {
      var p = await produce(false), pages = [function () { return renderFitPage(p.comp, S.wcm, S.hcm, S.name); }];
      if (wantLegend(p.res)) pages.push(function () { return renderLegendPage(p.res.palette, S.name); });
      var blob = await pagesToPDF(pages);
      await deliverBlob(blob, fileBase() + '-A4.pdf', mode());
    });
  });
  $('exLayers').addEventListener('click', function () {
    guarded('Gerando as camadas…', async function () {
      var im = getWorkImage(Math.min(+$('quality').value, 2800));
      var r = await runJob({ w: im.w, h: im.h, buf: im.data.data.buffer, p: Object.assign(heavyParams(), { layers: true }) }, 'export');
      if (!r || !r.layers) { toast('As camadas existem nos modos Silhueta e Sombras.'); return; }
      var pages = r.layers.map(function (ly, i) {
        return function () {
          var comp = compose({ w: r.w, h: r.h, ink: ly.ink }, S.params, S.wcm, S.hcm, false);
          return renderFitPage(comp, S.wcm, S.hcm, (S.name || 'Decalque') + ' · camada ' + (i + 1) + ': ' + ly.name);
        };
      });
      var blob = await pagesToPDF(pages);
      await deliverBlob(blob, fileBase() + '-camadas.pdf', mode());
    });
  });
  $('exPdfTiles').addEventListener('click', function () {
    guarded('Gerando as folhas…', async function () {
      var p = await produce(false), plan = planTiles(S.wcm, S.hcm, Math.max(0.5, +$('overlap').value || 1));
      if (plan.count > 60 && !confirm('Serão ' + plan.count + ' folhas. Continuar?')) return;
      var pages = [function () { return renderIndexPage(plan, S.wcm, S.hcm); }], n = 0;
      for (var r = 0; r < plan.rows; r++) for (var c = 0; c < plan.cols; c++) {
        (function (c, r, idx) { pages.push(function () { return renderTile(p.comp, plan, c, r, idx, plan.count); }); })(c, r, ++n);
      }
      if (wantLegend(p.res)) pages.push(function () { return renderLegendPage(p.res.palette, S.name); });
      var blob = await pagesToPDF(pages, function (i, t) { $('busyMsg').textContent = 'Montando folha ' + i + ' de ' + t + '…'; });
      await deliverBlob(blob, fileBase() + '-tamanho-real-' + plan.count + 'folhas.pdf', mode());
    });
  });
  $('exPalette').addEventListener('click', function () {
    guarded('Gerando a paleta…', async function () {
      if (!S.palette.length) { var im = getWorkImage(300); S.palette = dominantColors(im.canvas, 8); drawPalette(); }
      var blob = await canvasBlob(renderPaletteCard(S.palette, S.name), 'image/png');
      await deliverBlob(blob, fileBase() + '-paleta.png', mode());
    });
  });
}

/* ---------- projetos e galeria ---------- */
var EGGS = [
  { q: '“There you are. I’ve been looking for you.”', k: 'calanmai', w: 'Rhysand, na noite de Calanmai', s: 'A Court of Thorns and Roses' },
  { q: '“We need hope, or else we cannot endure.”', k: 'esperanca', w: 'O pai de Feyre, no mundo humano', s: 'A Court of Thorns and Roses' },
  { q: '“Be glad of your human heart.”', k: 'montanha', w: 'Rhysand, Sob a Montanha', s: 'A Court of Thorns and Roses' },
  { q: '“I was a survivor, and I was strong.”', k: 'pincel', w: 'Feyre', s: 'A Court of Mist and Fury' },
  { q: '“To the stars who listen.”', k: 'brinde', w: 'Rhysand, num brinde na Corte do Verão', s: 'A Court of Mist and Fury' },
  { q: 'O Suriel só diz a verdade a quem for esperto o bastante para prendê-lo.', k: 'suriel', w: 'Homenagem ao Suriel', s: 'Não é citação do livro' }
];
var EGG_QUOTE = EGGS[0].q;
function pickEgg(random) {
  var i = 0;
  try { i = parseInt(localStorage.getItem('grimorio.egg2'), 10) || 0; } catch (e) { }
  if (random) return EGGS[Math.floor(Math.random() * EGGS.length)];
  i = ((i % EGGS.length) + EGGS.length) % EGGS.length;
  try { localStorage.setItem('grimorio.egg2', String(i + 1)); } catch (e) { }
  return EGGS[i];
}
function greeting() {
  var h = new Date().getHours();
  return (h >= 5 && h < 12 ? 'Bom dia' : (h >= 12 && h < 18 ? 'Boa tarde' : 'Boa noite')) + ', Bárbara.';
}
function showEgg(random) {
  var egg = $('egg'), box = $('eggStars'), ev = pickEgg(random);
  $('eggQ').textContent = ev.q; $('eggWho').textContent = ev.w; $('eggSrc').textContent = ev.s;
  $('eggScene').innerHTML = window.EGG_SCENES && EGG_SCENES[ev.k] ? EGG_SCENES[ev.k]() : '';
  box.style.display = ev.k === 'esperanca' || ev.k === 'montanha' || ev.k === 'suriel' ? 'none' : '';
  if (!box.firstChild) {
    for (var i = 0; i < 70; i++) {
      var st = document.createElement('i'), sz = 1 + Math.random() * 2.4;
      st.style.cssText = 'left:' + (Math.random() * 100) + '%;top:' + (Math.random() * 100) + '%;width:' + sz + 'px;height:' + sz + 'px;animation-delay:' + (Math.random() * 3).toFixed(2) + 's;animation-duration:' + (2.2 + Math.random() * 2.5).toFixed(2) + 's';
      box.appendChild(st);
    }
  }
  egg.classList.remove('hidden');
  requestAnimationFrame(function () { requestAnimationFrame(function () { egg.classList.add('on'); }); });
  clearTimeout(showEgg.t); showEgg.t = setTimeout(hideEgg, 30000);
}
function hideEgg() {
  var egg = $('egg'); egg.classList.remove('on');
  setTimeout(function () { egg.classList.add('hidden'); }, 900);
}
function bindEgg() {
  var taps = [];
  $('emblem').addEventListener('click', function () {
    var now = Date.now(); taps.push(now);
    taps = taps.filter(function (t) { return now - t < 4000; });
    if (taps.length >= 5) { taps = []; showEgg(false); }
  });
  $('eggX').addEventListener('click', function (e) { e.stopPropagation(); clearTimeout(showEgg.t); hideEgg(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('egg').classList.contains('hidden')) { clearTimeout(showEgg.t); hideEgg(); } });
}
function showScreen(name) {
  if (name === 'home') $('greet').textContent = greeting();
  $('home').classList.toggle('hidden', name !== 'home');
  $('editor').classList.toggle('hidden', name !== 'editor');
}
function thumbOf() {
  var src = S.composed || S.cropPrev; if (!src) return '';
  var c = document.createElement('canvas'), sc = 280 / Math.max(src.width, src.height);
  c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc);
  var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.8);
}
async function saveProject(silent) {
  if (!S.src) return;
  if (!S.id) S.id = 'p' + Date.now();
  if (!S.name) S.name = 'Traço de ' + new Date().toLocaleDateString('pt-BR');
  $('projName').value = S.name;
  await dbPut({
    id: S.id, nome: S.name, data: Date.now(), thumb: thumbOf(), img: S.origBlob, rot: S.rot, crop: S.crop,
    wcm: S.wcm, hcm: S.hcm, sizeKey: S.sizeKey, land: S.land, longcm: S.longcm, params: S.params
  });
  S.dirty = false;
  if (!silent) toast('Guardado no grimório.');
}
async function openEditor(isNew) {
  showScreen('editor'); history.pushState({ ed: 1 }, '');
  $('projName').value = S.name;
  S.userView = 'decalque'; setTab('recorte');
  syncUI(); render(); schedule(50); hReset();
  if (isNew) S.dirty = true;
}
async function startWithBlob(blob) {
  var rare = Math.random() < 1 / 20;
  var eg = rare ? pickEgg(true) : null;
  busy(rare ? eg.q : 'Abrindo a imagem…'); await nextFrame();
  try {
    await loadBlob(blob);
    if (rare) await new Promise(function (r) { setTimeout(r, 2600); });
    S.rot = 0; buildSrc(); S.crop = { cx: 0.5, cy: 0.5, zoom: 1 }; S.id = null; S.result = null; S.composed = null; S.palette = [];
    S.name = 'Traço de ' + new Date().toLocaleDateString('pt-BR');
    if (S.sizeKey !== 'foto' && S.sizeKey !== 'custom') S.land = S.src.width > S.src.height;
    else if (S.sizeKey === 'custom' && (S.src.width > S.src.height) !== (S.wcm > S.hcm)) { var t = S.wcm; S.wcm = S.hcm; S.hcm = t; }
    applySize();
    await openEditor(true);
  } catch (e) { console.error(e); toast('Não consegui abrir essa imagem.'); }
  unbusy();
}
async function openProject(id) {
  busy('Abrindo…'); await nextFrame();
  try {
    var p = await dbGet(id); if (!p) { toast('Projeto não encontrado.'); unbusy(); return; }
    await loadBlob(p.img);
    S.id = p.id; S.name = p.nome; S.rot = p.rot || 0; buildSrc(); S.crop = p.crop || { cx: 0.5, cy: 0.5, zoom: 1 };
    S.wcm = p.wcm; S.hcm = p.hcm; S.sizeKey = p.sizeKey || 'custom'; S.land = !!p.land; S.longcm = p.longcm || 50;
    S.params = Object.assign({}, DEF, p.params); S.result = null; S.composed = null; S.palette = [];
    await openEditor(false); S.dirty = false;
  } catch (e) { console.error(e); toast('Não consegui abrir esse projeto.'); }
  unbusy();
}
async function closeEditor(fromPop) {
  if (S.dirty && S.src) { try { await saveProject(true); } catch (e) { } }
  showScreen('home'); loadGallery();
  if (!fromPop && history.state && history.state.ed) history.back();
}
async function loadGallery() {
  var list = [];
  try { list = await dbAll(); } catch (e) { }
  list.sort(function (a, b) { return b.data - a.data; });
  var g = $('gallery');
  if (!list.length) { g.innerHTML = '<p class="empty">O grimório ainda está vazio.</p>'; return; }
  g.innerHTML = '';
  list.forEach(function (p) {
    var d = document.createElement('div'); d.className = 'proj';
    d.innerHTML = '<img alt=""><div class="meta"><b></b><span></span></div><button class="del" aria-label="Excluir">✕</button>';
    d.querySelector('img').src = p.thumb || '';
    d.querySelector('b').textContent = p.nome;
    d.querySelector('span').textContent = fmtCm(p.wcm) + '×' + fmtCm(p.hcm) + ' cm';
    d.addEventListener('click', function (e) {
      if (e.target.classList.contains('del')) {
        if (confirm('Excluir "' + p.nome + '"?')) dbDel(p.id).then(loadGallery);
        return;
      }
      openProject(p.id);
    });
    g.appendChild(d);
  });
}

/* ---------- início, atalhos e PWA ---------- */
function applyUiScale(p) {
  p = Math.max(90, Math.min(190, p));
  document.documentElement.style.setProperty('--ui', p + '%');
  try { localStorage.setItem('grimorio.ui', String(p)); } catch (e) {}
  return p;
}
function bindUiScale() {
  var p = 118;
  try { p = parseInt(localStorage.getItem('grimorio.ui'), 10) || 118; } catch (e) {}
  p = applyUiScale(p);
  $('uiMinus').addEventListener('click', function () { p = applyUiScale(p - 10); });
  $('uiPlus').addEventListener('click', function () { p = applyUiScale(p + 10); });
}

/* ---------- desfazer / refazer ---------- */
var H = { a: [], i: -1, t: 0 };
function hSnap() { return JSON.stringify({ p: S.params, c: S.crop, r: S.rot, k: S.sizeKey, w: S.wcm, h: S.hcm, l: S.land, g: S.longcm }); }
function hBtns() { $('btnUndo').disabled = H.i <= 0; $('btnRedo').disabled = H.i >= H.a.length - 1; }
function hReset() { clearTimeout(H.t); H.a = [hSnap()]; H.i = 0; hBtns(); }
function hPush() {
  var s = hSnap(); if (H.a[H.i] === s) return;
  H.a = H.a.slice(0, H.i + 1); H.a.push(s); if (H.a.length > 80) H.a.shift();
  H.i = H.a.length - 1; hBtns();
}
function hSoon() { clearTimeout(H.t); H.t = setTimeout(hPush, 500); }
function hGo(d) {
  clearTimeout(H.t); hPush();
  var ni = H.i + d; if (ni < 0 || ni >= H.a.length) return;
  H.i = ni; var o = JSON.parse(H.a[ni]);
  S.params = o.p; S.crop = o.c; S.sizeKey = o.k; S.wcm = o.w; S.hcm = o.h; S.land = o.l; S.longcm = o.g;
  if (o.r !== S.rot) { S.rot = o.r; buildSrc(); }
  $('zoom').value = S.crop.zoom; $('zoomOut').textContent = (Math.round(S.crop.zoom * 10) / 10) + '×';
  S.result = null; S.composed = null; S.dirty = true;
  applySize(); syncUI(); render(); schedule(60); saveLast(); hBtns();
  toast(d < 0 ? 'Desfeito.' : 'Refeito.', 900);
}

/* ---------- comparar (cortina antes/depois) ---------- */
(function () {
  var drag = false;
  function setX(e, v) { var r = v.getBoundingClientRect(); S.cmp = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); render(); }
  document.addEventListener('DOMContentLoaded', function () {
    var v = $('view');
    v.addEventListener('pointerdown', function (e) { if (S.view !== 'comparar') return; drag = true; v.setPointerCapture(e.pointerId); setX(e, v); });
    v.addEventListener('pointermove', function (e) { if (drag && S.view === 'comparar') setX(e, v); });
    v.addEventListener('pointerup', function () { drag = false; }); v.addEventListener('pointercancel', function () { drag = false; });
  });
})();

/* ---------- modo pintura (tela de referência) ---------- */
var PT = { on: false, view: 'decalque', dec: null, decT: null, orig: null, sc: 1, tx: 0, ty: 0, fit: 1, lock: null, skipPop: false, ptrs: new Map(), lastTap: 0 };
function ptSize() { var cv = $('paintCv'); PT.dpr = window.devicePixelRatio || 1; cv.width = Math.round(innerWidth * PT.dpr); cv.height = Math.round(innerHeight * PT.dpr); }
function ptFit() {
  ptSize(); var iw = PT.orig.width, ih = PT.orig.height;
  PT.fit = Math.min(innerWidth / iw, innerHeight / ih) * 0.98; PT.sc = PT.fit;
  PT.tx = (innerWidth - iw * PT.sc) / 2; PT.ty = (innerHeight - ih * PT.sc) / 2; ptDraw();
}
function ptDraw() {
  var cv = $('paintCv'), ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#0b0810'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(PT.dpr * PT.sc, 0, 0, PT.dpr * PT.sc, PT.dpr * PT.tx, PT.dpr * PT.ty);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  if (PT.view === 'original') ctx.drawImage(PT.orig, 0, 0);
  else if (PT.view === 'decalque') ctx.drawImage(PT.dec, 0, 0);
  else {
    ctx.drawImage(PT.orig, 0, 0); ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(PT.decT, 0, 0); ctx.globalCompositeOperation = 'source-over';
  }
  document.querySelectorAll('#ptools [data-pv]').forEach(function (b) { b.classList.toggle('on', b.dataset.pv === PT.view); });
}
async function ptLock() { try { if ('wakeLock' in navigator) PT.lock = await navigator.wakeLock.request('screen'); } catch (e) { } }
async function enterPaint() {
  if (!S.src || PT.on) return;
  busy('Preparando o modo pintura…'); await nextFrame();
  try {
    var p = await produce(false, 1600), im = getWorkImage(1600);
    PT.dec = p.comp; PT.decT = compose(p.res, S.params, S.wcm, S.hcm, true); PT.orig = im.canvas;
    PT.on = true; PT.view = 'decalque'; history.pushState({ paint: 1 }, '');
    $('paint').classList.remove('hidden'); $('ptools').classList.remove('off'); ptFit(); ptLock();
    try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(function () { }); } catch (e) { }
    toast('Toque para esconder os botões. Dois dedos para ampliar.', 3200);
  } catch (e) { console.error(e); toast('Não foi possível abrir o modo pintura.'); }
  unbusy();
}
function exitPaint(fromPop) {
  if (!PT.on) return;
  PT.on = false; $('paint').classList.add('hidden');
  try { if (PT.lock) PT.lock.release(); } catch (e) { } PT.lock = null;
  try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { }
  PT.dec = PT.decT = PT.orig = null;
  if (!fromPop && history.state && history.state.paint) { PT.skipPop = true; history.back(); }
}
function bindPaint() {
  var cv = $('paintCv'), ptrs = PT.ptrs, st = {};
  function dist() { var a = Array.from(ptrs.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); }
  function mid() { var a = Array.from(ptrs.values()); return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2 }; }
  function zoomAt(ns, mx, my) {
    ns = Math.min(PT.fit * 10, Math.max(PT.fit * 0.8, ns)); var k = ns / PT.sc;
    PT.tx = mx - (mx - PT.tx) * k; PT.ty = my - (my - PT.ty) * k; PT.sc = ns; ptDraw();
  }
  cv.addEventListener('pointerdown', function (e) {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { st.moved = 0; st.t0 = Date.now(); }
    if (ptrs.size === 2) { var m = mid(); st.d0 = dist(); st.sc0 = PT.sc; st.m0 = m; st.tx0 = PT.tx; st.ty0 = PT.ty; st.moved = 99; }
  });
  cv.addEventListener('pointermove', function (e) {
    if (!ptrs.has(e.pointerId)) return;
    var pr = ptrs.get(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { PT.tx += e.clientX - pr.x; PT.ty += e.clientY - pr.y; st.moved += Math.abs(e.clientX - pr.x) + Math.abs(e.clientY - pr.y); ptDraw(); }
    else if (ptrs.size === 2 && st.d0 > 0) {
      var m = mid(), ns = Math.min(PT.fit * 10, Math.max(PT.fit * 0.8, st.sc0 * dist() / st.d0)), k = ns / st.sc0;
      PT.sc = ns; PT.tx = m.x - (st.m0.x - st.tx0) * k; PT.ty = m.y - (st.m0.y - st.ty0) * k; ptDraw();
    }
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    var was = ptrs.size; ptrs.delete(e.pointerId);
    if (was === 1 && st.moved < 8 && Date.now() - st.t0 < 350) {
      var now = Date.now();
      if (now - PT.lastTap < 320) { PT.lastTap = 0; if (PT.sc > PT.fit * 1.5) ptFit(); else zoomAt(PT.fit * 3, e.clientX, e.clientY); }
      else { PT.lastTap = now; setTimeout(function () { if (PT.lastTap === now) { PT.lastTap = 0; $('ptools').classList.toggle('off'); } }, 330); }
    }
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', function (e) { e.preventDefault(); zoomAt(PT.sc * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
  document.querySelectorAll('#ptools [data-pv]').forEach(function (b) { b.addEventListener('click', function () { PT.view = b.dataset.pv; ptDraw(); }); });
  $('pFit').addEventListener('click', function () { ptFit(); });
  $('pExit').addEventListener('click', function () { exitPaint(false); });
  window.addEventListener('resize', function () { if (PT.on) ptFit(); });
  document.addEventListener('visibilitychange', function () { if (PT.on && document.visibilityState === 'visible') ptLock(); });
  $('btnPaint').addEventListener('click', enterPaint);
  $('btnUndo').addEventListener('click', function () { hGo(-1); });
  $('btnRedo').addEventListener('click', function () { hGo(1); });
}

function bindHome() {
  $('btnCam').addEventListener('click', function () { $('fileCam').click(); });
  $('btnGal').addEventListener('click', function () { $('fileGal').click(); });
  ['fileCam', 'fileGal'].forEach(function (id) {
    $(id).addEventListener('change', function () { var f = $(id).files[0]; $(id).value = ''; if (f) startWithBlob(f); });
  });
  $('btnPaste').addEventListener('click', async function () {
    try {
      var items = await navigator.clipboard.read();
      for (var i = 0; i < items.length; i++) {
        var t = items[i].types.filter(function (x) { return x.indexOf('image/') === 0; })[0];
        if (t) { startWithBlob(await items[i].getType(t)); return; }
      }
      toast('Não há imagem copiada. Copie uma imagem primeiro.');
    } catch (e) { toast('Sem acesso à área de transferência. Use Compartilhar ou salve a imagem e escolha na galeria.', 5000); }
  });
  document.addEventListener('paste', function (e) {
    var items = (e.clipboardData && e.clipboardData.files) || [];
    if (items.length && items[0].type.indexOf('image/') === 0) startWithBlob(items[0]);
  });
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault(); var f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && f.type.indexOf('image/') === 0) startWithBlob(f);
  });
  $('btnBack').addEventListener('click', function () { closeEditor(false); });
  $('btnSave').addEventListener('click', function () { saveProject(false); });
  window.addEventListener('popstate', function () {
    if (PT.skipPop) { PT.skipPop = false; return; }
    if (PT.on) { exitPaint(true); return; }
    if (!$('editor').classList.contains('hidden')) closeEditor(true);
  });

}
async function checkShared() {
  if (location.search.indexOf('shared=1') < 0) return;
  try {
    var c = await caches.open('grimorio-shared'), key = new URL('shared-image', document.baseURI).href;
    var r = await c.match(key);
    history.replaceState(null, '', location.pathname);
    if (r) { var b = await r.blob(); await c.delete(key); await startWithBlob(b); }
  } catch (e) { toast('Não consegui abrir a imagem compartilhada.'); }
}
function init() {
  loadLast(); bindUI(); bindExport(); bindHome(); bindUiScale(); bindEgg(); bindPaint();
  if (S.sizeKey !== 'custom' && S.sizeKey !== 'foto' && !SIZES.some(function (s) { return s[0] + 'x' + s[1] === S.sizeKey; })) S.sizeKey = '40x50';
  applySize(); syncUI(); loadGallery(); checkShared();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () { });
}
document.addEventListener('DOMContentLoaded', init);
