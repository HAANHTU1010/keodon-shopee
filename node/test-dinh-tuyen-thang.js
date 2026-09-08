/**
 * test-dinh-tuyen-thang.js — kiểm ĐỊNH TUYẾN THÁNG (GV-v2.3 mục 1) + ĐỐI CHIẾU PHIÊN BẢN (mục 2.3)
 * + CHỐNG GHI TRÙNG / MẤT ĐỊNH DẠNG (mục 2.3), chạy bằng: node node/test-dinh-tuyen-thang.js
 *
 * Không cần Google, không gọi mạng. Cách làm theo đúng kiến trúc "một lõi hai vỏ": phần logic thuần
 * (phân tích tên kỳ · bóc ID · chọn dòng · so phiên bản) tách hẳn khỏi phần gọi SpreadsheetApp, nên
 * chạy thẳng bằng Node; phần chạm Google thì dựng giả lập ngay dưới đây.
 *
 * ------------------------------------------------------------------ FIXTURE DỰNG THEO SỐ ĐO THẬT
 * Sheet `Thông tin shop ` (một dấu cách cuối tên) trong file tháng thật, BA đo ngày 08/9/2026:
 *   · 1000 dòng × 14 cột; bảng link 37 dòng dữ liệu, dòng 8 → dòng 44; y hệt nhau ở file T8 và T9.
 *   · Dòng 1-7 là MỘT BẢNG KHÁC: `STT | Tên shop | Tên đăng nhập` — cột C của bảng đó chứa TÊN
 *     ĐĂNG NHẬP THẬT (số điện thoại, email) của 5 gian hàng.
 *   · Từ cột D trở đi: mật khẩu các gian hàng, 110 ô có nội dung.
 *   · Bảng CŨ HAI THÁNG: dòng cuối là 2026 / `Kinh Doanh T7`, không có T8, T9.
 *   · Bảng có LỖ HỔNG Ở GIỮA: 2024 có T1…T5 rồi nhảy thẳng sang T8.
 *   · Dạng gộp kỳ có thật, đúng một dòng: 2023 / `Kinh Doanh T4 + 5` ở ngay dòng 8.
 * Vì thế vùng đọc phải chặn HAI CHIỀU: chỉ cột A, B, C **và** chỉ từ dòng 8 trở xuống.
 * Fixture cắm hai chuỗi mồi để bắt rò rỉ: TEN_DANG_NHAP_BI_MAT ở C1:C7, MAT_KHAU_BI_MAT ở D8:N44.
 */
const fs = require('fs');
const path = require('path');
const { kiemPhienBan, thongBaoLechPhienBan, PHIEN_BAN } = require('./gsheet-web-app');

const SRC = path.join(__dirname, '..', 'src');
const FILE_SHELL = path.join(SRC, 'ShellAppsScript.gs');

const MOI_TEN_DANG_NHAP = 'TEN_DANG_NHAP_BI_MAT';
const MOI_MAT_KHAU = 'MAT_KHAU_BI_MAT_123';
const TEN_SHEET_TT = 'Thông tin shop ';          // CÓ dấu cách cuối — cố ý
const ID_MO_NEO = '1AnChorAnChorAnChorAnChorAnChor00';
const ID_T7 = '1ThangBayThangBayThangBayThangBay7';

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
function test(ten, fn) {
  try { fn(); soDat++; console.log('ĐẠT   ' + ten); }
  catch (e) { soHong++; hong.push(ten + ' -> ' + e.message); console.log('HỎNG  ' + ten + '\n   -> ' + e.message); }
}
function bang(thuc, mong, ghiChu) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((ghiChu ? ghiChu + ': ' : '') + 'được ' + a + ', cần ' + b);
}
function dung(dieuKien, ghiChu) { if (!dieuKien) throw new Error(ghiChu || 'điều kiện sai'); }
function nemLoi(fn) {
  try { fn(); } catch (e) { return e.message; }
  throw new Error('lẽ ra phải ném lỗi mà lại chạy trót lọt');
}

// ==================================================================== giả lập dịch vụ Google

/** Một ô: giá trị hiển thị, công thức, định dạng số, màu nền. */
function oMoi() { return { v: '', f: '', nf: '', bg: '#ffffff' }; }

/**
 * Sheet giả. Ghi lại MỌI lời gọi getRange (dòng, cột, số dòng, số cột) để test bất biến soi lại
 * vùng đọc, và ghi lại THỨ TỰ các thao tác trên từng vùng để kiểm setNumberFormat có đi trước
 * setValues hay không.
 */
