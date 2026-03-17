// SubTrack - Main App (Supabase)

async function getUid() {
    const { data: { session } } = await _supabase.auth.getSession();
    return session ? session.user.id : null;
}

function getCurrency() {
    return JSON.parse(localStorage.getItem('userSettings') || '{}').currency || 'Rs';
}

function escHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

var _subscriptions = [];

async function loadSubscriptions() {
    var uid = await getUid();
    if (!uid) return;
    var res = await _supabase.from('subscriptions').select('*').eq('user_id', uid);
    if (res.error) { console.error('loadSubscriptions:', res.error.message); return; }
    _subscriptions = res.data || [];
    renderSubscriptions();
    updateSummaryCards();
    $(document).trigger('subscriptionUpdated');
}

window._getSubscriptions = function() { return _subscriptions; };

function calculateNextRenewal(startDate, billingCycle) {
    var start = new Date(startDate);
    var today = new Date();
    var next = new Date(start);
    while (next <= today) {
        if (billingCycle === 'Yearly') next.setFullYear(next.getFullYear() + 1);
        else next.setMonth(next.getMonth() + 1);
    }
    return next;
}

function renderSubscriptions() {
    var tbody = $('#subscriptionsBody');
    tbody.empty();
    var currency = getCurrency();
    if (_subscriptions.length === 0) {
        tbody.append('<tr><td colspan="8" style="text-align:center;padding:20px;">No subscriptions yet. Add one above!</td></tr>');
        return;
    }
    _subscriptions.forEach(function(sub) {
        var nextRenewal = calculateNextRenewal(sub.start_date, sub.billing_cycle);
        var daysLeft = Math.ceil((nextRenewal - new Date()) / 86400000);
        var statusClass = daysLeft <= 5 ? 'renew-soon' : 'active';
        var statusText = daysLeft <= 5 ? ('Renews in ' + daysLeft + 'd') : 'Active';
        var payStatus = sub.payment_status || 'Pending';
        tbody.append(
            '<tr>' +
            '<td>' + escHtml(sub.name) + '</td>' +
            '<td>' + escHtml(sub.category) + '</td>' +
            '<td>' + currency + parseFloat(sub.amount).toFixed(2) + '</td>' +
            '<td>' + nextRenewal.toLocaleDateString() + '</td>' +
            '<td><span class="status ' + statusClass + '">' + statusText + '</span></td>' +
            '<td><span class="status ' + (payStatus === 'Paid' ? 'active' : 'renew-soon') + '">' + escHtml(payStatus) + '</span></td>' +
            '<td>' + escHtml(sub.autopay || 'OFF') + '</td>' +
            '<td>' +
            '<button class="btn btn-sm btn-primary" onclick="openPaymentModal(\'' + sub.id + '\')">Pay</button> ' +
            '<button class="btn btn-sm btn-danger" onclick="confirmDelete(\'' + sub.id + '\')">Delete</button>' +
            '</td></tr>'
        );
    });
}

function updateSummaryCards() {
    var currency = getCurrency();
    var monthly = _subscriptions.reduce(function(sum, s) {
        return sum + (s.billing_cycle === 'Yearly' ? s.amount / 12 : parseFloat(s.amount));
    }, 0);
    var autopay = _subscriptions.filter(function(s) { return s.autopay === 'ON'; }).length;
    $('#totalSubs').text(_subscriptions.length);
    $('#monthlySpending').text(currency + monthly.toFixed(2));
    $('#autopayCount').text(autopay);
    var budget = JSON.parse(localStorage.getItem('userSettings') || '{}').monthlyBudget || 5000;
    var pct = Math.min(100, Math.round((monthly / budget) * 100));
    $('#budgetPercentage').text(pct + '%');
    $('#budgetProgress').attr('stroke-dashoffset', (2 * Math.PI * 35) * (1 - pct / 100));
}

async function addSubscription(e) {
    e.preventDefault();
    var uid = await getUid();
    if (!uid) { showToast('Not logged in', 'error'); return; }
    var name = $('#subName').val().trim();
    var amount = parseFloat($('#amount').val());
    var startDate = $('#startDate').val();
    var billingCycle = $('#billingCycle').val();
    var category = $('#category').val();
    var autopay = $('#autopay').val();
    if (!name || !amount || !startDate || !category) { showToast('Please fill in all fields', 'error'); return; }
    var res = await _supabase.from('subscriptions').insert({
        user_id: uid, name: name, amount: amount, start_date: startDate,
        billing_cycle: billingCycle, category: category, autopay: autopay, payment_status: 'Pending'
    });
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Subscription added!', 'success');
    $('#subscriptionForm')[0].reset();
    await loadCategories();
    await loadSubscriptions();
}

var _deleteId = null;
function confirmDelete(id) { _deleteId = id; $('#confirmModal').show(); }
window.confirmDelete = confirmDelete;

async function deleteSubscription() {
    if (!_deleteId) return;
    var res = await _supabase.from('subscriptions').delete().eq('id', _deleteId);
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    _deleteId = null; $('#confirmModal').hide();
    showToast('Deleted', 'success');
    await loadSubscriptions();
}

var _categories = [];
var DEFAULT_CATS = [
    {name:'OTT',icon:'TV'},{name:'Software',icon:'PC'},{name:'Education',icon:'Book'},
    {name:'Fitness',icon:'Gym'},{name:'Music',icon:'Music'},{name:'Gaming',icon:'Game'},
    {name:'News',icon:'News'},{name:'Cloud',icon:'Cloud'}
];

