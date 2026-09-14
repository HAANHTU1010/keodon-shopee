# keodon — kéo đơn Shopee về sổ Google Sheet

Sổ tay người bảo trì. Đọc hết một lượt trước khi sửa dòng mã đầu tiên; phần 6 là nơi tra khi có gì đó
hỏng một cách khó hiểu.

Đề bài và quyết định nghiệp vụ không nằm ở đây mà ở `01_TAI_LIEU/` của dự án:
`00_CONTEXT_TU_DONG_KEO_DON.docx` (bối cảnh), `01_DA_XONG_VA_CHOT.md` (quyết định `D-xx`),
`02_GIAO_VIEC_DEV.md` (việc đang giao). File này chỉ nói về **mã**.

---

## 1. Tool làm gì

Mỗi ngày chủ shop xuất đơn hàng từ Shopee ra file `.xlsx`, thả vào thư mục của gian hàng tương ứng rồi
bấm một nút. Tool đọc file, ghép tên hàng trên sàn sang mã kho nội bộ, tính tiền và thuế, rồi **nối các
dòng đó vào đúng file Google Sheet của tháng** — cùng cái sổ mà chủ shop vẫn gõ tay từ trước.

Bốn gian hàng: Shopee mall, Offood, Importmart, Babyiu. Mỗi tháng một file Google Sheet riêng.

Ba ràng buộc định hình toàn bộ thiết kế, và không thương lượng:

1. **Sổ là của chủ shop, không phải của tool.** Tool chỉ được NỐI dòng mới bên dưới. Không sửa, không xóa,
   không sắp xếp lại, không đụng công thức của người ta. Danh sách đầy đủ ở phần 5 (bất biến INV).
2. **Không đoán.** Không ghép được tên hàng thì tô vàng và ghi chú, để người xem; tuyệt đối không tự chọn
   mã gần đúng. Không biết ghi vào file tháng nào thì dừng, không ghi bừa vào tháng trước.
3. **Không giữ dữ liệu người mua.** File xuất Shopee có tên, số điện thoại, địa chỉ. Chín cột đó không
   được đọc, không được gửi đi, không được in ra. Có một máy soát chặn ngay trước lúc gửi.

---

## 2. Kiến trúc: một lõi, hai vỏ

Nghiệp vụ viết **một lần** bằng JavaScript thuần trong `src/*.gs`, rồi chạy ở hai nơi khác hẳn nhau:

```
                        src/*.gs   ← LÕI, JavaScript thuần, không gọi API nào
                       /         \
        VỎ EXCEL (Node)           VỎ GOOGLE (Apps Script)
        node/*.js                 src/ShellAppsScript.gs
        đọc .xlsx bằng ExcelJS    đọc/ghi bằng SpreadsheetApp
        ghi ra .xlsx              ghi thẳng lên Google Sheet
```

Lõi không `require` gì và không gọi `SpreadsheetApp`. Nhờ vậy vỏ Node nạp được chính file `.gs` mà Google
đang chạy — `node/nap-loi.js` đọc file rồi dựng bằng `new Function`. **Test hỏng nghĩa là mã thật hỏng,
không phải bản mô phỏng viết lại bị lệch.** Đây là tính chất đắt nhất của cả kiến trúc này; đừng đánh đổi
nó để lấy chút tiện tay.

### Ba lớp

| Lớp | Việc | Ở đâu |
|---|---|---|
| **1** | Đọc file xuất của sàn → bảng dòng hàng chuẩn hóa | `src/adapters/AdapterFileXuat.gs` — **chỉ lớp này biết Shopee tồn tại** |
| **2** | Ghép tên hàng → mã kho, hệ số, cấu phần, chọn lô, tính tiền và thuế | `MapListing.gs`, `DanhMuc.gs`, `Normalize.gs` |
| **3** | Dựng kế hoạch ghi và ghi xuống sổ | `KeyIn.gs` (Excel) · `ShellAppsScript.gs` (Google) |

Lớp 2 và 3 **không được biết tên sàn**. Bài `FR-21` trong `npm test` rà 5 file lớp 2/3 tìm tên sàn và 17
tên cột của file xuất; có một chữ là hỏng. Thêm sàn mới thì viết adapter mới, không sửa lớp 2.

### Đường chạy thật hằng ngày

