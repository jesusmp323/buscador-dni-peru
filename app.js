// ============================================
// DNI PERU BUSCADOR — Application Logic
// ============================================

(function () {
    'use strict';

    // --- Configuration ---
    const API_URL = '/api/consulta';
    const DELAY_BETWEEN_REQUESTS = 1500; // ms between batch requests
    const MAX_ROWS = 50;

    // --- State ---
    let currentPage = 1;
    let lastSearchData = null;
    let batchResults = [];
    let isSearching = false;
    let currentBatchMode = 'grid'; // 'grid' or 'paste'

    // --- DOM References ---
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // Tabs
    const navBtns = $$('.nav-btn');
    const tabSingle = $('#tab-single');
    const tabBatch = $('#tab-batch');

    // Single search
    const singleForm = $('#single-search-form');
    const singleResults = $('#single-results');
    const singlePagination = $('#single-pagination');
    const btnPrevSingle = $('#btn-prev-single');
    const btnNextSingle = $('#btn-next-single');
    const pageInfoSingle = $('#page-info-single');
    const btnSingleSearch = $('#btn-single-search');

    // Batch - mode switcher
    const modeGrid = $('#mode-grid');
    const modePaste = $('#mode-paste');
    const batchGridMode = $('#batch-grid-mode');
    const batchPasteMode = $('#batch-paste-mode');

    // Batch - grid
    const gridRowsContainer = $('#grid-rows-container');
    const btnClearGrid = $('#btn-clear-grid');

    // Batch - paste
    const pasteTextarea = $('#paste-textarea');
    const pasteLineCount = $('#paste-line-count');

    // Batch - shared
    const btnBatchSearch = $('#btn-batch-search');
    const searchCount = $('#search-count');
    const progressSection = $('#progress-section');
    const progressFill = $('#progress-fill');
    const progressValue = $('#progress-value');
    const batchResultsEl = $('#batch-results');

    // Export
    const exportSection = $('#export-section');
    const btnExportExcel = $('#btn-export-excel');
    const btnExportPdf = $('#btn-export-pdf');
    const btnExportCopy = $('#btn-export-copy');
    const btnExportGoogle = $('#btn-export-google');
    const inputGooglePrefix = $('#google-prefix');

    // Toast
    const toast = $('#toast');
    const toastIcon = $('#toast-icon');
    const toastMessage = $('#toast-message');

    // --- Background Particles ---
    function createParticles() {
        const container = $('#bgParticles');
        for (let i = 0; i < 20; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            const size = Math.random() * 3 + 1;
            particle.style.width = size + 'px';
            particle.style.height = size + 'px';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDuration = (Math.random() * 15 + 10) + 's';
            particle.style.animationDelay = (Math.random() * 10) + 's';
            particle.style.opacity = Math.random() * 0.4 + 0.1;
            container.appendChild(particle);
        }
    }

    // --- Mouse glow effect ---
    function setupGlowEffect() {
        document.addEventListener('mousemove', (e) => {
            const cards = $$('.glass-card');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--mouse-x', x + '%');
                card.style.setProperty('--mouse-y', y + '%');
            });
        });
    }

    // --- Tab Navigation ---
    function setupTabs() {
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (tab === 'single') {
                    tabSingle.style.display = '';
                    tabBatch.style.display = 'none';
                } else {
                    tabSingle.style.display = 'none';
                    tabBatch.style.display = '';
                }
            });
        });
    }

    // --- Toast ---
    let toastTimeout;
    function showToast(message, type = 'info') {
        clearTimeout(toastTimeout);
        const icons = {
            success: '✅',
            error: '❌',
            info: 'ℹ️',
            warning: '⚠️'
        };
        toastIcon.textContent = icons[type] || icons.info;
        toastMessage.textContent = message;
        toast.className = 'toast ' + type;
        toast.offsetHeight; // reflow
        toast.classList.add('show');
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 3500);
    }

    // --- API Call ---
    async function searchDNI(apPat, apMat, nombres, pagina = 1) {
        const formData = new URLSearchParams();
        formData.append('ap_pat', apPat.toUpperCase().trim());
        formData.append('ap_mat', apMat.toUpperCase().trim());
        formData.append('nombres', nombres.toUpperCase().trim());
        formData.append('action', 'consulta_dni_api');
        formData.append('tipo', 'nombre');
        formData.append('pagina', pagina.toString());

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: formData.toString()
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        
        const result = await response.json();
        
        // Normalizar los datos si el proxy envía el nuevo formato anidado sin procesar
        if (result.success && result.data && result.data.resultados) {
            result.data = result.data.resultados.map(p => ({
                dni: p.numero,
                nombres: p.nombres,
                ap_pat: p.apellido_paterno,
                ap_mat: p.apellido_materno
            }));
        }
        
        return result;
    }

    async function fetchExtraDataByDNI(dni) {
        const formData = new URLSearchParams();
        formData.append('dni', dni.trim());
        formData.append('tipo', 'dni');

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: formData.toString()
        });

        if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
        return await response.json();
    }

    // --- Age Calculation ---
    function calculateExactAge(fechaNacStr) {
        if (!fechaNacStr) return null;
        
        let day, month, year;

        // The API returns DD/MM/YYYY. Split by any non-digit character.
        const parts = fechaNacStr.split(/\D+/).filter(Boolean);

        if (parts.length === 3) {
            if (parts[0].length === 4) {
                // Format YYYY-MM-DD
                year = parseInt(parts[0]);
                month = parseInt(parts[1]) - 1;
                day = parseInt(parts[2]);
            } else {
                // Format DD/MM/YYYY
                day = parseInt(parts[0]);
                month = parseInt(parts[1]) - 1;
                year = parseInt(parts[2]);
            }
        } else {
            // Fallback for string without separators
            const digits = fechaNacStr.replace(/\D/g, '');
            if (digits.length === 8) {
                if (parseInt(digits.substring(0, 4)) > 1900) { // YYYYMMDD
                    year = parseInt(digits.substring(0, 4));
                    month = parseInt(digits.substring(4, 6)) - 1;
                    day = parseInt(digits.substring(6, 8));
                } else { // DDMMYYYY
                    day = parseInt(digits.substring(0, 2));
                    month = parseInt(digits.substring(2, 4)) - 1;
                    year = parseInt(digits.substring(4, 8));
                }
            } else {
                return null;
            }
        }

        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

        const birthDate = new Date(year, month, day);
        const today = new Date();

        let years = today.getFullYear() - birthDate.getFullYear();
        let months = today.getMonth() - birthDate.getMonth();
        let days = today.getDate() - birthDate.getDate();

        if (days < 0) {
            months--;
            const prevMonth = new Date(today.getFullYear(), today.getMonth(), 0);
            days += prevMonth.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        // Requested by user: day, month, year separated by hyphens
        const formattedBirthdate = `${day.toString().padStart(2, '0')}-${(month + 1).toString().padStart(2, '0')}-${year}`;

        return { years, months, days, formattedBirthdate };
    }

    // --- Render Loading ---
    function renderLoader(container) {
        container.innerHTML = `
            <div class="loader-container">
                <div class="loader-dots">
                    <div class="loader-dot"></div>
                    <div class="loader-dot"></div>
                    <div class="loader-dot"></div>
                </div>
                <span class="loader-text">Consultando base de datos...</span>
            </div>
        `;
    }

    function renderResultsTable(data, container) {
        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                        <line x1="8" y1="8" x2="14" y2="14"/>
                        <line x1="14" y1="8" x2="8" y2="14"/>
                    </svg>
                    <p>No se encontraron resultados para esta búsqueda</p>
                </div>
            `;
            return;
        }
        const exactMatches = [];
        const otherMatches = [];

        if (lastSearchData) {
            const targetApPat = normalizeName(lastSearchData.apPat);
            const targetApMat = normalizeName(lastSearchData.apMat);
            const targetNombres = normalizeName(lastSearchData.nombres);

            data.forEach(p => {
                const pApPat = normalizeName(p.ap_pat);
                const pApMat = normalizeName(p.ap_mat);
                const pNombres = normalizeName(p.nombres);

                if (pApPat === targetApPat && pApMat === targetApMat && pNombres === targetNombres) {
                    exactMatches.push(p);
                } else {
                    otherMatches.push(p);
                }
            });
        } else {
            otherMatches.push(...data);
        }

        let html = '';

        const renderTableHTML = (dataset, title) => {
            if (dataset.length === 0) return '';
            
            let tHtml = `
                ${title ? `<h3 style="color: var(--primary); margin: 20px 0 10px 0; font-size: 1.1rem; border-bottom: 1px solid var(--border); padding-bottom: 8px;">${title}</h3>` : ''}
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>DNI</th>
                            <th>Nombre Completo</th>
                            <th>Nacimiento</th>
                            <th>Edad Exacta</th>
                            <th>Díg. Verif.</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            dataset.forEach(person => {
                const ageHtml = person.ageData ? `
                    <div class="age-detail">
                        <span class="age-detail-main">${person.ageData.years} años</span>
                        <span class="age-detail-sub">${person.ageData.months} meses, ${person.ageData.days} días</span>
                    </div>
                ` : '—';
                
                const birthHtml = person.ageData ? `
                    <span class="age-badge birthday">
                        🎂 ${person.ageData.formattedBirthdate}
                    </span>
                ` : '—';

                tHtml += `
                    <tr>
                        <td class="dni-cell">${escapeHtml(person.dni)}</td>
                        <td>${escapeHtml(person.ap_pat)} ${escapeHtml(person.ap_mat)}, ${escapeHtml(person.nombres)}</td>
                        <td class="birthday-cell">${birthHtml}</td>
                        <td class="age-cell">${ageHtml}</td>
                        <td class="dig-cell">${escapeHtml(person.verificador || '—')}</td>
                    </tr>
                `;
            });

            tHtml += '</tbody></table>';
            return tHtml;
        };

        if (exactMatches.length > 0) {
            html += renderTableHTML(exactMatches, '🌟 Coincidencia Principal');
        }
        
        if (otherMatches.length > 0) {
            html += renderTableHTML(otherMatches, exactMatches.length > 0 ? '👥 Otras Posibles Personas (Similares)' : '');
        }

        if (exactMatches.length === 0 && otherMatches.length === 0) {
            html += `
                <div class="no-results">
                    <p>No se encontraron resultados para esta búsqueda</p>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    // --- Render Batch Results Table ---
    function renderBatchResults() {
        if (batchResults.length === 0) return;

        let html = `
            <table class="results-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Persona Buscada</th>
                        <th>DNI</th>
                        <th>Nombre Registrado</th>
                        <th>Nacimiento</th>
                        <th>Edad Exacta</th>
                        <th>Díg. Verif.</th>
                        <th>Estado</th>
                        <th>Acción</th>
                    </tr>
                </thead>
                <tbody>
        `;

        batchResults.forEach((result, i) => {
            if (result.found && result.data.length > 0) {
                result.data.forEach((person, j) => {
                    const ageHtml = person.ageData ? `
                        <div class="age-detail">
                            <span class="age-detail-main">${person.ageData.years} años</span>
                            <span class="age-detail-sub">${person.ageData.months} meses, ${person.ageData.days} días</span>
                        </div>
                    ` : '—';
                    
                    const birthHtml = person.ageData ? `
                        <span class="age-badge birthday">
                            🎂 ${person.ageData.formattedBirthdate}
                        </span>
                    ` : '—';

                    html += `
                        <tr>
                            ${j === 0 ? `<td rowspan="${result.data.length}">${i + 1}</td>` : ''}
                            ${j === 0 ? `<td rowspan="${result.data.length}">${escapeHtml(result.searchQuery)}</td>` : ''}
                            <td class="dni-cell">${escapeHtml(person.dni)}</td>
                            <td>${escapeHtml(person.ap_pat)} ${escapeHtml(person.ap_mat)}, ${escapeHtml(person.nombres)}</td>
                            <td class="birthday-cell">${birthHtml}</td>
                            <td class="age-cell">${ageHtml}</td>
                            <td class="dig-cell">${escapeHtml(person.verificador || '—')}</td>
                            ${j === 0 ? `<td rowspan="${result.data.length}"><span class="result-status found">● Encontrado</span></td>` : ''}
                            <td>
                                <button class="btn-delete-person" data-result-index="${i}" data-person-dni="${person.dni}" title="Eliminar de la lista" style="background: hsla(0, 70%, 50%, 0.1); border: 1px solid hsla(0, 70%, 50%, 0.3); color: var(--error); cursor: pointer; padding: 6px; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px;" onmouseover="this.style.background='hsla(0, 70%, 50%, 0.2)'" onmouseout="this.style.background='hsla(0, 70%, 50%, 0.1)'">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                            </td>
                        </tr>
                    `;
                });
            } else {
                const statusClass = result.error ? 'error' : 'not-found';
                const statusText = result.error ? '● Error' : '● No encontrado';
                html += `
                    <tr>
                        <td>${i + 1}</td>
                        <td>${escapeHtml(result.searchQuery)}</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td>—</td>
                        <td class="status-cell"><span class="result-status ${statusClass}">${statusText}</span></td>
                        <td>—</td>
                    </tr>
                `;
            }
        });

        html += '</tbody></table>';
        batchResultsEl.innerHTML = html;
        exportSection.style.display = '';

        // Bind delete events
        batchResultsEl.querySelectorAll('.btn-delete-person').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const resultIndex = parseInt(btn.getAttribute('data-result-index'));
                const personDni = btn.getAttribute('data-person-dni');
                
                if (batchResults[resultIndex] && batchResults[resultIndex].data) {
                    batchResults[resultIndex].data = batchResults[resultIndex].data.filter(p => p.dni !== personDni);
                    
                    // Si ya no quedan datos para esta búsqueda, marcarla como no encontrada
                    if (batchResults[resultIndex].data.length === 0) {
                        batchResults[resultIndex].found = false;
                        batchResults[resultIndex].error = false;
                    }
                    
                    renderBatchResults(); // Re-render table
                }
            });
        });
    }

    // --- Render Error ---
    function renderError(message, container) {
        container.innerHTML = `
            <div class="no-results">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <p style="color: var(--error);">${escapeHtml(message)}</p>
            </div>
        `;
    }

    // =============================================
    // SINGLE SEARCH
    // =============================================
    function setupSingleSearch() {
        singleForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const apPat = $('#ap_pat').value;
            const apMat = $('#ap_mat').value;
            const nombres = $('#nombres').value;

            if (!apPat.trim() || !apMat.trim() || !nombres.trim()) {
                showToast('Completa todos los campos', 'warning');
                return;
            }

            currentPage = 1;
            lastSearchData = { apPat, apMat, nombres };
            await performSingleSearch(1);
        });

        btnPrevSingle.addEventListener('click', async () => {
            if (currentPage > 1) {
                currentPage--;
                await performSingleSearch(currentPage);
            }
        });

        btnNextSingle.addEventListener('click', async () => {
            currentPage++;
            await performSingleSearch(currentPage);
        });
    }

    async function performSingleSearch(page) {
        renderLoader(singleResults);
        singlePagination.style.display = 'none';
        btnSingleSearch.classList.add('loading');
        btnSingleSearch.disabled = true;

        try {
            const result = await searchDNI(
                lastSearchData.apPat,
                lastSearchData.apMat,
                lastSearchData.nombres,
                page
            );

            if (result.success && result.data && result.data.length > 0) {
                // Fetch exact age/birthdate for each found person
                for (let person of result.data) {
                    try {
                        const extraResult = await fetchExtraDataByDNI(person.dni);
                        if (extraResult.success && extraResult.data) {
                            if (extraResult.data.fecha_nac) {
                                person.ageData = calculateExactAge(extraResult.data.fecha_nac);
                            }
                            person.verificador = extraResult.data.verificador;
                            person.ubigeo = extraResult.data.ubigeo;
                        }
                    } catch (err) {
                        // Ignore extra data errors to still show the DNI
                    }
                }

                renderResultsTable(result.data, singleResults);
                singlePagination.style.display = '';
                pageInfoSingle.textContent = `Página ${page}`;
                btnPrevSingle.disabled = page <= 1;
                btnNextSingle.disabled = !result.data || result.data.length < 10;

                showToast(`Se encontraron resultados (Pág. ${page})`, 'success');
            } else if (result.success && (!result.data || result.data.length === 0)) {
                renderResultsTable([], singleResults);
                showToast('No se encontraron resultados', 'warning');
                singlePagination.style.display = 'none';
            } else {
                renderError(result.data || 'Error en la consulta', singleResults);
                showToast('Error en la consulta', 'error');
            }
        } catch (err) {
            renderError('Error de conexión. Intenta de nuevo.', singleResults);
            showToast('Error de conexión', 'error');
            console.error(err);
        } finally {
            btnSingleSearch.classList.remove('loading');
            btnSingleSearch.disabled = false;
        }
    }

    // =============================================
    // BATCH — GRID MODE (20 rows)
    // =============================================
    function createGridRows() {
        let html = '';
        for (let i = 1; i <= MAX_ROWS; i++) {
            html += `
                <div class="grid-row" data-row="${i}" id="grid-row-${i}">
                    <span class="grid-row-num">${i}</span>
                    <input type="text" data-field="ap_pat" data-row="${i}" placeholder="Ap. Paterno" autocomplete="off">
                    <input type="text" data-field="ap_mat" data-row="${i}" placeholder="Ap. Materno" autocomplete="off">
                    <input type="text" data-field="nombres" data-row="${i}" placeholder="Nombres" autocomplete="off">
                </div>
            `;
        }
        gridRowsContainer.innerHTML = html;

        // Listen for input changes to update filled state and count
        gridRowsContainer.addEventListener('input', (e) => {
            if (e.target.tagName === 'INPUT') {
                // Uppercase
                const pos = e.target.selectionStart;
                e.target.value = e.target.value.toUpperCase();
                e.target.setSelectionRange(pos, pos);

                // Update filled state for the row
                const rowNum = e.target.dataset.row;
                updateRowFilledState(rowNum);
                updateBatchCount();
            }
        });

        // Tab navigation: when pressing Tab on the last input of a row, jump to first input of next row
        gridRowsContainer.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey && e.target.tagName === 'INPUT') {
                const field = e.target.dataset.field;
                const rowNum = parseInt(e.target.dataset.row);
                if (field === 'nombres' && rowNum < MAX_ROWS) {
                    e.preventDefault();
                    const nextRowFirstInput = gridRowsContainer.querySelector(`input[data-row="${rowNum + 1}"][data-field="ap_pat"]`);
                    if (nextRowFirstInput) nextRowFirstInput.focus();
                }
            }
        });
    }

    function updateRowFilledState(rowNum) {
        const row = $(`#grid-row-${rowNum}`);
        const inputs = row.querySelectorAll('input');
        const hasData = Array.from(inputs).some(inp => inp.value.trim() !== '');
        row.classList.toggle('filled', hasData);
    }

    function getGridPeople() {
        const people = [];
        for (let i = 1; i <= MAX_ROWS; i++) {
            const row = $(`#grid-row-${i}`);
            const apPat = row.querySelector('[data-field="ap_pat"]').value.trim();
            const apMat = row.querySelector('[data-field="ap_mat"]').value.trim();
            const nombres = row.querySelector('[data-field="nombres"]').value.trim();

            if (apPat && apMat && nombres) {
                people.push({ apPat, apMat, nombres });
            }
        }
        return people;
    }

    function clearGrid() {
        for (let i = 1; i <= MAX_ROWS; i++) {
            const row = $(`#grid-row-${i}`);
            row.querySelectorAll('input').forEach(inp => { inp.value = ''; });
            row.classList.remove('filled');
        }
        updateBatchCount();
        showToast('Formulario limpiado', 'info');
    }

    // =============================================
    // BATCH — PASTE MODE
    // =============================================
    function getPastePeople() {
        const text = pasteTextarea.value.trim();
        if (!text) return [];

        const lines = text.split('\n').filter(line => line.trim() !== '');
        const people = [];

        for (const line of lines) {
            // Support formats:
            // APELLIDO_PAT, APELLIDO_MAT, NOMBRES
            // APELLIDO_PAT; APELLIDO_MAT; NOMBRES
            // APELLIDO_PAT  APELLIDO_MAT  NOMBRES (tab-separated)
            let parts;

            if (line.includes(',')) {
                parts = line.split(',').map(s => s.trim());
            } else if (line.includes(';')) {
                parts = line.split(';').map(s => s.trim());
            } else if (line.includes('\t')) {
                parts = line.split('\t').map(s => s.trim());
            } else {
                // Try splitting by multiple spaces
                parts = line.trim().split(/\s{2,}/).map(s => s.trim());
            }

            if (parts.length >= 3) {
                const apPat = parts[0].toUpperCase();
                const apMat = parts[1].toUpperCase();
                const nombres = parts.slice(2).join(' ').toUpperCase();
                if (apPat && apMat && nombres) {
                    people.push({ apPat, apMat, nombres });
                }
            }
        }

        return people.slice(0, MAX_ROWS); // Cap at 20
    }

    function updatePasteCount() {
        const people = getPastePeople();
        const count = people.length;
        pasteLineCount.textContent = count === 0
            ? '0 personas detectadas'
            : count === 1
                ? '1 persona detectada'
                : `${count} personas detectadas`;
        pasteLineCount.classList.toggle('has-data', count > 0);
        updateBatchCount();
    }

    // =============================================
    // BATCH — SHARED LOGIC
    // =============================================
    function updateBatchCount() {
        let count;
        if (currentBatchMode === 'grid') {
            count = getGridPeople().length;
        } else {
            count = getPastePeople().length;
        }
        searchCount.textContent = count;
    }

    function setupBatchModes() {
        // Mode switcher
        modeGrid.addEventListener('click', () => {
            currentBatchMode = 'grid';
            modeGrid.classList.add('active');
            modePaste.classList.remove('active');
            batchGridMode.style.display = '';
            batchPasteMode.style.display = 'none';
            updateBatchCount();
        });

        modePaste.addEventListener('click', () => {
            currentBatchMode = 'paste';
            modePaste.classList.add('active');
            modeGrid.classList.remove('active');
            batchGridMode.style.display = 'none';
            batchPasteMode.style.display = '';
            updateBatchCount();
        });

        // Paste textarea live count
        pasteTextarea.addEventListener('input', updatePasteCount);

        // Clear grid
        btnClearGrid.addEventListener('click', clearGrid);

        // Batch search
        btnBatchSearch.addEventListener('click', performBatchSearch);

        // Export
        btnExportExcel.addEventListener('click', exportToExcel);
        btnExportPdf.addEventListener('click', exportToPDF);
        btnExportCopy.addEventListener('click', copyToClipboard);
        btnExportGoogle.addEventListener('click', exportToGoogleContacts);
    }

    async function performBatchSearch() {
        let people;
        if (currentBatchMode === 'grid') {
            people = getGridPeople();
        } else {
            people = getPastePeople();
        }

        if (people.length === 0) {
            showToast('Ingresa al menos una persona con los 3 campos completos', 'warning');
            return;
        }

        if (people.length > MAX_ROWS) {
            showToast(`Máximo ${MAX_ROWS} personas por búsqueda`, 'warning');
            return;
        }

        if (isSearching) return;
        isSearching = true;

        batchResults = [];
        batchResultsEl.innerHTML = '';
        exportSection.style.display = 'none';

        // Show progress
        progressSection.style.display = '';
        progressFill.style.width = '0%';
        progressValue.textContent = '0%';

        btnBatchSearch.disabled = true;
        btnBatchSearch.classList.add('loading');

        const total = people.length;

        for (let i = 0; i < total; i++) {
            const person = people[i];
            const searchQuery = `${person.apPat} ${person.apMat}, ${person.nombres}`;

            try {
                const result = await searchDNI(person.apPat, person.apMat, person.nombres, 1);

                if (result.success && result.data && result.data.length > 0) {
                    // --- Filter to exactly match the person's name ---
                    const targetApPat = normalizeName(person.apPat);
                    const targetApMat = normalizeName(person.apMat);
                    const targetNombres = normalizeName(person.nombres);

                    const exactMatchPeople = result.data.filter(p => {
                        const pApPat = normalizeName(p.ap_pat);
                        const pApMat = normalizeName(p.ap_mat);
                        const pNombres = normalizeName(p.nombres);
                        return pApPat === targetApPat && pApMat === targetApMat && pNombres === targetNombres;
                    });

                    if (exactMatchPeople.length > 0) {
                        // We found exact matches, use only those
                        for (let p of exactMatchPeople) {
                            try {
                                const extraResult = await fetchExtraDataByDNI(p.dni);
                                if (extraResult.success && extraResult.data) {
                                    if (extraResult.data.fecha_nac) {
                                        p.ageData = calculateExactAge(extraResult.data.fecha_nac);
                                    }
                                    p.verificador = extraResult.data.verificador;
                                    p.ubigeo = extraResult.data.ubigeo;
                                }
                            } catch (err) {
                                // Ignore extra data errors to still show the DNI
                            }
                        }
                        batchResults.push({ searchQuery, found: true, data: exactMatchPeople });
                    } else {
                        // No exact match, but we have partial matches returned by the API
                        // Use all returned partial matches so the user can manually delete them
                        for (let p of result.data) {
                            try {
                                const extraResult = await fetchExtraDataByDNI(p.dni);
                                if (extraResult.success && extraResult.data) {
                                    if (extraResult.data.fecha_nac) {
                                        p.ageData = calculateExactAge(extraResult.data.fecha_nac);
                                    }
                                    p.verificador = extraResult.data.verificador;
                                    p.ubigeo = extraResult.data.ubigeo;
                                }
                            } catch (err) {
                                // Ignore
                            }
                        }
                        batchResults.push({ searchQuery, found: true, data: result.data });
                    }
                } else {
                    batchResults.push({ searchQuery, found: false, data: [], error: !result.success });
                }
            } catch (err) {
                batchResults.push({ searchQuery, found: false, data: [], error: true });
            }

            // Update progress
            const progress = Math.round(((i + 1) / total) * 100);
            progressFill.style.width = progress + '%';
            progressValue.textContent = progress + '%';

            // Delay between requests
            if (i < total - 1) {
                await sleep(DELAY_BETWEEN_REQUESTS);
            }
        }

        // Render all results
        renderBatchResults();

        // Hide progress
        progressSection.style.display = 'none';
        btnBatchSearch.disabled = false;
        btnBatchSearch.classList.remove('loading');
        isSearching = false;

        const found = batchResults.filter(r => r.found).length;
        showToast(`Búsqueda completada: ${found}/${total} encontrados`, 'success');
    }

    // =============================================
    // EXPORT FUNCTIONS
    // =============================================
    async function exportToExcel() {
        if (batchResults.length === 0) return;

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Resultados DNI');

        // Define columns
        sheet.columns = [
            { header: 'Persona Buscada', key: 'search', width: 30 },
            { header: 'DNI', key: 'dni', width: 15 },
            { header: 'Nombre Registrado', key: 'name', width: 35 },
            { header: 'Nacimiento', key: 'birth', width: 15 },
            { header: 'Edad Exacta', key: 'age', width: 25 },
            { header: 'Díg. Verif.', key: 'verif', width: 15 },
            { header: 'Estado', key: 'status', width: 15 }
        ];

        // Add rows
        batchResults.forEach(result => {
            if (result.found && result.data.length > 0) {
                result.data.forEach(person => {
                    let ageStr = '—';
                    let birthStr = '—';
                    if (person.ageData) {
                        ageStr = `${person.ageData.years} años, ${person.ageData.months} meses, ${person.ageData.days} días`;
                        birthStr = person.ageData.formattedBirthdate;
                    }
                    
                    sheet.addRow({
                        search: result.searchQuery,
                        dni: person.dni,
                        name: `${person.ap_pat} ${person.ap_mat}, ${person.nombres}`,
                        birth: birthStr,
                        age: ageStr,
                        verif: person.verificador || '—',
                        status: 'Encontrado'
                    });
                });
            } else {
                sheet.addRow({
                    search: result.searchQuery,
                    dni: '—',
                    name: '—',
                    birth: '—',
                    age: '—',
                    verif: '—',
                    status: result.error ? 'Error' : 'No encontrado'
                });
            }
        });

        // Add auto filters
        sheet.autoFilter = 'A1:G1';

        // Styling
        sheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                // Borders
                cell.border = {
                    top: {style:'thin', color: {argb:'FF8CB3D9'}},
                    left: {style:'thin', color: {argb:'FF8CB3D9'}},
                    bottom: {style:'thin', color: {argb:'FF8CB3D9'}},
                    right: {style:'thin', color: {argb:'FF8CB3D9'}}
                };
                
                // Alignment
                cell.alignment = { vertical: 'middle', horizontal: 'left' };

                if (rowNumber === 1) {
                    // Header style
                    cell.fill = {
                        type: 'pattern',
                        pattern: 'solid',
                        fgColor: { argb: 'FF12688E' } // Dark blue
                    };
                    cell.font = {
                        color: { argb: 'FFFFFFFF' },
                        bold: true
                    };
                } else {
                    // Alternating row style
                    if (rowNumber % 2 === 0) {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFD9F0FA' } // Light blue
                        };
                    } else {
                        cell.fill = {
                            type: 'pattern',
                            pattern: 'solid',
                            fgColor: { argb: 'FFFFFFFF' } // White
                        };
                    }
                }
            });
        });

        // Save
        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        saveAs(blob, `dni_resultados_${new Date().toISOString().slice(0, 10)}.xlsx`);
        showToast('Archivo Excel descargado', 'success');
    }

    function exportToPDF() {
        if (batchResults.length === 0) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('landscape'); // Landscape to fit columns

        doc.setFontSize(18);
        doc.text('Resultados de Búsqueda de DNI', 14, 20);
        
        doc.setFontSize(11);
        doc.text(`Generado el: ${new Date().toLocaleDateString()}`, 14, 28);

        const tableBody = [];
        batchResults.forEach(result => {
            if (result.found && result.data.length > 0) {
                result.data.forEach(person => {
                    let ageStr = '—';
                    let birthStr = '—';
                    if (person.ageData) {
                        ageStr = `${person.ageData.years} años, ${person.ageData.months} m, ${person.ageData.days} d`;
                        birthStr = person.ageData.formattedBirthdate;
                    }
                    tableBody.push([
                        result.searchQuery,
                        person.dni,
                        `${person.ap_pat} ${person.ap_mat}, ${person.nombres}`,
                        birthStr,
                        ageStr,
                        person.verificador || '—',
                        'Encontrado'
                    ]);
                });
            } else {
                tableBody.push([
                    result.searchQuery,
                    '—',
                    '—',
                    '—',
                    '—',
                    '—',
                    result.error ? 'Error' : 'No encontrado'
                ]);
            }
        });

        doc.autoTable({
            startY: 35,
            head: [['Persona Buscada', 'DNI', 'Nombre Registrado', 'Nacimiento', 'Edad Exacta', 'Díg. Verif.', 'Estado']],
            body: tableBody,
            theme: 'grid',
            headStyles: { fillColor: [18, 104, 142] }, // Dark blue
            alternateRowStyles: { fillColor: [217, 240, 250] }, // Light blue
            styles: { fontSize: 9 }
        });

        doc.save(`dni_resultados_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('Archivo PDF descargado', 'success');
    }

    function copyToClipboard() {
        if (batchResults.length === 0) return;

        let text = 'RESULTADOS DE BÚSQUEDA DE DNI\n';
        text += '═'.repeat(50) + '\n\n';

        batchResults.forEach((result, i) => {
            text += `${i + 1}. ${result.searchQuery}\n`;
            if (result.found && result.data.length > 0) {
                result.data.forEach(person => {
                    text += `   DNI: ${person.dni} — ${person.ap_pat} ${person.ap_mat}, ${person.nombres}\n`;
                });
            } else {
                text += `   ${result.error ? '❌ Error en consulta' : '⚠️ No encontrado'}\n`;
            }
            text += '\n';
        });

        navigator.clipboard.writeText(text).then(() => {
            showToast('Copiado al portapapeles', 'success');
        }).catch(() => {
            showToast('Error al copiar', 'error');
        });
    }

    function exportToGoogleContacts() {
        if (batchResults.length === 0) return;

        // Extraer todos los contactos encontrados
        let contacts = [];
        batchResults.forEach(result => {
            if (result.found && result.data.length > 0) {
                result.data.forEach(person => {
                    contacts.push(person);
                });
            }
        });

        if (contacts.length === 0) {
            showToast('No hay contactos encontrados para exportar', 'warning');
            return;
        }

        // Ordenar alfabéticamente por ap_pat, ap_mat, nombres
        contacts.sort((a, b) => {
            const nameA = `${a.ap_pat} ${a.ap_mat} ${a.nombres}`.toUpperCase();
            const nameB = `${b.ap_pat} ${b.ap_mat} ${b.nombres}`.toUpperCase();
            if (nameA < nameB) return -1;
            if (nameA > nameB) return 1;
            return 0;
        });

        const prefix = inputGooglePrefix.value.trim();

        // Cabecera estricta exigida por el usuario
        const header = "First Name;Middle Name;Last Name;Phonetic First Name;Phonetic Middle Name;Phonetic Last Name;Name Prefix;Name Suffix;Nickname;File As;Organization Name;Organization Title;Organization Department;Birthday;Notes;Photo;Labels;Phone 1 - Label;Phone 1 - Value\n";
        
        let csvContent = header;

        contacts.forEach(person => {
            // Formatear nombre con el prefijo
            const fullName = `${person.ap_pat} ${person.ap_mat} ${person.nombres}`;
            const firstNameCol = prefix ? `${prefix} - ${fullName}` : fullName;

            // Formatear cumpleaños YYYY-MM-DD
            let birthdayCol = '';
            if (person.ageData && person.ageData.formattedBirthdate) {
                // formattedBirthdate es DD-MM-YYYY
                const parts = person.ageData.formattedBirthdate.split('-');
                if (parts.length === 3) {
                    birthdayCol = `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
                }
            }

            // Formatear notas con el DNI
            const digito = person.verificador || '';
            const notasCol = `DNI: ${person.dni}${digito ? '-' + digito : ''}`;

            // Construir la fila con 19 columnas separadas por ';'
            const row = [
                `"${firstNameCol}"`, // First Name
                "", // Middle Name
                "", // Last Name
                "", // Phonetic First Name
                "", // Phonetic Middle Name
                "", // Phonetic Last Name
                "", // Name Prefix
                "", // Name Suffix
                "", // Nickname
                "", // File As
                "", // Organization Name
                "", // Organization Title
                "", // Organization Department
                `"${birthdayCol}"`, // Birthday
                `"${notasCol}"`, // Notes
                "", // Photo
                prefix ? `"${prefix}"` : "", // Labels
                "", // Phone 1 - Label
                ""  // Phone 1 - Value
            ];

            csvContent += row.join(';') + '\n';
        });

        // Generar Blob
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `contactos_google_${new Date().toISOString().slice(0, 10)}.csv`);
        showToast('Archivo CSV de Google Contacts descargado', 'success');
    }

    // =============================================
    // UTILITY
    // =============================================
    function normalizeName(str) {
        if (!str) return '';
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim().replace(/\s+/g, ' ');
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Auto uppercase for single-search inputs
    function setupUppercase() {
        $$('#single-search-form input[type="text"]').forEach(input => {
            input.addEventListener('input', () => {
                const pos = input.selectionStart;
                input.value = input.value.toUpperCase();
                input.setSelectionRange(pos, pos);
            });
        });
    }

    // =============================================
    // INITIALIZE
    // =============================================
    function init() {
        createParticles();
        setupGlowEffect();
        setupTabs();
        setupSingleSearch();
        createGridRows();
        setupBatchModes();
        setupUppercase();
        updateBatchCount();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
