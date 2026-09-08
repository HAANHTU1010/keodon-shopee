/**
 * test-bat-bien.js — chạy bộ TEST BẤT BIẾN (KE_HOACH_KIEM_THU bảng A5 + INV-10 của GV-v2.3 mục 2.2).
 *
 * Hai phần:
 *   1. `src/tests/TestBatBien.gs` — các bất biến kiểm được trong bộ nhớ, chạy cả trong Apps Script.
 *   2. Phần dưới đây — các bất biến BẮT BUỘC phải có file thật hoặc phải quét mã nguồn:
 *        INV-5  băm file gốc trước/sau một lần chạy thật
 *        INV-7  quét log và mã nguồn tìm chuỗi bí mật, URL Web App
 *        INV-9  băm thư mục `src/tests/` để BA đối chiếu giữa các đợt
 *        INV-10 không đọc quá cột C và không đọc trên dòng 8 của sheet `Thông tin shop `
 *
 * Chạy: `node node/test-bat-bien.js`. Thoát mã 1 nếu có bất biến bị vi phạm.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { napLoi, SRC } = require('./nap-loi');
const { KhoTracking, duongDanOut, docBangXlsx, TEN_SHEET_MAPPING } = require('./kho-tracking');
const { NguonThuMuc } = require('./nguon-thu-muc');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const TRACKING = path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');
const FILE_XUAT = path.join(DAU_VAO, 'Order.toship.20260807_20260906.xlsx');
const MAP_NT1 = path.join(ROOT, '..', '..', '01_TAI_LIEU', 'NGHIEM_THU_NT1', 'MAP_LISTING_SP_MALL_NT1.xlsx');

function phai(dk, msg) { if (!dk) throw new Error(msg); }
function bam(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

/** Nạp lõi kèm TestBatBien.gs — `nap-loi.js` cố ý không nạp file này để bộ lõi giữ nguyên. */
function napKemBatBien() {
  // Nạp thêm cả vỏ Google: hai bài INV-3 gọi thẳng `ghiMotSheet_` của `ShellAppsScript.gs`.
  // File đó chỉ khai hằng số và hàm ở cấp cao nhất, không gọi dịch vụ Google lúc nạp, nên chạy
  // được trong Node — `node/test-dinh-tuyen-thang.js` cũng nạp đúng cách này.
  const THEM = [path.join(SRC, 'ShellAppsScript.gs'), path.join(SRC, 'tests', 'TestBatBien.gs')];
  const goc = napLoi();
  const src = THEM.map((f) => fs.readFileSync(f, 'utf8')).join(String.fromCharCode(10, 59, 10));
  const ten = [];
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.push(m[1]);
  const khai = Object.keys(goc).map((k) => 'var ' + k + ' = __loi["' + k + '"];').join('\n');
  const than = khai + '\n' + src + '\nreturn {' + ten.map((n) => n + ': ' + n).join(', ') + '};';
  const them = new Function('__loi', than)(goc);   // eslint-disable-line no-new-func
  return Object.assign({}, goc, them);
}

const TESTS = [];
function test(ma, ten, fn) { TESTS.push({ ma, ten, fn }); }

// ---------------------------------------------------------------- INV-5

test('INV-5', 'Không ghi đè file gốc: băm và thời điểm sửa của file xuất, file tracking, file Mapping không đổi sau một lần chạy thật', async () => {
  const lop = napLoi();
  const cfg = lop.Config.tao();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'invariant-'));
  const vao = path.join(tmp, 'vao', 'SP_MALL');
  fs.mkdirSync(vao, { recursive: true });
  fs.copyFileSync(FILE_XUAT, path.join(vao, path.basename(FILE_XUAT)));

  const nguon = [TRACKING, FILE_XUAT, MAP_NT1];
  const truoc = nguon.map((p) => ({ bam: bam(p), mtime: fs.statSync(p).mtimeMs }));

  const thoiDiem = new Date(2026, 8, 7, 8, 0, 0);
  const out = duongDanOut(TRACKING, path.join(tmp, 'out'), thoiDiem, lop);
  const kho = new KhoTracking(TRACKING, out, lop, { mappingKhoiTao: await docBangXlsx(MAP_NT1, TEN_SHEET_MAPPING) });
  await kho.nap(cfg);
  const kq = lop.chayDongBo(new NguonThuMuc(path.join(tmp, 'vao'), path.join(tmp, 'ra')), kho,
    { thoiDiem, ngayGhi: '2026-09-07', cfg });
  await kho.luu();
  phai(kq.donGhi > 0, 'phải thật sự ghi thì phép kiểm mới có nghĩa, thực tế ghi ' + kq.donGhi + ' đơn');

  const sau = nguon.map((p) => ({ bam: bam(p), mtime: fs.statSync(p).mtimeMs }));
  for (let i = 0; i < nguon.length; i++) {
    phai(truoc[i].bam === sau[i].bam, 'BĂM ĐỔI: ' + path.basename(nguon[i]));
    phai(truoc[i].mtime === sau[i].mtime, 'THỜI ĐIỂM SỬA ĐỔI: ' + path.basename(nguon[i]));
  }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* thư mục còn khóa thì thôi */ }
  return 'ghi ' + kq.donGhi + ' đơn · 3 file gốc giữ nguyên băm và thời điểm sửa';
});

