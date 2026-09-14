/**
 * gia-lap-web-app.js — WEB APP GIẢ, CHẠY HOÀN TOÀN NỘI BỘ (GV-v2.3 mục 2.4).
 *
 * Mục đích: test trọn luồng giai đoạn 2 mà không cần mạng và không cần link Web App thật.
 *
 * KHÔNG mở cổng mạng, KHÔNG gọi ra ngoài. Mọi lời gọi `https` bị chặn lại trong tiến trình:
 * module này thay `require.cache['https']` bằng một bản giả, nên `node/gsheet-web-app.js`
 * (file của người khác, KHÔNG sửa một dòng nào) vẫn chạy nguyên văn — kể cả nhánh đi theo
 * chuyển hướng 302, nhánh bắt HTML đăng nhập, nhánh che chuỗi bí mật.
 *
 * ------------------------------------------------------------------ KIẾN TRÚC BA TẦNG
 *  Tầng 1 — MÁY TÍNH (mã thật, không đụng):  node/chay-google-sheet.js → node/gsheet-web-app.js
 *  Tầng 2 — ĐƯỜNG TRUYỀN (giả, ở đây):       shim `https` + bơm lỗi (302 · 500 · HTML đăng nhập ·
 *                                            401/403 · hết giờ · đứt giữa chừng · lệch phiên bản ·
 *                                            chuỗi chuyển hướng nhiều nấc / không Location / thân rỗng — 2.7.1)
 *  Tầng 3 — APPS SCRIPT (mã thật, không đụng): src/ShellAppsScript.gs chạy trong Node nhờ bộ dịch vụ
 *                                            Google giả (SpreadsheetApp, PropertiesService,
 *                                            LockService, ContentService, Utilities, Logger)
 *
 * Nghĩa là: khi một bài test hỏng thì hỏng ở MÃ THẬT, không phải ở bản mô phỏng viết lại.
 *
 * INV-7: `sim.moiChuoiDaIn()` gom lại mọi chuỗi mà hệ thống đã in / ném / trả về để test quét. Thứ phải
 * không lộ: CHUỖI BÍ MẬT (D-43 sửa 13/9 — vẫn còn, chỉ là nạp sẵn trong gói), LINK Web App, link file
 * tháng và ID file tháng.
 *
 * FILE THÁNG (D-42): mỗi `sim.khaiThang(thang)` dựng một file tháng có ID riêng và ghi link vào
 * `sim.linkThang` — chính là khóa `link_thang` mà `sim.cauHinhMay()` đưa cho máy. Không còn bảng link
 * trên Google, không mỏ neo, không SỔ LINK THÁNG.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const SRC = path.join(__dirname, '..', 'src');

// Các file .gs cần cho VỎ GOOGLE (tầng 3). Cố ý KHÔNG nạp tests/ để không phụ thuộc file đang sửa.
// Tám file mà 'xuLy' và 'ghi' cần. Có cả ba file lớp 2 vì D-47 (`toLaiMapping_`) gọi `MapListing.laCo`.
// `TaoThangMoi.gs` (2.6.0): hành động `taoThangMoi` gọi thẳng lõi chuyển sổ.
const FILE_VO_GOOGLE = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs',
  'DanhMuc.gs', 'MapListing.gs', 'Normalize.gs', 'TaoThangMoi.gs', 'ShellAppsScript.gs'];

// Công thức: kho ô giữ R1C1 (Web App đọc/chép R1C1); `getFormulas`/`setFormula`/`setValues('=…')` đi qua A1.
const { a1SangR1C1, r1c1SangA1 } = require('./nap-xlsx-gia-lap');

// Các file .gs cần cho LÕI phía máy tính (tầng 1 gọi tới).
const FILE_LOI_MAY = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs', 'adapters/AdapterFileXuat.gs',
  'DanhMuc.gs', 'MapListing.gs', 'Normalize.gs', 'tests/TestData.gs'];

const URL_GIA = 'https://script.google.com/macros/s/GIA_LAP_KEODON/exec';
const HOST_CHUYEN_HUONG = 'https://script.googleusercontent.com/macros/echo?user_content_key=';

// ============================================================ nạp .gs vào Node (như Apps Script)

/**
 * Ghép các file .gs rồi chạy trong một phạm vi riêng, trả về mọi tên `var`/`function` cấp cao nhất.
 * `moiTruong` trở thành biến trong phạm vi đó — đây là cách bơm dịch vụ Google giả vào mã thật.
 */
/**
 * @param {Function} [suaNguon] đổi mã nguồn TRƯỚC khi nạp — chỉ dùng cho ĐỐI CHỨNG ÂM: dựng lại đúng một
 *   khuyết tật đã chữa, rồi chứng minh phép chấm bắt được nó. Đừng dùng để làm test dễ qua.
 */
function napGs(danhSachFile, moiTruong, suaNguon) {
  let src = danhSachFile.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  if (suaNguon) src = suaNguon(src);
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const khoa = Object.keys(moiTruong || {});
  const body = src + '\nreturn {' + [...ten].map((n) => n + ': (typeof ' + n + ' === "undefined" ? undefined : ' + n + ')').join(', ') + '};';
  const fn = new Function(...khoa, body);   // eslint-disable-line no-new-func
  return fn(...khoa.map((k) => moiTruong[k]));
}

// ============================================================ Google Sheet giả

function khoaO(r, c) { return r + ':' + c; }

/** Một sheet giả: lưu giá trị, công thức R1C1, định dạng số, nền, ô gộp — và ghi lại MỌI lệnh chạm vào. */
class SheetGia {
  constructor(ten, ss) {
    this.ten = ten;
    this.ss = ss;
    this.giaTri = {};      // 'r:c' -> giá trị
    this.congThuc = {};    // 'r:c' -> công thức R1C1
    this.dinhDang = {};    // 'r:c' -> định dạng số
    this.nen = {};         // 'r:c' -> mã màu
    this.dam = {};         // 'r:c' -> true
    this.gopO = [];        // [{r1,c1,r2,c2}]
  }

  getName() { return this.ten; }

  /** Ô nằm trong một cụm gộp nhưng KHÔNG phải góc trên trái → Google Sheets trả về rỗng. */
  oPhuCuaCumGop(r, c) {
    for (const g of this.gopO) {
      if (r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2 && !(r === g.r1 && c === g.c1)) return true;
    }
    return false;
  }

  _quet() {
    let dongCuoi = 0, cotCuoi = 0;
    const xet = (kho) => {
      for (const k of Object.keys(kho)) {
        const v = kho[k];
        if (v === '' || v == null) continue;
        const [r, c] = k.split(':').map(Number);
        if (r > dongCuoi) dongCuoi = r;
        if (c > cotCuoi) cotCuoi = c;
      }
    };
    xet(this.giaTri); xet(this.congThuc);
    return { dongCuoi, cotCuoi };
  }

