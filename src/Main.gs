/**
 * Main.gs — luồng chính chayDongBo(). Không phụ thuộc Google, không phụ thuộc Excel: nhận hai đối tượng do vỏ cấp.
 *
 *   nguon (vỏ cấp — thư mục trên máy):
 *     layFileMoi(cfg)      → [{ san, maGianHang, tenFile, docBang(): Array[] }]   (docBang tìm sheet theo TÊN)
 *     danhDauDaXuLy(file) · danhDauLoi(file)
 *
 *   kho (vỏ cấp — bản sao file tracking .xlsx, hoặc Google Sheet qua Web App):
 *     docSheet(ten) → { ten, soDong, giaTri[][], congThuc[][], mang[][] } | null
 *     ghiKeyIn(keHoach)    → thực thi kế hoạch của KeyIn.lapKeHoach (ghi ô, gộp ô, tô vàng, kéo công thức)
 *     docMapping() → Array[] | null    ghiMapping(bang, dongToVang)
 *     canhBao(tieuDe, noiDung)
 *     [tùy chọn] thuKhoa(ms) / moKhoa()
 *
 * Một lần chạy: cấu hình → danh mục kho (`Tổng tồn kho`, có tồn để chọn lô) → sheet `Mapping sản phẩm`
 * → từng file: lớp 1 đọc & nhận loại file → tự bổ sung tên mới vào Mapping → lớp 2 gom đơn, tính tiền
 * → lớp 3 lập kế hoạch ghi (gộp ô, tô vàng, cột Note) → vỏ thực thi → ghi lại Mapping → trả nhật ký.
 *
 * KHÔNG tạo sheet máy nào khác (GV-v2.2 mục 3): nhật ký ra file .txt do vỏ ghi, hàng chờ nằm ngay trên sheet
 * gian hàng (dòng vàng + cột Note) và trong Mapping (dòng vàng).
 */
