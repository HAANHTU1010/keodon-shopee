/**
 * test-quyen-mo-file.js — CÂU LỖI KHI WEB APP KHÔNG MỞ ĐƯỢC FILE THÁNG (đề bài đóng gói, mục 6).
 * Chạy bằng: node node/test-quyen-mo-file.js   (không cần mạng, không cần Google)
 *
 * ------------------------------------------------------------------ CHỖ KHÓ CỦA BÀI NÀY
 * `SpreadsheetApp.openById` hỏng vì BỐN nhóm lý do, chữa bằng bốn việc khác hẳn nhau. Đổi hết thành
 * một câu "đi chia sẻ file" là dắt người ta đi sai đường trong ba nhóm còn lại:
 *
 *   1. THIẾU QUYỀN     → đúng câu BA giao, nguyên văn, không thêm bớt một chữ.
 *   2. ID SAI / ĐÃ XÓA → nói là không tìm thấy file, và TUYỆT ĐỐI không bảo đi chia sẻ.
 *   3. LẤP LỬNG        → Google gộp cả hai lý do vào một câu ("No item with the given ID could be
 *                        found, OR you do not have permission…"). Không đoán được thì phải nói ra
 *                        cả hai, không được chọn bừa một.
 *   4. MẠNG / HẠN MỨC  → giữ NGUYÊN VĂN lý do gốc. Nuốt là mất manh mối duy nhất.
 *
 * ------------------------------------------------------------------ CHUỖI GOOGLE LẤY TỪ ĐÂU
 * Máy dev KHÔNG có quyền Deploy nên KHÔNG đo được trực tiếp trên tài khoản thật. Bảng chuỗi dưới đây
 * là chuỗi Apps Script đã công bố, mỗi ca kèm bản tiếng Việt (tài khoản để ngôn ngữ tiếng Việt thì
 * Apps Script ném chuỗi ĐÃ DỊCH — bản Việt của ca thiếu quyền nói "Bạn không có quyền truy cập").
 * Đây là GIỚI HẠN ĐÃ BIẾT của bài test, ghi thẳng ra đây thay vì giấu: nếu tài khoản thật ném một
 * chuỗi khác cả bảng này thì mã rơi về nhóm 4 — ném nguyên lỗi cũ, tức là XẤU NHẤT CŨNG CHỈ BẰNG
 * HIỆN TRẠNG, không bao giờ đổ oan cho quyền.
 *
 * ------------------------------------------------------------------ ĐỐI CHỨNG ÂM
 * Mỗi chỉ tiêu phải chứng minh nó bắt được đúng cái lỗi nó sinh ra để bắt. Phần 4 dựng lại BA bản
 * SAI, chạy đúng phép chấm này lên chúng, và đòi phép chấm phải báo LỆCH.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const FILE_SHELL = path.join(SRC, 'ShellAppsScript.gs');

const TEN_SHEET_TT = 'Thông tin shop ';                        // CÓ dấu cách cuối — cố ý
const ID_MO_NEO = '1AnChorAnChorAnChorAnChorAnChor00';
const ID_T10 = '1Thang10Thang10Thang10Thang10T10';
const THANG = '2026-10';
const DONG_KHAI = 8;

/** Nguyên văn câu BA giao ở mục 6 — chép thẳng từ đề bài, KHÔNG sinh lại từ mã. */
const CAU_BA_GIAO =
  'Không mở được file tháng ' + THANG + '. ' +
  'Tài khoản chạy tool chưa được chia sẻ quyền Sửa với file này. ' +
  'Mở file đó, bấm Chia sẻ, thêm tài khoản đã deploy Web App với quyền Sửa.';

const MA_MOI = ['KHONG_CO_QUYEN', 'KHONG_THAY_FILE', 'KHONG_MO_DUOC_FILE'];

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
function test(ten, fn) {
  try { fn(); soDat++; console.log('ĐẠT   ' + ten); }
  catch (e) { soHong++; hong.push(ten + ' -> ' + e.message); console.log('HỎNG  ' + ten + '\n   -> ' + e.message); }
}
function dung(dieuKien, ghiChu) { if (!dieuKien) throw new Error(ghiChu || 'điều kiện sai'); }
function bang(thuc, mong, ghiChu) {
  if (thuc !== mong) throw new Error((ghiChu ? ghiChu + ': ' : '') + 'được ' + JSON.stringify(thuc) + ', cần ' + JSON.stringify(mong));
}
function bat(fn) {
  try { fn(); } catch (e) { return e; }
  throw new Error('lẽ ra phải ném lỗi mà lại chạy trót lọt');
}

