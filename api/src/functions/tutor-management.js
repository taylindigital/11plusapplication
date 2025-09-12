const { CosmosClient } = require('@azure/cosmos');

let cosmosClient, database, tutorsContainer, usersContainer, organizationsContainer, invitationsContainer, homeworkContainer, homeworkAssignmentsContainer;

// Initialize Cosmos DB
function initializeCosmosDB() {
    if (!cosmosClient) {
        cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY,
        });
        database = cosmosClient.database('TutorPortal');
        tutorsContainer = database.container('Tutors');
        usersContainer = database.container('Users');
        organizationsContainer = database.container('Organizations');
        invitationsContainer = database.container('Invitations');
        homeworkContainer = database.container('Homework');
        homeworkAssignmentsContainer = database.container('HomeworkAssignments');
    }
}

module.exports = async function (request, context) {
    context.log('Tutor Management API called');

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

        const { action, tutorEmail, studentData, userEmail } = body || {};

        context.log('Request:', { action, tutorEmail: !!tutorEmail, userEmail: !!userEmail });

        if (!userEmail) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'User email required' }
            };
        }

        // Verify tutor permissions
        const tutorPermissions = await verifyTutorPermissions(userEmail);
        if (!tutorPermissions.isTutor) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { 
                    success: false, 
                    error: 'Tutor access required',
                    reason: tutorPermissions.reason 
                }
            };
        }

        switch (action) {
            case 'get-students':
                return await getTutorStudents(userEmail, context, corsHeaders);

            case 'add-student':
                if (!studentData) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Student data required' }
                    };
                }
                return await addNewStudent(userEmail, studentData, context, corsHeaders);

            case 'update-student':
                return await updateStudent(userEmail, studentData, context, corsHeaders);

            case 'remove-student':
                return await removeStudent(userEmail, studentData.studentEmail, context, corsHeaders);

            case 'get-dashboard':
                return await getTutorDashboard(userEmail, context, corsHeaders);

            case 'migrate-user':
                return await migrateUserToNewSchema(userEmail, body.targetUser, context, corsHeaders);

            case 'get-available-homework':
                return await getAvailableHomework(userEmail, context, corsHeaders);

            case 'assign-homework':
                return await assignHomeworkToStudents(userEmail, body.homeworkData, context, corsHeaders);

            case 'get-student-homework':
                return await getStudentHomeworkAssignments(userEmail, body.studentEmail, context, corsHeaders);

            case 'remove-homework-assignment':
                return await removeHomeworkAssignment(userEmail, body.assignmentData, context, corsHeaders);

            default:
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: `Invalid action: ${action}` }
                };
        }

    } catch (error) {
        context.log('Tutor Management API error:', error);
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

// Verify tutor permissions
async function verifyTutorPermissions(userEmail) {
    try {
        // Check Users container first
        const { resources: users } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: userEmail }]
            })
            .fetchAll();

        if (!users.length) {
            return { isTutor: false, reason: 'User not found' };
        }

        const user = users[0];

        // Check if user has tutor role
        if (user.roles && user.roles.includes('tutor')) {
            return { isTutor: true, user: user };
        }

        // Fallback: Check old isAdmin flag
        if (user.isAdmin) {
            return { isTutor: true, user: user, needsMigration: true };
        }

        return { isTutor: false, reason: 'User does not have tutor permissions' };

    } catch (error) {
        console.error('Permission verification error:', error);
        return { isTutor: false, reason: 'Permission verification failed' };
    }
}

// Get all students assigned to tutor
async function getTutorStudents(tutorEmail, context, corsHeaders) {
    try {
        // Get tutor record
        const { resources: tutors } = await tutorsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: tutorEmail }]
            })
            .fetchAll();

        let studentEmails = [];
        
        if (tutors.length > 0) {
            studentEmails = tutors[0].students || [];
        } else {
            // Fallback: Check Users container for students assigned to this tutor
            const { resources: assignedStudents } = await usersContainer.items
                .query({
                    query: "SELECT * FROM c WHERE c.assignedTutor = @tutorEmail",
                    parameters: [{ name: "@tutorEmail", value: tutorEmail }]
                })
                .fetchAll();
            
            studentEmails = assignedStudents.map(s => s.email);
        }

        // Get detailed student information
        const students = [];
        for (const studentEmail of studentEmails) {
            const { resources: studentData } = await usersContainer.items
                .query({
                    query: "SELECT * FROM c WHERE c.email = @email",
                    parameters: [{ name: "@email", value: studentEmail }]
                })
                .fetchAll();

            if (studentData.length > 0) {
                const student = studentData[0];
                students.push({
                    email: student.email,
                    name: student.name,
                    yearGroup: student.yearGroup,
                    enrollmentDate: student.enrollmentDate,
                    isActive: student.isActive,
                    parentContactEmail: student.profile?.parentContactEmail,
                    lastLoginDate: student.lastLoginDate
                });
            }
        }

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                students: students,
                totalStudents: students.length
            }
        };
    } catch (error) {
        context.log('Get tutor students error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve students' }
        };
    }
}

