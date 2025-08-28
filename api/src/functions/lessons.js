const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    const method = request.method.toUpperCase();
    const body = await request.json().catch(() => ({}));
    
    const connectionString = process.env["STORAGE_CONNECTION_STRING"];
    if (!connectionString) {
        return {
            status: 500,
            jsonBody: { error: "Storage not configured" }
        };
    }
    
    const tableClient = TableClient.fromConnectionString(connectionString, "Lessons");
    await tableClient.createTable().catch(() => {});
    
    try {
        switch(method) {
            case 'GET':
                // Get all lessons or specific lesson
                const lessonId = request.query.get('id');
                if (lessonId) {
                    const lesson = await tableClient.getEntity("Lessons", lessonId);
                    return { status: 200, jsonBody: lesson };
                } else {
                    const lessons = [];
                    const iterator = tableClient.listEntities();
                    for await (const entity of iterator) {
                        lessons.push({
                            id: entity.rowKey,
                            title: entity.title,
                            subject: entity.subject,
                            grade: entity.grade,
                            description: entity.description,
                            contentType: entity.contentType,
                            createdDate: entity.createdDate,
                            isPublished: entity.isPublished
                        });
                    }
                    return { status: 200, jsonBody: { lessons } };
                }
                
            case 'POST':
                // Create new lesson (admin only)
                if (!body.isAdmin) {
                    return { status: 403, jsonBody: { error: "Admin access required" } };
                }
                
                const newLesson = {
                    partitionKey: "Lessons",
                    rowKey: `lesson_${Date.now()}`,
                    title: body.title,
                    subject: body.subject,
                    grade: body.grade,
                    description: body.description,
                    content: body.content, // HTML content or URL to file
                    contentType: body.contentType || 'html',
                    createdDate: new Date().toISOString(),
                    createdBy: body.adminEmail,
                    isPublished: body.isPublished || false
                };
                
                await tableClient.createEntity(newLesson);
                return { 
                    status: 200, 
                    jsonBody: { 
                        success: true, 
                        lessonId: newLesson.rowKey 
                    } 
                };
                
            case 'PUT':
                // Update lesson (admin only)
                if (!body.isAdmin) {
                    return { status: 403, jsonBody: { error: "Admin access required" } };
                }
                
                const existingLesson = await tableClient.getEntity("Lessons", body.id);
                Object.assign(existingLesson, {
                    title: body.title || existingLesson.title,
                    subject: body.subject || existingLesson.subject,
                    grade: body.grade || existingLesson.grade,
                    description: body.description || existingLesson.description,
                    content: body.content || existingLesson.content,
                    isPublished: body.isPublished !== undefined ? body.isPublished : existingLesson.isPublished,
                    modifiedDate: new Date().toISOString()
                });
                
                await tableClient.updateEntity(existingLesson, "Merge");
                return { status: 200, jsonBody: { success: true } };
                
            case 'DELETE':
                // Delete lesson (admin only)
                if (!body.isAdmin) {
                    return { status: 403, jsonBody: { error: "Admin access required" } };
                }
                
                await tableClient.deleteEntity("Lessons", body.id);
                return { status: 200, jsonBody: { success: true } };
                
            default:
                return { status: 405, jsonBody: { error: "Method not allowed" } };
        }
    } catch (error) {
        context.log('Error in lessons function:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to process lesson request" }
        };
    }
};