```
file .xlsx  →  lớp 1 trên MÁY  →  POST một gói JSON  →  Web App  →  lớp 2 + lớp 3 TRÊN GOOGLE  →  sổ
```

Từ bản 2.4.0, lớp 2 và lớp 3 chạy **trên Google**, không chạy trên máy user. Lý do: mỗi lần sửa cách tính
thuế mà nghiệp vụ chạy trên máy thì phải đi cập nhật từng máy, và trong lúc đó hai máy cho ra hai kết
quả khác nhau trên cùng một sổ. Nay máy chỉ gửi bảng dòng đã qua lớp 1; hành động là `xuLy`.

Đường cũ `doc` + `ghi` (lớp 2 chạy trên máy) **vẫn giữ** làm đường lùi, bật bằng
`google_sheet.duong = "ghi"`. `node/test-xu-ly-tren-google.js` chạy cả hai đường trên dữ liệu thật và so
**từng ô**: giá trị, công thức, định dạng, màu nền, ô gộp. Lệch một ô là hỏng.

---

## 3. Cây thư mục

```
02_CODE/keodon-apps-script/
  src/                      LÕI + vỏ Google. 11 file này là thứ phải dán lên Apps Script.
    Utils.gs                chuẩn hóa chuỗi, NFC, mã đơn
    Schema.gs               tên cột và hình dạng bảng
    CaiDat.gs               cấu hình mặc định (bản đã Deploy là bản có hiệu lực)
    Config.gs               hợp nhất cấu hình + hàng rào tầng 1 cho cột cấm ghi
    Normalize.gs            chuẩn hóa tên hàng trước khi ghép
    MapListing.gs           bảng ghép tên sàn → mã kho; luật "chỉ dùng dòng CÓ"
    DanhMuc.gs              danh mục hàng, tồn kho, chọn lô
    KeyIn.gs                lớp 3 cho vỏ Excel
    Main.gs                 điều phối vỏ Excel
    TaoThangMoi.gs          lõi chuyển sổ sang tháng mới — Web App hành động `taoThangMoi` gọi vào đây
    ShellAppsScript.gs      VỎ GOOGLE: doPost, 5 hành động (ping/doc/ghi/xuLy/taoThangMoi), mọi hàng rào khi ghi
    adapters/               lớp 1 — nơi duy nhất biết tên sàn
    tests/                  bộ test chạy được cả trong Apps Script

  node/                     VỎ EXCEL + công cụ dev. KHÔNG lên máy user dưới dạng mã nguồn.
    nap-loi.js              nạp src/*.gs vào Node bằng new Function
    gsheet-web-app.js       phía máy của Web App: gói POST, tra link_thang, dịch lỗi sang tiếng người
    gia-lap-web-app.js      Web App giả: chạy CHÍNH src/ShellAppsScript.gs với SpreadsheetApp giả
    chay-thu.js             nút 4 gọi vào đây
    nut-3-thang-moi.js      nút 3 gọi vào đây: hỏi 7 trường, chế độ 1 (gọi `taoThangMoi`) / 2, ghi `link_thang`
    dong-goi.js             dựng gói giao user, tự kiểm, nén ra .zip
    dau-van-tay.js          băm từng file src/ để biết Google đang chạy bản nào
    nghiem-thu.js           bộ nghiệm thu trên dữ liệu thật tháng 8
    test-*.js               16 bộ test, xem bảng ở phần 4
    fixtures/               dữ liệu test đã lọc sạch thông tin người mua

  bat/                      BỐN NÚT BẤM — bản gốc. Xem phần 7.
  package.json              version ở đây phải khớp PHIEN_BAN trong hai vỏ
  moc-nghiem-thu.json       số nghiệm thu thật của shop — KHÔNG lên GitHub
  README.md                 file này
  BAO_CAO_DEV.md            báo cáo đợt hiện hành, ghi đè mỗi đợt
```

Không còn `out/`, `da-xu-ly/`, `du-lieu-vao/`: chế độ DEV cũ tự tạo khi cần, không giữ chỗ trong kho.

---

## 4. Chạy cái gì

