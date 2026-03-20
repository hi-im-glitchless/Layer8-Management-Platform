import { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';

type FeatureFlag =
  | 'FEATURE_TEMPLATE_ADAPTER'
  | 'FEATURE_EXECUTIVE_REPORT'
  | 'FEATURE_DOCUMENT_PROCESSING';

export function requireFeature(feature: FeatureFlag) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!config[feature]) {
      return res.status(404).json({ error: 'Feature not available' });
    }
    next();
  };
}
