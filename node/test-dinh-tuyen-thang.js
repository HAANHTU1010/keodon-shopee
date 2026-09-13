/**
 * test-dinh-tuyen-thang.js — ĐỊNH TUYẾN THÁNG THEO `link_thang` TRÊN MÁY (D-42) + ĐỐI CHIẾU PHIÊN BẢN
 * (GV-v2.3 mục 2.3) + CHỐNG GHI TRÙNG / MẤT ĐỊNH DẠNG. Chạy: `node node/test-dinh-tuyen-thang.js`.
 *
 * Không cần Google, không gọi mạng.
 *
 * ------------------------------------------------------------------ VÌ SAO BỘ NÀY ĐƯỢC VIẾT LẠI
 * Bản trước (46 bài) kiểm một cơ chế NAY ĐÃ BỎ: Web App đọc bảng link trong sheet `Thông tin shop ` của
 * một "file mỏ neo", phân tích cột A (năm) và cột B (tên kỳ) rồi rút link ở cột C. D-42 (12/9/2026)
 * chuyển bảng link về máy — `link_thang` trong `CAU_HINH_VAN_HANH.json` — và máy gửi thẳng
 * `spreadsheetId` trong gói. Ba lý do chốt như vậy, ghi lại để không ai mở lại cuộc bàn:
 *
 *   1. Bảng link nằm TRONG file tháng thì nó tự nhân bản theo file: vỏ tháng mới mang bảng link chụp lúc
 *      nhân bản, dừng ở tháng trước. Người tạo file phải nhớ thêm dòng vào CẢ file cũ lẫn file mới.
 *   2. Sheet `Thông tin shop ` có các ô đăng nhập gian hàng ở dòng 1-6. Mọi phép đọc nó, dù chặt tới đâu,
 *      vẫn là một đường đi tới vùng đó — bỏ hẳn thì không còn gì để canh.
 *   3. User đã phải bấm nút 3 khi sang tháng mới; khai link ngay ở đó là một việc thay vì hai.
 *
 * Vì thế mọi bài về "phân tích tên kỳ", "chọn dòng", "vùng cấm đọc A:C từ dòng 8" đều KHÔNG còn đối tượng
 * để kiểm. Bộ mới giữ nguyên họ mã `T-DT-` (cùng thứ được canh: ĐƠN PHẢI VÀO ĐÚNG FILE THÁNG) và phủ:
 *
 *   · tra khóa `link_thang`: có · thiếu · rỗng · không phải link Google Sheet · có khoảng trắng thừa
 *   · `--thang` chạy tay (D-21b) và cờ `choPhepThangKhac` chỉ đi kèm lượt chạy tay đó
 *   · KIỂM CHÉO TÊN FILE với tháng — hàng rào chống "link trỏ nhầm file tháng khác", kèm ĐỐI CHỨNG ÂM
 *   · gói thiếu `spreadsheetId` → mã lỗi riêng, không đổ oan cho quyền
 *   · không ghi lùi / không ghi trước · định dạng ô trước khi ghi giá trị · khử trùng hai tầng
 *   · hàng rào cột cấm ghi E/F/M/N (tầng 2) kèm đối chứng âm gỡ hàng rào
 *
 * VÙNG CẤM nay được canh bằng INV-10 trong `node/test-bat-bien.js`, và canh CHẶT HƠN trước: không phải
 * "chỉ đọc A:C từ dòng 8" mà là "không được tra sheet đó một lần nào".
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { kiemPhienBan, thongBaoLechPhienBan, PHIEN_BAN, idFileThang, canhBaoThangSau, thangSau } = require('./gsheet-web-app');

const SRC = path.join(__dirname, '..', 'src');
const FILE_SHELL = path.join(SRC, 'ShellAppsScript.gs');

const ID_T9 = 'ID_FILE_2026_09_GIA_LAP_KEODON';
const ID_T10 = 'ID_FILE_2026_10_GIA_LAP_KEODON';
const TEN_T9 = 'THÁNG-9-2026-KINH-DOANH';
const TEN_T10 = 'THÁNG-10-2026-KINH-DOANH';
const link = (id) => 'https://docs.google.com/spreadsheets/d/' + id + '/edit#gid=0';
const BI_MAT = 'BI-MAT-TEST-DINH-TUYEN-THANG-0123456789';

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
  try { fn(); } catch (e) { return e; }
  throw new Error('lẽ ra phải ném lỗi mà lại chạy trót lọt');
}

// ==================================================================== giả lập dịch vụ Google

/** Một ô: giá trị hiển thị, công thức, định dạng số, màu nền. */
function oMoi() { return { v: '', f: '', nf: '', bg: '#ffffff' }; }

/**
 * Sheet giả. Ghi lại MỌI lời gọi getRange và THỨ TỰ thao tác trên từng vùng, để bài test soi được
 * `setNumberFormat` có đi trước `setValues` hay không — đặt định dạng sau là Sheets đã kịp đổi kiểu ô.
 */
