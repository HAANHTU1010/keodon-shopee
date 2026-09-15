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
 * Cái bẫy này đã được ghi trong `DONG_GOI_GIAO_USER.md` từ trước mà vẫn dính lại,
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

/**
 * YC-27 / YC-40.1: cách gọi người dùng cũ (đổi thành "user" ở YC-27) không được còn trong bất cứ câu nào
 * tool in ra, nhắn, ghi nhật ký.
 *
 * Vì sao phải có bài tự quét thay vì tin một lần grep: lần grep ở Đợt 1 báo 0 mà vẫn sót một chỗ, vì
 * chữ bị NGẮT qua hai dòng chú thích: nửa đầu ở cuối một dòng, nửa sau ở đầu dòng kế. Grep theo dòng không thấy.
 * Phép quét dưới đây bỏ dấu, gộp mọi khoảng trắng và dấu chú thích nằm giữa hai chữ, và đọc cả dạng
 * Unicode tổ hợp (NFD) — ba cách một chuỗi có thể né grep.
 */
function boDau(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
// Dựng biểu thức từ mảnh ghép, để chính file này không tự dính phép quét của nó.
const RX_CHU_CU = new RegExp('nh' + 'an' + '(?:[\\s/*#;]|\\brem\\b|\\becho\\b)*' + 'vi' + 'en');
function quetChuCu(noiDung) {
  const t = boDau(noiDung);
  const m = t.match(RX_CHU_CU);
  if (!m) return null;
  return t.slice(0, m.index).split('\n').length;       // số dòng đầu tiên dính
}

test('N-35 không file nào trong src/, node/, bat/ còn cách gọi người dùng cũ của YC-27 — kể cả bị ngắt dòng hay dạng NFD', () => {
  const KHO = path.resolve(__dirname, '..');
  const xau = [];
  let soFile = 0;
  (function di(d) {
    for (const t of fs.readdirSync(d)) {
      if (t === 'node_modules' || t === 'fixtures') continue;
      const p = path.join(d, t);
      if (fs.statSync(p).isDirectory()) { di(p); continue; }
      if (!/\.(js|gs|bat|json|md|txt)$/i.test(t)) continue;
      soFile++;
      const dong = quetChuCu(fs.readFileSync(p, 'utf8'));
      if (dong) xau.push(path.relative(KHO, p) + ':' + dong);
    }
  })(KHO + path.sep + 'src');
  (function di(d) {
    for (const t of fs.readdirSync(d)) {
      const p = path.join(d, t);
      if (fs.statSync(p).isDirectory()) { if (t !== 'fixtures') di(p); continue; }
      if (!/\.(js|gs|bat|json|md|txt)$/i.test(t)) continue;
      soFile++;
      const dong = quetChuCu(fs.readFileSync(p, 'utf8'));
      if (dong) xau.push(path.relative(KHO, p) + ':' + dong);
    }
  })(KHO + path.sep + 'node');
  for (const t of fs.readdirSync(path.join(KHO, 'bat'))) {
    soFile++;
    const dong = quetChuCu(fs.readFileSync(path.join(KHO, 'bat', t), 'utf8'));
    if (dong) xau.push('bat/' + t + ':' + dong);
  }
  if (xau.length) throw new Error('còn chữ cũ ở: ' + xau.join(', '));

  // ĐỐI CHỨNG ÂM — bốn cách một chuỗi né được grep theo dòng, phép quét phải bắt đủ cả bốn.
  const W = 'nh' + '\u00e2n vi' + '\u00ean';                 // dạng NFC có dấu
  const ca = [
    ['câu in ra có dấu', "console.log('Goi cho may " + W + "')"],
    ['dạng Unicode tổ hợp NFD', "throw new Error('" + W.normalize('NFD') + "')"],
    ['bị ngắt qua hai dòng chú thích', '// neu khong thi nh\u00e2n\n  // vi\u00ean se di sua'],
    ['không dấu, viết hoa, trong echo', 'echo   Goi giao cho may ' + 'NH' + 'AN   VI' + 'EN']
  ];
  const mu = ca.filter(([, v]) => !quetChuCu(v)).map(([n]) => n);
  if (mu.length) throw new Error('phép quét MÙ với: ' + mu.join(', '));
  if (quetChuCu("console.log('Goi cho may user')")) throw new Error('phép quét bắt oan câu sạch');
  return soFile + ' file sạch · đối chứng âm: bắt đủ 4/4 cách né grep, không bắt oan câu sạch';
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
 * Bài học TM-10 (test-tao-thang-moi.js) và cái bẫy `!` của bước 4 là cùng một họ: mọi bài dương tính đều
 * xanh vì phép kiểm nào cũng nói OK. Chỉ có đối chứng âm bắt được.
 *
 * Nên phần này làm đúng một việc: với mỗi CỬA QUYẾT ĐỊNH ĐI TIẾP HAY DỪNG, dựng
 * một máy user giả trong thư mục tạm, CHẠY THẬT nút bấm bằng cmd.exe, rồi
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
// Chuỗi MỒI, không phải link thật. Dài đúng 24 ký tự ID — vừa đủ để nút 3 nhận là link Google Sheet
// hợp lệ (ngưỡng 20), vừa dưới ngưỡng 25 mà INV-7 dùng để phát hiện link file tháng THẬT lọt vào mã.
const LINK_SHEET = 'https://docs.google.com/spreadsheets/d/MOI_KHONG_PHAI_LINK_THAT/edit';

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
 * Máy user giả: bốn nút ở cấp gốc + thư mục `Cấu hình` bên trong.
 *   o.thayNut    {tên nút: đường dẫn bản thay}  — cắm bản đã dựng khuyết tật
 *   o.nut2Gia    true = thay 2_CAP_NHAT.bat bằng nút giả thoát 0 (khỏi ra mạng)
 *   o.googleSheet / o.capNhat   ghi đè hai mục của file cấu hình
 *   o.cfgTho     chuỗi thô ghi thẳng vào file cấu hình (dựng ca JSON hỏng)
 *   o.khongCfg   true = không tạo file cấu hình
 *   o.khongMau   true = không tạo bản mẫu
 *   o.banMa      số phiên bản bộ mã dựng sẵn trong máy (bỏ trống = máy chưa có mã)
 *   o.chayThuGia nội dung file node/chay-thu.js giả
 *   o.tenMay     phần tên thư mục máy (vd có dấu `!` — YC-41 việc 5)
 *   o.coThuVien  true = dựng sẵn `node_modules\exceljs` (nút 4 mới đi tới bước chạy)
 *   o.pingGia    phản hồi `ping` giả trả VỀ ĐƯỢC (mặc định: ping luôn hỏng, không ra mạng)
 *   o.dauVanTay  mã bản dựng mà `node/dau-van-tay.js` giả trên máy trả về
 */
function dungMay(o) {
  o = o || {};
  const may = tamMoi(o.tenMay || 'may');
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
  if (o.linkThang) cfg.link_thang = o.linkThang;
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
      + (o.pingGia ? '  ping(){return Promise.resolve(' + JSON.stringify(o.pingGia) + ');}}\n'
        : '  ping(){return Promise.reject(new Error("GIA LAP: bai test khong goi ra mang"));}}\n')
      + 'module.exports={WebAppGoogleSheet:W};\n', 'utf8');
    if (o.dauVanTay) {
      fs.writeFileSync(path.join(tool, 'node', 'dau-van-tay.js'),
        'module.exports={tinh:()=>({tong:' + JSON.stringify(o.dauVanTay) + '})};\n', 'utf8');
    }
    if (o.coThuVien) fs.mkdirSync(path.join(tool, 'node_modules', 'exceljs'), { recursive: true });
    // Nút 3 (YC-34) chạy MÃ THẬT: script nút 3 và phía máy của Web App. Mạng vẫn không ra được — ca nào cần Web App
    // thì nạp `https` giả qua NODE_OPTIONS (xem `SHIM_HTTPS_NUT3`).
    if (o.nut3That) {
      ['nut-3-thang-moi.js', 'gsheet-web-app.js'].forEach((t) =>
        fs.copyFileSync(path.join(__dirname, t), path.join(tool, 'node', t)));
    }
  }
  fs.mkdirSync(path.join(may, '1_THA_FILE_XUAT', 'Shopee mall', DA_XU_LY), { recursive: true });
  return { may: may, cfgTep: path.join(ch, 'CAU_HINH_VAN_HANH.json'), tool: tool, cauHinh: ch };
}

function chayNut(may, ten, themTv, giay) {
  const r = spawnSync('cmd.exe', ['/c', path.join(may, ten), '/tu-dong'].concat(themTv || []),
    { cwd: may, encoding: 'latin1', timeout: (giay || 180) * 1000 });
  return { ma: r.status, tinHieu: r.signal, ra: String(r.stdout || '') + String(r.stderr || '') };
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

  // Cái bẫy cũ có HAI nửa: `setlocal enabledelayedexpansion` + dấu `!` trong đoạn JS. Từ 2.7.0 (YC-41 việc 5) nút 1 bỏ nửa
  // đầu, nên cắm riêng nửa sau không còn dựng lại được khuyết tật — phải cắm ĐỦ cả hai, như bản 2.5.0 từng có.
  const banHong = nutHong('1_CAI_DAT_LAN_DAU.bat', (s) => {
    if (s.split('setlocal\r\n').length !== 2) throw new Error('KHÔNG CẮM ĐƯỢC nửa "setlocal enabledelayedexpansion" — mã nút 1 đã đổi, sửa mốc');
    return s.replace('setlocal\r\n', () => 'setlocal enabledelayedexpansion\r\n').replace(
      "var t=[];var u=String(g.web_app_url||'').trim();var m=String(g.chuoi_bi_mat||'').trim();"
      + "if(u.length===0){t.push('web_app_url');}if(m.length===0){t.push('chuoi_bi_mat');}",
      () => "var t=[];if(!String(g.web_app_url||'').trim()){t.push('web_app_url');}"
        + "if(!String(g.chuoi_bi_mat||'').trim()){t.push('chuoi_bi_mat');}");
  });
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

  // Như N-30: từ 2.7.0 nút 1 không bật enabledelayedexpansion, nên phải cắm ĐỦ hai nửa của cái bẫy cũ mới dựng lại được nó.
  const banHong = nutHong('1_CAI_DAT_LAN_DAU.bat', (s) => {
    if (s.split('setlocal\r\n').length !== 2) throw new Error('KHÔNG CẮM ĐƯỢC nửa "setlocal enabledelayedexpansion" — mã nút 1 đã đổi, sửa mốc');
    return s.replace('setlocal\r\n', () => 'setlocal enabledelayedexpansion\r\n').replace(
      "if(a.length>0&&b.length>0){console.log('      Kho ma: '+a+'/'+b);process.exit(0);}"
      + "var t=[];if(a.length===0){t.push('chu_tai_khoan');}if(b.length===0){t.push('ten_repo');}",
      () => "if(a&&b){console.log('      Kho ma: '+a+'/'+b);process.exit(0);}"
        + "var t=[];if(!a){t.push('chu_tai_khoan');}if(!b){t.push('ten_repo');}");
  });
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
  // Hỏng thì máy user TỰ LÙI về sau bản đang chạy mỗi lần bấm nút cập nhật, và
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
      throw new Error('máy 9.9.0 bị kéo lùi xuống ' + p.version + ' — user nhận bản cũ hơn bản đang chạy');
    }
  });
  return 'may 9.9.0 + kho 2.0.0 -> thoat ma 3, package.json va src/ y nguyen · ' + dc;
});

/* ---------------------------------------------------------------- NÚT 3 --- */

/*
 * YC-34 (D-45): nút 3 hỏi 7 trường, 2 chế độ. Hai tầng test:
 *   · N-33 chạy THẬT `3_TAO_FILE_THANG_MOI.bat` bằng cmd.exe trên máy giả — tầng ống nối: tìm bộ mã + Node, chuyển
 *     `/tra-loi` sang script, mã thoát và câu cuối, máy còn mã cũ phải bảo cập nhật.
 *   · N-36…N-42 chạy `node/nut-3-thang-moi.js` TRONG TIẾN TRÌNH — tầng nghiệp vụ: bảy trường, từng trường sai, khoảng
 *     trắng, ghi đè khóa, chế độ 1 lệch K. Web App ở tầng này là lớp giả tiêm vào (`tc.WebApp`); đường thật qua Web App
 *     giả chạy mã `.gs` thật nằm ở `test-tao-thang-moi-web.js` TM-W-19…22.
 * Đối chứng âm tầng nghiệp vụ nạp BẢN SỬA của chính file nút 3 trong bộ nhớ (`nut3Sua`), không ghi file nào ra đĩa.
 */
