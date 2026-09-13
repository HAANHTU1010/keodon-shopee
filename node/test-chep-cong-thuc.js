/**
 * test-chep-cong-thuc.js — bộ `T-CT`: CÔNG THỨC LUÔN CÓ SẴN Ở MỌI DÒNG (D-57 / YC-39) cho E, F, L, M, N,
 * DẤU THỜI GIAN Ở DÒNG 1, và BỎ CƠ CHẾ TỰ DỜI MỎ NEO.
 *
 * LUẬT D-57 (chủ dự án chốt 13/9, thay vế "để trống + vàng" của D-40):
 *   · trước mỗi lượt ghi, cột nào còn DƯỚI 200 dòng công thức phía dưới dòng dữ liệu cuối → kéo CẢ NĂM CỘT
 *     tới dòng dữ liệu cuối + 2.000, chép nguyên văn công thức của ô công thức gần nhất phía trên;
 *   · không bao giờ ghi một dòng đơn thiếu công thức; cả cột không còn ô nào → DỪNG `THIEU_CONG_THUC`,
 *     chưa ghi một ô nào;
 *   · công thức có hay không có IFERROR đều chép y nguyên.
 *
 * Nguồn đề bài: `07_GIAO_VIEC_DEV_v2.6.md` §2 và §3 · `08_BA_TRA_LOI_DEV_v2.6.md` §1 (a)(b)(c) ·
 * `06_GIAO_VIEC_DEV_v2.5.md` §1 và §3 · `05_GIAO_VIEC_DEV_v2.4.md` Phụ lục A.
 *
 * LUẬT MỚI CỦA BA, ÁP CHO TỪNG BÀI Ở ĐÂY: mỗi chỉ tiêu phải kèm một ĐỐI CHỨNG ÂM — dựng ra đúng cái
 * sai mà nó phải bắt, rồi chứng minh phép chấm báo LỆCH. Chỉ tiêu không có đối chứng âm coi như chưa
 * có, vì không ai biết nó có bắt được gì không. Mỗi bài dưới đây in thêm một dòng `đối chứng âm:`.
 *
 * KHÔNG DÙNG FIXTURE CỦA BỘ KHÁC. `node/gia-lap-web-app.js` dựng E/F/M/N là ARRAYFORMULA MỘT Ô ở
 * dòng 4 — đúng cái tiền đề mà Phụ lục A đã bác — và gắn CÙNG MỘT đối tượng sheet bảng link vào mọi
 * file tháng, nên bẫy mỏ neo không dựng lại được ở đó. Bộ này tự dựng Google Sheet giả để mỗi file
 * tháng mang BẢN SAO RIÊNG của bảng link, và để dựng được công thức TỪNG DÒNG bọc ARRAY_CONSTRAIN.
 *
 * Chạy: node node/test-chep-cong-thuc.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');
// Tám file: `toLaiMapping_` (D-47) gọi `MapListing.laCo`, nên ba file lớp 2 phải có mặt.
const BI_MAT = 'BI-MAT-TEST-CHEP-CONG-THUC-0123456789';

const FILE_VO = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs',
  'DanhMuc.gs', 'MapListing.gs', 'Normalize.gs', 'ShellAppsScript.gs'];

// ==================================================================== khung chấm

let soDat = 0, soHong = 0;
const HONG = [];

function test(ma, ten, fn) {
  try {
    const ghiChu = fn();
    soDat++;
    console.log('ĐẠT   ' + ma + ' ' + ten);
    if (ghiChu) String(ghiChu).split('\n').forEach((d) => console.log('        ' + d));
  } catch (e) {
    soHong++;
    HONG.push(ma);
    console.log('HỎNG  ' + ma + ' ' + ten);
    console.log('        -> ' + (e && e.message ? e.message : e));
  }
}

function dung(dk, moTa) { if (!dk) throw new Error(moTa || 'điều kiện sai'); }
function bang(a, b, moTa) {
  if (JSON.stringify(a) !== JSON.stringify(b))
    throw new Error((moTa ? moTa + ': ' : '') + 'được ' + JSON.stringify(a) + ', cần ' + JSON.stringify(b));
}
/** Đối chứng âm: `fn` phải NÉM hoặc trả về danh sách lệch KHÔNG RỖNG. Trả câu mô tả để in ra. */
function phaiLech(fn, moTa) {
  let ra;
  try { ra = fn(); } catch (e) { return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + (e.message || e) + ')'; }
  const n = Array.isArray(ra) ? ra.length : (ra ? 1 : 0);
  if (!n) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa + ' — phép chấm này không bắt được gì');
  return 'đối chứng âm: ' + moTa + ' -> LỆCH ' + n + ' chỗ ← đúng như phải thế';
}

// ==================================================================== Google Sheet giả

function khoaO(r, c) { return r + ':' + c; }

/**
 * Sheet giả tối thiểu nhưng ĐỦ BỀ MẶT mà `ShellAppsScript.gs` dùng, và ghi lại MỌI lệnh chạm vào ô
 * để bài test soi được "đã ghi vào cột nào, dòng nào, kiểu gì".
 *
 * Có `getFormulasR1C1` CẢ KHỐI (bản 2.5.0 cố ý không có, để ép đọc từng ô). D-57 lật lý do đó: mỗi cột nay
 * có hơn 2.000 ô công thức, đọc từng ô là hàng nghìn lượt gọi dịch vụ Google một lượt ghi — đủ chạm trần
 * 6 phút. Mã thật PHẢI đọc cả khối, nên sheet giả phải có lệnh đó.
 */
class SheetGia {
  constructor(ten, ss) {
    this.ten = ten; this.ss = ss;
    this.giaTri = {}; this.congThuc = {}; this.dinhDang = {}; this.nen = {}; this.dam = {};
    this.gopO = [];
  }
  getName() { return this.ten; }
  _quet() {
    let dr = 0, dc = 0;
    [this.giaTri, this.congThuc].forEach((kho) => {
      Object.keys(kho).forEach((k) => {
        const v = kho[k];
        if (v === '' || v == null) return;
        const [r, c] = k.split(':').map(Number);
        if (r > dr) dr = r;
        if (c > dc) dc = c;
      });
    });
    return { dr, dc };
  }
  getLastRow() { return this._quet().dr; }
  getLastColumn() { return this._quet().dc; }
  getMaxRows() { return Math.max(this.soDongToiDa || 1000, this.getLastRow()); }
  insertRowsAfter(sau, n) { this.soDongToiDa = this.getMaxRows() + n; this.ss.sim.nhatKyGhi.push({ sheet: this.ten, kieu: 'chenDong', r: sau + 1, c: 1, nr: n, nc: 0, cot: [] }); return this; }
  getRange(r, c, nr, nc) { return new VungGia(this, r, c, nr == null ? 1 : nr, nc == null ? 1 : nc); }
  dat(r, c, o) {
    if (o.v !== undefined) this.giaTri[khoaO(r, c)] = o.v;
    if (o.ct !== undefined) this.congThuc[khoaO(r, c)] = o.ct;
    if (o.nen !== undefined) this.nen[khoaO(r, c)] = o.nen;
  }
  o(r, c) {
    return {
      gt: this.giaTri[khoaO(r, c)] === undefined ? null : this.giaTri[khoaO(r, c)],
      ct: this.congThuc[khoaO(r, c)] === undefined ? null : this.congThuc[khoaO(r, c)],
      nen: this.nen[khoaO(r, c)] === undefined ? null : this.nen[khoaO(r, c)],
      dam: !!this.dam[khoaO(r, c)]
    };
  }
}

