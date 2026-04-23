var viewer = window.viewerInstance;
const taskTypeMap = {};
let watchersSelectEdit;
const ISSUE_MARKUP_STORAGE_KEY = "hemyIssueMarkups";
const ISSUE_THUMBNAIL_STORAGE_KEY = "hemyIssueThumbnails";

function readIssueMarkups() {
  try {
    const raw = localStorage.getItem(ISSUE_MARKUP_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Failed to read issue markups:", err);
    return {};
  }
}

function writeIssueMarkups(map) {
  try {
    localStorage.setItem(ISSUE_MARKUP_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Failed to save issue markups:", err);
  }
}

function readIssueThumbnails() {
  try {
    const raw = localStorage.getItem(ISSUE_THUMBNAIL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error("Failed to read issue thumbnails:", err);
    return {};
  }
}

function writeIssueThumbnails(map) {
  try {
    localStorage.setItem(ISSUE_THUMBNAIL_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.error("Failed to save issue thumbnails:", err);
  }
}

function saveIssueThumbnail(issueId, dataUrl) {
  if (!issueId || !dataUrl) return;
  const map = readIssueThumbnails();
  map[issueId] = dataUrl;
  writeIssueThumbnails(map);
}

function loadIssueThumbnailFromLocal(issueId) {
  if (!issueId) return null;
  const map = readIssueThumbnails();
  const value = map[issueId] || null;

  // Old cached values may be blob: URLs (temporary and invalid after reload).
  // Auto-clean them up so we don't keep reusing broken thumbnails.
  if (typeof value === "string" && value.startsWith("blob:")) {
    delete map[issueId];
    writeIssueThumbnails(map);
    return null;
  }

  return value;
}

function getCurrentMarkupSvg() {
  try {
    if (window.markupsExt && typeof window.markupsExt.generateData === "function") {
      const data = window.markupsExt.generateData();
      return data && data.trim().length > 0 ? data : null;
    }
  } catch (err) {
    console.error("Failed to generate markup data:", err);
  }
  return null;
}

function saveIssueMarkup(issueId, markupSvg) {
  if (!issueId || !markupSvg) return;
  const map = readIssueMarkups();
  map[issueId] = markupSvg;
  writeIssueMarkups(map);
}

function extractTextFromMarkupSvg(markupSvg) {
  if (!markupSvg || typeof markupSvg !== "string") return "";
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(markupSvg, "image/svg+xml");
    const textNodes = Array.from(doc.querySelectorAll("text"));
    const raw = textNodes
      .map((n) => (n.textContent || "").trim())
      .filter(Boolean);
    return [...new Set(raw)].join("\n");
  } catch (err) {
    console.error("Failed to extract text from markup SVG:", err);
    return "";
  }
}

function getIssueMarkupText(issueId) {
  if (!issueId) return "";
  const map = readIssueMarkups();
  const markupSvg = map[issueId];
  return extractTextFromMarkupSvg(markupSvg);
}

function updateEditThumbnailText(issueId) {
  const field = document.getElementById("edit-thumbnail-text-field");
  if (!field) return;
  const currentId = window.__currentEditIssueId;
  if (currentId && issueId && String(currentId) !== String(issueId)) return;

  const text = getIssueMarkupText(issueId);
  if (String(text || "").trim()) {
    field.value = text;
  }
}

function getThumbnailTextValueForIssue(issueId) {
  const field = document.getElementById("edit-thumbnail-text-field");
  const currentId = window.__currentEditIssueId;
  if (field && currentId && issueId && String(currentId) === String(issueId)) {
    const v = String(field.value || "").trim();
    if (v) return v;
  }
  return getIssueMarkupText(issueId);
}

async function syncThumbnailTextToAcc(issueId) {
  if (!issueId) return;
  const authToken = localStorage.getItem("authTokenHemyProject");
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  if (!authToken || !projectId) return;

  let attrId = getAttrIdByTitle("Thumbnail Text");
  if (!attrId) {
    try {
      await getCustomAttributes(projectId, authToken);
    } catch (_) {}
    attrId = getAttrIdByTitle("Thumbnail Text");
  }
  if (!attrId) {
    console.warn("Thumbnail Text attributeDefinitionId not found; cannot sync.");
    return;
  }

  const text = getThumbnailTextValueForIssue(issueId);
  const payload = {
    customAttributes: [
      {
        attributeDefinitionId: attrId,
        value: text,
      },
    ],
  };

  try {
    const resp = await fetch("/api/acc/updateIssueTask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, payload, issueId }),
    });
    if (!resp.ok) {
      console.error("Failed to sync Thumbnail Text:", await resp.text());
    }
  } catch (err) {
    console.error("Thumbnail Text sync error:", err);
  }
}

function loadIssueMarkup(issueId, editMode = false) {
  if (!issueId || !window.markupsExt) return;

  // Avoid repeated reload of same layer/issue; just switch mode.
  if (window.__loadedMarkupIssueId === issueId) {
    try {
      if (editMode) {
        window.markupsExt.show();
        window.markupsExt.enterEditMode("markups-svg");
      } else {
        window.markupsExt.leaveEditMode();
      }
    } catch (err) {
      console.error("Failed to reuse loaded markup layer:", err);
    }
    return;
  }

  const map = readIssueMarkups();
  const markupSvg = map[issueId];
  if (!markupSvg) return;

  const EDIT_LAYER = "markups-svg";
  try {
    // Ensure we're not in edit mode before loading markups to avoid MarkupsCore warnings.
    try {
      window.markupsExt.leaveEditMode();
    } catch (_) {}

    if (!window.markupsExt.markups) {
      window.markupsExt.createMarkupSheet();
    }
    window.markupsExt.show();
    window.markupsExt.loadMarkups(markupSvg, EDIT_LAYER);
    window.__loadedMarkupIssueId = issueId;
    if (editMode) {
      window.markupsExt.enterEditMode(EDIT_LAYER);
    } else {
      window.markupsExt.leaveEditMode();
    }
  } catch (err) {
    console.error("Failed to load issue markups:", err);
  }
}

function showMarkupBanner(show) {
  const banner = document.getElementById("markup-mode-banner");
  if (!banner) return;
  banner.classList.toggle("hidden", !show);
}

function setMarkupToolbarVisible(visible) {
  const toolbarGroup = window.viewerInstance?.toolbar?.getControl("markupsTools");
  if (toolbarGroup?.container) {
    toolbarGroup.container.style.display = visible ? "flex" : "none";
  }
}

async function captureViewerDataUrl() {
  const viewer = window.viewerInstance;
  if (!viewer) return null;
  const screenshotUrl = await new Promise((resolve) => {
    viewer.getScreenShot(600, 400, (url) => resolve(url || null));
  });

  if (!screenshotUrl) return null;

  // Viewer may return either a data URL or a temporary blob URL.
  if (screenshotUrl.startsWith("data:")) {
    return screenshotUrl;
  }

  if (screenshotUrl.startsWith("blob:")) {
    try {
      const response = await fetch(screenshotUrl);
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("Failed to convert blob screenshot to data URL:", err);
      return null;
    }
  }

  return null;
}

async function composeMarkupIntoScreenshot(baseImageDataUrl, markupSvg) {
  if (!baseImageDataUrl || !markupSvg) return baseImageDataUrl;

  function ensureSvgNamespace(svgText) {
    const trimmed = svgText.trim();
    if (trimmed.includes("xmlns=")) return trimmed;
    return trimmed.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  const safeSvg = ensureSvgNamespace(markupSvg);

  const baseImage = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = baseImageDataUrl;
  });

  const svgBlob = new Blob([safeSvg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const overlayImage = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = baseImage.width;
    canvas.height = baseImage.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(baseImage, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(overlayImage, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/png");
  } catch (err) {
    console.error("Failed to overlay markup on screenshot:", err);
    return baseImageDataUrl;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

async function enterMarkupModeForIssue(issueId) {
  if (!issueId || !window.markupsExt) return;
  try {
    if (!window.markupsExt.markups) {
      window.markupsExt.createMarkupSheet();
    }
    loadIssueMarkup(issueId, true);
    window.markupsExt.enterEditMode("markups-svg");
    setMarkupToolbarVisible(true);
    showMarkupBanner(true);
  } catch (err) {
    console.error("Failed to enter markup mode:", err);
  }
}

function exitMarkupMode() {
  if (!window.markupsExt) return;
  try {
    window.markupsExt.leaveEditMode();
    window.markupsExt.hide();
  } catch (err) {
    console.error("Failed to exit markup mode:", err);
  }
  setMarkupToolbarVisible(false);
  showMarkupBanner(false);
}

function focusOnIssuePin(linkedDoc) {
  const viewer = window.viewerInstance;
  if (!viewer || !linkedDoc) return;

  const now = Date.now();
  if (window.__lastFocusPinAt && now - window.__lastFocusPinAt < 350) {
    return; // avoid duplicate rapid calls (click + dblclick)
  }
  window.__lastFocusPinAt = now;

  const normalizeViewerState = (state) => {
    if (!state) return null;
    if (typeof state === "string") {
      try {
        return JSON.parse(state);
      } catch (err) {
        console.error("Invalid viewerState JSON string:", err);
        return null;
      }
    }
    return state;
  };

  const focusByPosition = () => {
    const p = linkedDoc?.position;
    if (!p || typeof p.x !== "number" || typeof p.y !== "number" || typeof p.z !== "number") return;
    try {
      const target = new THREE.Vector3(p.x, p.y, p.z);
      const eye = target.clone().add(new THREE.Vector3(15, 15, 15));
      viewer.navigation.setView(eye, target);
      viewer.navigation.setPivotPoint(target, true, true);
    } catch (err) {
      console.error("Failed camera focus by pin position:", err);
    }
  };

  const viewerState = normalizeViewerState(linkedDoc.viewerState);

  const selectWhenReady = (oid) => {
    if (!Number.isFinite(oid) || oid <= 0) return;

    const trySelect = () => {
      try {
        // Guard against transient state where model/selector is not initialized yet.
        const hasModel = !!viewer.model;
        const hasSelector = !!viewer?.impl?.selector;
        if (!hasModel || !hasSelector) return false;

        viewer.select([oid]);
        return true;
      } catch (_) {
        return false;
      }
    };

    if (trySelect()) return;

    const onGeomLoaded = () => {
      viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeomLoaded);
      // Retry once geometry finishes loading.
      setTimeout(() => {
        if (!trySelect()) {
          console.warn("Could not select pinned object after geometry load.");
        }
      }, 100);
    };
    viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, onGeomLoaded);
  };

  const focusCurrentView = () => {
    // 1) Prefer exact ACC viewer state (closest to pushpin view in ACC UI).
    if (viewerState) {
      try {
        viewer.restoreState(viewerState);
      } catch (err) {
        console.error("Failed restoring pin viewerState:", err);
      }
    }

    // 2) Select pinned object when available, but do not override camera.
    const oid = Number(linkedDoc.objectId);
    if (Number.isFinite(oid) && oid > 0) {
      setTimeout(() => {
        try {
          selectWhenReady(oid);
          if (!viewerState) {
            viewer.fitToView([oid]);
          }
        } catch (err) {
          console.error("Failed to focus/select pinned object:", err);
          if (!viewerState) {
            focusByPosition();
          }
        }
      }, 250);
    } else if (!viewerState) {
      // Fallback for pins with no object id and no viewer state.
      setTimeout(focusByPosition, 250);
    }
  };

  try {
    const targetGuid = linkedDoc?.viewable?.guid;
    const currentGuid = viewer.model?.getDocumentNode?.()?.data?.guid;
    const shouldLoadAnotherViewable = !!targetGuid && !!window.modelUrn && targetGuid !== currentGuid;

    // Only load document node when target viewable differs from current one.
    if (shouldLoadAnotherViewable) {
      Autodesk.Viewing.Document.load(
        "urn:" + btoa(window.modelUrn),
        async (doc) => {
          try {
            const geometryItems = doc.getRoot().search({ type: "geometry" });
            const targetNode = geometryItems.find((node) => node?.data?.guid === targetGuid);
            if (!targetNode) {
              focusCurrentView();
              return;
            }

            viewer.getVisibleModels().forEach((m) => viewer.unloadModel(m));
            await viewer.loadDocumentNode(doc, targetNode, {
              globalOffset: { x: 0, y: 0, z: 0 },
              applyRefPoint: true,
            });

            setTimeout(focusCurrentView, 300);
          } catch (err) {
            console.error("Failed loading target viewable for pin:", err);
            focusCurrentView();
          }
        },
        () => focusCurrentView()
      );
      return;
    }

    focusCurrentView();
  } catch (err) {
    console.error("Failed to focus on issue pin:", err);
  }
}

document.getElementById("issues-tasks-sidebar").addEventListener("click", createIssueTaskPanel);
document.getElementById("issue-maximize-btn").addEventListener("click", createIssuePanel);
document.getElementById("task-maximize-btn").addEventListener("click", createTaskPanel);
document.getElementById("issue-filter-btn").addEventListener("click", filterPanel);
document.getElementById("task-filter-btn").addEventListener("click", taskFilterPanel);
document.getElementById("clear-issue-filter-btn").addEventListener("click", resetIssueFilter);
// document.getElementById("clear-task-filter-btn").addEventListener("click", resetTaskFilter);

//FILE INPUT UI 
const fileInput = document.getElementById("issue-upload-input");
const fileLabel = document.querySelector(".custom-file-label-issue");

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const maxSizeMB = 45; // keep under 50MB after Base64 expansion
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      alert(`❌ File is too large. Please upload a file under ${maxSizeMB} MB.`);
      fileInput.value = ""; // reset file input
      fileLabel.textContent = "Choose a file";
      return;
    }

    // ✅ File size OK
    fileLabel.textContent = file.name;
  } else {
    fileLabel.textContent = "Choose a file";
  }
});



