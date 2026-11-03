/**
 * TaoThangMoi.gs — LỚP LÕI của giai đoạn 3: KHỞI TẠO FILE TRACKING THÁNG MỚI.
 * Theo `01_TAI_LIEU/DAC_TA_TAO_FILE_THANG_MOI.md` (DT-GD3-v1.0) + đính chính ở `04_GIAO_VIEC_DEV_v2.3.md` mục 1.
 *
 * Cùng kiến trúc với `KeyIn.gs`: thuần logic, KHÔNG đụng bảng tính, KHÔNG gọi `SpreadsheetApp`.
 * Nhận "ảnh chụp" hai file (tháng cũ và vỏ tháng mới), trả về một KẾ HOẠCH gồm các thao tác cần làm.
 * Vỏ thực thi: `node/tao-thang-moi.js` (ExcelJS) hoặc vỏ Apps Script.
 *
 * ĐÍNH CHÍNH so với đặc tả (GV-v2.3 mục 1 đã bỏ đề xuất sheet `SỔ LINK THÁNG`):
 *  - B0: không đọc `SỔ LINK THÁNG`. Lõi nhận thẳng ảnh chụp hai file; việc tra link là của lớp định tuyến.
 *  - B7: chỉ ghi khối điều khiển `Mapping_san_pham`!N1:O5. **Không** ghi bản sao bảng link `N6:P20`
 *    (mục 2.2 đặc tả) — bảng link nay nằm sẵn trong sheet `Thông tin shop ` của chính file tháng,
 *    chép thêm một bản là tạo nguồn sự thật thứ hai, đúng thứ mục 2.1 đặc tả cảnh báo.
 *  - B8: không ghi log vào `SỔ LINK THÁNG`; trả danh sách lệch trong kết quả để vỏ ghi ra nhật ký.
 *
 * === ĐÍNH CHÍNH 08/9/2026 (đợt 2) — DỌN BẰNG CÁCH XÓA HẲN DÒNG ===
 * Bản trước dọn sheet gian hàng bằng "xóa nội dung `A4:O2000` rồi dựng lại 4 ARRAYFORMULA ở
 * E4/F4/M4/N4" (mục 4 dòng 127 và bước 12 của đặc tả). ĐO ĐƯỢC là sai:
 *   · Vỏ tháng mới nhân bản từ tháng 8 có **909 ô công thức** mỗi cột E/F/M/N ở `Shopee mall`
 *     (dòng 4→912); file tháng 9 THẬT có **414 / 415 / 399 / 399 ô** (dòng 4→417/418/402/402).
 *     Đây là công thức TỪNG DÒNG, mỗi dòng một cái, kéo tay tới một dòng cố định.
 *   · Bản trước sinh ra đúng **1 ô** mỗi cột. Cả tháng bốn cột Tên sản phẩm / Đơn vị / Mã hàng /
 *     Check tồn trống từ dòng 5 xuống, và không có gì báo.
 * Cách làm mới, đúng như chủ dự án chỉ: **xóa HẲN các dòng chủ shop đã ghi** (`XOA_DONG`).
 * Dòng dưới dồn lên mang theo công thức của chính nó → giữ nguyên công thức gốc, kể cả chỗ sửa tay.
 * Tool KHÔNG ghi một công thức nào vào E, F, L, M, N.
 *
 * Bảy luật cứng (mục 10 đặc tả):
 *  1. `Tổng nhập` khối đầu kỳ để TRỐNG cột `Ngày nhập` — dấu hiệu duy nhất phân biệt đầu kỳ với nhập trong tháng.
 *  2. Ghi đủ 100% mã, kể cả mã tồn 0 (bản làm tay rơi mất `gvs km 1` đúng vì nó tồn 0 ở dòng đầu).
 *  3. `Lợi nhuận` cột `E` dán ĐÈ bằng giá trị đọc TRƯỚC khi dọn, không đọc tại chỗ.
 *  4. Thứ tự B3 → B7 không được đảo.
 *  5. B5 (chèn cột) không chạy lại được: cờ `B5_DANG_LAM` / `B5_DA_CHEN`.
 *  6. Đã khởi tạo rồi thì không bao giờ khởi tạo lại.
 *  7. Lệch một phép K-1…K-13 là dừng, không đánh dấu hoàn tất (K-9…K-11 thêm ở YC-63 bản 2.8.3, K-12 + K-13 ở bản 2.9.0).
 *
 * === HỢP ĐỒNG DỮ LIỆU ===
 * Ảnh chụp một sheet:
 *   ss = { ten, soDong, giaTri[][], congThuc[][], mang[][], giaTriTinh[][], gopO:[{r1,c1,r2,c2}] }
 *     giaTri     — giá trị gõ tay; ô công thức = null
 *     congThuc   — nguyên văn công thức (không có dấu `=` đầu); ô thường = null
 *     mang       — true nếu ô là array formula
 *     giaTriTinh — GIÁ TRỊ HIỂN THỊ sau khi tính (ô thường = chính giá trị; ô công thức = kết quả)
 * Ảnh chụp một file:
 *   anh = { ten, tenSheet:[...], sheets:{ '<tên sheet>': ss } }
 *
 * === HỢP ĐỒNG THAO TÁC (vỏ phải hiểu đủ 8 loại) ===
 *   { loai:'TAO_SHEET',  ten }                                  tạo sheet nếu chưa có
 *   { loai:'BO_GOP',     sheet, r1,c1,r2,c2 }                    bỏ MỌI ô gộp cắt qua hình chữ nhật
 *   { loai:'XOA_VUNG',   sheet, r1,c1,r2,c2 }                    xóa nội dung, GIỮ định dạng
 *   { loai:'XOA_DONG',   sheet, r1, soDong }                     XÓA HẲN cả dòng, mọi dòng dưới dồn lên
 *   { loai:'GHI_O',      sheet, r,c, gt, dinhDang }              ghi giá trị thuần (gt=null → xóa ô)
 *   { loai:'GHI_CT',     sheet, r,c, text, mang }                ghi công thức (text KHÔNG có dấu `=`)
 *   { loai:'GHI_BANG',   sheet, r1,c1, bang[][] }                ghi cả bảng một lần (theo lô)
 *   { loai:'GOP_O',      sheet, r1,c1,r2,c2 }                    gộp ô
 *   { loai:'CHEN_COT',   sheet, truocCot }                       chèn một cột trống trước cột `truocCot`
 *   { loai:'KEO_CT',     sheet, c, r1, r2 }                      (2.6.0) mọi ô CHƯA có công thức trong `r1..r2`
 *                                                                 của cột `c` nhận công thức của ô có công thức GẦN
 *                                                                 NHẤT phía trên, dịch tương đối như kéo chuột; ô có
 *                                                                 GIÁ TRỊ gõ tay thì để yên. Vỏ phải tự nới lưới dòng.
 *
 * === ĐỔI 13/9/2026 (bản 2.6.0) ===
 *  · D-57/YC-39.3: sau khi dọn, E/F/L/M/N của sheet gian hàng (`TikTok Shop`: E/F/L/O/P), C/E/F/G của `Tổng nhập`
 *    và mọi cột công thức của `Đơn ngoài` có công thức ĐỦ từ dòng 4 tới dòng `DONG_KEO_CT` (2003) — thao tác
 *    `KEO_CT`. Công thức chép nguyên văn của chủ shop (kể cả IFERROR), không bịa.
 *  · Khuôn tháng 9 (chủ dự án chốt 13/9): thêm `TikTok Shop` (dọn như gian hàng), `Chi Phí Hàng Ngày` (dọn dữ
 *    liệu từ dòng 3), `Lợi nhuận` 13 dòng nhãn 6→18. Cột tháng mới của `Lợi nhuận` KHÔNG còn viết cứng năm công
 *    thức: đọc cột `D` của file tháng cũ, ô nào là công thức có tham chiếu thì chép nguyên văn, ô số gõ tay hay
 *    công thức toàn hằng số (`=1320000+30000`) thì để trống — tháng 8 ra đúng năm công thức cũ, tháng 9 ra đúng
 *    mười công thức mới, tháng sau chủ shop thêm dòng nào tool theo dòng đó.
 *  · D-45: vỏ tháng mới là BẢN SAO file tháng cũ (chủ dự án tự "Tạo bản sao"). Phép R-1…R-4 vì thế đếm DỮ LIỆU
 *    MỚI — ô gõ tay KHÁC ô cùng vị trí ở file tháng cũ. Bản sao nguyên vẹn và vỏ đã dọn tay đều qua; chỉ cần một
 *    ô user gõ thêm hay sửa là dừng. Cờ `DA_KHOI_TAO_` chép theo bản sao (ô `O2` là tháng cũ) không chặn tháng mới.
 */
