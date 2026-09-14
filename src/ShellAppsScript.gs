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
 *     link `/exec` vẫn chạy bản cũ. Mọi phản hồi kèm `banWebApp` + `mayToiThieu` + `banDung`: bên nào DƯỚI MỐC
 *     của bên kia là TỪ CHỐI GHI (YC-42, `MAY_TOI_THIEU` / `WEB_APP_TOI_THIEU`), khác bản trong khoảng thì máy nhắc
 *     một dòng và vẫn ghi; cùng bản mà lệch dấu vân tay thì máy cảnh báo (`soDauVanTay` trong node/gsheet-web-app.js).
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
 * Số bản của vỏ Google — bằng `PHIEN_BAN` trong `node/gsheet-web-app.js` và `version` của package.json khi phát hành.
 * Mọi phản hồi đã qua cửa bí mật kèm bản thật này ở trường `banWebApp`.
 */
var PHIEN_BAN = '2.7.1';

/**
 * YC-42: bản MÁY thấp nhất Web App này còn phục vụ gói ghi (`ghi`, `xuLy`, `taoThangMoi`). Dưới mốc → từ chối
 * `LECH_PHIEN_BAN` với câu nói rõ máy cũ và việc phải làm; từ mốc trở lên thì phục vụ dù khác bản. Tới 2.6.1 cửa này đòi
 * BẰNG tuyệt đối — lệch chiều nào cũng ngừng ghi, mỗi lần lên bản là một khoảng chết. CHỈ nâng mốc khi đổi GIAO THỨC.
 */
var MAY_TOI_THIEU = '2.5.0';

/**
 * Số `phienBan` sẽ trả cho gói ĐANG xử lý (đặt ở đầu `doPost`). Máy tới 2.6.1 có cửa BẰNG tuyệt đối: nó chỉ ghi khi
 * `phienBan` trong phản hồi bằng đúng bản của nó. Với máy đó (gói không có `banMay`) mà bản còn trong khoảng, Web App trả
 * lại đúng số máy gửi — nhờ vậy Deploy 2.7.0 lên trước không làm máy 2.6.1 ngừng ghi trong lúc chờ bấm nút 2. Bản thật của
 * Web App luôn ở `banWebApp`. Máy từ 2.7.0 gửi `banMay` và nhận `phienBan` = bản thật.
 */
var PHIEN_BAN_TRA_LOI_ = '';

/**
 * Khóa Script Property giữ chuỗi bí mật. GIỮ NGUYÊN từ bản 09/9 — chuỗi đã cài trên dự án Apps Script
 * thật vẫn dùng tiếp, chủ dự án không phải chạy lại `caiDat`.
 *
 * Ngày 13/9 chủ dự án làm rõ lại D-43: KHÔNG bỏ chuỗi bí mật. Cái bỏ là việc bắt user ĐIỀN TAY —
 * gói giao user mang sẵn chuỗi, nên ai có gói mới ghi được, và kiểm soát nằm ở chỗ kiểm soát ai nhận gói.
 * Link Web App là `Anyone` nên không có chuỗi thì bất cứ ai dò trúng link đều ghi được vào sổ tiền.
 */
var TT_BI_MAT = 'KEODON_BI_MAT';

/** Script Property của cơ chế mỏ neo đã bỏ (D-42). Chỉ còn để `caiDat()` tìm và gỡ trên dự án cũ. */
var TT_MO_NEO_CU = 'KEODON_MO_NEO_ID';

var MUI_GIO = 'Asia/Ho_Chi_Minh';
var MAU_VANG = '#FFF2CC';
var TOI_DA_DON_MOT_LO = 400;

/**
 * Ngưỡng tự dừng của hành động 'xuLy', tính từ lúc doPost nhận gói. Quota cứng của Google là 360 giây.
 *
 * Chọn 240 (4 phút) chứ không sát 360, vì sau khi vượt ngưỡng script CÒN PHẢI làm xong:
 *   · khối ghi đang dở (tới 100 đơn: setValues 8 cột + mergeVertically 6 cột + setBackgrounds cả dòng),
 *   · SpreadsheetApp.flush() — lệnh này mới là lúc Google thật sự đẩy dữ liệu đi, đo được tới hàng chục giây
 *     trên sheet nhiều công thức như file tháng (19 sheet tham chiếu chéo, hàng nghìn ô công thức từng dòng),
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
 * D-57 (chủ dự án chốt 13/9): "tôi chỉ cần công thức lúc nào cũng đúng, không muốn có những dòng trống
 * công thức". Sheet gian hàng luôn có công thức E/F/L/M/N kéo sẵn tới DÒNG DỮ LIỆU CUỐI + 2.000. Trước
 * mỗi lượt ghi, cột nào còn dưới 200 dòng công thức phía dưới dòng dữ liệu cuối thì kéo lại cho đủ.
 */
var SO_DONG_KEO_CONG_THUC = 2000;
var NGUONG_CON_CONG_THUC = 200;

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
 * id file nào. Script Property cũ `KEODON_MO_NEO_ID` nếu còn sót trên dự án thật thì `caiDat()` GỠ HẲN
 * (YC-40.4 — đề YC-31 điểm 3 là "kiểm VÀ GỠ"; bản 2.5.0 chỉ báo). Không mã nào đọc nó nữa, nhưng để lại
 * một ID file tháng nằm trong thuộc tính của dự án là để lại một đường vào sổ tiền không ai canh.
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
  if (p.getProperty(TT_MO_NEO_CU)) {
    p.deleteProperty(TT_MO_NEO_CU);
    tin += ' · Đã gỡ thuộc tính cũ ' + TT_MO_NEO_CU + ' (không dùng nữa từ D-42)';
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
    if (o.phienBan == null) o.phienBan = PHIEN_BAN_TRA_LOI_ || PHIEN_BAN;
    // YC-42: bản thật + mốc máy tối thiểu — máy từ 2.7.0 đọc hai trường này để xét khoảng tương thích.
    if (o.banWebApp == null) o.banWebApp = PHIEN_BAN;
    if (o.mayToiThieu == null) o.mayToiThieu = MAY_TOI_THIEU;
    // Dấu vân tay bản dựng đi kèm mọi phản hồi ĐÃ QUA CỬA (12 ký tự, rẻ) để máy so được mà không tốn
    // thêm một lượt gọi — thêm lượt `ping` sẽ phá các bài đang đếm chính xác số lượt gọi mạng.
    if (o.banDung == null && typeof BAN_DUNG !== 'undefined') o.banDung = BAN_DUNG;
  }
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * YC-42: câu từ chối khi MÁY dưới mốc — viết cho người không rành máy: bên nào cũ, việc phải làm, tool chưa ghi gì.
 * Bản Node (`thongBaoMayQuaCu` trong node/gsheet-web-app.js) phải giống hệt từng chữ — máy in nguyên văn câu này.
 */
function thongBaoMayQuaCu_(banMay, toiThieu) {
  return 'MÁY NÀY ĐANG CHẠY BẢN QUÁ CŨ — máy là bản ' + banMay + ', Web App trên Google chỉ còn phục vụ máy từ bản ' + toiThieu +
    ' trở lên. Tool CHƯA ghi gì. Việc phải làm: bấm 2_CAP_NHAT.bat, đợi báo cập nhật xong, rồi bấm lại.';
}

/** '2.6.1' ≥ '2.5.0'? So từng số. Không đọc được số bản (rỗng, chữ) → false: không đoán. */
function banDuTu_(ban, moc) {
  var re = /^\d+(\.\d+)+$/;
  var a = String(ban == null ? '' : ban).trim(), b = String(moc == null ? '' : moc).trim();
  if (!re.test(a) || !re.test(b)) return false;
  var x = a.split('.'), y = b.split('.');
  for (var i = 0; i < Math.max(x.length, y.length); i++) {
    var p = Number(x[i] || 0), q = Number(y[i] || 0);
    if (p !== q) return p > q;
  }
  return true;
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
 * Link hoặc ID → spreadsheet ID. Nhận: link có '#gid=', link không có '/edit', link dạng `/spreadsheets/u/<số>/d/`
 * (thanh địa chỉ khi trình duyệt đăng nhập nhiều tài khoản Google — YC-41 việc 1), và chuỗi ID trần (≥ 20 ký tự,
 * đúng bảng chữ của Google). Không nhận ra → '' (phía gọi tự báo lỗi, KHÔNG in lại giá trị nhận được).
 */
function bocIdTuLink_(x) {
  var t = String(x == null ? '' : x).trim();
  var m = t.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)/);
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
/**
 * @param {string} [viecTaoThang] có = gọi từ nút 3 (tạo tháng): nhãn trường chứa link, ví dụ '[6/7]'. Câu lỗi khi đó
 *   nói việc của NÚT 3 (đổi tên bản sao / kiểm lại link trường đó) — câu của nút 4 bảo "khai link_thang hoặc chế độ 2"
 *   mà theo ở đây là khai link cho một bản sao CHƯA chuyển sổ.
 */
