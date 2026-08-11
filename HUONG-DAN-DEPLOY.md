# 🌸 Hướng dẫn cài đặt & Deploy "Vườn Hoa Của Tôi"

Hướng dẫn này dành cho người **chưa từng dùng Firebase hay GitHub**. Cứ làm theo từng bước, đừng bỏ bước nào.

Có 3 phần lớn:
- **Phần 1:** Tạo cơ sở dữ liệu trên Firebase (miễn phí)
- **Phần 2:** Đưa code lên GitHub và bật GitHub Pages (web chạy miễn phí)
- **Phần 3:** Tạo tài khoản Admin đầu tiên & cách dùng app

---

## PHẦN 1 — TẠO DỰ ÁN FIREBASE

### Bước 1.1 — Tạo project
1. Vào https://console.firebase.google.com/ , đăng nhập bằng tài khoản Google.
2. Bấm **"Add project" / "Thêm dự án"**.
3. Đặt tên, ví dụ: `vuon-hoa-cua-toi` → bấm **Continue**.
4. Tắt Google Analytics nếu không cần (không bắt buộc) → bấm **Create project**.
5. Đợi vài giây rồi bấm **Continue**.

### Bước 1.2 — Tạo ứng dụng Web (Web App)
1. Ở trang tổng quan dự án, bấm biểu tượng **`</>`** (Web).
2. Đặt tên app, ví dụ `vuon-hoa-web` → bấm **Register app**.
3. Firebase sẽ hiện ra một đoạn code `firebaseConfig = {...}`. **Copy toàn bộ đoạn này lại** — bạn sẽ dùng ở Bước 1.6.
4. Bấm **Continue to console**.

### Bước 1.3 — Bật Authentication (đăng nhập Admin)
1. Menu bên trái → **Build → Authentication** → **Get started**.
2. Chọn tab **Sign-in method** → chọn **Email/Password** → bật (Enable) → **Save**.

