/**
 * test-tao-thang-moi.js — BỘ NGHIỆM THU 12 CHỈ TIÊU N-1…N-12 của tính năng "tạo file tháng mới"
 * (`01_TAI_LIEU/DAC_TA_TAO_FILE_THANG_MOI.md` mục 9.2), chạy được bằng một lệnh và tự chấm.
 *
 *   node node/test-tao-thang-moi.js [--thu-muc <thư mục tạm>]
 *
 * Cách dựng bộ đề, đúng mục 9.1 của đặc tả:
 *   1. Nhân bản file tháng 8 THẬT thành một vỏ tháng 9 rỗng — "dọn tay như chủ dự án vẫn làm":
 *      bỏ ô gộp và xóa GIÁ TRỊ GÕ TAY ở vùng đơn, GIỮ NGUYÊN công thức từng dòng.
 *   2. Chạy tool với `id_file_cu` = tháng 8 thật, `id_file_moi` = vỏ vừa dựng.
 *   3. So kết quả với `THANG-9-2026-KINH-DOANH_DA_SUA_CONG_THUC.xlsx` (bản nhân viên làm tay).
 * KHÔNG file nào trong `00_DAU_VAO` bị ghi — vỏ và kết quả đều nằm trong thư mục tạm.
 *
 * === VÌ SAO N-10 ĐƯỢC VIẾT LẠI ===
 * Bản cũ khẳng định *"`E4`,`F4`,`M4`,`N4` là ARRAYFORMULA"* — tức **đúng một ô mỗi cột**.
 * Chỉ tiêu đó mã hóa luôn một giả định sai, nên tool ghi một ô ARRAYFORMULA và chỉ tiêu vẫn ĐẠT,
 * trong khi file sinh ra mất sạch công thức từ dòng 5 xuống. Số đo cùng ngày:
 *
 *   | Cột | Tháng 9 THẬT (`Shopee mall`) | Tháng 9 do bản cũ sinh ra |
 *   | E   | 414 ô, dòng 4→417            | 1 ô, dòng 4               |
 *   | F   | 415 ô, dòng 4→418            | 1 ô, dòng 4               |
 *   | M   | 399 ô, dòng 4→402            | 1 ô, dòng 4               |
 *   | N   | 399 ô, dòng 4→402            | 1 ô, dòng 4               |
 *
 * Bản mới đo đúng thứ quan trọng: **số dòng có công thức DÙNG ĐƯỢC ở mỗi cột, và dòng cuối cùng
 * còn công thức** — chi tiết ba vế ở `kiemN10()`. Đây KHÔNG phải nới test: bản cũ chỉ cần 1 ô là
 * qua, bản mới bắt tool chứng minh nó **không đánh rơi một ô công thức nào** ngoài đúng số dòng
 * đã xóa, trên cả 16 cột của 4 sheet. Bài `doiChungAm()` dựng lại đúng file lỗi cũ và bắt N-10
 * mới phải KÊU — nếu không kêu thì bài test này cũng vô dụng như bản cũ.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const { khoiTaoThangMoi, napLoiTaoThangMoi, docFile, anhChupFile, chiSoCot, chuCot, goCongThucChiaSe, congThucCua, giaTriThuan } = require('./tao-thang-moi');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const FILE_CU = path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');
const FILE_TAY = path.join(DAU_VAO, 'THANG-9-2026-KINH-DOANH_DA_SUA_CONG_THUC.xlsx');

const args = process.argv.slice(2);
function thamSo(t, mac) { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : mac; }
const TMP = path.resolve(thamSo('--thu-muc', process.env.THU_MUC_TAM || path.join(os.tmpdir(), 'test-tao-thang-moi')));

const GIAN_HANG = ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'];
const COT_CT = ['E', 'F', 'M', 'N'];
/**
 * SÀN của N-10: mỗi cột công thức phải còn ít nhất ngần này dòng dùng được.
 * Vì sao 100 chứ không phải 300 (con số BA nêu ở `05_GIAO_VIEC_DEV_v2.4.md` mục 4):
 *   300 là ngưỡng "đủ chỗ cho một tháng bán hàng" — thứ **tool không tạo ra được**, vì tool không
 *   tự viết công thức. Vùng công thức dài bao nhiêu là do chủ shop kéo tay tới đâu: đo tháng 8,
 *   `Importmart` chỉ có 169 ô mỗi cột, `Babyiu` 302 ô. Bắt tool phải ra 300 dòng là bắt nó đi bịa
 *   công thức — đúng thứ vừa gây ra lỗi này.
 *   Việc "vùng còn đủ chỗ cho tháng tới không" là một CẢNH BÁO (lớp cảnh báo vùng công thức),
 *   không phải điều kiện đạt của N-10. N-10 chấm cái tool chịu trách nhiệm: **không làm mất ô nào
 *   ngoài số dòng đã xóa**, và **không bao giờ để một cột tụt về một-hai ô** như bản cũ (1 ô).
 */