function sheetGia(ten, soDong, soCot, moiTruong) {
  const o = [];
  for (let r = 0; r <= soDong; r++) { o.push([]); for (let c = 0; c <= soCot; c++) o[r].push(oMoi()); }

  const sh = {
    _o: o,
    getName: () => ten,
    getLastRow: () => (sh._lastRow != null ? sh._lastRow : soDong),
    getLastColumn: () => (sh._lastCol != null ? sh._lastCol : soCot),
    getDataRange() { throw new Error('VI PHẠM: gọi getDataRange() trên sheet "' + ten + '"'); },
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

/** Sheet gian hàng: dòng 2 tiêu đề, dòng 3 dòng tổng, dòng 4 một đơn cũ (để kiểm chống trùng). */
function sheetGianHang(moiTruong) {
  // Lưới rộng tới cột 30 nhưng getLastColumn vẫn báo 14: dòng 1 từ cột P sang phải là chỗ tool đóng dấu
  // thời gian; lưới hẹp hơn thì lời gọi đó ném và bị try/catch nuốt im — bài T-DT-40b sẽ xanh giả vì
  // "không ghi gì" chứ không phải vì ghi đúng.
  const sh = sheetGia('Shopee mall', 300, 30, moiTruong);
  ['Ngày', 'Nguồn', 'Mã đơn', 'Tên VT', 'TT', 'Nhập', 'SL', 'Tổng tiền SP', 'MGG', 'Chi phí', 'Thuế',
    'Doanh Thu', 'Đã TT', 'Còn Nợ'].forEach((t, i) => { sh._o[2][i + 1].v = t; });
  sh._o[3][8].v = 0;
  sh._o[4][3].v = 'TEST0802HHHH08';      // đơn đã có — gửi lại phải bị bỏ qua
  sh._o[4][12].f = '=R[0]C[-4]-R[0]C[-2]';
  sh._lastRow = 4;
  sh._lastCol = 14;
  return sh;
}

/** Sheet Mapping tối thiểu — `toLaiMapping_` (D-47) tô lại tab này sau mỗi lượt ghi. */
function sheetMapping(moiTruong) {
  const sh = sheetGia('Mapping_san_pham', 10, 12, moiTruong);
  ['Gian hàng', 'Tên trên Shopee', 'Phân loại', 'Tên viết tắt', 'Hệ số', 'Cấu phần', 'Xác nhận']
    .forEach((t, i) => { sh._o[1][i + 1].v = t; });
  sh._o[2][1].v = 'Shopee mall'; sh._o[2][2].v = 'Hàng mẫu'; sh._o[2][4].v = 'dt5'; sh._o[2][7].v = 'CÓ';
  sh._o[3][1].v = 'Shopee mall'; sh._o[3][2].v = 'Hàng chưa soát';
  sh._lastRow = 3;
  sh._lastCol = 7;
  return sh;
}

/**
 * DỰNG LẠI KHUYẾT TẬT cho đối chứng âm của T-DT-42: gỡ đúng HÀNG RÀO TẦNG 2 khỏi mã nguồn thật trước khi
 * nạp, rồi chạy lại y hệt ba ca kia. Nếu ba ca đó vẫn ĐẠT khi hàng rào đã bị gỡ thì chúng không kiểm gì
 * cả — đó chính là bệnh TM-10 ("phép kiểm luôn luôn ĐẠT", xem test-tao-thang-moi.js).
 *
 * Mã nguồn đổi làm chuỗi này không còn khớp thì hàm NÉM LỖI chứ không im lặng trả về nguyên văn — bằng
 * không đối chứng âm sẽ tự xanh giả trong khi không gỡ được gì.
 */
function goHangRaoTang2_(nguon) {
  const CU = "if (COT_CAM_GHI.indexOf(c) >= 0)\n    throw new Error('TỪ CHỐI GHI: '";
  const MOI = "if (false)\n    throw new Error('TỪ CHỐI GHI: '";
  const soLan = nguon.split(CU).length - 1;
  if (soLan !== 1) {
    throw new Error('ĐỐI CHỨNG ÂM HỎNG: cần đúng 1 chỗ khớp hàng rào tầng 2 trong ShellAppsScript.gs, ' +
      'tìm được ' + soLan + '. Mã đã đổi — sửa lại goHangRaoTang2_ cho khớp, ĐỪNG bỏ qua.');
  }
  return nguon.split(CU).join(MOI);
}

/**
 * Nạp vỏ Google thật vào Node với dịch vụ Google giả.
 * @param {Object} [tuyChon] thangGiaLap · goHangRaoTang2 · tenFileT9 (đổi tên file để thử kiểm chéo tháng)
 */
function nap(tuyChon) {
  const t = tuyChon || {};
  const moiTruong = {
    vungDoc: [], thaoTac: [], gopO: [], daIn: [], thuocTinh: {},
    thangGiaLap: t.thangGiaLap || '2026-09', moKhoa: 0
  };
  // Như thể chủ dự án đã chạy `caiDat(<chuỗi>)` một lần (YC-28). `khongCaiDat` dựng ca ngược lại.
  if (!t.khongCaiDat) moiTruong.thuocTinh['KEODON_BI_MAT'] = BI_MAT;
  const cacFile = {};
  cacFile[ID_T9] = {
    ten: t.tenFileT9 || TEN_T9,
    sheets: { 'Shopee mall': sheetGianHang(moiTruong), 'Mapping_san_pham': sheetMapping(moiTruong) }
  };
  cacFile[ID_T10] = {
    ten: TEN_T10,
    sheets: { 'Shopee mall': sheetGianHang(moiTruong), 'Mapping_san_pham': sheetMapping(moiTruong) }
  };
  moiTruong.cacFile = cacFile;

  const SpreadsheetApp = {
    openById(id) {
      const f = cacFile[id];
      if (!f) {
        // Câu Google NÉM THẬT khi ID sai hoặc file đã xóa. Nó KHÔNG mang ID — đó là lý do `moBangTinh_`
        // đổi được nó thành câu tiếng Việt mà không lộ gì. Giả lập tự nhét ID vào câu lỗi thì bài quét rò
        // rỉ bên dưới sẽ bắt chính cái giả lập chứ không bắt mã thật, và ta mất một phép canh.
        if (t.loiMoFileKemId) throw new Error('Giả lập lỗi lạ có kèm id ' + id);
        throw new Error('Unexpected error while getting the method or property openById on object SpreadsheetApp.');
      }
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
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    // Byte CÓ DẤU như Apps Script — trả không dấu thì `bam256_` ra chuỗi khác bản chạy thật.
    computeDigest(thuat, chuoi) {
      const b = crypto.createHash('sha256').update(String(chuoi), 'utf8').digest();
      return Array.from(b).map((v) => (v > 127 ? v - 256 : v));
    },
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

  let nguon = ['Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs', 'MapListing.gs', 'DanhMuc.gs', 'ShellAppsScript.gs']
    .map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  if (t.goHangRaoTang2) nguon = goHangRaoTang2_(nguon);   // chỉ dùng cho đối chứng âm T-DT-42d
  const ten = new Set();
  for (const m of nguon.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const than = nguon + '\nreturn {' + [...ten].map((n) => `${n}: ${n}`).join(', ') + '};';
  const g = new Function('SpreadsheetApp', 'PropertiesService', 'Utilities', 'ContentService', 'LockService', 'Logger', than)
    (SpreadsheetApp, PropertiesService, Utilities, ContentService, LockService, Logger);
  g.__moiTruong = moiTruong;
  return g;
}

/** Gọi doPost như Web App thật. Mặc định gửi kèm ID file tháng 9 — đúng hợp đồng D-42. */
function goi(g, body) {
  const day = Object.assign({ token: BI_MAT, spreadsheetId: ID_T9 }, body);
  const kq = g.doPost({ postData: { contents: JSON.stringify(day) } });
  return JSON.parse(kq._text);
}

// ==================================================================== 1. TRA `link_thang` TRÊN MÁY

console.log('--- Tra link_thang trong CAU_HINH_VAN_HANH.json (hàm thuần, phía máy) ---');
{
  const BANG = { '2026-09': link(ID_T9), '2026-10': link(ID_T10) };

  test('T-DT-01 tháng có khai → rút đúng ID từ link', () => {
    bang(idFileThang(BANG, '2026-09').id, ID_T9);
    bang(idFileThang(BANG, '2026-10').id, ID_T10);
  });

  test('T-DT-02 link dính khoảng trắng đầu/cuối vẫn nhận (user dán link hay bị)', () => {
    bang(idFileThang({ '2026-09': '   ' + link(ID_T9) + '  \n' }, '2026-09').id, ID_T9);
  });

  test('T-DT-03 THIẾU khóa tháng → dừng với câu chuẩn D-42, nêu đúng nút phải bấm', () => {
    const e = nemLoi(() => idFileThang(BANG, '2026-11'));
    bang(e.maKeodon, 'CHUA_CO_LINK_THANG');
    dung(e.message.indexOf('CHƯA CÓ LINK FILE THÁNG 2026-11') === 0, 'câu phải mở đầu đúng: ' + e.message);
    dung(/3_TAO_FILE_THANG_MOI\.bat/.test(e.message), 'phải chỉ ra nút phải bấm: ' + e.message);
    dung(/không ghi gì/i.test(e.message), 'phải nói rõ CHƯA ghi gì: ' + e.message);
  });

  test('T-DT-04 khóa có nhưng RỖNG (hoặc toàn khoảng trắng) → cũng là chưa khai, không phải link hỏng', () => {
    for (const v of ['', '   ', null, undefined]) {
      const e = nemLoi(() => idFileThang({ '2026-11': v }, '2026-11'));
      bang(e.maKeodon, 'CHUA_CO_LINK_THANG', 'với giá trị ' + JSON.stringify(v));
    }
  });

  test('T-DT-05 có khóa nhưng KHÔNG phải link Google Sheet → mã lỗi riêng, và không in lại giá trị', () => {
    // Hai ca khác nhau, hai việc phải làm khác nhau: chưa khai thì đi khai; khai sai thì đi sửa dòng đó.
    // Gộp một mã lỗi là bắt người đọc tự đoán mình đang ở ca nào.
    for (const v of ['chưa xin được link', 'https://drive.google.com/file/d/abc/view',
      'https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWx/edit', 'ID_NGAN']) {
      const e = nemLoi(() => idFileThang({ '2026-11': v }, '2026-11'));
      bang(e.maKeodon, 'LINK_THANG_HONG', 'với giá trị ' + JSON.stringify(v));
      dung(e.message.indexOf(v) < 0, 'câu lỗi KHÔNG được in lại giá trị đang có trong ô: ' + e.message);
      dung(/CAU_HINH_VAN_HANH\.json/.test(e.message), 'phải chỉ ra file phải sửa');
    }
  });

  test('T-DT-06 khóa object nên 1-1 tự nhiên: ghi lại tháng đã có là GHI ĐÈ, không đẻ hai link', () => {
    // Đây là lý do D-42 chọn object thay vì một bảng nhiều dòng: không có cách nào để một tháng có hai
    // link mà tool phải đi đoán lấy cái nào. Bản cũ đọc bảng trên Sheet thì phải có hẳn mã TRUNG_NHIEU_DONG.
    const b = { '2026-10': link(ID_T9) };
    b['2026-10'] = link(ID_T10);
    bang(Object.keys(b).length, 1, 'một tháng chỉ được một khóa');
    bang(idFileThang(b, '2026-10').id, ID_T10, 'giá trị ghi sau thắng');
  });

  test('T-DT-07 cảnh báo sớm: chưa khai THÁNG SAU thì nhắc ngay hôm nay', () => {
    const cau = canhBaoThangSau(BANG, '2026-10');
    dung(cau && cau.indexOf('2026-11') >= 0, 'phải nhắc tháng 11: ' + cau);
    bang(canhBaoThangSau(BANG, '2026-09'), null, 'đã có tháng 10 thì không được kêu oan');
    bang(thangSau('2026-12'), '2027-01', 'sang năm phải nhảy đúng');
  });
}

// ==================================================================== 2. WEB APP MỞ FILE THEO ID

console.log('--- Web App mở file tháng theo ID trong gói (D-42) ---');
{
  test('T-DT-08 gói có ID hợp lệ → mở đúng file, trả về TÊN file chứ không trả ID', () => {
    const g = nap();
    const kq = goi(g, { hanhDong: 'doc', thang: '2026-09' });
    dung(kq.ok, 'phải đọc được: ' + JSON.stringify(kq).slice(0, 160));
    bang(kq.tenFile, TEN_T9);
    dung(JSON.stringify(kq).indexOf(ID_T9) < 0, 'phản hồi KHÔNG được mang ID file');
  });

  test('T-DT-09 gói THIẾU spreadsheetId → mã riêng THIEU_ID_FILE, chỉ đúng nút phải bấm', () => {
    const g = nap();
    const kq = JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ token: BI_MAT, hanhDong: 'doc', thang: '2026-09' }) } })._text);
    bang(kq.ok, false);
    bang(kq.loi, 'THIEU_ID_FILE');
    dung(/2_CAP_NHAT\.bat/.test(kq.thongBao), 'phải chỉ ra nút cập nhật: ' + kq.thongBao);
  });

  test('T-DT-10 ID mở không được → câu tiếng Việt chỉ đúng khóa phải sửa, không lộ ID', () => {
    const ID_LA = 'ID_KHONG_CO_TRONG_GIA_LAP_XX';
    const g = nap();
    const kq = goi(g, { hanhDong: 'doc', thang: '2026-09', spreadsheetId: ID_LA });
    bang(kq.ok, false);
    bang(kq.loi, 'KHONG_THAY_FILE');
    dung(kq.thongBao.indexOf(ID_LA) < 0, 'không được lộ ID: ' + kq.thongBao);
    dung(/link_thang\["2026-09"\]/.test(kq.thongBao), 'phải chỉ đúng khóa phải sửa: ' + kq.thongBao);
    dung(/KHÔNG phải lỗi chia sẻ quyền/.test(kq.thongBao),
      'ID sai thì đi sửa link, đừng đẩy người ta đi chia sẻ file: ' + kq.thongBao);

    // ĐỐI CHỨNG ÂM cho phép quét rò rỉ: nếu ID có lọt ra thật thì `indexOf(...) < 0` ở trên phải TRƯỢT.
    // Dựng lại bằng một lỗi KHÔNG mang dấu hiệu nào — `moBangTinh_` cố ý ném nguyên lỗi cũ ở nhánh này
    // (mạng, hạn mức, lỗi máy chủ), nên câu của Google đi thẳng ra ngoài. Câu thật của ba nhóm đó không
    // mang ID; đây là giả lập để chứng minh phép quét có mắt, không phải một lỗ đang mở.
    const gRo = nap({ loiMoFileKemId: true });
    const roRi = goi(gRo, { hanhDong: 'doc', thang: '2026-09', spreadsheetId: ID_LA });
    dung(String(roRi.thongBao).indexOf(ID_LA) >= 0,
      'phép quét MÙ: ID lọt ra mà câu chấm vẫn không thấy — ' + roRi.thongBao);
  });

  test('T-DT-11 bocIdTuLink_ nhận link đủ kiểu và ID trần, từ chối chuỗi lạ', () => {
    const g = nap();
    bang(g.bocIdTuLink_(link(ID_T9)), ID_T9);
    bang(g.bocIdTuLink_('https://docs.google.com/spreadsheets/d/' + ID_T9), ID_T9);
    bang(g.bocIdTuLink_(ID_T9), ID_T9, 'ID trần');
    ['', 'chưa có link', 'https://drive.google.com/file/d/abc/view', 'ID_NGAN'].forEach((x) => {
      bang(g.bocIdTuLink_(x), '', 'với ' + JSON.stringify(x));
    });
  });
}