// ==================================================================== giả lập dịch vụ Google

/** Sheet bảng link: chỉ dựng đúng vùng được phép đọc (A:C từ dòng 8). */
function sheetBangLink(bang3Cot) {
  return {
    getName: () => TEN_SHEET_TT,
    getLastRow: () => DONG_KHAI + bang3Cot.length - 1,
    getLastColumn: () => 14,
    getDataRange() { throw new Error('VI PHẠM: gọi getDataRange() trên sheet bảng link'); },
    getRange(r, c, nr, nc) {
      const soDong = nr == null ? 1 : nr, soCot = nc == null ? 1 : nc;
      return {
        getDisplayValues() {
          const out = [];
          for (let i = 0; i < soDong; i++) {
            const dong = [];
            for (let j = 0; j < soCot; j++) {
              const rr = r + i, cc = c + j;
              const d = rr >= DONG_KHAI ? bang3Cot[rr - DONG_KHAI] : null;
              dong.push(d && cc >= 1 && cc <= 3 ? String(d[cc - 1]) : '');
            }
            out.push(dong);
          }
          return out;
        },
        getValue() { return ''; }
      };
    }
  };
}

function link(id) { return 'https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=0'; }

/**
 * Nạp vỏ Google thật (src/*.gs) vào Node với dịch vụ Google giả.
 * `mt.loiMoFile` / `mt.loiMoNeo`: chuỗi Google sẽ ném khi mở file tháng / file mỏ neo. Rỗng = mở được.
 */
function nap() {
  const mt = { loiMoFile: '', loiMoNeo: '', thangGiaLap: THANG, thuocTinh: {}, daIn: [], moKhoa: 0 };

  const shLink = sheetBangLink([[2026, 'Kinh Doanh T10', link(ID_T10)]]);
  const fileMoNeo = { getName: () => 'THÁNG 10 - KINH DOANH', getSheetByName: (t) => (t === TEN_SHEET_TT ? shLink : null) };
  const fileThang = { getName: () => 'THÁNG 10 - KINH DOANH', getSheetByName: () => null };

  mt.thuocTinh['KEODON_BI_MAT'] = 'chuoi-bi-mat-du-dai-16';
  mt.thuocTinh['KEODON_MO_NEO_ID'] = ID_MO_NEO;

  const SpreadsheetApp = {
    openById(id) {
      if (id === ID_MO_NEO) {
        if (mt.loiMoNeo) throw new Error(mt.loiMoNeo);
        return fileMoNeo;
      }
      if (id === ID_T10) {
        if (mt.loiMoFile) throw new Error(mt.loiMoFile);
        return fileThang;
      }
      throw new Error('giả lập chưa dựng file có id ' + id);
    },
    flush() { }
  };
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (mt.thuocTinh[k] == null ? null : mt.thuocTinh[k]),
      setProperty: (k, v) => { mt.thuocTinh[k] = v; }
    })
  };
  const Utilities = {
    formatDate(d, tz, mau) {
      if (mau === 'yyyy-MM') return mt.thangGiaLap;
      return '00:00:00 01/10/2026';
    }
  };
  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput(s) { mt.daIn.push(s); return { _text: s, setMimeType() { return this; } }; }
  };
  const LockService = {
    getScriptLock: () => ({ tryLock: () => { mt.moKhoa++; return true; }, releaseLock: () => { mt.moKhoa--; } })
  };
  const Logger = { log: (x) => mt.daIn.push(String(x)) };

  const nguon = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs', 'ShellAppsScript.gs']
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const ten = new Set();
  for (const m of nguon.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const than = nguon + '\nreturn {' + [...ten].map((n) => `${n}: ${n}`).join(', ') + '};';
  const g = new Function('SpreadsheetApp', 'PropertiesService', 'Utilities', 'ContentService', 'LockService', 'Logger', than)
    (SpreadsheetApp, PropertiesService, Utilities, ContentService, LockService, Logger);
  g.__mt = mt;
  return g;
}

