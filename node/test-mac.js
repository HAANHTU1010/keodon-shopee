/**
 * test-mac.js — BỘ NÚT BẢN macOS (Đợt 5). Ký hiệu bài: `MAC-xx`.
 *
 * VÌ SAO CHẠY ĐƯỢC TRÊN MÁY WINDOWS. Bốn nút `.command` và ruột `keodon-mac.sh`
 * viết bằng POSIX sh, không dùng thứ gì riêng của macOS ngoài đường dẫn dò Node
 * — nên `sh` của Git Bash chạy y như `sh` của macOS. Nhờ vậy bộ test này chấm
 * được HÀNH VI THẬT của nút (chạy nó lên, đọc màn hình, đọc mã thoát), không
 * phải đọc chay mã.
 *
 * MỖI BÀI KÈM ĐỐI CHỨNG ÂM: dựng lại đúng khuyết tật (bản sửa trong thư mục tạm,
 * không đụng file gốc) và chứng minh phép chấm báo LỆCH. Không có đối chứng âm
 * thì phép chấm có thể đang mù mà không ai biết (bệnh TM-10).
 *
 * ĐIỀU KIỆN: máy phải có `sh` (Git Bash trên Windows, có sẵn trên macOS/Linux).
 * Không có thì bộ test BỎ QUA và nói rõ, không giả vờ đạt.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const MAC = path.join(__dirname, '..', 'mac');
const NUT = ['1_CAI_DAT_LAN_DAU.command', '2_CAP_NHAT.command', '3_TAO_FILE_THANG_MOI.command', '4_CHAY_TOOL.command'];
const RAC = [];
let dat = 0, hong = 0, boQua = 0;

// ----------------------------------------------------------------- khung chấm
function test(ma, ten, fn) {
  try {
    const t = fn();
    dat++;
    console.log('ĐẠT   ' + ma + ' ' + ten + (t ? '\n        · ' + t : ''));
  } catch (e) {
    hong++;
    console.log('HỎNG  ' + ma + ' ' + ten + '\n   -> ' + String(e && e.message).split('\n').join(' | '));
  }
}
function dung(dk, cau) { if (!dk) throw new Error(cau); }
function bang(thuc, mong, nhan) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((nhan ? nhan + ': ' : '') + 'được ' + a + ', cần ' + b);
}
/** Chạy hàm dựng khuyết tật; nó PHẢI trả về danh sách chỗ lệch, rỗng là phép chấm mù. */
function doiChungAm(fn, ten) {
  const lech = fn();
  if (!lech || !lech.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + ten + ' — phép chấm này không bắt được gì');
  return 'đối chứng âm: ' + ten + ' -> LỆCH (' + String(lech[0]).slice(0, 110) + ') ← đúng như phải thế';
}

function tamMoi(ten) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-mac-' + ten + '-')); RAC.push(d); return d; }

function coSh() {
  const r = spawnSync('sh', ['-c', 'echo ok'], { encoding: 'utf8' });
  return r.status === 0 && /ok/.test(r.stdout || '');
}

/**
 * Dựng một "máy user" giả trong thư mục tạm: bốn nút + ruột + thư mục `Cấu hình`
 * (+ mã giả + node giả nếu đề bài cần).
 * @param {Object} o { cauHinh: bool, ma: bool, node: 'ma-thoat'|null, vaSua: [[mốc, thay]] }
 */
