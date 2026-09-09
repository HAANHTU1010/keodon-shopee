/**
 * test-chep-cong-thuc.js — bộ `T-CT`: CHÉP CÔNG THỨC DÒNG TRÊN XUỐNG cho E, F, M, N (+ L),
 * DẤU THỜI GIAN Ở DÒNG 1, và BỎ CƠ CHẾ TỰ DỜI MỎ NEO.
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

const SRC = path.join(__dirname, '..', 'src');
const FILE_VO = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs', 'ShellAppsScript.gs'];

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
 * để bài test soi được "đã ghi vào cột nào, dòng nào, kiểu gì". Không có `getFormulasR1C1` cả khối —
 * cố ý, để bài test ép mã thật chỉ được dùng `getFormulaR1C1` từng ô như chú thích của nó đã hứa.
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

function napVo(sim) {
  const src = FILE_VO.map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
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

const BI_MAT = 'BI-MAT-TEST-CHEP-CONG-THUC-0123456789';
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
  COT_CT.forEach((c) => {
    if (c > nTieuDe) return;
    const toi = (o.ctToi && o.ctToi[c] != null) ? o.ctToi[c] : dongCuoi;
    for (let r = 4; r <= toi; r++) sh.dat(r, c, { ct: CT[c] });
  });
  if (o.neoTran) {
    Object.keys(sh.congThuc).forEach((k) => { if (Number(k.split(':')[1]) === 5) delete sh.congThuc[k]; });
    sh.dat(4, 5, { ct: "ARRAYFORMULA(IF(RC[-1]=\"\";\"\";INDEX('Tổng tồn kho'!R3C3:R741C7;MATCH(RC[-1];'Tổng tồn kho'!R3C4:R741C4;0);1)))" });
  }
  return sh;
}

/** Bảng link trong sheet `Thông tin shop ` — MỖI FILE THÁNG MỘT BẢN RIÊNG, đúng như thực tế. */
function dungBangLink(ss, vo, kyDS) {
  const sh = ss.themSheet(vo.TEN_SHEET_THONG_TIN_SHOP);
  for (let r = 1; r <= 6; r++) {
    sh.dat(r, 3, { v: 'TEN-DANG-NHAP-THAT-' + r });
    for (let c = 4; c <= 14; c++) sh.dat(r, c, { v: 'MAT-KHAU-GIAN-HANG-' + r });
  }
  kyDS.forEach((k, i) => {
    const r = 8 + i;
    sh.dat(r, 1, { v: Number(k.slice(0, 4)) });
    sh.dat(r, 2, { v: 'Kinh Doanh T' + Number(k.slice(5)) });
    sh.dat(r, 3, { v: 'https://docs.google.com/spreadsheets/d/ID_FILE_' + k.replace('-', '_') + '/edit#gid=0' });
  });
  return sh;
}

/**
 * @param {Object} tc { moc, kyDS, kyDSCuaFile, gian, thang }
 *   kyDS         các kỳ có trong bảng link của FILE MỎ NEO
 *   kyDSCuaFile  { 'yyyy-MM': [kỳ...] } — bảng link RIÊNG của từng file tháng (mặc định = kyDS)
 */
function dungSim(tc) {
  const o = tc || {};
  const sim = {
    moc: new Date(o.moc || '2026-09-08T03:00:00Z').getTime(),
    file: {}, thuocTinh: {}, nhatKy: [], nhatKyGhi: [], soLanFlush: 0
  };
  const vo = napVo(sim);
  sim.vo = vo;
  sim.thuocTinh[vo.TT_BI_MAT] = BI_MAT;

  const kyDS = o.kyDS || ['2026-09'];
  kyDS.forEach((ky) => {
    const id = 'ID_FILE_' + ky.replace('-', '_');
    const ss = new BangTinhGia('KINH DOANH T' + Number(ky.slice(5)) + '-' + ky.slice(0, 4), id, sim);
    sim.file[id] = ss;
    (o.gian || ['Shopee mall']).forEach((g) => dungSheetGian(ss, g, (o.gianTC || {})[g] || o.gianTC0 || {}));
    dungBangLink(ss, vo, (o.kyDSCuaFile && o.kyDSCuaFile[ky]) || kyDS);
  });
  sim.thuocTinh[vo.TT_MO_NEO] = 'ID_FILE_' + (o.moNeo || kyDS[0]).replace('-', '_');
  sim.sheet = (ky, ten) => sim.file['ID_FILE_' + ky.replace('-', '_')].getSheetByName(ten);
  sim.goi = (goi) => JSON.parse(vo.doPost({ postData: { contents: JSON.stringify(goi) } }).getContent());
  return sim;
}

