/**
 * gsheet-web-app.js — PHÍA MÁY TÍNH của lớp ghi Google Sheet (GV-v2.2 mục 1.7, phương án C).
 *
 * Máy tính tính xong thì POST một gói JSON tới Web App Apps Script (`src/ShellAppsScript.gs`).
 * Web App chạy bằng quyền của chủ dự án nên mở được file Sheet của mọi tháng, máy này không cần
 * đăng nhập Google, không giữ khóa dịch vụ, không cần quyền chia sẻ.
 *
 * Bốn hành động: `ping` (thử cửa) · `doc` (lấy mã đơn đã có + Mapping + tồn kho) · `ghi` (nối dòng) ·
 * `xuLy` (gửi thẳng bảng dòng đã qua lớp 1, Web App tự làm lớp 2 + lớp 3 + ghi trong một lần gọi).
 *
 * `xuLy` là đường mặc định từ bản 2.4.0. `doc` + `ghi` GIỮ NGUYÊN làm đường lùi (khóa `duong` trong
 * `CAU_HINH_VAN_HANH.json` → `google_sheet.duong = "ghi"`), vì đó là đường đã nghiệm thu.
 *
 * DỮ LIỆU NGƯỜI MUA (INV-4): gói `xuLy` mang dòng thô của file xuất đi qua mạng, nên trước khi gửi
 * `kiemPII()` soát lại toàn bộ gói — tên trường và giá trị. Có mùi PII là NÉM LỖI, không gửi.
 *
 * CHUỖI BÍ MẬT VẪN CÒN (D-43 sửa 13/9/2026): mỗi gói POST mang `token` = `google_sheet.chuoi_bi_mat`.
 * Điều đổi ngày 13/9 là user KHÔNG phải điền tay nữa — gói giao user đã có sẵn chuỗi trong
 * `CAU_HINH_VAN_HANH.json`. Link Web App để `Anyone` nên chuỗi này là thứ duy nhất ngăn người dò trúng
 * link ghi thẳng vào sổ tiền. INV-7: KHÔNG in chuỗi bí mật, link Web App, link file tháng hay ID file ra
 * màn hình / nhật ký — `chePhu()` che cả bốn thứ đó trong mọi câu lỗi trước khi in.
 *
 * FILE THÁNG DO MÁY CHỈ ĐỊNH (D-42): `idFileThang(link_thang, thang)` tra link của tháng rồi rút ID, và
 * `_goi()` gắn `spreadsheetId` vào mọi gói doc/ghi/xuLy. Không có link tháng đang chạy → dừng NGAY TRÊN
 * MÁY với câu chuẩn D-42, chưa gọi mạng, không ghi lùi vào tháng trước.
 *
 * LỖI QUYỀN NÓI TIẾNG NGƯỜI (D-46): 401/403, trang HTML hoặc trang đăng nhập thay vì JSON, và Web App báo
 * không mở / không ghi được file — cả ba gom về MỘT câu `cauLoiQuyen(thang)` rồi dừng; mã HTTP thật và
 * câu chi tiết của Apps Script đi ở dòng dưới, để người sửa còn manh mối.
 *
 * ĐỐI CHIẾU PHIÊN BẢN (GV-v2.3 mục 2.3): Google KHÔNG tự đồng bộ mã. Sửa `.gs` mà quên
 * Deploy → Manage deployments → New version thì link /exec vẫn chạy bản cũ, KHÔNG báo lỗi gì —
 * bên dự án chứng quyền gọi đây là "lỗi tốn kém nhất của dự án". Với keodon còn nặng hơn: bản `.gs`
 * cũ có thể ghi sai cột vào file tiền thật. Nên mỗi gói gửi lên kèm `phienBanMongDoi`, Web App trả
 * `phienBan` thật của nó, lệch là TỪ CHỐI GHI.
 */
const https = require('https');
const { URL } = require('url');

/** Phải khớp `var PHIEN_BAN` trong `src/ShellAppsScript.gs`. Đổi hợp đồng gói JSON thì đổi cả hai. */
const PHIEN_BAN = '2.6.0';

const TOI_DA_DON_MOT_LO = 200;      // Apps Script chỉ có 6 phút một lần chạy; chia lô cho chắc

/**
 * Lô của `xuLy` cũng 200 đơn — CỐ Ý bằng lô của `ghi`, không nhỏ hơn.
 *
 * `xuLy` làm nhiều việc hơn `ghi` (đọc Mapping + tồn kho, chạy lớp 2), nên thoạt nhìn nên chia nhỏ.
 * Nhưng lớp 2 chạy MỘT LẦN CHO MỖI LÔ, và một tên hàng mới gặp ở lô 1 sẽ được nối vào Mapping ngay;
 * sang lô 2 nó đọc lại Mapping và thấy dòng đó đã có (chưa ai điền) → chữ trong cột Note đổi từ
 * "tên hàng mới — đã thêm dòng vàng…" thành "chưa điền Tên viết tắt… (Mapping dòng N)". Cùng nghĩa,
 * cùng dòng vàng, nhưng KHÁC CHỮ. Chia lô càng nhỏ thì càng nhiều dòng rơi vào ca đó.
 * 200 đơn phủ trọn một lần chạy ngày thường (đo tháng 8: 471 đơn CẢ THÁNG), nên gần như luôn một lô.
 * Web App vẫn tự chặn ở 400 đơn một gói.
 */
const TOI_DA_DON_MOT_LO_XU_LY = 200;

/** Số lần gọi tiếp tối đa khi Web App dừng gọn vì hết giờ. Chặn vòng lặp vô tận nếu có gì đó kẹt. */
const SO_LAN_GOI_TIEP_TOI_DA = 12;

const TIMEOUT_MS = 180000;

/** 'yyyy-MM' theo giờ máy — chỉ dùng để điền vào câu lỗi khi gói không mang `thang` (ví dụ lượt ping). */
/**
 * Năm / tháng / ngày của một thời điểm THEO GIỜ VIỆT NAM, bất kể máy đặt múi giờ nào (YC-40.4).
 *
 * Vì sao phải ép: tháng quyết định ghi vào FILE THÁNG nào. Máy đặt múi giờ UTC (hay gặp ở máy mới cài lại
 * Windows) thì từ 0h đến 7h sáng ngày 1 giờ máy vẫn là ngày cuối tháng trước — đơn của tháng mới ghi lùi
 * vào sổ tháng cũ. Google chạy theo `Asia/Ho_Chi_Minh` nên còn tự chặn "ghi lùi" và làm tắc cả lượt.
 *
 * Việt Nam không đổi giờ mùa hè, nên cộng cố định 7 giờ là ĐÚNG, và không phụ thuộc bộ dữ liệu múi giờ
 * của bản Node xách tay (bản rút gọn có thể không có `Intl` đầy đủ).
 */