// ---------------------------------------------------------------- INV-7

test('INV-7', 'Không in chuỗi bí mật hay URL Web App: mã nguồn không chứa link /exec, không chứa chuỗi bí mật viết cứng', async () => {
  const viPham = [];
  const duyet = (thuMuc) => {
    for (const t of fs.readdirSync(thuMuc)) {
      const p = path.join(thuMuc, t);
      if (fs.statSync(p).isDirectory()) { if (t !== 'node_modules' && t !== 'out') duyet(p); continue; }
      if (!/\.(js|gs|json)$/i.test(t)) continue;
      const s = fs.readFileSync(p, 'utf8');
      s.split('\n').forEach((dong, i) => {
        // link /exec thật của Apps Script (không tính chuỗi mẫu trong hướng dẫn)
        if (/https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{30,}/.test(dong))
          viPham.push(path.relative(ROOT, p) + ':' + (i + 1) + ' chứa link /exec thật');
        // gán chuỗi bí mật cứng vào biến
        if (/(SECRET|chuoi_?[Bb]i[Mm]at|biMat)\s*[:=]\s*['"][^'"]{12,}['"]/.test(dong) && !/\bprocess\.env\b/.test(dong))
          viPham.push(path.relative(ROOT, p) + ':' + (i + 1) + ' gán chuỗi bí mật viết cứng');
      });
    }
  };
  duyet(path.join(ROOT, 'src'));
  duyet(path.join(ROOT, 'node'));
  phai(viPham.length === 0, 'VI PHẠM:\n      ' + viPham.join('\n      '));

  // cấu hình vận hành: hai dòng bí mật phải RỖNG trong bản giao đi
  const cfgVH = path.join(ROOT, '..', '..', '03_VAN_HANH', 'CAU_HINH_VAN_HANH.json');
  if (fs.existsSync(cfgVH)) {
    const g = JSON.parse(fs.readFileSync(cfgVH, 'utf8')).google_sheet || {};
    phai(!g.web_app_url && !g.chuoi_bi_mat,
      'CAU_HINH_VAN_HANH.json đang chứa link hoặc chuỗi bí mật — không được giao đi kèm bí mật');
  }
  return 'quét src/ và node/ · 0 chỗ lộ link /exec hoặc chuỗi bí mật · cấu hình vận hành để trống hai dòng bí mật';
});

// ---------------------------------------------------------------- INV-10