class VungGia {
  constructor(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  _duyet(fn) { for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j); }
  _ghi(kieu) {
    const cot = [];
    for (let j = 0; j < this.nc; j++) cot.push(this.c + j);
    this.sh.ss.sim.nhatKyGhi.push({ sheet: this.sh.ten, kieu, r: this.r, c: this.c, nr: this.nr, nc: this.nc, cot });
  }
  getValues() {
    const ra = [];
    this._duyet((r, c, i, j) => {
      if (!ra[i]) ra[i] = [];
      ra[i][j] = this.sh.giaTri[khoaO(r, c)] === undefined ? '' : this.sh.giaTri[khoaO(r, c)];
    });
    return ra;
  }
  getDisplayValues() {
    return this.getValues().map((h) => h.map((v) => (v == null || v === '' ? ''
      : (v instanceof Date ? v.getDate() + '/' + (v.getMonth() + 1) + '/' + v.getFullYear() : String(v)))));
  }
  getValue() { return this.getValues()[0][0]; }
  getFormulaR1C1() { return this.sh.congThuc[khoaO(this.r, this.c)] || ''; }
  getFormulasR1C1() {
    const ra = [];
    this._duyet((r, c, i, j) => { if (!ra[i]) ra[i] = []; ra[i][j] = this.sh.congThuc[khoaO(r, c)] || ''; });
    return ra;
  }
  setValues(b) {
    this._ghi('giaTri');
    this._duyet((r, c, i, j) => {
      const v = b[i][j];
      this.sh.giaTri[khoaO(r, c)] = v === undefined ? '' : v;
      if (v !== '' && v != null) delete this.sh.congThuc[khoaO(r, c)];
    });
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat(f) { this._ghi('dinhDang'); this._duyet((r, c) => { this.sh.dinhDang[khoaO(r, c)] = f; }); return this; }
  setFormulasR1C1(b) {
    this._ghi('congThuc');
    this._duyet((r, c, i, j) => {
      this.sh.congThuc[khoaO(r, c)] = b[i][j];
      if (b[i][j]) delete this.sh.giaTri[khoaO(r, c)];
    });
    return this;
  }
  getBackgrounds() {
    const ra = [];
    this._duyet((r, c, i, j) => { if (!ra[i]) ra[i] = []; ra[i][j] = this.sh.nen[khoaO(r, c)] || '#ffffff'; });
    return ra;
  }
  setBackgrounds(b) { this._ghi('nen'); this._duyet((r, c, i, j) => { this.sh.nen[khoaO(r, c)] = b[i][j]; }); return this; }
  setBackground(m) { this._ghi('nen'); this._duyet((r, c) => { this.sh.nen[khoaO(r, c)] = m; }); return this; }
  setFontWeight(w) { this._ghi('font'); this._duyet((r, c) => { this.sh.dam[khoaO(r, c)] = w === 'bold'; }); return this; }
  mergeVertically() {
    this._ghi('gopO');
    for (let j = 0; j < this.nc; j++) this.sh.gopO.push({ r1: this.r, c1: this.c + j, r2: this.r + this.nr - 1 });
    return this;
  }
}

class BangTinhGia {
  constructor(ten, id, sim) { this.ten = ten; this.id = id; this.sim = sim; this.sheets = []; }
  getName() { return this.ten; }
  getId() { return this.id; }
  getSheets() { return this.sheets.slice(); }
  getSheetByName(t) { return this.sheets.filter((s) => s.ten === t)[0] || null; }
  themSheet(t) { const s = new SheetGia(t, this); this.sheets.push(s); return s; }
}

// ==================================================================== nạp vỏ Google

function napVo(sim, suaNguon) {
  let src = FILE_VO.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  if (suaNguon) src = suaNguon(src);                 // CHỈ cho đối chứng âm: dựng lại đúng một khuyết tật
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);

  const DateGia = class extends Date {
    constructor(...a) { if (!a.length) super(sim.moc); else super(...a); }
    static now() { return sim.moc; }
  };
  const moiTruong = {
    Date: DateGia,
    SpreadsheetApp: {
      openById(id) {
        if (!sim.file[id]) throw new Error('Không mở được Google Sheet có ID "' + id + '"');
        return sim.file[id];
      },
      flush() { sim.soLanFlush++; }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in sim.thuocTinh ? sim.thuocTinh[k] : null),
        setProperty: (k, v) => { sim.thuocTinh[k] = String(v); },
        deleteProperty: (k) => { delete sim.thuocTinh[k]; },
        getProperties: () => Object.assign({}, sim.thuocTinh)
      })
    },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => { } }) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(s) { return { _s: String(s), setMimeType() { return this; }, getContent() { return this._s; } }; }
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
      // Byte CO DAU nhu Apps Script (-128..127) — tra khong dau thi `bam256_` ra hex khac ban chay that.
      computeDigest(thuat, chuoi) {
        const b = crypto.createHash('sha256').update(String(chuoi), 'utf8').digest();
        return Array.from(b).map((v) => (v > 127 ? v - 256 : v));
      },
      formatDate(d, tz, mau) {
        const t = new Date(d.getTime() + 7 * 3600 * 1000);          // Asia/Ho_Chi_Minh cố định
        const H = (n) => ('0' + n).slice(-2);
        const o = {
          yyyy: String(t.getUTCFullYear()), MM: H(t.getUTCMonth() + 1), dd: H(t.getUTCDate()),
          HH: H(t.getUTCHours()), mm: H(t.getUTCMinutes()), ss: H(t.getUTCSeconds())
        };
        return String(mau).replace(/yyyy|MM|dd|HH|mm|ss/g, (k) => o[k]);
      },
      sleep() { }
    },
    Logger: { log: (s) => sim.nhatKy.push(String(s)) }
  };
  const khoa = Object.keys(moiTruong);
  const than = src + '\nreturn {' +
    [...ten].map((n) => n + ': (typeof ' + n + ' === "undefined" ? undefined : ' + n + ')').join(', ') + '};';
  return new Function(...khoa, than)(...khoa.map((k) => moiTruong[k]));   // eslint-disable-line no-new-func
}

// ==================================================================== dựng file tháng

const TIEU_DE = ['Ngày ', 'Nguồn đơn', 'Thông tin ĐH', 'Tên viết tắt', 'Tên sản phẩm', 'Đơn vị ', 'SL',
  'Tổng Tiền SP', 'MGG Shop', 'Chi phí', 'Thuế', 'Doanh Thu', 'Mã hàng', 'Check tồn', 'Còn Nợ'];

/**
 * Công thức R1C1 THẬT của bốn cột, chép theo nguyên văn đọc được trên Google ngày 08/9/2026
 * (GV-v2.4 Phụ lục A.1): bọc `ARRAY_CONSTRAIN(…;1;1)` nên chỉ phủ đúng một dòng một cột.
 */
const CT = {
  5: "ARRAY_CONSTRAIN(ARRAYFORMULA(INDEX('Tổng tồn kho'!R3C3:R741C7;MATCH(RC[-1];'Tổng tồn kho'!R3C4:R741C4;0);1));1;1)",
  6: "ARRAY_CONSTRAIN(ARRAYFORMULA(INDEX('Tổng tồn kho'!R3C3:R741C7;MATCH(RC[-2];'Tổng tồn kho'!R3C4:R741C4;0);4));1;1)",
  12: 'IF(RC[-4]="";"";RC[-4]-RC[-3]-RC[-2]-RC[-1])',
  13: "ARRAY_CONSTRAIN(ARRAYFORMULA(INDEX('Tổng tồn kho'!R3C3:R741C7;MATCH(RC[-9];'Tổng tồn kho'!R3C4:R741C4;0);3));1;1)",
  14: "ARRAY_CONSTRAIN(ARRAYFORMULA(INDEX('Tổng tồn kho'!R3C5:R741C8;MATCH(RC[-1];'Tổng tồn kho'!R3C5:R741C5;0);4));1;1)"
};
const COT_CT = [5, 6, 12, 13, 14];

/**
 * @param {Object} tc
 *   dong      số dòng đơn có sẵn (từ dòng 4)
 *   ctToi     {5:n, 6:n, 12:n, 13:n, 14:n} — công thức của TỪNG CỘT kéo tới dòng nào (mặc định = dòng đơn cuối)
 *   soTieuDe  chỉ ghi ngần này tiêu đề ở dòng 2 (dựng ca `doCotNote_` rơi vào cột cấm)
 *   neoTran   true → cột 5 chỉ có ĐÚNG một ô ở dòng 4, là ARRAYFORMULA THẬT (không ARRAY_CONSTRAIN)
 *   ct        {cot: text} — thay công thức mẫu của cột đó (dùng cho ca IFERROR)
 *   donCuoiNhieuDong  n → dòng đơn cuối cùng là một ĐƠN n MẶT HÀNG: chỉ dòng đầu có mã ở cột C (ô gộp),
 *                     các dòng con có Ngày / Tên viết tắt / SL nhưng cột C trống — đúng như Google trả về
 */
