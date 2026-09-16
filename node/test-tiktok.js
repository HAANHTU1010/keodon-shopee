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

  await test('TT-02', 'CÓ ĐƠN LÀ GHI (chủ dự án chốt 16/9, đè luật "bỏ đơn" D-83): 8 đơn bất thường (1 hủy Tổng phụ 0 · 6 hoàn TOÀN BỘ · 1 "Đang chờ hoàn tất trả hàng/hoàn tiền"; 6 đơn quyết toán ước tính 0) VẪN ĐƯỢC GHI đủ dòng đủ số, dòng TÔ VÀNG #FFF2CC, ô Note mở đầu "SOÁT TAY: " và nêu ĐÚNG từng lý do — 0 đơn bị bỏ; nhóm DUY NHẤT còn bị bỏ là giao dịch khác "Đơn hàng" (KHONG_PHAI_DON_HANG)', async () => {
    // Mã đơn / số tiền thật của shop KHÔNG nằm trong kho công khai: dò cả nhóm bất thường từ CHÍNH file theo đúng dấu hiệu chủ dự án nêu,
    // KHÔNG hỏi adapter (nếu hỏi adapter thì phép chấm chỉ soi gương).
    const hd = A.bang[4];
    const iMa = hd.indexOf('ID đơn hàng/điều chỉnh'), iLy = hd.indexOf('Lý do chưa quyết toán'), iLoai = hd.indexOf('Loại giao dịch');
    const iTp = hd.indexOf('Tổng phụ trước giảm giá'), iHo = hd.indexOf('Tổng phụ hoàn tiền trước giảm giá của người bán'), iQt = hd.indexOf('Số tiền quyết toán ước tính');
    dung([iMa, iLy, iLoai, iTp, iHo, iQt].every((i) => i >= 0), 'file thật thiếu cột để dò: ' + [iMa, iLy, iLoai, iTp, iHo, iQt].join(','));
    const LY_TREO = 'Đang chờ hoàn tất trả hàng/hoàn tiền';
    const CAU = {
      treo: '"' + LY_TREO + '" — khách đang đòi trả hàng/hoàn tiền',
      huy: 'Tổng phụ trước giảm giá = 0 — dấu hiệu ĐƠN HỦY',
      hoan: 'đã hoàn tiền TOÀN BỘ — doanh thu ròng 0',
      motPhan: 'có khoản HOÀN MỘT PHẦN — số lượng bán thật phải kiểm tay',
      chuaPhi: 'TikTok CHƯA TÍNH PHÍ (quyết toán ước tính = 0)'
    };
    const tho = {};
    A.bang.slice(5).forEach((h) => {
      if (!h[iMa]) return;
      const t = tho[String(h[iMa])] || (tho[String(h[iMa])] = { tp: [], ho: [], q: [], ly: [] });
      t.tp.push(Number(h[iTp])); t.ho.push(Number(h[iHo])); t.q.push(Number(h[iQt])); t.ly.push(String(h[iLy] == null ? '' : h[iLy]));
    });
    const can = {};                                  // mã → các câu lý do BẮT BUỘC phải có trong ô Note
    Object.keys(tho).forEach((m) => {
      const t = tho[m], H = t.tp.map((v, i) => v + t.ho[i]), ds = [];
      if (t.ly.indexOf(LY_TREO) >= 0) ds.push(CAU.treo);
      if (t.tp.every((v) => v === 0)) ds.push(CAU.huy);
      else if (H.every((v) => v === 0)) ds.push(CAU.hoan);
      else if (H.some((v) => v === 0) || t.ho.some((v) => v !== 0)) ds.push(CAU.motPhan);
      if (t.q.some((v) => v === 0)) ds.push(CAU.chuaPhi);
      if (ds.length) can[m] = ds;
    });
    const MA_BAT = Object.keys(can);
    const dem = (c) => MA_BAT.filter((m) => can[m].indexOf(c) >= 0).length;
    bang([MA_BAT.length, dem(CAU.treo), dem(CAU.huy), dem(CAU.hoan), dem(CAU.motPhan), dem(CAU.chuaPhi)], [8, 1, 1, 6, 0, 6],
      'dò từ file: bất thường / treo trả hàng / hủy Tổng phụ 0 / hoàn toàn bộ / hoàn một phần / chưa tính phí');
    bang([DCN.boQua.length, DCN.don.length, DCN.loiTuKiem.length], [0, 129, 0], 'đơn bị bỏ / đơn ghi được / lệch tự kiểm');
    bang(MA_BAT.filter((m) => !DCN.don.some((d) => d.maDon === m)), [], 'đơn bất thường bị loại khỏi ĐƠN CHUẨN');

    // Chấm TRÊN SỔ GIẢ: cả 8 mã phải có dòng, dòng vàng, Note "SOÁT TAY: " + đúng lý do; và đơn BÌNH THƯỜNG không được mang lý do bất thường nào.
    const cham = async (L) => {
      const X = dungSim({});
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }), { lop: L });
      if (r.e) { X.sim.thaoGo(); return ['lỗi ' + String(r.e.message).slice(0, 120)]; }
      const loi = [];
      MA_BAT.forEach((m) => {
        const s = dongCua(X.ss, m);
        if (!s) { loi.push(m + ': KHÔNG có dòng nào trên sổ (đơn bất thường bị bỏ)'); return; }
        const note = String(s.note == null ? '' : s.note);
        if (s.rows.some((x) => x.vang !== '#FFF2CC')) loi.push(m + ': dòng không vàng ' + JSON.stringify(s.rows.map((x) => x.vang)));
        if (note.indexOf('SOÁT TAY: ') < 0) loi.push(m + ': Note không có "SOÁT TAY: " ("' + note.slice(0, 80) + '")');
        can[m].forEach((c) => { if (note.indexOf(c) < 0) loi.push(m + ': Note thiếu lý do "' + c.slice(0, 45) + '…" ("' + note.slice(0, 120) + '")'); });
      });
      DCN.don.filter((d) => !MA_TREN_SO.has(d.maDon) && !can[d.maDon]).forEach((d) => {
        const s = dongCua(X.ss, d.maDon);
        if (!s) { loi.push(d.maDon + ': đơn mới bình thường chưa lên sổ'); return; }
        const note = String(s.note == null ? '' : s.note);
        Object.keys(CAU).forEach((k) => { if (note.indexOf(CAU[k]) >= 0) loi.push(d.maDon + ': đơn BÌNH THƯỜNG mà Note có "' + CAU[k].slice(0, 40) + '…"'); });
      });
      X.sim.thaoGo();
      return loi;
    };
    bang((await cham(lop)).slice(0, 4), [], '8 đơn bất thường trên sổ');
    const am = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', 'quyetToan: Q, lyDo: ds[0].lyDo, canhBao: cb,', 'quyetToan: Q, lyDo: ds[0].lyDo, canhBao: [],');
      ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = L[t]; });
      try { return await cham(L); } finally { ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; }); }
    }, 'bỏ phần gắn cảnh báo trong AdapterTikTok (đơn hủy/hoàn vẫn ghi nhưng KHÔNG vàng, KHÔNG Note)');

    // Nhóm DUY NHẤT còn bị bỏ: file thật không có giao dịch nào khác "Đơn hàng" → dựng một giao dịch quảng cáo từ chính một đơn của file.
    const maQc = String(A.bang[5][iMa]);
    const bangQc = A.bang.map((h, i) => (i >= 5 && String(h[iMa]) === maQc ? h.map((v, j) => (j === iLoai ? 'GMV thanh toán cho Quảng cáo TikTok' : v)) : h));
    const kQc = AT.docSeThanhToan(bangQc, { tenFile: 'A' });
    bang([kQc.boQua.map((b) => [b.ma, b.maDon === maQc]), kQc.don.length], [[['KHONG_PHAI_DON_HANG', true]], 128], 'giao dịch khác "Đơn hàng"');
    const amQc = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', "      if (khac) return boQua('KHONG_PHAI_DON_HANG',", "      if (false) return boQua('KHONG_PHAI_DON_HANG',");
      const k = L.AdapterTikTok.docSeThanhToan(bangQc, { tenFile: 'A' });
      return k.boQua.length ? [] : ['giao dịch quảng cáo lọt vào danh sách ghi (' + k.don.length + ' đơn, 0 bỏ qua)'];
    }, 'bỏ luật giao dịch khác "Đơn hàng"');
    return '8 đơn bất thường đều ghi + vàng + Note đúng lý do · 0 đơn bị bỏ · giao dịch quảng cáo → KHONG_PHAI_DON_HANG\n        · ' + am + '\n        · ' + amQc;
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

  await test('TT-05', 'CÔNG THỨC CHỐT (ròng hoàn tiền, đổi dấu): H − I − J − K = "Số tiền quyết toán ước tính" → 130/130 dòng; ĐƠN BÌNH THƯỜNG (không dấu bất thường nào) lệch ĐÚNG MỘT ĐỒNG → `kiemTuKiem` ném TU_KIEM_LECH, DỪNG cả phần TikTok, đơn đó không vào ĐƠN CHUẨN', async () => {
    const khop = (dt) => dt.filter((x) => x.H - x.I - x.J - x.K === x.Q).length;
    bang(khop(DCN.dongTho), 130, 'số dòng khớp');
    // Luật 16/9: đơn ĐÃ có cảnh báo thì tiền lệch chỉ thêm một câu Note; chỉ ĐƠN BÌNH THƯỜNG lệch mới DỪNG. Muốn chấm đúng vế "DỪNG" phải
    // có đơn bình thường thật: dựng từ CHÍNH file thật bằng cách xoá ô "Lý do chưa quyết toán" (ô thông tin, không đụng một đồng tiền nào).
    const iMa = A.bang[4].indexOf('ID đơn hàng/điều chỉnh'), iLy = A.bang[4].indexOf('Lý do chưa quyết toán'), iQt = A.bang[4].indexOf('Số tiền quyết toán ước tính');
    const bangBt = A.bang.map((h, i) => (i >= 5 ? h.map((v, j) => (j === iLy ? '' : v)) : h));
    const kBt = AT.docSeThanhToan(bangBt, { tenFile: 'A' });
    const donBt = kBt.don.filter((d) => !d.canhBao.length);
    bang([donBt.length, kBt.loiTuKiem.length, khop(kBt.dongTho), kBt.don.length], [122, 0, 130, 129], 'đơn bình thường / lệch tự kiểm / dòng khớp / đơn ghi được');
    AT.kiemTuKiem(kBt);                                                   // không lệch một đồng nào thì KHÔNG được ném
    const maLech = donBt[0].maDon;
    const bangLech = bangBt.map((h, i) => (i >= 5 && String(h[iMa]) === maLech ? h.map((v, j) => (j === iQt ? String(Number(v) + 1) : v)) : h));
    const kLech = AT.docSeThanhToan(bangLech, { tenFile: 'A' });
    bang([kLech.loiTuKiem.length, kLech.loiTuKiem.length ? kLech.loiTuKiem[0].maDon === maLech : null, kLech.don.some((d) => d.maDon === maLech)],
      [1, true, false], 'đơn bình thường lệch 1 đồng');
    let eL = null;
    try { AT.kiemTuKiem(kLech); } catch (x) { eL = x; }
    dung(eL && eL.maKeodon === 'TU_KIEM_LECH' && /KHÔNG ghi đơn nào/.test(eL.message) && eL.message.indexOf(maLech) >= 0,
      'lệch 1 đồng phải ném TU_KIEM_LECH: ' + (eL ? eL.message.slice(0, 140) : 'KHÔNG ném'));
    const sai = (bangVao, moc, thay) => { const L = napLoiSua('adapters/AdapterTikTok.gs', moc, thay); return { L: L, k: L.AdapterTikTok.docSeThanhToan(bangVao, { tenFile: 'A' }) }; };
    const am1 = await doiChungAm(async () => {
      const n = khop(sai(A.bang, "      H: n('tien_truoc_giam') + n('hoan_truoc_giam'),", "      H: n('tien_truoc_giam'),").k.dongTho);
      return n !== 130 ? ['bỏ khoản hoàn → ' + n + '/130'] : [];
    }, 'công thức 4 cột gốc (không cộng khoản hoàn)');
    const am2 = await doiChungAm(async () => {
      const n = khop(sai(A.bang, "      J: -n('tong_phi') - K,", "      J: Math.abs(n('tong_phi')) - K,").k.dongTho);
      return n !== 130 ? ['trị tuyệt đối → ' + n + '/130 (dòng hoàn phí dương thành khoản phí)'] : [];
    }, 'lấy trị tuyệt đối Tổng phí');
    const am3 = await doiChungAm(async () => {
      const x = sai(bangBt, "      I: -(n('giam_gia_shop') + n('hoan_giam_gia_shop')),", "      I: (n('giam_gia_shop') + n('hoan_giam_gia_shop')),");
      try { x.L.AdapterTikTok.kiemTuKiem(x.k); } catch (e) { return [e.maKeodon + ': bắt ' + x.k.loiTuKiem.length + ' đơn bình thường · ' + e.message.slice(0, 70)]; }
      return [];
    }, 'quên đổi dấu giảm giá người bán → đơn bình thường phải bị bắt, DỪNG');
    return '130/130 dòng · ' + donBt.length + ' đơn bình thường, lệch 1 đồng ở một đơn → TU_KIEM_LECH\n        · ' + am1 + '\n        · ' + am2 + '\n        · ' + am3;
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
    // Hai cột canh luật D-83 phải NẰM TRONG danh sách bắt buộc: thiếu mà vẫn chạy là luật tắt lặng, đơn đang trả hàng vào sổ.
    ['Lý do chưa quyết toán', 'Loại giao dịch'].forEach((c) => {
      const bo = A.bang.map((h, i) => (i === 4 ? h.map((t) => (t === c ? 'x' : t)) : h));
      let eC = null;
      try { AT.docSeThanhToan(bo, { tenFile: 'x.xlsx' }); } catch (x) { eC = x; }
      dung(eC && eC.maKeodon === 'THIEU_COT' && eC.message.indexOf(c) >= 0, 'bỏ cột "' + c + '" phải CHẶN, không được chạy tiếp: ' + (eC ? eC.message.slice(0, 80) : 'đọc bình thường'));
    });
    return '"' + e.message.slice(0, 90) + '…" · bỏ cột Lý do / Loại giao dịch cũng CHẶN · cột lạ: "' + nd2.canhBao[0].slice(0, 80) + '…"';
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

  await test('TT-11', 'file có đơn cũ lẫn đơn mới → CHỈ ghi đơn mới: sheet đang có 71 mã → lần đầu ghi 58, bỏ qua 71 đã có, 0 ĐƠN BỊ BỎ (CÓ ĐƠN LÀ GHI) và màn hình in khối "… ĐƠN CẦN SOÁT TAY" thay cho câu bỏ đơn; báo cáo chuyển vào "đã xử lý" sau khi ghi', async () => {
    dung(!R1.e, 'lượt chạy lỗi: ' + (R1.e && R1.e.message) + '\n' + R1.ra.slice(-600));
    bang([MA_TREN_SO.size, R1.kq.thongKe.donGhi, R1.kq.thongKe.donDaCo, R1.kq.thongKe.donBoQua], [71, 58, 71, 0], 'trên sổ / ghi / bỏ qua đã có / bị bỏ');
    bang(DON_MOI.length, 58, 'đơn mới theo ĐƠN CHUẨN');
    bang(DON_MOI.filter((d) => !dongCua(L1.ss, d.maDon)).length, 0, 'đơn mới chưa thấy trên sổ');
    bang([DCN.boQua.length, DCN.don.filter((d) => !dongCua(L1.ss, d.maDon)).length], [0, 0], 'đơn bị bỏ / đơn đọc được mà không có dòng nào trên sổ');
    bang([fs.readdirSync(path.join(vh1.tha, 'TikTok Shop')).filter((f) => /\.xlsx$/.test(f)).length, fs.readdirSync(path.join(vh1.tha, 'TikTok Shop', 'đã xử lý')).length], [0, 1], 'file sau khi ghi');
    dung(/GHI THÊM 58 đơn/.test(R1.ra) && /bỏ qua 71 đơn đã có/.test(R1.ra) &&
      /\d+ ĐƠN CẦN SOÁT TAY — vẫn GHI đủ đơn đủ số, dòng TÔ VÀNG và cột Note ghi rõ lý do:/.test(R1.ra) &&
      /Dòng vàng vì đơn hủy \/ hoàn \/ chưa chốt tiền: \d+/.test(R1.ra) &&
      !/BỎ QUA \d+ ĐƠN/.test(R1.ra) && !/Không ghi \d+ giao dịch/.test(R1.ra), 'màn hình thiếu số / còn câu bỏ đơn: ' + R1.ra.slice(-900));
    const goi = L1.sim.nhatKyGoi.map((g) => g.hanhDong);
    bang(goi, ['doc', 'ghi'], 'các gói gửi đi (đường ghi, KHÔNG xuLy)');
    // YC-53 nhật ký riêng của TikTok + INV-7: màn hình và nhật ký không lọt link Web App, link/ID file tháng, chuỗi bí mật.
    dung(R1.kq.fileLog && /_TIKTOK\.txt$/.test(R1.kq.fileLog) && fs.existsSync(R1.kq.fileLog), 'thiếu nhật ký LOG_*_TIKTOK.txt');
    const nk = fs.readFileSync(R1.kq.fileLog, 'utf8');
    dung(/GHI THÊM 58 đơn/.test(nk) &&/^RUN \d{8}_\d{6}_TEST-TT \| bản dựng [0-9a-f]+ \| file .+ \| gian TikTok Shop \| đơn vào 129 \| ghi 58 \| bỏ qua 71 /m.test(nk), 'nhật ký thiếu số / dòng RUN: ' + nk.slice(-400));
    const lot = [L1.sim.url, L1.sim.biMat, L1.sim.idCua('2026-09')].filter((x) => (R1.ra + nk).indexOf(x) >= 0)
      .concat(/docs\.google\.com\/spreadsheets/.test(R1.ra + nk) ? ['link file tháng'] : []);
    bang(lot, [], 'INV-7 màn hình + nhật ký');
    const am = await doiChungAm(async () => {
      // Khuyết tật: nhật ký TikTok trộn chung tên với nhật ký Shopee (YC-53 đòi nhật ký RIÊNG) và mất dòng RUN của lượt TikTok.
      const Sai = napNodeSua('chay-tiktok.js', [["  const fileLog = path.join(cv.__ketQua, 'LOG_' + lop.Utils.nhanThoiDiem(gioVN) + '_TIKTOK.txt');",
        "  const fileLog = path.join(cv.__ketQua, 'LOG_' + lop.Utils.nhanThoiDiem(gioVN) + '.txt');"]]);
      const X = dungSim({});
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }), { mod: Sai });
      X.sim.thaoGo();
      if (r.e) return ['lỗi ' + String(r.e.message).slice(0, 80)];
      return /_TIKTOK\.txt$/.test(r.kq.fileLog || '') ? [] : ['nhật ký ra "' + path.basename(r.kq.fileLog || '?') + '" — không còn là LOG_*_TIKTOK.txt riêng của TikTok'];
    }, 'nhật ký TikTok không còn tên riêng _TIKTOK.txt');
    return 'ghi 58 · bỏ qua 71 đã có · 0 đơn bị bỏ · gói ' + goi.join('→') + ' · nhật ký LOG_*_TIKTOK.txt có dòng RUN, 0 link/ID/bí mật\n        · ' + am;
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

  await test('TT-12', 'thiếu Mapping một biến thể có đơn mới → KHÔNG ĐOÁN: dòng vàng, D trống, báo đúng Tên sản phẩm + Tên SKU (đã cắt khoảng trắng cuối); Mapping nối dòng vàng Gian hàng = TikTok Shop kèm ID SKU ở Ghi chú; các đơn khác vẫn ghi đủ 58', async () => {
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
      if (r.kq.thongKe.donGhi !== 58) loi.push('ghi ' + r.kq.thongKe.donGhi + ' đơn');
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
    return '"' + PL + '" thiếu → ' + ungVien.filter((x) => x.dong[0].tenPhanLoai === PL).length + ' đơn vàng, D trống · Mapping +2 dòng (biến thể thiếu + Baby Tee của đơn đã có; Ghi chú có ngày + ID SKU) · 58 đơn vẫn ghi\n        · ' + am;
  });

  await test('TT-10', 'thả LẠI CÙNG FILE → ghi 0, bỏ qua 129 = 71 + 58 của lần một, không gửi lệnh ghi, không thêm dòng', async () => {
    const X = dungSim({});
    const lan1 = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }));
    dung(!lan1.e && lan1.kq.thongKe.donGhi === 58, 'lần một: ' + (lan1.e ? lan1.e.message : lan1.kq.thongKe.donGhi));
    const het = X.ss.getSheetByName(SHEET).getLastRow();
    X.sim.demLai();
    const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }));
    dung(!r.e, 'lỗi: ' + (r.e && r.e.message));
    bang([r.kq.thongKe.donGhi, r.kq.thongKe.donDaCo, X.ss.getSheetByName(SHEET).getLastRow(), X.sim.nhatKyGoi.map((g) => g.hanhDong)], [0, 129, het, ['doc']]);
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
    return 'ghi 0 · bỏ qua 129 · chỉ một gói doc · ' + am;
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

  await test('TT-56b', 'MỘT file "Sẽ thanh toán" là đủ: ghi 58 đơn; file "Tất cả đơn hàng" thả kèm → nhắc "không dùng", không đọc, không chuyển', async () => {
    const cham = async (L, tc) => {
      const X = dungSim({});
      const vh = dungVh(X.sim, Object.assign({ tiktok: [FILE.A] }, tc || {}));
      const r = await chayTT(X.sim, vh, { lop: L });
      X.sim.thaoGo();
      const loi = [];
      if (r.e) return ['lỗi ' + r.e.message.slice(0, 100)];
      if (!/GHI THÊM 58 đơn/.test(r.ra)) loi.push('không ghi 58: ' + (r.ra.match(/GHI THÊM \d+ đơn/) || ['?'])[0]);
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
    return 'một file → ghi 58 · C thả kèm nằm nguyên, nhắc không dùng · ' + am;
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

  await test('TT-57', 'CÓ ĐƠN LÀ GHI + câu 2B.11: màn hình in KHỐI "… ĐƠN CẦN SOÁT TAY — vẫn GHI đủ đơn đủ số…" đúng số đơn và đúng lý do từng đơn, KHÔNG còn câu bỏ đơn nào; đọc hụt vẫn in "SỐ DÒNG ĐỌC ĐƯỢC KHÔNG KHỚP Ô \"TỔNG SỐ GIAO DỊCH\""; vế "Tổng phụ trước giảm giá = 0" (đơn có khoản hoàn) → ĐƠN VẪN ĐƯỢC GHI, dòng vàng, Note "SOÁT TAY: … dấu hiệu ĐƠN HỦY"', async () => {
    const CB = {};
    DCN.don.forEach((d) => { if (d.canhBao && d.canhBao.length) CB[d.maDon] = d.canhBao.join(' · '); });
    const soCb = Object.keys(CB).length;
    dung(soCb > 0 && DCN.boQua.length === 0, 'file thật phải có đơn cần soát tay và 0 đơn bị bỏ: ' + soCb + ' / ' + DCN.boQua.length);
    const cham = async (Mod) => {
      const X = dungSim({});
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [FILE.A] }), { mod: Mod });
      X.sim.thaoGo();
      if (r.e) return ['lỗi ' + r.e.message.slice(0, 120)];
      const m = /(\d+) ĐƠN CẦN SOÁT TAY — vẫn GHI đủ đơn đủ số, dòng TÔ VÀNG và cột Note ghi rõ lý do:/.exec(r.ra);
      if (!m) return ['màn hình KHÔNG có khối "… ĐƠN CẦN SOÁT TAY"'];
      const loi = [];
      if (Number(m[1]) !== soCb) loi.push('khối báo ' + m[1] + ' đơn, ĐƠN CHUẨN có ' + soCb + ' đơn mang cảnh báo');
      const dsIn = r.ra.split('\n').filter((l) => /^ {2}· \d{15,20}: /.test(l));
      if (!dsIn.length) loi.push('khối không liệt kê đơn nào');
      dsIn.forEach((l) => {
        const q = /^ {2}· (\d{15,20}): (.*)$/.exec(l);
        if (CB[q[1]] !== q[2]) loi.push('lý do in ra không đúng cảnh báo của ' + q[1] + ': "' + String(q[2]).slice(0, 70) + '"');
      });
      // 0 đơn bị bỏ → màn hình không được còn câu bỏ đơn nào (câu "BỎ QUA …" nay chỉ dành cho giao dịch không phải đơn hàng)
      if (/BỎ QUA \d+ ĐƠN/.test(r.ra) || /Không ghi \d+ giao dịch/.test(r.ra)) loi.push('màn hình vẫn nói bỏ đơn: ' + (r.ra.match(/BỎ QUA \d+ ĐƠN.*|Không ghi \d+ giao dịch.*/) || [''])[0].slice(0, 90));
      return loi;
    };
    bang((await cham(TT)).slice(0, 4), [], 'khối ĐƠN CẦN SOÁT TAY');
    const am = await doiChungAm(async () => cham(napNodeSua('chay-tiktok.js', [['  if (canhBaoDon.length) {', '  if (false) {']])),
      'không in khối đơn cần soát tay (nhân viên không biết dòng nào phải soát)');
    const XLSX = require('xlsx');
    const bangHut = XLSX.utils.sheet_to_json(XLSX.readFile(FILE.A, { raw: true }).Sheets[A.nd.tenSheet], { header: 1, raw: true, defval: '' });
    let eHut = null;
    try { AT.docSeThanhToan(bangHut, { tenFile: 'A' }); } catch (x) { eHut = x; }
    dung(eHut && /^SỐ DÒNG ĐỌC ĐƯỢC KHÔNG KHỚP Ô "TỔNG SỐ GIAO DỊCH"/.test(eHut.message), 'câu đọc hụt');
    // Vế "Tổng phụ trước giảm giá = 0": ép MỘT ĐƠN MỚI bình thường về Tổng phụ 0 + một khoản hoàn âm (H ròng ≠ 0) → nay VẪN GHI, vàng + Note.
    const hd = A.bang[4];
    const cMa = hd.indexOf('ID đơn hàng/điều chỉnh');
    const cTp = hd.indexOf('Tổng phụ trước giảm giá'), cHoan = hd.indexOf('Tổng phụ hoàn tiền trước giảm giá của người bán');
    const CAU_HUY = 'Tổng phụ trước giảm giá = 0 — dấu hiệu ĐƠN HỦY';
    const dGoc = DON_MOI.filter((d) => d.dong.length === 1 && !/ĐƠN HỦY|hoàn tiền TOÀN BỘ|HOÀN MỘT PHẦN|khách đang đòi|CHƯA TÍNH PHÍ/.test((d.canhBao || []).join(' ')))[0];
    dung(dGoc, 'file thật không còn đơn mới 1 dòng, không sẵn dấu hủy/hoàn để dựng vế này');
    const maB = dGoc.maDon;
    const bangB = A.bang.map((h, i) => (i >= 5 && String(h[cMa]) === maB ? h.map((v, j) => (j === cTp ? '0' : j === cHoan ? '-1000' : v)) : h));
    const kB = AT.docSeThanhToan(bangB, { tenFile: 'A' });
    const dB = kB.don.filter((d) => d.maDon === maB)[0];
    dung(dB && dB.canhBao.indexOf(CAU_HUY) >= 0 && !kB.boQua.length && !kB.loiTuKiem.length,
      'vế Tổng phụ 0: ' + (dB ? JSON.stringify(dB.canhBao) : 'ĐƠN BỊ BỎ') + ' · bỏ qua ' + kB.boQua.length + ' · lệch tự kiểm ' + kB.loiTuKiem.length);
    const tepB = path.join(tamMoi('veHuy'), 'Onhold-unsettled-orders-tongphu0.xlsx');
    const wbB = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbB, XLSX.utils.aoa_to_sheet(bangB), A.nd.tenSheet);
    XLSX.writeFile(wbB, tepB);
    const chamB = async (L) => {
      const X = dungSim({});
      const r = await chayTT(X.sim, dungVh(X.sim, { tiktok: [tepB] }), { lop: L });
      const s = r.e ? null : dongCua(X.ss, maB);
      X.sim.thaoGo();
      if (r.e) return ['lỗi ' + String(r.e.message).slice(0, 120)];
      if (!s) return ['đơn Tổng phụ 0 KHÔNG được ghi lên sổ'];
      const note = String(s.note == null ? '' : s.note);
      const loi = [];
      if (s.rows.some((x) => x.vang !== '#FFF2CC')) loi.push('dòng không vàng ' + JSON.stringify(s.rows.map((x) => x.vang)));
      if (note.indexOf('SOÁT TAY: ') < 0 || note.indexOf(CAU_HUY) < 0) loi.push('Note: "' + note.slice(0, 150) + '"');
      if (s.H !== dB.tien.H) loi.push('H trên sổ ' + s.H + ' ≠ số trong báo cáo ' + dB.tien.H);
      return loi;
    };
    bang(await chamB(lop), [], 'vế Tổng phụ 0 → ghi + vàng + Note');
    const amB = await doiChungAm(async () => {
      const L = napLoiSua('adapters/AdapterTikTok.gs', '      if (ds.every(function (d) { return d.H - d.hoan === 0; })) cb.push(', '      if (false) cb.push(');
      ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = L[t]; });
      try { return await chamB(L); } finally { ['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; }); }
    }, 'bỏ vế "Tổng phụ trước giảm giá = 0" (đơn hủy vẫn ghi nhưng Note không nói đúng lý do)');
    return 'khối "' + soCb + ' ĐƠN CẦN SOÁT TAY" đúng số + đúng lý do từng đơn, 0 câu bỏ đơn · câu đọc hụt đúng chuỗi · đơn Tổng phụ 0 vẫn ghi, vàng, Note "SOÁT TAY: … ĐƠN HỦY"\n        · ' + am + '\n        · ' + amB;
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
    dung(caHai.ma === 0 && /GHI THÊM 58 đơn/.test(caHai.ra), 'lượt TikTok + Shopee: mã ' + caHai.ma + '\n' + caHai.ra.slice(-800));
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
