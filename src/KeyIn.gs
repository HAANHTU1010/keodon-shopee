/**
 * KeyIn.gs — LỚP 3. Lập KẾ HOẠCH ghi đơn vào sheet gian hàng (GV-v2.2 mục 1.2, 1.4, 1.5; Context 7.1).
 * Thuần logic, không đụng bảng tính: nhận "ảnh chụp" sheet, trả về danh sách ô cần ghi, vùng cần gộp,
 * công thức cần kéo, dòng cần tô vàng, ô ghi chú. Vỏ (ExcelJS trên máy / Apps Script trên Google Sheet) thực thi.
 *
 * Mười quy tắc (Context 7.1):
 *  1. Chỉ THÊM dòng dưới dòng dữ liệu cuối. Không chèn giữa, không sắp xếp, không xóa, không sửa dòng đã có.
 *  2. Ghi 9 cột A, B (để trống), C, D, G, H, I, J, K.
 *     - Chế độ EXCEL: kéo dài E, F, L, M, N nếu dòng đích chưa có.
 *     - Chế độ SHEET: mặc định chỉ kéo cột L. Xem `COT_KEO_CHE_DO_SHEET` ngay dưới — câu cũ ở đây
 *       ("E, F, M, N là ARRAYFORMULA một ô duy nhất, không chạm") là TIỀN ĐỀ SAI, đã bị GV-v2.4
 *       Phụ lục A bác bằng số đo trên file thật.
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

  /**
   * CHẾ ĐỘ SHEET KÉO NHỮNG CỘT NÀO — và vì sao mặc định vẫn là "chỉ cột L".
   *
   * Tiền đề cũ đã sai: E, F, M, N KHÔNG phải ARRAYFORMULA một ô. Đo thẳng trên Google 08/9/2026
   * (GV-v2.4 Phụ lục A.1) thấy công thức TỪNG DÒNG bọc `ARRAY_CONSTRAIN(…;1;1)`, kéo tay tới một
   * dòng cố định — `Shopee mall` cột E 414 ô, M/N 399 ô. Nên dòng mới không tự có công thức.
   *
   * NHƯNG đường ghi lên Google KHÔNG đi qua file này. `node/chay-google-sheet.js` gọi thẳng
   * `src/ShellAppsScript.gs`, và chỗ chép công thức xuống cho cả năm cột nằm ở đó
   * (`mauChepCongThucDS_` + `chepCongThucXuong_`). Nhánh SHEET của `KeyIn` chỉ chạy khi ai đó bật
   * `che_do_cong_thuc = 'SHEET'` trong lúc dùng vỏ EXCEL trên máy — một cấu hình không có trong
   * vận hành thật. Đổi mặc định của nhánh ấy không đem lại một dòng công thức nào cho file tiền,
   * mà lại làm đỏ bài T-21 của `src/tests/TestSuite.gs` và bài T-48 (`src/tests/TestSuite.gs`,
   * ba ca (a)(b)(c) đều dựng trên `cauHinh: SHEET`) — hai file đang do người khác giữ.
   *
   * Vì thế: giữ mặc định, và mở một CÔNG TẮC cấu hình để bật khi cần, không phải sửa mã:
   * `keyin.chep_cong_thuc_sheet = true` trong CAU_HINH_VAN_HANH.json → nhánh SHEET kéo đủ 5 cột
   * y như chế độ EXCEL. Đã ghi lựa chọn này trong báo cáo cho BA.
   */
  function cotKeoCheDoSheet(k) {
    return k.chep_cong_thuc_sheet === true ? k.cot_cong_thuc : [k.cot_doanh_thu];
  }

  /**
   * Còn dư dưới ngần này dòng công thức là phải kêu (GV-v2.4 mục 1.3). Ghi đè được bằng
   * `keyin.nguong_sap_het_cong_thuc` trong CAU_HINH_VAN_HANH.json mà không phải sửa mã.
   * KHÁC hẳn `keyin.nguong_sap_het` (=50): cái kia canh vùng SUM ở dòng tổng và vùng SUMIF của
   * `Tổng xuất` — hai thứ đã được sửa thành `$4:$2000` nên gần như không kêu nữa. Cái này canh
   * thứ chưa ai canh: công thức TỪNG DÒNG của bốn cột E, F, M, N và cột L.
   */
  var NGUONG_SAP_HET_CONG_THUC = 200;

  /** Câu việc-phải-làm, nguyên văn theo GV-v2.4 mục 1.3. Vỏ Google chép lại y hệt (ShellAppsScript.gs). */
  var VIEC_KEO_DAI_CONG_THUC = 'kéo dài công thức 4 cột E, F, M, N xuống dòng 2000 trước lần chạy sau';

  /** Đầu câu cảnh báo vùng công thức — cũng là khóa máy đọc được để vỏ gom câu trùng (xem `khoaCanhBaoVungCongThuc`). */
  var RE_KHOA_VUNG_CT = /^Vùng công thức sheet "(.*)" cột ([A-Z]{1,3}): /;

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

  // ------------------------------------------------------------------ VÙNG CÔNG THỨC E, F, M, N, L
  //
  // VÌ SAO PHẢI ĐO THEO CỘT, KHÔNG ĐO THEO VÙNG DÒNG TỔNG. Hai thứ khác nhau và trước nay tool chỉ
  // canh thứ thứ nhất (`gioiHanDongTong`, `gioiHanTongXuat`). Đo trên file tháng 9 thật ngày 08/9/2026
  // (`00_DAU_VAO/THANG-9-2026-KINH-DOANH_DA_SUA_CONG_THUC.xlsx`): mỗi cột dừng ở MỘT dòng khác nhau —
  // `Shopee mall` E tới 417, F tới 418, M và N tới 402; `Offood` E tới 274, F tới 298, M và N tới 254.
  // Lấy giới hạn chung của cả sheet là nói sai về bốn cột trong năm.
  //
  // Đây là CÔNG THỨC TỪNG DÒNG kéo tay, không phải ARRAYFORMULA một ô: nếu là một ô thì số ô công
  // thức phải bằng đúng 1, thực đo là 414 / 415 / 399 ô. Nguyên nhân vùng bị ăn mòn dần: xóa NỘI DUNG
  // các dòng đã ghi thì mất luôn công thức của đúng các dòng đó (cách đúng là xóa hẳn cả dòng để các
  // dòng còn công thức phía dưới dồn lên).
  //
  // CÁCH ĐO CHỊU ĐƯỢC CẢ HAI HÌNH DẠNG — chủ dự án có thể đổi sang ARRAYFORMULA bất cứ lúc nào, và
  // mã này không được khóa cứng vào hình dạng vừa đo được:
  //   · đúng MỘT ô công thức và nằm ngay dòng đầu vùng dữ liệu → coi như phủ hết cột, không cảnh báo;
  //   · ngược lại (nhiều ô, hoặc một ô nằm giữa chừng) → giới hạn là DÒNG CUỐI CÙNG còn công thức.
  // Một ngoại lệ của vế đầu: ô đó bọc `ARRAY_CONSTRAIN(…;1;1)` thì nó chỉ phủ đúng một dòng một cột.
  // Đó là dấu vết Google để lại khi chuyển công thức mảng của Excel sang Sheet (GV-v2.4 Phụ lục A.1):
  // nhìn thì giống ARRAYFORMULA mà thật ra vẫn là công thức từng dòng.

  /**
   * Đo một cột từ danh sách công thức đã đọc sẵn. Tách rời khỏi cách đọc để vỏ Google (đọc bằng
   * `getFormulasR1C1`) và vỏ Excel (đọc từ ảnh chụp) dùng chung đúng một luật.
   * @param {Array}  ds       công thức của cột, phần tử 0 ứng với dòng `dongDau`; ô trống là '' hoặc null
   * @param {number} dongDau  dòng đầu vùng dữ liệu (thường là 4)
   * @returns {{tuDong:number, so:number, dongDau:(number|null), gioiHan:(number|null), phuHet:boolean}}
   *          phuHet = coi như phủ hết cột (ARRAYFORMULA một ô) · gioiHan = dòng cuối còn công thức
   */
  function doVungCongThuc(ds, dongDau) {
    var so = 0, dau = null, cuoi = null, vanBanDau = '';
    for (var i = 0; i < ds.length; i++) {
      var t = ds[i];
      if (t == null || String(t) === '') continue;
      so++;
      if (dau === null) { dau = dongDau + i; vanBanDau = String(t); }
      cuoi = dongDau + i;
    }
    if (!so) return { tuDong: dongDau, so: 0, dongDau: null, gioiHan: null, phuHet: false };
    if (so === 1 && dau === dongDau && !/ARRAY_CONSTRAIN/i.test(vanBanDau))
      return { tuDong: dongDau, so: 1, dongDau: dau, gioiHan: null, phuHet: true };
    return { tuDong: dongDau, so: so, dongDau: dau, gioiHan: cuoi, phuHet: false };
  }

  /** Năm cột công thức của sheet gian hàng (E, F, L, M, N theo cấu hình); luôn có cột Doanh Thu. */
  function cotVungCongThuc(k) {
    var ds = (k.cot_cong_thuc || []).slice();
    if (ds.indexOf(k.cot_doanh_thu) < 0) ds.push(k.cot_doanh_thu);
    return ds.sort(function (a, b) { return a - b; });
  }

  /** Đo cả năm cột trên ảnh chụp sheet gian hàng. */
  function vungCongThuc(ss, k) {
    var n = Math.max(ss.soDong || 0, (ss.congThuc || []).length, (ss.giaTri || []).length);
    return cotVungCongThuc(k).map(function (c) {
      var ds = [];
      for (var r = k.dong_dau; r <= n; r++) ds.push(ct(ss, r, c));
      var d = doVungCongThuc(ds, k.dong_dau);
      d.cot = c;
      return d;
    });
  }

  /**
   * Hai mức cảnh báo (GV-v2.4 mục 1.3 · kế hoạch kiểm thử bài T-48 và D-15):
   *   ĐỎ  — lô ghi lần này SẼ VƯỢT dòng cuối còn công thức: **vẫn ghi, không chặn**, kèm việc phải làm.
   *   VÀNG — còn dư dưới `nguong` dòng: nêu đúng tên sheet, đúng tên cột, đúng số dòng còn dư.
   * TUYỆT ĐỐI KHÔNG tự kéo dài, không tự sửa công thức của chủ shop (D-15 cấm) — chỉ nói ra để người làm.
   *
   * @param {string}   tenSheet
   * @param {Object[]} doDS        kết quả `vungCongThuc` (mỗi phần tử có `.cot`)
   * @param {number[]} cotToolKeo  các cột chính tool tự chép công thức xuống dòng mới. Cột đó không thể
   *                               "vượt vùng" được, nên chỉ cảnh báo khi phía trên KHÔNG còn công thức
   *                               nào để chép — đúng cảnh sheet `Shopee mall` trên Google hiện nay,
   *                               nơi E4, F4, L4 đã bị xóa mất công thức (GV-v2.4 Phụ lục A.3).
   * @param {number}   dongDonCuoi dòng dữ liệu cuối TRƯỚC lô này
   * @param {number}   dongCuoiMoi dòng cuối SAU khi ghi xong lô này
   * @param {number}   [nguong]    ngưỡng "sắp hết"; để trống là 200
   */
  function canhBaoVungCongThuc(tenSheet, doDS, cotToolKeo, dongDonCuoi, dongCuoiMoi, nguong) {
    var ng = Number(nguong);
    if (isNaN(ng) || ng <= 0) ng = NGUONG_SAP_HET_CONG_THUC;
    var keo = cotToolKeo || [];
    var out = [];
    (doDS || []).forEach(function (d) {
      if (d.phuHet) return;                                   // ARRAYFORMULA một ô → phủ hết, không có gì để kêu
      var dau = 'Vùng công thức sheet "' + tenSheet + '" cột ' + Utils.chuCot(d.cot) + ': ';
      if (d.so === 0) {
        out.push(dau + 'KHÔNG CÒN CÔNG THỨC — từ dòng ' + d.tuDong + ' trở xuống không còn ô nào có công thức nên ' +
          (dongCuoiMoi - dongDonCuoi) + ' dòng mới sẽ trống ở cột này. Vẫn ghi, không chặn: ' + VIEC_KEO_DAI_CONG_THUC + '.');
        return;
      }
      if (keo.indexOf(d.cot) >= 0) return;                    // tool tự chép công thức xuống → cột này không vượt vùng được
      if (dongCuoiMoi > d.gioiHan) {
        out.push(dau + 'SẼ VƯỢT — công thức chỉ còn tới dòng ' + d.gioiHan + ', lô này ghi tới dòng ' + dongCuoiMoi +
          ' nên ' + (dongCuoiMoi - Math.max(d.gioiHan, dongDonCuoi)) + ' dòng mới sẽ trống ở cột này. ' +
          'Vẫn ghi, không chặn: ' + VIEC_KEO_DAI_CONG_THUC + '.');
      } else if (d.gioiHan - dongCuoiMoi < ng) {
        out.push(dau + 'SẮP HẾT — công thức còn tới dòng ' + d.gioiHan + ', đơn đã tới dòng ' + dongCuoiMoi +
          ', còn dư ' + (d.gioiHan - dongCuoiMoi) + ' dòng.');
      }
    });
    return out;
  }

  /**
   * 'tên sheet|CỘT' của một câu cảnh báo vùng công thức, hoặc null nếu không phải câu đó.
   * Vỏ Node dùng để gom câu trùng: vùng công thức được đo lại ở MỖI khối ghi, mà một lần chạy có
   * nhiều lô, nên cùng một cột sẽ kêu nhiều lần nếu không gom (`node/chay-google-sheet.js`).
   */
  function khoaCanhBaoVungCongThuc(cau) {
    var m = RE_KHOA_VUNG_CT.exec(String(cau == null ? '' : cau));
    return m ? m[1] + '|' + m[2] : null;
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
      canhBao: [], thongBao: [], vungCongThuc: []
    };
    var canTieuDe = Utils.laRong(o(ss, k.dong_header, cNote));
    var r = dongCuoi + 1;
    var nguonCt = {};
    var soTrung = 0;
    // Cột công thức phải chạm tới. Chế độ EXCEL kéo đủ 5 cột; chế độ SHEET theo công tắc
    // `keyin.chep_cong_thuc_sheet` (xem `cotKeoCheDoSheet`), mặc định chỉ cột L.
    var cotCongThuc = laSheet ? cotKeoCheDoSheet(k) : k.cot_cong_thuc;

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
    if (plan.dongCuoiMoi > dongCuoi) {
      canhBaoGioiHan(plan, ss, ssTX, k);
      // Đo vùng công thức TRƯỚC khi ghi, theo TỪNG CỘT E, F, M, N, L (T-48). Đo trên ảnh chụp nên
      // con số là tình trạng thật của file người ta, chưa dính gì tới việc tool sắp kéo công thức.
      plan.vungCongThuc = vungCongThuc(ss, k);
      canhBaoVungCongThuc(ss.ten, plan.vungCongThuc, cotCongThuc, dongCuoi, plan.dongCuoiMoi, k.nguong_sap_het_cong_thuc)
        .forEach(function (c) { plan.canhBao.push(c); });
    }
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
    NGUONG_SAP_HET_CONG_THUC: NGUONG_SAP_HET_CONG_THUC,
    VIEC_KEO_DAI_CONG_THUC: VIEC_KEO_DAI_CONG_THUC,
    dongDuLieuCuoi: dongDuLieuCuoi,
    maDonDaCo: maDonDaCo,
    cotNote: cotNote,
    gioiHanDongTong: gioiHanDongTong,
    gioiHanTongXuat: gioiHanTongXuat,
    doVungCongThuc: doVungCongThuc,
    cotVungCongThuc: cotVungCongThuc,
    vungCongThuc: vungCongThuc,
    canhBaoVungCongThuc: canhBaoVungCongThuc,
    khoaCanhBaoVungCongThuc: khoaCanhBaoVungCongThuc,
    cotKeoCheDoSheet: cotKeoCheDoSheet,
    lapKeHoach: lapKeHoach
  };
})();
