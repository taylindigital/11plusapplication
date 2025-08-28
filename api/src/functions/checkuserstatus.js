const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    context.log('Checking user status');

    const body = await request.json().catch(() => ({}));
    const userEmail = body.email || request.query.get('email');
    
    if (!userEmail) {
        return {
            status: 400,
            jsonBody: { error: "Email is required" }
        };
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        if (!connectionString) {
            context.log('Storage connection string not configured');
            return {
                status: 200,
                jsonBody: {
                    email: userEmail,
                    status: 'approved', // Default to approved if no storage
                    isApproved: true,
                    hasSubscription: false
                }
            };
        }

        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        // Create table if it doesn't exist
        await tableClient.createTable().catch(() => {});

        try {
            const user = await tableClient.getEntity("Users", userEmail);
            
            return {
                status: 200,
                jsonBody: {
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
                
                return {
                    status: 200,
                    jsonBody: {
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
        context.log('Error checking user status:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to check user status" }
        };
    }
};