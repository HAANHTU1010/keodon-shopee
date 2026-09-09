/**
 * Normalize.gs — LỚP 2. Gom dòng xuất thành ĐƠN, tính bốn cột tiền cấp đơn, tra Mapping ra các dòng sẽ ghi.
 *
 * KHÔNG được biết dữ liệu đến từ đâu: không có tên sàn, không có tên cột file xuất.
 *
 * Khác bản v1 (GV-v2.2 mục 1.2, Context 4.2): vì tool GỘP Ô C/H/I/J/K/L cho cả đơn nên tiền chỉ có một bộ số
 * cho mỗi đơn — **bỏ toàn bộ phần phân bổ phí và giảm giá theo tỷ lệ từng dòng** (BR-08 cũ). Thuế cũng tính
 * một lần ở cấp đơn trên cơ sở (Σ tiền hàng − giảm giá shop).
 *
 * Đầu ra xuLy(): danh sách ĐƠN, mỗi đơn:
 *   { maDon, maGianHang, san, ngayDat, trangThai, tien: {H, I, J, K, gtgt, tncn}, dong: [ {tenVietTat, maHang, soLuong,
 *     tenListing, tenPhanLoai, soLuongListing, lyDo, ghiChu} ], soDongXuat, coDongChuaNhanRa }
 * Mỗi phần tử `dong` là MỘT dòng sẽ ghi vào sheet gian hàng (cấu phần combo đã được bung ở đây).
 */
