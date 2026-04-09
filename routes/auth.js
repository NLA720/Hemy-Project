const express = require('express');
const Axios = require('axios');
const cors = require('cors'); // Import CORS
const multer = require('multer');
// const bodyParser = require('body-parser');
const { getAuthorizationUrl, authCallbackMiddleware, authRefreshMiddleware, getUserProfile, refreshTokenMiddleware } = require('../services/aps.js');
const { APS_CLIENT_ID, APS_CLIENT_SECRET } = require('../config.js');

const upload = multer({ storage: multer.memoryStorage() }); // keeps file in memory

var scopes = 'data:read data:write data:create';
const querystring = require('querystring');
const { randomUUID } = require('crypto');

const sql = require('mssql');

let router = express.Router();

// Enable CORS with specific origin (your Dynamics URL)
router.use(cors());


router.get('/api/auth/login', function (req, res) {
    res.redirect(getAuthorizationUrl());
});

router.get('/api/auth/logout', function (req, res) {
    req.session = null;
    res.redirect('/');
});


router.get('/api/auth/callback', authCallbackMiddleware, (req, res) => {
    const publicToken = req.session.public_token;
    const refreshToken = req.session.refresh_token;
    const expires_at = req.session.expires_at;
    const internal_token = req.session.internal_token;

     // window.opener.postMessage({ token: '${publicToken}' }, window.location.origin);

    res.send(`
        <script>
            if (window.opener) {
                // Send the token back to the parent window
               
                window.opener.postMessage({ token: '${publicToken}', refreshToken: '${refreshToken}', expires_at: '${expires_at}', internal_token: '${internal_token}' }, window.location.origin);

                window.close();  // Close the popup
            }
        </script>
    `);
});


router.get('/api/auth/token', authRefreshMiddleware, function (req, res) {
    res.json(req.publicOAuthToken);
});

router.get('/api/auth/profile', authRefreshMiddleware, async function (req, res, next) {
    try {
        const profile = await getUserProfile(req.internalOAuthToken.access_token);
        res.json({ name: `${profile.name}` });
    } catch (err) {
        next(err);
    }
});



// * refresh token
// #region: refresh token
router.post("/api/auth/refresh", async (req, res) => {
  try {
    const refreshToken = req.headers["x-refresh-token"];
    if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });

    // refresh the 3-legged user token
    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", refreshToken);
    params.append("client_id", process.env.APS_CLIENT_ID);
    params.append("client_secret", process.env.APS_CLIENT_SECRET);

    const response = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);

    const expires_at = Date.now() + data.expires_in * 1000;

    // 🔑 ALSO fetch a 2-legged internal token
    const internalParams = new URLSearchParams();
    internalParams.append("grant_type", "client_credentials");
    internalParams.append("client_id", process.env.APS_CLIENT_ID);
    internalParams.append("client_secret", process.env.APS_CLIENT_SECRET);
    internalParams.append("scope", "data:read data:write bucket:read bucket:create viewables:read");

    const internalResp = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: internalParams
    });

    const internalData = await internalResp.json();

    // final payload with both tokens
    const tokenPayload = { 
      ...data, 
      expires_at, 
      internal_token: internalData.access_token,
      internal_expires_in: internalData.expires_in
    };

    console.log("✅ New tokens (3-legged + internal):", tokenPayload);
    res.json(tokenPayload);
  } catch (err) {
    console.error("❌ Refresh route error:", err);
    res.status(500).json({ error: "Refresh failed" });
  }
});

// router.post("/api/auth/refresh", async (req, res) => {
//   try {
//     const refreshToken = req.headers["x-refresh-token"];
//     console.log("Refresh token received:", refreshToken);
//     if (!refreshToken) {
//       return res.status(400).json({ error: "Missing refresh token" });
//     }

//     const params = new URLSearchParams();
//     params.append("grant_type", "refresh_token");
//     params.append("refresh_token", refreshToken);
//     params.append("client_id", process.env.APS_CLIENT_ID);
//     params.append("client_secret", process.env.APS_CLIENT_SECRET);
    
