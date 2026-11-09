/* Grimório de Traços — cenas desenhadas (SVG original) para as surpresas, inspiradas em cenas da obra. */
(function () {
  var seed = 7;
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function dots(n, y0, y1, rMax, fill, op) {
    var s = '';
    for (var i = 0; i < n; i++) s += '<circle cx="' + (rnd() * 400).toFixed(1) + '" cy="' + (y0 + rnd() * (y1 - y0)).toFixed(1) + '" r="' + (0.4 + rnd() * rMax).toFixed(2) + '" fill="' + fill + '" opacity="' + (op * (0.4 + rnd() * 0.6)).toFixed(2) + '"/>';
    return s;
  }
  function star4(x, y, r, fill) {
    return '<path d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + 'Z" fill="' + fill + '"/>';
  }
  function fire(x, y, s) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><circle r="85" cy="-25" fill="url(#glow)"/>' +
      '<path d="M-12 0 Q-19 -24 0 -54 Q4 -30 17 -42 Q26 -14 12 0Z" fill="#ff9a3c"/>' +
      '<path d="M-6 0 Q-9 -15 0 -30 Q4 -15 9 -19 Q11 -6 6 0Z" fill="#ffe08a"/></g>';
  }
  function masked(x, y, s, mask) {
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')"><path d="M-10 0 L-6 -34 Q0 -41 6 -34 L10 0Z" fill="#05030a"/>' +
      '<circle cy="-43" r="6.5" fill="#05030a"/><path d="M-5.5 -44 Q0 -39 5.5 -44 Q0 -50 -5.5 -44Z" fill="' + mask + '"/></g>';
  }
  var GLOW = '<radialGradient id="glow"><stop offset="0" stop-color="#ffb347" stop-opacity=".9"/><stop offset=".4" stop-color="#ff6a2a" stop-opacity=".4"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient>';
  function wrap(inner, defs) {
    return '<svg viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' + (defs || '') + '</defs>' + inner + '</svg>';
  }

  var S = {};

  /* Calanmai: fogueiras nas colinas, fae mascarados, noite da Corte da Primavera */
  S.calanmai = function () {
    seed = 11;
    var d = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0616"/><stop offset=".55" stop-color="#2b1238"/><stop offset="1" stop-color="#6a2330"/></linearGradient>' + GLOW;
    var g = '<rect width="400" height="800" fill="url(#sky)"/>' + dots(60, 0, 380, 1.3, '#f3e6b8', 0.9);
    g += '<path d="M-10 470 L80 392 L125 428 L200 336 L272 414 L322 376 L410 452 L410 800 L-10 800Z" fill="#150c22"/>';
    g += '<g fill="#f6ebc3"><circle cx="200" cy="296" r="3"/><circle cx="179" cy="311" r="2.2"/><circle cx="221" cy="311" r="2.2"/></g>';
    g += '<path d="M-10 575 Q100 490 205 548 T410 528 L410 800 L-10 800Z" fill="#100a19"/>';
    g += fire(92, 556, 0.8) + fire(312, 536, 0.75);
    g += masked(60, 566, 0.9, '#c9a24a') + masked(126, 558, 0.85, '#8e3b46') + masked(280, 548, 0.8, '#c9a24a') + masked(340, 545, 0.85, '#6e8fb5');
    g += '<path d="M-10 668 Q120 590 240 650 T410 625 L410 800 L-10 800Z" fill="#09050e"/>';
    g += fire(205, 668, 1.15);
    g += masked(150, 676, 1.25, '#c9a24a') + masked(262, 672, 1.2, '#8e3b46');
    g += '<g transform="translate(205 746)"><path d="M-30 0 L-18 -86 Q0 -104 18 -86 L30 0Z" fill="#030208"/><path d="M-14 -84 Q0 -112 14 -84 Q0 -72 -14 -84Z" fill="#0c0714"/></g>';
    return wrap(g, d);
  };

  /* Esperança: aldeia humana no inverno, janela acesa */
  S.esperanca = function () {
    seed = 23;
    var d = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070b1c"/><stop offset=".6" stop-color="#1b2a4a"/><stop offset="1" stop-color="#3a4a6b"/></linearGradient>' +
      '<radialGradient id="win"><stop offset="0" stop-color="#ffcf7a" stop-opacity=".85"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>';
    var g = '<rect width="400" height="800" fill="url(#sky)"/>' + dots(35, 0, 330, 1.2, '#eef3ff', 0.8);
    g += '<path d="M60 220 A44 44 0 1 0 60 308 A52 52 0 0 1 60 220Z" fill="#e9e1c4" opacity=".85" transform="translate(240 -90)"/>';
    g += '<path d="M-10 560 Q120 520 230 550 T410 540 L410 800 L-10 800Z" fill="#cfd8ea"/><path d="M-10 640 Q140 600 260 640 T410 620 L410 800 L-10 800Z" fill="#e8eefa"/>';
    var tree = function (x, y, h) { return '<g stroke="#0d1220" stroke-width="3" fill="none" stroke-linecap="round"><path d="M' + x + ' ' + y + ' L' + x + ' ' + (y - h) + '"/><path d="M' + x + ' ' + (y - h * .5) + ' L' + (x - 26) + ' ' + (y - h * .8) + '"/><path d="M' + x + ' ' + (y - h * .65) + ' L' + (x + 24) + ' ' + (y - h * .92) + '"/><path d="M' + x + ' ' + (y - h * .85) + ' L' + (x - 14) + ' ' + (y - h * 1.05) + '"/></g>'; };
    g += tree(46, 600, 150) + tree(350, 590, 170) + tree(318, 630, 110);
    g += '<circle cx="200" cy="545" r="120" fill="url(#win)"/>';
    g += '<path d="M120 580 L120 500 L200 450 L280 500 L280 580Z" fill="#1a1522"/><path d="M110 505 L200 440 L290 505 L270 510 L200 462 L130 510Z" fill="#e8eefa"/>';
    g += '<rect x="178" y="518" width="44" height="36" fill="#ffc45e"/><path d="M200 518 V554 M178 536 H222" stroke="#3a2412" stroke-width="3"/>';
    g += '<rect x="244" y="458" width="14" height="30" fill="#1a1522"/>' + '<path d="M246 450 Q238 430 252 414 Q262 398 250 380" stroke="#9fb0cf" stroke-width="4" fill="none" opacity=".35" stroke-linecap="round"/>';
    g += '<path d="M150 800 Q190 640 200 586 Q212 640 250 800Z" fill="#c7d2e8" opacity=".6"/>';
    g += dots(110, 0, 800, 2.2, '#ffffff', 0.85);
    return wrap(g, d);
  };

  /* Sob a Montanha: salão de pedra negra, brasas e uma rosa com espinhos */
  S.montanha = function () {
    seed = 31;
    var d = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#07030a"/><stop offset="1" stop-color="#2a0a14"/></linearGradient>' + GLOW +
      '<radialGradient id="rg"><stop offset="0" stop-color="#e0405a" stop-opacity=".55"/><stop offset="1" stop-color="#e0405a" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="pet" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d2354f"/><stop offset="1" stop-color="#6a0f25"/></linearGradient>';
    var g = '<rect width="400" height="800" fill="url(#sky)"/>';
    var col = function (x, w, c) { return '<rect x="' + x + '" y="0" width="' + w + '" height="800" fill="' + c + '"/><rect x="' + (x + w * .15) + '" y="0" width="' + (w * .1) + '" height="800" fill="#ffffff" opacity=".04"/>'; };
    g += col(-10, 60, '#120810') + col(350, 60, '#120810') + col(78, 34, '#0d060d') + col(288, 34, '#0d060d');
    g += '<path d="M112 0 Q200 150 288 0" fill="none" stroke="#1a0c16" stroke-width="10"/><path d="M50 0 Q200 230 350 0" fill="none" stroke="#150a12" stroke-width="12"/>';
    g += '<path d="M0 640 L400 640 L400 800 L0 800Z" fill="#0a050a"/>' + '<path d="M0 640 L400 640" stroke="#3a1420" stroke-width="2"/>';
    g += fire(70, 660, 0.7) + fire(330, 660, 0.7);
    g += '<circle cx="200" cy="470" r="170" fill="url(#rg)"/>';
    g += '<path d="M200 560 Q180 640 208 760" stroke="#2b5a3a" stroke-width="5" fill="none" stroke-linecap="round"/>';
    g += '<path d="M196 600 l-14 -8 l10 -4Z M205 660 l16 -6 l-12 -6Z M200 715 l-14 -6 l12 -8Z" fill="#6aa27a"/>';
    var petal = function (a, sc, fill) { return '<g transform="translate(200 470) rotate(' + a + ') scale(' + sc + ')"><path d="M0 0 C-34 -18 -38 -66 0 -82 C38 -66 34 -18 0 0Z" fill="' + fill + '" stroke="#3a0715" stroke-width="1.2"/></g>'; };
    for (var i = 0; i < 6; i++) g += petal(i * 60, 1, 'url(#pet)');
    for (i = 0; i < 5; i++) g += petal(i * 72 + 20, 0.68, '#b02a45');
    for (i = 0; i < 4; i++) g += petal(i * 90 + 40, 0.4, '#8a1a33');
    g += '<path d="M200 470 m-8 0 a8 8 0 1 1 8 8 a5 5 0 1 1 -2 -9" fill="none" stroke="#3a0715" stroke-width="1.6"/>';
    g += dots(45, 300, 700, 1.6, '#ff9a3c', 0.9);
    return wrap(g, d);
  };

  /* Sobrevivente: tela de pintora, pinceladas, lua e estrelas pintadas */
  S.pincel = function () {
    seed = 41;
    var d = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1030"/><stop offset="1" stop-color="#1c2a5a"/></linearGradient>';
    var g = '<rect width="400" height="800" fill="url(#sky)"/>';
    var stroke = function (path, c, w, o) { return '<path d="' + path + '" stroke="' + c + '" stroke-width="' + w + '" fill="none" stroke-linecap="round" opacity="' + o + '"/>'; };
    g += stroke('M-20 120 Q100 60 200 130 T430 100', '#2a4a9a', 34, 0.55) + stroke('M-20 220 Q120 170 240 230 T430 200', '#3b66c4', 26, 0.45);
    g += stroke('M-20 330 Q90 290 190 340 T430 310', '#1c3a7e', 30, 0.55) + stroke('M-20 460 Q130 420 250 470 T430 440', '#2d5ab0', 24, 0.4);
    g += stroke('M40 150 Q120 120 200 160', '#d9b45a', 5, 0.7) + stroke('M210 260 Q290 230 360 270', '#d9b45a', 4, 0.6);
    g += '<g transform="translate(40 -105)"><path d="M270 150 A78 78 0 1 0 270 306 A95 95 0 0 1 270 150Z" fill="#f2e3b0"/></g>';
    g += star4(90, 110, 14, '#f6ebc3') + star4(330, 90, 10, '#f6ebc3') + star4(60, 300, 9, '#f6ebc3') + star4(180, 60, 8, '#f6ebc3') + star4(350, 340, 12, '#f6ebc3') + star4(130, 400, 8, '#f6ebc3');
    g += dots(55, 0, 520, 1.3, '#f6ebc3', 0.8);
    g += '<path d="M-10 800 L-10 640 Q60 600 120 660 Q150 590 210 650 Q260 590 320 650 Q370 610 410 650 L410 800Z" fill="#070a1c"/>';
    g += '<g transform="translate(200 680) rotate(-35)"><rect x="-6" y="-10" width="12" height="190" rx="5" fill="#6b3f22"/><rect x="-7" y="-30" width="14" height="24" fill="#c9a24a"/><path d="M-6 -30 Q0 -80 6 -30Z" fill="#e8d9a8"/><path d="M-6 -30 Q0 -64 6 -30Z" fill="#d9b45a"/></g>';
    g += '<circle cx="120" cy="720" r="7" fill="#d9b45a" opacity=".8"/><circle cx="140" cy="740" r="3" fill="#d9b45a" opacity=".7"/><circle cx="300" cy="700" r="5" fill="#3b66c4" opacity=".8"/>';
    return wrap(g, d);
  };

  /* Brinde: mar à noite na Corte do Verão, duas taças */
  S.brinde = function () {
    seed = 53;
    var d = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050818"/><stop offset=".6" stop-color="#102a52"/><stop offset="1" stop-color="#1d4f78"/></linearGradient>' +
      '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f3358"/><stop offset="1" stop-color="#04101f"/></linearGradient>';
    var g = '<rect width="400" height="800" fill="url(#sky)"/>' + dots(90, 0, 400, 1.5, '#f6ebc3', 0.95);
    g += star4(80, 120, 12, '#fff6d6') + star4(310, 200, 10, '#fff6d6') + star4(200, 70, 8, '#fff6d6');
    g += '<rect y="440" width="400" height="360" fill="url(#sea)"/>';
    g += '<g fill="#0a1a30"><rect x="270" y="360" width="16" height="90"/><path d="M262 360 Q278 320 294 360Z"/><rect x="300" y="380" width="14" height="70"/><path d="M294 380 Q307 345 320 380Z"/><rect x="330" y="350" width="18" height="100"/><path d="M322 350 Q339 306 356 350Z"/><rect x="250" y="410" width="130" height="40"/></g>';
    g += '<g fill="#ffd98a" opacity=".85"><rect x="276" y="395" width="3" height="6"/><rect x="306" y="410" width="3" height="6"/><rect x="338" y="385" width="3" height="6"/><rect x="340" y="420" width="3" height="6"/></g>';
    for (var i = 0; i < 40; i++) { var x = 40 + rnd() * 320, y = 460 + rnd() * 320, w = 10 + rnd() * 50; g += '<path d="M' + x.toFixed(0) + ' ' + y.toFixed(0) + ' h' + w.toFixed(0) + '" stroke="#9fd0f0" stroke-width="' + (1 + rnd() * 1.5).toFixed(1) + '" opacity="' + (0.1 + rnd() * 0.35).toFixed(2) + '" stroke-linecap="round"/>'; }
    g += '<path d="M140 450 L150 800 L190 800Z" fill="#fff6d6" opacity=".05"/>';
    var cup = function (x, y, rot) { return '<g transform="translate(' + x + ' ' + y + ') rotate(' + rot + ')"><path d="M-20 -52 Q-20 -14 0 -10 Q20 -14 20 -52Z" fill="#f6ebc3" opacity=".22" stroke="#f6ebc3" stroke-width="2"/><path d="M-19 -36 Q0 -30 19 -36 Q18 -14 0 -11 Q-18 -14 -19 -36Z" fill="#b8324f" opacity=".8"/><path d="M0 -10 V38" stroke="#f6ebc3" stroke-width="3"/><path d="M-16 40 H16" stroke="#f6ebc3" stroke-width="4" stroke-linecap="round"/></g>'; };
    g += cup(172, 700, 16) + cup(232, 700, -16);
    g += star4(202, 640, 18, '#fff6d6') + '<circle cx="202" cy="640" r="26" fill="#fff6d6" opacity=".12"/>';
    return wrap(g, d);
  };

  /* Suriel: floresta antiga e neblina, figura alta de manto esfarrapado */
  S.suriel = function () {
    seed = 67;
    var d = '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a09"/><stop offset=".6" stop-color="#14221d"/><stop offset="1" stop-color="#2a3b34"/></linearGradient>' +
      '<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe0d6" stop-opacity="0"/><stop offset="1" stop-color="#cfe0d6" stop-opacity=".55"/></linearGradient>';
    var g = '<rect width="400" height="800" fill="url(#sky)"/>';
    var trunk = function (x, w, c, o) { return '<path d="M' + x + ' 0 L' + (x + w) + ' 0 L' + (x + w * 1.25) + ' 800 L' + (x - w * .25) + ' 800Z" fill="' + c + '" opacity="' + o + '"/>'; };
    g += trunk(20, 22, '#0a1310', 0.55) + trunk(120, 16, '#0a1310', 0.5) + trunk(300, 20, '#0a1310', 0.55) + trunk(360, 14, '#0a1310', 0.45);
    g += '<rect y="420" width="400" height="380" fill="url(#mist)"/>';
    g += '<g transform="translate(200 640)" fill="#b9cbbf" opacity=".78"><path d="M-22 0 L-14 -150 Q-12 -190 0 -192 Q12 -190 14 -150 L26 0 L18 -10 L10 4 L2 -8 L-8 6 L-14 -6Z"/><ellipse cy="-204" rx="13" ry="17"/><path d="M-13 -214 Q0 -236 13 -214 Q0 -222 -13 -214Z" fill="#3b4a43"/><path d="M-14 -140 Q-46 -100 -52 -52 M14 -140 Q46 -100 50 -56" stroke="#b9cbbf" stroke-width="4" fill="none" stroke-linecap="round"/></g>';
    g += trunk(70, 30, '#060c0a', 0.85) + trunk(250, 36, '#060c0a', 0.9);
    g += '<rect y="560" width="400" height="240" fill="url(#mist)"/>';
    g += dots(30, 200, 700, 1.6, '#d9ecde', 0.5);
    return wrap(g, d);
  };

  window.EGG_SCENES = S;
})();
