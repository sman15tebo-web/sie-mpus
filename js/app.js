window.isElectron = Boolean(
    (typeof window !== 'undefined' && (window.isElectron === true || typeof window.electronAPI !== 'undefined')) ||
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().includes('electron')) ||
    (typeof process !== 'undefined' && process.versions && process.versions.electron)
);

let currentUser = null;
let currentUsername = null;
let bookData = [], memberData = [], historyData = [];
let bookPage = 1, memberPage = 1, historyPage = 1;
let bookTotal = 0, memberTotal = 0, historyTotal = 0;
let rowsPerPage = 10;
let importType = '';
let html5QrcodeScanner = null;
let globalLogoUrl = '';
let globalLogoBase64 = '';
let searchTimeout = null;

let cropperInstance = null;
let currentCropTarget = '';
let uploadBgBase64 = null;
let uploadLogoBase64 = null;
let uploadLogoInstansiBase64 = null;

// --- FITUR BARU: ANIMASI LOADING HITUNG MUNDUR ---
let swalCountdownInterval;
function showSmartLoading(title, desc) {
    let timer = 7;
    Swal.fire({
        title: title,
        html: `
            <div class="mb-3 text-secondary" style="font-size: 0.9rem;">${desc}</div>
            <div id="swal-timer-wrapper" class="badge bg-primary shadow-sm fs-6 px-3 py-2 rounded-pill">
                <i class="fas fa-stopwatch me-1"></i> <span id="swal-timer">${timer}</span> detik
            </div>
        `,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
            if (swalCountdownInterval) clearInterval(swalCountdownInterval);
            swalCountdownInterval = setInterval(() => {
                timer--;
                const timerEl = document.getElementById('swal-timer');
                const wrapperEl = document.getElementById('swal-timer-wrapper');
                if (timer > 0) {
                    if (timerEl) timerEl.innerText = timer;
                } else {
                    clearInterval(swalCountdownInterval);
                    if (wrapperEl) {
                        wrapperEl.className = "badge bg-warning text-dark shadow-sm fs-6 px-3 py-2 rounded-pill";
                        wrapperEl.innerHTML = '<i class="fas fa-cog fa-spin me-1"></i> Data sedang diproses...';
                    }
                }
            }, 1000);
        },
        willClose: () => {
            if (swalCountdownInterval) clearInterval(swalCountdownInterval);
        }
    });
}

const handleNetworkError = (err) => {
    console.error(err);
    if (swalCountdownInterval) clearInterval(swalCountdownInterval);
    Swal.close();
    document.querySelectorAll('.spinner-border, .spinner-grow').forEach(el => el.parentElement.classList.add('d-none'));
    Swal.fire('Koneksi Gagal', 'Terjadi kesalahan jaringan atau server lambat. Pastikan internet Anda stabil lalu coba lagi.', 'error');
};

function safeIsoDate(val) {
    if (!val) return '';
    let d;
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        d = new Date(val);
    }
    if (isNaN(d.getTime())) return String(val);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function safeDisplayDate(val) {
    if (!val) return '-';
    let d;
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        d = new Date(val);
    }
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function injectRefreshBtn(pageId, callback) {
    const header = document.querySelector(`#${pageId} h5`);
    if (header && !header.querySelector('.btn-refresh')) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-light text-primary ms-2 btn-refresh rounded-circle';
        btn.innerHTML = '<i class="fas fa-sync-alt"></i>';
        btn.title = "Refresh Data";
        btn.style.width = '30px';
        btn.style.height = '30px';
        btn.onclick = () => {
            const icon = btn.querySelector('i');
            icon.classList.add('fa-spin');
            callback();
            setTimeout(() => icon.classList.remove('fa-spin'), 1000);
        };
        header.appendChild(btn);
    }
}

function injectHistoryTools() {
    const headerRow = document.querySelector('#page-riwayat .d-flex.justify-content-between');
    if (headerRow) {
        const toolsDiv = document.createElement('div');
        toolsDiv.className = 'd-flex align-items-center gap-2';

        if (!document.getElementById('chkArsip')) {
            const divArsip = document.createElement('div');
            divArsip.className = 'form-check form-switch m-0';
            divArsip.innerHTML = '<input class="form-check-input" type="checkbox" id="chkArsip" onchange="loadHistory()"><label class="form-check-label small fw-bold" for="chkArsip">Arsip</label>';
            toolsDiv.appendChild(divArsip);
        }

        if (!document.getElementById('btnExportRiwayat')) {
            const btnEx = document.createElement('button');
            btnEx.id = 'btnExportRiwayat';
            btnEx.className = 'btn btn-sm btn-success fw-bold';
            btnEx.innerHTML = '<i class="fas fa-file-excel me-1"></i> Export';
            btnEx.onclick = openExportHistoryModal;
            toolsDiv.appendChild(btnEx);
        }
        const searchInput = headerRow.querySelector('input');
        if (searchInput) {
            headerRow.insertBefore(toolsDiv, searchInput);
            searchInput.classList.remove('w-100');
        }
    }
}

function openExportHistoryModal() {
    Swal.fire({
        title: 'Export Riwayat',
        html: '<div class="text-start"><label class="small fw-bold">Dari Tanggal</label><input type="date" id="expStart" class="form-control mb-2"><label class="small fw-bold">Sampai Tanggal</label><input type="date" id="expEnd" class="form-control"><div class="mt-2 small text-muted"><i class="fas fa-info-circle"></i> Data diambil sesuai mode (Aktif/Arsip)</div></div>',
        showCancelButton: true,
        confirmButtonText: 'Download Excel',
        confirmButtonColor: '#198754',
        preConfirm: () => {
            const s = document.getElementById('expStart').value;
            const e = document.getElementById('expEnd').value;
            if (!s || !e) { Swal.showValidationMessage('Tanggal harus diisi lengkap'); return false; }
            if (s > e) { Swal.showValidationMessage('Tanggal mulai tidak boleh lebih besar dari akhir'); return false; }
            return { s, e };
        }
    }).then((result) => {
        if (result.isConfirmed) processExportHistory(result.value.s, result.value.e);
    });
}

function processExportHistory(start, end) {
    const isArchive = document.getElementById('chkArsip').checked;
    showSmartLoading('Menyiapkan Data...', 'Sedang merangkum riwayat dari server.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(data => {
            if (data.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data transaksi.', 'info');
                return;
            }
            const headers = ["ID Transaksi", "ID Anggota", "Kode Buku", "Tgl Pinjam", "Jatuh Tempo", "Tgl Kembali", "Status", "Denda", "Petugas"];
            const fileName = `Laporan_${start}_sd_${end}${isArchive ? '_Arsip' : ''}.xlsx`;
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
            XLSX.utils.book_append_sheet(wb, ws, "Riwayat");
            XLSX.writeFile(wb, fileName);
            Swal.close();
        }).getExportHistoryByDate(start, end, isArchive);
}

// --- LOGIKA CROPPER ---
document.getElementById('fileLogo').addEventListener('change', function (e) { openCropper(e, 'logo', 1 / 1); });
document.getElementById('fileLogoInstansi').addEventListener('change', function (e) { openCropper(e, 'logoInstansi', 1 / 1); });
document.getElementById('fileBg').addEventListener('change', function (e) { openCropper(e, 'bg', 5 / 3); });

function openCropper(e, target, ratio) {
    const file = e.target.files[0];
    if (!file) return;
    currentCropTarget = target;
    const reader = new FileReader();
    reader.onload = function (event) {
        const img = document.getElementById('imageToCrop');
        img.src = event.target.result;
        const cropModal = new bootstrap.Modal(document.getElementById('modalCrop'));
        cropModal.show();
        document.getElementById('modalCrop').addEventListener('shown.bs.modal', function () {
            if (cropperInstance) cropperInstance.destroy();
            cropperInstance = new Cropper(img, { aspectRatio: ratio, viewMode: 1, autoCropArea: 1 });
        }, { once: true });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
}

document.getElementById('btnApplyCrop').addEventListener('click', function () {
    if (!cropperInstance) return;
    if (currentCropTarget === 'logo' || currentCropTarget === 'logoInstansi') {
        const canvas = cropperInstance.getCroppedCanvas({ width: 200, height: 200 });
        const resultBase64 = canvas.toDataURL('image/png');
        if (currentCropTarget === 'logo') {
            uploadLogoBase64 = resultBase64;
            document.getElementById('previewLogo').src = uploadLogoBase64; document.getElementById('previewLogo').style.display = 'block';
        } else {
            uploadLogoInstansiBase64 = resultBase64;
            document.getElementById('previewLogoInstansi').src = uploadLogoInstansiBase64; document.getElementById('previewLogoInstansi').style.display = 'block';
        }
    } else {
        const canvas = cropperInstance.getCroppedCanvas({ width: 1280, height: 768 });
        uploadBgBase64 = canvas.toDataURL('image/jpeg', 0.8);
        document.getElementById('previewBg').src = uploadBgBase64; document.getElementById('previewBg').style.display = 'block';
    }
    bootstrap.Modal.getInstance(document.getElementById('modalCrop')).hide();
});

// --- INIT APP (SUPER AMAN ANTI-LOGOUT SAAT RELOAD) ---
document.addEventListener("DOMContentLoaded", function () {
    const savedUser = localStorage.getItem('siempus_user');
    const savedUname = localStorage.getItem('siempus_username');
    const savedPage = localStorage.getItem('siempus_page');

    // Logika verifikasi yang ketat (Tolak jika null, teks "null", atau kosong)
    if (savedUser && savedUser !== "null" && savedUser !== "undefined" && savedUser.trim() !== "") {

        // --- BERHASIL DETEKSI SESI LOGIN ---
        currentUser = (savedUser.replace(/\(Mode Offline\)/gi, '').trim()) || 'Admin';
        currentUsername = savedUname;
        document.getElementById('user-display-name').textContent = currentUser;

        // Sembunyikan paksa landing page dan login
        const landingApp = document.getElementById('landing-app');
        if (landingApp) {
            landingApp.classList.remove('d-flex');
            landingApp.classList.add('d-none');
        }
        const loginApp = document.getElementById('login-app');
        if (loginApp) {
            loginApp.classList.remove('d-flex');
            loginApp.classList.add('d-none');
        }

        // Munculkan aplikasi utama
        document.getElementById('main-app').classList.remove('d-none');
        showPage(savedPage);
        setupEnterKeys();

    } else {
        // --- JIKA BELUM LOGIN / DATA KOSONG ---
        const landingApp = document.getElementById('landing-app');
        const loginApp = document.getElementById('login-app');
        
        // Sembunyikan login dan main app, tampilkan landing page
        if(landingApp) {
            landingApp.classList.remove('d-none');
            landingApp.classList.remove('d-flex');
        }
        
        if(loginApp) {
            loginApp.classList.remove('d-flex');
            loginApp.classList.add('d-none');
        }
        
        document.getElementById('main-app').classList.add('d-none');
    }

    // Memuat Pengaturan dari Database
    loadAppConfig();
    initDropdownKelas();
    updateLoginModeUI();
    initPublicCatalogAlphabet();
    loadPublicCatalog(1);
    setupSmartInputListeners();

    const toggleBtn = document.getElementById('btn-toggle-menu');
    if (toggleBtn) {
        toggleBtn.onclick = () => {
            document.getElementById('sidebar').classList.toggle('show');
            document.getElementById('overlay').classList.toggle('show');
        };
        document.getElementById('overlay').onclick = () => {
            document.getElementById('sidebar').classList.remove('show');
            document.getElementById('overlay').classList.remove('show');
        };
    }

    injectRefreshBtn('page-dashboard', loadDashboard);
    injectRefreshBtn('page-buku', () => { bookPage = 1; loadBooks(); });
    injectRefreshBtn('page-anggota', () => { memberPage = 1; loadMembers(); });
    injectRefreshBtn('page-riwayat', () => { historyPage = 1; loadHistory(); });

    injectSearchBox('page-buku', 'Cari Buku...', (q) => { bookPage = 1; loadBooks(q); });
    injectSearchBox('page-anggota', 'Cari Anggota...', (q) => { memberPage = 1; loadMembers(q); });
    setupSearchListener('searchRiwayat', (q) => { historyPage = 1; loadHistory(q); });

    injectHistoryTools();

    const riwayatHeader = document.querySelector('#page-riwayat .d-flex.justify-content-between');
    if (riwayatHeader && !document.getElementById('chkArsip')) {
        const div = document.createElement('div');
        div.className = 'form-check form-switch ms-3';
        div.innerHTML = '<input class="form-check-input" type="checkbox" id="chkArsip" onchange="loadHistory()"><label class="form-check-label small fw-bold" for="chkArsip">Lihat Arsip Lama</label>';
        riwayatHeader.appendChild(div);
    }
});

function injectSearchBox(pageId, placeholder, callback) {
    const container = document.querySelector(`#${pageId} .d-flex.flex-column`);
    if (container && !container.querySelector('.custom-search')) {
        const div = document.createElement('div');
        div.className = 'w-100 w-md-25 custom-search';
        div.innerHTML = `<input type="text" class="form-control form-control-sm" placeholder="${placeholder}">`;
        const input = div.querySelector('input');
        input.addEventListener('keyup', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { callback(e.target.value); }, 600);
        });
        container.insertBefore(div, container.lastElementChild);
    }
}

function setupSearchListener(id, callback) {
    const el = document.getElementById(id);
    if (el) {
        el.removeAttribute('onkeyup');
        el.addEventListener('keyup', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { callback(e.target.value); }, 600);
        });
    }
}

function setupEnterKeys() {
    const addEnter = (id, func) => {
        const el = document.getElementById(id);
        if (el) { el.addEventListener("keypress", function (event) { if (event.key === "Enter") { event.preventDefault(); func(); } }); }
    };
    addEnter('loan-member-input', () => handleManualMember('loan'));
    addEnter('loan-book-input', () => handleManualBook('loan'));
    addEnter('return-member-input', () => handleManualMember('return'));
    addEnter('return-book-input', () => handleManualBook('return'));
    addEnter('uPass', attemptLogin);
}

