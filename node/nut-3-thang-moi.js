/**
 * nut-3-thang-moi.js — NÚT 3 `3_TAO_FILE_THANG_MOI.bat` (YC-34, D-45). Nút bấm gọi:
 *   node node/nut-3-thang-moi.js --van-hanh <thư mục chứa bốn nút>
 *
 * Hỏi ĐÚNG bảy trường theo thứ tự đề bài, kiểm NGAY từng trường; sai một trường thì in dòng đỏ nêu trường sai và hỏi
 * lại TỪ ĐẦU [1/7], tối đa ba lượt rồi thoát. In lại bảy giá trị đã hiểu, hỏi `Dung chua? (c/k)`, rồi:
 *   · CHẾ ĐỘ 2 — chỉ ghi `link_thang["<năm mới>-<tháng mới>"]` vào `CAU_HINH_VAN_HANH.json` (ghi đè nếu đã có).
 *     Không gọi mạng: máy khác đã chuyển sổ xong, máy này chỉ cần biết link.
 *   · CHẾ ĐỘ 1 — gọi Web App `taoThangMoi` (`WebAppGoogleSheet.taoThangMoi`), CHỈ KHI đủ 8/8 phép tự kiểm mới ghi
 *     `link_thang` như chế độ 2. Web App từ chối, tự kiểm lệch, lỗi quyền, mất mạng → in nguyên nhân, KHÔNG ghi link.
 *
 * Ba luật không thương lượng ở file này:
 *   1. INV-7 — không in link hay ID file tháng ra màn hình / nhật ký, kể cả link người bấm vừa dán, kể cả khi nó
 *      sai. Bảy giá trị in lại thì link chỉ ghi "link Google Sheet hợp lệ". Câu lỗi JSON của V8 có trích một đoạn
 *      file cấu hình (có thể trúng chuỗi bí mật) nên KHÔNG BAO GIỜ in `e.message` của `JSON.parse`.
 *   2. Sửa `CAU_HINH_VAN_HANH.json` bằng FILE TẠM RỒI ĐỔI TÊN (README 6.4, bài học 09/9): đọc lại bản tạm, so mọi
 *      khóa khác y nguyên, rồi mới `renameSync` đè lên. Đứt giữa chừng thì file thật còn nguyên bản cũ.
 *   3. Không ghi `link_thang` khi chưa chắc: chế độ 1 tự đếm lại 8/8 phép `kiem` ngay trên máy, không tin riêng cờ
 *      `ok` của Web App.
 *
 * `/tra-loi` (chỉ để chạy thử): nút bấm đặt biến môi trường `TM_TRA_LOI` = các câu trả lời nối bằng `|`, tiêu thụ
 * lần lượt như người gõ — kể cả câu trả lời cho lượt hỏi lại và cho `Dung chua? (c/k)`. Hết câu trả lời = dừng.
 *
 * Mã thoát (nút bấm in câu tương ứng):
 *   0 đã ghi link · 1 chưa làm gì (nhập sai ba lượt, trả lời k, thiếu cấu hình, không ghi được cấu hình ở chế độ 2) ·
 *   3 Web App từ chối / tự kiểm lệch — link không đổi · 4 lỗi mạng, quyền, lệch bản, thiếu cấu hình Web App — link
 *   không đổi · 5 Google đã tạo xong 8/8 nhưng máy không ghi được link · 9 lỗi không đoán trước.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const gw = require('./gsheet-web-app');

// Tiền tố chung của MỌI link Google Sheet — dừng trước `d/` vì link từ trình duyệt đăng nhập nhiều tài khoản có
// thêm `u/<số>/` ở giữa (YC-41 việc 1). Phần sau tiền tố do `gw.RE_LINK_SHEET` chấm.
const TIEN_TO_LINK = 'https://docs.google.com/spreadsheets/';
const SO_LUOT_HOI_TOI_DA = 3;

/** Nguyên văn đề bài YC-34 (ASCII — cửa sổ đen nào cũng hiện đúng). Câu 7 thêm một dòng nhắc chỗ gõ. */
const CAU_HOI = [
  '[1/7] Thang truoc (1-12): ',
  '[2/7] Nam truoc (vd 2026): ',
  '[3/7] Link file Google Sheet thang truoc: ',
  '[4/7] Thang moi (1-12): ',
  '[5/7] Nam moi (vd 2026): ',
  '[6/7] Link file Google Sheet thang moi: ',
  '[7/7] Che do: 1 = Tao/chuyen so sang thang moi (copy ton, day cot Loi nhuan, don don hang, ghi link)\n' +
  '              2 = Chi khai bao link thang moi (khong dong vao du lieu)\n' +
  '      Go 1 hoac 2: '
];
const TEN_TRUONG = ['[1/7] Tháng trước', '[2/7] Năm trước', '[3/7] Link file Google Sheet tháng trước',
  '[4/7] Tháng mới', '[5/7] Năm mới', '[6/7] Link file Google Sheet tháng mới', '[7/7] Chế độ'];
const LA_LINK = [false, false, true, false, false, true, false];

