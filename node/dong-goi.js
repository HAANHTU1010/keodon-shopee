/**
 * ĐÓNG GÓI `Tool_nhap_lieu` — bản giao cho máy user, GIẢI NÉN LÀ CHẠY (D-44).
 *
 *   node node/dong-goi.js                      → dựng thẳng ra 04_BAN_GIAO/Tool_nhap_lieu.zip rồi tự kiểm
 *   node node/dong-goi.js --ra <thư mục>       → dựng ra THƯ MỤC (không nén) để soi bằng mắt
 *   node node/dong-goi.js --zip <đường dẫn>    → đổi chỗ đặt file zip
 *   node node/dong-goi.js --node-portable <d>  → lấy bản Node xách tay ở đường dẫn khác
 *   node node/dong-goi.js --mac               → dựng gói cho máy macOS (04_BAN_GIAO/Tool_nhap_lieu_mac.zip)
 *   node node/dong-goi.js --kiem <thư mục>     → CHỈ kiểm một gói đã giải nén, không dựng lại
 *   node node/dong-goi.js --dong-bo-van-hanh   → chép bat/ (bản gốc) đè lên 03_VAN_HANH
 *
 * GIẢI NÉN LÀ CHẠY (D-44, 13/9/2026). Bản trước ép rỗng `web_app_url` và `chuoi_bi_mat` rồi bắt từng máy
 * tự điền — mà điền tay thì có máy điền sai, có máy điền nhầm dòng, và không ai kiểm được. Nay gói mang
 * SẴN cấu hình đầy đủ lấy từ máy chủ dự án: `web_app_url`, `chuoi_bi_mat`, `link_thang` (40 kỳ) và
 * `cap_nhat`. Đổi lại, GÓI TRỞ THÀNH THỨ PHẢI GIỮ: ai có gói là ghi được vào sổ tiền. Gói chỉ đi kênh
 * nội bộ, và `HUONG_DAN_1_TRANG` nói thẳng điều đó ở khối cảnh báo trên cùng — `kiemGoi()` soát câu đó
 * có mặt thật (YC-40.3: bản 2.5.0 ghi dòng này mà hướng dẫn thì chưa có câu nào như vậy).
 *
 * KHO GITHUB VẪN KHÔNG CHỨA GÌ: `bat/CAU_HINH_VAN_HANH.mau.json` để rỗng như cũ, và INV-7 trong
 * `test-bat-bien.js` quét cả kho mỗi lượt chạy test.
 *
 * TÊN THƯ MỤC TRONG ZIP KHÔNG DẤU (`Tool_nhap_lieu`): thư mục có dấu đi qua trình giải nén lạ, qua
 * OneDrive, qua email hay bị vỡ mã ký tự rồi hỏng cả đường dẫn. Bên trong vẫn giữ tên có dấu vì đó là
 * thứ user đọc hằng ngày (`Cấu hình`, `đã xử lý`).
 *
 * VÌ SAO GÓI KHÔNG CHỨA `src/` VÀ `node/` (09_GIAO_VIEC_DEV_DONG_GOI.md mục 1).
 * Không phải để gói nhẹ. Trước đây mã tới máy user bằng HAI đường — chép tay lúc
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
/** Bốn nút lấy TỪ KHO MÃ (`bat/`), không lấy từ `03_VAN_HANH` — xem chú thích THU_MUC_BAT_KHO. */
const NGUON_NUT = path.join(__dirname, '..', 'bat');
const THU_MUC_BAN_GIAO = path.join(GOC_DU_AN, '04_BAN_GIAO');
const TEN_GOI = 'Tool_nhap_lieu';
const TEN_CAU_HINH = 'Cấu hình'.normalize('NFC');
const TEN_NHAT_KY = 'nhật ký'.normalize('NFC');
const TEN_THA = '1_THA_FILE_XUAT';

const BON_NUT = [
  '1_CAI_DAT_LAN_DAU.bat',
  '2_CAP_NHAT.bat',
  '3_TAO_FILE_THANG_MOI.bat',
  '4_CHAY_TOOL.bat'
];

/**
 * BẢN macOS (Đợt 5). Bốn nút `.command` + ruột chung `keodon-mac.sh` + bộ cài `cai-dat-mac.js`
 * (ruột nút 1 và nút 2 viết bằng Node — xem chú thích đầu file đó). KHÔNG kèm Node xách tay: bản
 * chính thức của nodejs.org có hai kiến trúc (arm64/x64) và tải về cũng dính Gatekeeper, nên máy Mac
 * cài Node một lần từ nodejs.org rồi thôi — nút 1 in sẵn ba bước.
 */
const THU_MUC_MAC = path.join(__dirname, '..', 'mac');
const BON_NUT_MAC = [
  '1_CAI_DAT_LAN_DAU.command',
  '2_CAP_NHAT.command',
  '3_TAO_FILE_THANG_MOI.command',
  '4_CHAY_TOOL.command'
];
/** Đi cùng bốn nút Mac ở lớp ngoài cùng của gói. */
const KEM_MAC = ['keodon-mac.sh', 'cai-dat-mac.js'];
const TEN_GOI_MAC = 'Tool_nhap_lieu_mac';
/** Kiến trúc máy Mac có bản Node xách tay. `uname -m` trả `arm64` hoặc `x86_64` (nút quy về `x64`). */
const KIEN_TRUC_MAC = ['arm64', 'x64'];
/** File phải giữ bit thực thi khi giải nén trên máy Mac (JSZip mặc định không đặt quyền → bấm đúp không chạy). */
const QUYEN_CHAY = 0o755;
const QUYEN_THUONG = 0o644;

