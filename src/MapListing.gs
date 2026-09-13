/**
 * MapListing.gs — LỚP 2. Sheet `Mapping sản phẩm` (GV-v2.2 mục 1.3, Context chương 6).
 * Đây là sheet DUY NHẤT tool được thêm vào file của chủ dự án.
 *
 * Luật:
 *  1. Khóa chống trùng = (Gian hàng, Tên trên Shopee, Phân loại) sau chuẩn hóa NFC + cắt/gộp khoảng trắng + không phân
 *     biệt hoa thường. Đã có khóa thì KHÔNG ghi lại, kể cả khi người đã sửa nội dung.
 *  2. Tool CHỈ DÙNG dòng có `Xác nhận` = CÓ và tên viết tắt tồn tại trong danh mục kho. Chưa xác nhận → coi như chưa nhận ra.
 *  3. `Cấu phần` (mix / combo / tặng kèm) cú pháp `mã x SL; mã x SL`; khách mua n thì nhân n. Sai cú pháp → chưa nhận ra,
 *     KHÔNG đoán. Điền cấu phần rồi thì bỏ qua Hệ số.
 *  4. Hàng nhiều lô: `DD 250/DD250` ngay trong ô Tên viết tắt (và dùng được y hệt bên trong Cấu phần). Chọn mã còn
 *     tồn > 0 và NHỎ NHẤT; mọi mã đều 0 → mã đầu tiên + ghi chú `tồn 0 — kiểm tra lô`. Không tách một dòng bán thành hai lô.
 *     Fixture nghiệm thu để danh sách lô ở cột riêng `Mã dùng lần lượt khi hết lô` (ngăn bằng `;`) — đọc được cả hai kiểu.
 *  5. Gặp tên mới → append MỘT dòng cuối bảng (3 cột đầu + Ngày thêm + gợi ý), tô vàng, để trống phần người điền.
 *     Chỉ append: không sắp xếp, không chèn giữa, không xóa, không đụng ô người đã gõ.
 *  6. Ghép được nhưng mã có GIÁ VỐN 0 → vẫn ghi đơn, tô vàng cả dòng, ghi lý do vào Note (GV-v2.6 mục 0).
 *     Hàng bán và hàng tặng cùng loại để RIÊNG hai mã; mã giá vốn 0 gần như luôn là mã tặng, nên một dòng bán
 *     trừ vào đó là lãi bị thổi phồng. Không đọc được giá vốn thì IM LẶNG — xem `canhBaoGiaVon0`.
 *
 * Không biết dữ liệu đến từ sàn nào — chỉ làm việc với dòng đơn đã chuẩn hóa (lớp 1) và danh mục kho.
 */