//     console.log("Requesting new tokens with params:", params.toString());
//     const response = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/x-www-form-urlencoded",
//         "Accept": "application/json"
//         // ⚠️ NO "Authorization: Basic ..." needed if sending client_id + client_secret in body
//       },
//       body: params
//     });

//     const data = await response.json();

//     if (!response.ok) {
//       console.error("❌ APS Refresh error:", data);
//       return res.status(response.status).json(data);
//     }

//     // Convert expires_in → expires_at
//     const expires_at = Date.now() + data.expires_in * 1000;
//     const tokenPayload = { ...data, expires_at };

//     console.log("✅ New tokens:", tokenPayload);
//     res.json(tokenPayload);
//   } catch (err) {
//     console.error("❌ Refresh route error:", err);
//     res.status(500).json({ error: "Refresh failed" });
//   }
// });
// router.js
// router.get('/api/auth/refresh', refreshTokenMiddleware, async function (req, res, next) {
//   try {
//     res.json({
//       access_token: req.publicOAuthToken.access_token,   // 👈 now saveTokens will find it
//       refresh_token: req.session.refresh_token,
//       expires_at: req.session.expires_at
//     });
//   } catch (err) {
//     next(err);
//   }
// });
// #endregion



// ! markups
// #region: markups
// --------------------------------------------------------------------------- MARKUPS ---------------------------------------------------------------------------
router.get('/markup/save/:markupData', async (req, res) => {
    const markupData = req.params.markupData;
});

const sessionDataStore = {};  // Store data per session

// Endpoint to receive data from Power Apps
router.post('/api/data', (req, res) => {
    const powerAppsData = req.body;
    console.log('Received Data:', powerAppsData);
  
    // Respond back to Power Apps
    res.status(200).send('Data received successfully');
});
// #endregion







// * ACC UPLOAD PROCESS
//  #region : ACC UPLOAD PROCESS
// POST /api/acc/upload/folderUrn
router.post('/api/acc/upload/folderUrn', async (req, res) => {
  const { projectId } = req.body; // e.g. 'image.jpg', folder URN, project ID
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1]; // Extract token after "Bearer "

  const hubId = 'b.7a656dca-000a-494b-9333-d9012c464554';

  console.log("Initiating upload with:", { projectId, authToken });

  if (!authToken) return res.status(401).json({ message: 'Missing auth token' });

  const response = await fetch(`https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${projectId}/topFolders`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${authToken}`
    },
  });


  const data = await response.json();

  const projectFilesFolder = data.data.find(f => f.attributes.name === 'Project Files');
  const folderId = projectFilesFolder?.id;

  console.log('Folder ID:', folderId);

  res.json({ folderId });
  // console.log("Folders:", data);
});





// POST /api/acc/upload/initiate
router.post('/api/acc/upload/initiate', async (req, res) => {
  // console.log("Initiating upload...");
  const { filename, folderUrn, projectId } = req.body; // e.g. 'image.jpg', folder URN, project ID
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1]; // Extract token after "Bearer "

  console.log("Initiating upload with:", { filename, folderUrn, projectId, authToken });

  if (!authToken) return res.status(401).json({ message: 'Missing auth token' });


  const payload = {
    jsonapi: { version: "1.0" },
    data: {
      type: "objects",
      attributes: {
        name: filename
      },
      relationships: {
        target: {
          data: {
            type: "folders",
            id: folderUrn
          }
        }
      }
    }
  };

  const response = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/storage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/vnd.api+json",
      "Accept": "application/vnd.api+json",
      "Authorization": `Bearer ${authToken}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("Storage create error:", err);
    return res.status(500).json(err);
  }

  const data = await response.json();
  console.log("Storage created:", data);
  const objectUrn = data.data.id; // full URN
  const objectKey = objectUrn.split("/").pop(); // last part after /
  const bucketKey = objectUrn.split("/")[2];     // 'wip.dm.prod' etc.

  res.json({ objectUrn, objectKey, bucketKey });
});


