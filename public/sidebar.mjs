async function getJSON(url) {
    const token = localStorage.getItem('authTokenHemyProject');
    const refreshToken = localStorage.getItem('refreshTokenHemyProject');
    const expires_at = localStorage.getItem('expires_atHemyProject');
    const internal_token = localStorage.getItem('internal_tokenHemyProject');


    console.log("Request URL:", url);
    
    // console.log("Authorization Header:", `Bearer ${token}`);

    const resp = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,  // Send authToken in the Authorization header
            'x-refresh-token': refreshToken,         // Send refreshToken in a custom header
            'x-expires-at': expires_at,              // Send expires_at in a custom header
            'x-internal-token': internal_token       // Send internal_token in a custom header
        }
    });
    // if (!resp.ok) {
    //     fetchAccessToken();
    //     alert('Could not load tree data. See console for more details.');
    //     console.error(await resp.text());
    //     // return [];
    // }
    return resp.json();
}



function createTreeNode({
  id,
  text,
  icon,
  children = false,
  description = '',
  version = '--',
  indicators = '--',
  markups = '--',
  issues = '--',
  size = '--',
  updatedAt = null,
  updatedBy = '--',
  updatedByInitials,
  versionAddedBy = '--',
  reviewStatus = '--',
  lineageUrn
}) {
  return {
    id,
    text,
    children,
    description,
    version,
    indicators,
    markups,
    issues,
    size,
    updatedAt,
    updatedBy,
    updatedByInitials,
    versionAddedBy,
    reviewStatus,
    lineageUrn,
    itree: { icon }
  };
}


// async function getHubs() {
//     const hubs = await getJSON('/api/hubs');
//     return hubs.map(hub => createTreeNode(`hub|${hub.id}`, hub.attributes.name, 'icon-hub', true));
// }

async function getProjects(hubId) {
    const projects = await getJSON(`/api/hubs/${hubId}/projects`);
    return projects.map(project => createTreeNode(`project|${hubId}|${project.id}`, project.attributes.name, 'icon-project', true));
}

