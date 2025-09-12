const { TableClient } = require("@azure/data-tables");
const { Client } = require("@microsoft/microsoft-graph-client");
const { ClientSecretCredential } = require("@azure/identity");

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
            case 'get-all-users':
                return await getAllUsers(tableClient, corsHeaders, context);
            case 'delete-user':
                const { userEmail } = body;
                return await deleteUser(userEmail, tableClient, corsHeaders, context);
                
            case 'update-user-field':
                const { userEmail: updateEmail, field, value } = body;
                return await updateUserField(updateEmail, field, value, tableClient, corsHeaders, context);
            
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

        // Get Azure AD B2C users to exclude them from pending list
        const azureUsers = await getAzureB2CUsers(context);
        const azureEmails = new Set(azureUsers.map(user => user.email));

        // Filter pending users (status is undefined or 'pending') and not in Azure AD
        const pendingUsers = users.filter(user => 
            (!user.status || user.status === 'pending') && 
            !azureEmails.has(user.email)
        );
        
        const totalUsers = users.length;
        const pendingCount = pendingUsers.length;

        context.log(`Found ${pendingCount} pending users out of ${totalUsers} total users (${azureUsers.length} already in Azure AD)`);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                users: pendingUsers,
                stats: {
                    pending: pendingCount,
                    total: totalUsers,
                    azureUsers: azureUsers.length
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

// Function to get users from Azure AD B2C
async function getAzureB2CUsers(context) {
    try {
        // Check if required environment variables are present
        const tenantId = process.env["AZURE_TENANT_ID"];
        const clientId = process.env["AZURE_CLIENT_ID"];
        const clientSecret = process.env["AZURE_CLIENT_SECRET"];

        if (!tenantId || !clientId || !clientSecret) {
            context.log('Azure AD credentials not configured, skipping Azure user lookup');
            return [];
        }

        // Create credential and Graph client
        const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
        const graphClient = Client.initWithMiddleware({
            authProvider: {
                getAccessToken: async () => {
                    const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
                    return tokenResponse.token;
                }
            }
        });

        // Query Azure AD B2C users
        const users = await graphClient
            .api('/users')
            .select('id,userPrincipalName,mail,displayName,identities')
            .top(999) // Get up to 999 users
            .get();

        // Extract email addresses from the users
        const azureUsers = users.value.map(user => {
            // B2C users might have email in different fields
            let email = user.mail || user.userPrincipalName;
            
            // For B2C, check identities for email
            if (user.identities && user.identities.length > 0) {
                const emailIdentity = user.identities.find(id => id.signInType === 'emailAddress');
                if (emailIdentity) {
                    email = emailIdentity.issuerAssignedId;
                }
            }
            
            return {
                id: user.id,
                email: email,
                displayName: user.displayName
            };
        }).filter(user => user.email); // Only include users with email addresses

        context.log(`Retrieved ${azureUsers.length} users from Azure AD B2C`);
        return azureUsers;

    } catch (error) {
        context.log('Error fetching Azure AD users:', error);
        // Don't fail the entire request if Azure AD lookup fails
        return [];
    }
}

// Function to get ALL users (both Azure AD and local database) with comprehensive info
async function getAllUsers(tableClient, corsHeaders, context) {
    try {
        // Get users from Azure AD B2C
        const azureUsers = await getAzureB2CUsers(context);
        
        // Get users from local database  
        const localUsers = [];
        const entities = tableClient.listEntities();
        
        for await (const entity of entities) {
            localUsers.push({
                email: entity.rowKey,
                name: entity.name,
                phone: entity.phone,
                organization: entity.organization,
                status: entity.status,
                roles: entity.roles ? JSON.parse(entity.roles) : [],
                userType: entity.userType,
                isAdmin: entity.isAdmin,
                createdDate: entity.timestamp,
                processedDate: entity.processedDate,
                processedBy: entity.processedBy,
                subscriptionStatus: entity.subscriptionStatus || 'unknown',
                lastLoginDate: entity.lastLoginDate,
                startDate: entity.startDate
            });
        }

        // Create a comprehensive user list by merging Azure and local data
        const allUsers = [];
        const localUserMap = new Map(localUsers.map(user => [user.email, user]));

        // Add Azure users with their local data if it exists
        for (const azureUser of azureUsers) {
            const localData = localUserMap.get(azureUser.email);
            allUsers.push({
                email: azureUser.email,
                displayName: azureUser.displayName,
                azureId: azureUser.id,
                source: 'azure',
                // Local database info (if available)
                name: localData?.name || azureUser.displayName,
                phone: localData?.phone || 'Not available',
                organization: localData?.organization || 'Unknown',
                roles: localData?.roles || [],
                userType: localData?.userType || 'unknown',
                isAdmin: localData?.isAdmin || false,
                status: localData?.status || 'active',
                subscriptionStatus: localData?.subscriptionStatus || 'unknown',
                createdDate: localData?.createdDate || 'Unknown',
                lastLoginDate: localData?.lastLoginDate || 'Never',
                startDate: localData?.startDate || 'Unknown'
            });
            
            // Remove from local map as we've processed it
            localUserMap.delete(azureUser.email);
        }

        // Add remaining local users (those not in Azure - pending approval)
        for (const [email, localUser] of localUserMap) {
            allUsers.push({
                ...localUser,
                source: 'pending',
                azureId: null,
                displayName: localUser.name
            });
        }

        // Sort by creation date
        allUsers.sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

        context.log(`Retrieved ${allUsers.length} total users (${azureUsers.length} in Azure, ${localUsers.length} in database)`);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                users: allUsers,
                stats: {
                    total: allUsers.length,
                    azure: azureUsers.length,
                    pending: allUsers.filter(u => u.source === 'pending').length,
                    active: azureUsers.length
                }
            }
        };

    } catch (error) {
        context.log('Get all users error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                success: false, 
                error: 'Failed to retrieve users' 
            }
        };
    }
}

