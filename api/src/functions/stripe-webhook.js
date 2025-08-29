const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (request, context) {
    context.log('Stripe webhook received');
    
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const sig = request.headers['stripe-signature'];
    
    let event;
    
    try {
        // Verify webhook signature
        const payload = await request.text();
        event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
        context.log(`Webhook signature verification failed: ${err.message}`);
        return {
            status: 400,
            body: `Webhook Error: ${err.message}`
        };
    }

    context.log(`Webhook event type: ${event.type}`);

    // Initialize Cosmos DB client
    let cosmosClient, database, usersContainer, subscriptionsContainer;
    try {
        cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY,
        });
        database = cosmosClient.database('TutorPortal');
        usersContainer = database.container('Users');
        subscriptionsContainer = database.container('Subscriptions');
    } catch (dbError) {
        context.log('Database initialization error:', dbError);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object, context, usersContainer, subscriptionsContainer);
                break;
                
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object, context, usersContainer, subscriptionsContainer);
                break;
                
            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object, context, usersContainer, subscriptionsContainer);
                break;
                
            case 'invoice.payment_succeeded':
                await handlePaymentSucceeded(event.data.object, context, usersContainer, subscriptionsContainer);
                break;
                
            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object, context, usersContainer);
                break;
                
            case 'invoice.upcoming':
                await handleUpcomingInvoice(event.data.object, context, usersContainer);
                break;
                
            default:
                context.log(`Unhandled event type: ${event.type}`);
        }
        
        return {
            status: 200,
            jsonBody: { received: true, type: event.type }
        };
        
    } catch (error) {
        context.log(`Error processing webhook: ${error.message}`);
        return {
            status: 500,
            jsonBody: { error: 'Webhook processing failed' }
        };
    }
};

async function handleSubscriptionCreated(subscription, context, usersContainer, subscriptionsContainer) {
    context.log(`Subscription created: ${subscription.id}`);
    
    try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;
        
        // Update user record
        await usersContainer.item(userEmail, userEmail).patch([
            {
                op: 'replace',
                path: '/subscriptionStatus',
                value: subscription.status
            },
            {
                op: 'replace',
                path: '/stripeSubscriptionId',
                value: subscription.id
            },
            {
                op: 'replace',
                path: '/hasSubscription',
                value: subscription.status === 'active'
            },
            {
                op: 'replace',
                path: '/subscriptionStartDate',
                value: new Date(subscription.created * 1000).toISOString()
            }
        ]);
        
        // Create/update subscription record
        const subscriptionRecord = {
            id: subscription.id,
            userId: userEmail,
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: subscription.customer,
            status: subscription.status,
            createdDate: new Date(subscription.created * 1000).toISOString(),
            events: [{
                type: 'created',
                date: new Date().toISOString(),
                status: subscription.status
            }]
        };
        
        await subscriptionsContainer.items.upsert(subscriptionRecord);
        
    } catch (error) {
        context.log('Error handling subscription created:', error);
    }
}

async function handleSubscriptionUpdated(subscription, context, usersContainer, subscriptionsContainer) {
    context.log(`Subscription updated: ${subscription.id}`);
    
    try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;
        
        // Update user record
        await usersContainer.item(userEmail, userEmail).patch([
            {
                op: 'replace',
                path: '/subscriptionStatus',
                value: subscription.status
            },
            {
                op: 'replace',
                path: '/hasSubscription',
                value: subscription.status === 'active' && !subscription.cancel_at_period_end
            },
            {
                op: 'replace',
                path: '/cancelAtPeriodEnd',
                value: subscription.cancel_at_period_end || false
            }
        ]);
        
        // Update subscription record
        try {
            const existingRecord = await subscriptionsContainer.item(subscription.id, subscription.id).read();
            if (existingRecord.resource) {
                const events = existingRecord.resource.events || [];
                events.push({
                    type: 'updated',
                    date: new Date().toISOString(),
                    status: subscription.status,
                    cancel_at_period_end: subscription.cancel_at_period_end
                });
                
                await subscriptionsContainer.item(subscription.id, subscription.id).patch([
                    {
                        op: 'replace',
                        path: '/status',
                        value: subscription.status
                    },
                    {
                        op: 'replace',
                        path: '/events',
                        value: events
                    }
                ]);
            }
        } catch (recordError) {
            context.log('Subscription record update error:', recordError);
        }
        
    } catch (error) {
        context.log('Error handling subscription updated:', error);
    }
}

