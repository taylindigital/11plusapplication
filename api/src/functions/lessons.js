const { CosmosClient } = require('@azure/cosmos');

let cosmosClient, database, lessonsContainer;

// Initialize Cosmos DB with error handling
function initializeCosmosDB() {
    if (!cosmosClient) {
        try {
            console.log('Initializing Cosmos DB...');
            console.log('Endpoint:', process.env.COSMOS_DB_ENDPOINT ? 'Set' : 'Missing');
            console.log('Key:', process.env.COSMOS_DB_KEY ? 'Set' : 'Missing');

            cosmosClient = new CosmosClient({
                endpoint: process.env.COSMOS_DB_ENDPOINT,
                key: process.env.COSMOS_DB_KEY,
            });

            database = cosmosClient.database('TutorPortal');
            lessonsContainer = database.container('Lessons');
            console.log('Cosmos DB initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Cosmos DB:', error);
            throw error;
        }
    }
}

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
        // Initialize Cosmos DB
        initializeCosmosDB();

        let body;
        try {
            body = await request.json();
            context.log('Parsed request body successfully');
        } catch (jsonError) {
            context.log.error('Failed to parse JSON:', jsonError);
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invalid JSON in request body' }
            };
        }

        const { action, lesson, userEmail, isAdmin } = body || {};

        context.log('Request details:', { 
            action, 
            userEmail: userEmail ? 'Present' : 'Missing', 
            isAdmin, 
            lessonId: lesson?.id,
            lessonTitle: lesson?.title 
        });

        // Verify user permissions
        if (!userEmail) {
            context.log.error('User email missing from request');
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
                
                try {
                    const { resources: lessons } = await lessonsContainer.items
                        .query(query)
                        .fetchAll();

                    context.log('Query successful, found lessons:', lessons?.length || 0);

                    return {
                        status: 200,
                        headers: corsHeaders,
                        jsonBody: { 
                            success: true, 
                            lessons: lessons || [] 
                        }
                    };
                } catch (queryError) {
                    context.log.error('Query failed:', queryError);
                    throw queryError;
                }

            case 'create':
                // Create new lesson
                if (!isAdmin) {
                    context.log.error('Non-admin user attempted to create lesson');
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Admin access required' }
                    };
                }

                if (!lesson) {
                    context.log.error('No lesson data provided');
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

                context.log('Creating lesson with data:', {
                    id: newLesson.id,
                    title: newLesson.title,
                    category: newLesson.category,
                    createdBy: newLesson.createdBy
                });

                try {
                    const { resource: createdLesson } = await lessonsContainer.items.create(newLesson);
                    context.log('Lesson created successfully:', createdLesson.id);

                    return {
                        status: 201,
                        headers: corsHeaders,
                        jsonBody: { 
                            success: true, 
                            lesson: createdLesson 
                        }
                    };
                } catch (createError) {
                    context.log.error('Failed to create lesson in Cosmos DB:', createError);
                    throw createError;
                }

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
                try {
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
                } catch (updateError) {
                    context.log.error('Failed to update lesson:', updateError);
                    throw updateError;
                }

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
                try {
                    await lessonsContainer.item(lesson.id, lesson.id).delete();

                    return {
                        status: 200,
                        headers: corsHeaders,
                        jsonBody: { 
                            success: true, 
                            message: 'Lesson deleted successfully' 
                        }
                    };
                } catch (deleteError) {
                    context.log.error('Failed to delete lesson:', deleteError);
                    throw deleteError;
                }

            default:
                context.log.error('Invalid action received:', action);
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: `Invalid action: ${action}` }
                };
        }

    } catch (error) {
        context.log.error('Lessons API error details:', {
            message: error.message,
            stack: error.stack,
            code: error.code
        });
        
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { 
                success: false, 
                error: 'Internal server error',
                details: error.message,
                code: error.code
            }
        };
    }
};