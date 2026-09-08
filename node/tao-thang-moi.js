/**
 * tao-thang-moi.js — VỎ NODE cho tính năng "tạo file tracking tháng mới" (giai đoạn 3).
 * Thực thi KẾ HOẠCH do `src/TaoThangMoi.gs` lập, trên file `.xlsx` bằng ExcelJS.
 * Nhờ vỏ này mà tính năng test được ngay hôm nay, khi chưa có link Google Sheet thật.
 *
 *   node node/tao-thang-moi.js --cu <tháng cũ.xlsx> --moi <vỏ tháng mới.xlsx> --ra <kết quả.xlsx> --thang 2026-09
 *
 * Luật cứng của vỏ:
 *  - KHÔNG BAO GIỜ ghi vào file tháng cũ và KHÔNG ghi đè vỏ đầu vào: luôn ghi ra `--ra`.
 *  - Chạy các bước theo đúng thứ tự lõi trả về; ghi cờ `BUOC_DA_XONG` sau mỗi bước.
 *  - B5a (chèn cột) đặt cờ `B5_DANG_LAM` trước và `B5_DA_CHEN` ngay sau — bước này không chạy lại được.
 *  - Chỉ ghi `DA_KHOI_TAO_...` khi CẢ TÁM phép K-1…K-8 đạt.
 *  - Dọn tháng cũ bằng `XOA_DONG` (xóa HẲN dòng, dồn lên) chứ không xóa nội dung — xem `xoaDong()`.
 *    Vỏ phải DỊCH công thức theo số dòng đã dồn; không dịch là sai lặng.
 *
 * === HAI CÁI BẪY CỦA ExcelJS, đo ngày 08/9/2026, đã chống ở đây ===
 *  1. Ô công thức có kết quả lưu sẵn bằng **0** thì `cell.value.result` về `undefined` (ExcelJS bỏ giá trị falsy),
 *     dù XML gốc ghi rõ `<v>0</v>`. Đọc thành `null` là mọi tồn 0 biến mất → coi `undefined` là 0.
 *  2. ExcelJS **không tính công thức**. Ô ta vừa ghi công thức thì không có kết quả nào để đọc.
 *     Vì vậy `tinhLai()` dưới đây tính lại đúng chuỗi công thức của file này (SUMIF tồn kho → Tổng nhập →
 *     Lợi nhuận) để tám phép tự kiểm có số thật mà so, thay vì so với 0.
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const SRC = path.join(__dirname, '..', 'src');

/** Nạp lõi: `Utils.gs` + `TaoThangMoi.gs` chạy chung một phạm vi, y như Apps Script ghép file. */
function napLoiTaoThangMoi() {
  const src = ['Utils.gs', 'TaoThangMoi.gs'].map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  return new Function(src + '\nreturn {' + [...ten].map(n => `${n}: ${n}`).join(', ') + '};')();   // eslint-disable-line no-new-func
}

/** `Utils` của lõi, nạp một lần — vỏ cần `dichCongThuc` để dịch công thức khi dồn dòng lên. */
let _utils = null;
function utils() { if (!_utils) _utils = napLoiTaoThangMoi().Utils; return _utils; }

/**
 * Dịch công thức từ dòng `tu` về dòng `den`, và TỪ CHỐI dịch nếu kết quả sinh ra số dòng ≤ 0.
 * Vì sao phải chặn: một công thức ở dòng 900 trỏ tương đối lên dòng 10 mà dồn lên dòng 4 thì
 * `dichCongThuc` cho ra `D-886` — Excel không đọc được và ExcelJS ghi ra file hỏng, im lặng.
 * Google Sheets trong trường hợp đó trả `#REF!`; ở đây ta giữ nguyên văn bản cũ và để phép
 * tự kiểm K-6/N-11 bắt, an toàn hơn là ghi ra một file không mở được.
 */
function dichCT(text, tu, den) {
  if (!text || tu === den) return text;
  const ra = utils().dichCongThuc(text, tu, den);
  return /(^|[^A-Za-z0-9_$])\$?[A-Z]{1,3}\$?(-\d|0(?!\d))/.test(ra) ? text : ra;
}

// ---------------------------------------------------------------- đọc ô

function laNgay(v) { return v instanceof Date && !isNaN(v.getTime()); }
function utcSangLocal(d) { return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()); }
function chuCot(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }
function chiSoCot(chu) { let n = 0; const s = String(chu).toUpperCase(); for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }

