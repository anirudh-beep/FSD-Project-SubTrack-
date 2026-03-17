// Calendar functionality
let currentDate = new Date();
let selectedDate = null;

$(document).ready(async function() {
    checkAuth();
    await fetchUserSubscriptions();
    await updateCurrentUserName();
    initializeCalendar();
    
    $('#prevMonth').click(() => navigateMonth(-1));
    $('#nextMonth').click(() => navigateMonth(1));
    $('#themeToggle').click(toggleTheme);
    $('#logoutBtn').click(logout);
    
    // User menu functionality
    setupUserMenu();
});

function initializeCalendar() {
    renderCalendar();
}

function renderCalendar() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Update header
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];
    $('#currentMonth').text(`${monthNames[month]} ${year}`);
    
    // Clear existing calendar days
    $('.calendar-day').remove();
    
    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    
    // Get user subscriptions
    const subscriptions = getUserSubscriptions();
    
    // Add previous month's trailing days
    for (let i = firstDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        const date = new Date(year, month - 1, day);
        createCalendarDay(day, date, true, subscriptions);
    }
    
    // Add current month's days
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        createCalendarDay(day, date, false, subscriptions);
    }
    
    // Add next month's leading days
    const totalCells = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const remainingCells = totalCells - (firstDay + daysInMonth);
    for (let day = 1; day <= remainingCells; day++) {
        const date = new Date(year, month + 1, day);
        createCalendarDay(day, date, true, subscriptions);
    }
}

function createCalendarDay(day, date, isOtherMonth, subscriptions) {
    const dayElement = $(`
        <div class="calendar-day ${isOtherMonth ? 'other-month' : ''}" data-date="${date.toISOString().split('T')[0]}">
            <div class="calendar-day-number">${day}</div>
            <div class="calendar-renewals"></div>
        </div>
    `);
    
    // Find renewals for this date
    const renewals = findRenewalsForDate(date, subscriptions);
    const renewalsContainer = dayElement.find('.calendar-renewals');
    
    renewals.forEach(renewal => {
        const status = getSubscriptionStatus(date, renewal);
        const renewalElement = $(`
            <div class="calendar-renewal ${status.class}" title="${renewal.name} - ${renewal.amount}">
                ${renewal.name}
            </div>
        `);
        renewalsContainer.append(renewalElement);
    });
    
    // Add click handler
    dayElement.click(() => selectDate(date, renewals));
    
    $('#calendarGrid').append(dayElement);
}

function findRenewalsForDate(date, subscriptions) {
    const renewals = [];
    
    subscriptions.forEach(sub => {
        const nextRenewal = calculateNextRenewal(sub.startDate, sub.billingCycle);
        if (isSameDate(date, nextRenewal)) {
            renewals.push(sub);
        }
    });
    
    return renewals;
}

function calculateNextRenewal(startDate, billingCycle) {
    const start = new Date(startDate);
    const today = new Date();
    
    let nextRenewal = new Date(start);
    
    while (nextRenewal <= today) {
        if (billingCycle === 'Monthly') {
            nextRenewal.setMonth(nextRenewal.getMonth() + 1);
        } else {
            nextRenewal.setFullYear(nextRenewal.getFullYear() + 1);
        }
    }
    
    return nextRenewal;
}

function getSubscriptionStatus(renewalDate, subscription) {
    const today = new Date();
    const daysUntilRenewal = Math.ceil((renewalDate - today) / (1000 * 60 * 60 * 24));
    
    if (daysUntilRenewal < 0) {
        return { class: 'expired', text: 'Expired' };
    } else if (daysUntilRenewal <= 5) {
        return { class: 'renew-soon', text: 'Renew Soon' };
    } else {
        return { class: 'active', text: 'Active' };
    }
}

function isSameDate(date1, date2) {
    return date1.toDateString() === date2.toDateString();
}

function selectDate(date, renewals) {
    // Remove previous selection
    $('.calendar-day').removeClass('selected');
    
    // Add selection to clicked day
    $(`.calendar-day[data-date="${date.toISOString().split('T')[0]}"]`).addClass('selected');
    
    selectedDate = date;
    displayRenewalsForDate(renewals);
}

function displayRenewalsForDate(renewals) {
    const container = $('#selectedDateRenewals');
    container.empty();
    
    if (renewals.length === 0) {
        container.append('<p class="no-renewals">No renewals for this date</p>');
        return;
    }
    
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const currency = settings.currency || '₹';
    
    renewals.forEach(renewal => {
        const status = getSubscriptionStatus(selectedDate, renewal);
        const renewalElement = $(`
            <div class="renewal-item">
                <div class="renewal-info">
                    <h4>${renewal.name}</h4>
                    <p>${renewal.category} • ${currency}${renewal.amount} • ${renewal.billingCycle}</p>
                    <span class="status ${status.class}">${status.text}</span>
                </div>
                <div class="renewal-actions">
                    <button class="btn btn-sm btn-primary" onclick="paySubscription(${renewal.id})">Pay Now</button>
                </div>
            </div>
        `);
        container.append(renewalElement);
    });
}

function navigateMonth(direction) {
    currentDate.setMonth(currentDate.getMonth() + direction);
    renderCalendar();
}

function getUserSubscriptions() {
    const uid = JSON.parse(localStorage.getItem('currentUser') || '{}').id;
    if (!uid) return [];
    // Use cached data loaded at init
    return window._calendarSubscriptions || [];
}

async function fetchUserSubscriptions() {
    const uid = JSON.parse(localStorage.getItem('currentUser') || '{}').id;
    if (!uid) return;
    const { data } = await _supabase.from('subscriptions').select('*').eq('user_id', uid);
    window._calendarSubscriptions = (data || []).map(s => ({ ...s, billingCycle: s.billing_cycle, startDate: s.start_date }));
}

function paySubscription(subscriptionId) {
    // This would integrate with the payment system
    showToast('Payment processed successfully!', 'success');
    renderCalendar(); // Refresh calendar
}

async function updateCurrentUserName() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;
    const name = session.user.user_metadata?.name || session.user.email.split('@')[0];
    $('#currentUserName').text(name);
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
        // Switch account functionality would go here
        showToast('Account switching feature coming soon!', 'info');
    });
    
    $('#changePassword').click(function(e) {
        e.preventDefault();
        // Change password functionality would go here
        showToast('Password change feature coming soon!', 'info');
    });
}

function showToast(message, type = 'info') {
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
window.paySubscription = paySubscription;