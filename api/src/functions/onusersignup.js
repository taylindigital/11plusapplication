const { TableClient } = require("@azure/data-tables");
const { EmailClient } = require("@azure/communication-email");

module.exports = async function (request, context) {
    context.log('New user signup detected');

    const body = await request.json().catch(() => ({}));
    const { email, name } = body;
    
    if (!email) {
        return {
            status: 400,
            jsonBody: { error: "Email is required" }
        };
    }

    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        if (!connectionString) {
            return {
                status: 200,
                jsonBody: { message: "Storage not configured - skipping registration" }
            };
        }

        const tableClient = TableClient.fromConnectionString(connectionString, "Users");
        await tableClient.createTable().catch(() => {});
        
        try {
            await tableClient.getEntity("Users", email);
            return {
                status: 200,
                jsonBody: { message: "User already registered" }
            };
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
        if (process.env["AZURE_COMMUNICATION_CONNECTION_STRING"]) {
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
        }
        
        return {
            status: 200,
            jsonBody: { 
                success: true,
                message: "User registered successfully. Pending admin approval."
            }
        };
    } catch (error) {
        context.log('Error registering new user:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to register user" }
        };
    }
};