function congThucCua(cell) {
  const v = cell.value;
  if (v && typeof v === 'object' && (v.formula != null || v.sharedFormula != null)) {
    return { text: String(cell.formula || v.formula || ''), mang: v.shareType === 'array' };
  }
  return null;
}

/** Giá trị gõ tay; ô công thức → null. */
function giaTriThuan(cell) {
  if (cell.isMerged && cell.master && cell.master.address !== cell.address) return null;
  const v = cell.value;
  if (v == null) return null;
  if (congThucCua(cell)) return null;
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map(t => t.text).join('');
    if (v.error != null) return String(v.error);
    if (v.text != null) return typeof v.text === 'object' && v.text.richText ? v.text.richText.map(t => t.text).join('') : String(v.text);
    if (laNgay(v)) return utcSangLocal(v);
    return String(v);
  }
  return laNgay(v) ? utcSangLocal(v) : v;
}

/**
 * Giá trị HIỂN THỊ của ô công thức (kết quả Excel đã lưu sẵn).
 * BẪY 1: kết quả bằng 0 về `undefined` → phải trả 0, nếu không mọi mã tồn 0 biến mất khỏi khối đầu kỳ.
 */
function ketQuaDaTinh(cell) {
  const v = cell.value;
  if (!v || typeof v !== 'object') return null;
  if (v.formula == null && v.sharedFormula == null) return null;
  const r = v.result;
  if (r === undefined) return 0;
  if (r == null) return 0;
  if (typeof r === 'object') {
    if (r.error != null) return String(r.error);
    if (r.richText) return r.richText.map(t => t.text).join('');
    if (laNgay(r)) return utcSangLocal(r);
    return String(r);
  }
  return laNgay(r) ? utcSangLocal(r) : r;
}

// ---------------------------------------------------------------- ảnh chụp

function anhChupSheet(ws) {
  const giaTri = [], congThuc = [], mang = [], giaTriTinh = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const a = [], b = [], c = [], d = [];
    row.eachCell({ includeEmpty: true }, (cell, ci) => {
      const f = congThucCua(cell);
      if (f) { a[ci - 1] = null; b[ci - 1] = f.text; c[ci - 1] = f.mang; d[ci - 1] = ketQuaDaTinh(cell); }
      else { a[ci - 1] = giaTriThuan(cell); b[ci - 1] = null; c[ci - 1] = false; d[ci - 1] = a[ci - 1]; }
    });
    giaTri[r - 1] = a; congThuc[r - 1] = b; mang[r - 1] = c; giaTriTinh[r - 1] = d;
  });
  for (let i = 0; i < giaTri.length; i++) {
    if (!giaTri[i]) giaTri[i] = [];
    if (!congThuc[i]) congThuc[i] = [];
    if (!mang[i]) mang[i] = [];
    if (!giaTriTinh[i]) giaTriTinh[i] = [];
  }
  return { ten: ws.name, soDong: ws.rowCount, giaTri, congThuc, mang, giaTriTinh, gopO: docGopO(ws) };
}

function docGopO(ws) {
  return (ws.model.merges || []).map(s => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(s);
    return m ? { r1: +m[2], c1: chiSoCot(m[1]), r2: +m[4], c2: chiSoCot(m[3]), text: s } : null;
  }).filter(Boolean);
}

function anhChupFile(wb, ten) {
  const anh = { ten, tenSheet: [], sheets: {} };
  wb.eachSheet(ws => { anh.tenSheet.push(ws.name); anh.sheets[ws.name] = anhChupSheet(ws); });
  return anh;
}

async function docFile(duongDan) {
  if (!fs.existsSync(duongDan)) throw new Error('Không thấy file: ' + duongDan);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(duongDan);
  return wb;
}

// ---------------------------------------------------------------- vỏ ghi

class VoThangMoi {
  /**
   * @param {string} voVao   vỏ file tháng mới (chỉ đọc)
   * @param {string} raFile  file kết quả (bắt buộc khác `voVao`)
   */
  constructor(voVao, raFile) {
    if (path.resolve(voVao) === path.resolve(raFile)) throw new Error('Không được ghi đè vỏ đầu vào — chọn đường dẫn kết quả khác');
    this.voVao = voVao;
    this.raFile = raFile;
    this.wb = null;
    this.nhatKy = [];
  }

  async nap() {
    this.wb = await docFile(this.voVao);
    this.wb.eachSheet(ws => goCongThucChiaSe(ws));
    return this;
  }

  ws(ten) {
    const w = this.wb.getWorksheet(ten);
    if (!w) throw new Error('Không có sheet `' + ten + '` trong vỏ tháng mới');
    return w;
  }