function kiemTenFileKhopThang_(ss, thang, canhBao, viecTaoThang) {
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
  if (viecTaoThang) {
    var e2 = new Error('Link ' + viecTaoThang + ' trỏ tới file "' + ten + '" (tên file ghi tháng ' + cua + ') — không phải file của tháng ' +
      mong + '. Tool DỪNG, chưa ghi ô nào.');
    e2.maKeodon = 'SAI_THANG_FILE';
    throw e2;
  }
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
  PHIEN_BAN_TRA_LOI_ = '';   // Apps Script dựng lại phạm vi toàn cục mỗi lượt gọi; giả lập thì không — xóa số của gói trước
  var body;
  try {
    body = JSON.parse(e && e.postData ? e.postData.contents : '{}');
  } catch (err) {
    return traLoi_({ ok: false, loi: 'JSON_HONG', thongBao: 'Gói gửi lên không phải JSON hợp lệ' });
  }

  var hd = String(body.hanhDong || '').trim().toLowerCase();
  var mongDoi = body.phienBanMongDoi == null ? '' : String(body.phienBanMongDoi);
  // YC-42: máy từ 2.7.0 gửi bản THẬT của nó ở `banMay`; máy cũ hơn (cửa bằng tuyệt đối) chỉ gửi `phienBanMongDoi` = bản của nó.
  var coBanMay = body.banMay != null && String(body.banMay).trim() !== '';
  var banMay = coBanMay ? String(body.banMay).trim() : mongDoi;
  PHIEN_BAN_TRA_LOI_ = (!coBanMay && mongDoi && banDuTu_(mongDoi, MAY_TOI_THIEU)) ? mongDoi : PHIEN_BAN;

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

  // Máy DƯỚI MỐC thì TỪ CHỐI GHI (YC-42 — khoảng tương thích, không còn đòi bằng tuyệt đối). Chặn các nhánh có ghi
  // ('ghi', 'xuLy', 'taoThangMoi'); 'ping' và 'doc' phải chạy được để người ta nhìn thấy con số mà đi cập nhật — chặn luôn
  // thì chỉ còn lỗi "không gọi được". Chiều ngược lại (Google dưới mốc của máy) do phía máy bắt: nó xét `banWebApp` /
  // `phienBan` trong phản hồi trước khi gửi lệnh ghi. Gói không khai bản nào (công cụ chạy tay) giữ như cũ: không xét.
  if ((hd === 'ghi' || hd === 'xuly' || hd === 'taothangmoi') && banMay && !banDuTu_(banMay, MAY_TOI_THIEU)) {
    return traLoi_({ ok: false, loi: 'LECH_PHIEN_BAN', thongBao: thongBaoMayQuaCu_(banMay, MAY_TOI_THIEU) });
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
    if (hd === 'taothangmoi') return traLoi_(hanhDongTaoThangMoi_(body, batDau));   // YC-35, nút 3 chế độ 1
    if (hd === 'cotaothang') return traLoi_(hanhDongCoTaoThang_(body));             // 2.7.1: đọc lại cờ sau lỗi đường truyền
    return traLoi_({ ok: false, loi: 'HANH_DONG_LA', thongBao: 'hanhDong = "' + hd + '"; chỉ nhận: ping, doc, ghi, xuLy, taoThangMoi, coTaoThang' });
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
    var maDon = {};
    var dongCuoi = dongDuLieuCuoi_(sh, k, het);
    if (het >= k.dong_dau) {
      var cot = sh.getRange(k.dong_dau, k.cot_ma_don, het - k.dong_dau + 1, 1).getDisplayValues();
      for (var i = 0; i < cot.length; i++) {
        var ma = String(cot[i][0] || '').trim();
        if (!ma) continue;
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
    var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0, dongKeoCongThuc: 0 };
    var viTri = {}, canhBao = [], thongBao = [], daDoVung = {};
    var f = moFileTheoId_(body, thang, canhBao);
    var ss = f.ss;
    kiemHopDongFileThang_(ss, cfg);                     // YC-38.1: lệch khuôn là dừng khi chưa ghi gì

    // D-57 / YC-39: kiểm + kéo sẵn công thức cho MỌI sheet sắp ghi, TRƯỚC lệnh ghi đầu tiên. Cột nào không
    // còn công thức nào thì dừng ở đây — "Tool chưa ghi gì" phải là câu nói thật.
    chuanBiCongThuc_(ss, lenh.map(function (l) { return l.tenSheet; }), k, tk, thongBao);

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
      tk.mappingThem = themDongMapping_(ss, body.mappingThem, canhBao, body.mappingThemCot);
    tk.mappingToLai = toLaiMapping_(ss, canhBao);        // D-47: dòng CÓ trắng lại, dòng chưa CÓ vàng

    SpreadsheetApp.flush();
    var ttMapG = tomTatMapping_(ss);                      // YC-38.3: số dòng CÓ + băm Mapping cho dòng RUN
    ghiDongRun_(body, 'ghi', ss.getName(), tk, ttMapG);
    return {
      ok: true, hanhDong: 'ghi', thang: thang, tenFile: ss.getName(),
      lo: body.lo || null, thongKe: tk, viTri: viTri, canhBao: canhBao, thongBao: thongBao,
      runId: runIdHopLe_(body.runId) || null,
      mappingCo: ttMapG ? ttMapG.soCo : null, mappingBam: ttMapG ? ttMapG.bam : null,
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
  var cNote = kiemCuaGhi_(sh, k);

  // KHỬ TRÙNG TẦNG 2 — đọc lại cột mã đơn NGAY TRƯỚC KHI GHI, và đang ở trong LockService của
  // hanhDongGhi_. Tầng 1 (node/chay-google-sheet.js) khử theo danh sách lấy từ hành động 'doc',
  // nhưng danh sách đó đã cũ vài giây: 2-3 máy user cùng ghi một file tháng, máy A không thể
  // biết máy B vừa nối gì. Không có tầng 2 thì hai máy bấm cùng lúc là sinh đơn trùng.
  // getDisplayValues đọc được cả mã nằm trong Ô GỘP (ô gộp giữ giá trị ở ô trên cùng) — T-43.
  var het = sh.getLastRow();
  var daCo = {};
  if (het >= k.dong_dau) {
    var cot = sh.getRange(k.dong_dau, k.cot_ma_don, het - k.dong_dau + 1, 1).getDisplayValues();
    for (var i = 0; i < cot.length; i++) {
      var maCu = String(cot[i][0] || '').trim();
      if (!maCu) continue;
      if (daCo[maCu] == null) daCo[maCu] = k.dong_dau + i;
    }
  }
  // DÒNG DỮ LIỆU CUỐI theo A/C/D/G — KHÔNG theo riêng cột C (YC-39.1). Xem `dongDuLieuCuoi_`: đơn nhiều
  // mặt hàng GỘP Ô cột C, ô con trả rỗng, và bản trước lấy dòng cuối theo cột C nên lượt ghi sau ĐÈ LÊN
  // các dòng con của đơn cuối cùng. `T-CT-13` dựng lại đúng ca đó.
  var dongCuoi = dongDuLieuCuoi_(sh, k, het);

  return ghiKhoiDon_(sh, donDS, k, tk, viTri, canhBao, thongBao, cNote, daCo, dongCuoi);
}

/**
 * MỘT CỬA DUY NHẤT cho mọi chỉ số cột tool sẽ ghi vào sheet gian hàng. Trả cột Note đã qua cửa.
 * Tách riêng để `chuanBiCongThuc_` gọi được TRƯỚC khi kéo công thức: cấu hình trỏ nhầm cột cấm thì phải
 * dừng khi chưa có lệnh ghi nào — kể cả lệnh kéo công thức.
 */
function kiemCuaGhi_(sh, k) {
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
  return cNote;
}

function ghiKhoiDon_(sh, donDS, k, tk, viTri, canhBao, thongBao, cNote, daCo, dongCuoi) {
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

  // D-57 / YC-39.2: KHÔNG BAO GIỜ ghi một dòng đơn thiếu công thức. Kiểm năm cột E/F/L/M/N đúng ở các dòng
  // sắp ghi, TRƯỚC lệnh ghi giá trị đầu tiên. Cả cột không còn ô công thức nào → dừng tại đây (bình
  // thường `chuanBiCongThuc_` đã dừng từ trước; đây là lưới thứ hai cho đường gọi thẳng hàm này).
  var mauDS = mauChepCongThucDS_(sh, k, sh.getLastRow(), cNote);
  mauDS.forEach(function (m) {
    if (!m.cuoi && !m.tran) throw loiThieuCongThuc_(sh.getName(), m.cot, k);
  });

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

  // Điền công thức vào những ô CÒN THIẾU trong khối vừa ghi, chép từ ô công thức gần nhất phía trên.
  chepCongThucXuong_(sh, k, mauDS, r0Khoi, soDongTong);

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
 * DÒNG DỮ LIỆU CUỐI của sheet gian hàng = dòng cuối cùng có giá trị ở cột Ngày, Mã đơn, Tên viết tắt hoặc
 * Số lượng. KHÔNG theo cột công thức E/F/L/M/N: ô công thức trả `""` không phải dữ liệu, mà sau D-57 công
 * thức kéo sẵn 2.000 dòng — lấy theo `getLastRow()` là nhảy thẳng xuống dòng 2003.
 *
 * VÌ SAO KHÔNG CHỈ ĐỌC CỘT C (lỗi thật, tìm thấy 13/9 khi làm YC-39): đơn nhiều mặt hàng GỘP Ô cột C, và
 * Google trả rỗng ở mọi ô con của cụm gộp. Đơn cuối cùng của sheet có ba mặt hàng ở dòng 10–12 thì cột C
 * chỉ thấy dòng 10, lượt ghi sau bắt đầu từ dòng 11 và ĐÈ lên hai mặt hàng còn lại của đơn đó — mất dữ
 * liệu, trái INV-1. Bộ test cũ không bắt được vì bản chạy một mạch và bản bị cắt giữa chừng mắc CÙNG lỗi
 * nên vẫn "giống hệt nhau". Cột Ngày và Số lượng được tool ghi ở MỌI dòng, không gộp — đó là mốc chắc.
 */
function dongDuLieuCuoi_(sh, k, het) {
  var cuoi = k.dong_dau - 1;
  if (het < k.dong_dau) return cuoi;
  var n = het - k.dong_dau + 1;
  [k.cot_ngay, k.cot_ma_don, k.cot_ten_viet_tat, k.cot_so_luong].forEach(function (c) {
    if (!c) return;
    var v = sh.getRange(k.dong_dau, c, n, 1).getDisplayValues();
    for (var i = v.length - 1; i >= 0; i--) {
      if (String(v[i][0] == null ? '' : v[i][0]).trim() !== '') {
        if (k.dong_dau + i > cuoi) cuoi = k.dong_dau + i;
        break;
      }
    }
  });
  return cuoi;
}

/** Năm cột mang công thức TỪNG DÒNG của sheet gian hàng: `cot_cong_thuc` + `cot_doanh_thu`, trừ cột Note. */
function cotCongThucGianHang_(k, cNote) {
  var cot = (k.cot_cong_thuc || []).slice();
  if (cot.indexOf(k.cot_doanh_thu) < 0) cot.push(k.cot_doanh_thu);
  return cot.map(Number).filter(function (c) { return c && c !== Number(cNote); })
    .sort(function (a, b) { return a - b; });
}

/**
 * ĐO TỪNG CỘT CÔNG THỨC một lần, bằng MỘT lệnh đọc cả cột (`getFormulasR1C1`), không đọc từng ô.
 *
 * Vì sao phải đọc cả khối: sau D-57 mỗi cột có tới hơn 2.000 ô công thức. Đọc từng ô là hàng nghìn lượt
 * gọi dịch vụ Google cho mỗi sheet — đủ để một lượt ghi chạm trần 6 phút trước khi ghi được đơn nào.
 *
 * Mỗi cột trả: `cuoi` dòng công thức cuối (0 = cả cột không có ô nào) · `text` công thức R1C1 ở dòng đó ·
 * `tran` = cột là MỘT ARRAYFORMULA thật đặt ở dòng đầu, tự tràn xuống — không chép, không kéo (chép đè
 * là giết vùng tràn). `ARRAY_CONSTRAIN(…;1;1)` KHÔNG tính là tràn: đó là công thức từng dòng.
 * `ds` là mảng công thức từ `dong_dau` tới `het`, để người gọi khỏi đọc lại.
 */
function mauChepCongThucDS_(sh, k, het, cNote) {
  var ra = [];
  var n = Math.max(0, het - k.dong_dau + 1);
  cotCongThucGianHang_(k, cNote).forEach(function (c) {
    kiemCotDuocGhi_(c, 'keyin.cot_cong_thuc', VIEC_CHEP_CONG_THUC);
    var ds = n ? sh.getRange(k.dong_dau, c, n, 1).getFormulasR1C1() : [];
    var cuoi = 0, dau = 0, text = '';
    for (var i = 0; i < ds.length; i++) {
      var t = ds[i][0];
      if (!t) continue;
      if (!dau) dau = k.dong_dau + i;
      cuoi = k.dong_dau + i;
      text = String(t);
    }
    var tran = COT_CAM_GHI.indexOf(c) >= 0 && dau === k.dong_dau && cuoi === k.dong_dau &&
      /ARRAYFORMULA/i.test(text) && !/ARRAY_CONSTRAIN/i.test(text);
    ra.push({ cot: c, cuoi: cuoi, text: text, tran: tran, ds: ds });
  });
  return ra;
}

function loiThieuCongThuc_(tenSheet, cot, k) {
  var e = new Error('SHEET ' + tenSheet + ' CỘT ' + Utils.chuCot(cot) + ' KHÔNG CÒN CÔNG THỨC NÀO — mở file ' +
    'tháng trước, chép công thức cột đó vào dòng ' + k.dong_dau + ' rồi chạy lại. Tool chưa ghi gì.');
  e.maKeodon = 'THIEU_CONG_THUC';
  return e;
}

/**
 * D-57 / YC-39.1 — CHUẨN BỊ CÔNG THỨC cho mọi sheet sắp ghi, gọi MỘT LẦN trong LockService, TRƯỚC mọi lệnh
 * ghi của lượt (kể cả nối dòng Mapping).
 *
 * Ba bước, đúng thứ tự, và KHÔNG ghi gì cho tới hết bước 2:
 *   1. Qua cửa cột cấm (`kiemCuaGhi_`) cho từng sheet — cấu hình trỏ nhầm thì dừng khi chưa kéo gì.
 *   2. Đo năm cột của từng sheet. Cột nào KHÔNG CÒN Ô CÔNG THỨC NÀO → dừng `THIEU_CONG_THUC`. Tool không
 *      tự dựng công thức (D-15): công thức là của chủ shop, đoán sai thì sai lặng lẽ trên mọi dòng.
 *   3. Sheet nào có cột còn dưới `NGUONG_CON_CONG_THUC` dòng công thức phía dưới dòng dữ liệu cuối → kéo
 *      CẢ NĂM CỘT tới dòng dữ liệu cuối + `SO_DONG_KEO_CONG_THUC`. Mỗi cột chép công thức R1C1 của CHÍNH
 *      ô công thức cuối cùng của nó (ô gần nhất phía trên vùng kéo) — nguyên văn, có hay không có IFERROR
 *      cũng vậy. R1C1 giống hệt nhau nghĩa là tham chiếu tương đối tự dịch theo dòng, y như `copyTo`.
 *
 * Idempotent: vừa kéo xong thì mỗi cột còn đúng 2.000 dòng phía dưới dữ liệu, lượt sau không kéo nữa cho
 * tới khi dữ liệu ăn vào quá 1.800 dòng.
 */
function chuanBiCongThuc_(ss, dsTenSheet, k, tk, thongBao) {
  var daXet = {}, sheets = [];
  (dsTenSheet || []).forEach(function (ten) {
    if (!ten || daXet[ten]) return;
    daXet[ten] = 1;
    var sh = ss.getSheetByName(ten);
    if (!sh) return;                                    // người gọi tự báo "không có sheet"
    var cNote = kiemCuaGhi_(sh, k);                     // bước 1
    var het = sh.getLastRow();
    sheets.push({ sh: sh, ten: ten, cuoiDL: dongDuLieuCuoi_(sh, k, het), mau: mauChepCongThucDS_(sh, k, het, cNote) });
  });

  var thieu = [];                                       // bước 2 — gom HẾT rồi mới dừng
  sheets.forEach(function (x) {
    x.mau.forEach(function (m) { if (!m.cuoi) thieu.push(loiThieuCongThuc_(x.ten, m.cot, k)); });
  });
  if (thieu.length) {
    if (thieu.length === 1) throw thieu[0];
    var e = new Error(thieu.map(function (t) { return t.message; }).join('\n'));
    e.maKeodon = 'THIEU_CONG_THUC';
    throw e;
  }

  sheets.forEach(function (x) {                         // bước 3
    var canKeo = x.mau.some(function (m) { return !m.tran && (m.cuoi - x.cuoiDL) < NGUONG_CON_CONG_THUC; });
    if (!canKeo) return;
    var dich = x.cuoiDL + SO_DONG_KEO_CONG_THUC;
    if (dich > x.sh.getMaxRows()) x.sh.insertRowsAfter(x.sh.getMaxRows(), dich - x.sh.getMaxRows());
    var soDong = 0;
    x.mau.forEach(function (m) {
      if (m.tran || !m.cuoi || m.cuoi >= dich) return;     // !m.cuoi: không có mẫu thì KHÔNG BAO GIỜ kéo (D-15)
      kiemCotDuocGhi_(m.cot, 'kéo công thức cột ' + Utils.chuCot(m.cot), VIEC_CHEP_CONG_THUC);
      var n = dich - m.cuoi, o = [];
      for (var i = 0; i < n; i++) o.push([m.text]);
      x.sh.getRange(m.cuoi + 1, m.cot, n, 1).setFormulasR1C1(o);
      soDong = Math.max(soDong, n);
    });
    if (soDong) {
      tk.dongKeoCongThuc = (tk.dongKeoCongThuc || 0) + soDong;
      thongBao.push('Sheet "' + x.ten + '": kéo sẵn công thức E/F/L/M/N tới dòng ' + dich +
        ' (dòng dữ liệu cuối ' + x.cuoiDL + ' + ' + SO_DONG_KEO_CONG_THUC + ') — D-57.');
    }
  });
}

/**
 * D-57 / YC-39.2 — ĐIỀN CÔNG THỨC VÀO CÁC Ô CÒN THIẾU trong khối dòng tool vừa ghi.
 *
 * Bình thường không có gì để điền: `chuanBiCongThuc_` đã kéo sẵn 2.000 dòng. Hàm này là lưới cho ca
 * user XÓA TAY công thức giữa vùng (ví dụ xóa M100:M300 trong khi công thức vẫn còn ở M301 trở xuống):
 * kéo sẵn không kích hoạt vì cột vẫn dài, nhưng các dòng sắp ghi lại trống công thức.
 *
 * Luật: chỉ điền ô TRỐNG; ô đã có công thức giữ nguyên, không ghi lại. Mẫu là ô công thức GẦN NHẤT PHÍA
 * TRÊN ô trống (trong khối, hoặc phía trên khối); không có phía trên thì lấy ô gần nhất phía dưới. Ghi
 * theo TỪNG ĐOẠN liền mạch các ô trống, mỗi đoạn một lệnh `setFormulasR1C1`.
 */
function chepCongThucXuong_(sh, k, mauDS, r0Khoi, soDong) {
  (mauDS || []).forEach(function (m) {
    if (m.tran || !m.cuoi) return;
    var ds = m.ds || [];
    var ctO = function (r) {                            // công thức đang có ở dòng r (theo lần đọc đầu)
      var i = r - k.dong_dau;
      return (i >= 0 && i < ds.length && ds[i][0]) ? String(ds[i][0]) : '';
    };
    var tren = '';
    for (var r = r0Khoi - 1; r >= k.dong_dau; r--) { if (ctO(r)) { tren = ctO(r); break; } }
    var doan = null, doanDS = [];
    var dong = function () {
      if (!doan) return;
      kiemCotDuocGhi_(m.cot, 'chép công thức cột ' + Utils.chuCot(m.cot), VIEC_CHEP_CONG_THUC);
      sh.getRange(doan.r, m.cot, doanDS.length, 1).setFormulasR1C1(doanDS);
      doan = null; doanDS = [];
    };
    for (var n = 0; n < soDong; n++) {
      var rr = r0Khoi + n, co = ctO(rr);
      if (co) { dong(); tren = co; continue; }
      var mau = tren || m.text;                           // không có phía trên → ô công thức cuối của cột
      if (!doan) doan = { r: rr };
      doanDS.push([mau]);
    }
    dong();
  });
}

/**
 * Nối tên hàng mới vào cuối sheet Mapping và tô vàng để người ta thấy mà điền.
 *
 * GHI THEO TÊN CỘT, KHÔNG THEO VỊ TRÍ (YC-38.1, lỗi thật tìm thấy 13/9). `MapListing` đọc Mapping theo tên
 * cột, và chấp nhận thêm cột phụ như `Mã dùng lần lượt khi hết lô` — bảng Mapping nghiệm thu NT1 có cột đó
 * ở vị trí E. Nhưng bản trước ghi 12 giá trị vào A:L theo thứ tự `SCHEMA.MAPPING`, nên trên khuôn đó giá trị
 * `Hệ số` rơi vào cột lô phụ, `Cấu phần` rơi vào `Hệ số`… lệch cả dòng mà không báo gì.
 *
 * @param {Array} dong        các dòng cần nối, mỗi dòng là mảng theo thứ tự `tenCotDong`
 * @param {Array} [tenCotDong] tên cột của từng vị trí trong `dong` (đầu ra `MapListing.sangBang(map)[0]`);
 *                            thiếu thì coi là `SCHEMA.MAPPING` (máy bản cũ chưa gửi trường này)
 */
function themDongMapping_(ss, dong, canhBao, tenCotDong) {
  var sh = sheetMapping_(ss);
  if (!sh) {
    canhBao.push('Chưa có sheet "' + TEN_TAB_MAPPING_SHEET + '" → không ghi được ' + dong.length + ' tên hàng mới');
    return 0;
  }
  var cotNguon = (tenCotDong && tenCotDong.length) ? tenCotDong : SCHEMA.MAPPING;
  var rong = Math.max(sh.getLastColumn(), SCHEMA.MAPPING.length);
  var head = sh.getRange(1, 1, 1, rong).getDisplayValues()[0];
  var chuan = (typeof MapListing !== 'undefined' && MapListing.tenCotChuan) ? MapListing.tenCotChuan :
    function (x) { return String(x == null ? '' : x).trim(); };
  var viTri = {};
  for (var i = 0; i < head.length; i++) {
    var ten = chuan(head[i]);
    if (ten && viTri[ten] == null) viTri[ten] = i;
  }
  var boQua = {};
  var bang = dong.map(function (d) {
    var h = [];
    for (var j = 0; j < rong; j++) h.push('');
    cotNguon.forEach(function (tenCot, k) {
      var v = d[k];
      if (v == null || v === '') return;
      var cot = viTri[tenCot];
      if (cot == null) { boQua[tenCot] = 1; return; }
      h[cot] = v;
    });
    return h;
  });
  if (Object.keys(boQua).length) {
    canhBao.push('Sheet Mapping không có cột ' + Object.keys(boQua).map(function (x) { return '"' + x + '"'; }).join(', ') +
      ' → phần đó của tên hàng mới không ghi được; các cột khác vẫn ghi đúng chỗ.');
  }
  var r0 = Math.max(sh.getLastRow() + 1, 2);
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
  var bangMapMoi = map.soThem > 0 ? MapListing.sangBang(map) : null;
  var mappingThem = bangMapMoi ? bangMapMoi.slice(-map.soThem) : [];
  var mappingThemCot = bangMapMoi ? bangMapMoi[0] : null;      // tên cột của từng vị trí — ghi theo tên
  var khoaTenMoi = (map.tenMoi || []).map(function (d) { return d.__khoa; });
  return {
    lenh: lenh, mappingThem: mappingThem, mappingThemCot: mappingThemCot, thongKe: thongKe, canhBao: canhBao, map: map,
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
    return x.cau + ' (' + x.soKhac + '/' + x.tong + ' tên hàng của file đã khai ở gian kia, ' +
      x.soMinh + '/' + x.tong + ' ở gian đang thả)';
  }).join('\n'));
  e.maKeodon = 'SAI_GIAN_HANG';
  throw e;
}

/**
 * YC-38.1 — "HỢP ĐỒNG" FILE THÁNG: những thứ tool dựa vào để ghi đúng chỗ. Kiểm TRƯỚC MỖI LƯỢT GHI, chỉ đọc.
 *
 * Vì sao phải có: tool ghi theo VỊ TRÍ (cột C là mã đơn, cột H là tiền, Mapping ghi 12 cột theo thứ tự).
 * Chủ shop đổi tên hay chèn một cột là tool ghi lệch cột toàn bộ mà không có gì báo — tiền rơi vào cột thuế,
 * mã đơn rơi vào cột tên hàng, khóa chống trùng chết và lần chạy sau nhân đôi đơn. Phát hiện sau khi ghi là
 * đã phải đi dọn tay trong sổ tiền. Nên kiểm trước, lệch là DỪNG.
 *
 * Kiểm đúng những gì tool dựa vào, KHÔNG kiểm thứ tool không dùng (thêm sheet `TikTok Shop`, `Chi Phí Hàng
 * Ngày`, đổi thứ tự sheet… đều không làm tool sai, và chặn vì những thứ đó là chặn oan):
 *   · đủ 4 sheet gian hàng, `Tổng tồn kho`, `Mapping_san_pham`
 *   · dòng tiêu đề (dòng 2) của mỗi sheet gian hàng đúng 15 tên cột theo thứ tự; cột O là `Còn Nợ` hoặc
 *     `Ghi chú` (Offood dùng `Ghi chú` từ trước, đo trên cả ba file tháng 8, DEMO tháng 9 và bản POB)
 *   · dòng tổng (dòng 3) có công thức ở H, I, J, K, L
 *   · `Tổng tồn kho` dòng tiêu đề đúng ở cột D, E, H (tên viết tắt, mã hàng, tổng tồn)
 *   · `Mapping_san_pham` dòng 1 có ĐỦ 12 tiêu đề của `SCHEMA.MAPPING` (không ép thứ tự: tool đọc và GHI
 *     Mapping theo tên cột — xem `themDongMapping_`; cột phụ như lô phụ hay khối điều khiển N1:O5 được phép)
 * Ô công thức E/F/L/M/N phía trên vùng ghi thì `chuanBiCongThuc_` (D-57) đã canh, không kiểm lặp ở đây.
 *
 * So tên cột: chuẩn NFC, bỏ khoảng trắng thừa, không phân biệt hoa thường — file thật có `Ngày ` với dấu
 * cách cuối, và viết hoa khác không phải là đổi khuôn.
 */
var COT_GIAN_HANG_HOP_DONG = ['Ngày', 'Nguồn đơn', 'Thông tin ĐH', 'Tên viết tắt', 'Tên sản phẩm', 'Đơn vị',
  'SL', 'Tổng Tiền SP', 'MGG Shop', 'Chi phí', 'Thuế', 'Doanh Thu', 'Mã hàng', 'Check tồn', ['Còn Nợ', 'Ghi chú']];

function chuanTenCot_(x) {
  var t = String(x == null ? '' : x);
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

function kiemHopDongFileThang_(ss, cfg) {
  var lech = [];
  var k = cfg.keyin;
  var soCot = COT_GIAN_HANG_HOP_DONG.length;

  Object.keys(cfg.gianHang).forEach(function (ma) {
    var ten = cfg.gianHang[ma].sheet;
    var sh = ss.getSheetByName(ten);
    if (!sh) { lech.push('thiếu sheet "' + ten + '"'); return; }
    var h = sh.getRange(k.dong_header, 1, 1, soCot).getDisplayValues()[0];
    for (var i = 0; i < soCot; i++) {
      var mong = [].concat(COT_GIAN_HANG_HOP_DONG[i]);
      var ok = mong.some(function (m) { return chuanTenCot_(m) === chuanTenCot_(h[i]); });
      if (!ok) {
        lech.push('sheet "' + ten + '" ô ' + Utils.chuCot(i + 1) + k.dong_header + ' là "' + String(h[i] || '').trim() +
          '", cần "' + mong.join('" hoặc "') + '"');
      }
    }
    // Cột dòng tổng CỐ ĐỊNH H..L theo khuôn file, KHÔNG theo `cauHinh.keyin`: khuôn là thứ của file, còn cấu
    // hình ghi đè chính là thứ có thể sai — lấy theo cấu hình thì một khóa trỏ nhầm sẽ biến thành câu "sổ sai
    // khuôn" và che mất đúng hàng rào cột cấm lẽ ra phải nói (bắt được ở T-DT-35).
    var tu = 8, den = 12;
    var ct = sh.getRange(k.dong_tong, tu, 1, den - tu + 1).getFormulasR1C1()[0];
    for (var j = 0; j < ct.length; j++) {
      if (!ct[j]) lech.push('sheet "' + ten + '" ô ' + Utils.chuCot(tu + j) + k.dong_tong + ' (dòng tổng) không có công thức');
    }
  });

  var dm = cfg.danhMuc;
  var shTk = ss.getSheetByName(dm.ten_sheet);
  if (!shTk) lech.push('thiếu sheet "' + dm.ten_sheet + '"');
  else {
    [[dm.cot_ten_viet_tat, 'Tên viết tắt'], [dm.cot_ma_hang, 'Mã hàng'], [dm.cot_ton, 'Tổng tồn']].forEach(function (x) {
      var c = typeof x[0] === 'number' ? x[0] : Utils.chiSoCot(x[0]);
      var v = shTk.getRange(dm.dong_header, c, 1, 1).getDisplayValues()[0][0];
      if (chuanTenCot_(v) !== chuanTenCot_(x[1])) {
        lech.push('sheet "' + dm.ten_sheet + '" ô ' + Utils.chuCot(c) + dm.dong_header + ' là "' + String(v || '').trim() +
          '", cần "' + x[1] + '"');
      }
    });
  }

  var shMap = sheetMapping_(ss);
  if (!shMap) lech.push('thiếu sheet "' + TEN_TAB_MAPPING_SHEET + '"');
  else {
    var rongMap = Math.max(shMap.getLastColumn(), SCHEMA.MAPPING.length);
    var coTen = {};
    shMap.getRange(1, 1, 1, rongMap).getDisplayValues()[0].forEach(function (h) { coTen[MapListing.tenCotChuan(h)] = 1; });
    var thieuMap = SCHEMA.MAPPING.filter(function (t) { return !coTen[t]; });
    if (thieuMap.length) {
      lech.push('sheet "' + shMap.getName() + '" dòng 1 thiếu cột ' + thieuMap.map(function (t) { return '"' + t + '"'; }).join(', '));
    }
  }

  if (!lech.length) return;
  var e = new Error('SỔ THÁNG KHÔNG ĐÚNG KHUÔN — ' + lech.slice(0, 5).join('; ') +
    (lech.length > 5 ? ' (và ' + (lech.length - 5) + ' chỗ lệch nữa)' : '') +
    '. Tool chưa ghi gì. Báo người phụ trách kiểm lại file tháng, đừng tự sửa tên cột.');
  e.maKeodon = 'SAI_HOP_DONG';
  e.chiTiet = lech;
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

  // ---- (0) YC-38.1: file tháng còn đúng khuôn không. Chỉ đọc; lệch là dừng khi chưa ghi gì. ----
  kiemHopDongFileThang_(ss, cfg);

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
    var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0, dongKeoCongThuc: 0 };
    var viTri = {}, daDoVung = {};

    // D-57 / YC-39: kiểm + kéo sẵn công thức cho mọi sheet sắp ghi. Đặt TRƯỚC cả việc nối Mapping: cột nào
    // không còn công thức thì dừng khi CHƯA ghi ô nào, kể cả dòng Mapping.
    chuanBiCongThuc_(ss, goi.lenh.map(function (l) { return l.tenSheet; }), k, tk, thongBao);

    // Nối tên hàng mới vào Mapping TRƯỚC khi ghi đơn. Nếu hết giờ giữa chừng, các tên đó đã nằm sẵn
    // trong sheet, lần gọi sau đọc lại Mapping sẽ thấy có rồi và KHÔNG nối trùng (khóa chống trùng
    // của MapListing là (Gian hàng, Tên trên Shopee, Phân loại), không phải số lần chạy).
    if (goi.mappingThem.length) tk.mappingThem = themDongMapping_(ss, goi.mappingThem, canhBao, goi.mappingThemCot);

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
    var ttMapX = tomTatMapping_(ss);                      // YC-38.3: số dòng CÓ + băm Mapping cho dòng RUN
    ghiDongRun_(body, 'xuLy', ss.getName(), {
      donGhi: tk.donGhi, dongGhi: tk.dongGhi, dongVang: tk.dongVang, donDaCo: goi.thongKe.donDaCo + tk.donDaCo
    }, ttMapX);

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
        dongKeoCongThuc: tk.dongKeoCongThuc,
        donDuKien: goi.thongKe.donGhi, dongDuKien: goi.thongKe.dongGhi
      },
      mapTomTat: MapListing.tomTat(goi.map),
      // Khóa của mọi tên hàng mới đã nối vào Mapping (kể cả của các lượt trước). Máy gửi lại nguyên
      // danh sách này ở lượt sau để chia lô không đổi một chữ nào trong cột Note — xem chú thích
      // `tenMoiTruocDo` trong `dungKeHoachGhi_`.
      khoaTenMoi: (body.tenMoiTruocDo || []).concat(goi.khoaTenMoi),
      xong: xong, sheetDaXong: sheetDaXong, sheetConLai: sheetConLai,
      viTri: viTri, canhBao: canhBao, thongBao: thongBao,
      runId: runIdHopLe_(body.runId) || null,
      mappingCo: ttMapX ? ttMapX.soCo : null, mappingBam: ttMapX ? ttMapX.bam : null,
      giay: (new Date().getTime() - batDau) / 1000
    };
  } finally {
    khoa.releaseLock();
  }
}