```bash
npm install

npm run test-tat-ca      # 16 bộ, phải 0 hỏng — đây là cửa duy nhất trước khi push
npm run nghiem-thu       # đo lại trên dữ liệu thật tháng 8, in bảng số
npm run dong-goi         # dựng gói giao user → 04_BAN_GIAO/Tool_nhap_lieu.zip
npm run dau-van-tay -- --ghi   # tính lại dấu vân tay bản dựng sau khi sửa src/
```

### Bảng bộ test

Số bài lấy từ dòng tổng kết mỗi bộ tự in ra; chạy lại là biết số hiện tại.

| Lệnh | Ký hiệu bài | Canh cái gì |
|---|---|---|
| `npm test` | `T-xx`, `FR-21` | lõi lớp 1–2–3 trong bộ nhớ; lớp 2/3 không biết tên sàn |
| `npm run test-node` | `N-xx` | vỏ Excel trên file thật: đọc, ghi, đổi tên file, khóa chống chạy chồng |
| `npm run test-bat-bien` | `INV-1…INV-11` | các bất biến ở phần 5 (INV-11: trước/sau một lượt ghi trên file DEMO tháng 9 thật) — vi phạm một cái là hỏng cả đợt |
| `npm run test-dinh-tuyen` | `T-DT-xx` | tra `link_thang`, mở file theo ID, kiểm chéo tên file, chống ghi lùi |
| `npm run test-xu-ly` | `T-XL-xx` | hai đường `ghi`/`xuLy` cho ra file giống nhau TỪNG Ô; tô lại tab Mapping |
| `npm run test-web-app` | `T-WA-xx` | lỗi mạng, lệch phiên bản, quyền truy cập, cửa chuỗi bí mật, khóa hai máy |
| `npm run test-chep-cong-thuc` | `T-CT-xx` | chép công thức E/F/L/M/N xuống dòng mới, dấu thời gian ô P1 |
| `npm run test-quyen-mo-file` | `T-QM-xx` | Google từ chối mở/ghi file → câu tiếng Việt nói đúng việc phải làm |
| `npm run test-gia-von-0` | — | bán trúng lô giá vốn 0 → tô vàng + ghi chú |
| `npm run test-nut-van-hanh` | `N-xx` | bốn file `.bat`: ASCII, CRLF, cái bẫy `!`, câu báo lỗi; nút 3 (N-33, N-36…N-42): 7 trường, từng trường sai, khoảng trắng, ghi đè khóa bằng file tạm, chế độ 1 lệch K không ghi link |
| `npm run test-dong-goi` | `DG-xx`, `CN-xx` | gói giao user và nút cập nhật — chạy `.bat` thật bằng `cmd.exe` |
| `npm run test-dau-van-tay` | `DV-xx` | dấu vân tay bản dựng; hằng và hàm mà máy trông đợi ở vỏ Google |
| `npm run test-tao-thang-moi` | `TM-01…TM-12` | chuyển sổ sang tháng mới, đo trên cặp tháng 8→9 thật |
| `npm run test-gian-hang` | `T-GH-xx` | file thả nhầm thư mục gian hàng: luật D-04 trên 12 file xuất thật, và vỏ Google chặn trước khi ghi |
| `npm run test-hop-dong` | `T-HD-xx` | YC-38.1 hợp đồng file tháng: lệch khuôn → `SAI_HOP_DONG` trước lệnh ghi đầu tiên; không chặn oan khuôn thật; Mapping ghi THEO TÊN CỘT |
| `npm run test-dong-run` | `T-RUN-xx` | YC-38.3 dòng tổng kết RUN: RUN id giờ Việt Nam, Web App ghi nhật ký + trả số dòng CÓ và băm Mapping, thả lại cùng file ra cùng dòng |
| `npm run test-tao-thang-moi-web` | `TM-W-xx` | YC-35 hành động `taoThangMoi` trên Web App giả, chạy trên file tháng 9 khuôn mới (bản sao → tháng 10) và tháng 8 thật (TM-01…TM-12); TM-W-19…22 phía máy trọn đường: nút 3 → `WebAppGoogleSheet.taoThangMoi` → Web App giả |

**Luật số một của bộ test: mọi tiêu chí phải có đối chứng âm.** Dựng lại đúng khuyết tật nó phải bắt, rồi
chứng minh phép chấm báo TRƯỢT. Một phép kiểm chỉ có bài ĐẠT là một phép kiểm chưa được kiểm — bệnh này
có tên riêng trong dự án là **TM-10**, theo bài đầu tiên mắc phải: nó chấm "E4/F4/M4/N4 là ARRAYFORMULA"
và ĐẠT trên mọi file, kể cả file không có ô công thức nào.

