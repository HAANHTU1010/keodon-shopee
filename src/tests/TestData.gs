/**
 * TestData.gs — dữ liệu thử. Sinh bảng "giống file xuất" theo đúng tên cột đang cấu hình (đổi tên cột trong cấu hình
 * thì dữ liệu thử đổi theo — test đổi tên cột), sheet gian hàng giả theo bố cục thật, và sheet Mapping giả.
 * Có sẵn cột dữ liệu cá nhân giả để chứng minh chúng không lọt ra ngoài (Context 5.6).
 */
var TestData = (function () {

  var PII_COT = ['Tên Người nhận', 'Số điện thoại', 'Địa chỉ nhận hàng'];
  var PII_GIA_TRI = ['Nguyễn Văn Thử', '0912345678', '12 Phố Thử Nghiệm, Quận Giả'];

  /** Dạng tách dấu thanh thật gặp trong file Shopee (viết bằng mã escape để trình soạn thảo không tự gộp về NFC). */
  var GIA_UU_DAI_TACH_DAU = 'Giá ưu đãi';

  /** Danh mục kho giả — cột `ton` để thử quy tắc chọn lô (Context 6.4). */
  function danhMucBang() {
    return [
      [], ['', 'STT', 'Tên sản phẩm ', 'Tên viết tắt', 'Mã hàng', 'Đơn vị ', 'Giá vốn ', 'Tổng tồn'],
      ['', 1, 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', 'dt5', 1548, 'HOP', 189000, 25],
      ['', 2, 'Sữa Hạt Nature Kids thùng', 'Hạt TE', 1511, 'THUNG', 500000, 10],
      ['', 3, 'Sữa Hạt Nature Kids lốc', 'Hạt TE Lốc', 1621, 'LOC', 250000, 8],
      ['', 4, 'Sữa A2 Plus', 'A2', 1627, 'THUNG', 400000, 5],
      ['', 5, 'Sữa hạt hộp lẻ', 'hộp lẻ', 1700, 'HOP', 40000, 100],
      ['', 6, 'Dầu dừa 250ml lô cũ', 'DD 250', 1630, 'CHAI', 90000, 0],
      ['', 7, 'Dầu dừa 250ml lô mới', 'DD250', 1636, 'CHAI', 95000, 16],
      ['', 8, 'Khăn gừng lô mới', 'khăn gừng', 1623, 'HOP', 70000, 43],
      ['', 9, 'Khăn gừng lô cũ', 'khăn gừng 1', 1614, 'HOP', 68000, 3],
      ['', 10, 'Khăn vệ sinh', 'kvs', 1650, 'HOP', 50000, 12],
      ['', 11, 'Sữa hạt Nature Meal', 'sh', 1589, 'THUNG', 300000, 70],
      ['', 12, 'Hết hàng cả hai lô A', 'het A', 1901, 'HOP', 1000, 0],
      ['', 13, 'Hết hàng cả hai lô B', 'het B', 1902, 'HOP', 1000, 0]
    ];
  }

  /**
   * Sheet `Mapping sản phẩm` giả — 12 cột như file DEMO của BA.
   * @param {Object[]} [themDong]  dòng bổ sung dạng đối tượng theo tên cột chuẩn
   */
  function mappingBang(themDong) {
    var h = SCHEMA.MAPPING.slice();
    var ds = [
      d('Shopee mall', 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', '', { tvt: 'dt5', xn: 'CÓ' }),
      d('Shopee mall', 'Sữa Hạt Nature Kids', 'Thùng 24 Hộp', { tvt: 'Hạt TE', xn: 'CÓ' }),
      d('Shopee mall', 'Sữa Hạt Nature Kids', 'Lốc 6 Hộp', { tvt: 'Hạt TE Lốc', xn: 'CÓ' }),
      d('Shopee mall', 'Sữa Hạt Nature Kids', 'Nửa Thùng 12 Hộp', { tvt: 'Hạt TE Lốc', heSo: 2, xn: 'CÓ' }),
      d('Shopee mall', 'Sữa hạt lốc 6 quy về hộp', '', { tvt: 'hộp lẻ', heSo: 6, xn: 'CÓ' }),
      d('Shopee mall', 'Sữa A2 Plus thùng 18', '', { tvt: 'A2', xn: 'CÓ' }),
      d('Shopee mall', 'Combo đi sinh Altawell', '', { cauPhan: 'khăn gừng x 1; kvs x 1', xn: 'CÓ' }),
      d('Shopee mall', 'Thùng 24H mua 1 tặng lốc', 'Thùng 24H Nguyên Vị,Set 6H Nguyên Vị', { cauPhan: 'Hạt TE x 1; Hạt TE Lốc x 1', xn: 'CÓ' }),
      d('Shopee mall', 'Dầu Dừa Vietcoco', 'CHAI 250ML', { tvt: 'DD 250/DD250', xn: 'CÓ' }),          // nhiều lô: DD 250 tồn 0, DD250 tồn 16
      d('Shopee mall', 'Khăn Gừng Altawell', '', { tvt: 'khăn gừng/khăn gừng 1', xn: 'CÓ' }),          // cả hai còn tồn: 43 và 3 → chọn 3
      d('Shopee mall', 'Hàng hết cả hai lô', '', { tvt: 'het A/het B', xn: 'CÓ' }),                     // đều 0 → mã đầu + ghi chú
      d('Shopee mall', 'Combo sai cú pháp', '', { cauPhan: 'dt5 2 hộp; khong_co x 1', xn: 'CÓ' }),
      d('Shopee mall', 'Listing chưa tick', '', { tvt: 'dt5' }),                                        // có tên viết tắt nhưng chưa ghi CÓ
      d('Shopee mall', 'Listing tên viết tắt lạ', '', { tvt: 'khong_co_trong_kho', xn: 'CÓ' }),
      d('Shopee mall', 'Listing để trống', '', {})
    ];
    (themDong || []).forEach(function (o) { ds.push(Utils.doiTuongSangMang(h, o)); });
    return [h].concat(ds);
  }

  /** Một dòng Mapping theo thứ tự cột chuẩn. */
  function d(gian, ten, phanLoai, o) {
    o = o || {};
    return [gian, ten, phanLoai || '', o.tvt || '', o.heSo == null ? 1 : o.heSo, o.cauPhan || '', o.xn || '',
      '', '', '', o.ngay || '', o.ghiChu || ''];
  }

  /** Đơn mẫu; ghi đè trường nào cần bằng tham số. */
  function don(ghiDe) {
    var o = {
      maDon: 'TEST0904DDDD04', ngay: '2026-09-04 14:59', trangThai: 'Chờ giao hàng', hoan: '',
      dongs: [{ ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', phanLoai: '', sl: 1, gia: 305000 }],
      ggShop: 0, ggSan: 0, phiCoDinh: 42700, phiDV: 19775, phiXL: 18300
    };
    Object.keys(ghiDe || {}).forEach(function (k) { o[k] = ghiDe[k]; });
    return o;
  }

  function tien(n) { return Number(n).toFixed(2); }   // file xuất ghi '305000.00'

  /**
   * Bảng 2 chiều giống sheet `orders` của file xuất: tiêu đề = mọi cột đang cấu hình + cột cá nhân giả + cột nhiễu.
   * Giá trị cấp đơn lặp lại ở mọi dòng của đơn (đúng cách file xuất thể hiện).
   * tuyChon: { boCot: [tên cột bỏ], tachDau: true (tiêu đề tách dấu thanh), tatCa: true (thêm cột `Lý do hủy`) }
   */
  function bangNguon(cfg, cacDon, tuyChon) {
    tuyChon = tuyChon || {};
    var cot = cfg.cot;
    var head = [];
    Object.keys(cot).forEach(function (t) {
      if (t === 'lyDoHuy' && !tuyChon.tatCa) return;
      cot[t].forEach(function (c) { if (head.indexOf(c) < 0) head.push(c); });
    });
    (tuyChon.boCot || []).forEach(function (c) { var i = head.indexOf(c); if (i >= 0) head.splice(i, 1); });
    head = head.concat(PII_COT).concat(['Mã Kiện Hàng', 'Cột nhiễu']);
    var headGhi = head.map(function (h) { return (tuyChon.tachDau && h === 'Giá ưu đãi') ? GIA_UU_DAI_TACH_DAU : h; });
    var bang = [headGhi];
    cacDon.forEach(function (o) {
      o.dongs.forEach(function (dg) {
        var v = {};
        function dat(t, gt) { if (cot[t] && cot[t][0]) v[cot[t][0]] = gt; }
        dat('maDonSan', o.maDon);
        dat('ngayDat', o.ngay);
        dat('trangThai', o.trangThai);
        dat('trangThaiHoan', o.hoan);
        if (tuyChon.tatCa) dat('lyDoHuy', o.lyDoHuy || '');
        dat('skuSan', dg.sku || '');
        dat('tenListing', dg.ten);
        dat('tenPhanLoai', dg.phanLoai || '');
        dat('soLuongListing', String(dg.sl));
        dat('donGia', tien(dg.gia));
        dat('tienKhachTra', tien(dg.gia * dg.sl));
        dat('giamGiaShop', tien(dg.ggShop != null ? dg.ggShop : o.ggShop));
        dat('giamGiaSan', tien(o.ggSan || 0));
        if (cot.phiSan) {
          var phi = dg.phi != null ? [dg.phi, 0, 0] : [o.phiCoDinh, o.phiDV, o.phiXL];
          cot.phiSan.forEach(function (c, i) { v[c] = tien(phi[i] || 0); });
        }
        PII_COT.forEach(function (c, i) { v[c] = PII_GIA_TRI[i]; });
        v['Mã Kiện Hàng'] = '6043286867516426822';
        v['Cột nhiễu'] = 'x';
        bang.push(head.map(function (c) { return v[c] == null ? '' : v[c]; }));
      });
    });
    return bang;
  }

  /**
   * Sheet gian hàng giả theo bố cục thật: tiêu đề dòng 2, dòng 3 tổng, dữ liệu từ dòng 4;
   * công thức E/F/M/N (ArrayFormula) và L kéo sẵn tới `congThucToi`, dòng tổng phủ tới `dongTongToi`.
   * cacDong: [{ma, tvt, sl, h, i, j, k, l}] — dòng sau của đơn nhiều dòng để ma='' và h..k trống (giống ô gộp).
   * `l` khác null → ô L chứa GIÁ TRỊ tay thay vì công thức (mô phỏng nhân viên gõ số vào Doanh Thu ở đơn hoàn).
   */
  function sheetGianHang(ten, cacDong, congThucToi, dongTongToi) {
    var head = ['Ngày ', 'Nguồn đơn', 'Thông tin ĐH', 'Tên viết tắt', 'Tên sản phẩm', 'Đơn vị ', 'SL',
      'Tổng Tiền SP', 'MGG Shop', 'Chi phí', 'Thuế', 'Doanh Thu', 'Mã hàng', 'Check tồn', 'Còn Nợ'];
    var giaTri = [[], [], []], congThuc = [[], [], []], mang = [[], [], []];
    giaTri[0] = ['THEO DÕI ĐƠN HÀNG - ' + ten];
    giaTri[1] = head.slice();
    ['H', 'I', 'J', 'K', 'L'].forEach(function (c) {
      congThuc[2][Utils.chiSoCot(c) - 1] = 'SUM(' + c + '4:' + c + dongTongToi + ')';
    });
    function ct(c, r) {
      switch (c) {
        case 'E': return "INDEX('Tổng tồn kho'!$C$3:$G$482, MATCH($D" + r + ",'Tổng tồn kho'!$D$3:$D$482,0),1)";
        case 'F': return "INDEX('Tổng tồn kho'!$C$3:$G$482, MATCH($D" + r + ",'Tổng tồn kho'!$D$3:$D$482,0),4)";
        case 'L': return 'H' + r + '-I' + r + '-J' + r + '-K' + r;
        case 'M': return "INDEX('Tổng tồn kho'!$C$3:$G$460, MATCH($D" + r + ",'Tổng tồn kho'!$D$3:$D$460,0),3)";
        case 'N': return "INDEX('Tổng tồn kho'!$E$3:$H$739,MATCH('" + ten + "'!M" + r + ",'Tổng tồn kho'!$E$3:$E$739,0),4)";
      }
    }
    for (var r = 4; r <= congThucToi; r++) {
      giaTri[r - 1] = []; congThuc[r - 1] = []; mang[r - 1] = [];
      ['E', 'F', 'L', 'M', 'N'].forEach(function (c) {
        var i = Utils.chiSoCot(c) - 1;
        congThuc[r - 1][i] = ct(c, r);
        mang[r - 1][i] = c !== 'L';
      });
    }
    cacDong.forEach(function (dg, k) {
      var r = 4 + k;
      if (!giaTri[r - 1]) { giaTri[r - 1] = []; congThuc[r - 1] = []; mang[r - 1] = []; }
      giaTri[r - 1][0] = new Date(2026, 7, 1 + k);
      giaTri[r - 1][2] = dg.ma || null;
      giaTri[r - 1][3] = dg.tvt == null ? null : dg.tvt;
      giaTri[r - 1][6] = dg.sl == null ? null : dg.sl;
      giaTri[r - 1][7] = dg.h == null ? null : dg.h;
      giaTri[r - 1][8] = dg.i == null ? null : dg.i;
      giaTri[r - 1][9] = dg.j == null ? null : dg.j;
      giaTri[r - 1][10] = dg.k == null ? null : dg.k;
      if (dg.l != null) { giaTri[r - 1][11] = dg.l; congThuc[r - 1][11] = null; mang[r - 1][11] = false; }
    });
    return { ten: ten, soDong: Math.max(congThucToi, 3 + cacDong.length), giaTri: giaTri, congThuc: congThuc, mang: mang, dinhDang: [] };
  }

  /** Sheet `Tổng tồn kho` giả (ảnh chụp dạng giá trị — cột H là số đã tính như file tải từ Google Sheet). */
  function sheetDanhMuc() {
    var bang = danhMucBang();
    return { ten: 'Tổng tồn kho', soDong: bang.length, giaTri: bang, congThuc: bang.map(function () { return []; }), mang: bang.map(function () { return []; }), dinhDang: [] };
  }

  /** Sheet `Tổng xuất` giả: SUMIF trỏ tới các sheet gian hàng với vùng tới dòng gioiHan[ten]. */
  function sheetTongXuat(gioiHan) {
    var giaTri = [[], [], ['', 'STT', 'Tên sản phẩm ', 'Tên viết tắt', 'Mã hàng']], congThuc = [[], [], []], mang = [[], [], []];
    var tens = Object.keys(gioiHan);
    for (var r = 4; r <= 6; r++) {
      giaTri[r - 1] = ['', r - 3, 'SP ' + r, 'sp' + r, 1500 + r];
      congThuc[r - 1] = []; mang[r - 1] = [];
      tens.forEach(function (t, i) {
        congThuc[r - 1][8 + i] = "SUMIF('" + t + "'!$M$4:$M$" + gioiHan[t] + ",'Tổng xuất'!$E" + r + ",'" + t + "'!$G$4:$G$" + gioiHan[t] + ')';
      });
    }
    return { ten: 'Tổng xuất', soDong: 6, giaTri: giaTri, congThuc: congThuc, mang: mang, dinhDang: [] };
  }

  return {
    danhMucBang: danhMucBang, mappingBang: mappingBang, dongMap: d, don: don, bangNguon: bangNguon,
    sheetGianHang: sheetGianHang, sheetDanhMuc: sheetDanhMuc, sheetTongXuat: sheetTongXuat,
    PII_COT: PII_COT, PII_GIA_TRI: PII_GIA_TRI, GIA_UU_DAI_TACH_DAU: GIA_UU_DAI_TACH_DAU
  };
})();
