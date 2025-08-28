const { app } = require('@azure/functions');

// Import your function handlers
const checkUserStatus = require('./functions/checkuserstatus');
const getPendingUsers = require('./functions/getpendingusers');
const approveUser = require('./functions/approveuser');
const onUserSignUp = require('./functions/onusersignup');
const lessons = require('./functions/lessons');
const upload = require('./functions/upload');

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