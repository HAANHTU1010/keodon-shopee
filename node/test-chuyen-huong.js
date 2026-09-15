/**
 * test-chuyen-huong.js — 2.7.1: CHUYỂN HƯỚNG NHIỀU NẤC + ĐỌC LẠI CỜ SAU LỖI ĐƯỜNG TRUYỀN. Chạy: `node node/test-chuyen-huong.js`.
 *
 * SỰ CỐ THẬT (14/9 23:01, máy 2.7.0): nút 3 chế độ 1 báo "LỖI QUYỀN TRUY CẬP … Chi tiết (HTTP 302): Web App trả về không phải JSON.
 * Nội dung: " sau ~36 giây — trong khi nút 4 cùng Web App năm phút sau chạy tốt. Không phải lỗi quyền: `_goi` chỉ đi theo ĐÚNG MỘT
 * nấc 302; phản hồi 3xx thứ hai (hay 302 không Location) rơi vào `JSON.parse('')` → `loiQuyen`. Người bấm đi kiểm quyền, và không ai
 * biết Google đã chạy tới đâu.
 *
 * Không mạng. Web App giả (`node/gia-lap-web-app.js`) dựng đúng các chuỗi chuyển hướng (`sim.datLoi({ soNac, cuoi, chuyenHuongCho,
 * truocKhiChay, giuKhoa, tuongDoi })`) và chạy MÃ THẬT `src/*.gs`. Phần tạo tháng chạy trên file tháng 9 THẬT nạp từ `00_DAU_VAO` (chỉ
 * đọc) — cần sổ thật để Google đi được tới cờ tiến độ thật.
 *
 * Mỗi chỉ tiêu kèm ĐỐI CHỨNG ÂM: nạp BẢN SỬA của file máy trong bộ nhớ (`napBanSua`, không ghi đĩa) dựng lại đúng khuyết tật, chứng
 * minh phép chấm LỆCH. Mã bài `T-CH-xx`.
 */
'use strict';

// Cờ `DA_KHOI_TAO_<giờ>` do mã .gs ghi theo múi giờ dự án — ghim TRƯỚC mọi thứ (xem `node/mui-gio-du-an.js`, TM-W-25).
require('./mui-gio-du-an').ghimMuiGioDuAn();

const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
// Nạp TRƯỚC `gsheet-web-app`: module này cắt cầu mạng.
const gl = require('./gia-lap-web-app');
const { napXlsxVaoGiaLap } = require('./nap-xlsx-gia-lap');
const { tinhLaiBangTinh } = require('./tinh-lai-gia-lap');
const gw = require('./gsheet-web-app');
const NUT3 = require('./nut-3-thang-moi');
const httpsGia = require('https');                      // chính là bản giả đã cắm vào require.cache

const lop = gl.napLoiMay();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });

const DAU_VAO = path.join(__dirname, '..', '..', '..', '00_DAU_VAO');
const FILE_T9 = path.join(DAU_VAO, 'DEMO THÁNG-9-2026-KINH-DOANH-POB.xlsx');
const TEN_T9 = 'DEMO THÁNG-9-2026-KINH-DOANH-POB';
const MAY_CHU_CH = 'script.googleusercontent.com';

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
async function test(ma, ten, fn) {
  try {
    const t = await fn();
    soDat++;
    console.log('ĐẠT   ' + ma + ' ' + ten);
    if (t) console.log('        · ' + t);
  } catch (e) {
    soHong++;
    hong.push(ma + ' ' + ten + ' -> ' + (e && e.message));
    console.log('HỎNG  ' + ma + ' ' + ten + '\n   -> ' + (e && e.message));
  }
}
function bang(thuc, mong, vi) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((vi ? vi + ': ' : '') + 'được ' + a + ', cần ' + b);
}
function dung(dk, vi) { if (!dk) throw new Error(vi || 'điều kiện sai'); }
/** `fn` dựng lại đúng MỘT khuyết tật, trả danh sách điều phép chấm bắt được. Rỗng = phép chấm mù. */
async function doiChungAm(fn, moTa) {
  const ra = await fn();
  if (!Array.isArray(ra) || !ra.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa + ' — phép chấm này không bắt được gì');
  return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + String(ra[0]).slice(0, 160) + ') ← đúng như phải thế';
}
/** Chạy một việc PHẢI ném; trả lỗi. */
async function batLoi(fn, vi) {
  let kq;
  try { kq = await fn(); } catch (e) { return e; }
  throw new Error((vi ? vi + ': ' : '') + 'lẽ ra phải ném lỗi mà lại trả về ' + JSON.stringify(kq).slice(0, 160));
}

