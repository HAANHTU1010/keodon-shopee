#!/usr/bin/env node
/**
 * cai-dat-mac.js — RUỘT của nút 1 (cài đặt lần đầu) và nút 2 (cập nhật) bản macOS.
 *
 * VÌ SAO LÀ JAVASCRIPT, KHÔNG PHẢI SHELL. Bản Windows viết hai nút này bằng
 * `.bat` + PowerShell, hết 944 dòng. Viết lại bằng `sh` là dựng lần thứ ba cùng
 * một nghiệp vụ (tải, sao lưu, chép đè, lùi) trên một thứ ngôn ngữ khó test.
 * Máy Mac BẮT BUỘC phải có Node mới chạy được tool, nên hai nút này cứ đòi Node
 * trước rồi làm phần còn lại bằng Node: đọc được cấu hình JSON tử tế, chép thư
 * mục có kiểm, và `node/test-mac.js` chạy thẳng được nó ngay trên máy dev.
 *
 * FILE NÀY ĐI TRONG GÓI GIAO, KHÔNG PHẢI MÃ CỦA TOOL. Nó không `require` gì của
 * `src/` hay `node/` (lúc cài lần đầu chưa có), chỉ dùng thư viện chuẩn của Node.
 *
 * GIỮ ĐÚNG LUẬT CỦA BẢN WINDOWS (`bat/2_CAP_NHAT.bat`):
 *   · CHỈ thay `src/`, `node/`, `package.json` và bốn nút; KHÔNG BAO GIỜ đụng
 *     `CAU_HINH_VAN_HANH.json` (chứa khóa ghi) và thư mục `1_THA_FILE_XUAT`.
 *   · Sao lưu bản đang chạy vào `_ban_cu_<mốc>` cạnh cấu hình, giữ 3 bản gần nhất.
 *   · `--lui`: chép ngược bản sao lưu GẦN NHẤT MÀ CŨ HƠN bản đang chạy; hết bản
 *     để lùi thì thoát mã 11 và nói rõ.
 *   · `npm install` chỉ chạy khi DANH SÁCH thư viện đổi, không chạy mỗi lần.
 *
 * MÃ THOÁT: 0 xong · 1 lỗi có câu chỉ việc · 11 không còn bản cũ để lùi.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync, spawnSync } = require('child_process');

const TEN_CAU_HINH = 'CAU_HINH_VAN_HANH.json';
const TEN_MA = 'keodon-apps-script';
const CHEP = ['src', 'node', 'package.json'];          // đúng ba thứ, như nút 2 của Windows
const NUT_MAC = ['1_CAI_DAT_LAN_DAU.command', '2_CAP_NHAT.command', '3_TAO_FILE_THANG_MOI.command',
  '4_CHAY_TOOL.command', 'keodon-mac.sh'];
const GIU_BAN_CU = 3;

// ----------------------------------------------------------------- in ra màn hình
const noi = (t) => console.log(t === undefined ? '' : t);
const vach = () => noi('------------------------------------------------------------');

function chet(cau, viec) {
  noi('LỖI: ' + cau);
  noi('');
  if (viec) { noi('  Cách sửa: ' + viec); noi(''); }
  process.exit(1);
}

// ----------------------------------------------------------------- tham số
function thamSo(argv) {
  const o = { viec: 'cap-nhat', goc: process.cwd(), lui: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--viec') o.viec = argv[++i];
    else if (argv[i] === '--goc') o.goc = argv[++i];
    else if (argv[i] === '--lui' || argv[i] === '/lui') o.lui = true;
  }
  return o;
}

// ----------------------------------------------------------------- tìm chỗ
function thuMucCauHinh(goc) {
  if (fs.existsSync(path.join(goc, TEN_CAU_HINH))) return goc;
  for (const t of fs.readdirSync(goc, { withFileTypes: true })) {
    if (!t.isDirectory()) continue;
    const d = path.join(goc, t.name);
    if (fs.existsSync(path.join(d, TEN_CAU_HINH))) return d;
    if (fs.existsSync(path.join(d, 'CAU_HINH_VAN_HANH.mau.json'))) return d;
  }
  return null;
}

function docCauHinh(tep) {
  let s;
  try { s = fs.readFileSync(tep, 'utf8').replace(/^﻿/, ''); } catch (e) {
    chet('không đọc được ' + TEN_CAU_HINH + '.', 'gửi người phụ trách kỹ thuật file đó.');
  }
  try { return JSON.parse(s); } catch (e) {
    chet('file ' + TEN_CAU_HINH + ' đang sai định dạng nên không đọc được.',
      'mở file đó bằng TextEdit, so với bản mẫu; sai một dấu phẩy là hỏng. Không tự đoán — gửi người phụ trách.');
  }
  return null;
}

// ----------------------------------------------------------------- chép thư mục
/** Chép `tu` đè lên `vao` bằng cách dựng bản mới rồi ĐỔI TÊN — nửa chừng hỏng thì bản cũ còn nguyên. */
function thayThuMuc(tu, vao) {
  const tam = vao + '.moi-' + Date.now();
  fs.cpSync(tu, tam, { recursive: true });
  const cu = vao + '.cu-' + Date.now();
  if (fs.existsSync(vao)) fs.renameSync(vao, cu);
  fs.renameSync(tam, vao);
  if (fs.existsSync(cu)) fs.rmSync(cu, { recursive: true, force: true });
}

