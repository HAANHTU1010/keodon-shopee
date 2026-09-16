/**
 * chay-tiktok.js — KÉO ĐƠN TIKTOK SHOP LÊN GOOGLE SHEET (Đợt 4, YC-49…YC-53; YC-54 chỉ nhận diện). Nút 4 gọi qua `chay-thu.js`.
 *
 * VÌ SAO ĐI ĐƯỜNG `ghi`, KHÔNG ĐI `xuLy` (đo 15/9, báo cáo phản biện P-4):
 *   · `xuLy` để Google TỰ TÍNH thuế (`Normalize.tinhThue`) — K của lõi khớp báo cáo TikTok chỉ 66/130 dòng, tức L lệch 1 đ ở 64 dòng.
 *     Đề bài chốt "không tự tính thuế, lấy thẳng từ báo cáo".
 *   · `xuLy` ghi MỘT ngày cho cả gói (`ngayGhi`); cột A TikTok từng tính theo mốc ngày TỪNG đơn — D-87 bản sửa (16/9) chốt lại cột A = NGÀY CHẠY như Shopee, lý do còn lại là thuế.
 *   Đường `ghi` có sẵn trên Google từ trước 2.4.0 (đường lùi đã nghiệm thu, `test-xu-ly` so từng ô hai đường): máy gửi lệnh ghi mang
 *   H/I/J/K và ngày của từng đơn; Google vẫn tự làm phần của nó — hợp đồng sổ tháng (YC-38.1), hàng rào công thức (YC-39), khử trùng tầng 2
 *   trong khóa, nối dòng, gộp ô C/H/I/J/K/L, chép công thức E/F/L/M/N, tô vàng + Note, tô lại Mapping. KHÔNG SỬA `.gs`, KHÔNG DEPLOY.
 *   Gian `TT_SHOP` khai cho Google qua `cauHinh` của gói (Config.tao gộp vào cấu hình mặc định) — gói Shopee không mang khóa này.
 *
 * TỪ ĐƠN CHUẨN TRỞ XUỐNG dùng CHÍNH lõi Shopee (`dungKeHoachGhi_` nạp từ `src/ShellAppsScript.gs`): tra Mapping bộ ba (Gian hàng, Tên trên sàn,
 * Phân loại), nổ Cấu phần / Hệ số, nối tên mới vào Mapping (dòng vàng), khử trùng tầng 1. Máy chỉ ĐÈ hai thứ trước khi gửi: `tien` (lấy thẳng
 * từ báo cáo); `ngay` chỉ đè khi hồ sơ không để NGAY_CHAY (mặc định D-87 bản sửa: ngày chạy). Không một dòng lõi nào đổi.
 *
 * LỖI Ở ĐÂY KHÔNG ĐƯỢC CHẶN SHOPEE: `chay-thu.js` bọc lời gọi, in lỗi, chạy tiếp bốn gian Shopee như cũ (TT-14).
 * Riêng thả nhầm sàn (`soatThaNhamSan`) thì dừng CẢ lượt khi chưa ghi gì — đó là cửa chắn trước mọi việc (YC-50).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { WebAppGoogleSheet, kiemPhienBan, dongHoVN } = require('./gsheet-web-app');
const { napVoGoogle, ngayCua, gomCanhBaoVungCongThuc } = require('./chay-google-sheet');
const { dongRun, dongRunTuKetQua } = require('./dong-run');

const TEN_THU_MUC_MAC_DINH = 'TikTok Shop';
const TEN_DA_XU_LY_MAC_DINH = 'đã xử lý';
/** Báo cáo tải về quá ngần này mà mới thả vào là nhắc (không chặn): đơn quyết toán sau (T+2)+1 ngày là rời khỏi tab "Sẽ thanh toán". */
const GIO_BAO_CAO_CU = 48;

// ==================================================================== đọc file

/**
 * Bảng 2 chiều ĐỦ dòng của một sheet SheetJS. KHÔNG tin `!ref`: báo cáo TikTok khai `<dimension ref="A1:BX6">` cho sheet 135 dòng
 * (đo 15/9) và `sheet_to_json` dừng đúng ở đó — đọc ra 1 dòng dữ liệu mà không báo gì (bẫy P-1). Dò lại vùng từ chính các ô.
 */
function bangDayDu(ws) {
  if (!ws) return null;
  let mr = -1, mc = -1;
  for (const k of Object.keys(ws)) {
    if (k[0] === '!') continue;
    const c = XLSX.utils.decode_cell(k);
    if (c.r > mr) mr = c.r;
    if (c.c > mc) mc = c.c;
  }
  if (mr < 0) return [];
  const ws2 = Object.assign({}, ws, { '!ref': XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: mr, c: mc } }) });
  return XLSX.utils.sheet_to_json(ws2, { header: 1, raw: true, defval: '', blankrows: true });
}

