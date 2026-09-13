/**
 * test-dong-run.js — YC-38.3: DÒNG TỔNG KẾT RUN. Chạy: `node node/test-dong-run.js`.
 *
 * Không gọi mạng: `node/gia-lap-web-app.js` cắt cầu `https` và chạy MÃ THẬT `src/ShellAppsScript.gs`.
 *
 * Canh bốn điều, mỗi điều kèm đối chứng âm:
 *   1. RUN id theo GIỜ VIỆT NAM và tên máy an toàn (`node/dong-run.js`).
 *   2. Dòng RUN đủ khuôn; lượt hỏng in `?` chứ không in 0.
 *   3. Web App ghi dòng RUN vào nhật ký Apps Script khi và chỉ khi RUN id hợp lệ, trả số dòng CÓ + băm Mapping,
 *      và không để lọt link/ID file tháng vào nhật ký.
 *   4. Thả lại đúng file → dòng RUN y hệt (khử trùng); băm Mapping đổi khi và chỉ khi nội dung Mapping đổi.
 * Mã bài `T-RUN-xx`.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const gl = require('./gia-lap-web-app');                // nạp TRƯỚC: cắt cầu mạng
const { chayLenGoogleSheet } = require('./chay-google-sheet');
const DR = require('./dong-run');

const lop = gl.napLoiMay();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });
const cfg = lop.Config.tao({});
const SRC = path.join(__dirname, '..', 'src');
const THANG = '2026-09';

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
/** `fn` dựng lại đúng MỘT khuyết tật, trả danh sách điều phép chấm bắt được; rỗng = phép chấm mù. */
async function doiChungAm(fn, moTa) {
  const ra = await fn();
  if (!Array.isArray(ra) || !ra.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa);
  return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + ra[0] + ') ← đúng như phải thế';
}
/** Mốc sửa nguồn: phải có đúng 1 chỗ, không thì dừng to. */
function mocNguon(file, moc) {
  const n = fs.readFileSync(file, 'utf8').split(moc).length - 1;
  if (n !== 1) throw new Error('mốc đối chứng âm cần 1 chỗ trong ' + path.basename(file) + ', tìm được ' + n + ': ' + moc.slice(0, 60));
}
/** Nạp một bản `dong-run.js` đã sửa nguồn (chỉ cho đối chứng âm). */
function napDongRunSua(moc, thay) {
  const f = path.join(__dirname, 'dong-run.js');
  mocNguon(f, moc);
  const m = new Module(f, module);
  m.filename = f;
  m.paths = Module._nodeModulePaths(__dirname);
  m._compile(fs.readFileSync(f, 'utf8').replace(moc, thay), f);
  return m.exports;
}
function suaGs(moc, thay) {
  mocNguon(path.join(SRC, 'ShellAppsScript.gs'), moc);
  return (s) => s.replace(moc, thay);
}

// ==================================================================== dựng bối cảnh

function dungSim(suaNguon) {
  const sim = gl.taoGiaLap({ ngay: '2026-09-08T03:00:00Z', suaNguon: suaNguon });
  const ss = sim.khaiThang(THANG);
  gl.dungSheetGianHang(ss, 'Shopee mall', []);
  gl.dungSheetDanhMuc(ss, lop.TestData.danhMucBang());
  gl.dungSheetMapping(ss, lop.TestData.mappingBang());
  gl.dungKhungThieu(ss);
  sim.ss = ss;
  return sim;
}

/** Dòng lớp 1 THẬT (qua AdapterFileXuat) — `n` đơn một dòng, tên hàng đã có CÓ trong Mapping mẫu. */
function cacFileMau(n) {
  const cacDon = [];
  for (let i = 1; i <= n; i++) {
    cacDon.push(lop.TestData.don({
      maDon: 'RUN2609' + ('00000' + i).slice(-5),
      dongs: [{ ten: 'Bột Ngũ Cốc 5 Loại Hạt Damtuh', phanLoai: '', sl: 1, gia: 100000 }]
    }));
  }
  const a = lop.AdapterFileXuat.doc(lop.TestData.bangNguon(cfg, cacDon),
    { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'Order.toship.run.xlsx' }, cfg);
  return [{ maGianHang: 'SP_MALL', tenFile: 'Order.toship.run.xlsx', dong: a.dong }];
}