function sheetGia(ten, soDong, soCot, moiTruong) {
  const o = [];
  for (let r = 0; r <= soDong; r++) { o.push([]); for (let c = 0; c <= soCot; c++) o[r].push(oMoi()); }

  const sh = {
    _o: o,
    getName: () => ten,
    getLastRow: () => sh._lastRow != null ? sh._lastRow : soDong,
    getLastColumn: () => sh._lastCol != null ? sh._lastCol : soCot,
    getDataRange() {
      // Cấm tuyệt đối: nạp cả sheet là nạp luôn mật khẩu và tên đăng nhập.
      throw new Error('VI PHẠM: gọi getDataRange() trên sheet "' + ten + '"');
    },
    getRange(r, c, nr, nc) {
      nr = nr == null ? 1 : nr; nc = nc == null ? 1 : nc;
      moiTruong.vungDoc.push({ sheet: ten, dong: r, cot: c, soDong: nr, soCot: nc });
      const vung = { sheet: ten, r, c, nr, nc };
      const duyet = (fn) => {
        const ra = [];
        for (let i = 0; i < nr; i++) { const d = []; for (let j = 0; j < nc; j++) d.push(fn(o[r + i][c + j])); ra.push(d); }
        return ra;
      };
      const ghiNhan = (viec) => moiTruong.thaoTac.push({ sheet: ten, r, c, nr, nc, viec });
      const rg = {
        getDisplayValues: () => duyet((x) => String(x.v == null ? '' : x.v)),
        getValues: () => duyet((x) => x.v),
        getValue: () => o[r][c].v,
        getBackgrounds: () => duyet((x) => x.bg),
        getFormulaR1C1: () => o[r][c].f,
        setValues(bang2) {
          ghiNhan('setValues');
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) o[r + i][c + j].v = bang2[i][j];
          return rg;
        },
        setValue(v) { ghiNhan('setValue'); o[r][c].v = v; return rg; },
        setNumberFormat(nf) {
          ghiNhan('setNumberFormat:' + nf);
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) o[r + i][c + j].nf = nf;
          return rg;
        },
        setFormulasR1C1(bang2) {
          ghiNhan('setFormulasR1C1');
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) o[r + i][c + j].f = bang2[i][j];
          return rg;
        },
        setBackgrounds(bang2) {
          ghiNhan('setBackgrounds');
          for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) o[r + i][c + j].bg = bang2[i][j];
          return rg;
        },
        setBackground(m) { ghiNhan('setBackground'); for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) o[r + i][c + j].bg = m; return rg; },
        setFontWeight() { return rg; },
        mergeVertically() { moiTruong.gopO.push(vung); return rg; }
      };
      return rg;
    }
  };
  return sh;
}

