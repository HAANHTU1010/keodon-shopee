/**
 * gsheet-web-app.js — PHÍA MÁY TÍNH của lớp ghi Google Sheet (GV-v2.2 mục 1.7, phương án C).
 *
 * Máy tính tính xong thì POST một gói JSON tới Web App Apps Script (`src/ShellAppsScript.gs`).
 * Web App chạy bằng quyền của chủ dự án nên mở được file Sheet của mọi tháng, máy này không cần
 * đăng nhập Google, không giữ khóa dịch vụ, không cần quyền chia sẻ.
 *
 * Ba hành động: `ping` (thử cửa) · `doc` (lấy mã đơn đã có + Mapping + tồn kho) · `ghi` (nối dòng).
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
const PHIEN_BAN = '2.3.0';

const TOI_DA_DON_MOT_LO = 200;      // Apps Script chỉ có 6 phút một lần chạy; chia lô cho chắc
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

class WebAppGoogleSheet {
  /**
   * @param {Object} cauHinh { web_app_url, chuoi_bi_mat, bat }
   */
  constructor(cauHinh) {
    const c = cauHinh || {};
    this.url = String(c.web_app_url || '').trim();
    this.biMat = String(c.chuoi_bi_mat || '');
    this.bat = c.bat === true;
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
      req.on('error', (e) => tuChoi(new Error('Không gọi được Web App: ' + this.chePhuBiMat(e.message))));
      req.write(than);
      req.end();

      const docHet = (res) => {
        let buf = '';
        res.setEncoding('utf8');
        res.on('data', (d) => { buf += d; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            return tuChoi(new Error('Web App trả mã ' + res.statusCode + ': ' + this.chePhuBiMat(buf).slice(0, 500)));
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
 * Giữ nguyên hình dạng dữ liệu mà `KeyIn.gs` dùng, chỉ bỏ những gì Web App không cần.
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
  WebAppGoogleSheet, chiaLo, lenhTuDon, TOI_DA_DON_MOT_LO,
  PHIEN_BAN, kiemPhienBan, thongBaoLechPhienBan
};
