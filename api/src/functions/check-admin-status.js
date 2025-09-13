const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    context.log('Check admin status API called');

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

    const body = await request.json().catch(() => ({}));
    const userEmail = body.email || request.query.get('email');
    
    if (!userEmail) {
        return {
            status: 400,
            headers: corsHeaders,
            jsonBody: { error: "Email is required" }
        };
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        if (!connectionString) {
            context.log('Storage connection string not configured');
            
            // Fallback: Check known admin emails
            const knownAdmins = [
                'jason@bridge1.net',
                'admin@brightstars11plus.com',
                'teacher@brightstars11plus.com'
            ];
            
            return {
                status: 200,
                headers: corsHeaders,
                jsonBody: {
                    email: userEmail,
                    isAdmin: knownAdmins.includes(userEmail.toLowerCase())
                }
            };
        }

        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        // Create table if it doesn't exist
        await tableClient.createTable().catch(() => {});

        try {
            const user = await tableClient.getEntity("Users", userEmail);
            
            // Check various admin indicators
            const isAdmin = user.isAdmin === true || 
                           (user.roles && user.roles.includes && user.roles.includes('admin')) ||
                           (user.roles && user.roles.includes && user.roles.includes('tutor')) ||
                           user.userType === 'admin' ||
                           user.userType === 'tutor';
            
            return {
                status: 200,
                headers: corsHeaders,
                jsonBody: {
                    email: userEmail,
                    isAdmin: isAdmin,
                    roles: user.roles || [],
                    userType: user.userType || null
                }
            };
            
        } catch (error) {
            if (error.statusCode === 404) {
                // User not found - not admin
                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: {
                        email: userEmail,
                        isAdmin: false
                    }
                };
            } else {
                throw error;
            }
        }
    } catch (error) {
        context.log('Error checking admin status:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { error: "Failed to check admin status" }
        };
    }
};