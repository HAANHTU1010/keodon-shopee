/**
 * Utils.gs — hàm tiện ích dùng chung cho mọi lớp.
 * KHÔNG biết gì về sàn, về file xuất hay về Google Sheet.
 * Viết theo kiểu Apps Script (hàm/đối tượng toàn cục, không import) để chạy được
 * cả trong trình soạn Apps Script lẫn trong vỏ Node (node/nap-loi.js).
 */
var Utils = (function () {

  /**
   * Chuẩn Unicode NFC. File xuất Shopee có 9 tiêu đề ở dạng "tách dấu thanh" (dấu thanh là ký tự
   * tổ hợp rời, ví dụ 'Gia' + U+0301 + ' ưu đa' + U+0303 + 'i'); tra bằng chuỗi gõ tay sẽ trượt.
   */
  function nfc(s) {
    var t = String(s == null ? '' : s);
    return typeof t.normalize === 'function' ? t.normalize('NFC') : t;
  }

  /** BR-03: chuẩn hóa GIÁ TRỊ trước mọi phép so khớp (mã hàng, SKU, tên listing, tên viết tắt). */
  function chuanHoaChuoi(s) {
    return nfc(s).trim().replace(/\s+/g, ' ').toLowerCase();
  }

  /**
   * Chuẩn hóa TÊN CỘT: NFC + cắt khoảng trắng, KHÔNG đổi hoa/thường.
   * Lý do: file xuất có hai cột chỉ khác nhau một chữ hoa/thường (cấp dòng vs cấp đơn) — lowercase là lấy nhầm số.
   */
  function tenCot(s) {
    return nfc(s).trim();
  }

  function laRong(v) {
    return v == null || String(v).trim() === '';
  }

  /** Ô "đúng": boolean true, 1, hoặc chuỗi TRUE/true/x/có/co/yes (ô tick trong bảng tính). */
  function laTrue(v) {
    if (v === true || v === 1) return true;
    if (v == null) return false;
    return /^(true|1|x|có|co|yes|đúng|dung)$/i.test(String(v).trim());
  }

  function laNgay(v) {
    return Object.prototype.toString.call(v) === '[object Date]' && !isNaN(v.getTime());
  }

  /** Làm tròn nửa lên (4,5 → 5), đúng cách nhân viên và sàn đang làm tròn tiền. Tránh 7053.7499999 bằng cách cộng epsilon. */
  function lamTron(x) {
    var d = Math.abs(x);
    var r = Math.floor(d + 0.5 + 1e-9);
    return x < 0 ? -r : r;
  }

  /** Mã đơn đọc từ ô bảng tính về chuỗi: 12345678901234 (số) → '12345678901234'; 1.2e13 dạng float nguyên → chuỗi số. */
  function chuoiMaDon(v) {
    if (v == null) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return nfc(v).trim();
  }

  /**
   * Đọc một ô tiền. Chấp nhận: số; '305000.00'; '305,000'; '1.234.567' (kiểu Việt); '1234,50'; rỗng → null.
   * Không đọc được → ném lỗi (hỏng phải hỏng ồn ào).
   */
  function parseTien(v) {
    if (laRong(v)) return null;
    if (typeof v === 'number') return isNaN(v) ? loiSo(v) : v;
    var s = String(v).trim().replace(/[\s₫đ]/g, '').replace(/^\+/, '');
    if (s === '-' || s === '--' || /^(n\/a|na|none|nan)$/i.test(s)) return 0;   // file "Tất cả" ghi "-" ở ô không có giá trị (giống bản Python: 0)
    var am = false;
    if (/^\(.*\)$/.test(s)) { am = true; s = s.slice(1, -1); }
    if (s.charAt(0) === '-') { am = !am; s = s.slice(1); }
    var n;
    if (/^\d+\.\d{1,2}$/.test(s)) {                        // 305000.00 → dấu chấm là thập phân
      n = parseFloat(s);
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {              // 1.234.567 / 1.234 → dấu chấm là phân cách nghìn
      n = parseFloat(s.replace(/\./g, ''));
    } else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) {  // 1,234,567.00
      n = parseFloat(s.replace(/,/g, ''));
    } else if (/^\d+(,\d{1,2})?$/.test(s)) {                 // 1234,50 → dấu phẩy là thập phân
      n = parseFloat(s.replace(',', '.'));
    } else if (/^\d+\.\d+$/.test(s)) {                       // 1234.5678
      n = parseFloat(s);
    } else {
      return loiSo(v);
    }
    return am ? -n : n;
  }

  function loiSo(v) {
    throw new Error('Không đọc được số từ giá trị "' + v + '"');
  }

  /** Đọc số lượng: số nguyên; rỗng → null. '2.00' → 2. */
  function parseSoLuong(v) {
    var n = parseTien(v);
    if (n == null) return null;
    if (Math.abs(n - Math.round(n)) > 1e-9) throw new Error('Số lượng không hợp lệ "' + v + '"');
    return Math.round(n);
  }

  /**
   * Đọc ngày giờ. Chấp nhận: Date; 'YYYY-MM-DD HH:MM[:SS]'; 'YYYY-MM-DD'; 'DD/MM/YYYY[ HH:MM]'; số serial Excel.
   * Rỗng → null. Sai → ném lỗi.
   */
  function parseNgay(v) {
    if (laRong(v)) return null;
    if (laNgay(v)) return v;
    if (typeof v === 'number') {                              // serial Excel/Sheets (ngày 0 = 30/12/1899)
      var ms = Math.round((v - 25569) * 86400000);
      var d0 = new Date(ms);
      return new Date(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate(), d0.getUTCHours(), d0.getUTCMinutes(), d0.getUTCSeconds());
    }
    var s = String(v).trim();
    if (s === '-' || s === '--' || /^(n\/a|na|none)$/i.test(s)) return null;   // "-" = chưa có (đơn hủy chưa thanh toán, chưa hoàn thành)
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    throw new Error('Không đọc được ngày từ giá trị "' + v + '"');
  }

  function hai(n) { return (n < 10 ? '0' : '') + n; }

  /** Định dạng 'YYYY-MM-DD HH:MM:SS' để ghi log và đặt tên kỳ. */
  function dinhDangNgayGio(d) {
    if (!laNgay(d)) return '';
    return d.getFullYear() + '-' + hai(d.getMonth() + 1) + '-' + hai(d.getDate()) +
      ' ' + hai(d.getHours()) + ':' + hai(d.getMinutes()) + ':' + hai(d.getSeconds());
  }

  /** 'yyyymmdd_HHMM' để đặt tên file kết quả. */
  function nhanThoiDiem(d) {
    return '' + d.getFullYear() + hai(d.getMonth() + 1) + hai(d.getDate()) + '_' + hai(d.getHours()) + hai(d.getMinutes());
  }

  /** Cắt phần giờ, giữ ngày (cột "Ngày" của sheet gian hàng). */
  function chiNgay(d) {
    if (!laNgay(d)) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /** Tìm chỉ số cột theo tên trong dòng tiêu đề (so nguyên văn sau NFC + trim). */
  function lapChiMucCot(dongTieuDe) {
    var chiMuc = {};
    for (var i = 0; i < dongTieuDe.length; i++) {
      var t = tenCot(dongTieuDe[i]);
      if (t && !(t in chiMuc)) chiMuc[t] = i;
    }
    return chiMuc;
  }

  /** Chuyển một dòng mảng thành đối tượng theo dòng tiêu đề. */
  function mangSangDoiTuong(dongTieuDe, dong) {
    var o = {};
    for (var i = 0; i < dongTieuDe.length; i++) {
      var t = tenCot(dongTieuDe[i]);
      if (t) o[t] = (dong && dong[i] != null) ? dong[i] : '';
    }
    return o;
  }

  /** Chuyển đối tượng thành dòng mảng theo thứ tự tiêu đề; thiếu → ''. */
  function doiTuongSangMang(dongTieuDe, o) {
    var m = [];
    for (var i = 0; i < dongTieuDe.length; i++) {
      var v = o[tenCot(dongTieuDe[i])];
      m.push(v == null ? '' : v);
    }
    return m;
  }

  function laDongRong(dong) {
    if (!dong) return true;
    for (var i = 0; i < dong.length; i++) if (!laRong(dong[i])) return false;
    return true;
  }

  /** Sao chép sâu mảng 2 chiều (tránh sửa nhầm dữ liệu của kho). */
  function saoChepBang(bang) {
    var r = [];
    for (var i = 0; i < bang.length; i++) r.push(bang[i].slice());
    return r;
  }

  /** 'A' → 1, 'AB' → 28 */
  function chiSoCot(chu) {
    var s = String(chu).trim().toUpperCase(), n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    if (!(n >= 1)) throw new Error('Cột không hợp lệ "' + chu + '"');
    return n;
  }

  /** 1 → 'A', 28 → 'AB' */
  function chuCot(n) {
    var s = '';
    while (n > 0) { var r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }

  /**
   * Dịch công thức từ dòng tuDong sang dòng denDong: chỉ đổi số dòng của tham chiếu TƯƠNG ĐỐI
   * ($D517 → $D518; $C$3:$G$482 giữ nguyên). Bỏ qua chuỗi trong "..." và tên sheet trong '...'.
   * Dùng khi kéo dài công thức E/F/L/M/N của sheet gian hàng xuống dòng mới.
   */
  function dichCongThuc(text, tuDong, denDong) {
    var delta = denDong - tuDong;
    if (!delta || !text) return text;
    var out = '', i = 0, n = text.length;
    while (i < n) {
      var ch = text.charAt(i);
      if (ch === '"') { var j = text.indexOf('"', i + 1); if (j < 0) j = n - 1; out += text.slice(i, j + 1); i = j + 1; continue; }
      if (ch === "'") { var k = text.indexOf("'", i + 1); if (k < 0) k = n - 1; out += text.slice(i, k + 1); i = k + 1; continue; }
      var m = /^(\$?)([A-Z]{1,3})(\$?)(\d+)/.exec(text.slice(i));
      var truoc = out.charAt(out.length - 1);
      if (m && !/[A-Za-z0-9_.]/.test(truoc)) {
        var sau = text.charAt(i + m[0].length);
        if (!/[A-Za-z0-9_(]/.test(sau)) {              // loại LOG10( hay tên hàm có số
          var row = +m[4];
          if (!m[3]) row += delta;
          out += m[1] + m[2] + m[3] + row;
          i += m[0].length;
          continue;
        }
      }
      out += ch; i++;
    }
    return out;
  }

  return {
    nfc: nfc,
    chuanHoaChuoi: chuanHoaChuoi,
    tenCot: tenCot,
    laRong: laRong,
    laTrue: laTrue,
    laNgay: laNgay,
    lamTron: lamTron,
    chuoiMaDon: chuoiMaDon,
    parseTien: parseTien,
    parseSoLuong: parseSoLuong,
    parseNgay: parseNgay,
    dinhDangNgayGio: dinhDangNgayGio,
    nhanThoiDiem: nhanThoiDiem,
    chiNgay: chiNgay,
    lapChiMucCot: lapChiMucCot,
    mangSangDoiTuong: mangSangDoiTuong,
    doiTuongSangMang: doiTuongSangMang,
    laDongRong: laDongRong,
    saoChepBang: saoChepBang,
    chiSoCot: chiSoCot,
    chuCot: chuCot,
    dichCongThuc: dichCongThuc
  };
})();
