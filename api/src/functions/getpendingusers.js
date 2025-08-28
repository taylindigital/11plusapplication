const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    context.log('Getting pending users for admin');

    const body = await request.json().catch(() => ({}));
    const isAdmin = body.isAdmin === true;
    
    if (!isAdmin) {
        return {
            status: 403,
            jsonBody: { error: "Unauthorized. Admin access required." }
        };
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        if (!connectionString) {
            return {
                status: 200,
                jsonBody: { users: [] }
            };
        }

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
        
        return {
            status: 200,
            jsonBody: { users }
        };
    } catch (error) {
        context.log('Error getting pending users:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to get pending users" }
        };
    }
};