### Bước 1.4 — Bật Firestore Database (nơi lưu dữ liệu hoa)
1. Menu bên trái → **Build → Firestore Database** → **Create database**.
2. Chọn **Start in production mode** → Next.
3. Chọn vị trí máy chủ gần bạn (ví dụ `asia-southeast1`) → **Enable**.
4. Sau khi tạo xong, vào tab **Rules**, xoá hết nội dung cũ và dán đoạn sau vào, rồi bấm **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAdmin() {
      return request.auth != null &&
        exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /flowers/{flowerId} {
      // Ai cũng xem được hoa đã duyệt; Admin xem được cả hoa chờ duyệt
      allow read: if resource.data.status == 'approved' || isAdmin();
      // Ai cũng có thể gửi hoa mới, nhưng bắt buộc trạng thái là "pending"
      allow create: if request.resource.data.status == 'pending';
      // Chỉ Admin được duyệt / sửa / xoá
      allow update, delete: if isAdmin();
    }

    match /admins/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false; // chỉ thêm thủ công trong Firebase Console
    }
  }
}
```

### Bước 1.5 — Bật Storage (nơi lưu ảnh hoa)
1. Menu bên trái → **Build → Storage** → **Get started** → chọn chế độ mặc định → **Done** (chọn cùng vị trí máy chủ như Bước 1.4).
2. Vào tab **Rules**, dán đoạn sau và **Publish**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /flowers/{allPaths=**} {
      allow read: if true;
      allow write: if request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

> Lưu ý: nếu Firebase yêu cầu nâng cấp gói **Blaze** để dùng Storage, đây vẫn là gói **trả theo dùng** có mức miễn phí hàng ngày rất rộng (bạn cần nhập thẻ nhưng gần như không mất phí với app dùng cá nhân/nhóm nhỏ).

### Bước 1.6 — Dán cấu hình vào code
1. Mở file **`firebase-config.js`** trong bộ code đã tải về.
2. Thay toàn bộ nội dung bên trong `firebaseConfig = {...}` bằng đoạn bạn đã copy ở **Bước 1.2**. Ví dụ:

```js
export const firebaseConfig = {
  apiKey: "AIzaSyABCD1234...",
  authDomain: "vuon-hoa-cua-toi.firebaseapp.com",
  projectId: "vuon-hoa-cua-toi",
  storageBucket: "vuon-hoa-cua-toi.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef123456"
};
```
3. Lưu file lại.

---

## PHẦN 2 — ĐƯA APP LÊN GITHUB (KHÔNG CẦN CÀI GÌ)

### Bước 2.1 — Tạo tài khoản & repository GitHub
1. Vào https://github.com/ , tạo tài khoản nếu chưa có.
2. Bấm dấu **+** góc trên phải → **New repository**.
3. Đặt tên, ví dụ: `vuon-hoa`. Để chế độ **Public**. Không tick gì thêm → **Create repository**.

### Bước 2.2 — Tải file lên (không cần dùng dòng lệnh)
1. Trong trang repository vừa tạo, bấm **"uploading an existing file"** (hoặc **Add file → Upload files**).
2. Kéo thả **toàn bộ** các file: `index.html`, `style.css`, `app.js`, `firebase-config.js` (đã sửa ở Bước 1.6) vào khung tải lên.
3. Cuộn xuống, bấm **Commit changes**.

### Bước 2.3 — Bật GitHub Pages
1. Trong repository, vào tab **Settings**.
2. Menu bên trái chọn **Pages**.
3. Ở mục **Branch**, chọn **main** và thư mục **/ (root)** → bấm **Save**.
4. Đợi 1–2 phút, tải lại trang — GitHub sẽ hiện dòng chữ:
   *"Your site is live at https://ten-tai-khoan.github.io/vuon-hoa/"*
5. Bấm vào link đó — app của bạn đã chạy trực tuyến! 🎉

### Bước 2.4 — Cho phép domain này đăng nhập Firebase
1. Quay lại Firebase Console → **Authentication → Settings → Authorized domains**.
2. Bấm **Add domain**, nhập chính xác domain GitHub Pages của bạn (ví dụ `ten-tai-khoan.github.io`) → **Add**.
3. Nếu thiếu bước này, đăng nhập Admin trên web sẽ báo lỗi.

---

## PHẦN 3 — TẠO ADMIN ĐẦU TIÊN & CÁCH DÙNG APP

### Bước 3.1 — Tạo tài khoản Admin
1. Firebase Console → **Authentication → Users** → **Add user**.
2. Nhập email + mật khẩu cho Admin → **Add user**.
3. Sau khi tạo, bấm vào user đó, **copy đoạn "User UID"** (một chuỗi ký tự dài).

### Bước 3.2 — Cấp quyền Admin
1. Vào **Firestore Database → Data** → bấm **Start collection**.
2. Collection ID: gõ `admins` → Next.
3. **Document ID**: dán **User UID** vừa copy vào (không được tự đặt tên khác).
4. Thêm 1 field bất kỳ, ví dụ: field `role` (kiểu string), giá trị `admin` → **Save**.

Vậy là xong! Tài khoản email/mật khẩu ở Bước 3.1 giờ đã là Admin.

### Bước 3.3 — Cách dùng app
- **Người dùng bình thường:** không cần đăng nhập, bấm **"+ Thêm hoa"** để gửi hoa (tên, hình ảnh, phẩm, người sở hữu) → hoa vào hàng chờ duyệt.
- **Tìm kiếm:** gõ vào ô tìm kiếm trên đầu trang, kết quả lọc theo tên hoa ngay lập tức.
- **Xem chi tiết:** bấm vào thẻ hoa để xem đầy đủ thông tin và danh sách người sở hữu.
- **Admin:** bấm **"Đăng nhập Admin"**, nhập email/mật khẩu đã tạo ở Bước 3.1. Sau khi đăng nhập sẽ thấy khu vực **"Hoa đang chờ duyệt"** ở đầu trang — bấm ✓ để duyệt hoặc ✕ để từ chối.
- **Đổi giao diện:** bấm biểu tượng 🌙 / ☀️ ở góc trên để chuyển sáng/tối. App tự nhớ lựa chọn của bạn.

### Muốn thêm Admin khác?
Lặp lại **Bước 3.1** và **3.2** với email khác.

### Cập nhật app sau này?
Mỗi khi sửa code, vào repository trên GitHub → mở file cần sửa → bấm biểu tượng ✏️ (Edit) → sửa → **Commit changes**. GitHub Pages sẽ tự cập nhật sau khoảng 1 phút.

---

## Xử lý sự cố thường gặp
| Vấn đề | Cách khắc phục |
|---|---|
| Web mở lên trắng trơn / không hiện hoa | Mở Console trình duyệt (F12) xem lỗi; kiểm tra lại `firebase-config.js` đã đúng chưa |
| Đăng nhập Admin báo lỗi domain | Làm lại Bước 2.4 |
| Gửi hoa báo lỗi tải ảnh | Kiểm tra Storage đã bật & rules đã Publish (Bước 1.5) |
| Hoa đã duyệt mà không hiện | Firestore cần một chỉ mục (index) cho truy vấn — mở Console (F12), nếu thấy link "Create index", bấm vào và đợi ~1 phút |