// GET /api/acc/upload/signed-url?bucketKey=...&objectKey=...
router.get('/api/acc/upload/signed-url', async (req, res) => {
  const { bucketKey, objectKey } = req.query;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];


  const response = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${objectKey}/signeds3upload`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("Signed URL error:", err);
    return res.status(500).json(err);
  }

  const data = await response.json(); // includes `uploadKey` and `urls`
  console.log("Signed URL data:", data);
  res.json(data);
});








router.post('/api/acc/upload/execute', upload.single('file'), async (req, res) => {
  const { signedUrl } = req.body;
  const file = req.file;

  if (!signedUrl || !file)
    return res.status(400).json({ error: "Missing signedUrl or file" });

  try {
    const response = await fetch(signedUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': file.size,
      },
      body: file.buffer,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Direct S3 upload failed:", errText);
      return res.status(500).json({ error: 'Direct S3 upload failed', details: errText });
    }

    res.status(200).json({ message: 'Upload success' });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: 'Upload failed', details: err.message });
  }
});







// POST /api/acc/upload/finalize
router.post('/api/acc/upload/finalize', async (req, res) => {
  const { bucketKeyCorrected, objectKey, uploadKey, projectId, folderUrn, filename } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  try {
    const objectId = `urn:adsk.objects:os.object:${bucketKeyCorrected}/${objectKey}`;

    // Step 1: Finalize multipart upload
    const finalizeRes = await fetch(`https://developer.api.autodesk.com/oss/v2/buckets/${bucketKeyCorrected}/objects/${objectKey}/signeds3upload`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ uploadKey })
    });
    const finalizeData = await finalizeRes.json();

    if (!finalizeRes.ok) {
      console.error("Finalize failed:", finalizeData);
      return res.status(500).json({ error: "Finalize failed", details: finalizeData });
    }

    // Step 2: Try to create a new item
    const itemBody = {
      jsonapi: { version: "1.0" },
      data: {
        type: "items",
        attributes: {
          displayName: filename,
          extension: {
            type: "items:autodesk.bim360:File",
            version: "1.0"
          }
        },
        relationships: {
          tip: {
            data: {
              type: "versions",
              id: "1"
            }
          },
          parent: {
            data: {
              type: "folders",
              id: folderUrn
            }
          }
        }
      },
      included: [{
        type: "versions",
        id: "1",
        attributes: {
          name: filename,
          extension: {
            type: "versions:autodesk.bim360:File",
            version: "1.0"
          }
        },
        relationships: {
          storage: {
            data: {
              type: "objects",
              id: objectId
            }
          }
        }
      }]
    };

    const itemRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/items`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToken}`,
        "Content-Type": "application/vnd.api+json",
        "Accept": "application/vnd.api+json"
      },
      body: JSON.stringify(itemBody)
    });

    let itemData = await itemRes.json();

    // Step 3: Check if file already exists (409 or error detail)
    if (!itemRes.ok) {
      const isFileExists =
        itemRes.status === 409 ||
        (itemData?.errors?.[0]?.detail || "").includes("already exists");

      if (isFileExists) {
        console.log("File exists. Switching to version upload...");

        // Get the existing item's ID
        const folderContentsRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/folders/${folderUrn}/contents`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/vnd.api+json'
          }
        });
        const folderContents = await folderContentsRes.json();

        const existingItem = folderContents.data.find(item =>
          item.attributes.displayName === filename
        );

        if (!existingItem) {
          return res.status(500).json({ error: "Could not find existing item after create failed." });
        }

        // Create new version
        const versionBody = {
          jsonapi: { version: "1.0" },
          data: {
            type: "versions",
            attributes: {
              name: filename,
              extension: {
                type: "versions:autodesk.bim360:File",
                version: "1.0"
              }
            },
            relationships: {
              storage: {
                data: {
                  type: "objects",
                  id: objectId
                }
              },
              item: {
                data: {
                  type: "items",
                  id: existingItem.id
                }
              }
            }
          }
        };

        const versionRes = await fetch(`https://developer.api.autodesk.com/data/v1/projects/${projectId}/versions`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${authToken}`,
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/vnd.api+json"
          },
          body: JSON.stringify(versionBody)
        });

        const versionData = await versionRes.json();

        if (!versionRes.ok) {
          console.error("Version creation failed:", versionData);
          return res.status(500).json({ error: "Version creation failed", details: versionData });
        }

        return res.status(200).json({
          type: "version",
          finalized: finalizeData,
          result: versionData
        });
      }

      // If it's not a file-exists error, return original item creation error
      console.error("Item creation failed:", itemData);
      return res.status(500).json({ error: "Item creation failed", details: itemData });
    }

    // ✅ If item was created successfully
    return res.status(200).json({
      type: "item",
      finalized: finalizeData,
      result: itemData
    });

  } catch (error) {
    console.error("Finalize route error:", error);
    res.status(500).json({ error: "Unexpected error", details: error.message });
  }
});