const Module = require('module');
const TEP_NUT3 = path.join(__dirname, 'nut-3-thang-moi.js');
const NGUON_NUT3 = fs.readFileSync(TEP_NUT3, 'utf8');
const NUT3 = require('./nut-3-thang-moi');
const PHIEN_BAN_MAY = require('./gsheet-web-app').PHIEN_BAN;

/**
 * Nạp bản SỬA của nút 3: `doi` = [[mốc, thay], …], mỗi mốc phải có ĐÚNG MỘT chỗ trong mã — không thì hỏng to ở đây
 * (mã đã đổi, sửa mốc), chứ không lặng lẽ thành một đối chứng âm không cắm được gì.
 */
function nut3Sua(doi) {
  let src = NGUON_NUT3;
  for (const [moc, thay] of doi) {
    const n = src.split(moc).length - 1;
    if (n !== 1) {
      throw new Error('KHÔNG CẮM ĐƯỢC KHUYẾT TẬT vào nut-3-thang-moi.js — mốc cần 1 chỗ, tìm được ' + n + ': "' +
        moc.slice(0, 80) + '". Sửa lại bài test, đừng bỏ qua.');
    }
    src = src.split(moc).join(thay);
  }
  const m = new Module(TEP_NUT3, module);
  m.filename = TEP_NUT3;
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(src, TEP_NUT3);
  return m.exports;
}

// Link giả DỰNG LÚC CHẠY: một dòng mã chứa sẵn `…/spreadsheets/d/` + mã ≥ 25 ký tự là INV-7 báo "link thật lọt vào mã".
const TIEN_SHEET = 'https://docs.google.com/spreadsheets/d/';
const idGia = (nhan) => ('ID_GIA_' + nhan + '_').padEnd(30, 'x');
const LK = (nhan, duoi) => TIEN_SHEET + idGia(nhan) + (duoi == null ? '/edit#gid=0' : duoi);
const TL_CHE_DO_2 = () => ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '2', 'c'];

/** Thư mục vận hành giả cho tầng nghiệp vụ. `o.tho` = chuỗi ghi thẳng làm file cấu hình. */
function dungVh3(o) {
  o = o || {};
  const vh = tamMoi('vh3');
  const ch = path.join(vh, CAU_HINH);
  fs.mkdirSync(ch, { recursive: true });
  const cfg = {
    thu_muc_tha_file: '1_THA_FILE_XUAT',
    google_sheet: { bat: true, web_app_url: LINK_MOI, chuoi_bi_mat: BI_MAT_MOI },
    link_thang: o.linkThang || { '2026-08': LK('T8'), '2026-09': LK('T9') },
    cap_nhat: { chu_tai_khoan: 'ai-do', ten_repo: 'kho-nao-do', nhanh: 'main' }
  };
  let s = o.tho != null ? o.tho : JSON.stringify(cfg, null, 2) + '\n';
  if (o.crlf) s = s.replace(/\r?\n/g, '\r\n');
  const tep = path.join(ch, 'CAU_HINH_VAN_HANH.json');
  fs.writeFileSync(tep, (o.bom ? '\uFEFF' : '') + s, 'utf8');
  return { vh, ch, tep };
}

async function chay3(v, traLoi, tc) {
  let ra = '';
  const mod = (tc && tc.mod) || NUT3;
  const ma = await mod.chay(Object.assign({
    vh: v.vh, traLoi: traLoi, mau: false, ra: (s) => { ra += s; }, thoiDiem: '2026-09-20T03:00:00Z'
  }, (tc && tc.them) || {}));
  return { ma, ra };
}

const tho = (t) => fs.readFileSync(t);
const cungByte = (a, b) => Buffer.compare(a, b) === 0;
function nhatKy3(v) {
  const d = path.join(v.ch, NHAT_KY);
  return fs.existsSync(d) ? fs.readdirSync(d).map((t) => fs.readFileSync(path.join(d, t), 'utf8')).join('\n') : '';
}

/** Web App GIẢ cho tầng nghiệp vụ: `kichBan(thamSo, tuyChon)` quyết định phản hồi. Ghi lại tham số mọi lần gọi. */
function webGia(kichBan, nhat) {
  return class WebGia {
    constructor(g) {
      if (!g || !String(g.web_app_url || '').trim()) throw new Error('Bật ghi Google Sheet nhưng thiếu web_app_url');
      this.canhBaoBanDung = [];
    }
    cheThem() { }
    chePhu(s) { return String(s); }
    async taoThangMoi(ts, tc) { if (nhat) nhat.push(ts); return kichBan(ts, tc || {}); }
  };
}
const KIEM8 = (lech) => ['K-1', 'K-2', 'K-3', 'K-4', 'K-5', 'K-6', 'K-7', 'K-8'].map((ma) =>
  ({ ma: ma, ten: 'phép ' + ma, dat: (lech || []).indexOf(ma) < 0, chiTiet: (lech || []).indexOf(ma) < 0 ? 'khớp' : 'lệch 999000' }));

/**
 * `https` GIẢ nạp qua NODE_OPTIONS cho N-33 ca chế độ 1: `ping` trả đúng phiên bản máy, `taoThangMoi` trả tự kiểm lệch
 * K-7. Không một byte nào ra mạng thật.
 */
function shimHttpsNut3() {
  const tep = path.join(tamMoi('shim3'), 'https-gia.js');
  fs.writeFileSync(tep, [
    "'use strict';",
    "const { EventEmitter } = require('events');",
    'const PB = ' + JSON.stringify(PHIEN_BAN_MAY) + ';',
    "const KIEM = ['K-1','K-2','K-3','K-4','K-5','K-6','K-7','K-8'].map((ma) => ({ ma: ma, ten: 'phép ' + ma, dat: ma !== 'K-7', chiTiet: ma === 'K-7' ? '999000' : 'khớp' }));",
    'function tra(obj, cb) {',
    "  const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; res.setEncoding = () => res; res.resume = () => res;",
    "  setImmediate(() => { cb(res); setImmediate(() => { res.emit('data', JSON.stringify(obj)); res.emit('end'); }); });",
    '}',
    'const gia = {',
    '  request(opt, cb) {',
    "    const req = new EventEmitter(); let than = '';",
    '    req.write = (d) => { than += d; return true; }; req.destroy = () => {}; req.setTimeout = () => req;',
    '    req.end = () => {',
    '      const g = JSON.parse(than);',
    "      if (g.hanhDong === 'ping') return tra({ ok: true, phienBan: PB }, cb);",
    "      if (g.hanhDong === 'taoThangMoi') return tra({ ok: false, loi: 'TU_KIEM_LECH', xong: true, kiem: KIEM, nhatKy: ['B3 · Dọn — xong'], thongBao: 'TỰ KIỂM LỆCH 1/8 phép — K-7 (999000).' }, cb);",
    "      return tra({ ok: false, loi: 'HANH_DONG_LA', thongBao: 'giả lập' }, cb);",
    '    };',
    '    return req;',
    '  },',
    "  get() { throw new Error('https giả: không có chuyển hướng'); }",
    '};',
    "for (const t of ['https', 'node:https']) require.cache[t] = { id: t, filename: t, loaded: true, exports: gia, children: [], paths: [] };"
  ].join('\n'), 'utf8');
  // NODE_OPTIONS đọc `` trong chuỗi có nháy kép là ký tự thoát: đưa đường dẫn kiểu `/`, Windows vẫn hiểu.
  return tep.split(path.sep).join('/');
}

/** Chạy nút 3 thật bằng cmd.exe. Câu trả lời gói trong file .bat trung gian (dấu `|` là ống của cmd, xem chayNut3). */
function chayNut3Moi(may, traLoiDs, env) {
  const w = path.join(tamMoi('goi3'), 'goi_nut_3.bat');
  fs.writeFileSync(w, '@echo off\r\ncall "' + path.join(may, '3_TAO_FILE_THANG_MOI.bat')
    + '" /tu-dong /tra-loi "' + traLoiDs.join('|') + '"\r\nexit /b %ERRORLEVEL%\r\n', 'ascii');
  const r = spawnSync('cmd.exe', ['/c', w], {
    cwd: may, encoding: 'utf8', timeout: 120000, env: Object.assign({}, process.env, { TM_TRA_LOI: '' }, env || {})
  });
  return { ma: r.status, ra: String(r.stdout || '') + String(r.stderr || '') };
}

test('N-33 3_TAO_FILE_THANG_MOI.bat chạy thật: chuyển /tra-loi sang nút 3, mã thoát + câu cuối đúng từng ca, máy còn mã cũ thì bảo cập nhật', async () => {
  // (a) chế độ 2 hợp lệ, link có khoảng trắng → mã 0, ghi đúng khóa, không in link
  const a = dungMay({ banMa: '9.9.0', nut3That: true, linkThang: { '2026-09': LK('T9') } });
  const ra = chayNut3Moi(a.may, ['9', '2026', LK('T9'), '10', '2026', '  ' + LK('T10') + '  ', '2', 'c']);
  dung(ra.ma === 0, 'chế độ 2 hợp lệ phải thoát mã 0, nhận được ' + ra.ma + ': ' + ra.ra.slice(-300));
  dung(/DA GHI link thang 2026-10\./.test(ra.ra) && /XONG\. Doc dong/.test(ra.ra), 'thiếu câu DA GHI / câu XONG: ' + ra.ra.slice(-300));
  const ca = docCfg(a.cfgTep);
  dung(ca.link_thang['2026-10'] === LK('T10'), 'link_thang["2026-10"] không đúng link đã cắt khoảng trắng');
  dung(ca.google_sheet.chuoi_bi_mat === BI_MAT_MOI && ca.link_thang['2026-09'] === LK('T9'), 'khóa khác của cấu hình bị đụng');
  dung(ra.ra.indexOf(idGia('T10')) < 0 && ra.ra.indexOf(idGia('T9')) < 0, 'INV-7: mã file tháng lọt ra màn hình');
  // Đề bài bỏ file thang-moi-<yyyy-MM>.json — chấm ở tầng NÚT BẤM thật, vì bản cũ sinh file đó ngay trong .bat.
  dung(dsThangMoi(a.cauHinh).length === 0, 'nút bấm vẫn sinh file thang-moi-*.json: ' + dsThangMoi(a.cauHinh).join(', '));

  // (b) sai ba lượt → mã 1, file cấu hình y nguyên TỪNG BYTE
  const b = dungMay({ banMa: '9.9.0', nut3That: true });
  const tb = tho(b.cfgTep);
  const rb = chayNut3Moi(b.may, ['13', '9', '26', '9', '2026', 'https://example.com/khong-phai-sheet']);
  dung(rb.ma === 1, 'sai ba lượt phải thoát mã 1, nhận được ' + rb.ma);
  dung(/LỖI \[1\/7\]/.test(rb.ra) && /LỖI \[2\/7\]/.test(rb.ra) && /LỖI \[3\/7\]/.test(rb.ra) && /CHUA LAM GI/.test(rb.ra),
    'phải có đủ ba dòng LỖI [1/7], [2/7], [3/7] và câu CHUA LAM GI: ' + rb.ra.slice(-400));
  dung(cungByte(tho(b.cfgTep), tb), 'sai ba lượt mà CAU_HINH_VAN_HANH.json đã bị ghi');

  // (c) chế độ 1, Web App trả TỰ KIỂM LỆCH (https giả qua NODE_OPTIONS) → mã 3, link không đổi
  const shim = shimHttpsNut3();
  const c = dungMay({ banMa: '9.9.0', nut3That: true, linkThang: { '2026-09': LK('T9') } });
  const tc = tho(c.cfgTep);
  const rc = chayNut3Moi(c.may, ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '1', 'c'], { NODE_OPTIONS: '--require "' + shim + '"' });
  dung(rc.ma === 3, 'chế độ 1 tự kiểm lệch phải thoát mã 3, nhận được ' + rc.ma + ': ' + rc.ra.slice(-400));
  dung(/K-7 LỆCH/.test(rc.ra) && /KHONG TAO DUOC THANG MOI/.test(rc.ra), 'thiếu dòng K-7 LỆCH / câu KHONG TAO DUOC: ' + rc.ra.slice(-400));
  dung(cungByte(tho(c.cfgTep), tc), 'tự kiểm lệch mà CAU_HINH_VAN_HANH.json đã bị ghi');

  // (d) máy còn bộ mã CŨ (chưa có nut-3-thang-moi.js) → mã 1, bảo bấm nút 2, không vệt lỗi Node
  const d = dungMay({ banMa: '2.5.0' });
  const rd = chayNut3Moi(d.may, TL_CHE_DO_2());
  dung(rd.ma === 1, 'mã cũ phải thoát mã 1, nhận được ' + rd.ma);
  dung(/BAN CU, CHUA CO NUT 3 MOI/.test(rd.ra) && /2_CAP_NHAT\.bat/.test(rd.ra), 'phải bảo bấm 2_CAP_NHAT.bat: ' + rd.ra.slice(-300));
  dung(!/Cannot find module|node:internal/.test(rd.ra), 'vệt lỗi thô của Node lọt ra màn hình');

  const hong1 = nutHong('3_TAO_FILE_THANG_MOI.bat', (s) => s.replace('set "TM_TRA_LOI=%~2"', () => 'set "TM_TRA_LOI_BO=%~2"'));
  const dc1 = await doiChungAm('nut bam khong chuyen /tra-loi sang script', async () => {
    const h = dungMay({ banMa: '9.9.0', nut3That: true, thayNut: { '3_TAO_FILE_THANG_MOI.bat': hong1 } });
    const r = chayNut3Moi(h.may, TL_CHE_DO_2());
    if (r.ma !== 0 || docCfg(h.cfgTep).link_thang['2026-10'] !== LK('T10')) throw new Error('câu trả lời không tới script, thoát mã ' + r.ma);
  });
  const hong2 = nutHong('3_TAO_FILE_THANG_MOI.bat', (s) =>
    s.replace('if exist "%TOOL_GOC%\\node\\nut-3-thang-moi.js" set "TOOL=%TOOL_GOC%"', () => 'set "TOOL=%TOOL_GOC%"'));
  const dc2 = await doiChungAm('bo cua kiem ma cu', async () => {
    const h = dungMay({ banMa: '2.5.0', thayNut: { '3_TAO_FILE_THANG_MOI.bat': hong2 } });
    const r = chayNut3Moi(h.may, TL_CHE_DO_2());
    if (!/BAN CU, CHUA CO NUT 3 MOI/.test(r.ra)) throw new Error('không còn câu bảo cập nhật; ' + ((r.ra.match(/Cannot find module[^\r\n]*/) || ['?'])[0]));
  });
  const hongFileThamSo = nutHong('3_TAO_FILE_THANG_MOI.bat', (s) => s.replace('rem ---- 4. Chay ---', () =>
    'echo {} > "%CFGDIR%\\thang-moi-2026-10.json"\r\nrem ---- 4. Chay ---'));
  const dcTs = await doiChungAm('nut bam lai sinh file thang-moi-*.json', async () => {
    const h = dungMay({ banMa: '9.9.0', nut3That: true, thayNut: { '3_TAO_FILE_THANG_MOI.bat': hongFileThamSo } });
    chayNut3Moi(h.may, TL_CHE_DO_2());
    if (dsThangMoi(h.cauHinh).length) throw new Error('có ' + dsThangMoi(h.cauHinh).join(', '));
  });
  const hong3 = nutHong('3_TAO_FILE_THANG_MOI.bat', (s) => s.replace(') else if "%MA%"=="3" (', () => ') else if "%MA%"=="33" ('));
  const dc3 = await doiChungAm('ma thoat 3 khong con cau KHONG TAO DUOC', async () => {
    const h = dungMay({ banMa: '9.9.0', nut3That: true, thayNut: { '3_TAO_FILE_THANG_MOI.bat': hong3 } });
    const r = chayNut3Moi(h.may, ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '1', 'c'], { NODE_OPTIONS: '--require "' + shim + '"' });
    if (!/KHONG TAO DUOC THANG MOI/.test(r.ra)) throw new Error('mã 3 in câu khác: ' + ((r.ra.match(/LOI KHONG DOAN TRUOC[^\r\n]*/) || ['?'])[0]));
  });
  return 'chế độ 2 → mã 0 · sai 3 lượt → mã 1, cấu hình y nguyên · chế độ 1 lệch K-7 → mã 3, cấu hình y nguyên · mã cũ → bảo nút 2 · '
    + dc1 + ' · ' + dc2 + ' · ' + dc3 + ' · ' + dcTs;
});

