const { TableClient } = require("@azure/data-tables");
const { EmailClient } = require("@azure/communication-email");

module.exports = async function (context, req) {
    context.log('New user signup detected');

    const { email, name } = req.body;
    
    if (!email) {
        context.res = {
            status: 400,
            body: { error: "Email is required" }
        };
        return;
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        
        await tableClient.createTable().catch(() => {});
        
        try {
            await tableClient.getEntity("Users", email);
            context.res = {
                status: 200,
                body: { message: "User already registered" }
            };
            return;
        } catch (error) {
            // User doesn't exist, create new record
        }
        
        const newUser = {
            partitionKey: "Users",
            rowKey: email,
            status: "pending",
            signupDate: new Date().toISOString(),
            name: name || '',
            hasSubscription: false
        };
        
        await tableClient.createEntity(newUser);
        
        // Send notification email to admin
        const emailClient = new EmailClient(process.env["AZURE_COMMUNICATION_CONNECTION_STRING"]);
        
        const emailMessage = {
            senderAddress: process.env["AZURE_COMMUNICATION_SENDER"],
            recipients: {
                to: [{ address: "taylorj29@hotmail.com" }]
            },
            content: {
                subject: 'New Tutor Portal User Registration',
                html: `<h2>New User Registration</h2>
                       <p><strong>Email:</strong> ${email}</p>
                       <p><strong>Name:</strong> ${name || 'Not provided'}</p>
                       <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                       <p><a href="https://brave-cliff-07c1f8903.2.azurestaticapps.net/">Go to Admin Panel to approve</a></p>`
            }
        };
        
        const poller = await emailClient.beginSend(emailMessage);
        await poller.pollUntilDone();
        
        context.res = {
            status: 200,
            body: { 
                success: true,
                message: "User registered successfully. Pending admin approval."
            }
        };
    } catch (error) {
        context.log.error('Error registering new user:', error);
        context.res = {
            status: 500,
            body: { error: "Failed to register user" }
        };
    }
};