// Utility Functions with Performance Improvements

// Status messaging system
let statusTimeout;

function showStatus(message, type = 'info', duration = 5000) {
    // Clear existing timeout
    if (statusTimeout) {
        clearTimeout(statusTimeout);
    }

    // Remove existing status
    const existingStatus = document.querySelector('.status-message');
    if (existingStatus) {
        existingStatus.remove();
    }

    // Create new status message
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message status-${type}`;
    statusDiv.innerHTML = `
        <span class="status-icon">${getStatusIcon(type)}</span>
        <span class="status-text">${message}</span>
        <button class="status-close" onclick="hideStatus()">×</button>
    `;

    // Add styles if not already present
    if (!document.getElementById('status-styles')) {
        const styles = document.createElement('style');
        styles.id = 'status-styles';
        styles.textContent = `
            .status-message {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                padding: 16px 20px;
                border-radius: 12px;
                color: white;
                font-weight: 500;
                display: flex;
                align-items: center;
                gap: 12px;
                max-width: 400px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                backdrop-filter: blur(10px);
                transform: translateX(100%);
                transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                animation: slideIn 0.3s ease-out forwards;
            }
            .status-success {
                background: linear-gradient(135deg, var(--success-green), #22c55e);
            }
            .status-error {
                background: linear-gradient(135deg, var(--error-red), #dc2626);
            }
            .status-info {
                background: linear-gradient(135deg, var(--primary-purple), var(--sky-blue));
            }
            .status-close {
                background: none;
                border: none;
                color: white;
                font-size: 20px;
                cursor: pointer;
                margin-left: auto;
                opacity: 0.7;
                transition: opacity 0.2s ease;
            }
            .status-close:hover {
                opacity: 1;
            }
            @keyframes slideIn {
                to { transform: translateX(0); }
            }
            @keyframes slideOut {
                to { transform: translateX(100%); }
            }
        `;
        document.head.appendChild(styles);
    }

    document.body.appendChild(statusDiv);

    // Auto hide after duration
    statusTimeout = setTimeout(() => {
        hideStatus();
    }, duration);
}

function hideStatus() {
    const statusDiv = document.querySelector('.status-message');
    if (statusDiv) {
        statusDiv.style.animation = 'slideOut 0.3s ease-out forwards';
        setTimeout(() => {
            statusDiv.remove();
        }, 300);
    }
    if (statusTimeout) {
        clearTimeout(statusTimeout);
        statusTimeout = null;
    }
}

function getStatusIcon(type) {
    switch (type) {
        case 'success': return '✅';
        case 'error': return '❌';
        case 'info': 
        default: return 'ℹ️';
    }
}

// Editable fields functionality
function setupEditableFields() {
    // Use event delegation for better performance
    document.addEventListener('blur', async (e) => {
        if (e.target.classList.contains('editable-field')) {
            await handleFieldEdit(e.target);
        }
    }, true);

    // Handle Enter key to save and blur
    document.addEventListener('keydown', (e) => {
        if (e.target.classList.contains('editable-field') && e.key === 'Enter') {
            e.preventDefault();
            e.target.blur();
        }
    }, true);
}

async function handleFieldEdit(element) {
    const field = element.dataset.field;
    const userEmail = element.dataset.user;
    const newValue = element.textContent.trim();
    const originalValue = element.dataset.original;
    
    if (newValue !== originalValue) {
        await saveUserField(userEmail, field, newValue, element);
    }
}

async function saveUserField(userEmail, field, newValue, element) {
    try {
        const adminEmail = currentAccount?.username || currentAccount?.idTokenClaims?.emails?.[0];
        
        element.style.opacity = '0.6';
        element.style.pointerEvents = 'none';
        
        const response = await fetch('/api/user-management', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'update-user-field',
                userEmail: userEmail,
                field: field,
                value: newValue,
                adminEmail: adminEmail,
                isAdmin: userIsAdmin
            })
        });

        if (response.ok) {
            element.dataset.original = newValue;
            element.style.opacity = '1';
            element.style.pointerEvents = 'auto';
            showStatus(`${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`, 'success');
        } else {
            const errorData = await response.json();
            element.textContent = element.dataset.original;
            element.style.opacity = '1';
            element.style.pointerEvents = 'auto';
            showStatus(errorData.error || `Failed to update ${field}`, 'error');
        }
    } catch (error) {
        console.error(`Error updating ${field}:`, error);
        element.textContent = element.dataset.original;
        element.style.opacity = '1';
        element.style.pointerEvents = 'auto';
        showStatus(`Error updating ${field}. Please try again.`, 'error');
    }
}

// Content switching with performance optimization
let currentContent = null;

function showContent(contentType) {
    // Performance: Only update if content actually changed
    if (currentContent === contentType) {
        return;
    }
    
    currentContent = contentType;
    
    // Performance: Use requestAnimationFrame for smooth transitions
    requestAnimationFrame(() => {
        const contents = document.querySelectorAll('.content');
        const targetContent = document.getElementById(`${contentType}-content`);
        
        // Batch hide all contents
        contents.forEach(content => {
            if (content !== targetContent) {
                content.classList.add('hidden');
            }
        });
        
        // Show target content
        if (targetContent) {
            targetContent.classList.remove('hidden');
            
            // Load content-specific data
            loadContentData(contentType);
            
            // Update navigation
            updateNavigation(contentType);
        }
    });
}

function loadContentData(contentType) {
    // Performance: Only load data when needed
    switch (contentType) {
        case 'admin-users':
            // Small delay to ensure DOM is ready
            setTimeout(() => {
                if (typeof loadAllUsers === 'function') {
                    loadAllUsers();
                }
            }, 100);
            break;
        
        case 'lessons':
            if (typeof loadLessons === 'function') {
                loadLessons();
            }
            break;
            
        case 'homework':
            if (typeof loadHomework === 'function') {
                loadHomework();
            }
            break;
            
        case 'assessment':
            if (typeof loadAssessments === 'function') {
                loadAssessments();
            }
            break;
    }
}

function updateNavigation(contentType) {
    // Update active nav item
    const navItems = document.querySelectorAll('.nav-links a');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNavItem = document.querySelector(`[onclick*="'${contentType}'"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
}

// Performance: Debounce function for search/filter operations
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Performance: Throttle function for scroll/resize events
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Intersection Observer for lazy loading
const lazyLoadObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const element = entry.target;
            
            // Load data for lazy elements
            if (element.dataset.lazyLoad) {
                const loadFunction = element.dataset.lazyLoad;
                if (typeof window[loadFunction] === 'function') {
                    window[loadFunction](element);
                }
                
                // Stop observing
                lazyLoadObserver.unobserve(element);
            }
        }
    });
}, {
    rootMargin: '50px'
});

