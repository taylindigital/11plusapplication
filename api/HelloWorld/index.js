module.exports = async function (context, req) {
    context.log('Hello World function processed a request.');
    
    const name = req.query.name || (req.body && req.body.name) || 'World';
    
    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json'
        },
        body: {
            message: `Hello, ${name}!`,
            timestamp: new Date().toISOString()
        }
    };
};