const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');

// Initialize Cosmos DB client
const cosmosClient = new CosmosClient({
    endpoint: process.env.COSMOS_DB_ENDPOINT,
    key: process.env.COSMOS_DB_KEY,
});

const database = cosmosClient.database('TutorPortal');
const lessonsContainer = database.container('Lessons');

app.http('lessons', {
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
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
            const method = request.method;
            const body = await request.json();
            const { action, lesson, userEmail, isAdmin } = body || {};

            // Verify user permissions
            if (!userEmail) {
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: 'User email required' }
                };
            }

            switch (action || method) {
                case 'get':
                case 'GET':
                    // Get all lessons
                    let query = "SELECT * FROM c";
                    if (!isAdmin) {
                        query += " WHERE c.published = true";
                    }
                    query += " ORDER BY c.createdDate DESC";

                    const { resources: lessons } = await lessonsContainer.items
                        .query(query)
                        .fetchAll();

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
                        jsonBody: { success: false, error: 'Invalid action' }
                    };
            }

        } catch (error) {
            context.error('Lessons API error:', error);
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
    }
});