// ==================================================================== hành động TẠO THÁNG MỚI (YC-35, D-45)
//
// Nút 3 chế độ 1 gọi hành động này với hai file do MÁY chỉ định (ID trong thân POST, không đọc bảng link nào):
// file tháng CŨ (chỉ đọc) và file tháng MỚI (chủ dự án tự "Tạo bản sao", đổi tên — D-45). Mọi nghiệp vụ nằm ở
// lõi `TaoThangMoi.gs` (`lapKeHoach` → danh sách thao tác, `tuKiem` → K-1…K-8); phần dưới đây chỉ là VỎ GOOGLE:
// chụp ảnh hai file, chạy thao tác trên file mới, canh giờ, ghi cờ tiến độ, tô lại Mapping, tự kiểm.
//
// Ràng buộc (Phụ lục A.10) được giữ ở ĐÂY, không trông vào lõi:
//   · vỏ không nhận file cũ để ghi — hàm thực thi chỉ cầm `ssMoi`
//   · `TAO_SHEET` chỉ nhận `Mapping_san_pham`; tên khác là ném lỗi (INV-2)
//   · hai ID trùng nhau → dừng trước khi mở
//   · chỉ khi đủ 8 phép K mới ghi `DA_KHOI_TAO_`

/** Ngưỡng dừng gọn (Phụ lục A.7.3): 4 phút 30, quota Google 6 phút. */
var TM_NGUONG_GIAY = 270;
/** Lô ghi tối đa mỗi lần `setValues` (A.7.3). */
var TM_LO_DONG = 200;
/** Sheet cần chụp ảnh — không chụp `Thông tin shop ` (INV-10), không chụp sổ chạy liên tục. */
var TM_SHEET_CHUP = ['Tổng tồn kho', 'Tổng nhập', 'Shopee mall', 'Offood', 'Importmart', 'Babyiu', 'TikTok Shop',
  'Tiktok', 'Đơn ngoài', 'Chi Phí Hàng Ngày', 'Lợi nhuận', 'Mapping_san_pham', 'Mapping sản phẩm'];

