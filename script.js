/* YILDIZ GÜMÜŞ — mağaza + gizli yönetim
   "Sipariş Ver": variantId girildiyse ürünü sepete atıp
   doğrudan ödeme sayfasına götürür:
   https://magazan.myshopify.com/cart/VARIANT:1
*/
const LS_PRODUCTS = "yg_products_v1";
const LS_DOMAIN = "yg_shopify_domain";
const LS_PASS = "yg_admin_pass";
const LS_IG = "yg_instagram";
const LS_WA = "yg_whatsapp";
const LS_MAIL = "yg_supportmail";
const DEFAULT_PASS = "yildiz123";
const DEFAULT_IG = "yildizgumus";
const DEFAULT_WA = "";
const DEFAULT_MAIL = "destek@yildizgumus.com";
const PLACEHOLDER = /^(1111|2222|3333|4444|5555|6666|7777|8888)/;

/* Eski tarayıcılar için structuredClone yedeği */
const clone = o => (typeof structuredClone === "function"
  ? structuredClone(o)
  : JSON.parse(JSON.stringify(o)));

/* HTML kaçış (tırnaklı ürün adları sayfayı bozmasın) */
const esc = s => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* Ürün kaydını güvenli forma çevirir (eksik alanları tamamlar) */
function normalizeProduct(p, i) {
  return {
    id: p.id ?? (Date.now() + i),
    name: String(p.name ?? "İsimsiz ürün"),
    cat: ["kolye", "kupe", "yuzuk", "bileklik"].includes(p.cat) ? p.cat : "kolye",
    price: Number(p.price) || 0,
    old: Number(p.old) || 0,
    tag: String(p.tag ?? ""),
    desc: String(p.desc ?? ""),
    img: String(p.img ?? "") || IMG("photo-1515562141207-7a88fb7ce338"),
    variantId: String(p.variantId ?? ""),
    url: p.url ? String(p.url) : undefined,
  };
}
/* Firebase `undefined` kabul etmez — göndermeden temizle */
function cleanForFirebase(o) {
  const c = {};
  for (const k in o) if (o[k] !== undefined) c[k] = o[k];
  return c;
}

/* Kırık görsel yedeği (head'deki dinleyiciyle birlikte çift güvence) */
if (!window.__imgFB) {
  window.__imgFB = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='700' height='700'><rect width='700' height='700' fill='#ece7de'/><path d='M350 215l52 160h168l-136 99 52 160-136-99-136 99 52-160-136-99h168z' fill='#c6bba7'/></svg>");
}
document.addEventListener("error", function (e) {
  var t = e.target;
  if (t && t.tagName === "IMG" && !t.dataset.fbk && !t.hasAttribute("data-nofb")) { t.dataset.fbk = "1"; t.src = window.__imgFB; }
}, true);

const IMG = (id, w = 700) =>
  `https://images.unsplash.com/${id}?q=80&w=${w}&auto=format&fit=crop`;

const DEFAULT_PRODUCTS = [
  { id: 1, name: "Kalp Gümüş Kolye", cat: "kolye", price: 1450, old: 1750, tag: "Çok Satan",
    desc: "925 ayar · 45 cm zincir", img: IMG("photo-1599643478518-a784e5dc4c8f"), variantId: "1111111111111" },
  { id: 2, name: "Zirkon Taşlı Küpe", cat: "kupe", price: 890, old: 1100, tag: "",
    desc: "925 ayar · günlük kullanım", img: IMG("photo-1573408301185-9146fe634ad0"), variantId: "2222222222222" },
  { id: 3, name: "Tektaş Yüzük", cat: "yuzuk", price: 2890, old: 3290, tag: "Öne Çıkan",
    desc: "Sertifikalı zirkon taş", img: IMG("photo-1600003014755-ba31aa59c4b6"), variantId: "3333333333333" },
  { id: 4, name: "İnci Bileklik", cat: "bileklik", price: 1250, old: 0, tag: "Yeni",
    desc: "Doğal tatlı su incisi", img: IMG("photo-1611591437281-460bfbe1220a"), variantId: "4444444444444" },
  { id: 5, name: "Minimal Zincir Kolye", cat: "kolye", price: 1690, old: 0, tag: "",
    desc: "Rodyum kaplama · 42 cm", img: IMG("photo-1602173574767-37ac01994b2a"), variantId: "5555555555555" },
  { id: 6, name: "Baget Taşlı Yüzük", cat: "yuzuk", price: 2150, old: 2500, tag: "",
    desc: "Baget kesim · ayarlanabilir", img: IMG("photo-1603561591411-07134e71a2a9"), variantId: "6666666666666" },
  { id: 7, name: "Halka Küpe Seti", cat: "kupe", price: 750, old: 900, tag: "",
    desc: "3'lü set · kararmaz", img: IMG("photo-1617038220319-276d3cfab638"), variantId: "7777777777777" },
  { id: 8, name: "Charm Bileklik", cat: "bileklik", price: 980, old: 1200, tag: "Fırsat",
    desc: "Charm detaylı · hediye kutulu", img: IMG("photo-1515562141207-7a88fb7ce338"), variantId: "8888888888888" },
];

