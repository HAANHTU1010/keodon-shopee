# Kéo đơn Shopee và TikTok Shop lên Google Sheet — hướng dẫn một trang

> **GÓI NÀY CHỨA KHÓA GHI VÀO GOOGLE SHEET: KHÔNG ĐĂNG CÔNG KHAI, KHÔNG GỬI CHO NGƯỜI NGOÀI.**
> Ai có thư mục này là ghi thẳng được vào sổ tiền của shop. Chỉ chép qua kênh nội bộ, không đính kèm email,
> không để trên OneDrive, Google Drive hay Dropbox dùng chung.

Bạn không phải hiểu tool. Bạn chỉ cần thả file đúng chỗ rồi bấm một nút.

---

## Thư mục này có đúng sáu thứ: hai thư mục và bốn nút

| Bấm vào đâu | Để làm gì |
|---|---|
| **`1_THA_FILE_XUAT\`** | Chỗ thả file xuất của sàn. Bên trong có **năm** thư mục gian hàng: bốn gian Shopee và `TikTok Shop` (máy cài từ gói cũ: thư mục `TikTok Shop` tự hiện ra sau lần bấm `4_CHAY_TOOL.bat` đầu tiên của bản mới) |
| **`Cấu hình\`** | Ruột của tool. **Bình thường không phải mở.** Cài đặt, mã và nhật ký nằm trong đó |
| **Bốn file `.bat`** | Bốn cái nút. Bấm đúp là chạy |

| Nút | Khi nào bấm |
|---|---|
| **`1_CAI_DAT_LAN_DAU.bat`** | Đúng **một lần**, lúc mới giải nén lên máy |
| **`2_CAP_NHAT.bat`** | Khi người phụ trách **báo có bản mới**. Không ai báo thì không cần bấm |
| **`3_TAO_FILE_THANG_MOI.bat`** | **Đầu tháng**, khi có sổ của tháng mới |
| **`4_CHAY_TOOL.bat`** | **Mỗi ngày**. Đây là nút bạn dùng |

---

## Lần đầu trên máy mới

1. Giải nén gói ra một thư mục trên máy, ví dụ `Desktop`.
2. Bấm đúp **`1_CAI_DAT_LAN_DAU.bat`**. Nó tự kiểm sáu bước và báo bằng tiếng Việt.
3. Thấy dòng **`[6/6] SAN SANG.`** là xong.

**Bạn không phải điền gì cả.** Gói đã có sẵn link Google Sheet, chuỗi bí mật và link sổ của các tháng.

Lần đầu chạy, nút này **tự tải mã của tool từ trên mạng về** nên hơi lâu một chút. Cứ để nó chạy.

---

## Shopee — mỗi ngày, ba bước

1. Trên Kênh Người Bán Shopee, vào **Đơn hàng → Chờ lấy hàng**, bấm **Xuất**, tải file về.
2. Thả file vừa tải vào `1_THA_FILE_XUAT\` rồi vào **đúng thư mục gian hàng**. Tên thư mục **giống hệt tên sheet trên Google**:

   `Shopee mall`   ·   `Offood`   ·   `Importmart`   ·   `Babyiu`

3. Bấm đúp **`4_CHAY_TOOL.bat`**. Đợi vài giây rồi đọc dòng tổng kết.

Chạy xong, **tool tự chuyển file vừa đọc vào `1_THA_FILE_XUAT\<gian hàng>\đã xử lý\`**. Bạn không phải dọn tay.

> **Thả nhầm thư mục là đơn ghi nhầm sổ.** File xuất của Shopee không có cột nào cho biết đơn thuộc gian hàng nào. Tool đối chiếu tên hàng với bảng Mapping, thấy file giống hẳn gian khác thì **dừng và không ghi** — nhưng nhìn kỹ tên thư mục trước khi thả vẫn là cách chắc nhất.

Bấm lại `4_CHAY_TOOL.bat` bao nhiêu lần cũng được. Đơn đã ghi sẽ bị bỏ qua, **không bao giờ ghi trùng**.

---

## TikTok Shop — mỗi ngày, hai bước

1. Trên TikTok Seller Center, vào **Tài chính → Giao dịch → tab đơn hàng chưa quyết toán**, bấm **Xuất**, chọn khoảng **từ ngày 1 của tháng đến hôm nay**, tải file về. File tên bắt đầu bằng `Onhold-unsettled-orders...`
2. Thả file vào `1_THA_FILE_XUAT\TikTok Shop\` rồi bấm đúp **`4_CHAY_TOOL.bat`** như mọi ngày. Một lượt chạy làm cả Shopee lẫn TikTok.

Lấy khoảng thời gian rộng không sao: đơn đã ghi rồi tool tự bỏ qua, **không bao giờ ghi trùng**. Lấy hẹp quá mới là sót đơn.

Chọn định dạng **Excel (.xlsx)** khi xuất — file CSV tool không đọc. **Đừng mở file rồi lưu lại bằng Excel**: Excel đổi mã đơn 18 chữ số thành số, tool sẽ dừng, không ghi.

> ### 🔴 TikTok phải chạy hằng ngày, không được để cách quá 2 ngày
> Shop này đang ở chu kỳ quyết toán nhanh (3 ngày). **Đơn nào TikTok trả tiền xong là rời khỏi tab đó và không xuất lại được nữa** — để lâu là mất đơn khỏi sổ, không có cách nào lấy lại ở bản này.
> Số đo thật ngày 15/9: file xuất cho khoảng 01/09–15/09 chỉ còn **130 dòng**, đơn cũ nhất là 03/09; các ngày 06, 07, 08 mỗi ngày chỉ còn 2 đơn, trong khi ngày 14 và 15 còn gần đủ. Đơn cứ rụng dần như vậy.
> Nếu lỡ nghỉ dài ngày, **báo người phụ trách ngay**, đừng tự chạy rồi coi như xong.

**Cột `Ngày` là ngày bạn bấm nút**, đúng như bên Shopee — không phải ngày khách đặt. Chạy đều mỗi ngày thì hai thứ đó gần như trùng nhau.

### Ba thứ tool tự làm với đơn TikTok, không cần bạn động tay

- **Một đơn nổ thành nhiều dòng.** Một đơn gấu bông = con gấu + áo + túi quà + thiệp. Tool tự tách đúng số dòng và gộp ô tiền cho cả cụm, giống hệt đơn combo bên Shopee.
- **Bỏ qua đơn không phải đơn bán.** Đơn đã hủy, đơn chưa chốt tiền và đơn khách đang đòi trả hàng thì tool **không ghi**, chỉ nhắc ở dòng tổng kết. Không trừ kho oan. Đơn nào sau đó bán thật, có tiền, thì lượt chạy sau tự vào sổ.
- **Lấy đúng số tiền của TikTok.** Tool không tự tính lại phí và thuế, nó chép nguyên số TikTok đã chốt. Cột `Doanh Thu` của sổ tự ra đúng số tiền TikTok sẽ trả về.

Tool ghi vào sheet **`TikTok Shop`**. **Không nhập tay vào sheet `Tiktok` đang ẩn**: `Lợi nhuận` cộng cả hai sheet, có số ở cả hai là doanh số bị cộng hai lần.

### Lượt chạy TikTok đầu tiên: hai điều cần biết

**Một — Mapping phải có dòng TikTok trước khi chạy.** TikTok dùng chung tab `Mapping_san_pham` với Shopee. Người phụ trách sẽ dán sẵn 14 dòng trước khi bàn giao; nếu mở sổ mà cột `Gian hàng` chưa có dòng nào ghi `TikTok Shop` thì **dừng lại, báo người phụ trách, đừng chạy**. Tool không bao giờ sửa dòng đã ghi, nên chạy lúc Mapping còn trống là các đơn đó nằm gộp một dòng vàng, điền Mapping sau cũng không cứu được, phải xóa tay rồi chạy lại.

**Hai — lượt đầu kéo cả đơn cũ về cùng một ngày.** File tài chính chứa mọi đơn chưa quyết toán của cả nửa tháng, nên lượt chạy đầu tiên khoảng **50 đơn** từ đầu tháng tới nay sẽ cùng mang ngày bạn bấm nút. Từ lượt thứ hai trở đi chỉ còn đơn mới nên không lặp lại nữa. Muốn cột `Ngày` của 50 đơn đó đúng ngày thật thì sửa tay một lần, hoặc bỏ qua vì tổng tiền không đổi.

### Lỗi hay gặp riêng của TikTok

| Cửa sổ đen báo | Làm gì |
|---|---|
| `SỐ DÒNG ĐỌC ĐƯỢC KHÔNG KHỚP Ô "TỔNG SỐ GIAO DỊCH"` | File tải về lỗi hoặc đã bị mở ra sửa. Tải lại file mới từ TikTok, **đừng mở ra chỉnh** |
| `BỎ QUA … ĐƠN KHÔNG PHẢI ĐƠN BÁN` | Không phải lỗi. Đó là đơn hủy, đơn chưa chốt tiền hoặc đơn đang chờ trả hàng |
| `KHÔNG CÓ FILE MỚI` | Chưa thả file, hoặc file lần trước đã sang `đã xử lý` |
| `TU_KIEM_LECH` | Tiền trong báo cáo không khớp công thức — tool **không ghi đơn TikTok nào**. Gửi file cho người phụ trách, trong lúc chờ nhập tay như cũ |
| `THẢ NHẦM SÀN` | Báo cáo TikTok nằm trong thư mục gian Shopee, hoặc file Shopee nằm trong thư mục `TikTok Shop`. Chuyển file về đúng chỗ rồi bấm lại. Tool chưa ghi gì |
| `LỖI TIKTOK SHOP: …` | Phần TikTok không xong nhưng **bốn gian Shopee vẫn chạy bình thường**. Đọc câu sau dấu hai chấm; file TikTok nằm nguyên trong thư mục để bấm lại |
| `THIẾU … cột bắt buộc` | TikTok đổi tên cột trong file xuất. Báo người phụ trách, đừng tự sửa |
| `mã đơn đã bị đổi thành SỐ` | File TikTok đã bị mở rồi lưu bằng Excel. Xuất lại từ TikTok, thả thẳng vào thư mục |
| `bản này KHÔNG dùng file này` / `CHƯA dùng báo cáo "Đã quyết toán"` | Bạn thả nhầm file khác (`Tất cả đơn hàng...` hoặc `income_...`). Tool không ghi gì từ file đó — rút ra khỏi thư mục |

## Đầu tháng: tạo sổ của tháng mới

**Trước khi bấm nút:** mở sổ của tháng trước trên Google, vào **File → Tạo bản sao**, đặt tên theo mẫu `THÁNG-10-2026-KINH-DOANH`, rồi mở bản sao đó ra và copy link trên thanh địa chỉ.

Bấm đúp **`3_TAO_FILE_THANG_MOI.bat`**. Nó hỏi đúng bảy câu:

```
[1/7] Thang truoc (1-12):
[2/7] Nam truoc (vd 2026):
[3/7] Link file Google Sheet thang truoc:
[4/7] Thang moi (1-12):
[5/7] Nam moi (vd 2026):
[6/7] Link file Google Sheet thang moi:
[7/7] Che do: 1 hoac 2
```

| Chế độ | Làm gì | Khi nào chọn |
|---|---|---|
| **1** | Chuyển sổ: mang tồn cuối tháng trước sang làm tồn đầu kỳ, đẩy cột `Lợi nhuận`, dọn đơn cũ ở các sheet gian hàng, `TikTok Shop` và `Chi Phí Hàng Ngày`, rồi ghi link | Sổ tháng mới **vừa tạo bản sao**, chưa ai gõ gì vào |
| **2** | **Chỉ khai link** tháng mới cho máy này, không đụng vào dữ liệu | Sổ tháng mới đã được làm xong ở máy khác, hoặc bạn chỉ cần đổi link |

- Gõ sai một câu thì nó báo câu nào sai rồi **hỏi lại từ đầu**. Sai ba lượt thì nó thoát, không đổi gì.
- Trước khi làm, nó in lại bảy giá trị và hỏi `Dung chua? (c/k)`. Gõ `c` mới làm, gõ `k` để nhập lại. Link không in ra màn hình, chỉ báo "hợp lệ".
- Chế độ 1 cần mạng và mất vài phút với sổ lớn — **đừng đóng cửa sổ**. Nó tự kiểm tám phép so trước khi báo xong. **Lệch một phép là dừng, không ghi link.**
- Xong thì cửa sổ in `DA GHI link thang …`. Từ ngày đầu tháng đó, `4_CHAY_TOOL.bat` ghi đơn vào sổ mới.
- Chế độ 1 báo `KHÔNG TẠO ĐƯỢC THÁNG … [DA_KHOI_TAO]` nghĩa là sổ đó đã được chuyển xong từ trước (ở máy khác, hoặc lượt trước mạng rớt): bấm lại, chọn **chế độ 2**. Báo `[SAI_THANG_FILE]` thì đổi tên bản sao cho đúng tháng rồi chạy lại **chế độ 1**.

---

## Nhìn gì sau khi chạy

- **Dòng vàng** ở sheet gian hàng nghĩa là tool chưa biết mặt hàng đó là mã nào. Đọc cột **`Note`** ở ngoài cùng bên phải để biết lý do.
- Sang tab **`Mapping_san_pham`**, tìm dòng vàng, điền **Tên viết tắt** (đúng chữ đang dùng ở cột D của `Tổng tồn kho`), điền **Hệ số** nếu một lần bán bằng nhiều đơn vị kho, rồi gõ **CÓ** ở cột **Xác nhận**. Lần chạy sau dòng đó tự trắng lại.
- Hàng mix vị, combo, hoặc có tặng kèm thì điền cột **Cấu phần** theo mẫu `Vani Hộp x 12; HỘP YG x 12`.

---

## Ba điều tool không bao giờ làm

- **Không sửa dòng đã có.** Chỉ thêm dòng mới ở cuối. Số bạn gõ tay không bị đụng tới.
- **Không đoán mã hàng.** Chưa chắc thì tô vàng cho người xem.
- **Không chuyển file đi khi chưa ghi xong.** Chạy hỏng giữa chừng thì file xuất vẫn nằm nguyên trong thư mục thả, bấm lại là chạy tiếp.

---

## Lưu ý bảo mật — đọc một lần

- **Thư mục `1_THA_FILE_XUAT`** chứa file xuất của sàn (Shopee và TikTok), trong đó có tên, số điện thoại và địa chỉ người mua. Không đồng bộ lên đám mây, không gửi ra ngoài.
- **Thư mục `Cấu hình`** có file `CAU_HINH_VAN_HANH.json` chứa **chuỗi bí mật** và **link sổ của mọi tháng**. Ai có hai thứ đó là ghi được vào sổ.
- Chụp màn hình gửi đi thì che kín dòng `chuoi_bi_mat`.

Bản thân tool **không đọc, không ghi, không gửi đi** một cột thông tin cá nhân nào của người mua.

---

## Khi thấy báo lỗi

Đọc dòng bắt đầu bằng `LỖI:` — trong đó luôn có câu chỉ việc phải làm. Hay gặp nhất:

| Cửa sổ đen báo | Làm gì |
|---|---|
| `KHÔNG CÓ FILE MỚI` | Không phải lỗi. Chưa thả file, thả sai thư mục, hoặc file lần trước đã sang `đã xử lý` |
| `FILE NÀY GIỐNG GIAN …, ĐANG THẢ VÀO …` | File bị thả nhầm thư mục gian hàng. Kéo file sang đúng thư mục rồi bấm lại. Tool chưa ghi gì |
| `CHƯA CÓ LINK FILE THÁNG …` | Sang tháng mới mà máy này chưa khai link. Bấm `3_TAO_FILE_THANG_MOI.bat` |
| `KHÔNG TẠO ĐƯỢC THÁNG …` (nút 3) | Link tháng **không** bị đổi. Đọc câu sau dấu `→` — nó nói đúng việc phải làm |
| `MA CUA TOOL TREN MAY NAY LA BAN CU` (nút 3) | Bấm `2_CAP_NHAT.bat` một lần rồi bấm lại nút 3 |
| `LỖI QUYỀN TRUY CẬP` | Sổ tháng chưa chia sẻ quyền **Chỉnh sửa** cho tài khoản chạy tool. Báo người phụ trách |
| `… KHÔNG CÒN CÔNG THỨC NÀO` | Một cột công thức trong sổ bị xóa sạch. Làm đúng câu nó chỉ, tool chưa ghi gì |
| `SỔ THÁNG KHÔNG ĐÚNG KHUÔN` | Sổ bị đổi tên cột hoặc mất sheet. Báo người phụ trách, đừng tự sửa |
| `… file .xlsx đang nằm ngay gốc thư mục thả` | Bạn quên vào thư mục gian hàng. Chuyển file vào một trong bốn thư mục |
| `Không tìm thấy sheet "orders"` | File thả vào không phải file xuất đơn hàng của Shopee |
| `thiếu cột bắt buộc` | Shopee đổi tên cột. Báo người phụ trách, đừng tự sửa |

Vẫn không xong thì chụp màn hình cửa sổ đen, kèm file `LOG_*.txt` mới nhất trong `Cấu hình\nhật ký\`, gửi người phụ trách. **Che kín dòng `chuoi_bi_mat` nếu nó lọt vào ảnh.**

---

## Cập nhật tool

Khi người phụ trách báo có bản mới, bấm đúp **`2_CAP_NHAT.bat`**, đợi vài giây, đọc dòng cuối.

| Cửa sổ đen báo | Nghĩa là |
|---|---|
| `DANG LA BAN MOI NHAT` | Không có gì mới. Làm tiếp như thường |
| `DA CAP NHAT XONG.  2.5.0  ->  2.6.1` | Xong rồi. Bấm `4_CHAY_TOOL.bat` làm việc như mọi ngày |
| Dòng bắt đầu bằng `LOI:` | Đọc câu ngay dưới nó. **Chưa có gì trên máy bị thay đổi**, vẫn chạy `4_CHAY_TOOL.bat` bình thường được |

Nút này **chỉ thay mã của tool**. Nó không đụng link, chuỗi bí mật hay thư mục `1_THA_FILE_XUAT`. Trước khi thay, nó cất bản đang chạy vào một thư mục tên `_ban_cu_...` trong `Cấu hình`, để lùi lại được.
