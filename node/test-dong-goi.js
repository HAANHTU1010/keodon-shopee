/**
 * ĐÓNG GÓI + CẬP NHẬT — chạy thật, không giả lập.
 *
 * Nhóm DG-*: soi gói `Tool_nhap_lieu` vừa dựng, và soi chính file .zip giao đi.
 * Nhóm CN-*: dựng hẳn một "máy user" giả trong thư mục tạm, dựng một file .zip
 *            giống hệt bản GitHub tải về, rồi CHẠY THẬT `2_CAP_NHAT.bat` bằng cmd.exe
 *            và soi lại từng thứ trên đĩa. Không mạng, không đụng máy thật.
 *
 * VÌ SAO PHẢI CHẠY THẬT. Bốn điều bắt buộc ở mục 4 của đề bài đều là hành vi lúc chạy
 * trên đĩa — nặng nhất là "không bao giờ ghi đè CAU_HINH_VAN_HANH.json của từng máy",
 * vì file đó giữ chuỗi bí mật riêng. Đọc mã mà tin thì không đủ: chỉ có chạy rồi mở
 * file ra xem mới biết chuỗi bí mật còn hay mất.
 *
 * Mỗi chỉ tiêu đều kèm ĐỐI CHỨNG ÂM: dựng lại đúng bản sai rồi chứng minh phép chấm
 * báo LỆCH. Không có đối chứng âm thì không biết bài test có mắt hay không.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

const DG = require('./dong-goi');
const GOC_DU_AN = path.resolve(__dirname, '..', '..', '..');
const VAN_HANH = path.join(GOC_DU_AN, '03_VAN_HANH');
const CAU_HINH = 'Cấu hình'.normalize('NFC');
const NHAT_KY = 'nhật ký'.normalize('NFC');

// Chuỗi mồi: nếu nó lọt ra chỗ không được phép thì test bắt được ngay.
const BI_MAT_MOI = 'BI-MAT-CUA-MAY-NAY-0123456789';
const LINK_MOI = 'https://script.google.com/macros/s/MOI_LINK_CUA_MAY_NAY/exec';

let dat = 0, hong = 0;
const KQ = [];
/** Bài bất đồng bộ: gom lại, chạy tuần tự trong khối async ở cuối file. */
const DS_CHO = [];
function test(ma, ten, fn) {
  try {
    const t = fn();
    // Bẫy: `test()` vốn đồng bộ. Một bài `async` trả về Promise sẽ được ghi ĐẠT ngay lập tức, trước khi
    // một phép chấm nào kịp chạy — bài xanh vĩnh viễn dù mã hỏng. Chặn thẳng ở đây thay vì nhắc bằng
    // chú thích: ai viết bài async mà quên `await test` sẽ thấy nó HỎNG, không thấy nó xanh giả.
    if (t && typeof t.then === 'function') {
      throw new Error('bài async phải gọi bằng `await test(...)`, nếu không nó ĐẠT trước khi chấm');
    }
    dat++; KQ.push(['ĐẠT', ma, ten, t]);
  } catch (e) { hong++; KQ.push(['HỎNG', ma, ten, null, e.message]); }
}

/** Bản `test()` cho bài bất đồng bộ: chờ xong rồi mới ghi kết quả. */
async function testCho(ma, ten, fn) {
  try { const t = await fn(); dat++; KQ.push(['ĐẠT', ma, ten, t]); }
  catch (e) { hong++; KQ.push(['HỎNG', ma, ten, null, e.message]); }
}
function bang(a, b, vi) {
  if (String(a) !== String(b)) throw new Error((vi ? vi + ': ' : '') + 'được ' + JSON.stringify(a) + ', cần ' + JSON.stringify(b));
}
function dung(dk, vi) { if (!dk) throw new Error(vi); }

/** Chạy một phép chấm trên bản SAI, đòi nó phải báo LỆCH. */
function doiChungAm(nhan, chay) {
  let lech = null;
  try { chay(); } catch (e) { lech = e.message; }
  if (!lech) throw new Error('ĐỐI CHỨNG ÂM HỎNG — cắm bản sai "' + nhan + '" mà phép chấm vẫn báo đạt');
  return 'đối chứng âm "' + nhan + '": LỆCH ← đúng như phải thế · ' + lech.slice(0, 90);
}