// Save markup screenshot as ACC issue attachment.
router.post('/api/acc/syncMarkupAttachment', async (req, res) => {
  const { projectId, issueId, dataUrl } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!projectId || !issueId || !dataUrl || !authToken) {
    return res.status(400).json({ error: "Missing projectId, issueId, dataUrl, or Authorization token" });
  }

  const matches = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!matches) {
    return res.status(400).json({ error: "Invalid dataUrl format. Expected base64 image data URL." });
  }

  const mimeType = matches[1];
  const base64Data = matches[2];
  const extension = mimeType.includes("png") ? "png" : "jpg";
  const filename = `issue-markup-${issueId}-${Date.now()}.${extension}`;
  const fileBuffer = Buffer.from(base64Data, "base64");
  const hubId = 'b.7a656dca-000a-494b-9333-d9012c464554';

  // For project API (topFolders), try both forms.
  const projectIdsForProjectApi = Array.from(
    new Set([
      String(projectId).startsWith("b.") ? String(projectId) : `b.${projectId}`,
      String(projectId).replace(/^b\./, ""),
    ])
  );
  const constructionProjectId = String(projectId).replace(/^b\./, "");
  const dataProjectId = String(projectId).startsWith("b.")
    ? String(projectId)
    : `b.${projectId}`;

  try {
    // 1) Get top folders and derive root folder (parent of "Project Files").
    let topFoldersData = null;
    for (const pid of projectIdsForProjectApi) {
      const topFoldersRes = await fetch(
        `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${pid}/topFolders`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      if (topFoldersRes.ok) {
        topFoldersData = await topFoldersRes.json();
        break;
      }
    }

    if (!topFoldersData?.data?.length) {
      return res.status(500).json({ error: "Could not resolve project folders for attachment upload." });
    }

    const projectFilesFolder = topFoldersData.data.find((f) => f?.attributes?.name === "Project Files");
    const rootFolderId = projectFilesFolder?.relationships?.parent?.data?.id || projectFilesFolder?.id;
    if (!rootFolderId) {
      return res.status(500).json({ error: "Could not resolve root folder id for attachment upload." });
    }

    // 2) Create storage in root folder.
    const storagePayload = {
      jsonapi: { version: "1.0" },
      data: {
        type: "objects",
        attributes: { name: filename },
        relationships: {
          target: {
            data: {
              type: "folders",
              id: rootFolderId,
            },
          },
        },
      },
    };

    const storageRes = await fetch(
      `https://developer.api.autodesk.com/data/v1/projects/${dataProjectId}/storage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/vnd.api+json",
          "Accept": "application/vnd.api+json",
          "Authorization": `Bearer ${authToken}`,
        },
        body: JSON.stringify(storagePayload),
      }
    );

    const storageData = await storageRes.json();
    if (!storageRes.ok) {
      return res.status(storageRes.status).json({ error: "Storage creation failed", details: storageData });
    }

    const storageUrn = storageData?.data?.id;
    if (!storageUrn) {
      return res.status(500).json({ error: "Storage URN missing from storage response." });
    }

    const urnSuffix = storageUrn.split("urn:adsk.objects:os.object:")[1] || "";
    const slashIdx = urnSuffix.indexOf("/");
    if (slashIdx === -1) {
      return res.status(500).json({ error: "Unexpected storage URN format.", storageUrn });
    }
    const bucketKey = urnSuffix.slice(0, slashIdx);
    const objectKey = urnSuffix.slice(slashIdx + 1);

    // 3) Request signed S3 upload URL.
    const signedUploadRes = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    const signedUploadData = await signedUploadRes.json();
    if (!signedUploadRes.ok) {
      return res.status(signedUploadRes.status).json({ error: "Failed to get signed upload URL", details: signedUploadData });
    }

    const signedUrl = signedUploadData?.urls?.[0];
    const uploadKey = signedUploadData?.uploadKey;
    if (!signedUrl || !uploadKey) {
      return res.status(500).json({ error: "Signed upload response missing url/uploadKey." });
    }

    // 4) Upload binary image directly to S3.
    const putRes = await fetch(signedUrl, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileBuffer.length),
      },
      body: fileBuffer,
    });
    if (!putRes.ok) {
      return res.status(500).json({ error: "Failed uploading image to signed S3 URL." });
    }

    // 5) Finalize upload.
    const finalizeRes = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(objectKey)}/signeds3upload`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uploadKey }),
      }
    );
    const finalizeData = await finalizeRes.json();
    if (!finalizeRes.ok) {
      return res.status(finalizeRes.status).json({ error: "Failed to finalize attachment upload", details: finalizeData });
    }

    // 6) Associate uploaded file with issue as attachment.
    const attachmentPayload = {
      domainEntityId: issueId,
      attachments: [
        {
          attachmentId: randomUUID(),
          displayName: filename,
          fileName: objectKey,
          attachmentType: "issue-attachment",
          storageUrn,
        },
      ],
    };

    const attachRes = await fetch(
      `https://developer.api.autodesk.com/construction/issues/v1/projects/${encodeURIComponent(constructionProjectId)}/attachments`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(attachmentPayload),
      }
    );
    const attachData = await attachRes.json();
    if (!attachRes.ok) {
      return res.status(attachRes.status).json({ error: "Failed to attach image to issue", details: attachData });
    }

    return res.status(200).json({
      message: "Markup screenshot uploaded as ACC issue attachment.",
      details: attachData,
    });
  } catch (error) {
    console.error("syncMarkupAttachment error:", error);
    return res.status(500).json({ error: "Unexpected error", details: error.message });
  }
});