//FILE INPUT UI TASK
const fileInputTask = document.getElementById("task-upload-input");
const fileLabelTask = document.querySelector(".custom-file-label-task");

fileInputTask.addEventListener("change", () => {
  if (fileInputTask.files.length > 0) {
    const file = fileInputTask.files[0];
    const maxSizeMB = 45; // keep under 50 MB to allow for Base64 growth
    const maxSizeBytes = maxSizeMB * 1024 * 1024;

    if (file.size > maxSizeBytes) {
      alert(`❌ File is too large. Please upload a file under ${maxSizeMB} MB.`);
      fileInputTask.value = ""; // clear the input
      fileLabelTask.textContent = "Choose a file";
      return;
    }

    // ✅ File size is fine
    fileLabelTask.textContent = file.name;
  } else {
    fileLabelTask.textContent = "Choose a file";
  }
});


document.getElementById("edit-back-btn").addEventListener("click", () => {
  const panel = document.getElementById("edit-details-panel");
  panel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "visible";
});

document.getElementById("close-task-btn").onclick = () => {
  document.getElementById("task-panel").style.visibility = "hidden";
  createIssueTaskPanel();
}

document.getElementById("close-issue-btn").onclick = () => {
  document.getElementById("issue-panel").style.visibility = "hidden";
  createIssueTaskPanel();
}


document.getElementById("cancel-task-btn").onclick = () => {
  document.getElementById("task-form").reset;
  const panel = document.getElementById("task-panel");
  const issuePanel = document.getElementById("task-details-panel");
  panel.style.visibility = "hidden";
  issuePanel.style.visibility = "hidden";

  document.getElementById("preview").style.width = "97%";
  document.getElementById("task-form").style.display = "none"; // Hide the form
  document.querySelector(".task-type-selector").style.display = "block"; // Show the issue type selector
  setTimeout(() => {
    window.viewerInstance.resize();
  }, 300);

  const extName = "Autodesk.BIM360.Extension.PushPin";
  const pushpin_ext = window.viewerInstance.getExtension(extName);

  if (pushpin_ext && pushpin_ext.pushPinManager) {
    pushpin_ext.pushPinManager.removeAllItems(); // ✅ Remove pushpins
  } else {
    console.warn("PushPin extension is not loaded or has no pushPinManager");
  }
};

document.getElementById("cancel-task-filter-btn").onclick = () => {
  document.getElementById("task-filter-form").reset;
  const issuePanel = document.getElementById("task-filter-panel");
  issuePanel.style.visibility = "hidden";
};

document.getElementById("cancel-issue-btn").onclick = () => {
  document.getElementById("issue-form").reset;
  const panel = document.getElementById("issue-panel");
  const issuePanel = document.getElementById("issue-details-panel");
  panel.style.visibility = "hidden";
  issuePanel.style.visibility = "hidden";

  document.getElementById("preview").style.width = "97%";
  document.getElementById("issue-form").style.display = "none"; // Hide the form
  document.querySelector(".issue-type-selector").style.display = "block"; // Show the issue type selector
  setTimeout(() => {
    window.viewerInstance.resize();
  }, 300);

  const extName = "Autodesk.BIM360.Extension.PushPin";
  const pushpin_ext = window.viewerInstance.getExtension(extName);

  if (pushpin_ext && pushpin_ext.pushPinManager) {
    pushpin_ext.pushPinManager.removeAllItems(); // ✅ Remove pushpins
  } else {
    console.warn("PushPin extension is not loaded or has no pushPinManager");
  }
};


document.getElementById("cancel-issue-filter-btn").onclick = () => {
  document.getElementById("issue-filter-form").reset;
  const issuePanel = document.getElementById("issue-filter-panel");
  issuePanel.style.visibility = "hidden";

  // document.getElementById("preview").style.width = "97%";

  // const extName = "Autodesk.BIM360.Extension.PushPin";
  // const pushpin_ext = window.viewerInstance.getExtension(extName);

  // if (pushpin_ext && pushpin_ext.pushPinManager) {
  //   pushpin_ext.pushPinManager.removeAllItems(); // ✅ Remove pushpins
  // } else {
  //   console.warn("PushPin extension is not loaded or has no pushPinManager");
  // }
};


// ! create task
// #region create task
// ------------------------------------------ CREATE TASK ------------------------------------------------
document.getElementById("create-task-btn-issue-task-panel").onclick = async () => {
  document.getElementById("create-task-btn").click();
}

document.getElementById("create-task-btn").onclick = async () => {
  const viewer = window.viewerInstance;
  const panel = document.getElementById("task-panel");
  panel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "hidden";
  document.getElementById("task-details-panel").style.visibility = "hidden";
  document.getElementById("preview").style.width = "97%";
  // let params = new URLSearchParams(window.location.search);
  // const projectId = "b." + params.get("id");
  // const hemyprojectId = params.get("hemyprojectId");

  setTimeout(() => {
    window.viewerInstance.resize();
  }, 300);

  const pushpin_ext = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );

  pushpin_ext.pushPinManager.removeEventListener("pushpin.created", pushpinIssue);

  pushpin_ext.pushPinManager.removeEventListener("pushpin.created");
  await pushpin_ext.pushPinManager.removeAllItems();

  pushpin_ext.startCreateItem({
    label: "New Issue",
    status: "open",
    type: "issues",
  });
  pushpin_ext.pushPinManager.addEventListener("pushpin.created", pushpinTask);
}

async function pushpinTask(e) {
    let params = new URLSearchParams(window.location.search);
    const projectId = "b." + params.get("id");
    const hemyprojectId = params.get("projectid");
    const viewer = window.viewerInstance;
    const pushpin_ext = await viewer.loadExtension(
      "Autodesk.BIM360.Extension.PushPin"
    );
    const pushpinId = e.value?.itemData?.id;
    const issue = pushpin_ext.getItemById(pushpinId);

    if (pushpinId) {
      pushpin_ext.endCreateItem();
      pushpin_ext.setDraggableById(pushpinId, true);
      //   document.getElementsByClassName("pushpin-billboard-marker").style.backgroundColor = "#F54927"; //red
    }

    // Show issue details panel
    const taskPanel = document.getElementById("task-details-panel");
    taskPanel.style.visibility = "visible";
    document.getElementById("preview").style.width = "72%";
    document.getElementById("issue-task-field").value = "Task";

    setTimeout(() => {
      window.viewerInstance.resize();
    }, 300);

    // automated fields
    // title
    viewer.getProperties(issue.objectId, function (props) {
      // console.log('Properties ', props.properties)
      const categoryProp = props.properties.find(
        (p) => p.displayName === "Category"
      );

      if (categoryProp) {
        document.getElementById("task-title").value =
          categoryProp.displayValue;
      }
    });

    // placement
    document.getElementById("task-placement").value = window.modelName;

    // #region Task Form Submit
    //* prepare post task
    document.getElementById("task-form").onsubmit = async (e) => {
      e.preventDefault();
      document.getElementById("save-task-btn").attributes.disabled = "true";
      const model = viewer.impl.modelQueue().getModels()[0];
      const versionUrn = model.getData().urn;
      const loadedDocument = viewer.model.getDocumentNode();

      if (!versionUrn) {
        console.error("❌ versionUrn is missing from model.getData().urn");
        alert("Version ID not found in loaded model.");
        return;
      }

      let params = new URLSearchParams(window.location.search);
      const projectId = params.get("id");
      const authToken = localStorage.getItem("authTokenHemyProject");
      const title = document.getElementById("task-title").value;

      function fixBase64UrlEncoding(str) {
        // Remove 'urn:' prefix if present
        str = str.replace(/^urn:/, "");

        // Replace URL-safe chars back to standard Base64
        str = str.replace(/-/g, "+").replace(/_/g, "/");

        // Add padding if needed
        while (str.length % 4 !== 0) {
          str += "=";
        }

        return str;
      }

      let version = null;

      // subtype & wacthers
      const taskTypesSelect = document.getElementById("task-types");
      const subtypeId = document.getElementById("task-types").value;
      const selectedTypeText = taskTypesSelect.options[taskTypesSelect.selectedIndex].text; // text from <option>

      //const watcherSelect = document.getElementById("task-watchers");
      // const selectedWatchers = Array.from(watcherSelect.selectedOptions).map(
      //   (opt) => opt.value
      // );
      const assignSelect = document.getElementById("task-assigned-to");
      const assignedTo = assignSelect.value;
      const assignedToType =
      assignSelect.selectedOptions[0]?.getAttribute("data-type");
      const startDateRaw = document.getElementById("task-start-date").value;
      const dueDateRaw = document.getElementById("task-due-date").value;

      const startDate = startDateRaw
        ? new Date(startDateRaw).toISOString().split("T")[0]
        : null;
      const dueDate = dueDateRaw
        ? new Date(dueDateRaw).toISOString().split("T")[0]
        : null;

      try {
        const fixedVersionUrn = fixBase64UrlEncoding(versionUrn);
        const decodedVersionUrn = atob(fixedVersionUrn);
        console.log("✅ Decoded Version URN:", decodedVersionUrn);

        const match = decodedVersionUrn.match(/version=(\d+)/);
        version = match ? parseInt(match[1], 10) : null;
        console.log("📦 Version number:", version);
      } catch (e) {
        console.warn("⚠️ Failed to decode version URN:", e.message);
      }

      const payload = {
        title: title,
        status: "open",
        description: document.getElementById("task-description").value,
        issueSubtypeId: subtypeId,
        assignedTo: assignedTo,
        assignedToType: assignedToType,
       // watchers: selectedWatchers,
        startDate: startDate,
        dueDate: dueDate,
        customAttributes: [
          {
            attributeDefinitionId: getAttrIdByTitle("Issue/Task"),
            value: document.getElementById("issue-task-field").value,
          },
          {
            attributeDefinitionId: getAttrIdByTitle("Hard Asset Name"),
            value: document.getElementById("task-hard-asset").value,
          },
          {
            attributeDefinitionId: getAttrIdByTitle("Functional Location"),
            value: document.getElementById("task-functional-location").value,
          },
       
        
        ],
       

        linkedDocuments: [
          {
            type: "TwoDVectorPushpin",
            urn: window.lineageUrn,
            createdAtVersion: Number(version),
            details: {
              viewable: {
                name: loadedDocument.data.name,
                guid: loadedDocument.data.guid,
                is3D: loadedDocument.data.role === "3d",
                viewableId: loadedDocument.data.viewableID,
              },
              externalId: issue.externalId,
              position: issue.position,
              objectId: issue.objectId,
              viewerState: issue.viewerState,
            },
          },
        ],
      };

      console.log("📦 Payload to send:", payload);
      try {
        const issueRes = await fetch("/api/acc/postissue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ projectId, payload, title }), // ✅ send full payload
        });

        if (!issueRes.ok) {
          const responseText = await issueRes.text();
          document.getElementById("save-task-btn").attributes.disabled = "false";
          throw new Error(
            `❌ Failed to create issue. Status: ${issueRes.status}`
          );
          showErrorNotification(`Error creating issue: ${responseText}`);
        }

        const data = await issueRes.json();
        saveIssueMarkup(data?.details?.id, getCurrentMarkupSvg());
        showNotification("Task created successfully");
        document.getElementById("task-details-panel").style.visibility = "hidden";
        document.getElementById("save-task-btn").attributes.disabled = "false";
        document.getElementById("preview").style.width = "97%";

        setTimeout(() => {
          viewer.resize();
        }, 300);



        const fileInput = document.getElementById("task-upload-input");

        // if (!fileInput.files.length) return alert("Select a file");

        const file = fileInput.files[0];

        let fileBase64 = null;
        let fileName = null;

        if (file) {
          fileBase64 = await toBase64(file);
          fileName = file.name;
        }


        const assignedToSelect = document.getElementById("task-assigned-to");
        const assignedToText = assignedToSelect.options[assignedToSelect.selectedIndex].text;

        console.log(JSON.stringify({
              hemyprojectId: hemyprojectId.toLowerCase(),
              issueId: data.details.id,
              title: title,
              types: selectedTypeText,
              issuesTask: document.getElementById("issue-task-field").value,
              HardAsset: document.getElementById("task-hard-asset").value,
              FunctionalLocation: document.getElementById("task-functional-location").value,
              description: document.getElementById("task-description").value,
              status: document.getElementById("task-status").value,
              placement: document.getElementById("task-placement").value,
              startDate: document.getElementById("task-start-date").value,
              dueDate: document.getElementById("task-due-date").value,
              assignedTo: assignedToText,
              fileName: fileName || "",
              fileContent: fileBase64 || ""
            })
          );


        //CREATE RECORD ON HEMY X  ---- TASK
        const hemyX = await fetch(
          // "https://304525ba25f2ef1886aa9d4e4cba52.54.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9c1232c6ac81454abbbfec500909b093/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=_q7LGd9g1WLPvBSas6Bp6ttzHuEctIodybpjnHRtnBA",
          // "https://prod-170.westeurope.logic.azure.com:443/workflows/0da3ea68dcf04cae9b647c433804bd84/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TRdZa8YTpSYN-HN9xsoiiguhY6PTAXQqkhBevorjglI", // OLD PROD
          "https://29334670b81e4af2b6686cd5acb473.55.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/0da3ea68dcf04cae9b647c433804bd84/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=b1Sm7mTuwOV7lbJO4yUTk00FXu8PLjn8Y1N8PX-9wlw",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hemyprojectId: hemyprojectId.toLowerCase(),
              issueId: data.details.id,
              title: title,
              types: selectedTypeText,
              issuesTask: document.getElementById("issue-task-field").value,
              HardAsset: document.getElementById("task-hard-asset").value,
              FunctionalLocation: document.getElementById("task-functional-location").value,
              description: document.getElementById("task-description").value,
              status: document.getElementById("task-status").value,
              placement: document.getElementById("task-placement").value,
              startDate: document.getElementById("task-start-date").value,
              dueDate: document.getElementById("task-due-date").value,
              assignedTo: assignedToText,
              fileName: fileName || "",
              fileContent: fileBase64 || ""
            }),
          }
        );

        document.getElementById("task-form").reset();


      } catch (err) {
        console.error(err);
        alert("Error creating issue. See console for details.");
      }
    };
    // #endregion
}
// #endregion


