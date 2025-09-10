const { CosmosClient } = require('@azure/cosmos');

let cosmosClient, database, lessonsContainer;

// Initialize Cosmos DB
function initializeCosmosDB() {
    if (!cosmosClient) {
        cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY,
        });
        database = cosmosClient.database('TutorPortal');
        lessonsContainer = database.container('Lessons');
    }
}

module.exports = async function (request, context) {
    context.log('Lessons API called');

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
        return {
            status: 200,
            headers: corsHeaders,
        };
    }

    try {
        initializeCosmosDB();

        let body;
        try {
            body = await request.json();
        } catch (jsonError) {
            context.log.error('Failed to parse JSON:', jsonError);
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invalid JSON in request body' }
            };
        }

        const { action, lesson, userEmail, isAdmin } = body || {};

        context.log('Request:', { action, userEmail: !!userEmail, isAdmin, lessonTitle: lesson?.title });

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
                if (!isAdmin) {
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Admin access required' }
                    };
                }

                if (!lesson) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Lesson data required' }
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