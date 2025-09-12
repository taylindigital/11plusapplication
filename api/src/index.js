const { app } = require('@azure/functions');

// Import existing function handlers
const checkUserStatus = require('./functions/checkuserstatus');
const getPendingUsers = require('./functions/getpendingusers');
const approveUser = require('./functions/approveuser');
const onUserSignUp = require('./functions/onusersignup');
const lessons = require('./functions/lessons');
const upload = require('./functions/upload');
const bulkUpload = require('./functions/bulk-upload');
const getContent = require('./functions/get-content');
const trackview = require('./functions/trackview');
const download = require('./functions/download');

// Import Stripe function handlers (create these files next)
const stripeCreateCustomer = require('./functions/stripe-create-customer');
const stripeCreateSubscription = require('./functions/stripe-create-subscription');
const stripeGetSubscription = require('./functions/stripe-get-subscription');
const stripeCancelSubscription = require('./functions/stripe-cancel-subscription');
const stripeUpdatePaymentMethod = require('./functions/stripe-update-payment-method');
const stripeWebhook = require('./functions/stripe-webhook');
const studentProgress = require('./functions/student-progress');
const tutorManagement = require('./functions/tutor-management');
const studentInvitations = require('./functions/student-invitations');

// Register existing functions
app.http('checkuserstatus', {
    methods: ['POST', 'GET'],
    authLevel: 'anonymous',
    handler: checkUserStatus
});

app.http('getpendingusers', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: getPendingUsers
});

app.http('approveuser', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: approveUser
});

app.http('onusersignup', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: onUserSignUp
});

app.http('lessons', {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    authLevel: 'anonymous',
    handler: lessons
});

app.http('upload', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: upload
});

app.http('bulk-upload', {
    methods: ['POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: bulkUpload
});

app.http('get-content', {
    methods: ['GET', 'POST', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: getContent
});

app.http('trackview', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: trackview
});

// Register new Stripe functions
app.http('stripe-create-customer', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeCreateCustomer
});

app.http('stripe-create-subscription', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeCreateSubscription
});

app.http('stripe-get-subscription', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeGetSubscription
});

app.http('stripe-cancel-subscription', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeCancelSubscription
});

app.http('stripe-update-payment-method', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeUpdatePaymentMethod
});

app.http('stripe-webhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeWebhook
});

app.http('download', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: download
});

app.http('student-progress', {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: studentProgress
});

app.http('tutor-management', {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: tutorManagement
});

app.http('student-invitations', {
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    authLevel: 'anonymous',
    handler: studentInvitations
});

// Test endpoint
app.http('test', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Test function executed');
        return {
            status: 200,
            jsonBody: {
                message: "Static Web App API is working!",
                timestamp: new Date().toISOString(),
                functions: [
                    'checkuserstatus', 'getpendingusers', 'approveuser', 
                    'onusersignup', 'lessons', 'upload', 'bulk-upload', 'get-content', 'trackview',
                    'stripe-create-customer', 'stripe-create-subscription',
                    'stripe-get-subscription', 'stripe-cancel-subscription',
                    'stripe-update-payment-method', 'stripe-webhook', 'student-progress',
                    'tutor-management', 'student-invitations'
                ]
            }
        };
    }
});