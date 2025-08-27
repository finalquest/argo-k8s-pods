document.addEventListener('DOMContentLoaded', () => {
    window.socket = io();
    initializeSocketListeners();
    initializeWiremockTab();

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
            const previousTab = document.querySelector('.tab-btn.active').dataset.tab;
            const newTab = button.dataset.tab;

            switchTab(newTab);

            if (previousTab === 'wiremock' && newTab !== 'wiremock') {
                stopLiveView();
            }

            if (newTab === 'results') {
                loadHistoryBranches();
                loadHistory();
            } else if (newTab === 'wiremock') {
                const liveViewToggle = document.getElementById('wiremock-live-view-toggle');
                if (liveViewToggle.checked) {
                    startLiveView();
                }
            }
        });
    });
});
