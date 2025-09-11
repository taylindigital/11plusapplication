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
    context.log('Get content API called');

    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

        // Parse query parameters
        const url = new URL(request.url);
        const contentType = url.searchParams.get('type'); // 'year-plan', 'lesson-material', 'extra-resource', 'all'
        const yearGroup = url.searchParams.get('yearGroup'); // 'year4', 'year5'
        const subject = url.searchParams.get('subject'); // 'maths', 'english', 'general'
        const category = url.searchParams.get('category'); // 'worksheet', 'homework', etc.
        const limit = parseInt(url.searchParams.get('limit')) || 50;
        const isAdmin = url.searchParams.get('isAdmin') === 'true';

        context.log('Query parameters:', { contentType, yearGroup, subject, category, limit, isAdmin });

        // Build query
        let query = "SELECT * FROM c WHERE c.visible = true";
        const parameters = [];

        // Add filters based on parameters
        if (contentType && contentType !== 'all') {
            query += " AND c.type = @contentType";
            parameters.push({ name: "@contentType", value: contentType });
        }

        if (yearGroup) {
            query += " AND c.yearGroup = @yearGroup";
            parameters.push({ name: "@yearGroup", value: yearGroup });
        }

        if (subject && subject !== 'all') {
            query += " AND c.subject = @subject";
            parameters.push({ name: "@subject", value: subject });
        }

        if (category && category !== 'all') {
            query += " AND c.category = @category";
            parameters.push({ name: "@category", value: category });
        }

        // Only show published content to non-admin users
        if (!isAdmin) {
            query += " AND c.published = true";
        }

        // Order by creation date (newest first)
        query += " ORDER BY c.createdDate DESC";

        context.log('Final query:', query);
        context.log('Parameters:', parameters);

        const querySpec = {
            query: query,
            parameters: parameters
        };

        const { resources: content } = await lessonsContainer.items
            .query(querySpec, { maxItemCount: limit })
            .fetchAll();

        context.log(`Found ${content?.length || 0} content items`);

        // Organize content by type for easier frontend consumption
        const organizedContent = {
            yearPlan: [],
            lessonMaterials: [],
            extraResources: [],
            all: content || []
        };

        if (content) {
            content.forEach(item => {
                switch (item.type) {
                    case 'year-plan':
                        organizedContent.yearPlan.push(item);
                        break;
                    case 'lesson-material':
                        organizedContent.lessonMaterials.push(item);
                        break;
                    case 'extra-resource':
                        organizedContent.extraResources.push(item);
                        break;
                }
            });
        }

        // Add summary statistics
        const summary = {
            total: content?.length || 0,
            yearPlan: organizedContent.yearPlan.length,
            lessonMaterials: organizedContent.lessonMaterials.length,
            extraResources: organizedContent.extraResources.length,
            byYearGroup: {
                year4: content?.filter(item => item.yearGroup === 'year4').length || 0,
                year5: content?.filter(item => item.yearGroup === 'year5').length || 0
            },
            bySubject: {
                maths: content?.filter(item => item.subject === 'maths').length || 0,
                english: content?.filter(item => item.subject === 'english').length || 0,
                general: content?.filter(item => item.subject === 'general').length || 0,
                other: content?.filter(item => !['maths', 'english', 'general'].includes(item.subject)).length || 0
            }
        };

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                content: organizedContent,
                summary: summary,
                query: {
                    contentType,
                    yearGroup,
                    subject,
                    category,
                    limit,
                    isAdmin
                }
            }
        };

    } catch (error) {
        context.log.error('Get content API error:', error);
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