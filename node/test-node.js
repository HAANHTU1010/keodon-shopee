/**
 * test-node.js — các test PHẢI có file .xlsx thật mới kiểm được (ExcelJS / SheetJS / JSZip):
 * gộp ô, kéo công thức, ArrayFormula, tự kiểm tra vùng cũ, sheet Mapping, và vỏ vận hành 03_VAN_HANH.
 *
 * Test thuần logic nằm ở src/tests/TestSuite.gs (chạy được cả trong Apps Script). Ở đây chỉ những gì
 * cần chạm vào định dạng file thật — chính là chỗ v1 từng hỏng mà test trong bộ nhớ không thấy.
 *
 * Bộ dữ liệu: 00_DAU_VAO/ (file tracking tháng 8 thật, hai file xuất Shopee thật, Mapping mẫu)
 *             01_TAI_LIEU/NGHIEM_THU_NT1/MAP_LISTING_SP_MALL_NT1.xlsx (Mapping đã điền của NT-1).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { napLoi } = require('./nap-loi');
const { KhoTracking, duongDanOut, docBangXlsx, giaTriThuan, TEN_SHEET_MAPPING } = require('./kho-tracking');
const { NguonThuMuc } = require('./nguon-thu-muc');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const VAN_HANH = path.join(ROOT, '..', '..', '03_VAN_HANH');
const FILE_TOSHIP = path.join(DAU_VAO, 'Order.toship.20260807_20260906.xlsx');
const FILE_ALL = path.join(DAU_VAO, 'Order.all.20260807_20260906.xlsx');
/** File tab "Tất cả" của kỳ 15/7–13/8: đơn nửa đầu tháng 8 chưa được gõ vào sổ tháng 8 → còn đơn nhiều mặt hàng để tool ghi. */
const FILE_ALL_T7 = path.join(DAU_VAO, 'Order.all.20260715_20260813.xlsx');
const TRACKING = path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');
const DEMO_MAP = path.join(DAU_VAO, 'DEMO_Mapping_san_pham.xlsx');
const MAP_NT1 = path.join(ROOT, '..', '..', '01_TAI_LIEU', 'NGHIEM_THU_NT1', 'MAP_LISTING_SP_MALL_NT1.xlsx');

function phai(dk, msg) { if (!dk) throw new Error(msg); }
function bang(a, b, msg) { if (a !== b) throw new Error(msg + ' (mong ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a) + ')'); }

const lop = napLoi();
let TMP;
let MAP_DA_DIEN = null;   // nạp một lần, dùng lại cho nhiều test

function tmpDir(ten) { const d = path.join(TMP, ten); fs.mkdirSync(d, { recursive: true }); return d; }
async function moWb(p) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(p); return wb; }
function ct(cell) { const v = cell.value; return v && typeof v === 'object' && (v.formula != null || v.sharedFormula != null) ? (cell.formula || v.formula) : null; }
function laMang(cell) { const v = cell.value; return !!(v && typeof v === 'object' && v.shareType === 'array'); }
function toVang(cell) { const f = cell.fill; return !!(f && f.fgColor && String(f.fgColor.argb || '').toUpperCase().indexOf('FFF2CC') >= 0); }
function soOGop(ws) { return Object.keys(ws.model.merges || {}).length || (ws.model.merges || []).length; }
/** `TEN_SHEET_MAPPING` là DANH SÁCH tên chấp nhận được (bản Excel + bản Google Sheet) — tìm sheet theo cả hai. */
const TEN_MAPPING_EXCEL = TEN_SHEET_MAPPING[0];
function wsMapping(wb) { for (const t of TEN_SHEET_MAPPING) { const ws = wb.getWorksheet(t); if (ws) return ws; } return null; }
function laSheetMapping(ten) { return TEN_SHEET_MAPPING.indexOf(ten) >= 0; }

/** Bảng Mapping đã điền của NT-1 — để đơn thật ghép được ra mã hàng. */
async function mappingDaDien() {
  if (!MAP_DA_DIEN) MAP_DA_DIEN = await docBangXlsx(MAP_NT1, TEN_SHEET_MAPPING);
  return MAP_DA_DIEN;
}

/** Dựng môi trường chạy thật: file tracking + thư mục thả/đã xử lý trong thư mục tạm. */
function moiTruong(ten) {
  const d = tmpDir(ten);
  const tracking = path.join(d, 'THANG-8.xlsx');
  fs.copyFileSync(TRACKING, tracking);
  const vao = path.join(d, 'vao'), ra = path.join(d, 'ra');
  fs.mkdirSync(path.join(vao, 'SP_MALL'), { recursive: true });
  return { d, tracking, vao, ra, out: path.join(d, 'out') };
}

