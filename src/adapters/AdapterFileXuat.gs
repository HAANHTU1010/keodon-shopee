/**
 * AdapterFileXuat.gs — LỚP 1. Nơi DUY NHẤT được biết định dạng file xuất của Kênh Người Bán Shopee.
 *
 * Đầu vào : mảng 2 chiều của sheet `orders` (dòng 0 = tiêu đề) — vỏ đã tìm sheet theo TÊN, không lấy sheet đầu
 *           (Context 5.3: sheet đầu `Advance Fulfilment` chỉ có tiêu đề rỗng, đọc nhầm là ra file trống mà không báo lỗi);
 *           thông tin nguồn { san, maGianHang, tenFile }; cfg.
 * Đầu ra  : { dong: [...], loaiFile: 'CHO_LAY_HANG'|'TAT_CA', soDonBoQua, canhBao: [] }
 *
 * Tự nhận loại file (GV-v2.2 mục 1.1): có cột `Lý do hủy` → file tab "Tất cả" → **bỏ mọi đơn hủy/hoàn** rồi mới xử lý;
 * không có cột đó → file tab "Chờ lấy hàng" → xử lý hết (tab này không bao giờ chứa đơn hủy/hoàn).
 *
 * Nguyên tắc:
 *  - Chỉ đọc cột có tên trong `cfg.cot`. Chín cột thông tin người mua KHÔNG BAO GIỜ vào bộ nhớ — thực hiện bằng
 *    cấu trúc chứ không bằng danh sách đen (Context 5.6).
 *  - Tên cột so khớp sau NFC + trim (9 tiêu đề Shopee viết dấu tách rời — Context 5.3).
 *  - Thiếu cột bắt buộc → ném lỗi ngay, không trả về dòng nào.
 *  - Trạng thái lạ → 'KHAC' + cảnh báo, không chặn.
 *
 * Lược đồ dòng trả về (hợp đồng với lớp 2):
 *   san, maGianHang, maDonSan, ngayDat, trangThai, trangThaiRaw, skuSan, tenListing, tenPhanLoai,
 *   soLuongListing, donGia, tienKhachTra, giamGiaShop, giamGiaSan, phiSan, sttDongTrongDon, soDongTrongDon, tenFileNguon
 */