function chepMotThu(tu, vao) {
  if (!fs.existsSync(tu)) return false;
  if (fs.statSync(tu).isDirectory()) thayThuMuc(tu, vao);
  else fs.cpSync(tu, vao);
  return true;
}

// ----------------------------------------------------------------- tải mã từ GitHub
function taiVe(url, tep) {
  return new Promise((ok, hong) => {
    const di = (u, con) => {
      https.get(u, { headers: { 'User-Agent': 'keodon-mac' } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location && con > 0) {
          r.resume(); return di(r.headers.location, con - 1);
        }
        if (r.statusCode !== 200) { r.resume(); return hong(new Error('HTTP ' + r.statusCode)); }
        const f = fs.createWriteStream(tep);
        r.pipe(f);
        f.on('finish', () => f.close(() => ok()));
        f.on('error', hong);
      }).on('error', hong);
    };
    di(url, 5);
  });
}

async function keoMaVe(cn) {
  const chu = (cn && cn.chu_tai_khoan || '').trim();
  const repo = (cn && cn.ten_repo || '').trim();
  const nhanh = (cn && cn.nhanh || 'main').trim() || 'main';
  if (!chu || !repo) {
    chet('cấu hình chưa khai kho mã trên GitHub nên không tải được bản mới.',
      'mở ' + TEN_CAU_HINH + ', điền "chu_tai_khoan" và "ten_repo" trong mục "cap_nhat" — hai tên này do người phụ trách kỹ thuật cho biết.');
  }
  const url = 'https://codeload.github.com/' + chu + '/' + repo + '/tar.gz/refs/heads/' + nhanh;
  const tam = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-tai-'));
  const tep = path.join(tam, 'ma.tar.gz');
  noi('Đang tải bản mới từ GitHub (' + chu + '/' + repo + ', nhánh ' + nhanh + ') …');
  try {
    await taiVe(url, tep);
  } catch (e) {
    fs.rmSync(tam, { recursive: true, force: true });
    chet('không tải được mã từ GitHub (' + String(e.message).slice(0, 60) + ').',
      'kiểm ba thứ: (1) máy có mạng không; (2) tên kho mã trong cấu hình có đúng không; (3) mạng công ty có chặn github.com không.');
  }
  try {
    execFileSync('tar', ['-xzf', tep, '-C', tam]);     // macOS có sẵn bsdtar; Git Bash trên Windows cũng có
  } catch (e) {
    fs.rmSync(tam, { recursive: true, force: true });
    chet('tải về được nhưng không giải nén được gói mã.', 'gửi người phụ trách kỹ thuật câu lỗi này.');
  }
  const con = fs.readdirSync(tam).filter((t) => fs.statSync(path.join(tam, t)).isDirectory());
  const goc = con.map((t) => path.join(tam, t)).filter((d) => fs.existsSync(path.join(d, 'package.json')))[0];
  if (!goc) {
    fs.rmSync(tam, { recursive: true, force: true });
    chet('gói mã tải về không đúng hình dạng (thiếu package.json).', 'gửi người phụ trách kỹ thuật.');
  }
  return { tam, goc };
}

