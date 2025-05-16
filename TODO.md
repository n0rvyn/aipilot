# AIPilot Plugin - TODOs and Improvements

## Code Organization
1. Split main.ts (2000+ lines) into multiple files based on functionality
2. Move modal classes to a separate file or folder
3. Create a dedicated folder for UI components like modals

## TypeScript Errors
1. Fix missing properties on modal classes (Obsidian API-related errors)
2. Add proper type definitions for Obsidian's Modal class implementation

## Dependency Management
1. Ensure 'obsidian' module is properly listed in package.json as a dependency

## Modularization
1. Extract embedding functions into a dedicated embedding service
2. Move modals into their own files
3. Move utility functions (encrypt/decrypt) to a utilities file

## Error Handling
1. Add more robust error handling for API calls and file operations
2. Consider adding fallback options when operations fail

## Security Improvements
1. Implement a more robust encryption method for API keys

## Performance Considerations
1. Implement LRU (least recently used) cache eviction for embedding cache

## Documentation
1. Add JSDoc comments to document class methods and properties

## UI/UX Improvements
1. Add loading indicators for long-running operations
2. Add keyboard shortcuts for common operations

## Code Duplication
1. Create a base modal class for common modal functionality

## Testing
1. Add unit tests for critical functionality, especially encryption/decryption methods

## Icon Issues
1. Investigate why the 'Polish' function icon appears different from other function icons in the AI chat view
2. Verify that all icons are consistently applied across the interface 