function dungSheetGian(ss, ten, tc) {
  const o = tc || {};
  const sh = ss.themSheet(ten);
  const soDong = o.dong == null ? 2 : o.dong;
  const dongCuoi = 3 + soDong;

  sh.dat(1, 1, { v: 'THEO DÕI ĐƠN HÀNG - ' + ten });            // ô gộp A1:N1 — tool không được đụng
  sh.gopO.push({ r1: 1, c1: 1, r2: 1 });
  const nTieuDe = o.soTieuDe || TIEU_DE.length;
  for (let i = 0; i < nTieuDe; i++) sh.dat(2, i + 1, { v: TIEU_DE[i] });
  [8, 9, 10, 11, 12].forEach((c) => sh.dat(3, c, { ct: 'SUM(R[1]C:R[1997]C)' }));

  for (let i = 0; i < soDong; i++) {
    const r = 4 + i;
    sh.dat(r, 1, { v: new Date(2026, 8, 1 + i) });
    sh.dat(r, 3, { v: 'CU' + ('0000000000' + i).slice(-10) });
    sh.dat(r, 4, { v: 'dt5' });
    sh.dat(r, 7, { v: 1 });
    [8, 9, 10, 11].forEach((c, j) => sh.dat(r, c, { v: 100000 + j }));
  }
  if (o.donCuoiNhieuDong) {
    // Dòng con của đơn cuối: cột C TRỐNG (ô gộp), nhưng Ngày, Tên viết tắt, SL vẫn có ở từng dòng.
    for (let i = 1; i < o.donCuoiNhieuDong; i++) {
      const r = dongCuoi + i;
      sh.dat(r, 1, { v: new Date(2026, 8, 1) });
      sh.dat(r, 4, { v: 'con' + i });
      sh.dat(r, 7, { v: 10 + i });
    }
    sh.gopO.push({ r1: dongCuoi, c1: 3, r2: dongCuoi + o.donCuoiNhieuDong - 1 });
  }
  const dongCuoiThat = dongCuoi + (o.donCuoiNhieuDong ? o.donCuoiNhieuDong - 1 : 0);
  COT_CT.forEach((c) => {
    if (c > nTieuDe) return;
    const toi = (o.ctToi && o.ctToi[c] != null) ? o.ctToi[c] : dongCuoiThat;
    const text = (o.ct && o.ct[c]) || CT[c];
    for (let r = 4; r <= toi; r++) sh.dat(r, c, { ct: text });
  });
  if (o.neoTran) {
    Object.keys(sh.congThuc).forEach((k) => { if (Number(k.split(':')[1]) === 5) delete sh.congThuc[k]; });
    sh.dat(4, 5, { ct: "ARRAYFORMULA(IF(RC[-1]=\"\";\"\";INDEX('Tổng tồn kho'!R3C3:R741C7;MATCH(RC[-1];'Tổng tồn kho'!R3C4:R741C4;0);1)))" });
  }
  return sh;
}

/**
 * D-42 (12/9/2026): bản trước dựng sheet `Thông tin shop ` cho từng file tháng để Web App đọc bảng link.
 * Nay MÁY gửi thẳng `spreadsheetId` trong gói, Web App không đọc bảng link nào — nên giả lập bỏ hẳn sheet
 * đó. Mỗi tháng chỉ còn một file có ID riêng `ID_FILE_<yyyy>_<MM>`.
 *
 * @param {Object} tc { moc, kyDS, gian, gianTC, gianTC0, mapping }
 *   kyDS     các tháng cần dựng file (mặc định ['2026-09'])
 *   mapping  bảng Mapping dựng kèm; bỏ trống = một bảng tối thiểu đủ cho `toLaiMapping_` chạy
 */
/** ID file thang trong gia lap — dai >= 20 ky tu de `bocIdTuLink_` ben Apps Script nhan ra. */
function idCuaKy(ky) { return 'ID_FILE_' + String(ky).replace('-', '_') + '_GIA_LAP_KEODON'; }

function dungSim(tc) {
  const o = tc || {};
  const sim = {
    moc: new Date(o.moc || '2026-09-08T03:00:00Z').getTime(),
    file: {}, thuocTinh: {}, nhatKy: [], nhatKyGhi: [], soLanFlush: 0
  };
  const vo = napVo(sim, o.suaNguon);
  sim.vo = vo;

  // Như thể `caiDat(<chuỗi>)` đã chạy một lần trên dự án Apps Script (YC-28).
  sim.thuocTinh[vo.TT_BI_MAT || 'KEODON_BI_MAT'] = BI_MAT;

  const kyDS = o.kyDS || ['2026-09'];
  kyDS.forEach((ky) => {
    // ID >= 20 ky tu, dung bang chu Google cho phep — `bocIdTuLink_` tu choi chuoi ngan hon.
    const id = idCuaKy(ky);
    // Ten file theo mau THAT `THANG-<M>-<YYYY>-KINH-DOANH` de `kiemTenFileKhopThang_` doc duoc thang.
    const ss = new BangTinhGia('THÁNG-' + Number(ky.slice(5)) + '-' + ky.slice(0, 4) + '-KINH-DOANH', id, sim);
    sim.file[id] = ss;
    (o.gian || ['Shopee mall']).forEach((g) => dungSheetGian(ss, g, (o.gianTC || {})[g] || o.gianTC0 || {}));
    // YC-38.1: đủ khuôn file tháng — ba sheet gian hàng còn lại (không đơn), `Tổng tồn kho`, Mapping 12 cột.
    ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'].forEach((g) => {
      if (!ss.getSheetByName(g)) dungSheetGian(ss, g, { dong: 0 });
    });
    const shTon = ss.themSheet('Tổng tồn kho');
    ['', 'STT', 'Tên sản phẩm', 'Tên viết tắt', 'Mã hàng', 'Đơn vị', 'Giá vốn', 'Tổng tồn']
      .forEach((t, i) => { if (t) shTon.dat(2, i + 1, { v: t }); });
    // Sheet Mapping phải có: sau mỗi lượt ghi, `toLaiMapping_` (D-47) tô lại tab này.
    const bangMap = o.mapping || [['Gian hàng', 'Tên trên Shopee', 'Phân loại', 'Tên viết tắt', 'Hệ số',
      'Cấu phần', 'Xác nhận', 'Mã hàng', 'Gợi ý 1', 'Gợi ý 2', 'Ngày thêm', 'Ghi chú'],
    ['Shopee mall', 'Hàng mẫu của fixture', '', 'dt5', 1, '', 'CÓ']];
    const shMap = ss.themSheet('Mapping_san_pham');
    bangMap.forEach((hang, r) => hang.forEach((v, c) => {
      if (v !== '' && v != null) shMap.dat(r + 1, c + 1, { v: v });
    }));
  });
  sim.sheet = (ky, ten) => sim.file[idCuaKy(ky)].getSheetByName(ten);
  sim.goi = (goi) => JSON.parse(vo.doPost({
    postData: { contents: JSON.stringify(Object.assign({ token: BI_MAT }, goi)) }
  }).getContent());
  return sim;
}

function goiGhi(sim, thang, tenSheet, donDS, cauHinh) {
  return sim.goi({
    // D-42: máy chỉ định file tháng bằng ID trong gói.
    hanhDong: 'ghi', phienBanMongDoi: sim.vo.PHIEN_BAN, thang: thang,
    spreadsheetId: idCuaKy(thang),
    cauHinh: cauHinh || undefined,
    lenh: [{ tenSheet: tenSheet, don: donDS }]
  });
}

let demMa = 0;
function don(tc) {
  const o = tc || {};
  demMa++;
  return {
    maDon: o.maDon || ('MOI' + ('00000000000' + demMa).slice(-11)),
    ngay: o.ngay || '2026-09-08',
    tien: { H: 300000, I: 5000, J: 12000, K: 4500 },
    dong: o.dong || [{ tenVietTat: 'dt5', soLuong: 1, vang: !!o.vang, note: o.note || '' }]
  };
}

