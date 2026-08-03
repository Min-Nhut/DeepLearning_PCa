import type { Nav, Role } from '../types';

export type NavItem = [key: Nav, label: string, icon: string];

export function navFor(role: Role): NavItem[] {
  return role === 'doctor'
    ? [
        ['dashboard', 'Tổng quan', 'layout-dashboard'],
        ['cases', 'Ca bệnh', 'folder-open'],
        ['upload', 'Tải ảnh & Chụp', 'upload'],
      ]
    : [
        ['adashboard', 'Tổng quan hệ thống', 'layout-dashboard'],
        ['alog', 'Lịch sử & Log', 'scroll-text'],
        ['models', 'Model AI', 'brain-circuit'],
        ['users', 'Người dùng', 'users'],
        ['migration', 'Di trú dữ liệu', 'database-zap'],
        ['library', 'Xuất thư viện', 'folder-down'],
      ];
}

// Screens reached by drilling into a case/upload flow highlight their parent
// sidebar entry instead of showing no active item.
export const SIDE_MAP: Partial<Record<Nav, Nav>> = {
  caseDetail: 'cases', caseForm: 'cases', viewer: 'cases', report: 'cases', pipeline: 'upload',
  annotate: 'cases',
};

const TITLES: Record<Nav, [string, string]> = {
  dashboard: ['Tổng quan', 'Diagnostic Dashboard'],
  cases: ['Danh sách công việc', 'Ca bệnh'],
  caseDetail: ['Ca bệnh', 'Chi tiết ca'],
  caseForm: ['Ca bệnh', 'Thêm / Sửa ca'],
  upload: ['Phân tích mới', 'Tải ảnh & Chụp'],
  pipeline: ['Đang xử lý', 'Pipeline AI'],
  viewer: ['Ca bệnh', 'Trình xem tiêu bản'],
  report: ['Ca bệnh', 'Phiếu kết quả'],
  annotate: ['Ca bệnh', 'Đánh dấu thủ công'],
  adashboard: ['Quản trị', 'Tổng quan hệ thống'],
  alog: ['Quản trị', 'Lịch sử & Log'],
  models: ['Quản trị', 'Model AI'],
  users: ['Quản trị', 'Quản lý người dùng'],
  migration: ['Quản trị', 'Di trú dữ liệu'],
  library: ['Quản trị', 'Xuất thư viện'],
};

export function titleFor(nav: Nav): [string, string] {
  return TITLES[nav] || ['', ''];
}