  getLastRow() { return this._quet().dongCuoi; }
  getLastColumn() { return this._quet().cotCuoi; }
  // Số dòng TỐI ĐA của lưới, như Google: bản sao file tháng thường có 1.000 dòng. Ghi hay đọc quá lưới thì
  // Google NÉM LỖI chứ không tự nới — nên kéo công thức tới dòng 2.003 (D-57) bắt buộc phải chèn dòng trước.
  // Giả lập ném đúng lỗi đó để quên `insertRowsAfter` là HỎNG ở test, không đợi tới lúc chạy thật.
  getMaxRows() { return Math.max(this.soDongToiDa || 1000, this.getLastRow()); }
  getMaxColumns() { return Math.max(26, this.getLastColumn()); }
  insertRowsAfter(sauDong, soDong) {
    const max = this.getMaxRows();
    if (sauDong !== max) throw new Error('Giả lập chỉ hỗ trợ chèn dòng ở CUỐI lưới (sau dòng ' + max + '), nhận ' + sauDong);
    this.soDongToiDa = max + soDong;
    const sim = this.ss && this.ss.sim;
    if (sim) sim.nhatKyGhi.push({ stt: sim.nhatKyGhi.length + 1, sheet: this.ten, kieu: 'chenDong', dong1: sauDong + 1, cot1: 1, soDong: soDong, soCot: 0, cot: [] });
    return this;
  }
  /** Dời mọi kho ô theo hàm đổi khóa (`null` = bỏ ô). */
  _doiKho(doi) {
    ['giaTri', 'congThuc', 'dinhDang', 'nen', 'dam'].forEach((ten) => {
      const cu = this[ten], moi = {};
      Object.keys(cu).forEach((k) => {
        const [r, c] = k.split(':').map(Number);
        const kk = doi(r, c);
        if (kk) moi[kk[0] + ':' + kk[1]] = cu[k];
      });
      this[ten] = moi;
    });
  }
  _ghiNhatSheet(kieu, dong1, cot1, soDong, soCot) {
    const sim = this.ss && this.ss.sim;
    if (sim) sim.nhatKyGhi.push({ stt: sim.nhatKyGhi.length + 1, sheet: this.ten, kieu, dong1, cot1, soDong, soCot, cot: [] });
  }
  /**
   * Như Google: xóa hẳn `n` dòng từ `r`, dòng dưới dồn lên, lưới co lại. Công thức R1C1 dồn theo ô nên tham
   * chiếu TƯƠNG ĐỐI giữ nguyên nghĩa. KHÁC Google (cố ý, như vỏ Excel): tham chiếu TUYỆT ĐỐI trỏ qua vùng bị
   * xóa không được co lại — số đo ở đây là cận trên.
   */
  deleteRows(r, n) {
    const max = this.getMaxRows();
    if (r < 1 || n < 1 || r + n - 1 > max) throw new Error('deleteRows ngoài lưới: ' + r + '+' + n + ' > ' + max);
    const het = r + n - 1;
    this._doiKho((rr, cc) => (rr < r ? [rr, cc] : (rr > het ? [rr - n, cc] : null)));
    this.gopO = this.gopO.map((g) => {
      if (g.r1 >= r && g.r2 <= het) return null;
      const a = g.r1 > het ? g.r1 - n : (g.r1 >= r ? r : g.r1);
      const b = g.r2 > het ? g.r2 - n : (g.r2 >= r ? r - 1 : g.r2);
      return b < a ? null : { r1: a, c1: g.c1, r2: b, c2: g.c2 };
    }).filter((g) => g && !(g.r1 === g.r2 && g.c1 === g.c2));
    this.soDongToiDa = max - n;
    this._ghiNhatSheet('xoaDong', r, 1, n, 0);
    return this;
  }
  /** Như Google: chèn một cột trống trước cột `c`, mọi cột từ `c` dịch phải; cụm gộp cắt qua `c` nở thêm một cột. */
  insertColumnBefore(c) {
    this._doiKho((rr, cc) => [rr, cc >= c ? cc + 1 : cc]);
    this.gopO = this.gopO.map((g) => ({ r1: g.r1, r2: g.r2, c1: g.c1 >= c ? g.c1 + 1 : g.c1, c2: g.c2 >= c ? g.c2 + 1 : g.c2 }));
    this._ghiNhatSheet('chenCot', 1, c, 0, 1);
    return this;
  }
  getRange(r, c, nr, nc) {
    const soDong = nr == null ? 1 : nr;
    const han = r + soDong - 1;
    if (han > 1000 && han > this.getMaxRows()) {
      throw new Error('The coordinates of the range are outside the dimensions of the sheet. (giả lập: dòng ' + han + ' > ' + this.getMaxRows() + ')');
    }
    return new VungGia(this, r, c, soDong, nc == null ? 1 : nc);
  }
  getDataRange() { return new VungGia(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }

  /** Đặt thẳng giá trị/công thức khi DỰNG dữ liệu ban đầu — không tính là "tool ghi". */
  datNen(r, c, o) {
    if (o.v !== undefined) this.giaTri[khoaO(r, c)] = o.v;
    if (o.ct !== undefined) this.congThuc[khoaO(r, c)] = o.ct;
    if (o.dd !== undefined) this.dinhDang[khoaO(r, c)] = o.dd;
    if (o.nen !== undefined) this.nen[khoaO(r, c)] = o.nen;
  }
}

/** Một vùng giả. Mọi lệnh làm thay đổi đều được ghi vào `ss.sim.nhatKyGhi` để test soi lại. */
class VungGia {
  constructor(sh, r, c, nr, nc) {
    this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc;
  }

  _ghiNhat(kieu) {
    const sim = this.sh.ss && this.sh.ss.sim;
    if (!sim) return;
    const cot = [];
    for (let j = 0; j < this.nc; j++) cot.push(this.c + j);
    sim.nhatKyGhi.push({
      stt: sim.nhatKyGhi.length + 1, sheet: this.sh.ten, kieu: kieu,
      dong1: this.r, cot1: this.c, soDong: this.nr, soCot: this.nc, cot: cot
    });
  }

