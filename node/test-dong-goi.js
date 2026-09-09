/**
 * ĐÓNG GÓI + CẬP NHẬT — chạy thật, không giả lập.
 *
 * Nhóm DG-*: soi gói `Tool_nhập_liệu` vừa dựng.
 * Nhóm CN-*: dựng hẳn một "máy nhân viên" giả trong thư mục tạm, dựng một file .zip
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
function test(ma, ten, fn) {
  try { const t = fn(); dat++; KQ.push(['ĐẠT', ma, ten, t]); }
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
DG.dungGoi(path.join(goiThu, 'Tool_nhập_liệu'), null);
const GOI = path.join(goiThu, 'Tool_nhập_liệu');
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

test('DG-02', 'Hai dòng bí mật trong gói phải RỖNG, và không file nào mang bí mật thật của máy', () => {
  const c = JSON.parse(doc(path.join(GOI, CAU_HINH, 'CAU_HINH_VAN_HANH.json')));
  bang(String(c.google_sheet.web_app_url || ''), '', 'web_app_url');
  bang(String(c.google_sheet.chuoi_bi_mat || ''), '', 'chuoi_bi_mat');

  const dc = doiChungAm('gói dựng bằng cách chép file cấu hình THẬT của máy thay vì bản mẫu', () => {
    const cfgTep = path.join(GOI, CAU_HINH, 'CAU_HINH_VAN_HANH.json');
    const luu = fs.readFileSync(cfgTep);
    const xau = JSON.parse(doc(cfgTep));
    xau.google_sheet.chuoi_bi_mat = 'chuoi-bi-mat-that-cua-shop';
    fs.writeFileSync(cfgTep, JSON.stringify(xau, null, 2));
    try {
      const p = DG.kiemGoi(GOI);
      if (p.length) throw new Error(p[0]);
    } finally { fs.writeFileSync(cfgTep, luu); }
  });
  return 'cả hai dòng rỗng · ' + dc;
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
  const moi = [];
  (function di(d) {
    for (const t of fs.readdirSync(d)) {
      const x = path.join(d, t);
      if (fs.statSync(x).isDirectory()) { moi.push(t); di(x); } else moi.push(t);
    }
  })(GOI);
  bang(moi.filter((t) => t.toLowerCase().endsWith('.md')).length, 0, 'file .md');
  bang(moi.filter((t) => t === 'src' || t === 'node' || t === 'node_modules').length, 0, 'thư mục mã nguồn');

  const dc = doiChungAm('gói kèm thư mục src như bản đóng gói cũ', () => {
    const s = path.join(GOI, CAU_HINH, 'src');
    fs.mkdirSync(s, { recursive: true });
    fs.writeFileSync(path.join(s, 'Main.gs'), '// ma nguon');
    try {
      const p = DG.kiemGoi(GOI);
      if (p.length) throw new Error(p[0]);
    } finally { fs.rmSync(s, { recursive: true, force: true }); }
  });
  return moi.length + ' mục, 0 .md, 0 thư mục mã nguồn · ' + dc;
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

// ================================================ NHÓM CN — chạy thật nút cập nhật

/** Dựng một "máy nhân viên" giả: bốn nút + Cấu hình có bí mật mồi, CHƯA có mã nào. */
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
  fs.writeFileSync(path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', 'don-cho-xu-ly.txt'), 'file cua nhan vien');
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
    thu_muc_tha_file: '1_THA_FILE_XUAT',
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

  test('CN-04', 'KHÔNG BAO GIỜ ghi đè CAU_HINH_VAN_HANH.json: giữ nguyên bí mật, chỉ THÊM khóa mới', () => {
    const s = doc(path.join(may, CAU_HINH, 'CAU_HINH_VAN_HANH.json'));
    const c = JSON.parse(s);
    bang(c.google_sheet.chuoi_bi_mat, BI_MAT_MOI, 'chuỗi bí mật của máy');
    bang(c.google_sheet.web_app_url, LINK_MOI, 'link Web App của máy');
    bang(c.cap_nhat.ten_repo, 'kho-nao-do', 'khai báo kho của máy');
    bang(c.khoa_hoan_toan_moi, 'gia tri mac dinh', 'khóa mới của bản mới phải được THÊM vào');
    dung(s !== cfgTruoc, 'phải có thêm khóa mới, nghĩa là file có đổi');
    return 'bí mật còn nguyên · khóa mới  khoa_hoan_toan_moi  đã được thêm';
  });

  test('CN-05', 'Không đụng thư mục thả file của nhân viên', () => {
    const t = path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', 'don-cho-xu-ly.txt');
    dung(fs.existsSync(t), 'file nhân viên thả vào đã bị mất');
    bang(fs.readFileSync(t, 'utf8'), 'file cua nhan vien', 'nội dung file');
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

  for (const [tt, ma, ten, chuThich, loi] of KQ) {
    console.log(tt + '   ' + ma + ' ' + ten);
    if (chuThich) console.log('        · ' + chuThich);
    if (loi) console.log('   -> ' + loi);
  }
  console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · tổng ' + (dat + hong) + ' ===');
  for (const d of RAC) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* thư mục tạm, kệ */ } }
  process.exit(hong ? 1 : 0);
})().catch((e) => { console.error('HỎNG TOÀN BỘ: ' + e.stack); process.exit(1); });
