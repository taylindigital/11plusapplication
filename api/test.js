module.exports = async function (context, req) {
    context.log('Test function executed');
    
    context.res = {
        status: 200,
        body: {
            message: "API is working!",
            timestamp: new Date().toISOString(),
            environment: {
                hasStorageConnection: !!process.env.STORAGE_CONNECTION_STRING,
                hasEmailConnection: !!process.env.AZURE_COMMUNICATION_CONNECTION_STRING,
                hasSender: !!process.env.AZURE_COMMUNICATION_SENDER
            }
        }
    };
};