/** Khóa chỉ dùng ở chế độ Excel — bỏ khỏi bản đóng gói (07_v2.6 mục 1). */
const KHOA_CHI_CHO_EXCEL = [
  'file_tracking', 'thang', 'tiep_tuc_tu_ket_qua_moi_nhat',
  'file_mapping_mau', 'thu_muc_file_tracking', 'thu_muc_ket_qua'
];

/**
 * Hai dòng trong `google_sheet` phải CÓ GIÁ TRỊ THẬT trong gói (D-44 đảo chiều luật cũ).
 * Tên hằng giữ nguyên để không phải sửa chỗ gọi, nhưng NGHĨA đã lật: trước là "phải rỗng", nay là
 * "phải có". `kiemGoi()` kiểm đúng chiều mới.
 */
const HAI_DONG_BI_MAT = ['web_app_url', 'chuoi_bi_mat'];

/**
 * C-3: DANH SÁCH TRẮNG cho tài liệu trong gói. `DUOI_CAM` chặn mọi `.md` vì tài liệu nội bộ mang số
 * doanh thu thật; hai file này là ngoại lệ DUY NHẤT, và phải kê đích danh chứ không nới luật theo đuôi.
 */
const TRANG_HUONG_DAN = ['HUONG_DAN_1_TRANG.md', 'HUONG_DAN_1_TRANG.txt'];

/**
 * Câu cảnh báo bắt buộc có trong hướng dẫn (YC-28 điểm 4, YC-32). So theo bản bỏ dấu, không phân biệt hoa
 * thường, để đổi cách in đậm hay viết hoa không làm phép soát mù đi.
 */
const CAU_CANH_BAO_GOI = 'goi nay chua khoa ghi vao google sheet: khong dang cong khai, khong gui cho nguoi ngoai';

