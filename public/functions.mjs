export function toolbarButtons2D(viewer) {
  // viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, function () {
  //   console.log("Geometry loaded, setting up toolbar buttons");
  //   let models = window.viewerInstance.impl.modelQueue().getModels();
  //   let urn = models[0].getDocumentNode().getDefaultGeometry().children[1]
  //     .data.urn; // Get the URN of the first model
  //   const modelUrn = urn.split("fs.file:")[1].split("/")[0];
  //   window.modelUrn = modelUrn;

  //   viewer
  //     .loadExtension("Autodesk.Viewing.MarkupsCore")
  //     .then(function (markupsExt) {
  //       console.log("MarkupsCore loaded");
  //       window.markupsExt = markupsExt;

  //       // Now load your toolbar button extension — markupsExt guaranteed ready!
  //       window.viewerInstance.loadExtension("PencilButton");
  //       window.viewerInstance.loadExtension("ShapeButton");
  //       window.viewerInstance.loadExtension("TextButton");
  //       window.viewerInstance.loadExtension("SaveButton");
  //     });

  //   viewer.unloadExtension("Autodesk.Explode");
  //   const modelTools = viewer.toolbar.getControl("modelTools");
  //   const navTools = viewer.toolbar.getControl("navTools");

  //   const measureTools = viewer.toolbar.getControl("measureTools");
  //   viewer.loadExtension("Autodesk.Viewing.ZoomWindow");
  //   //navTools.removeControl('toolbar-zoomTool');

  //   const settingsTools = viewer.toolbar.getControl("settingsTools");
  //   settingsTools.removeControl("toolbar-modelStructureTool");

  //   document.getElementById("preview").style.width = "97%";
  //   document.getElementById("sidebar").style.visibility = "hidden";
  //   document.getElementById("viewerSidebar").style.visibility = "visible";
  //   // window.viewerInstance.loadExtension('RightSideToggleButton');

  //   setTimeout(() => {
  //     viewer.resize();
  //     viewer.fitToView();
  //   }, 300);
  // });

     console.log("Geometry loaded, setting up toolbar buttons");
    // let models = window.viewerInstance.impl.modelQueue().getModels();
    // let urn = models[0].getDocumentNode().getDefaultGeometry().children[1]
    //   .data.urn; // Get the URN of the first model
    // const modelUrn = urn.split("fs.file:")[1].split("/")[0];
    // window.modelUrn = modelUrn;

    viewer
      .loadExtension("Autodesk.Viewing.MarkupsCore")
      .then(function (markupsExt) {
        console.log("MarkupsCore loaded");
        window.markupsExt = markupsExt;

        // Now load your toolbar button extension — markupsExt guaranteed ready!
        window.viewerInstance.loadExtension("PencilButton");
        window.viewerInstance.loadExtension("ShapeButton");
        window.viewerInstance.loadExtension("TextButton");
        window.viewerInstance.loadExtension("SaveButton");
      });

    viewer.unloadExtension("Autodesk.Explode");
    const modelTools = viewer.toolbar.getControl("modelTools");
    const navTools = viewer.toolbar.getControl("navTools");

    const measureTools = viewer.toolbar.getControl("measureTools");
    viewer.loadExtension("Autodesk.Viewing.ZoomWindow");
    //navTools.removeControl('toolbar-zoomTool');

    const settingsTools = viewer.toolbar.getControl("settingsTools");
    settingsTools.removeControl("toolbar-modelStructureTool");

    document.getElementById("preview").style.width = "97%";
    document.getElementById("fileContainer").style.visibility = "hidden";
    document.getElementById("viewerSidebar").style.visibility = "visible";
    // window.viewerInstance.loadExtension('RightSideToggleButton');

    setTimeout(() => {
      viewer.resize();
      viewer.fitToView();
    }, 300);
}







