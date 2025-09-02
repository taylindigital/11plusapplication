const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    context.log('View tracking request received');
    
    try {
        const trackingData = await request.json();
        
        // Validate required fields
        if (!trackingData.eventType || !trackingData.userId || !trackingData.timestamp) {
            return {
                status: 400,
                jsonBody: { error: "Missing required fields: eventType, userId, timestamp" }
            };
        }

        // Connect to Azure Table Storage using connection string
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        
        // Use the connection string directly (not as URL)
        const tableClient = new TableClient(connectionString, "viewtracking");
        
        // Create table if it doesn't exist
        await tableClient.createTable().catch(() => {}); // Ignore if exists

        // Create tracking entity
        const trackingEntity = {
            partitionKey: trackingData.userId,
            rowKey: `${trackingData.timestamp}_${Math.random().toString(36).substr(2, 9)}`,
            eventType: trackingData.eventType,
            userId: trackingData.userId,
            timestamp: trackingData.timestamp,
            lessonId: trackingData.lessonId || 'unknown',
            sessionId: trackingData.sessionId || 'unknown',
            lessonTitle: trackingData.lessonTitle || '',
            lessonCategory: trackingData.lessonCategory || '',
            viewDuration: trackingData.viewDuration || 0,
            message: trackingData.message || '',
            userAgent: request.headers['user-agent'] || '',
            ipAddress: request.headers['x-forwarded-for'] || request.headers['x-real-ip'] || 'unknown',
            createdAt: new Date().toISOString()
        };

        // Insert into table
        await tableClient.createEntity(trackingEntity);

        context.log(`Tracking event recorded: ${trackingData.eventType} for user ${trackingData.userId}`);

        return {
            status: 200,
            jsonBody: { 
                success: true, 
                message: "Event tracked successfully",
                eventId: trackingEntity.rowKey
            }
        };

    } catch (error) {
        context.log('Tracking error:', error);
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to track event",
                details: error.message 
            }
        };
    }
};