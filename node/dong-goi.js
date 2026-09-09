/**
 * ĐÓNG GÓI `Tool_nhập_liệu` — bản giao cho máy nhân viên.
 *
 *   node node/dong-goi.js                      → dựng gói vào out/Tool_nhập_liệu rồi tự kiểm
 *   node node/dong-goi.js --ra <thư mục>       → dựng vào chỗ khác
 *   node node/dong-goi.js --node-portable <d>  → kèm bản Node xách tay ở đường dẫn đó
 *   node node/dong-goi.js --kiem <thư mục>     → CHỈ kiểm một gói đã có, không dựng lại
 *
 * VÌ SAO GÓI KHÔNG CHỨA `src/` VÀ `node/` (09_GIAO_VIEC_DEV_DONG_GOI.md mục 1).
 * Không phải để gói nhẹ. Trước đây mã tới máy nhân viên bằng HAI đường — chép tay lúc
 * cài, và tải về lúc cập nhật — nên sẽ có ngày máy này bản cũ, máy kia bản mới, mà
 * không ai biết. Bỏ đường chép tay đi thì chỉ còn một đường, và không thể lệch nữa.
 *
 * PHÉP TỰ KIỂM (mục 4.3) chạy ngay sau khi dựng và có quyền phủ quyết: gói dính một
 * thứ trong danh sách cấm là thoát mã khác 0, gói coi như hỏng. Lý do phải tự động:
 * gói này rời khỏi máy chủ dự án, mà thư mục nguồn thì lẫn lộn số liệu thật của shop.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const GOC_DU_AN = path.resolve(__dirname, '..', '..', '..');
const NGUON = path.join(GOC_DU_AN, '03_VAN_HANH');
const TEN_GOI = 'Tool_nhập_liệu'.normalize('NFC');
const TEN_CAU_HINH = 'Cấu hình'.normalize('NFC');
const TEN_NHAT_KY = 'nhật ký'.normalize('NFC');
const TEN_THA = '1_THA_FILE_XUAT';

const BON_NUT = [
  '1_CAI_DAT_LAN_DAU.bat',
  '2_CAP_NHAT.bat',
  '3_TAO_FILE_THANG_MOI.bat',
  '4_CHAY_TOOL.bat'
];

/** Khóa chỉ dùng ở chế độ Excel — bỏ khỏi bản đóng gói (07_v2.6 mục 1). */
const KHOA_CHI_CHO_EXCEL = [
  'file_tracking', 'thang', 'tiep_tuc_tu_ket_qua_moi_nhat',
  'file_mapping_mau', 'thu_muc_file_tracking', 'thu_muc_ket_qua'
];

/** Hai dòng bí mật: gói giao đi phải để RỖNG, từng máy tự điền. */
const HAI_DONG_BI_MAT = ['web_app_url', 'chuoi_bi_mat'];

const DUOI_CAM = ['.xlsx', '.xls', '.csv', '.docx', '.md', '.log'];
const TEN_CAM = ['moc-nghiem-thu.json', '.clasp.json'];
const THU_MUC_CAM = ['src', 'node', 'node_modules', '.git'];

/**
 * MIỄN TRỪ HẸP CHO CÂY `Cấu hình/node-portable/`.
 *
 * Bản Node.js chính thức vi phạm hai luật ở trên mà không có cách nào tránh: `node_modules\npm\docs\`
 * có **198 file `.md`**, và bố cục npm **bắt buộc** có `node_modules\npm\`. Chạy `--node-portable`
 * mà không miễn trừ thì `kiemGoi()` báo hàng trăm lỗi rồi phủ quyết chính bản Node vừa đặt vào.
 *
 * ĐÂY KHÔNG PHẢI LÝ DO ĐỂ NỚI LUẬT. Hai luật đó đang canh đúng thứ cần canh — dữ liệu thật của
 * shop lọt vào gói. Tài liệu của npm không phải thứ đó. Nên miễn trừ **chỉ hai luật đó, chỉ trong
 * đúng cây này**, và bù lại bằng một hàng rào khác: DANH SÁCH TRẮNG ở lớp ngoài cùng của cây.
 * Thừa một thứ ở lớp ngoài là phạm — đó là chỗ một file `.xlsx` của shop sẽ bị bắt.
 *
 * `TEN_CAM` và phép quét chuỗi bí mật VẪN ÁP ĐỦ cho cả cây: miễn trừ hai luật, không miễn cả phép kiểm.
 *
 * Vì sao không cắt `docs\` đi cho gọn: `PHIEN_BAN.txt` hướng dẫn người sau tải bản `.zip` chính thức
 * từ nodejs.org rồi chép đè, mà bản chính thức CÓ `docs\` và CÓ `node_modules`. Gói dựng từ bản tải
 * thẳng cũng phải qua được `kiemGoi()`, nếu không thì luật này sẽ bị người ta tắt đi cho xong việc.
 */
