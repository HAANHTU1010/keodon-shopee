/**
 * DẤU VÂN TAY BẢN DỰNG — mục 1.3.
 *
 * Mỗi chỉ tiêu đều có ĐỐI CHỨNG ÂM: dựng lại đúng khuyết tật rồi chứng minh phép chấm báo TRƯỢT.
 * Quy tắc BA đặt sau vụ dấu `!`: phép kiểm chỉ có bài dương tính là phép kiểm chưa được kiểm.
 *
 * Ca phải bắt được, xếp theo mức khó:
 *   · Google chạy bản CŨ HẲN (chưa có dấu vân tay)        — dễ
 *   · Google thiếu hàm lõi / còn hàm đã bỏ                — dễ
 *   · Google khớp dấu tổng nhưng SÓT ĐÚNG MỘT FILE        — khó nhất, và là ca dễ xảy ra nhất
 *     khi dán tay mười một file. Đây là lý do dấu phải theo TỪNG FILE chứ không một số chung.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DVT = require('./dau-van-tay');
const { soDauVanTay } = require('./gsheet-web-app');
const SRC = path.join(__dirname, '..', 'src');

let dat = 0, hong = 0;
const KQ = [];
function test(ma, ten, fn) {
  try { const t = fn(); dat++; KQ.push(['ĐẠT', ma, ten, t]); }
  catch (e) { hong++; KQ.push(['HỎNG', ma, ten, null, e.message]); }
}
function bang(a, b, vi) {
  if (String(a) !== String(b)) throw new Error((vi ? vi + ': ' : '') + 'được ' + JSON.stringify(a) + ', cần ' + JSON.stringify(b));
}
function dung(dk, vi) { if (!dk) throw new Error(vi); }

/** Chạy phép chấm trên bản SAI, đòi nó phải báo LỆCH. */
function doiChungAm(nhan, chay) {
  let lech = null;
  try { chay(); } catch (e) { lech = e.message; }
  if (!lech) throw new Error('ĐỐI CHỨNG ÂM HỎNG — cắm bản sai "' + nhan + '" mà phép chấm vẫn báo đạt');
  return 'đối chứng âm "' + nhan + '": LỆCH ← đúng như phải thế · ' + lech.slice(0, 100);
}

/** Phản hồi `ping` giả, khớp hoàn toàn với src/ hiện tại. */
function pingKhop() {
  const v = DVT.tinh();
  return {
    ok: true, hanhDong: 'ping', phienBan: '2.4.0',
    banDung: v.tong,
    vanTay: Object.assign({}, v.tungFile),
    hamLoi: { co: ['mauChepCongThucDS_', 'chepCongThucXuong_'], thieu: [], camMaVanCo: [] }
  };
}

// ==================================================================== chỉ tiêu

test('DV-01', 'Dấu vân tay trong mã KHỚP hiện trạng src/ — sửa .gs mà quên đóng dấu là bị bắt', () => {
  const kq = DVT.kiem();
  bang(kq.lech.join(' | '), '', 'chỗ lệch');

  const dc = doiChungAm('sửa một file .gs mà quên chạy lại `npm run dau-van-tay -- --ghi`', () => {
    const d = path.join(SRC, 'Normalize.gs');
    const luu = fs.readFileSync(d);
    fs.writeFileSync(d, Buffer.concat([luu, Buffer.from('\n// sua len mot dong\n', 'utf8')]));
    try {
      const l = DVT.kiem().lech;
      if (l.length) throw new Error(l[0]);
    } finally { fs.writeFileSync(d, luu); }
  });
  return Object.keys(DVT.TEN_HANG).length + ' file đều có dấu tươi · BAN_DUNG ' + kq.dung.tong + ' · ' + dc;
});

test('DV-02', 'Đóng dấu HỘI TỤ: chạy `--ghi` lần hai không đổi gì thêm', () => {
  const truoc = DVT.docDauDangDong();
  const kq = DVT.ghi();
  bang(kq.doi.length, 0, 'số file bị đổi khi đã tươi');
  const sau = DVT.docDauDangDong();
  bang(JSON.stringify(sau), JSON.stringify(truoc), 'dấu sau lượt --ghi thừa');
  bang(DVT.kiem().lech.length, 0, 'còn lệch sau khi --ghi');
  return 'chạy lại --ghi: 0 file đổi, dấu y nguyên';
});

