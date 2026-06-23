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
    var ps = R.useState({ x: 0, y: 0 }); var pos = ps[0], setPos = ps[1];
    var rs = R.useState(null); var actReg = rs[0], setActReg = rs[1];
    var wrapRef = R.useRef(null);

    // normalize byProvince keys -> canonical Thai
    var bp = {}; var bpIn = props.byProvince || {};
    Object.keys(bpIn).forEach(function (k) { var n = normProv(k); bp[n] = (bp[n] || 0) + (Number(bpIn[k]) || 0); });
    var maxV = 1; Object.keys(bp).forEach(function (k) { if (bp[k] > maxV) maxV = bp[k]; });

    var regTot = {}, grand = 0, activeProvinces = 0;
    cache.feats.forEach(function (f) { var v = bp[f.th] || 0; if (v) { regTot[f.region] = (regTot[f.region] || 0) + v; grand += v; activeProvinces++; } });

    function fillFor(f) {
      var base = (REG_META[f.region] || {}).color || sub;
      var v = bp[f.th] || 0;
      if (mode === 'region') return mix(base, card, 0.6);
      if (mode === 'value') { if (v <= 0) return mix(brand, card, 0.9); return mix(mix(brand, card, 0.55), brand, Math.sqrt(v / maxV)); }
      // regionValue (default): faint region tint when no data, deepen toward full hue with value
      if (v <= 0) return mix(base, card, 0.87);
      return mix(mix(base, card, 0.5), base, Math.sqrt(v / maxV));
    }
    var dimOf = function (f) { return actReg && f.region !== actReg ? 0.22 : 1; };

    var paths = cache.feats.map(function (f, i) {
      var isHov = hov && hov.en === f.en;
      return el('path', {
        key: i, d: f.d, fill: fillFor(f),
        stroke: isHov ? ink : card, strokeWidth: isHov ? 1.7 : 0.6,
        opacity: dimOf(f), style: { cursor: 'pointer', transition: 'opacity .15s ease' },
        onMouseEnter: function () { setHov(f); },
        onClick: function () { if (props.onSelect) props.onSelect({ en: f.en, th: f.th, region: f.region, value: bp[f.th] || 0 }); }
      });
    });

    // small count badges on provinces that carry data
    var badges = cache.feats.filter(function (f) { return (bp[f.th] || 0) > 0; }).map(function (f, i) {
      return el('g', { key: 'b' + i, opacity: dimOf(f), style: { pointerEvents: 'none' } },
        el('circle', { cx: f.cx, cy: f.cy, r: 12, fill: '#ffffff', opacity: 0.92, stroke: (REG_META[f.region] || {}).color || sub, strokeWidth: 1.4 }),
        el('text', { x: f.cx, y: f.cy + 4, textAnchor: 'middle', fontSize: 13, fontWeight: 800, fill: ink, style: { fontVariantNumeric: 'tabular-nums' } }, bp[f.th])
      );
    });

    var svg = el('svg', { viewBox: '0 0 ' + cache.W + ' ' + cache.H, style: { width: '100%', height: 'auto', display: 'block', overflow: 'visible' } }, paths, badges);

    var legend = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 7, justifyContent: 'center', marginTop: 10 } },
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

    var tipW = 160;
    var clampX = wrapRef.current ? Math.max(4, Math.min(pos.x + 14, wrapRef.current.clientWidth - tipW)) : pos.x + 14;
    var tip = hov ? el('div', {
      style: { position: 'absolute', left: clampX, top: pos.y + 14, background: ink, color: '#fff', padding: '6px 10px', borderRadius: 8, fontSize: 12, pointerEvents: 'none', zIndex: 6, whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,.28)' }
    },
      el('div', { style: { fontWeight: 800 } }, lang === 'th' ? hov.th : hov.en),
      el('div', { style: { opacity: 0.85, fontSize: 11, marginTop: 2 } },
        (REG_META[hov.region] ? (lang === 'th' ? REG_META[hov.region].th : REG_META[hov.region].en) : '—') + ' · ' + (bp[hov.th] || 0) + (lang === 'th' ? ' โครงการ' : ' projects'))
    ) : null;

    if (!cache.feats.length) {
      return el('div', { style: { color: sub, fontSize: 12.5, padding: 20, textAlign: 'center' } }, lang === 'th' ? 'ไม่พบข้อมูลแผนที่ (TH_GEO)' : 'Map data unavailable (TH_GEO)');
    }

    return el('div', {
      ref: wrapRef,
      onMouseMove: function (e) { if (!wrapRef.current) return; var r = wrapRef.current.getBoundingClientRect(); setPos({ x: e.clientX - r.left, y: e.clientY - r.top }); },
      onMouseLeave: function () { setHov(null); setActReg(null); },
      style: { position: 'relative', width: '100%', maxWidth: props.maxWidth || 380, margin: '0 auto' }
    },
      svg, tip, legend,
      el('div', { style: { textAlign: 'center', fontSize: 11, color: sub, marginTop: 8 } },
        (lang === 'th' ? 'รวม ' : 'Total ') + grand + (lang === 'th' ? ' โครงการ · ' + activeProvinces + ' จังหวัด' : ' projects · ' + activeProvinces + ' provinces'))
    );
  }

  window.ThaiMap = ThaiMap;
})();