// ==================================================================== 3. KIỂM CHÉO TÊN FILE VỚI THÁNG

console.log('--- Hàng rào SAI_THANG_FILE: link trỏ nhầm file tháng khác ---');
{
  test('T-DT-12 đọc được tháng/năm từ tên file, đủ các kiểu chủ dự án hay đặt', () => {
    const g = nap();
    const ca = [
      ['THÁNG-9-2026-KINH-DOANH', 2026, 9],
      ['THANG-09-2026-KINH-DOANH', 2026, 9],
      ['DEMO_THÁNG-9-2026-KINH-DOANH', 2026, 9],
      ['THÁNG 10/2026', 2026, 10],
      ['Kinh Doanh T9-2026', 2026, 9],
      ['T12-2026', 2026, 12]
    ];
    ca.forEach(([ten, nam, thang]) => {
      const kq = g.thangTrongTenFile_(ten);
      dung(kq, 'không đọc được tháng trong tên "' + ten + '"');
      bang([kq.nam, kq.thang], [nam, thang], 'tên "' + ten + '"');
    });
    ['Sổ kinh doanh', 'THÁNG-13-2026', 'THÁNG-9-1999', 'bản sao (2)'].forEach((ten) => {
      bang(g.thangTrongTenFile_(ten), null, 'tên "' + ten + '" không được đoán bừa');
    });
  });

  test('T-DT-13 link trỏ nhầm file tháng khác → TỪ CHỐI SAI_THANG_FILE, không ghi ô nào', () => {
    // Đây là hàng rào quan trọng nhất của D-42. Thiếu link thì tool tắc, ai cũng thấy ngay. Trỏ NHẦM
    // link thì tool chạy êm và ghi vào sổ sai tháng — `Tổng xuất` trừ tồn ở tháng sai, và thường vài
    // tuần sau khi đối chiếu mới lộ ra. Tên file là thứ duy nhất tố giác được.
    const g = nap({ thangGiaLap: '2026-10' });
    const kq = goi(g, {
      hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-10', spreadsheetId: ID_T9,
      lenh: [{ tenSheet: 'Shopee mall', don: [{ maDon: 'MOI001', ngay: '2026-10-01', tien: {}, dong: [{}] }] }]
    });
    bang(kq.ok, false);
    bang(kq.loi, 'SAI_THANG_FILE');
    dung(kq.thongBao.indexOf(TEN_T9) > 0, 'phải nêu TÊN file đang bị trỏ tới: ' + kq.thongBao);
    dung(/link_thang\["2026-10"\]/.test(kq.thongBao), 'phải nêu đúng khóa phải sửa: ' + kq.thongBao);
    dung(kq.thongBao.indexOf(ID_T9) < 0, 'không được lộ ID file');
    bang(g.__moiTruong.thaoTac.length, 0, 'từ chối rồi mà vẫn ghi là hỏng');
  });

  test('T-DT-14 ĐỐI CHỨNG ÂM: bỏ hàng rào tên file → đơn tháng 10 chui vào sổ tháng 9', () => {
    // Không có bài này thì T-DT-13 chỉ chứng minh "mã hôm nay chặn", chưa chứng minh phép chấm có mắt.
    const g = nap({ thangGiaLap: '2026-10' });
    // Dựng lại đúng khuyết tật: tên file không đọc được tháng ⇒ hàng rào chỉ cảnh báo, không chặn.
    const gBoRao = nap({ thangGiaLap: '2026-10', tenFileT9: 'Sổ kinh doanh (bản sao)' });
    const kq = goi(gBoRao, {
      hanhDong: 'ghi', phienBanMongDoi: gBoRao.PHIEN_BAN, thang: '2026-10', spreadsheetId: ID_T9,
      lenh: [{ tenSheet: 'Shopee mall', don: [{ maDon: 'MOI002', ngay: '2026-10-01', tien: {}, dong: [{}] }] }]
    });
    dung(kq.ok, 'tên file không đọc được tháng thì phải CHO CHẠY, chỉ cảnh báo: ' + JSON.stringify(kq).slice(0, 140));
    const cb = (kq.canhBao || []).filter((c) => /Không đọc được tháng\/năm trong tên file/.test(c));
    bang(cb.length, 1, 'phải để lại đúng một câu cảnh báo, nhận: ' + JSON.stringify(kq.canhBao));
    // Và chứng minh chiều ngược: cùng gói đó, file có tên đúng mẫu thì bị CHẶN (T-DT-13 ở trên).
    const kq2 = goi(g, {
      hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-10', spreadsheetId: ID_T9,
      lenh: [{ tenSheet: 'Shopee mall', don: [{ maDon: 'MOI002', ngay: '2026-10-01', tien: {}, dong: [{}] }] }]
    });
    bang(kq2.loi, 'SAI_THANG_FILE', 'tên file đúng mẫu thì phải chặn');
  });

  test('T-DT-15 tên file khớp tháng → chạy bình thường, không đẻ cảnh báo oan', () => {
    const g = nap({ thangGiaLap: '2026-10' });
    const kq = goi(g, { hanhDong: 'doc', thang: '2026-10', spreadsheetId: ID_T10 });
    dung(kq.ok, 'phải chạy: ' + JSON.stringify(kq).slice(0, 140));
    const cb = (kq.canhBao || []).filter((c) => /tên file/.test(c));
    bang(cb.length, 0, 'không được kêu oan: ' + JSON.stringify(cb));
  });
}

