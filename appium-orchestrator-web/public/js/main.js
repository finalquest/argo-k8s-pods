document.addEventListener('DOMContentLoaded', () => {
    window.socket = io();
    initializeSocketListeners();

    const fetchBtn = document.getElementById('fetch-features-btn');
    const runSelectedBtn = document.getElementById('run-selected-btn');
    const selectAllCheckbox = document.getElementById('select-all-features');
    const historyBranchFilter = document.getElementById('history-branch-filter');

    window.addEventListener('load', loadBranches);
    fetchBtn.addEventListener('click', fetchFeatures);
    runSelectedBtn.addEventListener('click', runSelectedTests);
    selectAllCheckbox.addEventListener('change', toggleSelectAll);
    historyBranchFilter.addEventListener('change', () => {
        loadHistory(historyBranchFilter.value);
    });

    document.querySelectorAll('.tab-btn').forEach(button => {
        button.addEventListener('click', () => {
            switchTab(button.dataset.tab);
            if (button.dataset.tab === 'results') {
                loadHistoryBranches();
                loadHistory();
            }
        });
    });
});