// * task filter
// #region task filter
// ------------------------------------------ TASK FILTER SUBMIT ------------------------------------------------
document.getElementById("task-filter-form").onsubmit = async (e) => {
  e.preventDefault();
  let params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const lineageUrn = window.lineageUrn;
  const authToken = localStorage.getItem("authTokenHemyProject");
  const issueType = document.getElementById("task-types-filter").value;
  const hardAssetId = getAttrIdByTitle("Hard Asset Name");
  const hardAsset = document.getElementById("task-filter-hard-asset").value;
  const functionalLocation = document.getElementById("task-filter-functional-location").value;
  const functionalLocationId = getAttrIdByTitle("Functional Location");
  const assignedTo = document.getElementById("task-filter-assigned-to").value;
  const startDate = document.getElementById("task-filter-start-date").value;
  const dueDate = document.getElementById("task-filter-due-date").value;
  const status = document.getElementById("task-filter-status").value;
  const issueTaskId = getAttrIdByTitle("Issue/Task");
  try {
    const issueRes = await fetch("/api/acc/gettasksFiltered", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ lineageUrn, projectId, issueType, hardAsset, hardAssetId, functionalLocation, functionalLocationId, assignedTo, startDate, dueDate, status, issueTaskId }),
    });

    if (!issueRes.ok) {
      const responseText = await issueRes.text();
      throw new Error(
        `❌ Failed to get issues. Status: ${issueRes.status}\n${responseText}`
      );
    }

    const data = await issueRes.json();
    showNotification("Task list retrieved successfully");

    const issues = data.details?.results || [];
    populateTaskListFiltered(issues); // function to populate the cards
    document.getElementById("task-filter-panel").style.visibility = "hidden";
    document.getElementById("task-panel").style.visibility = "visible";
    // viewer.resize();
  } catch (err) {
    console.error(err);
    alert("Error retrieving issues. See console for details.");
  }
};
// #endregion


// ! create issue
// #region create issue
// ------------------------------------------ CREATE ISSUES ------------------------------------------------
document.getElementById("create-issue-btn-issue-task-panel").onclick = async () => {
  document.getElementById("create-issue-btn").click();
}

document.getElementById("create-issue-btn").onclick = async () => {
  const viewer = window.viewerInstance;
  const panel = document.getElementById("issue-panel");
  panel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "hidden";
  document.getElementById("task-details-panel").style.visibility = "hidden";
  document.getElementById("preview").style.width = "97%";

  setTimeout(() => {
    window.viewerInstance.resize();
  }, 300);

  const pushpin_ext = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );
  
  pushpin_ext.pushPinManager.removeEventListener("pushpin.created", pushpinTask);
  await pushpin_ext.pushPinManager.removeAllItems();

  pushpin_ext.startCreateItem({
    label: "New Issue",
    status: "open",
    type: "issues",
  });

  pushpin_ext.pushPinManager.addEventListener("pushpin.created", pushpinIssue);
};


async function pushpinIssue(e){
    let params = new URLSearchParams(window.location.search);
    const projectId = "b." + params.get("id");
    const hemyprojectId = params.get("projectid");
    const viewer = window.viewerInstance;
    const pushpin_ext = await viewer.loadExtension(
      "Autodesk.BIM360.Extension.PushPin"
    );
    const pushpinId = e.value?.itemData?.id;
    const issue = pushpin_ext.getItemById(pushpinId);

    if (pushpinId) {
      pushpin_ext.endCreateItem();
      pushpin_ext.setDraggableById(pushpinId, true);
      //   document.getElementsByClassName("pushpin-billboard-marker").style.backgroundColor = "#F54927"; //red
    }

    // Show issue details panel
    const issuePanel = document.getElementById("issue-details-panel");
    issuePanel.style.visibility = "visible";
    document.getElementById("preview").style.width = "72%";
    document.getElementById("issue-task").value = "Issue";
    viewer.model.getData().name;
    // console.log("Model Name:", viewer.getVisibleModels());

    setTimeout(() => {
      window.viewerInstance.resize();
    }, 300);

    // automated fields
    // title
    viewer.getProperties(issue.objectId, function (props) {
      // console.log('Properties ', props.properties)
      const categoryProp = props.properties.find(
        (p) => p.displayName === "Category"
      );

      if (categoryProp) {
        document.getElementById("issue-title").value =
          categoryProp.displayValue;
      }
    });

    // placement
    document.getElementById("issue-placement").value = window.modelName;

    // #region Issue Form Submit
    // prepare post issue
    document.getElementById("issue-form").onsubmit = async (e) => {
      e.preventDefault();
      document.getElementById("save-issue-btn").attributes.disabled = "true";
      const model = viewer.impl.modelQueue().getModels()[0];
      const versionUrn = model.getData().urn;
      const loadedDocument = viewer.model.getDocumentNode();

      if (!versionUrn) {
        console.error("❌ versionUrn is missing from model.getData().urn");
        alert("Version ID not found in loaded model.");
        return;
      }

      let params = new URLSearchParams(window.location.search);
      const projectId = params.get("id");
      const authToken = localStorage.getItem("authTokenHemyProject");
      const title = document.getElementById("issue-title").value;

      function fixBase64UrlEncoding(str) {
        // Remove 'urn:' prefix if present
        str = str.replace(/^urn:/, "");

        // Replace URL-safe chars back to standard Base64
        str = str.replace(/-/g, "+").replace(/_/g, "/");

        // Add padding if needed
        while (str.length % 4 !== 0) {
          str += "=";
        }

        return str;
      }

      let version = null;

      // subtype & wacthers
      const issueTypesSelect = document.getElementById("issue-types");
      const subtypeId = document.getElementById("issue-types").value;
      const selectedTypeText = issueTypesSelect.options[issueTypesSelect.selectedIndex].text; // text from <option>
     // const watcherSelect = document.getElementById("issue-watchers");
      //const selectedWatchers = Array.from(watcherSelect.selectedOptions).map(
      //  (opt) => opt.value
     // );
      const assignSelect = document.getElementById("issue-assigned-to");
      const assignedTo = assignSelect.value;
      const assignedToType =
        assignSelect.selectedOptions[0]?.getAttribute("data-type");
      const startDateRaw = document.getElementById("issue-start-date").value;
      const dueDateRaw = document.getElementById("issue-due-date").value;

      const startDate = startDateRaw
        ? new Date(startDateRaw).toISOString().split("T")[0]
        : null;
      const dueDate = dueDateRaw
        ? new Date(dueDateRaw).toISOString().split("T")[0]
        : null;

      try {
        const fixedVersionUrn = fixBase64UrlEncoding(versionUrn);
        const decodedVersionUrn = atob(fixedVersionUrn);
        console.log("✅ Decoded Version URN:", decodedVersionUrn);

        const match = decodedVersionUrn.match(/version=(\d+)/);
        version = match ? parseInt(match[1], 10) : null;
        console.log("📦 Version number:", version);
      } catch (e) {
        console.warn("⚠️ Failed to decode version URN:", e.message);
      }

      const payload = {
        title: title,
        status: "open",
        description: document.getElementById("issue-description").value,
        issueSubtypeId: subtypeId,
        assignedTo: assignedTo,
        assignedToType: assignedToType,
      //  watchers: selectedWatchers,
        startDate: startDate,
        dueDate: dueDate,
        customAttributes: [
          {
            attributeDefinitionId: getAttrIdByTitle("Issue/Task"),
            value: document.getElementById("issue-task").value,
          },
          {
            attributeDefinitionId: getAttrIdByTitle("Hard Asset Name"),
            value: document.getElementById("issue-hard-asset").value,
          },
          {
            attributeDefinitionId: getAttrIdByTitle("Functional Location"),
            value: document.getElementById("issue-functional-location").value,
          },
        ],

        linkedDocuments: [
          {
            type: "TwoDVectorPushpin",
            urn: window.lineageUrn,
            createdAtVersion: Number(version),
            details: {
              viewable: {
                name: loadedDocument.data.name,
                guid: loadedDocument.data.guid,
                is3D: loadedDocument.data.role === "3d",
                viewableId: loadedDocument.data.viewableID,
              },
              externalId: issue.externalId,
              position: issue.position,
              objectId: issue.objectId,
              viewerState: issue.viewerState,
            },
          },
        ],
      };

      console.log("📦 Payload to send:", payload);
      try {
        const issueRes = await fetch("/api/acc/postissue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ projectId, payload, title }), // ✅ send full payload
        });

        if (!issueRes.ok) {
          const responseText = await issueRes.text();
          document.getElementById("save-issue-btn").attributes.disabled = "false";
          throw new Error(
            `❌ Failed to create issue. Status: ${issueRes.status}`
          );
          showErrorNotification(`Error creating issue: ${responseText}`);
        }

        const data = await issueRes.json();
        saveIssueMarkup(data?.details?.id, getCurrentMarkupSvg());
        showNotification("Issue created successfully");
        document.getElementById("issue-details-panel").style.visibility =
          "hidden";
        document.getElementById("save-issue-btn").attributes.disabled = "false";
        document.getElementById("preview").style.width = "97%";




        const fileInput = document.getElementById("issue-upload-input");

        // if (!fileInput.files.length) return alert("Select a file");

        const file = fileInput.files[0];

        let fileBase64 = null;
        let fileName = null;

        if (file) {
          console
          fileBase64 = await toBase64(file);
          fileName = file.name;
        }


        const assignedToSelect = document.getElementById("issue-assigned-to");
        const assignedToText = assignedToSelect.options[assignedToSelect.selectedIndex].text;

        
        //CREATE RECORD ON HEMY X  ---- ISSUE
        const hemyX = await fetch(
          // "https://304525ba25f2ef1886aa9d4e4cba52.54.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9c1232c6ac81454abbbfec500909b093/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=_q7LGd9g1WLPvBSas6Bp6ttzHuEctIodybpjnHRtnBA",
          // "https://prod-170.westeurope.logic.azure.com:443/workflows/0da3ea68dcf04cae9b647c433804bd84/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=TRdZa8YTpSYN-HN9xsoiiguhY6PTAXQqkhBevorjglI", // OLD PROD
          "https://29334670b81e4af2b6686cd5acb473.55.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/0da3ea68dcf04cae9b647c433804bd84/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=b1Sm7mTuwOV7lbJO4yUTk00FXu8PLjn8Y1N8PX-9wlw",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              hemyprojectId: hemyprojectId.toLowerCase(),
              issueId: data.details.id,
              title: title,
              types: selectedTypeText,
              issuesTask: document.getElementById("issue-task").value,
              HardAsset: document.getElementById("issue-hard-asset").value,
              FunctionalLocation: document.getElementById("issue-functional-location").value,
              description: document.getElementById("issue-description").value,
              status: document.getElementById("issue-status").value,
              placement: document.getElementById("issue-placement").value,
              startDate: document.getElementById("issue-start-date").value,
              dueDate: document.getElementById("issue-due-date").value,
              assignedTo: assignedToText,
              fileName: fileName || "",
              fileContent: fileBase64 || ""
            }),
          }
        );


        document.getElementById("issue-form").reset();
        

        setTimeout(() => {
          viewer.resize();
        }, 300);
      } catch (err) {
        console.error(err);
        alert("Error creating issue. See console for details.");
      }
    };
    // #endregion
}
// #endregion


