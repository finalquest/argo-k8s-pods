document.addEventListener('DOMContentLoaded', () => {
    window.socket = io();
    initializeSocketListeners();
    initializeUiEventListeners();
    initializeWiremockTab();

    loadBranches();
    loadHistoryBranches();
    loadHistory();
});

function initializeUiEventListeners() {
    const fetchBtn = document.getElementById('fetch-features-btn');
    const runSelectedBtn = document.getElementById('run-selected-btn');
    const selectAllCheckbox = document.getElementById('select-all-features');
    const historyBranchFilter = document.getElementById('history-branch-filter');
    const featuresList = document.getElementById('features-list');

    fetchBtn.addEventListener('click', fetchFeatures);
    runSelectedBtn.addEventListener('click', runSelectedTests);
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