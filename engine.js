/* Decalquei — motor de decalque.
   Funções puras (sem acesso ao DOM). O app copia estas funções para dentro de um Web Worker,
   então cada uma só pode depender das outras listadas em WORKER_FUNCS (app.js). */

/* ---------- desfoque ---------- */
function gaussKernel(sigma) {
  var r = Math.max(1, Math.ceil(sigma * 3));
  var k = new Float32Array(2 * r + 1), s = 0, i;
  for (i = -r; i <= r; i++) { var v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (i = 0; i < k.length; i++) k[i] /= s;
  return k;
}
function blurDirect(src, w, h, sigma) {
  var k = gaussKernel(sigma), r = (k.length - 1) >> 1;
  var tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  var x, y, i, s, p;
  for (y = 0; y < h; y++) {
    var o = y * w;
    for (x = 0; x < w; x++) {
      s = 0;
      for (i = -r; i <= r; i++) { p = x + i; if (p < 0) p = 0; else if (p >= w) p = w - 1; s += src[o + p] * k[i + r]; }
      tmp[o + x] = s;
    }
  }
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      s = 0;
      for (i = -r; i <= r; i++) { p = y + i; if (p < 0) p = 0; else if (p >= h) p = h - 1; s += tmp[p * w + x] * k[i + r]; }
      out[y * w + x] = s;
    }
  }
  return out;
}
function boxesForGauss(sigma, n) {
  var wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
  var wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  var wu = wl + 2;
  var mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
  var m = Math.round(mIdeal), sizes = [];
  for (var i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
  return sizes;
}
function boxPass(src, dst, w, h, r, horiz) {
  var n = horiz ? w : h, m = horiz ? h : w;
  var stride = horiz ? 1 : w, lineStride = horiz ? w : 1;
  var inv = 1 / (2 * r + 1), l, i, ii, sum, a, b, base;
  for (l = 0; l < m; l++) {
    base = l * lineStride; sum = 0;
    for (i = -r; i <= r; i++) { ii = i < 0 ? 0 : (i >= n ? n - 1 : i); sum += src[base + ii * stride]; }
    for (i = 0; i < n; i++) {
      dst[base + i * stride] = sum * inv;
      a = i + r + 1; if (a >= n) a = n - 1;
      b = i - r; if (b < 0) b = 0;
      sum += src[base + a * stride] - src[base + b * stride];
    }
  }
}
function blurGray(src, w, h, sigma) {
  if (sigma < 0.35) return Float32Array.from(src);
  if (sigma < 1.6) return blurDirect(src, w, h, sigma);
  var a = Float32Array.from(src), b = new Float32Array(w * h);
  var sizes = boxesForGauss(sigma, 3);
  for (var s = 0; s < sizes.length; s++) {
    var r = (sizes[s] - 1) >> 1;
    boxPass(a, b, w, h, r, true);
    boxPass(b, a, w, h, r, false);
  }
  return a;
}
function toGray(rgba, w, h) {
  var n = w * h, g = new Float32Array(n);
  for (var i = 0; i < n; i++) g[i] = (0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) / 255;
  return g;
}

/* ---------- bordas (Canny) ---------- */
function canny(gray, w, h, sigma, keepFrac) {
  var g = blurGray(gray, w, h, sigma);
  var n = w * h, mag = new Float32Array(n), dir = new Uint8Array(n), maxm = 0;
  var x, y, i;
  for (y = 1; y < h - 1; y++) {
    for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      var gx = (g[i - w + 1] + 2 * g[i + 1] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - 1] + g[i + w - 1]);
      var gy = (g[i + w - 1] + 2 * g[i + w] + g[i + w + 1]) - (g[i - w - 1] + 2 * g[i - w] + g[i - w + 1]);
      var m = Math.sqrt(gx * gx + gy * gy);
      mag[i] = m; if (m > maxm) maxm = m;
      var ax = Math.abs(gx), ay = Math.abs(gy);
      dir[i] = ay <= 0.41421 * ax ? 0 : (ay >= 2.41421 * ax ? 2 : ((gx * gy > 0) ? 1 : 3));
    }
  }
  var out = new Uint8Array(n);
  if (maxm <= 0) return out;
  var nms = new Float32Array(n), BINS = 1024, hist = new Uint32Array(BINS), cnt = 0;
  for (y = 1; y < h - 1; y++) {
    for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      var mm = mag[i]; if (mm === 0) continue;
      var a, b, d = dir[i];
      if (d === 0) { a = mag[i - 1]; b = mag[i + 1]; }
      else if (d === 1) { a = mag[i - w - 1]; b = mag[i + w + 1]; }
      else if (d === 2) { a = mag[i - w]; b = mag[i + w]; }
      else { a = mag[i - w + 1]; b = mag[i + w - 1]; }
      if (mm >= a && mm >= b) { nms[i] = mm; hist[Math.min(BINS - 1, ((mm / maxm) * BINS) | 0)]++; cnt++; }
    }
  }
  var target = cnt * keepFrac, cum = 0, bin = BINS - 1;
  for (; bin > 0; bin--) { cum += hist[bin]; if (cum >= target) break; }
  var hi = Math.max((bin / BINS) * maxm, 0.03), lo = hi * 0.5;
  var stack = new Int32Array(n), sp = 0;
  for (i = 0; i < n; i++) if (nms[i] >= hi) { out[i] = 1; stack[sp++] = i; }
  while (sp > 0) {
    i = stack[--sp];
    x = i % w; y = (i / w) | 0;
    for (var dy = -1; dy <= 1; dy++) {
      var yy = y + dy; if (yy < 0 || yy >= h) continue;
      for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx; if (xx < 0 || xx >= w) continue;
        var j = yy * w + xx;
        if (!out[j] && nms[j] >= lo) { out[j] = 1; stack[sp++] = j; }
      }
    }
  }
  return out;
}

