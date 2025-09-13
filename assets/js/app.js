// Main Application Logic - Single Page App
let myMSALObj;
let currentAccount = null;
let userIsAdmin = false;
let userHasSubscription = false;
let selectedClub = null; // 'year4' or 'year5'
let currentView = 'overview';
let statusMessage = "";
let statusType = "";

// B2C Configuration (from original working version)
const B2C_CONFIG = {
    tenantName: "brightstars11plus",
    tenantId: "d96d2f4e-d080-4c2f-90e1-cce96e64b6ba",
    clientId: "a4f6894b-e8f4-4102-a777-63d749372a6b",
    signInSignUpPolicyName: "SignUpSignIn",
    redirectUri: window.location.origin,
    scopes: ["openid", "profile"],
    cacheLocation: "sessionStorage",
    isConfigured: true
};

const getAuthority = () => {
    return `https://${B2C_CONFIG.tenantName}.ciamlogin.com/${B2C_CONFIG.tenantId}`;
};

const msalConfig = {
    auth: {
        clientId: B2C_CONFIG.clientId,
        authority: getAuthority(),
        knownAuthorities: [`${B2C_CONFIG.tenantName}.ciamlogin.com`],
        redirectUri: B2C_CONFIG.redirectUri,
        postLogoutRedirectUri: B2C_CONFIG.redirectUri,
        navigateToLoginRequestUrl: false
    },
    cache: {
        cacheLocation: B2C_CONFIG.cacheLocation,
        storeAuthStateInCookie: false
    }
};

const loginRequest = {
    scopes: B2C_CONFIG.scopes,
    extraQueryParameters: {
        p: B2C_CONFIG.signInSignUpPolicyName
    },
    prompt: "select_account"
};

// Main render function - decides what to show
function render() {
    const app = document.getElementById('app');
    
    if (!currentAccount) {
        app.innerHTML = renderLogin();
    } else if (!selectedClub) {
        app.innerHTML = renderClubSelection();
    } else {
        app.innerHTML = renderDashboard();
    }
}

// Render login screen
function renderLogin() {
    return `
        <div class="auth-container fade-in-up">
            <h2>11+ Learning Platform</h2>
            
            ${statusMessage ? `
                <div class="auth-status ${statusType}">
                    ${statusMessage}
                    ${statusType === 'info' ? '<span class="loading"></span>' : ''}
                </div>
            ` : ''}
            
            <img src="/images/bright-stars-logo.png" alt="Bright Stars Education" class="auth-logo" />
            
            <p style="font-size: 16px; color: var(--text-medium); margin-bottom: 30px;">
                Your gateway to academic excellence. Please sign in to access your personalized learning experience.
            </p>
            
            <button class="btn" onclick="signIn()" id="signInButton" ${!myMSALObj ? 'disabled style="opacity: 0.6;"' : ''} style="width: 100%; margin-bottom: 20px; font-size: 18px;">
                🚀 Sign In to Start Learning
            </button>
        </div>
    `;
}