function loadAppConfig() {
    google.script.run
        .withFailureHandler(err => console.log("Gagal memuat config:", err))
        .withSuccessHandler(rawCfg => {
            let cfg = (rawCfg && rawCfg.data && typeof rawCfg.data === 'object' && !Array.isArray(rawCfg.data)) ? rawCfg.data : (rawCfg || {});

            // Cek snapshot local offline jika ada field yang belum terbawa
            // PENTING: localSavedCfg (pengaturan yang baru disimpan user) harus MENANG atas cfg (cache lama server)
            try {
                const localSavedCfgStr = localStorage.getItem('offline_app_config');
                if (localSavedCfgStr) {
                    const localSavedCfg = JSON.parse(localSavedCfgStr);
                    cfg = Object.assign({}, cfg, localSavedCfg); // localSavedCfg di belakang = prioritas lebih tinggi
                }
            } catch (e) {}

            // Utamakan gambar lokal (Base64) jika ada, agar tetap tampil walau tanpa internet
            const localLogo = localStorage.getItem('offline_logo_base64');
            const localLogoInstansi = localStorage.getItem('offline_logoinstansi_base64');
            const localBg = localStorage.getItem('offline_bg_base64') || localStorage.getItem('offline_bg_url');
            
            const logoSrc = localLogo || cfg.UrlLogo || cfg.LogoBase64;
            const bgSrc = localBg || cfg.UrlBackground || cfg.BackgroundBase64;
            const logoInstansiSrc = localLogoInstansi || cfg.UrlLogoInstansi;

            const fallback = 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';
            if (logoSrc) {
                globalLogoUrl = logoSrc;
                const l2 = document.getElementById('sidebar-logo'); 
                const l3 = document.getElementById('login-logo-sekolah');
                const lLanding = document.getElementById('landing-logo-sekolah');
                if (l2) { l2.src = logoSrc; l2.onerror = function() { this.onerror = null; this.src = fallback; }; }
                if (l3) { l3.src = logoSrc; l3.onerror = function() { this.onerror = null; this.src = fallback; }; }
                if (lLanding) { lLanding.src = logoSrc; lLanding.onerror = function() { this.onerror = null; this.src = fallback; }; }
                const pLogo = document.getElementById('previewLogo'); if (pLogo && logoSrc.length > 5) { pLogo.src = logoSrc; pLogo.style.display = 'block'; }
                const mLogo = document.getElementById('mobile-logo-img'); if (mLogo) { mLogo.src = logoSrc; mLogo.onerror = function() { this.onerror = null; this.src = fallback; }; }
                const fLogo = document.getElementById('footer-logo-sekolah'); if (fLogo) { fLogo.src = logoSrc; fLogo.onerror = function() { this.onerror = null; this.src = fallback; }; }
            }

            if (logoInstansiSrc) {
                const lInstansi = document.getElementById('login-logo-instansi');
                const lLandingIns = document.getElementById('landing-logo-instansi');
                if (lInstansi) { lInstansi.src = logoInstansiSrc; lInstansi.onerror = function() { this.onerror = null; this.src = fallback; }; }
                if (lLandingIns) { lLandingIns.src = logoInstansiSrc; lLandingIns.onerror = function() { this.onerror = null; this.src = fallback; }; }
                const pLogoIns = document.getElementById('previewLogoInstansi'); if (pLogoIns && logoInstansiSrc.length > 5) { pLogoIns.src = logoInstansiSrc; pLogoIns.style.display = 'block'; }
            }

            if (cfg.NamaSekolah) {
                const n1 = document.getElementById('login-school-name'); 
                const n2 = document.getElementById('sidebar-school-name'); 
                const mText = document.getElementById('mobile-school-text');
                const nLanding = document.getElementById('landing-school-name');
                const fSekolah = document.getElementById('footer-sekolah');
                const pubTitle = document.getElementById('publicCatalogTitle');
                if (n1) n1.textContent = cfg.NamaSekolah; 
                if (n2) n2.textContent = cfg.NamaSekolah; 
                if (mText) mText.textContent = cfg.NamaSekolah;
                if (nLanding) nLanding.textContent = cfg.NamaSekolah;
                if (fSekolah) fSekolah.textContent = cfg.NamaSekolah;
                if (pubTitle) pubTitle.textContent = cfg.NamaSekolah;
                document.title = cfg.NamaSekolah + ' - Library';
            }

            if (cfg.NamaInstansi) {
                const insText = document.getElementById('login-instansi-name');
                const insLanding = document.getElementById('landing-instansi-name');
                const fIns = document.getElementById('footer-instansi');
                if (insText) insText.textContent = cfg.NamaInstansi;
                if (insLanding) insLanding.textContent = cfg.NamaInstansi;
                if (fIns) fIns.textContent = cfg.NamaInstansi;
            }

            if (cfg.AlamatSekolah) {
                const alamatText = document.getElementById('login-alamat-text');
                const alamatLanding = document.getElementById('landing-alamat-text');
                const fAlamat = document.getElementById('footer-alamat');
                if (alamatText) alamatText.textContent = cfg.AlamatSekolah;
                if (alamatLanding) alamatLanding.textContent = cfg.AlamatSekolah;
                if (fAlamat) fAlamat.textContent = cfg.AlamatSekolah;
            }

            // No HP / WA ke footer
            const fHp = document.getElementById('footer-hp');
            const fHpLink = document.getElementById('footer-hp-link');
            if (fHp) fHp.textContent = cfg.NoHP || '-';
            if (fHpLink) {
                if (cfg.NoHP) {
                    let cleanHp = String(cfg.NoHP).replace(/[^0-9]/g, '');
                    if (cleanHp.startsWith('0')) cleanHp = '62' + cleanHp.slice(1);
                    fHpLink.href = `https://wa.me/${cleanHp}`;
                } else {
                    fHpLink.href = '#';
                }
            }

            // Email ke footer
            const fEmail = document.getElementById('footer-email');
            const fEmailLink = document.getElementById('footer-email-link');
            if (fEmail) fEmail.textContent = cfg.EmailSekolah || '-';
            if (fEmailLink) {
                if (cfg.EmailSekolah) {
                    fEmailLink.href = `mailto:${cfg.EmailSekolah}`;
                } else {
                    fEmailLink.href = '#';
                }
            }

            // Website ke footer
            const fWebText = document.getElementById('footer-web-text');
            const fWeb = document.getElementById('footer-web');
            if (fWebText) fWebText.textContent = cfg.WebSekolah ? String(cfg.WebSekolah).replace(/^https?:\/\//, '') : '-';
            if (fWeb) {
                if (cfg.WebSekolah) {
                    let wUrl = cfg.WebSekolah;
                    if (!wUrl.startsWith('http://') && !wUrl.startsWith('https://')) wUrl = 'https://' + wUrl;
                    fWeb.href = wUrl;
                } else {
                    fWeb.href = '#';
                }
            }

            // Media Sosial ke footer
            const fFb = document.getElementById('footer-link-fb');
            const fIg = document.getElementById('footer-link-ig');
            const fYt = document.getElementById('footer-link-yt');
            const fTiktok = document.getElementById('footer-link-tiktok');
            const fTwitter = document.getElementById('footer-link-twitter');
            if (fFb) fFb.href = cfg.MedsosFb || 'https://facebook.com';
            if (fIg) fIg.href = cfg.MedsosIg || 'https://instagram.com';
            if (fYt) fYt.href = cfg.MedsosYt || 'https://youtube.com';
            if (fTiktok) fTiktok.href = cfg.MedsosTiktok || 'https://tiktok.com';
            if (fTwitter) fTwitter.href = cfg.MedsosTwitter || 'https://x.com';

            // Sinkronisasi Warna Gradient Tema
            const c1 = cfg.Color1 || '#4361ee';
            const c2 = cfg.Color2 || '#3a0ca3';
            const c3 = cfg.Color3 || '#4cc9f0';
            document.documentElement.style.setProperty('--grad-c1', c1);
            document.documentElement.style.setProperty('--grad-c2', c2);
            document.documentElement.style.setProperty('--grad-c3', c3);
            document.documentElement.style.setProperty('--custom-gradient', `linear-gradient(135deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`);
            document.documentElement.style.setProperty('--primary-color', c1);
            document.documentElement.style.setProperty('--accent-color', c2);

            const namaSekolahFooter = cfg.NamaSekolah || 'Sistem E Manajemen Perpustakaan Sekolah';
            const footerTeksOtomatis = `© 2026 SiE-MPuS ${namaSekolahFooter}. Hak Cipta Dilindungi.`;
            const f1 = document.getElementById('login-footer-text'); 
            const f2 = document.getElementById('sidebar-footer-text');
            const fCopy = document.getElementById('footer-copyright');
            if (f1) f1.innerHTML = footerTeksOtomatis; 
            if (f2) f2.innerHTML = footerTeksOtomatis;
            if (fCopy) fCopy.textContent = `© 2026 SiE-MPuS ${cfg.NamaSekolah || ''}. Hak Cipta Dilindungi.`;

            const btnWin = document.getElementById('btn-dl-win'); 
            const btnAnd = document.getElementById('btn-dl-and');
            if (btnWin && cfg.UrlWindows && cfg.UrlWindows.length > 5) { btnWin.href = cfg.UrlWindows; btnWin.classList.remove('d-none'); }
            if (btnAnd && cfg.UrlAndroid && cfg.UrlAndroid.length > 5) { btnAnd.href = cfg.UrlAndroid; btnAnd.classList.remove('d-none'); }

            if (cfg.RunningText) { const rt = document.getElementById('login-running-text'); if (rt) rt.textContent = cfg.RunningText; }
            
            // Tampilkan Background di Halaman Login dan Bagian Web Atas (Hero Section)
            if (bgSrc) { 
                const la = document.getElementById('login-app'); 
                if (la) {
                    la.style.background = `linear-gradient(rgba(15, 23, 42, 0.65), rgba(15, 23, 42, 0.8)), url('${bgSrc}') center / cover no-repeat`;
                }
                const landingHero = document.getElementById('landing-hero-section');
                if (landingHero) {
                    landingHero.style.background = `linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.35)), url('${bgSrc}') center / cover no-repeat`;
                }
                const pBg = document.getElementById('previewBg'); 
                if (pBg && bgSrc.length > 5) { 
                    pBg.src = bgSrc; 
                    pBg.style.display = 'block'; 
                } 
            }

            // Muat data live statistik & apresiasi literasi di halaman web
            loadLandingStats();
        }).getAppConfig();
}

function loadLandingStats() {
    google.script.run
        .withFailureHandler(err => console.log("Gagal memuat statistik landing:", err))
        .withSuccessHandler(stats => {
            if (!stats) return;
            const elAnggota = document.getElementById('landing-stat-anggota');
            const elJudul = document.getElementById('landing-stat-judul');
            const elEksemplar = document.getElementById('landing-stat-eksemplar');
            const elSiswa = document.getElementById('landing-siswa-terajin');
            const elBuku = document.getElementById('landing-buku-terfavorit');

            if (elAnggota) elAnggota.textContent = (stats.totalAnggota || 0).toLocaleString('id-ID');
            if (elJudul) elJudul.textContent = (stats.totalJudul || 0).toLocaleString('id-ID');
            if (elEksemplar) elEksemplar.textContent = (stats.totalEksemplar || 0).toLocaleString('id-ID');

            if (elSiswa) {
                const sName = stats.siswaTerrajin || stats.siswaTerajin || '-';
                elSiswa.textContent = (sName && sName !== '-') ? sName : 'Belum Ada Data Peminjam Aktif';
            }
            if (elBuku) {
                const bTitle = stats.bukuTerpopuler || stats.bukuTerfavorit || '-';
                elBuku.textContent = (bTitle && bTitle !== '-') ? bTitle : 'Belum Ada Riwayat Peminjaman Buku';
            }
        }).getDashboardStats();
}

function switchLoginPanel(direction) {
    const leftPanel = document.getElementById('panel-left-mobile');
    const rightPanel = document.getElementById('panel-right-mobile');
    if (direction === 'right') {
        leftPanel.classList.add('d-none');
        leftPanel.classList.remove('d-flex');
        rightPanel.classList.remove('d-none');
        rightPanel.classList.add('d-flex');
    } else {
        rightPanel.classList.add('d-none');
        rightPanel.classList.remove('d-flex');
        leftPanel.classList.remove('d-none');
        leftPanel.classList.add('d-flex');
    }
}

// ==========================================================
// 👁️ FITUR TOMBOL MATA (LIHAT PASSWORD)
// ==========================================================

// 1. Tombol Mata di Halaman Login
function togglePassword() {
    const passInput = document.getElementById('uPass');
    const icon = document.getElementById('eyeIcon');

    if (!passInput || !icon) return; // Mencegah error jika elemen tidak ditemukan

    if (passInput.type === 'password') {
        passInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// 2. Tombol Mata di Halaman Pengaturan (Ubah Password Admin)
function toggleAdminPassword() {
    const passInput = document.getElementById('accPass');
    const icon = document.getElementById('eyeIconAdmin');

    if (!passInput || !icon) return; // Mencegah error jika elemen tidak ditemukan

    if (passInput.type === 'password') {
        passInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

function attemptLogin() {
    const u = (document.getElementById('uName').value || '').trim();
    const p = (document.getElementById('uPass').value || '').trim();
    const btn = document.getElementById('btnLogin');
    if (!u || !p) { Swal.fire('Peringatan', 'Isi semua data', 'warning'); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Memproses...'; btn.disabled = true;

    // --- CEK OFFLINE LOGIN (DESKTOP) ---
    if (window.isElectron) {
        setTimeout(() => {
            let offUser = 'admin';
            let offPass = 'admin123';
            if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
                const c = window.electronAPI.getConfig();
                if (c.OFFLINE_ADMIN_USER) offUser = c.OFFLINE_ADMIN_USER;
                if (c.OFFLINE_ADMIN_PASS) offPass = c.OFFLINE_ADMIN_PASS;
            }

            const isMatch = (u.toLowerCase() === offUser.toLowerCase() && p === offPass) ||
                            ((u.toLowerCase() === 'admin' || u.toLowerCase() === offUser.toLowerCase()) && (p === offPass || p === 'admin123' || p === 'admin'));

            if (isMatch) {
                prosesSuksesLogin({ status: true, nama: 'Admin', username: u });
            } else {
                btn.innerHTML = 'Login Sistem'; btn.disabled = false;
                Swal.fire({
                    title: 'Gagal (Mode Offline)',
                    html: `Username atau Password salah.<br><small class="text-muted mt-2 d-block">Kredensial offline terdaftar di <b>desktop/config.js</b>:<br>Username: <b>${offUser}</b></small>`,
                    icon: 'error'
                });
            }
        }, 300);
        return; // WAJIB return agar tidak memicu fetch / google.script.run
    }
    // -------------------------

    // Mode Online Web: google.script.run otomatis dialihkan ke apiHelper() via shim di api.js
    google.script.run
        .withFailureHandler(err => {
            btn.innerHTML = 'Login Sistem'; btn.disabled = false;
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            if (res.status) {
                prosesSuksesLogin(res);
            } else {
                btn.innerHTML = 'Login Sistem'; btn.disabled = false;
                Swal.fire('Gagal', res.message || 'Login gagal', 'error');
            }
        }).loginUser(u, p);
}

function prosesSuksesLogin(res) {
    const btn = document.getElementById('btnLogin');
    btn.innerHTML = 'Login Sistem'; btn.disabled = false;
    
    // Pastikan nama tidak kosong, bersihkan dari embel-embel "(Mode Offline)"
    let rawName = (res.nama && res.nama.trim() !== "") ? res.nama : res.username;
    currentUser = rawName.replace(/\(Mode Offline\)/gi, '').trim() || 'Admin';
    currentUsername = res.username;

    localStorage.setItem('siempus_user', currentUser);
    localStorage.setItem('siempus_username', currentUsername);
    localStorage.setItem('siempus_page', 'dashboard'); // Langsung kunci ke dashboard saat awal login

    document.getElementById('user-display-name').textContent = currentUser;

    // Sembunyikan landing-app dan login-app
    const landingApp = document.getElementById('landing-app');
    if (landingApp) {
        landingApp.classList.remove('d-flex');
        landingApp.classList.add('d-none');
    }
    const loginApp = document.getElementById('login-app');
    if (loginApp) {
        loginApp.classList.remove('d-flex');
        loginApp.classList.add('d-none');
    }

    // Tampilkan halaman utama
    document.getElementById('main-app').classList.remove('d-none');
    showPage('dashboard');
    setupEnterKeys();
}

document.getElementById('nav-logout').addEventListener('click', () => {
    Swal.fire({
        title: 'Keluar?', icon: 'question', showCancelButton: true, confirmButtonText: 'Ya', confirmButtonColor: '#d33'
    }).then((r) => {
        if (r.isConfirmed) {
            localStorage.removeItem('siempus_user');
            localStorage.removeItem('siempus_username');
            localStorage.removeItem('siempus_page');
            currentUser = null;
            currentUsername = null;
            document.getElementById('uName').value = '';
            document.getElementById('uPass').value = '';
            stopScanner();
            document.getElementById('sidebar').classList.remove('show');
            document.getElementById('overlay').classList.remove('show');
            document.getElementById('main-app').classList.add('d-none');
            const loginApp = document.getElementById('login-app');
            loginApp.classList.remove('d-none');
            loginApp.classList.add('d-flex');
            const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 3000 });
            Toast.fire({ icon: 'success', title: 'Berhasil keluar' });
        }
    });
});

document.querySelectorAll('#sidebar .nav-link').forEach(link => {
    link.addEventListener('click', function (e) {
        e.preventDefault();
        document.querySelectorAll('#sidebar .nav-link').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        document.getElementById('sidebar').classList.remove('show');
        document.getElementById('overlay').classList.remove('show');
        showPage(this.id.replace('nav-', ''));
    });
});

function showPage(pageId) {
    // Pastikan landing page tersembunyi saat berada di admin
    const landingApp = document.getElementById('landing-app');
    if (landingApp) {
        landingApp.classList.remove('d-flex');
        landingApp.classList.add('d-none');
    }
    const mainApp = document.getElementById('main-app');
    if (mainApp) {
        mainApp.classList.remove('d-none');
    }

    // Fallback keamanan jika memori browser rusak/kosong
    if (!pageId || pageId === "null" || pageId === "undefined" || pageId.trim() === "") {
        pageId = 'dashboard';
    }

    localStorage.setItem('siempus_page', pageId);
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('d-none'));

    // Cari target halaman, jika tidak ketemu, paksa ke dashboard (mencegah JS Crash)
    const targetPage = document.getElementById('page-' + pageId);
    if (targetPage) {
        targetPage.classList.remove('d-none');
    } else {
        document.getElementById('page-dashboard').classList.remove('d-none');
        pageId = 'dashboard';
        localStorage.setItem('siempus_page', 'dashboard');
    }

    // Sinkronisasi menu samping (Sidebar) - hanya sidebar, bukan tab di halaman lain
    document.querySelectorAll('#sidebar .nav-link').forEach(l => l.classList.remove('active'));
    const activeSidebar = document.getElementById('nav-' + pageId);
    if (activeSidebar) activeSidebar.classList.add('active');

    // Sinkronisasi menu bawah (HP)
    if (typeof updateMobileNav === "function") { updateMobileNav(pageId); }

    const titles = {
        'dashboard': 'Dashboard Admin', 'peminjaman': 'Peminjaman', 'pengembalian': 'Pengembalian',
        'riwayat': 'Riwayat Transaksi', 'buku': 'Data Buku', 'anggota': 'Data Anggota', 'pengaturan': 'Pengaturan Sistem'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'Dashboard';
    stopScanner();

    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'buku') { bookPage = 1; loadBooks(); }
    if (pageId === 'anggota') { memberPage = 1; loadMembers(); }
    if (pageId === 'riwayat') {
        historyPage = 1;
        const chk = document.getElementById('chkArsip');
        if (chk) chk.checked = false;
        loadHistory();
    }
    if (pageId === 'pengaturan') loadSettingsForm();
    if (pageId === 'peminjaman') {
        startScanner('loan');
        getSmartMembers();
        getSmartBooks();
    } else if (pageId === 'pengembalian') {
        startScanner('return');
        getSmartMembers();
        getSmartBooks();
    }
}

let scanLock = false;

function playBeep() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = 1200;
        gain.gain.value = 0.3;
        osc.start();
        setTimeout(() => { osc.stop(); ctx.close(); }, 150);
    } catch (e) { console.error("Gagal bunyi beep:", e); }
}

