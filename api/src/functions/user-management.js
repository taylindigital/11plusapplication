const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    context.log('User Management API called');

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
        const body = await request.json().catch(() => ({}));
        const { action, adminEmail, isAdmin } = body;
        
        if (!adminEmail || !isAdmin) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { error: "Unauthorized. Admin access required." }
            };
        }

        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const tableClient = TableClient.fromConnectionString(connectionString, "Users");

        switch (action) {
            case 'get-pending-users':
                return await getPendingUsers(tableClient, corsHeaders, context);
            
            default:
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { error: `Invalid action: ${action}` }
                };
        }

    } catch (error) {
        context.log('User Management API error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                error: "Internal server error",
                details: error.message
            }
        };
    }
};

async function getPendingUsers(tableClient, corsHeaders, context) {
    try {
        // Get all users from the table
        const users = [];
        const entities = tableClient.listEntities();
        
        for await (const entity of entities) {
            users.push({
                email: entity.rowKey,
                name: entity.name,
                phone: entity.phone,
                organization: entity.organization,
                status: entity.status,
                createdDate: entity.timestamp,
                roles: entity.roles ? JSON.parse(entity.roles) : []
            });
        }

        // Filter pending users (status is undefined or 'pending')
        const pendingUsers = users.filter(user => !user.status || user.status === 'pending');
        const totalUsers = users.length;
        const pendingCount = pendingUsers.length;

        context.log(`Found ${pendingCount} pending users out of ${totalUsers} total users`);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                users: pendingUsers,
                stats: {
                    pending: pendingCount,
                    total: totalUsers
                }
            }
        };
    } catch (error) {
        context.log('Get pending users error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                success: false, 
                error: 'Failed to retrieve pending users' 
            }
        };
    }
}