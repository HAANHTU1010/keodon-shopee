/**
 * Schema.gs — tên cột của sheet tool được phép đụng tới. Một nơi duy nhất.
 *
 * GV-v2.2 mục 3: **tool chỉ được thêm ĐÚNG MỘT sheet** vào file của chủ dự án — `Mapping sản phẩm`.
 * Các sheet máy của bản v1 (DON_HANG_RAW, CHO_XU_LY, LOG_DONG_BO, DOI_CHIEU, XEM_GIAN_HANG) đã BỎ:
 *  - nhật ký → file riêng `Cấu hình\nhật ký\LOG_<yyyymmdd_HHMM>.txt` ngoài file tracking (Context 9.4);
 *  - hàng chờ → cột `Note` + tô vàng ngay trên sheet gian hàng, và dòng vàng trong `Mapping sản phẩm` (Context 7.1);
 *  - chống trùng → quét cột C của chính sheet gian hàng, không cần sổ cái riêng (Context 7.1).
 */

/** Tên tab Mapping trên Google Sheet (GV-v2.2 mục 1.3 — dùng đúng chuỗi này, không tự đổi). */
var TEN_TAB_MAPPING_SHEET = 'Mapping_san_pham';

/** Tên sheet Mapping trong file Excel giai đoạn 1 (đúng như file DEMO của BA). */
var TEN_SHEET_MAPPING_EXCEL = 'Mapping sản phẩm';

var SCHEMA = {
  /**
   * Sheet `Mapping sản phẩm` — 12 cột theo `00_DAU_VAO/DEMO_Mapping_san_pham.xlsx` (GV-v2.2 mục 1.3).
   * Bốn cột NGƯỜI điền: Tên viết tắt · Hệ số · Cấu phần · Xác nhận. Còn lại tool ghi.
   * Đọc theo TÊN cột, không theo vị trí — fixture nghiệm thu có thêm cột `Mã dùng lần lượt khi hết lô` (13 cột).
   */
  MAPPING: [
    'Gian hàng', 'Tên trên Shopee', 'Phân loại',
    'Tên viết tắt', 'Hệ số', 'Cấu phần', 'Xác nhận',
    'Mã hàng', 'Gợi ý 1', 'Gợi ý 2', 'Ngày thêm', 'Ghi chú'
  ],

  /** Cột NGƯỜI điền — tool không bao giờ ghi đè khi đã có giá trị (GV-v2.2 mục 1.3.2, 1.5.6). */
  MAPPING_COT_NGUOI: ['Tên viết tắt', 'Hệ số', 'Cấu phần', 'Xác nhận'],

  /**
   * Bí danh tên cột: tiêu đề thật trong file có thể xuống dòng hoặc thêm chú thích trong ngoặc.
   * Khóa = tên chuẩn ở trên; giá trị = các dạng đã gặp (so sau khi chuẩn hóa: NFC, gộp khoảng trắng, thường).
   */
  MAPPING_BI_DANH: {
    'Cấu phần': ['cấu phần (hàng mix / combo / tặng kèm)', 'cấu phần (hàng mix/combo/tặng kèm)', 'cau phan'],
    'Tên trên Shopee': ['tên listing', 'ten_listing'],
    'Phân loại': ['tên phân loại', 'ten_phan_loai'],
    'Tên viết tắt': ['ten_viet_tat'],
    'Hệ số': ['hệ số quy đổi', 'he_so_quy_doi'],
    'Xác nhận': ['xac_nhan'],
    'Gian hàng': ['ma_gian_hang'],
    'Mã hàng': ['ma_hang'],
    'Ngày thêm': ['ngay_them'],
    'Ghi chú': ['ghi_chu']
  },

  /** Cột riêng của fixture nghiệm thu (13 cột): danh sách lô dự phòng, ngăn bằng ';'. Có thì đọc, không có thì thôi. */
  MAPPING_COT_LO_PHU: 'Mã dùng lần lượt khi hết lô',

  /** Cột của sheet `Tổng tồn kho` — danh mục kho + tồn hiện tại (Context 4.3, đo 07/9). */
  DANH_MUC: {
    ten_sheet: 'Tổng tồn kho', dong_header: 2, dong_dau: 3,
    cot_ten_sp: 'C', cot_ten_viet_tat: 'D', cot_ma_hang: 'E', cot_don_vi: 'F', cot_ton: 'H'
  }
};

/** Một dòng nhật ký (ghi ra file .txt, không phải sheet). */
var LOG_COT = ['thoi_diem', 'gian_hang', 'ten_file', 'so_don_doc', 'so_don_ghi', 'so_don_da_co', 'so_dong_ghi', 'so_dong_vang', 'so_ten_moi', 'so_loi', 'thong_bao'];

var VAN_TAY_SCHEMA = 'b97654d6';   // dấu vân tay file này — MÁY sinh bằng `npm run dau-van-tay`, đừng sửa tay