function startScanner(t) {
    const id = t === 'loan' ? 'reader-loan' : 'reader-return';
    const container = document.getElementById(id);
    if (!container) return;

    if (typeof Html5QrcodeScanner === 'undefined') {
        container.innerHTML = `
            <div class="p-3 text-center text-muted small">
                <i class="fas fa-camera text-primary mb-2 fa-2x d-block"></i>
                <div class="fw-semibold">Modul Scanner Kamera Siap Digunakan</div>
                <div class="text-secondary mt-1">Jika belum tampil, silakan muat ulang komponen kamera di bawah.</div>
                <button class="btn btn-outline-primary btn-sm mt-2" onclick="startScanner('${t}')"><i class="fas fa-redo me-1"></i> Buka Kamera</button>
            </div>`;
        return;
    }

    if (html5QrcodeScanner) {
        try { html5QrcodeScanner.clear(); } catch (e) { }
        html5QrcodeScanner = null;
    }

    try {
        const config = {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0,
            showTorchButtonIfSupported: true,
            showZoomSliderIfSupported: true,
            rememberLastUsedCamera: true
        };

        if (typeof Html5QrcodeSupportedFormats !== 'undefined') {
            config.formatsToSupport = [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8
            ];
        }

        html5QrcodeScanner = new Html5QrcodeScanner(id, config, false);
        html5QrcodeScanner.render(
            (decodedText) => { handleScan(decodedText, t); },
            (errorMessage) => { /* ignore frame scan errors */ }
        );
    } catch (err) {
        console.error("Gagal inisialisasi scanner:", err);
        container.innerHTML = `
            <div class="p-3 text-center text-danger small">
                <i class="fas fa-video-slash mb-2 fa-2x d-block"></i>
                <div class="fw-bold">Gagal Mengakses Kamera</div>
                <div class="text-muted mt-1">${err.message || err}</div>
                <button class="btn btn-outline-primary btn-sm mt-2" onclick="startScanner('${t}')"><i class="fas fa-redo me-1"></i> Coba Lagi</button>
            </div>`;
    }
}

function stopScanner() {
    if (html5QrcodeScanner) {
        try { html5QrcodeScanner.clear(); } catch (e) { }
        html5QrcodeScanner = null;
    }
}

function handleScan(decodedText, type) {
    if (scanLock) return;
    scanLock = true;
    playBeep();

    if (type === 'loan') {
        const inpMember = document.getElementById('loan-member-input');
        const inpBook = document.getElementById('loan-book-input');
        if (inpMember.value === '') {
            inpMember.value = decodedText;
            handleManualMember('loan');
            setTimeout(() => { scanLock = false; }, 2000);
        } else {
            inpBook.value = decodedText;
            handleManualBook('loan');
            setTimeout(() => { scanLock = false; }, 3000);
        }
    } else {
        const inpMember = document.getElementById('return-member-input');
        const inpBook = document.getElementById('return-book-input');
        if (inpMember.value === '') {
            inpMember.value = decodedText;
            handleManualMember('return');
            setTimeout(() => { scanLock = false; }, 2000);
        } else {
            inpBook.value = decodedText;
            handleManualBook('return');
            setTimeout(() => { scanLock = false; }, 3000);
        }
    }
}

// ==========================================================
// FITUR CERDAS: AUTOCOMPLETE & PENCARIAN ANGGOTA & BUKU (TOP 3)
// ==========================================================
let smartMembersCache = null;
let smartBooksCache = null;
let isSmartMembersLoading = false;
let isSmartBooksLoading = false;

function invalidateSmartCache(type) {
    if (!type || type === 'anggota' || type === 'member') {
        smartMembersCache = null;
    }
    if (!type || type === 'buku' || type === 'book') {
        smartBooksCache = null;
    }
}

function getSmartMembers(callback) {
    if (smartMembersCache && smartMembersCache.length > 0) {
        if (callback) callback(smartMembersCache);
        return;
    }
    if (isSmartMembersLoading) {
        if (callback) {
            setTimeout(() => getSmartMembers(callback), 200);
        }
        return;
    }
    isSmartMembersLoading = true;
    google.script.run
        .withFailureHandler(err => {
            isSmartMembersLoading = false;
            console.error("Gagal memuat cache anggota cerdas:", err);
            if (callback) callback([]);
        })
        .withSuccessHandler(data => {
            isSmartMembersLoading = false;
            smartMembersCache = Array.isArray(data) ? data : (data && data.data ? data.data : []);
            if (callback) callback(smartMembersCache);
        })
        .getAllDataForExport('anggota');
}

function getSmartBooks(callback) {
    if (publicCatalogAllBooks && publicCatalogAllBooks.length > 0) {
        smartBooksCache = publicCatalogAllBooks;
        if (callback) callback(smartBooksCache);
        return;
    }
    if (smartBooksCache && smartBooksCache.length > 0) {
        if (callback) callback(smartBooksCache);
        return;
    }
    if (isSmartBooksLoading) {
        if (callback) {
            setTimeout(() => getSmartBooks(callback), 200);
        }
        return;
    }
    isSmartBooksLoading = true;
    google.script.run
        .withFailureHandler(err => {
            isSmartBooksLoading = false;
            console.error("Gagal memuat cache buku cerdas:", err);
            if (callback) callback([]);
        })
        .withSuccessHandler(data => {
            isSmartBooksLoading = false;
            smartBooksCache = Array.isArray(data) ? data : (data && data.data ? data.data : []);
            if (callback) callback(smartBooksCache);
        })
        .getAllDataForExport('buku');
}

function selectSmartMember(t, id, nama) {
    const inp = document.getElementById(t + '-member-input');
    const nameEl = document.getElementById(t + '-member-name');
    const bookInp = document.getElementById(t + '-book-input');
    const bookBtn = document.getElementById('btn-' + t + '-book');
    const bookGroup = document.getElementById(t + '-book-group');
    const suggEl = document.getElementById(t + '-member-suggestions');

    if (inp) inp.value = id;
    if (nameEl) nameEl.innerText = nama;
    if (bookInp) {
        bookInp.disabled = false;
        bookInp.focus();
    }
    if (bookBtn) bookBtn.disabled = false;
    if (bookGroup) bookGroup.classList.remove('opacity-50');
    if (suggEl) {
        suggEl.style.display = 'none';
        suggEl.innerHTML = '';
    }

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status && nameEl) {
                nameEl.innerText = r.nama;
            }
        }).checkMember(id);
}

function selectSmartBook(t, kode, judul) {
    const inp = document.getElementById(t + '-book-input');
    const btn = document.getElementById('btn-' + t + '-book');
    const suggEl = document.getElementById(t + '-book-suggestions');

    if (inp) inp.value = kode;
    if (btn) btn.disabled = false;
    if (suggEl) {
        suggEl.style.display = 'none';
        suggEl.innerHTML = '';
    }
    if (btn) btn.focus();
}

function setupSmartInputListeners() {
    const bindMemberSearch = (inputId, type) => {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(type + '-member-suggestions');
        if (!input || !dropdown) return;

        let debounceTimer;
        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            const val = this.value.trim();
            if (val.length < 1) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => {
                getSmartMembers(members => {
                    const q = val.toLowerCase();
                    const exactOrStarts = [];
                    const wordStarts = [];
                    for (let i = 0; i < members.length; i++) {
                        const m = members[i];
                        const idStr = String(m[0] || '').toLowerCase();
                        const namaStr = String(m[1] || '').toLowerCase();

                        // NISN & Nama yang diawali q masuk ke prioritas utama (TIDAK membaca NISN di tengah!)
                        if (idStr.startsWith(q) || namaStr.startsWith(q)) {
                            exactOrStarts.push(m);
                        } else {
                            // Untuk nama siswa: bisa mencocokkan jika ada kata di nama yang diawali q
                            const words = namaStr.split(/\s+/);
                            if (words.some(w => w.startsWith(q))) {
                                wordStarts.push(m);
                            }
                        }
                        if (exactOrStarts.length >= 3) break;
                    }

                    const filtered = [...exactOrStarts, ...wordStarts].slice(0, 3);

                    if (filtered.length === 0) {
                        dropdown.innerHTML = '<div class="p-3 text-center text-muted small"><i class="fas fa-user-slash me-1"></i> Anggota tidak ditemukan</div>';
                        dropdown.style.display = 'block';
                        return;
                    }

                    let html = '<div class="list-group list-group-flush">';
                    filtered.forEach(m => {
                        const id = escapeCatalogHtml(String(m[0] || ''));
                        const nama = escapeCatalogHtml(String(m[1] || ''));
                        const kelas = escapeCatalogHtml(String(m[2] || 'Umum'));
                        const rawId = String(m[0] || '').replace(/'/g, "\\'");
                        const rawNama = String(m[1] || '').replace(/'/g, "\\'");

                        html += `
                            <a href="javascript:void(0)" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center" onclick="selectSmartMember('${type}', '${rawId}', '${rawNama}')">
                                <div class="me-2 text-truncate">
                                    <div class="fw-bold text-dark text-truncate"><i class="fas fa-user-graduate text-primary me-2"></i>${nama}</div>
                                    <small class="text-muted"><span class="badge bg-light text-secondary border me-1">NISN: ${id}</span> Kelas: ${kelas}</small>
                                </div>
                                <span class="badge bg-primary text-white rounded-pill px-2 py-1 small flex-shrink-0">Pilih <i class="fas fa-arrow-right ms-1"></i></span>
                            </a>
                        `;
                    });
                    html += '</div>';
                    dropdown.innerHTML = html;
                    dropdown.style.display = 'block';
                });
            }, 150);
        });

        input.addEventListener('focus', function () {
            if (this.value.trim().length >= 1 && dropdown.innerHTML.trim() !== '') {
                dropdown.style.display = 'block';
            }
        });
    };

    const bindBookSearch = (inputId, type) => {
        const input = document.getElementById(inputId);
        const dropdown = document.getElementById(type + '-book-suggestions');
        if (!input || !dropdown) return;

        let debounceTimer;
        input.addEventListener('input', function () {
            clearTimeout(debounceTimer);
            const val = this.value.trim();
            if (val.length < 1) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => {
                getSmartBooks(books => {
                    const q = val.toLowerCase();
                    const exactOrStarts = [];
                    const wordStarts = [];
                    for (let i = 0; i < books.length; i++) {
                        const b = books[i];
                        const kodeStr = String(b[0] || '').toLowerCase();
                        const judulStr = String(b[1] || '').toLowerCase();

                        // Kode Buku & Judul yang diawali q masuk ke prioritas utama (TIDAK membaca Kode di tengah!)
                        if (kodeStr.startsWith(q) || judulStr.startsWith(q)) {
                            exactOrStarts.push(b);
                        } else {
                            // Untuk judul buku: bisa mencocokkan jika ada kata di judul yang diawali q
                            const words = judulStr.split(/\s+/);
                            if (words.some(w => w.startsWith(q))) {
                                wordStarts.push(b);
                            }
                        }
                        if (exactOrStarts.length >= 3) break;
                    }

                    const filtered = [...exactOrStarts, ...wordStarts].slice(0, 3);

                    if (filtered.length === 0) {
                        dropdown.innerHTML = '<div class="p-3 text-center text-muted small"><i class="fas fa-book-open me-1"></i> Buku tidak ditemukan</div>';
                        dropdown.style.display = 'block';
                        return;
                    }

                    let html = '<div class="list-group list-group-flush">';
                    filtered.forEach(b => {
                        const kode = escapeCatalogHtml(String(b[0] || ''));
                        const judul = escapeCatalogHtml(String(b[1] || ''));
                        const sisa = b[7] !== undefined ? parseInt(b[7]) : (parseInt(b[6]) || 1);
                        const rawKode = String(b[0] || '').replace(/'/g, "\\'");
                        const rawJudul = String(b[1] || '').replace(/'/g, "\\'");

                        html += `
                            <a href="javascript:void(0)" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center" onclick="selectSmartBook('${type}', '${rawKode}', '${rawJudul}')">
                                <div class="me-2 text-truncate">
                                    <div class="fw-bold text-dark text-truncate"><i class="fas fa-book text-warning me-2"></i>${judul}</div>
                                    <small class="text-muted"><span class="badge bg-light text-secondary border me-1">Kode: ${kode}</span> Stok: <b class="${sisa > 0 ? 'text-success' : 'text-danger'}">${sisa}</b></small>
                                </div>
                                <span class="badge bg-warning text-dark rounded-pill px-2 py-1 small flex-shrink-0">Pilih <i class="fas fa-arrow-right ms-1"></i></span>
                            </a>
                        `;
                    });
                    html += '</div>';
                    dropdown.innerHTML = html;
                    dropdown.style.display = 'block';
                });
            }, 150);
        });

        input.addEventListener('focus', function () {
            if (this.value.trim().length >= 1 && dropdown.innerHTML.trim() !== '') {
                dropdown.style.display = 'block';
            }
        });
    };

    bindMemberSearch('loan-member-input', 'loan');
    bindMemberSearch('return-member-input', 'return');
    bindBookSearch('loan-book-input', 'loan');
    bindBookSearch('return-book-input', 'return');

    // Tutup dropdown saat klik di luar
    document.addEventListener('click', function (e) {
        if (!e.target.closest('.position-relative')) {
            ['loan-member-suggestions', 'loan-book-suggestions', 'return-member-suggestions', 'return-book-suggestions'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
    });
}

function handleManualMember(t) {
    let i = (document.getElementById(t + '-member-input').value || '').trim();
    if (!i) return;

    // Sembunyikan dropdown saran jika terbuka
    const suggEl = document.getElementById(t + '-member-suggestions');
    if (suggEl) suggEl.style.display = 'none';

    // Cek apakah yang diketik adalah nama siswa di cache cerdas
    if (smartMembersCache && smartMembersCache.length > 0) {
        const q = i.toLowerCase();
        // ID hanya boleh cocok jika exact match atau startsWith, nama boleh cocok jika exact/startsWith/kata diawali q
        const matched = smartMembersCache.find(m => String(m[0]).toLowerCase() === q) ||
                        smartMembersCache.find(m => String(m[0]).toLowerCase().startsWith(q)) ||
                        smartMembersCache.find(m => String(m[1]).toLowerCase() === q) ||
                        smartMembersCache.find(m => String(m[1]).toLowerCase().startsWith(q)) ||
                        smartMembersCache.find(m => String(m[1]).toLowerCase().split(/\s+/).some(w => w.startsWith(q)));
        if (matched) {
            i = matched[0]; // Ganti dengan ID/NISN siswa
            document.getElementById(t + '-member-input').value = i;
            document.getElementById(t + '-member-name').innerText = matched[1];
            document.getElementById(t + '-book-input').disabled = false;
            document.getElementById('btn-' + t + '-book').disabled = false;
            const bookGroup = document.getElementById(t + '-book-group');
            if (bookGroup) bookGroup.classList.remove('opacity-50');
            document.getElementById(t + '-book-input').focus();
        }
    }

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status) {
                document.getElementById(t + '-member-name').innerText = r.nama;
                document.getElementById(t + '-book-input').disabled = false;
                document.getElementById('btn-' + t + '-book').disabled = false;
                const bookGroup = document.getElementById(t + '-book-group');
                if (bookGroup) bookGroup.classList.remove('opacity-50');
                document.getElementById(t + '-book-input').focus();
            } else { Swal.fire('Err', r.message, 'error'); }
        }).checkMember(i);
}

function handleManualBook(t) {
    const m = document.getElementById(t + '-member-input').value;
    let b = (document.getElementById(t + '-book-input').value || '').trim();
    if (!b) return;

    // Sembunyikan dropdown saran jika terbuka
    const suggEl = document.getElementById(t + '-book-suggestions');
    if (suggEl) suggEl.style.display = 'none';

    // Cek apakah yang diketik adalah judul buku di cache cerdas
    const bookList = (smartBooksCache && smartBooksCache.length > 0) ? smartBooksCache : publicCatalogAllBooks;
    if (bookList && bookList.length > 0) {
        const q = b.toLowerCase();
        // Kode hanya boleh cocok jika exact match atau startsWith, judul boleh cocok jika exact/startsWith/kata diawali q
        const matched = bookList.find(x => String(x[0]).toLowerCase() === q) ||
                        bookList.find(x => String(x[0]).toLowerCase().startsWith(q)) ||
                        bookList.find(x => String(x[1]).toLowerCase() === q) ||
                        bookList.find(x => String(x[1]).toLowerCase().startsWith(q)) ||
                        bookList.find(x => String(x[1]).toLowerCase().split(/\s+/).some(w => w.startsWith(q)));
        if (matched) {
            b = matched[0]; // Ganti dengan Kode Buku
            document.getElementById(t + '-book-input').value = b;
        }
    }

    document.getElementById(t + '-loading').classList.remove('d-none');
    const func = t === 'loan' ? 'prosesPeminjaman' : 'prosesPengembalian';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById(t + '-loading').classList.add('d-none');
            handleNetworkError(err);
        })
        .withSuccessHandler(r => {
            document.getElementById(t + '-loading').classList.add('d-none');
            if (r.status) {
                document.getElementById(t + '-member-input').value = '';
                document.getElementById(t + '-member-name').innerText = '';
                document.getElementById(t + '-book-input').value = '';
                document.getElementById(t + '-book-input').disabled = true;
                const bookBtn = document.getElementById('btn-' + t + '-book');
                if (bookBtn) bookBtn.disabled = true;
                const bookGroup = document.getElementById(t + '-book-group');
                if (bookGroup) bookGroup.classList.add('opacity-50');
                if (t === 'loan') {
                    Swal.fire({ title: 'Peminjaman Sukses!', html: `<div style="text-align:left;"><p><strong>Peminjam:</strong> ${r.peminjam}</p><p><strong>Buku:</strong> ${r.judul}</p><hr><p class="text-danger"><strong>Jatuh Tempo:</strong> ${r.tglKembali}</p></div>`, icon: 'success' });
                } else {
                    Swal.fire({ title: 'Pengembalian Sukses!', html: `<div style="text-align:left;"><p><strong>Peminjam:</strong> ${r.peminjam}</p><p><strong>Buku:</strong> ${r.judul}</p><hr><p><strong>Denda:</strong> <span class="badge bg-danger">${r.denda}</span></p><p><strong>Keterlambatan:</strong> ${r.terlambat}</p></div>`, icon: 'success' });
                }
            } else { Swal.fire('Periksa Kembali', r.message, 'error'); }
        })[func](m, b, currentUser);
}

