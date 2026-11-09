/* Decalquei — exportação: gerador de PDF próprio, folhas A4 em tamanho real, legenda e paleta. */
var DPI = 200, MM = DPI / 25.4;

function canvasBlob(cv, type, q) {
  return new Promise(function (res) { cv.toBlob(res, type, q); });
}
async function jpegBytes(cv) {
  var b = await canvasBlob(cv, 'image/jpeg', 0.92);
  return new Uint8Array(await b.arrayBuffer());
}

/* PDF mínimo: uma imagem JPEG por página. */
function buildPDF(pages) {
  var enc = new TextEncoder(), parts = [], pos = 0, off = [];
  function add(d) { var u = typeof d === 'string' ? enc.encode(d) : d; parts.push(u); pos += u.length; }
  function obj(n, body) { off[n] = pos; add(n + ' 0 obj\n'); add(body); add('\nendobj\n'); }
  add('%PDF-1.4\n');
  var N = pages.length, kids = [], i;
  for (i = 0; i < N; i++) kids.push((3 + 3 * i) + ' 0 R');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + N + ' >>');
  pages.forEach(function (p, i) {
    var po = 3 + 3 * i, co = po + 1, io = po + 2;
    var W = p.wpt.toFixed(2), H = p.hpt.toFixed(2);
    obj(po, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + W + ' ' + H + '] /Resources << /XObject << /Im0 ' + io + ' 0 R >> >> /Contents ' + co + ' 0 R >>');
    var cs = 'q ' + W + ' 0 0 ' + H + ' 0 0 cm /Im0 Do Q';
    obj(co, '<< /Length ' + cs.length + ' >>\nstream\n' + cs + '\nendstream');
    off[io] = pos;
    add(io + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.iw + ' /Height ' + p.ih + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
    add(p.jpeg);
    add('\nendstream\nendobj\n');
  });
  var total = 2 + 3 * N, xref = pos;
  add('xref\n0 ' + (total + 1) + '\n');
  add('0000000000 65535 f \n');
  for (var n = 1; n <= total; n++) add(String(off[n]).padStart(10, '0') + ' 00000 n \n');
  add('trailer\n<< /Size ' + (total + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
  return new Blob(parts, { type: 'application/pdf' });
}

/* pages: [{cv, wmm, hmm}] ou funções que devolvem isso (gera uma de cada vez, poupando memória) -> Blob PDF */
async function pagesToPDF(pages, onProgress) {
  var out = [];
  for (var i = 0; i < pages.length; i++) {
    var p = typeof pages[i] === 'function' ? pages[i]() : pages[i];
    out.push({ wpt: p.wmm / 25.4 * 72, hpt: p.hmm / 25.4 * 72, jpeg: await jpegBytes(p.cv), iw: p.cv.width, ih: p.cv.height });
    p.cv.width = 1; p.cv.height = 1; // libera memória
    if (onProgress) onProgress(i + 1, pages.length);
    await new Promise(function (r) { setTimeout(r, 0); });
  }
  return buildPDF(out);
}

function newPage(wmm, hmm) {
  var cv = document.createElement('canvas');
  cv.width = Math.round(wmm * MM); cv.height = Math.round(hmm * MM);
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  return cv;
}
function wrapText(ctx, text, x, y, maxW, lineH) {
  var words = text.split(' '), line = '';
  for (var i = 0; i < words.length; i++) {
    var test = line ? line + ' ' + words[i] : words[i];
    if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); y += lineH; line = words[i]; }
    else line = test;
  }
  if (line) { ctx.fillText(line, x, y); y += lineH; }
  return y;
}

/* A4 com a imagem inteira, ajustada à folha */
function renderFitPage(comp, wcm, hcm, titulo) {
  var land = comp.width > comp.height * 1.15;
  var pw = land ? 297 : 210, ph = land ? 210 : 297, m = 10;
  var cv = newPage(pw, ph), ctx = cv.getContext('2d');
  var aw = (pw - 2 * m) * MM, ah = (ph - 2 * m - 6) * MM;
  var s = Math.min(aw / comp.width, ah / comp.height);
  var dw = comp.width * s, dh = comp.height * s;
  var dx = (cv.width - dw) / 2, dy = m * MM + (ah - dh) / 2;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(comp, dx, dy, dw, dh);
  ctx.strokeStyle = '#bbb'; ctx.lineWidth = 1; ctx.strokeRect(dx, dy, dw, dh);
  ctx.fillStyle = '#777'; ctx.font = (3.2 * MM) + 'px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText((titulo || 'Decalque') + ' · tela de ' + fmtCm(wcm) + ' × ' + fmtCm(hcm) + ' cm · escala reduzida', m * MM, (ph - m + 2) * MM);
  return { cv: cv, wmm: pw, hmm: ph };
}
function fmtCm(v) { return (Math.round(v * 10) / 10).toString().replace('.', ','); }

