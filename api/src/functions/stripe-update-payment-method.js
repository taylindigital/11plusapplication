const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

module.exports = async function (request, context) {
    context.log('Update payment method request');
    
    try {
        const { customerId, paymentMethodId } = await request.json();
        
        if (!customerId || !paymentMethodId) {
            return {
                status: 400,
                jsonBody: { error: "CustomerId and paymentMethodId are required" }
            };
        }

        // Verify customer exists
        const customer = await stripe.customers.retrieve(customerId);
        if (!customer) {
            return {
                status: 404,
                jsonBody: { error: "Customer not found" }
            };
        }

        // Attach new payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customerId,
        });

        // Set as default payment method
        await stripe.customers.update(customerId, {
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        // Update all active subscriptions to use new payment method
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active'
        });

        const updatePromises = subscriptions.data.map(subscription =>
            stripe.subscriptions.update(subscription.id, {
                default_payment_method: paymentMethodId
            })
        );

        await Promise.all(updatePromises);

        // Get the updated payment method details
        const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

        return {
            status: 200,
            jsonBody: {
                success: true,
                message: "Payment method updated successfully",
                payment_method: {
                    id: paymentMethod.id,
                    type: paymentMethod.type,
                    card: paymentMethod.card ? {
                        brand: paymentMethod.card.brand,
                        last4: paymentMethod.card.last4,
                        exp_month: paymentMethod.card.exp_month,
                        exp_year: paymentMethod.card.exp_year
                    } : null
                },
                subscriptions_updated: subscriptions.data.length
            }
        };
        
    } catch (error) {
        context.log('Update payment method error:', error);
        
        if (error.code === 'resource_missing') {
            return {
                status: 404,
                jsonBody: { 
                    error: "Resource not found",
                    message: error.message
                }
            };
        }
        
        if (error.type === 'StripeCardError') {
            return {
                status: 402,
                jsonBody: { 
                    error: "Card error",
                    message: error.message,
                    code: error.code
                }
            };
        }
        
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to update payment method",
                message: error.message
            }
        };
    }
};