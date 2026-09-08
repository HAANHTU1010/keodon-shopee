/**
 * KeyIn.gs — LỚP 3. Lập KẾ HOẠCH ghi đơn vào sheet gian hàng (GV-v2.2 mục 1.2, 1.4, 1.5; Context 7.1).
 * Thuần logic, không đụng bảng tính: nhận "ảnh chụp" sheet, trả về danh sách ô cần ghi, vùng cần gộp,
 * công thức cần kéo, dòng cần tô vàng, ô ghi chú. Vỏ (ExcelJS trên máy / Apps Script trên Google Sheet) thực thi.
 *
 * Mười quy tắc (Context 7.1):
 *  1. Chỉ THÊM dòng dưới dòng dữ liệu cuối. Không chèn giữa, không sắp xếp, không xóa, không sửa dòng đã có.
 *  2. Ghi 9 cột A, B (để trống), C, D, G, H, I, J, K.
 *     - Chế độ SHEET (Google Sheet): E, F, M, N là ARRAYFORMULA một ô duy nhất → **không chạm**; chỉ kéo cột L.
 *     - Chế độ EXCEL (giai đoạn 1): kéo dài E, F, L, M, N nếu dòng đích chưa có.
 *  3. Đơn nhiều sản phẩm: GỘP dọc C, H, I, J, K, L cho cả đơn; D và G ghi riêng từng dòng.
 *  4. Cột A ngày chạy; C mã đơn dạng chữ (giữ số 0 đầu).
 *  5. Cột G = số lượng Shopee × hệ số (hoặc số lượng của từng cấu phần).
 *  6. Chống trùng: quét cột C của chính sheet (kể cả mã trong ô gộp); đã có thì bỏ qua.
 *  7. Chưa nhận ra tên hàng: vẫn ghi đơn, để trống D, tô vàng cả dòng, ghi lý do vào cột `Note`.
 *  8. Không ghi đè ô người đã điền. Ngoại lệ duy nhất: ô cột công thức chứa số gõ tay mồ côi ở dòng tool ghi đơn mới.
 *  9. Ghi xong tự kiểm tra (việc của vỏ): vùng dữ liệu cũ, ô gộp cũ, tiêu đề, dòng tổng phải y nguyên.
 * 10. Giai đoạn 1 luôn ghi ra file mới; file gốc không bao giờ bị đụng.
 */