### `moc-nghiem-thu.json`

`npm run nghiem-thu` so số đo được với mốc trong file này. File chứa doanh thu và giá trị tồn kho thật
nên **không lên GitHub**. Chưa có file thì bộ nghiệm thu vẫn chạy và vẫn in số, chỉ không tự chấm.

Cách dựng lại: chạy một lần không có file, chép các số ở cột "Bản JS" vào một file JSON với các khóa
`thang`, `gian_hang`, `so_dong_doc`, `so_don_doc`, `don_tool_ghi_ban_trong`, `don_co_o_ca_hai_ben`,
`khop_tong_tien_sp`, `khop_mgg_shop`, `khop_chi_phi`, `khop_thue`, `tong_tien_sp_don_chung`,
`dong_vang_luong_v22`, `dong_vang_luong_v1`, `shopee_mall_h3`, `shopee_mall_l3_vung_tool_ghi`,
`o_l_go_tay_trong_vung`, và hai khóa còn lại mà bộ nghiệm thu nêu tên khi thiếu.

---

## 5. Mười bất biến

`npm run test-bat-bien` canh từng cái. Vi phạm một cái là **hỏng cả đợt**, không phải một bài lẻ.

| | Bất biến |
|---|---|
| INV-1 | Không bao giờ sửa hoặc xóa dòng đã có. Số dòng chỉ tăng. |
| INV-2 | Không thêm sheet nào ngoài `Mapping_san_pham`. |
| INV-3 | Không ghi giá trị vào cột E, F, L, M, N — đó là công thức của chủ shop. |
| INV-4 | Không đọc, không ghi, không in 9 cột thông tin người mua. |
| INV-5 | Không ghi đè file gốc. |
| INV-6 | Không tự sửa công thức của người. |
| INV-7 | Không in chuỗi bí mật, link Web App, link hay ID file tháng ra màn hình / nhật ký / báo cáo. |
| INV-8 | Dòng tổng (dòng 3) không bị đụng. |
| INV-9 | Không sửa test để cho qua. |
| INV-10 | File xuất chỉ rời thư mục thả **sau khi** Google đã ghi xong. |

INV-10 nói lại cho rõ, vì nó là luật đắt nhất: `chay-thu.js` chỉ gọi `danhDauDaXuLy` **sau** khi
`await chayLenGoogleSheet()` trả về thành công. Chạy hỏng thì file nằm nguyên chỗ cũ để bấm lại. Đảo hai
dòng đó là sinh ra ca mất đơn mà không ai biết — file đã đi khỏi thư mục thả, mà sổ thì chưa có gì.

---

## 6. Bẫy kỹ thuật

### 6.1. ExcelJS

- **Công thức chia sẻ**: đọc file có `shared formula` rồi ghi lại, ExcelJS ném lỗi. Phải dịch về công thức
  thường trước khi ghi.
- **`ws._merges` không phải danh sách vùng gộp** mà là map từng ô → vùng. Đếm `Object.keys` ra số ô, không
  ra số vùng.
- **Một đối tượng style dùng chung nhiều ô**: sửa style một ô là sửa luôn các ô khác đang trỏ cùng đối
  tượng. Phải clone trước khi sửa.
- **Ngày đi theo UTC** trong ExcelJS còn lõi đi theo giờ địa phương. Lệch múi giờ làm lùi một ngày.
- **Ghi giá trị TRƯỚC khi gộp ô.** Gộp trước thì giá trị ghi vào ô con bị mất.

### 6.2. File xuất Shopee

- **Ba thứ file xuất KHÔNG có**, và đó là lý do tồn tại của lớp 2: không có mã kho nội bộ, không có giá
  vốn, không có số lượng quy đổi. Toàn bộ việc ghép mã sinh ra từ chỗ thiếu này.
- **Tiêu đề dùng dấu tổ hợp** → phải `Utils.nfc` trước khi so tên cột.
- **So tên cột thì trim và NFC, KHÔNG lowercase**: file thật có hai cột chỉ khác hoa/thường và mang số
  khác nhau (bài `N-21` đo được lệch 10/12 dòng). Lowercase là gộp nhầm hai cột đó.
