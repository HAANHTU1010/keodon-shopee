/**
 * ShellAppsScript.gs — VỎ GOOGLE: Web App NHẬN LỆNH GHI (bản 2.5.0 — Đợt 1 của 02_GIAO_VIEC_DEV.md).
 *
 * Máy tính (vỏ Node) đọc file xuất Shopee (lớp 1 — nơi duy nhất biết định dạng file, phải ở lại máy vì
 * file nằm trên máy), rồi POST một gói JSON tới đây. Bốn hành động:
 *
 *   hanhDong = 'ping' → trả phiên bản + dấu vân tay bản dựng, để máy so trước khi ghi
 *   hanhDong = 'doc'  → trả mã đơn đã có + sheet Mapping + tồn kho (đường lùi 'ghi' dùng)
 *   hanhDong = 'ghi'  → nối dòng vào cuối sheet gian hàng (đường lùi: máy tự chạy lớp 2 + lớp 3)
 *   hanhDong = 'xuLy' → NHẬN BẢNG DÒNG ĐÃ QUA LỚP 1 rồi tự làm đọc + lớp 2 + lớp 3 + ghi trong MỘT lần
 *                       gọi (đường mặc định — sửa nghiệp vụ chỉ cần Deploy một lần, không đi từng máy)
 *
 * Đây là file DUY NHẤT (ngoài tests) gọi dịch vụ của Google. Lõi (Utils/Config/Schema/KeyIn/…) không đụng
 * tới: `dungKeHoachGhi_` bên dưới chỉ GỌI lõi, không tự tính lại một con số nào.
 *
 * ------------------------------------------------------------------ KHÔNG CÒN CHUỖI BÍ MẬT (D-43)
 *  Web App nhận mọi POST đúng định dạng. Không `caiDat()`, không Script Property, không token trong gói.
 *  Chủ dự án chấp nhận rủi ro "ai có link Web App thì ghi thêm được dòng" vì nhóm nhỏ; giảm nhẹ bằng hai
 *  điều: Web App chỉ làm đúng việc mã cho phép (CHỈ THÊM dòng, khử trùng theo mã đơn, không đọc thông tin
 *  người mua), và link Web App chỉ nằm trong cấu hình trên máy, không đăng nơi công khai.
 *
 * ------------------------------------------------------------------ FILE THÁNG DO MÁY CHỈ ĐỊNH (D-42)
 *  Máy tra `link_thang["yyyy-MM"]` trong CAU_HINH_VAN_HANH.json theo THÁNG CỦA NGÀY CHẠY rồi gửi
 *  `spreadsheetId` trong thân gói. Web App mở đúng file đó (`moFileTheoId_`) — KHÔNG đọc bảng link nào
 *  trên Google, không còn "file mỏ neo", và KHÔNG đụng sheet `Thông tin shop ` (sheet đó có ô đăng nhập).
 *  Hai hàng rào:
 *   · thiếu `spreadsheetId` → từ chối (`THIEU_ID_FILE`);
 *   · TÊN file mở được phải mang đúng tháng/năm của gói (`kiemTenFileKhopThang_`) — link_thang trỏ nhầm
 *     file tháng khác là từ chối (`SAI_THANG_FILE`); tên file không theo mẫu nào thì cảnh báo, không chặn.
 *  Không ghi lùi, không ghi trước (`chotThang_`). Ngoại lệ có chủ ý: lượt chạy tay `--thang` gửi kèm
 *  `choPhepThangKhac: true` (rà soát tab "Tất cả" theo D-21b); nút 4 không bao giờ gửi cờ này, và hàng
 *  rào tên file vẫn áp dụng nguyên vẹn.
 *
 * ------------------------------------------------------------------ CÀI ĐẶT (một lần)
 *  1. script.google.com → New project (STANDALONE, không gắn vào file Sheet nào — mỗi tháng một file khác).
 *  2. Dán ĐỦ 11 FILE `.gs` trong src/: CaiDat · Config · DanhMuc · KeyIn · Main · MapListing · Normalize ·
 *     Schema · ShellAppsScript · TaoThangMoi · Utils. Chạy tay `thuXuLyRong()`: nó đếm đủ 11 file và in mã
 *     bản dựng để đối chiếu với `var BAN_DUNG` cuối file này trên máy.
 *  3. Deploy → New deployment → Web app → Execute as "Me" → Who has access "Anyone" → chép link `/exec`
 *     vào `google_sheet.web_app_url` của CAU_HINH_VAN_HANH.json.
 *  4. Sửa mã xong PHẢI Deploy → Manage deployments → bút chì → Version: New version → Deploy, nếu không
 *     link `/exec` vẫn chạy bản cũ. Mọi phản hồi kèm `phienBan` + `banDung`: lệch `PHIEN_BAN` là TỪ CHỐI
 *     GHI; lệch dấu vân tay bản dựng thì máy cảnh báo (`soDauVanTay` trong node/gsheet-web-app.js).
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
var PHIEN_BAN = '2.5.0';

/**
 * Khóa Script Property giữ chuỗi bí mật. GIỮ NGUYÊN từ bản 09/9 — chuỗi đã cài trên dự án Apps Script
 * thật vẫn dùng tiếp, chủ dự án không phải chạy lại `caiDat`.
 *
 * Ngày 13/9 chủ dự án làm rõ lại D-43: KHÔNG bỏ chuỗi bí mật. Cái bỏ là việc bắt user ĐIỀN TAY —
 * gói giao user mang sẵn chuỗi, nên ai có gói mới ghi được, và kiểm soát nằm ở chỗ kiểm soát ai nhận gói.
 * Link Web App là `Anyone` nên không có chuỗi thì bất cứ ai dò trúng link đều ghi được vào sổ tiền.
 */
var TT_BI_MAT = 'KEODON_BI_MAT';

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

/**
 * E, F, M, N — bốn cột CÔNG THỨC của chủ shop (Tên sản phẩm · Đơn vị · Mã hàng · Check tồn).
 *
 * TIỀN ĐỀ CŨ ĐÃ BỊ BÁC (GV-v2.4 Phụ lục A.1, đo thẳng trên Google ngày 08/9/2026). Trước đây chú
 * thích ở đây ghi "là ARRAYFORMULA một ô ở dòng tiêu đề — ghi một ô là hỏng cả cột". Sự thật đo được:
 * mỗi dòng mang MỘT công thức riêng bọc `ARRAY_CONSTRAIN(…;1;1)`, kéo tay tới một dòng cố định.
 * `Shopee mall` cột E có 414 ô (dòng 4→417), M và N 399 ô (4→402). Ghi đè một ô chỉ mất công thức
 * của ĐÚNG DÒNG ĐÓ, không hỏng cả cột — câu cũ nói quá mức nghiêm trọng và đã bỏ.
 *
 * BỐN CỘT KHÔNG CÙNG ĐỘ DÀI, đừng bao giờ giả định thế. File DEMO tháng 9 mới nhất: Shopee E/F/N
 * 389 ô mà M chỉ 274; Offood 432/432/432 mà M chỉ 185; Importmart 485 vs M 103; Babyiu 489 vs M 225.
 * Vì vậy mọi phép đo và mọi phép chép công thức ở đây làm theo TỪNG CỘT một, không gộp.
 *
 * TRIỆU CHỨNG THẬT ĐANG CHỐNG — ăn mòn dần tới trắng cột: xóa NỘI DUNG các dòng đã ghi thì mất luôn
 * công thức của đúng các dòng đó. Đo trên file tháng 8: `Shopee mall` 909 ô → còn 396 sau tháng 9 →
 * **0 trong tháng 10**; `Offood` 514 → 248 → 0. Dòng mới không tự có công thức nên trắng cả bốn cột.
 *
 * LUẬT TỪ 08/9/2026 (GV-v2.6 §3 việc 1 · BA chốt câu (a) ở 08_BA_TRA_LOI_DEV_v2.6.md):
 *   · CẤM ghi GIÁ TRỊ vào bốn cột này — hàng rào `kiemCotDuocGhi_` vẫn ném lỗi y như cũ;
 *   · CHO PHÉP CHÉP CÔNG THỨC của dòng trên xuống dòng tool vừa tạo, đi qua đúng cửa hẹp đó với
 *     `viec = VIEC_CHEP_CONG_THUC`. Xem `mauChepCongThucDS_` và `chepCongThucXuong_`.
 */
var COT_CAM_GHI = [5, 6, 13, 14];

/** Hai việc duy nhất một cột có thể nhận. Cột cấm chỉ nhận việc thứ hai. */
var VIEC_GHI_GIA_TRI = 'GIA_TRI';
var VIEC_CHEP_CONG_THUC = 'CHEP_CONG_THUC';

/**
 * HAI HẰNG SỐ CỦA CƠ CHẾ CŨ, GIỮ LẠI CÓ CHỦ Ý dù vỏ Google không còn dùng.
 *
 * Từ 08/9/2026 vỏ này CHÉP CÔNG THỨC XUỐNG nên hai mức "SẮP HẾT" / "SẼ VƯỢT" không còn nghĩa ở đây:
 * vùng công thức không bao giờ hết. Nhưng vỏ EXCEL (`src/KeyIn.gs`) vẫn còn cả hai mức, và hai vỏ
 * phải nói CÙNG một câu cho cùng một việc, nếu không nhật ký hai chế độ nói hai kiểu và người vận
 * hành không tra được. Giữ ở đây làm điểm neo cho phép so: `KeyIn.NGUONG_SAP_HET_CONG_THUC` và
 * `KeyIn.VIEC_KEO_DAI_CONG_THUC` phải BẰNG hai giá trị này.
 */
var NGUONG_SAP_HET_CONG_THUC = 200;
var VIEC_KEO_DAI_CONG_THUC = 'kéo dài công thức 4 cột E, F, M, N xuống dòng 2000 trước lần chạy sau';

// ==================================================================== cài đặt & tiện ích

/**
 * Chạy tay MỘT LẦN trong trình soạn thảo Apps Script để nạp chuỗi bí mật. Không truyền tham số thì chỉ
 * báo tình trạng, không đổi gì.
 *
 * Không còn tham số `fileMoNeo`: từ D-42 máy gửi thẳng `spreadsheetId` trong mỗi gói, Web App không giữ
 * id file nào. Script Property cũ `KEODON_MO_NEO_ID` nếu còn sót trên dự án thật thì vô hại — không mã
 * nào đọc nó nữa; `caiDat()` báo luôn để chủ dự án xóa tay cho sạch.
 *
 * @param {string} [chuoiBiMat] chuỗi mới; bỏ trống = chỉ xem tình trạng
 * @returns {string} câu tình trạng — CỐ Ý không chứa giá trị chuỗi
 */
function caiDat(chuoiBiMat) {
  var p = PropertiesService.getScriptProperties();
  if (chuoiBiMat) {
    if (String(chuoiBiMat).length < 16) throw new Error('Chuỗi bí mật quá ngắn (cần ít nhất 16 ký tự)');
    p.setProperty(TT_BI_MAT, String(chuoiBiMat));
  }
  var tin = 'Bản ' + PHIEN_BAN + ' · Chuỗi bí mật: ' + (p.getProperty(TT_BI_MAT) ? 'đã cài' : 'CHƯA CÀI');
  if (p.getProperty('KEODON_MO_NEO_ID')) {
    tin += ' · Còn sót thuộc tính cũ KEODON_MO_NEO_ID (không dùng nữa từ D-42, xóa tay được)';
  }
  Logger.log(tin);   // cố ý không in giá trị
  return tin;
}

function thuocTinh_(khoa) { return PropertiesService.getScriptProperties().getProperty(khoa) || ''; }

/** Chuỗi hex SHA-256 của một chuỗi UTF-8. */
function bam256_(s) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < b.length; i++) {
    var v = (b[i] + 256) % 256;          // Apps Script trả byte CÓ DẤU (-128..127)
    hex += (v < 16 ? '0' : '') + v.toString(16);
  }
  return hex;
}

/**
 * C-6.2: so chuỗi bí mật bằng SHA-256 hai phía thay cho vòng so từng ký tự.
 *
 * Vòng cũ so từng mã ký tự và cộng dồn cờ lệch — đúng về kết quả, nhưng nó vẫn duyệt qua `Math.max` của
 * hai độ dài, nghĩa là thời gian chạy phụ thuộc độ dài chuỗi THẬT. Băm xong mới so thì hai bên luôn là
 * 64 ký tự hex bất kể chuỗi thật dài bao nhiêu, và đổi một ký tự trong chuỗi gửi lên làm đổi toàn bộ
 * mã băm — không còn gì để dò dần từng ký tự.
 *
 * Chưa cài đặt thì NÉM LỖI (không phải trả false): hai ca đó phải ra hai câu khác nhau, vì việc phải làm
 * khác hẳn nhau — một bên là đi chạy `caiDat`, một bên là gói giao sai chuỗi.
 */