/** Bảng link 37 dòng đúng như file thật: 2023 mở đầu bằng kỳ gộp, 2024 thủng T6-T7, dừng ở 2026 T7. */
function dongBangLinkThat() {
  const d = [];
  d.push([2023, 'Kinh Doanh T4 + 5', link('1Nam2023Ky45Nam2023Ky45Nam2023Ky4')]);
  [6, 7, 8, 9, 10, 11, 12].forEach((t) => d.push([2023, 'Kinh Doanh T' + t, link('1Nam2023T' + t + 'aaaaaaaaaaaaaaaaaaaaaaa')]));
  [1, 2, 3, 4, 5, 8, 9, 10, 11, 12].forEach((t) => d.push([2024, 'Kinh Doanh T' + t, link('1Nam2024T' + t + 'bbbbbbbbbbbbbbbbbbbbbbb')]));
  for (let t = 1; t <= 12; t++) d.push([2025, 'Kinh Doanh T' + t, link('1Nam2025T' + t + 'cccccccccccccccccccccc')]);
  for (let t = 1; t <= 6; t++) d.push([2026, 'Kinh Doanh T' + t, link('1Nam2026T' + t + 'dddddddddddddddddddddd')]);
  d.push([2026, 'Kinh Doanh T7', link(ID_T7)]);
  return d;
}
function link(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=1683197471'; }

/** Dựng sheet `Thông tin shop ` y như file thật, kèm hai chuỗi mồi để bắt rò rỉ. */
function sheetThongTinShop(moiTruong, dongBang) {
  const sh = sheetGia(TEN_SHEET_TT, 1000, 14, moiTruong);
  // dòng 1-7: bảng khác — cột C là TÊN ĐĂNG NHẬP THẬT của từng gian hàng
  sh._o[1][1].v = 'STT'; sh._o[1][2].v = 'Tên shop'; sh._o[1][3].v = 'Tên đăng nhập';
  for (let r = 1; r <= 7; r++) sh._o[r][3].v = MOI_TEN_DANG_NHAP + '_' + r;
  // dòng 8 trở xuống: bảng link ở A,B,C — mật khẩu ở D..N
  const b = dongBang || dongBangLinkThat();
  b.forEach((d, i) => {
    const r = 8 + i;
    sh._o[r][1].v = d[0]; sh._o[r][2].v = d[1]; sh._o[r][3].v = d[2];
    for (let c = 4; c <= 14; c++) sh._o[r][c].v = MOI_MAT_KHAU;
  });
  sh._lastRow = 8 + b.length - 1;
  return sh;
}

/** Sheet gian hàng: dòng 2 tiêu đề, dòng 3 dòng tổng, dòng 4 một đơn cũ (để kiểm chống trùng). */
function sheetGianHang(moiTruong) {
  const sh = sheetGia('Shopee mall', 300, 16, moiTruong);
  ['Ngày', 'Nguồn', 'Mã đơn', 'Tên VT', 'TT', 'Nhập', 'SL', 'Tổng tiền SP', 'MGG', 'Chi phí', 'Thuế',
    'Doanh Thu', 'Đã TT', 'Còn Nợ'].forEach((t, i) => { sh._o[2][i + 1].v = t; });
  sh._o[3][8].v = 0;
  sh._o[4][3].v = 'TEST0802HHHH08';      // đơn đã có — gửi lại phải bị bỏ qua
  sh._o[4][12].f = '=R[0]C[-4]-R[0]C[-2]';
  sh._lastRow = 4;
  sh._lastCol = 14;
  return sh;
}

function nap(tuyChon) {
  const t = tuyChon || {};
  const moiTruong = {
    vungDoc: [], thaoTac: [], gopO: [], daIn: [], thuocTinh: {},
    thangGiaLap: t.thangGiaLap || '2026-09', moKhoa: 0
  };
  const cacFile = {};
  const shTT = sheetThongTinShop(moiTruong, t.dongBang);
  cacFile[ID_MO_NEO] = { ten: 'THÁNG 8 - KINH DOANH', sheets: { [TEN_SHEET_TT]: shTT } };
  // File tháng 7 có ĐỦ cả hai sheet: bảng link giống hệt (BA đo: nội dung y nhau ở mọi file tháng)
  // → mỏ neo dời sang được.
  cacFile[ID_T7] = {
    ten: 'THÁNG 7 - KINH DOANH',
    sheets: { [TEN_SHEET_TT]: sheetThongTinShop(moiTruong, t.dongBang), 'Shopee mall': sheetGianHang(moiTruong) }
  };
  moiTruong.cacFile = cacFile;
  moiTruong.thuocTinh['KEODON_BI_MAT'] = t.biMat === undefined ? 'chuoi-bi-mat-du-dai-16' : t.biMat;
  if (t.moNeo !== null) moiTruong.thuocTinh['KEODON_MO_NEO_ID'] = t.moNeo || ID_MO_NEO;

  const SpreadsheetApp = {
    openById(id) {
      const f = cacFile[id];
      if (!f) throw new Error('Không mở được file id ' + id);
      return {
        getName: () => f.ten,
        getSheetByName: (ten) => f.sheets[ten] || null,
        getSheets: () => Object.keys(f.sheets).map((k) => f.sheets[k])
      };
    },
    flush() { }
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (moiTruong.thuocTinh[k] == null ? null : moiTruong.thuocTinh[k]),
      setProperty: (k, v) => { moiTruong.thuocTinh[k] = v; }
    })
  };
  const Utilities = {
    formatDate(d, tz, mau) {
      // Giả lập đồng hồ máy chủ Google: 'yyyy-MM' trả tháng đã đặt, để test lặp lại được mọi ngày.
      if (mau === 'yyyy-MM') return moiTruong.thangGiaLap;
      const h = (n) => ('0' + n).slice(-2);
      return h(d.getHours()) + ':' + h(d.getMinutes()) + ':' + h(d.getSeconds()) + ' ' +
        h(d.getDate()) + '/' + h(d.getMonth() + 1) + '/' + d.getFullYear();
    }
  };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(s) { moiTruong.daIn.push(s); return { _text: s, setMimeType() { return this; } }; }
  };
  const LockService = {
    getScriptLock: () => ({ tryLock: () => { moiTruong.moKhoa++; return true; }, releaseLock: () => { moiTruong.moKhoa--; } })
  };
  const Logger = { log: (x) => moiTruong.daIn.push(String(x)) };

  const nguon = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs', 'ShellAppsScript.gs']
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const ten = new Set();
  for (const m of nguon.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const than = nguon + '\nreturn {' + [...ten].map((n) => `${n}: ${n}`).join(', ') + '};';
  const g = new Function('SpreadsheetApp', 'PropertiesService', 'Utilities', 'ContentService', 'LockService', 'Logger', than)
    (SpreadsheetApp, PropertiesService, Utilities, ContentService, LockService, Logger);
  g.__moiTruong = moiTruong;
  return g;
}

/** Gọi doPost như Web App thật và trả về đối tượng JSON. */
function goi(g, body) {
  const kq = g.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(kq._text);
}

// ==================================================================== 1. PHÂN TÍCH CỘT B

console.log('--- Phân tích tên kỳ (cột B) ---');
{
  const g = nap();
  test('T-DT-01 "Kinh Doanh T9" → tháng 9', () => bang(g.phanTichTenKy_('Kinh Doanh T9'), [9]));
  test('T-DT-02 "KINH DOANH T10" → tháng 10 (hoa thường tùy ý, hai chữ số)', () => bang(g.phanTichTenKy_('KINH DOANH T10'), [10]));
  test('T-DT-03 "kinh doanh t4 + 5" → phủ CẢ tháng 4 và 5', () => bang(g.phanTichTenKy_('kinh doanh t4 + 5'), [4, 5]));
  test('T-DT-04 mất hết khoảng trắng vẫn đọc được', () => {
    bang(g.phanTichTenKy_('KinhDoanhT12'), [12]);
    bang(g.phanTichTenKy_('  Kinh   Doanh   T4+5  '), [4, 5]);
  });
  test('T-DT-05 "Kinh Doanh Tháng 9" → tháng 9', () => bang(g.phanTichTenKy_('Kinh Doanh Tháng 9'), [9]));
  test('T-DT-06 chuỗi rác → [] (dừng, không đoán)', () => {
    ['', null, undefined, 'Tên đăng nhập', 'STT', 'T9', 'Tháng 9', 'Kinh Doanh', 'Kinh Doanh T13',
      'Kinh Doanh T0', 'Kinh Doanh T9 (cũ)', 'abc', 'Kinh Doanh Tx'].forEach((x) => {
        bang(g.phanTichTenKy_(x), [], 'với đầu vào ' + JSON.stringify(x));
      });
  });
  test('T-DT-07 năm ở cột A: nhận số lẫn chuỗi, rác thì 0', () => {
    bang(g.namCuaO_(2026), 2026); bang(g.namCuaO_(' 2026 '), 2026); bang(g.namCuaO_('2026.0'), 2026);
    bang(g.namCuaO_('STT'), 0); bang(g.namCuaO_(''), 0); bang(g.namCuaO_('26'), 0);
  });
}

