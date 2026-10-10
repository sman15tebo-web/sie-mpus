/* ========================================================
   OFFLINE & SYNCHRONIZATION (SQLite)
======================================================== */
const dbName = 'SiEmpusDB';
const dbVersion = 1;
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
                localStorage.removeItem('siempus_' + storeName + '_' + key);
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
    const response = await fetch(url, {
        redirect: 'follow',
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function manualSync() {
    try {
        const queueResult = await getFromLocalDB('syncQueue');
        const queue = Array.isArray(queueResult) ? queueResult : [];

        // 1. Modal link exec (otomatis terisi dari config-offline.js)
        const urlTarget = await askSyncExecLink(queue.length);
        if (!urlTarget) return; // dibatalkan pengguna

        const hasConfigLink = Boolean(
            window.electronAPI && typeof window.electronAPI.getConfig === 'function' &&
            (window.electronAPI.getConfig().OFFLINE_EXEC_LINK || window.electronAPI.getConfig().gasUrl)
        );
        if (!hasConfigLink) localStorage.setItem('siempus_sync_url', urlTarget);

        // 2. Susun tahapan sinkronisasi
        const stages = [];
        if (queue.length > 0) stages.push({ key: 'queue', label: `Kirim ${queue.length} perubahan lokal ke server`, units: queue.length });
        stages.push(
            { key: 'snapshot', label: 'Tarik snapshot seluruh sheet', units: 1 },
            { key: 'config', label: 'Tarik pengaturan sistem', units: 1 },
            { key: 'dashboard', label: 'Tarik statistik dashboard', units: 1 },
            { key: 'books', label: 'Tarik data buku', units: 1 },
            { key: 'members', label: 'Tarik data siswa/anggota', units: 1 },
            { key: 'historyActive', label: 'Tarik riwayat peminjaman aktif', units: 1 },
            { key: 'historyArchive', label: 'Tarik riwayat arsip', units: 1 }
        );
        const progressUi = createSyncProgress(stages);

        let successCount = 0;
        let failCount = 0;
        const failedMessages = [];
        const pullErrors = [];
        const pulled = { books: 0, members: 0, historyActive: 0, historyArchive: 0 };

        // 3. Kirim antrean perubahan lokal
        if (queue.length > 0) {
            progressUi.start('queue');
            const blockedOfflineTransactions = new Set();
            for (let i = 0; i < queue.length; i++) {
                const item = queue[i];
                progressUi.progress('queue', i / queue.length, `Mengirim ${i + 1} dari ${queue.length}: ${item.action}`);

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

        await runPullStage('snapshot', 'Snapshot seluruh sheet', async () => {
            const snapshotResponse = await getData({ action: 'getAllBackupData' });
            if (!snapshotResponse.data || typeof snapshotResponse.data !== 'object') {
                throw new Error('Snapshot spreadsheet tidak memiliki format yang benar.');
            }
            await saveToLocalDB('cache', {
                key: 'serverSnapshot',
                data: snapshotResponse.data
            });
        });

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
        await runPullStage('historyActive', 'Riwayat aktif', async () => {
            pulled.historyActive = await pullPaged('historyActive', 'getHistoryList', false);
            return `${pulled.historyActive} baris`;
        });
        await runPullStage('historyArchive', 'Riwayat arsip', async () => {
            pulled.historyArchive = await pullPaged('historyArchive', 'getHistoryList', true);
            return `${pulled.historyArchive} baris`;
        });

        progressUi.complete();
        updateSyncBadge();

        // 5. Hasil akhir
        if (pullErrors.length === 0 && failCount === 0) {
            if (window.electronAPI?.clearLocalDB) {
                await window.electronAPI.clearLocalDB('offlineTransactions');
                await window.electronAPI.clearLocalDB('offlineDeletedHistory');
            }
            Swal.fire({
                title: 'Sinkronisasi Berhasil',
                html: `
                    <div class="text-start small">
                        <div class="mb-2">Semua perubahan terkirim dan seluruh data server tersimpan di SQLite.</div>
                        <ul class="mb-0">
                            <li>Perubahan terkirim: <b>${successCount}</b></li>
                            <li>Buku: <b>${pulled.books}</b></li>
                            <li>Siswa/Anggota: <b>${pulled.members}</b></li>
                            <li>Riwayat aktif: <b>${pulled.historyActive}</b> &middot; arsip: <b>${pulled.historyArchive}</b></li>
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
    }
}