/* ---------- máscaras ---------- */
function removeSmall(mask, w, h, minSize) {
  if (minSize <= 1) return mask;
  var n = w * h, seen = new Uint8Array(n), q = new Int32Array(n), s, k;
  for (s = 0; s < n; s++) {
    if (!mask[s] || seen[s]) continue;
    var qs = 0, qe = 0; q[qe++] = s; seen[s] = 1;
    while (qs < qe) {
      var i = q[qs++], x = i % w, y = (i / w) | 0;
      for (var dy = -1; dy <= 1; dy++) {
        var yy = y + dy; if (yy < 0 || yy >= h) continue;
        for (var dx = -1; dx <= 1; dx++) {
          var xx = x + dx; if (xx < 0 || xx >= w) continue;
          var j = yy * w + xx;
          if (mask[j] && !seen[j]) { seen[j] = 1; q[qe++] = j; }
        }
      }
    }
    if (qe < minSize) for (k = 0; k < qe; k++) mask[q[k]] = 0;
  }
  return mask;
}
function dilate(mask, w, h, iters) {
  var a = mask;
  for (var t = 0; t < iters; t++) {
    var b = new Uint8Array(w * h), sq = (t & 1) === 1;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        if (a[i] | a[i - 1] | a[i + 1] | a[i - w] | a[i + w]) b[i] = 1;
        else if (sq && (a[i - w - 1] | a[i - w + 1] | a[i + w - 1] | a[i + w + 1])) b[i] = 1;
      }
    }
    a = b;
  }
  return a;
}
function maskToInk(mask, w, h, widthPx) {
  var iters = Math.max(0, Math.round((widthPx - 1) / 2));
  var m = dilate(mask, w, h, iters), n = w * h, i;
  var f = new Float32Array(n);
  for (i = 0; i < n; i++) f[i] = m[i] ? 1 : 0;
  var b = blurGray(f, w, h, 0.7), ink = new Uint8Array(n);
  for (i = 0; i < n; i++) { var v = b[i] * 1.7; ink[i] = v >= 1 ? 255 : (v * 255) | 0; }
  return ink;
}

