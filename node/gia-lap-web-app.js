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
 *                                            401/403 · hết giờ · đứt giữa chừng · lệch phiên bản)
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
const FILE_VO_GOOGLE = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs',
  'DanhMuc.gs', 'MapListing.gs', 'Normalize.gs', 'ShellAppsScript.gs'];

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
      this.sh.giaTri[khoaO(r, c)] = v === undefined ? '' : v;
      if (v !== '' && v != null) delete this.sh.congThuc[khoaO(r, c)];
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
}

// ============================================================ dịch vụ Google giả

/** Date giả để chốt "hôm nay" trên máy chủ Google — cần cho T-53 và luật chống ghi lùi tháng. */
function taoDateGia(hop) {
  return class DateGia extends Date {
    constructor(...a) { if (a.length === 0) super(hop.moc); else super(...a); }
    static now() { return hop.moc; }
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
    demGoiGhi: 0
  };

  const hopThoiGian = { moc: (o.ngay ? new Date(o.ngay) : new Date('2026-09-08T03:00:00Z')).getTime() };
  sim.datNgay = (x) => { hopThoiGian.moc = new Date(x).getTime(); };
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
      flush() { sim.soLanFlush++; }
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

  function phanHoiJson(chuoi) {
    sim.chuOiDaTraVe.push(chuoi);
    const l = doiTuongLoi();
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
    return phanHoiJson(noiDung);
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

/** Nạp lõi phía MÁY TÍNH (không có dịch vụ Google) — dùng cho dungGoiGhi và dựng dữ liệu thử. */
function napLoiMay() { return napGs(FILE_LOI_MAY, {}); }

module.exports = {
  taoGiaLap, napGs, napLoiMay, catCauMang,
  dungSheetGianHang, dungSheetDanhMuc, dungSheetMapping,
  BangTinhGia, SheetGia,
  URL_GIA, TIEU_DE_GIAN_HANG, FILE_VO_GOOGLE, FILE_LOI_MAY,
  HTML_DANG_NHAP, HTML_QUA_GIO, HTML_500, HTML_403
};