function boDau(x) {
  return String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

/**
 * Sinh bản `.txt` (mở bằng Notepad) từ bản `.md`. Hai bản PHẢI đi cùng nhau: trước YC-40.3 bản `.txt` do
 * người chuyển tay nên có ngày lệch bản `.md` mà không ai biết. Nay `.txt` là thứ SINH RA, và DG-11 bắt
 * mọi khác biệt giữa `.txt` trên đĩa với `mdSangTxt(.md)`.
 *
 * Bỏ: dấu `#` tiêu đề, `**`, dấu backtick, rào khối mã, dòng gạch ngang của bảng, cú pháp link. Bảng thành
 * các cột cách nhau bằng khoảng trắng. Thêm BOM và CRLF — thiếu BOM thì Notepad bản cũ mở ra ký tự rác.
 */
function mdSangTxt(md) {
  const ra = [];
  for (const dong of String(md).replace(/\r\n/g, '\n').split('\n')) {
    let d = dong;
    if (/^```/.test(d)) continue;                                   // rào khối mã: giữ ruột, bỏ rào
    if (/^\s*\|[\s|:-]+\|\s*$/.test(d)) continue;                  // |---|---| của bảng
    if (/^\s*\|.*\|\s*$/.test(d)) {
      d = d.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((o) => o.trim()).join('   ·   ');
      d = '   ' + d;
    }
    d = d.replace(/^#{1,6}\s+/, '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1');
    ra.push(d);
  }
  return '\uFEFF' + ra.join('\r\n');
}

/** C-5: file giữ chỗ trong từng thư mục thả — không có nó thì giải nén xong mất luôn thư mục rỗng. */
const TEN_GIU_CHO = '.keep';
const NOI_DUNG_GIU_CHO =
  'File nay chi de giu thu muc. Tha file xuat Shopee cua gian hang nay vao day roi bam 4_CHAY_TOOL.bat.\r\n';

/** Thư mục thả báo cáo TikTok — tên phải khớp `chay-tiktok.js` (mặc định `TikTok Shop`). */
const TEN_THU_MUC_TIKTOK = 'TikTok Shop';
const NOI_DUNG_GIU_CHO_TIKTOK =
  'File nay chi de giu thu muc. Tha bao cao Tai chinh cua TikTok (Onhold-unsettled-orders...xlsx) vao day\r\n' +
  'roi bam 4_CHAY_TOOL. Xem muc TikTok Shop trong HUONG_DAN_1_TRANG.\r\n';

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
/** Bản Mac có một cây cho mỗi kiến trúc: `node-portable-mac-arm64`, `node-portable-mac-x64`. */
const CAY_NODE_MAC = path.join('Cấu hình'.normalize('NFC'), 'node-portable-mac-') ;
const LOP_NGOAI_NODE_PORTABLE = ['node.exe', 'npm', 'npm.cmd', 'npx', 'npx.cmd', 'PHIEN_BAN.txt', 'node_modules'];

/** Đường dẫn tương đối này có nằm TRONG cây node-portable không (không tính chính thư mục gốc cây). */
function trongCayNodePortable(duong) {
  const d = duong.normalize('NFC');
  return d.startsWith(CAY_NODE_PORTABLE) || d.startsWith(CAY_NODE_MAC);
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

/**
 * @param {string|boolean} [nodePortable] đường dẫn bản Node xách tay; `false` = CỐ Ý không kèm (bộ test
 *   dùng, để khỏi nén 36 MB ba lần); bỏ trống = lấy bản đang dùng trên máy chủ dự án.
 */
function dungGoi(dich, nodePortable, nen) {
  const macOS = nen === 'mac';
  const canhBao = [];
  xoaCay(dich);
  fs.mkdirSync(dich, { recursive: true });

  // --- cấu hình: LẤY BẢN THẬT của máy chủ dự án, đắp lên khung của bản mẫu (D-44) ---
  //
  // Vì sao vẫn phải đi qua bản mẫu chứ không chép thẳng file thật: bản mẫu là nơi giữ các dòng chú thích
  // `_…` mới nhất và danh sách khóa đúng của bản này. File thật trên máy chủ dự án thì tích tụ theo thời
  // gian — có thể còn khóa của chế độ Excel, còn chú thích của bản cũ. Lấy KHUNG từ mẫu, lấy GIÁ TRỊ từ
  // file thật, thì gói vừa có số đúng vừa có chữ đúng.
  const mauTep = path.join(NGUON_NUT, 'CAU_HINH_VAN_HANH.mau.json');
  if (!fs.existsSync(mauTep)) throw new Error('không thấy bản mẫu cấu hình: ' + mauTep);
  const cfg = JSON.parse(doc(mauTep));

  const thatTep = path.join(NGUON, TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  if (!fs.existsSync(thatTep)) {
    throw new Error('không thấy cấu hình THẬT của máy chủ dự án: ' + thatTep +
      '\n  Gói giao user phải mang sẵn web_app_url, chuoi_bi_mat và link_thang (D-44) — không dựng gói rỗng nữa.');
  }
  const that = JSON.parse(doc(thatTep));
  cfg.google_sheet = Object.assign({}, cfg.google_sheet, {
    bat: true,
    web_app_url: String((that.google_sheet || {}).web_app_url || '').trim(),
    chuoi_bi_mat: String((that.google_sheet || {}).chuoi_bi_mat || '')
  });
  cfg.link_thang = Object.assign({}, that.link_thang || {});
  cfg.cap_nhat = Object.assign({}, cfg.cap_nhat, that.cap_nhat || {});

  for (const k of KHOA_CHI_CHO_EXCEL) { delete cfg[k]; delete cfg['_' + k]; }

  // Dừng NGAY nếu ba thứ này thiếu: dựng ra một gói câm rồi mới phát hiện lúc user bấm nút là muộn.
  for (const k of HAI_DONG_BI_MAT) {
    if (!String(cfg.google_sheet[k] || '').trim()) {
      throw new Error('cấu hình thật của máy chủ dự án thiếu google_sheet.' + k +
        ' — gói giao user phải mang sẵn giá trị này (D-44)');
    }
  }
  if (Object.keys(cfg.link_thang).length === 0) {
    throw new Error('cấu hình thật thiếu link_thang — không có link tháng nào thì user bấm nút 4 là tắc ngay');
  }

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
    const thuMucGian = path.join(dich, TEN_THA, g.normalize('NFC'));
    fs.mkdirSync(path.join(thuMucGian, daXuLy), { recursive: true });
    // C-5: thư mục RỖNG không tồn tại trong file .zip. Không có file giữ chỗ thì user giải nén xong
    // thấy trống trơn, không biết thả file vào đâu, và nút 4 báo "thiếu thư mục gian hàng".
    fs.writeFileSync(path.join(thuMucGian, TEN_GIU_CHO), NOI_DUNG_GIU_CHO, 'utf8');
  }
  // Đợt 5: thư mục thứ năm `TikTok Shop`. Hướng dẫn một trang nói "năm thư mục gian hàng", mà gói
  // trước chỉ có bốn gian Shopee — user giải nén xong không thấy chỗ thả báo cáo TikTok (nút 4 có tự
  // dựng, nhưng chỉ sau lần bấm đầu). Không khai vào `thu_muc_gian_hang`: khóa đó là luồng Shopee.
  {
    const ttk = path.join(dich, TEN_THA, TEN_THU_MUC_TIKTOK);
    fs.mkdirSync(path.join(ttk, daXuLy), { recursive: true });
    fs.writeFileSync(path.join(ttk, TEN_GIU_CHO), NOI_DUNG_GIU_CHO_TIKTOK, 'utf8');
  }

  // --- bốn nút: lấy từ KHO MÃ (`bat/`) ---
  // `bat/` là bản đem xuất bản, cũng chính là bản `2_CAP_NHAT.bat` tải về máy user. Lấy nút từ
  // `03_VAN_HANH` thì gói giao đi và bản cập nhật về sau có thể là hai bản khác nhau — đúng cái bệnh
  // "máy này một bản, máy kia một bản" mà cả đợt này sinh ra để diệt.
  for (const t of (macOS ? BON_NUT_MAC : BON_NUT)) {
    const tu = path.join(macOS ? THU_MUC_MAC : NGUON_NUT, t);
    if (!fs.existsSync(tu)) throw new Error('thiếu nút ' + t + ' trong ' + (macOS ? THU_MUC_MAC : NGUON_NUT));
    fs.copyFileSync(tu, path.join(dich, t));
    if (macOS) fs.chmodSync(path.join(dich, t), QUYEN_CHAY);
  }
  // Hai file kỹ thuật của bản Mac nằm TRONG thư mục cấu hình: lớp ngoài cùng giữ đúng hình dạng của
  // bản Windows — 4 nút + 2 thư mục — để người dùng không phải nhìn thứ mình không cần bấm.
  if (macOS) {
    for (const t of KEM_MAC) {
      const tu = path.join(THU_MUC_MAC, t);
      if (!fs.existsSync(tu)) throw new Error('thiếu ' + t + ' trong ' + THU_MUC_MAC);
      fs.copyFileSync(tu, path.join(thuMucCauHinh, t));
      fs.chmodSync(path.join(thuMucCauHinh, t), QUYEN_CHAY);
    }
  }

  // --- hai file hướng dẫn, qua DANH SÁCH TRẮNG (C-3), lấy từ bat/ (bản có phiên bản) ---
  for (const t of TRANG_HUONG_DAN) {
    const tu = path.join(NGUON_NUT, t);
    if (!fs.existsSync(tu)) { canhBao.push('thiếu ' + t + ' trong ' + NGUON_NUT); continue; }
    if (macOS && t.endsWith('.txt')) {
      // Bản .txt của Windows là BOM + CRLF cho Notepad. TextEdit của macOS hiện BOM thành ký tự rác
      // và không cần CRLF → sinh lại từ chính bản .md, UTF-8 không BOM, xuống dòng LF.
      const md = fs.readFileSync(path.join(NGUON_NUT, 'HUONG_DAN_1_TRANG.md'), 'utf8');
      fs.writeFileSync(path.join(thuMucCauHinh, t), mdSangTxt(md).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n'), 'utf8');
      continue;
    }
    fs.copyFileSync(tu, path.join(thuMucCauHinh, t));
  }

  // --- Node xách tay: không dựng ra được, chỉ chép nếu có ---
  // Mặc định lấy bản đang dùng trên máy chủ dự án; không có thì gói vẫn dựng được nhưng KÊU LÊN.
  if (macOS) {
    // Node xách tay cho Mac — cùng vai trò như `node-portable` của Windows: user KHÔNG phải cài gì.
    // Một cây cho mỗi kiến trúc; hiện chỉ có arm64 (Apple Silicon). Máy Intel không có cây x64 thì
    // nút 1 in ba bước cài từ nodejs.org — tool vẫn chạy, chỉ là phải cài một lần.
    let soCay = 0;
    for (const kt of KIEN_TRUC_MAC) {
      const tu = path.join(NGUON, TEN_CAU_HINH, 'node-portable-mac-' + kt);
      if (!fs.existsSync(path.join(tu, 'bin', 'node'))) continue;
      chepCay(tu, path.join(thuMucCauHinh, 'node-portable-mac-' + kt));
      fs.chmodSync(path.join(thuMucCauHinh, 'node-portable-mac-' + kt, 'bin', 'node'), QUYEN_CHAY);
      for (const t of ['npm', 'npx']) {
        const f = path.join(thuMucCauHinh, 'node-portable-mac-' + kt, 'bin', t);
        if (fs.existsSync(f)) fs.chmodSync(f, QUYEN_CHAY);
      }
      soCay++;
    }
    if (!soCay) {
      canhBao.push('gói macOS CHƯA có node-portable-mac-*. Máy Mac phải tự cài Node từ nodejs.org. ' +
        'Dựng bản xách tay: npm pack node-bin-darwin-arm64@<bản> npm@<bản> rồi xếp vào 03_VAN_HANH/Cấu hình/node-portable-mac-arm64.');
    }
    return { dich, soGian: dsGian.length, soKyThang: Object.keys(cfg.link_thang).length, canhBao, nen: 'mac', soCayNodeMac: soCay };
  }
  if (nodePortable == null) {
    const macDinh = path.join(NGUON, TEN_CAU_HINH, TEN_NODE_PORTABLE);
    if (fs.existsSync(path.join(macDinh, 'node.exe'))) nodePortable = macDinh;
  }
  if (nodePortable) {
    if (!fs.existsSync(path.join(nodePortable, 'node.exe'))) {
      throw new Error('đường dẫn --node-portable không có node.exe: ' + nodePortable);
    }
    chepCay(nodePortable, path.join(thuMucCauHinh, 'node-portable'));
  } else {
    canhBao.push('gói CHƯA có node-portable. Máy user không cài sẵn Node.js sẽ dừng ở bước 1 ' +
      'của 1_CAI_DAT_LAN_DAU.bat. Chạy lại với  --node-portable <thư mục có node.exe>  để kèm vào.');
  }

  return { dich, soGian: dsGian.length, soKyThang: Object.keys(cfg.link_thang).length, canhBao };
}

// ============================================== THƯ MỤC `bat/` CỦA KHO GITHUB

/**
 * Kho GitHub có bốn thứ ở lớp ngoài: `src/`, `node/`, `package.json`, `bat/`.
 * `bat/` để sửa nút bấm cũng tới được máy user — trước đây sửa `.bat` thì phải
 * gửi lại cả gói.
 *
 * NGUY CƠ ĐI KÈM, và cách bịt. Nút bấm nay nằm ở HAI chỗ: `bat/` trong kho mã và
 * `03_VAN_HANH/` trên máy chủ dự án. Hai bản lệch nhau thì máy user nhận đúng cái
 * bản chưa ai chạy thử — tức là đẻ lại đúng cái bệnh "máy này một bản, máy kia một bản"
 * mà cả đợt này sinh ra để diệt.
 *
 * CHIỀU SỰ THẬT ĐẢO NGÀY 13/9 (YC-32 điểm 5). Trước đây `03_VAN_HANH/` là bản gốc và `bat/` chép ra từ
 * nó. Nhưng `bat/` mới là thứ đi tới máy user qua HAI đường — gói zip và `2_CAP_NHAT.bat` — nên nó phải
 * là bản gốc, còn `03_VAN_HANH/` là một bản cài đặt như mọi máy khác. Nay `--dong-bo-van-hanh` chép
 * `bat/` ĐÈ LÊN `03_VAN_HANH/`, và `kiemDongBoBat` vẫn bắt mọi khác biệt dù chỉ một byte.
 *
 * Chép cả BỐN nút, nhưng lúc cập nhật chỉ ghi đè BA — `2_CAP_NHAT.bat` không tự ghi đè
 * chính nó (Windows khóa file .bat đang chạy). Bản thứ tư nằm đó để so và nhắc.
 */
const THU_MUC_BAT_KHO = path.join(__dirname, '..', 'bat');
const KEM_THEO_BAT = ['CAU_HINH_VAN_HANH.mau.json'].concat(TRANG_HUONG_DAN);

function dsFileBat() {
  return BON_NUT.map((t) => ({ ten: t, tu: path.join(NGUON, t) }))
    .concat(KEM_THEO_BAT.map((t) => ({ ten: t, tu: path.join(NGUON, TEN_CAU_HINH, t) })));
}

/** Chép `bat/` (bản gốc) ĐÈ LÊN `03_VAN_HANH/` của máy chủ dự án. Trả danh sách file đã đổi. */
function dongBoVanHanh() {
  const daChep = [];
  for (const x of dsFileBat()) {
    const goc = path.join(THU_MUC_BAT_KHO, x.ten);
    if (!fs.existsSync(goc)) throw new Error('không thấy bản gốc trong bat/: ' + goc);
    fs.mkdirSync(path.dirname(x.tu), { recursive: true });
    const cu = fs.existsSync(x.tu) ? fs.readFileSync(x.tu) : null;
    const moi = fs.readFileSync(goc);
    if (cu && cu.equals(moi)) continue;                       // đã khớp thì không đụng vào
    // Ghi file tạm rồi đổi tên: đứt giữa chừng thì bản cũ còn nguyên, không thành file .bat cụt.
    const tam = x.tu + '.__moi';
    fs.writeFileSync(tam, moi);
    fs.renameSync(tam, x.tu);
    daChep.push(x.ten + (cu ? ' (' + cu.length + ' → ' + moi.length + ' byte)' : ' (mới)'));
  }
  return { daChep };
}

/** Trả danh sách chỗ lệch giữa `bat/` (gốc) và `03_VAN_HANH/` (bản cài); rỗng nghĩa là khớp từng byte. */
function kiemDongBoBat() {
  const lech = [];
  if (!fs.existsSync(THU_MUC_BAT_KHO)) return ['chưa có thư mục bat/ trong kho mã'];
  for (const x of dsFileBat()) {
    const kho = path.join(THU_MUC_BAT_KHO, x.ten);
    if (!fs.existsSync(kho)) { lech.push('bat/ thiếu ' + x.ten); continue; }
    if (!fs.existsSync(x.tu)) { lech.push('03_VAN_HANH thiếu ' + x.ten); continue; }
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
  const macOS = ngoaiCung.indexOf('4_CHAY_TOOL.command') >= 0;
  const mong = (macOS ? BON_NUT_MAC : BON_NUT).concat([TEN_THA, TEN_CAU_HINH]).sort();
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
    // C-3: hai file hướng dẫn là ngoại lệ KÊ ĐÍCH DANH, không phải nới luật theo đuôi. Và chúng chỉ được
    // nằm đúng trong thư mục `Cấu hình`; một `HUONG_DAN_1_TRANG.md` mọc ở chỗ khác vẫn là vi phạm.
    const laTrangTrang = TRANG_HUONG_DAN.indexOf(ten) >= 0 &&
      path.dirname(x.duong).normalize('NFC') === TEN_CAU_HINH;
    if (!mienTru && !laTrangTrang && DUOI_CAM.indexOf(duoi) >= 0) pham.push('có file đuôi cấm  ' + x.duong);
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

  // 3. cấu hình phải ĐẦY ĐỦ (D-44 — đảo chiều luật cũ "phải rỗng")
  //
  // Luật cũ ép rỗng rồi bắt từng máy điền tay. Đảo chiều không phải nới lỏng: phép kiểm nay KHÓ QUA HƠN,
  // vì một gói thiếu giá trị là gói câm — user bấm nút 4 và chỉ nhận được câu "thiếu web_app_url".
  const cfgTep = path.join(dich, TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  let cfg = null;
  if (!fs.existsSync(cfgTep)) pham.push('thiếu CAU_HINH_VAN_HANH.json');
  else {
    try {
      cfg = JSON.parse(doc(cfgTep));
      for (const k of HAI_DONG_BI_MAT) {
        const v = String(((cfg.google_sheet || {})[k]) || '').trim();
        if (v === '') pham.push('cấu hình trong gói còn RỖNG ở  google_sheet.' + k + '  (D-44: gói phải điền sẵn)');
      }
      if ((cfg.google_sheet || {}).bat !== true) pham.push('cấu hình trong gói có google_sheet.bat khác true');
      const lt = cfg.link_thang;
      if (!lt || typeof lt !== 'object' || Object.keys(lt).length === 0) {
        pham.push('cấu hình trong gói thiếu link_thang (D-42: không có link tháng thì nút 4 tắc ngay)');
      } else {
        // Tháng CỦA NGÀY ĐÓNG GÓI phải có mặt — đó là tháng user sẽ chạy ngay hôm nhận gói.
        const kyNay = require('./gsheet-web-app').thangHienTaiMay();   // 2.7.2: tháng theo giờ Việt Nam, như nút 4
        const v = String(lt[kyNay] || '').trim();
        if (!v) pham.push('link_thang thiếu khóa của tháng hiện tại (' + kyNay + ')');
        // CÙNG luật với nút 4 (`RE_LINK_SHEET`, nhận cả `/spreadsheets/u/<số>/d/`) — luật riêng ở đây từng chặn oan gói
        // chỉ vì link tháng được copy từ trình duyệt đăng nhập nhiều tài khoản (YC-41 việc 1).
        else if (!require('./gsheet-web-app').RE_LINK_SHEET.test(v)) {
          pham.push('link_thang["' + kyNay + '"] không phải link Google Sheet hợp lệ');
        }
      }
      for (const k of KHOA_CHI_CHO_EXCEL) {
        if (Object.prototype.hasOwnProperty.call(cfg, k)) pham.push('cấu hình còn khóa chỉ dùng cho Excel: ' + k);
      }
    } catch (e) { pham.push('CAU_HINH_VAN_HANH.json trong gói sai định dạng: ' + e.message); }
  }

  // 4. C-5: đủ file giữ chỗ, mỗi thư mục gian hàng một cái. Từ Đợt 5 là NĂM thư mục:
  //    bốn gian Shopee (khai ở `thu_muc_gian_hang`) + `TikTok Shop` (luồng riêng, xem `chay-tiktok.js`).
  const thaGoc = path.join(dich, TEN_THA);
  if (!fs.existsSync(thaGoc)) pham.push('thiếu thư mục ' + TEN_THA);
  else {
    const gian = fs.readdirSync(thaGoc).filter((t) => fs.statSync(path.join(thaGoc, t)).isDirectory());
    if (gian.length !== 5) pham.push('thư mục thả file có ' + gian.length + ' gian hàng, cần đúng 5 (4 gian Shopee + TikTok Shop)');
    if (gian.map((t) => t.normalize('NFC')).indexOf(TEN_THU_MUC_TIKTOK) < 0) pham.push('thiếu thư mục thả  ' + TEN_THU_MUC_TIKTOK);
    for (const g of gian) {
      if (!fs.existsSync(path.join(thaGoc, g, TEN_GIU_CHO))) {
        pham.push('thư mục gian hàng  ' + g + '  thiếu ' + TEN_GIU_CHO + ' (giải nén xong sẽ mất thư mục)');
      }
    }
  }

  // 5. C-3: đủ hai file hướng dẫn, đúng chỗ — và nội dung phải đúng với gói "giải nén là chạy"
  for (const t of TRANG_HUONG_DAN) {
    const tep = path.join(dich, TEN_CAU_HINH, t);
    if (!fs.existsSync(tep)) { pham.push('thiếu ' + TEN_CAU_HINH + '/' + t); continue; }
    const nd = doc(tep);
    // YC-40.3: câu cảnh báo "gói chứa khóa" phải có thật trong hướng dẫn user đọc.
    if (boDau(nd).replace(/[*`>]/g, '').replace(/\s+/g, ' ').indexOf(CAU_CANH_BAO_GOI) < 0) {
      pham.push(t + ' thiếu câu cảnh báo "gói này chứa khóa ghi vào Google Sheet…" (YC-28 điểm 4)');
    }
    // Hướng dẫn không được bảo user mở một file không có trong gói (bản 2.5.0 trỏ BAT_GOOGLE_SHEET.md).
    for (const m of nd.matchAll(/\b([A-Za-z0-9_]+\.md)\b/g)) {
      if (TRANG_HUONG_DAN.indexOf(m[1]) < 0) pham.push(t + ' nhắc file "' + m[1] + '" không có trong gói');
    }
    // Hướng dẫn không được còn câu của thời "ép rỗng" (D-44 đã bỏ việc bắt user điền tay).
    if (/dien hai dong|dung o buoc 6/.test(boDau(nd))) {
      pham.push(t + ' còn hướng dẫn user tự điền cấu hình — trái D-44 "giải nén là chạy"');
    }
  }

  // 6. cấu hình thật KHÔNG được rò sang file khác trong gói
  //
  // Gói cố ý mang chuỗi bí mật — nhưng chỉ ở ĐÚNG MỘT chỗ: `Cấu hình/CAU_HINH_VAN_HANH.json`. Nó lọt
  // thêm vào một file nhật ký, một file .txt hướng dẫn hay một bản sao lưu nào đó là chuyện khác hẳn:
  // đó là những file người ta hay mở ra xem, chụp màn hình, gửi qua chat.
  const thatTep = path.join(NGUON, TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.json');
  const moi = [];
  if (fs.existsSync(thatTep)) {
    try {
      const c = JSON.parse(doc(thatTep));
      for (const k of HAI_DONG_BI_MAT) {
        const v = String(((c.google_sheet || {})[k]) || '').trim();
        if (v.length >= 8) moi.push({ ten: k, v });
      }
    } catch (e) { /* file thật hỏng thì thôi, không phải việc của phép kiểm này */ }
  }
  if (moi.length) {
    const duocPhep = path.join(TEN_CAU_HINH, 'CAU_HINH_VAN_HANH.json').normalize('NFC');
    for (const x of ds) {
      if (x.laThuMuc || x.cỡ > 4 * 1024 * 1024) continue;
      if (x.duong.normalize('NFC') === duocPhep) continue;
      let noi;
      try { noi = fs.readFileSync(x.that, 'latin1'); } catch (e) { continue; }
      for (const m of moi) {
        if (noi.indexOf(m.v) >= 0) pham.push('file  ' + x.duong + '  mang giá trị thật của ' + m.ten +
          ' (chỉ Cấu hình/CAU_HINH_VAN_HANH.json được giữ)');
      }
    }
  }

  return pham;
}