// ==================================================================== 2. BÓC ID TỪ CỘT C

console.log('--- Bóc spreadsheet ID (cột C) ---');
{
  const g = nap();
  const ID = '1GDdjTAiDbsrrAE69ZBp4GowhKbfFr8U2McoehjkDHNc';
  test('T-DT-08 link có #gid=', () => bang(g.bocIdTuLink_('https://docs.google.com/spreadsheets/d/' + ID + '/edit#gid=1683197471'), ID));
  test('T-DT-09 link không có /edit', () => bang(g.bocIdTuLink_('https://docs.google.com/spreadsheets/d/' + ID), ID));
  test('T-DT-10 chuỗi ID trần', () => bang(g.bocIdTuLink_(ID), ID));
  test('T-DT-11 link rác → chuỗi rỗng, KHÔNG ném lỗi kèm nội dung ô', () => {
    ['', 'chưa có link', 'https://drive.google.com/file/d/abc/view', 'ID_NGAN'].forEach((x) => bang(g.bocIdTuLink_(x), ''));
  });
}

// ==================================================================== 3. CHỌN DÒNG — hàm thuần

console.log('--- Chọn dòng định tuyến ---');
{
  const g = nap();
  const bangLink = dongBangLinkThat();
  test('T-DT-12 kỳ gộp 2023 T4+5 khớp cả hai tháng, cùng một dòng 8', () => {
    const a = g.chonDongDinhTuyen_(bangLink, 2023, 4);
    const b = g.chonDongDinhTuyen_(bangLink, 2023, 5);
    dung(a.ok && b.ok, 'phải khớp cả hai');
    bang([a.dong, b.dong], [8, 8]);
    bang(a.id, '1Nam2023Ky45Nam2023Ky45Nam2023Ky4');
  });
  test('T-DT-13 tháng có thật → đúng dòng, đúng id (2026-07 ở dòng 44)', () => {
    const kq = g.chonDongDinhTuyen_(bangLink, 2026, 7);
    dung(kq.ok, 'phải khớp'); bang(kq.dong, 44); bang(kq.id, ID_T7);
  });
  test('T-DT-14 LỖ HỔNG GIỮA BẢNG: 2024-06 không có → dừng, KHÔNG lùi về T5, không nhảy tới T8', () => {
    const kq = g.chonDongDinhTuyen_(bangLink, 2024, 6);
    dung(!kq.ok && kq.ma === 'KHONG_CO_THANG', 'phải dừng');
    dung(kq.id == null, 'tuyệt đối không được trả id nào');
    bang(kq.thongBao, 'Chưa có file cho tháng 6/2024. Hãy thêm một dòng vào sheet ' +
      "'Thông tin shop' (năm ở cột A, Kinh Doanh T6 ở cột B, link ở cột C).");
  });
  test('T-DT-15 hai dòng cùng khớp một tháng → dừng, không tự chọn', () => {
    const b2 = bangLink.concat([[2026, 'Kinh Doanh T7', link('1TrungLapTrungLapTrungLapTrungLap')]]);
    const kq = g.chonDongDinhTuyen_(b2, 2026, 7);
    dung(!kq.ok && kq.ma === 'TRUNG_NHIEU_DONG', 'phải dừng');
    bang(kq.dongKhop, [44, 45]);
    dung(kq.id == null, 'không được trả id');
    dung(/có 2 dòng cùng khớp tháng 7\/2026 \(dòng 44, 45\)/.test(kq.thongBao), 'phải nêu số dòng: ' + kq.thongBao);
  });
  test('T-DT-16 kỳ gộp trùng với kỳ đơn cũng bị coi là trùng', () => {
    const b2 = [[2023, 'Kinh Doanh T4 + 5', link('1Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')],
      [2023, 'Kinh Doanh T5', link('1Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')]];
    bang(g.chonDongDinhTuyen_(b2, 2023, 5).ma, 'TRUNG_NHIEU_DONG');
    dung(g.chonDongDinhTuyen_(b2, 2023, 4).ok, 'tháng 4 chỉ một dòng thì vẫn chạy');
  });
  test('T-DT-17 khớp tháng nhưng cột C không phải link → dừng, không in nội dung ô', () => {
    const b2 = [[2026, 'Kinh Doanh T9', 'chưa xin được link MAT_KHAU_BI_MAT_123']];
    const kq = g.chonDongDinhTuyen_(b2, 2026, 9);
    bang(kq.ma, 'LINK_HONG');
    dung(kq.thongBao.indexOf(MOI_MAT_KHAU) < 0, 'thông báo lộ nội dung ô: ' + kq.thongBao);
    dung(/Dòng 8 /.test(kq.thongBao), 'phải nêu số dòng');
  });
  test('T-DT-18 bảng rỗng → dừng với đúng câu thiếu tháng', () => {
    const kq = g.chonDongDinhTuyen_([], 2026, 9);
    bang(kq.ma, 'KHONG_CO_THANG'); bang(kq.dangCo, []); bang(kq.ky_cuoi, null);
  });
}

