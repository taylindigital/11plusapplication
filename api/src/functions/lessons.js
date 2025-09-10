module.exports = async function (request, context) {
    console.log('Lessons function called - basic test');
    
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return {
            status: 200,
            headers: corsHeaders,
        };
    }

    try {
        // Basic test without Cosmos DB
        console.log('Environment check:');
        console.log('COSMOS_DB_ENDPOINT:', process.env.COSMOS_DB_ENDPOINT ? 'SET' : 'NOT SET');
        console.log('COSMOS_DB_KEY:', process.env.COSMOS_DB_KEY ? 'SET' : 'NOT SET');
        
        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                message: 'Lessons API is working',
                environment: {
                    cosmosEndpoint: process.env.COSMOS_DB_ENDPOINT ? 'Set' : 'Not Set',
                    cosmosKey: process.env.COSMOS_DB_KEY ? 'Set' : 'Not Set'
                }
            }
        };
    } catch (error) {
        console.error('Basic test error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                success: false, 
                error: error.message,
                stack: error.stack
            }
        };
    }
};