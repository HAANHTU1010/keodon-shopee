/**
 * BỐN NÚT CỦA NGƯỜI VẬN HÀNH — kiểm hình dạng file, không kiểm nghiệp vụ.
 *
 * VÌ SAO CÓ BÀI NÀY. Hai lần chạy thật của chủ shop đã hỏng câm vì đúng ba tật dưới đây,
 * và không bài test nào bắt được:
 *   · `CHAY_TOOL.bat` từng RỖNG — bấm vào không ra gì, không báo lỗi.
 *   · `CAI_DAT_1_LAN.bat` có dòng `echo ... (khong can quyen quan tri)` nằm trong khối
 *     `if (...)`. cmd.exe đọc dấu `)` đó là dấu ĐÓNG KHỐI nên nuốt mất phần sau và bung
 *     ra thông báo `: was unexpected at this time.`
 *   · file lưu bằng UTF-8 hoặc LF thì cmd.exe đọc sai chữ và sai dòng.
 *
 * Ba tật đều là hình dạng file, đo được bằng máy, nên không có lý do gì để chúng lọt lần nữa.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

const THU_MUC = path.resolve(__dirname, '..', '..', '..', '03_VAN_HANH');
const NUT_BAT_BUOC = ['1_CAI_DAT_LAN_DAU.bat', '2_CAP_NHAT.bat', '3_TAO_FILE_THANG_MOI.bat', '4_CHAY_TOOL.bat'];
const CO_MO_KHOI = /^(if|for)\b.*\($/i;
const CO_ELSE = /\)\s*else\s*\($/i;
const LA_ECHO = /^echo(\s|\.|$)/i;

/** Soi một file .bat, trả về danh sách chỗ sai (rỗng là đạt). */
function soiMotNut(duong) {
  const b = fs.readFileSync(duong);
  const loi = [];

  if (b.length === 0) { loi.push('FILE RỖNG — bấm vào không ra gì'); return loi; }

  for (let i = 0; i < b.length; i++) {
    if (b[i] > 0x7f) { loi.push('không phải ASCII thuần: byte 0x' + b[i].toString(16) + ' ở vị trí ' + i); break; }
  }

  const s = b.toString('latin1');
  const soLF = (s.match(/\n/g) || []).length;
  const soCRLF = (s.match(/\r\n/g) || []).length;
  if (soLF !== soCRLF) loi.push('có ' + (soLF - soCRLF) + ' dòng xuống dòng kiểu LF trần — cmd.exe cần CRLF');

  let sau = 0;
  s.split('\n').forEach((d, k) => {
    const c = d.replace(/\r$/, '').trim();
    if (sau > 0 && LA_ECHO.test(c)) {
      for (let j = 0; j < c.length; j++) {
        if ('()<>'.indexOf(c[j]) >= 0 && (j === 0 || c[j - 1] !== '^')) {
          loi.push('dòng ' + (k + 1) + ': ký tự `' + c[j] + '` chưa thoát bằng ^ trong khối if(...) — ' + c.slice(0, 60));
        }
      }
    }
    if (CO_MO_KHOI.test(c) || CO_ELSE.test(c)) sau++;
    else if (c === ')' && sau > 0) sau--;
  });

  return loi;
}

const BAI = [];
function test(ten, fn) { BAI.push({ ten, fn }); }

test('N-22 đủ bốn nút, đánh số 1→4 đúng thứ tự người vận hành làm', () => {
  const co = fs.readdirSync(THU_MUC).filter((t) => t.toLowerCase().endsWith('.bat')).sort();
  const thieu = NUT_BAT_BUOC.filter((t) => co.indexOf(t) < 0);
  if (thieu.length) throw new Error('thiếu nút: ' + thieu.join(', ') + ' (đang có: ' + co.join(', ') + ')');
  const thua = co.filter((t) => NUT_BAT_BUOC.indexOf(t) < 0);
  if (thua.length) throw new Error('có nút lạ ngoài bốn nút: ' + thua.join(', '));
  return co.length + ' nút: ' + co.join(' · ');
});

NUT_BAT_BUOC.forEach((ten, i) => {
  test('N-2' + (3 + i) + ' ' + ten + ': không rỗng · ASCII thuần · CRLF thuần · echo trong if(...) đã thoát', () => {
    const d = path.join(THU_MUC, ten);
    if (!fs.existsSync(d)) throw new Error('không có file ' + ten);
    const loi = soiMotNut(d);
    if (loi.length) throw new Error(loi.join(' | '));
    return Math.round(fs.statSync(d).size / 1024) + ' KB, sạch';
  });
});

/**
 * Dấu `!` trong file bật `setlocal enabledelayedexpansion`.
 *
 * cmd.exe nuốt sạch mọi thứ nằm GIỮA HAI dấu `!` và thay bằng rỗng. Trong một dòng
 * `node -e "...JS..."` thì đó là cắt xén mã nguồn giữa chừng — và tai hại nhất là phần
 * còn lại vẫn có thể là JavaScript HỢP LỆ, chạy êm với nghĩa ngược hẳn.
 *
 * Đã trả giá thật: bước 4 của `1_CAI_DAT_LAN_DAU.bat` viết
 *   if(!String(g.web_app_url||'').trim())t.push('web_app_url');if(!String(g.chuoi_bi_mat…
 * cmd cắt từ `!` thứ nhất tới `!` thứ hai, còn lại `if(String(g.chuoi_bi_mat…).trim())` —
 * mất dấu phủ định. Kết quả LẬT NGƯỢC: cấu hình rỗng thì báo OK, điền đủ thì báo CHƯA ĐIỀN.
 * Cái bẫy này đã được ghi trong `DONG_GOI_GIAO_NHAN_VIEN.md` từ trước mà vẫn dính lại,
 * vì tài liệu không chặn được ai — chỉ bài test mới chặn được.
 *
 * Dạng duy nhất được phép là `set "TEN=!TEN_BIEN!"` — chính là cú pháp delayed expansion.
 */