export function sidebarButtons3D(viewer) {
  console.log("Geometry loaded, setting up sidebar buttons");

  viewer
    .loadExtension("Autodesk.Viewing.MarkupsCore")
    .then(function (markupsExt) {
      window.markupsExt = markupsExt;
      window.viewerInstance.loadExtension("PencilButton");
      window.viewerInstance.loadExtension("ShapeButton");
      window.viewerInstance.loadExtension("TextButton");
      window.viewerInstance.loadExtension("SaveButton");
    })
    .catch((err) => console.error("Failed to load MarkupsCore:", err));

  viewer.unloadExtension("Autodesk.Explode");
  const modelTools = viewer.toolbar.getControl("modelTools");
  const navTools = viewer.toolbar.getControl("navTools");

  const measureTools = viewer.toolbar.getControl("measureTools");
  viewer.loadExtension("Autodesk.Viewing.ZoomWindow");
  //navTools.removeControl('toolbar-zoomTool');

  const settingsTools = viewer.toolbar.getControl("settingsTools");
  settingsTools.removeControl("toolbar-modelStructureTool");

  document.getElementById("preview").style.width = "97%";
  document.getElementById("fileContainer").style.visibility = "hidden";
  document.getElementById("viewerSidebar").style.visibility = "visible";

  if(window.innerWidth <= 850){
    const hamburgerBtn = document.getElementsByClassName("hamburger-btn")[0]; // first match
    if (hamburgerBtn) {
      hamburgerBtn.style.display = "block";
    }
  }

  setTimeout(() => {
    viewer.resize();
    viewer.fitToView();
  }, 300);
}

// ******************** TOOLBAR BUTTONS ********************

class PencilButton extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.button = null;
    this.group = null;
    this.toggled = false;
  }

  load() {
    // If toolbar already exists, create the button immediately
    if (this.viewer.toolbar) {
      this.createButton();
    } else {
      // Wait for toolbar to be created
      this.viewer.addEventListener(
        Autodesk.Viewing.TOOLBAR_CREATED_EVENT,
        () => this.createButton()
      );
    }

    return true;
  }


  unload() {
    if (this.group) {
      this.viewer.toolbar.removeControl(this.group);
    }
    return true;
  }

  createButton() {
    const TOOLBAR_GROUP_ID = "markupsTools";
    const BUTTON_ID = "PencilButton";
    const EDIT_LAYER = "markups-svg";
    const TOGGLED_ICON = "url(./images/pencil-toggled.svg)";
    const DEFAULT_ICON = "url(./images/pencil.svg)";

    this.markupsLoaded = false;
    this.toggled = false;

    // Helper: force flex styling on the markup toolbar
    const applyToolbarStyle = () => {
      const group = this.viewer.toolbar.getControl(TOOLBAR_GROUP_ID);
      if (group?.container) {
        group.container.style.display = "flex";
        group.container.style.flexDirection = "column";
        group.container.style.alignItems = "flex-start";
      }
    };

    // Create button
    this.button = new Autodesk.Viewing.UI.Button(BUTTON_ID);
    this.button.setToolTip("Toggle Markup Tool");
    this.button.setIcon("url(./images/faro.svg)");

    this.button.onClick = () => {
      this.toggled = !this.toggled;
      console.log("Toggled:", this.toggled);

      // Update button UI
      this.button.container.classList.toggle("active");
      this.button.container.style.backgroundImage = this.toggled
        ? TOGGLED_ICON
        : DEFAULT_ICON;

      if (this.toggled) {
        // Show Markups extension UI
        if (!window.markupsExt.markups) {
          window.markupsExt.createMarkupSheet();
        }
        window.markupsExt.show();

        //const seedUrn = this.viewer.model.getSeedUrn();
        let guid = window.viewerInstance.model.getDocumentNode();

        // Find the SVG that matches the current model URN
        const matchingSvg = window.svgData?.find(svg => svg.name === guid.data.guid);
        

        if (matchingSvg?.content) {
          window.markupsExt.loadMarkups(matchingSvg.content, EDIT_LAYER);
          this.markupsLoaded = true;
          window.markupsExt.enterEditMode(EDIT_LAYER);
        } else {
          window.markupsExt.enterEditMode();
        }


        // Re-apply styling after Autodesk resets DOM
        setTimeout(applyToolbarStyle, 300);

        // Change to freehand tool
        setTimeout(() => {
          try {
            const rectTool =
              new Autodesk.Viewing.Extensions.Markups.Core.EditModeFreehand(
                window.markupsExt
              );
            window.markupsExt.changeEditMode(rectTool);
            Autodesk.Viewing.Extensions.Markups.Core.Utils.showLmvToolsAndPanels(
              window.viewerInstance
            );
          } catch (err) {
            console.error("Failed to change edit mode:", err);
          }
        }, 200);
      } else {
        window.markupsExt.leaveEditMode();
        window.markupsExt.hide();

        // Re-apply toolbar styles when exiting edit mode
        setTimeout(applyToolbarStyle, 300);
      }
    };

    // Create toolbar group if it doesn't exist
    const toolbar = this.viewer.getToolbar();
    this.group = this.viewer.toolbar.getControl(TOOLBAR_GROUP_ID);
    if (!this.group) {
      this.group = new Autodesk.Viewing.UI.ControlGroup(TOOLBAR_GROUP_ID);
      toolbar.addControl(this.group);
      console.log("Added pencil button");
    }
    this.group.addControl(this.button);

    // Initial style setup for toolbar group
    Object.assign(this.group.container.style, {
      position: "absolute",
      right: "10px",
      top: "-50vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      zIndex: "10000",
      pointerEvents: "auto",
    });

    // Button styling
    Object.assign(this.button.container.style, {
      backgroundImage: DEFAULT_ICON,
      backgroundSize: "25px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    });

    // Apply flex styling in case Autodesk viewer delayed loading
    setTimeout(applyToolbarStyle, 300);
  }
}

// ***************** TEXT BUTTON *****************

class TextButton extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.button = null;
    this.group = null;
    this.toggled = false;
  }

  load() {
    this.createButton();
    return true;
  }

  unload() {
    if (this.group) {
      this.viewer.toolbar.removeControl(this.group);
    }
    return true;
  }

