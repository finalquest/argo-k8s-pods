document.addEventListener('DOMContentLoaded', () => {
    checkAuthStatus();
});

async function checkAuthStatus() {
    const authOverlay = document.getElementById('auth-overlay');
    const userInfoDiv = document.getElementById('user-info');

    const user = await getCurrentUser();

    if (user) {
        // Usuario autenticado
        authOverlay.style.display = 'none';

        document.getElementById('user-name').textContent = user.name;
        document.getElementById('user-email').textContent = user.email;
        document.getElementById('user-photo').src = user.photo;
        userInfoDiv.style.display = 'block';

        // Inicializar la app principal
        initializeApp();
    } else {
        // Usuario no autenticado
        authOverlay.style.display = 'flex';
        userInfoDiv.style.display = 'none';
    }
}

function initializeApp() {
    window.socket = io();
    initializeSocketListeners();
    initializeUiEventListeners();
    initializeWiremockTab();

    loadBranches();
    loadHistoryBranches();
    loadHistory();
    loadLocalDevices(); // Cargar dispositivos locales
}

async function loadLocalDevices() {
    const devices = await getLocalDevices();
    const container = document.getElementById('device-selector-container');
    const select = document.getElementById('device-select');

    if (devices && devices.length > 0) {
        container.style.display = 'block';
        select.innerHTML = '';
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device;
            option.textContent = device;
            select.appendChild(option);
        });
    } else {
        container.style.display = 'none';
    }
}

function initializeUiEventListeners() {
    const fetchBtn = document.getElementById('fetch-features-btn');
    const fetchApkBtn = document.getElementById('fetch-apk-versions-btn');
    const runSelectedBtn = document.getElementById('run-selected-btn');
    const stopAllBtn = document.getElementById('stop-all-btn');
    const selectAllCheckbox = document.getElementById('select-all-features');
    const historyBranchFilter = document.getElementById('history-branch-filter');
    const featuresList = document.getElementById('features-list');

    fetchBtn.addEventListener('click', fetchFeatures);
    fetchApkBtn.addEventListener('click', fetchApkVersions);
    runSelectedBtn.addEventListener('click', runSelectedTests);
    stopAllBtn.addEventListener('click', stopAllExecution);
    selectAllCheckbox.addEventListener('change', toggleSelectAll);
    historyBranchFilter.addEventListener('change', () => loadHistory(historyBranchFilter.value));

    featuresList.addEventListener('change', (e) => {
        if (e.target.classList.contains('feature-checkbox')) {
            updateSelectedCount();
        }
    });

    featuresList.addEventListener('click', (e) => {
        if (e.target.classList.contains('run-btn') || e.target.classList.contains('priority-btn')) {
            const featureName = e.target.dataset.feature;
            const highPriority = e.target.classList.contains('priority-btn');
            runSingleTest(featureName, highPriority);
        }
    });

    document.getElementById('queue-view').addEventListener('click', (e) => {
        if (e.target.classList.contains('cancel-job-btn')) {
            const jobId = parseInt(e.target.dataset.jobId, 10);
            if (confirm(`¿Seguro que quieres cancelar el job ${jobId} de la cola?`)) {
                window.socket.emit('cancel_job', { jobId });
            }
        }
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            const newTab = button.dataset.tab;
            switchTab(newTab);
            if (newTab === 'results') {
                loadHistoryBranches();
                loadHistory();
            }
        });
    });
}