function loiTM_(ma, cau) {
  var e = new Error(cau);
  e.maKeodon = ma;
  return e;
}

/** `{thangCu, namCu, thangMoi, namMoi}` → 'yyyy-MM'; sai kiểu thì ném THAM_SO_SAI nêu đúng trường. */
function kyThangMoi_(thang, nam, nhan) {
  var t = String(thang == null ? '' : thang).trim(), n = String(nam == null ? '' : nam).trim();
  if (!/^\d{1,2}$/.test(t) || +t < 1 || +t > 12) throw loiTM_('THAM_SO_SAI', nhan + ': tháng phải là số 1–12, nhận "' + t + '".');
  if (!/^\d{4}$/.test(n)) throw loiTM_('THAM_SO_SAI', nhan + ': năm phải đủ 4 chữ số, nhận "' + n + '".');
  return n + '-' + hai_(+t);
}

/**
 * Ảnh chụp một file theo hợp đồng dữ liệu của `TaoThangMoi.gs`: mỗi sheet một lượt đọc giá trị + một lượt đọc
 * công thức + một lượt đọc ô gộp (quota). `giaTri` = ô gõ tay (ô công thức → null); `giaTriTinh` = giá trị Google
 * đã tính. Công thức A1 bỏ dấu `=` đầu.
 */