  _duyet(fn) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j);
  }

  _ghiNhatDoc() {
    const sim = this.sh.ss && this.sh.ss.sim;
    if (!sim) return;
    sim.nhatKyDoc.push({
      sheet: this.sh.ten, dong1: this.r, cot1: this.c, soDong: this.nr, soCot: this.nc,
      dongCuoi: this.r + this.nr - 1, cotCuoi: this.c + this.nc - 1
    });
  }

  getA1Notation() { return this.sh.ten + '!' + this.r + ':' + this.c + '+' + this.nr + 'x' + this.nc; }

  getValues() {
    this._ghiNhatDoc();
    const out = [];
    this._duyet((r, c, i, j) => {
      if (!out[i]) out[i] = [];
      out[i][j] = this.sh.oPhuCuaCumGop(r, c) ? '' : (this.sh.giaTri[khoaO(r, c)] === undefined ? '' : this.sh.giaTri[khoaO(r, c)]);
    });
    return out;
  }

  getDisplayValues() {
    return this.getValues().map((h) => h.map((v) => hienThi(v)));
  }

  getValue() { return this.getValues()[0][0]; }
  getDisplayValue() { return this.getDisplayValues()[0][0]; }

  getRow() { return this.r; }
  getColumn() { return this.c; }
  getNumRows() { return this.nr; }
  getNumColumns() { return this.nc; }
  getFormulas() {
    const out = [];
    this._duyet((r, c, i, j) => {
      if (!out[i]) out[i] = [];
      const f = this.sh.congThuc[khoaO(r, c)];
      out[i][j] = f ? r1c1SangA1(f, r, c) : '';
    });
    return out;
  }
  getFormula() { return this.getFormulas()[0][0]; }
  setFormulas(b) {
    this._ghiNhat('congThuc');
    this._duyet((r, c, i, j) => {
      const f = b[i][j];
      if (f) { this.sh.congThuc[khoaO(r, c)] = a1SangR1C1(String(f).replace(/^=/, ''), r, c); delete this.sh.giaTri[khoaO(r, c)]; }
      else delete this.sh.congThuc[khoaO(r, c)];
    });
    return this;
  }
  setFormula(f) { return this.setFormulas([[f]]); }
  /** Như Google: mọi cụm gộp CẮT QUA vùng này. */
  getMergedRanges() {
    const r2 = this.r + this.nr - 1, c2 = this.c + this.nc - 1;
    return this.sh.gopO.filter((g) => !(g.r2 < this.r || g.r1 > r2 || g.c2 < this.c || g.c1 > c2))
      .map((g) => new VungGia(this.sh, g.r1, g.c1, g.r2 - g.r1 + 1, g.c2 - g.c1 + 1));
  }
  breakApart() {
    const r2 = this.r + this.nr - 1, c2 = this.c + this.nc - 1;
    this._ghiNhat('boGop');
    this.sh.gopO = this.sh.gopO.filter((g) => g.r2 < this.r || g.r1 > r2 || g.c2 < this.c || g.c1 > c2);
    return this;
  }
  /** Như Google: gộp cả vùng, chỉ giữ giá trị ô trên-trái. */
  merge() {
    if (this.nr === 1 && this.nc === 1) return this;
    this._ghiNhat('gopO');
    this._duyet((r, c) => {
      if (r === this.r && c === this.c) return;
      delete this.sh.giaTri[khoaO(r, c)];
      delete this.sh.congThuc[khoaO(r, c)];
    });
    this.sh.gopO.push({ r1: this.r, c1: this.c, r2: this.r + this.nr - 1, c2: this.c + this.nc - 1 });
    return this;
  }
  clearContent() {
    this._ghiNhat('xoaNoiDung');
    this._duyet((r, c) => { delete this.sh.giaTri[khoaO(r, c)]; delete this.sh.congThuc[khoaO(r, c)]; });
    return this;
  }
  /** Chỉ hỗ trợ `PASTE_FORMAT` (định dạng số + nền), đúng cỡ vùng đích — thứ `CHEN_COT` của Web App dùng. */
  copyTo(dich, kieu) {
    if (kieu !== 'PASTE_FORMAT') throw new Error('Giả lập copyTo chỉ hỗ trợ PASTE_FORMAT, nhận: ' + kieu);
    // Như Google (đo thật 14/9 21:47, YC-43): vùng DÁN giao MỘT PHẦN với một cụm gộp → ném, không dán gì. Cụm nằm trọn trong
    // vùng dán thì được. Thiếu luật này, giả lập để lọt đúng lỗi làm nút 3 chết ở B5 trên Google thật.
    const r2 = dich.r + dich.nr - 1, c2 = dich.c + dich.nc - 1;
    const catMotPhan = dich.sh.gopO.some((g) => !(g.r2 < dich.r || g.r1 > r2 || g.c2 < dich.c || g.c1 > c2) &&
      !(g.r1 >= dich.r && g.r2 <= r2 && g.c1 >= dich.c && g.c2 <= c2));
    if (catMotPhan) throw new Error('Bạn không thể thực hiện lệnh dán khi vùng dán giao một phần với một ô hợp nhất.');
    dich._ghiNhat('dinhDang');
    for (let i = 0; i < dich.nr; i++) {
      for (let j = 0; j < dich.nc; j++) {
        const kN = khoaO(this.r + i, this.c + j), kD = khoaO(dich.r + i, dich.c + j);
        ['dinhDang', 'nen'].forEach((ten) => {
          if (this.sh[ten][kN] !== undefined) dich.sh[ten][kD] = this.sh[ten][kN];
          else delete dich.sh[ten][kD];
        });
      }
    }
    return this;
  }

  getFormulaR1C1() { return this.sh.congThuc[khoaO(this.r, this.c)] || ''; }
  getFormulasR1C1() {
    const out = [];
    this._duyet((r, c, i, j) => { if (!out[i]) out[i] = []; out[i][j] = this.sh.congThuc[khoaO(r, c)] || ''; });
    return out;
  }

  setValues(bang) {
    if (!Array.isArray(bang) || bang.length !== this.nr) throw new Error('setValues: số dòng không khớp vùng');
    this._ghiNhat('giaTri');
    this._duyet((r, c, i, j) => {
      const v = bang[i][j];
      // Như Google: chuỗi bắt đầu bằng `=` là CÔNG THỨC (A1).
      if (typeof v === 'string' && v.charAt(0) === '=' && v.length > 1) {
        this.sh.congThuc[khoaO(r, c)] = a1SangR1C1(v.slice(1), r, c);
        delete this.sh.giaTri[khoaO(r, c)];
        return;
      }
      // `epNgayNhuGoogle`: như Google, chuỗi trông như năm-tháng(-ngày) ghi vào ô CHƯA ép '@' bị đổi thành NGÀY.
      // Tắt mặc định (bộ cũ chấm theo chuỗi); bài nào canh bẫy này thì bật.
      const simX = this.sh.ss && this.sh.ss.sim;
      const mNgay = simX && simX.epNgayNhuGoogle && typeof v === 'string' && this.sh.dinhDang[khoaO(r, c)] !== '@' &&
        /^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/.exec(v.trim());
      this.sh.giaTri[khoaO(r, c)] = mNgay ? new Date(+mNgay[1], +mNgay[2] - 1, +(mNgay[3] || 1)) : (v === undefined ? '' : v);
      // Bản trước chỉ gỡ công thức khi giá trị KHÁC rỗng — Google gỡ cả khi ghi '' (ghi đè là ghi đè). Để lệch
      // chỗ này là giả lập che mất đúng lỗi "ghi rỗng vào cột công thức".
      if (v !== undefined) delete this.sh.congThuc[khoaO(r, c)];
    });
    return this;
  }

  setValue(v) { return this.setValues([[v]]); }

  setNumberFormat(f) {
    this._ghiNhat('dinhDang');
    this._duyet((r, c) => { this.sh.dinhDang[khoaO(r, c)] = f; });
    return this;
  }
  setNumberFormats(b) {
    this._ghiNhat('dinhDang');
    this._duyet((r, c, i, j) => { this.sh.dinhDang[khoaO(r, c)] = b[i][j]; });
    return this;
  }

  setFormulasR1C1(b) {
    this._ghiNhat('congThuc');
    this._duyet((r, c, i, j) => {
      this.sh.congThuc[khoaO(r, c)] = b[i][j];
      if (b[i][j]) delete this.sh.giaTri[khoaO(r, c)];
    });
    return this;
  }
  setFormulaR1C1(f) { return this.setFormulasR1C1([[f]]); }

  mergeVertically() {
    this._ghiNhat('gopO');
    for (let j = 0; j < this.nc; j++) {
      const c = this.c + j;
      this.sh.gopO.push({ r1: this.r, c1: c, r2: this.r + this.nr - 1, c2: c });
    }
    return this;
  }

  getBackgrounds() {
    const out = [];
    this._duyet((r, c, i, j) => { if (!out[i]) out[i] = []; out[i][j] = this.sh.nen[khoaO(r, c)] || '#ffffff'; });
    return out;
  }
  setBackgrounds(b) {
    this._ghiNhat('nen');
    this._duyet((r, c, i, j) => { this.sh.nen[khoaO(r, c)] = b[i][j]; });
    return this;
  }
  setBackground(m) {
    this._ghiNhat('nen');
    this._duyet((r, c) => { this.sh.nen[khoaO(r, c)] = m; });
    return this;
  }
  setFontWeight(w) {
    this._ghiNhat('font');
    this._duyet((r, c) => { this.sh.dam[khoaO(r, c)] = w === 'bold'; });
    return this;
  }
}

function hienThi(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.getDate() + '/' + (v.getMonth() + 1) + '/' + v.getFullYear();
  return String(v);
}

