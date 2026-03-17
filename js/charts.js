// Charts and analytics functionality
let spendingChart = null;

$(document).ready(function() {
    // Initialize chart after DOM is ready
    setTimeout(initializeChart, 500);
});

function initializeChart() {
    const ctx = document.getElementById('spendingChart');
    if (!ctx) return;
    
    const chartData = getChartData();
    
    spendingChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Monthly Spending',
                data: chartData.data,
                backgroundColor: [
                    'rgba(102, 126, 234, 0.8)',
                    'rgba(72, 187, 120, 0.8)',
                    'rgba(237, 137, 54, 0.8)',
                    'rgba(245, 101, 101, 0.8)'
                ],
                borderColor: [
                    'rgba(102, 126, 234, 1)',
                    'rgba(72, 187, 120, 1)',
                    'rgba(237, 137, 54, 1)',
                    'rgba(245, 101, 101, 1)'
                ],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: 'white',
                    bodyColor: 'white',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1,
                    cornerRadius: 8,
                    callbacks: {
                        label: function(context) {
                            const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
                            const currency = settings.currency || '₹';
                            return `${currency}${context.parsed.y.toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)',
                        drawBorder: false
                    },
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary'),
                        callback: function(value) {
                            const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
                            const currency = settings.currency || '₹';
                            return `${currency}${value}`;
                        }
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary')
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeOutQuart'
            }
        }
    });
}

function getChartData() {
    const subs = (window._getSubscriptions && window._getSubscriptions()) || [];
    const categorySpending = {};
    subs.forEach(sub => {
        const monthlyAmount = sub.billing_cycle === 'Yearly' ? sub.amount / 12 : sub.amount;
        categorySpending[sub.category] = (categorySpending[sub.category] || 0) + monthlyAmount;
    });
    const labels = [], data = [];
    Object.entries(categorySpending).forEach(([cat, amt]) => {
        if (amt > 0) { labels.push(cat); data.push(parseFloat(amt.toFixed(2))); }
    });
    return labels.length === 0 ? { labels: ['No Data'], data: [0] } : { labels, data };
}

function updateChart() {
    if (spendingChart) {
        const chartData = getChartData();
        spendingChart.data.labels = chartData.labels;
        spendingChart.data.datasets[0].data = chartData.data;
        spendingChart.update();
    }
}

// Listen for subscription changes to update chart
$(document).on('subscriptionUpdated', function() {
    updateChart();
});

// Update chart when theme changes
function updateChartTheme() {
    if (spendingChart) {
        const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary');
        spendingChart.options.scales.y.ticks.color = textColor;
        spendingChart.options.scales.x.ticks.color = textColor;
        spendingChart.update();
    }
}

// Override the original app.js functions to trigger chart updates
const originalSaveSubscriptions = window.saveSubscriptions || function() {};
window.saveSubscriptions = function() {
    originalSaveSubscriptions();
    updateChart();
};

// Export functions
window.updateChart = updateChart;
window.updateChartTheme = updateChartTheme;