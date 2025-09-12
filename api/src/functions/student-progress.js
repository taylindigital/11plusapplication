const { CosmosClient } = require('@azure/cosmos');

let cosmosClient, database, progressContainer, usersContainer;

// Initialize Cosmos DB
function initializeCosmosDB() {
    if (!cosmosClient) {
        cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY,
        });
        database = cosmosClient.database('TutorPortal');
        progressContainer = database.container('StudentProgress');
        usersContainer = database.container('Users');
    }
}

module.exports = async function (request, context) {
    context.log('Student Progress API called');

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
            context.log('Failed to parse JSON:', jsonError);
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invalid JSON in request body' }
            };
        }

        const { action, userEmail, studentId, progressData, isParent, isTeacher } = body || {};

        context.log('Request:', { action, userEmail: !!userEmail, studentId, isParent, isTeacher });

        if (!userEmail) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'User email required' }
            };
        }

        // Verify user permissions and GDPR consent
        const userPermissions = await verifyUserPermissions(userEmail, studentId, isParent, isTeacher);
        if (!userPermissions.hasAccess) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { 
                    success: false, 
                    error: 'Access denied', 
                    reason: userPermissions.reason 
                }
            };
        }

        switch (action) {
            case 'get-progress':
                return await getStudentProgress(studentId || userEmail, context, corsHeaders);

            case 'update-progress':
                if (!isTeacher) {
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Teacher access required' }
                    };
                }
                return await updateStudentProgress(studentId, progressData, userEmail, context, corsHeaders);

            case 'get-homework':
                return await getHomeworkAssignments(studentId || userEmail, context, corsHeaders);

            case 'submit-homework':
                return await submitHomework(studentId || userEmail, progressData, context, corsHeaders);

            case 'get-parent-dashboard':
                if (!isParent) {
                    return {
                        status: 403,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Parent access required' }
                    };
                }
                return await getParentDashboard(userEmail, context, corsHeaders);

            default:
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: `Invalid action: ${action}` }
                };
        }

    } catch (error) {
        context.log('Student Progress API error:', error);
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

// GDPR-compliant permission verification
async function verifyUserPermissions(userEmail, studentId, isParent, isTeacher) {
    try {
        // Get user data from Users container
        const { resources: users } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: userEmail }]
            })
            .fetchAll();

        if (!users.length) {
            return { hasAccess: false, reason: 'User not found' };
        }

        const user = users[0];

        // Check GDPR consent
        if (!user.gdprConsent || !user.gdprConsent.dataProcessing) {
            return { 
                hasAccess: false, 
                reason: 'GDPR consent required for data processing' 
            };
        }

        // Teachers can access all student data (with consent)
        if (isTeacher && user.isAdmin) {
            return { hasAccess: true, role: 'teacher' };
        }

        // Parents can only access their own children's data
        if (isParent) {
            if (!user.children || !user.children.includes(studentId)) {
                return { 
                    hasAccess: false, 
                    reason: 'Parent can only access own children data' 
                };
            }
            return { hasAccess: true, role: 'parent' };
        }

        // Students can only access their own data
        if (studentId === userEmail || !studentId) {
            return { hasAccess: true, role: 'student' };
        }

        return { hasAccess: false, reason: 'Insufficient permissions' };

    } catch (error) {
        console.error('Permission verification error:', error);
        return { hasAccess: false, reason: 'Permission verification failed' };
    }
}

// Get student progress data
async function getStudentProgress(studentId, context, corsHeaders) {
    try {
        const { resources: progressRecords } = await progressContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.studentId = @studentId ORDER BY c.createdDate DESC",
                parameters: [{ name: "@studentId", value: studentId }]
            })
            .fetchAll();

        // Calculate progress metrics
        const metrics = calculateProgressMetrics(progressRecords);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                progress: progressRecords,
                metrics: metrics
            }
        };
    } catch (error) {
        context.log('Get progress error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve progress' }
        };
    }
}