/* =========================================================
   VERİ KATMANI
   Firebase yapılandırıldıysa ürünler ve ayarlar BULUTTA
   tutulur → panelde yapılan her değişiklik tüm ziyaretçilere
   anında yansır. Firebase yoksa site eski gibi localStorage
   ile çalışır (düzgün kapanır, hata vermez).
   ========================================================= */
let FB = null;            // Firebase.database() referansı
let FB_READY = false;     // bağlantı kuruldu mu
const FB_ON = !!(window.YG_FIREBASE && window.YG_FIREBASE.databaseURL);

/* --- localStorage yedeği --- */
function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_PRODUCTS);
    if (!raw) return clone(DEFAULT_PRODUCTS);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || !arr.length) return clone(DEFAULT_PRODUCTS);
    return arr.map(normalizeProduct);
  } catch { return clone(DEFAULT_PRODUCTS); }
}
function lsSave(arr) {
  try { localStorage.setItem(LS_PRODUCTS, JSON.stringify(arr)); }
  catch { toastMsg("Depolama dolu: fotoğrafı link olarak eklemeyi dene."); }
}

/* --- Firebase SDK yükle --- */
function loadFirebase() {
  return new Promise((resolve) => {
    if (!FB_ON) return resolve(false);
    const app = document.createElement("script");
    app.src = "firebase-app-compat.js";   /* yerel kopya — CDN bağımlılığı yok */
    app.onload = () => {
      const db = document.createElement("script");
      db.src = "firebase-database-compat.js";   /* yerel kopya */
      db.onload = () => {
        try {
          firebase.initializeApp(window.YG_FIREBASE);
          FB = firebase.database();
          resolve(true);
        } catch (e) { console.warn("Firebase init hatası:", e); resolve(false); }
      };
      db.onerror = () => resolve(false);
      document.head.appendChild(db);
    };
    app.onerror = () => resolve(false);
    document.head.appendChild(app);
  });
}

/* --- Yazma: Firebase varsa buluta, ayrıca yedek localStorage --- */
function saveProducts() {
  lsSave(PRODUCTS);
  if (!FB_READY) return;
  /* DİZİ olarak yaz → ürün sırası korunur (yenisi en üstte kalır) */
  FB.ref("products").set(PRODUCTS.map(cleanForFirebase))
    .catch(e => console.warn("Bulut kayıt hatası:", e));
}
function saveSettingsToCloud() {
  if (!FB_READY) return;
  FB.ref("settings").set({
    domain: SHOPIFY.domain,
    pass: getPass(),
    ig: CONTACT.ig,
    wa: CONTACT.wa,
    mail: CONTACT.mail,
  }).catch(e => console.warn("Bulut ayar hatası:", e));
}

/* Anlık veriyi ekrana ve localStorage'a uygula */
function applyProductsFromSnapshot(snap) {
  const v = snap.val();
  const arr = Array.isArray(v) ? v : (v ? Object.values(v) : []);
  PRODUCTS = arr.map((p, i) => normalizeProduct(p, i));
  lsSave(PRODUCTS);
  render(); renderAdminList();
}

