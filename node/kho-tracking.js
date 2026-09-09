/**
 * kho-tracking.js — vỏ ghi cho GIAI ĐOẠN 1: kho đích là BẢN SAO file tracking `.xlsx` (ExcelJS).
 * Cùng giao diện với vỏ Google Sheet (`ShellAppsScript.gs`): docSheet · ghiKeyIn · docMapping · ghiMapping · canhBao.
 *
 * Nguyên tắc (GV-v2.2 mục 1.5, mục 3):
 *  - KHÔNG ghi đè file gốc: luôn ghi ra `<tên gốc>_AUTO_<yyyymmdd_HHMM>.xlsx`.
 *  - Chỉ thêm dòng dưới dòng dữ liệu cuối; KHÔNG sửa dòng đã có.
 *  - GỘP Ô C, H, I, J, K, L cho đơn nhiều sản phẩm — đúng như nhân viên đang làm (Context 4.2).
 *  - Chỉ được thêm đúng một sheet: `Mapping sản phẩm`.
 *  - Tự kiểm tra sau khi lưu: mở lại file, so chữ ký vùng dữ liệu CŨ (giá trị, ô gộp cũ, tiêu đề, dòng tổng);
 *    lệch một ô → xóa file kết quả và ném lỗi. Ô gộp MỚI do tool tạo cho đơn mới thì được phép.
 *
 * Ghi chú ExcelJS (đo 06–07/9/2026): giữ nguyên ô gộp, ArrayFormula, style, định dạng có điều kiện, độ rộng cột,
 * sheet ẩn; data validation bị tách thành hai vùng chồng nhau (vô hại). Ngày đọc/ghi theo UTC → chuyển giờ địa phương.
 */
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const FMT_NGAY = 'dd/mm/yyyy';
const MAU_VANG = 'FFFFF2CC';
const TEN_SHEET_MAPPING = ['Mapping sản phẩm', 'Mapping_san_pham'];

function utcSangLocal(d) {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}
function localSangUtc(d) {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
}
function laNgay(v) { return v instanceof Date && !isNaN(v.getTime()); }

/**
 * D-10 — FILE ĐÍCH ĐANG BỊ GIỮ (thường là đang mở trong Excel).
 *
 * Vì sao phải có: người vận hành mở file kết quả lần trước lên xem dòng vàng, quên đóng, rồi bấm chạy lại.
 * Hệ điều hành từ chối ghi và Node ném ra một câu tiếng Anh (`EPERM: operation not permitted, open '...'`).
 * Câu đó không nói được việc phải làm, nên người ta hoặc bấm lại mãi, hoặc tưởng tool hỏng rồi đi gõ tay.
 * Luật của kế hoạch kiểm thử: báo "đóng file rồi chạy lại", KHÔNG mất dữ liệu, và tuyệt đối không được
 * lặng lẽ ghi sang một tên khác rồi coi như xong.
 *
 * Mã lỗi gặp thật: Windows trả `EBUSY` (file đang bị khóa) hoặc `EPERM` (khóa ghi / thuộc tính chỉ đọc);
 * Linux/macOS trả `EACCES`. `EISDIR` là đường dẫn kết quả trỏ vào một thư mục — cũng là không ghi được.
 */
const MA_LOI_KHOA_GHI = ['EBUSY', 'EPERM', 'EACCES', 'EISDIR', 'ETXTBSY'];

function laLoiKhoaGhi(e) { return !!(e && MA_LOI_KHOA_GHI.indexOf(e.code) >= 0); }