function chupFileThangMoi_(ss) {
  var anh = { ten: ss.getName(), tenSheet: [], sheets: {} };
  ss.getSheets().forEach(function (sh) {
    var ten = sh.getName();
    anh.tenSheet.push(ten);
    if (TM_SHEET_CHUP.indexOf(ten) >= 0) anh.sheets[ten] = chupSheetThangMoi_(sh);
  });
  return anh;
}

function chupSheetThangMoi_(sh) {
  var nr = Math.max(sh.getLastRow(), 1), nc = Math.max(sh.getLastColumn(), 1);
  var vung = sh.getRange(1, 1, nr, nc);
  var gt = vung.getValues(), cta = vung.getFormulas();
  var giaTri = [], congThuc = [], mang = [], giaTriTinh = [];
  for (var r = 0; r < nr; r++) {
    var a = [], b = [], m = [], d = [];
    for (var c = 0; c < nc; c++) {
      var f = cta[r][c], v = gt[r][c];
      var rong = v === '' || v == null;
      if (f) { a.push(null); b.push(String(f).replace(/^=/, '')); d.push(rong ? null : v); }
      else { a.push(rong ? null : v); b.push(null); d.push(rong ? null : v); }
      m.push(false);
    }
    giaTri.push(a); congThuc.push(b); mang.push(m); giaTriTinh.push(d);
  }
  var gop = vung.getMergedRanges().map(function (x) {
    return { r1: x.getRow(), c1: x.getColumn(), r2: x.getRow() + x.getNumRows() - 1, c2: x.getColumn() + x.getNumColumns() - 1 };
  });
  return { ten: sh.getName(), soDong: nr, giaTri: giaTri, congThuc: congThuc, mang: mang, giaTriTinh: giaTriTinh, gopO: gop };
}

/** Vùng đã kẹp vào lưới thật (Google ném lỗi khi vùng vượt số dòng/cột của sheet). null = nằm ngoài lưới. */
function vungKep_(sh, r1, c1, r2, c2) {
  var mr = sh.getMaxRows(), mc = sh.getMaxColumns();
  if (r1 > mr || c1 > mc) return null;
  var rr = Math.min(r2, mr), cc = Math.min(c2, mc);
  return sh.getRange(r1, c1, rr - r1 + 1, cc - c1 + 1);
}

/**
 * Gom một dãy GHI_O / GHI_CT liền nhau của CÙNG một sheet thành các hình chữ nhật đủ ô rồi ghi bằng `setValues`
 * (công thức ghi dưới dạng chuỗi `=`…), mỗi khối ≤ `TM_LO_DONG` dòng. Ghi từng ô là nguyên nhân số một gây hết giờ
 * (A.7.3) — B4 tháng 8 là 76 dòng × 7 ô = 532 lệnh, gom lại còn MỘT.
 */
function ghiKhoiO_(sh, dsOp) {
  var o = {}, dinhDang = [];
  dsOp.forEach(function (t) {
    var v = t.loai === 'GHI_CT' ? '=' + t.text : (t.gt == null ? '' : t.gt);
    o[t.r + ':' + t.c] = v;
    if (t.dinhDang) dinhDang.push(t);
  });
  var theoDong = {};
  Object.keys(o).forEach(function (k) {
    var p = k.split(':');
    (theoDong[p[0]] = theoDong[p[0]] || []).push(+p[1]);
  });
  var doan = [];
  Object.keys(theoDong).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
    var cs = theoDong[r].sort(function (a, b) { return a - b; });
    var c1 = cs[0], truoc = cs[0];
    for (var i = 1; i <= cs.length; i++) {
      if (i < cs.length && cs[i] === truoc + 1) { truoc = cs[i]; continue; }
      doan.push({ r: r, c1: c1, c2: truoc });
      if (i < cs.length) { c1 = cs[i]; truoc = cs[i]; }
    }
  });
  var khoi = [];
  doan.forEach(function (d) {
    var k = khoi[khoi.length - 1];
    if (k && k.c1 === d.c1 && k.c2 === d.c2 && k.r2 === d.r - 1 && k.r2 - k.r1 + 1 < TM_LO_DONG) k.r2 = d.r;
    else khoi.push({ r1: d.r, r2: d.r, c1: d.c1, c2: d.c2 });
  });
  // ĐỊNH DẠNG TRƯỚC, GIÁ TRỊ SAU (cùng bài học ở `ghiMotSheet_`): đặt '@' sau setValues thì Google đã kịp đổi
  // chuỗi '2026-10' thành ngày, đổi định dạng sau không hoàn nguyên được.
  dinhDang.forEach(function (t) { sh.getRange(t.r, t.c).setNumberFormat(t.dinhDang); });
  khoi.forEach(function (k) {
    var bang = [];
    for (var r = k.r1; r <= k.r2; r++) {
      var h = [];
      for (var c = k.c1; c <= k.c2; c++) h.push(o[r + ':' + c]);
      bang.push(h);
    }
    sh.getRange(k.r1, k.c1, bang.length, k.c2 - k.c1 + 1).setValues(bang);
  });
  return khoi.length;
}

