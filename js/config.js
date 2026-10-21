/* ========================================================
   DETEKSI MODE: DESKTOP (OFFLINE) vs WEB (ONLINE)
======================================================== */
window.isElectron = Boolean(
    (typeof window !== 'undefined' && (window.isElectron === true || typeof window.electronAPI !== 'undefined')) ||
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) ||
    (typeof process !== 'undefined' && process.versions && process.versions.electron)
);

/* ========================================================
   SESSION STORE (LEBIH AMAN DARIPADA localStorage)
   - Disimpan di sessionStorage: otomatis hilang saat tab/jendela ditutup
   - Batas waktu mutlak (8 jam) + idle timeout (60 menit tanpa aktivitas)
   - Sisa data sesi lama di localStorage dibersihkan otomatis
======================================================== */
window.SessionStore = (function () {
    const KEYS = ['siempus_user', 'siempus_username', 'siempus_session_token', 'siempus_page'];
    const META_START = 'siempus_session_start';
    const META_ACTIVE = 'siempus_session_active';
    const MAX_AGE_MS = 8 * 60 * 60 * 1000;   // 8 jam
    const IDLE_MS = 60 * 60 * 1000;          // 60 menit
    const store = window.sessionStorage;

    // Migrasi: hapus data sesi lama yang tersimpan permanen di localStorage
    try { KEYS.forEach(k => window.localStorage.removeItem(k)); } catch (_) { }

    function now() { return Date.now(); }

    function clear() {
        try { KEYS.concat([META_START, META_ACTIVE]).forEach(k => store.removeItem(k)); } catch (_) { }
    }

    function isValid() {
        try {
            const start = Number(store.getItem(META_START));
            const active = Number(store.getItem(META_ACTIVE));
            if (!start || !active) return false;
            const t = now();
            if (t - start > MAX_AGE_MS || t - active > IDLE_MS) { clear(); return false; }
            return true;
        } catch (_) { return false; }
    }

    // Catat aktivitas terakhir (dibatasi agar tidak menulis storage terus-menerus)
    let lastTouch = 0;
    function touch() {
        const t = now();
        if (t - lastTouch < 15000) return;
        lastTouch = t;
        try { if (store.getItem(META_START)) store.setItem(META_ACTIVE, String(t)); } catch (_) { }
    }

    return {
        get(key) {
            if (!isValid()) return null;
            try { return store.getItem(key); } catch (_) { return null; }
        },
        set(key, value) { try { store.setItem(key, String(value)); } catch (_) { } },
        remove(key) { try { store.removeItem(key); } catch (_) { } },
        start() {
            const t = String(now());
            try { store.setItem(META_START, t); store.setItem(META_ACTIVE, t); } catch (_) { }
        },
        isValid, touch, clear
    };
})();

['click', 'keydown', 'mousemove', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, () => window.SessionStore.touch(), { passive: true })
);

const myButton = document.getElementById("btn-back-to-top");
window.onscroll = function () { scrollFunction(); };
function scrollFunction() {
    if (!myButton) return;
    if (document.body.scrollTop > 100 || document.documentElement.scrollTop > 100) { myButton.style.display = "block"; } else { myButton.style.display = "none"; }
}
function scrollToTop() { window.scrollTo({ top: 0, behavior: 'smooth' }); }


/* ========================================================
   ADAPTOR MULTI-TENANT (1 FRONTEND, BANYAK BACKEND)
======================================================== */

// 1. Daftar Sekolah & Link Backend
const daftarSekolah = {
    "sman15tebo": "https://script.google.com/macros/s/AKfycbycM_rN9sHomryNl3O7_2OUEj0TIlXFiONnpUFjZ-BQYzkJlA_JrL4e_Wf7LOI3nnMc/exec",
    "sman5tebo": "",
    "demo": "https://script.google.com/macros/s/AKfycbycM_rN9sHomryNl3O7_2OUEj0TIlXFiONnpUFjZ-BQYzkJlA_JrL4e_Wf7LOI3nnMc/exec"
};

let API_URL = "";
let tenantId = "";

if (window.isElectron) {
    tenantId = "desktop";
    localStorage.setItem('siempus_tenant_id', 'desktop');
    if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
        const dConfig = window.electronAPI.getConfig();
        if (dConfig && (dConfig.OFFLINE_EXEC_LINK || dConfig.gasUrl || dConfig.linkExec)) {
            API_URL = dConfig.OFFLINE_EXEC_LINK || dConfig.gasUrl || dConfig.linkExec;
        }
    }
} else {
    // Mode Online Browser
    const urlParams = new URLSearchParams(window.location.search);

    // Prioritas 1: Parameter langsung ?exec=...
    const paramExec = urlParams.get('exec');
    if (paramExec && paramExec.startsWith('http')) {
        API_URL = paramExec;
        localStorage.setItem('siempus_custom_api_url', paramExec);
    }

    // Prioritas 2: Link Exec Kustom dari Pengaturan Sekolah
    if (!API_URL) {
        const customUrl = localStorage.getItem('siempus_custom_api_url') || localStorage.getItem('customSyncLink');
        if (customUrl && customUrl.startsWith('http')) {
            API_URL = customUrl;
        }
    }

    // Prioritas 3: Parameter ?id=...
    const paramId = urlParams.get('id');
    if (paramId) {
        tenantId = paramId.trim().toLowerCase();
        if (daftarSekolah[tenantId]) {
            API_URL = daftarSekolah[tenantId];
        }
        localStorage.setItem('siempus_tenant_id', tenantId);
    } else {
        // Prioritas 4: Memori Tenant Terakhir / Nama Sekolah
        tenantId = localStorage.getItem('siempus_tenant_id');
        if (tenantId && daftarSekolah[tenantId]) {
            API_URL = daftarSekolah[tenantId];
        } else {
            try {
                const conf = JSON.parse(localStorage.getItem('siempus_pengaturan') || localStorage.getItem('appSettings') || '{}');
                const sName = conf.nama_sekolah || conf.namasekolah || '';
                if (sName) {
                    const slug = sName.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (daftarSekolah[slug]) {
                        API_URL = daftarSekolah[slug];
                        tenantId = slug;
                        localStorage.setItem('siempus_tenant_id', slug);
                    }
                }
            } catch (e) { }
        }
    }

    // Prioritas 5: BUG #7 FIX — Jangan fallback ke URL sekolah lain!
    // Jika tenant tidak dikenali, API_URL dikosongkan agar tidak bocor data antar sekolah.
    if (!API_URL && tenantId && daftarSekolah[tenantId]) {
        API_URL = daftarSekolah[tenantId];
    }
    // Catatan: Jika API_URL masih kosong di sini, apiHelper() akan menampilkan pesan error
    // "URL server sekolah belum dikonfigurasi" — pengguna harus mengatur ?id= atau ?exec= yang benar.
}
