// Main application logic - Supabase backed
let subscriptions = [];
let categories = [];
let deleteTargetId = null;
let paymentTargetId = null;

$(document).ready(async function () {
    if (!await checkAuth()) return;

    await loadCategories();
    await loadSubscriptions();
    updateSummaryCards();
    renderSubscriptionsTable();
    updateBudgetRing();
    updateCurrentUserName();

    $('#startDate').val(new Date().toISOString().split('T')[0]);

    $('#subscriptionForm').submit(handleAddSubscription);
    $('#themeToggle').click(toggleTheme);
    $('#logoutBtn').click(logout);
    $('#confirmDelete').click(confirmDelete);
    $('#cancelDelete').click(cancelDelete);
    $('.payment-method').click(handlePaymentMethodSelect);
    $('#processPayment').click(processPayment);
    $('#cancelPayment').click(cancelPayment);
    $('#manageCategoriesBtn').click(openCategoryModal);
    $('#addCategory').click(addCategory);
    $('#closeCategoryModal').click(closeCategoryModal);
    $('#exportBtn').click(exportSubscriptions);
    $('#importBtn').click(() => $('#importFile').click());
    $('#importFile').change(handleImportFile);

    setupUserMenu();
    setupAutoLogout();
    checkRenewalAlerts();
    initializeDragAndDrop();
});

// ── Helpers ────────────────────────────────────────────────────────────────
function currentUserId() {
    return JSON.parse(localStorage.getItem('currentUser') || '{}').id;
}

function getCurrency() {
    return JSON.parse(localStorage.getItem('userSettings') || '{}').currency || '₹';
}

// ── Categories ─────────────────────────────────────────────────────────────
async function loadCategories() {
    const { data, error } = await _supabase
        .from('categories')
        .select('*')
        .eq('user_id', currentUserId())
        .order('created_at');

    if (error) { console.error(error); return; }

    if (data.length === 0) {
        await seedDefaultCategories();
    } else {
        categories = data;
    }
    updateCategoryDropdown();
}

async function seedDefaultCategories() {
    const defaults = [
        { name: 'OTT', icon: '📺' },
        { name: 'Software', icon: '💻' },
        { name: 'Education', icon: '📚' },
        { name: 'Fitness', icon: '💪' }
    ];
    const rows = defaults.map(c => ({ ...c, user_id: currentUserId() }));
    const { data } = await _supabase.from('categories').insert(rows).select();
    categories = data || defaults;
}