// Add new student
async function addNewStudent(tutorEmail, studentData, context, corsHeaders) {
    try {
        const studentEmail = studentData.email;
        
        // Check if student already exists
        const { resources: existingUsers } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: studentEmail }]
            })
            .fetchAll();

        if (existingUsers.length > 0) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Student already exists' }
            };
        }

        // Create new student user record
        const newStudent = {
            id: studentEmail,
            email: studentEmail,
            name: studentData.name,
            roles: ['student'],
            assignedTutor: tutorEmail,
            organization: studentData.organization || 'BrightStars-NorthLondon',
            yearGroup: studentData.yearGroup,
            enrollmentDate: new Date().toISOString(),
            isActive: true,
            profile: {
                parentContactEmail: studentData.parentEmail,
                dateOfBirth: studentData.dateOfBirth,
                emergencyContact: studentData.emergencyContact
            },
            gdprConsent: {
                dataProcessing: false,
                progressTracking: false,
                parentAccess: false
            },
            createdDate: new Date().toISOString(),
            lastLoginDate: null
        };

        // Create the student user
        const { resource: createdStudent } = await usersContainer.items.create(newStudent);

        // Update tutor's student list
        await updateTutorStudentsList(tutorEmail, studentEmail, 'add');

        return {
            status: 201,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                student: createdStudent,
                message: 'Student added successfully'
            }
        };
    } catch (error) {
        context.log('Add student error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to add student' }
        };
    }
}

// Update tutor's students list
async function updateTutorStudentsList(tutorEmail, studentEmail, operation) {
    try {
        // Get or create tutor record
        const { resources: tutors } = await tutorsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: tutorEmail }]
            })
            .fetchAll();

        let tutorRecord;
        
        if (tutors.length > 0) {
            tutorRecord = tutors[0];
        } else {
            // Create new tutor record
            tutorRecord = {
                id: tutorEmail,
                email: tutorEmail,
                name: 'Tutor', // Will be updated when they log in
                role: 'tutor',
                organization: 'BrightStars-NorthLondon',
                students: [],
                permissions: [
                    'manage_students',
                    'assign_homework',
                    'grade_assignments',
                    'view_progress',
                    'send_invitations'
                ],
                createdDate: new Date().toISOString(),
                isActive: true,
                preferences: {
                    emailNotifications: true,
                    dashboardView: 'grid'
                }
            };
        }

        // Update students list
        if (operation === 'add') {
            if (!tutorRecord.students.includes(studentEmail)) {
                tutorRecord.students.push(studentEmail);
            }
        } else if (operation === 'remove') {
            tutorRecord.students = tutorRecord.students.filter(email => email !== studentEmail);
        }

        // Save tutor record
        if (tutors.length > 0) {
            await tutorsContainer.item(tutorEmail, tutorEmail).replace(tutorRecord);
        } else {
            await tutorsContainer.items.create(tutorRecord);
        }

    } catch (error) {
        console.error('Update tutor students list error:', error);
        throw error;
    }
}