var Normalize = (function () {

  /**
   * Thuế sàn khấu trừ, tách hai sắc thuế rồi cộng (Context 5.2 — tái lập đúng 713/719 giá trị nhân viên đã ghi):
   *   gtgt = round(cơ sở × 1%), tncn = round(cơ sở × 0,5%), tổng = gtgt + tncn.
   * `TONG_TY_LE` (làm tròn một lần trên 1,5%) chỉ khớp 670/719 — giữ làm tùy chọn cấu hình để so.
   */
  function tinhThue(coSo, cfg) {
    var g = cfg.chung.thue_gtgt_pct, t = cfg.chung.thue_tncn_pct;
    var gtgt = Utils.lamTron(coSo * g / 100);
    if (cfg.chung.thue_cach_tinh === 'TONG_TY_LE') {
      var tong = Utils.lamTron(coSo * (g + t) / 100);
      return { gtgt: gtgt, tncn: tong - gtgt, tong: tong };
    }
    var tncn = Utils.lamTron(coSo * t / 100);
    return { gtgt: gtgt, tncn: tncn, tong: gtgt + tncn };
  }

  /**
   * Chia một số tiền theo trọng số, làm tròn tới đồng, phần dư dồn phần tử CUỐI để tổng khớp tuyệt đối.
   * Chỉ dùng để lấy cơ sở tính thuế của từng dòng — KHÔNG dùng để ghi (tiền ghi một lần vào ô gộp).
   */
  function phanBo(tong, trongSo) {
    var n = trongSo.length;
    if (n === 0) return [];
    if (n === 1) return [Utils.lamTron(tong)];
    var s = 0;
    for (var i = 0; i < n; i++) s += (trongSo[i] || 0);
    if (s <= 0) { var kq = [Utils.lamTron(tong)]; for (var z = 1; z < n; z++) kq.push(0); return kq; }
    var out = [], daChia = 0;
    for (var j = 0; j < n - 1; j++) { var p = Utils.lamTron(tong * (trongSo[j] || 0) / s); out.push(p); daChia += p; }
    out.push(Utils.lamTron(tong) - daChia);
    return out;
  }

  /**
   * Bốn cột tiền của MỘT đơn (Context 5.2):
   *   H = Σ (giá ưu đãi × số lượng) các dòng
   *   I = mã giảm giá của Shop — lặp giống hệt trên mọi dòng của đơn (62/62 đơn thật) nên chỉ lấy MỘT lần
   *   J = phí cố định + phí dịch vụ + phí xử lý giao dịch — cũng cấp đơn, lấy một lần
   *   K = thuế. Hai cách, chọn bằng `CHUNG.thue_theo_dong`:
   *       TRUE  (mặc định) — làm tròn theo TỪNG DÒNG rồi cộng: cơ sở dòng = tiền dòng − giảm giá phân bổ theo tỷ lệ.
   *                          Đây là cách bản đối chứng đã nghiệm thu, tái lập đúng 392/393 đơn nhân viên gõ.
   *       FALSE — làm tròn MỘT LẦN trên cơ sở cả đơn (H − I), đúng câu chữ Context 5.2; khớp 391/393.
   *       Nhân viên gõ tay không nhất quán giữa hai cách (xem NOTES_DEV mục CHỜ CHỐT), nên để cấu hình được.
   *   Dù tính cách nào, K vẫn là MỘT số ghi vào ô gộp của cả đơn — không phân bổ tiền ra từng dòng (GV-v2.2 mục 1.2).
   * Phí/giảm giá khác nhau giữa các dòng (chưa gặp trong dữ liệu thật) → cộng dồn và ghi cảnh báo.
   */
  function tinhTienDon(ds, cfg) {
    var tienDong = ds.map(function (d) { return Utils.lamTron(d.tienKhachTra || 0); });
    var H = 0;
    tienDong.forEach(function (x) { H += x; });
    var canhBao = null;
    function capDon(truong, ten) {
      var giong = ds.every(function (d) { return Math.abs((d[truong] || 0) - (ds[0][truong] || 0)) < 0.005; });
      if (giong) return Utils.lamTron(ds[0][truong] || 0);
      var tong = 0;
      ds.forEach(function (d) { tong += Utils.lamTron(d[truong] || 0); });
      canhBao = (canhBao ? canhBao + '; ' : '') + ten + ' khác nhau giữa các dòng của đơn → cộng dồn (' + tong + ')';
      return tong;
    }
    // Nhãn dùng cho câu cảnh báo phải TRUNG TÍNH. Lớp 2 không được nhắc tên cột của file xuất Shopee:
    // đổi nguồn sang sàn khác thì câu cảnh báo vẫn đúng, và FR-21 canh giữ đúng ranh giới này.
    var I = capDon('giamGiaShop', 'Giảm giá của shop');
    var J = capDon('phiSan', 'Phí sàn');
    var gtgt = 0, tncn = 0;
    if (cfg.chung.thue_theo_dong !== false && ds.length > 1) {
      var mgg = phanBo(I, tienDong);
      tienDong.forEach(function (x, i) {
        var t = tinhThue(x - mgg[i], cfg);
        gtgt += t.gtgt; tncn += t.tncn;
      });
    } else {
      var t1 = tinhThue(H - I, cfg);
      gtgt = t1.gtgt; tncn = t1.tncn;
    }
    return { H: H, I: I, J: J, K: gtgt + tncn, gtgt: gtgt, tncn: tncn, canhBao: canhBao };
  }

  /**
   * Một dòng xuất → các dòng sẽ ghi (một, hoặc nhiều nếu có Cấu phần).
   * Chưa nhận ra → vẫn trả về một dòng với tenVietTat rỗng + lyDo (GV-v2.2 mục 1.5.5: vẫn ghi đơn, để trống D, tô vàng).
   *
   * `ghiChu` KHÔNG rỗng mà `lyDo` rỗng nghĩa là: ghép được mã, nhưng có điều người phải biết — tồn 0, hoặc
   * mã có giá vốn 0 (lãi bị thổi phồng, GV-v2.6 mục 0). Cả hai vỏ đều tô vàng theo đúng một luật `lyDo || ghiChu`,
   * nên chỉ cần điền `ghiChu` là dòng tự vàng và tự có Note — không dựng thêm cơ chế nào khác.
   */
  function dongGhiTuDongXuat(d, map) {
    var sl = Number(d.soLuongListing) || 0;
    var chung = {
      tenListing: d.tenListing || '', tenPhanLoai: d.tenPhanLoai || '',
      soLuongListing: sl, skuSan: d.skuSan || ''
    };
    var mr = MapListing.tra(map, d.maGianHang, d.tenListing, d.tenPhanLoai);
    if (!mr) return [Object.assign({}, chung, { tenVietTat: '', maHang: '', soLuong: sl, lyDo: 'TEN_MOI', ghiChu: MapListing.LY_DO.TEN_MOI })];
    if (!mr.__muc) {
      var ma = mr.__lyDo || 'CHUA_DIEN';
      var chuGoc = MapListing.LY_DO[ma] || 'chưa nhận ra tên hàng';
      return [Object.assign({}, chung, { tenVietTat: '', maHang: '', soLuong: sl, lyDo: ma,
        ghiChu: chuGoc + (mr.__chiTiet ? ': ' + mr.__chiTiet : '') + ' (Mapping dòng ' + mr.__dong + ')', dongMap: mr.__dong })];
    }
    var muc = mr.__muc;
    if (muc.cauPhan) {                                   // bung cấu phần: khách mua n thì mỗi cấu phần × n
      return muc.cauPhan.map(function (cp) {
        return Object.assign({}, chung, {
          tenVietTat: cp.item.tenVietTat, maHang: cp.item.maHang, soLuong: cp.soLuong * sl,
          lyDo: null, ghiChu: mr.__ghiChuThem || '', laCauPhan: true, dongMap: mr.__dong
        });
      });
    }
    return [Object.assign({}, chung, {
      tenVietTat: muc.item.tenVietTat, maHang: muc.item.maHang, soLuong: sl * muc.heSo,
      lyDo: null, ghiChu: mr.__ghiChuThem || '', heSo: muc.heSo, dongMap: mr.__dong
    })];
  }

  /**
   * @param {Object[]} dongXuat  dòng đã chuẩn hóa từ lớp 1 (một dòng = một dòng sản phẩm của file xuất)
   * @param {Object}   map       sheet Mapping đã đọc (MapListing.docBang)
   * @param {Object}   cfg
   * @returns {{don: Object[], canhBao: string[]}} — đơn giữ đúng thứ tự xuất hiện trong file
   */
  function xuLy(dongXuat, map, cfg) {
    var canhBao = [], theoDon = {}, thuTu = [];
    dongXuat.forEach(function (d) {
      var k = d.maGianHang + '|' + d.maDonSan;
      if (!theoDon[k]) { theoDon[k] = []; thuTu.push(k); }
      theoDon[k].push(d);
    });
    var don = [];
    thuTu.forEach(function (k) {
      var ds = theoDon[k];
      var thieu = ds.some(function (d) { return d.soLuongListing == null || d.tienKhachTra == null; });
      if (thieu) {
        canhBao.push('Đơn ' + ds[0].maDonSan + ': thiếu số lượng hoặc tiền trong file xuất → bỏ qua, cần kiểm tay');
        return;
      }
      var tien = tinhTienDon(ds, cfg);
      if (tien.canhBao) canhBao.push('Đơn ' + ds[0].maDonSan + ': ' + tien.canhBao);
      var dong = [];
      ds.forEach(function (d) {
        dongGhiTuDongXuat(d, map).forEach(function (x) { dong.push(x); });
      });
      var chuaNhanRa = dong.filter(function (x) { return x.lyDo; });
      chuaNhanRa.forEach(function (x) {
        canhBao.push('Đơn ' + ds[0].maDonSan + ': chưa nhận ra "' + x.tenListing + '"' + (x.tenPhanLoai ? ' / ' + x.tenPhanLoai : '') + ' — ' + x.ghiChu);
      });
      don.push({
        maDon: String(ds[0].maDonSan), maGianHang: ds[0].maGianHang, san: ds[0].san,
        ngayDat: ds[0].ngayDat, trangThai: ds[0].trangThai, trangThaiRaw: ds[0].trangThaiRaw,
        tien: tien, dong: dong, soDongXuat: ds.length,
        coDongChuaNhanRa: chuaNhanRa.length > 0,
        ghiChuDon: dong.map(function (x) { return x.ghiChu; }).filter(Boolean)
      });
    });
    return { don: don, canhBao: canhBao };
  }

  return { tinhThue: tinhThue, tinhTienDon: tinhTienDon, dongGhiTuDongXuat: dongGhiTuDongXuat, xuLy: xuLy };
})();
