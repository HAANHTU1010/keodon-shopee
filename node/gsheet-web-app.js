/**
 * gsheet-web-app.js — PHÍA MÁY TÍNH của lớp ghi Google Sheet (GV-v2.2 mục 1.7, phương án C).
 *
 * Máy tính tính xong thì POST một gói JSON tới Web App Apps Script (`src/ShellAppsScript.gs`).
 * Web App chạy bằng quyền của chủ dự án nên mở được file Sheet của mọi tháng, máy này không cần
 * đăng nhập Google, không giữ khóa dịch vụ, không cần quyền chia sẻ.
 *
 * Bốn hành động: `ping` (thử cửa) · `doc` (lấy mã đơn đã có + Mapping + tồn kho) · `ghi` (nối dòng) ·
 * `xuLy` (gửi thẳng bảng dòng đã qua lớp 1, Web App tự làm lớp 2 + lớp 3 + ghi trong một lần gọi).
 *
 * `xuLy` là đường mặc định từ bản 2.4.0. `doc` + `ghi` GIỮ NGUYÊN làm đường lùi (khóa `duong` trong
 * `CAU_HINH_VAN_HANH.json` → `google_sheet.duong = "ghi"`), vì đó là đường đã nghiệm thu.
 *
 * DỮ LIỆU NGƯỜI MUA (INV-4): gói `xuLy` mang dòng thô của file xuất đi qua mạng, nên trước khi gửi
 * `kiemPII()` soát lại toàn bộ gói — tên trường và giá trị. Có mùi PII là NÉM LỖI, không gửi.
 *
 * CHƯA CHẠY THẬT (07/9/2026): chủ dự án chưa gửi link Web App và chuỗi bí mật. Toàn bộ đường đi
 * đã viết xong và bật được bằng cách điền hai dòng trong `03_VAN_HANH/CAU_HINH_VAN_HANH.json`.
 *
 * BÍ MẬT: chuỗi bí mật chỉ đi trong thân gói POST. Không ghi ra log, không đưa vào thông báo lỗi,
 * không đưa vào tên file. Hàm `chePhuBiMat()` dọn mọi chuỗi trông giống bí mật trước khi in.
 *
 * ĐỐI CHIẾU PHIÊN BẢN (GV-v2.3 mục 2.3): Google KHÔNG tự đồng bộ mã. Sửa `.gs` mà quên
 * Deploy → Manage deployments → New version thì link /exec vẫn chạy bản cũ, KHÔNG báo lỗi gì —
 * bên dự án chứng quyền gọi đây là "lỗi tốn kém nhất của dự án". Với keodon còn nặng hơn: bản `.gs`
 * cũ có thể ghi sai cột vào file tiền thật. Nên mỗi gói gửi lên kèm `phienBanMongDoi`, Web App trả
 * `phienBan` thật của nó, lệch là TỪ CHỐI GHI.
 */
const https = require('https');
const { URL } = require('url');

/** Phải khớp `var PHIEN_BAN` trong `src/ShellAppsScript.gs`. Đổi hợp đồng gói JSON thì đổi cả hai. */
const PHIEN_BAN = '2.4.0';

const TOI_DA_DON_MOT_LO = 200;      // Apps Script chỉ có 6 phút một lần chạy; chia lô cho chắc

/**
 * Lô của `xuLy` cũng 200 đơn — CỐ Ý bằng lô của `ghi`, không nhỏ hơn.
 *
 * `xuLy` làm nhiều việc hơn `ghi` (đọc Mapping + tồn kho, chạy lớp 2), nên thoạt nhìn nên chia nhỏ.
 * Nhưng lớp 2 chạy MỘT LẦN CHO MỖI LÔ, và một tên hàng mới gặp ở lô 1 sẽ được nối vào Mapping ngay;
 * sang lô 2 nó đọc lại Mapping và thấy dòng đó đã có (chưa ai điền) → chữ trong cột Note đổi từ
 * "tên hàng mới — đã thêm dòng vàng…" thành "chưa điền Tên viết tắt… (Mapping dòng N)". Cùng nghĩa,
 * cùng dòng vàng, nhưng KHÁC CHỮ. Chia lô càng nhỏ thì càng nhiều dòng rơi vào ca đó.
 * 200 đơn phủ trọn một lần chạy ngày thường (đo tháng 8: 471 đơn CẢ THÁNG), nên gần như luôn một lô.
 * Web App vẫn tự chặn ở 400 đơn một gói.
 */