/** Lỗi tiếng Việt thay cho mã lỗi hệ điều hành. Nói rõ ba điều: chuyện gì · file nào · phải làm gì. */
function loiKhongGhiDuoc(e, duongDan) {
  const loi = new Error(
    'KHÔNG GHI ĐƯỢC file kết quả — hệ điều hành trả mã ' + e.code + ':\n' +
    '      ' + duongDan + '\n' +
    '  File này đang bị một chương trình khác giữ. Gần như luôn là ĐANG MỞ TRONG EXCEL.\n' +
    '  Cách sửa: đóng file rồi chạy lại.\n' +
    '  Không mất dữ liệu: file tracking gốc không bị đụng một ô nào, file xuất vẫn nằm nguyên trong\n' +
    '  thư mục thả, và tool KHÔNG ghi lén sang file tạm nào. Chạy lại là ghi đủ.');
  loi.code = e.code;
  loi.duongDan = duongDan;
  loi.khoaGhi = true;
  return loi;
}

/** Giá trị ô ExcelJS → giá trị thuần cho lõi (công thức → null, ngày → giờ địa phương, rich text → chuỗi). */
function giaTriThuan(cell) {
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) return null;   // ô gộp con → trống
  const v = cell.value;
  if (v == null) return null;
  if (cell.type === ExcelJS.ValueType.Formula) return null;
  if (typeof v === 'object') {
    if (v.formula != null || v.sharedFormula != null) return null;
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.text != null) return typeof v.text === 'object' && v.text.richText ? v.text.richText.map(t => t.text).join('') : String(v.text);
    if (v.error != null) return null;
    if (laNgay(v)) return utcSangLocal(v);
    return String(v);
  }
  if (laNgay(v)) return utcSangLocal(v);
  return v;
}

function congThucCua(cell) {
  const v = cell.value;
  if (v && typeof v === 'object' && (v.formula != null || v.sharedFormula != null)) {
    let f = cell.formula;
    if (!f && v.formula) f = v.formula;
    return { text: String(f || ''), mang: v.shareType === 'array' };
  }
  return null;
}

/**
 * Giá trị Excel đã TÍNH SẴN và lưu kèm ô công thức. Sheet `Tổng tồn kho` để tồn ở cột công thức,
 * mà quy tắc chọn lô của mục 1.3 lại cần chính con số đó. Bỏ qua phần này thì mọi lô đều "tồn null"
 * và tool luôn lấy mã đầu tiên — sai âm thầm, không ai thấy.
 */
function ketQuaDaTinh(cell) {
  const v = cell.value;
  if (!v || typeof v !== 'object') return null;
  if (v.formula == null && v.sharedFormula == null) return null;
  const r = v.result;
  if (r == null) return null;
  if (typeof r === 'object') {
    if (r.error != null) return null;
    if (r.richText) return r.richText.map(t => t.text).join('');
    if (laNgay(r)) return utcSangLocal(r);
    return String(r);
  }
  return laNgay(r) ? utcSangLocal(r) : r;
}

/** Ô "trơn" (không viền, không nền, định dạng General) → coi như ngoài vùng nhân viên đã kẻ sẵn. */
function oChuaDinhDang(cell) {
  const b = cell.border;
  if (b) for (const canh of ['left', 'right', 'top', 'bottom']) if (b[canh] && b[canh].style) return false;
  const f = cell.fill;
  if (f && f.type === 'pattern' && f.pattern && f.pattern !== 'none') return false;
  return !cell.numFmt || cell.numFmt === 'General';
}

function chuoiGiaTri(cell) {
  const ct = congThucCua(cell);
  if (ct) return (ct.mang ? 'AF:' : 'F:') + ct.text;
  const v = giaTriThuan(cell);
  if (v == null) return '';
  if (typeof v === 'number') return 'N:' + String(Number(v));
  if (typeof v === 'boolean') return 'B:' + v;
  if (laNgay(v)) return 'D:' + v.toISOString();
  return 'S:' + String(v);
}