/** Một lượt nút 4 trên đường Google, dựng dòng RUN bằng ĐÚNG hàm `chay-thu.js` dùng. */
async function motLuot(sim, gio, them) {
  const cacFile = cacFileMau(5);
  const thoiDiem = '2026-09-08T0' + gio + ':00:00Z';
  const runId = DR.taoRunId(thoiDiem, 'MAY-KHO-1');
  const kq = await chayLenGoogleSheet(Object.assign({
    lop, cfg, cacFile, thang: THANG, ngayGhi: '2026-09-08', thoiDiem, runId,
    cauHinhGoogle: sim.cauHinhMay(), in: () => { }
  }, them || {}));
  const run = { runId, file: cacFile.map((f) => f.tenFile), gian: ['Shopee mall'], donVao: 5, loi: 0 };
  return { kq, runId, dong: DR.dongRunTuKetQua(run, kq) };
}
const boId = (d) => d.replace(/^RUN \S+ /, 'RUN <id> ');
const dongRunLog = (sim) => sim.nhatKy.filter((x) => /^RUN /.test(x));

// ====================================================================================================

(async function chay() {
  console.log('=== YC-38.3: DÒNG TỔNG KẾT RUN ===\n');

  await test('T-RUN-01', 'RUN id = yyyyMMdd_HHmmss_<máy> theo GIỜ VIỆT NAM; tên máy chỉ còn A-Z a-z 0-9 -', async () => {
    // 17:30:05 UTC ngày 30/9 là 00:30:05 ngày 01/10 ở Việt Nam — đúng ca lệch tháng YC-40.4 nói tới.
    bang(DR.taoRunId('2026-09-30T17:30:05Z', 'PC Kho/1 '), '20261001_003005_PC-Kho-1');
    bang(DR.tenMay('máy kế toán'), 'm-y-k-to-n');
    bang(DR.tenMay('***'), 'MAY');
    dung(DR.tenMay('X'.repeat(90)).length === 40, 'tên máy cắt ở 40 ký tự');
    return doiChungAm(() => {
      const S = napDongRunSua('const LECH_GIO_VN_MS = 7 * 3600 * 1000;', 'const LECH_GIO_VN_MS = 0;');
      const id = S.taoRunId('2026-09-30T17:30:05Z', 'PC Kho/1 ');
      return id === '20261001_003005_PC-Kho-1' ? [] : ['giờ máy/UTC ra ' + id];
    }, 'bỏ lệch giờ Việt Nam');
  });

  await test('T-RUN-02', 'dòng RUN đủ 10 trường đúng khuôn; lượt hỏng in "?" (không in 0)', async () => {
    const d = DR.dongRun({
      runId: '20260908_100000_MAY-KHO-1', banDung: 'faa62d86f1e1', file: ['a.xlsx', 'b.xlsx', 'a.xlsx'],
      gian: ['Shopee mall', 'Offood'], donVao: 12, ghi: 10, boQua: 2, vang: 1, loi: 0, mappingCo: 317, mappingBam: '0a1b2c3d'
    });
    bang(d, 'RUN 20260908_100000_MAY-KHO-1 | bản dựng faa62d86f1e1 | file a.xlsx + b.xlsx | gian Shopee mall + Offood | ' +
      'đơn vào 12 | ghi 10 | bỏ qua 2 | vàng 1 | lỗi 0 | Mapping: 317 dòng CÓ, băm 0a1b2c3d');
    dung(DR.RE_DONG_RUN.test(d), 'mẫu grep phải khớp dòng đầy đủ');
    const hongDong = DR.dongRun({ runId: '20260908_100000_MAY-KHO-1', file: ['a.xlsx'], gian: ['Shopee mall'], donVao: 12, loi: 0 });
    dung(/\| ghi \? \| bỏ qua \? \| vàng \? \|/.test(hongDong), 'lượt hỏng phải in ?: ' + hongDong);
    dung(/Mapping: \? dòng CÓ, băm \?$/.test(hongDong), 'thiếu băm phải in ?: ' + hongDong);
    dung(!DR.RE_DONG_RUN.test(hongDong), 'dòng hỏng KHÔNG được khớp mẫu dòng đầy đủ — grep phải tách được');
    return doiChungAm(() => {
      const S = napDongRunSua("return (typeof x === 'number' && isFinite(x)) ? String(x) : '?';", "return String(Number(x) || 0);");
      const h = S.dongRun({ runId: '20260908_100000_MAY-KHO-1', file: ['a.xlsx'], gian: ['Shopee mall'], donVao: 12, loi: 0 });
      return /\| ghi \? \|/.test(h) ? [] : ['in ' + (h.match(/\| ghi \S+ \|/) || [''])[0]];
    }, 'số không chắc in thành 0');
  });

  await test('T-RUN-03', 'Web App: có RUN id hợp lệ → một dòng RUN trong nhật ký Apps Script, trả số dòng CÓ + băm 8 ký tự; ' +
    'RUN id lạ (chứa link) → không ghi, không lọt link/ID', async () => {
    const sim = dungSim();
    const l = await motLuot(sim, 3);
    dung(l.kq.thongKe.donGhi === 5, 'phải ghi 5 đơn: ' + JSON.stringify(l.kq.thongKe));
    const log = dongRunLog(sim);
    bang(log.length, 1, 'đúng một dòng RUN cho một lô');
    dung(log[0].indexOf('RUN ' + l.runId + ' | xuLy | lô 1/1 | bản dựng ') === 0, 'đầu dòng: ' + log[0]);
    const soCoThat = lop.TestData.mappingBang().slice(1).filter((h) => lop.MapListing.laCo(h[6])).length;
    bang(l.kq.mappingCo, soCoThat, 'số dòng CÓ phải đếm đúng bảng Mapping');
    dung(/^[0-9a-f]{8}$/.test(l.kq.mappingBam), 'băm 8 ký tự hex: ' + l.kq.mappingBam);
    dung(log[0].endsWith('Mapping: ' + soCoThat + ' dòng CÓ, băm ' + l.kq.mappingBam), 'cuối dòng log: ' + log[0]);
    dung(DR.RE_DONG_RUN.test(l.dong), 'dòng RUN trên máy đủ khuôn: ' + l.dong);
    dung(sim.nhatKy.join('\n').indexOf(sim.idCua(THANG)) < 0, 'nhật ký Apps Script không được chứa ID file tháng');

    // RUN id lạ: link file tháng nhét vào chỗ RUN id.
    const sim2 = dungSim();
    const RAC = 'https://docs.google.com/spreadsheets/d/' + sim2.idCua(THANG) + '/edit';
    const kq2 = await chayLenGoogleSheet({
      lop, cfg, cacFile: cacFileMau(2), thang: THANG, ngayGhi: '2026-09-08', thoiDiem: '2026-09-08T03:00:00Z',
      runId: RAC, cauHinhGoogle: sim2.cauHinhMay(), in: () => { }
    });
    dung(kq2.thongKe.donGhi === 2, 'RUN id lạ không được làm hỏng lượt ghi');
    bang(dongRunLog(sim2).length, 0, 'RUN id lạ → không dòng RUN');
    dung(sim2.nhatKy.join('\n').indexOf(sim2.idCua(THANG)) < 0, 'link/ID không được lọt vào nhật ký');
    return 'CÓ ' + l.kq.mappingCo + ' · băm ' + l.kq.mappingBam + ' · ' + await doiChungAm(async () => {
      const sim3 = dungSim(suaGs("return RE_RUN_ID.test(s) ? s : '';", 'return s;'));
      await chayLenGoogleSheet({
        lop, cfg, cacFile: cacFileMau(2), thang: THANG, ngayGhi: '2026-09-08', thoiDiem: '2026-09-08T03:00:00Z',
        runId: 'https://docs.google.com/spreadsheets/d/' + sim3.idCua(THANG) + '/edit', cauHinhGoogle: sim3.cauHinhMay(), in: () => { }
      });
      return sim3.nhatKy.join('\n').indexOf(sim3.idCua(THANG)) >= 0 ? ['ID file tháng lọt vào nhật ký'] : [];
    }, 'không kiểm mẫu RUN id');
  });

  await test('T-RUN-04', 'thả lại đúng file hai lần → dòng RUN y hệt (ghi 0, bỏ qua 5, cùng băm); ' +
    'sửa Mapping → băm đổi; ghi CÓ thêm một dòng → số CÓ +1', async () => {
    const sim = dungSim();
    const l1 = await motLuot(sim, 3);
    const l2 = await motLuot(sim, 4);
    const l3 = await motLuot(sim, 5);
    dung(/\| ghi 5 \| bỏ qua 0 \|/.test(l1.dong), 'lượt 1: ' + l1.dong);
    dung(/\| ghi 0 \| bỏ qua 5 \|/.test(l2.dong), 'lượt 2: ' + l2.dong);
    bang(boId(l3.dong), boId(l2.dong), 'thả lại lần nữa phải ra đúng dòng RUN cũ');
    dung(l2.runId !== l3.runId, 'RUN id mỗi lượt phải khác nhau');

    // Người dùng sửa tên viết tắt ở một dòng Mapping (không phải dòng đơn đang dùng).
    const shMap = sim.ss.getSheetByName('Mapping_san_pham');
    const rA2 = Object.keys(shMap.giaTri).filter((k) => shMap.giaTri[k] === 'A2' && k.split(':')[1] === '4')[0];
    dung(rA2, 'fixture phải có dòng tên viết tắt "A2"');
    shMap.giaTri[rA2] = 'A2 moi';
    const l4 = await motLuot(sim, 6);
    dung(l4.kq.mappingBam !== l3.kq.mappingBam, 'sửa Mapping mà băm không đổi');
    bang(l4.kq.mappingCo, l3.kq.mappingCo, 'sửa tên viết tắt không đổi số CÓ');

    // Ghi CÓ vào một dòng chưa CÓ.
    const cXN = 7;
    const rChua = [];
    for (let r = 2; r <= shMap.getLastRow(); r++) {
      if (shMap.giaTri[r + ':2'] && !lop.MapListing.laCo(shMap.giaTri[r + ':' + cXN])) rChua.push(r);
    }
    dung(rChua.length, 'fixture phải có dòng chưa CÓ');
    shMap.giaTri[rChua[0] + ':' + cXN] = 'CÓ';
    const l5 = await motLuot(sim, 7);
    bang(l5.kq.mappingCo, l4.kq.mappingCo + 1, 'ghi CÓ thêm một dòng');
    dung(l5.kq.mappingBam !== l4.kq.mappingBam, 'đổi ô Xác nhận phải đổi băm');

    return 'CÓ ' + l3.kq.mappingCo + '→' + l5.kq.mappingCo + ' · băm ' + l3.kq.mappingBam + '→' + l4.kq.mappingBam + '→' +
      l5.kq.mappingBam + ' · ' + await doiChungAm(async () => {
      const s2 = dungSim(suaGs("bam256_(ten.join('\\u001f') + '\\n' + dong.join('\\n'))", "bam256_(ten.join('\\u001f'))"));
      const a = await motLuot(s2, 3);
      const m2 = s2.ss.getSheetByName('Mapping_san_pham');
      const k = Object.keys(m2.giaTri).filter((x) => m2.giaTri[x] === 'A2' && x.split(':')[1] === '4')[0];
      m2.giaTri[k] = 'A2 moi';
      const b = await motLuot(s2, 4);
      return a.kq.mappingBam === b.kq.mappingBam ? ['sửa Mapping mà băm y nguyên'] : [];
    }, 'băm không phủ nội dung Mapping');
  });

  await test('T-RUN-05', 'đường lùi "ghi" cũng mang RUN id, ghi dòng RUN và trả số CÓ + băm', async () => {
    const sim = dungSim();
    const l = await motLuot(sim, 3, { cauHinhGoogle: sim.cauHinhMay({ duong: 'ghi' }) });
    dung(l.kq.duong === 'ghi' && l.kq.thongKe.donGhi === 5, 'đường ghi phải chạy: ' + JSON.stringify(l.kq.thongKe));
    const log = dongRunLog(sim);
    bang(log.length, 1);
    dung(log[0].indexOf('RUN ' + l.runId + ' | ghi | lô 1/1 |') === 0, log[0]);
    dung(DR.RE_DONG_RUN.test(l.dong), l.dong);
    return doiChungAm(async () => {
      const s2 = dungSim(suaGs("    ghiDongRun_(body, 'ghi', ss.getName(), tk, ttMapG);\n", ''));
      await motLuot(s2, 3, { cauHinhGoogle: s2.cauHinhMay({ duong: 'ghi' }) });
      return dongRunLog(s2).length ? [] : ['không có dòng RUN'];
    }, 'gỡ lời gọi ghiDongRun_ ở hành động ghi');
  });

  await test('T-RUN-06', 'nút 4 (`chay-thu.js`) nối đúng dây: sinh RUN id, gửi kèm, in + ghi LOG dòng RUN cả lượt xong lẫn lượt hỏng', async () => {
    // Đường Google của `chay-thu.js` cần Web App thật nên không chạy được trong tiến trình con; soát dây nối ở
    // mã nguồn, còn nội dung dòng thì T-RUN-03/04/05 đã chấm qua CHÍNH hàm `dongRunTuKetQua` nó dùng.
    const s = fs.readFileSync(path.join(__dirname, 'chay-thu.js'), 'utf8');
    const i = s.indexOf('async function chayVanHanhGoogle');
    const j = s.indexOf('// ---------------------------------------------------------------- điểm vào');
    const than = s.slice(i, j);
    const CAN = [
      'const runId = taoRunId(thoiDiem, tenMay());',
      'lop, cfg, cacFile, thang, ngayGhi, thoiDiem, runId,',
      'const dongRunXong = dongRunTuKetQua(run, kq);',
      "console.log('\\n' + dongRunXong);",
      '[dongRunXong, \'\'].concat(d)',
      "const dongRunLoi = run.file.length ? dongRun(run) : '';",
      'dongRunLoi ? [dongRunLoi] : []'
    ];
    const thieu = (t) => CAN.filter((x) => t.indexOf(x) < 0);
    bang(thieu(than), [], 'chayVanHanhGoogle thiếu dây nối');
    return doiChungAm(() => thieu(than.replace("console.log('\\n' + dongRunXong);", '')), 'bỏ dòng in RUN');
  });

  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  ' + h)); process.exit(1); }
})();