/**
 * Chạy trọn luồng trên file thật.
 * @param {Object} tc { fileXuat, mapping, cfg, thoiDiem, ngayGhi }
 */
async function chayThat(mt, dauVao, tc) {
  tc = tc || {};
  const nguonFile = tc.fileXuat || FILE_TOSHIP;
  fs.copyFileSync(nguonFile, path.join(mt.vao, 'SP_MALL', path.basename(nguonFile)));
  const thoiDiem = tc.thoiDiem || new Date(2026, 8, 7, 8, 0, 0);
  const cfg = tc.cfg || lop.Config.tao();
  const out = duongDanOut(dauVao, mt.out, thoiDiem, lop);
  const kho = new KhoTracking(dauVao, out, lop, { mappingKhoiTao: tc.mapping === null ? null : (tc.mapping || await mappingDaDien()) });
  await kho.nap(cfg);
  const kq = lop.chayDongBo(new NguonThuMuc(mt.vao, mt.ra), kho, { thoiDiem, ngayGhi: tc.ngayGhi || '2026-09-07', cfg });
  await kho.luu();
  return { kq, out, kho, cfg };
}

const TESTS = [];
function test(ma, ten, fn) { TESTS.push({ ma, ten, fn }); }

// ------------------------------------------------------------------------------------ đọc file thật

test('N-01', 'Round-trip ExcelJS file tracking thật: không đổi gì → tự kiểm tra đạt, giữ nguyên 436 ô gộp', async () => {
  const out = path.join(tmpDir('n01'), 'rt.xlsx');
  const kho = new KhoTracking(TRACKING, out, lop);
  await kho.nap();
  bang(Object.keys(kho.chuKyTruoc).length, 4, 'chữ ký 4 sheet gian hàng');
  bang(kho.chuKyTruoc['Shopee mall'].merges.length, 436, 'ô gộp Shopee mall');
  bang(kho.chuKyTruoc['Shopee mall'].dongCuoi, 516, 'dòng dữ liệu cuối Shopee mall');
  bang(kho.chuKyTruoc['Offood'].dongCuoi, 269, 'Offood');
  bang(kho.chuKyTruoc['Importmart'].dongCuoi, 52, 'Importmart');
  bang(kho.chuKyTruoc['Babyiu'].dongCuoi, 70, 'Babyiu');
  await kho.luu();
  phai(fs.existsSync(out), 'file kết quả tồn tại');
  return '436 ô gộp sẵn có — bằng chứng nhân viên vẫn gộp ô (GV-v2.2 mục 1.2)';
});

test('N-02', 'File xuất có <dimension ref="A1"> sai (và khi bỏ hẳn): SheetJS và ExcelJS vẫn đọc đủ dòng', async () => {
  const d = tmpDir('n02');
  const zip = await JSZip.loadAsync(fs.readFileSync(FILE_TOSHIP));
  const xmlThat = await zip.file('xl/worksheets/sheet3.xml').async('string');
  const m = /<dimension\b[^>]*>/.exec(xmlThat);
  phai(m && /ref="A1"/.test(m[0]), 'file thật phải có <dimension ref="A1">: ' + (m && m[0]));
  bang(NguonThuMuc.docBang(FILE_TOSHIP, 'orders').length, 13, 'SheetJS đọc file thật: 1 tiêu đề + 12 dòng dù dimension sai');
  let soThay = 0;
  for (const ten of Object.keys(zip.files)) {
    if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(ten)) continue;
    const xml = await zip.file(ten).async('string');
    const moi = xml.replace(/<dimension\b[^>]*\/>|<dimension\b[^>]*>[\s\S]*?<\/dimension>/g, '');
    if (moi !== xml) soThay++;
    zip.file(ten, moi);
  }
  phai(soThay >= 1, 'phải bỏ được <dimension> khỏi file thử');
  const p = path.join(d, 'khong-dimension.xlsx');
  fs.writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }));
  const bang2 = NguonThuMuc.docBang(p, 'orders');
  bang(bang2.length, 13, 'SheetJS: 13 dòng khi không có <dimension>');
  bang(lop.Utils.tenCot(bang2[0][0]), 'Mã đơn hàng', 'tiêu đề cột 1');
  bang(lop.Utils.chuoiMaDon(bang2[1][0]), '26090461NYUNB8', 'dòng 1');
  bang((await moWb(p)).getWorksheet('orders').actualRowCount, 13, 'ExcelJS: 13 dòng khi không có <dimension>');
  return 'file thật có <dimension ref="A1"> (không phải thiếu); cả hai thư viện đọc đủ 13 dòng ở hai biến thể';
});