// document.getElementById("create-issue-btn-issue-task-panel").onclick = async () => {
//   document.getElementById("create-issue-btn").click();
// }

// document.getElementById("create-issue-btn").onclick = async () => {
//   const viewer = window.viewerInstance;
//   const panel = document.getElementById("issue-panel");
//   panel.style.visibility = "hidden";
//   document.getElementById("issues-and-tasks-panel").style.visibility = "hidden";
//   document.getElementById("task-details-panel").style.visibility = "hidden";
//   document.getElementById("preview").style.width = "97%";
//   let params = new URLSearchParams(window.location.search);
//   const projectId = "b." + params.get("id");
//   const hemyprojectId = params.get("hemyprojectId");

//   setTimeout(() => {
//     window.viewerInstance.resize();
//   }, 300);

//   const pushpin_ext = await viewer.loadExtension(
//     "Autodesk.BIM360.Extension.PushPin"
//   );
  
//   pushpin_ext.pushPinManager.removeEventListener("pushpin.created");
//   await pushpin_ext.pushPinManager.removeAllItems();

//   pushpin_ext.startCreateItem({
//     label: "New Issue",
//     status: "open",
//     type: "issues",
//   });

//   pushpin_ext.pushPinManager.addEventListener("pushpin.created", function (e) {
//     const pushpinId = e.value?.itemData?.id;
//     const issue = pushpin_ext.getItemById(pushpinId);

//     if (pushpinId) {
//       pushpin_ext.endCreateItem();
//       pushpin_ext.setDraggableById(pushpinId, true);
//       //   document.getElementsByClassName("pushpin-billboard-marker").style.backgroundColor = "#F54927"; //red
//     }

//     // Show issue details panel
//     const issuePanel = document.getElementById("issue-details-panel");
//     issuePanel.style.visibility = "visible";
//     document.getElementById("preview").style.width = "72%";
//     document.getElementById("issue-task").value = "Issue";
//     viewer.model.getData().name;
//     // console.log("Model Name:", viewer.getVisibleModels());

//     setTimeout(() => {
//       window.viewerInstance.resize();
//     }, 300);

//     // automated fields
//     // title
//     viewer.getProperties(issue.objectId, function (props) {
//       // console.log('Properties ', props.properties)
//       const categoryProp = props.properties.find(
//         (p) => p.displayName === "Category"
//       );

//       if (categoryProp) {
//         document.getElementById("issue-title").value =
//           categoryProp.displayValue;
//       }
//     });

//     // placement
//     document.getElementById("issue-placement").value = window.modelName;

//     // prepare post issue
//     document.getElementById("issue-form").onsubmit = async (e) => {
//       e.preventDefault();
//       const model = viewer.impl.modelQueue().getModels()[0];
//       const versionUrn = model.getData().urn;
//       const loadedDocument = viewer.model.getDocumentNode();

//       if (!versionUrn) {
//         console.error("❌ versionUrn is missing from model.getData().urn");
//         alert("Version ID not found in loaded model.");
//         return;
//       }

//       let params = new URLSearchParams(window.location.search);
//       const projectId = params.get("id");
//       const authToken = localStorage.getItem("authToken");
//       const title = document.getElementById("issue-title").value;

//       function fixBase64UrlEncoding(str) {
//         // Remove 'urn:' prefix if present
//         str = str.replace(/^urn:/, "");

//         // Replace URL-safe chars back to standard Base64
//         str = str.replace(/-/g, "+").replace(/_/g, "/");

//         // Add padding if needed
//         while (str.length % 4 !== 0) {
//           str += "=";
//         }

//         return str;
//       }

//       let version = null;

//       // subtype & wacthers
//       const issueTypesSelect = document.getElementById("issue-types");
//       const subtypeId = document.getElementById("issue-types").value;
//       const selectedTypeText = issueTypesSelect.options[issueTypesSelect.selectedIndex].text; // text from <option>
//       const watcherSelect = document.getElementById("issue-watchers");
//       const selectedWatchers = Array.from(watcherSelect.selectedOptions).map(
//         (opt) => opt.value
//       );
//       const assignSelect = document.getElementById("issue-assigned-to");
//       const assignedTo = assignSelect.value;
//       const assignedToType =
//         assignSelect.selectedOptions[0]?.getAttribute("data-type");
//       const startDateRaw = document.getElementById("issue-start-date").value;
//       const dueDateRaw = document.getElementById("issue-due-date").value;

//       const startDate = startDateRaw
//         ? new Date(startDateRaw).toISOString().split("T")[0]
//         : null;
//       const dueDate = dueDateRaw
//         ? new Date(dueDateRaw).toISOString().split("T")[0]
//         : null;

//       try {
//         const fixedVersionUrn = fixBase64UrlEncoding(versionUrn);
//         const decodedVersionUrn = atob(fixedVersionUrn);
//         console.log("✅ Decoded Version URN:", decodedVersionUrn);

//         const match = decodedVersionUrn.match(/version=(\d+)/);
//         version = match ? parseInt(match[1], 10) : null;
//         console.log("📦 Version number:", version);
//       } catch (e) {
//         console.warn("⚠️ Failed to decode version URN:", e.message);
//       }

//       const payload = {
//         title: title,
//         status: "open",
//         description: document.getElementById("issue-description").value,
//         issueSubtypeId: subtypeId,
//         assignedTo: assignedTo,
//         assignedToType: assignedToType,
//         watchers: selectedWatchers,
//         startDate: startDate,
//         dueDate: dueDate,
//         customAttributes: [
//           {
//             attributeDefinitionId: getAttrIdByTitle("Issue/Task"),
//             value: document.getElementById("issue-task").value,
//           },
//           {
//             attributeDefinitionId: getAttrIdByTitle("Hard Asset Name"),
//             value: document.getElementById("issue-hard-asset").value,
//           },
//           {
//             attributeDefinitionId: getAttrIdByTitle("Functional Location"),
//             value: document.getElementById("issue-functional-location").value,
//           },
//         ],

//         linkedDocuments: [
//           {
//             type: "TwoDVectorPushpin",
//             urn: window.lineageUrn,
//             createdAtVersion: Number(version),
//             details: {
//               viewable: {
//                 name: loadedDocument.data.name,
//                 guid: loadedDocument.data.guid,
//                 is3D: loadedDocument.data.role === "3d",
//                 viewableId: loadedDocument.data.viewableID,
//               },
//               externalId: issue.externalId,
//               position: issue.position,
//               objectId: issue.objectId,
//               viewerState: issue.viewerState,
//             },
//           },
//         ],
//       };

//       console.log("📦 Payload to send:", payload);
//       try {
//         const issueRes = await fetch("/api/acc/postissue", {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             Authorization: `Bearer ${authToken}`,
//           },
//           body: JSON.stringify({ projectId, payload, title }), // ✅ send full payload
//         });

//         if (!issueRes.ok) {
//           const responseText = await issueRes.text();
//           throw new Error(
//             `❌ Failed to create issue. Status: ${issueRes.status}`
//           );
//           showErrorNotification(`Error creating issue: ${responseText}`);
//         }

//         const data = await issueRes.json();
//         showNotification("Issue created successfully");
//         document.getElementById("issue-details-panel").style.visibility =
//           "hidden";

//         document.getElementById("preview").style.width = "97%";




//         const fileInput = document.getElementById("issue-upload-input");

//         // if (!fileInput.files.length) return alert("Select a file");

//         const file = fileInput.files[0];

//         let fileBase64 = null;
//         let fileName = null;

//         if (file) {
//           console
//           fileBase64 = await toBase64(file);
//           fileName = file.name;
//         }


//         const assignedToSelect = document.getElementById("issue-assigned-to");
//         const assignedToText = assignedToSelect.options[assignedToSelect.selectedIndex].text;

        
//         //CREATE RECORD ON HEMY X  ---- ISSUE
//         const hemyX = await fetch(
//           "https://304525ba25f2ef1886aa9d4e4cba52.54.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9c1232c6ac81454abbbfec500909b093/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=_q7LGd9g1WLPvBSas6Bp6ttzHuEctIodybpjnHRtnBA",
//           {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//               hemyprojectId: hemyprojectId.toLowerCase(),
//               issueId: data.details.id,
//               title: title,
//               types: selectedTypeText,
//               issuesTask: document.getElementById("issue-task").value,
//               HardAsset: document.getElementById("issue-hard-asset").value,
//               FunctionalLocation: document.getElementById("issue-functional-location").value,
//               description: document.getElementById("issue-description").value,
//               status: document.getElementById("issue-status").value,
//               placement: document.getElementById("issue-placement").value,
//               startDate: document.getElementById("issue-start-date").value,
//               dueDate: document.getElementById("issue-due-date").value,
//               assignedTo: assignedToText,
//               fileName: fileName,
//               fileContent: fileBase64
//             }),
//           }
//         );


//         document.getElementById("issue-form").reset();
        

//         setTimeout(() => {
//           viewer.resize();
//         }, 300);
//       } catch (err) {
//         console.error(err);
//         alert("Error creating issue. See console for details.");
//       }
//     };
//   });
//   pushpin_ext.pushPinManager.removeEventListener("pushpin.created");
// };





