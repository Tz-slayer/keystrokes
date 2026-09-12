// Key icon + display data ported 1:1 from mulaRahul/keyviz
// (src/lib/keymaps.ts, linux platform) and (src/components/ui/icons.tsx).
// Lucide icons pinned to v0.562.0 (keyviz's lucide-react version):
// viewBox 0 0 24 24, stroke 2, round caps/joins, no fill.
const ICONS = {
    "arrow-big-up": ["M9 13a1 1 0 0 0-1-1H5.061a1 1 0 0 1-.75-1.811l6.836-6.835a1.207 1.207 0 0 1 1.707 0l6.835 6.835a1 1 0 0 1-.75 1.811H16a1 1 0 0 0-1 1v6a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z"],
    "arrow-big-up-dash": ["M9 13a1 1 0 0 0-1-1H5.061a1 1 0 0 1-.75-1.811l6.836-6.835a1.207 1.207 0 0 1 1.707 0l6.835 6.835a1 1 0 0 1-.75 1.811H16a1 1 0 0 0-1 1v2a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1z", "M9 20h6"],
    "arrow-down": ["M12 5v14", "m19 12-7 7-7-7"],
    "arrow-down-to-line": ["M12 17V3", "m6 11 6 6 6-6", "M19 21H5"],
    "arrow-left": ["m12 19-7-7 7-7", "M19 12H5"],
    "arrow-left-right": ["M8 3 4 7l4 4", "M4 7h16", "m16 21 4-4-4-4", "M20 17H4"],
    "arrow-right": ["M5 12h14", "m12 5 7 7-7 7"],
    "arrow-right-to-line": ["M17 12H3", "m11 18 6-6-6-6", "M21 5v14"],
    "arrow-up": ["m5 12 7-7 7 7", "M12 19V5"],
    "arrow-up-to-line": ["M5 3h14", "m18 13-6-6-6 6", "M12 7v14"],
    "chevron-up": ["m18 15-6-6-6 6"],
    "circle-arrow-out-up-left": ["M2 8V2h6", "m2 2 10 10", "M12 2A10 10 0 1 1 2 12"],
    "command": ["M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"],
    "delete": ["M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z", "m12 9 6 6", "m18 9-6 6"],
    "grid-2x2": ["M12 3v18", "M3 12h18", "M5.0,3.0h14.0a2.0,2.0 0 0 1 2.0,2.0v14.0a2.0,2.0 0 0 1 -2.0,2.0h-14.0a2.0,2.0 0 0 1 -2.0,-2.0v-14.0a2.0,2.0 0 0 1 2.0,-2.0Z"],
    "image": ["m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21", "M7.0 9.0a2.0 2.0 0 1 0 4.0 0a2.0 2.0 0 1 0 -4.0 0", "M5.0,3.0h14.0a2.0,2.0 0 0 1 2.0,2.0v14.0a2.0,2.0 0 0 1 -2.0,2.0h-14.0a2.0,2.0 0 0 1 -2.0,-2.0v-14.0a2.0,2.0 0 0 1 2.0,-2.0Z"],
    "lock": ["M7 11V7a5 5 0 0 1 10 0v4", "M5.0,11.0h14.0a2.0,2.0 0 0 1 2.0,2.0v7.0a2.0,2.0 0 0 1 -2.0,2.0h-14.0a2.0,2.0 0 0 1 -2.0,-2.0v-7.0a2.0,2.0 0 0 1 2.0,-2.0Z"],
    "mouse": ["M12 6v4", "M12.0,2.0h0.0a7.0,7.0 0 0 1 7.0,7.0v6.0a7.0,7.0 0 0 1 -7.0,7.0h-0.0a7.0,7.0 0 0 1 -7.0,-7.0v-6.0a7.0,7.0 0 0 1 7.0,-7.0Z"],
    "mouse-left-click": ["M5 11L5 15C5 18.866 8.13401 22 12 22C15.866 22 19 18.866 19 15V9C19 5.13401 15.866 2 12 2C10.9264 2 9.90926 2.24169 9 2.67363", "M12 6V10", "M3 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
    "mouse-middle-click": ["M19 9C19 5.13401 15.866 2 12 2C8.13401 2 5 5.13401 5 9V15C5 18.866 8.13401 22 12 22C15.866 22 19 18.866 19 15V9Z", "M10 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
    "mouse-right-click": ["M19 11V15C19 18.866 15.866 22 12 22C8.13401 22 5 18.866 5 15V9C5 5.13401 8.13401 2 12 2C13.0736 2 14.0907 2.24169 15 2.67363", "M12 6V10", "M17 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"],
    "mouse-right-drag": ["M5.1851 18.9941C9.48005 21.4312 12.2743 19.1116 14.3687 15.5464C16.463 11.9811 17.1098 8.44303 12.8149 6.00594C8.51993 3.56885 5.72575 5.8884 3.63136 9.45367C1.53697 13.0189 0.890156 16.557 5.1851 18.9941Z", "M12 8L12.7192 6.70551C13.6233 5.07824 14.0753 4.26461 14.8427 4.05095C15.61 3.83729 16.393 4.30704 17.9589 5.24654L20.0351 6.49216C20.7231 6.90492 21.6028 6.65997 22 5.94505", "M12.25 10.299C12.483 9.89552 12.5995 9.69376 12.6254 9.49655C12.66 9.2336 12.5888 8.96767 12.4273 8.75726C12.3062 8.59946 12.1045 8.48297 11.701 8.25C11.2974 8.01703 11.0957 7.90054 10.8985 7.87458C10.6355 7.83996 10.3696 7.91122 10.1592 8.07267C10.0014 8.19376 9.88489 8.39552 9.65192 8.79904L9.15192 9.66506C8.91895 10.0686 8.80247 10.2703 8.7765 10.4675C8.74189 10.7305 8.81314 10.9964 8.9746 11.2068C9.09569 11.3646 9.29744 11.4811 9.70096 11.7141C10.1045 11.9471 10.3062 12.0636 10.5034 12.0895C10.7664 12.1241 11.0323 12.0529 11.2427 11.8914C11.4005 11.7703 11.517 11.5686 11.75 11.1651L12.25 10.299Z"],
    "mouse-scroll-down": ["M19 9C19 5.13401 15.866 2 12 2C8.13401 2 5 5.13401 5 9V15C5 18.866 8.13401 22 12 22C15.866 22 19 18.866 19 15V9Z", "M12 7V12", "M10 10L12 12L14 10"],
    "mouse-scroll-up": ["M19 9C19 5.13401 15.866 2 12 2C8.13401 2 5 5.13401 5 9V15C5 18.866 8.13401 22 12 22C15.866 22 19 18.866 19 15V9Z", "M12 7V12", "M14 8L12 6L10 8"],
    "move-down-right": ["M19 13V19H13", "M5 5L19 19"],
    "move-up-left": ["M5 11V5H11", "M5 5L19 19"],
    "option": ["M3 3h6l6 18h6", "M14 3h7"],
    "pause": ["M15.0,3.0h3.0a1.0,1.0 0 0 1 1.0,1.0v16.0a1.0,1.0 0 0 1 -1.0,1.0h-3.0a1.0,1.0 0 0 1 -1.0,-1.0v-16.0a1.0,1.0 0 0 1 1.0,-1.0Z", "M6.0,3.0h3.0a1.0,1.0 0 0 1 1.0,1.0v16.0a1.0,1.0 0 0 1 -1.0,1.0h-3.0a1.0,1.0 0 0 1 -1.0,-1.0v-16.0a1.0,1.0 0 0 1 1.0,-1.0Z"],
    "return": ["M11 6H15.5C17.9853 6 20 8.01472 20 10.5C20 12.9853 17.9853 15 15.5 15H4", "M6.99998 12C6.99998 12 4.00001 14.2095 4 15C3.99999 15.7906 7 18 7 18"],
    "space": ["M22 17v1c0 .5-.5 1-1 1H3c-.5 0-1-.5-1-1v-1"],
    "sparkle": ["M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"],
    "volume-2": ["M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z", "M16 9a5 5 0 0 1 0 6", "M19.364 18.364a9 9 0 0 0 0-12.728"],
    "volume-x": ["M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"],
};

const DISPLAY = {
    "'": { label: "'", category: "punctuation" },
    ",": { label: ",", category: "punctuation" },
    "-": { label: "-", category: "punctuation" },
    ".": { label: ".", category: "punctuation" },
    "/": { label: "?", category: "punctuation" },
    ";": { label: ";", category: "punctuation" },
    "=": { label: "=", category: "punctuation" },
    "Alt": { label: "alt", shortLabel: "alt", glyph: "⌥", icon: "option", category: "modifier" },
    "Backspace": { label: "backspace", shortLabel: "back", glyph: "⌫", icon: "delete", category: "special" },
    "Caps Lock": { label: "caps lock", glyph: "⇪", icon: "arrow-big-up-dash" },
    "Ctrl": { label: "control", shortLabel: "ctrl", glyph: "⌃", icon: "chevron-up", category: "modifier" },
    "Del": { label: "delete", shortLabel: "del", glyph: "⌦", icon: "delete", category: "special" },
    "End": { label: "end", glyph: "⇲", icon: "move-down-right", category: "navigation" },
    "Enter": { label: "enter", glyph: "↩", icon: "return", category: "special" },
    "Esc": { label: "escape", shortLabel: "esc", glyph: "⎋", icon: "circle-arrow-out-up-left", category: "special" },
    "Home": { label: "home", glyph: "⇱", icon: "move-up-left", category: "navigation" },
    "Ins": { label: "insert", shortLabel: "ins", glyph: "⇥", icon: "arrow-right-to-line", category: "special" },
    "LMB Click": { label: "left click", shortLabel: "left", icon: "mouse-left-click", category: "mouse" },
    "MMB Click": { label: "middle click", shortLabel: "middle", icon: "mouse-middle-click", category: "mouse" },
    "Mouse Click": { label: "click", shortLabel: "click", icon: "mouse", category: "mouse" },
    "PgDown": { label: "page down", shortLabel: "pg dn", glyph: "⤓", icon: "arrow-down-to-line", category: "navigation" },
    "PgUp": { label: "page up", shortLabel: "pg up", glyph: "⤒", icon: "arrow-up-to-line", category: "navigation" },
    "RMB Click": { label: "right click", shortLabel: "right", icon: "mouse-right-click", category: "mouse" },
    "Shift": { label: "shift", shortLabel: "shift", glyph: "⇧", icon: "arrow-big-up", category: "modifier" },
    "Space": { label: "space", glyph: "⎵", icon: "space" },
    "Super": { label: "Meta", shortLabel: "meta", glyph: "✦", icon: "sparkle", category: "modifier" },
    "Tab": { label: "tab", glyph: "⇆", icon: "arrow-left-right", category: "special" },
    "[": { label: "[", category: "punctuation" },
    "\\": { label: "\\", category: "punctuation" },
    "]": { label: "]", category: "punctuation" },
    "`": { label: "`", category: "punctuation" },
    "←": { label: "left", glyph: "←", icon: "arrow-left", category: "arrow" },
    "↑": { label: "up", glyph: "↑", icon: "arrow-up", category: "arrow" },
    "→": { label: "right", glyph: "→", icon: "arrow-right", category: "arrow" },
    "↓": { label: "down", glyph: "↓", icon: "arrow-down", category: "arrow" },
}

// Display data for a key label produced by the daemon.
// Single characters (letters/digits) fall back to a plain entry, like
// keyviz letter/digit categories.
function display(label) {
    if (DISPLAY[label] !== undefined)
        return DISPLAY[label];
    if (typeof label === "string" && label.length === 1 && /[a-zA-Z0-9]/.test(label))
        return { label: label, category: "letter" };
    return { label: String(label) };
}

function iconPaths(name) {
    return ICONS[name] || [];
}