/* Firebase'i başlat: ÖNCE gerekirse tohumla, veriyi tek seferlik oku
   (her ağda çalışır), SONRA canlı dinlemeyi ekle. Sıralı olduğu için
   yarış olmaz, veri kaybı yaşanmaz. */
function attachRealtime() {
  if (!FB_READY) return;

  FB.ref("products").once("value")
    .then(snap => {
      if (!snap.exists()) {
        /* bulut boş → ilk kurulum: lokal/varsayılan ürünleri yükle */
        const seed = lsLoad();
        return FB.ref("products").set(seed.map(cleanForFirebase)).then(() => true);
      }
      applyProductsFromSnapshot(snap);   /* veri var: hemen uygula */
      return false;
    })
    .then(seeded => {
      if (seeded) {
        /* tohumladık: temiz halde bir kez daha oku ve uygula */
        FB.ref("products").once("value").then(applyProductsFromSnapshot);
      }
      /* canlı dinleme: bundan sonraki değişiklikler anında yansır */
      FB.ref("products").on("value", applyProductsFromSnapshot);
    })
    .catch(e => console.warn("Realtime bağlantı hatası:", e));

  /* ayarlar da senkron olsun (domain + şifre + iletişim her cihazda aynı) */
  FB.ref("settings").on("value", snap => {
    const v = snap.val();
    if (v) {
      if (v.domain) localStorage.setItem(LS_DOMAIN, v.domain);
      if (v.pass) localStorage.setItem(LS_PASS, v.pass);
      if (v.ig !== undefined) localStorage.setItem(LS_IG, v.ig);
      if (v.wa !== undefined) localStorage.setItem(LS_WA, v.wa);
      if (v.mail !== undefined) localStorage.setItem(LS_MAIL, v.mail);
      applyContact();
      /* panel açıksa alanları tazele */
      const open = document.getElementById("shopDomain");
      if (open && !document.getElementById("adminOverlay").hidden) {
        document.getElementById("shopDomain").value = SHOPIFY.domain;
        document.getElementById("adminPassSet").value = getPass();
        document.getElementById("cIg").value = CONTACT.ig;
        document.getElementById("cWa").value = CONTACT.wa;
        document.getElementById("cMail").value = CONTACT.mail;
      }
    }
  });
}

const SHOPIFY = {
  get domain() {
    return localStorage.getItem(LS_DOMAIN) || "https://yildiz-gumus.myshopify.com";
  },
  set domain(v) { localStorage.setItem(LS_DOMAIN, v); }
};

/* İletişim bilgileri — panelden değiştirilir, buluta senkron olur */
const CONTACT = {
  get ig() { return localStorage.getItem(LS_IG) ?? DEFAULT_IG; },
  set ig(v) { localStorage.setItem(LS_IG, v); },
  get wa() { return localStorage.getItem(LS_WA) ?? DEFAULT_WA; },
  set wa(v) { localStorage.setItem(LS_WA, v); },
  get mail() { return localStorage.getItem(LS_MAIL) ?? DEFAULT_MAIL; },
  set mail(v) { localStorage.setItem(LS_MAIL, v); }
};

/* Footer'daki iletişim bağlantılarını ayarlara göre güncelle */
function applyContact() {
  const setLink = (id, href, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (href) { el.href = href; el.textContent = text; el.style.display = ""; }
    else { el.style.display = "none"; }
  };
  const ig = (CONTACT.ig || "").trim().replace(/^@/, "");
  setLink("contactIg", ig ? "https://instagram.com/" + encodeURIComponent(ig) : "", ig ? "@" + ig : "");
  const wa = (CONTACT.wa || "").replace(/\D/g, "");
  setLink("contactWa", wa ? "https://wa.me/" + wa : "", "WhatsApp");
  const mail = (CONTACT.mail || "").trim();
  setLink("contactMail", mail ? "mailto:" + mail : "", mail);
}

let PRODUCTS = lsLoad();

