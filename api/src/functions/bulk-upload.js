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
                    const result = await processLessonFile(file, 'bulk-lessons', yearGroup, userEmail, context, containerClient, lessonsContainer);
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
                    const result = await processResourceFile(file, yearGroup, userEmail, context, containerClient, lessonsContainer);
                    uploadResults.push(result);
                    if (result.resource) {
                        createdLessons.push(result.resource);
                    }
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
        context.log(`Processing year plan for ${yearGroup}`);
        
        // Upload spreadsheet file to blob storage
        const timestamp = Date.now();
        const fileName = `year-plans/${yearGroup}/${timestamp}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        const buffer = await file.arrayBuffer();
        
        context.log(`Uploading file: ${fileName}`);
        await blockBlobClient.upload(buffer, buffer.byteLength);
        
        const fileUrl = blockBlobClient.url;
        context.log(`File uploaded successfully: ${fileUrl}`);

        // Parse Excel file for lesson data
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(worksheet);

        context.log(`Found ${data.length} rows in spreadsheet`);

        const lessons = [];
        let successCount = 0;
        let errorCount = 0;
        
        // Process each week from the spreadsheet
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            
            if (row.Week && row.Topic) {
                try {
                    const lessonId = `${yearGroup}-week-${row.Week}-${timestamp}-${i}`;
                    const lesson = {
                        id: lessonId,
                        title: `Week ${row.Week}: ${row.Topic}`,
                        description: row.Description || `Year plan content for ${yearGroup} Week ${row.Week}`,
                        yearGroup: yearGroup,
                        week: parseInt(row.Week) || i + 1,
                        subject: row.Subject || 'Mixed',
                        type: 'year-plan',
                        category: 'planning',
                        sourceFile: fileName,
                        sourceFileUrl: fileUrl,
                        content: {
                            topic: row.Topic,
                            objectives: row.Objectives ? row.Objectives.split(';').map(s => s.trim()).filter(s => s) : [],
                            activities: row.Activities ? row.Activities.split(';').map(s => s.trim()).filter(s => s) : [],
                            resources: row.Resources ? row.Resources.split(';').map(s => s.trim()).filter(s => s) : [],
                            homework: row.Homework || '',
                            assessment: row.Assessment || '',
                            notes: row.Notes || ''
                        },
                        tags: ['year-plan', yearGroup, row.Subject || 'mixed'],
                        createdDate: new Date().toISOString(),
                        updatedDate: new Date().toISOString(),
                        createdBy: userEmail,
                        published: true,
                        visible: true
                    };

                    const { resource: createdLesson } = await lessonsContainer.items.create(lesson);
                    lessons.push(createdLesson);
                    successCount++;
                    
                    context.log(`Created lesson for Week ${row.Week}: ${row.Topic}`);
                    
                } catch (lessonError) {
                    context.log(`Error creating lesson for Week ${row.Week}:`, lessonError);
                    errorCount++;
                }
            }
        }

        context.log(`Year plan processing complete: ${successCount} success, ${errorCount} errors`);

        return {
            success: true,
            type: 'year-plan',
            fileName: fileName,
            fileUrl: fileUrl,
            lessonsCreated: successCount,
            lessonsError: errorCount,
            totalRows: data.length,
            lessons: lessons
        };

    } catch (error) {
        context.log('Year plan processing error:', error);
        return {
            success: false,
            type: 'year-plan',
            fileName: file.name,
            error: error.message,
            details: error.stack
        };
    }
}

async function processLessonFile(file, uploadType, yearGroup, userEmail, context, containerClient, lessonsContainer) {
    try {
        context.log(`Processing lesson file: ${file.name} for ${yearGroup}`);
        
        // Enhanced subject detection from filename
        const fileName = file.name.toLowerCase();
        let subject = 'general';
        let category = 'lesson';
        
        // Detect subject from filename patterns
        if (fileName.includes('math') || fileName.includes('maths') || fileName.includes('arithmetic') || fileName.includes('number')) {
            subject = 'maths';
        } else if (fileName.includes('english') || fileName.includes('comprehension') || fileName.includes('writing') || fileName.includes('grammar')) {
            subject = 'english';
        } else if (fileName.includes('verbal') || fileName.includes('reasoning')) {
            subject = 'verbal-reasoning';
        } else if (fileName.includes('non-verbal') || fileName.includes('spatial')) {
            subject = 'non-verbal-reasoning';
        }
        
        // Detect content type from filename
        if (fileName.includes('worksheet') || fileName.includes('practice')) {
            category = 'worksheet';
        } else if (fileName.includes('homework') || fileName.includes('hw')) {
            category = 'homework';
        } else if (fileName.includes('test') || fileName.includes('exam') || fileName.includes('assessment')) {
            category = 'assessment';
        } else if (fileName.includes('answer') || fileName.includes('solution') || fileName.includes('marking')) {
            category = 'answers';
        }

        const timestamp = Date.now();
        const storagePath = `lessons/${yearGroup}/${subject}/${category}/${timestamp}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
        const buffer = await file.arrayBuffer();
        
        context.log(`Uploading file to: ${storagePath}`);
        await blockBlobClient.upload(buffer, buffer.byteLength);
        
        const fileUrl = blockBlobClient.url;
        context.log(`File uploaded successfully: ${fileUrl}`);

        // Create comprehensive lesson record
        const lessonId = `${yearGroup}-${subject}-${category}-${timestamp}`;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, ' ').replace(/-/g, ' ');
        
        const lesson = {
            id: lessonId,
            title: cleanTitle,
            description: `${category.charAt(0).toUpperCase() + category.slice(1)} material for ${yearGroup} ${subject}`,
            yearGroup: yearGroup,
            subject: subject,
            category: category,
            type: 'lesson-material',
            fileUrl: fileUrl,
            fileName: storagePath,
            originalFileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileSizeFormatted: formatFileSize(file.size),
            fileExtension: file.name.split('.').pop()?.toLowerCase() || '',
            content: {
                description: `Uploaded ${category} for ${subject}`,
                instructions: `This is a ${category} file for ${yearGroup} students studying ${subject}.`,
                difficulty: yearGroup === 'year5' ? 'intermediate' : 'beginner',
                estimatedDuration: category === 'worksheet' ? '30-45 minutes' : category === 'homework' ? '20-30 minutes' : 'varies'
            },
            tags: [subject, category, yearGroup, file.type.split('/')[1] || 'document'],
            metadata: {
                uploadDate: new Date().toISOString(),
                uploadedBy: userEmail,
                processed: true,
                approved: true,
                downloadCount: 0,
                viewCount: 0
            },
            createdDate: new Date().toISOString(),
            updatedDate: new Date().toISOString(),
            createdBy: userEmail,
            published: true,
            visible: true
        };

        context.log(`Creating lesson record: ${lessonId}`);
        const { resource: createdLesson } = await lessonsContainer.items.create(lesson);
        
        context.log(`Lesson created successfully: ${createdLesson.title}`);

        return {
            success: true,
            type: 'lesson-material',
            fileName: storagePath,
            fileUrl: fileUrl,
            subject: subject,
            category: category,
            lesson: createdLesson
        };

    } catch (error) {
        context.log('Lesson file processing error:', error);
        return {
            success: false,
            type: 'lesson-material',
            fileName: file.name,
            error: error.message,
            details: error.stack
        };
    }
}

