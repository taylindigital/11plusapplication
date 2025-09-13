// User Management Module with Performance Improvements
let allSystemUsers = [];
let currentUserFilter = 'all';

// Performance: Cache management
let userCache = {
    lastUpdate: 0,
    cacheDuration: 2 * 60 * 1000, // 2 minutes
    data: null
};

// Load all users with performance optimizations
async function loadAllUsers() {
    try {
        // Performance: Check cache first
        const now = Date.now();
        if (userCache.lastUpdate + userCache.cacheDuration > now && userCache.data) {
            console.log('Using cached user data');
            processUserData(userCache.data);
            return;
        }

        showSkeletonLoader('all-users-container');
        
        const adminEmail = currentAccount?.username || currentAccount?.idTokenClaims?.emails?.[0];
        
        const response = await fetch('/api/user-management', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'get-all-users',
                adminEmail: adminEmail,
                isAdmin: userIsAdmin
            })
        });

        if (response.ok) {
            const data = await response.json();
            
            // Cache the data
            userCache = {
                lastUpdate: now,
                cacheDuration: 2 * 60 * 1000,
                data: data
            };
            
            processUserData(data);
        } else {
            console.error('Failed to load all users');
            showError('all-users-container', 'Failed to load users. Please try again.');
        }
    } catch (error) {
        console.error('Error loading users:', error);
        showError('all-users-container', 'Error loading users. Please check your connection.');
    } finally {
        hideSkeletonLoader('all-users-container');
    }
}

function processUserData(data) {
    allSystemUsers = data.users || [];
    
    // Performance: Use requestAnimationFrame for smooth rendering
    requestAnimationFrame(() => {
        displayAllUsers(allSystemUsers);
        updateUserStats(data.stats || {});
        setupUserFilters();
        
        // Load subscription information for active users (non-blocking)
        setTimeout(() => loadSubscriptionInfo(), 1000);
    });
}

function displayAllUsers(users) {
    const container = document.getElementById('all-users-container');
    if (!container) return;

    if (users.length === 0) {
        container.innerHTML = `
            <div class="no-users">
                <span class="no-users-icon">👥</span>
                <p>No users found for the selected filter</p>
            </div>
        `;
        return;
    }

    // Performance: Use DocumentFragment for batch DOM operations
    const fragment = document.createDocumentFragment();
    
    users.forEach(user => {
        const userCard = document.createElement('div');
        userCard.className = 'comprehensive-user-card';
        userCard.setAttribute('data-user-type', user.userType || 'unknown');
        userCard.setAttribute('data-source', user.source);
        
        userCard.innerHTML = createUserCardHTML(user);
        fragment.appendChild(userCard);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
}

function createUserCardHTML(user) {
    const emailId = user.email.replace(/[^a-zA-Z0-9]/g, '');
    
    return `
        <div class="user-main-info">
            <div class="user-identity">
                <h3>${user.email}</h3>
                <p class="user-display-name">${user.displayName || user.name || 'No name'}</p>
                <div class="user-badges">
                    <span class="status-badge ${user.source}">${user.source === 'azure' ? 'Active' : 'Pending'}</span>
                    ${user.userType ? `<span class="role-badge ${user.userType}">${user.userType}</span>` : ''}
                    ${user.isAdmin ? '<span class="admin-badge">Admin</span>' : ''}
                </div>
            </div>
        </div>
        
        <div class="user-details">
            <div class="detail-group">
                <p><strong>Name:</strong> 
                    <span class="editable-field" data-field="name" data-user="${user.email}" 
                          contenteditable="true" data-original="${user.name || user.displayName || ''}">${user.name || user.displayName || 'Not provided'}</span>
                </p>
                <p><strong>Phone:</strong> 
                    <span class="editable-field" data-field="phone" data-user="${user.email}" 
                          contenteditable="true" data-original="${user.phone || ''}">${user.phone || 'Not provided'}</span>
                </p>
                <p><strong>Organisation:</strong> 
                    <span class="editable-field" data-field="organization" data-user="${user.email}" 
                          contenteditable="true" data-original="${user.organization || ''}">${user.organization || 'Unknown'}</span>
                </p>
                <p><strong>Subscription:</strong> <span id="subscription-${emailId}">${user.subscriptionStatus || 'Loading...'}</span></p>
            </div>
            <div class="detail-group">
                <p><strong>Created:</strong> ${user.createdDate ? new Date(user.createdDate).toLocaleDateString() : 'Unknown'}</p>
                <p><strong>Last Login:</strong> ${user.lastLoginDate || 'Never'}</p>
                <p><strong>Start Date:</strong> ${user.startDate || 'Unknown'}</p>
            </div>
        </div>

        <div class="user-actions">
            ${user.source === 'pending' ? `
                <div class="role-selection">
                    <select id="role-${emailId}" class="role-select">
                        <option value="">Select Role</option>
                        <option value="student_parent">Student/Parent</option>
                        <option value="tutor">Tutor</option>
                    </select>
                </div>
                <div class="action-buttons">
                    <button onclick="approveUser('${user.email}', 'approve')" class="btn-approve" id="approve-${emailId}">
                        <span class="btn-text">✅ Approve</span>
                        <span class="loading-spinner" style="display: none;"></span>
                    </button>
                    <button onclick="approveUser('${user.email}', 'reject')" class="btn-reject" id="reject-${emailId}">
                        <span class="btn-text">❌ Reject</span>
                        <span class="loading-spinner" style="display: none;"></span>
                    </button>
                </div>
            ` : `
                <div class="action-buttons">
                    <button onclick="deleteUser('${user.email}')" class="btn-delete" title="Remove user from system">
                        <span class="btn-text">🗑️ Remove User</span>
                        <span class="loading-spinner" style="display: none;"></span>
                    </button>
                </div>
            `}
        </div>
    `;
}

// Performance: Optimize user stats updates
function updateUserStats(stats) {
    const updates = [
        { id: 'total-users', value: stats.total || 0 },
        { id: 'active-users', value: stats.active || 0 },
        { id: 'pending-users', value: stats.pending || 0 }
    ];
    
    // Batch DOM updates
    requestAnimationFrame(() => {
        updates.forEach(({ id, value }) => {
            const element = document.getElementById(id);
            if (element && element.textContent !== value.toString()) {
                // Animate number change
                animateNumber(element, parseInt(element.textContent) || 0, value);
            }
        });
    });
}

function animateNumber(element, from, to) {
    const duration = 500;
    const start = performance.now();
    
    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        
        const current = Math.round(from + (to - from) * progress);
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

function setupUserFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    
    // Remove existing listeners (performance)
    filterButtons.forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });
    
    // Add new listeners
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // Filter users
            const filter = e.target.dataset.filter;
            currentUserFilter = filter;
            filterUsers(filter);
        });
    });
}