test('N-03', 'Tìm sheet dữ liệu theo TÊN "orders": sheet đầu "Advance Fulfilment" rỗng, lấy theo thứ tự là mất sạch đơn', async () => {
  // Hai file xuất thật có bố cục sheet KHÁC nhau (đo 07/9/2026): tab "Chờ lấy hàng" có thêm sheet rác
  // `Advance Fulfilment` đứng TRƯỚC, tab "Tất cả" chỉ có mỗi `orders`. Lấy sheet theo chỉ số là hên xui.
  const boCuc = [];
  for (const f of [FILE_TOSHIP, FILE_ALL]) {
    const ten = (await moWb(f)).worksheets.map(w => w.name);
    boCuc.push(ten.join(','));
    phai(ten.includes('orders'), path.basename(f) + ': phải có sheet tên orders');
    phai(NguonThuMuc.docBang(f, 'orders').length > 1, path.basename(f) + ': lấy theo TÊN thì có dữ liệu');
  }
  phai(boCuc[0] !== boCuc[1], 'hai file thật phải khác bố cục sheet mới chứng minh được không thể lấy theo chỉ số: ' + boCuc.join(' / '));

  // cái bẫy: sheet ĐẦU TIÊN của file tab "Chờ lấy hàng" rỗng — đọc theo chỉ số là ra 0 đơn mà không báo lỗi
  const wbT = await moWb(FILE_TOSHIP);
  const tenT = wbT.worksheets.map(w => w.name);
  bang(tenT[0], 'Advance Fulfilment', path.basename(FILE_TOSHIP) + ': sheet đầu tiên');
  phai(wbT.getWorksheet(tenT[0]).actualRowCount <= 1, 'sheet đầu rỗng → nếu lấy theo chỉ số thì đọc được 0 đơn');
  phai(NguonThuMuc.docBang(FILE_TOSHIP, tenT[0]).length <= 1, 'đọc sheet đầu theo chỉ số: mất sạch 12 đơn');
  bang(NguonThuMuc.docBang(FILE_TOSHIP, 'orders').length, 13, 'đọc theo tên "orders": 1 tiêu đề + 12 đơn');

  let loi = null;
  try { NguonThuMuc.docBang(FILE_TOSHIP, 'khong-co-sheet-nay'); } catch (e) { loi = e.message; }
  phai(loi && /sheet/i.test(loi), 'thiếu sheet phải hỏng ồn ào, không âm thầm đọc sheet khác: ' + loi);
  return 'toship = [' + boCuc[0] + '], all = [' + boCuc[1] + '] — chỉ tên "orders" là chung';
});

test('N-04', 'Tự nhận loại file xuất bằng cột "Lý do hủy": toship = Chờ lấy hàng (giữ hết), all = Tất cả (bỏ đơn hủy/hoàn)', async () => {
  const cfg = lop.Config.tao();
  const a1 = lop.AdapterFileXuat.doc(NguonThuMuc.docBang(FILE_TOSHIP, 'orders'), 'SP_MALL', cfg);
  bang(a1.loaiFile, 'CHO_LAY_HANG', 'file toship');
  bang(a1.soDonBoQua, 0, 'tab Chờ lấy hàng: không bỏ đơn nào');
  const a2 = lop.AdapterFileXuat.doc(NguonThuMuc.docBang(FILE_ALL, 'orders'), 'SP_MALL', cfg);
  bang(a2.loaiFile, 'TAT_CA', 'file all');
  phai(a2.soDonBoQua > 0, 'tab Tất cả: phải bỏ đơn hủy/hoàn, thực tế bỏ ' + a2.soDonBoQua);
  phai(a2.dong.every(d => cfg.trangThaiBo.indexOf(d.trangThai) < 0), 'không còn dòng trạng thái bị bỏ');
  return 'file "Tất cả" bỏ ' + a2.soDonBoQua + ' đơn hủy/hoàn, còn ' + a2.dong.length + ' dòng';
});

// ------------------------------------------------------------------------------------ ghi vào file thật

