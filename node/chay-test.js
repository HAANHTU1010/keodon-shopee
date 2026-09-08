/**
 * chay-test.js — chạy toàn bộ test:
 *   1. src/tests/TestSuite.gs  — test lõi thuần logic (trong bộ nhớ, chạy được cả trong trình soạn Apps Script)
 *   2. node/test-node.js       — test cần file .xlsx thật (ExcelJS/SheetJS/JSZip): key-in vào file tracking,
 *                                gộp ô, ArrayFormula, sheet Mapping, vùng vận hành 03_VAN_HANH
 *   3. FR-21                   — lớp 2/3 không được biết tên sàn hay tên cột file xuất
 * Thoát mã 1 nếu có test hỏng hoặc vi phạm FR-21.
 */
const fs = require('fs');
const path = require('path');
const { napLoi, SRC } = require('./nap-loi');

/** Lớp 2 (gom đơn, Mapping, danh mục) + lớp 3 (lập kế hoạch ghi) + luồng chính — không file nào được biết file xuất. */
const FILE_LOP_2_3 = ['Normalize.gs', 'MapListing.gs', 'KeyIn.gs', 'DanhMuc.gs', 'Main.gs'];
const TEN_SAN = ['shopee', 'tiktok', 'lazada', 'kiotviet'];

/**
 * Tách mã nguồn .gs thành: phần CODE (đã bỏ chú thích, giữ nguyên số dòng) + danh sách chuỗi có kèm số dòng.
 * Chú thích là tài liệu nghiệp vụ (v2 giải thích cột `Giá ưu đãi`, `Số lượng`… ngay tại chỗ) chứ không phải
 * phụ thuộc mã — FR-21 chỉ rà phần chạy được.
 */
function tachMa(src) {
  let code = '', i = 0;
  const chuoi = [];
  const n = src.length;
  const dong = (vt) => src.slice(0, vt).split('\n').length;
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (c === '/' && c2 === '/') {                       // chú thích một dòng
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && c2 === '*') {                       // chú thích khối — giữ lại xuống dòng cho khớp số dòng
      const dau = i;
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      code += src.slice(dau, i).replace(/[^\n]/g, '');
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {           // chuỗi
      const q = c, vt = i;
      let s = '';
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { s += src[i + 1]; i += 2; } else { s += src[i]; i++; }
      }
      i++;
      chuoi.push({ text: s, dong: dong(vt) });
      code += q + s + q;
      continue;
    }
    code += c; i++;
  }
  return { code, chuoi };
}

const chuanTen = (s) => String(s).normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * FR-21: chỉ `src/adapters/AdapterFileXuat.gs` được biết định dạng file xuất của sàn.
 * Hai điều cấm ở lớp 2/3 (rà trên phần chạy được, không rà chú thích):
 *   a. chuỗi trùng NGUYÊN VĂN một tên cột file xuất (`cfg.cot`) — đó là cách duy nhất đọc được ô của file xuất;
 *   b. tên sàn (shopee/tiktok/lazada/kiotviet).
 * Ngoại lệ của (b): từ vựng của CHÍNH file tracking khai ở `src/Schema.gs` (`Mapping sản phẩm` có cột
 * `Tên trên Shopee` do chủ dự án đặt) — đó là tên cột sheet của chủ dự án, không phải tên cột file xuất.
 */
function raFR21(lop) {
  const cfg = lop.CaiDat.cauHinhMacDinh();
  const tenCotFileXuat = [];
  Object.keys(cfg.cot).forEach((t) => (cfg.cot[t] || []).forEach((c) => tenCotFileXuat.push(String(c))));
  const cotChuan = new Set(tenCotFileXuat.map(chuanTen));

  let tuVungTracking = [].concat(
    lop.SCHEMA.MAPPING, lop.SCHEMA.MAPPING_COT_NGUOI, [lop.SCHEMA.MAPPING_COT_LO_PHU],
    [lop.TEN_SHEET_MAPPING_EXCEL], [lop.TEN_TAB_MAPPING_SHEET]
  );
  Object.keys(lop.SCHEMA.MAPPING_BI_DANH).forEach((k) => { tuVungTracking = tuVungTracking.concat(lop.SCHEMA.MAPPING_BI_DANH[k]); });
  tuVungTracking = [...new Set(tuVungTracking.map(String))].sort((a, b) => b.length - a.length);

  const viPham = [];
  for (const f of FILE_LOP_2_3) {
    const { code, chuoi } = tachMa(fs.readFileSync(path.join(SRC, f), 'utf8'));
    chuoi.forEach((s) => {
      if (cotChuan.has(chuanTen(s.text))) viPham.push(`${f}:${s.dong} — chuỗi "${s.text}" là TÊN CỘT FILE XUẤT (chỉ AdapterFileXuat được biết)`);
    });
    // bỏ từ vựng của file tracking rồi mới tìm tên sàn
    let con = code.normalize('NFC');
    tuVungTracking.forEach((t) => { con = con.split(t).join(' ').split(t.toLowerCase()).join(' '); });
    const dongCode = con.split('\n');
    dongCode.forEach((d, i) => {
      const low = d.toLowerCase();
      TEN_SAN.forEach((s) => { if (low.includes(s)) viPham.push(`${f}:${i + 1} — nhắc TÊN SÀN "${s}": ${d.trim().slice(0, 100)}`); });
    });
  }
  return { viPham, soCot: tenCotFileXuat.length };
}

async function main() {
  const lop = napLoi();
  let hong = 0, boQua = 0, dat = 0;
  const in1 = (r) => {
    const tt = r.dat ? 'ĐẠT   ' : r.boQua ? 'BỎ QUA' : 'HỎNG  ';
    if (r.dat) dat++; else if (r.boQua) boQua++; else hong++;
    console.log(`${tt} ${r.ma} ${r.ten}${r.loi ? '\n        → ' + r.loi : ''}${r.ghiChu ? '\n        · ' + r.ghiChu : ''}`);
  };

  console.log(`=== LÕI (src/tests/TestSuite.gs) — ${lop.TestSuite.DANH_SACH.length} test thuần logic, chạy được cả trong Apps Script ===`);
  lop.TestSuite.chayTatCa().forEach(in1);

  const { chayTatCa, TESTS } = require('./test-node');
  console.log(`\n=== NODE (node/test-node.js) — ${TESTS.length} test trên file .xlsx thật, ExcelJS ===`);
  (await chayTatCa()).forEach(in1);

  console.log(`\n=== FR-21: rà ${FILE_LOP_2_3.length} file lớp 2/3 (${FILE_LOP_2_3.join(', ')}) ===`);
  const fr21 = raFR21(lop);
  fr21.viPham.forEach((v) => console.log('VI PHẠM ' + v));
  console.log(fr21.viPham.length === 0
    ? `ĐẠT    lớp 2/3 không chứa tên sàn hay ${fr21.soCot} tên cột file xuất`
    : `HỎNG   ${fr21.viPham.length} vi phạm`);

  console.log(`\nTổng: ${dat} đạt · ${boQua} bỏ qua · ${hong} hỏng · FR-21 ${fr21.viPham.length === 0 ? 'đạt' : 'hỏng'}`);
  process.exit(hong > 0 || fr21.viPham.length > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