function filterUsers(filter) {
    let filteredUsers = [];
    
    switch(filter) {
        case 'all':
            filteredUsers = allSystemUsers;
            break;
        case 'active':
            filteredUsers = allSystemUsers.filter(user => user.source === 'azure');
            break;
        case 'pending':
            filteredUsers = allSystemUsers.filter(user => user.source === 'pending');
            break;
        case 'tutors':
            filteredUsers = allSystemUsers.filter(user => 
                user.userType === 'tutor' || user.roles?.includes('tutor') || user.isAdmin
            );
            break;
        default:
            filteredUsers = allSystemUsers;
    }
    
    displayAllUsers(filteredUsers);
}

// Approve user with enhanced performance
async function approveUser(email, action) {
    const emailId = email.replace(/[^a-zA-Z0-9]/g, '');
    const approveBtn = document.getElementById(`approve-${emailId}`);
    const rejectBtn = document.getElementById(`reject-${emailId}`);
    
    try {
        const roleSelect = document.getElementById(`role-${emailId}`);
        const selectedRole = roleSelect?.value;
        
        if (action === 'approve' && !selectedRole) {
            showStatus('Please select a role before approving the user.', 'error');
            return;
        }

        // Show loading state
        const targetBtn = action === 'approve' ? approveBtn : rejectBtn;
        if (targetBtn) {
            setButtonLoading(targetBtn, true);
        }

        const adminEmail = currentAccount?.username || currentAccount?.idTokenClaims?.emails?.[0];

        const response = await fetch('/api/approveuser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: email,
                action: action,
                adminEmail: adminEmail,
                isAdmin: userIsAdmin,
                assignedRole: selectedRole
            })
        });

        if (response.ok) {
            const data = await response.json();
            showStatus(data.message || `User ${action}d successfully!`, 'success');
            
            // Clear cache and reload
            userCache.lastUpdate = 0;
            setTimeout(() => loadAllUsers(), 2000);
        } else {
            const errorData = await response.json();
            showStatus(errorData.error || `Failed to ${action} user`, 'error');
        }
    } catch (error) {
        console.error(`Error ${action}ing user:`, error);
        showStatus(`Error ${action}ing user. Please try again.`, 'error');
    } finally {
        // Reset loading state
        if (approveBtn) setButtonLoading(approveBtn, false);
        if (rejectBtn) setButtonLoading(rejectBtn, false);
    }
}