function biMatDung_(gui) {
  var that = thuocTinh_(TT_BI_MAT);
  if (!that) throw new Error('Web App chưa được cài đặt: chạy caiDat(<chuỗi bí mật>) một lần trong trình soạn thảo Apps Script');
  return bam256_(String(gui == null ? '' : gui)) === bam256_(that);
}

/**
 * Mọi phản hồi — kể cả phản hồi lỗi — đều kèm `phienBan` thật của bản đang chạy trên Google.
 * Gắn ở đây chứ không gắn ở từng chỗ return, vì chỉ cần quên MỘT chỗ là phía máy tính lại không
 * biết mình đang nói chuyện với bản nào (đúng cái bẫy "Google im lặng chạy mã cũ").
 */
function traLoi_(obj) {
  var o = obj || {};
  // C-6.1 (YC-28 điểm 3): HAI nhánh chưa qua cửa bí mật không được mang theo thông tin về bản đang chạy.
  // Người gõ bừa một lần vào link `Anyone` phải nhận đúng một chữ "sai", không thêm gì: biết số phiên bản
  // là biết bản nào đang chạy, tra ra được kho mã công khai và đọc luôn hợp đồng gói JSON.
  // Trước 13/9 `phienBan` vẫn lọt ở hai nhánh này — đó chính là chỗ rò còn lại của C-6.1.
  var chuaQuaCua = (o.loi === 'SAI_BI_MAT' || o.loi === 'CHUA_CAI_DAT');
  if (!chuaQuaCua) {
    if (o.phienBan == null) o.phienBan = PHIEN_BAN;
    // Dấu vân tay bản dựng đi kèm mọi phản hồi ĐÃ QUA CỬA (12 ký tự, rẻ) để máy so được mà không tốn
    // thêm một lượt gọi — thêm lượt `ping` sẽ phá các bài đang đếm chính xác số lượt gọi mạng.
    if (o.banDung == null && typeof BAN_DUNG !== 'undefined') o.banDung = BAN_DUNG;
  }
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

// ==================================================================== file tháng theo ID trong gói (D-42)

/**
 * Link hoặc ID → spreadsheet ID. Nhận: link có '#gid=', link không có '/edit', và chuỗi ID trần (≥ 20 ký
 * tự, đúng bảng chữ của Google). Không nhận ra → '' (phía gọi tự báo lỗi, KHÔNG in lại giá trị nhận được).
 */
function bocIdTuLink_(x) {
  var t = String(x == null ? '' : x).trim();
  var m = t.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : '';
}

function hai_(n) { return ('0' + n).slice(-2); }

// ---------------------------------------------------------------- phần chạm Google

/**
 * MỞ FILE THÁNG — phân loại lỗi của `SpreadsheetApp.openById` (GV-đóng-gói mục 6).
 *
 * VÌ SAO: Web App Deploy với `Execute as = Me`, nên TÀI KHOẢN ĐÃ DEPLOY phải có quyền Sửa MỌI file
 * tháng. User nhân bản vỏ file tháng mới vào Drive của mình rồi quên bấm Chia sẻ là tắc — và
 * câu Google ném ra ("You do not have permission to access the requested document.") không nói được
 * phải làm gì, lại còn hiện bằng tiếng Anh trên cửa sổ đen của người không đọc tiếng Anh.
 *
 * VÌ SAO KHÔNG ĐỔ HẾT CHO QUYỀN: `openById` hỏng vì BA nhóm lý do khác hẳn nhau, chữa cũng khác hẳn:
 *   1. THIẾU QUYỀN      → đi chia sẻ file.
 *   2. KHÔNG THẤY FILE  → link trong link_thang sai, hoặc file đã bị xóa hẳn. Bảo người ta đi
 *                         chia sẻ một file không tồn tại là đẩy họ vào ngõ cụt.
 *   3. MẠNG / HẠN MỨC   → "Service Spreadsheets failed…", "Service invoked too many times…", lỗi máy
 *                         chủ. Ba việc trên đều KHÔNG chữa được; nuốt lý do gốc ở đây là xóa mất
 *                         manh mối duy nhất. Nhóm này NÉM NGUYÊN LỖI CŨ, không đụng một chữ.
 *
 * CA THỨ TƯ, KHÔNG PHÂN BIỆT ĐƯỢC: có những câu Google gộp cả hai lý do vào một
 * ("No item with the given ID could be found, or you do not have permission to access it.",
 * "Document … is missing (perhaps it was deleted, or you don't have read access?)"). Đoán bừa một
 * trong hai là dắt người ta đi sai đường, nên tool nói thẳng là có hai khả năng và xếp việc kiểm
 * link lên trước (rẻ hơn, và là ca hay gặp hơn khi vừa sửa bảng link).
 *
 * BẢN TIẾNG VIỆT: tài khoản đặt ngôn ngữ tiếng Việt thì Apps Script ném chuỗi ĐÃ DỊCH, không phải
 * chuỗi tiếng Anh — nên mỗi dấu hiệu đều có cặp Anh/Việt. Cả hai bảng dấu hiệu dưới đây là suy ra từ
 * chuỗi Google đã công bố, CHƯA đo được trên tài khoản thật (máy dev không có quyền Deploy). Vì thế
 * mã KHÔNG ĐƯỢC nhận nhầm sang nhóm 3: chuỗi lạ luôn rơi về "ném nguyên lỗi cũ".
 */
var DAU_HIEU_LAP_LO_MO_FILE = [
  'no item with the given id',                       // DriveApp/Sheets: "…could be found, or you do not have permission"
  'không tìm thấy mục nào có id',
  'is missing (perhaps it was deleted',              // "Document … is missing (perhaps it was deleted, or you don't have read access?)"
  'bị thiếu (có thể tệp đã bị xóa'
];
var DAU_HIEU_THIEU_QUYEN_MO_FILE = [
  'do not have permission',                          // "You do not have permission to access the requested document."
  'does not have permission',
  'permission denied',
  'access denied',
  'không có quyền',                                  // "Bạn không có quyền truy cập vào tài liệu được yêu cầu."
  'bị từ chối quyền truy cập'
];
var DAU_HIEU_KHONG_THAY_FILE = [
  'unexpected error while getting the method or property openbyid',   // ID sai dạng / không tồn tại
  'thuộc tính openbyid',
  'file not found',
  'không tìm thấy tệp',
  'invalid argument: id',                            // openById('')
  'đối số không hợp lệ: id'
];

/** Có chuỗi nào trong `dauHieu` nằm trong `s` (đã hạ chữ thường) không. */
function coDauHieu_(s, dauHieu) {
  for (var i = 0; i < dauHieu.length; i++) if (s.indexOf(dauHieu[i]) >= 0) return true;
  return false;
}

/**
 * Xếp lỗi của `openById` vào một trong ba nhóm, hoặc '' nếu KHÔNG chắc chắn (→ ném nguyên lỗi cũ).
 * THỨ TỰ XÉT LÀ RUỘT CỦA HÀM: câu lấp lửng chứa CẢ cụm "you do not have permission", nên phải xét
 * nó TRƯỚC nhóm thiếu quyền; đảo lại là mọi ca ID sai bị đổ oan cho quyền.
 * @returns {'KHONG_MO_DUOC_FILE'|'KHONG_CO_QUYEN'|'KHONG_THAY_FILE'|''}
 */
/**
 * CHỈ CÓ QUYỀN XEM — ca `openById` không bắt được.
 *
 * `moFileThang_` chỉ chạm `openById`, mà file chia sẻ quyền **Xem** thì lệnh đó MỞ TRÓT LỌT.
 * Lỗi chỉ nổ ra ở lệnh ghi đầu tiên, với một câu thô khác hẳn. Và ca này hay gặp hơn ca "quên
 * chia sẻ hẳn": hộp Chia sẻ của Google mặc định là **Người xem**, nên chia sẻ nhầm mức là chuyện
 * tự nhiên, còn quên chia sẻ hẳn mới là ca hiếm.
 *
 * Cùng nguyên tắc fail-safe với `phanLoaiLoiMoFile_`: đây là chuỗi Google đã công bố, CHƯA đo được
 * trên tài khoản thật (máy dev không có quyền Deploy). Chuỗi lạ thì NÉM NGUYÊN lỗi cũ — xấu nhất
 * cũng chỉ bằng hiện trạng, không bao giờ đổ oan cho quyền.
 */
var DAU_HIEU_CHI_QUYEN_XEM = [
  'read-only mode',                                  // "The document is currently in read-only mode"
  'chế độ chỉ đọc',
  'do not have permission to modify',
  'does not have permission to modify',
  'không có quyền chỉnh sửa',
  'not authorized to edit',
  'cannot edit'
];

function thuGhiDauTien_(sh, viec) {
  try { return viec(); } catch (e) {
    var s = String((e && e.message) ? e.message : e || '').toLowerCase();
    if (!coDauHieu_(s, DAU_HIEU_CHI_QUYEN_XEM)) throw e;
    var ten = '';
    try { ten = sh.getParent().getName(); } catch (e2) { ten = ''; }
    var er = new Error('Không ghi được vào file' + (ten ? ' "' + ten + '"' : '') +
      '. File đang chia sẻ cho tài khoản chạy tool ở mức CHỈ XEM nên mở được mà không ghi được. ' +
      'Mở file đó, bấm Chia sẻ, tìm dòng của tài khoản đã deploy Web App rồi đổi từ "Người xem" ' +
      'thành "Người chỉnh sửa", bấm Xong, sau đó chạy lại tool.');
    er.maKeodon = 'CHI_CO_QUYEN_XEM';
    er.loiGoc = String((e && e.message) ? e.message : e);
    throw er;
  }
}

function phanLoaiLoiMoFile_(loi) {
  var s = String((loi && loi.message) ? loi.message : loi || '').toLowerCase();
  if (!s) return '';
  if (coDauHieu_(s, DAU_HIEU_LAP_LO_MO_FILE)) return 'KHONG_MO_DUOC_FILE';
  if (coDauHieu_(s, DAU_HIEU_THIEU_QUYEN_MO_FILE)) return 'KHONG_CO_QUYEN';
  if (coDauHieu_(s, DAU_HIEU_KHONG_THAY_FILE)) return 'KHONG_THAY_FILE';
  return '';
}

/**
 * Mở một bảng tính, đổi lỗi thô của Google thành câu tiếng Việt nêu đúng việc phải làm.
 *
 * @param {string} id     ID file — TUYỆT ĐỐI không được lọt vào thông báo (id là đường vào file tiền;
 *                        cùng luật với `thuMoFileThang`).
 * @param {string} moTa   chỗ điền vào "Không mở được file ___" — ví dụ 'tháng 2026-10'.
 * @param {string} noiKhai câu chỉ chỗ sửa: khóa nào của `link_thang` trong CAU_HINH_VAN_HANH.json.
 */
function moBangTinh_(id, moTa, noiKhai) {
  try {
    return SpreadsheetApp.openById(id);
  } catch (err) {
    var ma = phanLoaiLoiMoFile_(err);
    // Nhóm 3 (mạng, hạn mức, lỗi máy chủ Google) và mọi chuỗi lạ: ném NGUYÊN lỗi cũ. Đây là chủ ý —
    // ba nhóm đó không chữa bằng cách đi chia sẻ file, mà lý do gốc là manh mối duy nhất còn lại.
    if (!ma) throw err;
    var dau = 'Không mở được file ' + moTa + '. ';
    var than;
    if (ma === 'KHONG_CO_QUYEN') {
      than = 'Tài khoản chạy tool chưa được chia sẻ quyền Sửa với file này. ' +
        'Mở file đó, bấm Chia sẻ, thêm tài khoản đã deploy Web App với quyền Sửa.';
    } else if (ma === 'KHONG_THAY_FILE') {
      than = 'Google báo không tìm thấy file có ID này — ID sai hoặc file đã bị xóa hẳn. ' +
        noiKhai + ' Đây KHÔNG phải lỗi chia sẻ quyền, đừng đi chia sẻ file.';
    } else {
      than = 'Google trả một câu chung cho hai lý do khác nhau nên tool không đoán: hoặc không tìm ' +
        'thấy file (ID sai, file đã bị xóa), hoặc tài khoản chạy tool chưa được chia sẻ quyền. ' +
        noiKhai + ' Link đúng rồi thì mở file đó, bấm Chia sẻ, thêm tài khoản đã deploy Web App ' +
        'với quyền Sửa.';
    }
    // Gắn mã vào chính Error, đúng cơ chế `maKeodon` mà `fileCuaThang_` đang dùng: không gắn thì
    // `doPost` gói lại thành NGOAI_LE và phía máy mất luôn chỗ để phân nhánh.
    var e = new Error(dau + than);
    e.maKeodon = ma;
    e.loiGoc = String((err && err.message) ? err.message : err);   // giữ lại để soi, KHÔNG in ra
    throw e;
  }
}

/**
 * Đọc tháng/năm từ TÊN file Google Sheet. Nhận: `THÁNG-9-2026-KINH-DOANH`, `THANG-09-2026…`,
 * `DEMO_THÁNG-9-2026…`, `THÁNG 9/2026`, `Kinh Doanh T9-2026`, `T9-2026`. Không nhận ra → null.
 * @returns {{nam:number, thang:number}|null}
 */
function thangTrongTenFile_(ten) {
  var t = String(ten == null ? '' : ten);
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  t = t.toUpperCase();
  var m = t.match(/TH[AÁ]NG[\s\-_.]*(\d{1,2})[\s\-_.\/]+(\d{4})/);
  if (!m) m = t.match(/(?:^|[^A-Z0-9])T[\s\-_.]*(\d{1,2})[\s\-_.\/]+(\d{4})/);
  if (!m) return null;
  var th = Number(m[1]), nam = Number(m[2]);
  if (!(th >= 1 && th <= 12) || !(nam >= 2000 && nam <= 2100)) return null;
  return { nam: nam, thang: th };
}

/**
 * HÀNG RÀO D-42: `link_thang` trỏ nhầm file tháng khác thì TỪ CHỐI (`SAI_THANG_FILE`) — chặn ca "đơn
 * tháng 10 chui vào sổ tháng 9", loại lỗi phát hiện muộn và rất khó gỡ vì `Tổng xuất` đã trừ tồn ở
 * tháng sai. Tên file không theo mẫu nào (chủ dự án đặt tên tùy ý) thì CẢNH BÁO chứ không chặn: tool
 * không đoán, và chặn oan là tắc cả buổi chạy.
 */
function kiemTenFileKhopThang_(ss, thang, canhBao) {
  var ten = ss.getName();
  var mong = chuanHoaThang_(thang);
  var doc = thangTrongTenFile_(ten);
  if (!doc) {
    if (canhBao) canhBao.push('Không đọc được tháng/năm trong tên file "' + ten + '" nên không kiểm chéo được ' +
      'với tháng ' + mong + '. Vẫn ghi. Nên đặt tên file dạng THÁNG-<M>-<YYYY>-KINH-DOANH để tool tự kiểm.');
    return true;
  }
  var cua = doc.nam + '-' + hai_(doc.thang);
  if (cua === mong) return true;
  var e = new Error('Link tháng ' + mong + ' đang trỏ tới file "' + ten + '" (tháng ' + cua + ') — không phải ' +
    'file của tháng ' + mong + '. Tool DỪNG, không ghi ô nào. Sửa link_thang["' + mong + '"] trong ' +
    'CAU_HINH_VAN_HANH.json (mở bằng Notepad), hoặc bấm 3_TAO_FILE_THANG_MOI.bat chế độ 2, rồi chạy lại.');
  e.maKeodon = 'SAI_THANG_FILE';
  throw e;
}

/**
 * Mở file tháng THEO ID TRONG GÓI (D-42). Mọi hành động 'doc' / 'ghi' / 'xuLy' đi qua đây và chỉ qua đây.
 * @returns {{ss, fileId, thang}}
 */
function moFileTheoId_(body, thang, canhBao) {
  var id = bocIdTuLink_(body && body.spreadsheetId);
  if (!id) {
    var e = new Error('Gói gửi lên không có spreadsheetId hợp lệ cho tháng ' + thang + ' — máy chưa tra được ' +
      'link_thang trong CAU_HINH_VAN_HANH.json. Thường là bản Node trên máy cũ hơn Web App: bấm ' +
      '2_CAP_NHAT.bat rồi chạy lại. Tool chưa ghi gì.');
    e.maKeodon = 'THIEU_ID_FILE';
    throw e;
  }
  var ss = moBangTinh_(id, 'tháng ' + thang,
    'Link đó lấy từ link_thang["' + thang + '"] trong CAU_HINH_VAN_HANH.json của máy chạy tool; sửa dòng đó rồi chạy lại.');
  kiemTenFileKhopThang_(ss, thang, canhBao);
  return { ss: ss, fileId: id, thang: thang };
}

/**
 * Chốt tháng được phép ghi: phải đúng tháng của NGÀY CHẠY trên máy chủ Google (T-53).
 * `choPhepKhac === true` CHỈ đến từ lượt chạy tay `--thang` (D-21b — rà soát tab "Tất cả" tháng trước):
 * người chủ động chọn tháng, và hàng rào tên file (`kiemTenFileKhopThang_`) vẫn áp dụng. Nút 4 không gửi cờ này.
 */
function chotThang_(thangGui, choPhepKhac) {
  var nay = thangHienTai_();
  var xin = chuanHoaThang_(thangGui) || nay;
  if (choPhepKhac === true) return xin;
  if (xin < nay) throw new Error('Từ chối ghi lùi: gói dữ liệu ghi cho tháng ' + xin +
    ' nhưng hôm nay đã sang tháng ' + nay + '. Đơn của tháng trước phải do người nhập tay vào file tháng đó.');
  if (xin > nay) throw new Error('Từ chối ghi trước: gói dữ liệu ghi cho tháng ' + xin +
    ' trong khi tháng hiện tại là ' + nay + '. Kiểm tra lại đồng hồ của máy chạy tool.');
  return xin;
}

// ==================================================================== điểm vào Web App

function doGet() {
  // Câu TRUNG TÍNH (C-6.1): không nêu tên tool, không nêu cách gọi, không nêu hành động nào. Người lạ mở
  // link bằng trình duyệt không thu được gì; người trong nhà vẫn biết cửa còn sống.
  return ContentService.createTextOutput('keodon Web App đang chạy.');
}

function doPost(e) {
  var batDau = new Date().getTime();
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '{}');
  } catch (err) {
    return traLoi_({ ok: false, loi: 'JSON_HONG', thongBao: 'Gói gửi lên không phải JSON hợp lệ' });
  }

  var hd = String(body.hanhDong || '').trim().toLowerCase();
  var mongDoi = body.phienBanMongDoi == null ? '' : String(body.phienBanMongDoi);

  // CỬA BÍ MẬT — đặt TRƯỚC mọi nhánh hành động, kể cả 'ping'. Gói giao user mang sẵn chuỗi nên user
  // không phải gõ gì; ai không có gói thì không qua được cửa này.
  // Kiểm trong try: chưa cài đặt thì `biMatDung_` NÉM lỗi, để lọt ra ngoài là Apps Script trả trang HTML
  // 500 và phía máy chỉ thấy "không phải JSON" — đúng cái ca khó đoán nhất.
  try {
    if (!biMatDung_(body.token)) {
      return traLoi_({ ok: false, loi: 'SAI_BI_MAT', thongBao: 'Sai chuỗi bí mật' });
    }
  } catch (err) {
    return traLoi_({ ok: false, loi: 'CHUA_CAI_DAT', thongBao: String(err && err.message ? err.message : err) });
  }

  // Lệch bản thì TỪ CHỐI GHI. Chặn cả hai nhánh có ghi ('ghi' và 'xuLy'); 'ping' và 'doc' phải chạy được
  // để người ta nhìn thấy con số lệch mà đi triển khai lại — chặn luôn cả hai thì chỉ còn lỗi "không gọi
  // được". Chiều ngược lại (Google đang chạy bản CŨ, chưa có đoạn này) do phía máy tính bắt: nó so
  // `phienBan` trong phản hồi trước khi gửi lệnh ghi — bản cũ không trả trường đó là đủ để dừng. Với
  // 'xuLy' còn một chiều nữa: bản cũ không biết hành động này nên trả HANH_DONG_LA, và phía máy dịch mã
  // đó thành đúng câu "hãy Deploy lại" chứ không im lặng coi như đã ghi.
  if ((hd === 'ghi' || hd === 'xuly') && mongDoi && mongDoi !== PHIEN_BAN) {
    return traLoi_({ ok: false, loi: 'LECH_PHIEN_BAN', thongBao: thongBaoLechPhienBan_(PHIEN_BAN, mongDoi) });
  }

  try {
    if (hd === 'ping') {
      // 'ping' KHÔNG mở file nào: nó chỉ trả lời "bản trên Google là bản nào, đồng hồ máy chủ đang ở tháng
      // nào". File tháng do máy chỉ định trong từng gói (D-42), Web App không giữ id nào để mà báo.
      return traLoi_({
        ok: true, hanhDong: 'ping', thangHienTai: thangHienTai_(),
        // `PHIEN_BAN` không phân biệt được hai bản dựng cùng số phiên bản, nên tự nó không trả lời được
        // câu "bản trên Google là bản nào". Máy so ba thứ dưới đây với chính `src/` của nó rồi cảnh báo —
        // cảnh báo thôi, không chặn, để không tắc buổi chạy thử.
        banDung: (typeof BAN_DUNG !== 'undefined') ? BAN_DUNG : null,
        vanTay: vanTayBanDung_(),
        hamLoi: hamLoiCoMat_(),
        thoiDiem: Utilities.formatDate(new Date(), MUI_GIO, 'HH:mm:ss dd/MM/yyyy')
      });
    }
    if (hd === 'doc') return traLoi_(hanhDongDoc_(body, batDau));
    if (hd === 'ghi') return traLoi_(hanhDongGhi_(body, batDau));
    if (hd === 'xuly') return traLoi_(hanhDongXuLy_(body, batDau));
    return traLoi_({ ok: false, loi: 'HANH_DONG_LA', thongBao: 'hanhDong = "' + hd + '"; chỉ nhận: ping, doc, ghi, xuLy' });
  } catch (err) {
    // Giữ nguyên mã lỗi nghiệp vụ nếu nơi ném có gắn; chỉ rơi về NGOAI_LE khi thật sự không rõ.
    return traLoi_({ ok: false, loi: (err && err.maKeodon) ? err.maKeodon : 'NGOAI_LE',
      thongBao: String(err && err.message ? err.message : err) });
  }
}