test('N-05', 'Chạy hai lần trên file tracking thật: nối dòng dưới cùng, B/E/F/M/N không bị ghi giá trị, lần hai thêm 0 đơn', async () => {
  const mt = moiTruong('n05');
  const { kq, out } = await chayThat(mt, mt.tracking);
  bang(kq.soFileLoi, 0, 'không file lỗi');
  bang(kq.soDonDoc, 12, '12 đơn trong file xuất');
  bang(kq.donGhi, 12, 'ghi 12 đơn');
  bang(kq.donDaCo, 0, 'chưa có đơn nào trùng');

  const ws = (await moWb(out)).getWorksheet('Shopee mall');
  bang(ws.getCell('C516').value, '260831S6B6WA9V', 'C516 của nhân viên giữ nguyên');
  bang(ws.getCell('C517').value, '26090461NYUNB8', 'đơn đầu tiên ghi ở dòng 517');
  bang(ws.getCell('C517').numFmt, '@', 'mã đơn là ô văn bản');
  bang(ws.getCell('B517').value, null, 'B để trống (Context 4.1: cột B trống 747/747 dòng)');
  bang(ws.getCell('A517').numFmt, 'd/m/yyyy', 'A định dạng ngày');
  bang(ws.getCell('H517').numFmt, '#,##0', 'H định dạng tiền');
  bang(ct(ws.getCell('L517')), 'H517-I517-J517-K517', 'L kéo từ dòng trên');
  for (const c of ['E', 'F', 'M', 'N']) {
    phai(ct(ws.getCell(c + '517')) != null, c + '517 phải là công thức, không phải giá trị tool gõ vào');
  }
  bang(ct(ws.getCell('L3')), 'SUM(L4:L947)', 'dòng tổng không bị đụng');
  const xmlWb = await (await JSZip.loadAsync(fs.readFileSync(out))).file('xl/workbook.xml').async('string');
  phai(/<calcPr[^>]*fullCalcOnLoad="1"/.test(xmlWb), 'fullCalcOnLoad="1" để Excel tính lại khi mở');

  // lần hai: chạy tiếp trên chính file kết quả
  const l2 = await chayThat(mt, out, { thoiDiem: new Date(2026, 8, 7, 9, 0, 0) });
  bang(l2.kq.donGhi, 0, 'lần hai không ghi thêm đơn nào');
  bang(l2.kq.donDaCo, 12, 'lần hai: 12 đơn đã có');
  const ws2 = (await moWb(l2.out)).getWorksheet('Shopee mall');
  bang(ws2.getCell('C517').value, '26090461NYUNB8', 'dòng cũ nguyên vẹn');
  return 'ghi 12 đơn vào dòng 517+, chạy lại không sinh dòng trùng';
});

test('N-06', 'Chỉ được thêm sheet "Mapping sản phẩm": file kết quả không có sheet máy nào của bản v1', async () => {
  const mt = moiTruong('n06');
  const { out } = await chayThat(mt, mt.tracking);
  const truoc = (await moWb(mt.tracking)).worksheets.map(w => w.name);
  const sau = (await moWb(out)).worksheets.map(w => w.name);
  const them = sau.filter(t => truoc.indexOf(t) < 0);
  bang(them.length, 1, 'chỉ thêm đúng một sheet, thực tế thêm: ' + them.join(', '));
  bang(them[0], TEN_MAPPING_EXCEL, 'sheet được thêm phải đúng tên GV-v2.2 mục 3');
  for (const cam of ['DON_HANG_RAW', 'CHO_XU_LY', 'LOG_DONG_BO', 'DOI_CHIEU', 'XEM_GIAN_HANG', 'CAU_HINH', 'MAP_LISTING']) {
    phai(sau.indexOf(cam) < 0, 'sheet máy của v1 không được xuất hiện: ' + cam);
  }
  phai(truoc.every(t => sau.indexOf(t) >= 0), 'không sheet nào của chủ dự án bị mất');
});

test('N-07', 'GỘP Ô trên file thật: đơn nhiều mặt hàng gộp đúng 6 cột C,H,I,J,K,L; số ô gộp tăng đúng 6 × số đơn gộp', async () => {
  const mt = moiTruong('n07');
  // Dùng file "Tất cả" kỳ 15/7–13/8: 24 đơn nhiều mặt hàng của file kỳ 7/8–6/9 đã được nhân viên gõ hết
  // vào sổ tháng 8 rồi (chính là nguồn của 436 ô gộp sẵn có), nên tool bỏ qua chống trùng và không gộp ô nào.
  const { kq, out, kho } = await chayThat(mt, mt.tracking, { fileXuat: FILE_ALL_T7 });
  const dongCuoiCu = kho.chuKyTruoc['Shopee mall'].dongCuoi;
  phai(kq.donGopO > 0, 'bộ dữ liệu phải có đơn nhiều mặt hàng chưa vào sổ, thực tế ' + kq.donGopO);
  const wsGoc = (await moWb(mt.tracking)).getWorksheet('Shopee mall');
  const ws = (await moWb(out)).getWorksheet('Shopee mall');
  bang(soOGop(ws) - soOGop(wsGoc), kq.donGopO * 6, 'mỗi đơn gộp sinh đúng 6 ô gộp (C,H,I,J,K,L)');
  const merges = Object.values(ws.model.merges || {}).map(String);
  const moi = merges.filter(x => Number(String(x).match(/(\d+)/)[1]) > dongCuoiCu);
  const cot = {};
  moi.forEach(x => { const c = String(x).match(/^([A-Z]+)/)[1]; cot[c] = (cot[c] || 0) + 1; });
  bang(Object.keys(cot).sort().join(','), 'C,H,I,J,K,L', 'đúng sáu cột được gộp, không cột nào khác');
  for (const c of Object.keys(cot)) bang(cot[c], kq.donGopO, 'cột ' + c + ' gộp đủ số đơn');
  // D và G phải ghi riêng từng dòng, không nằm trong ô gộp
  const mot = moi.find(x => /^C/.test(String(x)));
  const [r1, r2] = String(mot).match(/\d+/g).map(Number);
  phai(r2 > r1, 'ô gộp phải trải nhiều dòng: ' + mot);
  for (let r = r1; r <= r2; r++) {
    phai(ws.getCell('G' + r).value != null, 'G' + r + ' có số lượng riêng từng dòng');
    phai(!ws.getCell('D' + r).isMerged && !ws.getCell('G' + r).isMerged, 'D' + r + '/G' + r + ' không được nằm trong ô gộp');
    phai(ws.getCell('C' + r).isMerged && ws.getCell('L' + r).isMerged, 'C' + r + '/L' + r + ' phải thuộc ô gộp của đơn');
  }
  return kq.donGopO + ' đơn nhiều mặt hàng → ' + (kq.donGopO * 6) + ' ô gộp mới (' + Object.keys(cot).sort().join(',') + ')';
});

