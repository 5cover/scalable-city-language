import { fitFiguresToNetwork } from '../fitter/fitter.js';
import type { BuildResult, BuildSettings } from './types.js';

export const buildNetwork = (settings: BuildSettings): BuildResult => {
    return fitFiguresToNetwork(settings.figures);
};
