const { TableClient } = require("@azure/data-tables");
const { EmailClient } = require("@azure/communication-email");

module.exports = async function (request, context) {
    context.log('Admin approving/rejecting user');

    const body = await request.json().catch(() => ({}));
    const { email, action, adminEmail } = body;
    
    if (!email || !action) {
        return {
            status: 400,
            jsonBody: { error: "Email and action are required" }
        };
    }

    const isAdmin = body.isAdmin === true;
    
    if (!isAdmin) {
        return {
            status: 403,
            jsonBody: { error: "Unauthorized. Admin access required." }
        };
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        const user = await tableClient.getEntity("Users", email);
        
        user.status = action === 'approve' ? 'approved' : 'rejected';
        user.processedDate = new Date().toISOString();
        user.processedBy = adminEmail;
        
        await tableClient.updateEntity(user, "Merge");
        
        // Send email notification
        if (process.env["AZURE_COMMUNICATION_CONNECTION_STRING"]) {
            const emailClient = new EmailClient(process.env["AZURE_COMMUNICATION_CONNECTION_STRING"]);
            
            const emailMessage = {
                senderAddress: process.env["AZURE_COMMUNICATION_SENDER"],
                recipients: {
                    to: [{ address: email }]
                },
                content: {
                    subject: action === 'approve' ? 'Welcome to Tutor Portal!' : 'Tutor Portal Application Update',
                    html: action === 'approve' 
                        ? `<h2>Welcome to Tutor Portal!</h2>
                           <p>Your account has been approved. You can now log in and subscribe to access all content.</p>
                           <p><a href="https://brave-cliff-07c1f8903.2.azurestaticapps.net/">Login to Tutor Portal</a></p>`
                        : `<h2>Tutor Portal Application Update</h2>
                           <p>Unfortunately, your application has not been approved at this time.</p>
                           <p>If you have questions, please contact support.</p>`
                }
            };
            
            const poller = await emailClient.beginSend(emailMessage);
            await poller.pollUntilDone();
        }
        
        return {
            status: 200,
            jsonBody: { 
                success: true, 
                message: `User ${action}d successfully`,
                email: email 
            }
        };
    } catch (error) {
        context.log('Error processing user approval:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to process approval" }
        };
    }
};