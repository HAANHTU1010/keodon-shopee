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
 *  7. Lệch một phép K-1…K-8 là dừng, không đánh dấu hoàn tất.
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
 */
var TaoThangMoi = (function () {

  var PHIEN_BAN = 'GD3-v1.0';
  var TEN_SHEET_MAPPING = 'Mapping_san_pham';
  var TEN_SHEET_MAPPING_CU = ['Mapping_san_pham', 'Mapping sản phẩm'];
  /** Đáy vùng dữ liệu dùng trong mọi công thức dựng lại — theo `CONG_THUC_DAN_VAO_GOOGLE_SHEET.md`. */
  var DAY_VUNG = 2000;
  var COT_MAPPING_CUOI = 12;                     // A:L

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
    }
  };

  var SHEET_GIAN_HANG = ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'];
  var SHEET_DON_NGOAI = 'Đơn ngoài';
  var SHEET_TIKTOK = 'Tiktok';
  var SHEET_TON_KHO = 'Tổng tồn kho';
  var SHEET_NHAP = 'Tổng nhập';
  var SHEET_LOI_NHUAN = 'Lợi nhuận';

  /** Bố cục `Đơn ngoài` — KHÁC hẳn bốn sheet trên, áp nhầm là ghi lệch cột toàn bộ (mục 4 dòng 8). */
  var DON_NGOAI = {
    cotTenVietTat: 'E', cotTenSP: 'F', cotDonVi: 'G', cotSoLuong: 'H', cotTienSP: 'I',
    cotChiPhi: 'J', cotMaGiam: 'K', cotPhuong: 'L', cotOanh: 'M', cotMaHang: 'N', cotCheckTon: 'O',
    cotTong: ['L', 'M'], cotCuoiDon: 'O',
    // `M` (OANH) CỐ Ý không nằm trong danh sách: `Lợi nhuận`!D7 cộng CẢ `L3` lẫn `M3`,
    // gieo cùng một công thức vào hai cột là tính doanh số hai lần cho mỗi đơn.
    cotCongThuc: ['F', 'G', 'L', 'N', 'O']
  };

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
   * 4 ARRAYFORMULA ở `E4`,`F4`,`M4`,`N4` và `L4` từng dòng. Coi "ô có công thức" là "ô có dữ liệu"
   * thì mọi vỏ file đều bị chấm là "đã dùng dở" và tool KHÔNG BAO GIỜ chịu khởi tạo file nào.
   * Ngược lại, đơn nhân viên gõ tay luôn là GIÁ TRỊ, nên luật này vẫn bắt được file đã dùng dở.
   */
  function oCoDuLieu(ss, r, c) {
    if (ct(ss, r, c) != null) return false;
    var v = o(ss, r, c);
    return !Utils.laRong(v);
  }

  function quetDuLieu(ss, r1, c1, r2, c2, gioiHan) {
    var kq = { soO: 0, viTri: [] };
    if (!ss) return kq;
    var het = Math.min(r2, soDong(ss));
    for (var r = r1; r <= het; r++) {
      for (var c = c1; c <= c2; c++) {
        if (!oCoDuLieu(ss, r, c)) continue;
        kq.soO++;
        if (kq.viTri.length < (gioiHan || 5)) kq.viTri.push(L(c) + r + '="' + String(o(ss, r, c)).slice(0, 30) + '"');
      }
    }
    return kq;
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

  /** Đếm ô công thức của một cột từ dòng `r1` xuống, và dòng cuối cùng còn công thức. */
  function vungCongThucCot(ss, chuCot, r1) {
    var c = C(chuCot), het = soDong(ss), soO = 0, cuoi = 0;
    for (var r = r1; r <= het; r++) if (ct(ss, r, c) != null) { soO++; cuoi = r; }
    return { soO: soO, dongCuoi: cuoi };
  }

  /**
   * ĐO vùng công thức của một sheet TRƯỚC và SAU khi xóa `dCuoi-3` dòng đầu.
   * Xóa hẳn dòng thì các dòng dưới DỒN LÊN: ô công thức không mất, chỉ đổi số dòng.
   * Đây là số liệu để chỉ tiêu nghiệm thu N-10 chấm, và để thấy vùng công thức bị ăn mòn bao nhiêu.
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
  function kiemDieuKien(anhMoi, anhCu) {
    var ssMap = sheet(anhMoi, TEN_SHEET_MAPPING) || sheet(anhMoi, 'Mapping sản phẩm');
    var trangThai = ssMap ? String(tinh(ssMap, 1, C('O')) || '').trim() : '';
    var buocDaXong = ssMap ? String(tinh(ssMap, 5, C('O')) || '').trim() : '';
    var lop1 = { trangThai: trangThai || 'CHUA_KHOI_TAO', buocDaXong: buocDaXong };
    var lyDo = [];

    // Luật một chiều: đã khởi tạo rồi thì KHÔNG BAO GIỜ khởi tạo lại, kể cả khi người dùng bấm lại nút.
    if (/^DA_KHOI_TAO_/.test(trangThai)) {
      lyDo.push('File này đã khởi tạo lúc ' + trangThai.replace(/^DA_KHOI_TAO_/, '') +
        '. Muốn làm lại phải xóa file và nhân bản vỏ mới — cố ý làm cho khó, vì ghi đè lên dữ liệu là thứ không cứu được.');
      return { chay: false, lop1: lop1, lop2: [], lyDoDung: lyDo, chayTiep: false };
    }

    var dangDo = /^DANG_KHOI_TAO_/.test(trangThai);
    var lop2 = [];
    if (!dangDo) {
      // Chỉ kiểm "rỗng" khi bắt đầu từ đầu. File đang dở (DANG_KHOI_TAO_*) đương nhiên đã có dữ liệu tool ghi.
      var ssNhap = sheet(anhMoi, SHEET_NHAP);
      var qNhap = quetDuLieu(ssNhap, 4, C('A'), DAY_VUNG, C('L'));
      lop2.push({ ma: 'R-1', ten: '`Tổng nhập` không có dòng nào', dat: qNhap.soO === 0, chiTiet: qNhap.soO + ' ô ' + qNhap.viTri.join(' ') });

      var lechGH = [];
      SHEET_GIAN_HANG.forEach(function (t) {
        var q = quetDuLieu(sheet(anhMoi, t), 4, C('A'), DAY_VUNG, C('O'));
        if (q.soO) lechGH.push(t + ': ' + q.soO + ' ô ' + q.viTri.join(' '));
      });
      lop2.push({ ma: 'R-2', ten: '4 sheet gian hàng không có đơn', dat: lechGH.length === 0, chiTiet: lechGH.join(' | ') || '0 ô' });

      var qDN = quetDuLieu(sheet(anhMoi, SHEET_DON_NGOAI), 4, C('A'), DAY_VUNG, C('O'));
      lop2.push({ ma: 'R-3', ten: '`Đơn ngoài` không có đơn', dat: qDN.soO === 0, chiTiet: qDN.soO + ' ô ' + qDN.viTri.join(' ') });

      var qLN = quetDuLieu(sheet(anhMoi, SHEET_LOI_NHUAN), 6, C('D'), 16, C('D'));
      lop2.push({ ma: 'R-4', ten: '`Lợi nhuận`!D6:D16 chưa có số gõ tay', dat: qLN.soO === 0, chiTiet: qLN.soO + ' ô ' + qLN.viTri.join(' ') });

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

    return { chay: lyDo.length === 0, lop1: lop1, lop2: lop2, lyDoDung: lyDo, chayTiep: dangDo };
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

  /** Cột `D` của `Lợi nhuận` tháng cũ, dòng 6→16 — GIÁ TRỊ ĐÃ TÍNH, đọc TRƯỚC khi dọn (mục 5 bước 8). */
  function docLoiNhuanCu(ssLN) {
    var gt = [];
    for (var r = 6; r <= 16; r++) gt.push(tinh(ssLN, r, C('D')));
    return {
      dong6den16: gt,
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
      var n = soDong(ss), cuoi = 0;
      for (var r = 1; r <= n; r++) {
        for (var c = 1; c <= COT_MAPPING_CUOI; c++) if (!Utils.laRong(tinh(ss, r, c))) { cuoi = r; break; }
      }
      var bang = [];
      for (var r2 = 1; r2 <= cuoi; r2++) {
        var dong = [];
        for (var c2 = 1; c2 <= COT_MAPPING_CUOI; c2++) {
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
  function thaoTacDonGianHang(ten, ss, boCuc, ssCu) {
    var tt = [];
    var cCuoi = C(boCuc.cotCuoiDon);
    var khoi = dongCuoiDuLieu(ss, cCuoi, boCuc.cotTenVietTat);
    var dCuoi = khoi.dong;
    // Bỏ ô gộp TRƯỚC khi xóa: quên bước này thì đơn tháng mới ghi đè lên khung gộp cũ, số nhảy lung tung.
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: DAY_VUNG, c2: cCuoi });
    if (dCuoi >= 4) tt.push({ loai: 'XOA_DONG', sheet: ten, r1: 4, soDong: dCuoi - 3 });
    // Dòng tổng: dựng lại cho phủ hết vùng (bản gốc có vùng lệch nhau — H4:H901, I4:I906…),
    // và vì xóa dòng làm co vùng SUM lại đúng bằng số dòng vừa xóa.
    boCuc.cotTong.forEach(function (chu) {
      tt.push({ loai: 'GHI_CT', sheet: ten, r: 3, c: C(chu), text: 'SUM(' + chu + '4:' + chu + DAY_VUNG + ')', mang: false });
    });
    // Cột công thức: KHÔNG ghi gì. Chỉ khi một cột không còn MỘT ô công thức nào sau khi xóa
    // mới gieo lại dòng 4 bằng chính mẫu của cột đó — chép của chủ shop, không bịa.
    var gieo = [];
    (boCuc.cotCongThuc || []).forEach(function (chu) {
      if (vungCongThucCot(ss, chu, Math.max(4, dCuoi + 1)).soO > 0) return;
      var m = mauCongThuc(ss, chu) || mauCongThuc(ssCu, chu);
      if (!m) return;
      tt.push({ loai: 'GHI_CT', sheet: ten, r: 4, c: C(chu), text: m.text, mang: m.mang });
      gieo.push(chu);
    });
    var d = doVungCongThuc(ss, boCuc.cotCongThuc || [], dCuoi);
    gieo.forEach(function (chu) { d[chu].sau = 1; d[chu].sauDongCuoi = 4; d[chu].gieoLai = true; });
    return { thaoTac: tt, dongCuoiDon: dCuoi, oLac: khoi.oLac, gieoLai: gieo, do: d };
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
  function thaoTacDonNgoai(ss, ssCu) {
    var ten = SHEET_DON_NGOAI, tt = [];
    var cCuoi = C(DON_NGOAI.cotCuoiDon);
    var khoi = dongCuoiDuLieu(ss, cCuoi, DON_NGOAI.cotTenVietTat);
    var dCuoi = khoi.dong;
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: DAY_VUNG, c2: cCuoi });
    if (dCuoi >= 4) tt.push({ loai: 'XOA_DONG', sheet: ten, r1: 4, soDong: dCuoi - 3 });
    DON_NGOAI.cotTong.forEach(function (chu) {
      tt.push({ loai: 'GHI_CT', sheet: ten, r: 3, c: C(chu), text: 'SUM(' + chu + '4:' + chu + DAY_VUNG + ')', mang: false });
    });
    var gieo = [];
    DON_NGOAI.cotCongThuc.forEach(function (chu) {
      if (vungCongThucCot(ss, chu, Math.max(4, dCuoi + 1)).soO > 0) return;
      var m = mauCongThuc(ss, chu) || mauCongThuc(ssCu, chu);
      if (!m) return;
      tt.push({ loai: 'GHI_CT', sheet: ten, r: 4, c: C(chu), text: m.text, mang: m.mang });
      gieo.push(chu);
    });
    var d = doVungCongThuc(ss, DON_NGOAI.cotCongThuc, dCuoi);
    gieo.forEach(function (chu) { d[chu].sau = 1; d[chu].sauDongCuoi = 4; d[chu].gieoLai = true; });
    return { thaoTac: tt, dongCuoiDon: dCuoi, oLac: khoi.oLac, gieoLai: gieo, do: d };
  }

  /** Mẫu công thức của một cột: lấy ô có công thức đầu tiên từ dòng 4, dịch về dòng 4. */
  function mauCongThuc(ss, chuCot, tuDong) {
    if (!ss) return null;
    var c = C(chuCot), n = Math.min(soDong(ss), 400), r0 = tuDong || 4;
    for (var r = r0; r <= n; r++) {
      var t = ct(ss, r, c);
      if (t) return { text: Utils.dichCongThuc(t, r, r0), mang: laMang(ss, r, c) };
    }
    return null;
  }

  // ---------------------------------------------------------------- B4: khối nhập đầu kỳ

  /**
   * Ghi tồn cuối tháng cũ thành các dòng nhập đầu kỳ.
   * `J` (Ngày nhập) để TRỐNG — dấu hiệu duy nhất phân biệt đầu kỳ với nhập trong tháng.
   * Ghi ĐỦ 100% mã, kể cả mã tồn 0: bản làm tay rơi mất `gvs km 1` đúng vì nó tồn 0 ở dòng đầu bảng,
   * và SUMIF vẫn chạy bình thường nên không ai thấy mã đó biến mất (mục 8.2).
   */
  function thaoTacTongNhap(danhMuc, ssNhapCu, ssNhapMoi, dau) {
    var tt = [], ten = SHEET_NHAP;
    // Cùng lý do như sheet gian hàng: `Tổng nhập` cũng có công thức TỪNG DÒNG ở C, E, F, G.
    // Đo tháng 8: 485 ô mỗi cột (dòng 4→488); tháng 9 chủ shop đã kéo lại tới dòng 1000 (997 ô).
    // Xóa nội dung `A4:L2000` là quét sạch cả 485 ô đó, chỉ còn lại 76 dòng khối đầu kỳ tool ghi;
    // nhân viên nhập hàng trong tháng từ dòng 80 trở xuống sẽ không có công thức tra Tên/Đơn vị/Giá vốn.
    var khoiNhap = dongCuoiDuLieu(ssNhapMoi, C('L'), 'D');
    var dCuoiNhap = khoiNhap.dong;
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: DAY_VUNG, c2: C('L') });
    if (dCuoiNhap >= 4) tt.push({ loai: 'XOA_DONG', sheet: ten, r1: 4, soDong: dCuoiNhap - 3 });
    // C, E, F, G là công thức tra theo D — giữ đúng hình dạng của tháng cũ (mục 5 bước 15).
    var mau = {};
    ['C', 'E', 'F', 'G'].forEach(function (chu) {
      mau[chu] = mauCongThuc(ssNhapMoi, chu) || mauCongThuc(ssNhapCu, chu);
    });
    var thieu = ['C', 'E', 'F', 'G'].filter(function (chu) { return !mau[chu]; });
    var r = 4;
    danhMuc.forEach(function (m) {
      tt.push({ loai: 'GHI_O', sheet: ten, r: r, c: C('D'), gt: m.tenVietTat });
      tt.push({ loai: 'GHI_O', sheet: ten, r: r, c: C('H'), gt: m.ton });          // số thuần, không công thức
      tt.push({ loai: 'GHI_CT', sheet: ten, r: r, c: C('I'), text: doiDauPhanCach('iferror(H' + r + '*G' + r + ';"")', dau), mang: false });
      ['C', 'E', 'F', 'G'].forEach(function (chu) {
        if (!mau[chu]) return;
        tt.push({ loai: 'GHI_CT', sheet: ten, r: r, c: C(chu), text: Utils.dichCongThuc(mau[chu].text, 4, r), mang: mau[chu].mang });
      });
      r++;
    });
    tt.push({ loai: 'GHI_CT', sheet: ten, r: 2, c: C('I'), text: 'SUM(I4:I' + DAY_VUNG + ')', mang: false });
    return {
      thaoTac: tt, dongDau: 4, dongCuoi: r - 1, thieuMau: thieu, dongCuoiDon: dCuoiNhap, oLac: khoiNhap.oLac,
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

    // 1. Đóng băng: 11 dòng 6→16 của cột E = giá trị đọc từ tháng cũ.
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
    // 3. Cột tháng mới.
    tt.push({ loai: 'GHI_O', sheet: ten, r: 5, c: D, gt: thangMoi });
    tt.push({ loai: 'GHI_CT', sheet: ten, r: 6, c: D, text: 'D7+D8+D9+D10-D11', mang: false });
    tt.push({ loai: 'GHI_CT', sheet: ten, r: 7, c: D, text: "SUM(Tiktok!K3,'Shopee mall'!L3,Offood!L3,Importmart!L3,'Đơn ngoài'!L3,'Đơn ngoài'!M3,Babyiu!L3)", mang: false });
    tt.push({ loai: 'GHI_CT', sheet: ten, r: 8, c: D, text: "'Tổng tồn kho'!K1", mang: false });
    tt.push({ loai: 'GHI_CT', sheet: ten, r: 11, c: D, text: 'SUM(D12:D16)', mang: false });
    tt.push({ loai: 'GHI_CT', sheet: ten, r: 12, c: D, text: "'Tổng nhập'!I2", mang: false });
    [9, 10, 13, 14, 15, 16].forEach(function (r) { tt.push({ loai: 'GHI_O', sheet: ten, r: r, c: D, gt: null }); });
    return { thaoTac: tt, cotCuoiMoi: cuoiMoi };
  }

  // ---------------------------------------------------------------- B7: khối điều khiển

  function thaoTacKhoiDieuKhien(trangThai, thang, nguonClone, buocDaXong) {
    var nhan = ['TRANG_THAI_KHOI_TAO', 'THANG', 'NGUON_CLONE', 'PHIEN_BAN_TOOL', 'BUOC_DA_XONG'];
    var giaTri = [trangThai, thang, nguonClone || '', PHIEN_BAN, buocDaXong || ''];
    var tt = [];
    for (var i = 0; i < nhan.length; i++) {
      tt.push({ loai: 'GHI_O', sheet: TEN_SHEET_MAPPING, r: i + 1, c: C('N'), gt: nhan[i] });
      tt.push({ loai: 'GHI_O', sheet: TEN_SHEET_MAPPING, r: i + 1, c: C('O'), gt: giaTri[i] });
    }
    return tt;
  }

  // ---------------------------------------------------------------- tiến độ / chạy tiếp

  var THU_TU_BUOC = ['B3', 'B4', 'B5a', 'B5b', 'B6', 'B7'];

  /**
   * Từ cờ `BUOC_DA_XONG` suy ra bước phải chạy tiếp.
   * `B5_DANG_LAM` → DỪNG, bắt người kiểm tay: chèn cột là thao tác KHÔNG chạy lại được,
   * chạy hai lần là chèn hai cột và khối tháng lệch vĩnh viễn. Cách kiểm tay: nhìn `Lợi nhuận`!D5 —
   * là số tháng mới thì đã chèn rồi, vẫn là số tháng cũ thì chưa chèn.
   */
  function buocBatDau(buocDaXong) {
    var m = String(buocDaXong || '').trim();
    if (m === 'B5_DANG_LAM') {
      return {
        dung: true,
        lyDo: 'Lần chạy trước dừng giữa lúc chèn cột `Lợi nhuận` (cờ B5_DANG_LAM). Chèn cột không chạy lại được. ' +
          'Hãy mở `Lợi nhuận` xem `D5`: là số tháng mới → cột đã chèn, sửa cờ `Mapping_san_pham`!O5 thành `B5_DA_CHEN` rồi chạy lại; ' +
          'vẫn là số tháng cũ → cột chưa chèn, sửa cờ thành `B4` rồi chạy lại. Tuyệt đối không để tool tự đoán.'
      };
    }
    if (m === 'B5_DA_CHEN') return { dung: false, tu: 'B5b' };
    var i = THU_TU_BUOC.indexOf(m);
    if (i >= 0) return { dung: false, tu: THU_TU_BUOC[i + 1] || null };
    return { dung: false, tu: 'B3' };
  }

  // ---------------------------------------------------------------- LẬP KẾ HOẠCH

  /**
   * @param {Object} anhCu   ảnh chụp file tháng cũ (CHỈ ĐỌC, không bao giờ ghi)
   * @param {Object} anhMoi  ảnh chụp vỏ file tháng mới
   * @param {Object} ts      { thangMoi:'2026-10', idFileCu, idFileMoi, thoiDiem:Date, dauPhanCach:';'|',' }
   */
  function lapKeHoach(anhCu, anhMoi, ts) {
    ts = ts || {};
    var dau = ts.dauPhanCach || ';';
    var thoiDiem = ts.thoiDiem || new Date();
    var nhan = Utils.dinhDangNgayGio(thoiDiem).slice(0, 16);
    var thangMoi = String(ts.thangMoi || '');
    var mThang = thangMoi.match(/^(\d{4})-(\d{1,2})$/);
    if (!mThang) throw new Error('Tham số thangMoi phải dạng "YYYY-MM", nhận được "' + thangMoi + '"');
    var namMoi = +mThang[1], soThangMoi = +mThang[2];

    var kq = {
      thangMoi: thangMoi, phienBan: PHIEN_BAN, canhBao: [], thongBao: [],
      chay: false, lyDoDung: [], kiem: null, doc: null, batDau: [], buoc: [], tuBuoc: 'B3'
    };

    var kiem = kiemDieuKien(anhMoi, anhCu);
    kq.kiem = kiem;
    if (!kiem.chay) { kq.lyDoDung = kiem.lyDoDung; return kq; }

    var tiep = buocBatDau(kiem.lop1.buocDaXong);
    if (tiep.dung) { kq.lyDoDung = [tiep.lyDo]; return kq; }
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
    if (!map) kq.canhBao.push('Tháng cũ chưa có sheet `Mapping_san_pham` → tool tạo sheet rỗng, chỉ để chứa khối điều khiển. Nhân viên sẽ phải điền lại từ đầu.');

    // ---- B1: đặt cờ đang làm TRƯỚC khi ghi ô nào ----
    kq.batDau = [{ loai: 'TAO_SHEET', ten: TEN_SHEET_MAPPING }]
      .concat(thaoTacKhoiDieuKhien('DANG_KHOI_TAO_' + nhan, thangMoi, ts.idFileCu || '', kiem.lop1.buocDaXong || ''));

    // ---- B3: dọn sheet gian hàng ----
    var ttB3 = [];
    kq.doc.vungCongThuc = {};       // số ô công thức từng cột, TRƯỚC và SAU khi xóa dòng — chỉ tiêu N-10 chấm trên đây
    /** Ô gõ tay nằm DƯỚI khối đơn: tool cố ý KHÔNG xóa tới đó, phải báo để người xử lý tay. */
    function baoOLac(t, oLac, dCuoi) {
      if (!oLac || !oLac.length) return;
      kq.canhBao.push('Sheet `' + t + '`: có ô gõ tay nằm DƯỚI khối đơn (khối đơn hết ở dòng ' + dCuoi + '): ' +
        oLac.join(', ') + '. Tool chỉ xóa hẳn tới dòng ' + dCuoi + ' — xóa xuống tận những ô này sẽ nuốt luôn ' +
        'vùng công thức dự trữ của chủ shop. Hãy tự kiểm rồi xóa tay nếu đó là rác.');
    }
    SHEET_GIAN_HANG.forEach(function (t) {
      var ss = sheet(anhMoi, t);
      if (!ss) { kq.canhBao.push('Vỏ tháng mới không có sheet `' + t + '` → bỏ qua.'); return; }
      var b = thaoTacDonGianHang(t, ss, BO_CUC.CHUAN, sheet(anhCu, t));
      ttB3 = ttB3.concat(b.thaoTac);
      kq.doc.vungCongThuc[t] = { dongCuoiDon: b.dongCuoiDon, gieoLai: b.gieoLai, cot: b.do };
      baoOLac(t, b.oLac, b.dongCuoiDon);
      var cCN = cotConNo(ss, BO_CUC.CHUAN);
      if (cCN) ttB3.push({ loai: 'GHI_CT', sheet: t, r: 3, c: cCN, text: BO_CUC.CHUAN.cotDoanhThu + '3', mang: false });
      else kq.canhBao.push('Sheet `' + t + '`: không thấy tiêu đề `Còn Nợ` ở dòng 2 → không dựng lại ô tổng Còn Nợ.');
    });
    var ssDN = sheet(anhMoi, SHEET_DON_NGOAI);
    if (ssDN) {
      var bDN = thaoTacDonNgoai(ssDN, sheet(anhCu, SHEET_DON_NGOAI));
      ttB3 = ttB3.concat(bDN.thaoTac);
      kq.doc.vungCongThuc[SHEET_DON_NGOAI] = { dongCuoiDon: bDN.dongCuoiDon, gieoLai: bDN.gieoLai, cot: bDN.do };
      baoOLac(SHEET_DON_NGOAI, bDN.oLac, bDN.dongCuoiDon);
    }
    // `Tiktok`: luật theo nội dung (mục 8.5).
    var ssTik = sheet(anhMoi, SHEET_TIKTOK);
    if (ssTik && coDonThat(ssTik, BO_CUC.TIKTOK)) {
      var bTik = thaoTacDonGianHang(SHEET_TIKTOK, ssTik, BO_CUC.TIKTOK, sheet(anhCu, SHEET_TIKTOK));
      ttB3 = ttB3.concat(bTik.thaoTac);
      kq.doc.vungCongThuc[SHEET_TIKTOK] = { dongCuoiDon: bTik.dongCuoiDon, gieoLai: bTik.gieoLai, cot: bTik.do };
      baoOLac(SHEET_TIKTOK, bTik.oLac, bTik.dongCuoiDon);
      var cCNT = cotConNo(ssTik, BO_CUC.TIKTOK);
      if (cCNT) ttB3.push({ loai: 'GHI_CT', sheet: SHEET_TIKTOK, r: 3, c: cCNT, text: BO_CUC.TIKTOK.cotDoanhThu + '3', mang: false });
      kq.thongBao.push('`Tiktok` CÓ đơn thật (K3 khác 0 hoặc có dòng từ A4) → dọn như sheet gian hàng.');
    } else {
      kq.thongBao.push('`Tiktok` là vỏ rỗng (K3 = 0, không có dòng đơn từ A4) → bỏ qua, không đụng vào.');
    }

    // ---- B4: khối nhập đầu kỳ ----
    var b4 = thaoTacTongNhap(dm.ds, ssNhapCu, sheet(anhMoi, SHEET_NHAP), dau);
    if (b4.thieuMau.length) kq.canhBao.push('Không tìm được mẫu công thức cột ' + b4.thieuMau.join(',') +
      ' ở `Tổng nhập` của cả hai file → các cột đó để trống, cần kiểm tay.');
    kq.doc.khoiDauKy = { dongDau: b4.dongDau, dongCuoi: b4.dongCuoi, soDong: dm.ds.length };
    kq.doc.vungCongThuc[SHEET_NHAP] = { dongCuoiDon: b4.dongCuoiDon, gieoLai: [], cot: b4.do };
    baoOLac(SHEET_NHAP, b4.oLac, b4.dongCuoiDon);

    // ---- B5: đẩy cột `Lợi nhuận` ----
    var b5 = thaoTacLoiNhuan(ln, soThangMoi, ln.nam == null ? namMoi : ln.nam);
    kq.doc.loiNhuanCotCuoiMoi = b5.cotCuoiMoi;

    // ---- B6: chép `Mapping_san_pham` ----
    var ttB6 = [{ loai: 'TAO_SHEET', ten: TEN_SHEET_MAPPING }];
    if (map && map.bang.length) ttB6.push({ loai: 'GHI_BANG', sheet: TEN_SHEET_MAPPING, r1: 1, c1: 1, bang: map.bang });

    kq.buoc = [
      { ma: 'B3', ten: 'Dọn sheet gian hàng', mocSau: 'B3', thaoTac: ttB3 },
      { ma: 'B4', ten: 'Ghi khối nhập đầu kỳ vào `Tổng nhập`', mocSau: 'B4', thaoTac: b4.thaoTac },
      {
        ma: 'B5a', ten: 'Chèn một cột trước `D` ở `Lợi nhuận`', mocTruoc: 'B5_DANG_LAM', mocSau: 'B5_DA_CHEN',
        khongLapLai: true, thaoTac: [{ loai: 'CHEN_COT', sheet: SHEET_LOI_NHUAN, truocCot: C('D') }]
      },
      { ma: 'B5b', ten: 'Đóng băng tháng cũ ở cột `E`, dựng cột tháng mới', mocSau: 'B5b', thaoTac: b5.thaoTac },
      { ma: 'B6', ten: 'Chép `Mapping_san_pham`', mocSau: 'B6', thaoTac: ttB6 },
      { ma: 'B7', ten: 'Ghi khối điều khiển `N1:O5`', mocSau: 'B7', thaoTac: thaoTacKhoiDieuKhien('DANG_KHOI_TAO_' + nhan, thangMoi, ts.idFileCu || '', 'B7') }
    ];
    kq.chay = true;
    kq.nhanThoiDiem = nhan;
    return kq;
  }

  // ---------------------------------------------------------------- B8: tám phép tự kiểm

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
   * Tám phép K-1…K-8. LỆCH MỘT PHÉP LÀ DỪNG — vỏ không được đánh dấu hoàn tất.
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
      [SHEET_NHAP, 2, 'I'], [SHEET_TON_KHO, 1, 'K'],
      [SHEET_LOI_NHUAN, 6, 'D'], [SHEET_LOI_NHUAN, 7, 'D'], [SHEET_LOI_NHUAN, 8, 'D'],
      [SHEET_LOI_NHUAN, 11, 'D'], [SHEET_LOI_NHUAN, 12, 'D']);
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
    for (var i = 0; i < 11; i++) {
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
      (lech8.length ? lech8.join(' · ') : '11/11 dòng khớp'));

    var soLech = kq.filter(function (x) { return !x.dat; }).length;
    return { phep: kq, dat: soLech === 0, soLech: soLech, khoiDauKy: khoi };
  }

  return {
    PHIEN_BAN: PHIEN_BAN,
    TEN_SHEET_MAPPING: TEN_SHEET_MAPPING,
    DAY_VUNG: DAY_VUNG,
    SHEET_GIAN_HANG: SHEET_GIAN_HANG,
    BO_CUC: BO_CUC,
    DON_NGOAI: DON_NGOAI,
    doiDauPhanCach: doiDauPhanCach,
    oCoDuLieu: oCoDuLieu,
    quetDuLieu: quetDuLieu,
    dongCuoiDuLieu: dongCuoiDuLieu,
    vungCongThucCot: vungCongThucCot,
    doVungCongThuc: doVungCongThuc,
    kiemDieuKien: kiemDieuKien,
    buocBatDau: buocBatDau,
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