const TOI_DA_DON_MOT_LO_XU_LY = 200;

/** Số lần gọi tiếp tối đa khi Web App dừng gọn vì hết giờ. Chặn vòng lặp vô tận nếu có gì đó kẹt. */
const SO_LAN_GOI_TIEP_TOI_DA = 12;

const TIMEOUT_MS = 180000;

/** Nguyên văn câu báo lệch phiên bản. Bản Apps Script (`thongBaoLechPhienBan_`) phải giống hệt từng chữ. */
function thongBaoLechPhienBan(banThuc, banCan) {
  return 'Web App đang chạy bản ' + banThuc + ', tool cần bản ' + banCan +
    ' — hãy triển khai lại (Deploy → Manage deployments → New version).';
}

/**
 * Cổng chặn ghi — HÀM THUẦN, kiểm được không cần mạng.
 * `banThuc` rỗng/không có nghĩa là Web App đang chạy bản CŨ, bản chưa biết trả `phienBan` về.
 * Đó chính là ca nguy hiểm nhất (hỏng âm thầm) nên cũng phải chặn, không được coi là "chắc là ok".
 */
function kiemPhienBan(banThuc, banCan) {
  const can = banCan || PHIEN_BAN;
  const thuc = String(banThuc == null ? '' : banThuc).trim();
  if (thuc === can) return true;
  throw new Error(thongBaoLechPhienBan(thuc || '(không rõ — bản cũ chưa trả phienBan)', can));
}

// ==================================================================== CỔNG CHẶN PII (INV-4)

/**
 * Lược đồ dòng lớp 1 — chép đúng "hợp đồng với lớp 2" ghi ở đầu `src/adapters/AdapterFileXuat.gs`.
 * Đây là DANH SÁCH TRẮNG: gói `xuLy` chỉ được mang đúng chừng này trường. Danh sách đen (9 cột PII)
 * vẫn giữ ở dưới, nhưng một mình nó không đủ — Shopee thêm cột mới tên khác là lọt.
 */
const TRUONG_DONG_LOP_1 = [
  'san', 'maGianHang', 'maDonSan', 'ngayDat', 'trangThai', 'trangThaiRaw', 'skuSan',
  'tenListing', 'tenPhanLoai', 'soLuongListing', 'donGia', 'tienKhachTra',
  'giamGiaShop', 'giamGiaSan', 'phiSan', 'sttDongTrongDon', 'soDongTrongDon', 'tenFileNguon'
];

/** Trường chứa MÃ (đơn, file). Chuỗi ở đây có thể toàn chữ số nên không quét theo mẫu điện thoại. */
const TRUONG_LA_MA = ['maDon', 'maDonSan', 'tenFile', 'tenFileNguon', 'skuSan', 'san', 'maGianHang'];

/**
 * Số điện thoại Việt Nam trong một chuỗi bất kỳ: đúng 10 chữ số bắt đầu bằng 0, hoặc dạng +84/84.
 * Bao bằng (?<![\d]) / (?![\d]) để 14 chữ số của một mã đơn không bị cắt ra thành "số điện thoại".
 */
const RE_DIEN_THOAI = /(?<!\d)(?:0\d{9}|(?:\+?84)\d{9})(?!\d)/;