test('N-08', 'Chế độ SHEET (Google Sheet): CHỈ kéo cột L, tuyệt đối không ghi vào E,F,M,N (ARRAYFORMULA một ô)', async () => {
  const mt = moiTruong('n08');
  const cfg = lop.Config.tao({ chung: { che_do_cong_thuc: 'SHEET' } });
  const { out } = await chayThat(mt, mt.tracking, { cfg });
  const ws = (await moWb(out)).getWorksheet('Shopee mall');
  const wsGoc = (await moWb(mt.tracking)).getWorksheet('Shopee mall');
  for (const r of [517, 528]) {
    bang(ct(ws.getCell('L' + r)), 'H' + r + '-I' + r + '-J' + r + '-K' + r, 'L' + r + ' vẫn được kéo ở chế độ SHEET');
  }
  // E,F,M,N ở các dòng mới phải giữ đúng như file gốc (ở đây gốc là ArrayFormula của Excel)
  for (const c of ['E', 'F', 'M', 'N']) {
    for (const r of [517, 528]) {
      bang(String(ct(ws.getCell(c + r))), String(ct(wsGoc.getCell(c + r))), c + r + ' không bị tool đổi');
      bang(laMang(ws.getCell(c + r)), laMang(wsGoc.getCell(c + r)), c + r + ' giữ nguyên tính chất ArrayFormula');
    }
  }
});

test('N-09', 'Cột Note = cột trống đầu tiên sau "Còn Nợ", và dòng chưa nhận ra mã được tô vàng CẢ DÒNG', async () => {
  const mt = moiTruong('n09');
  // Mapping mẫu DEMO: hầu hết dòng chưa ghi CÓ → tool phải tô vàng và ghi lý do
  const { kq, out } = await chayThat(mt, mt.tracking, { mapping: await docBangXlsx(DEMO_MAP, TEN_SHEET_MAPPING) });
  phai(kq.dongVang > 0, 'phải có dòng vàng, thực tế ' + kq.dongVang);
  const ws = (await moWb(out)).getWorksheet('Shopee mall');
  const k = lop.Config.tao().keyin;
  // tiêu đề Note nằm ngay sau tiêu đề cuối cùng
  const tieuDe = [];
  ws.getRow(k.dong_header).eachCell({ includeEmpty: true }, (c, i) => { tieuDe[i] = String(c.value == null ? '' : c.value).trim(); });
  let cuoi = 0;
  for (let i = 1; i < tieuDe.length; i++) if (tieuDe[i]) cuoi = i;
  bang(tieuDe[cuoi], k.tieu_de_note, 'tiêu đề cuối cùng của dòng header giờ là "' + k.tieu_de_note + '"');
  const truocNote = String(ws.getRow(k.dong_header).getCell(cuoi - 1).value || '').trim();
  phai(/Còn\s*Nợ/i.test(truocNote) || truocNote !== '', 'cột Note nằm ngay sau cột cuối cùng đang dùng (' + truocNote + ')');
  bang(ws.getCell(517, cuoi).value != null, true, 'dòng 517 có lý do trong cột Note');
  phai(toVang(ws.getCell('A517')) && toVang(ws.getCell('C517')) && toVang(ws.getCell(517, cuoi)),
    'tô vàng CẢ DÒNG chứ không riêng một ô');
  phai(!toVang(ws.getCell('A516')), 'dòng của nhân viên không bị tô');
  return kq.dongVang + ' dòng vàng, cột Note = cột ' + lop.Utils.chuCot(cuoi);
});