class BangTinhGia {
  constructor(ten, id, sim) { this.ten = ten; this.id = id; this.sim = sim; this.sheets = []; }
  getName() { return this.ten; }
  getId() { return this.id; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(t) { return this.sheets.filter((s) => s.ten === t)[0] || null; }
  themSheet(t) { const s = new SheetGia(t, this); this.sheets.push(s); return s; }
  insertSheet(t) {
    if (this.getSheetByName(t)) throw new Error('A sheet with the name "' + t + '" already exists.');
    if (this.sim) this.sim.nhatKyGhi.push({ stt: this.sim.nhatKyGhi.length + 1, sheet: t, kieu: 'taoSheet', dong1: 0, cot1: 0, soDong: 0, soCot: 0, cot: [] });
    return this.themSheet(t);
  }
}

// ============================================================ dịch vụ Google giả

/** Date giả để chốt "hôm nay" trên máy chủ Google — cần cho T-53 và luật chống ghi lùi tháng. */
function taoDateGia(hop) {
  return class DateGia extends Date {
    // `hop.buocMs` (chỉ bài test canh giờ đặt): mỗi lần mã hỏi giờ, đồng hồ trôi thêm ngần ấy mili-giây — để dựng
    // được ca "chạm ngưỡng 4 phút 30 giữa chừng" mà không phải chờ thật.
    constructor(...a) {
      if (a.length === 0) { super(hop.moc); if (hop.buocMs) hop.moc += hop.buocMs; } else super(...a);
    }
    static now() { const t = hop.moc; if (hop.buocMs) hop.moc += hop.buocMs; return t; }
  };
}

const HAI = (n) => (n < 10 ? '0' : '') + n;

/** Đủ dùng cho các mẫu ShellAppsScript.gs đang gọi: 'yyyy-MM', 'yyyy-MM-dd', 'HH:mm:ss dd/MM/yyyy'. */
function dinhDangNgay(d, muiGio, mau) {
  const t = new Date(d.getTime() + 7 * 3600 * 1000);   // Asia/Ho_Chi_Minh = UTC+7, cố định
  const o = {
    yyyy: String(t.getUTCFullYear()), MM: HAI(t.getUTCMonth() + 1), dd: HAI(t.getUTCDate()),
    HH: HAI(t.getUTCHours()), mm: HAI(t.getUTCMinutes()), ss: HAI(t.getUTCSeconds())
  };
  return String(mau).replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => o[k]);
}

// ============================================================ shim https (chặn mọi lời gọi mạng)

const BO_XU_LY = new Map();        // đường dẫn '/macros/s/.../exec' -> hàm xử lý
const KHO_CHUYEN_HUONG = new Map();// URL chuyển hướng dùng-một-lần -> phản hồi

function taoReq() {
  const req = new EventEmitter();
  req.than = '';
  req.daHuy = false;
  req.write = (d) => { req.than += d; return true; };
  req.end = () => { if (req._khiXong) req._khiXong(); };
  req.destroy = (e) => { req.daHuy = true; if (e) setImmediate(() => req.emit('error', e)); };
  req.setTimeout = () => req;
  req.abort = () => req.destroy();
  return req;
}

