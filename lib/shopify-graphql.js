/**
 * Shopify GraphQL Admin API Functions
 *
 * Handles file uploads and product creation using GraphQL instead of REST.
 * Key advantage: Can upload photos WITHOUT creating a product first.
 */

// Use same env vars as seller.js
const SHOPIFY_STORE_URL = process.env.VITE_SHOPIFY_STORE_URL || process.env.SHOPIFY_SHOP || 'ba42c1.myshopify.com';
const SHOPIFY_ACCESS_TOKEN = process.env.VITE_SHOPIFY_ACCESS_TOKEN || process.env.SHOPIFY_ACCESS_TOKEN;
const GRAPHQL_ENDPOINT = `https://${SHOPIFY_STORE_URL}/admin/api/2024-01/graphql.json`;

/**
 * Execute a GraphQL mutation or query
 *
 * @param {string} query - GraphQL query/mutation
 * @param {object} variables - Variables for the query
 * @returns {Promise<object>} - Response data
 */
async function shopifyGraphQL(query, variables = {}) {
  console.log(`📤 Shopify GraphQL request to: ${GRAPHQL_ENDPOINT}`);
  console.log(`🔑 Access token length: ${SHOPIFY_ACCESS_TOKEN?.length || 0}`);

  const response = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_ACCESS_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });

  console.log(`📥 Shopify response status: ${response.status}`);

  const result = await response.json();

  if (result.errors) {
    console.error('❌ Shopify GraphQL errors:', JSON.stringify(result.errors, null, 2));
    console.error('❌ Full error object:', JSON.stringify(result, null, 2));
    const errorMsg = result.errors[0]?.message || JSON.stringify(result.errors[0]) || 'Unknown error';
    throw new Error(`Shopify GraphQL error: ${errorMsg}`);
  }

  if (!result.data) {
    console.error('❌ No data in Shopify response:', JSON.stringify(result, null, 2));
    throw new Error('Shopify returned no data');
  }

  return result.data;
}

/**
 * Step 1: Create staged upload parameters
 *
 * @param {string} filename - Filename (e.g., "wa_ABC123.jpg")
 * @param {string} mimeType - MIME type (e.g., "image/jpeg")
 * @param {number} fileSize - File size in bytes
 * @returns {Promise<object>} - { uploadUrl, uploadParameters, resourceUrl }
 */
export async function createStagedUpload(filename, mimeType, fileSize) {
  const mutation = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: [
      {
        filename,
        mimeType,
        resource: 'IMAGE',
        fileSize: fileSize.toString()
      }
    ]
  };

  console.log(`📤 Creating staged upload for: ${filename} (${fileSize} bytes)`);

  const data = await shopifyGraphQL(mutation, variables);

  if (data.stagedUploadsCreate.userErrors.length > 0) {
    const error = data.stagedUploadsCreate.userErrors[0];
    throw new Error(`Staged upload error: ${error.message}`);
  }

  const target = data.stagedUploadsCreate.stagedTargets[0];

  return {
    uploadUrl: target.url,
    uploadParameters: target.parameters,
    resourceUrl: target.resourceUrl
  };
}

/**
 * Step 2: Upload file to staged URL
 *
 * @param {string} uploadUrl - Upload URL from stagedUploadsCreate
 * @param {Array} uploadParameters - Upload parameters from stagedUploadsCreate
 * @param {Buffer} fileBuffer - File data
 * @returns {Promise<void>}
 */
