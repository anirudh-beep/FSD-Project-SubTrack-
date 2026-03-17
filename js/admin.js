// Admin panel functionality
let userTrendChart = null;
let categoriesChart = null;
let paymentMethodsChart = null;

$(document).ready(async function() {
    checkAuth();
    initializeAdmin();
    
    $('#themeToggle').click(toggleTheme);
    $('#logoutBtn').click(logout);
});

function initializeAdmin() {
    updateAdminSummary();
    renderUsersTable();
    setTimeout(() => {
        initializeAdminCharts();
    }, 500);
}

function updateAdminSummary() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const totalUsers = users.length;
    const activeUsers = users.filter(u => u.status === 'active').length;
    
    // Calculate total subscriptions across all users
    let totalSubscriptions = 0;
    let systemRevenue = 0;
    
    users.forEach(user => {
        const userKey = `subscriptions_${user.id}`;
        const subscriptions = JSON.parse(localStorage.getItem(userKey) || '[]');
        totalSubscriptions += subscriptions.length;
        
        // Calculate revenue (simulated commission)
        subscriptions.forEach(sub => {
            const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
            systemRevenue += monthlyAmount * 0.05; // 5% commission
        });
    });
    
    $('#totalUsers').text(totalUsers);
    $('#activeUsers').text(activeUsers);
    $('#totalSubscriptions').text(totalSubscriptions);
    $('#systemRevenue').text(`₹${systemRevenue.toFixed(2)}`);
}

function renderUsersTable() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const tbody = $('#usersTableBody');
    tbody.empty();
    
    users.forEach(user => {
        if (user.role === 'admin') return; // Skip admin user
        
        const userKey = `subscriptions_${user.id}`;
        const subscriptions = JSON.parse(localStorage.getItem(userKey) || '[]');
        const subscriptionCount = subscriptions.length;
        
        const totalSpending = subscriptions.reduce((total, sub) => {
            const monthlyAmount = sub.billingCycle === 'Yearly' ? sub.amount / 12 : sub.amount;
            return total + monthlyAmount;
        }, 0);
        
        const row = $(`
            <tr>
                <td>${user.name}</td>
                <td>${user.email}</td>
                <td>${subscriptionCount}</td>
                <td>₹${totalSpending.toFixed(2)}/month</td>
                <td>
                    <span class="status ${user.status === 'active' ? 'active' : 'blocked'}">
                        ${user.status}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm ${user.status === 'active' ? 'btn-danger' : 'btn-success'}" 
                            onclick="toggleUserStatus(${user.id})">
                        ${user.status === 'active' ? 'Block' : 'Unblock'}
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="viewUserDetails(${user.id})">
                        View Details
                    </button>
                </td>
            </tr>
        `);
        tbody.append(row);
    });
}

function toggleUserStatus(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const userIndex = users.findIndex(u => u.id === userId);
    
    if (userIndex !== -1) {
        users[userIndex].status = users[userIndex].status === 'active' ? 'blocked' : 'active';
        localStorage.setItem('users', JSON.stringify(users));
        
        renderUsersTable();
        updateAdminSummary();
        
        const action = users[userIndex].status === 'active' ? 'unblocked' : 'blocked';
        showToast(`User ${action} successfully`, 'success');
    }
}

function viewUserDetails(userId) {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const user = users.find(u => u.id === userId);
    
    if (user) {
        const userKey = `subscriptions_${user.id}`;
        const subscriptions = JSON.parse(localStorage.getItem(userKey) || '[]');
        
        let details = `User: ${user.name}\n`;
        details += `Email: ${user.email}\n`;
        details += `Joined: ${new Date(user.createdAt).toLocaleDateString()}\n`;
        details += `Last Login: ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}\n`;
        details += `Subscriptions: ${subscriptions.length}\n\n`;
        
        if (subscriptions.length > 0) {
            details += 'Subscription Details:\n';
            subscriptions.forEach((sub, index) => {
                details += `${index + 1}. ${sub.name} - ₹${sub.amount} (${sub.billingCycle})\n`;
            });
        }
        
        alert(details);
    }
}

function initializeAdminCharts() {
    initializeUserTrendChart();
    initializeCategoriesChart();
    initializePaymentMethodsChart();
}

function initializeUserTrendChart() {
    const ctx = document.getElementById('userTrendChart');
    if (!ctx) return;
    
    const trendData = getUserTrendData();
    
    userTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: trendData.labels,
            datasets: [{
                label: 'New Users',
                data: trendData.data,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102, 126, 234, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
}

function initializeCategoriesChart() {
    const ctx = document.getElementById('categoriesChart');
    if (!ctx) return;
    
    const categoryData = getCategoryData();
    
    categoriesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: categoryData.labels,
            datasets: [{
                data: categoryData.data,
                backgroundColor: [
                    '#667eea',
                    '#48bb78',
                    '#ed8936',
                    '#f56565',
                    '#9f7aea',
                    '#38b2ac'
                ]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function initializePaymentMethodsChart() {
    const ctx = document.getElementById('paymentMethodsChart');
    if (!ctx) return;
    
    const paymentData = getPaymentMethodData();
    
    paymentMethodsChart = new Chart(ctx, {
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
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
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
}

function getUserTrendData() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const months = [];
    const data = [];
    
    // Get last 6 months
    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const monthName = date.toLocaleDateString('en-US', { month: 'short' });
        months.push(monthName);
        
        // Count users registered in this month (simulated)
        const usersInMonth = Math.floor(Math.random() * 5) + 1;
        data.push(usersInMonth);
    }
    
    return { labels: months, data };
}

function getCategoryData() {
    const users = JSON.parse(localStorage.getItem('users') || '[]');
    const categoryCount = {};
    
    users.forEach(user => {
        if (user.role === 'admin') return;
        
        const userKey = `subscriptions_${user.id}`;
        const subscriptions = JSON.parse(localStorage.getItem(userKey) || '[]');
        
        subscriptions.forEach(sub => {
            categoryCount[sub.category] = (categoryCount[sub.category] || 0) + 1;
        });
    });
    
    const labels = Object.keys(categoryCount);
    const data = Object.values(categoryCount);
    
    return { labels, data };
}

function getPaymentMethodData() {
    // Simulate payment method usage data across all users
    return {
        labels: ['Card', 'UPI', 'Wallet'],
        data: [45, 32, 23] // Simulated usage counts
    };
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

// Export functions for global access
window.toggleUserStatus = toggleUserStatus;
window.viewUserDetails = viewUserDetails;