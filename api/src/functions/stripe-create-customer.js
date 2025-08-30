const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (request, context) {
    context.log('Create Stripe customer request');
    
    try {
        const { email, name } = await request.json();
        
        if (!email || !name) {
            return {
                status: 400,
                jsonBody: { error: "Email and name are required" }
            };
        }

        // Check if customer already exists in Stripe
        const existingCustomers = await stripe.customers.list({
            email: email,
            limit: 1
        });
        
        if (existingCustomers.data.length > 0) {
            return {
                status: 200,
                jsonBody: { 
                    customer: existingCustomers.data[0],
                    message: "Customer already exists"
                }
            };
        }
        
        // Create new Stripe customer
        const customer = await stripe.customers.create({
            email: email,
            name: name,
            metadata: {
                platform: 'bright-stars-education',
                created_via: 'tutor_portal'
            }
        });
        
        // Update user record in Cosmos DB (CORRECTED CONNECTION)
        try {
            const cosmosClient = new CosmosClient(process.env.COSMOS_DB_CONNECTION_STRING);
            const database = cosmosClient.database('TutorPortal');
            const usersContainer = database.container('Users');
            
            // Try to update existing user record
            try {
                await usersContainer.item(email, email).patch([
                    {
                        op: 'replace',
                        path: '/stripeCustomerId',
                        value: customer.id
                    }
                ]);
            } catch (patchError) {
                // If user doesn't exist, create new record
                await usersContainer.items.create({
                    id: email,
                    email: email,
                    name: name,
                    stripeCustomerId: customer.id,
                    subscriptionStatus: 'none',
                    hasSubscription: false,
                    createdDate: new Date().toISOString()
                });
            }
            
        } catch (dbError) {
            context.log('Database update error (non-critical):', dbError);
            // Continue even if DB update fails - Stripe customer was created successfully
        }
        
        return {
            status: 200,
            jsonBody: { 
                customer: customer,
                message: "Customer created successfully"
            }
        };
        
    } catch (error) {
        context.log('Create customer error:', error);
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to create customer",
                message: error.message
            }
        };
    }
};