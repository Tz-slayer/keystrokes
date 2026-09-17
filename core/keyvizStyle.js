// Canonical non-mouse Keyviz settings. Import/export use Keyviz's native JSON.
const DEFAULTS = {
    monitorName: "", flexDirection: "column", position: "bottom_center", marginX: 100, marginY: 100,
    animationType: "fade", animationDuration: 250, keycapStyle: "lowprofile",
    fontSize: 32, capColor: "#ffffff", secondaryColor: "#1a1a1a", useGradient: true,
    labelColor: "#000000", borderEnabled: true, borderWidth: 2, borderColor: "#1a1a1a", borderRadius: 0.5,
    modifierHighlight: false, modifierColor: "#3a86ff", modifierSecondaryColor: "#000000",
    modifierTextColor: "#000000", modifierBorderColor: "#000000",
    textVariant: "text-short", textCaps: "capitalize", textAlignment: "center",
    showIcon: true, showSymbol: true, showPressCount: true, iconAlignment: "flex-end",
    groupBackground: true, groupBackgroundCustom: "#ffffff99",
    eventFilter: "modifiers", allowedKeys: "Ctrl,Super,Alt", showEventHistory: false,
    maxHistory: 5, fadeTimeout: 5000, toggleShortcut: "Shift,F10"
};
const ALIGNMENTS = ["top-left", "top-center", "top-right", "center-left", "center", "center-right", "bottom-left", "bottom-center", "bottom-right"];
const ENUMS = {
    flexDirection: ["row", "column"], position: ALIGNMENTS.map(v => v.replace(/-/g, "_")),
    animationType: ["none", "fade", "zoom", "float", "slide"], textVariant: ["icon", "text", "text-short"],
    textCaps: ["uppercase", "capitalize", "lowercase"], textAlignment: ALIGNMENTS,
    iconAlignment: ["flex-start", "center", "flex-end"], eventFilter: ["none", "modifiers", "custom"]
};
const LIMITS = {marginX: [0, 200], marginY: [0, 200], animationDuration: [0, 2000], fontSize: [8, 200],
    borderWidth: [0, 20], borderRadius: [0, 2], maxHistory: [1, 50], fadeTimeout: [0, 60000]};
function validColor(value) { return typeof value === "string" && /^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value); }
function validate(key, value) {
    if (ENUMS[key] && !ENUMS[key].includes(value)) throw new Error("Invalid " + key);
    if (LIMITS[key] && (typeof value !== "number" || !isFinite(value) || value < LIMITS[key][0] || value > LIMITS[key][1]))
        throw new Error(key + " must be between " + LIMITS[key].join(" and "));
    if (typeof DEFAULTS[key] === "boolean" && typeof value !== "boolean") throw new Error("Invalid " + key);
    if (typeof DEFAULTS[key] === "string" && typeof value !== "string") throw new Error("Invalid " + key);
    if (/Color$/.test(key) || key === "groupBackgroundCustom") {
        if (!validColor(value)) throw new Error("Invalid CSS hex color for " + key);
    }
    return value;
}
function settings(data) {
    const input = data || {};
    const migrated = Object.assign({}, input);
    if (input.marginSize !== undefined) {
        if (input.marginX === undefined) migrated.marginX = input.marginSize;
        if (input.marginY === undefined) migrated.marginY = input.marginSize;
    }
    if (input.eventFilter === undefined && input.showNormalKeys === true) migrated.eventFilter = "none";
    if (input.showEventHistory === undefined && input.historyLimit > 1) migrated.showEventHistory = true;
    if (input.maxHistory === undefined && input.historyLimit > 1) migrated.maxHistory = input.historyLimit;
    const result = Object.assign({}, DEFAULTS);
    Object.keys(DEFAULTS).forEach(key => {
        if (migrated[key] !== undefined) {
            try { result[key] = validate(key, migrated[key]); } catch (_) { /* invalid persisted values use safe defaults */ }
        }
    });
    return result;
}
const FIELDS = {
    appearance: {monitor: "monitorName", flexDirection: "flexDirection", alignment: "position", marginX: "marginX", marginY: "marginY", animation: "animationType", animationDuration: "animationDuration", style: "keycapStyle"},
    layout: {showIcon: "showIcon", showSymbol: "showSymbol", showPressCount: "showPressCount", iconAlignment: "iconAlignment"},
    color: {color: "capColor", secondaryColor: "secondaryColor", useGradient: "useGradient"},
    modifier: {highlight: "modifierHighlight", color: "modifierColor", secondaryColor: "modifierSecondaryColor", textColor: "modifierTextColor", borderColor: "modifierBorderColor"},
    text: {size: "fontSize", color: "labelColor", caps: "textCaps", variant: "textVariant", alignment: "textAlignment"},
    border: {enabled: "borderEnabled", width: "borderWidth", color: "borderColor", radius: "borderRadius"},
    background: {enabled: "groupBackground", color: "groupBackgroundCustom"}
};
function importStyle(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a Keyviz style object");
    const output = {};
    Object.keys(FIELDS).forEach(section => {
        if (!value[section] || typeof value[section] !== "object") throw new Error("Missing section: " + section);
        Object.keys(FIELDS[section]).forEach(field => {
            let v = value[section][field];
            const key = FIELDS[section][field];
            if (v === undefined) throw new Error("Missing " + section + "." + field);
            if (key === "position" && typeof v === "string") v = v.replace(/-/g, "_");
            if (key === "animationDuration") v *= 1000;
            if (key === "monitorName" && v === null) v = "";
            if (key === "keycapStyle" && !["minimal", "laptop", "lowprofile", "pbt"].includes(v)) throw new Error("Unknown keycap style");
            output[key] = validate(key, v);
        });
    });
    if (value.mouse && typeof value.mouse === "object" && !Array.isArray(value.mouse)) output.keyvizMouseStyle = value.mouse;
    return output;
}
function exportStyle(data) {
    const resolved = settings(data);
    const output = {};
    Object.keys(FIELDS).forEach(section => {
        output[section] = {};
        Object.keys(FIELDS[section]).forEach(field => {
            const key = FIELDS[section][field];
            let v = resolved[key];
            if (key === "position") v = v.replace(/_/g, "-");
            if (key === "animationDuration") v /= 1000;
            if (key === "monitorName" && !v) v = null;
            if (key === "keycapStyle") v = ({mechanical: "pbt", elevated: "lowprofile"})[v] || v;
            output[section][field] = v;
        });
    });
    // Upstream requires mouse on import. Preserve supplied mouse values without
    // applying them to this plugin, or include upstream defaults for portability.
    output.mouse = data && data.keyvizMouseStyle || {showClicks: false, size: 150, color: "#009dff", keepHighlight: true,
        showIndicator: true, indicatorSize: 50, indicatorOffsetX: 50, indicatorOffsetY: 50};
    return output;
}

