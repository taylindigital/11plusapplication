const { TableClient } = require("@azure/data-tables");

module.exports = async function (context, req) {
    context.log('Checking user status');

    const userEmail = req.query.email || (req.body && req.body.email);
    
    if (!userEmail) {
        context.res = {
            status: 400,
            body: { error: "Email is required" }
        };
        return;
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        // Create table if it doesn't exist
        await tableClient.createTable().catch(() => {
            // Table might already exist, that's ok
        });

        try {
            const user = await tableClient.getEntity("Users", userEmail);
            
            context.res = {
                status: 200,
                body: {
                    email: userEmail,
                    status: user.status || 'pending',
                    approvedDate: user.approvedDate,
                    isApproved: user.status === 'approved',
                    hasSubscription: user.hasSubscription || false
                }
            };
        } catch (error) {
            if (error.statusCode === 404) {
                // User not found - create new record
                const newUser = {
                    partitionKey: "Users",
                    rowKey: userEmail,
                    status: "pending",
                    signupDate: new Date().toISOString(),
                    hasSubscription: false
                };
                
                await tableClient.createEntity(newUser);
                
                context.res = {
                    status: 200,
                    body: {
                        email: userEmail,
                        status: 'pending',
                        isApproved: false,
                        hasSubscription: false
                    }
                };
            } else {
                throw error;
            }
        }
    } catch (error) {
        context.log.error('Error checking user status:', error);
        context.res = {
            status: 500,
            body: { error: "Failed to check user status" }
        };
    }
};