function chuanTenTruong(s) {
  let t = String(s == null ? '' : s);
  if (typeof t.normalize === 'function') t = t.normalize('NFC');
  return t.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Soát gói TRƯỚC KHI GỬI: dữ liệu người mua không được rời khỏi máy nhân viên (INV-4).
 *
 * Lớp 1 đã lọc sẵn — adapter chỉ đọc cột có tên trong `cfg.cot`, 9 cột người mua không bao giờ vào
 * bộ nhớ. Nhưng từ bản 2.4.0 gói đi QUA MẠNG và nằm lại trong nhật ký của Google, nên phải chốt lại
 * lần nữa ở đây. Ba phép soát, đủ ba mới gửi:
 *   1. danh sách TRẮNG cho từng dòng lớp 1 — trường lạ là dừng, kể cả khi tên nó vô hại;
 *   2. danh sách ĐEN 9 tên cột người mua — quét mọi khóa ở mọi độ sâu của gói;
 *   3. mẫu SỐ ĐIỆN THOẠI trong mọi giá trị chuỗi (trừ các trường mã).
 * Thông báo lỗi chỉ nêu ĐƯỜNG DẪN và TÊN TRƯỜNG, tuyệt đối không nêu giá trị — báo lỗi mà in kèm
 * số điện thoại thì chính câu báo lỗi lại là chỗ rò dữ liệu.
 *
 * @throws {Error} nếu gói có mùi dữ liệu người mua
 */
function kiemPII(goi, cotPII) {
  if (!cotPII || !cotPII.length)
    throw new Error('Chưa nạp danh sách cột thông tin người mua (cfg.cotPII) — từ chối gửi gói lên mạng ' +
      'khi chưa soát được INV-4. Đây là lỗi lập trình, không phải lỗi vận hành.');
  const cam = {};
  cotPII.forEach((c) => { cam[chuanTenTruong(c)] = String(c); });
  const trang = {};
  TRUONG_DONG_LOP_1.forEach((t) => { trang[t] = 1; });
  const laMa = {};
  TRUONG_LA_MA.forEach((t) => { laMa[chuanTenTruong(t)] = 1; });
  const viPham = [];

  const duyet = (x, duong, trongDongLop1) => {
    if (x == null) return;
    if (Array.isArray(x)) { x.forEach((v, i) => duyet(v, duong + '[' + i + ']', trongDongLop1)); return; }
    if (typeof x === 'string') {
      const cuoi = duong.split('.').pop().replace(/\[\d+\]$/, '');
      if (!laMa[chuanTenTruong(cuoi)] && RE_DIEN_THOAI.test(x))
        viPham.push(duong + ' chứa chuỗi trông như số điện thoại');
      return;
    }
    if (typeof x !== 'object') return;
    if (x instanceof Date) return;
    Object.keys(x).forEach((k) => {
      const d = duong ? duong + '.' + k : k;
      if (cam[chuanTenTruong(k)]) viPham.push(d + ' là cột thông tin người mua "' + cam[chuanTenTruong(k)] + '"');
      else if (trongDongLop1 && !trang[k]) viPham.push(d + ' không thuộc lược đồ dòng của lớp 1');
      duyet(x[k], d, trongDongLop1);
    });
  };

  (goi.cacFile || []).forEach((f, i) => {
    duyet({ maGianHang: f.maGianHang, tenFile: f.tenFile }, 'cacFile[' + i + ']', false);
    (f.dong || []).forEach((d, j) => duyet(d, 'cacFile[' + i + '].dong[' + j + ']', true));
  });
  Object.keys(goi).forEach((k) => { if (k !== 'cacFile' && k !== 'token') duyet(goi[k], k, false); });

  if (viPham.length) {
    throw new Error('TỪ CHỐI GỬI — gói có dữ liệu người mua (INV-4), ' + viPham.length + ' chỗ:\n  · ' +
      viPham.slice(0, 20).join('\n  · ') +
      (viPham.length > 20 ? '\n  · … và ' + (viPham.length - 20) + ' chỗ nữa' : '') +
      '\nTool KHÔNG gửi gì lên Google. Kiểm tra lại `cot` trong cấu hình và lớp 1 (AdapterFileXuat.gs).');
  }
  return true;
}

class WebAppGoogleSheet {
  /**
   * @param {Object} cauHinh { web_app_url, chuoi_bi_mat, bat, duong, cotPII }
   *   duong  'xuLy' (mặc định — Web App tự chạy lớp 2, lớp 3) | 'ghi' (đường cũ, máy tự chạy lớp 2, lớp 3)
   *   cotPII danh sách 9 cột thông tin người mua, lấy từ `cfg.cotPII`; thiếu là từ chối gửi
   */
  constructor(cauHinh) {
    const c = cauHinh || {};
    this.url = String(c.web_app_url || '').trim();
    this.biMat = String(c.chuoi_bi_mat || '');
    this.bat = c.bat === true;
    this.duong = chuanDuong(c.duong);
    this.cotPII = c.cotPII || null;
    this.phienBanWebApp = null;      // điền từ phản hồi đầu tiên; null = chưa nói chuyện lần nào
    if (this.bat) {
      if (!this.url) throw new Error('Bật ghi Google Sheet nhưng thiếu web_app_url trong CAU_HINH_VAN_HANH.json');
      if (!this.biMat) throw new Error('Bật ghi Google Sheet nhưng thiếu chuoi_bi_mat trong CAU_HINH_VAN_HANH.json');
      if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(this.url))
        throw new Error('web_app_url phải là link /exec của Apps Script, đang là: ' + this.url);
    }
  }

  /** Xóa dấu vết chuỗi bí mật khỏi một đoạn văn bản trước khi in ra màn hình hay ghi log. */
  chePhuBiMat(text) {
    let s = String(text == null ? '' : text);
    if (this.biMat) s = s.split(this.biMat).join('***');
    return s.replace(/"token"\s*:\s*"[^"]*"/g, '"token":"***"');
  }

  /** Gửi một gói JSON và trả về đối tượng đã phân tích. Ném lỗi với thông báo đã che bí mật. */
  _goi(body) {
    // Soát PII trên TỪNG LÔ, ngay trước khi gói thành chuỗi — không phải một lần lúc dựng kế hoạch.
    // Lô cuối mới dính dữ liệu bẩn là ca hoàn toàn có thật (một file xuất lạ trong lượt nhiều file).
    const hd = String(body && body.hanhDong || '').toLowerCase();
    if (hd === 'ghi' || hd === 'xuly') kiemPII(body, this.cotPII);
    const than = JSON.stringify(Object.assign({ token: this.biMat, phienBanMongDoi: PHIEN_BAN }, body));
    const u = new URL(this.url);
    const opt = {
      method: 'POST', hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(than) },
      timeout: TIMEOUT_MS
    };
    return new Promise((giaiQuyet, tuChoi) => {
      const req = https.request(opt, (res) => {
        // Apps Script trả 302 sang script.googleusercontent.com — phải đi theo, và đi bằng GET.
        if (res.statusCode === 302 && res.headers.location) {
          https.get(res.headers.location, { timeout: TIMEOUT_MS }, (r2) => docHet(r2)).on('error', tuChoi);
          res.resume();
          return;
        }
        docHet(res);
      });
      req.on('timeout', () => { req.destroy(new Error('Web App không trả lời sau ' + (TIMEOUT_MS / 1000) + ' giây')); });
      // Mất mạng giữa chừng (bài D-12). Câu báo phải nói được ba điều, vì đây là lúc người vận hành
      // hoang mang nhất: chuyện gì xảy ra, dữ liệu có sao không, và bấm gì tiếp.
      // Cố ý KHÔNG khẳng định "chưa ghi gì": Apps Script có thể đã ghi xong rồi mới rớt phản hồi
      // (đo được ở bài T-WA-05: 0 lên 9 dòng trong khi máy vẫn báo lỗi). Nói chắc là nói sai.
      req.on('error', (e) => tuChoi(new Error('Không gọi được Web App (' + this.chePhuBiMat(e.message) + '). ' +
        'Gói này CHƯA GHI ĐƯỢC, hoặc chưa biết đã ghi hay chưa. Kiểm tra mạng rồi chạy lại tool: ' +
        'phần đã ghi vẫn giữ nguyên và sẽ không bị ghi trùng.')));
      req.write(than);
      req.end();

      const docHet = (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { buf += d; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            // Lỗi phía Apps Script (bài D-13). Trước đây chỉ đổ 500 ký tự HTML thô của Google;
            // người vận hành đọc `Sorry, unable to open the file at this time` bằng tiếng Anh
            // rồi không biết làm gì. Phải phân biệt được ca quá 6 phút, vì việc phải làm khác hẳn.
            const noiDung = this.chePhuBiMat(buf);
            const quaGio = /Exceeded maximum execution time|thời gian thực thi/i.test(noiDung);
            return tuChoi(new Error('Web App trả mã ' + res.statusCode +
              ' (lỗi phía Apps Script, không phải lỗi cấu hình máy này). ' +
              (quaGio
                ? 'Nguyên nhân: gói chạy quá 6 phút. Việc phải làm: chia nhỏ file thả vào rồi chạy lại. '
                : 'Việc phải làm: chạy lại sau vài phút; vẫn lỗi thì mở dự án Apps Script xem mục Executions ' +
                  'và báo người phụ trách. ') +
              'Tool chưa ghi gì trong lượt này. Nội dung Google trả về: ' + noiDung.slice(0, 300)));
          }
          let kq;
          try { kq = JSON.parse(buf); } catch (e) {
            return tuChoi(new Error('Web App trả về không phải JSON. Thường là do chưa Deploy bản mới, ' +
              'hoặc quyền truy cập chưa để "Anyone". Nội dung: ' + this.chePhuBiMat(buf).slice(0, 300)));
          }
          // Nhớ lại bản THẬT của Web App ngay cả khi phản hồi là lỗi — nhờ vậy `ghi()` chặn được
          // trước khi gửi lô đầu tiên, không phải chờ tới lúc Google trả lời.
          if (kq.phienBan != null) this.phienBanWebApp = String(kq.phienBan);
          if (!kq.ok) {
            // Câu báo lệch phiên bản phải tới tay người dùng NGUYÊN VĂN, không bọc thêm tiền tố
            // "Web App từ chối [...]" — đây là câu duy nhất nói thẳng việc phải làm.
            if (kq.loi === 'LECH_PHIEN_BAN') return tuChoi(new Error(this.chePhuBiMat(kq.thongBao || '')));
            const GOI_Y = {
              SAI_BI_MAT: ' → chuỗi bí mật trong CAU_HINH_VAN_HANH.json khác chuỗi đã cài bằng caiDat() trên Apps Script',
              CHUA_CAI_DAT: ' → mở dự án Apps Script, chạy tay caiDat(<chuỗi bí mật>, <link một file tháng đã có>) một lần rồi Deploy lại',
              KHONG_CO_THANG: ' → thêm dòng cho tháng này vào sheet "Thông tin shop " (dòng 8 trở xuống) rồi chạy lại; tool KHÔNG ghi lùi vào file tháng trước',
              TRUNG_NHIEU_DONG: ' → sheet "Thông tin shop " có hơn một dòng cho cùng một tháng; sửa cho còn đúng một dòng',
              HANH_DONG_LA: ' → phía máy tính và Web App lệch phiên bản; Deploy lại bản mới của ShellAppsScript.gs'
            };
            const goiY = GOI_Y[kq.loi] || '';
            return tuChoi(new Error('Web App từ chối [' + (kq.loi || '?') + ']: ' + this.chePhuBiMat(kq.thongBao || '') + goiY));
          }
          giaiQuyet(kq);
        });
      };
    });
  }

  /**
   * Thử cửa: đúng chuỗi bí mật chưa, đã cài file mỏ neo chưa, máy chủ Google đang là tháng nào,
   * và Web App đang chạy BẢN NÀO (`phienBan`) — số này là thứ để biết đã Deploy lại hay chưa.
   */
  ping() { return this._goi({ hanhDong: 'ping' }); }

  /**
   * Chặn ghi khi lệch bản. Chưa nói chuyện lần nào thì ping một cái trước — thà tốn một lượt gọi
   * còn hơn gửi cả gói tiền cho một bản `.gs` cũ rồi tưởng đã ghi đúng.
   */
  async chotPhienBan() {
    if (this.phienBanWebApp === null) await this.ping();
    return kiemPhienBan(this.phienBanWebApp, PHIEN_BAN);
  }

  /**
   * Lấy về những gì cần để khử trùng và chọn lô TRƯỚC khi ghi.
   * @returns { sheets: {tên: {dongCuoi, maDon}}, mapping, tonKho, canhBao }
   */
  doc(thang, tenSheets, cauHinhGhiDe) {
    return this._goi({ hanhDong: 'doc', thang: thang, sheets: tenSheets || null, cauHinh: cauHinhGhiDe || null });
  }

  /**
   * Ghi các đơn mới, tự chia lô.
   * @param {string} thang  'yyyy-MM' — Web App từ chối nếu khác tháng của ngày chạy
   * @param {Array}  lenh   [{ tenSheet, don: [{maDon, ngay, tien:{H,I,J,K}, dong:[{tenVietTat, soLuong, vang, note}]}] }]
   * @param {Array}  mappingThem  các dòng tên hàng mới cần nối vào sheet Mapping
   */
  async ghi(thang, lenh, mappingThem, cauHinhGhiDe) {
    await this.chotPhienBan();      // lệch bản là dừng TRƯỚC lô đầu tiên, chưa ghi ô nào
    const cacLo = chiaLo(lenh, TOI_DA_DON_MOT_LO);
    const gop = {
      thongKe: { donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0, mappingThem: 0 },
      viTri: {}, canhBao: [], thongBao: [], soLo: cacLo.length, tenFile: '', thang: thang
    };
    for (let i = 0; i < cacLo.length; i++) {
      const kq = await this._goi({
        hanhDong: 'ghi', thang: thang, lo: { so: i + 1, tong: cacLo.length },
        lenh: cacLo[i],
        // tên hàng mới chỉ gửi kèm lô đầu, tránh nối trùng khi có nhiều lô
        mappingThem: i === 0 ? (mappingThem || []) : [],
        cauHinh: cauHinhGhiDe || null
      });
      Object.keys(gop.thongKe).forEach((k) => { gop.thongKe[k] += (kq.thongKe && kq.thongKe[k]) || 0; });
      Object.assign(gop.viTri, kq.viTri || {});
      gop.canhBao = gop.canhBao.concat(kq.canhBao || []);
      gop.thongBao = gop.thongBao.concat(kq.thongBao || []);
      gop.tenFile = kq.tenFile || gop.tenFile;
    }
    return gop;
  }

  /**
   * ĐƯỜNG MẶC ĐỊNH từ bản 2.4.0: gửi thẳng bảng dòng đã qua lớp 1, Web App tự làm lớp 2, lớp 3 và ghi.
   *
   * @param {string} thang    'yyyy-MM'
   * @param {Array}  cacFile  [{ maGianHang, tenFile, dong: [dòng lớp 1] }]
   * @param {Object} tuyChon  { ngayGhi, sheetCuaGian, toiDaDonMotLo, nguongGiay (hai cái cuối chỉ để test) }
   */
  async xuLy(thang, cacFile, tuyChon) {
    const tc = tuyChon || {};
    await this.chotPhienBan();      // lệch bản là dừng TRƯỚC lô đầu tiên, chưa ghi ô nào
    const cacLo = chiaLoTheoDon(cacFile, tc.toiDaDonMotLo || TOI_DA_DON_MOT_LO_XU_LY, tc.sheetCuaGian);
    const gop = {
      thongKe: {
        donGhi: 0, donDaCo: 0, dongGhi: 0, dongVang: 0, donGopO: 0,
        tenMoi: 0, mappingThem: 0, donTrungTrongGoi: 0
      },
      viTri: {}, canhBao: [], thongBao: [], soLo: cacLo.length, soLanGoi: 0,
      tenFile: '', thang: thang, mapTomTat: null
    };

    // Tên hàng mới đã nối vào Mapping ở các lượt trước, mang theo suốt cả lần chạy (qua mọi lô và mọi
    // lượt gọi tiếp). Không mang theo thì chữ trong cột Note đổi giữa lô 1 và lô 2 — xem chú thích
    // `tenMoiTruocDo` trong `src/ShellAppsScript.gs`.
    let tenMoiTruocDo = [];

    for (let i = 0; i < cacLo.length; i++) {
      let con = cacLo[i];
      // Web App dừng gọn khi chạm ngưỡng giờ → gọi tiếp với đúng các gian hàng CHƯA xong.
      // Gửi lại phần đã xong cũng không sinh đơn trùng (hai tầng khử trùng), nhưng tốn giờ vô ích.
      for (let vong = 0; vong < SO_LAN_GOI_TIEP_TOI_DA; vong++) {
        const kq = await this._goi({
          hanhDong: 'xuLy', thang: thang, lo: { so: i + 1, tong: cacLo.length },
          ngayGhi: tc.ngayGhi || null, cacFile: con,
          tenMoiTruocDo: tenMoiTruocDo,
          nguongGiay: tc.nguongGiay == null ? undefined : tc.nguongGiay,
          cauHinh: tc.cauHinhGhiDe || null
        });
        gop.soLanGoi++;
        if (kq.khoaTenMoi) tenMoiTruocDo = kq.khoaTenMoi;
        Object.keys(gop.thongKe).forEach((k) => { gop.thongKe[k] += (kq.thongKe && kq.thongKe[k]) || 0; });
        Object.assign(gop.viTri, kq.viTri || {});
        gop.canhBao = gop.canhBao.concat(kq.canhBao || []);
        gop.thongBao = gop.thongBao.concat(kq.thongBao || []);
        gop.tenFile = kq.tenFile || gop.tenFile;
        gop.mapTomTat = kq.mapTomTat || gop.mapTomTat;
        if (kq.xong !== false) break;

        // Gian hàng nào đã ghi xong thì bỏ khỏi lượt sau. Gian hàng đang dở thì GỬI LẠI NGUYÊN VẸN:
        // hai tầng khử trùng bỏ qua phần đã ghi, nên gửi lại an toàn và đơn giản hơn hẳn việc bắt
        // máy tự đoán xem Web App đã ghi tới đơn nào.
        const xong = {};
        (kq.sheetDaXong || []).forEach((t) => { xong[t] = 1; });
        const conMoi = con.filter((f) => !xong[f.__tenSheet]);
        if (conMoi.length) con = conMoi;

        // Tiến bộ đo bằng SỐ ĐƠN THẬT SỰ GHI THÊM, không đo bằng số file còn lại: một sheet đang dở
        // vẫn nằm nguyên trong danh sách gửi lại, nên số file không giảm dù lượt vừa rồi ghi được 100 đơn.
        // Ghi thêm 0 đơn mà vẫn báo chưa xong nghĩa là kẹt thật — dừng ngay, đừng quay vòng cho hết
        // lượt: quay vòng là ăn hết quota Apps Script của cả ngày mà không ghi thêm ô nào.
        if (!((kq.thongKe && kq.thongKe.donGhi) > 0)) {
          throw new Error('Web App báo chưa ghi xong nhưng lượt gọi vừa rồi không ghi thêm được đơn nào ' +
            '(lô ' + (i + 1) + '/' + cacLo.length + ', còn ' + (kq.sheetConLai || []).length + ' sheet dở). ' +
            'Chạy lại tool: phần đã ghi vẫn giữ nguyên và sẽ không bị ghi trùng.');
        }
        if (vong === SO_LAN_GOI_TIEP_TOI_DA - 1) {
          throw new Error('Đã gọi tiếp ' + SO_LAN_GOI_TIEP_TOI_DA + ' lượt mà Web App vẫn chưa ghi xong lô ' +
            (i + 1) + '/' + cacLo.length + '. Dừng để khỏi ăn hết quota; chạy lại tool sau, không sinh đơn trùng.');
        }
      }
    }
    return gop;
  }
}

