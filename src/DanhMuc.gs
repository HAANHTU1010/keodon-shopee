/**
 * DanhMuc.gs — đọc danh mục kho từ sheet `Tổng tồn kho` của chính file tracking (Context 4.3).
 * Tiêu đề dòng 2, dữ liệu từ dòng 3: C tên sản phẩm · D tên viết tắt (khóa) · E mã hàng · F đơn vị · H `Tổng tồn`.
 * KHÔNG đọc cột G (giá vốn) — không có nhu cầu nghiệp vụ, và giá vốn là dữ liệu chỉ chủ shop được thấy.
 *
 * Tồn dùng cho quy tắc chọn lô (Context 6.4). Cột `Tổng tồn` là công thức `=I−J`:
 *  - file tải từ Google Sheet có sẵn giá trị đã tính → đọc thẳng;
 *  - file đã bị thư viện sửa công thức (ví dụ bản tháng 9 BA sửa 903 ô) thì không còn giá trị → `ton = null`,
 *    lúc đó MapListing coi như "không đọc được tồn", lấy mã đầu tiên và ghi chú để người kiểm.
 */
var DanhMuc = (function () {

  /**
   * @param {Array[]} bang    sheet `Tổng tồn kho` dạng mảng 2 chiều (giá trị đã tính; công thức → null)
   * @param {Object}  [cfg]   ghi đè bố cục cột (mặc định SCHEMA.DANH_MUC)
   * @returns {{theoTvt: Object, theoMa: Object, soDong: number, soCoTon: number}}
   *   item = { maHang, tenVietTat, tenSanPham, donVi, ton (number|null), dong }
   */
  function doc(bang, cfg) {
    var c = cfg || SCHEMA.DANH_MUC;
    var dm = { theoTvt: {}, theoMa: {}, soDong: 0, soCoTon: 0 };
    if (!bang || !bang.length) return dm;
    var i = {
      ten: Utils.chiSoCot(c.cot_ten_sp) - 1, tvt: Utils.chiSoCot(c.cot_ten_viet_tat) - 1,
      ma: Utils.chiSoCot(c.cot_ma_hang) - 1, dv: Utils.chiSoCot(c.cot_don_vi) - 1,
      ton: c.cot_ton ? Utils.chiSoCot(c.cot_ton) - 1 : -1
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
      var item = {
        maHang: ma, tenVietTat: tvt, tenSanPham: Utils.nfc(row[i.ten]).trim(),
        donVi: Utils.nfc(row[i.dv]).trim(), ton: ton, dong: r + 1
      };
      var k = Utils.chuanHoaChuoi(tvt);
      if (!dm.theoTvt[k]) { dm.theoTvt[k] = item; dm.soDong++; if (ton != null) dm.soCoTon++; }
      var km = Utils.chuanHoaChuoi(ma);
      if (!dm.theoMa[km]) dm.theoMa[km] = item;
    }
    return dm;
  }

  return { doc: doc };
})();
