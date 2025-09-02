const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } = require("@azure/storage-blob");

module.exports = async function (request, context) {
    context.log('Secure file download request');
    
    try {
        const { fileName, userEmail } = await request.json();
        
        if (!fileName || !userEmail) {
            return {
                status: 400,
                jsonBody: { error: "fileName and userEmail are required" }
            };
        }

        // TODO: Add user authorization check here
        // Verify the user has subscription/access to this file
        
        const connectionString = process.env["STORAGE_CONNECTION_STRING"];
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerName = "lesson-files";
        
        // Check if file exists
        const blockBlobClient = blobServiceClient
            .getContainerClient(containerName)
            .getBlockBlobClient(fileName);
            
        const exists = await blockBlobClient.exists();
        if (!exists) {
            return {
                status: 404,
                jsonBody: { error: "File not found" }
            };
        }
        
        // Generate short-lived SAS token (15 minutes for download)
        const sasToken = generateBlobSASQueryParameters({
            containerName: containerName,
            blobName: fileName,
            permissions: BlobSASPermissions.parse("r"), // Read only
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + 15 * 60 * 1000), // 15 minutes
        }, blobServiceClient.credential).toString();
        
        const secureUrl = `${blockBlobClient.url}?${sasToken}`;
        
        // Log the download for audit trail
        context.log(`File download: ${fileName} by ${userEmail}`);
        
        return {
            status: 200,
            jsonBody: {
                success: true,
                downloadUrl: secureUrl,
                expiresIn: 15 // minutes
            }
        };
        
    } catch (error) {
        context.log('Download error:', error);
        return {
            status: 500,
            jsonBody: { error: "Failed to generate download link" }
        };
    }
};