async function getContents(hubId, projectId, folderId = null) {
    // Show spinner
    document.getElementById('file-loading-spinner')?.classList.remove('hidden');

    const contents = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents` + (folderId ? `?folder_id=${folderId}` : ''));

    let result = [];

    if (!folderId) {
      // console.log('Contents: ', contents);
        const projectFilesFolder = contents.find(item =>
            item.type === 'folders' && item.attributes.displayName === 'Project Files'
        );
        if (projectFilesFolder) {
            console.log('Project Files folder ID:', projectFilesFolder);
            window.projectFilesFolderId = projectFilesFolder.id;
            result = [createTreeNode({
                id: `folder|${hubId}|${projectId}|${projectFilesFolder.id}`,
                text: projectFilesFolder.attributes.displayName,
                icon: 'icon-my-folder',
                children: true,
                size: formatSize(
                  projectFilesFolder.attributes.storageSize ||
                  projectFilesFolder.attributes.size ||
                  projectFilesFolder.attributes.extension?.data?.storageSize ||
                  '--'
                ),
                updatedAt: getLastModifiedDate(projectFilesFolder.attributes),
                updatedBy: getLastModifiedBy(projectFilesFolder.attributes),
                updatedByInitials: (getLastModifiedBy(projectFilesFolder.attributes) || '--')
                    .split(' ')
                    .map(n => n[0])
                    .join('')
                    .toUpperCase(),
                description: projectFilesFolder.attributes.extension?.data?.description || projectFilesFolder.attributes.description || '--',
                indicators: '--',
                markups: '--',
                issues: '--',
                versionAddedBy: '--',
                reviewStatus: '--',
                version: '--'
            })];
        }
    } else {
        const folderNodes = contents
    .filter(item => item.type === 'folders')
    .map(folder => {
        console.log("Folder:", folder);

        return createTreeNode({
            id: `folder|${hubId}|${projectId}|${folder.id}`,
            text: folder.attributes.displayName,
            icon: 'icon-my-folder',
            children: true,
            size: formatSize(
              folder.attributes.storageSize ||
              folder.attributes.size ||
              folder.attributes.extension?.data?.storageSize ||
              '--'
            ),
            updatedAt: getLastModifiedDate(folder.attributes),
            updatedBy: getLastModifiedBy(folder.attributes),
            updatedByInitials: (getLastModifiedBy(folder.attributes) || '--')
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase(),
            description: folder.attributes.extension?.data?.description || folder.attributes.description || '--',
            indicators: '--',
            markups: '--',
            issues: '--',
            versionAddedBy: '--',
            reviewStatus: '--',
            version: '--'
        });
    });

        const itemVersionNodes = await Promise.all(
            contents
                .filter(item => item.type === 'items')
                .map(async item => {
                    const versions = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents/${item.id}/versions`);
                    if (versions.length > 0) {
                        const latest = versions[0];
                        // console.log('Latest: ', latest);
                        return createTreeNode({
                            id: `version|${latest.id}`,
                            text: item.attributes.displayName,
                            icon: 'icon-version',
                            children: false,
                            description: latest.attributes.extension?.data?.description || latest.attributes.description || item.attributes.description || '--',
                            version: latest.attributes.versionNumber || '--',
                            indicators: latest.attributes.customMetadata?.indicators || '--',
                            markups: latest.attributes.customMetadata?.markups || '--',
                            issues: latest.attributes.customMetadata?.issues || '--',
                            size: formatSize(
                              latest.attributes.storageSize ||
                              latest.attributes.size ||
                              latest.attributes.extension?.data?.storageSize ||
                              '--'
                            ),
                            updatedAt: getLastModifiedDate(latest.attributes),
                            updatedBy: getLastModifiedBy(latest.attributes),
                            updatedByInitials: (getLastModifiedBy(latest.attributes) || '--')
                                .split(' ')
                                .map(n => n[0])
                                .join('')
                                .toUpperCase(),
                            versionAddedBy: latest.attributes.customMetadata?.versionAddedBy || '--',
                            reviewStatus: latest.attributes.customMetadata?.reviewStatus || '--',
                            lineageUrn: latest.relationships.item.data.id
                        });
                    }
                    return null;
                })
        );

        result = [...folderNodes, ...itemVersionNodes.filter(n => n !== null)];
    }

    // Hide spinner
    document.getElementById('file-loading-spinner')?.classList.add('hidden');

    return result;
}



function formatSize(bytes) {
    if (!bytes || bytes === '--') return '--';
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(2)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
}

function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    // Force just YYYY-MM-DD without time
    return date.toISOString().split('T')[0];
}

function getLastModifiedDate(attributes) {
    return formatDate(
        attributes.lastModifiedTimeRollup ||
        attributes.lastModifiedTime ||
        attributes.modifiedTime ||
        attributes.publishedTime ||
        attributes.createdTime ||
        null
    );
}

function getLastModifiedBy(attributes) {
    return (
        attributes.lastModifiedUserName ||
        attributes.lastModifiedUser?.displayName ||
        attributes.modifiedUserName ||
        attributes.modifiedUser?.displayName ||
        attributes.createdBy ||
        attributes.createdUserName ||
        attributes.creator?.displayName ||
        '--'
    );
}