function goi(g, body) { return JSON.parse(g.doPost({ postData: { contents: JSON.stringify(body) } })._text); }

// ==================================================================== 1. BẢNG CA ĐO

/**
 * loai:
 *   QUYEN      thiếu quyền  → phải ra ĐÚNG NGUYÊN VĂN câu BA giao
 *   KHONG_THAY id sai/đã xóa → phải nói không tìm thấy, CẤM bảo đi chia sẻ
 *   LAP_LO     Google gộp hai lý do → phải nêu CẢ HAI
 *   GIU_NGUYEN mạng/hạn mức/máy chủ → phải giữ nguyên văn lý do gốc
 */
const CAC_CA = [
  { ma: 'A', ten: 'thiếu quyền — Apps Script tiếng Anh', loai: 'QUYEN',
    chuoi: 'Exception: You do not have permission to access the requested document.' },
  { ma: 'B', ten: 'thiếu quyền — Apps Script tiếng Việt', loai: 'QUYEN',
    chuoi: 'Ngoại lệ: Bạn không có quyền truy cập vào tài liệu được yêu cầu.' },
  { ma: 'C', ten: 'thiếu quyền — câu "does not have permission"', loai: 'QUYEN',
    chuoi: 'The user does not have permission to access this spreadsheet.' },
  { ma: 'D', ten: 'ID sai / không tồn tại — tiếng Anh', loai: 'KHONG_THAY',
    chuoi: 'Unexpected error while getting the method or property openById on object SpreadsheetApp.' },
  { ma: 'E', ten: 'ID sai / không tồn tại — tiếng Việt', loai: 'KHONG_THAY',
    chuoi: 'Lỗi không mong muốn khi lấy phương thức hoặc thuộc tính openById trên đối tượng SpreadsheetApp.' },
  { ma: 'F', ten: 'cột C rỗng → openById("")', loai: 'KHONG_THAY',
    chuoi: 'Invalid argument: id' },
  { ma: 'G', ten: 'file đã xóa hẳn — "File not found"', loai: 'KHONG_THAY',
    chuoi: 'File not found: ' + ID_T10 },
  { ma: 'H', ten: 'LẤP LỬNG — Drive gộp hai lý do vào một câu', loai: 'LAP_LO',
    chuoi: 'No item with the given ID could be found, or you do not have permission to access it.' },
  { ma: 'I', ten: 'LẤP LỬNG — bản tiếng Việt của câu trên', loai: 'LAP_LO',
    chuoi: 'Không tìm thấy mục nào có ID đã cho, hoặc bạn không có quyền truy cập vào mục đó.' },
  { ma: 'J', ten: 'LẤP LỬNG — file trong thùng rác / đã xóa (Google cũng nói nước đôi)', loai: 'LAP_LO',
    chuoi: 'Document ' + ID_T10 + " is missing (perhaps it was deleted, or you don't have read access?)" },
  { ma: 'K', ten: 'MẠNG — dịch vụ Spreadsheets hỏng giữa chừng', loai: 'GIU_NGUYEN',
    chuoi: 'Service Spreadsheets failed while accessing document with id ' + ID_T10 + '.' },
  { ma: 'L', ten: 'HẠN MỨC — quá số lần gọi một ngày', loai: 'GIU_NGUYEN',
    chuoi: 'Service invoked too many times for one day: spreadsheets.' },
  { ma: 'M', ten: 'MÁY CHỦ Google lỗi tạm', loai: 'GIU_NGUYEN',
    chuoi: "We're sorry, a server error occurred. Please wait a bit and try again." },
  { ma: 'N', ten: 'MẠNG — không tới được địa chỉ', loai: 'GIU_NGUYEN',
    chuoi: 'Address unavailable: https://docs.google.com/spreadsheets/' },
  { ma: 'O', ten: 'HẾT GIỜ 6 phút của Apps Script', loai: 'GIU_NGUYEN',
    chuoi: 'Exceeded maximum execution time' }
];