var KeyIn = (function () {

  var SO_THONG_BAO_TRUNG_TOI_DA = 20;
  var RE_VUNG = /\$?([A-Z]{1,3})\$?(\d+):\$?([A-Z]{1,3})\$?(\d+)/g;
  /** Cột được gộp dọc cho đơn nhiều dòng (Context 4.2 — đo trên file thật: 71/71 đơn, mỗi cột 71 vùng). */
  var COT_GOP = ['cot_ma_don', 'cot_tong_tien_sp', 'cot_mgg_shop', 'cot_chi_phi', 'cot_thue', 'cot_doanh_thu'];

  function o(ss, r, c) {
    var row = ss.giaTri[r - 1];
    return row ? (row[c - 1] == null ? null : row[c - 1]) : null;
  }
  function ct(ss, r, c) {
    var row = ss.congThuc[r - 1];
    return row ? (row[c - 1] == null ? null : row[c - 1]) : null;
  }
  function laMang(ss, r, c) {
    var row = ss.mang && ss.mang[r - 1];
    return !!(row && row[c - 1]);
  }

  /** Dòng cuối có giá trị ở cột mã đơn hoặc tên viết tắt. Chưa có dữ liệu → dong_dau − 1. */
  function dongDuLieuCuoi(ss, k) {
    var cuoi = k.dong_dau - 1;
    var n = Math.max(ss.soDong || 0, ss.giaTri.length);
    for (var r = k.dong_dau; r <= n; r++) {
      if (!Utils.laRong(o(ss, r, k.cot_ma_don)) || !Utils.laRong(o(ss, r, k.cot_ten_viet_tat))) cuoi = r;
    }
    return cuoi;
  }

  /** mã đơn → dòng đầu của đơn trong sheet (đơn gộp ô: mã chỉ nằm ở ô trên cùng nên vẫn đọc được). */
  function maDonDaCo(ss, k, dongCuoi) {
    var s = {};
    for (var r = k.dong_dau; r <= dongCuoi; r++) {
      var v = o(ss, r, k.cot_ma_don);
      if (!Utils.laRong(v) && s[Utils.chuoiMaDon(v)] == null) s[Utils.chuoiMaDon(v)] = r;
    }
    return s;
  }

  /**
   * Cột `Note` = cột trống đầu tiên bên phải cột cuối cùng có tiêu đề ở dòng 2 (GV-v2.2 mục 1.4).
   * Đo trên file thật: Shopee mall → P (sau `Còn Nợ` ở O); Offood → S (sau `BB` ở R); Importmart, Babyiu → P.
   */
  function cotNote(ss, k) {
    if (k.cot_note) return k.cot_note;
    var head = ss.giaTri[k.dong_header - 1] || [];
    var cuoi = 0;
    for (var c = 0; c < head.length; c++) {
      var v = head[c];
      if (Utils.laRong(v)) continue;
      if (String(v).trim() === k.tieu_de_note) return c + 1;      // đã có cột Note từ lần chạy trước
      cuoi = c + 1;
    }
    return cuoi + 1;
  }

  /** Đọc =SUM(H4:H901)… ở dòng tổng → dòng cuối nhỏ nhất mà dòng tổng còn bao phủ. */
  function gioiHanDongTong(ss, k) {
    var gh = null, moTa = '';
    var row = ss.congThuc[k.dong_tong - 1] || [];
    for (var c = 0; c < row.length; c++) {
      var t = row[c];
      if (!t) continue;
      RE_VUNG.lastIndex = 0;
      var m;
      while ((m = RE_VUNG.exec(t)) !== null) {
        if (m[1] !== m[3] || +m[2] !== k.dong_dau) continue;
        if (gh === null || +m[4] < gh) { gh = +m[4]; moTa = Utils.chuCot(c + 1) + k.dong_tong + '=' + t; }
      }
    }
    return { gioiHan: gh, moTa: moTa };
  }

  /** Đọc vùng SUMIF trong sheet `Tổng xuất` tham chiếu tới tenSheet → dòng cuối nhỏ nhất. */
  function gioiHanTongXuat(ssTX, tenSheet) {
    if (!ssTX) return { gioiHan: null, moTa: '' };
    var gh = null, moTa = '';
    var ten = tenSheet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var re = new RegExp("(?:'" + ten + "'|(?<![A-Za-z0-9_'])" + ten + ')!\\$?[A-Z]{1,3}\\$?(\\d+):\\$?[A-Z]{1,3}\\$?(\\d+)', 'g');
    for (var r = 0; r < ssTX.congThuc.length; r++) {
      var row = ssTX.congThuc[r] || [];
      for (var c = 0; c < row.length; c++) {
        var t = row[c];
        if (!t || t.indexOf(tenSheet) < 0) continue;
        re.lastIndex = 0;
        var m;
        while ((m = re.exec(t)) !== null) {
          if (gh === null || +m[2] < gh) { gh = +m[2]; moTa = "'" + ssTX.ten + "'!" + Utils.chuCot(c + 1) + (r + 1); }
        }
      }
    }
    return { gioiHan: gh, moTa: moTa };
  }

  /**
   * @param {Object}   ss    ảnh chụp sheet gian hàng { ten, soDong, giaTri[][], congThuc[][], mang[][] }
   * @param {Object}   ssTX  ảnh chụp sheet `Tổng xuất` (hoặc null) — chỉ để cảnh báo vùng SUMIF
   * @param {Object[]} donDS đơn của MỘT gian hàng ở lần chạy này (Normalize.xuLy → .don)
   * @param {Object}   cfg
   */
  function lapKeHoach(ss, ssTX, donDS, cfg) {
    var k = cfg.keyin;
    var maGianHang = donDS.length ? donDS[0].maGianHang : '';
    var dongCuoi = dongDuLieuCuoi(ss, k);
    var daCo = maDonDaCo(ss, k, dongCuoi);
    var cNote = cotNote(ss, k);
    var laSheet = cfg.chung.che_do_cong_thuc === 'SHEET';
    var plan = {
      tenSheet: ss.ten, maGianHang: maGianHang, dongCuoiCu: dongCuoi, dongCuoiMoi: dongCuoi,
      dongMau: dongCuoi >= k.dong_dau ? dongCuoi : null, cotNote: cNote, cheDoCongThuc: laSheet ? 'SHEET' : 'EXCEL',
      oGhi: [], congThucKeo: [], gopO: [], toVang: [], ghiChu: [], tieuDeNote: null, giaTriTayThay: [],
      viTri: {}, thongKe: { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, giaTriTayThay: 0 },
      canhBao: [], thongBao: []
    };
    var canTieuDe = Utils.laRong(o(ss, k.dong_header, cNote));
    var r = dongCuoi + 1;
    var nguonCt = {};
    var soTrung = 0;
    // cột công thức phải chạm tới: chế độ SHEET chỉ cột L (E/F/M/N là ARRAYFORMULA một ô — ghi vào là hỏng cả cột)
    var cotCongThuc = laSheet ? [k.cot_doanh_thu] : k.cot_cong_thuc;

    donDS.forEach(function (don) {
      var ma = Utils.chuoiMaDon(don.maDon);
      if (daCo[ma] != null) {
        soTrung++; plan.thongKe.donDaCo++;
        if (soTrung <= SO_THONG_BAO_TRUNG_TOI_DA) plan.thongBao.push('Đơn ' + ma + " đã có trong sheet '" + ss.ten + "' (dòng " + daCo[ma] + ') → bỏ qua');
        return;
      }
      var soDong = don.dong.length;
      if (!soDong) return;
      var r0 = r;
      don.dong.forEach(function (d, i) {
        ghiMotDong(plan, r, don, d, k, i === 0, laSheet);
        if (d.lyDo) {                                            // chưa nhận ra → tô vàng cả dòng + ghi lý do vào Note
          plan.toVang.push(r);
          plan.ghiChu.push({ r: r, c: cNote, text: d.ghiChu });
          plan.thongKe.dongVang++;
        } else if (d.ghiChu) {                                   // ghép được nhưng có điều cần biết (ví dụ tồn 0)
          plan.toVang.push(r);
          plan.ghiChu.push({ r: r, c: cNote, text: d.ghiChu });
          plan.thongKe.dongVang++;
        }
        r++;
        plan.thongKe.dongGhi++;
      });
      // kéo công thức: chế độ EXCEL kéo mọi dòng mới; cột L (có gộp ô) chỉ kéo ở dòng đầu của đơn
      for (var rr = r0; rr < r; rr++) {
        cotCongThuc.forEach(function (c) {
          if (c === k.cot_doanh_thu && rr !== r0) return;         // L nằm trong ô gộp → chỉ ô trên cùng giữ công thức
          keoCongThuc(plan, ss, rr, c, k, nguonCt);
        });
      }
      if (soDong > 1) {                                          // gộp ô C, H, I, J, K, L cho cả đơn
        COT_GOP.forEach(function (ten) { plan.gopO.push({ c: k[ten], r1: r0, r2: r - 1 }); });
        plan.thongKe.donGopO++;
      }
      plan.viTri[ma] = ss.ten + '!' + r0 + (soDong > 1 ? '–' + (r - 1) : '');
      daCo[ma] = r0;
      plan.thongKe.donGhi++;
    });

    if (soTrung > SO_THONG_BAO_TRUNG_TOI_DA) plan.thongBao.push('... và ' + (soTrung - SO_THONG_BAO_TRUNG_TOI_DA) + " đơn khác đã có trong sheet '" + ss.ten + "'");
    plan.dongCuoiMoi = r - 1;
    if (plan.ghiChu.length && canTieuDe) plan.tieuDeNote = { r: k.dong_header, c: cNote, text: k.tieu_de_note };
    if (plan.dongCuoiMoi > dongCuoi) canhBaoGioiHan(plan, ss, ssTX, k);
    return plan;
  }

  /** Chín cột của một dòng: A ngày · B trống · C mã đơn (chỉ dòng đầu) · D · G · H/I/J/K (chỉ dòng đầu). */
  function ghiMotDong(plan, r, don, d, k, dongDau, laSheet) {
    function push(c, gt, fmt) { plan.oGhi.push({ r: r, c: c, gt: gt, dinhDang: fmt }); }
    push(k.cot_ngay, Utils.laNgay(don.ngayGhi) ? don.ngayGhi : Utils.chiNgay(Utils.parseNgay(don.ngayGhi)), k.dinh_dang_ngay);
    // cột B "Nguồn đơn": nhân viên để trống 747/747 dòng (Context 4.1) → tool cũng để trống
    if (k.ghi_nguon_don) push(k.cot_nguon_don, don.tenGianHienThi || don.maGianHang, null);
    if (dongDau) push(k.cot_ma_don, Utils.chuoiMaDon(don.maDon), '@');
    push(k.cot_ten_viet_tat, d.tenVietTat || null, 'General');
    push(k.cot_so_luong, Number(d.soLuong) || 0, 'General');
    if (dongDau) {
      push(k.cot_tong_tien_sp, don.tien.H, k.dinh_dang_tien);
      push(k.cot_mgg_shop, don.tien.I, k.dinh_dang_tien);
      push(k.cot_chi_phi, don.tien.J, k.dinh_dang_tien);
      push(k.cot_thue, don.tien.K, k.dinh_dang_tien);
    }
  }

  /**
   * Ô (r, c) chưa có công thức → chép công thức gần nhất phía trên rồi dịch số dòng.
   * Ô đang chứa GIÁ TRỊ (không phải công thức) ở dòng tool ghi đơn mới → số gõ tay mồ côi (GV-v2.2 mục 1.5.6):
   * trả lại công thức và ghi nhận để vỏ đưa vào nhật ký. Dòng đã có mã đơn không bao giờ đi qua đây.
   */
  function keoCongThuc(plan, ss, r, c, k, nguonCt) {
    var coSan = ct(ss, r, c);
    if (coSan) { nguonCt[c] = { r: r, text: coSan, mang: laMang(ss, r, c) }; return; }
    var giaTriCu = o(ss, r, c);
    var moCoi = giaTriCu != null && !Utils.laRong(giaTriCu);
    if (!(c in nguonCt)) {
      nguonCt[c] = null;
      for (var rr = r - 1; rr >= k.dong_dau; rr--) {
        var t = ct(ss, rr, c);
        if (t) { nguonCt[c] = { r: rr, text: t, mang: laMang(ss, rr, c) }; break; }
      }
    }
    var ng = nguonCt[c];
    if (!ng) {
      if (moCoi) plan.canhBao.push(ss.ten + '!' + Utils.chuCot(c) + r + ': ô cột công thức chứa số gõ tay "' + giaTriCu + '" nhưng phía trên không có công thức nào để kéo → giữ nguyên, cần kiểm tay');
      return;
    }
    var text = Utils.dichCongThuc(ng.text, ng.r, r);
    if (moCoi) {
      plan.giaTriTayThay.push({ r: r, c: c, giaTri: giaTriCu, text: text });
      plan.thongKe.giaTriTayThay++;
    }
    plan.congThucKeo.push({ r: r, c: c, text: text, mang: ng.mang, tuDong: ng.r, thayGiaTriTay: moCoi });
    nguonCt[c] = { r: r, text: text, mang: ng.mang };
  }

  function canhBaoGioiHan(plan, ss, ssTX, k) {
    var moi = plan.dongCuoiMoi;
    var dt = gioiHanDongTong(ss, k);
    if (dt.gioiHan === null) plan.canhBao.push("Không đọc được vùng SUM ở dòng " + k.dong_tong + " của sheet '" + ss.ten + "' → tự kiểm tra dòng tổng có bao phủ tới dòng " + moi + ' chưa');
    else if (moi > dt.gioiHan) plan.canhBao.push('CẢNH BÁO: đã ghi tới dòng ' + moi + ' > vùng dòng tổng (' + dt.moTa + ") → cần kéo lại công thức dòng " + k.dong_tong + " của sheet '" + ss.ten + "'");
    else if (dt.gioiHan - moi <= k.nguong_sap_het) plan.canhBao.push('Sắp hết vùng dòng tổng (' + dt.moTa + '): còn ' + (dt.gioiHan - moi) + ' dòng');
    if (!ssTX) return;
    var tx = gioiHanTongXuat(ssTX, ss.ten);
    if (tx.gioiHan === null) plan.canhBao.push("Không đọc được vùng SUMIF trong sheet '" + ssTX.ten + "' cho '" + ss.ten + "' → tự kiểm tra công thức tồn kho");
    else if (moi > tx.gioiHan) plan.canhBao.push('CẢNH BÁO: đã ghi tới dòng ' + moi + ' > vùng SUMIF (' + tx.moTa + ' tới dòng ' + tx.gioiHan + ") → tồn kho sẽ thiếu, cần mở rộng vùng SUMIF trong '" + ssTX.ten + "'");
    else if (tx.gioiHan - moi <= k.nguong_sap_het) plan.canhBao.push('Sắp hết vùng SUMIF (' + tx.moTa + ' tới dòng ' + tx.gioiHan + '): còn ' + (tx.gioiHan - moi) + ' dòng');
  }

  return {
    COT_GOP: COT_GOP,
    dongDuLieuCuoi: dongDuLieuCuoi,
    maDonDaCo: maDonDaCo,
    cotNote: cotNote,
    gioiHanDongTong: gioiHanDongTong,
    gioiHanTongXuat: gioiHanTongXuat,
    lapKeHoach: lapKeHoach
  };
})();