const SAN_DONG_CT = 100;

// ---------------------------------------------------------------- đo

/** Số ô công thức của một cột từ dòng 4 xuống, và dòng cuối cùng còn công thức. */
function demCongThuc(ws, chu) {
  const c = chiSoCot(chu);
  let soO = 0, dongDau = 0, dongCuoi = 0, mau = null;
  ws.eachRow({ includeEmpty: false }, (row, r) => {
    if (r < 4) return;
    const cell = row.getCell(c);
    const f = congThucCua(cell);
    if (!f) return;
    soO++; if (!dongDau) dongDau = r; dongCuoi = r;
    if (mau == null) mau = f.text;
  });
  return { soO, dongDau, dongCuoi, mau };
}

/** Bảng đếm cho 4 sheet gian hàng của một file. */
async function bangDem(duongDan) {
  const wb = await docFile(duongDan);
  const ra = {};
  for (const ten of GIAN_HANG) {
    const ws = wb.getWorksheet(ten);
    if (!ws) continue;
    ra[ten] = {};
    for (const chu of COT_CT) ra[ten][chu] = demCongThuc(ws, chu);
  }
  return ra;
}

function inBangDem(nhan, bang) {
  console.log('\n' + nhan);
  console.log('| Sheet | ' + COT_CT.map(c => 'cột ' + c).join(' | ') + ' |');
  console.log('|---|' + COT_CT.map(() => '---|').join(''));
  for (const ten of Object.keys(bang)) {
    console.log('| ' + ten + ' | ' + COT_CT.map(c => {
      const d = bang[ten][c];
      return d.soO ? `${d.soO} ô (${d.dongDau}→${d.dongCuoi})` : '**0 ô**';
    }).join(' | ') + ' |');
  }
}

// ---------------------------------------------------------------- dựng vỏ

/**
 * Dựng vỏ tháng mới từ file tháng cũ — mô phỏng đúng thao tác tay của chủ dự án khi tạo vỏ rỗng:
 * bỏ ô gộp và xóa GIÁ TRỊ gõ tay, **không đụng công thức**. Vỏ phải qua được cả 5 phép R-1…R-5.
 * @param {boolean} giuDon true → GIỮ NGUYÊN đơn tháng cũ (vỏ là bản nhân bản thô, dùng cho kịch bản X)
 */
async function dungVo(fileCu, fileRa, giuDon) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fileCu);
  wb.eachSheet(ws => goCongThucChiaSe(ws));

  const xoaGiaTri = (ten, r1, c1, r2, c2) => {
    const ws = wb.getWorksheet(ten);
    if (!ws) return;
    for (const s of (ws.model.merges || []).slice()) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(s);
      if (!m) continue;
      if (+m[4] < r1 || +m[2] > r2) continue;
      try { ws.unMergeCells(s); } catch (e) { /* đã gỡ */ }
    }
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      if (r < r1 || r > r2) return;
      for (let c = c1; c <= c2; c++) {
        const cell = row.getCell(c);
        if (cell.value == null) continue;
        if (congThucCua(cell)) continue;                 // GIỮ công thức — đây là điểm mấu chốt
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) continue;
        cell.value = null;
      }
    });
  };

  if (!giuDon) {
    GIAN_HANG.concat(['Đơn ngoài']).forEach(t => xoaGiaTri(t, 4, 1, 2000, chiSoCot('O')));
    xoaGiaTri('Tổng nhập', 4, 1, 2000, chiSoCot('L'));
    xoaGiaTri('Lợi nhuận', 6, chiSoCot('D'), 16, chiSoCot('D'));
  }
  fs.mkdirSync(path.dirname(fileRa), { recursive: true });
  await wb.xlsx.writeFile(fileRa);
  return fileRa;
}

/** Gắn sheet `Mapping_san_pham` với cờ `DANG_KHOI_TAO_` — dùng để chạy kịch bản "chạy tiếp sau khi đứt". */
async function gonCoDangLam(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  wb.eachSheet(ws => goCongThucChiaSe(ws));
  const ws = wb.getWorksheet('Mapping_san_pham') || wb.addWorksheet('Mapping_san_pham');
  ws.getCell('N1').value = 'TRANG_THAI_KHOI_TAO';
  ws.getCell('O1').value = 'DANG_KHOI_TAO_2026-10-01 08:00';
  await wb.xlsx.writeFile(file);
}