const CAT_LABEL = { kolye: "KOLYE", kupe: "KÜPE", yuzuk: "YÜZÜK", bileklik: "BİLEKLİK" };
const fmt = n => new Intl.NumberFormat("tr-TR").format(n);
const grid = document.getElementById("productGrid");
const toast = document.getElementById("toast");
const prodCount = document.getElementById("prodCount");

/* ---------- Bildirim ---------- */
let toastTimer;
function toastMsg(html, ms = 3000) {
  toast.innerHTML = html;
  toast.classList.add("is-show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-show"), ms);
}

/* ---------- Scroll reveal (bölümler + kartlar) ---------- */
let io = null;
function observeReveals() {
  if (!io) {
    io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) return;
        const el = en.target;
        el.classList.add("is-in");
        /* giriş bitince gecikmeyi temizle ki hover gecikmesin */
        setTimeout(() => { el.style.transitionDelay = ""; }, 800);
        io.unobserve(el);
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
  }
  document.querySelectorAll(".reveal:not(.is-in)").forEach(el => io.observe(el));
  /* kartlara kademeli giriş */
  document.querySelectorAll(".card:not(.is-in)").forEach((el, i) => {
    el.style.transitionDelay = `${(i % 4) * 70}ms`;
    io.observe(el);
  });
}

/* ---------- Ürün kartları ---------- */
function cardHTML(p) {
  const off = p.old && p.old > p.price ? Math.round((1 - p.price / p.old) * 100) : 0;
  return `
  <article class="card" data-cat="${esc(p.cat)}">
    <div class="card__media">
      ${p.tag ? `<span class="card__tag">${esc(p.tag)}</span>` : ""}
      <img src="${esc(p.img)}" alt="${esc(p.name)}" loading="lazy" />
    </div>
    <div class="card__body">
      <span class="card__cat">${esc(CAT_LABEL[p.cat] || p.cat)}</span>
      <h3 class="card__title">${esc(p.name)}</h3>
      <p class="card__desc">${esc(p.desc || "")}</p>
      <div class="card__price">
        <strong>₺${fmt(p.price)}</strong>
        ${p.old ? `<del>₺${fmt(p.old)}</del>` : ""}
        ${off ? `<span class="card__save">-%${off}</span>` : ""}
      </div>
      <button class="btn btn--order" data-id="${p.id}">Sipariş Ver →</button>
    </div>
  </article>`;
}

let activeFilter = "all";
function render() {
  const items = activeFilter === "all" ? PRODUCTS : PRODUCTS.filter(p => p.cat === activeFilter);
  prodCount.textContent = items.length ? `${items.length} ürün` : "";
  grid.innerHTML = items.length ? items.map(cardHTML).join("") : `
    <div class="empty">
      <span>✦</span>
      <p>Bu kategoride henüz ürün yok.<br/>Yönetim panelinden ekleyebilirsin.</p>
      <button class="btn btn--dark btn--sm" data-act="reset-filter">Tüm Ürünleri Göster</button>
    </div>`;
  observeReveals();
}
render();

/* ---------- Shopify yönlendirme ---------- */
function goToShopify(product) {
  let url;
  const realVariant = product.variantId && !PLACEHOLDER.test(product.variantId) && product.variantId.length >= 8;
  if (product.url) url = product.url;
  else if (realVariant) url = `${SHOPIFY.domain}/cart/${product.variantId}:1`;
  else url = `${SHOPIFY.domain}/search?q=${encodeURIComponent(product.name)}`;

  toastMsg(`<strong>${esc(product.name)}</strong> sepete ekleniyor, ödemeye yönlendiriliyorsun…`);
  setTimeout(() => window.open(url, "_blank", "noopener"), 650);
}

grid.addEventListener("click", e => {
  if (e.target.closest('[data-act="reset-filter"]')) {
    document.querySelector('.filter[data-filter="all"]').click();
    return;
  }
  const btn = e.target.closest(".btn--order");
  if (!btn) return;
  const product = PRODUCTS.find(p => String(p.id) === btn.dataset.id);
  if (product) goToShopify(product);
});