// ==================================================================== NÉN RA ZIP

/**
 * Nén cây `goc` thành một file .zip có ĐÚNG MỘT thư mục gốc `Tool_nhap_lieu` bên trong.
 *
 * Vì sao phải có thư mục gốc: user hay bấm "Extract Here" ngay trên Desktop. Zip không có thư mục gốc
 * thì bốn nút và hai thư mục đổ thẳng ra Desktop lẫn với mọi thứ khác, và không cách nào gỡ lại.
 *
 * Ghi file tạm rồi đổi tên — cùng luật với mọi kịch bản sửa file của dự án: đứt giữa chừng thì file zip
 * cũ vẫn nguyên vẹn chứ không thành một file hỏng nửa vời mà ai đó đem đi giao.
 */
async function nenZip(goc, tepZip, mucNen, nen) {
  const JSZip = require('jszip');
  const macOS = nen === 'mac';
  const zip = new JSZip();
  const trong = zip.folder(macOS ? TEN_GOI_MAC : TEN_GOI);
  for (const x of moiFile(goc)) {
    const ten = x.duong.split(path.sep).join('/');
    if (x.laThuMuc) { trong.folder(ten); continue; }
    // macOS: file .command/.sh PHẢI giữ bit thực thi, không thì bấm đúp trong Finder không chạy
    // và user chỉ thấy cửa sổ Terminal nhấp nháy rồi tắt (JSZip mặc định không ghi quyền Unix).
    const chay = macOS && /\.(command|sh)$/.test(ten);
    trong.file(ten, fs.readFileSync(x.that), macOS ? { unixPermissions: chay ? QUYEN_CHAY : QUYEN_THUONG } : undefined);
  }
  const buf = await zip.generateAsync(Object.assign({
    type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: mucNen || 6 }
  }, macOS ? { platform: 'UNIX' } : {}));
  fs.mkdirSync(path.dirname(tepZip), { recursive: true });
  const tam = tepZip + '.__moi';
  fs.writeFileSync(tam, buf);
  fs.renameSync(tam, tepZip);
  return { tepZip, cỡ: buf.length };
}