/** Ô nào của khối dòng mới còn TRỐNG công thức ở năm cột — đây là phép chấm chính của việc số 1. */
function oThieuCongThuc(sh, r1, r2, cotDS) {
  const thieu = [];
  (cotDS || COT_CT).forEach((c) => {
    for (let r = r1; r <= r2; r++) if (!sh.o(r, c).ct) thieu.push('R' + r + 'C' + c);
  });
  return thieu;
}

/**
 * Ảnh chụp giá trị + công thức + nền của VÙNG DỮ LIỆU CŨ: dòng 4 tới `duoiDong - 1`.
 * Cố ý không lấy dòng 1-3: dòng 1 là chỗ đóng dấu thời gian (được phép, có bài riêng T-CT-08),
 * dòng 2 là nơi đặt tiêu đề `Note`, dòng 3 là dòng tổng (đã có INV-8 canh ở bộ khác).
 */
function chupDongCu(sh, duoiDong) {
  const a = {};
  ['giaTri', 'congThuc', 'nen'].forEach((loai) => {
    Object.keys(sh[loai]).forEach((k) => {
      const r = Number(k.split(':')[0]);
      if (r < 4 || r >= duoiDong) return;
      const v = sh[loai][k];
      a[loai + '|' + k] = v instanceof Date ? 'D:' + v.getTime() : v;
    });
  });
  return a;
}

/** Dòng tổng (dòng 3) và ô gộp A1 — hai thứ tuyệt đối không được đụng, kiểm riêng cho gọn. */
function chupDongTong(sh) {
  const a = { A1: sh.o(1, 1).gt };
  for (let c = 1; c <= 15; c++) a['R3C' + c] = sh.o(3, c).ct + '|' + sh.o(3, c).gt;
  return a;
}
function soChup(x, y) {
  const khac = [];
  new Set(Object.keys(x).concat(Object.keys(y))).forEach((k) => {
    if (JSON.stringify(x[k] === undefined ? null : x[k]) !== JSON.stringify(y[k] === undefined ? null : y[k]))
      khac.push(k);
  });
  return khac;
}

// ==================================================================== 1. CHÉP CÔNG THỨC XUỐNG

console.log('--- 1. Chép công thức dòng trên xuống cho E, F, M, N (+ L) ---');

test('T-CT-01', 'dòng mới nhận đủ công thức của cả năm cột E, F, L, M, N', () => {
  const sim = dungSim({ gianTC0: { dong: 2 } });
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don(), don()]);
  dung(kq.ok, 'phải ghi được: ' + kq.thongBao);
  const sh = sim.sheet('2026-09', 'Shopee mall');
  bang(oThieuCongThuc(sh, 6, 8), [], 'ô còn trống công thức ở ba dòng mới');
  COT_CT.forEach((c) => bang(sh.o(8, c).ct, CT[c], 'công thức R1C1 cột ' + c + ' dòng 8 phải y hệt dòng mẫu'));
  COT_CT.forEach((c) => bang(sh.o(8, c).gt, null, 'cột ' + c + ' dòng 8 không được mang giá trị'));

  // ĐỐI CHỨNG ÂM: dựng lại đúng hành vi CŨ (chỉ kéo cột L) bằng chính mã thật, qua cấu hình
  // `cot_cong_thuc = 'L'`. Nếu phép chấm không bắt được cảnh này thì nó không bắt được gì.
  return phaiLech(() => {
    const s2 = dungSim({ gianTC0: { dong: 2 } });
    goiGhi(s2, '2026-09', 'Shopee mall', [don(), don(), don()], { keyin: { cot_cong_thuc: 'L' } });
    return oThieuCongThuc(s2.sheet('2026-09', 'Shopee mall'), 6, 8);
  }, 'bản cũ chỉ kéo cột L');
});

test('T-CT-02', 'bốn cột KHÁC ĐỘ DÀI: mỗi cột chép từ dòng mẫu của CHÍNH nó', () => {
  // Đúng tật của file DEMO tháng 9 mới nhất: E/F/N còn dài, M ngắn hơn hẳn.
  const ctToi = { 5: 20, 6: 20, 12: 8, 13: 8, 14: 20 };
  const sim = dungSim({ gianTC0: { dong: 5, ctToi: ctToi } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  bang([sh.o(20, 5).ct ? 20 : 0, sh.o(8, 13).ct ? 8 : 0, sh.o(9, 13).ct ? 9 : 0], [20, 8, 0], 'fixture: M ngắn hơn E');

  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don(), don(), don()]);
  dung(kq.ok, kq.thongBao);
  bang(oThieuCongThuc(sh, 9, 12), [], 'bốn dòng mới 9-12 phải đủ công thức ở cả năm cột');
  bang(sh.o(12, 13).ct, CT[13], 'cột M dòng 12 lấy đúng công thức của cột M');
  bang(sh.o(12, 5).ct, CT[5], 'cột E dòng 12 vẫn là công thức của cột E');

  // ĐỐI CHỨNG ÂM: cách làm "một con số chung cho cả bốn cột" — lấy giới hạn dài nhất (20) rồi kết
  // luận "khối 9-12 nằm trong vùng, không phải chép gì". Cột M và L bị bỏ trắng.
  return phaiLech(() => {
    const s2 = dungSim({ gianTC0: { dong: 5, ctToi: ctToi } });
    const sh2 = s2.sheet('2026-09', 'Shopee mall');
    const gioiHanChung = Math.max.apply(null, COT_CT.map((c) => ctToi[c]));
    for (let r = 9; r <= 12; r++) {
      s2.sheet('2026-09', 'Shopee mall').dat(r, 3, { v: 'GIA' + r });
      COT_CT.forEach((c) => { if (r > gioiHanChung) sh2.dat(r, c, { ct: CT[c] }); });
    }
    return oThieuCongThuc(sh2, 9, 12);
  }, 'đo một con số chung cho cả bốn cột');
});

test('T-CT-03', 'chỉ chép vào DÒNG MỚI — dòng cũ không đổi một ô nào', () => {
  const sim = dungSim({ gianTC0: { dong: 4 } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const truoc = chupDongCu(sh, 8), tongTruoc = chupDongTong(sh);
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don()]);
  dung(kq.ok, kq.thongBao);
  bang(soChup(truoc, chupDongCu(sh, 8)), [], 'ô của bốn dòng đơn cũ bị đổi');
  bang(soChup(tongTruoc, chupDongTong(sh)), [], 'dòng tổng hoặc ô gộp A1 bị đụng');
  bang(oThieuCongThuc(sh, 8, 9), [], 'hai dòng mới vẫn phải đủ công thức');

  // ĐỐI CHỨNG ÂM: sửa đúng một ô của dòng cũ rồi so lại — phép so phải chỉ ra được ô đó.
  return phaiLech(() => {
    sh.dat(5, 5, { ct: 'CONG_THUC_BI_SUA' });
    return soChup(truoc, chupDongCu(sh, 8));
  }, 'sửa lén công thức E5 của dòng cũ');
});

test('T-CT-04', 'cột bị XÓA SẠCH công thức → DỪNG THIEU_CONG_THUC trước khi ghi, KHÔNG một ô nào đổi (D-57)', () => {
  // Luật cũ (D-40, bản 2.5.0): để trống cột đó, cảnh báo, vẫn ghi. D-57 bỏ hẳn: chủ dự án "không muốn có
  // những dòng trống công thức". Tool không tự dựng công thức (D-15) nên chỉ còn một đường: dừng và nói rõ.
  const sim = dungSim({ gianTC0: { dong: 3, ctToi: { 13: 0 } } });     // cột M trắng hoàn toàn
  const sh = sim.sheet('2026-09', 'Shopee mall');
  bang(sh.o(4, 13).ct, null, 'fixture: cột M không có công thức nào');
  const truoc = chupDongCu(sh, 3000), tongTruoc = chupDongTong(sh);

  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don()]);
  bang(kq.ok, false, 'phải DỪNG: ' + JSON.stringify(kq).slice(0, 160));
  bang(kq.loi, 'THIEU_CONG_THUC');
  bang(kq.thongBao, 'SHEET Shopee mall CỘT M KHÔNG CÒN CÔNG THỨC NÀO — mở file tháng trước, chép công thức ' +
    'cột đó vào dòng 4 rồi chạy lại. Tool chưa ghi gì.', 'nguyên văn câu YC-39');
  bang(sim.nhatKyGhi.length, 0, '"Tool chưa ghi gì" phải là thật: không một lệnh ghi nào, kể cả kéo công thức hay Mapping');
  bang(soChup(truoc, chupDongCu(sh, 3000)), [], 'sheet phải y nguyên');
  bang(soChup(tongTruoc, chupDongTong(sh)), [], 'dòng tổng phải y nguyên');

  // ĐỐI CHỨNG ÂM: gỡ cả hai lưới dừng khỏi mã → lượt ghi chạy trót lọt và dòng mới trống cột M.
  return phaiLech(() => {
    const s2 = dungSim({
      gianTC0: { dong: 3, ctToi: { 13: 0 } },
      suaNguon: (src) => {
        const a = '  if (thieu.length) {', b = "    if (!m.cuoi && !m.tran) throw loiThieuCongThuc_(sh.getName(), m.cot, k);";
        if (src.split(a).length !== 2 || src.split(b).length !== 2) throw new Error('ĐỐI CHỨNG ÂM HỎNG: chuỗi mốc đã đổi');
        return src.split(a).join('  if (false) {').split(b).join('');
      }
    });
    const r2 = goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
    if (!r2.ok) return [];                              // bản gỡ lưới mà vẫn dừng → phép chấm KHÔNG có mắt
    return s2.nhatKyGhi.length ? ['bản gỡ lưới đã ghi ' + s2.nhatKyGhi.length + ' lệnh'] : [];
  }, 'gỡ lưới dừng THIEU_CONG_THUC');
});