// Update student information
async function updateStudent(tutorEmail, studentData, context, corsHeaders) {
    try {
        const studentEmail = studentData.email;
        
        // Verify tutor has access to this student
        const hasAccess = await verifyTutorStudentAccess(tutorEmail, studentEmail);
        if (!hasAccess) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Access denied to this student' }
            };
        }

        // Update student record
        const { resource: existingStudent } = await usersContainer.item(studentEmail, studentEmail).read();
        
        const updatedStudent = {
            ...existingStudent,
            name: studentData.name || existingStudent.name,
            yearGroup: studentData.yearGroup || existingStudent.yearGroup,
            isActive: studentData.isActive !== undefined ? studentData.isActive : existingStudent.isActive,
            profile: {
                ...existingStudent.profile,
                parentContactEmail: studentData.parentEmail || existingStudent.profile?.parentContactEmail,
                dateOfBirth: studentData.dateOfBirth || existingStudent.profile?.dateOfBirth,
                emergencyContact: studentData.emergencyContact || existingStudent.profile?.emergencyContact
            },
            updatedDate: new Date().toISOString()
        };

        const { resource: updatedStudentRecord } = await usersContainer
            .item(studentEmail, studentEmail)
            .replace(updatedStudent);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                student: updatedStudentRecord,
                message: 'Student updated successfully'
            }
        };
    } catch (error) {
        context.log('Update student error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to update student' }
        };
    }
}

// Remove student
async function removeStudent(tutorEmail, studentEmail, context, corsHeaders) {
    try {
        // Verify tutor has access to this student
        const hasAccess = await verifyTutorStudentAccess(tutorEmail, studentEmail);
        if (!hasAccess) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Access denied to this student' }
            };
        }

        // Remove from tutor's student list
        await updateTutorStudentsList(tutorEmail, studentEmail, 'remove');

        // Deactivate student (don't delete, for data integrity)
        const { resource: existingStudent } = await usersContainer.item(studentEmail, studentEmail).read();
        const deactivatedStudent = {
            ...existingStudent,
            isActive: false,
            assignedTutor: null,
            deactivatedDate: new Date().toISOString(),
            deactivatedBy: tutorEmail
        };

        await usersContainer.item(studentEmail, studentEmail).replace(deactivatedStudent);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                message: 'Student removed successfully'
            }
        };
    } catch (error) {
        context.log('Remove student error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to remove student' }
        };
    }
}

// Verify tutor has access to specific student
async function verifyTutorStudentAccess(tutorEmail, studentEmail) {
    try {
        const { resources: students } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @studentEmail AND c.assignedTutor = @tutorEmail",
                parameters: [
                    { name: "@studentEmail", value: studentEmail },
                    { name: "@tutorEmail", value: tutorEmail }
                ]
            })
            .fetchAll();

        return students.length > 0;
    } catch (error) {
        console.error('Verify tutor student access error:', error);
        return false;
    }
}

// Get tutor dashboard data
async function getTutorDashboard(tutorEmail, context, corsHeaders) {
    try {
        const studentsResult = await getTutorStudents(tutorEmail, context, corsHeaders);
        const students = studentsResult.jsonBody.students;

        // Calculate dashboard metrics
        const metrics = {
            totalStudents: students.length,
            activeStudents: students.filter(s => s.isActive).length,
            year4Students: students.filter(s => s.yearGroup === 'year4').length,
            year5Students: students.filter(s => s.yearGroup === 'year5').length,
            recentLogins: students.filter(s => {
                if (!s.lastLoginDate) return false;
                const lastLogin = new Date(s.lastLoginDate);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return lastLogin > weekAgo;
            }).length
        };

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                students: students,
                metrics: metrics
            }
        };
    } catch (error) {
        context.log('Get tutor dashboard error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve dashboard data' }
        };
    }
}

// Migrate existing user to new schema
async function migrateUserToNewSchema(requestingUser, targetUser, context, corsHeaders) {
    try {
        const { resources: users } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: targetUser.email }]
            })
            .fetchAll();

        if (!users.length) {
            return {
                status: 404,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'User not found' }
            };
        }

        const user = users[0];
        
        // Determine roles based on existing flags
        let roles = [];
        if (user.isAdmin) roles.push('tutor');
        if (user.children && user.children.length > 0) roles.push('parent');
        if (!user.isAdmin) roles.push('student');

        // Update user with new schema
        const migratedUser = {
            ...user,
            roles: roles,
            assignedTutor: targetUser.assignedTutor || null,
            organization: targetUser.organization || 'BrightStars-NorthLondon',
            yearGroup: targetUser.yearGroup || (user.isAdmin ? null : 'year5'),
            enrollmentDate: user.createdDate,
            profile: {
                parentContactEmail: targetUser.parentEmail,
                dateOfBirth: targetUser.dateOfBirth,
                emergencyContact: targetUser.emergencyContact
            },
            migratedDate: new Date().toISOString(),
            migratedBy: requestingUser
        };

        const { resource: updatedUser } = await usersContainer
            .item(user.email, user.email)
            .replace(migratedUser);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                user: updatedUser,
                message: 'User migrated successfully'
            }
        };
    } catch (error) {
        context.log('Migrate user error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to migrate user' }
        };
    }
}

