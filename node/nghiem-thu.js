/**
 * nghiem-thu.js — BỘ NGHIỆM THU theo GV-v2.2 mục 2. In bảng từng chỉ tiêu và tự chấm ĐẠT/LỆCH.
 *
 *   node node/nghiem-thu.js [--goc <file tracking>] [--mapping <file>] [--thang 2026-08] [--giu-file]
 *
 * Bộ chuẩn: hai file `00_DAU_VAO/Order.all.*.xlsx` (tab "Tất cả", lọc ngày đặt trong tháng) +
 * `THÁNG-8-2026-KINH-DOANH (1).xlsx` + Mapping fixture `01_TAI_LIEU/NGHIEM_THU_NT1/MAP_LISTING_SP_MALL_NT1.xlsx`.
 *
 * Hai lần chạy (đúng cách BA đã làm ở NT-1):
 *   A — giữ nguyên dữ liệu tay: tool chỉ ghi đơn chưa có; dùng để đối chiếu từng mã đơn với bản nhân viên gõ.
 *   B — bản trống: xóa 9 cột nhập tay ở sheet gian hàng, bỏ gộp ô vùng dữ liệu, GIỮ công thức và giữ nguyên
 *       8 ô cột L nhân viên gõ số tay; để tool key-in lại từ đầu rồi so tổng H3/L3 và đếm ô gộp mới.
 *
 * Bảng đối chiếu ghi ra `out/nghiem-thu/DOI_CHIEU.csv` — file RIÊNG, không thêm sheet nào vào file tracking (mục 3).
 *
 * BƯỚC CUỐI (GV-v2.5 mục 6): mọi `.xlsx` còn lại trong `out/nghiem-thu/` bị xóa sheet `Thông tin shop `
 * trước khi được giữ làm bằng chứng — sheet đó mang bảng link Google Sheet và mật khẩu gian hàng, và
 * không chỉ tiêu nào cần tới nó. Bước này TỰ ĐẾM LẠI trong ruột zip và ném lỗi nếu chưa về 0.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const { napLoi } = require('./nap-loi');
const { KhoTracking, docBangXlsx, giaTriThuan, congThucCua, TEN_SHEET_MAPPING } = require('./kho-tracking');
const { NguonThuMuc } = require('./nguon-thu-muc');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const FIXTURE = path.join(ROOT, '..', '..', '01_TAI_LIEU', 'NGHIEM_THU_NT1', 'MAP_LISTING_SP_MALL_NT1.xlsx');
const OUT = path.join(ROOT, 'out', 'nghiem-thu');
const args = process.argv.slice(2);
function thamSo(t, mac) { const i = args.indexOf(t); return i >= 0 ? args[i + 1] : mac; }

const GOC = path.resolve(thamSo('--goc', path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx')));
const MAPPING = path.resolve(thamSo('--mapping', FIXTURE));
const THANG = thamSo('--thang', '2026-08');
const FILES = fs.readdirSync(DAU_VAO).filter(f => /^Order\.all\..*\.xlsx$/i.test(f)).sort().map(f => path.join(DAU_VAO, f));

const lop = napLoi();
const THOI_DIEM = new Date(2026, 8, 7, 8, 0, 0);
const NGAY_GHI = '2026-09-07';
const TEN_SHEET = 'Shopee mall';

function vn(n) { return Number(n).toLocaleString('vi-VN'); }

/**
 * MỐC NGHIỆM THU nằm ở `moc-nghiem-thu.json` cạnh `package.json`, KHÔNG nằm trong mã.
 * Vì sao: các con số này là doanh thu và giá trị tồn kho THẬT của shop. Từ 08/9/2026 mã nguồn
 * được đưa lên GitHub công khai, để số ở đây là ai cũng đọc được doanh thu tháng của người ta.
 * Chưa có file thì bộ nghiệm thu vẫn chạy và vẫn IN RA số đo được, chỉ không tự chấm đạt/lệch.
 */
