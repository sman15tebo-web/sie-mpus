/* ========================================================
   OFFLINE & SYNCHRONIZATION (SQLite)
======================================================== */
const dbName = 'SiEmpusDB';
const dbVersion = 1;
let activeSyncSessionToken = '';
let localDB = null;

function initDB() {
    return new Promise((resolve, reject) => {
        localDB = true; // Mock localDB for SQLite compatibility
        updateNetworkStatus();
        updateSyncBadge();
        resolve(localDB);
    });
}

function saveToLocalDB(storeName, data) {
    return new Promise(async (resolve, reject) => {
        let key = storeName === 'cache' ? data.key : data.id;
        try {
            if (window.electronAPI && window.electronAPI.saveToLocalDB) {
                await window.electronAPI.saveToLocalDB(storeName, key, data);
            } else {
                const storageKey = 'siempus_' + storeName + '_' + (key || Date.now());
                localStorage.setItem(storageKey, JSON.stringify(data));
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

function getFromLocalDB(storeName, key = null) {
    return new Promise(async (resolve, reject) => {
        try {
            if (window.electronAPI && window.electronAPI.getFromLocalDB) {
                const result = await window.electronAPI.getFromLocalDB(storeName, key);
                resolve(result !== undefined && result !== null ? result : (key != null ? null : []));
            } else {
                if (storeName === 'syncQueue') {
                    const rawQueue = localStorage.getItem('siempus_syncQueue');
                    const qList = rawQueue ? JSON.parse(rawQueue) : [];
                    if (key != null) {
                        const found = qList.find(item => String(item.id) === String(key));
                        if (found) return resolve(found);
                        const fallbackItem = localStorage.getItem('siempus_syncQueue_' + key);
                        return resolve(fallbackItem ? JSON.parse(fallbackItem) : null);
                    } else {
                        const items = [...qList];
                        for (let i = 0; i < localStorage.length; i++) {
                            const k = localStorage.key(i);
                            if (k && k.startsWith('siempus_syncQueue_')) {
                                try { items.push(JSON.parse(localStorage.getItem(k))); } catch (e) { }
                            }
                        }
                        return resolve(items);
                    }
                }

                if (key != null) {
                    const item = localStorage.getItem('siempus_' + storeName + '_' + key);
                    resolve(item ? JSON.parse(item) : null);
                } else {
                    const items = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('siempus_' + storeName + '_')) {
                            try { items.push(JSON.parse(localStorage.getItem(k))); } catch (e) { }
                        }
                    }
                    resolve(items);
                }
            }
        } catch (e) {
            reject(e);
        }
    });
}

function deleteFromLocalDB(storeName, key) {
    return new Promise(async (resolve, reject) => {
        try {
            if (window.electronAPI && window.electronAPI.deleteFromLocalDB) {
                await window.electronAPI.deleteFromLocalDB(storeName, key);
            } else {
                if (storeName === 'syncQueue') {
                    const rawQueue = localStorage.getItem('siempus_syncQueue');
                    if (rawQueue) {
                        try {
                            const qList = JSON.parse(rawQueue);
                            const filtered = qList.filter(item => String(item.id) !== String(key));
                            localStorage.setItem('siempus_syncQueue', JSON.stringify(filtered));
                        } catch (e) { }
                    }
                }
                localStorage.removeItem('siempus_' + storeName + '_' + key);
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

function clearLocalDB(storeName) {
    return new Promise(async (resolve, reject) => {
        try {
            if (window.electronAPI && window.electronAPI.clearLocalDB) {
                await window.electronAPI.clearLocalDB(storeName);
            } else {
                localStorage.removeItem('siempus_' + storeName);
                const prefix = 'siempus_' + storeName + '_';
                const keysToRemove = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(prefix)) keysToRemove.push(k);
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
            }
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

async function addToQueue(action, payload, offlineTransaction = null) {
    return new Promise(async (resolve, reject) => {
        try {
            const queuedPayload = offlineTransaction
                ? { ...payload, offlineRecord: offlineTransaction.row }
                : payload;
            const data = { action, payload: queuedPayload, timestamp: new Date().getTime() };
            if (offlineTransaction && window.electronAPI?.enqueueOfflineTransaction) {
                await window.electronAPI.enqueueOfflineTransaction(action, queuedPayload, offlineTransaction);
            } else if (window.electronAPI && window.electronAPI.saveToLocalDB) {
                await window.electronAPI.saveToLocalDB('syncQueue', null, data);
                if (offlineTransaction) {
                    await window.electronAPI.saveToLocalDB('offlineTransactions', offlineTransaction.id, offlineTransaction);
                }
            } else {
                const q = JSON.parse(localStorage.getItem('siempus_syncQueue') || '[]');
                data.id = Date.now();
                q.push(data);
                localStorage.setItem('siempus_syncQueue', JSON.stringify(q));
            }
            updateSyncBadge();
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

function updateSyncBadge() {
    getFromLocalDB('syncQueue').then(queue => {
        const badge = document.getElementById('sync-badge');
        const btn = document.getElementById('btn-manual-sync');
        const list = Array.isArray(queue) ? queue : [];
        if (badge && btn) {
            badge.innerText = list.length;
            // Always keep sync button visible
            btn.classList.remove('d-none');
        }
    }).catch(() => { });
}

function updateNetworkStatus() {
    const isOnline = navigator.onLine;
    const el = document.getElementById('network-status');
    if (el) {
        if (window.isElectron) {
            el.className = "me-3 px-3 py-1 rounded-pill fw-bold text-white bg-secondary shadow-sm";
            el.innerHTML = '<i class="fas fa-desktop me-1"></i> Mode Desktop (Offline)';
        } else if (isOnline) {
            el.className = "me-3 px-3 py-1 rounded-pill fw-bold text-white bg-success shadow-sm";
            el.innerHTML = '<i class="fas fa-wifi me-1"></i> Online';
        } else {
            el.className = "me-3 px-3 py-1 rounded-pill fw-bold text-white bg-danger shadow-sm";
            el.innerHTML = '<i class="fas fa-plane me-1"></i> Offline';
        }
    }
}

window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
initDB();

const SYNC_PLACEHOLDER_URL = 'https://script.google.com/macros/s/GANTI_DENGAN_LINK_EXEC_ANDA/exec';

function syncEscapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Link exec default: diambil dari config-offline.js (OFFLINE_EXEC_LINK / gasUrl)
function getConfiguredExecLink() {
    try {
        if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
            const c = window.electronAPI.getConfig();
            if (c && c.OFFLINE_EXEC_LINK) return c.OFFLINE_EXEC_LINK;
            if (c && c.gasUrl) return c.gasUrl;
        }
    } catch (_) { /* abaikan */ }
    return localStorage.getItem('siempus_sync_url') || '';
}

// Modal input link exec (otomatis terisi dari config-offline.js, tetap bisa diubah)
async function askSyncExecLink(pendingCount) {
    const defaultUrl = getConfiguredExecLink();
    const result = await Swal.fire({
        title: 'Sinkronisasi Data',
        html: `
            <div class="text-start">
                <div class="alert alert-info py-2 small mb-3">
                    <i class="fas fa-info-circle me-1"></i>
                    Antrean perubahan lokal: <b>${pendingCount}</b> data.
                    Setelah dikirim, seluruh data terbaru dari server akan ditarik ke SQLite.
                </div>
                <label for="syncExecLinkInput" class="form-label fw-bold small mb-1">
                    <i class="fas fa-link me-1"></i>Link Exec (Web App Google Apps Script)
                </label>
                <input type="url" id="syncExecLinkInput" class="form-control form-control-sm"
                    placeholder="https://script.google.com/macros/s/.../exec"
                    autocomplete="off" spellcheck="false">
                <div class="form-text small">Otomatis terisi. JIka kosong, copy paste dari kolom link exec di menu pengaturan, tab kemananan akun.</div>
            </div>`,
        showCancelButton: true,
        focusConfirm: false,
        confirmButtonText: '<i class="fas fa-sync-alt me-1"></i> Mulai Sinkronisasi',
        cancelButtonText: 'Batal',
        width: 560,
        didOpen: () => {
            const el = document.getElementById('syncExecLinkInput');
            if (el) el.value = defaultUrl;
        },
        preConfirm: () => {
            const value = (document.getElementById('syncExecLinkInput')?.value || '').trim();
            if (!value) { Swal.showValidationMessage('Link exec tidak boleh kosong!'); return false; }
            if (!value.includes('script.google.com/macros/s/')) {
                Swal.showValidationMessage('Pastikan URL valid dari Google Apps Script (script.google.com/macros/s/.../exec)');
                return false;
            }
            if (value === SYNC_PLACEHOLDER_URL) {
                Swal.showValidationMessage('Link exec masih berupa contoh, ganti dengan link asli instansi Anda!');
                return false;
            }
            return value;
        }
    });
    return result.isConfirmed ? result.value : null;
}

// Modal progress: persentase + daftar tahapan sinkronisasi
function createSyncProgress(stages) {
    const totalUnits = stages.reduce((sum, s) => sum + s.units, 0) || 1;
    const stageMap = {};
    stages.forEach((s, i) => { stageMap[s.key] = { ...s, index: i + 1 }; });
    let doneUnits = 0;

    const listHtml = stages.map((s, i) => `
        <li id="syncStep_${s.key}" class="d-flex align-items-center py-1 text-muted">
            <i class="far fa-circle me-2" style="width:16px;text-align:center"></i>
            <span>${i + 1}. ${syncEscapeHtml(s.label)}</span>
            <span class="ms-auto small" data-role="note"></span>
        </li>`).join('');

    Swal.fire({
        title: 'Sinkronisasi Berjalan',
        html: `
            <div class="text-start">
                <div class="d-flex justify-content-between small fw-bold mb-1">
                    <span id="syncStageLabel">Menyiapkan...</span>
                    <span id="syncPercent">0%</span>
                </div>
                <div class="progress" style="height:20px">
                    <div id="syncBar" class="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                        role="progressbar" style="width:0%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></div>
                </div>
                <div id="syncDetail" class="small text-muted mt-2" style="min-height:1.2em"></div>
                <ul class="list-unstyled small mt-3 mb-0">${listHtml}</ul>
            </div>`,
        width: 560,
        allowOutsideClick: false,
        allowEscapeKey: false,
        showConfirmButton: false
    });

    const setPercent = (units) => {
        const pct = Math.max(0, Math.min(100, Math.round((units / totalUnits) * 100)));
        const bar = document.getElementById('syncBar');
        const label = document.getElementById('syncPercent');
        if (bar) { bar.style.width = pct + '%'; bar.setAttribute('aria-valuenow', String(pct)); }
        if (label) label.textContent = pct + '%';
    };
    const setIcon = (key, iconClass, rowClass) => {
        const row = document.getElementById('syncStep_' + key);
        if (!row) return;
        row.className = 'd-flex align-items-center py-1 ' + rowClass;
        const icon = row.querySelector('i');
        if (icon) icon.className = iconClass + ' me-2';
    };

    return {
        start(key) {
            const s = stageMap[key];
            if (!s) return;
            setIcon(key, 'fas fa-spinner fa-spin', 'text-primary fw-bold');
            const stageLabel = document.getElementById('syncStageLabel');
            if (stageLabel) stageLabel.textContent = `Tahap ${s.index}/${stages.length}: ${s.label}`;
        },
        progress(key, fraction, detail) {
            const s = stageMap[key];
            if (!s) return;
            setPercent(doneUnits + s.units * Math.max(0, Math.min(1, fraction)));
            if (detail !== undefined) {
                const el = document.getElementById('syncDetail');
                if (el) el.textContent = detail;
            }
        },
        finish(key, ok, note) {
            const s = stageMap[key];
            if (!s) return;
            doneUnits += s.units;
            setPercent(doneUnits);
            if (ok) setIcon(key, 'fas fa-check-circle', 'text-success');
            else setIcon(key, 'fas fa-exclamation-triangle', 'text-warning');
            const row = document.getElementById('syncStep_' + key);
            const noteEl = row ? row.querySelector('[data-role="note"]') : null;
            if (noteEl && note) noteEl.textContent = note;
        },
        complete() {
            setPercent(totalUnits);
            const bar = document.getElementById('syncBar');
            if (bar) bar.classList.remove('progress-bar-animated');
        }
    };
}

async function postSyncRequest(url, payload) {
    const requestPayload = payload.action === 'loginUser'
        ? payload
        : {
            ...payload,
            sessionToken: activeSyncSessionToken || (window.SessionStore && window.SessionStore.get('siempus_session_token')) || ''
        };
    if (window.isElectron && typeof window.electronAPI?.proxyGas === 'function') {
        return window.electronAPI.proxyGas(url, requestPayload);
    }

    const response = await fetch(url, {
        redirect: 'follow',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(requestPayload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function askSyncSession(url) {
    const result = await Swal.fire({
        title: 'Login Sinkronisasi',
        html: '<div class="text-start"><label class="form-label small fw-bold" for="syncUsername">Username server</label><input id="syncUsername" class="form-control mb-2" autocomplete="username"><label class="form-label small fw-bold" for="syncPassword">Password server</label><input id="syncPassword" type="password" class="form-control" autocomplete="current-password"></div>',
        showCancelButton: true,
        confirmButtonText: 'Login dan Sinkronkan',
        cancelButtonText: 'Batal',
        focusConfirm: false,
        preConfirm: async () => {
            const username = document.getElementById('syncUsername')?.value.trim();
            const password = document.getElementById('syncPassword')?.value;
            if (!username || !password) {
                Swal.showValidationMessage('Masukkan username dan password server.');
                return false;
            }
            try {
                const response = await postSyncRequest(url, { action: 'loginUser', username, password });
                if (response?.status !== true || !response.sessionToken) {
                    Swal.showValidationMessage(response?.message || 'Login server gagal.');
                    return false;
                }
                return response.sessionToken;
            } catch (error) {
                Swal.showValidationMessage(error?.message || 'Koneksi ke server gagal.');
                return false;
            }
        }
    });
    return result.isConfirmed ? result.value : '';
}

async function manualSync() {
    try {
        const queueResult = await getFromLocalDB('syncQueue');
        const queue = Array.isArray(queueResult) ? queueResult : [];

        // 1. Modal link exec (otomatis terisi dari config-offline.js)
        const urlTarget = await askSyncExecLink(queue.length);
        if (!urlTarget) return; // dibatalkan pengguna
        activeSyncSessionToken = await askSyncSession(urlTarget);
        if (!activeSyncSessionToken) return;

        const hasConfigLink = Boolean(
            window.electronAPI && typeof window.electronAPI.getConfig === 'function' &&
            (window.electronAPI.getConfig().OFFLINE_EXEC_LINK || window.electronAPI.getConfig().gasUrl)
        );
        if (!hasConfigLink) localStorage.setItem('siempus_sync_url', urlTarget);

        // 2. Susun tahapan sinkronisasi
        const stages = [];
        const hasPendingSopUpload = localStorage.getItem('siempus_offline_sop_pdf_pending_sync') === 'true';
        const hasPendingSopDelete = localStorage.getItem('siempus_offline_sop_pdf_pending_delete') === 'true';
        const hasPendingDasarHukum = localStorage.getItem('offline_dasar_hukum_pending_sync') === 'true';
        const extraPendingOut = (hasPendingSopUpload ? 1 : 0) + (hasPendingSopDelete ? 1 : 0) + (hasPendingDasarHukum ? 1 : 0);
        const totalOut = queue.length + extraPendingOut;

        if (totalOut > 0) {
            stages.push({ key: 'queue', label: `Kirim ${totalOut} perubahan lokal ke server`, units: totalOut });
        }
        stages.push(
            { key: 'config', label: 'Tarik pengaturan sistem', units: 1 },
            { key: 'sop', label: 'Tarik dokumen SOP & dasar hukum', units: 1 },
            { key: 'dashboard', label: 'Tarik statistik dashboard', units: 1 },
            { key: 'books', label: 'Tarik data buku', units: 1 },
            { key: 'members', label: 'Tarik data siswa/anggota', units: 1 },
            { key: 'teachers', label: 'Tarik data guru & tendik', units: 1 },
            { key: 'historyActive', label: 'Tarik riwayat peminjaman aktif', units: 1 },
            { key: 'historyArchive', label: 'Tarik riwayat arsip', units: 1 },
            { key: 'visitors', label: 'Tarik data buku kunjungan', units: 1 }
        );
        const progressUi = createSyncProgress(stages);

        let successCount = 0;
        let failCount = 0;
        const failedMessages = [];
        const pullErrors = [];
        const pulled = { books: 0, members: 0, teachers: 0, historyActive: 0, historyArchive: 0, visitors: 0 };

        // 3. Kirim antrean perubahan lokal
        if (totalOut > 0) {
            progressUi.start('queue');
            let processedOut = 0;

            // 3a. Kirim antrean transaksi / data umum
            const blockedOfflineTransactions = new Set();
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                processedOut++;
                progressUi.progress('queue', processedOut / totalOut, `Mengirim ${processedOut} dari ${totalOut}: ${item.action}`);

                const isTransaction = item.action === 'prosesPeminjaman' || item.action === 'prosesPengembalian';
                const transactionId = isTransaction
                    ? String(item.payload?.offlineRecord?.[0] || '')
                    : '';
                if (transactionId && blockedOfflineTransactions.has(transactionId)) {
                    failCount++;
                    failedMessages.push(`Transaksi ${transactionId} ditahan karena langkah sebelumnya belum berhasil disinkronkan.`);
                    continue;
                }

                try {
                    const payload = { ...item.payload, action: item.action };
                    const data = await postSyncRequest(urlTarget, payload);
                    if (data &&
                        data.success !== false &&
                        data.status !== false &&
                        (data.success === true || data.status === true)) {
                        await deleteFromLocalDB('syncQueue', item.id);
                        successCount++;
                    } else {
                        failCount++;
                        failedMessages.push(data?.message || `Server menolak aksi ${item.action}.`);
                        if (transactionId) blockedOfflineTransactions.add(transactionId);
                    }
                } catch (err) {
                    failCount++;
                    failedMessages.push(err.message || String(err));
                    if (transactionId) blockedOfflineTransactions.add(transactionId);
                }
            }

            // 3b. Kirim Dokumen SOP Kustom jika ada berkas lokal baru
            if (hasPendingSopUpload) {
                processedOut++;
                progressUi.progress('queue', processedOut / totalOut, `Mengunggah berkas SOP PDF ke Google Drive...`);
                try {
                    let fileDataUrl = localStorage.getItem('siempus_sop_pdf_data');
                    let meta = null;
                    try { meta = JSON.parse(localStorage.getItem('siempus_sop_pdf_meta') || 'null'); } catch(_) {}

                    if (!fileDataUrl && window.isElectron && window.electronAPI && typeof window.electronAPI.getOfflineSopPdf === 'function') {
                        const offRes = await window.electronAPI.getOfflineSopPdf();
                        if (offRes && offRes.base64) {
                            fileDataUrl = offRes.base64;
                            meta = offRes.meta || meta;
                        }
                    }

                    if (fileDataUrl) {
                        const sopUpRes = await postSyncRequest(urlTarget, {
                            action: 'uploadSopPdf',
                            fileDataUrl: fileDataUrl,
                            filename: meta?.name || 'Dokumen_SOP_Perpustakaan.pdf'
                        });
                        if (sopUpRes && (sopUpRes.success || sopUpRes.status)) {
                            localStorage.removeItem('siempus_offline_sop_pdf_pending_sync');
                            if (sopUpRes.url) localStorage.setItem('siempus_sop_pdf_url', sopUpRes.url);
                            if (sopUpRes.meta) localStorage.setItem('siempus_sop_pdf_meta', JSON.stringify(sopUpRes.meta));
                            successCount++;
                        } else {
                            failCount++;
                            failedMessages.push('Unggah SOP ke Drive: ' + (sopUpRes?.message || 'Server menolak berkas'));
                        }
                    }
                } catch (sopUpErr) {
                    failCount++;
                    failedMessages.push('Gagal unggah SOP offline: ' + (sopUpErr.message || String(sopUpErr)));
                }
            } else if (hasPendingSopDelete) {
                processedOut++;
                progressUi.progress('queue', processedOut / totalOut, `Menghapus dokumen SOP di server...`);
                try {
                    const sopDelRes = await postSyncRequest(urlTarget, { action: 'deleteSopPdf' });
                    if (sopDelRes && (sopDelRes.success || sopDelRes.status)) {
                        localStorage.removeItem('siempus_offline_sop_pdf_pending_delete');
                        successCount++;
                    }
                } catch (sopDelErr) {
                    console.warn('Gagal menghapus SOP di server:', sopDelErr);
                }
            }

            // 3c. Kirim Perubahan Daftar Dasar Hukum jika ada perubahan lokal
            if (hasPendingDasarHukum) {
                processedOut++;
                progressUi.progress('queue', processedOut / totalOut, `Menyinkronkan daftar dasar hukum...`);
                try {
                    let dhList = null;
                    try { dhList = JSON.parse(localStorage.getItem('dasar_hukum_list') || 'null'); } catch(_) {}
                    if (dhList && Array.isArray(dhList)) {
                        const dhUpRes = await postSyncRequest(urlTarget, {
                            action: 'saveDasarHukumList',
                            list: dhList
                        });
                        if (dhUpRes && (dhUpRes.success || dhUpRes.status)) {
                            localStorage.removeItem('offline_dasar_hukum_pending_sync');
                            successCount++;
                        }
                    }
                } catch(dhErr) {
                    console.warn('Gagal sinkron dasar hukum:', dhErr);
                }
            }

            progressUi.finish('queue', failCount === 0, `${successCount} berhasil${failCount ? `, ${failCount} gagal` : ''}`);
        }

        // 4. Tarik data terbaru dari server
        const getData = async (payload) => {
            const data = await postSyncRequest(urlTarget, payload);
            if (!data || data.success === false || data.status === false) {
                throw new Error(data?.message || `Server menolak ${payload.action}.`);
            }
            return data;
        };
        const saveCache = async (payload, data) => {
            const cacheKey = payload.action + '_' + JSON.stringify(payload);
            await saveToLocalDB('cache', { key: cacheKey, data });
        };
        const pullPaged = async (stageKey, action, isArchive = false) => {
            const limit = 500;
            const rows = [];
            let page = 1;
            let total = 0;
            do {
                const payload = { action, page, limit, search: '' };
                if (action === 'getHistoryList') payload.isArchive = isArchive;
                const result = await getData(payload);
                const pageRows = Array.isArray(result.data) ? result.data : [];
                rows.push(...pageRows);
                total = Number(result.total) || rows.length;
                progressUi.progress(stageKey, total ? rows.length / total : 1, `Menerima ${rows.length} dari ${total} baris...`);
                if (!pageRows.length) break;
                page++;
            } while (rows.length < total);

            for (const cacheLimit of [10000, 10]) {
                const cachePayload = {
                    action,
                    page: 1,
                    limit: cacheLimit,
                    search: ''
                };
                if (action === 'getHistoryList') cachePayload.isArchive = isArchive;
                const resultRows = cacheLimit === 10000 ? rows : rows.slice(0, cacheLimit);
                await saveCache(cachePayload, {
                    success: true,
                    status: true,
                    data: resultRows,
                    total: rows.length,
                    page: 1,
                    limit: cacheLimit
                });
            }
            return rows.length;
        };
        // Jalankan satu tahap tarik data dengan penanda progres & penangkapan error
        const runPullStage = async (key, errorLabel, task) => {
            progressUi.start(key);
            progressUi.progress(key, 0, 'Menghubungi server...');
            try {
                const note = await task();
                progressUi.finish(key, true, note || '');
            } catch (e) {
                pullErrors.push(`${errorLabel}: ${e.message || e}`);
                progressUi.finish(key, false, 'gagal');
            }
        };

        await runPullStage('config', 'getAppConfig', async () => {
            const payload = { action: 'getAppConfig' };
            const data = await getData(payload);
            await saveCache(payload, data);
            await saveToLocalDB('cache', { key: 'appConfig', data });
            const configData = data.data && typeof data.data === 'object' && !Array.isArray(data.data)
                ? data.data
                : data;
            localStorage.setItem('offline_app_config', JSON.stringify(configData));
        });

        await runPullStage('sop', 'Dokumen SOP & Dasar Hukum', async () => {
            let sopStatusNote = 'Standar';

            // Tarik Dokumen SOP PDF dari Google Drive
            try {
                const sopRes = await getData({ action: 'getSopPdf', includeBase64: true });
                if (sopRes && sopRes.hasCustom) {
                    if (sopRes.url) localStorage.setItem('siempus_sop_pdf_url', sopRes.url);
                    if (sopRes.meta) localStorage.setItem('siempus_sop_pdf_meta', JSON.stringify(sopRes.meta));
                    if (sopRes.base64) {
                        localStorage.setItem('siempus_sop_pdf_data', sopRes.base64);
                        if (window.isElectron && window.electronAPI && typeof window.electronAPI.saveOfflineSopPdf === 'function') {
                            await window.electronAPI.saveOfflineSopPdf({
                                fileDataUrl: sopRes.base64,
                                filename: sopRes.meta?.name || 'Dokumen_SOP_Perpustakaan.pdf'
                            });
                        }
                    }
                    sopStatusNote = 'PDF Resmi Tersimpan';
                } else if (sopRes && !sopRes.hasCustom) {
                    if (localStorage.getItem('siempus_offline_sop_pdf_pending_sync') !== 'true') {
                        localStorage.removeItem('siempus_sop_pdf_data');
                        localStorage.removeItem('siempus_sop_pdf_meta');
                        localStorage.removeItem('siempus_sop_pdf_url');
                        if (window.isElectron && window.electronAPI && typeof window.electronAPI.deleteOfflineSopPdf === 'function') {
                            await window.electronAPI.deleteOfflineSopPdf();
                        }
                    }
                    sopStatusNote = 'Template Standar';
                }
            } catch (sopErr) {
                console.warn('Gagal menarik SOP:', sopErr);
            }

            // Tarik Regulasi Dasar Hukum
            try {
                const dhRes = await getData({ action: 'getDasarHukumList' });
                if (dhRes && Array.isArray(dhRes.data) && dhRes.data.length > 0) {
                    localStorage.setItem('dasar_hukum_list', JSON.stringify(dhRes.data));
                    if (window.isElectron && window.electronAPI && typeof window.electronAPI.saveToLocalDB === 'function') {
                        await window.electronAPI.saveToLocalDB('cache', 'dasar_hukum_list', dhRes.data);
                    }
                }
            } catch (dhErr) {
                console.warn('Gagal menarik dasar hukum:', dhErr);
            }

            if (typeof updateSopTabUI === 'function') updateSopTabUI();
            if (typeof renderDasarHukumTable === 'function') renderDasarHukumTable();

            return sopStatusNote;
        });

        await runPullStage('dashboard', 'getDashboardStats', async () => {
            const payload = { action: 'getDashboardStats' };
            const data = await getData(payload);
            await saveCache(payload, data);
        });

        await runPullStage('books', 'getBookList', async () => {
            pulled.books = await pullPaged('books', 'getBookList');
            return `${pulled.books} buku`;
        });
        await runPullStage('members', 'getMemberList', async () => {
            pulled.members = await pullPaged('members', 'getMemberList');
            return `${pulled.members} anggota`;
        });
        await runPullStage('teachers', 'getTeacherList', async () => {
            pulled.teachers = await pullPaged('teachers', 'getTeacherList');
            return `${pulled.teachers} guru/tendik`;
        });
        await runPullStage('historyActive', 'Riwayat aktif', async () => {
            pulled.historyActive = await pullPaged('historyActive', 'getHistoryList', false);
            return `${pulled.historyActive} baris`;
        });
        await runPullStage('historyArchive', 'Riwayat arsip', async () => {
            pulled.historyArchive = await pullPaged('historyArchive', 'getHistoryList', true);
            return `${pulled.historyArchive} baris`;
        });
        await runPullStage('visitors', 'Buku kunjungan', async () => {
            const vRes = await getData({ action: 'getVisitorList', page: 1, limit: 10000 });
            const vList = Array.isArray(vRes.data) ? vRes.data : [];
            await clearLocalDB('kunjungan');
            for (const v of vList) {
                if (v && v.id) {
                    await saveToLocalDB('kunjungan', v);
                }
            }
            pulled.visitors = vList.length;
            return `${pulled.visitors} kunjungan`;
        });

        loadAppConfig();
        publicCatalogAllBooks = null;
        loadPublicCatalog(1, true);

        progressUi.complete();
        updateSyncBadge();

        // 5. Hasil akhir
        if (pullErrors.length === 0 && failCount === 0) {
            await clearLocalDB('offlineTransactions');
            await clearLocalDB('offlineDeletedHistory');
            Swal.fire({
                title: 'Sinkronisasi Berhasil',
                html: `
                    <div class="text-start small">
                        <div class="mb-2">Semua perubahan terkirim dan data penting perpustakaan tersimpan di SQLite.</div>
                        <ul class="mb-0">
                            <li>Perubahan terkirim: <b>${successCount}</b></li>
                            <li>Buku: <b>${pulled.books}</b></li>
                            <li>Siswa/Anggota: <b>${pulled.members}</b></li>
                            <li>Guru & Tendik: <b>${pulled.teachers || 0}</b></li>
                            <li>Riwayat aktif: <b>${pulled.historyActive}</b> &middot; arsip: <b>${pulled.historyArchive}</b></li>
                            <li>Buku Kunjungan: <b>${pulled.visitors}</b></li>
                            <li>Dokumen SOP: <b>${localStorage.getItem('siempus_sop_pdf_data') || localStorage.getItem('siempus_sop_pdf_url') ? 'Dokumen Resmi (Tersinkron)' : 'Template Standar'}</b></li>
                        </ul>
                    </div>`,
                icon: 'success'
            });
            setTimeout(() => refreshCurrentPage(), 1500);
        } else {
            const sendMsg = failedMessages.slice(0, 3).map(syncEscapeHtml).join('<br>') || '-';
            const pullMsg = pullErrors.map(syncEscapeHtml).join('<br>') || '-';
            Swal.fire({
                title: 'Sinkronisasi sebagian',
                html: `
                    <div class="text-start small">
                        <div class="mb-2">Perubahan antrean: <b>${successCount}</b> berhasil, <b>${failCount}</b> gagal.</div>
                        <div class="mb-2"><b>Gagal mengirim:</b><br>${sendMsg}</div>
                        <div><b>Gagal menarik:</b><br>${pullMsg}</div>
                    </div>`,
                icon: 'warning'
            });
        }
    } catch (err) {
        Swal.fire('Sinkronisasi gagal', err.message || String(err), 'error');
    } finally {
        activeSyncSessionToken = '';
    }
}
