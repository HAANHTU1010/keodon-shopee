/**
 * test-xu-ly-tren-google.js — BẰNG CHỨNG cho việc chuyển lớp 2 và lớp 3 sang Apps Script (bản 2.4.0).
 *
 * Chạy: `node node/test-xu-ly-tren-google.js`  ·  không cần mạng, không cần link Web App.
 *
 * Câu hỏi phải trả lời, và cách trả lời:
 *
 *  1. HAI ĐƯỜNG CÓ RA CÙNG MỘT KẾT QUẢ KHÔNG?
 *     Dựng HAI file tháng giả giống hệt nhau, đổ CÙNG một bộ dữ liệu thật (402 đơn của
 *     `Order.all.20260807_20260906.xlsx`, Mapping nghiệm thu NT1, tồn kho của file tháng 8), chạy
 *     đường cũ ('ghi': máy tự làm lớp 2, lớp 3) lên file thứ nhất và đường mới ('xuLy': Apps Script
 *     tự làm) lên file thứ hai, rồi SO TỪNG Ô của cả hai file: giá trị, công thức, định dạng số,
 *     màu nền, cụm ô gộp. Không so bằng con số tổng — so bằng ô.
 *
 *  2. DỮ LIỆU NGƯỜI MUA CÓ RỜI KHỎI MÁY KHÔNG? (INV-4)
 *     Gói `xuLy` mang dòng thô của file xuất đi qua mạng. Bơm từng cột PII vào gói và đòi tool
 *     PHẢI ném lỗi, PHẢI không gửi gói nào.
 *
 *  3. GIỚI HẠN 6 PHÚT CÓ ĐƯỢC TÔN TRỌNG KHÔNG?
 *     Ép ngưỡng về 0 giây để Web App dừng gọn ngay sau khối đầu, rồi kiểm: máy có gọi tiếp không,
 *     có ghi trùng không, kết quả cuối có bằng lần chạy một hơi không.
 *
 * KIẾN TRÚC: dùng `node/gia-lap-web-app.js` — Web App giả chạy CHÍNH mã thật của
 * `src/ShellAppsScript.gs` trong Node. Test hỏng nghĩa là mã thật hỏng, không phải bản mô phỏng hỏng.
 *
 * VÌ SAO PHẢI GÁN `global.DanhMuc/MapListing/Normalize`: trong Apps Script mọi file .gs dùng CHUNG một
 * phạm vi toàn cục, nên `ShellAppsScript.gs` gọi thẳng `Normalize.xuLy` được. Trong Node, giả lập nạp
 * 5 file (`FILE_VO_GOOGLE`) vào một phạm vi hàm; ba file lớp 2 không nằm trong đó nên tham chiếu rơi
 * ra phạm vi toàn cục của Node — gán vào `global` là tái lập đúng cảnh "đã dán đủ 7 file rồi Deploy".
 * Đây cũng chính là thứ `thuXuLyRong()` bắt người triển khai kiểm ngay sau khi Deploy.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

// Nạp TRƯỚC mọi thứ: module này cắt cầu mạng (thay `require.cache['https']`). Nạp sau là
// `gsheet-web-app.js` đã kịp giữ bản `https` thật và test sẽ gọi ra Internet.
const gl = require('./gia-lap-web-app');

const ExcelJS = require('exceljs');
const { napLoi } = require('./nap-loi');
const { chayLenGoogleSheet, napVoGoogle, ngayCua } = require('./chay-google-sheet');
const {
  WebAppGoogleSheet, kiemPII, lenhTuDon, chiaLoTheoDon, chuanDuong,
  TOI_DA_DON_MOT_LO_XU_LY, PHIEN_BAN
} = require('./gsheet-web-app');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const NT1 = path.join(ROOT, '..', '..', '01_TAI_LIEU', 'NGHIEM_THU_NT1');

const GOC = {
  tracking: path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx'),
  xuat: path.join(DAU_VAO, 'Order.all.20260807_20260906.xlsx'),
  mapping: path.join(NT1, 'MAP_LISTING_SP_MALL_NT1.xlsx')
};

const THANG = '2026-09';
const NGAY_MAY_CHU_GOOGLE = '2026-09-08T03:00:00Z';
const THOI_DIEM = new Date(2026, 8, 8, 9, 0, 0);
const TEN_SHEET = 'Shopee mall';

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
function test(ten, fn) {
  try { fn(); soDat++; console.log('ĐẠT   ' + ten); }
  catch (e) { soHong++; hong.push(ten + ' -> ' + e.message); console.log('HỎNG  ' + ten + '\n   -> ' + e.message); }
}
function dung(dk, ghiChu) { if (!dk) throw new Error(ghiChu || 'điều kiện sai'); }
function bang(thuc, mong, ghiChu) {
  if (JSON.stringify(thuc) !== JSON.stringify(mong))
    throw new Error((ghiChu ? ghiChu + ': ' : '') + 'được ' + JSON.stringify(thuc) + ', cần ' + JSON.stringify(mong));
}
async function nemLoiAsync(fn) {
  try { await fn(); } catch (e) { return e.message; }
  throw new Error('lẽ ra phải ném lỗi mà lại chạy trót lọt');
}
function bam(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// ==================================================================== đọc dữ liệu thật

/**
 * Đọc một sheet .xlsx thành mảng 2 chiều GIÁ TRỊ HIỂN THỊ — đúng thứ `getDisplayValues()` của Google
 * Sheets trả về. Ô công thức lấy KẾT QUẢ đã tính (`cell.result`), không lấy chuỗi công thức: trên
 * Google Sheet thật, cột `Tổng tồn` là công thức nhưng Apps Script đọc ra con số.
 */