export function initTree(selector, onSelectionChanged) {
    let hubId = 'b.7a656dca-000a-494b-9333-d9012c464554';  // static hub ID
    let params = new URLSearchParams(window.location.search);
    let projectID = 'b.' + params.get('id');
    console.log("Project ID:", projectID);

    const tree = new InspireTree({
        data: function (node) {
            if (!node || !node.id) {
                return getContents(hubId, projectID); // Load root, will fetch only "Project Files"
            } else {
                const tokens = node.id.split('|');
                switch (tokens[0]) {
                    case 'folder': return getContents(hubId, projectID, tokens[3]); // Load only latest versions
                    default: return [];
                }
            }
        }
    });

    tree.on('model.loaded', function () {
        onSelectionChanged(0);

        if (window.projectFilesFolderId) {
            const projectFilesNodeId = `folder|${hubId}|${projectID}|${window.projectFilesFolderId}`;
            const node = tree.node(projectFilesNodeId);
            if (node) {
                node.expand();
            }
        }
    });


    tree.on('node.click', function (event, node) {
    event.preventTreeDefault();
    const tokens = node.id.split('|');

    // if (tokens[0] === 'version') {
    //     onSelectionChanged(tokens[1]);

    //     // Show preview panel (optional toggle)
    //     document.getElementById('preview').classList.add('active');
    // }


    if (tokens[0] === 'version') {
        const versionUrn = tokens[1];
        const itemUrn = node.itm;
        const projectId = projectID;

        // Set globals if needed
        window.lineageUrn = itemUrn;
        window.versionUrn = versionUrn;
        window.projectId = projectId;
        
        window.modelName = node.modelName; // Store model name globally
        
        console.log("🔑 Selected Version:", versionUrn);
        console.log("📁 Lineage URN:", itemUrn);
        console.log("🏗️ Project ID:", projectId);

        onSelectionChanged(versionUrn, itemUrn, projectId);

        document.getElementById('preview').classList.add('active');
    }

    });



    return new InspireTreeDOM(tree, { target: selector });
}





export async function renderCustomTree(onSelectionChanged) {
  const hubId = 'b.7a656dca-000a-494b-9333-d9012c464554';
  const projectId = 'b.' + new URLSearchParams(window.location.search).get('id');
  const rootNodes = await getContents(hubId, projectId); // Project Files folder

  const tbody = document.querySelector('.file-table tbody');
  tbody.innerHTML = '';

  for (const node of rootNodes) {
    const tr = appendNodeRow(tbody, node, hubId, projectId, onSelectionChanged);

    // console.log('rootNodes: ', rootNodes);

    // Auto-expand if it's "Project Files"
    if (node.text.toLowerCase() === 'project files' && node.id.startsWith('folder|')) {
      autoExpandFolder(tr, node, hubId, projectId, onSelectionChanged, 0);
    }
  }
}

function appendNodeRow(tbody, node, hubId, projectId, onSelectionChanged, level = 0) {
  const isFolder = node.id.startsWith('folder|');

//   console.log('Node:', node);

  const tr = document.createElement('tr');
  tr.className = isFolder ? 'folder-row' : '';
  tr.dataset.nodeId = node.id;
  tr.dataset.level = level;

  tr.innerHTML = `
    <td data-label="Name" style="padding-left:${20 * level}px;">
      ${isFolder ? '<i class="fa fa-caret-right toggle-icon"></i> <i class="fa fa-folder"></i>' 
                 : '<i class="fa fa-file"></i>'} ${node.text} <span class="folder-spinner hidden"><i class="fa fa-spinner fa-spin"></i></span>
    </td>
    <td>${node.description || '--'}</td>
    <td>${node.version ? 'V' + node.version : '--'}</td>
    <td>${node.indicators || '--'}</td>
    <td>${node.markups || '--'}</td>
    <td>${node.issues || '--'}</td>
    <td>${node.size || '--'}</td>
    <td>${node.updatedAt ? new Date(node.updatedAt).toDateString() : '--'}</td>
    <td><span class="user-badge">${node.updatedByInitials || '--'}</span> ${node.updatedBy || '--'}</td>
    <td>${node.versionAddedBy || '--'}</td>
    <td>${node.reviewStatus || '--'}</td>
  `;

  if (isFolder) {
    let childRows = [];

    tr.addEventListener('click', async (e) => {
      if (e.target.closest('input[type="checkbox"]') || e.target.closest('button')) return;

      const expanded = tr.dataset.expanded === "true";

      if (!expanded) {
        if (tr.dataset.loaded !== "true") {
          const spinnerEl = tr.querySelector('.folder-spinner');
          if (spinnerEl) spinnerEl.classList.remove('hidden');

          const tokens = node.id.split('|');
          const folderId = tokens[3];
          const childNodes = await getContents(hubId, projectId, folderId);

          if (spinnerEl) spinnerEl.classList.add('hidden');

          let insertAfter = tr;
          childNodes.forEach(child => {
            const childTr = appendNodeRow(tbody, child, hubId, projectId, onSelectionChanged, level + 1);
            insertAfter.insertAdjacentElement('afterend', childTr);
            insertAfter = childTr;
          });

          tr.dataset.loaded = "true";
        } else {
          let nextRow = tr.nextElementSibling;
          while (nextRow && parseInt(nextRow.dataset.level) > level) {
            nextRow.style.display = "";
            nextRow = nextRow.nextElementSibling;
          }
        }

        tr.querySelector('.toggle-icon').classList.replace('fa-caret-right', 'fa-caret-down');
        tr.dataset.expanded = "true";
      } else {
        let nextRow = tr.nextElementSibling;
        while (nextRow && parseInt(nextRow.dataset.level) > level) {
          nextRow.style.display = "none";
          nextRow = nextRow.nextElementSibling;
        }
        tr.querySelector('.toggle-icon').classList.replace('fa-caret-down', 'fa-caret-right');
        tr.dataset.expanded = "false";
      }
    });
  } else if (node.id.startsWith('version|')) {
    tr.addEventListener('click', () => {
      window.lineageUrn = node.lineageUrn;
      window.modelName = node.text;
      window.versionUrn =  node.id.split('|')[1];
      const versionId = node.id.split('|')[1];
      onSelectionChanged(versionId);
      document.getElementById('preview').classList.remove('hidden');
    });
  }

  tbody.appendChild(tr);
  return tr;
}