function napMoc() {
  const p = path.join(ROOT, 'moc-nghiem-thu.json');
  if (!fs.existsSync(p)) {
    console.log('KHÔNG CÓ `moc-nghiem-thu.json` → in số đo được, không tự chấm đạt/lệch.');
    console.log('  Chép `moc-nghiem-thu.mau.json` thành `moc-nghiem-thu.json` rồi điền số thật của shop.');
    return null;
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
const MOC = napMoc();
/** So với mốc; chưa có mốc thì trả null để cột kết quả ghi `(chưa có mốc)`. */
function soMoc(khoa, giaTri) { return MOC == null ? null : MOC[khoa] === giaTri; }
/** Chuỗi hiển thị của một mốc; chưa có thì để dấu hỏi. */
function chuMoc(khoa, dinhDang) {
  if (MOC == null || MOC[khoa] == null) return '?';
  return dinhDang === 'tien' ? vn(MOC[khoa]) : String(MOC[khoa]);
}
function so(v) { return typeof v === 'number' ? v : 0; }

// ---------------------------------------------------------------- nguồn: hai file "Tất cả", lọc theo tháng

/** Đọc sheet `orders`, giữ dòng có ngày đặt trong tháng, khử trùng theo (mã đơn, listing, phân loại, SL). */
function docVaLoc(cfg) {
  const [nam, thg] = THANG.split('-').map(Number);
  const tenNgay = cfg.cot.ngayDat[0], tenMa = cfg.cot.maDonSan[0], tenTen = cfg.cot.tenListing[0],
    tenPL = cfg.cot.tenPhanLoai[0], tenSL = cfg.cot.soLuongListing[0];
  const gop = [];
  let tieuDe = null;
  const daCo = new Set();
  for (const f of FILES) {
    const bang = NguonThuMuc.docBang(f, cfg.chung.ten_sheet_du_lieu);
    const head = bang[0].map(lop.Utils.tenCot);
    if (!tieuDe) { tieuDe = bang[0]; }
    const iNgay = head.indexOf(tenNgay), iMa = head.indexOf(tenMa), iTen = head.indexOf(tenTen),
      iPL = head.indexOf(tenPL), iSL = head.indexOf(tenSL);
    for (let r = 1; r < bang.length; r++) {
      const row = bang[r];
      if (!row || !row.length) continue;
      const d = lop.Utils.parseNgay(row[iNgay]);
      if (!d || d.getFullYear() !== nam || d.getMonth() + 1 !== thg) continue;
      const k = [row[iMa], row[iTen], row[iPL], row[iSL]].join('|');
      if (daCo.has(k)) continue;
      daCo.add(k);
      gop.push(head.map((h, i) => row[i]));      // đưa mọi file về đúng thứ tự cột của file đầu
    }
  }
  return [tieuDe].concat(gop);
}

function nguonGiaLap(bang) {
  const ds = [{ san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'Order.all.thang' + THANG + '.xlsx', docBang: () => bang }];
  return {
    layFileMoi: () => ds.slice(),
    danhDauDaXuLy: () => { },
    danhDauLoi: () => { }
  };
}

// ---------------------------------------------------------------- đọc sheet gian hàng để đối chiếu

/** Đọc dữ liệu nhập tay theo mã đơn: ô gộp giữ giá trị ở ô trên cùng; chữ (HUỶ/HOÀN) coi là 0. */
async function docTheoMaDon(file, tenSheet, cfg) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(tenSheet);
  const k = cfg.keyin;
  const kq = {};
  let cuoi = k.dong_dau - 1;
  for (let r = k.dong_dau; r <= ws.rowCount; r++) {
    if (giaTriThuan(ws.getCell(r, k.cot_ma_don)) != null || giaTriThuan(ws.getCell(r, k.cot_ten_viet_tat)) != null) cuoi = r;
  }
  let ht = null;
  for (let r = k.dong_dau; r <= cuoi; r++) {
    const vMa = giaTriThuan(ws.getCell(r, k.cot_ma_don));
    if (vMa != null && String(vMa).trim() !== '') {
      const ma = lop.Utils.chuoiMaDon(vMa);
      if (kq[ma]) { kq[ma].soLan++; ht = null; continue; }
      ht = { ma, dong: r, soLan: 1, H: null, I: null, J: null, K: null, ghiChu: [] };
      kq[ma] = ht;
    }
    if (!ht) continue;
    [['H', k.cot_tong_tien_sp], ['I', k.cot_mgg_shop], ['J', k.cot_chi_phi], ['K', k.cot_thue]].forEach(([ten, ci]) => {
      if (ht[ten] !== null) return;
      const v = giaTriThuan(ws.getCell(r, ci));
      if (v == null || v === '') return;
      if (typeof v === 'number') ht[ten] = v;
      else { ht[ten] = 0; ht.ghiChu.push(lop.Utils.chuCot(ci) + r + "='" + String(v).trim() + "'"); }
    });
  }
  return { theoMa: kq, dongCuoi: cuoi };
}

/** Tính lại H3 / L3 đúng như Excel sẽ tính (ô gộp: giá trị ở ô trên cùng; L công thức → H−I−J−K). */
async function tinhLaiTong(file, tenSheet, dongCuoiToolGhi) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(tenSheet);
  const vung = (dc) => { const f = congThucCua(ws.getCell(dc)); const m = f ? /\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)/.exec(f.text) : null; return m ? [+m[1], +m[2]] : [4, ws.rowCount]; };
  const vH = vung('H3'), vL = vung('L3');
  let sumH = 0, sumL = 0, lCongThuc = 0, sumLvung = 0;
  const lTay = [], lTayNgoaiVung = [];
  const cuoiVung = dongCuoiToolGhi || Math.max(vH[1], vL[1]);
  for (let r = 4; r <= Math.max(vH[1], vL[1]); r++) {
    const H = ws.getCell(r, 8), I = ws.getCell(r, 9), J = ws.getCell(r, 10), K = ws.getCell(r, 11), L = ws.getCell(r, 12);
    if (r <= vH[1]) sumH += so(giaTriThuan(H));
    if (r <= vL[1]) {
      let v = 0, soTay = false;
      if (congThucCua(L)) { v = so(giaTriThuan(H)) - so(giaTriThuan(I)) - so(giaTriThuan(J)) - so(giaTriThuan(K)); lCongThuc++; }
      else if (L.value != null && !(L.isMerged && L.master && L.master.address !== L.address)) { v = so(giaTriThuan(L)); soTay = true; }
      sumL += v;
      if (r <= cuoiVung) { sumLvung += v; if (soTay) lTay.push(r); }
      else if (soTay) lTayNgoaiVung.push(r);
    }
  }
  return { H3: sumH, L3: sumL, L3vung: sumLvung, lCongThuc, lTay, lTayNgoaiVung, cuoiVung };
}