// ==================================================================== kiểm từng trường (hàm thuần)

function kiemThang(x) {
  const t = String(x == null ? '' : x).trim();
  if (!t) return { loi: 'không được để trống' };
  if (!/^\d{1,2}$/.test(t) || +t < 1 || +t > 12) return { loi: 'phải là số nguyên từ 1 đến 12' };
  return { gt: +t };
}

function kiemNam(x) {
  const t = String(x == null ? '' : x).trim();
  if (!t) return { loi: 'không được để trống' };
  if (!/^\d{4}$/.test(t)) return { loi: 'phải đủ 4 chữ số, ví dụ 2026' };
  return { gt: +t };
}

/**
 * Link `trim()` rồi phải bắt đầu bằng `https://docs.google.com/spreadsheets/`, theo sau là `d/` hoặc `u/<số>/d/`
 * (YC-41: dạng thứ hai là thanh địa chỉ khi trình duyệt đăng nhập nhiều tài khoản Google), VÀ có mã file ≥ 20 ký tự
 * sau `/d/` — cùng luật `RE_LINK_SHEET` mà nút 4 dùng để rút ID. Nhận link thiếu mã là ghi vào `link_thang` một dòng
 * mà ngày mai nút 4 sẽ từ chối.
 */
function kiemLink(x) {
  const t = String(x == null ? '' : x).trim();
  if (!t) return { loi: 'không được để trống' };
  if (t.indexOf(TIEN_TO_LINK) !== 0) return { loi: 'phải là link Google Sheet, bắt đầu bằng ' + TIEN_TO_LINK };
  const m = t.match(gw.RE_LINK_SHEET);
  if (!m) return { loi: 'link bị cắt — thiếu mã file sau /d/. Mở file trên Google, copy lại cả thanh địa chỉ' };
  return { gt: t, id: m[1] };
}

function kiemCheDo(x) {
  const t = String(x == null ? '' : x).trim();
  if (!t) return { loi: 'không được để trống' };
  if (t !== '1' && t !== '2') return { loi: 'chỉ gõ 1 hoặc 2' };
  return { gt: +t };
}

const KIEM = [kiemThang, kiemNam, kiemLink, kiemThang, kiemNam, kiemLink, kiemCheDo];

/** In lại chữ người bấm gõ trong câu lỗi — trừ khi nó trông như link hay mã file (INV-7), hoặc dài bất thường. */
function inLaiAnToan(x) {
  const t = String(x == null ? '' : x).trim();
  if (!t) return '';
  if (/https?:|docs\.google|script\.google|[A-Za-z0-9_-]{20,}/i.test(t) || t.length > 16) return ' (không in lại chữ vừa gõ vì trông như link)';
  return ' (bạn gõ "' + t + '")';
}

/**
 * Chữ VANG LẠI câu trả lời ở chế độ `/tra-loi` (người gõ tay thì cửa sổ tự hiện, không vang lại). Ô link → `<link đã dán>`;
 * ô khác mà câu trả lời trông như link / mã file / dài bất thường (chuỗi trả lời lệch một ô là rơi đúng vào đây) → `<đã ẩn>`.
 */
function vangLai(x, laLink) {
  const t = String(x == null ? '' : x).trim();
  if (!t) return '';
  if (laLink) return '<link đã dán>';
  if (/https?:|docs\.google|script\.google|[A-Za-z0-9_-]{20,}/i.test(t) || t.length > 16) return '<đã ẩn>';
  return t;
}

/** 'yyyy-MM' giờ Việt Nam của một thời điểm. */
function kyHienTai(thoiDiem) { return gw.thangHienTaiMay(thoiDiem); }

/** Câu báo sau khi ghi link — đầu câu đúng nguyên văn đề bài `DA GHI link thang <YYYY-MM>.` */
function cauDaGhi(ky, thoiDiem) {
  const nay = kyHienTai(thoiDiem);
  const dau = 'DA GHI link thang ' + ky + '.';
  // D-65 (chủ dự án duyệt 14/9, thay câu nguyên văn đề bài YC-34 "Tu ngay mai…"): khai cho tháng ĐANG chạy thì nút 4 ghi
  // vào file này NGAY lượt bấm tới, không phải từ ngày mai.
  if (ky === nay) return dau + ' Tu bay gio nut 4 se ghi vao file nay.';
  // Tháng sau: "từ ngày mai" là sai — nút 4 lấy tháng theo NGÀY CHẠY, nên phải tới ngày 1 của tháng đó.
  if (ky > nay) return dau + ' Tu ngay 1/' + Number(ky.slice(5)) + '/' + ky.slice(0, 4) + ' nut 4 se ghi vao file nay.';
  return dau + ' Thang nay da qua: nut 4 chi ghi vao file nay khi chay tay voi --thang ' + ky + '.';
}

// ==================================================================== cấu hình trên máy

/**
 * Tìm `CAU_HINH_VAN_HANH.json` — CÙNG LUẬT với `timFileCauHinh` của `chay-thu.js` (nút 4): ngay trong thư mục vận
 * hành, hoặc trong đúng MỘT thư mục con (bố cục có thư mục `Cấu hình`). Không `require` chay-thu.js vì file đó chạy
 * `main()` ngay khi nạp.
 */
