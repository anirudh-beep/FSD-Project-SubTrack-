// Advanced analytics functionality
let trendChart = null;
let pieChart = null;
let paymentChart = null;

$(document).ready(async function() {
    checkAuth();
    await fetchUserSubscriptions();
    initializeAnalytics();
    
    $('#downloadReport').click(downloadReport);
    $('#themeToggle').click(toggleTheme);
    $('#logoutBtn').click(logout);
    
    setupUserMenu();
});

function initializeAnalytics() {
    updateAnalyticsSummary();
    setTimeout(() => {
        initializeCharts();
        generateInsights();
    }, 500);
    updateCurrentUserName();
}

function updateAnalyticsSummary() {
    const subscriptions = getUserSubscriptions();
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const currency = settings.currency || '₹';
    
    // Find highest spending subscription
    let highestSpending = null;
    let maxAmount = 0;
    
    if (subscriptions.length > 0) {
        subscriptions.forEach(sub => {
            const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
            if (monthlyAmount > maxAmount) {
                maxAmount = monthlyAmount;
                highestSpending = sub;
            }
        });
    }
    
    if (highestSpending) {
        $('#highestSpendingName').text(highestSpending.name);
        $('#highestSpendingAmount').text(`${currency}${maxAmount.toFixed(2)}/month`);
    } else {
        $('#highestSpendingName').text('No subscriptions');
        $('#highestSpendingAmount').text(`${currency}0`);
    }
    
    // Calculate trend
    const currentMonth = getCurrentMonthSpending();
    const lastMonth = getLastMonthSpending();
    let trendPercentage = 0;
    
    if (lastMonth > 0) {
        trendPercentage = ((currentMonth - lastMonth) / lastMonth * 100);
    } else if (currentMonth > 0) {
        trendPercentage = 100; // If no previous data but current spending exists
    }
    
    $('#trendDirection').text(trendPercentage >= 0 ? '📈' : '📉');
    $('#trendPercentage').text(`${Math.abs(trendPercentage).toFixed(1)}%`);
    
    // Calculate total saved (simulated)
    const totalSaved = calculateTotalSaved();
    $('#totalSaved').text(`${currency}${totalSaved}`);
}

function initializeCharts() {
    // Clean up existing charts first
    destroyExistingCharts();
    
    // Wait for DOM to be ready
    setTimeout(() => {
        initializeTrendChart();
        initializePieChart();
        initializePaymentChart();
    }, 100);
}

function destroyExistingCharts() {
    if (trendChart) {
        trendChart.destroy();
        trendChart = null;
    }
    if (pieChart) {
        pieChart.destroy();
        pieChart = null;
    }
    if (paymentChart) {
        paymentChart.destroy();
        paymentChart = null;
    }
}