/** Dựng gói vào thư mục tạm, tự kiểm, rồi nén ra zip. Gói bẩn thì KHÔNG nén — phủ quyết trước khi ra file. */
async function dongGoiZip(tuyChon) {
  const o = tuyChon || {};
  const macOS = o.nen === 'mac';
  const tepZip = o.zip || path.join(THU_MUC_BAN_GIAO, (macOS ? TEN_GOI_MAC : TEN_GOI) + '.zip');
  const tam = fs.mkdtempSync(path.join(require('os').tmpdir(), 'keodon-goi-'));
  const dich = path.join(tam, macOS ? TEN_GOI_MAC : TEN_GOI);
  try {
    const kq = dungGoi(dich, o.nodePortable === undefined ? null : o.nodePortable, o.nen);
    const pham = kiemGoi(dich);
    if (pham.length) return { pham, canhBao: kq.canhBao };
    const z = await nenZip(dich, tepZip, o.mucNen, o.nen);
    return { pham: [], canhBao: kq.canhBao, tepZip: z.tepZip, cỡ: z.cỡ, soGian: kq.soGian, soKyThang: kq.soKyThang };
  } finally {
    try { fs.rmSync(tam, { recursive: true, force: true }); } catch (e) { /* còn khóa thì thôi */ }
  }
}

