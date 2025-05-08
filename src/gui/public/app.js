import { generateFileName } from './generic-tools.js';

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
let isAnalyzingAll = false;
let shouldStopAnalysis = false;


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

    const importBtn = document.getElementById('importBtn');

    importBtn.addEventListener('click', () => {
        runScan();
    });
}

async function runScan() {
    const button = document.getElementById('importBtn');
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

function updateRecordCard(fileInfo) {
    const newCard = createRecordCard(fileInfo);

    const existingCard = document.querySelector(`.record-card[data-path="${fileInfo.id}"]`);
    if(existingCard) {
        existingCard.replaceWith(newCard);
    } else {
        document.getElementById('records-container').appendChild(newCard);
    }
}

function displayRecords(records) {
    const container = document.getElementById('records-container');
    container.innerHTML = '';

    const hideRenamed = document.getElementById('hideProcessedToggle').checked;
    const searchText = document.getElementById('searchInput').value.toLowerCase();
    
    const filteredRecords = records.filter(record => {
        // First apply the hide renamed filter
        if (hideRenamed && record.status === 'renamed') {
            return false;
        }
        
        // Then apply the search filter
        if (searchText) {
            const searchableFields = getFieldsForDocumentType(record.documentType);
            const searchableText = [
                record.currentPath,
                record.originalPath,
                record.documentType,
                ...searchableFields.map(field => record.data?.[field]).filter(Boolean)
            ].join(' ').toLowerCase();
            
            return searchableText.includes(searchText);
        }
        
        return true;
    });

    if (filteredRecords.length === 0) {
        if(!hideRenamed && records.length === 0) {
            container.innerHTML = '<p>No records found.</p>';
        } else if(hideRenamed) {
            container.innerHTML = `<p>${records.length} files not shown.</p>`;
        } else if(searchText) {
            container.innerHTML = '<p>No matching records found.</p>';
        } else {
            container.innerHTML = '<p>No files found.</p>';
        }
        return;
    }

    filteredRecords.forEach(updateRecordCard);
}

function createRecordCard(record) {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.setAttribute('data-path', record.id);
    card.onclick = (e) => { e.preventDefault(); selectRecord(record) };
    
    const header = document.createElement('div');
    header.className = 'record-header';
    
    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';
    
    // Current filename (newPath if renamed, otherwise originalPath)
    const currentTitle = document.createElement('h3');
    currentTitle.textContent = record.currentPath.split('/').pop();
    titleContainer.appendChild(currentTitle);
    
    // Add predicted filename display
    const predictedTitle = document.createElement('div');
    predictedTitle.className = 'predicted-filename';
    titleContainer.appendChild(predictedTitle);
    
    predictedTitle.textContent = generateFileName(record).split('/').pop();
    
    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'badges-container';
    
    const status = document.createElement('span');
    status.className = `status-badge status-${record.status}`;
    status.textContent = record.status;
    badgesContainer.appendChild(status);
    
    // Add document type badge
    if (record.data) {
        const typeBadge = document.createElement('span');
        typeBadge.className = 'status-badge status-type';
        
        // Determine document type based on data
        let docType = 'Invoice';
        if (record.data.movie_title) {
            docType = 'Movie Cover';
        } else if (record.data.document_category) {
            docType = 'Generic';
        }
        
        typeBadge.textContent = docType;
        badgesContainer.appendChild(typeBadge);
    }
    
    header.appendChild(titleContainer);
    header.appendChild(badgesContainer);
    
    const fields = document.createElement('div');
    fields.className = 'record-fields';
    
    // Only show fields for analyzed files that aren't renamed
    if (record.data !== undefined) {
        let fieldNames = [];
        
        // Determine fields based on document type
        if (record.data.movie_title) {
            // Movie cover fields
            fieldNames = ['movie_title', 'movie_description', 'duration'];
        } else if (record.data.document_category) {
            // Generic document fields
            fieldNames = ['document_date', 'document_category', 'description', 'source'];
        } else {
            // Invoice fields (default)
            fieldNames = ['invoice_date', 'company_name', 'description', 'invoice_currency', 'invoice_amount'];
        }
        
        fieldNames.forEach(fieldName => {
            const fieldGroup = document.createElement('div');
            fieldGroup.className = 'field-group';
            
            const label = document.createElement('label');
            label.textContent = fieldName.replace('_', ' ').toUpperCase();
            
            const input = document.createElement('input');
            input.type = 'text';
            input.value = record.data[fieldName] || '';
            input.placeholder = `Enter ${fieldName.replace('_', ' ')}`;
            input.setAttribute('data-field', fieldName);
            
            // Add input event listeners for real-time updates
            input.addEventListener('input', () => {
                handleFieldChange(record, fieldName, input.value);
            });
            
            fieldGroup.appendChild(label);
            fieldGroup.appendChild(input);
            fields.appendChild(fieldGroup);
        });
    }
        
    // Add action buttons
    const actionButtons = document.createElement('div');
    actionButtons.className = 'action-buttons';
    
    const analyzeButton = document.createElement('button');
    analyzeButton.className = 'btn btn-secondary btn-sm';
    analyzeButton.textContent = 'Analyze';
    analyzeButton.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectRecord(record);
        await analyzeFile(record);
    };
    
    const actionButton = document.createElement('button');
    actionButton.className = 'btn btn-primary btn-sm btn-actionbutton';
    actionButton.textContent = 'Update';
    actionButton.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectRecord(record);
        const hasChanges = checkForChanges(record);
        if (hasChanges) {
            await updateDocumentData(record);
        } else {
            await renameFile(record);
        }
    };
    
    actionButtons.appendChild(analyzeButton);
    actionButtons.appendChild(actionButton);
    fields.appendChild(actionButtons);
    
    card.appendChild(header);
    card.appendChild(fields);
    
    // Initialize button state
    updateActionButtons(card, record);
    
    return card;
}