/** Ô gộp do tool tạo (dòng > dòng cuối cũ), nhóm theo đơn. */
async function oGopMoi(file, tenSheet, dongCuoiCu) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(tenSheet);
  const theoDong = {};
  // ExcelJS: worksheet.model.merges là mảng chuỗi vùng ('C7:C9'); ws._merges lại đánh khóa theo ô master nên không dùng được ở đây
  (ws.model.merges || []).forEach(a => {
    const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(a));
    if (!m || Number(m[2]) <= dongCuoiCu || m[2] === m[4]) return;
    const k = m[2] + '-' + m[4];
    (theoDong[k] = theoDong[k] || []).push(m[1]);
  });
  const cum = Object.keys(theoDong).map(k => theoDong[k].sort().join(''));
  const dem = {};
  cum.forEach(c => { dem[c] = (dem[c] || 0) + 1; });
  return { soDon: cum.length, kieu: dem };
}

/** Bản trống: xóa 9 cột nhập tay, bỏ gộp ô vùng dữ liệu, GIỮ công thức và giữ 8 ô L số tay. */
async function taoBanTrong(goc, out, cfg) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(goc);
  const k = cfg.keyin;
  const cot = [k.cot_ngay, k.cot_nguon_don, k.cot_ma_don, k.cot_ten_viet_tat, k.cot_so_luong,
    k.cot_tong_tien_sp, k.cot_mgg_shop, k.cot_chi_phi, k.cot_thue];
  const tk = {};
  for (const g of Object.keys(cfg.gianHang)) {
    const ws = wb.getWorksheet(cfg.gianHang[g].sheet);
    if (!ws) continue;
    const merges = Object.keys(ws._merges).filter(a => Number((/(\d+)/.exec(a) || [])[1]) >= k.dong_dau);
    merges.forEach(a => { try { ws.unMergeCells(a); } catch (e) { } });
    let xoa = 0, lTay = 0;
    for (let r = k.dong_dau; r <= ws.rowCount; r++) {
      for (const c of cot) {
        const cell = ws.getCell(r, c);
        if (cell.value == null) continue;
        if (congThucCua(cell)) continue;
        cell.value = null; xoa++;
      }
      const L = ws.getCell(r, k.cot_doanh_thu);
      if (L.value != null && !congThucCua(L)) lTay++;
    }
    tk[ws.name] = { boGop: merges.length, xoaO: xoa, oLSoTay: lTay };
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);
  return tk;
}

// ---------------------------------------------------------------- dọn bằng chứng trước khi giữ lại

