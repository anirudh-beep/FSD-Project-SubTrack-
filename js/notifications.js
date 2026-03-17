// Notification system functionality
let notifications = [];
let notificationSettings = {
    browserNotifications: true,
    soundAlerts: true,
    reminderDays: 7
};

$(document).ready(async function() {
    checkAuth();
    await fetchUserSubscriptions();
    await updateCurrentUserName();
    initializeNotifications();
    
    // Event handlers
    $('#markAllRead').click(markAllNotificationsRead);
    $('#clearAll').click(clearAllNotifications);
    $('#saveNotificationSettings').click(saveNotificationSettings);
    $('.filter-btn').click(handleFilterClick);
    $('#themeToggle').click(toggleTheme);
    $('#logoutBtn').click(logout);
    
    setupUserMenu();
    loadNotificationSettings();
    requestNotificationPermission();
});

function initializeNotifications() {
    loadNotifications();
    generateRenewalNotifications();
    renderNotifications();
    updateNotificationBadge();
}

function loadNotifications() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userKey = `notifications_${currentUser.id}`;
    notifications = JSON.parse(localStorage.getItem(userKey) || '[]');
}

function saveNotifications() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userKey = `notifications_${currentUser.id}`;
    localStorage.setItem(userKey, JSON.stringify(notifications));
}

function generateRenewalNotifications() {
    const subscriptions = getUserSubscriptions();
    const today = new Date();
    
    subscriptions.forEach(sub => {
        const nextRenewal = calculateNextRenewal(sub.startDate, sub.billingCycle);
        const daysUntilRenewal = Math.ceil((nextRenewal - today) / (1000 * 60 * 60 * 24));
        
        // Check if we should create a renewal notification
        if (daysUntilRenewal <= notificationSettings.reminderDays && daysUntilRenewal > 0) {
            const existingNotification = notifications.find(n => 
                n.type === 'renewal' && 
                n.subscriptionId === sub.id && 
                n.renewalDate === nextRenewal.toISOString().split('T')[0]
            );
            
            if (!existingNotification) {
                const notification = {
                    id: Date.now() + Math.random(),
                    type: 'renewal',
                    subscriptionId: sub.id,
                    title: 'Subscription Renewal Reminder',
                    message: `${sub.name} will renew in ${daysUntilRenewal} day${daysUntilRenewal > 1 ? 's' : ''}`,
                    renewalDate: nextRenewal.toISOString().split('T')[0],
                    timestamp: new Date().toISOString(),
                    read: false,
                    snoozed: false
                };
                
                notifications.unshift(notification);
                
                // Show browser notification if enabled
                if (notificationSettings.browserNotifications) {
                    showBrowserNotification(notification);
                }
                
                // Play sound if enabled
                if (notificationSettings.soundAlerts) {
                    playNotificationSound();
                }
            }
        }
    });
    
    saveNotifications();
}

function renderNotifications(filter = 'all') {
    const container = $('#notificationsList');
    container.empty();
    
    let filteredNotifications = notifications;
    
    if (filter !== 'all') {
        filteredNotifications = notifications.filter(n => n.type === filter);
    }
    
    if (filteredNotifications.length === 0) {
        container.append(`
            <div class="no-notifications">
                <p>No notifications found</p>
            </div>
        `);
        return;
    }
    
    filteredNotifications.forEach(notification => {
        const notificationElement = createNotificationElement(notification);
        container.append(notificationElement);
    });
}

function createNotificationElement(notification) {
    const timeAgo = getTimeAgo(new Date(notification.timestamp));
    const icon = getNotificationIcon(notification.type);
    
    const element = $(`
        <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
            <div class="notification-icon">${icon}</div>
            <div class="notification-content">
                <div class="notification-title">${notification.title}</div>
                <div class="notification-message">${notification.message}</div>
                <div class="notification-time">${timeAgo}</div>
            </div>
            <div class="notification-actions-item">
                ${!notification.read ? `<button class="btn btn-sm btn-primary" onclick="markAsRead(${notification.id})">Mark Read</button>` : ''}
                ${notification.type === 'renewal' && !notification.snoozed ? `<button class="btn btn-sm btn-secondary" onclick="snoozeNotification(${notification.id})">Snooze</button>` : ''}
                <button class="btn btn-sm btn-danger" onclick="deleteNotification(${notification.id})">Delete</button>
            </div>
        </div>
    `);
    
    return element;
}

