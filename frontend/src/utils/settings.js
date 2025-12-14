import yaml from 'js-yaml';

let cachedSettings = null;

export const loadSettings = async () => {
  if (cachedSettings) return cachedSettings;
  
  try {
    const response = await fetch('/settings.yaml');
    const yamlText = await response.text();
    cachedSettings = yaml.load(yamlText);
    return cachedSettings;
  } catch (error) {
    console.error('Failed to load settings.yaml, using defaults:', error);
    return getDefaultSettings();
  }
};

export const getDefaultSettings = () => ({
  display: {
    default_display_nodes: 20,
    font_size: "14px",
    date_format: "dd/MM/yyyy"
  },
  tree: {
    node_radius: 20,
    vertical_spacing: 100,
    horizontal_spacing: 150,
    zoom_enabled: true,
    pan_enabled: true,
    initial_depth: 3,
    collapse_depth: 2
  },
  game: {
    default_rounds: 10,
    default_bet: 0
  },
  search: {
    debounce_ms: 300,
    min_chars: 0
  },
  colors: {
    node_default: "#00ff00",
    node_selected: "#ffff00",
    node_hover: "#00ffff",
    edge_color: "#00ff00",
    background: "#0a0e27",
    text: "#00ff00"
  }
});

export const getSetting = (path, defaultValue = null) => {
  if (!cachedSettings) return defaultValue;
  
  const keys = path.split('.');
  let value = cachedSettings;
  
  for (const key of keys) {
    if (value && typeof value === 'object' && key in value) {
      value = value[key];
    } else {
      return defaultValue;
    }
  }
  
  return value;
};
