/**
 * ShellAppsScript.gs — VỎ GOOGLE (GV-v2.2 mục 1.7): Web App NHẬN LỆNH GHI.
 *
 * Đổi vai so với v1: KHÔNG quét Drive, KHÔNG trigger theo lịch, KHÔNG đọc file xuất.
 * Máy tính (vỏ Node) đọc file xuất (lớp 1 — nơi duy nhất biết định dạng file Shopee, phải ở lại máy
 * vì file nằm trên máy), rồi POST một gói JSON tới đây. Bốn hành động:
 *
 *   hanhDong = 'ping' → trả `phienBan` thật của bản đang chạy, để máy so trước khi ghi
 *   hanhDong = 'doc'  → trả về mã đơn đã có + sheet Mapping + tồn kho, để máy tính khử trùng và chọn lô
 *   hanhDong = 'ghi'  → nối thêm dòng vào cuối sheet gian hàng, gộp ô, kéo cột L, tô vàng, ghi Note
 *   hanhDong = 'xuLy' → NHẬN THẲNG BẢNG DÒNG ĐÃ QUA LỚP 1 rồi tự làm 'doc' + lớp 2 + lớp 3 + 'ghi'
 *                       trong MỘT lần gọi (GV-v2.3 mục 2.3 — "một lõi tính toán duy nhất")
 *
 * VÌ SAO CÓ 'xuLy' (đây là lý do tồn tại của cả khối bên dưới): trước đây lớp 2 (tiền, thuế, mapping,
 * chọn lô) và lớp 3 (gộp ô, lập kế hoạch ghi) chạy TRÊN MÁY NHÂN VIÊN. Sửa một dòng luật thuế là phải
 * đi cập nhật từng máy — 2-3 máy, và không có cách nào biết máy nào đang chạy bản nào. Chuyển hai lớp
 * đó sang đây thì sửa nghiệp vụ chỉ còn một lần Deploy. Hành động 'ghi' cũ GIỮ NGUYÊN làm đường lùi và
 * để chế độ Excel trên máy (không có mạng, không có Web App) vẫn dùng lớp 2, lớp 3 tại chỗ.
 *
 * Đây là file DUY NHẤT (ngoài tests) gọi dịch vụ của Google. Lõi (Utils/Config/Schema/KeyIn/…) không đụng tới:
 * `dungKeHoachGhi_` bên dưới chỉ GỌI lõi, không tự tính lại một con số nào (HOC_TU_DU_AN_CO_PHIEU mục 1).
 *
 * ------------------------------------------------------------------ CÀI ĐẶT (một lần)
 *  1. script.google.com → New project (STANDALONE, không gắn vào file Sheet nào — mỗi tháng một file khác).
 *  2. Dán toàn bộ src/ vào (hoặc `clasp push`). Bắt buộc có, ĐỦ BẢY FILE: Utils.gs, Schema.gs, CaiDat.gs,
 *     Config.gs, DanhMuc.gs, MapListing.gs, Normalize.gs, và file này.
 *     Thiếu ba file lớp 2 (DanhMuc/MapListing/Normalize) thì 'ping', 'doc', 'ghi' vẫn chạy bình thường,
 *     riêng 'xuLy' ném "DanhMuc is not defined" — hỏng ồn ào, nhưng chỉ hỏng lúc chạy thật. Sau khi Deploy
 *     nhớ gọi thử 'xuLy' với gói rỗng (xem `thuXuLyRong()` cuối file) để bắt ngay chỗ thiếu file.
 *  3. KHÔNG tạo sheet nào cả. Bảng link các tháng ĐÃ CÓ SẴN trong sheet `Thông tin shop ` của chính
 *     các file tháng (GV-v2.3 mục 1). Xem khối "ĐỊNH TUYẾN THÁNG" bên dưới.
 *  4. Trong trình soạn thảo chạy tay MỘT LẦN:
 *         caiDat('<chuỗi bí mật tự nghĩ, dài>', '<link hoặc ID của MỘT file tháng đã có>')
 *     File tháng đó là "mỏ neo" — chỗ để bắt đầu đọc bảng link. Hai giá trị nằm trong Script
 *     Properties, KHÔNG nằm trong mã nguồn, KHÔNG in ra log.
 *  5. Deploy → New deployment → type Web app → Execute as "Me" → Who has access "Anyone".
 *     ("Anyone" là bắt buộc để máy tính POST được; cửa vẫn khóa bằng chuỗi bí mật ở bước 4.)
 *  6. Chép link /exec và chuỗi bí mật vào `03_VAN_HANH/CAU_HINH_VAN_HANH.json` → `google_sheet`.
 *  7. Kiểm tra bằng: hanhDong = 'ping' — phản hồi có `phienBan`, so với PHIEN_BAN phía máy tính.
 *
 *  Sửa mã xong phải Deploy → Manage deployments → bút chì → Version: New version → Deploy,
 *  nếu không link /exec vẫn chạy bản cũ. Google KHÔNG tự đồng bộ và KHÔNG báo lỗi khi chạy bản cũ —
 *  bên dự án chứng quyền gọi đây là "lỗi tốn kém nhất của dự án". Vì thế mọi phản hồi của Web App
 *  đều kèm `phienBan`; lệch với bản phía máy tính là TỪ CHỐI GHI (GV-v2.3 mục 2.3).
 *
 * ------------------------------------------------------------------ ĐỊNH TUYẾN THÁNG (GV-v2.3 mục 1)
 *  Bảng link nằm trong sheet `Thông tin shop ` — CHÚ Ý: tên sheet có ĐÚNG MỘT DẤU CÁCH Ở CUỐI.
 *  Bảng bắt đầu từ dòng 8:  A = năm (2023…2026) · B = tên kỳ (`Kinh Doanh T9`, `Kinh Doanh T4 + 5`)
 *  · C = link đầy đủ tới file Sheet của kỳ đó.
 *
 *  VÙNG CẤM: sheet này chứa MẬT KHẨU CÁC GIAN HÀNG ở các cột từ D trở đi. Tool chỉ được đọc
 *  A, B, C từ dòng 8 — bằng đúng một lệnh `getRange(8, 1, n, 3)`. Cấm `getDataRange()`, cấm nạp cả
 *  sheet rồi lọc, cấm in bất kỳ ô nào của sheet này ra log hay thông báo lỗi (kể cả khi báo "không
 *  tìm thấy tháng": chỉ được nêu danh sách THÁNG và số DÒNG, không nêu nội dung ô). Test bất biến
 *  chặn việc này: `node/test-dinh-tuyen-thang.js`.
 *
 *  Bảng nằm trong chính các file tháng nên phải có một file "mỏ neo" để bắt đầu: Script Property
 *  KEODON_MO_NEO_ID. Định tuyến xong, tool tự dời mỏ neo sang file tháng vừa tìm được (nếu file đó
 *  cũng có sheet `Thông tin shop `), nên mỏ neo luôn tự đi theo tháng mới nhất mà không ai phải sửa tay.
 *
 * ------------------------------------------------------------------ GIỚI HẠN 6 PHÚT
 *  Apps Script cắt một lần chạy ở 6 phút (360 giây) và cắt bằng cách NÉM NGOẠI LỆ giữa chừng — phần
 *  đã ghi vẫn nằm lại trong sheet, phía máy tính chỉ thấy một trang HTML lỗi. Vì thế hai lớp chặn:
 *
 *   · CHIA LÔ Ở PHÍA MÁY  — vỏ Node cắt theo ĐƠN (không bao giờ cắt ngang một đơn, cắt ngang là
 *     đơn đó mất ô gộp) rồi gửi từng lô kèm `lo: {so, tong}`.
 *   · ĐỒNG HỒ Ở PHÍA NÀY  — trước mỗi khối ghi, script tự xem đã chạy bao lâu; quá NGUONG_GIAY_XU_LY
 *     thì DỪNG GỌN: ghi xong khối đang làm, flush, trả `xong: false` + `sheetConLai` để máy gọi tiếp.
 *     Không bao giờ để Google cắt ngang — bị cắt ngang là không ai biết đã ghi tới đâu.
 *
 *  Gửi lại đúng lô cũ vẫn an toàn: trước khi ghi, script đọc lại cột mã đơn và bỏ đơn đã có.
 */

