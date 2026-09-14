/**
 * test-web-app.js: BỘ KIỂM THỬ HỎNG D-10 … D-14 CHẠY TRÊN WEB APP GIẢ LẬP.
 * Chạy bằng: node node/test-web-app.js
 *
 * ------------------------------------------------------------------ VÌ SAO CÓ FILE NÀY
 * `KE_HOACH_KIEM_THU.md` dòng 260, mục "Ghi nợ được (không chặn bàn giao GĐ1)", viết nguyên văn:
 *   "Lớp Web App chưa bật vì BA chưa gửi link, nhưng mã phải có sẵn và test T-47, T-53, D-12, D-13
 *    phải chạy được với Web App giả lập."
 * Nghĩa là món nợ Web App CHỈ ĐỦ ĐIỀU KIỆN ĐƯỢC GHI NỢ NẾU D-12 và D-13 chạy được. Trước file này,
 * 45 bài trong `node/test-dinh-tuyen-thang.js` phủ T-47 (T-DT-41, T-DT-42) và T-53 (T-DT-19, T-DT-44),
 * còn D-12 không có bài nào và D-13 chỉ có nửa lệch phiên bản. D-12 lại nằm trong 6 tình huống BA bắt
 * buộc tự bắn khi nghiệm thu (điều kiện ký nhận số 5).
 *
 * ------------------------------------------------------------------ KHÔNG GỌI MẠNG THẬT
 * `node/gia-lap-web-app.js` được nạp TRƯỚC mọi thứ: nó thay `require.cache['https']` bằng bản giả,
 * nên `node/gsheet-web-app.js` (mã thật, không sửa một dòng) chạy nguyên văn mà không một byte nào
 * rời khỏi tiến trình. Tầng Apps Script cũng là MÃ THẬT (`src/ShellAppsScript.gs`) chạy trong Node.
 * Bài nào hỏng là MÃ THẬT hỏng, không phải bản mô phỏng hỏng.
 *
 * ------------------------------------------------------------------ ĐỌC SỐ THẬT, KHÔNG ĐỌC THÔNG BÁO
 * Mọi bài đều đếm SỐ DÒNG THẬT trong sheet giả trước và sau, và so DANH SÁCH MÃ ĐƠN. Thông báo trả về
 * chỉ là bằng chứng phụ: cái nguy hiểm nhất của D-12 đúng là ca "thông báo nói một đằng, sheet một nẻo".
 *
 * Mã bài đặt là `T-WA-xx` để không đụng ba hệ đánh số đang có (`T-xx`, `T-DT-xx`, `T-XL-xx`).
 */
'use strict';

// Nạp TRƯỚC: module này cắt cầu mạng. Nạp sau `gsheet-web-app` là nó đã kịp giữ bản `https` thật.
const gl = require('./gia-lap-web-app');

const {
  WebAppGoogleSheet, TOI_DA_DON_MOT_LO, SO_LAN_GOI_TIEP_TOI_DA, PHIEN_BAN
} = require('./gsheet-web-app');

// Trong Apps Script mọi file .gs dùng chung một phạm vi toàn cục, nên `ShellAppsScript.gs` gọi thẳng
// `Normalize.xuLy` được. Trong Node, giả lập chỉ nạp 5 file vào một phạm vi hàm; ba module lớp 2 rơi
// ra phạm vi toàn cục. Gán vào `global` là tái lập đúng cảnh "đã dán đủ file rồi Deploy".
const lop = gl.napLoiMay();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });

const cfg = lop.Config.tao({});
const SHEET = 'Shopee mall';
const NGAY_MAY_CHU = '2026-09-08T03:00:00Z';   // 10:00 ngày 08/9/2026 giờ Việt Nam

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];

/** `fn` trả về một chuỗi "số thật" để in kèm. Bài nào không in số thật là bài không kiểm được. */
async function test(ten, fn) {
  try {
    const so = await fn();
    soDat++;
    console.log('ĐẠT   ' + ten);
    if (so) console.log('        số thật: ' + so);
  } catch (e) {
    soHong++;
    hong.push(ten + ' -> ' + e.message);
    console.log('HỎNG  ' + ten + '\n   -> ' + e.message);
  }
}
function bang(thuc, mong, ghiChu) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((ghiChu ? ghiChu + ': ' : '') + 'được ' + a + ', cần ' + b);
}
function dung(dieuKien, ghiChu) { if (!dieuKien) throw new Error(ghiChu || 'điều kiện sai'); }

/** Chạy một việc PHẢI ném lỗi; trả về câu lỗi. Chạy trót lọt là bài hỏng. */
async function batLoi(fn, ghiChu) {
  let kq;
  try { kq = await fn(); } catch (e) { return String(e && e.message); }
  throw new Error((ghiChu ? ghiChu + ': ' : '') + 'lẽ ra phải ném lỗi mà lại BÁO THÀNH CÔNG, trả về ' +
    JSON.stringify(kq && kq.thongKe));
}

// ==================================================================== dựng bối cảnh

/** Một file tháng đủ ba sheet mà lớp ghi cần: gian hàng · Tổng tồn kho · Mapping_san_pham. */
function napFileThang(ss, dongCu) {
  gl.dungSheetGianHang(ss, SHEET, dongCu || []);
  gl.dungSheetDanhMuc(ss, lop.TestData.danhMucBang());
  gl.dungSheetMapping(ss, lop.TestData.mappingBang());
  gl.dungKhungThieu(ss);                                // YC-38.1: đủ khuôn như file thật
  return ss;
}

/**
 * Bối cảnh chuẩn: máy chủ Google đang là 08/9/2026; `link_thang` trên máy đã khai tháng 8 và tháng 9.
 * `thieuThang9: true` dựng đúng ca D-42 "chưa khai link tháng đang chạy" — tool phải dừng TRÊN MÁY.
 * @param {Object} tc { thieuThang9, dongCu, mayGhiDe }
 */
function dungBoi(tc) {
  const o = tc || {};
  const sim = gl.taoGiaLap({ ngay: NGAY_MAY_CHU, suaNguon: o.suaNguon });   // `suaNguon`: chỉ cho đối chứng âm / Google bản khác
  const thang8 = napFileThang(sim.khaiThang('2026-08', 'THÁNG-8-2026-KINH-DOANH'),
    [{ ma: 'T8CU000001', tvt: 'dt5', sl: 1, h: 9000, i: 0, j: 0, k: 0 }]);
  // `khongKhaiLink` dựng file tháng 9 trên Google NHƯNG không ghi link vào link_thang: đúng cảnh
  // "chủ dự án đã tạo bản sao file tháng mà quên bấm nút 3 khai link".
  const thang9 = napFileThang(sim.khaiThang('2026-09', 'THÁNG-9-2026-KINH-DOANH',
    o.thieuThang9 ? { khongKhaiLink: true } : undefined), o.dongCu || []);
  const tao = (them) => new WebAppGoogleSheet(sim.cauHinhMay(
    Object.assign({ duong: 'ghi', cotPII: cfg.cotPII }, o.mayGhiDe, them)));
  return { sim, thang8, thang9, web: tao(), tao: tao };
}

/** Danh sách mã đơn THẬT đang nằm ở cột C của sheet gian hàng, đọc thẳng kho ô, không qua thông báo. */
function maDonCua(ss, tenSheet) {
  const sh = ss.getSheetByName(tenSheet || SHEET);
  const ra = [];
  for (let r = cfg.keyin.dong_dau; r <= sh.getLastRow(); r++) {
    const v = sh.giaTri[r + ':' + cfg.keyin.cot_ma_don];
    if (v !== undefined && String(v).trim() !== '') ra.push(String(v));
  }
  return ra;
}

/** Số DÒNG dữ liệu thật (đếm theo cột ngày: mọi dòng tool ghi đều có ngày, kể cả dòng con của đơn gộp). */
function soDongCua(ss, tenSheet) {
  const sh = ss.getSheetByName(tenSheet || SHEET);
  let n = 0;
  for (let r = cfg.keyin.dong_dau; r <= sh.getLastRow(); r++) {
    const v = sh.giaTri[r + ':' + cfg.keyin.cot_ngay];
    if (v !== undefined && String(v) !== '') n++;
  }
  return n;
}

function soTrung(ds) { return ds.length - new Set(ds).size; }

/** Gói lệnh ghi `n` đơn, mỗi đơn một dòng hàng. Mã đơn có chữ nên không bị nhầm là số điện thoại. */
function lenhMau(n, batDauTu) {
  const b = batDauTu || 1;
  const don = [];
  for (let i = 0; i < n; i++) {
    const so = b + i;
    don.push({
      maDon: 'D2609X' + ('00000' + so).slice(-5), ngay: '2026-09-08',
      tien: { H: 100000 + so, I: 0, J: 5000, K: 1500 },
      dong: [{ tenVietTat: 'dt5', soLuong: 1 }]
    });
  }
  return [{ tenSheet: SHEET, don: don }];
}

