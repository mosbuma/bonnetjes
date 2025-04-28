document.addEventListener('DOMContentLoaded', () => {
    // Initialize PDF.js
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    
    // Add header to the page
    const header = createHeader();
    document.body.insertBefore(header, document.body.firstChild);
    
    loadRecords();
    setupEventListeners();
});

let currentRecord = null;
let hasChanges = false;

function setupEventListeners() {
    const hideProcessedToggle = document.getElementById('hideProcessedToggle');
    
    // Load saved state
    const savedHideRenamed = localStorage.getItem('hideRenamed');
    if (savedHideRenamed !== null) {
        hideProcessedToggle.checked = savedHideRenamed === 'true';
    }
    
    hideProcessedToggle.addEventListener('change', () => {
        // Save state
        localStorage.setItem('hideRenamed', hideProcessedToggle.checked);
        loadRecords();
    });

    const scanTestBtn = document.getElementById('scanTestBtn');

    scanTestBtn.addEventListener('click', () => {
        runScan();
    });
}

async function runScan() {
    const button = document.getElementById('scanTestBtn');
    const originalText = button.textContent;
    
    try {
        button.disabled = true;
        button.textContent = 'Scanning...';
        
        const response = await fetch('/api/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            throw new Error('Scan failed');
        }
        
        // Reload records after successful scan
        await loadRecords();
    } catch (error) {
        console.error('Error running scan:', error);
        alert('Error running scan. Please try again.');
    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function loadRecords() {
    try {
        const response = await fetch('/api/records');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const records = await response.json();
        displayRecords(records);
    } catch (error) {
        console.error('Error loading records:', error);
        alert('Error loading records. Please try again.');
    }
}

function displayRecords(records) {
    const container = document.getElementById('records-container');
    container.innerHTML = '';

    const hideRenamed = document.getElementById('hideProcessedToggle').checked;
    const filteredRecords = hideRenamed 
        ? records.filter(record => record.status !== 'renamed')
        : records;

    if (filteredRecords.length === 0) {
        if(!hideRenamed && records.length === 0) {
            container.innerHTML = '<p>No records found.</p>';
        } else if(hideRenamed) {
            container.innerHTML = `<p>${records.length} files not shown.</p>`;
         } else {
            container.innerHTML = '<p>No files found.</p>';
        }

        return;
    }

    filteredRecords.forEach(record => {
        const card = createRecordCard(record);
        container.appendChild(card);
    });
}

function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.setAttribute('data-path', record.originalPath);
    card.onclick = (e) => { e.preventDefault(); selectRecord(record) };
    
    const header = document.createElement('div');
    header.className = 'record-header';
    
    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';
    
    // Current filename (newPath if renamed, otherwise originalPath)
    const currentTitle = document.createElement('h3');
    const currentPath = record.newPath || record.originalPath;
    currentTitle.textContent = currentPath.split('/').pop();
    
    // Original filename (only show if different from current)
    const originalTitle = document.createElement('h4');
    originalTitle.className = 'original-filename';
    if (record.newPath) {
        originalTitle.textContent = record.originalPath.split('/').pop();
    }
    
    // Proposed filename (only show for analyzed files that aren't renamed)
    const proposedTitle = document.createElement('h4');
    proposedTitle.className = 'proposed-filename';
    if (record.status === 'analyzed' && record.status !== 'renamed') {
        proposedTitle.textContent = 'Proposed: ' + generateFileName(record.data);
    }
    
    titleContainer.appendChild(currentTitle);
    if (record.newPath) {
        titleContainer.appendChild(originalTitle);
    }
    if (record.status === 'analyzed' && record.status !== 'renamed') {
        titleContainer.appendChild(proposedTitle);
    }
    
    const status = document.createElement('span');
    status.className = `status-badge status-${record.status}`;
    status.textContent = record.status;
    
    header.appendChild(titleContainer);
    header.appendChild(status);
    
    const fields = document.createElement('div');
    fields.className = 'record-fields';
    
    // Only show fields for analyzed files that aren't renamed
    if (record.status === 'analyzed' && record.status !== 'renamed') {
        const data = record.data;
        const fieldNames = ['invoice_date', 'company_name', 'description', 'invoice_amount', 'invoice_currency'];
        
        fieldNames.forEach(fieldName => {
            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'field-group';
            
            const label = document.createElement('label');
            label.textContent = fieldName.replace('_', ' ').toUpperCase();
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = data[fieldName] || '';
            input.placeholder = `Enter ${fieldName.replace('_', ' ')}`;
            input.setAttribute('data-field', fieldName);
            
            // Add input event listeners for real-time updates
            input.addEventListener('input', () => {
                handleFieldChange(record, fieldName, input.value);
                updatePreviewFilename(card, record);
            });
            
            fieldGroup.appendChild(label);
            fieldGroup.appendChild(input);
            fields.appendChild(fieldGroup);
        });
        
        // Add action buttons
        const actionButtons = document.createElement('div');
        actionButtons.className = 'action-buttons';
        
        const analyzeButton = document.createElement('button');
        analyzeButton.className = 'btn btn-secondary btn-sm';
        analyzeButton.textContent = 'Analyze';
        analyzeButton.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await reanalyzeFile(record);
        };
        
        const renameButton = document.createElement('button');
        renameButton.className = 'btn btn-primary btn-sm';
        renameButton.textContent = 'Rename';
        renameButton.disabled = record.status === 'renamed';
        renameButton.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Rename button clicked for:', record.originalPath);
            await renameFile(record);
        };
        
        actionButtons.appendChild(analyzeButton);
        actionButtons.appendChild(renameButton);
        fields.appendChild(actionButtons);
    }
    
    card.appendChild(header);
    card.appendChild(fields);
    
    return card;
}

