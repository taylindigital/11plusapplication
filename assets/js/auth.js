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

// Track initialization attempts to prevent infinite loop
let initAttempts = 0;
const maxInitAttempts = 100; // 10 seconds max (longer for CDN fallbacks)

// Performance: Initialize with loading state
function initializeAuth() {
    initAttempts++;
    
    // Wait for MSAL to be available
    if (typeof msal === 'undefined') {
        if (initAttempts > maxInitAttempts) {
            console.error('MSAL failed to load after 10 seconds');
            showStatus('Authentication library failed to load from multiple sources. Please check your internet connection and refresh the page.', 'error');
            // Show sign-in button as disabled with error message
            const signInButton = document.getElementById('signInButton');
            if (signInButton) {
                signInButton.textContent = '❌ Authentication Unavailable';
                signInButton.disabled = true;
                signInButton.style.opacity = '0.6';
            }
            return;
        }
        console.log(`Waiting for MSAL to load... (attempt ${initAttempts})`);
        setTimeout(initializeAuth, 100);
        return;
    }
    
    showLoadingState('Initializing authentication...');
    
    try {
        myMSALObj = new msal.PublicClientApplication(msalConfig);
        
        myMSALObj.initialize().then(() => {
            console.log("MSAL initialized successfully");
            
            // Enable sign-in button once MSAL is ready
            const signInButton = document.getElementById('signInButton');
            if (signInButton) {
                signInButton.disabled = false;
                signInButton.style.opacity = '1';
            }
            
            selectAccount();
            hideLoadingState();
        }).catch(error => {
            console.error("MSAL initialization failed:", error);
            showStatus('Authentication initialization failed. Please refresh the page.', 'error');
            hideLoadingState();
        });
    } catch (error) {
        console.error("Error creating MSAL instance:", error);
        showStatus('Authentication setup failed. Please refresh the page.', 'error');
        hideLoadingState();
    }
}

async function selectAccount() {
    // Handle redirect response first
    try {
        const response = await myMSALObj.handleRedirectPromise();
        if (response && response.account) {
            currentAccount = response.account;
            console.log("User logged in via redirect:", response.account.username);
        }
    } catch (error) {
        console.error("Error handling redirect:", error);
    }
    
    // Check for existing accounts
    const currentAccounts = myMSALObj.getAllAccounts();
    
    if (currentAccounts.length > 0 && !currentAccount) {
        currentAccount = currentAccounts[0];
        
        // Try to get token silently to verify account is still valid
        try {
            const response = await myMSALObj.acquireTokenSilent({
                scopes: B2C_CONFIG.scopes,
                account: currentAccounts[0]
            });
            
            if (response.accessToken) {
                console.log("User already logged in:", currentAccounts[0].username);
            }
        } catch (error) {
            console.log("Silent token acquisition failed:", error);
            // Account may be expired, clear it
            currentAccount = null;
        }
    }
    
    if (currentAccount) {
        // Performance: Check cache first
        const now = Date.now();
        if (authCache.lastCheck + authCache.cacheDuration > now && authCache.userInfo) {
            applyAuthState(authCache.userInfo);
            return;
        }
        
        // If no valid cache, check auth state
        await checkUserStatus();
    }
    
    updateUI();
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
    // Ensure MSAL is initialized before attempting login
    if (!myMSALObj) {
        showStatus('Authentication is still initializing. Please wait a moment and try again.', 'info');
        return;
    }

    try {
        showLoadingState('Redirecting to login...');
        await myMSALObj.loginRedirect(loginRequest);
        // Note: loginRedirect doesn't return here - it redirects the page
    } catch (error) {
        console.error("Login failed:", error);
        showStatus('Login failed. Please try again.', 'error');
        hideLoadingState();
    }
}

async function signOut() {
    if (!myMSALObj) return;

    try {
        const logoutRequest = {
            postLogoutRedirectUri: B2C_CONFIG.redirectUri,
            mainWindowRedirectUri: B2C_CONFIG.redirectUri
        };

        // Clear cache
        authCache = { lastCheck: 0, cacheDuration: 5 * 60 * 1000, userInfo: null };
        currentAccount = null;
        userIsAdmin = false;
        userHasSubscription = false;
        
        await myMSALObj.logoutRedirect(logoutRequest);
    } catch (error) {
        console.error("Logout failed:", error);
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
                
                // Show the header after login
                const header = document.getElementById('main-header');
                if (header) header.style.display = 'flex';
                
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
                
                // Hide the header when logged out
                const header = document.getElementById('main-header');
                if (header) header.style.display = 'none';
                
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

// Performance utilities - use existing loading overlay
function showLoadingState(message = 'Loading...') {
    let overlay = document.getElementById('loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'loading-overlay';
        overlay.className = 'loading-overlay';
        document.body.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <div style="text-align: center;">
            <div class="loading-spinner large"></div>
            <p style="margin-top: 16px; color: var(--text-medium);">${message}</p>
        </div>
    `;
    
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