// ! update issue/task
// #region update issue/task
// ------------------------------------------ UPDATE ISSUE/TASK ------------------------------------------------
document.getElementById("edit-form").onsubmit = async (e) => {
  e.preventDefault();
  document.getElementById("save-edit-btn").attributes.disabled = "true";
  const authToken = localStorage.getItem("authTokenHemyProject");
  const viewer = window.viewerInstance;
  const panel = document.getElementById("edit-details-panel");
  panel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "visible";
  document.getElementById("preview").style.width = "97%";
  let params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const hemyprojectId = params.get("projectid");

  setTimeout(() => {
    viewer.resize();
  }, 300);

  const pushpin_ext = await viewer.loadExtension(
    "Autodesk.BIM360.Extension.PushPin"
  );


  // subtype & wacthers
  const subtypeId = document.getElementById("edit-types").value;
 // const watcherSelect = document.getElementById("edit-watchers");
 //const selectedWatchers = Array.from(watcherSelect.selectedOptions).map((opt) => opt.value);
  const assignSelect = document.getElementById("edit-assigned-to");
  const assignedTo = assignSelect.value;
  const assignedToType = assignSelect.selectedOptions[0]?.getAttribute("data-type");
  const startDateRaw = document.getElementById("edit-start-date").value;
  const dueDateRaw = document.getElementById("edit-due-date").value;
  const startDate = startDateRaw ? new Date(startDateRaw).toISOString().split("T")[0] : null;
  const dueDate = dueDateRaw ? new Date(dueDateRaw).toISOString().split("T")[0] : null;

  const payload = {
    title: document.getElementById("edit-title").value,
    status: document.getElementById("edit-status").value,
    description: document.getElementById("edit-description").value,
    issueSubtypeId: subtypeId,
    assignedTo: assignedTo,
    assignedToType: assignedToType,
   //watchers: selectedWatchers,
    startDate: startDate,
    dueDate: dueDate,
    customAttributes: [
      {
        attributeDefinitionId: getAttrIdByTitle("Hard Asset Name"),
        value: document.getElementById("edit-hard-asset").value,
      },
      {
        attributeDefinitionId: getAttrIdByTitle("Functional Location"),
        value: document.getElementById("edit-functional-location").value,
      },
      {
        attributeDefinitionId: getAttrIdByTitle("Thumbnail Text"),
        value: getThumbnailTextValueForIssue(
          document.getElementById("edit-panel-title").getAttribute("issue-id")
        ),
      },
    ].filter((attr) => attr && attr.attributeDefinitionId),
  };

  const issueId = document.getElementById("edit-panel-title").getAttribute("issue-id");
  try {
    const issueRes = await fetch("/api/acc/updateIssueTask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, payload, issueId }), // ✅ send full payload
    });

    if (!issueRes.ok) {
      const responseText = await issueRes.text();
      document.getElementById("save-edit-btn").attributes.disabled = "false";
      showErrorNotification(`Error updating issue: ${responseText}`);
      return;
    }

    const data = await issueRes.json();
    saveIssueMarkup(data?.details?.id || issueId, getCurrentMarkupSvg());
    await syncThumbnailTextToAcc(data?.details?.id || issueId);
    showNotification("Issue updated successfully");
    document.getElementById("issue-details-panel").style.visibility = "hidden";
    document.getElementById("save-edit-btn").attributes.disabled = "false";
    document.getElementById("preview").style.width = "97%";

    const title = document.getElementById("edit-title").value;

    const taskTypesSelect = document.getElementById("edit-types");
    const subtypeId = document.getElementById("edit-types").value;
    const selectedTypeText = taskTypesSelect.options[taskTypesSelect.selectedIndex].text;

        // ee88a99d-56ab-4c41-8348-c6d4a2f80464
    //UPDATE RECORD ON HEMY X  ---- ISSUE/TASK
    const hemyX = await fetch(
      // "https://304525ba25f2ef1886aa9d4e4cba52.54.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/8953a76682394496957e83c4b0709abf/triggers/manual/paths/invoke/?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=L5JJatnoM42CsskzR05txAH0D9equlZCUr9DFHVyjzY",
      "https://prod-147.westeurope.logic.azure.com:443/workflows/f756160e688f4c8d978ff1f3f944c1d5/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=Dap3Gm9dyT00kddFC3uy6eS2CsVryYSXhIV6rQwG3vc",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hemyprojectId: (hemyprojectId || "").toLowerCase(),
          issueId: data.details.id,
          title: title,
          types: selectedTypeText,
          HardAsset: document.getElementById("edit-hard-asset").value,
          FunctionalLocation: document.getElementById("edit-functional-location").value,
          description: document.getElementById("edit-description").value,
          status: document.getElementById("edit-status").value,
          placement: document.getElementById("edit-placement").value
        }),
      }
        );

    setTimeout(() => {
      viewer.resize();
    }, 300);

    document.getElementById("edit-form").reset();


  } catch (err) {
    console.error(err);
    // alert("Error creating issue. See console for details.");
  }
};
// #endregion


// * issue filter submit
// #region issue filter submit
// ------------------------------------------ ISSUE FILTER SUBMIT ------------------------------------------------
document.getElementById("issue-filter-form").onsubmit = async (e) => {
  e.preventDefault();
  let params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const lineageUrn = window.lineageUrn;
  const authToken = localStorage.getItem("authTokenHemyProject");
  const issueType = document.getElementById("issue-types-filter").value;
  const hardAssetId = getAttrIdByTitle("Hard Asset Name");
  const hardAsset = document.getElementById("issue-filter-hard-asset").value;
  const functionalLocation = document.getElementById("issue-filter-functional-location").value;
  const functionalLocationId = getAttrIdByTitle("Functional Location");
  const assignedTo = document.getElementById("issue-filter-assigned-to").value;
  const startDate = document.getElementById("issue-filter-start-date").value;
  const dueDate = document.getElementById("issue-filter-due-date").value;
  const status = document.getElementById("issue-filter-status").value;
  const issueTaskId = getAttrIdByTitle("Issue/Task");
  try {
    const issueRes = await fetch("/api/acc/getissuesFiltered", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ lineageUrn, projectId, issueType, hardAsset, hardAssetId, functionalLocation, functionalLocationId, assignedTo, startDate, dueDate, status, issueTaskId }),
    });

    if (!issueRes.ok) {
      const responseText = await issueRes.text();
      throw new Error(
        `❌ Failed to get issues. Status: ${issueRes.status}\n${responseText}`
      );
    }

    const data = await issueRes.json();
    showNotification("Issue list retrieved successfully");

    const issues = data.details?.results || [];
    populateIssueListFiltered(issues); // function to populate the cards
    document.getElementById("issue-filter-panel").style.visibility = "hidden";
    document.getElementById("issue-panel").style.visibility = "visible";
    // viewer.resize();
  } catch (err) {
    console.error(err);
    alert("Error retrieving issues. See console for details.");
  }
};
// #endregion


// ! issue filter reset
// #region issue filter reset
// ------------------------------------------ RESET ISSUE FILTER ------------------------------------------------
async function resetIssueFilter() {
  document.getElementById("issue-filter-form").reset();
  const authToken = localStorage.getItem("authTokenHemyProject");
  let params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const lineageUrn = window.lineageUrn;
  const issueTaskId = getAttrIdByTitle("Issue/Task");

    try {
      const issueRes = await fetch("/api/acc/getissues", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ projectId, lineageUrn, issueTaskId }),
      });

      if (!issueRes.ok) {
        const responseText = await issueRes.text();
        throw new Error(
          `❌ Failed to get issues. Status: ${issueRes.status}\n${responseText}`
        );
        showErrorNotification(`Error retrieving issues: ${responseText}`);
      }

      const data = await issueRes.json();
      showNotification("Issue list retrieved successfully");

      const issues = data.details?.results || [];
      populateIssueList(issues); // function to populate the cards
      document.getElementById("issue-filter-panel").style.visibility = "hidden";
      document.getElementById("issue-panel").style.visibility = "visible";
    } catch (err) {
      console.error(err);
      alert("Error retrieving issues. See console for details.");
    }
}
// #endregion


// * issue task panel
// #region issue task panel
// ------------------------------------------ ISSUE TASK PANEL ------------------------------------------------
async function createIssueTaskPanel() {
  const viewer = window.viewerInstance;
  const panel = document.getElementById("issues-and-tasks-panel");

  // -------------------------
  // Hide all other panels
  // -------------------------
  const panelsToHide = [
    "fileContainer", "model-browser-panel", "sheetsPanel", "file-upload-panel",
    "issue-panel", "issue-details-panel", "issue-filter-panel",
    "task-panel", "task-details-panel", "task-filter-panel", "edit-details-panel"
  ];
  panelsToHide.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.visibility = "hidden";
  });

  // -------------------------
  // Toggle main panel visibility
  // -------------------------
  const isVisible = panel.style.visibility === "visible";
  panel.style.visibility = isVisible ? "hidden" : "visible";
  document.getElementById("preview").style.width = isVisible ? "97%" : "72%";

  setTimeout(() => {
    viewer.resize();
    viewer.fitToView();
  }, 300);

  // -------------------------
  // Load PushPin extension
  // -------------------------
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName) || await viewer.loadExtension(extName);
  pushpin_ext.pushPinManager.removeAllItems();

  // Skip fetch if panel is hidden
  if (panel.style.visibility === "hidden") {
    console.log("Issue list hidden. Skipping fetch.");
    pushpin_ext.endCreateItem();
    return;
  }

  // -------------------------
  // Get required parameters
  // -------------------------
  const authToken = localStorage.getItem("authTokenHemyProject");
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const lineageUrn = window.lineageUrn;
  let issueTaskId = getAttrIdByTitle("Issue/Task"); // make sure this exists in prod

  // If custom attributes were not loaded yet, load once and retry.
  if (!issueTaskId && projectId && authToken) {
    await getCustomAttributes(projectId, authToken);
    issueTaskId = getAttrIdByTitle("Issue/Task");
  }

  // -------------------------
  // Validate parameters
  // -------------------------
  if (!projectId || !issueTaskId) {
    console.error("Cannot fetch issues/tasks. Missing fields:", { projectId, lineageUrn, issueTaskId });
    showErrorNotification("Cannot load issues/tasks. Missing custom attribute mapping for Issue/Task.");
    return;
  }

  console.log("Fetching issues & tasks with:", { projectId, lineageUrn, issueTaskId });

  try {
    // -------------------------
    // Fetch issues
    // -------------------------
    const issueRes = await fetch("/api/acc/getissues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, lineageUrn, issueTaskId }),
    });

    if (!issueRes.ok) {
      const responseText = await issueRes.text();
      console.error("Failed to fetch issues:", responseText);
      throw new Error(`Failed to get issues. Status: ${issueRes.status}`);
    }

    const issueData = await issueRes.json();
    const issues = issueData.details?.results || [];
    await populateIssueList(issues);
    showNotification("Issue list retrieved successfully");

    // -------------------------
    // Fetch tasks
    // -------------------------
    const taskRes = await fetch("/api/acc/getTasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, lineageUrn, issueTaskId }),
    });

    if (!taskRes.ok) {
      const responseText = await taskRes.text();
      console.error("Failed to fetch tasks:", responseText);
      throw new Error(`Failed to get tasks. Status: ${taskRes.status}`);
    }

    const taskData = await taskRes.json();
    const tasks = taskData.details?.results || [];
    await populateTaskList(tasks);
    showNotification("Task list retrieved successfully");

    // Final viewer resize
    viewer.resize();
  } catch (err) {
    console.error("Error retrieving issues/tasks:", err);
    showNotification("Error retrieving issues/tasks. See console for details.");
  }
}
// #endregion


// ! task list
// #region task list
//-------------------------------- TASK LIST --------------------------------
async function createTaskPanel() {
  const viewer = window.viewerInstance;
  const modelBrowserPanel = document.getElementById("model-browser-panel");
  const filesPanel = document.getElementById("fileContainer");
  const panel = document.getElementById("task-panel");

  modelBrowserPanel.style.visibility = "hidden";
  filesPanel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "hidden";

  const isVisible = panel.style.visibility === "visible";
  panel.style.visibility = isVisible ? "hidden" : "visible";
  panel.style.visibility = isVisible
    ? (document.getElementById("preview").style.width = "97%")
    : (document.getElementById("preview").style.width = "72%");

  setTimeout(() => {
    viewer.resize();
    viewer.fitToView();
  }, 300);

  // 🛑 Check if already populated
  const container = document.querySelector(".task-list-container");
  if (isVisible) {
    console.log("Issue list already populated. Skipping fetch.");
    return;
  }

  // Load PushPin extension if not already loaded
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName);
  if (!pushpin_ext) {
    pushpin_ext = await viewer.loadExtension(extName);
  }

  pushpin_ext.pushPinManager.removeAllItems();

  const authToken = localStorage.getItem("authTokenHemyProject");
  let params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const lineageUrn = window.lineageUrn;
  const issueTaskId = getAttrIdByTitle("Issue/Task");

  try {
    const issueRes = await fetch("/api/acc/getTasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, lineageUrn, issueTaskId }),
    });

    if (!issueRes.ok) {
      const responseText = await issueRes.text();
      throw new Error(
        `❌ Failed to get issues. Status: ${issueRes.status}\n${responseText}`
      );
    }

    const data = await issueRes.json();
    showNotification("Issue list retrieved successfully");

    const issues = data.details?.results || [];
    populateTaskListFiltered(issues);
    viewer.resize();
  } catch (err) {
    console.error(err);
    alert("Error retrieving issues. See console for details.");
  }
}
// #endregion


// * task filter panel
// #region task filter panel
// ------------------------------------------ TASK FILTER PANEL ------------------------------------------------
async function taskFilterPanel() {
  const viewer = window.viewerInstance;
  const modelBrowserPanel = document.getElementById("model-browser-panel");
  const filesPanel = document.getElementById("fileContainer");
  modelBrowserPanel.style.visibility = "hidden";
  filesPanel.style.visibility = "hidden";

  const panel = document.getElementById("task-filter-panel");
  const isVisible = panel.style.visibility === "visible";
  panel.style.visibility = isVisible ? "hidden" : "visible";
  panel.style.visibility = isVisible
    ? (document.getElementById("preview").style.width = "97%")
    : (document.getElementById("preview").style.width = "72%");

  setTimeout(() => {
    window.viewerInstance.resize();
  }, 300);
}
// #endregion