// Helper function to format file sizes
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function processResourceFile(file, yearGroup, userEmail, context, containerClient, lessonsContainer) {
    try {
        context.log(`Processing resource file: ${file.name} for ${yearGroup}`);
        
        const fileName = file.name.toLowerCase();
        let resourceType = 'general';
        let category = 'resource';
        
        // Detect resource type from filename and file type
        if (fileName.includes('video') || file.type.startsWith('video/')) {
            resourceType = 'video';
            category = 'media';
        } else if (fileName.includes('past') && fileName.includes('paper')) {
            resourceType = 'past-paper';
            category = 'assessment';
        } else if (fileName.includes('reading') || fileName.includes('book')) {
            resourceType = 'reading';
            category = 'literature';
        } else if (fileName.includes('guide') || fileName.includes('help')) {
            resourceType = 'guide';
            category = 'reference';
        } else if (file.type.startsWith('image/')) {
            resourceType = 'image';
            category = 'visual';
        } else if (file.type.includes('pdf')) {
            resourceType = 'document';
            category = 'reference';
        } else if (file.type.includes('audio')) {
            resourceType = 'audio';
            category = 'media';
        }

        const timestamp = Date.now();
        const storagePath = `resources/${yearGroup}/${resourceType}/${timestamp}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(storagePath);
        const buffer = await file.arrayBuffer();
        
        context.log(`Uploading resource to: ${storagePath}`);
        await blockBlobClient.upload(buffer, buffer.byteLength);
        
        const fileUrl = blockBlobClient.url;
        context.log(`Resource uploaded successfully: ${fileUrl}`);

        // Create comprehensive resource record in database
        const resourceId = `${yearGroup}-resource-${resourceType}-${timestamp}`;
        const cleanTitle = file.name.replace(/\.[^/.]+$/, "").replace(/_/g, ' ').replace(/-/g, ' ');
        
        const resourceRecord = {
            id: resourceId,
            title: cleanTitle,
            description: `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} resource for ${yearGroup}`,
            yearGroup: yearGroup,
            subject: 'general', // Resources can be cross-curricular
            category: category,
            resourceType: resourceType,
            type: 'extra-resource',
            fileUrl: fileUrl,
            fileName: storagePath,
            originalFileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileSizeFormatted: formatFileSize(file.size),
            fileExtension: file.name.split('.').pop()?.toLowerCase() || '',
            content: {
                description: `Uploaded ${resourceType} resource`,
                instructions: `This ${resourceType} resource is available for ${yearGroup} students.`,
                usage: getResourceUsageInstructions(resourceType),
                accessibility: 'Available for download by enrolled students'
            },
            tags: [resourceType, category, yearGroup, 'extra-resource', file.type.split('/')[1] || 'document'],
            metadata: {
                uploadDate: new Date().toISOString(),
                uploadedBy: userEmail,
                processed: true,
                approved: true,
                downloadCount: 0,
                viewCount: 0,
                rating: null,
                featured: false
            },
            createdDate: new Date().toISOString(),
            updatedDate: new Date().toISOString(),
            createdBy: userEmail,
            published: true,
            visible: true
        };

        context.log(`Creating resource record: ${resourceId}`);
        const { resource: createdResource } = await lessonsContainer.items.create(resourceRecord);
        
        context.log(`Resource created successfully: ${createdResource.title}`);

        return {
            success: true,
            type: 'extra-resource',
            resourceType: resourceType,
            fileName: storagePath,
            fileUrl: fileUrl,
            fileType: file.type,
            fileSize: file.size,
            resource: createdResource
        };

    } catch (error) {
        context.log('Resource file processing error:', error);
        return {
            success: false,
            type: 'extra-resource',
            fileName: file.name,
            error: error.message,
            details: error.stack
        };
    }
}

// Helper function to get usage instructions for different resource types
function getResourceUsageInstructions(resourceType) {
    switch (resourceType) {
        case 'video':
            return 'Watch this educational video to enhance understanding of the topic.';
        case 'past-paper':
            return 'Use this past paper for exam practice. Time yourself and check answers afterwards.';
        case 'reading':
            return 'Recommended reading to broaden knowledge and improve comprehension skills.';
        case 'guide':
            return 'Reference guide with helpful tips and explanations for complex topics.';
        case 'image':
            return 'Visual aid to support learning and understanding of concepts.';
        case 'audio':
            return 'Listen to this audio content to reinforce learning through auditory means.';
        default:
            return 'Additional resource to support and enhance learning.';
    }
}