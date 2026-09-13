/**
 * test-gian-hang.js — D-04 / YC-36: FILE THẢ NHẦM THƯ MỤC GIAN HÀNG. Chạy: `node node/test-gian-hang.js`.
 *
 * Không cần mạng, không đụng Google. Chạy trên 12 file xuất THẬT của bốn gian, tháng 6–7–8.
 *
 * ------------------------------------------------------------------------------ VÌ SAO BỘ NÀY TỒN TẠI
 * Đêm 07/9/2026: một file xuất của Tmart (gian `Shopee mall`) bị thả vào thư mục Importmart. Tool không
 * có cách nào biết đơn thuộc gian nào — file xuất Shopee KHÔNG có cột nào cho biết shop, nên thứ duy nhất
 * nói lên gian hàng là TÊN THƯ MỤC. Nó ghi ngoan ngoãn: 432 đơn chui vào sheet `Importmart`, 12 đơn vào
 * `Babyiu`, sheet `Shopee mall` trống. Tệ hơn nữa, cấu hình `tiep_tuc_tu_ket_qua_moi_nhat` lấy chính file
 * bẩn đó làm đầu vào lần sau, nên cái sai tự nhân lên.
 *
 * Dấu hiệu gián tiếp DUY NHẤT còn lại: sheet `Mapping_san_pham` đã ghi mỗi tên listing thuộc gian nào.
 *
 * ------------------------------------------------------------------------------ BỘ NÀY KHÁC N-16 CHỖ NÀO
 * `N-16` trong `test-node.js` đã canh đường EXCEL: chạy thật `chay-thu.js` bằng `cmd.exe`, đo trên đĩa.
 * Nhưng từ bản 2.4.0 đường chạy HẰNG NGÀY là `xuLy` — lớp 2 chạy trên Google, và bảng Mapping thật nằm
 * trên Google. Phép kiểm cũ ở `chay-thu.js` chỉ đối chiếu được khi cấu hình khai `file_mapping_mau`, mà
 * cấu hình thật KHÔNG khai, nên đường chạy hằng ngày thực tế không được canh giờ nào.
 *
 * Bộ này canh hai thứ N-16 không với tới:
 *   1. LUẬT (`MapListing.soatThaNhamGian`) đo trên 12 file thật — cả chiều chặn lẫn chiều không báo oan.
 *   2. Vỏ Google (`ShellAppsScript.hanhDongXuLy_`) thật sự gọi luật đó và từ chối TRƯỚC khi ghi ô nào.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { napLoi } = require('./nap-loi');
const gl = require('./gia-lap-web-app');

const DAU_VAO = path.join(__dirname, '..', '..', '..', '00_DAU_VAO');
const FILE_MAPPING = path.join(DAU_VAO, 'DEMO_Mapping_san_pham.xlsx');

/**
 * 12 file xuất thật, tháng 6–7–8 của bốn gian.
 * `Tmart` là tên thương mại của gian `Shopee mall` (chủ dự án xác nhận 13/9, câu Q-6) — đây chính là gian
 * bị thả nhầm đêm 07/9, nên nó vừa là ca "thả đúng" vừa là nguyên liệu dựng lại vụ đó.
 */
const FILE_THAT = [
  ['SP_MALL', 'Tmart_tháng 6.xlsx'], ['SP_MALL', 'Tmart_tháng 7.xlsx'], ['SP_MALL', 'Tmart_tháng 8.xlsx'],
  ['SP_OFFOOD', 'offood_Tháng 6.xlsx'], ['SP_OFFOOD', 'offood_tháng 7.xlsx'], ['SP_OFFOOD', 'offood_tháng 8.xlsx'],
  ['SP_IMPORT', 'importmart_tháng 6.xlsx'], ['SP_IMPORT', 'Importmart_tháng 7.xlsx'], ['SP_IMPORT', 'importmart_tháng 8.xlsx'],
  ['SP_BABYIU', 'Babiu_tháng 6.xlsx'], ['SP_BABYIU', 'Babiu_tháng 7.xlsx'], ['SP_BABYIU', 'Babiu_tháng 8.xlsx']
];

