const { app } = require('@azure/functions');

// Import existing function handlers
const checkUserStatus = require('./functions/checkuserstatus');
const getPendingUsers = require('./functions/getpendingusers');
const approveUser = require('./functions/approveuser');
const onUserSignUp = require('./functions/onusersignup');
const lessons = require('./functions/lessons');
const upload = require('./functions/upload');
const trackview = require('./functions/trackview');

// Import Stripe function handlers (adding back one by one)
const stripeCreateCustomer = require('./functions/stripe-create-customer');

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
    handler: trackview
});

// Register first Stripe function
app.http('stripe-create-customer', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: stripeCreateCustomer
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
                    'onusersignup', 'lessons', 'upload', 'trackview',
                    'stripe-create-customer'
                ]
            }
        };
    }
});