/** Đẩy một phản hồi giả về phía khách. `pt` = { statusCode, headers, body, ngat } */
function traPhanHoi(req, cb, pt) {
  const res = new EventEmitter();
  res.statusCode = pt.statusCode;
  res.headers = pt.headers || {};
  res.setEncoding = () => res;
  res.resume = () => res;
  res.destroy = () => res;
  setImmediate(() => {
    if (req.daHuy) return;
    cb(res);
    setImmediate(() => {
      if (pt.ngat) {
        // Đứt giữa chừng: Node cho `res` phát 'aborted' và `req` phát 'error' ECONNRESET.
        const nua = String(pt.body || '').slice(0, Math.floor(String(pt.body || '').length / 2));
        if (nua) res.emit('data', nua);
        res.emit('aborted');
        req.emit('error', Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
        return;
      }
      if (pt.body != null && pt.body !== '') res.emit('data', String(pt.body));
      res.emit('end');
    });
  });
}

const httpsGia = {
  __LA_GIA_LAP: true,

  request(opt, cb) {
    const req = taoReq();
    const duong = String((opt && opt.path) || '').split('?')[0];
    req._khiXong = () => {
      const xuLy = BO_XU_LY.get(duong);
      if (!xuLy) {
        setImmediate(() => req.emit('error', new Error(
          'GIẢ LẬP: không có Web App giả nào đăng ký ở đường dẫn "' + duong + '" — ' +
          'test đang định gọi ra mạng thật, đã chặn.')));
        return;
      }
      const pt = xuLy(req.than, opt);
      if (pt && pt.khongTraLoi) { setImmediate(() => req.emit('timeout')); return; }
      if (pt && pt.loiKetNoi) { setImmediate(() => req.emit('error', new Error(pt.loiKetNoi))); return; }
      traPhanHoi(req, cb, pt);
    };
    return req;
  },

  get(u, opt, cb) {
    if (typeof opt === 'function') { cb = opt; opt = {}; }
    const req = taoReq();
    const dia = typeof u === 'string' ? u : String(u);
    setImmediate(() => {
      const pt = KHO_CHUYEN_HUONG.get(dia);
      if (!pt) {
        req.emit('error', new Error('GIẢ LẬP: chuyển hướng tới "' + dia + '" không có trong kho — đã chặn gọi mạng thật.'));
        return;
      }
      KHO_CHUYEN_HUONG.delete(dia);
      if (pt.khongTraLoi) { req.emit('timeout'); return; }
      if (pt.loiKetNoi) { req.emit('error', new Error(pt.loiKetNoi)); return; }
      traPhanHoi(req, cb, pt);
    });
    return req;
  }
};

/** Cắm shim vào require.cache TRƯỚC khi bất cứ ai `require('https')`. Gọi nhiều lần vẫn an toàn. */
function catCauMang() {
  for (const ten of ['https', 'node:https']) {
    const cu = require.cache[ten];
    if (cu && cu.exports && cu.exports.__LA_GIA_LAP) continue;
    require.cache[ten] = { id: ten, filename: ten, loaded: true, exports: httpsGia, children: [], paths: [] };
  }
  const daCam = require('https');
  if (!daCam.__LA_GIA_LAP) {
    throw new Error('Không cắm được https giả — phiên bản Node này không cho thay require.cache của module lõi. ' +
      'Node đang chạy: ' + process.version);
  }
  return httpsGia;
}

catCauMang();   // cắm ngay lúc nạp module, để thứ tự require không thành cái bẫy

// ============================================================ HTML mà Google thật hay trả về

const HTML_DANG_NHAP = [
  '<!DOCTYPE html><html lang="vi"><head><title>Đăng nhập - Tài khoản Google</title></head>',
  '<body><div id="initialView"><form action="https://accounts.google.com/ServiceLogin" method="post">',
  '<h1>Đăng nhập</h1><p>Sử dụng Tài khoản Google của bạn</p>',
  '<input type="email" name="identifier"></form></div></body></html>'
].join('\n');

const HTML_QUA_GIO = [
  '<!DOCTYPE html><html><head><title>Error</title></head><body>',
  '<div>Exceeded maximum execution time</div>',
  '<div>Exception: Đã vượt quá thời gian thực thi tối đa (6 phút)</div>',
  '</body></html>'
].join('\n');

const HTML_403 = [
  '<!DOCTYPE html><html><head><title>Error 403</title></head><body>',
  '<div>You do not have permission to access this resource.</div></body></html>'
].join('\n');

const HTML_500 = [
  '<!DOCTYPE html><html><head><title>Error</title></head><body>',
  '<div>Sorry, unable to open the file at this time.</div>',
  '<div>Please check the address and try again.</div></body></html>'
].join('\n');

// ============================================================ WEB APP GIẢ

let DEM_SIM = 0;

/**
 * Dựng một Web App giả hoàn chỉnh.
 *
 * @param {Object} tc
 *   ngay         mốc thời gian máy chủ Google, ISO hoặc Date (mặc định 2026-09-08T03:00:00Z)
 *   biMat        chuỗi bí mật đã "cài bằng caiDat()" phía Apps Script
 *   khongCaiDat  true = dựng đúng ca "Web App chưa chạy caiDat lần nào" (→ CHUA_CAI_DAT)
 *   suaNguon     đổi mã nguồn trước khi nạp — CHỈ cho đối chứng âm, xem chú thích napGs
 */
function taoGiaLap(tc) {
  const o = tc || {};
  const sim = {
    ten: 'GIA_LAP_' + (++DEM_SIM),
    url: URL_GIA,
    // Chuỗi mặc định đủ dài và tự nhận ra được khi nó lỡ lọt vào một câu in — bài quét INV-7 tìm đúng nó.
    biMat: o.biMat == null ? 'BI-MAT-GIA-LAP-KEODON-0123456789-DE-NHAN-RA' : o.biMat,
    duong: new URL(URL_GIA).pathname,
    thuocTinh: {},
    file: {},                    // fileId -> BangTinhGia
    nhatKy: [],                  // Logger.log
    nhatKyGhi: [],               // mọi lệnh chạm sheet
    nhatKyDoc: [],               // mọi vùng đã đọc (để chứng minh không đọc quá cột C của 'Thông tin shop ')
    nhatKyGoi: [],               // mọi gói POST đã nhận (KHÔNG lưu spreadsheetId)
    chuOiDaTraVe: [],            // mọi thân phản hồi (để INV-7 quét)
    loi: {},                     // cờ bơm lỗi
    khoaDangGiu: false,
    khoaBiMayKhacGiu: false,
    soLanFlush: 0,
    demGoiGhi: 0,
    epNgayNhuGoogle: o.epNgayNhuGoogle === true
  };

  const hopThoiGian = { moc: (o.ngay ? new Date(o.ngay) : new Date('2026-09-08T03:00:00Z')).getTime() };
  sim.datNgay = (x) => { hopThoiGian.moc = new Date(x).getTime(); };
  sim.datBuocDongHo = (ms) => { hopThoiGian.buocMs = ms || 0; };
  sim.ngayHienTai = () => new Date(hopThoiGian.moc);

  // ---------------------------------------------------------- dịch vụ Google giả
  const DateGia = taoDateGia(hopThoiGian);

  const moiTruong = {
    Date: DateGia,
    SpreadsheetApp: {
      openById(id) {
        // `loi.loiMoFile`: dựng ca Google TỪ CHỐI mở file (quyền / file đã xóa) — D-46 ca (3).
        // Chuỗi truyền vào phải là câu Google ném THẬT, để `phanLoaiLoiMoFile_` phân loại đúng nhánh.
        const l = sim.loi || {};
        if (l.loiMoFile) throw new Error(String(l.loiMoFile));
        const ss = sim.file[id];
        // Câu Google ném thật khi ID sai/không tồn tại — nó KHÔNG mang ID. Giả lập tự nhét ID vào đây thì
        // bài quét rò rỉ INV-7 sẽ bắt chính cái giả lập chứ không bắt mã thật.
        if (!ss) throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
        return ss;
      },
      flush() { sim.soLanFlush++; if (typeof sim.khiFlush === 'function') sim.khiFlush(); },
      CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT', PASTE_VALUES: 'PASTE_VALUES', PASTE_NORMAL: 'PASTE_NORMAL' }
    },
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty: (k) => (k in sim.thuocTinh ? sim.thuocTinh[k] : null),
          setProperty: (k, v) => { sim.thuocTinh[k] = String(v); return this; },
          deleteProperty: (k) => { delete sim.thuocTinh[k]; },
          getProperties: () => Object.assign({}, sim.thuocTinh)
        };
      }
    },
    LockService: {
      getScriptLock() {
        return {
          tryLock(ms) {
            if (sim.khoaBiMayKhacGiu || sim.khoaDangGiu) return false;
            sim.khoaDangGiu = true;
            return true;
          },
          releaseLock() { sim.khoaDangGiu = false; },
          hasLock() { return sim.khoaDangGiu; }
        };
      }
    },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain', HTML: 'text/html' },
      createTextOutput(s) {
        return { _s: String(s), setMimeType() { return this; }, getContent() { return this._s; } };
      }
    },
    Utilities: {
      formatDate: (d, tz, mau) => dinhDangNgay(d, tz, mau),
      sleep: () => { },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      // Apps Script trả mảng byte CÓ DẤU (-128..127). Trả byte không dấu ở đây thì `bam256_` trên giả lập
      // ra một chuỗi hex khác bản chạy thật, và cả bộ test sẽ xanh trên một phép so không tồn tại.
      computeDigest(thuatToan, chuoi) {
        if (thuatToan !== 'SHA_256') throw new Error('Giả lập chỉ hỗ trợ SHA_256, nhận: ' + thuatToan);
        const b = crypto.createHash('sha256').update(String(chuoi), 'utf8').digest();
        return Array.from(b).map((v) => (v > 127 ? v - 256 : v));
      }
    },
    Logger: { log: (s) => { sim.nhatKy.push(String(s)); } },
    console: { log: (s) => { sim.nhatKy.push(String(s)); }, error: (s) => { sim.nhatKy.push(String(s)); } }
  };

  sim.vo = napGs(FILE_VO_GOOGLE, moiTruong, o.suaNguon);   // `suaNguon`: xem chú thích napGs — chỉ cho đối chứng âm

  // ---------------------------------------------------------- file tháng (D-42: máy chỉ định ID)
  //
  // Mỗi file tháng là một Google Sheet riêng với ID riêng. Máy giữ `link_thang` ("yyyy-MM" → link) và gửi
  // `spreadsheetId` trong từng gói; Web App KHÔNG đọc bảng link nào, không giữ mỏ neo. Giả lập vì thế chỉ
  // cần hai việc: dựng file theo ID, và trả đúng `link_thang` cho máy qua `cauHinhMay()`.
  //
  // Bản trước dựng cả một sheet `Thông tin shop ` cho mỗi file tháng, kèm chuỗi mồi mật khẩu để bắt rò
  // rỉ. Bỏ hết theo D-42: Web App không còn đường nào chạm tới sheet đó, nên dựng nó lên chỉ để canh một
  // lối đi đã bịt là nuôi một tiền đề sai trong giả lập.
  sim.soLinkThang = {};        // 'yyyy-MM' → BangTinhGia. Giữ nguyên TÊN để các bộ test cũ khỏi phải đổi.
  sim.fileThang = sim.soLinkThang;
  sim.linkThang = {};          // 'yyyy-MM' → link — đúng hình dạng khóa `link_thang` của cấu hình thật
  // ID ≥ 20 ký tự, đúng bảng chữ Google cho phép, để `bocIdTuLink_` phía Apps Script nhận ra.
  sim.idCua = (thang) => 'ID_FILE_' + String(thang).replace('-', '_') + '_GIA_LAP_KEODON';
  sim.linkCua = (thang) => 'https://docs.google.com/spreadsheets/d/' + sim.idCua(thang) + '/edit#gid=0';

  /**
   * Khai một tháng: dựng vỏ file tháng và ghi link vào `link_thang` giả.
   * Tên file mặc định theo mẫu THẬT `THÁNG-<M>-<YYYY>-KINH-DOANH` để `kiemTenFileKhopThang_` đọc được —
   * đặt tên khác mẫu là dựng đúng ca "tên file không đọc được tháng", tool phải cảnh báo chứ không chặn.
   * @param {Object} [tuyChon] khongKhaiLink: true → dựng file mà KHÔNG ghi link (ca "quên khai tháng")
   */
  sim.khaiThang = function (thang, tenFile, tuyChon) {
    const tc = tuyChon || {};
    const id = sim.idCua(thang);
    const ss = new BangTinhGia(
      tenFile || ('THÁNG-' + Number(thang.slice(5)) + '-' + thang.slice(0, 4) + '-KINH-DOANH'), id, sim);
    sim.file[id] = ss;
    sim.soLinkThang[thang] = ss;
    if (!tc.khongKhaiLink) sim.linkThang[thang] = sim.linkCua(thang);
    return ss;
  };

  // ---------------------------------------------------------- cài đặt như caiDat() đã chạy một lần
  // `khongCaiDat` dựng đúng ca Web App vừa Deploy mà chưa ai chạy `caiDat` — phải ra CHUA_CAI_DAT, KHÁC
  // hẳn ca sai chuỗi, vì việc phải làm khác nhau.
  if (!o.khongCaiDat) sim.thuocTinh[sim.vo.TT_BI_MAT || 'KEODON_BI_MAT'] = sim.biMat;

  // ---------------------------------------------------------- xử lý một gói POST
  const doiTuongLoi = () => sim.loi || {};

  /**
   * CHUỖI CHUYỂN HƯỚNG GIẢ (2.7.1) — `sim.datLoi({ soNac, cuoi, chuyenHuongCho, truocKhiChay, giuKhoa, tuongDoi })`.
   * Không có `soNac` lẫn `cuoi` → `null`: đường mặc định cũ (một nấc 302 → 200 JSON), mọi bộ test cũ chạy y nguyên.
   *   soNac          số phản hồi 3xx (POST là nấc 1, các GET sau) — mặc định 1
   *   cuoi           'json' (200 JSON thật) · 'rong200' (200 thân rỗng) · 'khongLocation' (nấc 3xx CUỐI không có Location) — mặc định 'json'
   *   chuyenHuongCho CHỈ áp cho hành động này ('taothangmoi', 'ping', 'doc'…); bỏ trống = mọi hành động
   *   truocKhiChay   true = trả chuỗi hỏng MÀ KHÔNG chạy doPost (Google chưa chạy); mặc định chạy doPost thật rồi mới trả chuỗi
   *   giuKhoa        true = sau khi doPost chạy, đặt `sim.khoaBiMayKhacGiu = true` (Google "vẫn đang chạy" — lượt coTaoThang thấy dangChay)
   *   tuongDoi       true = Location là đường dẫn TƯƠNG ĐỐI (`/macros/echo?…`), máy phải tự ghép máy chủ
   */
  function chuoiChuyenHuongCho(l, hd) {
    if (l.soNac == null && l.cuoi == null) return null;
    if (l.chuyenHuongCho != null && String(l.chuyenHuongCho).trim().toLowerCase() !== hd) return null;
    const soNac = l.soNac == null ? 1 : Number(l.soNac);
    const cuoi = l.cuoi == null ? 'json' : String(l.cuoi);
    if (!(soNac >= 0) || Math.floor(soNac) !== soNac || ['json', 'rong200', 'khongLocation'].indexOf(cuoi) < 0) {
      throw new Error('GIẢ LẬP: chuỗi chuyển hướng sai cấu hình (soNac ' + l.soNac + ', cuoi ' + l.cuoi + ')');
    }
    if (cuoi === 'khongLocation' && soNac < 1) throw new Error('GIẢ LẬP: cuoi = khongLocation cần soNac ≥ 1');
    if (l.truocKhiChay && cuoi === 'json') {
      throw new Error('GIẢ LẬP: truocKhiChay (Google chưa chạy) không đi với cuoi = json — không có JSON nào để trả');
    }
    return { soNac: soNac, cuoi: cuoi, truocKhiChay: l.truocKhiChay === true, giuKhoa: l.giuKhoa === true, tuongDoi: l.tuongDoi === true };
  }

  /**
   * Dựng chuỗi từ CUỐI về ĐẦU: phản hồi 3xx thứ i trỏ Location tới địa chỉ của phản hồi i+1 (khóa kho = NGUYÊN chuỗi địa chỉ, dùng
   * một lần). Trả phản hồi của POST. `chuoi` = thân JSON thật (null khi Google chưa chạy).
   */
  function dungChuoiChuyenHuong(ch, chuoi) {
    let sau = ch.cuoi === 'json' ? { statusCode: 200, headers: { 'content-type': 'application/json' }, body: chuoi }
      : ch.cuoi === 'rong200' ? { statusCode: 200, headers: { 'content-type': 'application/binary' }, body: '' } : null;
    for (let i = ch.soNac; i >= 1; i--) {
      // Đo thật 14/9: nấc chuyển hướng của Apps Script mang content-type application/binary, thân 0 byte.
      const pt = { statusCode: 302, headers: { 'content-type': 'application/binary' }, body: '' };
      if (!(ch.cuoi === 'khongLocation' && i === ch.soNac)) {
        const duong = '/macros/echo?user_content_key=' + sim.ten + '_NAC' + (i + 1) + '_' + Date.now() + Math.random().toString(36).slice(2);
        const dia = (ch.tuongDoi ? 'https://' + new URL(URL_GIA).host : HOST_CHUYEN_HUONG.split('/macros/')[0]) + duong;
        KHO_CHUYEN_HUONG.set(dia, sau);
        pt.headers.location = ch.tuongDoi ? duong : dia;
      }
      sau = pt;
    }
    return sau;
  }

  function phanHoiJson(chuoi, ch) {
    sim.chuOiDaTraVe.push(chuoi);
    const l = doiTuongLoi();
    if (ch) return dungChuoiChuyenHuong(ch, chuoi);
    if (l.khong302) return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: chuoi };
    // Apps Script LUÔN trả 302 sang script.googleusercontent.com — phía máy phải đi theo được.
    const dia = HOST_CHUYEN_HUONG + sim.ten + '_' + (KHO_CHUYEN_HUONG.size + 1) + '_' + Date.now() + Math.random().toString(36).slice(2);
    KHO_CHUYEN_HUONG.set(dia, { statusCode: 200, headers: { 'content-type': 'application/json' }, body: chuoi });
    return { statusCode: 302, headers: { location: dia }, body: '' };
  }

  function xuLyPost(than) {
    const l = doiTuongLoi();
    let goi = {};
    try { goi = JSON.parse(than); } catch (e) { goi = {}; }
    const hd = String(goi.hanhDong || '').trim().toLowerCase();
    sim.nhatKyGoi.push({
      hanhDong: hd, thang: goi.thang || null, lo: goi.lo || null,
      soDon: (goi.lenh || []).reduce((t, x) => t + ((x.don || []).length), 0),
      soMappingThem: (goi.mappingThem || []).length
    });
    if (hd === 'ghi') sim.demGoiGhi++;

    // ------- các tình huống hỏng ở tầng đường truyền / triển khai sai -------
    if (l.khongTraLoi) return { khongTraLoi: true };                      // quá 6 phút: máy chờ đến hết giờ
    if (l.loiKetNoi) return { loiKetNoi: String(l.loiKetNoi) };            // D-12 mất mạng trước khi Apps Script chạy
    if (l.htmlDangNhap) {                                                  // deploy sai quyền truy cập
      sim.chuOiDaTraVe.push(HTML_DANG_NHAP);
      return { statusCode: 200, headers: { 'content-type': 'text/html; charset=UTF-8' }, body: HTML_DANG_NHAP };
    }
    if (l.ma403 || l.ma401) {                                              // D-46 ca (1): Google từ chối thẳng
      sim.chuOiDaTraVe.push(HTML_403);
      return { statusCode: l.ma401 ? 401 : 403, headers: { 'content-type': 'text/html' }, body: HTML_403 };
    }
    if (l.quaSauPhut) {                                                    // vượt 6 phút → Google trả 500 HTML
      sim.chuOiDaTraVe.push(HTML_QUA_GIO);
      return { statusCode: 500, headers: { 'content-type': 'text/html' }, body: HTML_QUA_GIO };
    }
    if (l.ma500) {
      sim.chuOiDaTraVe.push(HTML_500);
      return { statusCode: 500, headers: { 'content-type': 'text/html' }, body: HTML_500 };
    }
    if (l.lechPhienBan) {
      // Bản triển khai cũ: hoặc trả mã lỗi phiên bản, hoặc không biết hành động mới.
      const p = l.lechPhienBan;
      const chuoi = JSON.stringify(p.kieu === 'HANH_DONG_LA'
        ? { ok: false, loi: 'HANH_DONG_LA', thongBao: 'hanhDong = "' + hd + '"; chỉ nhận: ping, doc' }
        : { ok: false, loi: 'LECH_PHIEN_BAN', thongBao: 'Web App đang chạy bản ' + p.dangChay + ', tool cần bản ' + p.can });
      return phanHoiJson(chuoi);
    }

    // ------- chuỗi chuyển hướng hỏng TRƯỚC khi Google chạy (2.7.1) -------
    const ch = chuoiChuyenHuongCho(l, hd);
    if (ch && ch.truocKhiChay) return dungChuoiChuyenHuong(ch, null);

    // ------- chạy MÃ THẬT của ShellAppsScript.gs -------
    if (l.dutTruocKhiGhi) {
      return { statusCode: 200, headers: {}, body: '{"ok":true', ngat: true };   // đứt trước khi script kịp ghi
    }
    let noiDung;
    try {
      noiDung = sim.vo.doPost({ postData: { contents: than, type: 'application/json' } }).getContent();
    } catch (err) {
      // Ngoại lệ lọt ra khỏi doPost → Apps Script trả trang HTML lỗi, KHÔNG phải JSON.
      const h = '<!DOCTYPE html><html><body><div>Exception: ' + String(err && err.message) + '</div></body></html>';
      sim.chuOiDaTraVe.push(h);
      return { statusCode: 500, headers: { 'content-type': 'text/html' }, body: h };
    }
    sim.chuOiDaTraVe.push(noiDung);

    // Đứt SAU khi script đã ghi xong: đây là ca hiểm nhất của D-12 — dữ liệu đã vào sheet
    // nhưng máy tính không nhận được phản hồi, chạy lại phải không sinh đơn trùng.
    // Cả hai đường ghi. Trước đây khóa cứng 'ghi' nên ca hiểm nhất của D-12 không dựng được cho
    // đường `xuLy` — mà `xuLy` mới là đường chạy thật từ bản 2.4.0.
    if (l.dutSauKhiGhi && (hd === 'ghi' || hd === 'xuly') &&
      (l.dutSauKhiGhi === true || l.dutSauKhiGhi === sim.demGoiGhi)) {
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: noiDung, ngat: true };
    }
    // Google đã chạy xong lượt này nhưng "vẫn đang chạy" trong mắt lượt đọc cờ kế tiếp (khóa Web App còn bị giữ).
    if (ch && ch.giuKhoa) sim.khoaBiMayKhacGiu = true;
    return phanHoiJson(noiDung, ch);
  }

  BO_XU_LY.set(sim.duong, xuLyPost);
  sim.thaoGo = () => { BO_XU_LY.delete(sim.duong); };

  // ---------------------------------------------------------- tiện ích cho test
  sim.datLoi = (x) => { sim.loi = Object.assign({}, x || {}); return sim; };
  sim.xoaLoi = () => { sim.loi = {}; return sim; };
  sim.demLai = () => { sim.nhatKyGoi = []; sim.nhatKyGhi = []; sim.demGoiGhi = 0; return sim; };

  /** Cấu hình đưa cho `WebAppGoogleSheet` / `chayLenGoogleSheet` — đúng hình dạng CAU_HINH_VAN_HANH.json. */
  sim.cauHinhMay = (ghiDe) => Object.assign({
    bat: true, web_app_url: sim.url, chuoi_bi_mat: sim.biMat,
    link_thang: Object.assign({}, sim.linkThang)
  }, ghiDe || {});

  /** Ảnh chụp toàn bộ ô của một file tháng — dùng cho INV-1, INV-3, T-47. */
  sim.anhChup = function (thang) {
    const ss = sim.soLinkThang[thang];
    if (!ss) return null;
    const anh = {};
    ss.sheets.forEach((sh) => {
      anh[sh.ten] = {
        giaTri: JSON.parse(JSON.stringify(sh.giaTri, (k, v) => (v instanceof Date ? 'D:' + v.getTime() : v))),
        congThuc: Object.assign({}, sh.congThuc),
        gopO: JSON.parse(JSON.stringify(sh.gopO)),
        dongCuoi: sh.getLastRow()
      };
    });
    return anh;
  };

  /** So hai ảnh chụp; trả danh sách ô đã đổi (bỏ qua các dòng >= `tuDong` nếu truyền vào). */
  sim.soAnh = function (truoc, sau, tuDong) {
    const khac = [];
    const tenSheet = new Set(Object.keys(truoc || {}).concat(Object.keys(sau || {})));
    tenSheet.forEach((t) => {
      const a = (truoc && truoc[t]) || { giaTri: {}, congThuc: {} };
      const b = (sau && sau[t]) || { giaTri: {}, congThuc: {} };
      ['giaTri', 'congThuc'].forEach((loai) => {
        const khoa = new Set(Object.keys(a[loai]).concat(Object.keys(b[loai])));
        khoa.forEach((k) => {
          const dong = Number(k.split(':')[0]);
          if (tuDong && dong >= tuDong) return;
          const x = a[loai][k], y = b[loai][k];
          if (JSON.stringify(x === undefined ? null : x) !== JSON.stringify(y === undefined ? null : y)) {
            khac.push({ sheet: t, loai: loai, o: k, truoc: x, sau: y });
          }
        });
      });
    });
    return khac;
  };

  /** Mọi chuỗi hệ thống đã in / trả về — INV-7 quét chỗ này. KHÔNG gồm thân gói POST. */
  sim.moiChuoiDaIn = () => sim.nhatKy.concat(sim.chuOiDaTraVe);

  /** Lệnh ghi đã chạm những cột nào (chỉ tính ghi giá trị/công thức). */
  sim.cotDaGhiGiaTri = function (tenSheet) {
    const c = new Set();
    sim.nhatKyGhi.forEach((g) => {
      if (tenSheet && g.sheet !== tenSheet) return;
      if (g.kieu !== 'giaTri' && g.kieu !== 'congThuc') return;
      g.cot.forEach((x) => c.add(x));
    });
    return [...c].sort((a, b) => a - b);
  };

  return sim;
}

