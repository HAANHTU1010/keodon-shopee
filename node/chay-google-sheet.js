/**
 * chay-google-sheet.js — LUỒNG GHI THẲNG LÊN GOOGLE SHEET (GV-v2.2 mục 1.7, GV-v2.3 mục 2.3).
 *
 * HAI ĐƯỜNG, MỘT LÕI.
 *
 *   duong = 'xuLy'  (MẶC ĐỊNH, bản 2.4.0)
 *       Máy chỉ chạy LỚP 1 (đọc file .xlsx — việc này phải ở lại máy vì file nằm trên máy) rồi gửi
 *       bảng dòng thô lên. Web App tự đọc Mapping + tồn kho, chạy lớp 2 (tiền, thuế, mapping, chọn lô),
 *       lớp 3 (gộp ô, lập kế hoạch) và ghi — tất cả trong MỘT lần gọi.
 *       Vì sao đổi: trước đây sửa cách tính thuế là phải đi cập nhật từng máy nhân viên; giờ chỉ cần
 *       một lần Deploy. Đây là cách dự án chứng quyền của cùng chủ dự án đang chạy và là lý do bên đó
 *       cập nhật nhẹ hơn hẳn (HOC_TU_DU_AN_CO_PHIEU mục 1: "một lõi tính toán duy nhất").
 *
 *   duong = 'ghi'   (ĐƯỜNG LÙI, giữ nguyên, đã nghiệm thu)
 *       Máy gọi `doc`, tự chạy lớp 2 + lớp 3, rồi gọi `ghi`. Dùng khi `xuLy` gặp sự cố.
 *
 * Hai đường KHÔNG phải hai bản chép tay: cả hai gọi CHUNG hàm `dungKeHoachGhi_` trong
 * `src/ShellAppsScript.gs` (nạp vào Node bằng `napVoGoogle`, đúng cách `node/test-bat-bien.js` đang
 * nạp file đó). Sửa lớp 2 hay lớp 3 một chỗ là hai đường cùng đổi.
 *
 * Chọn đường: khóa `duong` trong `03_VAN_HANH/CAU_HINH_VAN_HANH.json` → `google_sheet.duong`.
 *
 * CÔNG THỨC E, F, M, N (GV-v2.6 §3 việc 1 · bài T-48 viết lại). Từ 08/9/2026 Web App **tự chép công
 * thức của dòng trên xuống** cho cả năm cột E, F, L, M, N ở mỗi dòng mới — xem `chepCongThucXuong_`
 * trong `src/ShellAppsScript.gs`. Cảnh báo chỉ còn là LỚP PHỤ, và chỉ kêu đúng một ca: cả cột không
 * còn ô nào có công thức để chép. File này KHÔNG gọi `KeyIn.gs` (nó dựng lệnh ghi thẳng), nên hai
 * việc của vỏ máy vẫn giữ nguyên: GOM câu trùng giữa các lô (`gomCanhBaoVungCongThuc`) và IN ra màn
 * hình ngay tại chỗ chạy (`inCanhBaoVungCongThuc`).
 *
 * File tháng nào là đích thì do chính Web App quyết, tra bảng link trong sheet `Thông tin shop `
 * của file mỏ neo (GV-v2.3 mục 1). Máy này KHÔNG giữ id file tháng nào cả — 2-3 máy nhân viên mà
 * mỗi máy giữ một id là sớm muộn có máy ghi vào file tháng cũ.
 *
 * CHƯA CHẠY THẬT (08/9/2026): chưa có link Web App và chuỗi bí mật của chủ dự án. Toàn bộ đường đi
 * đã kiểm bằng `node/test-xu-ly-tren-google.js` (Web App giả chạy chính mã thật của ShellAppsScript.gs).
 */
const fs = require('fs');
const path = require('path');
const { WebAppGoogleSheet, kiemPhienBan, chuanDuong, PHIEN_BAN } = require('./gsheet-web-app');

const FILE_VO_GOOGLE = path.join(__dirname, '..', 'src', 'ShellAppsScript.gs');

/** 'yyyy-MM' của một mốc thời gian, theo giờ máy đang chạy. */
function thangCua(thoiDiem) {
  const d = thoiDiem || new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
}