/**
 * `KEO_CT` trên Google: đọc MỘT lượt công thức R1C1 + giá trị của cả đoạn `r1..r2`, lấp ô trống bằng công thức
 * của ô có công thức gần nhất phía trên (chưa có ô nào phía trên thì lấy ô gần nhất phía dưới). Công thức R1C1
 * chép NGUYÊN VĂN chính là "kéo chuột": tham chiếu tương đối giữ nguyên độ lệch. Ô có GIÁ TRỊ gõ tay để yên.
 * Ghi theo từng đoạn ô trống liền nhau. Lưới thiếu dòng thì nới trước (Google không tự nới).
 */
function keoCongThucTM_(sh, c, r1, r2) {
  var mr = sh.getMaxRows();
  if (mr < r2) sh.insertRowsAfter(mr, r2 - mr);
  var n = r2 - r1 + 1;
  var vung = sh.getRange(r1, c, n, 1);
  var ct = vung.getFormulasR1C1(), gt = vung.getValues();
  var dau = -1;
  for (var i = 0; i < n; i++) if (ct[i][0]) { dau = i; break; }
  if (dau < 0) return 0;
  var mau = ct[dau][0], dem = 0, doan = null;
  var xa = function () {
    if (!doan) return;
    sh.getRange(r1 + doan.i, c, doan.ds.length, 1).setFormulasR1C1(doan.ds);
    doan = null;
  };
  for (var j = 0; j < n; j++) {
    if (ct[j][0]) { xa(); mau = ct[j][0]; continue; }
    if (gt[j][0] !== '' && gt[j][0] != null) { xa(); continue; }
    if (!doan) doan = { i: j, ds: [] };
    doan.ds.push([j < dau ? ct[dau][0] : mau]);
    dem++;
  }
  xa();
  return dem;
}

/**
 * `CHEN_COT` (B5a): chèn một cột trước `truocCot`, cho cột mới ĐỊNH DẠNG của cột tháng vừa bị đẩy sang phải (tiền, viền) —
 * mà KHÔNG để lệnh dán cắt ngang ô gộp (YC-43).
 *
 * VÌ SAO. Google chặn `copyTo` khi vùng dán giao MỘT PHẦN với một ô gộp ("Bạn không thể thực hiện lệnh dán khi vùng dán
 * giao một phần với một ô hợp nhất"). Khuôn tháng 9 gộp `Lợi nhuận`!B3:D3; chèn cột trước D làm cụm đó giãn thành B3:E3 và
 * cột D mới cắt ngang nó → nút 3 chết ở B5 trên Google thật (14/9 21:47), cờ kẹt `B5_DANG_LAM`.
 *
 * CÁCH LÀM. Ghi lại MỌI cụm gộp của sheet → gỡ hết → chèn cột → chép định dạng → gộp lại đúng các cụm cũ, dời theo cột vừa
 * chèn (cụm nằm bên phải dời một cột; cụm vắt qua chỗ chèn giãn thêm một cột — đúng như Google tự làm khi chèn). Gộp lại
 * trong `finally`: lỗi ở giữa cũng không để sheet mất ô gộp.
 */