createButton() {
    const TOOLBAR_GROUP_ID = "markupsTools";
    const BUTTON_ID = "TextButton";
    const EDIT_LAYER = "markups-svg";
    const TOGGLED_ICON = "url(./images/text-toggled.svg)";
    const DEFAULT_ICON = "url(./images/text.svg)";

    this.markupsLoaded = false;
    this.toggled = false;

    // Helper: force flex styling on the markup toolbar
    const applyToolbarStyle = () => {
      const group = this.viewer.toolbar.getControl(TOOLBAR_GROUP_ID);
      if (group?.container) {
        group.container.style.display = "flex";
        group.container.style.flexDirection = "column";
        group.container.style.alignItems = "flex-start";
      }
    };

    // Create button
    this.button = new Autodesk.Viewing.UI.Button(BUTTON_ID);
    this.button.setToolTip("Toggle Markup Tool");
    this.button.setIcon("url(./images/faro.svg)");

    this.button.onClick = () => {
      this.toggled = !this.toggled;
      console.log("Toggled:", this.toggled);

      // Update button UI
      this.button.container.classList.toggle("active");
      this.button.container.style.backgroundImage = this.toggled
        ? TOGGLED_ICON
        : DEFAULT_ICON;

      if (this.toggled) {
        // Show Markups extension UI
        if (!window.markupsExt.markups) {
          window.markupsExt.createMarkupSheet();
        }
        window.markupsExt.show();

        //const seedUrn = this.viewer.model.getSeedUrn();
        let guid = window.viewerInstance.model.getDocumentNode();

        // Find the SVG that matches the current model URN
        const matchingSvg = window.svgData?.find(svg => svg.name === guid.data.guid);

        if (matchingSvg?.content) {
          window.markupsExt.loadMarkups(matchingSvg.content, EDIT_LAYER);
          this.markupsLoaded = true;
          window.markupsExt.enterEditMode(EDIT_LAYER);
        } else {
          window.markupsExt.enterEditMode();
        }

        // Re-apply styling after Autodesk resets DOM
        setTimeout(applyToolbarStyle, 300);

        // Change to freehand tool
        setTimeout(() => {
          try {
            const rectTool =
              new Autodesk.Viewing.Extensions.Markups.Core.EditModeText(
                window.markupsExt
              );
            window.markupsExt.changeEditMode(rectTool);
            Autodesk.Viewing.Extensions.Markups.Core.Utils.showLmvToolsAndPanels(
              window.viewerInstance
            );
          } catch (err) {
            console.error("Failed to change edit mode:", err);
          }
        }, 200);
      } else {
        window.markupsExt.leaveEditMode();
        window.markupsExt.hide();

        // Re-apply toolbar styles when exiting edit mode
        setTimeout(applyToolbarStyle, 300);
      }
    };

    // Create toolbar group if it doesn't exist
    const toolbar = this.viewer.getToolbar();
    this.group = this.viewer.toolbar.getControl(TOOLBAR_GROUP_ID);
    if (!this.group) {
      this.group = new Autodesk.Viewing.UI.ControlGroup(TOOLBAR_GROUP_ID);
      toolbar.addControl(this.group);
      console.log("Added text button");
    }
    this.group.addControl(this.button);

    // Initial style setup for toolbar group
    Object.assign(this.group.container.style, {
      position: "absolute",
      right: "10px",
      top: "-50vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      zIndex: "10000",
      pointerEvents: "auto",
    });

    // Button styling
    Object.assign(this.button.container.style, {
      backgroundImage: DEFAULT_ICON,
      backgroundSize: "25px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    });

    // Apply flex styling in case Autodesk viewer delayed loading
    setTimeout(applyToolbarStyle, 300);
  }
}

// ***************** SHAPE BUTTON *****************

class ShapeButton extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.button = null;
    this.group = null;
    this.toggled = false;
  }

  load() {
    this.createButton();
    return true;
  }

  unload() {
    if (this.group) {
      this.viewer.toolbar.removeControl(this.group);
    }
    return true;
  }