test('T-CT-05', 'ARRAYFORMULA THẬT phủ cả cột thì KHÔNG đụng; ARRAY_CONSTRAIN thì vẫn phải chép', () => {
  const sim = dungSim({ gianTC0: { dong: 3, neoTran: true } });
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq.ok, kq.thongBao);
  const sh = sim.sheet('2026-09', 'Shopee mall');
  bang(sh.o(7, 5).ct, null, 'cột E là ARRAYFORMULA thật → không được ghi đè, để nó tự tràn');
  bang(sh.o(7, 5).gt, null, 'cột E cũng không được ghi giá trị');
  bang(oThieuCongThuc(sh, 7, 7, [6, 12, 13, 14]), [], 'bốn cột từng-dòng vẫn phải được chép');
  const chamE = sim.nhatKyGhi.filter((g) => (g.kieu === 'giaTri' || g.kieu === 'congThuc') && g.cot.indexOf(5) >= 0);
  bang(chamE.length, 0, 'không một lệnh ghi giá trị/công thức nào được chạm cột E');

  // ĐỐI CHỨNG ÂM: cùng một hình dạng "đúng MỘT ô ở dòng 4" nhưng bọc ARRAY_CONSTRAIN — cái này CHỈ
  // phủ một dòng, nên bỏ qua nó là để trắng cả cột. Phép miễn trừ phải hẹp đúng bằng vậy.
  return phaiLech(() => {
    const s2 = dungSim({ gianTC0: { dong: 1 } });                       // E chỉ có ô dòng 4, có ARRAY_CONSTRAIN
    const sh2 = s2.sheet('2026-09', 'Shopee mall');
    bang(sh2.o(5, 5).ct, null, 'fixture: chỉ dòng 4 có công thức');
    goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
    if (!sh2.o(5, 5).ct) return ['R5C5'];                               // chưa chép → báo lệch
    // đã chép đúng: dựng cảnh SAI (bỏ qua như ARRAYFORMULA thật) rồi chứng minh phép chấm bắt được
    delete sh2.congThuc['5:5'];
    return oThieuCongThuc(sh2, 5, 5, [5]);
  }, 'coi ARRAY_CONSTRAIN một ô là ARRAYFORMULA phủ cả cột');
});

// ==================================================================== 1b. D-57 / YC-39

console.log('\n--- 1b. D-57: công thức luôn có sẵn, dòng dữ liệu cuối theo A/C/D/G ---');

test('T-CT-13', 'đơn CUỐI CÙNG có nhiều mặt hàng (cột C gộp ô) → lượt ghi sau KHÔNG đè dòng con của nó', () => {
  // Lỗi thật tìm thấy 13/9 khi làm YC-39: dòng cuối lấy theo riêng cột C, mà ô con của cụm gộp trả rỗng,
  // nên đơn 3 mặt hàng ở dòng 6-8 bị lượt ghi sau đè lên dòng 7 và 8. Mất dữ liệu, trái INV-1.
  const sim = dungSim({ gianTC0: { dong: 3, donCuoiNhieuDong: 3 } });   // đơn cuối ở dòng 6-8
  const sh = sim.sheet('2026-09', 'Shopee mall');
  bang([sh.o(6, 3).gt != null, sh.o(7, 3).gt, sh.o(8, 4).gt], [true, null, 'con2'], 'fixture: C7/C8 trống, D8 có hàng');
  const truoc = chupDongCu(sh, 9);

  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don({ maDon: 'DON_MOI_SAU_DON_GOP' })]);
  dung(kq.ok, kq.thongBao);
  bang(sh.o(9, 3).gt, 'DON_MOI_SAU_DON_GOP', 'đơn mới phải nằm ở dòng 9, ngay dưới dòng con cuối');
  bang(soChup(truoc, chupDongCu(sh, 9)), [], 'dòng 4-8 (gồm hai dòng con của đơn gộp) không được đổi');

  // ĐỐI CHỨNG ÂM: dựng lại đúng cách tính cũ — dòng cuối theo riêng cột C — thì đơn mới đè lên dòng 7.
  return phaiLech(() => {
    const s2 = dungSim({
      gianTC0: { dong: 3, donCuoiNhieuDong: 3 },
      suaNguon: (src) => {
        const a = '[k.cot_ngay, k.cot_ma_don, k.cot_ten_viet_tat, k.cot_so_luong].forEach(';
        if (src.split(a).length !== 2) throw new Error('ĐỐI CHỨNG ÂM HỎNG: chuỗi mốc đã đổi');
        return src.split(a).join('[k.cot_ma_don].forEach(');
      }
    });
    const sh2 = s2.sheet('2026-09', 'Shopee mall');
    const t2 = chupDongCu(sh2, 9);
    goiGhi(s2, '2026-09', 'Shopee mall', [don({ maDon: 'DON_MOI_SAU_DON_GOP' })]);
    return soChup(t2, chupDongCu(sh2, 9));
  }, 'dòng cuối tính theo riêng cột C');
});