/**
 * SHEET BỊ XÓA KHỎI MỌI BẢN LƯU TRONG `out/` — GV-v2.5 mục 6.
 *
 * Vì sao: `out/nghiem-thu/*.xlsx` là bản sao GẦN NHƯ NGUYÊN VẸN của file tracking, nên nó bê theo
 * cả sheet `Thông tin shop ` — nơi chủ dự án để bảng link Google Sheet từng tháng VÀ mật khẩu gian
 * hàng. `.gitignore` che `out/` nên nó không lên repo, nhưng file vẫn nằm trên đĩa và vẫn bị chép
 * đi chép lại như một tệp bằng chứng bình thường. Đây là dọn Ở NGUỒN, không phải dọn ở repo.
 *
 * Vì sao xóa được: bộ nghiệm thu chỉ đối chiếu SỐ TIỀN ở sheet gian hàng (`Shopee mall`) và sheet
 * `Mapping sản phẩm`. Không chỉ tiêu nào trong 14 dòng bảng kết quả đọc sheet này, và đã đo trên
 * file thật: 0 công thức của sheet khác trỏ tới nó (chỉ workbook.xml và docProps/app.xml nhắc tên).
 *
 * DẤU CÁCH CUỐI TÊN LÀ THẬT (INV-10 / `KT-INV-10`) — tuyệt đối không `trim` khi tra.
 */
const TEN_SHEET_BI_MAT = 'Thông tin shop ';

/**
 * Đếm dấu vết trong RUỘT file .xlsx. `.xlsx` là zip nhị phân nên `grep` thẳng lên file không thấy
 * gì — phải giải nén rồi quét từng phần `.xml` / `.rels` (hyperlink của sheet nằm ở `.rels`, còn
 * chữ hiện trên ô nằm ở `xl/sharedStrings.xml`; thiếu một trong hai là đếm hụt).
 *
 * Hai con số, đếm riêng:
 *   link — số lần chuỗi `docs.google.com` / `drive.google.com` xuất hiện;
 *   id   — số lần một chuỗi trông như ID file Google Drive xuất hiện. Nhận dạng: từ >= 25 ký tự
 *          trong tập [A-Za-z0-9_-] có ĐỦ chữ hoa, chữ thường và chữ số. Ba ràng buộc đó loại được
 *          ba thứ hay bị đếm nhầm mà đã gặp trên file thật: `openxmlformats-officedocument`
 *          (không có chữ số), `Z_2A0B5B4B_..._` — tên vùng nội bộ của Excel (không có chữ thường),
 *          và công thức trừ nhau `L3-18311772-21176369-31078654-85185924` (không có chữ cái).
 *          GUID của `xl/styles.xml` (`EB79DEF2-80B8-43e5-...`) lọt lưới ba ràng buộc trên nên bị
 *          loại riêng bằng hình dạng 8 ký tự hex hoa rồi gạch nối.
 */
async function demDauVet(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const theoPhan = {};
  let link = 0, id = 0;
  const loai = new Set();
  for (const ten of Object.keys(zip.files)) {
    if (!/\.(xml|rels)$/i.test(ten)) continue;
    const s = await zip.file(ten).async('string');
    const l = (s.match(/docs\.google\.com|drive\.google\.com/g) || []).length;
    let i = 0;
    for (const m of (s.match(/[A-Za-z0-9_-]{25,}/g) || [])) {
      if (!/[a-z]/.test(m) || !/[A-Z]/.test(m) || !/[0-9]/.test(m)) continue;
      if (/^[0-9A-F]{8}-/.test(m)) continue;
      i++; loai.add(m);
    }
    link += l; id += i;
    if (l || i) theoPhan[ten] = { link: l, id: i };
  }
  return { link, id, loaiId: loai.size, theoPhan };
}

/**
 * Mở lại bản lưu trong `out/`, xóa sheet bí mật, ghi đè, rồi ĐẾM LẠI để tự chứng minh về 0.
 * Không đếm lại thì đây chỉ là một lời hứa; đếm lại thì nó là một con số.
 * Còn sót một dấu vết là NÉM LỖI — giữ lại file bằng chứng có mật khẩu trong đó nguy hiểm hơn hẳn
 * việc bộ nghiệm thu dừng giữa chừng.
 */