test('N-10', 'Sheet "Mapping sản phẩm": tạo từ file mẫu khi thiếu, tên hàng lạ được nối vào cuối và tô vàng, ô người điền không bị đụng', async () => {
  const mt = moiTruong('n10');
  const mau = await docBangXlsx(DEMO_MAP, TEN_SHEET_MAPPING);
  phai((await moWb(mt.tracking)).worksheets.every(w => !laSheetMapping(w.name)), 'file tracking thật chưa có sheet Mapping');
  const { kq, out } = await chayThat(mt, mt.tracking, { fileXuat: FILE_ALL, mapping: mau });
  const wb = await moWb(out);
  const wm = wsMapping(wb);
  phai(wm, 'phải tạo sheet ' + TEN_SHEET_MAPPING.join(' hoặc '));
  bang(wm.name, TEN_MAPPING_EXCEL, 'sheet Mapping mới tạo mang đúng tên bản Excel');
  const header = [];
  wm.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { header[i - 1] = String(c.value == null ? '' : c.value).trim(); });
  bang(header[0], 'Gian hàng', 'cột 1');
  bang(header[1], 'Tên trên Shopee', 'cột 2');
  bang(header[2], 'Phân loại', 'cột 3');
  phai(header.indexOf('Xác nhận') > 0, 'phải có cột Xác nhận');
  phai(header.indexOf('Cấu phần') > 0, 'phải có cột Cấu phần');
  phai(kq.tenMoi > 0, 'file "Tất cả" có tên hàng chưa khai báo, thực tế thêm ' + kq.tenMoi);
  bang(wm.rowCount, mau.length + kq.tenMoi, 'số dòng = mẫu + số tên mới');
  const dongMoi = wm.getRow(mau.length + 1);
  phai(toVang(dongMoi.getCell(1)), 'dòng tên mới phải tô vàng để người ta thấy mà điền');
  phai(String(dongMoi.getCell(2).value || '').length > 0, 'dòng tên mới có tên trên Shopee');
  // Ô NGƯỜI ĐIỀN ở dòng cũ giữ nguyên: 3 cột khóa + 4 cột người điền (SCHEMA.MAPPING_COT_NGUOI).
  // `Mã hàng`, `Gợi ý 1/2`, `Ngày thêm`, `Ghi chú` là cột TOOL tự cập nhật mỗi lần chạy (MapListing.danhGia)
  // nên không so ở đây. So bằng giaTriThuan như lúc đọc — ngày trong .xlsx lưu theo UTC.
  const cotNguoi = lop.SCHEMA.MAPPING.slice(0, 3).concat(lop.SCHEMA.MAPPING_COT_NGUOI);
  let soONguoi = 0;
  for (let r = 2; r <= mau.length; r++) {
    for (let c = 1; c <= mau[0].length; c++) {
      const goc = mau[r - 1][c - 1];
      if (goc == null || goc === '') continue;
      const ten = lop.MapListing.tenCotChuan(mau[0][c - 1]);
      if (cotNguoi.indexOf(ten) < 0) continue;
      const nay = giaTriThuan(wm.getRow(r).getCell(c));
      bang(String(nay == null ? '' : nay).trim(), String(goc).trim(), 'Mapping ô R' + r + 'C' + c + ' (' + ten + ') của người điền không được đụng');
      soONguoi++;
    }
  }
  phai(soONguoi > 100, 'phải thực sự so được nhiều ô người điền, mới so ' + soONguoi);
  // chạy lại: không thêm trùng
  const l2 = await chayThat(mt, out, { fileXuat: FILE_ALL, mapping: null, thoiDiem: new Date(2026, 8, 7, 9, 0, 0) });
  bang(l2.kq.tenMoi, 0, 'chạy lại không nối trùng tên đã có');
  return 'thêm ' + kq.tenMoi + ' tên hàng mới, ' + (mau.length - 1) + ' dòng mẫu giữ nguyên';
});

test('N-11', 'Tự kiểm tra sau khi lưu: một ô vùng cũ bị đổi → hủy file kết quả và báo lỗi', async () => {
  const out = path.join(tmpDir('n11'), 'pha.xlsx');
  const kho = new KhoTracking(TRACKING, out, lop);
  await kho.nap();
  kho.wb.getWorksheet('Shopee mall').getCell('H4').value = 999;
  let loi = null;
  try { await kho.luu(); } catch (e) { loi = e.message; }
  phai(loi && loi.indexOf('TỰ KIỂM TRA THẤT BẠI') >= 0 && loi.indexOf('Shopee mall') >= 0, 'phải báo lỗi tự kiểm tra: ' + loi);
  phai(!fs.existsSync(out), 'file kết quả phải bị xóa');
});

