const { BlobServiceClient } = require("@azure/storage-blob");

module.exports = async function (request, context) {
    context.log('File upload request - DEBUG MODE');
    
    try {
        // Check admin access
        const formData = await request.formData();
        const isAdmin = formData.get('isAdmin') === 'true';
        context.log('Admin check:', { isAdmin });
        
        if (!isAdmin) {
            context.log('ERROR: Admin access denied');
            return {
                status: 403,
                jsonBody: { error: "Admin access required" }
            };
        }
        
        // Check file
        const file = formData.get('file');
        if (!file) {
            context.log('ERROR: No file provided');
            return {
                status: 400,
                jsonBody: { error: "No file provided" }
            };
        }
        context.log('File received:', { name: file.name, size: file.size, type: file.type });
        
        // Check connection string
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        if (!connectionString) {
            context.log('ERROR: No storage connection string');
            return {
                status: 500,
                jsonBody: { error: "Storage not configured" }
            };
        }
        
        // Initialize blob service
        context.log('Initializing blob service...');
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerName = "lesson-files";
        const containerClient = blobServiceClient.getContainerClient(containerName);
        context.log('Container client created for:', containerName);
        
        // Create container (private by default when no access parameter is provided)
        context.log('Creating/checking container...');
        await containerClient.createIfNotExists(); // No access parameter = private
        context.log('Container ready (private access)');
        
        // Upload file
        const fileName = `${Date.now()}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        context.log('Uploading file as:', fileName);
        
        const buffer = await file.arrayBuffer();
        context.log('File buffer created, size:', buffer.byteLength);
        
        await blockBlobClient.upload(buffer, buffer.byteLength);
        context.log('File uploaded successfully');
        
        const fileUrl = blockBlobClient.url;
        context.log('File URL:', fileUrl);
        
        return {
            status: 200,
            jsonBody: {
                success: true,
                url: fileUrl,
                fileName: fileName,
                debug: 'Upload completed successfully'
            }
        };
        
    } catch (error) {
        context.log('UPLOAD ERROR:', error);
        context.log('Error message:', error.message);
        
        return {
            status: 500,
            jsonBody: { 
                error: "Failed to upload file",
                details: error.message,
                debug: 'Check function logs for details'
            }
        };
    }
};