/**
 * 2.7.1 — mã thoát 6 của nút 3: máy mất đường trả lời của `taoThangMoi`, đọc lại cờ thấy Google VẪN ĐANG CHẠY. `https` giả (qua
 * NODE_OPTIONS): `ping` đúng bản · `taoThangMoi` đứt kết nối · `coTaoThang` trả `dangChay: true`, cờ B4. Không một byte ra mạng thật.
 */
function shimHttpsNut3DangChay() {
  return shimHttpsNut3Co({ dangChay: true, coKhoiTao: 'DANG_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B4' });
}

/** Như trên, phản hồi `coTaoThang` tùy ca (YC-45: `DA_KHOI_TAO` đúng tháng → máy kết luận DA_CHAY_XONG). */
function shimHttpsNut3Co(coTaoThang) {
  const co = Object.assign({ ok: true, hanhDong: 'coTaoThang', tenFileMoi: 'THANG-10-2026-KINH-DOANH' }, coTaoThang);
  const tep = path.join(tamMoi('shim3dc'), 'https-gia.js');
  fs.writeFileSync(tep, [
    "'use strict';",
    "const { EventEmitter } = require('events');",
    'const PB = ' + JSON.stringify(PHIEN_BAN_MAY) + ';',
    'function tra(obj, cb) {',
    "  const res = new EventEmitter(); res.statusCode = 200; res.headers = {}; res.setEncoding = () => res; res.resume = () => res;",
    "  setImmediate(() => { cb(res); setImmediate(() => { res.emit('data', JSON.stringify(obj)); res.emit('end'); }); });",
    '}',
    'const gia = {',
    '  request(opt, cb) {',
    "    const req = new EventEmitter(); let than = '';",
    '    req.write = (d) => { than += d; return true; }; req.destroy = () => {}; req.setTimeout = () => req;',
    '    req.end = () => {',
    '      const g = JSON.parse(than);',
    "      if (g.hanhDong === 'ping') return tra({ ok: true, phienBan: PB }, cb);",
    "      if (g.hanhDong === 'taoThangMoi') { setImmediate(() => req.emit('error', new Error('socket hang up'))); return; }",
    "      if (g.hanhDong === 'coTaoThang') return tra(Object.assign({ thang: g.thang }, " + JSON.stringify(co) + "), cb);",
    "      return tra({ ok: false, loi: 'HANH_DONG_LA', thongBao: 'giả lập' }, cb);",
    '    };',
    '    return req;',
    '  },',
    "  get() { throw new Error('https giả: không có chuyển hướng'); }",
    '};',
    "for (const t of ['https', 'node:https']) require.cache[t] = { id: t, filename: t, loaded: true, exports: gia, children: [], paths: [] };"
  ].join('\n'), 'utf8');
  return tep.split(path.sep).join('/');
}

test('N-46 3_TAO_FILE_THANG_MOI.bat mã thoát 6 (2.7.1): Google VẪN ĐANG CHẠY sau khi máy mất đường trả lời → câu cuối "CHUA PHAI THAT BAI", không "KHONG TAO DUOC", cấu hình y nguyên', async () => {
  // Chấm BẢN GỐC `bat/` của kho (quyết định 13/9: `bat/` là gốc, `03_VAN_HANH/` là bản cài đồng bộ bằng `dong-goi.js
  // --dong-bo-van-hanh`). Nhánh mã 6 là của 2.7.1 — bản cài chỉ có sau lượt đồng bộ; DG-06 (test-dong-goi) canh hai bản khớp byte.
  const NUT3_GOC = path.join(__dirname, '..', 'bat', '3_TAO_FILE_THANG_MOI.bat');
  const shim = shimHttpsNut3DangChay();
  const TL = ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '1', 'c'];
  const cham = (nut) => {
    const h = dungMay({ banMa: '9.9.0', nut3That: true, linkThang: { '2026-09': LK('T9') }, thayNut: { '3_TAO_FILE_THANG_MOI.bat': nut } });
    const t0 = tho(h.cfgTep);
    const r = chayNut3Moi(h.may, TL, { NODE_OPTIONS: '--require "' + shim + '"' });
    if (r.ma !== 6) throw new Error('phải thoát mã 6, nhận được ' + r.ma + ': ' + r.ra.slice(-400));
    if (!/CHƯA PHẢI THẤT BẠI — GOOGLE CÓ THỂ VẪN ĐANG CHẠY\./.test(r.ra) || !/Google VẪN ĐANG CHẠY \(cờ BUOC_DA_XONG hiện là B4\)/.test(r.ra)) {
      throw new Error('script nút 3 thiếu tiêu đề / câu Google vẫn đang chạy: ' + r.ra.slice(-400));
    }
    if (!/CHUA PHAI THAT BAI - Google co the van dang chay\./.test(r.ra) || !/DUNG bam lai ngay: doi 5 phut roi bam lai file nay, chon che do 1\./.test(r.ra) ||
      !/link thang KHONG doi\./.test(r.ra)) {
      throw new Error('nút bấm thiếu ba dòng mã 6: ' + ((r.ra.match(/LOI KHONG DOAN TRUOC[^\r\n]*/) || [r.ra.slice(-200)])[0]));
    }
    if (/KHONG TAO DUOC|KHÔNG TẠO ĐƯỢC|LOI KHONG DOAN TRUOC/.test(r.ra)) throw new Error('mã 6 mà vẫn in câu thất bại');
    if (!cungByte(tho(h.cfgTep), t0)) throw new Error('mã 6 mà CAU_HINH_VAN_HANH.json đã bị ghi');
    if (r.ra.indexOf(idGia('T10')) >= 0 || r.ra.indexOf(idGia('T9')) >= 0 || r.ra.indexOf(BI_MAT_MOI) >= 0 || r.ra.indexOf(LINK_MOI) >= 0) {
      throw new Error('INV-7: mã file / chuỗi bí mật / link Web App lọt ra màn hình');
    }
    return r;
  };
  const r = cham(NUT3_GOC);
  const goc = fs.readFileSync(NUT3_GOC, 'latin1');
  const boNhanh6 = goc.replace(/\) else if "%MA%"=="6" \(\r\n(?: {2}echo[^\r\n]*\r\n)+/, '');
  if (boNhanh6 === goc) throw new Error('KHÔNG CẮM ĐƯỢC KHUYẾT TẬT vào bat/3_TAO_FILE_THANG_MOI.bat — mã đã đổi, sửa lại bài test, đừng bỏ qua.');
  const tepHong = path.join(tamMoi('hong6'), '3_TAO_FILE_THANG_MOI.bat');
  fs.writeFileSync(tepHong, boNhanh6, 'latin1');
  const dc = await doiChungAm('nut bam khong co nhanh ma 6', async () => { cham(tepHong); });
  return 'mã 6 · "' + (r.ra.match(/CHUA PHAI THAT BAI[^\r\n]*/) || [''])[0] + '" · cấu hình y nguyên · ' + dc;
});

test('N-47 3_TAO_FILE_THANG_MOI.bat mã thoát 5 (YC-45): máy mất đường trả lời, đọc lại cờ thấy Google ĐÃ tạo xong đúng tháng → thoát 5, khung "GOOGLE DA TAO XONG … chon CHE DO 2", KHÔNG còn "KHONG TAO DUOC THANG", cấu hình y nguyên', async () => {
  const NUT3_GOC = path.join(__dirname, '..', 'bat', '3_TAO_FILE_THANG_MOI.bat');
  const shim = shimHttpsNut3Co({ dangChay: false, coKhoiTao: 'DA_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B7', thangCo: '2026-10', thangCoTho: '2026-10' });
  const TL = ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '1', 'c'];
  const cham = (nut3Script) => {
    const h = dungMay({ banMa: '9.9.0', nut3That: true, linkThang: { '2026-09': LK('T9') }, thayNut: { '3_TAO_FILE_THANG_MOI.bat': NUT3_GOC } });
    if (nut3Script) fs.writeFileSync(path.join(h.tool, 'node', 'nut-3-thang-moi.js'), nut3Script, 'utf8');
    const t0 = tho(h.cfgTep);
    const r = chayNut3Moi(h.may, TL, { NODE_OPTIONS: '--require "' + shim + '"' });
    if (r.ma !== 5) throw new Error('phải thoát mã 5, nhận được ' + r.ma + ': ' + r.ra.slice(-300));
    if (/KHONG TAO DUOC THANG|KHÔNG TẠO ĐƯỢC THÁNG/.test(r.ra)) throw new Error('mã 5 mà màn hình vẫn có "KHONG TAO DUOC THANG"');
    if (!/GOOGLE DA TAO XONG THANG MOI/.test(r.ra) || !/chon CHE DO 2/.test(r.ra)) throw new Error('nút bấm thiếu khung mã 5: ' + r.ra.slice(-300));
    if (!/Google ĐÃ chạy xong và tự kiểm đạt/.test(r.ra)) throw new Error('script nút 3 thiếu câu Google đã chạy xong');
    if (!cungByte(tho(h.cfgTep), t0)) throw new Error('mã 5 mà CAU_HINH_VAN_HANH.json đã bị ghi');
    if (r.ra.indexOf(idGia('T10')) >= 0 || r.ra.indexOf(idGia('T9')) >= 0 || r.ra.indexOf(BI_MAT_MOI) >= 0 || r.ra.indexOf(LINK_MOI) >= 0) {
      throw new Error('INV-7: mã file / chuỗi bí mật / link Web App lọt ra màn hình');
    }
    return r;
  };
  const r = cham(null);
  const goc = fs.readFileSync(path.join(__dirname, 'nut-3-thang-moi.js'), 'utf8');
  const moc = "      if (e && e.maKeodon === 'DA_CHAY_XONG') {";
  if (goc.split(moc).length !== 2) throw new Error('KHÔNG CẮM ĐƯỢC KHUYẾT TẬT vào node/nut-3-thang-moi.js — mã đã đổi, sửa lại bài test, đừng bỏ qua.');
  const dc = await doiChungAm('giu ma 4 cho DA_CHAY_XONG', async () => { cham(goc.split(moc).join('      if (false) {')); });
  return 'mã 5 · "' + (r.ra.match(/GOOGLE DA TAO XONG[^\r\n]*/) || [''])[0] + '" · không còn KHONG TAO DUOC · cấu hình y nguyên · ' + dc;
});