const DUOC_PHEP = /^\s*set "[A-Za-z_]\w*=![A-Za-z_]\w*!"\s*$/;
const DONG_NODE = /(?:%NODE%|\bnode\b)[^\n]*\s-e\s/i;

test('N-28 không dấu `!` nào trong đoạn JS truyền cho node -e (cmd nuốt mất, lật ngược logic)', () => {
  const xau = [];
  for (const ten of NUT_BAT_BUOC) {
    const s = fs.readFileSync(path.join(THU_MUC, ten), 'latin1');
    if (!/enabledelayedexpansion/i.test(s)) continue;
    s.split('\n').forEach((d, k) => {
      const c = d.replace(/\r$/, '');
      if (c.indexOf('!') < 0) return;
      if (DONG_NODE.test(c)) xau.push(ten + ' dòng ' + (k + 1) + ': `!` nằm trong đoạn JS của node -e');
      else if (!DUOC_PHEP.test(c)) xau.push(ten + ' dòng ' + (k + 1) + ': `!` không phải dạng !TÊN_BIẾN!');
    });
  }
  if (xau.length) throw new Error(xau.join(' | '));
  return NUT_BAT_BUOC.length + ' nút, mọi `!` còn lại đều là !TÊN_BIẾN! hợp lệ';
});

test('N-27 không nút nào còn gọi tên cũ của nút khác', () => {
  const CU = [/(?<![0-9_])CHAY_TOOL\.bat/, /3_CHAY_TOOL\.bat/, /2_TAO_FILE_THANG_MOI\.bat/,
    /(?<![0-9_])TAO_FILE_THANG_MOI\.bat/, /(?<![0-9_])CAP_NHAT\.bat/, /CAI_DAT_1_LAN\.bat/];
  const xau = [];
  NUT_BAT_BUOC.forEach((ten) => {
    const s = fs.readFileSync(path.join(THU_MUC, ten), 'latin1');
    CU.forEach((rx) => { const m = s.match(rx); if (m) xau.push(ten + ' còn nhắc "' + m[0] + '"'); });
  });
  if (xau.length) throw new Error(xau.join(' | '));
  return 'bốn nút chỉ gọi nhau bằng tên hiện hành';
});

/* ==========================================================================
 * PHẦN 2 — CÁC CỬA CHẶN, CHẠY THẬT BẰNG cmd.exe
 *
 * VÌ SAO CÓ PHẦN NÀY. Phần 1 ở trên chỉ soi HÌNH DẠNG file. Nó bắt được cái bẫy
 * `!` vì cái bẫy đó để lại dấu vết nhìn thấy được (N-28). Nhưng họ lỗi nguy hiểm
 * nhất — "phép kiểm luôn luôn ĐẠT" — thì không nhất thiết để lại dấu vết nào:
 * một chữ `not` rơi mất, một dấu so sánh viết ngược, và cửa chặn vẫn còn nguyên
 * đó, vẫn chạy, chỉ là không bao giờ chặn ai nữa.
 *
 * Bài học N-10 và cái bẫy `!` của bước 4 là cùng một họ: mọi bài dương tính đều
 * xanh vì phép kiểm nào cũng nói OK. Chỉ có đối chứng âm bắt được.
 *
 * Nên phần này làm đúng một việc: với mỗi CỬA QUYẾT ĐỊNH ĐI TIẾP HAY DỪNG, dựng
 * một máy nhân viên giả trong thư mục tạm, CHẠY THẬT nút bấm bằng cmd.exe, rồi
 * chứng minh cửa đó TRƯỢT KHI ĐÁNG TRƯỢT. Mỗi bài kèm ĐỐI CHỨNG ÂM: dựng lại
 * đúng khuyết tật vào một bản sao của nút, chạy lại, và đòi phép chấm báo LỆCH.
 *
 * KHÔNG BAO GIỜ chạy nút bấm trên thư mục 03_VAN_HANH thật: mọi thứ diễn ra
 * trong thư mục tạm, trên bản sao.
 * ========================================================================== */