/**
 * Danh mục tối thiểu cho giả lập, đúng hình dạng `cfg.danhMuc`: tiêu đề dòng 2, dữ liệu từ dòng 3,
 * tên viết tắt cột D, tồn cột H. Sai hình dạng thì lõi báo "không đọc được dòng danh mục nào" và bài
 * test hỏng vì fixture chứ không phải vì mã.
 */
const BANG_TON = [
  [],
  ['', '', 'Tên sản phẩm', 'Tên viết tắt', 'Mã hàng', 'Đơn vị', '', 'Tổng tồn'],
  ['', '', 'Hàng mẫu', 'dt5', 'MH001', 'cái', '', 9999]
];

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
function test(ma, ten, fn) {
  return Promise.resolve().then(fn).then(
    (t) => { soDat++; console.log('ĐẠT   ' + ma + ' ' + ten); if (t) console.log('        · ' + t); },
    (e) => { soHong++; hong.push(ma + ' ' + ten + ' -> ' + e.message); console.log('HỎNG  ' + ma + ' ' + ten + '\n   -> ' + e.message); }
  );
}
function bang(thuc, mong, vi) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((vi ? vi + ': ' : '') + 'được ' + a + ', cần ' + b);
}
function dung(dk, vi) { if (!dk) throw new Error(vi || 'điều kiện sai'); }

// ==================================================================== đọc dữ liệu thật

async function docBang(file, tenSheet) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = (tenSheet && wb.getWorksheet(tenSheet)) || wb.worksheets[0];
  if (!ws) throw new Error('File ' + path.basename(file) + ' không có sheet "' + tenSheet + '"');
  const ra = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const h = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      let v = cell.value;
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        if (v.formula != null || v.sharedFormula != null) v = v.result == null ? '' : v.result;
        else if (v.richText) v = v.richText.map((t) => t.text).join('');
        else if (v.text != null) v = String(v.text);
        else v = '';
      }
      h[c - 1] = v == null ? '' : v;
    });
    ra[r - 1] = h;
  });
  for (let i = 0; i < ra.length; i++) if (!ra[i]) ra[i] = [];
  return ra;
}