class KhoTracking {
  /**
   * @param {string} duongDanGoc  file tracking đầu vào (không bị đụng tới)
   * @param {string} duongDanOut  file kết quả (phải khác đường dẫn gốc)
   * @param {Object} lop          lõi đã nạp (napLoi())
   * @param {Object} [tuyChon]    { mappingKhoiTao: Array[] } — bảng Mapping dùng khi file tracking chưa có sheet đó
   */
  constructor(duongDanGoc, duongDanOut, lop, tuyChon) {
    if (!fs.existsSync(duongDanGoc)) throw new Error('Không tìm thấy file tracking: ' + duongDanGoc);
    if (path.resolve(duongDanGoc) === path.resolve(duongDanOut)) throw new Error('Không được ghi đè file tracking gốc — chọn đường dẫn kết quả khác');
    this.goc = duongDanGoc;
    this.out = duongDanOut;
    this.lop = lop;
    this.tuyChon = tuyChon || {};
    this.wb = null;
    this.cfg = null;
    this.chuKyTruoc = {};
    this.canhBaoDaGui = [];
    this.mappingKhoiTao = null;
    this.tenSheetMapping = null;
  }

  async nap(cfg) {
    this.wb = new ExcelJS.Workbook();
    await this.wb.xlsx.readFile(this.goc);
    this.cfg = cfg || this.lop.Config.tao();
    for (const g of Object.keys(this.cfg.gianHang)) {
      const ten = this.cfg.gianHang[g].sheet;
      if (!this._ws(ten)) continue;
      this._goCongThucChiaSe(ten);
      this.chuKyTruoc[ten] = this._chuKy(ten);
    }
    return this;
  }

  /**
   * Excel lưu công thức lặp lại dưới dạng "chia sẻ": một ô master giữ công thức, các ô dưới chỉ trỏ về nó.
   * Nếu tool ghi đè hoặc gộp trúng ô master thì mọi ô con mất gốc và ExcelJS từ chối ghi file
   * ("Shared Formula master must exist above..."). Ở các cột công thức, đổi mỗi ô thành công thức riêng
   * (nội dung y hệt, ExcelJS đã dịch sẵn theo dòng) để không còn phụ thuộc đó.
   * Không đổi giá trị hay ý nghĩa ô nào — chữ ký tự kiểm tra vẫn so đúng vì so trên công thức đã dịch.
   */
  _goCongThucChiaSe(tenSheet) {
    const ws = this._ws(tenSheet);
    const k = this.cfg.keyin;
    const cot = k.cot_cong_thuc.concat([k.cot_doanh_thu]).filter((v, i, a) => a.indexOf(v) === i);
    let doi = 0;
    for (let r = k.dong_dau; r <= ws.rowCount; r++) {
      for (const c of cot) {
        const cell = ws.getCell(r, c);
        const v = cell.value;
        if (!v || typeof v !== 'object') continue;
        if (v.sharedFormula == null && v.shareType !== 'shared') continue;
        const ct = cell.formula;
        if (!ct) continue;
        cell.value = v.result === undefined ? { formula: ct } : { formula: ct, result: v.result };
        doi++;
      }
    }
    return doi;
  }

  thuKhoa() { return true; }
  moKhoa() { }

  _ws(ten) { return this.wb.getWorksheet(ten) || null; }