// ----------------------------------------------------------------- phiên bản + thư viện
function banCua(d) {
  try { return JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')).version || '?'; } catch (e) { return '?'; }
}

/** Chuỗi đại diện DANH SÁCH thư viện — chỉ đổi chuỗi này mới phải chạy `npm install`. */
function chuoiThuVien(d) {
  try {
    const p = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8'));
    return JSON.stringify(p.dependencies || {});
  } catch (e) { return ''; }
}

/** npm của bản Node xách tay kèm trong gói (nếu có) — để máy Mac không phải cài gì. */
function npmXachTay(base) {
  const kt = process.arch === 'arm64' ? 'arm64' : 'x64';
  const cli = path.join(base, 'node-portable-mac-' + kt, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  return fs.existsSync(cli) ? cli : null;
}

function chayNpm(tool, base) {
  noi('Đang cài thư viện (npm install) — lần đầu mất 1–2 phút …');
  const cli = base ? npmXachTay(base) : null;
  const r = cli
    ? spawnSync(process.execPath, [cli, 'install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: tool, stdio: 'inherit' })
    : spawnSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: tool, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    chet('npm install không xong nên tool chưa đọc được file .xlsx.',
      'mở Terminal, gõ:  cd "' + tool + '"  rồi  npm install  — và gửi người phụ trách kỹ thuật dòng lỗi cuối cùng.');
  }
}

// ----------------------------------------------------------------- sao lưu / lùi
function mocThoiGian() {
  const d = new Date(Date.now() + 7 * 3600 * 1000);      // giờ Việt Nam, như cả dự án
  const hai = (x) => String(x).padStart(2, '0');
  return d.getUTCFullYear() + hai(d.getUTCMonth() + 1) + hai(d.getUTCDate()) + '-' + hai(d.getUTCHours()) + hai(d.getUTCMinutes());
}

function danhSachBanCu(base) {
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((t) => t.isDirectory() && /^_ban_cu_/.test(t.name))
    .map((t) => ({ ten: t.name, duong: path.join(base, t.name), ban: banCua(path.join(base, t.name)) }))
    .sort((a, b) => (a.ten < b.ten ? 1 : -1));            // mới nhất trước
}

function saoLuu(base, tool) {
  if (!fs.existsSync(path.join(tool, 'package.json'))) return null;   // lần cài đầu: chưa có gì để lưu
  let d = path.join(base, '_ban_cu_' + mocThoiGian());
  let k = 2;
  while (fs.existsSync(d)) d = path.join(base, '_ban_cu_' + mocThoiGian() + '_' + k++);
  fs.mkdirSync(d, { recursive: true });
  for (const t of CHEP) {
    const tu = path.join(tool, t);
    if (fs.existsSync(tu)) fs.cpSync(tu, path.join(d, t), { recursive: true });
  }
  for (const b of danhSachBanCu(base).slice(GIU_BAN_CU)) fs.rmSync(b.duong, { recursive: true, force: true });
  return d;
}

function lui(base, tool) {
  const dangChay = banCua(tool);
  const ds = danhSachBanCu(base);
  const cu = ds.filter((b) => b.ban !== dangChay)[0];
  noi('LÙI VỀ BẢN CŨ — lấy lại bản đã sao lưu trước lần cập nhật gần nhất.');
  noi('Bản đang chạy      : ' + dangChay);
  if (!ds.length || !cu) {
    noi('');
    noi('KHÔNG CÒN BẢN CŨ ĐỂ LÙI. Máy chỉ giữ bản sao lưu của ' + GIU_BAN_CU + ' lần cập nhật gần nhất');
    noi('(thư mục tên bắt đầu bằng  _ban_cu_  cạnh file cấu hình). Cần bản cũ hơn thì báo người phụ trách kỹ thuật.');
    noi('Cấu hình và thư mục thả file KHÔNG đụng tới.');
    process.exit(11);
  }
  noi('Lùi về bản        : ' + cu.ban + '  (' + cu.ten + ')');
  for (const t of CHEP) {
    const tu = path.join(cu.duong, t);
    if (fs.existsSync(tu)) chepMotThu(tu, path.join(tool, t));
  }
  if (chuoiThuVien(cu.duong) !== chuoiThuVien(tool)) chayNpm(tool, base);
  noi('');
  vach();
  noi('  ĐÃ LÙI. Bản đang chạy bây giờ: ' + banCua(tool));
  noi('  Cấu hình giữ nguyên từng chữ. Bấm nút này lần nữa là lùi thêm một bản.');
  noi('  Muốn lên lại bản mới: bấm  2_CAP_NHAT.command  như thường.');
  vach();
  process.exit(0);
}

// ----------------------------------------------------------------- gọi thử Web App
function goiThu(tool, cfg) {
  try {
    const { WebAppGoogleSheet } = require(path.join(tool, 'node', 'gsheet-web-app.js'));
    const gs = Object.assign({}, cfg.google_sheet || {}, { bat: true });
    if (!gs.web_app_url || !gs.chuoi_bi_mat) { noi('[5/6] Gọi thử lên Web App: BỎ QUA vì chưa điền đủ cấu hình'); return 9; }
    const web = new WebAppGoogleSheet(gs);
    return web.ping().then((r) => {
      noi('[5/6] Gọi thử lên Web App: OK');
      noi('       Bản đang Deploy trên Google : ' + ((r && (r.banWebApp || r.phienBan)) || '?'));
      const bd = web.banDungWebApp;
      if (bd) noi('       Bản dựng trên Google        : ' + bd + (bd === banDungMay(tool) ? '  = KHỚP mã trên máy này' : '  — KHÁC mã trên máy này'));
      return 0;
    }, (e) => { noi('[5/6] Gọi thử lên Web App: KHÔNG XONG — ' + String(e && e.message).slice(0, 120)); return 1; });
  } catch (e) {
    noi('[5/6] Gọi thử lên Web App: BỎ QUA (' + String(e && e.message).slice(0, 80) + ')');
    return 9;
  }
}

function banDungMay(tool) {
  try {
    const s = fs.readFileSync(path.join(tool, 'src', 'ShellAppsScript.gs'), 'utf8');
    const m = /var BAN_DUNG = '([^']+)'/.exec(s);
    return m ? m[1] : '?';
  } catch (e) { return '?'; }
}

// ----------------------------------------------------------------- việc chính
async function main() {
  const o = thamSo(process.argv.slice(2));
  const base = thuMucCauHinh(o.goc);
  if (!base) {
    chet('không tìm thấy file ' + TEN_CAU_HINH + '.',
      'file đó phải nằm trong thư mục  Cấu hình  , ngay cạnh bốn nút. Nếu vừa giải nén gói mà không thấy, báo người phụ trách kỹ thuật.');
  }
  const tepCfg = path.join(base, TEN_CAU_HINH);
  if (!fs.existsSync(tepCfg)) {
    const mau = path.join(base, 'CAU_HINH_VAN_HANH.mau.json');
    if (!fs.existsSync(mau)) chet('thiếu cả ' + TEN_CAU_HINH + ' lẫn bản mẫu.', 'lấy lại gói giao từ người phụ trách kỹ thuật.');
    fs.cpSync(mau, tepCfg);
    noi('Vừa tạo ' + TEN_CAU_HINH + ' từ bản mẫu — phải điền link Web App và khóa trước khi chạy nút 4.');
  }
  const cfg = docCauHinh(tepCfg);
  const tool = path.join(base, TEN_MA);

  if (o.lui) return lui(base, tool);

  // [1] Node — đã có (chính file này đang chạy bằng Node), chỉ in ra cho người bấm yên tâm.
  noi('[1/6] Node.js: OK (' + process.version + (npmXachTay(base) ? ', bản xách tay kèm trong gói' : ', bản cài trên máy') + ')');

  // [2] kho mã
  const { tam, goc } = await keoMaVe(cfg.cap_nhat);
  noi('[2/6] Đã tải bản ' + banCua(goc) + ' từ GitHub');

  // [3] sao lưu bản đang chạy
  const luu = saoLuu(base, tool);
  noi('[3/6] ' + (luu ? 'Đã sao lưu bản đang chạy (' + banCua(tool) + ') vào ' + path.basename(luu) : 'Lần cài đầu — chưa có bản nào để sao lưu'));

  // [4] chép mã + nút, rồi npm install nếu danh sách thư viện đổi
  const thuVienCu = chuoiThuVien(tool);
  fs.mkdirSync(tool, { recursive: true });
  for (const t of CHEP) {
    if (!chepMotThu(path.join(goc, t), path.join(tool, t))) chet('gói mã tải về thiếu "' + t + '".', 'gửi người phụ trách kỹ thuật.');
  }
  for (const n of NUT_MAC) {
    const tu = path.join(goc, 'mac', n);
    if (fs.existsSync(tu) && n !== '2_CAP_NHAT.command') {       // không tự ghi đè chính nút đang chạy
      fs.cpSync(tu, path.join(o.goc, n));
      try { fs.chmodSync(path.join(o.goc, n), 0o755); } catch (e) { /* Windows không cần */ }
    }
  }
  const capNhatMoi = path.join(goc, 'mac', 'cai-dat-mac.js');
  if (fs.existsSync(capNhatMoi)) fs.cpSync(capNhatMoi, path.join(o.goc, 'cai-dat-mac.js'));
  fs.rmSync(tam, { recursive: true, force: true });
  noi('[4/6] Đã chép mã mới: src, node, package.json và các nút');

  if (chuoiThuVien(tool) !== thuVienCu || !fs.existsSync(path.join(tool, 'node_modules', 'exceljs'))) chayNpm(tool, base);
  else noi('       Danh sách thư viện không đổi → bỏ qua npm install');

  const ma = await goiThu(tool, cfg);

  noi('');
  noi('============================================================');
  if (ma === 0) {
    noi('  [6/6] SẴN SÀNG. Bản đang chạy: ' + banCua(tool));
    noi('');
    noi('  Việc hằng ngày: thả file xuất vào  1_THA_FILE_XUAT/<tên gian hàng>/');
    noi('  rồi bấm đúp  4_CHAY_TOOL.command');
  } else if (ma === 9) {
    noi('  [6/6] ĐÃ CÀI MÃ, CHƯA GỌI ĐƯỢC GOOGLE.');
    noi('  Điền nốt link Web App và khóa trong ' + TEN_CAU_HINH + ' rồi bấm lại nút này.');
  } else {
    noi('  [6/6] ĐÃ CÀI MÃ NHƯNG GỌI THỬ GOOGLE KHÔNG XONG.');
    noi('  Đọc dòng [5/6] ở trên; thường là mạng, hoặc link Web App / khóa sai.');
  }
  noi('============================================================');
  noi('  Đường lùi: bấm  2_CAP_NHAT.command  với tham số  /lui  (mở Terminal, kéo file');
  noi('  vào rồi gõ thêm  /lui ) — lấy lại bản trước, cấu hình giữ nguyên.');
  noi('============================================================');
  process.exit(ma === 1 ? 1 : 0);
}

// Chạy thẳng thì làm việc; bị `require` (bộ test `node/test-mac.js`) thì chỉ mở ruột ra để chấm từng phép.
if (require.main === module) {
  main().catch((e) => {
    noi('LỖI KHÔNG ĐOÁN TRƯỚC: ' + String(e && e.message));
    noi('Chụp màn hình gửi người phụ trách kỹ thuật.');
    process.exit(1);
  });
}

module.exports = { thamSo, thuMucCauHinh, docCauHinh, thayThuMuc, chepMotThu, banCua, chuoiThuVien, mocThoiGian, danhSachBanCu, saoLuu, lui, CHEP, GIU_BAN_CU };
