/**
 * Config.gs — dựng đối tượng cấu hình từ mặc định (CaiDat.cauHinhMacDinh) + phần ghi đè của người vận hành.
 *
 * Bản v1 đọc cấu hình từ sheet `CAU_HINH` trong file tracking. GV-v2.2 mục 3 chốt tool chỉ được thêm một sheet
 * `Mapping sản phẩm`, nên cấu hình nay nằm trong mã và ghi đè bằng khóa `cau_hinh` của `CAU_HINH_VAN_HANH.json`.
 *
 * Chuẩn hóa sau khi hợp nhất: chữ cột ('A') → chỉ số 1-based, chuỗi trạng thái → khóa đã chuẩn hóa,
 * và kiểm tra những gì thiếu thì HỎNG NGAY, không chạy tiếp với cấu hình nửa vời.
 */
var Config = (function () {

  var TRANG_THAI_CHUAN = ['CHO_XAC_NHAN', 'CHO_LAY_HANG', 'DANG_GIAO', 'DA_GIAO', 'DA_HUY', 'DANG_HOAN', 'DA_HOAN', 'THAT_BAI', 'KHAC'];
  var CACH_TINH_THUE = ['TACH_ROI_CONG', 'TONG_TY_LE'];
  var CHE_DO_CONG_THUC = ['EXCEL', 'SHEET'];
  var KEYIN_COT = ['cot_ngay', 'cot_nguon_don', 'cot_ma_don', 'cot_ten_viet_tat', 'cot_so_luong',
    'cot_tong_tien_sp', 'cot_mgg_shop', 'cot_chi_phi', 'cot_thue', 'cot_doanh_thu'];

  /** Gộp sâu: giá trị của `ghiDe` thắng, đối tượng thì gộp tiếp, mảng thì thay hẳn. */
  function gop(goc, ghiDe) {
    if (ghiDe == null) return goc;
    if (Object.prototype.toString.call(goc) !== '[object Object]') return ghiDe;
    var out = {};
    Object.keys(goc).forEach(function (k) { out[k] = goc[k]; });
    Object.keys(ghiDe).forEach(function (k) {
      out[k] = (Object.prototype.toString.call(goc[k]) === '[object Object]' && Object.prototype.toString.call(ghiDe[k]) === '[object Object]')
        ? gop(goc[k], ghiDe[k]) : ghiDe[k];
    });
    return out;
  }

  /**
   * @param {Object} [ghiDe]  phần ghi đè (khóa `cau_hinh` trong CAU_HINH_VAN_HANH.json hoặc tùy chọn khi chạy test)
   * @returns cfg đã chuẩn hóa: { chung, gianHang, keyin, danhMuc, cot, cotBatBuoc, trangThai, trangThaiTienTo, trangThaiHoan, trangThaiBo, cotPII }
   */
  function tao(ghiDe) {
    var cfg = gop(CaiDat.cauHinhMacDinh(), ghiDe || {});

    // ---- CHUNG ----
    cfg.chung.che_do_cong_thuc = String(cfg.chung.che_do_cong_thuc || 'EXCEL').trim().toUpperCase();
    if (CHE_DO_CONG_THUC.indexOf(cfg.chung.che_do_cong_thuc) < 0)
      throw new Error('che_do_cong_thuc = "' + cfg.chung.che_do_cong_thuc + '" không hợp lệ; hợp lệ: ' + CHE_DO_CONG_THUC.join(', '));
    cfg.chung.thue_cach_tinh = String(cfg.chung.thue_cach_tinh || 'TACH_ROI_CONG').trim().toUpperCase();
    if (CACH_TINH_THUE.indexOf(cfg.chung.thue_cach_tinh) < 0)
      throw new Error('thue_cach_tinh = "' + cfg.chung.thue_cach_tinh + '" chưa hỗ trợ; hợp lệ: ' + CACH_TINH_THUE.join(', '));
    cfg.chung.thue_theo_dong = cfg.chung.thue_theo_dong !== false;
    ['thue_gtgt_pct', 'thue_tncn_pct'].forEach(function (k) {
      cfg.chung[k] = Number(cfg.chung[k]);
      if (isNaN(cfg.chung[k])) throw new Error('Cấu hình ' + k + ' phải là số');
    });

    // ---- gian hàng ----
    if (!cfg.gianHang || !Object.keys(cfg.gianHang).length) throw new Error('Cấu hình thiếu danh sách gian hàng');
    Object.keys(cfg.gianHang).forEach(function (m) {
      var g = cfg.gianHang[m];
      if (!g.sheet) throw new Error('Gian hàng ' + m + ': thiếu tên sheet trong file tracking');
      g.ma = m;
      g.ten = g.ten || m;
    });

    // ---- bố cục sheet gian hàng ----
    var k = cfg.keyin;
    KEYIN_COT.forEach(function (t) {
      if (Utils.laRong(k[t])) throw new Error('Cấu hình keyin thiếu ' + t);
      k[t] = Utils.chiSoCot(k[t]);
    });
    ['dong_header', 'dong_tong', 'dong_dau', 'nguong_sap_het'].forEach(function (t) {
      k[t] = Number(k[t]);
      if (isNaN(k[t])) throw new Error('Cấu hình keyin.' + t + ' phải là số');
    });
    k.cot_cong_thuc = String(k.cot_cong_thuc || 'E,F,L,M,N').split(',').map(function (x) { return Utils.chiSoCot(x); });
    k.cot_note = Utils.laRong(k.cot_note) ? null : Utils.chiSoCot(k.cot_note);
    k.tieu_de_note = String(k.tieu_de_note || 'Note');
    k.ghi_nguon_don = k.ghi_nguon_don === true;
    var cotGhi = KEYIN_COT.filter(function (t) { return t !== 'cot_doanh_thu'; }).map(function (t) { return k[t]; });
    var trung = k.cot_cong_thuc.filter(function (c) { return cotGhi.indexOf(c) >= 0; });
    if (trung.length) throw new Error('Cột công thức ' + trung.map(Utils.chuCot).join(',') + ' trùng cột tool ghi giá trị');

    // ---- ánh xạ cột file xuất ----
    ['maDonSan', 'ngayDat', 'trangThai', 'tenListing', 'soLuongListing', 'tienKhachTra'].forEach(function (t) {
      if (!cfg.cot[t] || !cfg.cot[t].length) throw new Error('Cấu hình thiếu tên cột cho trường "' + t + '"');
    });

    // ---- trạng thái: tách khóa tiền tố, chuẩn hóa khóa ----
    var tt = {}, tienTo = [];
    Object.keys(cfg.trangThai).forEach(function (khoa) {
      var chuan = String(cfg.trangThai[khoa]).trim().toUpperCase();
      if (TRANG_THAI_CHUAN.indexOf(chuan) < 0) throw new Error('Trạng thái "' + khoa + '" → "' + chuan + '" không thuộc bộ chuẩn');
      if (/\*$/.test(khoa)) tienTo.push({ tienTo: Utils.chuanHoaChuoi(khoa.slice(0, -1)), chuan: chuan });
      else tt[Utils.chuanHoaChuoi(khoa)] = chuan;
    });
    cfg.trangThai = tt;
    cfg.trangThaiTienTo = tienTo.sort(function (a, b) { return b.tienTo.length - a.tienTo.length; });
    var th = {};
    Object.keys(cfg.trangThaiHoan || {}).forEach(function (khoa) { th[Utils.chuanHoaChuoi(khoa)] = String(cfg.trangThaiHoan[khoa]).trim().toUpperCase(); });
    cfg.trangThaiHoan = th;
    cfg.trangThaiBo = (cfg.trangThaiBo || []).map(function (x) { return String(x).trim().toUpperCase(); });

    return cfg;
  }

  /** Tra trạng thái nguồn → chuẩn: khớp đúng trước, rồi tiền tố (dài nhất trước); không có → null. */
  function traTrangThai(cfg, raw, laHoan) {
    var k = Utils.chuanHoaChuoi(raw);
    if (!k) return null;
    if (laHoan) return cfg.trangThaiHoan[k] || null;
    if (cfg.trangThai[k]) return cfg.trangThai[k];
    for (var i = 0; i < cfg.trangThaiTienTo.length; i++) {
      if (k.indexOf(cfg.trangThaiTienTo[i].tienTo) === 0) return cfg.trangThaiTienTo[i].chuan;
    }
    return null;
  }

  /** Gian hàng theo mã; không có → ném lỗi có gợi ý (hỏng ồn ào). */
  function gianHang(cfg, ma) {
    var g = cfg.gianHang[ma];
    if (!g) throw new Error('Mã gian hàng "' + ma + '" không có trong cấu hình; hợp lệ: ' + Object.keys(cfg.gianHang).join(', '));
    return g;
  }

  return { tao: tao, traTrangThai: traTrangThai, gianHang: gianHang, TRANG_THAI_CHUAN: TRANG_THAI_CHUAN, CHE_DO_CONG_THUC: CHE_DO_CONG_THUC };
})();