createButton() {
    const TOOLBAR_GROUP_ID = "markupsTools";
    const BUTTON_ID = "ShapeButton";
    const EDIT_LAYER = "markups-svg";
    const TOGGLED_ICON = "url(./images/shapes-toggled.svg)";
    const DEFAULT_ICON = "url(./images/shapes.svg)";

    this.markupsLoaded = false;
    this.toggled = false;

    // Helper: force flex styling on the markup toolbar
    const applyToolbarStyle = () => {
      const group = this.viewer.toolbar.getControl(TOOLBAR_GROUP_ID);
      if (group?.container) {
        group.container.style.display = "flex";
        group.container.style.flexDirection = "column";
        group.container.style.alignItems = "flex-start";
      }
    };

    // Create button
    this.button = new Autodesk.Viewing.UI.Button(BUTTON_ID);
    this.button.setToolTip("Toggle Markup Tool");
    this.button.setIcon("url(./images/faro.svg)");

    this.button.onClick = () => {
      this.toggled = !this.toggled;
      console.log("Toggled:", this.toggled);

      // Update button UI
      this.button.container.classList.toggle("active");
      this.button.container.style.backgroundImage = this.toggled
        ? TOGGLED_ICON
        : DEFAULT_ICON;

      if (this.toggled) {
        // Show Markups extension UI
        if (!window.markupsExt.markups) {
          window.markupsExt.createMarkupSheet();
        }
        window.markupsExt.show();

        const seedUrn = this.viewer.model.getSeedUrn();

        //const seedUrn = this.viewer.model.getSeedUrn();
        let guid = window.viewerInstance.model.getDocumentNode();

        // Find the SVG that matches the current model URN
       const matchingSvg = window.svgData?.find(svg => svg.name === guid.data.guid);

        if (matchingSvg?.content) {
          window.markupsExt.loadMarkups(matchingSvg.content, EDIT_LAYER);
          this.markupsLoaded = true;
          window.markupsExt.enterEditMode(EDIT_LAYER);
        } else {
          window.markupsExt.enterEditMode();
        }

        // Re-apply styling after Autodesk resets DOM
        setTimeout(applyToolbarStyle, 300);

        // Change to freehand tool
        setTimeout(() => {
          try {
            const rectTool =
              new Autodesk.Viewing.Extensions.Markups.Core.EditModeRectangle(
                window.markupsExt
              );
            window.markupsExt.changeEditMode(rectTool);
            Autodesk.Viewing.Extensions.Markups.Core.Utils.showLmvToolsAndPanels(
              window.viewerInstance
            );
          } catch (err) {
            console.error("Failed to change edit mode:", err);
          }
        }, 200);
      } else {
        window.markupsExt.leaveEditMode();
        window.markupsExt.hide();

        // Re-apply toolbar styles when exiting edit mode
        setTimeout(applyToolbarStyle, 300);
      }
    };

    // Create toolbar group if it doesn't exist
    const toolbar = this.viewer.getToolbar();
    this.group = this.viewer.toolbar.getControl(TOOLBAR_GROUP_ID);
    if (!this.group) {
      this.group = new Autodesk.Viewing.UI.ControlGroup(TOOLBAR_GROUP_ID);
      toolbar.addControl(this.group);
      console.log("Added pencil button");
    }
    this.group.addControl(this.button);

    // Initial style setup for toolbar group
    Object.assign(this.group.container.style, {
      position: "absolute",
      right: "10px",
      top: "-50vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      zIndex: "10000",
      pointerEvents: "auto",
    });

    // Button styling
    Object.assign(this.button.container.style, {
      backgroundImage: DEFAULT_ICON,
      backgroundSize: "25px",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "center",
    });

    // Apply flex styling in case Autodesk viewer delayed loading
    setTimeout(applyToolbarStyle, 300);
  }
}