  anhChup() { return anhChupFile(this.wb, path.basename(this.voVao)); }

  /** Chạy một danh sách thao tác. Mỗi loại thao tác là một câu lệnh nhỏ, không có logic nghiệp vụ ở đây. */
  chay(thaoTac) {
    const dem = {};
    for (const t of thaoTac) {
      dem[t.loai] = (dem[t.loai] || 0) + 1;
      switch (t.loai) {
        case 'TAO_SHEET': {
          if (!this.wb.getWorksheet(t.ten)) this.wb.addWorksheet(t.ten);
          break;
        }
        case 'BO_GOP': boGop(this.ws(t.sheet), t); break;
        case 'XOA_VUNG': xoaVung(this.ws(t.sheet), t); break;
        case 'XOA_DONG': xoaDong(this.ws(t.sheet), t.r1, t.soDong); break;
        case 'GHI_O': {
          const cell = this.ws(t.sheet).getCell(t.r, t.c);
          cell.value = (t.gt === null || t.gt === undefined || t.gt === '') ? null : t.gt;
          if (t.dinhDang) { tachStyle(cell); cell.numFmt = t.dinhDang; }
          break;
        }
        case 'GHI_CT': {
          const cell = this.ws(t.sheet).getCell(t.r, t.c);
          cell.value = t.mang ? { formula: t.text, ref: cell.address, shareType: 'array' } : { formula: t.text };
          break;
        }
        case 'GHI_BANG': {
          const ws = this.ws(t.sheet);
          for (let i = 0; i < t.bang.length; i++) {
            const dong = t.bang[i] || [];
            for (let j = 0; j < dong.length; j++) {
              const v = dong[j];
              ws.getCell(t.r1 + i, t.c1 + j).value = (v === '' || v == null) ? null : v;
            }
          }
          break;
        }
        case 'GOP_O': {
          const ws = this.ws(t.sheet);
          boGop(ws, t);
          if (t.r2 > t.r1 || t.c2 > t.c1) ws.mergeCells(t.r1, t.c1, t.r2, t.c2);
          break;
        }
        case 'CHEN_COT': chenCot(this.ws(t.sheet), t.truocCot); break;
        default: throw new Error('Thao tác lạ: ' + t.loai);
      }
    }
    return dem;
  }

  async luu() {
    fs.mkdirSync(path.dirname(this.raFile), { recursive: true });
    await this.wb.xlsx.writeFile(this.raFile);
    return this.raFile;
  }
}

function tachStyle(cell) { cell.style = JSON.parse(JSON.stringify(cell.style || {})); }

/**
 * Excel lưu công thức lặp lại dạng "chia sẻ": một ô master giữ công thức, ô dưới chỉ trỏ về nó.
 * Xóa hay gộp trúng ô master thì mọi ô con mất gốc, ExcelJS từ chối ghi file.
 * Đổi mỗi ô thành công thức riêng (nội dung y hệt, ExcelJS đã dịch sẵn theo dòng) để hết phụ thuộc.
 */
function goCongThucChiaSe(ws) {
  let doi = 0;
  ws.eachRow({ includeEmpty: false }, row => {
    row.eachCell({ includeEmpty: false }, cell => {
      const v = cell.value;
      if (!v || typeof v !== 'object') return;
      if (v.sharedFormula == null && v.shareType !== 'shared') return;
      const ct = cell.formula;
      if (!ct) return;
      cell.value = v.result === undefined ? { formula: ct } : { formula: ct, result: v.result };
      doi++;
    });
  });
  return doi;
}

/** Bỏ MỌI ô gộp cắt qua hình chữ nhật (r1,c1)-(r2,c2). */
function boGop(ws, v) {
  for (const m of docGopO(ws)) {
    if (m.r2 < v.r1 || m.r1 > v.r2 || m.c2 < v.c1 || m.c1 > v.c2) continue;
    try { ws.unMergeCells(m.text); } catch (e) { /* đã bị gỡ ở vòng trước */ }
  }
}

/** Xóa nội dung, GIỮ định dạng. Chỉ đi qua dòng đã tồn tại để không phình file thêm 2000 dòng rỗng. */
function xoaVung(ws, v) {
  let xoa = 0;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < v.r1 || r > v.r2) return;
    for (let c = v.c1; c <= v.c2; c++) {
      const cell = row.getCell(c);
      if (cell.value == null) continue;
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
      cell.value = null; xoa++;
    }
  });
  return xoa;
}

