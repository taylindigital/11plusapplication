const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (request, context) {
    console.log('Lessons function called');
    
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
        // Test Cosmos DB connection
        console.log('Testing Cosmos DB connection...');
        
        const cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY,
        });

        console.log('CosmosClient created successfully');

        // Test database access
        const database = cosmosClient.database('TutorPortal');
        console.log('Database reference created');

        // Test if database exists
        try {
            const { resource: dbInfo } = await database.read();
            console.log('Database exists:', dbInfo?.id);
        } catch (dbError) {
            console.log('Database read error:', dbError.message);
            
            // Try to create database if it doesn't exist
            try {
                const { resource: newDb } = await cosmosClient.databases.create({ id: 'TutorPortal' });
                console.log('Database created:', newDb.id);
            } catch (createDbError) {
                console.error('Failed to create database:', createDbError.message);
                throw createDbError;
            }
        }

        // Test container access
        const lessonsContainer = database.container('Lessons');
        console.log('Container reference created');

        // Test if container exists
        try {
            const { resource: containerInfo } = await lessonsContainer.read();
            console.log('Container exists:', containerInfo?.id);
        } catch (containerError) {
            console.log('Container read error:', containerError.message);
            
            // Try to create container if it doesn't exist
            try {
                const { resource: newContainer } = await database.containers.create({ 
                    id: 'Lessons',
                    partitionKey: { path: '/id' }
                });
                console.log('Container created:', newContainer.id);
            } catch (createContainerError) {
                console.error('Failed to create container:', createContainerError.message);
                throw createContainerError;
            }
        }

        // If we get here, everything is working
        console.log('Cosmos DB connection test successful');

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                message: 'Cosmos DB connection successful',
                database: 'TutorPortal',
                container: 'Lessons'
            }
        };

    } catch (error) {
        console.error('Cosmos DB test error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                success: false, 
                error: 'Cosmos DB connection failed',
                details: error.message,
                code: error.code
            }
        };
    }
};