const TEN_NODE_PORTABLE = 'node-portable';
const CAY_NODE_PORTABLE = path.join('Cấu hình'.normalize('NFC'), TEN_NODE_PORTABLE) + path.sep;
const LOP_NGOAI_NODE_PORTABLE = ['node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd', 'PHIEN_BAN.txt', 'node_modules'];

/** Đường dẫn tương đối này có nằm TRONG cây node-portable không (không tính chính thư mục gốc cây). */
function trongCayNodePortable(duong) {
  return duong.normalize('NFC').startsWith(CAY_NODE_PORTABLE);
}

function doc(t) { return fs.readFileSync(t, 'utf8').replace(/^﻿/, ''); }

/** Liệt kê mọi file trong cây, trả đường dẫn tương đối đã chuẩn hóa NFC. */
function moiFile(goc, hienTai, ra) {
  ra = ra || [];
  hienTai = hienTai || goc;
  for (const t of fs.readdirSync(hienTai)) {
    const d = path.join(hienTai, t);
    const st = fs.statSync(d);
    const tuongDoi = path.relative(goc, d).normalize('NFC');
    if (st.isDirectory()) { ra.push({ duong: tuongDoi, laThuMuc: true }); moiFile(goc, d, ra); }
    else ra.push({ duong: tuongDoi, laThuMuc: false, cỡ: st.size, that: d });
  }
  return ra;
}

function xoaCay(d) {
  if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
}

function chepCay(tu, vao) {
  fs.mkdirSync(vao, { recursive: true });
  for (const t of fs.readdirSync(tu)) {
    const a = path.join(tu, t), b = path.join(vao, t);
    if (fs.statSync(a).isDirectory()) chepCay(a, b);
    else fs.copyFileSync(a, b);
  }
}

// ==================================================================== DỰNG GÓI

