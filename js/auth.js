// Supabase Auth - SubTrack
const SUPABASE_URL = 'https://dytysgpkgdjgoasutssx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR5dHlzZ3BrZ2RqZ29hc3V0c3N4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3MzExMDIsImV4cCI6MjA4OTMwNzEwMn0.cQAJHCemXkXWH-Tz7NEEFKDU1OXGqdtKfaH2MBg2CJI';

const { createClient } = supabase;
const _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Theme ──────────────────────────────────────────────────────────────────
function initializeTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeToggle(saved);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeToggle(next);
}

function updateThemeToggle(theme) {
    const btn = $('#themeToggle');
    if (btn.length) btn.text(theme === 'dark' ? '☀️' : '🌙');
}

// ── Toast ──────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    if ($('#toastContainer').length === 0) {
        $('body').append('<div id="toastContainer" class="toast-container"></div>');
    }
    const toast = $(`
        <div class="toast ${type}">
            <div class="toast-content"><p>${message}</p></div>
        </div>
    `);
    $('#toastContainer').append(toast);
    setTimeout(() => toast.fadeOut(() => toast.remove()), 3000);
}

// ── Session helpers ────────────────────────────────────────────────────────
function syncUserToLocalStorage(supabaseUser) {
    if (!supabaseUser) return;
    const existing = JSON.parse(localStorage.getItem('currentUser') || '{}');
    const user = {
        id: supabaseUser.id,
        name: supabaseUser.user_metadata?.name || existing.name || supabaseUser.email.split('@')[0],
        email: supabaseUser.email,
        createdAt: supabaseUser.created_at,
        lastLogin: new Date().toISOString(),
        status: 'active',
        role: supabaseUser.email === 'admin@subtrack.com' ? 'admin' : 'user'
    };
    localStorage.setItem('currentUser', JSON.stringify(user));
    localStorage.setItem('isLoggedIn', 'true');

    // Init user data buckets if first time
    if (!localStorage.getItem(`subscriptions_${user.id}`)) {
        initializeUserData(user.id);
    }
    return user;
}

function initializeUserData(userId) {
    const defaultCategories = [
        { name: 'OTT', icon: '📺' },
        { name: 'Software', icon: '💻' },
        { name: 'Education', icon: '📚' },
        { name: 'Fitness', icon: '💪' }
    ];
    localStorage.setItem(`categories_${userId}`, JSON.stringify(defaultCategories));
    localStorage.setItem(`userSettings_${userId}`, JSON.stringify({ currency: '₹', notifications: true, monthlyBudget: 5000 }));
    localStorage.setItem(`subscriptions_${userId}`, JSON.stringify([]));
    localStorage.setItem(`notifications_${userId}`, JSON.stringify([]));
    localStorage.setItem(`paymentHistory_${userId}`, JSON.stringify([]));
    localStorage.setItem(`receipts_${userId}`, JSON.stringify([]));
}

// ── Auth check (called on every protected page) ────────────────────────────
async function checkAuth() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['login.html', 'register.html'];

    const { data: { session } } = await _supabase.auth.getSession();

    if (!session) {
        localStorage.removeItem('isLoggedIn');
        localStorage.removeItem('currentUser');
        if (!publicPages.includes(currentPage)) {
            window.location.href = 'login.html';
            return false;
        }
        return false;
    }

    // Logged in
    syncUserToLocalStorage(session.user);

    if (publicPages.includes(currentPage)) {
        window.location.href = 'index.html';
        return false;
    }

    // Admin gate
    if (currentPage === 'admin.html' && session.user.email !== 'admin@subtrack.com') {
        window.location.href = 'index.html';
        return false;
    }

    return true;
}

// ── Login ──────────────────────────────────────────────────────────────────
async function handleLogin() {
    const email = $('#email').val().trim();
    const password = $('#password').val().trim();
    const rememberMe = $('#rememberMe').is(':checked');

    clearErrors();

    if (!validateEmail(email)) { showError('emailError', 'Please enter a valid email address'); return; }
    if (password.length < 6) { showError('passwordError', 'Password must be at least 6 characters'); return; }

    const btn = $('#loginForm button[type=submit]');
    btn.text('Signing in...').prop('disabled', true);

    const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

    btn.text('Sign In').prop('disabled', false);

    if (error) {
        showError('passwordError', error.message);
        return;
    }

    if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
        localStorage.setItem('rememberMe', 'true');
    } else {
        localStorage.removeItem('rememberedEmail');
        localStorage.removeItem('rememberMe');
    }

    syncUserToLocalStorage(data.user);
    window.location.href = 'index.html';
}