test('N-12', 'Không ghi đè file gốc; luôn ra file _AUTO_ mới; từ chối khi đường dẫn kết quả trùng gốc', async () => {
  const mt = moiTruong('n12');
  const bam = (p) => require('crypto').createHash('sha256').update(fs.readFileSync(p)).digest('hex');
  const truoc = bam(mt.tracking);
  const { out } = await chayThat(mt, mt.tracking);
  bang(bam(mt.tracking), truoc, 'file gốc không đổi một byte');
  phai(/THANG-8_AUTO_20260907_0800\.xlsx$/.test(out), 'tên file kết quả: ' + out);
  bang(duongDanOut(out, mt.out, new Date(2026, 8, 8, 8, 0, 0), lop), path.join(mt.out, 'THANG-8_AUTO_20260908_0800.xlsx'),
    'chạy tiếp trên bản _AUTO_ không nhân đôi hậu tố');
  let loi = null;
  try { new KhoTracking(mt.tracking, mt.tracking, lop); } catch (e) { loi = e.message; }
  phai(loi && loi.indexOf('ghi đè') >= 0, 'từ chối ghi đè gốc');
});

test('N-13', 'Ô cột L bị gõ số tay ở dòng tool sắp ghi → trả lại công thức + ghi vào cảnh báo; ô L của nhân viên giữ nguyên', async () => {
  const mt = moiTruong('n13');
  const wb0 = await moWb(mt.tracking);
  const ws0 = wb0.getWorksheet('Shopee mall');
  bang(ws0.getCell('L102').value, -40000, 'file tháng 8 thật: L102 nhân viên gõ tay -40.000');
  ws0.getCell('L517').value = -40000;                       // dòng trống, tool sẽ ghi đơn đầu tiên vào đây
  const dauVao = path.join(mt.d, 'THANG-8_co_L_tay.xlsx');
  await wb0.xlsx.writeFile(dauVao);
  const { kq, out } = await chayThat(mt, dauVao);
  bang(kq.giaTriTayThay, 1, 'đúng một ô được thay');
  const ws = (await moWb(out)).getWorksheet('Shopee mall');
  bang(ct(ws.getCell('L517')), 'H517-I517-J517-K517', 'L517 trở lại là công thức');
  bang(ws.getCell('L102').value, -40000, 'L102 của nhân viên giữ nguyên số tay');
  const bao = kq.nhatKy.map(r => String(r[lop.LOG_COT.indexOf('thong_bao')])).join('\n');
  phai(/L517/.test(bao) && /-40000/.test(bao), 'phải có dòng nhật ký nêu rõ ô nào bị thay: ' + bao.slice(0, 300));
});

test('N-14', 'Cảnh báo khi ghi vượt vùng công thức: giới hạn dòng tổng / SUMIF Tổng xuất của từng sheet', async () => {
  const kho = new KhoTracking(TRACKING, path.join(tmpDir('n14'), 'x.xlsx'), lop);
  await kho.nap();
  const k = kho.cfg.keyin, tx = kho.docSheet('Tổng xuất');
  const mong = { 'Shopee mall': [901, 1755], 'Offood': [687, 1444], 'Importmart': [329, 148], 'Babyiu': [307, 1007] };
  for (const ten of Object.keys(mong)) {
    const ss = kho.docSheet(ten);
    bang(lop.KeyIn.gioiHanDongTong(ss, k).gioiHan, mong[ten][0], ten + ': vùng dòng tổng');
    bang(lop.KeyIn.gioiHanTongXuat(tx, ten).gioiHan, mong[ten][1], ten + ': vùng SUMIF Tổng xuất');
  }
  return 'Importmart chỉ tới dòng 148 ở SUMIF — sheet dễ vượt vùng nhất';
});

// ------------------------------------------------------------------------------------ vỏ vận hành