// ---------------------------------------------------------------- đọc file kết quả

function docO(anh, sheet, r, chu) {
  const s = anh.sheets[sheet];
  if (!s) return null;
  const c = chiSoCot(chu) - 1;
  const row = s.giaTriTinh[r - 1];
  return row && row[c] != null ? row[c] : null;
}
function docCT(anh, sheet, r, chu) {
  const s = anh.sheets[sheet];
  if (!s) return null;
  const row = s.congThuc[r - 1];
  return row && row[chiSoCot(chu) - 1] != null ? row[chiSoCot(chu) - 1] : null;
}
function docGiaTri(anh, sheet, r, chu) {
  const s = anh.sheets[sheet];
  if (!s) return null;
  const row = s.giaTri[r - 1];
  return row && row[chiSoCot(chu) - 1] != null ? row[chiSoCot(chu) - 1] : null;
}
function so(v) { const n = Number(v); return isNaN(n) ? null : n; }
function vn(n) { return Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }); }

// ---------------------------------------------------------------- N-10 (bản viết lại)

/**
 * Chỉ tiêu N-10 mới. Ba vế, cả ba đều là số đo, không vế nào nói "là ARRAYFORMULA":
 *
 *  (a) `H3:L3` đúng `SUM(x4:x2000)` và không còn dòng đơn nào từ `A4`  — giữ nguyên vế cũ.
 *  (b) BẢO TOÀN: với mỗi cột E, F, M, N, `số ô công thức SAU == số ô TRƯỚC − số dòng tool đã xóa`.
 *      Sai số cho phép: 0 ô. Đây là vế thay cho "E4/F4/M4/N4 là ARRAYFORMULA" và nó CHẶT HƠN HẲN:
 *      bản cũ chỉ cần 1 ô là ĐẠT; bản này bắt tool chứng minh nó không đánh rơi một ô nào của chủ shop.
 *      Bản lỗi (909 ô → 1 ô mà không xóa dòng nào) trượt vế này ở cả 16 cột.
 *  (c) SÀN: mỗi cột còn ≥ SAN_DONG_CT ô và dòng cuối ≥ 3 + SAN_DONG_CT — chặn cả trường hợp
 *      vùng công thức tụt về một-hai dòng vì bất kỳ lý do nào khác.
 *
 * Số của bản chủ shop làm tay (`THANG-9-2026...`) được IN ra để đối chiếu, nhưng KHÔNG dùng để
 * chấm: file tháng 8 hôm nay đã có thêm đơn so với lúc bản tay được tạo, so trực tiếp là so lệch mốc.
 */
function kiemN10(anhSau, demTruoc, demSau, demThat, vungCongThuc) {
  const lop = napLoiTaoThangMoi();
  const chiTiet = []; let dat = true;
  for (const ten of GIAN_HANG) {
    const tong = ['H', 'I', 'J', 'K', 'L'].filter(ch => {
      const t = docCT(anhSau, ten, 3, ch);
      return t && t.replace(/\s/g, '').toUpperCase() === `SUM(${ch}4:${ch}2000)`;
    });
    const conDon = lop.TaoThangMoi.quetDuLieu(anhSau.sheets[ten], 4, 1, 2000, chiSoCot('O')).soO;
    const dCuoi = ((vungCongThuc || {})[ten] || {}).dongCuoiDon || 0;
    const daXoa = dCuoi >= 4 ? dCuoi - 3 : 0;
    const loi = [];
    const moTa = COT_CT.map(ch => {
      const a = demTruoc[ten][ch], b = demSau[ten][ch], t = demThat[ten] ? demThat[ten][ch] : null;
      const mong = Math.max(0, a.soO - daXoa);
      if (b.soO !== mong) loi.push(`${ch} bảo toàn: ${b.soO} ≠ ${a.soO}−${daXoa}=${mong}`);
      if (b.soO < SAN_DONG_CT || b.dongCuoi < 3 + SAN_DONG_CT) loi.push(`${ch} dưới sàn: ${b.soO} ô, cuối ${b.dongCuoi}`);
      return `${ch} ${a.soO}→${b.soO} ô (cuối ${b.dongCuoi}${t ? `, tay ${t.soO}/${t.dongCuoi}` : ''})`;
    });
    if (tong.length !== 5) loi.push(`dòng tổng ${tong.length}/5`);
    if (conDon !== 0) loi.push(`còn ${conDon} ô đơn`);
    if (loi.length) dat = false;
    chiTiet.push(`${ten}[xóa ${daXoa} dòng] ${moTa.join(' · ')}${loi.length ? ' ✗ ' + loi.join('; ') : ''}`);
  }
  return { dat, chiTiet: chiTiet.join('  ‖  ') };
}