async function saveCategory(name, icon) {
    const { data, error } = await _supabase
        .from('categories')
        .insert({ name, icon, user_id: currentUserId() })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function removeCategoryFromDB(id) {
    const { error } = await _supabase.from('categories').delete().eq('id', id);
    if (error) throw error;
}

function updateCategoryDropdown() {
    const dropdown = $('#category');
    dropdown.empty();
    categories.forEach(cat => {
        dropdown.append(`<option value="${cat.name}">${cat.icon} ${cat.name}</option>`);
    });
}

function openCategoryModal() { renderCategoryList(); $('#categoryModal').show(); }
function closeCategoryModal() { $('#categoryModal').hide(); }

async function addCategory() {
    const name = $('#newCategoryName').val().trim();
    const icon = $('#categoryIcon').val();
    if (!name) { showToast('Please enter category name', 'error'); return; }
    if (categories.find(c => c.name === name)) { showToast('Category already exists', 'error'); return; }
    try {
        const cat = await saveCategory(name, icon);
        categories.push(cat);
        updateCategoryDropdown();
        renderCategoryList();
        $('#newCategoryName').val('');
        showToast('Category added', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

async function deleteCategory(id, name) {
    if (categories.length <= 1) { showToast('Cannot delete the last category', 'error'); return; }
    if (subscriptions.find(s => s.category === name)) {
        showToast('Category is in use by a subscription', 'error'); return;
    }
    try {
        await removeCategoryFromDB(id);
        categories = categories.filter(c => c.id !== id);
        updateCategoryDropdown();
        renderCategoryList();
        showToast('Category deleted', 'success');
    } catch (e) { showToast(e.message, 'error'); }
}

function renderCategoryList() {
    const container = $('#categoryList');
    container.empty();
    categories.forEach(cat => {
        container.append(`
            <div class="category-item">
                <div><span class="category-icon">${cat.icon}</span><span>${cat.name}</span></div>
                <button class="btn btn-sm btn-danger" onclick="deleteCategory('${cat.id}','${cat.name}')">Delete</button>
            </div>
        `);
    });
}

// ── Subscriptions ──────────────────────────────────────────────────────────
async function loadSubscriptions() {
    const { data, error } = await _supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', currentUserId())
        .order('created_at');
    if (error) { console.error(error); return; }
    subscriptions = data || [];
}

async function handleAddSubscription(e) {
    e.preventDefault();
    const formData = {
        user_id: currentUserId(),
        name: $('#subName').val().trim(),
        amount: parseFloat($('#amount').val()),
        start_date: $('#startDate').val(),
        billing_cycle: $('#billingCycle').val(),
        category: $('#category').val(),
        autopay: $('#autopay').val(),
        payment_method: 'card'
    };

    if (!formData.name || !formData.amount || !formData.start_date) {
        showToast('Please fill all required fields', 'error'); return;
    }

    const { data, error } = await _supabase
        .from('subscriptions')
        .insert(formData)
        .select()
        .single();

    if (error) { showToast(error.message, 'error'); return; }

    subscriptions.push(data);
    updateSummaryCards();
    renderSubscriptionsTable();
    updateBudgetRing();
    $('#subscriptionForm')[0].reset();
    $('#startDate').val(new Date().toISOString().split('T')[0]);
    showToast('Subscription added!', 'success');
    $(document).trigger('subscriptionUpdated');
}

async function deleteSubscription(id) {
    deleteTargetId = id;
    $('#confirmModal').show();
}

async function confirmDelete() {
    if (!deleteTargetId) return;
    const { error } = await _supabase.from('subscriptions').delete().eq('id', deleteTargetId);
    if (error) { showToast(error.message, 'error'); }
    else {
        subscriptions = subscriptions.filter(s => s.id !== deleteTargetId);
        updateSummaryCards();
        renderSubscriptionsTable();
        updateBudgetRing();
        showToast('Subscription deleted', 'success');
        $(document).trigger('subscriptionUpdated');
    }
    $('#confirmModal').hide();
    deleteTargetId = null;
}

function cancelDelete() { $('#confirmModal').hide(); deleteTargetId = null; }

// ── Summary & Budget ───────────────────────────────────────────────────────
function updateSummaryCards() {
    const currency = getCurrency();
    $('#totalSubs').text(subscriptions.length);
    $('#monthlySpending').text(`${currency}${calculateMonthlySpending()}`);
    $('#autopayCount').text(subscriptions.filter(s => s.autopay === 'ON').length);
}

function calculateMonthlySpending() {
    return subscriptions.reduce((t, s) => {
        return t + (s.billing_cycle === 'Yearly' ? s.amount / 12 : s.amount);
    }, 0).toFixed(2);
}

function updateBudgetRing() {
    const settings = JSON.parse(localStorage.getItem('userSettings') || '{}');
    const budget = settings.monthlyBudget || 5000;
    const spending = parseFloat(calculateMonthlySpending());
    const pct = Math.min((spending / budget) * 100, 100);
    const circumference = 2 * Math.PI * 35;
    const offset = circumference - (pct / 100) * circumference;
    const circle = $('#budgetProgress');
    circle.css('stroke-dashoffset', offset);
    $('#budgetPercentage').text(`${Math.round(pct)}%`);
    circle.css('stroke', pct > 90 ? '#f56565' : pct > 75 ? '#ed8936' : '#667eea');
}

// ── Table ──────────────────────────────────────────────────────────────────
function renderSubscriptionsTable() {
    const tbody = $('#subscriptionsBody');
    tbody.empty();
    const currency = getCurrency();

    if (subscriptions.length === 0) {
        tbody.append(`<tr><td colspan="8" style="text-align:center;color:var(--text-secondary)">No subscriptions yet. Add one above!</td></tr>`);
        return;
    }

    subscriptions.forEach(sub => {
        const nextRenewal = calculateNextRenewal(sub.start_date, sub.billing_cycle);
        const status = getSubscriptionStatus(nextRenewal);
        const paymentStatus = getPaymentStatus(nextRenewal, sub.autopay);
        const monthly = sub.billing_cycle === 'Yearly' ? sub.amount / 12 : sub.amount;

        tbody.append(`
            <tr data-id="${sub.id}">
                <td>${sub.name}</td>
                <td>${sub.category}</td>
                <td>${currency}${monthly.toFixed(2)}</td>
                <td>${formatDate(nextRenewal)}</td>
                <td><span class="status ${status.class}">${status.text}</span></td>
                <td><span class="payment-status ${paymentStatus.class}">${paymentStatus.text}</span></td>
                <td>${sub.autopay}</td>
                <td>
                    ${paymentStatus.text === 'Pending' ? `<button class="action-btn pay-btn" onclick="openPaymentModal('${sub.id}')">Pay Now</button>` : ''}
                    <button class="action-btn delete-btn" onclick="deleteSubscription('${sub.id}')">Delete</button>
                </td>
            </tr>
        `);
    });
}

function calculateNextRenewal(startDate, billingCycle) {
    const start = new Date(startDate);
    const today = new Date();
    let next = new Date(start);
    while (next <= today) {
        billingCycle === 'Monthly' ? next.setMonth(next.getMonth() + 1) : next.setFullYear(next.getFullYear() + 1);
    }
    return next;
}

function getSubscriptionStatus(nextRenewal) {
    const days = Math.ceil((nextRenewal - new Date()) / 86400000);
    if (days < 0) return { class: 'expired', text: 'Expired' };
    if (days <= 5) return { class: 'renew-soon', text: 'Renew Soon' };
    return { class: 'active', text: 'Active' };
}

function getPaymentStatus(nextRenewal, autopay) {
    const expired = nextRenewal < new Date();
    if (expired && autopay === 'OFF') return { class: 'pending', text: 'Pending' };
    return { class: 'paid', text: 'Paid' };
}

function formatDate(date) {
    return date.toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });
}