function chenCotGiuGop_(sh, truocCot) {
  var mr = sh.getMaxRows();
  var gop = sh.getRange(1, 1, mr, sh.getMaxColumns()).getMergedRanges().map(function (g) {
    return { r: g.getRow(), c: g.getColumn(), nr: g.getNumRows(), nc: g.getNumColumns() };
  });
  gop.forEach(function (g) { sh.getRange(g.r, g.c, g.nr, g.nc).breakApart(); });
  var daChen = false;
  try {
    sh.insertColumnBefore(truocCot);
    daChen = true;
    sh.getRange(1, truocCot + 1, mr, 1).copyTo(sh.getRange(1, truocCot, mr, 1), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  } finally {
    gop.forEach(function (g) {
      var c1 = g.c, c2 = g.c + g.nc - 1;
      if (daChen && c1 >= truocCot) { c1++; c2++; } else if (daChen && c2 >= truocCot) { c2++; }
      sh.getRange(g.r, c1, g.nr, c2 - c1 + 1).merge();
    });
  }
}

/** Chạy một danh sách thao tác của lõi trên file MỚI. Dừng gọn giữa hai thao tác khi hết giờ. */
function thucThiThaoTacTM_(ssMoi, dsThaoTac, hetGio) {
  var i = 0;
  while (i < dsThaoTac.length) {
    if (hetGio()) return { xong: false, daLam: i };
    var t = dsThaoTac[i];
    if (t.loai === 'GHI_O' || t.loai === 'GHI_CT') {
      var j = i;
      while (j < dsThaoTac.length && (dsThaoTac[j].loai === 'GHI_O' || dsThaoTac[j].loai === 'GHI_CT') && dsThaoTac[j].sheet === t.sheet) j++;
      ghiKhoiO_(sheetTM_(ssMoi, t.sheet), dsThaoTac.slice(i, j));
      i = j;
      continue;
    }
    if (t.loai === 'TAO_SHEET') {
      if (t.ten !== TaoThangMoi.TEN_SHEET_MAPPING) throw loiTM_('VI_PHAM_INV2', 'Lõi xin tạo sheet "' + t.ten + '" — chỉ được thêm `' + TaoThangMoi.TEN_SHEET_MAPPING + '` (INV-2). Dừng.');
      if (!ssMoi.getSheetByName(t.ten)) ssMoi.insertSheet(t.ten);
    } else {
      var sh = sheetTM_(ssMoi, t.sheet);
      if (t.loai === 'BO_GOP') {
        var vg = vungKep_(sh, t.r1, t.c1, t.r2, t.c2);
        if (vg) vg.getMergedRanges().forEach(function (m) { m.breakApart(); });
      } else if (t.loai === 'XOA_VUNG') {
        var vx = vungKep_(sh, t.r1, t.c1, t.r2, t.c2);
        if (vx) vx.clearContent();
      } else if (t.loai === 'XOA_DONG') {
        var n = Math.min(t.soDong, sh.getMaxRows() - t.r1 + 1);
        if (n > 0) sh.deleteRows(t.r1, n);
      } else if (t.loai === 'GOP_O') {
        sh.getRange(t.r1, t.c1, t.r2 - t.r1 + 1, t.c2 - t.c1 + 1).merge();
      } else if (t.loai === 'GHI_BANG') {
        var rong = t.bang.reduce(function (m, h) { return Math.max(m, (h || []).length); }, 0);
        for (var k = 0; k < t.bang.length; k += TM_LO_DONG) {
          var lo = t.bang.slice(k, k + TM_LO_DONG).map(function (h) {
            var x = [];
            for (var q = 0; q < rong; q++) x.push(h && h[q] != null ? h[q] : '');
            return x;
          });
          sh.getRange(t.r1 + k, t.c1, lo.length, rong).setValues(lo);
        }
      } else if (t.loai === 'CHEN_COT') {
        chenCotGiuGop_(sh, t.truocCot);
      } else if (t.loai === 'KEO_CT') {
        keoCongThucTM_(sh, t.c, t.r1, t.r2);
      } else {
        throw loiTM_('THAO_TAC_LA', 'Thao tác lạ từ lõi: ' + t.loai);
      }
    }
    i++;
  }
  return { xong: true, daLam: i };
}

function sheetTM_(ss, ten) {
  var sh = ss.getSheetByName(ten);
  if (!sh) throw loiTM_('THIEU_SHEET', 'File tháng mới không có sheet "' + ten + '" — không đổi tên/xóa sheet của file (A.2).');
  return sh;
}

function ghiCoTM_(ssMoi, r, gt) {
  var sh = ssMoi.getSheetByName(TaoThangMoi.TEN_SHEET_MAPPING);
  if (sh) sh.getRange(r, 15).setValue(gt);
}

/**
 * doPost `taoThangMoi`. Thân POST: `{thangCu, namCu, idCu, thangMoi, namMoi, idMoi}` (ID hoặc link).
 * Trả `xong:false` khi dừng gọn vì giờ — máy gọi lại, tool chạy tiếp từ cờ `BUOC_DA_XONG`.
 */
function hanhDongTaoThangMoi_(body, batDau) {
  var kyCu = kyThangMoi_(body.thangCu, body.namCu, 'Tháng trước');
  var kyMoi = kyThangMoi_(body.thangMoi, body.namMoi, 'Tháng mới');
  if (kyCu === kyMoi) throw loiTM_('THAM_SO_SAI', 'Tháng trước và tháng mới cùng là ' + kyMoi + '.');
  var idCu = bocIdTuLink_(body.idCu), idMoi = bocIdTuLink_(body.idMoi);
  if (!idCu || !idMoi) throw loiTM_('THIEU_ID_FILE', 'Thiếu link/ID hợp lệ của file tháng ' + (!idCu ? 'trước' : 'mới') + '. Tool chưa ghi gì.');
  if (idCu === idMoi) {
    throw loiTM_('TRUNG_FILE', 'Link tháng trước và link tháng mới là CÙNG MỘT file. Tháng mới phải là bản sao riêng ' +
      '(trên Google Sheet: Tệp → Tạo bản sao, đổi tên, lấy link bản sao). Tool chưa ghi gì.');
  }

  var nguong = body.nguongGiay != null && isFinite(+body.nguongGiay) ? Math.max(0, +body.nguongGiay) : TM_NGUONG_GIAY;
  var hetGio = function () { return (new Date().getTime() - batDau) / 1000 >= nguong; };

  var khoa = LockService.getScriptLock();
  if (!khoa.tryLock(30000)) throw loiTM_('DANG_BAN', 'Một lệnh khác (kéo đơn hoặc tạo tháng) đang chạy trên Web App, thử lại sau vài phút. Tool chưa ghi gì.');
  // YC-43 điểm 3: từ lúc bắt đầu GHI vào file mới, mọi ngoại lệ phải nói chết ở bước nào và việc phải làm tiếp. Trước đó (mở
  // file, đọc, kiểm điều kiện) chưa ô nào bị ghi — lỗi đi nguyên văn như cũ để phía máy còn nhận ra lỗi quyền (D-46).
  var buocDangLam = '', ssMoi = null;
  try {
    var canhBao = [], thongBao = [];
    var ssCu = moBangTinh_(idCu, 'tháng ' + kyCu, 'Link đó là trường [3/7] của nút 3.');
    ssMoi = moBangTinh_(idMoi, 'tháng ' + kyMoi, 'Link đó là trường [6/7] của nút 3.');
    kiemTenFileKhopThang_(ssCu, kyCu, canhBao, 'tháng trước [3/7]');
    kiemTenFileKhopThang_(ssMoi, kyMoi, canhBao, 'tháng mới [6/7]');

    var anhCu = chupFileThangMoi_(ssCu);
    var anhMoi = chupFileThangMoi_(ssMoi);
    var ke = TaoThangMoi.lapKeHoach(anhCu, anhMoi, {
      // KHÔNG truyền dauPhanCach: lõi dò từ chính công thức Google trả về (sổ Việt Nam dùng `;` — gán cứng `,` là #ERROR!, 14/9).
      thangMoi: kyMoi, nguonClone: ssCu.getName(), thoiDiem: new Date()
    });
    if (!ke.chay) {
      var maDung = ke.maDung || 'FILE_CO_DU_LIEU';      // lõi nói lý do dừng: DA_KHOI_TAO · FILE_CO_DU_LIEU · B5_DANG_LAM
      return {
        ok: false, loi: maDung, hanhDong: 'taoThangMoi', thang: kyMoi,
        thongBao: 'KHÔNG KHỞI TẠO — ' + ke.lyDoDung.join(' | ') + ' Tool chưa ghi ô nào.',
        lop2: (ke.kiem && ke.kiem.lop2) || []
      };
    }
    ke.thongBao.forEach(function (x) { thongBao.push(x); });
    ke.canhBao.forEach(function (x) { canhBao.push(x); });

    // B1: cờ DANG_KHOI_TAO (và tạo `Mapping_san_pham` nếu chưa có) TRƯỚC khi ghi ô nào khác.
    buocDangLam = 'B1 · Đặt cờ DANG_KHOI_TAO';
    thucThiThaoTacTM_(ssMoi, ke.batDau, function () { return false; });
    SpreadsheetApp.flush();

    var viTri = ke.tuBuoc ? ke.buoc.map(function (b) { return b.ma; }).indexOf(ke.tuBuoc) : ke.buoc.length;
    var daXong = ke.kiem.lop1.buocDaXong || '';
    for (var i = Math.max(0, viTri); i < ke.buoc.length; i++) {
      var b = ke.buoc[i];
      // Lượt trước đã dừng giữa CHÍNH bước này → lượt này chạy bước đó TỚI CÙNG, không canh giờ. Không có luật này
      // thì một bước dài hơn ngưỡng (B3 trên file nhiều sheet, nhiều ô gộp) cứ dọn dở rồi dừng mãi, máy gọi lại mãi
      // mà cờ tiến độ không bao giờ nhích. Mỗi bước đều dọn/ghi idempotent, nên chạy tiếp phần dở là an toàn.
      var epXong = body.buocDungTruoc != null && String(body.buocDungTruoc) === b.ma;
      if (!epXong && hetGio()) return traDoTM_(kyMoi, daXong, batDau, nguong, b.ma, canhBao, thongBao);
      buocDangLam = b.ma + ' · ' + b.ten;
      if (b.mocTruoc) { ghiCoTM_(ssMoi, 5, b.mocTruoc); SpreadsheetApp.flush(); }
      var kq = thucThiThaoTacTM_(ssMoi, b.thaoTac, (b.khongLapLai || epXong) ? function () { return false; } : hetGio);
      if (!kq.xong) return traDoTM_(kyMoi, daXong, batDau, nguong, b.ma, canhBao, thongBao);
      SpreadsheetApp.flush();
      kiemCongThucVuaGhiTM_(ssMoi, b.thaoTac, b.ma);          // YC-44: #ERROR! là dừng ở ĐÚNG bước này, cờ chưa nhích
      if (b.ma === 'B6') toLaiMapping_(ssMoi, canhBao);        // D-47: chép xong thì tô lại CÓ/chưa CÓ
      ghiCoTM_(ssMoi, 5, b.mocSau);
      daXong = b.mocSau;
      SpreadsheetApp.flush();
      thongBao.push(b.ma + ' · ' + b.ten + ' — xong');
    }

    // B8: đọc lại file MỚI sau khi Google tính lại, tám phép tự kiểm.
    buocDangLam = 'B8 · Tám phép tự kiểm';
    SpreadsheetApp.flush();
    var kiem = TaoThangMoi.tuKiem(anhCu, chupFileThangMoi_(ssMoi), ke);
    if (kiem.dat) {
      ghiCoTM_(ssMoi, 1, 'DA_KHOI_TAO_' + ke.nhanThoiDiem);
      SpreadsheetApp.flush();
    }
    // `thongBao` là MỘT câu (máy in thẳng, kể cả khi lỗi); từng bước đã làm nằm ở `nhatKy`.
    return {
      ok: kiem.dat, loi: kiem.dat ? undefined : 'TU_KIEM_LECH', hanhDong: 'taoThangMoi', thang: kyMoi, xong: true,
      buocDaXong: daXong, tenFileMoi: ssMoi.getName(), tenFileCu: ssCu.getName(),
      kiem: kiem.phep, canhBao: canhBao, nhatKy: thongBao,
      thongBao: kiem.dat
        ? 'ĐÃ KHỞI TẠO file tháng ' + kyMoi + ' — đủ 8/8 phép tự kiểm.'
        : 'TỰ KIỂM LỆCH ' + kiem.soLech + '/8 phép — GIỮ cờ DANG_KHOI_TAO, KHÔNG đánh dấu hoàn tất: ' +
          kiem.phep.filter(function (p) { return !p.dat; }).map(function (p) { return p.ma + ' (' + p.chiTiet + ')'; }).join(' · ') +
          '. Báo người phụ trách kiểm file tháng mới trước khi dùng.',
      giay: (new Date().getTime() - batDau) / 1000
    };
  } catch (err) {
    if (buocDangLam) throw loiGiuaChungTM_(err, buocDangLam, docCoTM_(ssMoi, 5));
    throw err;
  } finally {
    khoa.releaseLock();
  }
}

/**
 * 2.7.1 — ĐỌC LẠI CỜ sau khi máy mất đường trả lời của `taoThangMoi` (sự cố 14/9 23:01: máy nhận "HTTP 302, thân rỗng" rồi
 * kết luận thất bại mà không biết Google đã chạy tới đâu). CHỈ ĐỌC — không ghi ô nào, không giữ khóa:
 *   · `dangChay`: khóa Web App đang có người giữ (một lượt tạo tháng hoặc kéo đơn chưa xong) → máy nói "đợi", không nói "thất bại";
 *   · `coKhoiTao` (`Mapping_san_pham`!O1: DANG_KHOI_TAO_… / DA_KHOI_TAO_…) và `buocDaXong` (O5).
 * Xét khóa TRƯỚC rồi mới đọc cờ: khóa rảnh nghĩa là lượt chạy kia đã kết thúc, cờ đọc sau đó là cờ cuối.
 */
function hanhDongCoTaoThang_(body) {
  var idMoi = bocIdTuLink_(body.idMoi);
  if (!idMoi) throw loiTM_('THIEU_ID_FILE', 'Thiếu link/ID hợp lệ của file tháng mới. Tool chưa đọc gì.');
  var khoa = LockService.getScriptLock();
  var ranh = khoa.tryLock(1);
  if (ranh) khoa.releaseLock();
  var ss = moBangTinh_(idMoi, 'tháng ' + String(body.thang || 'mới'), 'Link đó là trường [6/7] của nút 3.');
  return {
    ok: true, hanhDong: 'coTaoThang', thang: body.thang || null, dangChay: !ranh,
    coKhoiTao: docCoTM_(ss, 1), buocDaXong: docCoTM_(ss, 5), tenFileMoi: ss.getName()
  };
}

/**
 * YC-44 việc 4 — ghi công thức xong là ĐỌC LẠI NGAY trong bước đó: ô nào tool vừa ghi công thức (`GHI_CT`) mà Google hiện
 * `#ERROR!` (lỗi PHÂN TÍCH công thức — chuỗi sai cú pháp từ lúc ghi, khác #REF!/#VALUE!) thì DỪNG TẠI CHỖ, nêu ô và nguyên văn công
 * thức Google đang giữ. Trước đây lỗi này (`Tổng nhập`!I, 14/9) đi hết B5…B7 rồi mới lộ ở K-6.
 * Chỉ xét ô gốc của lỗi (ô tool ghi), không xét ô kéo theo — `Lợi nhuận`!D6/D11/D12 hỏng là do trỏ vào `Tổng nhập`!I2.
 */
function kiemCongThucVuaGhiTM_(ssMoi, dsThaoTac, buoc) {
  var theoSheet = {};
  dsThaoTac.forEach(function (t) { if (t.loai === 'GHI_CT') (theoSheet[t.sheet] = theoSheet[t.sheet] || []).push(t); });
  var hong = [];
  Object.keys(theoSheet).forEach(function (ten) {
    var ds = theoSheet[ten], sh = sheetTM_(ssMoi, ten);
    var r1 = Infinity, r2 = 0, c1 = Infinity, c2 = 0;
    ds.forEach(function (t) { r1 = Math.min(r1, t.r); r2 = Math.max(r2, t.r); c1 = Math.min(c1, t.c); c2 = Math.max(c2, t.c); });
    var vung = sh.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1), hien = vung.getDisplayValues();
    ds.forEach(function (t) {
      if (hong.length >= 5) return;
      if (String(hien[t.r - r1][t.c - c1]).trim() !== '#ERROR!') return;
      var ct = '';
      try { ct = sh.getRange(t.r, t.c).getFormula(); } catch (e) { ct = '(không đọc được)'; }
      hong.push(ten + '!' + chuCotTM_(t.c) + t.r + ' — Google đang giữ: ' + ct + ' — tool đã ghi: =' + t.text);
    });
  });
  if (!hong.length) return;
  throw loiTM_('CONG_THUC_HONG', 'Công thức tool vừa ghi ở ' + buoc + ' ra #ERROR! (lỗi phân tích công thức, sai cú pháp ngay từ lúc ghi): ' +
    hong.join(' · ') + '. DỪNG TẠI CHỖ, chưa làm bước sau.');
}

