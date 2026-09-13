export const KeyResultTypes = ['number', 'percent', 'currency', 'boolean', 'milestone'] as const;
export type KeyResultType = (typeof KeyResultTypes)[number];

export const Confidence = ['on_track', 'at_risk', 'off_track'] as const;
export type Confidence = (typeof Confidence)[number];

export const ObjectiveLevels = ['company', 'unit', 'team', 'individual'] as const;
export type ObjectiveLevel = (typeof ObjectiveLevels)[number];

export const ObjectiveStatus = ['draft', 'pending_approval', 'active', 'closed', 'cancelled'] as const;
export type ObjectiveStatus = (typeof ObjectiveStatus)[number];

export const Visibility = ['public', 'team', 'private'] as const;
export type Visibility = (typeof Visibility)[number];

export const ProgressMode = ['auto', 'manual'] as const;
export type ProgressMode = (typeof ProgressMode)[number];