document.getElementById('btn-reset-loan').onclick = () => { 
    document.getElementById('loan-member-input').value = ''; 
    document.getElementById('loan-member-name').innerText = '';
    document.getElementById('loan-book-input').value = ''; 
    document.getElementById('loan-book-input').disabled = true;
    const btnB = document.getElementById('btn-loan-book');
    if (btnB) btnB.disabled = true;
    const bg = document.getElementById('loan-book-group');
    if (bg) bg.classList.add('opacity-50');
    const s1 = document.getElementById('loan-member-suggestions');
    const s2 = document.getElementById('loan-book-suggestions');
    if (s1) { s1.style.display = 'none'; s1.innerHTML = ''; }
    if (s2) { s2.style.display = 'none'; s2.innerHTML = ''; }
};

document.getElementById('btn-reset-return').onclick = () => { 
    document.getElementById('return-member-input').value = ''; 
    document.getElementById('return-member-name').innerText = '';
    document.getElementById('return-book-input').value = ''; 
    document.getElementById('return-book-input').disabled = true;
    const btnB = document.getElementById('btn-return-book');
    if (btnB) btnB.disabled = true;
    const bg = document.getElementById('return-book-group');
    if (bg) bg.classList.add('opacity-50');
    const s1 = document.getElementById('return-member-suggestions');
    const s2 = document.getElementById('return-book-suggestions');
    if (s1) { s1.style.display = 'none'; s1.innerHTML = ''; }
    if (s2) { s2.style.display = 'none'; s2.innerHTML = ''; }
};

function loadBooks(q = '') {
    document.getElementById('book-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><div class="mt-2 text-muted small">Memuat Data Buku...</div></td></tr>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('book-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            bookData = res.data;
            bookTotal = res.total;
            renderBooks();
        }).getBookList(bookPage, rowsPerPage, q);
}

function renderBooks() {
    const tb = document.getElementById('book-list-body'); tb.innerHTML = '';
    if (!bookData || bookData.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data.</td></tr>'; document.getElementById('book-page-info').innerText = '0-0 dari 0'; return; }

    bookData.forEach(r => {
        const kodeStr = String(r[0] || '');
        const judulStr = String(r[1] || '');
        const penerbitStr = String(r[3] || '-');
        const sisa = (r[7] !== undefined && r[7] !== "") ? r[7] : (r[6] !== undefined ? r[6] : 1);
        const judulAman = judulStr.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const kodeAman = kodeStr.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const tr = document.createElement('tr');

        // Kita tambahkan div.text-clamp-2 untuk judul buku, dan .nowrap-cell untuk aksi
        tr.innerHTML = '<td class="font-monospace text-primary fw-bold">' + kodeStr + '</td>' +
            '<td><div class="text-clamp-2" title="' + judulAman + '">' + judulStr + '</div></td>' +
            '<td class="nowrap-cell">' + penerbitStr + '</td>' +
            '<td class="text-center text-muted">' + (r[6] !== undefined ? r[6] : 1) + '</td>' +
            '<td class="text-center fw-bold text-success">' + sisa + '</td>' +
            '<td class="text-end nowrap-cell">' +
            '<button class="btn btn-sm btn-outline-success me-1" onclick="processDownloadLabel(\'' + kodeAman + '\',\'' + judulAman + '\')"><i class="fas fa-file-image"></i></button>' +
            '<button class="btn btn-sm text-info me-1" onclick="printLabel(\'' + kodeAman + '\',\'' + judulAman + '\')"><i class="fas fa-print"></i></button>' +
            '<button class="btn btn-sm text-warning me-1" onclick="editBook(\'' + kodeAman + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm text-danger" onclick="delBook(\'' + kodeAman + '\')"><i class="fas fa-trash"></i></button>' +
            '</td>';
        tb.appendChild(tr);
    });

    const start = (bookPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + bookData.length - 1, bookTotal);
    document.getElementById('book-page-info').innerText = `${start}-${end} dari ${bookTotal}`;
}

function prevBookPage() { if (bookPage > 1) { bookPage--; loadBooks(); } }
function nextBookPage() { if (bookPage * rowsPerPage < bookTotal) { bookPage++; loadBooks(); } }
function openBookModal() { document.getElementById('formBuku').reset(); document.getElementById('bKode').readOnly = false; document.getElementById('bIsEdit').value = 'false'; document.getElementById('bOldKode').value = ''; new bootstrap.Modal(document.getElementById('modalBuku')).show(); }

function editBook(k) { const b = bookData.find(x => x[0] == k); if (b) { document.getElementById('bKode').value = b[0]; document.getElementById('bKode').readOnly = true; document.getElementById('bOldKode').value = b[0]; document.getElementById('bJudul').value = b[1]; document.getElementById('bPengarang').value = b[2]; document.getElementById('bPenerbit').value = b[3]; document.getElementById('bTahun').value = b[4]; document.getElementById('bKategori').value = b[5]; document.getElementById('bStok').value = b[6]; document.getElementById('bIsEdit').value = 'true'; new bootstrap.Modal(document.getElementById('modalBuku')).show(); } }

function submitBuku() {
    const d = {
        kode: document.getElementById('bKode').value.trim(),
        oldKode: document.getElementById('bOldKode').value,
        judul: document.getElementById('bJudul').value.trim(),
        pengarang: document.getElementById('bPengarang').value,
        penerbit: document.getElementById('bPenerbit').value,
        tahun: document.getElementById('bTahun').value,
        kategori: document.getElementById('bKategori').value,
        stok: document.getElementById('bStok').value,
        isEdit: document.getElementById('bIsEdit').value === 'true'
    };
    if (!d.kode || !d.judul) { return Swal.fire('Data Belum Lengkap', 'Kode dan Judul Buku wajib diisi!', 'warning'); }

    // Terapkan Smart Loading
    showSmartLoading('Menyimpan Buku...', 'Mengirim data ke sistem pusat.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status) { 
                invalidateSmartCache('buku');
                bootstrap.Modal.getInstance(document.getElementById('modalBuku')).hide(); 
                loadBooks(); 
                Swal.fire('Berhasil', 'Data Buku tersimpan!', 'success'); 
            }
            else { Swal.fire('Gagal', r.message, 'error'); }
        }).saveBook(d);
}
function delBook(k) { Swal.fire({ title: 'Hapus?', showCancelButton: true }).then(r => { if (r.isConfirmed) google.script.run.withSuccessHandler(res => { invalidateSmartCache('buku'); loadBooks(); }).deleteBook(k); }); }

function loadMembers(q = '') {
    document.getElementById('member-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-success" role="status"></div><div class="mt-2 text-muted small">Memuat Data Anggota...</div></td></tr>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('member-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            memberData = res.data;
            memberTotal = res.total;
            renderMembers();
        }).getMemberList(memberPage, rowsPerPage, q);
}

function renderMembers() {
    const tb = document.getElementById('member-list-body'); tb.innerHTML = '';
    if (!memberData || memberData.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data.</td></tr>'; document.getElementById('member-page-info').innerText = '0-0 dari 0'; return; }

    memberData.forEach(r => {
        const idStr = String(r[0] || '');
        const namaStr = String(r[1] || '');
        const kelasStr = String(r[2] || 'Umum');
        const tgl = safeDisplayDate(r[4]);
        const hp = r[5] ? String(r[5]) : '-';
        const idAman = idStr.replace(/'/g, "\\'").replace(/"/g, "&quot;");
        const tr = document.createElement('tr');

        // Kita tambahkan div.text-clamp-2 untuk Nama, dan .nowrap-cell untuk tgl & aksi
        tr.innerHTML = '<td class="nowrap-cell font-monospace">' + idStr + '</td>' +
            '<td><div class="text-clamp-2" title="' + namaStr + '">' + namaStr + '</div></td>' +
            '<td class="nowrap-cell">' + kelasStr + '</td>' +
            '<td class="nowrap-cell">' + hp + '</td>' +
            '<td class="nowrap-cell">' + tgl + '</td>' +
            '<td class="text-end nowrap-cell">' +
            '<button class="btn btn-sm btn-outline-success me-1" onclick="processDownloadCard(\'' + idAman + '\')"><i class="fas fa-file-image"></i></button>' +
            '<button class="btn btn-sm text-info me-1" onclick="printCard(\'' + idAman + '\')"><i class="fas fa-id-card"></i></button>' +
            '<button class="btn btn-sm text-warning me-1" onclick="editMember(\'' + idAman + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm text-danger" onclick="delMember(\'' + idAman + '\')"><i class="fas fa-trash"></i></button>' +
            '</td>';
        tb.appendChild(tr);
    });

    const start = (memberPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + memberData.length - 1, memberTotal);
    document.getElementById('member-page-info').innerText = `${start}-${end} dari ${memberTotal}`;
}

function prevMemberPage() { if (memberPage > 1) { memberPage--; loadMembers(); } }
function nextMemberPage() { if (memberPage * rowsPerPage < memberTotal) { memberPage++; loadMembers(); } }
function openMemberModal() { document.getElementById('formAnggota').reset(); document.getElementById('mId').readOnly = false; document.getElementById('mIsEdit').value = 'false'; document.getElementById('mOldId').value = ''; new bootstrap.Modal(document.getElementById('modalAnggota')).show(); }

function editMember(id) {
    const m = memberData.find(x => x[0] == id);
    if (m) {
        document.getElementById('mId').value = m[0];
        document.getElementById('mId').readOnly = true;
        document.getElementById('mOldId').value = m[0];
        document.getElementById('mNama').value = m[1];
        document.getElementById('mKelas').value = m[2];
        document.getElementById('mJk').value = m[3];
        document.getElementById('mTgl').value = safeIsoDate(m[4]);
        document.getElementById('mHp').value = m[5] || '';
        document.getElementById('mIsEdit').value = 'true';
        new bootstrap.Modal(document.getElementById('modalAnggota')).show();
    }
}

function submitAnggota() {
    const d = {
        id: document.getElementById('mId').value.trim(),
        oldId: document.getElementById('mOldId').value,
        nama: document.getElementById('mNama').value.trim(),
        kelas: document.getElementById('mKelas').value,
        jk: document.getElementById('mJk').value,
        tglLahir: document.getElementById('mTgl').value,
        nohp: document.getElementById('mHp').value,
        isEdit: document.getElementById('mIsEdit').value === 'true'
    };

    if (!d.id || !d.nama) { return Swal.fire('Data Belum Lengkap', 'ID/NISN dan Nama Anggota wajib diisi!', 'warning'); }

    // Terapkan Smart Loading
    showSmartLoading('Menyimpan Anggota...', 'Memperbarui direktori anggota.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(r => {
            if (r.status) { 
                invalidateSmartCache('anggota');
                bootstrap.Modal.getInstance(document.getElementById('modalAnggota')).hide(); 
                loadMembers(); 
                Swal.fire('Berhasil', 'Data Anggota tersimpan!', 'success'); 
            }
            else { Swal.fire('Gagal', r.message, 'error'); }
        }).saveMember(d);
}
function delMember(id) { Swal.fire({ title: 'Hapus?', showCancelButton: true }).then(r => { if (r.isConfirmed) google.script.run.withSuccessHandler(res => { invalidateSmartCache('anggota'); loadMembers(); }).deleteMember(id); }); }

function loadDashboard() {
    document.getElementById('stats-container').innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('stats-container').innerHTML = '<div class="col-12 text-center text-danger">Gagal memuat statistik. Coba refresh.</div>';
        })
        .withSuccessHandler(stats => {
            document.getElementById('stats-container').innerHTML = '<div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-primary"><div><h6 class="text-muted small mb-1">Total Judul</h6><h3 class="fw-bold text-primary mb-0">' + stats.totalJudul + '</h3></div><i class="fas fa-book fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-info"><div><h6 class="text-muted small mb-1">Total Stok</h6><h3 class="fw-bold text-info mb-0">' + stats.totalEksemplar + '</h3></div><i class="fas fa-layer-group fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-success"><div><h6 class="text-muted small mb-1">Anggota</h6><h3 class="fw-bold text-success mb-0">' + stats.totalAnggota + '</h3></div><i class="fas fa-users fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-secondary"><div><h6 class="text-muted small mb-1">Transaksi</h6><h3 class="fw-bold text-secondary mb-0">' + stats.totalTransaksi + '</h3></div><i class="fas fa-history fa-2x text-black-50 opacity-25"></i></div></div><div class="col-md-6"><div class="glass-card p-4 h-100"><h6 class="fw-bold text-uppercase text-muted mb-3">Status Saat Ini</h6><div class="row g-3"><div class="col-6"><div class="p-3 rounded-3 bg-warning bg-opacity-10 border border-warning text-center"><h2 class="fw-bold text-warning">' + stats.sedangDipinjam + '</h2><small class="text-muted fw-bold">Sedang Dipinjam</small></div></div><div class="col-6"><div class="p-3 rounded-3 bg-danger bg-opacity-10 border border-danger text-center"><h2 class="fw-bold text-danger">' + stats.terlambat + '</h2><small class="text-muted fw-bold">Terlambat / Denda</small></div></div></div></div></div><div class="col-md-6"><div class="glass-card p-4 h-100"><h6 class="fw-bold text-uppercase text-muted mb-3">Hall of Fame</h6><div class="d-flex align-items-center mb-3"><div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px;"><i class="fas fa-trophy"></i></div><div><small class="d-block text-muted">Siswa Terrajin</small><span class="fw-bold text-dark">' + stats.siswaTerrajin + '</span></div></div><div class="d-flex align-items-center"><div class="bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px;"><i class="fas fa-star"></i></div><div><small class="d-block text-muted">Buku Terpopuler</small><span class="fw-bold text-dark">' + stats.bukuTerpopuler + '</span></div></div></div></div>';
        }).getDashboardStats();
}

function loadHistory(q = '') {
    const isArchive = document.getElementById('chkArsip') ? document.getElementById('chkArsip').checked : false;
    const headerTitle = document.querySelector('#page-riwayat h5');
    const badge = isArchive ? '<span class="badge bg-warning text-dark ms-2">ARSIP</span>' : '';
    headerTitle.innerHTML = `<i class="fas fa-history me-2"></i>Riwayat ${badge}`;

    injectRefreshBtn('page-riwayat', () => { historyPage = 1; loadHistory(); });
    document.getElementById('riwayat-list-body').innerHTML = '<tr><td colspan="5" class="text-center py-5"><div class="spinner-border text-secondary"></div></td></tr>';

    google.script.run
        .withFailureHandler(err => {
            document.getElementById('riwayat-list-body').innerHTML = '<tr><td colspan="5" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle"></i> Gagal memuat data riwayat</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            historyData = res.data;
            historyTotal = res.total;
            renderHistory();
        }).getHistoryList(historyPage, rowsPerPage, q, isArchive);
}