/** Workbook → { tenSheet[], bang(tên) } — mọi ô giữ CHUỖI như TikTok xuất (raw, không đổi ngày/số). */
function moWorkbook(p) {
  const wb = XLSX.readFile(p, { raw: true, cellDates: false });
  const cache = {};
  return {
    tenSheet: wb.SheetNames.slice(),
    bang: (t) => (t in cache ? cache[t] : (cache[t] = bangDayDu(wb.Sheets[t]))),
    /** Số dòng của vùng file KHAI (`!ref`) — để đối chiếu: đọc được ít hơn là đọc hụt. */
    dongKhai: (t) => { const ws = wb.Sheets[t]; return ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']).e.r + 1 : 0; }
  };
}

function xlsxTrong(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter((x) => /\.xlsx$/i.test(x) && !x.startsWith('~$') && fs.statSync(path.join(d, x)).isFile())
    .sort();
}

function thuMucTikTok(cv) {
  const ten = (cv.thu_muc_gian_hang && cv.thu_muc_gian_hang.TT_SHOP) || TEN_THU_MUC_MAC_DINH;
  return path.join(cv.__thaFile, ten);
}

function taoThuMuc(cv) {
  const d = thuMucTikTok(cv);
  fs.mkdirSync(path.join(d, cv.__tenDaXuLy || TEN_DA_XU_LY_MAC_DINH), { recursive: true });
  return d;
}

function coFile(cv) { return xlsxTrong(thuMucTikTok(cv)).length > 0; }

// ==================================================================== YC-50: soát thả nhầm sàn

/**
 * Dừng CẢ LƯỢT, khi chưa ghi gì và chưa chuyển file nào, nếu:
 *   · báo cáo TikTok nằm trong thư mục một gian Shopee (chỉ đọc TÊN SHEET — rẻ);
 *   · file Shopee (sheet `orders`) hay file không nhận ra nằm trong thư mục TikTok Shop.
 * Không tin tên thư mục — nhận diện bằng tên sheet + tập cột (`AdapterTikTok.nhanDien`).
 * @param {Object} o { lop, cv, cfg, thuMucShopee: (maGian) → đường dẫn }
 */
function soatThaNhamSan(o) {
  const { lop, cv, cfg } = o;
  const AT = lop.AdapterTikTok;
  const viPham = [];
  Object.keys(cfg.gianHang).forEach((g) => {
    const d = o.thuMucShopee(g);
    xlsxTrong(d).forEach((f) => {
      let ten = [];
      try { ten = XLSX.readFile(path.join(d, f), { bookSheets: true }).SheetNames; } catch (e) { return; }   // file hỏng: luồng Shopee báo như cũ
      if (AT.laSheetTikTok(ten)) {
        viPham.push('"' + f + '" là BÁO CÁO TIKTOK nhưng đang nằm trong thư mục gian Shopee "' + path.basename(d) + '" → chuyển sang thư mục "' +
          path.basename(thuMucTikTok(cv)) + '"');
      }
    });
  });
  const dTT = thuMucTikTok(cv);
  xlsxTrong(dTT).forEach((f) => {
    let nd;
    try {
      const wb = moWorkbook(path.join(dTT, f));
      nd = AT.nhanDien(wb.tenSheet, wb.bang);
      nd.dsSheet = wb.tenSheet;
    } catch (e) {
      viPham.push('"' + f + '" trong thư mục "' + path.basename(dTT) + '" không mở được (' + String(e && e.message).slice(0, 80) + ')');
      return;
    }
    if (nd.loai === 'SHOPEE') {
      viPham.push('"' + f + '" là FILE XUẤT SHOPEE (có sheet orders) nhưng đang nằm trong thư mục "' + path.basename(dTT) + '" → chuyển sang đúng ' +
        'thư mục gian Shopee của nó');
    } else if (nd.loai === 'KHONG_RO') {
      viPham.push('"' + f + '" trong thư mục "' + path.basename(dTT) + '" không phải báo cáo TikTok tool biết (các sheet: ' +
        nd.dsSheet.slice(0, 6).join(', ') + '). Báo cáo cần thả: Tài chính → Giao dịch → tab "Sẽ thanh toán" → Xuất');
    }
  });
  if (!viPham.length) return;
  const e = new Error('THẢ NHẦM SÀN — ' + viPham.length + ' file:\n' + viPham.map((x) => '      · ' + x).join('\n') +
    '\n  Tool chưa ghi gì và chưa chuyển file nào. Chuyển file về đúng thư mục rồi bấm chạy lại.');
  e.maKeodon = 'THA_NHAM_SAN';
  throw e;
}

// ==================================================================== tiện ích chạy

/** 'yyyy-MM-dd HH:mm:ss' (giờ Việt Nam, như TikTok ghi "Thời gian tải xuống") → mili-giây; không đọc được → null. */
function msGioVN(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(s == null ? '' : s).trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)) - 7 * 3600 * 1000 : null;
}