async function docHienThi(file, tenSheet) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = (tenSheet && wb.getWorksheet(tenSheet)) || wb.worksheets[0];
  if (!ws) throw new Error('File ' + path.basename(file) + ' không có sheet "' + tenSheet + '"');
  const out = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const a = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      let v = cell.value;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if (v.formula != null || v.sharedFormula != null) v = v.result == null ? '' : v.result;
        else if (v.richText) v = v.richText.map((t) => t.text).join('');
        else if (v.text != null) v = String(v.text);
        else v = '';
      }
      if (v && typeof v === 'object' && !(v instanceof Date)) v = '';
      a[c - 1] = v == null ? '' : v;
    });
    out[r - 1] = a;
  });
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
  return out.map((r) => Array.from(r, (v) => (v === undefined ? '' : v)));
}

/**
 * Cột `Tổng tồn` (H) của file .xlsx là công thức `=I−J` và ExcelJS không có sẵn kết quả đã tính
 * (file do Google Sheets xuất ra không kèm cache). Tính lại đúng công thức đó để fixture có tồn thật
 * — thiếu tồn thì quy tắc chọn lô (Context 6.4) không chạy và bài so hai đường mất phần khó nhất.
 */
function buTonKho(bang) {
  let bu = 0;
  for (let r = 2; r < bang.length; r++) {
    const h = bang[r];
    if (!h || !h[3]) continue;
    if (h[7] !== '' && h[7] != null) continue;
    const nhap = Number(h[8]), xuat = Number(h[9]);
    if (h[8] === '' || isNaN(nhap)) continue;
    h[7] = nhap - (h[9] === '' || isNaN(xuat) ? 0 : xuat);
    bu++;
  }
  return { bang, bu };
}

// ==================================================================== dựng file tháng giả

/** Ba dòng cũ có sẵn trong sheet gian hàng trước khi tool chạy — để kiểm "chỉ nối, không sửa dòng cũ". */
const DONG_CU_CO_SAN = [
  { ma: '2608310000AAAA', tvt: 'gvs km 1', sl: 1, h: 100000, i: 0, j: 2000, k: 1500 },
  { ma: '2608310000BBBB', tvt: 'gvs km 1', sl: 2, h: 200000, i: 5000, j: 3000, k: 3000 }
];

function dungSim(tonKho, mapping, maDaCoSan) {
  const sim = gl.taoGiaLap({ ngay: NGAY_MAY_CHU_GOOGLE });
  const ss = sim.khaiThang(THANG, 'KINH DOANH T9-2026');
  const cu = DONG_CU_CO_SAN.concat(
    maDaCoSan ? [{ ma: maDaCoSan, tvt: 'gvs km 1', sl: 1, h: 111111, i: 0, j: 0, k: 0 }] : []);
  gl.dungSheetGianHang(ss, TEN_SHEET, cu);
  gl.dungSheetDanhMuc(ss, tonKho);
  gl.dungSheetMapping(ss, mapping);
  return sim;
}

/** Chép kho ô 'r:c' → giá trị; ô ngày đánh dấu 'NGAY:<ms>' để không lẫn với ô văn bản. */
function chupO(kho) {
  const o = {};
  Object.keys(kho).forEach((k) => {
    const v = kho[k];
    o[k] = (v instanceof Date) ? 'NGAY:' + v.getTime() : v;
  });
  return o;
}

/** Ảnh chụp TOÀN BỘ ô của file tháng: giá trị, công thức, định dạng số, màu nền, cụm ô gộp. */
function anhChupDay(sim) {
  const ss = sim.soLinkThang[THANG];
  const anh = {};
  ss.sheets.forEach((sh) => {
    anh[sh.ten] = {
      // Ô giá trị là vô hướng ('r:c' → giá trị), nên chép nông là đủ. KHÔNG dùng JSON.stringify kèm
      // replacer: `Date.prototype.toJSON` chạy TRƯỚC replacer nên `v instanceof Date` không bao giờ
      // đúng, và một ô ngày thật sẽ lẫn với một ô chuỗi ISO — đúng thứ cột A phải phân biệt được.
      giaTri: chupO(sh.giaTri),
      congThuc: Object.assign({}, sh.congThuc),
      dinhDang: Object.assign({}, sh.dinhDang),
      nen: Object.assign({}, sh.nen),
      gopO: JSON.parse(JSON.stringify(sh.gopO)),
      dongCuoi: sh.getLastRow()
    };
  });
  return anh;
}

/**
 * So hai ảnh chụp, trả danh sách ô lệch.
 * Ô TRỐNG là ô trống: `''`, `null` và "chưa từng được ghi" hiển thị y hệt nhau trên Google Sheet, nên
 * quy về một. Nếu không quy, một khối ghi có ghi chú (viết cả cột Note, phần lớn là chuỗi rỗng) sẽ bị
 * coi là khác một khối không có ghi chú nào (không viết cột Note) — khác trong bộ nhớ, giống trên màn hình.
 */
function soAnh(a, b) {
  const khac = [];
  // '#ffffff' cũng là "không tô": `ghiMotSheet_` đọc nền cả khối rồi ghi lại, nên ô không vàng bị ghi
  // đè đúng màu trắng cũ của nó. Khối này có dòng vàng, khối kia không, thế là một bên có '#ffffff'
  // còn bên kia chưa từng được ghi — khác trong bộ nhớ, giống hệt nhau trên màn hình.
  const trong = (v) => (v === undefined || v === null || v === '' ||
    String(v).toLowerCase() === '#ffffff' ? null : v);
  const tenSheet = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
  tenSheet.forEach((t) => {
    const x = (a && a[t]) || {}, y = (b && b[t]) || {};
    ['giaTri', 'congThuc', 'dinhDang', 'nen'].forEach((loai) => {
      const kx = x[loai] || {}, ky = y[loai] || {};
      const khoa = new Set(Object.keys(kx).concat(Object.keys(ky)));
      khoa.forEach((o) => {
        const p = trong(kx[o]), q = trong(ky[o]);
        if (JSON.stringify(p) !== JSON.stringify(q)) khac.push({ sheet: t, loai, o, a: kx[o], b: ky[o] });
      });
    });
    const gx = JSON.stringify((x.gopO || []).slice().sort(sapO));
    const gy = JSON.stringify((y.gopO || []).slice().sort(sapO));
    if (gx !== gy) khac.push({ sheet: t, loai: 'gopO', o: '(cụm ô gộp)', a: gx.length, b: gy.length });
    if (x.dongCuoi !== y.dongCuoi) khac.push({ sheet: t, loai: 'dongCuoi', o: '(dòng cuối)', a: x.dongCuoi, b: y.dongCuoi });
  });
  return khac;
}
function sapO(u, v) { return (u.r1 - v.r1) || (u.c1 - v.c1) || (u.r2 - v.r2); }

