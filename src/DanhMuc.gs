/**
 * DanhMuc.gs — đọc danh mục kho từ sheet `Tổng tồn kho` của chính file tracking (Context 4.3).
 * Tiêu đề dòng 2, dữ liệu từ dòng 3: C tên sản phẩm · D tên viết tắt (khóa) · E mã hàng · F đơn vị · G giá vốn · H `Tổng tồn`.
 *
 * Cột G (giá vốn): CHỈ đọc để trả lời một câu hỏi có/không — "mã này có giá vốn đúng bằng 0 hay không".
 * KHÔNG giữ con số giá vốn trong danh mục: giá vốn là dữ liệu chỉ chủ shop được thấy, và lớp trên không có
 * nhu cầu nào cần tới con số. Item chỉ mang hai cờ `giaVonDocDuoc` và `giaVon0`.
 * Vì sao cần cờ đó: mã giá vốn 0 hầu hết là mã HÀNG TẶNG. Một dòng BÁN mà trừ tồn vào mã tặng thì giá vốn
 * bằng 0 nên lãi bị thổi phồng — lỗi tiền, và nó im lặng. MapListing tô vàng + ghi Note cho ca này (GV-v2.6 mục 0).
 *
 * Tồn dùng cho quy tắc chọn lô (Context 6.4). Cột `Tổng tồn` là công thức `=I−J`:
 *  - file tải từ Google Sheet có sẵn giá trị đã tính → đọc thẳng;
 *  - file đã bị thư viện sửa công thức (ví dụ bản tháng 9 BA sửa 903 ô) thì không còn giá trị → `ton = null`,
 *    lúc đó MapListing coi như "không đọc được tồn", lấy mã đầu tiên và ghi chú để người kiểm.
 */
var DanhMuc = (function () {

  /** Cột giá vốn của `Tổng tồn kho`. Để ở đây vì `cfg.danhMuc` (SCHEMA.DANH_MUC) chưa khai cột này; khai rồi thì cfg thắng. */
  var COT_GIA_VON_MAC_DINH = 'G';

  /**
   * Đọc MỘT ô giá vốn, nghiêm ngặt. Trả về số, hoặc `null` nghĩa là KHÔNG ĐỌC ĐƯỢC.
   *
   * Phải tách bạch "giá vốn đúng bằng 0" với "không đọc được giá vốn", vì chỉ ca đầu mới đáng tô vàng.
   * Nhầm hai ca là tô vàng oan hàng loạt, mà tô vàng oan thì nhân viên bỏ qua luôn cả những cảnh báo thật.
   *
   * Ba triệu chứng thật đang chống, đo trên file tháng 8:
   *  1. Cả 76 ô cột G đều để định dạng kế toán, khúc thứ ba của định dạng hiện số 0 thành DẤU GẠCH NGANG.
   *     Đường Google đọc sheet bằng getDisplayValues nên giá vốn 0 về tới đây là chuỗi " -  ", không phải số 0.
   *     Bỏ qua ca này là mất trắng cảnh báo trên chính đường đang chạy thật.
   *  2. Ô lỗi kiểu "#DIV/0!" đi qua bộ lọc lỏng tay (bỏ mọi ký tự không phải chữ số, như bộ đọc tồn đang làm)
   *     còn lại đúng chuỗi "0" → hóa thành giá vốn 0 giả. Đây là nguồn tô vàng oan nguy hiểm nhất.
   *  3. Ô rỗng, ô chữ, và ô mà thư viện đọc .xlsx trả về công thức chưa tính ("=...") đều là KHÔNG BIẾT.
   *     Không biết thì im lặng — không được suy ra 0.
   */
  function docGiaVon(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v === 'boolean' || Utils.laNgay(v)) return null;
    var s = Utils.nfc(v).replace(/[\s\u00a0]/g, '').replace(/[₫đ]/g, '');
    if (s === '') return null;                                   // ô trống — không biết
    if (s.charAt(0) === '#') return null;                        // ô lỗi: #REF! #N/A #DIV/0! #VALUE!
    if (s.charAt(0) === '=') return null;                        // công thức chưa tính
    if (/^-+$/.test(s)) return 0;                                // khúc "số 0" của định dạng kế toán
    if (/^(n\/a|na|none|nan|null)$/i.test(s)) return null;       // chữ "chưa có" — KHÔNG phải số 0
    var n;
    try { n = Utils.parseTien(s); } catch (e) { return null; }   // chữ không ra số — không biết
    return (n == null || isNaN(n)) ? null : n;
  }

  /**
   * @param {Array[]} bang    sheet `Tổng tồn kho` dạng mảng 2 chiều (giá trị đã tính; công thức → null)
   * @param {Object}  [cfg]   ghi đè bố cục cột (mặc định SCHEMA.DANH_MUC)
   * @returns {{theoTvt: Object, theoMa: Object, soDong: number, soCoTon: number, soGiaVon0: number, soKhongDocDuocGiaVon: number}}
   *   item = { maHang, tenVietTat, tenSanPham, donVi, ton (number|null), giaVonDocDuoc, giaVon0, dong }
   */
  function doc(bang, cfg) {
    var c = cfg || SCHEMA.DANH_MUC;
    var dm = { theoTvt: {}, theoMa: {}, soDong: 0, soCoTon: 0, soGiaVon0: 0, soKhongDocDuocGiaVon: 0 };
    if (!bang || !bang.length) return dm;
    var cotGv = c.cot_gia_von || COT_GIA_VON_MAC_DINH;
    var i = {
      ten: Utils.chiSoCot(c.cot_ten_sp) - 1, tvt: Utils.chiSoCot(c.cot_ten_viet_tat) - 1,
      ma: Utils.chiSoCot(c.cot_ma_hang) - 1, dv: Utils.chiSoCot(c.cot_don_vi) - 1,
      ton: c.cot_ton ? Utils.chiSoCot(c.cot_ton) - 1 : -1,
      gv: cotGv ? Utils.chiSoCot(cotGv) - 1 : -1
    };
    var trong = 0;
    for (var r = c.dong_dau - 1; r < bang.length; r++) {
      var row = bang[r] || [];
      var tvt = Utils.nfc(row[i.tvt]).trim();
      if (!tvt) { if (++trong >= 5) break; continue; }
      trong = 0;
      var ma = Utils.chuoiMaDon(row[i.ma]);
      if (!ma) continue;
      var ton = null;
      if (i.ton >= 0) {
        var v = row[i.ton];
        if (typeof v === 'number') ton = v;
        else if (!Utils.laRong(v)) { var n = Number(String(v).replace(/[^\d.\-]/g, '')); if (!isNaN(n)) ton = n; }
      }
      var gv = i.gv >= 0 ? docGiaVon(row[i.gv]) : null;
      var item = {
        maHang: ma, tenVietTat: tvt, tenSanPham: Utils.nfc(row[i.ten]).trim(),
        donVi: Utils.nfc(row[i.dv]).trim(), ton: ton,
        giaVonDocDuoc: gv != null, giaVon0: gv === 0, dong: r + 1
      };
      var k = Utils.chuanHoaChuoi(tvt);
      if (!dm.theoTvt[k]) {
        dm.theoTvt[k] = item; dm.soDong++;
        if (ton != null) dm.soCoTon++;
        if (item.giaVon0) dm.soGiaVon0++;
        else if (!item.giaVonDocDuoc) dm.soKhongDocDuocGiaVon++;
      }
      var km = Utils.chuanHoaChuoi(ma);
      if (!dm.theoMa[km]) dm.theoMa[km] = item;
    }
    return dm;
  }

  return { doc: doc, docGiaVon: docGiaVon };
})();
