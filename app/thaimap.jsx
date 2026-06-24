/* Thailand province choropleth — original component for Water POG Financial Console.
   Renders window.TH_GEO (77 provinces, vendored MIT GeoJSON in app/thaimap_data.js) as an
   SVG map, colored by region with intensity by project count. Exposes global window.ThaiMap.

   Everything here — equirectangular projection, region grouping, Thai province names,
   theming, hover/legend/tooltip — is our own code. Only the boundary coordinates come from
   the vendored public-domain geometry (province borders are geographic facts).

   Props:
     palette     : the investor/page palette object (p) for theme colors {card,card2,ink,sub,line,...}
     byProvince  : { '<Thai province name>': number }  (e.g. project counts; investor m.byProv)
     byRegion    : optional { '<English region>': number } (legend fallback)
     lang        : 'th' | 'en'
     mode        : 'regionValue' (default) | 'region' | 'value'
     maxWidth    : px cap for the map column (default 380)
     onSelect    : optional fn(featureInfo) on province click
*/
(function () {
  var R = window.React;
  if (!R) return;
  var el = R.createElement;

  // province (English key from GeoJSON properties.name) -> [Thai name, region]
  // Region grouping mirrors the app's canonical grouping in pc_engine.jsx (lower-north
  // = Central), so legend totals here match "Projects by Region" elsewhere.
  var PROV = {
    // North (9)
    'Chiang Rai': ['เชียงราย', 'North'], 'Chiang Mai': ['เชียงใหม่', 'North'], 'Nan': ['น่าน', 'North'],
    'Phayao': ['พะเยา', 'North'], 'Phrae': ['แพร่', 'North'], 'Mae Hong Son': ['แม่ฮ่องสอน', 'North'],
    'Lampang': ['ลำปาง', 'North'], 'Lamphun': ['ลำพูน', 'North'], 'Uttaradit': ['อุตรดิตถ์', 'North'],
    // Northeast (20)
    'Kalasin': ['กาฬสินธุ์', 'Northeast'], 'Khon Kaen': ['ขอนแก่น', 'Northeast'], 'Chaiyaphum': ['ชัยภูมิ', 'Northeast'],
    'Nakhon Phanom': ['นครพนม', 'Northeast'], 'Nakhon Ratchasima': ['นครราชสีมา', 'Northeast'], 'Bueng Kan': ['บึงกาฬ', 'Northeast'],
    'Buri Ram': ['บุรีรัมย์', 'Northeast'], 'Maha Sarakham': ['มหาสารคาม', 'Northeast'], 'Mukdahan': ['มุกดาหาร', 'Northeast'],
    'Yasothon': ['ยโสธร', 'Northeast'], 'Roi Et': ['ร้อยเอ็ด', 'Northeast'], 'Loei': ['เลย', 'Northeast'],
    'Si Sa Ket': ['ศรีสะเกษ', 'Northeast'], 'Sakon Nakhon': ['สกลนคร', 'Northeast'], 'Surin': ['สุรินทร์', 'Northeast'],
    'Nong Khai': ['หนองคาย', 'Northeast'], 'Nong Bua Lam Phu': ['หนองบัวลำภู', 'Northeast'], 'Amnat Charoen': ['อำนาจเจริญ', 'Northeast'],
    'Udon Thani': ['อุดรธานี', 'Northeast'], 'Ubon Ratchathani': ['อุบลราชธานี', 'Northeast'],
    // West (5)
    'Kanchanaburi': ['กาญจนบุรี', 'West'], 'Tak': ['ตาก', 'West'], 'Prachuap Khiri Khan': ['ประจวบคีรีขันธ์', 'West'],
    'Phetchaburi': ['เพชรบุรี', 'West'], 'Ratchaburi': ['ราชบุรี', 'West'],
    // Central (22)
    'Bangkok Metropolis': ['กรุงเทพมหานคร', 'Central'], 'Kamphaeng Phet': ['กำแพงเพชร', 'Central'], 'Chai Nat': ['ชัยนาท', 'Central'],
    'Nakhon Nayok': ['นครนายก', 'Central'], 'Nakhon Pathom': ['นครปฐม', 'Central'], 'Nakhon Sawan': ['นครสวรรค์', 'Central'],
    'Nonthaburi': ['นนทบุรี', 'Central'], 'Pathum Thani': ['ปทุมธานี', 'Central'], 'Phra Nakhon Si Ayutthaya': ['พระนครศรีอยุธยา', 'Central'],
    'Phichit': ['พิจิตร', 'Central'], 'Phitsanulok': ['พิษณุโลก', 'Central'], 'Phetchabun': ['เพชรบูรณ์', 'Central'],
    'Lop Buri': ['ลพบุรี', 'Central'], 'Samut Prakan': ['สมุทรปราการ', 'Central'], 'Samut Songkhram': ['สมุทรสงคราม', 'Central'],
    'Samut Sakhon': ['สมุทรสาคร', 'Central'], 'Saraburi': ['สระบุรี', 'Central'], 'Sing Buri': ['สิงห์บุรี', 'Central'],
    'Sukhothai': ['สุโขทัย', 'Central'], 'Suphan Buri': ['สุพรรณบุรี', 'Central'], 'Ang Thong': ['อ่างทอง', 'Central'],
    'Uthai Thani': ['อุทัยธานี', 'Central'],
    // East (7)
    'Chanthaburi': ['จันทบุรี', 'East'], 'Chachoengsao': ['ฉะเชิงเทรา', 'East'], 'Chon Buri': ['ชลบุรี', 'East'],
    'Trat': ['ตราด', 'East'], 'Prachin Buri': ['ปราจีนบุรี', 'East'], 'Rayong': ['ระยอง', 'East'], 'Sa Kaeo': ['สระแก้ว', 'East'],
    // South (14)
    'Krabi': ['กระบี่', 'South'], 'Chumphon': ['ชุมพร', 'South'], 'Trang': ['ตรัง', 'South'],
    'Nakhon Si Thammarat': ['นครศรีธรรมราช', 'South'], 'Narathiwat': ['นราธิวาส', 'South'], 'Pattani': ['ปัตตานี', 'South'],
    'Phangnga': ['พังงา', 'South'], 'Phatthalung': ['พัทลุง', 'South'], 'Phuket': ['ภูเก็ต', 'South'],
    'Yala': ['ยะลา', 'South'], 'Ranong': ['ระนอง', 'South'], 'Songkhla': ['สงขลา', 'South'],
    'Satun': ['สตูล', 'South'], 'Surat Thani': ['สุราษฎร์ธานี', 'South']
  };

  // region meta — harmonized tones tuned to the deck (blue/gold premium), distinct per region
  var REG_META = {
    North:     { th: 'ภาคเหนือ',     en: 'North',     color: '#5b8def' },
    Northeast: { th: 'ภาคอีสาน',     en: 'Northeast', color: '#e0a43a' },
    Central:   { th: 'ภาคกลาง',      en: 'Central',   color: '#2f9e8f' },
    West:      { th: 'ภาคตะวันตก',   en: 'West',      color: '#8a7be0' },
    East:      { th: 'ภาคตะวันออก',  en: 'East',      color: '#e5806e' },
    South:     { th: 'ภาคใต้',       en: 'South',     color: '#37a86a' }
  };
  var REG_ORDER = ['North', 'Northeast', 'Central', 'West', 'East', 'South'];

  // common Thai spelling variants in project data -> canonical name used in PROV
  var ALIAS = {
    'กรุงเทพ': 'กรุงเทพมหานคร', 'กทม': 'กรุงเทพมหานคร', 'กทม.': 'กรุงเทพมหานคร',
    'อยุธยา': 'พระนครศรีอยุธยา', 'ศรีษะเกษ': 'ศรีสะเกษ', 'บุรีรัมย': 'บุรีรัมย์'
  };
  function normProv(s) {
    s = String(s == null ? '' : s).replace(/^จ\.?\s*/, '').replace(/^จังหวัด\s*/, '').trim();
    return ALIAS[s] || s;
  }

  // ── projection + path strings (computed once, cached) ─────────────────────────
  var _cache = null;
  function geoCache() {
    if (_cache) return _cache;
    var geo = window.TH_GEO;
    if (!geo || !geo.features) { _cache = { feats: [], W: 1000, H: 1000 }; return _cache; }
    var minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
    function bound(r) { for (var i = 0; i < r.length; i++) { var x = r[i][0], y = r[i][1]; if (x < minLng) minLng = x; if (x > maxLng) maxLng = x; if (y < minLat) minLat = y; if (y > maxLat) maxLat = y; } }
    function walk(g) { if (g.type === 'Polygon') g.coordinates.forEach(bound); else if (g.type === 'MultiPolygon') g.coordinates.forEach(function (poly) { poly.forEach(bound); }); }
    geo.features.forEach(function (f) { walk(f.geometry); });

    var PAD = 10, Wt = 1000 - PAD * 2;
    var midLat = (minLat + maxLat) / 2, cos = Math.cos(midLat * Math.PI / 180);
    var scale = Wt / ((maxLng - minLng) * cos);
    var H = PAD * 2 + (maxLat - minLat) * scale;
    function px(lng) { return PAD + (lng - minLng) * cos * scale; }
    function py(lat) { return PAD + (maxLat - lat) * scale; }
    function rd(n) { return Math.round(n * 10) / 10; }
    function ringPath(r) { if (r.length < 3) return ''; var d = 'M'; for (var i = 0; i < r.length; i++) d += (i ? 'L' : '') + rd(px(r[i][0])) + ',' + rd(py(r[i][1])); return d + 'Z'; }

    var feats = geo.features.map(function (f) {
      var nm = (f.properties && f.properties.name) || '';
      var meta = PROV[nm] || ['', ''];
      var d = '', big = null, bigLen = -1;
      function poly(rings) { rings.forEach(function (r) { d += ringPath(r); if (r.length > bigLen) { bigLen = r.length; big = r; } }); }
      if (f.geometry.type === 'Polygon') poly(f.geometry.coordinates);
      else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates.forEach(poly);
      var cx = 0, cy = 0;
      if (big) { for (var i = 0; i < big.length; i++) { cx += px(big[i][0]); cy += py(big[i][1]); } cx /= big.length; cy /= big.length; }
      return { en: nm, th: meta[0] || nm, region: meta[1] || '', d: d, cx: rd(cx), cy: rd(cy) };
    });
    _cache = { feats: feats, W: 1000, H: Math.round(H) };
    return _cache;
  }

  // ── color helpers ─────────────────────────────────────────────────────────────
  function hx(c) { c = String(c).replace('#', ''); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)]; }
  function mix(a, b, t) { var A = hx(a), B = hx(b); function f(i) { return Math.round(A[i] + (B[i] - A[i]) * t); } return 'rgb(' + f(0) + ',' + f(1) + ',' + f(2) + ')'; }

  function ThaiMap(props) {
    props = props || {};
    var p = props.palette || {};
    var card = p.card || '#ffffff', card2 = p.card2 || '#f3f6fc', ink = p.ink || '#0f244d', sub = p.sub || '#5b6b86', line = p.line || '#e3e9f2';
    var brand = p.brand || '#2a6fdb';
    var lang = props.lang === 'en' ? 'en' : 'th';
    var mode = props.mode || 'regionValue';
    var cache = geoCache();

    var hs = R.useState(null); var hov = hs[0], setHov = hs[1];
    var ps = R.useState({ x: 0, y: 0, full: false }); var pos = ps[0], setPos = ps[1];
    var rs = R.useState(null); var actReg = rs[0], setActReg = rs[1];
    var fst = R.useState(false); var full = fst[0], setFull = fst[1];
    var vst = R.useState({ s: 1, cx: cache.W / 2, cy: cache.H / 2 }); var view = vst[0], setView = vst[1];
    var sps = R.useState(null); var selProv = sps[0], setSelProv = sps[1];
    var ges = R.useState({}); var grpExp = ges[0], setGrpExp = ges[1];
    var wrapRef = R.useRef(null), fullRef = R.useRef(null), dragRef = R.useRef({ on: false });
    var viewRef = R.useRef(view); viewRef.current = view;

    // ── zoom / pan / fullscreen helpers (viewBox-based, keeps SVG crisp) ─────────
    function clampN(v, a, b) { return v < a ? a : (v > b ? b : v); }
    function r1(n) { return Math.round(n * 10) / 10; }
    function vbox() { var w = cache.W / view.s, h = cache.H / view.s; var x = clampN(view.cx - w / 2, 0, Math.max(0, cache.W - w)), y = clampN(view.cy - h / 2, 0, Math.max(0, cache.H - h)); return { x: x, y: y, w: w, h: h, s: r1(x) + ' ' + r1(y) + ' ' + r1(w) + ' ' + r1(h) }; }
    function zoomStep(f) { setView(function (v) { return { s: clampN(v.s * f, 1, 8), cx: v.cx, cy: v.cy }; }); }
    function resetView() { setView({ s: 1, cx: cache.W / 2, cy: cache.H / 2 }); }
    function doWheel(e, node) {
      var v = viewRef.current, rect = node.getBoundingClientRect();
      var vw = cache.W / v.s, vh = cache.H / v.s;
      var vx = clampN(v.cx - vw / 2, 0, Math.max(0, cache.W - vw)), vy = clampN(v.cy - vh / 2, 0, Math.max(0, cache.H - vh));
      var rx = (e.clientX - rect.left) / rect.width, ry = (e.clientY - rect.top) / rect.height;
      var ax = vx + rx * vw, ay = vy + ry * vh;
      var ns = clampN(v.s * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 1, 8);
      var nw = cache.W / ns, nh = cache.H / ns;
      setView({ s: ns, cx: ax - rx * nw + nw / 2, cy: ay - ry * nh + nh / 2 });
    }
    function onDown(e, ref) { if (view.s <= 1) return; dragRef.current = { on: true, x0: e.clientX, y0: e.clientY, cx0: view.cx, cy0: view.cy }; }
    function onMove(e, ref) {
      var node = ref.current; if (!node) return;
      var rect = node.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, full: ref === fullRef });
      var d = dragRef.current;
      if (d.on) { var vb = vbox(); setView({ s: view.s, cx: d.cx0 - (e.clientX - d.x0) * (vb.w / rect.width), cy: d.cy0 - (e.clientY - d.y0) * (vb.h / rect.height) }); }
    }
    R.useEffect(function () {
      function attach(node) { if (!node) return null; var fn = function (e) { e.preventDefault(); doWheel(e, node); }; node.addEventListener('wheel', fn, { passive: false }); return function () { node.removeEventListener('wheel', fn); }; }
      var d1 = attach(wrapRef.current), d2 = full ? attach(fullRef.current) : null;
      return function () { if (d1) d1(); if (d2) d2(); };
    }, [full]);
    R.useEffect(function () { if (!full) return; function onKey(e) { if (e.key === 'Escape') { setFull(false); resetView(); } } window.addEventListener('keydown', onKey); return function () { window.removeEventListener('keydown', onKey); }; }, [full]);
    R.useEffect(function () { setGrpExp({}); }, [selProv]);

    // normalize byProvince keys -> canonical Thai
    var bp = {}; var bpIn = props.byProvince || {};
    Object.keys(bpIn).forEach(function (k) { var n = normProv(k); bp[n] = (bp[n] || 0) + (Number(bpIn[k]) || 0); });
    var maxV = 1; Object.keys(bp).forEach(function (k) { if (bp[k] > maxV) maxV = bp[k]; });

    var regTot = {}, grand = 0, activeProvinces = 0;
    cache.feats.forEach(function (f) { var v = bp[f.th] || 0; if (v) { regTot[f.region] = (regTot[f.region] || 0) + v; grand += v; activeProvinces++; } });

    // Anchor tints to a FIXED light neutral (not the theme `card`) so every province stays
    // clearly region-colored on BOTH light and dark themes. Fading toward `card` made no-data
    // provinces collapse to white (light theme) or near-black (dark theme) — the "ดำปี๋" bug.
    var TINT = '#eef2f7';
    function fillFor(f) {
      var base = (REG_META[f.region] || {}).color || '#9aa7bd';
      var v = bp[f.th] || 0;
      if (mode === 'region') return mix(TINT, base, 0.62);
      if (mode === 'value') { var tb = v <= 0 ? 0.16 : (0.55 + 0.45 * Math.sqrt(v / maxV)); return mix(TINT, brand, Math.min(1, tb)); }
      // regionValue (default): clearly region-tinted even with no data; data deepens toward full hue
      var t = v <= 0 ? 0.40 : (0.55 + 0.45 * Math.sqrt(v / maxV));
      return mix(TINT, base, Math.min(1, t));
    }
    var dimOf = function (f) { return actReg && f.region !== actReg ? 0.22 : 1; };

    var paths = cache.feats.map(function (f, i) {
      var isHov = hov && hov.en === f.en;
      return el('path', {
        key: i, d: f.d, fill: fillFor(f),
        stroke: isHov ? ink : card, strokeWidth: isHov ? 1.7 : 0.6,
        opacity: dimOf(f), style: { cursor: 'pointer', transition: 'opacity .15s ease' },
        onMouseEnter: function () { setHov(f); },
        onClick: function () { setSelProv(function (p) { return p === f.th ? null : f.th; }); if (props.onSelect) props.onSelect({ en: f.en, th: f.th, region: f.region, value: bp[f.th] || 0 }); }
      });
    });

    // small count badges on provinces that carry data
    var badges = cache.feats.filter(function (f) { return (bp[f.th] || 0) > 0; }).map(function (f, i) {
      return el('g', { key: 'b' + i, opacity: dimOf(f), style: { pointerEvents: 'none' } },
        el('circle', { cx: f.cx, cy: f.cy, r: 12, fill: '#ffffff', opacity: 0.92, stroke: (REG_META[f.region] || {}).color || sub, strokeWidth: 1.4 }),
        el('text', { x: f.cx, y: f.cy + 4, textAnchor: 'middle', fontSize: 13, fontWeight: 800, fill: '#10233f', style: { fontVariantNumeric: 'tabular-nums' } }, bp[f.th])
      );
    });

    if (!cache.feats.length) {
      return el('div', { style: { color: sub, fontSize: 12.5, padding: 20, textAlign: 'center' } }, lang === 'th' ? 'ไม่พบข้อมูลแผนที่ (TH_GEO)' : 'Map data unavailable (TH_GEO)');
    }

    function legendEl() {
      return el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 10 } },
        REG_ORDER.map(function (rk) {
          var m = REG_META[rk]; var tot = regTot[rk] || 0;
          return el('div', {
            key: rk, onMouseEnter: function () { setActReg(rk); }, onMouseLeave: function () { setActReg(null); },
            style: { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 99, background: actReg === rk ? mix(m.color, card, 0.78) : card2, border: '1px solid ' + (actReg === rk ? m.color : line), cursor: 'default', fontSize: 11.5, transition: 'background .15s' }
          },
            el('span', { style: { width: 10, height: 10, borderRadius: 3, background: m.color, flex: '0 0 auto' } }),
            el('span', { style: { color: ink, fontWeight: 600 } }, lang === 'th' ? m.th : m.en),
            el('span', { style: { color: sub, fontVariantNumeric: 'tabular-nums' } }, tot)
          );
        })
      );
    }
    var footer = el('div', { style: { textAlign: 'center', fontSize: 11, color: sub, marginTop: 8 } },
      (lang === 'th' ? 'รวม ' : 'Total ') + grand + (lang === 'th' ? ' โครงการ · ' + activeProvinces + ' จังหวัด' : ' projects · ' + activeProvinces + ' provinces'));

    function provPanel(isFull) {
      if (!selProv) return null;
      var projs = (props.provProjects || {})[selProv] || [];
      var feat = null;
      for (var fi = 0; fi < cache.feats.length; fi++) { if (cache.feats[fi].th === selProv) { feat = cache.feats[fi]; break; } }
      var rm = feat ? (REG_META[feat.region] || {}) : {};
      var regColor = rm.color || sub;
      var regLabel = lang === 'th' ? (rm.th || '') : (rm.en || '');
      var v = bp[selProv] || 0;
      // group by product type
      var groups = {};
      projs.forEach(function (prj) { var t = prj.type || (lang === 'th' ? 'อื่นๆ' : 'Other'); if (!groups[t]) groups[t] = []; groups[t].push(prj); });
      var typeKeys = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
      var outerStyle = isFull
        ? { position: 'absolute', top: 8, right: 8, bottom: 8, width: 380, zIndex: 10, display: 'flex', flexDirection: 'column', background: card, borderRadius: 12, borderLeft: '4px solid ' + regColor, boxShadow: '0 6px 24px rgba(0,0,0,.22)', overflow: 'hidden' }
        : { background: card2, borderRadius: 12, borderLeft: '4px solid ' + regColor, overflow: 'hidden' };
      return el('div', { style: outerStyle },
        el('div', { style: { padding: '12px 14px', flexShrink: 0, borderBottom: '1px solid ' + line } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
            el('div', null,
              el('div', { style: { fontSize: 15, fontWeight: 800, color: ink } }, selProv),
              el('div', { style: { fontSize: 11.5, color: sub, marginTop: 2 } }, regLabel + ' · ' + v + (lang === 'th' ? ' โครงการ' : ' projects'))
            ),
            el('button', { onClick: function () { setSelProv(null); }, style: { border: 'none', background: 'none', cursor: 'pointer', color: sub, fontSize: 18, lineHeight: 1, padding: '0 0 0 10px' } }, '✕')
          )
        ),
        el('div', { style: { flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 } },
          projs.length === 0
            ? el('div', { style: { fontSize: 12.5, color: sub, textAlign: 'center', padding: '12px 0' } }, lang === 'th' ? 'ไม่มีรายละเอียดโครงการ' : 'No project details')
            : typeKeys.map(function (t, gi) {
                var items = groups[t];
                var exp = !!grpExp[t];
                var totalAmt = items.reduce(function (s, prj) { return s + (Number(prj.amount) || 0); }, 0);
                return el('div', { key: t },
                  el('div', {
                    onClick: function () { setGrpExp(function (prev) { var n = Object.assign({}, prev); n[t] = !n[t]; return n; }); },
                    style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: card2, borderRadius: 8, cursor: 'pointer', border: '1px solid ' + line, userSelect: 'none' }
                  },
                    el('span', { style: { color: regColor, fontSize: 13, fontWeight: 700, flexShrink: 0 } }, exp ? '▾' : '▸'),
                    el('span', { style: { fontWeight: 700, color: ink, fontSize: 13, flex: 1 } }, t),
                    el('span', { style: { fontSize: 11, color: sub, background: card, borderRadius: 99, padding: '2px 7px', border: '1px solid ' + line, flexShrink: 0 } }, items.length + (lang === 'th' ? ' งาน' : '')),
                    totalAmt > 0 ? el('span', { style: { fontSize: 11, color: regColor, fontWeight: 600, flexShrink: 0, marginLeft: 2 } }, totalAmt.toLocaleString('th-TH', { maximumFractionDigits: 0 })) : null
                  ),
                  exp ? el('div', { style: { marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4, paddingLeft: 8 } },
                    items.map(function (prj, pi) {
                      return el('div', { key: pi, style: { fontSize: 12, padding: '6px 10px', background: card, borderRadius: 8, borderLeft: '3px solid ' + regColor } },
                        el('div', { style: { fontWeight: 700, color: ink, fontSize: 12.5, marginBottom: 2 } }, prj.code || '—'),
                        prj.site ? el('div', { style: { color: sub, fontSize: 11.5, marginBottom: 2 } }, prj.site) : null,
                        el('div', { style: { fontSize: 11, color: sub, display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 } },
                          prj.status ? el('span', null, prj.status) : null,
                          prj.amount > 0 ? el('span', null, Number(prj.amount).toLocaleString('th-TH', { maximumFractionDigits: 0 })) : null
                        )
                      );
                    })
                  ) : null
                );
              })
        )
      );
    }
    function ctlBtn(label, onClick, title) {
      return el('button', { onClick: onClick, title: title, style: { width: 30, height: 30, borderRadius: 8, border: '1px solid ' + line, background: card, color: ink, fontSize: 16, fontWeight: 700, cursor: 'pointer', display: 'grid', placeItems: 'center', boxShadow: '0 2px 6px rgba(0,0,0,.15)', lineHeight: 1, padding: 0 } }, label);
    }
    function controls(isFull) {
      var ctrlStyle = { position: 'absolute', top: 8, zIndex: 11, display: 'flex', flexDirection: 'column', gap: 6 };
      if (isFull) { ctrlStyle.left = 8; } else { ctrlStyle.right = 8; }
      return el('div', { style: ctrlStyle },
        ctlBtn('+', function () { zoomStep(1.4); }, lang === 'th' ? 'ซูมเข้า' : 'Zoom in'),
        ctlBtn('−', function () { zoomStep(1 / 1.4); }, lang === 'th' ? 'ซูมออก' : 'Zoom out'),
        ctlBtn('↺', resetView, lang === 'th' ? 'รีเซ็ตมุมมอง' : 'Reset view'),
        ctlBtn(isFull ? '✕' : '⛶', function () { if (isFull) { setFull(false); resetView(); } else { setFull(true); } }, isFull ? (lang === 'th' ? 'ปิดเต็มจอ (Esc)' : 'Close (Esc)') : (lang === 'th' ? 'ขยายเต็มจอ' : 'Fullscreen'))
      );
    }
    function tipFor(isFull) {
      if (!hov || dragRef.current.on || (!!pos.full !== isFull)) return null;
      var node = isFull ? fullRef.current : wrapRef.current;
      var cw = node ? node.clientWidth : 360;
      var left = Math.max(4, Math.min(pos.x + 14, cw - 168));
      return el('div', { style: { position: 'absolute', left: left, top: pos.y + 14, background: '#10233f', color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, pointerEvents: 'none', zIndex: 8, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,.28)' } },
        el('div', { style: { fontWeight: 800 } }, lang === 'th' ? hov.th : hov.en),
        el('div', { style: { opacity: 0.85, fontSize: 11, marginTop: 2 } },
          (REG_META[hov.region] ? (lang === 'th' ? REG_META[hov.region].th : REG_META[hov.region].en) : '—') + ' · ' + (bp[hov.th] || 0) + (lang === 'th' ? ' โครงการ' : ' projects')));
    }
    function mapArea(isFull) {
      var ref = isFull ? fullRef : wrapRef;
      var grabbing = dragRef.current.on;
      var cur = view.s > 1 ? (grabbing ? 'grabbing' : 'grab') : 'default';
      return el('div', {
        ref: ref,
        onMouseMove: function (e) { onMove(e, ref); },
        onMouseLeave: function () { setHov(null); setActReg(null); dragRef.current.on = false; },
        onMouseDown: function (e) { onDown(e, ref); },
        onMouseUp: function () { if (dragRef.current.on) { dragRef.current.on = false; setPos(function (q) { return { x: q.x, y: q.y, full: q.full }; }); } },
        style: isFull
          ? { position: 'relative', width: '100%', height: '100%', cursor: cur }
          : { position: 'relative', width: '100%', maxWidth: props.maxWidth || 380, margin: '0 auto', cursor: cur, overflow: 'hidden' }
      },
        controls(isFull),
        el('svg', { viewBox: vbox().s, style: isFull ? { width: '100%', height: '100%', display: 'block' } : { width: '100%', height: 'auto', display: 'block' } }, paths, badges),
        tipFor(isFull),
        isFull ? provPanel(true) : null
      );
    }

    var overlay = full ? el('div', { style: { position: 'fixed', inset: 0, zIndex: 1200, background: card, display: 'flex', flexDirection: 'column', padding: '14px 18px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 } },
        el('div', { style: { fontSize: 16, fontWeight: 800, color: ink } }, lang === 'th' ? 'แผนที่จังหวัด — โครงการแยกตามภูมิภาค' : 'Provincial Map — Projects by Region'),
        el('div', { style: { marginLeft: 'auto', fontSize: 11.5, color: sub } }, lang === 'th' ? 'ลากเพื่อเลื่อน · ลูกกลิ้งเมาส์ซูม · Esc ปิด' : 'Drag to pan · scroll to zoom · Esc to close')),
      el('div', { style: { flex: 1, minHeight: 0, overflow: 'hidden' } }, mapArea(true)),
      legendEl()
    ) : null;

    return el('div', null, mapArea(false), selProv && !full ? el('div', { style: { marginTop: 10 } }, provPanel(false)) : null, legendEl(), footer, overlay);
  }

  window.ThaiMap = ThaiMap;
})();
