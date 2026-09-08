/**
 * TestSuite.gs — bộ test lõi cho GV-v2.2, chạy trong bộ nhớ (cả trong trình soạn Apps Script lẫn Node).
 * Không đụng dữ liệu thật. Test cần file .xlsx thật nằm ở `node/test-node.js`.
 *
 * Bộ test là HỢP ĐỒNG NGHIỆM THU — không sửa test để cho qua. Nghi test sai thì ghi vào NOTES_DEV.md và hỏi BA.
 * Phủ đủ các điểm đề bài mục 2 yêu cầu: gộp ô · bung cấu phần (kể cả tặng kèm) · cú pháp `mã/mã` chọn theo tồn ·
 * tự nhận loại file · append dòng mới vào Mapping · không sửa dòng cũ.
 */
var TestSuite = (function () {

  var T1 = new Date(2026, 8, 7, 8, 0, 0);
  var T2 = new Date(2026, 8, 7, 9, 0, 0);
  var T3 = new Date(2026, 8, 8, 8, 0, 0);
  var NGAY_GHI = '2026-09-07';

  function phai(dk, msg) { if (!dk) throw new Error(msg); }
  function bang(a, b, msg) { if (a !== b) throw new Error(msg + ' (mong ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a) + ')'); }
  function bangMang(a, b, msg) { bang(JSON.stringify(a), JSON.stringify(b), msg); }

  /**
   * Bối cảnh: kho giả có `Tổng tồn kho`, `Tổng xuất`, 2 sheet gian hàng và sheet Mapping.
   * Sheet `Shopee mall` giả: dữ liệu tới dòng 6 (dòng 5–6 là một đơn 2 dòng), công thức kéo tới 8, dòng tổng tới 9.
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
    var kho = new KhoGiaLap(sheets, tuyChon.mapping || TestData.mappingBang(tuyChon.themMapping));
    return { kho: kho, cfg: cfg };
  }

  function file(bc, cacDon, ten, tuyChon) {
    return { san: 'SHOPEE', maGianHang: tuyChon && tuyChon.gian ? tuyChon.gian : 'SP_MALL', tenFile: ten || 'mall.xlsx',
      bang: TestData.bangNguon(bc.cfg, cacDon, tuyChon) };
  }

  function chay(bc, files, thoiDiem, tuyChon) {
    var nguon = new NguonGiaLap(files);
    var tc = tuyChon || {};
    tc.thoiDiem = thoiDiem || T1;
    tc.cfg = bc.cfg;
    if (!tc.ngayGhi) tc.ngayGhi = NGAY_GHI;
    var kq = chayDongBo(nguon, bc.kho, tc);
    kq.nguon = nguon;
    return kq;
  }

  function nhatKy(kq) { return kq.nhatKy.map(function (r) { return String(r[LOG_COT.indexOf('thong_bao')]); }).join('\n'); }

  // ------------------------------------------------------------------ nguồn và nhận loại file

  function T01_chongTrungChay3Lan() {
    var bc = boiCanh();
    var dons = [TestData.don(), TestData.don({ maDon: 'TEST0904EEEE05', dongs: [{ ten: 'Sữa A2 Plus thùng 18', sl: 1, gia: 400000 }] })];
    var kq1 = chay(bc, [file(bc, dons)], T1);
    bang(kq1.donGhi, 2, 'lần 1 ghi 2 đơn');
    var anh1 = JSON.stringify(bc.kho.sheets['Shopee mall'].giaTri);
    var kq2 = chay(bc, [file(bc, dons, 'lai.xlsx')], T2);
    bang(kq2.donGhi, 0, 'lần 2 không ghi thêm'); bang(kq2.donDaCo, 2, 'lần 2: 2 đơn đã có');
    var kq3 = chay(bc, [file(bc, dons, 'lai2.xlsx')], T3);
    bang(kq3.donGhi, 0, 'lần 3 không ghi thêm');
    bang(JSON.stringify(bc.kho.sheets['Shopee mall'].giaTri), anh1, 'chạy 3 lần: sheet không đổi một ô');
    phai(nhatKy(kq2).indexOf('đã có trong sheet') >= 0, 'nhật ký ghi "đã có"');
  }

  function T02_tuNhanLoaiFile() {
    // file tab "Tất cả" (có cột Lý do hủy) → bỏ đơn hủy/hoàn; đơn thường vẫn ghi
    var bc = boiCanh();
    var dons = [
      TestData.don({ maDon: 'HUY0000000001', trangThai: 'Đã hủy', lyDoHuy: 'Người mua đổi ý' }),
      TestData.don({ maDon: 'HOAN000000001', trangThai: 'Hoàn thành', hoan: 'Đã Chấp Thuận Yêu Cầu' }),
      TestData.don({ maDon: 'OK0000000001', trangThai: 'Hoàn thành' })
    ];
    var kq = chay(bc, [file(bc, dons, 'tatca.xlsx', { tatCa: true })]);
    bang(kq.loaiFile.TAT_CA, 1, 'nhận ra file tab "Tất cả"');
    bang(kq.donBoQuaHuyHoan, 2, 'bỏ 2 đơn hủy/hoàn');
    bang(kq.donGhi, 1, 'chỉ ghi đơn còn lại');
    bang(bc.kho.o('Shopee mall', 7, 3).gt, 'OK0000000001', 'đơn thường ghi ở dòng 7');
    phai(nhatKy(kq).indexOf('tab "Tất cả"') >= 0, 'nhật ký nêu loại file');
    // file tab "Chờ lấy hàng" (không có cột Lý do hủy) → xử lý hết
    var bc2 = boiCanh();
    var kq2 = chay(bc2, [file(bc2, [TestData.don({ maDon: 'CHO0000000001' })], 'cholay.xlsx')]);
    bang(kq2.loaiFile.CHO_LAY_HANG, 1, 'nhận ra file tab "Chờ lấy hàng"');
    bang(kq2.donBoQuaHuyHoan, 0, 'không bỏ đơn nào');
    bang(kq2.donGhi, 1, 'ghi đơn');
  }

  function T03_thieuCotBatBuoc() {
    var bc = boiCanh();
    var cotSL = bc.cfg.cot.soLuongListing[0], cotPhi = bc.cfg.cot.phiSan[1];
    var kq = chay(bc, [file(bc, [TestData.don()], 'thieu.xlsx', { boCot: [cotSL, cotPhi] })]);
    bang(kq.soFileLoi, 1, 'file phải bị đánh dấu lỗi');
    bang(kq.donGhi, 0, 'không ghi dòng nào');
    var tb = nhatKy(kq);
    phai(tb.indexOf(cotSL) >= 0 && tb.indexOf(cotPhi) >= 0, 'thông báo nêu tên cột thiếu');
    TestData.PII_GIA_TRI.forEach(function (v) { phai(tb.indexOf(v) < 0, 'thông báo lỗi không được chứa dữ liệu cá nhân'); });
    bang(kq.nguon.loi[0], 'thieu.xlsx', 'file chuyển sang LOI, không xóa');
  }

  function T04_khongLotDuLieuCaNhan() {
    var bc = boiCanh();
    chay(bc, [file(bc, [TestData.don(), TestData.don({ maDon: 'LA0000000001', dongs: [{ ten: 'Hàng chưa có trong Mapping', sl: 1, gia: 1000 }] })])]);
    var chuoi = JSON.stringify(bc.kho.sheets) + JSON.stringify(bc.kho.mapping) + JSON.stringify(bc.kho.canhBaoDaGui);
    TestData.PII_GIA_TRI.forEach(function (v) { phai(chuoi.indexOf(v) < 0, 'không được lọt giá trị cá nhân "' + v + '"'); });
    TestData.PII_COT.forEach(function (c) { phai(chuoi.indexOf(c) < 0, 'không được lọt tên cột cá nhân "' + c + '"'); });
  }

  function T05_tieuDeTachDauThanh() {
    var bc = boiCanh();
    var f = file(bc, [TestData.don({ maDon: 'NFC0000000001', dongs: [{ ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', sl: 2, gia: 305000 }] })], 'nfd.xlsx', { tachDau: true });
    phai(f.bang[0].indexOf('Giá ưu đãi') < 0 && f.bang[0].indexOf(TestData.GIA_UU_DAI_TACH_DAU) >= 0, 'tiêu đề thử phải ở dạng tách dấu');
    bang(Utils.nfc(TestData.GIA_UU_DAI_TACH_DAU), 'Giá ưu đãi', 'NFC đưa về dạng gõ tay');
    var kq = chay(bc, [f]);
    bang(kq.soFileLoi, 0, 'đọc được file có tiêu đề tách dấu');
    bang(bc.kho.o('Shopee mall', 7, 8).gt, 610000, 'H = giá ưu đãi × số lượng');
  }

  function T06_trangThaiTienTo() {
    var cfg = Config.tao();
    bang(Config.traTrangThai(cfg, 'Người mua xác nhận đã nhận được hàng, tuy nhiên Người mua vẫn có thể gửi yêu cầu Trả hàng/Hoàn tiền tới ngày 2026-09-10.'), 'DA_GIAO', 'tiền tố → DA_GIAO');
    bang(Config.traTrangThai(cfg, 'Hoàn thành'), 'DA_GIAO', 'Hoàn thành');
    bang(Config.traTrangThai(cfg, '  đã HỦY '), 'DA_HUY', 'khớp sau chuẩn hóa');
    bang(Config.traTrangThai(cfg, 'Trạng thái mới toanh'), null, 'lạ → null');
    bang(Config.traTrangThai(cfg, 'Đã Chấp Thuận Yêu Cầu', true), 'DA_HOAN', 'cột hoàn');
    var bc = boiCanh();
    var kq = chay(bc, [file(bc, [TestData.don({ maDon: 'TT0000000003', trangThai: 'Trạng thái mới toanh' })])]);
    phai(nhatKy(kq).indexOf('Trạng thái lạ') >= 0, 'cảnh báo trạng thái lạ');
    bang(kq.donGhi, 1, 'trạng thái lạ vẫn ghi (tab Chờ lấy hàng không có đơn hủy)');
  }

  /**
   * Hai cách làm tròn thuế cho đơn NHIỀU DÒNG đều phải chạy được, vì nhân viên gõ tay không nhất quán:
   *   thue_theo_dong = true  (mặc định) → làm tròn TỪNG DÒNG rồi cộng; khớp 392/393 đơn tháng 8
   *   thue_theo_dong = false            → làm tròn MỘT LẦN trên cả đơn, đúng câu chữ Context 5.2; khớp 391/393
   * Cùng một đơn ba dòng dưới đây lệch nhau đúng 1 đồng — con số đó là bằng chứng cho BA chọn.
   */
  function T07_tienCapDon() {
    function donBaDong() {
      // phí và MGG lặp giống hệt trên mọi dòng (đúng như file xuất thật) → chỉ lấy MỘT lần
      return TestData.don({
        maDon: 'TEST0905GGGG07', ggShop: 24750, phiCoDinh: 14000, phiDV: 10700, phiXL: 8400,
        dongs: [
          { ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', sl: 1, gia: 305000 },
          { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Thùng 24 Hộp', sl: 2, gia: 305000 },
          { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Lốc 6 Hộp', sl: 1, gia: 84000 }
        ]
      });
    }
    var T = 'Shopee mall';

    // ---- phần không phụ thuộc cách làm tròn: H cộng dồn, I/J lấy một lần ----
    var bc = boiCanh();
    chay(bc, [file(bc, [donBaDong()])]);
    var k = bc.kho;
    bang(k.o(T, 7, 8).gt, 999000, 'H = tổng tiền hàng cả đơn (305.000 + 610.000 + 84.000)');
    bang(k.o(T, 7, 9).gt, 24750, 'I = MGG shop lấy MỘT lần, không cộng dồn 3 dòng');
    bang(k.o(T, 7, 10).gt, 33100, 'J = 14.000 + 10.700 + 8.400, lấy một lần');
    [8, 9, 10, 11].forEach(function (c) {
      bang(k.o(T, 8, c).gt, null, 'dòng 2 của đơn: cột tiền để trống (nằm trong ô gộp)');
      bang(k.o(T, 9, c).gt, null, 'dòng 3 của đơn: cột tiền để trống');
    });
    // mặc định = theo từng dòng: cơ sở chia theo tiền từng dòng rồi làm tròn ba lần
    bang(k.o(T, 7, 11).gt, 14613, 'K mặc định (thue_theo_dong = true): làm tròn từng dòng rồi cộng');

    // ---- cách của Context 5.2: một lần trên cả đơn ----
    var bc2 = boiCanh({ cauHinh: { chung: { thue_theo_dong: false } } });
    chay(bc2, [file(bc2, [donBaDong()])]);
    // cơ sở 999.000 − 24.750 = 974.250 → round(1%) = 9.743 + round(0,5%) = 4.871 = 14.614
    bang(bc2.kho.o(T, 7, 11).gt, 14614, 'K = round(1% × cơ sở) + round(0,5% × cơ sở) trên CẢ ĐƠN');
    bang(bc2.kho.o(T, 7, 8).gt, 999000, 'H không đổi giữa hai cách');

    // ---- đơn MỘT dòng: hai cách phải cho cùng một số ----
    var motDong = { maDon: 'TEST0905FFFF06', ggShop: 24750, phiCoDinh: 14000,
      dongs: [{ ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', sl: 3, gia: 305000 }] };
    var a = boiCanh(); chay(a, [file(a, [TestData.don(motDong)])]);
    var b = boiCanh({ cauHinh: { chung: { thue_theo_dong: false } } }); chay(b, [file(b, [TestData.don(motDong)])]);
    bang(a.kho.o(T, 7, 11).gt, b.kho.o(T, 7, 11).gt, 'đơn một dòng: hai cách làm tròn ra cùng một số thuế');
  }


  function T08_thueBaMoc() {
    var cfg = Config.tao();
    function t(coSo) { var x = Normalize.tinhThue(coSo, cfg); return [x.gtgt, x.tncn, x.tong]; }
    bangMang(t(140000), [1400, 700, 2100], '140.000 → 2.100 (khớp ảnh chi tiết đơn)');
    bangMang(t(470250), [4703, 2351, 7054], '470.250 → 7.054');
    bangMang(t(935750), [9358, 4679, 14037], '935.750 → 14.037 — làm tròn HAI lần');
    bangMang(t(0), [0, 0, 0], '0');
    var cfg2 = Config.tao({ chung: { thue_cach_tinh: 'TONG_TY_LE' } });
    var y = Normalize.tinhThue(935750, cfg2);
    bangMang([y.gtgt, y.tncn, y.tong], [9358, 4678, 14036], 'TONG_TY_LE ra 14.036 — vì thế mặc định là TACH_ROI_CONG');
    bang(Utils.lamTron(7053.75), 7054, 'half-up'); bang(Utils.lamTron(2.5), 3, 'half-up 2,5');
  }

  // ------------------------------------------------------------------ gộp ô

  function T09_gopO() {
    var bc = boiCanh();
    var d = TestData.don({ maDon: 'GOP0000000001', ggShop: 10000, phiCoDinh: 5000, phiDV: 0, phiXL: 0,
      dongs: [
        { ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', sl: 1, gia: 100000 },
        { ten: 'Sữa A2 Plus thùng 18', sl: 2, gia: 200000 },
        { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Lốc 6 Hộp', sl: 3, gia: 50000 }
      ] });
    var kq = chay(bc, [file(bc, [d])]);
    var k = bc.kho, T = 'Shopee mall';
    // dữ liệu cũ tới dòng 6 → đơn mới nằm ở dòng 7–9
    bangMang(k.cacVungGop(T), ['C7:C9', 'H7:H9', 'I7:I9', 'J7:J9', 'K7:K9', 'L7:L9'], 'gộp đúng 6 cụm C, H, I, J, K, L');
    bang(kq.donGopO, 1, 'một đơn được gộp');
    bang(k.o(T, 7, 3).gt, 'GOP0000000001', 'C7 giữ mã đơn'); bang(k.o(T, 7, 3).dinhDang, '@', 'C7 định dạng chữ');
    bang(k.o(T, 8, 3).gt, null, 'C8 trống — nằm trong ô gộp');
    bangMang([k.o(T, 7, 4).gt, k.o(T, 8, 4).gt, k.o(T, 9, 4).gt], ['dt5', 'A2', 'Hạt TE Lốc'], 'cột D ghi riêng từng dòng');
    bangMang([k.o(T, 7, 7).gt, k.o(T, 8, 7).gt, k.o(T, 9, 7).gt], [1, 2, 3], 'cột G ghi riêng từng dòng');
    // công thức L chỉ được kéo ở ô trên cùng của vùng gộp — các dòng sau nằm trong ô gộp nên tool không đụng
    bang(k.o(T, 7, 12).congThuc, 'H7-I7-J7-K7', 'L7 có công thức');
    var keoL = k.keHoachDaGhi[0].congThucKeo.filter(function (o) { return o.c === bc.cfg.keyin.cot_doanh_thu; });
    bangMang(keoL.map(function (o) { return o.r; }), [], 'không kéo thêm công thức L nào (dòng 7–9 đã có sẵn công thức trong sheet)');
    var bc3 = boiCanh({ congThucToi: 6 });      // công thức chỉ tới dòng 6 → đơn mới ở 7–9 phải tự kéo L
    chay(bc3, [file(bc3, [d])]);
    var keoL3 = bc3.kho.keHoachDaGhi[0].congThucKeo.filter(function (o) { return o.c === bc3.cfg.keyin.cot_doanh_thu; });
    bangMang(keoL3.map(function (o) { return o.r; }), [7], 'chỉ kéo công thức L ở dòng ĐẦU của đơn (dòng 8, 9 nằm trong ô gộp)');
    bang(bc3.kho.o(T, 7, 12).congThuc, 'H7-I7-J7-K7', 'L7 được kéo và dịch đúng dòng');
    // đơn một dòng thì không gộp
    var bc2 = boiCanh();
    chay(bc2, [file(bc2, [TestData.don({ maDon: 'MOT0000000001' })])]);
    bangMang(bc2.kho.cacVungGop('Shopee mall'), [], 'đơn một dòng: không tạo vùng gộp nào');
  }

  function T10_khongSuaDongCu() {
    var bc = boiCanh();
    var truoc = {};
    for (var r = 4; r <= 6; r++) for (var c = 1; c <= 15; c++) truoc[r + ',' + c] = JSON.stringify(bc.kho.o('Shopee mall', r, c));
    chay(bc, [file(bc, [TestData.don({ maDon: 'MOI0000000001' })])]);
    for (var r2 = 4; r2 <= 6; r2++) for (var c2 = 1; c2 <= 15; c2++) {
      bang(JSON.stringify(bc.kho.o('Shopee mall', r2, c2)), truoc[r2 + ',' + c2], 'ô (' + r2 + ',' + c2 + ') của dòng cũ phải y nguyên');
    }
    phai(!bc.kho.dongVang('Shopee mall', 4) && !bc.kho.dongVang('Shopee mall', 5), 'không tô vàng dòng cũ');
    bang(bc.kho.o('Shopee mall', 7, 3).gt, 'MOI0000000001', 'đơn mới ghi dưới dòng cuối');
  }

  // ------------------------------------------------------------------ Mapping: cấu phần, nhiều lô, xác nhận

  function T11_bungCauPhanMix() {
    var bc = boiCanh();
    // "Combo đi sinh Altawell" = khăn gừng x 1; kvs x 1 — khách mua 2 → mỗi cấu phần × 2
    var kq = chay(bc, [file(bc, [TestData.don({ maDon: 'CP00000000001', dongs: [{ ten: 'Combo đi sinh Altawell', sl: 2, gia: 300000 }] })])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(kq.dongGhi, 2, 'một dòng xuất bung thành 2 dòng ghi');
    bangMang([k.o(T, 7, 4).gt, k.o(T, 8, 4).gt], ['khăn gừng', 'kvs'], 'mỗi cấu phần một dòng (cấu phần ghi một mã thì dùng đúng mã đó)');
    bangMang([k.o(T, 7, 7).gt, k.o(T, 8, 7).gt], [2, 2], 'số lượng = số cấu phần × số lượng mua');
    bang(k.o(T, 7, 8).gt, 600000, 'tiền của cả đơn ghi một lần ở dòng đầu');
    bang(k.o(T, 8, 8).gt, null, 'dòng cấu phần thứ hai không lặp tiền');
    bangMang(k.cacVungGop(T), ['C7:C8', 'H7:H8', 'I7:I8', 'J7:J8', 'K7:K8', 'L7:L8'], 'cấu phần cũng gộp ô như đơn nhiều dòng');
  }

  function T12_cauPhanTangKem() {
    // Context 6.3: "Thùng 24H Nguyên Vị, Set 6H Nguyên Vị" = mua 1 thùng, tặng 1 lốc → trừ hai mã
    var bc = boiCanh();
    var kq = chay(bc, [file(bc, [TestData.don({ maDon: 'TK00000000001',
      dongs: [{ ten: 'Thùng 24H mua 1 tặng lốc', phanLoai: 'Thùng 24H Nguyên Vị,Set 6H Nguyên Vị', sl: 1, gia: 985000 }] })])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(kq.dongGhi, 2, 'hàng tặng kèm cũng bung thành 2 dòng');
    bangMang([k.o(T, 7, 4).gt, k.o(T, 8, 4).gt], ['Hạt TE', 'Hạt TE Lốc'], 'thùng + lốc quà');
    bangMang([k.o(T, 7, 7).gt, k.o(T, 8, 7).gt], [1, 1], 'mỗi mã một đơn vị');
    phai(!k.dongVang(T, 7) && !k.dongVang(T, 8), 'cấu phần hợp lệ thì không tô vàng');
  }

  function T13_cauPhanSaiCuPhap() {
    var bc = boiCanh();
    var kq = chay(bc, [file(bc, [TestData.don({ maDon: 'SAI0000000001', dongs: [{ ten: 'Combo sai cú pháp', sl: 1, gia: 100000 }] })])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(kq.donGhi, 1, 'vẫn ghi đơn'); bang(kq.dongVang, 1, 'một dòng vàng');
    bang(k.o(T, 7, 3).gt, 'SAI0000000001', 'mã đơn vẫn ghi');
    bang(k.o(T, 7, 4).gt, null, 'cột D để trống — không đoán');
    phai(k.dongVang(T, 7), 'tô vàng cả dòng');
    var note = k.o(T, 7, 16).gt;
    phai(String(note).indexOf('cấu phần sai cú pháp') >= 0, 'Note nêu lý do: ' + note);
    phai(String(note).indexOf('khong_co') >= 0, 'Note nêu phần sai cụ thể: ' + note);
    bang(k.o(T, 2, 16).gt, 'Note', 'tiêu đề cột Note ở dòng 2');
  }

  function T14_nhieuLoChonTheoTon() {
    var bc = boiCanh();
    // DD 250 (tồn 0) / DD250 (tồn 16) → chọn DD250; khăn gừng (43) / khăn gừng 1 (3) → chọn khăn gừng 1
    chay(bc, [file(bc, [
      TestData.don({ maDon: 'LO00000000001', dongs: [{ ten: 'Dầu Dừa Vietcoco', phanLoai: 'CHAI 250ML', sl: 1, gia: 100000 }] }),
      TestData.don({ maDon: 'LO00000000002', dongs: [{ ten: 'Khăn Gừng Altawell', sl: 1, gia: 100000 }] })
    ])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(k.o(T, 7, 4).gt, 'DD250', 'bỏ lô tồn 0, lấy lô còn hàng');
    bang(k.o(T, 8, 4).gt, 'khăn gừng 1', 'hai lô còn hàng → lấy lô tồn NHỎ NHẤT (3 < 43)');
    phai(!k.dongVang(T, 7) && !k.dongVang(T, 8), 'chọn được lô thì không tô vàng');
    // đơn vị kiểm tra hàm chọn lô
    var dm = DanhMuc.doc(TestData.danhMucBang());
    bang(MapListing.chonLo(['DD 250', 'DD250'], dm).item.tenVietTat, 'DD250', 'chọn lô còn hàng');
    bang(MapListing.chonLo(['khăn gừng', 'khăn gừng 1'], dm).item.tenVietTat, 'khăn gừng 1', 'chọn lô tồn nhỏ nhất');
    bang(MapListing.chonLo(['khong_co_gi'], dm), null, 'không mã nào trong danh mục → null');
    bangMang(MapListing.tachLo('or 1/or 20'), ['or 1', 'or 20'], 'tách theo dấu /');
    bangMang(MapListing.tachLo('rút lê; rút chuông'), ['rút lê', 'rút chuông'], 'tách theo dấu ; (cột lô phụ của fixture)');
  }

  function T15_moiLoDeuHetTon() {
    var bc = boiCanh();
    var kq = chay(bc, [file(bc, [TestData.don({ maDon: 'HET0000000001', dongs: [{ ten: 'Hàng hết cả hai lô', sl: 1, gia: 100000 }] })])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(k.o(T, 7, 4).gt, 'het A', 'mọi lô tồn 0 → dùng mã đầu tiên');
    phai(k.dongVang(T, 7), 'tô vàng để người kiểm');
    phai(String(k.o(T, 7, 16).gt).indexOf('tồn 0 — kiểm tra lô') >= 0, 'Note ghi "tồn 0 — kiểm tra lô": ' + k.o(T, 7, 16).gt);
    bang(kq.donGhi, 1, 'vẫn ghi đơn');
  }

  function T16_chiDungDongDaXacNhan() {
    var bc = boiCanh();
    var kq = chay(bc, [file(bc, [
      TestData.don({ maDon: 'XN00000000001', dongs: [{ ten: 'Listing chưa tick', sl: 1, gia: 100000 }] }),
      TestData.don({ maDon: 'XN00000000002', dongs: [{ ten: 'Listing tên viết tắt lạ', sl: 1, gia: 100000 }] }),
      TestData.don({ maDon: 'XN00000000003', dongs: [{ ten: 'Listing để trống', sl: 1, gia: 100000 }] })
    ])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(kq.dongVang, 3, 'cả ba dòng đều vàng');
    [7, 8, 9].forEach(function (r) {
      bang(k.o(T, r, 4).gt, null, 'dòng ' + r + ': cột D để trống');
      phai(k.dongVang(T, r), 'dòng ' + r + ' tô vàng');
    });
    phai(String(k.o(T, 7, 16).gt).indexOf('chưa ghi CÓ') >= 0, 'lý do: chưa xác nhận — ' + k.o(T, 7, 16).gt);
    phai(String(k.o(T, 8, 16).gt).indexOf('không có trong danh mục kho') >= 0, 'lý do: tên viết tắt lạ — ' + k.o(T, 8, 16).gt);
    phai(String(k.o(T, 9, 16).gt).indexOf('chưa điền') >= 0, 'lý do: chưa điền — ' + k.o(T, 9, 16).gt);
    bang(kq.donGhi, 3, 'chưa nhận ra vẫn ghi đủ 3 đơn');
  }

  function T17_appendTenMoiVaoMapping() {
    var bc = boiCanh();
    var soCu = bc.kho.mappingDoiTuong().length;
    var truocJson = JSON.stringify(bc.kho.mapping);
    var kq = chay(bc, [file(bc, [
      TestData.don({ maDon: 'MOI0000000001', dongs: [{ ten: 'Sữa Hạt Nature Kids Hàn Quốc bản mới', phanLoai: 'Thùng 24 Hộp', sl: 1, gia: 985000 }] }),
      TestData.don({ maDon: 'MOI0000000002', dongs: [{ ten: '  sữa hạt NATURE kids   hàn quốc bản mới ', phanLoai: 'thùng 24 hộp', sl: 2, gia: 985000 }] })
    ], 'thang9.xlsx')]);
    bang(kq.tenMoi, 1, 'hai đơn cùng tên (khác hoa/thường, khoảng trắng) → chỉ thêm 1 dòng');
    var m = bc.kho.mappingDoiTuong();
    bang(m.length, soCu + 1, 'Mapping +1 dòng');
    var moi = m[m.length - 1];
    bang(moi['Tên trên Shopee'], 'Sữa Hạt Nature Kids Hàn Quốc bản mới', 'tên chép nguyên văn từ file xuất');
    bang(moi['Phân loại'], 'Thùng 24 Hộp', 'phân loại');
    bang(moi['Gian hàng'], 'Shopee mall', 'gian hàng ghi tên hiển thị');
    bang(String(moi['Tên viết tắt']), '', 'để trống phần người điền');
    bang(String(moi['Xác nhận']), '', 'chưa xác nhận');
    bang(moi['Gợi ý 1'], 'Hạt TE', 'gợi ý từ dòng đã xác nhận gần giống nhất');
    phai(String(moi['Ghi chú']).indexOf('thang9.xlsx') >= 0, 'ghi chú nêu file nguồn');
    phai(bc.kho.mappingToVang.indexOf(m.length + 1) >= 0, 'dòng mới được tô vàng');
    // đơn vẫn được ghi, dòng vàng, Note nói tên mới
    var k = bc.kho, T = 'Shopee mall';
    bang(kq.donGhi, 2, 'vẫn ghi cả hai đơn');
    phai(k.dongVang(T, 7), 'dòng đơn tô vàng');
    phai(String(k.o(T, 7, 16).gt).indexOf('tên hàng mới') >= 0, 'Note báo tên hàng mới: ' + k.o(T, 7, 16).gt);
    // chạy lại: không thêm dòng trùng, và sheet Mapping không đổi
    var kq2 = chay(bc, [file(bc, [TestData.don({ maDon: 'MOI0000000003', dongs: [{ ten: 'Sữa Hạt Nature Kids Hàn Quốc bản mới', phanLoai: 'Thùng 24 Hộp', sl: 1, gia: 985000 }] })], 'lai.xlsx')], T2);
    bang(kq2.tenMoi, 0, 'lần 2 không thêm dòng trùng');
    bang(bc.kho.mappingDoiTuong().length, soCu + 1, 'số dòng Mapping không tăng');
    phai(truocJson !== JSON.stringify(bc.kho.mapping), 'lần 1 có sửa Mapping (để so sánh có ý nghĩa)');
  }

  function T18_khongDungONguoiDaDien() {
    var bc = boiCanh();
    // người đã điền dòng "Listing chưa tick" (có tên viết tắt, chưa ghi CÓ) — tool không được tự tick hộ, không xóa
    chay(bc, [file(bc, [TestData.don({ maDon: 'ND00000000001', dongs: [{ ten: 'Hàng mới toanh chưa có', sl: 1, gia: 1000 }] })])]);
    var m = {};
    bc.kho.mappingDoiTuong().forEach(function (d) { m[d['Tên trên Shopee']] = d; });
    bang(m['Listing chưa tick']['Tên viết tắt'], 'dt5', 'giữ nguyên chữ người gõ');
    bang(String(m['Listing chưa tick']['Xác nhận']), '', 'không tự tick hộ');
    bang(m['Combo đi sinh Altawell']['Cấu phần'], 'khăn gừng x 1; kvs x 1', 'giữ nguyên cấu phần người điền');
    bang(String(m['Dầu Dừa Vietcoco']['Tên viết tắt']), 'DD 250/DD250', 'giữ nguyên cú pháp nhiều lô');
    bang(m['Bột Ngũ Cốc 5 Loại Hạt Damtuh']['Mã hàng'], '1548', 'cột tool tự tra mã hàng');
  }

  function T19_docMappingLayoutFixture() {
    // fixture nghiệm thu có 13 cột, tên cột xuống dòng, và cột riêng "Mã dùng lần lượt khi hết lô"
    var dm = DanhMuc.doc(TestData.danhMucBang());
    var bang13 = [
      ['Gian hàng', 'Tên trên Shopee', 'Phân loại', 'Tên viết tắt', 'Mã dùng lần lượt\nkhi hết lô', 'Hệ số',
        'Cấu phần\n(hàng mix / combo / tặng kèm)', 'Xác nhận', 'Mã hàng', 'Gợi ý 1', 'Gợi ý 2', 'Ngày thêm', 'Ghi chú'],
      ['Shopee mall', 'Dầu dừa fixture', 'CHAI 250ML', 'DD 250', 'DD250', 1, '', 'CÓ', '', '', '', '', ''],
      ['Shopee mall', 'Hàng thường fixture', '', 'dt5', '', 1, '', 'CÓ', '', '', '', '', '']
    ];
    var map = MapListing.docBang(bang13, dm, Config.tao());
    bang(map.dong.length, 2, 'đọc được 2 dòng');
    bang(MapListing.tenCotChuan('Cấu phần\n(hàng mix / combo / tặng kèm)'), 'Cấu phần', 'tiêu đề xuống dòng vẫn nhận ra');
    var d1 = MapListing.tra(map, 'SP_MALL', 'Dầu dừa fixture', 'CHAI 250ML');
    phai(d1 && d1.__muc, 'dòng fixture dùng được');
    bang(d1.__muc.item.tenVietTat, 'DD250', 'cột lô phụ được gộp vào danh sách lô → chọn lô còn hàng');
    var d2 = MapListing.tra(map, 'SP_MALL', 'Hàng thường fixture', '');
    bang(d2.__muc.item.maHang, '1548', 'dòng thường vẫn đúng');
  }

  // ------------------------------------------------------------------ cột công thức

  function T20_cheDoExcelKeoNamCot() {
    var bc = boiCanh({ congThucToi: 7 });     // công thức chỉ kéo sẵn tới dòng 7 → dòng 8 trở đi phải tự kéo
    chay(bc, [file(bc, [TestData.don({ maDon: 'CT00000000001' }), TestData.don({ maDon: 'CT00000000002' })])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(bc.cfg.chung.che_do_cong_thuc, 'EXCEL', 'mặc định là chế độ Excel');
    ['E', 'F', 'M', 'N'].forEach(function (c) {
      var o8 = k.o(T, 8, Utils.chiSoCot(c));
      phai(o8.congThuc && o8.congThuc.indexOf('8') >= 0, c + '8 phải được kéo và dịch đúng dòng');
      phai(o8.mang, c + '8 giữ ArrayFormula');
    });
    bang(k.o(T, 8, 12).congThuc, 'H8-I8-J8-K8', 'L8 công thức thường');
    bang(k.o(T, 8, 12).mang, false, 'L không phải ArrayFormula');
  }

  function T21_cheDoSheetChiKeoCotL() {
    var bc = boiCanh({ congThucToi: 7, cauHinh: { chung: { che_do_cong_thuc: 'SHEET' } } });
    chay(bc, [file(bc, [TestData.don({ maDon: 'SH00000000001' }), TestData.don({ maDon: 'SH00000000002' })])]);
    var k = bc.kho, T = 'Shopee mall';
    // trên Google Sheet, E/F/M/N là ARRAYFORMULA một ô duy nhất — ghi vào là hỏng cả cột
    ['E', 'F', 'M', 'N'].forEach(function (c) {
      var o8 = k.o(T, 8, Utils.chiSoCot(c));
      bang(o8.congThuc, null, c + '8 KHÔNG được chạm tới ở chế độ SHEET');
      bang(o8.gt, null, c + '8 không được ghi giá trị');
    });
    bang(k.o(T, 8, 12).congThuc, 'H8-I8-J8-K8', 'chỉ cột L được kéo');
    var plan = k.keHoachDaGhi[0];
    bang(plan.cheDoCongThuc, 'SHEET', 'kế hoạch ghi nhận chế độ');
    phai(plan.congThucKeo.every(function (o) { return o.c === bc.cfg.keyin.cot_doanh_thu; }), 'kế hoạch chỉ kéo cột L');
  }

  function T22_oLSoTayMoCoi() {
    // Dựng đúng tình huống file tháng 8 (Context 8.3): nhân viên gõ số âm vào cột Doanh Thu ở đơn HOÀN đã ghi,
    // và bước xóa dữ liệu cũ để sót số đó lại ở dòng trống mà tool sắp ghi đơn mới.
    var bc = boiCanh({ congThucToi: 8, dongCoSan: [
      { ma: 'TEST0731AAAA01', tvt: 'dt5', sl: 1, h: 220000, j: 59100, k: 3300 },       // dòng 4: L còn công thức
      { ma: 'TEST0808CCCC03', tvt: 'Hạt TE', sl: 1, h: 1880000, j: 0, k: 0, l: -40000 } // dòng 5: đơn HOÀN, nhân viên gõ tay
    ] });
    var s = bc.kho.sheets['Shopee mall'];
    s.giaTri[5][11] = -36500; s.congThuc[5][11] = null; s.mang[5][11] = false;   // dòng 6: số sót ở dòng TRỐNG
    var kq = chay(bc, [file(bc, [TestData.don({ maDon: 'MOCOI00000001' })])]);
    var k = bc.kho, T = 'Shopee mall';
    bang(k.o(T, 6, 3).gt, 'MOCOI00000001', 'đơn mới ghi ở dòng 6');
    bang(k.o(T, 6, 12).congThuc, 'H6-I6-J6-K6', 'L6: số mồ côi được trả lại công thức');
    bang(k.o(T, 6, 12).gt, null, 'L6 không còn số gõ tay');
    bang(kq.giaTriTayThay, 1, 'đúng 1 ô được trả lại công thức');
    bang(k.o(T, 5, 12).gt, -40000, 'L5 của dòng nhân viên đã ghi: GIỮ NGUYÊN số tay');
    bang(k.o(T, 5, 12).congThuc, null, 'L5 không bị biến thành công thức');
    phai(nhatKy(kq).indexOf('số gõ tay -36500 đã được trả lại công thức') >= 0, 'nhật ký ghi rõ ô nào: ' + nhatKy(kq));
    // không có công thức nào phía trên để kéo → giữ nguyên số và cảnh báo, tuyệt đối không đoán
    var bc2 = boiCanh({ congThucToi: 5, dongCoSan: [{ ma: 'CU000000000001', tvt: 'dt5', sl: 1, h: 100000 }] });
    var s2 = bc2.kho.sheets['Shopee mall'];
    s2.congThuc[3][11] = null;                                    // xóa công thức L của dòng 4
    s2.giaTri[4][11] = -12345; s2.congThuc[4][11] = null;         // dòng 5: số sót, phía trên không còn công thức nào để kéo
    var kq2 = chay(bc2, [file(bc2, [TestData.don({ maDon: 'MOCOI00000002' })])]);
    bang(bc2.kho.o(T, 5, 12).gt, -12345, 'không có mẫu để kéo → giữ nguyên, không đoán');
    bang(kq2.giaTriTayThay, 0, 'không tính là đã thay');
    phai(kq2.canhBao.join(' ').indexOf('không có công thức nào để kéo') >= 0, 'phải cảnh báo để người kiểm tay');
  }

  function T23_dichCongThuc() {
    var f = "INDEX('Tổng tồn kho'!$C$3:$G$482, MATCH($D516,'Tổng tồn kho'!$D$3:$D$482,0),1)";
    bang(Utils.dichCongThuc(f, 516, 517), "INDEX('Tổng tồn kho'!$C$3:$G$482, MATCH($D517,'Tổng tồn kho'!$D$3:$D$482,0),1)", 'cột tuyệt đối, dòng tương đối');
    bang(Utils.dichCongThuc('H516-I516-J516-K516', 516, 520), 'H520-I520-J520-K520', 'công thức thường');
    bang(Utils.dichCongThuc('SUM(H4:H901)', 3, 4), 'SUM(H5:H902)', 'vùng tương đối');
    bang(Utils.dichCongThuc('IF(A1="B2",LOG10(C3),$A$1)', 1, 3), 'IF(A3="B2",LOG10(C5),$A$1)', 'bỏ qua chuỗi và tên hàm có số');
  }

  // ------------------------------------------------------------------ vùng công thức, cột Note, danh mục

  function T24_canhBaoVungCongThuc() {
    var bc = boiCanh();
    var dons = [];
    for (var i = 0; i < 5; i++) dons.push(TestData.don({ maDon: 'VUOT' + ('000000000' + i).slice(-10) }));
    var kq = chay(bc, [file(bc, dons)]);
    var cb = kq.canhBao.join(' | ');
    phai(cb.indexOf('CẢNH BÁO') >= 0 && cb.indexOf('dòng tổng') >= 0, 'phải cảnh báo vượt vùng dòng tổng: ' + cb);
    phai(cb.indexOf('SUMIF') >= 0, 'phải nhắc vùng SUMIF của Tổng xuất');
    var ss = bc.kho.docSheet('Shopee mall');
    bang(KeyIn.gioiHanDongTong(ss, bc.cfg.keyin).gioiHan, 9, 'đọc đúng vùng dòng tổng');
    bang(KeyIn.gioiHanTongXuat(bc.kho.docSheet('Tổng xuất'), 'Shopee mall').gioiHan, 12, 'đọc đúng vùng SUMIF');
    bang(KeyIn.gioiHanTongXuat(bc.kho.docSheet('Tổng xuất'), 'Babyiu').gioiHan, null, 'sheet không được tham chiếu → null');
  }

  function T25_cotNoteTuDo() {
    var bc = boiCanh();
    var ss = bc.kho.docSheet('Shopee mall');
    bang(KeyIn.cotNote(ss, bc.cfg.keyin), 16, 'cột trống đầu tiên sau `Còn Nợ` (O) → P = 16');
    bang(KeyIn.dongDuLieuCuoi(ss, bc.cfg.keyin), 6, 'dòng dữ liệu cuối dò theo C/D, không theo số dòng sheet');
    var daCo = KeyIn.maDonDaCo(ss, bc.cfg.keyin, 6);
    bangMang(Object.keys(daCo).sort(), ['TEST0731AAAA01', 'TEST0801BBBB02'], 'mã đơn đã có (kể cả đơn gộp ô)');
    // cấu hình chỉ định cột Note khác
    var bc2 = boiCanh({ cauHinh: { keyin: { cot_note: 'T', tieu_de_note: 'Ghi chú tool' } } });
    chay(bc2, [file(bc2, [TestData.don({ maDon: 'NOTE000000001', dongs: [{ ten: 'Hàng lạ chưa có', sl: 1, gia: 1000 }] })])]);
    bang(bc2.kho.o('Shopee mall', 2, 20).gt, 'Ghi chú tool', 'tiêu đề Note ở cột T theo cấu hình');
    phai(bc2.kho.o('Shopee mall', 7, 20).gt != null, 'ghi chú vào cột T');
  }

  function T26_danhMucVaTon() {
    var dm = DanhMuc.doc(TestData.danhMucBang());
    bang(dm.soDong, 13, 'đọc đủ dòng danh mục');
    bang(dm.theoTvt['dt5'].maHang, '1548', 'tra theo tên viết tắt');
    bang(dm.theoTvt['dd250'].ton, 16, 'đọc được tồn');
    bang(dm.theoMa['1548'].tenVietTat, 'dt5', 'tra theo mã hàng');
    bang(JSON.stringify(dm).indexOf('189000'), -1, 'KHÔNG đọc cột giá vốn');
    // không có cột tồn → ton = null, tool vẫn chạy nhưng chọn lô lấy mã đầu
    var bangKhongTon = TestData.danhMucBang().map(function (r) { var x = r.slice(); x[7] = null; return x; });
    var dm2 = DanhMuc.doc(bangKhongTon);
    bang(dm2.soCoTon, 0, 'không có giá trị tồn');
    bang(MapListing.chonLo(['DD 250', 'DD250'], dm2).item.tenVietTat, 'DD 250', 'không đọc được tồn → lấy mã đầu tiên');
  }

  function T27_maDonToanSoVaNgayGhi() {
    var bc = boiCanh();
    chay(bc, [file(bc, [TestData.don({ maDon: '00012345678901' })])], T1, { ngayGhi: '2026-09-07' });
    var k = bc.kho, T = 'Shopee mall';
    bang(k.o(T, 7, 3).gt, '00012345678901', 'giữ số 0 đầu');
    bang(k.o(T, 7, 3).dinhDang, '@', 'định dạng chữ');
    var a = k.o(T, 7, 1);
    phai(Utils.laNgay(a.gt) && a.gt.getDate() === 7 && a.gt.getMonth() === 8, 'cột A = ngày chạy tool');
    bang(a.dinhDang, 'd/m/yyyy', 'định dạng ngày');
    bang(k.o(T, 7, 2).gt, null, 'cột B "Nguồn đơn" để trống (nhân viên cũng để trống 747/747 dòng)');
  }

  function T28_doiTenCotTrongCauHinh() {
    var bc = boiCanh({ cauHinh: { cot: { maDonSan: ['Order ID (Shopee đổi tên)'] } } });
    var kq = chay(bc, [file(bc, [TestData.don()])]);
    bang(kq.soFileLoi, 0, 'đổi tên cột trong cấu hình là chạy được, không sửa mã');
    bang(bc.kho.o('Shopee mall', 7, 3).gt, 'TEST0904DDDD04', 'đọc mã đơn từ cột đã đổi tên');
  }

  function T29_haiGianHangKhacSheet() {
    var bc = boiCanh();
    var d = TestData.don({ maDon: 'TRUNG12345678' });
    var kq = chay(bc, [file(bc, [d], 'mall.xlsx'), file(bc, [d], 'offood.xlsx', { gian: 'SP_OFFOOD' })]);
    bang(kq.donGhi, 2, 'cùng mã đơn ở hai gian → ghi vào hai sheet khác nhau');
    bang(bc.kho.o('Shopee mall', 7, 3).gt, 'TRUNG12345678', 'sheet Shopee mall');
    bang(bc.kho.o('Offood', 4, 3).gt, 'TRUNG12345678', 'sheet Offood ghi từ dòng 4 (sheet rỗng)');
  }

  function T30_file900Dong() {
    var bc = boiCanh({ congThucToi: 1000, dongTongToi: 1200 });
    var dons = [];
    for (var i = 0; i < 300; i++) {
      dons.push(TestData.don({
        maDon: 'BIG' + ('00000000000' + i).slice(-11),
        dongs: [
          { ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', sl: 1, gia: 305000 },
          { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Thùng 24 Hộp', sl: 1, gia: 985000 },
          { ten: 'Sữa Hạt Nature Kids', phanLoai: 'Lốc 6 Hộp', sl: 1, gia: 250000 }
        ]
      }));
    }
    var t0 = Date.now();
    var kq = chay(bc, [file(bc, dons)]);
    var ms = Date.now() - t0;
    bang(kq.dongGhi, 900, '900 dòng');
    bang(kq.donGopO, 300, '300 đơn được gộp ô');
    phai(ms < 6 * 60 * 1000, 'phải dưới 6 phút (giới hạn một lần chạy Apps Script)');
    var kq2 = chay(bc, [file(bc, dons, 'lai.xlsx')], T2);
    bang(kq2.donGhi, 0, 'nạp lại không thêm dòng');
    return { ghiChu: 'xử lý 900 dòng trong bộ nhớ: ' + ms + ' ms' };
  }

  function T31_fileHongKhongLamHongFileKhac() {
    var bc = boiCanh();
    var files = [
      { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'rong.xlsx', bang: [] },
      { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'sai-sheet.xlsx', bang: function () { throw new Error('Không tìm thấy sheet "orders" trong file'); } },
      file(bc, [TestData.don({ maDon: 'TOT0000000001' })], 'tot.xlsx')
    ];
    var kq;
    try { kq = chay(bc, files); } catch (e) { throw new Error('không được ném lỗi ra ngoài: ' + e.message); }
    bang(kq.soFileLoi, 2, 'hai file hỏng');
    bang(kq.donGhi, 1, 'file tốt vẫn được xử lý');
    bang(kq.nguon.loi.length, 2, 'file hỏng chuyển sang LOI');
    bang(kq.nguon.daXuLy.length, 1, 'file tốt chuyển sang đã xử lý');
    phai(nhatKy(kq).indexOf('orders') >= 0, 'nhật ký nêu lỗi sheet');
  }

  // ------------------------------------------------------------------ lần chạy có đáng gọi là thành công không

  /** Bảng Mapping của fixture nhưng xóa sạch cột `Xác nhận`: đúng tình huống file mẫu chưa ai tick (D-06). */
  function mappingChuaAiTick() {
    var b = TestData.mappingBang();
    var iXN = SCHEMA.MAPPING.indexOf('Xác nhận');
    for (var i = 1; i < b.length; i++) b[i][iXN] = '';
    return b;
  }

  /**
   * D-06 (KE_HOACH_KIEM_THU bảng D): Mapping chưa dòng nào ghi CÓ.
   * Luật là VẪN GHI ĐỦ ĐƠN, tô vàng, D trống, Note nêu lý do. Cấm là ĐOÁN mã hàng, không phải cấm ghi.
   * Cái phải sửa là cách BÁO: câu dẫn đầu phải nói thẳng kết quả chưa dùng được, đứng ở đầu danh sách
   * cảnh báo chứ không lẫn giữa hàng trăm dòng "chưa nhận ra".
   */
  function T32_mappingChuaAiTickVanGhiNhungNoiThang() {
    var bc = boiCanh({ mapping: mappingChuaAiTick() });
    var kq = chay(bc, [file(bc, [
      TestData.don({ maDon: 'D06000000001' }),
      TestData.don({ maDon: 'D06000000002', dongs: [{ ten: 'Sữa A2 Plus thùng 18', sl: 1, gia: 400000 }] }),
      TestData.don({ maDon: 'D06000000003', dongs: [{ ten: 'Sữa Hạt Nature Kids', phanLoai: 'Thùng 24 Hộp', sl: 2, gia: 985000 }] })
    ])]);
    // (a) vẫn ghi đủ đơn
    bang(kq.donGhi, 3, 'Mapping chưa ai tick thì vẫn ghi đủ 3 đơn (D-06), không chặn');
    bang(kq.dongGhi, 3, '3 dòng');
    bang(kq.mapTomTat.dungDuoc, 0, '0 dòng Mapping dùng được');
    // (b) mọi dòng đều vàng, cột D để trống, Note nêu lý do
    bang(kq.dongVang, 3, 'toàn bộ dòng vừa ghi đều vàng');
    var k = bc.kho, T = 'Shopee mall';
    [7, 8, 9].forEach(function (r) {
      bang(k.o(T, r, 4).gt, null, 'dòng ' + r + ': cột D để trống, không đoán mã hàng');
      phai(k.dongVang(T, r), 'dòng ' + r + ' phải tô vàng');
      phai(String(k.o(T, r, 16).gt || '') !== '', 'dòng ' + r + ': Note phải nêu lý do');
    });
    // (c) câu dẫn đầu nói thẳng, kèm con số, kèm việc phải làm
    var dau = String(kq.canhBao[0]);
    phai(dau.indexOf('CHƯA DÙNG ĐƯỢC') >= 0, 'cảnh báo ĐẦU TIÊN phải nói kết quả chưa dùng được: ' + dau);
    phai(dau.indexOf('0/' + kq.mapTomTat.tong) >= 0, 'nêu 0/N dòng Mapping đã ghi CÓ: ' + dau);
    phai(dau.indexOf(kq.dongVang + '/' + kq.dongGhi) >= 0, 'nêu số dòng vàng trên tổng dòng ghi: ' + dau);
    phai(dau.indexOf('Xác nhận') >= 0 && dau.indexOf('Tên viết tắt') >= 0, 'nói rõ việc phải làm: ' + dau);
    // (d) log ghi rõ đúng chữ D-06 yêu cầu
    phai(nhatKy(kq).indexOf('0 dòng mapping được xác nhận') >= 0, 'log phải ghi rõ "0 dòng mapping được xác nhận, nhân viên cần tick"');
  }

  /**
   * Tỷ lệ dòng vàng trên 50% cũng là kết quả chưa dùng được, phải nói đúng tỷ lệ.
   * Dưới ngưỡng thì KHÔNG kêu, nhưng số liệu Mapping vẫn phải hiện ra mọi lần chạy.
   */
  function T33_nguongDongVangVaSoLieuMappingLuonHien() {
    var TOM_TAT = 'Mapping sản phẩm: dùng được ';
    // 3/4 dòng vàng = 75% → phải kêu
    var bc = boiCanh();
    var kq = chay(bc, [file(bc, [
      TestData.don({ maDon: 'NG0000000001' }),
      TestData.don({ maDon: 'NG0000000002', dongs: [{ ten: 'Listing chưa tick', sl: 1, gia: 100000 }] }),
      TestData.don({ maDon: 'NG0000000003', dongs: [{ ten: 'Listing để trống', sl: 1, gia: 100000 }] }),
      TestData.don({ maDon: 'NG0000000004', dongs: [{ ten: 'Listing tên viết tắt lạ', sl: 1, gia: 100000 }] })
    ])]);
    bang(kq.dongGhi, 4, '4 dòng ghi');
    bang(kq.dongVang, 3, '3 dòng vàng');
    var dau = String(kq.canhBao[0]);
    phai(dau.indexOf('CHƯA DÙNG ĐƯỢC') >= 0, 'trên 50% dòng vàng phải kêu ngay câu đầu: ' + dau);
    phai(dau.indexOf('3/4') >= 0 && dau.indexOf('75%') >= 0, 'nêu đúng tỷ lệ 3/4 (75%): ' + dau);
    phai(String(kq.canhBao[1]).indexOf(TOM_TAT) === 0, 'ngay sau đó là dòng số liệu Mapping: ' + kq.canhBao[1]);

    // 1/4 dòng vàng = 25% → không kêu, nhưng số liệu Mapping vẫn phải có
    var bc2 = boiCanh();
    var kq2 = chay(bc2, [file(bc2, [
      TestData.don({ maDon: 'NG0000000011' }),
      TestData.don({ maDon: 'NG0000000012', dongs: [{ ten: 'Sữa A2 Plus thùng 18', sl: 1, gia: 400000 }] }),
      TestData.don({ maDon: 'NG0000000013', dongs: [{ ten: 'Sữa hạt lốc 6 quy về hộp', sl: 1, gia: 250000 }] }),
      TestData.don({ maDon: 'NG0000000014', dongs: [{ ten: 'Listing để trống', sl: 1, gia: 100000 }] })
    ])]);
    bang(kq2.dongGhi, 4, '4 dòng ghi');
    bang(kq2.dongVang, 1, '1 dòng vàng');
    phai(String(kq2.canhBao[0]).indexOf('CHƯA DÙNG ĐƯỢC') < 0, 'dưới ngưỡng thì không được kêu "chưa dùng được": ' + kq2.canhBao[0]);
    var tomTat = kq2.canhBao.filter(function (c) { return String(c).indexOf(TOM_TAT) === 0; });
    bang(tomTat.length, 1, 'số liệu Mapping phải hiện ra kể cả khi không có tên mới');
    var mt = kq2.mapTomTat;
    bang(tomTat[0], TOM_TAT + mt.dungDuoc + '/' + mt.tong + ' dòng (chưa ghi CÓ: ' + mt.chuaXacNhan +
      ', chưa điền Tên viết tắt: ' + mt.chuaDien + ', sai Cấu phần: ' + mt.loi + ')', 'đúng khuôn số liệu Mapping');
    phai(nhatKy(kq2).indexOf(TOM_TAT) >= 0, 'nhật ký cũng phải có dòng số liệu Mapping');
  }

  var DANH_SACH = [
    ['T-01', 'Chống trùng: chạy 3 lần ra một kết quả', T01_chongTrungChay3Lan],
    ['T-02', 'Tự nhận loại file: tab "Tất cả" bỏ đơn hủy/hoàn, tab "Chờ lấy hàng" xử lý hết', T02_tuNhanLoaiFile],
    ['T-03', 'Thiếu cột bắt buộc → hỏng ồn ào, không ghi gì, không lộ dữ liệu cá nhân', T03_thieuCotBatBuoc],
    ['T-04', 'Không lọt dữ liệu cá nhân người mua ra bất kỳ đâu', T04_khongLotDuLieuCaNhan],
    ['T-05', 'Tiêu đề Unicode tách dấu thanh vẫn tra được cột', T05_tieuDeTachDauThanh],
    ['T-06', 'Trạng thái so theo tiền tố; cột trả hàng/hoàn tiền ghi đè; lạ → KHAC', T06_trangThaiTienTo],
    ['T-07', 'Tiền cấp đơn: H tổng các dòng, I/J lấy một lần; thuế đúng ở CẢ HAI cách làm tròn (lệch 1đ)', T07_tienCapDon],
    ['T-08', 'Thuế ba mốc 2.100 / 7.054 / 14.037 và cách tính sai để so', T08_thueBaMoc],
    ['T-09', 'GỘP Ô C, H, I, J, K, L cho đơn nhiều sản phẩm; D và G riêng từng dòng', T09_gopO],
    ['T-10', 'Không sửa một ô nào của dòng đã có', T10_khongSuaDongCu],
    ['T-11', 'Bung Cấu phần hàng mix: mỗi mã một dòng, mua 2 thì nhân đôi', T11_bungCauPhanMix],
    ['T-12', 'Bung Cấu phần hàng TẶNG KÈM (mua thùng tặng lốc)', T12_cauPhanTangKem],
    ['T-13', 'Cấu phần sai cú pháp: vẫn ghi đơn, D trống, tô vàng, Note nêu lý do', T13_cauPhanSaiCuPhap],
    ['T-14', 'Nhiều lô "mã/mã": chọn lô còn tồn > 0 và nhỏ nhất', T14_nhieuLoChonTheoTon],
    ['T-15', 'Mọi lô tồn 0 → mã đầu tiên + tô vàng + "tồn 0 — kiểm tra lô"', T15_moiLoDeuHetTon],
    ['T-16', 'Chỉ dùng dòng Mapping đã ghi CÓ; chưa tick / tên lạ / để trống đều là chưa nhận ra', T16_chiDungDongDaXacNhan],
    ['T-17', 'Tên hàng mới: append dòng vàng cuối Mapping, vẫn ghi đơn, không thêm trùng', T17_appendTenMoiVaoMapping],
    ['T-18', 'Không đụng ô người đã điền trong Mapping; cột Mã hàng do tool tra', T18_khongDungONguoiDaDien],
    ['T-19', 'Đọc Mapping layout fixture 13 cột (tiêu đề xuống dòng, cột lô phụ)', T19_docMappingLayoutFixture],
    ['T-20', 'Chế độ EXCEL: kéo dài E, F, L, M, N', T20_cheDoExcelKeoNamCot],
    ['T-21', 'Chế độ SHEET: chỉ kéo cột L, tuyệt đối không chạm E, F, M, N (ARRAYFORMULA)', T21_cheDoSheetChiKeoCotL],
    ['T-22', 'Ô L số gõ tay mồ côi ở dòng ghi đơn mới → trả lại công thức + nhật ký; dòng cũ giữ nguyên', T22_oLSoTayMoCoi],
    ['T-23', 'Dịch công thức khi kéo dài', T23_dichCongThuc],
    ['T-24', 'Cảnh báo khi ghi vượt vùng dòng tổng và vùng SUMIF của Tổng xuất', T24_canhBaoVungCongThuc],
    ['T-25', 'Cột Note tự dò (sau Còn Nợ) và đặt được bằng cấu hình', T25_cotNoteTuDo],
    ['T-26', 'Danh mục kho: đọc tồn, không đọc giá vốn; thiếu tồn thì lấy mã đầu', T26_danhMucVaTon],
    ['T-27', 'Mã đơn toàn số giữ số 0 đầu; cột A ngày chạy; cột B để trống', T27_maDonToanSoVaNgayGhi],
    ['T-28', 'Shopee đổi tên cột → sửa cấu hình là chạy, không sửa mã', T28_doiTenCotTrongCauHinh],
    ['T-29', 'Hai gian hàng trùng mã đơn → ghi vào hai sheet khác nhau', T29_haiGianHangKhacSheet],
    ['T-30', 'Nạp file 900 dòng: đúng số, gộp 300 đơn, dưới 6 phút', T30_file900Dong],
    ['T-31', 'File hỏng không làm hỏng file khác; file lỗi sang LOI', T31_fileHongKhongLamHongFileKhac],
    ['T-32', 'D-06: Mapping chưa ai ghi CÓ → vẫn ghi đủ đơn, toàn dòng vàng, nhưng cảnh báo ĐẦU TIÊN nói thẳng kết quả chưa dùng được', T32_mappingChuaAiTickVanGhiNhungNoiThang],
    ['T-33', 'Dòng vàng trên 50% cũng kêu đúng tỷ lệ; số liệu Mapping hiện ra mọi lần chạy', T33_nguongDongVangVaSoLieuMappingLuonHien]
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

  return { chayTatCa: chayTatCa, DANH_SACH: DANH_SACH };
})();