function dungGoi(dich, nodePortable) {
  const canhBao = [];
  xoaCay(dich);
  fs.mkdirSync(dich, { recursive: true });

  // --- cấu hình: dựng TỪ BẢN MẪU, không bao giờ từ file thật của máy này ---
  const mauTep = path.join(NGUON, TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.mau.json');
  if (!fs.existsSync(mauTep)) throw new Error('không thấy bản mẫu cấu hình: ' + mauTep);
  const cfg = JSON.parse(doc(mauTep));

  for (const k of KHOA_CHI_CHO_EXCEL) { delete cfg[k]; delete cfg['_' + k]; }
  cfg.google_sheet = cfg.google_sheet || {};
  for (const k of HAI_DONG_BI_MAT) cfg.google_sheet[k] = '';

  const thuMucCauHinh = path.join(dich, TEN_CAU_HINH);
  fs.mkdirSync(thuMucCauHinh, { recursive: true });
  fs.writeFileSync(path.join(thuMucCauHinh, 'CAU_HINH_VAN_HANH.json'),
    JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  fs.mkdirSync(path.join(thuMucCauHinh, TEN_NHAT_KY), { recursive: true });

  // --- thư mục thả file: bốn gian hàng, mỗi cái một thư mục "đã xử lý" ---
  const dsGian = Object.values(cfg.thu_muc_gian_hang || {});
  if (dsGian.length === 0) throw new Error('bản mẫu cấu hình không khai thu_muc_gian_hang');
  const daXuLy = (cfg.ten_thu_muc_da_xu_ly || 'đã xử lý').normalize('NFC');
  for (const g of dsGian) {
    fs.mkdirSync(path.join(dich, TEN_THA, g.normalize('NFC'), daXuLy), { recursive: true });
  }

  // --- bốn nút ---
  for (const t of BON_NUT) {
    const tu = path.join(NGUON, t);
    if (!fs.existsSync(tu)) throw new Error('thiếu nút ' + t + ' trong ' + NGUON);
    fs.copyFileSync(tu, path.join(dich, t));
  }

  // --- Node xách tay: không dựng ra được, chỉ chép nếu có ---
  if (nodePortable) {
    if (!fs.existsSync(path.join(nodePortable, 'node.exe'))) {
      throw new Error('đường dẫn --node-portable không có node.exe: ' + nodePortable);
    }
    chepCay(nodePortable, path.join(thuMucCauHinh, 'node-portable'));
  } else {
    canhBao.push('gói CHƯA có node-portable. Máy nhân viên không cài sẵn Node.js sẽ dừng ở bước 1 ' +
      'của 1_CAI_DAT_LAN_DAU.bat. Chạy lại với  --node-portable <thư mục có node.exe>  để kèm vào.');
  }

  return { dich, soGian: dsGian.length, canhBao };
}

// ============================================== THƯ MỤC `bat/` CỦA KHO GITHUB

/**
 * Kho GitHub có bốn thứ ở lớp ngoài: `src/`, `node/`, `package.json`, `bat/`.
 * `bat/` để sửa nút bấm cũng tới được máy nhân viên — trước đây sửa `.bat` thì phải
 * gửi lại cả gói.
 *
 * NGUY CƠ ĐI KÈM, và cách bịt. Nút bấm nay nằm ở HAI chỗ: `03_VAN_HANH/` là bản đang
 * dùng, `bat/` là bản đem xuất bản. Hai bản lệch nhau thì máy nhân viên nhận đúng cái
 * bản chưa ai chạy thử — tức là đẻ lại đúng cái bệnh "máy này một bản, máy kia một bản"
 * mà cả đợt này sinh ra để diệt. Nên `bat/` KHÔNG được sửa tay: nó do `--dong-bo-bat`
 * chép ra, và `kiemDongBoBat` bắt mọi khác biệt dù chỉ một byte.
 *
 * Chép cả BỐN nút, nhưng lúc cập nhật chỉ ghi đè BA — `2_CAP_NHAT.bat` không tự ghi đè
 * chính nó (Windows khóa file .bat đang chạy). Bản thứ tư nằm đó để so và nhắc.
 */
const THU_MUC_BAT_KHO = path.join(__dirname, '..', 'bat');
const KEM_THEO_BAT = ['CAU_HINH_VAN_HANH.mau.json'];

function dsFileBat() {
  return BON_NUT.map((t) => ({ ten: t, tu: path.join(NGUON, t) }))
    .concat(KEM_THEO_BAT.map((t) => ({ ten: t, tu: path.join(NGUON, TEN_CAU_HINH, t) })));
}

function dongBoBat() {
  fs.mkdirSync(THU_MUC_BAT_KHO, { recursive: true });
  const daChep = [];
  for (const x of dsFileBat()) {
    if (!fs.existsSync(x.tu)) throw new Error('không thấy nguồn để đồng bộ: ' + x.tu);
    fs.copyFileSync(x.tu, path.join(THU_MUC_BAT_KHO, x.ten));
    daChep.push(x.ten);
  }
  // Thứ gì lạ nằm trong bat/ thì bỏ đi: kho chỉ được mang đúng danh sách trên.
  const chinhChu = dsFileBat().map((x) => x.ten);
  const bo = [];
  for (const t of fs.readdirSync(THU_MUC_BAT_KHO)) {
    if (chinhChu.indexOf(t) < 0) { fs.rmSync(path.join(THU_MUC_BAT_KHO, t), { recursive: true, force: true }); bo.push(t); }
  }
  return { daChep, bo };
}

/** Trả danh sách chỗ lệch giữa `03_VAN_HANH/` và `bat/`; rỗng nghĩa là khớp từng byte. */
function kiemDongBoBat() {
  const lech = [];
  if (!fs.existsSync(THU_MUC_BAT_KHO)) return ['chưa có thư mục bat/ trong kho mã'];
  for (const x of dsFileBat()) {
    const kho = path.join(THU_MUC_BAT_KHO, x.ten);
    if (!fs.existsSync(kho)) { lech.push('bat/ thiếu ' + x.ten); continue; }
    if (!fs.existsSync(x.tu)) { lech.push('không thấy bản gốc của ' + x.ten); continue; }
    const a = fs.readFileSync(x.tu), b = fs.readFileSync(kho);
    if (!a.equals(b)) lech.push(x.ten + ' lệch (' + a.length + ' byte ở 03_VAN_HANH, ' + b.length + ' byte ở bat/)');
  }
  const chinhChu = dsFileBat().map((x) => x.ten);
  for (const t of fs.readdirSync(THU_MUC_BAT_KHO)) {
    if (chinhChu.indexOf(t) < 0) lech.push('bat/ có thứ lạ: ' + t);
  }
  return lech;
}

// ==================================================================== TỰ KIỂM

/**
 * Soi một gói đã dựng. Trả danh sách vi phạm; rỗng nghĩa là gói sạch.
 * Có quyền phủ quyết: gọi ở đâu cũng phải cho thoát mã khác 0 khi danh sách khác rỗng.
 */
function kiemGoi(dich) {
  const pham = [];
  if (!fs.existsSync(dich)) return ['không thấy thư mục gói: ' + dich];
  const ds = moiFile(dich);

  // 1. đúng bằng này thứ ở lớp ngoài cùng, không hơn
  const ngoaiCung = ds.filter((x) => x.duong.indexOf(path.sep) < 0).map((x) => x.duong).sort();
  const mong = BON_NUT.concat([TEN_THA, TEN_CAU_HINH]).sort();
  const thua = ngoaiCung.filter((t) => mong.indexOf(t) < 0);
  const thieu = mong.filter((t) => ngoaiCung.indexOf(t) < 0);
  if (thua.length) pham.push('lớp ngoài cùng có thứ lạ: ' + thua.join(', '));
  if (thieu.length) pham.push('lớp ngoài cùng thiếu: ' + thieu.join(', '));

  for (const x of ds) {
    const ten = path.basename(x.duong);
    // Trong cây node-portable: miễn trừ ĐÚNG hai luật DUOI_CAM và THU_MUC_CAM. Xem chú thích ở
    // CAY_NODE_PORTABLE. Danh sách trắng lớp ngoài (ngay dưới đây) là hàng rào thay thế.
    const mienTru = trongCayNodePortable(x.duong);
    if (x.laThuMuc) {
      if (!mienTru && THU_MUC_CAM.indexOf(ten) >= 0) pham.push('có thư mục cấm  ' + x.duong);
      continue;
    }
    const duoi = path.extname(ten).toLowerCase();
    if (!mienTru && DUOI_CAM.indexOf(duoi) >= 0) pham.push('có file đuôi cấm  ' + x.duong);
    if (TEN_CAM.indexOf(ten) >= 0) pham.push('có file cấm  ' + x.duong);   // KHÔNG miễn trừ
  }

  // Danh sách trắng lớp ngoài cùng của cây node-portable — thay cho hai luật vừa miễn trừ.
  const goiNP = path.join(dich, TEN_CAU_HINH, TEN_NODE_PORTABLE);
  if (fs.existsSync(goiNP)) {
    const la = fs.readdirSync(goiNP).map((t) => t.normalize('NFC'))
      .filter((t) => LOP_NGOAI_NODE_PORTABLE.indexOf(t) < 0);
    if (la.length) {
      pham.push('node-portable có thứ lạ ở lớp ngoài cùng: ' + la.join(', ') +
        ' (chỉ được có ' + LOP_NGOAI_NODE_PORTABLE.join(', ') + ')');
    }
    if (!fs.existsSync(path.join(goiNP, 'node.exe'))) pham.push('node-portable thiếu node.exe');
  }

  // 2. nhật ký phải rỗng — nhật ký cũ mang mã đơn thật
  const nk = path.join(dich, TEN_CAU_HINH, TEN_NHAT_KY);
  if (fs.existsSync(nk) && fs.readdirSync(nk).length > 0) {
    pham.push('thư mục nhật ký không rỗng: ' + fs.readdirSync(nk).join(', '));
  }

  // 3. hai dòng bí mật phải RỖNG trong gói
  const cfgTep = path.join(dich, TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  let cfg = null;
  if (!fs.existsSync(cfgTep)) pham.push('thiếu CAU_HINH_VAN_HANH.json');
  else {
    try {
      cfg = JSON.parse(doc(cfgTep));
      for (const k of HAI_DONG_BI_MAT) {
        const v = String(((cfg.google_sheet || {})[k]) || '').trim();
        if (v !== '') pham.push('cấu hình trong gói còn giá trị thật ở  google_sheet.' + k);
      }
      for (const k of KHOA_CHI_CHO_EXCEL) {
        if (Object.prototype.hasOwnProperty.call(cfg, k)) pham.push('cấu hình còn khóa chỉ dùng cho Excel: ' + k);
      }
    } catch (e) { pham.push('CAU_HINH_VAN_HANH.json trong gói sai định dạng: ' + e.message); }
  }

  // 4. không file nào trong gói được mang bí mật THẬT của máy đang đóng gói
  const that = path.join(NGUON, TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  const moi = [];
  if (fs.existsSync(that)) {
    try {
      const c = JSON.parse(doc(that));
      for (const k of HAI_DONG_BI_MAT) {
        const v = String(((c.google_sheet || {})[k]) || '').trim();
        if (v.length >= 8) moi.push({ ten: k, v });
      }
    } catch (e) { /* file thật hỏng thì thôi, không phải việc của phép kiểm này */ }
  }
  if (moi.length) {
    for (const x of ds) {
      if (x.laThuMuc || x.cỡ > 4 * 1024 * 1024) continue;
      let noi;
      try { noi = fs.readFileSync(x.that, 'latin1'); } catch (e) { continue; }
      for (const m of moi) if (noi.indexOf(m.v) >= 0) pham.push('file  ' + x.duong + '  mang giá trị thật của ' + m.ten);
    }
  }

  return pham;
}

// ==================================================================== CHẠY

function main() {
  const tv = process.argv.slice(2);
  const lay = (c) => { const i = tv.indexOf(c); return i >= 0 ? tv[i + 1] : null; };

  if (tv.indexOf('--dong-bo-bat') >= 0) {
    const kq = dongBoBat();
    console.log('Đã đồng bộ vào bat/ : ' + kq.daChep.join(', '));
    if (kq.bo.length) console.log('Đã bỏ khỏi bat/     : ' + kq.bo.join(', '));
    const lech = kiemDongBoBat();
    if (lech.length) { console.log('VẪN LỆCH:'); lech.forEach((l) => console.log('  · ' + l)); process.exit(1); }
    console.log('bat/ khớp từng byte với 03_VAN_HANH.');
    process.exit(0);
  }

  const chiKiem = lay('--kiem');
  if (chiKiem) {
    const pham = kiemGoi(path.resolve(chiKiem));
    if (pham.length) {
      console.log('GÓI HỎNG — ' + pham.length + ' chỗ vi phạm:');
      pham.forEach((p) => console.log('  · ' + p));
      process.exit(1);
    }
    console.log('GÓI SẠCH: ' + chiKiem);
    process.exit(0);
  }

  const dich = path.resolve(lay('--ra') || path.join(GOC_DU_AN, 'out', TEN_GOI));
  const np = lay('--node-portable');

  console.log('Dựng gói từ : ' + NGUON);
  console.log('Dựng gói vào: ' + dich);
  const kq = dungGoi(dich, np ? path.resolve(np) : null);
  console.log('  · ' + kq.soGian + ' thư mục gian hàng, mỗi cái có thư mục "' + 'đã xử lý' + '"');
  console.log('  · ' + BON_NUT.length + ' nút bấm');
  console.log('  · cấu hình dựng từ bản mẫu, hai dòng bí mật để rỗng');

  const pham = kiemGoi(dich);
  console.log('');
  if (pham.length) {
    console.log('TỰ KIỂM: HỎNG — ' + pham.length + ' chỗ vi phạm, gói này KHÔNG được giao đi:');
    pham.forEach((p) => console.log('  · ' + p));
    process.exit(1);
  }
  console.log('TỰ KIỂM: SẠCH — không .xlsx, không .md, không mã nguồn, không bí mật, nhật ký rỗng.');
  kq.canhBao.forEach((c) => console.log('\nCHÚ Ý: ' + c));
  process.exit(0);
}

module.exports = { dungGoi, kiemGoi, dongBoBat, kiemDongBoBat, THU_MUC_BAT_KHO, dsFileBat,
  TEN_NODE_PORTABLE, LOP_NGOAI_NODE_PORTABLE, trongCayNodePortable, BON_NUT, TEN_GOI, TEN_CAU_HINH, TEN_NHAT_KY, TEN_THA, KHOA_CHI_CHO_EXCEL, HAI_DONG_BI_MAT };

if (require.main === module) main();