/** 'xuly' → 'xuLy', 'ghi' → 'ghi'; rỗng/lạ → 'xuLy' (mặc định). */
function chuanDuong(x) {
  const t = String(x == null ? '' : x).trim().toLowerCase();
  return t === 'ghi' ? 'ghi' : 'xuLy';
}

/**
 * Chia `cacFile` (dòng lớp 1) thành các lô ≤ `toiDa` ĐƠN, GOM THEO GIAN HÀNG trước.
 *
 * Hai luật cứng:
 *  · không bao giờ cắt ngang một đơn — nửa đơn ở lô này, nửa ở lô kia là đơn đó mất ô gộp C/H/I/J/K/L
 *    và hai nửa nằm cách nhau vài chục dòng trong sheet;
 *  · các file của cùng một gian hàng đi liền nhau — lớp 2 chạy một lần cho mỗi lô, gom theo gian hàng
 *    thì một tên hàng mới hiếm khi bị rơi vào hai lô (xem chú thích TOI_DA_DON_MOT_LO_XU_LY).
 * Mỗi phần tử lô mang thêm `__tenSheet` để biết lô nào đã ghi xong khi Web App dừng vì hết giờ.
 */
function chiaLoTheoDon(cacFile, toiDa, sheetCuaGian) {
  const n = Math.max(1, Number(toiDa) || TOI_DA_DON_MOT_LO_XU_LY);
  const theoGian = [];
  const chiMuc = {};
  for (const f of cacFile || []) {
    if (chiMuc[f.maGianHang] == null) { chiMuc[f.maGianHang] = theoGian.length; theoGian.push([]); }
    theoGian[chiMuc[f.maGianHang]].push(f);
  }

  const lo = [];
  let hienTai = [], dem = 0;
  for (const nhom of theoGian) {
    for (const f of nhom) {
      // Gom dòng theo MÃ ĐƠN trước khi cắt. Không dựa vào "các dòng của một đơn nằm liền nhau trong
      // file xuất": chỉ cần Shopee đổi thứ tự xuất một lần là đơn đó bị xẻ đôi sang hai lô, mất ô gộp
      // và nằm cách nhau vài chục dòng. Gom ở đây là gom ỔN ĐỊNH (giữ thứ tự xuất hiện đầu tiên) nên
      // kết quả không đổi so với khi gửi cả file một lượt — `Normalize.xuLy` cũng gom đúng kiểu này.
      const theoDon = [], viTri = {};
      for (const d of f.dong || []) {
        const ma = String(d.maDonSan);
        if (viTri[ma] == null) { viTri[ma] = theoDon.length; theoDon.push([]); }
        theoDon[viTri[ma]].push(d);
      }
      let phan = [], demPhan = 0;
      const chot = () => {
        if (!phan.length) return;
        hienTai.push(gan(f, phan, sheetCuaGian));
        dem += demPhan;
        phan = []; demPhan = 0;
        if (dem >= n) { lo.push(hienTai); hienTai = []; dem = 0; }
      };
      for (const donDS of theoDon) {
        if (dem + demPhan >= n) chot();
        donDS.forEach((d) => phan.push(d));
        demPhan++;
      }
      chot();
    }
  }
  if (hienTai.length) lo.push(hienTai);
  return lo.length ? lo : [[]];
}

