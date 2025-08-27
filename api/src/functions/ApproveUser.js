const { TableClient } = require("@azure/data-tables");
const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
    context.log('Admin approving/rejecting user');

    const { email, action, adminEmail } = req.body;
    
    if (!email || !action) {
        context.res = {
            status: 400,
            body: { error: "Email and action are required" }
        };
        return;
    }

    const isAdmin = req.body.isAdmin === true;
    
    if (!isAdmin) {
        context.res = {
            status: 403,
            body: { error: "Unauthorized. Admin access required." }
        };
        return;
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
                       <p><a href="https://brave-pond-0a2cb0203.2.azurestaticapps.net/">Login to Tutor Portal</a></p>`
                    : `<h2>Tutor Portal Application Update</h2>
                       <p>Unfortunately, your application has not been approved at this time.</p>
                       <p>If you have questions, please contact support.</p>`
            }
        };
        
        const poller = await emailClient.beginSend(emailMessage);
        await poller.pollUntilDone();
        
        context.res = {
            status: 200,
            body: { 
                success: true, 
                message: `User ${action}d successfully`,
                email: email 
            }
        };
    } catch (error) {
        context.log.error('Error processing user approval:', error);
        context.res = {
            status: 500,
            body: { error: "Failed to process approval" }
        };
    }
};