/** Đọc lại sheet gian hàng thành bảng đơn để in bảng đối chiếu bằng SỐ THẬT. */
function docDonDaGhi(sim) {
  const sh = sim.soLinkThang[THANG].getSheetByName(TEN_SHEET);
  const het = sh.getLastRow();
  const don = [], theoMa = {};
  let maHienTai = null;
  for (let r = 4; r <= het; r++) {
    const o = (c) => { const v = sh.giaTri[r + ':' + c]; return v === undefined ? '' : v; };
    const ma = String(o(3) || '').trim();
    if (ma) {
      maHienTai = ma;
      theoMa[ma] = { maDon: ma, dong: 4, H: so(o(8)), I: so(o(9)), J: so(o(10)), K: so(o(11)), D: [], SL: [], note: [], vang: 0 };
      theoMa[ma].dong = r;
      don.push(theoMa[ma]);
    }
    if (!maHienTai) continue;
    const d = theoMa[maHienTai];
    d.D.push(String(o(4) || ''));
    d.SL.push(o(7) === '' ? '' : Number(o(7)));
    const cNote = 16;
    d.note.push(String(o(cNote) || ''));
    if (String(sh.nen[r + ':1'] || '').toUpperCase() === '#FFF2CC') d.vang++;
  }
  return don;
}
function so(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function tong(don, truong) { let t = 0; don.forEach((d) => { t += d[truong] || 0; }); return t; }

function inBang(cot, hang) {
  const rong = cot.map((c, i) => Math.max(String(c).length, ...hang.map((h) => String(h[i]).length)));
  const dong = (h) => '  ' + h.map((v, i) => (i === 0 ? String(v).padEnd(rong[i]) : String(v).padStart(rong[i]))).join('  ');
  console.log(dong(cot));
  console.log('  ' + rong.map((n) => '-'.repeat(n)).join('  '));
  hang.forEach((h) => console.log(dong(h)));
}

// ==================================================================== chạy

(async function main() {
  console.log('=== BẰNG CHỨNG CHUYỂN LỚP 2 + LỚP 3 SANG APPS SCRIPT (bản ' + PHIEN_BAN + ') ===\n');

  for (const k of Object.keys(GOC)) {
    if (!fs.existsSync(GOC[k])) {
      console.log('HỎNG  thiếu file dữ liệu thật: ' + GOC[k]);
      process.exit(1);
    }
  }
  const bamGoc = {};
  Object.keys(GOC).forEach((k) => { bamGoc[k] = bam(GOC[k]); });

  // Chép ra thư mục tạm rồi đọc bản chép — bản gốc trong 00_DAU_VAO và 01_TAI_LIEU không bao giờ bị mở để ghi.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-xuly-'));
  const chep = {};
  Object.keys(GOC).forEach((k) => { chep[k] = path.join(tmp, k + '.xlsx'); fs.copyFileSync(GOC[k], chep[k]); });

  const lop = napLoi();
  const cfg = lop.Config.tao();

  // Xem chú thích đầu file: tái lập phạm vi toàn cục dùng chung của Apps Script.
  global.DanhMuc = lop.DanhMuc;
  global.MapListing = lop.MapListing;
  global.Normalize = lop.Normalize;

  const bTon = buTonKho(await docHienThi(chep.tracking, 'Tổng tồn kho'));
  const tonKho = bTon.bang;
  const mapping = await docHienThi(chep.mapping, 'Mapping sản phẩm');
  const bangXuat = await docHienThi(chep.xuat, 'orders');

  const a1 = lop.AdapterFileXuat.doc(bangXuat,
    { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'Order.all.20260807_20260906.xlsx' }, cfg);
  const cacFile = [{ maGianHang: 'SP_MALL', tenFile: 'Order.all.20260807_20260906.xlsx', dong: a1.dong }];
  const maDon = {};
  a1.dong.forEach((d) => { maDon[d.maDonSan] = 1; });
  const maDaCoSan = a1.dong[0].maDonSan;      // đơn đầu tiên đã nằm sẵn trên sheet → phải bị bỏ qua

  console.log('DỮ LIỆU VÀO (thật, chép ra thư mục tạm — bản gốc chỉ đọc)');
  console.log('  file xuất Shopee : Order.all.20260807_20260906.xlsx · tab "' + a1.loaiFile + '" · ' +
    bangXuat.length + ' dòng thô');
  console.log('  qua lớp 1        : ' + a1.dong.length + ' dòng hàng · ' + Object.keys(maDon).length +
    ' đơn · bỏ ' + a1.soDonBoQua + ' đơn hủy/hoàn');
  console.log('  Mapping NT1      : ' + (mapping.length - 1) + ' dòng');
  console.log('  Tổng tồn kho     : ' + (tonKho.length - 2) + ' dòng · tính lại tồn cho ' + bTon.bu + ' dòng');
  console.log('  đã có sẵn trên sheet: ' + (DONG_CU_CO_SAN.length + 1) + ' dòng, trong đó đơn ' + maDaCoSan +
    ' trùng với file xuất\n');

  /** Chạy trọn một đường trên một file tháng mới tinh, trả ảnh chụp + thống kê. */
  async function chay(duong, them) {
    const sim = dungSim(JSON.parse(JSON.stringify(tonKho)), JSON.parse(JSON.stringify(mapping)), maDaCoSan);
    const t0 = Date.now();
    let kq = null, loi = null;
    try {
      kq = await chayLenGoogleSheet(Object.assign({
        lop, cfg, cacFile, thoiDiem: THOI_DIEM,
        cauHinhGoogle: sim.cauHinhMay({ duong }),
        in: () => { }
      }, them || {}));
    } catch (e) { loi = e; }
    const kt = {
      kq, loi, ms: Date.now() - t0,
      anh: anhChupDay(sim),
      don: docDonDaGhi(sim),
      soGoi: sim.nhatKyGoi.length,
      goi: sim.nhatKyGoi.slice(),
      chuoiDaIn: sim.moiChuoiDaIn().join('\n'),
      dongCuoi: sim.soLinkThang[THANG].getSheetByName(TEN_SHEET).getLastRow()
    };
    sim.thaoGo();
    return kt;
  }

  // ---------------------------------------------------------------- 1. HAI ĐƯỜNG, TỪNG Ô
  console.log('--- 1. Hai đường, cùng dữ liệu vào, so TỪNG Ô ---');
  const A = await chay('ghi');
  const B = await chay('xuLy');
  if (A.loi) throw A.loi;
  if (B.loi) throw B.loi;

  const donA = A.don.filter((d) => d.maDon !== maDaCoSan && !/^26083100/.test(d.maDon));
  const donB = B.don.filter((d) => d.maDon !== maDaCoSan && !/^26083100/.test(d.maDon));
  const oLech = soAnh(A.anh, B.anh);

  const lechTien = [];
  const chiMucB = {};
  donB.forEach((d) => { chiMucB[d.maDon] = d; });
  donA.forEach((d) => {
    const e = chiMucB[d.maDon];
    if (!e) { lechTien.push(d.maDon + ' không có ở đường xuLy'); return; }
    ['H', 'I', 'J', 'K'].forEach((c) => { if (d[c] !== e[c]) lechTien.push(d.maDon + ' cột ' + c); });
    if (JSON.stringify(d.D) !== JSON.stringify(e.D)) lechTien.push(d.maDon + ' cột D');
    if (JSON.stringify(d.SL) !== JSON.stringify(e.SL)) lechTien.push(d.maDon + ' cột G');
    if (JSON.stringify(d.note) !== JSON.stringify(e.note)) lechTien.push(d.maDon + ' cột Note');
  });

  console.log('\nBẢNG ĐỐI CHIẾU — số thật, không phải chữ "OK"\n');
  inBang(['Chỉ tiêu', "đường 'ghi' (cũ)", "đường 'xuLy' (mới)", 'lệch'], [
    ['đơn ghi thêm', A.kq.thongKe.donGhi, B.kq.thongKe.donGhi, B.kq.thongKe.donGhi - A.kq.thongKe.donGhi],
    ['đơn bỏ vì đã có', A.kq.thongKe.donDaCo, B.kq.thongKe.donDaCo, B.kq.thongKe.donDaCo - A.kq.thongKe.donDaCo],
    ['dòng hàng ghi', A.kq.thongKe.dongGhi, B.kq.thongKe.dongGhi, B.kq.thongKe.dongGhi - A.kq.thongKe.dongGhi],
    ['dòng vàng', A.kq.thongKe.dongVang, B.kq.thongKe.dongVang, B.kq.thongKe.dongVang - A.kq.thongKe.dongVang],
    ['đơn gộp ô', A.kq.thongKe.donGopO, B.kq.thongKe.donGopO, B.kq.thongKe.donGopO - A.kq.thongKe.donGopO],
    ['tên hàng mới', A.kq.thongKe.tenMoi, B.kq.thongKe.tenMoi, B.kq.thongKe.tenMoi - A.kq.thongKe.tenMoi],
    ['dòng Mapping nối thêm', A.kq.thongKe.mappingThem, B.kq.thongKe.mappingThem, B.kq.thongKe.mappingThem - A.kq.thongKe.mappingThem],
    ['dòng cuối sheet sau khi ghi', A.dongCuoi, B.dongCuoi, B.dongCuoi - A.dongCuoi],
    ['Σ cột H (tổng tiền SP)', tong(donA, 'H'), tong(donB, 'H'), tong(donB, 'H') - tong(donA, 'H')],
    ['Σ cột I (MGG shop)', tong(donA, 'I'), tong(donB, 'I'), tong(donB, 'I') - tong(donA, 'I')],
    ['Σ cột J (chi phí sàn)', tong(donA, 'J'), tong(donB, 'J'), tong(donB, 'J') - tong(donA, 'J')],
    ['Σ cột K (thuế)', tong(donA, 'K'), tong(donB, 'K'), tong(donB, 'K') - tong(donA, 'K')],
    ['số câu cảnh báo', A.kq.canhBao.length, B.kq.canhBao.length, B.kq.canhBao.length - A.kq.canhBao.length],
    ['số gói POST', A.soGoi, B.soGoi, B.soGoi - A.soGoi],
    ['thời gian (ms)', A.ms, B.ms, B.ms - A.ms]
  ]);
  console.log('\n  Ô LỆCH GIỮA HAI FILE THÁNG (giá trị + công thức + định dạng số + màu nền + ô gộp): ' + oLech.length);
  if (oLech.length) console.log('  ' + oLech.slice(0, 10).map((x) => JSON.stringify(x)).join('\n  '));
  console.log('  ĐƠN LỆCH TIỀN / TÊN VIẾT TẮT / SL / NOTE: ' + lechTien.length);
  if (lechTien.length) console.log('  ' + lechTien.slice(0, 10).join('\n  '));
  console.log('');

  test('T-XL-01 hai đường ghi ĐÚNG CÙNG một danh sách mã đơn', () => {
    bang(donB.map((d) => d.maDon), donA.map((d) => d.maDon), 'danh sách mã đơn theo thứ tự ghi');
    dung(donA.length > 300, 'phép so chỉ có nghĩa khi ghi vài trăm đơn, thực tế ' + donA.length);
  });
  test('T-XL-02 hai đường ghi ĐÚNG CÙNG bốn cột tiền H, I, J, K cho từng đơn', () => {
    bang(lechTien.length, 0, 'số chỗ lệch tiền/D/G/Note');
    dung(tong(donA, 'H') > 0, 'Σ H phải khác 0');
  });
  test('T-XL-03 hai file tháng giống nhau TỚI TỪNG Ô (giá trị, công thức, định dạng, màu nền, ô gộp)', () => {
    bang(oLech.length, 0, 'số ô lệch');
  });
  test('T-XL-04 bộ thống kê trả về giống hệt nhau', () => {
    ['donGhi', 'donDaCo', 'dongGhi', 'dongVang', 'donGopO', 'tenMoi', 'mappingThem'].forEach((k) => {
      bang(B.kq.thongKe[k], A.kq.thongKe[k], 'thongKe.' + k);
    });
  });
  test('T-XL-05 cùng số câu cảnh báo và cùng nội dung', () => {
    bang(B.kq.canhBao.slice().sort(), A.kq.canhBao.slice().sort(), 'danh sách cảnh báo');
  });
  test('T-XL-06 đường xuLy chỉ gọi mạng MỘT lượt cho mỗi lô (đường cũ phải hai lượt: doc rồi ghi)', () => {
    const hdB = B.goi.map((g) => g.hanhDong);
    dung(hdB.indexOf('doc') < 0, 'xuLy không được cần hành động doc, đang có: ' + hdB.join(','));
    dung(A.goi.map((g) => g.hanhDong).indexOf('doc') >= 0, 'đường cũ phải còn gọi doc');
  });

  // ---------------------------------------------------------------- 2. INV-4
  console.log('\n--- 2. Dữ liệu người mua không rời khỏi máy (INV-4) ---');

  test('T-XL-07 gói thật KHÔNG chứa cột thông tin người mua nào (soát cả tên trường lẫn giá trị)', () => {
    bang(kiemPII({ hanhDong: 'xuLy', thang: THANG, cacFile }, cfg.cotPII), true);
  });

  cfg.cotPII.forEach((cot, i) => {
    test('T-XL-08.' + (i + 1) + ' bơm cột "' + cot + '" vào gói → TỪ CHỐI GỬI', () => {
      const ban = JSON.parse(JSON.stringify({ cacFile: [{ maGianHang: 'SP_MALL', tenFile: 'x.xlsx', dong: [cacFile[0].dong[0]] }] }));
      ban.cacFile[0].dong[0][cot] = 'giá trị bất kỳ';
      ban.hanhDong = 'xuLy';
      let loi = null;
      try { kiemPII(ban, cfg.cotPII); } catch (e) { loi = e.message; }
      dung(loi, 'phải ném lỗi khi gói mang cột "' + cot + '"');
      dung(loi.indexOf(cot) >= 0, 'câu báo lỗi phải nêu TÊN CỘT');
      dung(loi.indexOf('giá trị bất kỳ') < 0, 'câu báo lỗi KHÔNG được in giá trị của ô PII');
    });
  });

  test('T-XL-09 trường lạ ngoài lược đồ lớp 1 cũng bị chặn (danh sách trắng, không chỉ danh sách đen)', () => {
    const ban = { hanhDong: 'xuLy', cacFile: [{ maGianHang: 'SP_MALL', tenFile: 'x', dong: [Object.assign({}, cacFile[0].dong[0], { emailNguoiMua: 'a@b.c' })] }] };
    let loi = null;
    try { kiemPII(ban, cfg.cotPII); } catch (e) { loi = e.message; }
    dung(loi && loi.indexOf('emailNguoiMua') >= 0, 'phải chặn trường lạ, được: ' + loi);
  });

  test('T-XL-10 chuỗi trông như số điện thoại trong bất kỳ giá trị nào cũng bị chặn', () => {
    const d = Object.assign({}, cacFile[0].dong[0], { tenListing: 'Giao gấp 0912345678' });
    let loi = null;
    try { kiemPII({ hanhDong: 'xuLy', cacFile: [{ maGianHang: 'SP_MALL', tenFile: 'x', dong: [d] }] }, cfg.cotPII); } catch (e) { loi = e.message; }
    dung(loi && loi.indexOf('tenListing') >= 0, 'phải chặn số điện thoại trong tenListing, được: ' + loi);
    dung(loi.indexOf('0912345678') < 0, 'câu báo lỗi KHÔNG được in lại số điện thoại');
  });

  test('T-XL-11 mã đơn 14 chữ số KHÔNG bị nhầm thành số điện thoại (chặn nhầm là dừng cả lượt chạy)', () => {
    const d = Object.assign({}, cacFile[0].dong[0], { maDonSan: '02601234567890' });
    bang(kiemPII({ hanhDong: 'xuLy', cacFile: [{ maGianHang: 'SP_MALL', tenFile: 'x', dong: [d] }] }, cfg.cotPII), true);
  });

  test('T-XL-12 thiếu danh sách cotPII → TỪ CHỐI GỬI, không im lặng bỏ qua phép soát', () => {
    let loi = null;
    try { kiemPII({ hanhDong: 'xuLy', cacFile: [] }, null); } catch (e) { loi = e.message; }
    dung(loi && loi.indexOf('INV-4') >= 0, 'phải nói rõ đang bỏ sót INV-4, được: ' + loi);
  });

  {
    const sim = dungSim(JSON.parse(JSON.stringify(tonKho)), JSON.parse(JSON.stringify(mapping)), null);
    const ban = [{
      maGianHang: 'SP_MALL', tenFile: 'ban.xlsx',
      dong: cacFile[0].dong.slice(0, 3).map((d) => Object.assign({}, d, { 'Số điện thoại': '0912345678' }))
    }];
    const web = new WebAppGoogleSheet(sim.cauHinhMay({ duong: 'xuLy', cotPII: cfg.cotPII }));
    const loi = await nemLoiAsync(() => web.xuLy(THANG, ban, { sheetCuaGian: () => TEN_SHEET }));
    const anhSau = anhChupDay(sim);
    const goiGhi = sim.nhatKyGoi.filter((g) => g.hanhDong === 'xuLy' || g.hanhDong === 'ghi');
    sim.thaoGo();
    test('T-XL-13 gói bẩn thì KHÔNG một byte nào ra khỏi máy', () => {
      dung(loi.indexOf('INV-4') >= 0, 'phải là lỗi INV-4, được: ' + loi);
      bang(goiGhi.length, 0, 'số gói ghi đã tới Web App');
      bang(anhSau[TEN_SHEET].dongCuoi, 5, 'dòng cuối sheet phải giữ nguyên (3 tiêu đề + 2 dòng cũ)');
      dung(loi.indexOf('0912345678') < 0, 'câu báo lỗi không được in số điện thoại');
    });
  }

  // ---------------------------------------------------------------- 3. Giới hạn 6 phút
  console.log('\n--- 3. Giới hạn 6 phút: chia lô ở máy, xem đồng hồ ở Apps Script ---');

  const vo = napVoGoogle(lop);
  test('T-XL-14 ngưỡng tự dừng nằm dưới quota 360 giây và chừa đủ chỗ cho flush', () => {
    dung(vo.NGUONG_GIAY_XU_LY <= 300, 'ngưỡng ' + vo.NGUONG_GIAY_XU_LY + 's quá sát quota 360s');
    dung(vo.NGUONG_GIAY_XU_LY >= 120, 'ngưỡng ' + vo.NGUONG_GIAY_XU_LY + 's quá nhỏ, tốn lượt gọi vô ích');
    dung(vo.TOI_DA_DON_MOT_KHOI < vo.TOI_DA_DON_MOT_LO, 'khối ghi phải nhỏ hơn lô, nếu không thì không có chỗ xem đồng hồ');
  });

  test('T-XL-15 chia lô KHÔNG BAO GIỜ cắt ngang một đơn', () => {
    [1, 7, 50, 200].forEach((n) => {
      const lo = chiaLoTheoDon(cacFile, n, () => TEN_SHEET);
      const thay = {};
      lo.forEach((mot, i) => mot.forEach((f) => f.dong.forEach((d) => {
        if (thay[d.maDonSan] != null && thay[d.maDonSan] !== i)
          throw new Error('lô ' + n + ' đơn/lô: đơn ' + d.maDonSan + ' bị xẻ sang hai lô');
        thay[d.maDonSan] = i;
      })));
      let tongDong = 0;
      lo.forEach((mot) => mot.forEach((f) => { tongDong += f.dong.length; }));
      bang(tongDong, cacFile[0].dong.length, 'lô ' + n + ' đơn/lô: tổng số dòng phải giữ nguyên');
    });
  });

  test('T-XL-16 lô mặc định của xuLy là 200 đơn — bằng lô của đường ghi', () => {
    bang(TOI_DA_DON_MOT_LO_XU_LY, 200);
    bang(chiaLoTheoDon(cacFile, TOI_DA_DON_MOT_LO_XU_LY, () => TEN_SHEET).length, 3,
      '402 đơn / 200 = 3 lô');
  });

  // Ép ngưỡng 0 giây: Web App ghi đúng một khối rồi dừng gọn ở mỗi lượt.
  const C = await chay('xuLy', { nguongGiay: 0 });
  if (C.loi) throw C.loi;
  const oLechC = soAnh(B.anh, C.anh);
  console.log('\n  Ép ngưỡng 0 giây (Web App dừng sau MỖI khối 100 đơn):');
  inBang(['Chỉ tiêu', 'chạy một hơi', 'bị cắt liên tục', 'lệch'], [
    ['số lượt gọi xuLy', B.soGoi - 1, C.soGoi - 1, (C.soGoi - 1) - (B.soGoi - 1)],
    ['đơn ghi thêm', B.kq.thongKe.donGhi, C.kq.thongKe.donGhi, C.kq.thongKe.donGhi - B.kq.thongKe.donGhi],
    ['đơn bỏ vì đã có', B.kq.thongKe.donDaCo, C.kq.thongKe.donDaCo, C.kq.thongKe.donDaCo - B.kq.thongKe.donDaCo],
    ['dòng hàng ghi', B.kq.thongKe.dongGhi, C.kq.thongKe.dongGhi, C.kq.thongKe.dongGhi - B.kq.thongKe.dongGhi],
    ['dòng cuối sheet', B.dongCuoi, C.dongCuoi, C.dongCuoi - B.dongCuoi],
    ['ô lệch so với chạy một hơi', 0, oLechC.length, oLechC.length]
  ]);
  if (oLechC.length) console.log('  ' + oLechC.slice(0, 8).map((x) => JSON.stringify(x)).join('\n  '));

  test('T-XL-17 bị cắt giữa chừng vẫn ghi ĐÚNG chừng ấy đơn, không thiếu không thừa', () => {
    bang(C.kq.thongKe.donGhi, B.kq.thongKe.donGhi, 'số đơn ghi khi bị cắt liên tục');
    bang(C.dongCuoi, B.dongCuoi, 'dòng cuối sheet');
  });
  test('T-XL-18 bị cắt giữa chừng KHÔNG sinh đơn trùng (khử trùng hai tầng làm việc)', () => {
    const dem = {};
    C.don.forEach((d) => { dem[d.maDon] = (dem[d.maDon] || 0) + 1; });
    const trung = Object.keys(dem).filter((m) => dem[m] > 1);
    bang(trung, [], 'mã đơn xuất hiện nhiều hơn một lần');
    dung(C.kq.thongKe.donDaCo > B.kq.thongKe.donDaCo,
      'lượt gọi lại PHẢI gặp lại các đơn đã ghi và bỏ qua chúng — đó là bằng chứng tầng khử trùng chạy');
  });
  test('T-XL-19 bị cắt giữa chừng cho ra file tháng giống hệt lần chạy một hơi', () => {
    bang(oLechC.length, 0, 'số ô lệch');
  });

  // ---------------------------------------------------------------- 4. Phiên bản, hai tầng khử trùng, đường lùi
  console.log('\n--- 4. Phiên bản · khử trùng hai tầng · chọn đường ---');

  test('T-XL-20 PHIEN_BAN hai vỏ bằng nhau (lệch là tool tự chặn chính mình)', () => {
    bang(vo.PHIEN_BAN, PHIEN_BAN);
  });

  {
    const sim = dungSim(JSON.parse(JSON.stringify(tonKho)), JSON.parse(JSON.stringify(mapping)), null);
    const kq = sim.vo.doPost({
      postData: {
        contents: JSON.stringify({
          token: sim.biMat, hanhDong: 'xuLy', phienBanMongDoi: '9.9.9', thang: THANG, cacFile: []
        })
      }
    });
    const o = JSON.parse(kq.getContent());
    const anh = anhChupDay(sim);
    sim.thaoGo();
    test('T-XL-21 lệch phiên bản → xuLy TỪ CHỐI, đúng nguyên văn câu của hành động ghi', () => {
      dung(!o.ok, 'phải từ chối');
      bang(o.loi, 'LECH_PHIEN_BAN');
      bang(o.thongBao, vo.thongBaoLechPhienBan_(PHIEN_BAN, '9.9.9'));
      bang(anh[TEN_SHEET].dongCuoi, 5, 'lệch bản mà vẫn ghi được ô nào là hỏng');
    });
  }

  {
    // Web App bản CŨ chưa biết hành động 'xuLy' → trả HANH_DONG_LA. Máy phải nói thẳng việc phải làm.
    const sim = dungSim(JSON.parse(JSON.stringify(tonKho)), JSON.parse(JSON.stringify(mapping)), null);
    sim.datLoi({ lechPhienBan: { kieu: 'HANH_DONG_LA' } });
    const web = new WebAppGoogleSheet(sim.cauHinhMay({ duong: 'xuLy', cotPII: cfg.cotPII }));
    const loi = await nemLoiAsync(() => web.xuLy(THANG, cacFile, { sheetCuaGian: () => TEN_SHEET }));
    sim.thaoGo();
    test('T-XL-22 Web App bản cũ (chưa có xuLy) → báo đúng việc phải làm, không im lặng coi như đã ghi', () => {
      dung(loi.indexOf('HANH_DONG_LA') >= 0 || loi.indexOf('Deploy') >= 0,
        'câu báo phải dẫn tới việc Deploy lại, được: ' + loi);
    });
  }

  test('T-XL-23 tầng 1 (ngoài khóa) và tầng 2 (trong khóa) đều còn nguyên trong đường xuLy', () => {
    const ma = fs.readFileSync(path.join(ROOT, 'src', 'ShellAppsScript.gs'), 'utf8');
    dung(/hanhDongXuLy_[\s\S]*?docTuXa_\(/.test(ma), 'xuLy phải đọc mã đơn đã có TRƯỚC khi lấy khóa (tầng 1)');
    const than = ma.slice(ma.indexOf('function hanhDongXuLy_'));
    dung(than.indexOf('LockService.getScriptLock') < than.indexOf('ghiMotSheet_'),
      'lệnh ghi phải nằm TRONG LockService (tầng 2)');
    dung(than.indexOf('dungKeHoachGhi_') < than.indexOf('LockService.getScriptLock'),
      'lớp 2 phải chạy TRƯỚC khi lấy khóa — giữ khóa suốt lúc tính là chặn máy khác vô ích');
  });

  test('T-XL-24 khóa cấu hình chọn đường: mặc định xuLy, "ghi" là đường lùi', () => {
    bang(chuanDuong(undefined), 'xuLy');
    bang(chuanDuong(''), 'xuLy');
    bang(chuanDuong('linh tinh'), 'xuLy');
    bang(chuanDuong('ghi'), 'ghi');
    bang(chuanDuong('GHI'), 'ghi');
    bang(new WebAppGoogleSheet({ bat: false }).duong, 'xuLy');
    bang(new WebAppGoogleSheet({ bat: false, duong: 'ghi' }).duong, 'ghi');
    bang(A.kq.duong, 'ghi');
    bang(B.kq.duong, 'xuLy');
  });

  test('T-XL-25 hai bản lenhTuDon (Node ↔ Apps Script) cho ra y hệt nhau', () => {
    const donThu = [{
      maDon: '2609010000ZZZZ', tien: { H: 305000, I: 5000, J: 12345, K: 4500 },
      dong: [{ tenVietTat: 'gvs km 1', soLuong: 2, lyDo: null, ghiChu: '' },
      { tenVietTat: '', soLuong: 1, lyDo: 'TEN_MOI', ghiChu: 'tên hàng mới' }]
    }];
    bang(vo.lenhTuDon_(TEN_SHEET, donThu, '2026-09-08'), lenhTuDon(TEN_SHEET, donThu, '2026-09-08'));
  });

  test('T-XL-26 ngày ghi mặc định bằng ngày chạy — trước 2.4.0 cột A bị bỏ TRỐNG khi không có --ngay', () => {
    bang(ngayCua(THOI_DIEM), '2026-09-08');
    const sh = B.anh[TEN_SHEET];
    const oA = sh.giaTri['7:1'];
    dung(oA && String(oA).indexOf('NGAY:') === 0, 'ô A7 phải là một ngày thật, đang là ' + JSON.stringify(oA));
  });

  test('T-XL-27 INV-3: không đường nào chạm cột E, F, M, N', () => {
    [['ghi', A], ['xuLy', B]].forEach(([ten, kt]) => {
      const sh = kt.anh[TEN_SHEET];
      ['giaTri', 'congThuc'].forEach((loai) => {
        Object.keys(sh[loai]).forEach((o) => {
          const [r, c] = o.split(':').map(Number);
          if (r < 4) return;                                   // dòng 1-3 là tiêu đề và dòng tổng, do fixture dựng
          if ([5, 6, 13, 14].indexOf(c) < 0) return;
          // ô do fixture dựng sẵn ở các dòng cũ thì không tính; chỉ soi vùng tool vừa nối
          if (r <= 6) return;
          throw new Error('đường ' + ten + ' đã ghi vào ' + o + ' (cột ' + c + ')');
        });
      });
    });
  });

  test('T-XL-28 INV-7: không đường nào in chuỗi bí mật hay mật khẩu gian hàng ra ngoài', () => {
    [['ghi', A], ['xuLy', B], ['xuLy-cắt', C]].forEach(([ten, kt]) => {
      dung(kt.chuoiDaIn.indexOf('BI-MAT-GIA-LAP-KEODON') < 0, 'đường ' + ten + ' lộ chuỗi bí mật');
      dung(kt.chuoiDaIn.indexOf('MAT-KHAU-GIAN-HANG') < 0, 'đường ' + ten + ' lộ mật khẩu gian hàng');
      dung(kt.chuoiDaIn.indexOf('TEN-DANG-NHAP') < 0, 'đường ' + ten + ' lộ tên đăng nhập');
    });
  });

  test('T-XL-29 INV-5: ba file dữ liệu gốc không bị đụng tới', () => {
    Object.keys(GOC).forEach((k) => bang(bam(GOC[k]), bamGoc[k], 'băm file ' + path.basename(GOC[k])));
  });

  test('T-XL-30 INV-1: hai dòng cũ có sẵn không bị sửa, số dòng chỉ tăng', () => {
    [['ghi', A], ['xuLy', B]].forEach(([ten, kt]) => {
      const sh = kt.anh[TEN_SHEET];
      bang(sh.giaTri['4:3'], DONG_CU_CO_SAN[0].ma, 'đường ' + ten + ': mã đơn dòng 4');
      bang(sh.giaTri['5:3'], DONG_CU_CO_SAN[1].ma, 'đường ' + ten + ': mã đơn dòng 5');
      bang(sh.giaTri['5:9'], DONG_CU_CO_SAN[1].i, 'đường ' + ten + ': cột I dòng 5');
      dung(sh.dongCuoi > 6, 'đường ' + ten + ': số dòng phải tăng');
    });
  });

  {
    // Máy ghi đè thuế trong CAU_HINH_VAN_HANH.json: trên đường xuLy phần ghi đè KHÔNG có tác dụng
    // (lớp 2 chạy bằng cấu hình đã Deploy). Tool phải KÊU LÊN chứ không im lặng bỏ qua.
    const cfgGhiDe = lop.Config.tao({ chung: { thue_gtgt_pct: 2 } });
    const sim = dungSim(JSON.parse(JSON.stringify(tonKho)), JSON.parse(JSON.stringify(mapping)), maDaCoSan);
    const kq = await chayLenGoogleSheet({
      lop, cfg: cfgGhiDe, cacFile, thoiDiem: THOI_DIEM,
      cauHinhGoogle: sim.cauHinhMay({ duong: 'xuLy' }), in: () => { }
    });
    const donGhiDe = docDonDaGhi(sim).filter((d) => d.maDon !== maDaCoSan && !/^26083100/.test(d.maDon));
    sim.thaoGo();
    test('T-XL-32 máy ghi đè cấu hình lớp 2 → tool kêu lên, và số thuế vẫn theo bản đã Deploy', () => {
      const co = kq.canhBao.filter((c) => c.indexOf('KHÔNG có tác dụng') >= 0);
      bang(co.length, 1, 'phải có đúng một câu cảnh báo ghi đè cấu hình');
      dung(co[0].indexOf('chung') >= 0, 'câu cảnh báo phải nêu nhóm bị ghi đè');
      dung(co[0].indexOf('duong = "ghi"') >= 0, 'phải chỉ ra đường lùi');
      bang(tong(donGhiDe, 'K'), tong(donB, 'K'),
        'Σ thuế phải bằng bản Deploy (1%+0,5%), không phải bản máy ghi đè 2%');
    });
  }

  // Bấm chạy LẦN HAI trên đúng file tháng vừa ghi — tiêu chí nghiệm thu giai đoạn 2.
  {
    const sim = dungSim(JSON.parse(JSON.stringify(tonKho)), JSON.parse(JSON.stringify(mapping)), maDaCoSan);
    const chung = { lop, cfg, cacFile, thoiDiem: THOI_DIEM, cauHinhGoogle: sim.cauHinhMay({ duong: 'xuLy' }), in: () => { } };
    const lan1 = await chayLenGoogleSheet(chung);
    const anh1 = anhChupDay(sim);
    const lan2 = await chayLenGoogleSheet(chung);
    const anh2 = anhChupDay(sim);
    const lechLan2 = soAnh(anh1, anh2);
    sim.thaoGo();
    console.log('\n  Bấm chạy lần hai trên đúng file vừa ghi:');
    inBang(['Chỉ tiêu', 'lần 1', 'lần 2'], [
      ['đơn ghi thêm', lan1.thongKe.donGhi, lan2.thongKe.donGhi],
      ['đơn bỏ vì đã có', lan1.thongKe.donDaCo, lan2.thongKe.donDaCo],
      ['dòng Mapping nối thêm', lan1.thongKe.mappingThem, lan2.thongKe.mappingThem],
      ['ô đổi so với sau lần 1', 0, lechLan2.length]
    ]);
    test('T-XL-31 chạy lần hai ra 0 đơn mới và KHÔNG đổi một ô nào', () => {
      bang(lan2.thongKe.donGhi, 0, 'đơn ghi thêm ở lần hai');
      bang(lan2.thongKe.donDaCo, lan1.thongKe.donGhi + lan1.thongKe.donDaCo, 'đơn bị bỏ vì đã có');
      bang(lan2.thongKe.mappingThem, 0, 'dòng Mapping nối thêm ở lần hai');
      bang(lechLan2.length, 0, 'số ô đổi sau lần chạy thứ hai');
    });
  }

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* còn khóa thì thôi */ }

  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  HỎNG: ' + h)); process.exit(1); }
})().catch((e) => { console.error('\nLỖI TEST: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