function dungMay(o) {
  const goc = tamMoi('may');
  for (const n of NUT) fs.cpSync(path.join(MAC, n), path.join(goc, n));
  let ruot = fs.readFileSync(path.join(MAC, 'keodon-mac.sh'), 'utf8');
  for (const [moc, thay] of (o.vaSua || [])) {
    const n = ruot.split(moc).length - 1;
    if (n !== 1) throw new Error('mốc đối chứng âm cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 60));
    ruot = ruot.split(moc).join(thay);
  }
  fs.writeFileSync(path.join(goc, 'keodon-mac.sh'), ruot);
  if (o.cauHinh) {
    const ch = path.join(goc, 'Cấu hình');
    fs.mkdirSync(path.join(ch, 'nhật ký'), { recursive: true });
    fs.writeFileSync(path.join(ch, 'CAU_HINH_VAN_HANH.json'), JSON.stringify({
      thu_muc_tha_file: '1_THA_FILE_XUAT', google_sheet: { bat: true, web_app_url: 'https://GIA_LAP/exec', chuoi_bi_mat: 'BI-MAT-TEST' },
      link_thang: {}, cap_nhat: { chu_tai_khoan: '', ten_repo: '', nhanh: 'main' }
    }, null, 2), 'utf8');
  }
  if (o.ma) {
    const tool = path.join(goc, 'Cấu hình', 'keodon-apps-script');
    fs.mkdirSync(path.join(tool, 'node'), { recursive: true });
    fs.mkdirSync(path.join(tool, 'node_modules', 'exceljs'), { recursive: true });
    fs.writeFileSync(path.join(tool, 'node', 'chay-thu.js'), '// giả\n');
    fs.writeFileSync(path.join(tool, 'node', 'nut-3-thang-moi.js'), '// giả\n');
    fs.writeFileSync(path.join(tool, 'package.json'), JSON.stringify({ version: '9.9.9', dependencies: { exceljs: '1' } }), 'utf8');
  }
  return goc;
}

/** Thư mục chứa một `node` GIẢ: in ra dòng nhận biết rồi thoát đúng mã đề bài. */
function nodeGia(maThoat) {
  const d = tamMoi('node');
  fs.writeFileSync(path.join(d, 'node'), '#!/bin/sh\necho "NODE GIA da chay: $*"\nexit ' + maThoat + '\n', { mode: 0o755 });
  return d;
}

/** Chạy một nút. `duongNode` rỗng = giả vờ máy KHÔNG có Node. */
function chayNut(goc, nut, o) {
  const tuyChon = o || {};
  const path0 = tuyChon.duongNode === null ? (process.platform === 'win32' ? 'C:/Windows/System32' : '/usr/bin:/bin')
    : (tuyChon.duongNode ? tuyChon.duongNode + path.delimiter + process.env.PATH : process.env.PATH);
  const r = spawnSync('sh', [path.join(goc, nut)].concat(tuyChon.thamSo || []), {
    encoding: 'utf8', env: Object.assign({}, process.env, { PATH: path0, KEODON_TU_DONG: '1' })
  });
  return { ma: r.status, ra: (r.stdout || '') + (r.stderr || '') };
}

// ===================================================================== các bài
console.log('=== ĐỢT 5: BỐN NÚT BẢN macOS (MAC-xx) ===\n');

if (!coSh()) {
  console.log('BỎ QUA cả bộ: máy này không có `sh` để chạy nút .command (cần Git Bash trên Windows).');
  process.exit(0);
}

test('MAC-01', 'đủ bốn nút + ruột chung, đều là POSIX sh hợp lệ, có shebang, xuống dòng LF (CRLF là macOS không chạy)', () => {
  const ds = NUT.concat(['keodon-mac.sh', 'cai-dat-mac.js']);
  const thieu = ds.filter((n) => !fs.existsSync(path.join(MAC, n)));
  bang(thieu, [], 'file thiếu');
  const loi = [];
  for (const n of ds) {
    const s = fs.readFileSync(path.join(MAC, n), 'utf8');
    if (!/^#!/.test(s)) loi.push(n + ': thiếu shebang');
    if (/\r/.test(s)) loi.push(n + ': có CRLF');
    if (n.endsWith('.js')) continue;
    const r = spawnSync('sh', ['-n', path.join(MAC, n)], { encoding: 'utf8' });
    if (r.status !== 0) loi.push(n + ': sai cú pháp sh — ' + (r.stderr || '').trim().slice(0, 80));
  }
  bang(loi, [], 'hình dạng file');
  const am = doiChungAm(() => {
    const d = tamMoi('crlf');
    const tep = path.join(d, 'x.command');
    fs.writeFileSync(tep, fs.readFileSync(path.join(MAC, '4_CHAY_TOOL.command'), 'utf8').replace(/\n/g, '\r\n'));
    return /\r/.test(fs.readFileSync(tep, 'utf8')) ? ['bản CRLF bị bắt'] : [];
  }, 'nút bị lưu kiểu Windows (CRLF)');
  return ds.length + ' file đúng hình dạng · ' + am;
});

test('MAC-02', 'nút 4 khi CHƯA có file cấu hình → in câu chỉ việc (bấm nút 1) và thoát mã 1, không chạy gì', () => {
  const goc = dungMay({ cauHinh: false, ma: false });
  const r = chayNut(goc, '4_CHAY_TOOL.command', { duongNode: nodeGia(0) });
  bang(r.ma, 1, 'mã thoát');
  dung(/không tìm thấy file CAU_HINH_VAN_HANH.json/.test(r.ra) && /1_CAI_DAT_LAN_DAU.command/.test(r.ra), 'thiếu câu chỉ việc: ' + r.ra.slice(0, 200));
  const am = doiChungAm(() => {
    const g2 = dungMay({ cauHinh: false, ma: false, vaSua: [['  if [ -z "$CFGDIR" ]; then cau_thieu_cau_hinh; doi_phim; exit 1; fi', '  CFGDIR="$goc"']] });
    const r2 = chayNut(g2, '4_CHAY_TOOL.command', { duongNode: nodeGia(0) });
    return r2.ma === 1 && /CAU_HINH_VAN_HANH.json/.test(r2.ra) ? [] : ['bỏ cửa chặn cấu hình → mã ' + r2.ma];
  }, 'bỏ phép kiểm thư mục cấu hình');
  return 'mã 1 + câu chỉ việc · ' + am;
});

test('MAC-03', 'có cấu hình nhưng CHƯA có mã của tool → "MÁY CHƯA CÀI ĐẶT", mã 1', () => {
  const goc = dungMay({ cauHinh: true, ma: false });
  const r = chayNut(goc, '4_CHAY_TOOL.command', { duongNode: nodeGia(0) });
  bang(r.ma, 1, 'mã thoát');
  dung(/MÁY CHƯA CÀI ĐẶT/.test(r.ra), 'thiếu câu: ' + r.ra.slice(0, 200));
  const am = doiChungAm(() => {
    const g2 = dungMay({ cauHinh: true, ma: false, vaSua: [['  if [ -z "$TOOL" ]; then cau_chua_cai; doi_phim; exit 1; fi', '  TOOL="$goc"']] });
    const r2 = chayNut(g2, '4_CHAY_TOOL.command', { duongNode: nodeGia(0) });
    return /MÁY CHƯA CÀI ĐẶT/.test(r2.ra) ? [] : ['bỏ cửa chặn → chạy tiếp, mã ' + r2.ma];
  }, 'bỏ phép kiểm đã cài mã chưa');
  return 'mã 1 + câu chỉ việc · ' + am;
});

test('MAC-04', 'máy CHƯA cài Node → in đúng ba bước cài từ nodejs.org, mã 1 (không nói lỗi kỹ thuật)', () => {
  // Máy dev nào cũng có Node, nên dựng "máy chưa cài Node" bằng cách đổi CHÍNH phép dò
  // sang một tên chương trình không tồn tại — đúng cảnh máy Mac trắng.
  const khongCoNode = ['  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi',
    '  if command -v keodon_node_khong_co_that >/dev/null 2>&1; then echo x; return 0; fi'];
  const goc = dungMay({ cauHinh: true, ma: true, vaSua: [khongCoNode] });
  const r = chayNut(goc, '4_CHAY_TOOL.command', {});
  bang(r.ma, 1, 'mã thoát');
  dung(/chưa có Node\.js/.test(r.ra) && /nodejs\.org/.test(r.ra) && /\.pkg/.test(r.ra), 'thiếu hướng dẫn cài: ' + r.ra.slice(0, 200));
  dung(!/command not found|No such file/i.test(r.ra), 'lộ câu lỗi kỹ thuật của shell: ' + r.ra.slice(0, 200));
  const am = doiChungAm(() => {
    const g2 = dungMay({
      cauHinh: true, ma: true,
      vaSua: [khongCoNode, ['  NODE=$(tim_node "$CFGDIR")\n  if [ -z "$NODE" ]; then cau_thieu_node; doi_phim; exit 1; fi\n  if [ ! -d "$TOOL/node_modules/exceljs" ]; then',
        '  NODE=node\n  if [ ! -d "$TOOL/node_modules/exceljs" ]; then']]
    });
    const r2 = chayNut(g2, '4_CHAY_TOOL.command', {});
    return /nodejs\.org/.test(r2.ra) ? [] : ['bỏ cửa chặn Node → mã ' + r2.ma + ', màn hình không còn hướng dẫn cài mà chạy tiếp'];
  }, 'bỏ phép kiểm Node');
  return 'mã 1 + 3 bước cài, không lộ câu lỗi shell · ' + am;
});

test('MAC-05', 'đủ điều kiện → gọi ĐÚNG `node/chay-thu.js --van-hanh <thư mục nút>` và TRẢ NGUYÊN mã thoát của tool (0 · 1 · 2 như bản Windows)', () => {
  const goc = dungMay({ cauHinh: true, ma: true });
  const ra = {};
  for (const ma of [0, 1, 2]) {
    const r = chayNut(goc, '4_CHAY_TOOL.command', { duongNode: nodeGia(ma) });
    ra[ma] = r;
    bang(r.ma, ma, 'mã thoát khi tool trả ' + ma);
  }
  dung(/chay-thu\.js/.test(ra[0].ra) && /--van-hanh/.test(ra[0].ra), 'không gọi đúng script: ' + ra[0].ra.slice(0, 200));
  dung(/XONG\. Mở Google Sheet/.test(ra[0].ra), 'mã 0 thiếu câu XONG');
  dung(/KHÔNG CÓ GÌ ĐỂ LÀM/.test(ra[2].ra), 'mã 2 thiếu câu KHÔNG CÓ GÌ ĐỂ LÀM');
  dung(/CHẠY KHÔNG XONG/.test(ra[1].ra) && /vẫn nằm nguyên trong thư mục thả/.test(ra[1].ra), 'mã 1 thiếu câu CHẠY KHÔNG XONG');
  const am = doiChungAm(() => {
    const g2 = dungMay({ cauHinh: true, ma: true, vaSua: [['  exit $ma\n}\n\n# --- nút 3', '  exit 0\n}\n\n# --- nút 3']] });
    const r2 = chayNut(g2, '4_CHAY_TOOL.command', { duongNode: nodeGia(1) });
    return r2.ma === 1 ? [] : ['nuốt mã lỗi của tool: tool trả 1 mà nút trả ' + r2.ma];
  }, 'nút nuốt mã thoát (luôn báo 0)');
  return 'mã 0/1/2 truyền nguyên + ba câu kết luận · ' + am;
});

test('MAC-06', 'nút 3 dịch đủ SÁU mã thoát của `nut-3-thang-moi.js` (0 · 1 · 3 · 4 · 5 · 6) đúng câu như bản Windows', () => {
  const goc = dungMay({ cauHinh: true, ma: true });
  const can = {
    0: /ĐÃ GHI link tháng/, 1: /CHƯA LÀM GÌ/, 3: /KHÔNG TẠO ĐƯỢC THÁNG MỚI/,
    4: /KHÔNG GỌI XONG WEB APP/, 5: /GOOGLE ĐÃ TẠO XONG THÁNG MỚI NHƯNG MÁY CHƯA GHI ĐƯỢC LINK/, 6: /CHƯA PHẢI THẤT BẠI/
  };
  const loi = [];
  for (const ma of Object.keys(can)) {
    const r = chayNut(goc, '3_TAO_FILE_THANG_MOI.command', { duongNode: nodeGia(ma) });
    if (r.ma !== Number(ma)) loi.push('mã ' + ma + ' → nút trả ' + r.ma);
    if (!can[ma].test(r.ra)) loi.push('mã ' + ma + ' thiếu câu riêng');
    if (!/nut-3-thang-moi\.js/.test(r.ra)) loi.push('mã ' + ma + ': không gọi nut-3-thang-moi.js');
  }
  bang(loi, [], 'sáu mã thoát');
  const am = doiChungAm(() => {
    const g2 = dungMay({ cauHinh: true, ma: true, vaSua: [['    5) echo "  GOOGLE ĐÃ TẠO XONG THÁNG MỚI NHƯNG MÁY CHƯA GHI ĐƯỢC LINK."', '    5) echo "  KHONG TAO DUOC."']] });
    const r2 = chayNut(g2, '3_TAO_FILE_THANG_MOI.command', { duongNode: nodeGia(5) });
    return can[5].test(r2.ra) ? [] : ['mã 5 nay in câu của mã 3 — người bấm sẽ chạy lại chế độ 1 và tạo tháng hai lần'];
  }, 'trộn câu của mã 5 sang câu khác');
  return '6/6 mã đúng câu · ' + am;
});

test('MAC-07', 'nút 1 và nút 2 gọi `cai-dat-mac.js` kèm đúng việc (cai-dat / cap-nhat) và truyền tiếp tham số /lui', () => {
  const goc = dungMay({ cauHinh: true, ma: true });
  fs.writeFileSync(path.join(goc, 'cai-dat-mac.js'), '// giả\n');
  const r1 = chayNut(goc, '1_CAI_DAT_LAN_DAU.command', { duongNode: nodeGia(0) });
  const r2 = chayNut(goc, '2_CAP_NHAT.command', { duongNode: nodeGia(0) });
  const r3 = chayNut(goc, '2_CAP_NHAT.command', { duongNode: nodeGia(11), thamSo: ['/lui'] });
  dung(/--viec cai-dat/.test(r1.ra), 'nút 1 không gọi việc cai-dat: ' + r1.ra.slice(0, 160));
  dung(/--viec cap-nhat/.test(r2.ra), 'nút 2 không gọi việc cap-nhat: ' + r2.ra.slice(0, 160));
  dung(/\/lui/.test(r3.ra) && r3.ma === 11, 'nút 2 không truyền /lui hoặc nuốt mã 11: mã ' + r3.ma);
  const am = doiChungAm(() => {
    const g2 = dungMay({ cauHinh: true, ma: true, vaSua: [['  "$NODE" "$goc/cai-dat-mac.js" --viec "$viec" --goc "$goc" "$@"', '  "$NODE" "$goc/cai-dat-mac.js" --viec "$viec" --goc "$goc"']] });
    fs.writeFileSync(path.join(g2, 'cai-dat-mac.js'), '// giả\n');
    const x = chayNut(g2, '2_CAP_NHAT.command', { duongNode: nodeGia(0), thamSo: ['/lui'] });
    return /\/lui/.test(x.ra) ? [] : ['nút 2 nuốt mất /lui — người bấm tưởng đã lùi mà thật ra vừa cập nhật tiếp'];
  }, 'nút 2 quên truyền tham số');
  return 'cai-dat · cap-nhat · /lui truyền nguyên, mã 11 giữ · ' + am;
});

// ---- ruột JS của nút 1 / nút 2 ------------------------------------------------
const CD = require(path.join(MAC, 'cai-dat-mac.js'));

test('MAC-08', 'sao lưu trước khi chép đè: giữ đúng ba thứ (src, node, package.json), giữ tối đa 3 bản, KHÔNG đụng cấu hình', () => {
  const base = tamMoi('base');
  const tool = path.join(base, 'keodon-apps-script');
  fs.mkdirSync(path.join(tool, 'src'), { recursive: true });
  fs.mkdirSync(path.join(tool, 'node'), { recursive: true });
  fs.mkdirSync(path.join(tool, 'node_modules', 'exceljs'), { recursive: true });
  fs.writeFileSync(path.join(tool, 'src', 'a.gs'), 'A1');
  fs.writeFileSync(path.join(tool, 'node', 'b.js'), 'B1');
  fs.writeFileSync(path.join(tool, 'package.json'), '{"version":"1.0.0","dependencies":{}}');
  fs.writeFileSync(path.join(base, 'CAU_HINH_VAN_HANH.json'), '{"bi_mat":"GIU NGUYEN"}');
  const ds = [];
  for (let i = 0; i < 5; i++) { ds.push(path.basename(CD.saoLuu(base, tool))); fs.writeFileSync(path.join(base, '_moc_' + i), '1'); }
  const conLai = CD.danhSachBanCu(base);
  bang(conLai.length, CD.GIU_BAN_CU, 'số bản sao lưu giữ lại');
  const mot = conLai[0].duong;
  bang(fs.readdirSync(mot).sort(), ['node', 'package.json', 'src'], 'thứ được sao lưu');
  dung(!fs.existsSync(path.join(mot, 'node_modules')), 'sao lưu cả node_modules là thừa hàng trăm MB');
  bang(fs.readFileSync(path.join(base, 'CAU_HINH_VAN_HANH.json'), 'utf8'), '{"bi_mat":"GIU NGUYEN"}', 'cấu hình');
  return CD.GIU_BAN_CU + ' bản gần nhất, mỗi bản đúng 3 thứ, cấu hình nguyên vẹn';
});

test('MAC-09', '`/lui` chép ngược bản sao lưu CŨ HƠN bản đang chạy; hết bản để lùi → mã 11 và nói rõ; cấu hình không đổi', () => {
  const base = tamMoi('lui');
  const tool = path.join(base, 'keodon-apps-script');
  fs.mkdirSync(path.join(tool, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tool, 'src', 'a.gs'), 'BAN CU');
  fs.writeFileSync(path.join(tool, 'package.json'), '{"version":"1.0.0","dependencies":{}}');
  fs.writeFileSync(path.join(base, 'CAU_HINH_VAN_HANH.json'), '{"bi_mat":"GIU NGUYEN"}');
  CD.saoLuu(base, tool);                                    // bản 1.0.0 vào kho lùi
  fs.writeFileSync(path.join(tool, 'src', 'a.gs'), 'BAN MOI');
  fs.writeFileSync(path.join(tool, 'package.json'), '{"version":"2.0.0","dependencies":{}}');

  const chay = (b, t) => {
    const cu = process.exit; let ma = null;
    process.exit = (x) => { ma = x; throw new Error('__THOAT__'); };
    const inCu = console.log; const dong = [];
    console.log = (...a) => dong.push(a.join(' '));
    try { CD.lui(b, t); } catch (e) { if (!/__THOAT__/.test(e.message)) { process.exit = cu; console.log = inCu; throw e; } }
    process.exit = cu; console.log = inCu;
    return { ma, ra: dong.join('\n') };
  };
  const r1 = chay(base, tool);
  bang(r1.ma, 0, 'mã thoát lượt lùi');
  bang(fs.readFileSync(path.join(tool, 'src', 'a.gs'), 'utf8'), 'BAN CU', 'nội dung sau khi lùi');
  bang(CD.banCua(tool), '1.0.0', 'bản sau khi lùi');
  bang(fs.readFileSync(path.join(base, 'CAU_HINH_VAN_HANH.json'), 'utf8'), '{"bi_mat":"GIU NGUYEN"}', 'cấu hình');
  const r2 = chay(base, tool);                              // lùi tiếp: không còn bản nào CŨ HƠN
  bang(r2.ma, 11, 'mã thoát khi hết bản để lùi');
  dung(/KHÔNG CÒN BẢN CŨ ĐỂ LÙI/.test(r2.ra), 'thiếu câu nói rõ: ' + r2.ra.slice(0, 160));
  const am = doiChungAm(() => {
    // Khuyết tật: lấy bản sao lưu GẦN NHẤT bất kể bản nào — sau một lần lùi là lấy lại chính bản vừa chép, bấm lại vô ích.
    const ds = CD.danhSachBanCu(base);
    const chonSai = ds[0];
    return chonSai && chonSai.ban === CD.banCua(tool) ? ['chọn "gần nhất" tuyệt đối sẽ lùi về đúng bản đang chạy (' + chonSai.ban + ')'] : [];
  }, 'lùi theo "bản sao lưu gần nhất" thay vì "gần nhất mà CŨ HƠN"');
  return 'lùi 2.0.0 → 1.0.0, lần hai mã 11 · ' + am;
});

test('MAC-10', 'chưa khai kho mã GitHub → nút 2 DỪNG, nói đúng hai ô phải điền, không tải gì, không đụng mã đang chạy', () => {
  const goc = tamMoi('khokhai');
  const base = path.join(goc, 'Cấu hình');
  fs.mkdirSync(base, { recursive: true });
  fs.writeFileSync(path.join(base, 'CAU_HINH_VAN_HANH.json'), JSON.stringify({ cap_nhat: { chu_tai_khoan: '', ten_repo: '', nhanh: 'main' } }));
  const tool = path.join(base, 'keodon-apps-script');
  fs.mkdirSync(path.join(tool, 'src'), { recursive: true });
  fs.writeFileSync(path.join(tool, 'src', 'a.gs'), 'NGUYEN VEN');
  fs.writeFileSync(path.join(tool, 'package.json'), '{"version":"1.0.0"}');
  const r = spawnSync(process.execPath, [path.join(MAC, 'cai-dat-mac.js'), '--viec', 'cap-nhat', '--goc', goc], { encoding: 'utf8' });
  bang(r.status, 1, 'mã thoát');
  dung(/chu_tai_khoan/.test(r.stdout) && /ten_repo/.test(r.stdout), 'không chỉ rõ hai ô phải điền: ' + (r.stdout || '').slice(0, 200));
  bang(fs.readFileSync(path.join(tool, 'src', 'a.gs'), 'utf8'), 'NGUYEN VEN', 'mã đang chạy');
  bang(CD.danhSachBanCu(base).length, 0, 'số bản sao lưu (chưa tải được thì chưa được đụng gì)');
  return 'mã 1, nói đúng hai ô, mã đang chạy nguyên vẹn';
});

test('MAC-11', 'tên thư mục tiếng Việt dạng NFD (macOS đọc ra) vẫn được nhận là ĐÚNG TÊN, không bị chấm "thư mục lạ"', () => {
  const { NguonThuMucTheoShop } = require('./chay-thu.js');
  const cfg = { gianHang: { SP_MALL: { ten: 'Shopee mall', sheet: 'Shopee mall' }, SP_BICH: { ten: 'Gian Bích', sheet: 'Gian Bích' } } };
  const vao = tamMoi('nfd');
  // Finder/macOS trả tên ở dạng NFD: chữ có dấu tách thành chữ + dấu rời.
  fs.mkdirSync(path.join(vao, 'Shopee mall'), { recursive: true });
  fs.mkdirSync(path.join(vao, 'Gian Bích'.normalize('NFD')), { recursive: true });
  fs.writeFileSync(path.join(vao, 'Gian Bích'.normalize('NFD'), 'don.xlsx'), 'x');
  const n = new NguonThuMucTheoShop(vao, { SP_MALL: 'Shopee mall', SP_BICH: 'Gian Bích' }, 'đã xử lý');
  bang(n.fileBoQua(cfg).filter((t) => /KHÔNG PHẢI tên gian hàng/.test(t)), [], 'thư mục NFD bị chấm lạ');
  const am = doiChungAm(() => {
    const hopLe = ['Gian Bích'];                     // so chuỗi thô như bản trước khi vá
    const ten = fs.readdirSync(vao).filter((t) => /Bích/.test(t.normalize('NFC')))[0];
    return hopLe.indexOf(ten) >= 0 ? [] : ['so chuỗi thô: thư mục "' + ten.normalize('NFC') + '" (NFD trên đĩa) bị coi là tên lạ'];
  }, 'so tên thư mục bằng chuỗi thô, không chuẩn hóa NFC');
  return 'thư mục NFD nhận đúng · ' + am;
});

// ===================================================================== kết
for (const d of RAC) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* kệ */ } }
console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG' + (boQua ? ' · ' + boQua + ' BỎ QUA' : '') + ' · tổng ' + (dat + hong + boQua) + ' ===');
process.exit(hong ? 1 : 0);
