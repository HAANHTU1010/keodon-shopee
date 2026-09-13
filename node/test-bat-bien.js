/**
 * test-bat-bien.js — chạy bộ TEST BẤT BIẾN (KE_HOACH_KIEM_THU bảng A5 + INV-10 của GV-v2.3 mục 2.2).
 *
 * Hai phần:
 *   1. `src/tests/TestBatBien.gs` — các bất biến kiểm được trong bộ nhớ, chạy cả trong Apps Script.
 *   2. Phần dưới đây — các bất biến BẮT BUỘC phải có file thật hoặc phải quét mã nguồn:
 *        INV-5  băm file gốc trước/sau một lần chạy thật
 *        INV-7  quét log và mã nguồn tìm chuỗi bí mật, URL Web App, link/ID file tháng
 *        INV-9  băm `src/tests/` trên đĩa so với băm đã commit, nêu đích danh file test đã đổi
 *        INV-10 không đọc quá cột C và không đọc trên dòng 8 của sheet `Thông tin shop `
 *
 * Chạy: `node node/test-bat-bien.js`. Thoát mã 1 nếu có bất biến bị vi phạm.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { napLoi, SRC } = require('./nap-loi');
const { KhoTracking, duongDanOut, docBangXlsx, TEN_SHEET_MAPPING } = require('./kho-tracking');
const { NguonThuMuc } = require('./nguon-thu-muc');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const TRACKING = path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');
const FILE_XUAT = path.join(DAU_VAO, 'Order.toship.20260807_20260906.xlsx');
const MAP_NT1 = path.join(__dirname, 'fixtures', 'MAP_LISTING_SP_MALL_NT1.xlsx');

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

test('INV-7', 'Không in chuỗi bí mật / link Web App / link file tháng / ID file: mã nguồn không chứa link /exec, không chứa link Google Sheet viết cứng, không gán chuỗi bí mật cứng; và không câu nào tool in ra mang chuỗi bí mật', async () => {
  // PHẠM VI ĐẦY ĐỦ TRỞ LẠI (D-43 sửa 13/9): chuỗi bí mật KHÔNG bị bỏ — nó chỉ được nạp sẵn trong gói
  // giao user thay vì bắt user gõ. Vì thế nó vẫn là thứ số một không được lọt ra màn hình hay nhật ký:
  // ai có chuỗi + link là ghi thẳng vào sổ tiền được.
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
        // gán chuỗi bí mật cứng vào biến — D-43 đã bỏ cơ chế, nhưng giữ phép quét: ai đó cắm lại một
        // chuỗi bí mật viết cứng thì đó là mã lạc hậu, phải hỏng ngay chứ không âm thầm sống tiếp.
        if (/(SECRET|chuoi_?[Bb]i[Mm]at|biMat)\s*[:=]\s*['"][^'"]{12,}['"]/.test(dong) && !/\bprocess\.env\b/.test(dong))
          viPham.push(path.relative(ROOT, p) + ':' + (i + 1) + ' gán chuỗi bí mật viết cứng');
        // link file tháng thật viết cứng trong mã: đó là đường vào sổ tiền của shop.
        if (/https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{25,}/.test(dong))
          viPham.push(path.relative(ROOT, p) + ':' + (i + 1) + ' chứa link file Google Sheet thật');
      });
    }
  };
  duyet(path.join(ROOT, 'src'));
  duyet(path.join(ROOT, 'node'));
  phai(viPham.length === 0, 'VI PHẠM:\n      ' + viPham.join('\n      '));

  // Cấu hình vận hành của MÁY CHỦ DỰ ÁN nay CÓ link Web App và link_thang thật (D-44: gói giao user
  // mang sẵn cấu hình đầy đủ). Vì thế không kiểm "phải rỗng" nữa — kiểm đúng thứ còn đáng kiểm: file đó
  // không được nằm trong kho mã. Phép kiểm "gói có mang link không" thuộc về `kiemGoi()` của dong-goi.js.
  const cfgVH = path.join(ROOT, '..', '..', '03_VAN_HANH', 'Cấu hình', 'CAU_HINH_VAN_HANH.json');
  const trongKho = path.join(ROOT, '03_VAN_HANH');
  phai(!fs.existsSync(trongKho), 'thư mục vận hành (có link Web App) không được nằm trong kho mã');
  const coCfg = fs.existsSync(cfgVH);

  // ---- phần thứ hai: quét ĐẦU RA THẬT, không chỉ quét mã nguồn ----
  // Quét mã nguồn chỉ bắt được chuỗi viết cứng. Chỗ rò nguy hiểm hơn là câu lỗi trích lại nguyên thân
  // gói POST — mà thân gói thì LUÔN mang `token`. `chePhu()` phải che được cả hai đường.
  const gl = require('./gia-lap-web-app');
  const sim = gl.taoGiaLap({});
  sim.khaiThang('2026-09', 'THÁNG-9-2026-KINH-DOANH');
  const { WebAppGoogleSheet } = require('./gsheet-web-app');
  const w = new WebAppGoogleSheet(sim.cauHinhMay());
  const cauDaIn = [];
  for (const hd of ['ping', 'doc', 'ghi', 'xuly']) {
    try {
      const r = await w._goi({ hanhDong: hd, thang: '2026-09', lenh: [] });
      cauDaIn.push(JSON.stringify(r));
    } catch (e) { cauDaIn.push(String(e && e.message ? e.message : e)); }
  }
  // Thêm ca câu lỗi có trích lại nguyên thân gói — đây mới là chỗ `token` hay lọt ra.
  cauDaIn.push(w.chePhu('Web App trả về không phải JSON. Nội dung: ' +
    JSON.stringify({ token: sim.biMat, hanhDong: 'ghi', spreadsheetId: sim.idCua('2026-09') })));
  cauDaIn.push(...sim.chuOiDaTraVe, ...sim.nhatKy);
  sim.thaoGo();
  const gop = cauDaIn.join('\n');
  phai(gop.indexOf(sim.biMat) < 0, 'LỘ CHUỖI BÍ MẬT trong một câu tool in ra');
  phai(gop.indexOf(sim.url) < 0, 'LỘ LINK WEB APP trong một câu tool in ra');
  phai(gop.indexOf(sim.idCua('2026-09')) < 0, 'LỘ ID FILE THÁNG trong một câu tool in ra');

  // ĐỐI CHỨNG ÂM: phép quét trên phải thật sự bắt được, nếu chuỗi có lọt ra thật.
  const w2 = new WebAppGoogleSheet(Object.assign(sim.cauHinhMay(), { chuoi_bi_mat: '' , bat: false }));
  const roRi = 'Nội dung: ' + JSON.stringify({ token: sim.biMat });
  phai(w2.chePhu(roRi).indexOf(sim.biMat) < 0,
    'chePhu phải che `token` theo MẪU, không chỉ theo giá trị đang cầm trên tay');
  phai(roRi.indexOf(sim.biMat) >= 0, 'phép quét mù: chuỗi nằm sờ sờ mà câu chấm không thấy');

  return 'quét src/ và node/ · 0 chỗ lộ link /exec, link file tháng hay chuỗi bí mật viết cứng · ' +
    'quét ' + cauDaIn.length + ' câu đầu ra thật · 0 chỗ lộ chuỗi bí mật · ' +
    'cấu hình vận hành ' + (coCfg ? 'nằm ngoài kho mã (đúng chỗ)' : 'không có trên máy này');
});

// ---------------------------------------------------------------- INV-10

test('INV-10', 'Web App KHÔNG đụng sheet `Thông tin shop ` — sheet đó chứa tên đăng nhập và mật khẩu gian hàng', async () => {
  // ĐỔI HỢP ĐỒNG (D-42, 12/9/2026). Bản trước cho phép Web App đọc sheet này, miễn là chỉ cột A, B, C và
  // chỉ từ dòng 8 — vì bảng link các tháng nằm trong đó. Nay bảng link chuyển hẳn về máy (`link_thang`
  // trong CAU_HINH_VAN_HANH.json), nên Web App KHÔNG còn lý do gì để mở sheet đó. Bất biến vì thế SIẾT
  // CHẶT HƠN chứ không nới: từ "đọc có giới hạn" thành "không đọc một ô nào".
  //
  // Vì sao vẫn giữ mã INV-10 thay vì đánh số mới: thứ nó canh không đổi — 33 ô đăng nhập ở dòng 1-6 và
  // tên đăng nhập thật ở cột C dòng 2-6 không được lọt ra ngoài. Chỉ có cách canh là chặt hơn.
  const p = path.join(SRC, 'ShellAppsScript.gs');
  // Bỏ chú thích trước khi quét, giữ nguyên số dòng: chính chú thích của file này nhắc tên sheet để
  // giải thích vì sao không đụng, nên quét thô sẽ báo nhầm đúng câu văn đang cấm việc đó.
  const KHOI = new RegExp(String.fromCharCode(47, 92, 42) + '[' + String.fromCharCode(92) + 's' + String.fromCharCode(92) + 'S]*?' + String.fromCharCode(92, 42, 47), 'g');
  const DONG_CT = new RegExp('^([^' + String.fromCharCode(39, 34, 92) + 'n]*?)' + String.fromCharCode(47, 47) + '.*$', 'gm');
  const s = fs.readFileSync(p, 'utf8')
    .replace(KHOI, (m) => m.replace(new RegExp('[^' + String.fromCharCode(92) + 'n]', 'g'), ' '))
    .replace(DONG_CT, '$1');
  const dong = s.split('\n');

  // 1. Không được nạp cả sheet ở bất cứ đâu — nạp cả sheet là kéo theo cả cột mật khẩu.
  const nap = [];
  dong.forEach((d, i) => { if (/getDataRange\s*\(/.test(d)) nap.push(i + 1); });
  phai(nap.length === 0, 'getDataRange() ở dòng ' + nap.join(', '));

  // 2. Tên sheet đó không được xuất hiện trong phần CHẠY ĐƯỢC của mã. Không tra tên thì không mở được.
  const nhac = [];
  dong.forEach((d, i) => { if (/Thông tin shop|THONG_TIN_SHOP|thongTinShop/.test(d)) nhac.push(i + 1); });
  phai(nhac.length === 0, 'mã còn tra sheet "Thông tin shop " ở dòng ' + nhac.join(', ') +
    ' — D-42 đã bỏ bảng link trên Google, Web App không được mở sheet có ô đăng nhập');

  // 3. Không còn hằng/hàm nào của cơ chế bảng link cũ. Còn một cái là còn một đường đi tới sheet đó.
  // Trừ thân `hamLoiCoMat_`: chỗ đó CỐ Ý nhắc tên các hàm đã bỏ, dưới dạng `typeof <tên> === 'function'`,
  // để phát hiện bản Apps Script trên Google còn mã cũ. Quét cả chỗ đó là tự bắn vào chính hàng rào.
  const iHL = s.indexOf('function hamLoiCoMat_');
  const jHL = s.indexOf('function thuXuLyRong');
  const maNgoaiHamLoi = (iHL >= 0 && jHL > iHL) ? (s.slice(0, iHL) + s.slice(jHL)) : s;
  const CAM = ['DONG_DAU_BANG_LINK', 'SO_COT_DUOC_DOC', 'bangLinkThang_', 'sheetThongTinShop_',
    'moNeo_', 'fileCuaThang_', 'chonDongDinhTuyen_', 'capNhatMoNeo_'];
  const con = CAM.filter((t) => maNgoaiHamLoi.indexOf(t) >= 0);
  phai(con.length === 0, 'còn mã của cơ chế bảng link cũ (ngoài hamLoiCoMat_): ' + con.join(', '));
  // Chiều ngược: `hamLoiCoMat_` PHẢI còn nhắc chúng, nếu không thì bản cũ trên Google đi lọt không ai biết.
  //
  // YC-40.2: bản 2.5.0 của phép này ÉP `hamLoiCoMat_` phải xếp `biMatDung_` và `caiDat` vào danh sách
  // "đã bỏ" — tức bài test cố định đúng cái lỗi. Hai hàm đó là mã hiện hành (YC-28), nên nay chúng phải
  // nằm ở chiều NGƯỢC LẠI: được `xet(...)` như hàm phải có, và tuyệt đối không nằm trong `camMaVanCo`.
  const thanHL = (iHL >= 0 && jHL > iHL) ? s.slice(iHL, jHL) : '';
  ['moNeo_', 'fileCuaThang_', 'capNhatMoNeo_', 'bangLinkThang_'].forEach((t) => {
    phai(new RegExp("typeof " + t + " === 'function'\\) camMaVanCo\\.push").test(thanHL),
      'hamLoiCoMat_ phải canh hàm đã bỏ "' + t + '" để bắt bản Google cũ');
  });
  ['biMatDung_', 'caiDat', 'bam256_'].forEach((t) => {
    phai(!new RegExp("typeof " + t + " === 'function'\\) camMaVanCo").test(thanHL),
      'hamLoiCoMat_ xếp nhầm hàm HIỆN HÀNH "' + t + '" vào danh sách đã bỏ (YC-40.2)');
    phai(thanHL.indexOf("xet('" + t + "'") >= 0, 'hamLoiCoMat_ phải canh "' + t + '" như hàm phải có');
  });

  // 4. Chiều ngược lại: phải có đường MỚI, nếu không thì "không đụng sheet nào" là do mã rỗng chứ không
  //    phải do thiết kế. File tháng đến từ ID trong gói, và tên file phải được kiểm chéo với tháng.
  for (const t of ['function moFileTheoId_', 'function kiemTenFileKhopThang_', 'SAI_THANG_FILE']) {
    phai(s.indexOf(t) >= 0, 'thiếu đường mới: ' + t);
  }

  // 5. `openById` vẫn chỉ được gọi ĐÚNG MỘT chỗ (trong `moBangTinh_`), để mọi lỗi mở file đi qua một cửa.
  const soLan = (s.match(/SpreadsheetApp\.openById\s*\(/g) || []).length;
  phai(soLan === 1, 'có ' + soLan + ' lời gọi SpreadsheetApp.openById, phải đúng 1 (trong moBangTinh_)');

  return 'ShellAppsScript.gs: 0 getDataRange · 0 chỗ tra sheet "Thông tin shop " · 0/' + CAM.length +
    ' mã bảng link cũ ngoài hamLoiCoMat_ (và hamLoiCoMat_ vẫn canh đủ 4 hàm đã bỏ) · ' +
    'có moFileTheoId_ + kiemTenFileKhopThang_ · 1 lời gọi openById';
});

// ---------------------------------------------------------------- INV-9

/**
 * Chạy một lệnh git ngay trong thư mục mã. Ném lỗi nếu máy không có git hoặc lệnh trả mã khác 0.
 * stderr hứng vào ống riêng để chữ đỏ của git không lẫn vào bảng kết quả test.
 */
