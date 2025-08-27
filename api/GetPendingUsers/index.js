const { TableClient } = require("@azure/data-tables");

module.exports = async function (context, req) {
    context.log('Getting pending users for admin');

    // Check if user is admin (you'll pass this from frontend based on B2C token)
    const isAdmin = req.headers['x-ms-client-principal-id'] && 
                    req.body && req.body.isAdmin === true;
    
    if (!isAdmin) {
        context.res = {
            status: 403,
            body: { error: "Unauthorized. Admin access required." }
        };
        return;
    }

    try {
        const connectionString = process.env["AzureWebJobsStorage"];
        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        // Create table if it doesn't exist
        await tableClient.createTable();
        
        // Query for pending users
        const users = [];
        const iterator = tableClient.listEntities({
            queryOptions: { filter: "status eq 'pending'" }
        });
        
        for await (const entity of iterator) {
            users.push({
                email: entity.rowKey,
                signupDate: entity.signupDate,
                status: entity.status,
                name: entity.name || 'N/A'
            });
        }
        
        context.res = {
            status: 200,
            body: { users }
        };
    } catch (error) {
        context.log.error('Error getting pending users:', error);
        context.res = {
            status: 500,
            body: { error: "Failed to get pending users" }
        };
    }
};