/**
 * Ô nguồn → dạng ghi được ở ô đích (gỡ công thức chia sẻ, dời `ref` của array formula).
 * `tuDong`/`denDong` khác nhau thì DỊCH công thức theo số dòng đã dồn — bắt buộc khi xóa hẳn dòng.
 */
function giaTriDeChep(nguon, diaChiMoi, tuDong, denDong) {
  const v = nguon.value;
  if (v && typeof v === 'object' && (v.formula != null || v.sharedFormula != null)) {
    let text = String(nguon.formula || v.formula || '');
    if (tuDong != null && denDong != null) text = dichCT(text, tuDong, denDong);
    return v.shareType === 'array' ? { formula: text, ref: diaChiMoi, shareType: 'array' } : { formula: text };
  }
  return v === undefined ? null : v;
}

/**
 * XÓA HẲN `n` dòng từ dòng `r1` — mọi dòng dưới DỒN LÊN, y như `deleteRows` của Google Sheets.
 * Đây là thao tác giữ được công thức từng dòng của chủ shop: dòng 801 dồn lên thành dòng 4 và
 * mang theo đúng công thức của nó, thay vì bị xóa trắng như khi xóa nội dung vùng `A4:O2000`.
 *
 * KHÔNG dùng `ws.spliceRows` của ExcelJS: nó dời ô nhưng **không dịch công thức**, nên dòng 900
 * mang `MATCH($D900;…)` dồn lên dòng 4 mà vẫn trỏ `$D900` — sai lặng, không ai thấy.
 *
 * KHÁC BIỆT CÓ CHỦ Ý so với Google Sheets, phải biết khi đọc số:
 *  · Google co lại mọi vùng của sheet KHÁC đang trỏ vào vùng bị xóa
 *    (`Tổng xuất`!I4 `SUMIF('Shopee mall'!$M$4:$M$2000;…)` → `$M$4:$M$1500` sau khi xóa 500 dòng).
 *    Vỏ Excel ở đây KHÔNG co — nghĩa là số đo trên bản `.xlsx` là cận TRÊN của bản Google.
 *  · Dòng tổng `H3:L3` cũng bị Google co lại; tool ghi đè `SUM(x4:x2000)` ngay sau đó nên hòa.
 */
function xoaDong(ws, r1, n) {
  if (!(n > 0)) return 0;
  goCongThucChiaSe(ws);
  const maxR = ws.rowCount;
  const maxC = Math.max(ws.columnCount, 1);
  const gop = docGopO(ws);
  for (const m of gop) { try { ws.unMergeCells(m.text); } catch (e) { /* đã gỡ ở vòng trước */ } }

  for (let r = r1; r + n <= maxR; r++) {
    const nguon = ws.getRow(r + n), dich = ws.getRow(r);
    for (let c = 1; c <= maxC; c++) {
      const o1 = nguon.getCell(c), o2 = dich.getCell(c);
      o2.value = giaTriDeChep(o1, o2.address, r + n, r);
      o2.style = JSON.parse(JSON.stringify(o1.style || {}));
    }
    if (nguon.height != null) dich.height = nguon.height;
  }
  for (let r = Math.max(r1, maxR - n + 1); r <= maxR; r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= maxC; c++) row.getCell(c).value = null;
  }

  // Ô gộp: nằm trọn trong vùng xóa → bỏ hẳn; nằm dưới → dời lên `n` dòng; cắt ngang → cắt ngắn.
  const r2 = r1 + n - 1;
  for (const m of gop) {
    if (m.r1 >= r1 && m.r2 <= r2) continue;
    const a = m.r1 > r2 ? m.r1 - n : (m.r1 >= r1 ? r1 : m.r1);
    const b = m.r2 > r2 ? m.r2 - n : (m.r2 >= r1 ? r1 - 1 : m.r2);
    if (b < a || (a === b && m.c1 === m.c2)) continue;
    try { ws.mergeCells(a, m.c1, b, m.c2); } catch (e) { /* chồng lấn với ô gộp đã dựng */ }
  }
  return n;
}

/**
 * Chèn một cột trống trước cột `truoc` — dịch MỌI dòng, đúng như `insertColumnBefore` của Google Sheets.
 * Dịch cả ô gộp và độ rộng cột. Cột mới thừa hưởng định dạng của cột vừa bị đẩy sang phải,
 * để `Lợi nhuận`!D6:D16 giữ đúng định dạng tiền của khối tháng.
 *
 * Hệ quả cố ý: mọi ô nằm bên phải cột `truoc` đều dịch sang phải, kể cả ghi chú nháp ngoài bảng.
 */