function chuCotTM_(c) {
  var s = '';
  for (var n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

/** Đọc một ô cờ `Mapping_san_pham`!O<dong> của file đang tạo; đọc không được (sheet chưa có…) → ''. Không bao giờ ném. */
function docCoTM_(ss, dong) {
  try {
    var sh = ss && ss.getSheetByName(TaoThangMoi.TEN_SHEET_MAPPING);
    return sh ? String(sh.getRange(dong, 15).getDisplayValue() || '').trim() : '';
  } catch (e) { return ''; }
}

/**
 * YC-43 điểm 3: ngoại lệ giữa chừng của `taoThangMoi` → câu nói (1) chết ở bước nào, (2) cờ `BUOC_DA_XONG` đang là gì, (3) nguyên
 * văn lỗi của Google, (4) việc phải làm tiếp. Giữ mã lỗi gốc nếu có (lỗi quyền giữa chừng vẫn là lỗi quyền). Cờ `B5_DANG_LAM`
 * → bản sao đã hỏng (điểm 4): chèn cột không chạy lại được, không để người bấm lại vô ích.
 */
function loiGiuaChungTM_(err, buoc, co) {
  var goc = String(err && err.message ? err.message : err);
  var viec = co === 'B5_DANG_LAM'
    ? TaoThangMoi.CAU_BAN_SAO_HONG
    : 'Bấm lại nút 3 chế độ 1 với đúng bảy giá trị — tool chạy tiếp từ sau bước ' + (co || '(chưa bước nào)') +
      '. Lỗi lặp lại ở đúng bước này thì chụp màn hình gửi người phụ trách; link_thang chưa được khai.';
  var e = new Error('Google báo lỗi giữa chừng ở bước ' + buoc + ' (cờ BUOC_DA_XONG đang là ' + (co || '(trống)') + '): ' +
    goc + ' → Việc phải làm: ' + viec);
  e.maKeodon = (err && err.maKeodon) ? err.maKeodon : 'NGOAI_LE';
  return e;
}

function traDoTM_(kyMoi, daXong, batDau, nguong, buocKe, canhBao, thongBao) {
  var giay = Math.round((new Date().getTime() - batDau) / 1000);
  var cau = 'Dừng gọn ở ' + giay + ' giây (ngưỡng ' + nguong + ') trước bước ' + buocKe +
    ' — phần đã làm giữ nguyên, gọi lại để làm tiếp.';
  thongBao.push(cau);
  return { ok: true, hanhDong: 'taoThangMoi', thang: kyMoi, xong: false, buocDaXong: daXong, buocKe: buocKe,
    canhBao: canhBao, nhatKy: thongBao, thongBao: cau, giay: giay };
}

// ==================================================================== dòng tổng kết RUN (YC-38.3)

/**
 * RUN id do MÁY sinh (`node/dong-run.js`): `yyyyMMdd_HHmmss_<tên máy>`. Web App chỉ nhận đúng mẫu đó —
 * chuỗi lạ (dài, có dấu `/`, có link) thì coi như không gửi: nhật ký Apps Script ai có quyền dự án cũng
 * đọc được, không để máy nào nhét được một câu tùy ý (hay một link file tháng) vào đó.
 */
var RE_RUN_ID = /^\d{8}_\d{6}_[A-Za-z0-9-]{1,40}$/;

function runIdHopLe_(x) {
  var s = String(x == null ? '' : x);
  return RE_RUN_ID.test(s) ? s : '';
}

/**
 * Tóm tắt Mapping để truy vết "lượt này chạy với Mapping nào": số dòng CÓ + 8 ký tự đầu SHA-256 của nội
 * dung. Không bắt user quản lý phiên bản Mapping (Phụ lục E mục 12) — hai lượt cùng băm là cùng một bảng.
 *
 * Băm CHỈ các cột Mapping theo TÊN (12 cột `SCHEMA.MAPPING` + cột lô phụ nếu có), bỏ dòng trống ở cuối.
 * Không băm màu nền (tool tự tô lại mỗi lượt), không băm khối điều khiển N1:O5 của bước tạo tháng mới,
 * không băm cột ghi chú lạ người dùng tự thêm — những thứ đó đổi không làm đổi cách tool ghép mã.
 * Đọc MỘT lần cả khối (quota 6 phút).
 * @returns {{soCo: number, bam: string}|null} null khi không có sheet Mapping
 */
function tomTatMapping_(ss) {
  var sh = sheetMapping_(ss);
  if (!sh) return null;
  var het = sh.getLastRow();
  var rong = Math.max(sh.getLastColumn(), SCHEMA.MAPPING.length);
  var bang = het >= 1 ? sh.getRange(1, 1, het, rong).getDisplayValues() : [[]];
  var cot = {};
  (bang[0] || []).forEach(function (h, i) {
    var t = MapListing.tenCotChuan(h);
    if (cot[t] == null) cot[t] = i;
  });
  var ten = SCHEMA.MAPPING.concat([SCHEMA.MAPPING_COT_LO_PHU]).filter(function (t) { return cot[t] != null; });
  var cXN = cot['Xác nhận'];
  var soCo = 0, dong = [];
  for (var r = 1; r < bang.length; r++) {
    if (cXN != null && MapListing.laCo(bang[r][cXN])) soCo++;
    dong.push(ten.map(function (t) { return String(bang[r][cot[t]] == null ? '' : bang[r][cot[t]]); }).join('\u001f'));
  }
  while (dong.length && dong[dong.length - 1].replace(/\u001f/g, '') === '') dong.pop();
  return { soCo: soCo, bam: bam256_(ten.join('\u001f') + '\n' + dong.join('\n')).slice(0, 8) };
}

/**
 * Ghi MỘT dòng RUN vào nhật ký Apps Script (Executions). Chỉ khi máy gửi RUN id hợp lệ — máy bản cũ không
 * gửi thì thôi, không sinh dòng mồ côi. Dòng không mang ID/link file tháng: chỉ TÊN file (như mọi câu in).
 * @returns {string} dòng đã ghi ('' = không ghi)
 */
function ghiDongRun_(body, hanhDong, tenFile, tk, tt) {
  var id = runIdHopLe_(body && body.runId);
  if (!id) return '';
  var lo = body.lo ? ' | lô ' + body.lo.so + '/' + body.lo.tong : '';
  var dong = 'RUN ' + id + ' | ' + hanhDong + lo +
    ' | bản dựng ' + (typeof BAN_DUNG !== 'undefined' ? BAN_DUNG : '?') +
    ' | file ' + tenFile +
    ' | ghi ' + (tk.donGhi || 0) + ' đơn / ' + (tk.dongGhi || 0) + ' dòng' +
    ' | bỏ qua ' + (tk.donDaCo || 0) +
    ' | vàng ' + (tk.dongVang || 0) +
    ' | Mapping: ' + (tt ? tt.soCo + ' dòng CÓ, băm ' + tt.bam : 'không có sheet');
  console.log(dong);
  return dong;
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
  xet('tomTatMapping_', typeof tomTatMapping_);
  xet('hanhDongTaoThangMoi_', typeof hanhDongTaoThangMoi_);
  xet('TaoThangMoi', typeof TaoThangMoi === 'undefined' ? 'undefined' : 'function');
  xet('ghiDongRun_', typeof ghiDongRun_);
  xet('kiemCotDuocGhi_', typeof kiemCotDuocGhi_);
  xet('doCotNote_', typeof doCotNote_);
  xet('hanhDongXuLy_', typeof hanhDongXuLy_);
  // Cửa chuỗi bí mật là mã HIỆN HÀNH (YC-28, D-43 sửa 13/9) — canh ở danh sách "phải có", KHÔNG phải
  // danh sách "đã bỏ". `bam256_` mới từ 2.5.0 (C-6.2): Google thiếu nó nghĩa là còn so từng ký tự kiểu cũ.
  xet('biMatDung_', typeof biMatDung_);
  xet('bam256_', typeof bam256_);
  xet('caiDat', typeof caiDat);
  xet('kiemGianHangCuaFile_', typeof kiemGianHangCuaFile_);
  // D-57 / YC-39 (2.6.0): Google thiếu hai hàm này nghĩa là còn cách tính dòng cuối theo riêng cột C — lỗi đè đơn gộp.
  xet('chuanBiCongThuc_', typeof chuanBiCongThuc_);
  xet('dongDuLieuCuoi_', typeof dongDuLieuCuoi_);
  xet('kiemHopDongFileThang_', typeof kiemHopDongFileThang_);
  // Hàm của bản CŨ (mỏ neo · bảng link trên Google). Còn trên Google nghĩa là bản dán lên cũ hơn bản trên
  // máy — và cái bẫy mỏ neo vẫn đang giăng ở đó.
  //
  // YC-40.2: bản 2.5.0 từng để nhầm `biMatDung_` và `caiDat` ở đây — tàn dư của lúc đề bài ghi "bỏ chuỗi
  // bí mật". Hai hàm đó đã được KHÔI PHỤC, nên mọi lượt `ping` trên bản ĐÚNG đều trả `camMaVanCo` khác rỗng
  // và máy in câu "còn hàm ĐÃ BỎ… Deploy lại" — sai nguyên nhân, xui người ta Deploy lại vô ích.
  // DV-09 chạy `ping` thật trên mã hiện hành và đòi danh sách này RỖNG.
  if (typeof capNhatMoNeo_ === 'function') camMaVanCo.push('capNhatMoNeo_');
  if (typeof moNeo_ === 'function') camMaVanCo.push('moNeo_');
  if (typeof fileCuaThang_ === 'function') camMaVanCo.push('fileCuaThang_');
  if (typeof bangLinkThang_ === 'function') camMaVanCo.push('bangLinkThang_');
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

var VAN_TAY_SHELL = 'dbcbbc50';   // dấu vân tay file này — MÁY sinh bằng `npm run dau-van-tay`, đừng sửa tay

var BAN_DUNG = 'ffd8f86632f5';   // dấu vân tay CẢ BẢN DỰNG — MÁY sinh, đừng sửa tay