function selectRecord(record) {
    // Remove selected class from all cards
    document.querySelectorAll('.record-card').forEach(card => {
        card.classList.remove('selected');
    });
    
    // Add selected class to clicked card
    event.currentTarget.classList.add('selected');
    
    // Load PDF preview using the current path
    const currentPath = record.newPath || record.originalPath;
    loadPdfPreview(currentPath);
    
    currentRecord = record;
}

async function loadPdfPreview(path) {
    const viewer = document.getElementById('pdf-viewer');
    viewer.innerHTML = 'Loading...';
    
    try {
        const response = await fetch(`/api/get-pdf?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        
        const page = await pdf.getPage(1);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        viewer.innerHTML = '';
        viewer.appendChild(canvas);
        
        await page.render({
            canvasContext: context,
            viewport: viewport
        }).promise;
    } catch (error) {
        console.error('Error loading PDF:', error);
        viewer.innerHTML = 'Error loading PDF preview';
    }
}

function handleFieldChange(record, field, value) {
    const card = document.querySelector(`.record-card[data-path="${record.originalPath}"]`);
    if (card) {
        const inputs = card.querySelectorAll('input');
        const originalData = record.data;
        let hasChanges = false;
        
        inputs.forEach(input => {
            const fieldName = input.getAttribute('data-field');
            if (fieldName && input.value !== (originalData[fieldName] || '')) {
                hasChanges = true;
            }
        });
        
        updateActionButtons(card, record, hasChanges);
    }
}

function handleFilenameChange(record, value) {
    hasChanges = true;
    updateActionButtons(record);
}

function updateActionButtons(card, record, hasChanges) {
    const actionButtons = card.querySelector('.action-buttons');
    const renameButton = card.querySelector('.btn-primary');
    const resetButton = card.querySelector('.btn-secondary');
    const proposedTitle = card.querySelector('.proposed-filename');
    
    // Check if form data is valid
    const inputs = card.querySelectorAll('input');
    const data = {};
    inputs.forEach(input => {
        const field = input.getAttribute('data-field');
        if (field) {
            data[field] = input.value;
        }
    });
    
    const isValid = isFormDataValid(data);
    
    // Show/hide reset button based on changes
    resetButton.style.display = hasChanges ? 'inline-block' : 'none';
    
    // Rename button is always enabled for analyzed files
    renameButton.disabled = record.status !== 'analyzed' || !isValid;
    
    // Update proposed filename if it's an analyzed file
    if (record.status === 'analyzed') {
        proposedTitle.textContent = 'Proposed: ' + generateFileName(data);
    }
}

function isFormDataValid(data) {
    return (
        data.invoice_date !== '' &&
        data.company_name !== '' &&
        data.description !== ''
    );
}

async function applyChanges(record) {
    try {
        console.log("applyChanges",record);
        const card = document.querySelector(`.record-card[data-path="${record.originalPath}"]`);
        const inputs = card.querySelectorAll('input');
        const data = {};
        
        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            if (field === 'filename') {
                // Handle filename change
                const newPath = record.newPath ? 
                    record.newPath.replace(/[^/]+$/, input.value) : 
                    input.value;
                record.newPath = newPath;
            } else if (field) {
                data[field] = input.value;
            }
        });
        
        const response = await fetch('/api/update-record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                originalPath: record.originalPath,
                data: data
            }),
        });
        
        if (!response.ok) {
            throw new Error('Failed to update record');
        }
        
        hasChanges = false;
        updateActionButtons(card, record, hasChanges);
        loadRecords(); // Reload to show updated data
    } catch (error) {
        console.error('Error applying changes:', error);
        alert('Error applying changes. Please try again.');
    }
}

function resetChanges(record) {
    const card = document.querySelector(`.record-card[data-path="${record.originalPath}"]`);
    const inputs = card.querySelectorAll('input');
    
    inputs.forEach(input => {
        const field = input.getAttribute('data-field');
        if (field) {
            input.value = record.data[field] || '';
        }
    });
    
    updatePreviewFilename(card, record);
    updateActionButtons(card, record, false);
}

function hasCompleteData(data) {
    return (
        data.invoice_date !== '' &&
        data.company_name !== '' &&
        data.description !== '' &&
        data.invoice_amount !== ''
    );
}

async function renameFile(record) {
    console.log('renameFile called for:', record.originalPath);
    try {
        const card = document.querySelector(`.record-card[data-path="${record.originalPath}"]`);
        const inputs = card.querySelectorAll('input');
        const data = {};
        
        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            if (field) {
                data[field] = input.value;
            }
        });
        
        // Update the record with new data and set extraction_status to success
        const response = await fetch('/api/update-record', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                originalPath: record.originalPath,
                data: {
                    ...data,
                    extraction_status: 'success',
                    confidence: 'high'
                },
                status: 'analyzed'  // Set to analyzed to trigger the rename workflow
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update record');
        }
        
        // Reload records to show updated status
        await loadRecords();
        
        // If the current record was updated, update the preview
        if (currentRecord && currentRecord.originalPath === record.originalPath) {
            const newRecord = await fetch(`/api/records?path=${encodeURIComponent(record.originalPath)}`)
                .then(res => res.json())
                .then(records => records.find(r => r.originalPath === record.originalPath));
            
            if (newRecord) {
                currentRecord = newRecord;
                loadPdfPreview(newRecord.newPath || newRecord.originalPath);
            }
        }
        
        updateActionButtons(card, record, false);
    } catch (error) {
        console.error('Error updating record:', error);
        alert('Error updating record: ' + error.message);
    }
}

function updatePreviewFilename(card, record) {
    const proposedTitle = card.querySelector('.proposed-filename');
    if (proposedTitle) {
        proposedTitle.textContent = 'Proposed: ' + generateFileName(record.data);
    }
}

async function reanalyzeFile(record) {
    try {
        const response = await fetch('/api/reanalyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: record.originalPath }),
        });
        
        if (!response.ok) {
            throw new Error('Reanalysis failed');
        }
        
        // Reload records after successful reanalysis
        await loadRecords();
    } catch (error) {
        console.error('Error reanalyzing file:', error);
        alert('Error reanalyzing file. Please try again.');
    }
}

function createHeader() {
    const header = document.createElement('div');
    header.className = 'header';
    
    const title = document.createElement('h1');
    title.textContent = 'Bonnetje';
    header.appendChild(title);
    
    const controls = document.createElement('div');
    controls.className = 'row mb-3';
    
    const controlsCol = document.createElement('div');
    controlsCol.className = 'col-12';
    
    const controlsFlex = document.createElement('div');
    controlsFlex.className = 'd-flex justify-content-between align-items-center';
    
    // Add the hide processed toggle
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'form-check form-switch';
    toggleContainer.innerHTML = `
        <input class="form-check-input" type="checkbox" id="hideProcessedToggle">
        <label class="form-check-label" for="hideProcessedToggle">Hide Renamed Files</label>
    `;
    controlsFlex.appendChild(toggleContainer);
    
    // Add the scan buttons
    const scanButtons = document.createElement('div');
    scanButtons.className = 'scan-buttons';
    
    const scanTestBtn = document.createElement('button');
    scanTestBtn.className = 'btn btn-outline-primary me-2';
    scanTestBtn.id = 'scanTestBtn';
    scanTestBtn.textContent = 'Import Files';
    
    const clearStateBtn = document.createElement('button');
    clearStateBtn.className = 'btn btn-danger';
    clearStateBtn.textContent = 'Clear State';
    clearStateBtn.onclick = () => {
        if (confirm('Are you sure you want to clear the state? This will remove all analyzed files from the state.')) {
            clearStateBtn.disabled = true;
            clearStateBtn.textContent = 'Clearing...';
            fetch('/api/clear-state', {
                method: 'POST',
            })
                .then((response) => response.json())
                .then((data) => {
                    if (data.error) {
                        alert(`Error: ${data.error}`);
                    } else {
                        loadRecords();
                    }
                })
                .catch((error) => {
                    alert(`Error: ${error.message}`);
                })
                .finally(() => {
                    clearStateBtn.disabled = false;
                    clearStateBtn.textContent = 'Clear State';
                });
        }
    };
    
    scanButtons.appendChild(scanTestBtn);
    // scanButtons.appendChild(scanBtn);
    scanButtons.appendChild(clearStateBtn);
    controlsFlex.appendChild(scanButtons);
    
    controlsCol.appendChild(controlsFlex);
    controls.appendChild(controlsCol);
    header.appendChild(controls);
    
    return header;
}