/** Dòng lớp 1 thật (đi qua AdapterFileXuat), cần cho đường mặc định `xuLy`. */
function dongLop1(n) {
  const cacDon = [];
  for (let i = 1; i <= n; i++) {
    cacDon.push(lop.TestData.don({
      maDon: 'XL2609' + ('00000' + i).slice(-5),
      dongs: [{ ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', phanLoai: '', sl: 1, gia: 100000 }]
    }));
  }
  const a = lop.AdapterFileXuat.doc(lop.TestData.bangNguon(cfg, cacDon),
    { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'thu-xuat.xlsx' }, cfg);
  return [{ maGianHang: 'SP_MALL', tenFile: 'thu-xuat.xlsx', dong: a.dong }];
}

const tuyChonXuLy = { ngayGhi: '2026-09-08', sheetCuaGian: (m) => lop.Config.gianHang(cfg, m).sheet };

// ====================================================================================================

async function chay() {

  // ================================================================== 1. D-12: MẤT MẠNG GIỮA CHỪNG
  //
  // Kỳ vọng của kế hoạch: dừng · giữ nguyên gói chưa gửi · báo "chưa ghi được, chạy lại sau";
  // chạy lại KHÔNG sinh đơn trùng.
  // CẤM TUYỆT ĐỐI: ghi một nửa số đơn rồi báo thành công.
  //
  // Triệu chứng thật nếu vi phạm: user nhìn thấy "XONG, ghi thêm 250 đơn", đóng máy, mà file
  // tháng chỉ có 200 đơn. 50 đơn kia không ai biết là thiếu cho tới lúc chốt sổ cuối tháng.
  console.log('--- D-12 · đứt TRƯỚC khi Web App ghi được gì ---');
  {
    // Vì sao bài này tồn tại: rớt mạng lúc gói vừa rời máy là ca thường gặp nhất (wifi văn phòng).
    // Triệu chứng nếu vi phạm: tool coi lỗi mạng là "chắc là ok", đánh dấu file nguồn đã xử lý,
    // rồi cả lượt đơn đó biến mất vĩnh viễn vì lần chạy sau không còn file để đọc.
    const b = dungBoi();
    await b.web.ping();                       // nói chuyện được một lần rồi mới rớt mạng
    const truoc = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
    b.sim.demLai();
    b.sim.datLoi({ loiKetNoi: 'ECONNRESET: rớt mạng giữa lúc POST' });
    let cauLoi = '';

    await test('T-WA-01 đứt trước khi ghi → NÉM LỖI, KHÔNG một dòng nào được ghi', async () => {
      cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(12)), 'mất mạng');
      const sau = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
      bang(sau.dong, truoc.dong, 'số dòng phải y nguyên');
      bang(sau.ma, truoc.ma, 'danh sách mã đơn phải y nguyên');
      return 'dòng trước ' + truoc.dong + ' · dòng sau ' + sau.dong + ' · mã đơn ' + sau.ma.length +
        ' · lượt gọi mạng ' + b.sim.nhatKyGoi.length;
    });

    await test('T-WA-02 gói chưa gửi được GIỮ NGUYÊN, không lô nào bị gửi tiếp sau khi đứt', () => {
      bang(b.sim.demGoiGhi, 1, 'chỉ được thử đúng một lượt rồi dừng');
      return 'lượt gọi "ghi" = ' + b.sim.demGoiGhi + ' (trần cho phép 1) · tổng lượt gọi mạng = ' +
        b.sim.nhatKyGoi.length;
    });

    await test('T-WA-03 chạy lại sau khi có mạng → ghi ĐỦ, không thiếu đơn nào', async () => {
      b.sim.xoaLoi();
      const kq = await b.web.ghi('2026-09', lenhMau(12));
      const sau = maDonCua(b.thang9);
      bang(kq.thongKe.donGhi, 12, 'phải ghi đủ 12 đơn');
      bang(sau.length, truoc.ma.length + 12, 'số mã đơn sau khi chạy lại');
      bang(soTrung(sau), 0, 'không được có mã đơn trùng');
      return 'donGhi ' + kq.thongKe.donGhi + ' · donDaCo ' + kq.thongKe.donDaCo +
        ' · dòng ' + truoc.dong + ' → ' + soDongCua(b.thang9) + ' · mã trùng ' + soTrung(sau);
    });

    await test('T-WA-04 câu báo mất mạng phải nói "chưa ghi được, chạy lại sau" (KE_HOACH D-12)', () => {
      // Vì sao bài này tồn tại: kế hoạch kiểm thử ghi rõ kỳ vọng là câu "chưa ghi được, chạy lại sau".
      // Triệu chứng nếu vi phạm: user đọc "Không gọi được Web App: socket hang up" rồi không biết
      // phải làm gì. Bấm lại thì sợ ghi trùng, không bấm thì mất đơn. Cả hai đều là quyết định sai
      // sinh ra từ một câu báo lỗi thiếu vế "việc phải làm".
      dung(/chạy lại|thử lại/i.test(cauLoi),
        'câu báo không nói việc phải làm (chạy lại), nguyên văn: "' + cauLoi + '"');
      dung(/chưa ghi|không ghi|chưa vào/i.test(cauLoi),
        'câu báo không nói rõ là CHƯA GHI ĐƯỢC, nguyên văn: "' + cauLoi + '"');
      return 'nguyên văn: ' + cauLoi;
    });
  }

  console.log('--- D-12 · đứt SAU khi Web App đã ghi xong (ca hiểm nhất) ---');
  {
    // Vì sao bài này tồn tại: Apps Script ghi xong rồi mới rớt phản hồi. Máy tính KHÔNG có cách nào
    // biết là đã ghi hay chưa. Đây là ca duy nhất mà "chạy lại cho chắc" có thể sinh đơn trùng, và
    // tầng khử trùng thứ hai (đọc lại cột mã đơn BÊN TRONG LockService, `ShellAppsScript.gs`
    // ghiMotSheet_) là thứ duy nhất cứu được.
    // Triệu chứng nếu vi phạm: mỗi lần rớt mạng là file tháng có thêm một bản sao đầy đủ của cả lượt
    // đơn, đúng thứ dự án chứng quyền của cùng chủ dự án đã dính (3.145 dòng thừa sau 9 phiên).
    const b = dungBoi();
    await b.web.ping();
    b.sim.demLai();
    const truoc = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
    let sauDut = null;

    await test('T-WA-05 ghi xong mà phản hồi không về → máy BÁO LỖI, tuyệt đối không báo thành công', async () => {
      b.sim.datLoi({ dutSauKhiGhi: true });
      const cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(9)), 'đứt sau khi ghi');
      sauDut = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
      bang(sauDut.ma.length, truoc.ma.length + 9, 'phía Google đã ghi thật 9 đơn');
      return 'dòng ' + truoc.dong + ' → ' + sauDut.dong + ' · mã đơn ' + truoc.ma.length + ' → ' +
        sauDut.ma.length + ' · máy báo: ' + cauLoi;
    });

    await test('T-WA-06 chạy lại sau ca hiểm nhất → 0 đơn mới, KHÔNG một mã nào bị ghi trùng', async () => {
      b.sim.xoaLoi();
      const kq = await b.web.ghi('2026-09', lenhMau(9));
      const cuoi = maDonCua(b.thang9);
      bang(kq.thongKe.donGhi, 0, 'không được ghi thêm đơn nào');
      bang(kq.thongKe.donDaCo, 9, 'phải nhận ra đủ 9 đơn đã có');
      bang(cuoi, sauDut.ma, 'danh sách mã đơn phải y hệt trước khi chạy lại');
      bang(soTrung(cuoi), 0, 'mã đơn trùng');
      bang(soDongCua(b.thang9), sauDut.dong, 'số dòng không được tăng');
      return 'donGhi ' + kq.thongKe.donGhi + ' · donDaCo ' + kq.thongKe.donDaCo + ' · dòng ' +
        sauDut.dong + ' → ' + soDongCua(b.thang9) + ' · mã trùng ' + soTrung(cuoi);
    });

    await test('T-WA-07 chạy lại thêm 3 lần nữa vẫn đứng yên (chống trùng không phải may mắn một lần)', async () => {
      for (let i = 0; i < 3; i++) await b.web.ghi('2026-09', lenhMau(9));
      const cuoi = maDonCua(b.thang9);
      bang(cuoi, sauDut.ma, 'sau 3 lần chạy lại nữa');
      return 'sau tổng 5 lượt gửi cùng một gói: ' + cuoi.length + ' mã đơn · ' +
        soDongCua(b.thang9) + ' dòng · ' + soTrung(cuoi) + ' mã trùng';
    });
  }

  console.log('--- D-12 · đứt GIỮA HAI LÔ khi gói bị chia lô ---');
  {
    // Vì sao bài này tồn tại: `gsheet-web-app.js` chia gói thành nhiều lô 200 đơn. Đứt ở lô 2 nghĩa là
    // một PHẦN đã vào sheet, đúng cái mà cột "Cấm tuyệt đối" của D-12 gọi tên: "ghi một nửa số đơn
    // rồi báo thành công". Bài này chứng minh tool không báo thành công, và chạy lại thì lô đã ghi
    // không bị ghi lại còn lô chưa ghi thì được ghi.
    const TONG = TOI_DA_DON_MOT_LO + 50;      // 250 đơn → đúng 2 lô
    const b = dungBoi();
    await b.web.ping();
    b.sim.demLai();
    const truoc = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
    let giua = null;

    await test('T-WA-08 đứt sau lô 1 → lô 1 vào sheet, lô 2 KHÔNG được gửi, máy không báo thành công', async () => {
      b.sim.datLoi({ dutSauKhiGhi: 1 });      // chỉ cắt đúng lượt "ghi" thứ nhất
      const cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(TONG)), 'đứt giữa hai lô');
      giua = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
      bang(giua.ma.length, truoc.ma.length + TOI_DA_DON_MOT_LO, 'lô 1 phải nằm trọn trong sheet');
      bang(b.sim.demGoiGhi, 1, 'lô 2 tuyệt đối không được gửi sau khi lô 1 đứt');
      return 'tổng gói ' + TONG + ' đơn · mã đơn ' + truoc.ma.length + ' → ' + giua.ma.length +
        ' · lượt gọi "ghi" ' + b.sim.demGoiGhi + '/2 lô · máy báo: ' + cauLoi;
    });

    await test('T-WA-09 chạy lại → lô đã ghi KHÔNG ghi lại, lô chưa ghi ĐƯỢC ghi', async () => {
      b.sim.xoaLoi();
      const kq = await b.web.ghi('2026-09', lenhMau(TONG));
      const cuoi = maDonCua(b.thang9);
      bang(kq.thongKe.donGhi, TONG - TOI_DA_DON_MOT_LO, 'chỉ được ghi thêm phần còn thiếu');
      bang(kq.thongKe.donDaCo, TOI_DA_DON_MOT_LO, 'phải nhận ra lô 1 đã có');
      bang(cuoi.length, truoc.ma.length + TONG, 'tổng mã đơn cuối cùng');
      bang(soTrung(cuoi), 0, 'mã đơn trùng');
      return 'donGhi ' + kq.thongKe.donGhi + ' · donDaCo ' + kq.thongKe.donDaCo + ' · dòng ' +
        giua.dong + ' → ' + soDongCua(b.thang9) + ' · mã đơn ' + cuoi.length + ' · trùng ' + soTrung(cuoi);
    });
  }

  console.log('--- D-12 · đường MẶC ĐỊNH "xuLy" cũng phải dừng sạch khi mất mạng ---');
  {
    // Vì sao bài này tồn tại: từ bản 2.4.0 đường mặc định là `xuLy` (Web App tự chạy lớp 2 + lớp 3).
    // Ba khối trên chạy trên đường lùi `ghi`. Nếu chỉ test đường lùi thì đúng cái đường đang dùng thật
    // lại không có bài nào. Hỏng ở đó là hỏng trên file tiền thật.
    const b = dungBoi({ mayGhiDe: { duong: 'xuLy' } });
    const truoc = soDongCua(b.thang9);
    b.sim.datLoi({ loiKetNoi: 'ETIMEDOUT: mạng rớt khi đang gửi gói xuLy' });

    await test('T-WA-10 đường "xuLy" mất mạng → 0 dòng ghi, đúng một lượt gọi rồi dừng', async () => {
      const cauLoi = await batLoi(() => b.web.xuLy('2026-09', dongLop1(10), tuyChonXuLy), 'xuLy mất mạng');
      bang(soDongCua(b.thang9), truoc, 'số dòng phải y nguyên');
      bang(maDonCua(b.thang9).length, 0, 'không mã đơn nào được ghi');
      bang(b.sim.nhatKyGoi.length, 1, 'chỉ được gọi mạng đúng một lượt');
      return 'dòng ' + truoc + ' → ' + soDongCua(b.thang9) + ' · lượt gọi mạng ' +
        b.sim.nhatKyGoi.length + ' · máy báo: ' + cauLoi;
    });
  }

  // ================================================================== 2. D-13: WEB APP TRẢ LỖI
  //
  // Kỳ vọng: phân biệt TỪNG LOẠI và nói ĐÚNG VIỆC PHẢI LÀM. Không thử lại vô hạn.
  // CẤM TUYỆT ĐỐI: coi mọi phản hồi khác 200 là "chắc là ok".
  console.log('--- D-13 · bốn loại lỗi Web App, mỗi loại một câu khác nhau ---');
  {
    const cau = {};       // loại -> câu báo tới tay người vận hành
    const luot = {};      // loại -> số lượt gọi mạng
    const dong = {};      // loại -> số dòng ghi được (phải là 0 ở mọi loại)

    /** Dựng bối cảnh mới, bơm đúng một loại lỗi, gửi một gói ghi, thu lại câu báo và các số đếm. */
    async function ban(ten, batLoiVao, mayGhiDe) {
      const b = dungBoi({ mayGhiDe: mayGhiDe });
      batLoiVao(b.sim, b.web);
      b.sim.demLai();
      cau[ten] = await batLoi(() => b.web.ghi('2026-09', lenhMau(4)), ten);
      luot[ten] = b.sim.nhatKyGoi.length;
      dong[ten] = soDongCua(b.thang9);
      return b;
    }

    await test('T-WA-11 GOOGLE TỪ CHỐI 403 → đúng MỘT câu lỗi quyền D-46, kèm mã HTTP thật', async () => {
      // D-43 bỏ chuỗi bí mật nên ca "sai bí mật" không còn tồn tại. Ca THAY THẾ nó ở đúng vị trí này —
      // "cửa đóng, gõ không vào" — là quyền truy cập: Deploy để "Only myself", hoặc file tháng chưa chia
      // sẻ. Triệu chứng nếu vi phạm: user đọc một trang HTML tiếng Anh giữa cửa sổ đen rồi đi sửa lung
      // tung ba thứ khác, trong khi việc phải làm chỉ là một dòng trong hộp Deploy.
      await ban('quyen403', (sim) => sim.datLoi({ ma403: true }));
      const c = cau.quyen403;
      dung(/LỖI QUYỀN TRUY CẬP/.test(c), 'phải mở đầu bằng câu chuẩn D-46: ' + c);
      dung(/Who has access = Anyone/.test(c), 'phải nêu việc (1) Deploy/quyền truy cập: ' + c);
      dung(/quyền Chỉnh sửa/.test(c), 'phải nêu việc (2) chia sẻ file tháng: ' + c);
      dung(/HTTP 403/.test(c), 'phải giữ mã HTTP thật để người phụ trách dò được: ' + c);
      bang(dong.quyen403, 0, 'không được ghi dòng nào');
      return 'lượt gọi mạng ' + luot.quyen403 + ' · dòng ghi ' + dong.quyen403 + '\n        ' + c.split('\n')[0];
    });

    await test('T-WA-12 MÁY DƯỚI MỐC (YC-42) → Web App từ chối, câu nguyên văn nói máy cũ + "bấm 2_CAP_NHAT.bat" + chưa ghi gì', async () => {
      // Viết lại 14/9 theo YC-42: tới 2.6.1 bài này gửi `phienBanMongDoi` khác bản Web App và đòi bị chặn ("lệch là chặn").
      // Nay cửa là khoảng tương thích — khác bản trong khoảng thì PHỤC VỤ (T-WA-33) — nên ca bị chặn còn lại là máy DƯỚI MỐC
      // `MAY_TOI_THIEU`. Câu phải tới tay người dùng NGUYÊN VĂN, không bọc tiền tố "Web App từ chối [...]": đó là câu duy nhất
      // nói thẳng bên nào cũ và việc phải làm.
      const b = dungBoi();
      b.sim.demLai();
      // Gửi thẳng một gói khai bản máy dưới mốc → chạm ĐÚNG nhánh thật trong ShellAppsScript.gs, không dùng lỗi bơm sẵn.
      cau.phienBan = await batLoi(() => b.web._goi({
        hanhDong: 'ghi', thang: '2026-09', lenh: lenhMau(4), banMay: '2.3.0', phienBanMongDoi: '2.3.0'
      }), 'máy dưới mốc');
      luot.phienBan = b.sim.nhatKyGoi.length;
      dong.phienBan = soDongCua(b.thang9);
      const c = cau.phienBan;
      bang(c, require('./gsheet-web-app').thongBaoMayQuaCu('2.3.0', b.sim.vo.MAY_TOI_THIEU), 'câu chặn nguyên văn');
      dung(/2_CAP_NHAT\.bat/.test(c) && /CHƯA ghi gì/.test(c), 'không nói việc phải làm / không nói chưa ghi: ' + c);
      dung(c.indexOf('Web App từ chối') < 0, 'bị bọc tiền tố, mất câu nguyên văn: ' + c);
      bang(dong.phienBan, 0, 'không được ghi dòng nào');
      return 'lượt gọi mạng ' + luot.phienBan + ' · dòng ghi ' + dong.phienBan + '\n        ' + c;
    });

    await test('T-WA-13 BẢN CŨ KHÔNG BIẾT HÀNH ĐỘNG (HANH_DONG_LA) → cũng chỉ sang việc Deploy lại', async () => {
      // Chiều thứ hai của cùng một sự cố: bản .gs cũ chưa có hành động mới nên trả HANH_DONG_LA.
      // Triệu chứng nếu vi phạm: máy im lặng coi như đã ghi.
      await ban('hanhDongLa', (sim) => sim.datLoi({ lechPhienBan: { kieu: 'HANH_DONG_LA' } }));
      const c = cau.hanhDongLa;
      dung(/Deploy lại/.test(c), 'không nói việc phải làm: ' + c);
      dung(/lệch phiên bản/i.test(c), 'không nêu nguyên nhân: ' + c);
      bang(dong.hanhDongLa, 0, 'không được ghi dòng nào');
      return 'lượt gọi mạng ' + luot.hanhDongLa + ' · dòng ghi ' + dong.hanhDongLa + '\n        ' + c;
    });

    await test('T-WA-14 LỖI PHÍA APPS SCRIPT (mã 500) → nêu mã lỗi VÀ việc người vận hành phải làm', async () => {
      // Vì sao bài này tồn tại: 500 là lỗi bên Google, người vận hành KHÔNG sửa được bằng cách gõ lại
      // cấu hình. Câu báo phải nói thẳng "chạy lại sau / xem nhật ký Apps Script", nếu không thì user
      // sẽ đi sửa lung tung ba thứ khác trước khi hỏi người phụ trách.
      await ban('ma500', (sim) => sim.datLoi({ ma500: true }));
      const c = cau.ma500;
      dung(/500/.test(c), 'không nêu mã lỗi HTTP: ' + c);
      dung(/chạy lại|thử lại|nhật ký|Apps Script|người phụ trách/i.test(c),
        'nêu được mã 500 nhưng KHÔNG nói việc phải làm: ' + c);
      bang(dong.ma500, 0, 'không được ghi dòng nào');
      return 'lượt gọi mạng ' + luot.ma500 + ' · dòng ghi ' + dong.ma500 + '\n        ' + c;
    });

    await test('T-WA-15 TRẢ VỀ HTML ĐĂNG NHẬP GOOGLE (mã 200) → chỉ đúng lỗi quyền truy cập khi Deploy', async () => {
      // Vì sao bài này tồn tại: đây là ca ĐỘC nhất của D-13: mã HTTP là 200, mọi phép kiểm "statusCode
      // < 400" đều thấy xanh, nhưng thân phản hồi là trang đăng nhập Google. Dấu hiệu deploy sai
      // "Who has access" (để "Only myself" thay vì "Anyone").
      // Triệu chứng nếu vi phạm: tool coi 200 là thành công, báo "đã ghi N đơn" trong khi Google chưa
      // hề nhận được gói nào.
      await ban('htmlDangNhap', (sim) => sim.datLoi({ htmlDangNhap: true }));
      const c = cau.htmlDangNhap;
      // D-46: gom về cùng MỘT câu chuẩn với ca 403 — cùng nguyên nhân, cùng cách chữa. Nhưng dòng chi
      // tiết phải giữ dấu vết "không phải JSON / trang HTML" để người phụ trách phân biệt được hai ca.
      dung(/LỖI QUYỀN TRUY CẬP/.test(c), 'phải là câu chuẩn D-46: ' + c);
      dung(/không phải JSON/i.test(c), 'dòng chi tiết phải giữ dấu vết phản hồi không phải JSON: ' + c);
      dung(/quyền truy cập|Anyone/i.test(c), 'không chỉ ra lỗi quyền truy cập khi Deploy: ' + c);
      bang(dong.htmlDangNhap, 0, 'không được ghi dòng nào');
      return 'mã HTTP 200 nhưng thân là HTML · lượt gọi mạng ' + luot.htmlDangNhap +
        ' · dòng ghi ' + dong.htmlDangNhap + '\n        ' + c.slice(0, 160) + ' …';
    });

    await test('T-WA-16 QUÁ 6 PHÚT (Google trả 500 kèm HTML "Exceeded maximum execution time")', async () => {
      // Ca thứ năm, cùng mã HTTP 500 với T-WA-14 nhưng nguyên nhân khác hẳn: gói quá to chứ không phải
      // mã hỏng. Câu báo phải mang dấu vết phân biệt được, nếu không người vận hành sẽ đi báo lỗi mã
      // trong khi việc phải làm là chia nhỏ file thả vào.
      await ban('quaGio', (sim) => sim.datLoi({ quaSauPhut: true }));
      const c = cau.quaGio;
      dung(/500/.test(c), 'không nêu mã lỗi HTTP: ' + c);
      dung(/Exceeded maximum execution time|thời gian thực thi/i.test(c),
        'không giữ lại dấu vết quá giờ để phân biệt với 500 thường: ' + c);
      bang(dong.quaGio, 0, 'không được ghi dòng nào');
      return 'lượt gọi mạng ' + luot.quaGio + ' · dòng ghi ' + dong.quaGio;
    });

    await test('T-WA-17 lỗi KHÁC NGUYÊN NHÂN thì KHÁC CÂU; hai ca cùng nguyên nhân thì cố ý cùng câu', () => {
      // Ba nhóm, ba cách chữa khác hẳn nhau, nên phải khác câu ngay từ đầu dòng:
      //   quyen403/htmlDangNhap → đi sửa quyền · phienBan (máy dưới mốc, YC-42) → bấm nút 2 · ma500 → chạy lại / xem Executions.
      const ten = ['quyen403', 'phienBan', 'ma500'];
      for (let i = 0; i < ten.length; i++) {
        for (let j = i + 1; j < ten.length; j++) {
          dung(cau[ten[i]] !== cau[ten[j]], ten[i] + ' và ' + ten[j] + ' cùng một câu');
          // 40 ký tự đầu là phần "chuyện gì". Trùng nhau ở đây nghĩa là người đọc phải soi tới cuối câu
          // mới phân biệt được, mà trên cửa sổ đen thì gần như không phân biệt được.
          dung(cau[ten[i]].slice(0, 40) !== cau[ten[j]].slice(0, 40),
            ten[i] + ' và ' + ten[j] + ' mở đầu giống hệt 40 ký tự');
        }
      }
      // Chiều ngược lại, cũng phải canh: 403 và trang đăng nhập là CÙNG một nguyên nhân (quyền), nên
      // D-46 cố ý cho chúng cùng MỘT câu. Tách thành hai câu là bắt người đọc tự đoán mình đang ở ca nào.
      bang(cau.quyen403.split('\n')[0], cau.htmlDangNhap.split('\n')[0],
        'hai ca quyền phải cùng một câu chuẩn D-46 ở dòng đầu');
      return ten.map((t) => t + ': "' + cau[t].split('\n')[0].slice(0, 46) + '…"').join('\n        ');
    });

    await test('T-WA-18 KHÔNG THỬ LẠI VÔ HẠN, mỗi loại lỗi chỉ tốn ĐÚNG 1 lượt gọi mạng', () => {
      // Vì sao bài này tồn tại: Apps Script có quota lượt gọi theo ngày. Một vòng lặp thử lại là ăn hết
      // quota của cả ngày, và mỗi lượt thử lại còn là một cơ hội ghi trùng.
      const ten = Object.keys(luot);
      ten.forEach((t) => dung(luot[t] === 1, t + ' gọi mạng ' + luot[t] + ' lượt, phải là 1'));
      return ten.map((t) => t + '=' + luot[t]).join(' · ') +
        ' · trần thiết kế SO_LAN_GOI_TIEP_TOI_DA = ' + SO_LAN_GOI_TIEP_TOI_DA;
    });
  }

  console.log('--- D-13 · vòng gọi tiếp của đường "xuLy" phải có trần ---');
  {
    // Vì sao bài này tồn tại: đường `xuLy` có một vòng lặp GỌI TIẾP khi Web App dừng gọn vì chạm ngưỡng
    // giờ. Vòng lặp là chỗ duy nhất trong toàn bộ lớp mạng có thể quay vô hạn.
    // Triệu chứng nếu vi phạm: tool quay vòng gọi Google tới khi hết quota ngày, không ghi thêm ô nào,
    // và người vận hành nhìn cửa sổ đen đứng im cả tiếng.
    const b = dungBoi({ mayGhiDe: { duong: 'xuLy' } });
    const SO_DON = 250;

    await test('T-WA-19 ngưỡng giờ = 0 → Web App dừng gọn từng khối, máy gọi tiếp CÓ TRẦN và ghi đủ', async () => {
      const kq = await b.web.xuLy('2026-09', dongLop1(SO_DON),
        Object.assign({}, tuyChonXuLy, { toiDaDonMotLo: 400, nguongGiay: 0 }));
      const ds = maDonCua(b.thang9);
      dung(kq.soLanGoi > 1, 'phải có ít nhất một lượt gọi tiếp mới là đang kiểm vòng lặp');
      dung(kq.soLanGoi <= SO_LAN_GOI_TIEP_TOI_DA,
        'số lượt gọi ' + kq.soLanGoi + ' vượt trần ' + SO_LAN_GOI_TIEP_TOI_DA);
      bang(ds.length, SO_DON, 'phải ghi đủ đơn');
      bang(soTrung(ds), 0, 'mã đơn trùng');
      return 'soLo ' + kq.soLo + ' · lượt gọi ' + kq.soLanGoi + '/' + SO_LAN_GOI_TIEP_TOI_DA +
        ' · donGhi ' + kq.thongKe.donGhi + ' · dòng ' + soDongCua(b.thang9) + ' · trùng ' + soTrung(ds);
    });
  }

  // ================================================================== 3. D-10: FILE ĐÍCH KHÔNG GHI ĐƯỢC
  //
  // Bản gốc D-10 là "file tracking đang mở trong Excel (bị khóa ghi)". Ở chế độ Google Sheet không có
  // file Excel nào, nên đây là bản tương đương: file đích KHÔNG MỞ ĐƯỢC (bị xóa, đổi quyền, link hỏng).
  // Kỳ vọng: báo rõ, không mất dữ liệu. CẤM: ghi ra chỗ khác rồi im lặng bỏ.
  console.log('--- D-10 · file tháng đích không mở được (bản tương đương của "đang mở trong Excel") ---');
  {
    const b = dungBoi();
    const truoc = { dong: soDongCua(b.thang9), ma: maDonCua(b.thang9) };
    let cauLoi = '';

    await test('T-WA-20 không mở được file tháng → dừng ồn ào, nêu rõ chuyện gì, không ghi đi đâu khác', async () => {
      // Triệu chứng nếu vi phạm: tool ghi tạm vào file tháng khác hoặc bỏ qua im lặng rồi báo "xong
      // 0 đơn", cả lượt đơn biến mất mà nhật ký vẫn xanh.
      const idThang9 = b.thang9.getId();       // lấy từ chính giả lập, không gõ cứng khóa nội bộ
      const giu = b.sim.file[idThang9];
      delete b.sim.file[idThang9];             // chủ dự án đổi quyền / xóa nhầm file tháng
      b.sim.demLai();
      cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(6)), 'file đích không mở được');
      b.sim.file[idThang9] = giu;
      dung(/không mở được/i.test(cauLoi), 'câu báo không nói rõ chuyện gì: ' + cauLoi);
      // Không một file tháng nào bị đụng, kể cả file tháng 8 đứng ngay cạnh trong bảng link.
      bang(soDongCua(b.thang9), truoc.dong, 'file tháng 9');
      bang(maDonCua(b.thang8), ['T8CU000001'], 'file tháng 8 không được nhận đơn ghi hộ');
      return 'dòng tháng 9 ' + truoc.dong + ' → ' + soDongCua(b.thang9) + ' · dòng tháng 8 ' +
        soDongCua(b.thang8) + ' · lượt gọi mạng ' + b.sim.nhatKyGoi.length + '\n        ' + cauLoi;
    });

    await test('T-WA-21 sửa xong chạy lại → ghi đủ, KHÔNG mất đơn nào của lượt bị chặn', async () => {
      const kq = await b.web.ghi('2026-09', lenhMau(6));
      const ds = maDonCua(b.thang9);
      bang(kq.thongKe.donGhi, 6, 'phải ghi đủ 6 đơn của lượt trước');
      bang(soTrung(ds), 0, 'mã đơn trùng');
      return 'donGhi ' + kq.thongKe.donGhi + ' · dòng ' + truoc.dong + ' → ' + soDongCua(b.thang9) +
        ' · mã đơn ' + ds.length + ' · trùng ' + soTrung(ds);
    });
  }

  // ================================================================== 4. D-11: HAI MÁY CÙNG GHI
  //
  // Kỳ vọng GĐ2: khóa theo file đích, máy thứ hai bị TỪ CHỐI và được báo LÝ DO đọc hiểu được.
  // CẤM TUYỆT ĐỐI: hai máy cùng ghi, sinh đơn trùng trong sheet.
  console.log('--- D-11 · hai máy cùng ghi một file tháng ---');
  {
    const b = dungBoi();
    const truoc = soDongCua(b.thang9);
    let cauLoi = '';

    await test('T-WA-22 máy A đang giữ khóa → máy B bị TỪ CHỐI kèm lý do đọc hiểu được', async () => {
      // Triệu chứng nếu vi phạm: hai máy user bấm chạy cùng lúc, cả hai cùng đọc thấy "chưa có
      // đơn nào", cả hai cùng nối, file tháng có hai bản của mỗi đơn.
      await b.web.ping();
      b.sim.khoaBiMayKhacGiu = true;           // máy A đang giữ LockService
      b.sim.demLai();
      cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(7)), 'khóa bị máy khác giữ');
      dung(/lệnh ghi khác đang chạy/i.test(cauLoi), 'câu báo không nêu lý do bị từ chối: ' + cauLoi);
      dung(/thử lại|chạy lại/i.test(cauLoi), 'câu báo không nói việc phải làm: ' + cauLoi);
      bang(soDongCua(b.thang9), truoc, 'máy B không được ghi ô nào khi bị từ chối');
      return 'dòng ' + truoc + ' → ' + soDongCua(b.thang9) + ' · lượt gọi mạng ' +
        b.sim.nhatKyGoi.length + '\n        ' + cauLoi;
    });

    await test('T-WA-23 máy A nhả khóa → máy B chạy lại ghi đủ, không mất đơn', async () => {
      b.sim.khoaBiMayKhacGiu = false;
      const kq = await b.web.ghi('2026-09', lenhMau(7));
      bang(kq.thongKe.donGhi, 7, 'phải ghi đủ 7 đơn');
      return 'donGhi ' + kq.thongKe.donGhi + ' · dòng ' + truoc + ' → ' + soDongCua(b.thang9);
    });
  }

  console.log('--- D-11 · hai máy gửi CÙNG một gói vào cùng một lúc ---');
  {
    // Vì sao bài này tồn tại: đây mới là ca thật hay gặp: hai user cùng thả một file xuất rồi
    // cùng bấm chạy. Khóa chỉ xếp hàng chứ không khử trùng; thứ khử trùng là tầng 2 đọc lại cột mã đơn
    // BÊN TRONG khóa. Bài này chứng minh cả hai cơ chế phải cùng làm việc.
    const b = dungBoi();
    const mayA = b.tao();
    const mayB = b.tao();

    await test('T-WA-24 hai máy gửi song song cùng một gói → mỗi đơn chỉ vào sheet MỘT lần', async () => {
      const kq = await Promise.allSettled([
        mayA.ghi('2026-09', lenhMau(8)),
        mayB.ghi('2026-09', lenhMau(8))
      ]);
      const ds = maDonCua(b.thang9);
      const ghi = kq.map((x) => (x.status === 'fulfilled' ? x.value.thongKe.donGhi : 'lỗi'));
      const daCo = kq.map((x) => (x.status === 'fulfilled' ? x.value.thongKe.donDaCo : '-'));
      bang(ds.length, 8, 'tổng số mã đơn trong sheet');
      bang(soTrung(ds), 0, 'CẤM TUYỆT ĐỐI: hai máy cùng ghi sinh đơn trùng');
      bang(soDongCua(b.thang9), 8, 'tổng số dòng');
      return 'máy A/B ghi ' + ghi.join('/') + ' đơn · bỏ qua vì đã có ' + daCo.join('/') +
        ' · mã đơn trong sheet ' + ds.length + ' · trùng ' + soTrung(ds);
    });
  }

  // ================================================================== 5. D-14: THÁNG CHƯA CÓ TRONG BẢNG LINK
  //
  // ĐÃ CÓ SẴN: `node/test-dinh-tuyen-thang.js` T-DT-19 (câu báo của hành động 'ghi') và T-DT-44
  // (lệnh ghi dừng, `thaoTac.length === 0`). Hai bài dưới đây CỐ Ý không lặp lại hai bài đó: chúng đi
  // trọn đường máy tính → mạng → Apps Script và đo thứ hai bài kia không đo: SỐ DÒNG THẬT CỦA FILE
  // THÁNG TRƯỚC, trước và sau. "Không ghi lùi" chỉ chứng minh được bằng con số đó.
  console.log('--- D-42 · chưa khai link tháng đang chạy → dừng TRÊN MÁY, không ghi lùi ---');
  {
    const b = dungBoi({ thieuThang9: true });   // file tháng 9 có thật, nhưng link_thang chưa khai
    const t8Truoc = { dong: soDongCua(b.thang8), ma: maDonCua(b.thang8) };

    await test('T-WA-25 chưa khai link tháng 9 → DỪNG trên máy, chưa gọi mạng, tháng 8 không bị ghi lùi', async () => {
      // Triệu chứng nếu vi phạm: đơn tháng 9 nằm trong sổ tháng 8. Dòng tổng tháng 8 sai, dòng tổng tháng
      // 9 thiếu, và không ai phát hiện cho tới lúc đối chiếu cuối quý.
      // Khác bản 2.4.0 ở CHỖ DỪNG: trước đây Web App bên Google mới phát hiện thiếu tháng, nay máy tra
      // link_thang trước khi gửi nên dừng ngay tại chỗ — không tốn một lượt gọi mạng nào.
      b.sim.demLai();
      const cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(5)), 'chưa khai link tháng');
      dung(/CHƯA CÓ LINK FILE THÁNG 2026-09/.test(cauLoi), 'câu báo không nêu đúng tháng: ' + cauLoi);
      dung(/CAU_HINH_VAN_HANH\.json/.test(cauLoi), 'phải chỉ ra file cấu hình phải sửa: ' + cauLoi);
      dung(/3_TAO_FILE_THANG_MOI\.bat/.test(cauLoi), 'phải chỉ ra nút phải bấm: ' + cauLoi);
      dung(/không ghi gì/i.test(cauLoi), 'phải nói rõ là CHƯA ghi gì: ' + cauLoi);
      bang(b.sim.nhatKyGoi.length, 0, 'phải dừng TRƯỚC khi gọi mạng, không tốn lượt gọi nào');
      bang(maDonCua(b.thang8), t8Truoc.ma, 'file tháng 8 phải y nguyên từng mã đơn');
      bang(soDongCua(b.thang8), t8Truoc.dong, 'file tháng 8 phải y nguyên số dòng');
      bang(soDongCua(b.thang9), 0, 'file tháng 9 cũng không được ghi gì');
      return 'dòng tháng 8 ' + t8Truoc.dong + ' → ' + soDongCua(b.thang8) + ' · lượt gọi mạng ' +
        b.sim.nhatKyGoi.length + '\n        ' + cauLoi.slice(0, 150) + ' …';
    });

    await test('T-WA-26 link_thang trỏ NHẦM file tháng khác → Web App từ chối SAI_THANG_FILE, không ghi', async () => {
      // Hàng rào thứ hai của D-42, và là hàng rào quan trọng hơn: thiếu link thì tool tắc — ai cũng thấy.
      // Trỏ NHẦM link thì tool chạy êm và ghi vào sổ sai tháng — không ai thấy. Chỉ tên file tố giác được.
      const b2 = dungBoi();
      // Máy khai link tháng 9 cho khóa "2026-08": đúng cảnh dán nhầm dòng trong CAU_HINH_VAN_HANH.json.
      const web = b2.tao({ link_thang: { '2026-08': b2.sim.linkCua('2026-09') }, choPhepThangKhac: true });
      const t9Truoc = soDongCua(b2.thang9);
      const cauLoi = await batLoi(() => web.ghi('2026-08', lenhMau(3)), 'link trỏ nhầm tháng');
      dung(/SAI_THANG_FILE/.test(cauLoi), 'phải mang mã SAI_THANG_FILE: ' + cauLoi);
      dung(/THÁNG-9-2026/.test(cauLoi), 'phải nêu TÊN file mà link đang trỏ tới: ' + cauLoi);
      dung(/link_thang/.test(cauLoi), 'phải chỉ ra khóa cấu hình phải sửa: ' + cauLoi);
      bang(soDongCua(b2.thang9), t9Truoc, 'file tháng 9 không được nhận một dòng nào của tháng 8');
      return 'dòng tháng 9 ' + t9Truoc + ' → ' + soDongCua(b2.thang9) + '\n        ' + cauLoi.slice(0, 150);
    });

    await test('T-WA-26b INV-7: không lượt nào in link Web App, link file tháng hay ID file ra ngoài', () => {
      // D-43 bỏ chuỗi bí mật, nên thứ phải giữ kín nay là ĐƯỜNG VÀO: link /exec và ID file tháng. Câu báo
      // lỗi in ra cửa sổ đen rồi vào file nhật ký — lộ ở đó là lộ vĩnh viễn.
      const moi = b.sim.moiChuoiDaIn().join('\n');
      dung(moi.indexOf('GIA_LAP_KEODON/exec') < 0, 'LỘ LINK WEB APP trong đầu ra của Web App');
      const web = b.tao();
      const che = web.chePhu('mở https://docs.google.com/spreadsheets/d/' + b.sim.idCua('2026-09') +
        '/edit bằng link ' + b.sim.url);
      dung(che.indexOf(b.sim.idCua('2026-09')) < 0, 'chePhu() không che được ID file tháng: ' + che);
      dung(che.indexOf(b.sim.url) < 0, 'chePhu() không che được link Web App: ' + che);
      return 'quét ' + moi.length + ' ký tự đã in/trả về · chePhu() che cả link Web App lẫn ID file tháng';
    });
  }

  // ================================================================== YC-30 (D-46): BA CA MỘT CÂU
  //
  // Ba nguyên nhân khác nhau, cùng MỘT việc phải làm, nên cùng MỘT câu. Trước 13/9 mỗi ca ra một câu
  // khác nhau và không ca nào nói được việc phải làm: ca 403 in "Web App trả mã 403"; ca trang đăng nhập
  // rơi vào `JSON.parse` hỏng nên in "Web App trả về không phải JSON"; ca Web App mở không được file thì
  // in nguyên câu của Apps Script. Người vận hành đọc ba câu đó không ai đoán ra là phải đi chia sẻ file.
  {
    const CAU = 'LỖI QUYỀN TRUY CẬP — kiểm tra: (1) Web App đã Deploy bản mới, Who has access = Anyone; ' +
      '(2) file Google Sheet tháng 2026-09 phải do tài khoản đã deploy Web App sở hữu hoặc được chia sẻ ' +
      'quyền Chỉnh sửa.';

    console.log('\n--- YC-30 (D-46): ba ca quyền truy cập gom về một câu ---');

    await test('T-WA-27 ba ca (403 · trang đăng nhập HTML · Web App báo không mở được file) → ĐÚNG MỘT CÂU', async () => {
      const ca = [
        ['HTTP 403', { ma403: true }, 403],
        ['trang đăng nhập HTML (mã 200)', { htmlDangNhap: true }, 200],
        ['Web App trả NGOAI_LE không mở được file', { loiMoFile: 'You do not have permission to access the requested document.' }, 200]
      ];
      const thu = [];
      for (const [ten, co, maHttp] of ca) {
        const b2 = dungBoi();
        b2.sim.datLoi(co);
        const cau = await batLoi(() => b2.tao().ghi('2026-09', lenhMau(2)), ten);
        dung(cau.indexOf(CAU) === 0, ten + ': câu phải MỞ ĐẦU đúng nguyên văn D-46, nhận: ' + cau.slice(0, 200));
        dung(cau.indexOf('Chi tiết') > 0, ten + ': phải có dòng chi tiết để người sửa còn manh mối');
        if (maHttp !== 200) {
          dung(cau.indexOf('HTTP ' + maHttp) > 0, ten + ': dòng chi tiết phải ghi mã HTTP thật, nhận: ' + cau);
        }
        bang(soDongCua(b2.thang9), 0, ten + ': từ chối rồi thì KHÔNG được ghi dòng nào');
        b2.sim.thaoGo();
        thu.push(ten);
      }
      return thu.length + ' ca · cùng một câu mở đầu · 0 dòng được ghi';
    });

    await test('T-WA-28 ĐỐI CHỨNG ÂM: Web App trả 200 JSON hợp lệ → KHÔNG được in câu lỗi quyền', async () => {
      // Câu đỏ này dừng cả lượt chạy. In oan vài lần là người vận hành quen tay bỏ qua, rồi bỏ qua luôn
      // lần nó đúng. Phép chấm ở T-WA-27 chỉ có nghĩa nếu chiều ngược lại cũng được canh.
      const b2 = dungBoi();
      const kq = await b2.tao().ghi('2026-09', lenhMau(2));
      dung(kq && kq.thongKe.donGhi === 2, 'lượt bình thường phải ghi được 2 đơn: ' + JSON.stringify(kq && kq.thongKe));
      const moi = b2.sim.moiChuoiDaIn().join('\n');
      dung(moi.indexOf('LỖI QUYỀN TRUY CẬP') < 0, 'lượt chạy bình thường mà vẫn in câu lỗi quyền');
      b2.sim.thaoGo();
      return 'ghi ' + kq.thongKe.donGhi + ' đơn · 0 lần in câu lỗi quyền';
    });

    // ================================================================ YC-28: CỬA CHUỖI BÍ MẬT
    //
    // D-43 sửa 13/9: chuỗi bí mật KHÔNG bị bỏ. Cái bỏ là việc bắt user gõ tay — gói giao user mang sẵn
    // chuỗi trong CAU_HINH_VAN_HANH.json. Link Web App để `Anyone`, nên chuỗi này là thứ duy nhất ngăn
    // người dò trúng link ghi thẳng vào sổ tiền của shop.
    console.log('\n--- YC-28: cửa chuỗi bí mật (C-6.2 so bằng SHA-256) ---');

    await test('T-WA-29 chuỗi ĐÚNG qua cửa; sai / rỗng / thiếu hẳn đều bị TỪ CHỐI, không ghi ô nào', async () => {
      const b2 = dungBoi();
      const ok = await b2.tao().ghi('2026-09', lenhMau(2));
      bang(ok.thongKe.donGhi, 2, 'chuỗi đúng phải ghi được');
      const daGhi = soDongCua(b2.thang9);

      const ca = [
        ['sai một ký tự cuối', b2.sim.biMat.slice(0, -1) + 'X'],
        ['sai hoa/thường', b2.sim.biMat.toLowerCase()],
        ['thiếu một ký tự', b2.sim.biMat.slice(0, -1)],
        ['thừa một ký tự', b2.sim.biMat + 'x']
      ];
      for (const [ten, chuoi] of ca) {
        const cau = await batLoi(() => b2.tao({ chuoi_bi_mat: chuoi }).ghi('2026-09', lenhMau(2)), ten);
        dung(/SAI_BI_MAT/.test(cau), ten + ': phải mang mã SAI_BI_MAT, nhận: ' + cau.slice(0, 160));
        dung(cau.indexOf(b2.sim.biMat) < 0, ten + ': câu lỗi KHÔNG được in lại chuỗi thật');
        dung(cau.indexOf(chuoi) < 0, ten + ': câu lỗi KHÔNG được in lại chuỗi vừa gửi');
      }
      bang(soDongCua(b2.thang9), daGhi, 'mọi lượt sai chuỗi cộng lại phải ghi thêm 0 dòng');

      // Rỗng và thiếu hẳn: chặn NGAY TRÊN MÁY, chưa gọi mạng — lỗi cấu hình thì không cần hỏi Google.
      for (const co of [{ chuoi_bi_mat: '' }, { chuoi_bi_mat: undefined }]) {
        let cau = '';
        try { b2.tao(co); } catch (e) { cau = String(e.message); }
        dung(/thiếu chuoi_bi_mat/.test(cau), 'thiếu chuỗi phải dừng ngay lúc dựng, nhận: ' + cau);
      }
      b2.sim.thaoGo();
      return ca.length + ' ca sai đều bị chặn · 2 ca thiếu chặn ngay trên máy · 0 dòng lọt';
    });

    await test('T-WA-30 ĐỐI CHỨNG ÂM: gỡ cửa bí mật khỏi doPost → cả bốn ca sai PHẢI TRƯỢT', async () => {
      // Dựng lại đúng khuyết tật (cửa bị gỡ) rồi chạy lại chính bốn ca của T-WA-29. Chúng phải ĐƯỢC CHẤP
      // NHẬN — chứng minh T-WA-29 đang canh cái cửa, không phải canh một thứ khác tình cờ cũng chặn.
      const CU = "    if (!biMatDung_(body.token)) {";
      const suaNguon = (src) => {
        const n = src.split(CU).length - 1;
        if (n !== 1) {
          throw new Error('ĐỐI CHỨNG ÂM HỎNG: cần đúng 1 chỗ gọi biMatDung_ trong doPost, tìm được ' + n +
            '. Mã đã đổi — sửa lại chuỗi mốc, ĐỪNG bỏ qua bài này.');
        }
        return src.split(CU).join('    if (false) {');
      };
      const sim2 = gl.taoGiaLap({ ngay: NGAY_MAY_CHU, suaNguon: suaNguon });
      napFileThang(sim2.khaiThang('2026-09', 'THÁNG-9-2026-KINH-DOANH'), []);
      const web = new WebAppGoogleSheet(sim2.cauHinhMay({
        duong: 'ghi', cotPII: cfg.cotPII, chuoi_bi_mat: sim2.biMat.slice(0, -1) + 'X'
      }));
      const kq = await web.ghi('2026-09', lenhMau(2));
      const soDong = soDongCua(sim2.soLinkThang['2026-09']);
      sim2.thaoGo();
      bang(kq.thongKe.donGhi, 2, 'cửa đã gỡ mà vẫn chặn — phép chấm T-WA-29 đang canh nhầm chỗ');
      dung(soDong > 0, 'cửa đã gỡ thì chuỗi sai lẽ ra phải ghi lọt — nhận 0 dòng');
      return 'cửa gỡ → chuỗi sai ghi lọt ' + kq.thongKe.donGhi + ' đơn (đúng như phải), nên T-WA-29 có mắt';
    });

    await test('T-WA-31 C-6.1: phản hồi SAI_BI_MAT không mang phienBan lẫn banDung', async () => {
      const b2 = dungBoi();
      const kq = b2.sim.vo.doPost({ postData: { contents: JSON.stringify({ hanhDong: 'ping', token: 'SAI' }) } });
      const o = JSON.parse(kq.getContent());
      bang(o.loi, 'SAI_BI_MAT');
      bang(o.phienBan, undefined, 'nhánh chưa qua cửa KHÔNG được lộ số phiên bản');
      bang(o.banDung, undefined, 'nhánh chưa qua cửa KHÔNG được lộ dấu vân tay bản dựng');
      // Và chiều ngược lại: qua cửa rồi thì PHẢI có, nếu không máy mất chỗ so bản dựng.
      const ok = JSON.parse(b2.sim.vo.doPost({
        postData: { contents: JSON.stringify({ hanhDong: 'ping', token: b2.sim.biMat }) }
      }).getContent());
      bang(ok.phienBan, b2.sim.vo.PHIEN_BAN, 'qua cửa rồi thì phải trả phienBan');
      dung(!!ok.banDung, 'qua cửa rồi thì phải trả banDung');
      b2.sim.thaoGo();
      return 'sai chuỗi: 0 thông tin bản dựng · đúng chuỗi: đủ phienBan + banDung';
    });
  }

  // ================================================================== YC-41 VIỆC 6: NÚT 4 CHỜ ĐỦ LÂU
  //
  // Đường `xuLy` phía Google tự dừng gọn ở NGUONG_GIAY_XU_LY (240 giây) rồi mới dựng phản hồi. Máy chờ 180 giây (bản
  // 2.6.1) thì một lượt dài báo "Web App không trả lời" giữa lúc Google vẫn đang ghi. Chấm trên THỜI GIAN CHỜ THẬT mà
  // máy đặt cho từng lệnh gửi đi (cả POST lẫn GET chuyển hướng 302), so với ngưỡng đọc thẳng từ `.gs`.
  console.log('\n--- YC-41 việc 6: thời gian chờ mỗi lượt nút 4 ≥ ngưỡng xuLy của Google + 60 giây ---');
  {
    const Module = require('module');
    const httpsGia = require('https');                 // bản giả `gia-lap-web-app` đã cắm vào require.cache
    const NGUON_SHELL = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'ShellAppsScript.gs'), 'utf8');
    const nguongGs = (src) => { const m = /^var NGUONG_GIAY_XU_LY = (\d+);/m.exec(src); if (!m) throw new Error('không đọc được NGUONG_GIAY_XU_LY'); return +m[1]; };

    /** Chạy ping + ghi + xuLy bằng một bản `gsheet-web-app`, trả mọi thời gian chờ máy đã đặt. */
    async function doCho(Lop) {
      const b3 = dungBoi();
      const cho = [];
      const gocReq = httpsGia.request, gocGet = httpsGia.get;
      httpsGia.request = function (opt, cb) { cho.push({ kieu: 'POST', ms: opt && opt.timeout }); return gocReq.call(this, opt, cb); };
      httpsGia.get = function (u, opt, cb) { cho.push({ kieu: 'GET 302', ms: opt && opt.timeout }); return gocGet.call(this, u, opt, cb); };
      try {
        const web = new Lop.WebAppGoogleSheet(b3.sim.cauHinhMay({ duong: 'xuLy', cotPII: cfg.cotPII }));
        await web.ping();
        await web.ghi('2026-09', lenhMau(2));
        await web.xuLy('2026-09', dongLop1(2), tuyChonXuLy);
      } finally { httpsGia.request = gocReq; httpsGia.get = gocGet; b3.sim.thaoGo(); }
      return cho;
    }
    /** Phép chấm: trả danh sách chỗ sai (rỗng = đạt). */
    const cham = (cho, Lop, nguongGiay) => {
      const loi = [];
      const san = (nguongGiay + 60) * 1000;
      if (!cho.length) loi.push('không bắt được lệnh gửi nào');
      if (Lop.TIMEOUT_MS < san) loi.push('TIMEOUT_MS = ' + Lop.TIMEOUT_MS / 1000 + ' giây < ' + san / 1000 + ' giây');
      cho.filter((x) => x.ms !== Lop.TIMEOUT_MS || x.ms < san).forEach((x) => loi.push(x.kieu + ' chờ ' + x.ms / 1000 + ' giây'));
      return loi;
    };

    await test('T-WA-32 mọi lệnh nút 4 (ping, ghi, xuLy — POST và GET chuyển hướng) chờ 300 giây ≥ NGUONG_GIAY_XU_LY của .gs + 60', async () => {
      const gw = require('./gsheet-web-app');
      const nguong = nguongGs(NGUON_SHELL);
      const cho = await doCho(gw);
      bang(cham(cho, gw, nguong), [], 'bản hiện hành');
      bang(gw.TIMEOUT_MS, 300000, 'đề bài YC-41 việc 6: 300 giây');
      dung(gw.TIMEOUT_MS < gw.TIMEOUT_TAO_THANG_MS, 'kéo đơn phải chờ ngắn hơn một lượt tạo tháng');

      // ĐỐI CHỨNG ÂM 1 — số của bản 2.6.1.
      const tep = require('path').join(__dirname, 'gsheet-web-app.js');
      const nguonGw = require('fs').readFileSync(tep, 'utf8');
      const MOC = 'const TIMEOUT_MS = 300000;';
      if (nguonGw.split(MOC).length !== 2) throw new Error('mốc đối chứng âm "' + MOC + '" phải có đúng 1 chỗ — sửa mốc, đừng bỏ bài');
      const m = new Module(tep, module);
      m.filename = tep;
      m.paths = Module._nodeModulePaths(__dirname);
      m._compile(nguonGw.split(MOC).join('const TIMEOUT_MS = 180000;'), tep);
      const loiCu = cham(await doCho(m.exports), m.exports, nguong);
      if (!loiCu.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG LỆCH: chờ 180 giây mà phép chấm vẫn đạt');
      // ĐỐI CHỨNG ÂM 2 — ai nâng ngưỡng bên Google lên 280 giây mà quên máy: bản hiện hành phải bị chấm LỆCH.
      const loiNguong = cham(cho, gw, nguongGs(NGUON_SHELL.replace(/^var NGUONG_GIAY_XU_LY = \d+;/m, 'var NGUONG_GIAY_XU_LY = 280;')));
      if (!loiNguong.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG LỆCH: ngưỡng Google 280 giây mà máy 300 giây vẫn đạt');
      const dem = {};
      cho.forEach((x) => { dem[x.kieu] = (dem[x.kieu] || 0) + 1; });
      return Object.keys(dem).map((k) => dem[k] + ' ' + k).join(' + ') + ' đều chờ ' + gw.TIMEOUT_MS / 1000 + ' giây (ngưỡng .gs ' + nguong +
        ' + 60) · đối chứng âm "180 giây": LỆCH (' + loiCu[0] + ') · đối chứng âm "Google nâng ngưỡng lên 280": LỆCH (' + loiNguong[0] + ')';
    });
  }

  // ================================================================== YC-42: CỬA PHIÊN BẢN THEO KHOẢNG TƯƠNG THÍCH
  //
  // Ma trận máy × Google chạy TRỌN đường nút 4 (`xuLy`, mã .gs thật trên Web App giả), đếm DÒNG THẬT trong sheet.
  // "Máy 2.6.1" và "Google 2.6.1" dựng đúng hành vi CỬA BẰNG TUYỆT ĐỐI đang chạy ở production ngày 14/9 (máy chỉ gửi
  // `phienBanMongDoi`, chặn khi `phienBan` khác bản mình; Google chặn khi `phienBanMongDoi` khác bản mình, không trả
  // `banWebApp`) — bằng cách cắm lại đúng các dòng đó vào mã hiện hành. Đây là hai ca user sẽ gặp trong lúc lên 2.7.0.
  console.log('\n--- YC-42: ma trận máy × Google trên đường xuLy (cửa theo khoảng tương thích) ---');
  {
    const Module = require('module');
    const fs2 = require('fs'), path2 = require('path');
    const tepGw = path2.join(__dirname, 'gsheet-web-app.js');
    const NGUON_GW = fs2.readFileSync(tepGw, 'utf8');
    const thay = (src, doi, ten) => doi.reduce((s, [moc, moi]) => {
      const n = s.split(moc).length - 1;
      if (n !== 1) throw new Error('KHÔNG CẮM ĐƯỢC vào ' + ten + ' — mốc cần 1 chỗ, tìm được ' + n + ': "' + moc.slice(0, 70) + '" (mã đã đổi: sửa mốc, đừng bỏ bài)');
      return s.split(moc).join(moi);
    }, src);
    const napMay = (doi) => {
      const m = new Module(tepGw, module);
      m.filename = tepGw;
      m.paths = Module._nodeModulePaths(__dirname);
      m._compile(thay(NGUON_GW, doi, 'gsheet-web-app.js'), tepGw);
      return m.exports;
    };
    const MOC_BAN_MAY = "const PHIEN_BAN = '2.7.0';";
    const MOC_CUA_MAY = '  if (ss === null || ss < 0) throw hong(';
    const MAY_BANG_TUYET_DOI = [MOC_CUA_MAY, '  if (ss === null || soSanhBan(thuc, banMay) !== 0) throw hong('];
    const mayBan = (ban) => napMay([[MOC_BAN_MAY, "const PHIEN_BAN = '" + ban + "';"]]);
    /** Máy tới 2.6.1: gửi mỗi `phienBanMongDoi` = bản mình, đọc `phienBan`, chặn khi khác. */
    const mayCuaCu = (ban) => napMay([
      [MOC_BAN_MAY, "const PHIEN_BAN = '" + ban + "';"],
      ['phienBanMongDoi: this.banGuiDi(), banMay: PHIEN_BAN }', 'phienBanMongDoi: PHIEN_BAN }'],
      ['          if (kq.banWebApp != null) {', '          if (false) {'],
      ['          if (kq.mayToiThieu != null) this.mayToiThieuWebApp', '          if (false) this.mayToiThieuWebApp'],
      MAY_BANG_TUYET_DOI
    ]);
    const MOC_BAN_GS = "var PHIEN_BAN = '2.7.0';";
    const MOC_CUA_GS = 'banMay && !banDuTu_(banMay, MAY_TOI_THIEU)) {';
    const GS_BANG_TUYET_DOI = [MOC_CUA_GS, 'banMay && banMay !== PHIEN_BAN) {'];
    const MOC_TRA_SO = 'PHIEN_BAN_TRA_LOI_ = (!coBanMay && mongDoi && banDuTu_(mongDoi, MAY_TOI_THIEU)) ? mongDoi : PHIEN_BAN;';
    /** Google tới 2.6.1: chặn khi `phienBanMongDoi` khác bản mình, trả `phienBan` thật, không `banWebApp`/`mayToiThieu`. */
    const googleCuaCu = (ban) => (src) => thay(src, [
      [MOC_BAN_GS, "var PHIEN_BAN = '" + ban + "';"],
      [MOC_CUA_GS, 'mongDoi && mongDoi !== PHIEN_BAN) {'],
      [MOC_TRA_SO, 'PHIEN_BAN_TRA_LOI_ = PHIEN_BAN;'],
      ['    if (o.banWebApp == null) o.banWebApp = PHIEN_BAN;\n', ''],
      ['    if (o.mayToiThieu == null) o.mayToiThieu = MAY_TOI_THIEU;\n', '']
    ], 'ShellAppsScript.gs');
    const googleBangTuyetDoi = (src) => thay(src, [GS_BANG_TUYET_DOI, [MOC_TRA_SO, 'PHIEN_BAN_TRA_LOI_ = PHIEN_BAN;']], 'ShellAppsScript.gs');

    /**
     * Một lượt ghi 3 đơn trên đường mặc định `xuLy` (nút 4) VÀ một lượt trên đường lùi `ghi` (máy tự dựng gói) — mỗi đường
     * một Web App giả riêng. Trả số dòng ghi được, câu lỗi (nếu có), số gói ghi đã gửi, dòng nhắc — gộp hai đường: `ghi` là
     * số dòng NHỎ HƠN của hai đường, `cau` là câu của đường nào bị chặn.
     */
    async function motLuot(Lop, suaNguon) {
      const mot = async (duong) => {
        const b = dungBoi({ suaNguon: suaNguon });
        const truoc = soDongCua(b.thang9);
        const web = new Lop.WebAppGoogleSheet(b.sim.cauHinhMay({ duong: duong, cotPII: cfg.cotPII }));
        let cau = null;
        try {
          if (duong === 'xuLy') await web.xuLy('2026-09', dongLop1(3), tuyChonXuLy);
          else await web.ghi('2026-09', lenhMau(3));
        } catch (e) { cau = e.message; }
        const kq = {
          ghi: soDongCua(b.thang9) - truoc, cau: cau,
          goiGhi: b.sim.nhatKyGoi.filter((g) => g.hanhDong === 'xuly' || g.hanhDong === 'ghi').length,
          nhac: web.canhBaoBanDung.filter((c) => /^Nhắc: /.test(c))
        };
        b.sim.thaoGo();
        return kq;
      };
      const x = await mot('xuLy'), g = await mot('ghi');
      return {
        ghi: Math.min(x.ghi, g.ghi), ghiNhieuNhat: Math.max(x.ghi, g.ghi), cau: x.cau || g.cau, chanCaHai: !!(x.cau && g.cau), goiXuLy: x.goiGhi + g.goiGhi,
        nhac: x.nhac.length && g.nhac.length ? x.nhac : [], tungDuong: 'xuLy ' + x.ghi + ' dòng · ghi ' + g.ghi + ' dòng'
      };
    }
    /** Chấm cả ma trận trên một bộ (máy, Google) cho từng ca — trả danh sách chỗ sai. */
    async function chamMaTran(ca) {
      const loi = [], so = {};
      const t1 = await motLuot(ca.mayHienHanh, ca.googleHienHanh);
      so.bangNhau = t1.ghi;
      if (t1.cau || t1.ghi !== 3) loi.push('(1) bằng nhau 2.7.0·2.7.0: ghi ' + t1.ghi + (t1.cau ? ' — ' + t1.cau.slice(0, 70) : ''));
      const t2 = await motLuot(ca.mayHienHanh, ca.google261);
      so.mayMoiHon = t2.ghi;
      if (t2.cau || t2.ghi !== 3) loi.push('(2) máy 2.7.0 · Google 2.6.1 cửa cũ: ghi ' + t2.ghi + (t2.cau ? ' — ' + t2.cau.slice(0, 70) : ''));
      else if (!t2.nhac.some((c) => /Google bản 2\.6\.1/.test(c) && /chủ dự án Deploy/.test(c))) loi.push('(2) không in dòng nhắc Google cũ hơn');
      const t3 = await motLuot(ca.may261, ca.googleHienHanh);
      so.googleMoiHon = t3.ghi;
      if (t3.cau || t3.ghi !== 3) loi.push('(3) máy 2.6.1 cửa cũ · Google 2.7.0: ghi ' + t3.ghi + (t3.cau ? ' — ' + t3.cau.slice(0, 70) : ''));
      const t4a = await motLuot(ca.may240, ca.googleHienHanh);
      if (!t4a.chanCaHai || !/^MÁY NÀY ĐANG CHẠY BẢN QUÁ CŨ/.test(t4a.cau) || !/2_CAP_NHAT\.bat/.test(t4a.cau) || t4a.ghiNhieuNhat !== 0) {
        loi.push('(4a) máy 2.4.0 dưới mốc: ghi ' + t4a.ghiNhieuNhat + ' · ' + String(t4a.cau).slice(0, 70));
      }
      const t4b = await motLuot(ca.mayHienHanh, ca.google240);
      if (!t4b.chanCaHai || !/^BẢN TRÊN GOOGLE QUÁ CŨ/.test(t4b.cau) || !/Deploy/.test(t4b.cau) || t4b.ghiNhieuNhat !== 0 || t4b.goiXuLy !== 0) {
        loi.push('(4b) Google 2.4.0 dưới mốc: ghi ' + t4b.ghiNhieuNhat + ' · gói ghi/xuLy ' + t4b.goiXuLy + ' · ' + String(t4b.cau).slice(0, 70));
      }
      so.cau4a = t4a.cau; so.cau4b = t4b.cau; so.duong2 = t2.tungDuong; so.duong3 = t3.tungDuong;
      return { loi, so };
    }

    await test('T-WA-33 YC-42 ma trận 4 ca máy × Google trên CẢ HAI đường xuLy và ghi: bằng nhau · máy mới hơn · Google mới hơn đều GHI ĐƯỢC; dưới mốc thì CHẶN, 0 dòng', async () => {
      const hienHanh = {
        mayHienHanh: require('./gsheet-web-app'), googleHienHanh: undefined,
        google261: googleCuaCu('2.6.1'), may261: mayCuaCu('2.6.1'),
        may240: mayBan('2.4.0'), google240: googleCuaCu('2.4.0')
      };
      const kq = await chamMaTran(hienHanh);
      bang(kq.loi, [], 'bản hiện hành');
      // ĐỐI CHỨNG ÂM — giữ so sánh BẰNG TUYỆT ĐỐI ở cả hai vỏ (đúng cửa tới 2.6.1): ca (2) và (3) phải bị chấm là tắc.
      const sai = await chamMaTran(Object.assign({}, hienHanh, {
        mayHienHanh: napMay([MAY_BANG_TUYET_DOI]), googleHienHanh: googleBangTuyetDoi
      }));
      dung(sai.loi.some((x) => /^\(2\)/.test(x)) && sai.loi.some((x) => /^\(3\)/.test(x)),
        'ĐỐI CHỨNG ÂM KHÔNG LỆCH đủ hai ca: ' + sai.loi.join(' | '));
      return '(1) ghi ' + kq.so.bangNhau + ' · (2) máy mới hơn: ' + kq.so.duong2 + ' + dòng nhắc · (3) Google mới hơn: ' + kq.so.duong3 +
        ' · (4a) ' + kq.so.cau4a.slice(0, 60) + '… 0 dòng · (4b) ' + kq.so.cau4b.slice(0, 60) + '… 0 dòng, 0 gói ghi/xuLy · ' +
        'đối chứng âm "giữ bằng tuyệt đối" -> LỆCH (' + sai.loi.filter((x) => /^\([23]\)/.test(x)).map((x) => x.slice(0, 60)).join(' | ') + ')';
    });
  }

  // ====================================================================================================
  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) {
    hong.forEach((h) => console.log('  HỎNG: ' + h));
    console.log('\nHỎNG Ở ĐÂY LÀ MÃ THIẾU HÀNG RÀO, KHÔNG PHẢI TEST SAI. Đừng nới test cho qua.');
    console.log('Xem mục "lỗ hổng" trong báo cáo dev để biết đoạn nào phải cắm vào file nào.');
    process.exit(1);
  }
}

chay().catch((e) => {
  console.error('\nBỘ TEST TỰ NÓ HỎNG (không phải bài nào hỏng): ' + ((e && e.stack) || e));
  process.exit(1);
});