function timFileCauHinh(vh) {
  const ngay = path.join(vh, 'CAU_HINH_VAN_HANH.json');
  if (fs.existsSync(ngay)) return ngay;
  if (!fs.existsSync(vh)) return ngay;
  const con = fs.readdirSync(vh, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(vh, d.name, 'CAU_HINH_VAN_HANH.json'))
    .filter((p) => fs.existsSync(p));
  if (con.length === 1) return con[0];
  if (con.length > 1) {
    throw new Error('Có ' + con.length + ' file CAU_HINH_VAN_HANH.json trong các thư mục con — chỉ được có đúng một. ' +
      'Xóa hoặc đổi tên bản thừa rồi bấm lại.');
  }
  return ngay;
}

/** Đọc JSON cấu hình. Hỏng → ném câu KHÔNG trích nội dung file (xem luật 1 ở đầu file). */
function docCauHinh(tep) {
  const s = fs.readFileSync(tep, 'utf8').replace(/^\uFEFF/, '');
  try { return JSON.parse(s); } catch (e) {
    throw new Error('CAU_HINH_VAN_HANH.json không đúng định dạng JSON (thường do sửa tay bằng Notepad sót dấu phẩy hay ' +
      'dấu ngoặc). Mở lại bằng Notepad sửa đúng chỗ, hoặc bấm 1_CAI_DAT_LAN_DAU.bat.');
  }
}

function ngu(ms) { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch (e) { /* không ngủ được thì thôi */ } }

/**
 * Ghi `link_thang[ky] = link` vào file cấu hình: FILE TẠM RỒI ĐỔI TÊN, giữ nguyên BOM / kiểu xuống dòng / thụt lề /
 * thứ tự khóa / mọi khóa khác. Khóa đã có thì ghi đè TẠI CHỖ (không sinh khóa thứ hai); khóa mới nối cuối bảng.
 *
 * Trước khi đè: đọc lại bản tạm, đòi (a) parse được, (b) đúng link vừa ghi, (c) mọi thứ khác y hệt file đang có.
 * Một trong ba lệch → xóa bản tạm, ném lỗi, file thật chưa bị đụng.
 * Ai đó sửa file cấu hình GIỮA lúc đọc và lúc đổi tên (nút 2 gộp khóa mới, Notepad lưu) → không đè lên thay đổi đó:
 * bỏ bản tạm, đọc lại và làm lại MỘT lần; vẫn đổi thì ném lỗi, file thật giữ bản của người kia.
 * @returns {{cu: string|undefined}} link cũ của kỳ đó (nếu có) — để báo "đã thay link cũ", không để in ra
 */
function ghiLinkThang(cfgTep, ky, link) {
  try { return ghiLinkThangMotLan(cfgTep, ky, link); } catch (e) {
    if (!e || e.code !== 'KEODON_DOI_GIUA_CHUNG') throw e;
  }
  try { return ghiLinkThangMotLan(cfgTep, ky, link); } catch (e) {
    if (!e || e.code !== 'KEODON_DOI_GIUA_CHUNG') throw e;
    throw new Error('Không ghi được CAU_HINH_VAN_HANH.json: file đang bị chương trình khác sửa liên tục (Notepad, nút cập nhật). ' +
      'File cấu hình giữ nguyên bản của chương trình đó. Đóng các cửa sổ khác rồi bấm lại.');
  }
}