// ! issue list
// #region issue list
//-------------------------------- ISSUES LIST --------------------------------
async function createIssuePanel() {
  const viewer = window.viewerInstance;
  const modelBrowserPanel = document.getElementById("model-browser-panel");
  const filesPanel = document.getElementById("fileContainer");
  const panel = document.getElementById("issue-panel");

  modelBrowserPanel.style.visibility = "hidden";
  filesPanel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "hidden";

  const isVisible = panel.style.visibility === "visible";
  panel.style.visibility = isVisible ? "hidden" : "visible";
  panel.style.visibility = isVisible
    ? (document.getElementById("preview").style.width = "97%")
    : (document.getElementById("preview").style.width = "72%");

  setTimeout(() => {
    viewer.resize();
    viewer.fitToView();
  }, 300);

    // Load PushPin extension if not already loaded
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName);
  if (!pushpin_ext) {
    pushpin_ext = await viewer.loadExtension(extName);
  }

  // pushpin_ext.pushPinManager.removeAllItems();

  // 🛑 Check if already populated
  const container = document.querySelector(".issue-list-container");
  // console.log("Issue list container children:", container.children.length);
  // console.log("Is issue list visible?", isVisible);

  if (document.getElementById("issues-and-tasks-panel").style.visibility === "visible") {
    console.log("Issue list already populated. Skipping fetch.");
    return;
  }

  const authToken = localStorage.getItem("authTokenHemyProject");
  let params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");
  const lineageUrn = window.lineageUrn;
  const issueTaskId = getAttrIdByTitle("Issue/Task");

  try {
    const issueRes = await fetch("/api/acc/getissues", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, lineageUrn, issueTaskId }),
    });

    if (!issueRes.ok) {
      const responseText = await issueRes.text();
      throw new Error(
        `❌ Failed to get issues. Status: ${issueRes.status}\n${responseText}`
      );
    }

    const data = await issueRes.json();
    showNotification("Issue list retrieved successfully");

    const issues = data.details?.results || [];
    populateIssueListFiltered(issues);
    viewer.resize();
  } catch (err) {
    console.error(err);
    alert("Error retrieving issues. See console for details.");
  }
}
// #endregion


// * issue filter panel
// #region issue filter panel
// ------------------------------------------ FILTER PANEL ------------------------------------------------
async function filterPanel() {
  const viewer = window.viewerInstance;
  const modelBrowserPanel = document.getElementById("model-browser-panel");
  const filesPanel = document.getElementById("fileContainer");
  modelBrowserPanel.style.visibility = "hidden";
  filesPanel.style.visibility = "hidden";

  const panel = document.getElementById("issue-filter-panel");
  const isVisible = panel.style.visibility === "visible";
  panel.style.visibility = isVisible ? "hidden" : "visible";
  panel.style.visibility = isVisible
    ? (document.getElementById("preview").style.width = "97%")
    : (document.getElementById("preview").style.width = "72%");

  setTimeout(() => {
    window.viewerInstance.resize();
  }, 300);
}
// #endregion