// Mobile optimizations
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const isTablet = /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;

// Touch event handlers for mobile
function addTouchSupport() {
    if (!isMobile) return;
    
    // Add touch classes
    document.body.classList.add('touch-device');
    
    // Improve touch performance
    document.addEventListener('touchstart', () => {}, { passive: true });
    document.addEventListener('touchmove', () => {}, { passive: true });
    document.addEventListener('touchend', () => {}, { passive: true });
}

// Error boundary for better error handling
window.addEventListener('error', (event) => {
    console.error('Application error:', event.error);
    
    // Show user-friendly error message
    showStatus('Something went wrong. Please refresh the page and try again.', 'error');
    
    // Optional: Send error to logging service
    // logError(event.error);
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Show user-friendly error message
    showStatus('A network error occurred. Please check your connection and try again.', 'error');
    
    // Prevent default browser behavior
    event.preventDefault();
});

// Performance monitoring
function measurePerformance(name, fn) {
    return async function(...args) {
        const start = performance.now();
        const result = await fn(...args);
        const end = performance.now();
        
        console.log(`${name} took ${end - start} milliseconds`);
        
        return result;
    };
}

// Initialize utilities when DOM is ready
function initializeUtils() {
    setupEditableFields();
    addTouchSupport();
    
    // Performance: Add passive listeners where possible
    document.addEventListener('scroll', throttle(() => {
        // Handle scroll events
    }, 16), { passive: true });
    
    document.addEventListener('resize', debounce(() => {
        // Handle resize events
    }, 250), { passive: true });
}

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeUtils);
} else {
    initializeUtils();
}