// ***************** save BUTTON *****************

class SaveButton extends Autodesk.Viewing.Extension {
  constructor(viewer, options) {
    super(viewer, options);
    this.button = null;
    this.group = null;
    this.toggled = false;
  }

  load() {
    this.createButton();
    return true;
  }

  unload() {
    if (this.group) {
      this.viewer.toolbar.removeControl(this.group);
    }
    return true;
  }

  createButton() {
    this.button = new Autodesk.Viewing.UI.Button("SaveButton");
    this.button.setToolTip("Save Markup");
    this.group = this.viewer.toolbar.getControl("markupsTools");
    this.group.container.style.display = "flex";
    //1F54156C407D46EC8E55930338091819
    this.button.onClick = async () => {
      this.group = this.viewer.toolbar.getControl("markupsTools");
      this.group.container.style.display = "flex";
      this.toggled = !this.toggled;
      console.log("Saved:", this.toggled);
      let markupData = window.markupsExt.generateData();
      // let urn = window.viewerInstance.model.getSeedUrn();
      let guid = window.viewerInstance.model.getDocumentNode();
      let params = {};
      let queryString = window.location.search.substring(1);
      let queryParts = queryString.split("&");
      for (let i = 0; i < queryParts.length; i++) {
        let param = queryParts[i].split("=");
        params[decodeURIComponent(param[0])] = decodeURIComponent(param[1]);
      }
      let projectid = params["projectid"];
      const response = await fetch(
        "https://304525ba25f2ef1886aa9d4e4cba52.54.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9d8ffc5594bd4d5d959994f7cf1eea33/triggers/manual/paths/invoke/?api-version=1&tenantId=tId&environmentName=304525ba-25f2-ef18-86aa-9d4e4cba5254&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=h19csKA1x0q2oI3GdheN3-BtnouIIIfZW-NB5oyHaSc",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            urn: guid.data.guid,
            data: markupData,
            projectid: projectid,
          }),
        }
      );
      
      console.log(guid.data.guid);
      // console.log(markupData);
    };

    // Use a toolbar group to contain the button
    let toolbar = this.viewer.getToolbar();
    this.group = this.viewer.toolbar.getControl("markupsTools");
    if (!this.group) {
      this.group = new Autodesk.Viewing.UI.ControlGroup("markupsTools");
      toolbar.addControl(this.group);
    }
    this.group.addControl(this.button);

    // Place this group absolutely at the far right and center it vertically
    this.group.container.style.position = "absolute";
    this.group.container.style.right = "10px";
    this.group.container.style.top = "-50vh";
    this.group.container.style.display = "flex";
    this.group.container.style.flexDirection = "column";
    this.group.container.style.alignItems = "flex-start";
    this.group.container.style.zIndex = "10000"; // Make sure it's above markup UI
    this.group.container.style.pointerEvents = "auto"; // Ensure it can receive clicks
    // Style the button
    // toggled color -- #004eeb  #fffafa
    // not toggled color -- #fffafa
    this.button.container.style.backgroundImage = "url(./images/save.svg)";
    this.button.container.style.backgroundSize = "contain";
    this.button.container.style.backgroundRepeat = "no-repeat";
    this.button.container.style.backgroundPosition = "center";
    this.button.container.style.backgroundSize = "25px"; // Adjust size of the background image
  }
}

Autodesk.Viewing.theExtensionManager.registerExtension(
  "PencilButton",
  PencilButton
);
Autodesk.Viewing.theExtensionManager.registerExtension(
  "TextButton",
  TextButton
);
Autodesk.Viewing.theExtensionManager.registerExtension(
  "ShapeButton",
  ShapeButton
);
Autodesk.Viewing.theExtensionManager.registerExtension(
  "SaveButton",
  SaveButton
);

// class FileBarPanel extends Autodesk.Viewing.UI.DockingPanel {
//   constructor(viewer, id, title) {
//     super(viewer.container, id, title);

//     this.viewer = viewer;