const LECH_GIO_VN_MS = 7 * 3600 * 1000;
function phanNgayVN(thoiDiem) {
  const d = new Date((thoiDiem ? new Date(thoiDiem) : new Date()).getTime() + LECH_GIO_VN_MS);
  return { nam: d.getUTCFullYear(), thang: d.getUTCMonth() + 1, ngay: d.getUTCDate() };
}
function haiSo(n) { return ('0' + n).slice(-2); }

function thangHienTaiMay(thoiDiem) {
  const x = phanNgayVN(thoiDiem);
  return x.nam + '-' + haiSo(x.thang);
}

/** Nguyên văn câu báo lệch phiên bản. Bản Apps Script (`thongBaoLechPhienBan_`) phải giống hệt từng chữ. */
function thongBaoLechPhienBan(banThuc, banCan) {
  return 'Web App đang chạy bản ' + banThuc + ', tool cần bản ' + banCan +
    ' — hãy triển khai lại (Deploy → Manage deployments → New version).';
}

/**
 * So DẤU VÂN TAY BẢN DỰNG của Web App với `src/` trên máy này. Trả danh sách câu cảnh báo
 * (rỗng = khớp). **Cảnh báo thôi, không chặn** — theo đúng chốt của BA, để không tắc buổi chạy thử.
 *
 * VÌ SAO KHÔNG DỰA VÀO `phienBan`. `PHIEN_BAN` chỉ đổi khi lên phiên bản mới, nên hai bản dựng
 * cùng số phiên bản trông giống hệt nhau. Dán sót một file hay dán nhầm bản cũ thì tool chạy êm
 * và sai lặng lẽ — đã xảy ra đúng một lần: cột E/F/N trống trên Google mà nhật ký không một câu
 * cảnh báo, và không ai phân biệt được "mã đúng, công thức trả rỗng" với "bản trên Google cũ hơn".
 *
 * Bọc try: máy không đọc được `src/` (ví dụ bản đóng gói cấu trúc khác) thì mất phép so này chứ
 * không được làm hỏng lượt chạy — nó là phép phụ, không phải cửa chặn.
 */
function soDauVanTay(pingKq) {
  const ra = [];
  if (!pingKq || typeof pingKq !== 'object') return ra;
  // C-6.1: phản hồi SAI_BI_MAT / CHUA_CAI_DAT cố ý KHÔNG mang `banDung` lẫn `phienBan`. Không loại trừ ở
  // đây thì mọi lượt sai chuỗi lại kèm thêm câu "bản trên Google là bản cũ" — sai hẳn nguyên nhân, và
  // người ta sẽ đi Deploy lại trong khi việc phải làm là dùng đúng gói được giao.
  if (pingKq.loi === 'SAI_BI_MAT' || pingKq.loi === 'CHUA_CAI_DAT') return ra;

  const hl = pingKq.hamLoi;
  if (hl && Array.isArray(hl.thieu) && hl.thieu.length) {
    ra.push('Bản Apps Script trên Google CŨ HƠN bản trên máy: thiếu ' + hl.thieu.length +
      ' hàm lõi (' + hl.thieu.join(', ') + '). Mở Apps Script, dán lại 11 file trong src/ rồi Deploy lại.');
  }
  if (hl && Array.isArray(hl.camMaVanCo) && hl.camMaVanCo.length) {
    ra.push('Bản trên Google còn hàm ĐÃ BỎ: ' + hl.camMaVanCo.join(', ') +
      '. Đó là bản cũ, và cái bẫy hàm đó gây ra vẫn đang giăng. Dán lại 11 file rồi Deploy lại.');
  }

  let van;
  try { van = require('./dau-van-tay').tinh(); }
  catch (e) { return ra; }

  if (pingKq.banDung == null) {
    ra.push('Bản Apps Script trên Google chưa có dấu vân tay bản dựng (bản cũ). ' +
      'Máy đang chạy bản dựng ' + van.tong + '. Dán lại 11 file trong src/ rồi Deploy lại.');
    return ra;
  }
  if (String(pingKq.banDung) === van.tong) return ra;

  const tuXa = (pingKq.vanTay && typeof pingKq.vanTay === 'object') ? pingKq.vanTay : {};
  const lech = Object.keys(van.tungFile).filter((t) => String(tuXa[t] == null ? '' : tuXa[t]) !== van.tungFile[t]);
  ra.push('Bản Apps Script trên Google KHÁC bản trên máy — Google: ' + pingKq.banDung +
    ' · máy: ' + van.tong +
    (lech.length ? ('. Lệch ở ' + lech.length + ' file: ' + lech.join(', ')) : '.') +
    ' Mở Apps Script, dán lại đúng ' + (lech.length ? 'các file đó' : '11 file trong src/') + ' rồi Deploy lại.');
  return ra;
}

/**
 * Cổng chặn ghi — HÀM THUẦN, kiểm được không cần mạng.
 * `banThuc` rỗng/không có nghĩa là Web App đang chạy bản CŨ, bản chưa biết trả `phienBan` về.
 * Đó chính là ca nguy hiểm nhất (hỏng âm thầm) nên cũng phải chặn, không được coi là "chắc là ok".
 */
function kiemPhienBan(banThuc, banCan) {
  const can = banCan || PHIEN_BAN;
  const thuc = String(banThuc == null ? '' : banThuc).trim();
  if (thuc === can) return true;
  throw new Error(thongBaoLechPhienBan(thuc || '(không rõ — bản cũ chưa trả phienBan)', can));
}

// ==================================================================== LINK THÁNG TRÊN MÁY (D-42)

/** Câu chuẩn D-42 (02_GIAO_VIEC_DEV.md YC-31 điểm 2) khi cấu hình chưa có link của tháng đang chạy. */
function cauThieuLinkThang(thang) {
  return 'CHƯA CÓ LINK FILE THÁNG ' + thang + ' trong CAU_HINH_VAN_HANH.json — bấm 3_TAO_FILE_THANG_MOI.bat ' +
    'để khai báo (chế độ 2) hoặc chuyển sổ (chế độ 1). Tool không ghi gì.';
}

const RE_LINK_SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/;

/**
 * Tra link file tháng trong `link_thang` (object "yyyy-MM" → link) — HÀM THUẦN, không chạm mạng.
 * `trim()` vì user dán link hay dính khoảng trắng đầu/cuối (chủ dự án nêu 12/9).
 * @returns {{id:string, link:string}}
 * @throws {Error} có `maKeodon`: `CHUA_CO_LINK_THANG` (không có khóa, hoặc khóa rỗng) ·
 *                 `LINK_THANG_HONG` (có khóa nhưng không phải link Google Sheet)
 */
