// window.isElectron sudah dideklarasikan di config.js — tidak perlu duplikasi di sini.
// Pastikan config.js dimuat SEBELUM app.js di index.html.

let currentUser = null;
let currentUsername = null;
let bookData = [], memberData = [], teacherData = [], historyData = [];
let bookPage = 1, memberPage = 1, teacherPage = 1, historyPage = 1;
let bookTotal = 0, memberTotal = 0, teacherTotal = 0, historyTotal = 0;
let smartTeachersCache = null;
let smartTeachersCallbacks = [];
let isSmartTeachersLoading = false;
let historyFilters = { status: '', year: '', month: '' };
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
    console.error("Network/API Error:", err);
    if (swalCountdownInterval) clearInterval(swalCountdownInterval);
    // Jangan gunakan Swal.close() di sini karena bisa bentrok dengan Swal.fire() berikutnya
    document.querySelectorAll('.spinner-border, .spinner-grow').forEach(el => el.parentElement.classList.add('d-none'));
    Swal.fire('Koneksi Gagal', 'Terjadi kesalahan jaringan atau server merespon tidak terduga. Pastikan internet Anda stabil lalu coba lagi.', 'error');
};

const handleOperationError = (title, err) => {
    if (window.isElectron) {
        console.error(`${title}:`, err);
        if (swalCountdownInterval) clearInterval(swalCountdownInterval);
        Swal.fire(title, err?.message || String(err), 'error');
        return;
    }
    handleNetworkError(err);
};

function safeIsoDate(val) {
    if (!val) return '';
    let d;
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        const text = String(val).trim();
        const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmy) {
            d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        } else {
            d = new Date(val);
        }
    }
    if (isNaN(d.getTime())) return String(val);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ==========================================================
// 🛡️ FUNGSI UTILITAS: XSS ESCAPE & VALIDASI INPUT TERPUSAT
// ==========================================================

/**
 * Escape karakter HTML berbahaya untuk mencegah XSS.
 * Gunakan ini SETIAP KALI memasukkan data user/server ke innerHTML.
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Validasi data form Buku sebelum dikirim ke server.
 * Mengembalikan string pesan error, atau null jika valid.
 */
function validateBukuForm(d) {
    if (!d || !String(d.kode || '').trim()) return 'Kode Buku wajib diisi!';
    if (!String(d.judul || '').trim()) return 'Judul Buku wajib diisi!';
    // Validasi tahun: harus tepat 4 digit angka, antara 1000 sampai tahun depan
    const tahunStr = String(d.tahun === undefined || d.tahun === null ? '' : d.tahun).trim();
    if (tahunStr !== '' && tahunStr !== '-') {
        const tahunNum = Number(tahunStr);
        if (!/^\d{4}$/.test(tahunStr) || tahunNum < 1000 || tahunNum > new Date().getFullYear() + 1) {
            return `Tahun pengadaan tidak valid ("${escapeHtml(tahunStr)}"). Masukkan tahun 4 digit yang benar, contoh: 2026.`;
        }
    }
    // Validasi stok awal: harus bilangan bulat positif (tolak negatif, desimal, teks, kosong)
    const stokStr = String(d.stok === undefined || d.stok === null ? '' : d.stok).trim();
    const stokNum = Number(stokStr);
    if (stokStr === '' || !Number.isInteger(stokNum)) {
        return 'Jumlah Stok Awal harus berupa bilangan bulat (contoh: 10).';
    }
    if (stokNum < 1) {
        return 'Jumlah Stok Awal tidak boleh nol atau negatif. Minimal 1 eksemplar.';
    }
    if (stokNum > 99999) {
        return 'Jumlah Stok Awal terlalu besar (maksimal 99.999 eksemplar).';
    }

    // Validasi Hilang / Rusak Berat (RB): minimal 0 dan tidak boleh lebih dari Stok Awal
    const rusakStr = String(d.rusak === undefined || d.rusak === null || d.rusak === '' ? '0' : d.rusak).trim();
    const rusakNum = Number(rusakStr);
    if (!Number.isInteger(rusakNum) || rusakNum < 0) {
        return 'Jumlah Hilang / Rusak Berat tidak boleh bernilai negatif (minimal 0).';
    }
    if (rusakNum > stokNum) {
        return `Jumlah Hilang / Rusak Berat (${rusakNum}) tidak boleh lebih besar dari Jumlah Stok Awal (${stokNum})!`;
    }

    return null; // Valid
}

/**
 * Validasi data form Anggota sebelum dikirim ke server.
 * Mengembalikan string pesan error, atau null jika valid.
 * NISN wajib tepat 10 digit angka.
 */
function validateAnggotaForm(d) {
    if (!d || !String(d.nama || '').trim()) return 'Nama Anggota wajib diisi!';
    const idTrimmed = String(d.id === undefined || d.id === null ? '' : d.id).trim();
    if (!idTrimmed) return 'ID/NISN Anggota wajib diisi!';
    if (!/^\d+$/.test(idTrimmed)) {
        return 'ID/NISN hanya boleh berisi angka (tanpa huruf, spasi, atau simbol).';
    }
    if (idTrimmed.length !== 10) {
        return `NISN harus tepat 10 digit angka (saat ini ${idTrimmed.length} digit).`;
    }
    return null; // Valid
}

function safeDisplayDate(val) {
    if (!val) return '-';
    let d;
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        d = new Date(Math.round((val - 25569) * 86400 * 1000));
    } else {
        const text = String(val).trim();
        const dmy = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
        if (dmy) {
            d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
        } else {
            d = new Date(val);
        }
    }
    if (isNaN(d.getTime())) return String(val);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatSimpleDate(val) {
    if (!val || val === '-' || val === 'null' || val === 'undefined') return '-';
    if (val instanceof Date) {
        const pad = n => String(n).padStart(2, '0');
        return `${pad(val.getDate())}/${pad(val.getMonth() + 1)}/${val.getFullYear()}`;
    }
    const text = String(val).trim();
    if (!text || text === '-') return '-';

    // 1. Jika sudah format dd/mm/yyyy murni (misal 02/10/2026 atau 2/10/2026)
    const dmySlash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmySlash) {
        return `${dmySlash[1].padStart(2, '0')}/${dmySlash[2].padStart(2, '0')}/${dmySlash[3]}`;
    }

    // 2. Format ISO tanggal: YYYY-MM-DD (termasuk yang ada T atau Z seperti 2026-10-02T17:00:00.000Z)
    // Utamakan regex ISO agar tanggal murni tidak tergeser oleh konversi zona waktu browser UTC / GMT+7
    const isoMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (isoMatch) {
        const y = isoMatch[1];
        const m = String(isoMatch[2]).padStart(2, '0');
        const d = String(isoMatch[3]).padStart(2, '0');
        return `${d}/${m}/${y}`;
    }

    // 3. Format DD-MM-YYYY
    const dmyDash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmyDash) {
        const d = String(dmyDash[1]).padStart(2, '0');
        const m = String(dmyDash[2]).padStart(2, '0');
        const y = dmyDash[3];
        return `${d}/${m}/${y}`;
    }

    // 4. Nomor serial Excel
    if (typeof val === 'number' && val > 1000 && val < 100000) {
        const dObj = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (!isNaN(dObj.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            return `${pad(dObj.getDate())}/${pad(dObj.getMonth() + 1)}/${dObj.getFullYear()}`;
        }
    }

    // 5. Fallback Date object
    const dObj = new Date(text);
    if (!isNaN(dObj.getTime())) {
        const pad = n => String(n).padStart(2, '0');
        return `${pad(dObj.getDate())}/${pad(dObj.getMonth() + 1)}/${dObj.getFullYear()}`;
    }

    return text.replace(/T.*$/i, '').trim() || '-';
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
    const archiveSlot = document.getElementById('history-archive-slot');
    if (!archiveSlot || document.getElementById('chkArsip')) return;
    const archiveToggle = document.createElement('div');
    archiveToggle.className = 'form-check form-switch m-0';
    archiveToggle.innerHTML = '<input class="form-check-input" type="checkbox" id="chkArsip"><label class="form-check-label small fw-bold" for="chkArsip">Arsip</label>';
    archiveToggle.querySelector('input').addEventListener('change', applyHistoryFilters);
    archiveSlot.appendChild(archiveToggle);

    const exportButton = document.createElement('button');
    exportButton.id = 'btnExportRiwayat';
    exportButton.type = 'button';
    exportButton.className = 'btn btn-sm btn-success fw-bold';
    exportButton.innerHTML = '<i class="fas fa-file-excel me-1"></i> Unduh Excel';
    exportButton.addEventListener('click', openExportHistoryModal);
    archiveSlot.appendChild(exportButton);
}

function initHistoryFilters() {
    ['filterHistoryStatus', 'filterHistoryYear', 'filterHistoryMonth'].forEach(id => {
        const select = document.getElementById(id);
        if (select) select.addEventListener('change', applyHistoryFilters);
    });
}

function updateHistoryYearOptions(years) {
    const select = document.getElementById('filterHistoryYear');
    if (!select || !Array.isArray(years)) return false;

    const selectedYear = select.value;
    const availableYears = [...new Set(years.map(Number).filter(Number.isInteger))]
        .sort((a, b) => b - a);
    select.replaceChildren(new Option('Semua tahun', ''));
    availableYears.forEach(year => select.add(new Option(year, year)));

    if (selectedYear && availableYears.includes(Number(selectedYear))) {
        select.value = selectedYear;
        return false;
    }
    select.value = '';
    return Boolean(selectedYear);
}

function applyHistoryFilters() {
    historyPage = 1;
    loadHistory(document.getElementById('searchRiwayat')?.value || '');
}

function openExportHistoryModal() {
    processExportHistory();
}

function buildHistoryExcelWorkbook(headers, rows, schoolName) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SiE-MPuS';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Sirkulasi Buku', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    const columnWidths = [18, 26, 18, 38, 16, 16, 16, 14, 36, 16, 20, 22];
    worksheet.columns = headers.map((header, index) => ({ header, width: columnWidths[index] || 18 }));

    worksheet.mergeCells(1, 1, 1, headers.length);
    worksheet.getCell('A1').value = 'SIRKULASI PEMINJAMAN DAN PENGEMBALIAN BUKU';
    worksheet.getCell('A1').font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    worksheet.getRow(1).height = 30;

    worksheet.mergeCells(2, 1, 2, headers.length);
    worksheet.getCell('A2').value = schoolName;
    worksheet.getCell('A2').font = { name: 'Arial', size: 12, bold: true, color: { argb: 'FF17365D' } };
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = 23;
    worksheet.getRow(3).height = 8;

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF285F8F' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });

    rows.forEach((values, index) => {
        const row = worksheet.addRow(values);
        row.height = 22;
        row.eachCell((cell, columnNumber) => {
            cell.font = { name: 'Arial', size: 10, color: { argb: 'FF1F2937' } };
            cell.alignment = { vertical: 'middle', wrapText: columnNumber === 4 || columnNumber === 9 };
            if (index % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            }
        });
        if (Number(values[9]) > 0) {
            [9, 10, 11].forEach(columnNumber => {
                row.getCell(columnNumber).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFC00000' } };
                row.getCell(columnNumber).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE8E8' } };
            });
        }
        row.getCell(11).numFmt = '"Rp" #,##0';
    });

    const border = { style: 'thin', color: { argb: 'FF9CA3AF' } };
    for (let rowNumber = 4; rowNumber <= worksheet.rowCount; rowNumber++) {
        worksheet.getRow(rowNumber).eachCell({ includeEmpty: true }, cell => {
            cell.border = { top: border, left: border, bottom: border, right: border };
        });
    }
    worksheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
    worksheet.views = [{ state: 'frozen', ySplit: 4 }];
    worksheet.pageSetup.printTitlesRow = '1:4';
    worksheet.pageSetup.horizontalDpi = 300;
    return workbook;
}

function getHistoryExportSchoolName() {
    return document.getElementById('sidebar-school-name')?.textContent?.trim() ||
        document.getElementById('footer-sekolah')?.textContent?.trim() ||
        'Nama Sekolah';
}

function showHistoryExportPreview(headers, rows, workbook, fileName, schoolName) {
    const previewLimit = 300;
    const previewRows = rows.slice(0, previewLimit);
    const hasMoreRows = rows.length > previewLimit;

    Swal.fire({
        title: 'Pratinjau Excel Riwayat',
        width: '92vw',
        html: `
            <div class="text-center mb-2">
                <div id="historyPreviewReportTitle" class="fw-bold">SIRKULASI PEMINJAMAN DAN PENGEMBALIAN BUKU</div>
                <div id="historyPreviewSchoolName" class="small text-muted"></div>
            </div>
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <button type="button" id="historyPreviewZoomOut" class="btn btn-sm btn-outline-secondary" title="Perkecil" aria-label="Perkecil"><i class="fas fa-search-minus"></i></button>
                <span id="historyPreviewZoomLabel" class="small text-muted">100%</span>
                <button type="button" id="historyPreviewZoomIn" class="btn btn-sm btn-outline-secondary" title="Perbesar" aria-label="Perbesar"><i class="fas fa-search-plus"></i></button>
                <span class="small text-muted ms-auto">${rows.length.toLocaleString('id-ID')} baris</span>
                <button type="button" id="historyPreviewPrint" class="btn btn-sm btn-outline-primary"><i class="fas fa-print me-1"></i> Cetak</button>
                <button type="button" id="historyPreviewDownload" class="btn btn-sm btn-success"><i class="fas fa-download me-1"></i> Unduh Excel</button>
            </div>
            <div id="historyPreviewFrame" class="border rounded text-start" style="height:58vh;overflow:auto;background:#fff;">
                <div id="historyPreviewScale" style="width:max-content;min-width:100%;">
                    <table id="historyPreviewTable" class="table table-sm table-striped table-bordered mb-0 small"></table>
                </div>
            </div>
            <div id="historyPreviewNote" class="small text-muted text-start mt-2"></div>
            <div id="historyPreviewDownloadStatus" class="small text-success text-start mt-1" aria-live="polite"></div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            document.getElementById('historyPreviewSchoolName').textContent = schoolName;
            const table = document.getElementById('historyPreviewTable');
            const thead = table.createTHead();
            const headerRow = thead.insertRow();
            headers.forEach(label => {
                const cell = document.createElement('th');
                cell.textContent = label;
                cell.className = 'text-nowrap bg-light';
                headerRow.appendChild(cell);
            });

            const tbody = table.createTBody();
            previewRows.forEach(row => {
                const tableRow = tbody.insertRow();
                row.forEach(value => {
                    const cell = tableRow.insertCell();
                    cell.textContent = value == null ? '' : String(value);
                    cell.className = 'text-nowrap';
                });
            });

            document.getElementById('historyPreviewNote').textContent = hasMoreRows
                ? `Pratinjau menampilkan ${previewLimit} baris pertama. Unduh dan cetak memuat semua ${rows.length.toLocaleString('id-ID')} baris.`
                : 'Pratinjau menampilkan seluruh baris yang akan diunduh.';

            let zoom = 1;
            const scale = document.getElementById('historyPreviewScale');
            const zoomLabel = document.getElementById('historyPreviewZoomLabel');
            const setZoom = nextZoom => {
                zoom = Math.max(0.6, Math.min(1.6, nextZoom));
                scale.style.zoom = String(zoom);
                zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
            };
            document.getElementById('historyPreviewZoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
            document.getElementById('historyPreviewZoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
            document.getElementById('historyPreviewDownload').addEventListener('click', () => {
                workbook.xlsx.writeBuffer().then(buffer => {
                    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;
                    link.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                    document.getElementById('historyPreviewDownloadStatus').textContent = 'File Excel sedang diunduh.';
                }).catch(error => {
                    document.getElementById('historyPreviewDownloadStatus').textContent = error.message || 'File Excel gagal dibuat.';
                });
            });
            document.getElementById('historyPreviewPrint').addEventListener('click', () => {
                printHistoryExport(headers, rows, schoolName);
            });
        }
    });
}

function printHistoryExport(headers, rows, schoolName) {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        Swal.fire('Cetak tidak tersedia', 'Izinkan jendela cetak pada aplikasi/browser, lalu coba lagi.', 'warning');
        return;
    }

    printWindow.document.open();
    printWindow.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Sirkulasi Buku</title><style>body{font-family:Arial,sans-serif;padding:16px}h2,p{text-align:center}h2{font-size:18px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #777;padding:5px;text-align:left;vertical-align:top}th{background:#eee}thead{display:table-header-group}tr{break-inside:avoid}@page{size:landscape;margin:12mm}</style></head><body><h2>SIRKULASI PEMINJAMAN DAN PENGEMBALIAN BUKU</h2></body></html>');
    printWindow.document.close();
    const schoolHeading = printWindow.document.createElement('p');
    schoolHeading.textContent = schoolName;
    printWindow.document.body.appendChild(schoolHeading);

    const table = printWindow.document.createElement('table');
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    headers.forEach(label => {
        const cell = printWindow.document.createElement('th');
        cell.textContent = label;
        headerRow.appendChild(cell);
    });
    const tbody = table.createTBody();
    rows.forEach(row => {
        const tableRow = tbody.insertRow();
        row.forEach(value => {
            const cell = tableRow.insertCell();
            cell.textContent = value == null ? '' : String(value);
        });
    });
    printWindow.document.body.appendChild(table);
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
}

function buildHistoryExportRows(historyRows, finePerDay) {
    const today = parseLateDateHelper(new Date());

    return historyRows.map(row => {
        const status = String(row.status || '-');
        const statusLower = status.toLowerCase();
        const isReturned = statusLower.includes('kembali');
        const isBorrowed = statusLower.includes('pinjam') && !isReturned;
        const dueDate = parseLateDateHelper(row.tglTempo);
        const referenceDate = isReturned ? parseLateDateHelper(row.tglKembali) : today;
        const lateDays = dueDate && referenceDate && referenceDate.getTime() > dueDate.getTime()
            ? Math.round((referenceDate.getTime() - dueDate.getTime()) / 86400000)
            : 0;
        const lateFine = Number(row.denda) || (isBorrowed && lateDays > 0 ? lateDays * finePerDay : 0);
        let note = '';
        if (lateDays > 0) note = isReturned ? `Dikembalikan terlambat ${lateDays} hari` : `Terlambat ${lateDays} hari`;
        else if (isReturned) note = 'Sudah dikembalikan';
        else if (isBorrowed) note = 'Belum terlambat';

        return [
            row.idAnggota,
            row.namaAnggota,
            row.kodeBuku,
            row.judulBuku,
            row.tglPinjam,
            row.tglTempo,
            row.tglKembali,
            status,
            note,
            lateDays,
            lateFine,
            row.petugas
        ];
    });
}

function processExportHistory() {
    const isArchive = Boolean(document.getElementById('chkArsip')?.checked);
    const search = document.getElementById('searchRiwayat')?.value || '';
    const statusFilter = document.getElementById('filterHistoryStatus')?.value || '';
    const yearFilter = document.getElementById('filterHistoryYear')?.value || '';
    const monthFilter = document.getElementById('filterHistoryMonth')?.value || '';
    showSmartLoading('Menyiapkan Data...', 'Sedang merangkum riwayat dari server.');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(response => {
            if (!response || response.status === false || response.success === false) {
                Swal.fire('Gagal Mengunduh', response?.message || 'Sesi berakhir atau server tidak merespons.', 'error');
                return;
            }
            const historyRows = Array.isArray(response?.data) ? response.data : [];
            const data = buildHistoryExportRows(historyRows, Number(response.finePerDay) || 500);
            if (data.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data transaksi.', 'info');
                return;
            }
            const headers = ["ID Anggota", "Nama Anggota", "Kode Buku", "Judul Buku", "Tgl Pinjam", "Jatuh Tempo", "Tgl Kembali", "Status", "Keterangan", "Hari Terlambat", "Denda", "Petugas"];
            const filterSuffix = [isArchive ? 'Arsip' : '', statusFilter, yearFilter, monthFilter].filter(Boolean).join('_');
            const fileName = `Laporan_Riwayat${filterSuffix ? `_${filterSuffix}` : ''}.xlsx`;
            const schoolName = getHistoryExportSchoolName();
            const wb = buildHistoryExcelWorkbook(headers, data, schoolName);
            Swal.close();
            showHistoryExportPreview(headers, data, wb, fileName, schoolName);
        }).getHistoryList(1, 100000, search, isArchive, statusFilter, yearFilter, monthFilter, true);
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
    const MAX_LOGO_BASE64_LEN = 49000;
    if (currentCropTarget === 'logo' || currentCropTarget === 'logoInstansi') {
        const size = 250;
        const canvas = cropperInstance.getCroppedCanvas({
            width: size,
            height: size,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
        if (!canvas) {
            Swal.fire('Gagal', 'Logo tidak dapat diproses dari gambar yang dipilih.', 'error');
            return;
        }
        let resultBase64 = canvas.toDataURL('image/png');

        if (resultBase64.length > MAX_LOGO_BASE64_LEN) {
            const jpegCanvas = document.createElement('canvas');
            jpegCanvas.width = size;
            jpegCanvas.height = size;
            const context = jpegCanvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, size, size);
            context.drawImage(canvas, 0, 0, size, size);
            for (const quality of [0.94, 0.9, 0.86, 0.82, 0.78, 0.74, 0.7, 0.66, 0.62, 0.58]) {
                resultBase64 = jpegCanvas.toDataURL('image/jpeg', quality);
                if (resultBase64.length <= MAX_LOGO_BASE64_LEN) break;
            }
        }
        if (resultBase64.length > MAX_LOGO_BASE64_LEN) {
            Swal.fire('Ukuran Logo Terlalu Besar', 'Logo tetap 250×250 px agar jelas, tetapi ukuran Base64-nya melebihi 49 KB. Coba gambar logo yang lebih sederhana atau tanpa latar foto.', 'warning');
            return;
        }

        if (currentCropTarget === 'logo') {
            uploadLogoBase64 = resultBase64;
            document.getElementById('previewLogo').src = uploadLogoBase64; document.getElementById('previewLogo').style.display = 'block';
        } else {
            uploadLogoInstansiBase64 = resultBase64;
            document.getElementById('previewLogoInstansi').src = uploadLogoInstansiBase64; document.getElementById('previewLogoInstansi').style.display = 'block';
        }
    } else {
        const canvas = cropperInstance.getCroppedCanvas({
            maxWidth: 2560,
            maxHeight: 1536,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high'
        });
        if (!canvas) {
            Swal.fire('Gagal', 'Background tidak dapat diproses dari gambar yang dipilih.', 'error');
            return;
        }
        let resultBase64 = canvas.toDataURL('image/jpeg', 0.92);
        if (resultBase64.length > 5_000_000) {
            resultBase64 = canvas.toDataURL('image/jpeg', 0.86);
        }
        if (resultBase64.length > 8_000_000) {
            Swal.fire('Ukuran Gambar Terlalu Besar', 'Background tetap dipertahankan pada resolusi tinggi. Pilih gambar sumber yang lebih kecil agar dapat diunggah.', 'warning');
            return;
        }
        uploadBgBase64 = resultBase64;
        document.getElementById('previewBg').src = uploadBgBase64; document.getElementById('previewBg').style.display = 'block';
    }
    bootstrap.Modal.getInstance(document.getElementById('modalCrop')).hide();
});

// --- INIT APP (SUPER AMAN ANTI-LOGOUT SAAT RELOAD) ---
document.addEventListener("DOMContentLoaded", function () {
    const syncButton = document.getElementById('btn-manual-sync');
    if (syncButton) syncButton.hidden = !window.isElectron;

    // Sesi hanya dianggap ada jika masih valid (belum kedaluwarsa / idle)
    const sessionOk = window.SessionStore.isValid();
    const savedUser = sessionOk ? window.SessionStore.get('siempus_user') : null;
    const savedUname = sessionOk ? window.SessionStore.get('siempus_username') : null;
    const savedPage = sessionOk ? window.SessionStore.get('siempus_page') : null;

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
    initHistoryFilters();

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
    if (!container) return;

    let searchBox = container.querySelector('.custom-search');
    if (!searchBox) {
        const div = document.createElement('div');
        div.className = 'w-100 w-md-25 custom-search';
        div.innerHTML = `<input type="text" class="form-control form-control-sm" placeholder="${placeholder}">`;
        container.insertBefore(div, container.lastElementChild);
        searchBox = div;
    }

    const input = searchBox.querySelector('input');
    if (input && input.dataset.searchListenerAttached !== 'true') {
        input.dataset.searchListenerAttached = 'true';
        input.addEventListener('keyup', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { callback(e.target.value); }, 600);
        });
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
            const serverCfg = (rawCfg && rawCfg.data && typeof rawCfg.data === 'object' && !Array.isArray(rawCfg.data))
                ? rawCfg.data
                : (rawCfg || {});
            let cfg = { ...serverCfg };

            // Cek snapshot local offline jika ada field yang belum terbawa
            // PENTING: localSavedCfg (pengaturan yang baru disimpan user) harus MENANG atas cfg (cache lama server)
            try {
                const localSavedCfgStr = localStorage.getItem('offline_app_config');
                if (localSavedCfgStr) {
                    const localSavedCfg = JSON.parse(localSavedCfgStr);
                    cfg = Object.assign({}, cfg, localSavedCfg); // localSavedCfg di belakang = prioritas lebih tinggi
                    ['UrlLogo', 'UrlLogoInstansi', 'UrlBackground'].forEach(key => {
                        if (String(serverCfg[key] || '').startsWith('data:image/')) cfg[key] = serverCfg[key];
                    });
                }
            } catch (e) {}

            // Utamakan gambar lokal (Base64) jika ada, agar tetap tampil walau tanpa internet
            const localLogo = localStorage.getItem('offline_logo_base64');
            const localLogoInstansi = localStorage.getItem('offline_logoinstansi_base64');
            const localBg = localStorage.getItem('offline_bg_base64') || localStorage.getItem('offline_bg_url');
            
            function fixDriveLink(url) {
                if (!url) return '';
                if (url.includes('drive.google.com') && url.includes('/d/')) {
                    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
                    if (match && match[1]) {
                        return `https://drive.google.com/uc?id=${match[1]}`;
                    }
                }
                return url;
            }

            const logoSrc = fixDriveLink(cfg.UrlLogo || cfg.LogoBase64 || localLogo);
            const bgSrc = fixDriveLink(cfg.UrlBackground || cfg.BackgroundBase64 || localBg);
            const logoInstansiSrc = fixDriveLink(cfg.UrlLogoInstansi || localLogoInstansi);

            const fallback = './imgsiempus.png';
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
            if (f1) f1.textContent = footerTeksOtomatis;
            if (f2) f2.textContent = footerTeksOtomatis;
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

function toggleAccountPassword() {
    const passInput = document.getElementById('offlinePassDisplay');
    const icon = document.getElementById('accountPasswordEye');
    const button = document.getElementById('toggleAccountPassword');
    if (!passInput || !icon || !button) return;

    const showPassword = passInput.type === 'password';
    passInput.type = showPassword ? 'text' : 'password';
    icon.classList.toggle('fa-eye', !showPassword);
    icon.classList.toggle('fa-eye-slash', showPassword);
    button.setAttribute('aria-label', showPassword ? 'Sembunyikan password' : 'Tampilkan password');
    button.setAttribute('aria-pressed', String(showPassword));
}

function attemptLogin() {
    const u = (document.getElementById('uName').value || '').trim();
    const p = (document.getElementById('uPass').value || '').trim();
    const btn = document.getElementById('btnLogin');
    if (!u || !p) { Swal.fire('Peringatan', 'Isi semua data', 'warning'); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Memproses...'; btn.disabled = true;

    // --- CEK OFFLINE LOGIN (DESKTOP) ---
    if (window.isElectron) {
        (async () => {
            try {
                let offUser = '';
                let offPass = '';

                // 1. Coba baca dari electronAPI.getConfig()
                let c = null;
                if (window.electronAPI && typeof window.electronAPI.getConfig === 'function') {
                    try { c = window.electronAPI.getConfig(); } catch (_) {}
                }
                // 2. Coba baca dari window.APP_CONFIG
                if ((!c || (!c.admin && !c.OFFLINE_ADMIN_USER)) && window.APP_CONFIG) {
                    c = window.APP_CONFIG;
                }
                // 3. Jika masih kosong, panggil IPC getOfflineConfig() ke Main Process
                if ((!c || (!c.admin && !c.OFFLINE_ADMIN_USER)) && window.electronAPI && typeof window.electronAPI.getOfflineConfig === 'function') {
                    try { c = await window.electronAPI.getOfflineConfig(); } catch (_) {}
                }

                if (c) {
                    if (c.admin && c.admin.username) offUser = c.admin.username;
                    else if (c.OFFLINE_ADMIN_USER) offUser = c.OFFLINE_ADMIN_USER;
                    else if (c.username) offUser = c.username;

                    if (c.admin && c.admin.password) offPass = c.admin.password;
                    else if (c.OFFLINE_ADMIN_PASS) offPass = c.OFFLINE_ADMIN_PASS;
                    else if (c.password) offPass = c.password;
                }

                const uTrim = u.trim();
                const pTrim = p.trim();

                // Verifikasi MURNI: Cocokkan HANYA dengan username & password dari config-offline.js
                const isUserMatch = offUser && (uTrim.toLowerCase() === offUser.toLowerCase());
                const isPassMatch = offPass && (pTrim === offPass);
                const isMatch = isUserMatch && isPassMatch;

                if (isMatch) {
                    prosesSuksesLogin({ status: true, nama: 'Admin', username: uTrim });
                } else {
                    btn.innerHTML = 'Login Sistem'; btn.disabled = false;
                    Swal.fire({
                        title: 'Gagal (Mode Offline)',
                        html: `Username atau Password salah.<br><small class="text-muted mt-2 d-block">Kredensial offline terdaftar di <b>config-offline.js</b>:<br>Username: <b>${offUser || '(Belum diatur)'}</b></small>`,
                        icon: 'error'
                    });
                }
            } catch (err) {
                console.error('[SiE-MPuS Offline Login Error]', err);
                btn.innerHTML = 'Login Sistem'; btn.disabled = false;
                Swal.fire('Error Login', 'Terjadi kesalahan sistem login offline: ' + (err.message || err), 'error');
            }
        })();
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

    // Mulai sesi baru (sessionStorage + batas waktu), bukan localStorage permanen
    window.SessionStore.start();
    window.SessionStore.set('siempus_user', currentUser);
    window.SessionStore.set('siempus_username', currentUsername);
    if (res.sessionToken) window.SessionStore.set('siempus_session_token', res.sessionToken);
    else window.SessionStore.remove('siempus_session_token');
    window.SessionStore.set('siempus_page', 'dashboard'); // Langsung kunci ke dashboard saat awal login

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

// Watcher sesi: keluarkan pengguna otomatis jika sesi kedaluwarsa / idle terlalu lama
setInterval(() => {
    if (!currentUser) return;
    if (!window.SessionStore.isValid()) {
        window.SessionStore.clear();
        currentUser = null;
        currentUsername = null;
        Swal.fire({
            icon: 'info',
            title: 'Sesi Berakhir',
            text: 'Demi keamanan, sesi Anda telah berakhir. Silakan login kembali.',
            confirmButtonText: 'OK',
            allowOutsideClick: false
        }).then(() => location.reload());
    }
}, 30000);

document.getElementById('nav-logout').addEventListener('click', () => {
    Swal.fire({
        title: 'Keluar?', icon: 'question', showCancelButton: true, confirmButtonText: 'Ya', confirmButtonColor: '#d33'
    }).then((r) => {
        if (r.isConfirmed) {
            window.SessionStore.clear();
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

function switchSirkulasiTab(tab) {
    stopScanner();

    const tabLoan = document.getElementById('tab-sirkulasi-loan');
    const tabReturn = document.getElementById('tab-sirkulasi-return');
    const paneLoan = document.getElementById('pane-sirkulasi-loan');
    const paneReturn = document.getElementById('pane-sirkulasi-return');

    if (tabLoan) tabLoan.classList.toggle('active', tab === 'loan');
    if (tabReturn) tabReturn.classList.toggle('active', tab === 'return');

    if (paneLoan) {
        paneLoan.classList.toggle('show', tab === 'loan');
        paneLoan.classList.toggle('active', tab === 'loan');
    }
    if (paneReturn) {
        paneReturn.classList.toggle('show', tab === 'return');
        paneReturn.classList.toggle('active', tab === 'return');
    }

    if (tab === 'loan') {
        startScanner('loan');
        getSmartBorrowers();
        getSmartBooks();
    } else if (tab === 'return') {
        startScanner('return');
        getActiveReturnLoans(() => {}, true);
    }
}

function switchReferensiTab(tab) {
    const tabBuku = document.getElementById('tab-ref-buku');
    const tabSiswa = document.getElementById('tab-ref-siswa');
    const tabGuru = document.getElementById('tab-ref-guru');
    const paneBuku = document.getElementById('pane-ref-buku');
    const paneSiswa = document.getElementById('pane-ref-siswa');
    const paneGuru = document.getElementById('pane-ref-guru');

    if (tabBuku) tabBuku.classList.toggle('active', tab === 'buku');
    if (tabSiswa) tabSiswa.classList.toggle('active', tab === 'siswa');
    if (tabGuru) tabGuru.classList.toggle('active', tab === 'guru');

    if (paneBuku) {
        paneBuku.classList.toggle('show', tab === 'buku');
        paneBuku.classList.toggle('active', tab === 'buku');
    }
    if (paneSiswa) {
        paneSiswa.classList.toggle('show', tab === 'siswa');
        paneSiswa.classList.toggle('active', tab === 'siswa');
    }
    if (paneGuru) {
        paneGuru.classList.toggle('show', tab === 'guru');
        paneGuru.classList.toggle('active', tab === 'guru');
    }

    if (tab === 'buku') {
        bookPage = 1;
        loadBooks();
    } else if (tab === 'siswa') {
        memberPage = 1;
        loadMembers();
    } else if (tab === 'guru') {
        teacherPage = 1;
        loadTeachers();
    }
}

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

    // Mapping Alias Menu Lama ke Menu Baru
    let requestedSubTab = null;
    if (pageId === 'peminjaman') {
        pageId = 'sirkulasi';
        requestedSubTab = 'loan';
    } else if (pageId === 'pengembalian') {
        pageId = 'sirkulasi';
        requestedSubTab = 'return';
    } else if (pageId === 'buku') {
        pageId = 'referensi';
        requestedSubTab = 'buku';
    } else if (pageId === 'anggota') {
        pageId = 'referensi';
        requestedSubTab = 'siswa';
    } else if (pageId === 'guru') {
        pageId = 'referensi';
        requestedSubTab = 'guru';
    }

    window.SessionStore.set('siempus_page', pageId);
    document.querySelectorAll('.page-section').forEach(p => p.classList.add('d-none'));

    // Cari target halaman, jika tidak ketemu, paksa ke dashboard (mencegah JS Crash)
    const targetPage = document.getElementById('page-' + pageId);
    if (targetPage) {
        targetPage.classList.remove('d-none');
    } else {
        document.getElementById('page-dashboard').classList.remove('d-none');
        pageId = 'dashboard';
        window.SessionStore.set('siempus_page', 'dashboard');
    }

    // Sinkronisasi menu samping (Sidebar)
    document.querySelectorAll('#sidebar .nav-link').forEach(l => l.classList.remove('active'));
    const activeSidebar = document.getElementById('nav-' + pageId);
    if (activeSidebar) activeSidebar.classList.add('active');

    // Sinkronisasi menu bawah (HP)
    if (typeof updateMobileNav === "function") { updateMobileNav(pageId); }

    const titles = {
        'dashboard': 'Dashboard Admin',
        'sirkulasi': 'Sirkulasi Peminjaman & Pengembalian',
        'kunjungan': 'Buku Kunjungan Perpustakaan',
        'riwayat': 'Riwayat Transaksi',
        'referensi': 'Referensi Data Perpustakaan',
        'pengaturan': 'Pengaturan Sistem'
    };
    document.getElementById('page-title').textContent = titles[pageId] || 'Dashboard';
    stopScanner();

    if (pageId === 'dashboard') loadDashboard();
    if (pageId === 'kunjungan') { visitorPage = 1; loadVisitorLogs(); }
    if (pageId === 'riwayat') {
        historyPage = 1;
        const chk = document.getElementById('chkArsip');
        if (chk) chk.checked = false;
        const targetTab = document.getElementById('tab-riwayat-terlambat')?.classList.contains('active') ? 'terlambat' : 'transaksi';
        switchRiwayatTab(targetTab);
    }
    if (pageId === 'pengaturan') {
        loadSettingsForm();
        if (typeof loadSOPHukumTab === 'function') loadSOPHukumTab();
    }

    if (pageId === 'sirkulasi') {
        const targetTab = requestedSubTab || (document.getElementById('tab-sirkulasi-return')?.classList.contains('active') ? 'return' : 'loan');
        switchSirkulasiTab(targetTab);
    } else if (pageId === 'referensi') {
        let targetRef = requestedSubTab;
        if (!targetRef) {
            if (document.getElementById('tab-ref-siswa')?.classList.contains('active')) targetRef = 'siswa';
            else if (document.getElementById('tab-ref-guru')?.classList.contains('active')) targetRef = 'guru';
            else targetRef = 'buku';
        }
        switchReferensiTab(targetRef);
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
            handleManualMember('loan', (nama) => {
                Swal.fire({
                    title: 'Siswa Tercatat',
                    text: `${nama} berhasil dikenali. Silakan klik OK, lalu scan QR code buku.`,
                    icon: 'info',
                    confirmButtonText: 'OK',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    enableBookScan('loan');
                    scanLock = false;
                });
            }, true, () => { scanLock = false; });
        } else {
            inpBook.value = decodedText;
            // BUG #6 FIX: Reset scanLock via callback setelah handleManualBook selesai (bukan timer buta)
            handleManualBook('loan', () => { scanLock = false; });
        }
    } else {
        const inpMember = document.getElementById('return-member-input');
        const inpBook = document.getElementById('return-book-input');
        if (inpMember.value === '') {
            inpMember.value = decodedText;
            handleManualMember('return', (nama) => {
                Swal.fire({
                    title: 'Siswa Tercatat',
                    text: `${nama} berhasil dikenali. Silakan klik OK, lalu scan QR code buku.`,
                    icon: 'info',
                    confirmButtonText: 'OK',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    enableBookScan('return');
                    scanLock = false;
                });
            }, true, () => { scanLock = false; });
        } else {
            inpBook.value = decodedText;
            // BUG #6 FIX: Reset scanLock via callback setelah handleManualBook selesai (bukan timer buta)
            handleManualBook('return', () => { scanLock = false; });
        }
    }
}

function enableBookScan(type) {
    const bookInput = document.getElementById(type + '-book-input');
    const bookButton = document.getElementById('btn-' + type + '-book');
    const bookGroup = document.getElementById(type + '-book-group');
    if (bookInput) {
        bookInput.disabled = false;
        bookInput.focus();
    }
    if (bookButton) bookButton.disabled = false;
    if (bookGroup) bookGroup.classList.remove('opacity-50');
}

// ==========================================================
// FITUR CERDAS: AUTOCOMPLETE & PENCARIAN ANGGOTA & BUKU (TOP 3)
// ==========================================================
let smartMembersCache = null;
let smartBooksCache = null;
let isSmartMembersLoading = false;
let isSmartBooksLoading = false;
// BUG #5 FIX: Gunakan callback queue, bukan setTimeout polling
let smartMembersCallbacks = [];
let smartBooksCallbacks = [];
let activeReturnLoansCache = null;
let isActiveReturnLoansLoading = false;
let activeReturnLoansCallbacks = [];

function invalidateReturnLoanCache() {
    activeReturnLoansCache = null;
}

function isActiveReturnLoan(loan) {
    const status = String(loan?.status || '').toLowerCase();
    return status.includes('pinjam') && !status.includes('kembali');
}

function getActiveReturnLoans(callback, forceRefresh = false) {
    if (forceRefresh) invalidateReturnLoanCache();
    if (activeReturnLoansCache !== null) {
        if (callback) callback(activeReturnLoansCache);
        return;
    }
    if (callback) activeReturnLoansCallbacks.push(callback);
    if (isActiveReturnLoansLoading) return;

    isActiveReturnLoansLoading = true;
    google.script.run
        .withFailureHandler(error => {
            isActiveReturnLoansLoading = false;
            console.error('Gagal memuat pinjaman aktif:', error);
            const callbacks = activeReturnLoansCallbacks.splice(0);
            callbacks.forEach(done => done([]));
        })
        .withSuccessHandler(response => {
            isActiveReturnLoansLoading = false;
            const rows = Array.isArray(response?.data) ? response.data : [];
            activeReturnLoansCache = rows.filter(isActiveReturnLoan);
            const callbacks = activeReturnLoansCallbacks.splice(0);
            callbacks.forEach(done => done(activeReturnLoansCache));
        })
        .getHistoryList(1, 100000, '', false);
}

function getActiveReturnBooks(memberId, callback) {
    getActiveReturnLoans(loans => {
        const seen = new Set();
        const books = [];
        loans.forEach(loan => {
            const code = String(loan.kodeBuku || '').trim();
            const key = `${String(loan.idAnggota || '').trim()}::${code}`;
            if (String(loan.idAnggota || '').trim() !== String(memberId || '').trim() || !code || seen.has(key)) return;
            seen.add(key);
            books.push([code, String(loan.judulBuku || code)]);
        });
        callback(books);
    });
}

function getReturnMembers(callback) {
    getActiveReturnLoans(loans => {
        const members = new Map();
        loans.forEach(loan => {
            const id = String(loan.idAnggota || '').trim();
            if (!id || members.has(id)) return;
            members.set(id, [id, String(loan.namaAnggota || id), '']);
        });
        callback([...members.values()]);
    });
}

function getMembersForType(type, callback) {
    if (type === 'return') getReturnMembers(callback);
    else getSmartBorrowers(callback);
}

function getSmartBookMatches(books, query, type) {
    if (type === 'return') return books;

    const q = query.toLowerCase();
    const exactOrStarts = [];
    const wordStarts = [];
    for (const book of books) {
        const code = String(book[0] || '').toLowerCase();
        const title = String(book[1] || '').toLowerCase();
        if (code.startsWith(q) || title.startsWith(q)) {
            exactOrStarts.push(book);
        } else if (title.split(/\s+/).some(word => word.startsWith(q))) {
            wordStarts.push(book);
        }
        if (exactOrStarts.length >= 3) break;
    }
    return [...exactOrStarts, ...wordStarts].slice(0, 3);
}

function invalidateSmartCache(type) {
    if (!type || type === 'anggota' || type === 'member') {
        smartMembersCache = null;
        smartMembersCallbacks = [];
        isSmartMembersLoading = false;
    }
    if (!type || type === 'guru' || type === 'teacher') {
        smartTeachersCache = null;
        smartTeachersCallbacks = [];
        isSmartTeachersLoading = false;
    }
    if (!type || type === 'buku' || type === 'book') {
        smartBooksCache = null;
        smartBooksCallbacks = [];
        isSmartBooksLoading = false;
    }
    if (!type || type === 'transaksi' || type === 'riwayat' || type === 'member' || type === 'book' || type === 'guru') {
        invalidateReturnLoanCache();
    }
}

function getSmartTeachers(callback) {
    if (smartTeachersCache && smartTeachersCache.length > 0) {
        if (callback) callback(smartTeachersCache);
        return;
    }
    if (callback) smartTeachersCallbacks.push(callback);
    if (isSmartTeachersLoading) return;
    isSmartTeachersLoading = true;
    google.script.run
        .withFailureHandler(err => {
            isSmartTeachersLoading = false;
            console.error("Gagal memuat cache guru:", err);
            const cbs = smartTeachersCallbacks.splice(0);
            cbs.forEach(cb => cb([]));
        })
        .withSuccessHandler(data => {
            isSmartTeachersLoading = false;
            smartTeachersCache = Array.isArray(data) ? data : (data && data.data ? data.data : []);
            const cbs = smartTeachersCallbacks.splice(0);
            cbs.forEach(cb => cb(smartTeachersCache));
        })
        .getAllDataForExport('guru');
}

function getSmartBorrowers(callback) {
    getSmartMembers(members => {
        getSmartTeachers(teachers => {
            const allBorrowers = [];
            (members || []).forEach(m => {
                allBorrowers.push({
                    type: 'siswa',
                    id: String(m[0] || ''),
                    nama: String(m[1] || ''),
                    info: String(m[2] || 'Siswa')
                });
            });
            (teachers || []).forEach(g => {
                allBorrowers.push({
                    type: 'guru',
                    id: String(g[0] || ''),
                    nama: String(g[1] || ''),
                    info: String(g[2] || 'Guru/Tendik')
                });
            });
            if (callback) callback(allBorrowers);
        });
    });
}

// BUG #5 FIX: Gunakan callback queue agar tidak ada race condition / setTimeout recursive
function getSmartMembers(callback) {
    if (smartMembersCache && smartMembersCache.length > 0) {
        if (callback) callback(smartMembersCache);
        return;
    }
    // Antrekan callback, bukan polling setTimeout
    if (callback) smartMembersCallbacks.push(callback);
    if (isSmartMembersLoading) return; // Request sudah berjalan, callback akan dipanggil saat selesai
    isSmartMembersLoading = true;
    google.script.run
        .withFailureHandler(err => {
            isSmartMembersLoading = false;
            console.error("Gagal memuat cache anggota cerdas:", err);
            const cbs = smartMembersCallbacks.splice(0);
            cbs.forEach(cb => cb([]));
        })
        .withSuccessHandler(data => {
            isSmartMembersLoading = false;
            smartMembersCache = Array.isArray(data) ? data : (data && data.data ? data.data : []);
            const cbs = smartMembersCallbacks.splice(0);
            cbs.forEach(cb => cb(smartMembersCache));
        })
        .getAllDataForExport('anggota');
}

function getSmartBooks(callback, type = 'loan') {
    if (type === 'return') {
        const memberId = document.getElementById('return-member-input')?.value || '';
        if (!memberId) {
            if (callback) callback([]);
            return;
        }
        getActiveReturnBooks(memberId, callback || (() => {}));
        return;
    }

    if (publicCatalogAllBooks && publicCatalogAllBooks.length > 0) {
        smartBooksCache = publicCatalogAllBooks;
        if (callback) callback(smartBooksCache);
        return;
    }
    if (smartBooksCache && smartBooksCache.length > 0) {
        if (callback) callback(smartBooksCache);
        return;
    }
    // BUG #5 FIX: Antrekan callback, bukan polling setTimeout
    if (callback) smartBooksCallbacks.push(callback);
    if (isSmartBooksLoading) return; // Request sudah berjalan, callback akan dipanggil saat selesai
    isSmartBooksLoading = true;
    google.script.run
        .withFailureHandler(err => {
            isSmartBooksLoading = false;
            console.error("Gagal memuat cache buku cerdas:", err);
            const cbs = smartBooksCallbacks.splice(0);
            cbs.forEach(cb => cb([]));
        })
        .withSuccessHandler(data => {
            isSmartBooksLoading = false;
            smartBooksCache = Array.isArray(data) ? data : (data && data.data ? data.data : []);
            const cbs = smartBooksCallbacks.splice(0);
            cbs.forEach(cb => cb(smartBooksCache));
        })
        .getAllDataForExport('buku');
}

function selectSmartMember(t, id, nama) {
    if (t === 'return' && !(activeReturnLoansCache || []).some(loan => String(loan.idAnggota).trim() === String(id).trim())) {
        Swal.fire('Tidak ada peminjaman aktif', 'Siswa ini tidak memiliki buku yang sedang dipinjam.', 'info');
        return;
    }
    const inp = document.getElementById(t + '-member-input');
    const nameEl = document.getElementById(t + '-member-name');
    const bookInp = document.getElementById(t + '-book-input');
    const bookBtn = document.getElementById('btn-' + t + '-book');
    const bookGroup = document.getElementById(t + '-book-group');
    const suggEl = document.getElementById(t + '-member-suggestions');

    if (inp) inp.value = id;
    if (nameEl) nameEl.innerText = nama;
    if (bookInp) {
        bookInp.value = '';
        bookInp.disabled = false;
        bookInp.focus();
    }
    if (bookBtn) bookBtn.disabled = false;
    if (bookGroup) bookGroup.classList.remove('opacity-50');
    if (suggEl) {
        suggEl.style.display = 'none';
        suggEl.innerHTML = '';
    }

    if (t === 'return') return;

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
            if (type === 'return') {
                const bookInput = document.getElementById('return-book-input');
                const bookButton = document.getElementById('btn-return-book');
                const bookGroup = document.getElementById('return-book-group');
                const nameElement = document.getElementById('return-member-name');
                if (bookInput) { bookInput.value = ''; bookInput.disabled = true; }
                if (bookButton) bookButton.disabled = true;
                if (bookGroup) bookGroup.classList.add('opacity-50');
                if (nameElement) nameElement.textContent = '';
                const bookSuggestions = document.getElementById('return-book-suggestions');
                if (bookSuggestions) { bookSuggestions.style.display = 'none'; bookSuggestions.innerHTML = ''; }
            }
            if (val.length < 1) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => {
                getMembersForType(type, members => {
                    const q = val.toLowerCase();
                    const exactOrStarts = [];
                    const wordStarts = [];
                    for (let i = 0; i < members.length; i++) {
                        const m = members[i];
                        const idStr = String(m.id !== undefined ? m.id : (m[0] || '')).toLowerCase();
                        const namaStr = String(m.nama !== undefined ? m.nama : (m[1] || '')).toLowerCase();

                        // NISN/NIP & Nama yang diawali q masuk ke prioritas utama
                        if (idStr.startsWith(q) || namaStr.startsWith(q)) {
                            exactOrStarts.push(m);
                        } else {
                            const words = namaStr.split(/\s+/);
                            if (words.some(w => w.startsWith(q))) {
                                wordStarts.push(m);
                            }
                        }
                        if (exactOrStarts.length >= 4) break;
                    }

                    const filtered = [...exactOrStarts, ...wordStarts].slice(0, 4);
                    if (filtered.length === 0) {
                        const emptyLabel = type === 'return'
                            ? 'Tidak ada peminjam dengan pinjaman aktif'
                            : 'Anggota Siswa / Guru tidak ditemukan';
                        dropdown.innerHTML = `<div class="p-3 text-center text-muted small"><i class="fas fa-user-slash me-1"></i> ${emptyLabel}</div>`;
                        dropdown.style.display = 'block';
                        return;
                    }

                    let html = '<div class="list-group list-group-flush">';
                    filtered.forEach(m => {
                        const id = escapeCatalogHtml(String(m.id !== undefined ? m.id : (m[0] || '')));
                        const nama = escapeCatalogHtml(String(m.nama !== undefined ? m.nama : (m[1] || '')));
                        const info = escapeCatalogHtml(String(m.info !== undefined ? m.info : (m[2] || 'Umum')));
                        const isGuru = m.type === 'guru';
                        const icon = isGuru ? '<i class="fas fa-chalkboard-teacher me-2" style="color: #7c3aed;"></i>' : '<i class="fas fa-user-graduate text-primary me-2"></i>';
                        const badgeId = isGuru ? `<span class="badge border me-1" style="background:#f3e8ff; color:#7c3aed;">NIP: ${id}</span>` : `<span class="badge bg-light text-secondary border me-1">NISN: ${id}</span>`;
                        const memberDetail = type === 'return' ? 'Memiliki pinjaman aktif' : (isGuru ? `Guru / Tendik (${info})` : `Kelas: ${info}`);
                        const rawId = escapeCatalogHtml(JSON.stringify(String(m.id !== undefined ? m.id : (m[0] || ''))));
                        const rawNama = escapeCatalogHtml(JSON.stringify(String(m.nama !== undefined ? m.nama : (m[1] || ''))));

                        html += `
                            <a href="javascript:void(0)" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center" onclick="selectSmartMember('${type}', ${rawId}, ${rawNama})">
                                <div class="me-2 text-truncate">
                                    <div class="fw-bold text-dark text-truncate">${icon}${nama}</div>
                                    <small class="text-muted">${badgeId} ${memberDetail}</small>
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
            const memberId = type === 'return' ? document.getElementById('return-member-input')?.value.trim() : '';
            if (type === 'return' && !memberId) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            if (type !== 'return' && val.length < 1) {
                dropdown.style.display = 'none';
                dropdown.innerHTML = '';
                return;
            }
            debounceTimer = setTimeout(() => {
                getSmartBooks(books => {
                    const filtered = getSmartBookMatches(books, val, type);

                    if (filtered.length === 0) {
                        const emptyLabel = type === 'return'
                            ? 'Siswa ini tidak memiliki buku yang sedang dipinjam'
                            : 'Buku tidak ditemukan';
                        dropdown.innerHTML = `<div class="p-3 text-center text-muted small"><i class="fas fa-book-open me-1"></i> ${emptyLabel}</div>`;
                        dropdown.style.display = 'block';
                        return;
                    }

                    let html = '<div class="list-group list-group-flush">';
                    filtered.forEach(b => {
                        const kode = escapeCatalogHtml(String(b[0] || ''));
                        const judul = escapeCatalogHtml(String(b[1] || ''));
                        const sisa = b[7] !== undefined ? parseInt(b[7]) : (parseInt(b[6]) || 1);
                        const stockInfo = type === 'return'
                            ? '<span class="badge bg-primary-subtle text-primary border me-1">Sedang dipinjam</span>'
                            : `<span class="badge bg-light text-secondary border me-1">Kode: ${kode}</span> Stok: <b class="${sisa > 0 ? 'text-success' : 'text-danger'}">${sisa}</b>`;
                        const rawKode = escapeCatalogHtml(JSON.stringify(String(b[0] || '')));
                        const rawJudul = escapeCatalogHtml(JSON.stringify(String(b[1] || '')));

                        html += `
                            <a href="javascript:void(0)" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center" onclick="selectSmartBook('${type}', ${rawKode}, ${rawJudul})">
                                <div class="me-2 text-truncate">
                                    <div class="fw-bold text-dark text-truncate"><i class="fas fa-book text-warning me-2"></i>${judul}</div>
                                    <small class="text-muted">${stockInfo}</small>
                                </div>
                                <span class="badge bg-warning text-dark rounded-pill px-2 py-1 small flex-shrink-0">Pilih <i class="fas fa-arrow-right ms-1"></i></span>
                            </a>
                        `;
                    });
                    html += '</div>';
                    dropdown.innerHTML = html;
                    dropdown.style.display = 'block';
                }, type);
            }, 150);
        });

        input.addEventListener('focus', function () {
            if (type === 'return') {
                if (!document.getElementById('return-member-input')?.value.trim()) return;
                if (!dropdown.innerHTML.trim()) this.dispatchEvent(new Event('input', { bubbles: true }));
                else dropdown.style.display = 'block';
                return;
            }
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
            ['loan-member-suggestions', 'loan-book-suggestions', 'return-member-suggestions', 'return-book-suggestions', 'tamu-nama-suggestions'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }
    });
}

function handleManualMember(t, onValidated, deferBookInput = false, onValidationFailed) {
    let i = (document.getElementById(t + '-member-input').value || '').trim();
    if (!i) {
        if (onValidationFailed) onValidationFailed();
        return;
    }

    // Sembunyikan dropdown saran jika terbuka
    const suggEl = document.getElementById(t + '-member-suggestions');
    if (suggEl) suggEl.style.display = 'none';

    if (t === 'return') {
        getActiveReturnLoans(loans => {
            const query = i.toLowerCase();
            const matches = loans.filter(loan =>
                String(loan.idAnggota || '').trim().toLowerCase() === query ||
                String(loan.namaAnggota || '').trim().toLowerCase() === query
            );
            const memberIds = [...new Set(matches.map(loan => String(loan.idAnggota || '').trim()).filter(Boolean))];
            if (memberIds.length !== 1) {
                Swal.fire(
                    'Catatan peminjaman aktif tidak ditemukan',
                    memberIds.length > 1
                        ? 'Nama ini memiliki lebih dari satu ID yang sedang meminjam. Pilih siswa dari daftar agar ID-nya tepat.'
                        : 'Nama siswa tersebut belum terdapat catatan peminjaman aktif.',
                    'info'
                ).then(() => { if (onValidationFailed) onValidationFailed(); });
                return;
            }

            const memberId = memberIds[0];
            const loan = matches.find(item => String(item.idAnggota || '').trim() === memberId);
            document.getElementById('return-member-input').value = memberId;
            document.getElementById('return-member-name').textContent = loan?.namaAnggota || memberId;
            if (!deferBookInput) enableBookScan('return');
            if (onValidated) onValidated(loan?.namaAnggota || memberId);
        });
        return;
    }

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
        .withFailureHandler(err => {
            handleNetworkError(err);
            if (onValidationFailed) onValidationFailed();
        })
        .withSuccessHandler(r => {
            if (r.status) {
                document.getElementById(t + '-member-name').innerText = r.nama;
                if (!deferBookInput) enableBookScan(t);
                if (onValidated) onValidated(r.nama);
            } else {
                Swal.fire('Err', r.message, 'error').then(() => {
                    if (onValidationFailed) onValidationFailed();
                });
            }
        }).checkMember(i);
}

// BUG #6 FIX: Ditambahkan parameter onDone agar scanLock bisa di-reset via callback
function handleManualBook(t, onDone) {
    const m = document.getElementById(t + '-member-input').value;
    let b = (document.getElementById(t + '-book-input').value || '').trim();
    if (!b) {
        if (onDone) onDone(); // Reset lock meski input kosong
        return;
    }

    // Sembunyikan dropdown saran jika terbuka
    const suggEl = document.getElementById(t + '-book-suggestions');
    if (suggEl) suggEl.style.display = 'none';

    // Cek apakah yang diketik adalah judul buku di cache cerdas
    const bookList = t === 'return'
        ? (activeReturnLoansCache || [])
            .filter(loan => String(loan.idAnggota || '').trim() === String(m || '').trim())
            .map(loan => [String(loan.kodeBuku || ''), String(loan.judulBuku || loan.kodeBuku || '')])
        : ((smartBooksCache && smartBooksCache.length > 0) ? smartBooksCache : publicCatalogAllBooks);
    if (t === 'return' && bookList.length === 0) {
        Swal.fire('Tidak ada buku dipinjam', 'Siswa ini tidak memiliki buku aktif untuk dikembalikan.', 'info');
        if (onDone) onDone();
        return;
    }
    if (bookList && bookList.length > 0) {
        const q = b.toLowerCase();
        // Kode hanya boleh cocok jika exact match atau startsWith, judul boleh cocok jika exact/startsWith/kata diawali q
        const matched = bookList.find(x => String(x[0]).toLowerCase() === q) ||
                        bookList.find(x => String(x[0]).toLowerCase().startsWith(q)) ||
                        bookList.find(x => String(x[1]).toLowerCase() === q) ||
                        bookList.find(x => String(x[1]).toLowerCase().startsWith(q)) ||
                        bookList.find(x => String(x[1]).toLowerCase().split(/\s+/).some(w => w.startsWith(q)));
        if (t === 'return' && !matched) {
            Swal.fire('Buku belum dipilih', 'Daftar buku pinjaman aktif siswa tetap ditampilkan. Pilih salah satu buku dari daftar tersebut.', 'info');
            if (onDone) onDone();
            return;
        }
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
            if (onDone) onDone(); // Reset lock saat error
            if (window.isElectron) {
                console.error('SQLite transaction error:', err);
                Swal.fire('Transaksi Gagal', err?.message || String(err), 'error');
                return;
            }
            handleNetworkError(err);
        })
        .withSuccessHandler(r => {
            document.getElementById(t + '-loading').classList.add('d-none');
            if (onDone) onDone(); // Reset lock saat berhasil
            if (r.status) {
                invalidateReturnLoanCache();
                document.getElementById(t + '-member-input').value = '';
                document.getElementById(t + '-member-name').innerText = '';
                document.getElementById(t + '-book-input').value = '';
                document.getElementById(t + '-book-input').disabled = true;
                const bookBtn = document.getElementById('btn-' + t + '-book');
                if (bookBtn) bookBtn.disabled = true;
                const bookGroup = document.getElementById(t + '-book-group');
                if (bookGroup) bookGroup.classList.add('opacity-50');
                if (t === 'loan') {
                    Swal.fire({
                        title: 'Peminjaman Berhasil! 🎉',
                        html: `
                        <div style="text-align:center; padding: 10px;">
                            <h4 style="color: #4361ee; font-weight: bold; font-size: 1.5rem;">${escapeHtml(r.peminjam)}</h4>
                            <p style="font-size: 1.2rem; color: #333; margin-top: 10px;">Telah meminjam buku:</p>
                            <div style="background: #e0f2fe; padding: 15px; border-radius: 15px; border: 2px solid #b6e3ff; margin: 15px 0;">
                                <h5 style="color: #023e8a; font-weight: bold; margin:0; font-size: 1.4rem;">${escapeHtml(r.judul)}</h5>
                            </div>
                            <div style="background: #fff0f3; border: 2px dashed #ffb3c1; padding: 10px; border-radius: 10px; display: inline-block;">
                                <p style="font-size: 1.2rem; color: #d90429; font-weight: bold; margin: 0;">
                                    <i class="fas fa-calendar-times me-2"></i> Jatuh Tempo: ${escapeHtml(r.tglKembali)}
                                </p>
                            </div>
                        </div>`,
                        icon: 'success',
                        width: '600px',
                        padding: '2em',
                        background: '#ffffff',
                        backdrop: `rgba(0,0,123,0.4)`
                    });
                } else {
                    Swal.fire({
                        title: 'Pengembalian Berhasil! ✅',
                        html: `
                        <div style="text-align:center; padding: 10px;">
                            <h4 style="color: #2b9348; font-weight: bold; font-size: 1.5rem;">${escapeHtml(r.peminjam)}</h4>
                            <p style="font-size: 1.2rem; color: #333; margin-top: 10px;">Telah mengembalikan buku:</p>
                            <div style="background: #eaf4f4; padding: 15px; border-radius: 15px; border: 2px solid #cce3e3; margin: 15px 0;">
                                <h5 style="color: #006466; font-weight: bold; margin:0; font-size: 1.4rem;">${escapeHtml(r.judul)}</h5>
                            </div>
                            <div style="margin-top: 15px; display: flex; justify-content: center; gap: 20px;">
                                <div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 10px 15px; border-radius: 10px;">
                                    <span style="font-size: 1rem; color: #6c757d; display: block;">Terlambat</span>
                                    <span style="font-size: 1.2rem; font-weight: bold; color: #495057;">${escapeHtml(r.terlambat)}</span>
                                </div>
                                <div style="background: #fff0f3; border: 1px solid #ffb3c1; padding: 10px 15px; border-radius: 10px;">
                                    <span style="font-size: 1rem; color: #6c757d; display: block;">Denda</span>
                                    <span style="font-size: 1.3rem; font-weight: bold; color: #d00000;">${escapeHtml(r.denda)}</span>
                                </div>
                            </div>
                        </div>`,
                        icon: 'success',
                        width: '600px',
                        padding: '2em',
                        background: '#ffffff',
                        backdrop: `rgba(0,123,0,0.4)`
                    });
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
    if (!bookData || bookData.length === 0) {
        tb.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted"><i class="fas fa-info-circle me-1"></i> Tidak ada data buku.</td></tr>';
        document.getElementById('book-page-info').innerText = '0-0 dari 0';
        return;
    }

    bookData.forEach(r => {
        const kodeStr = String(r[0] || '');
        const judulStr = String(r[1] || '');
        const pengarangStr = String(r[2] || '-');
        const penerbitStr = String(r[3] || '-');
        const kategoriStr = String(r[5] || 'Umum');
        const stokAwal = (r[6] !== undefined && r[6] !== '') ? Number(r[6]) : 1;
        const rusak = (r[9] !== undefined && r[9] !== '' && !isNaN(r[9])) ? Number(r[9]) : 0;
        
        // Stok Tersedia: berasal dari stok total awal dikurangi hilang/rb
        const stokTersedia = Math.max(0, stokAwal - rusak);
        // Sisa: stok buku fisik saat ini yang siap dipinjam di perpustakaan
        const sisa = (r[7] !== undefined && r[7] !== "") ? Number(r[7]) : stokTersedia;

        const judulAman = escapeCatalogHtml(JSON.stringify(judulStr));
        const kodeAman = escapeCatalogHtml(JSON.stringify(kodeStr));
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td class="font-monospace text-primary fw-bold">${escapeCatalogHtml(kodeStr)}</td>
            <td>
                <div class="fw-bold text-dark text-clamp-2" title="${escapeCatalogHtml(judulStr)}">${escapeCatalogHtml(judulStr)}</div>
                <div class="small text-muted mt-1 d-flex flex-wrap gap-1 align-items-center" style="font-size: 11px;">
                    <span class="badge bg-light text-secondary border">${escapeCatalogHtml(kategoriStr)}</span>
                    <span class="text-muted"><i class="fas fa-pen-nib me-1"></i>${escapeCatalogHtml(pengarangStr)}</span>
                </div>
            </td>
            <td>
                <div class="text-truncate" style="max-width: 200px;" title="${escapeCatalogHtml(penerbitStr)}">${escapeCatalogHtml(penerbitStr)}</div>
            </td>
            <td class="text-center fw-bold text-dark" style="font-size: 1.05rem;">${stokTersedia}</td>
            <td class="text-center fw-bold text-success" style="font-size: 1.05rem;">${sisa}</td>
            <td class="text-end nowrap-cell">
                <button class="btn btn-sm btn-outline-primary me-1 rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Unduh QR Code" onclick="processDownloadLabel(${kodeAman},${judulAman})"><i class="fas fa-qrcode"></i></button>
                <button class="btn btn-sm text-warning me-1 rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Edit Buku" onclick="editBook(${kodeAman})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm text-danger rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Hapus Buku" onclick="delBook(${kodeAman})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tb.appendChild(tr);
    });

    const start = (bookPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + bookData.length - 1, bookTotal);
    document.getElementById('book-page-info').innerText = `${start}-${end} dari ${bookTotal}`;
}

function prevBookPage() { if (bookPage > 1) { bookPage--; loadBooks(); } }
function nextBookPage() { if (bookPage * rowsPerPage < bookTotal) { bookPage++; loadBooks(); } }

function updateStokPreview() {
    const stokEl = document.getElementById('bStok');
    const rusakEl = document.getElementById('bRusak');
    const previewEl = document.getElementById('bStokBersihPreview');
    const formulaEl = document.getElementById('bStokFormulaPreview');
    if (!stokEl || !rusakEl || !previewEl) return;

    let stokAwal = parseInt(stokEl.value, 10);
    if (isNaN(stokAwal) || stokAwal < 0) stokAwal = 0;

    let rusak = parseInt(rusakEl.value, 10);
    if (isNaN(rusak) || rusak < 0) {
        rusak = 0;
        rusakEl.value = 0;
    }

    // Validasi: Jumlah Hilang / Rusak Berat tidak boleh lebih dari Stok Awal
    if (stokAwal > 0 && rusak > stokAwal) {
        rusak = stokAwal;
        rusakEl.value = stokAwal;
    }
    rusakEl.max = stokAwal > 0 ? stokAwal : 0;

    const stokBersih = Math.max(0, stokAwal - rusak);
    previewEl.innerText = stokBersih.toLocaleString('id-ID');
    if (formulaEl) {
        formulaEl.innerText = `${stokAwal} (Awal) - ${rusak} (RB) = ${stokBersih}`;
    }
}

function openBookModal() {
    document.getElementById('formBuku').reset();
    document.getElementById('bKode').readOnly = false;
    document.getElementById('bIsEdit').value = 'false';
    document.getElementById('bOldKode').value = '';
    const titleEl = document.getElementById('modalBukuTitle');
    if (titleEl) titleEl.innerText = 'Tambah Data Buku';
    if (document.getElementById('bKategori')) document.getElementById('bKategori').value = 'Buku Pelajaran';
    if (document.getElementById('bSumber')) document.getElementById('bSumber').value = 'BOS Reguler';
    if (document.getElementById('bStok')) document.getElementById('bStok').value = '';
    if (document.getElementById('bRusak')) document.getElementById('bRusak').value = '0';
    updateStokPreview();
    new bootstrap.Modal(document.getElementById('modalBuku')).show();
}

function editBook(k) {
    const b = bookData.find(x => String(x[0]).trim() === String(k).trim());
    if (b) {
        document.getElementById('bKode').value = b[0] || '';
        document.getElementById('bKode').readOnly = true;
        document.getElementById('bOldKode').value = b[0] || '';
        document.getElementById('bJudul').value = b[1] || '';
        document.getElementById('bPengarang').value = b[2] || '';
        document.getElementById('bPenerbit').value = b[3] || '';
        document.getElementById('bTahun').value = b[4] || '';
        document.getElementById('bKategori').value = b[5] || 'Umum';
        document.getElementById('bStok').value = (b[6] !== undefined && b[6] !== null && b[6] !== '') ? b[6] : 1;
        
        if (document.getElementById('bSumber')) {
            document.getElementById('bSumber').value = b[8] || 'BOS Reguler';
        }
        if (document.getElementById('bRusak')) {
            document.getElementById('bRusak').value = (b[9] !== undefined && b[9] !== null && b[9] !== '') ? b[9] : 0;
        }

        const titleEl = document.getElementById('modalBukuTitle');
        if (titleEl) titleEl.innerText = 'Edit Data Buku';
        document.getElementById('bIsEdit').value = 'true';
        updateStokPreview();
        new bootstrap.Modal(document.getElementById('modalBuku')).show();
    }
}

function submitBuku() {
    const d = {
        kode: document.getElementById('bKode').value.trim(),
        oldKode: document.getElementById('bOldKode').value,
        judul: document.getElementById('bJudul').value.trim(),
        pengarang: document.getElementById('bPengarang').value.trim(),
        penerbit: document.getElementById('bPenerbit').value.trim(),
        tahun: document.getElementById('bTahun').value.trim(),
        kategori: document.getElementById('bKategori').value,
        sumber: document.getElementById('bSumber')?.value || 'BOS Reguler',
        stok: document.getElementById('bStok').value,
        rusak: document.getElementById('bRusak')?.value || 0,
        isEdit: document.getElementById('bIsEdit').value === 'true'
    };

    // Validasi input terpusat (NISN, tahun, stok awal, hilang/RB, XSS)
    const validasiError = validateBukuForm(d);
    if (validasiError) { return Swal.fire('Data Tidak Valid', validasiError, 'warning'); }

    // Pastikan stok dan rusak selalu integer valid
    d.stok = Math.max(1, parseInt(d.stok, 10));
    d.rusak = Math.max(0, parseInt(d.rusak, 10) || 0);

    // Terapkan Smart Loading
    showSmartLoading('Menyimpan Buku...', 'Mengirim data ke sistem pusat.');

    google.script.run
        .withFailureHandler(err => handleOperationError('Gagal Menyimpan Buku', err))
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
        const idAman = escapeCatalogHtml(JSON.stringify(idStr));
        const tr = document.createElement('tr');

        // Kita tambahkan div.text-clamp-2 untuk Nama, dan .nowrap-cell untuk tgl & aksi
        tr.innerHTML = '<td class="nowrap-cell font-monospace">' + escapeCatalogHtml(idStr) + '</td>' +
            '<td><div class="text-clamp-2" title="' + escapeCatalogHtml(namaStr) + '">' + escapeCatalogHtml(namaStr) + '</div></td>' +
            '<td class="nowrap-cell">' + escapeCatalogHtml(kelasStr) + '</td>' +
            '<td class="nowrap-cell">' + escapeCatalogHtml(hp) + '</td>' +
            '<td class="nowrap-cell">' + escapeCatalogHtml(tgl) + '</td>' +
            '<td class="text-end nowrap-cell">' +
            '<button class="btn btn-sm btn-outline-primary me-1 rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Unduh Kartu Anggota" onclick="processDownloadCard(' + idAman + ')"><i class="fas fa-id-card"></i></button>' +
            '<button class="btn btn-sm text-warning me-1 rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Edit Anggota" onclick="editMember(' + idAman + ')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm text-danger rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Hapus Anggota" onclick="delMember(' + idAman + ')"><i class="fas fa-trash"></i></button>' +
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

    // Validasi input terpusat (format NISN, karakter berbahaya)
    const validasiError = validateAnggotaForm(d);
    if (validasiError) { return Swal.fire('Data Tidak Valid', validasiError, 'warning'); }

    // Terapkan Smart Loading
    showSmartLoading('Menyimpan Anggota...', 'Memperbarui direktori anggota.');

    google.script.run
        .withFailureHandler(err => handleOperationError('Gagal Menyimpan Anggota', err))
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
function delMember(id) {
    Swal.fire({
        title: 'Hapus Siswa?',
        text: `Data anggota dengan NISN ${id} akan dihapus secara permanen.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then(r => {
        if (r.isConfirmed) {
            showSmartLoading('Menghapus Data...', 'Sedang menghapus data siswa...');
            google.script.run
                .withFailureHandler(handleNetworkError)
                .withSuccessHandler(res => {
                    if (res && res.status === false) {
                        Swal.fire('Gagal Menghapus', res.message || 'Data siswa tidak ditemukan atau gagal dihapus.', 'error');
                        return;
                    }
                    invalidateSmartCache('anggota');
                    loadMembers();
                    Swal.fire('Terhapus!', 'Data siswa telah berhasil dihapus.', 'success');
                }).deleteMember(id);
        }
    });
}

// ==========================================================
// 👩‍🏫 MODUL DATA GURU & TENAGA KEPENDIDIKAN (TENDIK)
// ==========================================================
function loadTeachers(q = '') {
    const tb = document.getElementById('teacher-list-body');
    if (!tb) return;
    tb.innerHTML = '<tr><td colspan="7" class="text-center py-5"><div class="spinner-border text-purple" style="color: #7c3aed;" role="status"></div><div class="mt-2 text-muted small">Memuat Data Guru & Tendik...</div></td></tr>';

    google.script.run
        .withFailureHandler(err => {
            tb.innerHTML = '<tr><td colspan="7" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Gagal memuat data</td></tr>';
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            if (res && res.status === false) {
                tb.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="fas fa-exclamation-circle me-1"></i>${escapeCatalogHtml(res.message || 'Gagal memuat data guru/tendik')}</td></tr>`;
                return;
            }
            teacherData = (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []);
            teacherTotal = (res && typeof res.total === 'number') ? res.total : teacherData.length;
            renderTeachers();
        }).getTeacherList(teacherPage, rowsPerPage, q);
}

function renderTeachers() {
    const tb = document.getElementById('teacher-list-body');
    if (!tb) return;
    tb.innerHTML = '';
    if (!teacherData || teacherData.length === 0) {
        tb.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Belum ada data guru/tendik.</td></tr>';
        const pageInfo = document.getElementById('teacher-page-info');
        if (pageInfo) pageInfo.innerText = '0-0 dari 0';
        return;
    }

    teacherData.forEach(r => {
        let nipStr = '';
        let namaStr = '';
        let jenisStr = 'Guru';
        let jabatanStr = 'Guru Mata Pelajaran';
        let jkStr = 'L';
        let hpStr = '-';

        if (Array.isArray(r)) {
            nipStr = String(r[0] || '').trim();
            namaStr = String(r[1] || '').trim();
            if (r[2] === 'Guru' || r[2] === 'Tendik') {
                jenisStr = r[2];
                jabatanStr = r[3] || (jenisStr === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)');
                jkStr = String(r[4] || 'L').toUpperCase().trim();
                hpStr = r[5] ? String(r[5]) : '-';
            } else {
                jabatanStr = r[2] || 'Guru Mata Pelajaran';
                jkStr = String(r[3] || 'L').toUpperCase().trim();
                hpStr = r[4] ? String(r[4]) : '-';
                const jLower = jabatanStr.toLowerCase();
                jenisStr = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran') || jLower.includes('kebersihan') || jLower.includes('operator') || jLower.includes('administrasi') || jLower.includes('tas')) ? 'Tendik' : 'Guru';
            }
        } else if (r && typeof r === 'object') {
            nipStr = String(r.nip || r.id || r.ID_NIP || '').trim();
            namaStr = String(r.nama || r.Nama || '').trim();
            jenisStr = String(r.jenisPegawai || r.JenisPegawai || 'Guru').trim();
            jabatanStr = String(r.jabatan || r.Jabatan || r.mapel || (jenisStr === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)')).trim();
            jkStr = String(r.jk || r.JenisKelamin || 'L').toUpperCase().trim();
            hpStr = String(r.nohp || r.hp || r.NoHP || '-').trim();
        }

        const jkBadge = jkStr === 'P'
            ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">P</span>'
            : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">L</span>';

        const jenisBadge = jenisStr === 'Tendik'
            ? '<span class="badge rounded-pill" style="background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.25);"><i class="fas fa-user-tie me-1"></i>Tendik</span>'
            : '<span class="badge rounded-pill" style="background: rgba(124, 58, 237, 0.12); color: #6d28d9; border: 1px solid rgba(124, 58, 237, 0.25);"><i class="fas fa-chalkboard-teacher me-1"></i>Guru</span>';

        const nipAman = escapeCatalogHtml(JSON.stringify(nipStr));
        const tr = document.createElement('tr');

        tr.innerHTML = `
            <td class="nowrap-cell font-monospace fw-semibold"><i class="fas fa-id-badge text-muted me-1"></i>${escapeCatalogHtml(nipStr)}</td>
            <td><div class="text-clamp-2 fw-bold text-dark" title="${escapeCatalogHtml(namaStr)}">${escapeCatalogHtml(namaStr)}</div></td>
            <td class="nowrap-cell">${jenisBadge}</td>
            <td class="nowrap-cell"><span class="badge bg-light text-secondary border">${escapeCatalogHtml(jabatanStr)}</span></td>
            <td class="text-center nowrap-cell">${jkBadge}</td>
            <td class="nowrap-cell">${escapeCatalogHtml(hpStr)}</td>
            <td class="text-end nowrap-cell">
                <button class="btn btn-sm btn-outline-primary me-1 rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Unduh Kartu Guru/Tendik" onclick="downloadTeacherCard(${nipAman})"><i class="fas fa-id-card"></i></button>
                <button class="btn btn-sm text-warning me-1 rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Edit Guru/Tendik" onclick="editTeacher(${nipAman})"><i class="fas fa-edit"></i></button>
                <button class="btn btn-sm text-danger rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Hapus Data" onclick="delTeacher(${nipAman})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tb.appendChild(tr);
    });

    const start = (teacherPage - 1) * rowsPerPage + 1;
    const end = Math.min(start + teacherData.length - 1, teacherTotal);
    const pageInfo = document.getElementById('teacher-page-info');
    if (pageInfo) pageInfo.innerText = `${start}-${end} dari ${teacherTotal}`;
}

function prevTeacherPage() {
    if (teacherPage > 1) {
        teacherPage--;
        loadTeachers(document.getElementById('searchTeacherInput')?.value || '');
    }
}

function nextTeacherPage() {
    if (teacherPage * rowsPerPage < teacherTotal) {
        teacherPage++;
        loadTeachers(document.getElementById('searchTeacherInput')?.value || '');
    }
}

let teacherFilterTimeout = null;
function filterTeachers() {
    clearTimeout(teacherFilterTimeout);
    teacherFilterTimeout = setTimeout(() => {
        teacherPage = 1;
        loadTeachers(document.getElementById('searchTeacherInput')?.value || '');
    }, 300);
}

function handleJenisPegawaiChange(val) {
    const wrapGuru = document.getElementById('wrapperJabatanGuru');
    const wrapTendik = document.getElementById('wrapperJabatanTendik');
    if (val === 'Tendik') {
        if (wrapGuru) wrapGuru.style.display = 'none';
        if (wrapTendik) wrapTendik.style.display = 'block';
    } else {
        if (wrapGuru) wrapGuru.style.display = 'block';
        if (wrapTendik) wrapTendik.style.display = 'none';
        const gJab = document.getElementById('gJabatanGuru');
        if (gJab) gJab.value = 'Guru Mata Pelajaran';
    }
}

function openTeacherModal() {
    const form = document.getElementById('formGuru');
    if (form) form.reset();
    const gNip = document.getElementById('gNip');
    if (gNip) gNip.readOnly = false;
    document.getElementById('gIsEdit').value = 'false';
    document.getElementById('gOldNip').value = '';
    const jSelect = document.getElementById('gJenisPegawai');
    if (jSelect) jSelect.value = 'Guru';
    handleJenisPegawaiChange('Guru');
    document.getElementById('modalGuruTitle').innerHTML = '<i class="fas fa-chalkboard-teacher me-2"></i>Tambah Guru & Tendik';
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalGuru'));
    modal.show();
}

function editTeacher(nip) {
    const t = teacherData.find(x => {
        const xNip = Array.isArray(x) ? x[0] : (x.nip || x.id || x.ID_NIP || '');
        return String(xNip).trim() === String(nip).trim();
    });
    if (t) {
        const nipVal = Array.isArray(t) ? t[0] : (t.nip || t.id || t.ID_NIP || '');
        const namaVal = Array.isArray(t) ? t[1] : (t.nama || t.Nama || '');
        document.getElementById('gNip').value = nipVal;
        document.getElementById('gNip').readOnly = true;
        document.getElementById('gOldNip').value = nipVal;
        document.getElementById('gNama').value = namaVal;

        let jenis = 'Guru';
        let jab = 'Guru Mata Pelajaran';
        let jk = 'L';
        let hp = '';

        if (Array.isArray(t)) {
            if (t[2] === 'Guru' || t[2] === 'Tendik') {
                jenis = t[2];
                jab = t[3] || '';
                jk = String(t[4] || 'L').toUpperCase().trim();
                hp = t[5] || '';
            } else {
                jab = t[2] || '';
                jk = String(t[3] || 'L').toUpperCase().trim();
                hp = t[4] || '';
                const jLower = jab.toLowerCase();
                jenis = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran') || jLower.includes('kebersihan') || jLower.includes('operator') || jLower.includes('administrasi') || jLower.includes('tas')) ? 'Tendik' : 'Guru';
            }
        } else if (t && typeof t === 'object') {
            jenis = String(t.jenisPegawai || t.JenisPegawai || 'Guru').trim();
            jab = String(t.jabatan || t.Jabatan || t.mapel || '').trim();
            jk = String(t.jk || t.JenisKelamin || 'L').toUpperCase().trim();
            hp = String(t.nohp || t.hp || t.NoHP || '').trim();
        }

        const jSelect = document.getElementById('gJenisPegawai');
        if (jSelect) jSelect.value = jenis;
        handleJenisPegawaiChange(jenis);

        if (jenis === 'Tendik') {
            const selectTendik = document.getElementById('gJabatanTendik');
            if (selectTendik) {
                let found = false;
                for (let opt of selectTendik.options) {
                    if (opt.value.toLowerCase() === jab.toLowerCase()) {
                        opt.selected = true;
                        found = true;
                        break;
                    }
                }
                if (!found && jab) {
                    const newOpt = new Option(jab, jab, true, true);
                    selectTendik.add(newOpt);
                }
            }
        } else {
            const jabGuru = document.getElementById('gJabatanGuru');
            if (jabGuru) jabGuru.value = jab || 'Guru Mata Pelajaran';
        }

        document.getElementById('gJk').value = (jk === 'P' || jk.startsWith('P')) ? 'P' : 'L';
        document.getElementById('gHp').value = (hp === '-' ? '' : hp);
        document.getElementById('gIsEdit').value = 'true';
        document.getElementById('modalGuruTitle').innerHTML = '<i class="fas fa-edit me-2"></i>Edit Guru & Tendik';
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('modalGuru'));
        modal.show();
    }
}

function submitGuru() {
    const nipRaw = document.getElementById('gNip').value.trim();
    const nip = nipRaw.replace(/[^0-9]/g, '');
    const nama = document.getElementById('gNama').value.trim();
    const jenis = document.getElementById('gJenisPegawai').value;
    let jabatan = '';
    if (jenis === 'Tendik') {
        jabatan = document.getElementById('gJabatanTendik').value.trim();
    } else {
        jabatan = document.getElementById('gJabatanGuru').value.trim() || 'Guru Mata Pelajaran';
    }
    const jk = document.getElementById('gJk').value;
    const hp = document.getElementById('gHp').value.trim();
    const isEdit = document.getElementById('gIsEdit').value === 'true';
    const oldNip = document.getElementById('gOldNip').value.trim();

    if (!nip) {
        return Swal.fire('Perhatian', 'NIP / NIK Pegawai wajib diisi!', 'warning');
    }
    if (nip.length < 16 || nip.length > 18) {
        return Swal.fire({
            title: 'Format NIP/NIK Tidak Sesuai',
            text: `NIP/NIK wajib berupa angka dengan panjang minimal 16 digit (NIK) dan maksimal 18 digit (NIP)! Anda memasukkan ${nip.length} digit.`,
            icon: 'warning'
        });
    }
    if (!nama) return Swal.fire('Perhatian', 'Nama lengkap guru/tendik wajib diisi!', 'warning');
    if (!jabatan) return Swal.fire('Perhatian', 'Jabatan wajib dipilih/diisi!', 'warning');

    const d = {
        nip: nip,
        oldNip: oldNip,
        nama: nama,
        jenisPegawai: jenis,
        jabatan: jabatan,
        jk: jk,
        nohp: hp || '-',
        isEdit: isEdit
    };

    showSmartLoading('Menyimpan Guru & Tendik...', 'Memperbarui database guru dan tenaga kependidikan.');

    google.script.run
        .withFailureHandler(err => handleOperationError('Gagal Menyimpan Guru', err))
        .withSuccessHandler(r => {
            if (r.status) {
                invalidateSmartCache('guru');
                const modal = bootstrap.Modal.getInstance(document.getElementById('modalGuru'));
                if (modal) modal.hide();
                loadTeachers();
                Swal.fire('Berhasil', 'Data Guru & Tendik berhasil disimpan!', 'success');
            } else {
                Swal.fire('Gagal', r.message || 'Terjadi kesalahan saat menyimpan.', 'error');
            }
        }).saveTeacher(d);
}

function delTeacher(nip) {
    Swal.fire({
        title: 'Hapus Guru / Tendik?',
        text: `Data dengan NIP/ID ${nip} akan dihapus secara permanen.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then(r => {
        if (r.isConfirmed) {
            showSmartLoading('Menghapus Data...', 'Sedang menghapus data guru/tendik...');
            google.script.run
                .withFailureHandler(handleNetworkError)
                .withSuccessHandler(res => {
                    if (res && res.status === false) {
                        Swal.fire('Gagal Menghapus', res.message || 'Data tidak ditemukan atau gagal dihapus.', 'error');
                        return;
                    }
                    invalidateSmartCache('guru');
                    loadTeachers();
                    Swal.fire('Terhapus!', 'Data guru/tendik telah berhasil dihapus.', 'success');
                }).deleteTeacher(nip);
        }
    });
}

function loadDashboard() {
    document.getElementById('stats-container').innerHTML = '<div class="col-12 text-center"><div class="spinner-border text-primary"></div></div>';
    google.script.run
        .withFailureHandler(err => {
            document.getElementById('stats-container').innerHTML = '<div class="col-12 text-center text-danger">Gagal memuat statistik. Coba refresh.</div>';
        })
        .withSuccessHandler(stats => {
            document.getElementById('stats-container').innerHTML = '<div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-primary"><div><h6 class="text-muted small mb-1">Total Judul</h6><h3 class="fw-bold text-primary mb-0">' + escapeHtml(stats.totalJudul) + '</h3></div><i class="fas fa-book fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-info"><div><h6 class="text-muted small mb-1">Total Stok</h6><h3 class="fw-bold text-info mb-0">' + escapeHtml(stats.totalEksemplar) + '</h3></div><i class="fas fa-layer-group fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-success"><div><h6 class="text-muted small mb-1">Anggota</h6><h3 class="fw-bold text-success mb-0">' + escapeHtml(stats.totalAnggota) + '</h3></div><i class="fas fa-users fa-2x text-black-50 opacity-25"></i></div></div><div class="col-6 col-md-3"><div class="glass-card p-3 d-flex align-items-center justify-content-between border-start border-4 border-secondary"><div><h6 class="text-muted small mb-1">Transaksi</h6><h3 class="fw-bold text-secondary mb-0">' + escapeHtml(stats.totalTransaksi) + '</h3></div><i class="fas fa-history fa-2x text-black-50 opacity-25"></i></div></div><div class="col-md-6"><div class="glass-card p-4 h-100"><h6 class="fw-bold text-uppercase text-muted mb-3">Status Saat Ini</h6><div class="row g-3"><div class="col-6"><div class="p-3 rounded-3 bg-warning bg-opacity-10 border border-warning text-center"><h2 class="fw-bold text-warning">' + escapeHtml(stats.sedangDipinjam) + '</h2><small class="text-muted fw-bold">Sedang Dipinjam</small></div></div><div class="col-6"><div class="p-3 rounded-3 bg-danger bg-opacity-10 border border-danger text-center"><h2 class="fw-bold text-danger">' + escapeHtml(stats.terlambat) + '</h2><small class="text-muted fw-bold">Terlambat / Denda</small></div></div></div></div></div><div class="col-md-6"><div class="glass-card p-4 h-100"><h6 class="fw-bold text-uppercase text-muted mb-3">Hall of Fame</h6><div class="d-flex align-items-center mb-3"><div class="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px;"><i class="fas fa-trophy"></i></div><div><small class="d-block text-muted">Siswa Terrajin</small><span class="fw-bold text-dark">' + escapeHtml(stats.siswaTerrajin) + '</span></div></div><div class="d-flex align-items-center"><div class="bg-success text-white rounded-circle d-flex align-items-center justify-content-center me-3" style="width:40px; height:40px;"><i class="fas fa-star"></i></div><div><small class="d-block text-muted">Buku Terpopuler</small><span class="fw-bold text-dark">' + escapeHtml(stats.bukuTerpopuler) + '</span></div></div></div></div>';
        }).getDashboardStats();
}

function loadHistory(q = null) {
    const search = q === null ? (document.getElementById('searchRiwayat')?.value || '') : q;
    const isArchive = document.getElementById('chkArsip') ? document.getElementById('chkArsip').checked : false;
    historyFilters = {
        status: document.getElementById('filterHistoryStatus')?.value || '',
        year: document.getElementById('filterHistoryYear')?.value || '',
        month: document.getElementById('filterHistoryMonth')?.value || ''
    };
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
            if (updateHistoryYearOptions(res?.years)) {
                historyPage = 1;
                loadHistory(search);
                return;
            }
            historyData = res.data;
            historyTotal = res.total;
            renderHistory();
        }).getHistoryList(
            historyPage, rowsPerPage, search, isArchive,
            historyFilters.status, historyFilters.year, historyFilters.month
        );
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

        if (!statusStr.includes('Kembali')) {
            const dueDateObj = parseLateDateHelper(r.tglTempo);
            const todayMid = parseLateDateHelper(new Date());
            if (dueDateObj && todayMid && todayMid.getTime() > dueDateObj.getTime()) {
                isLate = true;
                if (statusStr === 'Pinjam') statusColor = 'bg-danger';
            } else if (r.tglTempoTs > 0 && nowMs > r.tglTempoTs) {
                isLate = true;
                if (statusStr === 'Pinjam') statusColor = 'bg-danger';
            }
        }

        if (isLate && String(r.hpAnggota || '').replace(/\D/g, '').length > 5) {
            let hp = String(r.hpAnggota).replace(/\D/g, '');
            if (hp.startsWith('0')) hp = '62' + hp.substring(1);
            let msg = `Halo *${r.namaAnggota}*,\n\nKami dari Perpustakaan mengingatkan bahwa buku:\n📚 Judul: *${r.judulBuku}*\n📅 Jatuh Tempo: *${r.tglTempo}*\n\nStatus saat ini: *TERLAMBAT*. Mohon segera dikembalikan.\nTerima kasih.`;
            btnWA = `<a href="https://wa.me/${encodeURIComponent(hp)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-success ms-2 rounded-circle shadow-sm" style="width:32px;height:32px;padding:0;line-height:30px;" title="Kirim WA"><i class="fab fa-whatsapp"></i></a>`;
        }

        let btnDel = '';
        if (statusStr.includes('Kembali')) {
            const idTrxArg = escapeCatalogHtml(JSON.stringify(String(r.idTrx || '')));
            btnDel = `<button class="btn btn-sm btn-outline-danger ms-2 rounded-circle shadow-sm" style="width:32px;height:32px;padding:0;line-height:30px;" title="Hapus Riwayat" onclick="hapusRiwayat(${idTrxArg})"><i class="fas fa-trash"></i></button>`;
        }

        const namaAnggota = escapeCatalogHtml(r.namaAnggota || '');
        const idAnggota = escapeCatalogHtml(r.idAnggota || '');
        const judulBuku = escapeCatalogHtml(r.judulBuku || '');
        const kodeBuku = escapeCatalogHtml(r.kodeBuku || '');
        const tglPinjam = escapeCatalogHtml(formatSimpleDate(r.tglPinjam));
        const tglTempo = escapeCatalogHtml(formatSimpleDate(r.tglTempo));
        const status = escapeCatalogHtml(statusStr);
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><div class="fw-bold text-primary">' + namaAnggota + '</div><div class="small text-muted" style="font-size:11px;">' + idAnggota + '</div></td><td><div class="fw-bold text-dark text-truncate" style="max-width:180px;">' + judulBuku + '</div><div class="small text-muted" style="font-size:11px;">' + kodeBuku + '</div></td><td><div style="line-height:1.2;"><small class="d-block text-muted">Pinjam: ' + tglPinjam + '</small><small class="d-block ' + (isLate && !statusStr.includes('Kembali') ? 'text-danger fw-bold' : 'text-muted') + '">Tempo: ' + tglTempo + '</small></div></td><td><div class="d-flex align-items-center"><span class="badge ' + statusColor + '">' + (isLate && !statusStr.includes('Kembali') ? 'Terlambat' : status) + '</span>' + btnWA + btnDel + '</div></td>';
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
                        Swal.fire('Terhapus!', r.message || 'Riwayat berhasil dihapus.', 'success');
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

// =========================================================================
// TAB RIWAYAT & REKAP KETERLAMBATAN (FINAL & BELUM FINAL)
// =========================================================================
let lateAllData = [];
let lateFilteredData = [];
let latePage = 1;
let lateLimit = 10;

function switchRiwayatTab(tab) {
    const tabTrx = document.getElementById('tab-riwayat-transaksi');
    const tabLate = document.getElementById('tab-riwayat-terlambat');
    const paneTrx = document.getElementById('pane-riwayat-transaksi');
    const paneLate = document.getElementById('pane-riwayat-terlambat');

    if (tabTrx) tabTrx.classList.toggle('active', tab === 'transaksi');
    if (tabLate) tabLate.classList.toggle('active', tab === 'terlambat');

    if (paneTrx) {
        paneTrx.classList.toggle('show', tab === 'transaksi');
        paneTrx.classList.toggle('active', tab === 'transaksi');
    }
    if (paneLate) {
        paneLate.classList.toggle('show', tab === 'terlambat');
        paneLate.classList.toggle('active', tab === 'terlambat');
    }

    if (tab === 'transaksi') {
        loadHistory();
    } else if (tab === 'terlambat') {
        loadRekapTerlambat();
    }
}

function parseLateDateHelper(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return new Date(val.getFullYear(), val.getMonth(), val.getDate(), 0, 0, 0, 0);
    }
    const text = String(val).trim();
    if (!text || text === '-' || text === 'null' || text === 'undefined') return null;

    // 1. Format ISO: YYYY-MM-DD (termasuk timestamp ISO seperti 2026-10-09T17:00:00.000Z)
    // Utamakan regex ISO agar tanggal murni tidak tergeser oleh konversi zona waktu browser UTC / GMT+7
    const iso = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
    if (iso) {
        return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 0, 0, 0, 0);
    }

    // 2. Format DMY: DD/MM/YYYY atau DD-MM-YYYY
    const dmy = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) {
        return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), 0, 0, 0, 0);
    }

    // 3. Nama bulan bahasa Indonesia dan Inggris (misal: 9 Oktober 2026)
    const monthNames = {
        'januari': 0, 'jan': 0, 'january': 0,
        'februari': 1, 'feb': 1, 'february': 1,
        'maret': 2, 'mar': 2, 'march': 2,
        'april': 3, 'apr': 3,
        'mei': 4, 'may': 4,
        'juni': 5, 'jun': 5, 'june': 5,
        'juli': 6, 'jul': 6, 'july': 6,
        'agustus': 7, 'agu': 7, 'agt': 7, 'august': 7, 'aug': 7,
        'september': 8, 'sep': 8, 'sept': 8,
        'oktober': 9, 'okt': 9, 'october': 9, 'oct': 9,
        'november': 10, 'nov': 10,
        'desember': 11, 'des': 11, 'december': 11, 'dec': 11
    };

    const textNamed = text.toLowerCase().replace(/,/g, '');
    const namedMatch = textNamed.match(/^(\d{1,2})[\s\-]+([a-z]+)[\s\-]+(\d{4})/);
    if (namedMatch && monthNames[namedMatch[2]] !== undefined) {
        return new Date(Number(namedMatch[3]), monthNames[namedMatch[2]], Number(namedMatch[1]), 0, 0, 0, 0);
    }

    // 4. Fallback Date
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function getOverdueRecords(allRecords, finePerDay) {
    const dayStart = date => {
        if (!date) return null;
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    };
    const now = new Date();
    const today = dayStart(now);

    // Muat denda yang sudah terkunci di localStorage
    let lockedFines = {};
    try {
        const raw = localStorage.getItem('siempus_locked_final_fines');
        if (raw && (raw.includes('1111') || raw.includes('.'))) {
            localStorage.removeItem('siempus_locked_final_fines');
        } else if (raw) {
            lockedFines = JSON.parse(raw);
        }
    } catch (_) {}

    const lateRecords = [];
    let updatedLocked = false;
    // Default tarif denda per hari (1000 atau 500)
    const rate = Number(finePerDay) > 0 ? Number(finePerDay) : 1000;

    allRecords.forEach(row => {
        const status = String(row.status || '-');
        const statusLower = status.toLowerCase();
        const isReturned = statusLower.includes('kembali');
        const dueDate = parseLateDateHelper(row.tglTempo);
        const returnDate = isReturned ? parseLateDateHelper(row.tglKembali) : null;

        // Hitung hari keterlambatan berdasarkan patokan jam 12 malam (00:00:00)
        // Misal tempo tanggal 9 Okt, maka lewat jam 00 masuk tanggal 10 Okt langsung terhitung 1 hari.
        let lateDays = 0;
        if (isReturned) {
            if (dueDate && returnDate && returnDate.getTime() > dueDate.getTime()) {
                lateDays = Math.round((returnDate.getTime() - dueDate.getTime()) / 86400000);
            } else if (Number(row.denda) > 0 && rate > 0) {
                lateDays = Math.max(1, Math.round(Number(row.denda) / rate));
            }
        } else {
            // Belum dikembalikan (masih dipinjam): bandingkan hari ini jam 00:00 dengan tempo jam 00:00
            if (dueDate && today.getTime() > dueDate.getTime()) {
                lateDays = Math.round((today.getTime() - dueDate.getTime()) / 86400000);
            }
        }

        const hasRecordedFine = Number(row.denda) > 0;
        if (lateDays <= 0 && !hasRecordedFine) {
            return; // Bukan keterlambatan
        }

        const trxKey = String(row.idTrx || `${row.idAnggota}_${row.kodeBuku}_${row.tglPinjam}`);
        let fineAmount = 0;
        let isFinal = false;
        let dailyRate = rate;

        if (isReturned) {
            // SUDAH DIKEMBALIKAN = FINAL!
            isFinal = true;

            // Prioritas 1: Ambil dari saved locked jika nilainya bulat & valid
            const savedLock = lockedFines[trxKey];
            if (savedLock && typeof savedLock === 'object' && savedLock.dailyRate && savedLock.dailyRate > 0 && savedLock.dailyRate % 1 === 0) {
                dailyRate = savedLock.dailyRate;
                fineAmount = savedLock.fineAmount || (lateDays * dailyRate);
            } else if (hasRecordedFine) {
                const recFine = Number(row.denda);
                // Jika denda tercatat habis dibagi hari keterlambatan dan hasilnya bulat (misal 500, 1000)
                if (lateDays > 0 && recFine % lateDays === 0) {
                    dailyRate = recFine / lateDays;
                    fineAmount = recFine;
                } else {
                    // Denda HARUS mengikuti jumlah hari x tarif per hari! Tidak boleh dibagi jadi pecahan (seperti 1.111)
                    dailyRate = rate;
                    fineAmount = lateDays * dailyRate;
                }
                lockedFines[trxKey] = { fineAmount: fineAmount, dailyRate: dailyRate, lateDays: lateDays };
                updatedLocked = true;
            } else {
                dailyRate = rate;
                fineAmount = lateDays * dailyRate;
                lockedFines[trxKey] = { fineAmount: fineAmount, dailyRate: dailyRate, lateDays: lateDays };
                updatedLocked = true;
            }
        } else {
            // MASIH DIPINJAM = BELUM FINAL (berjalan dinamis setiap hari melewati jam 00:00)
            isFinal = false;
            dailyRate = rate;
            fineAmount = lateDays * dailyRate;
        }

        let returnDateObj = null;
        let returnYear = null;
        let returnMonth = null;
        if (isReturned && row.tglKembali) {
            returnDateObj = parseLateDateHelper(row.tglKembali);
            if (returnDateObj) {
                returnYear = returnDateObj.getFullYear();
                returnMonth = returnDateObj.getMonth() + 1; // 1 to 12
            }
        }

        lateRecords.push({
            idTrx: row.idTrx || trxKey,
            idAnggota: String(row.idAnggota || '-'),
            namaAnggota: String(row.namaAnggota || '-'),
            hpAnggota: String(row.hpAnggota || ''),
            kodeBuku: String(row.kodeBuku || '-'),
            judulBuku: String(row.judulBuku || '-'),
            tglPinjam: String(row.tglPinjam || '-'),
            tglTempo: String(row.tglTempo || '-'),
            tglKembali: isReturned ? String(row.tglKembali || '-') : '-',
            returnDateObj: returnDateObj,
            returnYear: returnYear,
            returnMonth: returnMonth,
            statusRaw: status,
            isReturned: isReturned,
            isFinal: isFinal,
            lateDays: lateDays,
            dailyRate: dailyRate,
            fineAmount: fineAmount,
            petugas: String(row.petugas || '-')
        });
    });

    if (updatedLocked) {
        try {
            localStorage.setItem('siempus_locked_final_fines', JSON.stringify(lockedFines));
        } catch (_) {}
    }

    // Urutkan: Belum Final (berjalan) di atas, lalu berdasarkan hari terlambat terbesar
    lateRecords.sort((a, b) => {
        if (a.isFinal !== b.isFinal) return a.isFinal ? 1 : -1;
        return b.lateDays - a.lateDays;
    });

    return lateRecords;
}

function updateLateYearOptions() {
    const yearSelect = document.getElementById('filterYearTerlambat');
    if (!yearSelect) return;

    const currentSelected = yearSelect.value;
    const yearSet = new Set();

    lateAllData.forEach(item => {
        if (item.returnYear && !isNaN(item.returnYear)) {
            yearSet.add(Number(item.returnYear));
        }
    });

    // Tambahkan tahun saat ini jika kosong
    const currentYear = new Date().getFullYear();
    yearSet.add(currentYear);

    const sortedYears = Array.from(yearSet).sort((a, b) => b - a);

    let html = '<option value="">Semua Tahun</option>';
    sortedYears.forEach(yr => {
        html += `<option value="${yr}">${yr}</option>`;
    });

    yearSelect.innerHTML = html;
    if (currentSelected && yearSet.has(Number(currentSelected))) {
        yearSelect.value = currentSelected;
    } else {
        yearSelect.value = '';
    }
}

function loadRekapTerlambat() {
    const tbody = document.getElementById('terlambat-list-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Memuat data keterlambatan...</td></tr>';
    }

    google.script.run
        .withFailureHandler(err => {
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Gagal memuat data keterlambatan. Silakan muat ulang.</td></tr>';
            }
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            const rawData = (res && res.data) ? res.data : [];
            const fineRate = Number(res?.finePerDay) > 0 ? Number(res.finePerDay) : 1000;
            lateAllData = getOverdueRecords(rawData, fineRate);

            // Perbarui Filter Tahun dari data transaksi
            updateLateYearOptions();

            // Perbarui Statistik Ringkasan Denda (Semua Data)
            let totalFinal = 0;
            let totalBerjalan = 0;
            let countFinal = 0;
            let countBerjalan = 0;

            lateAllData.forEach(item => {
                if (item.isFinal) {
                    totalFinal += item.fineAmount;
                    countFinal++;
                } else {
                    totalBerjalan += item.fineAmount;
                    countBerjalan++;
                }
            });

            const statFinalEl = document.getElementById('stat-denda-final');
            const statFinalCountEl = document.getElementById('stat-count-final');
            const statBerjalanEl = document.getElementById('stat-denda-berjalan');
            const statBerjalanCountEl = document.getElementById('stat-count-berjalan');
            const statTotalEl = document.getElementById('stat-total-terlambat');
            const statTotalUangEl = document.getElementById('stat-total-uang');

            if (statFinalEl) statFinalEl.innerText = 'Rp ' + totalFinal.toLocaleString('id-ID');
            if (statFinalCountEl) statFinalCountEl.innerText = `${countFinal} transaksi sudah selesai`;
            if (statBerjalanEl) statBerjalanEl.innerText = 'Rp ' + totalBerjalan.toLocaleString('id-ID');
            if (statBerjalanCountEl) statBerjalanCountEl.innerText = `${countBerjalan} buku masih dipinjam`;
            if (statTotalEl) statTotalEl.innerText = `${lateAllData.length} Kasus`;
            if (statTotalUangEl) statTotalUangEl.innerText = `Total Akumulasi: Rp ${(totalFinal + totalBerjalan).toLocaleString('id-ID')}`;

            filterRekapTerlambat();
        })
        .getHistoryList(1, 100000, '', false, '', '', '', true);
}

function filterRekapTerlambat() {
    const q = (document.getElementById('searchRekapTerlambat')?.value || '').trim().toLowerCase();
    const statusFilter = document.getElementById('filterStatusTerlambat')?.value || '';
    const yearFilter = document.getElementById('filterYearTerlambat')?.value || '';
    const monthFilter = document.getElementById('filterMonthTerlambat')?.value || '';

    lateFilteredData = lateAllData.filter(item => {
        // Filter Tahun Berdasarkan Tanggal Kembali
        if (yearFilter) {
            if (!item.returnYear || String(item.returnYear) !== String(yearFilter)) return false;
        }

        // Filter Bulan Berdasarkan Tanggal Kembali (1 - 12)
        if (monthFilter) {
            if (!item.returnMonth || String(item.returnMonth) !== String(monthFilter)) return false;
        }

        // Filter Status
        if (statusFilter === 'final' && !item.isFinal) return false;
        if (statusFilter === 'unfinal' && item.isFinal) return false;

        // Pencarian Teks
        if (q) {
            const matchQ = (item.namaAnggota || '').toLowerCase().includes(q) ||
                (item.idAnggota || '').toLowerCase().includes(q) ||
                (item.judulBuku || '').toLowerCase().includes(q) ||
                (item.kodeBuku || '').toLowerCase().includes(q);
            if (!matchQ) return false;
        }
        return true;
    });

    // Hitung Denda Final pada data yang terfilter (hanya yang sudah FINAL)
    let filteredFinalTotal = 0;
    let filteredFinalCount = 0;
    lateFilteredData.forEach(item => {
        if (item.isFinal) {
            filteredFinalTotal += item.fineAmount;
            filteredFinalCount++;
        }
    });

    const filterDendaEl = document.getElementById('filter-denda-final-display');
    const filterCountEl = document.getElementById('filter-count-final-display');
    if (filterDendaEl) filterDendaEl.innerText = 'Rp ' + filteredFinalTotal.toLocaleString('id-ID');
    if (filterCountEl) filterCountEl.innerText = `${filteredFinalCount} Transaksi Selesai`;

    latePage = 1;
    renderRekapTerlambat();
}

function changeLimitRekapTerlambat(val) {
    lateLimit = parseInt(val, 10) || 10;
    latePage = 1;
    renderRekapTerlambat();
}

function changePageRekapTerlambat(page) {
    const totalPages = Math.ceil(lateFilteredData.length / lateLimit) || 1;
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    latePage = page;
    renderRekapTerlambat();
}

function renderRekapTerlambat() {
    const tbody = document.getElementById('terlambat-list-body');
    if (!tbody) return;

    if (!lateFilteredData || lateFilteredData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted fst-italic"><i class="fas fa-check-circle text-success me-2"></i>Tidak ada data keterlambatan yang ditemukan sesuai filter.</td></tr>';
        const infoEl = document.getElementById('rekap-terlambat-page-info');
        if (infoEl) infoEl.innerText = 'Menampilkan 0-0 dari 0 data';
        const pagEl = document.getElementById('rekap-terlambat-pagination');
        if (pagEl) pagEl.innerHTML = '';
        return;
    }

    const total = lateFilteredData.length;
    const totalPages = Math.ceil(total / lateLimit) || 1;
    if (latePage > totalPages) latePage = totalPages;

    const startIdx = (latePage - 1) * lateLimit;
    const endIdx = Math.min(startIdx + lateLimit, total);
    const pageItems = lateFilteredData.slice(startIdx, endIdx);

    tbody.innerHTML = '';
    pageItems.forEach((row, i) => {
        const no = startIdx + i + 1;
        const namaAnggota = escapeCatalogHtml(row.namaAnggota);
        const idAnggota = escapeCatalogHtml(row.idAnggota);
        const judulBuku = escapeCatalogHtml(row.judulBuku);
        const kodeBuku = escapeCatalogHtml(row.kodeBuku);
        const tglPinjam = escapeCatalogHtml(formatSimpleDate(row.tglPinjam));
        const tglTempo = escapeCatalogHtml(formatSimpleDate(row.tglTempo));
        const tglKembali = row.isFinal ? escapeCatalogHtml(formatSimpleDate(row.tglKembali)) : '<span class="badge bg-light text-muted border">Masih Dipinjam</span>';

        const badgeTerlambat = `
            <div class="text-center" style="line-height: 1.25;">
                <div class="fw-bold text-danger text-nowrap">${row.lateDays} Hari</div>
                <div class="small text-muted text-nowrap" style="font-size: 11px;">x Rp. ${Number(row.dailyRate || 500).toLocaleString('id-ID')}</div>
            </div>
        `;
        const dendaFormatted = `<span class="fw-bold ${row.isFinal ? 'text-success' : 'text-danger'}">Rp ${Number(row.fineAmount).toLocaleString('id-ID')}</span>`;

        const badgeStatus = row.isFinal
            ? `<span class="badge bg-success rounded-pill px-2 py-1"><i class="fas fa-check-circle me-1"></i>Final</span>`
            : `<span class="badge bg-warning text-dark rounded-pill px-2 py-1"><i class="fas fa-hourglass-half me-1"></i>Belum Final</span>`;

        let btnWA = '-';
        if (!row.isFinal && String(row.hpAnggota || '').replace(/\D/g, '').length > 5) {
            let hp = String(row.hpAnggota).replace(/\D/g, '');
            if (hp.startsWith('0')) hp = '62' + hp.substring(1);
            const msg = `Halo *${row.namaAnggota}*,\n\nKami dari Perpustakaan mengingatkan peminjaman buku:\n📚 Judul: *${row.judulBuku}*\n📅 Jatuh Tempo: *${row.tglTempo}*\n⏳ Terlambat: *${row.lateDays} Hari*\n💰 Estimasi Denda Berjalan: *Rp ${Number(row.fineAmount).toLocaleString('id-ID')}*\n\nStatus: *BELUM DIKEMBALIKAN*. Mohon segera mengembalikan buku ke perpustakaan.\nTerima kasih.`;
            btnWA = `<a href="https://wa.me/${encodeURIComponent(hp)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-success rounded-circle shadow-xs" style="width:30px;height:30px;padding:0;line-height:28px;" title="Kirim Pengingat WhatsApp"><i class="fab fa-whatsapp"></i></a>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="text-center small text-muted">${no}</td>
            <td>
                <div class="fw-bold text-primary">${namaAnggota}</div>
                <div class="small text-muted" style="font-size:11px;">${idAnggota}</div>
            </td>
            <td>
                <div class="fw-bold text-dark text-truncate" style="max-width:180px;" title="${judulBuku}">${judulBuku}</div>
                <div class="small text-muted" style="font-size:11px;">${kodeBuku}</div>
            </td>
            <td style="line-height:1.2;">
                <small class="d-block text-muted">Pinjam: ${tglPinjam}</small>
                <small class="d-block text-danger fw-bold">Tempo: ${tglTempo}</small>
            </td>
            <td>${tglKembali}</td>
            <td class="text-center">${badgeTerlambat}</td>
            <td class="text-end">${dendaFormatted}</td>
            <td class="text-center">${badgeStatus}</td>
            <td class="text-center">${btnWA}</td>
        `;
        tbody.appendChild(tr);
    });

    // Perbarui label info halaman
    const infoEl = document.getElementById('rekap-terlambat-page-info');
    if (infoEl) {
        infoEl.innerText = `Menampilkan ${startIdx + 1}-${endIdx} dari ${total} data`;
    }

    // Bangun tombol navigasi pagination
    const pagEl = document.getElementById('rekap-terlambat-pagination');
    if (pagEl) {
        let pagHtml = '';
        pagHtml += `<button class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0" ${latePage <= 1 ? 'disabled' : ''} onclick="changePageRekapTerlambat(${latePage - 1})"><i class="fas fa-chevron-left"></i></button>`;

        let startP = Math.max(1, latePage - 2);
        let endP = Math.min(totalPages, startP + 4);
        if (endP - startP < 4) {
            startP = Math.max(1, endP - 4);
        }

        for (let p = startP; p <= endP; p++) {
            const isAct = p === latePage ? 'btn-primary text-white' : 'btn-outline-light text-dark border';
            pagHtml += `<button class="btn btn-sm ${isAct} rounded-circle px-0" style="width:28px;height:28px;line-height:26px;font-size:11px;" onclick="changePageRekapTerlambat(${p})">${p}</button>`;
        }

        pagHtml += `<button class="btn btn-sm btn-outline-secondary rounded-pill px-2 py-0" ${latePage >= totalPages ? 'disabled' : ''} onclick="changePageRekapTerlambat(${latePage + 1})"><i class="fas fa-chevron-right"></i></button>`;
        pagEl.innerHTML = pagHtml;
    }
}

function getLateFilterPeriodText() {
    const yearVal = document.getElementById('filterYearTerlambat')?.value || '';
    const monthVal = document.getElementById('filterMonthTerlambat')?.value || '';
    const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    if (monthVal && yearVal) {
        return `Bulan ${monthNames[Number(monthVal)]} ${yearVal}`;
    } else if (monthVal) {
        return `Bulan ${monthNames[Number(monthVal)]} (Semua Tahun)`;
    } else if (yearVal) {
        return `Tahun ${yearVal} (Semua Bulan)`;
    }
    return 'Semua Periode';
}

function previewRekapTerlambatModal() {
    if (!lateFilteredData || lateFilteredData.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data keterlambatan yang sesuai dengan filter saat ini.', 'warning');
        return;
    }

    const schoolName = getHistoryExportSchoolName();
    const previewLimit = 300;
    const previewRows = lateFilteredData.slice(0, previewLimit);
    const hasMoreRows = lateFilteredData.length > previewLimit;
    const filterPeriod = getLateFilterPeriodText();

    let totalFinal = 0;
    let totalBerjalan = 0;
    let countFinal = 0;
    let countBerjalan = 0;

    lateFilteredData.forEach(r => {
        if (r.isFinal) {
            totalFinal += r.fineAmount;
            countFinal++;
        } else {
            totalBerjalan += r.fineAmount;
            countBerjalan++;
        }
    });

    Swal.fire({
        title: 'Pratinjau Rekap Keterlambatan',
        width: '94vw',
        html: `
            <div class="text-center mb-2">
                <div class="fw-bold text-danger fs-6">REKAPITULASI KETERLAMBATAN & DENDA PERPUSTAKAAN</div>
                <div class="small fw-semibold text-secondary">${escapeCatalogHtml(schoolName)}</div>
                <div class="badge bg-light text-dark border mt-1">Periode Tanggal Kembali: ${filterPeriod}</div>
            </div>

            <!-- Ringkasan Cepat -->
            <div class="row g-2 mb-2 text-start">
                <div class="col-6 col-md-4">
                    <div class="p-2 border rounded bg-success bg-opacity-10 border-success">
                        <small class="text-success fw-bold d-block" style="font-size:10.5px;">TOTAL DENDA FINAL</small>
                        <strong class="text-success fs-6">Rp ${totalFinal.toLocaleString('id-ID')}</strong>
                        <small class="d-block text-muted" style="font-size:10px;">${countFinal} transaksi selesai</small>
                    </div>
                </div>
                <div class="col-6 col-md-4">
                    <div class="p-2 border rounded bg-warning bg-opacity-10 border-warning">
                        <small class="text-warning-emphasis fw-bold d-block" style="font-size:10.5px;">POTENSI BERJALAN</small>
                        <strong class="text-warning-emphasis fs-6">Rp ${totalBerjalan.toLocaleString('id-ID')}</strong>
                        <small class="d-block text-muted" style="font-size:10px;">${countBerjalan} belum kembali</small>
                    </div>
                </div>
                <div class="col-12 col-md-4">
                    <div class="p-2 border rounded bg-primary bg-opacity-10 border-primary">
                        <small class="text-primary fw-bold d-block" style="font-size:10.5px;">TOTAL AKUMULASI</small>
                        <strong class="text-primary fs-6">Rp ${(totalFinal + totalBerjalan).toLocaleString('id-ID')}</strong>
                        <small class="d-block text-muted" style="font-size:10px;">${lateFilteredData.length} total kasus</small>
                    </div>
                </div>
            </div>

            <!-- Toolbar Kontrol -->
            <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                <button type="button" id="latePreviewZoomOut" class="btn btn-sm btn-outline-secondary" title="Perkecil"><i class="fas fa-search-minus"></i></button>
                <span id="latePreviewZoomLabel" class="small text-muted fw-bold">100%</span>
                <button type="button" id="latePreviewZoomIn" class="btn btn-sm btn-outline-secondary" title="Perbesar"><i class="fas fa-search-plus"></i></button>
                <span class="small text-muted ms-auto"><i class="fas fa-list me-1"></i>${lateFilteredData.length.toLocaleString('id-ID')} baris data</span>
                <button type="button" id="latePreviewPrint" class="btn btn-sm btn-outline-primary fw-bold"><i class="fas fa-print me-1"></i> Cetak</button>
                <button type="button" id="latePreviewDownload" class="btn btn-sm btn-success fw-bold"><i class="fas fa-download me-1"></i> Unduh Excel</button>
            </div>

            <!-- Frame Pratinjau Tabel -->
            <div id="latePreviewFrame" class="border rounded text-start" style="height:52vh;overflow:auto;background:#fff;">
                <div id="latePreviewScale" style="width:max-content;min-width:100%;">
                    <table class="table table-sm table-striped table-bordered mb-0 small align-middle">
                        <thead class="table-light sticky-top">
                            <tr class="text-nowrap small text-muted text-center">
                                <th style="width:35px;">No</th>
                                <th>Peminjam</th>
                                <th>Buku</th>
                                <th>Pinjam & Tempo</th>
                                <th>Tgl Kembali</th>
                                <th>Terlambat / Tarif</th>
                                <th class="text-end">Denda</th>
                                <th>Status</th>
                                <th>Petugas</th>
                            </tr>
                        </thead>
                        <tbody id="latePreviewTableBody"></tbody>
                        <tfoot class="table-light fw-bold">
                            <tr>
                                <td colspan="6" class="text-end">TOTAL KESELURUHAN:</td>
                                <td class="text-end text-danger">Rp ${(totalFinal + totalBerjalan).toLocaleString('id-ID')}</td>
                                <td colspan="2" class="text-center small text-muted">Final: Rp ${totalFinal.toLocaleString('id-ID')}</td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
            <div class="small text-muted text-start mt-2">
                ${hasMoreRows ? `<i class="fas fa-info-circle me-1"></i>Pratinjau menampilkan ${previewLimit} baris pertama. Tombol Cetak dan Unduh Excel akan memuat seluruh ${lateFilteredData.length.toLocaleString('id-ID')} data.` : '<i class="fas fa-check-circle text-success me-1"></i>Pratinjau menampilkan seluruh data yang sesuai filter.'}
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        didOpen: () => {
            const tbody = document.getElementById('latePreviewTableBody');
            if (tbody) {
                previewRows.forEach((r, idx) => {
                    const tr = document.createElement('tr');
                    const badgeStatus = r.isFinal
                        ? '<span class="badge bg-success rounded-pill px-2 py-0">Final</span>'
                        : '<span class="badge bg-warning text-dark rounded-pill px-2 py-0">Belum Final</span>';
                    tr.innerHTML = `
                        <td class="text-center text-muted">${idx + 1}</td>
                        <td>
                            <strong>${escapeCatalogHtml(r.namaAnggota)}</strong>
                            <div class="small text-muted" style="font-size:10.5px;">${escapeCatalogHtml(r.idAnggota)}</div>
                        </td>
                        <td>
                            <div class="text-truncate" style="max-width:200px;" title="${escapeCatalogHtml(r.judulBuku)}"><strong>${escapeCatalogHtml(r.judulBuku)}</strong></div>
                            <div class="small text-muted" style="font-size:10.5px;">${escapeCatalogHtml(r.kodeBuku)}</div>
                        </td>
                        <td class="small" style="line-height:1.2;">
                            <span class="text-muted">P: ${escapeCatalogHtml(formatSimpleDate(r.tglPinjam))}</span><br>
                            <span class="text-danger fw-bold">T: ${escapeCatalogHtml(formatSimpleDate(r.tglTempo))}</span>
                        </td>
                        <td class="text-center">${r.isFinal ? escapeCatalogHtml(formatSimpleDate(r.tglKembali)) : '<em class="text-muted">Dipinjam</em>'}</td>
                        <td class="text-center" style="line-height: 1.25;">
                            <div class="fw-bold text-danger text-nowrap">${r.lateDays} Hari</div>
                            <div class="small text-muted text-nowrap" style="font-size: 10.5px;">x Rp. ${Number(r.dailyRate || 500).toLocaleString('id-ID')}</div>
                        </td>
                        <td class="text-end fw-bold ${r.isFinal ? 'text-success' : 'text-danger'}">
                            Rp ${Number(r.fineAmount).toLocaleString('id-ID')}
                        </td>
                        <td class="text-center">${badgeStatus}</td>
                        <td class="small text-muted">${escapeCatalogHtml(r.petugas || '-')}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }

            // Zoom logic
            let zoom = 1;
            const scale = document.getElementById('latePreviewScale');
            const zoomLabel = document.getElementById('latePreviewZoomLabel');
            const setZoom = nextZoom => {
                zoom = Math.max(0.6, Math.min(1.6, nextZoom));
                scale.style.zoom = String(zoom);
                if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
            };
            document.getElementById('latePreviewZoomOut')?.addEventListener('click', () => setZoom(zoom - 0.1));
            document.getElementById('latePreviewZoomIn')?.addEventListener('click', () => setZoom(zoom + 0.1));

            // Unduh Excel
            document.getElementById('latePreviewDownload')?.addEventListener('click', () => {
                exportRekapTerlambatExcel();
            });

            // Cetak
            document.getElementById('latePreviewPrint')?.addEventListener('click', () => {
                printRekapTerlambat();
            });
        }
    });
}

function exportRekapTerlambatExcel() {
    if (!lateFilteredData || lateFilteredData.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data keterlambatan untuk diekspor.', 'warning');
        return;
    }

    const schoolName = getHistoryExportSchoolName();
    const filterPeriod = getLateFilterPeriodText();
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SiE-MPuS';
    workbook.created = new Date();
    const worksheet = workbook.addWorksheet('Rekap Keterlambatan', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });

    const headers = ['No', 'ID / NISN', 'Nama Peminjam', 'Kode Buku', 'Judul Buku', 'Tgl Pinjam', 'Jatuh Tempo', 'Tgl Kembali', 'Tarif / Hari (Rp)', 'Terlambat (Hari)', 'Denda (Rp)', 'Status Denda', 'Petugas'];
    const columnWidths = [6, 16, 26, 16, 36, 14, 14, 14, 16, 16, 18, 16, 18];
    worksheet.columns = headers.map((header, index) => ({ header, width: columnWidths[index] || 16 }));

    worksheet.mergeCells(1, 1, 1, headers.length);
    worksheet.getCell('A1').value = 'REKAPITULASI KETERLAMBATAN & DENDA PERPUSTAKAAN';
    worksheet.getCell('A1').font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF991B1B' } };
    worksheet.getRow(1).height = 28;

    worksheet.mergeCells(2, 1, 2, headers.length);
    worksheet.getCell('A2').value = `${schoolName} - Periode Kembali: ${filterPeriod} - Tanggal: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    worksheet.getCell('A2').font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
    worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
    worksheet.getRow(2).height = 22;
    worksheet.getRow(3).height = 8;

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell(cell => {
        cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE123C' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    let totalDendaFinal = 0;
    let totalDendaBerjalan = 0;

    lateFilteredData.forEach((row, idx) => {
        if (row.isFinal) totalDendaFinal += row.fineAmount;
        else totalDendaBerjalan += row.fineAmount;

        const rowValues = [
            idx + 1,
            row.idAnggota,
            row.namaAnggota,
            row.kodeBuku,
            row.judulBuku,
            formatSimpleDate(row.tglPinjam),
            formatSimpleDate(row.tglTempo),
            row.isFinal ? formatSimpleDate(row.tglKembali) : 'Masih Dipinjam',
            row.dailyRate || 500,
            row.lateDays,
            row.fineAmount,
            row.isFinal ? 'Final (Selesai)' : 'Belum Final (Berjalan)',
            row.petugas
        ];
        const excelRow = worksheet.addRow(rowValues);
        excelRow.height = 20;
        excelRow.eachCell((cell, colNum) => {
            cell.font = { name: 'Arial', size: 10 };
            cell.alignment = { vertical: 'middle', wrapText: colNum === 3 || colNum === 5 };
            if (idx % 2 === 1) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDF2F4' } };
            }
        });

        // Format kolom Tarif, Terlambat, dan Denda
        excelRow.getCell(9).alignment = { horizontal: 'center', vertical: 'middle' };
        excelRow.getCell(9).numFmt = '"Rp" #,##0';
        excelRow.getCell(10).alignment = { horizontal: 'center', vertical: 'middle' };
        excelRow.getCell(10).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        excelRow.getCell(11).numFmt = '"Rp" #,##0';
        excelRow.getCell(11).font = { name: 'Arial', size: 10, bold: true };
        excelRow.getCell(12).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Baris Total
    const totalRow = worksheet.addRow(['', '', '', '', 'TOTAL KESELURUHAN', '', '', '', '', '', totalDendaFinal + totalDendaBerjalan, '', '']);
    totalRow.height = 24;
    totalRow.getCell(5).font = { name: 'Arial', size: 10, bold: true };
    totalRow.getCell(11).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF991B1B' } };
    totalRow.getCell(11).numFmt = '"Rp" #,##0';
    totalRow.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
    });

    const border = { style: 'thin', color: { argb: 'FFD1D5DB' } };
    for (let r = 4; r <= worksheet.rowCount; r++) {
        worksheet.getRow(r).eachCell({ includeEmpty: true }, cell => {
            cell.border = { top: border, left: border, bottom: border, right: border };
        });
    }

    workbook.xlsx.writeBuffer().then(buffer => {
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Rekap_Keterlambatan_Denda_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

function printRekapTerlambat() {
    if (!lateFilteredData || lateFilteredData.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data keterlambatan untuk dicetak.', 'warning');
        return;
    }

    const schoolName = getHistoryExportSchoolName();
    const filterPeriod = getLateFilterPeriodText();
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        Swal.fire('Cetak Terblokir', 'Izinkan pop-up / jendela cetak pada browser Anda.', 'warning');
        return;
    }

    let totalDendaFinal = 0;
    let totalDendaBerjalan = 0;
    lateFilteredData.forEach(r => {
        if (r.isFinal) totalDendaFinal += r.fineAmount;
        else totalDendaBerjalan += r.fineAmount;
    });

    let rowsHtml = '';
    lateFilteredData.forEach((r, i) => {
        rowsHtml += `
            <tr>
                <td style="text-align:center;">${i + 1}</td>
                <td><strong>${escapeCatalogHtml(r.namaAnggota)}</strong><br><small style="color:#666;">${escapeCatalogHtml(r.idAnggota)}</small></td>
                <td><strong>${escapeCatalogHtml(r.judulBuku)}</strong><br><small style="color:#666;">${escapeCatalogHtml(r.kodeBuku)}</small></td>
                <td>Pinjam: ${escapeCatalogHtml(formatSimpleDate(r.tglPinjam))}<br><span style="color:#dc2626;font-weight:bold;">Tempo: ${escapeCatalogHtml(formatSimpleDate(r.tglTempo))}</span></td>
                <td>${r.isFinal ? escapeCatalogHtml(formatSimpleDate(r.tglKembali)) : '<em>Masih Dipinjam</em>'}</td>
                <td style="text-align:center;line-height:1.25;">
                    <strong style="color:#dc2626;font-size:12px;">${r.lateDays} Hari</strong><br>
                    <small style="color:#666;font-size:10px;">x Rp. ${Number(r.dailyRate || 500).toLocaleString('id-ID')}</small>
                </td>
                <td style="text-align:right;font-weight:bold;">Rp ${Number(r.fineAmount).toLocaleString('id-ID')}</td>
                <td style="text-align:center;">${r.isFinal ? '<span style="color:#16a34a;font-weight:bold;">Final</span>' : '<span style="color:#d97706;font-weight:bold;">Belum Final</span>'}</td>
            </tr>
        `;
    });

    printWindow.document.open();
    printWindow.document.write(`<!doctype html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Rekap Keterlambatan dan Denda</title>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; font-size: 11px; }
            h2, h4, p { text-align: center; margin: 4px 0; }
            .stat-box { display: flex; justify-content: space-around; margin: 15px 0; border: 1px solid #ccc; padding: 10px; background: #f9f9f9; }
            .stat-item { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th, td { border: 1px solid #777; padding: 6px; text-align: left; vertical-align: top; }
            th { background: #fee2e2; }
            thead { display: table-header-group; }
            tr { break-inside: avoid; }
            @page { size: landscape; margin: 12mm; }
        </style>
    </head>
    <body>
        <h2>REKAPITULASI DATA KETERLAMBATAN & DENDA PERPUSTAKAAN</h2>
        <h4>${escapeCatalogHtml(schoolName)}</h4>
        <p>Periode Tanggal Kembali: <strong>${filterPeriod}</strong> | Dicetak pada: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <div class="stat-box">
            <div class="stat-item">
                <span style="color:#666;">Kas Masuk (Denda Final):</span><br>
                <strong style="color:#16a34a;font-size:13px;">Rp ${totalDendaFinal.toLocaleString('id-ID')}</strong>
            </div>
            <div class="stat-item">
                <span style="color:#666;">Potensi Denda Berjalan:</span><br>
                <strong style="color:#d97706;font-size:13px;">Rp ${totalDendaBerjalan.toLocaleString('id-ID')}</strong>
            </div>
            <div class="stat-item">
                <span style="color:#666;">Total Kasus Terlambat:</span><br>
                <strong style="color:#2563eb;font-size:13px;">${lateFilteredData.length} Kasus</strong>
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th style="width:30px;text-align:center;">No</th>
                    <th>Peminjam</th>
                    <th>Buku</th>
                    <th>Pinjam & Tempo</th>
                    <th>Tgl Kembali</th>
                    <th style="text-align:center;">Terlambat / Tarif</th>
                    <th style="text-align:right;">Denda</th>
                    <th style="text-align:center;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${rowsHtml}
            </tbody>
            <tfoot>
                <tr style="background:#fee2e2;font-weight:bold;">
                    <td colspan="6" style="text-align:right;">TOTAL KESELURUHAN:</td>
                    <td style="text-align:right;">Rp ${(totalDendaFinal + totalDendaBerjalan).toLocaleString('id-ID')}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
    </body>
    </html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
}


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
                    const bgDisplay = /^data:image\//i.test(String(cfg.UrlBackground || ''))
                        ? cfg.UrlBackground
                        : (localBg || cfg.UrlBackground || '');
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
                    const hashHint = document.getElementById('passwordHashHint');
                    const execLinkCard = document.getElementById('execLinkCard');
                    const passwordLabel = document.getElementById('passwordLabel');
                    if (hashHint) {
                        hashHint.textContent = 'Masukkan password baru. Server memberi salt dan mengubahnya menjadi SHA-256 sebelum disimpan.';
                        hashHint.style.display = window.isElectron ? 'none' : 'block';
                    }
                    if (execLinkCard) execLinkCard.style.display = window.isElectron ? 'block' : 'none';
                    if (passwordLabel) passwordLabel.textContent = window.isElectron ? 'Password Offline (Read Only)' : 'Password Baru';
                    if (window.isElectron) {
                        let cfg = window.electronAPI ? window.electronAPI.getConfig() : window.APP_CONFIG;
                        let offUserDisplay = cfg ? (cfg.admin?.username || cfg.OFFLINE_ADMIN_USER || '') : '';
                        let offPassDisplay = cfg ? (cfg.admin?.password || cfg.OFFLINE_ADMIN_PASS || '') : '';
                        if (document.getElementById('offlineUserDisplay')) document.getElementById('offlineUserDisplay').value = offUserDisplay;
                        if (document.getElementById('offlinePassDisplay')) {
                            document.getElementById('offlinePassDisplay').value = offPassDisplay;
                            document.getElementById('offlinePassDisplay').readOnly = true;
                            document.getElementById('offlinePassDisplay').type = 'password';
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
                    const passwordEye = document.getElementById('accountPasswordEye');
                    const passwordEyeButton = document.getElementById('toggleAccountPassword');
                    if (passwordEye) {
                        passwordEye.classList.remove('fa-eye-slash');
                        passwordEye.classList.add('fa-eye');
                    }
                    if (passwordEyeButton) {
                        passwordEyeButton.setAttribute('aria-label', 'Tampilkan password');
                        passwordEyeButton.setAttribute('aria-pressed', 'false');
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
    const existingLogo = document.getElementById('cfgLogo')?.value || '';
    const existingLogoInstansi = document.getElementById('cfgLogoInstansi')?.value || '';
    const existingBackground = document.getElementById('cfgBg')?.value || '';
    const isBase64Image = value => /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);

    // 2. Tarik data dari form dengan aman
    const data = {
        namaSekolah: document.getElementById('cfgNama')?.value || '',
        namaInstansi: document.getElementById('cfgInstansi')?.value || '',
        alamatSekolah: document.getElementById('cfgAlamat')?.value || '',
        urlLogo: isBase64Image(existingLogo) ? '' : existingLogo,
        urlLogoInstansi: isBase64Image(existingLogoInstansi) ? '' : existingLogoInstansi,
        urlBg: isBase64Image(existingBackground) ? '' : existingBackground,
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
    if (bgVal || logoVal || logoInstansiVal) desc = 'Menyimpan gambar Base64 ke spreadsheet...';

    showSmartLoading('Menyimpan Pengaturan...', desc);

    google.script.run
        .withFailureHandler(err => {
            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
            handleNetworkError(err);
        })
        .withSuccessHandler(res => {
            if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
            if (res.status) {
                // Cache konfigurasi kecil di localStorage; gambar besar disimpan terpisah di SQLite/browser cache.
                if (logoVal) localStorage.setItem('offline_logo_base64', logoVal);
                if (logoInstansiVal) localStorage.setItem('offline_logoinstansi_base64', logoInstansiVal);
                
                // Simpan snapshot pengaturan offline lengkap
                const currentSavedCfg = {
                    NamaSekolah: data.namaSekolah,
                    NamaInstansi: data.namaInstansi,
                    AlamatSekolah: data.alamatSekolah,
                    UrlLogo: logoVal || data.urlLogo || existingLogo,
                    UrlLogoInstansi: logoInstansiVal || data.urlLogoInstansi || existingLogoInstansi,
                    UrlBackground: bgVal || data.urlBg || existingBackground,
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
                const localStorageConfig = { ...currentSavedCfg };
                delete localStorageConfig.UrlLogo;
                delete localStorageConfig.UrlLogoInstansi;
                delete localStorageConfig.UrlBackground;
                localStorage.setItem('offline_app_config', JSON.stringify(localStorageConfig));

                // Mode Electron: simpan juga ke SQLite agar persisten antar restart
                // Key harus sama dengan yang dibuat apiHelper saat getAppConfig dipanggil
                if (window.isElectron && window.electronAPI && window.electronAPI.saveToLocalDB) {
                    const gasConfigKey = 'getAppConfig_{"action":"getAppConfig"}';
                    window.electronAPI.saveToLocalDB('cache', gasConfigKey, { key: gasConfigKey, data: currentSavedCfg });
                    window.electronAPI.saveToLocalDB('cache', 'appConfig', { key: 'appConfig', data: currentSavedCfg });
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
    if (t === 'guru') {
        const n = "Template_Guru_Tendik.xlsx";
        const h = [
            "NIP_NIK (16-18 Digit)",
            "Nama Lengkap & Gelar",
            "Jenis Pegawai (Guru/Tendik)",
            "Jabatan",
            "Jenis Kelamin (L/P)",
            "No. HP/WA"
        ];
        const sample1 = [
            "198501152010011005",
            "Drs. H. Ahmad Fauzi, M.Pd.",
            "Guru",
            "Guru Mata Pelajaran",
            "L",
            "081234567890"
        ];
        const sample2 = [
            "1509012304920003",
            "Siti Aminah, S.Kom.",
            "Tendik",
            "Tenaga Administrasi Sekolah (TAS) / TU",
            "P",
            "085234567891"
        ];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([h, sample1, sample2]);
        ws['!cols'] = [{ wch: 24 }, { wch: 32 }, { wch: 20 }, { wch: 36 }, { wch: 12 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, "Template_Guru_Tendik");
        XLSX.writeFile(wb, n);
        return;
    }
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
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
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
                    handleOperationError('Gagal Mengimpor Data', err);
                    i.value = '';
                })
                .withSuccessHandler(res => {
                    if (typeof swalCountdownInterval !== 'undefined') clearInterval(swalCountdownInterval);
                    if (res.status) {
                        invalidateSmartCache(importType === 'guru' ? 'guru' : (importType === 'buku' ? 'buku' : 'anggota'));
                        if (importType === 'buku') {
                            bookPage = 1;
                            loadBooks();
                        } else if (importType === 'guru') {
                            teacherPage = 1;
                            loadTeachers();
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
    const safeJudul = escapeCatalogHtml(judul);
    const safeKode = escapeCatalogHtml(kode);
    const htmlPreview = '<div style="display:flex;justify-content:center;padding:10px;"><div class="book-label-preview" style="width:250px;height:150px;background:#fff;border:2px solid #333;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;"><div style="font-weight:bold;font-size:14px;margin-bottom:5px;line-height:1.2;max-height:40px;overflow:hidden;">' + safeJudul + '</div><div style="font-size:12px;margin-top:5px;background:#000;color:#fff;padding:2px 8px;border-radius:4px;">' + safeKode + '</div><div id="qrcode-book" style="margin-top:10px;"></div></div></div>';

    Swal.fire({
        title: 'Preview',
        html: htmlPreview,
        showConfirmButton: true,
        confirmButtonText: 'Cetak',
        didOpen: () => { new QRCode(document.getElementById("qrcode-book"), { text: kode, width: 70, height: 70 }); },
        preConfirm: () => {
            const qrBox = document.getElementById("qrcode-book");
            if (qrBox) {
                const canvas = qrBox.querySelector('canvas');
                const img = qrBox.querySelector('img');
                if (canvas && img) {
                    img.src = canvas.toDataURL("image/png");
                    img.style.display = "block";
                    canvas.style.display = "none";
                }
            }
            const previewEl = document.querySelector('.book-label-preview');
            return previewEl ? previewEl.outerHTML : '';
        }
    }).then((r) => {
        if (r.isConfirmed && r.value) {
            var win = window.open('', '', 'height=500,width=500');
            if (win) {
                win.document.write('<html><head><title>Cetak Label</title></head><body style="padding:20px;">' + r.value + '</body></html>');
                win.document.close();
                setTimeout(() => { win.print(); }, 400);
            }
        }
    });
}

function printCard(id) {
    const m = memberData.find(x => x[0] == id); if (!m) return;
    const nama = m[1]; const jk = m[3] == 'L' ? 'Laki-laki' : 'Perempuan'; const tgl = m[4] ? new Date(m[4]).toLocaleDateString('id-ID') : '-';
    const sekolah = document.getElementById('sidebar-school-name').innerText || 'Perpus';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';
    const safeLogo = escapeCatalogHtml(logo);
    const safeSekolah = escapeCatalogHtml(sekolah);
    const safeNama = escapeCatalogHtml(nama);
    const safeId = escapeCatalogHtml(id);
    const safeJk = escapeCatalogHtml(jk);
    const safeTgl = escapeCatalogHtml(tgl);

    const htmlPreview = '<div style="display:flex;justify-content:center;padding:10px;"><div class="id-card-preview" style="width:320px;height:200px;background:#f8f9fa;border:1px solid #ddd;border-radius:15px;overflow:hidden;text-align:left;position:relative;"><div style="background:#4361ee;height:50px;display:flex;align-items:center;padding:0 15px;color:white;"><img src="' + safeLogo + '" crossorigin="anonymous" style="height:35px;width:35px;background:#fff;border-radius:50%;padding:2px;margin-right:10px;"><div style="font-weight:bold;font-size:13px;">' + safeSekolah + '</div></div><div style="padding:15px;display:flex;justify-content:space-between;"><div style="flex:1;"><h3 style="margin:0 0 5px;font-size:16px;">' + safeNama + '</h3><p style="font-size:11px;color:#666;margin:0;">ID: <b>' + safeId + '</b></p><p style="font-size:11px;color:#666;margin:0;">' + safeJk + '</p><p style="font-size:11px;color:#666;margin:0;">Lahir: ' + safeTgl + '</p></div><div id="qrcode-mem"></div></div><div style="position:absolute;bottom:10px;width:100%;text-align:center;font-size:10px;font-weight:bold;color:#4361ee;">KARTU PERPUSTAKAAN DIGITAL</div></div></div>';

    Swal.fire({
        width: 450,
        title: 'Preview',
        html: htmlPreview,
        showConfirmButton: true,
        confirmButtonText: 'Cetak',
        didOpen: () => { new QRCode(document.getElementById("qrcode-mem"), { text: id, width: 65, height: 65 }); },
        preConfirm: () => {
            const qrBox = document.getElementById("qrcode-mem");
            if (qrBox) {
                const canvas = qrBox.querySelector('canvas');
                const img = qrBox.querySelector('img');
                if (canvas && img) {
                    img.src = canvas.toDataURL("image/png");
                    img.style.display = "block";
                    canvas.style.display = "none";
                }
            }
            const previewEl = document.querySelector('.id-card-preview');
            return previewEl ? previewEl.outerHTML : '';
        }
    }).then(r => {
        if (r.isConfirmed && r.value) {
            var win = window.open('', '', 'height=500,width=500');
            if (win) {
                win.document.write('<html><head><title>Cetak Kartu</title></head><body style="padding:20px;">' + r.value + '</body></html>');
                win.document.close();
                setTimeout(() => { win.print(); }, 400);
            }
        }
    });
}

function printTeacherCard(nip) {
    const t = teacherData.find(x => String(x[0]).trim() === String(nip).trim());
    if (!t) return Swal.fire('Error', 'Data Guru/Tendik tidak ditemukan.', 'error');

    const nipStr = String(t[0] || '').trim();
    const namaStr = String(t[1] || '').trim();
    let jenisStr = 'Guru';
    let jabatanStr = 'Guru Mata Pelajaran';
    let jkStr = 'L';
    let hpStr = '-';

    if (t[2] === 'Guru' || t[2] === 'Tendik') {
        jenisStr = t[2];
        jabatanStr = t[3] || (jenisStr === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)');
        jkStr = String(t[4] || 'L').toUpperCase().trim();
        hpStr = t[5] ? String(t[5]) : '-';
    } else {
        jabatanStr = t[2] || 'Guru Mata Pelajaran';
        jkStr = String(t[3] || 'L').toUpperCase().trim();
        hpStr = t[4] ? String(t[4]) : '-';
        const jLower = jabatanStr.toLowerCase();
        jenisStr = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran')) ? 'Tendik' : 'Guru';
    }

    const jkLabel = jkStr === 'P' ? 'Perempuan' : 'Laki-laki';
    const sekolah = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

    const safeLogo = escapeCatalogHtml(logo);
    const safeSekolah = escapeCatalogHtml(sekolah);
    const safeNama = escapeCatalogHtml(namaStr);
    const safeNip = escapeCatalogHtml(nipStr);
    const safeJenis = escapeCatalogHtml(jenisStr);
    const safeJabatan = escapeCatalogHtml(jabatanStr);
    const safeJk = escapeCatalogHtml(jkLabel);
    const safeHp = escapeCatalogHtml(hpStr);

    const isGuru = jenisStr === 'Guru';
    const headerGradient = isGuru
        ? 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)'
        : 'linear-gradient(135deg, #065f46 0%, #059669 100%)';
    const accentColor = isGuru ? '#7c3aed' : '#059669';
    const roleBadgeText = isGuru ? 'TENAGA PENDIDIK (GURU)' : 'TENAGA KEPENDIDIKAN (TENDIK)';

    const htmlPreview = `
        <div style="display:flex; justify-content:center; padding:10px;">
            <div id="teacher-card-preview-node" class="id-card-teacher-preview" style="width:340px; height:215px; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; overflow:hidden; text-align:left; position:relative; box-shadow:0 8px 24px rgba(0,0,0,0.12); font-family:'Poppins', sans-serif;">
                <!-- Header Card -->
                <div style="background:${headerGradient}; height:54px; display:flex; align-items:center; justify-content:space-between; padding:0 14px; color:#ffffff;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <img src="${safeLogo}" crossorigin="anonymous" style="height:34px; width:34px; background:#ffffff; border-radius:50%; padding:2px; object-fit:contain; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                        <div>
                            <div style="font-weight:700; font-size:12px; line-height:1.2; text-shadow:0 1px 2px rgba(0,0,0,0.2);">${safeSekolah}</div>
                            <div style="font-size:8.5px; opacity:0.9; letter-spacing:0.5px;">KARTU PERPUSTAKAAN</div>
                        </div>
                    </div>
                    <span style="font-size:8px; font-weight:700; background:rgba(255,255,255,0.22); border:1px solid rgba(255,255,255,0.4); padding:2px 7px; border-radius:20px; letter-spacing:0.3px;">${safeJenis.toUpperCase()}</span>
                </div>

                <!-- Body Card -->
                <div style="padding:12px 14px 8px 14px; display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; font-size:13px; color:#1e293b; margin-bottom:3px; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${safeNama}">${safeNama}</div>
                        <div style="font-size:10px; color:#475569; margin-bottom:2px;">
                            NIP/NIK: <b style="font-family:monospace; color:${accentColor}; font-size:11px;">${safeNip}</b>
                        </div>
                        <div style="font-size:9.5px; color:#64748b; margin-bottom:2px; line-height:1.2;">
                            Jabatan: <b>${safeJabatan}</b>
                        </div>
                        <div style="font-size:9px; color:#64748b;">
                            JK: ${safeJk} ${safeHp !== '-' ? ' | HP: ' + safeHp : ''}
                        </div>
                    </div>
                    <div style="text-align:center; flex-shrink:0;">
                        <div id="qrcode-teacher-single" style="background:#ffffff; padding:4px; border:1px solid #e2e8f0; border-radius:8px;"></div>
                        <div style="font-size:7.5px; font-weight:700; color:#64748b; margin-top:2px; letter-spacing:0.5px;">NIP VERIFIED</div>
                    </div>
                </div>

                <!-- Footer Card -->
                <div style="position:absolute; bottom:0; left:0; width:100%; background:#f8fafc; border-top:1px solid #f1f5f9; padding:5px 14px; display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:8px; font-weight:700; color:${accentColor}; letter-spacing:0.4px;">${roleBadgeText}</span>
                    <span style="font-size:7.5px; color:#94a3b8; font-weight:600;">SiE-MPuS HYBRID</span>
                </div>
            </div>
        </div>
    `;

    Swal.fire({
        width: 460,
        title: '<i class="fas fa-id-card text-primary me-2"></i>Kartu Perpus Guru / Tendik',
        html: htmlPreview,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: '<i class="fas fa-print me-1"></i> Cetak Kartu',
        denyButtonText: '<i class="fas fa-download me-1"></i> Unduh PNG',
        cancelButtonText: 'Tutup',
        confirmButtonColor: '#7c3aed',
        denyButtonColor: '#059669',
        didOpen: () => {
            new QRCode(document.getElementById("qrcode-teacher-single"), {
                text: nipStr,
                width: 70,
                height: 70
            });
        },
        preConfirm: () => {
            const qrBox = document.getElementById("qrcode-teacher-single");
            if (qrBox) {
                const canvas = qrBox.querySelector('canvas');
                const img = qrBox.querySelector('img');
                if (canvas && img) {
                    img.src = canvas.toDataURL("image/png");
                    img.style.display = "block";
                    canvas.style.display = "none";
                }
            }
            const previewEl = document.querySelector('.id-card-teacher-preview');
            return previewEl ? previewEl.outerHTML : '';
        }
    }).then(r => {
        if (r.isConfirmed && r.value) {
            const win = window.open('', '', 'height=500,width=550');
            if (win) {
                win.document.write(`
                    <html>
                    <head>
                        <title>Cetak Kartu - ${safeNama}</title>
                        <style>
                            @page { size: auto; margin: 10mm; }
                            body { font-family: 'Arial', sans-serif; margin: 0; padding: 20px; display: flex; justify-content: center; align-items: center; background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                        </style>
                    </head>
                    <body>
                        ${r.value}
                    </body>
                    </html>
                `);
                win.document.close();
                setTimeout(() => { win.print(); }, 400);
            }
        } else if (r.isDenied) {
            downloadTeacherCard(nipStr);
        }
    });
}

function downloadTeacherCard(nip) {
    const t = teacherData.find(x => String(x[0]).trim() === String(nip).trim());
    if (!t) return;
    const nipStr = String(t[0] || '').trim();
    const namaStr = String(t[1] || '').trim();
    let jenisStr = 'Guru';
    let jabatanStr = 'Guru Mata Pelajaran';
    let jkStr = 'L';
    let hpStr = '-';

    if (t[2] === 'Guru' || t[2] === 'Tendik') {
        jenisStr = t[2];
        jabatanStr = t[3] || (jenisStr === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)');
        jkStr = String(t[4] || 'L').toUpperCase().trim();
        hpStr = t[5] ? String(t[5]) : '-';
    } else {
        jabatanStr = t[2] || 'Guru Mata Pelajaran';
        jkStr = String(t[3] || 'L').toUpperCase().trim();
        hpStr = t[4] ? String(t[4]) : '-';
        const jLower = jabatanStr.toLowerCase();
        jenisStr = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran')) ? 'Tendik' : 'Guru';
    }

    const jkLabel = jkStr === 'P' ? 'Perempuan' : 'Laki-laki';
    const sekolah = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';
    const isGuru = jenisStr === 'Guru';
    const headerGradient = isGuru ? 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #065f46 0%, #059669 100%)';
    const accentColor = isGuru ? '#7c3aed' : '#059669';
    const roleBadgeText = isGuru ? 'TENAGA PENDIDIK (GURU)' : 'TENAGA KEPENDIDIKAN (TENDIK)';

    const c = document.createElement('div');
    c.style.position = 'fixed';
    c.style.top = '-9999px';
    c.innerHTML = `
        <div id="cap-teacher-card" style="width:425px; height:275px; background:#ffffff; border:1px solid #cbd5e1; border-radius:18px; overflow:hidden; text-align:left; position:relative; font-family:'Arial', sans-serif;">
            <div style="background:${headerGradient}; height:65px; display:flex; align-items:center; justify-content:space-between; padding:0 18px; color:#ffffff;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${escapeCatalogHtml(logo)}" crossorigin="anonymous" style="height:44px; width:44px; background:#ffffff; border-radius:50%; padding:2px; object-fit:contain;">
                    <div>
                        <div style="font-weight:bold; font-size:15px; line-height:1.2;">${escapeCatalogHtml(sekolah)}</div>
                        <div style="font-size:10px; opacity:0.9;">KARTU PERPUSTAKAAN</div>
                    </div>
                </div>
                <span style="font-size:10px; font-weight:bold; background:rgba(255,255,255,0.25); border:1px solid rgba(255,255,255,0.4); padding:3px 10px; border-radius:20px;">${escapeCatalogHtml(jenisStr).toUpperCase()}</span>
            </div>
            <div style="padding:16px 18px; display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:16px; color:#1e293b; margin-bottom:5px;">${escapeCatalogHtml(namaStr)}</div>
                    <div style="font-size:12px; color:#475569; margin-bottom:4px;">NIP/NIK: <b style="font-family:monospace; color:${accentColor}; font-size:13px;">${escapeCatalogHtml(nipStr)}</b></div>
                    <div style="font-size:12px; color:#64748b; margin-bottom:4px;">Jabatan: <b>${escapeCatalogHtml(jabatanStr)}</b></div>
                    <div style="font-size:11px; color:#64748b;">JK: ${escapeCatalogHtml(jkLabel)} ${hpStr !== '-' ? ' | HP: ' + escapeCatalogHtml(hpStr) : ''}</div>
                </div>
                <div style="text-align:center;">
                    <div id="qr-dl-teacher" style="background:#fff; padding:5px; border:1.5px solid #cbd5e1; border-radius:8px;"></div>
                    <div style="font-size:9.5px; font-weight:bold; color:#64748b; margin-top:3px;">NIP VERIFIED</div>
                </div>
            </div>
            <div style="position:absolute; bottom:0; left:0; width:100%; background:#f8fafc; border-top:1px solid #e2e8f0; padding:6px 18px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-size:10px; font-weight:bold; color:${accentColor};">${roleBadgeText}</span>
                <span style="font-size:9px; color:#94a3b8; font-weight:bold;">SiE-MPuS HYBRID</span>
            </div>
        </div>
    `;
    document.body.appendChild(c);
    new QRCode(document.getElementById("qr-dl-teacher"), { text: nipStr, width: 105, height: 105 });

    showSmartLoading('Menyiapkan Kartu...', 'Merender visual kartu dan QR Code...');

    setTimeout(() => {
        html2canvas(document.getElementById('cap-teacher-card'), { scale: 2, useCORS: true, allowTaint: true }).then(cv => {
            document.body.removeChild(c);
            const img = cv.toDataURL("image/png");
            Swal.fire({
                title: 'Review Kartu',
                imageUrl: img,
                imageWidth: 380,
                showCancelButton: true,
                confirmButtonText: '<i class="fas fa-download me-1"></i> Simpan File PNG',
                confirmButtonColor: '#7c3aed',
                cancelButtonText: 'Batal'
            }).then(res => {
                if (res.isConfirmed) {
                    const link = document.createElement('a');
                    link.download = `Kartu_Perpus_${nipStr}.png`;
                    link.href = img;
                    link.click();
                }
            });
        }).catch(err => {
            if (document.body.contains(c)) document.body.removeChild(c);
            Swal.fire('Error', 'Gagal membuat gambar kartu: ' + err.message, 'error');
        });
    }, 500);
}

function printAllTeacherCards() {
    showSmartLoading('Menyiapkan Pratinjau Dokumen...', 'Mengambil seluruh data Guru & Tendik dan menyusun lembar A4...');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allTeachers => {
            if (!allTeachers || allTeachers.length === 0) {
                Swal.fire('Kosong', 'Belum ada data guru/tendik di database.', 'info');
                return;
            }

            const schoolName = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

            const totalTeachers = allTeachers.length;
            const itemsPerPage = 10;
            const totalPages = Math.ceil(totalTeachers / itemsPerPage);

            // Container sementara untuk render QR Code ke PNG DataURL
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'fixed';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            allTeachers.forEach((t, idx) => {
                const nipStr = String(t[0] || '').trim();
                const qrBox = document.createElement('div');
                qrBox.id = `qr-batch-teacher-gen-${idx}`;
                tempDiv.appendChild(qrBox);
                new QRCode(qrBox, { text: nipStr, width: 140, height: 140 });
            });

            // Tunggu render QR selesai
            setTimeout(() => {
                const qrDataUrls = [];
                allTeachers.forEach((t, idx) => {
                    const qrBox = document.getElementById(`qr-batch-teacher-gen-${idx}`);
                    let dataUrl = '';
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        if (canvas) {
                            dataUrl = canvas.toDataURL('image/png');
                        } else {
                            const img = qrBox.querySelector('img');
                            if (img) dataUrl = img.src;
                        }
                    }
                    qrDataUrls.push(dataUrl);
                });
                document.body.removeChild(tempDiv);

                // Buat struktur lembar-lembar A4
                let pagesHtml = '';
                for (let p = 0; p < totalPages; p++) {
                    const pageIndex = p + 1;
                    const startIndex = p * itemsPerPage;
                    const pageTeachers = allTeachers.slice(startIndex, startIndex + itemsPerPage);

                    let cardsHtml = '';
                    pageTeachers.forEach((t, tIdx) => {
                        const actualIdx = startIndex + tIdx;
                        const nipStr = String(t[0] || '').trim();
                        const namaStr = String(t[1] || '').trim();
                        let jenisStr = 'Guru';
                        let jabatanStr = 'Guru Mata Pelajaran';
                        let jkStr = 'L';
                        let hpStr = '-';

                        if (t[2] === 'Guru' || t[2] === 'Tendik') {
                            jenisStr = t[2];
                            jabatanStr = t[3] || (jenisStr === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)');
                            jkStr = String(t[4] || 'L').toUpperCase().trim();
                            hpStr = t[5] ? String(t[5]) : '-';
                        } else {
                            jabatanStr = t[2] || 'Guru Mata Pelajaran';
                            jkStr = String(t[3] || 'L').toUpperCase().trim();
                            hpStr = t[4] ? String(t[4]) : '-';
                            const jLower = jabatanStr.toLowerCase();
                            jenisStr = (jLower.includes('tu') || jLower.includes('perpus') || jLower.includes('satpam') || jLower.includes('laboran')) ? 'Tendik' : 'Guru';
                        }

                        const jkLabel = jkStr === 'P' ? 'Perempuan' : 'Laki-laki';
                        const isGuru = jenisStr === 'Guru';
                        const headerGradient = isGuru ? 'linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)' : 'linear-gradient(135deg, #065f46 0%, #059669 100%)';
                        const accentColor = isGuru ? '#7c3aed' : '#059669';
                        const roleBadgeText = isGuru ? 'TENAGA PENDIDIK (GURU)' : 'TENAGA KEPENDIDIKAN (TENDIK)';
                        const qrUrl = qrDataUrls[actualIdx] || '';

                        cardsHtml += `
                            <div class="card-wrapper">
                                <div class="id-card-teacher">
                                    <div class="card-header-teacher" style="background:${headerGradient};">
                                        <div style="display:flex;align-items:center;min-width:0;gap:6px;">
                                            <img src="${logo}" crossorigin="anonymous" class="card-logo">
                                            <div class="header-text">
                                                <div class="sch-name">${escapeCatalogHtml(schoolName)}</div>
                                                <div class="sub-name">KARTU PERPUSTAKAAN</div>
                                            </div>
                                        </div>
                                        <span class="role-badge">${escapeCatalogHtml(jenisStr).toUpperCase()}</span>
                                    </div>
                                    <div class="card-body-teacher">
                                        <div class="card-info-teacher">
                                            <div class="teacher-name" title="${escapeCatalogHtml(namaStr)}">${escapeCatalogHtml(namaStr)}</div>
                                            <div class="info-row"><span class="lbl">NIP/NIK:</span> <b class="val-nip" style="color:${accentColor};">${escapeCatalogHtml(nipStr)}</b></div>
                                            <div class="info-row"><span class="lbl">Jabatan:</span> <b>${escapeCatalogHtml(jabatanStr)}</b></div>
                                            <div class="info-row"><span class="lbl">JK/HP:</span> <span>${escapeCatalogHtml(jkLabel)} ${hpStr !== '-' ? '• ' + escapeCatalogHtml(hpStr) : ''}</span></div>
                                        </div>
                                        <div class="qr-col-teacher">
                                            <div class="qr-box">
                                                <img src="${qrUrl}" alt="${escapeCatalogHtml(nipStr)}">
                                            </div>
                                            <div class="qr-label">NIP VERIFIED</div>
                                        </div>
                                    </div>
                                    <div class="card-footer-teacher" style="color:${accentColor};">
                                        <span>${roleBadgeText}</span>
                                        <span>SiE-MPuS HYBRID</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    pagesHtml += `
                        <div class="a4-page-sheet" data-page="${pageIndex}">
                            <div class="a4-page-header">
                                <div><strong style="color:#0f172a;">${escapeCatalogHtml(schoolName)}</strong> • Kartu Guru & Tendik (8.5 × 5.5 cm)</div>
                                <div class="page-badge-counter">Lembar ${pageIndex} dari ${totalPages}</div>
                            </div>
                            <div class="cards-grid-10">
                                ${cardsHtml}
                            </div>
                            <div class="a4-page-footer">
                                <div>SiE-MPuS • Sistem E-Manajemen Perpustakaan</div>
                                <div>Halaman ${pageIndex} / ${totalPages}</div>
                            </div>
                        </div>
                    `;
                }

                // CSS lengkap untuk iframe (A4 portrait presisi 10 kartu, 8.5 x 5.5 cm, QR Code lebih besar)
                const iframeContentHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Kartu Guru & Tendik - ${escapeCatalogHtml(schoolName)}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 4mm 5mm;
        }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: #3e444c;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            padding: 24px 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #documentCanvas {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
            transform-origin: top center;
            transition: transform 0.15s ease-out;
        }
        .a4-page-sheet {
            width: 198mm;
            min-height: 287mm;
            height: auto;
            background: #ffffff;
            box-shadow: 0 8px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
            border-radius: 4px;
            padding: 2mm 4mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            position: relative;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
        }
        .a4-page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 1.5px;
            margin-bottom: 1.2mm;
            font-size: 8.5px;
            color: #475569;
            height: 12px;
        }
        .page-badge-counter {
            background: #e2e8f0;
            color: #334155;
            padding: 1px 7px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 8.5px;
        }
        .a4-page-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #cbd5e1;
            padding-top: 1.5px;
            margin-top: 1.2mm;
            font-size: 8px;
            color: #94a3b8;
            height: 11px;
        }
        .cards-grid-10 {
            display: grid;
            grid-template-columns: 85mm 85mm;
            grid-template-rows: repeat(5, 55mm);
            column-gap: 5mm;
            row-gap: 1.6mm;
            justify-content: center;
            align-content: center;
            height: 281.4mm;
            width: 100%;
            box-sizing: border-box;
            margin: 0 auto;
        }
        .card-wrapper {
            width: 85mm;
            height: 55mm;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .id-card-teacher {
            width: 85mm;
            height: 55mm;
            max-height: 55mm;
            background: #ffffff;
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
        }
        .card-header-teacher {
            height: 12.5mm;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 8px;
            color: #ffffff;
            flex-shrink: 0;
        }
        .card-logo {
            width: 24px;
            height: 24px;
            background: #ffffff;
            border-radius: 50%;
            padding: 1.5px;
            object-fit: contain;
            flex-shrink: 0;
            margin-right: 5px;
        }
        .header-text {
            min-width: 0;
            line-height: 1.15;
        }
        .sch-name {
            font-size: 8.5px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 48mm;
        }
        .sub-name {
            font-size: 6.5px;
            opacity: 0.9;
            letter-spacing: 0.3px;
        }
        .role-badge {
            font-size: 7px;
            font-weight: 700;
            background: rgba(255,255,255,0.22);
            border: 1px solid rgba(255,255,255,0.4);
            padding: 1.5px 6px;
            border-radius: 10px;
            flex-shrink: 0;
        }
        .card-body-teacher {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2mm 6mm;
            flex: 1;
            height: 37mm;
            gap: 4mm;
            box-sizing: border-box;
        }
        .card-info-teacher {
            flex: 1;
            min-width: 0;
        }
        .teacher-name {
            font-size: 11px;
            font-weight: 700;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2.5px;
            max-width: 44mm;
            line-height: 1.25;
        }
        .info-row {
            font-size: 8px;
            color: #334155;
            line-height: 1.35;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 44mm;
        }
        .info-row .lbl {
            color: #64748b;
        }
        .val-nip {
            font-family: monospace;
            font-size: 9.5px;
            font-weight: 700;
        }
        .qr-col-teacher {
            text-align: center;
            flex-shrink: 0;
        }
        .qr-box {
            background: #ffffff;
            border: 1.5px solid #cbd5e1;
            border-radius: 6px;
            padding: 2px;
            display: inline-block;
        }
        .qr-box img {
            width: 90px;
            height: 90px;
            display: block;
            object-fit: contain;
        }
        .qr-label {
            font-size: 6.5px;
            font-weight: 700;
            color: #64748b;
            margin-top: 1.5px;
            letter-spacing: 0.3px;
        }
        .card-footer-teacher {
            height: 5.5mm;
            background: #f8fafc;
            border-top: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 8px;
            font-size: 6.5px;
            font-weight: 700;
            box-sizing: border-box;
            flex-shrink: 0;
        }
        @media print {
            html, body {
                background: transparent !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }
            #documentCanvas {
                transform: none !important;
                gap: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
            }
            .a4-page-header, .a4-page-footer {
                display: none !important;
            }
            .a4-page-sheet {
                box-shadow: none !important;
                border-radius: 0 !important;
                margin: 0 !important;
                padding: 2mm 0 !important;
                width: 100% !important;
                height: 288mm !important;
                max-height: 288mm !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-after: page !important;
                break-inside: avoid !important;
                overflow: hidden !important;
            }
            .a4-page-sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
            }
            .cards-grid-10 {
                height: 282mm !important;
                grid-template-columns: 85mm 85mm !important;
                grid-template-rows: repeat(5, 55mm) !important;
                column-gap: 5mm !important;
                row-gap: 1.6mm !important;
                justify-content: center !important;
                margin: 0 auto !important;
            }
            .card-wrapper, .id-card-teacher {
                width: 85mm !important;
                height: 55mm !important;
                max-height: 55mm !important;
                border: 1.5px solid #cbd5e1 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
    </style>
</head>
<body>
    <div id="documentCanvas">
        ${pagesHtml}
    </div>
</body>
</html>`;

                // Tampilkan Modal ala Google Drive Viewer
                Swal.fire({
                    title: '',
                    width: '95vw',
                    padding: '0',
                    background: '#202124',
                    customClass: {
                        popup: 'shadow-lg border-0 rounded-4 overflow-hidden'
                    },
                    html: `
                        <!-- TOP BAR / TOOLBAR GOOGLE DRIVE STYLE -->
                        <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary border-opacity-25" style="background:#202124; height: 54px;">
                            <div class="d-flex align-items-center gap-2 text-white text-truncate">
                                <i class="fas fa-file-pdf text-danger fs-5"></i>
                                <span class="fw-bold fs-6 text-truncate" style="letter-spacing:0.3px;">Pratinjau Kartu Guru & Tendik.pdf</span>
                                <span class="badge bg-secondary text-white px-2 py-1 ms-2" style="font-size:11px;">
                                    ${totalTeachers} Guru/Tendik • ${totalPages} Lembar A4 (10 Kartu/Lembar)
                                </span>
                            </div>
                            
                            <!-- KONTROL ZOOM -->
                            <div class="d-none d-md-flex align-items-center gap-2 bg-dark bg-opacity-50 px-2 py-1 rounded border border-secondary border-opacity-25">
                                <button type="button" id="gdTeacherZoomOut" class="btn btn-sm btn-dark text-white border-0 py-0 px-2" title="Perkecil"><i class="fas fa-search-minus"></i></button>
                                <span id="gdTeacherZoomLabel" class="small text-white-50 fw-bold" style="min-width: 42px; text-align: center;">100%</span>
                                <button type="button" id="gdTeacherZoomIn" class="btn btn-sm btn-dark text-white border-0 py-0 px-2" title="Perbesar"><i class="fas fa-search-plus"></i></button>
                                <button type="button" id="gdTeacherZoomFit" class="btn btn-sm btn-dark text-white-50 border-0 py-0 px-1" title="Sesuaikan Lebar"><i class="fas fa-arrows-alt-h"></i></button>
                            </div>

                            <!-- TOMBOL AKSI CETAK, UNDUH PDF & TUTUP -->
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" id="gdTeacherBtnPrint" class="btn btn-sm btn-primary fw-bold px-3 shadow-sm">
                                    <i class="fas fa-print me-1"></i> Cetak
                                </button>
                                <button type="button" id="gdTeacherBtnPdf" class="btn btn-sm btn-danger fw-bold px-3 shadow-sm">
                                    <i class="fas fa-file-pdf me-1"></i> Unduh PDF
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-light rounded-circle ms-2" style="width:32px;height:32px;padding:0;line-height:30px;" onclick="Swal.close()" title="Tutup">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <!-- CONTAINER IFRAME GOOGLE DRIVE VIEWER -->
                        <div style="background: #3e444c; height: 78vh; width: 100%; position: relative;">
                            <iframe id="gdTeacherViewerIframe" style="width: 100%; height: 100%; border: none; display: block;" sandbox="allow-same-origin allow-scripts allow-modals"></iframe>
                        </div>
                    `,
                    showConfirmButton: false,
                    showCloseButton: false,
                    didOpen: () => {
                        const iframe = document.getElementById('gdTeacherViewerIframe');
                        if (iframe) {
                            iframe.srcdoc = iframeContentHtml;
                        }

                        // Event Cetak
                        document.getElementById('gdTeacherBtnPrint')?.addEventListener('click', () => {
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                            }
                        });

                        // Event Unduh PDF
                        document.getElementById('gdTeacherBtnPdf')?.addEventListener('click', () => {
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                            }
                        });

                        // Event Zoom
                        let currentZoom = 1;
                        const zoomLabel = document.getElementById('gdTeacherZoomLabel');
                        const applyZoom = z => {
                            currentZoom = Math.max(0.4, Math.min(1.8, z));
                            if (zoomLabel) zoomLabel.innerText = `${Math.round(currentZoom * 100)}%`;
                            if (iframe && iframe.contentDocument) {
                                const canvas = iframe.contentDocument.getElementById('documentCanvas');
                                if (canvas) canvas.style.transform = `scale(${currentZoom})`;
                            }
                        };
                        document.getElementById('gdTeacherZoomIn')?.addEventListener('click', () => applyZoom(currentZoom + 0.1));
                        document.getElementById('gdTeacherZoomOut')?.addEventListener('click', () => applyZoom(currentZoom - 0.1));
                        document.getElementById('gdTeacherZoomFit')?.addEventListener('click', () => applyZoom(0.85));

                        // Otomatis sesuaikan zoom awal agar pas di layar
                        setTimeout(() => {
                            applyZoom(0.85);
                        }, 300);
                    }
                });
            }, 600);
        }).getAllDataForExport('guru');
}

function processDownloadLabel(kode, judul) {
    const safeJudul = escapeCatalogHtml(judul);
    const safeKode = escapeCatalogHtml(kode);
    const schoolName = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';
    const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

    const c = document.createElement('div');
    c.style.position = 'fixed';
    c.style.top = '-9999px';
    c.style.left = '-9999px';
    c.innerHTML = `
        <div id="cap-lbl" style="width:240px;height:320px;background:#ffffff;border:2.5px solid #000000;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;padding:10px 8px;box-sizing:border-box;">
            <!-- 1. Header: Logo di atas + Nama Sekolah -->
            <div style="display:flex;flex-direction:column;align-items:center;width:100%;border-bottom:1px dashed #cbd5e1;padding-bottom:5px;">
                <img src="${logo}" style="width:30px;height:30px;object-fit:contain;margin-bottom:3px;" crossorigin="anonymous">
                <div style="font-size:9.5px;font-weight:700;color:#1e293b;text-align:center;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;">${escapeCatalogHtml(schoolName)}</div>
            </div>
            <!-- 2. Judul Buku -->
            <div style="font-weight:700;font-size:11px;color:#0f172a;line-height:1.25;max-height:28px;overflow:hidden;margin:3px 0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${safeJudul}</div>
            <!-- 3. Badge Kode Buku -->
            <div style="background:#000000;color:#ffffff;padding:2px 10px;border-radius:4px;font-family:monospace;font-weight:800;font-size:11px;letter-spacing:1px;margin:2px 0 4px 0;">${safeKode}</div>
            <!-- 4. QR Code di tengah -->
            <div id="qr-dl" style="display:flex;justify-content:center;margin:auto 0;"></div>
            <!-- 5. Footer kecil -->
            <div style="font-size:8px;color:#64748b;font-weight:700;letter-spacing:0.5px;margin-top:2px;">PERPUSTAKAAN</div>
        </div>
    `;
    document.body.appendChild(c);
    new QRCode(document.getElementById("qr-dl"), { text: kode, width: 110, height: 110, correctLevel: QRCode.CorrectLevel.M });

    showSmartLoading('Menyiapkan QR Code...', 'Menggambar komponen label QR Code.');

    setTimeout(() => {
        html2canvas(document.getElementById('cap-lbl'), { scale: 2 }).then(cv => {
            document.body.removeChild(c);
            const img = cv.toDataURL();
            Swal.fire({
                title: 'Pratinjau QR Code Buku',
                imageUrl: img,
                imageWidth: 240,
                showCancelButton: true,
                cancelButtonText: 'Batal',
                confirmButtonText: '<i class="fas fa-download me-1"></i> Unduh QR Code',
                confirmButtonColor: '#4361ee'
            }).then(res => {
                if (res.isConfirmed) {
                    const link = document.createElement('a');
                    link.download = 'QR_Buku_' + kode + '.png';
                    link.href = img;
                    link.click();
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
    const safeLogo = escapeCatalogHtml(logo);
    const safeSekolah = escapeCatalogHtml(sek);
    const safeNama = escapeCatalogHtml(nama);
    const safeId = escapeCatalogHtml(id);
    const safeJk = escapeCatalogHtml(jk);
    const safeTgl = escapeCatalogHtml(tgl);

    const c = document.createElement('div'); c.style.position = 'fixed'; c.style.top = '-9999px';
    c.innerHTML = '<div id="cap-card" style="width:425px;height:275px;background:#ffffff;border:1px solid #cbd5e1;border-radius:18px;overflow:hidden;text-align:left;position:relative;font-family:\'Arial\', sans-serif;"><div style="background:linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);height:62px;display:flex;align-items:center;padding:0 18px;color:white;"><img src="' + safeLogo + '" crossorigin="anonymous" style="height:42px;width:42px;background:#fff;border-radius:50%;padding:2px;margin-right:12px;object-fit:contain;"><div><div style="font-weight:bold;font-size:15px;line-height:1.2;">' + safeSekolah + '</div><div style="font-size:10px;opacity:0.9;">KARTU PERPUSTAKAAN DIGITAL</div></div></div><div style="padding:16px 18px;display:flex;justify-content:space-between;align-items:flex-start;"><div style="flex:1;"><h3 style="margin:0 0 5px;font-size:16px;color:#0f172a;font-weight:bold;">' + safeNama + '</h3><p style="font-size:12px;color:#475569;margin:3px 0;">NISN/ID: <b style="font-family:monospace;color:#1e40af;font-size:13px;">' + safeId + '</b></p><p style="font-size:12px;color:#64748b;margin:3px 0;">JK: ' + safeJk + '</p><p style="font-size:12px;color:#64748b;margin:3px 0;">Lahir: ' + safeTgl + '</p></div><div style="text-align:center;"><div id="qr-c-dl" style="background:#fff;padding:5px;border:1.5px solid #cbd5e1;border-radius:8px;"></div><div style="font-size:9.5px;font-weight:bold;color:#64748b;margin-top:3px;">NISN VERIFIED</div></div></div><div style="position:absolute;bottom:0;left:0;width:100%;background:#f8fafc;border-top:1px solid #e2e8f0;padding:6px 18px;display:flex;align-items:center;justify-content:space-between;font-size:9.5px;font-weight:bold;color:#1e40af;"><span>PERPUSTAKAAN SEKOLAH</span><span>SiE-MPuS HYBRID</span></div></div>';
    document.body.appendChild(c); new QRCode(document.getElementById("qr-c-dl"), { text: id, width: 105, height: 105 });

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
    const activePage = window.SessionStore.get('siempus_page') || 'dashboard';
    if (activePage === 'dashboard') loadDashboard();
    else if (activePage === 'buku') { bookPage = 1; loadBooks(); }
    else if (activePage === 'anggota') { memberPage = 1; loadMembers(); }
    else if (activePage === 'kunjungan') { visitorPage = 1; loadVisitorLogs(); }
    else if (activePage === 'riwayat') { historyPage = 1; loadHistory(); }
    else if (activePage === 'pengembalian') { getActiveReturnLoans(() => {}, true); }
    else if (activePage === 'pengaturan') {
        loadSettingsForm();
        if (typeof loadSOPHukumTab === 'function') loadSOPHukumTab();
    }
}

// --- LOGIKA KHUSUS MENU MOBILE ---
function updateMobileNav(pageId) {
    if (pageId === 'peminjaman' || pageId === 'pengembalian') pageId = 'sirkulasi';
    if (pageId === 'buku' || pageId === 'anggota' || pageId === 'guru') pageId = 'referensi';

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
            if (mLogo) { mLogo.src = cfg.UrlLogo; mLogo.onerror = function() { this.onerror = null; this.src = './imgsiempus.png'; }; }
        }
        if (cfg.NamaSekolah) {
            const mText = document.getElementById('mobile-school-text');
            if (mText) mText.textContent = cfg.NamaSekolah;
        }
    }).getAppConfig();
};



// ==========================================================
// 1. FITUR CETAK SEMUA LABEL QR CODE BUKU (A4 3x3 DENGAN MODAL GOOGLE DRIVE VIEWER)
// ==========================================================
function printAllLabels() {
    showSmartLoading('Menyiapkan Pratinjau Dokumen...', 'Mengambil data buku dan menyusun lembar A4...');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allBooks => {
            if (!allBooks || allBooks.length === 0) {
                Swal.fire('Kosong', 'Belum ada data buku untuk dicetak.', 'info');
                return;
            }

            // FILTER TAHUN
            const fTahun = document.getElementById('filterTahunExport') ? document.getElementById('filterTahunExport').value.trim().toLowerCase() : '';
            if (fTahun && fTahun !== '') {
                allBooks = allBooks.filter(b => String(b[4]).toLowerCase() === fTahun);
            }
            if (allBooks.length === 0) {
                Swal.fire('Kosong', 'Tidak ada buku di tahun ' + fTahun + '.', 'info');
                return;
            }

            const schoolName = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

            const totalBooks = allBooks.length;
            const itemsPerPage = 9;
            const totalPages = Math.ceil(totalBooks / itemsPerPage);

            // Container sementara untuk render QR Code ke PNG DataURL
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'fixed';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            allBooks.forEach((b, idx) => {
                const qrBox = document.createElement('div');
                qrBox.id = `qr-batch-gen-${idx}`;
                tempDiv.appendChild(qrBox);
                new QRCode(qrBox, { text: String(b[0] || ''), width: 110, height: 110 });
            });

            // Tunggu render QR selesai
            setTimeout(() => {
                const qrDataUrls = [];
                allBooks.forEach((b, idx) => {
                    const qrBox = document.getElementById(`qr-batch-gen-${idx}`);
                    let dataUrl = '';
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        if (canvas) {
                            dataUrl = canvas.toDataURL('image/png');
                        } else {
                            const img = qrBox.querySelector('img');
                            if (img) dataUrl = img.src;
                        }
                    }
                    qrDataUrls.push(dataUrl);
                });
                document.body.removeChild(tempDiv);

                // Buat struktur lembar-lembar A4
                let pagesHtml = '';
                for (let p = 0; p < totalPages; p++) {
                    const pageIndex = p + 1;
                    const startIndex = p * itemsPerPage;
                    const pageBooks = allBooks.slice(startIndex, startIndex + itemsPerPage);

                    let labelCardsHtml = '';
                    pageBooks.forEach((b, bIdx) => {
                        const actualIdx = startIndex + bIdx;
                        const kode = String(b[0] || '');
                        const judul = String(b[1] || '');
                        const qrUrl = qrDataUrls[actualIdx] || '';

                        labelCardsHtml += `
                            <div class="label-card">
                                <div class="label-header">
                                    <img src="${logo}" class="label-logo" crossorigin="anonymous">
                                    <div class="label-school">${escapeCatalogHtml(schoolName)}</div>
                                </div>
                                <div class="label-title" title="${escapeCatalogHtml(judul)}">${escapeCatalogHtml(judul)}</div>
                                <div class="label-code-badge">${escapeCatalogHtml(kode)}</div>
                                <div class="label-qr">
                                    <img src="${qrUrl}" alt="${escapeCatalogHtml(kode)}">
                                </div>
                                <div class="label-footer">PERPUSTAKAAN</div>
                            </div>
                        `;
                    });

                    pagesHtml += `
                        <div class="a4-page-sheet" data-page="${pageIndex}">
                            <div class="a4-page-header">
                                <div><strong style="color:#0f172a;">${escapeCatalogHtml(schoolName)}</strong> • Label QR Code Buku</div>
                                <div class="page-badge-counter">Lembar ${pageIndex} dari ${totalPages}</div>
                            </div>
                            <div class="labels-grid">
                                ${labelCardsHtml}
                            </div>
                            <div class="a4-page-footer">
                                <div>SiE-MPuS • Sistem E-Manajemen Perpustakaan</div>
                                <div>Halaman ${pageIndex} / ${totalPages}</div>
                            </div>
                        </div>
                    `;
                }

                // CSS lengkap untuk iframe (A4 portrait presisi 9 kotak, Google Drive style viewer)
                const iframeContentHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Label QR Code Buku - ${escapeCatalogHtml(schoolName)}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 6mm 6mm;
        }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: #3e444c;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            padding: 24px 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #documentCanvas {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
            transform-origin: top center;
            transition: transform 0.15s ease-out;
        }
        .a4-page-sheet {
            width: 198mm;
            height: 284mm;
            min-height: 284mm;
            max-height: 284mm;
            background: #ffffff;
            box-shadow: 0 8px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
            border-radius: 4px;
            padding: 3mm 4mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            position: relative;
            overflow: hidden;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
        }
        .a4-page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1.5px solid #cbd5e1;
            padding-bottom: 2px;
            margin-bottom: 3px;
            font-size: 9.5px;
            color: #475569;
            height: 14px;
        }
        .page-badge-counter {
            background: #e2e8f0;
            color: #334155;
            padding: 1px 7px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 9px;
        }
        .a4-page-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1.5px solid #cbd5e1;
            padding-top: 2px;
            margin-top: 3px;
            font-size: 8.5px;
            color: #94a3b8;
            height: 12px;
        }
        .labels-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            grid-template-rows: repeat(3, 1fr);
            gap: 4mm;
            height: 258mm;
            width: 100%;
            box-sizing: border-box;
        }
        .label-card {
            border: 1.8px solid #000000;
            border-radius: 6px;
            padding: 5px 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: space-between;
            text-align: center;
            background: #ffffff;
            box-sizing: border-box;
            overflow: hidden;
            height: 100%;
            max-height: 84mm;
        }
        .label-header {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 100%;
            border-bottom: 1px dashed #cbd5e1;
            padding-bottom: 3px;
        }
        .label-logo {
            width: 24px;
            height: 24px;
            object-fit: contain;
            margin-bottom: 2px;
        }
        .label-school {
            font-size: 8.5px;
            font-weight: 700;
            color: #1e293b;
            text-align: center;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
        }
        .label-title {
            font-size: 9.5px;
            font-weight: 700;
            color: #0f172a;
            line-height: 1.15;
            max-height: 22px;
            overflow: hidden;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
            margin: 1px 0 2px 0;
        }
        .label-code-badge {
            background: #000000;
            color: #ffffff;
            font-size: 10px;
            font-weight: 800;
            font-family: monospace;
            padding: 2px 8px;
            border-radius: 4px;
            letter-spacing: 0.8px;
            margin: 1px 0 2px 0;
        }
        .label-qr {
            display: flex;
            justify-content: center;
            align-items: center;
            margin: auto 0;
        }
        .label-qr img {
            width: 82px;
            height: 82px;
            display: block;
            margin: 0 auto;
            object-fit: contain;
        }
        .label-footer {
            font-size: 7.5px;
            color: #64748b;
            font-weight: 700;
            letter-spacing: 0.5px;
            margin-top: 1px;
            text-align: center;
        }
        @media print {
            html, body {
                background: transparent !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }
            #documentCanvas {
                transform: none !important;
                gap: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
            }
            .a4-page-sheet {
                box-shadow: none !important;
                border-radius: 0 !important;
                margin: 0 !important;
                padding: 3mm 4mm !important;
                width: 198mm !important;
                height: 284mm !important;
                max-height: 284mm !important;
                box-sizing: border-box !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-after: page !important;
                break-inside: avoid !important;
                overflow: hidden !important;
            }
            .a4-page-sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
            }
            .labels-grid {
                height: 258mm !important;
                gap: 4mm !important;
            }
            .label-card {
                border: 1.5px solid #000000 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
    </style>
</head>
<body>
    <div id="documentCanvas">
        ${pagesHtml}
    </div>
</body>
</html>`;

                // Tampilkan Modal ala Google Drive Viewer
                Swal.fire({
                    title: '',
                    width: '95vw',
                    padding: '0',
                    background: '#202124',
                    customClass: {
                        popup: 'shadow-lg border-0 rounded-4 overflow-hidden'
                    },
                    html: `
                        <!-- TOP BAR / TOOLBAR GOOGLE DRIVE STYLE -->
                        <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary border-opacity-25" style="background:#202124; height: 54px;">
                            <div class="d-flex align-items-center gap-2 text-white text-truncate">
                                <i class="fas fa-file-pdf text-danger fs-5"></i>
                                <span class="fw-bold fs-6 text-truncate" style="letter-spacing:0.3px;">Pratinjau Label QR Code Buku.pdf</span>
                                <span class="badge bg-secondary text-white px-2 py-1 ms-2" style="font-size:11px;">
                                    ${totalBooks} Buku • ${totalPages} Lembar A4
                                </span>
                            </div>
                            
                            <!-- KONTROL ZOOM -->
                            <div class="d-none d-md-flex align-items-center gap-2 bg-dark bg-opacity-50 px-2 py-1 rounded border border-secondary border-opacity-25">
                                <button type="button" id="gdViewerZoomOut" class="btn btn-sm btn-dark text-white border-0 py-0 px-2" title="Perkecil"><i class="fas fa-search-minus"></i></button>
                                <span id="gdViewerZoomLabel" class="small text-white-50 fw-bold" style="min-width: 42px; text-align: center;">100%</span>
                                <button type="button" id="gdViewerZoomIn" class="btn btn-sm btn-dark text-white border-0 py-0 px-2" title="Perbesar"><i class="fas fa-search-plus"></i></button>
                                <button type="button" id="gdViewerZoomFit" class="btn btn-sm btn-dark text-white-50 border-0 py-0 px-1" title="Sesuaikan Lebar"><i class="fas fa-arrows-alt-h"></i></button>
                            </div>

                            <!-- TOMBOL AKSI CETAK, UNDUH PDF & TUTUP -->
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" id="gdViewerBtnPrint" class="btn btn-sm btn-primary fw-bold px-3 shadow-sm">
                                    <i class="fas fa-print me-1"></i> Cetak
                                </button>
                                <button type="button" id="gdViewerBtnPdf" class="btn btn-sm btn-danger fw-bold px-3 shadow-sm">
                                    <i class="fas fa-file-pdf me-1"></i> Unduh PDF
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-light rounded-circle ms-2" style="width:32px;height:32px;padding:0;line-height:30px;" onclick="Swal.close()" title="Tutup">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <!-- CONTAINER IFRAME GOOGLE DRIVE VIEWER -->
                        <div style="background: #3e444c; height: 78vh; width: 100%; position: relative;">
                            <iframe id="gdViewerIframe" style="width: 100%; height: 100%; border: none; display: block;" sandbox="allow-same-origin allow-scripts allow-modals"></iframe>
                        </div>
                    `,
                    showConfirmButton: false,
                    showCloseButton: false,
                    didOpen: () => {
                        const iframe = document.getElementById('gdViewerIframe');
                        if (iframe) {
                            iframe.srcdoc = iframeContentHtml;
                        }

                        // Event Cetak
                        document.getElementById('gdViewerBtnPrint')?.addEventListener('click', () => {
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                            }
                        });

                        // Event Unduh PDF
                        document.getElementById('gdViewerBtnPdf')?.addEventListener('click', () => {
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                            }
                        });

                        // Event Zoom
                        let currentZoom = 1;
                        const zoomLabel = document.getElementById('gdViewerZoomLabel');
                        const applyZoom = z => {
                            currentZoom = Math.max(0.4, Math.min(1.8, z));
                            if (zoomLabel) zoomLabel.innerText = `${Math.round(currentZoom * 100)}%`;
                            if (iframe && iframe.contentDocument) {
                                const canvas = iframe.contentDocument.getElementById('documentCanvas');
                                if (canvas) canvas.style.transform = `scale(${currentZoom})`;
                            }
                        };
                        document.getElementById('gdViewerZoomIn')?.addEventListener('click', () => applyZoom(currentZoom + 0.1));
                        document.getElementById('gdViewerZoomOut')?.addEventListener('click', () => applyZoom(currentZoom - 0.1));
                        document.getElementById('gdViewerZoomFit')?.addEventListener('click', () => applyZoom(0.85));

                        // Otomatis sesuaikan zoom awal agar pas di layar
                        setTimeout(() => {
                            applyZoom(0.85);
                        }, 300);
                    }
                });
            }, 600);
        }).getAllDataForExport('buku');
}

// ==========================================================
// 2. FITUR CETAK SEMUA KARTU ANGGOTA (A4 2x5 = 10 Kartu)
// STANDAR ID CARD: 8.1 cm x 5 cm
// ==========================================================
function printAllCards() {
    showSmartLoading('Menyiapkan Pratinjau Dokumen...', 'Mengambil data anggota dan menyusun lembar A4...');

    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(allMembers => {
            if (!allMembers || allMembers.length === 0) {
                Swal.fire('Kosong', 'Belum ada data anggota.', 'info');
                return;
            }

            // FILTER KELAS
            const fKelas = document.getElementById('filterKelasExport') ? document.getElementById('filterKelasExport').value.trim().toLowerCase() : '';
            if (fKelas && fKelas !== '') {
                allMembers = allMembers.filter(m => String(m[2]).trim().toLowerCase() === fKelas);
            }
            if (allMembers.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data siswa untuk kelas yang dipilih.', 'info');
                return;
            }

            const schoolName = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';
            const logo = globalLogoUrl || 'https://cdn-icons-png.flaticon.com/512/2232/2232688.png';

            const totalMembers = allMembers.length;
            const itemsPerPage = 10;
            const totalPages = Math.ceil(totalMembers / itemsPerPage);

            // Container sementara untuk render QR Code ke PNG DataURL
            const tempDiv = document.createElement('div');
            tempDiv.style.position = 'fixed';
            tempDiv.style.left = '-9999px';
            tempDiv.style.top = '-9999px';
            document.body.appendChild(tempDiv);

            allMembers.forEach((m, idx) => {
                const idStr = String(m[0] || '').trim();
                const qrBox = document.createElement('div');
                qrBox.id = `qr-batch-mem-gen-${idx}`;
                tempDiv.appendChild(qrBox);
                new QRCode(qrBox, { text: idStr, width: 140, height: 140 });
            });

            // Tunggu render QR selesai
            setTimeout(() => {
                const qrDataUrls = [];
                allMembers.forEach((m, idx) => {
                    const qrBox = document.getElementById(`qr-batch-mem-gen-${idx}`);
                    let dataUrl = '';
                    if (qrBox) {
                        const canvas = qrBox.querySelector('canvas');
                        if (canvas) {
                            dataUrl = canvas.toDataURL('image/png');
                        } else {
                            const img = qrBox.querySelector('img');
                            if (img) dataUrl = img.src;
                        }
                    }
                    qrDataUrls.push(dataUrl);
                });
                document.body.removeChild(tempDiv);

                // Buat struktur lembar-lembar A4
                let pagesHtml = '';
                for (let p = 0; p < totalPages; p++) {
                    const pageIndex = p + 1;
                    const startIndex = p * itemsPerPage;
                    const pageMembers = allMembers.slice(startIndex, startIndex + itemsPerPage);

                    let cardsHtml = '';
                    pageMembers.forEach((m, mIdx) => {
                        const actualIdx = startIndex + mIdx;
                        const idStr = String(m[0] || '').trim();
                        const namaStr = String(m[1] || '').trim();
                        const kelasStr = String(m[2] || 'Umum').trim();
                        const jkRaw = String(m[3] || 'L').trim().toUpperCase();
                        const jkLabel = jkRaw === 'P' ? 'Perempuan' : 'Laki-laki';
                        const tglStr = safeDisplayDate(m[4]);
                        const qrUrl = qrDataUrls[actualIdx] || '';

                        cardsHtml += `
                            <div class="card-wrapper">
                                <div class="id-card-student">
                                    <div class="card-header-student">
                                        <div style="display:flex;align-items:center;min-width:0;gap:6px;">
                                            <img src="${logo}" crossorigin="anonymous" class="card-logo">
                                            <div class="header-text">
                                                <div class="sch-name">${escapeCatalogHtml(schoolName)}</div>
                                                <div class="sub-name">KARTU PERPUSTAKAAN DIGITAL</div>
                                            </div>
                                        </div>
                                        <span class="member-badge">${escapeCatalogHtml(kelasStr)}</span>
                                    </div>
                                    <div class="card-body-student">
                                        <div class="card-info-student">
                                            <div class="member-name" title="${escapeCatalogHtml(namaStr)}">${escapeCatalogHtml(namaStr)}</div>
                                            <div class="info-row"><span class="lbl">NISN/ID:</span> <b class="val-id">${escapeCatalogHtml(idStr)}</b></div>
                                            <div class="info-row"><span class="lbl">Kelas:</span> <b>${escapeCatalogHtml(kelasStr)}</b></div>
                                            <div class="info-row"><span class="lbl">JK / Lahir:</span> <span>${escapeCatalogHtml(jkLabel)} • ${escapeCatalogHtml(tglStr)}</span></div>
                                        </div>
                                        <div class="qr-col-student">
                                            <div class="qr-box">
                                                <img src="${qrUrl}" alt="${escapeCatalogHtml(idStr)}">
                                            </div>
                                            <div class="qr-label">NISN VERIFIED</div>
                                        </div>
                                    </div>
                                    <div class="card-footer-student">
                                        <span>PERPUSTAKAAN SEKOLAH</span>
                                        <span>SiE-MPuS HYBRID</span>
                                    </div>
                                </div>
                            </div>
                        `;
                    });

                    pagesHtml += `
                        <div class="a4-page-sheet" data-page="${pageIndex}">
                            <div class="a4-page-header">
                                <div><strong style="color:#0f172a;">${escapeCatalogHtml(schoolName)}</strong> • Kartu Anggota Siswa (8.5 × 5.5 cm)</div>
                                <div class="page-badge-counter">Lembar ${pageIndex} dari ${totalPages}</div>
                            </div>
                            <div class="cards-grid-10">
                                ${cardsHtml}
                            </div>
                            <div class="a4-page-footer">
                                <div>SiE-MPuS • Sistem E-Manajemen Perpustakaan</div>
                                <div>Halaman ${pageIndex} / ${totalPages}</div>
                            </div>
                        </div>
                    `;
                }

                // CSS lengkap untuk iframe (A4 portrait presisi 10 kartu siswa, 8.5 x 5.5 cm, QR Code lebih besar)
                const iframeContentHtml = `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>Kartu Anggota Siswa - ${escapeCatalogHtml(schoolName)}</title>
    <style>
        @page {
            size: A4 portrait;
            margin: 4mm 5mm;
        }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            background: #3e444c;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
        }
        body {
            padding: 24px 12px;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        #documentCanvas {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 24px;
            transform-origin: top center;
            transition: transform 0.15s ease-out;
        }
        .a4-page-sheet {
            width: 198mm;
            min-height: 287mm;
            height: auto;
            background: #ffffff;
            box-shadow: 0 8px 30px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
            border-radius: 4px;
            padding: 2mm 4mm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
            position: relative;
            page-break-after: always;
            page-break-inside: avoid;
            break-after: page;
            break-inside: avoid;
        }
        .a4-page-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 1.5px;
            margin-bottom: 1.2mm;
            font-size: 8.5px;
            color: #475569;
            height: 12px;
        }
        .page-badge-counter {
            background: #e2e8f0;
            color: #334155;
            padding: 1px 7px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 8.5px;
        }
        .a4-page-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #cbd5e1;
            padding-top: 1.5px;
            margin-top: 1.2mm;
            font-size: 8px;
            color: #94a3b8;
            height: 11px;
        }
        .cards-grid-10 {
            display: grid;
            grid-template-columns: 85mm 85mm;
            grid-template-rows: repeat(5, 55mm);
            column-gap: 5mm;
            row-gap: 1.6mm;
            justify-content: center;
            align-content: center;
            height: 281.4mm;
            width: 100%;
            box-sizing: border-box;
            margin: 0 auto;
        }
        .card-wrapper {
            width: 85mm;
            height: 55mm;
            display: flex;
            align-items: center;
            justify-content: center;
            box-sizing: border-box;
        }
        .id-card-student {
            width: 85mm;
            height: 55mm;
            max-height: 55mm;
            background: #ffffff;
            border: 1.5px solid #cbd5e1;
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
        }
        .card-header-student {
            height: 12.5mm;
            background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 8px;
            color: #ffffff;
            flex-shrink: 0;
        }
        .card-logo {
            width: 24px;
            height: 24px;
            background: #ffffff;
            border-radius: 50%;
            padding: 1.5px;
            object-fit: contain;
            flex-shrink: 0;
            margin-right: 5px;
        }
        .header-text {
            min-width: 0;
            line-height: 1.15;
        }
        .sch-name {
            font-size: 8.5px;
            font-weight: 700;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 48mm;
        }
        .sub-name {
            font-size: 6.5px;
            opacity: 0.9;
            letter-spacing: 0.3px;
        }
        .member-badge {
            font-size: 7px;
            font-weight: 700;
            background: rgba(255,255,255,0.22);
            border: 1px solid rgba(255,255,255,0.4);
            padding: 1.5px 6px;
            border-radius: 10px;
            flex-shrink: 0;
        }
        .card-body-student {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2mm 6mm;
            flex: 1;
            height: 37mm;
            gap: 4mm;
            box-sizing: border-box;
        }
        .card-info-student {
            flex: 1;
            min-width: 0;
        }
        .member-name {
            font-size: 11px;
            font-weight: 700;
            color: #0f172a;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2.5px;
            max-width: 44mm;
            line-height: 1.25;
        }
        .info-row {
            font-size: 8px;
            color: #334155;
            line-height: 1.35;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 44mm;
        }
        .info-row .lbl {
            color: #64748b;
        }
        .val-id {
            font-family: monospace;
            font-size: 9.5px;
            font-weight: 700;
            color: #1e40af;
        }
        .qr-col-student {
            text-align: center;
            flex-shrink: 0;
        }
        .qr-box {
            background: #ffffff;
            border: 1.5px solid #cbd5e1;
            border-radius: 6px;
            padding: 2px;
            display: inline-block;
        }
        .qr-box img {
            width: 90px;
            height: 90px;
            display: block;
            object-fit: contain;
        }
        .qr-label {
            font-size: 6.5px;
            font-weight: 700;
            color: #64748b;
            margin-top: 1.5px;
            letter-spacing: 0.3px;
        }
        .card-footer-student {
            height: 5.5mm;
            background: #f8fafc;
            border-top: 1px solid #f1f5f9;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 8px;
            font-size: 6.5px;
            font-weight: 700;
            color: #1e40af;
            box-sizing: border-box;
            flex-shrink: 0;
        }
        @media print {
            html, body {
                background: transparent !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
                height: 100% !important;
            }
            #documentCanvas {
                transform: none !important;
                gap: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 100% !important;
            }
            .a4-page-header, .a4-page-footer {
                display: none !important;
            }
            .a4-page-sheet {
                box-shadow: none !important;
                border-radius: 0 !important;
                margin: 0 !important;
                padding: 2mm 0 !important;
                width: 100% !important;
                height: 288mm !important;
                max-height: 288mm !important;
                box-sizing: border-box !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                page-break-after: always !important;
                page-break-inside: avoid !important;
                break-after: page !important;
                break-inside: avoid !important;
                overflow: hidden !important;
            }
            .a4-page-sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
            }
            .cards-grid-10 {
                height: 282mm !important;
                grid-template-columns: 85mm 85mm !important;
                grid-template-rows: repeat(5, 55mm) !important;
                column-gap: 5mm !important;
                row-gap: 1.6mm !important;
                justify-content: center !important;
                margin: 0 auto !important;
            }
            .card-wrapper, .id-card-student {
                width: 85mm !important;
                height: 55mm !important;
                max-height: 55mm !important;
                border: 1.5px solid #cbd5e1 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
        }
    </style>
</head>
<body>
    <div id="documentCanvas">
        ${pagesHtml}
    </div>
</body>
</html>`;

                // Tampilkan Modal ala Google Drive Viewer
                Swal.fire({
                    title: '',
                    width: '95vw',
                    padding: '0',
                    background: '#202124',
                    customClass: {
                        popup: 'shadow-lg border-0 rounded-4 overflow-hidden'
                    },
                    html: `
                        <!-- TOP BAR / TOOLBAR GOOGLE DRIVE STYLE -->
                        <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom border-secondary border-opacity-25" style="background:#202124; height: 54px;">
                            <div class="d-flex align-items-center gap-2 text-white text-truncate">
                                <i class="fas fa-file-pdf text-danger fs-5"></i>
                                <span class="fw-bold fs-6 text-truncate" style="letter-spacing:0.3px;">Pratinjau Kartu Anggota Siswa.pdf</span>
                                <span class="badge bg-secondary text-white px-2 py-1 ms-2" style="font-size:11px;">
                                    ${totalMembers} Siswa • ${totalPages} Lembar A4 (10 Kartu/Lembar)
                                </span>
                            </div>
                            
                            <!-- KONTROL ZOOM -->
                            <div class="d-none d-md-flex align-items-center gap-2 bg-dark bg-opacity-50 px-2 py-1 rounded border border-secondary border-opacity-25">
                                <button type="button" id="gdMemberZoomOut" class="btn btn-sm btn-dark text-white border-0 py-0 px-2" title="Perkecil"><i class="fas fa-search-minus"></i></button>
                                <span id="gdMemberZoomLabel" class="small text-white-50 fw-bold" style="min-width: 42px; text-align: center;">100%</span>
                                <button type="button" id="gdMemberZoomIn" class="btn btn-sm btn-dark text-white border-0 py-0 px-2" title="Perbesar"><i class="fas fa-search-plus"></i></button>
                                <button type="button" id="gdMemberZoomFit" class="btn btn-sm btn-dark text-white-50 border-0 py-0 px-1" title="Sesuaikan Lebar"><i class="fas fa-arrows-alt-h"></i></button>
                            </div>

                            <!-- TOMBOL AKSI CETAK, UNDUH PDF & TUTUP -->
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" id="gdMemberBtnPrint" class="btn btn-sm btn-primary fw-bold px-3 shadow-sm">
                                    <i class="fas fa-print me-1"></i> Cetak
                                </button>
                                <button type="button" id="gdMemberBtnPdf" class="btn btn-sm btn-danger fw-bold px-3 shadow-sm">
                                    <i class="fas fa-file-pdf me-1"></i> Unduh PDF
                                </button>
                                <button type="button" class="btn btn-sm btn-outline-light rounded-circle ms-2" style="width:32px;height:32px;padding:0;line-height:30px;" onclick="Swal.close()" title="Tutup">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>

                        <!-- CONTAINER IFRAME GOOGLE DRIVE VIEWER -->
                        <div style="background: #3e444c; height: 78vh; width: 100%; position: relative;">
                            <iframe id="gdMemberViewerIframe" style="width: 100%; height: 100%; border: none; display: block;" sandbox="allow-same-origin allow-scripts allow-modals"></iframe>
                        </div>
                    `,
                    showConfirmButton: false,
                    showCloseButton: false,
                    didOpen: () => {
                        const iframe = document.getElementById('gdMemberViewerIframe');
                        if (iframe) {
                            iframe.srcdoc = iframeContentHtml;
                        }

                        // Event Cetak
                        document.getElementById('gdMemberBtnPrint')?.addEventListener('click', () => {
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                            }
                        });

                        // Event Unduh PDF
                        document.getElementById('gdMemberBtnPdf')?.addEventListener('click', () => {
                            if (iframe && iframe.contentWindow) {
                                iframe.contentWindow.focus();
                                iframe.contentWindow.print();
                            }
                        });

                        // Event Zoom
                        let currentZoom = 1;
                        const zoomLabel = document.getElementById('gdMemberZoomLabel');
                        const applyZoom = z => {
                            currentZoom = Math.max(0.4, Math.min(1.8, z));
                            if (zoomLabel) zoomLabel.innerText = `${Math.round(currentZoom * 100)}%`;
                            if (iframe && iframe.contentDocument) {
                                const canvas = iframe.contentDocument.getElementById('documentCanvas');
                                if (canvas) canvas.style.transform = `scale(${currentZoom})`;
                            }
                        };
                        document.getElementById('gdMemberZoomIn')?.addEventListener('click', () => applyZoom(currentZoom + 0.1));
                        document.getElementById('gdMemberZoomOut')?.addEventListener('click', () => applyZoom(currentZoom - 0.1));
                        document.getElementById('gdMemberZoomFit')?.addEventListener('click', () => applyZoom(0.85));

                        // Otomatis sesuaikan zoom awal agar pas di layar
                        setTimeout(() => {
                            applyZoom(0.85);
                        }, 300);
                    }
                });
            }, 600);
        }).getAllDataForExport('anggota');
}

// ==========================================================
// 🤖 FITUR GOOGLE GEMINI AI STUDIO
// ==========================================================

// Tampilkan tombol chat AI hanya jika user sudah login (Taruh ini di dalam fungsi showPage() kamu jika mau)
document.addEventListener("DOMContentLoaded", () => {
    if (window.SessionStore.get('siempus_user')) {
        const btnAi = document.getElementById('btn-ai-chat');
        if (btnAi) btnAi.classList.remove('d-none');
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

    chatBody.innerHTML += `<div class="p-2 bg-primary text-white rounded-3 shadow-sm" style="align-self: flex-end; max-width: 85%; font-size: 13px;">${escapeCatalogHtml(msg)}</div>`;
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
                let botReply = escapeCatalogHtml(res.result).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>');
                chatBody.innerHTML += `<div class="p-2 bg-white rounded-3 border shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">${botReply}</div>`;
            } else {
                chatBody.innerHTML += `<div class="p-2 bg-warning text-dark rounded-3 shadow-sm" style="align-self: flex-start; max-width: 85%; font-size: 13px;">AI: ${escapeCatalogHtml(res.message)}</div>`;
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
    const titleEl = document.getElementById('importTitle');
    const importDesc = document.getElementById('importDesc');
    const sourceContainer = document.getElementById('importSourceContainer');

    if (type === 'buku') {
        if (titleEl) titleEl.innerText = 'Buku';
        if (importDesc) importDesc.innerText = 'Pastikan format data di Excel sudah sesuai dengan template sebelum melakukan upload agar tidak terjadi error.';
    } else if (type === 'guru') {
        if (titleEl) titleEl.innerText = 'Guru & Tendik';
        if (importDesc) importDesc.innerText = 'Wajib: NIP/NIK harus 16 s/d 18 digit angka, dan kolom Jenis Pegawai diisi "Guru" atau "Tendik".';
    } else {
        if (titleEl) titleEl.innerText = 'Anggota Siswa';
        if (importDesc) importDesc.innerText = 'Pastikan format data di Excel sudah sesuai dengan template sebelum melakukan upload agar tidak terjadi error.';
    }

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

// --- UPDATE FUNGSI EXPORT (DENGAN PRATINJAU MODAL UNTUK BUKU) ---
function exportData(type) {
    if (type === 'buku') {
        previewExportBuku();
        return;
    }

    showSmartLoading('Mempersiapkan Unduhan...', 'Menyaring data dari database.');
    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(serverData => {
            if (serverData.length === 0) { Swal.fire('Info', 'Belum ada data.', 'info'); return; }

            let targetData = serverData;
            let headers = []; let fileName = "";

            if (type === 'guru') {
                headers = ["NIP/NIK", "Nama Lengkap", "Jenis Pegawai", "Jabatan", "Jenis Kelamin", "No. HP"];
                fileName = "Data_Guru_Tendik.xlsx";
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
// 🔍 PRATINJAU EKSPOR DATA BUKU SEBELUM UNDUH EXCEL
// ==========================================================
function previewExportBuku() {
    showSmartLoading('Mempersiapkan Pratinjau...', 'Menyaring data buku dari database.');
    google.script.run
        .withFailureHandler(handleNetworkError)
        .withSuccessHandler(serverData => {
            if (!serverData || serverData.length === 0) {
                Swal.fire('Info', 'Belum ada data buku untuk diekspor.', 'info');
                return;
            }

            let targetData = serverData;
            const fTahun = document.getElementById('filterTahunExport') ? document.getElementById('filterTahunExport').value.trim() : '';
            if (fTahun && fTahun !== '') {
                targetData = serverData.filter(b => String(b[4]).trim() === fTahun);
            }

            if (targetData.length === 0) {
                Swal.fire('Kosong', 'Tidak ada data buku yang cocok dengan filter tahun ' + fTahun + '.', 'info');
                return;
            }

            const schoolName = document.getElementById('sidebar-school-name')?.innerText || 'Perpustakaan Sekolah';

            // Hitung ringkasan statistik
            let totalJudul = targetData.length;
            let totalStokAwal = 0;
            let totalSisa = 0;
            let totalRusak = 0;

            targetData.forEach(r => {
                totalStokAwal += Number(r[6]) || 0;
                totalSisa += (r[7] !== undefined && r[7] !== '') ? Number(r[7]) : (Number(r[6]) || 0);
                totalRusak += Number(r[9]) || 0;
            });
            let totalTersedia = Math.max(0, totalStokAwal - totalRusak);

            const previewLimit = 500;
            const previewRows = targetData.slice(0, previewLimit);
            const hasMoreRows = targetData.length > previewLimit;

            Swal.fire({
                title: 'Pratinjau Ekspor Data Buku',
                width: '94vw',
                html: `
                    <div class="text-center mb-2">
                        <div class="fw-bold text-primary fs-6">LAPORAN DATA KATALOG BUKU PERPUSTAKAAN</div>
                        <div class="small fw-semibold text-secondary">${escapeCatalogHtml(schoolName)}</div>
                        <div class="badge bg-light text-dark border mt-1">Filter Tahun: ${escapeCatalogHtml(fTahun || 'Semua Tahun')}</div>
                    </div>

                    <!-- Ringkasan Cepat -->
                    <div class="row g-2 mb-2 text-start">
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-primary bg-opacity-10 border-primary">
                                <small class="text-primary fw-bold d-block" style="font-size:10.5px;">TOTAL JUDUL BUKU</small>
                                <strong class="text-primary fs-6">${totalJudul.toLocaleString('id-ID')} Judul</strong>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-secondary bg-opacity-10 border-secondary">
                                <small class="text-secondary fw-bold d-block" style="font-size:10.5px;">TOTAL STOK AWAL</small>
                                <strong class="text-secondary fs-6">${totalStokAwal.toLocaleString('id-ID')} Eks</strong>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-success bg-opacity-10 border-success">
                                <small class="text-success fw-bold d-block" style="font-size:10.5px;">STOK TERSEDIA (BERSIH)</small>
                                <strong class="text-success fs-6">${totalTersedia.toLocaleString('id-ID')} Eks</strong>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-danger bg-opacity-10 border-danger">
                                <small class="text-danger fw-bold d-block" style="font-size:10.5px;">HILANG / RUSAK BERAT</small>
                                <strong class="text-danger fs-6">${totalRusak.toLocaleString('id-ID')} Eks</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Toolbar Kontrol -->
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <button type="button" id="bukuExportZoomOut" class="btn btn-sm btn-outline-secondary" title="Perkecil"><i class="fas fa-search-minus"></i></button>
                        <span id="bukuExportZoomLabel" class="small text-muted fw-bold">100%</span>
                        <button type="button" id="bukuExportZoomIn" class="btn btn-sm btn-outline-secondary" title="Perbesar"><i class="fas fa-search-plus"></i></button>
                        <span class="small text-muted ms-auto"><i class="fas fa-list me-1"></i>${targetData.length.toLocaleString('id-ID')} baris data</span>
                        <button type="button" id="bukuExportPrint" class="btn btn-sm btn-outline-primary fw-bold"><i class="fas fa-print me-1"></i> Cetak</button>
                        <button type="button" id="bukuExportDownload" class="btn btn-sm btn-success fw-bold"><i class="fas fa-file-excel me-1"></i> Unduh Excel</button>
                    </div>

                    <!-- Frame Pratinjau Tabel -->
                    <div id="bukuExportFrame" class="border rounded text-start" style="height:52vh;overflow:auto;background:#fff;">
                        <div id="bukuExportScale" style="width:max-content;min-width:100%;">
                            <table class="table table-sm table-striped table-bordered mb-0 small align-middle">
                                <thead class="table-light sticky-top">
                                    <tr class="text-nowrap small text-muted text-center">
                                        <th style="width:35px;">No</th>
                                        <th>Kode Buku</th>
                                        <th>Judul Buku</th>
                                        <th>Pengarang</th>
                                        <th>Penerbit</th>
                                        <th>Tahun</th>
                                        <th>Kategori</th>
                                        <th>Stok Awal</th>
                                        <th>Stok Sisa</th>
                                        <th>Sumber Perolehan</th>
                                        <th>Hilang / RB</th>
                                    </tr>
                                </thead>
                                <tbody id="bukuExportTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="small text-muted text-start mt-2">
                        ${hasMoreRows ? `<i class="fas fa-info-circle me-1"></i>Pratinjau menampilkan ${previewLimit} baris pertama. Tombol Cetak dan Unduh Excel akan memuat seluruh ${targetData.length.toLocaleString('id-ID')} data.` : '<i class="fas fa-check-circle text-success me-1"></i>Pratinjau menampilkan seluruh data buku yang sesuai filter.'}
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true,
                didOpen: () => {
                    const tbody = document.getElementById('bukuExportTableBody');
                    if (tbody) {
                        previewRows.forEach((r, idx) => {
                            const tr = document.createElement('tr');
                            const kode = String(r[0] || '');
                            const judul = String(r[1] || '');
                            const pengarang = String(r[2] || '-');
                            const penerbit = String(r[3] || '-');
                            const tahun = String(r[4] || '-');
                            const kategori = String(r[5] || 'Umum');
                            const stokAwal = Number(r[6]) || 0;
                            const sisa = (r[7] !== undefined && r[7] !== '') ? Number(r[7]) : stokAwal;
                            const sumber = String(r[8] || '-');
                            const rusak = Number(r[9]) || 0;

                            tr.innerHTML = `
                                <td class="text-center">${idx + 1}</td>
                                <td class="font-monospace fw-bold text-primary">${escapeCatalogHtml(kode)}</td>
                                <td class="fw-semibold">${escapeCatalogHtml(judul)}</td>
                                <td>${escapeCatalogHtml(pengarang)}</td>
                                <td>${escapeCatalogHtml(penerbit)}</td>
                                <td class="text-center">${escapeCatalogHtml(tahun)}</td>
                                <td><span class="badge bg-light text-secondary border">${escapeCatalogHtml(kategori)}</span></td>
                                <td class="text-center fw-bold text-secondary">${stokAwal}</td>
                                <td class="text-center fw-bold text-success">${sisa}</td>
                                <td><span class="badge bg-info bg-opacity-10 text-primary border border-info border-opacity-25">${escapeCatalogHtml(sumber)}</span></td>
                                <td class="text-center ${rusak > 0 ? 'text-danger fw-bold' : 'text-muted'}">${rusak}</td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }

                    // Zoom controls
                    let zoom = 1;
                    const scale = document.getElementById('bukuExportScale');
                    const zoomLabel = document.getElementById('bukuExportZoomLabel');
                    const setZoom = z => {
                        zoom = Math.max(0.6, Math.min(1.6, z));
                        scale.style.zoom = String(zoom);
                        zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
                    };
                    document.getElementById('bukuExportZoomOut')?.addEventListener('click', () => setZoom(zoom - 0.1));
                    document.getElementById('bukuExportZoomIn')?.addEventListener('click', () => setZoom(zoom + 0.1));

                    // Tombol Unduh Excel
                    document.getElementById('bukuExportDownload')?.addEventListener('click', () => {
                        const headers = ["No", "Kode Buku", "Judul", "Pengarang", "Penerbit", "Tahun", "Kategori", "Stok Awal", "Stok Sisa", "Sumber Perolehan", "Hilang / Rusak Berat"];
                        const exportRows = targetData.map((r, i) => [
                            i + 1,
                            r[0] || '',
                            r[1] || '',
                            r[2] || '',
                            r[3] || '',
                            r[4] || '',
                            r[5] || 'Umum',
                            Number(r[6]) || 0,
                            (r[7] !== undefined && r[7] !== '') ? Number(r[7]) : (Number(r[6]) || 0),
                            r[8] || 'BOS Reguler',
                            Number(r[9]) || 0
                        ]);
                        const fileName = fTahun ? `Data_Buku_Tahun_${fTahun}.xlsx` : 'Data_Buku.xlsx';
                        const wb = XLSX.utils.book_new();
                        const ws = XLSX.utils.aoa_to_sheet([headers, ...exportRows]);
                        XLSX.utils.book_append_sheet(wb, ws, "Data_Buku");
                        XLSX.writeFile(wb, fileName);
                    });

                    // Tombol Cetak
                    document.getElementById('bukuExportPrint')?.addEventListener('click', () => {
                        printTableDataBuku(targetData, fTahun, schoolName);
                    });
                }
            });
        }).getAllDataForExport('buku');
}

function printTableDataBuku(targetData, fTahun, schoolName) {
    const printWindow = window.open('', '', 'height=800,width=1100');
    if (!printWindow) {
        Swal.fire('Popup Diblokir', 'Izinkan pop-up pada peramban untuk mencetak laporan.', 'warning');
        return;
    }

    let rowsHtml = '';
    targetData.forEach((r, idx) => {
        const kode = String(r[0] || '');
        const judul = String(r[1] || '');
        const pengarang = String(r[2] || '-');
        const penerbit = String(r[3] || '-');
        const tahun = String(r[4] || '-');
        const kategori = String(r[5] || 'Umum');
        const stokAwal = Number(r[6]) || 0;
        const sisa = (r[7] !== undefined && r[7] !== '') ? Number(r[7]) : stokAwal;
        const sumber = String(r[8] || '-');
        const rusak = Number(r[9]) || 0;

        rowsHtml += `
            <tr>
                <td style="text-align:center;">${idx + 1}</td>
                <td style="font-family:monospace; font-weight:bold;">${escapeCatalogHtml(kode)}</td>
                <td><strong>${escapeCatalogHtml(judul)}</strong></td>
                <td>${escapeCatalogHtml(pengarang)}</td>
                <td>${escapeCatalogHtml(penerbit)}</td>
                <td style="text-align:center;">${escapeCatalogHtml(tahun)}</td>
                <td style="text-align:center;">${escapeCatalogHtml(kategori)}</td>
                <td style="text-align:center; font-weight:bold;">${stokAwal}</td>
                <td style="text-align:center; font-weight:bold; color:#16a34a;">${sisa}</td>
                <td style="text-align:center;">${escapeCatalogHtml(sumber)}</td>
                <td style="text-align:center; ${rusak > 0 ? 'color:#dc2626; font-weight:bold;' : ''}">${rusak}</td>
            </tr>
        `;
    });

    const printHtml = `<!DOCTYPE html>
<html>
<head>
    <title>Laporan Data Buku Perpustakaan</title>
    <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: Arial, sans-serif; margin: 0; padding: 10px; font-size: 11px; color: #1e293b; }
        .report-header { text-align: center; margin-bottom: 15px; border-bottom: 2px solid #333; padding-bottom: 8px; }
        .report-title { font-size: 16px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase; }
        .report-school { font-size: 13px; font-weight: bold; color: #4361ee; }
        .report-meta { font-size: 11px; color: #64748b; margin-top: 4px; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10.5px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 6px; }
        th { background-color: #f1f5f9; font-weight: bold; text-align: center; }
        tr:nth-child(even) { background-color: #f8fafc; }
    </style>
</head>
<body>
    <div class="report-header">
        <div class="report-title">Laporan Data Katalog Buku Perpustakaan</div>
        <div class="report-school">${escapeCatalogHtml(schoolName)}</div>
        <div class="report-meta">Filter Tahun: ${escapeCatalogHtml(fTahun || 'Semua Tahun')} • Total: ${targetData.length} Judul Buku</div>
    </div>
    <table>
        <thead>
            <tr>
                <th style="width:30px;">No</th>
                <th>Kode Buku</th>
                <th>Judul Buku</th>
                <th>Pengarang</th>
                <th>Penerbit</th>
                <th style="width:45px;">Tahun</th>
                <th>Kategori</th>
                <th style="width:55px;">Stok Awal</th>
                <th style="width:55px;">Stok Sisa</th>
                <th>Sumber Perolehan</th>
                <th style="width:55px;">Hilang/RB</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHtml}
        </tbody>
    </table>
</body>
</html>`;

    printWindow.document.write(printHtml);
    printWindow.document.close();
    setTimeout(() => {
        printWindow.focus();
        printWindow.print();
    }, 500);
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

        select.replaceChildren(new Option('-- Semua Kelas --', ''));
        uniqueKelas.forEach(k => {
            select.add(new Option(k, k));
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
        let rows = null;
        if (window.electronAPI && typeof window.electronAPI.dumpLocalDB === 'function') {
            try {
                rows = await window.electronAPI.dumpLocalDB();
            } catch (ipcErr) {
                console.warn('IPC dumpLocalDB belum aktif pada proses utama yang sedang berjalan, menggunakan fallback:', ipcErr);
            }
        }

        // Fallback jika dumpLocalDB belum tersedia di instance Electron saat ini atau berjalan di Web
        if (!rows || !Array.isArray(rows)) {
            rows = [];
            const stores = ['cache', 'syncQueue', 'offlineTransactions', 'offlineDeletedHistory'];
            for (const store of stores) {
                const storeData = await getFromLocalDB(store) || [];
                const items = Array.isArray(storeData) ? storeData : Object.values(storeData);
                for (const item of items) {
                    if (!item) continue;
                    const key = store === 'cache' ? (item.key || item.id) : (item.id || item.key);
                    rows.push({
                        storeName: store,
                        key: String(key || Date.now()),
                        data: item,
                        updated_at: Date.now()
                    });
                }
            }
            const offCfg = localStorage.getItem('offline_app_config');
            if (offCfg) {
                try {
                    rows.push({
                        storeName: 'cache',
                        key: 'offline_app_config',
                        data: { key: 'offline_app_config', data: JSON.parse(offCfg) },
                        updated_at: Date.now()
                    });
                } catch (_) { }
            }
        }

        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rows, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute('href', dataStr);
        downloadAnchorNode.setAttribute('download', 'backup_siempus_offline_' + new Date().getTime() + '.json');
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
        Swal.fire('Berhasil!', 'Data berhasil dibackup (' + rows.length + ' catatan tersimpan).', 'success');
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
                Swal.fire('Gagal!', 'Format file JSON tidak valid (harus berupa array data backup)!', 'error');
                return;
            }
            Swal.fire({
                title: 'Konfirmasi Restore',
                text: 'Semua data lokal akan diperbarui dengan data dari file backup (' + backupData.length + ' catatan). Lanjutkan?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Ya, Restore!',
                cancelButtonText: 'Batal'
            }).then(async (result) => {
                if (result.isConfirmed) {
                    Swal.fire({ title: 'Merestore Data...', html: '<div>Menyimpan catatan ke database lokal...</div>', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
                    let restored = false;
                    if (window.electronAPI && typeof window.electronAPI.restoreLocalDB === 'function') {
                        try {
                            await window.electronAPI.restoreLocalDB(backupData);
                            restored = true;
                        } catch (ipcErr) {
                            console.warn('IPC restoreLocalDB belum aktif, menggunakan fallback saveToLocalDB:', ipcErr);
                        }
                    }

                    // Fallback jika restoreLocalDB belum aktif di main process saat ini atau di Web
                    if (!restored) {
                        const storesToClear = ['cache', 'syncQueue', 'offlineTransactions', 'offlineDeletedHistory'];
                        for (const store of storesToClear) {
                            await clearLocalDB(store);
                        }

                        const total = backupData.length;
                        for (let i = 0; i < total; i++) {
                            const row = backupData[i];
                            if (!row || !row.storeName || !row.key) continue;
                            let dataToSave = row.data;
                            if (typeof dataToSave === 'string') {
                                try {
                                    dataToSave = JSON.parse(dataToSave);
                                } catch (_) {
                                    // Gunakan string langsung jika bukan JSON (misal ID)
                                }
                            }
                            if (window.electronAPI && window.electronAPI.saveToLocalDB) {
                                await window.electronAPI.saveToLocalDB(row.storeName, row.key, dataToSave);
                            } else {
                                await saveToLocalDB(row.storeName, dataToSave);
                            }
                        }
                    }

                    updateSyncBadge();
                    Swal.fire('Berhasil!', 'Data berhasil direstore (' + backupData.length + ' catatan). Aplikasi akan dimuat ulang.', 'success').then(() => {
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
window.publicCatalogVisible = false;

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

    if (!window.publicCatalogVisible && publicCatalogCurrentAlpha === '' && search === '') {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5">
            <h5 class="text-muted fw-bold mb-3" style="font-size: 1.1rem;"><i class="fas fa-book-open me-2 text-primary"></i>Katalog Buku</h5>
            <p class="text-muted small mb-4">Silakan cari berdasarkan judul/pengarang atau klik tombol di bawah untuk menampilkan seluruh koleksi buku.</p>
            <button class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm hover-scale" onclick="window.publicCatalogVisible = true; renderPublicCatalogPage(1);">
                <i class="fas fa-list me-2"></i>Tampilkan Katalog Lengkap
            </button>
        </td></tr>`;
        if (pagination) pagination.innerHTML = '';
        return;
    }

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

window.scrollToKontak = function() {
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

    const target = document.getElementById('landing-footer');
    if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
    }
};

/* ========================================================
   MODUL BUKU KUNJUNGAN / BUKU TAMU PERPUSTAKAAN
======================================================== */

// State untuk Modal Daftar Kunjungan Publik (3 Tab terpisah & Pagination 10 baris)
let pubVisitorCategory = 'Siswa';
let pubVisitorPage = 1;
const pubVisitorRowsPerPage = 10;
let pubVisitorTotal = 0;
let pubVisitorSearch = '';
let pubVisitorDate = '';
let pubVisitorDebounce = null;

let visitorPage = 1;
const visitorRowsPerPage = 10;
let visitorData = [];
let visitorTotal = 0;

function setTamuTimeToNow() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const curDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const curTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const tglInput = document.getElementById('tamuTanggal');
    const jamInput = document.getElementById('tamuJam');
    if (tglInput) tglInput.value = curDate;
    if (jamInput) jamInput.value = curTime;
}

// Buka Modal Daftar Buku Tamu Publik (Menampilkan Tabel 3 Tab: Siswa, Guru, Tamu dengan Pagination 10 baris)
function openBukuTamuModal() {
    const modalEl = document.getElementById('modalDaftarBukuTamu');
    if (!modalEl) return;

    // Reset filter pencarian & tanggal
    const searchInput = document.getElementById('searchPubVisitor');
    const dateInput = document.getElementById('filterPubVisitorDate');
    if (searchInput) searchInput.value = '';
    if (dateInput) dateInput.value = '';
    pubVisitorSearch = '';
    pubVisitorDate = '';
    pubVisitorPage = 1;

    // Default ke Tab Siswa
    switchPublicVisitorTab('Siswa');

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

// Buka Modal Form Input Kunjungan (Khusus Admin / Petugas di Dashboard Menu Buku Kunjungan)
function openInputKunjunganModal() {
    const modalEl = document.getElementById('modalBukuTamu');
    if (!modalEl) return;

    // Reset Form
    const form = document.getElementById('formBukuTamu');
    if (form) form.reset();

    const katSiswa = document.getElementById('katSiswa');
    if (katSiswa) katSiswa.checked = true;
    handleTamuCategoryChange('Siswa');

    // Set tanggal & jam ke waktu sekarang secara otomatis
    setTamuTimeToNow();

    // Pre-load data anggota & guru ke cache memori agar rekomendasi nama muncul instan (0ms)
    getSmartMembers();
    getSmartTeachers();

    const feedback = document.getElementById('tamuNisnFeedback');
    if (feedback) feedback.innerHTML = '';

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
}

// Navigasi Tab Publik (Siswa, Guru, Tamu)
function switchPublicVisitorTab(kat) {
    pubVisitorCategory = kat;
    pubVisitorPage = 1;

    const tabSiswa = document.getElementById('tab-pub-siswa');
    const tabGuru = document.getElementById('tab-pub-guru');
    const tabTamu = document.getElementById('tab-pub-tamu');
    const paneSiswa = document.getElementById('pane-pub-siswa');
    const paneGuru = document.getElementById('pane-pub-guru');
    const paneTamu = document.getElementById('pane-pub-tamu');

    if (tabSiswa) tabSiswa.classList.toggle('active', kat === 'Siswa');
    if (tabGuru) tabGuru.classList.toggle('active', kat === 'Guru');
    if (tabTamu) tabTamu.classList.toggle('active', kat === 'Tamu');

    if (paneSiswa) {
        paneSiswa.classList.toggle('show', kat === 'Siswa');
        paneSiswa.classList.toggle('active', kat === 'Siswa');
    }
    if (paneGuru) {
        paneGuru.classList.toggle('show', kat === 'Guru');
        paneGuru.classList.toggle('active', kat === 'Guru');
    }
    if (paneTamu) {
        paneTamu.classList.toggle('show', kat === 'Tamu');
        paneTamu.classList.toggle('active', kat === 'Tamu');
    }

    loadPublicVisitors();
}

function loadPublicVisitors() {
    const activeTbodyId = pubVisitorCategory === 'Siswa' ? 'pub-siswa-table-body'
                        : pubVisitorCategory === 'Guru' ? 'pub-guru-table-body'
                        : 'pub-tamu-table-body';
    const tbody = document.getElementById(activeTbodyId);
    if (tbody) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4"><div class="spinner-border spinner-border-sm text-primary me-2"></div><span class="small text-muted">Memuat data kunjungan ${escapeHtml(pubVisitorCategory)}...</span></td></tr>`;
    }

    google.script.run
        .withSuccessHandler(res => {
            if (res && res.status !== false) {
                pubVisitorTotal = res.total || 0;
                renderPublicVisitors(res.data || []);

                if (res.stats) {
                    const badgeSiswa = document.getElementById('badge-pub-siswa');
                    const badgeGuru = document.getElementById('badge-pub-guru');
                    const badgeTamu = document.getElementById('badge-pub-tamu');
                    if (badgeSiswa && res.stats.siswa !== undefined) badgeSiswa.textContent = res.stats.siswa;
                    if (badgeGuru && res.stats.guru !== undefined) badgeGuru.textContent = res.stats.guru;
                    if (badgeTamu && res.stats.tamu !== undefined) badgeTamu.textContent = res.stats.tamu;
                }
                const activeBadgeId = pubVisitorCategory === 'Siswa' ? 'badge-pub-siswa'
                                    : pubVisitorCategory === 'Guru' ? 'badge-pub-guru'
                                    : 'badge-pub-tamu';
                const actBadge = document.getElementById(activeBadgeId);
                if (actBadge) actBadge.textContent = pubVisitorTotal;
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> ${escapeHtml(res?.message || 'Gagal memuat data')}</td></tr>`;
                updatePublicVisitorPagination(0);
            }
        })
        .withFailureHandler(err => {
            if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Terjadi kesalahan koneksi: ${escapeHtml(String(err))}</td></tr>`;
            updatePublicVisitorPagination(0);
        })
        .getVisitorList(pubVisitorPage, pubVisitorRowsPerPage, pubVisitorSearch, pubVisitorCategory, pubVisitorDate, pubVisitorDate);
}

function renderPublicVisitors(data) {
    const activeTbodyId = pubVisitorCategory === 'Siswa' ? 'pub-siswa-table-body'
                        : pubVisitorCategory === 'Guru' ? 'pub-guru-table-body'
                        : 'pub-tamu-table-body';
    const tbody = document.getElementById(activeTbodyId);
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-5 text-muted">
                    <i class="fas fa-clipboard-list fa-3x mb-2 d-block opacity-25"></i>
                    <span>Belum ada catatan kunjungan untuk kategori <b>${escapeHtml(pubVisitorCategory)}</b></span>
                </td>
            </tr>
        `;
        updatePublicVisitorPagination(0);
        return;
    }

    const startIdx = (pubVisitorPage - 1) * pubVisitorRowsPerPage;
    let html = '';

    data.forEach((row, idx) => {
        const no = startIdx + idx + 1;
        const jk = String(row.jk || 'L').toUpperCase().trim();
        const jkBadge = (jk === 'P' || jk.startsWith('P') || jk.includes('WANITA'))
            ? '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">P</span>'
            : '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">L</span>';

        if (pubVisitorCategory === 'Siswa') {
            html += `
                <tr>
                    <td class="text-center text-muted fw-bold small">${no}</td>
                    <td class="small nowrap-cell"><i class="far fa-clock me-1 text-primary opacity-75"></i>${escapeHtml(row.tanggalWaktu || '-')}</td>
                    <td><span class="badge bg-light text-primary border font-monospace">${escapeHtml(row.identitas || '-')}</span></td>
                    <td class="fw-bold text-dark"><i class="fas fa-user-graduate text-primary me-2 opacity-50"></i>${escapeHtml(row.nama || '-')}</td>
                    <td><span class="badge bg-light text-secondary border">${escapeHtml(row.kelasInstansi || '-')}</span></td>
                    <td class="text-center">${jkBadge}</td>
                    <td><span class="badge bg-primary-subtle text-primary border border-primary-subtle">${escapeHtml(row.keperluan || '-')}</span></td>
                    <td class="small text-muted text-clamp-2" title="${escapeHtml(row.keterangan || '-')}">${escapeHtml(row.keterangan || '-')}</td>
                </tr>
            `;
        } else if (pubVisitorCategory === 'Guru') {
            html += `
                <tr>
                    <td class="text-center text-muted fw-bold small">${no}</td>
                    <td class="small nowrap-cell"><i class="far fa-clock me-1 text-info opacity-75"></i>${escapeHtml(row.tanggalWaktu || '-')}</td>
                    <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(row.identitas || '-')}</span></td>
                    <td class="fw-bold text-dark"><i class="fas fa-chalkboard-teacher text-info me-2 opacity-75"></i>${escapeHtml(row.nama || '-')}</td>
                    <td><span class="badge bg-light text-dark border">${escapeHtml(row.kelasInstansi || '-')}</span></td>
                    <td class="text-center">${jkBadge}</td>
                    <td><span class="badge bg-info-subtle text-info border border-info-subtle">${escapeHtml(row.keperluan || '-')}</span></td>
                    <td class="small text-muted text-clamp-2" title="${escapeHtml(row.keterangan || '-')}">${escapeHtml(row.keterangan || '-')}</td>
                </tr>
            `;
        } else { // Tamu Luar / Umum
            html += `
                <tr>
                    <td class="text-center text-muted fw-bold small">${no}</td>
                    <td class="small nowrap-cell"><i class="far fa-clock me-1 text-warning opacity-75"></i>${escapeHtml(row.tanggalWaktu || '-')}</td>
                    <td><span class="badge bg-light text-secondary border font-monospace">${escapeHtml(row.identitas || '-')}</span></td>
                    <td class="fw-bold text-dark"><i class="fas fa-user-friends text-warning me-2 opacity-75"></i>${escapeHtml(row.nama || '-')}</td>
                    <td><span class="badge bg-warning-subtle text-dark border border-warning-subtle">${escapeHtml(row.kelasInstansi || '-')}</span></td>
                    <td class="text-center">${jkBadge}</td>
                    <td><span class="badge bg-light text-primary border">${escapeHtml(row.keperluan || '-')}</span></td>
                    <td class="small text-muted text-clamp-2" title="${escapeHtml(row.keterangan || '-')}">${escapeHtml(row.keterangan || '-')}</td>
                </tr>
            `;
        }
    });

    tbody.innerHTML = html;
    updatePublicVisitorPagination(pubVisitorTotal);
}

function updatePublicVisitorPagination(total) {
    const info = document.getElementById('pub-visitor-page-info');
    const prevBtn = document.getElementById('btnPrevPubVisitor');
    const nextBtn = document.getElementById('btnNextPubVisitor');

    const totalPages = Math.max(1, Math.ceil(total / pubVisitorRowsPerPage));
    const startItem = total === 0 ? 0 : (pubVisitorPage - 1) * pubVisitorRowsPerPage + 1;
    const endItem = Math.min(pubVisitorPage * pubVisitorRowsPerPage, total);

    if (info) {
        info.textContent = `Menampilkan ${startItem} - ${endItem} dari total ${total} data ${pubVisitorCategory} (Halaman ${pubVisitorPage} dari ${totalPages})`;
    }
    if (prevBtn) prevBtn.disabled = pubVisitorPage <= 1;
    if (nextBtn) nextBtn.disabled = pubVisitorPage >= totalPages;
}

function prevPublicVisitorPage() {
    if (pubVisitorPage > 1) {
        pubVisitorPage--;
        loadPublicVisitors();
    }
}

function nextPublicVisitorPage() {
    const totalPages = Math.ceil(pubVisitorTotal / pubVisitorRowsPerPage);
    if (pubVisitorPage < totalPages) {
        pubVisitorPage++;
        loadPublicVisitors();
    }
}

function handlePublicVisitorSearch(val) {
    clearTimeout(pubVisitorDebounce);
    pubVisitorDebounce = setTimeout(() => {
        pubVisitorSearch = (val || '').trim();
        pubVisitorPage = 1;
        loadPublicVisitors();
    }, 300);
}

function handlePublicVisitorDateChange(val) {
    pubVisitorDate = (val || '').trim();
    pubVisitorPage = 1;
    loadPublicVisitors();
}

function resetPublicVisitorFilter() {
    const searchInput = document.getElementById('searchPubVisitor');
    const dateInput = document.getElementById('filterPubVisitorDate');
    if (searchInput) searchInput.value = '';
    if (dateInput) dateInput.value = '';
    pubVisitorSearch = '';
    pubVisitorDate = '';
    pubVisitorPage = 1;
    loadPublicVisitors();
}

function handleTamuCategoryChange(kat) {
    const identitasLabel = document.getElementById('tamuIdentitasLabel');
    const identitasBadge = document.getElementById('tamuIdentitasBadge');
    const identitasInput = document.getElementById('tamuIdentitas');
    const kelasLabel = document.getElementById('tamuKelasLabel');
    const kelasInput = document.getElementById('tamuKelasInstansi');
    const namaInput = document.getElementById('tamuNama');
    const namaHint = document.getElementById('tamuNamaHint');
    const dropdown = document.getElementById('tamu-nama-suggestions');
    const feedback = document.getElementById('tamuNisnFeedback');

    if (feedback) feedback.innerHTML = '';
    if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }

    if (kat === 'Siswa') {
        if (identitasLabel) identitasLabel.textContent = 'NISN (10 Digit Angka)';
        if (identitasBadge) {
            identitasBadge.textContent = 'Wajib 10 digit';
            identitasBadge.className = 'badge bg-light text-primary border rounded-pill px-2 py-1 small';
        }
        if (identitasInput) {
            identitasInput.placeholder = 'Ketik 10 digit NISN...';
            identitasInput.maxLength = 10;
        }
        if (kelasLabel) kelasLabel.innerHTML = 'Kelas <span class="text-danger">*</span>';
        if (kelasInput) kelasInput.placeholder = 'Contoh: X-1, XI MIPA 2...';
        if (namaInput) namaInput.placeholder = 'Ketik nama siswa... (5 rekomendasi otomatis)';
        if (namaHint) {
            namaHint.innerHTML = '<i class="fas fa-magic text-primary me-1"></i> <span>Ketik nama siswa, 5 saran teratas akan muncul otomatis untuk melengkapi NISN, kelas & jenis kelamin.</span>';
            namaHint.style.display = 'block';
        }
        getSmartMembers();
    } else if (kat === 'Guru') {
        if (identitasLabel) identitasLabel.textContent = 'NIP / ID Guru & Tendik (Opsional)';
        if (identitasBadge) {
            identitasBadge.textContent = 'Opsional';
            identitasBadge.className = 'badge bg-light text-secondary border rounded-pill px-2 py-1 small';
        }
        if (identitasInput) {
            identitasInput.placeholder = 'Ketik NIP atau ID Guru...';
            identitasInput.removeAttribute('maxlength');
        }
        if (kelasLabel) kelasLabel.innerHTML = 'Mata Pelajaran / Bagian <span class="text-danger">*</span>';
        if (kelasInput) kelasInput.placeholder = 'Contoh: Guru Matematika, Tendik TU, Perpustakaan...';
        if (namaInput) namaInput.placeholder = 'Ketik nama guru/tendik... (5 rekomendasi otomatis)';
        if (namaHint) {
            namaHint.innerHTML = '<i class="fas fa-magic text-purple me-1" style="color: #7c3aed;"></i> <span>Ketik nama guru/tendik, 5 saran teratas akan muncul otomatis dari database referensi.</span>';
            namaHint.style.display = 'block';
        }
        getSmartTeachers();
    } else { // Tamu Umum
        if (identitasLabel) identitasLabel.textContent = 'No. HP / KTP / Identitas (Opsional)';
        if (identitasBadge) {
            identitasBadge.textContent = 'Opsional';
            identitasBadge.className = 'badge bg-light text-secondary border rounded-pill px-2 py-1 small';
        }
        if (identitasInput) {
            identitasInput.placeholder = 'No. HP atau identitas...';
            identitasInput.removeAttribute('maxlength');
        }
        if (kelasLabel) kelasLabel.innerHTML = 'Asal Instansi / Asal Sekolah / Lembaga <span class="text-danger">*</span>';
        if (kelasInput) kelasInput.placeholder = 'Contoh: Orang Tua Siswa, Dinas Pendidikan, dsb...';
        if (namaInput) namaInput.placeholder = 'Nama Lengkap Tamu Pengunjung...';
        if (namaHint) namaHint.style.display = 'none';
    }
}

// Normalisasi kategori buku tamu (Siswa, Guru, Tamu)
function getNormalizedTamuKategori() {
    const katRadio = document.querySelector('input[name="tamuKategori"]:checked');
    const raw = katRadio ? katRadio.value : 'Siswa';
    if (raw.includes('Guru') || raw.includes('Tendik')) return 'Guru';
    if (raw.includes('Tamu') || raw.includes('Luar')) return 'Tamu';
    return 'Siswa';
}

// Rekomendasi 5 nama siswa atau guru teratas otomatis saat mengetik nama
let tamuNamaDebounce = null;
function handleTamuNamaInput(val) {
    const kat = getNormalizedTamuKategori();
    const dropdown = document.getElementById('tamu-nama-suggestions');
    if (!dropdown) return;

    if (kat !== 'Siswa' && kat !== 'Guru') {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    const q = (val || '').trim().toLowerCase();
    if (q.length < 1) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
        return;
    }

    clearTimeout(tamuNamaDebounce);
    tamuNamaDebounce = setTimeout(() => {
        if (kat === 'Siswa') {
            getSmartMembers(members => {
                if (!Array.isArray(members) || members.length === 0) {
                    dropdown.innerHTML = '<div class="p-3 text-center text-muted small"><i class="fas fa-info-circle me-1"></i> Data siswa belum termuat atau database kosong. Anda dapat mengetik manual.</div>';
                    dropdown.style.display = 'block';
                    return;
                }

                const exactOrStarts = [];
                const wordStarts = [];
                const contains = [];

                for (let i = 0; i < members.length; i++) {
                    const m = members[i];
                    if (!m) continue;
                    const namaStr = String(m[1] || '').toLowerCase();
                    const nisnStr = String(m[0] || '').toLowerCase();

                    if (namaStr.startsWith(q)) {
                        exactOrStarts.push(m);
                    } else {
                        const words = namaStr.split(/\s+/);
                        if (words.some(w => w.startsWith(q))) {
                            wordStarts.push(m);
                        } else if (namaStr.includes(q) || nisnStr.startsWith(q)) {
                            contains.push(m);
                        }
                    }
                    if (exactOrStarts.length >= 5) break;
                }

                const filtered = [...exactOrStarts, ...wordStarts, ...contains].slice(0, 5);

                if (filtered.length === 0) {
                    dropdown.innerHTML = `<div class="p-3 text-center text-muted small"><i class="fas fa-search me-1"></i> Tidak ditemukan siswa bernama "<b>${escapeHtml(val)}</b>". Anda dapat tetap mengetik secara manual.</div>`;
                    dropdown.style.display = 'block';
                    return;
                }

                let html = '<div class="list-group list-group-flush">';
                filtered.forEach(m => {
                    const nisn = String(m[0] || '').trim();
                    const nama = String(m[1] || '').trim().toUpperCase();
                    const kelas = String(m[2] || '-').trim();
                    const jkRaw = String(m[3] || 'L').trim().toUpperCase();
                    const jk = (jkRaw === 'P' || jkRaw.startsWith('P') || jkRaw.includes('WANITA')) ? 'P' : 'L';
                    const jkText = jk === 'P' ? 'Perempuan' : 'Laki-laki';
                    const jkBadgeClass = jk === 'P' ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle';

                    const safeNisn = JSON.stringify(nisn);
                    const safeNama = JSON.stringify(nama);
                    const safeKelas = JSON.stringify(kelas);
                    const safeJk = JSON.stringify(jk);

                    html += `
                        <a href="javascript:void(0)" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center" onclick='selectTamuSiswa(${safeNisn}, ${safeNama}, ${safeKelas}, ${safeJk})'>
                            <div class="me-2 text-truncate">
                                <div class="fw-bold text-dark text-truncate">
                                    <i class="fas fa-user-graduate text-primary me-2"></i>${escapeHtml(nama)}
                                </div>
                                <div class="small mt-1 d-flex gap-1 flex-wrap">
                                    <span class="badge bg-light text-primary border font-monospace">NISN: ${escapeHtml(nisn || '-')}</span>
                                    <span class="badge bg-light text-secondary border">Kelas: ${escapeHtml(kelas || '-')}</span>
                                    <span class="badge ${jkBadgeClass}">${jkText}</span>
                                </div>
                            </div>
                            <span class="badge bg-primary text-white rounded-pill px-2 py-1 small flex-shrink-0">
                                Pilih <i class="fas fa-arrow-right ms-1"></i>
                            </span>
                        </a>
                    `;
                });
                html += '</div>';
                dropdown.innerHTML = html;
                dropdown.style.display = 'block';
            });
        } else if (kat === 'Guru') {
            getSmartTeachers(teachers => {
                if (!Array.isArray(teachers) || teachers.length === 0) {
                    dropdown.innerHTML = '<div class="p-3 text-center text-muted small"><i class="fas fa-info-circle me-1"></i> Data guru/tendik belum termuat atau database kosong. Anda dapat mengetik manual.</div>';
                    dropdown.style.display = 'block';
                    return;
                }

                const exactOrStarts = [];
                const wordStarts = [];
                const contains = [];

                for (let i = 0; i < teachers.length; i++) {
                    const t = teachers[i];
                    if (!t) continue;
                    const nip = String(Array.isArray(t) ? (t[0] || '') : (t.nip || t.id || '')).trim();
                    const nama = String(Array.isArray(t) ? (t[1] || '') : (t.nama || '')).trim();
                    const jenisPegawai = String(Array.isArray(t) ? (t[2] || 'Guru') : (t.jenisPegawai || 'Guru')).trim();
                    let jabatan = String(Array.isArray(t) ? (t[3] || '') : (t.jabatan || t.mapel || '')).trim();
                    if (!jabatan || jabatan === '-') {
                        jabatan = jenisPegawai === 'Guru' ? 'Guru Mata Pelajaran' : 'Tenaga Administrasi Sekolah (TAS)';
                    }
                    const jkRaw = String(Array.isArray(t) ? (t[4] || 'L') : (t.jk || 'L')).trim().toUpperCase();
                    const jk = (jkRaw === 'P' || jkRaw.startsWith('P') || jkRaw.includes('WANITA')) ? 'P' : 'L';

                    const item = { nip, nama, jenisPegawai, jabatan, jk };
                    const namaLower = nama.toLowerCase();
                    const nipLower = nip.toLowerCase();

                    if (namaLower.startsWith(q)) {
                        exactOrStarts.push(item);
                    } else {
                        const words = namaLower.split(/\s+/);
                        if (words.some(w => w.startsWith(q))) {
                            wordStarts.push(item);
                        } else if (namaLower.includes(q) || nipLower.startsWith(q)) {
                            contains.push(item);
                        }
                    }
                    if (exactOrStarts.length >= 5) break;
                }

                const filtered = [...exactOrStarts, ...wordStarts, ...contains].slice(0, 5);

                if (filtered.length === 0) {
                    dropdown.innerHTML = `<div class="p-3 text-center text-muted small"><i class="fas fa-search me-1"></i> Guru/Tendik "<b>${escapeHtml(val)}</b>" tidak ditemukan. Anda dapat tetap mengetik secara manual.</div>`;
                    dropdown.style.display = 'block';
                    return;
                }

                let html = '<div class="list-group list-group-flush">';
                filtered.forEach(t => {
                    const jkText = t.jk === 'P' ? 'Perempuan' : 'Laki-laki';
                    const jkBadgeClass = t.jk === 'P' ? 'bg-danger-subtle text-danger border border-danger-subtle' : 'bg-primary-subtle text-primary border border-primary-subtle';
                    const jenisBadge = t.jenisPegawai === 'Tendik'
                        ? '<span class="badge border" style="background:#e0f2fe; color:#0284c7;">Tendik</span>'
                        : '<span class="badge border" style="background:#f3e8ff; color:#7c3aed;">Guru</span>';

                    const safeNip = JSON.stringify(t.nip);
                    const safeNama = JSON.stringify(t.nama);
                    const safeJabatan = JSON.stringify(t.jabatan);
                    const safeJk = JSON.stringify(t.jk);
                    const safeJenis = JSON.stringify(t.jenisPegawai);

                    html += `
                        <a href="javascript:void(0)" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center" onclick='selectTamuGuru(${safeNip}, ${safeNama}, ${safeJabatan}, ${safeJk}, ${safeJenis})'>
                            <div class="me-2 text-truncate">
                                <div class="fw-bold text-dark text-truncate">
                                    <i class="fas fa-chalkboard-teacher me-2" style="color: #7c3aed;"></i>${escapeHtml(t.nama)}
                                </div>
                                <div class="small mt-1 d-flex gap-1 flex-wrap">
                                    ${jenisBadge}
                                    <span class="badge border font-monospace" style="background:#f8fafc; color:#475569;">NIP: ${escapeHtml(t.nip || '-')}</span>
                                    <span class="badge bg-light text-secondary border">${escapeHtml(t.jabatan)}</span>
                                    <span class="badge ${jkBadgeClass}">${jkText}</span>
                                </div>
                            </div>
                            <span class="badge text-white rounded-pill px-2 py-1 small flex-shrink-0" style="background: linear-gradient(135deg, #7c3aed, #a855f7);">
                                Pilih <i class="fas fa-arrow-right ms-1"></i>
                            </span>
                        </a>
                    `;
                });
                html += '</div>';
                dropdown.innerHTML = html;
                dropdown.style.display = 'block';
            });
        }
    }, 150);
}

function handleTamuNamaFocus() {
    const kat = getNormalizedTamuKategori();
    const isEligible = kat === 'Siswa' || kat === 'Guru';
    const input = document.getElementById('tamuNama');
    const dropdown = document.getElementById('tamu-nama-suggestions');
    if (isEligible && input && dropdown && input.value.trim().length >= 1 && dropdown.innerHTML.trim() !== '') {
        dropdown.style.display = 'block';
    }
}

function selectTamuSiswa(nisn, nama, kelas, jk) {
    const namaInp = document.getElementById('tamuNama');
    const nisnInp = document.getElementById('tamuIdentitas');
    const kelasInp = document.getElementById('tamuKelasInstansi');
    const jkInp = document.getElementById('tamuJk');
    const feedback = document.getElementById('tamuNisnFeedback');
    const dropdown = document.getElementById('tamu-nama-suggestions');

    if (namaInp) namaInp.value = nama;
    if (nisnInp) nisnInp.value = nisn;
    if (kelasInp) kelasInp.value = kelas;
    if (jkInp) {
        const cleanJk = String(jk || 'L').toUpperCase().trim();
        jkInp.value = (cleanJk === 'P' || cleanJk.startsWith('P') || cleanJk.includes('WANITA')) ? 'P' : 'L';
    }

    if (feedback) {
        feedback.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i> Data Siswa Terpilih: <b>${escapeHtml(nama)}</b> (NISN: ${escapeHtml(nisn)} | Kelas: ${escapeHtml(kelas)} | JK: ${jkInp ? jkInp.value : jk})</span>`;
    }

    if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }

    const kepInp = document.getElementById('tamuKeperluan');
    if (kepInp) kepInp.focus();
}

function selectTamuGuru(nip, nama, jabatan, jk, jenisPegawai) {
    const namaInp = document.getElementById('tamuNama');
    const nipInp = document.getElementById('tamuIdentitas');
    const kelasInp = document.getElementById('tamuKelasInstansi');
    const jkInp = document.getElementById('tamuJk');
    const feedback = document.getElementById('tamuNisnFeedback');
    const dropdown = document.getElementById('tamu-nama-suggestions');

    if (namaInp) namaInp.value = nama;
    if (nipInp) nipInp.value = nip;
    if (kelasInp) kelasInp.value = jabatan || (jenisPegawai === 'Tendik' ? 'Tenaga Kependidikan' : 'Guru Mata Pelajaran');
    if (jkInp) {
        const cleanJk = String(jk || 'L').toUpperCase().trim();
        jkInp.value = (cleanJk === 'P' || cleanJk.startsWith('P') || cleanJk.includes('WANITA')) ? 'P' : 'L';
    }

    if (feedback) {
        const jenisLabel = jenisPegawai || 'Guru/Tendik';
        feedback.innerHTML = `<span class="fw-bold" style="color: #7c3aed;"><i class="fas fa-check-circle me-1"></i> Data ${escapeHtml(jenisLabel)} Terpilih: <b>${escapeHtml(nama)}</b> (NIP: ${escapeHtml(nip)} | ${escapeHtml(kelasInp ? kelasInp.value : jabatan)})</span>`;
    }

    if (dropdown) {
        dropdown.style.display = 'none';
        dropdown.innerHTML = '';
    }

    const kepInp = document.getElementById('tamuKeperluan');
    if (kepInp) kepInp.focus();
}

let tamuNisnDebounce = null;
function handleTamuNisnInput(val) {
    const kat = getNormalizedTamuKategori();
    const isSiswa = kat === 'Siswa';
    const isGuru = kat === 'Guru';
    const clean = isSiswa ? val.replace(/[^0-9]/g, '') : val.trim();
    const input = document.getElementById('tamuIdentitas');
    if (isSiswa && input) {
        input.value = clean;
    }

    const feedback = document.getElementById('tamuNisnFeedback');
    if (!isSiswa && !isGuru) {
        if (feedback) feedback.innerHTML = '';
        return;
    }

    if (isSiswa && clean.length === 10) {
        if (feedback) feedback.innerHTML = '<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> Memeriksa data anggota...</span>';
        clearTimeout(tamuNisnDebounce);
        tamuNisnDebounce = setTimeout(() => {
            google.script.run
                .withSuccessHandler(res => {
                    if (res && res.status) {
                        const namaInp = document.getElementById('tamuNama');
                        const kelasInp = document.getElementById('tamuKelasInstansi');
                        if (namaInp && res.nama) namaInp.value = res.nama;
                        if (kelasInp && res.kelas) kelasInp.value = res.kelas;
                        if (feedback) {
                            feedback.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i> Anggota Terdaftar: ${escapeHtml(res.nama)} (${escapeHtml(res.kelas || '-')})</span>`;
                        }
                    } else {
                        if (feedback) {
                            feedback.innerHTML = '<span class="text-muted"><i class="fas fa-info-circle me-1"></i> NISN belum tercatat di data anggota. Silakan lengkapi nama & kelas manual.</span>';
                        }
                    }
                })
                .withFailureHandler(() => {
                    if (feedback) feedback.innerHTML = '';
                })
                .checkMember(clean);
        }, 300);
    } else if (isGuru && clean.length >= 3) {
        if (feedback) feedback.innerHTML = '<span style="color: #7c3aed;"><i class="fas fa-spinner fa-spin me-1"></i> Memeriksa data guru/tendik...</span>';
        clearTimeout(tamuNisnDebounce);
        tamuNisnDebounce = setTimeout(() => {
            google.script.run
                .withSuccessHandler(res => {
                    if (res && res.status) {
                        const namaInp = document.getElementById('tamuNama');
                        const kelasInp = document.getElementById('tamuKelasInstansi');
                        const jkInp = document.getElementById('tamuJk');
                        if (namaInp && res.nama) namaInp.value = res.nama;
                        const jabOrMapel = res.jabatan || res.mapel || (res.jenisPegawai === 'Tendik' ? 'Tenaga Kependidikan' : 'Guru Mata Pelajaran');
                        if (kelasInp && jabOrMapel) kelasInp.value = jabOrMapel;
                        if (jkInp && res.jk) jkInp.value = res.jk;
                        if (feedback) {
                            feedback.innerHTML = `<span class="fw-bold" style="color: #7c3aed;"><i class="fas fa-check-circle me-1"></i> Guru/Tendik Terdaftar: ${escapeHtml(res.nama)} (${escapeHtml(jabOrMapel)})</span>`;
                        }
                    } else {
                        if (feedback) feedback.innerHTML = '';
                    }
                })
                .withFailureHandler(() => {
                    if (feedback) feedback.innerHTML = '';
                })
                .checkTeacher(clean);
        }, 300);
    } else {
        if (feedback) feedback.innerHTML = '';
    }
}

function handleTamuKeperluanChange(val) {
    const ketGroup = document.getElementById('tamuKeteranganGroup');
    const ketArea = document.getElementById('tamuKeterangan');
    if (val === 'Lainnya') {
        if (ketGroup) ketGroup.classList.remove('d-none');
        if (ketArea) {
            ketArea.focus();
            ketArea.setAttribute('placeholder', 'Sebutkan keperluan kunjungan Anda di sini...');
        }
    } else {
        if (ketArea) ketArea.setAttribute('placeholder', 'Tuliskan catatan, saran atau pesan...');
    }
}

function submitBukuTamu(e) {
    if (e) e.preventDefault();

    const katRadio = document.querySelector('input[name="tamuKategori"]:checked');
    const kategori = katRadio ? katRadio.value : 'Siswa';
    const identitas = String(document.getElementById('tamuIdentitas')?.value || '').trim();
    const nama = String(document.getElementById('tamuNama')?.value || '').trim().toUpperCase();
    const kelasInstansi = String(document.getElementById('tamuKelasInstansi')?.value || '').trim();
    const jk = String(document.getElementById('tamuJk')?.value || 'L').trim();
    const keperluan = String(document.getElementById('tamuKeperluan')?.value || 'Membaca Buku').trim();
    const keterangan = String(document.getElementById('tamuKeterangan')?.value || '').trim();

    if (!nama) {
        Swal.fire('Perhatian', 'Nama lengkap pengunjung wajib diisi!', 'warning');
        return;
    }

    if (kategori === 'Siswa') {
        if (identitas && identitas.length !== 10) {
            Swal.fire('Format NISN Salah', `NISN harus tepat 10 digit angka! (Saat ini ${identitas.length} digit)`, 'warning');
            return;
        }
    }

    if (!kelasInstansi) {
        Swal.fire('Perhatian', 'Kelas atau asal instansi wajib diisi!', 'warning');
        return;
    }

    const btn = document.getElementById('btnSubmitBukuTamu');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Menyimpan...';
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const defaultDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const defaultTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // Ambil tanggal & jam dari input form yang bisa dipilih pengunjung (fallback ke waktu sekarang)
    const inputDate = String(document.getElementById('tamuTanggal')?.value || '').trim() || defaultDate;
    let inputTime = String(document.getElementById('tamuJam')?.value || '').trim() || defaultTime;
    if (inputTime.length === 5) inputTime += ':00'; // Lengkapi detik jika format HH:mm

    const tglWaktu = `${inputDate} ${inputTime}`;
    const visitorData = {
        id: 'KJG-' + Date.now() + '-' + Math.floor(Math.random() * 899 + 100),
        tanggal: inputDate,
        jam: inputTime,
        tanggalWaktu: tglWaktu,
        kategori: kategori,
        identitas: identitas,
        nama: nama,
        kelasInstansi: kelasInstansi,
        jk: jk,
        keperluan: keperluan,
        keterangan: keterangan || '-'
    };

    google.script.run
        .withSuccessHandler(res => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Simpan Catatan Kunjungan';
            }
            if (res && res.status !== false) {
                const modalEl = document.getElementById('modalBukuTamu');
                if (modalEl) {
                    const inst = bootstrap.Modal.getInstance(modalEl);
                    if (inst) inst.hide();
                }
                const form = document.getElementById('formBukuTamu');
                if (form) form.reset();

                Swal.fire({
                    icon: 'success',
                    title: 'Berhasil Disimpan!',
                    html: `Data kunjungan <b>${escapeHtml(visitorData.nama)}</b> telah berhasil dicatat.<br><span class="badge bg-primary mt-2">${escapeHtml(visitorData.kategori)}</span> <span class="badge bg-secondary mt-2">${escapeHtml(visitorData.kelasInstansi)}</span>`,
                    confirmButtonText: 'OK',
                    confirmButtonColor: '#4361ee'
                });

                // Jika halaman admin kunjungan sedang terbuka, refresh otomatis
                const activePage = window.SessionStore.get('siempus_page');
                if (activePage === 'kunjungan') {
                    loadVisitorLogs(visitorPage);
                }
                // Jika modal daftar publik sedang aktif / dibuka, refresh datanya juga
                const pubModalEl = document.getElementById('modalDaftarBukuTamu');
                if (pubModalEl && pubModalEl.classList.contains('show')) {
                    loadPublicVisitors();
                }
            } else {
                Swal.fire('Gagal Menyimpan', res?.message || 'Terjadi kesalahan sistem.', 'error');
            }
        })
        .withFailureHandler(err => {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-save me-2"></i> Simpan Catatan Kunjungan';
            }
            Swal.fire('Gagal Koneksi', 'Tidak dapat mengirim data kunjungan: ' + String(err), 'error');
        })
        .catatKunjungan(visitorData);
}

// --- ADMIN BUKU KUNJUNGAN ---

function loadVisitorLogs(page = 1) {
    visitorPage = page;
    const search = document.getElementById('searchKunjungan')?.value || '';
    const kategori = document.getElementById('filterKunjunganKategori')?.value || '';
    const startDate = document.getElementById('filterKunjunganStartDate')?.value || '';
    const endDate = document.getElementById('filterKunjunganEndDate')?.value || '';

    const tbody = document.getElementById('kunjungan-list-body');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5"><div class="spinner-border text-primary"></div><div class="small text-muted mt-2">Memuat data kunjungan...</div></td></tr>';
    }

    google.script.run
        .withSuccessHandler(res => {
            if (res && res.status !== false) {
                visitorData = res.data || [];
                visitorTotal = res.total || 0;
                renderVisitorLogs(visitorData);

                if (res.stats) {
                    const stToday = document.getElementById('stat-kunjungan-today');
                    const stSiswa = document.getElementById('stat-kunjungan-siswa');
                    const stGuru = document.getElementById('stat-kunjungan-guru');
                    const stTamu = document.getElementById('stat-kunjungan-tamu');
                    if (stToday) stToday.textContent = res.stats.today ?? 0;
                    if (stSiswa) stSiswa.textContent = res.stats.siswa ?? 0;
                    if (stGuru) stGuru.textContent = res.stats.guru ?? 0;
                    if (stTamu) stTamu.textContent = res.stats.tamu ?? 0;
                }
            } else {
                if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> ${escapeHtml(res?.message || 'Gagal memuat data')}</td></tr>`;
            }
        })
        .withFailureHandler(err => {
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center py-5 text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Gagal koneksi: ${escapeHtml(String(err))}</td></tr>`;
        })
        .getVisitorList(visitorPage, visitorRowsPerPage, search, kategori, startDate, endDate);
}

function renderVisitorLogs(data) {
    const tbody = document.getElementById('kunjungan-list-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5 text-muted"><i class="fas fa-clipboard-list fa-2x mb-2 d-block opacity-25"></i>Belum ada data kunjungan yang tercatat</td></tr>';
        updateVisitorPagination(0);
        return;
    }

    const startIdx = (visitorPage - 1) * visitorRowsPerPage;
    let html = '';
    data.forEach((row, i) => {
        const no = startIdx + i + 1;
        const kat = String(row.kategori || 'Siswa');
        let katBadge = 'bg-primary';
        if (kat.toLowerCase().includes('siswa')) katBadge = 'bg-success';
        else if (kat.toLowerCase().includes('guru') || kat.toLowerCase().includes('tendik')) katBadge = 'bg-info text-dark';
        else katBadge = 'bg-warning text-dark';

        const rowIdStr = String(row.id || '').trim();
        const idParam = escapeHtml(JSON.stringify(rowIdStr));

        html += `
            <tr>
                <td class="text-center text-muted fw-bold">${no}</td>
                <td class="small nowrap-cell"><i class="far fa-clock me-1 text-muted"></i>${escapeHtml(row.tanggalWaktu || '-')}</td>
                <td><span class="badge bg-light text-dark border font-monospace">${escapeHtml(row.identitas || '-')}</span></td>
                <td class="fw-bold text-dark">${escapeHtml(row.nama || '-')}</td>
                <td><span class="badge ${katBadge} rounded-pill px-2 py-1">${escapeHtml(kat)}</span></td>
                <td>${escapeHtml(row.kelasInstansi || '-')}</td>
                <td class="text-center"><span class="badge bg-light text-secondary border">${escapeHtml(row.jk || '-')}</span></td>
                <td><span class="badge bg-light text-primary border">${escapeHtml(row.keperluan || '-')}</span></td>
                <td class="small text-muted text-clamp-2" title="${escapeHtml(row.keterangan || '-')}">${escapeHtml(row.keterangan || '-')}</td>
                <td class="text-center nowrap-cell">
                    <button class="btn btn-outline-danger btn-sm rounded-circle shadow-xs" onclick="deleteVisitorLog(${idParam})" title="Hapus catatan kunjungan" style="width: 32px; height: 32px; padding: 0;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    updateVisitorPagination(visitorTotal);
}

function updateVisitorPagination(total) {
    const info = document.getElementById('kunjungan-page-info');
    const prevBtn = document.getElementById('btnPrevKunjungan');
    const nextBtn = document.getElementById('btnNextKunjungan');

    const totalPages = Math.max(1, Math.ceil(total / visitorRowsPerPage));
    const startItem = total === 0 ? 0 : (visitorPage - 1) * visitorRowsPerPage + 1;
    const endItem = Math.min(visitorPage * visitorRowsPerPage, total);

    if (info) info.textContent = `Menampilkan ${startItem} - ${endItem} dari total ${total} data (Hal ${visitorPage} / ${totalPages})`;
    if (prevBtn) prevBtn.disabled = visitorPage <= 1;
    if (nextBtn) nextBtn.disabled = visitorPage >= totalPages;
}

function prevVisitorPage() {
    if (visitorPage > 1) {
        loadVisitorLogs(visitorPage - 1);
    }
}

function nextVisitorPage() {
    const totalPages = Math.ceil(visitorTotal / visitorRowsPerPage);
    if (visitorPage < totalPages) {
        loadVisitorLogs(visitorPage + 1);
    }
}

function applyVisitorFilters() {
    loadVisitorLogs(1);
}

function deleteVisitorLog(id) {
    const cleanId = String(id || '').trim();
    if (!cleanId) {
        Swal.fire('Perhatian', 'ID catatan kunjungan tidak valid atau kosong.', 'warning');
        return;
    }
    Swal.fire({
        title: 'Hapus Kunjungan?',
        text: 'Catatan kunjungan ini akan dihapus permanen dari daftar.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    }).then(result => {
        if (result.isConfirmed) {
            // Optimistic update: langsung buang dari tabel agar pengguna melihat efek seketika
            if (Array.isArray(visitorData)) {
                visitorData = visitorData.filter(r => String(r.id || '').trim() !== cleanId);
                visitorTotal = Math.max(0, visitorTotal - 1);
                renderVisitorLogs(visitorData);
            }

            google.script.run
                .withSuccessHandler(res => {
                    if (res && res.status !== false) {
                        Swal.fire({
                            icon: 'success',
                            title: 'Terhapus!',
                            text: res.message || 'Catatan kunjungan berhasil dihapus.',
                            timer: 1600,
                            showConfirmButton: false
                        });
                        loadVisitorLogs(visitorPage);
                        // Refresh daftar publik jika modalnya sedang terbuka
                        const pubModalEl = document.getElementById('modalDaftarBukuTamu');
                        if (pubModalEl && pubModalEl.classList.contains('show')) {
                            loadPublicVisitors();
                        }
                    } else {
                        Swal.fire('Gagal Menghapus', res?.message || 'Tidak dapat menghapus data kunjungan.', 'error');
                        loadVisitorLogs(visitorPage);
                    }
                })
                .withFailureHandler(err => {
                    Swal.fire('Gagal Koneksi', 'Gagal menghubungi server: ' + err, 'error');
                    loadVisitorLogs(visitorPage);
                })
                .deleteVisitor(cleanId);
        }
    });
}

function getVisitorFilterPeriodText() {
    const startDate = document.getElementById('filterKunjunganStartDate')?.value || '';
    const endDate = document.getElementById('filterKunjunganEndDate')?.value || '';
    const kategori = document.getElementById('filterKunjunganKategori')?.value || '';

    let period = 'Semua Periode';
    if (startDate && endDate) {
        period = `${startDate} s/d ${endDate}`;
    } else if (startDate) {
        period = `Mulai ${startDate}`;
    } else if (endDate) {
        period = `Sampai ${endDate}`;
    }

    if (kategori && kategori !== '' && kategori !== 'semua') {
        period += ` (${kategori})`;
    }
    return period;
}

function previewVisitorLogsModal() {
    const search = document.getElementById('searchKunjungan')?.value || '';
    const kategori = document.getElementById('filterKunjunganKategori')?.value || '';
    const startDate = document.getElementById('filterKunjunganStartDate')?.value || '';
    const endDate = document.getElementById('filterKunjunganEndDate')?.value || '';

    Swal.fire({
        title: 'Memuat Pratinjau...',
        text: 'Mengambil data buku kunjungan...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    google.script.run
        .withFailureHandler(err => {
            Swal.fire('Gagal Memuat', 'Tidak dapat mengambil data: ' + String(err), 'error');
        })
        .withSuccessHandler(res => {
            const rawData = (res && res.data) ? res.data : [];
            if (!rawData || rawData.length === 0) {
                Swal.fire('Data Kosong', 'Tidak ada catatan kunjungan yang sesuai dengan filter.', 'info');
                return;
            }

            const schoolName = getHistoryExportSchoolName();
            const filterPeriod = getVisitorFilterPeriodText();
            const previewLimit = 300;
            const previewRows = rawData.slice(0, previewLimit);
            const hasMoreRows = rawData.length > previewLimit;

            // Hitung statistik kategori
            let countSiswa = 0;
            let countGuru = 0;
            let countTamu = 0;
            rawData.forEach(r => {
                const kat = String(r.kategori || '').toLowerCase();
                if (kat.includes('siswa')) countSiswa++;
                else if (kat.includes('guru') || kat.includes('tendik')) countGuru++;
                else countTamu++;
            });

            Swal.fire({
                title: 'Pratinjau Buku Kunjungan',
                width: '94vw',
                html: `
                    <div class="text-center mb-2">
                        <div class="fw-bold text-primary fs-6">LAPORAN BUKU KUNJUNGAN PERPUSTAKAAN</div>
                        <div class="small fw-semibold text-secondary">${escapeCatalogHtml(schoolName)}</div>
                        <div class="badge bg-light text-dark border mt-1">Periode Filter: ${escapeCatalogHtml(filterPeriod)}</div>
                    </div>

                    <!-- Ringkasan Cepat -->
                    <div class="row g-2 mb-2 text-start">
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-primary bg-opacity-10 border-primary">
                                <small class="text-primary fw-bold d-block" style="font-size:10.5px;">TOTAL PENGUNJUNG</small>
                                <strong class="text-primary fs-6">${rawData.length.toLocaleString('id-ID')} Orang</strong>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-success bg-opacity-10 border-success">
                                <small class="text-success fw-bold d-block" style="font-size:10.5px;">SISWA</small>
                                <strong class="text-success fs-6">${countSiswa.toLocaleString('id-ID')} Orang</strong>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-info bg-opacity-10 border-info">
                                <small class="text-info fw-bold d-block" style="font-size:10.5px;">GURU / TENDIK</small>
                                <strong class="text-info fs-6">${countGuru.toLocaleString('id-ID')} Orang</strong>
                            </div>
                        </div>
                        <div class="col-6 col-md-3">
                            <div class="p-2 border rounded bg-warning bg-opacity-10 border-warning">
                                <small class="text-warning-emphasis fw-bold d-block" style="font-size:10.5px;">TAMU UMUM</small>
                                <strong class="text-warning-emphasis fs-6">${countTamu.toLocaleString('id-ID')} Orang</strong>
                            </div>
                        </div>
                    </div>

                    <!-- Toolbar Kontrol -->
                    <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
                        <button type="button" id="visitorPreviewZoomOut" class="btn btn-sm btn-outline-secondary" title="Perkecil"><i class="fas fa-search-minus"></i></button>
                        <span id="visitorPreviewZoomLabel" class="small text-muted fw-bold">100%</span>
                        <button type="button" id="visitorPreviewZoomIn" class="btn btn-sm btn-outline-secondary" title="Perbesar"><i class="fas fa-search-plus"></i></button>
                        <span class="small text-muted ms-auto"><i class="fas fa-list me-1"></i>${rawData.length.toLocaleString('id-ID')} baris data</span>
                        <button type="button" id="visitorPreviewPrint" class="btn btn-sm btn-outline-primary fw-bold"><i class="fas fa-print me-1"></i> Cetak</button>
                        <button type="button" id="visitorPreviewDownload" class="btn btn-sm btn-success fw-bold"><i class="fas fa-download me-1"></i> Unduh Excel</button>
                    </div>

                    <!-- Frame Pratinjau Tabel -->
                    <div id="visitorPreviewFrame" class="border rounded text-start" style="height:52vh;overflow:auto;background:#fff;">
                        <div id="visitorPreviewScale" style="width:max-content;min-width:100%;">
                            <table class="table table-sm table-striped table-bordered mb-0 small align-middle">
                                <thead class="table-light sticky-top">
                                    <tr class="text-nowrap small text-muted text-center">
                                        <th style="width:35px;">No</th>
                                        <th>Waktu Kunjungan</th>
                                        <th>NISN / ID</th>
                                        <th>Nama Pengunjung</th>
                                        <th>Kategori</th>
                                        <th>Kelas / Instansi</th>
                                        <th>JK</th>
                                        <th>Keperluan</th>
                                        <th>Catatan</th>
                                    </tr>
                                </thead>
                                <tbody id="visitorPreviewTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="small text-muted text-start mt-2">
                        ${hasMoreRows ? `<i class="fas fa-info-circle me-1"></i>Pratinjau menampilkan ${previewLimit} baris pertama. Tombol Cetak dan Unduh Excel akan memuat seluruh ${rawData.length.toLocaleString('id-ID')} data.` : '<i class="fas fa-check-circle text-success me-1"></i>Pratinjau menampilkan seluruh data kunjungan yang sesuai filter.'}
                    </div>
                `,
                showConfirmButton: false,
                showCloseButton: true,
                didOpen: () => {
                    const tbody = document.getElementById('visitorPreviewTableBody');
                    if (tbody) {
                        previewRows.forEach((r, idx) => {
                            const tr = document.createElement('tr');
                            const kat = String(r.kategori || 'Siswa');
                            let katBadge = 'bg-primary';
                            if (kat.toLowerCase().includes('siswa')) katBadge = 'bg-success';
                            else if (kat.toLowerCase().includes('guru') || kat.toLowerCase().includes('tendik')) katBadge = 'bg-info text-dark';
                            else katBadge = 'bg-warning text-dark';

                            tr.innerHTML = `
                                <td class="text-center text-muted">${idx + 1}</td>
                                <td class="small nowrap-cell"><i class="far fa-clock me-1 text-muted"></i>${escapeCatalogHtml(r.tanggalWaktu || '-')}</td>
                                <td><span class="badge bg-light text-dark border font-monospace">${escapeCatalogHtml(r.identitas || '-')}</span></td>
                                <td class="fw-bold text-dark">${escapeCatalogHtml(r.nama || '-')}</td>
                                <td class="text-center"><span class="badge ${katBadge} rounded-pill px-2 py-0">${escapeCatalogHtml(kat)}</span></td>
                                <td>${escapeCatalogHtml(r.kelasInstansi || '-')}</td>
                                <td class="text-center">${escapeCatalogHtml(r.jk || '-')}</td>
                                <td>${escapeCatalogHtml(r.keperluan || '-')}</td>
                                <td class="small text-muted">${escapeCatalogHtml(r.keterangan || '-')}</td>
                            `;
                            tbody.appendChild(tr);
                        });
                    }

                    // Zoom logic
                    let zoom = 1;
                    const scale = document.getElementById('visitorPreviewScale');
                    const zoomLabel = document.getElementById('visitorPreviewZoomLabel');
                    const setZoom = nextZoom => {
                        zoom = Math.max(0.6, Math.min(1.6, nextZoom));
                        scale.style.zoom = String(zoom);
                        if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
                    };
                    document.getElementById('visitorPreviewZoomOut')?.addEventListener('click', () => setZoom(zoom - 0.1));
                    document.getElementById('visitorPreviewZoomIn')?.addEventListener('click', () => setZoom(zoom + 0.1));

                    // Unduh Excel
                    document.getElementById('visitorPreviewDownload')?.addEventListener('click', () => {
                        exportVisitorLogsDataExcel(rawData, schoolName, filterPeriod);
                    });

                    // Cetak
                    document.getElementById('visitorPreviewPrint')?.addEventListener('click', () => {
                        printVisitorLogsData(rawData, schoolName, filterPeriod);
                    });
                }
            });
        })
        .getVisitorList(1, 100000, search, kategori, startDate, endDate);
}

function exportVisitorLogsDataExcel(data, schoolName, filterPeriod) {
    if (!data || data.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data kunjungan untuk diekspor.', 'warning');
        return;
    }

    const scName = schoolName || getHistoryExportSchoolName();
    const period = filterPeriod || getVisitorFilterPeriodText();

    if (typeof ExcelJS !== 'undefined') {
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'SiE-MPuS';
        workbook.created = new Date();
        const worksheet = workbook.addWorksheet('Buku Kunjungan', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
        });

        const headers = ['No', 'Waktu Kunjungan', 'NISN / ID', 'Nama Pengunjung', 'Kategori', 'Kelas / Instansi', 'JK', 'Keperluan', 'Catatan'];
        const columnWidths = [6, 20, 16, 28, 16, 22, 8, 26, 24];
        worksheet.columns = headers.map((header, index) => ({ header, width: columnWidths[index] || 16 }));

        worksheet.mergeCells(1, 1, 1, headers.length);
        worksheet.getCell('A1').value = 'LAPORAN BUKU KUNJUNGAN PERPUSTAKAAN';
        worksheet.getCell('A1').font = { name: 'Arial', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
        worksheet.getRow(1).height = 28;

        worksheet.mergeCells(2, 1, 2, headers.length);
        worksheet.getCell('A2').value = `${scName} - Periode: ${period} - Diunduh: ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}`;
        worksheet.getCell('A2').font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF1F2937' } };
        worksheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
        worksheet.getRow(2).height = 22;
        worksheet.getRow(3).height = 8;

        const headerRow = worksheet.addRow(headers);
        headerRow.height = 26;
        headerRow.eachCell(cell => {
            cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
        });

        data.forEach((row, idx) => {
            const rowValues = [
                idx + 1,
                row.tanggalWaktu || '-',
                row.identitas || '-',
                row.nama || '-',
                row.kategori || '-',
                row.kelasInstansi || '-',
                row.jk || '-',
                row.keperluan || '-',
                row.keterangan || '-'
            ];
            const excelRow = worksheet.addRow(rowValues);
            excelRow.height = 20;
            excelRow.eachCell((cell, colNum) => {
                cell.font = { name: 'Arial', size: 10 };
                cell.alignment = { vertical: 'middle', wrapText: colNum === 4 || colNum === 8 || colNum === 9 };
                if (idx % 2 === 1) {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } };
                }
            });
            excelRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            excelRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
            excelRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
            excelRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
            excelRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
        });

        const border = { style: 'thin', color: { argb: 'FFD1D5DB' } };
        for (let r = 4; r <= worksheet.rowCount; r++) {
            worksheet.getRow(r).eachCell({ includeEmpty: true }, cell => {
                cell.border = { top: border, left: border, bottom: border, right: border };
            });
        }

        workbook.xlsx.writeBuffer().then(buffer => {
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Buku_Kunjungan_${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    } else if (typeof XLSX !== 'undefined') {
        const header = ['No', 'Waktu Kunjungan', 'NISN / ID', 'Nama Pengunjung', 'Kategori', 'Kelas / Instansi', 'Jenis Kelamin', 'Keperluan', 'Catatan'];
        const rows = data.map((r, i) => [
            i + 1, r.tanggalWaktu || '-', r.identitas || '-', r.nama || '-', r.kategori || '-', r.kelasInstansi || '-', r.jk || '-', r.keperluan || '-', r.keterangan || '-'
        ]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Buku Kunjungan');
        XLSX.writeFile(wb, `Buku_Kunjungan_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } else {
        Swal.fire('Error', 'Library ekspor Excel belum dimuat.', 'error');
    }
}

function printVisitorLogsData(data, schoolName, filterPeriod) {
    if (!data || data.length === 0) {
        Swal.fire('Data Kosong', 'Tidak ada data kunjungan untuk dicetak.', 'warning');
        return;
    }

    const scName = schoolName || getHistoryExportSchoolName();
    const alamat = document.getElementById('landing-alamat-text')?.textContent || '';
    const period = filterPeriod || getVisitorFilterPeriodText();
    const now = new Date();
    const tglCetak = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

    let countSiswa = 0;
    let countGuru = 0;
    let countTamu = 0;
    data.forEach(r => {
        const kat = String(r.kategori || '').toLowerCase();
        if (kat.includes('siswa')) countSiswa++;
        else if (kat.includes('guru') || kat.includes('tendik')) countGuru++;
        else countTamu++;
    });

    let rowsHtml = '';
    data.forEach((row, i) => {
        rowsHtml += `
            <tr>
                <td style="border: 1px solid #777; padding: 5px; text-align: center;">${i + 1}</td>
                <td style="border: 1px solid #777; padding: 5px; font-size: 9.5px;">${escapeCatalogHtml(row.tanggalWaktu || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px; font-family: monospace;">${escapeCatalogHtml(row.identitas || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px; font-weight: bold;">${escapeCatalogHtml(row.nama || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px; text-align: center;">${escapeCatalogHtml(row.kategori || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px;">${escapeCatalogHtml(row.kelasInstansi || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px; text-align: center;">${escapeCatalogHtml(row.jk || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px;">${escapeCatalogHtml(row.keperluan || '-')}</td>
                <td style="border: 1px solid #777; padding: 5px; font-size: 9.5px; color: #555;">${escapeCatalogHtml(row.keterangan || '-')}</td>
            </tr>
        `;
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        Swal.fire('Cetak Terblokir', 'Izinkan pop-up / jendela cetak pada browser Anda.', 'warning');
        return;
    }

    printWindow.document.open();
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Laporan Buku Kunjungan Perpustakaan</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 15px; color: #111; font-size: 10.5px; }
                .kop { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px; }
                .kop h2 { margin: 0; font-size: 16pt; text-transform: uppercase; }
                .kop h3 { margin: 3px 0; font-size: 13pt; color: #1e40af; }
                .kop p { margin: 0; font-size: 9pt; color: #555; }
                .stat-box { display: flex; justify-content: space-around; margin: 10px 0; border: 1px solid #cbd5e1; padding: 8px; background: #f8fafc; border-radius: 4px; }
                .stat-item { text-align: center; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 10px; }
                th { background-color: #dbeafe; border: 1px solid #777; padding: 6px; }
                thead { display: table-header-group; }
                tr { break-inside: avoid; }
                .footer { margin-top: 25px; display: flex; justify-content: flex-end; }
                .ttd { text-align: center; width: 220px; font-size: 10pt; }
                @page { size: landscape; margin: 10mm; }
            </style>
        </head>
        <body>
            <div class="kop">
                <h2>${escapeCatalogHtml(scName)}</h2>
                <h3>LAPORAN BUKU KUNJUNGAN PERPUSTAKAAN</h3>
                <p>${escapeCatalogHtml(alamat)}</p>
            </div>

            <div style="display: flex; justify-content: space-between; font-size: 9pt; margin-bottom: 6px;">
                <span>Periode: <strong>${escapeCatalogHtml(period)}</strong></span>
                <span>Dicetak: ${tglCetak} | Total: <strong>${data.length} Pengunjung</strong></span>
            </div>

            <div class="stat-box">
                <div class="stat-item"><span style="color:#64748b;">Total Pengunjung:</span><br><strong style="color:#1e40af;font-size:12px;">${data.length} Orang</strong></div>
                <div class="stat-item"><span style="color:#64748b;">Siswa:</span><br><strong style="color:#16a34a;font-size:12px;">${countSiswa} Orang</strong></div>
                <div class="stat-item"><span style="color:#64748b;">Guru / Tendik:</span><br><strong style="color:#0284c7;font-size:12px;">${countGuru} Orang</strong></div>
                <div class="stat-item"><span style="color:#64748b;">Tamu Umum:</span><br><strong style="color:#d97706;font-size:12px;">${countTamu} Orang</strong></div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th style="width: 30px;">No</th>
                        <th>Waktu Kunjungan</th>
                        <th>NISN / ID</th>
                        <th>Nama Pengunjung</th>
                        <th>Kategori</th>
                        <th>Kelas / Instansi</th>
                        <th>JK</th>
                        <th>Keperluan</th>
                        <th>Catatan</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="footer">
                <div class="ttd">
                    <p>Mengetahui,<br>Kepala Perpustakaan</p>
                    <br><br><br>
                    <p><b>( _________________________ )</b></p>
                </div>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.onafterprint = () => printWindow.close();
    printWindow.print();
}

function exportVisitorLogsToExcel() {
    previewVisitorLogsModal();
}

function printVisitorLogs() {
    previewVisitorLogsModal();
}

/* ========================================================
   WIDGET WAKTU & JAM BERGERAK (LANDING & ADMIN HEADER)
======================================================== */

function initLandingLiveClock() {
    const hariNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const bulanNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    function updateClock() {
        const dateEl = document.getElementById('landing-live-date');
        const clockEl = document.getElementById('landing-live-clock');
        const adminDateEl = document.getElementById('admin-live-date');
        const adminClockEl = document.getElementById('admin-live-clock');

        if (!dateEl && !clockEl && !adminDateEl && !adminClockEl) return;

        const now = new Date();
        const hari = hariNames[now.getDay()];
        const tgl = now.getDate();
        const bulan = bulanNames[now.getMonth()];
        const tahun = now.getFullYear();

        const pad = n => String(n).padStart(2, '0');
        const jam = pad(now.getHours());
        const menit = pad(now.getMinutes());
        const detik = pad(now.getSeconds());

        const formattedDate = `${hari}, ${tgl} ${bulan} ${tahun}`;
        const formattedTime = `${jam}:${menit}:${detik} WIB`;

        if (dateEl) dateEl.textContent = formattedDate;
        if (clockEl) clockEl.textContent = formattedTime;
        if (adminDateEl) adminDateEl.textContent = formattedDate;
        if (adminClockEl) adminClockEl.textContent = formattedTime;
    }

    updateClock();
    if (window._landingClockInterval) clearInterval(window._landingClockInterval);
    window._landingClockInterval = setInterval(updateClock, 1000);
}

// Inisialisasi otomatis jam bergerak landing
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLandingLiveClock);
} else {
    initLandingLiveClock();
}

// ============================================================
// MODUL SOP PERPUSTAKAAN & DASAR HUKUM (SIE-MPUS HYBRID)
// ============================================================

const DEFAULT_SOP_WORD_PATH = './Draft_SOP_Perpustakaan_Sekolah.docx';
const DEFAULT_SOP_WORD_FILENAME = 'Draft_SOP_Perpustakaan_Sekolah.docx';

const DEFAULT_DASAR_HUKUM_PERPUS = [
    { id: 1, jenis: "Undang-Undang", nomor: "UU No. 20 Tahun 2003", tentang: "Sistem Pendidikan Nasional", keterkaitan: "Pasal 45: Setiap satuan pendidikan wajib menyediakan sarana dan prasarana termasuk perpustakaan sebagai sumber belajar." },
    { id: 2, jenis: "Undang-Undang", nomor: "UU No. 43 Tahun 2007", tentang: "Perpustakaan", keterkaitan: "Pasal 23: Sekolah menyelenggarakan perpustakaan yang memenuhi standar nasional perpustakaan dengan alokasi minimal 5% dari anggaran operasional." },
    { id: 3, jenis: "Undang-Undang", nomor: "UU No. 25 Tahun 2009", tentang: "Pelayanan Publik", keterkaitan: "Kepastian standar pelayanan sirkulasi buku, transparansi informasi, dan perlindungan hak pemustaka." },
    { id: 4, jenis: "Undang-Undang", nomor: "UU No. 30 Tahun 2014", tentang: "Administrasi Pemerintahan", keterkaitan: "Pedoman tata kelola administrasi penyelenggaraan perpustakaan sekolah yang tertib, akuntabel, dan berkepastian hukum." },
    { id: 5, jenis: "Peraturan Pemerintah", nomor: "PP No. 24 Tahun 2014", tentang: "Pelaksanaan UU No. 43/2007 tentang Perpustakaan", keterkaitan: "Standar pembentukan, koleksi, sarana prasarana, serta pembinaan tenaga pengelola perpustakaan sekolah." },
    { id: 6, jenis: "Permendiknas", nomor: "Permendiknas No. 25 Tahun 2008", tentang: "Standar Tenaga Perpustakaan Sekolah/Madrasah", keterkaitan: "Kualifikasi dan kompetensi kepala perpustakaan sekolah serta tenaga teknis perpustakaan." },
    { id: 7, jenis: "Perka Perpusnas", nomor: "Perka Perpusnas No. 12 Tahun 2017", tentang: "Standar Nasional Perpustakaan SMA/MA", keterkaitan: "Format baku layanan sirkulasi, otomasi perpustakaan, pencatatan statistik pengunjung, dan rasio koleksi." },
    { id: 8, jenis: "PermenPAN-RB", nomor: "PermenPAN-RB No. 35 Tahun 2012", tentang: "Pedoman Penyusunan Standar Operasional Prosedur (SOP)", keterkaitan: "Pedoman matriks alur SOP administrasi pemerintahan dan format baku identitas dokumen SOP." },
    { id: 9, jenis: "Permendikbudristek", nomor: "Permendikbudristek No. 47 Tahun 2023", tentang: "Standar Pengelolaan pada PAUD, Dikdas, dan Dikmen", keterkaitan: "Pengelolaan sarana perpustakaan ramah anak, inklusif, dan mendukung penguatan literasi serta numerasi sekolah." },
    { id: 10, jenis: "Keputusan Kepala Sekolah", nomor: "SK No. [NOMOR SK KEPALA SEKOLAH]", tentang: "Pembagian Tugas Tenaga Pengelola & Tata Tertib Perpustakaan", keterkaitan: "Pemberlakuan resmi aplikasi hybrid SiE-MPuS dan tata tertib layanan peminjaman/pengembalian buku perpustakaan." }
];

let pendingSopPdfData = null;
let pendingSopPdfMeta = null;
let activeSopBlobUrl = null;

function base64ToBlob(base64, type = 'application/pdf') {
    const cleanBase64 = base64.replace(/^data:application\/pdf;base64,/, '');
    const byteCharacters = atob(cleanBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: type });
}

window.hasCustomSopPdf = function() {
    return Boolean(localStorage.getItem('sop_pdf_data') || localStorage.getItem('sop_pdf_url'));
};

window.loadSOPHukumTab = async function() {
    try {
        if (window.isElectron && window.electronAPI && typeof window.electronAPI.getOfflineSopPdf === 'function') {
            try {
                const offRes = await window.electronAPI.getOfflineSopPdf();
                if (offRes && offRes.hasCustom) {
                    if (offRes.base64) localStorage.setItem('sop_pdf_data', offRes.base64);
                    if (offRes.meta) localStorage.setItem('sop_pdf_meta', JSON.stringify(offRes.meta));
                } else if (offRes && !offRes.hasCustom) {
                    localStorage.removeItem('sop_pdf_data');
                    localStorage.removeItem('sop_pdf_meta');
                }
            } catch (_) {}
        } else {
            try {
                google.script.run
                    .withSuccessHandler(onlRes => {
                        if (onlRes && onlRes.hasCustom) {
                            if (onlRes.url) localStorage.setItem('sop_pdf_url', onlRes.url);
                            if (onlRes.meta) localStorage.setItem('sop_pdf_meta', JSON.stringify(onlRes.meta));
                            if (onlRes.base64) localStorage.setItem('sop_pdf_data', onlRes.base64);
                        } else if (onlRes && !onlRes.hasCustom) {
                            localStorage.removeItem('sop_pdf_data');
                            localStorage.removeItem('sop_pdf_meta');
                            localStorage.removeItem('sop_pdf_url');
                        }
                        updateSopTabUI();
                    })
                    .getSopPdf(false);
            } catch (_) {}
        }

        updateSopTabUI();
        renderDasarHukumTable();
    } catch (err) {
        console.error('Gagal memuat tab SOP & Dasar Hukum:', err);
    }
};

function updateSopTabUI() {
    const customSopData = localStorage.getItem('sop_pdf_data') || '';
    const customSopUrl = localStorage.getItem('sop_pdf_url') || '';
    const customLocalPath = localStorage.getItem('sop_pdf_local_path') || '';
    let customSopMeta = null;
    try {
        customSopMeta = JSON.parse(localStorage.getItem('sop_pdf_meta') || 'null');
    } catch(e) {}

    const activeFileNameEl = document.getElementById('sopActiveFileName');
    const activeMetaEl = document.getElementById('sopActiveMetaInfo');
    const activeBadgeEl = document.getElementById('sopActiveBadge');
    const btnLihatEl = document.getElementById('btnLihatSop');
    const btnUnduhTemplateWord = document.getElementById('btnUnduhTemplateWord');
    const btnHapusEl = document.getElementById('btnHapusSop');
    const iconContainerEl = document.getElementById('sopFileIconContainer');
    const fileIconEl = document.getElementById('sopFileIcon');
    const fileExtTextEl = document.getElementById('sopFileExtText');

    if ((customSopData || customSopUrl || customLocalPath) && customSopMeta) {
        // Mode: Berkas PDF Kustom Resmi Aktif
        if (activeFileNameEl) activeFileNameEl.textContent = customSopMeta.name || 'Dokumen_SOP_Perpustakaan.pdf';
        const locText = customSopMeta.origin === 'offline_local' ? 'Tersimpan di Laptop (SQLite/Offline)' : 'Tersimpan di Google Drive';
        if (activeMetaEl) activeMetaEl.textContent = `Ukuran: ${customSopMeta.sizeText || 'Berkas PDF'} • Diunggah: ${customSopMeta.updatedAt || 'Tersimpan'} • ${locText}`;
        if (activeBadgeEl) {
            activeBadgeEl.textContent = 'Dokumen Resmi Aktif (PDF)';
            activeBadgeEl.className = 'badge rounded-pill bg-success bg-opacity-10 text-success border border-success border-opacity-25 py-1 px-2.5';
        }
        if (iconContainerEl) {
            iconContainerEl.style.background = '#fef2f2';
            iconContainerEl.style.borderColor = '#fecaca';
            iconContainerEl.className = 'rounded-3 border shadow-xs d-flex flex-column align-items-center justify-content-center text-danger';
        }
        if (fileIconEl) fileIconEl.className = 'fas fa-file-pdf fa-2x text-danger';
        if (fileExtTextEl) {
            fileExtTextEl.textContent = 'PDF';
            fileExtTextEl.className = 'fw-bold text-uppercase text-danger';
        }

        // Tombol Lihat SOP muncul dan aktif
        if (btnLihatEl) {
            btnLihatEl.classList.remove('d-none');
            btnLihatEl.classList.add('d-inline-flex');
        }
        if (btnHapusEl) {
            btnHapusEl.classList.remove('d-none');
            btnHapusEl.classList.add('d-inline-flex');
        }
    } else {
        // Mode: Template Draf Mentah Word (Belum ada PDF kustom)
        if (activeFileNameEl) activeFileNameEl.textContent = DEFAULT_SOP_WORD_FILENAME;
        if (activeMetaEl) activeMetaEl.textContent = 'Format: Dokumen Word Mentah (.docx) • Belum ada berkas PDF yang diunggah. Silakan unduh untuk diedit, lalu unggah versi PDF di bawah.';
        if (activeBadgeEl) {
            activeBadgeEl.textContent = 'Template Mentah (Word)';
            activeBadgeEl.className = 'badge rounded-pill bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 py-1 px-2.5';
        }
        if (iconContainerEl) {
            iconContainerEl.style.background = '#eff6ff';
            iconContainerEl.style.borderColor = '#bfdbfe';
            iconContainerEl.className = 'rounded-3 border shadow-xs d-flex flex-column align-items-center justify-content-center text-primary';
        }
        if (fileIconEl) fileIconEl.className = 'fas fa-file-word fa-2x text-primary';
        if (fileExtTextEl) {
            fileExtTextEl.textContent = 'DOCX';
            fileExtTextEl.className = 'fw-bold text-uppercase text-primary';
        }

        // Tombol Lihat SOP dan Hapus disembunyikan
        if (btnLihatEl) {
            btnLihatEl.classList.remove('d-inline-flex');
            btnLihatEl.classList.add('d-none');
        }
        if (btnHapusEl) {
            btnHapusEl.classList.remove('d-inline-flex');
            btnHapusEl.classList.add('d-none');
        }
    }

    if (btnUnduhTemplateWord) {
        btnUnduhTemplateWord.classList.remove('d-none');
        btnUnduhTemplateWord.classList.add('d-inline-flex');
    }
}

window.handleSopFileSelected = function(e) {
    const file = e.target.files && e.target.files[0];
    const btnSave = document.getElementById('btnSaveSopPdf');
    const hintEl = document.getElementById('sopUploadHint');
    if (!file) {
        pendingSopPdfData = null;
        pendingSopPdfMeta = null;
        if (btnSave) btnSave.disabled = true;
        return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        Swal.fire({
            icon: 'warning',
            title: 'Format File Tidak Sesuai',
            text: 'Harap pilih berkas dengan format PDF (.pdf).'
        });
        e.target.value = '';
        if (btnSave) btnSave.disabled = true;
        return;
    }

    const sizeKB = (file.size / 1024).toFixed(1);
    if (file.size > 500 * 1024) {
        Swal.fire({
            icon: 'error',
            title: 'File Terlalu Besar',
            text: `Ukuran file (${sizeKB} KB) melebihi batas maksimal 500 KB. Harap gunakan berkas PDF berukuran maksimal 500 KB.`
        });
        e.target.value = '';
        if (btnSave) btnSave.disabled = true;
        return;
    }

    const reader = new FileReader();
    reader.onload = function(evt) {
        pendingSopPdfData = evt.target.result;
        pendingSopPdfMeta = {
            name: file.name,
            sizeBytes: file.size,
            sizeText: sizeKB + ' KB',
            updatedAt: new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        };
        if (btnSave) btnSave.disabled = false;
        if (hintEl) {
            hintEl.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i>File siap: ${file.name} (${sizeKB} KB). Klik "Simpan File SOP" untuk menerapkan.</span>`;
        }
    };
    reader.readAsDataURL(file);
};

window.saveSopPdfFile = async function() {
    if (!pendingSopPdfData || !pendingSopPdfMeta) {
        Swal.fire({ icon: 'info', title: 'Pilih File', text: 'Silakan pilih berkas PDF SOP terlebih dahulu (maksimal 500 KB).' });
        return;
    }

    showSmartLoading('Menyimpan SOP...', 'Menyimpan berkas SOP PDF ke sistem...');

    try {
        if (window.isElectron && window.electronAPI && typeof window.electronAPI.saveOfflineSopPdf === 'function') {
            const offRes = await window.electronAPI.saveOfflineSopPdf({
                fileDataUrl: pendingSopPdfData,
                filename: pendingSopPdfMeta.name
            });
            if (!offRes || !offRes.success) throw new Error(offRes?.message || 'Gagal menyimpan ke penyimpanan lokal laptop.');

            localStorage.setItem('sop_pdf_data', pendingSopPdfData);
            localStorage.setItem('sop_pdf_meta', JSON.stringify(offRes.meta || pendingSopPdfMeta));
            if (offRes.filePath) localStorage.setItem('sop_pdf_local_path', offRes.filePath);
            localStorage.setItem('offline_sop_pdf_pending_sync', 'true');

            Swal.fire({
                icon: 'success',
                title: 'Tersimpan di Laptop',
                text: 'Dokumen SOP kustom berhasil disimpan di laptop secara offline dan siap disinkronkan ke Google Drive.',
                timer: 2000,
                showConfirmButton: false
            });
            finishSaveSop();
        } else {
            google.script.run
                .withFailureHandler(err => {
                    Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err?.message || String(err) });
                })
                .withSuccessHandler(onlRes => {
                    if (!onlRes || !onlRes.success) {
                        Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: onlRes?.message || 'Gagal mengunggah file ke Google Drive.' });
                        return;
                    }
                    localStorage.setItem('sop_pdf_data', pendingSopPdfData);
                    localStorage.setItem('sop_pdf_meta', JSON.stringify(onlRes.meta || pendingSopPdfMeta));
                    if (onlRes.url) localStorage.setItem('sop_pdf_url', onlRes.url);

                    Swal.fire({
                        icon: 'success',
                        title: 'Tersimpan di Google Drive',
                        text: 'Dokumen SOP Perpustakaan berhasil diunggah ke Google Drive dan terbuka untuk umum!',
                        timer: 2000,
                        showConfirmButton: false
                    });
                    finishSaveSop();
                })
                .uploadSopPdf(pendingSopPdfData, pendingSopPdfMeta.name);
        }
    } catch (err) {
        Swal.fire({ icon: 'error', title: 'Gagal Menyimpan', text: err.message || String(err) });
    }
};

function finishSaveSop() {
    const inputEl = document.getElementById('inputSopPdf');
    if (inputEl) inputEl.value = '';
    const btnSave = document.getElementById('btnSaveSopPdf');
    if (btnSave) btnSave.disabled = true;
    pendingSopPdfData = null;
    pendingSopPdfMeta = null;
    updateSopTabUI();
}

window.hapusSopPdf = function() {
    Swal.fire({
        title: 'Hapus Berkas SOP Kustom?',
        text: 'Berkas SOP kustom yang diunggah akan dihapus dan sistem akan kembali menggunakan template draf Word mentah.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Hapus File',
        cancelButtonText: 'Batal'
    }).then(async (result) => {
        if (result.isConfirmed) {
            showSmartLoading('Menghapus SOP...', 'Menghapus berkas SOP kustom...');
            try {
                if (window.isElectron && window.electronAPI && typeof window.electronAPI.deleteOfflineSopPdf === 'function') {
                    await window.electronAPI.deleteOfflineSopPdf();
                } else {
                    await new Promise((resolve) => {
                        google.script.run
                            .withFailureHandler(resolve)
                            .withSuccessHandler(resolve)
                            .deleteSopPdf();
                    });
                }
            } catch (_) {}

            localStorage.removeItem('sop_pdf_data');
            localStorage.removeItem('sop_pdf_meta');
            localStorage.removeItem('sop_pdf_url');
            localStorage.removeItem('sop_pdf_local_path');
            localStorage.removeItem('offline_sop_pdf_pending_sync');
            localStorage.setItem('offline_sop_pdf_pending_delete', 'true');
            if (activeSopBlobUrl) {
                URL.revokeObjectURL(activeSopBlobUrl);
                activeSopBlobUrl = null;
            }

            Swal.fire({
                icon: 'success',
                title: 'File Kustom Dihapus',
                text: 'SOP kustom telah dihapus. Sistem kembali menampilkan template draf Word mentah.',
                timer: 1500,
                showConfirmButton: false
            });
            updateSopTabUI();
        }
    });
};

window.getActiveSopUrl = function() {
    // 1. Cek Blob URL lokal jika ada data base64 (offline SQLite maupun online)
    const customData = localStorage.getItem('sop_pdf_data');
    if (customData) {
        try {
            if (activeSopBlobUrl) URL.revokeObjectURL(activeSopBlobUrl);
            const blob = base64ToBlob(customData);
            activeSopBlobUrl = URL.createObjectURL(blob);
            return activeSopBlobUrl;
        } catch(e) {
            console.warn('Gagal membuat Blob URL dari custom SOP:', e);
            return customData;
        }
    }

    // 2. Cek Path File Lokal di Harddisk (Electron Desktop)
    const localPath = localStorage.getItem('sop_pdf_local_path');
    if (localPath && window.isElectron) {
        const normalized = localPath.replace(/\\/g, '/');
        return normalized.startsWith('file://') ? normalized : `file:///${normalized}`;
    }

    // 3. Cek URL Google Drive jika berada di web online
    const customUrl = localStorage.getItem('sop_pdf_url');
    if (customUrl && !window.isElectron) {
        return customUrl;
    }

    // 4. Fallback ke dokumen SOP PDF bawaan resmi perpustakaan sekolah standar (versi umum)
    return './Draft_SOP_Perpustakaan_Sekolah.pdf';
};

window.downloadTemplateWord = function() {
    const a = document.createElement('a');
    a.href = DEFAULT_SOP_WORD_PATH;
    a.download = DEFAULT_SOP_WORD_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
};

window.previewSopPdf = function() {
    openSOPModalLanding();
};

window.downloadSopPdf = function() {
    downloadActiveSop();
};

window.openSOPModalLanding = async function() {
    const modal = document.getElementById('modalPreviewSOP');
    const iframe = document.getElementById('iframeSOPViewer');
    const loading = document.getElementById('sopLoadingState');

    if (!modal || !iframe) return;

    // Tampilkan modal langsung
    modal.style.display = 'flex';
    if (loading) {
        loading.classList.remove('d-none');
        loading.classList.add('d-flex');
        loading.style.display = 'flex';
    }
    iframe.classList.add('d-none');

    // Coba baca dari database offline/online jika cache lokal belum terisi
    if (!localStorage.getItem('sop_pdf_data') && !localStorage.getItem('sop_pdf_url')) {
        try {
            if (window.isElectron && window.electronAPI && typeof window.electronAPI.getOfflineSopPdf === 'function') {
                const offRes = await window.electronAPI.getOfflineSopPdf();
                if (offRes && offRes.hasCustom) {
                    if (offRes.base64) localStorage.setItem('sop_pdf_data', offRes.base64);
                    if (offRes.meta) localStorage.setItem('sop_pdf_meta', JSON.stringify(offRes.meta));
                    if (offRes.localPath) localStorage.setItem('sop_pdf_local_path', offRes.localPath);
                }
            } else if (typeof google !== 'undefined' && google.script && google.script.run) {
                google.script.run
                    .withSuccessHandler(onlRes => {
                        if (onlRes && onlRes.hasCustom) {
                            if (onlRes.url) localStorage.setItem('sop_pdf_url', onlRes.url);
                            if (onlRes.meta) localStorage.setItem('sop_pdf_meta', JSON.stringify(onlRes.meta));
                            if (onlRes.base64) localStorage.setItem('sop_pdf_data', onlRes.base64);
                        }
                    })
                    .getSopPdf(false);
            }
        } catch (_) {}
    }

    const pdfUrl = getActiveSopUrl();

    // Sembunyikan spinner dan perlihatkan iframe secara halus
    const showIframeContent = () => {
        if (loading) {
            loading.classList.add('d-none');
            loading.classList.remove('d-flex');
            loading.style.display = 'none';
        }
        iframe.classList.remove('d-none');
    };

    iframe.onload = showIframeContent;
    iframe.src = pdfUrl || './SOP%20Perpustakaan%20-%20SMAN%2015%20Tebo.pdf';

    // Timer perlindungan cepat: pastikan spinner hilang dalam maksimal 350ms agar dokumen langsung tampak
    setTimeout(showIframeContent, 350);
};

window.closeSOPModal = function() {
    const modal = document.getElementById('modalPreviewSOP');
    const iframe = document.getElementById('iframeSOPViewer');
    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = 'about:blank';
};

window.downloadActiveSop = function() {
    const pdfUrl = getActiveSopUrl();
    let fileName = 'Dokumen_SOP_Perpustakaan.pdf';
    try {
        const meta = JSON.parse(localStorage.getItem('sop_pdf_meta') || 'null');
        if (meta?.name) fileName = meta.name;
    } catch(e) {}

    const a = document.createElement('a');
    a.href = pdfUrl || './SOP%20Perpustakaan%20-%20SMAN%2015%20Tebo.pdf';
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
};

window.openActiveSopNewTab = function() {
    const pdfUrl = getActiveSopUrl();
    if (pdfUrl) {
        window.open(pdfUrl, '_blank');
    } else {
        downloadTemplateWord();
    }
};

window.printActiveSop = function() {
    const iframe = document.getElementById('iframeSOPViewer');
    if (iframe && iframe.contentWindow) {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            return;
        } catch (_) {}
    }
    const pdfUrl = getActiveSopUrl();
    if (pdfUrl) {
        const printWin = window.open(pdfUrl, '_blank');
        if (printWin) {
            printWin.onload = () => printWin.print();
        }
    }
};

// ============================================================
// CRUD DASAR HUKUM PERPUSTAKAAN SEKOLAH
// ============================================================

window.getDasarHukumList = function() {
    try {
        const stored = localStorage.getItem('dasar_hukum_list');
        if (stored) return JSON.parse(stored);
    } catch(e) {}
    return DEFAULT_DASAR_HUKUM_PERPUS;
};

window.renderDasarHukumTable = function() {
    const tbody = document.getElementById('tbodyDasarHukum');
    if (!tbody) return;

    const list = getDasarHukumList();
    if (!list || list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Belum ada data dasar hukum. Klik "Reset Standar" untuk memuat 10 regulasi resmi.</td></tr>`;
        return;
    }

    const badgeColorMap = {
        'Undang-Undang': 'bg-primary text-primary border-primary',
        'Peraturan Pemerintah': 'bg-success text-success border-success',
        'Permendiknas': 'bg-info text-info border-info',
        'Permendikbud': 'bg-info text-info border-info',
        'Permendikbudristek': 'bg-info text-info border-info',
        'Perka Perpusnas': 'bg-warning text-warning border-warning',
        'PermenPAN-RB': 'bg-purple text-dark border-secondary',
        'Keputusan Kepala Sekolah': 'bg-danger text-danger border-danger',
        'Tata Tertib Perpustakaan': 'bg-dark text-dark border-dark'
    };

    let html = '';
    list.forEach((item, idx) => {
        const badgeStyle = badgeColorMap[item.jenis] || 'bg-secondary text-secondary border-secondary';
        html += `
            <tr>
                <td class="text-center fw-bold text-muted py-2.5 px-3">${idx + 1}</td>
                <td class="py-2.5 px-3">
                    <span class="badge rounded-pill bg-opacity-10 border py-1 px-2.5 ${badgeStyle}" style="font-size: 0.72rem;">${item.jenis}</span>
                </td>
                <td class="py-2.5 px-3 fw-bold text-dark font-monospace" style="font-size: 0.8rem;">${item.nomor}</td>
                <td class="py-2.5 px-3 fw-semibold text-secondary">${item.tentang}</td>
                <td class="py-2.5 px-3 text-muted" style="font-size: 0.8rem;">${item.keterkaitan}</td>
                <td class="text-center py-2.5 px-3">
                    <div class="d-flex align-items-center justify-content-center gap-1">
                        <button type="button" onclick="openModalTambahDasarHukum(${idx})" class="btn btn-sm btn-outline-primary border-0 p-1" title="Edit">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" onclick="hapusDasarHukum(${idx})" class="btn btn-sm btn-outline-danger border-0 p-1" title="Hapus">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });
    tbody.innerHTML = html;
};

window.openModalTambahDasarHukum = function(editIndex = -1) {
    const modalEl = document.getElementById('modalFormDasarHukum');
    if (!modalEl) return;
    const title = document.getElementById('modalDasarHukumTitle');
    const inputIdx = document.getElementById('editDasarHukumIndex');
    const inputJenis = document.getElementById('inputJenisRegulasi');
    const inputNomor = document.getElementById('inputNomorTahun');
    const inputTentang = document.getElementById('inputTentang');
    const inputKeterkaitan = document.getElementById('inputKeterkaitan');

    if (editIndex >= 0) {
        const list = getDasarHukumList();
        const item = list[editIndex];
        if (item) {
            title.innerHTML = '<i class="fas fa-edit me-2"></i>Edit Regulasi Dasar Hukum';
            inputIdx.value = editIndex;
            inputJenis.value = item.jenis || 'Undang-Undang';
            inputNomor.value = item.nomor || '';
            inputTentang.value = item.tentang || '';
            inputKeterkaitan.value = item.keterkaitan || '';
        }
    } else {
        title.innerHTML = '<i class="fas fa-plus-circle me-2"></i>Tambah Regulasi Dasar Hukum';
        inputIdx.value = -1;
        inputJenis.value = 'Undang-Undang';
        inputNomor.value = '';
        inputTentang.value = '';
        inputKeterkaitan.value = '';
    }

    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
};

window.closeModalDasarHukum = function() {
    const modalEl = document.getElementById('modalFormDasarHukum');
    if (modalEl) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
    }
};

window.saveDasarHukum = function(e) {
    e.preventDefault();
    const editIndex = parseInt(document.getElementById('editDasarHukumIndex').value, 10);
    const jenis = document.getElementById('inputJenisRegulasi').value.trim();
    const nomor = document.getElementById('inputNomorTahun').value.trim();
    const tentang = document.getElementById('inputTentang').value.trim();
    const keterkaitan = document.getElementById('inputKeterkaitan').value.trim();

    if (!nomor || !tentang) {
        Swal.fire({ icon: 'warning', title: 'Data Belum Lengkap', text: 'Nomor/Tahun dan Judul Regulasi wajib diisi.' });
        return;
    }

    const list = getDasarHukumList();
    const newItem = { id: Date.now(), jenis, nomor, tentang, keterkaitan };

    if (editIndex >= 0 && editIndex < list.length) {
        list[editIndex] = { ...list[editIndex], jenis, nomor, tentang, keterkaitan };
    } else {
        list.push(newItem);
    }

    localStorage.setItem('dasar_hukum_list', JSON.stringify(list));
    localStorage.setItem('offline_dasar_hukum_pending_sync', 'true');
    if (window.isElectron && window.electronAPI && typeof window.electronAPI.saveToLocalDB === 'function') {
        window.electronAPI.saveToLocalDB('cache', 'dasar_hukum_list', list);
    } else {
        try { google.script.run.saveDasarHukumList(list); } catch(_) {}
    }
    closeModalDasarHukum();
    renderDasarHukumTable();

    Swal.fire({
        icon: 'success',
        title: 'Berhasil Disimpan',
        text: 'Regulasi dasar hukum berhasil diperbarui.',
        timer: 1500,
        showConfirmButton: false
    });
};

window.hapusDasarHukum = function(index) {
    const list = getDasarHukumList();
    const item = list[index];
    if (!item) return;

    Swal.fire({
        title: 'Hapus Dasar Hukum?',
        text: `Hapus "${item.nomor} - ${item.tentang}" dari daftar?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            list.splice(index, 1);
            localStorage.setItem('dasar_hukum_list', JSON.stringify(list));
            localStorage.setItem('offline_dasar_hukum_pending_sync', 'true');
            if (window.isElectron && window.electronAPI && typeof window.electronAPI.saveToLocalDB === 'function') {
                window.electronAPI.saveToLocalDB('cache', 'dasar_hukum_list', list);
            } else {
                try { google.script.run.saveDasarHukumList(list); } catch(_) {}
            }
            renderDasarHukumTable();
            Swal.fire({ icon: 'success', title: 'Terhapus', text: 'Regulasi berhasil dihapus.', timer: 1200, showConfirmButton: false });
        }
    });
};

window.resetDasarHukumToDefault = function() {
    Swal.fire({
        title: 'Reset ke Standar?',
        text: 'Daftar dasar hukum akan dikembalikan ke 10 regulasi resmi standar perpustakaan sekolah.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#059669',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Ya, Reset Standar',
        cancelButtonText: 'Batal'
    }).then((result) => {
        if (result.isConfirmed) {
            localStorage.setItem('dasar_hukum_list', JSON.stringify(DEFAULT_DASAR_HUKUM_PERPUS));
            localStorage.setItem('offline_dasar_hukum_pending_sync', 'true');
            if (window.isElectron && window.electronAPI && typeof window.electronAPI.saveToLocalDB === 'function') {
                window.electronAPI.saveToLocalDB('cache', 'dasar_hukum_list', DEFAULT_DASAR_HUKUM_PERPUS);
            } else {
                try { google.script.run.saveDasarHukumList(DEFAULT_DASAR_HUKUM_PERPUS); } catch(_) {}
            }
            renderDasarHukumTable();
            Swal.fire({ icon: 'success', title: 'Reset Berhasil', text: '10 regulasi standar telah dipulihkan.', timer: 1500, showConfirmButton: false });
        }
    });
};
