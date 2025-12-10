/**
 * Admin Dashboard Page
 */
import type { HtmlEscapedString } from 'hono/utils/html';
import { type ThemeConfig, type BaseLayoutUser } from '../../layouts/base.js';
export interface RecentUser {
    email: string;
    name: string;
    status: string;
    createdAt: string;
}
export interface DashboardStats {
    totalUsers?: number;
    activeUsers?: number;
    pendingUsers?: number;
    totalClients?: number;
    activeClients?: number;
    activeSessions?: number;
    uniqueUsers?: number;
    totalAuthCodes?: number;
    unusedAuthCodes?: number;
    serverUptime?: string;
    recentUsers?: RecentUser[];
}
export interface StatCard {
    title: string;
    value: string;
    description: string;
    gradient: string;
}
export interface QuickLink {
    href: string;
    label: string;
}
export interface AdminDashboardPageProps {
    stats?: DashboardStats;
    user?: BaseLayoutUser;
    config?: ThemeConfig;
}
export declare function AdminDashboardPage(props?: AdminDashboardPageProps): HtmlEscapedString;
export default AdminDashboardPage;
//# sourceMappingURL=dashboard.d.ts.map