// ==================================================================== 2. PHÉP CHẤM

/**
 * Chấm MỘT ca trên MỘT bản cài đặt. Trả về danh sách chỗ lệch (rỗng = đạt).
 * Đây là phép chấm DUY NHẤT — phần đối chứng âm ở dưới chạy đúng hàm này lên các bản SAI.
 */
function cham(err, ca) {
  const l = [];
  const m = String(err && err.message ? err.message : err || '');
  const ma = err ? err.maKeodon : undefined;

  if (ca.loai === 'GIU_NGUYEN') {
    if (m !== ca.chuoi) l.push('phải giữ NGUYÊN VĂN lý do gốc của Google, được "' + m + '"');
    if (MA_MOI.indexOf(ma) >= 0) l.push('gắn mã ' + ma + ' cho lỗi mạng/hạn mức — nuốt mất lý do gốc');
    return l;
  }

  if (m === ca.chuoi) l.push('vẫn ném thô nguyên câu của Google');
  if (m.indexOf('Không mở được file tháng ') !== 0) l.push('không mở đầu bằng "Không mở được file tháng …"');
  if (m.indexOf(THANG) < 0) l.push('câu lỗi KHÔNG nêu kỳ tháng ' + THANG);
  if (m.indexOf(ID_T10) >= 0) l.push('làm lộ ID file trong câu lỗi');

  if (ca.loai === 'QUYEN') {
    if (m !== CAU_BA_GIAO) l.push('không đúng nguyên văn câu BA giao');
    if (ma !== 'KHONG_CO_QUYEN') l.push('mã lỗi là ' + JSON.stringify(ma) + ', cần "KHONG_CO_QUYEN"');
  } else if (ca.loai === 'KHONG_THAY') {
    if (m.toLowerCase().indexOf('không tìm thấy') < 0) l.push('không nói ra là KHÔNG TÌM THẤY file');
    if (m.indexOf('bấm Chia sẻ') >= 0) l.push('đổ cho thiếu quyền: vẫn bảo người ta đi bấm Chia sẻ');
    if (ma !== 'KHONG_THAY_FILE') l.push('mã lỗi là ' + JSON.stringify(ma) + ', cần "KHONG_THAY_FILE"');
  } else {
    if (m.toLowerCase().indexOf('không tìm thấy') < 0) l.push('ca lấp lửng mà không nêu khả năng không tìm thấy file');
    if (m.indexOf('bấm Chia sẻ') < 0) l.push('ca lấp lửng mà không nêu khả năng chưa chia sẻ quyền');
    if (ma !== 'KHONG_MO_DUOC_FILE') l.push('mã lỗi là ' + JSON.stringify(ma) + ', cần "KHONG_MO_DUOC_FILE"');
  }
  return l;
}

/** Chạy cả bảng ca lên một bản cài đặt, trả về danh sách ca lệch. */
function chamCaBang(banCaiDat) {
  const lech = [];
  CAC_CA.forEach((ca) => {
    const l = cham(banCaiDat(ca), ca);
    if (l.length) lech.push({ ca: ca, vi: l });
  });
  return lech;
}

// ==================================================================== 3. BẢN THẬT

const gChung = nap();
const F_THANG = { fileId: ID_T10, thang: THANG, dong: 44 };

/** Bản THẬT: gọi thẳng `moFileThang_` trong src/ShellAppsScript.gs. */
function banThat(ca) {
  gChung.__mt.loiMoFile = ca.chuoi;
  return bat(() => gChung.moFileThang_(F_THANG));
}

console.log('--- 1. Bản thật: từng ca Google ném ra ---');
CAC_CA.forEach((ca) => {
  test('T-QM-' + ca.ma + ' [' + ca.loai + '] ' + ca.ten, () => {
    const l = cham(banThat(ca), ca);
    if (l.length) throw new Error(l.join(' · '));
  });
});

console.log('--- 2. Nguyên văn câu lỗi in ra cho từng nhóm ---');
['A', 'D', 'H', 'K'].forEach((ma) => {
  const ca = CAC_CA.filter((x) => x.ma === ma)[0];
  console.log('      [' + ca.loai + '] ' + String(banThat(ca).message));
});