function chenCot(ws, truoc) {
  goCongThucChiaSe(ws);
  const maxR = ws.rowCount;
  const maxC = ws.columnCount;
  const gop = docGopO(ws);
  for (const m of gop) { try { ws.unMergeCells(m.text); } catch (e) { } }

  for (let r = 1; r <= maxR; r++) {
    const row = ws.getRow(r);
    for (let c = maxC; c >= truoc; c--) {
      const nguon = row.getCell(c);
      const dich = row.getCell(c + 1);
      dich.value = giaTriDeChep(nguon, dich.address);
      dich.style = JSON.parse(JSON.stringify(nguon.style || {}));
    }
    const o = row.getCell(truoc);
    o.value = null;
    o.style = JSON.parse(JSON.stringify(row.getCell(truoc + 1).style || {}));
  }
  for (let c = maxC; c >= truoc; c--) {
    const w = ws.getColumn(c).width;
    ws.getColumn(c + 1).width = w;
  }
  for (const m of gop) {
    const c1 = m.c1 >= truoc ? m.c1 + 1 : m.c1;
    const c2 = m.c2 >= truoc ? m.c2 + 1 : m.c2;
    if (c1 === c2 && m.r1 === m.r2) continue;
    try { ws.mergeCells(m.r1, c1, m.r2, c2); } catch (e) { }
  }
}

// ---------------------------------------------------------------- TÍNH LẠI (BẪY 2)

const S_TON = 'Tổng tồn kho', S_NHAP = 'Tổng nhập', S_LN = 'Lợi nhuận', S_DN = 'Đơn ngoài', S_TIK = 'Tiktok';
const GIAN_HANG = ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'];