var AdapterFileXuat = (function () {

  function doc(bang, nguon, cfg) {
    if (!bang || bang.length === 0 || Utils.laDongRong(bang[0])) {
      throw new Error('File "' + nguon.tenFile + '": không có dòng tiêu đề. Kiểm tra đã xuất đúng báo cáo đơn hàng chưa.');
    }
    var chiMuc = Utils.lapChiMucCot(bang[0]);
    kiemTraCotBatBuoc(chiMuc, cfg, nguon.tenFile, bang[0]);
    var lay = taoHamLay(chiMuc, cfg);
    var canhBao = [];
    var trangThaiLa = {};

    // nhận loại file theo sự có mặt của cột `Lý do hủy` (chỉ tab "Tất cả" mới có)
    var coLyDoHuy = (cfg.cot.lyDoHuy || []).some(function (c) { return Utils.tenCot(c) in chiMuc; });
    var loaiFile = coLyDoHuy ? 'TAT_CA' : 'CHO_LAY_HANG';

    var dong = [], soDonBoQua = 0, donDaBo = {};
    for (var r = 1; r < bang.length; r++) {
      var m = bang[r];
      if (Utils.laDongRong(m)) continue;
      var soDong = r + 1;
      var maDon = Utils.chuoiMaDon(lay.tho(m, 'maDonSan'));
      if (!maDon) {
        if (lay.chuoi(m, 'tenListing') != null) canhBao.push('Dòng ' + soDong + ': có tên hàng nhưng thiếu mã đơn → bỏ qua dòng này');
        continue;
      }
      var d;
      try {
        d = docMotDong(m, lay, nguon, cfg, trangThaiLa, maDon);
      } catch (e) {
        throw new Error('File "' + nguon.tenFile + '" dòng ' + soDong + ' (đơn ' + maDon + '): ' + e.message);
      }
      // file tab "Tất cả": bỏ đơn hủy/hoàn trước khi xử lý (GV-v2.2 mục 1.1 / Context 7.2)
      if (loaiFile === 'TAT_CA' && cfg.chung.bo_don_huy_hoan && cfg.trangThaiBo.indexOf(d.trangThai) >= 0) {
        if (!donDaBo[maDon]) { donDaBo[maDon] = 1; soDonBoQua++; }
        continue;
      }
      dong.push(d);
    }
    Object.keys(trangThaiLa).forEach(function (t) {
      canhBao.push('Trạng thái lạ "' + t + '" (' + trangThaiLa[t] + ' dòng) chưa có trong cấu hình → coi là KHAC');
    });
    if (loaiFile === 'TAT_CA') {
      canhBao.push('File tab "Tất cả" (có cột Lý do hủy)' + (soDonBoQua ? ': đã bỏ ' + soDonBoQua + ' đơn hủy/hoàn' : ': không có đơn hủy/hoàn nào'));
    }
    danhSoDongTrongDon(dong);
    return { dong: dong, loaiFile: loaiFile, soDonBoQua: soDonBoQua, canhBao: canhBao };
  }

  function docMotDong(m, lay, nguon, cfg, trangThaiLa, maDon) {
    var rawTT = lay.chuoi(m, 'trangThai');
    var rawHoan = lay.chuoi(m, 'trangThaiHoan');
    var tt = chuanHoaTrangThai(rawTT, rawHoan, cfg);
    if (tt === 'KHAC') { var k = rawTT == null ? '(trống)' : rawTT; trangThaiLa[k] = (trangThaiLa[k] || 0) + 1; }
    var sku = lay.chuoi(m, 'skuSan');
    if (sku == null) sku = lay.chuoi(m, 'skuSanPham');
    return {
      san: nguon.san,
      maGianHang: nguon.maGianHang,
      maDonSan: maDon,
      ngayDat: lay.ngay(m, 'ngayDat'),
      trangThai: tt,
      trangThaiRaw: rawTT == null ? '' : rawTT,
      skuSan: sku,
      tenListing: lay.chuoi(m, 'tenListing'),
      tenPhanLoai: lay.chuoi(m, 'tenPhanLoai'),
      soLuongListing: lay.soLuong(m, 'soLuongListing'),
      donGia: lay.tien(m, 'donGia'),
      tienKhachTra: lay.tien(m, 'tienKhachTra'),
      giamGiaShop: lay.tien(m, 'giamGiaShop'),
      giamGiaSan: lay.tien(m, 'giamGiaSan'),
      phiSan: lay.tien(m, 'phiSan'),
      sttDongTrongDon: 0,
      soDongTrongDon: 0,
      tenFileNguon: nguon.tenFile
    };
  }

  /** Cột trả hàng/hoàn tiền có giá trị tra được → GHI ĐÈ trạng thái chính (Context 5.3). Lạ → KHAC. */
  function chuanHoaTrangThai(rawTrangThai, rawHoan, cfg) {
    if (rawHoan != null) {
      var h = Config.traTrangThai(cfg, rawHoan, true);
      if (h) return h;
    }
    if (rawTrangThai == null) return 'KHAC';
    return Config.traTrangThai(cfg, rawTrangThai, false) || 'KHAC';
  }

  function danhSoDongTrongDon(dong) {
    var theoDon = {};
    dong.forEach(function (d) {
      var k = d.maGianHang + '|' + d.maDonSan;
      if (!theoDon[k]) theoDon[k] = [];
      theoDon[k].push(d);
    });
    Object.keys(theoDon).forEach(function (k) {
      var ds = theoDon[k];
      ds.forEach(function (d, i) { d.sttDongTrongDon = i + 1; d.soDongTrongDon = ds.length; });
    });
  }

  function kiemTraCotBatBuoc(chiMuc, cfg, tenFile, tieuDe) {
    var thieu = [];
    cfg.cotBatBuoc.forEach(function (truong) {
      var cots = cfg.cot[truong] || [];
      if (!cots.length) { thieu.push(truong + ' (chưa cấu hình tên cột)'); return; }
      cots.forEach(function (c) { if (!(Utils.tenCot(c) in chiMuc)) thieu.push('"' + c + '"'); });
    });
    if (thieu.length) {
      var co = tieuDe.map(Utils.tenCot).filter(function (x) { return x; });
      throw new Error('File "' + tenFile + '" thiếu cột bắt buộc: ' + thieu.join(', ') +
        '. Có thể Shopee đã đổi tên cột — sửa mục "cot" trong cấu hình. Tiêu đề đọc được (' + co.length + ' cột): ' + co.join(' | '));
    }
  }

  /** Bộ hàm đọc ô theo trường trung gian; cột không có trong file → null. */
  function taoHamLay(chiMuc, cfg) {
    function viTri(truong) {
      var vt = [];
      (cfg.cot[truong] || []).forEach(function (c) { var t = Utils.tenCot(c); if (t in chiMuc) vt.push(chiMuc[t]); });
      return vt;
    }
    function tho(m, truong) {
      var vt = viTri(truong);
      if (!vt.length) return null;
      var v = m[vt[0]];
      return Utils.laRong(v) ? null : v;
    }
    return {
      tho: tho,
      chuoi: function (m, truong) { var v = tho(m, truong); return v == null ? null : Utils.nfc(v).trim(); },
      ngay: function (m, truong) { return Utils.parseNgay(tho(m, truong)); },
      soLuong: function (m, truong) { return Utils.parseSoLuong(tho(m, truong)); },
      /** Nhiều cột cấu hình cho một trường → CỘNG lại (ví dụ ba loại phí). Không cột nào có giá trị → null. */
      tien: function (m, truong) {
        var vt = viTri(truong);
        if (!vt.length) return null;
        var tong = null;
        vt.forEach(function (i) { var v = Utils.parseTien(m[i]); if (v != null) tong = (tong || 0) + v; });
        return tong;
      }
    };
  }

  return { doc: doc };
})();