function chayGit() {
  const thamSo = Array.prototype.slice.call(arguments);
  return execFileSync('git', thamSo, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
}

/**
 * Có git, có repo, và repo đã có ít nhất một commit chưa?
 * Trả `null` nếu đủ điều kiện để so. Trả LÝ DO BẰNG CHỮ nếu thiếu, để bài test bỏ qua chứ không báo đạt giả:
 * kế hoạch kiểm thử tính test bỏ qua mà không nêu lý do là test hỏng.
 */
function lyDoKhongSoDuocVoiCommit() {
  try { chayGit('--version'); } catch (e) { return 'máy chưa cài git nên không có mốc commit nào để so'; }
  try { chayGit('rev-parse', '--git-dir'); } catch (e) { return 'thư mục mã chưa phải một repo git nên không có mốc commit nào để so'; }
  try { chayGit('rev-parse', '--verify', 'HEAD'); } catch (e) { return 'repo git chưa có commit nào nên chưa có mốc để so'; }
  return null;
}

test('INV-9', 'Không sửa test để cho qua: băm src/tests/ trên đĩa đối chiếu băm đã commit, nêu đích danh file đã đổi', async () => {
  // VÌ SAO BÀI NÀY TỒN TẠI: một bộ test chỉ đáng tin chừng nào không ai lặng lẽ sửa nó cho vừa với mã.
  // Bản trước của bài này chỉ in băm rồi khẳng định "có ít nhất 4 file test", tức là tự nó KHÔNG phát
  // hiện được gì; bảng băm chỉ có nghĩa khi BA chịu khó so tay giữa hai đợt.
  // Sửa test là việc bình thường của dev, nên KHÁC COMMIT KHÔNG PHẢI LÀ HỎNG. Nhiệm vụ của bài này là
  // gọi đúng tên file đã đổi để BA đối chiếu với mục 5 của báo cáo. Im lặng mới là hỏng.
  const thu = path.join(SRC, 'tests');
  phai(fs.existsSync(thu) && fs.statSync(thu).isDirectory(), 'không thấy thư mục src/tests/, bộ test bất biến không còn chỗ đứng');
  const ds = fs.readdirSync(thu).filter((f) => /\.gs$/i.test(f)).sort();

  // Bảng băm sha256 giữ nguyên như các đợt trước, BA đang dùng nó để đối chiếu bằng mắt.
  const gop = crypto.createHash('sha256');
  const bangBam = [];
  for (const f of ds) {
    const b = bam(path.join(thu, f));
    gop.update(f + ':' + b);
    bangBam.push('    ' + f.padEnd(22) + ' ' + b.slice(0, 16) + '…');
  }
  console.log('  Băm từng file test:');
  bangBam.forEach((d) => console.log(d));
  console.log('    ' + 'TỔNG THỂ'.padEnd(22) + ' ' + gop.digest('hex').slice(0, 16) + '…');
  phai(ds.length >= 4, 'phải có ít nhất 4 file test, thấy ' + ds.length);

  const lyDo = lyDoKhongSoDuocVoiCommit();
  if (lyDo) {
    console.log('  Không so được với commit: ' + lyDo);
    return { boQua: true, lyDo: lyDo + '. Mới in được bảng băm ' + ds.length + ' file, chưa khẳng định được test có bị sửa hay không' };
  }

  // Băm ĐÃ COMMIT lấy bằng `git ls-tree`, băm TRÊN ĐĨA lấy bằng `git hash-object`. Cố ý dùng cùng một
  // cách băm của git cho cả hai vế: .gitattributes đang chuẩn hóa xuống dòng về LF, nên đem sha256 thô
  // của byte trên đĩa so với blob trong commit sẽ báo "đổi cả 5 file" trên máy Windows dù không ai sửa gì.
  const dauCommit = chayGit('rev-parse', '--short', 'HEAD');
  const ngayCommit = chayGit('log', '-1', '--format=%cd', '--date=format:%Y-%m-%d %H:%M');
  const bamCommit = {};
  for (const d of chayGit('ls-tree', 'HEAD', '--', 'src/tests/').split('\n')) {
    const m = d.match(/^\d+ blob ([0-9a-f]{40})\t(.+)$/);
    if (m) bamCommit[path.posix.basename(m[2])] = m[1];
  }

  const daDoi = [], themMoi = [], daXoa = [], bangSo = [];
  for (const f of ds) {
    const tren = chayGit('hash-object', '--', 'src/tests/' + f);
    const trong = bamCommit[f];
    if (!trong) { themMoi.push(f); bangSo.push('    ' + f.padEnd(22) + ' THÊM MỚI, commit chưa có file này'); continue; }
    if (trong === tren) { bangSo.push('    ' + f.padEnd(22) + ' giống commit'); continue; }
    daDoi.push(f);
    bangSo.push('    ' + f.padEnd(22) + ' ĐÃ ĐỔI: commit ' + trong.slice(0, 12) + '… → đĩa ' + tren.slice(0, 12) + '…');
  }
  for (const f of Object.keys(bamCommit).sort()) {
    if (ds.indexOf(f) < 0) { daXoa.push(f); bangSo.push('    ' + f.padEnd(22) + ' ĐÃ XÓA khỏi đĩa, commit vẫn còn'); }
  }
  console.log('  So với commit gần nhất ' + dauCommit + ' (' + ngayCommit + '):');
  bangSo.forEach((d) => console.log(d));

  const soKhac = daDoi.length + themMoi.length + daXoa.length;
  if (!soKhac)
    return ds.length + ' file test giống hệt commit ' + dauCommit + ' (' + ngayCommit + '), không ai đụng vào test trong đợt này';
  const ten = daDoi.concat(themMoi.map((f) => f + ' (mới)')).concat(daXoa.map((f) => f + ' (đã xóa)'));
  return ds.length + ' file test, ' + soKhac + ' file khác commit ' + dauCommit + ': ' + ten.join(', ') +
    '. Khác commit KHÔNG phải lỗi, nhưng BA phải thấy đúng các file này ở mục 5 báo cáo';
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
      const r = await t.fn();
      // Bài test trả `{ boQua, lyDo }` khi thiếu điều kiện chạy (INV-9 lúc máy chưa cài git). Cùng quy ước
      // với TestBatBien.gs. Bỏ qua PHẢI kèm lý do bằng chữ, bỏ qua không lý do bị tính là test hỏng.
      if (r && typeof r === 'object' && r.boQua) kq.push({ ma: t.ma, ten: t.ten, dat: false, boQua: true, ghiChu: r.lyDo || '' });
      else kq.push({ ma: t.ma, ten: t.ten, dat: true, ghiChu: r || '' });
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