// ============================================
// HOMEWORK ASSIGNMENT FUNCTIONS
// ============================================

// Get available homework items for assignment
async function getAvailableHomework(tutorEmail, context, corsHeaders) {
    try {
        // Get all homework items (this could be filtered by subject/week later)
        const { resources: homework } = await homeworkContainer.items
            .query({
                query: "SELECT * FROM c ORDER BY c.subject, c.week, c.title"
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
        context.log('Get available homework error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve homework' }
        };
    }
}

// Assign homework to selected students
async function assignHomeworkToStudents(tutorEmail, homeworkData, context, corsHeaders) {
    try {
        const { homeworkIds, studentEmails, dueDate, notes } = homeworkData;

        if (!homeworkIds || !studentEmails || !homeworkIds.length || !studentEmails.length) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Homework IDs and student emails required' }
            };
        }

        const assignments = [];

        // Create homework assignments for each student and homework combination
        for (const homeworkId of homeworkIds) {
            for (const studentEmail of studentEmails) {
                const assignmentId = `hw_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                
                const assignment = {
                    id: assignmentId,
                    homeworkId: homeworkId,
                    studentEmail: studentEmail,
                    tutorEmail: tutorEmail,
                    assignedDate: new Date().toISOString(),
                    dueDate: dueDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Default 7 days
                    status: 'assigned',
                    notes: notes || '',
                    submittedDate: null,
                    completedDate: null,
                    grade: null,
                    feedback: null
                };

                assignments.push(assignment);
            }
        }

        // Batch create all assignments
        const createdAssignments = [];
        for (const assignment of assignments) {
            const { resource: createdAssignment } = await homeworkAssignmentsContainer.items.create(assignment);
            createdAssignments.push(createdAssignment);
        }

        return {
            status: 201,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                assignments: createdAssignments,
                message: `Successfully assigned ${homeworkIds.length} homework items to ${studentEmails.length} students`
            }
        };
    } catch (error) {
        context.log('Assign homework error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to assign homework' }
        };
    }
}

// Get homework assignments for a specific student
async function getStudentHomeworkAssignments(tutorEmail, studentEmail, context, corsHeaders) {
    try {
        // Get assignments for the student
        const { resources: assignments } = await homeworkAssignmentsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.studentEmail = @studentEmail AND c.tutorEmail = @tutorEmail ORDER BY c.assignedDate DESC",
                parameters: [
                    { name: "@studentEmail", value: studentEmail },
                    { name: "@tutorEmail", value: tutorEmail }
                ]
            })
            .fetchAll();

        // Get homework details for each assignment
        const assignmentsWithDetails = [];
        for (const assignment of assignments) {
            try {
                const { resource: homework } = await homeworkContainer.item(assignment.homeworkId, assignment.homeworkId).read();
                assignmentsWithDetails.push({
                    ...assignment,
                    homework: homework
                });
            } catch (homeworkError) {
                // If homework item not found, include assignment without homework details
                assignmentsWithDetails.push({
                    ...assignment,
                    homework: null
                });
            }
        }

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                assignments: assignmentsWithDetails
            }
        };
    } catch (error) {
        context.log('Get student homework error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve student homework' }
        };
    }
}

// Remove homework assignment
async function removeHomeworkAssignment(tutorEmail, assignmentData, context, corsHeaders) {
    try {
        const { assignmentId } = assignmentData;

        if (!assignmentId) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Assignment ID required' }
            };
        }

        // Verify the assignment belongs to this tutor
        const { resource: assignment } = await homeworkAssignmentsContainer.item(assignmentId, assignmentId).read();
        
        if (assignment.tutorEmail !== tutorEmail) {
            return {
                status: 403,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'You can only remove your own assignments' }
            };
        }

        // Delete the assignment
        await homeworkAssignmentsContainer.item(assignmentId, assignmentId).delete();

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                message: 'Homework assignment removed successfully'
            }
        };
    } catch (error) {
        context.log('Remove homework assignment error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to remove homework assignment' }
        };
    }
}