/* ---------- esboço a lápis (diferença de gaussianas) ---------- */
function sketchInk(gray, w, h, sigma, detail, minBlob) {
  var g1 = blurGray(gray, w, h, sigma), g2 = blurGray(gray, w, h, sigma * 1.7);
  var t0 = 0.014 - 0.012 * detail / 100, t1 = t0 + 0.02, n = w * h, ink = new Uint8Array(n), i;
  for (i = 0; i < n; i++) {
    var v = (g2[i] - g1[i] - t0) / (t1 - t0);
    ink[i] = v <= 0 ? 0 : (v >= 1 ? 255 : (v * 255) | 0);
  }
  if (minBlob > 1) {
    var mask = new Uint8Array(n);
    for (i = 0; i < n; i++) mask[i] = ink[i] > 128 ? 1 : 0;
    var clean = removeSmall(mask.slice(), w, h, minBlob);
    for (i = 0; i < n; i++) if (mask[i] && !clean[i]) ink[i] = 0;
    // remove também o halo ao redor das manchas apagadas
    var dm = dilate(clean, w, h, 2);
    for (i = 0; i < n; i++) if (!dm[i] && ink[i] < 200) ink[i] = 0;
  }
  return ink;
}

/* ---------- rótulos (regiões e tons) ---------- */
function modeFilter(lab, w, h, k, passes) {
  var a = lab, b = new Uint8Array(lab.length), cnt = new Uint16Array(256);
  var nb = new Int32Array(8), offs = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
  for (var p = 0; p < passes; p++) {
    b.set(a);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x, c = a[i], same = 0, t;
        for (t = 0; t < 8; t++) { nb[t] = a[i + offs[t]]; if (nb[t] === c) same++; }
        if (same >= 3) continue;
        for (t = 0; t < 8; t++) cnt[nb[t]]++;
        var best = c, bc = same;
        for (t = 0; t < 8; t++) if (cnt[nb[t]] > bc) { bc = cnt[nb[t]]; best = nb[t]; }
        for (t = 0; t < 8; t++) cnt[nb[t]] = 0;
        b[i] = best;
      }
    }
    var tmp = a; a = b; b = tmp;
  }
  if (a !== lab) lab.set(a);
  return lab;
}
function labelComponents(lab, w, h, k, minSize, merge) {
  var n = w * h, comp = new Int32Array(n).fill(-1), q = new Int32Array(n);
  var cntK = new Int32Array(256), touched = new Int32Array(256);
  var cl = [], cs = [], nc = 0, s, t;
  for (s = 0; s < n; s++) {
    if (comp[s] >= 0) continue;
    var c0 = lab[s], qs = 0, qe = 0, nt = 0;
    q[qe++] = s; comp[s] = nc;
    while (qs < qe) {
      var i = q[qs++], x = i % w, y = (i / w) | 0;
      for (var d = 0; d < 4; d++) {
        var j;
        if (d === 0) { if (x === 0) continue; j = i - 1; }
        else if (d === 1) { if (x === w - 1) continue; j = i + 1; }
        else if (d === 2) { if (y === 0) continue; j = i - w; }
        else { if (y === h - 1) continue; j = i + w; }
        if (lab[j] === c0) { if (comp[j] < 0) { comp[j] = nc; q[qe++] = j; } }
        else if (merge) { var v = lab[j]; if (cntK[v] === 0) touched[nt++] = v; cntK[v]++; }
      }
    }
    if (merge && qe < minSize && nt > 0) {
      var best = touched[0], bc = cntK[best];
      for (t = 1; t < nt; t++) if (cntK[touched[t]] > bc) { best = touched[t]; bc = cntK[best]; }
      for (t = 0; t < nt; t++) cntK[touched[t]] = 0;
      for (t = 0; t < qe; t++) { lab[q[t]] = best; comp[q[t]] = -1; }
    } else {
      for (t = 0; t < nt; t++) cntK[touched[t]] = 0;
      cl.push(c0); cs.push(qe); nc++;
    }
  }
  return { comp: comp, nc: nc, cl: Int32Array.from(cl), cs: Int32Array.from(cs) };
}
function distToBoundary(lab, w, h) {
  var n = w * h, d = new Float32Array(n), INF = 1e9, x, y, i;
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      var c = lab[i];
      var b = x === 0 || y === 0 || x === w - 1 || y === h - 1 || lab[i + 1] !== c || lab[i - 1] !== c || lab[i + w] !== c || lab[i - w] !== c;
      d[i] = b ? 0 : INF;
    }
  }
  for (y = 1; y < h - 1; y++) {
    for (x = 1; x < w - 1; x++) {
      i = y * w + x;
      var v = d[i];
      var t = d[i - 1] + 1; if (t < v) v = t;
      t = d[i - w] + 1; if (t < v) v = t;
      t = d[i - w - 1] + 1.414; if (t < v) v = t;
      t = d[i - w + 1] + 1.414; if (t < v) v = t;
      d[i] = v;
    }
  }
  for (y = h - 2; y > 0; y--) {
    for (x = w - 2; x > 0; x--) {
      i = y * w + x;
      var v2 = d[i];
      var t2 = d[i + 1] + 1; if (t2 < v2) v2 = t2;
      t2 = d[i + w] + 1; if (t2 < v2) v2 = t2;
      t2 = d[i + w + 1] + 1.414; if (t2 < v2) v2 = t2;
      t2 = d[i + w - 1] + 1.414; if (t2 < v2) v2 = t2;
      d[i] = v2;
    }
  }
  return d;
}

