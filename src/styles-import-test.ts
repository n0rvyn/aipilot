import { App, Plugin } from "obsidian";

// Test file to ensure CSS imports work correctly
// We now import CSS through manifest.json instead of direct imports

// This would have been the old problematic approach:
// import './styles.css';

// The correct approach is to let esbuild handle CSS through the plugin in esbuild.config.mjs
export default class TestPlugin extends Plugin {
    async onload() {
        console.log("Test plugin loaded correctly without CSS import");
    }
} 