// ==================================================================== hành động ĐỌC

/**
 * body: { thang?, spreadsheetId, sheets?: [tên sheet], cauHinh? }
 * trả:  { ok, thang, tenFile, sheets: {ten: {dongCuoi, dongDau, cotNote, coTieuDeNote, maDon:{ma:dòng}}},
 *         mapping: {ten, header, dong}, tonKho: {ten, header, dong}, canhBao }
 */
function hanhDongDoc_(body, batDau) {
  var cfg = Config.tao(body.cauHinh || {});
  var thang = chuanHoaThang_(body.thang) || thangHienTai_();
  var canhBao = [];
  var f = moFileTheoId_(body, thang, canhBao);
  var ss = f.ss;

  var tenSheets = (body.sheets && body.sheets.length) ? body.sheets
    : Object.keys(cfg.gianHang).map(function (m) { return cfg.gianHang[m].sheet; });

  var tuXa = docTuXa_(ss, cfg, tenSheets, thang, canhBao);
  return {
    ok: true, hanhDong: 'doc', thang: thang, tenFile: ss.getName(),
    sheets: tuXa.sheets, mapping: tuXa.mapping, tonKho: tuXa.tonKho,
    canhBao: canhBao, giay: (new Date().getTime() - batDau) / 1000
  };
}

/**
 * Ba thứ lớp 2 cần trước khi tính được gì: mã đơn ĐÃ CÓ trên từng sheet gian hàng, sheet Mapping,
 * sheet tồn kho. Tách riêng để hành động 'doc' (máy tự tính) và hành động 'xuLy' (script tự tính)
 * dùng CHUNG một hàm — hai đường mà đọc bằng hai đoạn mã khác nhau là sớm muộn lệch nhau một chỗ.
 */
function docTuXa_(ss, cfg, tenSheets, thang, canhBao) {
  var k = cfg.keyin;
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
  return { sheets: sheets, mapping: docBangMapping_(ss, canhBao), tonKho: docTonKho_(ss, cfg, canhBao) };
}

/**
 * Cột Note = cột đã mang tiêu đề `Note` từ lần chạy trước; chưa có thì là cột trống đầu tiên bên phải
 * tiêu đề cuối cùng (GV-v2.2 mục 1.4). Luật này chép đúng `KeyIn.cotNote` để hai vỏ không lệch nhau.
 *
 * TRIỆU CHỨNG khi thiếu vế đầu (đo được 08/9/2026 khi so hai đường ghi trên 401 đơn thật): lần ghi
 * thứ nhất đặt tiêu đề `Note` vào cột P, lần ghi thứ hai thấy P đã có tiêu đề nên coi P là "cột cuối
 * cùng có tiêu đề" và nhảy sang Q, lần thứ ba sang R… Mỗi lô, mỗi lần chạy lại đẻ thêm một cột Note
 * mới trong sheet của chủ shop, còn ghi chú của các dòng vàng thì nằm rải ra bốn năm cột khác nhau.
 * Lỗi này có sẵn từ bản 2.3.0 và trúng cả hành động 'ghi' cũ (từ lô thứ hai trở đi), không riêng 'xuLy'.
 */