/**
 * Cột C của sheet `TikTok Shop` phải là CHUỖI mã đơn. Ô người gõ để kiểu số thì Google hiện `5.86087E+17` hoặc `586012345678901000` — khử
 * trùng so chuỗi sẽ TRƯỢT và tool ghi trùng đơn. Thấy dấu hiệu đó là DỪNG trước khi ghi (bẫy 1 phía sổ).
 */
function soatMaDonTrenSo(maTrenSo, maTrongFile) {
  const la = [];
  const theo15 = {};
  maTrongFile.forEach((m) => { theo15[m.slice(0, 15)] = m; });
  maTrenSo.forEach((m) => {
    if (/^\d+(\.\d+)?E\+\d+$/i.test(m) || /^\d{1,3}([.,]\d{3}){4,}$/.test(m)) { la.push(m); return; }
    if (/^\d{16,20}$/.test(m) && /000$/.test(m) && theo15[m.slice(0, 15)] && theo15[m.slice(0, 15)] !== m) la.push(m + ' (trông như ' + theo15[m.slice(0, 15)] + ' bị làm tròn)');
  });
  if (!la.length) return;
  const e = new Error('Cột C "Thông tin ĐH" của sheet TikTok Shop có ' + la.length + ' mã đơn đã bị Google đổi thành SỐ (' + la.slice(0, 3).join(', ') +
    ') — mã TikTok 18 chữ số mất chính xác khi thành số, tool KHÔNG khử trùng được và sẽ ghi trùng đơn. Việc phải làm: đặt định dạng cột C là ' +
    'Văn bản thuần rồi gõ lại đúng mã ở các ô đó. Tool chưa ghi gì.');
  e.maKeodon = 'MA_DON_TREN_SO_THANH_SO';
  throw e;
}

function chuyenDaXuLy(tep, thuMuc) {
  fs.mkdirSync(thuMuc, { recursive: true });
  const t = dongHoVN();
  const hai = (n) => String(n).padStart(2, '0');
  const nhan = '' + t.getFullYear() + hai(t.getMonth() + 1) + hai(t.getDate()) + '_' + hai(t.getHours()) + hai(t.getMinutes());
  const ten = path.basename(tep);
  let dich = path.join(thuMuc, ten.replace(/(\.[^.]+)$/, '_' + nhan + '$1'));
  let n = 1;
  while (fs.existsSync(dich)) { n++; dich = path.join(thuMuc, ten.replace(/(\.[^.]+)$/, '_' + nhan + '_' + n + '$1')); }
  fs.renameSync(tep, dich);
}

function ghiLog(tep, dong) {
  try { fs.writeFileSync(tep, '﻿' + dong.join('\r\n') + '\r\n', 'utf8'); } catch (e) { /* không ghi được nhật ký thì thôi */ }
}

const TEN_LY_DO = {
  KHONG_PHAI_DON_BAN: 'KHÔNG PHẢI ĐƠN BÁN (H ròng = 0: đơn hủy / hoàn tiền toàn bộ / khoản hoàn phí)',
  TREO_TRA_HANG: 'TREO — "Đang chờ hoàn tất trả hàng/hoàn tiền"',
  TREO_HOAN_MOT_PHAN: 'TREO — có khoản hoàn một phần, tool KHÔNG BAO GIỜ tự ghi (NHẬP TAY nếu đơn có bán thật)',
  DA_HUY: 'ĐÃ HỦY trong file Tất cả đơn hàng (Order Status)',
  TREO_THIEU_RTS: 'TREO — chưa có ngày sắp xếp vận chuyển',
  CHO_TINH_PHI: 'TikTok CHƯA TÍNH PHÍ (quyết toán ước tính = 0) — lượt sau ghi',
  KHONG_PHAI_DON_HANG: 'không phải giao dịch "Đơn hàng"'
};

/** Order Status của file Tất cả đơn hàng là "Đã hủy" (chịu hai kiểu bỏ dấu hủy/huỷ và bản tiếng Anh). */
function laDaHuy(s) {
  return /^(đã h(ủy|uỷ)|cancel+ed)$/i.test(String(s || '').normalize('NFC').trim());
}

// ==================================================================== chạy

/**
 * @param {Object} o
 *   lop, cv (cấu hình vận hành đã có __thaFile/__ketQua/__tenDaXuLy), thoiDiem, thang ('yyyy-MM'), runId,
 *   cauHinhGoogle { web_app_url, chuoi_bi_mat, link_thang, choPhepThangKhac }, in(text)
 * @returns {Promise<{ma:number, coViec:boolean, tenFile:string|null, thongKe:Object|null, dcn:Object|null, thieuMapping:Array, fileLog:string|null}>}
 *   ma: 0 xong · 2 không có báo cáo "Sẽ thanh toán" nào để ghi. LỖI thì NÉM (file nằm nguyên chỗ cũ).
 */
