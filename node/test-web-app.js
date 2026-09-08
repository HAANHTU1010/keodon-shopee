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
  return ss;
}

/**
 * Bối cảnh chuẩn: máy chủ Google đang là 08/9/2026, bảng link đã khai tháng 8 và tháng 9.
 * @param {Object} tc { thieuThang9, dongCu, mayGhiDe }
 */
function dungBoi(tc) {
  const o = tc || {};
  const sim = gl.taoGiaLap({ ngay: NGAY_MAY_CHU });
  const thang8 = napFileThang(sim.khaiThang('2026-08', 'THÁNG 8-2026 KINH DOANH'),
    [{ ma: 'T8CU000001', tvt: 'dt5', sl: 1, h: 9000, i: 0, j: 0, k: 0 }]);
  const thang9 = o.thieuThang9 ? null
    : napFileThang(sim.khaiThang('2026-09', 'THÁNG 9-2026 KINH DOANH'), o.dongCu || []);
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
  // Triệu chứng thật nếu vi phạm: nhân viên nhìn thấy "XONG, ghi thêm 250 đơn", đóng máy, mà file
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
      // Triệu chứng nếu vi phạm: nhân viên đọc "Không gọi được Web App: socket hang up" rồi không biết
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

    await test('T-WA-11 SAI CHUỖI BÍ MẬT → chỉ đúng file cấu hình và hàm caiDat() phải sửa', async () => {
      // Triệu chứng nếu vi phạm: người vận hành đi Deploy lại Web App (việc mất 10 phút và có rủi ro)
      // trong khi thật ra chỉ cần sửa một dòng trong CAU_HINH_VAN_HANH.json.
      await ban('biMat', () => { }, { chuoi_bi_mat: 'CHUOI-BI-MAT-GO-NHAM-0000' });
      const c = cau.biMat;
      dung(/bí mật/i.test(c), 'không nêu chuyện gì: ' + c);
      dung(/CAU_HINH_VAN_HANH\.json/.test(c), 'không chỉ ra file cấu hình phải sửa: ' + c);
      dung(/caiDat/.test(c), 'không nhắc hàm caiDat() đã cài chuỗi nào: ' + c);
      dung(c.indexOf('CHUOI-BI-MAT-GO-NHAM-0000') < 0, 'INV-7: câu báo lộ chuỗi bí mật đã gửi');
      bang(dong.biMat, 0, 'không được ghi dòng nào');
      return 'lượt gọi mạng ' + luot.biMat + ' · dòng ghi ' + dong.biMat + '\n        ' + c;
    });

    await test('T-WA-12 CHƯA TRIỂN KHAI LẠI (lệch phiên bản) → nguyên văn câu "Deploy → New version"', async () => {
      // Vì sao bài này tồn tại: Google KHÔNG tự đồng bộ mã. Sửa .gs mà quên Deploy thì /exec vẫn chạy
      // bản cũ và KHÔNG báo gì. Bản .gs cũ có thể ghi sai cột vào file tiền thật.
      // Câu này phải tới tay người dùng NGUYÊN VĂN, không bọc thêm tiền tố "Web App từ chối [...]".
      // Đây là câu duy nhất nói thẳng việc phải làm.
      const b = dungBoi();
      b.sim.demLai();
      // Gửi thẳng một gói khai phiên bản mong đợi cũ → chạm ĐÚNG nhánh thật trong ShellAppsScript.gs,
      // không dùng lỗi bơm sẵn của giả lập.
      cau.phienBan = await batLoi(() => b.web._goi({
        hanhDong: 'ghi', thang: '2026-09', lenh: lenhMau(4), phienBanMongDoi: '2.3.0'
      }), 'lệch phiên bản');
      luot.phienBan = b.sim.nhatKyGoi.length;
      dong.phienBan = soDongCua(b.thang9);
      const c = cau.phienBan;
      dung(/Deploy/.test(c) && /New version/.test(c), 'không nói việc phải làm: ' + c);
      dung(c.indexOf('Web App từ chối') < 0, 'bị bọc tiền tố, mất câu nguyên văn: ' + c);
      dung(c.indexOf(PHIEN_BAN) >= 0, 'không nêu số bản thật của Web App (' + PHIEN_BAN + '): ' + c);
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
      // cấu hình. Câu báo phải nói thẳng "chạy lại sau / xem nhật ký Apps Script", nếu không thì nhân
      // viên sẽ đi sửa lung tung ba thứ khác trước khi hỏi người phụ trách.
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
      dung(/không phải JSON/i.test(c), 'không nói rõ phản hồi không phải JSON: ' + c);
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

    await test('T-WA-17 bốn loại lỗi cho BỐN CÂU KHÁC NHAU, không phải một câu chung chung', () => {
      const ten = ['biMat', 'phienBan', 'ma500', 'htmlDangNhap'];
      for (let i = 0; i < ten.length; i++) {
        for (let j = i + 1; j < ten.length; j++) {
          dung(cau[ten[i]] !== cau[ten[j]], ten[i] + ' và ' + ten[j] + ' cùng một câu');
          // 40 ký tự đầu là phần "chuyện gì". Trùng nhau ở đây nghĩa là người đọc phải soi tới cuối
          // câu mới phân biệt được, trên cửa sổ đen thì gần như không phân biệt được.
          dung(cau[ten[i]].slice(0, 40) !== cau[ten[j]].slice(0, 40),
            ten[i] + ' và ' + ten[j] + ' mở đầu giống hệt 40 ký tự');
        }
      }
      return ten.map((t) => t + ': "' + cau[t].slice(0, 46).replace(/\n/g, ' ') + '…"').join('\n        ');
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
      // Triệu chứng nếu vi phạm: hai máy nhân viên bấm chạy cùng lúc, cả hai cùng đọc thấy "chưa có
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
    // Vì sao bài này tồn tại: đây mới là ca thật hay gặp: hai nhân viên cùng thả một file xuất rồi
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
  console.log('--- D-14 · tháng hiện tại chưa có trong bảng link (bổ sung cho T-DT-19 / T-DT-44) ---');
  {
    const b = dungBoi({ thieuThang9: true });   // bảng link dừng ở tháng 8
    const t8Truoc = { dong: soDongCua(b.thang8), ma: maDonCua(b.thang8) };

    await test('T-WA-25 chưa khai tháng 9 → DỪNG, và file tháng 8 không bị ghi lùi một dòng nào', async () => {
      // Triệu chứng nếu vi phạm: đơn tháng 9 nằm trong sổ tháng 8. Dòng tổng tháng 8 sai, dòng tổng
      // tháng 9 thiếu, và không ai phát hiện cho tới lúc đối chiếu cuối quý.
      b.sim.demLai();
      const cauLoi = await batLoi(() => b.web.ghi('2026-09', lenhMau(5)), 'tháng chưa khai');
      dung(/Chưa có file cho tháng 9\/2026/.test(cauLoi), 'câu báo không nêu đúng tháng: ' + cauLoi);
      dung(/Thông tin shop/.test(cauLoi), 'câu báo không chỉ ra chỗ phải thêm dòng: ' + cauLoi);
      bang(maDonCua(b.thang8), t8Truoc.ma, 'file tháng 8 phải y nguyên từng mã đơn');
      bang(soDongCua(b.thang8), t8Truoc.dong, 'file tháng 8 phải y nguyên số dòng');
      return 'dòng tháng 8 ' + t8Truoc.dong + ' → ' + soDongCua(b.thang8) + ' · mã đơn tháng 8 ' +
        JSON.stringify(maDonCua(b.thang8)) + ' · lượt gọi mạng ' + b.sim.nhatKyGoi.length +
        '\n        ' + cauLoi.slice(0, 150) + ' …';
    });

    await test('T-WA-26 câu báo D-14 KHÔNG lộ mật khẩu gian hàng nằm cùng sheet "Thông tin shop "', () => {
      // Bảng link nằm ở cột A, B, C; cột D trở đi là MẬT KHẨU GIAN HÀNG. Câu báo lỗi in ra cửa sổ đen
      // và vào file nhật ký, lộ ở đây là lộ vĩnh viễn.
      const moi = b.sim.moiChuoiDaIn().join('\n');
      dung(moi.indexOf(b.sim.CHUOI_MAT_KHAU_BAY) < 0, 'LỘ MẬT KHẨU GIAN HÀNG');
      dung(moi.indexOf(b.sim.CHUOI_TEN_DANG_NHAP_BAY) < 0, 'LỘ TÊN ĐĂNG NHẬP');
      dung(moi.indexOf(b.sim.biMat) < 0, 'LỘ CHUỖI BÍ MẬT');
      return 'quét ' + moi.length + ' ký tự đã in/trả về · 0 lần khớp chuỗi mồi';
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