// ==================================================================== 4. LUỒNG THẬT trên sheet giả

console.log('--- Luồng định tuyến đầy đủ (T-53 · D-14) ---');
{
  const g = nap({ thangGiaLap: '2026-09' });
  const mt = g.__moiTruong;
  test('T-DT-19 T-53/D-14: bảng dừng ở 2026-07, hỏi 2026-09 → DỪNG với đúng câu, không ghi lùi', () => {
    const loi = nemLoi(() => g.fileCuaThang_('2026-09'));
    dung(loi.indexOf('Chưa có file cho tháng 9/2026. Hãy thêm một dòng vào sheet ' +
      "'Thông tin shop' (năm ở cột A, Kinh Doanh T9 ở cột B, link ở cột C).") === 0,
    'thông báo phải MỞ ĐẦU bằng đúng câu của đề bài, đang là: ' + loi);
    dung(/Dòng cuối bảng đang là kỳ 7\/2026 \(dòng 44\)/.test(loi), 'phải nói dòng cuối bảng là kỳ nào: ' + loi);
    dung(/Bảng bắt đầu từ dòng 8/.test(loi), 'phải chỉ chỗ thêm dòng: ' + loi);
    dung(/Các kỳ đã khai báo: 2023-04, 2023-05, 2023-06/.test(loi), 'phải liệt kê THÁNG: ' + loi);
    bang(mt.thuocTinh['KEODON_MO_NEO_ID'], ID_MO_NEO, 'không tìm thấy tháng thì không được dời mỏ neo');
  });
  test('T-DT-20 chỉ đọc A,B,C từ dòng 8 — không lệnh đọc nào chạm dòng < 8 hay cột > 3', () => {
    const doc = mt.vungDoc.filter((x) => x.sheet === TEN_SHEET_TT);
    dung(doc.length === 1, 'phải đúng MỘT lệnh đọc, đang là ' + doc.length + ': ' + JSON.stringify(doc));
    bang([doc[0].dong, doc[0].cot, doc[0].soCot], [8, 1, 3]);
    bang(doc[0].soDong, 37, 'đọc đúng 37 dòng dữ liệu (dòng 8 → 44)');
    doc.forEach((x) => {
      dung(x.dong >= 8, 'đọc từ dòng ' + x.dong + ' — dòng 1-7 là tên đăng nhập gian hàng');
      dung(x.cot + x.soCot - 1 <= 3, 'đọc tới cột ' + (x.cot + x.soCot - 1) + ' — cột D trở đi là mật khẩu');
    });
  });
  test('T-DT-21 BẤT BIẾN: không chuỗi bí mật nào lọt ra kết quả, thông báo lỗi hay log', () => {
    const loi = nemLoi(() => g.fileCuaThang_('2026-09'));
    const tin = nemLoi(() => g.thuDinhTuyenThang());
    const tatCa = mt.daIn.concat([loi, tin, JSON.stringify(goi(g, { token: 'chuoi-bi-mat-du-dai-16', hanhDong: 'doc' }))]).join('\n');
    dung(tatCa.indexOf(MOI_MAT_KHAU) < 0, 'LỘ MẬT KHẨU trong đầu ra');
    dung(tatCa.indexOf(MOI_TEN_DANG_NHAP) < 0, 'LỘ TÊN ĐĂNG NHẬP trong đầu ra');
  });
}
{
  const g = nap({ thangGiaLap: '2026-07' });
  const mt = g.__moiTruong;
  test('T-DT-22 tháng có trong bảng → ra đúng file, và MỎ NEO tự dời sang file tháng đó', () => {
    const f = g.fileCuaThang_('2026-07');
    bang(f.fileId, ID_T7); bang(f.dong, 44);
    bang(mt.thuocTinh['KEODON_MO_NEO_ID'], ID_T7, 'mỏ neo phải tự đi theo tháng mới nhất');
    dung(g.thuDinhTuyenThang().indexOf('THÁNG 7 - KINH DOANH') > 0, 'thuDinhTuyenThang phải nêu tên file');
    dung(g.thuDinhTuyenThang().indexOf(ID_T7) < 0, 'không được in id file ra log');
  });
}
{
  const g = nap({ moNeo: null });
  test('T-DT-23 chưa cài mỏ neo → báo cách cài, không crash mơ hồ', () => {
    const loi = nemLoi(() => g.fileCuaThang_('2026-07'));
    dung(/Chưa cài file mỏ neo/.test(loi) && /caiDat\(/.test(loi), loi);
  });
}

// ==================================================================== 5. VÙNG CẤM trong MÃ NGUỒN

console.log('--- Bất biến trên mã nguồn (INV-10) ---');
{
  const nguon = fs.readFileSync(FILE_SHELL, 'utf8');
  // Bỏ chú thích trước khi soi: bản thân chú thích có nhắc tên hàm bị cấm để giải thích vì sao cấm.
  const ma = nguon.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  test('T-DT-24 mã nguồn KHÔNG gọi getDataRange ở bất cứ đâu', () => {
    dung(ma.indexOf('getDataRange') < 0, 'còn lời gọi getDataRange trong mã');
  });
  test('T-DT-25 vùng đọc là hằng số trong mã, không cho cấu hình đổi', () => {
    dung(/var DONG_DAU_BANG_LINK = 8;/.test(ma), 'DONG_DAU_BANG_LINK phải là 8 cứng trong mã');
    dung(/var SO_COT_DUOC_DOC = 3;/.test(ma), 'SO_COT_DUOC_DOC phải là 3 cứng trong mã');
    bang((ma.match(/DONG_DAU_BANG_LINK\s*=/g) || []).length, 1, 'chỉ được gán DONG_DAU_BANG_LINK đúng một lần');
    bang((ma.match(/SO_COT_DUOC_DOC\s*=/g) || []).length, 1, 'chỉ được gán SO_COT_DUOC_DOC đúng một lần');
    dung(/getRange\(DONG_DAU_BANG_LINK, 1, het - DONG_DAU_BANG_LINK \+ 1, SO_COT_DUOC_DOC\)/.test(ma),
      'phải đọc bằng đúng getRange(8, 1, n, 3)');
  });
  test('T-DT-26 tên sheet giữ nguyên dấu cách cuối, không trim khi tra', () => {
    dung(/var TEN_SHEET_THONG_TIN_SHOP = 'Thông tin shop ';/.test(ma), 'hằng số phải có dấu cách cuối');
    dung(!/TEN_SHEET_THONG_TIN_SHOP\.trim\(\)/.test(ma), 'không được trim tên sheet khi tra');
    dung(/getSheetByName\(TEN_SHEET_THONG_TIN_SHOP\)/.test(ma), 'phải tra bằng đúng tên nguyên văn trước');
  });
  test('T-DT-27 không bê ba thứ của dự án chứng quyền: clear · đổi tên sheet · xóa dòng', () => {
    [['.clear(', 'vẽ lại sheet'], ['clearFormat', 'xóa định dạng'], ['deleteRow', 'xóa dòng'],
      ['setName(', 'đổi tên sheet'], ['insertSheet', 'thêm sheet'], ['deleteSheet', 'xóa sheet']]
      .forEach(([m, vi]) => dung(ma.indexOf(m) < 0, 'file tháng do người giữ — cấm ' + vi + ' (' + m + ')'));
  });
}

// ==================================================================== 6. ĐỐI CHIẾU PHIÊN BẢN

console.log('--- Đối chiếu phiên bản Web App (mục 2.3) ---');
{
  const g = nap({ thangGiaLap: '2026-07' });
  const BM = 'chuoi-bi-mat-du-dai-16';
  test('T-DT-28 ping trả về phiên bản thật của Web App', () => {
    const kq = goi(g, { token: BM, hanhDong: 'ping' });
    dung(kq.ok, 'ping phải chạy'); bang(kq.phienBan, g.PHIEN_BAN);
    bang(kq.daCaiMoNeo, true);
  });
  test('T-DT-29 MỌI phản hồi đều kèm phienBan, kể cả phản hồi lỗi', () => {
    bang(goi(g, { token: 'sai', hanhDong: 'ping' }).phienBan, g.PHIEN_BAN);
    bang(goi(g, { token: BM, hanhDong: 'linh tinh' }).phienBan, g.PHIEN_BAN);
  });
  test('T-DT-30 lệch phiên bản → TỪ CHỐI GHI, đúng nguyên văn thông báo', () => {
    const kq = goi(g, { token: BM, hanhDong: 'ghi', phienBanMongDoi: '9.9.9', thang: '2026-07', lenh: [] });
    dung(!kq.ok, 'phải từ chối'); bang(kq.loi, 'LECH_PHIEN_BAN');
    bang(kq.thongBao, 'Web App đang chạy bản ' + g.PHIEN_BAN + ', tool cần bản 9.9.9 — ' +
      'hãy triển khai lại (Deploy → Manage deployments → New version).');
    bang(g.__moiTruong.thaoTac.length, 0, 'lệch bản mà vẫn ghi được ô nào là hỏng');
    bang(g.__moiTruong.moKhoa, 0, 'không được vào tới LockService');
  });
  test('T-DT-31 lệch bản vẫn cho ping và doc chạy — người ta phải xem được số lệch', () => {
    dung(goi(g, { token: BM, hanhDong: 'ping', phienBanMongDoi: '9.9.9' }).ok, 'ping phải chạy');
  });
  test('T-DT-32 đúng phiên bản thì không chặn', () => {
    const kq = goi(g, { token: BM, hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-07', lenh: [] });
    dung(kq.ok, 'cùng bản mà bị chặn: ' + JSON.stringify(kq));
  });
  test('T-DT-33 hai vỏ nói CÙNG MỘT CÂU (Node ↔ Apps Script)', () => {
    bang(thongBaoLechPhienBan('1.0.0', '2.0.0'), g.thongBaoLechPhienBan_('1.0.0', '2.0.0'));
    bang(PHIEN_BAN, g.PHIEN_BAN, 'PHIEN_BAN hai bên phải bằng nhau — lệch là tool tự chặn chính mình');
  });
  test('T-DT-34 phía máy tính: Web App bản cũ (không trả phienBan) cũng bị chặn', () => {
    const loi = nemLoi(() => kiemPhienBan(undefined, '2.3.0'));
    bang(loi, 'Web App đang chạy bản (không rõ — bản cũ chưa trả phienBan), tool cần bản 2.3.0 — ' +
      'hãy triển khai lại (Deploy → Manage deployments → New version).');
    bang(nemLoi(() => kiemPhienBan('2.2.0', '2.3.0')),
      'Web App đang chạy bản 2.2.0, tool cần bản 2.3.0 — hãy triển khai lại (Deploy → Manage deployments → New version).');
    bang(kiemPhienBan('2.3.0', '2.3.0'), true);
  });
}

// ==================================================================== 7. GHI: định dạng & chống trùng

console.log('--- Ghi: định dạng trước, chống trùng hai tầng (mục 2.3) ---');
{
  const g = nap({ thangGiaLap: '2026-07' });
  const mt = g.__moiTruong;
  const BM = 'chuoi-bi-mat-du-dai-16';
  const kq = goi(g, {
    token: BM, hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-07',
    lenh: [{
      tenSheet: 'Shopee mall', don: [
        { maDon: 'TEST0802HHHH08', ngay: '2026-07-05', tien: { H: 1, I: 0, J: 0, K: 0 }, dong: [{ tenVietTat: 'kn180', soLuong: 1 }] },
        { maDon: '0012345678901234', ngay: '2026-07-06', tien: { H: 200, I: 0, J: 5, K: 3 }, dong: [{ tenVietTat: 'hd180', soLuong: 2 }] },
        { maDon: '0012345678901234', ngay: '2026-07-06', tien: { H: 200, I: 0, J: 5, K: 3 }, dong: [{ tenVietTat: 'hd180', soLuong: 2 }] },
        {
          maDon: '260706ABCDEFGHI', ngay: '2026-07-06', tien: { H: 300, I: 0, J: 7, K: 4 },
          dong: [{ tenVietTat: 'dha180', soLuong: 1 }, { tenVietTat: 'ymkd180', soLuong: 3, vang: true, note: 'chưa nhận ra mã' }]
        }
      ]
    }]
  });

  test('T-DT-35 setNumberFormat("@") chạy TRƯỚC setValues cho cột mã đơn', () => {
    dung(kq.ok, 'lệnh ghi phải chạy: ' + JSON.stringify(kq));
    const cotMa = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.c === 3 && x.r === 5);
    dung(cotMa.length >= 2, 'không thấy thao tác trên cột mã đơn: ' + JSON.stringify(mt.thaoTac));
    bang(cotMa[0].viec, 'setNumberFormat:@', 'ép văn bản phải đi trước — đặt sau thì Sheets đã đổi kiểu mất rồi');
    bang(cotMa[1].viec, 'setValues');
  });
  test('T-DT-36 mã đơn toàn chữ số giữ nguyên số 0 đầu (nếu mất là ghi trùng ở lần chạy sau)', () => {
    const sh = mt.cacFile[ID_T7].sheets['Shopee mall'];
    bang(sh._o[5][3].v, '0012345678901234');
    bang(sh._o[5][3].nf, '@');
  });
  test('T-DT-37 cột ngày cũng đặt định dạng trước, nhưng KHÔNG ép "@" (giữ Date cho công thức)', () => {
    const cotNgay = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.c === 1 && x.r === 5);
    bang(cotNgay[0].viec, 'setNumberFormat:d/m/yyyy');
    bang(cotNgay[1].viec, 'setValues');
    const sh = mt.cacFile[ID_T7].sheets['Shopee mall'];
    dung(sh._o[5][1].v instanceof Date, 'ngày phải là Date thật, ép "@" là hỏng sheet Lợi nhuận');
  });
  test('T-DT-38 cột tiền cũng đặt định dạng trước setValues', () => {
    [8, 9, 10, 11].forEach((c) => {
      const t = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.c === c && x.r === 5);
      bang(t[0].viec, 'setNumberFormat:#,##0', 'cột ' + c);
      bang(t[1].viec, 'setValues', 'cột ' + c);
    });
  });
  test('T-DT-39 khử trùng TẦNG 2 trong LockService: đơn đã có ở dòng 4 bị bỏ qua', () => {
    bang(kq.thongKe.donDaCo, 2, 'một đơn đã có sẵn + một đơn trùng ngay trong gói');
    bang(kq.thongKe.donGhi, 2);
    bang(kq.thongKe.dongGhi, 3, '1 dòng + 1 đơn hai dòng');
    bang(kq.thongKe.donGopO, 1, 'đơn nhiều mặt hàng phải được gộp ô');
    bang(mt.moKhoa, 0, 'khóa phải được trả lại');
  });
  test('T-DT-40 chỉ NỐI dưới dòng cuối, không đụng dòng cũ', () => {
    const sh = mt.cacFile[ID_T7].sheets['Shopee mall'];
    bang(sh._o[4][3].v, 'TEST0802HHHH08', 'dòng cũ phải y nguyên');
    bang(sh._o[3][8].v, 0, 'dòng tổng (dòng 3) bất khả xâm phạm — INV-8');
    mt.thaoTac.filter((x) => x.sheet === 'Shopee mall').forEach((x) => {
      dung(x.r >= 4 || (x.r === 2 && x.viec === 'setValue'), 'ghi vào dòng ' + x.r + ' — chỉ được nối từ dòng 5');
    });
  });
  test('T-DT-41 INV-3: không thao tác nào chạm cột E, F, M, N', () => {
    mt.thaoTac.filter((x) => x.sheet === 'Shopee mall').forEach((x) => {
      for (let c = x.c; c < x.c + x.nc; c++) {
        if (x.viec === 'setBackgrounds' || x.viec === 'setBackground') continue;   // tô vàng cả dòng là được phép
        dung([5, 6, 13, 14].indexOf(c) < 0, 'ghi giá trị vào cột ' + c + ' (E/F/M/N là ARRAYFORMULA)');
      }
    });
  });
  test('T-DT-42 INV-3 chặn ở tầng ghi: cấu hình trỏ nhầm vào cột M là NÉM LỖI, không ghi', () => {
    const g2 = nap({ thangGiaLap: '2026-07' });
    const r = goi(g2, {
      token: BM, hanhDong: 'ghi', phienBanMongDoi: g2.PHIEN_BAN, thang: '2026-07',
      cauHinh: { keyin: { cot_thue: 'M' } },
      lenh: [{ tenSheet: 'Shopee mall', don: [{ maDon: 'MOI001', ngay: '2026-07-06', tien: {}, dong: [{}] }] }]
    });
    dung(!r.ok, 'phải từ chối: ' + JSON.stringify(r));
    dung(/TỪ CHỐI GHI|cột công thức|trùng cột/i.test(r.thongBao), r.thongBao);
    const sh = g2.__moiTruong.cacFile[ID_T7].sheets['Shopee mall'];
    bang(sh._o[5][3].v, '', 'từ chối rồi mà vẫn ghi được dòng mới là hỏng');
  });
}

