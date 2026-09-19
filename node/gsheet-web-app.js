/**
 * gsheet-web-app.js — PHÍA MÁY TÍNH của lớp ghi Google Sheet (GV-v2.2 mục 1.7, phương án C).
 *
 * Máy tính tính xong thì POST một gói JSON tới Web App Apps Script (`src/ShellAppsScript.gs`).
 * Web App chạy bằng quyền của chủ dự án nên mở được file Sheet của mọi tháng, máy này không cần
 * đăng nhập Google, không giữ khóa dịch vụ, không cần quyền chia sẻ.
 *
 * Năm hành động: `ping` (thử cửa) · `doc` (lấy mã đơn đã có + Mapping + tồn kho) · `ghi` (nối dòng) ·
 * `xuLy` (gửi thẳng bảng dòng đã qua lớp 1, Web App tự làm lớp 2 + lớp 3 + ghi trong một lần gọi) ·
 * `taoThangMoi` (nút 3 chế độ 1 — chuyển sổ sang tháng mới, xem `WebAppGoogleSheet.taoThangMoi`) · và từ 2.7.1 `coTaoThang`
 * (CHỈ ĐỌC cờ tiến độ của file tháng mới — máy hỏi lại sau khi mất đường trả lời của `taoThangMoi`, xem `_goiTaoThang`).
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
 * KHÔNG phải lỗi quyền (2.7.1, sự cố 14/9 23:01): chuỗi chuyển hướng hỏng (`CHUYEN_HUONG_HONG`) và thân RỖNG / chữ lạ không phải
 * trang HTML (`KHONG_PHAI_JSON`) — đó là lỗi ĐƯỜNG TRUYỀN, câu nói rõ vậy kèm đường đi từng nấc.
 *
 * ĐỐI CHIẾU PHIÊN BẢN (GV-v2.3 mục 2.3; YC-42 từ 2.7.0): Google KHÔNG tự đồng bộ mã. Sửa `.gs` mà quên
 * Deploy → Manage deployments → New version thì link /exec vẫn chạy bản cũ, KHÔNG báo lỗi gì. Tới 2.6.1 cửa này đòi hai
 * bên BẰNG NHAU tuyệt đối — lệch chiều nào cũng ngừng ghi, nên mỗi lần lên bản khi đã production là một khoảng chết bắt
 * buộc. Từ 2.7.0 cửa là KHOẢNG TƯƠNG THÍCH: chỉ chặn khi một bên THẬT SỰ dưới mốc (`WEB_APP_TOI_THIEU` ở máy,
 * `MAY_TOI_THIEU` ở Google); lệch trong khoảng thì nhắc một dòng và VẪN CHẠY. "Dán sót file .gs" — lý do gốc dựng cửa —
 * nay do dấu vân tay bản dựng (`BAN_DUNG`) canh khi hai bên cùng số bản. Xem `kiemPhienBan`, `banGuiDi`.
 */
const https = require('https');
const { URL } = require('url');

/**
 * Bản của VỎ MÁY — bằng `version` trong package.json và `var PHIEN_BAN` trong `src/ShellAppsScript.gs` khi phát hành
 * (T-DT-23 canh). Gửi lên Google trong trường `banMay` của mọi gói.
 */
const PHIEN_BAN = '2.8.1';

/**
 * YC-42: bản Web App THẤP NHẤT máy này còn dùng được. Web App dưới mốc → CHẶN trước lô đầu tiên, câu nói rõ bên nào cũ và
 * việc phải làm. Từ mốc trở lên mà khác `PHIEN_BAN` → nhắc một dòng, vẫn chạy. CHỈ nâng mốc khi đổi GIAO THỨC (thêm/đổi
 * trường trong thân POST, đổi tên hành động) — và phải nêu trong báo cáo dev. 2.5.0: mọi cặp 2.5.0…2.7.0 cùng giao thức.
 */
const WEB_APP_TOI_THIEU = '2.5.0';

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

/**
 * Thời gian chờ MỘT lượt gọi thường (`ping`, `doc`, `ghi`, `xuLy` — nút 4): 300 giây (YC-41 việc 6; bản cũ 180).
 *
 * Vì sao 300: đường `xuLy` phía Google tự dừng gọn ở `NGUONG_GIAY_XU_LY` = 240 giây rồi còn phải làm nốt khối đang ghi,
 * `flush` và dựng phản hồi; cộng chuyển hướng 302 thì một lượt đi hết ngưỡng về tới máy mất hơn 4 phút. Chờ 180 giây
 * là máy báo "Web App không trả lời" giữa lúc Google VẪN đang ghi — người bấm tưởng hỏng. (Không mất đơn: file xuất ở
 * nguyên chỗ, lượt sau khử trùng; nhưng câu báo sai nguyên nhân.) 300 = 240 + 60 giây dư, vẫn dưới trần 6 phút của Google.
 * Bài T-WA-32 đọc 240 thẳng từ `src/ShellAppsScript.gs`: ai nâng ngưỡng bên Google mà quên số này là bài đó hỏng.
 */
const TIMEOUT_MS = 300000;

/**
 * Thời gian chờ MỘT lượt `taoThangMoi` (nút 3 chế độ 1) — 400 giây, dài hơn 300 giây của kéo đơn.
 *
 * Vì sao phải riêng: Web App tạo tháng tự dừng gọn ở `TM_NGUONG_GIAY` = 270 giây, và một bước dở được lượt
 * sau chạy TỚI CÙNG không canh giờ (`buocDungTruoc`) — tức một lượt có thể đi sát trần 6 phút của Google.
 * Chờ như kéo đơn thì máy báo "Web App không trả lời" giữa chừng trong khi Google VẪN đang chuyển sổ,
 * người bấm tưởng hỏng rồi bấm lại chồng lên. 400 = 6 phút trần của Google + 40 giây cho chuyển hướng 302.
 */
const TIMEOUT_TAO_THANG_MS = 400000;

/**
 * Số lượt gọi tối đa cho MỘT lần tạo tháng. Sáu bước (B3, B4, B5a, B5b, B6, B7): mỗi lượt sau khi dừng gọn chắc chắn
 * làm xong ít nhất bước vừa dở, nên tối đa ~7 lượt là xong. 20 là trần chống vòng lặp, không phải con số mong đợi.
 */
const SO_LUOT_TAO_THANG_TOI_DA = 20;

/**
 * Số nấc CHUYỂN HƯỚNG tối đa máy đi theo trong MỘT lượt gọi (2.7.1).
 *
 * Vì sao nhiều nấc (sự cố 14/9 23:01, nút 3 chế độ 1): Apps Script trả `POST→302` sang `script.googleusercontent.com`, rồi
 * `GET→200` JSON — đó là đường thường gặp. Nhưng Google có lúc trả thêm một nấc 3xx nữa, hoặc 302 không kèm Location. Bản 2.7.0
 * chỉ đi theo ĐÚNG MỘT nấc 302: nấc thứ hai rơi vào phần đọc thân, `JSON.parse('')` hỏng và máy báo "LỖI QUYỀN TRUY CẬP" — sai
 * nguyên nhân (nút 4 cùng Web App năm phút sau vẫn chạy tốt), người bấm đi kiểm quyền trong khi Google đã chạy xong.
 * 5 nấc dư cho mọi chuỗi Google thật từng trả; quá 5 là chuỗi vòng — dừng với `CHUYEN_HUONG_HONG`, không quay mãi.
 */
const SO_NAC_CHUYEN_HUONG_TOI_DA = 5;

/** Mã HTTP chuyển hướng máy đi theo (có Location). Mọi nấc sau nấc đầu đi bằng GET, như Apps Script đòi. */
const MA_CHUYEN_HUONG = [301, 302, 303, 307, 308];

/** Thời gian chờ MỖI nấc của lượt đọc lại cờ `coTaoThang` — hành động chỉ đọc hai ô, không cần chờ như lượt tạo tháng. */
const TIMEOUT_DOC_CO_MS = 90000;

/**
 * Cờ `DA_KHOI_TAO_<giờ>` ghi TRƯỚC lúc máy bắt đầu lần tạo tháng này quá ngần ấy thì KHÔNG phải do lần này ghi. 15 phút dư cho
 * đồng hồ máy lệch đồng hồ Google; lệch hơn thế thì máy chỉ bảo chạy lại chế độ 1 — hướng AN TOÀN (xem `ketLuanSauLoiDuongTruyen`).
 */
const DUNG_SAI_GIO_CO_MS = 15 * 60 * 1000;

/**
 * Địa chỉ của nấc sau từ tiêu đề Location. Tuyệt đối (`https://…`) → dùng NGUYÊN chuỗi: không qua `new URL().toString()`, vì
 * chuẩn hóa có thể đổi mã hóa ký tự trong khóa phiên của Google. Tương đối (`/…`, `//…`) → ghép với máy chủ của nấc vừa trả.
 * Giao thức khác https (`http:`, `javascript:`…) hoặc không đọc được → '' (không đi).
 */