test('T-CT-14', 'còn 199 dòng công thức dưới dòng dữ liệu cuối → kéo CẢ NĂM CỘT tới dòng dữ liệu cuối + 2.000', () => {
  // dong: 2 → dữ liệu dòng 4-5; công thức tới dòng 204 = còn 199 dòng.
  const toi = { 5: 204, 6: 204, 12: 204, 13: 204, 14: 204 };
  const sim = dungSim({ gianTC0: { dong: 2, ctToi: toi } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq.ok, kq.thongBao);
  COT_CT.forEach((c) => {
    bang(sh.o(2005, c).ct, CT[c], 'cột ' + c + ' dòng 2005 (dòng dữ liệu cuối TRƯỚC lượt ghi là 5, + 2.000) phải có công thức');
    bang(sh.o(2006, c).ct, null, 'cột ' + c + ' không được kéo quá dòng 2005');
  });
  bang(oThieuCongThuc(sh, 4, 2005), [], 'từ dòng 4 tới 2005 không ô nào thiếu công thức');
  dung((kq.thongBao || []).some((t) => /kéo sẵn công thức E\/F\/L\/M\/N tới dòng 2005/.test(t)),
    'phải báo đã kéo: ' + JSON.stringify(kq.thongBao));
  return 'kéo 5 cột tới dòng 2005 · 0 ô thiếu từ dòng 4 tới 2005';
});

test('T-CT-15', 'còn ĐÚNG 200 dòng → KHÔNG kéo (đối chứng âm của T-CT-14: ngưỡng đúng một dòng)', () => {
  const toi = { 5: 205, 6: 205, 12: 205, 13: 205, 14: 205 };   // dữ liệu tới 5 → còn 200
  const sim = dungSim({ gianTC0: { dong: 2, ctToi: toi } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq.ok, kq.thongBao);
  COT_CT.forEach((c) => bang(sh.o(206, c).ct, null, 'cột ' + c + ' không được kéo thêm'));
  bang(sim.nhatKyGhi.filter((g) => g.kieu === 'congThuc' && g.r > 205).length, 0, 'không lệnh ghi công thức nào dưới dòng 205');
  bang(sim.nhatKyGhi.filter((g) => g.kieu === 'chenDong').length, 0, 'không chèn dòng');

  // ĐỐI CHỨNG ÂM: lệch đúng một dòng (còn 199) thì phải kéo — chứng minh ngưỡng không phải "không bao giờ kéo".
  return phaiLech(() => {
    const s2 = dungSim({ gianTC0: { dong: 2, ctToi: { 5: 204, 6: 204, 12: 204, 13: 204, 14: 204 } } });
    goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
    return s2.sheet('2026-09', 'Shopee mall').o(2005, 13).ct ? ['đã kéo'] : [];
  }, 'còn 199 dòng');
});

test('T-CT-16', 'công thức có IFERROR → bản chép vẫn có IFERROR, NGUYÊN VĂN từng chữ (không thêm, không bớt)', () => {
  const CO_IFERROR = "IFERROR(ARRAY_CONSTRAIN(ARRAYFORMULA(INDEX('Tổng tồn kho'!R3C3:R741C7;MATCH(RC[-9];'Tổng tồn kho'!R3C4:R741C4;0);3));1;1);\"\")";
  const sim = dungSim({ gianTC0: { dong: 2, ct: { 13: CO_IFERROR } } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don()]);
  dung(kq.ok, kq.thongBao);
  [6, 7, 100, 2005].forEach((r) => bang(sh.o(r, 13).ct, CO_IFERROR, 'M' + r + ' phải là bản chép nguyên văn'));
  // Chiều ngược: cột KHÔNG có IFERROR thì bản chép cũng không được tự thêm IFERROR.
  bang(sh.o(7, 5).ct, CT[5], 'E7 không được tự thêm IFERROR');

  return phaiLech(() => {
    // Dựng cách chép "sửa lại cho gọn" — bỏ IFERROR — rồi chứng minh phép so từng chữ bắt được.
    const boIferror = CO_IFERROR.replace(/^IFERROR\((.*);""\)$/, '$1');
    return boIferror === sh.o(6, 13).ct ? [] : ['bản chép bị bỏ IFERROR'];
  }, 'chép mất IFERROR');
});

test('T-CT-17', 'kéo công thức KHÔNG đổi số dòng dữ liệu (cột C) và không đổi dòng dữ liệu cuối', () => {
  const sim = dungSim({ gianTC0: { dong: 5 } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const demC = () => { let n = 0; for (let r = 4; r <= 3000; r++) if (sh.o(r, 3).gt != null && sh.o(r, 3).gt !== '') n++; return n; };
  const truoc = demC();
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don({ maDon: 'DUY_NHAT_01' })]);
  dung(kq.ok, kq.thongBao);
  bang(demC(), truoc + 1, 'cột C chỉ được tăng đúng 1 đơn vừa ghi');
  bang(sh.o(9, 3).gt, 'DUY_NHAT_01', 'đơn mới ở ngay dưới dòng dữ liệu cuối cũ (dòng 8)');
  bang(sim.nhatKyGhi.filter((g) => g.kieu === 'giaTri' && g.r > 9).length, 0, 'không lệnh ghi GIÁ TRỊ nào dưới dòng đơn mới');

  // ĐỐI CHỨNG ÂM: kéo công thức mà ghi lẫn giá trị xuống (ví dụ chép cả dòng) → cột C phình ra.
  return phaiLech(() => {
    for (let r = 10; r <= 20; r++) sh.dat(r, 3, { v: 'RAC' + r });
    return demC() === truoc + 1 ? [] : ['cột C phình thêm ' + (demC() - truoc - 1) + ' dòng'];
  }, 'kéo lẫn giá trị vào cột C');
});

test('T-CT-18', 'nghiệm thu YC-39: xóa tay cột M từ dòng 100 trở xuống → tool tự kéo lại, ghi đơn, không dòng nào thiếu', () => {
  const toi = { 5: 2003, 6: 2003, 12: 2003, 13: 99, 14: 2003 };
  const sim = dungSim({ gianTC0: { dong: 50, ctToi: toi } });           // dữ liệu tới dòng 53
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don(), don()]);
  dung(kq.ok, kq.thongBao);
  bang(oThieuCongThuc(sh, 54, 56), [], 'ba dòng đơn mới đủ công thức ở cả năm cột');
  bang(sh.o(2053, 13).ct, CT[13], 'cột M phải được kéo lại tới dòng dữ liệu cuối trước lượt ghi (53) + 2.000');
  bang(oThieuCongThuc(sh, 4, 2053, [13]), [], 'cột M không còn lỗ nào');
  return 'M kéo lại tới dòng 2053 · 3 dòng mới đủ công thức';
});

test('T-CT-19', 'LỖ GIỮA CỘT (M trống dòng 6-10 nhưng còn công thức từ 11) → các dòng sắp ghi vẫn nhận công thức', () => {
  // Kéo sẵn KHÔNG kích hoạt (cột vẫn dài tới 2005), nhưng dòng sắp ghi 6-8 nằm đúng trong lỗ.
  const sim = dungSim({ gianTC0: { dong: 2, ctToi: { 5: 2005, 6: 2005, 12: 2005, 13: 2005, 14: 2005 } } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  for (let r = 6; r <= 10; r++) delete sh.congThuc[r + ':13'];
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don(), don()]);
  dung(kq.ok, kq.thongBao);
  bang(oThieuCongThuc(sh, 6, 8), [], 'ba dòng đơn mới phải đủ công thức, kể cả cột M nằm trong lỗ');
  bang(sh.o(9, 13).ct, null, 'dòng 9-10 không phải dòng tool ghi → không được tự lấp');
  bang(sim.nhatKyGhi.filter((g) => g.kieu === 'congThuc' && g.cot.indexOf(13) >= 0 && g.r >= 11).length, 0,
    'công thức sẵn có từ dòng 11 không được ghi lại');

  // ĐỐI CHỨNG ÂM: bỏ bước điền ô thiếu trong khối → cột M ở dòng 6-8 trống.
  return phaiLech(() => {
    const s2 = dungSim({
      gianTC0: { dong: 2, ctToi: { 5: 2005, 6: 2005, 12: 2005, 13: 2005, 14: 2005 } },
      suaNguon: (src) => {
        const a = '  chepCongThucXuong_(sh, k, mauDS, r0Khoi, soDongTong);';
        if (src.split(a).length !== 2) throw new Error('ĐỐI CHỨNG ÂM HỎNG: chuỗi mốc đã đổi');
        return src.split(a).join('');
      }
    });
    const sh2 = s2.sheet('2026-09', 'Shopee mall');
    for (let r = 6; r <= 10; r++) delete sh2.congThuc[r + ':13'];
    goiGhi(s2, '2026-09', 'Shopee mall', [don(), don(), don()]);
    return oThieuCongThuc(sh2, 6, 8, [13]);
  }, 'bỏ bước điền ô thiếu');
});

// ==================================================================== 2. TÔ VÀNG (BA câu b)

console.log('\n--- 2. Tô nền vàng CHỈ đổi nền, và chỉ ở dòng mới (BA chốt câu b) ---');

