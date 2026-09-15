/**
 * test-tiktok.js — ĐỢT 4 PHẦN B: TIKTOK SHOP (YC-49…YC-54). Chạy: `node node/test-tiktok.js`.
 *
 * Chạy trên FILE THẬT trong `00_DAU_VAO/TIKTOK/` (chỉ đọc): báo cáo "Sẽ thanh toán" (A), "Đã quyết toán" (B), Order Export (C) và BẢN SAO SỔ
 * THÁNG 9 THẬT (sheet `TikTok Shop` 15 cột, 166 dòng nhập tay, 71 đơn). Không mạng: Web App giả (`gia-lap-web-app.js`) chạy MÃ THẬT
 * `src/ShellAppsScript.gs`. Mapping TikTok trong bài là FIXTURE CỦA TEST (suy từ chuỗi biến thể theo chương 11.3.b) — không phải bảng Mapping
 * thật của shop (Q-34 chủ dự án duyệt).
 *
 * Mỗi ca kèm ĐỐI CHỨNG ÂM dựng lại đúng khuyết tật (nạp bản sửa trong bộ nhớ, không ghi đĩa) và chứng minh phép chấm LỆCH. Mã bài `TT-xx`.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
// Nạp TRƯỚC: module này cắt cầu mạng (thay `https`).
const gl = require('./gia-lap-web-app');
const { napXlsxVaoGiaLap } = require('./nap-xlsx-gia-lap');
const { napLoi, THU_TU, SRC } = require('./nap-loi');
const { chayLenGoogleSheet } = require('./chay-google-sheet');
const TT = require('./chay-tiktok');

const lop = napLoi();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });
const AT = lop.AdapterTikTok;

const DAU_VAO = path.join(__dirname, '..', '..', '..', '00_DAU_VAO');
const D_TT = path.join(DAU_VAO, 'TIKTOK');
const FILE = {
  A: path.join(D_TT, 'Onhold-unsettled-orders-2026_09_01-2026_09_15(UTC+7).xlsx'),
  B: path.join(D_TT, 'income_20260915221317(UTC+7).xlsx'),
  C: path.join(D_TT, 'Tất cả đơn hàng-2026-09-15-21_05.xlsx'),
  SO: path.join(D_TT, 'THÁNG-9-2026-KINH-DOANH-POB (1).xlsx'),
  SHOPEE: path.join(DAU_VAO, 'Order.toship.20260807_20260906.xlsx')
};
const TEN_SO = 'THÁNG-9-2026-KINH-DOANH-POB';
const NGAY_GOOGLE = '2026-09-16T02:00:00Z';            // 09:00 16/9 giờ Việt Nam
const THOI_DIEM = new Date(NGAY_GOOGLE);
const SHEET = 'TikTok Shop';

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
async function test(ma, ten, fn) {
  try {
    const t = await fn();
    soDat++;
    console.log('ĐẠT   ' + ma + ' ' + ten);
    if (t) console.log('        · ' + t);
  } catch (e) {
    soHong++;
    hong.push(ma + ' ' + ten + ' -> ' + (e && e.message));
    console.log('HỎNG  ' + ma + ' ' + ten + '\n   -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}
function bang(thuc, mong, vi) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((vi ? vi + ': ' : '') + 'được ' + a.slice(0, 400) + ', cần ' + b.slice(0, 400));
}
function dung(dk, vi) { if (!dk) throw new Error(vi || 'điều kiện sai'); }
/** `fn` dựng lại đúng MỘT khuyết tật, trả danh sách điều phép chấm bắt được. Rỗng = phép chấm mù. */
async function doiChungAm(fn, moTa) {
  let ra;
  try { ra = await fn(); } catch (e) { ra = ['ném lỗi: ' + (e && e.message)]; }
  if (!Array.isArray(ra) || !ra.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa + ' — phép chấm này không bắt được gì');
  return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + String(ra[0]).slice(0, 150) + ') ← đúng như phải thế';
}

/** Lõi nạp lại với MỘT chỗ sửa trong một file src (mốc phải có đúng một chỗ). */
function napLoiSua(tenFile, moc, thay) {
  const src = THU_TU.map((f) => {
    let s = fs.readFileSync(path.join(SRC, f), 'utf8');
    if (f === tenFile) {
      for (const [m, t] of (Array.isArray(moc) ? moc : [[moc, thay]])) {         // một mốc, hoặc mảng [mốc, thay]
        const n = s.split(m).length - 1;
        if (n !== 1) throw new Error('mốc đối chứng âm trong ' + f + ' cần 1 chỗ, tìm được ' + n + ': ' + m.slice(0, 80) + ' — sửa mốc, ĐỪNG bỏ bài');
        s = s.split(m).join(t);
      }
    }
    return s;
  }).join('\n;\n');
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  return new Function(src + '\nreturn {' + [...ten].map((n) => n + ': ' + n).join(', ') + '};')();   // eslint-disable-line no-new-func
}