var TaoThangMoi = (function () {

  var PHIEN_BAN = 'GD3-v1.0';
  var TEN_SHEET_MAPPING = 'Mapping_san_pham';
  var TEN_SHEET_MAPPING_CU = ['Mapping_san_pham', 'Mapping sản phẩm'];
  /** Đáy vùng dữ liệu dùng trong mọi công thức dựng lại — theo `CONG_THUC_DAN_VAO_GOOGLE_SHEET.md`. */
  var DAY_VUNG = 2000;
  /** D-57: công thức từng dòng có sẵn tới dòng này (2.000 dòng, 4 → 2003). */
  var DONG_KEO_CT = 2003;
  var COT_MAPPING_CUOI = 12;                     // A:L — tối thiểu; có cột phụ (lô phụ) thì đọc rộng hơn
  /** Cột N: khối điều khiển N1:O5. Mapping đọc/chép KHÔNG bao giờ lấn tới đây. */
  var COT_KHOI_DIEU_KHIEN = 14;

  // ---------------------------------------------------------------- công thức nguyên văn

  /**
   * === TOOL KHÔNG TỰ VIẾT CÔNG THỨC VÀO CỘT CỦA CHỦ SHOP ===
   *
   * Bản trước đặt ở đây bốn hằng `ARRAYFORMULA` chép từ `CONG_THUC_DAN_VAO_GOOGLE_SHEET.md`
   * rồi ghi vào `E4`,`F4`,`M4`,`N4`. Ba thứ sai cùng lúc, cả ba đều ĐO ĐƯỢC:
   *
   *  1. Tài liệu nguồn đã bị BA HỦY ngày 08/9/2026 (xem khung ⛔ đầu file đó và Phụ lục A của
   *     `05_GIAO_VIEC_DEV_v2.4.md`). Bốn công thức ấy CHƯA TỪNG được dán vào file nào.
   *  2. E/F/M/N của file thật KHÔNG phải ARRAYFORMULA một ô mà là công thức TỪNG DÒNG
   *     (`ARRAY_CONSTRAIN(...;1;1)` trên Google, công thức mảng một-ô trên `.xlsx`).
   *     Đo trên `THANG-9-2026-KINH-DOANH_DA_SUA_CONG_THUC.xlsx`, sheet `Shopee mall`:
   *     E 414 ô (dòng 4→417) · F 415 ô (4→418) · M 399 ô (4→402) · N 399 ô (4→402).
   *     Ghi một ô ARRAYFORMULA vào đó là đổi 414 ô công thức của chủ shop lấy 1 ô.
   *  3. Vùng tra trong bốn hằng đó là `$3:$484`, còn vùng THẬT là `$3:$741` (N) và `$3:$462` (M).
   *     Nghĩa là công thức tool ghi vào còn tra sai vùng.
   *
   * Luật thay thế: **không ghi gì vào E, F, L, M, N.** Việc dọn tháng cũ làm bằng XÓA HẲN DÒNG,
   * nên công thức từng dòng của chủ shop ở các dòng còn lại được giữ nguyên, kể cả chỗ họ sửa tay.
   * Ngoại lệ duy nhất: một cột công thức bị xóa hết sạch thì gieo lại DÒNG 4 bằng CHÍNH mẫu công
   * thức của cột đó (đọc từ file, dịch về dòng 4) — chép lại của chủ shop, không bịa công thức mới.
   */

  /** Đổi `;` → `,` cho vỏ Excel. Chỉ đổi dấu phân cách NGOÀI chuỗi trong nháy kép. */
  /**
   * Dấu phân cách đối số của CHÍNH sổ — cho công thức tool TỰ DỰNG (hiện chỉ có `Tổng nhập`!I).
   *
   * VÌ SAO (đo thật trên Google 14/9 23:10, bản sao tháng 10): Google trả `getFormulas()` và đọc công thức ghi bằng
   * `setValues('=…')` THEO CÀI ĐẶT VÙNG của sổ — sổ Việt Nam dùng `;`. Công thức chép từ sổ (C/E/F/G `Tổng nhập`,
   * `Lợi nhuận`!D7) nên tự đúng; riêng `iferror(H4*G4,"")` do vỏ Google gán cứng dấu `,` thì ra `#ERROR!` (lỗi cú pháp) →
   * `Tổng nhập`!I2 và `Lợi nhuận` D6/D11/D12 lỗi theo, K-2 và K-6 lệch. Bản xuất .xlsx luôn đổi về `,` nên nhìn file xuất
   * không thấy được — phải dò từ chính công thức Google trả về.
   * Luật dò: có dấu `;` NGOÀI chuỗi trong bất kỳ công thức nào của ảnh chụp → `;`; không có mà có `,` → `,`; không có công
   * thức nhiều đối số nào → `;` (khuôn sổ của shop).
   * @param {Array} dsAnh các ảnh chụp file (mới trước, cũ sau)
   */
  function dauPhanCachCuaAnh(dsAnh) {
    var coPhay = false;
    for (var i = 0; i < dsAnh.length; i++) {
      var sheets = (dsAnh[i] && dsAnh[i].sheets) || {};
      for (var ten in sheets) {
        var rows = sheets[ten].congThuc || [];
        for (var r = 0; r < rows.length; r++) {
          var row = rows[r] || [];
          for (var c = 0; c < row.length; c++) {
            var f = row[c];
            if (!f) continue;
            var trongChuoi = false;
            for (var k = 0; k < f.length; k++) {
              var ch = f.charAt(k);
              if (ch === '"') trongChuoi = !trongChuoi;
              else if (!trongChuoi && ch === ';') return ';';
              else if (!trongChuoi && ch === ',') coPhay = true;
            }
          }
        }
      }
    }
    return coPhay ? ',' : ';';
  }

  function doiDauPhanCach(text, dau) {
    if (dau === ';') return text;
    var out = '', trongChuoi = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '"') trongChuoi = !trongChuoi;
      out += (ch === ';' && !trongChuoi) ? dau : ch;
    }
    return out;
  }

  // ---------------------------------------------------------------- bố cục sheet

  /**
   * Bố cục sheet gian hàng. `Tiktok` có bố cục lệch một cột từ `I` trở đi (không có cột `MGG Shop`),
   * nên phải tả riêng — mục 8.5 đặc tả yêu cầu luật theo nội dung, ngày nào bán Tiktok thật thì dọn được ngay.
   */
  var BO_CUC = {
    CHUAN: {
      cotTenVietTat: 'D', cotTenSP: 'E', cotDonVi: 'F', cotMaHang: 'M', cotCheckTon: 'N',
      cotDoanhThu: 'L', cotTong: ['H', 'I', 'J', 'K', 'L'], cotCuoiDon: 'O',
      // Cột mang công thức TỪNG DÒNG của chủ shop. Tool không ghi vào, chỉ ĐO và giữ.
      cotCongThuc: ['E', 'F', 'L', 'M', 'N']
    },
    TIKTOK: {
      cotTenVietTat: 'D', cotTenSP: 'E', cotDonVi: 'F', cotMaHang: 'L', cotCheckTon: 'M',
      cotDoanhThu: 'K', cotTong: ['H', 'I', 'J', 'K'], cotCuoiDon: 'N',
      cotCongThuc: ['E', 'F', 'K', 'L', 'M']
    },
    /** `TikTok Shop` (khuôn tháng 9, đo 13/9): như CHUẨN nhưng M=Ảnh, N=Ghi Chú, O=Mã hàng, P=Check tồn. */
    TIKTOK_SHOP: {
      cotTenVietTat: 'D', cotTenSP: 'E', cotDonVi: 'F', cotMaHang: 'O', cotCheckTon: 'P',
      cotDoanhThu: 'L', cotTong: ['H', 'I', 'J', 'K', 'L'], cotCuoiDon: 'P',
      cotCongThuc: ['E', 'F', 'L', 'O', 'P']
    }
  };

  /**
   * Khuôn `TikTok Shop` đọc theo TIÊU ĐỀ DÒNG 2, không đoán theo tên sheet (Đợt 4, P-9 — đo 15/9): DEMO tháng 9 trên Google còn khuôn
   * 13/9 (17 cột: M=Ảnh, N=Ghi Chú, O=Mã hàng, P=Check tồn, Q=Còn Nợ), còn sổ thật đã về 15 cột như `Shopee mall` (M=Mã hàng,
   * N=Check tồn, O=Còn Nợ). Áp khuôn 17 cột lên sổ 15 cột là gieo công thức vào O (Còn Nợ) và P → sổ tháng mới sai sheet đó.
   * Tiêu đề không khớp khuôn nào → null: người gọi DỪNG trước khi ghi ô nào (`KHUON_TIKTOK_LA`).
   * @returns {{boCuc: Object, ten: string}|null}
   */
  function boCucTikTokShop(ss) {
    if (!ss) return null;
    // YC-55 (BA 16/9): KHÔNG gõ cứng chữ cái cột — tìm từng cột theo NỘI DUNG tiêu đề dòng 2 (như mục 8.5 làm cho sheet `Tiktok`).
    var viTri = {};
    for (var c = 1; c <= 40; c++) {
      var t = Utils.chuanHoaChuoi(tinh(ss, 2, c));
      if (t && viTri[t] == null) viTri[t] = c;
    }
    var can = { tenVietTat: 'tên viết tắt', tenSP: 'tên sản phẩm', donVi: 'đơn vị', tienSP: 'tổng tiền sp', mgg: 'mgg shop', chiPhi: 'chi phí',
      thue: 'thuế', doanhThu: 'doanh thu', maHang: 'mã hàng', checkTon: 'check tồn' };
    var cot = {};
    for (var k in can) {
      if (!Object.prototype.hasOwnProperty.call(can, k)) continue;
      if (viTri[can[k]] == null) return null;
      cot[k] = viTri[can[k]];
    }
    // Khối đơn kết thúc ở "Còn Nợ" nếu nó đứng ngay sau "Check tồn" (như Shopee mall), không thì ở "Check tồn".
    var conNo = viTri['còn nợ'];
    var cuoi = conNo === cot.checkTon + 1 ? conNo : cot.checkTon;
    var chu = function (n) { return Utils.chuCot(n); };
    var boCuc = {
      cotTenVietTat: chu(cot.tenVietTat), cotTenSP: chu(cot.tenSP), cotDonVi: chu(cot.donVi), cotMaHang: chu(cot.maHang), cotCheckTon: chu(cot.checkTon),
      cotDoanhThu: chu(cot.doanhThu), cotTong: [chu(cot.tienSP), chu(cot.mgg), chu(cot.chiPhi), chu(cot.thue), chu(cot.doanhThu)], cotCuoiDon: chu(cuoi),
      cotCongThuc: [chu(cot.tenSP), chu(cot.donVi), chu(cot.doanhThu), chu(cot.maHang), chu(cot.checkTon)]
    };
    return { boCuc: boCuc, ten: 'Mã hàng=' + boCuc.cotMaHang + ', Check tồn=' + boCuc.cotCheckTon + (conNo ? ', Còn Nợ=' + chu(conNo) : '') + ' (' +
      (cot.maHang === 13 ? '15 cột như Shopee mall' : '17 cột có Ảnh, Ghi Chú') + ')' };
  }

  var SHEET_GIAN_HANG = ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'];
  var SHEET_DON_NGOAI = 'Đơn ngoài';
  var SHEET_TIKTOK = 'Tiktok';
  var SHEET_TIKTOK_SHOP = 'TikTok Shop';
  var SHEET_CHI_PHI = 'Chi Phí Hàng Ngày';
  var SHEET_TON_KHO = 'Tổng tồn kho';
  var SHEET_NHAP = 'Tổng nhập';
  var SHEET_LOI_NHUAN = 'Lợi nhuận';

  /** Bố cục `Đơn ngoài` — KHÁC hẳn bốn sheet trên, áp nhầm là ghi lệch cột toàn bộ (mục 4 dòng 8). */
  var DON_NGOAI = {
    cotTenVietTat: 'E', cotTenSP: 'F', cotDonVi: 'G', cotSoLuong: 'H', cotTienSP: 'I',
    cotChiPhi: 'J', cotMaGiam: 'K', cotPhuong: 'L', cotOanh: 'M', cotMaHang: 'N', cotCheckTon: 'O',
    cotTong: ['L', 'M'], cotCuoiDon: 'O',
    // YC-63 (2.8.3): danh sách CỐ ĐỊNH, chỉ dùng khi vùng dòng trống (dưới khối đơn) của cả vỏ lẫn tháng cũ không có công thức
    // nào. Đo sổ T10 thật 2/11: dòng trống chỉ `M` (OANH) mang `=I-J`, `L` (PHƯƠNG) và `I` trống → F,G,M,N,O. Bản cũ ghi `L` là sai.
    // Hai cột tiền `L` và `M` KHÔNG BAO GIỜ cùng mang công thức: `Lợi nhuận`!D7 cộng CẢ `L3` lẫn `M3` → doanh số tính hai lần (K-9).
    cotCongThuc: ['F', 'G', 'M', 'N', 'O']
    // Cột được KÉO tới dòng 2003 (D-57) đo trên file: cột nào đang có công thức ở VÙNG DÒNG TRỐNG thì kéo cột đó (`cotCoCongThuc`).
  };

  /**
   * YC-63 việc 2 — `Tổng xuất`!I..N: `SUMIF(<sheet gian hàng>!$M$4:$M$x;<mã>;<sheet gian hàng>!$G$4:$G$x)`, tiêu đề dòng 3 là tên
   * (rút gọn) của sheet đó. `deleteRows` ở sheet gian hàng làm Google CO vùng này đúng bằng số dòng xóa mỗi tháng → thiếu thầm (đơn nằm
   * dưới đáy vùng không được trừ tồn), rồi tới tháng vùng nằm trọn trong khối xóa thì `#REF!` (sổ T10: `Importmart` còn `$4:$31`).
   */
  var SHEET_TONG_XUAT = 'Tổng xuất';
  var COT_TONG_XUAT = ['I', 'J', 'K', 'L', 'M', 'N'];
  /** YC-63 việc 3 — sổ quỹ chạy liên tục qua các tháng (không dọn): chỉ đổi dòng bắt đầu của ô tổng chi phí ở dòng 4. */
  var SHEET_THU_CHI_B = 'THU CHI B';
  /** `THU CHI B`!H4 (tổng dư quỹ), I4, J4 (số dư BIDV cộng dồn) — TUYỆT ĐỐI không đụng, dù công thức có dạng nào. */
  var COT_THU_CHI_B_GIU = ['H', 'I', 'J'];
  /** INV-10: Web App không đọc một ô nào của sheet này — kể cả lúc quét tham chiếu. */
  var SHEET_THONG_TIN_SHOP = 'Thông tin shop';

  // ---------------------------------------------------------------- tiện ích đọc ảnh chụp

  function C(chu) { return Utils.chiSoCot(chu); }
  function L(n) { return Utils.chuCot(n); }

  function o(ss, r, c) {
    var row = ss && ss.giaTri && ss.giaTri[r - 1];
    return row ? (row[c - 1] == null ? null : row[c - 1]) : null;
  }
  function ct(ss, r, c) {
    var row = ss && ss.congThuc && ss.congThuc[r - 1];
    return row ? (row[c - 1] == null ? null : row[c - 1]) : null;
  }
  function tinh(ss, r, c) {
    var row = ss && ss.giaTriTinh && ss.giaTriTinh[r - 1];
    if (row && row[c - 1] != null) return row[c - 1];
    return o(ss, r, c);
  }
  function laMang(ss, r, c) {
    var row = ss && ss.mang && ss.mang[r - 1];
    return !!(row && row[c - 1]);
  }
  function sheet(anh, ten) { return (anh && anh.sheets && anh.sheets[ten]) || null; }
  function soDong(ss) { return Math.max(ss.soDong || 0, ss.giaTri ? ss.giaTri.length : 0); }

  /** Số → number; chuỗi số → number; còn lại → null. Dùng cho mọi phép so tiền. */
  function so(v) {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    if (v == null || v === '') return null;
    var n = Number(String(v).replace(/\s/g, ''));
    return isNaN(n) ? null : n;
  }

  function laLoi(v) {
    return typeof v === 'string' && /^#(REF!|N\/A|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|ERROR!)$/.test(v.trim());
  }

  // ---------------------------------------------------------------- LỚP 2: file có thật sự rỗng không

  /**
   * Ô "có dữ liệu" = ô KHÔNG PHẢI công thức và có giá trị.
   *
   * Triệu chứng đang chống: vỏ file tháng mới do chủ dự án nhân bản **vẫn còn công thức** —
   * công thức TỪNG DÒNG ở E, F, L, M, N (bọc `ARRAY_CONSTRAIN`, KHÔNG phải ARRAYFORMULA một ô), kéo sẵn
   * tới dòng 2003 theo D-57. Coi "ô có công thức" là "ô có dữ liệu"
   * thì mọi vỏ file đều bị chấm là "đã dùng dở" và tool KHÔNG BAO GIỜ chịu khởi tạo file nào.
   * Ngược lại, đơn user gõ tay luôn là GIÁ TRỊ, nên luật này vẫn bắt được file đã dùng dở.
   */
  function oCoDuLieu(ss, r, c) {
    if (ct(ss, r, c) != null) return false;
    var v = o(ss, r, c);
    return !Utils.laRong(v);
  }

  /** Hai giá trị ô coi là MỘT (bản sao nguyên vẹn): ngày so theo mốc thời gian, số so theo số, chữ bỏ khoảng trắng hai đầu. */
  function giongNhau(a, b) {
    if (a instanceof Date || b instanceof Date) {
      var ta = a instanceof Date ? a.getTime() : NaN, tb = b instanceof Date ? b.getTime() : NaN;
      return ta === tb;
    }
    if (typeof a === 'number' || typeof b === 'number') return so(a) != null && so(a) === so(b);
    return String(a == null ? '' : a).trim() === String(b == null ? '' : b).trim();
  }

  /**
   * Quét ô DỮ LIỆU (gõ tay, không phải công thức) trong một vùng.
   * @param ssCu (2.6.0, D-45) sheet cùng tên ở file tháng cũ. Có thì ô giống HỆT ô cùng vị trí ở tháng cũ
   *             KHÔNG tính là dữ liệu mới (đó là phần bản sao, tool sẽ dọn) — chỉ đếm vào `soOBanSao`.
   */
  function quetDuLieu(ss, r1, c1, r2, c2, gioiHan, ssCu) {
    var kq = { soO: 0, viTri: [], soOBanSao: 0 };
    if (!ss) return kq;
    var het = Math.min(r2, soDong(ss));
    for (var r = r1; r <= het; r++) {
      for (var c = c1; c <= c2; c++) {
        if (!oCoDuLieu(ss, r, c)) continue;
        if (ssCu && oCoDuLieu(ssCu, r, c) && giongNhau(o(ss, r, c), o(ssCu, r, c))) { kq.soOBanSao++; continue; }
        kq.soO++;
        if (kq.viTri.length < (gioiHan || 5)) kq.viTri.push(L(c) + r + '="' + String(o(ss, r, c)).slice(0, 30) + '"');
      }
    }
    return kq;
  }

  /**
   * Cột (trong `1..cCuoi`) có ít nhất một ô công thức ở VÙNG DÒNG TRỐNG — ở bất kỳ nguồn nào được đưa vào.
   * YC-63 (2.8.3): mỗi nguồn là `{ ss, tuDong }` — `tuDong` = dòng đầu vùng dòng trống (ngay dưới khối đơn đã ghi, `dongDauVungTrong`).
   * Tới 2.8.2 đo từ dòng 4, nên MỘT ô công thức gõ tay trong dòng đơn (`Đơn ngoài`!I11 `=75000*25+70000`) là đủ biến cả cột thành
   * "cột công thức" và bị kéo tới dòng 2003 (sự cố sổ T11 ngày 2/11: I = 1.945.000 × 2.000 dòng, K-7 = 7.780.000.000).
   * Truyền thẳng `ss` (không bọc) = đo từ dòng 4 như cũ.
   */
  function cotCoCongThuc(dsNguon, cCuoi) {
    var ra = [];
    for (var c = 1; c <= cCuoi; c++) {
      var co = dsNguon.some(function (x) {
        var ss = x && x.ss !== undefined ? x.ss : x;
        if (!ss) return false;
        var tu = Math.max(4, (x && x.tuDong) || 4), het = Math.min(soDong(ss), DONG_KEO_CT);
        for (var r = tu; r <= het; r++) if (ct(ss, r, c) != null) return true;
        return false;
      });
      if (co) ra.push(L(c));
    }
    return ra;
  }

  /** YC-63: dòng đầu VÙNG DÒNG TRỐNG của một sheet = ngay dưới khối đơn đã ghi (cột khóa, như `dongCuoiDuLieu`); tối thiểu dòng 4. */
  function dongDauVungTrong(ss, cCuoi, chuKhoa) {
    if (!ss) return 4;
    return Math.max(4, dongCuoiDuLieu(ss, cCuoi, chuKhoa).dong + 1);
  }

  /**
   * Khối dòng chủ shop ĐÃ GHI — thứ duy nhất được phép xóa hẳn.
   *
   * `dong`  = dòng cuối cùng còn giá trị gõ tay ở **cột khóa** (Tên viết tắt). Mọi dòng đơn thật
   *           đều có ô này, kể cả dòng con của đơn nhiều sản phẩm.
   * `dongMoiCot` = dòng cuối cùng còn giá trị gõ tay ở BẤT KỲ cột nào trong `1..cCuoi`.
   *
   * Vì sao lấy `dong` (cột khóa) làm mốc xóa chứ không lấy `dongMoiCot`:
   *   một ô ghi chú lạc ở `O900` sẽ kéo `dongMoiCot` lên 900, và tool sẽ xóa hẳn 897 dòng —
   *   mất luôn toàn bộ vùng công thức dự trữ của chủ shop, không hoàn tác được. Đo trên tháng 8:
   *   cả 6 sheet đều có `dong == dongMoiCot`, nên khoanh vào cột khóa hôm nay không bỏ sót gì,
   *   mà chặn được đúng cái ca hỏng-không-cứu-được.
   * Ô công thức KHÔNG tính là "đã ghi" — đó là công thức kéo sẵn xuống hàng trăm dòng trống.
   * Trả `dong` = 0 nghĩa là vỏ chưa ghi dòng nào → KHÔNG xóa dòng nào, công thức nguyên vẹn.
   */
  function dongCuoiDuLieu(ss, cCuoi, chuKhoa) {
    var kq = { dong: 0, dongMoiCot: 0, oLac: [] };
    if (!ss) return kq;
    var het = Math.min(soDong(ss), DAY_VUNG), cKhoa = chuKhoa ? C(chuKhoa) : 0;
    for (var r = 4; r <= het; r++) {
      if (cKhoa && oCoDuLieu(ss, r, cKhoa)) kq.dong = r;
      for (var c = 1; c <= cCuoi; c++) {
        if (oCoDuLieu(ss, r, c)) { kq.dongMoiCot = r; break; }
      }
    }
    if (!cKhoa) kq.dong = kq.dongMoiCot;
    for (var r3 = kq.dong + 1; r3 <= kq.dongMoiCot && kq.oLac.length < 5; r3++) {
      for (var c3 = 1; c3 <= cCuoi; c3++) {
        if (oCoDuLieu(ss, r3, c3)) { kq.oLac.push(L(c3) + r3 + '="' + String(o(ss, r3, c3)).slice(0, 20) + '"'); break; }
      }
    }
    return kq;
  }

  /**
   * D-45: ô gõ tay nằm DƯỚI khối đơn mà GIỐNG HỆT ô cùng vị trí ở tháng cũ là rác của bản sao (đo tháng 9:
   * `Shopee mall`!A25:A26 là hai ngày user gõ sẵn cho đơn chưa về). Để lại thì sau khi dồn dòng chúng nằm ngay
   * dòng 4–5 của tháng mới và nút 4 bắt đầu ghi đơn từ dòng 6. Dọn từng ô (không xóa dòng — dòng đó có công thức).
   * Ô lạc KHÁC tháng cũ vẫn giữ nguyên và vẫn cảnh báo như trước.
   * @returns {{thaoTac: Array, conLac: string[]}} `conLac`: ô lạc còn lại để cảnh báo (tối đa 5)
   */
  function thaoTacDonOLac(ten, ss, ssCu, dCuoi, cCuoi, lech, tuDong) {
    var tt = [], conLac = [];
    var het = Math.min(soDong(ss), DAY_VUNG), dich = dCuoi >= 4 ? dCuoi - 3 : 0, doi = lech || 0;
    for (var r = Math.max(4, dCuoi + 1, tuDong || 0); r <= het; r++) {
      var laDongLac = false;
      for (var c = 1; c <= cCuoi; c++) {
        if (!oCoDuLieu(ss, r, c)) continue;
        // `doi` (YC-62): sheet đã bị xóa dòng ở lần tính trước → ô ở dòng `r` hôm nay là ô ở dòng `r + doi` của tháng cũ.
        if (ssCu && oCoDuLieu(ssCu, r + doi, c) && giongNhau(o(ss, r, c), o(ssCu, r + doi, c))) {
          tt.push({ loai: 'GHI_O', sheet: ten, r: r - dich, c: c, gt: null });
        } else if (!laDongLac && conLac.length < 5) {
          conLac.push(L(c) + r + '="' + String(o(ss, r, c)).slice(0, 20) + '"');
          laDongLac = true;
        }
      }
    }
    return { thaoTac: tt, conLac: conLac };
  }

  /**
   * YC-62 (2.8.2): mốc xóa dòng và độ dồn của một sheet. `truoc` = dòng cuối khối đơn ở LẦN TÍNH TRƯỚC (vỏ Google đưa vào qua
   * `ts.khoiDonLuotTruoc` khi tính lại thao tác sau một lệnh bị Google ngắt). Khối đơn không còn ở chỗ cũ (`khoi.dong < truoc`) ⇒
   * `deleteRows` đã chạy xong phía Google trước khi báo lỗi: KHÔNG xóa dòng nữa (`dCuoi` = 3) và mọi dòng dưới đã dồn lên
   * `truoc - 3` dòng — ô lạc so với tháng cũ theo độ dồn đó, kết quả y hệt lần chạy một hơi (đo: `Shopee mall`!A25:A26 hai ngày gõ
   * sẵn dồn lên A4:A5; không có độ dồn thì lần tính lại coi là ô lạ và để lại, lệch 2 ô so với chạy một hơi). Không có mốc trước
   * (lượt bấm lại) → mốc là cột khóa như trước, ô lạc dồn lên không làm xóa dòng vì cột khóa D trống (TM-W-43).
   */
  function mocXoaDong(ss, ssCu, khoi, cCuoi, truoc) {
    if (truoc >= 4 && khoi.dong < truoc) return { dCuoi: 3, lech: truoc - 3 };
    return { dCuoi: khoi.dong, lech: 0 };
  }

  /** Đếm ô công thức của một cột từ dòng `r1` xuống, và dòng cuối cùng còn công thức. */
  function vungCongThucCot(ss, chuCot, r1) {
    var c = C(chuCot), het = soDong(ss), soO = 0, cuoi = 0;
    for (var r = r1; r <= het; r++) if (ct(ss, r, c) != null) { soO++; cuoi = r; }
    return { soO: soO, dongCuoi: cuoi };
  }

  /**
   * ĐO vùng công thức của một sheet TRƯỚC và SAU khi xóa `dCuoi-3` dòng đầu.
   * Xóa hẳn dòng thì các dòng dưới DỒN LÊN: ô công thức không mất, chỉ đổi số dòng.
   * Đây là số liệu để chỉ tiêu nghiệm thu TM-10 chấm, và để thấy vùng công thức bị ăn mòn bao nhiêu.
   */
  function doVungCongThuc(ss, cotCongThuc, dCuoi) {
    var d = {};
    cotCongThuc.forEach(function (chu) {
      var truoc = vungCongThucCot(ss, chu, 4);
      var conLai = vungCongThucCot(ss, chu, Math.max(4, dCuoi + 1));
      var dich = dCuoi >= 4 ? (dCuoi - 3) : 0;
      d[chu] = {
        truoc: truoc.soO, truocDongCuoi: truoc.dongCuoi,
        sau: conLai.soO, sauDongCuoi: conLai.dongCuoi ? conLai.dongCuoi - dich : 0
      };
    });
    return d;
  }

  /** Danh sách sheet của tháng mới phải khớp tháng cũ (bỏ qua `Mapping_san_pham` tool tự thêm). */
  function sheetNgoaiMapping(anh) {
    return (anh.tenSheet || []).filter(function (t) { return TEN_SHEET_MAPPING_CU.indexOf(t) < 0; });
  }

  /**
   * Lớp 1 (ô cờ) + lớp 2 (nội dung). Phải CÙNG đồng ý mới được chạy (mục 3.3).
   * @returns { chay, lop1:{trangThai, buocDaXong}, lop2:[{ma,dat,chiTiet}], lyDoDung:[] }
   */
  /**
   * Ô cờ `THANG` (O2) đọc về có thể là NGÀY chứ không phải chuỗi: Google tự đổi chuỗi '2026-10' ghi bằng setValues
   * thành ngày 01/10/2026 khi ô chưa ép định dạng văn bản (bẫy đã ghi ở `ghiMotSheet_`). Không chuẩn hóa thì cờ của
   * CHÍNH file đang tạo bị coi là cờ chép theo bản sao — lượt chạy tiếp thành FILE_CO_DU_LIEU, bấm lại sau khi xong
   * không còn ra DA_KHOI_TAO. Bản 2.6.1 ghi O2 với định dạng '@', hàm này đỡ cho file đã ghi trước đó.
   */
  function chuanThangCo(v) {
    if (v && Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime())) {
      return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2);
    }
    return String(v == null ? '' : v).trim();
  }

  function kiemDieuKien(anhMoi, anhCu, thangMoi) {
    var ssMap = sheet(anhMoi, TEN_SHEET_MAPPING) || sheet(anhMoi, 'Mapping sản phẩm');
    var trangThai = ssMap ? String(tinh(ssMap, 1, C('O')) || '').trim() : '';
    var buocDaXong = ssMap ? String(tinh(ssMap, 5, C('O')) || '').trim() : '';
    var thangCo = ssMap ? chuanThangCo(tinh(ssMap, 2, C('O'))) : '';
    var lyDo = [], ghiChu = [];

    // D-45: vỏ là BẢN SAO file tháng cũ nên mang theo nguyên khối cờ của tháng cũ. Cờ có ghi tháng (`O2`) và
    // tháng đó KHÁC tháng đang tạo → cờ đó là của file nguồn, không phải của file này: bắt đầu như file mới.
    // Cờ không ghi tháng thì KHÔNG đoán — giữ luật một chiều bên dưới.
    if (thangMoi && thangCo && thangCo !== String(thangMoi) && /^(DA|DANG)_KHOI_TAO_/.test(trangThai)) {
      ghiChu.push('Khối cờ N1:O5 đang ghi tháng ' + thangCo + ' (chép theo bản sao của file tháng cũ) → coi file này CHƯA khởi tạo cho tháng ' + thangMoi + '.');
      trangThai = '';
      buocDaXong = '';
    }
    var lop1 = { trangThai: trangThai || 'CHUA_KHOI_TAO', buocDaXong: buocDaXong, thangCo: thangCo, ghiChu: ghiChu };

    // Luật một chiều: đã khởi tạo rồi thì KHÔNG BAO GIỜ khởi tạo lại, kể cả khi người dùng bấm lại nút.
    if (/^DA_KHOI_TAO_/.test(trangThai)) {
      lyDo.push('File này đã khởi tạo lúc ' + trangThai.replace(/^DA_KHOI_TAO_/, '') +
        '. Muốn làm lại phải xóa file và nhân bản vỏ mới — cố ý làm cho khó, vì ghi đè lên dữ liệu là thứ không cứu được.');
      return { chay: false, maDung: 'DA_KHOI_TAO', lop1: lop1, lop2: [], lyDoDung: lyDo, chayTiep: false };
    }

    // Đợt 4 P-9: khuôn `TikTok Shop` lạ → DỪNG khi chưa ghi ô nào, kể cả lượt chạy tiếp (khuôn không đổi giữa hai lượt).
    var ssTS = sheet(anhMoi, SHEET_TIKTOK_SHOP);
    var khuonTS = ssTS ? boCucTikTokShop(ssTS) : null;
    if (ssTS && !khuonTS) {
      var tdTS = ['L', 'M', 'N', 'O', 'P'].map(function (chu) { return chu + '2="' + String(tinh(ssTS, 2, C(chu)) == null ? '' : tinh(ssTS, 2, C(chu))).trim() + '"'; });
      lyDo.push('Sheet `' + SHEET_TIKTOK_SHOP + '` có tiêu đề dòng 2 không khớp khuôn nào tool biết (' + tdTS.join(' ') + '). Tool biết hai khuôn: ' +
        '15 cột (M=Mã hàng, N=Check tồn) và 17 cột (M=Ảnh, N=Ghi Chú, O=Mã hàng, P=Check tồn). Dọn theo khuôn đoán sai là gieo công thức ' +
        'vào cột của người — KHÔNG khởi tạo, tool chưa ghi ô nào. Báo người phụ trách.');
      return { chay: false, maDung: 'KHUON_TIKTOK_LA', lop1: lop1, lop2: [], lyDoDung: lyDo, chayTiep: false };
    }
    if (khuonTS) ghiChu.push('Sheet `' + SHEET_TIKTOK_SHOP + '`: khuôn ' + khuonTS.ten + ' (đọc theo tiêu đề dòng 2).');

    var dangDo = /^DANG_KHOI_TAO_/.test(trangThai);
    var lop2 = [];
    if (!dangDo) {
      // Chỉ kiểm "rỗng" khi bắt đầu từ đầu. File đang dở (DANG_KHOI_TAO_*) đương nhiên đã có dữ liệu tool ghi.
      // Mọi phép so với sheet CÙNG TÊN ở tháng cũ (D-45): ô giống hệt là phần bản sao, không phải dữ liệu mới.
      var banSao = 0;
      var cu = function (t) { return sheet(anhCu, t); };
      var ssNhap = sheet(anhMoi, SHEET_NHAP);
      var qNhap = quetDuLieu(ssNhap, 4, C('A'), DAY_VUNG, C('L'), 5, cu(SHEET_NHAP));
      banSao += qNhap.soOBanSao;
      lop2.push({ ma: 'R-1', ten: '`Tổng nhập` không có dòng nào mới', dat: qNhap.soO === 0, chiTiet: qNhap.soO + ' ô ' + qNhap.viTri.join(' ') });

      var lechGH = [];
      SHEET_GIAN_HANG.concat([SHEET_TIKTOK_SHOP]).forEach(function (t) {
        var bc = t === SHEET_TIKTOK_SHOP && khuonTS ? khuonTS.boCuc : BO_CUC.CHUAN;
        var q = quetDuLieu(sheet(anhMoi, t), 4, C('A'), DAY_VUNG, C(bc.cotCuoiDon), 5, cu(t));
        banSao += q.soOBanSao;
        if (q.soO) lechGH.push(t + ': ' + q.soO + ' ô ' + q.viTri.join(' '));
      });
      lop2.push({ ma: 'R-2', ten: 'Sheet gian hàng không có đơn mới', dat: lechGH.length === 0, chiTiet: lechGH.join(' | ') || '0 ô' });

      var qDN = quetDuLieu(sheet(anhMoi, SHEET_DON_NGOAI), 4, C('A'), DAY_VUNG, C('O'), 5, cu(SHEET_DON_NGOAI));
      var ssCP = sheet(anhMoi, SHEET_CHI_PHI);
      var qCP = ssCP ? quetDuLieu(ssCP, 3, 1, DAY_VUNG, cotDuLieuChiPhi(ssCP), 5, cu(SHEET_CHI_PHI)) : { soO: 0, viTri: [], soOBanSao: 0 };
      banSao += qDN.soOBanSao + qCP.soOBanSao;
      lop2.push({
        ma: 'R-3', ten: '`Đơn ngoài` (và `' + SHEET_CHI_PHI + '` nếu có) không có dòng mới', dat: qDN.soO === 0 && qCP.soO === 0,
        chiTiet: qDN.soO + ' ô ' + qDN.viTri.join(' ') + (ssCP ? ' · ' + SHEET_CHI_PHI + ': ' + qCP.soO + ' ô ' + qCP.viTri.join(' ') : '')
      });

      var ssLNMoi = sheet(anhMoi, SHEET_LOI_NHUAN);
      var dLN = ssLNMoi ? dongCuoiNhanLoiNhuan(ssLNMoi) : 16;
      var qLN = quetDuLieu(ssLNMoi, 6, C('D'), dLN, C('D'), 5, cu(SHEET_LOI_NHUAN));
      banSao += qLN.soOBanSao;
      lop2.push({ ma: 'R-4', ten: '`Lợi nhuận`!D6:D' + dLN + ' chưa có số gõ tay mới', dat: qLN.soO === 0, chiTiet: qLN.soO + ' ô ' + qLN.viTri.join(' ') });
      if (banSao) ghiChu.push('Vỏ tháng mới là bản sao: ' + banSao + ' ô dữ liệu GIỐNG HỆT tháng cũ — tool sẽ dọn.');

      var sMoi = sheetNgoaiMapping(anhMoi), sCu = sheetNgoaiMapping(anhCu);
      var khop = sMoi.length === sCu.length && sMoi.every(function (t, i) { return t === sCu[i]; });
      lop2.push({
        ma: 'R-5', ten: 'Đủ sheet, đúng tên, đúng thứ tự như tháng cũ', dat: khop,
        chiTiet: khop ? sMoi.length + ' sheet' : 'mới=' + sMoi.length + ' cũ=' + sCu.length + ' · lệch: ' + soSanhDanhSach(sCu, sMoi)
      });

      lop2.forEach(function (p) {
        if (!p.dat) lyDo.push('Phép ' + p.ma + ' không đạt (' + p.ten + '): ' + p.chiTiet + '. Có thể ai đó đã nhập tay — KHÔNG khởi tạo.');
      });
    }

    return { chay: lyDo.length === 0, maDung: lyDo.length ? 'FILE_CO_DU_LIEU' : null, lop1: lop1, lop2: lop2, lyDoDung: lyDo, chayTiep: dangDo };
  }

  /**
   * Cột dữ liệu gõ tay của `Chi Phí Hàng Ngày`: dãy tiêu đề dòng 2 liền nhau từ cột A mà KHÔNG phải công thức
   * (đo tháng 9: A Ngày · B Nguồn · C Ghi chú · D Thành tiền; E2:I2 là SUMIF). Trả số cột cuối (≥ 1).
   */
  function cotDuLieuChiPhi(ss) {
    var c = 1;
    while (c < 26 && ct(ss, 2, c + 1) == null && !Utils.laRong(o(ss, 2, c + 1))) c++;
    return c;
  }

  function soSanhDanhSach(a, b) {
    var thieu = a.filter(function (t) { return b.indexOf(t) < 0; });
    var thua = b.filter(function (t) { return a.indexOf(t) < 0; });
    var s = [];
    if (thieu.length) s.push('thiếu ' + thieu.join(', '));
    if (thua.length) s.push('thừa ' + thua.join(', '));
    if (!s.length) s.push('cùng tên nhưng khác thứ tự');
    return s.join('; ');
  }

  // ---------------------------------------------------------------- B2: đọc tháng cũ một lượt

  /**
   * Danh mục hàng hóa tháng cũ. Tiêu đề ở dòng 2, dữ liệu từ dòng 3.
   * `H` (Tổng tồn) và `G` (Giá vốn) có thể là công thức → phải lấy GIÁ TRỊ ĐÃ TÍNH.
   * Có dòng không có STT (`B` trống) nhưng vẫn là hàng thật → mốc kết thúc là cột `D` (Tên viết tắt).
   */
  function docDanhMuc(ssTon) {
    var n = soDong(ssTon), cuoi = 2;
    for (var r = 3; r <= n; r++) if (!Utils.laRong(o(ssTon, r, C('D')))) cuoi = r;
    var ds = [];
    for (var r2 = 3; r2 <= cuoi; r2++) {
      var ten = o(ssTon, r2, C('D'));
      if (Utils.laRong(ten)) continue;
      ds.push({
        dong: r2,
        stt: o(ssTon, r2, C('B')),
        tenSP: o(ssTon, r2, C('C')),
        tenVietTat: String(ten).trim(),
        maHang: tinh(ssTon, r2, C('E')),
        donVi: o(ssTon, r2, C('F')),
        giaVon: so(tinh(ssTon, r2, C('G'))),
        ton: so(tinh(ssTon, r2, C('H'))) || 0,       // ô công thức trả 0 hay để trống đều là tồn 0
        tienTon: so(tinh(ssTon, r2, C('K')))
      });
    }
    return { ds: ds, dongCuoi: cuoi };
  }

  /** Cột cuối của khối tháng ở `Lợi nhuận`: cột xa nhất từ `D` trở đi mà dòng 5 còn số tháng. */
  function cotCuoiLoiNhuan(ssLN) {
    var cuoi = C('D') - 1;
    var row = (ssLN.giaTri[5 - 1] || []).length;
    var het = Math.max(row, (ssLN.giaTriTinh && ssLN.giaTriTinh[4] ? ssLN.giaTriTinh[4].length : 0), C('D'));
    for (var c = C('D'); c <= het + 2; c++) if (so(tinh(ssLN, 5, c)) != null) cuoi = c;
    return cuoi;
  }

  /**
   * Dòng nhãn cuối của khối `Lợi nhuận`: dải nhãn LIỀN NHAU ở cột `B` bắt đầu từ dòng 6. Tháng 8 là 16, khuôn
   * tháng 9 là 18 (thêm Phí ship, Phí in, CP khác). Phải là dải liền: tháng 8 có số nháp của user ở C19, D19…D30
   * ngay dưới khối — lấy "dòng xa nhất còn chữ" là đóng băng và dựng công thức lên đúng mấy ô nháp đó.
   * Dải ngắn hơn 6 dòng (đọc hỏng) thì giữ 16 như đặc tả.
   */
  function dongCuoiNhanLoiNhuan(ssLN) {
    var r = 6, het = Math.min(soDong(ssLN), 60);
    while (r <= het && !Utils.laRong(o(ssLN, r, C('B')))) r++;
    return r - 1 >= 11 ? r - 1 : 16;
  }

  /** Công thức có tham chiếu ô (không phải toàn hằng số kiểu `1320000+30000`). */
  function laCongThucThamChieu(text) {
    var t = String(text || '');
    return /!/.test(t) || /(^|[^A-Za-z0-9_])\$?[A-Z]{1,3}\$?\d+/.test(t.replace(/"[^"]*"/g, '""'));
  }

  /**
   * Cột `D` của `Lợi nhuận` tháng cũ, dòng 6→dòng nhãn cuối — GIÁ TRỊ ĐÃ TÍNH, đọc TRƯỚC khi dọn (mục 5 bước 8),
   * kèm CÔNG THỨC từng dòng để dựng cột tháng mới đúng khuôn của chính file (2.6.0).
   * `dong6den16` giữ tên cũ cho các chỗ đọc sẵn có; nay dài đúng `dongCuoi - 5` phần tử.
   */
  function docLoiNhuanCu(ssLN) {
    var dCuoi = dongCuoiNhanLoiNhuan(ssLN);
    var gt = [], ctD = [];
    for (var r = 6; r <= dCuoi; r++) {
      gt.push(tinh(ssLN, r, C('D')));
      var t = ct(ssLN, r, C('D'));
      ctD.push(t != null && laCongThucThamChieu(t) ? t : null);
    }
    return {
      dong6den16: gt,
      congThucD: ctD,
      dongCuoi: dCuoi,
      cotCuoi: cotCuoiLoiNhuan(ssLN),
      thangCu: so(tinh(ssLN, 5, C('D'))),
      nam: so(tinh(ssLN, 4, C('D'))),
      tieuDeDong3: tinh(ssLN, 3, C('D'))
    };
  }

  /** Bảng `Mapping_san_pham` A:L của tháng cũ; không có sheet → null (tháng cũ chưa từng chạy tool). */
  function docMapping(anhCu) {
    for (var i = 0; i < TEN_SHEET_MAPPING_CU.length; i++) {
      var ss = sheet(anhCu, TEN_SHEET_MAPPING_CU[i]);
      if (!ss) continue;
      // Rộng theo TIÊU ĐỀ dòng 1 (tối thiểu A:L), dừng TRƯỚC cột N — N1:O5 là khối điều khiển, không phải Mapping.
      var rong = COT_MAPPING_CUOI;
      for (var ch = COT_MAPPING_CUOI + 1; ch < COT_KHOI_DIEU_KHIEN; ch++) if (!Utils.laRong(tinh(ss, 1, ch))) rong = ch;
      var n = soDong(ss), cuoi = 0;
      for (var r = 1; r <= n; r++) {
        for (var c = 1; c <= rong; c++) if (!Utils.laRong(tinh(ss, r, c))) { cuoi = r; break; }
      }
      var bang = [];
      for (var r2 = 1; r2 <= cuoi; r2++) {
        var dong = [];
        for (var c2 = 1; c2 <= rong; c2++) {
          var v = tinh(ss, r2, c2);
          dong.push(v == null ? '' : v);
        }
        bang.push(dong);
      }
      return { ten: TEN_SHEET_MAPPING_CU[i], bang: bang };
    }
    return null;
  }

  /** Số dòng có dữ liệu ở cột `B` (Tên trên Shopee) — thước đo của phép K-5. */
  function demDongMapping(bang) {
    if (!bang) return 0;
    var n = 0;
    for (var r = 1; r < bang.length; r++) if (!Utils.laRong(bang[r][1])) n++;
    return n;
  }

  // ---------------------------------------------------------------- B3: dọn sheet gian hàng

  /**
   * Mục 8.5: luật theo NỘI DUNG chứ không theo tên. `Tiktok` hiện là vỏ rỗng nên bỏ qua;
   * ngày nào shop bán Tiktok thật thì phải dọn, nếu không đơn tháng cũ được tính doanh số lần hai
   * (`Lợi nhuận`!D7 lấy `Tiktok!K3`) và trừ tồn lần hai (`Tổng xuất`!L).
   */
  /**
   * D-57/YC-39.3: sau khi xóa dòng, mọi cột công thức phải có công thức ĐỦ từ dòng 4 tới `DONG_KEO_CT`.
   * Cột mất sạch công thức → gieo dòng 4 bằng mẫu của CHÍNH cột đó (vỏ, rồi tới tháng cũ). Rồi một `KEO_CT`
   * 4 → 2003: vỏ lấp mọi ô trống bằng công thức gần nhất phía trên — cả khe hở giữa vùng lẫn đoạn đuôi.
   * @returns {{thaoTac: Array, gieo: string[], khongMau: string[]}}
   */
  /**
   * YC-63 (2.8.3): mẫu gieo CHỈ lấy ở vùng dòng trống — vỏ (dưới `dCuoi`, nhưng nhánh gieo chỉ chạy khi vỏ không còn công thức nào ở đó)
   * rồi tháng cũ (từ `tc.tuDongCu`). `tc.daSo` (sheet gian hàng, `Tổng nhập`): cả hai vùng trống đều không có → dạng chiếm đa số trong dòng
   * đơn (`mauDaSoDongDon`, vỏ `4..dCuoi` rồi tháng cũ `4..tuDongCu-1`), báo trong `gieoDaSo`. `Đơn ngoài` không bao giờ đi đường này.
   */
  function thaoTacKeoCongThuc(ten, ss, ssCu, dsCot, dCuoi, tc) {
    tc = tc || {};
    var tt = [], gieo = [], khongMau = [], gieoDaSo = [];
    var tuDongCu = Math.max(4, tc.tuDongCu || 4);
    dsCot.forEach(function (chu) {
      if (vungCongThucCot(ss, chu, Math.max(4, dCuoi + 1)).soO === 0) {
        var m = mauCongThuc(ss, chu, dCuoi + 1) || mauCongThuc(ssCu, chu, tuDongCu);
        if (!m && tc.daSo) {
          m = mauDaSoDongDon(ss, chu, 4, dCuoi) || mauDaSoDongDon(ssCu, chu, 4, tuDongCu - 1);
          if (m) gieoDaSo.push(chu + ' (' + m.dem + '/' + m.tong + ' ô cùng dạng)');
        }
        if (!m) { khongMau.push(chu); return; }
        tt.push({ loai: 'GHI_CT', sheet: ten, r: 4, c: C(chu), text: m.text, mang: m.mang });
        gieo.push(chu);
      }
      tt.push({ loai: 'KEO_CT', sheet: ten, c: C(chu), r1: 4, r2: DONG_KEO_CT });
    });
    return { thaoTac: tt, gieo: gieo, khongMau: khongMau, gieoDaSo: gieoDaSo };
  }

  function coDonThat(ss, boCuc) {
    if (!ss) return false;
    var kDoanhThu = so(tinh(ss, 3, C(boCuc.cotDoanhThu)));
    if (kDoanhThu != null && Math.abs(kDoanhThu) > 0.5) return true;
    var q = quetDuLieu(ss, 4, C('A'), DAY_VUNG, C(boCuc.cotCuoiDon), 3);
    return q.soO > 0;
  }

  /**
   * DỌN một sheet gian hàng bằng cách **XÓA HẲN CẢ DÒNG** chủ shop đã ghi, chứ không xóa nội dung.
   *
   * Vì sao đổi (đo ngày 08/9/2026, `Shopee mall`):
   *   · Xóa NỘI DUNG `A4:O2000` xóa luôn công thức từng dòng của E/F/M/N. Vỏ tháng mới nhân bản từ
   *     tháng 8 có 909 ô công thức mỗi cột (dòng 4→912); sau khi tool chạy chỉ còn **1 ô** ở dòng 4.
   *     Cả tháng đó bốn cột Tên sản phẩm / Đơn vị / Mã hàng / Check tồn trống từ dòng 5 xuống.
   *   · Xóa HẲN DÒNG thì dòng dưới dồn lên mang theo công thức của chính nó. Đây đúng cách chủ shop
   *     vẫn làm tay: file tháng 9 thật có E 414 ô (4→417) — bằng 909 ô của tháng 8 trừ đi đúng số
   *     dòng đơn tháng 8 đã ghi. Giữ nguyên công thức gốc, kể cả chỗ chủ shop sửa tay
   *     (cột M tra `$C$3:$G$462` còn E/F tra `$C$3:$G$484` — tool không có cách nào đoán ra).
   *
   * Hệ quả phải chấp nhận: vùng công thức **bị ăn mòn** đúng bằng số dòng đơn mỗi tháng.
   * Tool KHÔNG tự kéo bù, vì kéo bù là tự viết công thức vào file của chủ shop. Việc cảnh báo
   * "còn bao nhiêu dòng dư" nằm ở lớp cảnh báo vùng công thức, không làm ở đây.
   *
   * @param ssCu sheet cùng tên ở tháng cũ — chỉ dùng làm nguồn MẪU dự phòng, không bao giờ ghi vào.
   */
  /**
   * 2.8.4 (chủ dự án 3/11, "chỉ nhóm 1, đáy 2003"): ô TỔNG cả cột = `SUM(x4:x2003)` — đúng 2.000 dòng công thức tool kéo sẵn (4 → 2003).
   * Phải ghi SAU lệnh kéo công thức: lệnh kéo NỚI LƯỚI (chèn dòng cuối sheet), và Google GIÃN mọi vùng vắt qua chỗ chèn — tới 2.8.3 tool ghi
   * `SUM(H4:H2000)` trước rồi mới nới, nên sổ T11 thật ra `Shopee mall`!H3 = `SUM(H4:H2688)`, `TikTok Shop` 3439, `Tổng nhập`!I2 3096.
   */
  function oTongDayChuan(ten, dsCot, dong) {
    return dsCot.map(function (chu) {
      return { loai: 'GHI_CT', sheet: ten, r: dong, c: C(chu), text: 'SUM(' + chu + '4:' + chu + DONG_KEO_CT + ')', mang: false };
    });
  }

  // ---------------------------------------------------------------- 2.9.0: KHUÔN CÔNG THỨC CHUẨN
  //
  // Chủ dự án chốt 3/11: tool KHÔNG còn chép/đoán công thức từ sổ tháng cũ (lỗi tháng trước kéo sang tháng sau — sổ T11 thật có cùng một
  // cột tra danh mục mà đáy 434/435/457/514/714, cột Mã hàng không IFERROR, ô tổng giãn 2048…3439). Mỗi lần tạo tháng, các sheet trong
  // khuôn được GHI ĐÈ đúng công thức dưới đây cho CẢ cột, dòng 4 → 2003 (2.000 dòng); ô có GIÁ TRỊ gõ tay thì để yên. Sheet ngoài khuôn
  // (`THU CHI`, `Trang tính1`, `Lazada`, `Doanh thu thuế`…) giữ nguyên văn bản sao — tool không sửa ô nào.
  // Luật khuôn: công thức TỪNG DÒNG (tra danh mục, doanh thu, tiền…) bọc `IFERROR(…;"")`, vùng tra tới `$2003`; công thức TỔNG
  // (SUM/SUMIF) cũng tới `$2003` nhưng KHÔNG bọc IFERROR — bọc là giấu `#REF!` thành số sai, phép tự kiểm K-6 hết bắt được (sự cố 2/11).
  // Dấu phân cách viết `;` (sổ Việt Nam) rồi đổi theo dấu dò từ chính sổ (`dauKhuon`, đặt ở đầu `lapKeHoach`).

  var dauKhuon = ';';
  function kh(text) { return doiDauPhanCach(text, dauKhuon); }
  var TTK = "'Tổng tồn kho'";
  /** Tra danh mục theo tên viết tắt: vị trí 1 = Tên SP (C), 3 = Mã hàng (E), 4 = Đơn vị (F), 5 = Giá vốn (G). */
  function ctTraDanhMuc(oKhoa, viTri) {
    return kh('IFERROR(INDEX(' + TTK + '!$C$3:$G$' + DONG_KEO_CT + ';MATCH(' + oKhoa + ';' + TTK + '!$D$3:$D$' + DONG_KEO_CT + ';0);' + viTri + ');"")');
  }
  /** Tồn kho hiện tại theo mã hàng (`Tổng tồn kho`!H). */
  function ctTraTon(oMa) {
    return kh('IFERROR(INDEX(' + TTK + '!$E$3:$H$' + DONG_KEO_CT + ';MATCH(' + oMa + ';' + TTK + '!$E$3:$E$' + DONG_KEO_CT + ';0);4);"")');
  }
  /** Khuôn dòng 4 của sheet đơn (gian hàng, `TikTok Shop`, `Tiktok`) theo bố cục: Tên SP, Đơn vị, Doanh thu, Mã hàng, Check tồn. */
  function khuonSheetDon(bc) {
    var k = '$' + bc.cotTenVietTat + '4';
    var tru = bc.cotTong.filter(function (c) { return c !== bc.cotDoanhThu; }).map(function (c) { return c + '4'; }).join('-');
    return [
      { chu: bc.cotTenSP, text: ctTraDanhMuc(k, 1) },
      { chu: bc.cotDonVi, text: ctTraDanhMuc(k, 4) },
      { chu: bc.cotDoanhThu, text: kh('IFERROR(' + tru + ';"")') },
      { chu: bc.cotMaHang, text: ctTraDanhMuc(k, 3) },
      { chu: bc.cotCheckTon, text: ctTraTon(bc.cotMaHang + '4') }
    ];
  }
  /**
   * Khuôn `Đơn ngoài` (đo sổ T10 thật 2/11): F Tên SP, G Đơn vị, M (OANH) `I-J`, N Mã hàng, O Check tồn. I (Tổng tiền SP) và L (PHƯƠNG) là cột
   * GÕ TAY → khuôn TRỐNG: tool xóa mọi công thức ở đó (không đụng giá trị). Không bao giờ có hai cột tiền L và M cùng công thức (K-9).
   */
  function khuonDonNgoai() {
    return [
      { chu: 'F', text: ctTraDanhMuc('$E4', 1) },
      { chu: 'G', text: ctTraDanhMuc('$E4', 4) },
      { chu: 'I', text: null },
      { chu: 'L', text: null },
      { chu: 'M', text: kh('IFERROR(I4-J4;"")') },
      { chu: 'N', text: ctTraDanhMuc('$E4', 3) },
      { chu: 'O', text: ctTraTon('N4') }
    ];
  }
  /** Khuôn `Tổng nhập`: C Tên SP, E Mã hàng, F Đơn vị, G Giá vốn (tra theo D), I Tổng tiền = H × G. */
  function khuonTongNhap() {
    return [
      { chu: 'C', text: ctTraDanhMuc('$D4', 1) },
      { chu: 'E', text: ctTraDanhMuc('$D4', 3) },
      { chu: 'F', text: ctTraDanhMuc('$D4', 4) },
      { chu: 'G', text: ctTraDanhMuc('$D4', 5) },
      { chu: 'I', text: kh('IFERROR(H4*G4;"")') }
    ];
  }
  /** Khuôn `Tổng tồn kho` (dòng 3 = mã đầu danh mục): H Tổng tồn = nhập − xuất, I/J tổng nhập/xuất theo mã (E), K Tiền tồn. */
  function khuonTonKho() {
    return [
      { chu: 'H', text: 'I3-J3' },
      { chu: 'I', text: kh("SUMIF('Tổng nhập'!$E$4:$E$" + DONG_KEO_CT + ";$E3;'Tổng nhập'!$H$4:$H$" + DONG_KEO_CT + ')') },
      { chu: 'J', text: kh("SUMIF('Tổng xuất'!$E$4:$E$" + DONG_KEO_CT + ";$E3;'Tổng xuất'!$H$4:$H$" + DONG_KEO_CT + ')') },
      { chu: 'K', text: 'H3*G3' }
    ];
  }
  /** Tên sheet trong công thức: có dấu cách / ký tự lạ thì bọc nháy đơn. */
  function tenTrongCT(t) { return /^[A-Za-z_][A-Za-z0-9_]*$/.test(t) ? t : "'" + String(t).replace(/'/g, "''") + "'"; }
  /** `Tổng xuất`!I..N của một sheet đơn: SUMIF(<mã hàng>;mã dòng này;<SL>) trên đúng 2.000 dòng của sheet đó. */
  function ctXuatTheoSheet(tenSheet, cotMa, cotSL) {
    var s = tenTrongCT(tenSheet);
    return kh('SUMIF(' + s + '!$' + cotMa + '$4:$' + cotMa + '$' + DONG_KEO_CT + ';$E4;' + s + '!$' + cotSL + '$4:$' + cotSL + '$' + DONG_KEO_CT + ')');
  }
  /** Dạng so sánh của công thức: bỏ `=` đầu, bỏ khoảng trắng và đổi `,` → `;` NGOÀI chuỗi, viết hoa ngoài chuỗi. */
  function chuanCongThuc(f) {
    var t = String(f == null ? '' : f).replace(/^=/, ''), out = '', trong = false;
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (ch === '"') { trong = !trong; out += ch; continue; }
      if (trong) { out += ch; continue; }
      if (/\s/.test(ch)) continue;
      out += ch === ',' ? ';' : ch.toUpperCase();
    }
    return out;
  }
  /** Thao tác ghi khuôn: `cot` = [{c, text}] — `text` là công thức của dòng `r1` (không `=`), null = cột phải TRỐNG công thức. */
  function opKhuon(ten, r1, r2, ds) {
    return { loai: 'GHI_KHUON', sheet: ten, r1: r1, r2: r2, cot: ds.map(function (x) { return { c: C(x.chu), text: x.text }; }) };
  }

  function thaoTacDonGianHang(ten, ss, boCuc, ssCu, truoc) {
    var tt = [];
    var cCuoi = C(boCuc.cotCuoiDon);
    var khoi = dongCuoiDuLieu(ss, cCuoi, boCuc.cotTenVietTat);
    var moc = mocXoaDong(ss, ssCu, khoi, cCuoi, truoc);
    var dCuoi = moc.dCuoi;
    // Bỏ ô gộp TRƯỚC khi xóa: quên bước này thì đơn tháng mới ghi đè lên khung gộp cũ, số nhảy lung tung.
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: DAY_VUNG, c2: cCuoi });
    if (dCuoi >= 4) tt.push({ loai: 'XOA_DONG', sheet: ten, r1: 4, soDong: dCuoi - 3 });
    var lac = thaoTacDonOLac(ten, ss, ssCu, dCuoi, cCuoi, moc.lech);
    tt = tt.concat(lac.thaoTac);
    // 2.9.0: cột công thức = KHUÔN CHUẨN, ghi đè cả cột 4 → 2003 (không còn gieo/kéo theo mẫu của sổ cũ — YC-63 việc 1 giải tận gốc).
    tt.push(opKhuon(ten, 4, DONG_KEO_CT, khuonSheetDon(boCuc)));
    // Dòng tổng: dựng lại cho phủ hết vùng, vì xóa dòng làm co vùng SUM lại đúng bằng số dòng vừa xóa. Ghi SAU lệnh khuôn (lệnh đó nới lưới
    // tới 2003) và đáy = `DONG_KEO_CT` — xem `oTongDayChuan`.
    tt = tt.concat(oTongDayChuan(ten, boCuc.cotTong, 3));
    var d = doVungCongThuc(ss, boCuc.cotCongThuc || [], dCuoi);
    return { thaoTac: tt, dongCuoiDon: dCuoi, oLac: lac.conLac, gieoLai: [], khongMau: [], gieoDaSo: [], do: d, soOLacDon: lac.thaoTac.length };
  }

  /**
   * Cột "Còn Nợ" tìm theo TIÊU ĐỀ ở dòng 2, không theo vị trí: `Shopee mall`/`Importmart`/`Babyiu` để ở `O`,
   * riêng `Offood` để ở `P` vì `O` là `Ghi chú`. Dựng lại `=L3` cho đúng bản chất "doanh thu sàn chưa đối soát
   * của riêng tháng này" (mục 8.4).
   * Triệu chứng đang chống: bản tháng 8 ghi `=L3-18311772-21176369-31078654-85185924` — các khoản đã nhận
   * của tháng 8. Bê nguyên sang tháng mới thì "Còn Nợ" ra số âm hàng chục triệu ngay ngày đầu tháng.
   */
  function cotConNo(ss, boCuc) {
    var het = C(boCuc.cotCuoiDon) + 4;
    for (var c = C(boCuc.cotDoanhThu) + 1; c <= het; c++) {
      var v = tinh(ss, 2, c);
      if (v != null && Utils.chuanHoaChuoi(v) === 'còn nợ') return c;
    }
    return null;
  }

  /**
   * `Đơn ngoài` dùng cùng cơ chế XÓA HẲN DÒNG, chỉ khác bố cục cột (mục 4 dòng 8 đặc tả).
   * Sheet này là chỗ vùng công thức mỏng nhất của cả file — đo tháng 8: `F` và `N` chỉ có 4 ô
   * (dòng 4→7), `L` có 2 ô (5→6), trong khi đơn đã ghi tới dòng 6. Xóa dòng 4→6 là mọi cột
   * trừ F/N còn 0 ô → đúng chỗ nhánh "gieo lại dòng 4 bằng mẫu của chính cột đó" phải chạy.
   */
  function thaoTacDonNgoai(ss, ssCu, truoc) {
    var ten = SHEET_DON_NGOAI, tt = [];
    var cCuoi = C(DON_NGOAI.cotCuoiDon);
    var khoi = dongCuoiDuLieu(ss, cCuoi, DON_NGOAI.cotTenVietTat);
    var moc = mocXoaDong(ss, ssCu, khoi, cCuoi, truoc);
    var dCuoi = moc.dCuoi;
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: DAY_VUNG, c2: cCuoi });
    if (dCuoi >= 4) tt.push({ loai: 'XOA_DONG', sheet: ten, r1: 4, soDong: dCuoi - 3 });
    var lac = thaoTacDonOLac(ten, ss, ssCu, dCuoi, cCuoi, moc.lech);
    tt = tt.concat(lac.thaoTac);
    // 2.9.0: KHUÔN CHUẨN — F,G,M,N,O ghi đè cả cột; I và L (cột gõ tay) bị xóa sạch công thức — ô công thức gõ khi nhập đơn tháng cũ (`I11`
    // `=75000*25+70000`, `L11` `=I11-J11`) hay vỏ "dọn tay" còn `=I-J` ở L không bao giờ chạy sang tháng mới.
    tt.push(opKhuon(ten, 4, DONG_KEO_CT, khuonDonNgoai()));
    tt = tt.concat(oTongDayChuan(ten, DON_NGOAI.cotTong, 3));      // sau lệnh khuôn (nới lưới), đáy 2003
    var dsCot = DON_NGOAI.cotCongThuc.slice();
    var d = doVungCongThuc(ss, dsCot, dCuoi);
    return { thaoTac: tt, dongCuoiDon: dCuoi, oLac: lac.conLac, gieoLai: [], khongMau: [], do: d, cotKeo: dsCot, cotCoDinh: false,
      soOLacDon: lac.thaoTac.length };
  }

  /**
   * `Chi Phí Hàng Ngày` (khuôn tháng 9, chủ dự án duyệt 13/9 điểm 6): giữ dòng 1–2 (tiêu đề + SUMIF tổng từng
   * loại), XÓA NỘI DUNG các cột dữ liệu gõ tay từ dòng 3 tới dòng cuối có dữ liệu. Không xóa hẳn dòng: SUMIF ở
   * E2:I2 trỏ `$B$3:$B998` — xóa dòng là co vùng đó lại mỗi tháng. Công thức phụ của user trong vùng (E3) để yên.
   */
  function thaoTacChiPhi(ss) {
    var cCuoi = cotDuLieuChiPhi(ss), het = Math.min(soDong(ss), DAY_VUNG), cuoi = 2;
    for (var r = 3; r <= het; r++) {
      for (var c = 1; c <= cCuoi; c++) if (oCoDuLieu(ss, r, c)) { cuoi = r; break; }
    }
    var tt = [];
    if (cuoi >= 3) {
      tt.push({ loai: 'BO_GOP', sheet: SHEET_CHI_PHI, r1: 3, c1: 1, r2: cuoi, c2: cCuoi });
      tt.push({ loai: 'XOA_VUNG', sheet: SHEET_CHI_PHI, r1: 3, c1: 1, r2: cuoi, c2: cCuoi });
    }
    return { thaoTac: tt, dongCuoi: cuoi, cotCuoi: cCuoi };
  }

  // ---------------------------------------------------------------- YC-63 việc 2: `Tổng xuất` và tham chiếu sẽ vỡ khi xóa dòng

  /** Tên sheet trong công thức: `'Shopee mall'` (nháy đơn, `''` là một dấu nháy) hoặc tên trơn `Offood`. */
  var RE_TEN_SHEET_CT = "'(?:[^']|'')+'|[^\\s!'(),;:$\"&+*/<>=^{}-]+";
  /** `<sheet>!$M$4:$M$2000` — vùng một sheet khác (có dấu hai chấm). Nhóm: 1 sheet · 2 cột đầu · 3 dòng đầu · 4 cột cuối · 5 dòng cuối. */
  var RE_VUNG_SHEET = '(' + RE_TEN_SHEET_CT + ')!\\$?([A-Z]{1,3})\\$?(\\d+):\\$?([A-Z]{1,3})\\$?(\\d+)';
  /** `SUMIF(<vùng tiêu chí>;<mã>;<vùng tổng>)` — dấu phân cách `;` (sổ Việt Nam) hoặc `,` (bản xuất .xlsx), tiêu chí tự do một đối số. */
  var RE_SUMIF_TX = new RegExp('^\\s*SUMIF\\(\\s*' + RE_VUNG_SHEET + '\\s*([;,])\\s*([^;,()]+?)\\s*\\6\\s*' + RE_VUNG_SHEET + '\\s*\\)\\s*$', 'i');
  /** Tham chiếu sang sheet khác, ô đơn hay vùng. Nhóm: 1 sheet · 2,3 ô đầu · 4,5 ô cuối (nếu là vùng). */
  var RE_THAM_CHIEU = '(' + RE_TEN_SHEET_CT + ')!\\$?([A-Z]{1,3})\\$?(\\d+)(?::\\$?([A-Z]{1,3})\\$?(\\d+))?';

  function boNhaySheet(t) {
    var s = String(t || '');
    return s.charAt(0) === "'" ? s.slice(1, -1).replace(/''/g, "'") : s;
  }
  function laSheetMapping(t) { return TEN_SHEET_MAPPING_CU.indexOf(t) >= 0; }
  function laThongTinShop(t) { return String(t || '').trim() === SHEET_THONG_TIN_SHOP; }
  /** Sheet có khối đơn bị XÓA HẲN DÒNG ở B3 — đích hợp lệ của `Tổng xuất`!I..N. */
  function laSheetDon(t) {
    return SHEET_GIAN_HANG.concat([SHEET_TIKTOK_SHOP, SHEET_DON_NGOAI, SHEET_TIKTOK]).some(function (x) {
      return Utils.chuanHoaChuoi(x) === Utils.chuanHoaChuoi(t);
    });
  }
  /** Tiêu đề dòng 3 của `Tổng xuất` là tên rút gọn của sheet: `Mall` ↔ `Shopee mall`, `Tiktok` ↔ `TikTok Shop`, `Offood` ↔ `Offood`. */
  function khopTieuDeSheet(tieuDe, tenSheet) {
    var h = Utils.chuanHoaChuoi(tieuDe), s = Utils.chuanHoaChuoi(tenSheet);
    if (!h) return false;
    return s === h || (' ' + s + ' ').indexOf(' ' + h + ' ') >= 0;
  }

  /**
   * Một ô `Tổng xuất`!I..N có đúng dạng `SUMIF(S!$X$4:$X$a;<mã>;S!$Y$4:$Y$b)` không: CÙNG một sheet `S` ở hai vùng, `S` là sheet đơn,
   * khớp tiêu đề dòng 3 của cột, mỗi vùng một cột, bắt đầu ở dòng 4 (đáy `a`, `b` bất kỳ — đã bị co thì tool ghi lại). Tiêu chí để tự do
   * (`'Tổng xuất'!$E4`, `$E4`… — DEMO T9 còn một ô trỏ `'Tổng tồn kho'!$E3`, tool không sửa phần đó).
   * @returns {{dat:boolean, lyDo?:string, sheet?:string}}
   */
  function docSumifTongXuat(text, tieuDe) {
    var f = String(text == null ? '' : text);
    var m = RE_SUMIF_TX.exec(f);
    if (!m) return { dat: false, lyDo: /#REF!/i.test(f) ? 'đã #REF! (vùng bị xóa mất)' : 'không phải dạng SUMIF(<sheet>!vùng;mã;<sheet>!vùng)' };
    var s1 = boNhaySheet(m[1]), s2 = boNhaySheet(m[8]);
    if (Utils.chuanHoaChuoi(s1) !== Utils.chuanHoaChuoi(s2)) return { dat: false, lyDo: 'hai vùng trỏ hai sheet khác nhau (' + s1 + ' / ' + s2 + ')' };
    if (m[2] !== m[4] || m[9] !== m[11]) return { dat: false, lyDo: 'vùng không phải một cột' };
    if (+m[3] !== 4 || +m[10] !== 4) return { dat: false, lyDo: 'vùng không bắt đầu ở dòng 4' };
    if (!laSheetDon(s1)) return { dat: false, lyDo: 'sheet `' + s1 + '` không phải sheet đơn tool dọn' };
    if (!khopTieuDeSheet(tieuDe, s1)) return { dat: false, lyDo: 'tiêu đề dòng 3 "' + String(tieuDe == null ? '' : tieuDe).trim() + '" không khớp sheet `' + s1 + '`' };
    return { dat: true, sheet: s1, cuoi: [+m[5], +m[12]] };
  }

  /** Ghi lại HAI vùng của ô SUMIF (đã qua `docSumifTongXuat`) thành `$X$4:$X$2003`; phần còn lại (tên sheet, tiêu chí, dấu phân cách) y nguyên. */
  function vietLaiVungTongXuat(text) {
    return String(text).replace(new RegExp(RE_VUNG_SHEET, 'g'), function (tat, sh, c1, r1, c2) {
      return sh + '!$' + c1 + '$4:$' + c2 + '$' + DONG_KEO_CT;
    });
  }

  /**
   * 2.9.0 — bước B3b, `Tổng xuất` theo KHUÔN CHUẨN (ghi SAU B3: B3 xóa dòng sheet đơn làm Google co/`#REF!` vùng ở đây, rồi nới lưới làm giãn).
   * Dòng 4 → dòng cuối danh mục của `Tổng xuất` (D/E có giá trị, hoặc H..O có công thức): H = SUM(I:N) dòng đó; I..N = SUMIF tới đúng sheet
   * đơn của cột — sheet chọn theo TIÊU ĐỀ dòng 3 (`Mall` ↔ `Shopee mall`, `Tiktok` ↔ `TikTok Shop`…); có hai sheet cùng khớp (`TikTok Shop`
   * và `Tiktok` cũ) thì theo sheet mà công thức ở sổ THÁNG CŨ (không bao giờ bị sửa) đang trỏ; O = H × G. Ô `O2` = SUM(O4:O2003).
   * Cột mã hàng / số lượng của sheet đích lấy theo bố cục (`TikTok Shop` đọc tiêu đề dòng 2). Tiêu đề không khớp sheet đơn nào → cột đó
   * GIỮ NGUYÊN (ngoài khuôn), có cảnh báo — phép kiểm trước B1 vẫn soát nó.
   * Không cần đọc công thức của vỏ nên lượt chạy tiếp sau khi B3 đã làm `#REF!` vẫn ra y hệt (YC-63 việc 2a).
   * @returns {{coSheet, thaoTac, o:{ô:true}, dongCuoi, soO, la:string[], oTong:[{sheet,r,c}]}}
   */
  function thaoTacTongXuat(anhMoi, anhCu) {
    var ssMoi = sheet(anhMoi, SHEET_TONG_XUAT), ssCu = sheet(anhCu, SHEET_TONG_XUAT);
    var kq = { coSheet: !!ssMoi, thaoTac: [], la: [], soLa: 0, dongCuoi: 0, soO: 0, layTuCu: 0, boQua: 0, o: {}, oTong: [] };
    if (!ssMoi) return kq;
    var het = Math.min(soDong(ssMoi), DAY_VUNG);
    for (var r = 4; r <= het; r++) {
      if (!Utils.laRong(o(ssMoi, r, C('D'))) || !Utils.laRong(o(ssMoi, r, C('E')))) { kq.dongCuoi = r; continue; }
      for (var c = C('H'); c <= C('O'); c++) if (ct(ssMoi, r, c) != null) { kq.dongCuoi = r; break; }
    }
    if (kq.dongCuoi < 4) return kq;
    var ds = [{ chu: 'H', text: 'SUM(I4:N4)' }];
    COT_TONG_XUAT.forEach(function (chu) {
      var c = C(chu), tieuDe = tinh(ssMoi, 3, c);
      var ung = (anhMoi.tenSheet || []).filter(function (t) { return laSheetDon(t) && khopTieuDeSheet(tieuDe, t); });
      var chon = ung.length === 1 ? ung[0] : null;
      if (ung.length > 1) {
        [ssCu, ssMoi].forEach(function (s) {
          if (chon || !s) return;
          var p = docSumifTongXuat(ct(s, 4, c), tieuDe);
          if (p.dat && ung.indexOf(p.sheet) >= 0) chon = p.sheet;
        });
        if (!chon) chon = ung.filter(function (t) { return t === SHEET_TIKTOK_SHOP; })[0] || ung[0];
      }
      if (!chon) { kq.soLa++; kq.la.push(chu + '3 "' + String(tieuDe == null ? '' : tieuDe).trim() + '"'); return; }
      var ssDich = sheet(anhMoi, chon);
      var bc = chon === SHEET_DON_NGOAI ? { cotMaHang: DON_NGOAI.cotMaHang, cotSL: DON_NGOAI.cotSoLuong }
        : chon === SHEET_TIKTOK ? { cotMaHang: BO_CUC.TIKTOK.cotMaHang, cotSL: 'G' }
          : chon === SHEET_TIKTOK_SHOP ? { cotMaHang: ((ssDich && boCucTikTokShop(ssDich)) || { boCuc: BO_CUC.TIKTOK_SHOP }).boCuc.cotMaHang, cotSL: 'G' }
            : { cotMaHang: BO_CUC.CHUAN.cotMaHang, cotSL: 'G' };
      ds.push({ chu: chu, text: ctXuatTheoSheet(chon, bc.cotMaHang, bc.cotSL) });
      for (var r2 = 4; r2 <= kq.dongCuoi; r2++) kq.o[chu + r2] = true;
      kq.soO += kq.dongCuoi - 3;
    });
    ds.push({ chu: 'O', text: 'H4*G4' });
    kq.thaoTac.push(opKhuon(SHEET_TONG_XUAT, 4, kq.dongCuoi, ds));
    kq.thaoTac.push({ loai: 'GHI_CT', sheet: SHEET_TONG_XUAT, r: 2, c: C('O'), text: 'SUM(O4:O' + DONG_KEO_CT + ')', mang: false });
    kq.oTong.push({ sheet: SHEET_TONG_XUAT, r: 2, c: C('O') });
    return kq;
  }

  /**
   * 2.9.0 — bước B4b, `Tổng tồn kho` theo KHUÔN CHUẨN, SAU B4 (B4 xóa/chèn dòng `Tổng nhập` — sổ T11 thật: cột I giãn tới `$3020`).
   * Dòng 3 → dòng cuối danh mục (D có giá trị, hoặc H..K có công thức): H = I − J, I/J = SUMIF theo mã (E) trên `Tổng nhập` / `Tổng xuất`
   * tới 2003, K = H × G; `K1` = SUM(K3:K2003). Cột giá vốn G, cột chốt tồn M..T của chủ shop: ngoài khuôn, không đụng.
   */
  function thaoTacNhomTong(anhMoi) {
    var ssTon = sheet(anhMoi, SHEET_TON_KHO);
    var kq = { thaoTac: [], o: {}, ds: [], la: [], layTuCu: 0 };
    if (!ssTon) return kq;
    var het = Math.min(soDong(ssTon), DAY_VUNG), cuoi = 0;
    for (var r = 3; r <= het; r++) {
      if (!Utils.laRong(o(ssTon, r, C('D')))) { cuoi = r; continue; }
      for (var c = C('H'); c <= C('K'); c++) if (ct(ssTon, r, c) != null) { cuoi = r; break; }
    }
    if (cuoi >= 3) {
      kq.thaoTac.push(opKhuon(SHEET_TON_KHO, 3, cuoi, khuonTonKho()));
      var oTon = kq.o[SHEET_TON_KHO] = {};
      for (var r2 = 3; r2 <= cuoi; r2++) { oTon['I' + r2] = true; oTon['J' + r2] = true; }
    }
    kq.thaoTac.push({ loai: 'GHI_CT', sheet: SHEET_TON_KHO, r: 1, c: C('K'), text: 'SUM(K3:K' + DONG_KEO_CT + ')', mang: false });
    kq.ds.push({ sheet: SHEET_TON_KHO, r: 1, c: C('K') });
    return kq;
  }

  /**
   * YC-63 việc 2b — KIỂM TRƯỚC khi ghi ô nào: công thức ở sheet KHÔNG bị dọn có tham chiếu (ô hay vùng) tới sheet sắp xóa dòng mà DÒNG
   * CUỐI nằm trong khối sẽ xóa (4 ≤ dòng cuối ≤ dòng cuối khối đơn) → `deleteRows` biến nó thành `#REF!` (hay cắt cụt). Ô `Tổng xuất` đã
   * thuộc diện ghi lại (`boQua`: `{tên sheet: {ô: true}}` — `Tổng xuất` ở B3b, `Tổng tồn kho` ở B4b) không tính. Quét mọi sheet của ảnh chụp vỏ + `congThucKhac` (vỏ Google đọc thêm công thức của sheet ngoài
   * danh sách chụp), trừ chính các sheet bị dọn, `Mapping_san_pham` và `Thông tin shop ` (INV-10).
   * @param {Object} dsXoa `{ tên sheet: dòng cuối khối đơn sẽ xóa }`
   * @returns {{tong:number, ds:string[]}}
   */
  function kiemThamChieuSeVo(anhMoi, dsXoa, boQua) {
    var theoTen = {};
    Object.keys(dsXoa).forEach(function (t) { if (dsXoa[t] >= 4) theoTen[Utils.chuanHoaChuoi(t)] = t; });
    var kq = { tong: 0, ds: [] };
    if (!Object.keys(theoTen).length) return kq;
    var re = new RegExp(RE_THAM_CHIEU, 'g');
    function quet(tenSheet, bang) {
      if (theoTen[Utils.chuanHoaChuoi(tenSheet)] || laSheetMapping(tenSheet) || laThongTinShop(tenSheet)) return;
      (bang || []).forEach(function (hang, ri) {
        (hang || []).forEach(function (f, ci) {
          if (!f || String(f).indexOf('!') < 0) return;
          var t = String(f).replace(/"[^"]*"/g, '""'), m;
          re.lastIndex = 0;
          while ((m = re.exec(t))) {
            var dich = theoTen[Utils.chuanHoaChuoi(boNhaySheet(m[1]))];
            if (!dich) continue;
            var cuoi = m[5] ? Math.max(+m[3], +m[5]) : +m[3];
            if (cuoi < 4 || cuoi > dsXoa[dich]) continue;
            var diaChi = L(ci + 1) + (ri + 1);
            if (boQua && boQua[tenSheet] && boQua[tenSheet][diaChi]) continue;
            kq.tong++;
            if (kq.ds.length < 10) kq.ds.push('`' + tenSheet + '`!' + diaChi + ' trỏ ' + m[0] + ' (khối đơn `' + dich + '` sẽ xóa dòng 4–' + dsXoa[dich] + ')');
          }
        });
      });
    }
    Object.keys(anhMoi.sheets || {}).forEach(function (t) { quet(t, anhMoi.sheets[t].congThuc); });
    Object.keys(anhMoi.congThucKhac || {}).forEach(function (t) { if (!(anhMoi.sheets || {})[t]) quet(t, anhMoi.congThucKhac[t]); });
    return kq;
  }

  // ---------------------------------------------------------------- YC-63 việc 3: `THU CHI B` — sổ quỹ chạy liên tục

  function laNgayO(v) { return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime()); }
  /**
   * Ngày của ô (kiểu Date) → [năm, tháng, ngày] theo LỊCH CỦA Ô. Ô ngày là nửa đêm theo múi giờ của sổ (VN +7 hay Mỹ −7); cộng 12 giờ rồi
   * đọc theo UTC cho đúng ngày với mọi múi từ −11 tới +11 — không phụ thuộc múi giờ dự án Apps Script lẫn máy chạy test.
   */
  function ngayCuaO(d) { var x = new Date(d.getTime() + 12 * 3600 * 1000); return [x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate()]; }
  function chuNgayO(d) { var n = ngayCuaO(d); return ('0' + n[2]).slice(-2) + '/' + ('0' + n[1]).slice(-2) + '/' + n[0]; }

  /** Vùng `$X$n:$Y$m` CÙNG SHEET (không có `<sheet>!` đứng trước) của một công thức, kèm vị trí để thay tại chỗ. */
  function vungTuyetDoiCungSheet(f) {
    var t = String(f).replace(/"[^"]*"/g, function (s) { return new Array(s.length + 1).join(' '); });
    var re = /\$([A-Z]{1,3})\$(\d+):\$([A-Z]{1,3})\$(\d+)/g, m, ds = [];
    while ((m = re.exec(t))) {
      if (m.index > 0 && t.charAt(m.index - 1) === '!') continue;
      ds.push({ i: m.index, dai: m[0].length, c1: m[1], n: +m[2], c2: m[3], m: +m[4] });
    }
    return ds;
  }

  /**
   * YC-63 việc 3 — `THU CHI B` là SỔ QUỸ CHẠY LIÊN TỤC (đo sổ T10 thật 2/11: dữ liệu từ tháng 2 tới 31/10 ở dòng 5→426, H4 tổng dư quỹ,
   * I4/J4 số dư BIDV cộng dồn). Ô tổng chi phí tháng dòng 4 (K4:R4 = `SUMPRODUCT(($B$315:$B$1004=K3)*($F$315:$G$1004))`, 315 = dòng đầu
   * tháng 10) chủ shop sửa tay mỗi tháng; `Lợi nhuận`!D13…D18 trỏ vào đó → không sửa thì sổ tháng mới mang nguyên chi phí tháng cũ.
   * Tool KHÔNG xóa/dọn ô nào của sheet này, không đụng H4/I4/J4. Dòng bắt đầu mới N = dòng cuối có ngày ở cột A + 1; ô dòng 4 (trừ H/I/J)
   * có vùng `$X$n:$Y$m` CÙNG một `n` → thay `n` bằng N, giữ `m`. Ô có vùng nhiều `n` khác nhau, hay N vượt đáy `m` → không sửa, cảnh báo.
   */
  function thaoTacThuChiB(ss, thangMoi) {
    var kq = { coSheet: !!ss, thaoTac: [], canhBao: [], thongBao: [], dongBatDau: null, dongCuoiNgay: 0, oDoi: [], dongCu: null };
    if (!ss) return kq;
    for (var r = soDong(ss); r >= 5; r--) if (laNgayO(o(ss, r, 1))) { kq.dongCuoiNgay = r; break; }
    if (!kq.dongCuoiNgay) {
      kq.canhBao.push('`' + SHEET_THU_CHI_B + '`: không thấy dòng nào có ngày ở cột A (từ dòng 5) → KHÔNG đổi dòng bắt đầu của ô chi phí dòng 4; kiểm tay.');
      return kq;
    }
    var N = kq.dongCuoiNgay + 1, ngayCuoi = o(ss, kq.dongCuoiNgay, 1);
    kq.dongBatDau = N;
    var nc = Math.max((ss.congThuc[3] || []).length, (ss.giaTri[3] || []).length), dongCu = {};
    for (var c = 1; c <= nc; c++) {
      if (COT_THU_CHI_B_GIU.indexOf(L(c)) >= 0) continue;
      var f = ct(ss, 4, c);
      if (!f) continue;
      var vung = vungTuyetDoiCungSheet(f);
      if (!vung.length) continue;
      var ns = [];
      vung.forEach(function (v) { if (ns.indexOf(v.n) < 0) ns.push(v.n); });
      if (ns.length !== 1) {
        kq.canhBao.push('`' + SHEET_THU_CHI_B + '`!' + L(c) + '4: các vùng bắt đầu ở nhiều dòng khác nhau (' + ns.join(', ') + ') — không khớp dạng, tool KHÔNG sửa ô này; kiểm tay.');
        continue;
      }
      if (vung.some(function (v) { return v.m < N; })) {
        kq.canhBao.push('`' + SHEET_THU_CHI_B + '`!' + L(c) + '4: dòng bắt đầu mới ' + N + ' nằm dưới đáy vùng (' + vung[0].m + ') — tool KHÔNG sửa; nới vùng tay.');
        continue;
      }
      (dongCu[ns[0]] = dongCu[ns[0]] || []).push(L(c) + '4');
      if (ns[0] === N) continue;                       // lượt chạy tiếp: đã đúng
      var moi = '', i0 = 0;
      vung.forEach(function (v) {
        moi += f.slice(i0, v.i) + '$' + v.c1 + '$' + N + ':$' + v.c2 + '$' + v.m;
        i0 = v.i + v.dai;
      });
      moi += f.slice(i0);
      kq.thaoTac.push({ loai: 'GHI_CT', sheet: SHEET_THU_CHI_B, r: 4, c: c, text: moi, mang: false });
      kq.oDoi.push(L(c) + '4');
    }
    // YC-63 3e: ĐO và NÓI RA dòng bắt đầu cũ ứng với ngày nào — BA chưa xác nhận số 315 khớp đúng ngày đầu tháng cũ.
    var cauCu = Object.keys(dongCu).map(function (n) {
      var n0 = +n, a = o(ss, n0, 1), b = o(ss, n0 - 1, 1);
      return dongCu[n].join(',') + ' bắt đầu dòng ' + n0 + (laNgayO(a) ? ' (ngày ' + chuNgayO(a) + ')' : ' (cột A không phải ngày)') +
        (laNgayO(b) ? ', dòng ' + (n0 - 1) + ' ngày ' + chuNgayO(b) : '');
    });
    kq.dongCu = Object.keys(dongCu).map(Number);
    kq.thongBao.push('`' + SHEET_THU_CHI_B + '` (sổ quỹ chạy liên tục — tool không dọn ô nào, không đụng H4/I4/J4): dòng cuối có ngày ở cột A = ' +
      kq.dongCuoiNgay + ' (' + chuNgayO(ngayCuoi) + ') → chi phí tháng mới tính từ dòng ' + N + '. Trước: ' + (cauCu.join(' · ') || 'không ô nào ở dòng 4 có dạng vùng $X$n:$Y$m') +
      '. ' + (kq.oDoi.length ? 'Đổi dòng bắt đầu → ' + N + ' ở ' + kq.oDoi.join(',') + '.' : 'Không ô nào phải đổi.'));
    var nm = ngayCuaO(ngayCuoi), ky = nm[0] + '-' + ('0' + nm[1]).slice(-2);
    if (thangMoi && ky >= thangMoi) {
      kq.canhBao.push('`' + SHEET_THU_CHI_B + '`: dòng cuối có ngày (' + kq.dongCuoiNgay + ', ' + chuNgayO(ngayCuoi) + ') đã thuộc tháng mới ' + thangMoi +
        ' → khoản chi tháng mới đã ghi TRƯỚC dòng ' + N + ' sẽ không được cộng vào chi phí tháng mới; kiểm tay ô dòng 4.');
    }
    return kq;
  }

  /** Khuôn cột I `Tổng nhập` dùng được: công thức (đã dịch về dòng 4) nhân đúng H4 với G4 của CHÍNH dòng đó. */
  function laMauCotI(m) {
    return !!(m && /(^|[^A-Z$0-9])H4([^0-9]|$)/i.test(m.text) && /(^|[^A-Z$0-9])G4([^0-9]|$)/i.test(m.text) && m.text.indexOf('*') >= 0);
  }

  /**
   * Mẫu công thức của một cột: ô có công thức đầu tiên từ dòng `tuDong` (mặc định 4), DỊCH VỀ DÒNG 4 (chỗ gieo).
   * YC-63: người gọi đưa `tuDong` = dòng đầu vùng dòng trống — ô công thức trong dòng đơn KHÔNG BAO GIỜ là mẫu (bản cũ lấy ô công thức
   * đầu tiên từ dòng 4, tức là dòng đơn, và dừng ở dòng 400 — vùng dòng trống của sổ thật bắt đầu ở dòng 458).
   */
  function mauCongThuc(ss, chuCot, tuDong) {
    if (!ss) return null;
    var c = C(chuCot), n = Math.min(soDong(ss), DONG_KEO_CT), r0 = Math.max(4, tuDong || 4);
    for (var r = r0; r <= n; r++) {
      var t = ct(ss, r, c);
      if (t) return { text: Utils.dichCongThuc(t, r, 4), mang: laMang(ss, r, c) };
    }
    return null;
  }

  /** Công thức (đã dịch về dòng 4) có tham chiếu TƯƠNG ĐỐI theo dòng tới chính dòng 4 — `$D4`, `M4`, `H4-I4` — tức là tính trên dòng của nó. */
  function laCongThucTheoDong(text) {
    var t = String(text || '').replace(/"[^"]*"/g, '""');
    return /(^|[^A-Za-z0-9_$])\$?[A-Z]{1,3}4(?![0-9])/.test(t);
  }

  /**
   * YC-63 — đường DỰ PHÒNG cho sheet gian hàng và `Tổng nhập` (KHÔNG dùng cho `Đơn ngoài`): vùng dòng trống của CẢ vỏ lẫn tháng cũ không có
   * công thức ở cột này (đo sổ T10 thật 2/11: `TikTok Shop` dòng 427→987 không có ô công thức nào — công thức chỉ nằm trong 426 dòng đơn).
   * Bỏ hẳn thì sổ tháng mới mất mọi công thức tra Tên/Đơn vị/Mã hàng/Check tồn của sheet đó. Nên lấy DẠNG CHIẾM ĐA SỐ trong dòng đơn
   * `r1..r2` (dịch về dòng 4), và chỉ khi: ≥ 3 ô cùng dạng, chiếm ≥ 80% số ô công thức của cột, và dạng đó tính trên CHÍNH dòng của nó
   * (`laCongThucTheoDong`) — ô hằng số gõ tay (`=75000*25+70000`) không bao giờ qua được.
   * @returns {{text, mang, dem, tong}|null}
   */
  function mauDaSoDongDon(ss, chuCot, r1, r2) {
    if (!ss || r2 < r1) return null;
    var c = C(chuCot), dem = {}, mang = {}, tong = 0;
    for (var r = Math.max(4, r1); r <= Math.min(r2, soDong(ss)); r++) {
      var t = ct(ss, r, c);
      if (!t) continue;
      var k = Utils.dichCongThuc(t, r, 4);
      dem[k] = (dem[k] || 0) + 1;
      if (laMang(ss, r, c)) mang[k] = true;
      tong++;
    }
    var tot = null;
    Object.keys(dem).forEach(function (k) { if (!tot || dem[k] > dem[tot]) tot = k; });
    if (!tot || dem[tot] < 3 || dem[tot] < 0.8 * tong || !laCongThucTheoDong(tot)) return null;
    return { text: tot, mang: !!mang[tot], dem: dem[tot], tong: tong };
  }

  // ---------------------------------------------------------------- B4: khối nhập đầu kỳ

  /**
   * Ghi tồn cuối tháng cũ thành các dòng nhập đầu kỳ.
   * `J` (Ngày nhập) để TRỐNG — dấu hiệu duy nhất phân biệt đầu kỳ với nhập trong tháng.
   * Ghi ĐỦ 100% mã, kể cả mã tồn 0: bản làm tay rơi mất `gvs km 1` đúng vì nó tồn 0 ở dòng đầu bảng,
   * và SUMIF vẫn chạy bình thường nên không ai thấy mã đó biến mất (mục 8.2).
   */
  function thaoTacTongNhap(danhMuc, ssNhapCu, ssNhapMoi, dau, truoc) {
    var tt = [], ten = SHEET_NHAP;
    // Cùng lý do như sheet gian hàng: `Tổng nhập` cũng có công thức TỪNG DÒNG ở C, E, F, G.
    // Đo tháng 8: 485 ô mỗi cột (dòng 4→488); tháng 9 chủ shop đã kéo lại tới dòng 1000 (997 ô).
    // Xóa nội dung `A4:L2000` là quét sạch cả 485 ô đó, chỉ còn lại 76 dòng khối đầu kỳ tool ghi;
    // user nhập hàng trong tháng từ dòng 80 trở xuống sẽ không có công thức tra Tên/Đơn vị/Giá vốn.
    var khoiNhap = dongCuoiDuLieu(ssNhapMoi, C('L'), 'D');
    var mocNhap = mocXoaDong(ssNhapMoi, ssNhapCu, khoiNhap, C('L'), truoc);
    var dCuoiNhap = mocNhap.dCuoi;
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: DAY_VUNG, c2: C('L') });
    if (dCuoiNhap >= 4) tt.push({ loai: 'XOA_DONG', sheet: ten, r1: 4, soDong: dCuoiNhap - 3 });
    // Tính lại sau khi đã xóa dòng (`lech` > 0): khối đầu kỳ tool ghi (dòng 4..3+N) có thể đã nằm đó — không soi nó như ô lạc.
    var lacNhap = thaoTacDonOLac(ten, ssNhapMoi, ssNhapCu, dCuoiNhap, C('L'), mocNhap.lech, mocNhap.lech ? 4 + danhMuc.length : 0);
    tt = tt.concat(lacNhap.thaoTac);
    // Khối đầu kỳ: D (tên viết tắt) + H (tồn cuối tháng cũ, số thuần). C, E, F, G, I là KHUÔN CHUẨN (2.9.0) — ghi đè cả cột 4 → 2003 cùng
    // một lệnh, kể cả các dòng đầu kỳ; không còn chép mẫu từ sổ cũ (dòng nhập hàng có thể mang giá vốn gõ tay `=7286400/240`).
    // Hai cột KHÔNG liền nhau (D, H) → ghi theo cột bằng `GHI_BANG` (vỏ Google: một lệnh mỗi lô 200 dòng); ghi từng ô là mỗi dòng 2 lệnh
    // (đo T11 → T12: 139 lệnh ghi ở B4).
    var r = 4 + danhMuc.length;
    if (danhMuc.length) {
      tt.push({ loai: 'GHI_BANG', sheet: ten, r1: 4, c1: C('D'), bang: danhMuc.map(function (m) { return [m.tenVietTat]; }) });
      tt.push({ loai: 'GHI_BANG', sheet: ten, r1: 4, c1: C('H'), bang: danhMuc.map(function (m) { return [m.ton]; }) });   // số thuần
    }
    tt.push(opKhuon(ten, 4, DONG_KEO_CT, khuonTongNhap()));
    tt = tt.concat(oTongDayChuan(ten, ['I'], 2));                  // `I2` sau lệnh khuôn (nới lưới), đáy 2003
    return {
      thaoTac: tt, dongDau: 4, dongCuoi: r - 1, thieuMau: [], gieoDaSo: [], dongCuoiDon: dCuoiNhap, oLac: lacNhap.conLac,
      do: doVungCongThuc(ssNhapMoi, ['C', 'E', 'F', 'G'], dCuoiNhap)
    };
  }

  // ---------------------------------------------------------------- B5: đẩy cột `Lợi nhuận`

  /**
   * Chèn một cột trước `D` rồi ĐÓNG BĂNG tháng cũ ở cột `E`.
   * Cột `E` dán đè bằng giá trị đã đọc ở B2, KHÔNG đọc tại chỗ: lúc này công thức của nó đã trỏ
   * vào các sheet tháng mới vừa bị dọn sạch, đọc tại chỗ chỉ ra số 0 — và số tháng cũ mất vĩnh viễn.
   */
  function thaoTacLoiNhuan(ln, thangMoi, namMoi) {
    var ten = SHEET_LOI_NHUAN, tt = [];
    var cuoiMoi = ln.cotCuoi + 1;                 // khối tháng dài thêm đúng một cột
    var D = C('D'), E = C('E');

    // 1. Đóng băng: dòng 6→dòng nhãn cuối của cột E = giá trị đọc từ tháng cũ (tháng 8: 11 dòng, tháng 9: 13 dòng).
    for (var i = 0; i < ln.dong6den16.length; i++) {
      var v = ln.dong6den16[i];
      tt.push({ loai: 'GHI_O', sheet: ten, r: 6 + i, c: E, gt: (v == null || v === '') ? null : v });
    }
    // 2. Nới ô gộp: dòng 4 (năm) và dòng 3 (tiêu đề) đều phải phủ tới cột mới.
    //    Gộp ô chỉ giữ giá trị của ô trên-trái, nên phải ghi lại `D3`/`D4` trước khi gộp.
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 3, c1: 2, r2: 5, c2: cuoiMoi });
    tt.push({ loai: 'GHI_O', sheet: ten, r: 3, c: D, gt: ln.tieuDeDong3 == null ? null : ln.tieuDeDong3 });
    tt.push({ loai: 'GHI_O', sheet: ten, r: 4, c: D, gt: namMoi });
    tt.push({ loai: 'GOP_O', sheet: ten, r1: 3, c1: C('B'), r2: 3, c2: cuoiMoi });
    tt.push({ loai: 'GOP_O', sheet: ten, r1: 4, c1: D, r2: 4, c2: cuoiMoi });
    tt.push({ loai: 'GOP_O', sheet: ten, r1: 4, c1: C('B'), r2: 5, c2: C('C') });
    // 3. Cột tháng mới — THEO KHUÔN CỦA CHÍNH FILE THÁNG CŨ (2.6.0). Ô `D` tháng cũ là công thức có tham chiếu
    //    (`D7+D8+…`, `SUM('Shopee mall'!L3,…,'TikTok Shop'!L3)`, `'Chi Phí Hàng Ngày'!E2`…) → chép NGUYÊN VĂN:
    //    công thức đó trỏ vào sheet cùng file, nên ở file tháng mới nó trỏ đúng sheet tháng mới. Ô số gõ tay
    //    (Trả thưởng, Mặt bằng) hay công thức toàn hằng số (`=1320000+30000+…`, chi phí của RIÊNG tháng cũ) → để
    //    trống. Bản trước viết cứng năm công thức của khuôn tháng 8, nên khuôn tháng 9 mất `'TikTok Shop'!L3` ở D7
    //    và mất năm dòng chi phí — lợi nhuận tháng 10 sẽ sai mà không ai thấy.
    tt.push({ loai: 'GHI_O', sheet: ten, r: 5, c: D, gt: thangMoi });
    var soCT = 0;
    for (var j = 0; j < ln.dong6den16.length; j++) {
      var text = ln.congThucD ? ln.congThucD[j] : null;
      if (text) { tt.push({ loai: 'GHI_CT', sheet: ten, r: 6 + j, c: D, text: text, mang: false }); soCT++; }
      else tt.push({ loai: 'GHI_O', sheet: ten, r: 6 + j, c: D, gt: null });
    }
    return { thaoTac: tt, cotCuoiMoi: cuoiMoi, soCongThucD: soCT };
  }

  // ---------------------------------------------------------------- B7: khối điều khiển

  function thaoTacKhoiDieuKhien(trangThai, thang, nguonClone, buocDaXong) {
    var nhan = ['TRANG_THAI_KHOI_TAO', 'THANG', 'NGUON_CLONE', 'PHIEN_BAN_TOOL', 'BUOC_DA_XONG'];
    var giaTri = [trangThai, thang, nguonClone || '', PHIEN_BAN, buocDaXong || ''];
    var tt = [];
    for (var i = 0; i < nhan.length; i++) {
      tt.push({ loai: 'GHI_O', sheet: TEN_SHEET_MAPPING, r: i + 1, c: C('N'), gt: nhan[i] });
      // '@' (văn bản): không ép thì Google đổi '2026-10' ở O2 thành ngày — xem `chuanThangCo`.
      tt.push({ loai: 'GHI_O', sheet: TEN_SHEET_MAPPING, r: i + 1, c: C('O'), gt: giaTri[i], dinhDang: '@' });
    }
    return tt;
  }

  // ---------------------------------------------------------------- tiến độ / chạy tiếp

  /**
   * YC-43 (2.7.0): `B2b` — đóng băng cột tháng cũ — đứng TRƯỚC mọi bước phá hủy. Tới 2.6.1 thứ tự là dọn gian hàng (B3) rồi
   * mới đóng băng (B5b): chết ở giữa hai việc (đúng ca Google thật 14/9 21:47) là cột tháng cũ trong bản sao còn công thức
   * trỏ vào sheet đã dọn sạch → `Lợi nhuận` tháng cũ ra 0, `Tổng doanh số` ra 0. Nguyên tắc: đọc và đóng băng mọi số phụ
   * thuộc TRƯỚC, phá hủy SAU. File dở từ bản cũ (cờ `B3`/`B4`) chạy tiếp vẫn đúng: B5b vẫn đóng băng lại cột `E`.
   */
  /** YC-63 (2.8.3): `B3b` — ghi lại vùng `Tổng xuất` + dòng bắt đầu `THU CHI B` — ngay SAU khi dọn (Google đã co vùng ở B3). File dở cờ `B3`
   *  từ bản cũ chạy tiếp vào `B3b`: công thức `Tổng xuất` đã hỏng thì lõi lấy ô cùng vị trí ở sổ cũ (`thaoTacTongXuat`). */
  /** 2.8.4: `B4b` — ô tổng `Tổng tồn kho`!I/J/K1, `Tổng xuất`!O2 chốt đáy 2003 — ngay sau B4 (lệnh xóa/chèn dòng cuối cùng). */
  var THU_TU_BUOC = ['B2b', 'B3', 'B3b', 'B4', 'B4b', 'B5a', 'B5b', 'B6', 'B7'];

  /**
   * Câu cho người bấm khi bản sao kẹt giữa lúc chèn cột (YC-43 điểm 4, nguyên văn BA). Chèn cột không chạy lại được và tool
   * không đoán cột đã chèn hay chưa — đường ra an toàn duy nhất là bỏ bản sao đó.
   */
  var CAU_BAN_SAO_HONG = 'Bản sao này đã hỏng giữa chừng — xóa nó đi, tạo bản sao MỚI từ sổ tháng trước rồi chạy lại.';

  /**
   * Từ cờ `BUOC_DA_XONG` suy ra bước phải chạy tiếp.
   * `B5_DANG_LAM` (chưa có `B5_DA_CHEN`) → DỪNG: chèn cột là thao tác KHÔNG chạy lại được, chạy hai lần là chèn hai cột và
   * khối tháng lệch vĩnh viễn. Tới 2.6.1 câu báo bắt người mở `Lợi nhuận`!D5 rồi tự sửa cờ — việc không ai làm đúng được giữa
   * lúc đầu tháng; từ YC-43 tool nói thẳng bản sao đã hỏng và bảo làm bản sao mới.
   */
  function buocBatDau(buocDaXong) {
    var m = String(buocDaXong || '').trim();
    if (m === 'B5_DANG_LAM') {
      return {
        dung: true,
        lyDo: CAU_BAN_SAO_HONG + ' (Lượt trước dừng giữa lúc chèn cột `Lợi nhuận` — cờ BUOC_DA_XONG = B5_DANG_LAM; chèn cột ' +
          'không chạy lại được nên tool không chạy tiếp trên file này.)'
      };
    }
    if (m === 'B5_DA_CHEN') return { dung: false, tu: 'B5b' };
    // YC-62: cờ mức từng sheet trong B3 — `B3:<tên sheet>` = đã dọn xong tới sheet đó (theo thứ tự `phan` của bước B3).
    // Chạy tiếp từ B3, bỏ qua các sheet đã xong; tên không khớp sheet nào thì `lapKeHoach` dọn lại B3 từ đầu và nói rõ.
    var mB3 = /^B3:(.+)$/.exec(m);
    if (mB3) return { dung: false, tu: 'B3', sheetXongB3: mB3[1].trim() };
    var i = THU_TU_BUOC.indexOf(m);
    if (i >= 0) return { dung: false, tu: THU_TU_BUOC[i + 1] || null };
    return { dung: false, tu: 'B2b' };
  }

  // ---------------------------------------------------------------- LẬP KẾ HOẠCH

  /**
   * @param {Object} anhCu   ảnh chụp file tháng cũ (CHỈ ĐỌC, không bao giờ ghi)
   * @param {Object} anhMoi  ảnh chụp vỏ file tháng mới
   * @param {Object} ts      { thangMoi:'2026-10', idFileCu, idFileMoi, thoiDiem:Date, dauPhanCach:';'|',' }
   */
  function lapKeHoach(anhCu, anhMoi, ts) {
    ts = ts || {};
    // Vỏ Excel truyền ',' (ExcelJS luôn dấu phẩy). Vỏ Google KHÔNG truyền: dò từ chính công thức của sổ (xem dauPhanCachCuaAnh).
    var dau = ts.dauPhanCach || dauPhanCachCuaAnh([anhMoi, anhCu]);
    dauKhuon = dau;                                   // 2.9.0: khuôn chuẩn viết bằng `;` → đổi theo dấu của chính sổ
    var thoiDiem = ts.thoiDiem || new Date();
    var nhan = Utils.dinhDangNgayGio(thoiDiem).slice(0, 16);
    var thangMoi = String(ts.thangMoi || '');
    var mThang = thangMoi.match(/^(\d{4})-(\d{1,2})$/);
    if (!mThang) throw new Error('Tham số thangMoi phải dạng "YYYY-MM", nhận được "' + thangMoi + '"');
    var namMoi = +mThang[1], soThangMoi = +mThang[2];

    var kq = {
      thangMoi: thangMoi, phienBan: PHIEN_BAN, canhBao: [], thongBao: [],
      chay: false, lyDoDung: [], kiem: null, doc: null, batDau: [], buoc: [], tuBuoc: 'B2b', dauPhanCach: dau
    };

    var kiem = kiemDieuKien(anhMoi, anhCu, thangMoi);
    kq.kiem = kiem;
    if (!kiem.chay) { kq.lyDoDung = kiem.lyDoDung; kq.maDung = kiem.maDung; return kq; }

    var tiep = buocBatDau(kiem.lop1.buocDaXong);
    if (tiep.dung) { kq.lyDoDung = [tiep.lyDo]; kq.maDung = 'B5_DANG_LAM'; return kq; }
    kq.tuBuoc = tiep.tu;
    if (!kq.tuBuoc) { kq.thongBao.push('Mọi bước đã xong ở lần chạy trước — chỉ chạy lại phần tự kiểm.'); }

    // ---- B2: đọc tháng cũ một lượt (mọi số lấy về thuộc CÙNG một thời điểm) ----
    var ssTonCu = sheet(anhCu, SHEET_TON_KHO);
    var ssLNCu = sheet(anhCu, SHEET_LOI_NHUAN);
    var ssNhapCu = sheet(anhCu, SHEET_NHAP);
    if (!ssTonCu) throw new Error('File tháng cũ không có sheet `' + SHEET_TON_KHO + '`');
    if (!ssLNCu) throw new Error('File tháng cũ không có sheet `' + SHEET_LOI_NHUAN + '`');
    var dm = docDanhMuc(ssTonCu);
    var ln = docLoiNhuanCu(ssLNCu);
    var map = docMapping(anhCu);
    var giaTriTonCuoi = so(tinh(ssTonCu, 1, C('K')));
    kq.doc = {
      danhMuc: dm.ds, dongCuoiDanhMuc: dm.dongCuoi, loiNhuanCu: ln, mapping: map,
      giaTriTonCuoi: giaTriTonCuoi, tongTienTonTinhLai: dm.ds.reduce(function (s, m) { return s + (m.ton || 0) * (m.giaVon || 0); }, 0)
    };

    if (ln.nam != null && ln.nam !== namMoi) {
      kq.canhBao.push('Tháng mới thuộc năm ' + namMoi + ' nhưng khối `Lợi nhuận` hiện có là năm ' + ln.nam +
        ' → ô gộp năm vẫn được nới thêm một cột, nhưng đây là chỗ người phải quyết (sang năm mới thường mở khối mới).');
    }
    if (giaTriTonCuoi != null && Math.abs(giaTriTonCuoi - kq.doc.tongTienTonTinhLai) > 1) {
      kq.canhBao.push('`Tổng tồn kho`!K1 tháng cũ = ' + giaTriTonCuoi + ' nhưng cộng lại từ danh mục ra ' +
        kq.doc.tongTienTonTinhLai + ' (lệch ' + (giaTriTonCuoi - kq.doc.tongTienTonTinhLai).toFixed(2) +
        ' đ) → vùng SUM của K1 có thể chưa phủ hết danh mục.');
    }
    if (!map) kq.canhBao.push('Tháng cũ chưa có sheet `Mapping_san_pham` → tool tạo sheet rỗng, chỉ để chứa khối điều khiển. User sẽ phải điền lại từ đầu.');
    (kiem.lop1.ghiChu || []).forEach(function (t) { kq.thongBao.push(t); });
    if (ln.congThucD && !ln.congThucD.some(function (x) { return x; })) {
      kq.canhBao.push('`Lợi nhuận`!D6:D' + ln.dongCuoi + ' tháng cũ không có công thức nào → cột tháng mới để trống, cần dựng tay.');
    }

    // ---- B1: đặt cờ đang làm TRƯỚC khi ghi ô nào ----
    kq.batDau = [{ loai: 'TAO_SHEET', ten: TEN_SHEET_MAPPING }]
      .concat(thaoTacKhoiDieuKhien('DANG_KHOI_TAO_' + nhan, thangMoi, ts.nguonClone || ts.idFileCu || '', kiem.lop1.buocDaXong || ''));

    // ---- B3: dọn sheet gian hàng — YC-62: tách thành TỪNG PHẦN theo sheet, mỗi phần một cờ `B3:<tên sheet>` ----
    // Vì sao: tới 2.8.1 cả B3 (tới 8 sheet) là MỘT bước, một cờ "B3" cuối bước — Google ngắt lệnh ở sheet thứ năm là mất trắng tiến
    // độ bốn sheet trước. Nay vỏ ghi cờ sau MỖI sheet; lượt sau bỏ qua sheet đã xong, thao tác sheet còn lại tính lại từ ảnh chụp mới.
    // Thứ tự phần CỐ ĐỊNH (4 gian Shopee → `TikTok Shop` → `Đơn ngoài` → `Chi Phí Hàng Ngày` → `Tiktok`). Sheet không có thao tác nào
    // vẫn là một phần (0 thao tác) để tên trong cờ luôn tra được ở lượt sau — `Chi Phí Hàng Ngày` lượt trước còn dữ liệu, lượt sau đã
    // sạch: nếu phần đó biến mất thì cờ `B3:Chi Phí Hàng Ngày` không khớp gì nữa. `thaoTac` của bước B3 = nối các phần CHƯA xong (vỏ
    // Excel và mã cũ vẫn chạy được), `phan` = đủ mọi phần kèm `daXong` cho vỏ Google.
    var phanB3 = [];
    function themPhanB3(ten, tt) { phanB3.push({ ten: ten, moc: 'B3:' + ten, thaoTac: tt, daXong: false }); }
    // YC-62: vỏ Google tính lại thao tác sau khi Google ngắt lệnh → đưa dòng cuối khối đơn của LẦN TÍNH TRƯỚC (`{ten sheet: dòng}`)
    // để lõi nhận ra `deleteRows` đã chạy xong hay chưa (xem `mocXoaDong`). Lần tính đầu không có → {}.
    var khoiTruoc = ts.khoiDonLuotTruoc || {};
    kq.doc.vungCongThuc = {};       // số ô công thức từng cột, TRƯỚC và SAU khi xóa dòng — chỉ tiêu TM-10 chấm trên đây
    /** Ô gõ tay nằm DƯỚI khối đơn: tool cố ý KHÔNG xóa tới đó, phải báo để người xử lý tay. */
    function baoOLac(t, oLac, dCuoi) {
      if (!oLac || !oLac.length) return;
      kq.canhBao.push('Sheet `' + t + '`: có ô gõ tay nằm DƯỚI khối đơn (khối đơn hết ở dòng ' + dCuoi + '): ' +
        oLac.join(', ') + '. Tool chỉ xóa hẳn tới dòng ' + dCuoi + ' — xóa xuống tận những ô này sẽ nuốt luôn ' +
        'vùng công thức dự trữ của chủ shop. Hãy tự kiểm rồi xóa tay nếu đó là rác.');
    }
    function baoKhongMau(t, ds) {
      if (ds && ds.length) kq.canhBao.push('Sheet `' + t + '`: cột ' + ds.join(',') + ' không có công thức nào ở VÙNG DÒNG TRỐNG (dưới khối đơn) của cả vỏ lẫn tháng cũ → không kéo được, cần dựng tay.');
    }
    function baoDaSo(t, ds) {
      if (ds && ds.length) {
        kq.canhBao.push('Sheet `' + t + '`: cột ' + ds.join(', ') + ' không có công thức ở VÙNG DÒNG TRỐNG của cả vỏ lẫn tháng cũ → gieo dòng 4 bằng dạng ' +
          'công thức CHIẾM ĐA SỐ trong dòng đơn (tính trên chính dòng của nó) rồi kéo tới dòng ' + DONG_KEO_CT + '. Nên kéo sẵn công thức xuống ' +
          'dòng trống của sheet này để tháng sau tool lấy mẫu ở đó.');
      }
    }
    SHEET_GIAN_HANG.concat([SHEET_TIKTOK_SHOP]).forEach(function (t) {
      var ss = sheet(anhMoi, t);
      var laTS = t === SHEET_TIKTOK_SHOP;
      if (!ss) { if (!laTS) kq.canhBao.push('Vỏ tháng mới không có sheet `' + t + '` → bỏ qua.'); return; }
      var khuon = laTS ? boCucTikTokShop(ss) : null;
      if (laTS && !khuon) throw new Error('Sheet `' + SHEET_TIKTOK_SHOP + '`: khuôn lạ — lẽ ra `kiemDieuKien` đã dừng (lỗi lập trình).');
      var bc = laTS ? khuon.boCuc : BO_CUC.CHUAN;
      var b = thaoTacDonGianHang(t, ss, bc, sheet(anhCu, t), khoiTruoc[t]);
      var ttGH = b.thaoTac.slice();
      kq.doc.vungCongThuc[t] = { dongCuoiDon: b.dongCuoiDon, gieoLai: b.gieoLai, cot: b.do };
      baoOLac(t, b.oLac, b.dongCuoiDon);
      baoKhongMau(t, b.khongMau);
      baoDaSo(t, b.gieoDaSo);
      var cCN = cotConNo(ss, bc);
      if (cCN) ttGH.push({ loai: 'GHI_CT', sheet: t, r: 3, c: cCN, text: bc.cotDoanhThu + '3', mang: false });
      else kq.canhBao.push('Sheet `' + t + '`: không thấy tiêu đề `Còn Nợ` ở dòng 2 → không dựng lại ô tổng Còn Nợ.');
      themPhanB3(t, ttGH);
    });
    var ssDN = sheet(anhMoi, SHEET_DON_NGOAI);
    if (ssDN) {
      var bDN = thaoTacDonNgoai(ssDN, sheet(anhCu, SHEET_DON_NGOAI), khoiTruoc[SHEET_DON_NGOAI]);
      kq.doc.vungCongThuc[SHEET_DON_NGOAI] = { dongCuoiDon: bDN.dongCuoiDon, gieoLai: bDN.gieoLai, cot: bDN.do, cotKeo: bDN.cotKeo };
      baoOLac(SHEET_DON_NGOAI, bDN.oLac, bDN.dongCuoiDon);
      baoKhongMau(SHEET_DON_NGOAI, bDN.khongMau);
      if (bDN.cotCoDinh) {
        kq.thongBao.push('`' + SHEET_DON_NGOAI + '`: vùng dòng trống của vỏ lẫn tháng cũ không có công thức nào → dùng danh sách cột cố định ' +
          DON_NGOAI.cotCongThuc.join(',') + '.');
      }
      themPhanB3(SHEET_DON_NGOAI, bDN.thaoTac);
    }
    var ssCP = sheet(anhMoi, SHEET_CHI_PHI);
    if (ssCP) {
      var bCP = thaoTacChiPhi(ssCP);
      kq.doc.chiPhi = { dongCuoi: bCP.dongCuoi, cotCuoi: bCP.cotCuoi };
      themPhanB3(SHEET_CHI_PHI, bCP.thaoTac);
    }
    // `Tiktok`: luật theo nội dung (mục 8.5). Vỏ rỗng vẫn là một phần 0 thao tác — xem chú thích đầu B3.
    var ssTik = sheet(anhMoi, SHEET_TIKTOK);
    if (ssTik && coDonThat(ssTik, BO_CUC.TIKTOK)) {
      var bTik = thaoTacDonGianHang(SHEET_TIKTOK, ssTik, BO_CUC.TIKTOK, sheet(anhCu, SHEET_TIKTOK), khoiTruoc[SHEET_TIKTOK]);
      var ttTik = bTik.thaoTac.slice();
      kq.doc.vungCongThuc[SHEET_TIKTOK] = { dongCuoiDon: bTik.dongCuoiDon, gieoLai: bTik.gieoLai, cot: bTik.do };
      baoOLac(SHEET_TIKTOK, bTik.oLac, bTik.dongCuoiDon);
      var cCNT = cotConNo(ssTik, BO_CUC.TIKTOK);
      if (cCNT) ttTik.push({ loai: 'GHI_CT', sheet: SHEET_TIKTOK, r: 3, c: cCNT, text: BO_CUC.TIKTOK.cotDoanhThu + '3', mang: false });
      kq.thongBao.push('`Tiktok` CÓ đơn thật (K3 khác 0 hoặc có dòng từ A4) → dọn như sheet gian hàng.');
      themPhanB3(SHEET_TIKTOK, ttTik);
    } else {
      kq.thongBao.push('`Tiktok` là vỏ rỗng (K3 = 0, không có dòng đơn từ A4) → bỏ qua, không đụng vào.');
      if (ssTik) themPhanB3(SHEET_TIKTOK, []);
    }
    // Cờ `B3:<tên sheet>` của lượt trước → các phần tới hết sheet đó đã xong, bỏ qua. Tên không khớp → dọn lại từ đầu, nói rõ.
    if (tiep.sheetXongB3) {
      var iXong = -1;
      phanB3.forEach(function (p, i) { if (p.ten === tiep.sheetXongB3) iXong = i; });
      if (iXong >= 0) {
        for (var iP = 0; iP <= iXong; iP++) phanB3[iP].daXong = true;
        kq.thongBao.push('Lượt trước đã dọn xong tới sheet `' + tiep.sheetXongB3 + '` (cờ B3:' + tiep.sheetXongB3 + ') → bỏ qua ' +
          (iXong + 1) + ' sheet, dọn tiếp từ ' + (phanB3[iXong + 1] ? '`' + phanB3[iXong + 1].ten + '`' : 'B4 (B3 đã hết sheet)') + '.');
      } else {
        kq.thongBao.push('Cờ BUOC_DA_XONG = B3:' + tiep.sheetXongB3 + ' không khớp sheet nào trong kế hoạch → dọn lại B3 từ đầu ' +
          '(dọn lại sheet đã sạch là vô hại: thao tác tính từ ảnh chụp hiện tại).');
      }
    }
    var ttB3 = [];
    phanB3.forEach(function (p) { if (!p.daXong) ttB3 = ttB3.concat(p.thaoTac); });

    // ---- B4: khối nhập đầu kỳ ----
    var b4 = thaoTacTongNhap(dm.ds, ssNhapCu, sheet(anhMoi, SHEET_NHAP), dau, khoiTruoc[SHEET_NHAP]);
    if (b4.thieuMau.length) kq.canhBao.push('Không tìm được mẫu công thức cột ' + b4.thieuMau.join(',') +
      ' ở `Tổng nhập` của cả hai file → các cột đó để trống, cần kiểm tay.');
    kq.doc.khoiDauKy = { dongDau: b4.dongDau, dongCuoi: b4.dongCuoi, soDong: dm.ds.length };
    kq.doc.vungCongThuc[SHEET_NHAP] = { dongCuoiDon: b4.dongCuoiDon, gieoLai: [], cot: b4.do };
    baoOLac(SHEET_NHAP, b4.oLac, b4.dongCuoiDon);
    baoDaSo(SHEET_NHAP, b4.gieoDaSo);

    // ---- B3b: `Tổng xuất` theo KHUÔN CHUẨN (2.9.0) + dòng bắt đầu chi phí `THU CHI B` (YC-63) — và KIỂM TRƯỚC B1 mọi tham chiếu sẽ vỡ ----
    // Khuôn không đọc công thức của vỏ, nên lượt chạy tiếp sau khi B3 lượt trước đã co / #REF! `Tổng xuất` vẫn ra y hệt.
    var tx = thaoTacTongXuat(anhMoi, anhCu);
    kq.doc.tongXuat = { coSheet: tx.coSheet, dongCuoi: tx.dongCuoi, soO: tx.soO, layTuCu: 0, boQua: 0 };
    // Chỉ số bước sẽ chạy tiếp (null = mọi bước đã xong, chỉ chạy lại tự kiểm) → bước nào còn phải chạy.
    var iTu = kq.tuBuoc ? THU_TU_BUOC.indexOf(kq.tuBuoc) : THU_TU_BUOC.length;
    var conBuoc = function (ma) { return iTu >= 0 && iTu <= THU_TU_BUOC.indexOf(ma); };
    if (tx.la.length && conBuoc('B3b')) {
      kq.canhBao.push('`' + SHEET_TONG_XUAT + '`: tiêu đề ' + tx.la.join(', ') + ' không khớp sheet đơn nào → cột đó ngoài khuôn, tool GIỮ NGUYÊN (không ghi lại). ' +
        'Kiểm tay vùng của cột đó phải chạy tới dòng ' + DONG_KEO_CT + '.');
    }
    // Sheet sắp xóa dòng và dòng cuối khối đơn sẽ xóa: phần B3 chưa xong + `Tổng nhập` nếu B4 chưa xong (ngoài 6 sheet của đề — chặn cùng loại lỗi).
    var dsXoa = {};
    if (conBuoc('B3')) {
      phanB3.forEach(function (p) {
        var v = kq.doc.vungCongThuc[p.ten];
        if (!p.daXong && v && v.dongCuoiDon >= 4) dsXoa[p.ten] = v.dongCuoiDon;
      });
    }
    if (conBuoc('B4') && b4.dongCuoiDon >= 4) dsXoa[SHEET_NHAP] = b4.dongCuoiDon;
    // B4b: `Tổng tồn kho` theo khuôn — lập trước để phép kiểm bỏ qua các ô sẽ ghi lại (B4 xóa dòng `Tổng nhập` làm co vùng cột I).
    var nt = thaoTacNhomTong(anhMoi);
    var boQua = {};
    if (conBuoc('B3b')) boQua[SHEET_TONG_XUAT] = tx.o;
    if (conBuoc('B4b')) boQua[SHEET_TON_KHO] = nt.o[SHEET_TON_KHO] || {};
    var vo = kiemThamChieuSeVo(anhMoi, dsXoa, boQua);
    if (vo.tong) {
      kq.maDung = 'THAM_CHIEU_SE_VO';
      kq.lyDoDung = ['Có ' + vo.tong + ' ô công thức ở sheet không bị dọn trỏ vào vùng nằm TRỌN trong khối đơn sắp xóa — xóa dòng sẽ biến chúng thành #REF! ' +
        '(hoặc cắt cụt): ' + vo.ds.join(' · ') + (vo.tong > vo.ds.length ? ' (và ' + (vo.tong - vo.ds.length) + ' ô nữa)' : '') + '. Việc phải làm: sửa tay các ô đó ' +
        'cho vùng chạy từ dòng 4 tới dòng ' + DONG_KEO_CT + ' (ví dụ `$M$4:$M$' + DONG_KEO_CT + '`) trên bản sao tháng mới, rồi bấm lại nút 3 chế độ 1. ' +
        'KHÔNG khởi tạo, tool chưa ghi ô nào.'];
      return kq;
    }
    var tcb = thaoTacThuChiB(sheet(anhMoi, SHEET_THU_CHI_B), thangMoi);
    kq.doc.thuChiB = { coSheet: tcb.coSheet, dongBatDau: tcb.dongBatDau, dongCuoiNgay: tcb.dongCuoiNgay, oDoi: tcb.oDoi, dongCu: tcb.dongCu };
    tcb.thongBao.forEach(function (t) { kq.thongBao.push(t); });
    tcb.canhBao.forEach(function (t) { kq.canhBao.push(t); });
    var ttB3b = tx.thaoTac.concat(tcb.thaoTac);
    // Mọi ô TỔNG tool ghi (đáy phải là 2003) — K-12 chấm trên đúng danh sách này; mọi lệnh khuôn — K-13 chấm.
    kq.doc.oTong = [];
    phanB3.forEach(function (p) {
      p.thaoTac.forEach(function (t) { if (t.loai === 'GHI_CT' && t.r === 3 && /^SUM\(/.test(t.text)) kq.doc.oTong.push({ sheet: t.sheet, r: t.r, c: t.c }); });
    });
    b4.thaoTac.forEach(function (t) { if (t.loai === 'GHI_CT' && t.r === 2 && t.c === C('I')) kq.doc.oTong.push({ sheet: t.sheet, r: t.r, c: t.c }); });
    kq.doc.oTong = kq.doc.oTong.concat(tx.oTong, nt.ds);
    kq.doc.khuon = [];
    phanB3.map(function (p) { return p.thaoTac; }).concat([tx.thaoTac, b4.thaoTac, nt.thaoTac]).forEach(function (ds) {
      ds.forEach(function (t) { if (t.loai === 'GHI_KHUON') kq.doc.khuon.push(t); });
    });

    // ---- B5: đẩy cột `Lợi nhuận` ----
    var b5 = thaoTacLoiNhuan(ln, soThangMoi, ln.nam == null ? namMoi : ln.nam);
    kq.doc.loiNhuanCotCuoiMoi = b5.cotCuoiMoi;
    kq.doc.loiNhuanSoCongThucD = b5.soCongThucD;

    // ---- B6: chép `Mapping_san_pham` ----
    var ttB6 = [{ loai: 'TAO_SHEET', ten: TEN_SHEET_MAPPING }];
    if (map && map.bang.length) ttB6.push({ loai: 'GHI_BANG', sheet: TEN_SHEET_MAPPING, r1: 1, c1: 1, bang: map.bang });

    // ---- B2b (YC-43): đóng băng cột tháng cũ `Lợi nhuận`!D bằng giá trị đọc ở B2 — TRƯỚC khi dọn bất kỳ sheet nào ----
    var ttB2b = [];
    for (var iB = 0; iB < ln.dong6den16.length; iB++) {
      var vB = ln.dong6den16[iB];
      ttB2b.push({ loai: 'GHI_O', sheet: SHEET_LOI_NHUAN, r: 6 + iB, c: C('D'), gt: (vB == null || vB === '') ? null : vB });
    }

    kq.buoc = [
      { ma: 'B2b', ten: 'Đóng băng tháng cũ ở `Lợi nhuận` (trước khi dọn sheet nào)', mocSau: 'B2b', thaoTac: ttB2b },
      { ma: 'B3', ten: 'Dọn sheet gian hàng', mocSau: 'B3', phan: phanB3, thaoTac: ttB3 },
      { ma: 'B3b', ten: 'Ghi khuôn chuẩn `Tổng xuất` (vùng $4:$' + DONG_KEO_CT + ') và dòng bắt đầu chi phí `THU CHI B`', mocSau: 'B3b', thaoTac: ttB3b },
      { ma: 'B4', ten: 'Ghi khối nhập đầu kỳ vào `Tổng nhập`', mocSau: 'B4', thaoTac: b4.thaoTac },
      { ma: 'B4b', ten: 'Ghi khuôn chuẩn `Tổng tồn kho` (H, I, J, K và K1)', mocSau: 'B4b', thaoTac: nt.thaoTac },
      {
        ma: 'B5a', ten: 'Chèn một cột trước `D` ở `Lợi nhuận`', mocTruoc: 'B5_DANG_LAM', mocSau: 'B5_DA_CHEN',
        khongLapLai: true, thaoTac: [{ loai: 'CHEN_COT', sheet: SHEET_LOI_NHUAN, truocCot: C('D') }]
      },
      { ma: 'B5b', ten: 'Đóng băng tháng cũ ở cột `E`, dựng cột tháng mới', mocSau: 'B5b', thaoTac: b5.thaoTac },
      { ma: 'B6', ten: 'Chép `Mapping_san_pham`', mocSau: 'B6', thaoTac: ttB6 },
      { ma: 'B7', ten: 'Ghi khối điều khiển `N1:O5`', mocSau: 'B7', thaoTac: thaoTacKhoiDieuKhien('DANG_KHOI_TAO_' + nhan, thangMoi, ts.nguonClone || ts.idFileCu || '', 'B7') }
    ];
    kq.chay = true;
    kq.nhanThoiDiem = nhan;
    return kq;
  }

  // ---------------------------------------------------------------- B8: mười một phép tự kiểm (K-9…K-11 từ YC-63)

  /** Khối đầu kỳ = các dòng `Tổng nhập` có `D` và KHÔNG có `Ngày nhập` (cột J). */
  function docKhoiDauKy(ssNhap) {
    var n = soDong(ssNhap), ds = [], tongI = 0, coNgay = [];
    for (var r = 4; r <= n; r++) {
      var d = o(ssNhap, r, C('D'));
      if (Utils.laRong(d)) continue;
      var ngay = tinh(ssNhap, r, C('J'));
      if (!Utils.laRong(ngay)) { coNgay.push(r); continue; }
      var h = so(tinh(ssNhap, r, C('H'))) || 0;
      var i = so(tinh(ssNhap, r, C('I'))) || 0;
      ds.push({ dong: r, tenVietTat: String(d).trim(), ton: h, tien: i });
      tongI += i;
    }
    return { ds: ds, tongI: tongI, dongCoNgay: coNgay };
  }

  /**
   * Mười ba phép K-1…K-13. LỆCH MỘT PHÉP LÀ DỪNG — vỏ không được đánh dấu hoàn tất.
   * @param {Object} anhCu     ảnh chụp tháng cũ (như lúc lập kế hoạch)
   * @param {Object} anhSau    ảnh chụp tháng mới SAU khi thực thi; `giaTriTinh` phải là giá trị đã tính lại
   * @param {Object} ke        kết quả `lapKeHoach`
   */
  function tuKiem(anhCu, anhSau, ke) {
    var kq = [];
    function them(ma, ten, dat, chiTiet) { kq.push({ ma: ma, ten: ten, dat: !!dat, chiTiet: chiTiet }); }

    var dm = ke.doc.danhMuc;
    var ssNhap = sheet(anhSau, SHEET_NHAP);
    var khoi = ssNhap ? docKhoiDauKy(ssNhap) : { ds: [], tongI: 0, dongCoNgay: [] };

    // K-1 — tồn đầu kỳ khớp từng mã, 100%, không cho một mã nào lệch
    var theoMa = {};
    khoi.ds.forEach(function (d) { theoMa[Utils.chuanHoaChuoi(d.tenVietTat)] = (theoMa[Utils.chuanHoaChuoi(d.tenVietTat)] || 0) + d.ton; });
    var lech1 = [];
    dm.forEach(function (m) {
      var k = Utils.chuanHoaChuoi(m.tenVietTat);
      var v = theoMa[k];
      if (v == null) lech1.push(m.tenVietTat + ': thiếu dòng đầu kỳ');
      else if (Math.abs(v - m.ton) > 1e-9) lech1.push(m.tenVietTat + ': ' + v + ' ≠ ' + m.ton);
    });
    them('K-1', 'Tồn đầu kỳ khớp từng mã', lech1.length === 0, lech1.length ? lech1.slice(0, 8).join(' · ') : dm.length + '/' + dm.length + ' mã khớp');

    // K-2 — giá trị khối đầu kỳ khớp tổng, lệch < 1 đ
    var moc = ke.doc.giaTriTonCuoi != null ? ke.doc.giaTriTonCuoi : ke.doc.tongTienTonTinhLai;
    var d2 = khoi.tongI - moc;
    them('K-2', 'SUM(`Tổng nhập`!I khối đầu kỳ) == `Tổng tồn kho`!K1 tháng cũ',
      Math.abs(d2) < 1, khoi.tongI.toFixed(2) + ' vs ' + Number(moc).toFixed(2) + ' (lệch ' + d2.toFixed(4) + ' đ)');

    // K-3 — số mã trong danh mục hai file bằng nhau
    var ssTonMoi = sheet(anhSau, SHEET_TON_KHO);
    var dmMoi = ssTonMoi ? docDanhMuc(ssTonMoi).ds.length : 0;
    them('K-3', 'Số mã `Tổng tồn kho` hai file bằng nhau', dmMoi === dm.length, dmMoi + ' vs ' + dm.length);

    // K-4 — số sheet: tháng mới = tháng cũ + đúng một `Mapping_san_pham`
    var sCu = sheetNgoaiMapping(anhCu), sMoi = sheetNgoaiMapping(anhSau);
    var coMap = (anhSau.tenSheet || []).indexOf(TEN_SHEET_MAPPING) >= 0;
    var dat4 = coMap && sCu.length === sMoi.length && sMoi.every(function (t, i) { return t === sCu[i]; });
    them('K-4', 'Danh sách sheet = tháng cũ + đúng một `Mapping_san_pham`', dat4,
      (anhSau.tenSheet || []).length + ' sheet' + (coMap ? '' : ' — THIẾU `Mapping_san_pham`') + (dat4 ? '' : ' · ' + soSanhDanhSach(sCu, sMoi)));

    // K-5 — `Mapping_san_pham` số dòng bằng nhau
    var mapCu = ke.doc.mapping ? demDongMapping(ke.doc.mapping.bang) : 0;
    var mapMoi = demDongMapping((docMapping(anhSau) || { bang: null }).bang);
    them('K-5', '`Mapping_san_pham` số dòng bằng nhau', mapMoi === mapCu, mapMoi + ' vs ' + mapCu);

    // K-6 — mọi dòng tổng ra SỐ, không lỗi, không rỗng
    var oCanKiem = [];
    ['Shopee mall'].forEach(function (t) { oCanKiem.push([t, 3, 'H'], [t, 3, 'L']); });
    ['Offood', 'Importmart', 'Babyiu'].forEach(function (t) { oCanKiem.push([t, 3, 'L']); });
    oCanKiem.push([SHEET_DON_NGOAI, 3, 'L'], [SHEET_DON_NGOAI, 3, 'M'], [SHEET_TIKTOK, 3, 'K'],
      [SHEET_NHAP, 2, 'I'], [SHEET_TON_KHO, 1, 'K']);
    if (sheet(anhSau, SHEET_TIKTOK_SHOP)) oCanKiem.push([SHEET_TIKTOK_SHOP, 3, 'L']);
    // `Lợi nhuận` cột D: MỌI ô tool đã dựng công thức (tháng 8: D6,D7,D8,D11,D12; tháng 9: thêm D13,D15…D18).
    var ctLN = ke.doc.loiNhuanCu.congThucD || [];
    var dongCT = [];
    ctLN.forEach(function (t, i) { if (t) dongCT.push(6 + i); });
    if (!ke.doc.loiNhuanCu.congThucD) dongCT = [6, 7, 8, 11, 12];
    dongCT.forEach(function (r) { oCanKiem.push([SHEET_LOI_NHUAN, r, 'D']); });
    var lech6 = [], oke6 = 0;
    oCanKiem.forEach(function (x) {
      var ss = sheet(anhSau, x[0]);
      var v = ss ? tinh(ss, x[1], C(x[2])) : null;
      if (!ss) lech6.push(x[0] + ': không có sheet');
      else if (laLoi(v)) lech6.push(x[0] + '!' + x[2] + x[1] + '=' + v);
      else if (so(v) == null) lech6.push(x[0] + '!' + x[2] + x[1] + '=' + (v === null || v === '' ? '(rỗng)' : '"' + v + '"'));
      else oke6++;
    });
    them('K-6', 'Dòng tổng ra số, không lỗi', lech6.length === 0, lech6.length ? lech6.join(' · ') : oke6 + '/' + oCanKiem.length + ' ô là số');

    // K-7 — tháng mới chưa có doanh số
    var ssLN = sheet(anhSau, SHEET_LOI_NHUAN);
    var d7 = ssLN ? so(tinh(ssLN, 7, C('D'))) : null;
    them('K-7', '`Lợi nhuận`!D7 tháng mới bằng 0', d7 != null && Math.abs(d7) < 0.5,
      d7 == null ? '(không đọc được)' : String(d7));

    // K-8 — tháng cũ đã đóng băng đúng: cột E là GIÁ TRỊ, bằng đúng giá trị đọc ở B2
    var lech8 = [], conCT = [];
    var soDong8 = ke.doc.loiNhuanCu.dong6den16.length;
    for (var i = 0; i < soDong8; i++) {
      var r = 6 + i;
      if (!ssLN) break;
      if (ct(ssLN, r, C('E')) != null) conCT.push('E' + r);
      var mong = ke.doc.loiNhuanCu.dong6den16[i];
      var thuc = tinh(ssLN, r, C('E'));
      var a = so(mong), b = so(thuc);
      if (a == null && b == null) continue;
      if (a == null || b == null || Math.abs(a - b) > 0.01) lech8.push('E' + r + ': ' + thuc + ' ≠ ' + mong);
    }
    them('K-8', '`Lợi nhuận` cột E là giá trị cứng và bằng cột D tháng cũ', conCT.length === 0 && lech8.length === 0,
      (conCT.length ? 'CÒN CÔNG THỨC ở ' + conCT.join(',') + ' — số tháng cũ sẽ tự biến thành 0. ' : '') +
      (lech8.length ? lech8.join(' · ') : soDong8 + '/' + soDong8 + ' dòng khớp'));

    // K-9 (YC-63) — `Đơn ngoài` sau B3: (i) không có HAI cột tiền L, M cùng mang công thức ở vùng dòng trống (doanh số tính hai lần);
    // (ii) I4:I2003 rỗng (không công thức gieo, không giá trị); (iii) L3 = M3 = 0.
    var ssDN = sheet(anhSau, SHEET_DON_NGOAI);
    if (!ssDN) {
      them('K-9', '`Đơn ngoài`: một cột tiền mang công thức, I trống, L3 = M3 = 0', true, 'không có sheet `' + SHEET_DON_NGOAI + '` — không áp dụng');
    } else {
      var lech9 = [];
      var tu9 = dongDauVungTrong(ssDN, C(DON_NGOAI.cotCuoiDon), DON_NGOAI.cotTenVietTat), het9 = Math.min(soDong(ssDN), DONG_KEO_CT);
      var nL = 0, nM = 0, oI = [];
      for (var r9 = 4; r9 <= het9; r9++) {
        if (r9 >= tu9 && ct(ssDN, r9, C(DON_NGOAI.cotPhuong)) != null) nL++;
        if (r9 >= tu9 && ct(ssDN, r9, C(DON_NGOAI.cotOanh)) != null) nM++;
        if (ct(ssDN, r9, C(DON_NGOAI.cotTienSP)) != null || !Utils.laRong(o(ssDN, r9, C(DON_NGOAI.cotTienSP)))) oI.push(DON_NGOAI.cotTienSP + r9);
      }
      if (nL && nM) lech9.push('L (' + nL + ' ô) và M (' + nM + ' ô) CÙNG mang công thức ở dòng trống — mỗi đơn tính doanh số hai lần');
      if (oI.length) lech9.push(DON_NGOAI.cotTienSP + '4:' + DON_NGOAI.cotTienSP + DONG_KEO_CT + ' có ' + oI.length + ' ô không trống (' + oI.slice(0, 3).join(',') + (oI.length > 3 ? ',…' : '') + ')');
      ['L', 'M'].forEach(function (chu) {
        var v = tinh(ssDN, 3, C(chu));
        if (so(v) == null || Math.abs(so(v)) >= 0.5) lech9.push(chu + '3=' + (v == null || v === '' ? '(rỗng)' : v));
      });
      them('K-9', '`Đơn ngoài`: một cột tiền mang công thức, I trống, L3 = M3 = 0', lech9.length === 0,
        lech9.length ? lech9.join(' · ') : 'L ' + nL + ' ô · M ' + nM + ' ô công thức ở dòng trống · I trống · L3 = M3 = 0');
    }

    // K-10 (YC-63) — `Lợi nhuận` cột D các dòng chi phí trỏ `THU CHI B` bằng 0 ngay sau khi tạo (chi phí tháng cũ không chạy sang).
    var dongTC = [];
    (ke.doc.loiNhuanCu.congThucD || []).forEach(function (t, i) { if (t && /THU CHI B/i.test(t)) dongTC.push(6 + i); });
    if (!dongTC.length || !ssLN) {
      them('K-10', '`Lợi nhuận` dòng chi phí trỏ `THU CHI B` bằng 0', true, 'không có dòng cột D nào trỏ `' + SHEET_THU_CHI_B + '` — không áp dụng');
    } else {
      var lech10 = [];
      dongTC.forEach(function (r) {
        var v = tinh(ssLN, r, C('D'));
        if (laLoi(v) || (v != null && v !== '' && (so(v) == null || Math.abs(so(v)) >= 0.5))) lech10.push('D' + r + '=' + v);
      });
      them('K-10', '`Lợi nhuận` dòng chi phí trỏ `THU CHI B` bằng 0', lech10.length === 0,
        lech10.length ? lech10.join(' · ') + ' — chi phí tháng cũ chạy sang tháng mới' : dongTC.length + '/' + dongTC.length + ' ô (D' + dongTC.join(',D') + ') bằng 0');
    }

    // K-11 (YC-63) — mọi ô `Tổng xuất`!I..N có công thức trỏ vùng kết thúc ĐÚNG dòng 2003 (cả hai vùng), không #REF!.
    var ssTX = sheet(anhSau, SHEET_TONG_XUAT);
    if (!ssTX) {
      them('K-11', '`Tổng xuất`!I..N trỏ vùng $4:$' + DONG_KEO_CT + ', không #REF!', true, 'không có sheet `' + SHEET_TONG_XUAT + '` — không áp dụng');
    } else {
      var lech11 = [], soLech11 = 0, dat11 = 0, het11 = Math.max((ke.doc.tongXuat && ke.doc.tongXuat.dongCuoi) || 0, 4);
      for (var r11 = 4; r11 <= het11; r11++) {
        COT_TONG_XUAT.forEach(function (chu) {
          var f = ct(ssTX, r11, C(chu)), v = tinh(ssTX, r11, C(chu));
          if (f == null) {
            if (ke.doc.tongXuat && ke.doc.tongXuat.soO && laLoi(v)) { soLech11++; if (lech11.length < 5) lech11.push(chu + r11 + '=' + v); }
            return;
          }
          var p = docSumifTongXuat(f, tinh(ssTX, 3, C(chu)));
          var loi = laLoi(v) ? 'giá trị ' + v : (!p.dat ? p.lyDo : (p.cuoi[0] !== DONG_KEO_CT || p.cuoi[1] !== DONG_KEO_CT ? 'vùng kết thúc ở dòng ' + p.cuoi.join('/') : ''));
          if (loi) { soLech11++; if (lech11.length < 5) lech11.push(chu + r11 + ' (' + loi + ')'); } else dat11++;
        });
      }
      var mong11 = (ke.doc.tongXuat && ke.doc.tongXuat.soO) || 0;
      if (!soLech11 && dat11 < mong11) { soLech11++; lech11.push('chỉ ' + dat11 + '/' + mong11 + ' ô còn công thức'); }
      them('K-11', '`Tổng xuất`!I..N trỏ vùng $4:$' + DONG_KEO_CT + ', không #REF!', soLech11 === 0,
        soLech11 ? soLech11 + ' ô lệch: ' + lech11.join(' · ') : dat11 + ' ô SUMIF đều trỏ $4:$' + DONG_KEO_CT);
    }

    // K-12 (2.8.4) — mọi ô TỔNG tool ghi (dòng 3 sheet đơn, `Tổng nhập`!I2, `Tổng tồn kho`!I/J/K1, `Tổng xuất`!O2) có vùng kết thúc ĐÚNG dòng 2003
    // (không bị Google giãn khi nới lưới, không #REF!) và ra số.
    var dsTong = (ke.doc.oTong || []), lech12 = [], dat12 = 0;
    dsTong.forEach(function (x) {
      var ss = sheet(anhSau, x.sheet), f = ss ? ct(ss, x.r, x.c) : null, v = ss ? tinh(ss, x.r, x.c) : null;
      var day = [];
      String(f || '').replace(/"[^"]*"/g, '').replace(/\$?[A-Z]{1,3}\$?\d+:\$?[A-Z]{1,3}\$?(\d+)/g, function (t, d) { day.push(+d); return t; });
      var loi = !f ? 'mất công thức' : /#REF!/i.test(f) || laLoi(v) ? 'lỗi ' + (laLoi(v) ? v : '#REF!') : !day.length ? 'không còn vùng' :
        day.some(function (d) { return d !== DONG_KEO_CT; }) ? 'đáy ' + day.join('/') : '';
      if (loi) { if (lech12.length < 6) lech12.push(x.sheet + '!' + L(x.c) + x.r + ' (' + loi + ')'); } else dat12++;
    });
    them('K-12', 'Ô tổng tool ghi có vùng tới đúng dòng ' + DONG_KEO_CT, dat12 === dsTong.length,
      dat12 === dsTong.length ? dat12 + '/' + dsTong.length + ' ô tổng đều tới dòng ' + DONG_KEO_CT : (dsTong.length - dat12) + ' ô lệch: ' + lech12.join(' · '));

    // K-13 (2.9.0) — mọi ô trong KHUÔN CHUẨN mang đúng công thức chuẩn (cột trống-khuôn thì không còn công thức nào, 2.9.1: cũng không còn chữ lỗi). Ô có giá trị gõ tay được
    // tool để yên nên không chấm. So sau khi bỏ khoảng trắng, chữ hoa/thường và dấu phân cách `;`/`,` (Google trả theo cài đặt vùng của sổ).
    var lech13 = [], soLech13 = 0, soO13 = 0;
    (ke.doc.khuon || []).forEach(function (op) {
      var ss = sheet(anhSau, op.sheet);
      op.cot.forEach(function (x) {
        for (var r = op.r1; r <= op.r2; r++) {
          var f = ss ? ct(ss, r, x.c) : null;
          var v13 = ss ? o(ss, r, x.c) : null;
          // giá trị gõ tay: tool để yên. 2.9.1: CHỮ lỗi không công thức (`#ERROR!` do lệnh xóa hỏng — Google 3/11) KHÔNG phải gõ tay → chấm như ô khuôn.
          if (f == null && ss && !Utils.laRong(v13) && !laLoi(v13)) continue;
          soO13++;
          var mong = x.text == null ? null : chuanCongThuc(Utils.dichCongThuc(x.text, op.r1, r));
          if ((f == null ? null : chuanCongThuc(f)) === mong) continue;
          soLech13++;
          if (lech13.length < 5) lech13.push(op.sheet + '!' + L(x.c) + r + (f == null ? (laLoi(v13) ? ' (chữ ' + String(v13).trim() + ')' : ' (trống)') : ' =' + String(f).slice(0, 60)));
        }
      });
    });
    them('K-13', 'Công thức đúng khuôn chuẩn', soLech13 === 0,
      soLech13 ? soLech13 + '/' + soO13 + ' ô lệch khuôn: ' + lech13.join(' · ') : soO13 + ' ô đúng khuôn (' + (ke.doc.khuon || []).length + ' vùng)');

    var soLech = kq.filter(function (x) { return !x.dat; }).length;
    return { phep: kq, dat: soLech === 0, soLech: soLech, khoiDauKy: khoi };
  }

  return {
    PHIEN_BAN: PHIEN_BAN,
    TEN_SHEET_MAPPING: TEN_SHEET_MAPPING,
    DAY_VUNG: DAY_VUNG,
    DONG_KEO_CT: DONG_KEO_CT,
    SHEET_TIKTOK_SHOP: SHEET_TIKTOK_SHOP,
    SHEET_CHI_PHI: SHEET_CHI_PHI,
    cotCoCongThuc: cotCoCongThuc,
    dongDauVungTrong: dongDauVungTrong,
    khuonSheetDon: khuonSheetDon,
    khuonDonNgoai: khuonDonNgoai,
    khuonTongNhap: khuonTongNhap,
    khuonTonKho: khuonTonKho,
    chuanCongThuc: chuanCongThuc,
    mauDaSoDongDon: mauDaSoDongDon,
    SHEET_TONG_XUAT: SHEET_TONG_XUAT,
    SHEET_THU_CHI_B: SHEET_THU_CHI_B,
    COT_TONG_XUAT: COT_TONG_XUAT,
    docSumifTongXuat: docSumifTongXuat,
    vietLaiVungTongXuat: vietLaiVungTongXuat,
    kiemThamChieuSeVo: kiemThamChieuSeVo,
    thaoTacThuChiB: thaoTacThuChiB,
    laSheetDon: laSheetDon,
    laThongTinShop: laThongTinShop,
    cotDuLieuChiPhi: cotDuLieuChiPhi,
    dongCuoiNhanLoiNhuan: dongCuoiNhanLoiNhuan,
    laCongThucThamChieu: laCongThucThamChieu,
    SHEET_GIAN_HANG: SHEET_GIAN_HANG,
    BO_CUC: BO_CUC,
    boCucTikTokShop: boCucTikTokShop,
    chuanThangCo: chuanThangCo,
    DON_NGOAI: DON_NGOAI,
    doiDauPhanCach: doiDauPhanCach,
    oCoDuLieu: oCoDuLieu,
    quetDuLieu: quetDuLieu,
    dongCuoiDuLieu: dongCuoiDuLieu,
    vungCongThucCot: vungCongThucCot,
    doVungCongThuc: doVungCongThuc,
    kiemDieuKien: kiemDieuKien,
    buocBatDau: buocBatDau,
    THU_TU_BUOC: THU_TU_BUOC,
    dauPhanCachCuaAnh: dauPhanCachCuaAnh,
    CAU_BAN_SAO_HONG: CAU_BAN_SAO_HONG,
    docDanhMuc: docDanhMuc,
    docLoiNhuanCu: docLoiNhuanCu,
    docMapping: docMapping,
    demDongMapping: demDongMapping,
    docKhoiDauKy: docKhoiDauKy,
    coDonThat: coDonThat,
    cotConNo: cotConNo,
    mauCongThuc: mauCongThuc,
    lapKeHoach: lapKeHoach,
    tuKiem: tuKiem
  };
})();

var VAN_TAY_TAOTHANGMOI = '61652ecf';   // dấu vân tay file này — MÁY sinh bằng `npm run dau-van-tay`, đừng sửa tay