// #endregion





// ! ISSUE REPORTING
// #region: ISSUE REPORTING
// -------------------------------- ISSUE REPORTING --------------------------------


router.get('/api/acc/getIssueType', async (req, res) => {
  const { projectId } = req.query;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];


  const response = await fetch(`https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issue-types?include=subtypes`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${authToken}`
    }
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("Get issue types error: ", err);
    return res.status(500).json(err);
  }

  const data = await response.json(); // includes `uploadKey` and `urls`
  console.log("Get issue types data:", data);
  res.json(data);
});
// #endregion



// * UPDATE ISSUE/TASK
//  #region: UPDATE ISSUE/TASK
router.post('/api/acc/updateIssueTask', async (req, res) => {
  const { projectId, payload, issueId } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  console.log("Initialize: ", projectId, payload)
  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId or title" });
  }

  try {
    const projectRes = await fetch(
      `	https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues/${issueId}`,
      {
        method: "PATCH",
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      }
    );

    const projectData = await projectRes.json();
    if (!projectRes.ok) {
      console.error("Project fetch failed:", projectData);
      return res.status(projectRes.status).json(projectData);
    }

    res.status(200).json({ message: 'Issue updated successfully', details: projectData});

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});
// #endregion


// ! CREATE ISSUE OR TASK
// #region: CREATE ISSUE OR TASK
// post or create issue or task
router.post('/api/acc/postissue', async (req, res) => {
  const { projectId, payload, title } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];
  const hubId = 'b.7a656dca-000a-494b-9333-d9012c464554';

  console.log("Initialize: ", projectId, payload, title)
  if (!projectId || !title) {
    return res.status(400).json({ error: "Missing projectId or title" });
  }

  try {
    const projectRes = await fetch(
      `https://developer.api.autodesk.com/project/v1/hubs/${hubId}/projects/${"b." + projectId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        }
      }
    );

    const projectData = await projectRes.json();
    if (!projectRes.ok) {
      console.error("Project fetch failed:", projectData);
      return res.status(projectRes.status).json(projectData);
    }

    const issueContainer = projectData.data.relationships.issues.data.id;
    console.log("Issue Container ID:", issueContainer);

    // ✅ Use full payload from frontend
    const issueRes = await fetch(
      `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(payload)
      }
    );


    const issueText = await issueRes.json();
    console.log(issueText);
    if (!issueRes.ok) {
      console.error("Issue creation failed:", issueText);
      return res.status(issueRes.status).json({ error: "Failed to create issue", details: issueText });
    }

    res.status(200).json({ message: 'Issue created successfully', details: issueText });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});
// #endregion


// * GET TASKS
// #region: GET TASKS
// get tasks
router.post('/api/acc/getTasks', async (req, res) => {
  const { projectId, lineageUrn, issueTaskId } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!projectId || !authToken) {
    return res.status(400).json({ error: "Missing projectId or Authorization token" });
  }

  try {
    const issueTaskFilter = issueTaskId ? `filter[customAttributes][${issueTaskId}]=Task` : "";
    const queryParts = [issueTaskFilter].filter(Boolean).join("&");
    const issueListRes = await fetch(
      `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues${queryParts ? `?${queryParts}` : ""}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        }
      }
    );

    const issueList = await issueListRes.json();

    if (!issueListRes.ok) {
      console.error("Issue fetch failed:", issueList);
      return res.status(issueListRes.status).json(issueList);
    }


    console.log("Issue List:", issueList);
    res.status(200).json({ message: 'Issue List retrieved', details: issueList });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});