/* ---------- Filtreler ---------- */
document.getElementById("filters").addEventListener("click", e => {
  const b = e.target.closest(".filter");
  if (!b) return;
  document.querySelectorAll(".filter").forEach(f => f.classList.remove("is-active"));
  b.classList.add("is-active");
  activeFilter = b.dataset.filter;
  render();
});

document.querySelectorAll(".cat").forEach(a => {
  a.addEventListener("click", () => {
    const btn = document.querySelector(`.filter[data-filter="${a.dataset.goto}"]`);
    if (btn) btn.click();
  });
});

/* ---------- Header + yukarı dön ---------- */
const header = document.getElementById("header");
const toTop = document.getElementById("toTop");
addEventListener("scroll", () => {
  header.style.boxShadow = scrollY > 20 ? "0 10px 30px -18px rgba(0,0,0,.25)" : "none";
  toTop.classList.toggle("is-show", scrollY > 600);
}, { passive: true });
toTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

/* ---------- Menüde aktif bölüm vurgusu ---------- */
(function spy() {
  const links = [...document.querySelectorAll(".nav a[href^='#']")];
  const secs = links.map(a => document.querySelector(a.getAttribute("href"))).filter(Boolean);
  if (!secs.length || !("IntersectionObserver" in window)) return;
  const so = new IntersectionObserver(es => {
    es.forEach(en => {
      if (!en.isIntersecting) return;
      links.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === "#" + en.target.id));
    });
  }, { rootMargin: "-40% 0px -55% 0px" });
  secs.forEach(s => so.observe(s));
})();

/* ---------- Mobil menü ---------- */
const burger = document.getElementById("burger");
const nav = document.getElementById("nav");
burger.addEventListener("click", () => {
  burger.classList.toggle("is-open");
  nav.classList.toggle("is-open");
});
nav.addEventListener("click", e => {
  if (e.target.tagName === "A") {
    burger.classList.remove("is-open");
    nav.classList.remove("is-open");
  }
});

/* ---------- Bülten + yıl + marka logosu ---------- */
document.getElementById("newsForm").addEventListener("submit", e => {
  e.preventDefault();
  document.getElementById("newsOk").hidden = false;
  e.target.reset();
});
document.getElementById("year").textContent = new Date().getFullYear();

/* Marka logosu: vektör (SVG) logolar kullanılır — açık temaya uygun,
   çözünürlük sınırsız. (İstersen aynı isimle gerçek fotoğraf da konabilir.) */
(function brandLogo() {
  document.body.classList.add("has-logo");
})();

/* =========================================================
   GİZLİ YÖNETİM PANELİ
   Açılış:  #yildiz-admin  ·  Ctrl+Shift+Y  ·
   logoya 3 kez tıkla  ·  footer'daki nokta
   Varsayılan şifre: yildiz123 (panelden değiştirilebilir)
   ========================================================= */
const overlay = document.getElementById("adminOverlay");
const loginBox = document.getElementById("adminLogin");
const loginForm = document.getElementById("adminLoginForm");
const adminErr = document.getElementById("adminErr");
const adminList = document.getElementById("adminList");
const adminCount = document.getElementById("adminCount");
const productForm = document.getElementById("productForm");
const formTitle = document.getElementById("formTitle");
const formSubmit = document.getElementById("formSubmit");
const formCancel = document.getElementById("formCancel");
const fPreview = document.getElementById("fPreview");
let editingId = null;
let pendingImgData = "";

const getPass = () => localStorage.getItem(LS_PASS) || DEFAULT_PASS;
const isAuthed = () => sessionStorage.getItem("yg_admin_auth") === "1";