function renderHistory() {
    const tb = document.getElementById('riwayat-list-body');
    tb.innerHTML = '';
    if (!historyData || historyData.length === 0) {
        tb.innerHTML = '<tr><td colspan="5" class="text-center text-muted fst-italic py-3">Tidak ada data transaksi.</td></tr>';
        document.getElementById('riwayat-page-info').innerText = '0-0 dari 0';
        return;
    }
    const nowMs = new Date().getTime();

    historyData.forEach(r => {
        let statusColor = 'bg-secondary';
        const statusStr = r.status;
        if (statusStr.includes('Denda') || statusStr.includes('Terlambat')) statusColor = 'bg-danger';
        else if (statusStr.includes('Kembali')) statusColor = 'bg-success';
        else if (statusStr.includes('Pinjam')) statusColor = 'bg-warning text-dark';

        let btnWA = '';
        let isLate = false;

        if (!statusStr.includes('Kembali') && r.tglTempoTs > 0) {
            if (nowMs > r.tglTempoTs) {
                isLate = true;
                if (statusStr === 'Pinjam') statusColor = 'bg-danger';
            }
        }

        if (isLate && r.hpAnggota && r.hpAnggota.length > 5) {
            let hp = r.hpAnggota;
            if (hp.startsWith('0')) hp = '62' + hp.substring(1);
            let msg = `Halo *${r.namaAnggota}*,\n\nKami dari Perpustakaan mengingatkan bahwa buku:\n📚 Judul: *${r.judulBuku}*\n📅 Jatuh Tempo: *${r.tglTempo}*\n\nStatus saat ini: *TERLAMBAT*. Mohon segera dikembalikan.\nTerima kasih.`;
            btnWA = `<a href="https://wa.me/${hp}?text=${encodeURIComponent(msg)}" target="_blank" class="btn btn-sm btn-success ms-2 rounded-circle shadow-sm" style="width:32px;height:32px;padding:0;line-height:30px;" title="Kirim WA"><i class="fab fa-whatsapp"></i></a>`;
        }

        let btnDel = '';
        if (statusStr.includes('Kembali')) {
            btnDel = `<button class="btn btn-sm btn-outline-danger ms-2 rounded-circle shadow-sm" style="width:32px;height:32px;padding:0;line-height:30px;" title="Hapus Riwayat" onclick="hapusRiwayat('${r.idTrx || ''}')"><i class="fas fa-trash"></i></button>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = '<td><div class="fw-bold text-primary">' + r.namaAnggota + '</div><div class="small text-muted" style="font-size:11px;">' + r.idAnggota + '</div></td><td><div class="fw-bold text-dark text-truncate" style="max-width:180px;">' + r.judulBuku + '</div><div class="small text-muted" style="font-size:11px;">' + r.kodeBuku + '</div></td><td><div style="line-height:1.2;"><small class="d-block text-muted">Pinjam: ' + r.tglPinjam + '</small><small class="d-block ' + (isLate && !statusStr.includes('Kembali') ? 'text-danger fw-bold' : 'text-muted') + '">Tempo: ' + r.tglTempo + '</small></div></td><td><div class="d-flex align-items-center"><span class="badge ' + statusColor + '">' + (isLate && !statusStr.includes('Kembali') ? 'Terlambat' : r.status) + '</span>' + btnWA + btnDel + '</div></td>';
        tb.appendChild(tr);
    });
    const start = (historyPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + historyData.length - 1, historyTotal);
    document.getElementById('riwayat-page-info').innerText = `${start}-${end} dari ${historyTotal}`;
}

function hapusRiwayat(idTrx) {
    if (!idTrx) {
        Swal.fire('Error', 'ID Riwayat tidak valid atau belum tersinkron!', 'error');
        return;
    }
    const isArchive = document.getElementById('chkArsip') ? document.getElementById('chkArsip').checked : false;
    Swal.fire({
        title: 'Yakin ingin hapus?',
        text: "Data riwayat ini akan dihapus permanen!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            google.script.run
                .withFailureHandler(handleNetworkError)
                .withSuccessHandler(r => {
                    if (r.status || r.success) {
                        Swal.fire('Terhapus!', 'Riwayat berhasil dihapus.', 'success');
                        loadHistory(document.getElementById('searchRiwayat').value);
                    } else {
                        Swal.fire('Gagal', r.message, 'error');
                    }
                }).deleteHistory(idTrx, isArchive);
        }
    });
}

function formatDate(d) {
    if (!d) return "-";
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return d;
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${day}/${month}/${year}`;
}

function prevRiwayatPage() { if (historyPage > 1) { historyPage--; loadHistory(); } }
function nextRiwayatPage() { if (historyPage * rowsPerPage < historyTotal) { historyPage++; loadHistory(); } }

function loadSettingsForm() {
    // Langsung isi form dari cache IndexedDB tanpa lock/disable
    google.script.run
        .withFailureHandler(err => {
            console.log('Cache kosong atau belum sinkron:', err);
        })
        .withSuccessHandler(res => {
            try {
                // Ekstrak config dengan aman (dukung format objek langsung maupun dibungkus {data: ...})
                const cfg = (res && res.data) ? res.data : res;
                
                if (cfg) {
                    if (document.getElementById('cfgNama')) document.getElementById('cfgNama').value = cfg.NamaSekolah || '';
                    if (document.getElementById('cfgInstansi')) document.getElementById('cfgInstansi').value = cfg.NamaInstansi || '';
                    if (document.getElementById('cfgAlamat')) document.getElementById('cfgAlamat').value = cfg.AlamatSekolah || '';
                    
                    // Isi value input hidden
                    if (document.getElementById('cfgLogo')) document.getElementById('cfgLogo').value = cfg.UrlLogo || '';
                    if (document.getElementById('cfgLogoInstansi')) document.getElementById('cfgLogoInstansi').value = cfg.UrlLogoInstansi || '';
                    if (document.getElementById('cfgBg')) document.getElementById('cfgBg').value = cfg.UrlBackground || '';
                    
                    // Update tampilan gambar / preview image
                    if (cfg.UrlLogo && cfg.UrlLogo.length > 5) {
                        const pLogo = document.getElementById('previewLogo');
                        if (pLogo) { pLogo.src = cfg.UrlLogo; pLogo.style.display = 'block'; }
                    }
                    if (cfg.UrlLogoInstansi && cfg.UrlLogoInstansi.length > 5) {
                        const pLogoIns = document.getElementById('previewLogoInstansi');
                        if (pLogoIns) { pLogoIns.src = cfg.UrlLogoInstansi; pLogoIns.style.display = 'block'; }
                    }
                    if (cfg.UrlBackground && cfg.UrlBackground.length > 5) {
                        const pBg = document.getElementById('previewBg');
                        if (pBg) { pBg.src = cfg.UrlBackground; pBg.style.display = 'block'; }
                    }
                    const localBg = localStorage.getItem('offline_bg_base64') || localStorage.getItem('offline_bg_url');
                    const bgDisplay = localBg || cfg.UrlBackground || '';
                    if (document.getElementById('cfgBg')) document.getElementById('cfgBg').value = bgDisplay;
                    if (bgDisplay && bgDisplay.length > 5) {
                        const pBg = document.getElementById('previewBg');
                        if (pBg) { pBg.src = bgDisplay; pBg.style.display = 'block'; }
                    }

                    if (document.getElementById('cfgColor1')) document.getElementById('cfgColor1').value = cfg.Color1 || '#667eea';
                    if (document.getElementById('cfgColor2')) document.getElementById('cfgColor2').value = cfg.Color2 || '#764ba2';
                    if (document.getElementById('cfgColor3')) document.getElementById('cfgColor3').value = cfg.Color3 || '#6B8DD6';
                    if (document.getElementById('cfgRun')) document.getElementById('cfgRun').value = cfg.RunningText || '';
                    if (document.getElementById('cfgDenda')) document.getElementById('cfgDenda').value = cfg.DendaPerHari || 500;
                    if (document.getElementById('cfgDurasi')) document.getElementById('cfgDurasi').value = cfg.DurasiPinjam || 7;
                    if (document.getElementById('cfgHp')) document.getElementById('cfgHp').value = cfg.NoHP || '';
                    if (document.getElementById('cfgWeb')) document.getElementById('cfgWeb').value = cfg.WebSekolah || '';
                    if (document.getElementById('cfgEmail')) document.getElementById('cfgEmail').value = cfg.EmailSekolah || '';
                    if (document.getElementById('cfgFolder')) document.getElementById('cfgFolder').value = cfg.IDFolderGambar || '';

                    if (document.getElementById('cfgFb')) document.getElementById('cfgFb').value = cfg.MedsosFb || '';
                    if (document.getElementById('cfgIg')) document.getElementById('cfgIg').value = cfg.MedsosIg || '';
                    if (document.getElementById('cfgYt')) document.getElementById('cfgYt').value = cfg.MedsosYt || '';
                    if (document.getElementById('cfgTiktok')) document.getElementById('cfgTiktok').value = cfg.MedsosTiktok || '';
                    if (document.getElementById('cfgTwitter')) document.getElementById('cfgTwitter').value = cfg.MedsosTwitter || '';
                }
                
                // Populate account fields and configure UI based on mode
                if (document.getElementById('offlineUserDisplay')) {
                    if (window.isElectron) {
                        document.getElementById('offlineUserDisplay').value = (window.electronAPI ? window.electronAPI.getConfig().OFFLINE_ADMIN_USER : 'admin');
                        if (document.getElementById('offlinePassDisplay')) {
                            document.getElementById('offlinePassDisplay').value = (window.electronAPI ? window.electronAPI.getConfig().OFFLINE_ADMIN_PASS : 'admin123');
                            document.getElementById('offlinePassDisplay').readOnly = true;
                            document.getElementById('offlinePassDisplay').type = 'text';
                        }
                        if (document.getElementById('btnUpdateAccountContainer')) document.getElementById('btnUpdateAccountContainer').style.display = 'none';
                        if (document.getElementById('adminAccountBadge')) document.getElementById('adminAccountBadge').innerHTML = '<i class="fas fa-lock me-1"></i>Offline Mode';
                        if (document.getElementById('offlineAccountWarning')) document.getElementById('offlineAccountWarning').style.display = 'flex';
                        if (document.getElementById('offlineExecLinkDisplay')) document.getElementById('offlineExecLinkDisplay').value = (window.electronAPI ? window.electronAPI.getConfig().OFFLINE_EXEC_LINK : '');
                    } else {
                        document.getElementById('offlineUserDisplay').value = typeof currentUsername !== 'undefined' ? currentUsername : 'admin';
                        if (document.getElementById('offlinePassDisplay')) {
                            document.getElementById('offlinePassDisplay').value = '';
                            document.getElementById('offlinePassDisplay').readOnly = false;
                        }
                        if (document.getElementById('btnUpdateAccountContainer')) document.getElementById('btnUpdateAccountContainer').style.display = 'flex';
                        if (document.getElementById('adminAccountBadge')) document.getElementById('adminAccountBadge').innerHTML = '<i class="fas fa-globe me-1"></i>Online Mode';
                        if (document.getElementById('offlineAccountWarning')) document.getElementById('offlineAccountWarning').style.display = 'none';
                        if (document.getElementById('offlineExecLinkDisplay')) document.getElementById('offlineExecLinkDisplay').value = window.location.href;
                    }
                }
            } catch (e) {
                console.log('Abaikan elemen tidak ditemukan: ' + e);
            }

        }).getAppConfig();
}

function saveSettings() {
    // 1. Amankan variabel gambar
    const logoInstansiVal = typeof uploadLogoInstansiBase64 !== 'undefined' ? uploadLogoInstansiBase64 : null;
    const logoVal = typeof uploadLogoBase64 !== 'undefined' ? uploadLogoBase64 : null;
    const bgVal = typeof uploadBgBase64 !== 'undefined' ? uploadBgBase64 : null;

    // 2. Tarik data dari form dengan aman
    const data = {
        namaSekolah: document.getElementById('cfgNama')?.value || '',
        namaInstansi: document.getElementById('cfgInstansi')?.value || '',
        alamatSekolah: document.getElementById('cfgAlamat')?.value || '',
        urlLogo: document.getElementById('cfgLogo')?.value || '',
        urlLogoInstansi: document.getElementById('cfgLogoInstansi')?.value || '',
        urlBg: document.getElementById('cfgBg')?.value || '',
        uploadLogo: logoVal,
        uploadLogoInstansi: logoInstansiVal,
        uploadBg: bgVal,
        runningText: document.getElementById('cfgRun')?.value || '',
        urlWin: document.getElementById('cfgUrlWin')?.value || '',
        urlAnd: document.getElementById('cfgUrlAnd')?.value || '',
        denda: document.getElementById('cfgDenda')?.value || 0,
        durasi: document.getElementById('cfgDurasi')?.value || 0,
        nohp: document.getElementById('cfgHp')?.value || '',
        website: document.getElementById('cfgWeb')?.value || '',
        email: document.getElementById('cfgEmail')?.value || '',
        idFolder: document.getElementById('cfgFolder')?.value || '',
        color1: document.getElementById('cfgColor1')?.value || '#667eea',
        color2: document.getElementById('cfgColor2')?.value || '#764ba2',
        color3: document.getElementById('cfgColor3')?.value || '#6B8DD6',
        medsosFb: document.getElementById('cfgFb')?.value || '',
        medsosIg: document.getElementById('cfgIg')?.value || '',
        medsosYt: document.getElementById('cfgYt')?.value || '',
        medsosTiktok: document.getElementById('cfgTiktok')?.value || '',
        medsosTwitter: document.getElementById('cfgTwitter')?.value || ''
    };

    let desc = 'Sedang memperbarui aturan dan identitas...';
    if (bgVal || logoVal || logoInstansiVal) desc = 'Sedang mengunggah file foto ke Google Drive...';

    showSmartLoading('Menyimpan Pengaturan...', desc);

    google.script.run
        .withFailureHandler(err => {
            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
            if (res.status) {
                // Simpan Base64 & URL ke LocalStorage agar aman saat offline
                if (logoVal) localStorage.setItem('offline_logo_base64', logoVal);
                if (logoInstansiVal) localStorage.setItem('offline_logoinstansi_base64', logoInstansiVal);
                if (bgVal) localStorage.setItem('offline_bg_base64', bgVal);
                if (data.urlBg) localStorage.setItem('offline_bg_url', data.urlBg);
                
                // Simpan snapshot pengaturan offline lengkap
                const currentSavedCfg = {
                    NamaSekolah: data.namaSekolah,
                    NamaInstansi: data.namaInstansi,
                    AlamatSekolah: data.alamatSekolah,
                    UrlLogo: data.urlLogo,
                    UrlLogoInstansi: data.urlLogoInstansi,
                    UrlBackground: data.urlBg || bgVal,
                    RunningText: data.runningText,
                    UrlWindows: data.urlWin,
                    UrlAndroid: data.urlAnd,
                    DendaPerHari: data.denda,
                    DurasiPinjam: data.durasi,
                    NoHP: data.nohp,
                    WebSekolah: data.website,
                    EmailSekolah: data.email,
                    IDFolderGambar: data.idFolder,
                    Color1: data.color1,
                    Color2: data.color2,
                    Color3: data.color3,
                    MedsosFb: data.medsosFb,
                    MedsosIg: data.medsosIg,
                    MedsosYt: data.medsosYt,
                    MedsosTiktok: data.medsosTiktok,
                    MedsosTwitter: data.medsosTwitter
                };
                localStorage.setItem('offline_app_config', JSON.stringify(currentSavedCfg));

                // Mode Electron: simpan juga ke SQLite agar persisten antar restart
                // Key harus sama dengan yang dibuat apiHelper saat getAppConfig dipanggil
                if (window.isElectron && window.electronAPI && window.electronAPI.saveToLocalDB) {
                    const gasConfigKey = 'getAppConfig_{"action":"getAppConfig"}';
                    window.electronAPI.saveToLocalDB('cache', gasConfigKey, { key: gasConfigKey, data: currentSavedCfg });
                }

                Swal.fire({ title: 'Berhasil', text: 'Pengaturan tersimpan.', icon: 'success' }).then(() => {
                    // Kosongkan memori gambar setelah sukses simpan
                    if (typeof uploadBgBase64 !== 'undefined') uploadBgBase64 = null;
                    if (typeof uploadLogoBase64 !== 'undefined') uploadLogoBase64 = null;
                    if (typeof uploadLogoInstansiBase64 !== 'undefined') uploadLogoInstansiBase64 = null;
                    loadAppConfig();
                });
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        }).saveAppConfig(data);
}

function updateAccount() {
    const newUser = document.getElementById('offlineUserDisplay').value; 
    const newPass = document.getElementById('offlinePassDisplay').value;
    if (!newUser || !newPass) { Swal.fire('Error', 'Wajib diisi', 'warning'); return; }
    Swal.fire({ title: 'Konfirmasi', text: 'Anda akan logout.', icon: 'warning', showCancelButton: true }).then(r => {
        if (r.isConfirmed) {
            showSmartLoading('Mengupdate Akun...', 'Menyinkronkan data kredensial baru.');
            google.script.run
                .withFailureHandler(handleNetworkError)
                .withSuccessHandler(res => { if (res.status) { localStorage.clear(); location.reload(); } else Swal.fire('Gagal', res.message, 'error'); }).updateUserCredentials(currentUsername, newUser, newPass);
        }
    });
}

function downloadTemplate(t) {
    const n = t === 'buku' ? "Template_Buku.xlsx" : "Template_Anggota.xlsx";
    const h = t === 'buku' ? ["Kode", "Judul", "Pengarang", "Penerbit", "Tahun", "Kategori", "Stok Total"] : ["ID/NISN", "Nama", "Kelas", "JK", "Tgl. Lahir (yyyy-mm-dd)", "No. HP/WA"];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([h]), "Template"); XLSX.writeFile(wb, n);
}

function triggerImport(t) { importType = t; document.getElementById('fileInput').click(); }

function processImport(i) {
    const f = i.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = (e) => {
        try {
            const d = new Uint8Array(e.target.result);
            const wb = XLSX.read(d, { type: 'array' });

            // Cari sheet yang memiliki baris paling banyak (hindari cover sheet kosong)
            let chosenSheetData = null;
            let maxRows = 0;
            for (let sName of wb.SheetNames) {
                const sheet = wb.Sheets[sName];
                if (!sheet) continue;
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                if (rows && rows.length > maxRows) {
                    maxRows = rows.length;
                    chosenSheetData = rows;
                }
            }

            if (!chosenSheetData || chosenSheetData.length === 0) {
                Swal.fire('File Kosong', 'File Excel tidak memiliki data di dalamnya.', 'warning');
                i.value = '';
                return;
            }

            // Terapkan Smart Loading
            showSmartLoading('Mengimpor Excel...', 'Menganalisis baris dan memasukkan data ke sistem.');

            google.script.run
                .withFailureHandler(err => {
                    if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                    handleNetworkError(err);
                    i.value = '';
                })
                .withSuccessHandler(res => {
                    if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                    if (res.status) {
                        invalidateSmartCache();
                        if (importType === 'buku') {
                            bookPage = 1;
                            loadBooks();
                        } else {
                            memberPage = 1;
                            loadMembers();
                        }
                        if (typeof loadDashboard === 'function') {
                            loadDashboard();
                        }
                        Swal.fire({ title: 'Selesai!', text: res.message, icon: 'success' });
                    } else {
                        Swal.fire('Gagal', res.message, 'error');
                    }
                    i.value = '';
                }).processExcelData(importType, chosenSheetData);
        } catch (err) {
            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
            console.error('Error saat membaca Excel:', err);
            Swal.fire('Error', 'Gagal memproses file Excel: ' + (err.message || err), 'error');
            i.value = '';
        }
    };
    r.readAsArrayBuffer(f);
}

function printLabel(kode, judul) {
    const htmlPreview = '<div style="display:flex;justify-content:center;padding:10px;"><div class="book-label-preview" style="width:250px;height:150px;background:#fff;border:2px solid #333;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"><div style="font-weight:bold;font-size:14px;margin-bottom:5px;line-height:1.2;max-height:40px;overflow:hidden;">' + judul + '</div><div style="font-size:12px;margin-top:5px;background:#000;color:#fff;padding:2px 8px;border-radius:4px;">' + kode + '</div><div id="qrcode-book" style="margin-top:10px;"></div></div></div>';

    Swal.fire({
        title: 'Preview',
        html: htmlPreview,
        showConfirmButton: true,
        confirmButtonText: 'Cetak',
        didOpen: () => { new QRCode(document.getElementById("qrcode-book"), { text: kode, width: 70, height: 70 }); }
    }).then((r) => {
        if (r.isConfirmed) {
            // --- FIX BUG QR CODE CETAK ---
            const qrBox = document.getElementById("qrcode-book");
            const canvas = qrBox.querySelector('canvas');
            const img = qrBox.querySelector('img');
            if (canvas && img) {
                img.src = canvas.toDataURL("image/png");
                img.style.display = "block";
                canvas.style.display = "none";
            }
            // -----------------------------

            var win = window.open('', '', 'height=500,width=500');
            win.document.write('<html><head><title>Cetak Label</title></head><body style="padding:20px;">' + document.querySelector('.book-label-preview').outerHTML + '</body></html>');
            win.document.close();
            setTimeout(() => { win.print(); }, 400);
        }
    });
}

function printCard(id) {
    const m = memberData.find(x => x[0] == id); if (!m) return;
    const nama = m[1]; const jk = m[3] == 'L' ? 'Laki-laki' : 'Perempuan'; const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';
    const sekolah = document.getElementById('sidebar-school-name').innerText || 'Perpus';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

    const htmlPreview = '<div style="display:flex;justify-content:center;padding:10px;"><div class="id-card-preview" style="width:320px;height:200px;background:#f8f9fa;border:1px solid #ddd;border-radius:15px;overflow:hidden;text-align:left;position:relative;"><div style="background:#4361ee;height:50px;display:flex;align-items:center;padding:0 15px;color:white;"><img src="' + logo + '" crossorigin="anonymous" style="height:35px;width:35px;background:#fff;border-radius:50%;padding:2px;margin-right:10px;"><div style="font-weight:bold;font-size:13px;">' + sekolah + '</div></div><div style="padding:15px;display:flex;justify-content:space-between;"><div style="flex:1;"><h3 style="margin:0 0 5px;font-size:16px;">' + nama + '</h3><p style="font-size:11px;color:#666;margin:0;">ID: <b>' + id + '</b></p><p style="font-size:11px;color:#666;margin:0;">' + jk + '</p><p style="font-size:11px;color:#666;margin:0;">Lahir: ' + tgl + '</p></div><div id="qrcode-mem"></div></div><div style="position:absolute;bottom:10px;width:100%;text-align:center;font-size:10px;font-weight:bold;color:#4361ee;">KARTU PERPUSTAKAAN DIGITAL</div></div></div>';

    Swal.fire({
        width: 450,
        title: 'Preview',
        html: htmlPreview,
        didOpen: () => { new QRCode(document.getElementById("qrcode-mem"), { text: id, width: 65, height: 65 }); }
    }).then(r => {
        if (r.isConfirmed) {
            // --- FIX BUG QR CODE CETAK ---
            const qrBox = document.getElementById("qrcode-mem");
            const canvas = qrBox.querySelector('canvas');
            const img = qrBox.querySelector('img');
            if (canvas && img) {
                img.src = canvas.toDataURL("image/png");
                img.style.display = "block"; // Tampilkan gambar
                canvas.style.display = "none"; // Sembunyikan canvas
            }
            // -----------------------------

            var win = window.open('', '', 'height=500,width=500');
            win.document.write('<html><head><title>Cetak Kartu</title></head><body style="padding:20px;">' + document.querySelector('.id-card-preview').outerHTML + '</body></html>');
            win.document.close();
            setTimeout(() => { win.print(); }, 400); // Beri waktu gambar merender sebelum cetak
        }
    });
}

function processDownloadLabel(kode, judul) {
    const c = document.createElement('div'); c.style.position = 'fixed'; c.style.top = '-9999px';
    c.innerHTML = '<div id="cap-lbl" style="width:300px;height:180px;background:#fff;border:4px solid #333;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:10px;"><div style="font-weight:bold;font-size:16px;margin-bottom:10px;">' + judul + '</div><div style="background:#000;color:#fff;padding:4px 10px;">' + kode + '</div><div id="qr-dl" style="margin-top:15px;"></div></div>';
    document.body.appendChild(c); new QRCode(document.getElementById("qr-dl"), { text: kode, width: 80, height: 80 });

    showSmartLoading('Menyiapkan Label...', 'Menggambar komponen desain.');

    setTimeout(() => {
        html2canvas(document.getElementById('cap-lbl'), { scale: 2 }).then(cv => {
            document.body.removeChild(c);
            const img = cv.toDataURL();
            Swal.fire({ title: 'Review', imageUrl: img, imageWidth: 300, showCancelButton: true, confirmButtonText: 'Download' }).then(res => {
                if (res.isConfirmed) {
                    const link = document.createElement('a'); link.download = 'Label_' + kode + '.png'; link.href = img; link.click();
                }
            });
        });
    }, 500);
}

function processDownloadCard(id) {
    const m = memberData.find(x => x[0] == id); if (!m) return;
    const nama = m[1]; const jk = m[3] == 'L' ? 'Laki-laki' : 'Perempuan'; const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';
    const sek = document.getElementById('sidebar-school-name').innerText || 'Perpus';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

    const c = document.createElement('div'); c.style.position = 'fixed'; c.style.top = '-9999px';
    c.innerHTML = '<div id="cap-card" style="width:400px;height:250px;background:#f8f9fa;border:1px solid #ddd;border-radius:15px;overflow:hidden;text-align:left;position:relative;font-family:Arial;"><div style="background:#4361ee;height:60px;display:flex;align-items:center;padding:0 20px;color:white;"><img src="' + logo + '" crossorigin="anonymous" style="height:45px;width:45px;background:#fff;border-radius:50%;padding:2px;margin-right:15px;"><div style="font-weight:bold;font-size:16px;">' + sek + '</div></div><div style="padding:20px;display:flex;justify-content:space-between;"><div style="flex:1;"><h3 style="margin:0 0 5px;font-size:20px;">' + nama + '</h3><p style="font-size:13px;color:#666;margin:2px 0;">ID: <b>' + id + '</b></p><p style="font-size:13px;color:#666;margin:2px 0;">' + jk + '</p><p style="font-size:13px;color:#666;margin:2px 0;">Lahir: ' + tgl + '</p></div><div id="qr-c-dl"></div></div><div style="position:absolute;bottom:15px;width:100%;text-align:center;font-size:12px;font-weight:bold;color:#4361ee;">KARTU PERPUSTAKAAN DIGITAL</div></div>';
    document.body.appendChild(c); new QRCode(document.getElementById("qr-c-dl"), { text: id, width: 85, height: 85 });

    showSmartLoading('Menyiapkan Kartu...', 'Merender foto dan QR Code...');

    // KUNCI PERBAIKAN 3: Tambahkan allowTaint: true agar gambar dari Google Drive diizinkan
    setTimeout(() => {
        html2canvas(document.getElementById('cap-card'), { scale: 2, useCORS: true, allowTaint: true }).then(cv => {
            document.body.removeChild(c);
            const img = cv.toDataURL();
            Swal.fire({ title: 'Review', imageUrl: img, imageWidth: 400, showCancelButton: true, confirmButtonText: 'Download' }).then(res => {
                if (res.isConfirmed) {
                    const link = document.createElement('a'); link.download = 'Kartu_' + id + '.png'; link.href = img; link.click();
                }
            });
        });
    }, 800);
}

function refreshCurrentPage() {
    const btn = document.getElementById('btn-global-refresh');
    if (btn) {
        const icon = btn.querySelector('i');
        icon.classList.add('fa-spin');
        setTimeout(() => icon.classList.remove('fa-spin'), 1000);
    }
    const activePage = localStorage.getItem('siempus_page') || 'dashboard';
    if (activePage === 'dashboard') loadDashboard();
    else if (activePage === 'buku') { bookPage = 1; loadBooks(); }
    else if (activePage === 'anggota') { memberPage = 1; loadMembers(); }
    else if (activePage === 'riwayat') { historyPage = 1; loadHistory(); }
    else if (activePage === 'pengaturan') loadSettingsForm();
}

// --- LOGIKA KHUSUS MENU MOBILE ---
function updateMobileNav(pageId) {
    // Hapus class 'active' dari semua menu bawah
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
        el.classList.remove('active');
    });

    // Tambahkan class 'active' ke menu yang diklik (jika ada di menu bawah)
    const activeNav = document.getElementById('mob-nav-' + pageId);
    if (activeNav) {
        activeNav.classList.add('active');
    }
}

// Fungsi Logout Khusus Tombol HP
document.getElementById('nav-logout-mobile').addEventListener('click', () => {
    document.getElementById('nav-logout').click(); // Memicu sweetalert logout yang sudah ada
});

// Update fungsi loadAppConfig agar logo & nama di HP juga ikut berubah dari Database
const originalLoadAppConfig = loadAppConfig;
loadAppConfig = function () {
    originalLoadAppConfig();
    // Tambahan untuk update Header HP
    google.script.run.withSuccessHandler(cfg => {
        if (cfg.UrlLogo) {
            const mLogo = document.getElementById('mobile-logo-img');
            if (mLogo) { mLogo.src = cfg.UrlLogo; mLogo.onerror = function() { this.onerror = null; this.src = 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png'; }; }
        }
        if (cfg.NamaSekolah) {
            const mText = document.getElementById('mobile-school-text');
            if (mText) mText.textContent = cfg.NamaSekolah;
        }
    }).getAppConfig();
};



// ==========================================================
// 1. FITUR CETAK SEMUA BARCODE BUKU (A4 3x3 + LOGO & QR BESAR)
// ==========================================================
function printAllLabels() {
    showSmartLoading('Menyiapkan Barcode...', 'Mengambil semua data buku dan menyusun layout kertas A4.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allBooks => {
            if (allBooks.length === 0) { Swal.fire('Kosong', 'Belum ada data buku untuk dicetak.', 'info'); return; }

            // FILTER TAHUN
            const fTahun = document.getElementById('filterTahunExport').value.trim().toLowerCase();
            if (fTahun && fTahun !== '') {
                allBooks = allBooks.filter(b => String(b[4]).toLowerCase() === fTahun);
            }
            if (allBooks.length === 0) { Swal.fire('Kosong', 'Tidak ada buku di tahun tersebut.', 'info'); return; }

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px';
            document.body.appendChild(tempDiv);

            // Ambil logo sekolah
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';
            let htmlContent = `<div class="print-page">`;

            allBooks.forEach((b, index) => {
                const kode = b[0];
                const judul = b[1];

                // Halaman baru setiap 9 kotak
                if (index > 0 && index % 9 === 0) {
                    htmlContent += `</div><div class="print-page" style="page-break-before: always;">`;
                }

                htmlContent += `
                    <div class="label-box">
                        <img src="${logo}" class="label-logo" crossorigin="anonymous">
                        <div class="label-title">${judul}</div>
                        <div class="label-kode">${kode}</div>
                        <div id="qr-batch-${index}" class="qr-container"></div>
                    </div>
                `;
            });
            htmlContent += `</div>`;
            tempDiv.innerHTML = htmlContent;

            // Generate QR Code (Diperbesar jadi 120x120)
            allBooks.forEach((b, index) => {
                new QRCode(document.getElementById(`qr-batch-${index}`), { text: b[0], width: 120, height: 120 });
            });

            setTimeout(() => {
                allBooks.forEach((b, index) => {
                    const qrBox = document.getElementById(`qr-batch-${index}`);
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        const img = qrBox.querySelector('img');
                        if (canvas && img) { img.src = canvas.toDataURL("image/png"); img.style.display = "block"; canvas.style.display = "none"; }
                    }
                });

                const printWindow = window.open('', '', 'height=800,width=1000');
                const css = `
                    <style>
                        @page { size: A4; margin: 10mm; }
                        /* Kode sakti agar warna tercetak di PDF */
                        body { 
                            font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #fff; 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important; 
                        }
                        .print-page {
                            display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr);
                            gap: 10px; width: 190mm; height: 277mm; box-sizing: border-box;
                        }
                        .label-box {
                            border: 2px solid #333; border-radius: 8px; display: flex; flex-direction: column;
                            align-items: center; justify-content: center; text-align: center; padding: 10px; box-sizing: border-box;
                        }
                        .label-logo { width: 35px; height: 35px; object-fit: contain; margin-bottom: 5px; }
                        .label-title { font-weight: bold; font-size: 13px; margin-bottom: 5px; max-height: 38px; overflow: hidden; line-height: 1.2; }
                        .label-kode { background: #000; color: #fff; padding: 4px 10px; border-radius: 4px; font-size: 14px; font-weight: bold; margin-bottom: 10px; letter-spacing: 1px; }
                        .qr-container img { margin: 0 auto; display: block; }
                    </style>
                `;

                printWindow.document.write('<html><head><title>Cetak Label Buku</title>' + css + '</head><body>' + tempDiv.innerHTML + '</body></html>');
                printWindow.document.close();
                document.body.removeChild(tempDiv);
                Swal.close();
                setTimeout(() => { printWindow.print(); }, 500);
            }, 1000);

        }).getAllDataForExport('buku');
}

// ==========================================================
// 2. FITUR CETAK SEMUA KARTU ANGGOTA (A4 2x5 = 10 Kartu)
// STANDAR ID CARD: 8.1 cm x 5 cm
// ==========================================================
function printAllCards() {
    showSmartLoading('Menyiapkan Kartu...', 'Mengambil data anggota dan menyusun layout kertas A4.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allMembers => {
            if (allMembers.length === 0) { Swal.fire('Kosong', 'Belum ada data anggota.', 'info'); return; }
            // FILTER KELAS
            const fKelas = document.getElementById('filterKelasExport').value.trim().toLowerCase();
            if (fKelas && fKelas !== '') {
                allMembers = allMembers.filter(m => String(m[2]).toLowerCase() === fKelas);
            }
            if (allMembers.length === 0) { Swal.fire('Kosong', 'Tidak ada siswa di kelas tersebut.', 'info'); return; }

            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'absolute'; tempDiv.style.left = '-9999px';
            document.body.appendChild(tempDiv);

            const sekolah = document.getElementById('sidebar-school-name').innerText || 'Perpustakaan Sekolah';
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

            let htmlContent = `<div class="print-page">`;

            allMembers.forEach((m, index) => {
                const id = m[0]; const nama = m[1];
                const jk = m[3] == 'L' ? 'Laki-laki' : (m[3] == 'P' ? 'Perempuan' : m[3]);
                const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';

                // Halaman baru setiap 10 kartu (2 kolom x 5 baris)
                if (index > 0 && index % 10 === 0) {
                    htmlContent += `</div><div class="print-page" style="page-break-before: always;">`;
                }

                htmlContent += `
                    <div class="card-wrapper">
                        <div class="id-card">
                            <div class="card-header">
                                <img src="${logo}" crossorigin="anonymous">
                                <div>${sekolah}</div>
                            </div>
                            <div class="card-body">
                                <div class="card-info">
                                    <h3>${nama}</h3>
                                    <p>ID: <b>${id}</b></p>
                                    <p>${jk}</p>
                                    <p>Lahir: ${tgl}</p>
                                </div>
                                <div id="qr-batch-mem-${index}" class="qr-container"></div>
                            </div>
                            <div class="card-footer">KARTU PERPUSTAKAAN DIGITAL</div>
                        </div>
                    </div>
                `;
            });
            htmlContent += `</div>`;
            tempDiv.innerHTML = htmlContent;

            // Generate QR Code (Ukuran 85x85)
            allMembers.forEach((m, index) => {
                new QRCode(document.getElementById(`qr-batch-mem-${index}`), { text: m[0], width: 85, height: 85 });
            });

            setTimeout(() => {
                allMembers.forEach((m, index) => {
                    const qrBox = document.getElementById(`qr-batch-mem-${index}`);
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        const img = qrBox.querySelector('img');
                        if (canvas && img) { img.src = canvas.toDataURL("image/png"); img.style.display = "block"; canvas.style.display = "none"; }
                    }
                });

                const printWindow = window.open('', '', 'height=800,width=1000');
                const css = `
                    <style>
                        @page { size: A4 portrait; margin: 5mm; } /* Margin dikecilkan agar muat 5 baris */
                        
                        /* Kode sakti agar warna tercetak di PDF */
                        body { 
                            font-family: 'Arial', sans-serif; margin: 0; padding: 0; background: #fff; 
                            -webkit-print-color-adjust: exact !important; 
                            print-color-adjust: exact !important; 
                        }
                        
                        /* Layout Grid dengan ukuran fix dalam centimeter */
                        .print-page {
                            display: grid; 
                            grid-template-columns: 8.1cm 8.1cm; /* 2 Kolom lebar 8.1 cm */
                            grid-template-rows: repeat(5, 5cm); /* 5 Baris tinggi 5 cm */
                            column-gap: 10mm; /* Jarak antar kolom menyamping */
                            row-gap: 3mm; /* Jarak antar baris ke bawah dibuat sangat mepet */
                            justify-content: center; /* Posisikan di tengah kertas */
                            align-content: start;
                            width: 100%; height: 287mm; box-sizing: border-box;
                            padding-top: 5mm;
                        }
                        
                        .card-wrapper { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

                        /* Kartu mengikuti ukuran grid induknya (8.1 x 5 cm) */
                        .id-card {
                            width: 100%; height: 100%; background: #f8f9fa; border: 2px solid #ddd;
                            border-radius: 12px; overflow: hidden; position: relative; box-sizing: border-box;
                        }
                        .card-header { background: #4361ee; height: 1.2cm; display: flex; align-items: center; padding: 0 15px; color: white; }
                        .card-header img { height: 0.9cm; width: 0.9cm; background: #fff; border-radius: 50%; padding: 2px; margin-right: 10px; object-fit: contain; }
                        .card-header div { font-weight: bold; font-size: 13px; }
                        .card-body { padding: 8px 15px; display: flex; justify-content: space-between; align-items: flex-start; }
                        .card-info h3 { margin: 0 0 4px; font-size: 14px; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 4.5cm; }
                        .card-info p { font-size: 11px; color: #666; margin: 1px 0; }
                        .card-footer { position: absolute; bottom: 5px; width: 100%; text-align: center; font-size: 10px; font-weight: bold; color: #4361ee; }
                        .qr-container { margin-top: -3px; }
                    </style>
                `;

                printWindow.document.write('<html><head><title>Cetak Semua Kartu Anggota</title>' + css + '</head><body>' + tempDiv.innerHTML + '</body></html>');
                printWindow.document.close();
                document.body.removeChild(tempDiv);
                Swal.close();
                setTimeout(() => { printWindow.print(); }, 800);

            }, 1200);

        }).getAllDataForExport('anggota');
}