function tamMoi(ten) {
  const d = path.join(os.tmpdir(), 'keodon-' + ten + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(d, { recursive: true });
  return d;
}
function doc(t) { return fs.readFileSync(t, 'utf8').replace(/^﻿/, ''); }
const RAC = [];

// ============================================================ NHÓM DG — cái gói

const goiThu = tamMoi('goi');
DG.dungGoi(path.join(goiThu, DG.TEN_GOI), false);   // `false` = không kèm node-portable: DG-07/DG-08 canh cây đó riêng
const GOI = path.join(goiThu, DG.TEN_GOI);
RAC.push(goiThu);

test('DG-01', 'Gói đúng cây thư mục mục 1: 4 nút + 2 thư mục, không mã nguồn, không .md', () => {
  const ngoai = fs.readdirSync(GOI).map((t) => t.normalize('NFC')).sort();
  bang(ngoai.join(' · '),
    ['1_CAI_DAT_LAN_DAU.bat', '1_THA_FILE_XUAT', '2_CAP_NHAT.bat', '3_TAO_FILE_THANG_MOI.bat',
      '4_CHAY_TOOL.bat', CAU_HINH].sort().join(' · '), 'lớp ngoài cùng');
  bang(DG.kiemGoi(GOI).length, 0, 'gói vừa dựng phải sạch');

  const dc = doiChungAm('lén nhét một file .xlsx số liệu thật vào gói', () => {
    const x = path.join(GOI, '1_THA_FILE_XUAT', 'Shopee mall', 'THANG-8-KINH-DOANH.xlsx');
    fs.writeFileSync(x, 'gia lap');
    try {
      const p = DG.kiemGoi(GOI);
      if (p.length) throw new Error(p[0]);
    } finally { fs.unlinkSync(x); }
  });
  return '5 file · ' + fs.readdirSync(path.join(GOI, '1_THA_FILE_XUAT')).length + ' gian hàng · ' + dc;
});

test('DG-02', 'Cấu hình trong gói phải ĐẦY ĐỦ: web_app_url, chuoi_bi_mat, link_thang có tháng chạy (D-44)', () => {
  // ĐẢO CHIỀU ngày 13/9. Luật cũ ép rỗng hai dòng rồi bắt từng máy điền tay — có máy điền sai, có máy
  // điền nhầm dòng, và không ai kiểm được. Nay gói mang sẵn, và phép kiểm khó qua HƠN chứ không dễ hơn:
  // gói thiếu một giá trị là gói câm, user bấm nút 4 chỉ nhận được câu "thiếu web_app_url".
  const cfgTep = path.join(GOI, CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  const c = JSON.parse(doc(cfgTep));
  dung(String(c.google_sheet.web_app_url || '').trim().length > 0, 'gói phải có sẵn web_app_url');
  dung(String(c.google_sheet.chuoi_bi_mat || '').trim().length > 0, 'gói phải có sẵn chuoi_bi_mat');
  bang(c.google_sheet.bat, true, 'google_sheet.bat');
  const nay = new Date();
  const kyNay = nay.getFullYear() + '-' + ('0' + (nay.getMonth() + 1)).slice(-2);
  dung(String((c.link_thang || {})[kyNay] || '').trim().length > 0,
    'link_thang phải có khóa của tháng hiện tại (' + kyNay + ') — thiếu là user bấm nút 4 tắc ngay');

  // Ba đối chứng âm, mỗi cái dựng lại đúng một cách gói có thể câm.
  const ds = [];
  for (const [nhan, hong] of [
    ['gói ép rỗng web_app_url như luật cũ', (x) => { x.google_sheet.web_app_url = ''; }],
    ['gói ép rỗng chuoi_bi_mat như luật cũ', (x) => { x.google_sheet.chuoi_bi_mat = ''; }],
    ['gói mất hẳn bảng link_thang', (x) => { x.link_thang = {}; }],
    ['link_thang thiếu đúng tháng đang chạy', (x) => { delete x.link_thang[kyNay]; }]
  ]) {
    ds.push(doiChungAm(nhan, () => {
      const luu = fs.readFileSync(cfgTep);
      const xau = JSON.parse(doc(cfgTep));
      hong(xau);
      fs.writeFileSync(cfgTep, JSON.stringify(xau, null, 2));
      try {
        const p = DG.kiemGoi(GOI);
        if (p.length) throw new Error(p[0]);
      } finally { fs.writeFileSync(cfgTep, luu); }
    }));
  }
  return Object.keys(c.link_thang).length + ' kỳ link_thang · ' + ds.length + ' đối chứng âm đều LỆCH đúng như phải';
});

test('DG-03', 'Bỏ hết khóa chỉ dùng ở chế độ Excel', () => {
  const c = JSON.parse(doc(path.join(GOI, CAU_HINH, 'CAU_HINH_VAN_HANH.json')));
  const con = DG.KHOA_CHI_CHO_EXCEL.filter((k) => Object.prototype.hasOwnProperty.call(c, k));
  bang(con.join(','), '', 'khóa Excel còn sót');

  const dc = doiChungAm('gói còn khóa file_tracking của chế độ Excel', () => {
    const cfgTep = path.join(GOI, CAU_HINH, 'CAU_HINH_VAN_HANH.json');
    const luu = fs.readFileSync(cfgTep);
    const xau = JSON.parse(doc(cfgTep));
    xau.file_tracking = 'THANG-9.xlsx';
    fs.writeFileSync(cfgTep, JSON.stringify(xau, null, 2));
    try {
      const p = DG.kiemGoi(GOI);
      if (p.length) throw new Error(p[0]);
    } finally { fs.writeFileSync(cfgTep, luu); }
  });
  return '0/' + DG.KHOA_CHI_CHO_EXCEL.length + ' khóa Excel còn lại · ' + dc;
});

test('DG-04', 'Thư mục nhật ký phải RỖNG — nhật ký cũ mang mã đơn thật', () => {
  const nk = path.join(GOI, CAU_HINH, NHAT_KY);
  dung(fs.existsSync(nk), 'gói phải có sẵn thư mục nhật ký');
  bang(fs.readdirSync(nk).length, 0, 'số file trong nhật ký');

  const dc = doiChungAm('gói mang theo nhật ký cũ của máy chủ dự án', () => {
    const t = path.join(nk, 'LOG_20260908.txt');
    fs.writeFileSync(t, 'BB123456789 da ghi');
    try {
      const p = DG.kiemGoi(GOI);
      if (p.length) throw new Error(p[0]);
    } finally { fs.unlinkSync(t); }
  });
  return 'rỗng · ' + dc;
});

test('DG-05', 'Không mã nguồn, không tài liệu .md lọt vào gói', () => {
  // Quét theo ĐƯỜNG DẪN TƯƠNG ĐỐI, không theo tên trần: cây `Cấu hình/node-portable` được miễn trừ đúng
  // hai luật `.md` và `node_modules` (xem chú thích CAY_NODE_PORTABLE trong dong-goi.js) — bản Node.js
  // chính thức có 198 file .md của npm và bắt buộc có node_modules, không cách nào tránh.
  const moi = [];
  (function di(d) {
    for (const t of fs.readdirSync(d)) {
      const x = path.join(d, t);
      const tuongDoi = path.relative(GOI, x).normalize('NFC');
      if (DG.trongCayNodePortable(tuongDoi)) continue;        // miễn trừ, đã có DG-07/DG-08 canh riêng
      if (fs.statSync(x).isDirectory()) { moi.push(tuongDoi); di(x); } else moi.push(tuongDoi);
    }
  })(GOI);
  // C-3: đúng MỘT file .md được phép ngoài cây miễn trừ, kê đích danh — không nới luật theo đuôi.
  const md = moi.filter((t) => t.toLowerCase().endsWith('.md'));
  bang(md.sort().join(','), path.join(CAU_HINH, 'HUONG_DAN_1_TRANG.md'),
    'chỉ file hướng dẫn 1 trang được phép là .md');
  bang(moi.filter((t) => ['src', 'node', 'node_modules'].indexOf(path.basename(t)) >= 0).length, 0,
    'thư mục mã nguồn');

  const dc = doiChungAm('gói kèm thư mục src như bản đóng gói cũ', () => {
    const s = path.join(GOI, CAU_HINH, 'src');
    fs.mkdirSync(s, { recursive: true });
    fs.writeFileSync(path.join(s, 'Main.gs'), '// ma nguon');
    try {
      const p = DG.kiemGoi(GOI);
      if (p.length) throw new Error(p[0]);
    } finally { fs.rmSync(s, { recursive: true, force: true }); }
  });
  return moi.length + ' mục, 1 .md (hướng dẫn, danh sách trắng C-3), 0 thư mục mã nguồn · ' + dc;
});

DS_CHO.push(() => testCho('DG-09', 'File .zip giao đi: ĐÚNG MỘT thư mục gốc không dấu, giải nén ra vẫn qua kiemGoi', async () => {
  // Vì sao phải có đúng một thư mục gốc: user hay bấm "Extract Here" ngay trên Desktop. Zip không có thư
  // mục gốc thì bốn nút và hai thư mục đổ thẳng ra Desktop lẫn với mọi thứ khác, không cách nào gỡ lại.
  //
  // Vì sao tên gốc KHÔNG DẤU: thư mục có dấu đi qua trình giải nén lạ, qua OneDrive hay qua email hay bị
  // vỡ mã ký tự rồi hỏng cả đường dẫn. Bên trong vẫn giữ tên có dấu vì đó là thứ user đọc hằng ngày.
  const tam = tamMoi('zip'); RAC.push(tam);
  const tepZip = path.join(tam, 'Tool_nhap_lieu.zip');
  const kq = await DG.dongGoiZip({ zip: tepZip, nodePortable: false, mucNen: 1 });
  bang(kq.pham.length, 0, 'gói bẩn thì KHÔNG được nén ra file: ' + kq.pham.join(' | '));
  dung(fs.existsSync(tepZip), 'phải sinh ra file zip');

  const zip = await JSZip.loadAsync(fs.readFileSync(tepZip));
  const goc = new Set(Object.keys(zip.files).map((k) => k.split('/')[0]));
  bang([...goc].join(','), DG.TEN_GOI, 'đúng một thư mục gốc trong zip');
  dung(!/[^\x20-\x7E]/.test(DG.TEN_GOI), 'tên thư mục gốc phải là ASCII thuần: ' + DG.TEN_GOI);

  // Giải nén thật rồi chấm lại bằng chính kiemGoi — cái user nhận là cái này, không phải thư mục nguồn.
  const ra = path.join(tam, 'giai_nen');
  for (const [ten, f] of Object.entries(zip.files)) {
    const dich = path.join(ra, ten);
    if (f.dir) { fs.mkdirSync(dich, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(dich), { recursive: true });
    fs.writeFileSync(dich, await f.async('nodebuffer'));
  }
  const pham = DG.kiemGoi(path.join(ra, DG.TEN_GOI));
  bang(pham.length, 0, 'gói sau khi giải nén phải sạch: ' + pham.join(' | '));
  return (kq.cỡ / 1024 / 1024).toFixed(1) + ' MB · 1 thư mục gốc "' + DG.TEN_GOI + '" · giải nén ra 0 vi phạm';
}));

DS_CHO.push(() => testCho('DG-10', 'C-5: NĂM thư mục gian hàng (4 Shopee + TikTok Shop) SỐNG SÓT qua vòng nén–giải nén nhờ file .keep', async () => {
  // Thư mục RỖNG không tồn tại trong file .zip — đây là chỗ bản trước mất. User giải nén xong thấy
  // 1_THA_FILE_XUAT trống trơn, không biết thả file vào đâu, và nút 4 báo "thiếu thư mục gian hàng".
  const tam = tamMoi('keep'); RAC.push(tam);
  const tepZip = path.join(tam, 'Tool_nhap_lieu.zip');
  await DG.dongGoiZip({ zip: tepZip, nodePortable: false, mucNen: 1 });
  const zip = await JSZip.loadAsync(fs.readFileSync(tepZip));
  const keep = Object.keys(zip.files).filter((k) => k.endsWith('/' + DG.TEN_GIU_CHO));
  bang(keep.length, 5, 'phải có đúng 5 file giữ chỗ trong zip (4 gian Shopee + TikTok Shop): ' + keep.join(', '));
  dung(keep.some((k) => k.indexOf('/' + DG.TEN_THU_MUC_TIKTOK + '/') > 0), 'thiếu thư mục thả TikTok Shop trong zip — user không có chỗ thả báo cáo TikTok: ' + keep.join(', '));
  for (const k of keep) {
    dung(k.indexOf('/1_THA_FILE_XUAT/') > 0, 'file giữ chỗ phải nằm trong thư mục thả: ' + k);
  }

  // ĐỐI CHỨNG ÂM: bỏ .keep đi thì thư mục gian hàng biến mất khỏi zip — chứng minh phép chấm có mắt và
  // chứng minh luôn vì sao phải có .keep.
  const tam2 = tamMoi('keep-am'); RAC.push(tam2);
  const goiTran = path.join(tam2, DG.TEN_GOI);
  DG.dungGoi(goiTran, false);
  const thaGoc = path.join(goiTran, '1_THA_FILE_XUAT');
  for (const g of fs.readdirSync(thaGoc)) {
    const k = path.join(thaGoc, g, DG.TEN_GIU_CHO);
    if (fs.existsSync(k)) fs.unlinkSync(k);
    const dx = path.join(thaGoc, g, 'đã xử lý'.normalize('NFC'));
    if (fs.existsSync(dx)) fs.rmSync(dx, { recursive: true, force: true });
  }
  const zip2Tep = path.join(tam2, 'tran.zip');
  await DG.nenZip(goiTran, zip2Tep, 1);
  const zip2 = await JSZip.loadAsync(fs.readFileSync(zip2Tep));
  const conGian = Object.keys(zip2.files)
    .filter((k) => k.indexOf('/1_THA_FILE_XUAT/') > 0 && !k.endsWith('/1_THA_FILE_XUAT/'));
  // JSZip có ghi mục thư mục rỗng, nhưng nhiều trình giải nén Windows bỏ qua chúng — nên thứ thật sự
  // bảo đảm thư mục còn sống là FILE nằm trong đó, không phải mục thư mục.
  const coFile = conGian.filter((k) => !zip2.files[k].dir);
  bang(coFile.length, 0, 'bỏ .keep rồi thì không còn FILE nào giữ bốn thư mục gian hàng — đúng như phải');
  return '4 file .keep trong zip · đối chứng âm: bỏ .keep → 0 file giữ chỗ, thư mục chỉ còn là mục rỗng';
}));

test('DG-11', 'Bản .txt của hướng dẫn SINH RA từ bản .md — không có chuyện hai bản lệch nhau', () => {
  // YC-40.3: trước đây `.txt` do người chuyển tay. Bản `.md` đã sửa mà `.txt` vẫn giữ câu cũ thì user mở
  // Notepad sẽ đọc đúng câu đã bị bỏ. Nay `.txt` phải bằng từng byte `mdSangTxt(.md)`.
  const BAT = path.join(__dirname, '..', 'bat');
  const md = fs.readFileSync(path.join(BAT, 'HUONG_DAN_1_TRANG.md'), 'utf8');
  const txt = fs.readFileSync(path.join(BAT, 'HUONG_DAN_1_TRANG.txt'), 'utf8');
  bang(txt === DG.mdSangTxt(md), true, 'HUONG_DAN_1_TRANG.txt khác bản sinh từ .md — chạy lại bước sinh .txt');
  dung(txt.charCodeAt(0) === 0xFEFF, '.txt phải có BOM để Notepad đọc đúng tiếng Việt');
  dung(txt.indexOf('\r\n') > 0 && txt.replace(/\r\n/g, '').indexOf('\n') < 0, '.txt phải xuống dòng CRLF thuần');
  dung(txt.indexOf('**') < 0 && txt.indexOf('`') < 0, '.txt còn ký hiệu markdown');

  const dc = doiChungAm('sửa .md mà quên sinh lại .txt', () => {
    const md2 = md.replace('Bấm đúp', 'Nhấn đúp');
    bang(txt === DG.mdSangTxt(md2), true, '.txt cũ so với .md mới');
  });
  return txt.length + ' ký tự, BOM + CRLF, khớp bản sinh từ .md · ' + dc;
});

test('DG-12', 'kiemGoi soát NỘI DUNG hướng dẫn: có câu "gói chứa khóa", không bảo user điền tay, không trỏ file vắng mặt', () => {
  const tep = path.join(GOI, CAU_HINH, 'HUONG_DAN_1_TRANG.md');
  const tepTxt = path.join(GOI, CAU_HINH, 'HUONG_DAN_1_TRANG.txt');
  bang(DG.kiemGoi(GOI).length, 0, 'gói vừa dựng phải sạch');
  const goc = fs.readFileSync(tep, 'utf8');
  const gocTxt = fs.readFileSync(tepTxt, 'utf8');
  const dat = (md) => { fs.writeFileSync(tep, md, 'utf8'); fs.writeFileSync(tepTxt, DG.mdSangTxt(md), 'utf8'); };

  // Ba đối chứng âm — đúng ba khuyết tật BA tìm thấy trong bản hướng dẫn 2.5.0.
  const ds = [];
  for (const [nhan, hong] of [
    ['bỏ câu cảnh báo "gói chứa khóa"', (m) => m.replace(/> \*\*GÓI NÀY CHỨA KHÓA[^\n]*\n/, '')],
    ['còn câu "dừng ở bước 6 và bảo bạn điền hai dòng"', (m) => m + '\nGần như chắc chắn nó sẽ dừng ở bước 6 và bảo bạn điền hai dòng.\n'],
    ['trỏ tới BAT_GOOGLE_SHEET.md không có trong gói', (m) => m + '\nCách lấy: xem BAT_GOOGLE_SHEET.md.\n']
  ]) {
    // Dựng bản lỗi NGOÀI doiChungAm: ném lỗi bên trong nó sẽ bị tính là "LỆCH" và bài xanh giả.
    const xau = hong(goc);
    if (xau === goc) throw new Error('KHÔNG dựng được bản lỗi "' + nhan + '" — mẫu đã đổi, sửa đối chứng âm');
    ds.push(doiChungAm(nhan, () => {
      dat(xau);
      try {
        const p = DG.kiemGoi(GOI);
        if (p.length) throw new Error(p[0]);
      } finally { fs.writeFileSync(tep, goc, 'utf8'); fs.writeFileSync(tepTxt, gocTxt, 'utf8'); }
    }));
  }
  return 'hướng dẫn trong gói sạch · ' + ds.length + ' đối chứng âm đều LỆCH đúng như phải';
});

test('DG-13', 'kiemGoi nhận link tháng dạng /spreadsheets/u/<số>/d/<ID> (YC-41 việc 1) — cùng luật RE_LINK_SHEET với nút 4, dạng giả vẫn chặn', () => {
  const cfgTep = path.join(GOI, CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  const luu = fs.readFileSync(cfgTep);
  const nay = new Date();
  const kyNay = nay.getFullYear() + '-' + ('0' + (nay.getMonth() + 1)).slice(-2);
  const gw = require('./gsheet-web-app');
  const goc = JSON.parse(doc(cfgTep));
  const id = gw.idTuLinkHoacId(goc.link_thang[kyNay]);
  dung(id.length >= 20, 'link tháng hiện tại trong gói phải rút được mã file');
  // Link dựng lại dạng u/<số> từ CHÍNH mã file của gói. Không in link hay mã ra đâu cả (INV-7) — chỉ in câu của kiemGoi.
  const thu = (link) => {
    const x = JSON.parse(doc(cfgTep));
    x.link_thang[kyNay] = link;
    fs.writeFileSync(cfgTep, JSON.stringify(x, null, 2));
    try { return DG.kiemGoi(GOI); } finally { fs.writeFileSync(cfgTep, luu); }
  };
  const TIEN = 'https://docs.google.com/spreadsheets/';
  for (const so of ['0', '1', '12']) bang(thu(TIEN + 'u/' + so + '/d/' + id + '/edit#gid=0'), [], 'gói có link u/' + so);
  const dc1 = doiChungAm('link gia u/chu/d/', () => {
    const p = thu(TIEN + 'u/abc/d/' + id + '/edit');
    if (p.length) throw new Error(p[0]);
  });
  // Đối chứng âm: luật 2.6.1 (không nhánh u/<số>) — kiemGoi đọc RE_LINK_SHEET lúc chạy, nên thay tạm đúng hằng đó.
  const NHANH = '(?:u\\/\\d+\\/)?';
  const reGoc = gw.RE_LINK_SHEET;
  const dc2 = doiChungAm('luat cu khong nhanh u/<so>', () => {
    gw.RE_LINK_SHEET = new RegExp(reGoc.source.split(NHANH).join(''));
    try {
      const p = thu(TIEN + 'u/0/d/' + id + '/edit#gid=0');
      if (p.length) throw new Error(p[0]);
    } finally { gw.RE_LINK_SHEET = reGoc; }
  });
  dung(gw.RE_LINK_SHEET === reGoc && fs.readFileSync(cfgTep).equals(luu), 'phải trả lại hằng và file cấu hình như cũ');
  return 'u/0 · u/1 · u/12 qua kiemGoi · ' + dc1 + ' · ' + dc2;
});

test('DG-06', 'bat/ của kho GitHub khớp TỪNG BYTE với 03_VAN_HANH — không được có hai bản lệch nhau', () => {
  const lech = DG.kiemDongBoBat();
  bang(lech.join(' | '), '', 'chỗ lệch');

  const dc = doiChungAm('ai đó sửa tay một nút trong bat/ mà quên sửa bản đang dùng', () => {
    const t = path.join(DG.THU_MUC_BAT_KHO, '4_CHAY_TOOL.bat');
    const luu = fs.readFileSync(t);
    fs.writeFileSync(t, Buffer.concat([luu, Buffer.from('\r\nrem sua tay\r\n', 'ascii')]));
    try {
      const l = DG.kiemDongBoBat();
      if (l.length) throw new Error(l[0]);
    } finally { fs.writeFileSync(t, luu); }
  });
  return DG.dsFileBat().length + ' file khớp từng byte · ' + dc;
});

/**
 * Dựng một cây `node-portable` GIẢ, đúng bảy thứ ở lớp ngoài như bản chính thức, kèm một file
 * `.md` và một `node_modules` — đúng hai thứ mà bản Node thật bắt buộc phải có và `kiemGoi()`
 * vốn cấm. Dùng cây giả thay vì chép 102 MB thật: phép kiểm chỉ nhìn tên và bố cục, không nhìn
 * nội dung, nên cây giả chứng minh được đúng thứ cần chứng minh mà chạy trong tích tắc.
 */
DS_CHO.push(() => testCho('DG-14', 'GÓI macOS: đúng hình dạng riêng (4 nút .command + keodon-mac.sh + cai-dat-mac.js), KHÔNG kèm node-portable, hướng dẫn .txt là UTF-8 không BOM + LF', async () => {
  // Bản Windows và bản Mac là hai gói khác nhau ở lớp vỏ, chung y hệt phần cấu hình và thư mục thả.
  // Bài này canh phần KHÁC — nhầm một thứ là user Mac bấm đúp không ra gì.
  const tam = tamMoi('mac'); RAC.push(tam);
  const goi = path.join(tam, DG.TEN_GOI_MAC);
  const kq = DG.dungGoi(goi, false, 'mac');
  const pham = DG.kiemGoi(goi);
  bang(pham.length, 0, 'gói Mac phải qua tự kiểm: ' + pham.join(' | '));

  const ngoai = fs.readdirSync(goi).sort();
  bang(ngoai.join(','), DG.BON_NUT_MAC.concat(['1_THA_FILE_XUAT', 'Cấu hình']).sort().join(','), 'lớp ngoài cùng gói Mac: đúng 4 nút + 2 thư mục, y như bản Windows');
  for (const t of DG.KEM_MAC) {
    dung(fs.existsSync(path.join(goi, 'Cấu hình', t)), 'file kỹ thuật ' + t + ' phải nằm trong thư mục Cấu hình, không bày ra lớp ngoài');
  }
  dung(!fs.existsSync(path.join(goi, 'Cấu hình', 'node-portable')), 'gói Mac KHÔNG được kèm node-portable (bản .exe của Windows)');
  // Node xách tay cho Mac: có bản nào trên máy dựng thì gói phải mang bản đó, và binary phải chạy được (bit x).
  for (const kt of DG.KIEN_TRUC_MAC) {
    const co = fs.existsSync(path.join('E:/CODE/BAN HANG/03_VAN_HANH/Cấu hình', 'node-portable-mac-' + kt, 'bin', 'node'));
    const trongGoi = path.join(goi, 'Cấu hình', 'node-portable-mac-' + kt, 'bin', 'node');
    if (co) {
      dung(fs.existsSync(trongGoi), 'máy dựng có node-portable-mac-' + kt + ' mà gói không mang theo → user Mac phải tự cài Node');
      dung(fs.existsSync(path.join(goi, 'Cấu hình', 'node-portable-mac-' + kt, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')), 'thiếu npm trong bản Node xách tay ' + kt + ' → nút 1 không cài được thư viện');
    } else {
      dung(!fs.existsSync(trongGoi), 'gói có node-portable-mac-' + kt + ' mà máy dựng không có — lấy ở đâu ra?');
    }
  }
  dung(!ngoai.some((t) => /\.bat$/i.test(t)), 'gói Mac còn sót nút .bat của Windows');

  const txt = fs.readFileSync(path.join(goi, 'Cấu hình', 'HUONG_DAN_1_TRANG.txt'), 'utf8');
  dung(!/^\uFEFF/.test(txt), 'hướng dẫn bản Mac không được có BOM (TextEdit hiện ra ký tự rác)');
  dung(!/\r/.test(txt), 'hướng dẫn bản Mac phải xuống dòng LF, không CRLF');
  dung(/TikTok Shop/.test(txt) && txt.length > 5000, 'hướng dẫn bản Mac thiếu nội dung: ' + txt.length + ' ký tự');
  // Chữ phải là chữ của bản Mac: không bảo người dùng bấm file .bat mà thư mục của họ không có.
  for (const nut of ['4_CHAY_TOOL', '1_CAI_DAT_LAN_DAU', '3_TAO_FILE_THANG_MOI']) {
    const conBat = txt.split('\n').filter((d) => d.indexOf(nut + '.bat') >= 0 && !/gói Windows/.test(d));
    bang(conBat.length, 0, 'hướng dẫn bản Mac còn bảo bấm ' + nut + '.bat: ' + conBat.slice(0, 1).join(' | ').slice(0, 120));
  }

  const am = [];
  // ĐỐI CHỨNG ÂM: dựng gói Mac bằng đúng đường của bản Windows → phải bị tự kiểm bắt.
  const goi2 = path.join(tam, 'ban-win-nham');
  DG.dungGoi(goi2, false);
  const pham2 = DG.kiemGoi(goi2);
  const ngoai2 = fs.readdirSync(goi2).sort();
  if (ngoai2.join(',') === ngoai.join(',')) am.push('hai gói y hệt nhau — phép chấm không phân biệt được nền');
  if (pham2.length) am.push('gói Windows lại bị chấm bẩn: ' + pham2.join(' | '));
  bang(am, [], 'đối chứng âm');
  return ngoai.length + ' thứ ở lớp ngoài, 0 node-portable, .txt UTF-8/LF · đối chứng âm: gói Windows có hình dạng khác hẳn ← đúng như phải thế';
}));

DS_CHO.push(() => testCho('DG-15', 'GÓI macOS: file .zip GIỮ BIT THỰC THI 0755 cho .command/.sh (JSZip mặc định không ghi quyền → bấm đúp trong Finder không chạy)', async () => {
  const tam = tamMoi('mac-zip'); RAC.push(tam);
  const tepZip = path.join(tam, DG.TEN_GOI_MAC + '.zip');
  const kq = await DG.dongGoiZip({ zip: tepZip, nodePortable: false, mucNen: 1, nen: 'mac' });
  bang(kq.pham.length, 0, 'gói Mac bẩn thì không được nén: ' + kq.pham.join(' | '));
  const zip = await JSZip.loadAsync(fs.readFileSync(tepZip));

  const quyenCua = (ten) => {
    const f = zip.files[ten];
    if (!f) return null;
    // JSZip để quyền Unix ở 16 bit cao của externalFileAttributes.
    const attr = (f.unixPermissions != null) ? f.unixPermissions : ((f.externalFileAttributes || 0) >>> 16) & 0o7777;
    return typeof attr === 'number' ? attr & 0o777 : attr;
  };
  const loi = [];
  // Bốn nút ở lớp ngoài cùng; ruột `keodon-mac.sh` nằm trong thư mục cấu hình (giữ lớp ngoài giống bản Windows).
  for (const n of DG.BON_NUT_MAC.concat(['Cấu hình/keodon-mac.sh'])) {
    const ten = DG.TEN_GOI_MAC + '/' + n;
    const q = quyenCua(ten);
    if (q !== 0o755) loi.push(n + ': quyền ' + (q == null ? 'không thấy file' : '0' + q.toString(8)) + ', cần 0755');
  }
  const qJson = quyenCua(DG.TEN_GOI_MAC + '/Cấu hình/CAU_HINH_VAN_HANH.json');
  if (qJson !== 0o644) loi.push('cấu hình: quyền 0' + String(qJson == null ? '?' : qJson.toString(8)) + ', cần 0644 (không cần chạy)');
  bang(loi, [], 'quyền trong zip');

  // ĐỐI CHỨNG ÂM: nén đúng cách của bản Windows (không đặt quyền) → nút mất bit x.
  const tepZip2 = path.join(tam, 'khong-quyen.zip');
  await DG.nenZip(path.join(tam, '..', 'x-khong-ton-tai') === '' ? '' : (function () {
    const goi = path.join(tam, 'goi-mac-2');
    DG.dungGoi(goi, false, 'mac');
    return goi;
  })(), tepZip2, 1);                                   // KHÔNG truyền nền → nhánh Windows
  const zip2 = await JSZip.loadAsync(fs.readFileSync(tepZip2));
  const f2 = zip2.files[DG.TEN_GOI + '/4_CHAY_TOOL.command'];
  const q2 = f2 ? (((f2.externalFileAttributes || 0) >>> 16) & 0o777) : null;
  dung(q2 !== 0o755, 'đối chứng âm không báo lệch: nén kiểu Windows mà vẫn có bit thực thi');
  return '5 file .command/.sh giữ 0755, cấu hình 0644 · đối chứng âm: nén kiểu Windows → quyền 0' + String((q2 || 0).toString(8)) + ' ← đúng như phải thế';
}));

function dungNodePortableGia(goi) {
  const np = path.join(goi, CAU_HINH, 'node-portable');
  fs.mkdirSync(path.join(np, 'node_modules', 'npm', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(np, 'node.exe'), 'khong phai node that');
  for (const t of ['npm', 'npm.cmd', 'npx', 'npx.cmd']) fs.writeFileSync(path.join(np, t), '@echo off');
  fs.writeFileSync(path.join(np, 'PHIEN_BAN.txt'), 'Node.js v24.9.0 (gia lap)');
  fs.writeFileSync(path.join(np, 'node_modules', 'npm', 'docs', 'README.md'), '# tai lieu npm');
  return np;
}

test('DG-07', 'Miễn trừ node-portable ĐÚNG hai luật .md và node_modules, không hơn', () => {
  const np = dungNodePortableGia(GOI);
  try {
    bang(DG.kiemGoi(GOI).length, 0, 'bản Node hợp lệ phải qua được (có .md và node_modules là bình thường)');

    // Đối chứng âm 1 của BA: file .xlsx thật nhét vào node-portable → danh sách trắng phải bắt.
    const dc1 = doiChungAm('lén nhét .xlsx số liệu thật vào chính cây node-portable', () => {
      const x = path.join(np, 'THANG-8-KINH-DOANH.xlsx');
      fs.writeFileSync(x, 'so lieu that');
      try {
        const p = DG.kiemGoi(GOI);
        if (p.length) throw new Error(p[0]);
      } finally { fs.unlinkSync(x); }
    });

    // Miễn trừ KHÔNG được rò ra ngoài cây: TEN_CAM vẫn áp đủ ngay trong node-portable.
    const dc2 = doiChungAm('file trong TEN_CAM nằm sâu trong node-portable — miễn trừ không được che', () => {
      const x = path.join(np, 'node_modules', 'moc-nghiem-thu.json');
      fs.writeFileSync(x, '{}');
      try {
        const p = DG.kiemGoi(GOI);
        if (p.length) throw new Error(p[0]);
      } finally { fs.unlinkSync(x); }
    });

    return '.md + node_modules trong cây → sạch · ' + dc1 + ' · ' + dc2;
  } finally { fs.rmSync(np, { recursive: true, force: true }); }
});

test('DG-08', 'Miễn trừ KHÔNG rò ra ngoài cây node-portable', () => {
  const np = dungNodePortableGia(GOI);
  try {
    // Đối chứng âm 2 của BA: .md đặt trong Cấu hình\ nhưng NGOÀI node-portable → vẫn phải phạm.
    const dc = doiChungAm('.md đặt trong Cấu hình\\ nhưng ngoài cây node-portable', () => {
      const x = path.join(GOI, CAU_HINH, 'GHI_CHU_NOI_BO.md');
      fs.writeFileSync(x, '# doanh thu thang 8');
      try {
        const p = DG.kiemGoi(GOI);
        if (p.length) throw new Error(p[0]);
      } finally { fs.unlinkSync(x); }
    });
    const dcTM = doiChungAm('thư mục node_modules đặt ở gốc gói, ngoài cây node-portable', () => {
      const d = path.join(GOI, 'node_modules');
      fs.mkdirSync(d, { recursive: true });
      try {
        const p = DG.kiemGoi(GOI);
        if (p.length) throw new Error(p[0]);
      } finally { fs.rmSync(d, { recursive: true, force: true }); }
    });
    bang(DG.trongCayNodePortable(path.join(CAU_HINH, 'x.md')), 'false', 'ngay trong Cấu hình\\ thì chưa phải trong cây');
    bang(DG.trongCayNodePortable(path.join(CAU_HINH, 'node-portable', 'x.md')), 'true', 'trong cây');
    return dc + ' · ' + dcTM;
  } finally { fs.rmSync(np, { recursive: true, force: true }); }
});

// ================================================ NHÓM CN — chạy thật nút cập nhật

/** Dựng một "máy user" giả: bốn nút + Cấu hình có bí mật mồi, CHƯA có mã nào. */
function dungMayGia(nut2) {
  const may = tamMoi('may');
  RAC.push(may);
  for (const t of DG.BON_NUT) {
    const tu = (t === '2_CAP_NHAT.bat' && nut2) ? nut2 : path.join(VAN_HANH, t);
    fs.copyFileSync(tu, path.join(may, t));
  }
  const ch = path.join(may, CAU_HINH);
  fs.mkdirSync(path.join(ch, NHAT_KY), { recursive: true });
  fs.writeFileSync(path.join(ch, 'CAU_HINH_VAN_HANH.json'), JSON.stringify({
    // Khóa chú thích của bản CŨ trên máy user — YC-40.1: nút 2 phải THAY bằng câu của bản mẫu.
    _thu_muc_tha_file: 'CAU CHU THICH CU CUA MAY',
    thu_muc_tha_file: '1_THA_FILE_XUAT',
    thu_muc_gian_hang: { SP_MALL: 'Shopee mall' },
    ten_thu_muc_da_xu_ly: 'đã xử lý',
    google_sheet: { bat: true, web_app_url: LINK_MOI, chuoi_bi_mat: BI_MAT_MOI },
    cap_nhat: { chu_tai_khoan: 'ai-do', ten_repo: 'kho-nao-do', nhanh: 'main' }
  }, null, 2), 'utf8');
  // npm giả: để bước cài thư viện không cần mạng và không cần npm thật.
  const np = path.join(ch, 'node-portable');
  fs.mkdirSync(np, { recursive: true });
  fs.writeFileSync(path.join(np, 'npm.cmd'), '@echo off\r\necho (npm gia) bo qua\r\nexit /b 0\r\n', 'ascii');
  fs.mkdirSync(path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', 'đã xử lý'.normalize('NFC')), { recursive: true });
  fs.writeFileSync(path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', 'don-cho-xu-ly.txt'), 'file cua user');
  return may;
}

/** Dựng .zip giống hệt bản GitHub tải về: có src/, node/, package.json, bat/. */
async function dungZip(phienBan, nut2KhacBanDangChay) {
  const z = new JSZip();
  const g = z.folder('kho-nao-do-main');
  g.file('package.json', JSON.stringify({ name: 'keodon', version: phienBan, dependencies: { exceljs: '4.4.0' } }, null, 2));
  g.folder('src').file('Main.gs', '// ban ' + phienBan);
  g.folder('node').file('chay-thu.js', '// ban ' + phienBan);
  const b = g.folder('bat');
  for (const t of ['1_CAI_DAT_LAN_DAU.bat', '3_TAO_FILE_THANG_MOI.bat', '4_CHAY_TOOL.bat']) {
    b.file(t, '@echo off\r\nrem BAN TREN KHO ' + phienBan + '\r\n');
  }
  b.file('2_CAP_NHAT.bat', nut2KhacBanDangChay
    ? '@echo off\r\nrem BAN NUT CAP NHAT MOI HON\r\n'
    : fs.readFileSync(path.join(VAN_HANH, '2_CAP_NHAT.bat'), 'latin1'));
  b.file('CAU_HINH_VAN_HANH.mau.json', JSON.stringify({
    _thu_muc_tha_file: 'CAU CHU THICH MOI CUA BAN MAU',
    thu_muc_tha_file: 'THU_MUC_KHAC_CUA_BAN_MAU',
    thu_muc_gian_hang: { SP_MALL: 'Shopee mall' },
    ten_thu_muc_da_xu_ly: 'đã xử lý',
    google_sheet: { bat: true, web_app_url: '', chuoi_bi_mat: '' },
    cap_nhat: { chu_tai_khoan: '', ten_repo: '', nhanh: 'main' },
    khoa_hoan_toan_moi: 'gia tri mac dinh'
  }, null, 2));
  const tam = tamMoi('zip'); RAC.push(tam);
  const p = path.join(tam, 'ban-moi.zip');
  fs.writeFileSync(p, await z.generateAsync({ type: 'nodebuffer' }));
  return p;
}

function chayNut(may, ten, themTv) {
  const r = spawnSync('cmd.exe', ['/c', path.join(may, ten), '/tu-dong'].concat(themTv || []),
    { cwd: may, encoding: 'latin1', timeout: 180000 });
  return { ma: r.status, ra: String(r.stdout || '') + String(r.stderr || '') };
}

(async () => {
  const zip = await dungZip('9.9.0', true);

  // --- CN-01..05: cài lần đầu trên máy chưa có mã ---
  const may = dungMayGia(null);
  const nut2Truoc = fs.readFileSync(path.join(may, '2_CAP_NHAT.bat'));
  const cfgTruoc = doc(path.join(may, CAU_HINH, 'CAU_HINH_VAN_HANH.json'));
  const kq = chayNut(may, '2_CAP_NHAT.bat', ['/nguon', zip]);
  const tool = path.join(may, CAU_HINH, 'keodon-apps-script');

  test('CN-01', 'Máy CHƯA CÓ MÃ: nút cập nhật tự hiểu là lần cài đầu, kéo mã về, thoát mã 0', () => {
    bang(kq.ma, 0, 'mã thoát (' + kq.ra.split('\n').filter((l) => /LOI|CHU Y/.test(l)).join(' / ') + ')');
    dung(/lan cai dau/i.test(kq.ra), 'phải nói rõ đây là lần cài đầu');
    dung(fs.existsSync(path.join(tool, 'package.json')), 'chưa thấy package.json trong ' + tool);
    dung(fs.existsSync(path.join(tool, 'src', 'Main.gs')), 'chưa thấy src/');
    dung(fs.existsSync(path.join(tool, 'node', 'chay-thu.js')), 'chưa thấy node/');

    const dc = doiChungAm('bản nút cập nhật CŨ (bắt buộc phải có mã cũ để so phiên bản)', () => {
      const cu = path.join(GOC_DU_AN, '02_CODE', 'keodon-apps-script', 'node', '__ban_cu_cap_nhat.bat');
      // Dựng lại đúng tật cũ: bỏ nhánh $lanDau đi thì bước 2 ném lỗi "khong tim thay bo ma".
      const s = fs.readFileSync(path.join(VAN_HANH, '2_CAP_NHAT.bat'), 'latin1')
        .replace('$lanDau   = -not (Test-Path -LiteralPath $pkgCuTep)', '$lanDau   = $false');
      fs.writeFileSync(cu, s, 'latin1');
      const m2 = dungMayGia(cu);
      try {
        const r2 = chayNut(m2, '2_CAP_NHAT.bat', ['/nguon', zip]);
        if (r2.ma !== 0) throw new Error('thoát mã ' + r2.ma + ', không cài được gì');
      } finally { fs.unlinkSync(cu); }
    });
    return 'src + node + package.json đã về ' + path.basename(tool) + ' · ' + dc;
  });

  test('CN-02', 'Chép về BA nút kia từ bat/ của kho', () => {
    for (const t of ['1_CAI_DAT_LAN_DAU.bat', '3_TAO_FILE_THANG_MOI.bat', '4_CHAY_TOOL.bat']) {
      const s = fs.readFileSync(path.join(may, t), 'latin1');
      dung(/BAN TREN KHO 9\.9\.0/.test(s), t + ' chưa được thay bằng bản trên kho');
    }
    return 'cả ba nút đã nhận bản 9.9.0 từ kho';
  });

  test('CN-03', '2_CAP_NHAT.bat KHÔNG tự ghi đè chính nó, chỉ in một dòng nhắc', () => {
    const sau = fs.readFileSync(path.join(may, '2_CAP_NHAT.bat'));
    dung(sau.equals(nut2Truoc), 'nút cập nhật ĐÃ BỊ GHI ĐÈ — Windows khóa file .bat đang chạy, làm thế là hỏng phiên chạy');
    dung(/Nut cap nhat co ban moi/i.test(kq.ra), 'bản trên kho khác bản đang chạy mà không in dòng nhắc nào');
    return sau.length + ' byte, y nguyên · có in dòng nhắc xin bản đóng gói mới';
  });

  test('CN-04', 'KHÔNG BAO GIỜ ghi đè giá trị trong CAU_HINH_VAN_HANH.json: giữ bí mật, THÊM khóa mới, THAY khóa chú thích', () => {
    const s = doc(path.join(may, CAU_HINH, 'CAU_HINH_VAN_HANH.json'));
    const c = JSON.parse(s);
    bang(c.google_sheet.chuoi_bi_mat, BI_MAT_MOI, 'chuỗi bí mật của máy');
    bang(c.google_sheet.web_app_url, LINK_MOI, 'link Web App của máy');
    bang(c.cap_nhat.ten_repo, 'kho-nao-do', 'khai báo kho của máy');
    bang(c.khoa_hoan_toan_moi, 'gia tri mac dinh', 'khóa mới của bản mới phải được THÊM vào');
    dung(s !== cfgTruoc, 'phải có thêm khóa mới, nghĩa là file có đổi');
    // YC-40.1: khóa CHÚ THÍCH được thay bằng câu của bản mẫu…
    bang(c._thu_muc_tha_file, 'CAU CHU THICH MOI CUA BAN MAU', 'khóa chú thích `_…` phải nhận câu của bản mẫu');
    // …còn khóa GIÁ TRỊ cùng tên thì KHÔNG BAO GIỜ bị thay, dù bản mẫu có giá trị khác.
    bang(c.thu_muc_tha_file, '1_THA_FILE_XUAT', 'khóa giá trị KHÔNG được thay theo bản mẫu');
    dung(!fs.existsSync(path.join(may, CAU_HINH, 'CAU_HINH_VAN_HANH.json.__moi')), 'còn sót file tạm .__moi');

    // ĐỐI CHỨNG ÂM: bản nút 2 CŨ (chỉ thêm khóa thiếu) để nguyên câu chú thích cũ — phép chấm trên phải bắt.
    const dc = doiChungAm('bản nút 2 cũ không thay khóa chú thích', () => {
      const cu = path.join(os.tmpdir(), 'keodon-nut2-khong-thay-chu-thich-' + Date.now() + '.bat');
      const s0 = fs.readFileSync(path.join(VAN_HANH, '2_CAP_NHAT.bat'), 'latin1');
      const s1 = s0.replace("} elseif ($k.StartsWith('_') -and ($m.$k -is [string]) -and ($t.$k -ne $m.$k)) {",
        "} elseif ($false) {");
      if (s1 === s0) throw new Error('KHÔNG dựng được bản lỗi: chuỗi mốc đã đổi — sửa đối chứng âm, đừng bỏ qua');
      fs.writeFileSync(cu, s1, 'latin1');
      try {
        const m2 = dungMayGia(cu);
        const r2 = chayNut(m2, '2_CAP_NHAT.bat', ['/nguon', zip]);
        const c2 = JSON.parse(doc(path.join(m2, CAU_HINH, 'CAU_HINH_VAN_HANH.json')));
        if (r2.ma !== 0) throw new Error('bản lỗi thoát mã ' + r2.ma);   // chạy hỏng hẳn cũng là LỆCH
        bang(c2._thu_muc_tha_file, 'CAU CHU THICH MOI CUA BAN MAU', 'bản cũ');
      } finally { fs.unlinkSync(cu); }
    });
    return 'bí mật còn nguyên · khóa mới đã thêm · khóa chú thích đã thay · khóa giá trị giữ nguyên · ' + dc;
  });

  test('CN-05', 'Không đụng thư mục thả file của user', () => {
    const t = path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', 'don-cho-xu-ly.txt');
    dung(fs.existsSync(t), 'file user thả vào đã bị mất');
    bang(fs.readFileSync(t, 'utf8'), 'file cua user', 'nội dung file');
    return 'file người dùng nguyên vẹn';
  });

  // --- CN-06: chạy lần hai, đã là bản mới nhất ---
  test('CN-06', 'Chạy lại lần hai: báo ĐANG LÀ BẢN MỚI NHẤT, không đụng file nào', () => {
    const truoc = fs.readFileSync(path.join(tool, 'package.json'));
    const r = chayNut(may, '2_CAP_NHAT.bat', ['/nguon', zip]);
    bang(r.ma, 3, 'mã thoát cho ca không có gì mới');
    dung(/DANG LA BAN MOI NHAT/.test(r.ra), 'phải báo đang là bản mới nhất');
    dung(fs.readFileSync(path.join(tool, 'package.json')).equals(truoc), 'package.json bị đụng dù không có gì mới');
    const c = JSON.parse(doc(path.join(may, CAU_HINH, 'CAU_HINH_VAN_HANH.json')));
    bang(c.google_sheet.chuoi_bi_mat, BI_MAT_MOI, 'chuỗi bí mật sau lần chạy thứ hai');
    return 'thoát mã 3 · package.json y nguyên · bí mật y nguyên';
  });

  // --- CN-07: bấm nút chạy khi máy chưa có mã ---
  test('CN-07', 'Bấm 4_CHAY_TOOL.bat lúc máy chưa cài: câu tiếng Việt, không phải lỗi thô của Node', () => {
    const m = dungMayGia(null);
    const r = chayNut(m, '4_CHAY_TOOL.bat');
    dung(r.ma !== 0, 'phải từ chối chạy');
    dung(/MAY CHUA CAI DAT/.test(r.ra), 'thiếu câu "MAY CHUA CAI DAT": ' + r.ra.slice(0, 200));
    dung(/1_CAI_DAT_LAN_DAU\.bat/.test(r.ra), 'phải chỉ đúng nút phải bấm');
    dung(!/at Object\.|node:internal|Error:/.test(r.ra), 'lỗi thô của Node lọt ra màn hình người dùng');
    return 'thoát mã ' + r.ma + ' · câu tiếng Việt, không có vết lỗi Node';
  });

  // --- CN-08: chuỗi bí mật không được lọt ra màn hình ---
  test('CN-08', 'Chuỗi bí mật của máy không lọt ra màn hình đen ở bất kỳ lần chạy nào', () => {
    const r = chayNut(may, '2_CAP_NHAT.bat', ['/nguon', zip]);
    for (const [nhan, s] of [['lần cài đầu', kq.ra], ['lần chạy lại', r.ra]]) {
      dung(s.indexOf(BI_MAT_MOI) < 0, 'chuỗi bí mật lọt ra màn hình ở ' + nhan);
    }
    return 'quét 2 lần chạy, 0 lần lộ';
  });

  // --- CN-09: kho thiếu bat/ phải bị CHẶN HẲN, không phải cảnh báo suông ---
  const zipThieuBat = await (async () => {
    const z = new JSZip();
    const g = z.folder('kho-nao-do-main');
    g.file('package.json', JSON.stringify({ name: 'keodon', version: '9.9.5' }));
    g.folder('src').file('Main.gs', '// thieu bat/');
    g.folder('node').file('chay-thu.js', '// thieu bat/');
    const tam = tamMoi('zipthieu'); RAC.push(tam);
    const t = path.join(tam, 'thieu-bat.zip');
    fs.writeFileSync(t, await z.generateAsync({ type: 'nodebuffer' }));
    return t;
  })();

  test('CN-09', 'Kho GitHub thiếu bat/ → từ chối cập nhật, không đụng file nào trên máy', () => {
    const m = dungMayGia(null);
    const nutTruoc = fs.readFileSync(path.join(m, '4_CHAY_TOOL.bat'));
    const r = chayNut(m, '2_CAP_NHAT.bat', ['/nguon', zipThieuBat]);

    dung(r.ma !== 0, 'phải từ chối, nhận mã thoát ' + r.ma);
    dung(/khong dung cau truc/i.test(r.ra), 'phải nói rõ kho sai cấu trúc: ' + r.ra.slice(-300));
    dung(/BON thu/.test(r.ra) && /thu muc  bat/.test(r.ra), 'câu lỗi phải kể đủ bốn thứ, có bat');
    dung(!fs.existsSync(path.join(m, CAU_HINH, 'keodon-apps-script', 'package.json')),
      'đã từ chối mà vẫn cài mã vào máy');
    dung(fs.readFileSync(path.join(m, '4_CHAY_TOOL.bat')).equals(nutTruoc), 'nút bấm bị đụng dù đã từ chối');
    bang(JSON.parse(doc(path.join(m, CAU_HINH, 'CAU_HINH_VAN_HANH.json'))).google_sheet.chuoi_bi_mat,
      BI_MAT_MOI, 'chuỗi bí mật sau lần bị từ chối');

    // Đối chứng âm: bản CŨ chỉ kiểm src + node → nhận bừa cái kho thiếu bat/ này.
    const cu = path.join(os.tmpdir(), 'keodon-ban-cu-ba-thu-' + Date.now() + '.bat');
    fs.writeFileSync(cu, fs.readFileSync(path.join(VAN_HANH, '2_CAP_NHAT.bat'), 'latin1')
      .replace(" -and (Test-Path -LiteralPath (Join-Path $goc 'bat'))", ''), 'latin1');
    const dc = doiChungAm('bản cũ chỉ kiểm ba thứ: src + node + package.json', () => {
      try {
        const r2 = chayNut(dungMayGia(cu), '2_CAP_NHAT.bat', ['/nguon', zipThieuBat]);
        if (r2.ma === 0) throw new Error('nhận bừa kho thiếu bat/ (thoát mã 0) — ba nút sẽ không bao giờ được cập nhật');
      } finally { fs.unlinkSync(cu); }
    });
    return 'thoát mã ' + r.ma + ' · máy không bị đụng gì · ' + dc;
  });

  // Bài bất đồng bộ (DG-09, DG-10) chạy ở đây, tuần tự, trước khi in kết quả.
  for (const f of DS_CHO) await f();

  for (const [tt, ma, ten, chuThich, loi] of KQ) {
    console.log(tt + '   ' + ma + ' ' + ten);
    if (chuThich) console.log('        · ' + chuThich);
    if (loi) console.log('   -> ' + loi);
  }
  console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · tổng ' + (dat + hong) + ' ===');
  for (const d of RAC) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* thư mục tạm, kệ */ } }
  process.exit(hong ? 1 : 0);
})().catch((e) => { console.error('HỎNG TOÀN BỘ: ' + e.stack); process.exit(1); });