// get tasks with filters
router.post('/api/acc/gettasksFiltered', async (req, res) => {
  const {
    lineageUrn,
    projectId,
    issueType,
    hardAsset,
    hardAssetId,
    functionalLocation,
    functionalLocationId,
    assignedTo,
    startDate,
    dueDate,
    status,
    issueTaskId
  } = req.body;

  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!authToken) {
    return res.status(400).json({ error: "Missing Authorization token" });
  }

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    const queryParams = new URLSearchParams();

    if (issueType) queryParams.append("filter[issueSubtypeId]", issueType);
    if (hardAsset && hardAssetId)
      queryParams.append(`filter[customAttributes][${hardAssetId}]`, hardAsset);
    if (functionalLocation && functionalLocationId)
      queryParams.append(`filter[customAttributes][${functionalLocationId}]`, functionalLocation);
    if (assignedTo) queryParams.append("filter[assignedTo]", assignedTo);
    if (status) queryParams.append("filter[status]", status);

    // Optional: future support for date range
    // if (startDate) queryParams.append("filter[startDate]", startDate);
    // if (dueDate) queryParams.append("filter[dueDate]", dueDate);

    const issueTaskFilter = issueTaskId ? `filter[customAttributes][${issueTaskId}]=Task` : "";
    const qp = queryParams.toString();
    const query = [issueTaskFilter, qp].filter(Boolean).join("&");
    const url = `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues${query ? `?${query}` : ""}`;

    const issueListRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      }
    });

    const issueList = await issueListRes.json();

    if (!issueListRes.ok) {
      console.error("Issue fetch failed:", issueList);
      return res.status(issueListRes.status).json(issueList);
    }

    res.status(200).json({
      message: 'Issue List retrieved',
      details: issueList
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});
// #endregion