function doCotNote_(sh, k) {
  var het = Math.max(sh.getLastColumn(), k.cot_doanh_thu);
  var tieuDe = sh.getRange(k.dong_header, 1, 1, het).getDisplayValues()[0];
  var cuoi = 0;
  for (var i = 0; i < tieuDe.length; i++) {
    var v = String(tieuDe[i] == null ? '' : tieuDe[i]).trim();
    if (!v) continue;
    if (v === String(k.tieu_de_note)) return i + 1;     // đã có cột Note từ lần chạy trước
    cuoi = i + 1;
  }
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
 *   thang, spreadsheetId, lo: {so, tong},
 *   lenh: [ { tenSheet, don: [ { maDon, ngay, tien:{H,I,J,K}, dong:[ {tenVietTat, soLuong, vang, note} ] } ] } ],
 *   mappingThem: [ [12 cột theo SCHEMA.MAPPING] ],
 *   cauHinh?
 * }
 * Quy tắc bất di bất dịch (GV-v2.2 mục 1.5): chỉ nối dòng dưới cùng · chỉ ghi A,C,D,G,H,I,J,K ·
 * KHÔNG bao giờ chạm E,F,M,N · chỉ kéo cột L · gộp ô C,H,I,J,K,L cho đơn nhiều hàng.
 */
function hanhDongGhi_(body, batDau) {
  var cfg = Config.tao(body.cauHinh || {});
  var thang = chotThang_(body.thang, body.choPhepThangKhac);

  var lenh = body.lenh || [];
  var tongDon = 0;
  lenh.forEach(function (l) { tongDon += (l.don || []).length; });
  if (tongDon > TOI_DA_DON_MOT_LO)
    throw new Error('Gói có ' + tongDon + ' đơn, quá ' + TOI_DA_DON_MOT_LO +
      ' đơn một lô. Vỏ Node phải chia lô nhỏ hơn.');

  var khoa = LockService.getScriptLock();
  if (!khoa.tryLock(30000)) throw new Error('Một lệnh ghi khác đang chạy, thử lại sau vài giây');

  try {
    var k = cfg.keyin;
    var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0 };
    var viTri = {}, canhBao = [], thongBao = [], daDoVung = {};
    var f = moFileTheoId_(body, thang, canhBao);
    var ss = f.ss;

    var daGhiSheet = {};
    lenh.forEach(function (l) {
      var sh = ss.getSheetByName(l.tenSheet);
      if (!sh) {
        canhBao.push('Không có sheet "' + l.tenSheet + '" trong file tháng ' + thang +
          ' → bỏ qua ' + (l.don || []).length + ' đơn');
        return;
      }
      var truoc = tk.donGhi;
      ghiMotSheet_(sh, l.don || [], k, tk, viTri, canhBao, thongBao, daDoVung);
      if (tk.donGhi > truoc) daGhiSheet[l.tenSheet] = 1;
    });
    dongDauDauThoiGian_(ss, daGhiSheet, canhBao);

    if (body.mappingThem && body.mappingThem.length)
      tk.mappingThem = themDongMapping_(ss, body.mappingThem, canhBao);
    tk.mappingToLai = toLaiMapping_(ss, canhBao);        // D-47: dòng CÓ trắng lại, dòng chưa CÓ vàng

    SpreadsheetApp.flush();
    return {
      ok: true, hanhDong: 'ghi', thang: thang, tenFile: ss.getName(),
      lo: body.lo || null, thongKe: tk, viTri: viTri, canhBao: canhBao, thongBao: thongBao,
      giay: (new Date().getTime() - batDau) / 1000
    };
  } finally {
    khoa.releaseLock();
  }
}

/**
 * MỘT CỬA DUY NHẤT cho mọi chỉ số cột mà lớp ghi sắp chạm tới. Chặn ở TẦNG GHI chứ không dựa vào
 * người viết mã nhớ: một lỗi gõ trong cấu hình cột (ví dụ `cot_thue` để nhầm thành 'M') là ghi đè
 * thẳng giá trị lên cột công thức của chủ shop, im lặng.
 *
 * TỪ 08/9/2026 CỬA NÀY PHÂN BIỆT HAI VIỆC, không còn cấm tuốt (GV-v2.6 §3 việc 1):
 *   · VIEC_GHI_GIA_TRI    — ghi số/chữ đè lên ô. Vào E, F, M, N là MẤT công thức của dòng đó → TỪ CHỐI.
 *   · VIEC_CHEP_CONG_THUC — chép công thức dòng trên xuống dòng tool vừa tạo. Đây chính là việc
 *     phải làm để dòng mới không trắng bốn cột, nên được phép, và cố ý đi qua ĐÚNG cửa này để
 *     người sửa mã sáu tuần sau nhìn thấy ngay là có đúng một đường được nới, không phải hai.
 *
 * @param {string} [cachSua]  câu chỉ đường thay cho câu mặc định — dùng khi tool TỰ DÒ ra cột cấm,
 *                            lúc đó người vận hành cần biết sửa ở đâu chứ không chỉ biết là sai.
 */
function kiemCotDuocGhi_(cot, ten, viec, cachSua) {
  var c = Number(cot);
  if (viec === VIEC_CHEP_CONG_THUC) return c;
  if (COT_CAM_GHI.indexOf(c) >= 0)
    throw new Error('TỪ CHỐI GHI: ' + (cachSua ||
      (ten + ' đang trỏ vào cột ' + Utils.chuCot(c) + ' — E, F, M, N là cột công thức của chủ shop, ' +
        'ghi giá trị vào là mất công thức của đúng dòng đó. Sửa cấu hình cột rồi chạy lại.')));
  return c;
}

/**
 * Câu lỗi cho ca cột Note rơi vào cột cấm — BA chốt câu (c): GIỮ NÉM LỖI, nhưng lỗi phải NÊU ĐÚNG
 * CỘT ĐÃ DÒ RA và CÂU LỆNH SỬA. Nhảy qua cột Note thì mất luôn chỗ ghi lý do của mọi dòng vàng,
 * tức mất cơ chế an toàn chính; mà dò ra cột cấm nghĩa là bố cục sheet khác giả định, lúc đó ghi
 * bất cứ thứ gì cũng không an toàn.
 */
function cauSuaCotNote_(sh, k, cot) {
  var het = Number(sh.getLastColumn()) || 0;
  var goiY = Utils.chuCot(Math.max(het, COT_CAM_GHI[COT_CAM_GHI.length - 1]) + 1);
  var nguon = k.cot_note ? 'keyin.cot_note đang đặt vào' : 'cột Note tự dò ra';
  return nguon + ' cột ' + Utils.chuCot(cot) + ' là cột công thức. Mở "Cấu hình", đặt cot_note ' +
    'thành một cột trống bên phải (ví dụ ' + goiY + ') rồi chạy lại.';
}

/**
 * @param {Object} [daDoVung]  sổ đánh dấu sheet nào đã đo vùng công thức trong LẦN GỌI NÀY. Một lần
 *                             gọi 'xuLy' ghi nhiều khối trên cùng một sheet; không có sổ này thì mỗi
 *                             khối lại đo lại và kêu lại đúng một câu. Bỏ trống = đo (dùng cho test).
 */
