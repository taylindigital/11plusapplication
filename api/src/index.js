const { app } = require('@azure/functions');

// Import your function handlers
const checkUserStatus = require('./functions/checkuserstatus');
const getPendingUsers = require('./functions/getpendingusers');
const approveUser = require('./functions/approveuser');
const onUserSignUp = require('./functions/onusersignup');

// Register the functions
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

// Add a test endpoint
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