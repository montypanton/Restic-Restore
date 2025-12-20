import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import { check } from "@tauri-apps/plugin-updater";
import { ask } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Check for updates after the app has loaded
async function checkForUpdates() {
  try {
    const update = await check();

    if (update?.available) {
      const yes = await ask(
        `Update to version ${update.version} is available!\n\nRelease notes: ${update.body}\n\nWould you like to download and install it now?`,
        {
          title: "Update Available",
          kind: "info",
        }
      );

      if (yes) {
        console.log("Downloading update...");
        await update.downloadAndInstall();
        
        const shouldRelaunch = await ask(
          "Update installed successfully! The app needs to restart to apply the update.",
          {
            title: "Restart Required",
            kind: "info",
          }
        );

        if (shouldRelaunch) {
          await relaunch();
        }
      }
    } else {
      console.log("App is up to date");
    }
  } catch (error) {
    console.error("Failed to check for updates:", error);
  }
}

// Run update check on startup
checkForUpdates();