test('N-36 nút 3 bảy trường hợp lệ: hỏi đúng thứ tự đề bài, in lại đủ bảy giá trị, chế độ 2 ghi đúng khóa; bỏ ràng buộc "tháng liền sau", bỏ file thang-moi-*.json', async () => {
  const v = dungVh3();
  const r = await chay3(v, TL_CHE_DO_2());
  dung(r.ma === 0, 'bảy trường hợp lệ phải thoát mã 0, nhận được ' + r.ma + ': ' + r.ra.slice(-300));
  // NGUYÊN VĂN đề bài YC-34 (02_GIAO_VIEC_DEV.md) — gõ cứng ở đây, KHÔNG lấy từ mã đang chấm.
  const DE_BAI = ['[1/7] Thang truoc (1-12):', '[2/7] Nam truoc (vd 2026):', '[3/7] Link file Google Sheet thang truoc:',
    '[4/7] Thang moi (1-12):', '[5/7] Nam moi (vd 2026):', '[6/7] Link file Google Sheet thang moi:',
    '[7/7] Che do: 1 = Tao/chuyen so sang thang moi (copy ton, day cot Loi nhuan, don don hang, ghi link)',
    '              2 = Chi khai bao link thang moi (khong dong vao du lieu)'];
  const lechDeBai = (ra) => {
    let viTri = -1;
    const ds = [];
    DE_BAI.forEach((c) => { const k = ra.indexOf(c, viTri + 1); if (k < 0) ds.push(c.trim()); else viTri = k; });
    return ds;
  };
  dung(lechDeBai(r.ra).length === 0, 'câu hỏi thiếu / sai nguyên văn / sai thứ tự so với đề bài: ' + lechDeBai(r.ra).join(' | '));
  ['[1/7] Tháng trước : 9', '→ kỳ 2026-09', '[3/7] Link trước  : link Google Sheet hợp lệ', '[4/7] Tháng mới   : 10',
    '→ kỳ 2026-10', '[6/7] Link mới    : link Google Sheet hợp lệ', '[7/7] Chế độ      : 2', 'Dung chua? (c/k)'].forEach((x) =>
    dung(r.ra.indexOf(x) >= 0, 'bảng in lại thiếu "' + x + '"'));
  dung(docCfg(v.tep).link_thang['2026-10'] === LK('T10'), 'link_thang["2026-10"] không được ghi');
  dung(dsThangMoi(v.ch).length === 0, 'vẫn sinh file thang-moi-*.json (đề bài bỏ file này)');

  // Qua năm: 12/2026 → 1/2027. Và nhảy tháng (3 → 11) được nhận — đề bài BỎ ràng buộc tháng mới = tháng cũ + 1.
  const n = dungVh3();
  const rn = await chay3(n, ['12', '2026', LK('T12'), '1', '2027', LK('T1'), '2', 'c']);
  dung(rn.ma === 0 && docCfg(n.tep).link_thang['2027-01'] === LK('T1'), 'qua năm phải ghi khóa 2027-01, thoát ' + rn.ma);
  const nh = dungVh3();
  const rh = await chay3(nh, ['3', '2026', LK('T3'), '11', '2026', LK('T11'), '2', 'c']);
  dung(rh.ma === 0 && docCfg(nh.tep).link_thang['2026-11'] === LK('T11'), 'nhảy tháng 3 → 11 bị chặn — đề bài đã bỏ ràng buộc này');

  const banRangBuoc = nut3Sua([['      gt.kyMoi = gw.kyThangNam(gt.thangMoi, gt.namMoi);\n',
    "      gt.kyMoi = gw.kyThangNam(gt.thangMoi, gt.namMoi);\n      if (gw.thangSau(gt.kyCu) !== gt.kyMoi) { inRa('LỖI [4/7]: phải liền sau tháng trước', 'do'); continue; }\n"]]);
  const dc = await doiChungAm('cam lai rang buoc thang lien sau', async () => {
    const x = dungVh3();
    const y = await chay3(x, ['3', '2026', LK('T3'), '11', '2026', LK('T11'), '2', 'c'], { mod: banRangBuoc });
    if (y.ma !== 0) throw new Error('3 → 11 bị chặn, thoát mã ' + y.ma);
  });
  // Câu DA GHI đủ BA NHÁNH kỳ (D-60 + D-65), NGUYÊN VĂN gõ cứng — ngày chạy giả là 20/9/2026 (`chay3`).
  const CAU_BA_NHANH = [
    ['đang chạy', ['8', '2026', LK('T8'), '9', '2026', LK('T9'), '2', 'c'], 'DA GHI link thang 2026-09. Tu bay gio nut 4 se ghi vao file nay.'],
    ['tháng sau', TL_CHE_DO_2(), 'DA GHI link thang 2026-10. Tu ngay 1/10/2026 nut 4 se ghi vao file nay.'],
    ['đã qua', ['7', '2026', LK('T7'), '8', '2026', LK('T8'), '2', 'c'], 'DA GHI link thang 2026-08. Thang nay da qua: nut 4 chi ghi vao file nay khi chay tay voi --thang 2026-08.']
  ];
  const chamBaNhanh = async (mod) => {
    const sai = [];
    for (const [ten, tl, cau] of CAU_BA_NHANH) {
      const y = await chay3(dungVh3(), tl, { mod });
      if (y.ma !== 0 || y.ra.indexOf(cau) < 0) sai.push(ten + ': ' + ((y.ra.match(/DA GHI link thang[^\n]*/) || ['(không có câu DA GHI)'])[0]));
    }
    return sai;
  };
  const saiBaNhanh = await chamBaNhanh(NUT3);
  dung(saiBaNhanh.length === 0, 'câu DA GHI sai nhánh: ' + saiBaNhanh.join(' | '));
  const banCauCu = nut3Sua([["  if (ky === nay) return dau + ' Tu bay gio nut 4 se ghi vao file nay.';", "  if (ky === nay) return dau + ' Tu ngay mai nut 4 se ghi vao file nay.';"]]);
  const dcCauCu = await doiChungAm('cau cu Tu ngay mai cho thang dang chay (truoc D-65)', async () => {
    const l = await chamBaNhanh(banCauCu);
    if (l.length) throw new Error(l.join(' | '));
  });
  const banCauHoi = nut3Sua([["  '              2 = Chi khai bao link thang moi (khong dong vao du lieu)\\n' +", "  '              2 = Chi khai bao link thang moi\\n' +"]]);
  const dcCau = await doiChungAm('bot chu trong cau hoi [7/7]', async () => {
    const y = await chay3(dungVh3(), TL_CHE_DO_2(), { mod: banCauHoi });
    const l = lechDeBai(y.ra);
    if (l.length) throw new Error('lệch đề bài: ' + l.join(' | '));
  });
  return '7 câu đúng nguyên văn đề bài, đúng thứ tự · in lại 7 giá trị · 2026-10 ghi đúng · 12/2026→1/2027 · 3→11 được nhận · ' +
    'câu DA GHI đúng 3 nhánh (đang chạy "Tu bay gio" D-65 · tháng sau "Tu ngay 1/10/2026" · đã qua "--thang") · ' + dc + ' · ' + dcCau + ' · ' + dcCauCu;
});

test('N-37 nút 3 từng trường sai (7 ca): dòng LỖI nêu đúng trường, kiểm NGAY trường đó, hỏi lại từ [1/7]; ba lượt sai → thoát, cấu hình y nguyên', async () => {
  const DUNG = ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '2'];
  const SAI = [
    [0, '13', 'tháng ngoài 1–12'], [1, '26', 'năm hai chữ số'], [2, 'https://example.com/so-thang-9', 'link không phải Google Sheet'],
    [3, 'muoi', 'tháng không phải số'], [4, '', 'năm bỏ trống'], [5, TIEN_SHEET + 'abc/edit', 'link bị cắt, thiếu mã file'],
    [6, '3', 'chế độ ngoài 1/2']
  ];
  const chayCa = async (mod, i, sai) => {
    const v = dungVh3();
    const r = await chay3(v, DUNG.slice(0, i).concat([sai]).concat(DUNG).concat(['c']), { mod });
    return { v, r };
  };
  for (const [i, sai, ten] of SAI) {
    const { v, r } = await chayCa(NUT3, i, sai);
    const nhan = '[' + (i + 1) + '/7]';
    const kLoi = r.ra.indexOf('LỖI ');
    dung(kLoi >= 0 && r.ra.startsWith('LỖI ' + nhan, kLoi), 'ca "' + ten + '": dòng LỖI đầu tiên phải nêu ' + nhan + ', được: ' +
      (kLoi >= 0 ? r.ra.slice(kLoi, kLoi + 60) : '(không có dòng LỖI nào)'));
    if (i < 6) dung(r.ra.slice(0, kLoi).indexOf('[' + (i + 2) + '/7]') < 0, 'ca "' + ten + '": chưa báo lỗi mà đã hỏi sang trường ' + (i + 2) + ' — không kiểm NGAY');
    dung(r.ra.indexOf('[1/7] Thang truoc', kLoi) > kLoi, 'ca "' + ten + '": sau dòng LỖI không hỏi lại từ [1/7]');
    dung(r.ma === 0 && docCfg(v.tep).link_thang['2026-10'] === LK('T10'), 'ca "' + ten + '": lượt hai đúng mà không đi tiếp (thoát ' + r.ma + ')');
    dung(r.ra.indexOf(idGia('T9')) < 0 && !/example\.com/.test(r.ra.slice(kLoi, kLoi + 300)), 'ca "' + ten + '": câu lỗi in lại link');
  }
  // Ba lượt sai rồi mới gõ đúng → vẫn thoát, không ghi
  const ba = dungVh3();
  const truoc = tho(ba.tep);
  const rb = await chay3(ba, ['13', '0', '99'].concat(DUNG).concat(['c']));
  dung(rb.ma === 1 && /Đã 3 lượt/.test(rb.ra), 'ba lượt sai phải thoát mã 1 với câu "Đã 3 lượt", nhận được ' + rb.ma);
  dung(cungByte(tho(ba.tep), truoc), 'ba lượt sai mà cấu hình đã bị ghi');

  const banThang13 = nut3Sua([["+t > 12) return { loi: 'phải là số nguyên từ 1 đến 12' }", "+t > 13) return { loi: 'phải là số nguyên từ 1 đến 12' }"]]);
  const dc1 = await doiChungAm('cua thang nhan 13', async () => {
    const { r } = await chayCa(banThang13, 0, '13');
    const k = r.ra.indexOf('LỖI ');
    if (k < 0 || !r.ra.startsWith('LỖI [1/7]', k)) throw new Error('tháng 13 lọt qua [1/7]; lỗi đầu tiên: ' + r.ra.slice(k, k + 40));
  });
  const banLink = nut3Sua([
    ["  if (t.indexOf(TIEN_TO_LINK) !== 0) return { loi: 'phải là link Google Sheet, bắt đầu bằng ' + TIEN_TO_LINK };", ''],
    ['  const m = t.match(gw.RE_LINK_SHEET);', '  const m = [t, t];']
  ]);
  const dc2 = await doiChungAm('cua link nhan moi thu', async () => {
    const { r } = await chayCa(banLink, 2, 'https://example.com/so-thang-9');
    const k = r.ra.indexOf('LỖI ');
    if (k < 0 || !r.ra.startsWith('LỖI [3/7]', k)) throw new Error('link example.com lọt qua [3/7]; lỗi đầu tiên: ' + r.ra.slice(k, k + 40));
  });
  const banVoHan = nut3Sua([['const SO_LUOT_HOI_TOI_DA = 3;', 'const SO_LUOT_HOI_TOI_DA = 99;']]);
  const dc3 = await doiChungAm('bo gioi han ba luot', async () => {
    const x = dungVh3();
    const t0 = tho(x.tep);
    await chay3(x, ['13', '0', '99'].concat(DUNG).concat(['c']), { mod: banVoHan });
    if (!cungByte(tho(x.tep), t0)) throw new Error('sai ba lượt rồi lượt bốn vẫn ghi được cấu hình');
  });
  const banKhongHoiLai = nut3Sua([["      if (loi) { inLoi(loi); continue; }", "      if (loi) { inLoi(loi); return 1; }"]]);
  const dc4 = await doiChungAm('sai mot truong la thoat luon, khong hoi lai', async () => {
    const { r } = await chayCa(banKhongHoiLai, 3, 'muoi');
    if (r.ra.indexOf('[1/7] Thang truoc', r.ra.indexOf('LỖI [4/7]')) < 0 || r.ma !== 0) throw new Error('không hỏi lại từ [1/7], thoát ' + r.ma);
  });
  return SAI.length + ' ca sai, mỗi ca báo đúng trường + hỏi lại từ [1/7] · 3 lượt sai → mã 1, cấu hình y nguyên · ' +
    [dc1, dc2, dc3, dc4].join(' · ');
});