/** Nạp bản sửa của một file trong node/. `doi` = [[mốc, thay], …], mỗi mốc đúng MỘT chỗ — không thì dừng to. */
function napBanSua(tenFile, doi) {
  const tep = path.join(__dirname, tenFile);
  let src = fs.readFileSync(tep, 'utf8');
  for (const [moc, thay] of doi) {
    const n = src.split(moc).length - 1;
    if (n !== 1) throw new Error('mốc đối chứng âm trong ' + tenFile + ' cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 80) + ' — mã đã đổi, sửa mốc, ĐỪNG bỏ bài');
    src = src.split(moc).join(thay);
  }
  const m = new Module(tep, module);
  m.filename = tep;
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(src, tep);
  return m.exports;
}

/** Sửa nguồn .gs cho Web App giả; mốc phải có ĐÚNG một chỗ. */
function suaGs(moc, thay) {
  return (src) => {
    const n = src.split(moc).length - 1;
    if (n !== 1) throw new Error('mốc .gs cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 80) + ' — mã đã đổi, sửa mốc, ĐỪNG bỏ bài');
    return src.split(moc).join(thay);
  };
}

// ==================================================================== bối cảnh

/** Web App giả tối giản cho phần đường truyền: `ping` không mở file; `coTaoThang` cần file tháng 10 có `Mapping_san_pham`. */
function dungNho() {
  const sim = gl.taoGiaLap({});
  gl.dungKhungThieu(sim.khaiThang('2026-10', 'THÁNG-10-2026-KINH-DOANH', { khongKhaiLink: true }));
  return { sim, web: new gw.WebAppGoogleSheet(sim.cauHinhMay()) };
}

/** Đường đi chỉ được mang TÊN MÁY CHỦ — không path, không query, không link Web App. */
function lotDuongDi(ds, sim) {
  const chu = (ds || []).join('\n');
  return [/user_content_key/, /\/macros\//, /\?/, /https?:/].filter((rx) => rx.test(chu)).map((rx) => 'đường đi lọt ' + rx)
    .concat(chu.indexOf(sim.url) >= 0 ? ['link Web App'] : []);
}

const MAU = {};
function saoFile(nguon, dich) {
  nguon.getSheets().forEach((sh) => {
    const n = dich.themSheet(sh.ten);
    ['giaTri', 'congThuc', 'dinhDang', 'nen', 'dam'].forEach((k) => { n[k] = Object.assign({}, sh[k]); });
    n.gopO = sh.gopO.map((g) => Object.assign({}, g));
    n.soDongToiDa = sh.soDongToiDa;
  });
  return dich;
}
function chup(ss) {
  const a = {};
  ss.getSheets().forEach((sh) => { a[sh.ten] = JSON.stringify([sh.giaTri, sh.congThuc, sh.gopO], (k, v) => (v instanceof Date ? 'D' + v.getTime() : v)); });
  return a;
}
const coTM = (ss, r) => { const sh = ss.getSheetByName('Mapping_san_pham'); return sh ? String(sh.giaTri[r + ':15'] == null ? '' : sh.giaTri[r + ':15']) : ''; };
const RAC = [];

/**
 * Cặp tháng 9 → 10 (bản sao nguyên vẹn) trên Web App giả, đồng hồ Google = BÂY GIỜ (cờ DA_KHOI_TAO_ ghi giờ thật của lần chạy),
 * kèm thư mục vận hành có CAU_HINH_VAN_HANH.json cho nút 3.
 */
function dungMay(o) {
  o = o || {};
  const sim = gl.taoGiaLap({ ngay: new Date(), suaNguon: o.suaNguon });
  const ssCu = saoFile(MAU.T9, sim.khaiThang('2026-09', TEN_T9));
  const ssMoi = saoFile(MAU.T9, sim.khaiThang('2026-10', 'THÁNG-10-2026-KINH-DOANH', { khongKhaiLink: true }));
  if (o.vo) o.vo(ssMoi, ssCu, sim);
  sim.khiFlush = () => { tinhLaiBangTinh(ssMoi); };
  if (o.buocMs) sim.datBuocDongHo(o.buocMs);
  const vh = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-tch-'));
  RAC.push(vh);
  const ch = path.join(vh, 'Cấu hình');
  fs.mkdirSync(ch);
  const tep = path.join(ch, 'CAU_HINH_VAN_HANH.json');
  fs.writeFileSync(tep, JSON.stringify({
    google_sheet: { bat: true, web_app_url: sim.url, chuoi_bi_mat: sim.biMat },
    link_thang: { '2026-08': sim.linkCua('2026-08'), '2026-09': sim.linkCua('2026-09') }
  }, null, 2) + '\n', 'utf8');
  return { sim, ssCu, ssMoi, vh, ch, tep, truocMoi: chup(ssMoi) };
}
const TS = (X) => ({ thangCu: 9, namCu: 2026, linkCu: X.sim.linkCua('2026-09'), thangMoi: 10, namMoi: 2026, linkMoi: X.sim.linkCua('2026-10') });
const TL1 = (X) => ['9', '2026', X.sim.linkCua('2026-09'), '10', '2026', X.sim.linkCua('2026-10'), '1', 'c'];

/** Một lần `taoThangMoi` phía máy; trả `{ kq }` hoặc `{ e }` cùng máy đã dùng. */
async function taoMay(X, Lop, tc) {
  const web = new (Lop || gw).WebAppGoogleSheet(X.sim.cauHinhMay());
  try { return { web, kq: await web.taoThangMoi(TS(X), tc || {}) }; } catch (e) { return { web, e }; } finally { X.sim.datBuocDongHo(0); }
}

async function bamNut3(X, tc) {
  let ra = '';
  const mod = (tc && tc.mod) || NUT3;
  const ma = await mod.chay(Object.assign({ vh: X.vh, traLoi: TL1(X), mau: false, ra: (s) => { ra += s; }, thoiDiem: new Date().toISOString() },
    (tc && tc.them) || {}));
  const dNk = path.join(X.ch, 'nhật ký');
  const nhatKy = fs.existsSync(dNk) ? fs.readdirSync(dNk).map((t) => fs.readFileSync(path.join(dNk, t), 'utf8')).join('\n') : '';
  X.sim.datBuocDongHo(0);
  return { ma, ra, nhatKy };
}

/** Mọi thứ phía máy in ra + nhật ký: không ID, không link file tháng, không chuỗi bí mật, không link Web App, không đường dẫn chuyển hướng. */
function lotMay(X, chu) {
  return ['2026-08', '2026-09', '2026-10'].filter((k) => chu.indexOf(X.sim.idCua(k)) >= 0).map((k) => 'ID ' + k)
    .concat(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/\w/.test(chu) ? ['link file tháng'] : [])
    .concat(chu.indexOf(X.sim.biMat) >= 0 ? ['chuỗi bí mật'] : [])
    .concat(chu.indexOf(X.sim.url) >= 0 ? ['link Web App'] : [])
    .concat(/user_content_key|\/macros\//.test(chu) ? ['đường dẫn chuyển hướng'] : []);
}

// Chuỗi hỏng đúng hình dạng sự cố 23:01 cho gói taoThangMoi: POST→302 → GET→302 KHÔNG có Location.
const HONG_2301 = { chuyenHuongCho: 'taothangmoi', soNac: 2, cuoi: 'khongLocation' };

// ====================================================================================================

(async function chay() {
  console.log('=== 2.7.1: CHUYỂN HƯỚNG NHIỀU NẤC + ĐỌC LẠI CỜ SAU LỖI ĐƯỜNG TRUYỀN ===\n');

  // ---------------------------------------------------------------- 1. đường truyền
  console.log('--- đường truyền: chuỗi chuyển hướng, thân rỗng, trang đăng nhập ---');

  await test('T-CH-01', '2 nấc, 5 nấc và Location TƯƠNG ĐỐI → về JSON; đường đi ghi đủ từng nấc, chỉ TÊN MÁY CHỦ', async () => {
    const cham = async (Lop) => {
      const loi = [], so = {};
      for (const [ten, co, mong] of [
        ['2 nấc', { soNac: 2 }, ['POST→302 (có Location → ' + MAY_CHU_CH + ')', 'GET→302 (có Location → ' + MAY_CHU_CH + ')', 'GET→200']],
        ['5 nấc', { soNac: 5 }, ['POST→302 (có Location → ' + MAY_CHU_CH + ')'].concat(Array(4).fill('GET→302 (có Location → ' + MAY_CHU_CH + ')'), ['GET→200'])],
        ['tương đối 2 nấc', { soNac: 2, tuongDoi: true }, ['POST→302 (có Location → script.google.com)', 'GET→302 (có Location → script.google.com)', 'GET→200']]
      ]) {
        const { sim } = dungNho();
        const web = new Lop.WebAppGoogleSheet(sim.cauHinhMay());
        sim.datLoi(co);
        try {
          const kq = await web.ping();
          if (!kq || kq.hanhDong !== 'ping') loi.push(ten + ': không về JSON ping');
          if (JSON.stringify(web.duongDiCuoi) !== JSON.stringify(mong)) loi.push(ten + ': đường đi ' + JSON.stringify(web.duongDiCuoi));
          lotDuongDi(web.duongDiCuoi, sim).forEach((x) => loi.push(ten + ': ' + x));
          so[ten] = web.duongDiCuoi.length;
        } catch (e) { loi.push(ten + ': ' + e.message.slice(0, 120)); }
        sim.thaoGo();
      }
      return { loi, so };
    };
    const kq = await cham(gw);
    bang(kq.loi, [], 'bản hiện hành');
    bang(gw.SO_NAC_CHUYEN_HUONG_TOI_DA, 5, 'trần nấc');
    return '2 nấc → ' + kq.so['2 nấc'] + ' mục · 5 nấc → ' + kq.so['5 nấc'] + ' mục · tương đối ghép máy chủ gốc · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['const SO_NAC_CHUYEN_HUONG_TOI_DA = 5;', 'const SO_NAC_CHUYEN_HUONG_TOI_DA = 1;']]);
      return (await cham(Sai)).loi.filter((x) => /^2 nấc/.test(x));
    }, 'trần 1 nấc (như 2.7.0)');
  });

  await test('T-CH-02', '6 nấc · POST→302 không Location · GET→302 không Location (chuỗi 23:01) → CHUYEN_HUONG_HONG, câu "chuyển hướng N nấc", nói rõ lỗi ĐƯỜNG TRUYỀN, KHÔNG "LỖI QUYỀN"', async () => {
    const ca = [
      ['6 nấc', { soNac: 6 }, 6, /máy chỉ đi theo tối đa 5 nấc/, 'GET→302 (có Location → ' + MAY_CHU_CH + ')'],
      ['POST→302 không Location', { soNac: 1, cuoi: 'khongLocation' }, 1, /không có địa chỉ Location/, 'POST→302 (KHÔNG có Location)'],
      ['GET→302 không Location', { soNac: 2, cuoi: 'khongLocation' }, 2, /không có địa chỉ Location/, 'GET→302 (KHÔNG có Location)']
    ];
    const ra = [];
    for (const [ten, co, n, rx, cuoiDuong] of ca) {
      const { sim, web } = dungNho();
      sim.datLoi(co);
      const e = await batLoi(() => web.ping(), ten);
      bang(e.maKeodon, 'CHUYEN_HUONG_HONG', ten + ' mã');
      dung(e.message.indexOf('Google chuyển hướng ' + n + ' nấc mà không về JSON') === 0, ten + ': câu phải mở đầu "Google chuyển hướng ' + n + ' nấc…": ' + e.message.slice(0, 120));
      dung(rx.test(e.message) && /lỗi ĐƯỜNG TRUYỀN, KHÔNG phải lỗi quyền truy cập/.test(e.message), ten + ': thiếu lý do / câu đường truyền: ' + e.message);
      dung(!/LỖI QUYỀN/.test(e.message), ten + ': gọi nhầm là lỗi quyền: ' + e.message.slice(0, 160));
      dung(e.loiDuongTruyen === true && e.cauGoc && e.message.indexOf(e.cauGoc) === 0 && e.cauGoc.length < e.message.length, ten + ': thiếu dấu loiDuongTruyen / cauGoc');
      bang(web.duongDiCuoi.length, n, ten + ' số mục đường đi');
      bang(web.duongDiCuoi[n - 1], cuoiDuong, ten + ' nấc cuối');
      dung(e.message.indexOf('Đường đi: ' + web.duongDiCuoi.join(' · ')) > 0, ten + ': câu không kèm đường đi');
      bang(lotDuongDi(web.duongDiCuoi, sim), [], ten + ' INV-7 đường đi');
      sim.thaoGo();
      ra.push(ten + ' → "' + e.message.slice(0, 70) + '…"');
    }
    return ra.join(' · ');
  });

  await test('T-CH-03', '200 THÂN RỖNG → KHONG_PHAI_JSON "thân rỗng (HTTP 200)", không phải lỗi quyền; trang HTML đăng nhập VẪN là lỗi quyền D-46', async () => {
    const chamRong = async (Lop) => {
      const loi = [];
      const { sim } = dungNho();
      const web = new Lop.WebAppGoogleSheet(sim.cauHinhMay());
      sim.datLoi({ soNac: 1, cuoi: 'rong200' });
      const e = await batLoi(() => web.ping(), 'thân rỗng');
      if (/LỖI QUYỀN/.test(e.message)) loi.push('gọi nhầm lỗi quyền: ' + e.message.split('\n').join(' ').slice(0, 170));
      if (e.maKeodon !== 'KHONG_PHAI_JSON') loi.push('mã ' + e.maKeodon);
      if (!/thân rỗng \(HTTP 200\)/.test(e.message)) loi.push('thiếu "thân rỗng (HTTP 200)"');
      if (e.loiDuongTruyen !== true) loi.push('thiếu dấu loiDuongTruyen');
      sim.thaoGo();
      return { loi, cau: e.message };
    };
    const hienHanh = await chamRong(gw);
    bang(hienHanh.loi, [], 'bản hiện hành');
    // Trang đăng nhập HTML: giữ nguyên D-46 ca (2).
    const { sim, web } = dungNho();
    sim.datLoi({ htmlDangNhap: true });
    const eH = await batLoi(() => web.ping(), 'trang đăng nhập');
    dung(/^LỖI QUYỀN TRUY CẬP/.test(eH.message) && eH.maKeodon === 'LOI_QUYEN' && /trang HTML\/đăng nhập/.test(eH.message), 'trang đăng nhập phải là lỗi quyền: ' + eH.message.slice(0, 160));
    dung(!eH.loiDuongTruyen, 'trang đăng nhập không được đánh dấu lỗi đường truyền');
    sim.thaoGo();
    return '"' + hienHanh.cau.slice(0, 90) + '…" · trang đăng nhập → LOI_QUYEN · ' + await doiChungAm(async () => {
      // Đưa nhánh thân rỗng về `loiQuyen` y như 2.7.0 — dựng lại đúng câu người bấm đọc lúc 23:01.
      const Sai = napBanSua('gsheet-web-app.js', [['            return tuChoi(loiKhongPhaiJson(res.statusCode, buf));',
        "            try { loiQuyen(thangGoi, 'Web App trả về không phải JSON. Nội dung: ' + this.chePhu(buf).replace(/\\s+/g, ' ').slice(0, 160), res.statusCode); } catch (eh) { return tuChoi(eh); }"]]);
      return (await chamRong(Sai)).loi;
    }, 'thân rỗng đưa về loiQuyen (câu 23:01)');
  });

  await test('T-CH-04', 'đánh dấu LỖI ĐƯỜNG TRUYỀN đúng phạm vi: mạng / 500 / chuyển hướng / thân rỗng CÓ dấu; 403, trang đăng nhập, HANH_DONG_LA, sai chuỗi bí mật KHÔNG; câu phía nút 4 giữ nguyên ý', async () => {
    const ca = [
      ['mất mạng', { loiKetNoi: 'ECONNRESET' }, true, /Không gọi được Web App \(ECONNRESET\)\. Gói này CHƯA GHI ĐƯỢC/],
      ['HTTP 500', { ma500: true }, true, /Web App trả mã 500 .*Việc phải làm: chạy lại sau vài phút/],
      ['quá 6 phút', { quaSauPhut: true }, true, /chia nhỏ file thả vào/],
      ['6 nấc', { soNac: 6 }, true, /chạy lại tool/],
      ['thân rỗng', { cuoi: 'rong200' }, true, /không bị ghi trùng/],
      ['403', { ma403: true }, false, /^LỖI QUYỀN TRUY CẬP/],
      ['trang đăng nhập', { htmlDangNhap: true }, false, /^LỖI QUYỀN TRUY CẬP/],
      ['Google cũ HANH_DONG_LA', { lechPhienBan: { kieu: 'HANH_DONG_LA' } }, false, /HANH_DONG_LA/]
    ];
    const ra = [];
    for (const [ten, co, mong, rx] of ca) {
      const { sim, web } = dungNho();
      sim.datLoi(co);
      const e2 = await batLoi(() => web.ping(), ten);
      sim.thaoGo();
      bang(e2.loiDuongTruyen === true, mong, ten + ' dấu loiDuongTruyen');
      if (mong) dung(typeof e2.cauGoc === 'string' && e2.cauGoc && Array.isArray(e2.duongDi), ten + ': thiếu cauGoc/duongDi');
      dung(rx.test(e2.message), ten + ': câu lệch ý ' + rx + ' — ' + e2.message.slice(0, 200));
      ra.push(ten + (mong ? ' ✓dấu' : ' ✗dấu'));
    }
    // Sai chuỗi bí mật: câu nghiệp vụ, không phải đường truyền.
    const { sim } = dungNho();
    const eBm = await batLoi(() => new gw.WebAppGoogleSheet(sim.cauHinhMay({ chuoi_bi_mat: sim.biMat + 'x' })).ping(), 'sai chuỗi');
    sim.thaoGo();
    dung(eBm.maKeodon === 'SAI_BI_MAT' && !eBm.loiDuongTruyen, 'sai chuỗi bí mật: ' + eBm.maKeodon + ' / ' + eBm.loiDuongTruyen);
    return ra.join(' · ') + ' · SAI_BI_MAT ✗dấu';
  });

  await test('T-CH-05', 'thời gian chờ MỖI NẤC: ping 3 nấc chờ 300 giây ở POST và từng GET; lượt đọc cờ `coTaoThang` 3 nấc chờ 90 giây ở mọi nấc', async () => {
    const doCho = async (Lop) => {
      const { sim } = dungNho();
      const web = new Lop.WebAppGoogleSheet(sim.cauHinhMay());
      const cho = [];
      const gocReq = httpsGia.request, gocGet = httpsGia.get;
      let nhan = '';
      httpsGia.request = function (opt, cb) { cho.push(nhan + ' POST ' + (opt && opt.timeout)); return gocReq.call(this, opt, cb); };
      httpsGia.get = function (u, o2, cb) { cho.push(nhan + ' GET ' + (o2 && o2.timeout)); return gocGet.call(this, u, o2, cb); };
      try {
        sim.datLoi({ soNac: 3 });
        nhan = 'ping'; await web.ping();
        nhan = 'coTaoThang'; await web.docCoTaoThang(sim.idCua('2026-10'), '2026-10');
      } finally { httpsGia.request = gocReq; httpsGia.get = gocGet; sim.thaoGo(); }
      return cho;
    };
    const mong = ['ping POST 300000', 'ping GET 300000', 'ping GET 300000', 'ping GET 300000',
      'coTaoThang POST 90000', 'coTaoThang GET 90000', 'coTaoThang GET 90000', 'coTaoThang GET 90000'];
    const cho = await doCho(gw);
    bang(cho, mong, 'thời gian chờ từng nấc');
    bang([gw.TIMEOUT_MS, gw.TIMEOUT_DOC_CO_MS], [300000, 90000]);
    return cho.length + ' lệnh gửi đúng số chờ · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [["            g = https.get(diaChi, { timeout: choMs }, (r2) => nhanPhanHoi(r2, 'GET'));",
        "            g = https.get(diaChi, { timeout: TIMEOUT_MS }, (r2) => nhanPhanHoi(r2, 'GET'));"]]);
      const c = await doCho(Sai);
      return c.filter((x, i) => x !== mong[i]);
    }, 'GET chuyển hướng chờ số cố định, không theo lượt');
  });

  // ---------------------------------------------------------------- 2. kết luận (hàm thuần)
  console.log('\n--- kết luận sau lỗi đường truyền (hàm thuần ketLuanSauLoiDuongTruyen) ---');

  await test('T-CH-06', 'ketLuanSauLoiDuongTruyen: đọc cờ hỏng / Google cũ → CHUA_RO_TIEN_DO · dangChay → GOOGLE_DANG_CHAY · DA_KHOI_TAO → DA_CHAY_XONG · B5_DANG_LAM · dừng giữa chừng → DUNG_GIUA_CHUNG · không cờ → CHUA_GHI_GI; mọi câu mở đầu bằng câu gốc + đường đi', async () => {
    const K = gw.ketLuanSauLoiDuongTruyen;
    const GOC = 'Google chuyển hướng 2 nấc mà không về JSON (nấc cuối HTTP 302, không có địa chỉ Location).';
    const DD = ['POST→302 (có Location → ' + MAY_CHU_CH + ')', 'GET→302 (KHÔNG có Location)'];
    const bayGio = Date.UTC(2026, 9, 1, 2, 0);                   // 09:00 1/10/2026 giờ Việt Nam
    const loiLa = Object.assign(new Error('Web App từ chối [HANH_DONG_LA]: hanhDong = "cotaothang"'), { maKeodon: 'HANH_DONG_LA' });
    const loiMang = Object.assign(new Error('Không gọi được Web App (ETIMEDOUT). Gói này…'), { cauGoc: 'Không gọi được Web App (ETIMEDOUT).' });
    const co = (x) => Object.assign({ ok: true, hanhDong: 'coTaoThang', thang: '2026-10', dangChay: false, coKhoiTao: '', buocDaXong: '' }, x);
    const ca = [
      ['Google cũ', [null, loiLa], 'CHUA_RO_TIEN_DO', [/Google đang chạy bản cũ, chưa có lệnh đọc cờ/, /VẪN ĐANG CHẠY/, /ĐỪNG bấm lại ngay: đợi 5 phút/]],
      ['đọc cờ đứt mạng', [null, loiMang], 'CHUA_RO_TIEN_DO', [/lượt đọc cờ cũng hỏng: Không gọi được Web App \(ETIMEDOUT\)\./, /ĐỪNG bấm lại ngay/]],
      ['đang chạy', [co({ dangChay: true, coKhoiTao: 'DANG_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B4' }), null], 'GOOGLE_DANG_CHAY',
        [/Google VẪN ĐANG CHẠY \(cờ BUOC_DA_XONG hiện là B4\)/, /CHƯA phải thất bại/, /ĐỪNG bấm lại ngay \(hai lượt sẽ chạy chồng nhau\)/]],
      ['đang chạy dù cờ đã DA', [co({ dangChay: true, coKhoiTao: 'DA_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B7' }), null], 'GOOGLE_DANG_CHAY', [/VẪN ĐANG CHẠY/]],
      ['đã xong', [co({ coKhoiTao: 'DA_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B7' }), null], 'DA_CHAY_XONG', [/ĐÃ chạy xong và tự kiểm đạt/, /CHẾ ĐỘ 2 với đúng link \[6\/7\]/]],
      ['B5 dở', [co({ coKhoiTao: 'DANG_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B5_DANG_LAM' }), null], 'B5_DANG_LAM', [/Xóa bản sao đó/, /bản sao MỚI/]],
      ['dừng ở B4', [co({ coKhoiTao: 'DANG_KHOI_TAO_2026-10-01 09:00', buocDaXong: 'B4' }), null], 'DUNG_GIUA_CHUNG', [/Google đã DỪNG/, /chạy tiếp từ sau B4/]],
      ['vừa đặt cờ', [co({ coKhoiTao: 'DANG_KHOI_TAO_2026-10-01 09:00' }), null], 'DUNG_GIUA_CHUNG', [/\(chưa bước nào\)/]],
      ['không cờ', [co({}), null], 'CHUA_GHI_GI', [/chưa có cờ nào — chưa ô nào bị ghi/, /ĐỪNG chọn chế độ 2/]],
      // Cờ DA_KHOI_TAO ghi TRƯỚC lần bấm này 30 ngày: cờ của sổ tháng trước đi theo bản sao — không được bảo chọn chế độ 2.
      ['cờ tháng trước theo bản sao', [co({ coKhoiTao: 'DA_KHOI_TAO_2026-09-01 08:00', buocDaXong: 'B7' }), null, { batDauMs: bayGio }], 'CO_CU_TRUOC_LUOT_NAY',
        [/KHÔNG phải do lần này ghi/, /bấm lại nút 3 CHẾ ĐỘ 1/, /ĐỪNG chọn chế độ 2 trước khi thấy câu đó/]],
      ['cờ vừa ghi trong lần bấm này', [co({ coKhoiTao: 'DA_KHOI_TAO_2026-10-01 08:59', buocDaXong: 'B7' }), null, { batDauMs: bayGio }], 'DA_CHAY_XONG', [/CHẾ ĐỘ 2/]]
    ];
    const loi = [];
    for (const [ten, [c, ld, tc], ma, rxs] of ca) {
      const k = K(GOC, c, ld, DD, tc);
      if (k.ma !== ma) loi.push(ten + ': mã ' + k.ma + ' ≠ ' + ma);
      if (k.cau.indexOf(GOC + ' Đường đi: ' + DD.join(' · ') + '.') !== 0) loi.push(ten + ': không mở đầu bằng câu gốc + đường đi');
      if (!/link_thang CHƯA được khai/.test(k.cau)) loi.push(ten + ': không nói link_thang CHƯA được khai');
      rxs.forEach((rx) => { if (!rx.test(k.cau)) loi.push(ten + ': thiếu ' + rx); });
      if (ma !== 'GOOGLE_DANG_CHAY' && ma !== 'CHUA_RO_TIEN_DO' && /ĐỪNG bấm lại ngay/.test(k.cau)) loi.push(ten + ': bảo đợi khi Google đã dừng');
      if (/LỖI QUYỀN/.test(k.cau)) loi.push(ten + ': có chữ LỖI QUYỀN');
    }
    // Câu gốc đã có đường đi thì không lặp lại.
    const daCo = K(GOC + ' Đường đi: x.', co({}), null, DD);
    if (daCo.cau.split('Đường đi:').length !== 2) loi.push('lặp đường đi hai lần');
    bang(loi, [], 'bảng ' + ca.length + ' ca');
    return ca.length + ' ca đúng mã + đúng việc · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['    if (moc != null && t.batDauMs != null && moc < Number(t.batDauMs) - DUNG_SAI_GIO_CO_MS) {', '    if (false) {']]);
      const k = Sai.ketLuanSauLoiDuongTruyen(GOC, co({ coKhoiTao: 'DA_KHOI_TAO_2026-09-01 08:00', buocDaXong: 'B7' }), null, DD, { batDauMs: bayGio });
      return k.ma !== 'CO_CU_TRUOC_LUOT_NAY' ? ['cờ tháng trước → ' + k.ma + ': "…' + k.cau.slice(k.cau.indexOf('→'), k.cau.indexOf('→') + 90) + '"'] : [];
    }, 'bỏ phép xét tuổi cờ DA_KHOI_TAO');
  });

  // ---------------------------------------------------------------- 3. taoThangMoi phía máy qua chuỗi hỏng
  if (!fs.existsSync(FILE_T9)) { console.log('HỎNG  thiếu file dữ liệu thật: ' + FILE_T9); process.exit(1); }
  {
    const simNap = gl.taoGiaLap({});
    const ss = simNap.khaiThang('2026-09', TEN_T9);
    await napXlsxVaoGiaLap(ss, FILE_T9);
    tinhLaiBangTinh(ss);
    MAU.T9 = ss;
    simNap.thaoGo();
  }
  console.log('\n--- taoThangMoi phía máy: Google trả chuỗi 23:01 (POST→302 → GET→302 không Location) — máy đọc lại cờ rồi mới kết luận ---');

  await test('T-CH-07', '(a) Google ĐÃ chạy (dừng gọn giữa chừng) và khóa còn bị giữ → GOOGLE_DANG_CHAY, câu có cờ BUOC_DA_XONG THẬT đọc từ file, "ĐỪNG bấm lại ngay"; nhật ký đường truyền đủ hai dòng', async () => {
    const chay = async (Lop) => {
      const X = dungMay({ buocMs: 300 });
      X.sim.datLoi(Object.assign({ giuKhoa: true }, HONG_2301));
      const r = await taoMay(X, Lop, { nguongGiay: 20 });
      X.sim.xoaLoi(); X.sim.khoaBiMayKhacGiu = false;
      return Object.assign(r, { X });
    };
    const { e, web, X } = await chay(gw);
    dung(e, 'phải ném lỗi');
    const buoc = coTM(X.ssMoi, 5);
    dung(/^B\w+/.test(buoc) && buoc !== 'B7', 'Google phải đã chạy tới giữa chừng, cờ đang là ' + buoc);
    bang(e.maKeodon, 'GOOGLE_DANG_CHAY');
    dung(e.message.indexOf('Google chuyển hướng 2 nấc mà không về JSON (nấc cuối HTTP 302, không có địa chỉ Location).') === 0, 'phải mở đầu bằng câu gốc: ' + e.message.slice(0, 120));
    dung(e.message.indexOf('Google VẪN ĐANG CHẠY (cờ BUOC_DA_XONG hiện là ' + buoc + ')') > 0, 'câu phải nêu cờ thật ' + buoc + ': ' + e.message);
    dung(/ĐỪNG bấm lại ngay/.test(e.message) && !/LỖI QUYỀN/.test(e.message), 'thiếu "ĐỪNG bấm lại ngay" / có chữ LỖI QUYỀN');
    bang(web.nhatKyDuongTruyen, ['lượt 1: POST→302 (có Location → ' + MAY_CHU_CH + ') · GET→302 (KHÔNG có Location)',
      'đọc lại cờ: POST→302 (có Location → ' + MAY_CHU_CH + ') · GET→200'], 'nhật ký đường truyền');
    bang(X.sim.nhatKyGoi.map((g) => g.hanhDong), ['ping', 'taothangmoi', 'cotaothang'], 'các lượt gửi đi');
    X.sim.thaoGo();
    return 'cờ thật ' + buoc + ' · "…' + e.message.slice(e.message.indexOf('→ Google'), e.message.indexOf('→ Google') + 110) + '…" · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['      if (!e || !e.loiDuongTruyen) throw e;\n', '      throw e;\n']]);
      const y = await chay(Sai);
      y.X.sim.thaoGo();
      return !/VẪN ĐANG CHẠY/.test(y.e && y.e.message) ? ['bỏ đọc cờ → ' + (y.e && y.e.maKeodon) + ': "' + String(y.e && y.e.message).slice(-120) + '"'] : [];
    }, 'máy bỏ bước đọc lại cờ');
  });

  await test('T-CH-08', '(b) Google ĐÃ chạy, khóa rảnh → cờ thật quyết định: chạy trọn 8/8 → DA_CHAY_XONG (chế độ 2); dừng gọn giữa chừng → DUNG_GIUA_CHUNG nêu đúng bước, bấm lại chạy tiếp tới 8/8', async () => {
    // (b1) chạy trọn
    const X1 = dungMay({});
    X1.sim.datLoi(HONG_2301);
    const r1 = await taoMay(X1);
    X1.sim.xoaLoi();
    dung(r1.e, 'b1 phải ném lỗi');
    const co1 = coTM(X1.ssMoi, 1);
    dung(/^DA_KHOI_TAO_/.test(co1), 'b1: Google phải đã chạy trọn, O1 = ' + co1);
    bang(r1.e.maKeodon, 'DA_CHAY_XONG', 'b1 mã');
    dung(r1.e.message.indexOf('(cờ ' + co1 + ')') > 0 && /CHẾ ĐỘ 2 với đúng link \[6\/7\]/.test(r1.e.message), 'b1 câu: ' + r1.e.message);
    X1.sim.thaoGo();
    // (b2) dừng gọn giữa chừng rồi bấm lại
    const X2 = dungMay({ buocMs: 300 });
    X2.sim.datLoi(HONG_2301);
    const r2 = await taoMay(X2, gw, { nguongGiay: 20 });
    X2.sim.xoaLoi();
    const b2 = coTM(X2.ssMoi, 5);
    dung(r2.e && r2.e.maKeodon === 'DUNG_GIUA_CHUNG', 'b2 mã: ' + (r2.e && r2.e.maKeodon) + ' — ' + (r2.e && r2.e.message));
    dung(r2.e.message.indexOf('cờ BUOC_DA_XONG = ' + b2) > 0 && r2.e.message.indexOf('chạy tiếp từ sau ' + b2) > 0, 'b2 câu phải nêu cờ thật ' + b2 + ': ' + r2.e.message);
    X2.sim.datBuocDongHo(300);
    const lai = await taoMay(X2, gw, { nguongGiay: 20 });
    dung(lai.kq && lai.kq.ok === true && lai.kq.kiem.length === 8 && lai.kq.kiem.every((p) => p.dat), 'bấm lại phải xong 8/8: ' + JSON.stringify(lai.kq || String(lai.e)).slice(0, 200));
    X2.sim.thaoGo();
    return 'b1 → DA_CHAY_XONG (' + co1 + ') · b2 → DUNG_GIUA_CHUNG ở ' + b2 + ', bấm lại ' + lai.kq.soLuot + ' lượt → 8/8';
  });

  await test('T-CH-09', '(c) chuỗi hỏng TRƯỚC khi Google chạy → CHUA_GHI_GI, file tháng mới y nguyên từng ô; bấm lại lần hai chạy bình thường tới 8/8', async () => {
    const X = dungMay({});
    X.sim.datLoi(Object.assign({ truocKhiChay: true }, HONG_2301));
    const r = await taoMay(X);
    X.sim.xoaLoi();
    dung(r.e && r.e.maKeodon === 'CHUA_GHI_GI', 'mã: ' + (r.e && r.e.maKeodon) + ' — ' + (r.e && r.e.message));
    dung(/chưa ô nào bị ghi/.test(r.e.message) && /Việc phải làm: bấm lại nút 3 chế độ 1/.test(r.e.message), 'câu: ' + r.e.message);
    bang(Object.keys(X.truocMoi).filter((t) => chup(X.ssMoi)[t] !== X.truocMoi[t]), [], 'sheet file mới bị đổi');
    const lai = await taoMay(X);
    dung(lai.kq && lai.kq.ok === true && lai.kq.kiem.every((p) => p.dat), 'bấm lại phải xong: ' + JSON.stringify(lai.kq || String(lai.e)).slice(0, 200));
    X.sim.thaoGo();
    return 'CHUA_GHI_GI, 0 sheet đổi · bấm lại → 8/8';
  });

  await test('T-CH-10', '(d) Google bản cũ chưa có lệnh `coTaoThang` → CHUA_RO_TIEN_DO: nói Google đang chạy bản cũ, CHƯA biết tới đâu, ĐỪNG bấm lại ngay', async () => {
    const X = dungMay({ suaNguon: suaGs("    if (hd === 'cotaothang') return traLoi_(hanhDongCoTaoThang_(body));", '') });
    X.sim.datLoi(HONG_2301);
    const r = await taoMay(X);
    X.sim.xoaLoi();
    dung(r.e && r.e.maKeodon === 'CHUA_RO_TIEN_DO', 'mã: ' + (r.e && r.e.maKeodon) + ' — ' + (r.e && r.e.message));
    dung(/Google đang chạy bản cũ, chưa có lệnh đọc cờ/.test(r.e.message) && /CHƯA biết Google đã chạy tới đâu/.test(r.e.message) &&
      /ĐỪNG bấm lại ngay: đợi 5 phút/.test(r.e.message), 'câu: ' + r.e.message);
    bang(X.sim.nhatKyGoi.map((g) => g.hanhDong), ['ping', 'taothangmoi', 'cotaothang'], 'các lượt gửi đi');
    X.sim.thaoGo();
    return '"…' + r.e.message.slice(r.e.message.indexOf('→ Máy'), r.e.message.indexOf('→ Máy') + 120) + '…"';
  });

  await test('T-CH-11', 'bản sao mang cờ DA_KHOI_TAO của THÁNG TRƯỚC + chuỗi hỏng trước khi Google chạy → CO_CU_TRUOC_LUOT_NAY, KHÔNG bảo chọn chế độ 2; bấm lại chế độ 1 → Google tạo được 8/8', async () => {
    const mocCu = new Date(Date.now() - 30 * 86400000 + 7 * 3600000).toISOString();
    const nhanCu = mocCu.slice(0, 10) + ' ' + mocCu.slice(11, 16);          // giờ Việt Nam, 30 ngày trước
    const datCo = (ssMoi, ssCu) => [ssMoi, ssCu].forEach((ss) => {
      const mp = ss.getSheetByName('Mapping_san_pham');
      ['TRANG_THAI_KHOI_TAO', 'THANG', 'NGUON_CLONE', 'PHIEN_BAN_TOOL', 'BUOC_DA_XONG'].forEach((n, i) => { mp.giaTri[(i + 1) + ':14'] = n; });
      mp.giaTri['1:15'] = 'DA_KHOI_TAO_' + nhanCu; mp.giaTri['2:15'] = '2026-09'; mp.giaTri['3:15'] = 'THÁNG-8'; mp.giaTri['4:15'] = 'GD3-v1.0'; mp.giaTri['5:15'] = 'B7';
    });
    const chay = async (Lop) => {
      const X = dungMay({ vo: datCo });
      X.sim.datLoi(Object.assign({ truocKhiChay: true }, HONG_2301));
      const r = await taoMay(X, Lop);
      X.sim.xoaLoi();
      return Object.assign(r, { X });
    };
    const { e, X } = await chay(gw);
    dung(e && e.maKeodon === 'CO_CU_TRUOC_LUOT_NAY', 'mã: ' + (e && e.maKeodon) + ' — ' + (e && e.message));
    dung(!/chọn CHẾ ĐỘ 2 với đúng link/.test(e.message) && /bấm lại nút 3 CHẾ ĐỘ 1/.test(e.message), 'câu: ' + e.message);
    const lai = await taoMay(X);
    dung(lai.kq && lai.kq.ok === true && lai.kq.kiem.every((p) => p.dat), 'bấm lại chế độ 1 phải tạo được: ' + JSON.stringify(lai.kq || String(lai.e)).slice(0, 200));
    X.sim.thaoGo();
    return 'cờ DA_KHOI_TAO_' + nhanCu + ' (tháng 2026-09) → CO_CU_TRUOC_LUOT_NAY · bấm lại → 8/8 · ' + await doiChungAm(async () => {
      // Từ YC-46 có HAI phép cùng canh: tháng trên cờ (O2) và, khi O2 không đọc được, tuổi cờ. "Tin mọi cờ" là tắt cả hai.
      const Sai = napBanSua('gsheet-web-app.js', [['    if (thangCo && kyMoi) {', '    if (false) {'],
        ['    if (moc != null && t.batDauMs != null && moc < Number(t.batDauMs) - DUNG_SAI_GIO_CO_MS) {', '    if (false) {']]);
      const y = await chay(Sai);
      y.X.sim.thaoGo();
      return /CHẾ ĐỘ 2 với đúng link/.test(y.e && y.e.message) ? ['bảo khai link chế độ 2 cho sổ CHƯA chuyển: ' + y.e.maKeodon] : [];
    }, 'tin mọi cờ DA_KHOI_TAO là của lần này');
  });

  // ---------------------------------------------------------------- 4. nút 3 trọn đường
  console.log('\n--- nút 3 chế độ 1 trọn đường: node/nut-3-thang-moi.js → WebAppGoogleSheet → Web App giả ---');

  await test('T-CH-12', 'nút 3 với (a) Google VẪN ĐANG CHẠY → mã thoát 6 "CHƯA PHẢI THẤT BẠI", KHÔNG "KHÔNG TẠO ĐƯỢC", link_thang y nguyên từng byte, nhật ký có dòng "Đường truyền"; Google cũ → mã 6; Google đã xong → mã 5 (YC-45), KHÔNG "KHÔNG TẠO ĐƯỢC"; không lọt ID/link/bí mật', async () => {
    const caA = async (mod) => {
      const X = dungMay({ buocMs: 300 });
      const truoc = fs.readFileSync(X.tep);
      X.sim.datLoi(Object.assign({ giuKhoa: true }, HONG_2301));
      const r = await bamNut3(X, { mod: mod, them: { nguongGiay: 20 } });
      X.sim.xoaLoi(); X.sim.khoaBiMayKhacGiu = false;
      return Object.assign(r, { X, cfgYNguyen: Buffer.compare(fs.readFileSync(X.tep), truoc) === 0 });
    };
    const a = await caA();
    dung(a.ma === 6, '(a) phải thoát mã 6, được ' + a.ma + ': ' + a.ra.slice(-400));
    dung(/CHƯA PHẢI THẤT BẠI — GOOGLE CÓ THỂ VẪN ĐANG CHẠY\./.test(a.ra) && /Google VẪN ĐANG CHẠY \(cờ BUOC_DA_XONG hiện là B/.test(a.ra), '(a) thiếu tiêu đề / câu: ' + a.ra.slice(-500));
    dung(!/KHÔNG TẠO ĐƯỢC/.test(a.ra), '(a) còn in "KHÔNG TẠO ĐƯỢC"');
    dung(/link_thang trong CAU_HINH_VAN_HANH\.json KHÔNG đổi/.test(a.ra) && a.cfgYNguyen, '(a) link_thang phải y nguyên');
    dung(/Đường truyền — lượt 1: POST→302/.test(a.nhatKy) && /Đường truyền — đọc lại cờ: POST→302/.test(a.nhatKy) && /Mã thoát: 6/.test(a.nhatKy),
      '(a) nhật ký thiếu dòng Đường truyền / mã thoát: ' + a.nhatKy.slice(-400));
    bang(lotMay(a.X, a.ra + '\n' + a.nhatKy), [], '(a) INV-7');
    a.X.sim.thaoGo();
    // (d) Google cũ chưa có coTaoThang → mã 6
    const Xd = dungMay({ suaNguon: suaGs("    if (hd === 'cotaothang') return traLoi_(hanhDongCoTaoThang_(body));", '') });
    Xd.sim.datLoi(HONG_2301);
    const d = await bamNut3(Xd);
    Xd.sim.xoaLoi();
    dung(d.ma === 6 && /Google đang chạy bản cũ/.test(d.ra) && !/KHÔNG TẠO ĐƯỢC/.test(d.ra), '(d) Google cũ: mã ' + d.ma + ' — ' + d.ra.slice(-300));
    bang(lotMay(Xd, d.ra + '\n' + d.nhatKy), [], '(d) INV-7');
    Xd.sim.thaoGo();
    // (b1) Google đã chạy xong → YC-45: mã 5 (khung .bat "GOOGLE DA TAO XONG … chon CHE DO 2"), KHÔNG in "KHÔNG TẠO ĐƯỢC"
    const caB1 = async (mod) => {
      const Xb = dungMay({});
      const truoc = fs.readFileSync(Xb.tep);
      Xb.sim.datLoi(HONG_2301);
      const b = await bamNut3(Xb, { mod: mod });
      Xb.sim.xoaLoi();
      return Object.assign(b, { X: Xb, cfgYNguyen: Buffer.compare(fs.readFileSync(Xb.tep), truoc) === 0 });
    };
    const b = await caB1();
    dung(b.ma === 5 && /ĐÃ chạy xong và tự kiểm đạt/.test(b.ra) && /CHẾ ĐỘ 2/.test(b.ra), '(b1) mã ' + b.ma + ' — ' + b.ra.slice(-300));
    dung(/GOOGLE ĐÃ TẠO XONG THÁNG 2026-10/.test(b.ra) && !/KHÔNG TẠO ĐƯỢC/.test(b.ra), '(b1) còn in "KHÔNG TẠO ĐƯỢC" hoặc thiếu tiêu đề đã tạo xong: ' + b.ra.slice(-300));
    dung(b.cfgYNguyen && /Mã thoát: 5/.test(b.nhatKy), '(b1) link_thang phải y nguyên, nhật ký ghi mã thoát 5');
    bang(lotMay(b.X, b.ra + '\n' + b.nhatKy), [], '(b1) INV-7');
    b.X.sim.thaoGo();
    const amB1 = await doiChungAm(async () => {
      const Sai = napBanSua('nut-3-thang-moi.js', [["      if (e && e.maKeodon === 'DA_CHAY_XONG') {", '      if (false) {']]);
      const y = await caB1(Sai);
      y.X.sim.thaoGo();
      return (y.ma !== 5 || /KHÔNG TẠO ĐƯỢC/.test(y.ra)) ? ['DA_CHAY_XONG thoát mã ' + y.ma + ', in "' + ((y.ra.match(/KHÔNG TẠO ĐƯỢC[^\n]*/) || [''])[0]) + '"'] : [];
    }, 'YC-45 giữ mã 4 cho DA_CHAY_XONG');
    return '(a) mã 6 · (d) Google cũ mã 6 · (b1) đã xong mã 5 · ' + await doiChungAm(async () => {
      const Sai = napBanSua('nut-3-thang-moi.js', [["      if (e && (e.maKeodon === 'GOOGLE_DANG_CHAY' || e.maKeodon === 'CHUA_RO_TIEN_DO')) {", '      if (false) {']]);
      const y = await caA(Sai);
      y.X.sim.thaoGo();
      return (y.ma !== 6 || /KHÔNG TẠO ĐƯỢC/.test(y.ra)) ? ['nút 3 thoát mã ' + y.ma + ', in "' + ((y.ra.match(/KHÔNG TẠO ĐƯỢC[^\n]*/) || [''])[0]) + '"'] : [];
    }, 'nút 3 không có nhánh mã 6') + '\n        · ' + amB1;
  });

  await test('T-CH-14', 'YC-46: tháng trên cờ (O2) quyết định, không so đồng hồ — (1) cờ tháng TRƯỚC ghi 10 phút trước → CO_CU_TRUOC_LUOT_NAY · (2) cờ ĐÚNG tháng ghi 20 phút trước → DA_CHAY_XONG (không báo oan) · (3) O2 rỗng → rơi về so giờ, câu nói rõ "ĐANG ĐOÁN THEO GIỜ" · (4) O2 đọc lỗi → rơi về so giờ, nêu chữ đang hiện', async () => {
    const GOC = 'Google chuyển hướng 2 nấc mà không về JSON (nấc cuối HTTP 302, không có địa chỉ Location).';
    const DD = ['POST→302 (có Location → ' + MAY_CHU_CH + ')', 'GET→302 (KHÔNG có Location)'];
    const bayGio = Date.UTC(2026, 9, 1, 2, 0);                   // 09:00 1/10/2026 giờ Việt Nam
    const nhan = (phutTruoc) => { const d = new Date(bayGio + 7 * 3600000 - phutTruoc * 60000).toISOString(); return 'DA_KHOI_TAO_' + d.slice(0, 10) + ' ' + d.slice(11, 16); };
    const co = (x) => Object.assign({ ok: true, hanhDong: 'coTaoThang', thang: '2026-10', dangChay: false, buocDaXong: 'B7' }, x);
    const tc = { batDauMs: bayGio, kyMoi: '2026-10' };
    const ca = [
      ['(1) cờ tháng trước, ghi 10 phút trước', co({ coKhoiTao: nhan(10), thangCo: '2026-09', thangCoTho: '2026-09' }), 'CO_CU_TRUOC_LUOT_NAY',
        [/cờ của THÁNG 2026-09 \(ô THANG O2 của khối cờ\), không phải tháng đang tạo 2026-10/, /bấm lại nút 3 CHẾ ĐỘ 1/], [/ĐOÁN THEO GIỜ/, /CHẾ ĐỘ 2 với đúng link/]],
      ['(2) cờ đúng tháng, ghi 20 phút trước', co({ coKhoiTao: nhan(20), thangCo: '2026-10', thangCoTho: '2026-10' }), 'DA_CHAY_XONG',
        [/cờ ghi đúng tháng đang tạo \(ô THANG O2 = 2026-10\)/, /CHẾ ĐỘ 2 với đúng link \[6\/7\]/], [/ĐOÁN THEO GIỜ/]],
      ['(3a) O2 rỗng, cờ 30 ngày trước', co({ coKhoiTao: nhan(30 * 1440), thangCo: '', thangCoTho: '' }), 'CO_CU_TRUOC_LUOT_NAY',
        [/ĐANG ĐOÁN THEO GIỜ ghi trên cờ vì ô THANG O2 rỗng hoặc Google chưa trả ô đó/], []],
      ['(3b) O2 rỗng, cờ vừa ghi', co({ coKhoiTao: nhan(1), thangCo: '', thangCoTho: '' }), 'DA_CHAY_XONG',
        [/ĐANG ĐOÁN THEO GIỜ ghi trên cờ vì ô THANG O2 rỗng/, /CHẾ ĐỘ 2/], []],
      ['(3c) Google cũ không trả thangCo', co({ coKhoiTao: nhan(30 * 1440) }), 'CO_CU_TRUOC_LUOT_NAY', [/ĐANG ĐOÁN THEO GIỜ/], []],
      ['(4) O2 đọc lỗi', co({ coKhoiTao: nhan(1), thangCo: '', thangCoTho: '#REF!' }), 'DA_CHAY_XONG',
        [/ĐANG ĐOÁN THEO GIỜ ghi trên cờ vì ô THANG O2 đang là "#REF!", không đọc ra tháng/], []],
      ['(4b) O2 trả chuỗi không phải tháng', co({ coKhoiTao: nhan(30 * 1440), thangCo: '2026-13', thangCoTho: '2026-13' }), 'CO_CU_TRUOC_LUOT_NAY', [/ĐANG ĐOÁN THEO GIỜ/], []]
    ];
    const cham = (G) => {
      const loi = [];
      ca.forEach(([ten, c, ma, co_, khong]) => {
        const k = G.ketLuanSauLoiDuongTruyen(GOC, c, null, DD, tc);
        if (k.ma !== ma) loi.push(ten + ': mã ' + k.ma + ' ≠ ' + ma);
        co_.forEach((rx) => { if (!rx.test(k.cau)) loi.push(ten + ': thiếu ' + rx); });
        khong.forEach((rx) => { if (rx.test(k.cau)) loi.push(ten + ': không được có ' + rx); });
        if (!/link_thang CHƯA được khai/.test(k.cau)) loi.push(ten + ': không nói link_thang CHƯA được khai');
      });
      return loi;
    };
    bang(cham(gw), [], 'bảng ' + ca.length + ' ca');
    const am = await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [["    const thangCo = /^\\d{4}-(0[1-9]|1[0-2])$/.test(String(co.thangCo || '').trim()) ? String(co.thangCo).trim() : '';", "    const thangCo = '';"]]);
      return cham(Sai).filter((x) => /^\((1|2)\)/.test(x));
    }, 'bỏ đọc O2 (quay về so đồng hồ 15 phút)');
    return ca.length + ' ca đúng mã + đúng câu · ' + am;
  });

  await test('T-CH-13', 'bat/3_TAO_FILE_THANG_MOI.bat: nhánh mã 6 in ba dòng "CHUA PHAI THAT BAI…", nằm trước nhánh lỗi không đoán trước; ASCII thuần, CRLF, không dấu `!`', async () => {
    const tep = path.join(__dirname, '..', 'bat', '3_TAO_FILE_THANG_MOI.bat');
    const cham = (b) => {
      const loi = [];
      for (let i = 0; i < b.length; i++) if (b[i] > 0x7f) { loi.push('byte 0x' + b[i].toString(16) + ' ở ' + i); break; }
      const s = b.toString('latin1');
      if ((s.match(/\n/g) || []).length !== (s.match(/\r\n/g) || []).length || !/\r\n$/.test(s)) loi.push('có dòng không kết thúc CRLF');
      if (s.indexOf('!') >= 0) loi.push('có dấu !');
      const i6 = s.indexOf(') else if "%MA%"=="6" (\r\n'), iLa = s.indexOf(') else (\r\n  echo ------------------------------------------------------------\r\n  echo   LOI KHONG DOAN TRUOC');
      if (i6 < 0) loi.push('không có nhánh "%MA%"=="6"');
      else {
        if (!(iLa > i6)) loi.push('nhánh 6 không nằm trước nhánh lỗi không đoán trước');
        const khoi = s.slice(i6, iLa);
        ['CHUA PHAI THAT BAI - Google co the van dang chay.', 'DUNG bam lai ngay: doi 5 phut roi bam lai file nay, chon che do 1.', 'link thang KHONG doi.']
          .forEach((d) => { if (khoi.indexOf('  echo   ' + d + '\r\n') < 0) loi.push('nhánh 6 thiếu dòng "' + d + '"'); });
      }
      return loi;
    };
    const b = fs.readFileSync(tep);
    bang(cham(b), [], 'bat/3_TAO_FILE_THANG_MOI.bat');
    return b.length + ' byte sạch · ' + await doiChungAm(async () => {
      const s = b.toString('latin1');
      const bo = s.replace(/\) else if "%MA%"=="6" \(\r\n(?: {2}echo[^\r\n]*\r\n)+/, '');
      if (bo === s) throw new Error('không cắm được bản bỏ nhánh 6 — sửa mốc');
      return cham(Buffer.from(bo, 'latin1'));
    }, 'bỏ nhánh mã 6');
  });

  RAC.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* thư mục tạm */ } });

  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  ' + h)); process.exit(1); }
})().catch((e) => { console.log('LỖI: ' + (e && e.stack)); process.exit(1); });
