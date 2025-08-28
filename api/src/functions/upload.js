const { BlobServiceClient } = require("@azure/storage-blob");
const { TableClient } = require("@azure/data-tables");

module.exports = async function (request, context) {
    context.log('File upload request');
    
    // Check admin
    const formData = await request.formData();
    const isAdmin = formData.get('isAdmin') === 'true';
    
    if (!isAdmin) {
        return {
            status: 403,
            jsonBody: { error: "Admin access required" }
        };
    }
    
    const file = formData.get('file');
    if (!file) {
        return {
            status: 400,
            jsonBody: { error: "No file provided" }
        };
    }
    
    try {
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerName = "lesson-files";
        const containerClient = blobServiceClient.getContainerClient(containerName);
        
        // Create container if it doesn't exist
        await containerClient.createIfNotExists({ access: 'blob' });
        
        // Generate unique filename
        const fileName = `${Date.now()}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        
        // Upload file
        const buffer = await file.arrayBuffer();
        await blockBlobClient.upload(buffer, buffer.byteLength);
        
        const fileUrl = blockBlobClient.url;
        
        return {
            status: 200,
            jsonBody: {
                success: true,
                url: fileUrl,
                fileName: fileName
            }
        };
    } catch (error) {
        context.log('Upload error:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to upload file" }
        };
    }
};