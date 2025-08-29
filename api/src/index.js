const { app } = require('@azure/functions');

// Import your existing function handlers
const checkUserStatus = require('./functions/checkuserstatus');
const getPendingUsers = require('./functions/getpendingusers');
const approveUser = require('./functions/approveuser');
const onUserSignUp = require('./functions/onusersignup');
const lessons = require('./functions/lessons');
const upload = require('./functions/upload');
const trackview = require('./functions/trackview'); // Fix: was pointing to upload

// Import new Stripe function handlers
const stripeCreateCustomer = require('./functions/stripe-create-customer');
const stripeCreateSubscription = require('./functions/stripe-create-subscription');
const stripeGetSubscription = require('./functions/stripe-get-subscription');
const stripeCancelSubscription = require('./functions/stripe-cancel-subscription');
const stripeUpdatePaymentMethod = require('./functions/stripe-update-payment-method');
const stripeWebhook = require('./functions/stripe-webhook');

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

app.http('trackview', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: trackview // Fixed: was pointing to upload
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

// Test endpoint
app.http('test', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log('Test function executed');
        return {
            status: 200,
            jsonBody: {
                message: "API is working!",
                timestamp: new Date().toISOString()
            }
        };
    }
});