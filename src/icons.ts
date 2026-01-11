import { addIcon } from 'obsidian';

// Debate icon for ribbon and tab
export const addDebateIcon = (): void => {
  addIcon('brain-cog', `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z"/>
      <path d="M17 4a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2"/>
      <path d="M19 11h2m-1 -1v2"/>
      <path d="M15 16.5v.5a2 2 0 0 0 2 2"/>
      <path d="M8.5 14l-.386 -.51a1 1 0 0 0 -1.628 .476l-.748 2.238a1 1 0 0 0 .606 1.283l.279 .093a1 1 0 0 0 1.283 -.606l.558 -1.674a1 1 0 0 0 -.606 -1.283l-.121 -.04a1 1 0 0 0 -.221 -.025z"/>
      <path d="M14.5 17c0 .828 -.672 1.5 -1.5 1.5s-1.5 -.672 -1.5 -1.5s.672 -1.5 1.5 -1.5"/>
    </svg>
  `);
};

// Model icon for settings
export const addModelIcon = (): void => {
  addIcon('ai-model', `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 2c1.109 0 2.01 .9 2.01 2s-.901 2 -2.01 2c-1.109 0 -2.01 -.9 -2.01 -2s.901 -2 2.01 -2z"/>
      <path d="M12 8c4.097 0 7.61 2.462 9 6h-18c1.39 -3.538 4.903 -6 9 -6z"/>
      <path d="M5.5 15l-1.5 6l3 -4l3 4l-1.5 -6"/>
      <path d="M14.5 15l-1.5 6l3 -4l3 4l-1.5 -6"/>
    </svg>
  `);
};

// Debate roles icons
export const addRoleIcons = (): void => {
  // Positive/Proponent icon
  addIcon('debate-positive', `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>
      <path d="M9 12l2 2l4 -4"/>
    </svg>
  `);
  
  // Negative/Opponent icon
  addIcon('debate-negative', `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>
      <path d="M9 12l6 0"/>
    </svg>
  `);
  
  // Host/Moderator icon
  addIcon('debate-host', `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 9l2 3l-2 3"/>
      <path d="M14 9l-2 3l2 3"/>
      <path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/>
    </svg>
  `);
};

export const addAllIcons = (): void => {
  addDebateIcon();
  addModelIcon();
  addRoleIcons();
}; 