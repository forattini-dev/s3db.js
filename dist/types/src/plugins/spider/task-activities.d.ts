export interface Activity {
    name: string;
    label: string;
    description: string;
    category: string;
    enabled: boolean;
}
export interface ActivityCategory {
    name: string;
    label: string;
    description: string;
}
export interface ActivityCategoryWithActivities extends ActivityCategory {
    activities: Activity[];
}
export interface ActivityPreset {
    name: string;
    label: string;
    description: string;
    activities: string[];
}
export interface ValidationResult {
    valid: boolean;
    message?: string;
    invalid: string[];
}
export declare const AVAILABLE_ACTIVITIES: Record<string, Activity>;
export declare const ACTIVITY_CATEGORIES: Record<string, ActivityCategory>;
export declare function getActivitiesByCategory(category: string): Activity[];
export declare function getAllActivities(): Activity[];
export declare function getCategoriesWithActivities(): Record<string, ActivityCategoryWithActivities>;
export declare function validateActivities(activityNames: string[]): ValidationResult;
export declare const ACTIVITY_PRESETS: Record<string, ActivityPreset>;
export declare function getPreset(presetName: string): ActivityPreset | null;
//# sourceMappingURL=task-activities.d.ts.map