// ! issue list
// #region issue list
// ------------------------------------------ POPULATE ISSUE LIST ------------------------------------------------
async function populateIssueList(issues) {
  const container = document.querySelector(".issue-list-container");
  const smallContainer = document.querySelector(".issue-list-small-container");
  container.innerHTML = ""; // Clear old cards
  smallContainer.innerHTML = ""; // Clear old cards

  const viewer = window.viewerInstance;
  const viewerNode = viewer.model.getDocumentNode();

  // Load PushPin extension if not already loaded
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName);
  if (!pushpin_ext) {
    pushpin_ext = await viewer.loadExtension(extName);
  }

  // Optional: clear existing pushpins
  // pushpin_ext.pushPinManager.removeAllItems();

  const pushpinItems = [];

  issues.forEach((issue) => {
    const linkedDoc = issue.linkedDocuments?.[0]?.details;

    // Extract values from customAttributes
    const issueTask = issue.customAttributes?.find(attr => attr.title === "Issue/Task")?.value || "";
    const hardAssetName = issue.customAttributes?.find(attr => attr.title === "Hard Asset Name")?.value || "";
    const functionalLocation = issue.customAttributes?.find(attr => attr.title === "Functional Location")?.value || "";
    const thumbnailText = issue.customAttributes?.find(attr => attr.title === "Thumbnail Text")?.value || "";

    // 🟢 Render issue card
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `
      <div class="issue-card-layout">
        <div class="issue-id-section">
          <span class="issue-number">${issue.displayId || "-"}</span>
        </div>
        <div class="divider-big"></div>
        <div class="issue-details">
          <div class="issue-title"><strong>Issue: </strong> ${issue.title || "[Untitled]"}</div>
          <div><strong>Type:</strong> ${taskTypeMap[issue.issueSubtypeId] || issue.issueSubtypeId || "-"}</div>
          <div><strong>Status:</strong> ${issue.status || "-"}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
    card.addEventListener("click", () => focusOnIssuePin(linkedDoc));
    card.addEventListener("dblclick", (e) => {
      focusOnIssuePin(linkedDoc);
      editIssueTask(issue.id, 
                    issue.title, 
                    issue.description, 
                    issue.issueSubtypeId, 
                    issue.status, 
                    issue.assignedTo, 
                    issue.startDate, 
                    issue.dueDate, 
                   // issue.watchers,
                    issueTask,
                    hardAssetName,
                    functionalLocation,
                    thumbnailText,
                    linkedDoc
                  );
    });

    const smallCard = document.createElement("div");
    smallCard.className = "issue-small-card";
    smallCard.innerHTML = `      
      <span class="issue-small-number">${issue.displayId || "-"}</span>
      <span class="divider">|</span>
      <span class="issue-small-title">${issue.title || "-"}</span> 
      `;
    smallContainer.appendChild(smallCard);
    smallCard.addEventListener("click", () => focusOnIssuePin(linkedDoc));
    smallCard.addEventListener("dblclick", (e) => {
      focusOnIssuePin(linkedDoc);
      editIssueTask(issue.id, 
                    issue.title, 
                    issue.description, 
                    issue.issueSubtypeId, 
                    issue.status, 
                    issue.assignedTo, 
                    issue.startDate, 
                    issue.dueDate, 
                  //  issue.watchers,
                    issueTask,
                    hardAssetName,
                    functionalLocation,
                    thumbnailText,
                    linkedDoc
                  );
    });

    // 🟡 Collect pushpin if it's for the current viewable
    if (linkedDoc?.viewable?.guid === viewerNode.guid()) {
      const pushpinItem = {
        id: issue.id,
        label: `#${issue.displayId} - ${issue.title}`,
        status: issue.status,
        position: linkedDoc.position,
        objectId: linkedDoc.objectId,
        viewerState: linkedDoc.viewerState,
      };

      pushpinItems.push(pushpinItem);

      // 🔍 Restore viewer state on card click
      card.addEventListener("click", () => {
        focusOnIssuePin(linkedDoc);

        // 🔄 Remove 'selected' from all cards
        document
          .querySelectorAll(".issue-card")
          .forEach((c) => c.classList.remove("selected"));

        // ✅ Mark this one as selected
        card.classList.add("selected");

        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      smallCard.addEventListener("click", () => {
        focusOnIssuePin(linkedDoc);

        // 🔄 Remove 'selected' from all cards
        document
          .querySelectorAll(".issue-small-card")
          .forEach((c) => c.classList.remove("selected"));

        // ✅ Mark this one as selected
        smallCard.classList.add("selected");

        smallCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  });

  // 🟢 Load all pushpins once
  if (pushpinItems.length > 0) {
    pushpin_ext.loadItemsV2(pushpinItems);

    // Update pin colors after a slight delay to let DOM render them
    setTimeout(() => {
      issues.forEach((issue) => {
        const el = document.getElementById(issue.id);
        if (el) {
          el.style.backgroundColor = "#ff2b2b"; // high-contrast red for issues
          el.style.borderColor = "#ffffff";
          el.style.boxShadow = "0 0 0 2px #000000, 0 0 10px #ff2b2b";
          el.style.transform = "scale(1.15)";
        }
      });
    }, 200); // delay ensures elements are in DOM
  }
}
// #endregion


// * issue list filtered
// #region issue list filtered
// ------------------------------------------ POPULATE ISSUE LIST - FILTERED ------------------------------------------------
async function populateIssueListFiltered(issues) {
  const container = document.querySelector(".issue-list-container");
  container.innerHTML = ""; // Clear old cards

  const viewer = window.viewerInstance;
  const viewerNode = viewer.model.getDocumentNode();

  // Load PushPin extension if not already loaded
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName);
  if (!pushpin_ext) {
    pushpin_ext = await viewer.loadExtension(extName);
  }

  // Optional: clear existing pushpins
  pushpin_ext.pushPinManager.removeAllItems();

  const pushpinItems = [];

  issues.forEach((issue) => {
    const linkedDoc = issue.linkedDocuments?.[0]?.details;


    // Extract values from customAttributes
    const issueTask = issue.customAttributes?.find(attr => attr.title === "Issue/Task")?.value || "";
    const hardAssetName = issue.customAttributes?.find(attr => attr.title === "Hard Asset Name")?.value || "";
    const functionalLocation = issue.customAttributes?.find(attr => attr.title === "Functional Location")?.value || "";
    
    // 🟢 Render issue card
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `
      <div class="issue-card-layout">
        <div class="issue-id-section">
          <span class="issue-number">${issue.displayId || "-"}</span>
        </div>
        <div class="divider-big"></div>
        <div class="issue-details">
          <div class="issue-title"><strong>Issue:</strong> ${issue.title || "[Untitled]"}</div>
          <div><strong>Type:</strong>  ${taskTypeMap[issue.issueSubtypeId] || issue.issueSubtypeId || "-"}</div>
          <div><strong>Status:</strong> ${issue.status || "-"}</div>
        </div>
      </div>
    `;

    container.appendChild(card);
    card.addEventListener("click", () => focusOnIssuePin(linkedDoc));
    card.addEventListener("dblclick", (e) => {
      focusOnIssuePin(linkedDoc);
      editIssueTask(issue.id, 
                    issue.title, 
                    issue.description, 
                    issue.issueSubtypeId, 
                    issue.status, 
                    issue.assignedTo, 
                    issue.startDate, 
                    issue.dueDate, 
                   //  issue.watchers,
                    issueTask,
                    hardAssetName,
                    functionalLocation,
                    linkedDoc
                  );
    });


    // 🟡 Collect pushpin if it's for the current viewable
    if (linkedDoc?.viewable?.guid === viewerNode.guid()) {
      const pushpinItem = {
        id: issue.id,
        label: `#${issue.displayId} - ${issue.title}`,
        status: issue.status,
        position: linkedDoc.position,
        objectId: linkedDoc.objectId,
        viewerState: linkedDoc.viewerState,
      };

      pushpinItems.push(pushpinItem);

      // 🔍 Restore viewer state on card click
      card.addEventListener("click", () => {
        focusOnIssuePin(linkedDoc);

        // 🔄 Remove 'selected' from all cards
        document
          .querySelectorAll(".issue-card")
          .forEach((c) => c.classList.remove("selected"));

        // ✅ Mark this one as selected
        card.classList.add("selected");

        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  });

  // 🟢 Load all pushpins once
  if (pushpinItems.length > 0) {
    pushpin_ext.loadItemsV2(pushpinItems);

    // Update pin colors after a slight delay to let DOM render them
    setTimeout(() => {
      issues.forEach((issue) => {
        const el = document.getElementById(issue.id);
        if (el) {
          el.style.backgroundColor = "#ff2b2b"; // high-contrast red for issues
          el.style.borderColor = "#ffffff";
          el.style.boxShadow = "0 0 0 2px #000000, 0 0 10px #ff2b2b";
          el.style.transform = "scale(1.15)";
        }
      });
    }, 200); // delay ensures elements are in DOM
  }
}
// #endregion


// ! task list
// #region task list
// ------------------------------------------ POPULATE TASK LIST ------------------------------------------------
async function populateTaskList(tasks) {
  const container = document.querySelector(".task-list-container");
  const smallContainer = document.querySelector(".task-list-small-container");
  container.innerHTML = ""; // Clear old cards
  smallContainer.innerHTML = ""; // Clear old cards

  const viewer = window.viewerInstance;
  const viewerNode = viewer.model.getDocumentNode();

  // Load PushPin extension if not already loaded
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName);
  if (!pushpin_ext) {
    pushpin_ext = await viewer.loadExtension(extName);
  }

  // Optional: clear existing pushpins
  // pushpin_ext.pushPinManager.removeAllItems();

  const pushpinItems = [];

  tasks.forEach((task) => {
    const linkedDoc = task.linkedDocuments?.[0]?.details;

    // Extract values from customAttributes
    const issueTask = task.customAttributes?.find(attr => attr.title === "Issue/Task")?.value || "";
    const hardAssetName = task.customAttributes?.find(attr => attr.title === "Hard Asset Name")?.value || "";
    const functionalLocation = task.customAttributes?.find(attr => attr.title === "Functional Location")?.value || "";
    const thumbnailText = task.customAttributes?.find(attr => attr.title === "Thumbnail Text")?.value || "";

    // 🟢 Render issue card
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `
      <div class="issue-card-layout">
        <div class="issue-id-section">
          <span class="issue-number">${task.displayId || "-"}</span>
        </div>
        <div class="divider-big"></div>
        <div class="issue-details">
          <div class="issue-title"><strong>Task:</strong> ${task.title || "[Untitled]"}</div>
          <div><strong>Type:</strong> ${taskTypeMap[task.issueSubtypeId] || task.issueSubtypeId || "-"}</div>
          <div><strong>Status:</strong> ${task.status || "-"}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
    card.addEventListener("click", () => focusOnIssuePin(linkedDoc));
    card.addEventListener("dblclick", (e) => {
      focusOnIssuePin(linkedDoc);
      editIssueTask(task.id, 
                    task.title, 
                    task.description, 
                    task.issueSubtypeId, 
                    task.status, 
                    task.assignedTo, 
                    task.startDate, 
                    task.dueDate, 
                  //  task.watchers,
                    issueTask,
                    hardAssetName,
                    functionalLocation,
                    thumbnailText,
                    linkedDoc
                  );
    });


    const smallCard = document.createElement("div");
    smallCard.className = "task-small-card";
    smallCard.innerHTML = `      
      <span class="task-small-number">${task.displayId || "-"}</span>
      <span class="divider">|</span>
      <span class="task-small-title">${task.title || "-"}</span> 
      `;
    smallContainer.appendChild(smallCard);
    smallCard.addEventListener("click", () => focusOnIssuePin(linkedDoc));
    smallCard.addEventListener("dblclick", (e) => {
      focusOnIssuePin(linkedDoc);
      editIssueTask(task.id, 
                    task.title, 
                    task.description, 
                    task.issueSubtypeId, 
                    task.status, 
                    task.assignedTo, 
                    task.startDate, 
                    task.dueDate, 
                 //   task.watchers,
                    issueTask,
                    hardAssetName,
                    functionalLocation,
                    thumbnailText,
                    linkedDoc
                  );
    });


    // 🟡 Collect pushpin if it's for the current viewable
    if (linkedDoc?.viewable?.guid === viewerNode.guid()) {
      const pushpinItem = {
        id: task.id,
        label: `#${task.displayId} - ${task.title}`,
        status: task.status,
        position: linkedDoc.position,
        objectId: linkedDoc.objectId,
        viewerState: linkedDoc.viewerState,
      };

      pushpinItems.push(pushpinItem);

      // 🔍 Restore viewer state on card click
      card.addEventListener("click", () => {
        focusOnIssuePin(linkedDoc);

        // 🔄 Remove 'selected' from all cards
        document
          .querySelectorAll(".task-card")
          .forEach((c) => c.classList.remove("selected"));

        // ✅ Mark this one as selected
        card.classList.add("selected");

        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });

      smallCard.addEventListener("click", () => {
        focusOnIssuePin(linkedDoc);

        // 🔄 Remove 'selected' from all cards
        document
          .querySelectorAll(".task-small-card")
          .forEach((c) => c.classList.remove("selected"));

        // ✅ Mark this one as selected
        smallCard.classList.add("selected");

        smallCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  });

  // 🟢 Load all pushpins once
  if (pushpinItems.length > 0) {
    pushpin_ext.loadItemsV2(pushpinItems);

    // Update pin colors after a slight delay to let DOM render them
    setTimeout(() => {
      tasks.forEach((task) => {
        const el = document.getElementById(task.id);
        if (el) {
          el.style.backgroundColor = "#00e5ff"; // high-contrast cyan for tasks
          el.style.borderColor = "#ffffff";
          el.style.boxShadow = "0 0 0 2px #000000, 0 0 10px #00e5ff";
          el.style.transform = "scale(1.15)";
        }
      });
    }, 200); // delay ensures elements are in DOM
  }
}
// #endregion


// * task list filtered
// #region Task List Filtered
// ------------------------------------------ POPULATE TASK LIST - FILTERED ------------------------------------------------
async function populateTaskListFiltered(tasks) {
  const container = document.querySelector(".task-list-container");
  container.innerHTML = ""; // Clear old cards

  const viewer = window.viewerInstance;
  const viewerNode = viewer.model.getDocumentNode();

  // Load PushPin extension if not already loaded
  const extName = "Autodesk.BIM360.Extension.PushPin";
  let pushpin_ext = viewer.getExtension(extName);
  if (!pushpin_ext) {
    pushpin_ext = await viewer.loadExtension(extName);
  }

  // Optional: clear existing pushpins
  pushpin_ext.pushPinManager.removeAllItems();

  const pushpinItems = [];

  tasks.forEach((task) => {
    const linkedDoc = task.linkedDocuments?.[0]?.details;
    

    // Extract values from customAttributes
    const issueTask = task.customAttributes?.find(attr => attr.title === "Issue/Task")?.value || "";
    const hardAssetName = task.customAttributes?.find(attr => attr.title === "Hard Asset Name")?.value || "";
    const functionalLocation = task.customAttributes?.find(attr => attr.title === "Functional Location")?.value || "";
    const thumbnailText = task.customAttributes?.find(attr => attr.title === "Thumbnail Text")?.value || "";

    // 🟢 Render issue card
    const card = document.createElement("div");
    card.className = "issue-card";
    card.innerHTML = `
      <div class="issue-card-layout">
        <div class="issue-id-section">
          <span class="issue-number">${task.displayId || "-"}</span>
        </div>
        <div class="divider-big"></div>
        <div class="issue-details">
          <div class="issue-title"><strong>Task:</strong> ${task.title || "[Untitled]"}</div>
          <div><strong>Type:</strong> ${taskTypeMap[task.issueSubtypeId] || task.issueSubtypeId || "-"}</div>
          <div><strong>Status:</strong> ${task.status || "-"}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
    card.addEventListener("click", () => focusOnIssuePin(linkedDoc));
    card.addEventListener("dblclick", (e) => {
      focusOnIssuePin(linkedDoc);
      editIssueTask(task.id, 
                    task.title, 
                    task.description, 
                    task.issueSubtypeId, 
                    task.status, 
                    task.assignedTo, 
                    task.startDate, 
                    task.dueDate, 
                 //   task.watchers,
                    issueTask,
                    hardAssetName,
                    functionalLocation,
                    thumbnailText,
                    linkedDoc
                  );
    });

    // 🟡 Collect pushpin if it's for the current viewable
    if (linkedDoc?.viewable?.guid === viewerNode.guid()) {
      const pushpinItem = {
        id: task.id,
        label: `#${task.displayId} - ${task.title}`,
        status: task.status,
        position: linkedDoc.position,
        objectId: linkedDoc.objectId,
        viewerState: linkedDoc.viewerState,
      };

      pushpinItems.push(pushpinItem);

      // 🔍 Restore viewer state on card click
      card.addEventListener("click", () => {
        focusOnIssuePin(linkedDoc);

        // 🔄 Remove 'selected' from all cards
        document
          .querySelectorAll(".issue-card")
          .forEach((c) => c.classList.remove("selected"));

        // ✅ Mark this one as selected
        card.classList.add("selected");

        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  });

  // 🟢 Load all pushpins once
  if (pushpinItems.length > 0) {
    pushpin_ext.loadItemsV2(pushpinItems);

    // Update pin colors after a slight delay to let DOM render them
    setTimeout(() => {
      tasks.forEach((task) => {
        const el = document.getElementById(task.id);
        if (el) {
          el.style.backgroundColor = "#00e5ff"; // high-contrast cyan for tasks
          el.style.borderColor = "#ffffff";
          el.style.boxShadow = "0 0 0 2px #000000, 0 0 10px #00e5ff";
          el.style.transform = "scale(1.15)";
        }
      });
    }, 200); // delay ensures elements are in DOM
  }
}
// #endregion


// ! Issue types
// #region Issue Types
// ------------------------------------------ ISSUE TYPES ------------------------------------------------
export async function loadIssueTypes(projectId, authToken) {
  await getCustomAttributes(projectId, authToken);
  await getProjectMembers(projectId, authToken);
  await getCompanies(projectId, authToken);

  const res = await fetch(`/api/acc/getIssueType?projectId=${projectId}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${authToken}`,
    },
  });

  if (!res.ok) {
    console.error("Failed to fetch issue types");
    return;
  }

  const { results } = await res.json();

  // Elements
  const issueSelect = document.getElementById("issue-types");
  const issueFilter = document.getElementById("issue-types-filter");
  const issueList = document.querySelector(".issue-type-selector");

  const taskSelect = document.getElementById("task-types");
  const taskFilter = document.getElementById("task-types-filter");
  const taskList = document.querySelector(".task-type-selector");

  const editSelect = document.getElementById("edit-types");

  issueSelect.innerHTML = "";
  // issueFilter.innerHTML = "";
  issueList.innerHTML = "<h4>Select Issue Type</h4>";

  taskSelect.innerHTML = "";
  // taskFilter.innerHTML = "";
  taskList.innerHTML = "<h4>Select Task Type</h4>";


  editSelect.innerHTML = "";

  results.forEach((type) => {
    if (!type.isActive) return;

    const issueGroup = document.createElement("div");
    issueGroup.classList.add("issue-group");

    const taskGroup = document.createElement("div");
    taskGroup.classList.add("issue-group");

    const label = document.createElement("div");
    label.classList.add("group-label");
    label.textContent = type.title;

    const label2 = label.cloneNode(true);

    issueGroup.appendChild(label);
    taskGroup.appendChild(label2);

    const issueOptgroup = document.createElement("optgroup");
    const taskOptgroup = document.createElement("optgroup");
    issueOptgroup.label = type.title;
    taskOptgroup.label = type.title;

    type.subtypes.forEach((subtype) => {
      if (!subtype.isActive) return;

      taskTypeMap[subtype.id] = subtype.title;

      // Issue select
      const issueOption = document.createElement("option");
      issueOption.value = subtype.id;
      issueOption.textContent = subtype.title;
      issueOptgroup.appendChild(issueOption);

      const issueVisual = document.createElement("div");
      issueVisual.classList.add("issue-option");
      issueVisual.textContent = subtype.title;
      issueVisual.dataset.subtypeId = subtype.id;
      issueGroup.appendChild(issueVisual);

      // Task select
      const taskOption = issueOption.cloneNode(true);
      taskOptgroup.appendChild(taskOption);

      const taskVisual = issueVisual.cloneNode(true);
      taskVisual.classList.replace("issue-option", "task-option");
      taskGroup.appendChild(taskVisual);
    });

    if (issueOptgroup.children.length > 0) {
      issueSelect.appendChild(issueOptgroup);
      issueFilter.appendChild(issueOptgroup.cloneNode(true));
      issueList.appendChild(issueGroup);
    }

    if (taskOptgroup.children.length > 0) {
      taskSelect.appendChild(taskOptgroup);
      taskFilter.appendChild(taskOptgroup.cloneNode(true));
      taskList.appendChild(taskGroup);


      // EDIT FORM
      editSelect.appendChild(taskOptgroup.cloneNode(true));
    }
  });

  // ✅ Issue selection behavior
  document.querySelectorAll(".issue-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".issue-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");

      const subtypeId = opt.dataset.subtypeId;
      document.getElementById("issue-types").value = subtypeId;

      document.getElementById("issue-form").style.display = "block";
      document.querySelector(".issue-type-selector").style.display = "none";

      document.getElementById("issue-form").scrollIntoView({ behavior: "smooth" });

      document.getElementById("issue-title").value =
        opt.textContent + " - " + document.getElementById("issue-title").value;
    });
  });

  // ✅ Task selection behavior
  document.querySelectorAll(".task-option").forEach((opt) => {
    opt.addEventListener("click", () => {
      document.querySelectorAll(".task-option").forEach((o) => o.classList.remove("selected"));
      opt.classList.add("selected");

      const subtypeId = opt.dataset.subtypeId;
      document.getElementById("task-types").value = subtypeId;

      document.getElementById("task-form").style.display = "block";
      document.querySelector(".task-type-selector").style.display = "none";

      document.getElementById("task-form").scrollIntoView({ behavior: "smooth" });

      document.getElementById("task-title").value =
        opt.textContent + " - " + document.getElementById("task-title").value;
    });
  });
}
// #endregion