function soCua(v) {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (v == null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * Tính lại đúng chuỗi công thức của file tracking, cho các ô mà tám phép tự kiểm cần đọc.
 * ExcelJS không tính công thức, nên nếu không có hàm này thì mọi ô tool vừa ghi đều đọc ra 0
 * và phép K-2 sẽ so 0 với 140 triệu — hỏng ở chỗ không đáng.
 *
 * Chuỗi tính: gian hàng (SL, doanh thu) → `Tổng xuất` → `Tổng tồn kho` ← `Tổng nhập` → `Lợi nhuận`.
 * @returns { ghiDe: {sheet: {'r,c': value}}, so: {...} }
 */
function tinhLai(anh, lop) {
  const T = lop.TaoThangMoi, U = lop.Utils;
  const ghiDe = {};
  function dat(sheet, r, c, v) {
    if (!ghiDe[sheet]) ghiDe[sheet] = {};
    ghiDe[sheet][r + ',' + c] = v;
  }
  const ss = t => anh.sheets[t] || null;
  const gt = (s, r, c) => {
    if (!s) return null;
    const row = s.giaTriTinh[r - 1];
    return row && row[c - 1] != null ? row[c - 1] : null;
  };
  const val = (s, r, c) => {
    if (!s) return null;
    const row = s.giaTri[r - 1];
    return row && row[c - 1] != null ? row[c - 1] : null;
  };

  // 1) danh mục: tên viết tắt → { maHang, giaVon, dong }
  const ssTon = ss(S_TON);
  const dm = T.docDanhMuc(ssTon);
  const theoTen = {}, theoMa = {};
  dm.ds.forEach(m => { theoTen[U.chuanHoaChuoi(m.tenVietTat)] = m; theoMa[U.chuanHoaChuoi(m.maHang)] = m; });

  // 2) sheet gian hàng: dòng tổng H3..L3 và cột "Còn Nợ"; đồng thời gom số lượng xuất theo mã.
  const xuat = {};
  const tongGH = {};
  for (const ten of GIAN_HANG.concat([S_TIK])) {
    const s = ss(ten);
    if (!s) continue;
    const laTik = ten === S_TIK;
    const bc = laTik ? T.BO_CUC.TIKTOK : T.BO_CUC.CHUAN;
    const cSL = chiSoCot('G'), cTen = chiSoCot(bc.cotTenVietTat);
    const tong = {};
    bc.cotTong.forEach(ch => { tong[ch] = 0; });
    const n = Math.max(s.soDong || 0, s.giaTri.length);
    for (let r = 4; r <= n; r++) {
      const ten2 = val(s, r, cTen);
      if (U.laRong(ten2)) continue;
      const m = theoTen[U.chuanHoaChuoi(ten2)];
      if (m) xuat[U.chuanHoaChuoi(m.maHang)] = (xuat[U.chuanHoaChuoi(m.maHang)] || 0) + soCua(val(s, r, cSL));
      const H = soCua(val(s, r, chiSoCot('H'))), I = soCua(val(s, r, chiSoCot('I'))),
        J = soCua(val(s, r, chiSoCot('J'))), K = soCua(val(s, r, chiSoCot('K')));
      if (laTik) { tong.H += H; tong.I += I; tong.J += J; tong.K += H - I - J; }
      else { tong.H += H; tong.I += I; tong.J += J; tong.K += K; tong.L += H - I - J - K; }
    }
    // Tiktok bị BỎ QUA thì giữ nguyên kết quả Excel đã lưu, không tự tính đè.
    if (laTik && !T.coDonThat(s, bc)) { tongGH[ten] = { [bc.cotDoanhThu]: soCua(gt(s, 3, chiSoCot(bc.cotDoanhThu))) }; continue; }
    bc.cotTong.forEach(ch => dat(ten, 3, chiSoCot(ch), tong[ch]));
    const cCN = T.cotConNo(s, bc);
    if (cCN) dat(ten, 3, cCN, tong[bc.cotDoanhThu]);
    tongGH[ten] = tong;
  }

  // 3) `Đơn ngoài`: L3 = Σ(I−J) của dòng PHƯƠNG, M3 = Σ(I−J) của dòng OANH; xuất lấy cột H.
  const sDN = ss(S_DN);
  let dnL = 0, dnM = 0;
  if (sDN) {
    const n = Math.max(sDN.soDong || 0, sDN.giaTri.length);
    for (let r = 4; r <= n; r++) {
      const ten2 = val(sDN, r, chiSoCot(T.DON_NGOAI.cotTenVietTat));
      if (U.laRong(ten2)) continue;
      const m = theoTen[U.chuanHoaChuoi(ten2)];
      if (m) xuat[U.chuanHoaChuoi(m.maHang)] = (xuat[U.chuanHoaChuoi(m.maHang)] || 0) + soCua(val(sDN, r, chiSoCot(T.DON_NGOAI.cotSoLuong)));
      dnL += soCua(val(sDN, r, chiSoCot(T.DON_NGOAI.cotPhuong)));
      dnM += soCua(val(sDN, r, chiSoCot(T.DON_NGOAI.cotOanh)));
    }
    dat(S_DN, 3, chiSoCot('L'), dnL);
    dat(S_DN, 3, chiSoCot('M'), dnM);
  }

  // 4) `Tổng nhập`: G tra giá vốn theo D; I = H×G; I2 = ΣI. Đồng thời gom số nhập theo mã.
  const sNhap = ss(S_NHAP);
  const nhap = {};
  let I2 = 0;
  if (sNhap) {
    const n = Math.max(sNhap.soDong || 0, sNhap.giaTri.length);
    for (let r = 4; r <= n; r++) {
      const d = val(sNhap, r, chiSoCot('D'));
      if (U.laRong(d)) continue;
      const m = theoTen[U.chuanHoaChuoi(d)];
      const H = soCua(val(sNhap, r, chiSoCot('H')));
      const G = m ? soCua(m.giaVon) : soCua(gt(sNhap, r, chiSoCot('G')));
      const I = H * G;
      dat(S_NHAP, r, chiSoCot('G'), G);
      dat(S_NHAP, r, chiSoCot('I'), I);
      I2 += I;
      if (m) nhap[U.chuanHoaChuoi(m.maHang)] = (nhap[U.chuanHoaChuoi(m.maHang)] || 0) + H;
    }
    dat(S_NHAP, 2, chiSoCot('I'), I2);
  }

  // 5) `Tổng tồn kho`: I = SUMIF(Tổng nhập), J = SUMIF(Tổng xuất), H = I−J, K = H×G, K1 = ΣK.
  let K1 = 0;
  dm.ds.forEach(m => {
    const k = U.chuanHoaChuoi(m.maHang);
    const I = nhap[k] || 0, J = xuat[k] || 0, H = I - J, K = H * soCua(m.giaVon);
    dat(S_TON, m.dong, chiSoCot('I'), I);
    dat(S_TON, m.dong, chiSoCot('J'), J);
    dat(S_TON, m.dong, chiSoCot('H'), H);
    dat(S_TON, m.dong, chiSoCot('K'), K);
    K1 += K;
  });
  dat(S_TON, 1, chiSoCot('K'), K1);

  // 6) `Lợi nhuận` cột D.
  const sLN = ss(S_LN);
  if (sLN) {
    const cD = chiSoCot('D');
    const lay = (ten, ch) => (tongGH[ten] && tongGH[ten][ch] != null) ? tongGH[ten][ch] : 0;
    const D7 = lay(S_TIK, 'K') + lay('Shopee mall', 'L') + lay('Offood', 'L') + lay('Importmart', 'L') + dnL + dnM + lay('Babyiu', 'L');
    const D8 = K1, D12 = I2;
    let D11 = D12;
    for (let r = 13; r <= 16; r++) D11 += soCua(val(sLN, r, cD));
    const D9 = soCua(val(sLN, 9, cD)), D10 = soCua(val(sLN, 10, cD));
    dat(S_LN, 7, cD, D7); dat(S_LN, 8, cD, D8); dat(S_LN, 11, cD, D11); dat(S_LN, 12, cD, D12);
    dat(S_LN, 6, cD, D7 + D8 + D9 + D10 - D11);
  }

  return { ghiDe, so: { I2, K1, D7: (ghiDe[S_LN] || {})[7 + ',' + chiSoCot('D')] } };
}

/** Dán bảng giá trị tính lại vào ảnh chụp (chỉ đụng `giaTriTinh`). */
function apGhiDe(anh, ghiDe) {
  Object.keys(ghiDe).forEach(ten => {
    const s = anh.sheets[ten];
    if (!s) return;
    Object.keys(ghiDe[ten]).forEach(k => {
      const [r, c] = k.split(',').map(Number);
      while (s.giaTriTinh.length < r) s.giaTriTinh.push([]);
      if (!s.giaTriTinh[r - 1]) s.giaTriTinh[r - 1] = [];
      s.giaTriTinh[r - 1][c - 1] = ghiDe[ten][k];
    });
  });
  return anh;
}

// ---------------------------------------------------------------- luồng chính

/**
 * Khởi tạo một vỏ file tháng mới.
 * @param {Object} ts { fileCu, fileVo, fileRa, thangMoi, idFileCu, thoiDiem, im }
 */
async function khoiTaoThangMoi(ts) {
  const lop = ts.lop || napLoiTaoThangMoi();
  const noi = ts.im ? () => { } : (...a) => console.log(...a);

  const wbCu = await docFile(ts.fileCu);
  wbCu.eachSheet(ws => goCongThucChiaSe(ws));
  const anhCu = anhChupFile(wbCu, path.basename(ts.fileCu));

  const vo = new VoThangMoi(ts.fileVo, ts.fileRa);
  await vo.nap();
  const anhVo = vo.anhChup();

  const ke = lop.TaoThangMoi.lapKeHoach(anhCu, anhVo, {
    thangMoi: ts.thangMoi,
    idFileCu: ts.idFileCu || path.basename(ts.fileCu),
    thoiDiem: ts.thoiDiem || new Date(),
    dauPhanCach: ','        // Excel dùng dấu phẩy; bản Google Sheet giữ nguyên dấu `;` của tài liệu công thức
  });

  if (!ke.chay) {
    noi('\nDỪNG — không khởi tạo:');
    ke.lyDoDung.forEach(l => noi('  · ' + l));
    return { ke, dat: false, dung: true, tuKiem: null, raFile: null };
  }
  ke.thongBao.forEach(t => noi('  [tin] ' + t));
  ke.canhBao.forEach(t => noi('  [CẦN XEM] ' + t));

  // B1 — đặt cờ DANG_KHOI_TAO trước khi ghi ô nào
  vo.chay(ke.batDau);
  const batDauTu = ke.buoc.findIndex(b => b.ma === ke.tuBuoc);
  const buocChay = batDauTu < 0 ? [] : ke.buoc.slice(batDauTu);
  for (const b of buocChay) {
    if (b.mocTruoc) vo.chay(lop.TaoThangMoi.lapKeHoach ? mocBuoc(lop, b.mocTruoc, ke, ts) : []);
    const dem = vo.chay(b.thaoTac);
    vo.chay(mocBuoc(lop, b.mocSau, ke, ts));
    noi('  ' + b.ma + ' · ' + b.ten + ' → ' + Object.keys(dem).map(k => k + '×' + dem[k]).join(', '));
  }
  await vo.luu();

  // B8 — đọc lại file kết quả, tính lại, chạy tám phép
  const wbSau = await docFile(ts.fileRa);
  const anhSau = anhChupFile(wbSau, path.basename(ts.fileRa));
  const tl = tinhLai(anhSau, lop);
  apGhiDe(anhSau, tl.ghiDe);
  const kiem = lop.TaoThangMoi.tuKiem(anhCu, anhSau, ke);

  if (kiem.dat) {
    // Chỉ khi CẢ TÁM phép đạt mới đánh dấu hoàn tất.
    const vo2 = new VoThangMoi(ts.fileRa, ts.fileRa + '.tmp');
    await vo2.nap();
    vo2.chay(mocTrangThai(lop, 'DA_KHOI_TAO_' + ke.nhanThoiDiem, ke, ts));
    await vo2.luu();
    fs.renameSync(ts.fileRa + '.tmp', ts.fileRa);
  }
  return { ke, kiem, dat: kiem.dat, dung: false, raFile: ts.fileRa, tinhLai: tl.so, anhSau };
}

/** Ghi cờ `BUOC_DA_XONG` (ô `Mapping_san_pham`!O5). */
function mocBuoc(lop, moc, ke, ts) {
  return [{ loai: 'GHI_O', sheet: lop.TaoThangMoi.TEN_SHEET_MAPPING, r: 5, c: chiSoCot('O'), gt: moc }];
}

/** Ghi cờ `TRANG_THAI_KHOI_TAO` (ô `Mapping_san_pham`!O1). */
function mocTrangThai(lop, tt) {
  return [{ loai: 'GHI_O', sheet: lop.TaoThangMoi.TEN_SHEET_MAPPING, r: 1, c: chiSoCot('O'), gt: tt }];
}

// ---------------------------------------------------------------- CLI

function inBangKiem(kiem) {
  console.log('\n| Phép | Nội dung | Số thật | |');
  console.log('|---|---|---|---|');
  kiem.phep.forEach(p => console.log('| ' + p.ma + ' | ' + p.ten + ' | ' + p.chiTiet + ' | ' + (p.dat ? 'ĐẠT' : 'LỆCH') + ' |'));
}

async function main() {
  const args = process.argv.slice(2);
  const ts = (t, mac) => { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : mac; };
  const fileCu = ts('--cu'), fileVo = ts('--moi'), fileRa = ts('--ra'), thang = ts('--thang');
  if (!fileCu || !fileVo || !fileRa || !thang) {
    console.log('Dùng: node node/tao-thang-moi.js --cu <tháng cũ.xlsx> --moi <vỏ tháng mới.xlsx> --ra <kết quả.xlsx> --thang YYYY-MM');
    process.exit(2);
  }
  console.log('KHỞI TẠO FILE THÁNG MỚI — ' + thang);
  console.log('  tháng cũ   : ' + path.resolve(fileCu));
  console.log('  vỏ tháng mới: ' + path.resolve(fileVo));
  const kq = await khoiTaoThangMoi({ fileCu: path.resolve(fileCu), fileVo: path.resolve(fileVo), fileRa: path.resolve(fileRa), thangMoi: thang, idFileCu: ts('--id-cu') });
  if (kq.dung) process.exit(1);
  inBangKiem(kq.kiem);
  console.log('\nKết quả: ' + kq.raFile);
  console.log(kq.dat
    ? '=> TÁM PHÉP ĐẠT — đã ghi DA_KHOI_TAO_' + kq.ke.nhanThoiDiem
    : '=> ' + kq.kiem.soLech + ' PHÉP LỆCH — GIỮ cờ DANG_KHOI_TAO, không đánh dấu hoàn tất');
  const nk = ts('--nhat-ky');
  if (nk) {
    fs.mkdirSync(path.dirname(path.resolve(nk)), { recursive: true });
    fs.writeFileSync(path.resolve(nk), JSON.stringify({ thang, phep: kq.kiem.phep, canhBao: kq.ke.canhBao, thongBao: kq.ke.thongBao }, null, 2), 'utf8');
    console.log('Nhật ký: ' + path.resolve(nk));
  }
  if (!kq.dat) process.exit(1);
}

module.exports = {
  napLoiTaoThangMoi, khoiTaoThangMoi, VoThangMoi, anhChupFile, anhChupSheet, docFile,
  tinhLai, apGhiDe, goCongThucChiaSe, chenCot, boGop, xoaVung, xoaDong, dichCT,
  inBangKiem, chuCot, chiSoCot, congThucCua, giaTriThuan, ketQuaDaTinh
};

if (require.main === module) main().catch(e => { console.error('\nLỖI: ' + e.message + '\n' + e.stack); process.exit(1); });