function chayDongBo(nguon, kho, tuyChon) {
  tuyChon = tuyChon || {};
  var thoiDiem = tuyChon.thoiDiem || new Date();
  var ngayGhi = tuyChon.ngayGhi ? Utils.chiNgay(Utils.parseNgay(tuyChon.ngayGhi)) : Utils.chiNgay(thoiDiem);
  var t0 = Date.now();
  var kq = {
    boQua: false, soFile: 0, soFileLoi: 0, soDongDoc: 0, soDonDoc: 0,
    donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, tenMoi: 0, giaTriTayThay: 0,
    donBoQuaHuyHoan: 0, loaiFile: {}, mapTomTat: null, nhatKy: [], canhBao: [], loi: null
  };

  if (kho.thuKhoa && !kho.thuKhoa(30000)) {
    kq.boQua = true;
    kq.nhatKy.push(dongNhatKy(thoiDiem, {}, { thong_bao: 'Bỏ qua: một tiến trình khác đang chạy' }));
    return kq;
  }

  try {
    var cfg = tuyChon.cfg || Config.tao(tuyChon.ghiDeCauHinh);
    var files = nguon.layFileMoi(cfg) || [];
    if (!files.length) {
      kq.nhatKy.push(dongNhatKy(thoiDiem, {}, { thong_bao: 'Không có file mới trong thư mục thả file' }));
      return kq;
    }

    // ---- danh mục kho + sheet Mapping (đọc một lần cho cả lần chạy) ----
    var ssDM = kho.docSheet(cfg.danhMuc.ten_sheet);
    if (!ssDM) throw new Error("File tracking không có sheet '" + cfg.danhMuc.ten_sheet + "' — kiểm tra đúng file chưa.");
    // Cột Tổng tồn của sheet danh mục là CÔNG THỨC. Quy tắc chọn lô (mục 1.3) cần con số đã tính sẵn,
    // nên ưu tiên ảnh chụp `giaTriTinh`; vỏ nào chưa có thì lùi về `giaTri` như cũ.
    var dm = DanhMuc.doc(ssDM.giaTriTinh || ssDM.giaTri, cfg.danhMuc);
    if (!dm.soDong) throw new Error("Sheet '" + cfg.danhMuc.ten_sheet + "' không đọc được dòng danh mục nào (cột tên viết tắt trống?)");
    if (!dm.soCoTon) kq.canhBao.push("Sheet '" + cfg.danhMuc.ten_sheet + "' không có sẵn giá trị cột Tổng tồn (file đã bị sửa công thức) → quy tắc chọn lô theo tồn tạm lấy mã đầu tiên; mở file bằng Excel rồi lưu lại là hết.");
    var bangMap = kho.docMapping ? kho.docMapping() : null;
    if (!bangMap) throw new Error("Chưa có sheet Mapping sản phẩm. Chép sheet đó từ 00_DAU_VAO/DEMO_Mapping_san_pham.xlsx vào file tracking, hoặc chỉ định file mẫu trong cấu hình.");
    var map = MapListing.docBang(bangMap, dm, cfg);
    map.canhBao.forEach(function (c) { kq.canhBao.push(c); });

    var donTheoGian = {}, fileOk = [], fileLoi = [];

    // ---- lớp 1 + tự bổ sung tên mới + lớp 2, từng file; lỗi một file không làm hỏng file khác ----
    files.forEach(function (f) {
      var tk = { gian_hang: f.maGianHang, ten_file: f.tenFile };
      try {
        var a = AdapterFileXuat.doc(f.docBang(), { san: f.san, maGianHang: f.maGianHang, tenFile: f.tenFile }, cfg);
        var gh = Config.gianHang(cfg, f.maGianHang);
        var them = MapListing.boSungTenMoi(map, a.dong, gh.ten, ngayGhi, f.tenFile);
        var n = Normalize.xuLy(a.dong, map, cfg);
        // gán ngày ghi + tên gian hàng cho từng đơn (lớp 3 cần, lớp 2 không cần biết)
        n.don.forEach(function (d) { d.ngayGhi = ngayGhi; d.tenGianHienThi = gh.ten; });
        if (!donTheoGian[f.maGianHang]) donTheoGian[f.maGianHang] = [];
        n.don.forEach(function (d) { donTheoGian[f.maGianHang].push(d); });

        var soDon = {};
        a.dong.forEach(function (d) { soDon[d.maDonSan] = 1; });
        kq.soDongDoc += a.dong.length;
        kq.soDonDoc += Object.keys(soDon).length;
        kq.tenMoi += them.length;
        kq.donBoQuaHuyHoan += a.soDonBoQua;
        kq.loaiFile[a.loaiFile] = (kq.loaiFile[a.loaiFile] || 0) + 1;
        var cb = a.canhBao.concat(n.canhBao);
        kq.canhBao = kq.canhBao.concat(cb);
        tk.so_don_doc = Object.keys(soDon).length;
        tk.so_dong_doc = a.dong.length;
        tk.so_ten_moi = them.length;
        tk.thong_bao = 'Loại file: ' + (a.loaiFile === 'TAT_CA' ? 'tab "Tất cả"' : 'tab "Chờ lấy hàng"') +
          (them.length ? ' · Mapping +' + them.length + ' tên mới' : '') + (cb.length ? ' · ' + cb.join(' | ') : '');
        fileOk.push(f);
      } catch (e) {
        tk.so_loi = 1;
        tk.thong_bao = 'LỖI FILE: ' + e.message;
        kq.canhBao.push('File ' + f.tenFile + ': ' + e.message);
        fileLoi.push({ file: f, loi: e });
      }
      kq.nhatKy.push(dongNhatKy(thoiDiem, tk, {}));
    });

    // ---- lớp 3: lập kế hoạch và ghi, từng gian hàng ----
    var ssTX = cfg.keyin.ten_sheet_tong_xuat ? kho.docSheet(cfg.keyin.ten_sheet_tong_xuat) : null;
    Object.keys(donTheoGian).forEach(function (g) {
      var gh = Config.gianHang(cfg, g);
      var ss = kho.docSheet(gh.sheet);
      if (!ss) throw new Error('Gian hàng ' + g + ": không có sheet '" + gh.sheet + "' trong file tracking để ghi.");
      var plan = KeyIn.lapKeHoach(ss, ssTX, donTheoGian[g], cfg);
      kho.ghiKeyIn(plan);
      kq.donGhi += plan.thongKe.donGhi; kq.donDaCo += plan.thongKe.donDaCo;
      kq.dongGhi += plan.thongKe.dongGhi; kq.dongVang += plan.thongKe.dongVang;
      kq.donGopO += plan.thongKe.donGopO; kq.giaTriTayThay += plan.thongKe.giaTriTayThay;
      kq.canhBao = kq.canhBao.concat(plan.canhBao);
      kq.nhatKy.push(dongNhatKy(thoiDiem, {
        gian_hang: g, ten_file: gh.sheet + (plan.dongCuoiMoi > plan.dongCuoiCu ? ' dòng ' + (plan.dongCuoiCu + 1) + '→' + plan.dongCuoiMoi : ' (không thêm dòng)'),
        so_don_ghi: plan.thongKe.donGhi, so_don_da_co: plan.thongKe.donDaCo,
        so_dong_ghi: plan.thongKe.dongGhi, so_dong_vang: plan.thongKe.dongVang,
        thong_bao: plan.canhBao.concat(plan.thongBao).join(' | ')
      }, {}));
      plan.giaTriTayThay.forEach(function (x) {
        kq.nhatKy.push(dongNhatKy(thoiDiem, { gian_hang: g, ten_file: gh.sheet,
          thong_bao: gh.sheet + '!' + Utils.chuCot(x.c) + x.r + ': số gõ tay ' + x.giaTri + ' đã được trả lại công thức =' + x.text }, {}));
      });
    });

    // ---- ghi lại sheet Mapping (chỉ khi có dòng mới) và tổng kết ----
    var mt = MapListing.tomTat(map);
    kq.mapTomTat = mt;

    // Số liệu Mapping phải hiện ra MỌI LẦN CHẠY, không chỉ khi có tên mới: đây là con số quyết định
    // lần chạy có dùng được hay không (KE_HOACH_KIEM_THU bảng D, dòng D-06).
    var dongTomTatMap = 'Mapping sản phẩm: dùng được ' + mt.dungDuoc + '/' + mt.tong + ' dòng' +
      ' (chưa ghi CÓ: ' + mt.chuaXacNhan + ', chưa điền Tên viết tắt: ' + mt.chuaDien + ', sai Cấu phần: ' + mt.loi + ')';
    kq.nhatKy.push(dongNhatKy(thoiDiem, { ten_file: 'Mapping sản phẩm', so_ten_moi: map.soThem,
      thong_bao: dongTomTatMap + (mt.dungDuoc === 0 ? '. 0 dòng mapping được xác nhận, nhân viên cần tick.' : '') }, {}));

    // Không chặn, không đoán mã hàng: đơn vẫn ghi đủ, dòng vàng, Note nêu lý do (D-06, HOC_TU_DU_AN_CO_PHIEU mục 6.3).
    // Nhưng phải NÓI THẲNG là kết quả chưa dùng được, và nói ở ĐẦU danh sách cảnh báo, không lẫn giữa
    // hàng trăm dòng "chưa nhận ra". Người vận hành đọc "GHI THÊM N đơn" rồi tưởng chạy xong là hỏng chuyện.
    var canhBaoDau = [];
    var canhBaoNang = canhBaoKetQuaChuaDungDuoc(kq, mt, cfg);
    if (canhBaoNang) canhBaoDau.push(canhBaoNang);
    canhBaoDau.push(dongTomTatMap);
    kq.canhBao = canhBaoDau.concat(kq.canhBao);

    if (map.soThem > 0 && kho.ghiMapping) kho.ghiMapping(MapListing.sangBang(map), MapListing.dongCanToVang(map));
    if (map.soThem > 0) {
      kq.nhatKy.push(dongNhatKy(thoiDiem, { ten_file: 'Mapping sản phẩm', so_ten_moi: map.soThem,
        thong_bao: 'Thêm ' + map.soThem + ' tên hàng mới chờ điền · dùng được ' + mt.dungDuoc + '/' + mt.tong }, {}));
      kho.canhBao('Mapping sản phẩm: thêm ' + map.soThem + ' tên hàng mới chờ điền',
        map.tenMoi.map(function (d) { return '· ' + d['Tên trên Shopee'] + (d['Phân loại'] ? ' / ' + d['Phân loại'] : ''); }).join('\n'));
    }

    // Chuyển file nguồn sang thư mục đã xử lý. Vỏ nào còn một bước lưu file có thể hỏng (tự kiểm tra
    // của vỏ Node) thì truyền tuyChon.hoanThanhSau = true rồi tự gọi kq.danhDauFile() SAU khi lưu xong;
    // lưu hỏng mà file nguồn đã biến khỏi thư mục thả là người vận hành mất dữ liệu.
    kq.danhDauFile = function () {
      fileOk.forEach(function (f) { nguon.danhDauDaXuLy(f); });
      fileLoi.forEach(function (x) { nguon.danhDauLoi(x.file); });
      kq.daDanhDauFile = true;
    };
    if (tuyChon.hoanThanhSau !== true) kq.danhDauFile();
    kq.soFile = files.length;
    kq.soFileLoi = fileLoi.length;
    kq.thoiGianMs = Date.now() - t0;
    if (canhBaoNang) kho.canhBao('KẾT QUẢ CHƯA DÙNG ĐƯỢC', canhBaoNang);
    if (kq.dongVang > 0) kho.canhBao(kq.dongVang + ' dòng vàng cần người xem', 'Mở file kết quả, tìm dòng tô vàng ở sheet gian hàng và đọc cột "' + cfg.keyin.tieu_de_note + '".');
    if (fileLoi.length) kho.canhBao(fileLoi.length + ' file lỗi', fileLoi.map(function (x) { return x.file.tenFile + ': ' + x.loi.message; }).join('\n'));
    return kq;

  } catch (e) {
    kq.loi = e;
    kq.nhatKy.push(dongNhatKy(thoiDiem, { so_loi: 1, thong_bao: 'LỖI: ' + e.message }, {}));
    kho.canhBao('Đồng bộ đơn: LỖI', e.message);
    throw e;                                        // hỏng phải hỏng ồn ào
  } finally {
    if (kho.moKhoa) kho.moKhoa();
  }
}