// get issues
router.post('/api/acc/getissues', async (req, res) => {
  const { projectId, lineageUrn, issueTaskId } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!projectId || !authToken) {
    return res.status(400).json({ error: "Missing projectId or Authorization token" });
  }

  try {
    const issueTaskFilter = issueTaskId ? `filter[customAttributes][${issueTaskId}]=Issue` : "";
    const queryParts = [issueTaskFilter].filter(Boolean).join("&");
    const issueListRes = await fetch(
      `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues${queryParts ? `?${queryParts}` : ""}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        }
      }
    );

    const issueList = await issueListRes.json();

    if (!issueListRes.ok) {
      console.error("Issue fetch failed:", issueList);
      return res.status(issueListRes.status).json(issueList);
    }


    console.log("Issue List:", issueList);
    res.status(200).json({ message: 'Issue List retrieved', details: issueList });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});






// get issues with filters
router.post('/api/acc/getissuesFiltered', async (req, res) => {
  const {
    lineageUrn,
    projectId,
    issueType,
    hardAsset,
    hardAssetId,
    functionalLocation,
    functionalLocationId,
    assignedTo,
    startDate,
    dueDate,
    status,
    issueTaskId
  } = req.body;

  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!authToken) {
    return res.status(400).json({ error: "Missing Authorization token" });
  }

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    const queryParams = new URLSearchParams();

    if (issueType) queryParams.append("filter[issueSubtypeId]", issueType);
    if (hardAsset && hardAssetId)
      queryParams.append(`filter[customAttributes][${hardAssetId}]`, hardAsset);
    if (functionalLocation && functionalLocationId)
      queryParams.append(`filter[customAttributes][${functionalLocationId}]`, functionalLocation);
    if (assignedTo) queryParams.append("filter[assignedTo]", assignedTo);
    if (status) queryParams.append("filter[status]", status);

    // Optional: future support for date range
    // if (startDate) queryParams.append("filter[startDate]", startDate);
    // if (dueDate) queryParams.append("filter[dueDate]", dueDate);

    const issueTaskFilter = issueTaskId ? `filter[customAttributes][${issueTaskId}]=Issue` : "";
    const qp = queryParams.toString();
    const query = [issueTaskFilter, qp].filter(Boolean).join("&");
    const url = `https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issues${query ? `?${query}` : ""}`;

    const issueListRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${authToken}`,
      }
    });

    const issueList = await issueListRes.json();

    if (!issueListRes.ok) {
      console.error("Issue fetch failed:", issueList);
      return res.status(issueListRes.status).json(issueList);
    }

    res.status(200).json({
      message: 'Issue List retrieved',
      details: issueList
    });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});





// #region: ISSUE THUMBNAIL (ACC-native)
router.post('/api/acc/getIssueThumbnail', async (req, res) => {
  const { projectId, issueId } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!projectId || !issueId || !authToken) {
    return res.status(400).json({ error: "Missing projectId, issueId, or Authorization token" });
  }

  const projectIdsToTry = Array.from(
    new Set([
      projectId,
      typeof projectId === "string" && projectId.startsWith("b.") ? projectId.slice(2) : projectId,
    ].filter(Boolean))
  );

  function parseStorageUrn(storageUrn) {
    const prefix = "urn:adsk.objects:os.object:";
    if (!storageUrn || typeof storageUrn !== "string" || !storageUrn.startsWith(prefix)) return null;
    const rest = storageUrn.slice(prefix.length);
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) return null;
    const bucketKey = rest.slice(0, slashIdx);
    const objectKey = rest.slice(slashIdx + 1);
    return { bucketKey, objectKey };
  }

  async function getSignedDownloadUrlFromStorageUrn(storageUrn) {
    const parsed = parseStorageUrn(storageUrn);
    if (!parsed) return null;

    const { bucketKey, objectKey } = parsed;
    const encodedBucketKey = encodeURIComponent(bucketKey);
    const encodedObjectKey = encodeURIComponent(objectKey);

    const response = await fetch(
      `https://developer.api.autodesk.com/oss/v2/buckets/${encodedBucketKey}/objects/${encodedObjectKey}/signeds3download`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );

    if (!response.ok) return null;
    const data = await response.json();
    return data?.url || null;
  }

  // 1) Prefer native ACC snapshot thumbnail from issue.snapshotUrn.
  for (const pid of projectIdsToTry) {
    try {
      const issueRes = await fetch(
        `https://developer.api.autodesk.com/construction/issues/v1/projects/${encodeURIComponent(pid)}/issues/${encodeURIComponent(issueId)}`,
        {
          method: "GET",
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      if (!issueRes.ok) continue;
      const issue = await issueRes.json();
      const snapshotUrn = issue?.snapshotUrn;
      if (!snapshotUrn) continue;

      const thumbnailUrl = await getSignedDownloadUrlFromStorageUrn(snapshotUrn);
      if (!thumbnailUrl) continue;

      return res.status(200).json({ thumbnailUrl });
    } catch (err) {
      console.error("SnapshotUrn fallback failed:", pid, issueId, err);
    }
  }

  return res.status(200).json({ thumbnailUrl: null });
});
// #endregion