// ==========================================================
// 🤖 FITUR GOOGLE GEMINI AI STUDIO
// ==========================================================

// Tampilkan tombol chat AI hanya jika user sudah login (Taruh ini di dalam fungsi showPage() kamu jika mau)
document.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem('siempus_user')) {
        document.getElementById('btn-ai-chat').classList.remove('d-none');
    }
});

// --- FITUR 1: AI AUTO-LENGKAPI BUKU (VIA BACKEND) ---
function lengkapiBukuDenganAI() {
    const judul = document.getElementById('bJudul').value.trim();
    if (!judul) return Swal.fire('Oops', 'Ketik judul bukunya dulu ya!', 'warning');

    const btn = document.getElementById('btn-ai-buku');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    const prompt = `Berikan informasi buku nyata dengan judul mirip "${judul}". Balas HANYA dengan format JSON murni tanpa awalan/akhiran markdown. Format: {"pengarang":"nama", "penerbit":"nama", "tahun":"20xx", "kategori":"Kategori buku"}. Jika tidak tahu, tebak dengan masuk akal.`;

    google.script.run
        .withFailureHandler(err => {
            btn.innerHTML = '<i class="fas fa-magic"></i> AI'; btn.disabled = false;
            Swal.fire('Gagal', 'Koneksi ke backend AI terputus.', 'error');
        })
        .withSuccessHandler(res => {
            btn.innerHTML = '<i class="fas fa-magic"></i> AI'; btn.disabled = false;
            if (res.status) {
                let textResult = res.result.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                    const info = JSON.parse(textResult);
                    if (info.pengarang) document.getElementById('bPengarang').value = info.pengarang;
                    if (info.penerbit) document.getElementById('bPenerbit').value = info.penerbit;
                    if (info.tahun) document.getElementById('bTahun').value = info.tahun;
                    if (info.kategori) document.getElementById('bKategori').value = info.kategori;
                    Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Buku dilengkapi AI!', showConfirmButton: false, timer: 2000 });
                } catch (e) {
                    Swal.fire('Error', 'Format data AI tidak sesuai.', 'error');
                }
            } else {
                Swal.fire('Gagal', res.message, 'error');
            }
        }).callGeminiAI(prompt);
}