/** Trên tỷ lệ này thì lần chạy coi như chưa dùng được, phải nói thẳng (không chặn ghi). */
var NGUONG_DONG_VANG = 0.5;

/**
 * Câu cảnh báo dẫn đầu khi lần chạy không đáng gọi là thành công: không dòng Mapping nào dùng được,
 * hoặc phần lớn dòng vừa ghi bị tô vàng. Trả về null khi kết quả bình thường.
 * Không ném lỗi, không chặn ghi: luật đã chốt là vẫn ghi đơn rồi tô vàng (D-06), cấm là ĐOÁN mã hàng.
 */
function canhBaoKetQuaChuaDungDuoc(kq, mt, cfg) {
  if (!kq.dongGhi) return null;
  var viecPhaiLam = ' Việc phải làm: mở sheet "Mapping sản phẩm" trong file kết quả, điền cột "Tên viết tắt"' +
    ' đúng chữ đang dùng ở cột D của sheet gian hàng, rồi gõ CÓ vào cột "Xác nhận". Lưu lại rồi chạy lại tool.';
  if (mt.dungDuoc === 0) {
    return 'KẾT QUẢ CHƯA DÙNG ĐƯỢC: 0/' + mt.tong + ' dòng Mapping đã ghi CÓ nên tool không nhận ra được mặt hàng nào.' +
      ' Toàn bộ ' + kq.dongVang + '/' + kq.dongGhi + ' dòng vừa ghi đều bị tô vàng, cột D để trống.' +
      ' 0 dòng mapping được xác nhận, nhân viên cần tick.' + viecPhaiLam;
  }
  if (kq.dongVang > kq.dongGhi * NGUONG_DONG_VANG) {
    var pt = Math.round(kq.dongVang * 100 / kq.dongGhi);
    return 'KẾT QUẢ CHƯA DÙNG ĐƯỢC: ' + kq.dongVang + '/' + kq.dongGhi + ' dòng vừa ghi bị tô vàng (' + pt + '%),' +
      ' tool chỉ dùng được ' + mt.dungDuoc + '/' + mt.tong + ' dòng Mapping.' +
      ' Đọc cột "' + cfg.keyin.tieu_de_note + '" ở các dòng vàng để biết thiếu gì.' + viecPhaiLam;
  }
  return null;
}

/** Một dòng nhật ký theo LOG_COT (vỏ ghi ra file .txt — không tạo sheet trong file của chủ dự án). */
function dongNhatKy(thoiDiem, tk, mac) {
  var o = { thoi_diem: thoiDiem, gian_hang: '', ten_file: '', so_don_doc: 0, so_don_ghi: 0, so_don_da_co: 0,
    so_dong_ghi: 0, so_dong_vang: 0, so_ten_moi: 0, so_loi: 0, thong_bao: '' };
  Object.keys(tk || {}).forEach(function (k) { o[k] = tk[k]; });
  Object.keys(mac || {}).forEach(function (k) { o[k] = mac[k]; });
  return Utils.doiTuongSangMang(LOG_COT, o);
}
