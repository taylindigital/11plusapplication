// stripe-create-subscription.js - CORRECTED VERSION
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (request, context) {
    context.log('Create Stripe subscription request');
    
    try {
        const { customerId, priceId, paymentMethodId } = await request.json();
        
        if (!customerId || !priceId || !paymentMethodId) {
            return {
                status: 400,
                jsonBody: { error: "CustomerId, priceId, and paymentMethodId are required" }
            };
        }

        // Get customer details
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer) {
            return {
                status: 404,
                jsonBody: { error: "Customer not found" }
            };
        }

        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
        });

        // Set as default payment method
        await stripe.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        // Create subscription
        const subscription = await stripe.subscriptions.create({
            customer: customerId,
            items: [{ price: priceId }],
            default_payment_method: paymentMethodId,
            expand: ['latest_invoice.payment_intent'],
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
            const subscriptionsContainer = database.container('Subscriptions');
            
            const userEmail = customer.email;
            
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
                    value: new Date().toISOString()
                },
                {
                    op: 'replace',
                    path: '/lastPaymentDate',
                    value: new Date().toISOString()
                }
            ]);
            
            // Create subscription record for analytics
            await subscriptionsContainer.items.create({
                id: subscription.id,
                userId: userEmail,
                stripeSubscriptionId: subscription.id,
                stripeCustomerId: customerId,
                priceId: priceId,
                status: subscription.status,
                amount: subscription.items.data[0].price.unit_amount,
                currency: subscription.items.data[0].price.currency,
                createdDate: new Date().toISOString(),
                events: [{
                    type: 'created',
                    date: new Date().toISOString(),
                    status: subscription.status
                }]
            });
            
        } catch (dbError) {
            context.log('Database update error (non-critical):', dbError);
        }

        // Handle payment intent status
        const paymentIntent = subscription.latest_invoice?.payment_intent;
        let responseData = {
            subscription: subscription,
            status: subscription.status,
            message: "Subscription created successfully"
        };

        if (paymentIntent) {
            if (paymentIntent.status === 'requires_action') {
                responseData.client_secret = paymentIntent.client_secret;
                responseData.requires_action = true;
                responseData.message = "Additional authentication required";
            } else if (paymentIntent.status === 'succeeded') {
                responseData.message = "Subscription activated successfully";
            }
        }

        return {
            status: 200,
            jsonBody: responseData
        };
        
    } catch (error) {
        context.log('Create subscription error:', error);
        
        // Handle specific Stripe errors
        if (error.type === 'StripeCardError') {
            return {
                status: 402,
                jsonBody: { 
                    error: "Payment failed",
                    message: error.message,
                    code: error.code
                }
            };
        }
        
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to create subscription",
                message: error.message
            }
        };
    }
};