function diaChiNacSau(location, diaChiHienTai) {
  const s = String(location == null ? '' : location).trim();
  if (!s) return '';
  if (/^https:\/\//i.test(s)) return s;
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return '';
  try {
    const goc = new URL(diaChiHienTai);
    if (s.indexOf('//') === 0) return 'https:' + s;
    if (s.charAt(0) === '/') return 'https://' + goc.host + s;
    return new URL(s, goc).href;
  } catch (e) { return ''; }
}

/** Chỉ TÊN MÁY CHỦ của một địa chỉ — đường đi ghi vào nhật ký không bao giờ mang path/query (khóa phiên của Google, INV-7). */
function tenMayChu(diaChi) {
  try { return new URL(String(diaChi)).hostname || '(không rõ máy chủ)'; } catch (e) { return '(địa chỉ không đọc được)'; }
}

/** Mảng đường đi → một dòng người đọc được. */
function moTaDuongDi(ds) {
  const x = Array.isArray(ds) ? ds.filter(Boolean) : [];
  return x.length ? x.join(' · ') : '(chưa nhận phản hồi nào)';
}

/**
 * Mã từ chối NGHIỆP VỤ của `taoThangMoi` — Web App đã xét hai file và nói KHÔNG, kèm lý do. `taoThangMoi()` trả các ca
 * này về như một kết quả (`ok:false`) để nút 3 in bảng R/K và nguyên nhân; mọi mã khác (sai chuỗi, lệch bản, quyền,
 * hành động lạ, ngoại lệ) vẫn là LỖI ném ra như mọi hành động khác.
 */
const MA_TU_CHOI_TAO_THANG = ['DA_KHOI_TAO', 'FILE_CO_DU_LIEU', 'B5_DANG_LAM', 'TU_KIEM_LECH', 'TRUNG_FILE',
  'THAM_SO_SAI', 'SAI_THANG_FILE', 'DANG_BAN', 'THIEU_SHEET', 'KHUON_TIKTOK_LA'];

/**
 * Việc phải làm cho từng mã của `taoThangMoi`. Viết cho người bấm nút 3, không cho người đọc mã: câu nào cũng
 * nói (1) file tháng mới đang ra sao, (2) link tháng có được khai không, (3) bấm gì tiếp.
 */
const GOI_Y_TAO_THANG = {
  DA_KHOI_TAO: ' → File tháng mới ĐÃ được khởi tạo từ trước, tool không bao giờ khởi tạo lại (Phụ lục A.3). ' +
    'Nếu đó đúng là sổ tháng mới đã làm xong — ở máy khác, hoặc lượt trước đã xong mà mạng rớt — bấm lại nút 3 và ' +
    'chọn CHẾ ĐỘ 2 để khai link. Nếu sổ đó hỏng: xóa bản sao, tạo bản sao mới từ sổ tháng trước rồi chạy lại chế độ 1.',
  FILE_CO_DU_LIEU: ' → File tháng mới KHÁC sổ tháng trước ở đúng phép R-… nêu trên (có dữ liệu gõ thêm, hoặc thiếu/đổi tên ' +
    'sheet), tool không khởi tạo để khỏi xóa mất số liệu. Kiểm lại cả hai link [3/7] và [6/7] — mọi phép R so file mới với ' +
    'file [3/7]. Đúng file thì tạo bản sao MỚI từ sổ tháng trước rồi chạy lại.',
  // YC-43 điểm 4: không bắt người bấm đi đọc ô D5 rồi sửa cờ tay giữa lúc đầu tháng — bản sao kẹt ở đây là bỏ.
  B5_DANG_LAM: ' → Lượt trước dừng ĐÚNG lúc đang chèn cột `Lợi nhuận` — bước duy nhất không chạy lại được, nên tool KHÔNG ' +
    'chạy tiếp trên file này. Xóa bản sao đó trên Google Drive, tạo bản sao MỚI từ sổ tháng trước (Tệp → Tạo bản sao, đổi tên), ' +
    'rồi bấm lại nút 3 chế độ 1 với link bản sao mới. link_thang CHƯA được khai.',
  TU_KIEM_LECH: ' → Tool GIỮ cờ DANG_KHOI_TAO trên file tháng mới và KHÔNG khai link. Đừng dùng file đó để kéo đơn; ' +
    'gửi nhật ký cho người phụ trách kiểm.',
  TRUNG_FILE: ' → Link [3/7] và [6/7] là CÙNG MỘT file. Tháng mới phải là bản sao riêng: Tệp → Tạo bản sao, đổi tên, ' +
    'lấy link của bản sao.',
  THAM_SO_SAI: ' → Kiểm lại tháng/năm vừa gõ rồi bấm lại nút 3.',
  SAI_THANG_FILE: ' → Đổi tên file đó trên Google theo mẫu THÁNG-10-2026-KINH-DOANH (bản sao mới tạo mang tên "Bản sao của …"), ' +
    'hoặc kiểm lại link của trường vừa nêu, rồi chạy lại CHẾ ĐỘ 1. ĐỪNG chọn chế độ 2: sổ đó chưa được chuyển sang tháng mới.',
  DANG_BAN: ' → Một máy khác đang kéo đơn hoặc tạo tháng trên Web App. Đợi vài phút rồi bấm lại nút 3 — tool chưa ghi ô nào.',
  THIEU_SHEET: ' → File tháng mới thiếu một sheet của sổ tháng trước. Đừng đổi tên hay xóa sheet của bản sao; tạo bản sao ' +
    'mới rồi chạy lại.',
  // Đợt 4 P-9: dọn `TikTok Shop` theo khuôn đoán sai là gieo công thức vào cột của người — tool dừng khi chưa ghi gì.
  KHUON_TIKTOK_LA: ' → Tiêu đề dòng 2 của sheet `TikTok Shop` không khớp khuôn nào tool biết, nên tool KHÔNG dọn sổ này — chưa ghi ô ' +
    'nào, link_thang CHƯA được khai. Đừng tự sửa tiêu đề: chụp màn hình dòng 1–3 của sheet đó gửi người phụ trách.',
  VI_PHAM_INV2: ' → Lỗi lập trình (lõi xin tạo sheet lạ) — tool đã dừng. Gửi nhật ký cho người phụ trách.',
  THAO_TAC_LA: ' → Lỗi lập trình (máy và Web App lệch bản lõi) — tool đã dừng. Gửi nhật ký cho người phụ trách.'
};

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

/**
 * 2.7.2 — ĐỒNG HỒ VIỆT NAM để IN/ĐẶT TÊN (nhật ký, tiêu đề, nhãn file đã xử lý): trả một Date mà các hàm giờ ĐỊA PHƯƠNG
 * (`getHours`, `Utils.dinhDangNgayGio`, `Utils.nhanThoiDiem`) đọc ra đúng giờ Việt Nam dù Windows đặt múi giờ nào.
 * CHỈ dùng để hiển thị — không gửi thời điểm này đi đâu và không tính tháng từ nó (tháng: `thangHienTaiMay`).
 */
function dongHoVN(thoiDiem) {
  const u = new Date((thoiDiem ? new Date(thoiDiem) : new Date()).getTime() + LECH_GIO_VN_MS);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes(), u.getUTCSeconds());
}

function thangHienTaiMay(thoiDiem) {
  const x = phanNgayVN(thoiDiem);
  return x.nam + '-' + haiSo(x.thang);
}

// ==================================================================== CỬA PHIÊN BẢN (YC-42)

/** '2.6.1' → [2, 6, 1]. Không đọc được (rỗng, chữ, '2') → null. */
function soBan(s) {
  const t = String(s == null ? '' : s).trim();
  if (!/^\d+(\.\d+)+$/.test(t)) return null;
  return t.split('.').map(Number);
}

/** So hai số bản: -1 · 0 · 1. Một bên không đọc được → null (phía gọi coi là "không rõ", không đoán). */
function soSanhBan(a, b) {
  const x = soBan(a), y = soBan(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] || 0, q = y[i] || 0;
    if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}

/** Câu CHẶN khi Web App dưới mốc — viết cho người không rành máy: bên nào cũ, việc phải làm, tool chưa ghi gì. */
function thongBaoGoogleQuaCu(banWebApp, toiThieu) {
  return 'BẢN TRÊN GOOGLE QUÁ CŨ — Web App đang chạy bản ' + banWebApp + ', máy này cần Web App từ bản ' + toiThieu +
    ' trở lên. Tool CHƯA ghi gì. Việc phải làm: báo chủ dự án mở Apps Script, dán mã mới rồi Deploy → Manage deployments → ' +
    'New version; xong thì bấm lại.';
}

/** Câu CHẶN khi máy dưới mốc. Bản Apps Script (`thongBaoMayQuaCu_`) phải giống hệt từng chữ — Google gửi câu đó xuống. */
function thongBaoMayQuaCu(banMay, toiThieu) {
  return 'MÁY NÀY ĐANG CHẠY BẢN QUÁ CŨ — máy là bản ' + banMay + ', Web App trên Google chỉ còn phục vụ máy từ bản ' + toiThieu +
    ' trở lên. Tool CHƯA ghi gì. Việc phải làm: bấm 2_CAP_NHAT.bat, đợi báo cập nhật xong, rồi bấm lại.';
}