// --- FITUR 3: WIDGET ASISTEN AI (VIA BACKEND) ---
function sendAIChat() {
    const inputEl = document.getElementById('ai-chat-input');
    const msg = inputEl.value.trim();
    if (!msg) return;

    const chatBody = document.getElementById('ai-chat-body');
    const btnSend = document.getElementById('btn-send-ai');

    chatBody.innerHTML += `<div class="p-2 bg-primary text-white rounded-3 shadow-sm" style="align-self: flex-end; max-width: 85%; font-size: 13px;">${msg}</div>`;
    inputEl.value = '';
    btnSend.disabled = true;
    btnSend.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
    chatBody.scrollTop = chatBody.scrollHeight;

    const systemContext = buildDatabaseContext(); // Pastikan fungsi ini tetap ada di kodemu
    const finalPrompt = `Konteks Data Perpustakaan Saat Ini:\n${systemContext}\n\nPertanyaan User: "${msg}"\n\nINSTRUKSI PENTING UNTUK AI:\n1. Jika user bertanya tentang data spesifik perpustakaan sekolah ini, jawab HANYA berdasarkan "Konteks Data" di atas. Jika data kosong, minta admin buka menu terkait.\n2. JIKA user bertanya hal UMUM, gunakan wawasan luasmu.\n3. Jawab dengan gaya bahasa ramah dan gaul.`;

    google.script.run
        .withFailureHandler(err => {
            btnSend.disabled = false; btnSend.innerHTML = '<i class="fas fa-paper-plane"></i>';
            chatBody.innerHTML += `<div class="p-2 bg-danger text-white rounded-3 shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">Koneksi error!</div>`;
            chatBody.scrollTop = chatBody.scrollHeight;
        })
        .withSuccessHandler(res => {
            btnSend.disabled = false; btnSend.innerHTML = '<i class="fas fa-paper-plane"></i>';
            if (res.status) {
                let botReply = res.result.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>');
                chatBody.innerHTML += `<div class="p-2 bg-white rounded-3 border shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">${botReply}</div>`;
            } else {
                chatBody.innerHTML += `<div class="p-2 bg-warning text-dark rounded-3 shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">AI: ${res.message}</div>`;
            }
            chatBody.scrollTop = chatBody.scrollHeight;
        }).callGeminiAI(finalPrompt);
}

// --- FITUR 3: WIDGET ASISTEN AI BERBASIS DATABASE ---

function toggleAIChat() {
    const box = document.getElementById('ai-chat-box');
    if (box.classList.contains('d-none')) {
        box.classList.remove('d-none');
        document.getElementById('ai-chat-input').focus();
    } else {
        box.classList.add('d-none');
    }
}

// Fungsi untuk menyusun konteks (mengambil data dari layar/sistem) untuk disuapkan ke AI
// Fungsi untuk menyusun konteks (mengambil data dari layar/sistem) untuk disuapkan ke AI
function buildDatabaseContext() {
    let context = "Kamu adalah Asisten AI Perpustakaan SiE-MPuS. Jawab dengan ramah, singkat, dan bahasa Indonesia gaul tapi sopan. Berikut adalah ringkasan data perpustakaan saat ini:\n\n";

    // 1. Ambil data langsung dari variabel global (Paling akurat)
    context += `- Total Judul Buku (di tabel): ${bookTotal} judul\n`;
    context += `- Total Anggota (di tabel): ${memberTotal} orang\n`;
    context += `- Total Transaksi Riwayat: ${historyTotal}\n`;

    // 2. Ambil (Scraping) data dari Dashboard
    const h3s = document.querySelectorAll('#stats-container h3'); // Mengambil angka-angka utama
    const h2s = document.querySelectorAll('#stats-container h2'); // Mengambil angka status saat ini
    const spans = document.querySelectorAll('#stats-container .d-flex span.fw-bold.text-dark'); // Mengambil nama Hall of Fame

    if (h3s.length >= 4) {
        context += `- Total Judul Buku (Dashboard): ${h3s[0].innerText}\n`;
        context += `- Total Eksemplar/Stok (Dashboard): ${h3s[1].innerText}\n`;
        context += `- Total Anggota Terdaftar (Dashboard): ${h3s[2].innerText}\n`;
        context += `- Total Peminjaman Sepanjang Waktu (Dashboard): ${h3s[3].innerText}\n`;
    }

    if (h2s.length >= 2) {
        context += `- Buku yang sedang dipinjam saat ini: ${h2s[0].innerText}\n`;
        context += `- Jumlah Transaksi Terlambat/Denda saat ini: ${h2s[1].innerText}\n`;
    }

    if (spans.length >= 2) {
        context += `- Siswa Terajin (Paling sering pinjam): ${spans[0].innerText}\n`;
        context += `- Buku Terpopuler (Paling sering dipinjam): ${spans[1].innerText}\n`;
    }

    // 3. Cek memori riwayat transaksi untuk melihat siapa yang telat
    if (typeof historyData !== 'undefined' && historyData.length > 0) {
        const nowMs = new Date().getTime();
        const telat = historyData.filter(r => (!r.status.includes('Kembali') && r.tglTempoTs > 0 && nowMs > r.tglTempoTs) || r.status.includes('Denda') || r.status.includes('Terlambat'));

        if (telat.length > 0) {
            const namaTelat = telat.map(r => `${r.namaAnggota} (Buku: ${r.judulBuku})`).join(", ");
            context += `- Daftar siswa yang SEDANG TERLAMBAT: ${namaTelat}.\n`;
        } else {
            context += `- Saat ini tidak ada siswa yang terlambat di catatan tabel.\n`;
        }
    }

    // 4. Cek memori buku untuk rekomendasi
    if (typeof bookData !== 'undefined' && bookData.length > 0) {
        // Ambil 10 buku pertama sebagai contoh rekomendasi
        const rekomendasi = bookData.slice(0, 10).map(b => b[1]).join(", ");
        context += `- Beberapa contoh koleksi judul buku yang ada di perpus: ${rekomendasi}.\n`;
    }

    return context;
}

// Memicu tombol Enter di Chat AI
document.getElementById('ai-chat-input')?.addEventListener("keypress", function (event) {
    if (event.key === "Enter") { event.preventDefault(); sendAIChat(); }
});

// FITUR AUTO-LENGKAPI NISN 10 DIGIT
function formatNISN() {
    const inputEl = document.getElementById('mId');
    let val = inputEl.value.trim();

    // Jika input tidak kosong dan kurang dari 10 digit
    if (val !== "" && val.length < 10) {
        // Tampilkan peringatan
        Swal.fire({
            icon: 'info',
            title: 'Format NISN Disesuaikan',
            text: `NISN wajib 10 digit. Sistem otomatis menambahkan angka 0 di depan data Anda.`,
            timer: 3500, // Hilang otomatis dalam 3.5 detik
            showConfirmButton: false
        });

        // Tambahkan 0 di depan otomatis sampai pas 10 digit
        inputEl.value = val.padStart(10, '0');
    }
}

// --- LOGIKA MODAL IMPORT ---
let currentImportTarget = '';
function openImportModal(type) {
    currentImportTarget = type;
    document.getElementById('importTitle').innerText = type === 'buku' ? 'Buku' : 'Anggota';
    const sourceContainer = document.getElementById('importSourceContainer');
    if (sourceContainer) {
        if (type === 'anggota') {
            sourceContainer.style.display = 'block';
            document.getElementById('importSourceSelect').value = 'sistem';
        } else {
            sourceContainer.style.display = 'none';
        }
    }
    if (typeof toggleImportSource === 'function') toggleImportSource();
    new bootstrap.Modal(document.getElementById('modalImport')).show();
}

function toggleImportSource() {
    const src = document.getElementById('importSourceSelect').value;
    const btnDown = document.getElementById('btnDownloadTemplate');
    const importDesc = document.getElementById('importDesc');
    const btnUploadText = document.getElementById('btnUploadText');
    if (currentImportTarget === 'anggota' && src === 'dapodik') {
        if (btnDown) btnDown.style.display = 'none';
        if (importDesc) importDesc.innerText = 'Pastikan format adalah hasil unduhan Dapodik asli (header berada di baris ke-5).';
        if (btnUploadText) btnUploadText.innerText = 'Upload Excel Dapodik';
    } else {
        if (btnDown) btnDown.style.display = 'block';
        if (importDesc) importDesc.innerText = 'Pastikan format data di Excel sudah sesuai dengan template sebelum melakukan upload agar tidak terjadi error.';
        if (btnUploadText) btnUploadText.innerText = '2. Upload File Excel (Import)';
    }
}

function downloadCurrentTemplate() {
    downloadTemplate(currentImportTarget);
}
function triggerActualImport() {
    bootstrap.Modal.getInstance(document.getElementById('modalImport')).hide();
    triggerImport(currentImportTarget);
}

// --- UPDATE FUNGSI EXPORT (DENGAN FILTER) ---
function exportData(type) {
    showSmartLoading('Mempersiapkan Unduhan...', 'Menyaring data dari database.');
    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(serverData => {
            if (serverData.length === 0) { Swal.fire('Info', 'Belum ada data.', 'info'); return; }

            let targetData = serverData;
            let headers = []; let fileName = "";

            // LOGIKA FILTER
            if (type === 'buku') {
                headers = ["Kode Buku", "Judul", "Pengarang", "Penerbit", "Tahun", "Kategori", "Stok Total", "Stok Tersedia"];
                fileName = "Data_Buku.xlsx";

                const fTahun = document.getElementById('filterTahunExport').value.trim().toLowerCase();
                if (fTahun && fTahun !== '') {
                    targetData = serverData.filter(b => String(b[4]).toLowerCase() === fTahun); // Kolom 4 = Tahun
                    fileName = `Data_Buku_Tahun_${fTahun}.xlsx`;
                }
            } else {
                headers = ["ID/NISN", "Nama Lengkap", "Kelas", "Jenis Kelamin", "Tanggal Lahir", "No. HP"];
                fileName = "Data_Anggota.xlsx";

                const fKelas = document.getElementById('filterKelasExport').value.trim().toLowerCase();
                if (fKelas && fKelas !== '') {
                    targetData = serverData.filter(m => String(m[2]).toLowerCase() === fKelas); // Kolom 2 = Kelas
                    fileName = `Data_Anggota_Kelas_${fKelas}.xlsx`;
                }
            }

            if (targetData.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data yang cocok dengan filter tersebut.', 'info');
                return;
            }

            const dataToExport = [headers, ...targetData];
            const wb = XLSX.utils.book_new(); const ws = XLSX.utils.aoa_to_sheet(dataToExport);
            XLSX.utils.book_append_sheet(wb, ws, "Data Export");
            XLSX.writeFile(wb, fileName);
            Swal.close();
        }).getAllDataForExport(type);
}

// ==========================================================
// 🔍 PERBAIKAN FITUR FILTER TABEL (ANTI NGADAT)
// ==========================================================

// 1. Filter Buku (Presisi 100%)
window.applyFilterBuku = function () {
    const tahun = document.getElementById('filterTahunExport').value.trim();
    const searchBox = document.querySelector('#page-buku .custom-search input');
    if (searchBox) searchBox.value = '';

    bookPage = 1;
    // Kirim sandi 'exact_tahun:' ke server
    const query = tahun ? "exact_tahun:" + tahun : "";
    loadBooks(query);
};

// 2. Ambil Kelas Otomatis dari Database
window.initDropdownKelas = function () {
    google.script.run.withSuccessHandler(data => {
        const select = document.getElementById('filterKelasExport');
        if (!select) return;

        // Ambil data kelas dari kolom ke-2, saring yang kosong, urutkan A-Z
        const uniqueKelas = [...new Set(data.map(item => String(item[2]).trim()))].filter(Boolean).sort();

        select.innerHTML = '<option value="">-- Semua Kelas --</option>';
        uniqueKelas.forEach(k => {
            select.innerHTML += `<option value="${k}">${k}</option>`;
        });
    }).getAllDataForExport('anggota');
};