async function autoExpandFolder(tr, node, hubId, projectId, onSelectionChanged, level) {
  const tokens = node.id.split('|');
  const folderId = tokens[3];
  const childNodes = await getContents(hubId, projectId, folderId);

  let lastInserted = tr;
  childNodes.forEach(child => {
    const childTr = appendNodeRow(tr.parentElement, child, hubId, projectId, onSelectionChanged, level + 1);
    lastInserted.insertAdjacentElement('afterend', childTr);
    lastInserted = childTr;
  });

  const icon = tr.querySelector('.toggle-icon');
  if (icon) {
    icon.classList.replace('fa-caret-right', 'fa-caret-down');
  }

  // NEW: Mark as expanded so click won't reload
  tr.dataset.expanded = "true";
}





export async function renderFileTable(hubId, projectId, folderId = null, onSelectionChanged) {
  const contents = await getJSON(`/api/hubs/${hubId}/projects/${projectId}/contents` + 
                                 (folderId ? `?folder_id=${folderId}` : ''));
  const tbody = document.querySelector('.file-table tbody');
  tbody.innerHTML = '';

  contents.forEach(item => {
    const isFolder = item.type === 'folders';
    const latestVersion = item.latestVersion || {};
    const updatedBy = latestVersion.updatedBy || '--';
    const updatedByInitials = updatedBy.split(' ').map(n => n[0]).join('').toUpperCase();

    console.log('Rendering row for item:', item);

    const tr = document.createElement('tr');
    tr.className = isFolder ? 'folder-row' : '';
    
    

    tr.innerHTML = `
      <td><input type="checkbox" /></td>
      <td>${isFolder ? '<i class="fa fa-folder"></i>' : '<i class="fa fa-file"></i>'} ${item.attributes.displayName}</td>
      <td>${item.attributes.description || ''}</td>
      <td><span class="user-badge">V${latestVersion.version || '--'}</td>
      <td>${latestVersion.size || '--'}</td>
      <td>${latestVersion.updatedAt ? new Date(latestVersion.updatedAt).toLocaleString() : '--'}</td>
      <td><span class="user-badge">${updatedByInitials}</span> ${updatedBy}</td>
      <td>${latestVersion.versionAddedBy || '--'}</td>
      <td>${latestVersion.reviewStatus || '--'}</td>
      <td><i class="fa fa-ellipsis-v"></i></td>
    `;

    if (isFolder) {
      tr.addEventListener('click', () => {
        // clicking a folder reloads the table with its contents
        renderFileTable(hubId, projectId, item.id.split(':').pop(), onSelectionChanged);
      });
    } else {
      tr.addEventListener('click', () => {
        if (latestVersion.versionUrn) {
          onSelectionChanged(latestVersion.versionUrn);
        }
      });
    }

    tbody.appendChild(tr);
  });
}