const RAC = [];
function tamMoi(ten) {
  const d = path.join(os.tmpdir(), 'keodon-nut-' + ten + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  fs.mkdirSync(d, { recursive: true });
  RAC.push(d);
  return d;
}

const CAU_HINH = 'Cấu hình'.normalize('NFC');
const NHAT_KY = 'nhật ký'.normalize('NFC');
const DA_XU_LY = 'đã xử lý'.normalize('NFC');

// Chuỗi mồi: lọt ra chỗ không được phép, hoặc bị xóa mất, thì bài test bắt được ngay.
const BI_MAT_MOI = 'BI-MAT-RIENG-CUA-MAY-NAY-0123456789';
const LINK_MOI = 'https://script.google.com/macros/s/MOI_LINK_CUA_MAY_NAY/exec';
const LINK_SHEET = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';

/** Chạy một phép chấm trên bản SAI, đòi nó phải báo LỆCH. Không lệch là bài test mù. */
async function doiChungAm(nhan, chay) {
  let lech = null;
  try { await chay(); } catch (e) { lech = e.message; }
  if (!lech) throw new Error('ĐỐI CHỨNG ÂM HỎNG — cắm bản sai "' + nhan + '" mà phép chấm vẫn báo đạt');
  return 'đối chứng âm "' + nhan + '": LỆCH ← đúng như phải thế · ' + lech.slice(0, 100);
}

/**
 * Dựng lại một khuyết tật vào BẢN SAO của một nút, trả về đường dẫn bản hỏng.
 * Gọi hàm này NGOÀI doiChungAm: nếu mã gốc đã đổi và chỗ neo không còn khớp thì
 * phải hỏng to ở đây, chứ lọt vào trong doiChungAm sẽ bị nhầm là "đã báo lệch".
 */
function nutHong(ten, sua) {
  const goc = fs.readFileSync(path.join(THU_MUC, ten), 'latin1');
  const moi = sua(goc);
  if (moi === goc) {
    throw new Error('KHÔNG CẮM ĐƯỢC KHUYẾT TẬT vào ' + ten
      + ' — mã đã đổi, chỗ neo của bài test không còn khớp. Sửa lại bài test, đừng bỏ qua.');
  }
  const p = path.join(tamMoi('hong'), ten);
  fs.writeFileSync(p, moi, 'latin1');
  return p;
}

/**
 * Máy nhân viên giả: bốn nút ở cấp gốc + thư mục `Cấu hình` bên trong.
 *   o.thayNut    {tên nút: đường dẫn bản thay}  — cắm bản đã dựng khuyết tật
 *   o.nut2Gia    true = thay 2_CAP_NHAT.bat bằng nút giả thoát 0 (khỏi ra mạng)
 *   o.googleSheet / o.capNhat   ghi đè hai mục của file cấu hình
 *   o.cfgTho     chuỗi thô ghi thẳng vào file cấu hình (dựng ca JSON hỏng)
 *   o.khongCfg   true = không tạo file cấu hình
 *   o.khongMau   true = không tạo bản mẫu
 *   o.banMa      số phiên bản bộ mã dựng sẵn trong máy (bỏ trống = máy chưa có mã)
 *   o.chayThuGia nội dung file node/chay-thu.js giả
 */
function dungMay(o) {
  o = o || {};
  const may = tamMoi('may');
  const ch = path.join(may, CAU_HINH);
  fs.mkdirSync(path.join(ch, NHAT_KY), { recursive: true });

  for (const t of NUT_BAT_BUOC) {
    if (o.thayNut && o.thayNut[t]) { fs.copyFileSync(o.thayNut[t], path.join(may, t)); continue; }
    if (o.nut2Gia && t === '2_CAP_NHAT.bat') {
      fs.writeFileSync(path.join(may, t),
        '@echo off\r\necho (nut 2 gia) khong ra mang trong luc chay test\r\nexit /b 0\r\n', 'ascii');
      continue;
    }
    fs.copyFileSync(path.join(THU_MUC, t), path.join(may, t));
  }

  const cfg = {
    thu_muc_tha_file: '1_THA_FILE_XUAT',
    thu_muc_gian_hang: { SP_MALL: 'Shopee mall' },
    ten_thu_muc_da_xu_ly: DA_XU_LY,
    google_sheet: Object.assign({ bat: true, web_app_url: LINK_MOI, chuoi_bi_mat: BI_MAT_MOI }, o.googleSheet || {}),
    cap_nhat: Object.assign({ chu_tai_khoan: 'ai-do', ten_repo: 'kho-nao-do', nhanh: 'main' }, o.capNhat || {})
  };
  if (!o.khongCfg) {
    fs.writeFileSync(path.join(ch, 'CAU_HINH_VAN_HANH.json'),
      o.cfgTho !== undefined ? o.cfgTho : JSON.stringify(cfg, null, 2), 'utf8');
  }
  if (!o.khongMau) {
    // Bản mẫu: hai dòng bí mật RỖNG, đúng như bản đi theo gói.
    const mau = JSON.parse(JSON.stringify(cfg));
    mau.google_sheet = { bat: true, web_app_url: '', chuoi_bi_mat: '' };
    mau.cap_nhat = { chu_tai_khoan: '', ten_repo: '', nhanh: 'main' };
    fs.writeFileSync(path.join(ch, 'CAU_HINH_VAN_HANH.mau.json'), JSON.stringify(mau, null, 2), 'utf8');
  }

  // npm giả: bước cài thư viện của nút cập nhật khỏi cần mạng và khỏi cần npm thật.
  const np = path.join(ch, 'node-portable');
  fs.mkdirSync(np, { recursive: true });
  fs.writeFileSync(path.join(np, 'npm.cmd'), '@echo off\r\necho (npm gia) bo qua\r\nexit /b 0\r\n', 'ascii');

  const tool = path.join(ch, 'keodon-apps-script');
  if (o.banMa) {
    fs.mkdirSync(path.join(tool, 'src'), { recursive: true });
    fs.mkdirSync(path.join(tool, 'node'), { recursive: true });
    fs.writeFileSync(path.join(tool, 'package.json'),
      JSON.stringify({ name: 'keodon', version: o.banMa }, null, 2), 'utf8');
    fs.writeFileSync(path.join(tool, 'src', 'Main.gs'), '// BAN TREN MAY ' + o.banMa, 'utf8');
    fs.writeFileSync(path.join(tool, 'node', 'chay-thu.js'), o.chayThuGia || ('// BAN TREN MAY ' + o.banMa), 'utf8');
    // Web App giả: từ chối ngay tại chỗ, bài test không bao giờ gọi ra mạng.
    fs.writeFileSync(path.join(tool, 'node', 'gsheet-web-app.js'),
      'class W{constructor(g){if(!g||!String(g.web_app_url||"").trim())throw new Error("chua dien du cau hinh");}\n'
      + '  ping(){return Promise.reject(new Error("GIA LAP: bai test khong goi ra mang"));}}\n'
      + 'module.exports={WebAppGoogleSheet:W};\n', 'utf8');
  }
  fs.mkdirSync(path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', DA_XU_LY), { recursive: true });
  return { may: may, cfgTep: path.join(ch, 'CAU_HINH_VAN_HANH.json'), tool: tool, cauHinh: ch };
}

function chayNut(may, ten, themTv, giay) {
  const r = spawnSync('cmd.exe', ['/c', path.join(may, ten), '/tu-dong'].concat(themTv || []),
    { cwd: may, encoding: 'latin1', timeout: (giay || 180) * 1000 });
  return { ma: r.status, tinHieu: r.signal, ra: String(r.stdout || '') + String(r.stderr || '') };
}

/**
 * Nút 3 nhận `/tra-loi "9|10|link"`. Dấu `|` là dấu ống của cmd; truyền thẳng qua
 * mảng tham số thì cmd cắt câu lệnh làm đôi. Gói vào một file .bat trung gian —
 * trong file .bat, phần nằm giữa hai dấu nháy kép được giữ nguyên.
 */
function chayNut3(may, traLoi) {
  const w = path.join(tamMoi('goi3'), 'goi_nut_3.bat');
  fs.writeFileSync(w, '@echo off\r\ncall "' + path.join(may, '3_TAO_FILE_THANG_MOI.bat')
    + '" /tu-dong /tra-loi "' + traLoi + '"\r\nexit /b %ERRORLEVEL%\r\n', 'ascii');
  const r = spawnSync('cmd.exe', ['/c', w], { cwd: may, encoding: 'latin1', timeout: 120000 });
  return { ma: r.status, ra: String(r.stdout || '') + String(r.stderr || '') };
}

function docCfg(t) { return JSON.parse(fs.readFileSync(t, 'utf8').replace(/^﻿/, '')); }
function dsThangMoi(ch) { return fs.readdirSync(ch).filter((t) => /^thang-moi-.*\.json$/i.test(t)); }
function dung(dk, vi) { if (!dk) throw new Error(vi); }

/** Dựng .zip giống hệt bản GitHub tải về: src/, node/, bat/, package.json. */
async function dungZipKho(phienBan) {
  const z = new JSZip();
  const g = z.folder('kho-nao-do-main');
  g.file('package.json', JSON.stringify({ name: 'keodon', version: phienBan, dependencies: { exceljs: '4.4.0' } }, null, 2));
  g.folder('src').file('Main.gs', '// BAN TREN KHO ' + phienBan);
  g.folder('node').file('chay-thu.js', '// BAN TREN KHO ' + phienBan);
  const b = g.folder('bat');
  for (const t of ['1_CAI_DAT_LAN_DAU.bat', '3_TAO_FILE_THANG_MOI.bat', '4_CHAY_TOOL.bat']) {
    b.file(t, '@echo off\r\nrem BAN TREN KHO ' + phienBan + '\r\n');
  }
  b.file('2_CAP_NHAT.bat', fs.readFileSync(path.join(THU_MUC, '2_CAP_NHAT.bat'), 'latin1'));
  const p = path.join(tamMoi('zip'), 'ban-tren-kho.zip');
  fs.writeFileSync(p, await z.generateAsync({ type: 'nodebuffer' }));
  return p;
}

/* ---------------------------------------------------------------- NÚT 1 --- */

test('N-29 1_CAI_DAT_LAN_DAU.bat KHONG BAO GIO ghi de CAU_HINH_VAN_HANH.json da co', async () => {
  // Cửa: `if not exist "%CFG%"` bọc quanh `copy /y "%MAU%" "%CFG%"`, ngay trước bước [1/6].
  // Cửa này hỏng thì MỖI LẦN bấm nút cài đặt là một lần chuỗi bí mật và link Web App
  // của máy bị bản mẫu rỗng đè lên. Đây là hậu quả nặng nhất trong cả bốn nút, và
  // nút 1 là nút DUY NHẤT có lệnh copy ghi vào file đó.
  const m = dungMay({ nut2Gia: true, banMa: '9.9.0' });
  const r = chayNut(m.may, '1_CAI_DAT_LAN_DAU.bat');
  const c = docCfg(m.cfgTep);
  dung(c.google_sheet.chuoi_bi_mat === BI_MAT_MOI,
    'CHUOI BI MAT CUA MAY DA BI GHI DE — còn lại ' + JSON.stringify(c.google_sheet.chuoi_bi_mat));
  dung(c.google_sheet.web_app_url === LINK_MOI, 'link Web App của máy đã bị ghi đè');
  dung(c.cap_nhat.ten_repo === 'kho-nao-do', 'khai báo kho của máy đã bị ghi đè');
  dung(r.ra.indexOf('Vua tao  CAU_HINH_VAN_HANH.json') < 0,
    'nút báo vừa TẠO file cấu hình trong khi máy đã có sẵn một file');

  const banHong = nutHong('1_CAI_DAT_LAN_DAU.bat', (s) =>
    s.replace('if not exist "%CFG%" (', () => 'if exist "%CFG%" ('));
  const dc = await doiChungAm('roi mat chu  not  o cua bao ve file cau hinh', async () => {
    const h = dungMay({ nut2Gia: true, banMa: '9.9.0', thayNut: { '1_CAI_DAT_LAN_DAU.bat': banHong } });
    chayNut(h.may, '1_CAI_DAT_LAN_DAU.bat');
    const x = docCfg(h.cfgTep);
    if (x.google_sheet.chuoi_bi_mat !== BI_MAT_MOI) {
      throw new Error('bí mật của máy bị bản mẫu đè mất, còn lại ' + JSON.stringify(x.google_sheet.chuoi_bi_mat));
    }
  });
  return 'chay tron 6 buoc (thoat ma ' + r.ma + '), bi mat + link + khai bao kho con nguyen · ' + dc;
});

test('N-30 1_CAI_DAT_LAN_DAU.bat buoc [4/6] phai TRUOT khi cau hinh rong, DAT khi da dien', async () => {
  // Đây đúng là cửa mà cái bẫy `!` đã lật ngược: cấu hình rỗng thì báo OK, điền đủ
  // thì báo CHUA DIEN. N-28 ở trên chỉ bắt được DẤU VẾT của cái bẫy đó (`!` còn nằm
  // trong đoạn JS). Bài này đo HÀNH VI, nên bắt được mọi cách làm hỏng cửa này, kể
  // cả những cách không để lại dấu vết nào trong hình dạng file.
  const rong = dungMay({ nut2Gia: true, banMa: '9.9.0', googleSheet: { web_app_url: '', chuoi_bi_mat: '' } });
  const a = chayNut(rong.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(/\[4\/6\] Link Web App va chuoi bi mat: CHUA DIEN/.test(a.ra),
    'cấu hình RỖNG mà bước 4 không báo CHUA DIEN: '
    + (a.ra.match(/\[4\/6\][^\r\n]*/) || ['(không có dòng [4/6] nào)'])[0]);
  dung(!/\[4\/6\][^\r\n]*OK/.test(a.ra), 'cấu hình rỗng mà bước 4 báo OK — phép kiểm đã bị lật ngược');
  dung(a.ma === 2, 'cấu hình rỗng phải kết luận CHUA SAN SANG và thoát mã 2, nhận được ' + a.ma);
  dung(/CHUA SAN SANG/.test(a.ra), 'bước 6 phải kết luận CHUA SAN SANG');
  dung(/\[5\/6\] Goi thu len Web App: BO QUA/.test(a.ra), 'cấu hình rỗng thì bước 5 phải bỏ qua, không gọi lên Google');

  const du = dungMay({ nut2Gia: true, banMa: '9.9.0' });
  const b = chayNut(du.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(/\[4\/6\] Link Web App va chuoi bi mat: OK/.test(b.ra),
    'điền đủ mà bước 4 vẫn báo CHUA DIEN: '
    + (b.ra.match(/\[4\/6\][^\r\n]*/) || ['(không có dòng [4/6] nào)'])[0]);
  dung(/\[5\/6\] Goi thu len Web App tren Google/.test(b.ra), 'điền đủ thì bước 5 phải gọi thử, không được bỏ qua');

  const banHong = nutHong('1_CAI_DAT_LAN_DAU.bat', (s) => s.replace(
    "var t=[];var u=String(g.web_app_url||'').trim();var m=String(g.chuoi_bi_mat||'').trim();"
    + "if(u.length===0){t.push('web_app_url');}if(m.length===0){t.push('chuoi_bi_mat');}",
    () => "var t=[];if(!String(g.web_app_url||'').trim()){t.push('web_app_url');}"
      + "if(!String(g.chuoi_bi_mat||'').trim()){t.push('chuoi_bi_mat');}"));
  const dc = await doiChungAm('cam lai dung cai bay ! cu cua buoc 4 (cmd nuot doan giua hai dau !)', async () => {
    const h = dungMay({
      nut2Gia: true, banMa: '9.9.0', googleSheet: { web_app_url: '', chuoi_bi_mat: '' },
      thayNut: { '1_CAI_DAT_LAN_DAU.bat': banHong }
    });
    const r = chayNut(h.may, '1_CAI_DAT_LAN_DAU.bat');
    if (!/\[4\/6\] Link Web App va chuoi bi mat: CHUA DIEN/.test(r.ra)) {
      throw new Error('cấu hình rỗng mà báo ' + (r.ra.match(/\[4\/6\][^\r\n]*/) || ['?'])[0].trim());
    }
  });
  return 'rong -> CHUA DIEN + thoat ma 2 + bo qua buoc 5 · dien du -> OK + goi thu · ' + dc;
});

test('N-31 1_CAI_DAT_LAN_DAU.bat buoc [2/6] la cua DUNG HAN: thieu khai bao kho thi khong di tiep', async () => {
  // Cửa dừng hẳn: thiếu chu_tai_khoan/ten_repo thì `exit /b 1`, không gọi sang nút 2.
  // Mục 9.2 ghi rõ bước 2 cũng dính bẫy `!` và ÂM THẦM BỎ QUA phép kiểm chu_tai_khoan,
  // nên bài này đòi câu báo lỗi kể ĐỦ HAI khóa, không chỉ đòi nó có chặn.
  const trong = dungMay({ nut2Gia: true, capNhat: { chu_tai_khoan: '', ten_repo: '' } });
  const a = chayNut(trong.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(/\[2\/6\] Khai bao kho ma GitHub: CHUA CO/.test(a.ra),
    'khai báo kho RỖNG mà bước 2 không chặn: '
    + (a.ra.match(/\[2\/6\][^\r\n]*/) || ['(không có dòng [2/6])'])[0]);
  dung(a.ma === 1, 'phải dừng hẳn với mã thoát 1, nhận được ' + a.ma);
  dung(/Con trong: chu_tai_khoan, ten_repo/.test(a.ra),
    'phải kể ĐỦ HAI khóa còn trống, không được âm thầm bỏ sót khóa nào');
  dung(!/\[3\/6\] Keo ma ve: OK/.test(a.ra), 'đã chặn ở bước 2 mà vẫn chạy tiếp sang bước 3');

  const hongJson = dungMay({ nut2Gia: true, cfgTho: '{ "cap_nhat": { thieu dau ngoac ' });
  const b = chayNut(hongJson.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(/\[2\/6\] Khai bao kho ma GitHub: KHONG DOC DUOC FILE CAU HINH/.test(b.ra),
    'file cấu hình sai định dạng JSON phải bị bắt ở bước 2: ' + b.ra.slice(-200));
  dung(b.ma === 1, 'JSON hỏng phải dừng hẳn với mã thoát 1, nhận được ' + b.ma);

  const du = dungMay({ nut2Gia: true, banMa: '9.9.0' });
  const c = chayNut(du.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(/\[2\/6\] Khai bao kho ma GitHub: OK/.test(c.ra), 'khai báo đủ mà bước 2 vẫn chặn — cửa kẹt cứng');

  const banHong = nutHong('1_CAI_DAT_LAN_DAU.bat', (s) => s.replace(
    "if(a.length>0&&b.length>0){console.log('      Kho ma: '+a+'/'+b);process.exit(0);}"
    + "var t=[];if(a.length===0){t.push('chu_tai_khoan');}if(b.length===0){t.push('ten_repo');}",
    () => "if(a&&b){console.log('      Kho ma: '+a+'/'+b);process.exit(0);}"
      + "var t=[];if(!a){t.push('chu_tai_khoan');}if(!b){t.push('ten_repo');}"));
  const dc = await doiChungAm('cam lai dung cai bay ! cu cua buoc 2 (nuot luon phep kiem chu_tai_khoan)', async () => {
    const h = dungMay({
      nut2Gia: true, capNhat: { chu_tai_khoan: '', ten_repo: '' },
      thayNut: { '1_CAI_DAT_LAN_DAU.bat': banHong }
    });
    const r = chayNut(h.may, '1_CAI_DAT_LAN_DAU.bat');
    if (!/\[2\/6\] Khai bao kho ma GitHub: CHUA CO/.test(r.ra)) {
      throw new Error('khai báo rỗng mà báo ' + (r.ra.match(/\[2\/6\][^\r\n]*/) || ['?'])[0].trim());
    }
    if (!/Con trong: chu_tai_khoan, ten_repo/.test(r.ra)) {
      throw new Error('câu báo lỗi bỏ sót một khóa: ' + (r.ra.match(/Con trong:[^\r\n]*/) || ['(không có)'])[0]);
    }
  });
  return 'rong -> CHUA CO + ma 1 · JSON hong -> chan + ma 1 · dien du -> OK · ' + dc;
});

/* ---------------------------------------------------------------- NÚT 2 --- */

test('N-32 2_CAP_NHAT.bat khong bao gio KEO LUI may ve ban cu hon ban dang chay', async () => {
  // Cửa: `if ((-not $lanDau) -and ((SoSanh $vMoi $vCu) -le 0))` -> `$global:CN_MA = 3; return`.
  // Hỏng thì máy nhân viên TỰ LÙI về sau bản đang chạy mỗi lần bấm nút cập nhật, và
  // không ai biết — đúng cảnh mục 1.1 mô tả. CN-06 trong test-dong-goi.js mới đo ca
  // hai bản BẰNG NHAU; ca kho CŨ HƠN máy thì chưa bài nào chạm tới.
  const zipCu = await dungZipKho('2.0.0');
  const m = dungMay({ banMa: '9.9.0' });
  const r = chayNut(m.may, '2_CAP_NHAT.bat', ['/nguon', zipCu]);
  dung(r.ma === 3, 'kho cũ hơn máy phải thoát mã 3 (khong phai lam gi ca), nhận được ' + r.ma);
  dung(/DANG LA BAN MOI NHAT/.test(r.ra), 'phải báo đang là bản mới nhất: ' + r.ra.slice(-260));
  const pkg = JSON.parse(fs.readFileSync(path.join(m.tool, 'package.json'), 'utf8'));
  dung(pkg.version === '9.9.0', 'MAY DA BI KEO LUI: package.json nay la ' + pkg.version);
  dung(fs.readFileSync(path.join(m.tool, 'src', 'Main.gs'), 'utf8').indexOf('BAN TREN MAY 9.9.0') >= 0,
    'src/ đã bị bản cũ trên kho đè lên');
  dung(docCfg(m.cfgTep).google_sheet.chuoi_bi_mat === BI_MAT_MOI, 'chuỗi bí mật của máy bị đụng');

  const banHong = nutHong('2_CAP_NHAT.bat', (s) =>
    s.replace('if ((-not $lanDau) -and ((SoSanh $vMoi $vCu) -le 0)) {', () => 'if ($false) {'));
  const dc = await doiChungAm('bo han cua so phien ban (nut cap nhat nhan bua moi ban tren kho)', async () => {
    const h = dungMay({ banMa: '9.9.0', thayNut: { '2_CAP_NHAT.bat': banHong } });
    chayNut(h.may, '2_CAP_NHAT.bat', ['/nguon', zipCu]);
    const p = JSON.parse(fs.readFileSync(path.join(h.tool, 'package.json'), 'utf8'));
    if (p.version !== '9.9.0') {
      throw new Error('máy 9.9.0 bị kéo lùi xuống ' + p.version + ' — nhân viên nhận bản cũ hơn bản đang chạy');
    }
  });
  return 'may 9.9.0 + kho 2.0.0 -> thoat ma 3, package.json va src/ y nguyen · ' + dc;
});

/* ---------------------------------------------------------------- NÚT 3 --- */

test('N-33 3_TAO_FILE_THANG_MOI.bat: cac cua kiem tham so deu phai TRUOT khi dang truot', async () => {
  // Năm cửa, cửa nào cũng `$global:TM_MA = 1; return` và KHÔNG ghi file tham số.
  // Trước bài này chưa bài test nào chạy nút 3 lấy một lần: "validate tốt" mới chỉ là
  // kết luận đọc từ mã. Hỏng thì tool ghi nhận một cặp tháng sai hoặc một link không
  // phải Google Sheet, rồi bước tạo file tháng (mục 1.6) làm việc trên tham số rác đó.
  const CA = [
    ['thang truoc khong phai so', 'abc|10|' + LINK_SHEET, /Thang truoc phai la so tu 1 den 12/],
    ['thang truoc ngoai 1..12', '13|1|' + LINK_SHEET, /Thang truoc phai la so tu 1 den 12/],
    ['thang can tao khong phai so', '9|muoi|' + LINK_SHEET, /Thang can tao phai la so tu 1 den 12/],
    ['nhay thang', '3|11|' + LINK_SHEET, /phai lien sau thang truoc/],
    ['lui thang', '10|9|' + LINK_SHEET, /phai lien sau thang truoc/],
    ['thang 12 khong noi sang 1', '12|5|' + LINK_SHEET, /Thang truoc la 12 thi thang can tao phai la 1/],
    ['link khong phai Google Sheet', '9|10|https://example.com/gi-do', /Link thang moi khong phai link Google Sheet/],
    ['thieu phan thu ba', '9|10', /tra-loi phai co du ba phan/]
  ];
  const m = dungMay({});
  for (const ca of CA) {
    const r = chayNut3(m.may, ca[1]);
    dung(r.ma === 1, 'ca "' + ca[0] + '" phải thoát mã 1, nhận được ' + r.ma + ' — cửa này không chặn ai cả');
    dung(ca[2].test(r.ra), 'ca "' + ca[0] + '" thiếu câu báo lỗi đúng: ' + r.ra.slice(-200));
  }
  dung(dsThangMoi(m.cauHinh).length === 0,
    'đã từ chối hết mà vẫn ghi file tham số: ' + dsThangMoi(m.cauHinh).join(', '));

  // Ca hợp lệ: phải đi lọt và ghi đúng một file. Không có ca này thì một cửa
  // "luôn luôn TỪ CHỐI" cũng làm tám ca trên xanh hết.
  const ok = chayNut3(m.may, '9|10|' + LINK_SHEET);
  dung(ok.ma === 3, 'ca hợp lệ phải thoát mã 3 (da ghi tham so, buoc tao file chua bat), nhận được ' + ok.ma);
  dung(/DA HIEU DUNG NHU SAU/.test(ok.ra), 'ca hợp lệ phải in lại ba tham số đã hiểu');
  const ds = dsThangMoi(m.cauHinh);
  dung(ds.length === 1 && /^thang-moi-\d{4}-10\.json$/.test(ds[0]),
    'file tham số phải là thang-moi-<nam>-10.json, đang là: ' + (ds.join(', ') || '(không có file nào)'));

  const hongLienThang = nutHong('3_TAO_FILE_THANG_MOI.bat', (s) =>
    s.replace('} elseif ($mMoi -ne ($mCu + 1)) {', () => '} elseif ($false) {'));
  const dc1 = await doiChungAm('bo cua "thang can tao phai lien sau thang truoc"', async () => {
    const h = dungMay({ thayNut: { '3_TAO_FILE_THANG_MOI.bat': hongLienThang } });
    const r = chayNut3(h.may, '3|11|' + LINK_SHEET);
    if (r.ma !== 1) {
      throw new Error('nhận bừa cặp thang 3 -> 11 (thoát mã ' + r.ma + '), ghi ra '
        + (dsThangMoi(h.cauHinh).join(', ') || 'khong file nao'));
    }
  });

  const hongLink = nutHong('3_TAO_FILE_THANG_MOI.bat', (s) =>
    s.replace("'^https://docs\\.google\\.com/spreadsheets/d/([A-Za-z0-9_-]{20,})'", () => "'^(.+)$'"));
  const dc2 = await doiChungAm('noi cua kiem link cho khop moi thu', async () => {
    const h = dungMay({ thayNut: { '3_TAO_FILE_THANG_MOI.bat': hongLink } });
    const r = chayNut3(h.may, '9|10|https://example.com/gi-do');
    if (r.ma !== 1) throw new Error('nhận bừa link không phải Google Sheet (thoát mã ' + r.ma + ')');
  });
  return CA.length + ' ca tu choi + 1 ca hop le, khong ca tu choi nao ghi file · ' + dc1 + ' · ' + dc2;
});

/* ---------------------------------------------------------------- NÚT 4 --- */

test('N-34 4_CHAY_TOOL.bat: thieu cau hinh va thieu thu vien deu phai chan bang cau tieng Viet', async () => {
  // Hai cửa chưa bài nào chạm: `if not defined CFGDIR` và cửa kiểm `node_modules\exceljs`.
  // (CN-07 của test-dong-goi.js mới đo cửa thứ ba: `if not defined TOOL`.)
  // Cửa thư viện hỏng thì nhân viên nhận nguyên một vệt lỗi thô của Node giữa màn hình đen.
  const a = dungMay({ khongCfg: true, khongMau: true });
  const r1 = chayNut(a.may, '4_CHAY_TOOL.bat');
  dung(r1.ma === 1, 'thiếu cấu hình phải thoát mã 1, nhận được ' + r1.ma);
  dung(/LOI: Khong tim thay file CAU_HINH_VAN_HANH\.json/.test(r1.ra), 'thiếu câu báo lỗi về file cấu hình');
  dung(/1_CAI_DAT_LAN_DAU\.bat/.test(r1.ra), 'phải chỉ đúng nút phải bấm');

  // Máy có mã, có cấu hình, nhưng chưa cài thư viện.
  const b = dungMay({ banMa: '9.9.0', chayThuGia: "require('exceljs');\n" });
  const r2 = chayNut(b.may, '4_CHAY_TOOL.bat');
  dung(r2.ma === 1, 'thiếu thư viện phải thoát mã 1, nhận được ' + r2.ma);
  dung(/LOI: Thieu thu vien cua tool/.test(r2.ra), 'thiếu câu báo lỗi về thư viện: ' + r2.ra.slice(-200));
  dung(!/Cannot find module|node:internal|at Object\./.test(r2.ra), 'lỗi thô của Node lọt ra màn hình người dùng');

  const banHong = nutHong('4_CHAY_TOOL.bat', (s) =>
    s.replace('if not exist "%TOOL%\\node_modules\\exceljs" (', () => 'if exist "%TOOL%\\node_modules\\exceljs" ('));
  const dc = await doiChungAm('roi mat chu  not  o cua kiem thu vien', async () => {
    const h = dungMay({
      banMa: '9.9.0', chayThuGia: "require('exceljs');\n",
      thayNut: { '4_CHAY_TOOL.bat': banHong }
    });
    const r = chayNut(h.may, '4_CHAY_TOOL.bat');
    if (/Cannot find module/.test(r.ra)) {
      throw new Error('loi tho cua Node lot thang ra man hinh nhan vien: '
        + (r.ra.match(/Cannot find module[^\r\n]*/) || [''])[0]);
    }
    if (!/LOI: Thieu thu vien cua tool/.test(r.ra)) throw new Error('khong con cau tieng Viet nao chan lai');
  });
  return 'thieu cau hinh -> ma 1 · thieu thu vien -> ma 1, khong vet loi Node · ' + dc;
});

/* -------------------------------------------------------------- CHẠY ------ */

(async () => {
  let dat = 0, hong = 0;
  console.log('=== BỐN NÚT CỦA NGƯỜI VẬN HÀNH (hình dạng file .bat · cửa chặn chạy thật) ===\n');
  for (const b of BAI) {
    try { const t = await b.fn(); dat++; console.log('ĐẠT   ' + b.ten + (t ? '\n        · ' + t : '')); }
    catch (e) { hong++; console.log('HỎNG  ' + b.ten + '\n   -> ' + e.message); }
  }
  console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · tổng ' + BAI.length + ' ===');
  for (const d of RAC) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* thư mục tạm, kệ */ } }
  process.exit(hong ? 1 : 0);
})().catch((e) => { console.error('HỎNG TOÀN BỘ: ' + e.stack); process.exit(1); });