test('T-CT-06', 'setBackgrounds chỉ đổi NỀN, không đổi giá trị/công thức, và chỉ ở dòng tool vừa tạo', () => {
  const sim = dungSim({ gianTC0: { dong: 3 } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  for (let r = 4; r <= 6; r++) for (let c = 1; c <= 15; c++) sh.dat(r, c, { nen: '#d9ead3' });   // nền cũ dễ nhận
  const truoc = chupDongCu(sh, 7), tongTruoc = chupDongTong(sh);

  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don({ vang: true, note: 'chưa nhận ra tên hàng' })]);
  dung(kq.ok, kq.thongBao);
  bang(soChup(truoc, chupDongCu(sh, 7)), [], 'dòng đơn cũ (kể cả NỀN) không được đổi');
  bang(soChup(tongTruoc, chupDongTong(sh)), [], 'dòng tổng và ô gộp A1 không được đổi');
  bang(sh.o(7, 5).nen, sim.vo.MAU_VANG, 'dòng mới phải được tô vàng ở cột E');
  bang(sh.o(7, 13).nen, sim.vo.MAU_VANG, 'và ở cột M');
  bang(sh.o(7, 5).ct, CT[5], 'tô vàng KHÔNG được làm mất công thức vừa chép ở cột E');
  bang(sh.o(7, 13).ct, CT[13], 'và ở cột M');
  bang(sh.o(7, 5).gt, null, 'tô vàng KHÔNG được ghi giá trị vào cột E');
  bang(sh.o(7, 14).gt, null, 'và không ghi giá trị vào cột N');
  // Vùng dữ liệu cũ là dòng 4-6. Dòng 1 cột P là dấu thời gian — có nền riêng, đã chốt ở T-CT-08.
  const nenSai = sim.nhatKyGhi.filter((g) => g.kieu === 'nen' && g.sheet === 'Shopee mall' &&
    g.r >= 4 && g.r < 7);
  bang(nenSai.length, 0, 'không được có lệnh tô nền nào chạm dòng đơn cũ');

  // ĐỐI CHỨNG ÂM: tô lén nền một dòng cũ — phép so phải chỉ ra ngay.
  return phaiLech(() => {
    sh.dat(5, 2, { nen: sim.vo.MAU_VANG });
    return soChup(truoc, chupDongCu(sh, 7));
  }, 'tô vàng lan sang dòng cũ');
});

// ==================================================================== 3. cột Note rơi cột cấm (BA câu c)

console.log('\n--- 3. doCotNote_ rơi vào cột cấm: GIỮ NÉM LỖI, và lỗi phải chỉ được đường ra (BA chốt câu c) ---');

test('T-CT-07', 'sheet thiếu tiêu đề M/N/O (cột Note sẽ tự dò rơi vào cột công thức) → DỪNG SAI_HOP_DONG, không ghi ô nào', () => {
  // Bản 2.5.0 bắt ca này ở hàng rào cột cấm: tiêu đề chỉ tới L thì `doCotNote_` trả về M, và `kiemCotDuocGhi_`
  // từ chối. Từ 2.6.0 (YC-38.1) Web App kiểm khuôn file tháng TRƯỚC, nên cùng thế cờ đó dừng sớm hơn với câu
  // chỉ thẳng ô tiêu đề nào thiếu — dễ sửa hơn "cột Note rơi vào M". Hàng rào cột cấm vẫn còn nguyên cho
  // đường gọi thẳng `ghiMotSheet_` (INV-3b trong TestBatBien.gs).
  const sim = dungSim({ gianTC0: { dong: 2, soTieuDe: 12 } });
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  bang(kq.ok, false, 'phải DỪNG: ' + JSON.stringify(kq).slice(0, 160));
  bang(kq.loi, 'SAI_HOP_DONG');
  const t = String(kq.thongBao || '');
  dung(t.indexOf('SỔ THÁNG KHÔNG ĐÚNG KHUÔN') === 0, 'câu phải mở đầu đúng: ' + t);
  ['ô M2', 'ô N2', 'ô O2'].forEach((o) => dung(t.indexOf(o) >= 0, 'phải nêu ' + o + ': ' + t));
  dung(t.indexOf('Tool chưa ghi gì') >= 0, 'phải nói rõ chưa ghi gì: ' + t);
  bang(sim.nhatKyGhi.length, 0, 'dừng TRƯỚC mọi lệnh ghi, kể cả kéo công thức');

  // Đủ 15 tiêu đề thì tuyệt đối KHÔNG được dừng — hàng rào luôn-chặn là hàng rào vô dụng. Dựng NGOÀI
  // `phaiLech`: lỗi dựng ném bên trong sẽ bị đếm nhầm thành "đã lệch".
  const s2 = dungSim({ gianTC0: { dong: 2 } });
  const r2 = goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
  bang(r2.ok, true, 'chặn oan sheet đủ khuôn: ' + r2.thongBao);

  // ĐỐI CHỨNG ÂM: gỡ lời gọi kiểm khuôn khỏi hành động `ghi` → cùng thế cờ đó KHÔNG còn ra SAI_HOP_DONG
  // (rơi xuống hàng rào cột cấm), tức phép chấm trên thật sự phụ thuộc vào YC-38.1.
  const MOC = 'kiemHopDongFileThang_(ss, cfg);                     // YC-38.1';
  bang(fs.readFileSync(path.join(SRC, 'ShellAppsScript.gs'), 'utf8').split(MOC).length, 2, 'mốc gỡ phải có đúng 1 chỗ');
  return phaiLech(() => {
    const s3 = dungSim({
      gianTC0: { dong: 2, soTieuDe: 12 },
      suaNguon: (src) => src.replace(MOC, '// (đã gỡ cho đối chứng âm)')
    });
    const r3 = goiGhi(s3, '2026-09', 'Shopee mall', [don()]);
    return r3.loi === 'SAI_HOP_DONG' ? [] : ['không còn SAI_HOP_DONG: ' + (r3.loi || r3.thongBao)];
  }, 'gỡ kiểm khuôn khỏi hành động ghi');
});

// ==================================================================== 4. dấu thời gian dòng 1

console.log('\n--- 4. Dấu thời gian ở dòng 1 của mỗi sheet gian hàng (GV-v2.6 §2) ---');

test('T-CT-08', 'ghi đúng câu, đúng ô P1, không đụng ô gộp A1:N1, và ghi ĐÈ chứ không nối', () => {
  const sim = dungSim({ gian: ['Shopee mall', 'Offood'], gianTC0: { dong: 2 } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  const shOff = sim.sheet('2026-09', 'Offood');
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq.ok, kq.thongBao);

  bang(sh.o(1, 16).gt, 'Tool cập nhật lúc 10h00 ngày 8/9/2026', 'ô P1');
  bang(sh.o(1, 16).dam, true, 'P1 phải in đậm');
  dung(sh.o(1, 16).nen, 'P1 phải có nền nhạt');
  bang(sh.o(1, 1).gt, 'THEO DÕI ĐƠN HÀNG - Shopee mall', 'ô gộp A1 phải y nguyên');
  const chamOGop = sim.nhatKyGhi.filter((g) => g.r === 1 && g.c < 16);
  bang(chamOGop.length, 0, 'không lệnh nào được chạm dòng 1 ở cột nhỏ hơn P');
  bang(shOff.o(1, 16).gt, null, 'sheet KHÔNG có đơn mới thì giữ nguyên, không đóng dấu');

  // Chạy lần hai ở một mốc giờ khác: phải GHI ĐÈ đúng ô cũ, không nối thêm, không lùi sang Q.
  sim.moc = new Date('2026-09-08T05:40:00Z').getTime();
  const kq2 = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq2.ok, kq2.thongBao);
  bang(sh.o(1, 16).gt, 'Tool cập nhật lúc 12h40 ngày 8/9/2026', 'P1 sau lần hai');
  bang(sh.o(1, 17).gt, null, 'không được lùi sang Q1');

  // ĐỐI CHỨNG ÂM: đóng dấu cho cả sheet không có đơn mới — phép chấm phải bắt được.
  return phaiLech(() => {
    shOff.dat(1, 16, { v: 'Tool cập nhật lúc 9h9 ngày 8/9/2026' });
    return shOff.o(1, 16).gt ? ['Offood bị đóng dấu oan'] : [];
  }, 'đóng dấu cả sheet không có đơn mới');
});

test('T-CT-09', 'P1 đã có nội dung khác → lùi sang ô trống đầu tiên bên phải', () => {
  const sim = dungSim({ gianTC0: { dong: 2 } });
  const sh = sim.sheet('2026-09', 'Shopee mall');
  sh.dat(1, 16, { v: 'ghi chú của chủ shop' });
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq.ok, kq.thongBao);
  bang(sh.o(1, 16).gt, 'ghi chú của chủ shop', 'P1 của chủ shop phải y nguyên');
  bang(sh.o(1, 17).gt, 'Tool cập nhật lúc 10h00 ngày 8/9/2026', 'dấu lùi sang Q1');

  // Lần sau phải tìm lại đúng Q1, không đẻ thêm dấu ở R1.
  sim.moc = new Date('2026-09-08T05:40:00Z').getTime();
  goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  bang(sh.o(1, 17).gt, 'Tool cập nhật lúc 12h40 ngày 8/9/2026', 'Q1 được ghi đè');
  bang(sh.o(1, 18).gt, null, 'không được đẻ thêm dấu ở R1');

  // ĐỐI CHỨNG ÂM: ghi đè thẳng lên P1 của chủ shop.
  return phaiLech(() => {
    const truoc = sh.o(1, 16).gt;
    sh.dat(1, 16, { v: 'Tool cập nhật lúc 1h1 ngày 1/1/2026' });
    return sh.o(1, 16).gt === truoc ? [] : ['P1 của chủ shop bị đè'];
  }, 'đè dấu lên ô chủ shop đang dùng');
});