function requestAdmin() {
  if (isAuthed()) openAdmin();
  else {
    loginBox.hidden = false;
    document.getElementById("adminPass").value = "";
    adminErr.hidden = true;
    setTimeout(() => document.getElementById("adminPass").focus(), 50);
  }
}
function openAdmin() {
  loginBox.hidden = true;
  overlay.hidden = false;
  document.body.style.overflow = "hidden";
  document.getElementById("shopDomain").value = SHOPIFY.domain;
  document.getElementById("adminPassSet").value = getPass();
  document.getElementById("cIg").value = CONTACT.ig;
  document.getElementById("cWa").value = CONTACT.wa;
  document.getElementById("cMail").value = CONTACT.mail;
  renderAdminList();
  resetForm();
}
function closeAdmin() {
  overlay.hidden = true;
  document.body.style.overflow = "";
  if (location.hash === "#yildiz-admin") {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

loginForm.addEventListener("submit", e => {
  e.preventDefault();
  if (document.getElementById("adminPass").value === getPass()) {
    sessionStorage.setItem("yg_admin_auth", "1");
    openAdmin();
  } else adminErr.hidden = false;
});
document.getElementById("adminLoginClose").addEventListener("click", () => {
  loginBox.hidden = true;
});
document.getElementById("adminClose").addEventListener("click", closeAdmin);
overlay.addEventListener("click", e => {
  if (e.target === overlay) closeAdmin();
});
addEventListener("keydown", e => {
  if (e.key === "Escape") { closeAdmin(); loginBox.hidden = true; }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "y") {
    e.preventDefault();
    requestAdmin();
  }
});

let logoClicks = 0, logoTimer;
document.getElementById("logoBtn").addEventListener("click", e => {
  e.preventDefault();
  logoClicks++;
  clearTimeout(logoTimer);
  logoTimer = setTimeout(() => (logoClicks = 0), 800);
  if (logoClicks >= 3) { logoClicks = 0; requestAdmin(); }
  else window.scrollTo({ top: 0, behavior: "smooth" });
});
document.getElementById("adminDot").addEventListener("click", requestAdmin);
if (location.hash === "#yildiz-admin") requestAdmin();

/* ---------- Admin: liste ---------- */
function shopState(p) {
  return p.variantId && !PLACEHOLDER.test(p.variantId) ? " · Shopify bağlı ✓" : " · Shopify bağlı değil";
}
function renderAdminList() {
  adminCount.textContent = PRODUCTS.length;
  adminList.innerHTML = PRODUCTS.map(p => `
    <div class="admin-item">
      <img src="${esc(p.img)}" alt="" loading="lazy" />
      <div class="admin-item__info">
        <strong>${esc(p.name)}</strong>
        <small>${esc(CAT_LABEL[p.cat] || p.cat)} · ₺${fmt(p.price)}${esc(shopState(p))}</small>
      </div>
      <div class="admin-item__btns">
        <button class="btn--mini" data-edit="${p.id}">Düzenle</button>
        <button class="btn--mini danger" data-del="${p.id}">Sil</button>
      </div>
    </div>`).join("");
}

adminList.addEventListener("click", e => {
  const del = e.target.closest("[data-del]");
  const edit = e.target.closest("[data-edit]");
  if (del) {
    const p = PRODUCTS.find(x => String(x.id) === del.dataset.del);
    if (!p) return;
    if (!confirm(`"${p.name}" silinsin mi?`)) return;
    PRODUCTS = PRODUCTS.filter(x => x.id !== p.id);
    if (editingId === p.id) resetForm();
    saveProducts(); render(); renderAdminList();
  }
  if (edit) {
    const p = PRODUCTS.find(x => String(x.id) === edit.dataset.edit);
    if (!p) return;
    editingId = p.id;
    document.getElementById("fName").value = p.name;
    document.getElementById("fCat").value = p.cat;
    document.getElementById("fPrice").value = p.price;
    document.getElementById("fOld").value = p.old || "";
    document.getElementById("fTag").value = p.tag || "";
    document.getElementById("fDesc").value = p.desc || "";
    document.getElementById("fImg").value = p.img && p.img.startsWith("data:") ? "" : (p.img || "");
    document.getElementById("fVariant").value = PLACEHOLDER.test(p.variantId || "") ? "" : (p.variantId || "");
    document.getElementById("fUrl").value = p.url || "";
    pendingImgData = p.img && p.img.startsWith("data:") ? p.img : "";
    showPreview(pendingImgData || p.img);
    formTitle.textContent = `"${p.name}" düzenleniyor`;
    formSubmit.textContent = "Değişiklikleri Kaydet";
    formCancel.hidden = false;
    productForm.scrollIntoView({ behavior: "smooth", block: "center" });
  }
});

/* ---------- Admin: fotoğraf önizleme ---------- */
function showPreview(src) {
  if (src) { fPreview.src = src; fPreview.hidden = false; }
  else { fPreview.removeAttribute("src"); fPreview.hidden = true; }
}
document.getElementById("fFile").addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { pendingImgData = r.result; showPreview(r.result); };
  r.readAsDataURL(f);
});
document.getElementById("fImg").addEventListener("input", e => {
  if (!pendingImgData) showPreview(e.target.value.trim());
});