async function handleSubscriptionDeleted(subscription, context, usersContainer, subscriptionsContainer) {
    context.log(`Subscription deleted: ${subscription.id}`);
    
    try {
        const customer = await stripe.customers.retrieve(subscription.customer);
        const userEmail = customer.email;
        
        // Update user record
        await usersContainer.item(userEmail, userEmail).patch([
            {
                op: 'replace',
                path: '/subscriptionStatus',
                value: 'canceled'
            },
            {
                op: 'replace',
                path: '/hasSubscription',
                value: false
            },
            {
                op: 'replace',
                path: '/subscriptionEndDate',
                value: new Date().toISOString()
            }
        ]);
        
        // Update subscription record
        try {
            const existingRecord = await subscriptionsContainer.item(subscription.id, subscription.id).read();
            if (existingRecord.resource) {
                const events = existingRecord.resource.events || [];
                events.push({
                    type: 'deleted',
                    date: new Date().toISOString(),
                    status: 'canceled'
                });
                
                await subscriptionsContainer.item(subscription.id, subscription.id).patch([
                    {
                        op: 'replace',
                        path: '/status',
                        value: 'canceled'
                    },
                    {
                        op: 'replace',
                        path: '/endDate',
                        value: new Date().toISOString()
                    },
                    {
                        op: 'replace',
                        path: '/events',
                        value: events
                    }
                ]);
            }
        } catch (recordError) {
            context.log('Subscription record update error:', recordError);
        }
        
    } catch (error) {
        context.log('Error handling subscription deleted:', error);
    }
}

async function handlePaymentSucceeded(invoice, context, usersContainer, subscriptionsContainer) {
    context.log(`Payment succeeded for invoice: ${invoice.id}`);
    
    try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userEmail = customer.email;
        
        // Update user record with successful payment
        await usersContainer.item(userEmail, userEmail).patch([
            {
                op: 'replace',
                path: '/lastPaymentDate',
                value: new Date(invoice.created * 1000).toISOString()
            },
            {
                op: 'replace',
                path: '/paymentStatus',
                value: 'paid'
            }
        ]);
        
        // Update subscription record if available
        if (invoice.subscription) {
            try {
                const existingRecord = await subscriptionsContainer.item(invoice.subscription, invoice.subscription).read();
                if (existingRecord.resource) {
                    const events = existingRecord.resource.events || [];
                    events.push({
                        type: 'payment_succeeded',
                        date: new Date().toISOString(),
                        amount: invoice.amount_paid,
                        currency: invoice.currency,
                        invoice_id: invoice.id
                    });
                    
                    await subscriptionsContainer.item(invoice.subscription, invoice.subscription).patch([
                        {
                            op: 'replace',
                            path: '/events',
                            value: events
                        }
                    ]);
                }
            } catch (recordError) {
                context.log('Subscription record update error:', recordError);
            }
        }
        
    } catch (error) {
        context.log('Error handling payment succeeded:', error);
    }
}

async function handlePaymentFailed(invoice, context, usersContainer) {
    context.log(`Payment failed for invoice: ${invoice.id}`);
    
    try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userEmail = customer.email;
        
        // Update user record with failed payment
        await usersContainer.item(userEmail, userEmail).patch([
            {
                op: 'replace',
                path: '/paymentStatus',
                value: 'failed'
            },
            {
                op: 'replace',
                path: '/lastPaymentFailure',
                value: new Date().toISOString()
            }
        ]);
        
        // TODO: Send notification email to user about failed payment
        // await sendPaymentFailureEmail(userEmail, invoice);
        
    } catch (error) {
        context.log('Error handling payment failed:', error);
    }
}

async function handleUpcomingInvoice(invoice, context, usersContainer) {
    context.log(`Upcoming invoice: ${invoice.id}`);
    
    try {
        const customer = await stripe.customers.retrieve(invoice.customer);
        const userEmail = customer.email;
        
        // TODO: Send notification email about upcoming payment
        // await sendUpcomingPaymentEmail(userEmail, invoice);
        
        context.log(`Upcoming invoice notification processed for ${userEmail}`);
        
    } catch (error) {
        context.log('Error handling upcoming invoice:', error);
    }
}