// Authentication Module with Performance Improvements
let myMSALObj;
let currentAccount = null;
let userIsAdmin = false;
let userHasSubscription = false;

// Performance: Cache authentication state
let authCache = {
    lastCheck: 0,
    cacheDuration: 5 * 60 * 1000, // 5 minutes
    userInfo: null
};

const msalConfig = {
    auth: {
        clientId: "ed29b38d-ff0f-4de9-b5c5-e18fb7c48993",
        authority: "https://brightstarseducation.b2clogin.com/brightstarseducation.onmicrosoft.com/B2C_1_SignUpSignIn",
        knownAuthorities: ["brightstarseducation.b2clogin.com"],
        redirectUri: window.location.origin
    },
    cache: {
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false,
    },
    system: {
        allowNativeBroker: false
    }
};

const loginRequest = {
    scopes: ["openid", "profile"],
    prompt: "login"
};

// Performance: Initialize with loading state
function initializeAuth() {
    // Wait for MSAL to be available
    if (typeof msal === 'undefined') {
        console.log('Waiting for MSAL to load...');
        setTimeout(initializeAuth, 100);
        return;
    }
    
    showLoadingState('Initializing authentication...');
    
    try {
        myMSALObj = new msal.PublicClientApplication(msalConfig);
        
        myMSALObj.initialize().then(() => {
            console.log("MSAL initialized successfully");
            selectAccount();
            hideLoadingState();
        }).catch(error => {
            console.error("MSAL initialization failed:", error);
            hideLoadingState();
        });
    } catch (error) {
        console.error("Error creating MSAL instance:", error);
        hideLoadingState();
    }
}

async function selectAccount() {
    const currentAccounts = myMSALObj.getAllAccounts();
    
    if (currentAccounts.length > 0) {
        currentAccount = currentAccounts[0];
        
        // Performance: Check cache first
        const now = Date.now();
        if (authCache.lastCheck + authCache.cacheDuration > now && authCache.userInfo) {
            applyAuthState(authCache.userInfo);
            return;
        }
        
        // If no valid cache, check auth state
        await checkUserStatus();
        updateUI();
    } else {
        updateUI();
    }
}

async function checkUserStatus() {
    if (!currentAccount) return;

    const email = currentAccount.username || currentAccount.idTokenClaims?.emails?.[0];
    if (!email) return;

    try {
        showLoadingState('Checking user status...');
        
        // Performance: Batch multiple API calls
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

        // Handle user status
        if (userStatusResponse.status === 'fulfilled' && userStatusResponse.value.ok) {
            const userData = await userStatusResponse.value.json();
            userIsAdmin = userData.isAdmin || false;
        }

        // Handle subscription status
        if (subscriptionResponse.status === 'fulfilled' && subscriptionResponse.value.ok) {
            const subscriptionData = await subscriptionResponse.value.json();
            userHasSubscription = subscriptionData.hasActiveSubscription || false;
        }

        // Performance: Cache the results
        const authState = {
            email,
            userIsAdmin,
            userHasSubscription,
            displayName: currentAccount.idTokenClaims?.name || email
        };
        
        authCache = {
            lastCheck: Date.now(),
            cacheDuration: 5 * 60 * 1000,
            userInfo: authState
        };

        applyAuthState(authState);
        
    } catch (error) {
        console.error('Error checking user status:', error);
    } finally {
        hideLoadingState();
    }
}

function applyAuthState(authState) {
    userIsAdmin = authState.userIsAdmin;
    userHasSubscription = authState.userHasSubscription;
    
    // Update subscription badge immediately
    updateSubscriptionBadges();
    
    console.log('Auth state applied:', {
        isAdmin: userIsAdmin,
        hasSubscription: userHasSubscription,
        email: authState.email
    });
}

function updateSubscriptionBadges() {
    const badges = document.querySelectorAll('.subscription-badge');
    badges.forEach(badge => {
        if (userHasSubscription) {
            badge.textContent = 'Active Subscription';
            badge.classList.remove('inactive');
        } else {
            badge.textContent = 'No Subscription';
            badge.classList.add('inactive');
        }
    });
}