  /** Ảnh chụp sheet cho lõi: giá trị + công thức (đã dịch sharedFormula) + cờ ArrayFormula. */
  docSheet(ten) {
    const ws = this._ws(ten);
    if (!ws) return null;
    const giaTri = [], congThuc = [], mang = [], giaTriTinh = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const gt = [], ct = [], mg = [], gtt = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => {
        const f = congThucCua(cell);
        if (f) { gt[c - 1] = null; ct[c - 1] = f.text; mg[c - 1] = f.mang; gtt[c - 1] = ketQuaDaTinh(cell); }
        else { gt[c - 1] = giaTriThuan(cell); ct[c - 1] = null; mg[c - 1] = false; gtt[c - 1] = gt[c - 1]; }
      });
      giaTri[r - 1] = gt; congThuc[r - 1] = ct; mang[r - 1] = mg; giaTriTinh[r - 1] = gtt;
    });
    for (let i = 0; i < giaTri.length; i++) { if (!giaTri[i]) giaTri[i] = []; if (!congThuc[i]) congThuc[i] = []; if (!mang[i]) mang[i] = []; if (!giaTriTinh[i]) giaTriTinh[i] = []; }
    return { ten, soDong: ws.rowCount, giaTri, congThuc, mang, giaTriTinh };
  }

  /** Sheet Mapping trong file tracking; chưa có → dùng bảng khởi tạo do vỏ truyền vào (file DEMO của BA). */
  docMapping() {
    for (const ten of TEN_SHEET_MAPPING) {
      const ws = this._ws(ten);
      if (ws) { this.tenSheetMapping = ten; return this._aoa(ws); }
    }
    if (this.tuyChon.mappingKhoiTao) {
      this.tenSheetMapping = TEN_SHEET_MAPPING[0];
      this.mappingKhoiTao = this.tuyChon.mappingKhoiTao;
      return this.lop.Utils.saoChepBang(this.tuyChon.mappingKhoiTao);
    }
    return null;
  }

  _aoa(ws) {
    const out = [];
    ws.eachRow({ includeEmpty: true }, (row, r) => {
      const arr = [];
      row.eachCell({ includeEmpty: true }, (cell, c) => { arr[c - 1] = giaTriThuan(cell); });
      out[r - 1] = arr;
    });
    for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
    return out.map(r => r.map(v => v == null ? '' : v));
  }

  /** Ghi lại sheet Mapping (sheet DUY NHẤT tool được thêm). Dòng chưa dùng được → tô vàng. */
  ghiMapping(bang, dongToVang) {
    const ten = this.tenSheetMapping || TEN_SHEET_MAPPING[0];
    const cu = this._ws(ten);
    if (cu) this.wb.removeWorksheet(cu.id);
    const ws = this.wb.addWorksheet(ten);
    const vang = new Set(dongToVang || []);
    for (let r = 0; r < bang.length; r++) {
      const row = bang[r] || [];
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        const cell = ws.getCell(r + 1, c + 1);
        if (v != null && v !== '') cell.value = laNgay(v) ? localSangUtc(v) : v;
        if (laNgay(v)) cell.numFmt = FMT_NGAY;
        if (r > 0 && vang.has(r + 1)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MAU_VANG } };
      }
    }
    ws.getRow(1).font = { bold: true };
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    const rong = [14, 60, 30, 18, 8, 34, 10, 10, 14, 14, 12, 60];
    rong.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    this.mappingKhoiTao = null;
  }

  canhBao(tieuDe, noiDung) {
    this.canhBaoDaGui.push({ tieuDe, noiDung });
    console.warn('\n[CẦN XEM] ' + tieuDe + (noiDung ? '\n  ' + String(noiDung).replace(/\n/g, '\n  ') : ''));
  }

  /**
   * Thực thi kế hoạch ghi: ô giá trị → công thức kéo → GỘP Ô → tô vàng → ghi chú cột Note.
   * Thứ tự quan trọng: phải ghi giá trị TRƯỚC khi gộp, vì ô gộp chỉ giữ giá trị của ô trên cùng.
   */
  ghiKeyIn(plan) {
    const ws = this._ws(plan.tenSheet);
    if (!ws) throw new Error('Không có sheet ' + plan.tenSheet);
    const k = this.cfg.keyin;
    const maxCot = Math.max(k.cot_ngay, k.cot_nguon_don, k.cot_ma_don, k.cot_ten_viet_tat, k.cot_so_luong,
      k.cot_tong_tien_sp, k.cot_mgg_shop, k.cot_chi_phi, k.cot_thue, k.cot_doanh_thu, ...k.cot_cong_thuc);
    const dongMau = plan.dongMau;
    const daChep = new Set();
    const chepStyleDong = (r) => {
      if (!dongMau || daChep.has(r)) return;
      daChep.add(r);
      for (let c = 1; c <= maxCot; c++) {
        const dich = ws.getCell(r, c);
        if (!oChuaDinhDang(dich)) continue;
        const nguon = ws.getCell(dongMau, c);
        if (nguon.style && Object.keys(nguon.style).length) dich.style = JSON.parse(JSON.stringify(nguon.style));
      }
      const rd = ws.getRow(r), rm = ws.getRow(dongMau);
      if (rm.height && !rd.height) rd.height = rm.height;
    };
    // ExcelJS dùng CHUNG một đối tượng style giữa các ô cùng kiểu → tách riêng trước khi đổi định dạng
    const tachStyle = (cell) => { cell.style = JSON.parse(JSON.stringify(cell.style || {})); };

    plan.oGhi.forEach(o => {
      chepStyleDong(o.r);
      const cell = ws.getCell(o.r, o.c);
      const v = o.gt;
      if (v == null) cell.value = null;
      else if (laNgay(v)) cell.value = localSangUtc(v);
      else cell.value = v;
      if (o.dinhDang != null) {
        tachStyle(cell);
        if (o.dinhDang === 'General') delete cell.style.numFmt; else cell.numFmt = o.dinhDang;
      }
    });

    plan.congThucKeo.forEach(o => {
      chepStyleDong(o.r);
      const cell = ws.getCell(o.r, o.c);
      if (oChuaDinhDang(cell)) {
        const nguon = ws.getCell(o.tuDong, o.c);
        if (nguon.style && Object.keys(nguon.style).length) cell.style = JSON.parse(JSON.stringify(nguon.style));
      }
      cell.value = o.mang ? { formula: o.text, ref: cell.address, shareType: 'array' } : { formula: o.text };
    });

    // gộp ô C/H/I/J/K/L cho đơn nhiều sản phẩm — sau khi đã ghi giá trị vào ô trên cùng
    (plan.gopO || []).forEach(g => {
      if (g.r2 <= g.r1) return;
      ws.mergeCells(g.r1, g.c, g.r2, g.c);
    });

    // tô vàng dòng cần người xem (bỏ qua ô gộp con để không đụng vào vùng gộp)
    const cotCuoi = Math.max(maxCot, plan.cotNote || 0);
    (plan.toVang || []).forEach(r => {
      for (let c = 1; c <= cotCuoi; c++) {
        const cell = ws.getCell(r, c);
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
        tachStyle(cell);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: MAU_VANG } };
      }
    });
    (plan.ghiChu || []).forEach(g => { const cell = ws.getCell(g.r, g.c); tachStyle(cell); cell.value = g.text; });
    if (plan.tieuDeNote) {
      const h = ws.getCell(plan.tieuDeNote.r, plan.tieuDeNote.c);
      tachStyle(h); h.value = plan.tieuDeNote.text; h.font = Object.assign({}, h.font || {}, { bold: true });
    }
  }

  /**
   * Chữ ký phần CŨ của sheet gian hàng: ô gộp trong vùng dữ liệu cũ, tiêu đề, dòng tổng, số công thức từng cột
   * công thức, băm giá trị vùng dữ liệu cũ. Ô gộp MỚI (tool tạo cho đơn mới) không nằm trong chữ ký.
   */
  _chuKy(ten, dongCuoiCoDinh) {
    const ws = this._ws(ten);
    const k = this.cfg.keyin;
    const ss = this.docSheet(ten);
    const dongCuoi = dongCuoiCoDinh != null ? dongCuoiCoDinh : this.lop.KeyIn.dongDuLieuCuoi(ss, k);
    const merges = Object.keys(ws._merges || {})
      .filter(a => { const m = /(\d+)/.exec(a); return m && Number(m[1]) <= dongCuoi; })
      .sort();
    const maxCot = Math.max(k.cot_ngay, k.cot_nguon_don, k.cot_ma_don, k.cot_ten_viet_tat, k.cot_so_luong,
      k.cot_tong_tien_sp, k.cot_mgg_shop, k.cot_chi_phi, k.cot_thue, k.cot_doanh_thu, ...k.cot_cong_thuc);
    const sig = (r) => { const a = []; for (let c = 1; c <= maxCot; c++) a.push(chuoiGiaTri(ws.getCell(r, c))); return a.join('\x1f'); };
    const soCongThuc = {};
    k.cot_cong_thuc.forEach(c => {
      let n = 0;
      for (let r = k.dong_dau; r <= dongCuoi; r++) if (ss.congThuc[r - 1] && ss.congThuc[r - 1][c - 1]) n++;
      soCongThuc[c] = n;
    });
    const h = crypto.createHash('sha256');
    for (let r = k.dong_dau; r <= dongCuoi; r++) {
      const a = [];
      for (let c = 1; c <= maxCot; c++) a.push(chuoiGiaTri(ws.getCell(r, c)));
      h.update(a.join('\x1f') + '\n');
    }
    return { merges, header: sig(k.dong_header), tong: sig(k.dong_tong), soCongThuc, bam: h.digest('hex'), dongCuoi };
  }

  /** Ghi file kết quả rồi tự kiểm tra bằng cách mở lại và so chữ ký. Lệch → xóa file, ném lỗi. */
  async luu() {
    if (path.resolve(this.goc) === path.resolve(this.out)) throw new Error('Không được ghi đè file tracking gốc');
    if (this.mappingKhoiTao) this.ghiMapping(this.mappingKhoiTao, []);   // sheet Mapping chưa có trong file → tạo
    fs.mkdirSync(path.dirname(path.resolve(this.out)), { recursive: true });
    this.wb.calcProperties = Object.assign({}, this.wb.calcProperties || {}, { fullCalcOnLoad: true });
    // D-10: file đích đang mở trong Excel → dịch mã lỗi hệ điều hành sang câu tiếng Việt nói rõ phải làm gì.
    // Đo 08/9: ExcelJS hỏng ngay ở bước mở file nên nội dung cũ còn nguyên và không sinh file tạm nào.
    try {
      await this.wb.xlsx.writeFile(this.out);
    } catch (e) {
      if (laLoiKhoaGhi(e)) throw loiKhongGhiDuoc(e, this.out);
      throw e;
    }

    const kiem = new KhoTracking(this.out, this.out + '.kiemtra.tmp', this.lop);
    kiem.wb = new ExcelJS.Workbook();
    await kiem.wb.xlsx.readFile(this.out);
    kiem.cfg = this.cfg;
    const lech = [];
    for (const ten of Object.keys(this.chuKyTruoc)) {
      const truoc = this.chuKyTruoc[ten];
      if (!kiem._ws(ten)) { lech.push(ten + ': mất sheet'); continue; }
      const sau = kiem._chuKy(ten, truoc.dongCuoi);
      if (JSON.stringify(truoc.merges) !== JSON.stringify(sau.merges)) lech.push(ten + ': ô gộp vùng cũ đổi (' + truoc.merges.length + ' → ' + sau.merges.length + ')');
      if (truoc.header !== sau.header) lech.push(ten + ': dòng tiêu đề đổi');
      if (truoc.tong !== sau.tong) lech.push(ten + ': dòng tổng đổi');
      if (JSON.stringify(truoc.soCongThuc) !== JSON.stringify(sau.soCongThuc)) lech.push(ten + ': số công thức vùng cũ đổi');
      if (truoc.bam !== sau.bam) lech.push(ten + ': giá trị vùng dữ liệu cũ (dòng ' + this.cfg.keyin.dong_dau + '–' + truoc.dongCuoi + ') đổi');
    }
    if (lech.length) {
      try { fs.unlinkSync(this.out); } catch (e) { }
      throw new Error('TỰ KIỂM TRA THẤT BẠI — đã xóa file kết quả, file gốc không bị đụng. ' + lech.join('; '));
    }
    return this.out;
  }
}