function resetForm() {
  editingId = null;
  pendingImgData = "";
  productForm.reset();
  document.getElementById("fFile").value = "";
  showPreview("");
  formTitle.textContent = "Yeni ürün ekle";
  formSubmit.textContent = "Ürünü Ekle";
  formCancel.hidden = true;
}
formCancel.addEventListener("click", resetForm);

productForm.addEventListener("submit", e => {
  e.preventDefault();
  const name = document.getElementById("fName").value.trim();
  const price = Number(document.getElementById("fPrice").value);
  if (!name || !(price > 0)) return;
  const imgUrl = document.getElementById("fImg").value.trim();
  const data = {
    name,
    cat: document.getElementById("fCat").value,
    price,
    old: Number(document.getElementById("fOld").value) || 0,
    tag: document.getElementById("fTag").value.trim(),
    desc: document.getElementById("fDesc").value.trim(),
    img: pendingImgData || imgUrl || IMG("photo-1515562141207-7a88fb7ce338"),
    variantId: document.getElementById("fVariant").value.trim(),
    url: document.getElementById("fUrl").value.trim() || undefined,
  };
  if (editingId) {
    const i = PRODUCTS.findIndex(p => p.id === editingId);
    if (i > -1) PRODUCTS[i] = { ...PRODUCTS[i], ...data };
  } else {
    PRODUCTS.unshift({ id: Date.now(), ...data });
  }
  saveProducts(); render(); renderAdminList(); resetForm();
  formSubmit.textContent = "Kaydedildi ✓";
  setTimeout(() => { formSubmit.textContent = "Ürünü Ekle"; }, 1800);
});

/* ---------- Admin: ayarlar ---------- */
document.getElementById("saveSettings").addEventListener("click", ev => {
  const d = document.getElementById("shopDomain").value.trim();
  const pw = document.getElementById("adminPassSet").value.trim();
  if (d) SHOPIFY.domain = d.replace(/\/$/, "");
  if (pw) localStorage.setItem(LS_PASS, pw);
  CONTACT.ig = document.getElementById("cIg").value.trim();
  CONTACT.wa = document.getElementById("cWa").value.trim();
  CONTACT.mail = document.getElementById("cMail").value.trim();
  applyContact();
  saveSettingsToCloud();
  renderAdminList();
  const b = ev.currentTarget, old = b.textContent;
  b.textContent = "Kaydedildi ✓";
  setTimeout(() => { b.textContent = old; }, 1800);
});
document.getElementById("resetAll").addEventListener("click", () => {
  if (!confirm("Tüm ürünler ve ayarlar ilk haline dönsün mü?")) return;
  PRODUCTS = clone(DEFAULT_PRODUCTS);
  saveProducts();
  CONTACT.ig = DEFAULT_IG;
  CONTACT.wa = DEFAULT_WA;
  CONTACT.mail = DEFAULT_MAIL;
  applyContact();
  saveSettingsToCloud();
  const ci = document.getElementById("cIg");
  if (ci) { ci.value = DEFAULT_IG; document.getElementById("cWa").value = DEFAULT_WA; document.getElementById("cMail").value = DEFAULT_MAIL; }
  render(); renderAdminList(); resetForm();
});

/* ---------- İlk kurulum ---------- */
applyContact();
observeReveals();

/* Firebase varsa buluta bağlan, canlı senkronu başlat.
   Yoksa site localStorage ile normal çalışmaya devam eder. */
(async function bootCloud() {
  const ok = await loadFirebase();
  if (ok) { FB_READY = true; attachRealtime(); }
})();
