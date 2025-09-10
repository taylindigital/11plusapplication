const { CosmosClient } = require('@azure/cosmos');

// Initialize Cosmos DB client
const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
});

const database = cosmosClient.database('TutorPortal');
const lessonsContainer = database.container('Lessons');

module.exports = async function (request, context) {
    context.log('Lessons API called');

    // Set CORS headers
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
        return {
            status: 200,
            headers: corsHeaders,
        };
    }

    try {
        const body = await request.json();
        const { action, lesson, userEmail, isAdmin } = body || {};

        context.log('Request body:', { action, userEmail, isAdmin, lessonId: lesson?.id });

        // Verify user permissions
        if (!userEmail) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'User email required' }
            };
        }

        switch (action) {
            case 'get':
                // Get all lessons
                let query = "SELECT * FROM c";
                if (!isAdmin) {
                    query += " WHERE c.published = true";
                }
                query += " ORDER BY c.createdDate DESC";

                context.log('Executing query:', query);
                const { resources: lessons } = await lessonsContainer.items
                    .query(query)
                    .fetchAll();

                context.log('Found lessons:', lessons?.length || 0);

                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: { 
                        success: true, 
                        lessons: lessons || [] 
                    }
                };

            case 'create':
                // Create new lesson
                if (!isAdmin) {
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Admin access required' }
                    };
                }

                const newLesson = {
                    id: Date.now().toString(),
                    ...lesson,
                    createdDate: new Date().toISOString(),
                    updatedDate: new Date().toISOString(),
                    createdBy: userEmail,
                    published: true
                };

                context.log('Creating lesson:', newLesson.title);
                const { resource: createdLesson } = await lessonsContainer.items.create(newLesson);

                return {
                    status: 201,
                    headers: corsHeaders,
                    jsonBody: { 
                        success: true, 
                        lesson: createdLesson 
                    }
                };

            case 'update':
                // Update existing lesson
                if (!isAdmin) {
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Admin access required' }
                    };
                }

                const updatedLessonData = {
                    ...lesson,
                    updatedDate: new Date().toISOString(),
                    updatedBy: userEmail
                };

                context.log('Updating lesson:', lesson.id);
                const { resource: updatedLesson } = await lessonsContainer
                    .item(lesson.id, lesson.id)
                    .replace(updatedLessonData);

                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: { 
                        success: true, 
                        lesson: updatedLesson 
                    }
                };

            case 'delete':
                // Delete lesson
                if (!isAdmin) {
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Admin access required' }
                    };
                }

                context.log('Deleting lesson:', lesson.id);
                await lessonsContainer.item(lesson.id, lesson.id).delete();

                return {
                    status: 200,
                    headers: corsHeaders,
                    jsonBody: { 
                        success: true, 
                        message: 'Lesson deleted successfully' 
                    }
                };

            default:
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: `Invalid action: ${action}` }
                };
        }

    } catch (error) {
        context.log.error('Lessons API error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                success: false, 
                error: 'Internal server error',
                details: error.message 
            }
        };
    }
};