/** Đọc một file .xlsx bất kỳ thành mảng 2 chiều — sheet theo tên, không có thì sheet đầu. */
async function docBangXlsx(duongDan, tenSheet) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(duongDan);
  let ws = null;
  if (tenSheet) {
    for (const t of [].concat(tenSheet)) { ws = wb.getWorksheet(t); if (ws) break; }
  }
  if (!ws) ws = wb.worksheets[0];
  if (!ws) throw new Error('File ' + duongDan + ' không có sheet nào');
  const out = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const arr = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => { arr[c - 1] = giaTriThuan(cell); });
    out[r - 1] = arr;
  });
  for (let i = 0; i < out.length; i++) if (!out[i]) out[i] = [];
  return out.map(r => r.map(v => v == null ? '' : v));
}

/** `<thư mục>/<tên gốc>_AUTO_<yyyymmdd_HHMM>.xlsx`; bỏ hậu tố _AUTO_ cũ; trùng phút → _2, _3… */
/**
 * Đường dẫn file kết quả. Tên giữ nguyên dạng `<gốc>_AUTO_<yyyymmdd_HHMM>[_n].xlsx`.
 *
 * VÌ SAO PHẢI GIÀNH TÊN BẰNG CÁCH TẠO FILE RỖNG: nhãn thời gian chỉ phân giải tới PHÚT.
 * Bản cũ chỉ `existsSync` rồi mới ghi ở bước sau — giữa hai bước đó một máy khác có thể
 * giành mất tên. Với thư mục kết quả dùng chung (bài D-11 của kế hoạch kiểm thử) thì hai máy
 * chạy cùng phút sẽ cùng thấy 'chưa có', cùng chọn một tên, và máy ghi sau đè mất máy ghi trước.
 * `flag: 'wx'` tạo file chỉ khi CHƯA có, và phép kiểm cùng phép tạo là một thao tác của hệ điều hành,
 * nên không còn khe hở. File rỗng này sẽ bị chính bước lưu ghi đè lên.
 */