async function donSheetBiMat(file) {
  const truoc = await demDauVet(file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const sheetTruoc = wb.worksheets.length;
  // so NGUYÊN VĂN trước (dấu cách cuối là thật); chỉ khi không thấy mới hạ xuống so bản đã trim
  let dinh = wb.worksheets.filter((w) => w.name === TEN_SHEET_BI_MAT);
  const nguyenVan = dinh.length > 0;
  if (!dinh.length) dinh = wb.worksheets.filter((w) => String(w.name).trim() === TEN_SHEET_BI_MAT.trim());
  dinh.slice().forEach((w) => wb.removeWorksheet(w.id));
  await wb.xlsx.writeFile(file);
  const sau = await demDauVet(file);
  const kq = {
    ten: path.basename(file), xoa: dinh.length, nguyenVan,
    sheetTruoc, sheetSau: sheetTruoc - dinh.length,
    linkTruoc: truoc.link, linkSau: sau.link,
    idTruoc: truoc.id, idSau: sau.id, loaiIdTruoc: truoc.loaiId, loaiIdSau: sau.loaiId
  };
  if (sau.link || sau.id) {
    throw new Error('Bản lưu bằng chứng ' + kq.ten + ' VẪN CÒN dấu vết sau khi xóa sheet '
      + JSON.stringify(TEN_SHEET_BI_MAT) + ': ' + sau.link + ' lượt link Google, ' + sau.id
      + ' lượt chuỗi id. Còn ở: ' + Object.keys(sau.theoPhan).join(', '));
  }
  return kq;
}

// ---------------------------------------------------------------- chạy

async function chay(goc, out, mapBang, cfg, bang) {
  if (fs.existsSync(out)) fs.unlinkSync(out);
  const kho = new KhoTracking(goc, out, lop, { mappingKhoiTao: mapBang });
  await kho.nap(cfg);
  const kq = lop.chayDongBo(nguonGiaLap(bang), kho, { thoiDiem: THOI_DIEM, ngayGhi: NGAY_GHI, cfg });
  await kho.luu();
  return { kq, kho };
}

/** Mỗi dòng: [tên chỉ tiêu, phải ra, thực tế, đạt?]. Cột cuối do đây điền. */
/**
 * Chấm từng dòng. `null` nghĩa là CHƯA CÓ MỐC để so — in ra `?` chứ không được coi là ĐẠT.
 * Coi thiếu mốc là đạt thì bảng nghiệm thu sẽ xanh giả, đúng thứ nguy hiểm nhất.
 */
function chamDiem(bang) {
  return bang.map(r => r.concat([r[3] == null ? '?' : (r[3] ? 'ĐẠT' : 'LỆCH')]));
}

async function main() {
  console.log('BỘ NGHIỆM THU keodon v2 — GV-v2.2 mục 2 · tháng ' + THANG + ' · gian Shopee mall');
  console.log('  file tracking : ' + GOC);
  console.log('  mapping       : ' + MAPPING);
  console.log('  file xuất     : ' + FILES.map(f => path.basename(f)).join(', '));
  if (!fs.existsSync(MAPPING)) throw new Error('Không thấy file Mapping: ' + MAPPING);
  fs.mkdirSync(OUT, { recursive: true });

  const cfg = lop.Config.tao();
  const mapBang = await docBangXlsx(MAPPING, TEN_SHEET_MAPPING);
  const bang = docVaLoc(cfg);
  const soDongDoc = bang.length - 1;
  const donDoc = new Set();
  const iMa = bang[0].map(lop.Utils.tenCot).indexOf(cfg.cot.maDonSan[0]);
  for (let r = 1; r < bang.length; r++) donDoc.add(lop.Utils.chuoiMaDon(bang[r][iMa]));

  // ---------- chạy A: giữ nguyên dữ liệu tay ----------
  const outA = path.join(OUT, 'A_GIU_DU_LIEU_TAY.xlsx');
  const A = await chay(GOC, outA, mapBang, cfg, bang);
  const tayGoc = await docTheoMaDon(GOC, TEN_SHEET, cfg);

  // ---------- chạy B: bản trống ----------
  const trong = path.join(OUT, 'B_BAN_TRONG.xlsx');
  const tkTrong = await taoBanTrong(GOC, trong, cfg);
  const outB = path.join(OUT, 'B_TOOL_GHI_LAI.xlsx');
  const B = await chay(trong, outB, mapBang, cfg, bang);
  const toolB = await docTheoMaDon(outB, TEN_SHEET, cfg);
  const tongB = await tinhLaiTong(outB, TEN_SHEET, toolB.dongCuoi);

  // Đối chiếu mốc cũ: mốc "84 dòng chờ" của NT-1 tính khi đọc CẢ đơn hủy/hoàn (luồng v1).
  // GV-v2.2 mục 1.1 yêu cầu bỏ đơn hủy/hoàn ngay khi đọc file tab "Tất cả" → số dòng vàng đương nhiên nhỏ hơn.
  // Chạy lại lớp 1+2 với cờ tắt để chứng minh phần chênh đúng bằng các dòng thuộc đơn hủy.
  let vangDocHet = null;
  try {
    const cfg2 = lop.Config.tao({ chung: { bo_don_huy_hoan: false } });
    const dm2 = lop.DanhMuc.doc((await docBangXlsx(GOC, cfg.danhMuc.ten_sheet)), cfg2.danhMuc);
    const map2 = lop.MapListing.docBang(mapBang, dm2, cfg2);
    const a2 = lop.AdapterFileXuat.doc(bang, { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'x' }, cfg2);
    const n2 = lop.Normalize.xuLy(a2.dong, map2, cfg2);
    vangDocHet = 0;
    n2.don.forEach(d => d.dong.forEach(x => { if (x.lyDo || x.ghiChu) vangDocHet++; }));
  } catch (e) { vangDocHet = null; }
  const gopMoi = await oGopMoi(outB, TEN_SHEET, 3);

  // ---------- đối chiếu từng mã đơn (tool ghi lại ở B ↔ nhân viên gõ ở file gốc) ----------
  const chung = [], chiTay = [], chiTool = [];
  Object.keys(toolB.theoMa).forEach(ma => { if (tayGoc.theoMa[ma]) chung.push(ma); else chiTool.push(ma); });
  Object.keys(tayGoc.theoMa).forEach(ma => { if (!toolB.theoMa[ma]) chiTay.push(ma); });
  const khop = { H: 0, I: 0, J: 0, K: 0 };
  let sumTay = 0, sumTool = 0;
  const lech = [];
  chung.forEach(ma => {
    const t = tayGoc.theoMa[ma], o = toolB.theoMa[ma];
    const d = {};
    ['H', 'I', 'J', 'K'].forEach(c => { d[c] = so(t[c]) - so(o[c]); if (d[c] === 0) khop[c]++; });
    sumTay += so(t.H); sumTool += so(o.H);
    if (d.H || d.I || d.J || d.K) lech.push({ ma, ...d, tay: t.dong, tool: o.dong });
  });

  const kieuGop = Object.keys(gopMoi.kieu);
  // Mốc lấy từ `moc-nghiem-thu.json` (không lên repo). Mã nguồn chỉ còn TÊN chỉ tiêu.
  const bangKQ = chamDiem([
    ['Dòng đọc / số đơn (lọc tháng ' + THANG + ', khử trùng)',
      chuMoc('so_dong_doc') + ' / ' + chuMoc('so_don_doc'), soDongDoc + ' / ' + donDoc.size,
      MOC == null ? null : (soDongDoc === MOC.so_dong_doc && donDoc.size === MOC.so_don_doc)],
    ['Đơn tool ghi (chạy B, bản trống)', chuMoc('don_tool_ghi_ban_trong'), String(B.kq.donGhi),
      soMoc('don_tool_ghi_ban_trong', B.kq.donGhi)],
    ['Đơn có ở cả hai bên', chuMoc('don_co_o_ca_hai_ben'), String(chung.length),
      soMoc('don_co_o_ca_hai_ben', chung.length)],
    ['`Tổng Tiền SP` khớp bản tay', chuMoc('khop_tong_tien_sp') + '/' + chuMoc('don_co_o_ca_hai_ben'),
      khop.H + '/' + chung.length, soMoc('khop_tong_tien_sp', khop.H)],
    ['`MGG Shop` khớp', chuMoc('khop_mgg_shop'), String(khop.I), soMoc('khop_mgg_shop', khop.I)],
    ['`Chi phí` khớp', chuMoc('khop_chi_phi'), String(khop.J), soMoc('khop_chi_phi', khop.J)],
    ['`Thuế` khớp', chuMoc('khop_thue'), String(khop.K), soMoc('khop_thue', khop.K)],
    ['Σ Tổng Tiền SP các đơn chung (tay = tool)', chuMoc('tong_tien_sp_don_chung', 'tien'),
      vn(sumTay) + ' = ' + vn(sumTool),
      MOC == null ? null : (sumTay === MOC.tong_tien_sp_don_chung && sumTool === MOC.tong_tien_sp_don_chung)],
    ['Dòng vàng chờ điền Mapping — luồng v2.2 (đã bỏ đơn hủy/hoàn)', chuMoc('dong_vang_luong_v22'),
      String(B.kq.dongVang), soMoc('dong_vang_luong_v22', B.kq.dongVang)],
    ['   đối chiếu mốc NT-1 cũ: nếu đọc cả đơn hủy/hoàn như luồng v1', chuMoc('dong_vang_luong_v1'),
      vangDocHet == null ? '(không đo được)' : String(vangDocHet), soMoc('dong_vang_luong_v1', vangDocHet)],
    ['`Shopee mall`!H3 tính lại', chuMoc('shopee_mall_h3', 'tien'), vn(tongB.H3),
      soMoc('shopee_mall_h3', tongB.H3)],
    ['`Shopee mall`!L3 tính lại (vùng tool ghi, dòng 4–' + tongB.cuoiVung + ')',
      chuMoc('shopee_mall_l3_vung_tool_ghi', 'tien'), vn(tongB.L3vung),
      soMoc('shopee_mall_l3_vung_tool_ghi', tongB.L3vung)],
    ['Ô L còn là số gõ tay trong vùng tool ghi', chuMoc('o_l_go_tay_trong_vung'),
      String(tongB.lTay.length) + (tongB.lTay.length ? ' (dòng ' + tongB.lTay.join(',') + ')' : ''),
      soMoc('o_l_go_tay_trong_vung', tongB.lTay.length)],
    ['Ô gộp mới cho đơn nhiều dòng: đúng 6 cụm C,H,I,J,K,L', 'CHIJKL × ' + chuMoc('so_don_gop_o'),
      (kieuGop.join(',') || '(không có)') + ' × ' + gopMoi.soDon,
      MOC == null ? null : (kieuGop.length === 1 && kieuGop[0] === 'CHIJKL' && gopMoi.soDon === MOC.so_don_gop_o)]
    ,
    // B-08 của KE_HOACH_KIEM_THU: danh sách đơn lệch phải ĐÚNG ba mã đã ghi thành văn, không thừa
    // không thiếu. Trước 08/9/2026 chỉ tiêu này được IN ra mà KHÔNG chấm, nên thừa hoặc thiếu một mã
    // lệch vẫn ra 'TẤT CẢ CHỈ TIÊU ĐẠT' — đúng kiểu xanh giả mà mục 0.2 của kế hoạch cấm.
    ['Danh sách đơn lệch tiền đúng bằng danh sách đã ghi thành văn',
      (MOC && MOC.don_lech_da_biet && MOC.don_lech_da_biet.length ? MOC.don_lech_da_biet.join(', ') : '?'),
      (lech.length ? lech.map(x => x.ma).sort().join(', ') : '(không đơn nào lệch)'),
      (MOC == null || !MOC.don_lech_da_biet || !MOC.don_lech_da_biet.length ? null
        : lech.map(x => x.ma).sort().join('|') === MOC.don_lech_da_biet.slice().sort().join('|'))]
  ]);

  console.log('\n| Chỉ tiêu | Phải ra | Bản JS | |\n|---|---|---|---|');
  bangKQ.forEach(r => console.log('| ' + r[0] + ' | ' + r[1] + ' | ' + r[2] + ' | ' + r[4] + ' |'));

  console.log('\nChi tiết:');
  console.log('  Loại file nhận ra: ' + JSON.stringify(A.kq.loaiFile) + ' · bỏ ' + A.kq.donBoQuaHuyHoan + ' đơn hủy/hoàn');
  console.log('  Chạy A (giữ dữ liệu tay): ghi ' + A.kq.donGhi + ' đơn, bỏ qua ' + A.kq.donDaCo + ' đơn đã có, ' + A.kq.dongVang + ' dòng vàng');
  console.log('  Chạy B (bản trống): ' + JSON.stringify(tkTrong[TEN_SHEET]) + ' · gộp ' + gopMoi.soDon + ' đơn');
  console.log('  Chỉ nhân viên có: ' + chiTay.length + (chiTay.length ? ' (' + chiTay.slice(0, 12).join(', ') + (chiTay.length > 12 ? ' …' : '') + ')' : ''));
  console.log('  Chỉ tool có     : ' + chiTool.length + (chiTool.length ? ' (' + chiTool.slice(0, 12).join(', ') + (chiTool.length > 12 ? ' …' : '') + ')' : ''));
  if (tongB.lTayNgoaiVung.length) console.log('  Ô L số tay NGOÀI vùng tool ghi (rác của bước dựng bản trống, tool đúng luật khi không đụng): dòng ' +
    tongB.lTayNgoaiVung.join(', ') + ' → L3 toàn cột ' + vn(tongB.L3) + ' chênh ' + vn(tongB.L3 - tongB.L3vung) + ' so với vùng tool ghi');
  console.log('  Mapping: dùng được ' + B.kq.mapTomTat.dungDuoc + '/' + B.kq.mapTomTat.tong + ' (cấu phần ' + B.kq.mapTomTat.cauPhan +
    ', chưa xác nhận ' + B.kq.mapTomTat.chuaXacNhan + ', chưa điền ' + B.kq.mapTomTat.chuaDien + ', lỗi ' + B.kq.mapTomTat.loi + ') · thêm mới ' + B.kq.tenMoi);
  if (lech.length) {
    console.log('\n  Đơn lệch tiền (tay − tool):');
    lech.slice(0, 15).forEach(x => console.log('    ' + x.ma + ': H ' + x.H + ' · I ' + x.I + ' · J ' + x.J + ' · K ' + x.K + ' (tay dòng ' + x.tay + ', tool dòng ' + x.tool + ')'));
    if (lech.length > 15) console.log('    … và ' + (lech.length - 15) + ' đơn nữa');
  }

  // bảng đối chiếu ra file RIÊNG (không thêm sheet vào file tracking)
  const csv = ['ma_don,co_tay,co_tool,tay_H,tool_H,lech_H,tay_I,tool_I,lech_I,tay_J,tool_J,lech_J,tay_K,tool_K,lech_K'];
  const moiMa = new Set([...Object.keys(tayGoc.theoMa), ...Object.keys(toolB.theoMa)]);
  moiMa.forEach(ma => {
    const t = tayGoc.theoMa[ma], o = toolB.theoMa[ma];
    csv.push([ma, t ? 1 : 0, o ? 1 : 0,
      ...['H', 'I', 'J', 'K'].flatMap(c => [t ? so(t[c]) : '', o ? so(o[c]) : '', (t && o) ? so(t[c]) - so(o[c]) : ''])].join(','));
  });
  fs.writeFileSync(path.join(OUT, 'DOI_CHIEU.csv'), '﻿' + csv.join('\r\n'), 'utf8');

  // ---------- GV-v2.5 mục 6: dọn bằng chứng NGAY SAU KHI SINH, trước khi giữ lại ----------
  // Chạy sau cùng, khi mọi phép đo ở trên đã đọc xong `outB`, để việc xóa sheet không thể
  // len vào một con số nào của bảng kết quả. `B_BAN_TRONG.xlsx` chỉ tồn tại khi có `--giu-file`.
  if (!args.includes('--giu-file')) { try { fs.unlinkSync(trong); } catch (e) { } }
  const daDon = [];
  for (const f of [outA, outB, trong]) { if (fs.existsSync(f)) daDon.push(await donSheetBiMat(f)); }
  console.log('\nDọn bằng chứng — xóa sheet ' + JSON.stringify(TEN_SHEET_BI_MAT)
    + ' khỏi bản lưu trong `out/` (đếm trong ruột zip, mọi phần .xml và .rels):');
  console.log('| File | Số sheet | Sheet xóa | `docs.google.com` | Chuỗi id (lượt) | Chuỗi id (loại) |');
  console.log('|---|---|---|---|---|---|');
  daDon.forEach((d) => console.log('| ' + d.ten + ' | ' + d.sheetTruoc + ' → ' + d.sheetSau + ' | ' + d.xoa
    + (d.xoa && !d.nguyenVan ? ' (khớp sau khi trim)' : '') + ' | ' + d.linkTruoc + ' → ' + d.linkSau
    + ' | ' + d.idTruoc + ' → ' + d.idSau + ' | ' + d.loaiIdTruoc + ' → ' + d.loaiIdSau + ' |'));

  fs.writeFileSync(path.join(OUT, 'KET_QUA.json'), JSON.stringify({ bangKQ, lech, chiTay, chiTool, tongB, gopMoi, tkTrong, daDon, kqA: A.kq, kqB: B.kq }, (k, v) => v instanceof Error ? v.message : v, 2));
  console.log('\nKết quả: ' + outA + '\n         ' + outB + '\n         ' + path.join(OUT, 'DOI_CHIEU.csv'));
  const soLech = bangKQ.filter(r => r[4] === 'LỆCH').length;
  const soChuaCoMoc = bangKQ.filter(r => r[4] === '?').length;
  if (soChuaCoMoc) {
    console.log(String.fromCharCode(10) + '=> ' + soChuaCoMoc + '/' + bangKQ.length + ' chỉ tiêu CHƯA CÓ MỐC để so.');
    console.log('   Số ở cột `Bản JS` là số thật vừa đo. Chép vào `moc-nghiem-thu.json` thì lần sau tự chấm.');
  }
  console.log(String.fromCharCode(10) + '=> ' + (soLech ? soLech + ' CHỈ TIÊU LỆCH — dừng lại, ghi NOTES_DEV.md và báo BA'
    : (soChuaCoMoc ? 'KHÔNG CHỈ TIÊU NÀO LỆCH (còn ' + soChuaCoMoc + ' chỉ tiêu chưa có mốc)' : 'TẤT CẢ CHỈ TIÊU ĐẠT')));
}

main().catch(e => { console.error('\nLỖI: ' + e.message + '\n' + e.stack); process.exit(1); });
