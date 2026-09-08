/**
 * TestBatBien.gs — TEST BẤT BIẾN (KE_HOACH_KIEM_THU bảng A5, GV-v2.3 mục 2.2).
 *
 * Đây KHÔNG phải test tính năng. Đây là HÀNG RÀO quanh dữ liệu của chủ shop: mỗi test dưới đây
 * canh đúng một luật mà vi phạm một lần là mất sổ bán hàng, mất công thức, hoặc rò dữ liệu khách.
 * Vi phạm một cái là FAIL toàn đợt, bất kể mọi con số khác đúng (KE_HOACH_KIEM_THU mục 6).
 *
 * Cách viết (theo mẫu `test_filter_labels.py` bên dự án CỔ PHIẾU — HOC_TU_DU_AN_CO_PHIEU mục 1):
 *  - Rẻ: chạy trong bộ nhớ, dưới một giây, KHÔNG gọi mạng, KHÔNG đụng file thật.
 *  - Dựng bản ghi giả rồi gọi THẲNG hàm thật (`chayDongBo`, `KeyIn.lapKeHoach`, `ghiMotSheet_`).
 *  - Mỗi test mở đầu bằng "VÌ SAO TEST NÀY TỒN TẠI" kèm triệu chứng thật nếu luật bị vi phạm.
 *  - Phép so sánh viết lại ĐỘC LẬP (`dongCuoiDuLieu`, `bam`, `chuoiO`), không tái dùng hàm đang được kiểm
 *    — dùng chính `KeyIn.dongDuLieuCuoi` để kiểm `KeyIn` thì lỗi trong nó sẽ tự bào chữa cho nó.
 *
 * Chạy: `node node/test-bat-bien.js` (kèm các bất biến cần file .xlsx thật),
 *       hoặc dán vào trình soạn Apps Script rồi chạy `TestBatBien.chayTatCa()`.
 *
 * Các bất biến cần file .xlsx thật (INV-5 hash file gốc, INV-7 quét log, INV-9 hash tests/, INV-10 quét mã nguồn)
 * nằm ở `node/test-bat-bien.js` — không dựng lại được trong bộ nhớ.
 */