function ghiLinkThangMotLan(cfgTep, ky, link) {
  const tho = fs.readFileSync(cfgTep, 'utf8');
  const coBom = tho.charCodeAt(0) === 0xFEFF;
  const than = coBom ? tho.slice(1) : tho;
  let obj;
  try { obj = JSON.parse(than); } catch (e) { throw new Error('CAU_HINH_VAN_HANH.json không đúng định dạng JSON — chưa ghi gì.'); }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('CAU_HINH_VAN_HANH.json không phải một object JSON — chưa ghi gì.');
  const crlf = than.indexOf('\r\n') >= 0;
  const coXuongDongCuoi = /\n$/.test(than);
  const mThut = than.match(/\n([ \t]+)"/);
  const thut = mThut ? mThut[1] : 2;

  const bang = (obj.link_thang && typeof obj.link_thang === 'object' && !Array.isArray(obj.link_thang)) ? obj.link_thang : {};
  const cu = Object.prototype.hasOwnProperty.call(bang, ky) ? bang[ky] : undefined;
  bang[ky] = link;
  obj.link_thang = bang;

  let s = JSON.stringify(obj, null, thut);
  if (crlf) s = s.replace(/\n/g, '\r\n');
  if (coXuongDongCuoi) s += crlf ? '\r\n' : '\n';

  const tam = path.join(path.dirname(cfgTep), '.' + path.basename(cfgTep) + '.tam-' + process.pid + '-' + Date.now());
  try {
    fs.writeFileSync(tam, (coBom ? '\uFEFF' : '') + s, 'utf8');
    const docLai = JSON.parse(fs.readFileSync(tam, 'utf8').replace(/^\uFEFF/, ''));
    if (!docLai.link_thang || docLai.link_thang[ky] !== link) throw new Error('bản tạm không mang đúng link vừa ghi');
    // "Mọi thứ khác y hệt": bỏ riêng khóa vừa ghi ở cả hai bản rồi so nguyên chuỗi JSON (so cả thứ tự khóa). Bản gốc
    // chưa có `link_thang` hợp lệ thì coi như `{}` ĐÚNG CHỖ của nó — chính là chỗ bản tạm đặt bảng mới.
    const boKhoa = (x) => {
      const y = JSON.parse(JSON.stringify(x));
      const b = (y.link_thang && typeof y.link_thang === 'object' && !Array.isArray(y.link_thang)) ? y.link_thang : {};
      delete b[ky];
      y.link_thang = b;
      return JSON.stringify(y);
    };
    if (boKhoa(docLai) !== boKhoa(JSON.parse(than))) throw new Error('bản tạm lệch các khóa khác của file cấu hình');
    // Đổi tên: máy quét virus hay giữ file vài trăm mili-giây ngay sau khi ghi — thử lại vài lần trước khi chịu thua.
    for (let lan = 1; ; lan++) {
      if (fs.readFileSync(cfgTep, 'utf8') !== tho) {
        const eDoi = new Error('file cấu hình vừa bị sửa trong lúc ghi');
        eDoi.code = 'KEODON_DOI_GIUA_CHUNG';
        throw eDoi;
      }
      try { fs.renameSync(tam, cfgTep); break; } catch (e) {
        if (lan >= 6 || !/EPERM|EBUSY|EACCES/.test(String(e && e.code))) throw e;
        ngu(150 * lan);
      }
    }
  } catch (e) {
    try { fs.unlinkSync(tam); } catch (e2) { /* bản tạm chưa kịp sinh */ }
    if (e && e.code === 'KEODON_DOI_GIUA_CHUNG') throw e;
    throw new Error('Không ghi được CAU_HINH_VAN_HANH.json (' + (e && e.code ? e.code + ': ' : '') +
      String(e && e.message || e).replace(/[A-Z]:\\[^\s'"]*/g, '<đường dẫn>').slice(0, 160) +
      '). File cấu hình vẫn là bản cũ. Đóng Notepad/Excel đang mở file đó rồi bấm lại.');
  }
  return { cu: cu };
}

// ==================================================================== nguồn câu trả lời

/** `traLoi` là mảng → đọc lần lượt (chạy thử); không có → đọc từng dòng bàn phím. Hết câu trả lời → `null`. */
function taoNguonTraLoi(traLoi) {
  if (traLoi != null) {
    const hang = (Array.isArray(traLoi) ? traLoi : String(traLoi).split('|')).map((x) => String(x));
    return { tuDong: true, doc: () => Promise.resolve(hang.length ? hang.shift() : null), dong: () => { } };
  }
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const hang = [];
  let cho = null, het = false;
  rl.on('line', (l) => { if (cho) { const c = cho; cho = null; c(l); } else hang.push(l); });
  rl.on('close', () => { het = true; if (cho) { const c = cho; cho = null; c(null); } });
  return {
    tuDong: false,
    doc: () => (hang.length ? Promise.resolve(hang.shift()) : het ? Promise.resolve(null) : new Promise((r) => { cho = r; })),
    dong: () => { try { rl.close(); } catch (e) { /* đã đóng */ } }
  };
}

// ==================================================================== chạy

/**
 * @param {Object} tc
 *   vh        thư mục vận hành (chứa bốn nút + thư mục `Cấu hình`)
 *   traLoi    mảng câu trả lời (chạy thử) — không có thì hỏi bàn phím
 *   ra        hàm nhận chuỗi in ra (mặc định stdout)
 *   mau       true/false: tô màu ANSI (mặc định: chỉ khi stdout là cửa sổ thật)
 *   thoiDiem  "bây giờ" (test)
 *   WebApp    lớp thay `WebAppGoogleSheet` (test)
 *   nguongGiay, toiDaLuot   chuyển thẳng cho `taoThangMoi` (test)
 * @returns {Promise<number>} mã thoát — xem đầu file
 */
async function chay(tc) {
  const o = tc || {};
  const raGoc = typeof o.ra === 'function' ? o.ra : (s) => process.stdout.write(s);
  const mau = o.mau != null ? !!o.mau : !!(process.stdout && process.stdout.isTTY);
  const thoiDiem = o.thoiDiem ? new Date(o.thoiDiem) : new Date();
  const WebApp = o.WebApp || gw.WebAppGoogleSheet;
  const MAU = { do: '\x1b[91m', vang: '\x1b[93m', xanh: '\x1b[92m' };

  // Máy che dùng chung cho màn hình và nhật ký: link/ID vừa gõ, chuỗi bí mật + link Web App trong cấu hình, và mẫu chung.
  const cheDs = [];
  const cheThem = (x) => {
    const s = String(x == null ? '' : x).trim();
    if (s.length < 20 || cheDs.indexOf(s) >= 0) return;
    cheDs.push(s);
    const m = s.match(gw.RE_LINK_SHEET);
    if (m && cheDs.indexOf(m[1]) < 0) cheDs.push(m[1]);
    cheDs.sort((a, b) => b.length - a.length);
  };
  const che = (s) => {
    let t = String(s == null ? '' : s);
    cheDs.forEach((x) => { t = t.split(x).join(gw.RE_LINK_SHEET.test(x) ? '<link file tháng>' : '<ID file tháng>'); });
    return t.replace(/https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+[^\s"')]*/g, '<link file tháng>')
      .replace(/https:\/\/script\.google(usercontent)?\.com\/[^\s"')]*/g, '<link Web App>');
  };
  const nhat = [];
  const ra = (s) => raGoc(che(s));
  const inRa = (s, kieu) => {
    const t = che(s == null ? '' : s);
    nhat.push(t);
    raGoc((mau && MAU[kieu] ? MAU[kieu] + t + '\x1b[0m' : t) + '\n');
  };

  const vh = path.resolve(o.vh || '.');
  let cfgTep, cv;
  try {
    cfgTep = timFileCauHinh(vh);
    if (!fs.existsSync(cfgTep)) {
      inRa('LỖI: Không tìm thấy CAU_HINH_VAN_HANH.json. Bấm đúp 1_CAI_DAT_LAN_DAU.bat một lần rồi bấm lại nút 3. Chưa đổi gì.', 'do');
      return 1;
    }
    cv = docCauHinh(cfgTep);
  } catch (e) {
    inRa('LỖI: ' + e.message + ' Chưa đổi gì.', 'do');
    return 1;
  }
  const g0 = cv.google_sheet || {};
  cheThem(g0.chuoi_bi_mat); cheThem(g0.web_app_url);
  const linkThang = (cv.link_thang && typeof cv.link_thang === 'object' && !Array.isArray(cv.link_thang)) ? cv.link_thang : {};
  const thuMucNhatKy = path.resolve(vh, cv.thu_muc_ket_qua || path.join('Cấu hình', 'nhật ký'));

  const ghiNhatKy = (gt, maThoat) => {
    try {
      const x = new Date(thoiDiem.getTime() + 7 * 3600 * 1000);
      const hs = (n) => ('0' + n).slice(-2);
      const nhan = x.getUTCFullYear() + hs(x.getUTCMonth() + 1) + hs(x.getUTCDate()) + '_' + hs(x.getUTCHours()) + hs(x.getUTCMinutes()) + hs(x.getUTCSeconds());
      const dau = ['NÚT 3 — TẠO SỔ THÁNG MỚI — ' + hs(x.getUTCHours()) + ':' + hs(x.getUTCMinutes()) + ' ngày ' + x.getUTCDate() + '/' +
        (x.getUTCMonth() + 1) + '/' + x.getUTCFullYear() + ' (giờ Việt Nam)',
        'Tháng trước: ' + gt.kyCu + ' · Tháng mới: ' + gt.kyMoi + ' · Chế độ: ' + gt.cheDo + ' · Mã thoát: ' + maThoat, ''];
      fs.mkdirSync(thuMucNhatKy, { recursive: true });
      fs.writeFileSync(path.join(thuMucNhatKy, 'LOG_TAO_THANG_' + nhan + '.txt'), '\uFEFF' + dau.concat(nhat).map(che).join('\r\n') + '\r\n', 'utf8');
    } catch (e) { /* không ghi được nhật ký thì thôi — màn hình vẫn đủ câu */ }
  };

  const nguon = taoNguonTraLoi(o.traLoi != null ? o.traLoi : null);
  let luotHienTai = 0, lyDoLuot = '';
  // Dòng lỗi: lượt cuối thì KHÔNG hứa hỏi lại — dòng ngay sau là câu thoát.
  const inLoi = (cau) => { lyDoLuot = 'loi'; inRa(cau + (luotHienTai < SO_LUOT_HOI_TOI_DA ? ' Hỏi lại từ [1/7].' : ''), 'do'); };
  try {
    for (let luot = 1; luot <= SO_LUOT_HOI_TOI_DA; luot++) {
      luotHienTai = luot;
      if (luot > 1) { inRa(''); inRa('Hỏi lại từ đầu — lượt ' + luot + '/' + SO_LUOT_HOI_TOI_DA + '.'); }

      // ---- 1. Bảy trường, kiểm ngay từng trường
      const k = [];
      let loi = null, het = false;
      for (let i = 0; i < 7; i++) {
        ra(CAU_HOI[i]);
        const x = await nguon.doc();
        if (x === null) { het = true; if (nguon.tuDong) raGoc('\n'); break; }
        if (LA_LINK[i]) cheThem(String(x).trim());
        if (nguon.tuDong) raGoc(vangLai(x, LA_LINK[i]) + '\n');
        const kq = KIEM[i](x);
        if (kq.loi) { loi = 'LỖI ' + TEN_TRUONG[i] + ': ' + kq.loi + (LA_LINK[i] ? '' : inLaiAnToan(x)) + '.'; break; }
        k.push(kq);
      }
      if (het) { inRa('Không nhận được câu trả lời nào nữa — dừng. CAU_HINH_VAN_HANH.json không đổi.', 'do'); return 1; }
      if (loi) { inLoi(loi); continue; }

      const gt = {
        thangCu: k[0].gt, namCu: k[1].gt, linkCu: k[2].gt, idCu: k[2].id,
        thangMoi: k[3].gt, namMoi: k[4].gt, linkMoi: k[5].gt, idMoi: k[5].id, cheDo: k[6].gt
      };
      gt.kyCu = gw.kyThangNam(gt.thangCu, gt.namCu);
      gt.kyMoi = gw.kyThangNam(gt.thangMoi, gt.namMoi);

      // ---- 2. Chế độ 1 cần hai tháng khác nhau và hai FILE khác nhau (Web App cũng chặn — chặn trên máy khỏi tốn lượt gọi)
      if (gt.cheDo === 1 && gt.kyCu === gt.kyMoi) {
        inLoi('LỖI [4/7]+[5/7]: tháng mới trùng tháng trước (' + gt.kyMoi + ') — chế độ 1 chuyển sổ từ tháng này sang tháng KHÁC.');
        continue;
      }
      if (gt.cheDo === 1 && gt.idCu === gt.idMoi) {
        inLoi('LỖI [6/7]: link tháng mới là CÙNG MỘT file với link tháng trước [3/7]. Tháng mới phải là bản sao riêng ' +
          '(Tệp → Tạo bản sao, đổi tên, lấy link bản sao).');
        continue;
      }

      // ---- 3. In lại bảy giá trị đã hiểu (không in link) + cảnh báo đối chiếu link_thang
      const idKhai = (ky) => gw.idTuLinkHoacId(linkThang[ky]);
      inRa('------------------------------------------------------------');
      inRa('  DA HIEU DUNG NHU SAU');
      inRa('    [1/7] Tháng trước : ' + gt.thangCu);
      inRa('    [2/7] Năm trước   : ' + gt.namCu + '   → kỳ ' + gt.kyCu);
      inRa('    [3/7] Link trước  : link Google Sheet hợp lệ');
      inRa('    [4/7] Tháng mới   : ' + gt.thangMoi);
      inRa('    [5/7] Năm mới     : ' + gt.namMoi + '   → kỳ ' + gt.kyMoi);
      inRa('    [6/7] Link mới    : link Google Sheet hợp lệ' + (gt.idMoi === gt.idCu ? ', TRÙNG file với [3/7]' : ', khác file [3/7]'));
      inRa('    [7/7] Chế độ      : ' + (gt.cheDo === 1
        ? '1 — tạo/chuyển sổ sang tháng mới trên Google; đủ 8/8 phép tự kiểm mới ghi link'
        : '2 — chỉ khai link tháng mới vào CAU_HINH_VAN_HANH.json, không đụng dữ liệu'));
      inRa('------------------------------------------------------------');
      // Đề bài: link tháng cũ đối chiếu với link_thang[kỳ cũ] — khác → cảnh báo, KHÔNG chặn. So theo MÃ FILE, không so
      // nguyên chuỗi: cùng một file mà đuôi `/edit#gid=0` khác `/edit?usp=sharing` không phải là "khác".
      if (idKhai(gt.kyCu) && idKhai(gt.kyCu) !== gt.idCu) {
        inRa('CẢNH BÁO: link tháng trước [3/7] KHÁC link đang khai cho ' + gt.kyCu + ' trong CAU_HINH_VAN_HANH.json. ' +
          'Tool không chặn — kiểm lại xem có dán nhầm file không trước khi gõ c.', 'vang');
      } else if (!idKhai(gt.kyCu)) {
        inRa('Ghi chú: CAU_HINH_VAN_HANH.json chưa có link tháng ' + gt.kyCu + ' nên không đối chiếu được link [3/7].');
      }
      if (idKhai(gt.kyMoi) && idKhai(gt.kyMoi) !== gt.idMoi) {
        inRa('CHÚ Ý: CAU_HINH_VAN_HANH.json ĐANG có link KHÁC cho ' + gt.kyMoi + ' — làm xong tool sẽ GHI ĐÈ link đó.', 'vang');
      }
      if (gt.cheDo === 2 && gt.idMoi === gt.idCu) {
        inRa('CHÚ Ý: link [6/7] trùng file với [3/7] — một file cho hai tháng. Nút 4 sẽ từ chối ghi nếu tên file không khớp tháng ' + gt.kyMoi + '.', 'vang');
      }
      if (gt.cheDo === 1 && gw.thangSau(gt.kyCu) !== gt.kyMoi) {
        inRa('CHÚ Ý: tháng mới ' + gt.kyMoi + ' không liền sau tháng trước ' + gt.kyCu + '. Tool không chặn — kiểm lại trước khi gõ c.', 'vang');
      }

      // ---- 4. Dung chua? (c/k)
      let xn = null;
      for (let lan = 0; lan < SO_LUOT_HOI_TOI_DA && xn === null; lan++) {
        ra('Dung chua? (c/k): ');
        const x = await nguon.doc();
        if (x === null) { if (nguon.tuDong) raGoc('\n'); break; }
        if (nguon.tuDong) raGoc(vangLai(x, false) + '\n');
        const t = String(x).trim().toLowerCase();
        if (t === 'c' || t === 'co' || t === 'có') xn = 'c';
        else if (t === 'k' || t === 'khong' || t === 'không') xn = 'k';
        else inRa('Chỉ gõ c (đúng rồi, làm đi) hoặc k (chưa đúng, nhập lại).', 'vang');
      }
      if (xn === null) { inRa('Không nhận được c hay k — dừng. CAU_HINH_VAN_HANH.json không đổi.', 'do'); return 1; }
      if (xn === 'k') { lyDoLuot = 'k'; inRa('Bạn trả lời k — chưa làm gì.'); continue; }

      // ---- 5. Làm
      if (gt.cheDo === 2) {
        let kqGhi;
        try { kqGhi = ghiLinkThang(cfgTep, gt.kyMoi, gt.linkMoi); } catch (e) {
          inRa('LỖI: ' + e.message, 'do');
          ghiNhatKy(gt, 1);
          return 1;
        }
        inRa(cauDaGhi(gt.kyMoi, thoiDiem), 'xanh');
        if (kqGhi.cu !== undefined && gw.idTuLinkHoacId(kqGhi.cu) !== gt.idMoi) inRa('  (đã thay link cũ của tháng ' + gt.kyMoi + ')');
        ghiNhatKy(gt, 0);
        return 0;
      }
      const ma = await lamCheDo1(gt);
      ghiNhatKy(gt, ma);
      return ma;
    }
    inRa(lyDoLuot === 'k'
      ? 'Đã ' + SO_LUOT_HOI_TOI_DA + ' lượt, lượt cuối bạn trả lời k — thoát, chưa làm gì. CAU_HINH_VAN_HANH.json không đổi.'
      : 'Đã ' + SO_LUOT_HOI_TOI_DA + ' lượt nhập sai — thoát. CAU_HINH_VAN_HANH.json không đổi.', 'do');
    return 1;
  } finally {
    nguon.dong();
  }

  /** Chế độ 1. Trả mã thoát 0 / 3 / 4 / 5. */
  async function lamCheDo1(gt) {
    let w;
    try {
      w = new WebApp(Object.assign({}, cv.google_sheet || {}, { bat: true, link_thang: linkThang }));
    } catch (e) {
      inRa('LỖI: chế độ 1 cần gọi Web App nhưng cấu hình chưa đủ — ' + e.message + ' Bấm 1_CAI_DAT_LAN_DAU.bat để kiểm. ' +
        'Tool chưa gọi Google, CAU_HINH_VAN_HANH.json không đổi.', 'do');
      return 4;
    }
    if (typeof w.cheThem === 'function') [gt.linkCu, gt.linkMoi].forEach((x) => w.cheThem(x));
    // Lệch bản dựng: CHỈ nói, không chặn (cùng luật nút 4, `inCanhBaoBanDung` của chay-google-sheet.js).
    const inBanDung = (web) => {
      const ds = (web && web.canhBaoBanDung) || [];
      if (!ds.length) return;
      inRa('  ! BẢN TRÊN GOOGLE KHÔNG KHỚP BẢN TRÊN MÁY:', 'vang');
      ds.forEach((c) => inRa('    ! ' + c, 'vang'));
    };
    inRa('Đang chuyển sổ ' + gt.kyCu + ' → ' + gt.kyMoi + ' trên Google. Sổ lớn mất vài phút — ĐỪNG đóng cửa sổ này.');

    let kq;
    try {
      kq = await w.taoThangMoi({
        thangCu: gt.thangCu, namCu: gt.namCu, linkCu: gt.linkCu,
        thangMoi: gt.thangMoi, namMoi: gt.namMoi, linkMoi: gt.linkMoi
      }, {
        nguongGiay: o.nguongGiay, toiDaLuot: o.toiDaLuot,
        khiTienDo: (p, luot) => {
          (p.nhatKy || []).forEach((x) => inRa('  · ' + x));
          if (p.ok && p.xong === false) inRa('  … Google dừng gọn trước trần 6 phút, tool gọi tiếp (lượt ' + (luot + 1) + ').');
        }
      });
    } catch (e) {
      inBanDung(w);
      inRa('KHÔNG TẠO ĐƯỢC THÁNG ' + gt.kyMoi + '.', 'do');
      inRa(typeof w.chePhu === 'function' ? w.chePhu(e.message) : e.message, 'do');
      inRa('link_thang trong CAU_HINH_VAN_HANH.json KHÔNG đổi.');
      return 4;
    }
    inBanDung(w);
    (kq.canhBao || []).forEach((c) => inRa('  ! ' + c, 'vang'));
    if (kq.tenFileCu || kq.tenFileMoi) inRa('File tháng trước: ' + (kq.tenFileCu || '?') + ' · file tháng mới: ' + (kq.tenFileMoi || '?'));
    // Nhãn theo MÃ phép: R-1…R-4 là có dữ liệu mới; R-5 là danh sách sheet lệch — hai việc phải làm khác hẳn nhau.
    const nhanR = (r) => (/^R-[1-4]$/.test(r.ma) ? 'CÓ DỮ LIỆU' : r.ma === 'R-5' ? 'SAI DANH SÁCH SHEET' : 'KHÔNG ĐẠT');
    (kq.lop2 || []).filter((r) => r && !r.dat).forEach((r) => inRa('  ' + r.ma + ' ' + nhanR(r) + '  ' + r.ten + ' — ' + r.chiTiet, 'do'));
    if (Array.isArray(kq.kiem)) {
      const soDat = kq.kiem.filter((p) => p && p.dat === true).length;
      inRa('Tự kiểm ' + soDat + '/' + kq.kiem.length + ' phép:');
      kq.kiem.forEach((p) => inRa('  ' + p.ma + ' ' + (p.dat ? 'ĐẠT ' : 'LỆCH') + '  ' + p.ten + ' — ' + p.chiTiet, p.dat ? null : 'do'));
    }

    // Luật 3: tự đếm lại 8/8 trên máy — cờ `ok` của Web App một mình không đủ để khai link cho nút 4 ghi đơn vào.
    const du8 = kq.ok === true && Array.isArray(kq.kiem) && kq.kiem.length === 8 && kq.kiem.every((p) => p && p.dat === true);
    if (!du8) {
      if (kq.ok === true) {
        inRa('KHÔNG KHAI LINK: Web App báo xong nhưng máy không thấy đủ 8/8 phép tự kiểm ĐẠT.', 'do');
      } else {
        inRa('KHÔNG TẠO ĐƯỢC THÁNG ' + gt.kyMoi + ' [' + (kq.loi || '?') + ']: ' + (kq.thongBao || '') + (kq.goiY || ''), 'do');
      }
      inRa('link_thang trong CAU_HINH_VAN_HANH.json KHÔNG đổi.');
      return 3;
    }
    inRa(kq.thongBao || ('ĐÃ KHỞI TẠO file tháng ' + gt.kyMoi + ' — đủ 8/8 phép tự kiểm.'), 'xanh');
    try { ghiLinkThang(cfgTep, gt.kyMoi, gt.linkMoi); } catch (e) {
      inRa('Google ĐÃ tạo xong tháng ' + gt.kyMoi + ' (8/8) nhưng máy KHÔNG ghi được link: ' + e.message +
        ' Rồi bấm lại nút 3, chọn CHẾ ĐỘ 2 với đúng link [6/7] — ĐỪNG chọn lại chế độ 1.', 'do');
      return 5;
    }
    inRa(cauDaGhi(gt.kyMoi, thoiDiem), 'xanh');
    return 0;
  }
}

module.exports = {
  chay, ghiLinkThang, timFileCauHinh, docCauHinh, taoNguonTraLoi, cauDaGhi,
  kiemThang, kiemNam, kiemLink, kiemCheDo, KIEM, CAU_HOI, TEN_TRUONG, SO_LUOT_HOI_TOI_DA, TIEN_TO_LINK
};

if (require.main === module) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--van-hanh');
  const vh = i >= 0 && args[i + 1] ? args[i + 1] : '.';
  const tl = process.env.TM_TRA_LOI;
  // Lời hứa treo mà vòng sự kiện cạn (kết nối bị cắt kiểu Node không báo lỗi) thì Node tự thoát mã 0 — nút bấm sẽ in
  // XONG trong khi chưa ghi gì. Chặn: cạn vòng sự kiện mà chưa có kết quả là lỗi không đoán trước, mã 9.
  let daCoKetQua = false;
  process.on('beforeExit', () => {
    if (daCoKetQua) return;
    daCoKetQua = true;
    console.log('LỖI KHÔNG ĐOÁN TRƯỚC: tool dừng mà chưa nhận được kết quả (kết nối bị cắt?). link_thang KHÔNG đổi nếu chưa ' +
      'thấy dòng DA GHI ở trên. Bấm lại nút 3.');
    process.exit(9);
  });
  chay({ vh: vh, traLoi: tl ? tl.split('|') : null })
    .then((ma) => { daCoKetQua = true; process.exit(ma); }, (e) => {
      daCoKetQua = true;
      const s = String(e && e.message || e)
        .replace(/https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/[A-Za-z0-9_-]+[^\s"']*/g, '<link file tháng>')
        .replace(/https:\/\/script\.google(usercontent)?\.com\/[^\s"']*/g, '<link Web App>')
        .replace(/[A-Za-z0-9_-]{25,}/g, '<mã>');
      console.log('LỖI KHÔNG ĐOÁN TRƯỚC: ' + s);
      console.log('  Chụp màn hình gửi người phụ trách. CAU_HINH_VAN_HANH.json chưa bị đổi trừ khi dòng DA GHI đã hiện ở trên.');
      process.exit(9);
    });
}