// ============================================================ dựng file tháng mẫu

const TIEU_DE_GIAN_HANG = ['Ngày ', 'Nguồn đơn', 'Thông tin ĐH', 'Tên viết tắt', 'Tên sản phẩm', 'Đơn vị ',
  'SL', 'Tổng Tiền SP', 'MGG Shop', 'Chi phí', 'Thuế', 'Doanh Thu', 'Mã hàng', 'Check tồn', 'Còn Nợ'];

/**
 * Sheet gian hàng theo bố cục Google Sheet: dòng 1 tiêu đề lớn · dòng 2 tiêu đề cột · dòng 3 dòng tổng ·
 * cột L có công thức theo từng dòng.
 *
 * HÌNH DẠNG E, F, M, N Ở ĐÂY LÀ BIẾN THỂ, KHÔNG PHẢI FILE THẬT: fixture này CỐ Ý dựng "ARRAYFORMULA một ô
 * ở dòng 4, các dòng dưới là giá trị tràn". File thật là công thức TỪNG DÒNG bọc `ARRAY_CONSTRAIN` (đo
 * 08/9/2026), và `node/test-chep-cong-thuc.js` phủ đúng hình dạng đó. Giữ biến thể này vì tool phải chịu
 * được CẢ HAI: gặp ARRAYFORMULA thật phủ cả cột thì `mauChepCongThucDS_` xếp `TRAN_CA_COT` và KHÔNG chép
 * đè lên — chép đè là giết vùng tràn của nó.
 *
 * @param {Array} dongCu [{ma, tvt, sl, h, i, j, k}] — dòng sau của đơn nhiều hàng để ma='' rồi gộp
 * @param {Object} tc { thieuTieuDe: n → chỉ ghi n tiêu đề đầu (dựng ca hiểm cho INV-3) }
 */
