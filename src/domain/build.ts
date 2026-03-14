import type { BuildResult, BuildSettings } from './types.js';

const buildNetwork = (settings: BuildSettings): BuildResult => {
  return {
    center: undefined,
    nodes: [],
    segments: [],
    shapes: settings.shapes
  };
};

export { buildNetwork };