function initializeTrendChart() {
    const ctx = document.getElementById('trendChart');
    if (!ctx) {
        console.warn('Trend chart canvas not found');
        return;
    }
    
    const trendData = getTrendData();
    
    try {
        trendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: trendData.labels,
                datasets: [{
                    label: 'Monthly Spending',
                    data: trendData.data,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        titleColor: 'white',
                        bodyColor: 'white',
                        borderColor: '#667eea',
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
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
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
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating trend chart:', error);
    }
}

function initializePieChart() {
    const ctx = document.getElementById('pieChart');
    if (!ctx) {
        console.warn('Pie chart canvas not found');
        return;
    }
    
    const pieData = getPieChartData();
    
    try {
        pieChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: pieData.labels,
                datasets: [{
                    data: pieData.data,
                    backgroundColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936',
                        '#f56565',
                        '#9f7aea',
                        '#38b2ac'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            boxWidth: 12
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
                                const currency = settings.currency || '₹';
                                if (pieData.total > 1) { // Only show percentage if we have real data
                                    const percentage = ((context.parsed / pieData.total) * 100).toFixed(1);
                                    return `${context.label}: ${currency}${context.parsed.toFixed(2)} (${percentage}%)`;
                                } else {
                                    return 'No data available';
                                }
                            }
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating pie chart:', error);
    }
}

function initializePaymentChart() {
    const ctx = document.getElementById('paymentChart');
    if (!ctx) {
        console.warn('Payment chart canvas not found');
        return;
    }
    
    const paymentData = getPaymentMethodData();
    
    try {
        paymentChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: paymentData.labels,
                datasets: [{
                    label: 'Usage Count',
                    data: paymentData.data,
                    backgroundColor: [
                        'rgba(102, 126, 234, 0.8)',
                        'rgba(72, 187, 120, 0.8)',
                        'rgba(237, 137, 54, 0.8)'
                    ],
                    borderColor: [
                        '#667eea',
                        '#48bb78',
                        '#ed8936'
                    ],
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error creating payment chart:', error);
    }
}

function getTrendData() {
    const subscriptions = getUserSubscriptions();
    const months = [];
    const data = [];
    const currentDate = new Date();
    
    for (let i = 5; i >= 0; i--) {
        const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
        months.push(monthName);
        
        if (subscriptions.length === 0) {
            data.push(0);
        } else {
            // Calculate actual spending for this month based on subscriptions
            const currentMonthSpending = subscriptions.reduce((total, sub) => {
                const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
                return total + monthlyAmount;
            }, 0);
            
            // Add some variation for historical months (simulated)
            const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
            const monthSpending = currentMonthSpending * (1 + variation);
            data.push(parseFloat(Math.max(0, monthSpending).toFixed(2)));
        }
    }
    
    return { labels: months, data };
}

function getPieChartData() {
    const subscriptions = getUserSubscriptions();
    const categorySpending = {};
    let total = 0;
    
    if (subscriptions.length === 0) {
        return {
            labels: ['No Data'],
            data: [1],
            total: 1
        };
    }
    
    subscriptions.forEach(sub => {
        const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
        categorySpending[sub.category] = (categorySpending[sub.category] || 0) + monthlyAmount;
        total += monthlyAmount;
    });
    
    const labels = Object.keys(categorySpending);
    const data = Object.values(categorySpending);
    
    if (labels.length === 0) {
        return {
            labels: ['No Data'],
            data: [1],
            total: 1
        };
    }
    
    return { labels, data, total };
}

function getPaymentMethodData() {
    // Simulate payment method usage data
    return {
        labels: ['Card', 'UPI', 'Wallet'],
        data: [15, 8, 5] // Simulated usage counts
    };
}

function generateInsights() {
    const subscriptions = getUserSubscriptions();
    const insights = [];
    
    // Check if there are any subscriptions
    if (subscriptions.length === 0) {
        insights.push({
            title: 'No Subscriptions Found',
            message: 'Add some subscriptions to see personalized insights and recommendations.',
            type: 'info'
        });
        displayInsights(insights);
        return;
    }
    
    // Calculate total monthly spending
    const totalMonthly = subscriptions.reduce((total, sub) => {
        const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
        return total + monthlyAmount;
    }, 0);
    
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const currency = settings.currency || '₹';
    
    // Generate insights based on spending patterns
    if (totalMonthly > 5000) {
        insights.push({
            title: 'High Spending Alert',
            message: `Your monthly subscription spending is ${currency}${totalMonthly.toFixed(2)}. Consider reviewing unused subscriptions.`,
            type: 'warning'
        });
    }
    
    // Check for unused subscriptions (simulated)
    const unusedSubs = subscriptions.filter(sub => Math.random() < 0.3); // 30% chance of being "unused"
    if (unusedSubs.length > 0) {
        insights.push({
            title: 'Unused Subscriptions Detected',
            message: `You might not be using ${unusedSubs.length} subscription(s). Consider cancelling to save money.`,
            type: 'info'
        });
    }
    
    // Budget recommendation
    if (totalMonthly > 0) {
        const recommendedBudget = Math.ceil(totalMonthly * 1.2);
        insights.push({
            title: 'Budget Recommendation',
            message: `Based on your spending, we recommend setting a monthly budget of ${currency}${recommendedBudget}.`,
            type: 'success'
        });
    }
    
    // Category insights
    const categorySpending = {};
    subscriptions.forEach(sub => {
        const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
        categorySpending[sub.category] = (categorySpending[sub.category] || 0) + monthlyAmount;
    });
    
    const categoryKeys = Object.keys(categorySpending);
    if (categoryKeys.length > 0) {
        const topCategory = categoryKeys.reduce((a, b) => 
            categorySpending[a] > categorySpending[b] ? a : b
        );
        
        insights.push({
            title: 'Top Spending Category',
            message: `You spend the most on ${topCategory} subscriptions (${currency}${categorySpending[topCategory].toFixed(2)}/month).`,
            type: 'info'
        });
    }
    
    displayInsights(insights);
}

function displayInsights(insights) {
    const container = $('#spendingInsights');
    container.empty();
    
    if (insights.length === 0) {
        container.append('<p class="no-insights">No insights available</p>');
        return;
    }
    
    insights.forEach(insight => {
        const insightElement = $(`
            <div class="insight-item ${insight.type}">
                <div class="insight-title">${insight.title}</div>
                <div class="insight-message">${insight.message}</div>
            </div>
        `);
        container.append(insightElement);
    });
}

function downloadReport() {
    try {
        // Check if jsPDF is available
        if (typeof window.jspdf === 'undefined') {
            showToast('PDF library not loaded. Please refresh the page and try again.', 'error');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const subscriptions = getUserSubscriptions();
        const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
        const currency = settings.currency || '₹';
        
        // Add title
        doc.setFontSize(20);
        doc.text('SubTrack Analytics Report', 20, 30);
        
        // Add date
        doc.setFontSize(12);
        doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 50);
        
        // Add summary
        const totalMonthly = subscriptions.reduce((total, sub) => {
            const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
            return total + monthlyAmount;
        }, 0);
        
        doc.text(`Total Subscriptions: ${subscriptions.length}`, 20, 70);
        doc.text(`Monthly Spending: ${currency}${totalMonthly.toFixed(2)}`, 20, 85);
        doc.text(`Annual Spending: ${currency}${(totalMonthly * 12).toFixed(2)}`, 20, 100);
        
        if (subscriptions.length > 0) {
            // Add subscription list
            doc.text('Subscription Details:', 20, 120);
            let yPosition = 135;
            
            subscriptions.forEach((sub, index) => {
                if (yPosition > 250) {
                    doc.addPage();
                    yPosition = 30;
                }
                
                const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
                doc.text(`${index + 1}. ${sub.name} - ${currency}${monthlyAmount.toFixed(2)}/month (${sub.category})`, 25, yPosition);
                yPosition += 15;
            });
        } else {
            doc.text('No subscriptions found.', 20, 120);
        }
        
        // Save the PDF
        doc.save('subtrack-analytics-report.pdf');
        showToast('Report downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error generating PDF:', error);
        showToast('Error generating PDF report. Please try again.', 'error');
    }
}

function getCurrentMonthSpending() {
    const subscriptions = getUserSubscriptions();
    return subscriptions.reduce((total, sub) => {
        const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
        return total + monthlyAmount;
    }, 0);
}

function getLastMonthSpending() {
    // Simulate last month's spending (in real app, this would be stored data)
    return getCurrentMonthSpending() * (0.8 + Math.random() * 0.4);
}

function calculateTotalSaved() {
    // Simulate savings from cancelled subscriptions
    return (Math.random() * 2000).toFixed(2);
}

function getUserSubscriptions() {
    // Returns cached subscriptions loaded at init; fallback to empty
    return window._analyticsSubscriptions || [];
}

async function fetchUserSubscriptions() {
    const uid = JSON.parse(localStorage.getItem('currentUser') || '{}').id;
    if (!uid) return [];
    const { data } = await _supabase.from('subscriptions').select('*').eq('user_id', uid);
    window._analyticsSubscriptions = (data || []).map(s => ({
        ...s, billingCycle: s.billing_cycle, startDate: s.start_date
    }));
    return window._analyticsSubscriptions;
}

function updateCurrentUserName() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    $('#currentUserName').text(currentUser.name || 'User');
}

function setupUserMenu() {
    $('#userMenuBtn').click(function(e) {
        e.stopPropagation();
        $('#userDropdown').toggle();
    });
    
    $(document).click(function() {
        $('#userDropdown').hide();
    });
    
    $('#switchAccount').click(function(e) {
        e.preventDefault();
        showToast('Account switching feature coming soon!', 'info');
    });
    
    $('#changePassword').click(function(e) {
        e.preventDefault();
        showToast('Password change feature coming soon!', 'info');
    });
}

function showToast(message, type = 'info') {
    // Create toast container if it doesn't exist
    if ($('#toastContainer').length === 0) {
        $('body').append('<div id="toastContainer" class="toast-container"></div>');
    }
    
    const toast = $(`
        <div class="toast ${type}">
            <div class="toast-content">
                <p>${message}</p>
            </div>
        </div>
    `);
    
    $('#toastContainer').append(toast);
    
    setTimeout(() => {
        toast.fadeOut(() => toast.remove());
    }, 3000);
}