/**
 * AdapterTikTok.gs — LỚP 1 của gian TikTok Shop (Đợt 4, YC-49/50/56; YC-54 chỉ đọc). Nơi DUY NHẤT biết định dạng báo cáo TikTok Seller Center.
 *
 * CHỈ CHẠY TRÊN MÁY (nạp bằng `node/nap-loi.js`), KHÔNG dán lên Apps Script — như `AdapterFileXuat.gs`. Hồ sơ sàn là tri thức kỹ thuật
 * nên nằm trong mã, không nằm trong cấu hình user: TikTok đổi tên cột thì dev sửa file này, user bấm nút 2, KHÔNG phải Deploy Google.
 *
 * BA NGUỒN (đo 15/9 trên file thật; BA đo lại và chốt 16/9):
 *   A · "Sẽ thanh toán"  (Onhold-unsettled-orders-*.xlsx) — cấp SKU, có tiền → ĐƯỜNG CHÍNH, đọc ra ĐƠN CHUẨN (`docSeThanhToan`).
 *   C · Order Export     (Tất cả đơn hàng-*.xlsx)          — cấp SKU, KHÔNG có tiền → chỉ lấy "RTS Time" (ngày sắp xếp vận chuyển) làm
 *                                                            cột A (D-87, YC-56) — `docOrderExport`. Thiếu file C là DỪNG.
 *   B · "Đã quyết toán"  (income_*.xlsx)                  — cấp ĐƠN, không ID SKU / Số lượng / Tên sản phẩm → không bao giờ tạo dòng.
 *                                                            Đợt 4 chỉ nhận diện + đọc (`docDaQuyetToan`); INV-1b hoãn Đợt 5 (D-88).
 *
 * TỪ ĐƠN CHUẨN TRỞ XUỐNG là mã production của bốn gian Shopee — không sửa dòng nào. File này KHÔNG tính thuế, KHÔNG tính phí.
 *
 * CÔNG THỨC CHỐT (BA 16/9) — CHUNG cho A và B, đo A 130/130 dòng, B 311/311 dòng (công thức 4 cột gốc: 124/130 và 225/311):
 *   H = Tổng phụ trước giảm giá + Tổng phụ hoàn tiền trước giảm giá của người bán
 *   I = −(Giảm giá của người bán + Khoản hoàn tiền giảm giá của người bán)
 *   K = −(Thuế GTGT + Thuế TNCN)            (thuế trong báo cáo luôn ≤ 0 nên bằng |GTGT| + |TNCN|; gặp thuế DƯƠNG là dừng)
 *   J = −(Tổng phí) − K
 *   Tự kiểm TỪNG ĐƠN: H − I − J − K = Số tiền quyết toán. Lệch MỘT ĐỒNG là DỪNG cả phần TikTok, không ghi đơn nào (`kiemTuKiem`).
 * THUẾ TIKTOK LÀM TRÒN CHẴN (half-even) 1% và 0,5% trên Tổng doanh thu (BA đo 122/123 dòng; một đơn tính trên cơ sở khác) — lõi Shopee làm
 * tròn lên nên lệch 1 đ ở 64/130 dòng. CẤM tự dựng công thức thuế cho TikTok: luôn lấy số từ báo cáo.
 *
 * LUẬT KHÔNG GHI (P-2, BA chốt 16/9):
 *   (a) H ròng = 0 → KHÔNG PHẢI ĐƠN BÁN (đơn hủy / hoàn toàn bộ / khoản hoàn phí) → bỏ qua, nhắc.
 *       Đo 15/9: 6 đơn "quyết toán 0" thật ra đã HOÀN TOÀN BỘ (Tổng phụ hoàn tiền = −Tổng phụ), 5 đơn Order Export ghi "Đã hủy";
 *       và một đơn hủy Tổng phụ 0, phí dương (hoàn phí SFR).
 *   (b) Lý do chưa quyết toán = "Đang chờ hoàn tất trả hàng/hoàn tiền" → TREO, không ghi, nhắc (file đo 16/9 có 1 đơn như vậy, khách đã hủy).
 *   (c) Hoàn một phần (còn H > 0 nhưng có khoản hoàn) → TREO: số lượng bán thật không suy được từ báo cáo.
 *   (d) Quyết toán ước tính = 0 mà H > 0 → TikTok chưa tính phí → bỏ qua, lượt sau ghi.
 *
 * BẪY:
 *   1. Mã đơn là CHUỖI 18 chữ số (> Number.MAX_SAFE_INTEGER). Không bao giờ ép sang số; ô đã thành số là DỪNG.
 *   2. Mọi ô là CHUỖI, kể cả tiền → phép nguyên CHẶT, KHÔNG dùng `Utils.parseTien` (hiểu "1.234" là một nghìn hai trăm ba tư).
 *   3. Phí/giảm giá mang dấu âm nhưng CÓ khoản dương (hoàn phí SFR): ĐỔI DẤU, không trị tuyệt đối.
 *   4. Đơn nhiều SKU: phí PHÂN BỔ THEO DÒNG → cộng theo dòng là đúng (ngược Order Export, nơi Order Amount lặp ở mọi dòng).
 *   5. A: tiêu đề dòng 5, dữ liệu 6 · B: tiêu đề 1, dữ liệu 2 · C: tiêu đề 1, mô tả cột dòng 2, dữ liệu 3.
 *   6. Ngày A/B 'yyyy/MM/dd'; C 'dd/MM/yyyy HH:mm:ss' — tách tay theo hồ sơ.
 *   7. `<dimension>` của cả BA loại file SAI (A khai A1:BX6 cho 135 dòng, B A1:BO3, C "A1") — vỏ dò lại vùng; ở đây đối chiếu với số khai
 *      của chính báo cáo: A ô "Tổng số giao dịch"; B sheet "Báo cáo" (Tổng số tiền quyết toán, Tổng phụ trước giảm giá); C số dòng đọc
 *      được không ít hơn vùng khai. Lệch là DỪNG.
 */