/* ---------- tons (sombras) ---------- */
function toneLevels(gray, w, h, sigma, nLevels) {
  var g = blurGray(gray, w, h, sigma), n = w * h, i;
  var hist = new Uint32Array(256);
  for (i = 0; i < n; i++) hist[Math.min(255, (g[i] * 256) | 0)]++;
  var cum = 0, lo = 0, hi = 255;
  for (i = 0; i < 256; i++) { cum += hist[i]; if (cum >= n * 0.02) { lo = i; break; } }
  cum = 0;
  for (i = 255; i >= 0; i--) { cum += hist[i]; if (cum >= n * 0.02) { hi = i; break; } }
  if (hi <= lo + 4) { lo = 0; hi = 255; }
  var a = lo / 256, span = (hi - lo) / 256;
  var lev = new Uint8Array(n);
  for (i = 0; i < n; i++) {
    var v = (g[i] - a) / span;
    var l = Math.floor(v * nLevels);
    lev[i] = l < 0 ? 0 : (l > nLevels - 1 ? nLevels - 1 : l);
  }
  return lev;
}
function toneInk(lev, w, h, nLevels, style, scale, minSpot) {
  labelComponents(lev, w, h, nLevels, minSpot, true);
  var n = w * h, ink = new Uint8Array(n), x, y, i;
  var sp = Math.max(5, Math.round(10 * scale)), lw = Math.max(1, Math.round(1.3 * scale));
  for (y = 0; y < h; y++) {
    for (x = 0; x < w; x++) {
      i = y * w + x;
      var l = lev[i];
      if (l >= nLevels - 1) continue;
      if (style === 'manchas') {
        ink[i] = nLevels <= 2 ? 90 : Math.round(45 + 125 * ((nLevels - 2 - l) / (nLevels - 2)));
      } else {
        var on;
        if (l === 0) on = ((x + y) % sp) < lw || ((((x - y) % sp) + sp) % sp) < lw;
        else if (l === 1) on = ((x + y) % sp) < lw;
        else if (l === 2) on = ((((x - y) % (sp * 2)) + sp * 2) % (sp * 2)) < lw;
        else on = ((x + y) % (sp * 3)) < lw;
        if (on) ink[i] = 185;
      }
    }
  }
  return ink;
}