export async function uploadToStagedUrl(uploadUrl, uploadParameters, fileBuffer) {
  // Create FormData for multipart upload
  const formData = new FormData();

  // Add all parameters from Shopify
  uploadParameters.forEach(param => {
    formData.append(param.name, param.value);
  });

  // Add the file itself (must be last)
  const blob = new Blob([fileBuffer], { type: 'image/jpeg' });
  formData.append('file', blob);

  console.log(`📤 Uploading file to staged URL...`);

  const response = await fetch(uploadUrl, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Staged upload failed: ${response.status} - ${text}`);
  }

  console.log(`✅ File uploaded to staged URL`);
}

/**
 * Step 3: Create file record in Shopify and get file ID
 *
 * @param {string} resourceUrl - Resource URL from stagedUploadsCreate
 * @param {string} filename - Original filename
 * @returns {Promise<string>} - Shopify file ID (gid://shopify/MediaImage/xxx)
 */
export async function createFileRecord(resourceUrl, filename) {
  const mutation = `
    mutation fileCreate($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          alt
          createdAt
          ... on MediaImage {
            image {
              url
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    files: [
      {
        alt: filename,
        contentType: 'IMAGE',
        originalSource: resourceUrl
      }
    ]
  };

  console.log(`📤 Creating file record in Shopify...`);

  const data = await shopifyGraphQL(mutation, variables);

  if (data.fileCreate.userErrors.length > 0) {
    const error = data.fileCreate.userErrors[0];
    throw new Error(`File create error: ${error.message}`);
  }

  const file = data.fileCreate.files[0];

  // Poll for file to be ready
  const fileId = await pollFileStatus(file.id);

  console.log(`✅ File created: ${fileId}`);

  return fileId;
}

/**
 * Poll file status until it's ready
 *
 * @param {string} fileId - Shopify file ID
 * @returns {Promise<string>} - File ID when ready
 */
async function pollFileStatus(fileId, maxAttempts = 10) {
  const query = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on MediaImage {
          id
          fileStatus
          image {
            url
          }
        }
      }
    }
  `;

  for (let i = 0; i < maxAttempts; i++) {
    const data = await shopifyGraphQL(query, { id: fileId });

    if (data.node && data.node.fileStatus === 'READY') {
      console.log(`✅ File ready: ${data.node.image?.url || 'no URL yet'}`);
      return fileId;
    }

    if (data.node && data.node.fileStatus === 'FAILED') {
      throw new Error('File upload failed in Shopify');
    }

    // Wait before next poll (exponential backoff)
    const delay = Math.min(1000 * Math.pow(1.5, i), 5000);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  throw new Error('File status polling timeout');
}

/**
 * Complete photo upload workflow (all 3 steps)
 *
 * @param {Buffer} imageBuffer - Image data
 * @param {string} filename - Filename
 * @returns {Promise<string>} - Shopify file ID (gid://shopify/MediaImage/xxx)
 */
export async function uploadPhotoToShopify(imageBuffer, filename) {
  console.log(`📸 Starting photo upload workflow for: ${filename}`);

  try {
    // Step 1: Create staged upload
    console.log(`Step 1/3: Creating staged upload...`);
    const { uploadUrl, uploadParameters, resourceUrl } = await createStagedUpload(
      filename,
      'image/jpeg',
      imageBuffer.length
    );
    console.log(`✅ Step 1 complete: Got upload URL`);

    // Step 2: Upload file to staged URL
    console.log(`Step 2/3: Uploading to staged URL...`);
    await uploadToStagedUrl(uploadUrl, uploadParameters, imageBuffer);
    console.log(`✅ Step 2 complete: File uploaded`);

    // Step 3: Create file record and get ID
    console.log(`Step 3/3: Creating file record...`);
    const fileId = await createFileRecord(resourceUrl, filename);
    console.log(`✅ Step 3 complete: File ID: ${fileId}`);

    console.log(`✅ Complete! File ID: ${fileId}`);
    return fileId;
  } catch (error) {
    console.error(`❌ Photo upload failed at some step:`, error);
    console.error(`Error details:`, error.message);
    console.error(`Error stack:`, error.stack);
    throw error;
  }
}

/**
 * Create product with media attachments
 *
 * @param {object} productData - Product data
 * @param {string[]} fileIds - Array of Shopify file IDs
 * @returns {Promise<object>} - { productId, productUrl }
 */
export async function createProductWithMedia(productData, fileIds) {
  const mutation = `
    mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
      productCreate(input: $input, media: $media) {
        product {
          id
          title
          handle
          status
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = {
    input: {
      title: productData.title,
      descriptionHtml: productData.description,
      vendor: productData.designer || '',
      productType: productData.item_type || '',
      status: 'DRAFT',
      variants: [
        {
          price: productData.asking_price_usd?.toString() || '0',
          inventoryPolicy: 'DENY',
          inventoryManagement: 'SHOPIFY'
        }
      ],
      metafields: [
        { namespace: 'custom', key: 'size', value: productData.size || '', type: 'single_line_text_field' },
        { namespace: 'custom', key: 'condition', value: productData.condition || '', type: 'single_line_text_field' }
      ]
    },
    media: fileIds.map(fileId => ({
      originalSource: fileId,
      mediaContentType: 'IMAGE'
    }))
  };

  console.log(`📦 Creating product with ${fileIds.length} media files...`);

  const data = await shopifyGraphQL(mutation, variables);

  if (data.productCreate.userErrors.length > 0) {
    const error = data.productCreate.userErrors[0];
    throw new Error(`Product create error: ${error.message}`);
  }

  const product = data.productCreate.product;
  const productId = product.id.split('/').pop();
  const productUrl = `https://${SHOPIFY_STORE_URL}/admin/products/${productId}`;

  console.log(`✅ Product created: ${productUrl}`);

  return {
    productId,
    productUrl,
    status: product.status
  };
}

/**
 * Delete files from Shopify (cleanup on cancel/restart)
 *
 * @param {string[]} fileIds - Array of Shopify file IDs to delete
 * @returns {Promise<void>}
 */
export async function deleteFiles(fileIds) {
  if (!fileIds || fileIds.length === 0) return;

  const mutation = `
    mutation fileDelete($fileIds: [ID!]!) {
      fileDelete(fileIds: $fileIds) {
        deletedFileIds
        userErrors {
          field
          message
        }
      }
    }
  `;

  const variables = { fileIds };

  console.log(`🗑️ Deleting ${fileIds.length} files from Shopify...`);

  const data = await shopifyGraphQL(mutation, variables);

  if (data.fileDelete.userErrors.length > 0) {
    const error = data.fileDelete.userErrors[0];
    console.error(`⚠️ File delete error: ${error.message}`);
  } else {
    console.log(`✅ Deleted ${data.fileDelete.deletedFileIds.length} files`);
  }
}