- **`<dimension ref="A1">` trong file xuất là SAI** — không được tin, phải tự dò vùng dữ liệu.
- **Ô trống trong file tab "Tất cả" ghi là `"-"`**, không phải chuỗi rỗng.
- **Làm tròn tiền phải cộng epsilon**, nếu không `Math.round` lệch 1 đồng ở số `.5` do sai số nhị phân.

### 6.3. Ghi lên Google Sheet

- **E, F, M, N là công thức TỪNG DÒNG**, mỗi ô một công thức bọc `ARRAY_CONSTRAIN(...;1;1)`. **KHÔNG phải
  ARRAYFORMULA một ô phủ cả cột.** Ai đọc tài liệu cũ thấy câu "ARRAYFORMULA một ô, ghi vào là hỏng cả
  cột" thì bỏ qua: đã đo lại trên file thật và câu đó sai. Tool **chép công thức của dòng trên xuống dòng
  mới** cho cả năm cột E, F, L, M, N.
- **Vẫn không được ghi GIÁ TRỊ vào E/F/M/N** (INV-3). Hai việc khác nhau: chép công thức thì được, ghi số
  thì không. Hàng rào `kiemCotDuocGhi_` ở đầu `ghiMotSheet_` là cửa duy nhất mọi chỉ số cột phải đi qua,
  và danh sách cửa dựng từ `Config.KEYIN_COT` chứ không gõ tay — gõ tay thì khóa cột thêm sau này tự động
  lọt, và không ai biết cho tới lúc một lượt ghi đè lên công thức của chủ shop.
- **Cột L nằm trong ô gộp**, chỉ giữ công thức ở dòng trên cùng của đơn. Ghi vào ô gộp con là sinh dữ liệu
  mồ côi.
- **Sửa `.gs` xong PHẢI Deploy bản mới.** Lưu thôi là chưa đủ: link `/exec` vẫn chạy bản đã deploy, và
  Google không báo gì cả. Đây là cái bẫy tốn thời gian nhất của cả dự án. Deploy → Manage deployments →
  bút chì → Version: **New version** → Deploy. Hai lớp canh: `PHIEN_BAN` hai vỏ phải bằng nhau, và dấu vân
  tay bản dựng (`BAN_DUNG`) so băm từng file.
- **Web App để access "Anyone"** vì user không đăng nhập Google khi bấm nút. Cửa khóa bằng **chuỗi bí
  mật** trong mỗi gói POST, so bằng SHA-256 hai phía. Gói giao user mang sẵn chuỗi — nên **gói là thứ
  phải giữ**, chỉ đi kênh nội bộ.
- **Giới hạn 6 phút.** Lô 200 đơn, khối 100 dòng, tự dừng ở ngưỡng 240 giây rồi báo máy gọi tiếp. Tô màu
  phải gọi `setBackgrounds` một lần cho cả vùng; tô từng ô là nguyên nhân số một gây hết giờ.
- **Tạo tháng chờ 400 giây mỗi lượt, không phải 180.** `taoThangMoi` tự dừng gọn ở 270 giây, và bước dở
  được lượt sau chạy TỚI CÙNG không canh giờ (`buocDungTruoc`) — một lượt có thể đi sát trần 6 phút. Chờ 180 giây như
  kéo đơn là máy báo "không trả lời" trong khi Google vẫn đang chuyển sổ (`TIMEOUT_TAO_THANG_MS`, bài TM-W-19).
- **Chuỗi trông như ngày bị Google đổi kiểu.** `setValues([['2026-10']])` vào ô chưa ép `@` là thành ngày 01/10/2026.
  Ô cờ `THANG` (O2) của tạo tháng vì thế ghi với định dạng `@` ĐẶT TRƯỚC giá trị (`ghiKhoiO_`), và lõi đọc cờ qua
  `chuanThangCo` (Date → `yyyy-MM`). Giả lập chỉ bắt chước bẫy này khi bật `taoGiaLap({ epNgayNhuGoogle: true })` — bài TM-W-24.
- **Định tuyến tháng nằm trên MÁY** (`link_thang` trong `CAU_HINH_VAN_HANH.json`), không nằm trên Google.
  Máy gửi `spreadsheetId` trong gói. Không có link của tháng đang chạy thì **dừng**, không ghi lùi vào
  tháng trước. Web App còn kiểm chéo tên file với tháng và từ chối nếu lệch.