function dungSheetGianHang(ss, ten, dongCu, tc) {
  const o = tc || {};
  const sh = ss.themSheet(ten);
  sh.datNen(1, 1, { v: 'THEO DÕI ĐƠN HÀNG - ' + ten });
  const soTieuDe = o.thieuTieuDe || TIEU_DE_GIAN_HANG.length;
  for (let i = 0; i < soTieuDe; i++) sh.datNen(2, i + 1, { v: TIEU_DE_GIAN_HANG[i] });
  ['H', 'I', 'J', 'K', 'L'].forEach((c) => {
    const ci = c.charCodeAt(0) - 64;
    sh.datNen(3, ci, { ct: 'SUM(R[1]C:R[997]C)' });
  });

  // Biến thể ARRAYFORMULA neo ở ô đầu cột (dòng 4) — KHÔNG phải hình dạng thật, xem chú thích trên.
  const NEO = {
    5: 'ARRAYFORMULA(IF(RC[-1]="";"";INDEX(\'Tổng tồn kho\'!R3C3:R482C7;MATCH(RC[-1];\'Tổng tồn kho\'!R3C4:R482C4;0);1)))',
    6: 'ARRAYFORMULA(IF(RC[-2]="";"";INDEX(\'Tổng tồn kho\'!R3C3:R482C7;MATCH(RC[-2];\'Tổng tồn kho\'!R3C4:R482C4;0);4)))',
    13: 'ARRAYFORMULA(IF(RC[-9]="";"";INDEX(\'Tổng tồn kho\'!R3C3:R482C7;MATCH(RC[-9];\'Tổng tồn kho\'!R3C4:R482C4;0);3)))',
    14: 'ARRAYFORMULA(IF(RC[-1]="";"";INDEX(\'Tổng tồn kho\'!R3C5:R739C8;MATCH(RC[-1];\'Tổng tồn kho\'!R3C5:R739C5;0);4)))'
  };
  Object.keys(NEO).forEach((c) => { if (Number(c) <= soTieuDe) sh.datNen(4, Number(c), { ct: NEO[c] }); });
  // Cột L (Doanh Thu) là công thức TỪNG DÒNG ở mọi file tháng thật, kể cả file vừa tạo chưa có đơn nào.
  // D-57: sheet không còn ô công thức nào ở một cột thì tool DỪNG — nên sheet trống cũng phải có L4.
  const CONG_THUC_L = 'IF(RC[-4]="";"";RC[-4]-RC[-3]-RC[-2]-RC[-1])';
  if (soTieuDe >= 12) sh.datNen(4, 12, { ct: CONG_THUC_L });

  (dongCu || []).forEach((d, i) => {
    const r = 4 + i;
    sh.datNen(r, 1, { v: new Date(2026, 8, 1 + (i % 20)), dd: 'd/m/yyyy' });
    if (d.ma) sh.datNen(r, 3, { v: d.ma });
    sh.datNen(r, 4, { v: d.tvt == null ? '' : d.tvt });
    if (d.sl != null) sh.datNen(r, 7, { v: d.sl });
    ['h', 'i', 'j', 'k'].forEach((x, j) => { if (d[x] != null) sh.datNen(r, 8 + j, { v: d[x], dd: '#,##0' }); });
    sh.datNen(r, 12, { ct: CONG_THUC_L }); 
    // Giá trị tràn từ biến thể ARRAYFORMULA: có giá trị hiển thị nhưng KHÔNG có công thức riêng.
    if (soTieuDe >= 14) {
      sh.datNen(r, 5, { v: d.tvt ? 'SP ' + d.tvt : '' });
      sh.datNen(r, 6, { v: d.tvt ? 'HOP' : '' });
      sh.datNen(r, 13, { v: d.tvt ? 1500 + i : '' });
      sh.datNen(r, 14, { v: d.tvt ? 20 : '' });
    }
  });
  return sh;
}