async function loadCategories() {
    var uid = await getUid();
    if (!uid) { console.warn('loadCategories: no uid'); return; }
    var res = await _supabase.from('categories').select('*').eq('user_id', uid);
    if (res.error) { console.error('categories error:', res.error.message); }
    if (!res.data || res.data.length === 0) {
        var rows = DEFAULT_CATS.map(function(c) { return { user_id: uid, name: c.name, icon: c.icon }; });
        var ins = await _supabase.from('categories').insert(rows).select();
        _categories = (ins.data && ins.data.length > 0) ? ins.data : DEFAULT_CATS;
    } else {
        _categories = res.data;
    }
    populateCategoryDropdown();
    renderCategoryList();
}

function populateCategoryDropdown() {
    var sel = $('#category');
    sel.empty();
    _categories.forEach(function(c) {
        sel.append('<option value="' + escHtml(c.name) + '">' + escHtml(c.name) + '</option>');
    });
}

function renderCategoryList() {
    var list = $('#categoryList');
    list.empty();
    _categories.forEach(function(c) {
        list.append('<div class="category-item"><span>' + escHtml(c.name) + '</span>' +
            '<button class="btn btn-sm btn-danger" onclick="deleteCategory(\'' + c.id + '\')">Remove</button></div>');
    });
}

async function addCategory() {
    var uid = await getUid();
    if (!uid) return;
    var name = $('#newCategoryName').val().trim();
    var icon = $('#categoryIcon').val();
    if (!name) { showToast('Enter a category name', 'error'); return; }
    var res = await _supabase.from('categories').insert({ user_id: uid, name: name, icon: icon });
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    $('#newCategoryName').val('');
    showToast('Category added', 'success');
    await loadCategories();
}

async function deleteCategory(id) {
    var res = await _supabase.from('categories').delete().eq('id', id);
    if (res.error) { showToast('Error: ' + res.error.message, 'error'); return; }
    showToast('Removed', 'success');
    await loadCategories();
}
window.deleteCategory = deleteCategory;

var _paymentSubId = null;
function openPaymentModal(id) {
    var sub = _subscriptions.find(function(s) { return s.id === id; });
    if (!sub) return;
    _paymentSubId = id;
    $('#paymentSubName').text(sub.name);
    $('#paymentAmount').text(getCurrency() + parseFloat(sub.amount).toFixed(2));
    $('#paymentModal').show();
}
window.openPaymentModal = openPaymentModal;

async function processPayment() {
    if (!_paymentSubId) return;
    var uid = await getUid();
    var sub = _subscriptions.find(function(s) { return s.id === _paymentSubId; });
    if (!sub) return;
    var method = $('.payment-method.active').data('method') || 'card';
    var upd = await _supabase.from('subscriptions').update({ payment_status: 'Paid' }).eq('id', _paymentSubId);
    if (upd.error) { showToast('Error: ' + upd.error.message, 'error'); return; }
    await _supabase.from('payment_history').insert({
        user_id: uid, subscription_id: _paymentSubId, subscription_name: sub.name,
        amount: sub.amount, payment_method: method, status: 'completed'
    });
    $('#paymentModal').hide();
    showToast('Payment successful!', 'success');
    await loadSubscriptions();
}

function exportSubscriptions() {
    var blob = new Blob([JSON.stringify(_subscriptions, null, 2)], {type:'application/json'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'subscriptions.json'; a.click();
    URL.revokeObjectURL(url);
}

async function updateCurrentUserName() {
    var res = await _supabase.auth.getSession();
    var session = res.data.session;
    if (!session) return;
    var name = (session.user.user_metadata && session.user.user_metadata.name)
        ? session.user.user_metadata.name : session.user.email.split('@')[0];
    $('#currentUserName').text(name);
}

function setupUserMenu() {
    $('#userMenuBtn').click(function(e) { e.stopPropagation(); $('#userDropdown').toggle(); });
    $(document).click(function() { $('#userDropdown').hide(); });
    $('#switchAccount').click(function(e) { e.preventDefault(); showToast('Coming soon!', 'info'); });
    $('#changePassword').click(function(e) { e.preventDefault(); $('#changePasswordModal').show(); });
    $('#logoutBtn').click(function(e) { e.preventDefault(); logout(); });
}

$(document).ready(async function() {
    var authed = await checkAuth();
    if (!authed) return;
    await updateCurrentUserName();
    await loadCategories();
    await loadSubscriptions();
    setupUserMenu();
    $('#subscriptionForm').submit(addSubscription);
    $('#confirmDelete').click(deleteSubscription);
    $('#cancelDelete').click(function() { _deleteId = null; $('#confirmModal').hide(); });
    $('#manageCategoriesBtn').click(function() { renderCategoryList(); $('#categoryModal').show(); });
    $('#addCategory').click(addCategory);
    $('#closeCategoryModal').click(function() { $('#categoryModal').hide(); });
    $('#processPayment').click(processPayment);
    $('#cancelPayment').click(function() { _paymentSubId = null; $('#paymentModal').hide(); });
    $('.payment-method').click(function() {
        $('.payment-method').removeClass('active'); $(this).addClass('active');
        $('#cardForm,#upiForm,#walletForm').hide();
        $('#' + $(this).data('method') + 'Form').show();
    });
    $('#exportBtn').click(exportSubscriptions);
    $('#importBtn').click(function() { $('#importFile').click(); });
    $('#themeToggle').click(toggleTheme);
});