/** 'yyyy-MM-dd' của một mốc thời gian. */
function ngayCua(thoiDiem) {
  const d = thoiDiem || new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// ==================================================================== nạp vỏ Google vào Node

let _voCache = null;

/**
 * Nạp `src/ShellAppsScript.gs` vào Node để dùng LẠI CHÍNH hàm lớp 2 + lớp 3 mà Apps Script chạy.
 *
 * Vì sao phải nạp thay vì chép sang .js: có hai đường ghi, mà lớp 2 chỉ được có MỘT bản. Chép sang
 * đây là sớm muộn hai bản lệch nhau đúng một dòng làm tròn thuế, rồi không ai biết bản nào đúng —
 * chính là thứ mục 1 của HOC_TU_DU_AN_CO_PHIEU dặn tránh.
 *
 * File .gs không có require/import, chỉ khai `var`/`function` ở cấp cao nhất, nên chạy được bằng
 * `new Function` sau khi bơm các đối tượng lõi vào phạm vi. Các dịch vụ Google (SpreadsheetApp,
 * LockService…) cố ý KHÔNG bơm: hàm dùng ở đây (`dungKeHoachGhi_`) là hàm thuần, không đụng tới chúng;
 * lỡ có ai sửa nó thành đụng Google thì hỏng ngay tại đây chứ không hỏng lặng lẽ trên máy nhân viên.
 */
function napVoGoogle(lop) {
  if (_voCache && _voCache.lop === lop) return _voCache.vo;
  const src = fs.readFileSync(FILE_VO_GOOGLE, 'utf8');
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const khoa = Object.keys(lop);
  const khai = khoa.map((k) => 'var ' + k + ' = __loi[' + JSON.stringify(k) + '];').join('\n');
  const than = khai + '\n' + src + '\nreturn {' +
    [...ten].map((n) => n + ': ' + n).join(', ') + '};';
  const vo = new Function('__loi', than)(lop);   // eslint-disable-line no-new-func
  if (vo.PHIEN_BAN !== PHIEN_BAN) {
    throw new Error('PHIEN_BAN lệch giữa hai vỏ: src/ShellAppsScript.gs = ' + vo.PHIEN_BAN +
      ', node/gsheet-web-app.js = ' + PHIEN_BAN + '. Sửa cho bằng nhau rồi chạy lại.');
  }
  _voCache = { lop, vo };
  return vo;
}

// ==================================================================== lớp 2 + lớp 3 (đường 'ghi')

/**
 * Dựng gói lệnh ghi từ dữ liệu đã đọc — KHÔNG chạm mạng, kiểm được bằng test.
 * Chỉ là lớp vỏ mỏng gọi `dungKeHoachGhi_` của `src/ShellAppsScript.gs`, xem chú thích `napVoGoogle`.
 *
 * @param {Object} lop      lõi đã nạp (napLoi())
 * @param {Object} cfg      cấu hình đã chuẩn hóa
 * @param {Array}  cacFile  [{ maGianHang, tenFile, dong }] — kết quả lớp 1 của từng file xuất
 * @param {Object} tuXa     kết quả hành động `doc` của Web App { sheets, mapping, tonKho }
 * @param {Object} tuyChon  { ngayGhi }
 * @returns { lenh, mappingThem, thongKe, canhBao, map }
 */
function dungGoiGhi(lop, cfg, cacFile, tuXa, tuyChon) {
  return napVoGoogle(lop).dungKeHoachGhi_(cfg, cacFile, tuXa, tuyChon || {});
}

/** Đổi {header, dong} của Web App thành bảng 2 chiều mà lõi đọc được (dòng đầu là tiêu đề). */
function bangCuaSheet(lop, x, dongHeaderMongDoi) {
  return napVoGoogle(lop).bangCuaSheet_(x, dongHeaderMongDoi);
}

// ==================================================================== cảnh báo vùng công thức

/**
 * Gom câu cảnh báo vùng công thức E, F, M, N, L (GV-v2.6 §3 việc 1 · bài T-48).
 *
 * Vỏ Google đo lại vùng công thức ở MỖI khối ghi (`mauChepCongThucDS_` trong `ghiMotSheet_`), mà một
 * lần chạy có nhiều lô và có thể có nhiều lượt gọi tiếp, nên cùng một (sheet, cột) sẽ kêu vài lần.
 * Giữ câu ĐẦU TIÊN của mỗi (sheet, cột): đó là câu đo trên file tháng lúc chưa ghi ô nào — cũng là
 * câu mà đường 'ghi' và đường 'xuLy' nói giống hệt nhau dù hai đường chia lô khác nhau.
 * Câu của mọi loại khác giữ nguyên, không đụng tới.
 */
function gomCanhBaoVungCongThuc(lop, ds) {
  const khoaCua = (lop && lop.KeyIn && lop.KeyIn.khoaCanhBaoVungCongThuc) || null;
  if (!khoaCua) return (ds || []).slice();
  const daCo = {};
  return (ds || []).filter((c) => {
    const kh = khoaCua(c);
    if (!kh) return true;
    if (daCo[kh]) return false;
    daCo[kh] = 1;
    return true;
  });
}

/**
 * In cảnh báo vùng công thức ra MÀN HÌNH ngay tại chỗ chạy, không đợi bảng tóm tắt cuối.
 *
 * Câu ở đây nay chỉ còn một nghĩa: cột đó KHÔNG CÒN Ô NÀO CÓ CÔNG THỨC để chép xuống, nên các dòng
 * mới sẽ trống ở cột đó. Tool cố ý không tự dựng công thức mới (D-15) — công thức là của chủ shop,
 * đoán sai thì sai lặng lẽ trên mọi dòng về sau.
 */
function inCanhBaoVungCongThuc(lop, ds, in_) {
  const khoaCua = (lop && lop.KeyIn && lop.KeyIn.khoaCanhBaoVungCongThuc) || null;
  if (!khoaCua) return;
  const cau = (ds || []).filter((c) => khoaCua(c));
  if (!cau.length) return;
  in_('  ! VÙNG CÔNG THỨC — cột không còn công thức nào để chép xuống, cần một dòng mẫu đúng:');
  cau.forEach((c) => in_('    ! ' + c));
}

/**
 * In cảnh báo BẢNG LINK ra màn hình ngay khi chạy (GV-v2.5 mục 1, việc kèm theo số 2).
 *
 * TRIỆU CHỨNG THẬT ĐANG CHỐNG: bảng link thiếu dòng cho tháng sau thì đến ngày 1 của tháng sau tool
 * TẮC HẲN — "Chưa có file cho tháng N". Câu này báo trước cả tháng, nhưng nó chỉ có tác dụng nếu
 * nhân viên NHÌN THẤY; nằm im trong mảng canhBao của phản hồi thì không ai đọc.
 */
/**
 * In cảnh báo LỆCH BẢN DỰNG. Chỉ nói, không chặn — theo chốt của BA, để không tắc buổi chạy thử.
 * Đặt ở cả hai đường ('xuLy' và 'ghi'): bản `.gs` trên Google cũ hơn thì hai đường sai như nhau.
 */
function inCanhBaoBanDung(web, in_) {
  const ds = (web && web.canhBaoBanDung) || [];
  if (!ds.length) return;
  in_('  ! BẢN TRÊN GOOGLE KHÔNG KHỚP BẢN TRÊN MÁY:');
  ds.forEach((c) => in_('    ! ' + c));
}

function inCanhBaoBangLink(ds, in_) {
  (ds || []).filter((c) => String(c).indexOf('Bảng link mới khai tới') === 0)
    .forEach((c) => in_('  ! ' + c));
}

// ==================================================================== chạy thật

/**
 * Chạy thật: chọn đường theo cấu hình, gửi lệnh, trả về đúng một bộ thống kê cho cả hai đường.
 * @param {Object} tuyChon { cauHinhGoogle, cacFile, cfg, lop, thoiDiem, ngayGhi, thang, in }
 */
async function chayLenGoogleSheet(tuyChon) {
  const { lop, cfg } = tuyChon;
  const cacFile = tuyChon.cacFile || [];
  const in_ = tuyChon.in || (() => { });
  const thang = tuyChon.thang || thangCua(tuyChon.thoiDiem);

  // Ngày ghi vào cột A. Trước 2.4.0 luồng Google để `null` khi không có `--ngay`, và Web App ghi ô
  // TRỐNG — sheet `Lợi nhuận` của chủ shop tính theo ngày nên cả khối đơn đó rơi ra ngoài mọi công thức.
  // Mặc định bằng ngày chạy, đúng như luồng Excel (`Main.chayDongBo` đã làm thế từ đầu).
  const ngayGhi = tuyChon.ngayGhi || ngayCua(tuyChon.thoiDiem);

  const web = new WebAppGoogleSheet(Object.assign(
    { bat: true }, tuyChon.cauHinhGoogle || {}, { cotPII: cfg.cotPII }));

  if (web.duong === 'ghi') return duongGhiCu(web, tuyChon, thang, ngayGhi, in_);
  return duongXuLy(web, tuyChon, thang, ngayGhi, in_);
}

/**
 * Cấu hình của LỚP 2 và LỚP 3 (thuế, bố cục sheet, danh mục, gian hàng) trên đường 'xuLy' lấy từ
 * bản đã Deploy trên Apps Script, KHÔNG lấy từ máy — đó chính là điều làm cho "sửa một lần, Deploy
 * một lần" thành sự thật. Hệ quả phải nói thẳng: nếu máy nào đang ghi đè mấy nhóm đó trong
 * `CAU_HINH_VAN_HANH.json` thì phần ghi đè ấy KHÔNG có tác dụng nữa. Im lặng bỏ qua là đúng kiểu lỗi
 * "hỏng âm thầm" mà HOC_TU_DU_AN_CO_PHIEU mục 8 gọi là nguy hiểm nhất, nên phải kêu lên.
 * (Nhóm `cot`, `trangThai`, `cotPII` vẫn có tác dụng: lớp 1 và cổng chặn PII chạy trên máy.)
 */
function canhBaoGhiDeCauHinh(lop, cfg) {
  const mac = lop.Config.tao();
  const lech = ['chung', 'keyin', 'danhMuc', 'gianHang']
    .filter((k) => JSON.stringify(cfg[k]) !== JSON.stringify(mac[k]));
  if (!lech.length) return null;
  return 'CAU_HINH_VAN_HANH.json đang ghi đè nhóm cấu hình ' + lech.join(', ') +
    ' — trên đường "xuLy" phần ghi đè này KHÔNG có tác dụng, vì lớp 2 và lớp 3 chạy bằng cấu hình đã ' +
    'Deploy trên Apps Script. Muốn giữ ghi đè thì đặt google_sheet.duong = "ghi", hoặc sửa CaiDat.gs ' +
    'rồi Deploy lại (Deploy → Manage deployments → New version).';
}

/** ĐƯỜNG MẶC ĐỊNH: một lần gọi, Web App làm lớp 2 + lớp 3 + ghi. */
async function duongXuLy(web, tuyChon, thang, ngayGhi, in_) {
  const { cfg } = tuyChon;
  const cacFile = tuyChon.cacFile || [];
  const soDon = demDon(cacFile);

  const canhBaoCauHinh = canhBaoGhiDeCauHinh(tuyChon.lop, cfg);
  if (canhBaoCauHinh) in_('  ! ' + canhBaoCauHinh);

  in_('Gửi ' + soDon + ' đơn (' + demDong(cacFile) + ' dòng) lên Google Sheet tháng ' + thang +
    ' — Web App tự tính tiền, tra Mapping, chọn lô rồi ghi …');
  const kq = await web.xuLy(thang, cacFile, {
    ngayGhi: ngayGhi,
    sheetCuaGian: (ma) => tuyChon.lop.Config.gianHang(cfg, ma).sheet,
    toiDaDonMotLo: tuyChon.toiDaDonMotLo,
    nguongGiay: tuyChon.nguongGiay
  });

  in_('File tháng: ' + (kq.tenFile || '(không rõ tên)') + ' · ' + kq.soLo + ' lô · ' + kq.soLanGoi + ' lượt gọi');
  const canhBaoLo = gomCanhBaoVungCongThuc(tuyChon.lop, kq.canhBao);
  inCanhBaoBanDung(web, in_);
  inCanhBaoBangLink(canhBaoLo, in_);
  inCanhBaoVungCongThuc(tuyChon.lop, canhBaoLo, in_);
  return {
    thongKe: kq.thongKe,
    canhBao: (canhBaoCauHinh ? [canhBaoCauHinh] : []).concat(canhBaoLo),
    thongBao: kq.thongBao,
    viTri: kq.viTri, tenFile: kq.tenFile, soLo: kq.soLo, soLanGoi: kq.soLanGoi,
    mapTomTat: kq.mapTomTat, duong: 'xuLy', daGhi: kq.thongKe.donGhi > 0
  };
}

/** ĐƯỜNG LÙI: hỏi Web App, máy tự dựng gói, gửi lệnh ghi. Giữ nguyên như bản 2.3.0. */
async function duongGhiCu(web, tuyChon, thang, ngayGhi, in_) {
  const { lop, cfg } = tuyChon;
  const cacFile = tuyChon.cacFile || [];
  const tenSheets = Object.keys(cfg.gianHang).map((m) => cfg.gianHang[m].sheet);

  in_('Hỏi Google Sheet tháng ' + thang + ' … (đường lùi "ghi": máy tự chạy lớp 2 và lớp 3)');
  const tuXa = await web.doc(thang, tenSheets);

  // Chặn lệch phiên bản NGAY SAU lượt đọc đầu tiên, trước khi bỏ công dựng gói. Đọc thì vô hại,
  // nhưng nếu Google đang chạy bản `.gs` cũ thì mọi thứ sau đây đều vô nghĩa và nguy hiểm.
  kiemPhienBan(tuXa.phienBan, PHIEN_BAN);

  in_('File tháng: ' + tuXa.tenFile + ' · đã có ' +
    Object.keys(tuXa.sheets || {}).map((t) => t + ': ' + tuXa.sheets[t].soDon + ' đơn').join(' · '));
  (tuXa.canhBao || []).forEach((c) => in_('  ! ' + c));

  const goi = dungGoiGhi(lop, cfg, cacFile, tuXa, { ngayGhi });
  if (!goi.thongKe.donGhi) {
    in_('Không có đơn mới (đã có sẵn ' + goi.thongKe.donDaCo + ' đơn) → không gửi lệnh ghi.');
    return {
      thongKe: goi.thongKe, canhBao: goi.canhBao, thongBao: [], viTri: {},
      tenFile: tuXa.tenFile, duong: 'ghi', daGhi: false
    };
  }

  in_('Gửi lệnh ghi ' + goi.thongKe.donGhi + ' đơn (' + goi.thongKe.dongGhi + ' dòng) …');
  const kq = await web.ghi(thang, goi.lenh, goi.mappingThem);
  const canhBaoLo = gomCanhBaoVungCongThuc(lop, goi.canhBao.concat(kq.canhBao || []));
  inCanhBaoBanDung(web, in_);
  inCanhBaoBangLink(canhBaoLo, in_);
  inCanhBaoVungCongThuc(lop, canhBaoLo, in_);
  return {
    thongKe: Object.assign({}, goi.thongKe, { donDaCoTuXa: kq.thongKe.donDaCo, mappingThem: kq.thongKe.mappingThem }),
    canhBao: canhBaoLo,
    thongBao: kq.thongBao || [], viTri: kq.viTri || {}, tenFile: kq.tenFile, soLo: kq.soLo,
    mapTomTat: lop.MapListing.tomTat(goi.map), duong: 'ghi', daGhi: true
  };
}

function demDon(cacFile) {
  const k = {};
  (cacFile || []).forEach((f) => (f.dong || []).forEach((d) => { k[f.maGianHang + '|' + d.maDonSan] = 1; }));
  return Object.keys(k).length;
}

function demDong(cacFile) {
  let n = 0;
  (cacFile || []).forEach((f) => { n += (f.dong || []).length; });
  return n;
}

module.exports = {
  chayLenGoogleSheet, dungGoiGhi, bangCuaSheet, thangCua, ngayCua,
  napVoGoogle, chuanDuong, demDon, demDong,
  gomCanhBaoVungCongThuc, inCanhBaoVungCongThuc, inCanhBaoBangLink, inCanhBaoBanDung
};