// Function to delete a user from both Azure AD B2C and local database
async function deleteUser(userEmail, tableClient, corsHeaders, context) {
    try {
        let azureDeleted = false;
        let localDeleted = false;
        let errors = [];

        // First, try to delete from Azure AD B2C
        try {
            const azureUsers = await getAzureB2CUsers(context);
            const targetUser = azureUsers.find(user => user.email === userEmail);
            
            if (targetUser) {
                await deleteUserFromAzure(targetUser.id, context);
                azureDeleted = true;
                context.log(`Successfully deleted user ${userEmail} from Azure AD B2C`);
            } else {
                context.log(`User ${userEmail} not found in Azure AD B2C`);
            }
        } catch (azureError) {
            context.log(`Failed to delete user from Azure AD: ${azureError.message}`);
            errors.push(`Azure deletion failed: ${azureError.message}`);
        }

        // Then, try to delete from local database
        try {
            await tableClient.deleteEntity("Users", userEmail);
            localDeleted = true;
            context.log(`Successfully deleted user ${userEmail} from local database`);
        } catch (localError) {
            if (localError.statusCode === 404) {
                context.log(`User ${userEmail} not found in local database`);
            } else {
                context.log(`Failed to delete user from local database: ${localError.message}`);
                errors.push(`Database deletion failed: ${localError.message}`);
            }
        }

        if (!azureDeleted && !localDeleted && errors.length === 0) {
            return {
                status: 404,
                headers: corsHeaders,
                jsonBody: {
                    success: false,
                    error: `User ${userEmail} not found in either Azure AD or local database`
                }
            };
        }

        const successMessage = [];
        if (azureDeleted) successMessage.push('Azure AD B2C');
        if (localDeleted) successMessage.push('local database');

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                message: `User ${userEmail} deleted from: ${successMessage.join(', ')}`,
                details: {
                    azureDeleted,
                    localDeleted,
                    errors: errors.length > 0 ? errors : null
                }
            }
        };

    } catch (error) {
        context.log('Delete user error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: {
                success: false,
                error: 'Failed to delete user',
                details: error.message
            }
        };
    }
}

// Helper function to delete user from Azure AD B2C
async function deleteUserFromAzure(userId, context) {
    const tenantId = process.env["AZURE_TENANT_ID"];
    const clientId = process.env["AZURE_CLIENT_ID"];  
    const clientSecret = process.env["AZURE_CLIENT_SECRET"];

    if (!tenantId || !clientId || !clientSecret) {
        throw new Error('Azure AD credentials not configured');
    }

    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret);
    const graphClient = Client.initWithMiddleware({
        authProvider: {
            getAccessToken: async () => {
                const tokenResponse = await credential.getToken("https://graph.microsoft.com/.default");
                return tokenResponse.token;
            }
        }
    });

    // Delete the user from Azure AD B2C
    await graphClient.api(`/users/${userId}`).delete();
    context.log(`User ${userId} successfully deleted from Azure AD B2C`);
}

// Function to update a user field in the database
async function updateUserField(userEmail, field, value, tableClient, corsHeaders, context) {
    try {
        // Validate field name to prevent injection
        const allowedFields = ['name', 'phone', 'organization'];
        if (!allowedFields.includes(field)) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: {
                    success: false,
                    error: `Invalid field: ${field}. Allowed fields are: ${allowedFields.join(', ')}`
                }
            };
        }

        // Get the existing user entity
        const userEntity = await tableClient.getEntity("Users", userEmail);
        
        // Update the specific field
        userEntity[field] = value;
        userEntity.lastModified = new Date().toISOString();
        
        // Save the updated entity
        await tableClient.updateEntity(userEntity, "Merge");
        
        context.log(`Updated ${field} for user ${userEmail}: ${value}`);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                message: `${field.charAt(0).toUpperCase() + field.slice(1)} updated successfully`,
                field: field,
                value: value
            }
        };

    } catch (error) {
        context.log('Update user field error:', error);
        
        if (error.statusCode === 404) {
            return {
                status: 404,
                headers: corsHeaders,
                jsonBody: {
                    success: false,
                    error: `User ${userEmail} not found`
                }
            };
        }
        
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: {
                success: false,
                error: 'Failed to update user field',
                details: error.message
            }
        };
    }
}