var AdapterTikTok = (function () {

  var MA_GIAN = 'TT_SHOP';
  var TEN_SHEET_DICH = 'TikTok Shop';
  var LY_DO_TRA_HANG = 'Đang chờ hoàn tất trả hàng/hoàn tiền';

  /** 76 tiêu đề báo cáo A đo ngày 15/9/2026 — để gọi tên cột LẠ khi TikTok thêm cột (chỉ nhắc, vẫn đọc). */
  var TIEU_DE_A_15_9 = ['Loại giao dịch', 'ID đơn hàng/điều chỉnh', 'Ngày tạo giao dịch', 'Đơn vị tiền tệ', 'Số tiền quyết toán ước tính',
    'Thời gian quyết toán dự kiến', 'Lý do chưa quyết toán', 'ID đơn hàng liên quan', 'Ngày tạo đơn hàng', 'Ngày vận chuyển đơn hàng',
    'Ngày giao đơn hàng', 'ID SKU', 'Số lượng', 'Tên sản phẩm', 'Tên SKU', 'Tổng doanh thu', 'Tổng phụ sau giảm giá của người bán',
    'Tổng phụ trước giảm giá', 'Giảm giá của người bán', 'Tổng phụ của khoản hoàn tiền sau giảm giá của người bán',
    'Tổng phụ hoàn tiền trước giảm giá của người bán', 'Khoản hoàn tiền giảm giá của người bán', 'Tổng phí', 'Phí giao dịch ước tính',
    'Phí hoa hồng của TikTok Shop', 'Phí vận chuyển ước tính của người bán', 'Phí vận chuyển thực tế', 'Chiết khấu phí vận chuyển của nền tảng',
    'Chi phí vận chuyển của khách hàng', 'Phí vận chuyển trả hàng thực tế', 'Phí vận chuyển của khách hàng được hoàn lại', 'Hoàn phí SFR',
    'Trợ cấp giao hàng không thành công', 'Trợ giá vận chuyển', 'Hoa hồng liên kết ước tính',
    'Hoa hồng liên kết trước thuế TNCN (thuế thu nhập cá nhân)', 'Thuế TNCN đã khấu trừ', 'Hoa hồng liên kết Quảng cáo cửa hàng',
    'Hoa hồng của Quảng cáo cửa hàng liên kết trước thuế TNCN',
    'Thuế thu nhập cá nhân đã được khấu trừ vào khoản hoa hồng của Quảng cáo cửa hàng liên kết', 'Hoa hồng của đối tác liên kết',
    'Tiền cọc hoa hồng liên kết', 'Hoàn hoa hồng liên kết', 'Hoa hồng quảng cáo cửa hàng của Đối tác liên kết', 'Phí dịch vụ SFP',
    'Phí dịch vụ hoàn tiền thưởng', 'Phí dịch vụ Ưu đãi đặc biệt trên LIVE', 'Phí dịch vụ Voucher Xtra', 'Phí xử lý đơn hàng',
    'Phí dịch vụ Chương trình EAMS', 'Phí dịch vụ Flash Sale', 'Thuế GTGT do TikTok Shop khấu trừ', 'Thuế TNCN do TikTok Shop khấu trừ',
    'Phí chương trình TikTok PayLater', 'Phí nguồn lực chiến dịch', 'Phí dịch vụ SFR', 'Voucher GMV Max', 'Thuế bán hàng của voucher GMV Max',
    'Gói dịch vụ được quản lý (thuế bán hàng)', 'Gói dịch vụ được quản lý (phí mỗi đơn hàng)', 'Phí quảng cáo GMV Max', 'Số tiền điều chỉnh',
    'ID đơn hàng liên quan', 'Khách thanh toán', 'Tiền hoàn của khách', 'Giảm giá voucher đồng chi trả của người bán',
    'Hoàn tiền giảm giá voucher đồng chi trả của người bán', 'Giảm giá của nền tảng', 'Hoàn tiền giảm giá của nền tảng',
    'Giảm giá voucher đồng chi trả của nền tảng', 'Hoàn tiền giảm giá voucher đồng chi trả của nền tảng',
    'Phí vận chuyển khách hàng thanh toán trước giảm giá', 'Giảm phí vận chuyển của người bán',
    'TikTok Shop giảm phí vận chuyển cho khách hàng', 'Trọng lượng kiện hàng ước tính', 'Trọng lượng kiện hàng được tính phí'];

  /** Sáu cột tiền của công thức chốt — cùng TÊN ở báo cáo A và B. */
  var COT_TIEN = {
    tien_truoc_giam: 'Tổng phụ trước giảm giá',
    hoan_truoc_giam: 'Tổng phụ hoàn tiền trước giảm giá của người bán',
    giam_gia_shop: 'Giảm giá của người bán',                    // ÂM
    hoan_giam_gia_shop: 'Khoản hoàn tiền giảm giá của người bán', // DƯƠNG khi có hoàn
    tong_phi: 'Tổng phí',                                         // ÂM, đã gồm thuế; có khoản dương
    thue_gtgt: 'Thuế GTGT do TikTok Shop khấu trừ',               // ÂM
    thue_tncn: 'Thuế TNCN do TikTok Shop khấu trừ'                // ÂM
  };

  /** HỒ SƠ SÀN — khung BA chốt, tên cột đo từ file thật. Thêm sàn/báo cáo mới là thêm một hồ sơ, không thêm nhánh rẽ. */
  var HO_SO = {
    TIKTOK_SE_THANH_TOAN: {
      ma: 'TIKTOK_SE_THANH_TOAN',
      ten_bao_cao: 'Sẽ thanh toán (Tài chính → Giao dịch → tab "Sẽ thanh toán")',
      ten_hien_thi: 'TikTok Shop', ma_gian: MA_GIAN, sheet_dich: TEN_SHEET_DICH,
      van_tay: {
        ten_sheet: 'Đơn hàng chưa quyết toán và kho',
        dong_tieu_de: 5,
        dong_du_lieu_dau: 6,
        so_cot_mong_doi: 76,                               // CẢNH BÁO, không chặn
        o_tong_giao_dich: { dong: 3, nhan: 'Tổng số giao dịch' },
        o_thoi_gian_tai: { dong: 2, nhan: 'Thời gian tải xuống' },
        cot_bat_buoc: [
          'ID đơn hàng/điều chỉnh', 'Ngày tạo đơn hàng', 'ID SKU', 'Tên SKU',
          'Tên sản phẩm', 'Số lượng', 'Tổng doanh thu', 'Tổng phụ trước giảm giá',
          'Giảm giá của người bán', 'Tổng phí',
          'Thuế GTGT do TikTok Shop khấu trừ', 'Thuế TNCN do TikTok Shop khấu trừ',
          'Số tiền quyết toán ước tính',
          'Tổng phụ hoàn tiền trước giảm giá của người bán', 'Khoản hoàn tiền giảm giá của người bán'
        ]
      },
      cot: {
        ma_don: 'ID đơn hàng/điều chỉnh',               // CHUỖI 18 chữ số
        ngay: 'Ngày tạo đơn hàng',                        // 'yyyy/MM/dd' — dự phòng khi Order Export không có RTS Time
        ten_tren_san: 'Tên sản phẩm',                     // → khoá Mapping cột "Tên trên Shopee"
        phan_loai: 'Tên SKU',                             // → khoá Mapping cột "Phân loại"
        ma_sku_ghi_chu: 'ID SKU',                         // chỉ để đối chiếu, KHÔNG phải khoá
        so_luong: 'Số lượng',
        doanh_thu: 'Tổng doanh thu',
        tien_truoc_giam: COT_TIEN.tien_truoc_giam, hoan_truoc_giam: COT_TIEN.hoan_truoc_giam,
        giam_gia_shop: COT_TIEN.giam_gia_shop, hoan_giam_gia_shop: COT_TIEN.hoan_giam_gia_shop,
        tong_phi: COT_TIEN.tong_phi, thue_gtgt: COT_TIEN.thue_gtgt, thue_tncn: COT_TIEN.thue_tncn,
        quyet_toan: 'Số tiền quyết toán ước tính',        // TỰ KIỂM
        loai_giao_dich: 'Loại giao dịch',                 // không bắt buộc: có thì chỉ nhận 'Đơn hàng'
        ly_do_chua_quyet_toan: 'Lý do chưa quyết toán'    // không bắt buộc: luật (b)
      },
      loai_giao_dich_don: 'Đơn hàng',
      ly_do_treo: [LY_DO_TRA_HANG],
      phi_va_giam_gia_mang_dau_am: true,
      phi_phan_bo_theo_dong: true,
      dinh_dang_ngay: 'yyyy/MM/dd',
      moi_o_la_chuoi: true,
      khoa_chong_trung: 'ma_don',
      gop_o_theo_cum_don: true,
      // D-87 (YC-56): cột A = RTS Time của Order Export ("ngày sắp xếp vận chuyển" — đo 49/49 khớp sổ tay; Ngày tạo đơn 11/49; cột
      // "Ngày vận chuyển đơn hàng" của báo cáo 2/49). Thiếu hẳn file Order Export → DỪNG. Đơn không có RTS → xem `thieu_rts`.
      ngay_ghi: 'RTS_ORDER_EXPORT',
      // Đơn không có trong Order Export (BA chốt) hoặc có mà RTS Time còn trống (chưa sắp xếp vận chuyển — dev xếp chung ca, chờ BA duyệt):
      // 'GHI_VANG' = vẫn ghi, cột A = Ngày tạo đơn, tô vàng + note · 'TREO' = không ghi, lượt sau ghi khi đã có RTS.
      thieu_rts: 'GHI_VANG',
      tieu_de_da_biet: TIEU_DE_A_15_9
    },

    TIKTOK_DA_QUYET_TOAN: {
      ma: 'TIKTOK_DA_QUYET_TOAN',
      ten_bao_cao: 'Đã quyết toán (Tài chính → Giao dịch → tab "Đã quyết toán")',
      ten_hien_thi: 'TikTok Shop', ma_gian: MA_GIAN, sheet_dich: TEN_SHEET_DICH,
      van_tay: {
        ten_sheet: 'Chi tiết đơn hàng',
        sheet_kem: ['Báo cáo', 'Lịch sử rút tiền', 'Giải thích về phí'],
        dong_tieu_de: 1,
        dong_du_lieu_dau: 2,
        so_cot_mong_doi: 67,
        cot_bat_buoc: [
          'ID đơn hàng/điều chỉnh', 'Loại giao dịch', 'Thời gian tạo đơn hàng', 'Tổng số tiền quyết toán',
          'Tổng phụ trước giảm giá', 'Giảm giá của người bán',
          'Tổng phụ hoàn tiền trước giảm giá của người bán', 'Khoản hoàn tiền giảm giá của người bán',
          'Tổng phí', 'Thuế GTGT do TikTok Shop khấu trừ', 'Thuế TNCN do TikTok Shop khấu trừ'
        ],
        // Bẫy 7 — đối chiếu tổng của chính báo cáo (sheet "Báo cáo"): cộng MỌI dòng "Chi tiết đơn hàng" (kể cả dòng quảng cáo).
        doi_chieu_bao_cao: { sheet: 'Báo cáo', o: [['Tổng số tiền quyết toán', 'quyet_toan'], ['Tổng phụ trước giảm giá', 'tien_truoc_giam']] }
      },
      cot: {
        ma_don: 'ID đơn hàng/điều chỉnh', loai_giao_dich: 'Loại giao dịch', ngay: 'Thời gian tạo đơn hàng',
        quyet_toan: 'Tổng số tiền quyết toán',
        tien_truoc_giam: COT_TIEN.tien_truoc_giam, hoan_truoc_giam: COT_TIEN.hoan_truoc_giam,
        giam_gia_shop: COT_TIEN.giam_gia_shop, hoan_giam_gia_shop: COT_TIEN.hoan_giam_gia_shop,
        tong_phi: COT_TIEN.tong_phi, thue_gtgt: COT_TIEN.thue_gtgt, thue_tncn: COT_TIEN.thue_tncn
      },
      loai_giao_dich_don: 'Đơn hàng',                    // bỏ 36 dòng "GMV thanh toán cho Quảng cáo TikTok"
      tao_dong_moi: false,                                // KHÔNG BAO GIỜ: không có ID SKU / Số lượng / Tên sản phẩm
      // INV-1b (D-81) — cập nhật 4 ô H I J K của đơn DO TOOL GHI. HOÃN SANG ĐỢT 5 (D-88). Công tắc TẮT.
      cap_nhat_tien_inv1b: false
    },

    TIKTOK_ORDER_EXPORT: {
      ma: 'TIKTOK_ORDER_EXPORT',
      ten_bao_cao: 'Tất cả đơn hàng (Đơn hàng → Xuất)',
      van_tay: {
        ten_sheet: 'OrderSKUList', dong_tieu_de: 1, dong_du_lieu_dau: 3,
        cot_bat_buoc: ['Order ID', 'RTS Time', 'SKU ID', 'Product Name', 'Variation', 'Quantity']
      },
      // CHỈ đọc hai cột. File có 10 cột người mua (Recipient, Phone #, địa chỉ…) — không cột nào được lấy ra khỏi bảng (INV-4).
      cot: { ma_don: 'Order ID', rts: 'RTS Time', trang_thai: 'Order Status' },
      dinh_dang_ngay: 'dd/MM/yyyy HH:mm:ss'
    }
  };

  /** Tên sheet dữ liệu của file xuất Shopee — chỉ để NHẬN RA thả nhầm sàn. */
  var TEN_SHEET_SHOPEE = 'orders';

  // ---------------------------------------------------------------- tiện ích

  function tenCot(s) { return Utils.nfc(s).replace(/\s+/g, ' ').trim(); }

  function chiMuc(dongTieuDe) {
    var m = {};
    (dongTieuDe || []).forEach(function (t, i) { var k = tenCot(t); if (k && !(k in m)) m[k] = i; });
    return m;
  }

  function loi(ma, cau) { var e = new Error(cau); e.maKeodon = ma; return e; }

  /** Bẫy 2: số nguyên CHẶT từ ô báo cáo. Ô số của Excel (file bị mở-lưu) vẫn nhận nếu là số nguyên. */
  function soNguyen(v, ten, soDong) {
    if (typeof v === 'number' && isFinite(v) && Math.floor(v) === v) return v;
    var s = Utils.nfc(v == null ? '' : v).trim();
    if (/^[+-]?\d+$/.test(s)) return Number(s);
    throw loi('SO_KHONG_HOP_LE', 'Dòng ' + soDong + ', cột "' + ten + '": "' + s.slice(0, 30) + '" không phải số nguyên — báo cáo TikTok ghi ' +
      'tiền là chuỗi chữ số, không có dấu phân cách, không số lẻ. File có thể đã bị mở rồi lưu lại bằng Excel: xuất lại từ TikTok.');
  }

  /** Bẫy 1: mã đơn giữ CHUỖI. Ô đã là SỐ nghĩa là đã mất chính xác — dừng, không đoán lại. */
  function maDon(v, soDong) {
    if (typeof v === 'number') {
      throw loi('MA_DON_THANH_SO', 'Dòng ' + soDong + ': mã đơn đã bị đổi thành SỐ (' + v + ') — mã TikTok 18 chữ số mất chính xác khi thành số và ' +
        'sinh mã trùng. Xuất lại từ TikTok và thả thẳng vào thư mục, ĐỪNG mở rồi lưu bằng Excel. Tool chưa ghi gì.');
    }
    return Utils.nfc(v == null ? '' : v).trim();
  }

  /** Bẫy 6: 'yyyy/MM/dd' → 'yyyy-MM-dd' (chuỗi — vỏ Google dựng nửa đêm theo múi giờ của sổ, `ngayThat_` 2.7.2). */
  function ngayYMD(v, ten, soDong) {
    var s = Utils.nfc(v == null ? '' : v).trim();
    var m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) {
      throw loi('NGAY_KHONG_HOP_LE', 'Dòng ' + soDong + ', cột "' + ten + '": "' + s.slice(0, 30) + '" không đúng dạng yyyy/MM/dd của báo cáo ' +
        'TikTok. File có thể đã bị mở rồi lưu lại bằng Excel: xuất lại từ TikTok.');
    }
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  /** Bẫy 6: 'dd/MM/yyyy HH:mm:ss' (Order Export) → 'yyyy-MM-dd'; ô trống → '' (chưa sắp xếp vận chuyển). Giờ bỏ, ngày giữ nguyên như file. */
  function ngayDMYGio(v, ten, soDong) {
    var s = Utils.nfc(v == null ? '' : v).trim();
    if (!s) return '';
    var m = /^(\d{2})\/(\d{2})\/(\d{4})(?: \d{2}:\d{2}(?::\d{2})?)?$/.exec(s);
    if (!m || +m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) {
      throw loi('NGAY_KHONG_HOP_LE', 'Dòng ' + soDong + ', cột "' + ten + '": "' + s.slice(0, 30) + '" không đúng dạng dd/MM/yyyy HH:mm:ss của ' +
        'file Tất cả đơn hàng. File có thể đã bị mở rồi lưu lại bằng Excel: xuất lại từ TikTok.');
    }
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  function o(bang, dong, cot) { var h = bang[dong - 1]; return h ? h[cot] : undefined; }

  /** Bốn cột H/I/J/K của MỘT dòng theo công thức chốt. `ci` = chỉ số cột, `c` = tên cột (để báo lỗi). */
  function tienDong(h, ci, c, r) {
    var n = function (k) { return soNguyen(h[ci[k]], c[k], r); };
    var G = n('thue_gtgt'), T = n('thue_tncn');
    var K = -(G + T);
    return {
      H: n('tien_truoc_giam') + n('hoan_truoc_giam'),
      hoan: n('hoan_truoc_giam'),
      I: -(n('giam_gia_shop') + n('hoan_giam_gia_shop')),
      K: K,
      J: -n('tong_phi') - K,
      thueDuong: G > 0 || T > 0
    };
  }

  // ---------------------------------------------------------------- NHẬN DIỆN (YC-50)

  /**
   * Nhận diện một workbook bằng TÊN SHEET + TẬP CỘT BẮT BUỘC — không tin tên thư mục.
   * @param {string[]} dsSheet  tên các sheet
   * @param {function(string):Array[]} layBang  tên sheet → bảng 2 chiều ĐỦ dòng (vỏ đã dò lại vùng dữ liệu)
   * @returns {{loai, hoSo, tenSheet, thieuCot: string[], cotLa: string[], soCot: number, canhBao: string[]}}
   *   loai ∈ TIKTOK_SE_THANH_TOAN · TIKTOK_DA_QUYET_TOAN · TIKTOK_ORDER_EXPORT · SHOPEE · KHONG_RO
   */
  function nhanDien(dsSheet, layBang) {
    var ten = (dsSheet || []).map(function (t) { return tenCot(t); });
    var co = function (t) { return ten.indexOf(tenCot(t)) >= 0; };
    var thuTu = ['TIKTOK_SE_THANH_TOAN', 'TIKTOK_DA_QUYET_TOAN', 'TIKTOK_ORDER_EXPORT'];
    for (var i = 0; i < thuTu.length; i++) {
      var hs = HO_SO[thuTu[i]], vt = hs.van_tay;
      if (!co(vt.ten_sheet)) continue;
      var bang = layBang(dsSheet[ten.indexOf(tenCot(vt.ten_sheet))]) || [];
      var tieuDe = (bang[vt.dong_tieu_de - 1] || []).map(tenCot);
      var cm = chiMuc(tieuDe);
      var thieu = vt.cot_bat_buoc.filter(function (c) { return !(tenCot(c) in cm); });
      var soCot = tieuDe.filter(function (t) { return t; }).length;
      var canhBao = [], cotLa = [];
      if (hs.tieu_de_da_biet) {
        var biet = {};
        hs.tieu_de_da_biet.forEach(function (t) { biet[tenCot(t)] = 1; });
        cotLa = tieuDe.filter(function (t) { return t && !biet[t]; });
      }
      if (vt.so_cot_mong_doi && soCot !== vt.so_cot_mong_doi) {
        canhBao.push('Báo cáo có ' + soCot + ' cột, khác ' + vt.so_cot_mong_doi + ' cột lúc đo (15/9)' +
          (cotLa.length ? '; cột lạ: ' + cotLa.slice(0, 5).map(function (t) { return '"' + t + '"'; }).join(', ') + (cotLa.length > 5 ? '…' : '') : '') +
          ' — TikTok có thể đã thêm/bớt cột. Tool VẪN ĐỌC theo tên cột.');
      } else if (cotLa.length) {
        canhBao.push('Báo cáo có cột lạ: ' + cotLa.slice(0, 5).map(function (t) { return '"' + t + '"'; }).join(', ') + ' — tool vẫn đọc theo tên cột.');
      }
      return { loai: hs.ma, hoSo: hs, tenSheet: dsSheet[ten.indexOf(tenCot(vt.ten_sheet))], thieuCot: thieu, cotLa: cotLa, soCot: soCot, canhBao: canhBao };
    }
    if (co(TEN_SHEET_SHOPEE)) return { loai: 'SHOPEE', hoSo: null, tenSheet: TEN_SHEET_SHOPEE, thieuCot: [], cotLa: [], soCot: 0, canhBao: [] };
    return { loai: 'KHONG_RO', hoSo: null, tenSheet: '', thieuCot: [], cotLa: [], soCot: 0, canhBao: [] };
  }

  /** Tên sheet nào chứng tỏ workbook là báo cáo TikTok — vỏ soát file TikTok bị thả vào thư mục Shopee (chỉ đọc tên sheet). */
  function laSheetTikTok(dsSheet) {
    var ten = (dsSheet || []).map(tenCot);
    return ['TIKTOK_SE_THANH_TOAN', 'TIKTOK_DA_QUYET_TOAN', 'TIKTOK_ORDER_EXPORT'].some(function (k) {
      return ten.indexOf(tenCot(HO_SO[k].van_tay.ten_sheet)) >= 0;
    });
  }

  /** Câu chặn khi thiếu cột bắt buộc — in đúng tên cột bằng tiếng Việt như trong báo cáo (YC-50). */
  function cauThieuCot(nd, tenFile) {
    return 'File "' + tenFile + '" là báo cáo ' + nd.hoSo.ten_bao_cao + ' nhưng THIẾU ' + nd.thieuCot.length + ' cột bắt buộc: ' +
      nd.thieuCot.map(function (c) { return '"' + c + '"'; }).join(', ') + '. TikTok có thể đã đổi tên cột — báo người phụ trách sửa hồ sơ sàn ' +
      '(src/adapters/AdapterTikTok.gs). Tool chưa ghi gì, file nằm nguyên chỗ cũ.';
  }

  function chiSoCot_(bang, hs, tenFile) {
    var vt = hs.van_tay;
    var cm = chiMuc(bang[vt.dong_tieu_de - 1] || []);
    var thieu = vt.cot_bat_buoc.filter(function (t) { return !(tenCot(t) in cm); });
    if (thieu.length) throw loi('THIEU_COT', cauThieuCot({ hoSo: hs, thieuCot: thieu }, tenFile));
    var ci = {};
    Object.keys(hs.cot).forEach(function (k) { ci[k] = cm[tenCot(hs.cot[k])]; });
    return ci;
  }

  // ---------------------------------------------------------------- A: SẼ THANH TOÁN → ĐƠN CHUẨN (YC-49)

  /**
   * @param {Array[]} bang   sheet "Đơn hàng chưa quyết toán và kho", ĐỦ dòng (dòng 0 = dòng 1 của file)
   * @param {Object} nguon   { tenFile }
   * @param {Object} [hoSo]  mặc định HO_SO.TIKTOK_SE_THANH_TOAN (test truyền bản sửa để dựng đối chứng âm)
   * @returns ĐƠN CHUẨN: { hoSo, tenFile, soDongDoc, soDonDoc, tongGiaoDichKhai, thoiGianTai,
   *   don: [{maDon, ngay:'yyyy-MM-dd' (ngày tạo), tien:{H,I,J,K}, quyetToan, lyDo, dong:[{tenListing, tenPhanLoai, soLuong, idSku, H, I, J, K, Q}]}],
   *   boQua: [{maDon, ma, chiTiet, dong}], loiTuKiem: [{maDon, chiTiet}], dongTho: [{maDon, soDong, ngay, H, I, J, K, Q}], canhBao, thongBao }
   *   `don` chỉ gồm đơn GHI ĐƯỢC, xếp theo ngày tạo tăng dần (trong một ngày: đơn cũ trước — file TikTok liệt kê mới nhất trước).
   *   `loiTuKiem` KHÁC RỖNG thì vỏ PHẢI dừng (`kiemTuKiem`) — không ghi đơn nào.
   */
  function docSeThanhToan(bang, nguon, hoSo) {
    var hs = hoSo || HO_SO.TIKTOK_SE_THANH_TOAN, vt = hs.van_tay, c = hs.cot;
    var tenFile = (nguon && nguon.tenFile) || '(không rõ tên file)';
    var ci = chiSoCot_(bang, hs, tenFile);
    var kq = { hoSo: hs, tenFile: tenFile, soDongDoc: 0, soDonDoc: 0, tongGiaoDichKhai: null, thoiGianTai: null,
      don: [], boQua: [], loiTuKiem: [], dongTho: [], canhBao: [], thongBao: [] };

    // Ô khai của chính báo cáo (dòng 2 "Thời gian tải xuống", dòng 3 "Tổng số giao dịch") — tìm theo NHÃN ở cột A.
    [['o_tong_giao_dich', 'tongGiaoDichKhai'], ['o_thoi_gian_tai', 'thoiGianTai']].forEach(function (x) {
      var d = vt[x[0]];
      if (!d) return;
      if (tenCot(o(bang, d.dong, 0)) === tenCot(d.nhan)) kq[x[1]] = o(bang, d.dong, 1);
    });

    var theoDon = {}, thuTu = [];
    for (var r = vt.dong_du_lieu_dau; r <= bang.length; r++) {
      var h = bang[r - 1];
      if (Utils.laDongRong(h)) continue;
      kq.soDongDoc++;
      var ma = maDon(h[ci.ma_don], r);
      if (!ma) { kq.canhBao.push('Dòng ' + r + ': không có mã đơn → bỏ qua dòng này'); continue; }
      if (!/^\d{15,20}$/.test(ma)) throw loi('MA_DON_LA', 'Dòng ' + r + ': mã đơn "' + ma.slice(0, 30) + '" không phải chuỗi chữ số của TikTok. Tool chưa ghi gì.');
      var t = tienDong(h, ci, c, r);
      var dong = {
        soDong: r,
        tenListing: tenCot(h[ci.ten_tren_san]),
        tenPhanLoai: tenCot(h[ci.phan_loai]),           // khoảng trắng thừa cuối chuỗi ("…in 2 mặt áo ") cắt ở đây
        idSku: Utils.nfc(h[ci.ma_sku_ghi_chu] == null ? '' : h[ci.ma_sku_ghi_chu]).trim(),
        soLuong: soNguyen(h[ci.so_luong], c.so_luong, r),
        H: t.H, I: t.I, J: t.J, K: t.K, hoan: t.hoan, thueDuong: t.thueDuong,
        Q: soNguyen(h[ci.quyet_toan], c.quyet_toan, r),
        ngay: ngayYMD(h[ci.ngay], c.ngay, r),
        loai: ci.loai_giao_dich != null ? tenCot(h[ci.loai_giao_dich]) : hs.loai_giao_dich_don,
        lyDo: ci.ly_do_chua_quyet_toan != null ? tenCot(h[ci.ly_do_chua_quyet_toan]) : ''
      };
      kq.dongTho.push({ maDon: ma, soDong: r, ngay: dong.ngay, H: dong.H, I: dong.I, J: dong.J, K: dong.K, Q: dong.Q });
      if (!theoDon[ma]) { theoDon[ma] = []; thuTu.push(ma); }
      theoDon[ma].push(dong);
    }
    kq.soDonDoc = thuTu.length;

    // Bẫy 7: đối chiếu với số khai của chính báo cáo. Lệch = đọc hụt (vùng <dimension> sai) hoặc file bị cắt → DỪNG.
    if (kq.tongGiaoDichKhai !== null && kq.tongGiaoDichKhai !== '' && kq.tongGiaoDichKhai !== undefined) {
      var khai = Number(String(kq.tongGiaoDichKhai).trim());
      if (isFinite(khai) && khai !== kq.soDongDoc) {
        throw loi('DOC_HUT', 'SỐ DÒNG ĐỌC ĐƯỢC KHÔNG KHỚP Ô "TỔNG SỐ GIAO DỊCH" — File "' + tenFile + '": báo cáo khai "' + vt.o_tong_giao_dich.nhan + '" = ' + khai + ' nhưng tool đọc được ' + kq.soDongDoc +
          ' dòng. Tool KHÔNG ghi gì khi chưa đọc đủ — gửi file cho người phụ trách.');
      }
    }

    var LOAI_DON = tenCot(hs.loai_giao_dich_don);
    var LY_DO_TREO = (hs.ly_do_treo || []).map(tenCot);
    thuTu.forEach(function (ma, viTri) {
      var ds = theoDon[ma];
      var t = { H: 0, I: 0, J: 0, K: 0 }, Q = 0;
      ds.forEach(function (d) { t.H += d.H; t.I += d.I; t.J += d.J; t.K += d.K; Q += d.Q; });
      var boQua = function (maLyDo, chiTiet) { kq.boQua.push({ maDon: ma, ma: maLyDo, chiTiet: chiTiet, dong: ds }); };
      var khac = ds.filter(function (d) { return d.loai !== LOAI_DON; })[0];
      if (khac) return boQua('KHONG_PHAI_DON_HANG', 'Loại giao dịch "' + khac.loai + '"');
      var treo = ds.filter(function (d) { return LY_DO_TREO.indexOf(d.lyDo) >= 0; })[0];
      if (treo) return boQua('TREO_TRA_HANG', '"' + treo.lyDo + '" — treo, không ghi; nếu khách không trả hàng đơn sẽ về báo cáo Đã quyết toán');
      if (ds.every(function (d) { return d.H === 0; })) {
        return boQua('KHONG_PHAI_DON_BAN', 'H ròng = 0' + (ds.some(function (d) { return d.hoan !== 0; }) ? ' (đã hoàn tiền toàn bộ)' : '') +
          (Q !== 0 ? ', quyết toán ' + Q : '') + (ds[0].lyDo ? ' · ' + ds[0].lyDo : '') + ' — đơn hủy / hoàn, không có hàng bán');
      }
      if (ds.some(function (d) { return d.H === 0 || d.hoan !== 0; })) {
        return boQua('TREO_HOAN_MOT_PHAN', 'đơn có khoản hoàn một phần — số lượng bán thật không suy được từ báo cáo, treo, không ghi');
      }
      if (ds.some(function (d) { return d.Q === 0; })) {
        return boQua('CHO_TINH_PHI', 'Số tiền quyết toán ước tính = 0 — TikTok chưa tính phí, lượt sau ghi');
      }
      if (ds.some(function (d) { return d.thueDuong; }) || t.I < 0 || t.J < 0 || t.K < 0) {
        kq.loiTuKiem.push({ maDon: ma, chiTiet: 'sau khi đổi dấu MGG Shop ' + t.I + ' · Chi phí ' + t.J + ' · Thuế ' + t.K + ' — có khoản dương bất thường' });
        return;
      }
      if (t.H - t.I - t.J - t.K !== Q) {
        kq.loiTuKiem.push({ maDon: ma, chiTiet: 'H − I − J − K = ' + (t.H - t.I - t.J - t.K) + ' ≠ quyết toán ' + Q });
        return;
      }
      kq.don.push({
        maDon: ma, ngay: ds[0].ngay, viTriFile: viTri, tien: t, quyetToan: Q, lyDo: ds[0].lyDo,
        dong: ds.map(function (d) { return { tenListing: d.tenListing, tenPhanLoai: d.tenPhanLoai, soLuong: d.soLuong, idSku: d.idSku, H: d.H, I: d.I, J: d.J, K: d.K, Q: d.Q }; })
      });
    });
    // Ngày tạo tăng dần; cùng ngày thì đơn đứng SAU trong file (cũ hơn) lên trước.
    kq.don.sort(function (a, b) { return a.ngay < b.ngay ? -1 : a.ngay > b.ngay ? 1 : b.viTriFile - a.viTriFile; });
    return kq;
  }

  /** Luật chốt: lệch tự kiểm MỘT ĐỒNG (hoặc khoản dương bất thường) là DỪNG cả phần TikTok, không ghi đơn nào. */
  function kiemTuKiem(dcn) {
    var ds = (dcn && dcn.loiTuKiem) || [];
    if (!ds.length) return;
    throw loi('TU_KIEM_LECH', 'TU_KIEM_LECH — Báo cáo "' + dcn.tenFile + '": ' + ds.length + ' đơn KHÔNG khớp công thức H − I − J − K = số tiền quyết toán: ' +
      ds.slice(0, 5).map(function (x) { return x.maDon + ' (' + x.chiTiet + ')'; }).join('; ') + (ds.length > 5 ? ' …' : '') +
      '. TikTok có thể đã đổi cách ghi tiền. Tool DỪNG, KHÔNG ghi đơn nào — gửi file cho người phụ trách.');
  }

  /**
   * ĐƠN CHUẨN → dòng theo "hợp đồng với lớp 2" (lược đồ ở đầu `AdapterFileXuat.gs`) để lõi Shopee tra Mapping, nổ cấu phần, khử trùng.
   * MGG Shop và Chi phí đặt CÙNG một số (của cả đơn) trên mọi dòng: lõi lấy một lần cho đơn. Tiền lõi tự tính KHÔNG được dùng — vỏ đè bằng
   * `don.tien` trước khi ghi (thuế TikTok làm tròn chẵn, lõi làm tròn lên).
   */
  function sangDongLop1(dcn) {
    var dong = [];
    (dcn.don || []).forEach(function (d) {
      d.dong.forEach(function (x, i) {
        dong.push({
          san: 'TIKTOK', maGianHang: MA_GIAN, maDonSan: d.maDon, ngayDat: null, trangThai: 'KHAC', trangThaiRaw: '',
          skuSan: x.idSku, tenListing: x.tenListing, tenPhanLoai: x.tenPhanLoai, soLuongListing: x.soLuong,
          donGia: null, tienKhachTra: x.H, giamGiaShop: d.tien.I, giamGiaSan: 0, phiSan: d.tien.J,
          sttDongTrongDon: i + 1, soDongTrongDon: d.dong.length, tenFileNguon: dcn.tenFile
        });
      });
    });
    return dong;
  }

  // ---------------------------------------------------------------- C: TẤT CẢ ĐƠN HÀNG → RTS Time (YC-56, D-87)

  /**
   * @param {Array[]} bang       sheet OrderSKUList, ĐỦ dòng
   * @param {Object} nguon       { tenFile }
   * @param {number} [soDongKhai] số dòng vùng `<dimension>` / `!ref` của file — bẫy 7: đọc được ÍT hơn vùng khai là DỪNG
   * @returns {{soDongDoc, soDon, theoMa: {maDon: {rts:'yyyy-MM-dd'|'', trangThai}}, canhBao: []}}
   */
  function docOrderExport(bang, nguon, soDongKhai) {
    var hs = HO_SO.TIKTOK_ORDER_EXPORT, vt = hs.van_tay, c = hs.cot;
    var tenFile = (nguon && nguon.tenFile) || '(không rõ tên file)';
    var ci = chiSoCot_(bang, hs, tenFile);
    if (soDongKhai != null && bang.length < Number(soDongKhai)) {
      throw loi('DOC_HUT', 'File "' + tenFile + '": vùng dữ liệu khai ' + soDongKhai + ' dòng nhưng tool đọc được ' + bang.length + ' dòng. Tool KHÔNG ghi gì.');
    }
    var kq = { soDongDoc: 0, soDon: 0, theoMa: {}, canhBao: [] };
    for (var r = vt.dong_du_lieu_dau; r <= bang.length; r++) {
      var h = bang[r - 1];
      if (Utils.laDongRong(h)) continue;
      var ma = maDon(h[ci.ma_don], r);
      if (!ma) continue;
      kq.soDongDoc++;
      var rts = ngayDMYGio(h[ci.rts], c.rts, r);
      var x = kq.theoMa[ma];
      if (!x) { kq.theoMa[ma] = { rts: rts, trangThai: ci.trang_thai != null ? tenCot(h[ci.trang_thai]) : '' }; kq.soDon++; continue; }
      if (rts && x.rts && rts !== x.rts) kq.canhBao.push('Đơn ' + ma + ': RTS Time khác nhau giữa các dòng (' + x.rts + ' / ' + rts + ') → lấy ngày đầu');
      if (!x.rts && rts) x.rts = rts;
    }
    if (kq.soDongDoc === 0) throw loi('DOC_HUT', 'File "' + tenFile + '": không đọc được dòng đơn nào từ dòng ' + vt.dong_du_lieu_dau + '. Tool KHÔNG ghi gì.');
    return kq;
  }

  // ---------------------------------------------------------------- B: ĐÃ QUYẾT TOÁN (YC-54 — chỉ đọc, Đợt 5 mới cập nhật)

  /**
   * Đọc báo cáo "Đã quyết toán" ra tổng theo ĐƠN (công thức chốt), lọc `Loại giao dịch` = Đơn hàng. KHÔNG tạo dòng, KHÔNG cập nhật ô nào.
   * @param {Array[]} [bangBaoCao]  sheet "Báo cáo" — đối chiếu tổng (bẫy 7): cộng MỌI dòng chi tiết phải bằng ô tổng. Lệch → DỪNG.
   */
  function docDaQuyetToan(bang, nguon, hoSo, bangBaoCao) {
    var hs = hoSo || HO_SO.TIKTOK_DA_QUYET_TOAN, vt = hs.van_tay, c = hs.cot;
    var tenFile = (nguon && nguon.tenFile) || '(không rõ tên file)';
    var ci = chiSoCot_(bang, hs, tenFile);
    var kq = { soDongDoc: 0, soDongDonHang: 0, soDongKhac: 0, loaiKhac: {}, don: [], doiChieu: [], canhBao: [] };
    var tong = {};
    var theo = {}, thuTu = [];
    for (var r = vt.dong_du_lieu_dau; r <= bang.length; r++) {
      var h = bang[r - 1];
      if (Utils.laDongRong(h)) continue;
      kq.soDongDoc++;
      (vt.doi_chieu_bao_cao ? vt.doi_chieu_bao_cao.o : []).forEach(function (x) { tong[x[1]] = (tong[x[1]] || 0) + soNguyen(h[ci[x[1]]], c[x[1]], r); });
      var loai = tenCot(h[ci.loai_giao_dich]);
      if (loai !== tenCot(hs.loai_giao_dich_don)) { kq.soDongKhac++; kq.loaiKhac[loai] = (kq.loaiKhac[loai] || 0) + 1; continue; }
      kq.soDongDonHang++;
      var ma = maDon(h[ci.ma_don], r);
      var t = tienDong(h, ci, c, r);
      t.Q = soNguyen(h[ci.quyet_toan], c.quyet_toan, r);
      if (!theo[ma]) { theo[ma] = []; thuTu.push(ma); }
      theo[ma].push(t);
    }
    if (bangBaoCao && vt.doi_chieu_bao_cao) {
      vt.doi_chieu_bao_cao.o.forEach(function (x) {
        var nhan = tenCot(x[0]), gt = null;
        for (var i = 0; i < bangBaoCao.length && gt === null; i++) {
          var hang = bangBaoCao[i] || [];
          var j = hang.map(tenCot).indexOf(nhan);
          if (j < 0) continue;
          for (var k = hang.length - 1; k > j; k--) { if (tenCot(hang[k]) !== '') { gt = soNguyen(hang[k], vt.doi_chieu_bao_cao.sheet + ' · ' + x[0], i + 1); break; } }
        }
        if (gt === null) throw loi('DOC_HUT', 'File "' + tenFile + '": sheet "' + vt.doi_chieu_bao_cao.sheet + '" không có ô "' + x[0] + '" để đối chiếu. Tool KHÔNG dùng file này.');
        kq.doiChieu.push({ nhan: x[0], khai: gt, cong: tong[x[1]] || 0 });
        if (gt !== (tong[x[1]] || 0)) {
          throw loi('DOC_HUT', 'File "' + tenFile + '": sheet "' + vt.doi_chieu_bao_cao.sheet + '" khai "' + x[0] + '" = ' + gt + ' nhưng cộng ' + kq.soDongDoc +
            ' dòng chi tiết ra ' + (tong[x[1]] || 0) + '. Tool KHÔNG dùng file này khi chưa đọc đủ.');
        }
      });
    }
    thuTu.forEach(function (ma) {
      var t = { H: 0, I: 0, J: 0, K: 0 }, Q = 0;
      theo[ma].forEach(function (x) { t.H += x.H; t.I += x.I; t.J += x.J; t.K += x.K; Q += x.Q; });
      kq.don.push({ maDon: ma, soDongQuyetToan: theo[ma].length, tien: t, quyetToan: Q, khopTuKiem: t.H - t.I - t.J - t.K === Q });
    });
    return kq;
  }

  return {
    MA_GIAN: MA_GIAN,
    TEN_SHEET_DICH: TEN_SHEET_DICH,
    LY_DO_TRA_HANG: LY_DO_TRA_HANG,
    HO_SO: HO_SO,
    TEN_SHEET_SHOPEE: TEN_SHEET_SHOPEE,
    nhanDien: nhanDien,
    laSheetTikTok: laSheetTikTok,
    cauThieuCot: cauThieuCot,
    docSeThanhToan: docSeThanhToan,
    kiemTuKiem: kiemTuKiem,
    sangDongLop1: sangDongLop1,
    docOrderExport: docOrderExport,
    docDaQuyetToan: docDaQuyetToan
  };
})();