/* ---------- cor (Lab) e k-means ---------- */
function srgb2lab(r, g, b, out, o) {
  if (!srgb2lab.LIN) {
    var t = new Float32Array(256);
    for (var i = 0; i < 256; i++) { var c = i / 255; t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
    srgb2lab.LIN = t;
  }
  var LIN = srgb2lab.LIN, R = LIN[r], G = LIN[g], B = LIN[b];
  var X = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  var Y = 0.2126729 * R + 0.7151522 * G + 0.0721750 * B;
  var Z = (0.0193339 * R + 0.1191920 * G + 0.9503041 * B) / 1.08883;
  var fx = X > 0.008856 ? Math.cbrt(X) : 7.787 * X + 16 / 116;
  var fy = Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116;
  var fz = Z > 0.008856 ? Math.cbrt(Z) : 7.787 * Z + 16 / 116;
  out[o] = 116 * fy - 16; out[o + 1] = 500 * (fx - fy); out[o + 2] = 200 * (fy - fz);
}
function kmeansLab(S, m, k, iters) {
  var seed = 12345;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var C = new Float32Array(k * 3), dist = new Float32Array(m).fill(1e30), i, c, t;
  var first = (rnd() * m) | 0;
  C[0] = S[first * 3]; C[1] = S[first * 3 + 1]; C[2] = S[first * 3 + 2];
  for (c = 1; c < k; c++) {
    var pc = (c - 1) * 3, sum = 0;
    for (i = 0; i < m; i++) {
      var dx = S[i * 3] - C[pc], dy = S[i * 3 + 1] - C[pc + 1], dz = S[i * 3 + 2] - C[pc + 2];
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < dist[i]) dist[i] = d2;
      sum += dist[i];
    }
    var r = rnd() * sum, idx = m - 1;
    for (i = 0; i < m; i++) { r -= dist[i]; if (r <= 0) { idx = i; break; } }
    C[c * 3] = S[idx * 3]; C[c * 3 + 1] = S[idx * 3 + 1]; C[c * 3 + 2] = S[idx * 3 + 2];
  }
  var asg = new Uint8Array(m), sums = new Float64Array(k * 3), cnts = new Int32Array(k);
  for (var it = 0; it < iters; it++) {
    var changed = 0;
    sums.fill(0); cnts.fill(0);
    for (i = 0; i < m; i++) {
      var best = 0, bd = 1e30;
      for (c = 0; c < k; c++) {
        var ex = S[i * 3] - C[c * 3], ey = S[i * 3 + 1] - C[c * 3 + 1], ez = S[i * 3 + 2] - C[c * 3 + 2];
        var dd = ex * ex + ey * ey + ez * ez;
        if (dd < bd) { bd = dd; best = c; }
      }
      if (asg[i] !== best) { asg[i] = best; changed++; }
      sums[best * 3] += S[i * 3]; sums[best * 3 + 1] += S[i * 3 + 1]; sums[best * 3 + 2] += S[i * 3 + 2]; cnts[best]++;
    }
    for (c = 0; c < k; c++) {
      if (cnts[c] > 0) for (t = 0; t < 3; t++) C[c * 3 + t] = sums[c * 3 + t] / cnts[c];
    }
    if (changed === 0 && it > 0) break;
  }
  return C;
}