function gan(f, dong, sheetCuaGian) {
  const o = { maGianHang: f.maGianHang, tenFile: f.tenFile, dong: dong };
  Object.defineProperty(o, '__tenSheet', {
    value: sheetCuaGian ? sheetCuaGian(f.maGianHang) : (f.__tenSheet || null),
    enumerable: false, writable: true
  });
  return o;
}

/** Chia danh sách lệnh thành nhiều lô, mỗi lô tối đa `toiDa` đơn, không cắt ngang một đơn. */
function chiaLo(lenh, toiDa) {
  const lo = [];
  let hienTai = [], dem = 0;
  for (const l of lenh || []) {
    let con = (l.don || []).slice();
    while (con.length) {
      const lay = con.splice(0, Math.max(1, toiDa - dem));
      hienTai.push({ tenSheet: l.tenSheet, don: lay });
      dem += lay.length;
      if (dem >= toiDa) { lo.push(hienTai); hienTai = []; dem = 0; }
    }
  }
  if (hienTai.length) lo.push(hienTai);
  return lo.length ? lo : [[]];
}

/**
 * Đổi kết quả của lõi (Normalize.xuLy → don[]) thành lệnh ghi cho Web App.
 *
 * BẢN ĐANG DÙNG THẬT là `lenhTuDon_` trong `src/ShellAppsScript.gs` — từ bản 2.4.0 cả hai đường
 * ('xuLy' và 'ghi') đều đi qua bản đó. Bản dưới đây giữ lại cho mã cũ gọi tới, và `test-xu-ly-tren-google.js`
 * có một bài so hai bản trên cùng dữ liệu: lệch một chữ là hỏng test, để hai bản không âm thầm trôi khỏi nhau.
 */
