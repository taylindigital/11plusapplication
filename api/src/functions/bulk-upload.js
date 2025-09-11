const { BlobServiceClient } = require("@azure/storage-blob");
const { CosmosClient } = require('@azure/cosmos');
const XLSX = require('xlsx');

let cosmosClient, database, lessonsContainer;

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
    context.log('Bulk upload request started');

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
        // Parse form data
        const formData = await request.formData();
        const isAdmin = formData.get('isAdmin') === 'true';
        const userEmail = formData.get('userEmail');
        const contentType = formData.get('contentType'); // 'year-plan', 'maths-syllabus', 'english-syllabus', 'resources'
        const yearGroup = formData.get('yearGroup'); // 'year4' or 'year5'

        context.log('Bulk upload params:', { isAdmin, userEmail, contentType, yearGroup });

        // Check admin access
        if (!isAdmin) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { success: false, error: "Admin access required" }
            };
        }

        if (!userEmail) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: "User email required" }
            };
        }

        // Initialize services
        initializeCosmosDB();
        
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        if (!connectionString) {
            return {
                status: 500,
                headers: corsHeaders,
                jsonBody: { success: false, error: "Storage not configured" }
            };
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerName = "lesson-files";
        const containerClient = blobServiceClient.getContainerClient(containerName);
        await containerClient.createIfNotExists();

        // Process uploaded files
        const uploadResults = [];
        const createdLessons = [];
        
        // Handle different content types
        switch (contentType) {
            case 'year-plan':
                const planFile = formData.get('planFile');
                if (planFile && planFile.name.endsWith('.xlsx')) {
                    const result = await processYearPlanSpreadsheet(planFile, yearGroup, userEmail, context, containerClient, lessonsContainer);
                    uploadResults.push(result);
                    createdLessons.push(...result.lessons);
                }
                break;

            case 'bulk-lessons':
                // Handle multiple lesson files
                const files = [];
                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('lesson-') && value instanceof File) {
                        files.push(value);
                    }
                }
                
                for (const file of files) {
                    const result = await processLessonFile(file, contentType, yearGroup, userEmail, context, containerClient, lessonsContainer);
                    uploadResults.push(result);
                    if (result.lesson) {
                        createdLessons.push(result.lesson);
                    }
                }
                break;

            case 'resources':
                // Handle resource files
                const resourceFiles = [];
                for (const [key, value] of formData.entries()) {
                    if (key.startsWith('resource-') && value instanceof File) {
                        resourceFiles.push(value);
                    }
                }
                
                for (const file of resourceFiles) {
                    const result = await processResourceFile(file, yearGroup, userEmail, context, containerClient);
                    uploadResults.push(result);
                }
                break;

            default:
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: `Invalid content type: ${contentType}` }
                };
        }

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: {
                success: true,
                message: `Successfully processed ${uploadResults.length} items`,
                results: uploadResults,
                lessonsCreated: createdLessons.length
            }
        };

    } catch (error) {
        context.log('Bulk upload error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: {
                success: false,
                error: "Bulk upload failed",
                details: error.message
            }
        };
    }
};

async function processYearPlanSpreadsheet(file, yearGroup, userEmail, context, containerClient, lessonsContainer) {
    try {
        // Upload spreadsheet file
        const fileName = `year-plans/${yearGroup}/${Date.now()}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        const buffer = await file.arrayBuffer();
        await blockBlobClient.upload(buffer, buffer.byteLength);

        // Parse Excel file
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);

        context.log(`Processing ${data.length} weeks from year plan`);

        const lessons = [];
        
        // Process each week from the spreadsheet
        for (const row of data) {
            if (row.Week && row.Topic) {
                const lesson = {
                    id: `${yearGroup}-week-${row.Week}-${Date.now()}`,
                    title: `Week ${row.Week}: ${row.Topic}`,
                    description: row.Description || '',
                    yearGroup: yearGroup,
                    week: parseInt(row.Week),
                    subject: row.Subject || 'Mixed',
                    type: 'year-plan',
                    content: {
                        topic: row.Topic,
                        objectives: row.Objectives ? row.Objectives.split(';') : [],
                        activities: row.Activities ? row.Activities.split(';') : [],
                        resources: row.Resources ? row.Resources.split(';') : [],
                        homework: row.Homework || ''
                    },
                    createdDate: new Date().toISOString(),
                    updatedDate: new Date().toISOString(),
                    createdBy: userEmail,
                    published: true
                };

                const { resource: createdLesson } = await lessonsContainer.items.create(lesson);
                lessons.push(createdLesson);
            }
        }

        return {
            success: true,
            type: 'year-plan',
            fileName: fileName,
            fileUrl: blockBlobClient.url,
            lessonsCreated: lessons.length,
            lessons: lessons
        };

    } catch (error) {
        context.log('Year plan processing error:', error);
        return {
            success: false,
            type: 'year-plan',
            error: error.message
        };
    }
}

async function processLessonFile(file, contentType, yearGroup, userEmail, context, containerClient, lessonsContainer) {
    try {
        // Determine subject from filename or content type
        const subject = file.name.toLowerCase().includes('math') ? 'maths' : 
                      file.name.toLowerCase().includes('english') ? 'english' : 'general';

        // Upload file
        const fileName = `lessons/${yearGroup}/${subject}/${Date.now()}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        const buffer = await file.arrayBuffer();
        await blockBlobClient.upload(buffer, buffer.byteLength);

        // Create lesson record
        const lesson = {
            id: `${yearGroup}-${subject}-${Date.now()}`,
            title: file.name.replace(/\.[^/.]+$/, ""), // Remove extension
            description: `Lesson material uploaded for ${yearGroup} ${subject}`,
            yearGroup: yearGroup,
            subject: subject,
            type: 'lesson-file',
            fileUrl: blockBlobClient.url,
            fileName: fileName,
            fileType: file.type,
            fileSize: file.size,
            createdDate: new Date().toISOString(),
            updatedDate: new Date().toISOString(),
            createdBy: userEmail,
            published: true
        };

        const { resource: createdLesson } = await lessonsContainer.items.create(lesson);

        return {
            success: true,
            type: 'lesson-file',
            fileName: fileName,
            fileUrl: blockBlobClient.url,
            lesson: createdLesson
        };

    } catch (error) {
        context.log('Lesson file processing error:', error);
        return {
            success: false,
            type: 'lesson-file',
            fileName: file.name,
            error: error.message
        };
    }
}

async function processResourceFile(file, yearGroup, userEmail, context, containerClient) {
    try {
        // Upload resource file
        const fileName = `resources/${yearGroup}/${Date.now()}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        const buffer = await file.arrayBuffer();
        await blockBlobClient.upload(buffer, buffer.byteLength);

        return {
            success: true,
            type: 'resource',
            fileName: fileName,
            fileUrl: blockBlobClient.url,
            fileType: file.type,
            fileSize: file.size
        };

    } catch (error) {
        context.log('Resource file processing error:', error);
        return {
            success: false,
            type: 'resource',
            fileName: file.name,
            error: error.message
        };
    }
}