test('N-15', 'Vỏ vận hành 03_VAN_HANH: thả file → 3_KET_QUA có _AUTO_ + LOG, nguồn sang 4_DA_XU_LY; bấm lần hai khi hết file → mã 2; thả lại → "đã có"', async () => {
  const d = tmpDir('n15');
  const vh = path.join(d, '03_VAN_HANH');
  for (const t of ['1_THA_FILE_XUAT/SP_MALL', '2_FILE_TRACKING', '3_KET_QUA', '4_DA_XU_LY/SP_MALL']) {
    fs.mkdirSync(path.join(vh, t), { recursive: true });
  }
  fs.copyFileSync(TRACKING, path.join(vh, '2_FILE_TRACKING', 'THANG-8-2026.xlsx'));
  fs.copyFileSync(FILE_TOSHIP, path.join(vh, '1_THA_FILE_XUAT', 'SP_MALL', 'Order.toship.xlsx'));
  fs.writeFileSync(path.join(vh, '1_THA_FILE_XUAT', 'SP_MALL', '.keep'), '');
  fs.writeFileSync(path.join(vh, '1_THA_FILE_XUAT', 'SP_MALL', 'ghi-chu.txt'), 'file lạ');
  fs.copyFileSync(MAP_NT1, path.join(d, 'mapping.xlsx'));
  fs.writeFileSync(path.join(vh, 'CAU_HINH_VAN_HANH.json'), JSON.stringify({
    thu_muc_tha_file: '1_THA_FILE_XUAT', thu_muc_file_tracking: '2_FILE_TRACKING',
    thu_muc_ket_qua: '3_KET_QUA', thu_muc_da_xu_ly: '4_DA_XU_LY',
    tiep_tuc_tu_ket_qua_moi_nhat: true, file_mapping_mau: '../mapping.xlsx'
  }, null, 2), 'utf8');

  const chay = () => spawnSync(process.execPath, [path.join(__dirname, 'chay-thu.js'), '--van-hanh', vh,
    '--thoi-diem', '2026-09-07 08:00:00', '--ngay', '2026-09-07'], { encoding: 'utf8' });

  const r1 = chay();
  bang(r1.status, 0, 'lần 1 phải thoát mã 0: ' + (r1.stdout || '') + (r1.stderr || ''));
  phai(/GHI THÊM 12 đơn/.test(r1.stdout), 'lần 1 ghi 12 đơn: ' + r1.stdout);
  phai(/\.keep/.test(r1.stdout) === false, 'không nhắc file giữ chỗ .keep ra màn hình');
  phai(/ghi-chu\.txt/.test(r1.stdout), 'vẫn nhắc file lạ người dùng thả nhầm');
  const ketQua = fs.readdirSync(path.join(vh, '3_KET_QUA'));
  phai(ketQua.some(f => /_AUTO_\d{8}_\d{4}\.xlsx$/.test(f)), 'có file _AUTO_: ' + ketQua.join(', '));
  phai(ketQua.some(f => /^LOG_\d{8}_\d{4}\.txt$/.test(f)), 'có file LOG: ' + ketQua.join(', '));
  bang(fs.readdirSync(path.join(vh, '4_DA_XU_LY', 'SP_MALL')).length, 1, 'file nguồn đã chuyển sang 4_DA_XU_LY');
  bang(fs.readdirSync(path.join(vh, '1_THA_FILE_XUAT', 'SP_MALL')).filter(f => /\.xlsx$/i.test(f)).length, 0, 'thư mục thả không còn .xlsx');

  const r2 = chay();
  bang(r2.status, 2, 'lần 2 (không còn file) thoát mã 2 — không phải lỗi');
  phai(/KHÔNG CÓ FILE MỚI/.test(r2.stdout), 'lần 2 báo không có file mới');
  phai(/4_DA_XU_LY/.test(r2.stdout), 'nói rõ file lần trước đã đi đâu');

  fs.copyFileSync(FILE_TOSHIP, path.join(vh, '1_THA_FILE_XUAT', 'SP_MALL', 'Order.toship.xlsx'));
  const r3 = chay();
  bang(r3.status, 0, 'lần 3 thoát mã 0');
  phai(/GHI THÊM 0 đơn/.test(r3.stdout) && /bỏ qua 12 đơn đã có/.test(r3.stdout),
    'thả lại đúng file cũ → 0 đơn mới, 12 đơn đã có: ' + r3.stdout);
  return 'ba lần bấm: 12 đơn → mã 2 → 0 đơn mới / 12 đã có';
});

// ------------------------------------------------------------------------------------ chạy

async function chayTatCa() {
  TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-test-'));
  const kq = [];
  for (const t of TESTS) {
    try {
      const ghiChu = await t.fn();
      kq.push({ ma: t.ma, ten: t.ten, dat: true, ghiChu: ghiChu || '' });
    } catch (e) {
      kq.push({ ma: t.ma, ten: t.ten, dat: false, loi: (e && e.message ? e.message : String(e)) + (e && e.stack ? '\n            at ' + e.stack.split('\n').slice(1, 3).map(s => s.trim()).join(' / ') : '') });
    }
  }
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* thư mục tạm còn khóa thì thôi */ }
  return kq;
}

module.exports = { chayTatCa, TESTS };

if (require.main === module) {
  chayTatCa().then(kq => {
    kq.forEach(r => console.log((r.dat ? 'ĐẠT   ' : 'HỎNG  ') + ' ' + r.ma + ' ' + r.ten + (r.loi ? '\n        → ' + r.loi : '') + (r.ghiChu ? '\n        · ' + r.ghiChu : '')));
    process.exit(kq.some(r => !r.dat) ? 1 : 0);
  });
}