function goiGhi(sim, thang, tenSheet, donDS, cauHinh) {
  return sim.goi({
    token: BI_MAT, hanhDong: 'ghi', phienBanMongDoi: sim.vo.PHIEN_BAN, thang: thang,
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

test('T-CT-04', 'cột không còn công thức nào để chép → để trống + cảnh báo, KHÔNG tự dựng công thức', () => {
  const sim = dungSim({ gianTC0: { dong: 3, ctToi: { 13: 0 } } });     // cột M trắng hoàn toàn
  const sh = sim.sheet('2026-09', 'Shopee mall');
  bang(sh.o(4, 13).ct, null, 'fixture: cột M không có công thức nào');

  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don(), don()]);
  dung(kq.ok, kq.thongBao);
  bang(oThieuCongThuc(sh, 7, 8, [13]), ['R7C13', 'R8C13'], 'cột M phải để TRỐNG, không được đoán');
  bang(oThieuCongThuc(sh, 7, 8, [5, 6, 12, 14]), [], 'bốn cột còn lại vẫn phải được chép');
  const cau = (kq.canhBao || []).filter((c) => c.indexOf('KHÔNG CÒN CÔNG THỨC ĐỂ CHÉP') >= 0);
  bang(cau.length, 1, 'phải có đúng một câu cảnh báo: ' + JSON.stringify(kq.canhBao));
  dung(cau[0].indexOf('cột M') >= 0, 'câu cảnh báo phải nêu đúng tên cột: ' + cau[0]);
  dung(cau[0].indexOf('Vẫn ghi, không chặn') >= 0, 'phải nói rõ là không chặn: ' + cau[0]);

  // Cảnh báo LUÔN-BẬT là cảnh báo vô dụng: sheet lành lặn thì tuyệt đối không được kêu câu này.
  const sLanh = dungSim({ gianTC0: { dong: 3 } });
  const rLanh = goiGhi(sLanh, '2026-09', 'Shopee mall', [don()]);
  bang((rLanh.canhBao || []).filter((c) => c.indexOf('KHÔNG CÒN CÔNG THỨC ĐỂ CHÉP') >= 0).length, 0,
    'kêu oan khi cột M vẫn còn công thức');
  bang(oThieuCongThuc(sLanh.sheet('2026-09', 'Shopee mall'), 7, 7), [], 'sheet lành lặn phải chép đủ');

  // ĐỐI CHỨNG ÂM: dựng lại đúng cái sai (cột M trắng công thức) và chứng minh phép chấm
  // "dòng mới đủ công thức" báo LỆCH — chứ không im lặng coi như xong.
  return phaiLech(() => {
    const s2 = dungSim({ gianTC0: { dong: 3, ctToi: { 13: 0 } } });
    const r2 = goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
    if (!(r2.canhBao || []).some((c) => c.indexOf('KHÔNG CÒN CÔNG THỨC ĐỂ CHÉP') >= 0))
      throw new Error('cột M trắng mà tool không kêu một câu nào');
    return oThieuCongThuc(s2.sheet('2026-09', 'Shopee mall'), 7, 7, [13]);
  }, 'cột M trắng công thức');
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

test('T-CT-07', 'cột Note tự dò ra cột công thức → từ chối ghi, nêu đúng cột và câu lệnh sửa', () => {
  // Sheet chỉ có tiêu đề tới cột L → doCotNote_ trả về M, đúng ca BA nêu.
  const sim = dungSim({ gianTC0: { dong: 2, soTieuDe: 12 } });
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(!kq.ok, 'phải TỪ CHỐI, không được ghi: ' + JSON.stringify(kq));
  const t = String(kq.thongBao || '');
  dung(t.indexOf('TỪ CHỐI GHI') >= 0, 'phải là câu từ chối: ' + t);
  dung(/cột M\b/.test(t), 'phải nêu ĐÚNG CỘT đã dò ra (M): ' + t);
  dung(t.indexOf('cot_note') >= 0, 'phải nêu khóa cần sửa: ' + t);
  dung(t.indexOf('Cấu hình') >= 0, 'phải chỉ ra chỗ sửa: ' + t);
  dung(/chạy lại/.test(t), 'phải nói làm gì tiếp: ' + t);
  bang(sim.nhatKyGhi.filter((g) => g.sheet === 'Shopee mall').length, 0, 'ném lỗi TRƯỚC mọi lệnh ghi');

  // ĐỐI CHỨNG ÂM: bố cục bình thường (tiêu đề tới O) thì tuyệt đối KHÔNG được ném — hàng rào
  // luôn-chặn là hàng rào vô dụng.
  return phaiLech(() => {
    const s2 = dungSim({ gianTC0: { dong: 2 } });
    const r2 = goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
    if (!r2.ok) throw new Error('chặn oan bố cục bình thường: ' + r2.thongBao);
    // dựng lại đúng ca sai (tiêu đề tới L) và chứng minh phép chấm bắt được
    const s3 = dungSim({ gianTC0: { dong: 2, soTieuDe: 12 } });
    const r3 = goiGhi(s3, '2026-09', 'Shopee mall', [don()]);
    return r3.ok ? [] : ['đã chặn: ' + r3.thongBao];
  }, 'bố cục thiếu tiêu đề mà vẫn cho ghi');
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

// ==================================================================== 5. mỏ neo

console.log('\n--- 5. Bỏ cơ chế tự dời mỏ neo (GV-v2.5 §1) ---');

/** Kịch bản 4 bước BA đã diễn lại: T10 là vỏ nhân bản, bảng link của nó DỪNG Ở T9. */
function simBayMoNeo() {
  return dungSim({
    moc: '2026-10-05T03:00:00Z',
    kyDS: ['2026-09', '2026-10'],
    kyDSCuaFile: { '2026-10': ['2026-09'] },     // vỏ T10 mang bảng link chụp lúc nhân bản
    moNeo: '2026-09',
    gianTC0: { dong: 2 }
  });
}

test('T-CT-10', 'định tuyến xong mỏ neo KHÔNG tự dời, và lần chạy THỨ HAI trong tháng vẫn chạy', () => {
  const sim = simBayMoNeo();
  const neoDau = sim.thuocTinh[sim.vo.TT_MO_NEO];
  bang(neoDau, 'ID_FILE_2026_09', 'mỏ neo ban đầu là file T9');

  const l1 = goiGhi(sim, '2026-10', 'Shopee mall', [don()]);
  dung(l1.ok, 'lần chạy 1 phải ghi được: ' + l1.thongBao);
  bang(sim.thuocTinh[sim.vo.TT_MO_NEO], neoDau, 'mỏ neo KHÔNG được dời sau khi định tuyến');

  const l2 = goiGhi(sim, '2026-10', 'Shopee mall', [don()]);
  dung(l2.ok, 'lần chạy 2 phải ghi được, không được tắc: ' + l2.thongBao);
  bang(sim.sheet('2026-10', 'Shopee mall').o(7, 3).gt != null, true, 'đơn của lần 2 phải nằm trong file T10');

  // ĐỐI CHỨNG ÂM: cắm lại đúng hành vi cũ (dời mỏ neo sang file vừa định tuyến) rồi chạy lần hai —
  // phải TẮC với KHONG_CO_THANG. Không tái hiện được cái bẫy thì bài này không chứng minh được gì.
  return phaiLech(() => {
    const s2 = simBayMoNeo();
    const r1 = goiGhi(s2, '2026-10', 'Shopee mall', [don()]);
    if (!r1.ok) throw new Error('lần 1 đã hỏng: ' + r1.thongBao);
    s2.thuocTinh[s2.vo.TT_MO_NEO] = 'ID_FILE_2026_10';       // đúng việc capNhatMoNeo_ từng làm
    const r2 = goiGhi(s2, '2026-10', 'Shopee mall', [don()]);
    return r2.ok ? [] : [r2.loi + ': ' + String(r2.thongBao).slice(0, 60)];
  }, 'cắm lại capNhatMoNeo_ rồi chạy lần hai');
});

test('T-CT-11', "ping trả TÊN file mỏ neo và KỲ CUỐI của bảng link, tuyệt đối không trả id", () => {
  const sim = dungSim({ kyDS: ['2026-08', '2026-09'], gianTC0: { dong: 2 } });
  const kq = sim.goi({ token: BI_MAT, hanhDong: 'ping' });
  dung(kq.ok, 'ping phải trả lời được');
  dung(kq.moNeo, 'ping phải có khối moNeo: ' + JSON.stringify(kq));
  bang(kq.moNeo.tenFile, 'KINH DOANH T8-2026', 'tên file mỏ neo');
  bang(kq.moNeo.kyCuoi, '2026-09', 'kỳ cuối của bảng link');
  bang(kq.moNeo.dongCuoi, 9, 'dòng của kỳ cuối');
  dung(kq.moNeo.moTa.indexOf('kỳ cuối 2026-09 (dòng 9)') >= 0, 'câu mô tả: ' + kq.moNeo.moTa);
  const chuoi = JSON.stringify(kq);
  dung(chuoi.indexOf('ID_FILE_2026_08') < 0, 'ping KHÔNG được lộ id file mỏ neo: ' + chuoi);
  dung(chuoi.indexOf('ID_FILE_2026_09') < 0, 'ping KHÔNG được lộ id file tháng nào');

  // ĐỐI CHỨNG ÂM: phép quét id phải thật sự bắt được id — thử trên một phản hồi CÓ id.
  return phaiLech(() => {
    const gia = JSON.stringify(Object.assign({}, kq, { fileId: 'ID_FILE_2026_08' }));
    return gia.indexOf('ID_FILE_2026_08') >= 0 ? ['có id trong phản hồi'] : [];
  }, 'phản hồi có kèm id');
});

test('T-CT-12', 'cảnh báo sớm khi bảng link chưa có dòng cho THÁNG SAU', () => {
  const sim = dungSim({ kyDS: ['2026-09'], gianTC0: { dong: 2 } });
  const kq = goiGhi(sim, '2026-09', 'Shopee mall', [don()]);
  dung(kq.ok, kq.thongBao);
  const cau = (kq.canhBao || []).filter((c) => c.indexOf('Bảng link mới khai tới') === 0);
  bang(cau.length, 1, 'phải có đúng một câu cảnh báo sớm: ' + JSON.stringify(kq.canhBao));
  dung(cau[0].indexOf('2026-09 (dòng 8)') >= 0, 'phải nêu kỳ cuối và dòng: ' + cau[0]);
  dung(cau[0].indexOf('tháng này là 2026-09') >= 0, 'phải nêu tháng hiện tại: ' + cau[0]);
  dung(cau[0].indexOf('2026-10') >= 0, 'phải nêu tháng sau cần thêm: ' + cau[0]);

  // ĐỐI CHỨNG ÂM: bảng ĐÃ CÓ dòng tháng sau thì tuyệt đối không được kêu.
  return phaiLech(() => {
    const s2 = dungSim({ kyDS: ['2026-09', '2026-10'], gianTC0: { dong: 2 } });
    const r2 = goiGhi(s2, '2026-09', 'Shopee mall', [don()]);
    const c2 = (r2.canhBao || []).filter((c) => c.indexOf('Bảng link mới khai tới') === 0);
    if (c2.length) throw new Error('kêu oan khi bảng đã có dòng tháng sau');
    const s3 = dungSim({ kyDS: ['2026-09'], gianTC0: { dong: 2 } });
    const r3 = goiGhi(s3, '2026-09', 'Shopee mall', [don()]);
    return (r3.canhBao || []).filter((c) => c.indexOf('Bảng link mới khai tới') === 0);
  }, 'bảng thiếu dòng tháng sau mà không kêu');
});

// ==================================================================== tổng kết

console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
if (soHong) { console.log('HỎNG: ' + HONG.join(', ')); process.exitCode = 1; }