test('N-38 nút 3 link có khoảng trắng / tab đầu cuối: cắt rồi mới kiểm, ghi link đã cắt, đối chiếu link_thang không báo nhầm', async () => {
  const TL = ['9', '2026', '   ' + LK('T9') + '\t', '10', '2026', '  ' + LK('T10') + '   ', '2', 'c'];
  const v = dungVh3();
  const r = await chay3(v, TL);
  dung(r.ma === 0, 'link có khoảng trắng phải được nhận, thoát ' + r.ma + ': ' + r.ra.slice(-300));
  const giaTri = docCfg(v.tep).link_thang['2026-10'];
  dung(giaTri === LK('T10'), 'giá trị ghi vào link_thang còn khoảng trắng hoặc sai: ' + JSON.stringify(giaTri.length));
  dung(r.ra.indexOf('CẢNH BÁO') < 0, 'link tháng trước chỉ khác khoảng trắng mà vẫn bị báo KHÁC link_thang');
  const banKhongCat = nut3Sua([["function kiemLink(x) {\n  const t = String(x == null ? '' : x).trim();", "function kiemLink(x) {\n  const t = String(x == null ? '' : x);"]]);
  const dc = await doiChungAm('bo trim() o cua link', async () => {
    const x = dungVh3();
    const y = await chay3(x, TL, { mod: banKhongCat });
    const g = (docCfg(x.tep).link_thang || {})['2026-10'];
    if (y.ma !== 0 || g !== LK('T10')) throw new Error('link có khoảng trắng bị từ chối hoặc ghi sai (thoát ' + y.ma + ')');
  });
  return 'khoảng trắng + tab → cắt, ghi đúng link, không cảnh báo oan · ' + dc;
});

test('N-39 nút 3 chế độ 2 GHI ĐÈ khóa đã có: JSON sau chỉ MỘT khóa 2026-10, mọi byte khác y nguyên (BOM, CRLF, thứ tự); ghi qua file tạm rồi đổi tên', async () => {
  const bang = { '2026-08': LK('T8'), '2026-10': LK('T10CU'), '2026-09': LK('T9') };
  const v = dungVh3({ linkThang: bang, bom: true, crlf: true });
  const truoc = fs.readFileSync(v.tep, 'utf8');
  // Mã file (ino) PHẢI đổi: đổi tên bản tạm đè lên là một file MỚI; ghi tại chỗ (kể cả qua fd, cờ số) giữ nguyên mã cũ.
  const inoTruoc = fs.statSync(v.tep).ino;

  // Canh "không mở file đích bằng chế độ ghi": mọi lối ghi thẳng vào CAU_HINH_VAN_HANH.json đều ném.
  const LOI_GHI = ['writeFileSync', 'appendFileSync', 'openSync', 'createWriteStream', 'copyFileSync'];
  const goc = {};
  const camGhi = (tep) => LOI_GHI.forEach((f) => {
    const dich = path.resolve(tep).toLowerCase();
    goc[f] = fs[f];
    fs[f] = function (p) {
      const dich2 = f === 'copyFileSync' ? arguments[1] : p;
      const coGhi = f !== 'openSync' || /[wa+]/.test(String(arguments[1] || 'r'));
      if (coGhi && typeof dich2 === 'string' && path.resolve(dich2).toLowerCase() === dich) throw new Error('GHI THẲNG VÀO FILE ĐÍCH bằng fs.' + f);
      return goc[f].apply(fs, arguments);
    };
  });
  const moGhi = () => LOI_GHI.forEach((f) => { fs[f] = goc[f]; });

  let r;
  camGhi(v.tep);
  try { r = await chay3(v, ['9', '2026', LK('T9'), '10', '2026', LK('T10MOI'), '2', 'c']); } finally { moGhi(); }
  const sau = fs.readFileSync(v.tep, 'utf8');
  dung(fs.statSync(v.tep).ino !== inoTruoc, 'CAU_HINH_VAN_HANH.json vẫn là file cũ bị ghi TẠI CHỖ, không phải bản tạm đổi tên đè lên');
  dung(r.ma === 0, 'ghi đè khóa đã có phải thoát mã 0, nhận được ' + r.ma + ': ' + r.ra.slice(-300));
  dung((sau.match(/"2026-10"/g) || []).length === 1, 'JSON sau có ' + (sau.match(/"2026-10"/g) || []).length + ' khóa "2026-10", phải đúng 1');
  dung(sau === truoc.replace(LK('T10CU'), LK('T10MOI')), 'ngoài giá trị của 2026-10, file cấu hình đã đổi byte khác (BOM / CRLF / thứ tự / khóa khác)');
  dung(Object.keys(docCfg(v.tep).link_thang).join(',') === '2026-08,2026-10,2026-09', 'thứ tự khóa link_thang bị đảo');
  dung(/CHÚ Ý: CAU_HINH_VAN_HANH\.json ĐANG có link KHÁC cho 2026-10/.test(r.ra), 'thiếu câu báo sẽ ghi đè link đang có');
  dung(fs.readdirSync(v.ch).filter((t) => /\.tam-/.test(t)).length === 0, 'còn sót file tạm trong thư mục cấu hình');

  // Máy tự soát bản tạm: mã lỡ làm rơi khóa khác thì KHÔNG đè lên file thật.
  const banRoiKhoa = nut3Sua([['  obj.link_thang = bang;\n', '  obj.link_thang = { [ky]: link };\n']]);
  const x0 = dungVh3({ linkThang: bang });
  const t0 = tho(x0.tep);
  const y0 = await chay3(x0, ['9', '2026', LK('T9'), '10', '2026', LK('T10MOI'), '2', 'c'], { mod: banRoiKhoa });
  dung(y0.ma === 1 && cungByte(tho(x0.tep), t0), 'bản tạm rơi mất khóa khác mà vẫn đè lên file thật (thoát ' + y0.ma + ')');

  const banGhiThang = nut3Sua([['      try { fs.renameSync(tam, cfgTep); break; } catch (e) {',
    '      try { fs.writeFileSync(cfgTep, fs.readFileSync(tam)); fs.unlinkSync(tam); break; } catch (e) {']]);
  const dc1 = await doiChungAm('ghi thang vao file dich thay vi doi ten', async () => {
    const x = dungVh3({ linkThang: bang });
    let y;
    camGhi(x.tep);
    try { y = await chay3(x, ['9', '2026', LK('T9'), '10', '2026', LK('T10MOI'), '2', 'c'], { mod: banGhiThang }); } finally { moGhi(); }
    if (y.ma !== 0 || docCfg(x.tep).link_thang['2026-10'] !== LK('T10MOI')) throw new Error('mở file đích bằng chế độ ghi (thoát ' + y.ma + ')');
  });
  const banRoiKhoaKhongSoat = nut3Sua([
    ['  obj.link_thang = bang;\n', '  obj.link_thang = { [ky]: link };\n'],
    ["    if (boKhoa(docLai) !== boKhoa(JSON.parse(than))) throw new Error('bản tạm lệch các khóa khác của file cấu hình');", '']
  ]);
  const dc2 = await doiChungAm('lam roi khoa khac va bo buoc soat ban tam', async () => {
    const x = dungVh3({ linkThang: bang, bom: true, crlf: true });
    const t = fs.readFileSync(x.tep, 'utf8');
    await chay3(x, ['9', '2026', LK('T9'), '10', '2026', LK('T10MOI'), '2', 'c'], { mod: banRoiKhoaKhongSoat });
    if (fs.readFileSync(x.tep, 'utf8') !== t.replace(LK('T10CU'), LK('T10MOI'))) throw new Error('file cấu hình mất khóa 2026-08/2026-09');
  });
  const banGhiQuaFd = nut3Sua([['      try { fs.renameSync(tam, cfgTep); break; } catch (e) {',
    '      try { const fd = fs.openSync(cfgTep, fs.constants.O_RDWR); fs.ftruncateSync(fd, 0); fs.writeSync(fd, fs.readFileSync(tam)); fs.closeSync(fd); fs.unlinkSync(tam); break; } catch (e) {']]);
  const dc3 = await doiChungAm('ghi tai cho qua fd, co so, lot hang rao ham', async () => {
    const x = dungVh3({ linkThang: bang });
    const ino = fs.statSync(x.tep).ino;
    let y;
    camGhi(x.tep);
    try { y = await chay3(x, ['9', '2026', LK('T9'), '10', '2026', LK('T10MOI'), '2', 'c'], { mod: banGhiQuaFd }); } finally { moGhi(); }
    if (y.ma !== 0 || fs.statSync(x.tep).ino === ino) throw new Error('file đích bị ghi tại chỗ (mã file không đổi, thoát ' + y.ma + ')');
  });
  return '1 khóa 2026-10, mọi byte khác y nguyên, mã file đổi (đổi tên đè), không ghi thẳng file đích, không sót file tạm · bản tạm rơi khóa → không đè · ' +
    dc1 + ' · ' + dc2 + ' · ' + dc3;
});