// Delete user with enhanced performance
async function deleteUser(email) {
    if (!confirm(`Are you sure you want to remove user ${email}? This will remove them from both Azure AD B2C and the local database. This action cannot be undone.`)) {
        return;
    }

    const deleteBtn = document.querySelector(`button[onclick="deleteUser('${email}')"]`);
    
    try {
        if (deleteBtn) {
            setButtonLoading(deleteBtn, true);
        }

        const adminEmail = currentAccount?.username || currentAccount?.idTokenClaims?.emails?.[0];

        const response = await fetch('/api/user-management', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'delete-user',
                userEmail: email,
                adminEmail: adminEmail,
                isAdmin: userIsAdmin
            })
        });

        if (response.ok) {
            const data = await response.json();
            showStatus(data.message || `User ${email} removed successfully!`, 'success');
            
            // Clear cache and reload
            userCache.lastUpdate = 0;
            setTimeout(() => loadAllUsers(), 2000);
        } else {
            const errorData = await response.json();
            showStatus(errorData.error || `Failed to remove user`, 'error');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        showStatus('Error removing user. Please try again.', 'error');
    } finally {
        if (deleteBtn) {
            setButtonLoading(deleteBtn, false);
        }
    }
}

// Load subscription information with performance optimization
async function loadSubscriptionInfo() {
    const subscriptionElements = document.querySelectorAll('[id^="subscription-"]');
    
    // Performance: Process in batches to avoid blocking
    const batchSize = 5;
    const elements = Array.from(subscriptionElements);
    
    for (let i = 0; i < elements.length; i += batchSize) {
        const batch = elements.slice(i, i + batchSize);
        
        // Process batch
        await Promise.allSettled(batch.map(element => processSubscriptionElement(element)));
        
        // Yield to browser between batches
        if (i + batchSize < elements.length) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }
}

async function processSubscriptionElement(element) {
    const emailId = element.id.replace('subscription-', '');
    const user = allSystemUsers.find(u => u.email.replace(/[^a-zA-Z0-9]/g, '') === emailId);
    
    if (user && user.source === 'azure') {
        try {
            const response = await fetch('/api/stripe-get-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email })
            });

            if (response.ok) {
                const data = await response.json();
                const subscriptionText = data.hasActiveSubscription 
                    ? `Active (${data.subscription.plan.interval}ly)`
                    : 'No Active Subscription';
                element.textContent = subscriptionText;
                
                // Update the subscription status in the user object
                user.subscriptionStatus = subscriptionText;
            } else {
                element.textContent = 'Unable to load';
            }
        } catch (error) {
            element.textContent = 'Unable to load';
            console.error('Error loading subscription for', user.email, error);
        }
    } else if (user && user.source === 'pending') {
        element.textContent = 'Pending Approval';
    }
}

// Performance utilities
function setButtonLoading(button, loading) {
    if (loading) {
        button.disabled = true;
        const textEl = button.querySelector('.btn-text');
        const spinnerEl = button.querySelector('.loading-spinner');
        if (textEl) textEl.style.display = 'none';
        if (spinnerEl) spinnerEl.style.display = 'inline-block';
    } else {
        button.disabled = false;
        const textEl = button.querySelector('.btn-text');
        const spinnerEl = button.querySelector('.loading-spinner');
        if (textEl) textEl.style.display = 'flex';
        if (spinnerEl) spinnerEl.style.display = 'none';
    }
}

function showSkeletonLoader(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const skeletonHTML = Array(3).fill(null).map(() => `
        <div class="comprehensive-user-card">
            <div class="skeleton" style="height: 60px; border-radius: 8px; margin-bottom: 12px;"></div>
            <div class="skeleton" style="height: 20px; border-radius: 4px; margin-bottom: 8px; width: 70%;"></div>
            <div class="skeleton" style="height: 20px; border-radius: 4px; width: 50%;"></div>
        </div>
    `).join('');
    
    container.innerHTML = skeletonHTML;
}

function hideSkeletonLoader(containerId) {
    // This is handled by the actual content replacement
}

function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <div class="no-users">
            <span class="no-users-icon">⚠️</span>
            <p>${message}</p>
            <button class="btn" onclick="loadAllUsers()" style="margin-top: 16px;">
                Try Again
            </button>
        </div>
    `;
}