// ==================================================================== CHẠY

async function main() {
  const tv = process.argv.slice(2);
  const lay = (c) => { const i = tv.indexOf(c); return i >= 0 ? tv[i + 1] : null; };

  if (tv.indexOf('--dong-bo-van-hanh') >= 0) {
    const kq = dongBoVanHanh();
    if (kq.daChep.length) console.log('Đã chép bat/ → 03_VAN_HANH : ' + kq.daChep.join(', '));
    else console.log('03_VAN_HANH đã khớp bat/, không phải chép gì.');
    const lech = kiemDongBoBat();
    if (lech.length) { console.log('VẪN LỆCH:'); lech.forEach((l) => console.log('  · ' + l)); process.exit(1); }
    console.log('03_VAN_HANH khớp từng byte với bat/.');
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

  const np = lay('--node-portable');
  const nodePortable = np ? path.resolve(np) : null;
  const raThuMuc = lay('--ra');
  const nen = tv.indexOf('--mac') >= 0 ? 'mac' : null;   // Đợt 5: gói cho máy macOS

  // `--ra`: dựng ra thư mục để soi bằng mắt, KHÔNG nén. Mặc định thì đi thẳng ra zip.
  if (raThuMuc) {
    const dich = path.resolve(raThuMuc);
    console.log('Dựng gói vào thư mục: ' + dich);
    const kq = dungGoi(dich, nodePortable, nen);
    const pham = kiemGoi(dich);
    inKetQua(kq, pham);
    process.exit(pham.length ? 1 : 0);
  }

  const tepZip = path.resolve(lay('--zip') || path.join(THU_MUC_BAN_GIAO, (nen === 'mac' ? TEN_GOI_MAC : TEN_GOI) + '.zip'));
  console.log('Đóng gói ra: ' + tepZip + (nen === 'mac' ? '   (bản macOS)' : ''));
  const kq = await dongGoiZip({ zip: tepZip, nodePortable: nodePortable, nen: nen });
  inKetQua(kq, kq.pham);
  if (kq.pham.length) process.exit(1);
  console.log('  · ' + (kq.cỡ / 1024 / 1024).toFixed(1) + ' MB · thư mục gốc trong zip: ' + (nen === 'mac' ? TEN_GOI_MAC : TEN_GOI));
  process.exit(0);
}

function inKetQua(kq, pham) {
  if (kq.soGian != null) console.log('  · ' + kq.soGian + ' thư mục gian hàng, mỗi cái một "đã xử lý" và một .keep');
  console.log('  · ' + (kq.nen === 'mac' ? BON_NUT_MAC.length + ' nút bấm .command lấy từ mac/ (kèm keodon-mac.sh, cai-dat-mac.js)' : BON_NUT.length + ' nút bấm lấy từ bat/'));
  if (kq.soCayNodeMac != null) console.log('  · ' + kq.soCayNodeMac + ' bản Node xách tay cho Mac (' + KIEN_TRUC_MAC.join(', ') + ' — có bản nào chép bản đó)');
  if (kq.soKyThang != null) console.log('  · cấu hình đầy đủ: web_app_url, chuoi_bi_mat, ' + kq.soKyThang + ' kỳ link_thang');
  console.log('');
  if (pham && pham.length) {
    console.log('TỰ KIỂM: HỎNG — ' + pham.length + ' chỗ vi phạm, gói này KHÔNG được giao đi:');
    pham.forEach((x) => console.log('  · ' + x));
    return;
  }
  console.log('TỰ KIỂM: SẠCH — không .xlsx, không mã nguồn, nhật ký rỗng, cấu hình đủ, 5 file .keep, 2 file hướng dẫn.');
  (kq.canhBao || []).forEach((c) => console.log('\nCHÚ Ý: ' + c));
}

module.exports = { dungGoi, kiemGoi, dongGoiZip, nenZip, dongBoVanHanh, kiemDongBoBat, mdSangTxt, CAU_CANH_BAO_GOI, BON_NUT_MAC, KEM_MAC, TEN_GOI_MAC, TEN_THU_MUC_TIKTOK, KIEN_TRUC_MAC,
  THU_MUC_BAT_KHO, THU_MUC_BAN_GIAO, NGUON_NUT, dsFileBat, TRANG_HUONG_DAN, TEN_GIU_CHO,
  TEN_NODE_PORTABLE, LOP_NGOAI_NODE_PORTABLE, trongCayNodePortable, BON_NUT, TEN_GOI, TEN_CAU_HINH,
  TEN_NHAT_KY, TEN_THA, KHOA_CHI_CHO_EXCEL, HAI_DONG_BI_MAT };

if (require.main === module) {
  main().catch((e) => { console.error('ĐÓNG GÓI HỎNG: ' + (e && e.stack ? e.stack : e)); process.exit(1); });
}