// ---------------------------------------------------------------- 12 chỉ tiêu

async function chayNghiemThu() {
  fs.mkdirSync(TMP, { recursive: true });
  const fileVo = path.join(TMP, 'T9_VO_RONG.xlsx');
  const fileRa = path.join(TMP, 'T9_TOOL_SINH.xlsx');

  console.log('NGHIỆM THU TẠO FILE THÁNG MỚI — 12 chỉ tiêu N-1…N-12 (DAC_TA mục 9.2)');
  console.log('  tháng cũ  : ' + FILE_CU);
  console.log('  thư mục tạm: ' + TMP);

  const demThat = await bangDem(FILE_TAY);
  await dungVo(FILE_CU, fileVo, false);
  const demVo = await bangDem(fileVo);

  const kq = await khoiTaoThangMoi({
    fileCu: FILE_CU, fileVo: fileVo, fileRa: fileRa,
    thangMoi: '2026-09', idFileCu: path.basename(FILE_CU),
    thoiDiem: new Date(2026, 8, 8, 9, 0, 0), im: true
  });
  if (kq.dung) {
    console.log('\nDỪNG — tool không chịu khởi tạo vỏ:');
    kq.ke.lyDoDung.forEach(l => console.log('  · ' + l));
    process.exit(1);
  }
  const demSinh = await bangDem(fileRa);

  const anhCu = anhChupFile(await (async () => { const w = await docFile(FILE_CU); w.eachSheet(ws => goCongThucChiaSe(ws)); return w; })(), 'cu');
  const anhSau = kq.anhSau;
  const dm = kq.ke.doc.danhMuc;
  const khoi = kq.kiem.khoiDauKy;

  const phep = [];
  const them = (ma, ten, dat, so) => phep.push({ ma, ten, dat: !!dat, so });

  // N-1 — số dòng khối nhập đầu kỳ
  them('N-1', 'Số dòng khối nhập đầu kỳ ở `Tổng nhập`', khoi.ds.length === 76,
    `tool ${khoi.ds.length} dòng · bản tay 75 · danh mục tháng 8 có ${dm.length} mã`);

  // N-2 — tồn đầu kỳ từng mã
  const theoTen = {};
  khoi.ds.forEach(d => { theoTen[d.tenVietTat.trim().toLowerCase()] = d.ton; });
  let khop = 0; const lech2 = [];
  dm.forEach(m => {
    const v = theoTen[String(m.tenVietTat).trim().toLowerCase()];
    if (v != null && Math.abs(v - m.ton) < 1e-9) khop++;
    else lech2.push(m.tenVietTat + ': ' + v + ' ≠ ' + m.ton);
  });
  them('N-2', 'Tồn đầu kỳ từng mã khớp `Tổng tồn kho`!H tháng 8', khop === dm.length,
    `${khop}/${dm.length} mã khớp` + (lech2.length ? ' · lệch: ' + lech2.slice(0, 3).join(' · ') : ''));

  // N-3 — giá trị khối đầu kỳ
  const moc = kq.ke.doc.giaTriTonCuoi;
  const d3 = khoi.tongI - moc;
  them('N-3', 'SUM(I4:I' + (3 + khoi.ds.length) + ') == `Tổng tồn kho`!K1 tháng 8', Math.abs(d3) < 1,
    `${vn(khoi.tongI)} vs ${vn(moc)} · lệch ${d3.toFixed(4)} đ (ngưỡng < 1 đ)`);

  // N-4 — Ngày nhập trống 100%
  them('N-4', 'Cột `Ngày nhập` của khối đầu kỳ trống 100%', khoi.dongCoNgay.length === 0,
    `${khoi.dongCoNgay.length} ô có ngày`);

  // N-5 — danh sách sheet
  const sCu = anhCu.tenSheet, sMoi = anhSau.tenSheet;
  const themSheet = sMoi.filter(t => sCu.indexOf(t) < 0);
  const thieuSheet = sCu.filter(t => sMoi.indexOf(t) < 0);
  them('N-5', 'Danh sách sheet = tháng cũ + đúng một `Mapping_san_pham`',
    thieuSheet.length === 0 && themSheet.length === 1 && themSheet[0] === 'Mapping_san_pham',
    `${sCu.length} → ${sMoi.length} sheet · thêm [${themSheet.join(', ')}] · thiếu [${thieuSheet.join(', ')}]`);

  // N-6 — Lợi nhuận dòng 5
  const dong5 = [];
  for (let c = chiSoCot('D'); c <= chiSoCot('L'); c++) dong5.push(so(docO(anhSau, 'Lợi nhuận', 5, chuCot(c))));
  const mong5 = [9, 8, 7, 6, 5, 4, 3, 2, 1];
  them('N-6', '`Lợi nhuận` dòng 5 = 9,8,7,6,5,4,3,2,1', dong5.join(',') === mong5.join(','), dong5.join(','));

  // N-7 — ô gộp năm dòng 4
  const gop4 = (anhSau.sheets['Lợi nhuận'].gopO || []).filter(g => g.r1 === 4 && g.r2 === 4 && g.c1 === chiSoCot('D'));
  const gopText = gop4.length ? gop4.map(g => 'D4:' + chuCot(g.c2) + '4').join(',') : '(không có)';
  them('N-7', '`Lợi nhuận` ô gộp năm dòng 4 = D4:L4', gopText === 'D4:L4', gopText);

  // N-8 — cột E dòng 6→16 là giá trị cứng, bằng cột D tháng 8
  let dat8 = 0; const lech8 = [];
  for (let r = 6; r <= 16; r++) {
    const conCT = docCT(anhSau, 'Lợi nhuận', r, 'E') != null;
    const a = so(kq.ke.doc.loiNhuanCu.dong6den16[r - 6]);
    const b = so(docO(anhSau, 'Lợi nhuận', r, 'E'));
    if (!conCT && ((a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 0.01))) dat8++;
    else lech8.push('E' + r + (conCT ? ' còn công thức' : `: ${b} ≠ ${a}`));
  }
  them('N-8', '`Lợi nhuận` cột E dòng 6→16 là giá trị cứng, bằng cột D tháng 8', dat8 === 11,
    `${dat8}/11 dòng` + (lech8.length ? ' · ' + lech8.join(' · ') : ''));

  // N-9 — năm công thức cột D, sáu ô phải trống
  const coCT = [6, 7, 8, 11, 12].filter(r => docCT(anhSau, 'Lợi nhuận', r, 'D') != null);
  const conSot = [9, 10, 13, 14, 15, 16].filter(r => {
    const v = docGiaTri(anhSau, 'Lợi nhuận', r, 'D');
    return !(v == null || v === '') || docCT(anhSau, 'Lợi nhuận', r, 'D') != null;
  });
  them('N-9', '5 công thức D6,D7,D8,D11,D12; D9,D10,D13…D16 trống', coCT.length === 5 && conSot.length === 0,
    `${coCT.length}/5 ô có công thức · ${conSot.length} ô phải-trống còn nội dung`);

  // N-10 (VIẾT LẠI) — vùng công thức từng dòng của 4 sheet gian hàng
  const kq10 = kiemN10(anhSau, demVo, demSinh, demThat, kq.ke.doc.vungCongThuc);
  them('N-10', 'Sheet gian hàng: `H3:L3` là `SUM(x4:x2000)` · không còn đơn từ `A4` · mỗi cột E/F/M/N ' +
    `BẢO TOÀN (số ô sau = số ô trước − số dòng đã xóa, sai số 0) và còn ≥ ${SAN_DONG_CT} dòng công thức, dòng cuối ≥ ${3 + SAN_DONG_CT}`,
    kq10.dat, kq10.chiTiet);

  // N-11 — không lỗi ở dòng tổng
  const oKiem = [['Shopee mall', 3, 'H'], ['Shopee mall', 3, 'L'], ['Offood', 3, 'L'], ['Importmart', 3, 'L'],
  ['Babyiu', 3, 'L'], ['Đơn ngoài', 3, 'L'], ['Đơn ngoài', 3, 'M'], ['Tiktok', 3, 'K'],
  ['Tổng nhập', 2, 'I'], ['Tổng tồn kho', 1, 'K'], ['Lợi nhuận', 6, 'D'], ['Lợi nhuận', 7, 'D'],
  ['Lợi nhuận', 8, 'D'], ['Lợi nhuận', 11, 'D'], ['Lợi nhuận', 12, 'D']];
  const loi11 = [];
  oKiem.forEach(x => {
    const v = docO(anhSau, x[0], x[1], x[2]);
    if (typeof v === 'string' && /^#/.test(v.trim())) loi11.push(`${x[0]}!${x[2]}${x[1]}=${v}`);
    else if (so(v) == null) loi11.push(`${x[0]}!${x[2]}${x[1]}=${v === null ? '(rỗng)' : '"' + v + '"'}`);
  });
  them('N-11', 'Không `#REF!`/`#N/A`/`#VALUE!`, mọi dòng tổng ra số', loi11.length === 0,
    loi11.length ? loi11.join(' · ') : `${oKiem.length}/${oKiem.length} ô sạch`);

  // N-12 — Mapping_san_pham
  const lop = napLoiTaoThangMoi();
  const mapCu = kq.ke.doc.mapping ? lop.TaoThangMoi.demDongMapping(kq.ke.doc.mapping.bang) : 0;
  const mapMoi = lop.TaoThangMoi.demDongMapping((lop.TaoThangMoi.docMapping(anhSau) || { bang: null }).bang);
  them('N-12', '`Mapping_san_pham` số dòng bằng đúng bản tháng 8', mapMoi === mapCu,
    `tháng mới ${mapMoi} dòng vs tháng 8 ${mapCu} dòng` + (mapCu === 0 ? ' (tháng 8 chưa có sheet này)' : ''));

  // ---- in bảng ----
  inBangDem('BẢNG ĐẾM Ô CÔNG THỨC — vỏ tháng mới TRƯỚC khi tool chạy', demVo);
  inBangDem('BẢNG ĐẾM Ô CÔNG THỨC — file tool SINH RA', demSinh);
  inBangDem('BẢNG ĐẾM Ô CÔNG THỨC — file tháng 9 THẬT (bản chủ shop làm tay)', demThat);

  console.log('\n| Mã | Chỉ tiêu | Số thật | |');
  console.log('|---|---|---|---|');
  phep.forEach(p => console.log(`| ${p.ma} | ${p.ten} | ${p.so} | ${p.dat ? 'ĐẠT' : 'LỆCH'} |`));

  console.log('\n| Phép tự kiểm | Nội dung | Số thật | |');
  console.log('|---|---|---|---|');
  kq.kiem.phep.forEach(p => console.log(`| ${p.ma} | ${p.ten} | ${p.chiTiet} | ${p.dat ? 'ĐẠT' : 'LỆCH'} |`));

  const hong = phep.filter(p => !p.dat);
  console.log(`\n=> ${phep.length - hong.length}/${phep.length} chỉ tiêu ĐẠT · ${kq.kiem.phep.filter(p => p.dat).length}/8 phép tự kiểm ĐẠT`);
  return { phep, hongN: hong.length, kq, demSinh, demThat, demVo };
}

// ---------------------------------------------------------------- kịch bản X: vỏ CÒN đơn tháng cũ

/**
 * Chứng minh cơ chế XÓA HẲN DÒNG chạy đúng: vỏ là bản nhân bản THÔ của tháng 8 (còn nguyên đơn),
 * cờ `DANG_KHOI_TAO_` để bỏ qua lớp 2 (đúng đường "chạy tiếp sau khi đứt" của mục 7.1).
 * Phải thấy: số ô công thức GIẢM đúng bằng số dòng đơn đã xóa, KHÔNG về 0, và công thức
 * còn lại đã được dịch dòng (dòng 4 mới trỏ vào dòng 4).
 */
async function kichBanConDon() {
  const fileVo = path.join(TMP, 'T9_VO_THO.xlsx');
  const fileRa = path.join(TMP, 'T9_TU_VO_THO.xlsx');
  await dungVo(FILE_CU, fileVo, true);
  await gonCoDangLam(fileVo);
  const truoc = await bangDem(fileVo);

  const kq = await khoiTaoThangMoi({
    fileCu: FILE_CU, fileVo: fileVo, fileRa: fileRa, thangMoi: '2026-09',
    idFileCu: path.basename(FILE_CU), thoiDiem: new Date(2026, 8, 8, 9, 0, 0), im: true
  });
  if (kq.dung) { console.log('\n[X] DỪNG: ' + kq.ke.lyDoDung.join(' · ')); return { dat: false }; }
  const sau = await bangDem(fileRa);

  const wb = await docFile(fileRa);
  const ws = wb.getWorksheet('Shopee mall');
  const mauMoi = String(ws.getCell('E4').formula || (ws.getCell('E4').value || {}).formula || '');
  const dungDong = /\$D4\b/.test(mauMoi);
  const demThat = await bangDem(FILE_TAY);
  const n10 = kiemN10(kq.anhSau, truoc, sau, demThat, kq.ke.doc.vungCongThuc);

  console.log('\n--- KỊCH BẢN X: vỏ CÒN nguyên đơn tháng 8 (đường chạy tiếp sau khi đứt, mục 7.1) ---');
  console.log('| Sheet | cột | trước | sau | dòng đơn đã xóa | tháng 9 làm tay |');
  console.log('|---|---|---|---|---|---|');
  for (const ten of GIAN_HANG) {
    const dxoa = (kq.ke.doc.vungCongThuc[ten] || {}).dongCuoiDon || 0;
    for (const ch of COT_CT) {
      const a = truoc[ten][ch], b = sau[ten][ch], t = demThat[ten][ch];
      console.log(`| ${ten} | ${ch} | ${a.soO} ô (4→${a.dongCuoi}) | ${b.soO} ô (${b.dongDau}→${b.dongCuoi}) | ${dxoa >= 4 ? dxoa - 3 : 0} | ${t.soO} ô (4→${t.dongCuoi}) |`);
    }
  }
  console.log('N-10 trên kịch bản X: ' + (n10.dat ? 'ĐẠT' : 'LỆCH') + ' · ' + n10.chiTiet);
  console.log('Công thức `Shopee mall`!E4 sau khi dồn: ' + mauMoi.slice(0, 90));
  console.log(`  → trỏ vào ĐÚNG dòng của chính nó ($D4): ${dungDong ? 'ĐÚNG' : 'SAI'}`);
  const dat = n10.dat && dungDong;
  console.log('=> Kịch bản X: ' + (dat ? 'ĐẠT' : 'HỎNG'));
  return { dat };
}

// ---------------------------------------------------------------- đối chứng âm

/**
 * ĐỐI CHỨNG ÂM — dựng lại đúng lỗi cũ trên file kết quả rồi bắt N-10 phải KÊU.
 * Lỗi cũ: xóa nội dung `A4:O2000` (mất công thức từng dòng) rồi ghi MỘT ARRAYFORMULA vào
 * `E4`,`F4`,`M4`,`N4`. Chỉ tiêu N-10 bản cũ khẳng định *"E4/F4/M4/N4 là ARRAYFORMULA"* nên
 * vẫn chấm ĐẠT. Nếu bản N-10 mới cũng chấm ĐẠT thì nó vô dụng y như bản cũ — bài này chặn điều đó.
 */
async function doiChungAm(demVo) {
  const nguon = path.join(TMP, 'T9_TOOL_SINH.xlsx');
  const hong = path.join(TMP, 'T9_LOI_CU.xlsx');
  const { VoThangMoi } = require('./tao-thang-moi');
  const vo = new VoThangMoi(nguon, hong);
  await vo.nap();
  const AF = "ARRAYFORMULA(IF($D4:$D2000=\"\",\"\",IFERROR(INDEX('Tổng tồn kho'!$C$3:$C$484,MATCH($D4:$D2000,'Tổng tồn kho'!$D$3:$D$484,0)),\"⚠ chưa có trong danh mục\")))";
  const tt = [];
  for (const ten of GIAN_HANG) {
    tt.push({ loai: 'BO_GOP', sheet: ten, r1: 4, c1: 1, r2: 2000, c2: chiSoCot('O') });
    tt.push({ loai: 'XOA_VUNG', sheet: ten, r1: 4, c1: 1, r2: 2000, c2: chiSoCot('O') });
    for (const ch of COT_CT) tt.push({ loai: 'GHI_CT', sheet: ten, r: 4, c: chiSoCot(ch), text: AF, mang: true });
    for (const ch of ['H', 'I', 'J', 'K', 'L']) tt.push({ loai: 'GHI_CT', sheet: ten, r: 3, c: chiSoCot(ch), text: `SUM(${ch}4:${ch}2000)`, mang: false });
  }
  vo.chay(tt);
  await vo.luu();

  const wb = await docFile(hong);
  const anh = anhChupFile(wb, 'loi-cu');
  const dem = await bangDem(hong);
  const kt = kiemN10(anh, demVo, dem, await bangDem(FILE_TAY), {});
  console.log('\n--- ĐỐI CHỨNG ÂM: dựng lại đúng lỗi cũ (xóa nội dung + 1 ARRAYFORMULA mỗi cột) ---');
  console.log('| Sheet | ' + COT_CT.map(c => 'cột ' + c).join(' | ') + ' |');
  console.log('|---|' + COT_CT.map(() => '---|').join(''));
  for (const ten of GIAN_HANG) console.log('| ' + ten + ' | ' + COT_CT.map(c => `${dem[ten][c].soO} ô (dòng ${dem[ten][c].dongDau})`).join(' | ') + ' |');
  console.log('N-10 bản CŨ ("E4/F4/M4/N4 là ARRAYFORMULA") trên file này: ĐẠT — 16/16 ô đúng là ARRAYFORMULA');
  console.log('N-10 bản MỚI trên file này: ' + (kt.dat ? 'ĐẠT ← BÀI TEST VÔ DỤNG' : 'LỆCH ← đúng như phải thế'));
  return { dat: !kt.dat };
}

// ---------------------------------------------------------------- kịch bản Y: ô gõ tay lạc

/**
 * MỘT Ô LẠC KHÔNG ĐƯỢC KÉO THEO CẢ VÙNG CÔNG THỨC.
 * Nếu mốc xóa lấy theo "dòng cuối còn giá trị ở bất kỳ cột nào", thì một ô ghi chú ở `O900`
 * làm tool xóa hẳn 897 dòng — nuốt luôn toàn bộ vùng công thức dự trữ, không hoàn tác được.
 * Mốc thật lấy theo cột khóa (Tên viết tắt). Bài này dựng đúng ô lạc đó và bắt tool:
 * xóa đúng khối đơn, GIỮ vùng công thức, và NÓI RA là có ô lạc.
 */
async function kichBanOLac() {
  const fileVo = path.join(TMP, 'T9_VO_O_LAC.xlsx');
  const fileRa = path.join(TMP, 'T9_TU_O_LAC.xlsx');
  await dungVo(FILE_CU, fileVo, true);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(fileVo);
  wb.eachSheet(ws => goCongThucChiaSe(ws));
  wb.getWorksheet('Shopee mall').getCell('O900').value = 'ghi chú lạc của chủ shop';
  await wb.xlsx.writeFile(fileVo);
  await gonCoDangLam(fileVo);

  const kq = await khoiTaoThangMoi({
    fileCu: FILE_CU, fileVo: fileVo, fileRa: fileRa, thangMoi: '2026-09',
    idFileCu: path.basename(FILE_CU), thoiDiem: new Date(2026, 8, 8, 9, 0, 0), im: true
  });
  if (kq.dung) { console.log('\n[Y] DỪNG: ' + kq.ke.lyDoDung.join(' · ')); return { dat: false }; }
  const sau = await bangDem(fileRa);
  const daXoa = (kq.ke.doc.vungCongThuc['Shopee mall'] || {}).dongCuoiDon;
  const coBao = kq.ke.canhBao.some(c => /ô gõ tay nằm DƯỚI khối đơn/.test(c) && /O900/.test(c));
  const giuVung = sau['Shopee mall'].E.soO === 396;

  console.log('\n--- KỊCH BẢN Y: một ô ghi chú lạc ở `Shopee mall`!O900 ---');
  console.log(`  mốc xóa (cột khóa D): dòng ${daXoa} → xóa ${daXoa - 3} dòng (nếu lấy theo mọi cột sẽ là 897 dòng)`);
  console.log(`  cột E sau khi chạy: ${sau['Shopee mall'].E.soO} ô (4→${sau['Shopee mall'].E.dongCuoi}) — mong đợi 396 ô`);
  console.log('  cảnh báo ô lạc: ' + (coBao ? 'CÓ — ' + kq.ke.canhBao.find(c => /O900/.test(c)).slice(0, 150) : 'KHÔNG'));
  const dat = daXoa === 516 && giuVung && coBao;
  console.log('=> Kịch bản Y: ' + (dat ? 'ĐẠT' : 'HỎNG'));
  return { dat };
}

async function main() {
  const a = await chayNghiemThu();
  const x = await kichBanConDon();
  const y = await kichBanOLac();
  const d = await doiChungAm(a.demVo);
  const hong = a.hongN + (x.dat ? 0 : 1) + (y.dat ? 0 : 1) + (d.dat ? 0 : 1);
  console.log('\n' + (hong === 0
    ? 'TẤT CẢ ĐẠT — 12/12 chỉ tiêu N-1…N-12, kịch bản X, kịch bản Y và đối chứng âm.'
    : hong + ' MỤC HỎNG.'));
  process.exit(hong === 0 ? 0 : 1);
}

module.exports = { chayNghiemThu, kichBanConDon, kichBanOLac, doiChungAm, dungVo, demCongThuc, bangDem, kiemN10 };
if (require.main === module) main().catch(e => { console.error('\nLỖI: ' + e.message + '\n' + e.stack); process.exit(1); });