/* ---------- modos ---------- */
function regionsEngine(rgba, w, h, p) {
  var n = w * h, sc = Math.max(w, h) / 1000, i, c;
  var sigma = (0.6 + p.smooth / 100 * 3.4) * sc;
  var sm = new Uint8ClampedArray(n * 3), pl = new Float32Array(n);
  for (c = 0; c < 3; c++) {
    for (i = 0; i < n; i++) pl[i] = rgba[i * 4 + c];
    var bl = blurGray(pl, w, h, sigma);
    for (i = 0; i < n; i++) sm[i * 3 + c] = bl[i];
  }
  var step = Math.max(1, Math.floor(Math.sqrt(n / 24000)));
  var S = new Float32Array(Math.ceil(h / step) * Math.ceil(w / step) * 3), m = 0, x, y;
  for (y = 0; y < h; y += step) {
    for (x = 0; x < w; x += step) { i = (y * w + x) * 3; srgb2lab(sm[i], sm[i + 1], sm[i + 2], S, m * 3); m++; }
  }
  var k = Math.max(2, Math.min(p.k, m));
  var C = kmeansLab(S, m, k, 14);
  var lut = new Uint8Array(64 * 64 * 64).fill(255), lab = new Uint8Array(n), tl = new Float32Array(3);
  for (i = 0; i < n; i++) {
    var r = sm[i * 3], g = sm[i * 3 + 1], b = sm[i * 3 + 2];
    var key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2), v = lut[key];
    if (v === 255) {
      srgb2lab((r & 252) + 2, (g & 252) + 2, (b & 252) + 2, tl, 0);
      var bd = 1e30;
      for (c = 0; c < k; c++) {
        var dx = tl[0] - C[c * 3], dy = tl[1] - C[c * 3 + 1], dz = tl[2] - C[c * 3 + 2];
        var dd = dx * dx + dy * dy + dz * dz;
        if (dd < bd) { bd = dd; v = c; }
      }
      lut[key] = v;
    }
    lab[i] = v;
  }
  modeFilter(lab, w, h, k, 2);
  var minSpot = Math.max(6, Math.round((0.00002 + 0.0007 * p.clean / 100) * n));
  labelComponents(lab, w, h, k, minSpot, true);
  // paleta (média das cores reais de cada rótulo), ordenada por área
  var sr = new Float64Array(k), sg = new Float64Array(k), sb = new Float64Array(k), ct = new Int32Array(k);
  for (i = 0; i < n; i++) { var L0 = lab[i]; sr[L0] += sm[i * 3]; sg[L0] += sm[i * 3 + 1]; sb[L0] += sm[i * 3 + 2]; ct[L0]++; }
  var order = [];
  for (c = 0; c < k; c++) if (ct[c] > 0) order.push(c);
  order.sort(function (a, b) { return ct[b] - ct[a]; });
  var remap = new Uint8Array(256), palette = [];
  for (c = 0; c < order.length; c++) {
    var o = order[c]; remap[o] = c;
    palette.push({ r: Math.round(sr[o] / ct[o]), g: Math.round(sg[o] / ct[o]), b: Math.round(sb[o] / ct[o]), count: ct[o] });
  }
  for (i = 0; i < n; i++) lab[i] = remap[lab[i]];
  // contornos entre regiões
  var mask = new Uint8Array(n);
  for (y = 0; y < h - 1; y++) {
    for (x = 0; x < w - 1; x++) { i = y * w + x; if (lab[i] !== lab[i + 1] || lab[i] !== lab[i + w]) mask[i] = 1; }
  }
  var ink = maskToInk(mask, w, h, p.thick * sc);
  // posição dos números: ponto mais "interno" de cada mancha
  var fin = labelComponents(lab, w, h, palette.length, 0, false);
  var dt = distToBoundary(lab, w, h);
  var bestD = new Float32Array(fin.nc), bestI = new Int32Array(fin.nc).fill(-1);
  for (i = 0; i < n; i++) { var cc = fin.comp[i]; if (dt[i] > bestD[cc]) { bestD[cc] = dt[i]; bestI[cc] = i; } }
  var list = [];
  for (c = 0; c < fin.nc; c++) {
    if (bestI[c] >= 0 && bestD[c] >= 2.2 * sc) list.push(bestI[c] % w, (bestI[c] / w) | 0, fin.cl[c], bestD[c]);
  }
  return { w: w, h: h, ink: ink, labels: lab, palette: palette, regions: Float32Array.from(list) };
}
function runPipeline(rgba, w, h, p) {
  var sc = Math.max(w, h) / 1000;
  if (p.mode === 'manchas') return regionsEngine(rgba, w, h, p);
  var gray = toGray(rgba, w, h), sigma = (0.8 + p.smooth / 100 * 3.2) * sc, minLen = (4 + p.clean * 0.55) * sc;
  if (p.mode === 'esboco') {
    return { w: w, h: h, ink: sketchInk(gray, w, h, (0.9 + p.smooth / 100 * 2.2) * sc, p.detail, minLen * 2.2) };
  }
  var keep = 0.05 + 0.5 * (p.detail / 100);
  var edges = canny(gray, w, h, sigma, keep);
  removeSmall(edges, w, h, minLen);
  var ink = maskToInk(edges, w, h, p.thick * sc);
  if (p.mode === 'sombras') {
    var nL = p.tones;
    var lev = toneLevels(gray, w, h, (2 + p.smooth / 100 * 5) * sc, nL);
    var minSpot = Math.max(6, Math.round((0.00004 + 0.0008 * p.clean / 100) * w * h));
    var tone = toneInk(lev, w, h, nL, p.toneStyle, sc, minSpot);
    for (var i = 0; i < ink.length; i++) if (tone[i] > ink[i]) ink[i] = tone[i];
  }
  return { w: w, h: h, ink: ink };
}