var MapListing = (function () {

  var COT = SCHEMA.MAPPING;
  var GIAN_MOI = '*';
  var RE_TOKEN = /[^\p{L}\p{N}]+/u;

  /** Mã lý do → chữ ghi vào cột Note của sheet gian hàng (GV-v2.2 mục 1.4, 1.5.5). */
  var LY_DO = {
    TEN_MOI: 'tên hàng mới — đã thêm dòng vàng vào Mapping sản phẩm, mời điền',
    CHUA_XAC_NHAN: 'dòng Mapping chưa ghi CÓ ở cột Xác nhận',
    CHUA_DIEN: 'chưa điền Tên viết tắt trong Mapping sản phẩm',
    TVT_LA: 'tên viết tắt không có trong danh mục kho',
    CAU_PHAN_SAI: 'cấu phần sai cú pháp',
    TON_0: 'tồn 0 — kiểm tra lô',
    /**
     * Nửa sau của câu cảnh báo giá vốn 0; nửa đầu là danh sách mã, do `canhBaoGiaVon0` ghép vào.
     * Viết cho user đọc là hiểu ngay, phải nói đủ ba điều: mã nào · giá vốn 0 · vì sao đáng ngờ.
     */
    GIA_VON_0: 'đang để giá vốn 0 trong kho. Mã giá vốn 0 thường là mã hàng tặng, ' +
      'bán mà trừ tồn vào đó thì lãi tính ra cao hơn thật. ' +
      'Kiểm lại xem có phải lẽ ra trừ vào mã hàng bán không'
  };

  // ---------------------------------------------------------------- chuẩn hóa & khóa

  /**
   * Cột `Gian hàng` của sheet Mapping ghi TÊN người đọc được ("Shopee mall"), còn dòng đơn mang MÃ gian hàng
   * ("SP_MALL") theo thư mục thả file → phải quy về một chuẩn (mã) trước khi so khóa.
   * Nhận cả mã, tên hiển thị và tên sheet; không tra được thì giữ nguyên chữ hoa để vẫn so được với chính nó.
   */
  function maGian(cfg, g) {
    var t = Utils.chuanHoaChuoi(g);
    if (!t) return GIAN_MOI;
    if (cfg && cfg.gianHang) {
      var ds = Object.keys(cfg.gianHang);
      for (var i = 0; i < ds.length; i++) {
        var gh = cfg.gianHang[ds[i]];
        if (Utils.chuanHoaChuoi(ds[i]) === t || Utils.chuanHoaChuoi(gh.ten) === t || Utils.chuanHoaChuoi(gh.sheet) === t) return ds[i];
      }
    }
    return Utils.nfc(g).trim().toUpperCase();
  }

  /** Khóa (Gian hàng, Tên trên Shopee, Phân loại); không phân loại → '0'. */
  function khoa(cfg, gian, ten, pl) {
    var p = Utils.chuanHoaChuoi(pl);
    return maGian(cfg, gian) + '|' + Utils.chuanHoaChuoi(ten) + '|' + (p === '' ? '0' : p);
  }

  /** Tiêu đề thật trong file → tên cột chuẩn (theo SCHEMA.MAPPING_BI_DANH); không nhận ra thì giữ nguyên. */
  function tenCotChuan(tieuDe) {
    var t = Utils.nfc(tieuDe).replace(/\s+/g, ' ').trim();
    var k = t.toLowerCase();
    for (var i = 0; i < COT.length; i++) if (COT[i].toLowerCase() === k) return COT[i];
    var bd = SCHEMA.MAPPING_BI_DANH;
    for (var chuan in bd) {
      if (!Object.prototype.hasOwnProperty.call(bd, chuan)) continue;
      if (bd[chuan].indexOf(k) >= 0) return chuan;
      if (k.indexOf(chuan.toLowerCase()) === 0) return chuan;      // "Cấu phần (hàng mix…)" → "Cấu phần"
    }
    return t;
  }

  // ---------------------------------------------------------------- hàng nhiều lô

  /** 'DD 250/DD250' → ['DD 250','DD250']; 'a; b' (cột lô phụ của fixture) → ['a','b']. */
  function tachLo(s) {
    return Utils.nfc(s).split(/[\/;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  /**
   * Chọn một mã trong danh sách lô: còn tồn > 0 và tồn NHỎ NHẤT (dùng hết lô ít trước — Context 6.4).
   * Mọi mã đều 0 (hoặc không đọc được tồn) → mã đầu tiên + cờ tonHet.
   * @returns {{item, tonHet: boolean, khongDocDuocTon: boolean, cacLo: string[]}} | null nếu không mã nào có trong danh mục
   */
  function chonLo(tenLo, dm) {
    var ung = [];
    for (var i = 0; i < tenLo.length; i++) {
      var it = dm.theoTvt[Utils.chuanHoaChuoi(tenLo[i])];
      if (it) ung.push(it);
    }
    if (!ung.length) return null;
    var coTon = ung.filter(function (x) { return typeof x.ton === 'number'; });
    var duong = coTon.filter(function (x) { return x.ton > 0; });
    if (duong.length) {
      duong.sort(function (a, b) { return a.ton - b.ton; });
      return { item: duong[0], tonHet: false, khongDocDuocTon: false, cacLo: ung };
    }
    return { item: ung[0], tonHet: coTon.length > 0, khongDocDuocTon: coTon.length === 0 && ung.length > 1, cacLo: ung };
  }

  // ---------------------------------------------------------------- cấu phần

  /**
   * "Vani Hộp x 12; HỘP YG x 12" → [{ item, soLuong }]. Dấu `;` (hoặc xuống dòng) giữa các mã, `x` giữa mã và số.
   * Mỗi mã dùng được cú pháp nhiều lô `or 1/or 20`. Mọi mã phải có trong danh mục, số > 0. Sai → { loi } — không đoán.
   */
  function phanTichCauPhan(text, dm) {
    var s = Utils.nfc(text).trim();
    if (!s) return { loi: 'để trống' };
    var phan = s.split(/[;\n]+/).map(function (p) { return p.trim(); }).filter(Boolean);
    var out = [], loi = [], canhBao = [];
    phan.forEach(function (p) {
      var m = /^(.*?)\s*[xX×*]\s*(\d+(?:[.,]\d+)?)\s*$/.exec(p);
      if (!m || !m[1].trim()) { loi.push('"' + p + '" không theo mẫu "tên viết tắt x số"'); return; }
      var n = Number(m[2].replace(',', '.'));
      if (!(n > 0)) { loi.push('"' + p + '": số lượng phải lớn hơn 0'); return; }
      var lo = tachLo(m[1]);
      var chon = chonLo(lo, dm);
      if (!chon) { loi.push("'" + m[1].trim() + "' không có trong danh mục kho"); return; }
      if (chon.tonHet) canhBao.push("'" + chon.item.tenVietTat + "' " + LY_DO.TON_0);
      out.push({ item: chon.item, soLuong: n, tonHet: chon.tonHet });
    });
    if (loi.length) return { loi: loi.join('; ') };
    if (!out.length) return { loi: 'không có cấu phần nào' };
    return { cauPhan: out, canhBao: canhBao };
  }

  // ---------------------------------------------------------------- giá vốn 0

  /**
   * Câu cảnh báo cho dòng BÁN ghép được nhưng trừ tồn vào mã có GIÁ VỐN 0 (GV-v2.6 mục 0).
   * Vẫn ghi đơn — chỉ tô vàng cả dòng + ghi lý do vào Note, đúng cơ chế `ghiChu` đang có.
   *
   * Triệu chứng thật đang chống: mã giá vốn 0 hầu hết là mã hàng tặng (đo trên file tháng 8: đúng 3/76 mã,
   * cả ba đều là mã khuyến mãi). Bán mà trừ vào mã tặng thì giá vốn bằng 0 nên lãi bị thổi phồng.
   * Không có cảnh báo thì lỗi này im lặng: đơn vẫn ghi đủ, số vẫn đẹp, chỉ có lãi là sai.
   *
   * Im lặng khi KHÔNG ĐỌC ĐƯỢC giá vốn (ô trống, ô lỗi, công thức chưa tính — xem `DanhMuc.docGiaVon`).
   * Không biết thì không kêu: tô vàng oan hàng loạt là cách nhanh nhất khiến user bỏ qua mọi cảnh báo.
   */
  function canhBaoGiaVon0(muc) {
    if (!muc) return '';
    var ds = muc.cauPhan ? muc.cauPhan.map(function (cp) { return cp.item; }) : [muc.item];
    var ten = [];
    ds.forEach(function (it) {
      if (it && it.giaVon0) ten.push('mã ' + it.maHang + ' (' + it.tenVietTat + ')');
    });
    if (!ten.length) return '';
    var cau = ten.join(', ') + ' ' + LY_DO.GIA_VON_0;
    return cau.charAt(0).toUpperCase() + cau.slice(1);      // đứng đầu ô Note thì viết hoa cho dễ đọc
  }

  // ---------------------------------------------------------------- đọc sheet

  function dongTrong() { var d = {}; COT.forEach(function (c) { d[c] = ''; }); return d; }

  function laCo(v) {
    var s = Utils.chuanHoaChuoi(v);
    return s === 'có' || s === 'co' || s === 'x' || s === 'true' || s === 'yes' || v === true;
  }

  /**
   * Bảng 2 chiều (dòng 0 = tiêu đề) + danh mục kho → đối tượng map:
   *   { dong: [...], theoKhoa: {khóa → chỉ số}, cotThua: [tên cột lạ giữ nguyên khi ghi lại], canhBao: [], tenMoi: [] }
   * Không ném lỗi vì người gõ sai — chỉ đánh dấu dòng không dùng được kèm mã lý do.
   */
  function docBang(bang, dm, cfg) {
    var map = { dong: [], theoKhoa: {}, cotThua: [], canhBao: [], tenMoi: [], soThem: 0, cfg: cfg };
    if (!bang || bang.length === 0 || Utils.laDongRong(bang[0])) return map;
    var head = bang[0].map(tenCotChuan);
    if (head.indexOf('Tên trên Shopee') < 0) throw new Error('Sheet Mapping thiếu cột "Tên trên Shopee" (đọc được: ' + bang[0].join(' | ') + ')');
    map.cotThua = head.filter(function (h) { return COT.indexOf(h) < 0; });
    for (var i = 1; i < bang.length; i++) {
      if (Utils.laDongRong(bang[i])) continue;
      var o = Utils.mangSangDoiTuong(head, bang[i]);
      var d = dongTrong();
      COT.forEach(function (c) { if (c in o) d[c] = o[c]; });
      map.cotThua.forEach(function (c) { d[c] = o[c]; });
      if (Utils.laRong(d['Tên trên Shopee'])) continue;
      d.__dong = i + 1;
      map.dong.push(d);
    }
    danhGia(map, dm, cfg);
    return map;
  }

  /** Đánh giá từng dòng: dùng được (__muc) hay không (__lyDo); ghi cột tool `Mã hàng`; dựng chỉ mục theo khóa. */
  function danhGia(map, dm, cfg) {
    map.theoKhoa = {};
    dm = dm || { theoTvt: {}, theoMa: {} };
    map.dong.forEach(function (d, idx) {
      var gian = maGian(cfg, d['Gian hàng']);
      d.__gian = gian;
      d.__khoa = khoa(cfg, gian, d['Tên trên Shopee'], d['Phân loại']);
      if (map.theoKhoa[d.__khoa] == null) map.theoKhoa[d.__khoa] = idx;

      var xacNhan = laCo(d['Xác nhận']);
      var tvt = Utils.nfc(d['Tên viết tắt']).trim();
      var cauPhanText = Utils.nfc(d['Cấu phần']).trim();
      var muc = null, lyDo = null, ghiChuThem = '';

      if (!xacNhan) {
        lyDo = (tvt || cauPhanText) ? 'CHUA_XAC_NHAN' : 'CHUA_DIEN';
      } else if (cauPhanText) {                                  // cấu phần ưu tiên hơn hệ số (Context 6.3)
        var cp = phanTichCauPhan(cauPhanText, dm);
        if (cp.loi) {
          lyDo = 'CAU_PHAN_SAI'; d.__chiTiet = cp.loi;
          map.canhBao.push('Mapping dòng ' + d.__dong + ': cấu phần sai cú pháp — ' + cp.loi + ' → coi như chưa nhận ra');
        } else {
          muc = { cauPhan: cp.cauPhan, heSo: 1 };
          if (cp.canhBao.length) ghiChuThem = cp.canhBao.join('; ');
        }
      } else if (!tvt) {
        lyDo = 'CHUA_DIEN';
      } else {
        var lo = tachLo(tvt);
        var chon = chonLo(lo, dm);
        if (!chon) {
          lyDo = 'TVT_LA'; d.__chiTiet = tvt;
          map.canhBao.push('Mapping dòng ' + d.__dong + ": tên viết tắt '" + tvt + "' không có trong danh mục kho → không dùng");
        } else {
          var heSo = Utils.laRong(d['Hệ số']) ? 1 : Number(d['Hệ số']);
          if (isNaN(heSo) || heSo <= 0) { map.canhBao.push('Mapping dòng ' + d.__dong + ': Hệ số "' + d['Hệ số'] + '" không hợp lệ → dùng 1'); heSo = 1; }
          muc = { item: chon.item, heSo: heSo, tonHet: chon.tonHet, cacLo: chon.cacLo };
          if (chon.tonHet) ghiChuThem = LY_DO.TON_0 + ' (' + chon.cacLo.map(function (x) { return x.tenVietTat; }).join(', ') + ')';
        }
      }
      // lô dự phòng ở cột riêng của fixture: gộp vào danh sách lô nếu dòng chỉ có một mã
      var loPhu = d[SCHEMA.MAPPING_COT_LO_PHU];
      if (muc && muc.item && !Utils.laRong(loPhu)) {
        var them = tachLo(loPhu).filter(function (x) { return Utils.chuanHoaChuoi(x) !== Utils.chuanHoaChuoi(muc.item.tenVietTat); });
        if (them.length) {
          var chon2 = chonLo([muc.item.tenVietTat].concat(them), dm);
          if (chon2) { muc.item = chon2.item; muc.tonHet = chon2.tonHet; muc.cacLo = chon2.cacLo; ghiChuThem = chon2.tonHet ? LY_DO.TON_0 : ''; }
        }
      }
      // Giá vốn 0 phải xét SAU CÙNG, khi mã cuối cùng đã chốt (lô phụ ở trên còn đổi được mã).
      var gv0 = canhBaoGiaVon0(muc);
      if (gv0) { muc.giaVon0 = true; ghiChuThem = ghiChuThem ? ghiChuThem + '; ' + gv0 : gv0; }
      d['Mã hàng'] = muc && muc.item ? muc.item.maHang : (muc ? '(cấu phần)' : '');
      d.__muc = muc; d.__lyDo = lyDo; d.__ghiChuThem = ghiChuThem;
    });
  }

  // ---------------------------------------------------------------- tra cứu

  /** Dòng theo (gian, tên, phân loại): đúng gian trước, rồi '*'. Trả về dòng kể cả khi chưa dùng được (để biết lý do). */
  function tra(map, gian, ten, pl) {
    var i = map.theoKhoa[khoa(map.cfg, gian, ten, pl)];
    if (i == null) i = map.theoKhoa[khoa(map.cfg, GIAN_MOI, ten, pl)];
    return i == null ? null : map.dong[i];
  }

  // ---------------------------------------------------------------- gợi ý

  function tokens(s) { return Utils.chuanHoaChuoi(s).split(RE_TOKEN).filter(Boolean); }

  function jaccard(a, b) {
    var sa = {}, sb = {}, giao = 0;
    a.forEach(function (t) { sa[t] = 1; });
    b.forEach(function (t) { sb[t] = 1; });
    Object.keys(sb).forEach(function (t) { if (sa[t]) giao++; });
    var hop = Object.keys(sa).length + Object.keys(sb).length - giao;
    return hop ? giao / hop : 0;
  }

  /** Tối đa 2 tên viết tắt từ các dòng ĐÃ xác nhận gần giống nhất (cùng gian hàng trước). */
  function goiY(map, gian, ten, pl) {
    var g = maGian(map.cfg, gian), tA = tokens(ten), pA = tokens(pl || '');
    var ung = [];
    map.dong.forEach(function (d) {
      if (!d.__muc || !d.__muc.item) return;
      var tvt = d.__muc.item.tenVietTat;
      if (!tvt) return;
      var s1 = jaccard(tA, tokens(d['Tên trên Shopee']));
      var pB = tokens(d['Phân loại']);
      var diem = (pA.length || pB.length) ? 0.6 * s1 + 0.4 * jaccard(pA, pB) : s1;
      if (diem <= 0) return;
      ung.push({ tvt: tvt, diem: diem, cungGian: d.__gian === g ? 1 : 0 });
    });
    ung.sort(function (x, y) { return (y.cungGian - x.cungGian) || (y.diem - x.diem) || (x.tvt < y.tvt ? -1 : x.tvt > y.tvt ? 1 : 0); });
    var kq = [], daCo = {};
    for (var i = 0; i < ung.length && kq.length < 2; i++) {
      var k = Utils.chuanHoaChuoi(ung[i].tvt);
      if (daCo[k]) continue;
      daCo[k] = 1; kq.push(ung[i].tvt);
    }
    return kq;
  }

  // ---------------------------------------------------------------- tự bổ sung tên mới

  /**
   * Tên hàng chưa có khóa → append một dòng cuối bảng (tô vàng, để trống phần người điền).
   * @param {Object[]} dongDon  dòng đơn đã chuẩn hóa của một file: { maGianHang, tenListing, tenPhanLoai }
   * @returns {Object[]} các dòng vừa thêm
   */
  function boSungTenMoi(map, dongDon, tenGianHienThi, ngayChay, tenFile) {
    var them = [], daThem = {};
    (dongDon || []).forEach(function (d) {
      if (Utils.laRong(d.tenListing)) return;
      var gian = maGian(map.cfg, d.maGianHang);
      var k = khoa(map.cfg, gian, d.tenListing, d.tenPhanLoai);
      if (daThem[k] || map.theoKhoa[k] != null) return;
      if (map.theoKhoa[khoa(map.cfg, GIAN_MOI, d.tenListing, d.tenPhanLoai)] != null) return;
      var row = dongTrong();
      map.cotThua.forEach(function (c) { row[c] = ''; });
      row['Gian hàng'] = tenGianHienThi || gian;
      row['Tên trên Shopee'] = Utils.nfc(d.tenListing).trim();
      row['Phân loại'] = d.tenPhanLoai == null ? '' : Utils.nfc(d.tenPhanLoai).trim();
      row['Hệ số'] = 1;
      row['Ngày thêm'] = ngayChay;
      var gy = goiY(map, gian, d.tenListing, d.tenPhanLoai);
      row['Gợi ý 1'] = gy[0] || ''; row['Gợi ý 2'] = gy[1] || '';
      row['Ghi chú'] = 'Tên hàng mới tool gặp ngày ' + (Utils.laNgay(ngayChay) ? Utils.dinhDangNgayGio(ngayChay).slice(0, 10) : '') +
        (tenFile ? ' (file ' + tenFile + ')' : '') + ' — điền Tên viết tắt' + (gy.length ? ' (gợi ý: ' + gy.join(', ') + ')' : '') + ', Hệ số hoặc Cấu phần, rồi ghi CÓ';
      row.__dong = map.dong.length + 2; row.__gian = gian; row.__khoa = k; row.__muc = null; row.__lyDo = 'TEN_MOI'; row.__moi = true;
      map.dong.push(row);
      map.theoKhoa[k] = map.dong.length - 1;
      daThem[k] = true;
      them.push(row);
    });
    map.soThem += them.length;
    map.tenMoi = map.tenMoi.concat(them);
    return them;
  }

  // ---------------------------------------------------------------- ghi lại

  /** Đối tượng map → bảng 2 chiều (dòng 0 = tiêu đề, giữ cột lạ ở cuối); thứ tự dòng giữ nguyên. */
  function sangBang(map) {
    var cot = COT.concat(map && map.cotThua ? map.cotThua : []);
    var out = [cot.slice()];
    (map ? map.dong : []).forEach(function (d) { out.push(cot.map(function (c) { return d[c] == null ? '' : d[c]; })); });
    return out;
  }

  /** Chỉ số (1-based) các dòng cần tô vàng khi ghi lại: dòng chưa dùng được. */
  function dongCanToVang(map) {
    var ds = [];
    (map ? map.dong : []).forEach(function (d, i) { if (!d.__muc) ds.push(i + 2); });
    return ds;
  }

  function tomTat(map) {
    var t = { tong: 0, dungDuoc: 0, cauPhan: 0, chuaXacNhan: 0, chuaDien: 0, loi: 0, tonHet: 0, giaVon0: 0, them: map ? map.soThem : 0 };
    (map ? map.dong : []).forEach(function (d) {
      t.tong++;
      if (d.__muc) {
        t.dungDuoc++;
        if (d.__muc.cauPhan) t.cauPhan++;
        if (d.__muc.tonHet) t.tonHet++;
        if (d.__muc.giaVon0) t.giaVon0++;
      } else if (d.__lyDo === 'CHUA_XAC_NHAN') t.chuaXacNhan++;
      else if (d.__lyDo === 'TVT_LA' || d.__lyDo === 'CAU_PHAN_SAI') t.loi++;
      else t.chuaDien++;
    });
    return t;
  }


  // ==================================================================== D-04: KIỂM CHÉO GIAN HÀNG
  //
  // File xuất Shopee KHÔNG có cột nào cho biết đơn thuộc gian hàng nào (xem `CaiDat.gs` danh sách cột:
  // không có tên shop, không có mã shop, không có tên người bán). Thứ duy nhất nói lên gian hàng là
  // THƯ MỤC người ta thả file vào — và thư mục thì kéo nhầm một cái là xong.
  //
  // Đêm 07/9/2026 chuyện đó xảy ra thật: một file của Tmart bị thả vào thư mục Importmart, 432 đơn chui
  // vào sheet sai. Không có phép kiểm nào chặn, và phải đối chiếu tay mới lần ra.
  //
  // Dấu hiệu gián tiếp duy nhất còn lại: sheet `Mapping_san_pham` đã ghi mỗi tên listing thuộc gian nào.
  // Đa số áp đảo tên hàng trong file thuộc một gian KHÁC thư mục đang thả, mà gian đang thả gần như
  // không khớp gì, thì đó là thả nhầm.
  //
  // HAI ĐIỀU KIỆN, PHẢI ĐỦ CẢ HAI (YC-36):
  //   · ≥ 80% TÊN HÀNG TRONG FILE thuộc về MỘT gian khác
  //   · < 20% TÊN HÀNG TRONG FILE thuộc về gian đang thả
  //
  // MẪU SỐ (YC-40.6) = số tên hàng khác nhau TRONG FILE, TRỪ những tên Mapping đã khai ở NHIỀU gian.
  //
  // Bản 2.5.0 chia cho số tên khớp được chỉ mục, và cái sai đó lộ ra ở một gian MỚI MỞ: Mapping chưa có
  // dòng nào của gian đó, file có 10 tên hàng mà 6 tên trùng hàng gian cũ → 6/6 = 100% "thuộc gian khác",
  // 0% "của mình" → CHẶN OAN. Tệ hơn, nó không tự thoát được: dòng Mapping mới chỉ được nối SAU bước kiểm
  // này, nên bấm lại bao nhiêu lần cũng bị chặn. Tên VẮNG MẶT khỏi Mapping phải nằm trong mẫu số: ca đó
  // thành 6/10 = 60%, không chặn.
  //
  // Nhưng tên khai ở NHIỀU gian (hàng bán chung) thì KHÔNG được nằm trong mẫu số. Đo 13/9 trên ba file
  // Tmart thật: toàn bộ tên không khớp chỉ mục đều là hàng bán chung, 0 tên vắng mặt. Chia cho tổng tên
  // trong file thì hàng bán chung pha loãng tỷ lệ — Tmart tháng 7 tụt từ 19/19 xuống 19/25 = 76% và vụ
  // thả nhầm 07/9 dựng lại trên tháng đó LỌT QUA IM LẶNG. Tên bán chung không cho bằng chứng theo phía nào,
  // nên bỏ ra khỏi cả tử lẫn mẫu.
  // Điều kiện thứ hai là thứ cứu những gian bán hàng chung nhau: hai gian cùng bán 30 mã giống nhau thì
  // điều kiện một có thể đúng, nhưng điều kiện hai sẽ sai, và tool không chặn oan.
  //
  // KHÔNG ĐỦ DỮ LIỆU THÌ CHỈ CẢNH BÁO, VẪN GHI. Gian mới mở, Mapping còn trống, file chỉ vài dòng — chặn
  // trong những ca đó là làm tool trở thành thứ cản đường. Thà bỏ sót còn hơn chặn oan: chặn oan vài lần
  // là người ta tìm cách tắt phép kiểm đi, và thế là mất luôn cả những lần nó đúng.
  var D04_TOI_THIEU = 5;      // dưới ngần này tên hàng khớp được thì không kết luận gì
  var D04_TY_LE_KHAC = 0.8;   // ≥ 80% thuộc một gian khác
  var D04_TY_LE_MINH = 0.2;   // < 20% thuộc gian đang thả

  /**
   * Chỉ mục "tên listing → mã gian hàng" lấy từ bảng Mapping. Dùng MỌI dòng, không cần `Xác nhận` = CÓ:
   * dòng chưa xác nhận vẫn nói đúng listing đó xuất hiện ở gian nào, mà đó là tất cả những gì phép kiểm
   * này cần. Đòi CÓ thì file của một gian vừa mở sẽ không khớp gì và phép kiểm thành vô dụng.
   *
   * Listing từng khai ở NHIỀU gian (hàng bán chung, hoặc Mapping đã bị một lần chạy nhầm làm bẩn) thì
   * BỎ — không kết luận được gì từ nó. Không dòng nào khai gian hàng → trả null, vỏ bỏ qua phép kiểm.
   */
  function chiMucGianTheoListing(bangMapping, cfg) {
    var pl = phanLoaiTenMapping_(bangMapping, cfg);
    return pl ? pl.idx : null;
  }

  /** { idx: tên → gian (tên chỉ khai ở MỘT gian), nhieuGian: tên → true (khai ở ≥ 2 gian) } hoặc null. */
  function phanLoaiTenMapping_(bangMapping, cfg) {
    if (!bangMapping || !bangMapping.length) return null;
    var head = (bangMapping[0] || []).map(function (h) { return tenCotChuan(h); });
    var iTen = head.indexOf('Tên trên Shopee'), iGian = head.indexOf('Gian hàng');
    if (iTen < 0 || iGian < 0) return null;
    var gianCua = {};
    for (var r = 1; r < bangMapping.length; r++) {
      var hang = bangMapping[r] || [];
      var ten = Utils.chuanHoaChuoi(hang[iTen]);
      var g = maGian(cfg, hang[iGian]);
      if (!ten || !g || !cfg.gianHang[g]) continue;
      if (!gianCua[ten]) gianCua[ten] = {};
      gianCua[ten][g] = 1;
    }
    var idx = {}, nhieuGian = {}, co = 0;
    Object.keys(gianCua).forEach(function (t) {
      var g = Object.keys(gianCua[t]);
      if (g.length === 1) { idx[t] = g[0]; co++; } else nhieuGian[t] = true;
    });
    return co ? { idx: idx, nhieuGian: nhieuGian } : null;
  }

  /**
   * Soát từng file xem có bị thả nhầm thư mục gian hàng không.
   *
   * @param {Array} cacFile  [{ maGianHang, tenFile, tenListing: [..] }] — `tenListing` có thể lặp, hàm tự khử
   * @param {Array} bangMapping bảng Mapping 2 chiều (dòng 0 là tiêu đề)
   * @param {Object} cfg
   * @returns {{chan: Array, canhBao: Array}}  `chan` = phải DỪNG; `canhBao` = ghi tiếp nhưng nói cho biết
   */
  function soatThaNhamGian(cacFile, bangMapping, cfg) {
    var ra = { chan: [], canhBao: [] };
    if (cfg && cfg.chung && cfg.chung.canh_bao_gian_hang_la === false) return ra;   // cố ý tắt
    var pl = phanLoaiTenMapping_(bangMapping, cfg);
    if (!pl) return ra;                        // Mapping chưa khai gian nào → không đoán bừa
    var idx = pl.idx;
    (cacFile || []).forEach(function (x) {
      var dem = {}, daXet = {}, khop = 0, tong = 0;
      (x.tenListing || []).forEach(function (t) {
        var k = Utils.chuanHoaChuoi(t);
        if (!k || daXet[k]) return;
        daXet[k] = 1;
        if (pl.nhieuGian[k]) return;           // hàng bán chung: không bằng chứng phía nào → ngoài mẫu số
        tong++;                                // mẫu số: tên thuộc một gian + tên VẮNG MẶT khỏi Mapping
        if (!idx[k]) return;
        khop++;
        dem[idx[k]] = (dem[idx[k]] || 0) + 1;
      });
      var cuaMinh = dem[x.maGianHang] || 0;
      var khac = null;
      Object.keys(dem).forEach(function (g) {
        if (g !== x.maGianHang && (khac === null || dem[g] > dem[khac])) khac = g;
      });
      if (!khac) return;                       // không gian nào khác có mặt → không có gì để nói
      if (tong < D04_TOI_THIEU) {
        // File quá ít tên hàng để kết luận. Có dấu hiệu thì nói một câu rồi GHI TIẾP — không im lặng.
        if (dem[khac] > cuaMinh) {
          ra.canhBao.push('File "' + x.tenFile + '" chỉ có ' + tong + ' tên hàng khác nhau ' +
            '(cần ' + D04_TOI_THIEU + ' để kết luận), trong đó ' + dem[khac] + ' tên thuộc gian ' +
            tenGian_(cfg, khac) + ' chứ không phải ' + tenGian_(cfg, x.maGianHang) +
            '. Tool VẪN GHI — kiểm lại xem file có đúng thư mục không.');
        }
        return;
      }
      var tyLeKhac = dem[khac] / tong;
      var tyLeMinh = cuaMinh / tong;
      if (tyLeKhac >= D04_TY_LE_KHAC && tyLeMinh < D04_TY_LE_MINH) {
        ra.chan.push({
          tenFile: x.tenFile, gianThat: khac, gianThuMuc: x.maGianHang,
          tong: tong, khop: khop, soKhac: dem[khac], soMinh: cuaMinh,
          cau: cauThaNhamGian(cfg, khac, x.maGianHang)
        });
      } else if (tyLeKhac >= D04_TY_LE_KHAC) {
        // Đủ áp đảo nhưng gian đang thả cũng khớp kha khá → hai gian bán chung hàng. Không chặn.
        ra.canhBao.push('File "' + x.tenFile + '": ' + dem[khac] + '/' + tong + ' tên hàng cũng có ở gian ' +
          tenGian_(cfg, khac) + ', nhưng ' + cuaMinh + '/' + tong + ' có ở gian ' +
          tenGian_(cfg, x.maGianHang) + ' nên tool không chặn (hai gian bán chung hàng).');
      }
    });
    return ra;
  }

  function tenGian_(cfg, ma) {
    var g = cfg && cfg.gianHang ? cfg.gianHang[ma] : null;
    return g && g.ten ? g.ten : String(ma);
  }

  /** Nguyên văn câu báo thả nhầm (YC-36). Hai vỏ phải in CÙNG một câu. */
  function cauThaNhamGian(cfg, gianThat, gianThuMuc) {
    return 'FILE NÀY GIỐNG GIAN ' + tenGian_(cfg, gianThat) + ', ĐANG THẢ VÀO ' +
      tenGian_(cfg, gianThuMuc) + ' — tool không ghi. Kéo file sang đúng thư mục rồi bấm lại.';
  }

  return {
    GIAN_MOI: GIAN_MOI,
    D04_TOI_THIEU: D04_TOI_THIEU,
    D04_TY_LE_KHAC: D04_TY_LE_KHAC,
    D04_TY_LE_MINH: D04_TY_LE_MINH,
    chiMucGianTheoListing: chiMucGianTheoListing,
    soatThaNhamGian: soatThaNhamGian,
    cauThaNhamGian: cauThaNhamGian,
    LY_DO: LY_DO,
    maGian: maGian,
    khoa: khoa,
    tenCotChuan: tenCotChuan,
    tachLo: tachLo,
    chonLo: chonLo,
    canhBaoGiaVon0: canhBaoGiaVon0,
    phanTichCauPhan: phanTichCauPhan,
    docBang: docBang,
    tra: tra,
    goiY: goiY,
    boSungTenMoi: boSungTenMoi,
    sangBang: sangBang,
    dongCanToVang: dongCanToVang,
    laCo: laCo,
    tomTat: tomTat
  };
})();

var VAN_TAY_MAPLISTING = '40a20cc6';   // dấu vân tay file này — MÁY sinh bằng `npm run dau-van-tay`, đừng sửa tay