/** Dòng NHẮC (không chặn) khi hai bên khác bản trong khoảng tương thích: nói bên nào cũ hơn và việc nên làm khi tiện. */
function cauNhacLechBan(banWebApp, banMay) {
  const googleCuHon = soSanhBan(banWebApp, banMay) < 0;
  return 'Nhắc: máy đang chạy bản ' + banMay + ', Web App trên Google bản ' + banWebApp + ' — hai bản vẫn dùng chung được nên ' +
    'tool VẪN GHI bình thường. ' + (googleCuHon
    ? 'Khi tiện, chủ dự án Deploy bản mới trên Apps Script cho hai bên cùng bản.'
    : 'Khi tiện, bấm 2_CAP_NHAT.bat trên máy này cho hai bên cùng bản.');
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
 * Cổng chặn ghi theo KHOẢNG TƯƠNG THÍCH (YC-42) — HÀM THUẦN, kiểm được không cần mạng.
 *
 * CHẶN (ném, `maKeodon` = `LECH_PHIEN_BAN`) khi: Web App không báo số bản / số bản không đọc được — bản rất cũ, ca nguy hiểm
 * nhất, không được coi là "chắc là ok"; Web App dưới `WEB_APP_TOI_THIEU`; hoặc Web App báo `mayToiThieu` cao hơn bản máy.
 * Còn lại KHÔNG chặn: trả `{ khop, nhac }` — `nhac` là một dòng cho người vận hành khi hai bên khác bản.
 *
 * @param {string} banWebApp   bản thật của Web App (`banWebApp` từ 2.7.0, `phienBan` ở bản cũ hơn)
 * @param {Object} [tuyChon]   { banMay, webAppToiThieu, mayToiThieu } — mặc định hằng của máy này
 */
function kiemPhienBan(banWebApp, tuyChon) {
  const t = tuyChon || {};
  const banMay = t.banMay || PHIEN_BAN;
  const toiThieu = t.webAppToiThieu || WEB_APP_TOI_THIEU;
  const thuc = String(banWebApp == null ? '' : banWebApp).trim();
  const hong = (cau) => { const e = new Error(cau); e.maKeodon = 'LECH_PHIEN_BAN'; return e; };
  const ss = soSanhBan(thuc, toiThieu);
  if (ss === null || ss < 0) throw hong(thongBaoGoogleQuaCu(thuc || '(không rõ — bản rất cũ, chưa báo số bản)', toiThieu));
  if (t.mayToiThieu != null && String(t.mayToiThieu).trim() !== '') {
    const sm = soSanhBan(banMay, t.mayToiThieu);
    if (sm === null || sm < 0) throw hong(thongBaoMayQuaCu(banMay, String(t.mayToiThieu).trim()));
  }
  const khop = soSanhBan(thuc, banMay) === 0;
  return { khop: khop, nhac: khop ? null : cauNhacLechBan(thuc, banMay) };
}

// ==================================================================== LINK THÁNG TRÊN MÁY (D-42)

/** Câu chuẩn D-42 (02_GIAO_VIEC_DEV.md YC-31 điểm 2) khi cấu hình chưa có link của tháng đang chạy. */
function cauThieuLinkThang(thang) {
  return 'CHƯA CÓ LINK FILE THÁNG ' + thang + ' trong CAU_HINH_VAN_HANH.json — bấm 3_TAO_FILE_THANG_MOI.bat ' +
    'để khai báo (chế độ 2) hoặc chuyển sổ (chế độ 1). Tool không ghi gì.';
}

/**
 * Link file Google Sheet → nhóm 1 là ID (≥ 20 ký tự). Nhận CẢ dạng `…/spreadsheets/u/<số>/d/<ID>…` (YC-41 việc 1):
 * trình duyệt đăng nhập nhiều tài khoản Google thì thanh địa chỉ hiện đúng dạng đó, tức là dạng user copy ra NHIỀU
 * HƠN CẢ. Bản cũ chỉ nhận `/spreadsheets/d/` nên từ chối oan link thật: nút 3 báo sai ba lượt rồi thoát, nút 4 báo
 * "không phải link Google Sheet" — sai nguyên nhân. Mọi mẫu nhận hay CHE link trong mã phải có nhánh `(?:u\/\d+\/)?`
 * (bài T-DT-49 quét).
 */
const RE_LINK_SHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/;

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
      '(phải dạng https://docs.google.com/spreadsheets/d/<ID> hoặc …/spreadsheets/u/0/d/<ID>). Sửa dòng đó bằng Notepad, hoặc bấm ' +
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
    this.phienBanWebApp = null;      // bản THẬT của Web App, điền từ phản hồi đầu tiên; null = chưa nói chuyện lần nào
    this.webAppBietKhoang = false;   // YC-42: Web App từ 2.7.0 trả `banWebApp` + `mayToiThieu`; bản cũ hơn chỉ trả `phienBan`
    this.mayToiThieuWebApp = null;   // bản máy thấp nhất Web App còn phục vụ (null = Web App cũ, không báo)
    this.banDungWebApp = null;       // dấu vân tay bản dựng Google trả về (YC-38.3: in vào dòng RUN)
    this.canhBaoBanDung = [];        // câu cảnh báo lệch dấu vân tay bản dựng, điền sau lượt ping
    this.cheThemDs = [];             // link/ID không nằm trong link_thang (nút 3 vừa gõ) — `chePhu` che luôn
    this.duongDiCuoi = [];           // 2.7.1: đường đi của lượt gọi gần nhất — `POST→302 (có Location → <máy chủ>)` · `GET→200`
    this.nhatKyDuongTruyen = [];     // 2.7.1: đường đi từng lượt của lần `taoThangMoi` gần nhất — nút 3 in ra và ghi nhật ký
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
  /**
   * Đăng ký thêm một link hay ID phải che — dùng cho link nút 3 vừa gõ, chưa nằm trong `link_thang`. Chuỗi quá ngắn
   * (dưới 20 ký tự) bỏ qua: che một chuỗi ngắn là xóa bừa chữ trong câu báo lỗi.
   */
  cheThem(x) {
    const s = String(x == null ? '' : x).trim();
    if (s.length < 20 || this.cheThemDs.indexOf(s) >= 0) return;
    this.cheThemDs.push(s);
    const m = s.match(RE_LINK_SHEET);
    if (m && this.cheThemDs.indexOf(m[1]) < 0) this.cheThemDs.push(m[1]);
    // Link dài che TRƯỚC ID nằm trong nó, không thì còn trơ lại đuôi `/edit#gid=…` ghép với nhãn ID.
    this.cheThemDs.sort((a, b) => b.length - a.length);
  }

  chePhu(text) {
    let s = String(text == null ? '' : text);
    // Chuỗi bí mật che TRƯỚC hết: nó có thể nằm lẫn trong thân gói mà câu lỗi trích lại.
    if (this.biMat) s = s.split(this.biMat).join('***');
    if (this.url) s = s.split(this.url).join('<link Web App>');
    if (this.spreadsheetId) s = s.split(this.spreadsheetId).join('<ID file tháng>');
    this.cheThemDs.forEach((x) => { s = s.split(x).join(RE_LINK_SHEET.test(x) ? '<link file tháng>' : '<ID file tháng>'); });
    Object.keys(this.linkThang || {}).forEach((k) => {
      const l = String(this.linkThang[k] || '').trim();
      if (l) s = s.split(l).join('<link tháng ' + k + '>');
      const m = l.match(RE_LINK_SHEET);
      if (m) s = s.split(m[1]).join('<ID file tháng>');
    });
    return s
      .replace(/"token"\s*:\s*"[^"]*"/g, '"token":"***"')
      .replace(/https:\/\/script\.google(usercontent)?\.com\/[^\s"']*/g, '<link Web App>')
      .replace(/https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/[a-zA-Z0-9_-]+[^\s"']*/g, '<link file tháng>')
      .replace(/"spreadsheetId"\s*:\s*"[^"]*"/g, '"spreadsheetId":"<ID>"');
  }

  /**
   * Gửi một gói JSON và trả về đối tượng đã phân tích. Ném lỗi với thông báo đã che bí mật.
   * @param {Object} [tuyChon] `traVeKhiTuChoi: true` — CHỈ `taoThangMoi` dùng: Web App từ chối với mã nằm trong
   *   `MA_TU_CHOI_TAO_THANG` thì TRẢ VỀ phản hồi (kèm `goiY`) thay vì ném, để nút 3 in được bảng R/K. Lỗi lệch bản,
   *   lỗi quyền, sai chuỗi bí mật vẫn ném như cũ.
   *   `choMs` — thời gian chờ MỖI nấc của lượt này (POST và từng GET chuyển hướng), đè mặc định theo hành động. Chỉ lượt đọc cờ
   *   `coTaoThang` dùng (`TIMEOUT_DOC_CO_MS`).
   *   `boiCanh: 'taoThang'` — lượt `ping` chốt phiên bản mở đầu nút 3 (câu lỗi nói "chưa gửi lệnh tạo tháng nào").
   *
   * CHUYỂN HƯỚNG NHIỀU NẤC (2.7.1): 301/302/303/307/308 có Location → GET nấc sau, tối đa `SO_NAC_CHUYEN_HUONG_TOI_DA` nấc. Mỗi
   * phản hồi ghi một mục vào `this.duongDiCuoi` — `POST→302 (có Location → script.googleusercontent.com)`, `GET→302 (KHÔNG có
   * Location)`, `GET→200` — CHỈ tên máy chủ, không path/query.
   *
   * LỖI ĐƯỜNG TRUYỀN (2.7.1): lỗi mạng / hết giờ / đứt, chuyển hướng hỏng (`CHUYEN_HUONG_HONG`), thân không phải JSON mà cũng không
   * phải trang HTML (`KHONG_PHAI_JSON`), HTTP ≥ 500 → lỗi mang `loiDuongTruyen = true`, `cauGoc` (phần mô tả, không kèm việc phải
   * làm — `taoThangMoi` ghép kết luận riêng sau khi đọc lại cờ) và `duongDi`. Không ca nào trong số đó là lỗi quyền.
   */
  _goi(body, tuyChon) {
    const tc = tuyChon || {};
    // Đường đi của lượt này — gán NGAY để lượt nào ném sớm (PII, thiếu link tháng) cũng không để lại đường đi của lượt trước.
    const duongDi = [];
    this.duongDiCuoi = duongDi;
    // Soát PII trên TỪNG LÔ, ngay trước khi gói thành chuỗi — không phải một lần lúc dựng kế hoạch.
    // Lô cuối mới dính dữ liệu bẩn là ca hoàn toàn có thật (một file xuất lạ trong lượt nhiều file).
    const hd = String(body && body.hanhDong || '').toLowerCase();
    const laTaoThang = hd === 'taothangmoi';
    const choMs = laTaoThang ? TIMEOUT_TAO_THANG_MS : TIMEOUT_MS;
    if (hd === 'ghi' || hd === 'xuly') kiemPII(body, this.cotPII);
    const goi = Object.assign({ token: this.biMat, phienBanMongDoi: this.banGuiDi(), banMay: PHIEN_BAN }, body);
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(than) }
    };
    // Lượt `ping` chốt phiên bản MỞ ĐẦU một lần tạo tháng: hỏng ở đây thì chưa lệnh tạo tháng nào rời máy.
    const pingTaoThang = hd === 'ping' && tc.boiCanh === 'taoThang';
    let soNac = 0, nacDangCho = 'POST', daGhiDut = false;
    /** Gắn dấu LỖI ĐƯỜNG TRUYỀN: `taoThangMoi` thấy dấu này thì đọc lại cờ trước khi kết luận (xem `_goiTaoThang`). */
    const danhDau = (e, cauGoc) => { e.loiDuongTruyen = true; e.cauGoc = cauGoc; e.duongDi = duongDi.slice(); return e; };
    // Việc phải làm sau một lỗi đường truyền mà KHÔNG phải mất mạng (chuyển hướng hỏng, thân rỗng). Không nói "kiểm tra mạng":
    // mạng vẫn thông, Google trả lời được — chỉ là trả sai hình dạng. Lặp lại thì dòng đường đi là manh mối cho người phụ trách.
    const viecDuongTruyen = pingTaoThang
      ? 'Tool CHƯA gửi lệnh tạo tháng nào — file tháng mới chưa bị đụng, link_thang không đổi. Đợi vài phút rồi bấm lại nút 3; ' +
        'lặp lại thì chụp màn hình (có dòng đường đi) gửi người phụ trách.'
      : laTaoThang
        ? 'Chưa biết Google đã chuyển sổ tới đâu; link_thang CHƯA được khai. Đợi 5 phút rồi bấm lại nút 3 chế độ 1 với đúng bảy ' +
          'giá trị — tool chạy tiếp từ bước đã xong.'
        : hd === 'cotaothang'
          ? 'Lượt đọc cờ tiến độ không ghi gì.'
          : 'Gói này CHƯA GHI ĐƯỢC, hoặc chưa biết đã ghi hay chưa. Đợi vài phút rồi chạy lại tool: phần đã ghi vẫn giữ nguyên và ' +
            'sẽ không bị ghi trùng. Lặp lại nhiều lần thì chụp màn hình (có dòng đường đi) gửi người phụ trách.';
    // Mất mạng giữa chừng (bài D-12). Câu báo phải nói được ba điều, vì đây là lúc người vận hành
    // hoang mang nhất: chuyện gì xảy ra, dữ liệu có sao không, và bấm gì tiếp.
    // Cố ý KHÔNG khẳng định "chưa ghi gì": Apps Script có thể đã ghi xong rồi mới rớt phản hồi
    // (đo được ở bài T-WA-05: 0 lên 9 dòng trong khi máy vẫn báo lỗi). Nói chắc là nói sai.
    // Tạo tháng có câu riêng: "không bị ghi trùng" là chuyện của kéo đơn; ở đây điều người bấm cần biết là
    // file tháng mới có thể đã dở dang, link CHƯA khai, và bấm lại thì tool tự chạy tiếp từ cờ tiến độ.
    const loiMang = (e) => {
      const lyDo = this.chePhu(e && e.message);
      // Một lượt đứt có thể báo hai lần (lỗi của `req` rồi `close` của phản hồi) — đường đi chỉ ghi lần đầu.
      if (!daGhiDut) { daGhiDut = true; duongDi.push(nacDangCho + '→đứt (' + lyDo + ')'); }
      const cauGoc = 'Không gọi được Web App (' + lyDo + ').';
      return danhDau(new Error(cauGoc + ' ' +
        (pingTaoThang
          ? 'Tool CHƯA gửi lệnh tạo tháng nào — file tháng mới chưa bị đụng, link_thang không đổi. Kiểm tra mạng rồi bấm lại nút 3.'
          : laTaoThang
            ? 'Chưa biết Google đã chuyển sổ tới đâu. link_thang CHƯA được khai. Kiểm tra mạng rồi bấm lại nút 3 chế độ 1 ' +
              'với đúng bảy giá trị: tool chạy tiếp từ bước đã xong; nếu nó báo [DA_KHOI_TAO] thì chọn chế độ 2 để khai link.'
            : 'Gói này CHƯA GHI ĐƯỢC, hoặc chưa biết đã ghi hay chưa. Kiểm tra mạng rồi chạy lại tool: ' +
              'phần đã ghi vẫn giữ nguyên và sẽ không bị ghi trùng.')), cauGoc);
    };
    // Chuỗi chuyển hướng hỏng: 3xx không có Location, quá trần nấc, hoặc Location không đi được. TUYỆT ĐỐI không gọi `loiQuyen`:
    // đúng câu gọi nhầm này làm người bấm nút 3 ngày 14/9 23:01 đi kiểm quyền trong khi Google đã chạy.
    const loiChuyenHuong = (maCuoi, lyDo) => {
      const cauGoc = 'Google chuyển hướng ' + soNac + ' nấc mà không về JSON (nấc cuối HTTP ' + maCuoi + ', ' + lyDo + '). ' +
        'Đây là lỗi ĐƯỜNG TRUYỀN, KHÔNG phải lỗi quyền truy cập. Đường đi: ' + moTaDuongDi(duongDi) + '.';
      const e = danhDau(new Error(cauGoc + ' ' + viecDuongTruyen), cauGoc);
      e.maKeodon = 'CHUYEN_HUONG_HONG';
      e.maHttp = maCuoi;
      return e;
    };
    // Thân rỗng hay chữ lạ mà KHÔNG phải trang HTML/đăng nhập — cũng là đường truyền, không phải quyền.
    const loiKhongPhaiJson = (maHttp, buf) => {
      const rong = String(buf == null ? '' : buf).trim() === '';
      const cauGoc = 'Web App trả về ' + (rong ? 'thân rỗng' : 'thân không phải JSON') + ' (HTTP ' + maHttp + ')' +
        (rong ? '' : ': "' + this.chePhu(buf).replace(/\s+/g, ' ').slice(0, 160) + '"') +
        ' — lỗi ĐƯỜNG TRUYỀN, KHÔNG phải lỗi quyền truy cập. Đường đi: ' + moTaDuongDi(duongDi) + '.';
      const e = danhDau(new Error(cauGoc + ' ' + viecDuongTruyen), cauGoc);
      e.maKeodon = 'KHONG_PHAI_JSON';
      e.maHttp = maHttp;
      return e;
    };
    // `choMs` của lượt này: tùy chọn `choMs` (lượt đọc cờ) đè mặc định theo hành động ở trên. Tham số CỐ Ý cùng tên — mọi nấc
    // bên dưới (POST lẫn từng GET) chờ đúng một số, và câu "không trả lời sau N giây" nói đúng số đã chờ.
    const guiDi = (choMs) => new Promise((giaiQuyet, tuChoi) => {
      opt.timeout = choMs;
      let diaChiHienTai = this.url;
      // Một phản hồi tới. 3xx: đi theo Location bằng GET (Apps Script đòi GET từ nấc thứ hai), hoặc dừng CHUYEN_HUONG_HONG.
      // Còn lại: đọc thân.
      const nhanPhanHoi = (res, kieu) => {
        const ma = res.statusCode;
        if (MA_CHUYEN_HUONG.indexOf(ma) >= 0) {
          soNac++;
          res.resume();
          const location = String((res.headers && res.headers.location) || '').trim();
          const diaChi = location ? diaChiNacSau(location, diaChiHienTai) : '';
          duongDi.push(kieu + '→' + ma + (location
            ? ' (có Location → ' + tenMayChu(diaChi || location) + ')'
            : ' (KHÔNG có Location)'));
          if (!location) return tuChoi(loiChuyenHuong(ma, 'không có địa chỉ Location'));
          if (soNac > SO_NAC_CHUYEN_HUONG_TOI_DA) {
            return tuChoi(loiChuyenHuong(ma, 'máy chỉ đi theo tối đa ' + SO_NAC_CHUYEN_HUONG_TOI_DA + ' nấc chuyển hướng'));
          }
          if (!diaChi) return tuChoi(loiChuyenHuong(ma, 'địa chỉ Location không đi được — không phải https'));
          nacDangCho = 'GET';
          daGhiDut = false;
          diaChiHienTai = diaChi;
          let g;
          // Tùy chọn `timeout` của Node CHỈ phát sự kiện, không tự hủy: không có trình nghe thì lượt GET treo mãi
          // khi mạng đứng ngay lúc chuyển hướng — đúng lúc Google đã làm xong việc và câu hướng dẫn quan trọng nhất.
          try {
            g = https.get(diaChi, { timeout: choMs }, (r2) => nhanPhanHoi(r2, 'GET'));
          } catch (eg) {
            return tuChoi(loiChuyenHuong(ma, 'địa chỉ Location không đi được'));
          }
          g.on('timeout', () => { g.destroy(new Error('Web App không trả lời sau ' + (choMs / 1000) + ' giây')); });
          g.on('error', (e) => tuChoi(loiMang(e)));
          return;
        }
        duongDi.push(kieu + '→' + ma);
        docHet(res);
      };
      const req = https.request(opt, (res) => nhanPhanHoi(res, 'POST'));
      req.on('timeout', () => { req.destroy(new Error('Web App không trả lời sau ' + (choMs / 1000) + ' giây')); });
      req.on('error', (e) => tuChoi(loiMang(e)));
      req.write(than);
      req.end();

      const docHet = (res) => {
        let buf = '';
        let daHet = false;
        res.setEncoding('utf8');
        res.on('data', (d) => { buf += d; });
        // Phản hồi bị cắt SAU tiêu đề, TRƯỚC khi hết thân: Node chỉ phát 'aborted'/'close', không 'end' — không nghe
        // thì lời hứa không bao giờ xong, nút 3 treo ở "ĐỪNG đóng cửa sổ". Chờ một nhịp để lỗi của `req` (nếu có) nói trước.
        res.on('error', (e) => tuChoi(loiMang(e)));
        res.on('close', () => setImmediate(() => { if (!daHet) tuChoi(loiMang(new Error('Web App ngắt kết nối giữa lúc trả lời'))); }));
        res.on('end', () => {
          daHet = true;
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
            // 2.7.1: HTTP ≥ 500 là Google trả lời hỏng giữa đường — đánh dấu đường truyền để nút 3 đọc lại cờ trước khi kết luận.
            const laLoiGoogle = res.statusCode >= 500;
            if (laTaoThang) {
              // "Chia nhỏ file thả vào" và "tool chưa ghi gì" đều SAI với tạo tháng: không có file nào để chia, và
              // Google có thể đã làm xong vài bước. Cờ BUOC_DA_XONG giữ tiến độ nên việc đúng là bấm lại.
              const moTa = 'Web App trả mã ' + res.statusCode + ' giữa lúc tạo tháng ' + (body.thang || '') + '. ' +
                (quaGio
                  ? 'Nguyên nhân: một bước chạy quá 6 phút, Google cắt ngang. '
                  : 'Lỗi phía Apps Script, không phải lỗi cấu hình máy này. ');
              const eTm = new Error(moTa +
                'File tháng mới có thể đã làm được vài bước; link_thang CHƯA được khai. Việc phải làm: bấm lại nút 3 ' +
                'chế độ 1 với đúng bảy giá trị — tool chạy tiếp từ bước đã xong (báo B5_DANG_LAM thì làm theo câu hướng dẫn ' +
                'của nó). Nội dung Google trả về: ' + noiDung.slice(0, 300));
              return tuChoi(laLoiGoogle
                ? danhDau(eTm, moTa + 'Nội dung Google trả về: ' + noiDung.replace(/\s+/g, ' ').slice(0, 160) + '.')
                : eTm);
            }
            const eKd = new Error('Web App trả mã ' + res.statusCode +
              ' (lỗi phía Apps Script, không phải lỗi cấu hình máy này). ' +
              (quaGio
                ? 'Nguyên nhân: gói chạy quá 6 phút. Việc phải làm: chia nhỏ file thả vào rồi chạy lại. '
                : 'Việc phải làm: chạy lại sau vài phút; vẫn lỗi thì mở dự án Apps Script xem mục Executions ' +
                  'và báo người phụ trách. ') +
              'Tool chưa ghi gì trong lượt này. Nội dung Google trả về: ' + noiDung.slice(0, 300));
            // Câu này là câu của NÚT 4 — nguyên nhân và việc phải làm dính liền nhau ("gói quá 6 phút → chia nhỏ file"), không tách
            // được phần mô tả. `cauGoc` giữ TRỌN câu: nhánh tạo tháng ở trên mà hỏng thì câu kéo đơn lọt tới nút 3 phải lộ ra ngay.
            return tuChoi(laLoiGoogle ? danhDau(eKd, eKd.message) : eKd);
          }
          let kq;
          try { kq = JSON.parse(buf); } catch (e) { kq = undefined; }
          if (!kq || typeof kq !== 'object') {
            // D-46 ca (2): Google trả trang HTML / trang đăng nhập (mã 200, hoặc 200 sau khi đi theo chuyển hướng)
            // thay vì JSON — dấu hiệu Deploy sai "Who has access", hoặc chưa Deploy bản mới. Một câu
            // chuẩn, không đổ nguyên trang HTML tiếng Anh ra cửa sổ đen của người không đọc tiếng Anh.
            if (laTrangHtml(buf)) {
              try {
                loiQuyen(thangGoi, 'Web App trả về không phải JSON (trang HTML/đăng nhập của Google). Nội dung: ' +
                  this.chePhu(buf).replace(/\s+/g, ' ').slice(0, 160), res.statusCode);
              } catch (eh) { return tuChoi(eh); }
            }
            // 2.7.1 (sự cố 14/9 23:01): thân RỖNG, hay chữ lạ không phải trang HTML, KHÔNG phải dấu hiệu quyền. Bản 2.7.0 đưa cả ca này
            // vào `loiQuyen` — máy báo "LỖI QUYỀN TRUY CẬP … (HTTP 302): Web App trả về không phải JSON. Nội dung: " cho một lỗi đường truyền.
            return tuChoi(loiKhongPhaiJson(res.statusCode, buf));
          }
          // Nhớ lại bản THẬT của Web App ngay cả khi phản hồi là lỗi — nhờ vậy `ghi()` chặn được
          // trước khi gửi lô đầu tiên, không phải chờ tới lúc Google trả lời.
          // YC-42: Web App từ 2.7.0 báo bản thật ở `banWebApp` (còn `phienBan` là số nó ĐỒNG Ý phục vụ cho gói này — xem
          // `traLoi_` phía Google); Web App cũ hơn chỉ có `phienBan` và đó chính là bản thật của nó.
          if (kq.banWebApp != null) { this.phienBanWebApp = String(kq.banWebApp); this.webAppBietKhoang = true; }
          else if (kq.phienBan != null) { this.phienBanWebApp = String(kq.phienBan); this.webAppBietKhoang = false; }
          if (kq.mayToiThieu != null) this.mayToiThieuWebApp = String(kq.mayToiThieu);
          if (kq.banDung != null) this.banDungWebApp = String(kq.banDung);
          // So dấu vân tay trên MỌI phản hồi, không riêng `ping`: `banDung` đi kèm mọi phản hồi đã
          // qua cửa bí mật, nên không tốn thêm lượt gọi nào. Gộp câu, không lặp lại câu đã có.
          // Chỉ so khi hai bên CÙNG số bản — đó mới là ca "dán sót file .gs". Khác bản trong khoảng tương thích thì dấu vân tay
          // đương nhiên lệch, và câu của nó ("dán lại … Deploy lại") sai khi máy mới là bên cũ hơn: in dòng nhắc nói đúng bên.
          const cungBan = this.phienBanWebApp == null || soSanhBan(this.phienBanWebApp, PHIEN_BAN) === 0;
          let dsCanh = cungBan ? soDauVanTay(kq) : [];
          if (!cungBan) {
            try { const k = kiemPhienBan(this.phienBanWebApp); if (k.nhac) dsCanh = [k.nhac]; } catch (ek) { /* dưới mốc: chotPhienBan chặn */ }
          }
          dsCanh.forEach((c) => { if (this.canhBaoBanDung.indexOf(c) < 0) this.canhBaoBanDung.push(c); });
          if (!kq.ok) {
            // Câu báo lệch phiên bản phải tới tay người dùng NGUYÊN VĂN, không bọc thêm tiền tố
            // "Web App từ chối [...]" — đây là câu duy nhất nói thẳng việc phải làm.
            if (kq.loi === 'LECH_PHIEN_BAN') return tuChoi(new Error(this.chePhu(kq.thongBao || '')));
            // D-46 ca (3): Web App không mở / không ghi được file theo ID → cũng gom về câu chuẩn; câu
            // chi tiết của Apps Script (đã tiếng Việt, xem `moBangTinh_`) giữ nguyên ở dòng dưới.
            const tb = this.chePhu(kq.thongBao || '');
            if (MA_LOI_QUYEN_WEBAPP.indexOf(kq.loi) >= 0 ||
                (kq.loi === 'NGOAI_LE' && /không mở được|không ghi được|permission|quyền/i.test(tb))) {
              // Tạo tháng mở HAI file: câu chi tiết của Apps Script nêu đúng file nào ("tháng 2026-09"), nên câu chuẩn
              // D-46 phải nói cùng tháng đó — nói tháng mới trong khi file hỏng quyền là file tháng cũ là chỉ sai chỗ.
              const mTh = laTaoThang ? /tháng (\d{4}-\d{2})/.exec(tb) : null;
              try { loiQuyen(mTh ? mTh[1] : thangGoi, tb, res.statusCode); } catch (ew) { return tuChoi(ew); }
            }
            if (laTaoThang && tc.traVeKhiTuChoi && MA_TU_CHOI_TAO_THANG.indexOf(kq.loi) >= 0) {
              kq.thongBao = tb;
              kq.goiY = GOI_Y_TAO_THANG[kq.loi] || '';
              return giaiQuyet(kq);
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
            const goiY = (laTaoThang && GOI_Y_TAO_THANG[kq.loi]) || GOI_Y[kq.loi] || '';
            const eTc = new Error('Web App từ chối [' + (kq.loi || '?') + ']: ' + tb + goiY);
            eTc.maKeodon = kq.loi || null;
            return tuChoi(eTc);
          }
          giaiQuyet(kq);
        });
      };
    });
    return guiDi(Number(tc.choMs) > 0 ? Number(tc.choMs) : choMs);
  }

  /**
   * Thử cửa: máy chủ Google đang ở tháng nào, và Web App đang chạy BẢN NÀO (`phienBan` + `banDung`) —
   * hai số đó là thứ duy nhất trả lời được câu "đã Deploy lại chưa". Không mở file tháng nào.
   */
  ping(tuyChon) { return this._goi({ hanhDong: 'ping' }, tuyChon); }

  /**
   * Chặn ghi khi lệch bản. Chưa nói chuyện lần nào thì ping một cái trước — thà tốn một lượt gọi
   * còn hơn gửi cả gói tiền cho một bản `.gs` cũ rồi tưởng đã ghi đúng.
   */
  async chotPhienBan(tuyChon) {
    if (this.phienBanWebApp === null) await this.ping(tuyChon);
    return kiemPhienBan(this.phienBanWebApp, { mayToiThieu: this.mayToiThieuWebApp });
  }

  /**
   * `phienBanMongDoi` gửi lên (YC-42). Web App CỬA CŨ (tới 2.6.1, không báo `banWebApp`) chỉ nhận gói ghi khi số này BẰNG
   * đúng bản của nó — nên khi đã biết nó đang chạy một bản còn trong khoảng tương thích, gửi đúng số đó để máy mới vẫn ghi
   * được trong lúc Google chưa Deploy. Web App từ 2.7.0 xét `banMay` (bản thật của máy), không xét số này.
   * Chưa nói chuyện lần nào, hoặc Web App dưới mốc → gửi bản của máy (gói ghi không bao giờ đi trước `chotPhienBan`).
   */
  banGuiDi() {
    if (this.phienBanWebApp !== null && !this.webAppBietKhoang) {
      try { kiemPhienBan(this.phienBanWebApp); return this.phienBanWebApp; } catch (e) { /* dưới mốc: chotPhienBan chặn */ }
    }
    return PHIEN_BAN;
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

  /**
   * NÚT 3 CHẾ ĐỘ 1 (YC-35 phía máy, D-45): chuyển sổ sang tháng mới trên Google — hành động `taoThangMoi`.
   *
   * Hai file do NGƯỜI BẤM chỉ định (trường [3/7] và [6/7] của nút 3), không tra `link_thang`: file tháng mới lúc này
   * CHƯA có trong `link_thang`, và khai nó vào đó chính là việc nút 3 làm SAU khi hàm này báo xong.
   *
   * Gọi lại khi Web App dừng gọn vì giờ (`xong:false`), mỗi lượt gửi `buocDungTruoc` = bước vừa dừng dở để Web App
   * chạy bước đó tới cùng (không có thì một bước dài hơn ngưỡng dừng dở mãi — TM-W-13). Lượt sau mà Web App vẫn
   * báo dừng ở ĐÚNG bước vừa ép chạy tới cùng là kẹt thật: dừng, không quay vòng ăn quota.
   *
   * @param {Object} ts  { thangCu, namCu, linkCu, thangMoi, namMoi, linkMoi } — link đầy đủ hoặc ID
   * @param {Object} [tc] { khiTienDo(kq, luot) · nguongGiay, toiDaLuot (hai cái cuối chỉ để test) }
   * @returns {Promise<Object>} `{ ok, loi, thongBao, goiY, kiem, lop2, nhatKy, canhBao, tenFileMoi, tenFileCu,
   *   buocDaXong, soLuot, kyCu, kyMoi }`. Web App TỪ CHỐI hay TỰ KIỂM LỆCH → `ok:false` (không ném).
   * @throws lỗi quyền (D-46), lệch phiên bản, sai chuỗi bí mật, tham số hỏng — câu đã che link/ID/bí mật. Lượt hỏng ở ĐƯỜNG
   *   TRUYỀN (mạng, chuyển hướng, thân rỗng, HTTP ≥ 500) thì máy ĐỌC LẠI CỜ rồi mới ném, `maKeodon` là kết luận của
   *   `ketLuanSauLoiDuongTruyen` (`GOOGLE_DANG_CHAY`, `CHUA_RO_TIEN_DO`, `DA_CHAY_XONG`, …) — xem `_goiTaoThang`.
   */
  async taoThangMoi(ts, tc) {
    const o = ts || {}, t = tc || {};
    this.nhatKyDuongTruyen = [];
    const batDauMs = Date.now();     // cờ DA_KHOI_TAO ghi trước mốc này không phải do lần tạo tháng này (ketLuanSauLoiDuongTruyen)
    [o.linkCu, o.linkMoi].forEach((x) => this.cheThem(x));
    const idCu = idTuLinkHoacId(o.linkCu), idMoi = idTuLinkHoacId(o.linkMoi);
    [idCu, idMoi].forEach((x) => this.cheThem(x));
    const kyCu = kyThangNam(o.thangCu, o.namCu), kyMoi = kyThangNam(o.thangMoi, o.namMoi);
    // Soát lại NGAY TRÊN MÁY những gì Web App cũng soát — sai ở đây thì không tốn một lượt gọi mạng nào.
    const hong = (ma, cau) => { const e = new Error(cau); e.maKeodon = ma; return e; };
    if (!kyCu) throw hong('THAM_SO_SAI', 'Tháng/năm trước không hợp lệ (tháng 1–12, năm đủ 4 chữ số). Tool chưa gọi Google.');
    if (!kyMoi) throw hong('THAM_SO_SAI', 'Tháng/năm mới không hợp lệ (tháng 1–12, năm đủ 4 chữ số). Tool chưa gọi Google.');
    if (kyCu === kyMoi) throw hong('THAM_SO_SAI', 'Tháng trước và tháng mới cùng là ' + kyMoi + '. Tool chưa gọi Google.');
    if (!idCu || !idMoi) {
      throw hong('LINK_THANG_HONG', 'Link file tháng ' + (!idCu ? 'trước [3/7]' : 'mới [6/7]') + ' không phải link Google Sheet ' +
        '(https://docs.google.com/spreadsheets/d/<ID>… hoặc …/spreadsheets/u/0/d/<ID>…). Tool chưa gọi Google.');
    }
    if (idCu === idMoi) throw hong('TRUNG_FILE', 'Link tháng trước và link tháng mới là CÙNG MỘT file.' + GOI_Y_TAO_THANG.TRUNG_FILE);

    await this.chotPhienBan({ boiCanh: 'taoThang' });   // lệch bản là dừng TRƯỚC lượt tạo tháng đầu tiên, chưa ghi ô nào

    const toiDa = Math.max(1, Number(t.toiDaLuot) || SO_LUOT_TAO_THANG_TOI_DA);
    const nhatKy = [], canhBao = [];
    let buocDungTruoc = null, daXongTruoc = '';
    for (let luot = 1; luot <= toiDa; luot++) {
      const kq = await this._goiTaoThang({
        hanhDong: 'taoThangMoi', thang: kyMoi,
        thangCu: Number(o.thangCu), namCu: Number(o.namCu), idCu: idCu,
        thangMoi: Number(o.thangMoi), namMoi: Number(o.namMoi), idMoi: idMoi,
        buocDungTruoc: buocDungTruoc || undefined,
        nguongGiay: t.nguongGiay == null ? undefined : t.nguongGiay
      }, { luot: luot, idMoi: idMoi, kyMoi: kyMoi, batDauMs: batDauMs });
      (kq.nhatKy || []).forEach((x) => nhatKy.push(this.chePhu(x)));
      (kq.canhBao || []).forEach((x) => { const c = this.chePhu(x); if (canhBao.indexOf(c) < 0) canhBao.push(c); });
      if (typeof t.khiTienDo === 'function') t.khiTienDo(kq, luot);
      const kqGon = {
        ok: kq.ok === true, loi: kq.loi || null, thongBao: this.chePhu(kq.thongBao || ''), goiY: kq.goiY || '',
        kiem: Array.isArray(kq.kiem) ? kq.kiem : null, lop2: Array.isArray(kq.lop2) ? kq.lop2 : null,
        nhatKy: nhatKy, canhBao: canhBao, tenFileMoi: kq.tenFileMoi || null, tenFileCu: kq.tenFileCu || null,
        buocDaXong: kq.buocDaXong || null, soLuot: luot, kyCu: kyCu, kyMoi: kyMoi
      };
      if (!kq.ok) {
        // Từ lượt 2 trở đi, file tháng mới ĐÃ được các lượt trước sửa (cờ DANG_KHOI_TAO, tới bước buocDaXong). Câu
        // "tool chưa ghi ô nào" của Web App (ví dụ DANG_BAN) chỉ đúng cho LƯỢT NÀY — nói rõ để người bấm khỏi tưởng file còn nguyên.
        if (luot > 1) {
          kqGon.goiY += ' (Lưu ý: các lượt trước ĐÃ làm tới bước ' + (daXongTruoc || '?') + ' trên file tháng mới, cờ đang là ' +
            'DANG_KHOI_TAO. Bấm lại nút 3 chế độ 1 với đúng bảy giá trị để chạy tiếp; link_thang CHƯA được khai.)';
        }
        return kqGon;
      }
      daXongTruoc = kq.buocDaXong || daXongTruoc;
      if (kq.xong !== false) return kqGon;
      if (buocDungTruoc && kq.buocKe === buocDungTruoc) {
        throw hong('KET_TAO_THANG', 'Web App báo dừng ở bước ' + kq.buocKe + ' hai lượt liền dù đã được ép chạy bước đó tới cùng ' +
          '(lượt ' + luot + '). Dừng để khỏi ăn quota. File tháng mới đang dở ở cờ ' + (kq.buocDaXong || '(chưa bước nào)') +
          '; link_thang CHƯA được khai. Gửi nhật ký cho người phụ trách.');
      }
      buocDungTruoc = kq.buocKe;
    }
    throw hong('KET_TAO_THANG', 'Đã gọi ' + toiDa + ' lượt mà Web App vẫn chưa tạo xong tháng ' + kyMoi + '. Dừng để khỏi ăn quota; ' +
      'link_thang CHƯA được khai. Bấm lại nút 3 chế độ 1 sau vài phút — tool chạy tiếp từ bước đã xong.');
  }

  /**
   * MỘT lượt `taoThangMoi`, và ĐỌC LẠI CỜ khi lượt đó hỏng ở ĐƯỜNG TRUYỀN (2.7.1).
   *
   * Vì sao (sự cố 14/9 23:01): máy mất đường trả lời sau 36 giây và báo thất bại — nhưng lúc đó Google có thể đang chạy tiếp, đã chạy
   * xong, hoặc dừng giữa chừng. Ba ca đó có ba việc phải làm KHÁC NHAU (đợi · khai link chế độ 2 · bấm lại chế độ 1); đoán một câu
   * chung là bảo người bấm làm sai ở hai ca. Nên trước khi kết luận, máy hỏi Google `coTaoThang` (chỉ đọc) rồi mới nói.
   * Lỗi KHÔNG phải đường truyền (lệch bản, quyền, sai chuỗi bí mật…) ném nguyên như cũ, không đọc cờ.
   * Mỗi lượt ghi `lượt k: <đường đi>` vào `this.nhatKyDuongTruyen`; lượt đọc cờ ghi `đọc lại cờ: <đường đi>`.
   * @param {Object} goi  thân gói `taoThangMoi`
   * @param {Object} nc   { luot, idMoi, kyMoi, batDauMs }
   */
  async _goiTaoThang(goi, nc) {
    let kq;
    try {
      kq = await this._goi(goi, { traVeKhiTuChoi: true });
    } catch (e) {
      const duongDi = (e && Array.isArray(e.duongDi)) ? e.duongDi : (this.duongDiCuoi || []).slice();
      this.nhatKyDuongTruyen.push('lượt ' + nc.luot + ': ' + moTaDuongDi(duongDi));
      if (!e || !e.loiDuongTruyen) throw e;
      let co = null, loiDoc = null;
      try { co = await this.docCoTaoThang(nc.idMoi, nc.kyMoi); } catch (e2) { loiDoc = e2 || new Error('lượt đọc cờ hỏng không rõ lý do'); }
      this.nhatKyDuongTruyen.push('đọc lại cờ: ' + moTaDuongDi(this.duongDiCuoi));
      const kl = ketLuanSauLoiDuongTruyen(e.cauGoc || e.message, co, loiDoc, duongDi, { batDauMs: nc.batDauMs, kyMoi: nc.kyMoi });
      const eKl = new Error(this.chePhu(kl.cau));
      eKl.maKeodon = kl.ma;
      eKl.loiGoc = e;
      eKl.co = co;
      throw eKl;
    }
    this.nhatKyDuongTruyen.push('lượt ' + nc.luot + ': ' + moTaDuongDi(this.duongDiCuoi));
    return kq;
  }

  /**
   * ĐỌC LẠI CỜ tiến độ của file tháng mới (2.7.1) — hành động CHỈ ĐỌC `coTaoThang` phía Google (`hanhDongCoTaoThang_`): không ghi ô
   * nào, không giữ khóa, không soát PII (gói không mang dòng đơn), không gắn `spreadsheetId` (file do `idMoi` chỉ định, như `taoThangMoi`).
   * @returns {Promise<Object>} `{ ok, hanhDong:'coTaoThang', thang, dangChay, coKhoiTao, buocDaXong, tenFileMoi }`
   * @throws Google bản cũ (2.7.0) chưa có lệnh này → `maKeodon = 'HANH_DONG_LA'`; và mọi lỗi của `_goi`.
   */
  docCoTaoThang(idMoi, kyMoi) {
    return this._goi({ hanhDong: 'coTaoThang', thang: kyMoi, idMoi: idMoi }, { choMs: TIMEOUT_DOC_CO_MS });
  }
}

/** Nhãn giờ trong cờ `DA_KHOI_TAO_yyyy-MM-dd HH:mm` (giờ Việt Nam, múi giờ dự án Apps Script) → mili-giây; không đọc được → null. */
function mocCoKhoiTao(co) {
  const m = /_(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(String(co == null ? '' : co));
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - LECH_GIO_VN_MS;
}

/** Mili-giây → 'HH:mm dd/MM/yyyy' giờ Việt Nam. */
function gioVN(ms) {
  const d = new Date(Number(ms) + LECH_GIO_VN_MS);
  return haiSo(d.getUTCHours()) + ':' + haiSo(d.getUTCMinutes()) + ' ' + haiSo(d.getUTCDate()) + '/' + haiSo(d.getUTCMonth() + 1) + '/' +
    d.getUTCFullYear();
}

/**
 * KẾT LUẬN SAU LỖI ĐƯỜNG TRUYỀN của nút 3 chế độ 1 (2.7.1) — HÀM THUẦN, kiểm được không cần mạng.
 *
 * Máy vừa mất đường trả lời của một lượt `taoThangMoi` và đã hỏi lại cờ (`coTaoThang`). Mỗi ca một mã, một việc phải làm:
 *   · đọc cờ hỏng / Google cũ chưa có lệnh đọc cờ → `CHUA_RO_TIEN_DO`: chưa biết Google tới đâu, có thể VẪN ĐANG CHẠY — đợi 5 phút;
 *   · khóa Web App đang bị giữ → `GOOGLE_DANG_CHAY`: chưa phải thất bại — đợi 5 phút, đừng bấm chồng;
 *   · cờ `DA_KHOI_TAO_…` mà ô THANG O2 (`co.thangCo`, YC-46) = tháng đang tạo → `DA_CHAY_XONG`; khác tháng → `CO_CU_TRUOC_LUOT_NAY`.
 *     Chỉ khi O2 rỗng/không đọc được mới ĐOÁN theo giờ trên cờ (và câu nói rõ là đang đoán):
 *   · cờ `DA_KHOI_TAO_…` ghi trong lần bấm này → `DA_CHAY_XONG`: khai link bằng chế độ 2;
 *   · cờ `DA_KHOI_TAO_…` ghi TRƯỚC lần bấm này (quá `DUNG_SAI_GIO_CO_MS`) → `CO_CU_TRUOC_LUOT_NAY`: KHÔNG kết luận "đã xong" — bản sao
 *     tháng mới lấy từ sổ tháng trước mang nguyên cờ `DA_KHOI_TAO` của THÁNG TRƯỚC (TM-W-09); Google chưa chạy mà máy bảo chọn
 *     chế độ 2 là khai link cho một sổ chưa chuyển. Việc an toàn: chạy lại chế độ 1 — sổ đã xong thật thì Google tự báo [DA_KHOI_TAO];
 *   · `B5_DANG_LAM` → bản sao hỏng (`GOI_Y_TAO_THANG.B5_DANG_LAM`);
 *   · dừng giữa chừng (có cờ bước / `DANG_KHOI_TAO_…`) → `DUNG_GIUA_CHUNG`: bấm lại chế độ 1 chạy tiếp;
 *   · không cờ nào → `CHUA_GHI_GI`: bấm lại chế độ 1.
 * Mọi câu mở đầu bằng `cauGoc` (+ đường đi nếu `cauGoc` chưa có) — người phụ trách vẫn thấy lỗi gốc.
 *
 * @param {string} cauGoc        phần mô tả lỗi của `_goi` (`e.cauGoc`)
 * @param {Object|null} co       phản hồi `coTaoThang`
 * @param {Error|null} loiDoc    lỗi của lượt đọc cờ
 * @param {string[]} duongDi     đường đi của lượt hỏng
 * @param {Object} [tuyChon]     `kyMoi` — tháng đang tạo `yyyy-MM` (YC-46: so với tháng trên cờ) · `batDauMs` — lúc máy bắt đầu lần tạo
 *                               tháng này (chỉ dùng khi O2 không đọc được; không có thì không xét tuổi cờ)
 * @returns {{ma: string, cau: string}}
 */
function ketLuanSauLoiDuongTruyen(cauGoc, co, loiDoc, duongDi, tuyChon) {
  const t = tuyChon || {};
  let dau = String(cauGoc == null ? '' : cauGoc).trim();
  const dd = Array.isArray(duongDi) ? duongDi.filter(Boolean) : [];
  if (dd.length && dau.indexOf('Đường đi:') < 0) dau += ' Đường đi: ' + moTaDuongDi(dd) + '.';
  const kl = (ma, cau) => ({ ma: ma, cau: (dau ? dau + ' ' : '') + '→ ' + cau });
  const CHUA_KHAI = 'link_thang CHƯA được khai.';
  const motDong = (x) => String(x == null ? '' : x).split('\n')[0].replace(/\s+/g, ' ').trim().slice(0, 200);

  if (loiDoc || !co || typeof co !== 'object') {
    const lyDo = (loiDoc && loiDoc.maKeodon === 'HANH_DONG_LA')
      ? 'Google đang chạy bản cũ, chưa có lệnh đọc cờ `coTaoThang` — khi tiện chủ dự án Deploy bản mới'
      : 'lượt đọc cờ cũng hỏng: ' + (motDong(loiDoc && (loiDoc.cauGoc || loiDoc.message)) || 'Google không trả cờ');
    return kl('CHUA_RO_TIEN_DO', 'Máy KHÔNG đọc lại được cờ tiến độ (' + lyDo + ') nên CHƯA biết Google đã chạy tới đâu — Google có ' +
      'thể VẪN ĐANG CHẠY. ĐỪNG bấm lại ngay: đợi 5 phút rồi bấm lại nút 3 chế độ 1 với đúng bảy giá trị (tool chạy tiếp từ bước ' +
      'đã xong). ' + CHUA_KHAI);
  }

  const buoc = String(co.buocDaXong == null ? '' : co.buocDaXong).trim();
  const khoiTao = String(co.coKhoiTao == null ? '' : co.coKhoiTao).trim();
  if (co.dangChay === true) {
    return kl('GOOGLE_DANG_CHAY', 'Google VẪN ĐANG CHẠY (cờ BUOC_DA_XONG hiện là ' + (buoc || '(trống)') + ') — máy chỉ mất đường ' +
      'trả lời, CHƯA phải thất bại. ĐỪNG bấm lại ngay (hai lượt sẽ chạy chồng nhau): đợi 5 phút rồi bấm lại nút 3 chế độ 1 với ' +
      'đúng bảy giá trị — tool chạy tiếp từ bước đã xong. ' + CHUA_KHAI);
  }
  if (/^DA_KHOI_TAO/.test(khoiTao)) {
    const VIEC_CO_CU = ' Máy KHÔNG kết luận là đã xong. Việc phải làm: bấm lại nút 3 CHẾ ĐỘ 1 với đúng bảy giá trị: sổ đã khởi tạo xong ' +
      'thật thì Google sẽ báo [DA_KHOI_TAO] và chỉ sang chế độ 2 — ĐỪNG chọn chế độ 2 trước khi thấy câu đó. ' + CHUA_KHAI;
    const VIEC_XONG = ' Việc phải làm: bấm lại nút 3, chọn CHẾ ĐỘ 2 với đúng link [6/7] để khai link — ĐỪNG chọn lại chế độ 1.';
    // YC-46: tháng GHI TRÊN CỜ (ô THANG O2) quyết định — không so đồng hồ. Bấm lại sau 20 phút hay máy lệch giờ không còn bị báo oan.
    const thangCo = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(co.thangCo || '').trim()) ? String(co.thangCo).trim() : '';
    const kyMoi = String(t.kyMoi || '').trim();
    if (thangCo && kyMoi) {
      if (thangCo !== kyMoi) {
        return kl('CO_CU_TRUOC_LUOT_NAY', 'Google không còn chạy, nhưng cờ ' + khoiTao + ' trên file tháng mới là cờ của THÁNG ' + thangCo +
          ' (ô THANG O2 của khối cờ), không phải tháng đang tạo ' + kyMoi + ' — cờ của sổ tháng trước đi theo bản sao, KHÔNG phải do lần ' +
          'này ghi.' + VIEC_CO_CU);
      }
      return kl('DA_CHAY_XONG', 'Google ĐÃ chạy xong và tự kiểm đạt (cờ ' + khoiTao + ') — cờ ghi đúng tháng đang tạo (ô THANG O2 = ' + thangCo +
        ') — máy chỉ mất đường trả lời. ' + CHUA_KHAI + VIEC_XONG);
    }
    // O2 rỗng / không đọc được (sổ do bản cũ tạo, hoặc Google chưa Deploy bản trả O2) → chỉ còn cách ĐOÁN theo giờ trên cờ, và nói rõ là đoán.
    const vi = co.thangCoTho ? 'ô THANG O2 đang là "' + String(co.thangCoTho).slice(0, 40) + '", không đọc ra tháng' : 'ô THANG O2 rỗng hoặc Google chưa trả ô đó';
    const DOAN = ' (ĐANG ĐOÁN THEO GIỜ ghi trên cờ vì ' + vi + ')';
    const moc = mocCoKhoiTao(khoiTao);
    if (moc != null && t.batDauMs != null && moc < Number(t.batDauMs) - DUNG_SAI_GIO_CO_MS) {
      return kl('CO_CU_TRUOC_LUOT_NAY', 'Google không còn chạy, nhưng cờ ' + khoiTao + ' trên file tháng mới được ghi TRƯỚC lần bấm này (' +
        gioVN(t.batDauMs) + ')' + DOAN + ' — KHÔNG phải do lần này ghi; thường là cờ của sổ tháng trước đi theo bản sao.' + VIEC_CO_CU);
    }
    return kl('DA_CHAY_XONG', 'Google ĐÃ chạy xong và tự kiểm đạt (cờ ' + khoiTao + ')' + DOAN + ' — máy chỉ mất đường trả lời. ' + CHUA_KHAI +
      VIEC_XONG);
  }
  if (buoc === 'B5_DANG_LAM') {
    return kl('B5_DANG_LAM', 'Google đã DỪNG (không còn chạy), cờ BUOC_DA_XONG = B5_DANG_LAM.' +
      GOI_Y_TAO_THANG.B5_DANG_LAM.replace(/^\s*→\s*/, ' '));
  }
  if (buoc || /^DANG_KHOI_TAO/.test(khoiTao)) {
    const x = buoc || '(chưa bước nào)';
    return kl('DUNG_GIUA_CHUNG', 'Google đã DỪNG (không còn chạy), cờ BUOC_DA_XONG = ' + x + ' — file tháng mới đang dở. Việc phải làm: bấm lại nút 3 ' +
      'chế độ 1 với đúng bảy giá trị để chạy tiếp từ sau ' + x + '. ' + CHUA_KHAI);
  }
  return kl('CHUA_GHI_GI', 'Google không còn chạy và file tháng mới chưa có cờ nào — chưa ô nào bị ghi. Việc phải làm: bấm lại nút 3 chế độ 1 với ' +
    'đúng bảy giá trị (ĐỪNG chọn chế độ 2: file đó chưa được chuyển sổ). ' + CHUA_KHAI);
}

/** Tháng + năm → 'yyyy-MM'. Sai (tháng ngoài 1–12, năm không đủ 4 chữ số) → ''. */
function kyThangNam(thang, nam) {
  const t = String(thang == null ? '' : thang).trim(), n = String(nam == null ? '' : nam).trim();
  if (!/^\d{1,2}$/.test(t) || +t < 1 || +t > 12 || !/^\d{4}$/.test(n)) return '';
  return n + '-' + haiSo(+t);
}

/** Link Google Sheet đầy đủ (hoặc ID trần) → ID; không nhận ra → ''. Cùng luật ID ≥ 20 ký tự với `RE_LINK_SHEET`. */
function idTuLinkHoacId(x) {
  const s = String(x == null ? '' : x).trim();
  const m = s.match(RE_LINK_SHEET);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
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
  PHIEN_BAN, WEB_APP_TOI_THIEU, kiemPhienBan, soBan, soSanhBan, thongBaoGoogleQuaCu, thongBaoMayQuaCu, cauNhacLechBan, soDauVanTay,
  kiemPII, TRUONG_DONG_LOP_1, RE_DIEN_THOAI,
  idFileThang, cauThieuLinkThang, thangSau, canhBaoThangSau, RE_LINK_SHEET, thangHienTaiMay, phanNgayVN, dongHoVN,
  cauLoiQuyen, loiQuyen, MA_LOI_QUYEN_WEBAPP, laTrangHtml,
  TIMEOUT_MS, TIMEOUT_TAO_THANG_MS, SO_LUOT_TAO_THANG_TOI_DA, MA_TU_CHOI_TAO_THANG, GOI_Y_TAO_THANG,
  kyThangNam, idTuLinkHoacId,
  SO_NAC_CHUYEN_HUONG_TOI_DA, MA_CHUYEN_HUONG, TIMEOUT_DOC_CO_MS, DUNG_SAI_GIO_CO_MS,
  diaChiNacSau, tenMayChu, moTaDuongDi, ketLuanSauLoiDuongTruyen, mocCoKhoiTao
};