test('N-40 nút 3 chế độ 1: chỉ khi Web App báo xong ĐỦ 8/8 phép K mới ghi link — tự kiểm lệch, từ chối, 7/8, lỗi mạng đều giữ cấu hình y nguyên', async () => {
  const TL1 = ['9', '2026', ' ' + LK('T9'), '10', '2026', LK('T10'), '1', 'c'];
  const CA = [
    ['TU_KIEM_LECH', 3, () => ({ ok: false, loi: 'TU_KIEM_LECH', thongBao: 'TỰ KIỂM LỆCH 1/8 phép — K-7 (999000).', goiY: ' → giữ cờ', kiem: KIEM8(['K-7']) }), /K-7 LỆCH/],
    ['FILE_CO_DU_LIEU', 3, () => ({ ok: false, loi: 'FILE_CO_DU_LIEU', thongBao: 'KHÔNG KHỞI TẠO — Phép R-2 …', goiY: ' → tạo bản sao mới',
      lop2: [{ ma: 'R-2', ten: 'Sheet gian hàng không có đơn mới', dat: false, chiTiet: 'Shopee mall 2 ô' }] }), /R-2 CÓ DỮ LIỆU/],
    ['ok nhưng 7/8', 3, () => ({ ok: true, thongBao: 'ĐÃ KHỞI TẠO', kiem: KIEM8(['K-3']) }), /không thấy đủ 8\/8/],
    ['ok nhưng không có kiem', 3, () => ({ ok: true, thongBao: 'ĐÃ KHỞI TẠO' }), /không thấy đủ 8\/8/],
    ['ok với kiem RỖNG', 3, () => ({ ok: true, thongBao: 'ĐÃ KHỞI TẠO', kiem: [] }), /không thấy đủ 8\/8/],
    ['ok với 7 phép đều đạt', 3, () => ({ ok: true, thongBao: 'ĐÃ KHỞI TẠO', kiem: KIEM8([]).slice(0, 7) }), /không thấy đủ 8\/8/],
    ['R-5 danh sách sheet lệch', 3, () => ({ ok: false, loi: 'FILE_CO_DU_LIEU', thongBao: 'KHÔNG KHỞI TẠO — Phép R-5 …', goiY: ' → …',
      lop2: [{ ma: 'R-5', ten: 'Đủ sheet, đúng tên, đúng thứ tự', dat: false, chiTiet: 'thiếu Offood' }] }), /R-5 SAI DANH SÁCH SHEET/],
    ['lỗi quyền / mạng', 4, () => { throw new Error('LỖI QUYỀN TRUY CẬP — kiểm tra: …'); }, /KHÔNG TẠO ĐƯỢC THÁNG 2026-10\./]
  ];
  const ra = [];
  for (const [ten, maMong, kichBan, rx] of CA) {
    const v = dungVh3();
    const t0 = tho(v.tep);
    const r = await chay3(v, TL1, { them: { WebApp: webGia(kichBan) } });
    dung(r.ma === maMong, 'ca "' + ten + '" phải thoát mã ' + maMong + ', nhận được ' + r.ma);
    dung(rx.test(r.ra), 'ca "' + ten + '" thiếu câu nguyên nhân: ' + r.ra.slice(-300));
    dung(/link_thang trong CAU_HINH_VAN_HANH\.json KHÔNG đổi/.test(r.ra), 'ca "' + ten + '" không nói rõ link không đổi');
    dung(cungByte(tho(v.tep), t0), 'ca "' + ten + '": CAU_HINH_VAN_HANH.json ĐÃ BỊ GHI');
    ra.push(ten + '→' + r.ma);
  }
  // Ca đủ 8/8: ghi link, và tham số gửi Web App đúng bảy trường đã cắt khoảng trắng.
  const goi = [];
  const v = dungVh3();
  const r = await chay3(v, TL1, { them: { WebApp: webGia(() => ({ ok: true, thongBao: 'ĐÃ KHỞI TẠO file tháng 2026-10 — đủ 8/8 phép tự kiểm.', kiem: KIEM8([]) }), goi) } });
  dung(r.ma === 0 && docCfg(v.tep).link_thang['2026-10'] === LK('T10'), 'đủ 8/8 mà không ghi link (thoát ' + r.ma + ')');
  dung(goi.length === 1 && JSON.stringify(goi[0]) === JSON.stringify({ thangCu: 9, namCu: 2026, linkCu: LK('T9'), thangMoi: 10, namMoi: 2026, linkMoi: LK('T10') }),
    'tham số gửi Web App sai: ' + JSON.stringify(goi[0] || null).replace(/https:[^"]*/g, '<link>'));

  const banBoQuaK = nut3Sua([['    if (!du8) {', '    if (false) {']]);
  const dc1 = await doiChungAm('ghi link du tu kiem lech', async () => {
    const x = dungVh3();
    const t0 = tho(x.tep);
    await chay3(x, TL1, { mod: banBoQuaK, them: { WebApp: webGia(CA[0][2]) } });
    if (!cungByte(tho(x.tep), t0)) throw new Error('K-7 lệch mà link_thang đã được ghi');
  });
  const banTinOk = nut3Sua([['    const du8 = kq.ok === true && Array.isArray(kq.kiem) && kq.kiem.length === 8 && kq.kiem.every((p) => p && p.dat === true);',
    '    const du8 = kq.ok === true;']]);
  const dc2 = await doiChungAm('chi tin co ok cua Web App', async () => {
    const x = dungVh3();
    const t0 = tho(x.tep);
    await chay3(x, TL1, { mod: banTinOk, them: { WebApp: webGia(CA[2][2]) } });
    if (!cungByte(tho(x.tep), t0)) throw new Error('Web App báo ok với 7/8 phép mà link_thang đã được ghi');
  });
  const banBoDem8 = nut3Sua([['Array.isArray(kq.kiem) && kq.kiem.length === 8 && kq.kiem.every(', 'Array.isArray(kq.kiem) && kq.kiem.every(']]);
  const dc3 = await doiChungAm('bo phep dem du 8 phep', async () => {
    const x = dungVh3();
    const t0 = tho(x.tep);
    await chay3(x, TL1, { mod: banBoDem8, them: { WebApp: webGia(() => ({ ok: true, thongBao: 'ĐÃ KHỞI TẠO', kiem: [] })) } });
    if (!cungByte(tho(x.tep), t0)) throw new Error('Web App báo ok với 0 phép kiểm mà link_thang đã được ghi');
  });
  return ra.join(' · ') + ' · 8/8 → mã 0, ghi link, tham số đúng · ' + dc1 + ' · ' + dc2 + ' · ' + dc3;
});

test('N-41 nút 3 đối chiếu link tháng trước với link_thang (khác → CẢNH BÁO, không chặn) và KHÔNG lọt link / ID / chuỗi bí mật ra màn hình hay nhật ký', async () => {
  // Khác file → cảnh báo nhưng vẫn làm
  const v = dungVh3();
  const r = await chay3(v, ['9', '2026', LK('KHAC_T9'), '10', '2026', LK('T10'), '2', 'c']);
  dung(r.ma === 0, 'link tháng trước khác link_thang mà bị chặn (thoát ' + r.ma + ') — đề bài: chỉ cảnh báo');
  dung(/CẢNH BÁO: link tháng trước \[3\/7\] KHÁC link đang khai cho 2026-09/.test(r.ra), 'không cảnh báo link tháng trước khác link_thang');
  // Cùng file, khác đuôi link → KHÔNG cảnh báo
  const v2 = dungVh3();
  const r2 = await chay3(v2, ['9', '2026', LK('T9', '/edit?usp=sharing'), '10', '2026', LK('T10'), '2', 'c']);
  dung(r2.ma === 0 && r2.ra.indexOf('CẢNH BÁO') < 0, 'cùng file chỉ khác đuôi /edit?usp=… mà bị báo KHÁC');
  // Chế độ 1: Web App ném câu lỗi có dán nguyên link → màn hình và nhật ký vẫn không có mã file
  const v3 = dungVh3();
  const r3 = await chay3(v3, ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '1', 'c'],
    { them: { WebApp: webGia(() => { throw new Error('Không mở được ' + LK('T10') + ' — bí mật ' + BI_MAT_MOI + ' · ' + LINK_MOI); }) } });
  const toan = [r.ra, r2.ra, r3.ra, nhatKy3(v), nhatKy3(v2), nhatKy3(v3)].join('\n');
  dung(nhatKy3(v3).length > 0 && /Chế độ: 1/.test(nhatKy3(v3)), 'chế độ 1 không để lại nhật ký LOG_TAO_THANG_*.txt');
  const lot = ['T8', 'T9', 'KHAC_T9', 'T10'].filter((k) => toan.indexOf(idGia(k)) >= 0)
    .concat(toan.indexOf(BI_MAT_MOI) >= 0 ? ['chuỗi bí mật'] : [])
    .concat(toan.indexOf(LINK_MOI) >= 0 ? ['link Web App'] : [])
    .concat(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/\w/.test(toan) ? ['link file tháng'] : []);
  dung(lot.length === 0, 'INV-7 LỌT: ' + lot.join(', '));

  const banKhongCanh = nut3Sua([['      if (idKhai(gt.kyCu) && idKhai(gt.kyCu) !== gt.idCu) {', '      if (false) {']]);
  const dc1 = await doiChungAm('bo canh bao link thang truoc khac', async () => {
    const y = await chay3(dungVh3(), ['9', '2026', LK('KHAC_T9'), '10', '2026', LK('T10'), '2', 'c'], { mod: banKhongCanh });
    if (!/CẢNH BÁO: link tháng trước/.test(y.ra)) throw new Error('không còn cảnh báo');
  });
  const banInLink = nut3Sua([["  if (laLink) return '<link đã dán>';", '  if (laLink) return t;']]);
  const dc2 = await doiChungAm('in lai nguyen link vua dan', async () => {
    const y = await chay3(dungVh3(), TL_CHE_DO_2(), { mod: banInLink });
    if (y.ra.indexOf(idGia('T10')) >= 0) throw new Error('mã file tháng 10 lọt ra màn hình');
  });
  // Chuỗi trả lời LỆCH MỘT Ô: mã file trần rơi vào ô năm [5/7], link thiếu https rơi vào câu c/k → vẫn không vang lại.
  const v4 = dungVh3();
  const r4 = await chay3(v4, ['9', '2026', LK('T9'), '10', idGia('T8'), '9', '2026', LK('T9'), '10', '2026', LK('T10'), '2',
    'docs.google.com/spreadsheets/d/' + idGia('T8'), 'c']);
  dung(r4.ra.indexOf(idGia('T8')) < 0, 'INV-7: mã file trần gõ nhầm vào ô không phải link bị vang lại ra màn hình');
  const banVangTho = nut3Sua([[" || t.length > 16) return '<đã ẩn>';", ' && false) return \'<đã ẩn>\';']]);
  const dc3 = await doiChungAm('vang lai tho o khong phai link', async () => {
    const y = await chay3(dungVh3(), ['9', '2026', LK('T9'), '10', idGia('T8'), '9', '2026', LK('T9'), '10', '2026', LK('T10'), '2', 'c'], { mod: banVangTho });
    if (y.ra.indexOf(idGia('T8')) >= 0) throw new Error('mã file tháng 8 vang lại ở ô [5/7]');
  });
  return 'khác file → cảnh báo, vẫn ghi · khác đuôi → không cảnh báo · 0 link/ID/bí mật trên màn hình + nhật ký · mã file lệch ô không vang lại · ' +
    dc1 + ' · ' + dc2 + ' · ' + dc3;
});

test('N-42 nút 3 "Dung chua? (c/k)": k → chưa làm gì, hỏi lại từ [1/7]; gõ bừa → hỏi lại đúng câu đó; chỉ c mới ghi', async () => {
  const DUNG = ['9', '2026', LK('T9'), '10', '2026', LK('T10'), '2'];
  const v = dungVh3();
  const r = await chay3(v, DUNG.concat(['k']).concat(DUNG).concat(['c']));
  dung(r.ma === 0 && /Bạn trả lời k — chưa làm gì/.test(r.ra) && /lượt 2\/3/.test(r.ra), 'k rồi c: phải hỏi lại lượt 2 rồi ghi (thoát ' + r.ma + ')');
  const v2 = dungVh3();
  const t2 = tho(v2.tep);
  const r2 = await chay3(v2, DUNG.concat(['k']));
  dung(r2.ma === 1 && cungByte(tho(v2.tep), t2), 'trả lời k (rồi hết câu trả lời) mà cấu hình bị ghi / không thoát mã 1');
  const v3 = dungVh3();
  const r3 = await chay3(v3, DUNG.concat(['vang', 'c']));
  dung(r3.ma === 0 && (r3.ra.match(/\[1\/7\] Thang truoc/g) || []).length === 1 && (r3.ra.match(/Dung chua\? \(c\/k\)/g) || []).length === 2,
    'gõ bừa ở câu xác nhận phải hỏi lại ĐÚNG câu đó, không hỏi lại bảy trường');
  const v4 = dungVh3();
  const t4 = tho(v4.tep);
  const r4 = await chay3(v4, DUNG.concat(['k']).concat(DUNG).concat(['k']).concat(DUNG).concat(['k']));
  dung(r4.ma === 1 && cungByte(tho(v4.tep), t4), 'ba lần k phải thoát mã 1, cấu hình y nguyên');

  dung(/lượt cuối bạn trả lời k — thoát, chưa làm gì/.test(r4.ra) && !/lượt nhập sai/.test(r4.ra), 'ba lần k mà câu thoát lại nói "nhập sai"');
  // Lượt cuối sai trường: không được hứa "Hỏi lại từ [1/7]" rồi thoát ngay dòng sau.
  const r5 = await chay3(dungVh3(), ['13', '13', '13']);
  const dongLoiCuoi = r5.ra.split('\n').filter((d) => d.indexOf('LỖI [1/7]') === 0).pop() || '';
  dung(r5.ma === 1 && dongLoiCuoi && dongLoiCuoi.indexOf('Hỏi lại từ [1/7]') < 0 && /lượt nhập sai/.test(r5.ra), 'lượt cuối vẫn hứa hỏi lại: ' + dongLoiCuoi);

  const banBoK = nut3Sua([["      if (xn === 'k') { lyDoLuot = 'k'; inRa('Bạn trả lời k — chưa làm gì.'); continue; }", '']]);
  const dc = await doiChungAm('k cung lam nhu c', async () => {
    const x = dungVh3();
    const t0 = tho(x.tep);
    await chay3(x, DUNG.concat(['k']), { mod: banBoK });
    if (!cungByte(tho(x.tep), t0)) throw new Error('trả lời k mà vẫn ghi link_thang');
  });
  return 'k → hỏi lại lượt 2 · k rồi thôi → mã 1 · gõ bừa → hỏi lại câu xác nhận · 3 lần k → mã 1 · ' + dc;
});

/* ---------------------------------------------------------------- NÚT 4 --- */

test('N-43 nút 3 nhận link dạng /spreadsheets/u/<số>/d/<ID> (trình duyệt đăng nhập nhiều tài khoản) — ghi đúng link, đối chiếu theo mã file, nút 4 đọc lại ra đúng ID', async () => {
  // YC-41 việc 1, đúng ca BA thử trên mã 2.6.1: đầu tháng user dán link THẬT dạng u/0 → nút 3 báo "phải là link Google Sheet…"
  // ba lượt rồi thoát mã 1 — sai nguyên nhân, và user không có cách nào tự thoát ra.
  const TIEN = 'https://docs.google.com/spreadsheets/';
  const LKU = (so, nhan, duoi) => TIEN + 'u/' + so + '/d/' + idGia(nhan) + (duoi == null ? '/edit#gid=0' : duoi);
  const NHANH = '(?:u\\/\\d+\\/)?';
  const TL = ['9', '2026', LKU('0', 'T9'), '10', '2026', '  ' + LKU('1', 'T10', '/edit?usp=sharing') + ' ', '2', 'c'];
  const v = dungVh3();
  const r = await chay3(v, TL);
  dung(r.ma === 0, 'link u/<số> hợp lệ phải thoát mã 0, được ' + r.ma + ': ' + r.ra.slice(-300));
  dung(!/LỖI \[[36]\/7\]/.test(r.ra), 'link u/<số> bị báo LỖI ở trường link');
  const cfg = docCfg(v.tep);
  dung(cfg.link_thang['2026-10'] === LKU('1', 'T10', '/edit?usp=sharing'), 'link_thang["2026-10"] không đúng link đã cắt khoảng trắng');
  dung(r.ra.indexOf('CẢNH BÁO') < 0, 'link u/0 cùng MÃ FILE với link_thang["2026-09"] dạng /d/ mà vẫn bị báo KHÁC');
  // Nút 4 đọc lại chính dòng vừa ghi.
  dung(require('./gsheet-web-app').idFileThang(cfg.link_thang, '2026-10').id === idGia('T10'), 'nút 4 không rút đúng ID từ link u/1 vừa ghi');
  dung(NUT3.kiemLink(LKU('12', 'T9')).id === idGia('T9'), 'kiemLink không rút đúng ID của link u/12');
  const toan = r.ra + '\n' + nhatKy3(v);
  dung(toan.indexOf(idGia('T9')) < 0 && toan.indexOf(idGia('T10')) < 0, 'INV-7: mã file của link u/<số> lọt ra màn hình hay nhật ký');

  // ĐỐI CHỨNG ÂM 1 — tiền tố cũ `…/spreadsheets/d/` (2.6.1): đúng triệu chứng BA thấy.
  const banTienToCu = nut3Sua([["const TIEN_TO_LINK = 'https://docs.google.com/spreadsheets/';", "const TIEN_TO_LINK = 'https://docs.google.com/spreadsheets/d/';"]]);
  let trieuChung = '';
  const dc1 = await doiChungAm('tien to link cu .../spreadsheets/d/', async () => {
    const x = dungVh3();
    const t0 = tho(x.tep);
    // Nút 3 kiểm NGAY từng trường: sai ở [3/7] là hỏi lại từ [1/7]. User gõ lại đúng ba câu đầu ba lượt — như ngoài đời,
    // vì không có gì để sửa — rồi mới tới phần còn lại.
    const y = await chay3(x, TL.slice(0, 3).concat(TL.slice(0, 3), TL), { mod: banTienToCu });
    trieuChung = 'thoát ' + y.ma + ', ' + (y.ra.match(/LỖI \[3\/7\][^\n]*/g) || []).length + ' dòng "LỖI [3/7]"' +
      (cungByte(tho(x.tep), t0) ? ', cấu hình y nguyên' : '');
    if (y.ma !== 0 || (docCfg(x.tep).link_thang || {})['2026-10'] !== LKU('1', 'T10', '/edit?usp=sharing')) {
      throw new Error(trieuChung + (/phải là link Google Sheet/.test(y.ra) ? ' — "phải là link Google Sheet…"' : ''));
    }
  });
  // ĐỐI CHỨNG ÂM 2 — tiền tố đúng nhưng mẫu rút mã file mất nhánh u/<số>.
  const banMauCu = nut3Sua([['  const m = t.match(gw.RE_LINK_SHEET);',
    '  const m = t.match(new RegExp(gw.RE_LINK_SHEET.source.split(' + JSON.stringify(NHANH) + ").join('')));"]]);
  const dc2 = await doiChungAm('mau rut ma file mat nhanh u/<so>', async () => {
    const x = dungVh3();
    const y = await chay3(x, TL, { mod: banMauCu });
    if (y.ma !== 0 || (docCfg(x.tep).link_thang || {})['2026-10'] !== LKU('1', 'T10', '/edit?usp=sharing')) {
      throw new Error('thoát ' + y.ma + (/link bị cắt/.test(y.ra) ? ' — báo "link bị cắt"' : ''));
    }
  });
  dung(/thoát 1, 3 dòng/.test(trieuChung), 'đối chứng âm 1 phải tái hiện đúng ca BA: thoát 1 sau 3 dòng LỖI [3/7], được: ' + trieuChung);
  return 'u/0 + u/1 (đuôi ?usp, khoảng trắng) → mã 0, ghi đúng link, không cảnh báo oan, nút 4 rút đúng ID, 0 ID lọt · ' +
    dc1 + ' · ' + dc2;
});

/**
 * YC-41 việc 5: cài tool vào thư mục có dấu `!` (ví dụ "D:\Shop Oanh!\Tool_nhap_lieu"). Nút nào bật
 * `setlocal enabledelayedexpansion` thì cmd nuốt mất dấu `!` trong MỌI đường dẫn nó mở rộng — `%~dp0`, biến vòng `for` —
 * và báo "không tìm thấy cấu hình" trong khi file nằm ngay đó. Đo thật 14/9 trên bản 2.6.1: nút 1 "Khong thay thu muc cau
 * hinh", nút 2 "Khong tim thay file CAU_HINH_VAN_HANH.json" (mã không cập nhật), nút 4 cũng câu đó. Nút 3 đã sửa ở 2.6.1.
 */
test('N-44 nút 1, 2, 4 chạy THẬT trong thư mục có dấu `!`; không nút nào bật enabledelayedexpansion; nút 1 đọc mã thoát bước 5 SAU khi ping chạy', async () => {
  const BAT_LAI_BAY = (ten) => nutHong(ten, (s) => {
    if (s.split('setlocal\r\n').length !== 2) throw new Error('KHÔNG CẮM ĐƯỢC "setlocal enabledelayedexpansion" vào ' + ten + ' — sửa mốc');
    return s.replace('setlocal\r\n', () => 'setlocal enabledelayedexpansion\r\n');
  });
  const TEN = 'may!cham-than';
  const kq = [];

  // (0) hình dạng: không dòng lệnh nào bật delayed expansion, không một dấu `!` nào (N-28 chỉ soi file CÒN bật).
  const soiBay = (ten, s) => {
    const ra = [];
    s.split('\n').forEach((d, k) => {
      const c = d.replace(/\r$/, '');
      if (/^\s*setlocal\b.*enabledelayedexpansion/i.test(c)) ra.push(ten + ' dòng ' + (k + 1) + ' bật enabledelayedexpansion');
      if (c.indexOf('!') >= 0) ra.push(ten + ' dòng ' + (k + 1) + ' có dấu !');
    });
    return ra;
  };
  const hinh = [];
  NUT_BAT_BUOC.forEach((t) => soiBay(t, fs.readFileSync(path.join(THU_MUC, t), 'latin1')).forEach((x) => hinh.push(x)));
  dung(hinh.length === 0, hinh.join(' | '));
  dung(soiBay('bản cắm', 'setlocal enabledelayedexpansion\r\necho xong!\r\n').length === 2, 'ĐỐI CHỨNG ÂM: phép soi hình dạng mù');

  // (1) nút 4: đi tới bước chạy, chuyển ĐÚNG đường dẫn có `!` cho chay-thu.js
  const CHAY_GIA = "console.log('CHAY_THU nhan: ' + process.argv.slice(2).join(' | ')); process.exit(2);\n";
  const m4 = dungMay({ tenMay: TEN, banMa: '9.9.0', coThuVien: true, chayThuGia: CHAY_GIA });
  dung(m4.may.indexOf('!') > 0, 'thư mục máy giả phải có dấu !');
  const r4 = chayNut(m4.may, '4_CHAY_TOOL.bat');
  dung(r4.ma === 2 && r4.ra.indexOf('CHAY_THU nhan: --van-hanh | ' + m4.may) >= 0,
    'nút 4 trong thư mục có ! phải tới bước chạy với đúng đường dẫn, thoát mã 2; được mã ' + r4.ma + ': ' + (r4.ra.match(/LOI[^\r\n]*/) || ['?'])[0]);
  const dc4 = await doiChungAm('nut 4 bat lai enabledelayedexpansion', async () => {
    const h = dungMay({ tenMay: TEN, banMa: '9.9.0', coThuVien: true, chayThuGia: CHAY_GIA, thayNut: { '4_CHAY_TOOL.bat': BAT_LAI_BAY('4_CHAY_TOOL.bat') } });
    const r = chayNut(h.may, '4_CHAY_TOOL.bat');
    if (r.ma !== 2 || r.ra.indexOf('CHAY_THU nhan: --van-hanh | ' + h.may) < 0) throw new Error('mã ' + r.ma + ' · ' + (r.ra.match(/LOI[^\r\n]*/) || ['?'])[0]);
  });
  kq.push('nút 4 → tới bước chạy, đúng đường dẫn · ' + dc4);

  // (2) nút 1: ping được + bản dựng khớp → SAN SANG mã 0; ping hỏng → mã 3, KHÔNG được báo SAN SANG
  const PING = { phienBan: '9.9.0', banDung: 'abc123abc123', thangHienTai: '2026-09' };
  const m1 = dungMay({ tenMay: TEN, nut2Gia: true, banMa: '9.9.0', pingGia: PING, dauVanTay: 'abc123abc123' });
  const r1 = chayNut(m1.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(r1.ma === 0 && /\[6\/6\] SAN SANG\./.test(r1.ra), 'nút 1 trong thư mục có ! (ping được) phải SAN SANG mã 0; được mã ' + r1.ma + ': ' + (r1.ra.match(/LOI[^\r\n]*|\[6\/6\][^\r\n]*/) || ['?'])[0]);
  dung(/Ban dung tren Google {8}: abc123abc123 {2}= KHOP ma tren may nay/.test(r1.ra), 'nút 1 phải in bản dựng Google KHỚP mã trên máy');
  const r1b = chayNut(dungMay({ tenMay: TEN, nut2Gia: true, banMa: '9.9.0', pingGia: PING, dauVanTay: 'zzz999zzz999' }).may, '1_CAI_DAT_LAN_DAU.bat');
  dung(/Ban dung tren Google {8}: abc123abc123 {2}- KHAC ma tren may nay: zzz999zzz999/.test(r1b.ra), 'bản dựng lệch mà nút 1 không nói KHAC');
  const hong1 = dungMay({ tenMay: TEN, nut2Gia: true, banMa: '9.9.0' });
  const r1c = chayNut(hong1.may, '1_CAI_DAT_LAN_DAU.bat');
  dung(r1c.ma === 3 && /CHUA SAN SANG - goi len Google khong duoc/.test(r1c.ra) && !/\[6\/6\] SAN SANG\./.test(r1c.ra),
    'ping hỏng phải thoát mã 3 CHUA SAN SANG; được mã ' + r1c.ma);
  const dc1 = await doiChungAm('nut 1 bat lai enabledelayedexpansion', async () => {
    const h = dungMay({ tenMay: TEN, nut2Gia: true, banMa: '9.9.0', pingGia: PING, dauVanTay: 'abc123abc123', thayNut: { '1_CAI_DAT_LAN_DAU.bat': BAT_LAI_BAY('1_CAI_DAT_LAN_DAU.bat') } });
    const r = chayNut(h.may, '1_CAI_DAT_LAN_DAU.bat');
    if (r.ma !== 0) throw new Error('mã ' + r.ma + ' · ' + (r.ra.match(/LOI[^\r\n]*/) || ['?'])[0]);
  });
  // Cách sửa "dễ" mà sai: bỏ delayed expansion nhưng vẫn đọc %ERRORLEVEL% TRONG khối if (...) — cmd thay giá trị lúc đọc khối,
  // trước khi ping chạy, nên ping hỏng vẫn ra 0 và bước 6 báo SAN SANG.
  const banKhoi = nutHong('1_CAI_DAT_LAN_DAU.bat', (s) => {
    const a = 'if not "%MAGS%"=="0" goto bo_qua_ping\r\necho [5/6] Goi thu len Web App tren Google...\r\n';
    const b = 'set "MAPING=%ERRORLEVEL%"\r\ngoto sau_ping\r\n:bo_qua_ping\r\necho [5/6] Goi thu len Web App: BO QUA vi chua dien du cau hinh\r\n:sau_ping\r\n';
    if (s.split(a).length !== 2 || s.split(b).length !== 2) throw new Error('KHÔNG CẮM ĐƯỢC khối if (...) vào bước 5 nút 1 — sửa mốc');
    return s.replace(a, () => 'if "%MAGS%"=="0" (\r\necho [5/6] Goi thu len Web App tren Google...\r\n')
      .replace(b, () => 'set "MAPING=%ERRORLEVEL%"\r\n) else (\r\necho [5/6] Goi thu len Web App: BO QUA vi chua dien du cau hinh\r\n)\r\n');
  });
  const dcKhoi = await doiChungAm('doc ma thoat ping trong khoi if (...)', async () => {
    const h = dungMay({ tenMay: TEN, nut2Gia: true, banMa: '9.9.0', thayNut: { '1_CAI_DAT_LAN_DAU.bat': banKhoi } });
    const r = chayNut(h.may, '1_CAI_DAT_LAN_DAU.bat');
    if (r.ma !== 3 || /\[6\/6\] SAN SANG\./.test(r.ra)) throw new Error('ping hỏng mà thoát mã ' + r.ma + (/\[6\/6\] SAN SANG\./.test(r.ra) ? ' và báo SAN SANG' : ''));
  });
  kq.push('nút 1 → SAN SANG + KHOP/KHAC bản dựng · ping hỏng → mã 3 · ' + dc1 + ' · ' + dcKhoi);

  // (3) nút 2: cập nhật thật từ file zip trong thư mục có `!`
  const zipMoi = await dungZipKho('9.9.9');
  const m2 = dungMay({ tenMay: TEN, banMa: '9.9.0' });
  const r2 = chayNut(m2.may, '2_CAP_NHAT.bat', ['/nguon', zipMoi]);
  dung(r2.ma === 0 && fs.readFileSync(path.join(m2.tool, 'src', 'Main.gs'), 'utf8').indexOf('BAN TREN KHO 9.9.9') >= 0,
    'nút 2 trong thư mục có ! phải cập nhật xong (mã 0, src/ bản 9.9.9); được mã ' + r2.ma + ': ' + (r2.ra.match(/LOI[^\r\n]*/) || ['?'])[0]);
  dung(docCfg(m2.cfgTep).google_sheet.chuoi_bi_mat === BI_MAT_MOI, 'nút 2 đụng vào chuỗi bí mật');
  const dc2 = await doiChungAm('nut 2 bat lai enabledelayedexpansion', async () => {
    const h = dungMay({ tenMay: TEN, banMa: '9.9.0', thayNut: { '2_CAP_NHAT.bat': BAT_LAI_BAY('2_CAP_NHAT.bat') } });
    const r = chayNut(h.may, '2_CAP_NHAT.bat', ['/nguon', zipMoi]);
    if (r.ma !== 0 || fs.readFileSync(path.join(h.tool, 'src', 'Main.gs'), 'utf8').indexOf('BAN TREN KHO 9.9.9') < 0) {
      throw new Error('mã ' + r.ma + ' · ' + (r.ra.match(/LOI[^\r\n]*/) || ['?'])[0]);
    }
  });
  kq.push('nút 2 → cập nhật xong, bí mật y nguyên · ' + dc2);
  return '4 nút: 0 dòng bật delayed expansion, 0 dấu ! · ' + kq.join(' · ');
});

/**
 * YC-42 điểm 4–5: đường lùi trên máy user. Tới 2.6.1 nút 2 có sao lưu `_ban_cu_<…>` nhưng KHÔNG có cách lùi — bấm lại chỉ
 * báo "đang là bản mới nhất". Nay `2_CAP_NHAT.bat /lui` chép ngược bản sao lưu gần nhất CŨ HƠN bản đang chạy, và mỗi lượt
 * cập nhật in sẵn đường lùi. Chạy THẬT bằng cmd.exe, đo từng byte.
 */
test('N-45 2_CAP_NHAT.bat /lui: lùi từng bản 9.9.0 → 9.8.0 → 9.7.0 rồi dừng (mã 11), cấu hình y nguyên TỪNG BYTE; không có bản sao lưu → câu chỉ đường, không đụng gì; cập nhật xong in đường lùi', async () => {
  const docBan = (m) => JSON.parse(fs.readFileSync(path.join(m.tool, 'package.json'), 'utf8')).version;
  const dungSaoLuu = (m, ten, ban, them) => {
    const d = path.join(m.cauHinh, ten);
    fs.mkdirSync(path.join(d, 'src'), { recursive: true });
    fs.mkdirSync(path.join(d, 'node'), { recursive: true });
    fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ name: 'keodon', version: ban }, null, 2), 'utf8');
    fs.writeFileSync(path.join(d, 'src', 'Main.gs'), '// BAN SAO LUU ' + ban, 'utf8');
    fs.writeFileSync(path.join(d, 'node', 'chay-thu.js'), '// BAN SAO LUU ' + ban, 'utf8');
    if (them) them(d);
  };
  const dungMayLui = (thayNut, them) => {
    const m = dungMay({ banMa: '9.9.0', thayNut: thayNut });
    dungSaoLuu(m, '_ban_cu_20260101_0900', '9.8.0', them);
    dungSaoLuu(m, '_ban_cu_20251201_0900', '9.7.0', them);
    return m;
  };
  const cayMa = (m) => ['package.json', 'src/Main.gs', 'node/chay-thu.js'].map((t) => fs.readFileSync(path.join(m.tool, t)).toString('base64')).join('|');

  // (b) lùi từng bản, rồi dừng
  const m = dungMayLui();
  const cfg0 = tho(m.cfgTep);
  const r1 = chayNut(m.may, '2_CAP_NHAT.bat', ['/lui']);
  dung(r1.ma === 0 && docBan(m) === '9.8.0', 'lượt 1 phải lùi về 9.8.0 mã 0; được mã ' + r1.ma + ', bản ' + docBan(m) + ': ' + (r1.ra.match(/LOI[^\r\n]*/) || [''])[0]);
  dung(fs.readFileSync(path.join(m.tool, 'src', 'Main.gs'), 'utf8') === '// BAN SAO LUU 9.8.0' &&
    fs.readFileSync(path.join(m.tool, 'node', 'chay-thu.js'), 'utf8') === '// BAN SAO LUU 9.8.0', 'src/ hoặc node/ không về đúng bản sao lưu 9.8.0');
  dung(/DA LUI XONG\.\s+9\.9\.0\s+->\s+9\.8\.0/.test(r1.ra) && /_ban_cu_20260101_0900/.test(r1.ra), 'phải in rõ lùi từ bản nào về bản nào, lấy từ đâu');
  dung(cungByte(tho(m.cfgTep), cfg0), 'lượt 1: CAU_HINH_VAN_HANH.json bị đụng');
  const r2 = chayNut(m.may, '2_CAP_NHAT.bat', ['/lui']);
  dung(r2.ma === 0 && docBan(m) === '9.7.0', 'lượt 2 phải lùi tiếp về 9.7.0; được mã ' + r2.ma + ', bản ' + docBan(m));
  const truoc3 = cayMa(m);
  const r3 = chayNut(m.may, '2_CAP_NHAT.bat', ['/lui']);
  dung(r3.ma === 11 && /KHONG CO BAN CU HON DE LUI/.test(r3.ra) && cayMa(m) === truoc3, 'hết bản cũ hơn phải thoát mã 11, không đụng file; được mã ' + r3.ma);
  dung(cungByte(tho(m.cfgTep), cfg0), 'sau ba lượt /lui CAU_HINH_VAN_HANH.json không còn y nguyên');

  // (c) không có bản sao lưu nào
  const k = dungMay({ banMa: '9.9.0' });
  const cayK = cayMa(k), cfgK = tho(k.cfgTep);
  const rk = chayNut(k.may, '2_CAP_NHAT.bat', ['/lui']);
  dung(rk.ma === 11 && /KHONG CO BAN CU HON DE LUI/.test(rk.ra) && /_ban_cu_/.test(rk.ra), 'không có bản sao lưu phải thoát mã 11 và chỉ đường; được mã ' + rk.ma);
  dung(cayMa(k) === cayK && cungByte(tho(k.cfgTep), cfgK), 'không có bản sao lưu mà vẫn đụng vào file');

  // (5) cập nhật bình thường xong in đường lùi
  const zipMoi = await dungZipKho('9.9.9');
  const u = dungMay({ banMa: '9.9.0' });
  const ru = chayNut(u.may, '2_CAP_NHAT.bat', ['/nguon', zipMoi]);
  dung(ru.ma === 0 && /Ban cu da luu o: _ban_cu_\d{8}_\d{4}\S* - bam  2_CAP_NHAT\.bat \/lui  neu can quay lai\./.test(ru.ra),
    'cập nhật xong phải in dòng đường lùi; được mã ' + ru.ma + ': ' + (ru.ra.match(/Ban cu[^\r\n]*/) || ['(không có)'])[0]);

  // ĐỐI CHỨNG ÂM 1 — lùi đè cả cấu hình (bản sao lưu có lẫn một file cấu hình cũ)
  const banDeCfg = nutHong('2_CAP_NHAT.bat', (s) => s.replace(
    "      Copy-Item -LiteralPath (Join-Path $chon.Duong 'package.json') -Destination $pkgDang -Force\r\n",
    () => "      Copy-Item -LiteralPath (Join-Path $chon.Duong 'package.json') -Destination $pkgDang -Force\r\n" +
      "      if (Test-Path -LiteralPath (Join-Path $chon.Duong 'CAU_HINH_VAN_HANH.json')) { Copy-Item -LiteralPath (Join-Path $chon.Duong 'CAU_HINH_VAN_HANH.json') -Destination $cfgTep -Force }\r\n"));
  const dc1 = await doiChungAm('lui de ca cau hinh', async () => {
    const h = dungMayLui({ '2_CAP_NHAT.bat': banDeCfg }, (d) => fs.writeFileSync(path.join(d, 'CAU_HINH_VAN_HANH.json'), '{"cau_hinh":"cu"}', 'utf8'));
    const t0 = tho(h.cfgTep);
    chayNut(h.may, '2_CAP_NHAT.bat', ['/lui']);
    if (!cungByte(tho(h.cfgTep), t0)) throw new Error('CAU_HINH_VAN_HANH.json bị bản sao lưu đè');
  });
  // ĐỐI CHỨNG ÂM 2 — nhận cả bản sao lưu KHÔNG cũ hơn: lượt thứ ba không dừng, cứ chép lại mãi
  const banKhongDung = nutHong('2_CAP_NHAT.bat', (s) => s.replace('((SoSanh $x.So $vDang) -lt 0)', () => '((SoSanh $x.So $vDang) -le 0)'));
  const dc2 = await doiChungAm('nhan ban sao luu khong cu hon', async () => {
    const h = dungMayLui({ '2_CAP_NHAT.bat': banKhongDung });
    chayNut(h.may, '2_CAP_NHAT.bat', ['/lui']);
    chayNut(h.may, '2_CAP_NHAT.bat', ['/lui']);
    const r = chayNut(h.may, '2_CAP_NHAT.bat', ['/lui']);
    if (r.ma !== 11) throw new Error('hết bản cũ hơn mà lượt 3 thoát mã ' + r.ma);
  });
  // ĐỐI CHỨNG ÂM 3 — quên in đường lùi
  const banKhongIn = nutHong('2_CAP_NHAT.bat', (s) => s.replace(
    "    Bao ('  Ban cu da luu o: ' + $bakTen + ' - bam  2_CAP_NHAT.bat /lui  neu can quay lai.')\r\n", () => ''));
  const dc3 = await doiChungAm('quen in duong lui', async () => {
    const h = dungMay({ banMa: '9.9.0', thayNut: { '2_CAP_NHAT.bat': banKhongIn } });
    const r = chayNut(h.may, '2_CAP_NHAT.bat', ['/nguon', zipMoi]);
    if (!/2_CAP_NHAT\.bat \/lui/.test(r.ra)) throw new Error('không có dòng đường lùi');
  });
  return '9.9.0 → 9.8.0 → 9.7.0 → mã 11 · cấu hình y nguyên từng byte · không bản sao lưu → mã 11, 0 file đổi · cập nhật in đường lùi · ' +
    [dc1, dc2, dc3].join(' · ');
});

test('N-34 4_CHAY_TOOL.bat: thieu cau hinh va thieu thu vien deu phai chan bang cau tieng Viet', async () => {
  // Hai cửa chưa bài nào chạm: `if not defined CFGDIR` và cửa kiểm `node_modules\exceljs`.
  // (CN-07 của test-dong-goi.js mới đo cửa thứ ba: `if not defined TOOL`.)
  // Cửa thư viện hỏng thì user nhận nguyên một vệt lỗi thô của Node giữa màn hình đen.
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
      throw new Error('loi tho cua Node lot thang ra man hinh user: '
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