/* ---------- tamanho real em várias folhas ---------- */
function planTiles(wcm, hcm, overlapCm) {
  var W = wcm * 10, H = hcm * 10, m = 10, o = overlapCm * 10, best = null;
  [false, true].forEach(function (land) {
    var pw = land ? 297 : 210, ph = land ? 210 : 297, cw = pw - 2 * m, ch = ph - 2 * m;
    var sx = cw - o, sy = ch - o;
    var cols = W <= cw ? 1 : Math.ceil((W - o) / sx);
    var rows = H <= ch ? 1 : Math.ceil((H - o) / sy);
    var plan = { land: land, pw: pw, ph: ph, cw: cw, ch: ch, sx: sx, sy: sy, cols: cols, rows: rows, W: W, H: H, m: m, o: o, count: cols * rows };
    if (!best || plan.count < best.count) best = plan;
  });
  return best;
}
function tick(ctx, x, y, dx, dy) {
  var L = 4 * MM;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx * L, y); ctx.moveTo(x, y); ctx.lineTo(x, y + dy * L); ctx.stroke();
}
function renderTile(comp, plan, c, r, idx, total) {
  var cv = newPage(plan.pw, plan.ph), ctx = cv.getContext('2d');
  var x0 = c * plan.sx, y0 = r * plan.sy;
  var tw = Math.min(plan.cw, plan.W - x0), th = Math.min(plan.ch, plan.H - y0);
  var k = comp.width / plan.W, m = plan.m * MM;
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(comp, x0 * k, y0 * k, tw * k, th * k, m, m, tw * MM, th * MM);
  // marcas nos cantos do retângulo útil
  ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.setLineDash([]);
  var R = m + plan.cw * MM, B = m + plan.ch * MM;
  tick(ctx, m, m, -1, -1); tick(ctx, R, m, 1, -1); tick(ctx, m, B, -1, 1); tick(ctx, R, B, 1, 1);
  // bordas reais da tela (tracejado)
  ctx.strokeStyle = '#999'; ctx.setLineDash([10, 8]); ctx.lineWidth = 1.5; ctx.beginPath();
  if (c === 0) { ctx.moveTo(m, m); ctx.lineTo(m, m + th * MM); }
  if (r === 0) { ctx.moveTo(m, m); ctx.lineTo(m + tw * MM, m); }
  if (x0 + tw >= plan.W - 0.01) { ctx.moveTo(m + tw * MM, m); ctx.lineTo(m + tw * MM, m + th * MM); }
  if (y0 + th >= plan.H - 0.01) { ctx.moveTo(m, m + th * MM); ctx.lineTo(m + tw * MM, m + th * MM); }
  ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#555'; ctx.font = 'bold ' + (3.4 * MM) + 'px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Folha ' + idx + ' de ' + total + '  ·  coluna ' + (c + 1) + ', linha ' + (r + 1), m, 6.2 * MM);
  ctx.textAlign = 'right'; ctx.fillStyle = '#888'; ctx.font = (3 * MM) + 'px sans-serif';
  ctx.fillText('Decalquei', plan.pw * MM - m, 6.2 * MM);
  return { cv: cv, wmm: plan.pw, hmm: plan.ph };
}
function renderIndexPage(plan, wcm, hcm) {
  var cv = newPage(210, 297), ctx = cv.getContext('2d'), m = 15 * MM;
  ctx.fillStyle = '#1f2a2a'; ctx.textAlign = 'left';
  ctx.font = 'bold ' + (7 * MM) + 'px sans-serif'; ctx.fillText('Montagem do decalque', m, 24 * MM);
  ctx.font = (4 * MM) + 'px sans-serif'; ctx.fillStyle = '#444';
  ctx.fillText('Tela de ' + fmtCm(wcm) + ' × ' + fmtCm(hcm) + ' cm  ·  ' + plan.count + ' folhas A4 (' + plan.cols + ' colunas × ' + plan.rows + ' linhas)', m, 33 * MM);
  // diagrama
  var maxW = 180 * MM, maxH = 120 * MM;
  var cs = Math.min(maxW / plan.cols, maxH / plan.rows);
  var gx = (cv.width - cs * plan.cols) / 2, gy = 42 * MM, n = 0;
  ctx.strokeStyle = '#2c6e69'; ctx.lineWidth = 3; ctx.textAlign = 'center';
  for (var r = 0; r < plan.rows; r++) {
    for (var c = 0; c < plan.cols; c++) {
      n++;
      ctx.fillStyle = (c + r) % 2 ? '#e8f2f0' : '#f6faf9';
      ctx.fillRect(gx + c * cs, gy + r * cs, cs, cs); ctx.strokeRect(gx + c * cs, gy + r * cs, cs, cs);
      ctx.fillStyle = '#1f524e'; ctx.font = 'bold ' + Math.min(cs * 0.4, 14 * MM) + 'px sans-serif';
      ctx.fillText(String(n), gx + c * cs + cs / 2, gy + r * cs + cs / 2 + Math.min(cs * 0.14, 5 * MM));
    }
  }
  var y = gy + plan.rows * cs + 12 * MM;
  ctx.textAlign = 'left'; ctx.fillStyle = '#1f2a2a'; ctx.font = 'bold ' + (4.4 * MM) + 'px sans-serif';
  ctx.fillText('Como montar', m, y); y += 8 * MM;
  ctx.font = (3.9 * MM) + 'px sans-serif'; ctx.fillStyle = '#333';
  var steps = [
    '1. Imprima todas as páginas em TAMANHO REAL (100%). Não use "ajustar à página".',
    '2. Coloque as folhas lado a lado na ordem do diagrama (esquerda para a direita, de cima para baixo).',
    '3. Cada folha repete ' + fmtCm(plan.o / 10) + ' cm da vizinha: sobreponha essa faixa alinhando os traços e cole com fita.',
    '4. As marcas nos cantos mostram o retângulo útil da folha; o tracejado cinza é a borda real da tela.',
    '5. Para passar para a tela, use papel carbono/de decalque sobre o desenho e repasse as linhas.'
  ];
  steps.forEach(function (s) { y = wrapText(ctx, s, m, y, cv.width - 2 * m, 5.6 * MM) + 1.5 * MM; });
  return { cv: cv, wmm: 210, hmm: 297 };
}