### 6.4. Vỏ vận hành trên Windows

- **File `.bat` phải là ASCII thuần và xuống dòng CRLF.** `cmd.exe` đọc `.bat` theo bảng mã hệ thống chứ
  không theo UTF-8: chữ có dấu viết thẳng trong `.bat` hiện thành ký tự rác và có thể làm hỏng câu lệnh.
  Chữ tiếng Việt có dấu nằm trong mã Node, không nằm trong `.bat`.
- **`chcp 65001 >nul` ở đầu file `.bat`** là để **đầu ra của Node** hiện đúng tiếng Việt, không phải để
  cho chữ trong `.bat` có dấu.
- **Dấu `!` bị `cmd.exe` nuốt** trong khối `setlocal enabledelayedexpansion`. Câu báo lỗi có dấu chấm than
  sẽ mất chữ mà không báo gì.
- **File văn bản cho người dùng ghi kèm BOM** (`LOG_*.txt`, `.csv`), nếu không Notepad và Excel mở ra
  thành ký tự rác. Ngược lại **`CAU_HINH_VAN_HANH.json` phải cắt BOM trước khi `JSON.parse`** — Notepad
  hay lưu kèm BOM và làm parse chết.
- **Sửa file trên máy user: ghi file tạm rồi đổi tên**, không bao giờ mở file đích bằng chế độ ghi. Đứt
  giữa chừng thì bản cũ còn nguyên, thay vì thành một file hỏng nửa vời.

---

## 7. Bốn nút bấm

`bat/` trong kho mã là **bản gốc**. `03_VAN_HANH/` trên máy chủ dự án là một bản cài đặt như mọi máy
khác, đồng bộ bằng `node node/dong-goi.js --dong-bo-van-hanh`. Đừng sửa `03_VAN_HANH/` rồi mong nó tự về
kho: chiều đi là `bat/` → `03_VAN_HANH/`, và `DG-06` bắt mọi khác biệt dù chỉ một byte.

| Nút | Việc |
|---|---|
| `1_CAI_DAT_LAN_DAU.bat` | 6 bước kiểm: Node, mã nguồn, thư viện, cấu hình, gọi thử Web App, kết luận |
| `2_CAP_NHAT.bat` | tải bản mã mới nhất từ GitHub. **Không bao giờ ghi đè `CAU_HINH_VAN_HANH.json`** — chỉ THÊM khóa còn thiếu |
| `3_TAO_FILE_THANG_MOI.bat` | hỏi 7 trường. Chế độ 1: chuyển sổ trên Google (`taoThangMoi`), đủ 8/8 phép K mới khai `link_thang`. Chế độ 2: chỉ khai `link_thang`, không gọi mạng. File `.bat` chỉ tìm cấu hình/mã/Node rồi gọi `node/nut-3-thang-moi.js` |
| `4_CHAY_TOOL.bat` | nút dùng hằng ngày |

Nút 2 không tự ghi đè chính nó — Windows khóa file `.bat` đang chạy. Nó in một dòng nhắc thay vì chép.

Gói giao user (`npm run dong-goi`) mang bốn nút, thư mục thả file, cấu hình **đầy đủ giá trị thật**, bản
Node xách tay và một trang hướng dẫn. Không mang `src/` và `node/`: mã tới máy user bằng **một đường duy
nhất** là nút 2, nên không thể có chuyện máy này một bản, máy kia một bản.

---

## 8. Trước khi push

1. `npm run test-tat-ca` → 0 hỏng. Không sửa test để cho qua.
2. Sửa `src/*.gs` → `npm run dau-van-tay -- --ghi`.
3. Tăng `version` trong `package.json` (nút 2 chỉ tải khi số lớn hơn) và `PHIEN_BAN` trong **cả hai** vỏ.
4. Đổi `.gs` thì nêu rõ trong `BAO_CAO_DEV.md` để chủ dự án dán lại và Deploy **trước khi** user bấm nút 2.
5. Kho này **công khai**. Không link `/exec`, không chuỗi bí mật, không link file tháng, không số liệu
   thật của shop. `INV-7` quét mỗi lượt chạy test, nhưng đừng dựa vào nó thay cho việc tự nhìn lại.
