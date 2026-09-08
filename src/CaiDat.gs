/**
 * CaiDat.gs — DỮ LIỆU cấu hình mặc định của tool (không phải mã xử lý).
 *
 * Bản v1 để cấu hình trong một sheet `CAU_HINH` nằm trong file tracking. GV-v2.2 mục 3 chốt: **tool chỉ được thêm
 * đúng một sheet `Mapping sản phẩm`** vào file của chủ dự án → cấu hình chuyển về đây, và ghi đè được bằng
 * `03_VAN_HANH/CAU_HINH_VAN_HANH.json` (khóa `cau_hinh`) khi cần sửa mà không đụng mã.
 *
 * Tên cột file xuất là sự thật đã kiểm chứng trên file thật (Context 5.1–5.3), sửa ở đây khi Shopee đổi tên cột.
 */
var CaiDat = (function () {

  function cauHinhMacDinh() {
    return {
      chung: {
        ten_sheet_du_lieu: 'orders',            // Context 5.3: sheet đầu `Advance Fulfilment` rỗng — phải tìm theo TÊN
        che_do_cong_thuc: 'EXCEL',              // EXCEL: kéo E,F,L,M,N | SHEET: E,F,M,N là ARRAYFORMULA, chỉ kéo L
        thue_gtgt_pct: 1,                       // Nghị định 117/2025 — sàn khấu trừ 1% GTGT
        thue_tncn_pct: 0.5,                     // + 0,5% TNCN
        thue_cach_tinh: 'TACH_ROI_CONG',        // làm tròn từng sắc thuế rồi cộng (khớp 713/719 dòng tháng 8)
        thue_theo_dong: true,                   // đơn nhiều dòng: làm tròn theo TỪNG DÒNG rồi cộng (khớp 392/393 đơn nhân viên gõ);
                                                // false = làm tròn một lần trên cả đơn theo câu chữ Context 5.2 (khớp 391/393)
        bo_don_huy_hoan: true,                  // file tab "Tất cả" → bỏ đơn hủy/hoàn trước khi xử lý (GV-v2.2 mục 1.1)
        canh_bao_gian_hang_la: true             // file thả nhầm thư mục gian hàng → dừng và báo (Context 9.3)
      },

      /** Mã gian hàng ↔ tên sheet trong file tracking (Context 4.1). Tên hiển thị dùng khi ghi cột B (mặc định tắt). */
      gianHang: {
        SP_MALL:   { ten: 'Shopee mall', sheet: 'Shopee mall' },
        SP_OFFOOD: { ten: 'Shopee O',    sheet: 'Offood' },
        SP_IMPORT: { ten: 'Importmart',  sheet: 'Importmart' },
        SP_BABYIU: { ten: 'Babyiu',      sheet: 'Babyiu' }
      },

      /** Bố cục sheet gian hàng — đo trên file thật, giống hệt nhau ở cả 4 sheet (Context 4.1). */
      keyin: {
        dong_header: 2, dong_tong: 3, dong_dau: 4,
        cot_ngay: 'A', cot_nguon_don: 'B', cot_ma_don: 'C', cot_ten_viet_tat: 'D',
        cot_so_luong: 'G', cot_tong_tien_sp: 'H', cot_mgg_shop: 'I', cot_chi_phi: 'J', cot_thue: 'K',
        cot_doanh_thu: 'L',
        cot_cong_thuc: 'E,F,L,M,N',             // chỉ dùng ở chế độ EXCEL
        cot_note: '',                           // trống = tự dò cột trống đầu tiên sau tiêu đề cuối (Shopee mall → P, Offood → S)
        tieu_de_note: 'Note',
        ghi_nguon_don: false,                   // Context 4.1: cột B đang trống 747/747 dòng → tool cũng để trống
        ten_sheet_tong_xuat: 'Tổng xuất',
        nguong_sap_het: 50,
        dinh_dang_ngay: 'd/m/yyyy',
        dinh_dang_tien: '#,##0'
      },

      /** Sheet danh mục kho — nguồn của tên viết tắt, mã hàng và tồn (để chọn lô). */
      danhMuc: SCHEMA.DANH_MUC,

      /**
       * Tên cột trong file xuất Shopee (NGUYÊN VĂN, phân biệt hoa/thường; so sau chuẩn hóa NFC).
       * Một trường có nhiều cột → adapter CỘNG lại (ví dụ ba loại phí).
       */
      cot: {
        maDonSan: ['Mã đơn hàng'],
        ngayDat: ['Ngày đặt hàng'],
        trangThai: ['Trạng Thái Đơn Hàng'],
        trangThaiHoan: ['Trạng thái Trả hàng/Hoàn tiền'],
        lyDoHuy: ['Lý do hủy'],                 // CHỈ có ở file tab "Tất cả" → dùng để nhận loại file
        skuSan: ['SKU phân loại hàng'],
        skuSanPham: ['SKU sản phẩm'],
        tenListing: ['Tên sản phẩm'],
        tenPhanLoai: ['Tên phân loại hàng'],
        soLuongListing: ['Số lượng'],
        donGia: ['Giá ưu đãi'],                 // tiêu đề này trong file ở dạng tách dấu thanh — tra sau NFC
        tienKhachTra: ['Tổng số tiền Người mua thanh toán'],   // CHỮ N HOA — cột cấp dòng
        giamGiaShop: ['Mã giảm giá của Shop'],
        giamGiaSan: ['Mã giảm giá của Shopee'],                // tham khảo — Shopee bù cho shop, KHÔNG trừ
        phiSan: ['Phí cố định', 'Phí Dịch Vụ', 'Phí xử lý giao dịch']
      },

      cotBatBuoc: ['maDonSan', 'ngayDat', 'trangThai', 'tenListing', 'soLuongListing', 'tienKhachTra', 'giamGiaShop', 'phiSan'],

      /**
       * Trạng thái nguồn → chuẩn. Khóa kết thúc bằng '*' = so theo TIỀN TỐ (Context 5.3: 17 biến thể chuỗi dài kèm ngày).
       * Nguồn chính là tab "Chờ lấy hàng" nên chỉ gặp vài giá trị; phần còn lại để đọc được file tab "Tất cả".
       */
      trangThai: {
        'Chờ xác nhận': 'CHO_XAC_NHAN',
        'Chờ giao hàng': 'CHO_LAY_HANG',
        'Chờ lấy hàng': 'CHO_LAY_HANG',
        'Đang giao': 'DANG_GIAO',
        'Đang giao hàng': 'DANG_GIAO',
        'Đã giao': 'DA_GIAO',
        'Hoàn thành': 'DA_GIAO',
        'Người mua xác nhận đã nhận được hàng*': 'DA_GIAO',
        'Đã hủy': 'DA_HUY',
        'Đã huỷ': 'DA_HUY',
        'Trả hàng/Hoàn tiền': 'DANG_HOAN',
        'Đã hoàn tiền': 'DA_HOAN',
        'Giao hàng không thành công': 'THAT_BAI',
        'Giao hàng thất bại': 'THAT_BAI'
      },

      /** Cột `Trạng thái Trả hàng/Hoàn tiền` — có giá trị thì GHI ĐÈ trạng thái chính (Context 5.3). */
      trangThaiHoan: {
        'Đã Chấp Thuận Yêu Cầu': 'DA_HOAN',
        'Đang xử lý': 'DANG_HOAN',
        'Đang yêu cầu': 'DANG_HOAN'
      },

      /** Trạng thái bị bỏ khi đọc file tab "Tất cả" (GV-v2.2 mục 1.1). Tab "Chờ lấy hàng" không bao giờ có các trạng thái này. */
      trangThaiBo: ['DA_HUY', 'DA_HOAN', 'DANG_HOAN', 'THAT_BAI'],

      /** 9 cột dữ liệu cá nhân người mua — adapter chỉ đọc cột có tên trong `cot`, danh sách này để test chứng minh (Context 5.6). */
      cotPII: ['Người Mua', 'Tên Người nhận', 'Số điện thoại', 'Tỉnh/Thành phố', 'TP / Quận / Huyện', 'Quận', 'Địa chỉ nhận hàng', 'Nhận xét từ Người mua', 'Ghi chú']
    };
  }

  return { cauHinhMacDinh: cauHinhMacDinh };
})();