// Update student progress (teacher only)
async function updateStudentProgress(studentId, progressData, teacherEmail, context, corsHeaders) {
    try {
        const progressRecord = {
            id: Date.now().toString(),
            studentId: studentId,
            ...progressData,
            createdDate: new Date().toISOString(),
            createdBy: teacherEmail,
            dataProcessingConsent: true // GDPR compliance
        };

        const { resource: createdRecord } = await progressContainer.items.create(progressRecord);

        return {
            status: 201,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                progress: createdRecord 
            }
        };
    } catch (error) {
        context.log('Update progress error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to update progress' }
        };
    }
}

// Get homework assignments for student
async function getHomeworkAssignments(studentId, context, corsHeaders) {
    try {
        const { resources: homework } = await progressContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.studentId = @studentId AND c.type = 'homework' ORDER BY c.dueDate ASC",
                parameters: [{ name: "@studentId", value: studentId }]
            })
            .fetchAll();

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                homework: homework
            }
        };
    } catch (error) {
        context.log('Get homework error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve homework' }
        };
    }
}

// Submit homework (student)
async function submitHomework(studentId, homeworkData, context, corsHeaders) {
    try {
        const submission = {
            id: Date.now().toString(),
            studentId: studentId,
            type: 'homework_submission',
            ...homeworkData,
            submittedDate: new Date().toISOString(),
            status: 'submitted'
        };

        const { resource: createdSubmission } = await progressContainer.items.create(submission);

        return {
            status: 201,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                submission: createdSubmission 
            }
        };
    } catch (error) {
        context.log('Submit homework error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to submit homework' }
        };
    }
}

// Get parent dashboard data
async function getParentDashboard(parentEmail, context, corsHeaders) {
    try {
        // Get parent's children data
        const { resources: users } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: parentEmail }]
            })
            .fetchAll();

        if (!users.length || !users[0].children) {
            return {
                status: 200,
                headers: corsHeaders,
                jsonBody: { 
                    success: true, 
                    children: [],
                    message: 'No children found for this parent account'
                }
            };
        }

        const parent = users[0];
        const childrenData = [];

        // Get progress data for each child
        for (const childId of parent.children) {
            const { resources: childProgress } = await progressContainer.items
                .query({
                    query: "SELECT * FROM c WHERE c.studentId = @studentId ORDER BY c.createdDate DESC",
                    parameters: [{ name: "@studentId", value: childId }]
                })
                .fetchAll();

            const metrics = calculateProgressMetrics(childProgress);
            childrenData.push({
                studentId: childId,
                progress: childProgress.slice(0, 10), // Last 10 records
                metrics: metrics
            });
        }

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                children: childrenData
            }
        };
    } catch (error) {
        context.log('Get parent dashboard error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve parent dashboard' }
        };
    }
}

// Calculate progress metrics
function calculateProgressMetrics(progressRecords) {
    if (!progressRecords.length) {
        return {
            totalAssignments: 0,
            completedAssignments: 0,
            averageScore: 0,
            improvementTrend: 'neutral',
            lastActivity: null
        };
    }

    const assignments = progressRecords.filter(r => r.type === 'assignment' || r.type === 'homework');
    const completed = assignments.filter(a => a.status === 'completed' || a.status === 'submitted');
    const scores = assignments.filter(a => a.score !== undefined).map(a => a.score);
    
    const averageScore = scores.length > 0 ? 
        scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;

    // Calculate improvement trend
    let improvementTrend = 'neutral';
    if (scores.length >= 3) {
        const recent = scores.slice(0, Math.floor(scores.length / 2));
        const older = scores.slice(Math.floor(scores.length / 2));
        const recentAvg = recent.reduce((sum, s) => sum + s, 0) / recent.length;
        const olderAvg = older.reduce((sum, s) => sum + s, 0) / older.length;
        
        if (recentAvg > olderAvg + 5) improvementTrend = 'improving';
        else if (recentAvg < olderAvg - 5) improvementTrend = 'declining';
    }

    return {
        totalAssignments: assignments.length,
        completedAssignments: completed.length,
        averageScore: Math.round(averageScore * 10) / 10,
        improvementTrend: improvementTrend,
        lastActivity: progressRecords[0]?.createdDate || null
    };
}