/** Nạp bản sửa của một file trong node/. */
function napNodeSua(tenFile, doi) {
  const tep = path.join(__dirname, tenFile);
  let src = fs.readFileSync(tep, 'utf8');
  for (const [moc, thay] of doi) {
    const n = src.split(moc).length - 1;
    if (n !== 1) throw new Error('mốc đối chứng âm trong ' + tenFile + ' cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 80));
    src = src.split(moc).join(thay);
  }
  const m = new Module(tep, module);
  m.filename = tep;
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(src, tep);
  return m.exports;
}
/** Như `napVoGoogle` của chay-google-sheet.js nhưng nguồn `src/ShellAppsScript.gs` đã qua `sua` — chỉ cho đối chứng âm phía máy. */
function napVoSua(sua) {
  const src = sua(fs.readFileSync(path.join(SRC, 'ShellAppsScript.gs'), 'utf8'));
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const khai = Object.keys(lop).map((k) => 'var ' + k + ' = __loi[' + JSON.stringify(k) + '];').join('\n');
  return new Function('__loi', khai + '\n' + src + '\nreturn {' + [...ten].map((n) => n + ': ' + n).join(', ') + '};')(lop);   // eslint-disable-line no-new-func
}
function suaGs(moc, thay) {
  return (src) => {
    const n = src.split(moc).length - 1;
    if (n !== 1) throw new Error('mốc .gs cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 80));
    return src.split(moc).join(thay);
  };
}

// ==================================================================== dữ liệu

const RAC = [];
function tamMoi(ten) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-tt-' + ten + '-')); RAC.push(d); return d; }

function docA(tc) {
  const wb = TT.moWorkbook(FILE.A);
  const nd = AT.nhanDien(wb.tenSheet, wb.bang);
  return { wb, nd, bang: wb.bang(nd.tenSheet) };
}

const MAU = {};
function saoFile(nguon, dich) {
  nguon.getSheets().forEach((sh) => {
    const n = dich.themSheet(sh.ten);
    ['giaTri', 'congThuc', 'dinhDang', 'nen', 'dam'].forEach((k) => { n[k] = Object.assign({}, sh[k]); });
    n.gopO = sh.gopO.map((g) => Object.assign({}, g));
    n.soDongToiDa = sh.soDongToiDa;
  });
  return dich;
}

const TEN_GAU = '[GẤU IN HÌNH-TÊN THEO YÊU CẦU] Gấu bông mặc áo in hình theo yêu cầu 18CM và 30CM';
const PL_HE_SO_2 = '16cm Nâu, Không kèm túi quà , in 2 mặt áo';        // TT-09: fixture Hệ số 2 (không cấu phần)

/** Cấu phần suy từ biến thể (chương 11.3.b) — FIXTURE của test. */
function cauPhanGau(pl) {
  const p = pl.split(',').map((s) => s.trim());
  const cp = [p[0].indexOf('30cm Nâu') === 0 ? 'Teddy Nâu' : p[0].indexOf('30cm Vàng') === 0 ? 'Teddy Vàng Kem' : 'Teddy 16cm'];
  if (/in \d mặt áo/.test(p[2] || '')) cp.push('Áo Gấu');
  if (/mặt kính/.test(p[1] || '')) cp.push('Túi Kính Trắng', 'Thiệp');
  else if (/mika/.test(p[1] || '')) cp.push('túi mika', 'Thiệp');
  return cp;
}

/** Nối dòng Mapping `Gian hàng = TikTok Shop` vào sổ giả (bỏ qua `boQuaPl`). Phân loại ghi KHÔNG có khoảng trắng cuối — file thì có. */
function themMappingTikTok(ss, tc) {
  const o = tc || {};
  const sh = ss.getSheetByName('Mapping_san_pham');
  const head = {};
  for (let c = 1; c <= 14; c++) { const v = sh.giaTri['1:' + c]; if (v) head[lop.MapListing.tenCotChuan(v)] = c; }
  let r = sh.getLastRow() + 1;
  const dcn = AT.docSeThanhToan(docA().bang, { tenFile: 'A' });
  const cap = {};
  dcn.don.concat(dcn.boQua.map((b) => ({ dong: b.dong }))).forEach((d) => (d.dong || []).forEach((x) => { cap[x.tenListing + '|' + x.tenPhanLoai] = x; }));
  const ds = [];
  Object.keys(cap).forEach((k) => {
    const x = cap[k];
    if (x.tenListing !== TEN_GAU) return;                                  // Baby Tee: cố ý THIẾU Mapping (TT-12)
    if (o.boQuaPl && o.boQuaPl.indexOf(x.tenPhanLoai) >= 0) return;
    const cp = cauPhanGau(x.tenPhanLoai);
    const row = { 'Gian hàng': 'TikTok Shop', 'Tên trên Shopee': x.tenListing, 'Phân loại': x.tenPhanLoai.trim(), 'Xác nhận': 'CÓ', 'Hệ số': 1 };
    if (x.tenPhanLoai === PL_HE_SO_2) { row['Tên viết tắt'] = 'Teddy 16cm'; row['Hệ số'] = 2; }
    else if (cp.length === 1) row['Tên viết tắt'] = cp[0];
    else row['Cấu phần'] = cp.map((t) => t + ' x 1').join('; ');
    Object.keys(row).forEach((t) => { sh.giaTri[r + ':' + head[t]] = row[t]; });
    ds.push(row);
    r++;
  });
  return ds;
}

/** Sổ tháng 9 thật trên Web App giả. */
function dungSim(tc) {
  const o = tc || {};
  const sim = gl.taoGiaLap({ ngay: NGAY_GOOGLE, suaNguon: o.suaNguon });
  const ss = saoFile(MAU.so, sim.khaiThang('2026-09', TEN_SO));
  if (o.mapping !== false) themMappingTikTok(ss, o);
  if (o.vo) o.vo(ss, sim);
  return { sim, ss };
}

/** Thư mục vận hành tạm: `1_THA_FILE_XUAT/<gian>/`, `Cấu hình/CAU_HINH_VAN_HANH.json`. */
function dungVh(sim, tc) {
  const o = tc || {};
  const vh = tamMoi('vh');
  const ch = path.join(vh, 'Cấu hình');
  fs.mkdirSync(path.join(ch, 'nhật ký'), { recursive: true });
  const cfg = {
    thu_muc_tha_file: '1_THA_FILE_XUAT',
    thu_muc_gian_hang: { SP_MALL: 'Shopee mall', SP_OFFOOD: 'Offood', SP_IMPORT: 'Importmart', SP_BABYIU: 'Babyiu' },
    ten_thu_muc_da_xu_ly: 'đã xử lý',
    google_sheet: { bat: true, web_app_url: sim.url, chuoi_bi_mat: sim.biMat },
    link_thang: Object.assign({}, sim.linkThang),
    cau_hinh: {}
  };
  fs.writeFileSync(path.join(ch, 'CAU_HINH_VAN_HANH.json'), JSON.stringify(cfg, null, 2), 'utf8');
  const tha = path.join(vh, '1_THA_FILE_XUAT');
  ['Shopee mall', 'Offood', 'Importmart', 'Babyiu', 'TikTok Shop'].forEach((g) => fs.mkdirSync(path.join(tha, g), { recursive: true }));
  const dsTT = (o.tiktok || []).slice();
  if (o.coC && !dsTT.some((f) => f === FILE.C)) dsTT.push(FILE.C);   // D-87 bản sửa: MỘT file; thả kèm C chỉ để thử tool bỏ qua nó
  dsTT.forEach((f) => fs.copyFileSync(f.tu || f, path.join(tha, 'TikTok Shop', f.ten || path.basename(f.tu || f))));
  (o.shopee || []).forEach((f) => fs.copyFileSync(f, path.join(tha, 'Shopee mall', path.basename(f))));
  const cv = Object.assign(JSON.parse(JSON.stringify(cfg)), {
    __thuMuc: vh, __thaFile: tha, __ketQua: path.join(ch, 'nhật ký'), __tenDaXuLy: 'đã xử lý'
  });
  return { vh, tha, cv, ch };
}

async function chayTT(sim, vh, tc) {
  const o = tc || {};
  let ra = '';
  const Mod = o.mod || TT;
  let kq = null, e = null;
  try {
    kq = await Mod.chayTikTok({ lop: o.lop || lop, cv: vh.cv, thoiDiem: THOI_DIEM, thang: '2026-09', runId: '20260916_090000_TEST-TT',
      cauHinhGoogle: sim.cauHinhMay(), vo: o.vo, in: (s) => { ra += s + '\n'; } });
  } catch (x) { e = x; }
  return { kq, e, ra };
}

// ---- đọc sheet giả
function dongCua(ss, ma) {
  const sh = ss.getSheetByName(SHEET);
  const ds = [];
  const het = sh.getLastRow();
  for (let r = 4; r <= het; r++) if (String(sh.giaTri[r + ':3'] == null ? '' : sh.giaTri[r + ':3']) === ma) ds.push(r);
  if (!ds.length) return null;
  const r0 = ds[0];
  const g = sh.gopO.filter((x) => x.r1 === r0 && x.c1 === 3 && x.c2 === 3)[0];
  const r2 = g ? g.r2 : r0;
  const rows = [];
  for (let r = r0; r <= r2; r++) rows.push({ r, A: sh.giaTri[r + ':1'], D: sh.giaTri[r + ':4'], G: sh.giaTri[r + ':7'], vang: sh.nen[r + ':1'] });
  return { r0, r2, soLanC: ds.length, H: sh.giaTri[r0 + ':8'], I: sh.giaTri[r0 + ':9'], J: sh.giaTri[r0 + ':10'], K: sh.giaTri[r0 + ':11'],
    fmtC: sh.dinhDang[r0 + ':3'], rows, gop: sh.gopO.filter((x) => x.r1 === r0 && x.r2 === r2 && r2 > r0).map((x) => x.c1).sort((a, b) => a - b),
    note: sh.giaTri[r0 + ':17'] };
}
function ymdTheoSo(d, tz) {
  if (!(d instanceof Date)) return String(d);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function chupVung(ss, tenSheet, r1, r2) {
  const sh = ss.getSheetByName(tenSheet);
  const o = {};
  Object.keys(sh.giaTri).forEach((k) => { const r = +k.split(':')[0]; if (r >= r1 && r <= r2) o['v' + k] = sh.giaTri[k] instanceof Date ? 'D' + sh.giaTri[k].getTime() : sh.giaTri[k]; });
  Object.keys(sh.congThuc).forEach((k) => { const r = +k.split(':')[0]; if (r >= r1 && r <= r2 && sh.congThuc[k]) o['f' + k] = sh.congThuc[k]; });
  Object.keys(sh.nen || {}).forEach((k) => { const r = +k.split(':')[0]; if (r >= r1 && r <= r2 && sh.nen[k]) o['n' + k] = sh.nen[k]; });
  o.gop = sh.gopO.filter((g) => g.r1 >= r1 && g.r1 <= r2).map((g) => [g.r1, g.c1, g.r2, g.c2].join(':')).sort().join('|');
  return o;
}
function soKhac(a, b) { return [...new Set(Object.keys(a).concat(Object.keys(b)))].filter((k) => a[k] !== b[k]); }

// ====================================================================================================

(async function chay() {
  console.log('=== ĐỢT 4 PHẦN B: TIKTOK SHOP (YC-49…YC-54) — file thật 00_DAU_VAO/TIKTOK ===\n');
  for (const k of Object.keys(FILE)) if (!fs.existsSync(FILE[k])) { console.log('HỎNG  thiếu file thật: ' + FILE[k]); process.exit(1); }
  {
    const simNap = gl.taoGiaLap({});
    const ss = simNap.khaiThang('2026-09', TEN_SO);
    await napXlsxVaoGiaLap(ss, FILE.SO);
    MAU.so = ss;
    simNap.thaoGo();
  }
  const A = docA();
  const DCN = AT.docSeThanhToan(A.bang, { tenFile: path.basename(FILE.A) });
  const MA_TREN_SO = new Set();
  { const sh = MAU.so.getSheetByName(SHEET); for (let r = 4; r <= 210; r++) if (sh.giaTri[r + ':3']) MA_TREN_SO.add(String(sh.giaTri[r + ':3'])); }

  console.log('--- bộ đọc báo cáo "Sẽ thanh toán" → ĐƠN CHUẨN (YC-49) ---');

  await test('TT-01', 'đọc file A thật → 130 dòng, 129 đơn, khớp ô "Tổng số giao dịch"; <dimension> sai (A1:BX6) không làm đọc hụt', async () => {
    bang([DCN.soDongDoc, DCN.soDonDoc, Number(DCN.tongGiaoDichKhai)], [130, 129, 130], 'dòng / đơn / ô khai');
    const am1 = await doiChungAm(async () => {
      const hs = JSON.parse(JSON.stringify(AT.HO_SO.TIKTOK_SE_THANH_TOAN));
      hs.van_tay.dong_tieu_de = 1; hs.van_tay.dong_du_lieu_dau = 2;
      const k = AT.docSeThanhToan(A.bang, { tenFile: 'A' }, hs);
      return k.soDongDoc !== 130 ? ['đọc ' + k.soDongDoc + ' dòng'] : [];
    }, 'đọc từ dòng 1');
    const am2 = await doiChungAm(async () => {
      const XLSX = require('xlsx');
      const ws = XLSX.readFile(FILE.A, { raw: true }).Sheets[A.nd.tenSheet];
      const bangTho = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });   // tin <dimension> như bộ đọc Shopee
      const k = AT.docSeThanhToan(bangTho, { tenFile: 'A' });
      return k.soDongDoc !== 130 ? ['đọc ' + k.soDongDoc + ' dòng'] : [];
    }, 'tin vùng <dimension> của file (SheetJS mặc định)');
    return '130 dòng / 129 đơn, ô khai 130\n        · ' + am1 + '\n        · ' + am2;
  });

  await test('TT-02', 'đơn không ghi → 8 = 7 KHÔNG PHẢI ĐƠN BÁN (H ròng 0: 6 đơn đã hoàn tiền toàn bộ + đơn hủy Tổng phụ 0 mà phí DƯƠNG) + 1 TREO ("Đang chờ hoàn tất trả hàng/hoàn tiền")', async () => {
    const ma = (m) => DCN.boQua.filter((b) => b.ma === m).map((b) => b.maDon).sort();
    // mã đơn thật không nằm trong kho công khai: dò từ file theo đúng dấu hiệu BA đo
    const cotLyDo = A.bang[4].indexOf('Lý do chưa quyết toán');
    const MA_TREO = Array.from(new Set(A.bang.slice(5).filter((h) => h[cotLyDo] === 'Đang chờ hoàn tất trả hàng/hoàn tiền').map((h) => String(h[1])))).sort();
    const tongTho = {};
    DCN.dongTho.forEach((x) => { const t = tongTho[x.maDon] || (tongTho[x.maDon] = { H: 0, Q: 0 }); t.H += x.H; t.Q += x.Q; });
    const MA_HUY = Object.keys(tongTho).filter((m) => tongTho[m].H === 0 && tongTho[m].Q > 0);
    bang([MA_TREO.length, MA_HUY.length], [1, 1], 'file có đúng 1 đơn đang trả hàng và 1 đơn hủy hoàn phí');
    bang(ma('KHONG_PHAI_DON_BAN').length, 7, 'không phải đơn bán');
    dung(ma('KHONG_PHAI_DON_BAN').indexOf(MA_HUY[0]) >= 0, 'đơn hủy hoàn phí phải là không phải đơn bán');
    bang(ma('TREO_TRA_HANG'), MA_TREO, 'treo trả hàng');
    bang([ma('CHO_TINH_PHI').length, DCN.boQua.length, DCN.don.length, DCN.loiTuKiem.length], [0, 8, 121, 0], 'chờ phí / không ghi / ghi được / lệch tự kiểm');
    const amTreo = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', "      if (treo) return boQua('TREO_TRA_HANG',", "      if (false) return boQua('TREO_TRA_HANG',");
      const k = L.AdapterTikTok.docSeThanhToan(A.bang, { tenFile: 'A' });
      return k.don.some((d) => d.maDon === MA_TREO[0]) ? ['đơn đang trả hàng lọt vào danh sách ghi'] : [];
    }, 'bỏ luật (b) treo đơn đang trả hàng');
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', [['      if (ds.every(function (d) { return d.H === 0; })) {', '      if (false) {'], ['      if (ds.every(function (d) { return d.H - d.hoan === 0; })) {', '      if (false) {']]);
      const k = L.AdapterTikTok.docSeThanhToan(A.bang, { tenFile: 'A' });
      const b = k.boQua.filter((x) => x.maDon === MA_HUY[0])[0];
      return (!b || b.ma !== 'KHONG_PHAI_DON_BAN') ? ['đơn hủy hoàn phí → ' + (b ? b.ma + ' (' + b.chiTiet.slice(0, 70) + ')' : 'GHI') + ' — không còn gọi đúng là không phải đơn bán'] : [];
    }, 'bỏ luật Tổng phụ = 0 + H ròng = 0');
    return '7 + 1 = 8 · ' + am + '\n        · ' + amTreo;
  });

  await test('TT-03', 'mã đơn trả ra là CHUỖI đủ 18 ký tự và đúng từng ký tự như file → 129/129 (ghi được + không ghi)', async () => {
    const goc = new Set(A.bang.slice(5).map((h) => h[1]).filter(Boolean));
    const ra = DCN.don.map((d) => d.maDon).concat(DCN.boQua.map((b) => b.maDon));
    bang([ra.length, ra.filter((m) => typeof m === 'string' && m.length === 18 && goc.has(m)).length], [129, 129]);
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', "    return Utils.nfc(v == null ? '' : v).trim();\n  }\n\n  /** Bẫy 6",
        "    return String(Number(Utils.nfc(v == null ? '' : v).trim()));\n  }\n\n  /** Bẫy 6");
      const k = L.AdapterTikTok.docSeThanhToan(A.bang, { tenFile: 'A' });
      const x = k.don.map((d) => d.maDon).concat(k.boQua.map((b) => b.maDon));
      const sai = x.filter((m) => !goc.has(m));
      return sai.length ? [sai.length + ' mã lệch, vd ' + sai[0] + ' (còn ' + new Set(x).size + ' mã khác nhau)'] : [];
    }, 'ép mã đơn sang số');
    return '129/129 · ' + am;
  });

  await test('TT-04', 'ngày dòng đầu (dòng 6) → 15/09/2026, không phải tháng 3; ô A ghi lên sổ = NGÀY CHẠY (16/09, D-87 bản sửa) theo múi giờ CỦA SỔ', async () => {
    bang([DCN.dongTho[0].soDong, DCN.dongTho[0].ngay], [6, '2026-09-15']);
    const X = dungSim({});
    X.ss.setSpreadsheetTimeZone('America/Los_Angeles');                   // sổ thật từng đặt giờ Mỹ (2.7.2)
    const vh = dungVh(X.sim, { tiktok: [FILE.A] });
    const r = await chayTT(X.sim, vh);
    dung(!r.e, 'lượt chạy lỗi: ' + (r.e && r.e.message));
    const d = dongCua(X.ss, DCN.dongTho[0].maDon);
    dung(d, 'đơn dòng đầu phải đã ghi');
    bang(ymdTheoSo(d.rows[0].A, 'America/Los_Angeles'), '2026-09-16', 'ô A = ngày chạy theo múi giờ sổ');
    X.sim.thaoGo();
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', "    return m[1] + '-' + m[2] + '-' + m[3];", "    return m[1] + '-' + m[3] + '-' + m[2];");
      const k = L.AdapterTikTok.docSeThanhToan(A.bang, { tenFile: 'A' });
      return k.dongTho[0].ngay !== '2026-09-15' ? ['ngày dòng đầu ' + k.dongTho[0].ngay] : [];
    }, 'đảo ngày/tháng (bộ phân tích dd/MM)');
    return 'dòng 6 → 2026-09-15 · ô A sổ giờ Mỹ hiện 2026-09-16 (ngày chạy) · ' + am;
  });

  await test('TT-05', 'CÔNG THỨC CHỐT (ròng hoàn tiền, đổi dấu): H − I − J − K = "Số tiền quyết toán ước tính" → 130/130 dòng; lệch một đồng → DỪNG cả phần TikTok (TU_KIEM_LECH)', async () => {
    const khop = (dt) => dt.filter((x) => x.H - x.I - x.J - x.K === x.Q).length;
    bang(khop(DCN.dongTho), 130, 'số dòng khớp');
    const sai = (moc, thay) => { const L = napLoiSua('adapters/AdapterTikTok.gs', moc, thay); return L.AdapterTikTok.docSeThanhToan(A.bang, { tenFile: 'A' }); };
    const am1 = await doiChungAm(async () => {
      const k = sai("      H: n('tien_truoc_giam') + n('hoan_truoc_giam'),", "      H: n('tien_truoc_giam'),");
      const n = khop(k.dongTho);
      return n !== 130 ? ['bỏ khoản hoàn → ' + n + '/130'] : [];
    }, 'công thức 4 cột gốc (không cộng khoản hoàn)');
    const am2 = await doiChungAm(async () => {
      const k = sai("      J: -n('tong_phi') - K,", "      J: Math.abs(n('tong_phi')) - K,");
      const n = khop(k.dongTho);
      return n !== 130 ? ['trị tuyệt đối → ' + n + '/130 (dòng hoàn phí dương thành khoản phí)'] : [];
    }, 'lấy trị tuyệt đối Tổng phí');
    const am3 = await doiChungAm(async () => {
      const k = sai("      I: -(n('giam_gia_shop') + n('hoan_giam_gia_shop')),", "      I: (n('giam_gia_shop') + n('hoan_giam_gia_shop')),");
      try { AT.kiemTuKiem(k); } catch (e) { return [e.maKeodon + ': ' + e.message.slice(0, 80) + ' · ' + khop(k.dongTho) + '/130 dòng khớp']; }
      return [];
    }, 'quên đổi dấu giảm giá người bán → phải DỪNG');
    return '130/130 · ' + am1 + '\n        · ' + am2 + '\n        · ' + am3;
  });

  await test('TT-16', 'file đổi thứ tự cột (đảo ngược 76 cột từ dòng 5) → ĐƠN CHUẨN y hệt nhờ tra theo tiêu đề', async () => {
    const dao = A.bang.map((h, i) => (i >= 4 ? h.slice().reverse() : h));
    const x = AT.docSeThanhToan(dao, { tenFile: path.basename(FILE.A) });
    const bo = (k) => JSON.stringify({ don: k.don.map((d) => Object.assign({}, d, { viTriFile: 0 })), boQua: k.boQua.map((b) => [b.maDon, b.ma]) });
    bang(bo(x), bo(DCN), 'ĐƠN CHUẨN');
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', '    Object.keys(hs.cot).forEach(function (k) { ci[k] = cm[tenCot(hs.cot[k])]; });',
        '    Object.keys(hs.cot).forEach(function (k) { ci[k] = TIEU_DE_A_15_9.indexOf(hs.cot[k]); });');
      let y;
      try { y = L.AdapterTikTok.docSeThanhToan(dao, { tenFile: path.basename(FILE.A) }); } catch (e) { return ['ném: ' + e.message.slice(0, 80)]; }
      return bo(y) !== bo(DCN) ? ['ĐƠN CHUẨN lệch khi đọc theo vị trí'] : [];
    }, 'đọc theo VỊ TRÍ cột đo 15/9');
    return x.don.length + ' đơn y hệt · ' + am;
  });

  console.log('\n--- nhận diện sàn + chặn thả nhầm (YC-50) ---');

  await test('TT-50a', 'nhận diện bằng tên sheet + tập cột: A → Sẽ thanh toán (76 cột), B → Đã quyết toán (67), C → Order Export, file Shopee → SHOPEE, sổ tháng → KHONG_RO', async () => {
    const nd = (f) => { const w = TT.moWorkbook(f); return AT.nhanDien(w.tenSheet, w.bang); };
    const ra = [FILE.A, FILE.B, FILE.C, FILE.SHOPEE, FILE.SO].map((f) => nd(f).loai);
    bang(ra, ['TIKTOK_SE_THANH_TOAN', 'TIKTOK_DA_QUYET_TOAN', 'TIKTOK_ORDER_EXPORT', 'SHOPEE', 'KHONG_RO']);
    bang([nd(FILE.A).soCot, nd(FILE.B).soCot, nd(FILE.A).canhBao.length], [76, 67, 0]);
    return ra.join(' · ');
  });

  await test('TT-50b', 'thiếu cột bắt buộc → CHẶN, in đúng tên cột thiếu bằng tiếng Việt; thừa cột lạ → một dòng nhắc, vẫn đọc đủ 129 đơn', async () => {
    const thieu = A.bang.map((h, i) => (i === 4 ? h.map((t) => (t === 'Tổng phí' ? 'Tong phi (moi)' : t === 'Tên SKU' ? 'SKU name' : t)) : h));
    const nd = AT.nhanDien([A.nd.tenSheet], () => thieu);
    bang(nd.thieuCot, ['Tên SKU', 'Tổng phí'], 'cột thiếu');
    let e = null;
    try { AT.docSeThanhToan(thieu, { tenFile: 'x.xlsx' }); } catch (x) { e = x; }
    dung(e && e.maKeodon === 'THIEU_COT' && /THIẾU 2 cột bắt buộc: "Tên SKU", "Tổng phí"/.test(e.message) && /Tool chưa ghi gì/.test(e.message), 'câu chặn: ' + (e && e.message));
    const thua = A.bang.map((h, i) => (i === 4 ? h.concat(['Cột mới TikTok']) : i > 4 ? h.concat(['x']) : h));
    const nd2 = AT.nhanDien([A.nd.tenSheet], () => thua);
    dung(nd2.thieuCot.length === 0 && nd2.canhBao.length === 1 && /"Cột mới TikTok"/.test(nd2.canhBao[0]) && /VẪN ĐỌC/.test(nd2.canhBao[0]), 'nhắc cột lạ: ' + nd2.canhBao);
    bang(AT.docSeThanhToan(thua, { tenFile: 'x' }).soDonDoc, 129, 'thừa cột vẫn đọc');
    return '"' + e.message.slice(0, 110) + '…" · cột lạ: "' + nd2.canhBao[0].slice(0, 80) + '…"';
  });

  await test('TT-50c', 'thả nhầm SÀN → TỪ CHỐI cả lượt, chưa gửi gói nào, file nằm nguyên: (1) file Shopee trong thư mục TikTok Shop (2) báo cáo TikTok trong thư mục Shopee mall (3) file lạ trong thư mục TikTok', async () => {
    const cfg = lop.Config.tao();
    const cham = async (Mod, tc) => {
      const X = dungSim({ mapping: false });
      const vh = dungVh(X.sim, tc);
      const truoc = JSON.stringify([fs.readdirSync(path.join(vh.tha, 'TikTok Shop')), fs.readdirSync(path.join(vh.tha, 'Shopee mall'))]);
      let e = null;
      try { Mod.soatThaNhamSan({ lop, cv: vh.cv, cfg, thuMucShopee: (g) => path.join(vh.tha, vh.cv.thu_muc_gian_hang[g]) }); } catch (x) { e = x; }
      const sau = JSON.stringify([fs.readdirSync(path.join(vh.tha, 'TikTok Shop')), fs.readdirSync(path.join(vh.tha, 'Shopee mall'))]);
      X.sim.thaoGo();
      return { e, yNguyen: truoc === sau, goi: X.sim.nhatKyGoi.length };
    };
    const ca = [
      ['Shopee trong TikTok', { tiktok: [FILE.SHOPEE] }, /FILE XUẤT SHOPEE/],
      ['TikTok trong Shopee mall', { shopee: [FILE.A] }, /BÁO CÁO TIKTOK nhưng đang nằm trong thư mục gian Shopee "Shopee mall"/],
      ['sổ tháng trong TikTok', { tiktok: [FILE.SO] }, /không phải báo cáo TikTok tool biết/]
    ];
    const loi = [];
    for (const [ten, tc, rx] of ca) {
      const r = await cham(TT, tc);
      if (!(r.e && r.e.maKeodon === 'THA_NHAM_SAN' && rx.test(r.e.message) && /Tool chưa ghi gì và chưa chuyển file nào/.test(r.e.message))) loi.push(ten + ': ' + (r.e ? r.e.message.slice(0, 120) : 'không chặn'));
      if (!r.yNguyen || r.goi) loi.push(ten + ': file bị chuyển hoặc đã gọi mạng');
    }
    const ok = await cham(TT, { tiktok: [FILE.A, FILE.B, FILE.C], shopee: [FILE.SHOPEE] });
    if (ok.e) loi.push('đúng chỗ mà bị chặn: ' + ok.e.message);
    bang(loi, [], 'bảng ca');
    const am = await doiChungAm(async () => {
      const Sai = napNodeSua('chay-tiktok.js', [["  if (!viPham.length) return;\n  const e = new Error('THẢ NHẦM SÀN", "  if (true) return;\n  const e = new Error('THẢ NHẦM SÀN"]]);
      const r = await cham(Sai, { tiktok: [FILE.SHOPEE] });
      return !r.e ? ['file Shopee trong thư mục TikTok chạy lọt'] : [];
    }, 'bỏ phép so vân tay với thư mục');
    return '3 ca chặn, 0 gói, file y nguyên · đúng chỗ không chặn · ' + am;
  });

  console.log('\n--- ghi lên sheet "TikTok Shop" trên Web App giả, sổ tháng 9 THẬT (YC-51, YC-52, YC-53) ---');

  // Lượt đầu với Mapping fixture đầy đủ (trừ Baby Tee) — dùng cho TT-06…TT-12, TT-15.
  const L1 = dungSim({});
  const truocTT = chupVung(L1.ss, SHEET, 1, 208);
  const truocMap = L1.ss.getSheetByName('Mapping_san_pham').getLastRow();
  const vh1 = dungVh(L1.sim, { tiktok: [FILE.A] });
  L1.sim.demLai();
  const R1 = await chayTT(L1.sim, vh1);
  const DON_MOI = DCN.don.filter((d) => !MA_TREN_SO.has(d.maDon));

  await test('TT-11', 'file có đơn cũ lẫn đơn mới → CHỈ ghi đơn mới: sheet đang có 71 mã → lần đầu ghi 50, bỏ qua 71, không ghi 8 (7 không phải đơn bán + 1 treo); báo cáo chuyển vào "đã xử lý" sau khi ghi', async () => {
    dung(!R1.e, 'lượt chạy lỗi: ' + (R1.e && R1.e.message) + '\n' + R1.ra.slice(-600));
    bang([MA_TREN_SO.size, R1.kq.thongKe.donGhi, R1.kq.thongKe.donDaCo, R1.kq.thongKe.donBoQua], [71, 50, 71, 8], 'trên sổ / ghi / bỏ qua / không ghi');
    bang(DON_MOI.length, 50, 'đơn mới theo ĐƠN CHUẨN');
    bang(DON_MOI.filter((d) => !dongCua(L1.ss, d.maDon)).length, 0, 'đơn mới chưa thấy trên sổ');
    bang(DCN.boQua.filter((b) => dongCua(L1.ss, b.maDon)).length, 0, 'đơn không ghi mà lại có trên sổ');
    bang([fs.readdirSync(path.join(vh1.tha, 'TikTok Shop')).filter((f) => /\.xlsx$/.test(f)).length, fs.readdirSync(path.join(vh1.tha, 'TikTok Shop', 'đã xử lý')).length], [0, 1], 'file sau khi ghi');
    dung(/GHI THÊM 50 đơn/.test(R1.ra) && /bỏ qua 71 đơn đã có/.test(R1.ra) && /7 đơn KHÔNG PHẢI ĐƠN BÁN/.test(R1.ra) && /1 đơn TREO/.test(R1.ra), 'màn hình thiếu số: ' + R1.ra.slice(-800));
    const goi = L1.sim.nhatKyGoi.map((g) => g.hanhDong);
    bang(goi, ['doc', 'ghi'], 'các gói gửi đi (đường ghi, KHÔNG xuLy)');
    // YC-53 nhật ký riêng của TikTok + INV-7: màn hình và nhật ký không lọt link Web App, link/ID file tháng, chuỗi bí mật.
    dung(R1.kq.fileLog && /_TIKTOK\.txt$/.test(R1.kq.fileLog) && fs.existsSync(R1.kq.fileLog), 'thiếu nhật ký LOG_*_TIKTOK.txt');
    const nk = fs.readFileSync(R1.kq.fileLog, 'utf8');
    dung(/GHI THÊM 50 đơn/.test(nk) &&/^RUN \d{8}_\d{6}_TEST-TT \| bản dựng [0-9a-f]+ \| file .+ \| gian TikTok Shop \| đơn vào 129 \| ghi 50 \| bỏ qua 71 /m.test(nk), 'nhật ký thiếu số / dòng RUN: ' + nk.slice(-400));
    const lot = [L1.sim.url, L1.sim.biMat, L1.sim.idCua('2026-09')].filter((x) => (R1.ra + nk).indexOf(x) >= 0)
      .concat(/docs\.google\.com\/spreadsheets/.test(R1.ra + nk) ? ['link file tháng'] : []);
    bang(lot, [], 'INV-7 màn hình + nhật ký');
    return 'ghi 50 · bỏ qua 71 · không ghi 8 · gói ' + goi.join('→') + ' · nhật ký LOG_*_TIKTOK.txt có dòng RUN, 0 link/ID/bí mật';
  });

  await test('TT-06', 'đơn 1 SKU, Mapping 1 tên viết tắt, không cấu phần → 1 dòng, D = tên viết tắt, G = SL, H/I/J/K = báo cáo, không gộp ô', async () => {
    const d = DON_MOI.filter((x) => x.dong.length === 1 && cauPhanGau(x.dong[0].tenPhanLoai).length === 1 && x.dong[0].tenPhanLoai !== PL_HE_SO_2 && x.dong[0].tenListing === TEN_GAU)[0];
    dung(d, 'file thật không còn đơn mới dạng này');
    const s = dongCua(L1.ss, d.maDon);
    bang([s.rows.length, s.rows[0].D, s.rows[0].G, s.H, s.I, s.J, s.K, s.gop], [1, 'Teddy Nâu', d.dong[0].soLuong, d.tien.H, d.tien.I, d.tien.J, d.tien.K, []]);
    return 'đơn ' + d.maDon + ' → 1 dòng Teddy Nâu, H/I/J/K = ' + [s.H, s.I, s.J, s.K].join('/');
  });

  await test('TT-08', 'combo 4 cấu phần (30cm Nâu · Túi kính+thiệp · in 2 mặt) → 4 dòng kho D = Teddy Nâu/Áo Gấu/Túi Kính Trắng/Thiệp, C H I J K L gộp CẢ CỤM, tiền ghi MỘT lần, L = quyết toán', async () => {
    const d = DON_MOI.filter((x) => x.dong.length === 1 && cauPhanGau(x.dong[0].tenPhanLoai).length === 4)[0];
    dung(d, 'file thật không còn đơn mới combo 4');
    const s = dongCua(L1.ss, d.maDon);
    bang([s.rows.length, s.rows.map((x) => x.D), s.rows.map((x) => x.G), s.gop], [4, ['Teddy Nâu', 'Áo Gấu', 'Túi Kính Trắng', 'Thiệp'], [1, 1, 1, 1], [3, 8, 9, 10, 11, 12]]);
    bang(s.H - s.I - s.J - s.K, d.quyetToan, 'L = H − I − J − K');
    const sh = L1.ss.getSheetByName(SHEET);
    bang([2, 3].map((i) => sh.giaTri[(s.r0 + i) + ':8'] || ''), ['', ''], 'H chỉ ở ô trên cùng của cụm');
    const am = await doiChungAm(async () => {
      const X = dungSim({ suaNguon: suaGs('    cotGop.forEach(function (c) { sh.getRange(g.r1, c, g.r2 - g.r1 + 1, 1).mergeVertically(); });', '') });
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }));
      const y = dongCua(X.ss, d.maDon);
      X.sim.thaoGo();
      return r.e ? ['lỗi ' + r.e.message] : (y && JSON.stringify(y.gop) !== '[3,8,9,10,11,12]' ? ['cụm ' + y.r0 + '–' + y.r2 + ' gộp ' + JSON.stringify(y.gop)] : []);
    }, 'không gộp ô');
    return 'đơn ' + d.maDon + ' dòng ' + s.r0 + '–' + s.r2 + ' · L ' + (s.H - s.I - s.J - s.K) + ' = ' + d.quyetToan + ' · ' + am;
  });

  await test('TT-09', 'Hệ số = 2 (fixture "16cm Nâu, Không kèm túi quà , in 2 mặt áo" → Teddy 16cm) → G = Số lượng × 2', async () => {
    const d = DON_MOI.filter((x) => x.dong.length === 1 && x.dong[0].tenPhanLoai === PL_HE_SO_2)[0];
    dung(d, 'file thật không còn đơn mới với biến thể Hệ số 2');
    const s = dongCua(L1.ss, d.maDon);
    bang([s.rows.length, s.rows[0].D, s.rows[0].G], [1, 'Teddy 16cm', d.dong[0].soLuong * 2]);
    return 'SL ' + d.dong[0].soLuong + ' × 2 = ' + s.rows[0].G;
  });

  await test('TT-07', 'đơn NHIỀU SKU (đơn 2 dòng đầu tiên của file, đổi mã thành đơn mới) → mỗi SKU nổ cấu phần, tiền ghi MỘT LẦN = tổng các dòng (phí phân bổ theo dòng), cụm C H I J K L gộp', async () => {
    const ma = DCN.don.filter((d) => d.dong.length === 2)[0].maDon, maMoi = ma.slice(0, 15) + '999';
    const bangMoi = A.bang.map((h, i) => (i >= 5 && h[1] === ma ? h.map((v, j) => (j === 1 || j === 7 || j === 63 ? maMoi : v)) : h));
    const tam = tamMoi('multi');
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(bangMoi), A.nd.tenSheet);
    const tep = path.join(tam, 'Onhold-unsettled-orders-multi.xlsx');
    XLSX.writeFile(wb, tep);
    const goc = DCN.don.filter((x) => x.maDon === ma)[0];
    const X = dungSim({});
    const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [tep] }));
    dung(!r.e, 'lỗi: ' + (r.e && r.e.message));
    const s = dongCua(X.ss, maMoi);
    const soDongKho = goc.dong.reduce((t, x) => t + cauPhanGau(x.tenPhanLoai).length, 0);
    bang([s.rows.length, s.gop, s.H, s.I, s.J, s.K, s.soLanC], [soDongKho, [3, 8, 9, 10, 11, 12], goc.dong[0].H + goc.dong[1].H, goc.tien.I, goc.tien.J, goc.tien.K, 1]);
    bang(s.H - s.I - s.J - s.K, goc.quyetToan, 'L = tổng quyết toán các dòng của đơn');
    X.sim.thaoGo();
    return goc.dong.length + ' SKU → ' + soDongKho + ' dòng, gộp C/H/I/J/K/L, L = tổng quyết toán ' + goc.dong.length + ' dòng của đơn';
  });

  await test('TT-15', '166 dòng nhập tay cũ (dòng 4–208 sheet TikTok Shop) KHÔNG ĐỔI MỘT Ô: giá trị, công thức, nền, vùng gộp; dòng 3 y nguyên (INV-8); ngoài vùng đó chỉ có hai ô của tool: dấu thời gian dòng 1 và tiêu đề "Note" dòng 2', async () => {
    const sau = chupVung(L1.ss, SHEET, 1, 208);
    const k = soKhac(truocTT, sau);
    // P1/P2 của sổ thật đã có chữ của chủ shop → dấu thời gian và cột Note của tool tự lùi sang Q (luật có sẵn từ 2.6).
    const cuaTool = k.filter((x) => (x === 'v1:17' && /^Tool cập nhật lúc /.test(sau[x])) || x === 'n1:17' || (x === 'v2:17' && sau[x] === 'Note'));
    bang(k.filter((x) => cuaTool.indexOf(x) < 0), [], 'ô đổi trong dòng 1–208 (ngoài ô của tool)');
    bang(cuaTool.sort(), ['n1:17', 'v1:17', 'v2:17'], 'ô của tool');
    return Object.keys(truocTT).length + ' ô/công thức/vùng gộp so từng cái, 0 đổi · ô tool: Q1 dấu thời gian, Q2 "Note"';
  });

  // Từ đây mỗi ca dựng Web App giả riêng (giả lập chỉ giữ MỘT Web App đăng ký một lúc).
  L1.sim.thaoGo();

  await test('TT-12', 'thiếu Mapping một biến thể có đơn mới → KHÔNG ĐOÁN: dòng vàng, D trống, báo đúng Tên sản phẩm + Tên SKU (đã cắt khoảng trắng cuối); Mapping nối dòng vàng Gian hàng = TikTok Shop kèm ID SKU ở Ghi chú; các đơn khác vẫn ghi đủ 50', async () => {
    const ungVien = DON_MOI.filter((x) => x.dong.length === 1 && x.dong[0].tenListing === TEN_GAU && cauPhanGau(x.dong[0].tenPhanLoai).length === 2);
    dung(ungVien.length, 'file thật không còn đơn mới dạng Teddy + Áo');
    const PL = ungVien[0].dong[0].tenPhanLoai;
    const cham = async (L) => {
      const X = dungSim({ boQuaPl: [PL] });
      const truocMapX = X.ss.getSheetByName('Mapping_san_pham').getLastRow();
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }), { lop: L });
      X.sim.thaoGo();
      const loi = [];
      if (r.e) return ['lỗi ' + r.e.message];
      const t = r.kq.thieuMapping.filter((x) => x.tenSku === PL)[0];
      if (!t || t.tenSanPham !== TEN_GAU || t.lyDo !== 'TEN_MOI' || t.soDon !== DON_MOI.filter((x) => x.dong[0].tenPhanLoai === PL).length) loi.push('báo thiếu: ' + JSON.stringify(r.kq.thieuMapping));
      if (r.ra.indexOf(TEN_GAU + ' / ' + PL + ' — ') < 0) loi.push('màn hình không liệt kê đúng cặp thiếu');
      ungVien.filter((x) => x.dong[0].tenPhanLoai === PL).forEach((d) => {
        const s = dongCua(X.ss, d.maDon);
        if (!s || s.rows.length !== 1 || (s.rows[0].D || '') !== '' || s.rows[0].vang !== '#FFF2CC' || s.H !== d.tien.H || !/tên hàng mới/.test(String(s.note || ''))) loi.push('đơn ' + d.maDon + ': ' + JSON.stringify(s && Object.assign({}, s.rows[0], { note: s.note })));
      });
      if (r.kq.thongKe.donGhi !== 50) loi.push('ghi ' + r.kq.thongKe.donGhi + ' đơn');
      // Lõi nối MỌI tên hàng chưa có khóa trong file — kể cả tên của đơn đã nằm trên sổ (Baby Tee, đơn nhập tay) — y như gian Shopee.
      const mp = X.ss.getSheetByName('Mapping_san_pham');
      const sau = mp.getLastRow();
      const moi = [];
      for (let rr = truocMapX + 1; rr <= sau; rr++) moi.push([1, 2, 3, 11, 12].map((c) => mp.giaTri[rr + ':' + c]));
      const moiPl = moi.map((x) => x[2]).sort();
      if (JSON.stringify(moiPl) !== JSON.stringify(['Baby Tee - Trắng, L, Không hộp', PL].sort())) loi.push('Mapping nối: ' + JSON.stringify(moiPl));
      moi.forEach((x) => {
        if (x[0] !== 'TikTok Shop' || !/ID SKU TikTok: \d{19}/.test(x[4]) || !/gặp ngày 16\/09\/2026 \(file /.test(x[4]) || x[3] !== '2026-09-16') loi.push('dòng Mapping mới: ' + JSON.stringify(x));
      });
      return { loi, n: r.kq.thieuMapping.length };
    };
    const kq = await cham(lop);
    bang(kq.loi, [], 'thiếu Mapping');
    const am = await doiChungAm(async () => {
      // Khuyết tật: tên mới thì ĐOÁN tên viết tắt bằng gợi ý gần nhất.
      // Tên mới đã được nối vào Mapping TRƯỚC khi tra (dòng chưa CÓ) → đi nhánh `!mr.__muc`; khuyết tật cắm đúng ở đó.
      const L = napLoiSua('Normalize.gs', "    if (!mr.__muc) {\n      var ma = mr.__lyDo || 'CHUA_DIEN';",
        "    if (!mr.__muc) {\n      var gy0 = MapListing.goiY(map, d.maGianHang, d.tenListing, d.tenPhanLoai);\n" +
        "      if (gy0.length) return [Object.assign({}, chung, { tenVietTat: gy0[0], maHang: '', soLuong: sl, lyDo: null, ghiChu: '' })];\n" +
        "      var ma = mr.__lyDo || 'CHUA_DIEN';");
      ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = L[t]; });
      try { const y = await cham(L); return Array.isArray(y) ? y : y.loi; } finally { ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; }); }
    }, 'đoán tên viết tắt bằng gợi ý khi thiếu Mapping');
    return '"' + PL + '" thiếu → ' + ungVien.filter((x) => x.dong[0].tenPhanLoai === PL).length + ' đơn vàng, D trống · Mapping +2 dòng (biến thể thiếu + Baby Tee của đơn đã có; Ghi chú có ngày + ID SKU) · 50 đơn vẫn ghi\n        · ' + am;
  });

  await test('TT-10', 'thả LẠI CÙNG FILE → ghi 0, bỏ qua 121 = 71 + 50 của lần một, không gửi lệnh ghi, không thêm dòng', async () => {
    const X = dungSim({});
    const lan1 = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }));
    dung(!lan1.e && lan1.kq.thongKe.donGhi === 50, 'lần một: ' + (lan1.e ? lan1.e.message : lan1.kq.thongKe.donGhi));
    const het = X.ss.getSheetByName(SHEET).getLastRow();
    X.sim.demLai();
    const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }));
    dung(!r.e, 'lỗi: ' + (r.e && r.e.message));
    bang([r.kq.thongKe.donGhi, r.kq.thongKe.donDaCo, X.ss.getSheetByName(SHEET).getLastRow(), X.sim.nhatKyGoi.map((g) => g.hanhDong)], [0, 121, het, ['doc']]);
    X.sim.thaoGo();
    const am = await doiChungAm(async () => {
      const BO_T1 = suaGs('    if (ss.maDon && ss.maDon[String(don.maDon)] != null) { thongKe.donDaCo++; return; }', '');
      const BO_T2 = suaGs('    if (daCo[ma] != null) {\n      tk.donDaCo++;', '    if (false) {\n      tk.donDaCo++;');
      const Y = dungSim({ suaNguon: (src) => BO_T2(BO_T1(src)) });
      const voSai = napVoSua(BO_T1);
      await chayTT(Y.sim, dungVh(Y.sim, { tiktok: [FILE.A] }), { vo: voSai });
      const het2 = Y.ss.getSheetByName(SHEET).getLastRow();
      const y = await chayTT(Y.sim, dungVh(Y.sim, { tiktok: [FILE.A] }), { vo: voSai });
      Y.sim.thaoGo();
      return (y.e || y.kq.thongKe.donGhi !== 0 || Y.ss.getSheetByName(SHEET).getLastRow() !== het2) ? ['lượt hai: ' + (y.e ? y.e.message.slice(0, 60) : 'ghi ' + y.kq.thongKe.donGhi)] : [];
    }, 'bỏ khử trùng hai tầng (máy + Google)');
    return 'ghi 0 · bỏ qua 121 · chỉ một gói doc · ' + am;
  });

  await test('TT-13', 'thiếu công thức ở cột đích (xóa hết công thức cột M "Mã hàng" của TikTok Shop) → DỪNG TRƯỚC KHI GHI (YC-39): THIEU_CONG_THUC, 0 lệnh ghi, báo cáo nằm nguyên', async () => {
    const xoaM = (ss) => { const sh = ss.getSheetByName(SHEET); Object.keys(sh.congThuc).forEach((k) => { const [r, c] = k.split(':').map(Number); if (c === 13 && r >= 4) delete sh.congThuc[k]; }); };
    const X = dungSim({ vo: xoaM });
    const vh = dungVh(X.sim, { tiktok: [FILE.A] });
    X.sim.demLai();
    const r = await chayTT(X.sim, vh);
    dung(r.e && /THIEU_CONG_THUC|KHÔNG CÒN CÔNG THỨC/.test(r.e.message + (r.e.maKeodon || '')), 'phải dừng thiếu công thức: ' + (r.e ? r.e.message : 'không lỗi'));
    const ghi = X.sim.nhatKyGhi.filter((g) => g.kieu !== 'doc');
    bang([ghi.length, fs.readdirSync(path.join(vh.tha, 'TikTok Shop')).filter((f) => /\.xlsx$/.test(f)).length], [0, 1], 'lệnh ghi / file còn lại (báo cáo)');
    X.sim.thaoGo();
    return '"' + r.e.message.slice(0, 110) + '…" · 0 lệnh ghi · file nằm nguyên';
  });

  await test('TT-50d', 'sổ tháng khuôn TikTok Shop 17 cột (DEMO 13/9) → Google dừng SAI_HOP_DONG trước khi ghi (hợp đồng sổ tháng YC-38.1 với gian TT_SHOP); gói Shopee KHÔNG mang khóa TT_SHOP', async () => {
    const khuonCu = (ss) => { const sh = ss.getSheetByName(SHEET); sh.giaTri['2:13'] = 'Ảnh'; sh.giaTri['2:14'] = 'Ghi Chú'; };
    const X = dungSim({ vo: khuonCu });
    const vh = dungVh(X.sim, { tiktok: [FILE.A] });
    X.sim.demLai();
    const r = await chayTT(X.sim, vh);
    dung(r.e && /SỔ THÁNG KHÔNG ĐÚNG KHUÔN/.test(r.e.message) && /TikTok Shop/.test(r.e.message), 'phải SAI_HOP_DONG: ' + (r.e ? r.e.message.slice(0, 200) : 'không lỗi'));
    bang(X.sim.nhatKyGhi.filter((g) => g.kieu !== 'doc').length, 0, 'lệnh ghi');
    X.sim.thaoGo();
    return '"' + r.e.message.slice(0, 120) + '…"';
  });

  console.log('\n--- báo cáo "Đã quyết toán" và Order Export (YC-54 — đợt này chỉ nhận diện, không ghi) ---');

  await test('TT-17', 'thả file B (Đã quyết toán) và C (Order Export) → nhận diện, nói rõ INV-1b hoãn Đợt 5, KHÔNG gửi lệnh ghi nào, KHÔNG đổi ô nào, KHÔNG tạo dòng; file nằm nguyên. Bộ đọc B: 311 dòng đơn hàng / 300 đơn, bỏ 36 dòng quảng cáo, công thức ròng hoàn tiền khớp 300/300', async () => {
    const wb = TT.moWorkbook(FILE.B);
    const b = AT.docDaQuyetToan(wb.bang('Chi tiết đơn hàng'), { tenFile: 'B' });
    bang([b.soDongDonHang, b.don.length, b.soDongKhac, b.don.filter((x) => x.khopTuKiem).length], [311, 300, 36, 300], 'bộ đọc B');
    dung(AT.HO_SO.TIKTOK_DA_QUYET_TOAN.cap_nhat_tien_inv1b === false && AT.HO_SO.TIKTOK_DA_QUYET_TOAN.tao_dong_moi === false, 'công tắc INV-1b phải TẮT, tạo dòng phải false');
    const cham = async (Mod) => {
      const X = dungSim({});
      const vh = dungVh(X.sim, { tiktok: [FILE.B, FILE.C] });
      const truoc = X.sim.anhChup('2026-09');
      X.sim.demLai();
      const r = await chayTT(X.sim, vh, { mod: Mod });
      const loi = [];
      if (r.e) loi.push('ném lỗi: ' + r.e.message.slice(0, 100));
      else {
        if (r.kq.ma !== 2 || r.kq.coViec) loi.push('mã ' + r.kq.ma);
        if (X.sim.nhatKyGoi.length) loi.push('gửi gói ' + X.sim.nhatKyGoi.map((g) => g.hanhDong));
        if (X.sim.soAnh(truoc, X.sim.anhChup('2026-09')).length) loi.push('sổ đổi ô');
        if (!/CHƯA dùng báo cáo "Đã quyết toán" để cập nhật tiền \(INV-1b hoãn Đợt 5\)/.test(r.ra) || !/bản này KHÔNG dùng file này \(cột Ngày là ngày chạy tool/.test(r.ra) ||
          !/khớp sheet "Báo cáo": Tổng số tiền quyết toán = \d+ · Tổng phụ trước giảm giá = \d+/.test(r.ra)) loi.push('thiếu câu nhận diện: ' + r.ra.slice(0, 400));
      }
      if (fs.readdirSync(path.join(vh.tha, 'TikTok Shop')).filter((f) => /\.xlsx$/.test(f)).length !== 2) loi.push('file bị chuyển');
      X.sim.thaoGo();
      return loi;
    };
    bang(await cham(TT), [], 'thả B + C');
    const am = await doiChungAm(async () => {
      const Sai = napNodeSua('chay-tiktok.js', [["    } else if (nd.loai === 'TIKTOK_DA_QUYET_TOAN') {\n",
        "    } else if (nd.loai === 'TIKTOK_DA_QUYET_TOAN') {\n      dsA.push({ f, tep, nd, dcn: AT.docSeThanhToan(wb.bang(nd.tenSheet), { tenFile: f }, Object.assign({}, nd.hoSo, { van_tay: Object.assign({}, nd.hoSo.van_tay, { cot_bat_buoc: [] }), cot: AT.HO_SO.TIKTOK_SE_THANH_TOAN.cot })), tai: null });\n"]]);
      return await cham(Sai);
    }, 'tạo dòng mới từ nguồn B');
    return 'B: 311/300/36, ròng 300/300 · B + C: 0 gói, 0 ô đổi, file nằm nguyên · ' + am;
  });

  console.log('\n--- D-87 bản sửa (16/9): MỘT file, cột A = ngày chạy tool như Shopee (YC-57 hủy); đối chiếu tổng ba loại file ---');

  await test('TT-56a', 'cột A của MỌI đơn mới = NGÀY CHẠY tool (ngayGhi sẵn có, như Shopee), không tô vàng vì ngày, không Note ngày', async () => {
    const cham = async (L) => {
      const X = dungSim({});
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }), { lop: L });
      X.sim.thaoGo();
      if (r.e) return { loi: ['lỗi ' + r.e.message] };
      const loi = [];
      let dung_ = 0;
      DON_MOI.forEach((d) => {
        const s = dongCua(X.ss, d.maDon);
        if (!s) { loi.push(d.maDon + ' chưa ghi'); return; }
        const ngayA = ymdTheoSo(s.rows[0].A, X.ss.getSpreadsheetTimeZone());
        if (ngayA !== '2026-09-16') loi.push(d.maDon + ': A ' + ngayA + ' ≠ ngày chạy 2026-09-16');
        else dung_++;
        if (/ngày sắp xếp vận chuyển|CHƯA CÓ TRONG FILE ĐƠN HÀNG/.test(String(s.note || ''))) loi.push(d.maDon + ': Note ngày ' + s.note);
      });
      return { loi, dung: dung_ };
    };
    const k = await cham(lop);
    bang(k.loi.slice(0, 3), [], 'cột A');
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', "      ngay_ghi: 'NGAY_CHAY',", "      ngay_ghi: 'NGAY_TAO_DON',");
      ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = L[t]; });
      try { return (await cham(L)).loi; } finally { ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; }); }
    }, 'cột A lấy ngày tạo đơn trong báo cáo');
    return k.dung + ' đơn mới cột A = 2026-09-16 (ngày chạy) · ' + am;
  });

  await test('TT-56b', 'MỘT file "Sẽ thanh toán" là đủ: ghi 50 đơn; file "Tất cả đơn hàng" thả kèm → nhắc "không dùng", không đọc, không chuyển', async () => {
    const cham = async (L, tc) => {
      const X = dungSim({});
      const vh = dungVh(X.sim, Object.assign({ tiktok: [FILE.A] }, tc || {}));
      const r = await chayTT(X.sim, vh, { lop: L });
      X.sim.thaoGo();
      const loi = [];
      if (r.e) return ['lỗi ' + r.e.message.slice(0, 100)];
      if (!/GHI THÊM 50 đơn/.test(r.ra)) loi.push('không ghi 50: ' + (r.ra.match(/GHI THÊM \d+ đơn/) || ['?'])[0]);
      const conLai = fs.readdirSync(path.join(vh.tha, 'TikTok Shop')).filter((f) => /\.xlsx$/.test(f));
      if (tc && tc.coC && (conLai.length !== 1 || !/^Tất cả đơn hàng/.test(conLai[0]) || !/bản này KHÔNG dùng file này/.test(r.ra))) loi.push('file C: còn ' + conLai.join(', '));
      return loi;
    };
    bang(await cham(lop), [], 'một file');
    bang(await cham(lop, { coC: true }), [], 'thả kèm C');
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', "      ngay_ghi: 'NGAY_CHAY',", "      ngay_ghi: 'RTS_ORDER_EXPORT',");
      ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = L[t]; });
      try { return await cham(L); } finally { ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; }); }
    }, 'đòi thêm file Tất cả đơn hàng (YC-57 cũ)');
    return 'một file → ghi 50 · C thả kèm nằm nguyên, nhắc không dùng · ' + am;
  });

  await test('TT-01b', 'P-1 mở rộng cho CẢ BA loại file: B đối chiếu sheet "Báo cáo" (ô Tổng số tiền quyết toán, ô Tổng phụ trước giảm giá) — lệch là DOC_HUT; C số dòng đọc được không ít hơn vùng khai — ít hơn là DOC_HUT', async () => {
    const wB = TT.moWorkbook(FILE.B);
    const b = AT.docDaQuyetToan(wB.bang('Chi tiết đơn hàng'), { tenFile: 'B' }, null, wB.bang('Báo cáo'));
    bang(b.doiChieu.map((x) => [x.nhan, x.khai === x.cong, x.khai > 0]), [['Tổng số tiền quyết toán', true, true], ['Tổng phụ trước giảm giá', true, true]], 'đối chiếu B');
    const khaiQ = String(b.doiChieu[0].khai);
    const baoCaoSai = wB.bang('Báo cáo').map((h) => h.map((v) => (v === khaiQ ? String(Number(khaiQ) + 1) : v)));
    let eB = null;
    try { AT.docDaQuyetToan(wB.bang('Chi tiết đơn hàng'), { tenFile: 'B' }, null, baoCaoSai); } catch (x) { eB = x; }
    dung(eB && eB.maKeodon === 'DOC_HUT', 'B lệch tổng phải DOC_HUT');
    const hutB = wB.bang('Chi tiết đơn hàng').slice(0, 3);          // như SheetJS tin vùng khai A1:BO3
    let eB2 = null;
    try { AT.docDaQuyetToan(hutB, { tenFile: 'B' }, null, wB.bang('Báo cáo')); } catch (x) { eB2 = x; }
    dung(eB2 && eB2.maKeodon === 'DOC_HUT', 'B đọc hụt phải DOC_HUT');
    const wC = TT.moWorkbook(FILE.C);
    const c = AT.docOrderExport(wC.bang('OrderSKUList'), { tenFile: 'C' }, wC.dongKhai('OrderSKUList'));
    bang([c.soDon, c.soDongDoc], [300, 301], 'C');
    let eC = null;
    try { AT.docOrderExport(wC.bang('OrderSKUList').slice(0, 50), { tenFile: 'C' }, 303); } catch (x) { eC = x; }
    dung(eC && eC.maKeodon === 'DOC_HUT', 'C đọc hụt phải DOC_HUT');
    return 'B khớp 2 ô "Báo cáo", lệch 1 đ → DOC_HUT, đọc hụt → DOC_HUT · C 300 đơn / 301 dòng, đọc 50/303 → DOC_HUT';
  });

  await test('TT-57', 'D-83 BA VẾ + câu 2B.11: "BỎ QUA 8 ĐƠN KHÔNG PHẢI ĐƠN BÁN" (7 đơn hủy + 1 chưa chốt tiền của bộ 15/9); đọc hụt in "SỐ DÒNG ĐỌC ĐƯỢC KHÔNG KHỚP Ô \"TỔNG SỐ GIAO DỊCH\""; vế (b) Tổng phụ trước giảm giá = 0 bắt cả đơn có khoản hoàn', async () => {
    const cham = async (Mod) => {
      const X = dungSim({});
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }), { mod: Mod });
      X.sim.thaoGo();
      if (r.e) return ['lỗi ' + r.e.message.slice(0, 120)];
      return /BỎ QUA 8 ĐƠN KHÔNG PHẢI ĐƠN BÁN/.test(r.ra) ? [] : ['thiếu "BỎ QUA 8 ĐƠN KHÔNG PHẢI ĐƠN BÁN"'];
    };
    bang(await cham(TT), [], 'câu bỏ qua');
    const am = await doiChungAm(async () => cham(napNodeSua('chay-tiktok.js', [["  if (boQua.length) noi('BỎ QUA '", "  if (false) noi('BỎ QUA '"]])), 'không in câu bỏ qua');
    const XLSX = require('xlsx');
    const bangHut = XLSX.utils.sheet_to_json(XLSX.readFile(FILE.A, { raw: true }).Sheets[A.nd.tenSheet], { header: 1, raw: true, defval: '' });
    let eHut = null;
    try { AT.docSeThanhToan(bangHut, { tenFile: 'A' }); } catch (x) { eHut = x; }
    dung(eHut && /^SỐ DÒNG ĐỌC ĐƯỢC KHÔNG KHỚP Ô "TỔNG SỐ GIAO DỊCH"/.test(eHut.message), 'câu đọc hụt');
    // vế (b): đơn ghi được, ép Tổng phụ trước giảm giá = 0 và cho một khoản hoàn âm (H ròng ≠ 0) → vẫn KHÔNG PHẢI ĐƠN BÁN, không làm dừng cả lượt
    const hd = A.bang[4];
    const cTp = hd.indexOf('Tổng phụ trước giảm giá'), cHoan = hd.indexOf('Tổng phụ hoàn tiền trước giảm giá của người bán');
    const maB = DCN.don.filter((d) => d.dong.length === 1)[0].maDon;
    const bangB = A.bang.map((h, i) => (i >= 5 && String(h[1]) === maB ? h.map((v, j) => (j === cTp ? '0' : j === cHoan ? '-1000' : v)) : h));
    const kB = AT.docSeThanhToan(bangB, { tenFile: 'A' });
    const bB = kB.boQua.filter((b) => b.maDon === maB)[0];
    dung(bB && bB.ma === 'KHONG_PHAI_DON_BAN' && !kB.loiTuKiem.length, 'vế (b): ' + (bB ? bB.ma : 'không bỏ qua') + ' · lệch tự kiểm ' + kB.loiTuKiem.length);
    const amB = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', '      if (ds.every(function (d) { return d.H - d.hoan === 0; })) {', '      if (false) {');
      const k = L.AdapterTikTok.docSeThanhToan(bangB, { tenFile: 'A' });
      const b = k.boQua.filter((x) => x.maDon === maB)[0];
      return (b && b.ma === 'KHONG_PHAI_DON_BAN') ? [] : ['đơn Tổng phụ 0 → ' + (b ? b.ma : (k.loiTuKiem.length ? 'lệch tự kiểm, dừng cả lượt' : 'GHI'))];
    }, 'bỏ vế (b) Tổng phụ trước giảm giá = 0');
    return '"BỎ QUA 8 ĐƠN KHÔNG PHẢI ĐƠN BÁN" · câu đọc hụt đúng chuỗi · vế (b) bắt đơn Tổng phụ 0 có hoàn · ' + am + '\n        · ' + amB;
  });

  console.log('\n--- TT-14: TikTok KHÔNG làm lệch Shopee (nút 4 trọn đường trong một tiến trình) ---');

  await test('TT-14', 'nút 4 (`chay-thu.js`) thả báo cáo TikTok + file Shopee cùng lượt → 4 gian Shopee ra Y HỆT lượt chỉ có Shopee (từng ô, từng vùng gộp) và gói xuLy Shopee không mang TT_SHOP; TikTok hỏng (sheet TikTok Shop sai khuôn → SAI_HOP_DONG) → Shopee VẪN ghi, mã thoát 1, báo cáo TikTok nằm nguyên', async () => {
    const argvCu = process.argv;
    process.argv = [argvCu[0], argvCu[1], '--thoi-diem', '2026-09-16 09:00'];
    delete require.cache[require.resolve('./chay-thu')];
    const CT = require('./chay-thu');
    // Khuyết tật cho đối chứng âm: lỗi TikTok KHÔNG được bọc → ném thẳng ra ngoài lượt nút 4.
    const CT_KHONG_BOC = napNodeSua('chay-thu.js', [["        maTT = 1;\n        console.log('\\nLỖI TIKTOK SHOP: ' + eTT.message);", '        throw eTT;']]);
    process.argv = argvCu;
    const chayNut4 = async (tc) => {
      const Mod = tc.mod || CT;
      const X = dungSim({ vo: tc.vo });
      const vh = dungVh(X.sim, { tiktok: tc.tiktok || [], shopee: [FILE.SHOPEE] });
      const logCu = console.log, errCu = console.error;
      let ra = '';
      console.log = (...a) => { ra += a.join(' ') + '\n'; };
      console.error = console.log;
      const goiXuLy = [];
      let ma;
      try { ma = await Mod.chayVanHanh(vh.vh); } catch (e) { ma = 'NÉM: ' + e.message; } finally { console.log = logCu; console.error = errCu; }
      X.sim.nhatKyGoi.forEach((g) => { if (g.hanhDong === 'xuly') goiXuLy.push(g); });
      const anh = {};
      ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'].forEach((t) => { anh[t] = chupVung(X.ss, t, 1, 3000); delete anh[t]['v1:16']; });
      return { X, vh, ma, ra, anh, goiXuLy };
    };
    const chiShopee = await chayNut4({});
    dung(chiShopee.ma === 0, 'lượt chỉ Shopee phải mã 0: ' + chiShopee.ma + '\n' + chiShopee.ra.slice(-500));
    const caHai = await chayNut4({ tiktok: [FILE.A] });
    dung(caHai.ma === 0 && /GHI THÊM 50 đơn/.test(caHai.ra), 'lượt TikTok + Shopee: mã ' + caHai.ma + '\n' + caHai.ra.slice(-800));
    const lech = [];
    Object.keys(chiShopee.anh).forEach((t) => soKhac(chiShopee.anh[t], caHai.anh[t]).forEach((k) => lech.push(t + '!' + k)));
    bang(lech.slice(0, 5), [], 'ô Shopee khác nhau giữa hai lượt');
    bang(caHai.goiXuLy.map((g) => g.soDon), chiShopee.goiXuLy.map((g) => g.soDon), 'gói xuLy Shopee');
    const khuon17 = (ss) => { ss.getSheetByName(SHEET).giaTri['2:13'] = 'Ảnh'; };
    const chamHong = (x) => {
      const lech2 = [];
      Object.keys(chiShopee.anh).forEach((t) => soKhac(chiShopee.anh[t], x.anh[t]).forEach((k) => lech2.push(t + '!' + k)));
      const loi = [];
      if (!(x.ma === 1 && /LỖI TIKTOK SHOP/.test(x.ra) && /Bốn gian Shopee vẫn chạy tiếp/.test(x.ra))) loi.push('mã ' + x.ma + ': ' + x.ra.slice(-200).replace(/\s+/g, ' '));
      if (lech2.length) loi.push(lech2.length + ' ô Shopee khác lượt chỉ Shopee (vd ' + lech2[0] + ')');
      if (fs.readdirSync(path.join(x.vh.tha, 'TikTok Shop')).filter((f) => /\.xlsx$/.test(f)).length !== 1) loi.push('báo cáo TikTok bị chuyển đi');
      return loi;
    };
    // TikTok hỏng vì sheet TikTok Shop sai khuôn (17 cột): Google dừng SAI_HOP_DONG cho gói TikTok. Gói Shopee KHÔNG mang khóa TT_SHOP nên
    // hợp đồng sổ tháng của nó không xét sheet đó — Shopee phải ghi y như lượt chỉ Shopee.
    const hongTT = await chayNut4({ tiktok: [FILE.A], vo: khuon17 });
    bang(chamHong(hongTT), [], 'TikTok hỏng');
    [chiShopee, caHai, hongTT].forEach((x) => x.X.sim.thaoGo());
    const soO = Object.keys(chiShopee.anh).reduce((t, k) => t + Object.keys(chiShopee.anh[k]).length, 0);
    const am = await doiChungAm(async () => {
      const y = await chayNut4({ tiktok: [FILE.A], vo: khuon17, mod: CT_KHONG_BOC });
      y.X.sim.thaoGo();
      return chamHong(y);
    }, 'lỗi TikTok không bọc (ném ra ngoài lượt nút 4)');
    return soO + ' ô Shopee y hệt khi có/không có TikTok · TikTok hỏng → Shopee vẫn ghi, mã 1, báo cáo TikTok nằm nguyên\n        · ' + am;
  });

  RAC.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* thư mục tạm */ } });
  L1.sim.thaoGo();
  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  ' + h)); process.exit(1); }
})().catch((e) => { console.log('LỖI: ' + (e && e.stack)); process.exit(1); });
