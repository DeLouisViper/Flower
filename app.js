import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, getDoc,
  query, where, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ---------- KHỞI TẠO FIREBASE ----------
// Lưu ý: App này KHÔNG dùng Firebase Storage (gói miễn phí Spark không hỗ trợ Storage).
// Ảnh được nén nhỏ lại ở trình duyệt rồi lưu trực tiếp trong Firestore (dạng base64).
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ---------- STATE ----------
let approvedFlowers = [];   // toàn bộ hoa đã duyệt (để tìm kiếm client-side)
let pendingFlowers = [];    // hoa đang chờ duyệt (chỉ admin thấy)
let isAdmin = false;
let searchKeyword = "";

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const flowerGrid = $("flowerGrid");
const pendingSection = $("pendingSection");
const pendingGrid = $("pendingGrid");
const pendingCount = $("pendingCount");
const emptyState = $("emptyState");
const galleryCount = $("galleryCount");
const galleryTitle = $("galleryTitle");

// ---------- TOAST ----------
function toast(msg) {
  const el = $("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (el.hidden = true), 2600);
}

// ---------- THEME ----------
function initTheme() {
  const saved = localStorage.getItem("flower-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  setTheme(saved);
}
function setTheme(mode) {
  document.body.dataset.theme = mode;
  localStorage.setItem("flower-theme", mode);
  $("themeToggle").querySelector(".theme-icon").textContent = mode === "dark" ? "☀️" : "🌙";
}
$("themeToggle").addEventListener("click", () => {
  setTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
});
initTheme();

// ---------- MODALS ----------
function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }
document.querySelectorAll("[data-close]").forEach((btn) => {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
});
document.querySelectorAll(".modal-overlay").forEach((overlay) => {
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });
});

$("addFlowerBtn").addEventListener("click", () => openModal("addModal"));
$("emptyAddBtn").addEventListener("click", () => openModal("addModal"));
$("loginBtn").addEventListener("click", () => openModal("loginModal"));

// ---------- NÉN ẢNH (lưu trực tiếp vào Firestore, không cần Storage) ----------
// Firestore giới hạn mỗi document tối đa ~1MB, nên ảnh được resize + nén JPEG
// càng nhỏ càng an toàn. Hàm này thử giảm dần chất lượng/kích thước cho tới khi vừa.
function compressImage(file, { maxWidth = 800, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.onerror = reject;
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Thử nén với độ nét giảm dần cho tới khi dữ liệu đủ nhỏ để lưu vào Firestore.
async function compressUntilSmallEnough(file) {
  const attempts = [
    { maxWidth: 900, quality: 0.75 },
    { maxWidth: 700, quality: 0.65 },
    { maxWidth: 500, quality: 0.55 },
    { maxWidth: 360, quality: 0.5 }
  ];
  const MAX_CHARS = 700000; // ~700KB base64, an toàn dưới giới hạn 1MB/document
  let last = null;
  for (const opt of attempts) {
    last = await compressImage(file, opt);
    if (last.length <= MAX_CHARS) return last;
  }
  if (last.length > MAX_CHARS) {
    throw new Error("Ảnh vẫn quá lớn sau khi nén. Vui lòng chọn ảnh khác nhỏ hơn.");
  }
  return last;
}

// ---------- IMAGE PREVIEW ----------
$("flowerImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  const preview = $("imagePreview");
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }
});

