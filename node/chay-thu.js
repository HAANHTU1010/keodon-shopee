/**
 * chay-thu.js — vỏ Node: chạy luồng kéo đơn trên máy (GIAI ĐOẠN 1 — ghi ra bản sao file tracking .xlsx).
 *
 *   node node/chay-thu.js [--tracking <file>] [--mapping <file>] [--ngay YYYY-MM-DD] [--thoi-diem "YYYY-MM-DD HH:MM"]
 *   node node/chay-thu.js --van-hanh <thư mục 03_VAN_HANH>      ← chế độ VẬN HÀNH (CHAY_TOOL.bat gọi)
 *
 *   Chế độ DEV (mặc định): đọc `du-lieu-vao/<GIAN>/*.xlsx` → ghi `out/<tên gốc>_AUTO_<yyyymmdd_HHMM>.xlsx`,
 *       file đã đọc chuyển sang `da-xu-ly/<GIAN>/`.
 *   Chế độ VẬN HÀNH: đọc `03_VAN_HANH/CAU_HINH_VAN_HANH.json`, lấy file ở `1_THA_FILE_XUAT/<GIAN>/`,
 *       chọn file tracking trong `2_FILE_TRACKING/` (hoặc bản `_AUTO_` mới nhất ở `3_KET_QUA/`),
 *       ghi `3_KET_QUA/<gốc>_AUTO_<ngày giờ>.xlsx` + `LOG_<ngày giờ>.txt`, chuyển file sang `4_DA_XU_LY/<GIAN>/`.
 *       Mã thoát: 0 xong · 2 không có file mới · 1 lỗi (đã in rõ phải làm gì).
 */
const fs = require('fs');
const path = require('path');
const { napLoi } = require('./nap-loi');
const { NguonThuMuc } = require('./nguon-thu-muc');
const { chayLenGoogleSheet, thangCua } = require('./chay-google-sheet');
const { WebAppGoogleSheet } = require('./gsheet-web-app');
const { KhoTracking, duongDanOut, docBangXlsx, TEN_SHEET_MAPPING } = require('./kho-tracking');

const ROOT = path.join(__dirname, '..');
const DAU_VAO_MAC_DINH = path.join(ROOT, '..', '..', '00_DAU_VAO');
const args = process.argv.slice(2);
function thamSo(ten) { const i = args.indexOf(ten); return i >= 0 ? args[i + 1] : null; }

const lop = napLoi();

// ---------------------------------------------------------------- tiện ích

function docJson(p) {
  const s = fs.readFileSync(p, 'utf8').replace(/^﻿/, '');
  try { return JSON.parse(s); } catch (e) { throw new Error('File cấu hình ' + p + ' không đúng định dạng JSON: ' + e.message); }
}