function duongDanOut(duongDanGoc, thuMucOut, thoiDiem, lop) {
  const goc = path.basename(duongDanGoc, path.extname(duongDanGoc)).replace(/(_AUTO_\d{8}_\d{4}(_\d+)?)+$/, '');
  const nhan = lop.Utils.nhanThoiDiem(thoiDiem || new Date());
  fs.mkdirSync(thuMucOut, { recursive: true });
  for (let n = 1; n <= 500; n++) {
    const p = path.join(thuMucOut, goc + '_AUTO_' + nhan + (n === 1 ? '' : '_' + n) + '.xlsx');
    if (path.resolve(p) === path.resolve(duongDanGoc)) continue;   // không bao giờ trỏ vào file gốc
    try {
      fs.closeSync(fs.openSync(p, 'wx'));   // giành tên; đã có ai giành thì ném EEXIST
      return p;
    } catch (e) {
      if (e.code === 'EEXIST') continue;                       // máy khác giành trước → thử tên kế tiếp
      // D-10: thư mục kết quả không ghi được (đang bị giữ / chỉ đọc) — nói tiếng Việt, đừng ném mã lỗi Anh.
      if (laLoiKhoaGhi(e)) throw loiKhongGhiDuoc(e, p);
      throw e;
    }
  }
  throw new Error('Thư mục kết quả đã có 500 file cùng nhãn thời gian ' + nhan + ' — dọn bớt rồi chạy lại.');
}

module.exports = { KhoTracking, duongDanOut, docBangXlsx, utcSangLocal, localSangUtc, giaTriThuan, congThucCua, TEN_SHEET_MAPPING };