test('INV-10', 'Sheet `Thông tin shop ` chỉ được đọc cột A, B, C và chỉ từ dòng 8 trở xuống — vùng còn lại chứa tên đăng nhập và mật khẩu gian hàng', async () => {
  const p = path.join(SRC, 'ShellAppsScript.gs');
  // Bỏ chú thích trước khi quét, giữ nguyên số dòng. Chính phần chú thích của file này viết
  // 'Cấm getDataRange()' nên quét thô sẽ báo nhầm đúng câu văn đang cấm việc đó.
  const KHOI = new RegExp(String.fromCharCode(47,92,42) + '[' + String.fromCharCode(92) + 's' + String.fromCharCode(92) + 'S]*?' + String.fromCharCode(92,42,47), 'g');
  const DONG_CT = new RegExp('^([^' + String.fromCharCode(39,34,92) + 'n]*?)' + String.fromCharCode(47,47) + '.*$', 'gm');
  const s = fs.readFileSync(p, 'utf8')
    .replace(KHOI, (m) => m.replace(new RegExp('[^' + String.fromCharCode(92) + 'n]', 'g'), ' '))
    .replace(DONG_CT, '$1');
  const dong = s.split('\n');

  // 1. Không được nạp cả sheet
  const nap = [];
  dong.forEach((d, i) => { if (/getDataRange\s*\(/.test(d)) nap.push(i + 1); });
  phai(nap.length === 0, 'getDataRange() ở dòng ' + nap.join(', ') + ' — nạp cả sheet là kéo theo cả cột mật khẩu');

  // 2. Mọi getRange đọc sheet này phải bắt đầu ở dòng 8 và rộng tối đa 3 cột
  const xau = [];
  dong.forEach((d, i) => {
    const m = d.match(/getRange\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*[^,]+,\s*(\d+)\s*\)/);
    if (!m) return;
    const ngu = dong.slice(Math.max(0, i - 12), i + 1).join('\n');
    if (!/Thông tin shop|THONG_TIN_SHOP|DONG_DAU_BANG_LINK|bangLink|thongTinShop/i.test(ngu)) return;
    const [, r, c, rong] = m.map(Number);
    if (r < 8) xau.push('dòng ' + (i + 1) + ': đọc từ dòng ' + r + ', phải từ dòng 8');
    if (c !== 1 || rong > 3) xau.push('dòng ' + (i + 1) + ': đọc ' + rong + ' cột từ cột ' + c + ', chỉ được A,B,C');
  });
  phai(xau.length === 0, 'VÙNG ĐỌC SAI:\n      ' + xau.join('\n      '));

  // 3. Phải có hằng số chốt dòng bắt đầu, và nó phải bằng 8
  const hang = s.match(/DONG_DAU_BANG_LINK\s*=\s*(\d+)/);
  phai(hang && Number(hang[1]) === 8, 'phải có hằng số chốt dòng bắt đầu bảng link và nó phải là 8, đang là: ' + (hang ? hang[1] : 'không có'));
  return 'ShellAppsScript.gs: 0 getDataRange · mọi vùng đọc bắt đầu dòng 8, rộng 3 cột · hằng số chốt = 8';
});

// ---------------------------------------------------------------- INV-9

test('INV-9', 'Băm thư mục `src/tests/` để BA đối chiếu giữa các đợt (không sửa test để cho qua)', async () => {
  const thu = path.join(SRC, 'tests');
  const ds = fs.readdirSync(thu).filter((f) => /\.gs$/i.test(f)).sort();
  const dong = [];
  const gop = crypto.createHash('sha256');
  for (const f of ds) {
    const b = bam(path.join(thu, f));
    gop.update(f + ':' + b);
    dong.push('    ' + f.padEnd(22) + ' ' + b.slice(0, 16) + '…');
  }
  console.log('  Băm từng file test:');
  dong.forEach((d) => console.log(d));
  console.log('    ' + 'TỔNG THỂ'.padEnd(22) + ' ' + gop.digest('hex').slice(0, 16) + '…');
  phai(ds.length >= 4, 'phải có ít nhất 4 file test, thấy ' + ds.length);
  return ds.length + ' file test trong src/tests/ đã băm — BA giữ bảng này để so đợt sau';
});

// ---------------------------------------------------------------- chạy

async function chayTatCa() {
  const kq = [];
  const lop = napKemBatBien();

  // phần trong bộ nhớ
  if (lop.TestBatBien && lop.TestBatBien.chayTatCa) {
    for (const r of lop.TestBatBien.chayTatCa()) kq.push(r);
  } else {
    kq.push({ ma: 'TestBatBien', ten: 'nạp src/tests/TestBatBien.gs', dat: false, loi: 'không nạp được' });
  }

  // phần cần file thật
  for (const t of TESTS) {
    try {
      const ghiChu = await t.fn();
      kq.push({ ma: t.ma, ten: t.ten, dat: true, ghiChu: ghiChu || '' });
    } catch (e) {
      kq.push({ ma: t.ma, ten: t.ten, dat: false, loi: e && e.message ? e.message : String(e) });
    }
  }
  return kq;
}

module.exports = { chayTatCa, napKemBatBien };

if (require.main === module) {
  chayTatCa().then((kq) => {
    let dat = 0, hong = 0, boQua = 0;
    console.log('=== TEST BẤT BIẾN — hàng rào quanh dữ liệu của chủ shop ===\n');
    kq.forEach((r) => {
      const tt = r.dat ? 'ĐẠT   ' : r.boQua ? 'BỎ QUA' : 'HỎNG  ';
      if (r.dat) dat++; else if (r.boQua) boQua++; else hong++;
      console.log(tt + ' ' + r.ma + ' ' + r.ten +
        (r.loi ? '\n        → ' + r.loi : '') + (r.ghiChu ? '\n        · ' + r.ghiChu : ''));
    });
    console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · ' + boQua + ' BỎ QUA · tổng ' + kq.length + ' ===');
    if (hong) console.log('VI PHẠM MỘT BẤT BIẾN LÀ FAIL TOÀN ĐỢT (KE_HOACH_KIEM_THU mục 6).');
    process.exit(hong ? 1 : 0);
  });
}