function cacFileXlsx(thuMuc, loc) {
  if (!thuMuc || !fs.existsSync(thuMuc)) return [];
  return fs.readdirSync(thuMuc)
    .filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$') && (!loc || loc(f)))
    .map(f => ({ f, p: path.join(thuMuc, f), t: fs.statSync(path.join(thuMuc, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
}

/** Bảng Mapping khởi tạo: dùng khi file tracking chưa có sheet `Mapping sản phẩm`. */
async function mappingKhoiTao(duongDan) {
  if (!duongDan || !fs.existsSync(duongDan)) return null;
  return docBangXlsx(duongDan, TEN_SHEET_MAPPING);
}

/**
 * Đọc lớp 1 của mọi file CHỈ để soát trước khi ghi bất cứ thứ gì. File hỏng thì bỏ qua ở đây,
 * luồng chính vẫn báo lỗi file đó như cũ; việc của hàm này là bắt lỗi thả nhầm thư mục gian hàng.
 */
function quetLop1(files, cfg) {
  const ds = [];
  for (const f of files) {
    try {
      const a = lop.AdapterFileXuat.doc(f.docBang(), { san: f.san, maGianHang: f.maGianHang, tenFile: f.tenFile }, cfg);
      ds.push({
        maGianHang: f.maGianHang, tenFile: f.tenFile,
        maDon: a.dong.map(d => d.maDonSan),
        tenListing: a.dong.map(d => d.tenListing)
      });
    } catch (e) { /* file hỏng: để luồng chính báo lỗi và chuyển sang 4_DA_XU_LY\LOI */ }
  }
  return ds;
}

// D-04: ngưỡng cho chắc tay. Ít listing khớp được (Mapping còn trống) hoặc tỷ lệ chưa áp đảo thì im lặng,
// thà bỏ sót còn hơn chặn oan một file thả đúng chỗ.
const D04_TOI_THIEU = 5;
const D04_TY_LE = 0.8;

/**
 * Chỉ mục "tên listing → mã gian hàng" lấy từ sheet Mapping sản phẩm.
 * Listing từng khai ở NHIỀU gian (hàng bán chung, hoặc Mapping đã bị một lần chạy nhầm làm bẩn) thì bỏ,
 * vì không kết luận được gì. Không dòng nào khai gian hàng → trả null, vỏ bỏ qua phép kiểm.
 */
function gianTheoListing(bangMap, cfg) {
  if (!bangMap || !bangMap.length) return null;
  const head = (bangMap[0] || []).map(h => lop.MapListing.tenCotChuan(h));
  const iTen = head.indexOf('Tên trên Shopee'), iGian = head.indexOf('Gian hàng');
  if (iTen < 0 || iGian < 0) return null;
  const gianCua = {};
  for (let r = 1; r < bangMap.length; r++) {
    const ten = lop.Utils.chuanHoaChuoi((bangMap[r] || [])[iTen]);
    const g = lop.MapListing.maGian(cfg, (bangMap[r] || [])[iGian]);
    if (!ten || !cfg.gianHang[g]) continue;
    (gianCua[ten] = gianCua[ten] || {})[g] = 1;
  }
  const idx = {};
  Object.keys(gianCua).forEach(t => {
    const g = Object.keys(gianCua[t]);
    if (g.length === 1) idx[t] = g[0];
  });
  return Object.keys(idx).length ? idx : null;
}

/**
 * D-04: file xuất của gian hàng khác bị thả nhầm vào thư mục gian này. File xuất không có cột gian hàng,
 * nhưng sheet Mapping sản phẩm đã ghi mỗi tên listing thuộc gian nào; đa số áp đảo listing của file thuộc
 * một gian KHÁC thư mục người ta thả vào là dấu hiệu thả nhầm. Dừng trước khi ghi, không đoán, không ghi bừa.
 * @param {Array} daDoc  kết quả quetLop1
 * @param {Array} bangMap  bảng Mapping (2 chiều) hoặc null nếu chưa có
 */
function kiemTraGianQuaMapping(daDoc, bangMap, cfg) {
  const idx = gianTheoListing(bangMap, cfg);
  if (!idx) return;                                  // Mapping chưa khai gian hàng nào → không đoán bừa
  const loi = [];
  daDoc.forEach(x => {
    const dem = {}, daXet = {};
    let khop = 0;
    (x.tenListing || []).forEach(t => {
      const k = lop.Utils.chuanHoaChuoi(t);
      if (!k || daXet[k] || !idx[k]) return;
      daXet[k] = 1; khop++;
      dem[idx[k]] = (dem[idx[k]] || 0) + 1;
    });
    const cuaThuMuc = dem[x.maGianHang] || 0;
    if (khop < D04_TOI_THIEU || (khop - cuaThuMuc) / khop < D04_TY_LE) return;
    const khac = Object.keys(dem).filter(g => g !== x.maGianHang).sort((a, b) => dem[b] - dem[a])[0];
    loi.push('      · ' + x.tenFile + ' đang nằm trong thư mục ' + x.maGianHang + ' nhưng ' + dem[khac] + '/' + khop +
      ' tên hàng của nó đã khai ở gian ' + cfg.gianHang[khac].ten + ' (' + khac + ')');
  });
  if (!loi.length) return;
  throw new Error(
    'File xuất thả nhầm thư mục gian hàng (đối chiếu tên hàng với sheet Mapping sản phẩm):\n' +
    loi.join('\n') + '\n' +
    '  Ghi tiếp là đơn của gian này chui vào sheet gian khác.\n' +
    '  Cách sửa: chuyển file sang đúng thư mục gian hàng của nó rồi bấm chạy lại.\n' +
    '  File đúng chỗ mà vẫn bị chặn: sheet Mapping sản phẩm đang khai sai gian cho các tên hàng đó\n' +
    '            (thường do một lần chạy nhầm trước để lại). Sửa cột "Gian hàng" của các dòng đó rồi chạy lại.\n' +
    '  Tool chưa ghi gì cả.');
}

/**
 * Một mã đơn chỉ được nằm ở ĐÚNG MỘT sheet gian hàng. Thấy nó ở hai sheet nghĩa là đã có một lần
 * chạy trước thả file vào nhầm thư mục gian hàng và đơn bị ghi vào sai sổ.
 *
 * Triệu chứng thật 08/9/2026: chủ dự án thả nhầm file, 432 đơn của Shopee mall bị ghi vào sheet
 * `Importmart` và 12 đơn vào `Babyiu`, sheet `Shopee mall` không có đơn nào. Cấu hình mặc định
 * `tiep_tuc_tu_ket_qua_moi_nhat` lại lấy chính file kết quả đó làm đầu vào lần sau, nên cái bẩn
 * sẽ đi tiếp mãi nếu không ai nhận ra.
 *
 * Cảnh báo chứ không chặn: tool không gây ra chuyện này và cũng không sửa được. Người phải quyết.
 */
function kiemTraTrackingBanTruoc(kho, cfg) {
  const k = cfg.keyin;
  const viTri = {};
  for (const ma of Object.keys(cfg.gianHang)) {
    const ten = cfg.gianHang[ma].sheet;
    const ss = kho.docSheet(ten);
    if (!ss) continue;
    for (let r = k.dong_dau; r <= ss.soDong; r++) {
      const o = (ss.giaTri[r - 1] || [])[k.cot_ma_don - 1];
      const s = o == null ? '' : String(o).trim();
      if (!s) continue;
      if (!viTri[s]) viTri[s] = new Set();
      viTri[s].add(ten);
    }
  }
  const trung = Object.keys(viTri).filter((m) => viTri[m].size > 1);
  if (!trung.length) return null;

  const theoCap = {};
  for (const m of trung) {
    const cap = [...viTri[m]].sort().join(' và ');
    (theoCap[cap] = theoCap[cap] || []).push(m);
  }
  const dong = ['CẢNH BÁO: file tracking đang dùng có ' + trung.length +
    ' mã đơn nằm ở HƠN MỘT sheet gian hàng. Một đơn chỉ thuộc một gian hàng.'];
  for (const cap of Object.keys(theoCap)) {
    dong.push('  · ' + cap + ': ' + theoCap[cap].length + ' mã, ví dụ ' + theoCap[cap].slice(0, 3).join(', '));
  }
  dong.push('  Gần như chắc chắn một lần chạy trước đã thả file xuất vào nhầm thư mục gian hàng.');
  dong.push('  Việc phải làm: mở file tracking, xóa các dòng đơn nằm sai sheet, rồi chạy lại từ');
  dong.push('  file tracking sạch trong 2_FILE_TRACKING. Tool KHÔNG tự xóa dòng của bạn.');
  return dong.join('\n');
}

function tomTat(kq, cfg) {
  // Cảnh báo nặng nhất phải đứng TRÊN dòng "GHI THÊM N đơn", không nằm lẫn dưới hàng trăm dòng
  // "chưa nhận ra". Chủ dự án 08/9/2026 đọc "GHI THÊM 414 đơn" tưởng chạy xong, mở file ra thì
  // 444/444 dòng đều vàng vì Mapping chưa ai tick. Lõi đặt câu đó ở kq.canhBao[0].
  const nang = (kq.canhBao || []).filter(function (c) { return String(c).indexOf('CHƯA DÙNG ĐƯỢC') >= 0; });
  const d = nang.slice();
  d.push(`Đọc ${kq.soFile} file (${kq.soFileLoi} lỗi) · ${kq.soDonDoc} đơn / ${kq.soDongDoc} dòng hàng`);
  if (kq.donBoQuaHuyHoan) d.push(`Bỏ ${kq.donBoQuaHuyHoan} đơn hủy/hoàn (file tab "Tất cả")`);
  d.push(`GHI THÊM ${kq.donGhi} đơn (${kq.dongGhi} dòng, ${kq.donGopO} đơn nhiều hàng đã gộp ô) · bỏ qua ${kq.donDaCo} đơn đã có`);
  d.push(`DÒNG VÀNG cần người xem: ${kq.dongVang}` + (kq.dongVang ? ` — mở file kết quả, đọc cột "${cfg.keyin.tieu_de_note}"` : ''));
  if (kq.tenMoi) d.push(`Mapping sản phẩm: thêm ${kq.tenMoi} tên hàng mới chờ điền`);
  if (kq.giaTriTayThay) d.push(`Trả lại công thức cho ${kq.giaTriTayThay} ô cột Doanh Thu bị gõ số tay`);
  return d;
}

function ghiFileLog(duongDan, tieuDe, kq, cfg) {
  const dong = [tieuDe, ''].concat(tomTat(kq, cfg));
  if (kq.canhBao.length) dong.push('', 'CẦN XEM:', ...kq.canhBao.map(c => '  · ' + c));
  dong.push('', 'NHẬT KÝ CHI TIẾT:');
  kq.nhatKy.forEach(r => {
    const o = lop.Utils.mangSangDoiTuong(lop.LOG_COT, r);
    dong.push([lop.Utils.dinhDangNgayGio(o.thoi_diem), o.gian_hang || '-', o.ten_file || '-',
      'đơn đọc ' + o.so_don_doc, 'ghi ' + o.so_don_ghi, 'đã có ' + o.so_don_da_co,
      'dòng ' + o.so_dong_ghi, 'vàng ' + o.so_dong_vang, 'tên mới ' + o.so_ten_moi, 'lỗi ' + o.so_loi,
      String(o.thong_bao || '')].join(' | '));
  });
  fs.writeFileSync(duongDan, '﻿' + dong.join('\r\n') + '\r\n', 'utf8');
}

// ---------------------------------------------------------------- chế độ DEV

async function chayDev() {
  const thoiDiem = thamSo('--thoi-diem') ? lop.Utils.parseNgay(thamSo('--thoi-diem')) : new Date();
  const ngayGhi = thamSo('--ngay') || null;
  const cfg = lop.Config.tao();
  const goc = thamSo('--tracking') ? path.resolve(thamSo('--tracking'))
    : (cacFileXlsx(path.join(ROOT, 'out'), f => /_AUTO_/i.test(f))[0] || {}).p
    || path.join(DAU_VAO_MAC_DINH, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');
  const out = duongDanOut(goc, path.join(ROOT, 'out'), thoiDiem, lop);
  const fileMapping = thamSo('--mapping') || path.join(DAU_VAO_MAC_DINH, 'DEMO_Mapping_san_pham.xlsx');
  const mapKhoiTao = await mappingKhoiTao(fileMapping);

  console.log('File tracking : ' + goc);
  console.log('Kết quả       : ' + out);
  console.log('Mapping mẫu   : ' + (mapKhoiTao ? fileMapping + ' (' + (mapKhoiTao.length - 1) + ' dòng)' : '(không có — file tracking phải sẵn sheet Mapping sản phẩm)'));

  const nguon = new NguonThuMuc(path.join(ROOT, 'du-lieu-vao'), path.join(ROOT, 'da-xu-ly'));
  nguon.kiemTraThaSaiCho(cfg);        // chế độ dev cũng dính bẫy bỏ qua im lặng y hệt vận hành
  const kho = new KhoTracking(goc, out, lop, { mappingKhoiTao: mapKhoiTao });
  await kho.nap(cfg);
  let kq;
  try {
    kq = lop.chayDongBo(nguon, kho, { thoiDiem, ngayGhi, cfg, hoanThanhSau: true });
  } finally {
    if (kq && !kq.boQua && kq.soFile) await kho.luu();
  }
  // Lưu xong xuôi (tự kiểm tra đã đạt) mới chuyển file nguồn sang 4_DA_XU_LY. Lưu hỏng thì file
  // vẫn nằm trong thư mục thả để bấm chạy lại — không bắt người vận hành đi tìm file.
  if (kq && kq.danhDauFile) kq.danhDauFile();
  console.log('\n=== KẾT QUẢ ' + lop.Utils.dinhDangNgayGio(thoiDiem) + ' ===');
  tomTat(kq, cfg).forEach(d => console.log('  ' + d));
  if (kq.canhBao.length) console.log('\nCần xem:\n  · ' + kq.canhBao.slice(0, 25).join('\n  · ') + (kq.canhBao.length > 25 ? '\n  · … và ' + (kq.canhBao.length - 25) + ' dòng nữa' : ''));
  if (kq.soFile) console.log('\nĐã ghi: ' + out);
}

// ---------------------------------------------------------------- chế độ VẬN HÀNH (đề bài mục 1.6)

/** Chọn file tracking cho người vận hành; trả về { goc, lyDo } hoặc ném lỗi kèm hướng dẫn. */
function chonFileTracking(cv, thoiDiem) {
  const abs = (p) => path.resolve(cv.__thuMuc, p);
  const autoMoiNhat = (loc) => cacFileXlsx(cv.__ketQua, f => /_AUTO_\d{8}_\d{4}(_\d+)?\.xlsx$/i.test(f) && (!loc || loc(f)))[0] || null;
  const tiepTuc = cv.tiep_tuc_tu_ket_qua_moi_nhat !== false;
  const thang = cv.thang && typeof cv.thang === 'object' ? cv.thang : {};

  if (Object.keys(thang).length) {
    const khoa = thoiDiem.getFullYear() + '-' + String(thoiDiem.getMonth() + 1).padStart(2, '0');
    if (!thang[khoa]) {
      throw new Error('Chưa khai báo file tracking cho tháng ' + khoa + '.\n' +
        '  Cách sửa: mở CAU_HINH_VAN_HANH.json, trong mục "thang" thêm dòng\n' +
        '      "' + khoa + '": "2_FILE_TRACKING/<tên file của tháng>.xlsx"\n' +
        '  Tool KHÔNG bao giờ tự ghi lùi vào file tháng trước.');
    }
    const f = abs(thang[khoa]);
    if (!fs.existsSync(f)) throw new Error('File tracking tháng ' + khoa + ' không tồn tại: ' + f + '\n  Tải bản .xlsx của tháng từ Google Sheet, đặt vào 2_FILE_TRACKING rồi chạy lại.');
    const base = path.basename(f, '.xlsx');
    const auto = tiepTuc ? autoMoiNhat(x => x.startsWith(base + '_AUTO_')) : null;
    if (auto && auto.t > fs.statSync(f).mtimeMs) return { goc: auto.p, lyDo: 'bản kết quả mới nhất của tháng ' + khoa };
    return { goc: f, lyDo: 'file tracking tháng ' + khoa };
  }
  if (cv.file_tracking) {
    const f = abs(cv.file_tracking);
    if (!fs.existsSync(f)) throw new Error('File tracking khai trong CAU_HINH_VAN_HANH.json không tồn tại: ' + f);
    const base = path.basename(f, '.xlsx');
    const auto = tiepTuc ? autoMoiNhat(x => x.startsWith(base + '_AUTO_')) : null;
    if (auto && auto.t > fs.statSync(f).mtimeMs) return { goc: auto.p, lyDo: 'bản kết quả mới nhất' };
    return { goc: f, lyDo: 'file_tracking trong cấu hình' };
  }
  const ungVien = cacFileXlsx(cv.__fileTracking).map(x => Object.assign({ lyDo: 'file mới nhất trong 2_FILE_TRACKING' }, x))
    .concat(tiepTuc ? cacFileXlsx(cv.__ketQua, f => /_AUTO_\d{8}_\d{4}(_\d+)?\.xlsx$/i.test(f)).map(x => Object.assign({ lyDo: 'bản kết quả mới nhất (chạy tiếp lần trước)' }, x)) : [])
    .sort((a, b) => b.t - a.t);
  if (!ungVien.length) {
    throw new Error('Thư mục 2_FILE_TRACKING chưa có file nào.\n' +
      '  Cách sửa: mở Google Sheet của tháng → File → Tải xuống → Microsoft Excel (.xlsx),\n' +
      '  chép file đó vào ' + cv.__fileTracking + ' rồi bấm lại.');
  }
  return { goc: ungVien[0].p, lyDo: ungVien[0].lyDo };
}

async function chayVanHanh(thuMuc) {
  const vh = path.resolve(thuMuc);
  const fileCfg = path.join(vh, 'CAU_HINH_VAN_HANH.json');
  if (!fs.existsSync(fileCfg)) throw new Error('Không tìm thấy ' + fileCfg + '\n  Chạy CAI_DAT_1_LAN.bat trước.');
  const cv = docJson(fileCfg);
  cv.__thuMuc = vh;
  cv.__thaFile = path.resolve(vh, cv.thu_muc_tha_file || '1_THA_FILE_XUAT');
  cv.__fileTracking = path.resolve(vh, cv.thu_muc_file_tracking || '2_FILE_TRACKING');
  cv.__ketQua = path.resolve(vh, cv.thu_muc_ket_qua || '3_KET_QUA');
  cv.__daXuLy = path.resolve(vh, cv.thu_muc_da_xu_ly || '4_DA_XU_LY');
  [cv.__thaFile, cv.__fileTracking, cv.__ketQua, cv.__daXuLy].forEach(d => fs.mkdirSync(d, { recursive: true }));

  const thoiDiem = thamSo('--thoi-diem') ? lop.Utils.parseNgay(thamSo('--thoi-diem')) : new Date();
  const ngayGhi = thamSo('--ngay') || cv.ngay_ghi || null;
  const cfg = lop.Config.tao(cv.cau_hinh);

  // GIAI ĐOẠN 2: ghi thẳng lên Google Sheet qua Web App, không đụng file .xlsx trên máy.
  if (cv.google_sheet && cv.google_sheet.bat === true) return chayVanHanhGoogle(cv, cfg, thoiDiem, ngayGhi);

  const chon = chonFileTracking(cv, thoiDiem);
  const out = duongDanOut(chon.goc, cv.__ketQua, thoiDiem, lop);
  const nhan = lop.Utils.nhanThoiDiem(thoiDiem);
  const fileLog = path.join(cv.__ketQua, 'LOG_' + nhan + '.txt');
  const mapKhoiTao = await mappingKhoiTao(cv.file_mapping_mau ? path.resolve(vh, cv.file_mapping_mau) : null);

  const nguon = new NguonThuMuc(cv.__thaFile, cv.__daXuLy);

  console.log('=== KÉO ĐƠN SHOPEE VÀO FILE TRACKING — ' + lop.Utils.dinhDangNgayGio(thoiDiem) + ' ===');
  console.log('Đọc file tracking : ' + path.basename(chon.goc) + '   (' + chon.lyDo + ')');
  console.log('Thư mục thả file  : ' + cv.__thaFile);
  console.log('Đang chờ          : ' + nguon.dongDangCho(cfg));

  // Thả sai chỗ phải hỏng ồn ào TRƯỚC lối ra "không có file mới": ba file .xlsx nằm ở gốc thư mục thả
  // mà báo "không có file mới" là người vận hành yên trí bỏ đi trong khi chưa đơn nào được kéo.
  nguon.kiemTraThaSaiCho(cfg);
  const boQua = nguon.fileBoQua(cfg);
  if (boQua.length) console.log('Bỏ qua (chỉ nhận .xlsx): ' + boQua.join(', '));
  const fileMoi = nguon.layFileMoi(cfg);
  if (!fileMoi.length) {
    console.log('\nKHÔNG CÓ FILE MỚI — không có gì để làm, tool chưa ghi gì cả.');
    console.log('  Vừa chạy xong? File lần trước đã chuyển sang ' + cv.__daXuLy + ' nên không còn nằm ở thư mục thả nữa.');
    console.log('  Muốn chạy tiếp: thả file xuất Shopee (.xlsx, tab "Chờ lấy hàng") vào ' + cv.__thaFile + '\\<TÊN GIAN HÀNG>\\ rồi bấm lại.');
    console.log('  Thả lại đúng file cũ cũng được: đơn đã ghi sẽ bị bỏ qua, không bao giờ ghi trùng.');
    return 2;
  }

  // Soát mã đơn giữa các thư mục gian hàng khi chưa ghi gì: một mã đơn ở hai gian hàng là dấu hiệu
  // chắc chắn của thả nhầm chỗ (lớp 1 chạy lại trong chayDongBo ngay sau đây, tốn thêm một lượt đọc file).
  const daDoc = quetLop1(fileMoi, cfg);
  NguonThuMuc.kiemTraTrungGianHang(daDoc);

  const kho = new KhoTracking(chon.goc, out, lop, { mappingKhoiTao: mapKhoiTao });
  await kho.nap(cfg);
  // D-04: nạp xong mới có sheet Mapping để đối chiếu; nạp chỉ đọc, chưa ghi gì vào file kết quả.
  kiemTraGianQuaMapping(daDoc, kho.docMapping(), cfg);
  const banTruoc = kiemTraTrackingBanTruoc(kho, cfg);
  if (banTruoc) console.log(String.fromCharCode(10) + banTruoc + String.fromCharCode(10));
  let kq;
  try {
    kq = lop.chayDongBo(nguon, kho, { thoiDiem, ngayGhi, cfg, hoanThanhSau: true });
  } finally {
    if (kq && !kq.boQua && kq.soFile) await kho.luu();
  }
  // Lưu xong xuôi (tự kiểm tra đã đạt) mới chuyển file nguồn sang 4_DA_XU_LY. Lưu hỏng thì file
  // vẫn nằm trong thư mục thả để bấm chạy lại — không bắt người vận hành đi tìm file.
  if (kq && kq.danhDauFile) kq.danhDauFile();

  console.log('\n=== XONG ===');
  tomTat(kq, cfg).forEach(d => console.log('  ' + d));
  if (kq.soFileLoi) console.log('  CÓ FILE LỖI — file đó đã chuyển sang 4_DA_XU_LY\\LOI\\, xem nhật ký bên dưới.');
  console.log('\nFile kết quả: ' + out);
  console.log('Nhật ký     : ' + fileLog);
  if (kq.dongVang) console.log('\nViệc cần làm: mở file kết quả → sheet gian hàng → tìm DÒNG VÀNG → đọc cột "' + cfg.keyin.tieu_de_note + '";\n              sang sheet "Mapping sản phẩm" điền Tên viết tắt cho dòng vàng rồi ghi CÓ ở cột Xác nhận.');
  ghiFileLog(fileLog, 'KÉO ĐƠN — ' + lop.Utils.dinhDangNgayGio(thoiDiem) + '\nFile tracking: ' + chon.goc + ' (' + chon.lyDo + ')\nFile kết quả: ' + out, kq, cfg);
  return kq.soFileLoi ? 1 : 0;
}

/**
 * Chế độ Google Sheet (GV-v2.2 mục 1.7). Máy tính chỉ đọc file xuất rồi gửi lệnh; file tháng nằm
 * trên Google, do Web App chọn theo sheet `SỔ LINK THÁNG`. Không sinh file .xlsx kết quả.
 */
async function chayVanHanhGoogle(cv, cfg, thoiDiem, ngayGhi) {
  const thang = thangCua(thoiDiem);
  const fileLog = path.join(cv.__ketQua, 'LOG_' + lop.Utils.nhanThoiDiem(thoiDiem) + '.txt');
  const nguon = new NguonThuMuc(cv.__thaFile, cv.__daXuLy);
  console.log('=== KÉO ĐƠN SHOPEE LÊN GOOGLE SHEET — ' + lop.Utils.dinhDangNgayGio(thoiDiem) + ' ===');
  console.log('Đích ghi          : Google Sheet của tháng ' + thang + ' (qua Web App Apps Script)');
  console.log('Thư mục thả file  : ' + cv.__thaFile);
  console.log('Đang chờ          : ' + nguon.dongDangCho(cfg));

  // Kiểm cấu hình Web App TRƯỚC khi đụng tới file của người dùng: thiếu link hay chuỗi bí mật thì
  // phải hỏng ngay lúc chưa di chuyển gì, để file xuất còn nguyên trong thư mục thả.
  new WebAppGoogleSheet(Object.assign({ bat: true }, cv.google_sheet || {}));

  // Thả sai chỗ: dừng trước cả lối ra "không có file mới" (xem chú thích ở chayVanHanh).
  nguon.kiemTraThaSaiCho(cfg);
  const boQua = nguon.fileBoQua(cfg);
  if (boQua.length) console.log('Bỏ qua (chỉ nhận .xlsx): ' + boQua.join(', '));
  const files = nguon.layFileMoi(cfg);
  if (!files.length) {
    console.log('\nKHÔNG CÓ FILE MỚI — không có gì để làm, tool chưa ghi gì cả.');
    console.log('  Thả file xuất Shopee (.xlsx) vào ' + cv.__thaFile + ' rồi bấm lại.');
    return 2;
  }

  // lớp 1: đọc từng file; một file hỏng không làm hỏng file khác
  const cacFile = [], loi = [], fileOk = [], fileLoi = [];
  let soDongDoc = 0, soDonDoc = 0, boHuyHoan = 0;
  for (const f of files) {
    try {
      const a = lop.AdapterFileXuat.doc(f.docBang(), { san: f.san, maGianHang: f.maGianHang, tenFile: f.tenFile }, cfg);
      cacFile.push({ maGianHang: f.maGianHang, tenFile: f.tenFile, dong: a.dong });
      const ma = {};
      a.dong.forEach((d) => { ma[d.maDonSan] = 1; });
      soDongDoc += a.dong.length;
      soDonDoc += Object.keys(ma).length;
      boHuyHoan += a.soDonBoQua;
      fileOk.push(f);
    } catch (e) {
      loi.push(f.tenFile + ': ' + e.message);
      fileLoi.push(f);
    }
  }

  // Soát khi chưa gửi gì lên Google và chưa chuyển file nào đi.
  const daDoc = cacFile.map(x => ({
    maGianHang: x.maGianHang, tenFile: x.tenFile,
    maDon: x.dong.map(d => d.maDonSan), tenListing: x.dong.map(d => d.tenListing)
  }));
  NguonThuMuc.kiemTraTrungGianHang(daDoc);
  // D-04: Mapping thật nằm trên Google Sheet, máy này không đọc được trước khi gọi Web App. Có file mẫu
  // trong cấu hình thì đối chiếu tạm bằng file mẫu; không có thì thôi, không đoán bừa.
  kiemTraGianQuaMapping(daDoc, await mappingKhoiTao(cv.file_mapping_mau ? path.resolve(cv.__thuMuc, cv.file_mapping_mau) : null), cfg);

  const kq = await chayLenGoogleSheet({
    lop, cfg, cacFile, thang, ngayGhi, thoiDiem,
    cauHinhGoogle: cv.google_sheet,
    in: (t) => console.log(t)
  });

  // Ghi lên Google xong mới chuyển file nguồn đi. Gọi mạng hỏng thì file vẫn nằm nguyên chỗ cũ,
  // người vận hành bấm lại là chạy tiếp, không phải đi tìm file trong 4_DA_XU_LY.
  fileOk.forEach((f) => nguon.danhDauDaXuLy(f));
  fileLoi.forEach((f) => nguon.danhDauLoi(f));

  const d = [];
  d.push('Đọc ' + files.length + ' file (' + loi.length + ' lỗi) · ' + soDonDoc + ' đơn / ' + soDongDoc + ' dòng hàng');
  if (boHuyHoan) d.push('Bỏ ' + boHuyHoan + ' đơn hủy/hoàn (file tab "Tất cả")');
  d.push('GHI THÊM ' + kq.thongKe.donGhi + ' đơn (' + kq.thongKe.dongGhi + ' dòng) · bỏ qua ' + kq.thongKe.donDaCo + ' đơn đã có');
  d.push('DÒNG VÀNG cần người xem: ' + kq.thongKe.dongVang);
  if (kq.thongKe.tenMoi) d.push('Mapping sản phẩm: thêm ' + kq.thongKe.tenMoi + ' tên hàng mới chờ điền');
  console.log('\n=== XONG ===');
  d.forEach((x) => console.log('  ' + x));
  console.log('\nFile trên Google Sheet: ' + (kq.tenFile || '(không rõ tên)'));
  console.log('Nhật ký               : ' + fileLog);
  (kq.canhBao || []).slice(0, 30).forEach((c) => console.log('  ! ' + c));
  loi.forEach((c) => console.log('  LỖI FILE: ' + c));

  fs.writeFileSync(fileLog,
    'KÉO ĐƠN LÊN GOOGLE SHEET — ' + lop.Utils.dinhDangNgayGio(thoiDiem) +
    '\nTháng: ' + thang + ' · file: ' + (kq.tenFile || '') + '\n\n' + d.join('\n') +
    '\n\nCẦN XEM:\n' + (kq.canhBao || []).map((c) => '  · ' + c).join('\n') +
    (loi.length ? '\n\nFILE LỖI:\n' + loi.map((c) => '  · ' + c).join('\n') : '') + '\n', 'utf8');
  return loi.length ? 1 : 0;
}


// ---------------------------------------------------------------- điểm vào

async function main() {
  const vh = thamSo('--van-hanh');
  if (vh) process.exit(await chayVanHanh(vh));
  await chayDev();
}

main().catch(e => {
  console.error('\nLỖI: ' + e.message);
  if (thamSo('--van-hanh')) console.error('\nTool KHÔNG ghi gì vào file gốc. Làm theo hướng dẫn ở trên rồi bấm chạy lại;\nvẫn lỗi thì chụp màn hình này gửi người phụ trách.');
  process.exit(1);
});