// Render club selection screen
function renderClubSelection() {
    const username = currentAccount?.idTokenClaims?.name || currentAccount?.username || "User";
    
    return `
        <div class="container">
            <div class="header">
                <div class="logo">
                    <img src="/images/bright-stars-logo.png" alt="Bright Stars Education" class="logo-image" style="height: 60px;" />
                </div>
                <div class="user-info">
                    ${userHasSubscription ? 
                        '<span class="subscription-badge">Active Subscription</span>' :
                        '<span class="subscription-badge inactive">No Subscription</span>'
                    }
                    <span style="color: var(--text-medium); font-weight: 600;">Welcome, ${username}!</span>
                    <button class="btn btn-secondary" onclick="signOut()">Logout</button>
                </div>
            </div>
            <div class="club-selection fade-in-up">
                <div>
                    <h1 class="club-selection-title">Choose Your Learning Path</h1>
                    <p class="club-selection-subtitle">Select the program that's right for your child's year group</p>
                </div>
                
                <div class="club-boxes">
                    <div class="club-box year4" onclick="selectClub('year4')">
                        <div class="club-icon">🎓</div>
                        <h3 class="club-title">Year 4</h3>
                        <p class="club-subtitle">11+ Prep Club</p>
                        <p class="club-description">
                            Foundation preparation for children in Year 4, building essential skills 
                            for the 11+ journey ahead with engaging lessons and activities.
                        </p>
                    </div>
                    
                    <div class="club-box year5" onclick="selectClub('year5')">
                        <div class="club-icon">🚀</div>
                        <h3 class="club-title">Year 5</h3>
                        <p class="club-subtitle">11+ Club</p>
                        <p class="club-description">
                            Intensive 11+ preparation for Year 5 children, covering advanced topics 
                            and exam techniques to excel in their 11+ assessments.
                        </p>
                    </div>
                </div>
                
                ${userIsAdmin ? `
                    <div style="margin-top: 40px;">
                        <button class="btn btn-secondary" onclick="setCurrentView('admin-users')">
                            🛡️ Admin Panel
                        </button>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Render dashboard with sidebar
function renderDashboard() {
    return `
        <div class="container">
            <div class="header">
                <div class="logo">
                    <img src="/images/bright-stars-logo.png" alt="Bright Stars Education" class="logo-image" style="height: 60px;" />
                </div>
                <div class="user-info">
                    ${userHasSubscription ? 
                        '<span class="subscription-badge">Active Subscription</span>' :
                        '<span class="subscription-badge inactive">No Subscription</span>'
                    }
                    <button class="btn btn-secondary" onclick="signOut()">Logout</button>
                </div>
            </div>
            <div class="dashboard fade-in-up">
                ${renderSidebar()}
                ${renderContentArea()}
            </div>
        </div>
    `;
}

// Render sidebar navigation
function renderSidebar() {
    const clubInfo = selectedClub === 'year4' ? 
        { title: 'Year 4 - 11+ Prep Club', subtitle: 'Foundation preparation program' } :
        { title: 'Year 5 - 11+ Club', subtitle: 'Intensive preparation program' };
    
    const navItems = [
        { id: 'overview', icon: '📚', label: 'Overview' },
        { id: 'maths-syllabus', icon: '🔢', label: 'Maths Syllabus' },
        { id: 'english-syllabus', icon: '📚', label: 'English Syllabus' },
        { id: 'extra-resources', icon: '📖', label: 'Extra Resources' },
        { id: 'year-ahead', icon: '📅', label: 'The Year Ahead' },
        ...(selectedClub === 'year5' ? [{ id: 'student-area', icon: '👨‍🎓', label: 'Student Area' }] : []),
        { id: 'subscription', icon: '💳', label: 'Subscription' },
        ...(userIsAdmin ? [
            { id: 'admin-users', icon: '👥', label: 'User Management' },
            { id: 'admin-lessons', icon: '⚙️', label: 'Manage Lessons' }
        ] : [])
    ];
    
    return `
        <div class="sidebar">
            <button class="back-to-clubs" onclick="goBackToClubSelection()">
                ← Back to Club Selection
            </button>
            
            <div class="sidebar-header">
                <h3 class="sidebar-title">${clubInfo.title}</h3>
                <p class="sidebar-subtitle">${clubInfo.subtitle}</p>
            </div>
            
            <div class="nav-section">
                ${navItems.map(item => `
                    <div class="nav-item ${currentView === item.id ? 'active' : ''}" 
                         onclick="setCurrentView('${item.id}')">
                        <span class="nav-item-icon">${item.icon}</span>
                        <span>${item.label}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// Render content area based on current view
function renderContentArea() {
    switch (currentView) {
        case 'overview':
            return renderOverview();
        case 'maths-syllabus':
            return renderMathsSyllabus();
        case 'english-syllabus':
            return renderEnglishSyllabus();
        case 'extra-resources':
            return renderExtraResources();
        case 'year-ahead':
            return renderYearAhead();
        case 'subscription':
            return renderSubscription();
        case 'admin-users':
            return renderAdminUsers();
        case 'admin-lessons':
            return renderAdminLessons();
        default:
            return renderOverview();
    }
}

// Content render functions
function renderOverview() {
    const clubType = selectedClub === 'year4' ? 'Year 4 11+ Prep Club' : 'Year 5 11+ Club';
    
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">Welcome to ${clubType}</h1>
                    <p class="content-subtitle">Everything you need for 11+ success</p>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="content-card maths" onclick="setCurrentView('maths-syllabus')">
                    <span class="card-icon">🔢</span>
                    <h3 class="card-title">Maths Syllabus</h3>
                    <p class="card-description">
                        Comprehensive maths lessons covering all 11+ topics with practice 
                        worksheets, homework sheets, and step-by-step guides.
                    </p>
                    <div class="card-meta">
                        <span>📚 Topic-Based</span>
                        <span>✏️ Practice Sheets</span>
                    </div>
                </div>
                
                <div class="content-card english" onclick="setCurrentView('english-syllabus')">
                    <span class="card-icon">📚</span>
                    <h3 class="card-title">English Syllabus</h3>
                    <p class="card-description">
                        Master English skills with structured lessons covering comprehension, 
                        creative writing, grammar, and vocabulary building.
                    </p>
                    <div class="card-meta">
                        <span>✍️ Writing Skills</span>
                        <span>📖 Comprehension</span>
                    </div>
                </div>
                
                <div class="content-card resources" onclick="setCurrentView('extra-resources')">
                    <span class="card-icon">🎯</span>
                    <h3 class="card-title">Extra Resources</h3>
                    <p class="card-description">
                        Additional materials including topic videos, past papers, worked 
                        examples, and reading lists to enhance learning.
                    </p>
                    <div class="card-meta">
                        <span>🎥 Videos</span>
                        <span>📄 Past Papers</span>
                    </div>
                </div>
                
                <div class="content-card planning" onclick="setCurrentView('year-ahead')">
                    <span class="card-icon">📅</span>
                    <h3 class="card-title">The Year Ahead</h3>
                    <p class="card-description">
                        Your structured 44-week learning journey with weekly topics, milestones, 
                        designed to build confidence and skills progressively.
                    </p>
                    <div class="card-meta">
                        <span>📊 44 Week Plan</span>
                        <span>🎯 Goal-Oriented</span>
                    </div>
                </div>
                
                ${selectedClub === 'year5' ? `
                    <div class="content-card" style="border-left: 5px solid var(--primary-purple);" onclick="setCurrentView('student-area')">
                        <span class="card-icon" style="color: var(--primary-purple);">👨‍🎓</span>
                        <h3 class="card-title">Student Area</h3>
                        <p class="card-description">
                            Track progress, access homework assignments, and view test 
                            scores in a secure, GDPR-compliant environment.
                        </p>
                        <div class="card-meta">
                            <span>📊 Progress Tracking</span>
                            <span>🔒 Secure Access</span>
                        </div>
                    </div>
                ` : ''}
                
                <div class="content-card" style="border-left: 5px solid var(--sunny-yellow);" onclick="setCurrentView('subscription')">
                    <span class="card-icon" style="color: var(--sunny-yellow);">💳</span>
                    <h3 class="card-title">Subscription</h3>
                    <p class="card-description">
                        Manage your subscription, update payment methods, and view 
                        billing history for your learning platform access.
                    </p>
                    <div class="card-meta">
                        <span>✅ Active Plan</span>
                        <span>🔄 Auto-Renewal</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderMathsSyllabus() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">Maths Syllabus</h1>
                    <p class="content-subtitle">Topic-based lesson plans and resources</p>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="content-card enhanced maths">
                    <span class="card-icon">➕</span>
                    <h3 class="card-title">Number & Algebra</h3>
                    <p class="card-description">
                        Master arithmetic operations, fractions, decimals, and basic algebra 
                        concepts essential for 11+ success.
                    </p>
                    <div class="card-meta">
                        <span>📊 12 Topics</span>
                        <span>🎯 Practice Tests</span>
                    </div>
                </div>
                
                <div class="content-card enhanced maths">
                    <span class="card-icon">📐</span>
                    <h3 class="card-title">Geometry & Measures</h3>
                    <p class="card-description">
                        Learn shapes, angles, area, perimeter, and measurement units with 
                        visual exercises and problem-solving techniques.
                    </p>
                    <div class="card-meta">
                        <span>📊 8 Topics</span>
                        <span>📏 Visual Aids</span>
                    </div>
                </div>
                
                <div class="content-card enhanced maths">
                    <span class="card-icon">📊</span>
                    <h3 class="card-title">Data & Statistics</h3>
                    <p class="card-description">
                        Understand charts, graphs, probability, and data interpretation 
                        skills commonly tested in 11+ exams.
                    </p>
                    <div class="card-meta">
                        <span>📊 6 Topics</span>
                        <span>📈 Real Examples</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderEnglishSyllabus() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">English Syllabus</h1>
                    <p class="content-subtitle">Comprehensive English language and literature</p>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="content-card enhanced english">
                    <span class="card-icon">📖</span>
                    <h3 class="card-title">Reading & Comprehension</h3>
                    <p class="card-description">
                        Develop critical reading skills with diverse texts, inference questions, 
                        and comprehension strategies for 11+ success.
                    </p>
                    <div class="card-meta">
                        <span>📚 20 Texts</span>
                        <span>❓ Question Types</span>
                    </div>
                </div>
                
                <div class="content-card enhanced english">
                    <span class="card-icon">✍️</span>
                    <h3 class="card-title">Creative Writing</h3>
                    <p class="card-description">
                        Master storytelling techniques, descriptive writing, and creative 
                        expression through structured exercises and prompts.
                    </p>
                    <div class="card-meta">
                        <span>✏️ Writing Prompts</span>
                        <span>🎨 Story Types</span>
                    </div>
                </div>
                
                <div class="content-card enhanced english">
                    <span class="card-icon">📝</span>
                    <h3 class="card-title">Grammar & Punctuation</h3>
                    <p class="card-description">
                        Perfect grammar, punctuation, and sentence structure with 
                        interactive exercises and clear explanations.
                    </p>
                    <div class="card-meta">
                        <span>✅ Interactive</span>
                        <span>📋 Rules & Examples</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderExtraResources() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">Extra Resources</h1>
                    <p class="content-subtitle">Additional materials to enhance your learning</p>
                </div>
            </div>
            
            <div class="content-grid">
                <div class="content-card resources">
                    <span class="card-icon">🎥</span>
                    <h3 class="card-title">Topic Videos</h3>
                    <p class="card-description">
                        Video explanations and tutorials covering key concepts 
                        with visual demonstrations and worked examples.
                    </p>
                    <div class="card-meta">
                        <span>🎬 HD Videos</span>
                        <span>⏱️ Bite-sized</span>
                    </div>
                </div>
                
                <div class="content-card resources">
                    <span class="card-icon">📄</span>
                    <h3 class="card-title">Past Papers</h3>
                    <p class="card-description">
                        Practice with real 11+ exam papers from various schools 
                        with detailed marking schemes and answers.
                    </p>
                    <div class="card-meta">
                        <span>📚 Real Exams</span>
                        <span>✅ Mark Schemes</span>
                    </div>
                </div>
                
                <div class="content-card resources">
                    <span class="card-icon">📚</span>
                    <h3 class="card-title">Reading Lists</h3>
                    <p class="card-description">
                        Curated book recommendations and reading materials 
                        to improve vocabulary and comprehension skills.
                    </p>
                    <div class="card-meta">
                        <span>📖 Age-Appropriate</span>
                        <span>🏆 Award Winners</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderYearAhead() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">The Year Ahead</h1>
                    <p class="content-subtitle">Your structured 44-week learning journey</p>
                </div>
            </div>
            
            <div class="coming-soon">
                <div class="coming-soon-icon">📅</div>
                <h3>Teaching Plan Coming Soon!</h3>
                <p>
                    We're preparing your comprehensive year-long teaching plan with weekly 
                    topics, milestones, and structured learning objectives. This will help 
                    you track progress and stay on target for 11+ success.
                </p>
            </div>
        </div>
    `;
}

function renderSubscription() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">Subscription</h1>
                    <p class="content-subtitle">Manage your subscription and billing</p>
                </div>
            </div>
            
            <div class="coming-soon">
                <div class="coming-soon-icon">💳</div>
                <h3>Subscription Management Coming Soon!</h3>
                <p>
                    We're building a comprehensive subscription management system where you can 
                    update payment methods, view billing history, and manage your account settings.
                </p>
            </div>
        </div>
    `;
}

function renderAdminUsers() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">User Management</h1>
                    <p class="content-subtitle">Approve pending users and assign roles</p>
                </div>
            </div>

            <div class="stats-overview">
                <div class="stat-card">
                    <span class="stat-number" id="total-users">0</span>
                    <span class="stat-label">Total Users</span>
                </div>
                <div class="stat-card">
                    <span class="stat-number" id="active-users">0</span>
                    <span class="stat-label">Active Users</span>
                </div>
                <div class="stat-card">
                    <span class="stat-number" id="pending-users">0</span>
                    <span class="stat-label">Pending Approval</span>
                </div>
            </div>

            <div class="user-filters">
                <button class="filter-btn active" data-filter="all">All Users</button>
                <button class="filter-btn" data-filter="active">Active</button>
                <button class="filter-btn" data-filter="pending">Pending</button>
                <button class="filter-btn" data-filter="tutors">Tutors</button>
            </div>

            <div id="all-users-container">
                <!-- Users will be loaded here -->
            </div>
        </div>
    `;
}

function renderAdminLessons() {
    return `
        <div class="content-area">
            <div class="content-header">
                <div>
                    <h1 class="content-title">Lesson Management</h1>
                    <p class="content-subtitle">Manage lessons and content</p>
                </div>
            </div>
            
            <div class="coming-soon">
                <div class="coming-soon-icon">📚</div>
                <h3>Lesson Management Coming Soon!</h3>
                <p>
                    We're building comprehensive lesson management tools for creating, 
                    editing, and organizing educational content.
                </p>
            </div>
        </div>
    `;
}

// Navigation functions
function selectClub(club) {
    selectedClub = club;
    currentView = 'overview';
    render();
}

function goBackToClubSelection() {
    selectedClub = null;
    currentView = 'overview';
    render();
}

function setCurrentView(view) {
    currentView = view;
    render();
    
    // Load admin users if accessing admin panel
    if (view === 'admin-users' && typeof loadAllUsers === 'function') {
        setTimeout(() => loadAllUsers(), 100);
    }
}

// Authentication functions
async function initializeAuth() {
    // Wait for MSAL to be available
    let attempts = 0;
    const maxAttempts = 100;
    
    while (typeof msal === 'undefined' && attempts < maxAttempts) {
        console.log(`Waiting for MSAL... attempt ${attempts + 1}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    
    if (typeof msal === 'undefined') {
        console.error('MSAL failed to load');
        statusMessage = 'Authentication library failed to load. Please refresh the page.';
        statusType = 'error';
        render();
        return;
    }
    
    try {
        myMSALObj = new msal.PublicClientApplication(msalConfig);
        await myMSALObj.initialize();
        console.log("MSAL initialized successfully");
        await selectAccount();
        render();
    } catch (error) {
        console.error("MSAL initialization failed:", error);
        statusMessage = 'Authentication initialization failed. Please refresh the page.';
        statusType = 'error';
        render();
    }
}

async function selectAccount() {
    try {
        const response = await myMSALObj.handleRedirectPromise();
        if (response && response.account) {
            currentAccount = response.account;
        }
    } catch (error) {
        console.error("Error handling redirect:", error);
    }
    
    const currentAccounts = myMSALObj.getAllAccounts();
    if (currentAccounts.length > 0 && !currentAccount) {
        currentAccount = currentAccounts[0];
    }
    
    if (currentAccount) {
        await checkUserStatus();
    }
}

async function checkUserStatus() {
    if (!currentAccount) return;

    const email = currentAccount.username || currentAccount.idTokenClaims?.emails?.[0];
    if (!email) return;

    try {
        // Check subscription status
        const [userStatusResponse, subscriptionResponse] = await Promise.allSettled([
            fetch('/api/checkuserstatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            }),
            fetch('/api/stripe-get-subscription', {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            })
        ]);

        // Check for admin status
        userIsAdmin = await detectUserAdmin(email, currentAccount.idTokenClaims);
        
        // Handle subscription status
        if (subscriptionResponse.status === 'fulfilled' && subscriptionResponse.value.ok) {
            const subscriptionData = await subscriptionResponse.value.json();
            userHasSubscription = subscriptionData.hasActiveSubscription || false;
        }
        
        console.log('User status checked:', { email, userIsAdmin, userHasSubscription });
        
    } catch (error) {
        console.error('Error checking user status:', error);
    }
}

async function detectUserAdmin(email, idTokenClaims) {
    try {
        // Check Azure B2C token claims first
        if (idTokenClaims && idTokenClaims.extension_isAdmin === true) {
            return true;
        }
        
        if (idTokenClaims && idTokenClaims.roles && Array.isArray(idTokenClaims.roles)) {
            const hasAdminRole = idTokenClaims.roles.some(role => 
                role.toLowerCase().includes('admin') || 
                role.toLowerCase().includes('teacher') ||
                role.toLowerCase().includes('tutor')
            );
            if (hasAdminRole) return true;
        }
        
        // Check known admin emails
        const knownAdminEmails = [
            'jason@bridge1.net',
            'admin@brightstars11plus.com',
            'teacher@brightstars11plus.com'
        ];
        
        if (knownAdminEmails.includes(email.toLowerCase())) {
            return true;
        }
        
        // Final fallback: Check admin API
        try {
            const adminCheckResponse = await fetch('/api/check-admin-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email })
            });
            
            if (adminCheckResponse.ok) {
                const adminData = await adminCheckResponse.json();
                return adminData.isAdmin || false;
            }
        } catch (error) {
            console.log('Admin check API not available:', error.message);
        }
        
        return false;
        
    } catch (error) {
        console.error('Error detecting admin status:', error);
        return false;
    }
}

async function signIn() {
    if (!myMSALObj) {
        statusMessage = 'Authentication is still initializing. Please wait a moment and try again.';
        statusType = 'info';
        render();
        return;
    }

    try {
        statusMessage = 'Redirecting to login...';
        statusType = 'info';
        render();
        await myMSALObj.loginRedirect(loginRequest);
    } catch (error) {
        console.error("Login failed:", error);
        statusMessage = 'Login failed. Please try again.';
        statusType = 'error';
        render();
    }
}

async function signOut() {
    if (!myMSALObj) return;

    try {
        const logoutRequest = {
            postLogoutRedirectUri: B2C_CONFIG.redirectUri,
            mainWindowRedirectUri: B2C_CONFIG.redirectUri
        };

        currentAccount = null;
        userIsAdmin = false;
        userHasSubscription = false;
        selectedClub = null;
        
        await myMSALObj.logoutRedirect(logoutRequest);
    } catch (error) {
        console.error("Logout failed:", error);
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}