/**
 * Số bản của vỏ Google. Phải khớp PHIEN_BAN trong `node/gsheet-web-app.js`.
 * Đổi số này MỖI KHI sửa hợp đồng gói JSON (thêm/bớt trường, đổi ý nghĩa hành động) rồi Deploy
 * New version. Không đổi thì Google im lặng chạy bản cũ và tool tưởng đã ghi đúng.
 */
var PHIEN_BAN = '2.4.0';

var TT_BI_MAT = 'KEODON_BI_MAT';
var TT_MO_NEO = 'KEODON_MO_NEO_ID';

/** CÓ MỘT DẤU CÁCH Ở CUỐI — tên thật của sheet trong file của chủ dự án. Tuyệt đối không trim khi tra. */
var TEN_SHEET_THONG_TIN_SHOP = 'Thông tin shop ';
var DONG_DAU_BANG_LINK = 8;
var SO_COT_DUOC_DOC = 3;            // A, B, C. Cột D trở đi là MẬT KHẨU GIAN HÀNG — không đọc, không in.

var MUI_GIO = 'Asia/Ho_Chi_Minh';
var MAU_VANG = '#FFF2CC';
var TOI_DA_DON_MOT_LO = 400;

/**
 * Ngưỡng tự dừng của hành động 'xuLy', tính từ lúc doPost nhận gói. Quota cứng của Google là 360 giây.
 *
 * Chọn 240 (4 phút) chứ không sát 360, vì sau khi vượt ngưỡng script CÒN PHẢI làm xong:
 *   · khối ghi đang dở (tới 100 đơn: setValues 8 cột + mergeVertically 6 cột + setBackgrounds cả dòng),
 *   · SpreadsheetApp.flush() — lệnh này mới là lúc Google thật sự đẩy dữ liệu đi, đo được tới hàng chục giây
 *     trên sheet nhiều công thức như file tháng (18 sheet nối nhau bằng ARRAYFORMULA),
 *   · dựng và trả phản hồi JSON.
 * 120 giây dự phòng là chỗ cho ba việc đó. Ngưỡng nhỏ hơn thì tốn thêm lượt gọi; lớn hơn thì rủi ro
 * bị Google cắt ngang giữa lúc flush — đúng ca không ai biết đã ghi tới đâu.
 */
var NGUONG_GIAY_XU_LY = 240;

/**
 * 'xuLy' ghi theo từng khối ≤ 100 đơn để có chỗ xem đồng hồ. Một lệnh ghi cả 400 đơn thì không cắt
 * được: xem đồng hồ trước lệnh đó là vô nghĩa, còn xem sau thì đã muộn.
 * Cắt khối KHÔNG đổi một ô nào: mỗi khối tự đọc lại dòng cuối rồi nối tiếp, thứ tự đơn giữ nguyên.
 */
var TOI_DA_DON_MOT_KHOI = 100;

/** E, F, M, N là ARRAYFORMULA một ô ở dòng tiêu đề — ghi một ô là hỏng cả cột của cả sheet (INV-3). */
var COT_CAM_GHI = [5, 6, 13, 14];

// ==================================================================== cài đặt & tiện ích

/**
 * Chạy tay một lần trong trình soạn thảo. Không truyền tham số thì chỉ báo tình trạng.
 * `fileMoNeo` = link hoặc ID của MỘT file tháng đã có (khuyên dùng file tháng gần nhất). Bảng link
 * các tháng nằm trong chính file đó, sheet `Thông tin shop `.
 */
function caiDat(chuoiBiMat, fileMoNeo) {
  var p = PropertiesService.getScriptProperties();
  if (chuoiBiMat) {
    if (String(chuoiBiMat).length < 16) throw new Error('Chuỗi bí mật quá ngắn (cần ít nhất 16 ký tự)');
    p.setProperty(TT_BI_MAT, String(chuoiBiMat));
  }
  if (fileMoNeo) p.setProperty(TT_MO_NEO, layIdSheet_(fileMoNeo));
  var co = function (khoa) { return p.getProperty(khoa) ? 'đã cài' : 'CHƯA CÀI'; };
  var tin = 'Bản ' + PHIEN_BAN + ' · Chuỗi bí mật: ' + co(TT_BI_MAT) + ' · File mỏ neo: ' + co(TT_MO_NEO);
  Logger.log(tin);   // cố ý không in giá trị
  return tin;
}

/** Nhận cả link đầy đủ lẫn ID trần. */
function layIdSheet_(s) {
  var t = String(s || '').trim();
  var m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(t)) return t;
  throw new Error('Không nhận ra ID Google Sheet từ: ' + t);
}

function thuocTinh_(khoa) { return PropertiesService.getScriptProperties().getProperty(khoa) || ''; }