// custom attributes
router.post('/api/acc/getCustomAttributes', async (req, res) => {
  const { projectId } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!projectId || !authToken) {
    return res.status(400).json({ error: "Missing projectId, lineageUrn, or Authorization token" });
  }

  try {
    const customAttributesData = await fetch(
      `	https://developer.api.autodesk.com/construction/issues/v1/projects/${projectId}/issue-attribute-definitions`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        }
      }
    );

    const customAttributes = await customAttributesData.json();

    if (!customAttributesData.ok) {
      console.error("Issue fetch failed:", customAttributes);
      return res.status(customAttributesData.status).json(customAttributes);
    }


    console.log("Custom Attributes:", customAttributes);
    res.status(200).json({ results: customAttributes.results });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});



// get project users
router.post('/api/acc/getProjectMembers', async (req, res) => {
  const { projectId } = req.body;
  const authHeader = req.headers.authorization;
  const authToken = authHeader?.split(' ')[1];

  if (!projectId || !authToken) {
    return res.status(400).json({ error: "Missing projectId, lineageUrn, or Authorization token" });
  }

  try {
    const usersData = await fetch(
      `https://developer.api.autodesk.com/construction/admin/v1/projects/${projectId}/users`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authToken}`,
        }
      }
    );

    const userList = await usersData.json();

    if (!usersData.ok) {
      console.error("Project User fetch failed:", userList);
      return res.status(usersData.status).json(userList);
    }


    console.log("Project User Lists:", userList);
    res.status(200).json({ results: userList.results });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});







// get companies
router.post('/api/acc/getCompanies', async (req, res) => {
  const { projectId } = req.body;
  const accountId = '7a656dca-000a-494b-9333-d9012c464554';

  if (!projectId) {
    return res.status(400).json({ error: "Missing projectId" });
  }

  try {
    // Step 1: Get a 2-legged token
    const tokenResponse = await fetch('https://developer.api.autodesk.com/authentication/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${APS_CLIENT_ID}:${APS_CLIENT_SECRET}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        scope: 'data:read data:write account:read viewables:read',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      throw new Error(`2-legged token fetch failed: ${error.message || tokenResponse.statusText}`);
    }

    const { access_token } = await tokenResponse.json();

    // Step 2: Use 2-legged token to fetch companies
    const companiesData = await fetch(
      `https://developer.api.autodesk.com/hq/v1/accounts/${accountId}/projects/${projectId}/companies`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${access_token}`,
        }
      }
    );

    const companiesList = await companiesData.json();

    if (!companiesData.ok) {
      console.error("Companies fetch failed:", companiesList);
      return res.status(companiesData.status).json(companiesList);
    }

    console.log("Companies Lists:", companiesList);
    res.status(200).json({ results: companiesList });

  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({ error: "Unexpected error", details: err.message });
  }
});













module.exports = router;