test('DV-03', 'Băm bỏ qua CRLF: cùng nội dung khác xuống dòng phải ra CÙNG một dấu', () => {
  const d = path.join(SRC, 'Schema.gs');
  const luu = fs.readFileSync(d);
  const truoc = DVT.tinh().tungFile['Schema.gs'];
  try {
    // Đổi toàn bộ sang CRLF — nội dung không đổi một chữ.
    fs.writeFileSync(d, luu.toString('utf8').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n'), 'utf8');
    bang(DVT.tinh().tungFile['Schema.gs'], truoc,
      'đổi LF→CRLF mà dấu đổi theo — máy Windows và máy Linux sẽ kêu lệch oan suốt ngày');
  } finally { fs.writeFileSync(d, luu); }
  return 'LF và CRLF cho cùng một dấu: ' + truoc;
});

test('DV-04', 'Máy phát hiện Google chạy bản CŨ HẲN (chưa có dấu vân tay)', () => {
  const p = pingKhop(); delete p.banDung; delete p.vanTay;
  const c = soDauVanTay(p);
  dung(c.length === 1, 'phải có đúng một câu cảnh báo, nhận ' + c.length);
  dung(/chưa có dấu vân tay/.test(c[0]), c[0]);
  dung(/Dán lại/.test(c[0]), 'câu phải nói rõ việc phải làm: ' + c[0]);

  const dc = doiChungAm('phép so bỏ qua ca thiếu banDung (coi im lặng là khớp)', () => {
    const im = (kq) => (kq.banDung == null ? [] : soDauVanTay(kq));
    if (im(p).length === 0) throw new Error('bản bỏ qua trả 0 câu — bản cũ đi lọt hoàn toàn');
  });
  return 'bắt được · ' + dc;
});

test('DV-05', 'Máy phát hiện Google SÓT ĐÚNG MỘT FILE — ca dễ xảy ra nhất khi dán tay 11 file', () => {
  const p = pingKhop();
  p.vanTay['Normalize.gs'] = 'deadbeef';        // dán sót: file này còn là bản cũ
  p.banDung = 'khac0000khac';                    // dấu tổng do đó cũng khác
  const c = soDauVanTay(p);
  dung(c.length >= 1, 'phải kêu');
  const cau = c.join(' | ');
  dung(/Normalize\.gs/.test(cau), 'phải NÊU ĐÚNG TÊN file bị sót, nếu không người ta lại dán cả 11 file: ' + cau);
  dung(/Lệch ở 1 file/.test(cau), 'phải nói đúng một file lệch: ' + cau);

  const dc = doiChungAm('dấu vân tay chỉ có MỘT SỐ CHUNG, không theo từng file', () => {
    // Bản "một số chung": dấu tổng nằm trong ShellAppsScript.gs, mà file đó dán đúng bản mới.
    // Sót Normalize.gs thì số chung VẪN KHỚP → không ai biết.
    const q = pingKhop();
    q.vanTay = null;                             // không có dấu theo từng file
    if (soDauVanTay(q).length > 0) throw new Error('bản một-số-chung vẫn kêu');
    throw new Error('bản một-số-chung KHÔNG kêu khi sót Normalize.gs — đúng cái lỗ phải bịt');
  });
  return 'nêu đích danh Normalize.gs · ' + dc;
});

test('DV-06', 'Máy phát hiện Google THIẾU HÀM LÕI và CÒN HÀM ĐÃ BỎ', () => {
  const p = pingKhop();
  p.hamLoi = { co: [], thieu: ['mauChepCongThucDS_', 'chepCongThucXuong_'], camMaVanCo: ['capNhatMoNeo_'] };
  const c = soDauVanTay(p).join(' | ');
  dung(/mauChepCongThucDS_/.test(c), 'phải nêu tên hàm thiếu: ' + c);
  dung(/capNhatMoNeo_/.test(c), 'phải nêu tên hàm đã bỏ mà còn: ' + c);
  dung(/CŨ HƠN/.test(c), 'phải nói thẳng bản trên Google cũ hơn: ' + c);

  const dc = doiChungAm('phép so chỉ nhìn dấu băm, bỏ qua danh sách hàm', () => {
    const chiBam = (kq) => (String(kq.banDung) === DVT.tinh().tong ? [] : ['lệch băm']);
    if (chiBam(p).length === 0) throw new Error('bản chỉ-nhìn-băm trả 0 câu — bản thiếu hàm lõi đi lọt');
  });
  return 'bắt cả hai chiều · ' + dc;
});

test('DV-07', 'Bản KHỚP thì IM LẶNG — không kêu oan, kể cả trên phản hồi LỖI', () => {
  bang(soDauVanTay(pingKhop()).length, 0, 'số câu cảnh báo khi khớp hoàn toàn');
  bang(soDauVanTay(null).length, 0, 'phản hồi rỗng thì im');
  // D-43 bỏ chuỗi bí mật nên không còn nhánh phản hồi nào bị cắt `banDung`: MỌI phản hồi đều mang, kể cả
  // phản hồi lỗi. Nhờ vậy một lượt chạy bị từ chối vì lý do khác (ví dụ link tháng trỏ nhầm file) vẫn so
  // được dấu vân tay — trước đây nhánh sai bí mật là một lỗ mù đúng lúc người ta đang loay hoay nhất.
  const loiNhungKhop = Object.assign({}, pingKhop(), { ok: false, loi: 'SAI_THANG_FILE' });
  bang(soDauVanTay(loiNhungKhop).length, 0, 'phản hồi LỖI mà bản dựng vẫn khớp thì không được kêu');
  return 'khớp → 0 câu · rỗng → 0 câu · phản hồi lỗi nhưng khớp bản dựng → 0 câu';
});

test('DV-09', 'ping THẬT trên mã hiện hành: không thiếu hàm lõi, KHÔNG báo "còn hàm đã bỏ" (YC-40.2)', () => {
  // Bài này chạy `ping` qua chính `ShellAppsScript.gs` (giả lập dịch vụ Google), không đọc mã bằng mắt.
  // Bản 2.5.0 lọt lỗi vì DV-06 chỉ thử `soDauVanTay` với phản hồi tự dựng tay, còn DV-08 chỉ soi chuỗi —
  // không bài nào gọi `hamLoiCoMat_` thật để xem nó trả gì.
  const gl = require('./gia-lap-web-app');
  const goiPing = (sim) => JSON.parse(sim.vo.doPost({
    postData: { contents: JSON.stringify({ token: sim.biMat, hanhDong: 'ping' }) }
  }).getContent());

  const sim = gl.taoGiaLap({});
  const kq = goiPing(sim);
  sim.thaoGo();
  dung(kq.ok, 'ping phải chạy: ' + JSON.stringify(kq).slice(0, 120));
  bang(JSON.stringify(kq.hamLoi.camMaVanCo), '[]', 'camMaVanCo của bản ĐÚNG');
  bang(JSON.stringify(kq.hamLoi.thieu), '[]', 'hàm lõi thiếu của bản ĐÚNG');
  const cau = soDauVanTay(kq).filter((c) => /ĐÃ BỎ|THIẾU|thiếu/.test(c));
  bang(cau.length, 0, 'máy không được in câu cảnh báo nào về hàm: ' + cau.join(' | '));
  for (const t of ['biMatDung_', 'caiDat', 'bam256_']) {
    dung(kq.hamLoi.co.indexOf(t) >= 0, 'ping phải báo "' + t + '" là hàm đang có');
  }

  // ĐỐI CHỨNG ÂM: dán thêm một hàm của bản cũ vào mã → ping PHẢI báo nó, và máy PHẢI kêu.
  const dc = doiChungAm('bản Google còn sót hàm mỏ neo moNeo_', () => {
    const simCu = gl.taoGiaLap({ suaNguon: (src) => src + '\nfunction moNeo_() { return null; }\n' });
    const kqCu = goiPing(simCu);
    simCu.thaoGo();
    bang(JSON.stringify(kqCu.hamLoi.camMaVanCo), '[]', 'bản cũ');
  });
  return kq.hamLoi.co.length + ' hàm lõi có mặt · camMaVanCo rỗng · máy im lặng · ' + dc;
});

test('DV-08', 'ShellAppsScript.gs khai đủ hằng và hàm mà máy trông đợi', () => {
  const s = fs.readFileSync(path.join(SRC, 'ShellAppsScript.gs'), 'utf8');
  for (const t of ['vanTayBanDung_', 'hamLoiCoMat_', 'BAN_DUNG']) {
    dung(s.indexOf(t) >= 0, 'ShellAppsScript.gs thiếu ' + t);
  }
  // 11 hằng dấu vân tay phải được vanTayBanDung_ đọc hết, nếu không có file rơi ra ngoài phép so.
  const thieu = Object.keys(DVT.TEN_HANG).filter((t) => s.indexOf(DVT.TEN_HANG[t]) < 0);
  bang(thieu.join(','), '', 'hằng dấu vân tay chưa được vanTayBanDung_ đọc');
  // C-6.1 (YC-28, D-43 sửa 13/9): `banDung` gắn vào mọi phản hồi ĐÃ QUA CỬA bí mật, và CỐ Ý không gắn
  // vào hai nhánh SAI_BI_MAT / CHUA_CAI_DAT — kể cả `phienBan`. Bài này canh đúng cái mệnh đề đó còn
  // nguyên trong mã: gỡ điều kiện `chuaQuaCua` đi là lại rò như trước 13/9.
  dung(/var chuaQuaCua = \(o\.loi === 'SAI_BI_MAT' \|\| o\.loi === 'CHUA_CAI_DAT'\);/.test(s),
    'traLoi_ phải loại trừ hai nhánh chưa qua cửa bí mật');
  dung(/if \(!chuaQuaCua\) \{/.test(s), 'traLoi_ phải bọc cả phienBan lẫn banDung trong nhánh đã qua cửa');
  for (const t of ['TT_BI_MAT', 'function caiDat', 'function biMatDung_', 'function bam256_', 'SAI_BI_MAT', 'CHUA_CAI_DAT']) {
    dung(s.indexOf(t) >= 0, 'ShellAppsScript.gs thiếu ' + t + ' — YC-28 GIỮ cơ chế chuỗi bí mật');
  }
  // C-6.2: so bằng SHA-256, không còn vòng so từng ký tự (thời gian chạy phụ thuộc độ dài chuỗi thật).
  dung(/Utilities\.computeDigest\(Utilities\.DigestAlgorithm\.SHA_256/.test(s),
    'biMatDung_ phải so bằng SHA-256 (C-6.2)');
  dung(!/for \(var i = 0; i < n; i\+\+\) if \(a\.charCodeAt/.test(s),
    'còn vòng so từng ký tự của bản cũ — C-6.2 thay bằng SHA-256');
  // Hai hàm mới của D-42/D-47 phải có mặt, vì `hamLoiCoMat_` báo chúng cho máy so.
  for (const t of ['moFileTheoId_', 'kiemTenFileKhopThang_', 'toLaiMapping_']) {
    dung(s.indexOf('function ' + t) >= 0, 'ShellAppsScript.gs thiếu ' + t);
  }
  return Object.keys(DVT.TEN_HANG).length + '/11 hằng được đọc · banDung gắn vào mọi phản hồi · 0 dấu vết SAI_BI_MAT';
});

for (const [tt, ma, ten, chuThich, loi] of KQ) {
  console.log(tt + '   ' + ma + ' ' + ten);
  if (chuThich) console.log('        · ' + chuThich);
  if (loi) console.log('   -> ' + loi);
}
console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · tổng ' + (dat + hong) + ' ===');
process.exit(hong ? 1 : 0);