function idFileThang(linkThang, thang) {
  const th = String(thang == null ? '' : thang).trim();
  const bang = (linkThang && typeof linkThang === 'object') ? linkThang : {};
  const tho = Object.prototype.hasOwnProperty.call(bang, th) ? bang[th] : '';
  const link = String(tho == null ? '' : tho).trim();
  if (!link) {
    const e = new Error(cauThieuLinkThang(th));
    e.maKeodon = 'CHUA_CO_LINK_THANG';
    throw e;
  }
  const m = link.match(RE_LINK_SHEET);
  if (!m) {
    // INV-7: KHÔNG in lại giá trị đang có trong ô — nó có thể là một link thật của tháng khác.
    const e = new Error('link_thang["' + th + '"] trong CAU_HINH_VAN_HANH.json không phải link Google Sheet ' +
      '(phải bắt đầu bằng https://docs.google.com/spreadsheets/d/<ID>). Sửa dòng đó bằng Notepad, hoặc bấm ' +
      '3_TAO_FILE_THANG_MOI.bat chế độ 2, rồi chạy lại. Tool không ghi gì.');
    e.maKeodon = 'LINK_THANG_HONG';
    throw e;
  }
  return { id: m[1], link: link };
}

/** 'yyyy-MM' → tháng liền sau ('2026-12' → '2027-01'). Không đọc được → ''. */
function thangSau(thang) {
  const m = String(thang || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return '';
  let nam = Number(m[1]), th = Number(m[2]) + 1;
  if (th > 12) { th = 1; nam++; }
  return nam + '-' + ('0' + th).slice(-2);
}

/**
 * CẢNH BÁO SỚM — thay cho câu "Bảng link mới khai tới…" của bản 2.4.0 (bảng link nay nằm trên máy).
 * `link_thang` chưa có THÁNG SAU thì nhắc ngay hôm nay, vì đến ngày 1 tháng sau nút 4 sẽ dừng hẳn ở
 * `cauThieuLinkThang` — báo trước cả tháng thì còn kịp làm, báo đúng hôm đó là tắc cả buổi.
 * @returns {string|null}
 */
function canhBaoThangSau(linkThang, thang) {
  const sau = thangSau(thang);
  if (!sau) return null;
  const co = linkThang && typeof linkThang === 'object' && String(linkThang[sau] == null ? '' : linkThang[sau]).trim();
  if (co) return null;
  return 'link_thang chưa có tháng ' + sau + '. Trước ngày 1 tháng sau: tạo bản sao file tháng trên Google ' +
    '(File → Make a copy) rồi bấm 3_TAO_FILE_THANG_MOI.bat để khai link — không thì nút 4 sẽ dừng ngay ngày đầu tháng.';
}

// ==================================================================== LỖI QUYỀN NÓI TIẾNG NGƯỜI (D-46)

/**
 * Nguyên văn câu chuẩn D-46 — MỘT câu cho cả ba ca (401/403 · HTML đăng nhập · Web App không mở/ghi được
 * file). Ba ca đó có cùng một cách chữa, nên tách thành ba câu chỉ làm người đọc phải đoán xem mình
 * đang ở ca nào. Chi tiết kỹ thuật (mã HTTP, câu của Apps Script) đi ở dòng dưới, không trộn vào câu này.
 */
function cauLoiQuyen(thang) {
  return 'LỖI QUYỀN TRUY CẬP — kiểm tra: (1) Web App đã Deploy bản mới, Who has access = Anyone; ' +
    '(2) file Google Sheet tháng ' + thang + ' phải do tài khoản đã deploy Web App sở hữu hoặc được chia sẻ quyền Chỉnh sửa.';
}

function loiQuyen(thang, chiTiet, maHttp) {
  const e = new Error(cauLoiQuyen(thang) +
    (chiTiet ? '\n  Chi tiết' + (maHttp ? ' (HTTP ' + maHttp + ')' : '') + ': ' + chiTiet : ''));
  e.maKeodon = 'LOI_QUYEN';
  e.maHttp = maHttp || null;
  throw e;
}

/** Mã lỗi Web App trả về mà bản chất là quyền / đường vào file (xem `moBangTinh_`, `thuGhiDauTien_`). */
const MA_LOI_QUYEN_WEBAPP = ['KHONG_CO_QUYEN', 'KHONG_THAY_FILE', 'KHONG_MO_DUOC_FILE', 'CHI_CO_QUYEN_XEM'];

/** Dấu hiệu Google trả trang HTML / trang đăng nhập thay vì JSON. */
function laTrangHtml(buf) {
  return /<!doctype html|<html|accounts\.google\.com|ServiceLogin|Đăng nhập|Sign in/i.test(String(buf || '').slice(0, 2000));
}

// ==================================================================== CỔNG CHẶN PII (INV-4)

/**
 * Lược đồ dòng lớp 1 — chép đúng "hợp đồng với lớp 2" ghi ở đầu `src/adapters/AdapterFileXuat.gs`.
 * Đây là DANH SÁCH TRẮNG: gói `xuLy` chỉ được mang đúng chừng này trường. Danh sách đen (9 cột PII)
 * vẫn giữ ở dưới, nhưng một mình nó không đủ — Shopee thêm cột mới tên khác là lọt.
 */
const TRUONG_DONG_LOP_1 = [
  'san', 'maGianHang', 'maDonSan', 'ngayDat', 'trangThai', 'trangThaiRaw', 'skuSan',
  'tenListing', 'tenPhanLoai', 'soLuongListing', 'donGia', 'tienKhachTra',
  'giamGiaShop', 'giamGiaSan', 'phiSan', 'sttDongTrongDon', 'soDongTrongDon', 'tenFileNguon'
];

/** Trường chứa MÃ (đơn, file). Chuỗi ở đây có thể toàn chữ số nên không quét theo mẫu điện thoại. */
const TRUONG_LA_MA = ['maDon', 'maDonSan', 'tenFile', 'tenFileNguon', 'skuSan', 'san', 'maGianHang'];

/**
 * Số điện thoại Việt Nam trong một chuỗi bất kỳ: đúng 10 chữ số bắt đầu bằng 0, hoặc dạng +84/84.
 * Bao bằng (?<![\d]) / (?![\d]) để 14 chữ số của một mã đơn không bị cắt ra thành "số điện thoại".
 */
const RE_DIEN_THOAI = /(?<!\d)(?:0\d{9}|(?:\+?84)\d{9})(?!\d)/;

function chuanTenTruong(s) {
  let t = String(s == null ? '' : s);
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  return t.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Soát gói TRƯỚC KHI GỬI: dữ liệu người mua không được rời khỏi máy user (INV-4).
 *
 * Lớp 1 đã lọc sẵn — adapter chỉ đọc cột có tên trong `cfg.cot`, 9 cột người mua không bao giờ vào
 * bộ nhớ. Nhưng từ bản 2.4.0 gói đi QUA MẠNG và nằm lại trong nhật ký của Google, nên phải chốt lại
 * lần nữa ở đây. Ba phép soát, đủ ba mới gửi:
 *   1. danh sách TRẮNG cho từng dòng lớp 1 — trường lạ là dừng, kể cả khi tên nó vô hại;
 *   2. danh sách ĐEN 9 tên cột người mua — quét mọi khóa ở mọi độ sâu của gói;
 *   3. mẫu SỐ ĐIỆN THOẠI trong mọi giá trị chuỗi (trừ các trường mã).
 * Thông báo lỗi chỉ nêu ĐƯỜNG DẪN và TÊN TRƯỜNG, tuyệt đối không nêu giá trị — báo lỗi mà in kèm
 * số điện thoại thì chính câu báo lỗi lại là chỗ rò dữ liệu.
 *
 * @throws {Error} nếu gói có mùi dữ liệu người mua
 */
function kiemPII(goi, cotPII) {
  if (!cotPII || !cotPII.length)
    throw new Error('Chưa nạp danh sách cột thông tin người mua (cfg.cotPII) — từ chối gửi gói lên mạng ' +
      'khi chưa soát được INV-4. Đây là lỗi lập trình, không phải lỗi vận hành.');
  const cam = {};
  cotPII.forEach((c) => { cam[chuanTenTruong(c)] = String(c); });
  const trang = {};
  TRUONG_DONG_LOP_1.forEach((t) => { trang[t] = 1; });
  const laMa = {};
  TRUONG_LA_MA.forEach((t) => { laMa[chuanTenTruong(t)] = 1; });
  const viPham = [];

  const duyet = (x, duong, trongDongLop1) => {
    if (x == null) return;
    if (Array.isArray(x)) { x.forEach((v, i) => duyet(v, duong + '[' + i + ']', trongDongLop1)); return; }
    if (typeof x === 'string') {
      const cuoi = duong.split('.').pop().replace(/\[\d+\]$/, '');
      if (!laMa[chuanTenTruong(cuoi)] && RE_DIEN_THOAI.test(x))
        viPham.push(duong + ' chứa chuỗi trông như số điện thoại');
      return;
    }
    if (typeof x !== 'object') return;
    if (x instanceof Date) return;
    Object.keys(x).forEach((k) => {
      const d = duong ? duong + '.' + k : k;
      if (cam[chuanTenTruong(k)]) viPham.push(d + ' là cột thông tin người mua "' + cam[chuanTenTruong(k)] + '"');
      else if (trongDongLop1 && !trang[k]) viPham.push(d + ' không thuộc lược đồ dòng của lớp 1');
      duyet(x[k], d, trongDongLop1);
    });
  };

  (goi.cacFile || []).forEach((f, i) => {
    duyet({ maGianHang: f.maGianHang, tenFile: f.tenFile }, 'cacFile[' + i + ']', false);
    (f.dong || []).forEach((d, j) => duyet(d, 'cacFile[' + i + '].dong[' + j + ']', true));
  });
  Object.keys(goi).forEach((k) => {
    if (k !== 'cacFile' && k !== 'spreadsheetId' && k !== 'token') duyet(goi[k], k, false);
  });

  if (viPham.length) {
    throw new Error('TỪ CHỐI GỬI — gói có dữ liệu người mua (INV-4), ' + viPham.length + ' chỗ:\n  · ' +
      viPham.slice(0, 20).join('\n  · ') +
      (viPham.length > 20 ? '\n  · … và ' + (viPham.length - 20) + ' chỗ nữa' : '') +
      '\nTool KHÔNG gửi gì lên Google. Kiểm tra lại `cot` trong cấu hình và lớp 1 (AdapterFileXuat.gs).');
  }
  return true;
}

class WebAppGoogleSheet {
  /**
   * @param {Object} cauHinh { web_app_url, bat, duong, cotPII, link_thang, spreadsheetId?, choPhepThangKhac? }
   *   duong             'xuLy' (mặc định — Web App tự chạy lớp 2, lớp 3) | 'ghi' (đường lùi, máy tự chạy)
   *   cotPII            danh sách 9 cột thông tin người mua, lấy từ `cfg.cotPII`; thiếu là từ chối gửi
   *   link_thang        object "yyyy-MM" → link file tháng (D-42) — tra theo `thang` của từng lượt gọi
   *   spreadsheetId     chỉ định thẳng ID (chạy tay / test); có thì bỏ qua link_thang
   *   choPhepThangKhac  true CHỈ khi chạy tay `--thang` (D-21b); nút 4 không bao giờ bật
   */
  constructor(cauHinh) {
    const c = cauHinh || {};
    this.url = String(c.web_app_url || '').trim();
    this.biMat = String(c.chuoi_bi_mat || '');
    this.bat = c.bat === true;
    this.duong = chuanDuong(c.duong);
    this.cotPII = c.cotPII || null;
    this.linkThang = (c.link_thang && typeof c.link_thang === 'object') ? c.link_thang : null;
    this.spreadsheetId = String(c.spreadsheetId || '').trim() || null;
    this.choPhepThangKhac = c.choPhepThangKhac === true;
    this.phienBanWebApp = null;      // điền từ phản hồi đầu tiên; null = chưa nói chuyện lần nào
    this.banDungWebApp = null;       // dấu vân tay bản dựng Google trả về (YC-38.3: in vào dòng RUN)
    this.canhBaoBanDung = [];        // câu cảnh báo lệch dấu vân tay bản dựng, điền sau lượt ping
    if (this.bat) {
      if (!this.url) throw new Error('Bật ghi Google Sheet nhưng thiếu web_app_url trong CAU_HINH_VAN_HANH.json');
      // Gói giao user đã có sẵn chuỗi (YC-32), nên thiếu ở đây nghĩa là cấu hình bị sửa tay hoặc gói
      // lấy từ kho GitHub công khai — nơi chuỗi cố ý để rỗng.
      if (!this.biMat) throw new Error('Bật ghi Google Sheet nhưng thiếu chuoi_bi_mat trong CAU_HINH_VAN_HANH.json');
      // INV-7: không in lại link ra màn hình, kể cả khi nó sai — câu báo lỗi chỉ nói HÌNH DẠNG đúng.
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(this.url))
        throw new Error('web_app_url trong CAU_HINH_VAN_HANH.json phải là link /exec của Apps Script ' +
          '(bắt đầu bằng https://script.google.com/ và kết thúc bằng /exec). Mở file bằng Notepad rồi dán lại đúng link.');
    }
  }

  /** ID file tháng cho một lượt gọi: chỉ định thẳng, hoặc tra `link_thang` theo tháng (ném lỗi D-42 nếu thiếu). */
  idCuaThang(thang) {
    if (this.spreadsheetId) return this.spreadsheetId;
    return idFileThang(this.linkThang, thang).id;
  }

  /**
   * INV-7: che link Web App, link file tháng và ID file khỏi một đoạn văn bản trước khi in hay ghi nhật ký.
   * Che theo HAI đường: giá trị thật đang cầm trên tay, và mẫu chung — chuỗi lạ Google ném ra cũng bị che.
   */
  chePhu(text) {
    let s = String(text == null ? '' : text);
    // Chuỗi bí mật che TRƯỚC hết: nó có thể nằm lẫn trong thân gói mà câu lỗi trích lại.
    if (this.biMat) s = s.split(this.biMat).join('***');
    if (this.url) s = s.split(this.url).join('<link Web App>');
    if (this.spreadsheetId) s = s.split(this.spreadsheetId).join('<ID file tháng>');
    Object.keys(this.linkThang || {}).forEach((k) => {
      const l = String(this.linkThang[k] || '').trim();
      if (l) s = s.split(l).join('<link tháng ' + k + '>');
      const m = l.match(RE_LINK_SHEET);
      if (m) s = s.split(m[1]).join('<ID file tháng>');
    });
    return s
      .replace(/"token"\s*:\s*"[^"]*"/g, '"token":"***"')
      .replace(/https:\/\/script\.google(usercontent)?\.com\/[^\s"']*/g, '<link Web App>')
      .replace(/https:\/\/docs\.google\.com\/spreadsheets\/d\/[a-zA-Z0-9_-]+[^\s"']*/g, '<link file tháng>')
      .replace(/"spreadsheetId"\s*:\s*"[^"]*"/g, '"spreadsheetId":"<ID>"');
  }

  /** Gửi một gói JSON và trả về đối tượng đã phân tích. Ném lỗi với thông báo đã che bí mật. */
  _goi(body) {
    // Soát PII trên TỪNG LÔ, ngay trước khi gói thành chuỗi — không phải một lần lúc dựng kế hoạch.
    // Lô cuối mới dính dữ liệu bẩn là ca hoàn toàn có thật (một file xuất lạ trong lượt nhiều file).
    const hd = String(body && body.hanhDong || '').toLowerCase();
    if (hd === 'ghi' || hd === 'xuly') kiemPII(body, this.cotPII);
    const goi = Object.assign({ token: this.biMat, phienBanMongDoi: PHIEN_BAN }, body);
    // D-42: file tháng do MÁY chỉ định. Tra TRƯỚC khi gọi mạng — thiếu link tháng là dừng ngay tại đây,
    // chưa một byte nào rời khỏi máy, và chắc chắn không ghi lùi vào file tháng trước.
    if (hd === 'doc' || hd === 'ghi' || hd === 'xuly') {
      goi.spreadsheetId = this.idCuaThang(body.thang);
      if (this.choPhepThangKhac) goi.choPhepThangKhac = true;
    }
    const thangGoi = String(body && body.thang || '') || thangHienTaiMay();
    const than = JSON.stringify(goi);
    const u = new URL(this.url);
    const opt = {
      method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(than) },
      timeout: TIMEOUT_MS
    };
    return new Promise((giaiQuyet, tuChoi) => {
      const req = https.request(opt, (res) => {
        // Apps Script trả 302 sang script.googleusercontent.com — phải đi theo, và đi bằng GET.
        if (res.statusCode === 302 && res.headers.location) {
          https.get(res.headers.location, { timeout: TIMEOUT_MS }, (r2) => docHet(r2)).on('error', tuChoi);
          res.resume();
          return;
        }
        docHet(res);
      });
      req.on('timeout', () => { req.destroy(new Error('Web App không trả lời sau ' + (TIMEOUT_MS / 1000) + ' giây')); });
      // Mất mạng giữa chừng (bài D-12). Câu báo phải nói được ba điều, vì đây là lúc người vận hành
      // hoang mang nhất: chuyện gì xảy ra, dữ liệu có sao không, và bấm gì tiếp.
      // Cố ý KHÔNG khẳng định "chưa ghi gì": Apps Script có thể đã ghi xong rồi mới rớt phản hồi
      // (đo được ở bài T-WA-05: 0 lên 9 dòng trong khi máy vẫn báo lỗi). Nói chắc là nói sai.
      req.on('error', (e) => tuChoi(new Error('Không gọi được Web App (' + this.chePhu(e.message) + '). ' +
        'Gói này CHƯA GHI ĐƯỢC, hoặc chưa biết đã ghi hay chưa. Kiểm tra mạng rồi chạy lại tool: ' +
        'phần đã ghi vẫn giữ nguyên và sẽ không bị ghi trùng.')));
      req.write(than);
      req.end();

      const docHet = (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { buf += d; });
        res.on('end', () => {
          // D-46 ca (1): 401/403 là quyền truy cập — một câu chuẩn, mã HTTP thật ở dòng chi tiết.
          if (res.statusCode === 401 || res.statusCode === 403) {
            try { loiQuyen(thangGoi, 'Google từ chối lời gọi tới Web App', res.statusCode); }
            catch (eq) { return tuChoi(eq); }
          }
          if (res.statusCode >= 400) {
            // Lỗi phía Apps Script (bài D-13). Trước đây chỉ đổ 500 ký tự HTML thô của Google;
            // người vận hành đọc `Sorry, unable to open the file at this time` bằng tiếng Anh
            // rồi không biết làm gì. Phải phân biệt được ca quá 6 phút, vì việc phải làm khác hẳn.
            const noiDung = this.chePhu(buf);
            const quaGio = /Exceeded maximum execution time|thời gian thực thi/i.test(noiDung);
            return tuChoi(new Error('Web App trả mã ' + res.statusCode +
              ' (lỗi phía Apps Script, không phải lỗi cấu hình máy này). ' +
              (quaGio
                ? 'Nguyên nhân: gói chạy quá 6 phút. Việc phải làm: chia nhỏ file thả vào rồi chạy lại. '
                : 'Việc phải làm: chạy lại sau vài phút; vẫn lỗi thì mở dự án Apps Script xem mục Executions ' +
                  'và báo người phụ trách. ') +
              'Tool chưa ghi gì trong lượt này. Nội dung Google trả về: ' + noiDung.slice(0, 300)));
          }
          let kq;
          try { kq = JSON.parse(buf); } catch (e) {
            // D-46 ca (2): Google trả trang HTML / trang đăng nhập (mã 200, hoặc 200 sau khi đi theo 302)
            // thay vì JSON — dấu hiệu Deploy sai "Who has access", hoặc chưa Deploy bản mới. Một câu
            // chuẩn, không đổ nguyên trang HTML tiếng Anh ra cửa sổ đen của người không đọc tiếng Anh.
            try {
              loiQuyen(thangGoi, 'Web App trả về không phải JSON' +
                (laTrangHtml(buf) ? ' (trang HTML/đăng nhập của Google)' : '') +
                '. Nội dung: ' + this.chePhu(buf).replace(/\s+/g, ' ').slice(0, 160), res.statusCode);
            } catch (eh) { return tuChoi(eh); }
          }
          // Nhớ lại bản THẬT của Web App ngay cả khi phản hồi là lỗi — nhờ vậy `ghi()` chặn được
          // trước khi gửi lô đầu tiên, không phải chờ tới lúc Google trả lời.
          if (kq.phienBan != null) this.phienBanWebApp = String(kq.phienBan);
          if (kq.banDung != null) this.banDungWebApp = String(kq.banDung);
          // So dấu vân tay trên MỌI phản hồi, không riêng `ping`: `banDung` đi kèm mọi phản hồi đã
          // qua cửa bí mật, nên không tốn thêm lượt gọi nào. Gộp câu, không lặp lại câu đã có.
          soDauVanTay(kq).forEach((c) => { if (this.canhBaoBanDung.indexOf(c) < 0) this.canhBaoBanDung.push(c); });
          if (!kq.ok) {
            // Câu báo lệch phiên bản phải tới tay người dùng NGUYÊN VĂN, không bọc thêm tiền tố
            // "Web App từ chối [...]" — đây là câu duy nhất nói thẳng việc phải làm.
            if (kq.loi === 'LECH_PHIEN_BAN') return tuChoi(new Error(this.chePhu(kq.thongBao || '')));
            // D-46 ca (3): Web App không mở / không ghi được file theo ID → cũng gom về câu chuẩn; câu
            // chi tiết của Apps Script (đã tiếng Việt, xem `moBangTinh_`) giữ nguyên ở dòng dưới.
            const tb = this.chePhu(kq.thongBao || '');
            if (MA_LOI_QUYEN_WEBAPP.indexOf(kq.loi) >= 0 ||
                (kq.loi === 'NGOAI_LE' && /không mở được|không ghi được|permission|quyền/i.test(tb))) {
              try { loiQuyen(thangGoi, tb, res.statusCode); } catch (ew) { return tuChoi(ew); }
            }
            const GOI_Y = {
              SAI_GIAN_HANG: ' → kéo file sang đúng thư mục gian hàng rồi bấm lại; tool CHƯA ghi ô nào',
              SAI_BI_MAT: ' → chuoi_bi_mat trong CAU_HINH_VAN_HANH.json khác chuỗi đã cài bằng caiDat() ' +
                'trên Apps Script. Dùng đúng gói được giao, đừng sửa tay dòng đó',
              CHUA_CAI_DAT: ' → mở dự án Apps Script, chạy tay caiDat(<chuỗi bí mật>) một lần rồi Deploy lại',
              SAI_THANG_FILE: ' → link_thang trong CAU_HINH_VAN_HANH.json đang trỏ nhầm file của tháng khác; tool KHÔNG ghi ô nào',
              THIEU_ID_FILE: ' → bản Node trên máy cũ hơn Web App: bấm 2_CAP_NHAT.bat rồi chạy lại',
              HANH_DONG_LA: ' → phía máy tính và Web App lệch phiên bản; Deploy lại bản mới của ShellAppsScript.gs'
            };
            const goiY = GOI_Y[kq.loi] || '';
            return tuChoi(new Error('Web App từ chối [' + (kq.loi || '?') + ']: ' + tb + goiY));
          }
          giaiQuyet(kq);
        });
      };
    });
  }

  /**
   * Thử cửa: máy chủ Google đang ở tháng nào, và Web App đang chạy BẢN NÀO (`phienBan` + `banDung`) —
   * hai số đó là thứ duy nhất trả lời được câu "đã Deploy lại chưa". Không mở file tháng nào.
   */
  ping() { return this._goi({ hanhDong: 'ping' }); }

  /**
   * Chặn ghi khi lệch bản. Chưa nói chuyện lần nào thì ping một cái trước — thà tốn một lượt gọi
   * còn hơn gửi cả gói tiền cho một bản `.gs` cũ rồi tưởng đã ghi đúng.
   */
  async chotPhienBan() {
    if (this.phienBanWebApp === null) await this.ping();
    return kiemPhienBan(this.phienBanWebApp, PHIEN_BAN);
  }

  /**
   * Lấy về những gì cần để khử trùng và chọn lô TRƯỚC khi ghi.
   * @returns { sheets: {tên: {dongCuoi, maDon}}, mapping, tonKho, canhBao }
   */
  doc(thang, tenSheets, cauHinhGhiDe) {
    return this._goi({ hanhDong: 'doc', thang: thang, sheets: tenSheets || null, cauHinh: cauHinhGhiDe || null });
  }

  /**
   * Ghi các đơn mới, tự chia lô.
   * @param {string} thang  'yyyy-MM' — Web App từ chối nếu khác tháng của ngày chạy
   * @param {Array}  lenh   [{ tenSheet, don: [{maDon, ngay, tien:{H,I,J,K}, dong:[{tenVietTat, soLuong, vang, note}]}] }]
   * @param {Array}  mappingThem  các dòng tên hàng mới cần nối vào sheet Mapping
   */
  async ghi(thang, lenh, mappingThem, cauHinhGhiDe, mappingThemCot, runId) {
    // D-42 TRƯỚC TIÊN, trước cả `ping` chốt phiên bản: thiếu link tháng thì chắc chắn không ghi được ô
    // nào, nên đừng tốn một lượt gọi mạng để biết điều đó. Máy mất mạng mà chưa khai link vẫn phải nhận
    // đúng câu "chưa có link tháng", không phải câu "không gọi được Web App".
    this.idCuaThang(thang);
    await this.chotPhienBan();      // lệch bản là dừng TRƯỚC lô đầu tiên, chưa ghi ô nào
    const cacLo = chiaLo(lenh, TOI_DA_DON_MOT_LO);
    const gop = {
      thongKe: { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0, mappingToLai: 0 },
      viTri: {}, canhBao: [], thongBao: [], soLo: cacLo.length, tenFile: '', thang: thang,
      mappingCo: null, mappingBam: null
    };
    for (let i = 0; i < cacLo.length; i++) {
      const kq = await this._goi({
        hanhDong: 'ghi', thang: thang, lo: { so: i + 1, tong: cacLo.length },
        runId: runId || undefined,                       // YC-38.3: Web App ghi dòng RUN vào nhật ký Apps Script
        lenh: cacLo[i],
        // tên hàng mới chỉ gửi kèm lô đầu, tránh nối trùng khi có nhiều lô
        mappingThem: i === 0 ? (mappingThem || []) : [],
        mappingThemCot: mappingThemCot || null,          // tên cột từng vị trí: Web App ghi Mapping THEO TÊN
        cauHinh: cauHinhGhiDe || null
      });
      Object.keys(gop.thongKe).forEach((k) => { gop.thongKe[k] += (kq.thongKe && kq.thongKe[k]) || 0; });
      Object.assign(gop.viTri, kq.viTri || {});
      gop.canhBao = gop.canhBao.concat(kq.canhBao || []);
      gop.thongBao = gop.thongBao.concat(kq.thongBao || []);
      gop.tenFile = kq.tenFile || gop.tenFile;
      // Mapping sau lượt CUỐI là Mapping lượt chạy này để lại — lấy của lô sau cùng.
      if (kq.mappingBam != null) { gop.mappingCo = kq.mappingCo; gop.mappingBam = kq.mappingBam; }
    }
    return gop;
  }

  /**
   * ĐƯỜNG MẶC ĐỊNH từ bản 2.4.0: gửi thẳng bảng dòng đã qua lớp 1, Web App tự làm lớp 2, lớp 3 và ghi.
   *
   * @param {string} thang    'yyyy-MM'
   * @param {Array}  cacFile  [{ maGianHang, tenFile, dong: [dòng lớp 1] }]
   * @param {Object} tuyChon  { ngayGhi, sheetCuaGian, toiDaDonMotLo, nguongGiay (hai cái cuối chỉ để test) }
   */
  async xuLy(thang, cacFile, tuyChon) {
    const tc = tuyChon || {};
    this.idCuaThang(thang);         // D-42: thiếu link tháng thì dừng ngay, không tốn lượt gọi mạng nào
    await this.chotPhienBan();      // lệch bản là dừng TRƯỚC lô đầu tiên, chưa ghi ô nào
    const cacLo = chiaLoTheoDon(cacFile, tc.toiDaDonMotLo || TOI_DA_DON_MOT_LO_XU_LY, tc.sheetCuaGian);
    const gop = {
      thongKe: {
        donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0,
        tenMoi: 0, mappingThem: 0, mappingToLai: 0, donTrungTrongGoi: 0
      },
      viTri: {}, canhBao: [], thongBao: [], soLo: cacLo.length, soLanGoi: 0,
      tenFile: '', thang: thang, mapTomTat: null, mappingCo: null, mappingBam: null
    };

    // Tên hàng mới đã nối vào Mapping ở các lượt trước, mang theo suốt cả lần chạy (qua mọi lô và mọi
    // lượt gọi tiếp). Không mang theo thì chữ trong cột Note đổi giữa lô 1 và lô 2 — xem chú thích
    // `tenMoiTruocDo` trong `src/ShellAppsScript.gs`.
    let tenMoiTruocDo = [];

    for (let i = 0; i < cacLo.length; i++) {
      let con = cacLo[i];
      // Web App dừng gọn khi chạm ngưỡng giờ → gọi tiếp với đúng các gian hàng CHƯA xong.
      // Gửi lại phần đã xong cũng không sinh đơn trùng (hai tầng khử trùng), nhưng tốn giờ vô ích.
      for (let vong = 0; vong < SO_LAN_GOI_TIEP_TOI_DA; vong++) {
        const kq = await this._goi({
          hanhDong: 'xuLy', thang: thang, lo: { so: i + 1, tong: cacLo.length },
          runId: tc.runId || undefined,                    // YC-38.3
          ngayGhi: tc.ngayGhi || null, cacFile: con,
          tenMoiTruocDo: tenMoiTruocDo,
          nguongGiay: tc.nguongGiay == null ? undefined : tc.nguongGiay,
          cauHinh: tc.cauHinhGhiDe || null
        });
        gop.soLanGoi++;
        if (kq.khoaTenMoi) tenMoiTruocDo = kq.khoaTenMoi;
        Object.keys(gop.thongKe).forEach((k) => { gop.thongKe[k] += (kq.thongKe && kq.thongKe[k]) || 0; });
        Object.assign(gop.viTri, kq.viTri || {});
        gop.canhBao = gop.canhBao.concat(kq.canhBao || []);
        gop.thongBao = gop.thongBao.concat(kq.thongBao || []);
        gop.tenFile = kq.tenFile || gop.tenFile;
        gop.mapTomTat = kq.mapTomTat || gop.mapTomTat;
        if (kq.mappingBam != null) { gop.mappingCo = kq.mappingCo; gop.mappingBam = kq.mappingBam; }
        if (kq.xong !== false) break;

        // Gian hàng nào đã ghi xong thì bỏ khỏi lượt sau. Gian hàng đang dở thì GỬI LẠI NGUYÊN VẸN:
        // hai tầng khử trùng bỏ qua phần đã ghi, nên gửi lại an toàn và đơn giản hơn hẳn việc bắt
        // máy tự đoán xem Web App đã ghi tới đơn nào.
        const xong = {};
        (kq.sheetDaXong || []).forEach((t) => { xong[t] = 1; });
        const conMoi = con.filter((f) => !xong[f.__tenSheet]);
        if (conMoi.length) con = conMoi;

        // Tiến bộ đo bằng SỐ ĐƠN THẬT SỰ GHI THÊM, không đo bằng số file còn lại: một sheet đang dở
        // vẫn nằm nguyên trong danh sách gửi lại, nên số file không giảm dù lượt vừa rồi ghi được 100 đơn.
        // Ghi thêm 0 đơn mà vẫn báo chưa xong nghĩa là kẹt thật — dừng ngay, đừng quay vòng cho hết
        // lượt: quay vòng là ăn hết quota Apps Script của cả ngày mà không ghi thêm ô nào.
        if (!((kq.thongKe && kq.thongKe.donGhi) > 0)) {
          throw new Error('Web App báo chưa ghi xong nhưng lượt gọi vừa rồi không ghi thêm được đơn nào ' +
            '(lô ' + (i + 1) + '/' + cacLo.length + ', còn ' + (kq.sheetConLai || []).length + ' sheet dở). ' +
            'Chạy lại tool: phần đã ghi vẫn giữ nguyên và sẽ không bị ghi trùng.');
        }
        if (vong === SO_LAN_GOI_TIEP_TOI_DA - 1) {
          throw new Error('Đã gọi tiếp ' + SO_LAN_GOI_TIEP_TOI_DA + ' lượt mà Web App vẫn chưa ghi xong lô ' +
            (i + 1) + '/' + cacLo.length + '. Dừng để khỏi ăn hết quota; chạy lại tool sau, không sinh đơn trùng.');
        }
      }
    }
    return gop;
  }
}

/** 'xuly' → 'xuLy', 'ghi' → 'ghi'; rỗng/lạ → 'xuLy' (mặc định). */
function chuanDuong(x) {
  const t = String(x == null ? '' : x).trim().toLowerCase();
  return t === 'ghi' ? 'ghi' : 'xuLy';
}

/**
 * Chia `cacFile` (dòng lớp 1) thành các lô ≤ `toiDa` ĐƠN, GOM THEO GIAN HÀNG trước.
 *
 * Hai luật cứng:
 *  · không bao giờ cắt ngang một đơn — nửa đơn ở lô này, nửa ở lô kia là đơn đó mất ô gộp C/H/I/J/K/L
 *    và hai nửa nằm cách nhau vài chục dòng trong sheet;
 *  · các file của cùng một gian hàng đi liền nhau — lớp 2 chạy một lần cho mỗi lô, gom theo gian hàng
 *    thì một tên hàng mới hiếm khi bị rơi vào hai lô (xem chú thích TOI_DA_DON_MOT_LO_XU_LY).
 * Mỗi phần tử lô mang thêm `__tenSheet` để biết lô nào đã ghi xong khi Web App dừng vì hết giờ.
 */
function chiaLoTheoDon(cacFile, toiDa, sheetCuaGian) {
  const n = Math.max(1, Number(toiDa) || TOI_DA_DON_MOT_LO_XU_LY);
  const theoGian = [];
  const chiMuc = {};
  for (const f of cacFile || []) {
    if (chiMuc[f.maGianHang] == null) { chiMuc[f.maGianHang] = theoGian.length; theoGian.push([]); }
    theoGian[chiMuc[f.maGianHang]].push(f);
  }

  const lo = [];
  let hienTai = [], dem = 0;
  for (const nhom of theoGian) {
    for (const f of nhom) {
      // Gom dòng theo MÃ ĐƠN trước khi cắt. Không dựa vào "các dòng của một đơn nằm liền nhau trong
      // file xuất": chỉ cần Shopee đổi thứ tự xuất một lần là đơn đó bị xẻ đôi sang hai lô, mất ô gộp
      // và nằm cách nhau vài chục dòng. Gom ở đây là gom ỔN ĐỊNH (giữ thứ tự xuất hiện đầu tiên) nên
      // kết quả không đổi so với khi gửi cả file một lượt — `Normalize.xuLy` cũng gom đúng kiểu này.
      const theoDon = [], viTri = {};
      for (const d of f.dong || []) {
        const ma = String(d.maDonSan);
        if (viTri[ma] == null) { viTri[ma] = theoDon.length; theoDon.push([]); }
        theoDon[viTri[ma]].push(d);
      }
      let phan = [], demPhan = 0;
      const chot = () => {
        if (!phan.length) return;
        hienTai.push(gan(f, phan, sheetCuaGian));
        dem += demPhan;
        phan = []; demPhan = 0;
        if (dem >= n) { lo.push(hienTai); hienTai = []; dem = 0; }
      };
      for (const donDS of theoDon) {
        if (dem + demPhan >= n) chot();
        donDS.forEach((d) => phan.push(d));
        demPhan++;
      }
      chot();
    }
  }
  if (hienTai.length) lo.push(hienTai);
  return lo.length ? lo : [[]];
}

function gan(f, dong, sheetCuaGian) {
  const o = { maGianHang: f.maGianHang, tenFile: f.tenFile, dong: dong };
  Object.defineProperty(o, '__tenSheet', {
    value: sheetCuaGian ? sheetCuaGian(f.maGianHang) : (f.__tenSheet || null),
    enumerable: false, writable: true
  });
  return o;
}

/** Chia danh sách lệnh thành nhiều lô, mỗi lô tối đa `toiDa` đơn, không cắt ngang một đơn. */
function chiaLo(lenh, toiDa) {
  const lo = [];
  let hienTai = [], dem = 0;
  for (const l of lenh || []) {
    let con = (l.don || []).slice();
    while (con.length) {
      const lay = con.splice(0, Math.max(1, toiDa - dem));
      hienTai.push({ tenSheet: l.tenSheet, don: lay });
      dem += lay.length;
      if (dem >= toiDa) { lo.push(hienTai); hienTai = []; dem = 0; }
    }
  }
  if (hienTai.length) lo.push(hienTai);
  return lo.length ? lo : [[]];
}

/**
 * Đổi kết quả của lõi (Normalize.xuLy → don[]) thành lệnh ghi cho Web App.
 *
 * BẢN ĐANG DÙNG THẬT là `lenhTuDon_` trong `src/ShellAppsScript.gs` — từ bản 2.4.0 cả hai đường
 * ('xuLy' và 'ghi') đều đi qua bản đó. Bản dưới đây giữ lại cho mã cũ gọi tới, và `test-xu-ly-tren-google.js`
 * có một bài so hai bản trên cùng dữ liệu: lệch một chữ là hỏng test, để hai bản không âm thầm trôi khỏi nhau.
 */
function lenhTuDon(tenSheet, donDS, ngayGhi) {
  return {
    tenSheet: tenSheet,
    don: (donDS || []).map((d) => ({
      maDon: String(d.maDon),
      ngay: ngayGhi || null,
      tien: { H: d.tien.H, I: d.tien.I, J: d.tien.J, K: d.tien.K },
      // Tô vàng khi chưa nhận ra mã (lyDo) HOẶC ghép được nhưng có điều cần biết, ví dụ tồn 0.
      // Đúng một luật với KeyIn.gs để hai vỏ không lệch nhau.
      dong: (d.dong || []).map((x) => ({
        tenVietTat: x.tenVietTat || '',
        soLuong: x.soLuong,
        vang: !!(x.lyDo || x.ghiChu),
        note: x.ghiChu || ''
      }))
    }))
  };
}

module.exports = {
  WebAppGoogleSheet, chiaLo, chiaLoTheoDon, lenhTuDon, chuanDuong,
  TOI_DA_DON_MOT_LO, TOI_DA_DON_MOT_LO_XU_LY, SO_LAN_GOI_TIEP_TOI_DA,
  PHIEN_BAN, kiemPhienBan, thongBaoLechPhienBan, soDauVanTay,
  kiemPII, TRUONG_DONG_LOP_1, RE_DIEN_THOAI,
  idFileThang, cauThieuLinkThang, thangSau, canhBaoThangSau, RE_LINK_SHEET, thangHienTaiMay, phanNgayVN,
  cauLoiQuyen, loiQuyen, MA_LOI_QUYEN_WEBAPP, laTrangHtml
};
