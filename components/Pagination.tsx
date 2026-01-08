import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button';

interface PaginationProps {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ page, total, pageSize, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const go = (next: number) => {
    const safe = Math.max(1, Math.min(totalPages, next));
    onPageChange(safe);
  };

  return (
    <div className="flex items-center justify-between py-3 border-t border-white/40">
      <div className="text-xs text-gray-500">共 {total} 条记录</div>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => go(page - 1)} disabled={page <= 1} icon={<ChevronLeft size={16} />}>
          上一页
        </Button>
        <span className="text-xs text-gray-500">
          第 {page} / {totalPages} 页
        </span>
        <Button variant="secondary" size="sm" onClick={() => go(page + 1)} disabled={page >= totalPages} icon={<ChevronRight size={16} />}>
          下一页
        </Button>
      </div>
    </div>
  );
};