/* ---------- legenda e paleta ---------- */
function toHex(r, g, b) {
  return '#' + [r, g, b].map(function (v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join('');
}
function renderLegendPage(palette, titulo) {
  var cv = newPage(210, 297), ctx = cv.getContext('2d'), m = 15 * MM, total = 0;
  palette.forEach(function (p) { total += p.count; });
  ctx.fillStyle = '#1f2a2a'; ctx.textAlign = 'left';
  ctx.font = 'bold ' + (7 * MM) + 'px sans-serif'; ctx.fillText('Legenda de cores', m, 24 * MM);
  ctx.font = (3.8 * MM) + 'px sans-serif'; ctx.fillStyle = '#555';
  ctx.fillText((titulo || 'Decalque') + ' · ' + palette.length + ' cores · ordem da maior para a menor área', m, 32 * MM);
  var rowH = 13 * MM, cols = palette.length > 12 ? 2 : 1, perCol = Math.ceil(palette.length / cols);
  var colW = (cv.width - 2 * m) / cols;
  palette.forEach(function (p, i) {
    var col = Math.floor(i / perCol), row = i % perCol;
    var x = m + col * colW, y = 44 * MM + row * rowH;
    ctx.fillStyle = 'rgb(' + p.r + ',' + p.g + ',' + p.b + ')'; ctx.fillRect(x, y, 16 * MM, 10 * MM);
    ctx.strokeStyle = '#999'; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, 16 * MM, 10 * MM);
    ctx.fillStyle = '#1f2a2a'; ctx.font = 'bold ' + (5.5 * MM) + 'px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(String(i + 1), x + 20 * MM, y + 7.5 * MM);
    ctx.font = (3.8 * MM) + 'px sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText(toHex(p.r, p.g, p.b).toUpperCase() + '  ·  ' + Math.round(p.count / total * 100) + '%', x + 32 * MM, y + 7 * MM);
  });
  return { cv: cv, wmm: 210, hmm: 297 };
}
function renderPaletteCard(colors, titulo) {
  var W = 1200, row = 120, H = 150 + colors.length * row;
  var cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1f2a2a'; ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Paleta de cores · ' + (titulo || ''), 50, 80);
  colors.forEach(function (c, i) {
    var y = 130 + i * row;
    ctx.fillStyle = 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')'; ctx.fillRect(50, y, 200, 90);
    ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2; ctx.strokeRect(50, y, 200, 90);
    ctx.fillStyle = '#1f2a2a'; ctx.font = 'bold 40px sans-serif';
    ctx.fillText(String(i + 1) + '   ' + toHex(c.r, c.g, c.b).toUpperCase(), 290, y + 58);
    ctx.font = '34px sans-serif'; ctx.fillStyle = '#666'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(c.share * 100) + '% da imagem', W - 50, y + 58); ctx.textAlign = 'left';
  });
  return cv;
}

/* ---------- entrega ---------- */
async function deliverBlob(blob, name, mode) {
  var file = new File([blob], name, { type: blob.type });
  if (mode === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  return 'download';
}