// Color presets from Keyviz settings/keycap.tsx.
const COLOR_SCHEMES = [] = [
    {
        name: "Silver",
        primary: "#f8f8f8",
        secondary: "#dcdcdc",
        text: "#000000",
    },
    {
        name: "Stone",
        primary: "#606060",
        secondary: "#4b4b4b",
        text: "#f8f8f8",
    },
    {
        name: "Lime",
        primary: "#606060",
        secondary: "#4b4b4b",
        text: "#D6ED17",
    },
    {
        name: "Cyber",
        primary: "#00B1D2",
        secondary: "#008ea8",
        text: "#FDDB27",
    },
    {
        name: "Turquoise",
        primary: "#42EADD",
        secondary: "#2ec4b8",
        text: "#ffffff",
    },
    {
        name: "Blue",
        primary: "#2196f3",
        secondary: "#1976d2",
        text: "#ffffff",
    },
    {
        name: "Yellow",
        primary: "#FDDB27",
        secondary: "#dfc019",
        text: "#000000",
    },
    {
        name: "Green",
        primary: "#66bb6a",
        secondary: "#43a047",
        text: "#ffffff",
    },
    {
        name: "Pink",
        primary: "#f06292",
        secondary: "#d81b60",
        text: "#ffffff",
    },
    {
        name: "Red",
        primary: "#ef5350",
        secondary: "#c62828",
        text: "#ffffff",
    },
    {
        name: "Pansy",
        primary: "#673ab7",
        secondary: "#4527a0",
        text: "#ffc107",
    },
    {
        name: "Eclipse",
        primary: "#343148",
        secondary: "#252333",
        text: "#D7C49E",
    },
    {
        name: "Bumblebee",
        primary: "#404040",
        secondary: "#2e2e2e",
        text: "#FDDB27",
    },
    {
        name: "Charcoal",
        primary: "#404040",
        secondary: "#2e2e2e",
        text: "#FFFFFF",
    },
];

function palette(index) {
    const scheme = COLOR_SCHEMES[index];
    if (!scheme) throw new Error("Unknown palette");
    return {capColor: scheme.primary, secondaryColor: scheme.secondary, borderColor: scheme.secondary, labelColor: scheme.text};
}
function randomStyle(data, random) {
    const rand = random || Math.random;
    const config = settings(data);
    const chosen = palette(Math.floor(rand() * COLOR_SCHEMES.length));
    const values = Object.assign({}, chosen, {showIcon: rand() > 0.5, showSymbol: rand() > 0.5,
        useGradient: rand() > 0.5, borderRadius: rand()});
    if (config.modifierHighlight) {
        const mod = palette(Math.floor(rand() * COLOR_SCHEMES.length));
        return Object.assign({}, values, {modifierColor: mod.capColor, modifierSecondaryColor: mod.secondaryColor,
            modifierBorderColor: mod.borderColor, modifierTextColor: mod.labelColor});
    }
    return config.groupBackground ? Object.assign({}, values, {groupBackgroundCustom: chosen.labelColor}) : values;
}