//     // Style the panel
//     this.container.style.height = '180px';
//     this.container.style.width = '100%';
//     this.container.style.bottom = '0';
//     this.container.style.left = '0';
//     this.container.style.position = 'absolute';
//     this.container.style.background = 'rgba(33, 33, 33, 0.95)';
//     this.container.style.overflowX = 'auto';
//     this.container.style.overflowY = 'hidden';
//     this.container.style.padding = '10px';
//     this.container.style.display = 'flex';
//     this.container.style.gap = '10px';
//   }

//   setVisible(visible) {
//     this.container.style.display = visible ? 'flex' : 'none';
//   }

//   setFiles(files) {
//     this.container.innerHTML = '';

//     const label = document.createElement('div');
//     label.textContent = `${files.length} Files`;
//     label.style.color = '#fff';
//     label.style.marginRight = '20px';
//     label.style.minWidth = '80px';
//     label.style.alignSelf = 'center';
//     this.container.appendChild(label);

//     for (const file of files) {
//       const thumb = document.createElement('div');
//       thumb.style.width = '120px';
//       thumb.style.height = '120px';
//       thumb.style.background = 'rgba(33, 33, 33, 0.95)';
//       thumb.style.display = 'flex';
//       thumb.style.flexDirection = 'column';
//       thumb.style.alignItems = 'center';
//       thumb.style.justifyContent = 'center';
//       thumb.style.cursor = 'pointer';
//       thumb.style.border = '2px solid transparent';

//       const img = document.createElement('img');
//       img.src = file.thumbnail || 'https://via.placeholder.com/100';
//       img.style.width = '100px';
//       img.style.height = '80px';
//       img.style.objectFit = 'contain';

//       const name = document.createElement('div');
//       name.textContent = file.name;
//       name.style.fontSize = '12px';
//       name.style.textAlign = 'center';
//       name.style.whiteSpace = 'nowrap';
//       name.style.overflow = 'hidden';
//       name.style.textOverflow = 'ellipsis';
//       name.style.width = '100%';

//       thumb.appendChild(img);
//       thumb.appendChild(name);

//       thumb.onclick = () => {
//         alert(`Load model: ${file.name}`);
//         // Optionally: this.viewer.loadModel(file.urn);
//       };

//       this.container.appendChild(thumb);
//     }
//   }
// }

// export function filesButtonToolbar(viewer) {
//   const toolbar = viewer.getToolbar();
//   if (!toolbar) {
//     console.error('Toolbar not found');
//     return;
//   }

//   const showFilesButton = new Autodesk.Viewing.UI.Button('showFilesButton');

//   // Customize icon appearance
//   const btnContainer = showFilesButton.container;
//   btnContainer.style.backgroundImage = 'url(./images/folder-icon.svg)';
//   btnContainer.style.backgroundColor = 'transparent';
//   btnContainer.style.backgroundSize = '22px';
//   btnContainer.style.backgroundRepeat = 'no-repeat';
//   btnContainer.style.backgroundPosition = 'center';

//   showFilesButton.setToolTip('Show Folder Files');

//   showFilesButton.onClick = () => {
//     if (viewer.FileBarPanel) {
//       const visible = viewer.FileBarPanel.container.style.display !== 'none';
//       viewer.FileBarPanel.setVisible(!visible);
//     } else {
//       showFolderFiles(viewer);
//     }
//   };

//   // Add to custom toolbar group
//   let subToolbar = viewer.toolbar.getControl('customToolbarGroup');
//   if (!subToolbar) {
//     subToolbar = new Autodesk.Viewing.UI.ControlGroup('customToolbarGroup');
//     toolbar.addControl(subToolbar);
//   }

//   subToolbar.addControl(showFilesButton);
// }

// function showFolderFiles(viewer) {
//   const panel = new FileBarPanel(viewer, 'fileBarPanel', 'Files');
//   viewer.container.appendChild(panel.container);

//   const files = [
//     { name: 'File A', urn: 'urn:adsk.wipemea:dm.lineage:81XDnDhBRjyjPsSs4p5bUw', thumbnail: 'https://via.placeholder.com/100?text=A' },
//     { name: 'File B', urn: '...', thumbnail: 'https://via.placeholder.com/100?text=B' },
//     { name: 'File C', urn: '...', thumbnail: 'https://via.placeholder.com/100?text=C' },
//   ];

//   panel.setFiles(files);
//   viewer.FileBarPanel = panel;
// }