// * Cusom Attributes
// #region Custom Attributes
// ------------------------------------------ CUSTOM ATTRIBUTES ------------------------------------------------
async function getCustomAttributes(projectId, authToken) {
  const res = await fetch("/api/acc/getCustomAttributes", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ projectId }),
  });

  if (!res.ok) {
    console.error("Failed to fetch issue types");
    return;
  }

  const { results } = await res.json(); // APS returns raw object with `results` array
  window.customAttributeDefinitions = results;
}

function getAttrIdByTitle(title) {
  if (!Array.isArray(window.customAttributeDefinitions)) {
    console.warn("Custom attribute definitions not loaded yet.");
    return null;
  }

  const target = String(title || "").trim().toLowerCase();
  const match = window.customAttributeDefinitions.find((attr) => {
    const candidate = String(attr?.title || "").trim().toLowerCase();
    return candidate === target;
  });
  if (!match) {
    console.warn(`Attribute with title "${title}" not found`);
    return null;
  }

  return match.id;
}
// #endregion


// ! Project Members Watchers
// #region Members Watchers
// ------------------------------------------ PROJECT MEMBERS ------------------------------------------------
// project members elligble for being assigned to or being watcher
async function getProjectMembers(projectId, authToken) {
  const res = await fetch("/api/acc/getProjectMembers", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ projectId }),
  });

  if (!res.ok) {
    console.error("Failed to fetch issue types");
    return;
  }

  const { results } = await res.json(); // APS returns raw object with `results` array

  const select = document.getElementById("issue-assigned-to");
  const selectFilter = document.getElementById("issue-filter-assigned-to");
 // const selectWatchers = document.getElementById("issue-watchers");
  const selectTask = document.getElementById("task-assigned-to");
 // const selectWatchersTask = document.getElementById("task-watchers");
  const selectTaskFilter = document.getElementById("task-filter-assigned-to");
  const selectEdit = document.getElementById("edit-assigned-to");
  //const selectWatchersEdit = document.getElementById("edit-watchers");
  select.innerHTML = ""; // clear old options
 // selectWatchers.innerHTML = ""; // clear old options
  selectTask.innerHTML = ""; // clear old options
 // selectWatchersTask.innerHTML = ""; // clear old options

  results.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.autodeskId;
    option.textContent = user.name;
    option.setAttribute("data-type", "user"); // <-- Add this line
    select.appendChild(option);
    selectFilter.appendChild(option.cloneNode(true)); // Clone to filter select
    selectTask.appendChild(option.cloneNode(true)); // Clone to task select
    selectTaskFilter.appendChild(option.cloneNode(true)); // Clone to task filter select
    selectEdit.appendChild(option.cloneNode(true)); // Clone to edit select

    const watcherOption = document.createElement("option");
    watcherOption.value = user.autodeskId;
    watcherOption.textContent = user.name;
    watcherOption.setAttribute("data-type", "user"); // <-- Add this line
   // selectWatchers.appendChild(watcherOption);
   // selectWatchersTask.appendChild(watcherOption.cloneNode(true)); // Clone to task watchers select
   // selectWatchersEdit.appendChild(watcherOption.cloneNode(true)); // Clone to edit watchers select
  });
}
// #endregion


// * Companies Watchers
// #region Companies Watchers
// ------------------------------------------ PROJECT MEMBERS - WATCHERS ------------------------------------------------
// project members elligble for being assigned to or being watcher
async function getCompanies(projectId, authToken) {
  const res = await fetch("/api/acc/getCompanies", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ projectId }),
  });

  if (!res.ok) {
    console.error("Failed to fetch issue types");
    return;
  }

  const { results } = await res.json(); // APS returns raw object with `results` array

  const select = document.getElementById("issue-assigned-to");
  const selectTask = document.getElementById("task-assigned-to");
 // const selectWatchers = document.getElementById("issue-watchers");
 // const selectWatchersTask = document.getElementById("task-watchers");
  const selectEdit = document.getElementById("edit-assigned-to");
 // const selectWatchersEdit = document.getElementById("edit-watchers");

  results.forEach((companies) => {
    const option = document.createElement("option");
    option.value = companies.id;
    option.textContent = companies.name;
    option.setAttribute("data-type", "company"); // <-- Add this line
    select.appendChild(option);
    selectTask.appendChild(option.cloneNode(true)); // Clone to task select
    selectEdit.appendChild(option.cloneNode(true)); // Clone to edit select

    const watcherOption = document.createElement("option");
    watcherOption.value = companies.id;
    watcherOption.textContent = companies.name;
    watcherOption.setAttribute("data-type", "company"); // <-- Add this line
    //selectWatchers.appendChild(watcherOption);
   //selectWatchersTask.appendChild(watcherOption.cloneNode(true)); // Clone to task watchers select
   // selectWatchersEdit.appendChild(watcherOption.cloneNode(true)); // Clone to edit watchers select
  });

 // const watchersSelect = new Choices("#issue-watchers", {
  //  placeholderValue: "Select watchers",
 //   removeItemButton: true,
//    shouldSort: false,
// });

 // const watchersSelectTask = new Choices("#task-watchers", {
 //   placeholderValue: "Select watchers",
 //   removeItemButton: true,
 //   shouldSort: false,
 // });

 // watchersSelectEdit = new Choices("#edit-watchers", {
  //  placeholderValue: "Select watchers",
 //   removeItemButton: true,
//    shouldSort: false,
 // });
//}
// #endregion


async function loadEditIssueThumbnail(issueId) {
  const img = document.getElementById("edit-thumbnail-image");
  if (!img || !issueId) return;

  // Clear immediately so stale thumbnails don't linger
  img.removeAttribute("src");

  const authToken = localStorage.getItem("authTokenHemyProject");
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("id");

  try {
    const resp = await fetch("/api/acc/getIssueThumbnail", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ projectId, issueId }),
    });

    if (!resp.ok) {
      console.error("Thumbnail fetch failed:", await resp.text());
      return;
    }

    const data = await resp.json();
    if (data?.thumbnailUrl) {
      // Do not append query params to signed S3 URLs; it invalidates signatures.
      img.src = data.thumbnailUrl;
    }
  } catch (err) {
    console.error("Thumbnail load error:", err);
  }
}

const editThumbBtn = document.getElementById("edit-capture-thumb-btn");
if (editThumbBtn) {
  editThumbBtn.addEventListener("click", () => {
    const currentId = window.__currentEditIssueId;
    loadEditIssueThumbnail(currentId);
  });
}

const openMarkupBtn = document.getElementById("edit-open-markup-btn");
if (openMarkupBtn) {
  openMarkupBtn.addEventListener("click", () => {
    enterMarkupModeForIssue(window.__currentEditIssueId);
  });
}

const markupCancelBtn = document.getElementById("markup-cancel-btn");
if (markupCancelBtn) {
  markupCancelBtn.addEventListener("click", () => {
    exitMarkupMode();
  });
}

const markupSaveBtn = document.getElementById("markup-save-btn");
if (markupSaveBtn) {
  markupSaveBtn.addEventListener("click", async () => {
    const issueId = window.__currentEditIssueId;
    // Finalize current text/shape edit so generateData captures latest changes.
    try {
      window.markupsExt?.leaveEditMode();
    } catch (_) {}

    const markupSvg = getCurrentMarkupSvg();
    if (issueId && markupSvg) {
      saveIssueMarkup(issueId, markupSvg);
    }

    if (issueId) {
      updateEditThumbnailText(issueId);
      await syncThumbnailTextToAcc(issueId);
    }

    const baseScreenshot = await captureViewerDataUrl();
    const dataUrl = await composeMarkupIntoScreenshot(baseScreenshot, markupSvg);
    if (dataUrl) {
      // Best-effort sync to ACC: store screenshot as issue attachment.
      try {
        const authToken = localStorage.getItem("authTokenHemyProject");
        const params = new URLSearchParams(window.location.search);
        const projectId = params.get("id");
        const syncResp = await fetch("/api/acc/syncMarkupAttachment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ projectId, issueId, dataUrl }),
        });
        if (!syncResp.ok) {
          console.error("ACC attachment sync failed:", await syncResp.text());
        }
      } catch (err) {
        console.error("ACC attachment sync error:", err);
      }
    } else {
      console.warn("No persistent screenshot captured for thumbnail.");
    }

    exitMarkupMode();
  });
}

// ! Edit Issue/Task
// #region Edit Issue/Task
// ------------------------------------------ EDIT FORM ------------------------------------------------
window.editIssueTask = async function (
  id,
  title,
  description,
  issueSubtypeId,
  status,
  assignedTo,
  startDate,
  dueDate,
  issueTask,
  hardAssetName,
  functionalLocation,
  thumbnailText,
  pinDetails
) {
  const viewer = window.viewerInstance;
  const modelBrowserPanel = document.getElementById("model-browser-panel");
  const filesPanel = document.getElementById("fileContainer");
  const panel = document.getElementById("edit-details-panel");

  modelBrowserPanel.style.visibility = "hidden";
  filesPanel.style.visibility = "hidden";
  document.getElementById("issues-and-tasks-panel").style.visibility = "hidden";

  panel.style.visibility = "visible";
  panel.style.visibility = (document.getElementById("preview").style.width = "72%");

  setTimeout(() => {
    viewer.resize();
  }, 300);

  // Force viewer to the issue/task pushpin view while opening Edit.
  if (pinDetails) {
    focusOnIssuePin(pinDetails);
  }

  // Clear previous form values
  document.getElementById("edit-panel-title").value = "";
  document.getElementById("edit-title").value = "";
  document.getElementById("edit-issue-task-field").value = "";
  document.getElementById("edit-hard-asset").value = "";
  document.getElementById("edit-functional-location").value = "";
  document.getElementById("edit-description").value = "";
  document.getElementById("edit-start-date").value = "";
  document.getElementById("edit-due-date").value = "";
  const thumbField = document.getElementById("edit-thumbnail-text-field");
  if (thumbField) thumbField.value = "";

  // Populate form fields
  document.getElementById("edit-panel-title").textContent = "Edit - " + title;
  document.getElementById("edit-panel-title").setAttribute("issue-id", id);
  document.getElementById("edit-title").value = title;
  document.getElementById("edit-types").value = issueSubtypeId || "";
  document.getElementById("edit-issue-task-field").value = issueTask || "";
  document.getElementById("edit-hard-asset").value = hardAssetName || "";
  document.getElementById("edit-functional-location").value = functionalLocation || "";
  document.getElementById("edit-description").value = description || "";
  document.getElementById("edit-assigned-to").value = assignedTo || "";
  if (thumbField && String(thumbnailText || "").trim()) {
    thumbField.value = String(thumbnailText);
  }
  //if (watchersSelectEdit) {
   // watchersSelectEdit.removeActiveItems(); // clear old selection
    //if (Array.isArray(watchers)) {
    //  watchersSelectEdit.setChoiceByValue(watchers); // watchers is array of IDs
   // }
 // }
  document.getElementById("edit-start-date").value = startDate || "";
  document.getElementById("edit-due-date").value = dueDate || "";
  document.getElementById("edit-placement").value = window.modelName || "";

  // Load the ACC-native issue thumbnail for this issue.
  window.__currentEditIssueId = id;
  loadEditIssueThumbnail(id);
  updateEditThumbnailText(id);
  exitMarkupMode();
  setMarkupToolbarVisible(false);
  showMarkupBanner(false);
}
// #endregion



// function toBase64(file) {
//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.readAsDataURL(file);
//     reader.onload = () => resolve(reader.result.split(',')[1]); // Remove "data:*/*;base64,"
//     reader.onerror = error => reject(error);
//   });
// }

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // Remove the data:image/...;base64, part
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
}
}
