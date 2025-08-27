const { TableClient } = require("@azure/data-tables");

module.exports = async function (context, req) {
    context.log('Getting pending users for admin');

    const isAdmin = req.body && req.body.isAdmin === true;
    
    if (!isAdmin) {
        context.res = {
            status: 403,
            body: { error: "Unauthorized. Admin access required." }
        };
        return;
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        await tableClient.createTable().catch(() => {});
        
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