const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");

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
        
        // Create container if it doesn't exist (PRIVATE - no public access)
        await containerClient.createIfNotExists({ 
            access: 'private' // This is the key change!
        });
        
        // Generate unique filename
        const fileName = `${Date.now()}_${file.name}`;
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);
        
        // Upload file
        const buffer = await file.arrayBuffer();
        await blockBlobClient.upload(buffer, buffer.byteLength);
        
        // Generate SAS token for secure access (expires in 1 hour)
        const sasToken = generateBlobSASQueryParameters({
            containerName: containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse("r"), // Read only
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + 60 * 60 * 1000), // 1 hour
        }, blobServiceClient.credential).toString();
        
        const secureUrl = `${blockBlobClient.url}?${sasToken}`;
        
        return {
            status: 200,
            jsonBody: {
                success: true,
                url: secureUrl, // Secure URL with SAS token
                fileName: fileName,
                secureAccess: true
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