// ==================================================================== 8. KHÔNG GHI LÙI

console.log('--- Không ghi lùi tháng (T-53) ---');
{
  const g = nap({ thangGiaLap: '2026-09' });
  const BM = 'chuoi-bi-mat-du-dai-16';
  test('T-DT-43 sang tháng 9 mà gói ghi cho tháng 7 → từ chối ghi lùi', () => {
    const kq = goi(g, { token: BM, hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-07', lenh: [] });
    dung(!kq.ok, 'phải từ chối'); dung(/Từ chối ghi lùi/.test(kq.thongBao), kq.thongBao);
  });
  test('T-DT-44 tháng 9 chưa có trong bảng → lệnh ghi dừng, không ô nào bị đụng', () => {
    const kq = goi(g, {
      token: BM, hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09',
      lenh: [{ tenSheet: 'Shopee mall', don: [{ maDon: 'MOI002', ngay: '2026-09-01', tien: {}, dong: [{}] }] }]
    });
    dung(!kq.ok, 'phải dừng');
    dung(kq.thongBao.indexOf('Chưa có file cho tháng 9/2026.') === 0, kq.thongBao);
    bang(g.__moiTruong.thaoTac.length, 0, 'không được ghi gì');
    dung(kq.thongBao.indexOf(MOI_MAT_KHAU) < 0 && kq.thongBao.indexOf(MOI_TEN_DANG_NHAP) < 0, 'lộ bí mật trong thông báo');
  });
}

// ==================================================================== 9. QUÉT RÒ RỈ LẦN CUỐI

console.log('--- Quét rò rỉ toàn cục ---');
{
  test('T-DT-45 BẤT BIẾN CUỐI: không chuỗi mồi nào xuất hiện trong bất kỳ đầu ra nào của mọi kịch bản', () => {
    const g = nap({ thangGiaLap: '2026-09' });
    const BM = 'chuoi-bi-mat-du-dai-16';
    const thu = [];
    ['ping', 'doc', 'ghi', 'la'].forEach((hd) => {
      thu.push(JSON.stringify(goi(g, { token: BM, hanhDong: hd, phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09', lenh: [] })));
    });
    try { thu.push(g.thuDinhTuyenThang()); } catch (e) { thu.push(e.message); }
    try { thu.push(g.caiDat(null, null)); } catch (e) { thu.push(e.message); }
    try { thu.push(JSON.stringify(g.fileCuaThang_('2026-09'))); } catch (e) { thu.push(e.message); }
    const tatCa = thu.concat(g.__moiTruong.daIn).join('\n');
    dung(tatCa.indexOf(MOI_MAT_KHAU) < 0, 'LỘ MẬT KHẨU');
    dung(tatCa.indexOf(MOI_TEN_DANG_NHAP) < 0, 'LỘ TÊN ĐĂNG NHẬP');
    dung(tatCa.indexOf(BM) < 0, 'LỘ CHUỖI BÍ MẬT');
    dung(tatCa.indexOf(ID_MO_NEO) < 0, 'LỘ ID FILE');
  });
}

// ====================================================================

console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
if (soHong) { hong.forEach((h) => console.log('  HỎNG: ' + h)); process.exit(1); }