(async function chay() {
  console.log('=== D-04 / YC-36: KIỂM CHÉO GIAN HÀNG THEO NỘI DUNG FILE ===\n');

  for (const t of [FILE_MAPPING].concat(FILE_THAT.map(([, f]) => path.join(DAU_VAO, f)))) {
    if (!fs.existsSync(t)) { console.log('HỎNG  thiếu file dữ liệu thật: ' + t); process.exit(1); }
  }

  const lop = napLoi();
  const cfg = lop.Config.tao();
  global.DanhMuc = lop.DanhMuc;
  global.MapListing = lop.MapListing;
  global.Normalize = lop.Normalize;

  const bangMap = await docBang(FILE_MAPPING, 'Mapping sản phẩm');

  // Đọc cả 12 file qua LỚP 1 một lần, dùng lại cho mọi bài phía dưới.
  const doc = [];
  for (const [ma, ten] of FILE_THAT) {
    const bang2 = await docBang(path.join(DAU_VAO, ten), 'orders');
    const a = lop.AdapterFileXuat.doc(bang2, { san: 'SHOPEE', maGianHang: ma, tenFile: ten }, cfg);
    doc.push({ maGianHang: ma, tenFile: ten, tenListing: a.dong.map((d) => d.tenListing) });
  }
  console.log('DỮ LIỆU VÀO (thật)');
  console.log('  Mapping DEMO     : ' + (bangMap.length - 1) + ' dòng');
  console.log('  file xuất        : ' + doc.length + ' file, ' +
    doc.reduce((t, x) => t + x.tenListing.length, 0) + ' dòng hàng, 4 gian, tháng 6–7–8\n');

  // ================================================================ 1. LUẬT

  await test('T-GH-01', 'Chỉ mục "tên listing → gian" dựng được từ Mapping thật, dùng MỌI dòng không cần CÓ', () => {
    const idx = lop.MapListing.chiMucGianTheoListing(bangMap, cfg);
    dung(idx, 'phải dựng được chỉ mục từ Mapping thật');
    const soTen = Object.keys(idx).length;
    // Không đặt một con số tuỳ tiện ("phải có ≥ N tên"): con số đó vô nghĩa, và sẽ hỏng mỗi lần chủ shop
    // sửa Mapping. Tính chất THẬT SỰ cần là: mỗi file thật phải khớp được ít nhất `D04_TOI_THIEU` tên,
    // nếu không phép kiểm sẽ im lặng trên chính dữ liệu nó sinh ra để canh.
    const mong = lop.MapListing.D04_TOI_THIEU;
    const khopCua = doc.map((x) => {
      const daXet = {};
      let khop = 0;
      x.tenListing.forEach((t) => {
        const k = lop.Utils.chuanHoaChuoi(t);
        if (!k || daXet[k] || !idx[k]) return;
        daXet[k] = 1; khop++;
      });
      return { tenFile: x.tenFile, khop: khop };
    });
    const yeu = khopCua.filter((x) => x.khop < mong);
    // Không đòi 12/12: `importmart_tháng 6.xlsx` chỉ có 4 tên hàng khớp được vì gian Importmart còn ít
    // dòng trong Mapping. Luật CỐ Ý im lặng ở ngưỡng đó (thà bỏ sót còn hơn chặn oan), nên đòi 12/12 là
    // đòi mã làm trái luật của chính nó. Cái phải canh là con số đó không ÂM THẦM tụt: 11/12 là mức
    // hiện tại, tụt xuống nữa thì phép kiểm mỏng dần mà không ai biết.
    dung(yeu.length <= 1, 'có ' + yeu.length + ' file khớp dưới ' + mong + ' tên — phép kiểm đang mỏng đi: ' +
      yeu.map((x) => x.tenFile + '(' + x.khop + ')').join(', '));
    const gian = {};
    Object.keys(idx).forEach((t) => { gian[idx[t]] = (gian[idx[t]] || 0) + 1; });
    dung(Object.keys(gian).length >= 2, 'chỉ mục phải có từ hai gian trở lên, nhận: ' + JSON.stringify(gian));

    // Mapping không khai gian hàng → trả null, và vỏ sẽ BỎ QUA chứ không đoán bừa.
    bang(lop.MapListing.chiMucGianTheoListing([['Tên trên Shopee', 'Tên viết tắt'], ['abc', 'x']], cfg), null,
      'thiếu cột "Gian hàng" thì phải trả null');
    bang(lop.MapListing.chiMucGianTheoListing(null, cfg), null, 'không có bảng thì phải trả null');
    return soTen + ' tên hàng chỉ đích danh một gian · phân bố ' + JSON.stringify(gian) +
      '\n        · số tên khớp được của từng file: ' +
      khopCua.map((x) => x.tenFile.replace('.xlsx', '') + '=' + x.khop).join(', ') +
      (yeu.length ? '\n        · DƯỚI NGƯỠNG (phép kiểm im lặng, đã báo BA): ' +
        yeu.map((x) => x.tenFile).join(', ') : '');
  });

  await test('T-GH-02', '12/12 file THẢ ĐÚNG CHỖ → 0 báo nhầm (chặn oan một lần là người ta tắt phép kiểm)', () => {
    const kq = lop.MapListing.soatThaNhamGian(doc, bangMap, cfg);
    bang(kq.chan.length, 0, 'chặn oan file thả đúng chỗ: ' +
      kq.chan.map((x) => x.tenFile + ' → ' + x.gianThat).join(', '));
    return '12/12 file qua sạch · ' + kq.canhBao.length + ' câu cảnh báo (không chặn): ' +
      (kq.canhBao.length ? kq.canhBao[0].slice(0, 110) : 'không có');
  });

  await test('T-GH-03', 'DỰNG LẠI VỤ 07/9: file Tmart thả vào Importmart → phải DỪNG, đúng nguyên văn câu YC-36', () => {
    // Đây là đối chứng dương lấy thẳng từ sự cố thật, không phải ca bịa.
    const tmart = doc.filter((x) => x.maGianHang === 'SP_MALL');
    const nham = tmart.map((x) => Object.assign({}, x, { maGianHang: 'SP_IMPORT' }));
    const kq = lop.MapListing.soatThaNhamGian(nham, bangMap, cfg);
    bang(kq.chan.length, tmart.length, 'cả ' + tmart.length + ' file Tmart thả nhầm đều phải bị chặn');
    kq.chan.forEach((x) => {
      bang(x.gianThat, 'SP_MALL', 'phải chỉ đúng gian thật của file ' + x.tenFile);
      bang(x.gianThuMuc, 'SP_IMPORT', 'phải nêu đúng thư mục đang thả');
      bang(x.cau, 'FILE NÀY GIỐNG GIAN Shopee mall, ĐANG THẢ VÀO Importmart — tool không ghi. ' +
        'Kéo file sang đúng thư mục rồi bấm lại.', 'nguyên văn câu D-04 của YC-36');
      dung(x.soKhac / x.khop >= 0.8, 'tỷ lệ khớp gian kia phải ≥ 80%, nhận ' + x.soKhac + '/' + x.khop);
      dung(x.soMinh / x.khop < 0.2, 'tỷ lệ khớp gian đang thả phải < 20%, nhận ' + x.soMinh + '/' + x.khop);
    });
    return kq.chan.map((x) => x.tenFile + ': ' + x.soKhac + '/' + x.khop + ' thuộc Shopee mall, ' +
      x.soMinh + '/' + x.khop + ' thuộc Importmart').join('\n        · ');
  });

  await test('T-GH-04', 'Mọi cặp gian thả nhầm đều bị bắt, không riêng cặp của vụ 07/9', () => {
    const MA = ['SP_MALL', 'SP_OFFOOD', 'SP_IMPORT', 'SP_BABYIU'];
    const bat = [], sot = [];
    for (const x of doc) {
      for (const g of MA) {
        if (g === x.maGianHang) continue;
        const kq = lop.MapListing.soatThaNhamGian([Object.assign({}, x, { maGianHang: g })], bangMap, cfg);
        (kq.chan.length ? bat : sot).push(x.tenFile + ' → ' + g);
      }
    }
    // Không đòi 100%: gian ít hàng trong Mapping thì không đủ dữ liệu để kết luận, và luật cố ý im lặng
    // trong ca đó. Đòi hỏi thật sự là ĐA SỐ bị bắt, và không ca nào ở trên bị chặn oan (T-GH-02).
    const tyLe = bat.length / (bat.length + sot.length);
    dung(tyLe >= 0.5, 'chỉ bắt được ' + bat.length + '/' + (bat.length + sot.length) + ' cặp thả nhầm — quá thấp');
    return 'bắt ' + bat.length + '/' + (bat.length + sot.length) + ' cặp thả nhầm (' +
      (tyLe * 100).toFixed(0) + '%) · bỏ sót (không đủ dữ liệu, cố ý im lặng): ' +
      (sot.length ? sot.slice(0, 3).join(', ') + (sot.length > 3 ? ' …' : '') : 'không có');
  });

  await test('T-GH-05', 'ĐỐI CHỨNG ÂM: hai gian bán chung hàng → KHÔNG chặn (điều kiện < 20% cứu ca này)', () => {
    // Nếu chỉ có điều kiện "≥ 80% thuộc gian khác" thì hai gian bán chung 30 mã sẽ chặn lẫn nhau. Điều
    // kiện thứ hai — gian đang thả phải khớp DƯỚI 20% — là thứ phân biệt "thả nhầm" với "bán chung".
    const idx = lop.MapListing.chiMucGianTheoListing(bangMap, cfg);
    const cuaMall = Object.keys(idx).filter((t) => idx[t] === 'SP_MALL');
    const cuaKhac = Object.keys(idx).filter((t) => idx[t] !== 'SP_MALL');
    dung(cuaMall.length >= 10 && cuaKhac.length >= 10, 'Mapping thật không đủ dữ liệu dựng ca này');

    // File nửa nọ nửa kia: 10 tên của gian đang thả + 10 tên của gian khác.
    const gianKhac = idx[cuaKhac[0]];
    const chung = {
      maGianHang: 'SP_MALL', tenFile: 'ban_chung.xlsx',
      tenListing: cuaMall.slice(0, 10).concat(cuaKhac.filter((t) => idx[t] === gianKhac).slice(0, 10))
    };
    const kq = lop.MapListing.soatThaNhamGian([chung], bangMap, cfg);
    bang(kq.chan.length, 0, 'file có nửa hàng của chính gian mình KHÔNG được chặn');

    // Và chiều ngược lại, để chứng minh phép chấm có mắt: bỏ hết phần của gian mình đi thì PHẢI chặn.
    const toanKhac = Object.assign({}, chung, { tenListing: chung.tenListing.slice(10) });
    const kq2 = lop.MapListing.soatThaNhamGian([toanKhac], bangMap, cfg);
    bang(kq2.chan.length, 1, 'bỏ hết hàng của gian mình rồi thì PHẢI chặn — nếu không, phép chấm mù');
    return 'nửa nọ nửa kia: không chặn · toàn hàng gian khác: chặn — đúng cả hai chiều';
  });

  await test('T-GH-06', 'ĐỐI CHỨNG ÂM: dưới ngưỡng tối thiểu → chỉ CẢNH BÁO, vẫn ghi', () => {
    const idx = lop.MapListing.chiMucGianTheoListing(bangMap, cfg);
    const cuaMall = Object.keys(idx).filter((t) => idx[t] === 'SP_MALL').slice(0, 3);
    dung(cuaMall.length === 3, 'cần 3 tên hàng của Shopee mall để dựng ca này');
    const it = { maGianHang: 'SP_BABYIU', tenFile: 'it_dong.xlsx', tenListing: cuaMall };
    const kq = lop.MapListing.soatThaNhamGian([it], bangMap, cfg);
    bang(kq.chan.length, 0, 'chỉ 3 tên khớp (dưới ngưỡng ' + lop.MapListing.D04_TOI_THIEU + ') thì KHÔNG được chặn');
    bang(kq.canhBao.length, 1, 'nhưng PHẢI nói một câu, không được im lặng hoàn toàn');
    dung(/VẪN GHI/.test(kq.canhBao[0]), 'câu cảnh báo phải nói rõ tool vẫn ghi: ' + kq.canhBao[0]);

    // Đủ ngưỡng thì cùng thế cờ đó phải chuyển thành CHẶN — chứng minh ngưỡng là thứ quyết định.
    const du = { maGianHang: 'SP_BABYIU', tenFile: 'du_dong.xlsx',
      tenListing: Object.keys(idx).filter((t) => idx[t] === 'SP_MALL').slice(0, 12) };
    bang(lop.MapListing.soatThaNhamGian([du], bangMap, cfg).chan.length, 1,
      'đủ ngưỡng thì cùng thế cờ phải chuyển thành CHẶN');
    return '3 tên → cảnh báo, vẫn ghi · 12 tên → chặn';
  });

  await test('T-GH-07', 'Mapping chưa khai gian hàng nào → im lặng, KHÔNG đoán bừa', () => {
    const khongGian = bangMap.map((h, r) => {
      if (r > 0) return h;
      return h.map((c) => (lop.MapListing.tenCotChuan(c) === 'Gian hàng' ? 'Cột gì đó' : c));
    });
    const kq = lop.MapListing.soatThaNhamGian(doc, khongGian, cfg);
    bang(kq.chan.length, 0, 'không có cột Gian hàng thì không được chặn ai');
    bang(kq.canhBao.length, 0, 'và cũng không kêu ca gì');
    return 'bỏ cột "Gian hàng" → 0 chặn, 0 cảnh báo';
  });

  // ================================================================ 2. VỎ GOOGLE THẬT SỰ GỌI LUẬT

  await test('T-GH-08', 'Vỏ Google: gói xuLy có file thả nhầm → SAI_GIAN_HANG, KHÔNG ghi một ô nào', async () => {
    // Bài quan trọng nhất của bộ này. Luật đúng mà vỏ không gọi thì đường chạy hằng ngày vẫn hở — đó
    // chính là tình trạng trước 13/9: `chay-thu.js` có luật, nhưng trên đường Google nó không chạy.
    const sim = gl.taoGiaLap({ ngay: '2026-09-08T03:00:00Z' });
    const ss = sim.khaiThang('2026-09', 'THÁNG-9-2026-KINH-DOANH');
    gl.dungSheetGianHang(ss, 'Importmart', []);
    gl.dungSheetDanhMuc(ss, BANG_TON);
    gl.dungSheetMapping(ss, bangMap);

    const tmart = doc.find((x) => x.maGianHang === 'SP_MALL' && /tháng 8/.test(x.tenFile));
    const bang8 = await docBang(path.join(DAU_VAO, tmart.tenFile), 'orders');
    const a = lop.AdapterFileXuat.doc(bang8,
      { san: 'SHOPEE', maGianHang: 'SP_IMPORT', tenFile: tmart.tenFile }, cfg);   // ← thả nhầm

    const truoc = JSON.stringify(sim.anhChup('2026-09'));
    const kq = JSON.parse(sim.vo.doPost({
      postData: {
        contents: JSON.stringify({
          token: sim.biMat, hanhDong: 'xuLy', phienBanMongDoi: sim.vo.PHIEN_BAN,
          thang: '2026-09', spreadsheetId: sim.idCua('2026-09'),
          cacFile: [{ maGianHang: 'SP_IMPORT', tenFile: tmart.tenFile, dong: a.dong.slice(0, 120) }]
        })
      }
    }).getContent());
    const sau = JSON.stringify(sim.anhChup('2026-09'));
    const daGhi = sim.nhatKyGhi.length;
    sim.thaoGo();

    bang(kq.ok, false, 'phải từ chối: ' + JSON.stringify(kq).slice(0, 200));
    bang(kq.loi, 'SAI_GIAN_HANG', 'mã lỗi riêng, không lẫn với lỗi quyền hay lỗi tháng');
    dung(/FILE NÀY GIỐNG GIAN Shopee mall, ĐANG THẢ VÀO Importmart — tool không ghi\./.test(kq.thongBao),
      'phải in nguyên văn câu YC-36: ' + kq.thongBao);
    bang(sau, truoc, 'file tháng phải y nguyên từng ô');
    bang(daGhi, 0, 'không được có MỘT lệnh ghi nào (kể cả nối dòng Mapping)');
    return 'từ chối SAI_GIAN_HANG · 0 lệnh chạm sheet · file tháng y nguyên';
  });

  await test('T-GH-09', 'Vỏ Google: cùng gói đó thả ĐÚNG gian → ghi bình thường (đối chứng âm của T-GH-08)', async () => {
    // Không có bài này thì T-GH-08 chỉ chứng minh "có cái gì đó chặn", chưa chứng minh cái chặn đó là
    // phép kiểm gian hàng chứ không phải một lỗi khác tình cờ cũng dừng lượt chạy.
    const sim = gl.taoGiaLap({ ngay: '2026-09-08T03:00:00Z' });
    const ss = sim.khaiThang('2026-09', 'THÁNG-9-2026-KINH-DOANH');
    gl.dungSheetGianHang(ss, 'Shopee mall', []);
    gl.dungSheetDanhMuc(ss, BANG_TON);
    gl.dungSheetMapping(ss, bangMap);

    const tmart = doc.find((x) => x.maGianHang === 'SP_MALL' && /tháng 8/.test(x.tenFile));
    const bang8 = await docBang(path.join(DAU_VAO, tmart.tenFile), 'orders');
    const a = lop.AdapterFileXuat.doc(bang8,
      { san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: tmart.tenFile }, cfg);     // ← đúng gian

    const kq = JSON.parse(sim.vo.doPost({
      postData: {
        contents: JSON.stringify({
          token: sim.biMat, hanhDong: 'xuLy', phienBanMongDoi: sim.vo.PHIEN_BAN,
          thang: '2026-09', spreadsheetId: sim.idCua('2026-09'),
          cacFile: [{ maGianHang: 'SP_MALL', tenFile: tmart.tenFile, dong: a.dong.slice(0, 120) }]
        })
      }
    }).getContent());
    sim.thaoGo();
    dung(kq.ok, 'thả đúng gian phải ghi được: ' + JSON.stringify(kq).slice(0, 220));
    dung(kq.thongKe.donGhi > 0, 'phải ghi được ít nhất một đơn, nhận ' + JSON.stringify(kq.thongKe));
    dung(!/GIỐNG GIAN/.test(JSON.stringify(kq.canhBao || [])), 'không được kêu oan: ' + JSON.stringify(kq.canhBao));
    return 'ghi ' + kq.thongKe.donGhi + ' đơn · 0 câu báo nhầm gian';
  });

  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  HỎNG: ' + h)); process.exit(1); }
})().catch((e) => { console.error('\nBỘ TEST TỰ NÓ HỎNG: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