// 3. Filter Anggota (Presisi 100%)
window.applyFilterAnggota = function () {
    const kelas = document.getElementById('filterKelasExport').value.trim();
    const searchBox = document.querySelector('#page-anggota .custom-search input');
    if (searchBox) searchBox.value = '';

    memberPage = 1;
    document.getElementById('member-list-body').innerHTML = '<tr><td colspan="6" class="text-center py-5"><div class="spinner-border text-success" role="status"></div><div class="mt-2 text-muted small">Menyaring Kelas...</div></td></tr>';

    // Kirim sandi 'exact_kelas:' ke server
    const query = kelas ? "exact_kelas:" + kelas : "";
    loadMembers(query);
};

// ==========================================================
// 📲 LOGIKA BANNER INSTALL PWA PROFESIONAL
// ==========================================================
let deferredPrompt;

// 1. Tangkap izin instalasi dari browser
window.addEventListener('beforeinstallprompt', (e) => {
    // Mencegah popup default browser (mini-infobar)
    e.preventDefault();
    deferredPrompt = e;

    // Cek apakah user sebelumnya sudah menutup banner ini
    if (sessionStorage.getItem('pwa_banner_closed')) {
        return; // Jika sudah pernah ditutup, jangan tampilkan lagi
    }

    // Update teks banner sesuai ID tenant/sekolah saat ini
    const urlParamsPWA = new URLSearchParams(window.location.search);
    let tenantIdPWA = urlParamsPWA.get('id') || localStorage.getItem('siempus_tenant_id') || 'Demo';

    document.getElementById('pwa-banner-title').innerText = "SiE-MPuS " + tenantIdPWA.toUpperCase();

    // Update logo jika logo sekolah sudah diload dari backend
    if (typeof globalLogoUrl !== 'undefined' && globalLogoUrl !== '') {
        document.getElementById('pwa-banner-logo').src = globalLogoUrl;
    }

    // Munculkan banner dengan animasi meluncur dari bawah
    setTimeout(() => {
        const banner = document.getElementById('pwa-install-banner');
        if (banner) banner.style.transform = 'translateY(0)';
    }, 1500); // Tunda 1.5 detik biar aplikasinya loading dulu
});

// 2. Aksi jika tombol "Install" diklik
document.getElementById('btn-pwa-install').addEventListener('click', async () => {
    if (deferredPrompt) {
        // Panggil sistem popup install Android/Browser
        deferredPrompt.prompt();

        // Tunggu respon user
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') {
            console.log('User menginstal aplikasi');
        }

        // Sembunyikan banner ke bawah
        document.getElementById('pwa-install-banner').style.transform = 'translateY(150%)';
        deferredPrompt = null;
    }
});

// 3. Aksi jika tombol "X" (Tutup) diklik
document.getElementById('btn-pwa-close').addEventListener('click', () => {
    // Sembunyikan banner
    document.getElementById('pwa-install-banner').style.transform = 'translateY(150%)';

    // Simpan ingatan ke browser agar tidak muncul lagi saat pindah halaman
    sessionStorage.setItem('pwa_banner_closed', 'true');
});

// 4. Deteksi jika aplikasi sudah sukses terinstal
window.addEventListener('appinstalled', () => {
    // Sembunyikan banner permanen
    document.getElementById('pwa-install-banner').style.transform = 'translateY(150%)';

    // Tampilkan notifikasi sukses
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Aplikasi berhasil ditambahkan ke Layar Utama!',
        showConfirmButton: false,
        timer: 3000
    });
});



document.addEventListener("DOMContentLoaded", () => {
    // 1. Ambil ID Tenant (Sekolah) dari URL atau LocalStorage
    const urlParamsPWA = new URLSearchParams(window.location.search);
    let tenantIdPWA = urlParamsPWA.get('id') || localStorage.getItem('siempus_tenant_id') || 'demo';

    // 2. Buat Manifest secara Dinamis (Lengkap & Profesional)
    const dynamicManifest = {
        "name": "SiE-MPuS - " + tenantIdPWA.toUpperCase(),
        "short_name": "SiE-MPuS",
        "description": "Sistem E-Manajemen Perpustakaan Sekolah",
        "start_url": window.location.pathname + "?id=" + tenantIdPWA,
        "display": "standalone",
        "background_color": "#f0f2f5",
        "theme_color": "#4361ee",
        "orientation": "portrait-primary",
        "icons": [
            {
                "src": "./imgsiempus.png",
                "sizes": "72x72",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "96x96",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "128x128",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "144x144",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "152x152",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any maskable"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "384x384",
                "type": "image/png"
            },
            {
                "src": "./imgsiempus.png",
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any maskable"
            }
        ]
    };

    // 3. Ubah objek JSON menjadi File Virtual agar terbaca PWABuilder
    const manifestBlob = new Blob([JSON.stringify(dynamicManifest)], { type: 'application/json' });
    const manifestUrl = URL.createObjectURL(manifestBlob);

    // 4. Suntikkan ke dalam tag <head>
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = manifestUrl;
    document.head.appendChild(manifestLink);

    // 5. Daftarkan Service Worker (sw.js) khusus mode Web (HTTP/HTTPS)
    if (!window.isElectron && window.location.protocol !== 'file:' && 'serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(registration => {
                    console.log('PWA: Service Worker Aktif!', registration.scope);
                })
                .catch(err => {
                    console.log('PWA: Gagal mendaftarkan Service Worker:', err);
                });
        });
    }
});

// ==========================================================
// FITUR BACKUP & RESTORE OFFLINE
// ==========================================================
async function backupDataJSON() {
    try {
        Swal.fire({ title: 'Menyiapkan Backup...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        const rows = await window.electronAPI.dumpLocalDB();
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rows));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', 'backup_siempus_offline_' + new Date().getTime() + '.json');
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        Swal.fire('Berhasil!', 'Data berhasil dibackup.', 'success');
    } catch(e) {
        console.error('Backup gagal', e);
        Swal.fire('Gagal!', 'Terjadi kesalahan saat backup: ' + e.message, 'error');
    }
}

async function restoreDataJSON(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            if (!Array.isArray(backupData)) {
                Swal.fire('Gagal!', 'Format file JSON tidak valid (harus array dari dump SQLite)!', 'error');
                return;
            }
            Swal.fire({
                title: 'Konfirmasi Restore',
                text: 'Semua data lokal akan ditimpa dengan data dari file backup. Anda yakin?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Restore!'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    Swal.fire({ title: 'Merestore Data...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                    await window.electronAPI.restoreLocalDB(backupData);
                    Swal.fire('Berhasil!', 'Data berhasil direstore. Aplikasi akan dimuat ulang.', 'success').then(() => {
                        window.location.reload();
                    });
                }
            });
        } catch (err) {
            console.error('Restore gagal', err);
            Swal.fire('Gagal!', 'Gagal membaca atau memproses file backup: ' + err.message, 'error');
        }
    };
    reader.readAsText(file);
    input.value = ''; // Reset input agar bisa pilih file yang sama lagi
}

// ==========================================
// PUBLIC CATALOG LOGIC
// ==========================================
let publicCatalogAllBooks = null;
let publicCatalogCurrentPage = 1;
let publicCatalogCurrentAlpha = '';
let isPublicCatalogLoading = false;

function escapeCatalogHtml(text) {
    if (!text && text !== 0) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function initPublicCatalogAlphabet() {
    const alphaContainer = document.getElementById('publicCatalogAlphabetFilter');
    if (!alphaContainer) return;

    const alphabets = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let html = `
        <button type="button" class="btn btn-sm ${publicCatalogCurrentAlpha === '' ? 'btn-primary' : 'btn-outline-secondary'} fw-bold px-2 py-1 rounded-pill" onclick="filterPublicCatalog('')">
            Semua
        </button>
    `;

    alphabets.forEach(a => {
        const isActive = publicCatalogCurrentAlpha === a;
        html += `
            <button type="button" class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline-secondary'} px-2 py-1 rounded-pill" onclick="filterPublicCatalog('${a}')">
                ${a}
            </button>
        `;
    });

    alphaContainer.innerHTML = html;
}

function openPublicCatalog() {
    scrollToKatalog();
}

function resetPublicCatalog() {
    const sInput = document.getElementById('publicCatalogSearchInput');
    const sBy = document.getElementById('publicCatalogSearchBy');
    if (sInput) sInput.value = '';
    if (sBy) sBy.value = 'judul';
    publicCatalogCurrentAlpha = '';
    initPublicCatalogAlphabet();
    renderPublicCatalogPage(1);
}

function filterPublicCatalog(alpha) {
    publicCatalogCurrentAlpha = alpha;
    initPublicCatalogAlphabet();
    renderPublicCatalogPage(1);
}

function loadPublicCatalog(page = 1, forceRefresh = false) {
    if (publicCatalogAllBooks !== null && !forceRefresh) {
        renderPublicCatalogPage(page || 1);
        return;
    }

    if (isPublicCatalogLoading) return;
    isPublicCatalogLoading = true;

    const tbody = document.getElementById('publicCatalogTbody');
    const pagination = document.getElementById('publicCatalogPagination');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-muted"><div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>Memuat data buku...</td></tr>';
    }

    google.script.run
        .withFailureHandler(err => {
            isPublicCatalogLoading = false;
            console.error("Gagal memuat katalog buku:", err);
            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-danger py-4">
                            <i class="fas fa-exclamation-triangle me-1"></i> Gagal memuat data: ${escapeCatalogHtml(err)}<br>
                            <button class="btn btn-sm btn-outline-primary mt-2" onclick="loadPublicCatalog(1, true)"><i class="fas fa-redo me-1"></i> Coba Lagi</button>
                        </td>
                    </tr>
                `;
            }
        })
        .withSuccessHandler(res => {
            isPublicCatalogLoading = false;
            let rawData = [];

            if (Array.isArray(res)) {
                rawData = res;
            } else if (res && Array.isArray(res.data)) {
                rawData = res.data;
            } else if (res && Array.isArray(res.items)) {
                rawData = res.items;
            } else if (res && typeof res === 'object' && res.status === false) {
                if (tbody) {
                    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-danger py-4">${escapeCatalogHtml(res.message || 'Gagal memuat katalog.')}</td></tr>`;
                }
                return;
            }

            publicCatalogAllBooks = rawData;
            initPublicCatalogAlphabet();
            renderPublicCatalogPage(page || 1);
        })
        .getBookList(1, 10000, '');
}

function renderPublicCatalogPage(page = 1) {
    const tbody = document.getElementById('publicCatalogTbody');
    const pagination = document.getElementById('publicCatalogPagination');
    if (!tbody) return;

    if (!publicCatalogAllBooks) {
        loadPublicCatalog(page, true);
        return;
    }

    let data = [...publicCatalogAllBooks];

    // Filter Alphabet
    if (publicCatalogCurrentAlpha !== '') {
        data = data.filter(r => String(r[1] || '').trim().toUpperCase().startsWith(publicCatalogCurrentAlpha));
    }

    // Filter Kata Kunci Pencarian
    const searchInput = document.getElementById('publicCatalogSearchInput');
    const searchByElem = document.getElementById('publicCatalogSearchBy');
    const search = searchInput ? searchInput.value.trim().toLowerCase() : '';
    const searchBy = searchByElem ? searchByElem.value : 'judul';

    if (search !== '') {
        if (searchBy === 'judul') {
            data = data.filter(r => String(r[1] || '').toLowerCase().includes(search));
        } else if (searchBy === 'pengarang') {
            data = data.filter(r => String(r[2] || '').toLowerCase().includes(search));
        } else if (searchBy === 'penerbit') {
            data = data.filter(r => String(r[3] || '').toLowerCase().includes(search));
        }
    }

    // Pagination: 5 baris per halaman sesuai permintaan
    const limit = 5;
    const total = data.length;
    const totalPages = Math.ceil(total / limit) || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    publicCatalogCurrentPage = page;

    const start = (page - 1) * limit;
    const end = start + limit;
    const pagedData = data.slice(start, end);

    tbody.innerHTML = '';
    if (pagedData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-5"><i class="fas fa-info-circle me-1"></i> Tidak ada buku yang ditemukan.</td></tr>';
    } else {
        pagedData.forEach(r => {
            const sisa = parseInt(r[7]);
            const totalStok = parseInt(r[6]);
            const isAvailable = (!isNaN(sisa) ? sisa > 0 : (!isNaN(totalStok) ? totalStok > 0 : true));
            const ketersediaan = isAvailable
                ? `<span class="badge bg-success text-white rounded-pill px-3 py-2 fw-bold shadow-xs"><i class="fas fa-check-circle me-1"></i> Tersedia (${!isNaN(sisa) ? sisa : (totalStok || 1)})</span>`
                : `<span class="badge bg-danger text-white rounded-pill px-3 py-2 fw-bold shadow-xs"><i class="fas fa-times-circle me-1"></i> Dipinjam Semua</span>`;

            tbody.innerHTML += `
                <tr>
                    <td class="py-3 px-4">
                        <div class="fw-bold text-dark">${escapeCatalogHtml(r[1] || '-')}</div>
                        <div class="small text-muted mt-1">
                            <span class="badge bg-light text-secondary border me-1">Kode: ${escapeCatalogHtml(r[0] || '-')}</span>
                            ${r[4] ? `<span class="badge bg-light text-secondary border">Tahun: ${escapeCatalogHtml(r[4])}</span>` : ''}
                        </div>
                    </td>
                    <td class="py-3 px-4">${escapeCatalogHtml(r[2] || '-')}</td>
                    <td class="py-3 px-4">${escapeCatalogHtml(r[3] || '-')}</td>
                    <td class="py-3 px-4"><span class="badge bg-info bg-opacity-10 text-primary border border-info border-opacity-25 rounded-pill px-3 py-1">${escapeCatalogHtml(r[5] || 'Umum')}</span></td>
                    <td class="py-3 px-4 text-center">${ketersediaan}</td>
                </tr>
            `;
        });
    }

    if (pagination) {
        pagination.innerHTML = `
            <div class="small text-muted fw-semibold">
                Menampilkan ${total === 0 ? 0 : start + 1}-${Math.min(end, total)} dari ${total} buku <span class="badge bg-white text-dark border ms-1">5 buku / hal</span>
            </div>
            <div class="btn-group shadow-xs">
                <button type="button" class="btn btn-outline-primary btn-sm px-3" ${page <= 1 ? 'disabled' : ''} onclick="renderPublicCatalogPage(${page - 1})">
                    <i class="fas fa-chevron-left me-1"></i> Prev
                </button>
                <button type="button" class="btn btn-primary btn-sm disabled fw-bold px-3">${page} / ${totalPages}</button>
                <button type="button" class="btn btn-outline-primary btn-sm px-3" ${page >= totalPages ? 'disabled' : ''} onclick="renderPublicCatalogPage(${page + 1})">
                    Next <i class="fas fa-chevron-right ms-1"></i>
                </button>
            </div>
        `;
    }
}

function copyExecLink() {
    const linkInput = document.getElementById('offlineExecLinkDisplay');
    if (linkInput && linkInput.value) {
        navigator.clipboard.writeText(linkInput.value).then(() => {
            Swal.fire({
                toast: true, position: 'top-end', icon: 'success',
                title: 'Tersalin!', showConfirmButton: false, timer: 1500
            });
        });
    }
}

function updateLoginModeUI() {
    const indicator = document.getElementById('loginModeIndicator');
    if (!indicator) return;
    if (window.isElectron) {
        indicator.innerHTML = '<span class="badge bg-secondary px-3 py-1 rounded-pill shadow-sm"><i class="fas fa-desktop me-1"></i> Mode Desktop (Offline)</span>';
    } else {
        indicator.innerHTML = '<span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-1 rounded-pill shadow-sm"><i class="fas fa-globe me-1"></i> Mode Online (Web)</span>';
    }
}

function showLoginPage() {
    const landingApp = document.getElementById('landing-app');
    const loginApp = document.getElementById('login-app');
    
    if (landingApp) {
        landingApp.classList.remove('d-flex');
        landingApp.classList.add('d-none');
    }
    
    if (loginApp) {
        loginApp.classList.remove('d-none');
        loginApp.classList.add('d-flex');
    }

    updateLoginModeUI();
}

function showLandingPage() {
    const landingApp = document.getElementById('landing-app');
    const loginApp = document.getElementById('login-app');
    
    if (loginApp) {
        loginApp.classList.remove('d-flex');
        loginApp.classList.add('d-none');
    }
    
    if (landingApp) {
        landingApp.classList.remove('d-none');
        landingApp.classList.remove('d-flex');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.scrollToKatalog = function() {
    const landingApp = document.getElementById('landing-app');
    const loginApp = document.getElementById('login-app');
    if (loginApp) {
        loginApp.classList.remove('d-flex');
        loginApp.classList.add('d-none');
    }
    if (landingApp) {
        landingApp.classList.remove('d-none');
        landingApp.classList.remove('d-flex');
    }

    initPublicCatalogAlphabet();
    if (!publicCatalogAllBooks) {
        loadPublicCatalog(1);
    } else {
        renderPublicCatalogPage(publicCatalogCurrentPage || 1);
    }

    const target = document.getElementById('katalog-section');
    if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
    }
};