function lenhTuDon(tenSheet, donDS, ngayGhi) {
  return {
    tenSheet: tenSheet,
    don: (donDS || []).map((d) => ({
      maDon: String(d.maDon),
      ngay: ngayGhi || null,
      tien: { H: d.tien.H, I: d.tien.I, J: d.tien.J, K: d.tien.K },
      // Tô vàng khi chưa nhận ra mã (lyDo) HOẶC ghép được nhưng có điều cần biết, ví dụ tồn 0.
      // Đúng một luật với KeyIn.gs để hai vỏ không lệch nhau.
      dong: (d.dong || []).map((x) => ({
        tenVietTat: x.tenVietTat || '',
        soLuong: x.soLuong,
        vang: !!(x.lyDo || x.ghiChu),
        note: x.ghiChu || ''
      }))
    }))
  };
}

module.exports = {
  WebAppGoogleSheet, chiaLo, chiaLoTheoDon, lenhTuDon, chuanDuong,
  TOI_DA_DON_MOT_LO, TOI_DA_DON_MOT_LO_XU_LY, SO_LAN_GOI_TIEP_TOI_DA,
  PHIEN_BAN, kiemPhienBan, thongBaoLechPhienBan,
  kiemPII, TRUONG_DONG_LOP_1, RE_DIEN_THOAI
};