// ── Register ───────────────────────────────────────────────────────────────
async function handleRegister() {
    const name = $('#name').val().trim();
    const email = $('#email').val().trim();
    const password = $('#password').val().trim();
    const confirmPassword = $('#confirmPassword').val().trim();

    clearErrors();

    if (name.length < 2) { showError('nameError', 'Name must be at least 2 characters'); return; }
    if (!validateEmail(email)) { showError('emailError', 'Please enter a valid email address'); return; }
    if (!validatePassword(password)) { showError('passwordError', 'Password must be at least 8 characters with uppercase, lowercase, and number'); return; }
    if (password !== confirmPassword) { showError('confirmPasswordError', 'Passwords do not match'); return; }

    const btn = $('#registerForm button[type=submit]');
    btn.text('Creating account...').prop('disabled', true);

    const { data, error } = await _supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }
    });

    btn.text('Create Account').prop('disabled', false);

    if (error) {
        showError('emailError', error.message);
        return;
    }

    // Supabase may require email confirmation depending on project settings
    if (data.user && data.session) {
        syncUserToLocalStorage(data.user);
        window.location.href = 'index.html';
    } else {
        // Email confirmation required
        showToast('Check your email to confirm your account, then log in.', 'success');
        setTimeout(() => window.location.href = 'login.html', 3000);
    }
}

// ── Change Password ────────────────────────────────────────────────────────
async function handleChangePassword() {
    const newPassword = $('#newPassword').val();
    const confirmNewPassword = $('#confirmNewPassword').val();

    if (!validatePassword(newPassword)) {
        showToast('Password must be at least 8 characters with uppercase, lowercase, and number', 'error');
        return;
    }
    if (newPassword !== confirmNewPassword) {
        showToast('New passwords do not match', 'error');
        return;
    }

    const { error } = await _supabase.auth.updateUser({ password: newPassword });

    if (error) {
        showToast(error.message, 'error');
        return;
    }

    $('#changePasswordModal').hide();
    $('#changePasswordForm')[0].reset();
    showToast('Password changed successfully', 'success');
}

// ── Logout ─────────────────────────────────────────────────────────────────
async function logout() {
    await _supabase.auth.signOut();
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('currentUser');
    localStorage.removeItem('loginTime');
    window.location.href = 'login.html';
}

// ── Validation helpers ─────────────────────────────────────────────────────
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
    } else {
        input.type = 'password';
        btn.textContent = '👁️';
    }
}
window.togglePassword = togglePassword;

function validatePassword(password) {
    return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/.test(password);
}

function showError(elementId, message) {
    $('#' + elementId).text(message);
}

function clearErrors() {
    $('.error-message').text('');
}

function loadRememberedCredentials() {
    if (localStorage.getItem('rememberMe') === 'true') {
        const email = localStorage.getItem('rememberedEmail');
        if (email) { $('#email').val(email); $('#rememberMe').prop('checked', true); }
    }
}

// ── DOM ready ──────────────────────────────────────────────────────────────
$(document).ready(function () {
    initializeTheme();

    $('#loginForm').submit(function (e) { e.preventDefault(); handleLogin(); });
    $('#registerForm').submit(function (e) { e.preventDefault(); handleRegister(); });
    $('#changePasswordForm').submit(function (e) { e.preventDefault(); handleChangePassword(); });

    $('#cancelPasswordChange').click(() => $('#changePasswordModal').hide());
    $('#closeAccountSwitch').click(() => $('#accountSwitchModal').hide());
    $('#addNewAccount').click(() => window.location.href = 'register.html');

    loadRememberedCredentials();
});

// ── Exports ────────────────────────────────────────────────────────────────
window.checkAuth = checkAuth;
window.logout = logout;
window.toggleTheme = toggleTheme;
window.showToast = showToast;
window._supabase = _supabase;