function getFieldsForDocumentType(documentType) {
    switch (documentType) {
        case 'invoice':
            return ['invoice_date', 'company_name', 'description', 'invoice_currency', 'invoice_amount'];
        case 'generic':
            return ['document_date', 'document_category', 'description'];
        case 'movie_cover':
            return ['movie_title', 'movie_description', 'duration'];
        default:
            return [];
    }
}

function selectRecord(record) {
    // Remove selected class from all cards
    document.querySelectorAll('.record-card').forEach(card => {
        card.classList.remove('selected');
    });

    // Add selected class to the card for this record
    const card = document.querySelector(`.record-card[data-path="${record.id}"]`);
    if (card) {
        card.classList.add('selected');
    }

    // Load preview based on file type
    if (record.type === 'pdf') {
        loadPdfPreview(record.currentPath);
    } else {
        loadImagePreview(record.currentPath);
    }

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

async function loadImagePreview(path) {
    const viewer = document.getElementById('pdf-viewer');
    viewer.innerHTML = 'Loading...';
    
    try {
        const response = await fetch(`/api/get-image?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        const img = document.createElement('img');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.src = url;
        
        viewer.innerHTML = '';
        viewer.appendChild(img);
    } catch (error) {
        console.error('Error loading image:', error);
        viewer.innerHTML = 'Error loading image preview';
    }
}

function checkForChanges(record) {
    const card = document.querySelector(`.record-card[data-path="${record.id}"]`);
    if (!card) return false;
    
    const inputs = card.querySelectorAll('input');
    let hasChanges = false;
    
    inputs.forEach(input => {
        const fieldName = input.getAttribute('data-field');
        if (fieldName && (input.value.toString() !== (record.data[fieldName] || '').toString())) {
            hasChanges = true;
        }
    });
    
    return hasChanges;
}

async function handleFieldChange(record, field, value) {
    const card = document.querySelector(`.record-card[data-path="${record.id}"]`);
    if (!card) {
        return;
    }

    // Update the predicted filename
    const predictedTitle = card.querySelector('.predicted-filename');
    predictedTitle.textContent = generateFileName(record).split('/').pop();

    updateActionButtons(card, record);    
}

function updateActionButtons(card, record) {
    const actionButtons = card.querySelector('.action-buttons');
    const actionButton = actionButtons?.querySelector('.btn-actionbutton');
    if (actionButton) {
        const hasChanges = checkForChanges(record);
        const isNew = record.status === 'new';

        const currentFilename = record.currentPath.split('/').pop();

        const proposedFilename = generateFileName(record).split('/').pop();

        if(isNew) {
            actionButton.style.display = 'none';
        } else if (hasChanges) {
            actionButton.style.display = 'inline-block';
            actionButton.textContent = 'Update';
        } else if (currentFilename !== proposedFilename) {
            actionButton.style.display = 'inline-block';
            actionButton.textContent = 'Rename';
        } else {
            actionButton.style.display = 'none';
        }
    } else {
        console.error("updateActionButtons - no button", record);
    }
}

async function updateDocumentData(record) {
    try {
        const card = document.querySelector(`.record-card[data-path="${record.id}"]`);
        const inputs = card.querySelectorAll('input');
        const data = {};
        
        let changed = false;
        inputs.forEach(input => {
            const field = input.getAttribute('data-field');
            if (field && (input.value.toString() !== record.data[field].toString())) {
                console.log("user changedfield",field, "value", input.value, "record.data[field]", record.data[field]);
                data[field] = input.value;
                changed = true;
            }
        });

        if (!changed) {
            console.log("no changes to record", record.currentPath);
            return;
        }

        // Update the record with new data and set extraction_status to success
        const response = await fetch('/api/update-documentdata', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: record.id,
                data,
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update record');
        }
        
        // Reload records to show updated status
        await loadRecords();
        
        // If the current record was updated, update the preview
        if (currentRecord && currentRecord.id === record.id) {
            const newRecord = await fetch(`/api/records`)
                .then(res => res.json())
                .then(records => records.find(r => r.id === record.id));
            
            if (newRecord) {
                currentRecord = newRecord;
                loadPdfPreview(newRecord.id || newRecord.id);
            }
        }
        
        updateActionButtons(card, record);
    } catch (error) {
        console.error('Error updating record:', error);
        alert('Error updating record: ' + error.message);
    }
}

async function analyzeFile(fileInfo) {
    const card = document.querySelector(`.record-card[data-path="${fileInfo.id}"]`);
    if (!card) return;

    const analyzeButton = card.querySelector('.btn-secondary');
    if (!analyzeButton) return;

    const originalText = analyzeButton.textContent;
    
    try {
        // Set button to busy state
        analyzeButton.disabled = true;
        analyzeButton.textContent = 'Analyzing...';
        document.body.style.cursor = 'wait';
        
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: fileInfo.id }),
        });
        
        if (response.error) {
            throw new Error('Analysis failed');
        }
        
        // Update the card with the new data
        const result = await response.json();
        updateRecordCard(result.data);
    } catch (error) {
        console.error('Error analyzing file:', error);
        alert('Error analyzing file. Please try again.');
    } finally {
        // Reset button and cursor state
        analyzeButton.disabled = false;
        analyzeButton.textContent = originalText;
        document.body.style.cursor = 'default';
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
    
    // Add the search and hide processed controls
    const filterContainer = document.createElement('div');
    filterContainer.className = 'd-flex align-items-center gap-3';
    
    // Add search input
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'form-control';
    searchInput.placeholder = 'Search...';
    searchInput.id = 'searchInput';
    searchInput.addEventListener('input', () => {
        loadRecords();
    });
    searchContainer.appendChild(searchInput);
    
    // Add the hide processed toggle
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'form-check form-switch';
    toggleContainer.innerHTML = `
        <input class="form-check-input" type="checkbox" id="hideProcessedToggle">
        <label class="form-check-label" for="hideProcessedToggle">Hide Renamed Files</label>
    `;
    
    filterContainer.appendChild(searchContainer);
    filterContainer.appendChild(toggleContainer);
    controlsFlex.appendChild(filterContainer);
    
    // Add the scan buttons
    const scanButtons = document.createElement('div');
    scanButtons.className = 'scan-buttons';
    
    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn-outline-primary me-2';
    importBtn.id = 'importBtn';
    importBtn.textContent = 'Import Files';
    
    const analyzeAllBtn = document.createElement('button');
    analyzeAllBtn.className = 'btn btn-outline-primary me-2';
    analyzeAllBtn.id = 'analyzeAllBtn';
    analyzeAllBtn.textContent = 'Analyze All';
    analyzeAllBtn.onclick = async () => {
        if (isAnalyzingAll) {
            // User wants to cancel
            shouldStopAnalysis = true;
            analyzeAllBtn.textContent = 'Finishing current analysis...';
            analyzeAllBtn.disabled = true;
            return;
        }
        // User starts analysis
        analyzeAllBtn.textContent = 'Stop';
        analyzeAllBtn.disabled = false; // Allow stop
        document.body.style.cursor = 'wait';

        const result = await analyzeAllFiles();

        // Reset button state after analysis/stop/error
        analyzeAllBtn.textContent = 'Analyze All';
        analyzeAllBtn.disabled = false;
        document.body.style.cursor = 'default';
    };
    
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
    
    scanButtons.appendChild(importBtn);
    scanButtons.appendChild(analyzeAllBtn);
    scanButtons.appendChild(clearStateBtn);
    controlsFlex.appendChild(scanButtons);
    
    controlsCol.appendChild(controlsFlex);
    controls.appendChild(controlsCol);
    header.appendChild(controls);
    
    return header;
}

async function renameFile(record) {
    try {
        const response = await fetch('/api/rename-file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id: record.id }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to rename file');
        }
        
        // Reload records to show updated status
        await loadRecords();
        
        // If the current record was updated, update the preview
        if (currentRecord && currentRecord.id === record.id) {
            const newRecord = await fetch(`/api/records`)
                .then(res => res.json())
                .then(records => records.find(r => r.id === record.id));
            
            if (newRecord) {
                currentRecord = newRecord;
                loadPdfPreview(newRecord.currentPath);
            }
        }
    } catch (error) {
        console.error('Error renaming file:', error);
        alert('Error renaming file: ' + error.message);
    }
}

async function analyzeAllFiles() {
    try {
        if (isAnalyzingAll) {
            // Should never get here, handled in event handler
            return "cancelled";
        }

        // Get all records
        const response = await fetch('/api/records');
        if (!response.ok) {
            throw new Error('Failed to fetch records');
        }
        const fileInfos = await response.json();

        // Filter for new files
        const newFileInfos = fileInfos.filter(fileInfo => fileInfo.status === 'new');
        if (newFileInfos.length === 0) {
            alert('No new files to analyze');
            return "done";
        }

        // Set analyzing state
        isAnalyzingAll = true;
        shouldStopAnalysis = false;

        // Analyze files one by one
        for (let i = 0; i < newFileInfos.length; i++) {
            if (shouldStopAnalysis) {
                console.log('Analysis cancelled by user');
                return "cancelled";
            }

            const fileInfo = newFileInfos[i];
            // Optionally, you can update a progress indicator here
            console.log("analyzeFile", fileInfo.currentPath.split('/').pop());
            await analyzeFile(fileInfo);
            // await new Promise(resolve => setTimeout(resolve, 1000));
        }

        await loadRecords();
        return "done";
    } catch (error) {
        console.error('Error in analyze all:', error);
        alert('Error analyzing files. Please try again.');
        return "error";
    } finally {
        isAnalyzingAll = false;
        shouldStopAnalysis = false;
    }
}

async function updateDocumentType(record) {
    try {
        const response = await fetch('/api/update-documenttype', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                id: record.id,
                documentType: record.documentType
            }),
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to update document type');
        }
        
        // Reload records to show updated status
        await loadRecords();
        
        // If the current record was updated, update the preview
        if (currentRecord && currentRecord.id === record.id) {
            const newRecord = await fetch(`/api/records`)
                .then(res => res.json())
                .then(records => records.find(r => r.id === record.id));
            
            if (newRecord) {
                currentRecord = newRecord;
                loadPdfPreview(newRecord.currentPath);
            }
        }
    } catch (error) {
        console.error('Error updating document type:', error);
        alert('Error updating document type: ' + error.message);
    }
}