async function signIn() {
    try {
        showLoadingState('Signing in...');
        const loginResponse = await myMSALObj.loginPopup(loginRequest);
        currentAccount = loginResponse.account;
        
        // Clear cache on new sign in
        authCache.lastCheck = 0;
        
        await checkUserStatus();
        updateUI();
    } catch (error) {
        console.error("Login failed:", error);
        showStatus('Login failed. Please try again.', 'error');
    } finally {
        hideLoadingState();
    }
}

function signOut() {
    if (myMSALObj) {
        showLoadingState('Signing out...');
        
        // Clear cache
        authCache = { lastCheck: 0, cacheDuration: 5 * 60 * 1000, userInfo: null };
        
        myMSALObj.logoutPopup({
            postLogoutRedirectUri: window.location.origin,
        }).then(() => {
            currentAccount = null;
            userIsAdmin = false;
            userHasSubscription = false;
            updateUI();
            hideLoadingState();
        }).catch(error => {
            console.error("Logout failed:", error);
            hideLoadingState();
        });
    }
}

// Performance: Optimize UI updates
function updateUI() {
    // Use requestAnimationFrame for smooth updates
    requestAnimationFrame(() => {
        const isSignedIn = currentAccount !== null;
        
        // Batch DOM updates
        const updates = [];
        
        if (isSignedIn) {
            const username = currentAccount.idTokenClaims?.name || 
                           currentAccount.username || 
                           currentAccount.idTokenClaims?.emails?.[0] || 
                           'User';
            
            updates.push(() => {
                document.getElementById('signInButton')?.style.setProperty('display', 'none');
                document.getElementById('signOutButton')?.style.setProperty('display', 'block');
                
                // Show subscription badge
                const subscriptionBadges = document.querySelectorAll('.subscription-badge');
                subscriptionBadges.forEach(badge => badge.style.display = 'inline-block');
                
                // Update user info displays
                const userInfoElements = document.querySelectorAll('.user-info');
                userInfoElements.forEach(element => {
                    const welcomeSpan = element.querySelector('span[style*="color"]');
                    if (welcomeSpan) {
                        welcomeSpan.textContent = `Welcome, ${username}!`;
                    }
                });
            });
        } else {
            updates.push(() => {
                document.getElementById('signInButton')?.style.setProperty('display', 'block');
                document.getElementById('signOutButton')?.style.setProperty('display', 'none');
                
                // Hide subscription badge
                const subscriptionBadges = document.querySelectorAll('.subscription-badge');
                subscriptionBadges.forEach(badge => badge.style.display = 'none');
            });
        }
        
        // Execute all updates
        updates.forEach(update => update());
        
        // Update navigation visibility
        updateNavigationVisibility(isSignedIn);
        updateSubscriptionBadges();
        
        // Show appropriate content
        if (isSignedIn) {
            showContent('lessons');
        } else {
            showContent('welcome');
        }
    });
}

function updateNavigationVisibility(isSignedIn) {
    const navItems = {
        'nav-lessons': true,
        'nav-homework': true,
        'nav-assessment': true,
        'nav-subscription': true,
        'nav-admin-lessons': userIsAdmin,
        'nav-admin-users': userIsAdmin,
        'nav-admin-content': userIsAdmin
    };
    
    Object.entries(navItems).forEach(([id, shouldShow]) => {
        const element = document.getElementById(id);
        if (element) {
            element.style.display = (isSignedIn && shouldShow) ? 'block' : 'none';
        }
    });
}

// Performance utilities
function showLoadingState(message = 'Loading...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div style="text-align: center;">
                <div class="loading-spinner large"></div>
                <p style="margin-top: 16px; color: var(--text-medium);">${message}</p>
            </div>
        `;
        document.body.appendChild(overlay);
    }
    
    const messageEl = overlay.querySelector('p');
    if (messageEl) messageEl.textContent = message;
    
    overlay.classList.add('active');
}

function hideLoadingState() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuth);
} else {
    initializeAuth();
}