var TestBatBien = (function () {

  var T1 = new Date(2026, 8, 7, 8, 0, 0);
  var T2 = new Date(2026, 8, 7, 9, 30, 0);
  var NGAY_GHI = '2026-09-07';
  var COT_Z = 26;                       // KE_HOACH_KIEM_THU INV-1 nói rõ vùng băm là A1:Z<dòng cuối cũ>

  /** Cột ARRAYFORMULA của file trên Google Sheet — ghi một ô là hỏng cả cột (INV-3). E=5, F=6, M=13, N=14. */
  var COT_CAM_SHEET = [5, 6, 13, 14];

  function phai(dk, msg) { if (!dk) throw new Error(msg); }
  function bang(a, b, msg) { if (a !== b) throw new Error(msg + ' (mong ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a) + ')'); }

  /** Băm FNV-1a 32 bit — viết tay để chạy được cả trong Apps Script lẫn Node, không cần thư viện. */
  function bam(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  // ------------------------------------------------------------------ chụp ảnh sheet, viết lại độc lập

  /**
   * Nội dung MỘT ô dưới dạng chuỗi so sánh được: công thức thắng giá trị (ô công thức không có giá trị riêng).
   * Cố ý KHÔNG tái dùng `chuoiGiaTri` của kho-tracking.js — bản sao độc lập mới bắt được lỗi trong bản kia.
   */
  function chuoiO(ss, r, c) {
    var ct = (ss.congThuc[r - 1] || [])[c - 1];
    if (ct != null && ct !== '') return ((ss.mang[r - 1] || [])[c - 1] ? 'AF:' : 'F:') + String(ct);
    var v = (ss.giaTri[r - 1] || [])[c - 1];
    if (v == null || v === '') return '';
    if (Utils.laNgay(v)) return 'D:' + v.getTime();
    if (typeof v === 'number') return 'N:' + v;
    if (typeof v === 'boolean') return 'B:' + v;
    return 'S:' + String(v);
  }

  /** Dòng dữ liệu cuối — viết lại độc lập với `KeyIn.dongDuLieuCuoi`: dòng cuối còn mã đơn hoặc tên viết tắt. */
  function dongCuoiDuLieu(ss, cfg) {
    var k = cfg.keyin, cuoi = k.dong_dau - 1;
    var n = Math.max(ss.soDong || 0, ss.giaTri.length);
    for (var r = k.dong_dau; r <= n; r++) {
      var a = (ss.giaTri[r - 1] || [])[k.cot_ma_don - 1];
      var b = (ss.giaTri[r - 1] || [])[k.cot_ten_viet_tat - 1];
      if (!Utils.laRong(a) || !Utils.laRong(b)) cuoi = r;
    }
    return cuoi;
  }

  /**
   * Ảnh chụp vùng A1:Z<denDong> của MỌI sheet trong kho: { ten: { denDong, soDong, o: {'r,c': chuỗi}, bam } }.
   * `denDong` do hàm gọi quyết định (INV-1 dùng dòng dữ liệu cuối CŨ, INV-8 dùng đúng dòng tổng).
   */
  function anhVung(kho, cfg, denDongCua) {
    var anh = {};
    Object.keys(kho.sheets).forEach(function (ten) {
      var ss = kho.docSheet(ten);
      var den = denDongCua(ss);
      var o = {}, noiDung = [];
      for (var r = 1; r <= den; r++) {
        for (var c = 1; c <= COT_Z; c++) {
          var s = chuoiO(ss, r, c);
          if (s) { o[r + ',' + c] = s; noiDung.push(r + ',' + c + '=' + s); }
        }
      }
      anh[ten] = { denDong: den, soDong: ss.soDong, o: o, bam: bam(noiDung.join('\n')), soO: noiDung.length };
    });
    return anh;
  }

  /** So hai ảnh chụp, trả về danh sách ô lệch dạng chữ (bỏ qua các ô trong `boQua`: 'sheet!r,c'). */
  function soAnh(truoc, sau, boQua) {
    var lech = [];
    boQua = boQua || {};
    Object.keys(truoc).forEach(function (ten) {
      if (!sau[ten]) { lech.push(ten + ': MẤT SHEET'); return; }
      var a = truoc[ten].o, b = sau[ten].o;
      var khoa = {};
      Object.keys(a).forEach(function (k) { khoa[k] = 1; });
      Object.keys(b).forEach(function (k) { khoa[k] = 1; });
      Object.keys(khoa).sort().forEach(function (k) {
        if (a[k] === b[k]) return;
        if (boQua[ten + '!' + k]) return;
        lech.push(ten + '!' + k + ': "' + (a[k] || '(trống)') + '" → "' + (b[k] || '(trống)') + '"');
      });
    });
    return lech;
  }

  // ------------------------------------------------------------------ bối cảnh giả

  /**
   * Kho giả: `Tổng tồn kho`, `Tổng xuất`, hai sheet gian hàng, sheet Mapping.
   * `Shopee mall`: dữ liệu tới dòng 6 (3 dòng nhân viên đã gõ tay), công thức E/F/L/M/N kéo tới dòng 8,
   * dòng tổng (dòng 3) `=SUM(H4:H9)`. Đúng bố cục file thật, thu nhỏ để test chạy trong một giây.
   */
  function boiCanh(tuyChon) {
    tuyChon = tuyChon || {};
    var cfg = Config.tao(tuyChon.cauHinh);
    var sheets = {};
    sheets['Tổng tồn kho'] = TestData.sheetDanhMuc();
    sheets['Shopee mall'] = TestData.sheetGianHang('Shopee mall', tuyChon.dongCoSan || [
      { ma: 'TEST0731AAAA01', tvt: 'dt5', sl: 1, h: 220000, i: null, j: 59100, k: 3300 },
      { ma: 'TEST0801BBBB02', tvt: 'Hạt TE', sl: 2, h: 780000, i: 39000, j: 173430, k: 11115 },
      { ma: '', tvt: 'Hạt TE Lốc', sl: 2 }
    ], tuyChon.congThucToi || 8, tuyChon.dongTongToi || 9);
    sheets['Offood'] = TestData.sheetGianHang('Offood', [], 6, 30);
    sheets['Tổng xuất'] = TestData.sheetTongXuat({ 'Shopee mall': 12, 'Offood': 5 });
    return { kho: new KhoGiaLap(sheets, TestData.mappingBang(tuyChon.themMapping)), cfg: cfg };
  }

  function file(bc, cacDon, ten, tuyChon) {
    return {
      san: 'SHOPEE', maGianHang: (tuyChon && tuyChon.gian) || 'SP_MALL', tenFile: ten || 'mall.xlsx',
      bang: TestData.bangNguon(bc.cfg, cacDon, tuyChon)
    };
  }

  function chay(bc, files, thoiDiem) {
    return chayDongBo(new NguonGiaLap(files), bc.kho, { thoiDiem: thoiDiem || T1, ngayGhi: NGAY_GHI, cfg: bc.cfg });
  }

  /**
   * Ba đơn thử: một đơn thường, một đơn HAI mặt hàng (sinh ô gộp), một đơn có tên hàng KHÔNG có trong
   * Mapping (sinh dòng vàng + cột Note + append Mapping). Ba nhánh ghi khác nhau, ba kiểu phá dữ liệu khác nhau.
   */
  function baDonThu() {
    return [
      TestData.don({ maDon: 'BB0000000001' }),
      TestData.don({ maDon: 'BB0000000002', dongs: [
        { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Thùng 24 Hộp', sl: 1, gia: 985000 },
        { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Lốc 6 Hộp', sl: 1, gia: 250000 }
      ] }),
      TestData.don({ maDon: 'BB0000000003', dongs: [{ ten: 'Hàng chưa bao giờ có trong Mapping', sl: 1, gia: 12000 }] })
    ];
  }

  /** Toàn bộ dấu vết một lần chạy để lại, gộp thành một chuỗi để soi chuỗi cấm (PII, bí mật). */
  function moiDauVet(bc, kq) {
    return JSON.stringify(bc.kho.sheets) + '\n' + JSON.stringify(bc.kho.mapping) + '\n' +
      JSON.stringify(bc.kho.canhBaoDaGui) + '\n' + JSON.stringify(kq.nhatKy) + '\n' +
      JSON.stringify(kq.canhBao) + '\n' + JSON.stringify(bc.kho.keHoachDaGhi);
  }

  // ================================================================== INV-1

  /**
   * INV-1 — KHÔNG BAO GIỜ SỬA HOẶC XÓA DÒNG ĐÃ CÓ.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: sheet gian hàng là sổ bán hàng do người gõ tay suốt cả tháng — có ô nhân viên
   * sửa lại bằng tay, có đơn đánh dấu hoàn, có số ghi đè công thức. Tool sửa hay xóa nhầm một dòng ở đó thì
   * dữ liệu người ta gõ tay MẤT, không phục hồi được (không ai giữ bản trước đó). Bên dự án CỔ PHIẾU đã có
   * `prepSheet_()` xóa trắng rồi vẽ lại cả sheet mỗi lần chạy — hợp lý với sheet 100% do máy sinh, và là
   * thảm họa với sổ của chủ shop.
   *
   * CÁCH KIỂM: băm từng ô vùng A1:Z<dòng cuối dữ liệu CŨ> của MỌI sheet trước và sau khi ghi → phải trùng khít;
   * số dòng chỉ được TĂNG; và mọi ô trong kế hoạch ghi phải nằm dưới dòng cuối cũ.
   *
   * NGOẠI LỆ DUY NHẤT được chấp nhận, có văn bản: ô tiêu đề `Note` ở dòng 2 (T-45 mức CHẶN bắt buộc ghi
   * tiêu đề này một lần vào cột trống đầu tiên bên phải `Còn Nợ`). Test chỉ tha đúng một ô đó, và chỉ khi ô
   * đó TRƯỚC KHI GHI LÀ TRỐNG. Ô đó có sẵn nội dung mà bị đè → vẫn tính là vi phạm.
   */
  function INV1_khongSuaXoaDongDaCo() {
    var bc = boiCanh();
    var denDongCu = {};
    var truoc = anhVung(bc.kho, bc.cfg, function (ss) {
      var d = bc.cfg.gianHang['SP_MALL'].sheet === ss.ten || bc.cfg.gianHang['SP_OFFOOD'].sheet === ss.ten
        ? dongCuoiDuLieu(ss, bc.cfg) : Math.max(ss.soDong || 0, ss.giaTri.length);
      denDongCu[ss.ten] = d;
      return d;
    });
    bang(denDongCu['Shopee mall'], 6, 'dòng dữ liệu cuối trước khi chạy');
    var soDongTruoc = {};
    Object.keys(bc.kho.sheets).forEach(function (t) { soDongTruoc[t] = bc.kho.sheets[t].soDong; });

    var kq = chay(bc, [file(bc, baDonThu())]);
    bang(kq.donGhi, 3, 'ghi 3 đơn mới');
    bang(kq.dongGhi, 4, '4 dòng (đơn 2 mặt hàng chiếm 2 dòng)');

    // ngoại lệ có văn bản: đúng MỘT ô tiêu đề Note, và ô đó phải trống trước khi ghi
    var kh = bc.kho.keHoachDaGhi.filter(function (p) { return p.tenSheet === 'Shopee mall'; })[0];
    phai(kh, 'phải có kế hoạch ghi cho Shopee mall');
    var boQua = {};
    if (kh.tieuDeNote) {
      var td = kh.tieuDeNote;
      bang(td.r, bc.cfg.keyin.dong_header, 'tiêu đề Note chỉ được ghi ở dòng tiêu đề');
      bang(truoc['Shopee mall'].o[td.r + ',' + td.c] == null, true,
        'ô tiêu đề Note (' + Utils.chuCot(td.c) + td.r + ') phải đang TRỐNG — có nội dung mà bị đè là vi phạm INV-1');
      bang(td.text, bc.cfg.keyin.tieu_de_note, 'nội dung ô tiêu đề Note');
      if (td.c <= COT_Z) boQua['Shopee mall!' + td.r + ',' + td.c] = 1;
    }

    var sau = anhVung(bc.kho, bc.cfg, function (ss) { return denDongCu[ss.ten]; });
    var lech = soAnh(truoc, sau, boQua);
    bang(lech.length, 0, 'vùng dòng cũ phải trùng khít từng ô — lệch: ' + lech.slice(0, 5).join(' · '));
    // Băm thô của cả vùng A1:Z6 chỉ được TRÙNG KHÍT khi tool không phải đặt tiêu đề `Note`.
    // Ghi tiêu đề `Note` một lần vào ô TRỐNG ở dòng tiêu đề là hành vi bắt buộc của mục 1.4, và
    // đã được kiểm chặt ngay phía trên: đúng một ô, đúng dòng tiêu đề, ô đó phải đang trống.
    // Nếu ở đây so băm thô mà không trừ ô đó thì test tự mâu thuẫn với chính ngoại lệ nó vừa cấp.
    if (!Object.keys(boQua).length) {
      bang(sau['Shopee mall'].bam, truoc['Shopee mall'].bam, 'băm vùng A1:Z6 của Shopee mall');
    } else {
      bang(Object.keys(boQua).length, 1, 'chỉ được đúng MỘT ô ngoại lệ trong toàn vùng dòng cũ');
      phai(sau['Shopee mall'].soO === truoc['Shopee mall'].soO + 1,
        'vùng dòng cũ chỉ được nhiều hơn đúng một ô (ô tiêu đề Note), thực tế ' +
        truoc['Shopee mall'].soO + ' → ' + sau['Shopee mall'].soO);
    }

    // số dòng chỉ được tăng
    Object.keys(soDongTruoc).forEach(function (t) {
      phai(bc.kho.sheets[t].soDong >= soDongTruoc[t],
        'sheet ' + t + ': số dòng giảm ' + soDongTruoc[t] + ' → ' + bc.kho.sheets[t].soDong + ' — tool đã XÓA dòng');
    });
    bang(bc.kho.sheets['Shopee mall'].soDong, 10, 'Shopee mall: 8 dòng cũ → 10 (4 dòng mới từ dòng 7)');

    // mọi ô trong kế hoạch phải nằm DƯỚI dòng cuối cũ
    var duoi = [];
    kh.oGhi.concat(kh.congThucKeo).concat(kh.ghiChu).forEach(function (o) { if (o.r <= 6) duoi.push(Utils.chuCot(o.c) + o.r); });
    (kh.toVang || []).forEach(function (r) { if (r <= 6) duoi.push('tô vàng dòng ' + r); });
    (kh.gopO || []).forEach(function (g) { if (g.r1 <= 6) duoi.push('gộp ô từ dòng ' + g.r1); });
    bang(duoi.length, 0, 'kế hoạch ghi chạm dòng cũ: ' + duoi.join(', '));

    // chạy lại lần hai: không thêm dòng, vùng cũ vẫn nguyên
    var kq2 = chay(bc, [file(bc, baDonThu(), 'lai.xlsx')], T2);
    bang(kq2.donGhi, 0, 'chạy lần hai: 0 đơn mới');
    bang(bc.kho.sheets['Shopee mall'].soDong, 10, 'chạy lần hai: số dòng không đổi');
    bang(soAnh(truoc, anhVung(bc.kho, bc.cfg, function (ss) { return denDongCu[ss.ten]; }), boQua).length, 0,
      'sau lần chạy thứ hai vùng cũ vẫn trùng khít');

    return { ghiChu: 'so ' + truoc['Shopee mall'].soO + ' ô có nội dung vùng A1:Z6 (băm ' + truoc['Shopee mall'].bam +
      '), 4 sheet giả · 0 ô lệch · ngoại lệ đã tha: ' + Object.keys(boQua).length + ' ô tiêu đề Note' };
  }

  // ================================================================== INV-2

  /**
   * INV-2 — KHÔNG THÊM SHEET NÀO NGOÀI `Mapping_san_pham`.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: file tháng của chủ shop có 18 sheet nối nhau bằng công thức (`Tổng xuất` SUMIF
   * sang từng sheet gian hàng, `Lợi nhuận` trỏ ngược lại). Bản v1 của tool từng sinh 5 sheet máy
   * (DON_HANG_RAW, CHO_XU_LY, LOG_DONG_BO, DOI_CHIEU, XEM_GIAN_HANG); mỗi sheet lạ là một tab người ta
   * không hiểu, và bên CỔ PHIẾU còn có `quarantineOtherSheets_` ĐỔI TÊN sheet lạ — làm thế ở đây là gãy
   * hàng loạt công thức chéo, `#REF!` lan ra cả file.
   *
   * CÁCH KIỂM: so danh sách tên sheet trước/sau một lần chạy có sinh tên hàng mới (nhánh duy nhất tool được
   * phép tạo sheet). Chỉ `Mapping sản phẩm` / `Mapping_san_pham` được thêm.
   */
  function INV2_khongThemSheetLa() {
    var bc = boiCanh();
    var truoc = Object.keys(bc.kho.sheets).sort();
    bang(truoc.length, 4, '4 sheet trước khi chạy');

    var kq = chay(bc, [file(bc, baDonThu())]);
    phai(kq.tenMoi >= 1, 'lần chạy này phải có tên hàng mới thì mới đụng tới nhánh ghi Mapping (đang: ' + kq.tenMoi + ')');
    phai(bc.kho.mappingDaGhi, 'phải có ghi lại sheet Mapping');

    var sau = Object.keys(bc.kho.sheets).sort();
    bang(sau.join('|'), truoc.join('|'), 'danh sách sheet KHÔNG được đổi (Mapping là sheet riêng, không phải sheet gian hàng)');

    // tên sheet Mapping là hằng số một nơi, không được tự đặt tên khác
    bang(TEN_TAB_MAPPING_SHEET, 'Mapping_san_pham', 'tên tab Mapping trên Google Sheet');
    bang(TEN_SHEET_MAPPING_EXCEL, 'Mapping sản phẩm', 'tên sheet Mapping trong file .xlsx');

    return { ghiChu: truoc.length + ' sheet trước = ' + sau.length + ' sheet sau · Mapping +' + kq.tenMoi + ' dòng tên hàng mới' };
  }

  // ================================================================== INV-3

  /** Ô của sheet giả Google: giữ giá trị, công thức R1C1, nền. */
  function OGiaLap() { this.gt = null; this.ctR1C1 = null; this.nen = '#ffffff'; }

  /**
   * Sheet giả có cùng bề mặt với `Sheet` của Apps Script, đủ để gọi THẲNG `ghiMotSheet_` (vỏ ghi Google Sheet thật)
   * mà không cần mạng và không cần file. Ghi lại MỌI vùng bị ghi để test soi được tool đã chạm cột nào.
   */
  function SheetGiaLapGoogle(ten, soDong, soCot) {
    this.ten = ten;
    this.o = {};
    this._soDong = soDong || 0;
    this._soCot = soCot || 15;
    this.daGhi = [];      // { kieu, r1, c1, r2, c2 } — kieu: 'giaTri' | 'congThuc' | 'nen' | 'dinhDang' | 'gopO' | 'font'
    this.daDoc = [];
  }
  SheetGiaLapGoogle.prototype.getName = function () { return this.ten; };
  SheetGiaLapGoogle.prototype.getLastRow = function () { return this._soDong; };
  SheetGiaLapGoogle.prototype.getLastColumn = function () { return this._soCot; };
  SheetGiaLapGoogle.prototype._o = function (r, c) {
    var k = r + ',' + c;
    if (!this.o[k]) this.o[k] = new OGiaLap();
    return this.o[k];
  };
  SheetGiaLapGoogle.prototype.getRange = function (r, c, nr, nc) {
    var sh = this;
    nr = nr == null ? 1 : nr;
    nc = nc == null ? 1 : nc;
    var vung = { r1: r, c1: c, r2: r + nr - 1, c2: c + nc - 1 };
    function ghi(kieu) { sh.daGhi.push({ kieu: kieu, r1: vung.r1, c1: vung.c1, r2: vung.r2, c2: vung.c2 }); }
    function doc(kieu) { sh.daDoc.push({ kieu: kieu, r1: vung.r1, c1: vung.c1, r2: vung.r2, c2: vung.c2 }); }
    function bang2(lay) {
      var out = [];
      for (var i = 0; i < nr; i++) {
        var d = [];
        for (var j = 0; j < nc; j++) d.push(lay(sh._o(r + i, c + j)));
        out.push(d);
      }
      return out;
    }
    var rg = {
      getValues: function () { doc('giaTri'); return bang2(function (o) { return o.gt == null ? '' : o.gt; }); },
      getDisplayValues: function () { doc('giaTri'); return bang2(function (o) { return o.gt == null ? '' : String(o.gt); }); },
      getValue: function () { doc('giaTri'); return sh._o(r, c).gt; },
      getBackgrounds: function () { doc('nen'); return bang2(function (o) { return o.nen; }); },
      getFormulaR1C1: function () { doc('congThuc'); return sh._o(r, c).ctR1C1 || ''; },
      setValues: function (v) {
        ghi('giaTri');
        for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh._o(r + i, c + j).gt = (v[i] || [])[j];
        if (vung.r2 > sh._soDong) sh._soDong = vung.r2;
        return rg;
      },
      setValue: function (v) { ghi('giaTri'); sh._o(r, c).gt = v; if (r > sh._soDong) sh._soDong = r; return rg; },
      setFormulasR1C1: function (v) {
        ghi('congThuc');
        for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh._o(r + i, c + j).ctR1C1 = (v[i] || [])[j];
        return rg;
      },
      setBackgrounds: function (v) {
        ghi('nen');
        for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh._o(r + i, c + j).nen = (v[i] || [])[j];
        return rg;
      },
      setBackground: function (v) {
        ghi('nen');
        for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) sh._o(r + i, c + j).nen = v;
        return rg;
      },
      setNumberFormat: function () { ghi('dinhDang'); return rg; },
      setFontWeight: function () { ghi('font'); return rg; },
      mergeVertically: function () { ghi('gopO'); return rg; }
    };
    return rg;
  };

  /** Đơn thử theo hình dạng gói JSON mà Web App nhận (`hanhDongGhi_` → `ghiMotSheet_`). */
  function donGoi(ma, dong) {
    return { maDon: ma, ngay: NGAY_GHI, tien: { H: 100000, I: 0, J: 9200, K: 1500 }, dong: dong };
  }

  /** Mọi vùng GHI GIÁ TRỊ / GHI CÔNG THỨC chạm vào một trong các cột `cot`. Nền và ô gộp không tính (xem chú thích INV-3). */
  function vungGhiChamCot(sh, cot) {
    return sh.daGhi.filter(function (v) {
      if (v.kieu !== 'giaTri' && v.kieu !== 'congThuc') return false;
      for (var i = 0; i < cot.length; i++) if (cot[i] >= v.c1 && cot[i] <= v.c2) return true;
      return false;
    });
  }

  /**
   * INV-3a — VỎ GHI GOOGLE SHEET KHÔNG ĐƯỢC GHI GIÁ TRỊ / CÔNG THỨC VÀO E, F, M, N.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: trên file Google Sheet của chủ shop, bốn cột E (Tên sản phẩm), F (Đơn vị),
   * M (Mã hàng), N (Check tồn) là ARRAYFORMULA đặt ở MỘT ô đầu cột, tự đổ giá trị xuống mọi dòng. Ghi bất kỳ
   * giá trị nào vào một ô trong vùng đổ đó thì Google trả `#REF!` và HỎNG CẢ CỘT của cả sheet — không phải
   * hỏng một ô. Triệu chứng nhìn thấy: cả cột E hiện `#REF!`, kéo theo `Tổng xuất` và `Lợi nhuận` sai theo.
   *
   * CÁCH KIỂM: gọi THẲNG `ghiMotSheet_` (hàm ghi thật của Web App) trên một sheet giả ghi lại mọi vùng bị ghi,
   * với 3 đơn (một đơn 2 mặt hàng → gộp ô; một dòng vàng → tô nền + ghi Note). Không một vùng ghi giá trị hay
   * công thức nào được phủ cột 5, 6, 13, 14.
   *
   * Ghi nền (`setBackgrounds`) CÓ phủ E, F, M, N khi tô vàng cả dòng, và đó là an toàn: Google lưu định dạng
   * tách khỏi giá trị, tô màu một ô trong vùng ARRAYFORMULA không làm cột đó `#REF!`. Test cố ý chỉ chặn
   * ghi GIÁ TRỊ và CÔNG THỨC. (Câu chữ T-47 "không chạm" chặt hơn — điểm này cần BA chốt lại thành văn.)
   */
  function INV3a_voGhiSheetKhongChamEFMN() {
    if (typeof ghiMotSheet_ !== 'function') {
      return { boQua: true, lyDo: 'không nạp được src/ShellAppsScript.gs (vỏ ghi Google Sheet) trong môi trường này' };
    }
    // Sheet giả không có dòng tiêu đề nào, nên `doCotNote_` sẽ trả về cột D — trùng đúng cột
    // `Tên viết tắt` mà tool tự ghi, và hàng rào mới ném lỗi ngay (đúng như nó phải làm: ghi ghi chú
    // đè lên cột D là mất mã hàng). Ở sheet thật, tiêu đề chạy tới O nên Note rơi vào P.
    // Vì vậy chỉ định thẳng cột Note ở đây, để bài này kiểm đúng thứ nó sinh ra để kiểm:
    // KHÔNG vùng ghi nào chạm E, F, M, N.
    var cfg = Config.tao({ chung: { che_do_cong_thuc: 'SHEET' }, keyin: { cot_note: 'P' } });
    var k = cfg.keyin;
    var sh = new SheetGiaLapGoogle('Shopee mall', 6, 15);
    sh._o(2, 3).gt = 'Thông tin ĐH';                       // dòng tiêu đề
    sh._o(4, 3).gt = 'TEST0731AAAA01';                     // một dòng cũ để dòng mới bắt đầu từ 5
    sh._o(4, 12).ctR1C1 = 'R[0]C[-4]-R[0]C[-3]-R[0]C[-2]-R[0]C[-1]';
    var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0 };
    var canhBao = [], thongBao = [];
    ghiMotSheet_(sh, [
      donGoi('BB0000000001', [{ tenVietTat: 'dt5', soLuong: 1 }]),
      donGoi('BB0000000002', [{ tenVietTat: 'kn180', soLuong: 12 }, { tenVietTat: 'hd180', soLuong: 12 }]),
      donGoi('BB0000000003', [{ tenVietTat: '', soLuong: 1, vang: true, note: 'chưa nhận ra tên hàng' }])
    ], k, tk, {}, canhBao, thongBao);

    bang(tk.donGhi, 3, 'vỏ ghi 3 đơn');
    bang(tk.dongGhi, 4, '4 dòng');
    bang(tk.donGopO, 1, '1 đơn được gộp ô');
    bang(tk.dongVang, 1, '1 dòng vàng');

    var cham = vungGhiChamCot(sh, COT_CAM_SHEET);
    bang(cham.length, 0, 'có ' + cham.length + ' lệnh ghi giá trị/công thức chạm E,F,M,N: ' +
      cham.map(function (v) { return v.kieu + ' ' + Utils.chuCot(v.c1) + v.r1 + ':' + Utils.chuCot(v.c2) + v.r2; }).join(', '));

    // đối chứng dương: test phải THẤY được lệnh ghi, nếu không nó đạt một cách vô nghĩa
    var chamL = vungGhiChamCot(sh, [k.cot_doanh_thu]);
    phai(chamL.length >= 1, 'phải có ghi công thức vào cột L — nếu không, phép kiểm này rỗng');
    var chamD = vungGhiChamCot(sh, [k.cot_ten_viet_tat]);
    phai(chamD.length >= 1, 'phải có ghi giá trị vào cột D — nếu không, phép kiểm này rỗng');

    return { ghiChu: sh.daGhi.length + ' lệnh ghi (' + vungGhiChamCot(sh, [1, 2, 3, 4, 7, 8, 9, 10, 11, 12]).length +
      ' chạm A–L) · 0 lệnh ghi giá trị/công thức chạm E,F,M,N' };
  }

  /**
   * INV-3b — TẦNG GHI PHẢI NÉM LỖI KHI LỆNH GHI NHẮM VÀO E, F, M, N Ở CHẾ ĐỘ SHEET.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: INV-3a chỉ chứng minh mã HÔM NAY không ghi nhầm. GV-v2.3 mục 2.2 yêu cầu
   * "chặn ở tầng ghi bằng cách ném lỗi, KHÔNG dựa vào người viết mã nhớ" — vì cái hỏng ở đây không phục hồi
   * được bằng Ctrl+Z và người sửa mã sáu tuần sau không đọc lại chú thích. Chỉ cần một dòng cấu hình lệch
   * (`cot_ten_viet_tat` trỏ vào E) hay một lần sửa `ghiMotSheet_` là cả cột ARRAYFORMULA của sheet chết.
   *
   * CÁCH KIỂM: dựng cấu hình cố ý trỏ cột tool ghi vào E (và một biến thể trỏ vào N ngay Ô ĐẦU CỘT), rồi gọi
   * hàm ghi thật. Phải NÉM LỖI ngay, chưa ghi ô nào. Kiểm tra hiện có của `Config.tao` (cột công thức trùng
   * cột ghi) KHÔNG đủ: nó bị vô hiệu chỉ bằng cách khai `cot_cong_thuc = 'L'`, đúng như bối cảnh giai đoạn 2
   * nơi E/F/M/N không còn nằm trong `cot_cong_thuc` nữa.
   *
   * TEST NÀY ĐANG HỎNG LÀ ĐÚNG THỰC TRẠNG: hàng rào chưa tồn tại. KHÔNG được nới test cho qua —
   * xem đề xuất cách sửa trong báo cáo (thêm hàm chặn ở đầu `ghiMotSheet_`).
   */
  function INV3b_tangGhiPhaiNemLoi() {
    if (typeof ghiMotSheet_ !== 'function') {
      return { boQua: true, lyDo: 'không nạp được src/ShellAppsScript.gs (vỏ ghi Google Sheet) trong môi trường này' };
    }
    function thuGhiVaoCot(ghiDeKeyIn, moTa) {
      var cfg = Config.tao({ chung: { che_do_cong_thuc: 'SHEET' }, keyin: ghiDeKeyIn });
      var sh = new SheetGiaLapGoogle('Shopee mall', cfg.keyin.dong_dau - 1, 15);
      var tk = { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0 };
      var loi = null;
      try {
        ghiMotSheet_(sh, [donGoi('BB0000000009', [{ tenVietTat: 'dt5', soLuong: 1 }])], cfg.keyin, tk, {}, [], []);
      } catch (e) { loi = e; }
      var cham = vungGhiChamCot(sh, COT_CAM_SHEET);
      return { loi: loi, cham: cham, moTa: moTa };
    }

    // (1) cột `Tên viết tắt` bị trỏ vào E — `cot_cong_thuc = 'L'` nên phép kiểm hiện có của Config không bắt được
    var a = thuGhiVaoCot({ cot_ten_viet_tat: 'E', cot_cong_thuc: 'L' }, 'ghi cột D vào E');
    // (2) cột `Thông tin ĐH` bị trỏ vào N, và dòng đầu tiên là Ô ĐẦU CỘT (nơi đặt ARRAYFORMULA)
    var b = thuGhiVaoCot({ dong_header: 1, dong_tong: 1, dong_dau: 2, cot_ma_don: 'N', cot_cong_thuc: 'L' }, 'ghi cột C vào N2 — ô đầu cột');

    // (3) LỖ 1 — `cot_doanh_thu` là khóa DUY NHẤT bị Config.gs:74 cố ý loại khỏi phép kiểm trùng
    //     (`KEYIN_COT.filter(t => t !== 'cot_doanh_thu')`), nên không tầng nào chạm tới nó. Vỏ ghi
    //     dán công thức vào cả khối (ShellAppsScript.gs:720) VÀ gộp ô dọc (727-729). Gộp ô không
    //     cần cột đích có sẵn công thức nên nó nổ vô điều kiện với đơn nhiều mặt hàng.
    var c = thuGhiVaoCot({ cot_doanh_thu: 'M' }, 'ghi công thức doanh thu vào M');

    // (4) LỖ 2 — `cot_note` không nằm trong KEYIN_COT nên phép kiểm trùng của Config không thấy nó,
    //     và không có lời gọi kiemCotDuocGhi_ nào cho nó. Ca xấu nhất: ô tiêu đề đang trống thì
    //     ShellAppsScript.gs:747 ghi thẳng chữ `Note` vào đúng ô đặt ARRAYFORMULA.
    var d = thuGhiVaoCot({ cot_note: 'M' }, 'ghi ghi chú vào M');

    // (5) LỖ 3 — không cần một khóa cột nào cả. `doCotNote_` (ShellAppsScript.gs:502-513) tự dò cột
    //     trống đầu tiên sau tiêu đề cuối cùng của dòng `dong_header`. Trỏ dong_header vào một dòng
    //     trống là cột Note rơi về cột A, và ShellAppsScript.gs:747 ghi chữ `Note` vào dòng tổng.
    var e = thuGhiVaoCot({ dong_header: 3 }, 'cột Note tự dò rơi vào cột cấm');

    var chuaChan = [];
    [a, b, c, d, e].forEach(function (x) { if (!x.loi) chuaChan.push(x.moTa + ': đã ghi ' + x.cham.length + ' vùng vào E/F/M/N mà KHÔNG ném lỗi'); });
    bang(chuaChan.length, 0, 'tầng ghi chưa có hàng rào ném lỗi — ' + chuaChan.join(' | '));

    return { ghiChu: 'năm lệnh ghi cố ý nhắm E/M/N (kể cả qua cot_doanh_thu, cot_note và cột Note tự dò) đều bị chặn bằng lỗi' };
  }

  // ================================================================== INV-4

  /**
   * INV-4 — KHÔNG ĐỌC, KHÔNG GHI, KHÔNG IN 9 CỘT THÔNG TIN NGƯỜI MUA.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: file xuất Shopee mang tên, số điện thoại và địa chỉ nhà của khách. File kết quả
   * và file nhật ký được chép qua lại giữa 2-3 máy nhân viên và gửi cho BA. Lọt một cột là rò dữ liệu khách
   * hàng ra một file ai cũng mở được, và không thu hồi lại được. Đây là loại lỗi im lặng: không ai báo,
   * chỉ đến lúc file lọt ra ngoài mới biết.
   *
   * CÁCH KIỂM: danh sách 9 cột lấy THẲNG từ `cfg.cotCamDocTuFileXuat` (không gõ tay, gõ tay là test và mã lệch nhau
   * lúc Shopee đổi tên cột). Chạy trên bảng nguồn có sẵn cột cá nhân giả, rồi soi toàn bộ dấu vết một lần chạy:
   * sheet, Mapping, cảnh báo, nhật ký, kế hoạch ghi. Cộng regex bắt số điện thoại 10 chữ số trong nhật ký.
   */
  function INV4_khongDungCotThongTinNguoiMua() {
    var bc = boiCanh();
    var camDoc = bc.cfg.cotCamDocTuFileXuat;      // 9 cột cấm đọc từ file xuất Shopee
    var quaChung = bc.cfg.tenCotQuaChung;         // tập con: tên quá chung, không quét theo TÊN
    bang(camDoc.length, 9, 'cấu hình phải khai đủ 9 cột cấm đọc từ file xuất Shopee');

    // `cfg.cotPII` là tên cũ của cùng danh sách đó. Cổng `kiemPII` trong node/gsheet-web-app.js soát gói
    // bằng đúng khóa này TRƯỚC KHI gửi lên mạng. Ai trỏ `cotPII` sang danh sách đã trừ bớt là mở toang
    // cổng đó mà không một dòng lỗi nào hiện ra, nên chốt hai danh sách phải trùng khít ngay tại đây.
    bang(JSON.stringify(bc.cfg.cotPII), JSON.stringify(camDoc),
      'cfg.cotPII phải là ĐÚNG danh sách cấm đọc, không được trỏ sang danh sách đã trừ bớt');

    TestData.PII_COT.forEach(function (c) {
      phai(camDoc.indexOf(c) >= 0, 'cột cá nhân giả "' + c + '" phải nằm trong cfg.cotCamDocTuFileXuat, nếu không fixture không chứng minh được gì');
    });
    // 9 cột cấm không được nằm trong danh sách cột tool đọc — chặn từ gốc, trước cả khi đọc file
    var docNhamm = [];
    Object.keys(bc.cfg.cot).forEach(function (t) {
      (bc.cfg.cot[t] || []).forEach(function (c) { if (camDoc.indexOf(c) >= 0) docNhamm.push(t + ' → "' + c + '"'); });
    });
    bang(docNhamm.length, 0, 'cấu hình đọc trúng cột cá nhân: ' + docNhamm.join(', '));

    var kq = chay(bc, [file(bc, baDonThu())]);
    var dauVet = moiDauVet(bc, kq);

    // ---- lớp quét theo TÊN CỘT, và cái giá phải trả cho nó ----
    // Quét theo tên có một chỗ mù: vài tên cột của Shopee trùng đúng từ vựng hợp lệ mà tool BẮT BUỘC
    // phải ghi ra. `Ghi chú` là tiêu đề một cột của sheet `Mapping sản phẩm` do chính tool sở hữu;
    // `Quận` nằm lọt trong `TP / Quận / Huyện` và trong mọi địa chỉ tiếng Việt. Thấy các chuỗi ấy
    // trong dấu vết KHÔNG chứng minh được là rò dữ liệu khách. Danh sách trừ hao nay là dữ liệu cấu
    // hình (`cfg.tenCotQuaChung`), không còn là mảng viết cứng nằm lẫn trong test.
    //
    // Đổi lại, mỗi tên xin được trừ phải TỰ CHỨNG MINH nó chung thật, bằng một trong hai lý do kiểm được:
    //   (a) trùng đúng tiêu đề sheet `Mapping sản phẩm` (SCHEMA.MAPPING), hoặc
    //   (b) nằm lọt trong một tên cột cấm đọc khác, nên quét riêng nó là quét thừa.
    // Ai định làm im một cảnh báo bằng cách nhét `Số điện thoại` vào danh sách sẽ vấp ngay phép này.
    var voLy = [];
    quaChung.forEach(function (c) {
      phai(camDoc.indexOf(c) >= 0,
        'cfg.tenCotQuaChung khai "' + c + '" mà nó không phải cột cấm đọc — danh sách này chỉ được là tập con');
      var laTieuDeMapping = SCHEMA.MAPPING.indexOf(c) >= 0;
      var namTrongTenKhac = false;
      camDoc.forEach(function (k) { if (k !== c && k.indexOf(c) >= 0) namTrongTenKhac = true; });
      if (!laTieuDeMapping && !namTrongTenKhac) voLy.push(c);
    });
    bang(voLy.length, 0, 'tên bị loại khỏi phép quét mà không có lý do kiểm được: ' + voLy.join(', '));

    // Chiều ngược lại: MỌI tên trùng tiêu đề sheet Mapping đều phải được khai TRƯỚC ở cfg.tenCotQuaChung.
    // Không khai thì đợt sau test báo dương tính giả, và người ta lại đi vá chỗ ngọn ngay trong test.
    var trungChuaKhai = camDoc.filter(function (c) { return SCHEMA.MAPPING.indexOf(c) >= 0 && quaChung.indexOf(c) < 0; });
    bang(trungChuaKhai.length, 0, 'tên cột trùng tiêu đề sheet Mapping mà chưa khai ở cfg.tenCotQuaChung: ' + trungChuaKhai.join(', '));

    // Ba cột cá nhân của fixture PHẢI còn nằm trong phần quét theo tên, nếu không phép quét thành cảnh rỗng
    var tenQuet = camDoc.filter(function (c) { return quaChung.indexOf(c) < 0; });
    TestData.PII_COT.forEach(function (c) {
      phai(tenQuet.indexOf(c) >= 0, 'cột cá nhân giả "' + c + '" bị loại khỏi phép quét theo tên — phép quét mất đối chứng');
    });
    phai(tenQuet.length >= 6, 'còn quá ít tên để quét theo tên: ' + tenQuet.length + '/' + camDoc.length + ' — chỗ mù đã nuốt gần hết phép quét');

    var lot = [];
    tenQuet.forEach(function (c) { if (dauVet.indexOf(c) >= 0) lot.push('tên cột "' + c + '"'); });
    TestData.PII_GIA_TRI.forEach(function (v) { if (dauVet.indexOf(v) >= 0) lot.push('giá trị cá nhân'); });
    bang(lot.length, 0, 'lọt dữ liệu người mua: ' + lot.join(', '));

    // đối chứng dương cho chính phép quét theo tên: thả đủ `tenQuet` vào một dấu vết giả thì phải bắt hết.
    // Thiếu dòng này thì một `tenQuet` rỗng cũng luôn báo 0 chỗ lọt, và phép quét trên thành vô nghĩa.
    var dauVetGia = 'nhat ky ' + tenQuet.join(' ') + ' het';
    var batDuoc = tenQuet.filter(function (c) { return dauVetGia.indexOf(c) >= 0; });
    bang(batDuoc.length, tenQuet.length, 'phép quét theo tên phải bắt được đủ tên khi chúng thật sự có mặt trong dấu vết');

    // regex số điện thoại 10 chữ số (0xxxxxxxxx) trong nhật ký và cảnh báo — kiểu rò khó thấy nhất
    // Regex số điện thoại 10 chữ số trong nhật ký và cảnh báo — kiểu rò khó thấy nhất, vì tên và địa chỉ
    // thì mắt thường bắt được, còn một dãy số thì lẫn vào giữa tiền và mã đơn.
    // Phải trừ MÃ ĐƠN ra trước: mã đơn được phép nằm trong nhật ký, và fixture ở đây cố ý dùng mã toàn
    // chữ số có số 0 đứng đầu (`BB0000000001`) để kiểm luật giữ số 0 — chính nó khớp mẫu số điện thoại.
    var chuNhatKy = JSON.stringify(kq.nhatKy) + JSON.stringify(kq.canhBao) + JSON.stringify(bc.kho.canhBaoDaGui);
    var maDonHopLe = baDonThu().map(function (d) { return String(d.maDon); });
    var chuDaTruMaDon = chuNhatKy;
    maDonHopLe.forEach(function (m) { chuDaTruMaDon = chuDaTruMaDon.split(m).join('<mã đơn>'); });
    var MAU_SDT = /(^|[^0-9])0[0-9]{9}([^0-9]|$)/g;
    var sdt = chuDaTruMaDon.match(MAU_SDT);
    bang(sdt ? sdt.length : 0, 0, 'nhật ký chứa chuỗi giống số điện thoại 10 chữ số: ' + JSON.stringify(sdt));
    // đối chứng dương cho chính phép quét trên: nếu một số điện thoại thật lọt vào thì nó PHẢI khớp.
    // Không có dòng này thì một regex hỏng sẽ luôn báo 0 và test thành vô nghĩa.
    phai(('nhat ky ' + TestData.PII_GIA_TRI.join(' ') + ' het').match(MAU_SDT),
      'mẫu số điện thoại phải bắt được giá trị cá nhân giả trong TestData.PII_GIA_TRI, nếu không phép quét là vô nghĩa');

    // đối chứng dương: bảng nguồn THẬT SỰ có dữ liệu cá nhân, nếu không phép kiểm trên rỗng
    var bangNguon = JSON.stringify(TestData.bangNguon(bc.cfg, baDonThu()));
    TestData.PII_GIA_TRI.forEach(function (v) { phai(bangNguon.indexOf(v) >= 0, 'bảng nguồn thử phải chứa "' + v + '"'); });

    return { ghiChu: 'soi ' + dauVet.length + ' ký tự dấu vết (sheet + Mapping + cảnh báo + nhật ký + kế hoạch ghi) · ' +
      tenQuet.length + '/' + camDoc.length + ' tên cột quét theo tên (bỏ ' + quaChung.length + ' tên quá chung: ' + quaChung.join(', ') + ') + ' +
      TestData.PII_GIA_TRI.length + ' giá trị cá nhân + regex SĐT: 0 lần khớp' };
  }

  // ================================================================== INV-6

  /**
   * INV-6 — KHÔNG TỰ SỬA CÔNG THỨC CỦA NGƯỜI.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: 18 sheet của file tháng nối nhau bằng công thức, và mỗi sheet có những vùng
   * người ta cố ý làm khác (cột F của Offood chỉ kéo tới dòng 409, SUMIF của `Tổng xuất` cho Importmart chỉ
   * tới dòng 148). Tool "sửa giúp" một công thức là sai lan sang cả file mà không ai thấy — D-15 nói rõ:
   * ghi vượt vùng thì CẢNH BÁO, tuyệt đối không tự kéo dài, không tự sửa.
   *
   * CÁCH KIỂM: đếm ô công thức và so từng chuỗi công thức của mọi ô NGOÀI vùng dòng mới, trước và sau khi ghi.
   * Cộng thêm: mọi ô trong `plan.congThucKeo` phải nằm dưới dòng cuối cũ, và phải có cảnh báo khi ghi vượt vùng.
   */
  function INV6_khongSuaCongThucCuaNguoi() {
    var bc = boiCanh();
    var ssTruoc = bc.kho.docSheet('Shopee mall');
    var dongCuoiCu = dongCuoiDuLieu(ssTruoc, bc.cfg);
    bang(dongCuoiCu, 6, 'dòng dữ liệu cuối trước khi chạy');

    function ctCua(ss, denDong) {
      var m = {};
      for (var r = 1; r <= denDong; r++) {
        for (var c = 1; c <= COT_Z; c++) {
          var t = (ss.congThuc[r - 1] || [])[c - 1];
          if (t != null && t !== '') m[r + ',' + c] = ((ss.mang[r - 1] || [])[c - 1] ? 'AF:' : 'F:') + String(t);
        }
      }
      return m;
    }
    var truoc = {}, denDong = {};
    Object.keys(bc.kho.sheets).forEach(function (t) {
      var ss = bc.kho.docSheet(t);
      denDong[t] = (t === 'Shopee mall' || t === 'Offood') ? dongCuoiDuLieu(ss, bc.cfg) : Math.max(ss.soDong || 0, ss.giaTri.length);
      truoc[t] = ctCua(ss, denDong[t]);
    });
    var soCtTruoc = Object.keys(truoc['Shopee mall']).length;
    phai(soCtTruoc > 0, 'sheet thử phải có sẵn công thức của người, nếu không phép kiểm này rỗng');

    var kq = chay(bc, [file(bc, baDonThu())]);
    bang(kq.donGhi, 3, 'ghi 3 đơn');

    var lech = [];
    Object.keys(truoc).forEach(function (t) {
      var sau = ctCua(bc.kho.docSheet(t), denDong[t]);
      var khoa = {};
      Object.keys(truoc[t]).forEach(function (k) { khoa[k] = 1; });
      Object.keys(sau).forEach(function (k) { khoa[k] = 1; });
      Object.keys(khoa).forEach(function (k) {
        if (truoc[t][k] !== sau[k]) lech.push(t + '!' + k + ': "' + (truoc[t][k] || '(không có)') + '" → "' + (sau[k] || '(mất)') + '"');
      });
    });
    bang(lech.length, 0, 'công thức ngoài vùng dòng mới bị đổi: ' + lech.slice(0, 5).join(' · '));
    bang(Object.keys(ctCua(bc.kho.docSheet('Shopee mall'), dongCuoiCu)).length, soCtTruoc, 'số ô công thức vùng cũ không đổi');

    var kh = bc.kho.keHoachDaGhi.filter(function (p) { return p.tenSheet === 'Shopee mall'; })[0];
    var chamCu = kh.congThucKeo.filter(function (o) { return o.r <= dongCuoiCu; });
    bang(chamCu.length, 0, 'kéo công thức chạm dòng cũ: ' + chamCu.map(function (o) { return Utils.chuCot(o.c) + o.r; }).join(', '));

    // ghi vượt vùng dòng tổng (SUM tới dòng 9, ghi tới dòng 10) → phải CẢNH BÁO chứ không tự kéo dài công thức
    var vuot = kq.canhBao.filter(function (c) { return String(c).indexOf('vùng dòng tổng') >= 0; });
    phai(vuot.length >= 1, 'ghi tới dòng 10 > vùng SUM tới dòng 9 thì phải có cảnh báo, không tự sửa công thức dòng tổng');
    bang(chuoiO(bc.kho.docSheet('Shopee mall'), 3, 8), 'F:SUM(H4:H9)', 'công thức dòng tổng giữ nguyên, không bị nới');

    return { ghiChu: soCtTruoc + ' ô công thức vùng cũ (Shopee mall) so từng chuỗi · 0 ô đổi · ' +
      vuot.length + ' cảnh báo vượt vùng, 0 lần tự sửa' };
  }

  // ================================================================== INV-8

  /**
   * INV-8 — DÒNG TỔNG (DÒNG 3) BẤT KHẢ XÂM PHẠM.
   *
   * VÌ SAO TEST NÀY TỒN TẠI: dòng 3 của mỗi sheet gian hàng là tổng cả tháng (`Shopee mall`!H3 = 301.690.192,
   * L3 = 217.111.614 — hai con số BA nhìn thẳng bằng mắt khi nghiệm thu, B-11 và B-12). Nó là công thức SUM
   * phủ toàn bộ vùng dữ liệu. Ghi đè bằng số cứng hay xê dịch một ô ở dòng đó thì SỐ TỔNG CỦA CẢ THÁNG SAI,
   * và sai một cách trông rất hợp lý — không ai phát hiện cho tới lúc đối chiếu sổ sách cuối tháng.
   *
   * CÁCH KIỂM: so từng ô A3:Z3 của mọi sheet gian hàng trước/sau, cộng khẳng định không lệnh ghi nào nhắm dòng 3.
   */
  function INV8_dongTongBatKhaXamPham() {
    var bc = boiCanh();
    var dongTong = bc.cfg.keyin.dong_tong;
    bang(dongTong, 3, 'dòng tổng theo cấu hình');
    var tenGian = Object.keys(bc.cfg.gianHang).map(function (m) { return bc.cfg.gianHang[m].sheet; })
      .filter(function (t) { return !!bc.kho.sheets[t]; });
    bang(tenGian.length, 2, '2 sheet gian hàng trong bối cảnh giả (file thật có 4 — xem node/test-bat-bien.js)');

    function anhDongTong() {
      var m = {};
      tenGian.forEach(function (t) {
        var ss = bc.kho.docSheet(t);
        for (var c = 1; c <= COT_Z; c++) m[t + '!' + c] = chuoiO(ss, dongTong, c);
      });
      return m;
    }
    var truoc = anhDongTong();
    var coNoiDung = Object.keys(truoc).filter(function (k) { return truoc[k] !== ''; });
    phai(coNoiDung.length >= 5, 'dòng tổng phải có sẵn công thức, nếu không phép kiểm này rỗng (đang ' + coNoiDung.length + ' ô)');

    var kq = chay(bc, [file(bc, baDonThu())]);
    bang(kq.donGhi, 3, 'ghi 3 đơn');

    var sau = anhDongTong();
    var lech = Object.keys(truoc).filter(function (k) { return truoc[k] !== sau[k]; });
    bang(lech.length, 0, 'ô dòng tổng bị đổi: ' + lech.map(function (k) { return k + ' "' + truoc[k] + '" → "' + sau[k] + '"'; }).join(' · '));

    var chamDongTong = [];
    bc.kho.keHoachDaGhi.forEach(function (p) {
      p.oGhi.concat(p.congThucKeo).concat(p.ghiChu).forEach(function (o) { if (o.r === dongTong) chamDongTong.push(p.tenSheet + '!' + Utils.chuCot(o.c) + o.r); });
      (p.toVang || []).forEach(function (r) { if (r === dongTong) chamDongTong.push(p.tenSheet + ': tô vàng dòng ' + r); });
      (p.gopO || []).forEach(function (g) { if (g.r1 <= dongTong && g.r2 >= dongTong) chamDongTong.push(p.tenSheet + ': gộp ô phủ dòng ' + dongTong); });
      if (p.tieuDeNote && p.tieuDeNote.r === dongTong) chamDongTong.push(p.tenSheet + ': ghi tiêu đề Note vào dòng tổng');
    });
    bang(chamDongTong.length, 0, 'kế hoạch ghi chạm dòng tổng: ' + chamDongTong.join(', '));

    return { ghiChu: coNoiDung.length + ' ô có nội dung ở dòng 3 của ' + tenGian.length + ' sheet · 0 ô đổi · 0 lệnh ghi nhắm dòng 3' };
  }

  // ==================================================================

  var DANH_SACH = [
    ['INV-1', 'Không bao giờ sửa hoặc xóa dòng đã có (băm A1:Z<dòng cuối cũ> mọi sheet, số dòng chỉ tăng)', INV1_khongSuaXoaDongDaCo],
    ['INV-2', 'Không thêm sheet nào ngoài Mapping_san_pham', INV2_khongThemSheetLa],
    ['INV-3', 'Vỏ ghi Google Sheet không ghi giá trị/công thức vào E, F, M, N', INV3a_voGhiSheetKhongChamEFMN],
    ['INV-3', 'Tầng ghi PHẢI NÉM LỖI khi lệnh ghi nhắm E/F/M/N ở chế độ SHEET (kể cả ô đầu cột)', INV3b_tangGhiPhaiNemLoi],
    ['INV-4', 'Không đọc/ghi/in 9 cột thông tin người mua (cfg.cotCamDocTuFileXuat, trừ cfg.tenCotQuaChung khi quét theo tên) + regex SĐT', INV4_khongDungCotThongTinNguoiMua],
    ['INV-6', 'Không tự sửa công thức của người (so từng chuỗi ngoài vùng dòng mới)', INV6_khongSuaCongThucCuaNguoi],
    ['INV-8', 'Dòng tổng (dòng 3) bất khả xâm phạm', INV8_dongTongBatKhaXamPham]
  ];

  function chayTatCa() {
    return DANH_SACH.map(function (t) {
      var kq = { ma: t[0], ten: t[1], dat: false, boQua: false, loi: null, ghiChu: '' };
      try {
        var r = t[2]();
        if (r && r.boQua) { kq.boQua = true; kq.ghiChu = r.lyDo; }
        else { kq.dat = true; kq.ghiChu = (r && r.ghiChu) || ''; }
      } catch (e) {
        kq.loi = e.message + (e.stack ? '\n        ' + String(e.stack).split('\n').slice(1, 3).join(' / ') : '');
      }
      return kq;
    });
  }

  return {
    chayTatCa: chayTatCa,
    DANH_SACH: DANH_SACH,
    COT_CAM_SHEET: COT_CAM_SHEET,
    SheetGiaLapGoogle: SheetGiaLapGoogle,
    bam: bam,
    chuoiO: chuoiO,
    dongCuoiDuLieu: dongCuoiDuLieu
  };
})();