// ==================================================================== 4. KHÔNG GHI LÙI, KHÔNG GHI TRƯỚC

console.log('--- Chốt tháng: không ghi lùi, không ghi trước, trừ lượt chạy tay --thang (D-21b) ---');
{
  test('T-DT-16 sang tháng 10 mà gói ghi cho tháng 9 → TỪ CHỐI ghi lùi', () => {
    const g = nap({ thangGiaLap: '2026-10' });
    const kq = goi(g, { hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09', lenh: [] });
    bang(kq.ok, false);
    dung(/Từ chối ghi lùi/.test(kq.thongBao), kq.thongBao);
    bang(g.__moiTruong.thaoTac.length, 0, 'không được ghi gì');
  });

  test('T-DT-17 gói ghi cho tháng TƯƠNG LAI → TỪ CHỐI, và nhắc kiểm đồng hồ máy', () => {
    const g = nap({ thangGiaLap: '2026-09' });
    const kq = goi(g, { hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-10', spreadsheetId: ID_T10, lenh: [] });
    bang(kq.ok, false);
    dung(/Từ chối ghi trước/.test(kq.thongBao), kq.thongBao);
    dung(/đồng hồ/.test(kq.thongBao), 'phải nhắc kiểm đồng hồ: ' + kq.thongBao);
  });

  test('T-DT-18 lượt chạy tay `choPhepThangKhac` → cho ghi tháng khác, nhưng hàng rào tên file VẪN áp', () => {
    // D-21b: mỗi tháng một lần user xuất file tab "Tất cả" của tháng trước để rà đơn sót. Lượt đó cố ý
    // ghi vào tháng cũ. Nới đúng một cửa (chốt tháng), KHÔNG nới cửa còn lại — nếu không thì lượt rà soát
    // trở thành đường vòng để ghi bừa vào bất cứ file nào.
    const g = nap({ thangGiaLap: '2026-10' });
    const ok = goi(g, {
      hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09', choPhepThangKhac: true,
      spreadsheetId: ID_T9, lenh: []
    });
    dung(ok.ok, 'lượt chạy tay phải được cho phép: ' + JSON.stringify(ok).slice(0, 140));

    const sai = goi(g, {
      hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09', choPhepThangKhac: true,
      spreadsheetId: ID_T10, lenh: []
    });
    bang(sai.loi, 'SAI_THANG_FILE', 'chạy tay vẫn không được ghi vào file tháng khác');
  });
}

// ==================================================================== 5. ĐỐI CHIẾU PHIÊN BẢN

console.log('--- Đối chiếu phiên bản Web App (mục 2.3) ---');
{
  const g = nap();
  test('T-DT-19 ping trả phiên bản thật + dấu vân tay bản dựng, KHÔNG mở file nào', () => {
    const truoc = g.__moiTruong.vungDoc.length;
    const kq = goi(g, { hanhDong: 'ping' });
    dung(kq.ok, 'ping phải chạy');
    bang(kq.phienBan, g.PHIEN_BAN);
    dung(!!kq.banDung, 'ping phải trả dấu vân tay bản dựng');
    bang(g.__moiTruong.vungDoc.length, truoc, 'ping không được đọc một ô nào của file tháng');
  });
  test('T-DT-20 phản hồi ĐÃ QUA CỬA đều kèm phienBan và banDung, kể cả phản hồi lỗi', () => {
    const la = goi(g, { hanhDong: 'linh tinh' });
    bang(la.phienBan, g.PHIEN_BAN);
    dung(!!la.banDung, 'phản hồi lỗi đã qua cửa cũng phải mang banDung');
  });

  test('T-DT-20b C-6.1: hai nhánh CHƯA QUA CỬA không lộ phienBan lẫn banDung', () => {
    // Người gõ bừa vào link `Anyone` chỉ được biết đúng một chữ "sai". Biết số phiên bản là tra ra được
    // kho mã công khai rồi đọc luôn hợp đồng gói JSON — trước 13/9 `phienBan` vẫn lọt ở đây.
    const sai = JSON.parse(g.doPost({ postData: { contents: JSON.stringify({ hanhDong: 'ping', token: 'SAI' }) } })._text);
    bang(sai.loi, 'SAI_BI_MAT');
    bang(sai.phienBan, undefined, 'nhánh sai chuỗi KHÔNG được mang phienBan');
    bang(sai.banDung, undefined, 'nhánh sai chuỗi KHÔNG được mang banDung');

    const chua = nap({ khongCaiDat: true });
    const kq = JSON.parse(chua.doPost({ postData: { contents: JSON.stringify({ hanhDong: 'ping', token: 'X' }) } })._text);
    bang(kq.loi, 'CHUA_CAI_DAT');
    bang(kq.phienBan, undefined, 'nhánh chưa cài đặt KHÔNG được mang phienBan');
    bang(kq.banDung, undefined, 'nhánh chưa cài đặt KHÔNG được mang banDung');
    dung(/caiDat/.test(kq.thongBao), 'phải chỉ đúng việc phải làm: ' + kq.thongBao);
  });

  test('T-DT-20c C-6.2: so chuỗi bằng SHA-256 — lệch ĐÚNG MỘT ký tự phải bị từ chối', () => {
    bang(g.bam256_('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      'SHA-256 phải đúng vectơ chuẩn — sai ở đây là cả cửa bí mật so nhầm');
    dung(g.biMatDung_(BI_MAT), 'chuỗi đúng phải qua');
    [BI_MAT + 'x', BI_MAT.slice(0, -1), BI_MAT.slice(0, -1) + 'X', '', null, BI_MAT.toLowerCase()]
      .forEach((x) => dung(!g.biMatDung_(x), 'phải từ chối: ' + JSON.stringify(x)));
  });
  test('T-DT-21 lệch phiên bản → TỪ CHỐI GHI, đúng nguyên văn thông báo, chưa vào tới khóa', () => {
    const kq = goi(g, { hanhDong: 'ghi', phienBanMongDoi: '9.9.9', thang: '2026-09', lenh: [] });
    bang(kq.ok, false);
    bang(kq.loi, 'LECH_PHIEN_BAN');
    bang(kq.thongBao, 'Web App đang chạy bản ' + g.PHIEN_BAN + ', tool cần bản 9.9.9 — ' +
      'hãy triển khai lại (Deploy → Manage deployments → New version).');
    bang(g.__moiTruong.moKhoa, 0, 'không được vào tới LockService');
  });
  test('T-DT-22 lệch bản vẫn cho ping và doc chạy — người ta phải xem được số lệch', () => {
    dung(goi(g, { hanhDong: 'ping', phienBanMongDoi: '9.9.9' }).ok, 'ping phải chạy');
    dung(goi(g, { hanhDong: 'doc', thang: '2026-09', phienBanMongDoi: '9.9.9' }).ok, 'doc phải chạy');
  });
  test('T-DT-23 hai vỏ nói CÙNG MỘT CÂU (Node ↔ Apps Script)', () => {
    bang(thongBaoLechPhienBan('1.0.0', '2.0.0'), g.thongBaoLechPhienBan_('1.0.0', '2.0.0'));
    bang(PHIEN_BAN, g.PHIEN_BAN, 'PHIEN_BAN hai bên phải bằng nhau — lệch là tool tự chặn chính mình');
  });
  test('T-DT-24 phía máy tính: Web App bản cũ (không trả phienBan) cũng bị chặn', () => {
    bang(nemLoi(() => kiemPhienBan(undefined, '2.3.0')).message,
      'Web App đang chạy bản (không rõ — bản cũ chưa trả phienBan), tool cần bản 2.3.0 — ' +
      'hãy triển khai lại (Deploy → Manage deployments → New version).');
    bang(kiemPhienBan('2.3.0', '2.3.0'), true);
  });
}

// ==================================================================== 6. GHI: định dạng & chống trùng

console.log('--- Ghi: định dạng trước, chống trùng hai tầng ---');
{
  const g = nap({ thangGiaLap: '2026-09' });
  const mt = g.__moiTruong;
  const kq = goi(g, {
    hanhDong: 'ghi', phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09',
    lenh: [{
      tenSheet: 'Shopee mall', don: [
        { maDon: 'TEST0802HHHH08', ngay: '2026-09-05', tien: { H: 1, I: 0, J: 0, K: 0 }, dong: [{ tenVietTat: 'kn180', soLuong: 1 }] },
        { maDon: '0012345678901234', ngay: '2026-09-06', tien: { H: 200, I: 0, J: 5, K: 3 }, dong: [{ tenVietTat: 'hd180', soLuong: 2 }] },
        { maDon: '0012345678901234', ngay: '2026-09-06', tien: { H: 200, I: 0, J: 5, K: 3 }, dong: [{ tenVietTat: 'hd180', soLuong: 2 }] },
        {
          maDon: '260906ABCDEFGHI', ngay: '2026-09-06', tien: { H: 300, I: 0, J: 7, K: 4 },
          dong: [{ tenVietTat: 'dha180', soLuong: 1 }, { tenVietTat: 'ymkd180', soLuong: 3, vang: true, note: 'chưa nhận ra mã' }]
        }
      ]
    }]
  });

  test('T-DT-25 setNumberFormat("@") chạy TRƯỚC setValues cho cột mã đơn', () => {
    dung(kq.ok, 'lệnh ghi phải chạy: ' + JSON.stringify(kq).slice(0, 200));
    const cotMa = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.c === 3 && x.r === 5);
    dung(cotMa.length >= 2, 'không thấy thao tác trên cột mã đơn');
    bang(cotMa[0].viec, 'setNumberFormat:@', 'ép văn bản phải đi trước — đặt sau thì Sheets đã đổi kiểu mất rồi');
    bang(cotMa[1].viec, 'setValues');
  });
  test('T-DT-26 mã đơn toàn chữ số giữ nguyên số 0 đầu (mất là ghi trùng ở lần chạy sau)', () => {
    const sh = mt.cacFile[ID_T9].sheets['Shopee mall'];
    bang(sh._o[5][3].v, '0012345678901234');
    bang(sh._o[5][3].nf, '@');
  });
  test('T-DT-27 cột ngày cũng đặt định dạng trước, nhưng KHÔNG ép "@" (giữ Date cho công thức)', () => {
    const cotNgay = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.c === 1 && x.r === 5);
    bang(cotNgay[0].viec, 'setNumberFormat:d/m/yyyy');
    bang(cotNgay[1].viec, 'setValues');
    const sh = mt.cacFile[ID_T9].sheets['Shopee mall'];
    dung(sh._o[5][1].v instanceof Date, 'ngày phải là Date thật, ép "@" là hỏng sheet Lợi nhuận');
  });
  test('T-DT-28 cột tiền cũng đặt định dạng trước setValues', () => {
    [8, 9, 10, 11].forEach((c) => {
      const t = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.c === c && x.r === 5);
      bang(t[0].viec, 'setNumberFormat:#,##0', 'cột ' + c);
      bang(t[1].viec, 'setValues', 'cột ' + c);
    });
  });
  test('T-DT-29 khử trùng TẦNG 2 trong LockService: đơn đã có ở dòng 4 bị bỏ qua', () => {
    bang(kq.thongKe.donDaCo, 2, 'một đơn đã có sẵn + một đơn trùng ngay trong gói');
    bang(kq.thongKe.donGhi, 2);
    bang(kq.thongKe.dongGhi, 3, '1 dòng + 1 đơn hai dòng');
    bang(kq.thongKe.donGopO, 1, 'đơn nhiều mặt hàng phải được gộp ô');
    bang(mt.moKhoa, 0, 'khóa phải được trả lại');
  });
  test('T-DT-30 chỉ NỐI dưới dòng cuối, không đụng dòng cũ và dòng tổng', () => {
    const sh = mt.cacFile[ID_T9].sheets['Shopee mall'];
    bang(sh._o[4][3].v, 'TEST0802HHHH08', 'dòng cũ phải y nguyên');
    bang(sh._o[3][8].v, 0, 'dòng tổng (dòng 3) bất khả xâm phạm — INV-8');
    mt.thaoTac.filter((x) => x.sheet === 'Shopee mall').forEach((x) => {
      const dauThoiGian = x.r === 1 && x.c >= 16;   // dấu "Tool cập nhật lúc …", ngoài vùng số liệu
      dung(x.r >= 4 || (x.r === 2 && x.viec === 'setValue') || dauThoiGian,
        'ghi vào dòng ' + x.r + ' cột ' + x.c + ' — chỉ được nối từ dòng 5');
    });
  });
  test('T-DT-31 dấu thời gian PHẢI thật sự được đóng ở dòng 1, không bị try/catch nuốt im', () => {
    const sh = mt.cacFile[ID_T9].sheets['Shopee mall'];
    const dau = mt.thaoTac.filter((x) => x.sheet === 'Shopee mall' && x.r === 1 && x.viec === 'setValues');
    bang(dau.length, 1, 'phải có đúng một lệnh ghi dấu thời gian');
    bang(dau[0].c, 16, 'ô gộp A1:N1 chiếm tới N, dấu phải rơi vào P1');
    dung(/^Tool cập nhật lúc \d{1,2}h\d{2} ngày \d{1,2}\/\d{1,2}\/20\d{2}$/.test(String(sh._o[1][16].v)),
      'nội dung dấu sai: ' + JSON.stringify(sh._o[1][16].v));
  });
  test('T-DT-32 INV-3: không thao tác ghi nào chạm cột E, F, M, N', () => {
    mt.thaoTac.filter((x) => x.sheet === 'Shopee mall').forEach((x) => {
      if (x.viec === 'setBackgrounds' || x.viec === 'setBackground') return;   // tô vàng cả dòng được phép
      for (let c = x.c; c < x.c + x.nc; c++) {
        dung([5, 6, 13, 14].indexOf(c) < 0, 'ghi vào cột ' + c + ' (E/F/M/N là công thức của chủ shop)');
      }
    });
  });
  test('T-DT-33 D-47: sau lượt ghi, tab Mapping được tô lại — dòng CÓ trắng, dòng chưa CÓ vàng', () => {
    const sh = mt.cacFile[ID_T9].sheets['Mapping_san_pham'];
    bang(kq.thongKe.mappingToLai, 2, 'phải tô lại đủ 2 dòng dữ liệu');
    bang(sh._o[2][1].bg, null, 'dòng đã ghi CÓ phải bỏ nền');
    bang(sh._o[3][1].bg, '#FFF2CC', 'dòng chưa CÓ phải vàng');
    bang(sh._o[1][1].bg, '#ffffff', 'dòng tiêu đề không được đụng');
  });
}

// ==================================================================== 7. HÀNG RÀO CỘT CẤM GHI (tầng 2)

console.log('--- Hàng rào tầng 2: cấu hình trỏ nhầm vào cột công thức ---');
{
  // HAI TẦNG, ĐỪNG LẪN:
  //   · TẦNG 1 — `Config.tao`: so `cot_cong_thuc` với danh sách cột tool ghi, câu lỗi "Cột công thức M
  //     trùng cột tool ghi giá trị". Nổ SỚM, trước khi chạm vỏ ghi.
  //   · TẦNG 2 — `kiemCotDuocGhi_` ở đầu `ghiMotSheet_`, câu lỗi mở đầu "TỪ CHỐI GHI:". Cửa duy nhất mọi
  //     chỉ số cột phải đi qua.
  // Thêm `cot_cong_thuc: 'L'` là để TẮT tầng 1, ép bài đi tới tầng 2 — vì thế phép chấm dưới đây đòi
  // ĐÚNG chữ ký của tầng 2, không nhận câu của tầng 1.
  //
  // Ba khóa `cot_doanh_thu`, `cot_note`, `cot_nguon_don` KHÔNG có tầng 1 che: `Config.gs` cố ý loại
  // `cot_doanh_thu` khỏi phép so trùng, `cot_note` không nằm trong KEYIN_COT, còn `cot_nguon_don` thì
  // trước 12/9 lọt hẳn khỏi danh sách cửa vì danh sách đó gõ tay 9 khóa trong khi KEYIN_COT có 10.
  const CA = [
    ['T-DT-34  keyin.cot_thue trỏ vào M (tầng 1 đã tắt bằng cot_cong_thuc=L)',
      { cot_thue: 'M', cot_cong_thuc: 'L' }, 'keyin.cot_thue'],
    ['T-DT-35  keyin.cot_doanh_thu trỏ vào M — Config cố ý KHÔNG kiểm khóa này, tầng 2 là cửa duy nhất',
      { cot_doanh_thu: 'M', cot_cong_thuc: 'L' }, 'keyin.cot_doanh_thu'],
    ['T-DT-36  keyin.cot_note trỏ vào M — không nằm trong KEYIN_COT, tầng 2 là cửa duy nhất',
      { cot_note: 'M', cot_cong_thuc: 'L' }, 'keyin.cot_note'],
    ['T-DT-37  keyin.cot_nguon_don trỏ vào N — khóa TỪNG LỌT CỬA trước 12/9 (C-6.3)',
      { cot_nguon_don: 'N', cot_cong_thuc: 'L' }, 'keyin.cot_nguon_don'],
    // YC-40.5(e): cùng khóa đó trỏ vào M. Nằm trong CA nên đối chứng âm T-DT-38 tự phủ luôn ca này.
    ['T-DT-37b keyin.cot_nguon_don trỏ vào M — cùng khóa, cột Mã hàng (YC-33 điểm 5)',
      { cot_nguon_don: 'M', cot_cong_thuc: 'L' }, 'keyin.cot_nguon_don']
  ];

  /**
   * Chấm một ca. Trả DANH SÁCH LÝ DO TRƯỢT (rỗng = đạt) thay vì ném lỗi, để đối chứng âm T-DT-38 gọi lại
   * đúng phép chấm này trên bản đã gỡ hàng rào và chứng minh nó báo TRƯỢT.
   */
  function cham(keyin, khoaMongDoi, cot, tuyChonNap) {
    const g2 = nap(Object.assign({ thangGiaLap: '2026-09' }, tuyChonNap || {}));
    const r = goi(g2, {
      hanhDong: 'ghi', phienBanMongDoi: g2.PHIEN_BAN, thang: '2026-09',
      cauHinh: { keyin: keyin },
      lenh: [{ tenSheet: 'Shopee mall', don: [{ maDon: 'MOI001', ngay: '2026-09-06', tien: {}, dong: [{}] }] }]
    });
    const sh = g2.__moiTruong.cacFile[ID_T9].sheets['Shopee mall'];
    const tb = String(r.thongBao || '');
    const truot = [];
    if (r.ok) truot.push('lệnh ghi được CHẤP NHẬN: ' + JSON.stringify(r).slice(0, 160));
    if (tb.indexOf('TỪ CHỐI GHI:') < 0) truot.push('không phải câu của tầng 2 (kiemCotDuocGhi_): ' + tb.slice(0, 160));
    if (tb.indexOf(khoaMongDoi) < 0) truot.push('câu lỗi không nêu tên khóa cấu hình sai (' + khoaMongDoi + '): ' + tb.slice(0, 160));
    if (sh._o[5][3].v !== '') truot.push('từ chối rồi mà DÒNG MỚI vẫn được ghi: C5 = ' + JSON.stringify(sh._o[5][3].v));
    if (sh._o[5][cot].v !== '' || sh._o[5][cot].f) truot.push('CỘT CẤM ĐÃ BỊ ĐỤNG ở dòng 5');
    g2.__moiTruong.thaoTac.filter((x) => x.sheet === 'Shopee mall').forEach((x) => {
      if (x.viec === 'setBackgrounds' || x.viec === 'setBackground') return;
      for (let c = x.c; c < x.c + x.nc; c++) if ([5, 6, 13, 14].indexOf(c) >= 0) truot.push('thao tác ' + x.viec + ' chạm cột ' + c);
    });
    return truot;
  }

  CA.forEach((ca) => {
    const cot = ca[1].cot_nguon_don === 'N' ? 14 : 13;
    test(ca[0] + ' → NÉM LỖI ở tầng ghi, không ô nào bị đụng', () => {
      const truot = cham(ca[1], ca[2], cot);
      bang(truot.length, 0, 'hàng rào tầng 2 không chặn — ' + truot.join(' | '));
    });
  });

  test('T-DT-38 ĐỐI CHỨNG ÂM: gỡ hàng rào tầng 2 khỏi kiemCotDuocGhi_ → cả bốn ca PHẢI TRƯỢT', () => {
    const conSot = [];
    CA.forEach((ca) => {
      const cot = ca[1].cot_nguon_don === 'N' ? 14 : 13;
      const truot = cham(ca[1], ca[2], cot, { goHangRaoTang2: true });
      if (!truot.length) conSot.push(ca[0] + ' vẫn ĐẠT dù hàng rào đã bị gỡ');
      else console.log('        · ' + ca[2] + ' → TRƯỢT đúng như phải: ' + truot[0].slice(0, 110));
    });
    bang(conSot.length, 0, 'phép chấm MÙ (bệnh TM-10: luôn luôn ĐẠT) — ' + conSot.join(' | '));
  });

  test('T-DT-39 danh sách cửa dựng TỪ Config.KEYIN_COT, không gõ tay (C-6.3)', () => {
    // Sửa ở gốc: gõ tay thì mọi khóa cột thêm sau này lại tự động lọt, và không ai biết cho tới lúc một
    // lượt ghi đè lên cột công thức của chủ shop. T-DT-37 ở trên là bằng chứng bằng hành vi; bài này canh
    // chính cái nguồn, để người sửa mã sau không lặng lẽ quay về danh sách gõ tay.
    const ma = fs.readFileSync(FILE_SHELL, 'utf8');
    dung(/Config\.KEYIN_COT\.forEach\(function \(t\) \{\s*\n\s*kiemCotDuocGhi_\(k\[t\], 'keyin\.' \+ t\);/.test(ma),
      'ghiMotSheet_ phải duyệt Config.KEYIN_COT để dựng danh sách cửa');
    const g3 = nap();
    dung(g3.Config.KEYIN_COT.indexOf('cot_nguon_don') >= 0, 'KEYIN_COT phải có cot_nguon_don');
    bang(g3.Config.KEYIN_COT.length, 10, 'KEYIN_COT phải đủ 10 khóa');
  });
}

// ==================================================================== 7b. YC-40.4

console.log('--- YC-40.4: tháng theo giờ Việt Nam · caiDat gỡ thuộc tính mỏ neo cũ ---');
{
  const { spawnSync } = require('child_process');
  const THOI_DIEM_BIEN = '2026-09-30T18:30:00Z';     // = 01:30 sáng 01/10/2026 giờ Việt Nam

  /** Chạy một đoạn JS trong tiến trình Node RIÊNG đặt múi giờ máy là UTC. */
  function chayTrongMayUTC(ma) {
    const r = spawnSync(process.execPath, ['-e', ma], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', env: Object.assign({}, process.env, { TZ: 'UTC' })
    });
    if (r.status !== 0) throw new Error('tiến trình con hỏng: ' + (r.stderr || r.stdout));
    return String(r.stdout).trim();
  }

  test('T-DT-44 máy đặt múi giờ UTC, 01:30 sáng ngày 1 giờ VN → vẫn ra THÁNG MỚI (không ghi lùi)', () => {
    const ra = chayTrongMayUTC(
      "const G=require('./node/chay-google-sheet');const W=require('./node/gsheet-web-app');" +
      "const t=new Date('" + THOI_DIEM_BIEN + "');" +
      "console.log([new Date().getTimezoneOffset(), G.thangCua(t), G.ngayCua(t), W.thangHienTaiMay(t)].join('|'))");
    const [lech, thang, ngay, thang2] = ra.split('|');
    bang(lech, '0', 'tiến trình con phải thật sự chạy ở múi giờ UTC, nếu không bài này không chứng minh gì');
    bang(thang, '2026-10', 'thangCua');
    bang(ngay, '2026-10-01', 'ngayCua');
    bang(thang2, '2026-10', 'thangHienTaiMay');

    // ĐỐI CHỨNG ÂM: cách tính cũ theo giờ máy, cùng thời điểm, cùng máy UTC → phải ra tháng CŨ.
    const cu = chayTrongMayUTC("const d=new Date('" + THOI_DIEM_BIEN + "');" +
      "console.log(d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2))");
    bang(cu, '2026-09', 'đối chứng âm: cách tính theo giờ máy phải ra tháng cũ trên máy UTC');
    return 'máy UTC lúc ' + THOI_DIEM_BIEN + ': tool ra 2026-10 · cách cũ ra ' + cu + ' (đúng cái lỗi YC-40.4)';
  });

  test('T-DT-45 caiDat() GỠ HẲN Script Property mỏ neo cũ KEODON_MO_NEO_ID (không chỉ báo)', () => {
    const gl = require('./gia-lap-web-app');
    const sim = gl.taoGiaLap({});
    sim.thuocTinh['KEODON_MO_NEO_ID'] = 'ID_MO_NEO_CU_GIA_LAP_0001';
    const tin = sim.vo.caiDat();
    const conSot = 'KEODON_MO_NEO_ID' in sim.thuocTinh;
    sim.thaoGo();
    bang(conSot, false, 'thuộc tính mỏ neo cũ phải bị gỡ');
    dung(/Đã gỡ thuộc tính cũ KEODON_MO_NEO_ID/.test(tin), 'phải nói đã gỡ: ' + tin);
    dung(tin.indexOf('ID_MO_NEO_CU_GIA_LAP_0001') < 0, 'câu tình trạng không được in giá trị ID');

    // ĐỐI CHỨNG ÂM: bỏ lệnh gỡ khỏi mã → thuộc tính còn nguyên, phép chấm phải thấy.
    const CU = 'p.deleteProperty(TT_MO_NEO_CU);';
    const sim2 = gl.taoGiaLap({ suaNguon: (src) => {
      if (src.split(CU).length !== 2) throw new Error('ĐỐI CHỨNG ÂM HỎNG: không tìm thấy đúng 1 lệnh gỡ');
      return src.split(CU).join('');
    } });
    sim2.thuocTinh['KEODON_MO_NEO_ID'] = 'ID_MO_NEO_CU_GIA_LAP_0001';
    sim2.vo.caiDat();
    const conSot2 = 'KEODON_MO_NEO_ID' in sim2.thuocTinh;
    sim2.thaoGo();
    bang(conSot2, true, 'đối chứng âm: bản không gỡ phải để thuộc tính còn nguyên');
    return 'gỡ xong, câu tình trạng không lộ ID · đối chứng âm: bỏ lệnh gỡ → thuộc tính còn nguyên';
  });
}

// ==================================================================== 8. QUÉT RÒ RỈ LẦN CUỐI

console.log('--- Quét rò rỉ toàn cục (INV-7) ---');
{
  test('T-DT-40 không đầu ra nào của Web App mang ID file tháng hay CHUỖI BÍ MẬT', () => {
    const g = nap({ thangGiaLap: '2026-09' });
    const thu = [];
    ['ping', 'doc', 'ghi', 'la'].forEach((hd) => {
      thu.push(JSON.stringify(goi(g, { hanhDong: hd, phienBanMongDoi: g.PHIEN_BAN, thang: '2026-09', lenh: [] })));
    });
    try { thu.push(g.thuMoFileThang(link(ID_T9), '2026-09')); } catch (e) { thu.push(e.message); }
    thu.push(g.caiDat());              // câu tình trạng: cố ý không chứa giá trị chuỗi
    const tatCa = thu.concat(g.__moiTruong.daIn).join('\n');
    dung(tatCa.indexOf(ID_T9) < 0, 'LỘ ID FILE trong đầu ra');
    dung(tatCa.indexOf(ID_T10) < 0, 'LỘ ID FILE trong đầu ra');
    dung(tatCa.indexOf(BI_MAT) < 0, 'LỘ CHUỖI BÍ MẬT trong đầu ra');
  });

  test('T-DT-41 thuMoFileThang chạy tay: in TÊN file và kết luận khớp tháng, không in ID', () => {
    const g = nap({ thangGiaLap: '2026-09' });
    const tin = g.thuMoFileThang(link(ID_T9), '2026-09');
    dung(tin.indexOf(TEN_T9) > 0, 'phải in tên file: ' + tin);
    dung(/tên file khớp tháng/.test(tin), 'phải kết luận khớp tháng: ' + tin);
    dung(tin.indexOf(ID_T9) < 0, 'không được in ID: ' + tin);
  });
}

// ====================================================================

console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
if (soHong) { hong.forEach((h) => console.log('  HỎNG: ' + h)); process.exit(1); }