// ---------- RENDER: FLOWER CARD ----------
function ownersHtml(owners) {
  return owners.map((o) => `<span class="owner-chip">${escapeHtml(o)}</span>`).join("");
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderGrid() {
  const kw = searchKeyword.trim().toLowerCase();
  const list = kw
    ? approvedFlowers.filter((f) => f.name.toLowerCase().includes(kw))
    : approvedFlowers;

  galleryTitle.textContent = kw ? `Kết quả tìm kiếm: "${searchKeyword}"` : "Bộ sưu tập hoa";
  galleryCount.textContent = `${list.length} loại hoa`;

  flowerGrid.innerHTML = "";
  emptyState.hidden = list.length !== 0;

  list.forEach((f) => {
    const card = document.createElement("div");
    card.className = "flower-card";
    card.innerHTML = `
      <p class="fc-name">${escapeHtml(f.name)}</p>
      <div class="fc-image-wrap"><img src="${f.imageUrl}" alt="${escapeHtml(f.name)}" loading="lazy"/></div>
      <div class="fc-owners">${ownersHtml(f.owners)}</div>
    `;
    card.addEventListener("click", () => openDetail(f));
    flowerGrid.appendChild(card);
  });
}

function openDetail(f) {
  $("detailContent").innerHTML = `
    <img class="detail-img" src="${f.imageUrl}" alt="${escapeHtml(f.name)}"/>
    <h2 class="detail-title">${escapeHtml(f.name)}</h2>
    ${f.variety ? `<p class="detail-variety">Phẩm: ${escapeHtml(f.variety)}</p>` : ""}
    <p class="detail-owners-label">Người sở hữu</p>
    <div class="fc-owners">${ownersHtml(f.owners)}</div>
  `;
  openModal("detailModal");
}

// ---------- SEARCH ----------
const searchInput = $("searchInput");
const searchClear = $("searchClear");
searchInput.addEventListener("input", () => {
  searchKeyword = searchInput.value;
  searchClear.hidden = searchKeyword.length === 0;
  renderGrid();
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchKeyword = "";
  searchClear.hidden = true;
  renderGrid();
});

// ---------- LOAD APPROVED FLOWERS (mọi người xem được) ----------
function listenApprovedFlowers() {
  const q = query(
    collection(db, "flowers"),
    where("status", "==", "approved"),
    orderBy("createdAt", "desc")
  );
  onSnapshot(q, (snap) => {
    approvedFlowers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderGrid();
  }, (err) => {
    console.error(err);
    toast("Không tải được danh sách hoa. Kiểm tra cấu hình Firebase.");
  });
}

// ---------- LOAD PENDING FLOWERS (chỉ admin) ----------
let unsubPending = null;
function listenPendingFlowers() {
  const q = query(
    collection(db, "flowers"),
    where("status", "==", "pending"),
    orderBy("createdAt", "desc")
  );
  unsubPending = onSnapshot(q, (snap) => {
    pendingFlowers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPending();
  });
}
function renderPending() {
  pendingCount.textContent = pendingFlowers.length;
  pendingGrid.innerHTML = "";
  pendingFlowers.forEach((f) => {
    const card = document.createElement("div");
    card.className = "pending-card";
    card.innerHTML = `
      <img src="${f.imageUrl}" alt="${escapeHtml(f.name)}"/>
      <div class="pc-info">
        <strong>${escapeHtml(f.name)}</strong>
        <span>${escapeHtml(f.owners.join(", "))}</span>
      </div>
      <div class="pc-actions">
        <button class="pc-approve" title="Duyệt">✓</button>
        <button class="pc-reject" title="Từ chối">✕</button>
      </div>
    `;
    card.querySelector(".pc-approve").addEventListener("click", () => approveFlower(f.id));
    card.querySelector(".pc-reject").addEventListener("click", () => rejectFlower(f.id));
    pendingGrid.appendChild(card);
  });
}

async function approveFlower(id) {
  try {
    await updateDoc(doc(db, "flowers", id), { status: "approved" });
    toast("Đã duyệt hoa 🌸");
  } catch (e) {
    console.error(e);
    toast("Lỗi khi duyệt hoa.");
  }
}
async function rejectFlower(id) {
  try {
    await deleteDoc(doc(db, "flowers", id));
    toast("Đã từ chối hoa.");
  } catch (e) {
    console.error(e);
    toast("Lỗi khi từ chối hoa.");
  }
}

// ---------- ADD FLOWER ----------
$("addFlowerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("flowerName").value.trim();
  const variety = $("flowerVariety").value.trim();
  const ownersRaw = $("flowerOwners").value.trim();
  const file = $("flowerImage").files[0];
  const msg = $("addFlowerMsg");
  const submitBtn = $("submitFlowerBtn");

  if (!name || !ownersRaw || !file) {
    msg.textContent = "Vui lòng điền đầy đủ thông tin bắt buộc.";
    msg.className = "form-msg error";
    return;
  }

  const owners = ownersRaw.split(",").map((o) => o.trim()).filter(Boolean);

  submitBtn.disabled = true;
  msg.textContent = "Đang xử lý ảnh...";
  msg.className = "form-msg";

  try {
    const imageUrl = await compressUntilSmallEnough(file);

    await addDoc(collection(db, "flowers"), {
      name,
      variety,
      owners,
      imageUrl,
      status: "pending",
      createdAt: serverTimestamp()
    });

    msg.textContent = "Đã gửi! Hoa sẽ hiển thị sau khi được duyệt.";
    msg.className = "form-msg success";
    toast("Gửi hoa thành công, đang chờ duyệt 🌱");
    $("addFlowerForm").reset();
    $("imagePreview").hidden = true;
    setTimeout(() => closeModal("addModal"), 900);
  } catch (err) {
    console.error(err);
    msg.textContent = "Có lỗi xảy ra. Vui lòng thử lại.";
    msg.className = "form-msg error";
  } finally {
    submitBtn.disabled = false;
  }
});

// ---------- ADMIN LOGIN / LOGOUT ----------
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  const msg = $("loginMsg");
  msg.textContent = "Đang đăng nhập...";
  msg.className = "form-msg";
  try {
    await signInWithEmailAndPassword(auth, email, password);
    closeModal("loginModal");
    $("loginForm").reset();
  } catch (err) {
    console.error(err);
    msg.textContent = "Sai email hoặc mật khẩu.";
    msg.className = "form-msg error";
  }
});

$("logoutBtn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const adminDoc = await getDoc(doc(db, "admins", user.uid));
    isAdmin = adminDoc.exists();
  } else {
    isAdmin = false;
  }
  updateAdminUI();
});

function updateAdminUI() {
  $("loginBtn").hidden = isAdmin;
  $("adminBadge").hidden = !isAdmin;
  pendingSection.hidden = !isAdmin;

  if (isAdmin && !unsubPending) {
    listenPendingFlowers();
  } else if (!isAdmin && unsubPending) {
    unsubPending();
    unsubPending = null;
    pendingFlowers = [];
  }
}

// ---------- START ----------
listenApprovedFlowers();