function getNotificationIcon(type) {
    const icons = {
        renewal: '🔔',
        payment: '💳',
        system: '⚙️',
        warning: '⚠️',
        success: '✅'
    };
    return icons[type] || '📢';
}

function getTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    return `${Math.floor(diffInSeconds / 86400)} days ago`;
}

function markAsRead(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
        notification.read = true;
        saveNotifications();
        renderNotifications();
        updateNotificationBadge();
    }
}

function markAllNotificationsRead() {
    notifications.forEach(n => n.read = true);
    saveNotifications();
    renderNotifications();
    updateNotificationBadge();
    showToast('All notifications marked as read', 'success');
}

function deleteNotification(notificationId) {
    notifications = notifications.filter(n => n.id !== notificationId);
    saveNotifications();
    renderNotifications();
    updateNotificationBadge();
    showToast('Notification deleted', 'success');
}

function clearAllNotifications() {
    if (confirm('Are you sure you want to clear all notifications?')) {
        notifications = [];
        saveNotifications();
        renderNotifications();
        updateNotificationBadge();
        showToast('All notifications cleared', 'success');
    }
}

function snoozeNotification(notificationId) {
    const notification = notifications.find(n => n.id === notificationId);
    if (notification) {
        notification.snoozed = true;
        notification.snoozeUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Snooze for 24 hours
        saveNotifications();
        renderNotifications();
        showToast('Notification snoozed for 24 hours', 'success');
    }
}

function handleFilterClick(e) {
    $('.filter-btn').removeClass('active');
    $(e.target).addClass('active');
    const filter = $(e.target).data('filter');
    renderNotifications(filter);
}

function updateNotificationBadge() {
    const unreadCount = notifications.filter(n => !n.read).length;
    const badge = $('#notificationBadge');
    
    if (unreadCount > 0) {
        badge.text(unreadCount).show();
    } else {
        badge.hide();
    }
}

function loadNotificationSettings() {
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userKey = `notificationSettings_${currentUser.id}`;
    const savedSettings = JSON.parse(localStorage.getItem(userKey) || '{}');
    
    notificationSettings = { ...notificationSettings, ...savedSettings };
    
    // Update UI
    $('#browserNotifications').prop('checked', notificationSettings.browserNotifications);
    $('#soundAlerts').prop('checked', notificationSettings.soundAlerts);
    $('#reminderDays').val(notificationSettings.reminderDays);
}

function saveNotificationSettings() {
    notificationSettings = {
        browserNotifications: $('#browserNotifications').is(':checked'),
        soundAlerts: $('#soundAlerts').is(':checked'),
        reminderDays: parseInt($('#reminderDays').val())
    };
    
    const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const userKey = `notificationSettings_${currentUser.id}`;
    localStorage.setItem(userKey, JSON.stringify(notificationSettings));
    
    showToast('Notification settings saved', 'success');
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast('Browser notifications enabled', 'success');
            }
        });
    }
}

function showBrowserNotification(notification) {
    if ('Notification' in window && Notification.permission === 'granted') {
        const browserNotification = new Notification(notification.title, {
            body: notification.message,
            icon: '/favicon.ico', // You can add a custom icon
            badge: '/favicon.ico'
        });
        
        browserNotification.onclick = function() {
            window.focus();
            browserNotification.close();
        };
        
        // Auto close after 5 seconds
        setTimeout(() => {
            browserNotification.close();
        }, 5000);
    }
}

function playNotificationSound() {
    // Create a simple beep sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
        console.log('Audio not supported');
    }
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

function getUserSubscriptions() {
    return window._notifSubscriptions || [];
}

async function fetchUserSubscriptions() {
    const uid = JSON.parse(localStorage.getItem('currentUser') || '{}').id;
    if (!uid) return;
    const { data } = await _supabase.from('subscriptions').select('*').eq('user_id', uid);
    window._notifSubscriptions = (data || []).map(s => ({ ...s, billingCycle: s.billing_cycle, startDate: s.start_date }));
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
        showToast('Account switching feature coming soon!', 'info');
    });
    
    $('#changePassword').click(function(e) {
        e.preventDefault();
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
window.markAsRead = markAsRead;
window.deleteNotification = deleteNotification;
window.snoozeNotification = snoozeNotification;

// Auto-refresh notifications every 5 minutes
setInterval(() => {
    generateRenewalNotifications();
    renderNotifications();
    updateNotificationBadge();
}, 5 * 60 * 1000);