test('T-QM-P1 giữ lại lý do gốc của Google trên e.loiGoc (để soi, KHÔNG in ra người dùng)', () => {
  const ca = CAC_CA[0];
  bang(banThat(ca).loiGoc, ca.chuoi);
});

test('T-QM-P2 mọi chỗ mở bảng tính đều đi qua moBangTinh_ (đếm trên mã đã bỏ chú thích)', () => {
  const src = fs.readFileSync(FILE_SHELL, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((d) => d.replace(/\/\/.*$/, '')).join('\n');
  const soLan = (src.match(/SpreadsheetApp\.openById\s*\(/g) || []).length;
  bang(soLan, 1, 'số lời gọi SpreadsheetApp.openById còn lại trong mã');
  const than = src.slice(src.indexOf('function moBangTinh_'), src.indexOf('function moFileThang_'));
  dung(than.indexOf('SpreadsheetApp.openById') >= 0, 'lời gọi duy nhất phải nằm trong moBangTinh_');
  dung((src.match(/moFileThang_\(f\)/g) || []).length >= 4, 'bốn chỗ mở file tháng phải gọi moFileThang_');
});

console.log('--- 3. Đi trọn đường Web App (doPost) — mã lỗi phải sống sót ---');

test('T-QM-E1 hanhDong "doc" → loi = KHONG_CO_QUYEN, thongBao đúng nguyên văn', () => {
  const g = nap();
  g.__mt.loiMoFile = CAC_CA[0].chuoi;
  const kq = goi(g, { token: 'chuoi-bi-mat-du-dai-16', hanhDong: 'doc', thang: THANG });
  bang(kq.ok, false);
  bang(kq.loi, 'KHONG_CO_QUYEN', 'mã lỗi bị doPost nuốt thành NGOAI_LE');
  bang(kq.thongBao, CAU_BA_GIAO);
});

test('T-QM-E2 hanhDong "ghi" → cùng câu đó, và khóa ghi được trả lại', () => {
  const g = nap();
  g.__mt.loiMoFile = CAC_CA[0].chuoi;
  const kq = goi(g, { token: 'chuoi-bi-mat-du-dai-16', hanhDong: 'ghi', thang: THANG, lenh: [] });
  bang(kq.loi, 'KHONG_CO_QUYEN');
  bang(kq.thongBao, CAU_BA_GIAO);
  bang(g.__mt.moKhoa, 0, 'khóa ghi phải được trả lại dù mở file hỏng');
});

test('T-QM-E3 hanhDong "xuLy" → cùng câu đó', () => {
  const g = nap();
  g.__mt.loiMoFile = CAC_CA[0].chuoi;
  const kq = goi(g, { token: 'chuoi-bi-mat-du-dai-16', hanhDong: 'xuLy', thang: THANG, cacFile: [] });
  bang(kq.loi, 'KHONG_CO_QUYEN');
  bang(kq.thongBao, CAU_BA_GIAO);
});

test('T-QM-E4 thuDinhTuyenThang (chạy tay trong trình soạn thảo) → cùng câu đó', () => {
  const g = nap();
  g.__mt.loiMoFile = CAC_CA[0].chuoi;
  bang(bat(() => g.thuDinhTuyenThang()).message, CAU_BA_GIAO);
});

test('T-QM-E5 file MỎ NEO không có quyền → câu riêng, KHÔNG mạo nhận là file tháng nào', () => {
  const g = nap();
  g.__mt.loiMoNeo = CAC_CA[0].chuoi;
  const kq = goi(g, { token: 'chuoi-bi-mat-du-dai-16', hanhDong: 'doc', thang: THANG });
  bang(kq.loi, 'KHONG_CO_QUYEN');
  dung(kq.thongBao.indexOf('Không mở được file mỏ neo') === 0, 'phải nói rõ là file mỏ neo, được: ' + kq.thongBao);
  dung(kq.thongBao.indexOf('bấm Chia sẻ') > 0, 'vẫn phải chỉ đúng việc phải làm');
  dung(kq.thongBao.indexOf(ID_MO_NEO) < 0, 'không được lộ id mỏ neo');
  const ping = goi(g, { token: 'chuoi-bi-mat-du-dai-16', hanhDong: 'ping' });
  dung(ping.ok === true, 'ping phải vẫn trả lời được — nó chính là phép thử để tìm ra hỏng');
  dung(String(ping.loiMoNeo || '').indexOf('Không mở được file mỏ neo') === 0, 'ping phải nêu đúng lý do, được: ' + ping.loiMoNeo);
});

test('T-QM-E6 mở được file bình thường thì không đổi gì', () => {
  const g = nap();
  bang(g.moFileThang_(F_THANG).getName(), 'THÁNG 10 - KINH DOANH');
});

// ==================================================================== 4. ĐỐI CHỨNG ÂM

console.log('--- 4. Đối chứng âm: dựng lại bản SAI, phép chấm phải báo LỆCH ---');

/** SAI 1 — không bắt lỗi gì cả: ném thô nguyên câu của Google (đúng hiện trạng trước khi sửa). */
function banKhongBat(ca) { return new Error(ca.chuoi); }

/** SAI 2 — bắt quá tay: mọi lỗi openById đều đổ cho thiếu quyền. */
function banQuaTay() {
  const e = new Error(CAU_BA_GIAO);
  e.maKeodon = 'KHONG_CO_QUYEN';
  return e;
}

/** SAI 3 — phân loại đúng, câu tiếng Việt đúng, nhưng QUÊN nêu kỳ tháng. */
function banThieuKy(ca) {
  const e = banThat(ca);
  if (MA_MOI.indexOf(e.maKeodon) < 0) return e;                 // ca giữ nguyên: không đụng
  const g = new Error(String(e.message).split('file tháng ' + THANG).join('file tháng này'));
  g.maKeodon = e.maKeodon;
  return g;
}

function doiChung(ten, banSai, caPhaiLech) {
  test(ten, () => {
    const lech = chamCaBang(banSai);
    const maLech = lech.map((x) => x.ca.ma);
    console.log('      dựng cái sai → phép chấm báo LỆCH ' + lech.length + '/' + CAC_CA.length +
      ' ca: ' + (maLech.join(', ') || '(không ca nào)'));
    dung(lech.length > 0, 'phép chấm KHÔNG bắt được bản sai này — chỉ tiêu là chỉ tiêu chết');
    (caPhaiLech || []).forEach((ma) => {
      const ca = CAC_CA.filter((x) => x.ma === ma)[0];
      dung(maLech.indexOf(ma) >= 0, 'phải LỆCH ở ca ' + ma + ' (' + ca.ten + ') mà lại cho ĐẠT');
    });
  });
}

const CA_ID_SAI = ['D', 'E', 'F', 'G'];
const CA_MANG = ['K', 'L', 'M', 'N', 'O'];

doiChung('T-QM-N1 bản KHÔNG BẮT LỖI (ném thô của Google) → phải LỆCH',
  banKhongBat, ['A', 'B'].concat(CA_ID_SAI));
doiChung('T-QM-N2 bản BẮT QUÁ TAY (đổ hết cho thiếu quyền) → phải LỆCH ở ca ID sai và ca lỗi mạng',
  banQuaTay, CA_ID_SAI.concat(CA_MANG));
doiChung('T-QM-N3 bản CÓ CÂU TIẾNG VIỆT nhưng KHÔNG nêu kỳ tháng → phải LỆCH',
  banThieuKy, ['A', 'B'].concat(CA_ID_SAI));

test('T-QM-N4 đối chứng dương: phép chấm KHÔNG báo lệch oan cho bản thật', () => {
  const lech = chamCaBang(banThat);
  dung(lech.length === 0, 'bản thật lệch ' + lech.length + ' ca: ' +
    lech.map((x) => x.ca.ma + ' (' + x.vi.join(' · ') + ')').join(' | '));
});

// ==================================================================== kết luận

console.log('');
if (hong.length) { console.log('CÁC BÀI HỎNG:'); hong.forEach((h) => console.log('  · ' + h)); console.log(''); }
console.log('=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
process.exit(soHong ? 1 : 0);
