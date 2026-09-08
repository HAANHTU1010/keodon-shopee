/**
 * nguon-thu-muc.js — nguồn file trên máy: `<thư mục thả>/<MA_GIAN_HANG>/*.xlsx`, xử lý xong chuyển sang
 * `<thư mục đã xử lý>/<MA_GIAN_HANG>/` (file hỏng → `.../LOI/<MA_GIAN_HANG>/`).
 *
 * Hai điểm bắt buộc (Context 5.1, 5.3):
 *  - Chỉ nhận `.xlsx` (Kênh Người Bán không xuất CSV); bỏ qua file khóa `~$` của Excel.
 *  - Tìm sheet dữ liệu theo TÊN (`orders`), không lấy sheet đầu tiên: file tab "Chờ lấy hàng" có sheet đầu
 *    `Advance Fulfilment` chỉ chứa dòng tiêu đề rỗng — đọc nhầm là ra file trống mà không báo lỗi.
 *
 * Hai chốt chặn thả sai chỗ (file xuất Shopee KHÔNG có cột gian hàng, gian hàng chỉ suy được từ tên thư mục):
 *  - `kiemTraThaSaiCho`      file .xlsx nằm ngay gốc thư mục thả → dừng, vì file đó không bao giờ được đọc.
 *  - `kiemTraTrungGianHang`  một mã đơn ở hai thư mục gian hàng → dừng, vì một file đã bị chép sang nhiều nơi.
 */
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

class NguonThuMuc {
  constructor(thuMucVao, thuMucRa) {
    this.vao = thuMucVao;
    this.ra = thuMucRa;
  }