function ghiMotSheet_(sh, donDS, k, tk, viTri, canhBao, thongBao, daDoVung) {
  // MỘT CỬA DUY NHẤT cho mọi chỉ số cột mà hàm này sẽ ghi vào. Đặt ở ĐẦU hàm chứ không đặt ngay
  // trước từng lệnh ghi: đặt trước lệnh ghi thì lệnh ghi nào quên là lọt lệnh đó, và người sửa mã
  // sáu tuần sau không có cách nào biết mình vừa thêm một lệnh chưa qua cửa.
  // Danh sách DỰNG TỪ `Config.KEYIN_COT`, KHÔNG gõ tay (C-6.3): bản trước liệt kê tay 9 khóa trong khi
  // KEYIN_COT có 10 — `cot_nguon_don` lọt cửa. Dựng từ nguồn thì khóa cột thêm sau này tự động được canh,
  // không phụ thuộc vào việc người sửa mã có nhớ thêm vào đây hay không.
  Config.KEYIN_COT.forEach(function (t) {
    kiemCotDuocGhi_(k[t], 'keyin.' + t);
  });

  // Cột Note tính SỚM, ngay tại đây, để đi qua cùng một cửa. Nó đến từ hai nguồn và cả hai đều
  // chưa từng bị kiểm: cấu hình `keyin.cot_note` (Config.gs:71 chỉ đổi chữ sang số, không kiểm gì)
  // và `doCotNote_` tự dò theo dòng tiêu đề, thứ phụ thuộc hình dạng sheet của chủ shop chứ không
  // phụ thuộc mã. Đo 08/9/2026: sheet chỉ có tiêu đề tới cột L thì doCotNote_ trả về M, và
  // ghiMotSheet_ ghi thẳng chữ `Note` vào M2 — tức đè lên cột công thức của chủ shop.
  var cotNoteDo = k.cot_note || doCotNote_(sh, k);
  var cNote = kiemCotDuocGhi_(cotNoteDo, k.cot_note ? 'keyin.cot_note' : 'cột Note tự dò (doCotNote_)',
    VIEC_GHI_GIA_TRI, cauSuaCotNote_(sh, k, cotNoteDo));

  // Cột Note không được trùng bất kỳ cột nào tool tự ghi: trùng cột C là ghi chữ ghi chú đè lên
  // mã đơn vừa ghi (đo được), khóa chống trùng chết và lần chạy sau nhân đôi toàn bộ đơn.
  Config.KEYIN_COT.map(function (t) { return [t, k[t]]; }).forEach(function (x) {
      if (Number(cNote) === Number(x[1]))
        throw new Error('TỪ CHỐI GHI: cột Note đang trỏ vào cột ' + Utils.chuCot(cNote) +
          ', trùng keyin.' + x[0] + '. Sửa keyin.cot_note rồi chạy lại.');
    });

  // KHỬ TRÙNG TẦNG 2 — đọc lại cột mã đơn NGAY TRƯỚC KHI GHI, và đang ở trong LockService của
  // hanhDongGhi_. Tầng 1 (node/chay-google-sheet.js) khử theo danh sách lấy từ hành động 'doc',
  // nhưng danh sách đó đã cũ vài giây: 2-3 máy user cùng ghi một file tháng, máy A không thể
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

  // Đo vùng công thức E, F, L, M, N của CHÍNH sheet này — TRƯỚC khi ghi ô nào, theo TỪNG CỘT.
  // Kết quả dùng cho hai việc: chép công thức xuống (việc chính) và cảnh báo (lớp phụ, chỉ kêu khi
  // không có gì để chép). Đo ở đây chứ không ở `docTuXa_` vì hành động 'ghi' không đi qua hàm đó.
  var mauDS = mauChepCongThucDS_(sh, k, het, cNote);
  canhBaoVungCongThuc_(sh, k, mauDS, dongCuoi, dongCuoi + soDongTong, canhBao, daDoVung);

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
  // LỆNH GHI ĐẦU TIÊN của cả lượt chạy — bọc để đổi lỗi thô của Google thành câu chỉ việc phải làm.
  // Vì sao đúng chỗ này: file được chia sẻ quyền XEM thì `openById` mở TRÓT LỌT, `moFileThang_`
  // không thấy gì bất thường, và lỗi chỉ nổ ra ở đây. Mà hộp Chia sẻ của Google mặc định là
  // "Người xem", nên "chia sẻ nhầm quyền Xem" hay gặp hơn hẳn "quên chia sẻ hẳn".
  thuGhiDauTien_(sh, function () { cMa.setNumberFormat('@'); });
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

  // CHÉP CÔNG THỨC DÒNG TRÊN XUỐNG cho cả năm cột E, F, L, M, N (trước bản này chỉ có L).
  chepCongThucXuong_(sh, k, mauDS, r0Khoi, soDongTong, canhBao);

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

// ==================================================================== dấu thời gian ở dòng 1

/**
 * Đóng dấu thời gian cho mọi sheet CÓ GHI ĐƠN trong lần gọi này. Gọi một lần ở cuối, sau khi ghi
 * xong toàn bộ đơn: gọi trong `ghiMotSheet_` thì mỗi khối lại đọc lại dòng 1 và ghi lại một lần —
 * một lần 'xuLy' 400 đơn là bốn khối, tức bốn lượt ghi thừa cho đúng một ô.
 */
function dongDauDauThoiGian_(ss, daGhiSheet, canhBao) {
  Object.keys(daGhiSheet || {}).forEach(function (ten) {
    var sh = ss.getSheetByName(ten);
    if (sh) ghiDauThoiGian_(sh, canhBao);
  });
}

/**
 * DẤU THỜI GIAN Ở DÒNG 1 CỦA SHEET GIAN HÀNG (GV-v2.6 §2).
 *
 * Chủ dự án nêu mục đích: "để người sau biết rằng sheet đó mới có người làm, khỏi làm lại nữa".
 *
 * BỐN RÀNG BUỘC CỦA ĐỀ BÀI, và cách đáp ứng:
 *  1. Dòng 1 là Ô GỘP `A1:N1` chứa tiêu đề lớn — tuyệt đối không đụng. Vì thế cột bắt đầu là P (16),
 *     nằm ngoài ô gộp, và mã ở đây không bao giờ đọc/ghi cột nhỏ hơn 16 trên dòng 1.
 *  2. `P1` đã có nội dung khác → lùi sang ô trống đầu tiên bên phải trên cùng dòng 1.
 *  3. Lần sau phải ghi đúng chỗ cũ. Đề bài nói ghi địa chỉ ô vào khối điều khiển của
 *     `Mapping_san_pham`; ở đây làm bằng cách RẺ HƠN VÀ KHÔNG CẦN TRẠNG THÁI: dò dòng 1 tìm ô nào
 *     đang mang đúng tiền tố `Tool cập nhật lúc ` rồi ghi đè chính ô đó. Ô do tool viết tự nhận ra
 *     được nên không cần sổ ghi nhớ, không lệch khi ai đó chèn thêm cột, và không thêm một thứ
 *     phải bảo trì trong sheet của chủ shop. Đã ghi rõ lựa chọn này trong báo cáo.
 *  4. GHI ĐÈ, không nối thêm.
 *
 * BỌC TRY/CATCH CÓ CHỦ Ý: dấu thời gian là thứ trang trí. Một sheet bố cục lạ làm hỏng bước này thì
 * phải mất đúng dấu thời gian, không được kéo theo cả lô đơn đã ghi xong.
 */
var DAU_THOI_GIAN_TIEN_TO = 'Tool cập nhật lúc ';
var COT_DAU_THOI_GIAN = 16;              // P — ngay bên phải ô gộp A1:N1
var SO_COT_DO_DAU_THOI_GIAN = 10;        // dò P..Y rồi thôi; không có chỗ thì kêu chứ không bò mãi
var MAU_NEN_DAU_THOI_GIAN = '#FFF9E6';

/** 'Tool cập nhật lúc 12h40 ngày 9/9/2026' — giờ Việt Nam, giờ và ngày KHÔNG đệm số 0. */
function cauDauThoiGian_(luc) {
  var d = luc || new Date();
  var s = '';
  // Đọc qua Utilities.formatDate để lấy đúng múi giờ Việt Nam của máy chủ Google, nhưng chỉ dùng
  // các mẫu hai chữ số — mẫu một chữ ('H', 'd', 'M') không phải bản giả lập nào cũng hiểu.
  try { s = String(Utilities.formatDate(d, MUI_GIO, 'yyyy-MM-dd-HH-mm')); } catch (e) { s = ''; }
  var m = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/.exec(s);
  var nam, thang, ngay, gio, phut;
  if (m) { nam = Number(m[1]); thang = Number(m[2]); ngay = Number(m[3]); gio = Number(m[4]); phut = m[5]; }
  else { nam = d.getFullYear(); thang = d.getMonth() + 1; ngay = d.getDate(); gio = d.getHours(); phut = hai_(d.getMinutes()); }
  return DAU_THOI_GIAN_TIEN_TO + gio + 'h' + phut + ' ngày ' + ngay + '/' + thang + '/' + nam;
}

/**
 * Ghi dấu thời gian vào dòng 1 của một sheet gian hàng. Chỉ gọi cho sheet THẬT SỰ có ghi đơn trong
 * lần chạy này — sheet không có đơn mới phải giữ nguyên dấu cũ, nếu không dấu mất hết ý nghĩa.
 * @returns {string|null}  địa chỉ ô đã ghi ('P1'), hoặc null nếu không ghi được
 */
function ghiDauThoiGian_(sh, canhBao) {
  try {
    // Đọc CẢ DẢI trong MỘT lượt. Bản đầu dò từng ô một: 10 lượt getDisplayValues cho mỗi sheet,
    // nhân bốn sheet là 40 lượt gọi Google thừa mỗi lần chạy, đổi lấy đúng một ô chữ.
    var dai = sh.getRange(1, COT_DAU_THOI_GIAN, 1, SO_COT_DO_DAU_THOI_GIAN).getDisplayValues()[0];
    var cot = 0, oTrong = 0;
    for (var i = 0; i < dai.length; i++) {
      var v = String(dai[i] == null ? '' : dai[i]).trim();
      var c = COT_DAU_THOI_GIAN + i;
      if (v.indexOf(DAU_THOI_GIAN_TIEN_TO) === 0) { cot = c; break; }   // ô của lần trước → ghi đè đúng đó
      if (!v && !oTrong) oTrong = c;
    }
    if (!cot) cot = oTrong;
    if (!cot) {
      canhBao.push('Sheet "' + sh.getName() + '": dòng 1 từ cột ' + Utils.chuCot(COT_DAU_THOI_GIAN) +
        ' sang phải không còn ô trống → bỏ qua dấu thời gian, phần ghi đơn vẫn xong bình thường.');
      return null;
    }
    var o = sh.getRange(1, cot, 1, 1);
    o.setValues([[cauDauThoiGian_(new Date())]]);
    o.setBackground(MAU_NEN_DAU_THOI_GIAN);
    o.setFontWeight('bold');
    return Utils.chuCot(cot) + '1';
  } catch (e) {
    canhBao.push('Sheet "' + sh.getName() + '": không ghi được dấu thời gian ở dòng 1 (' +
      String(e && e.message ? e.message : e) + ') — phần ghi đơn vẫn xong bình thường.');
    return null;
  }
}

/**
 * ĐO TỪNG CỘT CÔNG THỨC rồi CHỐT: cột này chép được công thức dòng trên xuống hay không.
 *
 * VÌ SAO PHẢI ĐO TỪNG CỘT, KHÔNG ĐO CHUNG. Bốn cột E, F, M, N của cùng một sheet dừng ở bốn dòng
 * khác nhau, và lệch rất xa: file DEMO tháng 9 mới nhất có `Shopee mall` E/F/N 389 ô nhưng M chỉ
 * 274 ô; `Offood` 432/432/432 nhưng M chỉ 185. Cột M là Mã hàng và N tra theo M, nên M ngắn là N
 * vô dụng theo. Lấy một con số chung cho cả bốn cột là nói sai về ba cột trong bốn.
 *
 * BA TRẢ LỜI CHO MỖI CỘT:
 *   · chepDuoc = true              → có công thức mẫu, chép xuống dòng mới. Đây là ca thường.
 *   · lyDo = 'KHONG_CO_MAU'        → cả cột không còn ô nào có công thức. KHÔNG tự dựng công thức
 *     mới (D-15 cấm, và đó là công thức của chủ shop): để trống, cảnh báo để người kiểm tay.
 *   · lyDo = 'TRAN_CA_COT'         → đúng MỘT ô công thức nằm ngay dòng đầu vùng dữ liệu và không
 *     bọc `ARRAY_CONSTRAIN` → đó là ARRAYFORMULA thật, tự tràn xuống. Chép xuống là ĐÈ CHẾT vùng
 *     tràn của nó. Không đụng. Chủ dự án có thể đổi sang hình dạng này bất cứ lúc nào nên phép đo
 *     không được khóa cứng vào hình dạng đo được hôm nay.
 *
 * Ngoại lệ `ARRAY_CONSTRAIN(…;1;1)`: nhìn thì giống ARRAYFORMULA mà chỉ phủ đúng một dòng một cột —
 * dấu vết Google để lại khi chuyển công thức mảng của Excel sang Sheet (GV-v2.4 Phụ lục A.1). Vì thế
 * ô như vậy vẫn tính là công thức TỪNG DÒNG và vẫn phải chép xuống.
 *
 * Vế "TRAN_CA_COT" cố ý CHỈ áp cho E, F, M, N. Cột L (`Doanh Thu`) chưa bao giờ là ARRAYFORMULA —
 * nó là `=H4-I4-J4-K4` từng dòng — nên một sheet mới toanh chỉ có L4 vẫn phải chép xuống như cũ.
 *
 * @param {number} dongCuoiSheet  `sh.getLastRow()` đọc TRƯỚC khi ghi ô nào của lô này
 * @param {number} cNote          cột Note, để không bao giờ chép công thức đè lên chỗ ghi lý do
 * @returns {Array} [{ cot, chepDuoc, lyDo, dong, text }]
 */
function mauChepCongThucDS_(sh, k, dongCuoiSheet, cNote) {
  var cot = (k.cot_cong_thuc || []).slice();
  if (cot.indexOf(k.cot_doanh_thu) < 0) cot.push(k.cot_doanh_thu);
  cot.sort(function (a, b) { return a - b; });

  var ra = [];
  for (var i = 0; i < cot.length; i++) {
    var c = Number(cot[i]);
    if (c === Number(cNote)) continue;                 // Note là cột tool ghi CHỮ, không phải cột công thức
    kiemCotDuocGhi_(c, 'keyin.cot_cong_thuc', VIEC_CHEP_CONG_THUC);
    var d = dongCuoiCongThuc_(sh, c, k.dong_dau, dongCuoiSheet);
    if (!d) { ra.push({ cot: c, chepDuoc: false, lyDo: 'KHONG_CO_MAU', dong: null, text: '' }); continue; }
    if (COT_CAM_GHI.indexOf(c) >= 0 && d.dong === k.dong_dau && !/ARRAY_CONSTRAIN/i.test(d.text)) {
      ra.push({ cot: c, chepDuoc: false, lyDo: 'TRAN_CA_COT', dong: d.dong, text: d.text });
      continue;
    }
    ra.push({ cot: c, chepDuoc: true, lyDo: '', dong: d.dong, text: d.text });
  }
  return ra;
}

/**
 * CHÉP CÔNG THỨC DÒNG TRÊN XUỐNG cho E, F, L, M, N ở đúng khối dòng tool vừa tạo (GV-v2.6 §3 việc 1).
 *
 * TRIỆU CHỨNG THẬT ĐANG CHỐNG: trước bản này chế độ Google chỉ kéo cột L, nên mọi dòng tool ghi
 * đều trắng Tên sản phẩm, Đơn vị, Mã hàng, Check tồn. Không phải "sẽ trắng khi vượt vùng" — trắng
 * ngay từ dòng đầu tiên nằm dưới ô cuối còn công thức, và vùng đó ăn mòn dần về 0 (Shopee mall
 * 909 → 396 → 0 ô mỗi cột).
 *
 * BA RÀNG BUỘC, cả ba đều có bài đối chứng âm trong `node/test-chep-cong-thuc.js`:
 *  1. Chỉ chép vào DÒNG TOOL VỪA TẠO. Dòng cũ không đụng — khối ghi bắt đầu từ `r0Khoi` là dòng
 *     ngay dưới dòng dữ liệu cuối, nên dòng cũ nằm ngoài vùng ghi.
 *  2. Ô nào TRONG khối mà ĐÃ CÓ công thức thì giữ nguyên công thức đó, không đè bằng mẫu. Ca này
 *     có thật: công thức của chủ shop thường chạy quá dòng đơn cuối (đơn tới dòng 96, công thức
 *     tới 417), nên khối mới nằm lọt trong vùng còn công thức.
 *  3. Dùng R1C1: `setFormulasR1C1` tự dịch tham chiếu tương đối theo dòng đích, đúng cách cột L đã
 *     chạy từ đầu. Không tự viết lại công thức, không thêm IFERROR, không đổi vùng tra.
 *
 * Đọc lại công thức cũ bằng `getFormulaR1C1` TỪNG Ô chứ không `getFormulasR1C1` cả khối: đây là bề
 * mặt Apps Script mà mọi sheet giả của bộ test đều dựng đủ. Và chỉ đọc khi khối thật sự chồng lên
 * vùng còn công thức (`r <= m.dong`) — ngoài vùng đó thì chắc chắn trống, khỏi tốn lượt gọi.
 */
function chepCongThucXuong_(sh, k, mauDS, r0Khoi, soDong, canhBao) {
  for (var i = 0; i < (mauDS || []).length; i++) {
    var m = mauDS[i];
    if (!m.chepDuoc) continue;
    kiemCotDuocGhi_(m.cot, 'chép công thức cột ' + Utils.chuCot(m.cot), VIEC_CHEP_CONG_THUC);
    var o = [], coViec = false;
    for (var n = 0; n < soDong; n++) {
      var r = r0Khoi + n;
      var cu = (r <= m.dong) ? sh.getRange(r, m.cot).getFormulaR1C1() : '';
      if (cu) { o.push([cu]); continue; }               // công thức của chủ shop đã có sẵn → giữ nguyên
      o.push([m.text]);
      coViec = true;
    }
    if (!coViec) continue;                              // cả khối đã có công thức → không ghi lệnh nào
    sh.getRange(r0Khoi, m.cot, soDong, 1).setFormulasR1C1(o);
  }
}

/**
 * CẢNH BÁO VÙNG CÔNG THỨC — nay chỉ còn là LỚP PHỤ (BA chốt câu (a), 08_BA_TRA_LOI_DEV_v2.6.md §1).
 *
 * Trước 08/9/2026 hàm này kêu hai mức ĐỎ ("SẼ VƯỢT") và VÀNG ("SẮP HẾT"). Cả hai nay vô nghĩa ở vỏ
 * Google: tool chép công thức xuống nên vùng không bao giờ hết. Cảnh báo đơn thuần chỉ báo cho
 * người biết mình sắp mất công thức — nó KHÔNG ngăn được việc mất.
 *
 * Còn đúng một ca đáng kêu: cả cột không còn ô nào có công thức để chép. Lúc đó tool để trống và
 * nói ra, tuyệt đối không tự dựng công thức mới (D-15) — công thức là của chủ shop, đoán sai thì
 * sai lặng lẽ trên mọi dòng về sau.
 *
 * Ca ARRAYFORMULA phủ cả cột thì không kêu: cột ấy tự tràn, không có gì để làm.
 *
 * Gộp một lần cho mỗi sheet trong mỗi lần gọi (`daDo`): một lần 'xuLy' ghi nhiều khối trên cùng một
 * sheet, không gộp thì mỗi khối lại kêu lại đúng một câu.
 */
function canhBaoVungCongThuc_(sh, k, mauDS, dongDonCuoi, dongCuoiMoi, canhBao, daDo) {
  var ten = sh.getName();
  if (daDo && daDo[ten]) return;
  if (daDo) daDo[ten] = 1;
  for (var i = 0; i < (mauDS || []).length; i++) {
    var m = mauDS[i];
    if (m.chepDuoc || m.lyDo !== 'KHONG_CO_MAU') continue;
    canhBao.push('Vùng công thức sheet "' + ten + '" cột ' + Utils.chuCot(m.cot) + ': ' +
      'KHÔNG CÒN CÔNG THỨC ĐỂ CHÉP — từ dòng ' + k.dong_dau + ' trở xuống không còn ô nào có công thức nên ' +
      (dongCuoiMoi - dongDonCuoi) + ' dòng mới sẽ trống ở cột này. Vẫn ghi, không chặn: ' +
      'chép tay công thức đúng vào ô ' + Utils.chuCot(m.cot) + k.dong_dau +
      ' (lấy từ file tháng trước), từ lần chạy sau tool tự chép tiếp xuống.');
  }
}

/**
 * Dòng CUỐI CÙNG còn công thức của một cột, dò ngược từ dòng cuối sheet lên — y hệt cách
 * `congThucCotL_` đang dò công thức mẫu, và cố ý dùng `getFormulaR1C1` từng ô chứ không đọc cả khối:
 * đây là bề mặt Apps Script mà mọi sheet giả của bộ test đều dựng đủ, nên bài test chạy đúng mã thật.
 * @returns {{dong:number, text:string}|null}  null = cả cột không còn ô nào có công thức
 */
function dongCuoiCongThuc_(sh, cot, dongDau, dongCuoiSheet) {
  for (var r = dongCuoiSheet; r >= dongDau; r--) {
    var t = sh.getRange(r, cot).getFormulaR1C1();
    if (t) return { dong: r, text: String(t) };
  }
  return null;
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

/**
 * D-47 (YC-29): TÔ LẠI TOÀN TAB Mapping sau mỗi lượt xử lý — dòng đã ghi CÓ ở cột `Xác nhận` → nền trắng
 * (null = bỏ nền), dòng chưa CÓ → vàng `MAU_VANG`. MỘT lệnh `setBackgrounds` cho cả vùng, không tô từng ô
 * (Apps Script chỉ có 6 phút; tô từng ô là nguyên nhân số một gây hết giờ). Idempotent: chạy mười lần ra
 * cùng một kết quả. Không đụng dòng tiêu đề, không đổi giá trị, ghi chú hay định dạng chữ — chỉ nền.
 *
 * VÌ SAO CÓ: trước 12/9 trên Google chỉ `themDongMapping_` tô vàng dòng MỚI; user ghi CÓ xong dòng vẫn vàng
 * vĩnh viễn, vì `MapListing.dongCanToVang` chỉ được gọi ở đường Excel (`Main.gs` → `kho.ghiMapping`). Một
 * tab vàng rực thì màu vàng thôi hết nghĩa, và dòng thật sự cần người xem chìm lẫn vào đó.
 *
 * Luật "CÓ" dùng chung `MapListing.laCo` — cùng một luật với lớp 2, không chép lại lần thứ hai.
 * @returns {number} số dòng đã tô lại (0 nếu không có sheet Mapping hoặc chưa dán MapListing.gs)
 */
function toLaiMapping_(ss, canhBao) {
  var sh = sheetMapping_(ss);
  if (!sh) return 0;
  if (typeof MapListing === 'undefined' || typeof MapListing.laCo !== 'function') {
    canhBao.push('Không tô lại sheet Mapping: dự án Apps Script chưa dán MapListing.gs (dấu vân tay bản dựng sẽ kêu đúng file này).');
    return 0;
  }
  var het = sh.getLastRow();
  if (het < 2) return 0;
  var rong = Math.max(sh.getLastColumn(), SCHEMA.MAPPING.length);
  var header = sh.getRange(1, 1, 1, rong).getDisplayValues()[0];
  var cXN = 0;
  for (var i = 0; i < header.length; i++) {
    if (MapListing.tenCotChuan(header[i]) === 'Xác nhận') { cXN = i + 1; break; }
  }
  if (!cXN) {
    canhBao.push('Sheet Mapping không có cột "Xác nhận" nên không tô lại được dòng CÓ / chưa CÓ.');
    return 0;
  }
  var xn = sh.getRange(2, cXN, het - 1, 1).getDisplayValues();
  var nen = [];
  for (var r = 0; r < xn.length; r++) {
    var mau = MapListing.laCo(xn[r][0]) ? null : MAU_VANG;
    var hang = [];
    for (var c = 0; c < rong; c++) hang.push(mau);
    nen.push(hang);
  }
  sh.getRange(2, 1, het - 1, rong).setBackgrounds(nen);
  return xn.length;
}

// ==================================================================== hành động XỬ LÝ (lớp 2 + lớp 3 + ghi)
//
// Toàn bộ khối này là phần được CHUYỂN TỪ MÁY USER SANG ĐÂY. Trước đây `node/chay-google-sheet.js`
// gọi `doc`, tự chạy lớp 2 và lớp 3 rồi mới gọi `ghi` — nghĩa là mỗi lần sửa cách tính thuế, cách chọn
// lô hay cách gộp ô đều phải đi cập nhật từng máy. Từ bản 2.4.0, máy chỉ gửi bảng dòng đã qua lớp 1.
//
// `dungKeHoachGhi_` là HÀM THUẦN: không gọi SpreadsheetApp, không đọc đồng hồ, không đọc thuộc tính.
// Cùng dữ liệu vào thì cùng kế hoạch ra. Nhờ vậy `node/chay-google-sheet.js` gọi được CHÍNH hàm này
// cho đường 'ghi' cũ — hai đường dùng chung một lõi, không phải hai bản chép tay dễ lệch nhau.

/**
 * Đổi {header, dong} của một sheet phụ thành bảng 2 chiều mà lõi đọc được (dòng đầu là tiêu đề).
 * Lõi đọc danh mục theo `cfg.danhMuc.dong_header` nên phải chèn lại đúng số dòng trống phía trên,
 * nếu không `DanhMuc.doc` bắt đầu đọc lệch một dòng và mất mặt hàng đầu bảng.
 */
function bangCuaSheet_(x, dongHeaderMongDoi) {
  if (!x) return null;
  var bang = [x.header || []];
  var chen = Math.max(0, (dongHeaderMongDoi || 1) - 1);
  for (var i = 0; i < chen; i++) bang.unshift([]);
  (x.dong || []).forEach(function (d) { bang.push(d); });
  return bang;
}

/**
 * Đổi kết quả của lõi (Normalize.xuLy → don[]) thành lệnh ghi.
 * Giữ nguyên hình dạng dữ liệu mà `KeyIn.gs` dùng, chỉ bỏ những gì tầng ghi không cần.
 */
function lenhTuDon_(tenSheet, donDS, ngayGhi) {
  return {
    tenSheet: tenSheet,
    don: (donDS || []).map(function (d) {
      return {
        maDon: String(d.maDon),
        ngay: ngayGhi || null,
        tien: { H: d.tien.H, I: d.tien.I, J: d.tien.J, K: d.tien.K },
        // Tô vàng khi chưa nhận ra mã (lyDo) HOẶC ghép được nhưng có điều cần biết, ví dụ tồn 0.
        // Đúng một luật với KeyIn.gs để hai vỏ không lệch nhau.
        dong: (d.dong || []).map(function (x) {
          return {
            tenVietTat: x.tenVietTat || '',
            soLuong: x.soLuong,
            vang: !!(x.lyDo || x.ghiChu),
            note: x.ghiChu || ''
          };
        })
      };
    })
  };
}

/**
 * LỚP 2 + LỚP 3 — hàm thuần, không chạm Google.
 *
 * @param {Object} cfg      cấu hình đã chuẩn hóa
 * @param {Array}  cacFile  [{ maGianHang, tenFile, dong }] — kết quả lớp 1 của từng file xuất
 * @param {Object} tuXa     { sheets, mapping, tonKho } — ảnh chụp file tháng (docTuXa_ hoặc hành động 'doc')
 * @param {Object} tuyChon  { ngayGhi }
 * @returns { lenh, mappingThem, thongKe, canhBao, map }
 */
function dungKeHoachGhi_(cfg, cacFile, tuXa, tuyChon) {
  var tc = tuyChon || {};
  var canhBao = [];

  // ---- lớp 2: danh mục kho + Mapping ----
  var dm = DanhMuc.doc(bangCuaSheet_(tuXa.tonKho, cfg.danhMuc.dong_header), cfg.danhMuc);
  if (!dm.soDong) throw new Error('Sheet "' + cfg.danhMuc.ten_sheet + '" trên Google Sheet không đọc được dòng danh mục nào ' +
    '(cột tên viết tắt trống?) — dừng, vì chạy tiếp thì mọi đơn đều bị tô vàng oan.');
  if (!dm.soCoTon) {
    canhBao.push('Sheet "' + cfg.danhMuc.ten_sheet + '" không đọc được cột Tổng tồn → quy tắc chọn lô theo tồn tạm lấy mã đầu tiên');
  }
  var bangMap = tuXa.mapping ? bangCuaSheet_(tuXa.mapping, 1) : null;
  if (!bangMap) throw new Error('File tháng trên Google Sheet chưa có sheet "Mapping sản phẩm" — tạo sheet đó rồi chạy lại');
  var map = MapListing.docBang(bangMap, dm, cfg);
  map.canhBao.forEach(function (c) { canhBao.push(c); });

  // LƯỢT GỌI TIẾP SAU KHI HẾT GIỜ (chỉ đường 'xuLy' dùng tới).
  // Triệu chứng nếu bỏ đoạn này, đo được 08/9/2026 trên 402 đơn thật: chạy một hơi và chạy làm 5 lượt
  // cho ra hai file lệch nhau ĐÚNG MỘT Ô ở cột Note. Vì lượt trước vừa nối tên hàng mới vào Mapping,
  // lượt sau đọc lại sheet thấy dòng đó đã có (chưa ai điền) nên xếp là "chưa điền Tên viết tắt"
  // thay vì "tên hàng mới". Cùng nghĩa, cùng dòng vàng, nhưng khác chữ — mà khác chữ là chia lô đã
  // đổi kết quả, và lúc đó không ai dám khẳng định chia lô là vô hại nữa.
  if (tc.tenMoiTruocDo && tc.tenMoiTruocDo.length) {
    var truocDo = {};
    tc.tenMoiTruocDo.forEach(function (x) { truocDo[x] = 1; });
    map.dong.forEach(function (d) { if (!d.__muc && truocDo[d.__khoa]) d.__lyDo = 'TEN_MOI'; });
  }

  // ---- lớp 2: từng file — bổ sung tên mới vào Mapping rồi gom dòng thành đơn ----
  var tatCaDon = [], tenMoi = 0;
  (cacFile || []).forEach(function (f) {
    var gh = Config.gianHang(cfg, f.maGianHang);
    tenMoi += MapListing.boSungTenMoi(map, f.dong, gh.ten, tc.ngayGhi || null, f.tenFile).length;
    var n = Normalize.xuLy(f.dong, map, cfg);
    n.canhBao.forEach(function (c) { canhBao.push(c); });
    n.don.forEach(function (d) { d.ngayGhi = tc.ngayGhi || null; d.tenGianHienThi = gh.ten; tatCaDon.push(d); });
  });

  // ---- KHỬ TRÙNG TẦNG 1: theo mã đơn đọc được lúc chụp ảnh file tháng ----
  // Tầng 2 nằm trong `ghiMotSheet_`, đọc lại cột mã đơn bên trong LockService ngay trước khi ghi.
  // Phải có đủ hai tầng: danh sách dưới đây chụp TRƯỚC khi lấy khóa, tới lúc ghi thì máy khác có thể
  // đã nối thêm đơn. Không tin một tầng. (Đường 'xuLy' vẫn giữ đúng hai tầng đó, chỉ khác là cả hai
  // tầng nay cùng nằm trên Google — tầng 1 ngoài khóa, tầng 2 trong khóa.)
  var thongKe = { donGhi: 0, donDaCo: 0, donTrungTrongGoi: 0, dongGhi: 0, dongVang: 0, donGopO: 0, tenMoi: tenMoi };
  var theoSheet = {}, thuTuSheet = [], daNhan = {};
  tatCaDon.forEach(function (don) {
    var gh = Config.gianHang(cfg, don.maGianHang);
    var ss = tuXa.sheets && tuXa.sheets[gh.sheet];
    if (!ss) {
      canhBao.push('File tháng trên Google Sheet không có sheet "' + gh.sheet + '" → bỏ qua đơn ' + don.maDon);
      return;
    }
    if (ss.maDon && ss.maDon[String(don.maDon)] != null) { thongKe.donDaCo++; return; }
    // D-16: cùng một mã đơn nằm trong HAI file xuất thả cùng lượt (ví dụ file "Chờ lấy hàng" và
    // file "Tất cả" của cùng gian hàng) — chưa có trên Sheet nên tầng trên không bắt được, phải
    // chặn ở đây. Khoá gồm cả tên sheet vì T-29: hai gian hàng được phép trùng mã đơn.
    var khoa = gh.sheet + ' ' + String(don.maDon);
    if (daNhan[khoa]) {
      thongKe.donTrungTrongGoi++;
      canhBao.push('Đơn ' + don.maDon + ' xuất hiện nhiều lần trong lượt này → chỉ ghi một lần');
      return;
    }
    daNhan[khoa] = 1;
    if (!theoSheet[gh.sheet]) { theoSheet[gh.sheet] = []; thuTuSheet.push(gh.sheet); }
    theoSheet[gh.sheet].push(don);
    thongKe.donGhi++;
    thongKe.dongGhi += don.dong.length;
    thongKe.dongVang += don.dong.filter(function (x) { return x.lyDo || x.ghiChu; }).length;   // cùng luật với KeyIn.gs
    if (don.dong.length > 1) thongKe.donGopO++;
  });

  var lenh = thuTuSheet.map(function (ten) { return lenhTuDon_(ten, theoSheet[ten], tc.ngayGhi || null); });
  var mappingThem = map.soThem > 0 ? MapListing.sangBang(map).slice(-map.soThem) : [];
  var khoaTenMoi = (map.tenMoi || []).map(function (d) { return d.__khoa; });
  return {
    lenh: lenh, mappingThem: mappingThem, thongKe: thongKe, canhBao: canhBao, map: map,
    khoaTenMoi: khoaTenMoi
  };
}

/**
 * Đã chạy quá ngưỡng tự dừng chưa. Tách riêng để test bơm được ngưỡng nhỏ mà không phải chờ 4 phút.
 * Ngưỡng gửi từ ngoài chỉ được phép NHỎ HƠN: một gói gửi lên `nguongGiay: 999` mà được nghe theo là
 * tự tay tháo hàng rào 6 phút, rồi Google cắt ngang giữa lúc flush và không ai biết đã ghi tới đâu.
 */
function quaGioXuLy_(batDau, nguong) {
  return (new Date().getTime() - batDau) / 1000 >= nguongThuc_(nguong);
}

/** Ngưỡng thật sự áp dụng, sau khi chặn trần. Dùng chung cho cả câu thông báo để không nói sai số. */
function nguongThuc_(nguong) {
  var n = Number(nguong);
  return (isNaN(n) || n < 0 || n > NGUONG_GIAY_XU_LY) ? NGUONG_GIAY_XU_LY : n;
}

/** Cắt danh sách đơn của một sheet thành các khối ≤ TOI_DA_DON_MOT_KHOI, không cắt ngang một đơn. */
function chiaKhoiDon_(donDS, toiDa) {
  var n = Math.max(1, Number(toiDa) || TOI_DA_DON_MOT_KHOI);
  var khoi = [];
  for (var i = 0; i < (donDS || []).length; i += n) khoi.push(donDS.slice(i, i + n));
  return khoi.length ? khoi : [[]];
}

/**
 * hanhDong = 'xuLy' — MỘT lần gọi làm hết: đọc file tháng → lớp 2 → lớp 3 → ghi.
 *
 * body: {
 *   thang, spreadsheetId, ngayGhi, lo: {so, tong},
 *   cacFile: [ { maGianHang, tenFile, dong: [ dòng đã qua lớp 1 ] } ],
 *   tenMoiTruocDo?          khóa các tên hàng mới đã nối vào Mapping ở lượt gọi trước (xem dungKeHoachGhi_)
 *   cauHinh?, nguongGiay?   (nguongGiay chỉ để test; chỉ được phép NHỎ HƠN NGUONG_GIAY_XU_LY)
 * }
 * trả: { ok, thang, tenFile, lo, thongKe:{donGhi,donDaCo,dongGhi,dongVang,donGopO,tenMoi,...},
 *        xong, sheetDaXong, sheetConLai, khoaTenMoi, viTri, canhBao, thongBao, giay }
 */
/**
 * D-04 / YC-36: từ chối cả lượt nếu một file bị thả nhầm thư mục gian hàng.
 *
 * Luật nằm ở LÕI (`MapListing.soatThaNhamGian`) để vỏ Excel và vỏ Google dùng chung đúng một luật —
 * hai bản chép tay sẽ lệch nhau, và lệch ở đúng chỗ này nghĩa là một vỏ chặn còn vỏ kia cho qua.
 *
 * Chặn là NÉM LỖI, không phải cảnh báo: ghi nửa gói rồi mới báo thì người ta phải đi dọn tay 432 dòng
 * trong sổ tiền — đúng việc đã phải làm đêm 07/9/2026.
 */
function kiemGianHangCuaFile_(cacFile, tuXa, cfg, canhBao) {
  if (typeof MapListing === 'undefined' || typeof MapListing.soatThaNhamGian !== 'function') {
    canhBao.push('Không kiểm chéo được gian hàng: dự án Apps Script chưa dán bản MapListing.gs mới ' +
      '(dấu vân tay bản dựng sẽ kêu đúng file này).');
    return;
  }
  var bangMap = tuXa.mapping ? bangCuaSheet_(tuXa.mapping, 1) : null;
  var kq = MapListing.soatThaNhamGian(cacFile.map(function (x) {
    return {
      maGianHang: x.maGianHang,
      tenFile: x.tenFile || '(không rõ tên file)',
      tenListing: (x.dong || []).map(function (d) { return d.tenListing; })
    };
  }), bangMap, cfg);

  kq.canhBao.forEach(function (c) { canhBao.push(c); });
  if (!kq.chan.length) return;

  var e = new Error(kq.chan.map(function (x) {
    return x.cau + ' (' + x.soKhac + '/' + x.khop + ' tên hàng của file đã khai ở gian kia, ' +
      x.soMinh + '/' + x.khop + ' ở gian đang thả)';
  }).join('\n'));
  e.maKeodon = 'SAI_GIAN_HANG';
  throw e;
}

function hanhDongXuLy_(body, batDau) {
  var cfg = Config.tao(body.cauHinh || {});
  var thang = chotThang_(body.thang, body.choPhepThangKhac);   // T-53: không ghi lùi, không ghi trước

  var cacFile = body.cacFile || [];
  var demDon = {};
  cacFile.forEach(function (x) {
    (x.dong || []).forEach(function (d) { demDon[x.maGianHang + '|' + d.maDonSan] = 1; });
  });
  var tongDon = Object.keys(demDon).length;
  if (tongDon > TOI_DA_DON_MOT_LO)
    throw new Error('Gói có ' + tongDon + ' đơn, quá ' + TOI_DA_DON_MOT_LO +
      ' đơn một lô. Vỏ Node phải chia lô nhỏ hơn.');

  var canhBao = [], thongBao = [];
  var f = moFileTheoId_(body, thang, canhBao);
  var ss = f.ss;

  // ---- (1) ĐỌC — y hệt hành động 'doc', chỉ lấy sheet của các gian hàng có mặt trong gói ----
  var tenSheets = [];
  cacFile.forEach(function (x) {
    var s = Config.gianHang(cfg, x.maGianHang).sheet;
    if (tenSheets.indexOf(s) < 0) tenSheets.push(s);
  });
  if (!tenSheets.length) tenSheets = Object.keys(cfg.gianHang).map(function (m) { return cfg.gianHang[m].sheet; });
  var tuXa = docTuXa_(ss, cfg, tenSheets, thang, canhBao);

  // ---- (1b) D-04: FILE CÓ ĐÚNG GIAN HÀNG KHÔNG (YC-36) ----
  //
  // Phép kiểm này PHẢI nằm ở đây chứ không nằm trên máy. Từ bản 2.4.0 đường chạy hằng ngày là `xuLy`,
  // và bảng Mapping thật nằm trên Google — máy user không đọc được nó trước khi gọi. Bản trước có phép
  // kiểm ở `node/chay-thu.js` nhưng trên đường Google nó chỉ chạy khi cấu hình khai `file_mapping_mau`,
  // mà cấu hình thật không khai, nên đường chạy hằng ngày thực tế KHÔNG được canh.
  //
  // Ở đây thì Mapping đã nằm sẵn trong tay (`tuXa.mapping`), và vẫn còn trước mọi lệnh ghi.
  kiemGianHangCuaFile_(cacFile, tuXa, cfg, canhBao);

  // ---- (2) LỚP 2 + LỚP 3 — hàm thuần, chưa chạm ô nào ----
  var goi = dungKeHoachGhi_(cfg, cacFile, tuXa, {
    ngayGhi: body.ngayGhi || null,
    tenMoiTruocDo: body.tenMoiTruocDo || []
  });
  goi.canhBao.forEach(function (c) { canhBao.push(c); });

  // ---- (3) GHI ----
  var khoa = LockService.getScriptLock();
  if (!khoa.tryLock(30000)) throw new Error('Một lệnh ghi khác đang chạy, thử lại sau vài giây');

  try {
    var k = cfg.keyin;
    var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0 };
    var viTri = {}, daDoVung = {};

    // Nối tên hàng mới vào Mapping TRƯỚC khi ghi đơn. Nếu hết giờ giữa chừng, các tên đó đã nằm sẵn
    // trong sheet, lần gọi sau đọc lại Mapping sẽ thấy có rồi và KHÔNG nối trùng (khóa chống trùng
    // của MapListing là (Gian hàng, Tên trên Shopee, Phân loại), không phải số lần chạy).
    if (goi.mappingThem.length) tk.mappingThem = themDongMapping_(ss, goi.mappingThem, canhBao);

    var sheetDaXong = [], sheetConLai = [], daLamViecGi = false, daGhiSheet = {};
    for (var i = 0; i < goi.lenh.length; i++) {
      var l = goi.lenh[i];
      var sh = ss.getSheetByName(l.tenSheet);
      if (!sh) {
        canhBao.push('Không có sheet "' + l.tenSheet + '" trong file tháng ' + thang +
          ' → bỏ qua ' + (l.don || []).length + ' đơn');
        continue;
      }
      var khoiDS = chiaKhoiDon_(l.don || [], TOI_DA_DON_MOT_KHOI);
      var conLai = 0;
      for (var j = 0; j < khoiDS.length; j++) {
        // Khối ĐẦU TIÊN của cả lần gọi luôn được chạy: nếu không, một lần gọi có thể trả về "chưa
        // làm gì" mãi mãi và phía máy tính quay vòng vô tận mà không tiến thêm ô nào.
        if (daLamViecGi && quaGioXuLy_(batDau, body.nguongGiay)) { conLai += khoiDS[j].length; continue; }
        var truocKhoi = tk.donGhi;
        ghiMotSheet_(sh, khoiDS[j], k, tk, viTri, canhBao, thongBao, daDoVung);
        if (tk.donGhi > truocKhoi) daGhiSheet[l.tenSheet] = 1;
        daLamViecGi = true;
      }
      if (conLai) sheetConLai.push({ tenSheet: l.tenSheet, soDon: conLai });
      else sheetDaXong.push(l.tenSheet);
    }

    dongDauDauThoiGian_(ss, daGhiSheet, canhBao);
    tk.mappingToLai = toLaiMapping_(ss, canhBao);        // D-47: dòng CÓ trắng lại, dòng chưa CÓ vàng
    SpreadsheetApp.flush();

    var xong = sheetConLai.length === 0;
    if (!xong) {
      thongBao.push('Dừng gọn ở ' + Math.round((new Date().getTime() - batDau) / 1000) + ' giây (ngưỡng ' +
        nguongThuc_(body.nguongGiay) + ' giây, quota Google là 360) — ' +
        'phần đã ghi giữ nguyên, gọi lại để ghi nốt ' +
        sheetConLai.map(function (x) { return x.soDon + ' đơn của "' + x.tenSheet + '"'; }).join(', ') + '.');
    }

    return {
      ok: true, hanhDong: 'xuLy', thang: thang, tenFile: ss.getName(),
      lo: body.lo || null,
      // Con số báo về là số THẬT SỰ ĐÃ GHI trong lần gọi này (không phải số dự kiến), trừ `donDaCo`
      // gộp cả hai tầng khử trùng và `tenMoi` là số tên mới lớp 2 phát hiện.
      thongKe: {
        donGhi: tk.donGhi, dongGhi: tk.dongGhi, dongVang: tk.dongVang, donGopO: tk.donGopO,
        donDaCo: goi.thongKe.donDaCo + tk.donDaCo,
        donDaCoTang1: goi.thongKe.donDaCo, donDaCoTang2: tk.donDaCo,
        donTrungTrongGoi: goi.thongKe.donTrungTrongGoi,
        tenMoi: goi.thongKe.tenMoi, mappingThem: tk.mappingThem, mappingToLai: tk.mappingToLai,
        donDuKien: goi.thongKe.donGhi, dongDuKien: goi.thongKe.dongGhi
      },
      mapTomTat: MapListing.tomTat(goi.map),
      // Khóa của mọi tên hàng mới đã nối vào Mapping (kể cả của các lượt trước). Máy gửi lại nguyên
      // danh sách này ở lượt sau để chia lô không đổi một chữ nào trong cột Note — xem chú thích
      // `tenMoiTruocDo` trong `dungKeHoachGhi_`.
      khoaTenMoi: (body.tenMoiTruocDo || []).concat(goi.khoaTenMoi),
      xong: xong, sheetDaXong: sheetDaXong, sheetConLai: sheetConLai,
      viTri: viTri, canhBao: canhBao, thongBao: thongBao,
      giay: (new Date().getTime() - batDau) / 1000
    };
  } finally {
    khoa.releaseLock();
  }
}

// ==================================================================== chạy tay để kiểm tra

/**
 * Chạy tay trong trình soạn thảo: thử mở MỘT file tháng theo link/ID và xem tên file có khớp tháng không
 * (không ghi gì). Cố ý KHÔNG in id ra log — log Apps Script ai xem cũng được, id là đường vào file tiền.
 *   thuMoFileThang('<link file tháng>', '2026-10')
 */
function thuMoFileThang(linkHoacId, thang) {
  var th = chuanHoaThang_(thang) || thangHienTai_();
  var canhBao = [];
  var f = moFileTheoId_({ spreadsheetId: linkHoacId }, th, canhBao);
  var tin = 'Bản ' + PHIEN_BAN + ' · tháng ' + th + ' → "' + f.ss.getName() + '"' +
    (canhBao.length ? ' · ' + canhBao.join(' · ') : ' · tên file khớp tháng');
  Logger.log(tin);
  return tin;
}

/**
 * Chạy NGAY SAU MỖI LẦN DEPLOY: bắt lỗi "quên dán ba file lớp 2 vào dự án Apps Script".
 * Không ghi gì, không mở file tháng nào — chỉ hỏi bốn đối tượng lõi có mặt chưa.
 * Thiếu file thì lần chạy thật đầu tiên mới hỏng, mà lúc đó user đã thả file và đang chờ.
 */
/**
 * DẤU VÂN TAY BẢN DỰNG — trả lời câu "bản trên Google là bản nào".
 *
 * VÌ SAO CẦN. Mười một file `.gs` do người dán tay, còn `PHIEN_BAN` chỉ đổi khi lên phiên bản mới.
 * Nghĩa là mọi bản dựng trong cùng một số phiên bản TRÔNG GIỐNG HỆT NHAU: dán sót một file, hay
 * dán nhầm bản cũ, thì tool vẫn chạy êm và sai lặng lẽ. Đã xảy ra đúng một lần như thế: nhật ký
 * không có câu cảnh báo nào về công thức, nhưng cột E/F/N trên Google lại trống — và không ai
 * phân biệt được "mã chạy đúng, công thức trả chuỗi rỗng" với "bản trên Google cũ hơn bản máy".
 *
 * VÌ SAO PHẢI THEO TỪNG FILE. Một số chung chỉ nằm được ở MỘT file. Dán đúng file đó bản mới mà
 * sót `Normalize.gs` bản cũ thì số chung vẫn khớp — trong khi `Normalize.gs` mới là chỗ tính tiền.
 * Ca "sót đúng một file" là ca dễ xảy ra nhất khi dán tay mười một file, nên nó phải là ca bắt
 * được chắc nhất. `typeof` là biểu thức duy nhất không ném ReferenceError với tên chưa khai báo.
 */
function vanTayBanDung_() {
  var v = {};
  v['CaiDat.gs'] = (typeof VAN_TAY_CAIDAT !== 'undefined') ? VAN_TAY_CAIDAT : null;
  v['Config.gs'] = (typeof VAN_TAY_CONFIG !== 'undefined') ? VAN_TAY_CONFIG : null;
  v['DanhMuc.gs'] = (typeof VAN_TAY_DANHMUC !== 'undefined') ? VAN_TAY_DANHMUC : null;
  v['KeyIn.gs'] = (typeof VAN_TAY_KEYIN !== 'undefined') ? VAN_TAY_KEYIN : null;
  v['Main.gs'] = (typeof VAN_TAY_MAIN !== 'undefined') ? VAN_TAY_MAIN : null;
  v['MapListing.gs'] = (typeof VAN_TAY_MAPLISTING !== 'undefined') ? VAN_TAY_MAPLISTING : null;
  v['Normalize.gs'] = (typeof VAN_TAY_NORMALIZE !== 'undefined') ? VAN_TAY_NORMALIZE : null;
  v['Schema.gs'] = (typeof VAN_TAY_SCHEMA !== 'undefined') ? VAN_TAY_SCHEMA : null;
  v['ShellAppsScript.gs'] = (typeof VAN_TAY_SHELL !== 'undefined') ? VAN_TAY_SHELL : null;
  v['TaoThangMoi.gs'] = (typeof VAN_TAY_TAOTHANGMOI !== 'undefined') ? VAN_TAY_TAOTHANGMOI : null;
  v['Utils.gs'] = (typeof VAN_TAY_UTILS !== 'undefined') ? VAN_TAY_UTILS : null;
  return v;
}

/**
 * Tên các hàm lõi THỰC SỰ CÓ MẶT trên Web App — dấu vân tay thứ hai, độc lập với dấu băm.
 *
 * Băm bắt được "file này khác bản trên máy". Danh sách hàm bắt được thứ khác: bản dán lên là bản
 * TRƯỚC KHI có tính năng đó. Hai phép độc lập nhau, và ca hỏng thật thường rơi vào cả hai.
 *
 * `camMaVanCo` là chiều ngược lại, quan trọng không kém: cả cụm mỏ neo / bảng link trên Google / chuỗi
 * bí mật đã bị bỏ hẳn (D-42, D-43). Còn hàm nào trong số đó trên Google nghĩa là bản dán lên cũ hơn bản
 * trên máy, và cái bẫy cũ vẫn đang giăng — phải kêu đúng tên hàm để người dán biết dán lại file nào.
 */
/**
 * Viết `typeof <tên>` thẳng cho từng hàm, KHÔNG tra động qua `this[ten]`: `this` chỉ là đối tượng
 * toàn cục khi hàm chạy ở chế độ sloppy, mà điều đó khác nhau giữa Apps Script và bộ nạp phía Node,
 * nên tra động sẽ báo "thiếu hết" ở một trong hai chỗ. `typeof <tên chưa khai báo>` là biểu thức
 * DUY NHẤT không ném ReferenceError — cùng lý do `thuXuLyRong` đã dùng nó.
 */
function hamLoiCoMat_() {
  var co = [], thieu = [], camMaVanCo = [];
  function xet(ten, kieu) { if (kieu === 'function') co.push(ten); else thieu.push(ten); }
  xet('mauChepCongThucDS_', typeof mauChepCongThucDS_);
  xet('chepCongThucXuong_', typeof chepCongThucXuong_);
  xet('cauDauThoiGian_', typeof cauDauThoiGian_);
  xet('ghiDauThoiGian_', typeof ghiDauThoiGian_);
  xet('phanLoaiLoiMoFile_', typeof phanLoaiLoiMoFile_);
  xet('moFileTheoId_', typeof moFileTheoId_);
  xet('kiemTenFileKhopThang_', typeof kiemTenFileKhopThang_);
  xet('toLaiMapping_', typeof toLaiMapping_);
  xet('kiemCotDuocGhi_', typeof kiemCotDuocGhi_);
  xet('doCotNote_', typeof doCotNote_);
  xet('hanhDongXuLy_', typeof hanhDongXuLy_);
  // Hàm của bản CŨ (mỏ neo · bảng link trên Google · chuỗi bí mật). Còn trên Google nghĩa là bản dán lên
  // cũ hơn bản trên máy — và cái bẫy mỏ neo cùng cửa bí mật vẫn đang giăng ở đó.
  if (typeof capNhatMoNeo_ === 'function') camMaVanCo.push('capNhatMoNeo_');
  if (typeof moNeo_ === 'function') camMaVanCo.push('moNeo_');
  if (typeof fileCuaThang_ === 'function') camMaVanCo.push('fileCuaThang_');
  if (typeof bangLinkThang_ === 'function') camMaVanCo.push('bangLinkThang_');
  if (typeof biMatDung_ === 'function') camMaVanCo.push('biMatDung_');
  if (typeof caiDat === 'function') camMaVanCo.push('caiDat');
  return { co: co, thieu: thieu, camMaVanCo: camMaVanCo };
}

function thuXuLyRong() {
  // `typeof <tên chưa khai báo>` là biểu thức DUY NHẤT không ném ReferenceError trong JavaScript — đó là
  // lý do dùng typeof ở đây thay vì thử gọi hàm rồi bắt lỗi.
  //
  // C-6.4: ĐẾM ĐỦ 11 FILE. Bản trước chỉ đếm 7 rồi in "đủ 7 file lõi", câu đó đọc như một lời bảo đảm đã
  // dán đủ — đúng chỗ người dán tay sẽ tin nhầm. Bằng chứng dán ĐÚNG BẢN vẫn là mã bản dựng, không phải
  // con số file: thiếu file thì kêu tên file, dán nhầm bản cũ thì lệch mã bản dựng.
  var can = [
    ['Utils.gs', typeof Utils], ['Schema.gs', typeof SCHEMA], ['CaiDat.gs', typeof CaiDat],
    ['Config.gs', typeof Config], ['DanhMuc.gs', typeof DanhMuc], ['MapListing.gs', typeof MapListing],
    ['Normalize.gs', typeof Normalize], ['KeyIn.gs', typeof KeyIn], ['Main.gs', typeof chayDongBo],
    ['TaoThangMoi.gs', typeof TaoThangMoi]
  ];
  var thieu = [];
  for (var i = 0; i < can.length; i++) if (can[i][1] === 'undefined') thieu.push(can[i][0]);
  var co = can.length - thieu.length + 1;          // +1: chính file này đang chạy
  var hl = hamLoiCoMat_();
  var dau = ' · bản dựng ' + ((typeof BAN_DUNG !== 'undefined') ? BAN_DUNG : '(chưa có dấu vân tay)') +
    ' — bằng chứng dán ĐÚNG BẢN là mã này trùng var BAN_DUNG cuối src/ShellAppsScript.gs trên máy';
  if (hl.thieu.length) dau += ' · THIẾU HÀM LÕI: ' + hl.thieu.join(', ') + ' — bản dán lên cũ hơn bản trên máy';
  if (hl.camMaVanCo.length) dau += ' · CÒN HÀM ĐÃ BỎ: ' + hl.camMaVanCo.join(', ') + ' — bản dán lên cũ hơn bản trên máy';
  var tin = thieu.length
    ? 'THIẾU FILE trong dự án Apps Script (mới thấy ' + co + '/11): ' + thieu.join(', ') +
      ' — dán nốt rồi Deploy → Manage deployments → New version.' + dau
    : 'Bản ' + PHIEN_BAN + ' · đủ 11/11 file .gs · hành động xuLy dùng được.' + dau;
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

var VAN_TAY_SHELL = '346c1fb5';   // dấu vân tay file này — MÁY sinh bằng `npm run dau-van-tay`, đừng sửa tay

var BAN_DUNG = '8f02bd753878';   // dấu vân tay CẢ BẢN DỰNG — MÁY sinh, đừng sửa tay
