const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { CosmosClient } = require('@azure/cosmos');

module.exports = async function (request, context) {
    context.log('Get Stripe subscription request');
    
    try {
        const { email } = await request.json();
        
        if (!email) {
            return {
                status: 400,
                jsonBody: { error: "Email is required" }
            };
        }

        let customer = null;
        let subscription = null;
        let hasActiveSubscription = false;
        let subscriptionDetails = null;

        // First, try to get customer from Stripe
        const customers = await stripe.customers.list({
            email: email,
            limit: 1
        });

        if (customers.data.length > 0) {
            customer = customers.data[0];
            
            // Get customer's subscriptions
            const subscriptions = await stripe.subscriptions.list({
                customer: customer.id,
                status: 'all',
                limit: 10
            });

            // Find active subscription
            const activeSubscription = subscriptions.data.find(sub => 
                sub.status === 'active' || sub.status === 'trialing'
            );

            if (activeSubscription) {
                subscription = activeSubscription;
                hasActiveSubscription = true;
                
                // Get price details
                const price = activeSubscription.items.data[0].price;
                
                subscriptionDetails = {
                    id: activeSubscription.id,
                    status: activeSubscription.status,
                    current_period_start: new Date(activeSubscription.current_period_start * 1000),
                    current_period_end: new Date(activeSubscription.current_period_end * 1000),
                    cancel_at_period_end: activeSubscription.cancel_at_period_end,
                    canceled_at: activeSubscription.canceled_at ? new Date(activeSubscription.canceled_at * 1000) : null,
                    plan: {
                        id: price.id,
                        amount: price.unit_amount,
                        currency: price.currency,
                        interval: price.recurring.interval,
                        product: price.product
                    },
                    payment_method: null
                };

                // Get payment method details if available
                if (customer.invoice_settings?.default_payment_method) {
                    try {
                        const paymentMethod = await stripe.paymentMethods.retrieve(
                            customer.invoice_settings.default_payment_method
                        );
                        
                        subscriptionDetails.payment_method = {
                            type: paymentMethod.type,
                            card: paymentMethod.card ? {
                                brand: paymentMethod.card.brand,
                                last4: paymentMethod.card.last4,
                                exp_month: paymentMethod.card.exp_month,
                                exp_year: paymentMethod.card.exp_year
                            } : null
                        };
                    } catch (pmError) {
                        context.log('Payment method retrieval error:', pmError);
                    }
                }
            }

            // Get recent invoices
            const invoices = await stripe.invoices.list({
                customer: customer.id,
                limit: 5
            });

            subscriptionDetails.recent_invoices = invoices.data.map(invoice => ({
                id: invoice.id,
                amount_paid: invoice.amount_paid,
                currency: invoice.currency,
                status: invoice.status,
                created: new Date(invoice.created * 1000),
                hosted_invoice_url: invoice.hosted_invoice_url,
                invoice_pdf: invoice.invoice_pdf
            }));
        }

        // Update local database with current subscription status
        try {
            const cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                key: process.env.COSMOS_DB_KEY,
            });
            
            const database = cosmosClient.database('TutorPortal');
            const usersContainer = database.container('Users');
            
            try {
                await usersContainer.item(email, email).patch([
                    {
                        op: 'replace',
                        path: '/hasSubscription',
                        value: hasActiveSubscription
                    },
                    {
                        op: 'replace',
                        path: '/subscriptionStatus',
                        value: subscription ? subscription.status : 'none'
                    },
                    {
                        op: 'replace',
                        path: '/lastChecked',
                        value: new Date().toISOString()
                    }
                ]);
            } catch (patchError) {
                // User might not exist in our database yet
                context.log('User not found in database:', patchError);
            }
            
        } catch (dbError) {
            context.log('Database update error (non-critical):', dbError);
        }

        return {
            status: 200,
            jsonBody: {
                customer: customer,
                subscription: subscriptionDetails,
                hasActiveSubscription: hasActiveSubscription,
                message: hasActiveSubscription ? "Active subscription found" : "No active subscription"
            }
        };
        
    } catch (error) {
        context.log('Get subscription error:', error);
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to retrieve subscription",
                message: error.message
            }
        };
    }
};