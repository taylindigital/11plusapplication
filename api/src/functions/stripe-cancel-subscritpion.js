const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (request, context) {
    context.log('Cancel Stripe subscription request');
    
    try {
        const { subscriptionId, immediate = false } = await request.json();
        
        if (!subscriptionId) {
            return {
                status: 400,
                jsonBody: { error: "SubscriptionId is required" }
            };
        }

        let updatedSubscription;
        
        if (immediate) {
            // Cancel immediately
            updatedSubscription = await stripe.subscriptions.cancel(subscriptionId);
        } else {
            // Cancel at period end (recommended to maintain access until paid period ends)
            updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true
            });
        }

        // Get customer details for database update
        const customer = await stripe.customers.retrieve(updatedSubscription.customer);

        // Update user record in Cosmos DB
        try {
            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                key: process.env.COSMOS_DB_KEY,
            });
            
            const database = cosmosClient.database('TutorPortal');
            const usersContainer = database.container('Users');
            const subscriptionsContainer = database.container('Subscriptions');
            
            const userEmail = customer.email;
            
            // Update user record
            await usersContainer.item(userEmail, userEmail).patch([
                {
                    op: 'replace',
                    path: '/subscriptionStatus',
                    value: updatedSubscription.status
                },
                {
                    op: 'replace',
                    path: '/hasSubscription',
                    value: updatedSubscription.status === 'active' && !updatedSubscription.cancel_at_period_end
                },
                {
                    op: 'replace',
                    path: '/cancelationDate',
                    value: new Date().toISOString()
                },
                {
                    op: 'replace',
                    path: '/cancelAtPeriodEnd',
                    value: updatedSubscription.cancel_at_period_end || false
                }
            ]);
            
            // Update subscription record
            try {
                const subscriptionRecord = await subscriptionsContainer.item(subscriptionId, subscriptionId).read();
                if (subscriptionRecord.resource) {
                    const events = subscriptionRecord.resource.events || [];
                    events.push({
                        type: immediate ? 'canceled_immediately' : 'canceled_at_period_end',
                        date: new Date().toISOString(),
                        status: updatedSubscription.status
                    });
                    
                    await subscriptionsContainer.item(subscriptionId, subscriptionId).patch([
                        {
                            op: 'replace',
                            path: '/status',
                            value: updatedSubscription.status
                        },
                        {
                            op: 'replace',
                            path: '/canceledDate',
                            value: new Date().toISOString()
                        },
                        {
                            op: 'replace',
                            path: '/cancelAtPeriodEnd',
                            value: updatedSubscription.cancel_at_period_end || false
                        },
                        {
                            op: 'replace',
                            path: '/events',
                            value: events
                        }
                    ]);
                }
            } catch (subError) {
                context.log('Subscription record update error (non-critical):', subError);
            }
            
        } catch (dbError) {
            context.log('Database update error (non-critical):', dbError);
        }

        // Prepare response message
        let message;
        if (immediate) {
            message = "Subscription canceled immediately. Access has been revoked.";
        } else if (updatedSubscription.cancel_at_period_end) {
            const periodEnd = new Date(updatedSubscription.current_period_end * 1000);
            message = `Subscription will be canceled at the end of the current billing period (${periodEnd.toLocaleDateString()}). You will continue to have access until then.`;
        } else {
            message = "Subscription cancellation processed.";
        }

        return {
            status: 200,
            jsonBody: {
                success: true,
                subscription: {
                    id: updatedSubscription.id,
                    status: updatedSubscription.status,
                    cancel_at_period_end: updatedSubscription.cancel_at_period_end,
                    current_period_end: updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000) : null,
                    canceled_at: updatedSubscription.canceled_at ? new Date(updatedSubscription.canceled_at * 1000) : null
                },
                message: message
            }
        };
        
    } catch (error) {
        context.log('Cancel subscription error:', error);
        
        // Handle specific Stripe errors
        if (error.code === 'resource_missing') {
            return {
                status: 404,
                jsonBody: { 
                    error: "Subscription not found",
                    message: "The subscription you're trying to cancel doesn't exist."
                }
            };
        }
        
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to cancel subscription",
                message: error.message
            }
        };
    }
};