async function chayTikTok(o) {
  const { lop } = o;
  const AT = lop.AdapterTikTok;
  const in_ = o.in || (() => { });
  const cv = o.cv;
  const thuMuc = taoThuMuc(cv);
  const hoSo = AT.HO_SO.TIKTOK_SE_THANH_TOAN;
  const dong = [];                                  // nhật ký riêng của TikTok (YC-53)
  const noi = (t) => { dong.push(t); in_(t); };
  const gioVN = dongHoVN(o.thoiDiem);
  const fileLog = path.join(cv.__ketQua, 'LOG_' + lop.Utils.nhanThoiDiem(gioVN) + '_TIKTOK.txt');
  const kq = { ma: 2, coViec: false, tenFile: null, thongKe: null, dcn: null, thieuMapping: [], fileLog: null };

  noi('');
  noi('--- TIKTOK SHOP (thư mục "' + path.basename(thuMuc) + '") ---');
  const dsA = [], dsC = [];
  for (const f of xlsxTrong(thuMuc)) {
    const tep = path.join(thuMuc, f);
    const wb = moWorkbook(tep);
    const nd = AT.nhanDien(wb.tenSheet, wb.bang);
    const dungC = hoSo.ngay_ghi === 'RTS_ORDER_EXPORT';
    if (nd.thieuCot.length) {
      // Chỉ file tool DÙNG mới chặn; file nhận ra mà bản này không dùng (B, C khi cột A = ngày chạy) thì nhắc.
      if (nd.loai === 'TIKTOK_SE_THANH_TOAN' || (nd.loai === 'TIKTOK_ORDER_EXPORT' && dungC)) throw Object.assign(new Error(AT.cauThieuCot(nd, f)), { maKeodon: 'THIEU_COT' });
      noi('  ! ' + AT.cauThieuCot(nd, f));
    }
    if (nd.loai === 'TIKTOK_ORDER_EXPORT' && !dungC) {
      noi('File ' + f + ': ' + nd.hoSo.ten_bao_cao + ' — bản này KHÔNG dùng file này (cột Ngày là ngày chạy tool, như Shopee). File nằm nguyên chỗ cũ — rút ra khỏi thư mục.');
    } else if (nd.loai === 'TIKTOK_SE_THANH_TOAN') {
      const dcn = AT.docSeThanhToan(wb.bang(nd.tenSheet), { tenFile: f });
      dsA.push({ f, tep, nd, dcn, tai: msGioVN(dcn.thoiGianTai) });
    } else if (nd.loai === 'TIKTOK_ORDER_EXPORT') {
      const c = AT.docOrderExport(wb.bang(nd.tenSheet), { tenFile: f }, wb.dongKhai(nd.tenSheet));
      dsC.push({ f, tep, c, mtime: fs.statSync(tep).mtimeMs });
      noi('File ' + f + ': ' + nd.hoSo.ten_bao_cao + ' — ' + c.soDon + ' đơn, lấy RTS Time (ngày sắp xếp vận chuyển) làm cột A.');
      c.canhBao.slice(0, 5).forEach((x) => noi('  ! ' + x));
    } else if (nd.loai === 'TIKTOK_DA_QUYET_TOAN') {
      // Đợt 4 chỉ đọc + đối chiếu tổng; lỗi đọc file này không chặn báo cáo "Sẽ thanh toán".
      try {
        const b = AT.docDaQuyetToan(wb.bang(nd.tenSheet), { tenFile: f }, null, wb.tenSheet.indexOf('Báo cáo') >= 0 ? wb.bang('Báo cáo') : null);
        noi('File ' + f + ': báo cáo ' + nd.hoSo.ten_bao_cao + ' — ' + b.soDongDonHang + ' dòng đơn hàng / ' + b.don.length + ' đơn' +
          (b.soDongKhac ? ' (bỏ ' + b.soDongKhac + ' dòng ' + Object.keys(b.loaiKhac).map((k) => '"' + k + '"').join(', ') + ')' : '') +
          (b.doiChieu.length ? ', khớp sheet "Báo cáo": ' + b.doiChieu.map((x) => x.nhan + ' = ' + x.khai).join(' · ') : '') + '.');
      } catch (eB) {
        noi('  ! File ' + f + ': ' + eB.message);
      }
      noi('  Bản này CHƯA dùng báo cáo "Đã quyết toán" để cập nhật tiền (INV-1b hoãn Đợt 5): tool KHÔNG ghi ô nào từ file này và không bao giờ ' +
        'tạo dòng từ nó. File nằm nguyên chỗ cũ — rút ra khỏi thư mục để khỏi nhắc lại.');
    }
    nd.canhBao.forEach((c) => noi('  ! ' + f + ': ' + c));
  }
  if (!dsA.length) {
    noi('Không có báo cáo "Sẽ thanh toán" (Onhold-unsettled-orders…) nào — TikTok chưa ghi gì. Tool chỉ ghi từ báo cáo đó; file khác nằm nguyên chỗ cũ.');
    ghiLog(fileLog, ['KÉO ĐƠN TIKTOK SHOP — ' + lop.Utils.dinhDangNgayGio(gioVN)].concat(dong));
    kq.fileLog = fileLog;
    return kq;
  }
  kq.coViec = true;
  // D-87 (YC-56): cột A là RTS Time của file "Tất cả đơn hàng". Thiếu hẳn file đó → DỪNG, không âm thầm đổi mốc ngày.
  if (hoSo.ngay_ghi === 'RTS_ORDER_EXPORT' && !dsC.length) {
    const eC = new Error('THIẾU FILE ĐƠN HÀNG TIKTOK — THIẾU FILE "Tất cả đơn hàng": cột A của sheet TikTok Shop là ngày sắp xếp vận chuyển (RTS Time), chỉ file đó có. ' +
      'Việc phải làm: TikTok Seller Center → Đơn hàng → Xuất (Tất cả đơn hàng, cùng khoảng ngày), thả file vào cùng thư mục "' + path.basename(thuMuc) +
      '" rồi bấm lại. Tool chưa ghi gì, báo cáo "Sẽ thanh toán" nằm nguyên chỗ cũ.');
    eC.maKeodon = 'THIEU_ORDER_EXPORT';
    dong.push('LỖI — ' + eC.message);
    ghiLog(fileLog, ['KÉO ĐƠN TIKTOK SHOP — ' + lop.Utils.dinhDangNgayGio(gioVN)].concat(dong));
    kq.fileLog = fileLog;
    throw eC;
  }
  // Nhiều file Tất cả đơn hàng: file mới hơn thắng.
  const rtsCua = {};
  dsC.sort((a, b) => a.mtime - b.mtime).forEach((x) => Object.keys(x.c.theoMa).forEach((m) => {
    const v = x.c.theoMa[m];
    if (!rtsCua[m] || v.rts) rtsCua[m] = v;
  }));

  // Nhiều báo cáo "Sẽ thanh toán" cùng lượt: đơn trùng lấy ở báo cáo TẢI SAU CÙNG (số ước tính mới nhất).
  dsA.sort((a, b) => (b.tai || 0) - (a.tai || 0));
  const daNhan = {}, don = [], boQua = [];
  let soDong = 0, soDon = 0, trungFile = 0;
  dsA.forEach((x) => {
    const d = x.dcn;
    soDong += d.soDongDoc; soDon += d.soDonDoc;
    noi('File ' + x.f + ': báo cáo ' + x.nd.hoSo.ten_bao_cao + ' — ' + d.soDongDoc + ' dòng / ' + d.soDonDoc + ' đơn' +
      (d.tongGiaoDichKhai != null ? ' (khớp ô "Tổng số giao dịch" = ' + d.tongGiaoDichKhai + ')' : '') + (d.thoiGianTai ? ', tải lúc ' + d.thoiGianTai : ''));
    if (x.tai != null && o.thoiDiem && (new Date(o.thoiDiem).getTime() - x.tai) / 3600000 > GIO_BAO_CAO_CU) {
      noi('  ! Báo cáo này tải cách đây ' + Math.floor((new Date(o.thoiDiem).getTime() - x.tai) / 3600000) + ' giờ — đơn đã quyết toán trong khoảng ' +
        'đó KHÔNG còn trong tab "Sẽ thanh toán". Xuất báo cáo mới rồi chạy lại để khỏi sót đơn (chạy tool ít nhất 2 ngày một lần).');
    }
    d.canhBao.forEach((c) => noi('  ! ' + c));
    d.thongBao.forEach((c) => noi('  · ' + c));
    AT.kiemTuKiem(d);                                // lệch tự kiểm một đồng → DỪNG cả phần TikTok, không ghi đơn nào
    d.don.forEach((z) => { if (daNhan[z.maDon]) { trungFile++; return; } daNhan[z.maDon] = 1; don.push(z); });
    d.boQua.forEach((z) => { if (!daNhan[z.maDon] && !boQua.some((b) => b.maDon === z.maDon)) boQua.push(z); });
  });
  if (trungFile) noi('  · ' + trungFile + ' đơn có ở nhiều báo cáo cùng lượt → lấy số của báo cáo tải sau cùng.');
  // YC-56: gắn ngày sắp xếp vận chuyển. Không có trong file Tất cả đơn hàng / RTS còn trống → theo `hoSo.thieu_rts`.
  let soThieuRts = 0;
  for (let i = don.length - 1; hoSo.ngay_ghi === 'RTS_ORDER_EXPORT' && i >= 0; i--) {
    const z = don[i], c = rtsCua[z.maDon];
    z.rts = c && c.rts ? c.rts : '';
    if (z.rts) continue;
    z.lyDoThieuRts = c ? 'chưa có ngày sắp xếp vận chuyển (RTS Time trống trong file Tất cả đơn hàng)' : 'không có trong file Tất cả đơn hàng';
    soThieuRts++;
    if (hoSo.thieu_rts === 'TREO') { boQua.push({ maDon: z.maDon, ma: 'TREO_THIEU_RTS', chiTiet: z.lyDoThieuRts, dong: z.dong }); don.splice(i, 1); }
  }
  // YC-57 lưới thứ hai sau D-83: đơn "Đã hủy" trong file Tất cả đơn hàng → không ghi.
  for (let i = don.length - 1; i >= 0; i--) {
    const c = rtsCua[don[i].maDon];
    if (c && laDaHuy(c.trangThai)) {
      boQua.push({ maDon: don[i].maDon, ma: 'DA_HUY', chiTiet: 'Order Status = ' + c.trangThai, dong: don[i].dong });
      if (don[i].lyDoThieuRts) soThieuRts--;
      don.splice(i, 1);
    }
  }
  const dcn = { hoSo, tenFile: dsA.map((x) => x.f).join(' + '), soDongDoc: soDong, soDonDoc: soDon, don, boQua };
  kq.dcn = dcn;
  kq.tenFile = dcn.tenFile;
  if (boQua.length) noi('BỎ QUA ' + boQua.length + ' ĐƠN KHÔNG PHẢI ĐƠN BÁN (đơn hủy / chưa chốt tiền / đang chờ trả hàng) — không phải lỗi, lượt sau đơn nào có tiền thật tự vào sổ.');
  if (boQua.length) {
    noi('Không ghi ' + boQua.length + ' đơn:');
    Object.keys(TEN_LY_DO).forEach((ma) => {
      const ds = boQua.filter((b) => b.ma === ma);
      if (!ds.length) return;
      noi('  · ' + ds.length + ' đơn ' + TEN_LY_DO[ma] + ': ' + ds.slice(0, 10).map((b) => b.maDon).join(', ') + (ds.length > 10 ? ' …' : ''));
    });
  }
  if (soThieuRts && hoSo.thieu_rts !== 'TREO') {
    noi('  ! ' + soThieuRts + ' đơn chưa có ngày sắp xếp vận chuyển trong file Tất cả đơn hàng → vẫn ghi, cột A tạm là ngày tạo đơn, TÔ VÀNG + ghi chú (nếu đã có trên sổ thì bỏ qua như thường).');
  }

  // ---- lớp 2 + lớp 3 bằng CHÍNH lõi Shopee, trên đường `ghi` ----
  const tenSheet = hoSo.sheet_dich;
  const cauHinhTT = { gianHang: {} };
  cauHinhTT.gianHang[hoSo.ma_gian] = { ten: hoSo.ten_hien_thi, sheet: tenSheet };
  const ghiDe = Object.assign({}, cv.cau_hinh || {});
  ghiDe.gianHang = Object.assign({}, (cv.cau_hinh && cv.cau_hinh.gianHang) || {}, cauHinhTT.gianHang);
  const cfgTT = lop.Config.tao(ghiDe);
  const web = new WebAppGoogleSheet(Object.assign({ bat: true }, o.cauHinhGoogle || {}, { cotPII: cfgTT.cotPII }));
  const thang = o.thang;
  const run = { runId: o.runId, file: dsA.map((x) => x.f), gian: [tenSheet], donVao: soDon, loi: 0 };

  try {
    noi('Hỏi sổ tháng ' + thang + ' … (TikTok đi đường "ghi": máy gửi tiền lấy thẳng từ báo cáo, Google tự nối dòng + gộp ô + chép công thức)');
    const tuXa = await web.doc(thang, [tenSheet], cauHinhTT);
    kiemPhienBan(web.phienBanWebApp, { mayToiThieu: web.mayToiThieuWebApp });
    const sh = tuXa.sheets && tuXa.sheets[tenSheet];
    if (!sh) {
      throw Object.assign(new Error('Sổ tháng ' + thang + ' (' + (tuXa.tenFile || '?') + ') không có sheet "' + tenSheet + '" — tool không tự tạo sheet (INV-2). ' +
        'Tool chưa ghi gì.'), { maKeodon: 'THIEU_SHEET_TIKTOK' });
    }
    noi('File tháng: ' + tuXa.tenFile + ' · sheet "' + tenSheet + '" đã có ' + sh.soDon + ' đơn');
    soatMaDonTrenSo(Object.keys(sh.maDon || {}), don.map((d) => d.maDon));

    const vo = o.vo || napVoGoogle(lop);             // `o.vo`: CHỈ bộ test truyền (đối chứng âm phía máy)
    const goi = vo.dungKeHoachGhi_(cfgTT, [{ maGianHang: hoSo.ma_gian, tenFile: dcn.tenFile, dong: AT.sangDongLop1(dcn) }], tuXa, { ngayGhi: ngayCua(o.thoiDiem) });

    // ĐÈ tiền (lấy thẳng báo cáo). Ngày: NGAY_CHAY (mặc định) giữ ngayGhi của lõi; hai giá trị cũ vẫn đè được.
    const theoMa = {};
    don.forEach((d) => { theoMa[d.maDon] = d; });
    let dongThieuRts = 0;
    const donThieuRts = [];
    goi.lenh.forEach((l) => l.don.forEach((d) => {
      const x = theoMa[String(d.maDon)];
      if (!x) throw new Error('Lỗi lập trình: lệnh ghi có đơn ' + d.maDon + ' không có trong ĐƠN CHUẨN');
      d.tien = { H: x.tien.H, I: x.tien.I, J: x.tien.J, K: x.tien.K };
      if (hoSo.ngay_ghi === 'NGAY_TAO_DON') d.ngay = x.ngay;
      else if (hoSo.ngay_ghi === 'RTS_ORDER_EXPORT') {
        d.ngay = x.rts || x.ngay;
        if (!x.rts) {                                  // D-87: vẫn ghi, cột A = ngày tạo đơn, TÔ VÀNG + note cả cụm
          const cau = 'ĐƠN ' + x.maDon + ' CHƯA CÓ TRONG FILE ĐƠN HÀNG — thiếu ngày sắp xếp vận chuyển (' + x.lyDoThieuRts + '); cột A tạm là ngày tạo đơn ' +
            x.ngay.split('-').reverse().join('/');
          donThieuRts.push(x.maDon);
          d.dong.forEach((r, i) => { r.vang = true; if (i === 0) r.note = r.note ? r.note + '; ' + cau : cau; });
          dongThieuRts += d.dong.length;
        }
      }
    }));

    // ID SKU chỉ ghi vào "Ghi chú" của dòng Mapping mới — để đối chiếu, KHÔNG phải khóa.
    if (goi.mappingThem.length && goi.mappingThemCot) {
      const iGc = goi.mappingThemCot.indexOf('Ghi chú'), iTen = goi.mappingThemCot.indexOf('Tên trên Shopee'), iPl = goi.mappingThemCot.indexOf('Phân loại');
      const khoa = (a, b) => lop.Utils.chuanHoaChuoi(a) + '|' + lop.Utils.chuanHoaChuoi(b);
      const sku = {};
      don.forEach((d) => d.dong.forEach((x) => { const k = khoa(x.tenListing, x.tenPhanLoai); (sku[k] = sku[k] || new Set()).add(x.idSku); }));
      if (iGc >= 0 && iTen >= 0 && iPl >= 0) {
        // Đường `ghi` đưa ngày chạy dạng chuỗi nên câu lõi ra "gặp ngày  (file …)" — điền lại ngày cho người đọc.
        const ngayChu = ngayCua(o.thoiDiem).split('-').reverse().join('/');
        goi.mappingThem.forEach((h) => {
          const s = sku[khoa(h[iTen], h[iPl])];
          h[iGc] = String(h[iGc] || '').replace(/gặp ngày  \(/, 'gặp ngày ' + ngayChu + ' (');
          if (s && s.size) h[iGc] += ' · ID SKU TikTok: ' + [...s].filter(Boolean).join(', ');
        });
      }
    }

    // THIẾU MAPPING — không đoán: liệt kê đúng Tên sản phẩm + Tên SKU của đơn SẮP GHI.
    const sapGhi = new Set();
    goi.lenh.forEach((l) => l.don.forEach((d) => sapGhi.add(String(d.maDon))));
    const thieu = {};
    don.filter((d) => sapGhi.has(d.maDon)).forEach((d) => d.dong.forEach((x) => {
      const mr = lop.MapListing.tra(goi.map, hoSo.ma_gian, x.tenListing, x.tenPhanLoai);
      if (mr && mr.__muc) return;
      const k = lop.Utils.chuanHoaChuoi(x.tenListing) + '|' + lop.Utils.chuanHoaChuoi(x.tenPhanLoai);
      if (!thieu[k]) thieu[k] = { tenSanPham: x.tenListing, tenSku: x.tenPhanLoai, idSku: x.idSku, lyDo: mr ? (mr.__lyDo || 'CHUA_DIEN') : 'TEN_MOI', dongMap: mr ? mr.__dong : null, soDon: 0 };
      thieu[k].soDon++;
    }));
    kq.thieuMapping = Object.keys(thieu).map((k) => thieu[k]);

    let kqGhi = null;
    if (goi.thongKe.donGhi) {
      noi('Gửi lệnh ghi ' + goi.thongKe.donGhi + ' đơn (' + goi.thongKe.dongGhi + ' dòng) vào sheet "' + tenSheet + '" …');
      kqGhi = await web.ghi(thang, goi.lenh, goi.mappingThem, cauHinhTT, goi.mappingThemCot, o.runId);
    } else {
      noi('Không có đơn mới (đã có sẵn ' + goi.thongKe.donDaCo + ' đơn) → không gửi lệnh ghi.');
    }
    const tk = kqGhi ? kqGhi.thongKe : { donGhi: 0, dongGhi: 0, donGopO: 0, dongVang: 0, donDaCo: 0, mappingThem: 0 };
    kq.thongKe = {
      donGhi: tk.donGhi, dongGhi: tk.dongGhi, donGopO: tk.donGopO, dongVang: tk.dongVang,
      donDaCo: goi.thongKe.donDaCo + (tk.donDaCo || 0), donBoQua: boQua.length, tenMoi: goi.thongKe.tenMoi, mappingThem: tk.mappingThem || 0
    };

    // Ghi xong MỚI chuyển báo cáo đi (INV-10): báo cáo "Sẽ thanh toán" + file Tất cả đơn hàng đã dùng. Báo cáo "Đã quyết toán" không đụng.
    dsA.concat(dsC).forEach((x) => chuyenDaXuLy(x.tep, path.join(thuMuc, cv.__tenDaXuLy || TEN_DA_XU_LY_MAC_DINH)));
    if (dongThieuRts && kqGhi) {
      donThieuRts.slice(0, 30).forEach((m) => noi('ĐƠN ' + m + ' CHƯA CÓ TRONG FILE ĐƠN HÀNG — dòng vàng, cột A tạm là ngày tạo đơn'));
      if (donThieuRts.length > 30) noi('… và ' + (donThieuRts.length - 30) + ' đơn nữa (xem cột Note các dòng vàng)');
      noi('Dòng vàng vì thiếu ngày sắp xếp vận chuyển: ' + dongThieuRts + ' (đọc cột Note; sửa tay cột A khi đơn đã sắp xếp vận chuyển — chạy lại tool không sửa dòng đã ghi).');
    }

    noi('GHI THÊM ' + kq.thongKe.donGhi + ' đơn (' + kq.thongKe.dongGhi + ' dòng, ' + kq.thongKe.donGopO + ' đơn nhiều dòng đã gộp ô) · bỏ qua ' +
      kq.thongKe.donDaCo + ' đơn đã có · không ghi ' + boQua.length + ' đơn chưa đủ điều kiện');
    noi('DÒNG VÀNG cần người xem: ' + kq.thongKe.dongVang);
    if (kq.thieuMapping.length) {
      noi('THIẾU MAPPING — tool KHÔNG ĐOÁN, đơn vẫn ghi với dòng vàng, cột D để trống: ' + kq.thieuMapping.length + ' loại hàng (Tên sản phẩm / Tên SKU):');
      kq.thieuMapping.forEach((x) => noi('  · ' + x.tenSanPham + ' / ' + x.tenSku + ' — ' + (lop.MapListing.LY_DO[x.lyDo] || x.lyDo) +
        (x.dongMap ? ' (Mapping dòng ' + x.dongMap + ')' : '') + ' · ' + x.soDon + ' đơn · ID SKU ' + x.idSku));
      noi('  Việc cần làm: sheet Mapping_san_pham → các dòng Gian hàng = TikTok Shop đang vàng → điền Tên viết tắt (hoặc Cấu phần, Hệ số) → ghi CÓ.');
    }
    if (kq.thongKe.tenMoi) noi('Mapping sản phẩm: thêm ' + kq.thongKe.tenMoi + ' tên hàng mới chờ điền (Gian hàng = TikTok Shop)');
    const canhBao = gomCanhBaoVungCongThuc(lop, goi.canhBao.concat(kqGhi ? kqGhi.canhBao || [] : []));
    canhBao.slice(0, 20).forEach((c) => noi('  ! ' + web.chePhu(c)));
    noi(kqGhi ? dongRunTuKetQua(run, Object.assign({}, kqGhi, { thongKe: kq.thongKe, banDung: web.banDungWebApp }))
      : dongRun(Object.assign({}, run, { banDung: web.banDungWebApp, ghi: 0, boQua: kq.thongKe.donDaCo, vang: 0 })));
    kq.ma = 0;
    return kq;
  } catch (e) {
    const cau = web.chePhu(e && e.message ? e.message : String(e));
    run.loi = 1;
    dong.push('LỖI — lượt TikTok KHÔNG xong: ' + cau, dongRun(run));
    throw Object.assign(new Error(cau), { maKeodon: e && e.maKeodon });
  } finally {
    ghiLog(fileLog, ['KÉO ĐƠN TIKTOK SHOP — ' + lop.Utils.dinhDangNgayGio(gioVN) + '\nTháng: ' + thang].concat(dong));
    kq.fileLog = fileLog;
  }
}

module.exports = {
  TEN_THU_MUC_MAC_DINH, GIO_BAO_CAO_CU,
  bangDayDu, moWorkbook, xlsxTrong, thuMucTikTok, taoThuMuc, coFile, soatThaNhamSan, soatMaDonTrenSo, chayTikTok
};
