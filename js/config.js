/* ========================================================
   DETEKSI MODE: DESKTOP (OFFLINE) vs WEB (ONLINE)
======================================================== */
window.isElectron = Boolean(
    (typeof window !== 'undefined' && (window.isElectron === true || typeof window.electronAPI !== 'undefined')) ||
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) ||
    (typeof process !== 'undefined' && process.versions && process.versions.electron)
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

// 1. Buat "Buku Telepon" yang berisi daftar sekolah dan link Backend-nya masing-masing
const daftarSekolah = {
    "sman15tebo": "https://script.google.com/macros/s/AKfycbwjSZop3gW4G-kSsW1FRTGKBkeCUZxrxOwVMxqRlke7F7aQgyJ90JWcgaNZoJRYifms/exec",
    "demo": "https://script.google.com/macros/s/AKfycbwFivYc-q2ZrU2NO91OXMkmVM7lLy5-rMUu4HxuoDuFtJFvVQQdw_VTOqxCIMDwm_Rm/exec"
};

// 2. Baca parameter ?id= dari URL browser (untuk mode Web)
let tenantId = "demo";
if (!window.isElectron) {
    const urlParams = new URLSearchParams(window.location.search);
    tenantId = urlParams.get('id');

    // Jika pengguna tidak mengetik ?id= di URL, coba ingat ID terakhir dari memori browser
    if (!tenantId) {
        tenantId = localStorage.getItem('siempus_tenant_id') || "demo";
    }

    // Keamanan: Jika pengguna ganti URL sekolah (pindah sekolah), logout otomatis akun sebelumnya
    const savedTenant = localStorage.getItem('siempus_tenant_id');
    if (savedTenant && savedTenant !== tenantId) {
        localStorage.removeItem('siempus_user');
        localStorage.removeItem('siempus_username');
        localStorage.removeItem('siempus_page');
    }

    localStorage.setItem('siempus_tenant_id', tenantId);

    // Rapikan URL di browser agar selalu terlihat ?id=namasekolah
    if (!window.location.search.includes('id=') && window.location.protocol !== 'file:') {
        window.history.replaceState(null, null, "?id=" + tenantId);
    }
} else {
    // Mode Desktop: Baca dari config offline
    tenantId = "desktop";
    localStorage.setItem('siempus_tenant_id', 'desktop');
}

// 3. Tentukan API URL berdasarkan mode & ID
let API_URL = "";
if (window.isElectron && window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
    const dConfig = window.electronAPI.getConfig();
    if (dConfig && dConfig.OFFLINE_EXEC_LINK) {
        API_URL = dConfig.OFFLINE_EXEC_LINK;
    }
}

if (!API_URL) {
    API_URL = daftarSekolah[tenantId] || daftarSekolah["demo"];
}
