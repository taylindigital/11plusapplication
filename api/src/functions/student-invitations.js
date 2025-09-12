const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');

let cosmosClient, database, invitationsContainer, usersContainer, tutorsContainer;

// Initialize Cosmos DB
function initializeCosmosDB() {
    if (!cosmosClient) {
        cosmosClient = new CosmosClient({
            endpoint: process.env.COSMOS_DB_ENDPOINT,
            key: process.env.COSMOS_DB_KEY,
        });
        database = cosmosClient.database('TutorPortal');
        invitationsContainer = database.container('Invitations');
        usersContainer = database.container('Users');
        tutorsContainer = database.container('Tutors');
    }
}

module.exports = async function (request, context) {
    context.log('Student Invitations API called');

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

        const { action, tutorEmail, userEmail, token, invitationData } = body || {};

        context.log('Request:', { action, tutorEmail: !!tutorEmail, userEmail: !!userEmail, token: !!token });

        switch (action) {
            case 'send-invitation':
                if (!tutorEmail || !invitationData) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Tutor email and invitation data required' }
                    };
                }
                return await sendParentInvitation(tutorEmail, invitationData, context, corsHeaders);

            case 'get-invitations':
                if (!tutorEmail) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Tutor email required' }
                    };
                }
                return await getTutorInvitations(tutorEmail, context, corsHeaders);

            case 'process-invitation':
                if (!token) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Invitation token required' }
                    };
                }
                return await processInvitation(token, body.parentDetails, context, corsHeaders);

            case 'validate-token':
                if (!token) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Token required' }
                    };
                }
                return await validateInvitationToken(token, context, corsHeaders);

            case 'resend-invitation':
                if (!body.invitationId) {
                    return {
                        status: 400,
                        headers: corsHeaders,
                        jsonBody: { success: false, error: 'Invitation ID required' }
                    };
                }
                return await resendInvitation(body.invitationId, context, corsHeaders);

            default:
                return {
                    status: 400,
                    headers: corsHeaders,
                    jsonBody: { success: false, error: `Invalid action: ${action}` }
                };
        }

    } catch (error) {
        context.log('Student Invitations API error:', error);
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

// Send parent invitation
async function sendParentInvitation(tutorEmail, invitationData, context, corsHeaders) {
    try {
        // Verify tutor exists
        const { resources: tutors } = await tutorsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: tutorEmail }]
            })
            .fetchAll();

        if (!tutors.length) {
            return {
                status: 404,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Tutor not found' }
            };
        }

        // Generate unique invitation token
        const token = crypto.randomBytes(32).toString('hex');
        const invitationId = `inv_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

        // Create invitation record
        const invitation = {
            id: invitationId,
            token: token,
            tutorEmail: tutorEmail,
            studentEmail: invitationData.studentEmail,
            parentEmail: invitationData.parentEmail,
            studentInfo: {
                firstName: invitationData.firstName,
                lastName: invitationData.lastName,
                yearGroup: invitationData.yearGroup,
                startDate: invitationData.startDate || new Date().toISOString()
            },
            status: 'pending',
            createdDate: new Date().toISOString(),
            sentDate: null,
            expiryDate: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(), // 7 days
            acceptedDate: null,
            emailSent: false,
            remindersSent: 0
        };

        // Save invitation
        const { resource: createdInvitation } = await invitationsContainer.items.create(invitation);

        // Send email (using Azure Communication Services)
        const emailSent = await sendInvitationEmail(createdInvitation, context);
        
        if (emailSent) {
            // Update invitation as sent
            createdInvitation.emailSent = true;
            createdInvitation.sentDate = new Date().toISOString();
            await invitationsContainer.item(invitationId, invitationId).replace(createdInvitation);
        }

        return {
            status: 201,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                invitation: {
                    id: createdInvitation.id,
                    studentEmail: createdInvitation.studentEmail,
                    parentEmail: createdInvitation.parentEmail,
                    status: createdInvitation.status,
                    sentDate: createdInvitation.sentDate,
                    expiryDate: createdInvitation.expiryDate
                },
                emailSent: emailSent,
                message: 'Invitation sent successfully'
            }
        };
    } catch (error) {
        context.log('Send invitation error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to send invitation' }
        };
    }
}

// Send invitation email
async function sendInvitationEmail(invitation, context) {
    try {
        // This is where you'd integrate with Azure Communication Services
        // For now, we'll log the email content and return true
        
        const invitationLink = `${process.env.APP_BASE_URL || 'https://your-domain.com'}/register?token=${invitation.token}`;
        
        const emailContent = {
            to: invitation.parentEmail,
            subject: `Invitation to join ${invitation.studentInfo.firstName}'s learning portal`,
            html: `
                <h2>Welcome to BrightStars Learning Portal</h2>
                <p>You've been invited to access your child's learning progress.</p>
                <p><strong>Student:</strong> ${invitation.studentInfo.firstName} ${invitation.studentInfo.lastName}</p>
                <p><strong>Year Group:</strong> ${invitation.studentInfo.yearGroup}</p>
                <p>Click the link below to create your parent account:</p>
                <a href="${invitationLink}" style="background: #8B5FC7; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                    Create Parent Account
                </a>
                <p><small>This invitation expires in 7 days.</small></p>
            `
        };

        context.log('Email would be sent:', emailContent);
        
        // TODO: Implement actual email sending via Azure Communication Services
        // const emailClient = new EmailClient(connectionString);
        // await emailClient.send(emailContent);
        
        return true; // Simulate successful email sending
    } catch (error) {
        context.log('Send email error:', error);
        return false;
    }
}