  /** Các file .xlsx thật sự trong một thư mục (bỏ file khóa `~$` của Excel). */
  static xlsxTrong(d) {
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d)
      .filter(x => /\.xlsx$/i.test(x) && !x.startsWith('~$') && fs.statSync(path.join(d, x)).isFile())
      .sort();
  }

  layFileMoi(cfg) {
    const files = [];
    for (const gian of Object.keys(cfg.gianHang)) {
      const d = path.join(this.vao, gian);
      const ten = NguonThuMuc.xlsxTrong(d);
      for (const f of ten) {
        const p = path.join(d, f);
        files.push({
          san: 'SHOPEE', maGianHang: gian, tenFile: f, duongDan: p,
          docBang: () => NguonThuMuc.docBang(p, cfg.chung.ten_sheet_du_lieu)
        });
      }
    }
    return files;
  }

  /** File .xlsx → mảng 2 chiều của sheet có tên `tenSheet`. Không thấy sheet → báo lỗi kèm danh sách sheet có thật. */
  static docBang(p, tenSheet) {
    const wb = XLSX.readFile(p, { cellDates: true, raw: true });
    const ws = wb.Sheets[tenSheet];
    if (!ws) {
      throw new Error('Không tìm thấy sheet "' + tenSheet + '" trong file. Các sheet có trong file: ' + wb.SheetNames.join(', ') +
        '. Kiểm tra đã xuất đúng báo cáo đơn hàng từ Kênh Người Bán chưa.');
    }
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  }

  /** File hệ thống / file giữ chỗ: không phải người dùng thả nhầm nên không nhắc tên ra màn hình. */
  static laFileHeThong(ten) {
    return /^\.keep$/i.test(ten) || /^(desktop\.ini|thumbs\.db|\.gitkeep|\.ds_store)$/i.test(ten) || ten.startsWith('.');
  }

  /** Các file không phải .xlsx nằm trong thư mục thả — để vỏ nhắc người vận hành (tool chỉ đọc .xlsx). */
  fileBoQua(cfg) {
    const ds = [];
    for (const gian of Object.keys(cfg.gianHang)) {
      const d = path.join(this.vao, gian);
      if (!fs.existsSync(d)) continue;
      fs.readdirSync(d)
        .filter(f => !/\.xlsx$/i.test(f) && !f.startsWith('~$') && !NguonThuMuc.laFileHeThong(f)
          && fs.statSync(path.join(d, f)).isFile())
        .forEach(f => ds.push(gian + '/' + f));
    }
    // Thư mục con KHÔNG khớp mã gian hàng nào: file thả vào đó sẽ không bao giờ được đọc.
    // Phải nhắc ra màn hình, vì im lặng bỏ qua nghĩa là mất đơn mà không ai biết (thư mục
    // `SP_IMPORTMART` từng tồn tại song song với mã cấu hình `SP_IMPORT` đúng kiểu này).
    const hopLe = Object.keys(cfg.gianHang);
    if (fs.existsSync(this.vao)) {
      for (const ten of fs.readdirSync(this.vao)) {
        const d = path.join(this.vao, ten);
        if (!fs.statSync(d).isDirectory() || hopLe.indexOf(ten) >= 0) continue;
        const xlsx = NguonThuMuc.xlsxTrong(d);
        if (xlsx.length) ds.push(ten + '/ (' + xlsx.length + ' file .xlsx trong thư mục KHÔNG PHẢI tên gian hàng; tên hợp lệ: ' + hopLe.join(', ') + ')');
      }
    }
    return ds;
  }

  /** "SP_MALL (Shopee mall), SP_OFFOOD (Shopee O), …" — tên thư mục người vận hành được phép dùng. */
  static tenThuMucHopLe(cfg) {
    return Object.keys(cfg.gianHang)
      .map(g => g + (cfg.gianHang[g].ten && cfg.gianHang[g].ten !== g ? ' (' + cfg.gianHang[g].ten + ')' : ''))
      .join(', ');
  }

  /** Số file .xlsx đang chờ ở từng thư mục gian hàng: "SP_MALL 2 file · SP_OFFOOD 0 · …" */
  dongDangCho(cfg) {
    return Object.keys(cfg.gianHang)
      .map(g => g + ' ' + NguonThuMuc.xlsxTrong(path.join(this.vao, g)).length)
      // đơn vị chỉ ghi ở mục đầu cho dòng gọn, đủ để hiểu các số sau cũng là số file
      .map((x, i) => x + (i === 0 ? ' file' : ''))
      .join(' · ');
  }

  /** File .xlsx nằm NGAY GỐC thư mục thả (không nằm trong thư mục gian hàng nào). */
  fileNgoaiGianHang() {
    return NguonThuMuc.xlsxTrong(this.vao);
  }

  /**
   * File .xlsx thả ngay gốc thư mục thả thì KHÔNG BAO GIỜ được đọc: `layFileMoi` chỉ quét thư mục con
   * trùng mã gian hàng, còn file xuất Shopee không có cột nào cho biết đơn thuộc gian hàng nào.
   * Bỏ qua im lặng nghĩa là người vận hành tưởng đã kéo đơn xong trong khi chưa đơn nào được đọc,
   * nên đây là LỖI dừng hẳn chứ không phải cảnh báo.
   */
  kiemTraThaSaiCho(cfg) {
    const ds = this.fileNgoaiGianHang();
    if (!ds.length) return;
    throw new Error(
      ds.length + ' file .xlsx đang nằm ngay gốc thư mục thả. Tool KHÔNG đọc file ở đây, nên chưa đơn nào trong các file này được kéo:\n' +
      ds.map(f => '      · ' + f).join('\n') + '\n' +
      '  File xuất Shopee không có cột gian hàng. Tool chỉ biết đơn thuộc gian hàng nào qua TÊN THƯ MỤC bạn thả file vào.\n' +
      '  Cách sửa: mở ' + this.vao + '\n' +
      '            chuyển từng file trên vào đúng thư mục gian hàng của nó rồi bấm chạy lại.\n' +
      '  Thư mục hợp lệ: ' + NguonThuMuc.tenThuMucHopLe(cfg) + '\n' +
      '  Tool chưa đọc và chưa ghi gì cả.');
  }

  /**
   * Cùng một mã đơn nằm ở hai thư mục gian hàng khác nhau = chắc chắn một file xuất bị chép sang
   * nhiều thư mục. Ghi tiếp thì đơn của gian hàng này chui vào sheet gian hàng khác (đã xảy ra:
   * 432 đơn Shopee mall ghi nhầm sang sheet Importmart), gỡ lại rất mệt, nên phải dừng TRƯỚC khi ghi.
   * @param {Array} daDoc [{ maGianHang, tenFile, maDon: [] }] — kết quả lớp 1 của mọi file trong lần chạy.
   */
  static kiemTraTrungGianHang(daDoc) {
    const gianCuaDon = {};                       // mã đơn → { mã gian hàng: 1 }
    (daDoc || []).forEach(x => (x.maDon || []).forEach(m => {
      if (!m) return;
      if (!gianCuaDon[m]) gianCuaDon[m] = {};
      gianCuaDon[m][x.maGianHang] = 1;
    }));
    const cap = {};                              // "SP_A và SP_B" → { so, viDu[] }
    let tong = 0;
    Object.keys(gianCuaDon).sort().forEach(m => {
      const g = Object.keys(gianCuaDon[m]).sort();
      if (g.length < 2) return;
      tong++;
      const k = g.slice(0, -1).join(', ') + ' và ' + g[g.length - 1];
      if (!cap[k]) cap[k] = { so: 0, viDu: [] };
      cap[k].so++;
      if (cap[k].viDu.length < 3) cap[k].viDu.push(m);
    });
    if (!tong) return;
    const fileCua = {};
    daDoc.forEach(x => { (fileCua[x.maGianHang] = fileCua[x.maGianHang] || []).push(x.tenFile); });
    throw new Error(
      tong + ' mã đơn đang nằm ở HƠN MỘT thư mục gian hàng cùng lúc. Một đơn chỉ thuộc một gian hàng:\n' +
      Object.keys(cap).sort().map(k => '      · ' + k + ': ' + cap[k].so + ' mã, ví dụ ' + cap[k].viDu.join(', ')).join('\n') + '\n' +
      '  Nguyên nhân: cùng một file xuất bị chép vào nhiều thư mục gian hàng.\n' +
      '  File đang chờ:\n' +
      Object.keys(fileCua).sort().map(g => '      · ' + g + ': ' + fileCua[g].join(', ')).join('\n') + '\n' +
      '  Cách sửa: xóa bản chép thừa, mỗi file xuất chỉ để trong đúng một thư mục gian hàng, rồi bấm chạy lại.\n' +
      '  Tool chưa ghi gì cả.');
  }

  danhDauDaXuLy(f) { this._chuyen(f, path.join(this.ra, f.maGianHang)); }
  danhDauLoi(f) { this._chuyen(f, path.join(this.ra, 'LOI', f.maGianHang)); }

  _chuyen(f, thuMuc) {
    fs.mkdirSync(thuMuc, { recursive: true });
    const t = new Date();
    const nhan = '' + t.getFullYear() + String(t.getMonth() + 1).padStart(2, '0') + String(t.getDate()).padStart(2, '0') +
      '_' + String(t.getHours()).padStart(2, '0') + String(t.getMinutes()).padStart(2, '0');
    let dich = path.join(thuMuc, f.tenFile.replace(/(\.[^.]+)$/, '_' + nhan + '$1'));
    let n = 1;
    while (fs.existsSync(dich)) { n++; dich = path.join(thuMuc, f.tenFile.replace(/(\.[^.]+)$/, '_' + nhan + '_' + n + '$1')); }
    fs.renameSync(f.duongDan, dich);
  }
}

module.exports = { NguonThuMuc };