/** So sánh không sớm-thoát để không rò rỉ độ dài chuỗi bí mật. */
function biMatDung_(gui) {
  var that = thuocTinh_(TT_BI_MAT);
  if (!that) throw new Error('Web App chưa được cài đặt: chạy caiDat(<chuỗi bí mật>, <link một file tháng đã có>) một lần');
  var a = String(gui || '');
  var lech = a.length === that.length ? 0 : 1;
  var n = Math.max(a.length, that.length);
  for (var i = 0; i < n; i++) if (a.charCodeAt(i) !== that.charCodeAt(i)) lech = 1;
  return lech === 0;
}

/**
 * Mọi phản hồi — kể cả phản hồi lỗi — đều kèm `phienBan` thật của bản đang chạy trên Google.
 * Gắn ở đây chứ không gắn ở từng chỗ return, vì chỉ cần quên MỘT chỗ là phía máy tính lại không
 * biết mình đang nói chuyện với bản nào (đúng cái bẫy "Google im lặng chạy mã cũ").
 */
function traLoi_(obj) {
  var o = obj || {};
  if (o.phienBan == null) o.phienBan = PHIEN_BAN;
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/** Nguyên văn câu báo lệch phiên bản (GV-v2.3 mục 2.3). Bản Node phải giống hệt từng chữ. */
function thongBaoLechPhienBan_(banThuc, banCan) {
  return 'Web App đang chạy bản ' + banThuc + ', tool cần bản ' + banCan +
    ' — hãy triển khai lại (Deploy → Manage deployments → New version).';
}

function thangHienTai_() { return Utilities.formatDate(new Date(), MUI_GIO, 'yyyy-MM'); }

/** '2026-09' · '09/2026' · '9/2026' · 'Tháng 9/2026' · 'T9/2026' · Date → 'yyyy-MM'; không nhận ra → ''. */
function chuanHoaThang_(x) {
  if (x instanceof Date) return Utilities.formatDate(x, MUI_GIO, 'yyyy-MM');
  var t = String(x == null ? '' : x).trim();
  if (!t) return '';
  var m = t.match(/^(\d{4})[-\/.](\d{1,2})$/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2);
  m = t.match(/(\d{1,2})\s*[\/.-]\s*(\d{4})/);
  if (m) return m[2] + '-' + ('0' + m[1]).slice(-2);
  return '';
}

// ==================================================================== định tuyến tháng (GV-v2.3 mục 1)
//
// Ba hàm dưới đây THUẦN: không gọi SpreadsheetApp, nên `node/test-dinh-tuyen-thang.js` chạy được
// chúng bằng Node mà không cần Google. Phần chạm Google gom trong `bangLinkThang_()`.

/** Năm ở cột A: nhận cả số 2026 lẫn chuỗi ' 2026 '. Không nhận ra → 0. */
function namCuaO_(x) {
  var t = String(x == null ? '' : x).trim();
  var m = t.match(/^(\d{4})(?:\.0+)?$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Cột B → danh sách tháng mà kỳ đó phủ. Không nhận ra → [] (và tool sẽ dừng chứ không đoán).
 *
 * Chịu được: 'Kinh Doanh T9' · 'KINH DOANH T10' · 'kinhdoanht9' (mất khoảng trắng) ·
 * 'Kinh Doanh Tháng 9' · và dạng GỘP KỲ 'Kinh Doanh T4 + 5' → [4, 5] (dòng 8 của bảng thật, kỳ 2023).
 *
 * Cố ý KHÔNG nhận chuỗi chỉ có 'T9' hay 'Tháng 9': cột B của sheet này nằm cạnh một bảng khác
 * (dòng 1-7: STT | Tên shop | Tên đăng nhập), khớp lỏng là định tuyến nhầm sang dòng không phải link.
 */
function phanTichTenKy_(x) {
  var t = String(x == null ? '' : x);
  if (typeof t.normalize === 'function') t = t.normalize('NFC');   // fallback: Rhino không có normalize
  t = t.toLowerCase().replace(/\s+/g, '');
  var m = t.match(/^kinhdoanh(?:th[aáàảãạăằắẳẵặâầấẩẫậ]ng|t)(\d{1,2})((?:\+\d{1,2})*)$/);
  if (!m) return [];
  var ds = [Number(m[1])];
  if (m[2]) m[2].split('+').forEach(function (s) { if (s) ds.push(Number(s)); });
  var ra = [];
  for (var i = 0; i < ds.length; i++) {
    if (!(ds[i] >= 1 && ds[i] <= 12)) return [];   // 'Kinh Doanh T13' là gõ nhầm → coi như không nhận ra
    if (ra.indexOf(ds[i]) < 0) ra.push(ds[i]);
  }
  return ra;
}

/**
 * Cột C → spreadsheet ID. Nhận: link có '#gid=', link không có '/edit', và chuỗi ID trần.
 * KHÔNG ném lỗi kèm nội dung ô — trả '' để phía gọi báo theo SỐ DÒNG, vì mọi ô của sheet này
 * đều có thể là mật khẩu hoặc tên đăng nhập (GV-v2.3 mục 1.5).
 */
function bocIdTuLink_(x) {
  var t = String(x == null ? '' : x).trim();
  var m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : '';
}

function hai_(n) { return ('0' + n).slice(-2); }

/** Câu báo thiếu tháng — nguyên văn theo GV-v2.3 mục 1.3. Chỉ chứa THÁNG, không chứa nội dung ô. */
function cauThieuThang_(nam, thang) {
  return 'Chưa có file cho tháng ' + thang + '/' + nam + '. Hãy thêm một dòng vào sheet ' +
    "'Thông tin shop' (năm ở cột A, Kinh Doanh T" + thang + ' ở cột B, link ở cột C).';
}

/**
 * Chọn dòng định tuyến — HÀM THUẦN, `bang` là khối A:C đã đọc từ dòng 8.
 * Khớp đúng (năm, tháng); không khớp thì DỪNG. Bảng thật có lỗ hổng ở giữa (2024 nhảy từ T5 sang T8)
 * nên tuyệt đối không được chữa cháy bằng "lấy dòng cuối" hay "lấy tháng gần nhất".
 * @returns {ok:true, id, dong} | {ok:false, ma, thongBao, dangCo, dongKhop}
 */
function chonDongDinhTuyen_(bang, nam, thang) {
  var khop = [], dangCo = [], cuoi = null;
  for (var i = 0; i < (bang || []).length; i++) {
    var r = DONG_DAU_BANG_LINK + i;
    var namO = namCuaO_(bang[i][0]);
    var cacThang = phanTichTenKy_(bang[i][1]);
    if (!namO || !cacThang.length) continue;
    for (var j = 0; j < cacThang.length; j++) {
      dangCo.push(namO + '-' + hai_(cacThang[j]));
      cuoi = { nam: namO, thang: cacThang[j], dong: r };
    }
    if (namO === nam && cacThang.indexOf(thang) >= 0) khop.push({ dong: r, id: bocIdTuLink_(bang[i][2]) });
  }

  if (!khop.length) {
    return {
      ok: false, ma: 'KHONG_CO_THANG', thongBao: cauThieuThang_(nam, thang), dangCo: dangCo,
      ky_cuoi: cuoi ? { nam: cuoi.nam, thang: cuoi.thang, dong: cuoi.dong } : null
    };
  }
  if (khop.length > 1) {
    return {
      ok: false, ma: 'TRUNG_NHIEU_DONG', dangCo: dangCo,
      dongKhop: khop.map(function (x) { return x.dong; }),
      thongBao: 'Sheet "' + TEN_SHEET_THONG_TIN_SHOP + '" có ' + khop.length + ' dòng cùng khớp tháng ' +
        thang + '/' + nam + ' (dòng ' + khop.map(function (x) { return x.dong; }).join(', ') +
        '). Tool DỪNG, không tự chọn — hãy sửa cho chỉ còn đúng một dòng rồi chạy lại.'
    };
  }
  if (!khop[0].id) {
    return {
      ok: false, ma: 'LINK_HONG', dangCo: dangCo, dongKhop: [khop[0].dong],
      thongBao: 'Dòng ' + khop[0].dong + ' của sheet "' + TEN_SHEET_THONG_TIN_SHOP + '" khớp tháng ' +
        thang + '/' + nam + ' nhưng cột C không phải link Google Sheet (cần dạng ' +
        'https://docs.google.com/spreadsheets/d/<ID>/…). Tool không in nội dung ô vì sheet này chứa mật khẩu.'
    };
  }
  return { ok: true, id: khop[0].id, dong: khop[0].dong, dangCo: dangCo };
}

// ---------------------------------------------------------------- phần chạm Google

/**
 * Tra sheet bảng link. Tên sheet có ĐÚNG MỘT DẤU CÁCH Ở CUỐI: `getSheetByName` so nguyên văn nên
 * trim là không tìm thấy sheet — rồi tool tưởng chưa khai báo tháng nào và dừng oan.
 */
function sheetThongTinShop_(ss) {
  return ss.getSheetByName(TEN_SHEET_THONG_TIN_SHOP) ||
    ss.getSheetByName(TEN_SHEET_THONG_TIN_SHOP.replace(/\s+$/, '')) || null;
}

/**
 * Đọc khối A:C từ dòng 8 của file mỏ neo — VÙNG ĐỌC DUY NHẤT được phép trên sheet này.
 *
 * Hai chiều chặn, thiếu chiều nào cũng lộ dữ liệu thật:
 *   · chặn CỘT: chỉ 3 cột A, B, C. Từ cột D trở đi là mật khẩu các gian hàng (đo được 110 ô có nội dung).
 *   · chặn DÒNG: chỉ từ dòng 8. Dòng 1-7 là một bảng khác (STT | Tên shop | Tên đăng nhập) và
 *     cột C của bảng đó chứa TÊN ĐĂNG NHẬP THẬT — số điện thoại và email của 5 gian hàng.
 * Vì thế dòng bắt đầu là hằng số trong mã, cố ý KHÔNG cho cấu hình đổi được.
 * Cấm getDataRange(): nó nạp cả 1000 dòng × 14 cột vào bộ nhớ, kể cả mật khẩu.
 */
function bangLinkThang_() {
  var id = thuocTinh_(TT_MO_NEO);
  if (!id) throw new Error('Chưa cài file mỏ neo: mở dự án Apps Script, chạy tay một lần ' +
    'caiDat(<chuỗi bí mật>, <link của một file tháng đã có>). Bảng link các tháng nằm trong ' +
    'sheet "' + TEN_SHEET_THONG_TIN_SHOP + '" của chính file đó.');
  var ss = SpreadsheetApp.openById(id);
  var sh = sheetThongTinShop_(ss);
  if (!sh) throw new Error('File mỏ neo "' + ss.getName() + '" không có sheet "' + TEN_SHEET_THONG_TIN_SHOP +
    '" (chú ý dấu cách cuối tên). Chạy lại caiDat(null, <link file tháng có sheet đó>).');
  var het = sh.getLastRow();
  if (het < DONG_DAU_BANG_LINK) return [];
  return sh.getRange(DONG_DAU_BANG_LINK, 1, het - DONG_DAU_BANG_LINK + 1, SO_COT_DUOC_DOC).getDisplayValues();
}

/**
 * Dời mỏ neo sang file tháng vừa định tuyến được, để tháng sau vẫn còn chỗ bắt đầu mà không ai
 * phải sửa Script Property bằng tay. Chỉ dời khi file mới THẬT SỰ có bảng link — file tháng mới
 * thiếu sheet đó mà dời sang là lần chạy sau mất đường, không định tuyến được nữa.
 * Hỏng thì im lặng giữ mỏ neo cũ: đây chỉ là lối tắt, không phải nguồn sự thật.
 */
function capNhatMoNeo_(fileId) {
  try {
    if (!fileId || thuocTinh_(TT_MO_NEO) === fileId) return false;
    if (!sheetThongTinShop_(SpreadsheetApp.openById(fileId))) return false;
    PropertiesService.getScriptProperties().setProperty(TT_MO_NEO, fileId);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Tìm file tracking của `thang` ('yyyy-MM').
 * Không có dòng cho tháng đó → NÉM LỖI (GV-v2.3 mục 1.3: dừng và báo, tuyệt đối không ghi lùi).
 */
function fileCuaThang_(thang) {
  var nam = Number(String(thang).slice(0, 4));
  var th = Number(String(thang).slice(5, 7));
  var kq = chonDongDinhTuyen_(bangLinkThang_(), nam, th);
  if (!kq.ok) throw new Error(kq.thongBao + moTaBangLink_(kq));
  capNhatMoNeo_(kq.id);
  return { fileId: kq.id, thang: thang, dong: kq.dong };
}

/** Phần đuôi thông báo: chỉ THÁNG và SỐ DÒNG, tuyệt đối không có nội dung ô. */
function moTaBangLink_(kq) {
  var d = '';
  if (kq.ky_cuoi) d += ' Dòng cuối bảng đang là kỳ ' + kq.ky_cuoi.thang + '/' + kq.ky_cuoi.nam +
    ' (dòng ' + kq.ky_cuoi.dong + ').';
  d += ' Bảng bắt đầu từ dòng ' + DONG_DAU_BANG_LINK + ' của sheet "' + TEN_SHEET_THONG_TIN_SHOP + '".';
  d += ' Các kỳ đã khai báo: ' + ((kq.dangCo && kq.dangCo.length) ? kq.dangCo.join(', ') : '(chưa có kỳ nào)') + '.';
  return d;
}

/** Chốt tháng được phép ghi: phải đúng tháng của NGÀY CHẠY trên máy chủ Google. */
function chotThang_(thangGui) {
  var nay = thangHienTai_();
  var xin = chuanHoaThang_(thangGui) || nay;
  if (xin < nay) throw new Error('Từ chối ghi lùi: gói dữ liệu ghi cho tháng ' + xin +
    ' nhưng hôm nay đã sang tháng ' + nay + '. Đơn của tháng trước phải do người nhập tay vào file tháng đó.');
  if (xin > nay) throw new Error('Từ chối ghi trước: gói dữ liệu ghi cho tháng ' + xin +
    ' trong khi tháng hiện tại là ' + nay + '. Kiểm tra lại đồng hồ của máy chạy tool.');
  return xin;
}

// ==================================================================== điểm vào Web App

function doGet() {
  return ContentService.createTextOutput(
    'keodon Web App đang chạy. Đây là cổng nhận lệnh, phải gọi bằng POST kèm chuỗi bí mật.');
}

function doPost(e) {
  var batDau = new Date().getTime();
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '{}');
  } catch (err) {
    return traLoi_({ ok: false, loi: 'JSON_HONG', thongBao: 'Gói gửi lên không phải JSON hợp lệ' });
  }
  // Kiểm chuỗi bí mật trong try: chưa cài đặt thì biMatDung_ ném lỗi, để lọt ra ngoài là Apps Script
  // trả về một trang HTML lỗi, phía máy tính chỉ thấy 'không phải JSON' và không biết vì sao.
  try {
    if (!biMatDung_(body.token)) {
      Logger.log('Từ chối một lệnh sai chuỗi bí mật');   // cố ý không in chuỗi nhận được
      return traLoi_({ ok: false, loi: 'SAI_BI_MAT', thongBao: 'Sai chuỗi bí mật' });
    }
  } catch (err) {
    return traLoi_({ ok: false, loi: 'CHUA_CAI_DAT', thongBao: String(err && err.message ? err.message : err) });
  }

  var hd = String(body.hanhDong || '').trim().toLowerCase();
  var mongDoi = body.phienBanMongDoi == null ? '' : String(body.phienBanMongDoi);

  // Lệch bản thì TỪ CHỐI GHI. Chỉ chặn nhánh 'ghi': 'ping' và 'doc' phải chạy được để người ta
  // nhìn thấy con số lệch mà đi triển khai lại, chặn luôn cả hai thì chỉ còn lỗi "không gọi được".
  // Chiều ngược lại (Google đang chạy bản CŨ, chưa có đoạn này) do phía máy tính bắt: nó so
  // `phienBan` trong phản hồi trước khi gửi lệnh ghi — bản cũ không trả trường đó là đủ để dừng.
  if (hd === 'ghi' && mongDoi && mongDoi !== PHIEN_BAN) {
    return traLoi_({ ok: false, loi: 'LECH_PHIEN_BAN', thongBao: thongBaoLechPhienBan_(PHIEN_BAN, mongDoi) });
  }

  try {
    if (hd === 'ping') {
      return traLoi_({
        ok: true, hanhDong: 'ping', thangHienTai: thangHienTai_(),
        daCaiMoNeo: !!thuocTinh_(TT_MO_NEO),
        thoiDiem: Utilities.formatDate(new Date(), MUI_GIO, 'HH:mm:ss dd/MM/yyyy')
      });
    }
    if (hd === 'doc') return traLoi_(hanhDongDoc_(body, batDau));
    if (hd === 'ghi') return traLoi_(hanhDongGhi_(body, batDau));
    return traLoi_({ ok: false, loi: 'HANH_DONG_LA', thongBao: 'hanhDong = "' + hd + '"; chỉ nhận: ping, doc, ghi' });
  } catch (err) {
    return traLoi_({ ok: false, loi: 'NGOAI_LE', thongBao: String(err && err.message ? err.message : err) });
  }
}

// ==================================================================== hành động ĐỌC

/**
 * body: { thang?, sheets?: [tên sheet], cauHinh? }
 * trả:  { ok, thang, fileId, tenFile, sheets: {ten: {dongCuoi, dongDau, cotNote, coTieuDeNote, maDon:{ma:dòng}}},
 *         mapping: {ten, header, dong}, tonKho: {ten, header, dong}, canhBao }
 */
function hanhDongDoc_(body, batDau) {
  var cfg = Config.tao(body.cauHinh || {});
  var thang = chuanHoaThang_(body.thang) || thangHienTai_();
  var f = fileCuaThang_(thang);
  var ss = SpreadsheetApp.openById(f.fileId);
  var k = cfg.keyin;
  var canhBao = [];

  var tenSheets = (body.sheets && body.sheets.length) ? body.sheets
    : Object.keys(cfg.gianHang).map(function (m) { return cfg.gianHang[m].sheet; });

  var sheets = {};
  tenSheets.forEach(function (ten) {
    var sh = ss.getSheetByName(ten);
    if (!sh) { canhBao.push('File tháng ' + thang + ' không có sheet "' + ten + '"'); return; }
    var het = sh.getLastRow();
    var maDon = {}, dongCuoi = k.dong_dau - 1;
    if (het >= k.dong_dau) {
      var cot = sh.getRange(k.dong_dau, k.cot_ma_don, het - k.dong_dau + 1, 1).getDisplayValues();
      for (var i = 0; i < cot.length; i++) {
        var ma = String(cot[i][0] || '').trim();
        if (!ma) continue;
        dongCuoi = k.dong_dau + i;
        if (maDon[ma] == null) maDon[ma] = k.dong_dau + i;
      }
    }
    var cNote = k.cot_note || doCotNote_(sh, k);
    sheets[ten] = {
      dongDau: k.dong_dau, dongCuoi: dongCuoi, soDon: Object.keys(maDon).length,
      cotNote: cNote,
      coTieuDeNote: String(sh.getRange(k.dong_header, cNote).getValue() || '').trim() !== '',
      maDon: maDon
    };
  });

  return {
    ok: true, hanhDong: 'doc', thang: thang, fileId: f.fileId, tenFile: ss.getName(),
    sheets: sheets,
    mapping: docBangMapping_(ss, canhBao),
    tonKho: docTonKho_(ss, cfg, canhBao),
    canhBao: canhBao, giay: (new Date().getTime() - batDau) / 1000
  };
}

/** Cột Note = cột trống đầu tiên bên phải tiêu đề cuối cùng (GV-v2.2 mục 1.4). */
function doCotNote_(sh, k) {
  var het = Math.max(sh.getLastColumn(), k.cot_doanh_thu);
  var tieuDe = sh.getRange(k.dong_header, 1, 1, het).getDisplayValues()[0];
  var cuoi = 0;
  for (var i = 0; i < tieuDe.length; i++) if (String(tieuDe[i] || '').trim()) cuoi = i + 1;
  return cuoi + 1;
}

function docBangMapping_(ss, canhBao) {
  var sh = sheetMapping_(ss);
  if (!sh) {
    canhBao.push('Chưa có sheet "' + TEN_TAB_MAPPING_SHEET + '" (hoặc "' + TEN_SHEET_MAPPING_EXCEL +
      '") trong file tháng này');
    return null;
  }
  return docBangPhu_(sh, 1);
}

function docBangPhu_(sh, dongHeader) {
  var ten = sh.getName();
  var het = sh.getLastRow(), cot = sh.getLastColumn();
  if (het < dongHeader) return { ten: ten, dongHeader: dongHeader, dongDau: dongHeader + 1, header: [], dong: [] };
  var header = sh.getRange(dongHeader, 1, 1, cot).getDisplayValues()[0];
  var dong = het > dongHeader ? sh.getRange(dongHeader + 1, 1, het - dongHeader, cot).getDisplayValues() : [];
  return { ten: ten, dongHeader: dongHeader, dongDau: dongHeader + 1, header: header, dong: dong };
}

function docTonKho_(ss, cfg, canhBao) {
  var dm = cfg.danhMuc;
  var sh = ss.getSheetByName(dm.ten_sheet);
  if (!sh) { canhBao.push('Không có sheet danh mục "' + dm.ten_sheet + '" → không chọn được lô theo tồn'); return null; }
  var het = sh.getLastRow(), cot = sh.getLastColumn();
  if (het < dm.dong_dau) return { ten: dm.ten_sheet, dongHeader: dm.dong_header, dongDau: dm.dong_dau, header: [], dong: [] };
  return {
    ten: dm.ten_sheet, dongHeader: dm.dong_header, dongDau: dm.dong_dau,
    header: sh.getRange(dm.dong_header, 1, 1, cot).getDisplayValues()[0],
    dong: sh.getRange(dm.dong_dau, 1, het - dm.dong_dau + 1, cot).getDisplayValues()
  };
}

// ==================================================================== hành động GHI

/**
 * body: {
 *   thang, lo: {so, tong},
 *   lenh: [ { tenSheet, don: [ { maDon, ngay, tien:{H,I,J,K}, dong:[ {tenVietTat, soLuong, vang, note} ] } ] } ],
 *   mappingThem: [ [12 cột theo SCHEMA.MAPPING] ],
 *   cauHinh?
 * }
 * Quy tắc bất di bất dịch (GV-v2.2 mục 1.5): chỉ nối dòng dưới cùng · chỉ ghi A,C,D,G,H,I,J,K ·
 * KHÔNG bao giờ chạm E,F,M,N · chỉ kéo cột L · gộp ô C,H,I,J,K,L cho đơn nhiều hàng.
 */
function hanhDongGhi_(body, batDau) {
  var cfg = Config.tao(body.cauHinh || {});
  var thang = chotThang_(body.thang);
  var f = fileCuaThang_(thang);

  var lenh = body.lenh || [];
  var tongDon = 0;
  lenh.forEach(function (l) { tongDon += (l.don || []).length; });
  if (tongDon > TOI_DA_DON_MOT_LO)
    throw new Error('Gói có ' + tongDon + ' đơn, quá ' + TOI_DA_DON_MOT_LO +
      ' đơn một lô. Vỏ Node phải chia lô nhỏ hơn.');

  var khoa = LockService.getScriptLock();
  if (!khoa.tryLock(30000)) throw new Error('Một lệnh ghi khác đang chạy, thử lại sau vài giây');

  try {
    var ss = SpreadsheetApp.openById(f.fileId);
    var k = cfg.keyin;
    var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0 };
    var viTri = {}, canhBao = [], thongBao = [];

    lenh.forEach(function (l) {
      var sh = ss.getSheetByName(l.tenSheet);
      if (!sh) {
        canhBao.push('Không có sheet "' + l.tenSheet + '" trong file tháng ' + thang +
          ' → bỏ qua ' + (l.don || []).length + ' đơn');
        return;
      }
      ghiMotSheet_(sh, l.don || [], k, tk, viTri, canhBao, thongBao);
    });

    if (body.mappingThem && body.mappingThem.length)
      tk.mappingThem = themDongMapping_(ss, body.mappingThem, canhBao);

    SpreadsheetApp.flush();
    return {
      ok: true, hanhDong: 'ghi', thang: thang, fileId: f.fileId, tenFile: ss.getName(),
      lo: body.lo || null, thongKe: tk, viTri: viTri, canhBao: canhBao, thongBao: thongBao,
      giay: (new Date().getTime() - batDau) / 1000
    };
  } finally {
    khoa.releaseLock();
  }
}

/**
 * INV-3 chặn ở TẦNG GHI, không dựa vào người viết mã nhớ: một lỗi gõ trong cấu hình cột (ví dụ
 * cot_thue để nhầm thành 'M') là ghi đè ô ARRAYFORMULA đầu cột → hỏng cả cột của cả sheet, im lặng.
 */
function kiemCotDuocGhi_(cot, ten) {
  if (COT_CAM_GHI.indexOf(Number(cot)) >= 0)
    throw new Error('TỪ CHỐI GHI: ' + ten + ' đang trỏ vào cột ' + Utils.chuCot(cot) +
      ' — E, F, M, N là ARRAYFORMULA của chủ shop, ghi một ô là hỏng cả cột. Sửa cấu hình cột rồi chạy lại.');
  return Number(cot);
}

function ghiMotSheet_(sh, donDS, k, tk, viTri, canhBao, thongBao) {
  ['cot_ngay', 'cot_ma_don', 'cot_ten_viet_tat', 'cot_so_luong',
    'cot_tong_tien_sp', 'cot_mgg_shop', 'cot_chi_phi', 'cot_thue'].forEach(function (t) {
      kiemCotDuocGhi_(k[t], 'keyin.' + t);
    });

  // KHỬ TRÙNG TẦNG 2 — đọc lại cột mã đơn NGAY TRƯỚC KHI GHI, và đang ở trong LockService của
  // hanhDongGhi_. Tầng 1 (node/chay-google-sheet.js) khử theo danh sách lấy từ hành động 'doc',
  // nhưng danh sách đó đã cũ vài giây: 2-3 máy nhân viên cùng ghi một file tháng, máy A không thể
  // biết máy B vừa nối gì. Không có tầng 2 thì hai máy bấm cùng lúc là sinh đơn trùng.
  // getDisplayValues đọc được cả mã nằm trong Ô GỘP (ô gộp giữ giá trị ở ô trên cùng) — T-43.
  var het = sh.getLastRow();
  var daCo = {}, dongCuoi = k.dong_dau - 1;
  if (het >= k.dong_dau) {
    var cot = sh.getRange(k.dong_dau, k.cot_ma_don, het - k.dong_dau + 1, 1).getDisplayValues();
    for (var i = 0; i < cot.length; i++) {
      var maCu = String(cot[i][0] || '').trim();
      if (!maCu) continue;
      dongCuoi = k.dong_dau + i;
      if (daCo[maCu] == null) daCo[maCu] = k.dong_dau + i;
    }
  }
  var cNote = k.cot_note || doCotNote_(sh, k);
  var ctL = congThucCotL_(sh, k, dongCuoi);

  // ---- lọc đơn thật sự mới ----
  var moi = [];
  donDS.forEach(function (d) {
    var ma = String(d.maDon || '').trim();
    if (!ma) { canhBao.push('Một đơn không có mã → bỏ qua'); return; }
    if (daCo[ma] != null) {
      tk.donDaCo++;
      if (tk.donDaCo <= 10) thongBao.push('Đơn ' + ma + ' đã có ở "' + sh.getName() + '" dòng ' + daCo[ma] + ' → bỏ qua');
      return;
    }
    daCo[ma] = -1;
    moi.push(d);
  });
  if (!moi.length) return;

  var r0Khoi = dongCuoi + 1;
  var soDongTong = 0;
  moi.forEach(function (d) { soDongTong += Math.max(1, (d.dong || []).length); });

  // A, C, D, G, H, I, J, K — mỗi cột một khối liền mạch. KHÔNG đụng B, E, F, M, N.
  var A = [], C = [], D = [], G = [], H = [], I = [], J = [], K = [];
  var gopO = [], vang = [], ghiChu = [];
  var r = r0Khoi;
  moi.forEach(function (d) {
    var ds = (d.dong && d.dong.length) ? d.dong : [{}];
    var r0 = r;
    var t = d.tien || {};
    for (var i = 0; i < ds.length; i++) {
      A.push([ngayThat_(d.ngay)]);
      C.push([i === 0 ? String(d.maDon) : '']);
      D.push([ds[i].tenVietTat == null ? '' : ds[i].tenVietTat]);
      G.push([ds[i].soLuong == null ? '' : ds[i].soLuong]);
      H.push([i === 0 ? so_(t.H) : '']);
      I.push([i === 0 ? so_(t.I) : '']);
      J.push([i === 0 ? so_(t.J) : '']);
      K.push([i === 0 ? so_(t.K) : '']);
      if (ds[i].vang) { vang.push(r); tk.dongVang++; }
      if (ds[i].note) ghiChu.push({ r: r, text: String(ds[i].note) });
      r++;
    }
    if (ds.length > 1) { gopO.push({ r1: r0, r2: r - 1 }); tk.donGopO++; }
    viTri[d.maDon] = sh.getName() + '!' + r0 + (ds.length > 1 ? '-' + (r - 1) : '');
    tk.donGhi++;
    tk.dongGhi += ds.length;
  });

  // ---- ĐẶT ĐỊNH DẠNG TRƯỚC, GHI GIÁ TRỊ SAU ----
  // Đây là bài học đắt nhất bên dự án chứng quyền: đặt định dạng SAU setValues() thì Sheets đã kịp
  // tự đoán kiểu của ô rồi, đổi định dạng sau không hoàn nguyên được giá trị đã bị đổi kiểu.
  // Bên đó dính đúng chỗ này: chuỗi ngày bị Sheets biến thành Date, điều kiện chống trùng luôn sai,
  // sinh 12 dòng giống hệt cho một mã và 3.145 dòng thừa sau 9 phiên.
  //
  // Cột MÃ ĐƠN ép '@' (văn bản) — đây là KHOÁ chống trùng của keodon. Mã Shopee thường có chữ
  // ('2608028Q4VMUAA') nên trông vô hại, nhưng mã toàn chữ số sẽ bị Sheets đổi thành số và MẤT SỐ 0
  // ĐẦU: '0012345' thành 12345, lần chạy sau đọc lại không khớp mã cũ → ghi trùng đơn.
  var cMa = sh.getRange(r0Khoi, k.cot_ma_don, soDongTong, 1);
  cMa.setNumberFormat('@');
  cMa.setValues(C);

  // Cột NGÀY: cũng đặt định dạng trước, nhưng CỐ Ý KHÔNG dùng '@'.
  // Giá trị ghi xuống là đối tượng Date thật (xem ngayThat_), vì sheet `Lợi nhuận` của chủ shop
  // tính theo ngày; ép '@' là biến ngày thành văn bản và làm hỏng công thức của người ta — thiệt hại
  // lớn hơn hẳn thứ nó chống. Khoá chống trùng của keodon là MÃ ĐƠN chứ không phải ngày, nên rủi ro
  // "chuỗi ngày bị đổi kiểu" của dự án kia không tồn tại ở đây. Đã báo BA chỗ lệch đề bài này.
  var cNgay = sh.getRange(r0Khoi, k.cot_ngay, soDongTong, 1);
  cNgay.setNumberFormat(k.dinh_dang_ngay);
  cNgay.setValues(A);

  sh.getRange(r0Khoi, k.cot_ten_viet_tat, soDongTong, 1).setValues(D);
  sh.getRange(r0Khoi, k.cot_so_luong, soDongTong, 1).setValues(G);
  [[k.cot_tong_tien_sp, H], [k.cot_mgg_shop, I], [k.cot_chi_phi, J], [k.cot_thue, K]].forEach(function (x) {
    var o = sh.getRange(r0Khoi, x[0], soDongTong, 1);
    o.setNumberFormat(k.dinh_dang_tien);
    o.setValues(x[1]);
  });

  // Cột L: CHỈ cột này được kéo. E,F,M,N là ARRAYFORMULA một ô ở dòng tiêu đề — ghi vào là hỏng cả cột.
  if (ctL) {
    var oL = [];
    for (var n = 0; n < soDongTong; n++) oL.push([ctL]);
    sh.getRange(r0Khoi, k.cot_doanh_thu, soDongTong, 1).setFormulasR1C1(oL);
  } else {
    canhBao.push('Sheet "' + sh.getName() + '": không tìm thấy công thức mẫu ở cột ' +
      Utils.chuCot(k.cot_doanh_thu) + ' phía trên → để trống, cần điền tay');
  }

  // Gộp ô C,H,I,J,K,L theo chiều dọc cho đơn nhiều mặt hàng (GV-v2.2 mục 1.2).
  var cotGop = [k.cot_ma_don, k.cot_tong_tien_sp, k.cot_mgg_shop, k.cot_chi_phi, k.cot_thue, k.cot_doanh_thu];
  gopO.forEach(function (g) {
    cotGop.forEach(function (c) { sh.getRange(g.r1, c, g.r2 - g.r1 + 1, 1).mergeVertically(); });
  });

  // Tô vàng CẢ DÒNG + ghi Note (GV-v2.2 mục 1.4). Ghi theo LÔ chứ không từng ô: Apps Script chỉ có
  // 6 phút một lần chạy, mỗi lệnh setBackground riêng lẻ tốn cả phần mười giây, vài trăm dòng là hết giờ.
  var cotCuoi = Math.max(cNote, sh.getLastColumn());
  if (vang.length) {
    var coVang = {};
    vang.forEach(function (rr) { coVang[rr] = 1; });
    var nen = sh.getRange(r0Khoi, 1, soDongTong, cotCuoi).getBackgrounds();
    for (var iv = 0; iv < soDongTong; iv++) {
      if (!coVang[r0Khoi + iv]) continue;
      for (var jv = 0; jv < cotCuoi; jv++) nen[iv][jv] = MAU_VANG;
    }
    sh.getRange(r0Khoi, 1, soDongTong, cotCuoi).setBackgrounds(nen);
  }
  if (ghiChu.length) {
    if (!String(sh.getRange(k.dong_header, cNote).getValue() || '').trim())
      sh.getRange(k.dong_header, cNote).setValue(k.tieu_de_note).setFontWeight('bold');
    var cot = [];
    for (var ic = 0; ic < soDongTong; ic++) cot.push(['']);
    ghiChu.forEach(function (g) { cot[g.r - r0Khoi] = [g.text]; });
    sh.getRange(r0Khoi, cNote, soDongTong, 1).setValues(cot);
  }
}

function so_(x) { var n = Number(x); return isNaN(n) ? '' : n; }

/**
 * Sheet Mapping có thể mang một trong hai tên: `Mapping_san_pham` (tên tab trên Google Sheet, mục 1.3)
 * hoặc `Mapping sản phẩm` (tên sheet trong file .xlsx). Nhận cả hai để hai vỏ không lệch nhau.
 */
function sheetMapping_(ss) {
  return ss.getSheetByName(TEN_TAB_MAPPING_SHEET) || ss.getSheetByName(TEN_SHEET_MAPPING_EXCEL) || null;
}

/**
 * Ngày gửi lên dưới dạng chuỗi 'yyyy-MM-dd' (JSON không có kiểu ngày). Ghi thẳng chuỗi đó vào
 * Google Sheet thì ô thành VĂN BẢN, mọi công thức tính theo ngày ở sheet Lợi nhuận sẽ hỏng.
 * Đổi về Date trước khi ghi; chuỗi lạ thì giữ nguyên để người ta nhìn thấy mà sửa.
 */
function ngayThat_(x) {
  if (x == null || x === '') return '';
  if (x instanceof Date) return x;
  var m = String(x).trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = String(x).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return x;
}

/** Công thức cột L của dòng dữ liệu gần nhất phía trên, dạng R1C1 để dán xuống là tự dịch. */
function congThucCotL_(sh, k, dongCuoi) {
  for (var r = dongCuoi; r >= k.dong_dau; r--) {
    var ct = sh.getRange(r, k.cot_doanh_thu).getFormulaR1C1();
    if (ct) return ct;
  }
  return '';
}

/** Nối tên hàng mới vào cuối sheet Mapping và tô vàng để người ta thấy mà điền. */
function themDongMapping_(ss, dong, canhBao) {
  var sh = sheetMapping_(ss);
  if (!sh) {
    canhBao.push('Chưa có sheet "' + TEN_TAB_MAPPING_SHEET + '" → không ghi được ' + dong.length + ' tên hàng mới');
    return 0;
  }
  var r0 = Math.max(sh.getLastRow() + 1, 2);
  var rong = SCHEMA.MAPPING.length;
  var bang = dong.map(function (d) {
    var h = [];
    for (var i = 0; i < rong; i++) h.push(d[i] == null ? '' : d[i]);
    return h;
  });
  sh.getRange(r0, 1, bang.length, rong).setValues(bang).setBackground(MAU_VANG);
  return bang.length;
}

// ==================================================================== chạy tay để kiểm tra

/**
 * Chạy trong trình soạn thảo để xem bảng link tháng có đọc được không (không ghi gì).
 * Cố ý KHÔNG in id file: log của Apps Script ai xem cũng được, còn id là đường vào file tiền thật.
 */
function thuDinhTuyenThang() {
  var thang = thangHienTai_();
  var f = fileCuaThang_(thang);
  var tin = 'Bản ' + PHIEN_BAN + ' · tháng ' + thang + ' → "' +
    SpreadsheetApp.openById(f.fileId).getName() + '" (dòng ' + f.dong + ')';
  Logger.log(tin);
  return tin;
}

/** Chạy bộ test của lõi ngay trong Apps Script — không đụng dữ liệu thật. */
function chayBoTest() {
  var kq = TestSuite.chayTatCa();
  var hong = kq.filter(function (x) { return !x.dat && !x.boQua; });
  kq.forEach(function (x) {
    Logger.log((x.dat ? 'ĐẠT  ' : x.boQua ? 'BỎ QUA' : 'HỎNG ') + ' ' + x.ma + ' ' + x.ten + (x.loi ? ' -> ' + x.loi : ''));
  });
  return 'Tổng ' + kq.length + ' · hỏng ' + hong.length;
}