/** Sheet `Tổng tồn kho` từ bảng danh mục (dùng bảng của TestData để hai vỏ cùng một dữ liệu). */
function dungSheetDanhMuc(ss, bang) {
  const sh = ss.themSheet('Tổng tồn kho');
  bang.forEach((hang, i) => (hang || []).forEach((v, j) => {
    if (v !== '' && v != null) sh.datNen(i + 1, j + 1, { v: v });
  }));
  return sh;
}

/** Sheet `Mapping_san_pham` (tên tab trên Google Sheet). */
function dungSheetMapping(ss, bang) {
  const sh = ss.themSheet('Mapping_san_pham');
  bang.forEach((hang, i) => (hang || []).forEach((v, j) => {
    if (v !== '' && v != null) sh.datNen(i + 1, j + 1, { v: v });
  }));
  return sh;
}

/**
 * YC-38.1: THÊM NHỮNG SHEET KHUÔN còn thiếu để file tháng giả đúng "hợp đồng" như file thật — 4 sheet gian
 * hàng, `Tổng tồn kho`, `Mapping_san_pham` 12 cột. Sheet nào bài test đã tự dựng thì GIỮ NGUYÊN, không đè.
 *
 * Vì sao cần: từ 2.6.0 Web App kiểm khuôn file tháng trước mỗi lượt ghi. File thật luôn có đủ; file giả
 * của các bài test thường chỉ dựng đúng một sheet gian hàng mà bài đó cần. Không bù thì mọi bài ghi đều
 * dừng ở SAI_HOP_DONG — đúng hành vi, nhưng không phải thứ các bài đó sinh ra để kiểm.
 */
const SCHEMA_MAPPING_12 = ['Gian hàng', 'Tên trên Shopee', 'Phân loại', 'Tên viết tắt', 'Hệ số', 'Cấu phần',
  'Xác nhận', 'Mã hàng', 'Gợi ý 1', 'Gợi ý 2', 'Ngày thêm', 'Ghi chú'];
function dungKhungThieu(ss) {
  for (const ten of ['Shopee mall', 'Offood', 'Importmart', 'Babyiu']) {
    if (!ss.getSheetByName(ten)) dungSheetGianHang(ss, ten, []);
  }
  if (!ss.getSheetByName('Tổng tồn kho')) {
    dungSheetDanhMuc(ss, [[], ['', 'STT', 'Tên sản phẩm', 'Tên viết tắt', 'Mã hàng', 'Đơn vị', 'Giá vốn', 'Tổng tồn']]);
  }
  if (!ss.getSheetByName('Mapping_san_pham') && !ss.getSheetByName('Mapping sản phẩm')) {
    dungSheetMapping(ss, [SCHEMA_MAPPING_12]);
  }
  return ss;
}

/** Nạp lõi phía MÁY TÍNH (không có dịch vụ Google) — dùng cho dungGoiGhi và dựng dữ liệu thử. */
function napLoiMay() { return napGs(FILE_LOI_MAY, {}); }

module.exports = {
  taoGiaLap, napGs, napLoiMay, catCauMang,
  dungSheetGianHang, dungSheetDanhMuc, dungSheetMapping, dungKhungThieu,
  BangTinhGia, SheetGia,
  URL_GIA, TIEU_DE_GIAN_HANG, FILE_VO_GOOGLE, FILE_LOI_MAY,
  HTML_DANG_NHAP, HTML_QUA_GIO, HTML_500, HTML_403
};