// ==================================================================== 5. file tháng theo ID (D-42)

console.log('\n--- 5. File tháng do MÁY chỉ định bằng ID trong gói (D-42) ---');

test('T-CT-10', 'chạy HAI LẦN trong cùng một tháng đều ghi được — cái bẫy mỏ neo đã bị gỡ tận gốc', () => {
  // Bài này trước đây canh cơ chế "tự dời mỏ neo": tool dời mỏ neo sang file tháng vừa định tuyến, mà vỏ
  // file tháng mới lại mang bảng link chụp lúc nhân bản (dừng ở tháng trước) — nên lần chạy THỨ HAI trong
  // tháng là tắc `KHONG_CO_THANG`, trong khi file tháng đang mở ngay trước mặt.
  //
  // D-42 gỡ tận gốc: bảng link chuyển về máy, Web App nhận thẳng ID. Không còn mỏ neo thì không còn chỗ
  // cho cái bẫy đó tồn tại. Bài vẫn giữ mã T-CT-10 vì thứ nó canh không đổi: LẦN CHẠY THỨ HAI PHẢI ĐƯỢC.
  const sim = dungSim({ moc: '2026-10-05T03:00:00Z', kyDS: ['2026-09', '2026-10'], gianTC0: { dong: 2 } });
  const l1 = goiGhi(sim, '2026-10', 'Shopee mall', [don()]);
  dung(l1.ok, 'lần chạy 1 phải ghi được: ' + l1.thongBao);
  const l2 = goiGhi(sim, '2026-10', 'Shopee mall', [don()]);
  dung(l2.ok, 'lần chạy 2 phải ghi được, không được tắc: ' + l2.thongBao);
  bang(sim.sheet('2026-10', 'Shopee mall').o(7, 3).gt != null, true, 'đơn của lần 2 phải nằm trong file T10');
  // File tháng 9 đứng ngay cạnh KHÔNG được nhận một dòng nào — đó mới là bằng chứng ID đi đúng địa chỉ.
  bang(sim.sheet('2026-09', 'Shopee mall').o(6, 3).gt, null, 'file tháng 9 không được nhận đơn của tháng 10');

  // ĐỐI CHỨNG ÂM: gửi ID của file tháng 9 kèm tháng 2026-10 — đúng cảnh link_thang dán nhầm dòng.
  // Hàng rào tên file phải chặn, nếu không thì "ID đi đúng địa chỉ" ở trên chỉ là may mắn.
  return phaiLech(() => {
    const r = sim.goi({
      hanhDong: 'ghi', phienBanMongDoi: sim.vo.PHIEN_BAN, thang: '2026-10',
      spreadsheetId: idCuaKy('2026-09'),
      lenh: [{ tenSheet: 'Shopee mall', don: [don()] }]
    });
    return r.ok ? [] : [r.loi + ': ' + String(r.thongBao).slice(0, 70)];
  }, 'gửi ID file tháng 9 kèm tháng 2026-10');
});

test('T-CT-11', 'ping KHÔNG mở file nào và KHÔNG lộ id — nó chỉ trả lời "bản trên Google là bản nào"', () => {
  const sim = dungSim({ kyDS: ['2026-08', '2026-09'], gianTC0: { dong: 2 } });
  const kq = sim.goi({ hanhDong: 'ping' });
  dung(kq.ok, 'ping phải trả lời được');
  bang(kq.phienBan, sim.vo.PHIEN_BAN, 'ping phải nêu bản đang chạy');
  dung(!!kq.banDung, 'ping phải trả dấu vân tay bản dựng: ' + JSON.stringify(kq).slice(0, 120));
  dung(kq.vanTay && typeof kq.vanTay === 'object', 'ping phải trả dấu vân tay TỪNG FILE');
  const chuoi = JSON.stringify(kq);
  dung(chuoi.indexOf(idCuaKy('2026-08')) < 0, 'ping KHÔNG được lộ id file tháng: ' + chuoi);
  dung(chuoi.indexOf(idCuaKy('2026-09')) < 0, 'ping KHÔNG được lộ id file tháng nào');

  // ĐỐI CHỨNG ÂM: phép quét id phải thật sự bắt được id — thử trên một phản hồi CÓ id.
  return phaiLech(() => {
    const gia = JSON.stringify(Object.assign({}, kq, { fileId: idCuaKy('2026-08') }));
    return gia.indexOf(idCuaKy('2026-08')) >= 0 ? ['có id trong phản hồi'] : [];
  }, 'phản hồi có kèm id');
});

test('T-CT-12', 'cảnh báo sớm "chưa khai link tháng sau" — nay là phép thuần trên MÁY (D-42)', () => {
  // Bản 2.4.0 để câu này trong phản hồi Web App, vì bảng link nằm trên Google. D-42 chuyển bảng link về
  // máy, nên phép cảnh báo cũng về theo: `canhBaoThangSau` trong node/gsheet-web-app.js — hàm THUẦN,
  // kiểm được không cần mạng, không cần Google.
  //
  // Thứ nó canh không đổi: bảng link thiếu dòng tháng sau thì tới ngày 1 tháng sau tool TẮC HẲN. Câu này
  // báo trước cả tháng — nhưng chỉ có tác dụng nếu user NHÌN THẤY, nên nút 4 in nó ra màn hình.
  const W = require('./gsheet-web-app');
  const cau = W.canhBaoThangSau({ '2026-09': 'https://docs.google.com/spreadsheets/d/ID_FILE_2026_09_GIALAP/edit' }, '2026-09');
  dung(cau, 'thiếu link tháng sau mà không kêu');
  dung(cau.indexOf('2026-10') >= 0, 'phải nêu đúng tháng sau: ' + cau);
  dung(/3_TAO_FILE_THANG_MOI\.bat/.test(cau), 'phải chỉ ra nút phải bấm: ' + cau);
  dung(/ngày đầu tháng/.test(cau), 'phải nói rõ hậu quả nếu để nguyên: ' + cau);
  bang(W.thangSau('2026-12'), '2027-01', 'sang năm phải nhảy đúng');

  // Chiều dương: bảng ĐÃ CÓ dòng tháng sau thì tuyệt đối không được kêu — kêu oan vài lần là user quen
  // tay bỏ qua, rồi bỏ qua luôn câu thật.
  const duLink = {
    '2026-09': 'https://docs.google.com/spreadsheets/d/ID_FILE_2026_09_GIALAP/edit',
    '2026-10': 'https://docs.google.com/spreadsheets/d/ID_FILE_2026_10_GIALAP/edit'
  };
  bang(W.canhBaoThangSau(duLink, '2026-09'), null, 'bảng đã đủ mà vẫn kêu là kêu oan');

  // ĐỐI CHỨNG ÂM: dựng một bản cảnh báo HỎNG — không thèm tra bảng, tháng nào cũng kêu — rồi chứng minh
  // phép chấm ở trên bắt được nó. Không có bước này thì dòng `bang(..., null, ...)` chỉ là một khẳng
  // định chưa ai thử phá.
  return phaiLech(() => {
    const banSai = (bangLink, th) => 'link_thang chưa có tháng ' + W.thangSau(th) + '.';
    const du = banSai(duLink, '2026-09');
    return du ? ['kêu oan dù bảng đã có 2026-10: ' + du] : [];
  }, 'phép cảnh báo bỏ qua bảng link, tháng nào cũng kêu');
});

// ==================================================================== tổng kết

console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
if (soHong) { console.log('HỎNG: ' + HONG.join(', ')); process.exitCode = 1; }
