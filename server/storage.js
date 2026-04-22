const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

// ─── Azure Blob Storage swap ──────────────────────────────────────────────────
// To switch from local file to Azure Blob Storage:
//   1. npm install @azure/storage-blob
//   2. Set env vars: STORAGE_BACKEND=azure, AZURE_STORAGE_CONNECTION_STRING=..., AZURE_CONTAINER_NAME=cost-dashboard
//   3. Replace the save/load functions below with:
//
//   const { BlobServiceClient } = require('@azure/storage-blob');
//   const client = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
//   const container = client.getContainerClient(process.env.AZURE_CONTAINER_NAME);
//   async function save(payload) {
//     const blob = container.getBlockBlobClient('cost-data.json');
//     const content = JSON.stringify(payload);
//     await blob.upload(content, Buffer.byteLength(content), { blobHTTPHeaders: { blobContentType: 'application/json' } });
//   }
//   async function load() {
//     const blob = container.getBlockBlobClient('cost-data.json');
//     const download = await blob.download();
//     const chunks = [];
//     for await (const chunk of download.readableStreamBody) chunks.push(chunk);
//     return JSON.parse(Buffer.concat(chunks).toString());
//   }
// ─────────────────────────────────────────────────────────────────────────────

function save(payload) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');
}

function load() {
  if (!fs.existsSync(DATA_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { save, load };