// Get tutor's invitations
async function getTutorInvitations(tutorEmail, context, corsHeaders) {
    try {
        const { resources: invitations } = await invitationsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.tutorEmail = @tutorEmail ORDER BY c.createdDate DESC",
                parameters: [{ name: "@tutorEmail", value: tutorEmail }]
            })
            .fetchAll();

        // Clean up sensitive data for response
        const cleanInvitations = invitations.map(inv => ({
            id: inv.id,
            studentEmail: inv.studentEmail,
            parentEmail: inv.parentEmail,
            studentInfo: inv.studentInfo,
            status: inv.status,
            createdDate: inv.createdDate,
            sentDate: inv.sentDate,
            expiryDate: inv.expiryDate,
            acceptedDate: inv.acceptedDate,
            emailSent: inv.emailSent,
            remindersSent: inv.remindersSent
        }));

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                invitations: cleanInvitations,
                totalInvitations: cleanInvitations.length
            }
        };
    } catch (error) {
        context.log('Get invitations error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to retrieve invitations' }
        };
    }
}

// Validate invitation token
async function validateInvitationToken(token, context, corsHeaders) {
    try {
        const { resources: invitations } = await invitationsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.token = @token",
                parameters: [{ name: "@token", value: token }]
            })
            .fetchAll();

        if (!invitations.length) {
            return {
                status: 404,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invalid invitation token' }
            };
        }

        const invitation = invitations[0];

        // Check if expired
        if (new Date() > new Date(invitation.expiryDate)) {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invitation has expired' }
            };
        }

        // Check if already accepted
        if (invitation.status === 'accepted') {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invitation already accepted' }
            };
        }

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                valid: true,
                invitation: {
                    id: invitation.id,
                    studentInfo: invitation.studentInfo,
                    parentEmail: invitation.parentEmail,
                    tutorEmail: invitation.tutorEmail,
                    expiryDate: invitation.expiryDate
                }
            }
        };
    } catch (error) {
        context.log('Validate token error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to validate token' }
        };
    }
}

// Process invitation acceptance
async function processInvitation(token, parentDetails, context, corsHeaders) {
    try {
        // Validate token first
        const validation = await validateInvitationToken(token, context, corsHeaders);
        if (!validation.jsonBody.success) {
            return validation;
        }

        const invitation = validation.jsonBody.invitation;

        // Check if parent user already exists
        const { resources: existingUsers } = await usersContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.email = @email",
                parameters: [{ name: "@email", value: invitation.parentEmail }]
            })
            .fetchAll();

        let parentUser;
        
        if (existingUsers.length > 0) {
            // Update existing user to add parent role and child
            parentUser = existingUsers[0];
            if (!parentUser.roles.includes('parent')) {
                parentUser.roles.push('parent');
            }
            if (!parentUser.children) {
                parentUser.children = [];
            }
            if (!parentUser.children.includes(invitation.studentInfo.email)) {
                parentUser.children.push(invitation.studentInfo.email);
            }
            
            await usersContainer.item(parentUser.email, parentUser.email).replace(parentUser);
        } else {
            // Create new parent user
            parentUser = {
                id: invitation.parentEmail,
                email: invitation.parentEmail,
                name: parentDetails?.name || 'Parent',
                roles: ['parent'],
                children: [invitation.studentInfo.email],
                organization: 'BrightStars-NorthLondon',
                gdprConsent: {
                    dataProcessing: true,
                    progressTracking: true,
                    parentAccess: true
                },
                createdDate: new Date().toISOString(),
                lastLoginDate: null,
                profile: {
                    phone: parentDetails?.phone,
                    emergencyContact: parentDetails?.emergencyContact
                }
            };
            
            await usersContainer.items.create(parentUser);
        }

        // Update invitation status
        const { resources: invitationRecords } = await invitationsContainer.items
            .query({
                query: "SELECT * FROM c WHERE c.token = @token",
                parameters: [{ name: "@token", value: token }]
            })
            .fetchAll();

        if (invitationRecords.length > 0) {
            const invitationRecord = invitationRecords[0];
            invitationRecord.status = 'accepted';
            invitationRecord.acceptedDate = new Date().toISOString();
            
            await invitationsContainer.item(invitationRecord.id, invitationRecord.id).replace(invitationRecord);
        }

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                parentUser: {
                    email: parentUser.email,
                    name: parentUser.name,
                    children: parentUser.children
                },
                message: 'Invitation accepted successfully'
            }
        };
    } catch (error) {
        context.log('Process invitation error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to process invitation' }
        };
    }
}

// Resend invitation
async function resendInvitation(invitationId, context, corsHeaders) {
    try {
        const { resource: invitation } = await invitationsContainer.item(invitationId, invitationId).read();

        if (invitation.status === 'accepted') {
            return {
                status: 400,
                headers: corsHeaders,
                jsonBody: { success: false, error: 'Invitation already accepted' }
            };
        }

        // Update expiry date (extend by 7 days)
        invitation.expiryDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
        invitation.remindersSent = (invitation.remindersSent || 0) + 1;

        // Send email again
        const emailSent = await sendInvitationEmail(invitation, context);
        
        if (emailSent) {
            invitation.sentDate = new Date().toISOString();
        }

        await invitationsContainer.item(invitationId, invitationId).replace(invitation);

        return {
            status: 200,
            headers: corsHeaders,
            jsonBody: { 
                success: true, 
                emailSent: emailSent,
                message: 'Invitation resent successfully'
            }
        };
    } catch (error) {
        context.log('Resend invitation error:', error);
        return {
            status: 500,
            headers: corsHeaders,
            jsonBody: { success: false, error: 'Failed to resend invitation' }
        };
    }
}